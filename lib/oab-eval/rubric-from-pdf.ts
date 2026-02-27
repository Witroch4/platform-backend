//lib/oab-eval/rubric-from-pdf.ts
import { Buffer } from "node:buffer";
import * as fs from "node:fs";
import * as path from "node:path";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import pdfParse from "pdf-parse";
import { generateText } from "ai";
import { google } from "@ai-sdk/google";
import { type RubricPayload } from "./types";
import { jsonrepair } from "jsonrepair";
import { uploadToMinIOWithRetry } from "@/lib/minio";
import { createModel, buildProviderOptions } from "@/lib/socialwise-flow/services/ai-provider-factory";
import { type AiProviderType, detectProviderFromModel } from "@/lib/socialwise-flow/processor-components/assistant-config";
import { withRetry, cleanPromptForOpenAI, OPENAI_FALLBACK_MODEL } from "./ai-retry-fallback";

const execPromise = promisify(exec);

interface BuildRubricOptions {
    fileName?: string;
    model?: string;
    forceAI?: boolean;
}

const DEFAULT_RUBRIC_MODEL = process.env.OAB_EVAL_RUBRIC_MODEL ?? "gpt-4.1";

export async function extractTextFromPdf(buffer: Buffer): Promise<string> {
    const result = await pdfParse(buffer, { pagerender: undefined });
    return result.text
        .replace(/\r\n/g, "\n")
        .replace(/\u0000/g, "")
        .replace(/\t+/g, " ")
        .replace(/[ \t]+\n/g, "\n");
}

// ── Helpers ──────────────────────────────────────────────────────────────

function convertDate(date: string | undefined) {
    if (!date) return undefined;
    const m = date.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    if (!m) return date;
    return `${m[3]}-${m[2]}-${m[1]}`;
}

function extractMeta(rawText: string) {
    const exam = rawText.match(/\d+º Exame de Ordem Unificado/i)?.[0]?.trim() ?? "Exame OAB";
    const area = rawText.match(/ÁREA:\s*([^\n]+)/i)?.[1]?.trim() ?? "Área não identificada";
    const dataBruta = rawText.match(/Aplicada em\s*([^\n]+)/i)?.[1]?.trim();
    return { exam, area, data_aplicacao: convertDate(dataBruta), fonte: "Padrão de Resposta da FGV" };
}

/** Extracts max score from a range like "0,00/0,40/0,50" → 0.50 */
function parseScoreRange(rangeStr: string): number {
    const scores: number[] = [];
    const rx = /(\d{1,2})[,.](\d{2})/g;
    let m: RegExpExecArray | null;
    while ((m = rx.exec(rangeStr)) !== null) {
        const n = Number(`${m[1]}.${m[2]}`);
        if (!Number.isNaN(n)) scores.push(n);
    }
    return scores.length ? Math.max(...scores) : 0;
}

/** Joins multi-line text that was broken by PDF extraction */
function joinLines(lines: string[]): string {
    return lines
        .join(" ")
        .replace(/\s+/g, " ")
        .replace(/-\s+/g, "") // rejoin hyphenated words
        .trim();
}

/** Clean description - remove score range trailing (e.g. "0,00/0,10") but keep inline (0,xx) */
function cleanDescTrailingRange(desc: string): string {
    return desc.replace(/\s+0[,.]00(?:\s*\/\s*\d{1,2}[,.]\d{2})+\s*$/, "").trim();
}

// ── Simple Deterministic Parser ──────────────────────────────────────────

type ParsedQuesito = {
    questao: "PEÇA" | "Q1" | "Q2" | "Q3" | "Q4";
    rotulo: string;
    indice: number;
    descricao: string;
    descricao_bruta: string;
    nota_maxima: number;
    faixa_pontuacao: number[];
};

