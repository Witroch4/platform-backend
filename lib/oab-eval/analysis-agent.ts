/**
 * Analysis Agent — Blueprint-based Análise Comparativa (Prova × Espelho)
 *
 * Compara a transcrição da prova manuscrita com o espelho de correção
 * para identificar acertos não pontuados pela banca OAB.
 *
 * Suporta OpenAI e Gemini via Engine Híbrida (blueprint → provider switch).
 *
 * Feature flag: BLUEPRINT_ANALISE=true (se false/ausente → fluxo externo n8n)
 */

import { getAgentBlueprintByLinkedColumn, isGeminiModel } from "@/lib/ai-agents/blueprints";
import { openai } from "@/lib/oab-eval/openai-client";
import { getGeminiClient } from "@/lib/oab-eval/gemini-client";
import { getPrismaInstance } from "@/lib/connections";
import { optimizeMirrorPayload, estimateTokenSavings } from "@/lib/oab-eval/mirror-formatter";
import type { StudentMirrorPayload } from "@/lib/oab-eval/types";

// ============================================================================
// TYPES
// ============================================================================

export interface AnalysisAgentInput {
	leadId: string;
	textoProva: string;
	textoEspelho: string;
	selectedProvider?: "OPENAI" | "GEMINI";
	onProgress?: (message: string) => Promise<void>;
}

export interface AnalysisPontoItem {
	titulo: string;
	descricao: string;
	valor: string;
}

export interface AnalysisAgentOutput {
	exameDescricao: string;
	inscricao: string;
	nomeExaminando: string;
	seccional: string;
	areaJuridica: string;
	notaFinal: string;
	situacao: string;
	pontosPeca: AnalysisPontoItem[];
	subtotalPeca: string;
	pontosQuestoes: AnalysisPontoItem[];
	subtotalQuestoes: string;
	conclusao: string;
	argumentacao: string[];
}

export interface AnalysisResult {
	leadId: string;
	success: boolean;
	analysis?: AnalysisAgentOutput;
	rawResponse?: string;
	error?: string;
	model: string;
	provider: "OPENAI" | "GEMINI";
	processingTimeMs: number;
}

// ============================================================================
// DEFAULT MODELS
// ============================================================================

const DEFAULT_MODELS_BY_PROVIDER: Record<string, string> = {
	OPENAI: "gpt-5.2",
	GEMINI: "gemini-2.5-flash",
};

const DEFAULT_MAX_OUTPUT_TOKENS = 16384;
const DEFAULT_TEMPERATURE = 0;

const IS_DEBUG = process.env.DEBUG === "1" || process.env.DEBUG === "true";

// ============================================================================
// SYSTEM PROMPT — Reinforcement Layer
// ============================================================================

/**
 * Camada interna de reforço do prompt.
 * Garante comportamento robusto independente do prompt do blueprint.
 */
const ANALYSIS_REINFORCEMENT_PROMPT = `
[REFORÇO INTERNO DO SISTEMA — OBRIGATÓRIO]

Você é um ANALISTA JURÍDICO ESPECIALIZADO em provas da OAB (2ª Fase).
Sua missão: comparar "TEXTO DA PROVA" × "ESPELHO DA PROVA" e identificar acertos do examinando que NÃO foram pontuados pela banca.

REGRAS ABSOLUTAS (sobrescrevem qualquer instrução conflitante):
1. OTIMISMO FUNDAMENTADO: A banca frequentemente erra. Analise com viés favorável ao examinando, mas NUNCA invente pontos inexistentes.
2. APENAS ACERTOS EXISTENTES: Aponte somente o que o aluno de FATO escreveu e não foi contabilizado. Cite sempre "Linhas XX-YY".
3. PROIBIDO SUGERIR MELHORIAS: O examinando NÃO pode reescrever a prova. Zero sugestões de redação.
4. PROIBIDO ULTRAPASSAR TETO: Nunca atribua mais pontos do que o máximo previsto no espelho.
5. VERIFICAR DUPLA PONTUAÇÃO: Antes de atribuir pontos, confirme que o aluno ainda NÃO recebeu aquela pontuação.
6. SAÍDA EXCLUSIVAMENTE JSON: Sua resposta DEVE começar com { e terminar com }. NENHUM texto fora do JSON.
7. ANÁLISE COMPLETA: Analise SEMPRE tanto a Peça Profissional quanto TODAS as Questões. Nunca pule seções.
8. nota_maxima_peca = 5.00 e nota_maxima_questoes = 5.00, total máximo = 10.00.

REGRAS TÉCNICAS DO JSON:
- Escape aspas duplas internas com \\"
- Use \\n para quebras de linha
- Sem vírgulas pendentes no final de arrays/objetos
- Valide mentalmente a estrutura antes de retornar

SE FALTAR "TEXTO DA PROVA" OU "ESPELHO DA PROVA": retorne {"erro":"Blocos obrigatórios ausentes."}

FORMATO DE SAÍDA (schema estrito):
{
  "exameDescricao": "string",
  "inscricao": "string",
  "nomeExaminando": "string",
  "seccional": "string",
  "areaJuridica": "string",
  "notaFinal": "string",
  "situacao": "string",
  "pontosPeca": [{ "titulo": "string", "descricao": "Linhas XX-YY ...", "valor": "+0,XX" }],
  "subtotalPeca": "+X,XX pontos.",
  "pontosQuestoes": [{ "titulo": "string", "descricao": "Linhas XX-YY ...", "valor": "+0,XX" }],
  "subtotalQuestoes": "+X,XX pontos.",
  "conclusao": "string (1 parágrafo indicando se nota projetada ≥ 6,00)",
  "argumentacao": ["string (frase objetiva para recurso, citando Linhas XX-YY)"]
}
`.trim();

