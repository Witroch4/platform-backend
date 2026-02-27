/**
 * Retry + fallback utilities for OAB Eval AI calls (Vercel AI SDK).
 * Extracted from unified-vision-client.ts for reuse across rubric, mirror, etc.
 */

/** Status codes que devem ser retried (erros temporários) */
const RETRYABLE_STATUS_CODES = [429, 500, 502, 503, 504];

/** Número máximo de retries antes de fallback */
const MAX_RETRIES = 3;

/** Delays fixos em ms para cada retry: 2s → 4s → 10s */
const RETRY_DELAYS_MS = [2000, 4000, 10000];

/** Modelo OpenAI usado como fallback quando Gemini/Claude falha */
export const OPENAI_FALLBACK_MODEL = "gpt-4.1";

/** Regex para remover instruções técnicas do Gemini do prompt */
const GEMINI_INSTRUCTIONS_PATTERN = /\[INSTRUÇÕES TÉCNICAS DO MODELO - GEMINI.*?---\s*/s;

/**
 * Executa uma função com retry automático para erros temporários.
 * Backoff fixo: 2s → 8s → 15s (3 retries antes de fallback).
 */
export async function withRetry<T>(fn: () => Promise<T>, context: string): Promise<T> {
	let lastError: unknown;

	for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
		try {
			return await fn();
		} catch (error: any) {
			lastError = error;
			const status = error?.status || error?.response?.status;
			const errorCode = error?.code || error?.error?.code;
			const errorType = error?.error?.type || error?.type;
			const isRetryable = RETRYABLE_STATUS_CODES.includes(status);

			// Log detalhado do erro para diagnóstico
			console.warn(
				`[OAB::Retry] ${context} | attempt ${attempt}/${MAX_RETRIES + 1}` +
				` | status: ${status ?? "N/A"}` +
				` | code: ${errorCode ?? "N/A"}` +
				` | type: ${errorType ?? "N/A"}` +
				` | message: ${error?.message?.substring(0, 200) ?? "N/A"}`,
			);

			// Timeouts e aborts não melhoram com retry — fail fast para fallback
			const isTimeout = error?.code === "ETIMEDOUT" || error?.name === "AbortError"
				|| error?.message?.includes("timeout") || error?.message?.includes("ECONNRESET");
			if (isTimeout) {
				console.warn(`[OAB::Retry] ${context} timeout/abort — skipping retries para fallback rápido`);
				throw error;
			}

			if (!isRetryable || attempt > MAX_RETRIES) {
				throw error;
			}

			const delay = RETRY_DELAYS_MS[attempt - 1] ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1];
			console.warn(`[OAB::Retry] ${context} retryable (${status}), retry ${attempt}/${MAX_RETRIES} em ${delay}ms`);
			await new Promise((r) => setTimeout(r, delay));
		}
	}

	throw lastError;
}

/**
 * Remove instruções específicas do Gemini do system prompt.
 * CRÍTICO: Evita confundir o GPT com referências a code_execution, etc.
 */
export function cleanPromptForOpenAI(systemInstructions: string): string {
	let cleaned = systemInstructions.replace(GEMINI_INSTRUCTIONS_PATTERN, "");

	cleaned = cleaned
		.replace(/code_execution/gi, "")
		.replace(/execução de código Python/gi, "")
		.replace(/ferramenta 'code_ex[^']*'/gi, "")
		.replace(/Gemini 3 Agentic Vision/gi, "")
		.replace(/GEMINI_AGENTIC_VISION/gi, "")
		.replace(/\s+/g, " ")
		.trim();

	return cleaned;
}