function parseSimpleDeterministic(rawText: string): ParsedQuesito[] | null {
    const quesitos: ParsedQuesito[] = [];

    // Normalize text
    const text = rawText
        .replace(/\u00a0/g, " ")
        .replace(/-\n/g, "")        // rejoin hyphenated line breaks
        .replace(/(\d)[,.][\s\n]*(\d{2})/g, "$1,$2"); // fix broken decimals

    // Split into sections: PEÇA and Q1-Q4
    const RX_PECA = /PADR[ÃA]O DE RESPOSTA\s*[–-]\s*PE[ÇC]A/i;
    const RX_Q = /PADR[ÃA]O DE RESPOSTA\s*[–-]\s*QUEST[ÃA]O\s*(0?[1-4])/gi;
    const RX_DISTR = /Distribui[çc][aã]o dos Pontos/i;

    type Section = { tipo: "PEÇA" | "Q1" | "Q2" | "Q3" | "Q4"; body: string };
    const sections: Section[] = [];

    // Find PEÇA section
    const pecaMatch = RX_PECA.exec(text);
    if (pecaMatch) {
        const from = pecaMatch.index;
        // Find next section start
        const restAfterPeca = text.slice(from + 1);
        const nextQ = /PADR[ÃA]O DE RESPOSTA\s*[–-]\s*QUEST[ÃA]O/i.exec(restAfterPeca);
        const end = nextQ ? from + 1 + nextQ.index : text.length;
        const block = text.slice(from, end);
        const distrIdx = block.search(RX_DISTR);
        if (distrIdx >= 0) {
            sections.push({ tipo: "PEÇA", body: block.slice(distrIdx) });
        }
    }

    // Find Q1-Q4 sections
    const qPositions: Array<{ tipo: "Q1" | "Q2" | "Q3" | "Q4"; index: number }> = [];
    let qMatch: RegExpExecArray | null;
    const rxQ = new RegExp(RX_Q.source, "gi");
    while ((qMatch = rxQ.exec(text)) !== null) {
        const tipo = `Q${Number(qMatch[1])}` as "Q1" | "Q2" | "Q3" | "Q4";
        qPositions.push({ tipo, index: qMatch.index });
    }
    for (let i = 0; i < qPositions.length; i++) {
        const { tipo, index } = qPositions[i];
        const end = qPositions[i + 1] ? qPositions[i + 1].index : text.length;
        const block = text.slice(index, end);
        const distrIdx = block.search(RX_DISTR);
        if (distrIdx >= 0) {
            sections.push({ tipo, body: block.slice(distrIdx) });
        }
    }

    if (!sections.length) return null;

    // Parse each section
    for (const section of sections) {
        const { tipo, body } = section;

        // Skip header "ITEM  PONTUAÇÃO"
        const hdrMatch = /ITEM\s+PONTUA[ÇC][AÃ]O/i.exec(body);
        const content = hdrMatch ? body.slice(hdrMatch.index + hdrMatch[0].length) : body;

        const lines = content.split("\n").map((l) => l.trim()).filter(Boolean);

        // Filter noise lines (section labels)
        const filteredLines = lines.filter((line) => {
            if (/^(ITEM\s+PONTUA|PONTUA[ÇC][AÃ]O|ITEM)$/i.test(line)) return false;
            if (/^ORDEM DOS ADVOGADOS/i.test(line)) return false;
            if (/^Padrão de Resposta/i.test(line)) return false;
            if (/^Prova Prático/i.test(line)) return false;
            if (/^\d+º Exame/i.test(line)) return false;
            if (/^ÁREA:/i.test(line)) return false;
            if (/^Aplicada em/i.test(line)) return false;
            return true;
        });

        // Flexibilidade: aceitar "1." ou "1)" e "A." ou "A)"
        const isItemStart = tipo === "PEÇA"
            ? (s: string) => /^\d+[A-Z]?[\.\)]\s+/i.test(s)
            : (s: string) => /^[A-D]\d*[\.\)]\s+/i.test(s);

        // Títulos de seção mais abrangentes para cobrir as variações da FGV
        const isSectionTitle = (s: string) =>
            /^(Endereçamento|Qualificação.*|Alegações.*|Fundamentação.*|Pedidos.*|Fechamento|Mérito|Do Direito|Das Preliminares|Dos Fatos)$/i.test(s);

        // Regex para capturar range de notas (ex: 0,00/0,10) que gruda no final da linha do texto
        const rangeTrailingRegex = /\s*(0[,.]00(?:\s*\/\s*\d{1,2}[,.]\d{2})+)\s*$/;

        type RawItem = { rotulo: string; textLines: string[]; scoreRangeLines: string[] };
        const rawItems: RawItem[] = [];
        let current: RawItem | null = null;

        for (let line of filteredLines) {
            if (isSectionTitle(line)) continue; // skip section titles

            // Verifica e extrai o range de pontuação se ele estiver grudado no final da linha
            let trailingRange: string | null = null;
            const rangeMatch = line.match(rangeTrailingRegex);
            if (rangeMatch) {
                trailingRange = rangeMatch[1];
                line = line.replace(rangeTrailingRegex, "").trim(); // Limpa a linha mantendo apenas o texto
            }

            // Se a linha ficou vazia após tirar o range, significa que a linha original era SÓ o range
            if (!line && trailingRange && current) {
                current.scoreRangeLines.push(trailingRange);
                continue;
            }

            if (isItemStart(line)) {
                if (current) rawItems.push(current);

                // Encontra o separador (. ou ))
                const sepIdx = line.search(/[\.\)]/);
                const rotulo = line.slice(0, sepIdx).trim();
                const rest = line.slice(sepIdx + 1).trim();

                current = { rotulo, textLines: rest ? [rest] : [], scoreRangeLines: [] };

                if (trailingRange) {
                    current.scoreRangeLines.push(trailingRange);
                }
            } else if (current) {
                // Checa se é uma continuação de range "solta" sem o 0,00 inicial (ex: "0,10 / 0,20")
                if (/^\d{1,2}[,.]\d{2}(?:\s*\/\s*\d{1,2}[,.]\d{2})*\s*$/.test(line)) {
                    current.scoreRangeLines.push(line);
                } else if (line) {
                    current.textLines.push(line);
                }

                // Se a linha de texto também tinha um range grudado no final
                if (trailingRange) {
                    current.scoreRangeLines.push(trailingRange);
                }
            }
        }
        if (current) rawItems.push(current);

        // For PEÇA: merge sub-items that share the same base number (11, 11A, 11B → quesito 11)
        type MergedItem = { baseNum: number; parts: RawItem[] };
        const merged: MergedItem[] = [];

        if (tipo === "PEÇA") {
            for (const raw of rawItems) {
                const baseNum = parseInt(raw.rotulo.match(/^\d+/)?.[0] ?? "0", 10);
                const existing = merged.find((m) => m.baseNum === baseNum);
                if (existing) {
                    existing.parts.push(raw);
                } else {
                    merged.push({ baseNum, parts: [raw] });
                }
            }
        } else {
            // Questões: each A/B is its own item, no merging
            for (const raw of rawItems) {
                const idx = raw.rotulo.toUpperCase().charCodeAt(0) - 64; // A=1, B=2
                merged.push({ baseNum: idx, parts: [raw] });
            }
        }

        // Convert merged items to ParsedQuesito
        for (const group of merged) {
            // Combine all parts into one quesito
            const allTextLines: string[] = [];
            const allScoreRangeLines: string[] = [];
            for (const part of group.parts) {
                // If multiple parts (e.g. 11, 11A, 11B), prepend the sub-label
                if (group.parts.length > 1) {
                    allTextLines.push(`${part.rotulo}. ${joinLines(part.textLines)}`);
                } else {
                    allTextLines.push(...part.textLines);
                }
                allScoreRangeLines.push(...part.scoreRangeLines);
            }

            const descBruta = group.parts.length > 1
                ? allTextLines.join(" ")
                : joinLines(allTextLines);
            const desc = cleanDescTrailingRange(descBruta);

            // Extract nota_maxima from score range lines (take max across all parts)
            let notaMaxima = 0;
            for (const part of group.parts) {
                const rangeStr = part.scoreRangeLines.join(" ");
                if (rangeStr) {
                    const partMax = parseScoreRange(rangeStr);
                    notaMaxima += partMax; // sum sub-item maxes (11=0.10, 11A=0.20, 11B=0.20 → 0.50)
                }
            }

            // If no score range lines, try inline (0,xx) tokens
            if (!notaMaxima) {
                const inlinePesos: number[] = [];
                const rx = /\([\s]*(\d{1,2})[\s]*[,.][\s]*(\d{2})[\s]*\)/g;
                let im: RegExpExecArray | null;
                while ((im = rx.exec(descBruta)) !== null) {
                    const n = Number(`${im[1]}.${im[2]}`);
                    if (!Number.isNaN(n) && n > 0) inlinePesos.push(n);
                }
                notaMaxima = inlinePesos.reduce((a, b) => a + b, 0);
            }

            // Extract all brute weight values from description
            const faixaPontuacao: number[] = [];
            const rxBruto = /\([\s]*(\d{1,2})[\s]*[,.][\s]*(\d{2})[\s]*\)/g;
            let bm: RegExpExecArray | null;
            while ((bm = rxBruto.exec(descBruta)) !== null) {
                const n = Number(`${bm[1]}.${bm[2]}`);
                if (!Number.isNaN(n) && n > 0) faixaPontuacao.push(Number(n.toFixed(2)));
            }

            const rotulo = tipo === "PEÇA"
                ? String(group.baseNum)
                : group.parts[0].rotulo.toUpperCase();

            quesitos.push({
                questao: tipo,
                rotulo,
                indice: group.baseNum,
                descricao: desc,
                descricao_bruta: descBruta,
                nota_maxima: Number(notaMaxima.toFixed(2)),
                faixa_pontuacao: faixaPontuacao,
            });
        }
    }

    return quesitos.length ? quesitos : null;
}

