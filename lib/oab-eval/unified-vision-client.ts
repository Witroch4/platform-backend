/**
 * Cliente unificado de Vision AI - suporta OpenAI e Gemini
 *
 * Detecta automaticamente o provedor baseado no modelo selecionado:
 * - Modelos começando com "gemini" → Google Gemini API
 * - Outros modelos (gpt-4.1, etc) → OpenAI API
 */

import { openai } from "./openai-client";
import { getGeminiClient, isGeminiModel, isGeminiAvailable } from "./gemini-client";

// ===== RETRY E FALLBACK CONFIGURATION =====

/** Status codes que devem ser retried (erros temporários) */
const RETRYABLE_STATUS_CODES = [429, 500, 502, 503, 504];

/** Número máximo de retries antes de fallback */
const MAX_RETRIES = 4;

/** Delay base em ms (exponential backoff: 2s, 4s, 8s, 16s) */
const BASE_DELAY_MS = 2000;

/** Modelo OpenAI usado como fallback quando Gemini falha */
const OPENAI_FALLBACK_MODEL = "gpt-4.1";

/** Regex para remover instruções técnicas do Gemini do prompt */
const GEMINI_INSTRUCTIONS_PATTERN = /\[INSTRUÇÕES TÉCNICAS DO MODELO - GEMINI.*?---\s*/s;

/**
 * Executa uma função com retry automático para erros temporários
 * Usa exponential backoff: 2s → 4s → 8s → 16s
 */
async function withRetry<T>(fn: () => Promise<T>, context: string): Promise<T> {
	let lastError: any;

	for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
		try {
			return await fn();
		} catch (error: any) {
			lastError = error;
			const status = error?.status || error?.response?.status;
			const isRetryable = RETRYABLE_STATUS_CODES.includes(status);

			if (!isRetryable || attempt > MAX_RETRIES) {
				throw error;
			}

			// Exponential backoff: 2s, 4s, 8s, 16s
			const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
			console.log(`[UnifiedVision] ⚠️ ${context} falhou (${status}), retry ${attempt}/${MAX_RETRIES} em ${delay}ms`);
			await new Promise((r) => setTimeout(r, delay));
		}
	}

	throw lastError;
}

/**
 * Remove instruções específicas do Gemini do system prompt
 * CRÍTICO: Evita confundir o GPT com referências a code_execution, etc.
 */
function cleanPromptForOpenAI(systemInstructions: string): string {
	// Remove bloco completo de instruções técnicas do Gemini Agentic Vision
	let cleaned = systemInstructions.replace(GEMINI_INSTRUCTIONS_PATTERN, "");

	// Remove referências específicas que podem confundir o GPT
	cleaned = cleaned
		.replace(/code_execution/gi, "")
		.replace(/execução de código Python/gi, "")
		.replace(/ferramenta 'code_ex[^']*'/gi, "")
		.replace(/Gemini 3 Agentic Vision/gi, "")
		.replace(/GEMINI_AGENTIC_VISION/gi, "")
		.replace(/\s+/g, " ") // Normaliza espaços
		.trim();

	return cleaned;
}

// Tipo para nível de raciocínio do Gemini 3 (deve ser minúsculo para o SDK)
export type GeminiThinkingLevel = "minimal" | "low" | "medium" | "high";

export interface VisionRequest {
	model: string;
	systemInstructions: string;
	userPrompt: string;
	imageBase64: string;
	imageMimeType?: string;
	maxOutputTokens?: number;
	temperature?: number;
	// Gemini 3 Agentic Vision options
	enableCodeExecution?: boolean;
	thinkingLevel?: GeminiThinkingLevel;
	includeThoughts?: boolean;
}

export interface VisionResponse {
	text: string;
	provider: "openai" | "gemini";
	model: string;
	usage?: {
		inputTokens?: number;
		outputTokens?: number;
		totalTokens?: number;
	};
}

/**
 * Processa uma imagem com Vision AI (OpenAI ou Gemini)
 * Inclui retry automático (4x) e fallback Gemini → OpenAI
 */
export async function processVisionRequest(request: VisionRequest): Promise<VisionResponse> {
	const { model } = request;

	// Gemini: usa retry + fallback para OpenAI se falhar
	if (isGeminiModel(model)) {
		return processWithGeminiWithFallback(request);
	}

	// OpenAI: usa apenas retry (sem fallback)
	return withRetry(() => processWithOpenAI(request), "OpenAI");
}

/**
 * Processa com OpenAI Vision API
 */
