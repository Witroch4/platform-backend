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
import { generateObject, type LanguageModel, jsonSchema } from "ai";
import { createModel, buildProviderOptions } from "@/lib/socialwise-flow/services/ai-provider-factory";
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
	selectedProvider?: "OPENAI" | "GEMINI" | "CLAUDE";
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
Sua missão: comparar "TEXTO DA PROVA" × "ESPELHO DA PROVA" e identificar acertos do examinando que NÃO foram pontuados pela banca seja OTIMISTA se faltar poucos pontos pra media de 6 veja um agumneto provavel para alcançar os 6 pts tudo ajuda vamos tesntar achar esses 6pts do aluno.

REGRAS ABSOLUTAS (sobrescrevem qualquer instrução conflitante):
1. OTIMISMO FUNDAMENTADO: A banca frequentemente erra. Analise com viés favorável ao examinando, mas NUNCA invente pontos inexistentes.
2. APENAS ACERTOS EXISTENTES: Aponte somente o que o aluno de FATO escreveu e não foi contabilizado. Cite sempre "Linhas XX-YY".
3. PROIBIDO SUGERIR MELHORIAS: O examinando NÃO pode reescrever a prova. Zero sugestões de redação.
4. PROIBIDO ULTRAPASSAR TETO: Nunca atribua mais pontos do que o máximo previsto no espelho.
5. VERIFICAR DUPLA PONTUAÇÃO: Antes de atribuir pontos, confirme que o aluno ainda NÃO recebeu aquela pontuação.
6. SAÍDA EXCLUSIVAMENTE JSON: Sua resposta DEVE começar com { e terminar com }. NENHUM texto fora do JSON.
7. ANÁLISE COMPLETA: Analise SEMPRE tanto a Peça Profissional quanto TODAS as Questões. Nunca pule seções.
8. nota_maxima_peca = 5.00 e nota_maxima_questoes = 5.00, total máximo = 10.00.

O schema de saída é controlado automaticamente pelo sistema. Siga-o rigorosamente.
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

			console.log(
				`[AnalysisAgent] ✅ Blueprint ANALISE_CELL encontrado: "${blueprint.name}" ` +
					`(modelo: ${effectiveModel}, provider: ${effectiveProvider})`,
			);

			return {
				model: effectiveModel,
				systemPrompt,
				maxOutputTokens: Number(blueprint.maxOutputTokens) || DEFAULT_MAX_OUTPUT_TOKENS,
				temperature: blueprint.temperature ?? DEFAULT_TEMPERATURE,
				provider: effectiveProvider as "OPENAI" | "GEMINI" | "CLAUDE",
				schemaDefinition,
				schemaStrict,
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
				select: { model: true, systemPrompt: true, instructions: true, maxOutputTokens: true, temperature: true, outputParser: true },
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
				select: { model: true, systemPrompt: true, instructions: true, maxOutputTokens: true, temperature: true, outputParser: true },
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

			console.log(`[AnalysisAgent] ✅ Blueprint fallback encontrado (modelo: ${effectiveModel})`);
			return {
				model: effectiveModel,
				systemPrompt,
				maxOutputTokens: Number(blueprint.maxOutputTokens) || DEFAULT_MAX_OUTPUT_TOKENS,
				temperature: blueprint.temperature ?? DEFAULT_TEMPERATURE,
				provider: effectiveProvider as "OPENAI" | "GEMINI" | "CLAUDE",
				schemaDefinition,
				schemaStrict,
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
		provider: finalProvider as "OPENAI" | "GEMINI" | "CLAUDE",
		schemaDefinition: defaultSchemaStr,
		schemaStrict: true,
	};
}

// ============================================================================
// SCHEMA BUILDER
// ============================================================================

/**
 * Converte a schemaDefinition (string JSON) em um jsonSchema do Vercel AI SDK.
 * Enforce additionalProperties: false em todos os objetos (exigido por OpenAI structured outputs).
 */