// ============================================================================
// CONFIG LOADER
// ============================================================================

interface AnalyzerConfig {
	model: string;
	systemPrompt: string;
	maxOutputTokens: number;
	temperature: number;
	provider: "OPENAI" | "GEMINI";
}

/**
 * Carrega configuração do agente Analista via Engine Híbrida.
 * Prioridade: Blueprint ANALISE_CELL → env fallback → defaults
 */
async function getAnalyzerConfig(selectedProvider?: "OPENAI" | "GEMINI"): Promise<AnalyzerConfig> {
	// 1) Blueprint vinculado à coluna ANALISE_CELL
	try {
		const blueprint = await getAgentBlueprintByLinkedColumn("ANALISE_CELL");

		if (blueprint) {
			const blueprintModel = blueprint.model || DEFAULT_MODELS_BY_PROVIDER.OPENAI;
			const blueprintProvider = isGeminiModel(blueprintModel) ? "GEMINI" : "OPENAI";

			// Se o provider selecionado pelo usuário difere do modelo do blueprint, trocar modelo
			const effectiveProvider = selectedProvider || blueprintProvider;
			const effectiveModel =
				effectiveProvider !== blueprintProvider
					? DEFAULT_MODELS_BY_PROVIDER[effectiveProvider] || blueprintModel
					: blueprintModel;

			// Montar system prompt: blueprint prompt + reforço interno
			const blueprintPrompt = (blueprint.systemPrompt || blueprint.instructions || "").toString().trim();
			const systemPrompt = blueprintPrompt
				? `${ANALYSIS_REINFORCEMENT_PROMPT}\n\n---\n\nINSTRUÇÕES DO BLUEPRINT:\n${blueprintPrompt}`
				: ANALYSIS_REINFORCEMENT_PROMPT;

			console.log(
				`[AnalysisAgent] ✅ Blueprint ANALISE_CELL encontrado: "${blueprint.name}" ` +
					`(modelo: ${effectiveModel}, provider: ${effectiveProvider})`,
			);

			return {
				model: effectiveModel,
				systemPrompt,
				maxOutputTokens: Number(blueprint.maxOutputTokens) || DEFAULT_MAX_OUTPUT_TOKENS,
				temperature: blueprint.temperature ?? DEFAULT_TEMPERATURE,
				provider: effectiveProvider as "OPENAI" | "GEMINI",
			};
		}
	} catch (err) {
		console.warn("[AnalysisAgent] Falha ao consultar blueprint por linkedColumn:", err);
	}

	// 2) Fallback por ID de env var
	try {
		const prisma = getPrismaInstance();
		const bpId = process.env.OAB_ANALYZER_BLUEPRINT_ID;
		let blueprint: any = null;
		if (bpId) {
			blueprint = await prisma.aiAgentBlueprint.findUnique({
				where: { id: bpId },
				select: { model: true, systemPrompt: true, instructions: true, maxOutputTokens: true, temperature: true },
			});
		}
		if (!bpId || !blueprint) {
			blueprint = await prisma.aiAgentBlueprint.findFirst({
				where: {
					OR: [
						{ name: { contains: "Análise", mode: "insensitive" } },
						{ name: { contains: "Analise", mode: "insensitive" } },
						{ name: { contains: "Analista", mode: "insensitive" } },
						{ name: { contains: "Analyzer", mode: "insensitive" } },
					],
				},
				orderBy: { updatedAt: "desc" },
				select: { model: true, systemPrompt: true, instructions: true, maxOutputTokens: true, temperature: true },
			});
		}

		if (blueprint) {
			const model = blueprint.model || DEFAULT_MODELS_BY_PROVIDER.OPENAI;
			const provider = isGeminiModel(model) ? "GEMINI" : "OPENAI";
			const effectiveProvider = selectedProvider || provider;
			const effectiveModel =
				effectiveProvider !== provider ? DEFAULT_MODELS_BY_PROVIDER[effectiveProvider] || model : model;

			const blueprintPrompt = (blueprint.systemPrompt || blueprint.instructions || "").toString().trim();
			const systemPrompt = blueprintPrompt
				? `${ANALYSIS_REINFORCEMENT_PROMPT}\n\n---\n\nINSTRUÇÕES DO BLUEPRINT:\n${blueprintPrompt}`
				: ANALYSIS_REINFORCEMENT_PROMPT;

			console.log(`[AnalysisAgent] ✅ Blueprint fallback encontrado (modelo: ${effectiveModel})`);
			return {
				model: effectiveModel,
				systemPrompt,
				maxOutputTokens: Number(blueprint.maxOutputTokens) || DEFAULT_MAX_OUTPUT_TOKENS,
				temperature: blueprint.temperature ?? DEFAULT_TEMPERATURE,
				provider: effectiveProvider as "OPENAI" | "GEMINI",
			};
		}
	} catch (err) {
		console.warn("[AnalysisAgent] Falha ao consultar blueprint fallback:", err);
	}

	// 3) Defaults hardcoded
	const finalProvider = selectedProvider || "OPENAI";
	console.log(`[AnalysisAgent] ⚠️ Nenhum blueprint encontrado, usando defaults (${finalProvider})`);
	return {
		model: DEFAULT_MODELS_BY_PROVIDER[finalProvider] || "gpt-5.2",
		systemPrompt: ANALYSIS_REINFORCEMENT_PROMPT,
		maxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS,
		temperature: DEFAULT_TEMPERATURE,
		provider: finalProvider as "OPENAI" | "GEMINI",
	};
}