async function processWithOpenAI(request: VisionRequest): Promise<VisionResponse> {
	const { model, systemInstructions, userPrompt, imageBase64, imageMimeType, maxOutputTokens } = request;

	const imageUrl = `data:${imageMimeType ?? "image/png"};base64,${imageBase64}`;

	const response = await openai.responses.create({
		model,
		instructions: systemInstructions,
		// 0 = ilimitado (omitir parâmetro para usar padrão máximo do modelo)
		...(maxOutputTokens && maxOutputTokens > 0 && { max_output_tokens: maxOutputTokens }),
		input: [
			{
				role: "user",
				content: [
					{ type: "input_text", text: userPrompt },
					{ type: "input_image", image_url: imageUrl, detail: "high" },
				],
			},
		],
	});

	// Extrair uso de tokens se disponível
	const usage = (response as any)?.usage;

	return {
		text: extractOpenAIOutputText(response),
		provider: "openai",
		model,
		usage: usage
			? {
				inputTokens: usage.input_tokens ?? usage.prompt_tokens,
				outputTokens: usage.output_tokens ?? usage.completion_tokens,
				totalTokens: usage.total_tokens,
			}
			: undefined,
	};
}

/**
 * Verifica se é um modelo Gemini 3 (suporta Agentic Vision)
 */
function isGemini3Model(model: string): boolean {
	return model.toLowerCase().includes("gemini-3");
}

function isGemini25Model(model: string): boolean {
	return model.toLowerCase().includes("gemini-2.5");
}

/**
 * Mapeia thinkingLevel string para thinkingBudget numérico (Gemini 2.5)
 * Gemini 2.5 usa thinkingBudget em vez de thinkingLevel
 */
function thinkingLevelToBudget(level: string | undefined): number {
	switch (level?.toUpperCase()) {
		case "MINIMAL":
		case "LOW":
			return 1024;
		case "MEDIUM":
			return 8192;
		case "HIGH":
		default:
			return 24576;
	}
}

/**
 * Processa com Google Gemini Vision API
 * Suporta Gemini 3 Agentic Vision com code execution e thinking
 */
async function processWithGemini(request: VisionRequest): Promise<VisionResponse> {
	const {
		model,
		systemInstructions,
		userPrompt,
		imageBase64,
		imageMimeType,
		maxOutputTokens,
		temperature,
		enableCodeExecution,
		thinkingLevel,
		includeThoughts,
	} = request;

	const gemini = getGeminiClient();
	if (!gemini) {
		throw new Error("Gemini API não configurada. Defina GOOGLE_GENERATIVE_AI_API_KEY, GEMINI_API_KEY ou GOOGLE_AI_API_KEY no ambiente.");
	}

	// Configurar tools — Code Execution apenas para Gemini 3+ (2.5 Flash tenta pytesseract e falha)
	const tools: Array<Record<string, unknown>> = [];
	if (isGemini3Model(model) || (enableCodeExecution && isGemini3Model(model))) {
		tools.push({ codeExecution: {} });
	}

	// Configurar thinking: Gemini 3 usa thinkingLevel, Gemini 2.5 usa thinkingBudget
	const thinkingConfig = isGemini3Model(model)
		? {
			thinkingConfig: {
				includeThoughts: includeThoughts ?? false,
				thinkingLevel: thinkingLevel ?? "HIGH",
			},
		}
		: isGemini25Model(model)
			? {
				thinkingConfig: {
					thinkingBudget: thinkingLevelToBudget(thinkingLevel),
				},
			}
			: {};

	// Cast para contornar problemas de compatibilidade de tipos com versões do SDK
	const config = {
		systemInstruction: systemInstructions,
		// 0 = ilimitado (omitir parâmetro para usar padrão máximo do modelo)
		...(maxOutputTokens && maxOutputTokens > 0 && { maxOutputTokens }),
		...(temperature !== undefined && { temperature }),
		...(tools.length > 0 && { tools }),
		...thinkingConfig,
	} as any;

	const response = await gemini.models.generateContent({
		model,
		contents: [
			{
				inlineData: {
					mimeType: imageMimeType ?? "image/png",
					data: imageBase64,
				},
			},
			userPrompt,
		],
		config,
	});

	const text = response.text ?? "";
	const usage = response.usageMetadata;

	// Log se usou code execution (para debugging)
	if (isGemini3Model(model) && (response as any).codeExecutionResult) {
		console.log("[UnifiedVision] 🔬 Gemini 3 usou code execution para análise de imagem");
	}

	return {
		text,
		provider: "gemini",
		model,
		usage: usage
			? {
				inputTokens: usage.promptTokenCount,
				outputTokens: usage.candidatesTokenCount,
				totalTokens: usage.totalTokenCount,
			}
			: undefined,
	};
}

