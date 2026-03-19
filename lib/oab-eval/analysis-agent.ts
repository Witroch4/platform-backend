/**
 * Analysis Agent — Blueprint-based Análise Comparativa (Prova × Espelho)
 *
 * Compara a transcrição da prova manuscrita com o espelho de correção
 * para identificar acertos não pontuados pela banca OAB.
 *
 * Usa Vercel AI SDK generateObject (mesmo padrão do recurso-generator-agent).
 * Suporta OpenAI, Gemini e Claude via Engine Híbrida (blueprint → provider switch).
 *
 * Feature flag: BLUEPRINT_ANALISE=true (se false/ausente → fluxo externo n8n)
 */

import { getAgentBlueprintByLinkedColumn, isGeminiModel } from "@/lib/ai-agents/blueprints";
import { buildSdkSchema } from "@/lib/ai-agents/schema-utils";
import { generateObject, type LanguageModel } from "ai";
import { createModel, buildProviderOptions } from "@/lib/socialwise-flow/services/ai-provider-factory";
import { getPrismaInstance } from "@/lib/connections";
import { createLogger } from "@/lib/utils/logger";
import { combineAbortSignals } from "./operation-control";
import { resolveOabRuntimePolicy } from "./runtime-policy";

const log = createLogger("AnalysisAgent");

// ============================================================================
// TYPES
// ============================================================================

export interface AnalysisAgentInput {
	leadId: string;
	textoProva: string;
	textoEspelho: string;
	selectedProvider?: "OPENAI" | "GEMINI" | "CLAUDE";
	onProgress?: (message: string) => Promise<void>;
	abortSignal?: AbortSignal;
}

export interface AnalysisPontoItem {
	titulo: string;
	descricao: string;
	valor: string;
	/** Gabarito real da banca — injetado via código a partir do espelho, nunca gerado por LLM */
	gabarito_banca?: string;
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
	provider: "OPENAI" | "GEMINI" | "CLAUDE";
	processingTimeMs: number;
}

// ============================================================================
// DEFAULT MODELS
// ============================================================================

const DEFAULT_MODELS_BY_PROVIDER: Record<string, string> = {
	OPENAI: "gpt-5.2",
	GEMINI: "gemini-2.5-flash",
	CLAUDE: "claude-3-5-sonnet-latest",
};

const DEFAULT_MAX_OUTPUT_TOKENS = 16384;
const DEFAULT_TEMPERATURE = 0;


// ============================================================================
// SYSTEM PROMPT — Reinforcement Layer
// ============================================================================

/**
 * Camada interna de reforço do prompt.
 * Garante comportamento robusto independente do prompt do blueprint.
 */
const ANALYSIS_REINFORCEMENT_PROMPT = `
[REFORÇO INTERNO — GUARDRAILS OBRIGATÓRIOS]

Você é um ANALISTA JURÍDICO ESPECIALIZADO em provas da OAB (2ª Fase).

REGRAS ABSOLUTAS (sobrescrevem qualquer instrução conflitante):
1. APENAS ACERTOS EXISTENTES: Aponte somente o que o aluno de FATO escreveu e não foi contabilizado. Cite sempre "Linhas XX-YY".
2. PROIBIDO SUGERIR MELHORIAS: O examinando NÃO pode reescrever a prova. Zero sugestões de redação.
3. PROIBIDO ULTRAPASSAR TETO: Nunca atribua mais pontos do que o máximo previsto no espelho.
4. VERIFICAR DUPLA PONTUAÇÃO: Antes de atribuir pontos, confirme que o aluno ainda NÃO recebeu aquela pontuação.
5. ANÁLISE COMPLETA: Analise SEMPRE tanto a Peça Profissional quanto TODAS as Questões. Nunca pule seções.
6. nota_maxima_peca = 5.00 e nota_maxima_questoes = 5.00, total máximo = 10.00.
`.trim();

// ============================================================================
// DEFAULT ANALYSIS SCHEMA — Fallback when blueprint has no outputParser
// ============================================================================