// ── Convert simple parsed data to RubricPayload ──────────────────────────

function buildPayloadFromQuesitos(
    quesitos: ParsedQuesito[],
    meta: ReturnType<typeof extractMeta>,
    fileName?: string,
    executadoPor?: string,
): RubricPayload {
    const itens: RubricPayload["itens"] = [];
    const grupos: NonNullable<RubricPayload["grupos"]> = [];

    // Peça: "Quesito 1" a "Quesito 16" | Questões: "Q1-A", "Q1-B", "Q2-A", etc.
    let pecaIdx = 0;

    for (const q of quesitos) {
        const escopo = q.questao === "PEÇA" ? "Peça" : "Questão";

        // IDs semânticos: Peça → "Quesito N", Questões → "Q1-A", "Q1-B", etc.
        let qLabel: string;
        let rotulo: string;
        let indice: number;

        if (q.questao === "PEÇA") {
            pecaIdx++;
            qLabel = `Quesito ${pecaIdx}`;
            rotulo = String(q.indice);
            indice = pecaIdx;
        } else {
            // Q1-A, Q1-B, Q2-A, Q2-B, Q3-A, Q3-B, Q4-A, Q4-B
            qLabel = `${q.questao}-${q.rotulo}`;
            rotulo = qLabel;
            indice = q.indice;
        }

        const subitemId = qLabel;
        const grupoId = qLabel;

        itens.push({
            id: subitemId,
            escopo,
            questao: q.questao,
            descricao: q.descricao,
            nota_maxima: q.nota_maxima > 0 ? q.nota_maxima : null,
            fundamentos: [],
            alternativas_grupo: undefined,
            palavras_chave: [],
            embedding_text: "",
        });

        grupos.push({
            id: grupoId,
            escopo,
            questao: q.questao,
            indice,
            rotulo,
            descricao: q.descricao,
            nota_maxima: q.nota_maxima,
            faixa_pontuacao: q.faixa_pontuacao,
        });
    }

    return {
        meta: {
            ...meta,
            versao_schema: "2.2",
            gerado_em: new Date().toISOString(),
            executado_por: executadoPor ?? "parser_deterministico",
            fileName,
        },
        schema_docs: {
            subitem_fields: ["id", "escopo", "questao", "descricao", "nota_maxima"],
            group_fields: ["id", "escopo", "questao", "indice", "rotulo", "descricao", "nota_maxima", "faixa_pontuacao"],
            notas: [
                "Peça: Quesito 1-16. Questões: Q1-A, Q1-B, Q2-A, ..., Q4-B.",
                "descricao preserva os tokens (0,xx) originais do padrão de resposta.",
                "nota_maxima é o valor máximo que o item pode valer.",
                "faixa_pontuacao é o detalhamento das notas parciais (ex: [0.40, 0.10]).",
            ],
        },
        itens,
        grupos,
    };
}

