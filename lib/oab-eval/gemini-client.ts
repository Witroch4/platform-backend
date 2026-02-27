import { GoogleGenAI } from "@google/genai";

const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;

let geminiInstance: GoogleGenAI | null = null;

/**
 * Retorna instância singleton do cliente Gemini.
 * Não lança erro se a chave não existir - permite fallback para OpenAI.
 */
export function getGeminiClient(): GoogleGenAI | null {
	if (!apiKey) {
		return null;
	}

	if (!geminiInstance) {
		geminiInstance = new GoogleGenAI({ apiKey });
	}

	return geminiInstance;
}

/**
 * Verifica se o Gemini está disponível (API key configurada)
 */
export function isGeminiAvailable(): boolean {
	return !!apiKey;
}

/**
 * Lista de modelos Gemini suportados para visão
 * Ordenados do mais avançado para o mais básico
 */
export const GEMINI_VISION_MODELS = [
	// Gemini 3 - Mais avançados (2025)
	"gemini-3-pro-preview", // Melhor para código e raciocínio complexo
	"gemini-3-flash-preview", // Uso geral, multimodal
	// Gemini 2.5 - Alta performance
	"gemini-2.5-pro", // Pro com thinking nativo
	"gemini-2.5-flash", // Flash com thinking
	"gemini-2.5-flash-lite", // Baixa latência, alto volume
	// Gemini 2.0 - Estáveis
	"gemini-2.0-flash",
	"gemini-2.0-flash-lite",
	// Legacy (deprecated, não recomendado)
	"gemini-1.5-pro",
	"gemini-1.5-flash",
] as const;

export type GeminiVisionModel = (typeof GEMINI_VISION_MODELS)[number];

/**
 * Verifica se um modelo é do Gemini
 */
export function isGeminiModel(model: string): boolean {
	return model.toLowerCase().startsWith("gemini");
}