function buildSdkSchema(schemaDefinition: string) {
	const parsedSchemaObj = JSON.parse(schemaDefinition);

	const enforceAdditionalProperties = (node: Record<string, any>) => {
		if (!node || typeof node !== "object") return;
		if (node.type === "object" && node.additionalProperties === undefined) {
			node.additionalProperties = false;
		}
		if (node.properties) {
			for (const val of Object.values(node.properties)) {
				enforceAdditionalProperties(val as Record<string, any>);
			}
		}
		if (node.items) enforceAdditionalProperties(node.items);
	};

	enforceAdditionalProperties(parsedSchemaObj);
	return jsonSchema(parsedSchemaObj);
}

// ============================================================================
// JSON PARSING & VALIDATION (Safety Net)
// ============================================================================

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

	// 3) Build SDK schema
	let sdkSchema;
	try {
		sdkSchema = buildSdkSchema(config.schemaDefinition);
	} catch (schemaErr) {
		console.error("[AnalysisAgent] Erro ao instanciar Schema do Blueprint. Verifique o JSON:", schemaErr);
		// Fallback to default schema
		console.warn("[AnalysisAgent] ⚠️ Usando DEFAULT_ANALYSIS_SCHEMA como fallback");
		sdkSchema = buildSdkSchema(JSON.stringify(DEFAULT_ANALYSIS_SCHEMA));
	}

	// 4) Executar LLM via Vercel AI SDK generateObject
	if (onProgress) await onProgress(`Analisando prova via ${config.provider} (${config.model})...`);

	if (IS_DEBUG) {
		console.log("\n" + "=".repeat(80));
		console.log("[AnalysisAgent] 🐛 DEBUG — PAYLOAD COMPLETO");
		console.log("=".repeat(80));
		console.log(`[DEBUG] Model: ${config.model} (${config.provider})`);
		console.log(`[DEBUG] Temperature: ${config.temperature}`);
		console.log(`[DEBUG] Max Output Tokens: ${config.maxOutputTokens}`);
		console.log("-".repeat(80));
		console.log("[DEBUG] SYSTEM PROMPT:");
		console.log("-".repeat(80));
		console.log(config.systemPrompt);
		console.log("-".repeat(80));
		console.log("[DEBUG] USER MESSAGE:");
		console.log("-".repeat(80));
		console.log(userMessage);
		console.log("-".repeat(80));
		console.log("[DEBUG] SCHEMA:");
		console.log("-".repeat(80));
		console.log(config.schemaDefinition);
		console.log("=".repeat(80) + "\n");
	}

	try {
		const aiModel: LanguageModel = createModel(config.provider, config.model);
		const providerOptions = buildProviderOptions(config.provider, config.model, {});

		const { object, usage } = await generateObject({
			model: aiModel,
			schema: sdkSchema,
			system: config.systemPrompt,
			prompt: userMessage,
			temperature: config.temperature,
			providerOptions,
		});

		const elapsed = Date.now() - startTime;

		if (IS_DEBUG) {
			console.log("\n" + "=".repeat(80));
			console.log("[AnalysisAgent] 🐛 DEBUG — RESPOSTA ESTRUTURADA");
			console.log("=".repeat(80));
			console.log(JSON.stringify(object, null, 2));
			console.log("=".repeat(80) + "\n");
		}

		// Normalizar resultado (safety net para campos faltantes)
		if (onProgress) await onProgress("Processando resultado da análise...");
		const analysis = normalizeAnalysisOutput(object);

		console.log(
			`[AnalysisAgent] ✅ Análise concluída em ${(elapsed / 1000).toFixed(1)}s ` +
				`(${analysis.pontosPeca.length} pontos peça, ${analysis.pontosQuestoes.length} pontos questões, ` +
				`tokens: ${usage?.totalTokens ?? "?"})`,
		);

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
		console.error(`[AnalysisAgent] ❌ Erro na chamada LLM após ${(elapsed / 1000).toFixed(1)}s:`, err);
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