// ── Blueprint Resolution (Single Source of Truth) ────────────────────────

interface BlueprintConfig {
    model: string;
    provider: AiProviderType;
    systemPrompt: string;
    temperature: number;
    maxOutputTokens: number;
    thinkingLevel?: string | null;
    reasoningEffort?: string | null;
    codeExecution?: boolean;
}

const DEFAULT_SYSTEM_PROMPT = "Você é um parser especializado em extrair quesitos da Distribuição dos Pontos de provas prático-profissionais da OAB (FGV). Você receberá o conteúdo do Padrão de Resposta em texto transcrito ou em imagens do PDF. Responda APENAS com JSON válido seguindo todas instruçoes.";

async function resolveBlueprintConfig(optionsModel?: string): Promise<BlueprintConfig> {
    const defaultModel = optionsModel ?? DEFAULT_RUBRIC_MODEL;
    const defaults: BlueprintConfig = {
        model: defaultModel,
        provider: detectProviderFromModel(defaultModel),
        systemPrompt: DEFAULT_SYSTEM_PROMPT,
        temperature: 0,
        maxOutputTokens: 80000,
    };

    try {
        const { getAgentBlueprintByLinkedColumn } = await import("@/lib/ai-agents/blueprints");
        const blueprint = await getAgentBlueprintByLinkedColumn("ESPELHO_PADRAO_CELL");
        if (blueprint) {
            const resolvedModel = optionsModel ?? blueprint.model ?? defaults.model;
            const meta = blueprint.metadata as Record<string, unknown> | null;
            const resolved: BlueprintConfig = {
                model: resolvedModel,
                provider: (blueprint.defaultProvider as AiProviderType) ?? detectProviderFromModel(resolvedModel),
                systemPrompt: blueprint.systemPrompt ?? defaults.systemPrompt,
                temperature: blueprint.temperature ?? defaults.temperature,
                maxOutputTokens: blueprint.maxOutputTokens ?? defaults.maxOutputTokens,
                thinkingLevel: blueprint.thinkingLevel,
                reasoningEffort: blueprint.reasoningEffort,
                codeExecution: meta?.codeExecution !== false, // default true
            };
            console.info("[OAB::BLUEPRINT] Resolvido:", {
                model: resolved.model,
                provider: resolved.provider,
                name: blueprint.name,
                thinkingLevel: resolved.thinkingLevel ?? "N/A",
                reasoningEffort: resolved.reasoningEffort ?? "N/A",
            });
            return resolved;
        }
    } catch (e) {
        console.warn("[OAB::BLUEPRINT] Falha ao carregar blueprint, usando defaults:", e);
    }

    return defaults;
}

// ── AI Fallback ──────────────────────────────────────────────────────────

const LLM_PROMPT_TEMPLATE = `[MODO TEXTO] Você receberá a transcrição em TEXTO de um PADRÃO DE RESPOSTA oficial da prova prático-profissional da OAB (FGV).

Sua tarefa é extrair APENAS a "Distribuição dos Pontos" — ou seja, os quesitos numerados da PEÇA e das QUESTÕES.

REGRAS:
1. A PEÇA tem quesitos numerados (ex: 1. a 16.). Cada quesito tem um texto descritivo com tokens de pontuação entre parênteses, ex: "(0,20)".
2. Após a Peça, há 4 QUESTÕES (Q1 a Q4). Cada questão tem 2 itens: A e B, com seus textos e pontuações.
3. NÃO inclua títulos de seção (Endereçamento, Qualificação, etc.) — apenas os quesitos numerados.
4. NÃO atomize: cada número (1., 2., ... 16.) é UM quesito. Cada letra (A., B.) é UM quesito.
5. Mantenha os tokens (0,xx) no texto da descrição.
6. nota_maxima é o valor máximo do range de pontuação (ex: "0,00/0,40/0,50" → 0.50).

CASOS PARTICULARES:
7. SUBITENS AGRUPADOS: Quesitos de peça podem ter múltiplos subitens (11, 11A, 11B). Agrupe-os como UM ÚNICO quesito com rótulo do número base ("11"). Concatene as descrições e SOME as notas máximas dos subitens.
   Ex: "11. Deve ser pleiteada a ... 11A. Para a anulação... 11B. Para o ressarcimento... (0,20)" → quesito "11" com descrição unificada, mas mantenha o padrao 11. Deve..11A. Para a..11B.  etc.
8. COLUNA PONTUAÇÃO PREVALECE: Quando a soma dos tokens inline (0,xx) diverge do range da coluna Pontuação (ex: "0,00/0,10/0,20/0,30/0,40"), use o VALOR MÁXIMO DA COLUNA como nota_maxima.
   Ex: "3. Réu: Dante (0,10), a OSC XYZ (0,10) e o Município Alfa (0,10). 0,00/0,10/0,20/0,30/0,40" → nota_maxima = 0.40 (não 0.30).
9. RESPOSTAS ALTERNATIVAS (OU): Alguns itens têm duas ou mais respostas corretas separadas por "OU". Trate como UM ÚNICO quesito. Inclua ambas as alternativas na descrição. A nota_maxima é a do range (não soma as alternativas).
   Ex: "B. O Presidente... (0,50)... (0,10). OU (0,50)... (0,10). 0,00/0,50/0,60" → nota_maxima = 0.60, faixa_pontuacao = [0.50, 0.10].

Responda com JSON VÁLIDO neste formato exato:
{
  "quesitos": [
    {
      "questao": "PEÇA",
      "rotulo": "1",
      "indice": 1,
      "descricao": "Ao Juízo da Vara Única da Comarca do Município Alfa.",
      "nota_maxima": 0.10,
      "faixa_pontuacao": [0.10]
    },
    ...
    {
      "questao": "Q1",
      "rotulo": "A",
      "indice": 1,
      "descricao": "Sim. A decisão coordenada não pode ser aplicada aos processos administrativos em que estejam envolvidas autoridades de Poderes distintos (0,55), na forma do Art. 49-A, § 6º, inciso III, da Lei nº 9.784/1999 (0,10).",
      "nota_maxima": 0.65,
      "faixa_pontuacao": [0.55, 0.10]
    }
  ]
}

Texto transcrito:
"""
__TEXT__
"""`;

