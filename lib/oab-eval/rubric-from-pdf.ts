//lib/oab-eval/rubric-from-pdf.ts
import { Buffer } from "node:buffer";
import pdfParse from "pdf-parse";
import { RubricSchema, type RubricPayload } from "./types";
import { jsonrepair } from "jsonrepair";

interface BuildRubricOptions {
	fileName?: string;
	model?: string;
}

const DEFAULT_RUBRIC_MODEL = process.env.OAB_EVAL_RUBRIC_MODEL ?? "gpt-4o";

type OpenAIClientModule = typeof import("./openai-client");
let openaiClientModule: OpenAIClientModule | null = null;

async function ensureOpenAIClient(): Promise<OpenAIClientModule> {
	if (!openaiClientModule) {
		openaiClientModule = await import("./openai-client");
	}
	return openaiClientModule;
}

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
	peso_maximo: number;
	pesos_brutos: number[];
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

		// For PEÇA: items start with "1.", "2.", ..., "16." etc
		// For Questões: items start with "A.", "B.", "C.", "D."
		const isItemStart = tipo === "PEÇA"
			? (s: string) => /^\d+[A-Z]?\.\s+/i.test(s)
			: (s: string) => /^[A-D]\d*\.\s+/i.test(s);

		// Detect section title lines (Endereçamento, Qualificação, etc.)
		const isSectionTitle = (s: string) =>
			/^(Endereçamento|Qualificação das partes|Alegações iniciais|Fundamentação|Pedidos|Pedidos e requerimentos|Fechamento|Mérito)$/i.test(s);

		// Detect score range line: "0,00/0,10/0,20/..."
		const isScoreRange = (s: string) => /^0[,.]00(?:\s*\/\s*\d{1,2}[,.]\d{2})+/.test(s.trim());

		// Parse items
		type RawItem = { rotulo: string; textLines: string[]; scoreRangeLines: string[] };
		const rawItems: RawItem[] = [];
		let current: RawItem | null = null;

		for (const line of filteredLines) {
			if (isSectionTitle(line)) continue; // skip section titles

			if (isItemStart(line)) {
				if (current) rawItems.push(current);
				const dotIdx = line.indexOf(".");
				const rotulo = line.slice(0, dotIdx).trim();
				const rest = line.slice(dotIdx + 1).trim();
				current = { rotulo, textLines: [rest], scoreRangeLines: [] };
			} else if (current && isScoreRange(line)) {
				current.scoreRangeLines.push(line);
			} else if (current) {
				// Check if this line is a continuation or a dangling score range
				if (/^\d{1,2}[,.]\d{2}(?:\s*\/\s*\d{1,2}[,.]\d{2})*\s*$/.test(line)) {
					current.scoreRangeLines.push(line);
				} else {
					current.textLines.push(line);
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
				const idx = raw.rotulo.charCodeAt(0) - 64; // A=1, B=2
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

			// Extract peso_maximo from score range lines (take max across all parts)
			let pesoMaximo = 0;
			for (const part of group.parts) {
				const rangeStr = part.scoreRangeLines.join(" ");
				if (rangeStr) {
					const partMax = parseScoreRange(rangeStr);
					pesoMaximo += partMax; // sum sub-item maxes (11=0.10, 11A=0.20, 11B=0.20 → 0.50)
				}
			}

			// If no score range lines, try inline (0,xx) tokens
			if (!pesoMaximo) {
				const inlinePesos: number[] = [];
				const rx = /\([\s]*(\d{1,2})[\s]*[,.][\s]*(\d{2})[\s]*\)/g;
				let im: RegExpExecArray | null;
				while ((im = rx.exec(descBruta)) !== null) {
					const n = Number(`${im[1]}.${im[2]}`);
					if (!Number.isNaN(n) && n > 0) inlinePesos.push(n);
				}
				pesoMaximo = inlinePesos.reduce((a, b) => a + b, 0);
			}

			// Extract all brute weight values from description
			const pesosBrutos: number[] = [];
			const rxBruto = /\([\s]*(\d{1,2})[\s]*[,.][\s]*(\d{2})[\s]*\)/g;
			let bm: RegExpExecArray | null;
			while ((bm = rxBruto.exec(descBruta)) !== null) {
				const n = Number(`${bm[1]}.${bm[2]}`);
				if (!Number.isNaN(n) && n > 0) pesosBrutos.push(Number(n.toFixed(2)));
			}

			const rotulo = tipo === "PEÇA"
				? String(group.baseNum)
				: group.parts[0].rotulo;

			quesitos.push({
				questao: tipo,
				rotulo,
				indice: group.baseNum,
				descricao: desc,
				descricao_bruta: descBruta,
				peso_maximo: Number(pesoMaximo.toFixed(2)),
				pesos_brutos: pesosBrutos,
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
): RubricPayload {
	const itens: RubricPayload["itens"] = [];
	const grupos: NonNullable<RubricPayload["grupos"]> = [];

	// Numeração global: Peça quesitos 1-16, depois Questão 1A, 1B, 2A, 2B, etc.
	let globalIdx = 0;

	for (const q of quesitos) {
		globalIdx++;
		const escopo = q.questao === "PEÇA" ? "Peça" : "Questão";

		// IDs legíveis: "Quesito 1", "Quesito 2", ..., "Quesito 17" (Q1-A), "Quesito 18" (Q1-B), etc.
		const qLabel = `Quesito ${globalIdx}`;
		const subitemId = qLabel;
		const grupoId = qLabel;

		// Rótulo humano: "1", "2", ..., "16" para peça | "Q1-A", "Q1-B", "Q2-A", etc. para questões
		const rotulo = q.questao === "PEÇA"
			? String(q.indice)
			: `${q.questao}-${q.rotulo}`;

		itens.push({
			id: subitemId,
			escopo,
			questao: q.questao,
			descricao: q.descricao,
			peso: q.peso_maximo > 0 ? q.peso_maximo : null,
			fundamentos: [],
			alternativas_grupo: undefined,
			palavras_chave: [],
			embedding_text: "",
		});

		grupos.push({
			id: grupoId,
			escopo,
			questao: q.questao,
			indice: globalIdx,
			rotulo,
			segmento: null,
			descricao: `${q.descricao}\n${q.pesos_brutos.length ? q.pesos_brutos.map((p) => p.toFixed(2).replace(".", ",")).join("/") : ""}`.trim(),
			descricao_bruta: q.descricao_bruta,
			descricao_limpa: q.descricao,
			peso_maximo: q.peso_maximo,
			pesos_opcoes: q.pesos_brutos.length ? q.pesos_brutos : (q.peso_maximo > 0 ? [q.peso_maximo] : []),
			pesos_brutos: q.pesos_brutos,
			subitens: [subitemId],
		});
	}

	return {
		meta: {
			...meta,
			versao_schema: "2.0",
			gerado_em: new Date().toISOString(),
			fileName,
		},
		schema_docs: {
			subitem_fields: ["id", "escopo", "questao", "descricao", "peso", "fundamentos", "alternativas_grupo", "palavras_chave", "embedding_text"],
			group_fields: ["id", "escopo", "questao", "indice", "rotulo", "segmento", "descricao", "descricao_bruta", "descricao_limpa", "peso_maximo", "pesos_opcoes", "pesos_brutos", "subitens"],
			notas: [
				"Cada quesito da peça (1-16) e cada item das questões (A/B) é um grupo com exatamente 1 subitem.",
				"descricao preserva os tokens (0,xx) originais do padrão de resposta.",
				"peso_maximo é o valor máximo que o quesito pode valer.",
			],
		},
		itens,
		grupos,
	};
}

// ── AI Fallback ──────────────────────────────────────────────────────────

const LLM_PROMPT_TEMPLATE = `Você receberá a transcrição de um PADRÃO DE RESPOSTA oficial da prova prático-profissional da OAB (FGV).

Sua tarefa é extrair APENAS a "Distribuição dos Pontos" — ou seja, os quesitos numerados da PEÇA e das QUESTÕES.

REGRAS:
1. A PEÇA geralmente tem 16 quesitos numerados (1. a 16.). Cada quesito tem um texto descritivo com tokens de pontuação entre parênteses, ex: "(0,20)".
2. Após a Peça, há 4 QUESTÕES (Q1 a Q4). Cada questão tem 2 itens: A e B, com seus textos e pontuações.
3. NÃO inclua títulos de seção (Endereçamento, Qualificação, etc.) — apenas os quesitos numerados.
4. NÃO atomize: cada número (1., 2., ... 16.) é UM quesito. Cada letra (A., B.) é UM quesito.
5. Mantenha os tokens (0,xx) no texto da descrição.
6. peso_maximo é o valor máximo do range de pontuação (ex: "0,00/0,40/0,50" → 0.50).

Responda com JSON VÁLIDO neste formato exato:
{
  "quesitos": [
    {
      "questao": "PEÇA",
      "rotulo": "1",
      "indice": 1,
      "descricao": "Ao Juízo da Vara Única da Comarca do Município Alfa.",
      "peso_maximo": 0.10,
      "pesos_brutos": [0.10]
    },
    ...
    {
      "questao": "Q1",
      "rotulo": "A",
      "indice": 1,
      "descricao": "Sim. A decisão coordenada não pode ser aplicada aos processos administrativos em que estejam envolvidas autoridades de Poderes distintos (0,55), na forma do Art. 49-A, § 6º, inciso III, da Lei nº 9.784/1999 (0,10).",
      "peso_maximo": 0.65,
      "pesos_brutos": [0.55, 0.10]
    }
  ]
}

Texto transcrito:
"""
__TEXT__
"""`;

async function buildRubricFromPdfLLM(rawText: string, meta: ReturnType<typeof extractMeta>, options: BuildRubricOptions): Promise<RubricPayload> {
	const compacted = rawText
		.split("\n")
		.map((l) => l.trim())
		.filter(Boolean)
		.join("\n");

	const prompt = LLM_PROMPT_TEMPLATE.replace("__TEXT__", compacted);

	console.info("[OAB::RUBRIC_LLM_FALLBACK] Enviando para LLM:", {
		textLength: compacted.length,
		model: options.model ?? DEFAULT_RUBRIC_MODEL,
	});

	const { openai } = await ensureOpenAIClient();
	const response = await openai.chat.completions.create({
		model: options.model ?? DEFAULT_RUBRIC_MODEL,
		temperature: 0,
		messages: [
			{
				role: "system",
				content: "Você é um parser especializado em extrair quesitos da Distribuição dos Pontos de provas da OAB. Responda APENAS com JSON válido.",
			},
			{ role: "user", content: prompt },
		],
		response_format: { type: "json_object" },
		max_tokens: 8000,
	});

	const content = response.choices[0]?.message?.content ?? "";

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
		let peso = typeof q.peso_maximo === "number" ? q.peso_maximo : 0;
		if (typeof q.peso_maximo === "string") {
			peso = Number(q.peso_maximo.replace(",", ".")) || 0;
		}
		const pesos = Array.isArray(q.pesos_brutos)
			? q.pesos_brutos.map((p: any) => Number(String(p).replace(",", ".")) || 0).filter((p: number) => p > 0)
			: [];

		return {
			questao: validQuestao as ParsedQuesito["questao"],
			rotulo: String(q.rotulo ?? q.label ?? idx + 1),
			indice: typeof q.indice === "number" ? q.indice : idx + 1,
			descricao: String(q.descricao ?? ""),
			descricao_bruta: String(q.descricao_bruta ?? q.descricao ?? ""),
			peso_maximo: Number(peso.toFixed(2)),
			pesos_brutos: pesos.map((p: number) => Number(p.toFixed(2))),
		};
	});

	console.info("[OAB::RUBRIC_LLM_FALLBACK] Quesitos extraídos:", quesitos.length);
	return buildPayloadFromQuesitos(quesitos, meta, options.fileName);
}

// ── Main Entry Point ─────────────────────────────────────────────────────

export async function buildRubricFromPdf(buffer: Buffer, options: BuildRubricOptions = {}): Promise<RubricPayload> {
	const rawText = await extractTextFromPdf(buffer);
	const meta = extractMeta(rawText);

	console.info("[OAB::RUBRIC_UPLOAD] Texto extraído:", rawText.length, "chars");

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
			pesoTotalPeca: Number(quesitos.filter((q) => q.questao === "PEÇA").reduce((a, q) => a + q.peso_maximo, 0).toFixed(2)),
			pesoTotalQuestoes: Number(quesitos.filter((q) => q.questao !== "PEÇA").reduce((a, q) => a + q.peso_maximo, 0).toFixed(2)),
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
		return buildPayloadFromQuesitos(quesitos, meta, options.fileName);
	}

	return buildRubricFromPdfLLM(rawText, meta, options);
}
