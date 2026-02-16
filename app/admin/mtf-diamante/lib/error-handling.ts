// app/admin/mtf-diamante/lib/error-handling.ts
import { createLogger } from "@/lib/utils/logger";

const logger = createLogger("MTF-ErrorHandler");

export interface ApiError extends Error {
	status?: number;
	info?: any;
	code?: string;
	context?: string;
}

export interface ErrorLogData {
	message: string;
	status?: number;
	info?: any;
	code?: string;
	context?: string;
	key?: string;
	timestamp: string;
	userAgent?: string;
	url?: string;
}

/**
 * Enhanced error class for MTF operations
 */
export class MtfError extends Error implements ApiError {
	status?: number;
	info?: any;
	code?: string;
	context?: string;

	constructor(
		message: string,
		options: {
			status?: number;
			info?: any;
			code?: string;
			context?: string;
			cause?: Error;
		} = {},
	) {
		super(message);
		this.name = "MtfError";
		this.status = options.status;
		this.info = options.info;
		this.code = options.code;
		this.context = options.context;

		if (options.cause) {
			this.cause = options.cause;
		}
	}
}

/**
 * Structured error logging with context
 */
export function logError(
	error: ApiError,
	context: {
		key?: string;
		operation?: string;
		userId?: string;
		inboxId?: string;
		additionalData?: any;
	} = {},
) {
	const errorData: ErrorLogData = {
		message: error.message,
		status: error.status,
		info: error.info,
		code: error.code,
		context: error.context || context.operation,
		key: context.key,
		timestamp: new Date().toISOString(),
		userAgent: typeof window !== "undefined" ? window.navigator.userAgent : undefined,
		url: typeof window !== "undefined" ? window.location.href : undefined,
	};

	// Enhanced logging with context
	logger.error("API Error occurred", {
		...errorData,
		userId: context.userId,
		inboxId: context.inboxId,
		additionalData: context.additionalData,
	});

	// In production, send to external monitoring service
	if (process.env.NODE_ENV === "production") {
		// Example integrations:
		// - Sentry: Sentry.captureException(error, { contexts: { mtf: errorData } });
		// - LogRocket: LogRocket.captureException(error);
		// - Custom analytics: analytics.track('MTF Error', errorData);

		// For now, we'll just log to console in a structured way
		console.error("[MTF Production Error]", JSON.stringify(errorData, null, 2));
	}
}

/**
 * Determines if an error should trigger a retry
 */
export function shouldRetryError(error: ApiError): boolean {
	// Don't retry on client errors (4xx) except for specific cases
	if (error.status && error.status >= 400 && error.status < 500) {
		// Retry on 408 (Request Timeout) and 429 (Too Many Requests)
		return error.status === 408 || error.status === 429;
	}

	// Retry on network errors (no status) and server errors (5xx)
	return !error.status || error.status >= 500;
}

/**
 * Calculates retry delay with exponential backoff
 */
export function getRetryDelay(retryCount: number, baseDelay: number = 1000): number {
	// Exponential backoff with jitter
	const exponentialDelay = baseDelay * Math.pow(2, retryCount);
	const jitter = Math.random() * 0.1 * exponentialDelay; // 10% jitter

	// Cap at 30 seconds
	return Math.min(exponentialDelay + jitter, 30000);
}

/**
 * Enhanced fetch wrapper with error handling
 */
export async function fetchWithErrorHandling(
	url: string,
	options: RequestInit = {},
	context: { operation?: string; retryCount?: number } = {},
): Promise<Response> {
	try {
		const response = await fetch(url, {
			...options,
			headers: {
				"Content-Type": "application/json",
				...options.headers,
			},
		});

		if (!response.ok) {
			let errorInfo: any = {};

			try {
				errorInfo = await response.json();
			} catch {
				// If response is not JSON, use status text
				errorInfo = { message: response.statusText };
			}

			const error = new MtfError(
				errorInfo.error || errorInfo.message || `HTTP ${response.status}: ${response.statusText}`,
				{
					status: response.status,
					info: errorInfo,
					code: errorInfo.code,
					context: context.operation,
				},
			);

			throw error;
		}

		return response;
	} catch (error) {
		// If it's already our custom error, just re-throw
		if (error instanceof MtfError) {
			throw error;
		}

		// Wrap other errors (network errors, etc.)
		throw new MtfError(error instanceof Error ? error.message : "Erro de rede desconhecido", {
			context: context.operation,
			cause: error instanceof Error ? error : undefined,
		});
	}
}

/**
 * User-friendly error messages for common scenarios
 */
export function getUserFriendlyErrorMessage(error: ApiError): string {
	// Network errors
	if (!error.status) {
		return "Erro de conexão. Verifique sua internet e tente novamente.";
	}

	// Client errors
	if (error.status >= 400 && error.status < 500) {
		switch (error.status) {
			case 400:
				return "Dados inválidos. Verifique as informações e tente novamente.";
			case 401:
				return "Sessão expirada. Faça login novamente.";
			case 403:
				return "Você não tem permissão para realizar esta ação.";
			case 404:
				return "Recurso não encontrado.";
			case 409:
				return "Conflito de dados. Atualize a página e tente novamente.";
			case 422:
				return "Dados inválidos. Verifique os campos obrigatórios.";
			case 429:
				return "Muitas tentativas. Aguarde um momento e tente novamente.";
			default:
				return error.message || "Erro na solicitação.";
		}
	}

	// Server errors
	if (error.status >= 500) {
		return "Erro interno do servidor. Tente novamente em alguns instantes.";
	}

	// Fallback
	return error.message || "Erro desconhecido. Tente novamente.";
}

/**
 * Toast notification helper for errors (to be used with shadcn/ui toast)
 */
export function createErrorToast(error: ApiError) {
	const userMessage = getUserFriendlyErrorMessage(error);

	return {
		title: "Erro",
		description: userMessage,
		variant: "destructive" as const,
		duration: error.status && error.status >= 500 ? 5000 : 3000, // Longer duration for server errors
	};
}

/**
 * Success toast helper
 */
export function createSuccessToast(message: string) {
	return {
		title: "Sucesso",
		description: message,
		variant: "default" as const,
		duration: 2000,
	};
}