const DEFAULT_ANALYSIS_SCHEMA = {
	type: "object" as const,
	properties: {
		exameDescricao: { type: "string", description: "Descrição do exame (ex: '42º Exame de Ordem Unificado - 2ª Fase')" },
		inscricao: { type: "string", description: "Número de inscrição do examinando" },
		nomeExaminando: { type: "string", description: "Nome completo do examinando" },
		seccional: { type: "string", description: "Seccional OAB (ex: 'SP', 'RJ')" },
		areaJuridica: { type: "string", description: "Área jurídica da prova (ex: 'Direito Tributário')" },
		notaFinal: { type: "string", description: "Nota final original atribuída pela banca (ex: '4,75')" },
		situacao: { type: "string", description: "Situação do examinando (ex: 'REPROVADO', 'APROVADO')" },
		pontosPeca: {
			type: "array",
			description: "Pontos identificados na peça profissional que merecem recurso",
			items: {
				type: "object",
				properties: {
					titulo: { type: "string", description: "Identificador do quesito (ex: 'Quesito PECA-07')" },
					descricao: { type: "string", description: "Descrição detalhada com referência a linhas (ex: 'Linhas 61-64: O examinando...')" },
					valor: { type: "string", description: "Valor em pontos a ser majorado (ex: '+0,80')" },
				},
				required: ["titulo", "descricao", "valor"],
				additionalProperties: false,
			},
		},
		subtotalPeca: { type: "string", description: "Subtotal de pontos a majorar na peça (ex: '+1,60 pontos.')" },
		pontosQuestoes: {
			type: "array",
			description: "Pontos identificados nas questões discursivas que merecem recurso",
			items: {
				type: "object",
				properties: {
					titulo: { type: "string", description: "Identificador do item (ex: 'Questão 4 - Item B')" },
					descricao: { type: "string", description: "Descrição detalhada com referência a linhas" },
					valor: { type: "string", description: "Valor em pontos a ser majorado (ex: '+0,65')" },
				},
				required: ["titulo", "descricao", "valor"],
				additionalProperties: false,
			},
		},
		subtotalQuestoes: { type: "string", description: "Subtotal de pontos a majorar nas questões (ex: '+1,30 pontos.')" },
		conclusao: { type: "string", description: "Conclusão indicando se nota projetada atinge ou ultrapassa 6,00" },
		argumentacao: {
			type: "array",
			description: "Lista de frases objetivas para recurso, cada uma citando Linhas XX-YY",
			items: { type: "string" },
		},
	},
	required: [
		"exameDescricao",
		"inscricao",
		"nomeExaminando",
		"seccional",
		"areaJuridica",
		"notaFinal",
		"situacao",
		"pontosPeca",
		"subtotalPeca",
		"pontosQuestoes",
		"subtotalQuestoes",
		"conclusao",
		"argumentacao",
	],
	additionalProperties: false,
};

// ============================================================================
// CONFIG LOADER
// ============================================================================

interface AnalyzerConfig {
	model: string;
	systemPrompt: string;
	maxOutputTokens: number;
	temperature: number;
	provider: "OPENAI" | "GEMINI" | "CLAUDE";
	schemaDefinition: string;
	schemaStrict: boolean;
	reasoningEffort?: string;
	metadata?: Record<string, unknown> | null;
}

/**
 * Resolve provider from model string
 */
function resolveProvider(model: string): "OPENAI" | "GEMINI" | "CLAUDE" {
	if (isGeminiModel(model)) return "GEMINI";
	if (model.startsWith("claude")) return "CLAUDE";
	return "OPENAI";
}

/**
 * Carrega configuração do agente Analista via Engine Híbrida.
 * Prioridade: Blueprint ANALISE_CELL → env fallback → defaults
 */