async function buildRubricFromPdfLLM(rawText: string, meta: ReturnType<typeof extractMeta>, options: BuildRubricOptions): Promise<RubricPayload> {
    const config = await resolveBlueprintConfig(options.model);

    const compacted = rawText
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .join("\n");

    const prompt = LLM_PROMPT_TEMPLATE.replace("__TEXT__", compacted);

    console.info("[OAB::RUBRIC_LLM_FALLBACK] Enviando para LLM:", {
        textLength: compacted.length,
        model: config.model,
        provider: config.provider,
        fromBlueprint: true,
        temperature: config.temperature,
        maxTokens: config.maxOutputTokens,
        thinkingLevel: config.thinkingLevel ?? "N/A",
        reasoningEffort: config.reasoningEffort ?? "N/A",
    });

    // ── Vercel AI SDK: generateText com provider factory ──
    let content: string;
    try {
        content = await withRetry(async () => {
            const aiModel = createModel(config.provider, config.model);
            const reasoning = config.provider === "GEMINI"
                ? (config.thinkingLevel ?? config.reasoningEffort ?? "minimal")
                : (config.reasoningEffort ?? "minimal");
            const providerOptions = buildProviderOptions(config.provider, config.model, {
                reasoningEffort: reasoning,
            });
            const result = await generateText({
                model: aiModel,
                system: config.systemPrompt,
                messages: [{ role: "user" as const, content: prompt }],
                ...(config.maxOutputTokens ? { maxOutputTokens: config.maxOutputTokens } : {}),
                temperature: config.temperature,
                providerOptions,
            });
            return result.text;
        }, `${config.provider}/${config.model}`);
    } catch (primaryError) {
        // Fallback: se provider primário não for OpenAI, tenta OpenAI
        if (config.provider !== "OPENAI") {
            console.error(`[OAB::RUBRIC_LLM_FALLBACK] ❌ ${config.provider}/${config.model} ERRO:`, (primaryError as Error).message || primaryError);
            console.error(`[OAB::RUBRIC_LLM_FALLBACK] Stack:`, (primaryError as Error).stack?.split('\n').slice(0, 3).join('\n'));
            console.warn(`[OAB::RUBRIC_LLM_FALLBACK] ${config.provider}/${config.model} falhou, usando fallback OpenAI/${OPENAI_FALLBACK_MODEL}`);
            const fallbackModel = createModel("OPENAI", OPENAI_FALLBACK_MODEL);
            const result = await generateText({
                model: fallbackModel,
                system: cleanPromptForOpenAI(config.systemPrompt),
                messages: [{ role: "user" as const, content: prompt }],
                ...(config.maxOutputTokens ? { maxOutputTokens: config.maxOutputTokens } : {}),
                temperature: config.temperature,
            });
            content = result.text;
        } else {
            throw primaryError;
        }
    }

    // Parse JSON robustly
    const tryParsers: Array<() => any> = [
        () => JSON.parse(content),
        () => {
            const fence = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
            if (fence) return JSON.parse(fence[1]);
            throw new Error("no fenced block");
        },
        () => {
            const start = content.indexOf("{");
            const end = content.lastIndexOf("}");
            if (start >= 0 && end > start) return JSON.parse(content.slice(start, end + 1));
            throw new Error("no json braces");
        },
        () => JSON.parse(jsonrepair(content)),
    ];

    let rawObj: any;
    let lastErr: any;
    for (const fn of tryParsers) {
        try {
            rawObj = fn();
            break;
        } catch (e) {
            lastErr = e;
        }
    }
    if (!rawObj) {
        throw new Error(`Falha ao interpretar JSON do gabarito LLM: ${String(lastErr?.message || lastErr)}`);
    }

    // Coerce LLM output to ParsedQuesito[]
    const rawQuesitos: any[] = rawObj?.quesitos ?? rawObj?.itens ?? [];
    if (!rawQuesitos.length) {
        throw new Error("LLM não retornou quesitos válidos");
    }

    const quesitos: ParsedQuesito[] = rawQuesitos.map((q: any, idx: number) => {
        const questao = String(q.questao ?? "PEÇA").toUpperCase();
        const validQuestao = ["PEÇA", "Q1", "Q2", "Q3", "Q4"].includes(questao) ? questao : "PEÇA";
        // Accept both old (peso_maximo/pesos_brutos) and new (nota_maxima/faixa_pontuacao) from LLM
        const rawNota = q.nota_maxima ?? q.peso_maximo;
        let peso = typeof rawNota === "number" ? rawNota : 0;
        if (typeof rawNota === "string") {
            peso = Number(rawNota.replace(",", ".")) || 0;
        }
        const rawFaixa = q.faixa_pontuacao ?? q.pesos_brutos;
        const pesos = Array.isArray(rawFaixa)
            ? rawFaixa.map((p: any) => Number(String(p).replace(",", ".")) || 0).filter((p: number) => p > 0)
            : [];

        return {
            questao: validQuestao as ParsedQuesito["questao"],
            rotulo: String(q.rotulo ?? q.label ?? idx + 1),
            indice: typeof q.indice === "number" ? q.indice : idx + 1,
            descricao: String(q.descricao ?? ""),
            descricao_bruta: String(q.descricao_bruta ?? q.descricao ?? ""),
            nota_maxima: Number(peso.toFixed(2)),
            faixa_pontuacao: pesos.map((p: number) => Number(p.toFixed(2))),
        };
    });

    console.info("[OAB::RUBRIC_LLM_FALLBACK] Quesitos extraídos:", quesitos.length);
    return buildPayloadFromQuesitos(quesitos, meta, options.fileName, `LLM:${config.provider}/${config.model}`);
}

