/**
 * Retry + fallback utilities for OAB Eval AI calls (Vercel AI SDK).
 * Extracted from unified-vision-client.ts for reuse across rubric, mirror, etc.
 */

/** Status codes que devem ser retried (erros temporários) */
const RETRYABLE_STATUS_CODES = [429, 500, 502, 503, 504];

/** Número máximo de retries antes de fallback */
const MAX_RETRIES = 3;

/** Delays base em ms para cada retry: 2s → 4s → 10s */
const RETRY_DELAYS_MS = [2000, 4000, 10000];

/** Modelo OpenAI usado como fallback quando Gemini/Claude falha */
export const OPENAI_FALLBACK_MODEL = "gpt-4.1";

/** Timeout padrão por chamada de API (2 minutos) */
export const DEFAULT_API_TIMEOUT_MS = 120_000;

/** Regex para remover instruções técnicas do Gemini do prompt */
const GEMINI_INSTRUCTIONS_PATTERN = /\[INSTRUÇÕES TÉCNICAS DO MODELO - GEMINI.*?---\s*/s;

/** Adiciona jitter aleatório (±30%) ao delay para evitar thundering herd */
function addJitter(delayMs: number): number {
	const jitterFactor = 0.7 + Math.random() * 0.6; // 0.7 a 1.3
	return Math.round(delayMs * jitterFactor);
}

function buildRetryDelays(baseDelayMs: number, maxDelayMs: number, retries: number): number[] {
	return Array.from({ length: retries }, (_, index) => Math.min(baseDelayMs * 2 ** index, maxDelayMs));
}

interface RetryConfig {
	retries?: number;
	baseDelayMs?: number;
	maxDelayMs?: number;
}

/**
 * Executa uma função com retry automático para erros temporários.
 * Backoff com jitter: ~2s → ~4s → ~10s (3 retries antes de fallback).
 * Jitter evita thundering herd quando múltiplas páginas fazem retry simultâneo.
 */
export async function withRetry<T>(fn: () => Promise<T>, context: string, config?: RetryConfig): Promise<T> {
	let lastError: unknown;
	const retries = Math.max(0, config?.retries ?? MAX_RETRIES);
	const baseDelayMs = Math.max(250, config?.baseDelayMs ?? RETRY_DELAYS_MS[0] ?? 2000);
	const maxDelayMs = Math.max(baseDelayMs, config?.maxDelayMs ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1] ?? 10000);
	const retryDelays = buildRetryDelays(baseDelayMs, maxDelayMs, retries);

	for (let attempt = 1; attempt <= retries + 1; attempt++) {
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
				`[OAB::Retry] ${context} | attempt ${attempt}/${retries + 1}` +
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

			if (!isRetryable || attempt > retries) {
				throw error;
			}

			const baseDelay = retryDelays[attempt - 1] ?? retryDelays[retryDelays.length - 1] ?? baseDelayMs;
			const delay = addJitter(baseDelay);
			console.warn(`[OAB::Retry] ${context} retryable (${status}), retry ${attempt}/${retries} em ${delay}ms`);
			await new Promise((r) => setTimeout(r, delay));
		}
	}

	throw lastError;
}

/**
 * Cria um AbortSignal com timeout para chamadas de API.
 * Previne que chamadas pendurem indefinidamente quando o provider aceita mas não responde.
 */
export function createTimeoutSignal(timeoutMs: number = DEFAULT_API_TIMEOUT_MS): AbortSignal {
	return AbortSignal.timeout(timeoutMs);
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