async function getAnalyzerConfig(selectedProvider?: "OPENAI" | "GEMINI" | "CLAUDE"): Promise<AnalyzerConfig> {
	const defaultSchemaStr = JSON.stringify(DEFAULT_ANALYSIS_SCHEMA);

	// 1) Blueprint vinculado à coluna ANALISE_CELL
	try {
		const blueprint = await getAgentBlueprintByLinkedColumn("ANALISE_CELL");

		if (blueprint) {
			const blueprintModel = blueprint.model || DEFAULT_MODELS_BY_PROVIDER.OPENAI;
			const blueprintProvider = resolveProvider(blueprintModel);

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

			// Recuperar schema do outputParser (configurado pelo front)
			let schemaDefinition = defaultSchemaStr;
			let schemaStrict = true;

			if (blueprint.outputParser?.schemaType === "json_schema" && blueprint.outputParser.schema) {
				schemaDefinition = blueprint.outputParser.schema;
				schemaStrict = blueprint.outputParser.strict ?? true;
			}

			log.info("Blueprint ANALISE_CELL encontrado", { blueprint: blueprint.name, model: effectiveModel, provider: effectiveProvider });

			return {
				model: effectiveModel,
				systemPrompt,
				maxOutputTokens: Number(blueprint.maxOutputTokens) || DEFAULT_MAX_OUTPUT_TOKENS,
				temperature: blueprint.temperature ?? DEFAULT_TEMPERATURE,
				provider: effectiveProvider as "OPENAI" | "GEMINI" | "CLAUDE",
				schemaDefinition,
				schemaStrict,
				reasoningEffort: blueprint.reasoningEffort || blueprint.thinkingLevel || undefined,
				metadata: blueprint.metadata ?? null,
			};
		}
	} catch (err) {
		log.warn("Falha ao consultar blueprint por linkedColumn", err as Error);
	}

	// 2) Fallback por ID de env var
	try {
		const prisma = getPrismaInstance();
		const bpId = process.env.OAB_ANALYZER_BLUEPRINT_ID;
		let blueprint: any = null;
		if (bpId) {
			blueprint = await prisma.aiAgentBlueprint.findUnique({
				where: { id: bpId },
				select: { model: true, systemPrompt: true, instructions: true, maxOutputTokens: true, temperature: true, outputParser: true, reasoningEffort: true, thinkingLevel: true, metadata: true },
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
				select: { model: true, systemPrompt: true, instructions: true, maxOutputTokens: true, temperature: true, outputParser: true, reasoningEffort: true, thinkingLevel: true, metadata: true },
			});
		}

		if (blueprint) {
			const model = blueprint.model || DEFAULT_MODELS_BY_PROVIDER.OPENAI;
			const provider = resolveProvider(model);
			const effectiveProvider = selectedProvider || provider;
			const effectiveModel =
				effectiveProvider !== provider ? DEFAULT_MODELS_BY_PROVIDER[effectiveProvider] || model : model;

			const blueprintPrompt = (blueprint.systemPrompt || blueprint.instructions || "").toString().trim();
			const systemPrompt = blueprintPrompt
				? `${ANALYSIS_REINFORCEMENT_PROMPT}\n\n---\n\nINSTRUÇÕES DO BLUEPRINT:\n${blueprintPrompt}`
				: ANALYSIS_REINFORCEMENT_PROMPT;

			let schemaDefinition = defaultSchemaStr;
			let schemaStrict = true;

			if (blueprint.outputParser?.schemaType === "json_schema" && blueprint.outputParser.schema) {
				schemaDefinition = blueprint.outputParser.schema;
				schemaStrict = blueprint.outputParser.strict ?? true;
			}

			log.info("Blueprint fallback encontrado", { model: effectiveModel });
			return {
				model: effectiveModel,
				systemPrompt,
				maxOutputTokens: Number(blueprint.maxOutputTokens) || DEFAULT_MAX_OUTPUT_TOKENS,
				temperature: blueprint.temperature ?? DEFAULT_TEMPERATURE,
				provider: effectiveProvider as "OPENAI" | "GEMINI" | "CLAUDE",
				schemaDefinition,
				schemaStrict,
				reasoningEffort: blueprint.reasoningEffort || blueprint.thinkingLevel || undefined,
				metadata: blueprint.metadata ?? null,
			};
		}
	} catch (err) {
		log.warn("Falha ao consultar blueprint fallback", err as Error);
	}

	// 3) Defaults hardcoded
	const finalProvider = selectedProvider || "OPENAI";
	log.warn("Nenhum blueprint encontrado, usando defaults", { provider: finalProvider });
	return {
		model: DEFAULT_MODELS_BY_PROVIDER[finalProvider] || "gpt-5.2",
		systemPrompt: ANALYSIS_REINFORCEMENT_PROMPT,
		maxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS,
		temperature: DEFAULT_TEMPERATURE,
		provider: finalProvider as "OPENAI" | "GEMINI" | "CLAUDE",
		schemaDefinition: defaultSchemaStr,
		schemaStrict: true,
		metadata: null,
	};
}

// ============================================================================
// SCHEMA BUILDER
// ============================================================================

// buildSdkSchema importado de @/lib/ai-agents/schema-utils
// Suporta auto-conversão de formato simplificado → JSON Schema válido

