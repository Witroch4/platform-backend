/**
 * Retry Classification Matrix
 *
 * Implements the final retry decision matrix with detailed logging
 * and comprehensive error classification for Chatwit API calls.
 */

import log from "@/lib/log";
import { AxiosError } from "axios";
import { ChatwitApiError } from "../types/chatwit-api";

export interface RetryDecision {
	shouldRetry: boolean;
	delay: number;
	reason: string;
	classification: "no_retry" | "rate_limit" | "server_error" | "network_error";
	maxRetries: number;
	currentAttempt: number;
}

export interface RetryContext {
	conversationId: number;
	accountId: number;
	traceId: string;
	currentAttempt: number;
	maxRetries: number;
	originalError: Error;
	startTime: number;
}

export interface RetryStats {
	totalRequests: number;
	retriedRequests: number;
	successAfterRetry: number;
	exhaustedRetries: number;
	byStatusCode: Record<number, number>;
	byClassification: Record<string, number>;
	averageRetryDelay: number;
}

export class RetryClassifier {
	private readonly baseDelay = 1000; // 1 second
	private readonly maxDelay = 8000; // 8 seconds
	private readonly defaultMaxRetries = 3;

	// Retry classification matrix as per requirements
	private readonly retryMatrix = {
		// No retry - client errors
		noRetry: [400, 401, 403, 409],

		// Rate limiting - special handling
		rateLimit: [429],

		// Server errors - exponential backoff
		serverError: [500, 502, 503, 504],

		// Network errors - exponential backoff
		networkError: ["ECONNREFUSED", "ENOTFOUND", "ETIMEDOUT", "ECONNRESET", "timeout"],
	};

	/**
	 * Classify error and determine retry strategy
	 */
	classifyAndDecide(context: RetryContext): RetryDecision {
		const error = context.originalError;
		const statusCode = this.extractStatusCode(error);
		const errorType = this.classifyError(error, statusCode);

		const decision = this.makeRetryDecision(errorType, statusCode, context);

		// Log the retry decision
		this.logRetryDecision(context, decision, statusCode);

		return decision;
	}

	/**
	 * Make retry decision based on error classification
	 */
	private makeRetryDecision(
		errorType: "no_retry" | "rate_limit" | "server_error" | "network_error",
		statusCode: number,
		context: RetryContext,
	): RetryDecision {
		const baseDecision = {
			currentAttempt: context.currentAttempt,
			maxRetries: context.maxRetries,
		};

		switch (errorType) {
			case "no_retry":
				return {
					...baseDecision,
					shouldRetry: false,
					delay: 0,
					reason: `Non-retryable client error: ${statusCode}`,
					classification: "no_retry",
				};

			case "rate_limit":
				return this.handleRateLimitRetry(context, statusCode);

			case "server_error":
				return this.handleServerErrorRetry(context, statusCode);

			case "network_error":
				return this.handleNetworkErrorRetry(context);

			default:
				return {
					...baseDecision,
					shouldRetry: false,
					delay: 0,
					reason: `Unknown error type: ${errorType}`,
					classification: "no_retry",
				};
		}
	}

	/**
	 * Handle rate limit retry (429 status)
	 */
	private handleRateLimitRetry(context: RetryContext, statusCode: number): RetryDecision {
		if (context.currentAttempt >= 3) {
			return {
				shouldRetry: false,
				delay: 0,
				reason: "Rate limit retries exhausted (3 attempts)",
				classification: "rate_limit",
				maxRetries: 3,
				currentAttempt: context.currentAttempt,
			};
		}

		// Try to extract Retry-After header
		const retryAfter = this.extractRetryAfter(context.originalError);
		const delay = retryAfter || 5000; // Default 5s if no Retry-After header

		return {
			shouldRetry: true,
			delay: Math.min(delay, this.maxDelay),
			reason: `Rate limited, retry after ${delay}ms (attempt ${context.currentAttempt + 1}/3)`,
			classification: "rate_limit",
			maxRetries: 3,
			currentAttempt: context.currentAttempt,
		};
	}