// ── Main Entry Point ─────────────────────────────────────────────────────

export async function buildRubricFromPdf(buffer: Buffer, options: BuildRubricOptions = {}): Promise<RubricPayload> {
    const rawText = await extractTextFromPdf(buffer);
    const meta = extractMeta(rawText);

    console.info("[OAB::RUBRIC_UPLOAD] Texto extraído:", rawText.length, "chars");

    // forceAI: skip deterministic parser entirely
    if (options.forceAI) {
        console.info("[OAB::RUBRIC_UPLOAD] forceAI=true → enviando direto para LLM");
        return buildRubricFromPdfLLM(rawText, meta, options);
    }

    // Try simple deterministic parser first
    const quesitos = parseSimpleDeterministic(rawText);

    if (quesitos && quesitos.length >= 10) {
        // Basic validation: peça should have ~16, questões ~8 = total ~24
        const pecaCount = quesitos.filter((q) => q.questao === "PEÇA").length;
        const questoesCount = quesitos.filter((q) => q.questao !== "PEÇA").length;

        console.info("[OAB::RUBRIC_UPLOAD::DETERMINISTIC]", {
            total: quesitos.length,
            peca: pecaCount,
            questoes: questoesCount,
            notaMaxTotalPeca: Number(quesitos.filter((q) => q.questao === "PEÇA").reduce((a, q) => a + q.nota_maxima, 0).toFixed(2)),
            notaMaxTotalQuestoes: Number(quesitos.filter((q) => q.questao !== "PEÇA").reduce((a, q) => a + q.nota_maxima, 0).toFixed(2)),
        });

        return buildPayloadFromQuesitos(quesitos, meta, options.fileName);
    }

    // Fallback to LLM
    console.warn("[OAB::RUBRIC_UPLOAD::FALLBACK]", {
        reason: !quesitos ? "parser retornou null" : `apenas ${quesitos?.length} quesitos encontrados`,
    });

    const FORCE_DETERMINISTIC = process.env.OAB_EVAL_FORCE_DETERMINISTIC === "1";
    if (FORCE_DETERMINISTIC && quesitos) {
        console.warn("[OAB::RUBRIC_UPLOAD::FORCED_DETERMINISTIC] Usando resultado parcial do parser");
        return buildPayloadFromQuesitos(quesitos, meta, options.fileName, "parser_deterministico (parcial)");
    }

    return buildRubricFromPdfLLM(rawText, meta, options);
}

// ── Vision Pipeline: PDF → Images → AI ──────────────────────────────────

const VISION_RUBRIC_PROMPT = `[MODO IMAGEM] Analise as imagens do PDF de Padrão de Resposta da prova prático-profissional da OAB (FGV).

Sua tarefa é extrair APENAS a "Distribuição dos Pontos" — os quesitos numerados da PEÇA e das QUESTÕES.

REGRAS:
1. A PEÇA tem quesitos numerados (ex: 1. a 16.). Cada quesito tem texto descritivo com tokens de pontuação "(0,xx)".
2. Após a Peça, há 4 QUESTÕES (Q1 a Q4). Cada questão tem 2 itens: A e B, com textos e pontuações.
3. NÃO inclua títulos de seção (Endereçamento, Qualificação, etc.) — apenas quesitos numerados.
4. NÃO atomize: cada número (1., 2., ... 16.) é UM quesito. Cada letra (A., B.) é UM quesito.
5. Mantenha os tokens (0,xx) no texto da descrição.
6. nota_maxima = valor máximo do range de pontuação (ex: "0,00/0,40/0,50" → 0.50).
7. faixa_pontuacao = todos os valores entre parênteses no texto (ex: "(0,55)" e "(0,10)" → [0.55, 0.10]).

CASOS PARTICULARES:
8. SUBITENS AGRUPADOS: Quesitos de peça podem ter múltiplos subitens (11, 11A, 11B). Agrupe-os como UM ÚNICO quesito com rótulo do número base ("11"). Concatene as descrições e SOME as notas máximas dos subitens.
   Ex: "11. Deve ser pleiteada a ... 11A. Para a anulação... 11B. Para o ressarcimento... (0,20)" → quesito "11" com descrição unificada, mas mantenha o padrao 11. Deve..11A. Para a..11B.  etc.
9. COLUNA PONTUAÇÃO PREVALECE: Quando a soma dos tokens inline (0,xx) diverge do range da coluna Pontuação (ex: "0,00/0,10/0,20/0,30/0,40"), use o VALOR MÁXIMO DA COLUNA como nota_maxima.
   Ex: "3. Réu: Dante (0,10), a OSC XYZ (0,10) e o Município Alfa (0,10). 0,00/0,10/0,20/0,30/0,40" → nota_maxima = 0.40 (não 0.30).
10. RESPOSTAS ALTERNATIVAS (OU): Alguns itens têm duas ou mais respostas corretas separadas por "OU". Trate como UM ÚNICO quesito. Inclua ambas as alternativas na descrição. A nota_maxima é a do range (não soma as alternativas).
   Ex: "B. O Presidente... (0,50)... (0,10). OU (0,50)... (0,10). 0,00/0,50/0,60" → nota_maxima = 0.60, faixa_pontuacao = [0.50, 0.10].

Responda com JSON VÁLIDO neste formato:
{
  "quesitos": [
    {
      "questao": "PEÇA",
      "rotulo": "1",
      "indice": 1,
      "descricao": "Ao Juízo da Vara Única da Comarca do Município Alfa.",
      "nota_maxima": 0.10,
      "faixa_pontuacao": [0.10]
    },
    {
      "questao": "Q1",
      "rotulo": "A",
      "indice": 1,
      "descricao": "Sim. A decisão coordenada não pode ser aplicada... (0,55)... (0,10).",
      "nota_maxima": 0.65,
      "faixa_pontuacao": [0.55, 0.10]
    }
  ]
}`;