// ============================================================================
// JSON PARSING & VALIDATION (Safety Net)
// ============================================================================

// ============================================================================
// GABARITO INJECTION — Deterministic post-processing
// ============================================================================

interface EspelhoItem {
	id: string;
	descricao: string;
	nota_maxima?: number | null;
	nota_obtida?: number | null;
	subitens?: EspelhoItem[];
}

/**
 * Parseia o textoEspelho (JSON stringificado do StudentMirrorPayload ou OptimizedMirrorPayload)
 * e retorna um Map<normalizedId, descricao> para lookup determinístico.
 *
 * Normaliza IDs: "PECA-07" / "Quesito PECA-07" / "peca-07" → "peca-07"
 */
function buildGabaritoMap(textoEspelho: string): Map<string, string> {
	const map = new Map<string, string>();

	try {
		const parsed = typeof textoEspelho === "string" ? JSON.parse(textoEspelho) : textoEspelho;
		const itens: EspelhoItem[] = parsed?.itens ?? [];

		function addItem(item: EspelhoItem) {
			if (item.id && item.descricao) {
				map.set(normalizeItemId(item.id), item.descricao);
			}
			if (item.subitens) {
				for (const sub of item.subitens) {
					addItem(sub);
				}
			}
		}

		for (const item of itens) {
			addItem(item);
		}
	} catch {
		log.warn("Não foi possível parsear textoEspelho para extração de gabarito");
	}

	return map;
}

/**
 * Normaliza um ID de item para matching.
 * "Quesito PECA-07" → "peca-07"
 * "Questão 4 - Item B" → "q4-b"
 * "PECA-07" → "peca-07"
 */
function normalizeItemId(raw: string): string {
	return raw
		.toLowerCase()
		.replace(/^(quesito|questão|questao)\s+/i, "")
		.replace(/\s*-\s*item\s+/i, "-")
		.replace(/\s+/g, "-")
		.trim();
}

/**
 * Injeta gabarito_banca real nos pontos da análise via match determinístico.
 * Usa o titulo do ponto (gerado pelo LLM) para encontrar o item correspondente no espelho.
 */
function injectGabaritoBanca(pontos: AnalysisPontoItem[], gabaritoMap: Map<string, string>): AnalysisPontoItem[] {
	if (gabaritoMap.size === 0) return pontos;

	return pontos.map((ponto) => {
		const normalizedTitulo = normalizeItemId(ponto.titulo);

		// Tentar match exato primeiro
		let gabarito = gabaritoMap.get(normalizedTitulo);

		// Tentar match parcial: procurar se algum ID do espelho está contido no titulo
		if (!gabarito) {
			for (const [id, desc] of gabaritoMap) {
				if (normalizedTitulo.includes(id) || id.includes(normalizedTitulo)) {
					gabarito = desc;
					break;
				}
			}
		}

		if (gabarito) {
			return { ...ponto, gabarito_banca: gabarito };
		}

		log.warn("Gabarito não encontrado para titulo", { titulo: ponto.titulo, normalized: normalizedTitulo });
		return ponto;
	});
}

/**
 * Normaliza o objeto retornado pelo generateObject para garantir
 * que todos os campos de AnalysisAgentOutput existam com valores seguros.
 * Funciona como safety net caso o schema do front omita algum campo.
 */