// ============================================================================
// LLM EXECUTION
// ============================================================================

/**
 * Executa a análise via OpenAI Chat Completions
 */
async function executeOpenAI(userMessage: string, config: AnalyzerConfig): Promise<string> {
	console.log(`[AnalysisAgent] 🤖 Chamando OpenAI (${config.model})...`);

	const messages = [
		{ role: "system" as const, content: config.systemPrompt },
		{ role: "user" as const, content: userMessage },
	];

	if (IS_DEBUG) {
		console.log("\n" + "=".repeat(80));
		console.log("[AnalysisAgent] 🐛 DEBUG — PAYLOAD COMPLETO ENVIADO PARA OPENAI");
		console.log("=".repeat(80));
		console.log(`[DEBUG] Model: ${config.model}`);
		console.log(`[DEBUG] Temperature: ${config.temperature}`);
		console.log(`[DEBUG] Max Output Tokens: ${config.maxOutputTokens}`);
		console.log(`[DEBUG] Response Format: json_object`);
		console.log("-".repeat(80));
		console.log("[DEBUG] SYSTEM PROMPT:");
		console.log("-".repeat(80));
		console.log(config.systemPrompt);
		console.log("-".repeat(80));
		console.log("[DEBUG] USER MESSAGE:");
		console.log("-".repeat(80));
		console.log(userMessage);
		console.log("=".repeat(80) + "\n");
	}

	const response = await openai.chat.completions.create({
		model: config.model,
		temperature: config.temperature,
		max_completion_tokens: config.maxOutputTokens,
		messages,
		response_format: { type: "json_object" },
	});

	const text = response.choices[0]?.message?.content ?? "";
	console.log(
		`[AnalysisAgent] ✅ OpenAI respondeu (${text.length} chars, ` + `tokens: ${response.usage?.total_tokens ?? "?"})`,
	);

	if (IS_DEBUG) {
		console.log("\n" + "=".repeat(80));
		console.log("[AnalysisAgent] 🐛 DEBUG — RESPOSTA COMPLETA OPENAI");
		console.log("=".repeat(80));
		console.log(text);
		console.log("=".repeat(80) + "\n");
	}

	return text;
}

/**
 * Executa a análise via Gemini
 */