/**
 * Processa com Gemini + retry + fallback para OpenAI
 * Se Gemini falhar após 4 retries, usa gpt-4.1 com prompt limpo
 */
async function processWithGeminiWithFallback(request: VisionRequest): Promise<VisionResponse> {
	try {
		return await withRetry(() => processWithGemini(request), "Gemini");
	} catch (error: any) {
		const status = error?.status || error?.response?.status || "unknown";
		console.log(
			`[UnifiedVision] 🔄 Gemini falhou após ${MAX_RETRIES} retries (${status}), usando fallback OpenAI (${OPENAI_FALLBACK_MODEL})`,
		);

		// LIMPEZA DE PROMPT CRÍTICA
		// Removemos instruções específicas de code_execution do Gemini para não confundir o GPT
		const cleanedInstructions = cleanPromptForOpenAI(request.systemInstructions);

		console.log("[UnifiedVision] 🧹 Prompt limpo para OpenAI (removidas instruções Gemini-específicas)");

		return processWithOpenAI({
			...request,
			model: OPENAI_FALLBACK_MODEL,
			systemInstructions: cleanedInstructions,
			// Desabilitar opções específicas do Gemini
			enableCodeExecution: false,
			thinkingLevel: undefined,
		});
	}
}

/**
 * Processa múltiplas imagens com Vision AI (OpenAI ou Gemini)
 */
export async function processMultiImageVisionRequest(request: {
	model: string;
	systemInstructions: string;
	userPrompt: string;
	images: Array<{ base64: string; mimeType?: string }>;
	maxOutputTokens?: number;
	temperature?: number;
}): Promise<VisionResponse> {
	const { model, systemInstructions, userPrompt, images, maxOutputTokens, temperature } = request;

	if (isGeminiModel(model)) {
		return processMultiImageWithGemini(request);
	}

	return processMultiImageWithOpenAI(request);
}

/**
 * Processa múltiplas imagens com OpenAI
 */
async function processMultiImageWithOpenAI(request: {
	model: string;
	systemInstructions: string;
	userPrompt: string;
	images: Array<{ base64: string; mimeType?: string }>;
	maxOutputTokens?: number;
}): Promise<VisionResponse> {
	const { model, systemInstructions, userPrompt, images, maxOutputTokens } = request;

	const imageContents = images.map((img) => ({
		type: "input_image" as const,
		image_url: `data:${img.mimeType ?? "image/png"};base64,${img.base64}`,
		detail: "high" as const,
	}));

	const response = await openai.responses.create({
		model,
		instructions: systemInstructions,
		// 0 = ilimitado (omitir parâmetro para usar padrão máximo do modelo)
		...(maxOutputTokens && maxOutputTokens > 0 && { max_output_tokens: maxOutputTokens }),
		input: [
			{
				role: "user",
				content: [{ type: "input_text", text: userPrompt }, ...imageContents],
			},
		],
	});

	return {
		text: extractOpenAIOutputText(response),
		provider: "openai",
		model,
	};
}

/**
 * Processa múltiplas imagens com Gemini
 * Suporta Gemini 3 Agentic Vision com code execution e thinking
 */
async function processMultiImageWithGemini(request: {
	model: string;
	systemInstructions: string;
	userPrompt: string;
	images: Array<{ base64: string; mimeType?: string }>;
	maxOutputTokens?: number;
	temperature?: number;
	enableCodeExecution?: boolean;
	thinkingLevel?: GeminiThinkingLevel;
}): Promise<VisionResponse> {
	const {
		model,
		systemInstructions,
		userPrompt,
		images,
		maxOutputTokens,
		temperature,
		enableCodeExecution,
		thinkingLevel,
	} = request;

	const gemini = getGeminiClient();
	if (!gemini) {
		throw new Error("Gemini API não configurada. Defina GOOGLE_GENERATIVE_AI_API_KEY, GEMINI_API_KEY ou GOOGLE_AI_API_KEY no ambiente.");
	}

	const imageContents = images.map((img) => ({
		inlineData: {
			mimeType: img.mimeType ?? "image/png",
			data: img.base64,
		},
	}));

	// Configurar tools — Code Execution apenas para Gemini 3+
	const tools: Array<Record<string, unknown>> = [];
	if (isGemini3Model(model)) {
		tools.push({ codeExecution: {} });
	}

	// Configurar thinking: Gemini 3 usa thinkingLevel, Gemini 2.5 usa thinkingBudget
	const thinkingConfig = isGemini3Model(model)
		? {
			thinkingConfig: {
				includeThoughts: false,
				thinkingLevel: thinkingLevel ?? "HIGH",
			},
		}
		: isGemini25Model(model)
			? {
				thinkingConfig: {
					thinkingBudget: thinkingLevelToBudget(thinkingLevel),
				},
			}
			: {};

	// Cast para contornar problemas de compatibilidade de tipos com versões do SDK
	const config = {
		systemInstruction: systemInstructions,
		// 0 = ilimitado (omitir parâmetro para usar padrão máximo do modelo)
		...(maxOutputTokens && maxOutputTokens > 0 && { maxOutputTokens }),
		...(temperature !== undefined && { temperature }),
		...(tools.length > 0 && { tools }),
		...thinkingConfig,
	} as any;

	const response = await gemini.models.generateContent({
		model,
		contents: [...imageContents, userPrompt],
		config,
	});

	const text = response.text ?? "";
	const usage = response.usageMetadata;

	if (isGemini3Model(model) && (response as any).codeExecutionResult) {
		console.log("[UnifiedVision] 🔬 Gemini 3 usou code execution para análise de múltiplas imagens");
	}

	return {
		text,
		provider: "gemini",
		model,
		usage: usage
			? {
				inputTokens: usage.promptTokenCount,
				outputTokens: usage.candidatesTokenCount,
				totalTokens: usage.totalTokenCount,
			}
			: undefined,
	};
}