/**
 * Converte PDF buffer em imagens PNG via GhostScript/ImageMagick
 * e faz upload para MinIO, retornando as URLs.
 */
export async function convertPdfBufferToImageUrls(buffer: Buffer): Promise<string[]> {
    const baseName = `rubric-${randomUUID()}`;
    const tmpDir = path.join("/tmp", baseName);
    const pdfPath = path.join(tmpDir, `${baseName}.pdf`);

    await fs.promises.mkdir(tmpDir, { recursive: true });
    await fs.promises.writeFile(pdfPath, buffer);

    const outputBaseName = path.join(tmpDir, "page");
    const format = "png";

    // Tier 1: GhostScript
    try {
        await execPromise(
            `gs -dSAFER -dBATCH -dNOPAUSE -sDEVICE=png16m -r300 -dGraphicsAlphaBits=4 -dTextAlphaBits=4 -dNumRenderingThreads=4 -dBufferSpace=500000000 -sOutputFile=${outputBaseName}-%d.${format} ${pdfPath}`,
        );
    } catch {
        // Tier 2: ImageMagick convert
        try {
            await execPromise(`convert -density 300 "${pdfPath}" -quality 100 "${outputBaseName}-%d.${format}"`);
        } catch {
            // Tier 3: ImageMagick 7+ magick
            await execPromise(`magick -density 300 "${pdfPath}" -quality 100 "${outputBaseName}-%d.${format}"`);
        }
    }

    const files = (await fs.promises.readdir(tmpDir))
        .filter((f) => f.endsWith(`.${format}`))
        .sort();

    if (!files.length) {
        throw new Error("Nenhuma imagem gerada na conversão do PDF");
    }

    // Upload to MinIO in batches of 6
    const urls: string[] = [];
    const BATCH_SIZE = 6;

    for (let i = 0; i < files.length; i += BATCH_SIZE) {
        const batch = files.slice(i, i + BATCH_SIZE);
        const batchResults = await Promise.all(
            batch.map(async (file) => {
                const filePath = path.join(tmpDir, file);
                const fileBuffer = await fs.promises.readFile(filePath);
                const fileName = `${baseName}_${file}`;
                const result = await uploadToMinIOWithRetry(fileBuffer, fileName, "image/png", 3, false);
                // Cleanup temp file
                await fs.promises.unlink(filePath).catch(() => { });
                return result.url;
            }),
        );
        urls.push(...batchResults);
    }

    // Cleanup temp dir
    await fs.promises.rm(tmpDir, { recursive: true, force: true }).catch(() => { });

    console.info(`[OAB::RUBRIC_VISION] ${urls.length} imagens convertidas e enviadas ao MinIO`);
    return urls;
}

/**
 * Extrai gabarito a partir de imagens do PDF via Vision AI.
 * Converte PDF→imagens (se necessário), envia para o modelo de visão,
 * e parseia o resultado em RubricPayload.
 */