async function executeGemini(userMessage: string, config: AnalyzerConfig): Promise<string> {
	console.log(`[AnalysisAgent] 🤖 Chamando Gemini (${config.model})...`);

	const gemini = getGeminiClient();
	if (!gemini) {
		throw new Error("[AnalysisAgent] Gemini não disponível (GEMINI_API_KEY ausente). Fallback para OpenAI.");
	}

	if (IS_DEBUG) {
		console.log("\n" + "=".repeat(80));
		console.log("[AnalysisAgent] 🐛 DEBUG — PAYLOAD COMPLETO ENVIADO PARA GEMINI");
		console.log("=".repeat(80));
		console.log(`[DEBUG] Model: ${config.model}`);
		console.log(`[DEBUG] Temperature: ${config.temperature}`);
		console.log(`[DEBUG] Max Output Tokens: ${config.maxOutputTokens}`);
		console.log(`[DEBUG] Response Mime Type: application/json`);
		console.log("-".repeat(80));
		console.log("[DEBUG] SYSTEM INSTRUCTION:");
		console.log("-".repeat(80));
		console.log(config.systemPrompt);
		console.log("-".repeat(80));
		console.log("[DEBUG] USER MESSAGE (contents):");
		console.log("-".repeat(80));
		console.log(userMessage);
		console.log("=".repeat(80) + "\n");
	}

	const response = await gemini.models.generateContent({
		model: config.model,
		contents: userMessage,
		config: {
			systemInstruction: config.systemPrompt,
			temperature: config.temperature,
			maxOutputTokens: config.maxOutputTokens,
			responseMimeType: "application/json",
		},
	});

	const text = response.text ?? "";
	console.log(`[AnalysisAgent] ✅ Gemini respondeu (${text.length} chars)`);

	if (IS_DEBUG) {
		console.log("\n" + "=".repeat(80));
		console.log("[AnalysisAgent] 🐛 DEBUG — RESPOSTA COMPLETA GEMINI");
		console.log("=".repeat(80));
		console.log(text);
		console.log("=".repeat(80) + "\n");
	}

	return text;
}

// ============================================================================
// JSON PARSING & VALIDATION
// ============================================================================

/**
 * Extrai e valida JSON da resposta do LLM.
 * Tenta múltiplas estratégias de parsing para robustez.
 */
function parseAnalysisResponse(raw: string): AnalysisAgentOutput {
	let text = raw.trim();

	// Remover markdown code fences se presentes
	if (text.startsWith("```json")) {
		text = text.slice(7);
	} else if (text.startsWith("```")) {
		text = text.slice(3);
	}
	if (text.endsWith("```")) {
		text = text.slice(0, -3);
	}
	text = text.trim();

	// Tentar parse direto
	let parsed: any;
	try {
		parsed = JSON.parse(text);
	} catch {
		// Tentar extrair JSON de dentro do texto
		const jsonMatch = text.match(/\{[\s\S]*\}/);
		if (!jsonMatch) {
			throw new Error(`[AnalysisAgent] Resposta não contém JSON válido. Primeiros 200 chars: ${text.slice(0, 200)}`);
		}
		try {
			parsed = JSON.parse(jsonMatch[0]);
		} catch (innerErr) {
			throw new Error(`[AnalysisAgent] JSON extraído é inválido: ${(innerErr as Error).message}`);
		}
	}

	// Verificar erro retornado pelo agente
	if (parsed.erro) {
		throw new Error(`[AnalysisAgent] Agente retornou erro: ${parsed.erro}`);
	}

	// Validar campos obrigatórios com fallbacks amigáveis
	const result: AnalysisAgentOutput = {
		exameDescricao: parsed.exameDescricao || "",
		inscricao: parsed.inscricao || "",
		nomeExaminando: parsed.nomeExaminando || "",
		seccional: parsed.seccional || "",
		areaJuridica: parsed.areaJuridica || "",
		notaFinal: parsed.notaFinal || "",
		situacao: parsed.situacao || "",
		pontosPeca: Array.isArray(parsed.pontosPeca)
			? parsed.pontosPeca.map((p: any) => ({
					titulo: p.titulo || "",
					descricao: p.descricao || "",
					valor: p.valor || "+0,00",
				}))
			: [],
		subtotalPeca: parsed.subtotalPeca || "+0,00 pontos.",
		pontosQuestoes: Array.isArray(parsed.pontosQuestoes)
			? parsed.pontosQuestoes.map((p: any) => ({
					titulo: p.titulo || "",
					descricao: p.descricao || "",
					valor: p.valor || "+0,00",
				}))
			: [],
		subtotalQuestoes: parsed.subtotalQuestoes || "+0,00 pontos.",
		conclusao: parsed.conclusao || "",
		argumentacao: Array.isArray(parsed.argumentacao) ? parsed.argumentacao : [],
	};

	return result;
}