/**
 * Processa múltiplas imagens via URL (Gemini suporta URL direta)
 * Suporta Gemini 3 Agentic Vision com code execution e thinking
 */
export async function processMultiImageUrlVisionRequest(request: {
	model: string;
	systemInstructions: string;
	userPrompt: string;
	imageUrls: string[];
	maxOutputTokens?: number;
	temperature?: number;
	enableCodeExecution?: boolean;
	thinkingLevel?: GeminiThinkingLevel;
}): Promise<VisionResponse> {
	const { model } = request;

	// Gemini suporta URLs diretas, OpenAI precisa de base64
	if (isGeminiModel(model)) {
		return processMultiImageUrlWithGemini(request);
	}

	// Para OpenAI, mantemos compatibilidade com o código existente
	return processMultiImageUrlWithOpenAI(request);
}

/**
 * Processa múltiplas imagens via URL com OpenAI
 */
async function processMultiImageUrlWithOpenAI(request: {
	model: string;
	systemInstructions: string;
	userPrompt: string;
	imageUrls: string[];
	maxOutputTokens?: number;
}): Promise<VisionResponse> {
	const { model, systemInstructions, userPrompt, imageUrls, maxOutputTokens } = request;

	const imageContents = imageUrls.map((url) => ({
		type: "input_image" as const,
		image_url: url,
		detail: "high" as const,
	}));

	const response = await openai.responses.create({
		model,
		instructions: systemInstructions,
		// 0 = ilimitado (omitir parâmetro para usar padrão máximo do modelo)
		...(maxOutputTokens && maxOutputTokens > 0 && { max_output_tokens: maxOutputTokens }),
		input: [
			{
				role: "user",
				content: [{ type: "input_text", text: userPrompt }, ...imageContents],
			},
		],
	});

	return {
		text: extractOpenAIOutputText(response),
		provider: "openai",
		model,
	};
}

/**
 * Processa múltiplas imagens via URL com Gemini
 * Suporta Gemini 3 Agentic Vision com code execution e thinking
 */