	/**
	 * Handle server error retry (5xx status)
	 */
	private handleServerErrorRetry(context: RetryContext, statusCode: number): RetryDecision {
		if (context.currentAttempt >= 3) {
			return {
				shouldRetry: false,
				delay: 0,
				reason: "Server error retries exhausted (3 attempts)",
				classification: "server_error",
				maxRetries: 3,
				currentAttempt: context.currentAttempt,
			};
		}

		// Exponential backoff: 1s, 2s, 4s
		const delay = Math.min(this.baseDelay * Math.pow(2, context.currentAttempt), this.maxDelay);

		return {
			shouldRetry: true,
			delay,
			reason: `Server error ${statusCode}, exponential backoff: ${delay}ms (attempt ${context.currentAttempt + 1}/3)`,
			classification: "server_error",
			maxRetries: 3,
			currentAttempt: context.currentAttempt,
		};
	}

	/**
	 * Handle network error retry
	 */
	private handleNetworkErrorRetry(context: RetryContext): RetryDecision {
		if (context.currentAttempt >= 3) {
			return {
				shouldRetry: false,
				delay: 0,
				reason: "Network error retries exhausted (3 attempts)",
				classification: "network_error",
				maxRetries: 3,
				currentAttempt: context.currentAttempt,
			};
		}

		// Exponential backoff: 1s, 2s, 4s
		const delay = Math.min(this.baseDelay * Math.pow(2, context.currentAttempt), this.maxDelay);

		return {
			shouldRetry: true,
			delay,
			reason: `Network error, exponential backoff: ${delay}ms (attempt ${context.currentAttempt + 1}/3)`,
			classification: "network_error",
			maxRetries: 3,
			currentAttempt: context.currentAttempt,
		};
	}

	/**
	 * Classify error type based on status code and error details
	 */
	private classifyError(
		error: Error,
		statusCode: number,
	): "no_retry" | "rate_limit" | "server_error" | "network_error" {
		// Check for specific status codes
		if (this.retryMatrix.noRetry.includes(statusCode)) {
			return "no_retry";
		}

		if (this.retryMatrix.rateLimit.includes(statusCode)) {
			return "rate_limit";
		}

		if (this.retryMatrix.serverError.includes(statusCode)) {
			return "server_error";
		}

		// Check for network errors
		const errorMessage = error.message.toLowerCase();
		const isNetworkError = this.retryMatrix.networkError.some((code) => errorMessage.includes(code.toLowerCase()));

		if (isNetworkError || statusCode === 0) {
			return "network_error";
		}

		// Default to no retry for unknown errors
		return "no_retry";
	}

	/**
	 * Extract status code from error
	 */
	private extractStatusCode(error: Error): number {
		if (this.isAxiosError(error)) {
			return error.response?.status || 0;
		}
		return 0;
	}

	/**
	 * Extract Retry-After header value
	 */
	private extractRetryAfter(error: Error): number | null {
		if (this.isAxiosError(error)) {
			const retryAfter = error.response?.headers["retry-after"];
			if (retryAfter) {
				const seconds = parseInt(retryAfter, 10);
				return isNaN(seconds) ? null : seconds * 1000; // Convert to milliseconds
			}
		}
		return null;
	}

	/**
	 * Check if error is an Axios error
	 */
	private isAxiosError(error: Error): error is AxiosError<ChatwitApiError> {
		return "isAxiosError" in error && error.isAxiosError === true;
	}

	/**
	 * Log retry decision with detailed context
	 */
	private logRetryDecision(context: RetryContext, decision: RetryDecision, statusCode: number): void {
		const logData = {
			conversationId: context.conversationId,
			accountId: context.accountId,
			traceId: context.traceId,
			statusCode,
			classification: decision.classification,
			shouldRetry: decision.shouldRetry,
			delay: decision.delay,
			currentAttempt: context.currentAttempt,
			maxRetries: context.maxRetries,
			deliver_retry_reason: decision.reason,
			errorMessage: context.originalError.message,
			totalElapsed: Date.now() - context.startTime,
		};

		if (decision.shouldRetry) {
			log.info("Retry decision: will retry", logData);
		} else {
			log.warn("Retry decision: no retry", logData);
		}

		// Emit metrics for monitoring
		this.emitRetryMetrics(context, decision, statusCode);
	}