function normalizeAnalysisOutput(parsed: any): AnalysisAgentOutput {
	// Verificar erro retornado pelo agente
	if (parsed.erro) {
		throw new Error(`[AnalysisAgent] Agente retornou erro: ${parsed.erro}`);
	}

	return {
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
	const { leadId, selectedProvider, onProgress } = input;
	const textoProva = input.textoProva ?? "";
	const textoEspelho = input.textoEspelho ?? "";

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

	log.info("Iniciando análise", { leadId, provaChars: textoProva.length, espelhoChars: textoEspelho.length });

	// 1) Carregar config do blueprint
	if (onProgress) await onProgress("Carregando configuração do agente...");
	const config = await getAnalyzerConfig(selectedProvider);
	const runtimePolicy = resolveOabRuntimePolicy({
		stage: "analysis",
		provider: config.provider,
		metadata: config.metadata,
		explicitMaxOutputTokens: config.maxOutputTokens,
	});
	const abortSignal = combineAbortSignals([input.abortSignal, AbortSignal.timeout(runtimePolicy.timeoutMs)]);

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

	// 3) Build SDK schema
	let sdkSchema;
	try {
		sdkSchema = buildSdkSchema(config.schemaDefinition, "[AnalysisAgent]");
	} catch (schemaErr) {
		log.error("Erro ao instanciar Schema do Blueprint", schemaErr as Error);
		log.warn("Usando DEFAULT_ANALYSIS_SCHEMA como fallback");
		sdkSchema = buildSdkSchema(JSON.stringify(DEFAULT_ANALYSIS_SCHEMA), "[AnalysisAgent]");
	}

	// 4) Executar LLM via Vercel AI SDK generateObject
	if (onProgress) await onProgress(`Analisando prova via ${config.provider} (${config.model})...`);

	// Reasoning models (GPT-5.x, Gemini 3.x) ignoram temperature — não enviar para evitar warnings
	const isReasoningModel =
		config.model.toLowerCase().includes("gpt-5") || config.model.startsWith("gemini-3");

	log.debug("LLM request payload", {
		model: config.model,
		provider: config.provider,
		temperature: isReasoningModel ? "N/A (reasoning)" : config.temperature,
		reasoningEffort: config.reasoningEffort || "default",
		maxOutputTokens: runtimePolicy.maxOutputTokens,
		timeoutMs: runtimePolicy.timeoutMs,
		systemPromptChars: config.systemPrompt.length,
		userMessageChars: userMessage.length,
		schemaChars: config.schemaDefinition.length,
		...(process.env.NODE_ENV !== "production"
			? {
				systemPrompt: config.systemPrompt,
				userMessage,
				schema: config.schemaDefinition,
			}
			: {}),
	});

	try {
		const aiModel: LanguageModel = createModel(config.provider, config.model);
		const providerOptions = buildProviderOptions(config.provider, config.model, {
			reasoningEffort: config.reasoningEffort,
		});

		const { object, usage } = await generateObject({
			model: aiModel,
			schema: sdkSchema,
			system: config.systemPrompt,
			prompt: userMessage,
			...(isReasoningModel ? {} : { temperature: config.temperature }),
			maxOutputTokens: runtimePolicy.maxOutputTokens,
			providerOptions,
			maxRetries: 0,
			abortSignal,
		});

		const elapsed = Date.now() - startTime;

		log.debug("LLM response (raw)", process.env.NODE_ENV !== "production"
			? { response: JSON.stringify(object) }
			: { responseChars: JSON.stringify(object).length });

		// Normalizar resultado (safety net para campos faltantes)
		if (onProgress) await onProgress("Processando resultado da análise...");
		const analysis = normalizeAnalysisOutput(object);

		// ⭐ INJEÇÃO DETERMINÍSTICA: Gabarito real da banca via código (sem depender do LLM)
		const gabaritoMap = buildGabaritoMap(textoEspelho);
		if (gabaritoMap.size > 0) {
			analysis.pontosPeca = injectGabaritoBanca(analysis.pontosPeca, gabaritoMap);
			analysis.pontosQuestoes = injectGabaritoBanca(analysis.pontosQuestoes, gabaritoMap);
			log.info("Gabarito injetado via código", { itensEspelho: gabaritoMap.size, pontoPecaComGabarito: analysis.pontosPeca.filter(p => p.gabarito_banca).length, pontoQuestaoComGabarito: analysis.pontosQuestoes.filter(p => p.gabarito_banca).length });
		} else {
			log.warn("Nenhum gabarito extraído do espelho — recurso não terá gabarito_banca");
		}

		log.info("Análise concluída", {
			leadId,
			elapsedMs: elapsed,
			pontosPeca: analysis.pontosPeca.length,
			pontosQuestoes: analysis.pontosQuestoes.length,
			tokens: usage?.totalTokens ?? "?",
			model: config.model,
			provider: config.provider,
		});

		return {
			leadId,
			success: true,
			analysis,
			rawResponse: JSON.stringify(object),
			model: config.model,
			provider: config.provider,
			processingTimeMs: elapsed,
		};
	} catch (err: any) {
		const elapsed = Date.now() - startTime;
		log.error("Erro na chamada LLM", { leadId, elapsedMs: elapsed }, err);
		return {
			leadId,
			success: false,
			error: err.message || "Erro desconhecido na chamada LLM",
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