export async function buildRubricFromPdfVision(
    buffer: Buffer,
    options: BuildRubricOptions & { imageUrls?: string[] } = {},
): Promise<{ payload: RubricPayload; imageUrls: string[] }> {
    // 1) Converter PDF em imagens (ou usar URLs fornecidas)
    const imageUrls = options.imageUrls?.length
        ? options.imageUrls
        : await convertPdfBufferToImageUrls(buffer);

    console.info("[OAB::RUBRIC_VISION] Iniciando extração via visão:", { images: imageUrls.length });

    // 2) Resolver config do blueprint (fonte única de verdade)
    const config = await resolveBlueprintConfig(options.model);
    const isGemini = config.provider === "GEMINI";
    const useCodeExecution = isGemini && (config.codeExecution !== false);

    console.info("[OAB::RUBRIC_VISION] Config resolvida:", {
        model: config.model,
        provider: config.provider,
        fromBlueprint: true,
        codeExecution: useCodeExecution,
        thinkingLevel: config.thinkingLevel ?? "N/A",
        reasoningEffort: config.reasoningEffort ?? "N/A",
    });

    // 3) Vercel AI SDK: generateText com multi-image + code execution (Gemini)
    const imageParts = imageUrls.map((url) => ({ type: "image" as const, image: new URL(url) }));
    const tools = useCodeExecution ? { code_execution: google.tools.codeExecution({}) } : undefined;

    let content: string;
    try {
        content = await withRetry(async () => {
            const aiModel = createModel(config.provider, config.model);
            const reasoning = config.provider === "GEMINI"
                ? (config.thinkingLevel ?? config.reasoningEffort ?? "high")
                : (config.reasoningEffort ?? "high");
            const providerOptions = buildProviderOptions(config.provider, config.model, {
                reasoningEffort: reasoning,
            });
            const result = await generateText({
                model: aiModel,
                system: config.systemPrompt,
                messages: [{
                    role: "user" as const,
                    content: [
                        { type: "text" as const, text: VISION_RUBRIC_PROMPT },
                        ...imageParts,
                    ],
                }],
                tools,
                ...(config.maxOutputTokens ? { maxOutputTokens: config.maxOutputTokens } : {}),
                temperature: config.temperature,
                providerOptions,
            });
            return result.text;
        }, `Vision:${config.provider}/${config.model}`);
    } catch (primaryError) {
        // Fallback: Gemini/Claude → OpenAI (sem tools, prompt limpo)
        if (config.provider !== "OPENAI") {
            console.warn(`[OAB::RUBRIC_VISION] ${config.provider}/${config.model} falhou, fallback para OpenAI/${OPENAI_FALLBACK_MODEL}`);
            const fallbackModel = createModel("OPENAI", OPENAI_FALLBACK_MODEL);
            const result = await generateText({
                model: fallbackModel,
                system: cleanPromptForOpenAI(config.systemPrompt),
                messages: [{
                    role: "user" as const,
                    content: [
                        { type: "text" as const, text: VISION_RUBRIC_PROMPT },
                        ...imageParts,
                    ],
                }],
                ...(config.maxOutputTokens ? { maxOutputTokens: config.maxOutputTokens } : {}),
                temperature: config.temperature,
            });
            content = result.text;
        } else {
            throw primaryError;
        }
    }

    // 4) Parse JSON (mesma chain robusta do LLM fallback)
    const tryParsers: Array<() => any> = [
        () => JSON.parse(content),
        () => {
            const fence = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
            if (fence) return JSON.parse(fence[1]);
            throw new Error("no fenced block");
        },
        () => {
            const start = content.indexOf("{");
            const end = content.lastIndexOf("}");
            if (start >= 0 && end > start) return JSON.parse(content.slice(start, end + 1));
            throw new Error("no json braces");
        },
        () => JSON.parse(jsonrepair(content)),
    ];

    let rawObj: any;
    let lastErr: any;
    for (const fn of tryParsers) {
        try {
            rawObj = fn();
            break;
        } catch (e) {
            lastErr = e;
        }
    }
    if (!rawObj) {
        throw new Error(`[VISION] Falha ao interpretar JSON do gabarito: ${String(lastErr?.message || lastErr)}`);
    }

    // 5) Coerce para ParsedQuesito[] e gerar payload
    const rawQuesitos: any[] = rawObj?.quesitos ?? rawObj?.itens ?? [];
    if (!rawQuesitos.length) {
        throw new Error("[VISION] Nenhum quesito extraído das imagens");
    }

    const quesitos: ParsedQuesito[] = rawQuesitos.map((q: any, idx: number) => {
        const questao = String(q.questao ?? "PEÇA").toUpperCase();
        const validQuestao = ["PEÇA", "Q1", "Q2", "Q3", "Q4"].includes(questao) ? questao : "PEÇA";
        // Accept both old (peso_maximo/pesos_brutos) and new (nota_maxima/faixa_pontuacao) from LLM
        const rawNota = q.nota_maxima ?? q.peso_maximo;
        let peso = typeof rawNota === "number" ? rawNota : 0;
        if (typeof rawNota === "string") {
            peso = Number(rawNota.replace(",", ".")) || 0;
        }
        const rawFaixa = q.faixa_pontuacao ?? q.pesos_brutos;
        const pesos = Array.isArray(rawFaixa)
            ? rawFaixa.map((p: any) => Number(String(p).replace(",", ".")) || 0).filter((p: number) => p > 0)
            : [];

        return {
            questao: validQuestao as ParsedQuesito["questao"],
            rotulo: String(q.rotulo ?? q.label ?? idx + 1),
            indice: typeof q.indice === "number" ? q.indice : idx + 1,
            descricao: String(q.descricao ?? ""),
            descricao_bruta: String(q.descricao_bruta ?? q.descricao ?? ""),
            nota_maxima: Number(peso.toFixed(2)),
            faixa_pontuacao: pesos.map((p: number) => Number(p.toFixed(2))),
        };
    });

    // Extrair meta do texto (se possível)
    let meta: ReturnType<typeof extractMeta> = { exam: "Exame OAB", area: "Área não identificada", data_aplicacao: undefined, fonte: "Padrão de Resposta da FGV" };
    try {
        const rawText = await extractTextFromPdf(buffer);
        meta = extractMeta(rawText);
    } catch {
        // Fallback: meta genérica
    }

    const payload = buildPayloadFromQuesitos(quesitos, meta, options.fileName, `Vision:${config.provider}/${config.model}`);
    console.info("[OAB::RUBRIC_VISION] Quesitos extraídos:", quesitos.length);

    return { payload, imageUrls };
}