	/**
	 * Emit retry metrics for monitoring
	 */
	private emitRetryMetrics(context: RetryContext, decision: RetryDecision, statusCode: number): void {
		// TODO: Implement actual metrics emission
		// prometheus.incrementCounter('ai_chatwit_retry_decisions_total', {
		//   classification: decision.classification,
		//   should_retry: decision.shouldRetry.toString(),
		//   status_code: statusCode.toString(),
		//   account_id: context.accountId.toString()
		// });

		// if (decision.shouldRetry) {
		//   prometheus.recordHistogram('ai_chatwit_retry_delay_ms', decision.delay, {
		//     classification: decision.classification,
		//     attempt: context.currentAttempt.toString()
		//   });
		// }

		log.debug("Retry metrics emitted", {
			classification: decision.classification,
			shouldRetry: decision.shouldRetry,
			statusCode,
			delay: decision.delay,
			attempt: context.currentAttempt,
		});
	}

	/**
	 * Create retry context from parameters
	 */
	createRetryContext(params: {
		conversationId: number;
		accountId: number;
		traceId: string;
		currentAttempt: number;
		originalError: Error;
		startTime: number;
		maxRetries?: number;
	}): RetryContext {
		return {
			conversationId: params.conversationId,
			accountId: params.accountId,
			traceId: params.traceId,
			currentAttempt: params.currentAttempt,
			maxRetries: params.maxRetries || this.defaultMaxRetries,
			originalError: params.originalError,
			startTime: params.startTime,
		};
	}

	/**
	 * Get retry statistics (for monitoring dashboard)
	 */
	getRetryStats(): RetryStats {
		// This would typically be implemented with actual metrics collection
		// For now, return mock data structure
		return {
			totalRequests: 0,
			retriedRequests: 0,
			successAfterRetry: 0,
			exhaustedRetries: 0,
			byStatusCode: {},
			byClassification: {},
			averageRetryDelay: 0,
		};
	}

	/**
	 * Validate retry configuration
	 */
	validateConfig(): boolean {
		if (this.baseDelay <= 0 || this.maxDelay <= 0) {
			log.error("Invalid retry delay configuration", {
				baseDelay: this.baseDelay,
				maxDelay: this.maxDelay,
			});
			return false;
		}

		if (this.maxDelay < this.baseDelay) {
			log.error("Max delay must be greater than base delay", {
				baseDelay: this.baseDelay,
				maxDelay: this.maxDelay,
			});
			return false;
		}

		if (this.defaultMaxRetries <= 0) {
			log.error("Max retries must be positive", {
				maxRetries: this.defaultMaxRetries,
			});
			return false;
		}

		return true;
	}

	/**
	 * Get human-readable error classification
	 */
	getErrorClassificationDescription(classification: string): string {
		switch (classification) {
			case "no_retry":
				return "Client error - no retry attempted";
			case "rate_limit":
				return "Rate limited - retry with backoff";
			case "server_error":
				return "Server error - exponential backoff retry";
			case "network_error":
				return "Network error - exponential backoff retry";
			default:
				return "Unknown classification";
		}
	}

	/**
	 * Check if error is retryable
	 */
	isRetryableError(error: Error): boolean {
		const statusCode = this.extractStatusCode(error);
		const classification = this.classifyError(error, statusCode);
		return classification !== "no_retry";
	}

	/**
	 * Calculate next retry delay
	 */
	calculateRetryDelay(
		classification: "rate_limit" | "server_error" | "network_error",
		attempt: number,
		error?: Error,
	): number {
		switch (classification) {
			case "rate_limit":
				const retryAfter = error ? this.extractRetryAfter(error) : null;
				return Math.min(retryAfter || 5000, this.maxDelay);

			case "server_error":
			case "network_error":
				return Math.min(this.baseDelay * Math.pow(2, attempt), this.maxDelay);

			default:
				return 0;
		}
	}
}

/**
 * Create default retry classifier instance
 */
export function createRetryClassifier(): RetryClassifier {
	const classifier = new RetryClassifier();

	if (!classifier.validateConfig()) {
		throw new Error("Invalid retry classifier configuration");
	}

	return classifier;
}