async function processMultiImageUrlWithGemini(request: {
	model: string;
	systemInstructions: string;
	userPrompt: string;
	imageUrls: string[];
	maxOutputTokens?: number;
	temperature?: number;
	enableCodeExecution?: boolean;
	thinkingLevel?: GeminiThinkingLevel;
}): Promise<VisionResponse> {
	const {
		model,
		systemInstructions,
		userPrompt,
		imageUrls,
		maxOutputTokens,
		temperature,
		enableCodeExecution,
		thinkingLevel,
	} = request;

	const gemini = getGeminiClient();
	if (!gemini) {
		throw new Error("Gemini API não configurada. Defina GOOGLE_GENERATIVE_AI_API_KEY, GEMINI_API_KEY ou GOOGLE_AI_API_KEY no ambiente.");
	}

	// Gemini aceita URLs HTTP/HTTPS diretamente
	const imageContents = imageUrls.map((url) => ({
		fileData: {
			mimeType: "image/png",
			fileUri: url,
		},
	}));

	// Configurar tools — Code Execution apenas para Gemini 3+
	const tools: Array<Record<string, unknown>> = [];
	if (isGemini3Model(model)) {
		tools.push({ codeExecution: {} });
	}

	// Configurar thinking: Gemini 3 usa thinkingLevel, Gemini 2.5 usa thinkingBudget
	const thinkingConfig = isGemini3Model(model)
		? {
			thinkingConfig: {
				includeThoughts: false,
				thinkingLevel: thinkingLevel ?? "HIGH",
			},
		}
		: isGemini25Model(model)
			? {
				thinkingConfig: {
					thinkingBudget: thinkingLevelToBudget(thinkingLevel),
				},
			}
			: {};

	// Config com cast para evitar incompatibilidade de tipos do SDK
	const config = {
		systemInstruction: systemInstructions,
		// 0 = ilimitado (omitir parâmetro para usar padrão máximo do modelo)
		...(maxOutputTokens && maxOutputTokens > 0 && { maxOutputTokens }),
		...(temperature !== undefined && { temperature }),
		...(tools.length > 0 && { tools }),
		...thinkingConfig,
	} as any;

	const response = await gemini.models.generateContent({
		model,
		contents: [...imageContents, userPrompt],
		config,
	});

	const text = response.text ?? "";
	const usage = response.usageMetadata;

	if (isGemini3Model(model) && (response as any).codeExecutionResult) {
		console.log("[UnifiedVision] 🔬 Gemini 3 usou code execution para análise de imagens via URL");
	}

	return {
		text,
		provider: "gemini",
		model,
		usage: usage
			? {
				inputTokens: usage.promptTokenCount,
				outputTokens: usage.candidatesTokenCount,
				totalTokens: usage.totalTokenCount,
			}
			: undefined,
	};
}

/**
 * Extrai texto de resposta OpenAI
 */
function extractOpenAIOutputText(response: unknown): string {
	const outputText = (response as any)?.output_text;
	if (typeof outputText === "string" && outputText.trim()) {
		return outputText.trim();
	}

	const outputItems = (response as any)?.output;
	if (Array.isArray(outputItems)) {
		const texts: string[] = [];
		for (const item of outputItems) {
			const content = (item as any)?.content;
			if (Array.isArray(content)) {
				for (const part of content) {
					const text = (part as any)?.text;
					if (typeof text === "string" && text.trim()) {
						texts.push(text.trim());
					}
				}
			} else {
				const text = (item as any)?.text;
				if (typeof text === "string" && text.trim()) {
					texts.push(text.trim());
				}
			}
		}
		return texts.join("\n").trim();
	}

	return "";
}

/**
 * Lista todos os modelos de visão disponíveis
 * Ordenados do mais avançado para o mais básico
 */
export function getAvailableVisionModels(): Array<{ id: string; name: string; provider: string; tier: string }> {
	const models: Array<{ id: string; name: string; provider: string; tier: string }> = [
		// OpenAI Models
		{ id: "gpt-4.1", name: "GPT-4.1 (Vision)", provider: "openai", tier: "pro" },
		{ id: "gpt-4.1-mini", name: "GPT-4.1 Mini (Vision)", provider: "openai", tier: "standard" },
		{ id: "gpt-4.1-nano", name: "GPT-4.1 Nano (Vision)", provider: "openai", tier: "lite" },
		{ id: "gpt-4o", name: "GPT-4o (Vision)", provider: "openai", tier: "pro" },
		{ id: "gpt-4o-mini", name: "GPT-4o Mini (Vision)", provider: "openai", tier: "standard" },
	];

	// Adicionar modelos Gemini se disponível
	if (isGeminiAvailable()) {
		models.push(
			// Gemini 3 - Mais avançados (RECOMENDADOS)
			{
				id: "gemini-3-pro-preview",
				name: "Gemini 3 Pro Preview (Mais Avançado)",
				provider: "gemini",
				tier: "flagship",
			},
			{ id: "gemini-3-flash-preview", name: "Gemini 3 Flash Preview", provider: "gemini", tier: "pro" },
			// Gemini 2.5 - Alta performance
			{ id: "gemini-2.5-pro", name: "Gemini 2.5 Pro (Thinking)", provider: "gemini", tier: "pro" },
			{ id: "gemini-2.5-flash", name: "Gemini 2.5 Flash (Thinking)", provider: "gemini", tier: "standard" },
			{ id: "gemini-2.5-flash-lite", name: "Gemini 2.5 Flash Lite", provider: "gemini", tier: "lite" },
			// Gemini 2.0 - Estáveis
			{ id: "gemini-2.0-flash", name: "Gemini 2.0 Flash", provider: "gemini", tier: "standard" },
			{ id: "gemini-2.0-flash-lite", name: "Gemini 2.0 Flash Lite", provider: "gemini", tier: "lite" },
		);
	}

	return models;
}

export { isGeminiModel, isGeminiAvailable };