// ============================================================================
// MAIN EXPORT
// ============================================================================

/**
 * Executa a análise comparativa Prova × Espelho usando o blueprint vinculado.
 *
 * @param input - Dados de entrada com textos da prova e espelho
 * @returns Resultado estruturado da análise
 */
export async function runAnalysisAgent(input: AnalysisAgentInput): Promise<AnalysisResult> {
	const startTime = Date.now();
	const { leadId, textoProva, textoEspelho, selectedProvider, onProgress } = input;

	console.log(`[AnalysisAgent] 🔍 Iniciando análise para lead ${leadId}`);
	console.log(`[AnalysisAgent] 📏 Tamanhos: prova=${textoProva.length} chars, espelho=${textoEspelho.length} chars`);

	// Validar inputs
	if (!textoProva || textoProva.trim().length < 10) {
		return {
			leadId,
			success: false,
			error: "Texto da prova ausente ou muito curto.",
			model: "none",
			provider: "OPENAI",
			processingTimeMs: Date.now() - startTime,
		};
	}
	if (!textoEspelho || textoEspelho.trim().length < 10) {
		return {
			leadId,
			success: false,
			error: "Texto do espelho ausente ou muito curto.",
			model: "none",
			provider: "OPENAI",
			processingTimeMs: Date.now() - startTime,
		};
	}

	// 1) Carregar config do blueprint
	if (onProgress) await onProgress("Carregando configuração do agente...");
	const config = await getAnalyzerConfig(selectedProvider);

	// 2) Montar user message
	const userMessage = [
		"Texto da prova:",
		textoProva,
		"",
		"######FIM TEXTO DA PROVA#############",
		"",
		"Espelho da Prova:",
		textoEspelho,
	].join("\n");

	// 3) Executar LLM
	if (onProgress) await onProgress(`Analisando prova via ${config.provider} (${config.model})...`);

	let rawResponse: string;
	try {
		if (config.provider === "GEMINI") {
			try {
				rawResponse = await executeGemini(userMessage, config);
			} catch (geminiErr) {
				console.warn("[AnalysisAgent] ⚠️ Gemini falhou, tentando fallback para OpenAI:", (geminiErr as Error).message);
				const fallbackConfig: AnalyzerConfig = {
					...config,
					model: DEFAULT_MODELS_BY_PROVIDER.OPENAI,
					provider: "OPENAI",
				};
				rawResponse = await executeOpenAI(userMessage, fallbackConfig);
			}
		} else {
			rawResponse = await executeOpenAI(userMessage, config);
		}
	} catch (err) {
		const elapsed = Date.now() - startTime;
		console.error(`[AnalysisAgent] ❌ Erro na chamada LLM após ${(elapsed / 1000).toFixed(1)}s:`, err);
		return {
			leadId,
			success: false,
			error: (err as Error).message || "Erro desconhecido na chamada LLM",
			model: config.model,
			provider: config.provider,
			processingTimeMs: elapsed,
		};
	}

	// 4) Parse e validação
	if (onProgress) await onProgress("Processando resultado da análise...");

	try {
		const analysis = parseAnalysisResponse(rawResponse);
		const elapsed = Date.now() - startTime;

		console.log(
			`[AnalysisAgent] ✅ Análise concluída em ${(elapsed / 1000).toFixed(1)}s ` +
				`(${analysis.pontosPeca.length} pontos peça, ${analysis.pontosQuestoes.length} pontos questões)`,
		);

		return {
			leadId,
			success: true,
			analysis,
			rawResponse,
			model: config.model,
			provider: config.provider,
			processingTimeMs: elapsed,
		};
	} catch (parseErr) {
		const elapsed = Date.now() - startTime;
		console.error(`[AnalysisAgent] ❌ Erro ao parsear resposta:`, (parseErr as Error).message);
		console.error(`[AnalysisAgent] Raw response (primeiros 500 chars):`, rawResponse.slice(0, 500));
		return {
			leadId,
			success: false,
			rawResponse,
			error: (parseErr as Error).message,
			model: config.model,
			provider: config.provider,
			processingTimeMs: elapsed,
		};
	}
}

/**
 * Verifica se o agente interno de análise está habilitado via feature flag.
 */
export function isInternalAnalysisEnabled(): boolean {
	const flag = process.env.BLUEPRINT_ANALISE;
	return flag === "true" || flag === "1";
}
