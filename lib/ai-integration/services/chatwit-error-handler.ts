/**
 * Chatwit Error Handler
 *
 * Maps Chatwit API errors to appropriate actions (retry/DLQ)
 * and implements comprehensive error handling with fallback strategies.
 */

import log from "@/lib/log";
import { AxiosError } from "axios";
import { ChatwitApiError } from "../types/chatwit-api";

export type ErrorAction =
	| { action: "retry"; delay: number; reason: string }
	| { action: "dlq"; reason: string; alertLevel: "warning" | "error" | "critical" }
	| { action: "fallback"; reason: string; fallbackType: "human_handoff" | "simple_text" };

export interface ErrorContext {
	conversationId: number;
	accountId: number;
	channel: "whatsapp" | "instagram" | "messenger";
	traceId: string;
	attemptCount: number;
	originalContent: string;
}

export interface ErrorMetrics {
	errorType: string;
	statusCode: number;
	action: string;
	channel: string;
	accountId: number;
	duration: number;
}

export class ChatwitErrorHandler {
	private readonly maxRetries = 3;
	private readonly baseRetryDelay = 1000; // 1 second
	private readonly maxRetryDelay = 8000; // 8 seconds

	/**
	 * Handle Chatwit API error and determine action
	 */
	handleError(error: Error, context: ErrorContext): ErrorAction {
		const startTime = Date.now();

		// Handle Axios errors (HTTP responses)
		if (this.isAxiosError(error)) {
			const action = this.handleHttpError(error, context);
			this.recordErrorMetrics(error, action, context, Date.now() - startTime);
			return action;
		}

		// Handle network/timeout errors
		if (this.isNetworkError(error)) {
			const action = this.handleNetworkError(error, context);
			this.recordErrorMetrics(error, action, context, Date.now() - startTime);
			return action;
		}

		// Handle validation errors
		if (this.isValidationError(error)) {
			const action = this.handleValidationError(error, context);
			this.recordErrorMetrics(error, action, context, Date.now() - startTime);
			return action;
		}

		// Handle unknown errors
		const action = this.handleUnknownError(error, context);
		this.recordErrorMetrics(error, action, context, Date.now() - startTime);
		return action;
	}

	/**
	 * Handle HTTP errors from Chatwit API
	 */
	private handleHttpError(error: AxiosError<ChatwitApiError>, context: ErrorContext): ErrorAction {
		const status = error.response?.status;
		const errorMessage = error.response?.data?.message || error.message;

		log.error("Chatwit HTTP error", {
			status,
			message: errorMessage,
			conversationId: context.conversationId,
			traceId: context.traceId,
			attemptCount: context.attemptCount,
		});

		switch (status) {
			case 400: // Bad Request
				return {
					action: "dlq",
					reason: `Bad request: ${errorMessage}`,
					alertLevel: "error",
				};

			case 401: // Unauthorized
				return {
					action: "dlq",
					reason: `Authentication failed: ${errorMessage}`,
					alertLevel: "critical",
				};

			case 403: // Forbidden
				return {
					action: "dlq",
					reason: `Insufficient permissions: ${errorMessage}`,
					alertLevel: "error",
				};

			case 404: // Not Found
				return {
					action: "dlq",
					reason: `Resource not found: ${errorMessage}`,
					alertLevel: "warning",
				};

			case 409: // Conflict
				return {
					action: "dlq",
					reason: `Resource conflict: ${errorMessage}`,
					alertLevel: "warning",
				};

			case 422: // Unprocessable Entity
				return {
					action: "dlq",
					reason: `Validation error: ${errorMessage}`,
					alertLevel: "error",
				};

			case 429: // Rate Limited
				if (context.attemptCount >= this.maxRetries) {
					return {
						action: "dlq",
						reason: "Rate limit retries exhausted",
						alertLevel: "warning",
					};
				}

				const retryAfter = error.response?.headers["retry-after"];
				const delay = retryAfter ? parseInt(retryAfter) * 1000 : 5000;

				return {
					action: "retry",
					delay: Math.min(delay, this.maxRetryDelay),
					reason: `Rate limited, retry after ${delay}ms`,
				};

			case 500: // Internal Server Error
			case 502: // Bad Gateway
			case 503: // Service Unavailable
			case 504: // Gateway Timeout
				if (context.attemptCount >= this.maxRetries) {
					return {
						action: "fallback",
						reason: "Server error retries exhausted",
						fallbackType: "human_handoff",
					};
				}

				const serverErrorDelay = this.calculateExponentialBackoff(context.attemptCount);
				return {
					action: "retry",
					delay: serverErrorDelay,
					reason: `Server error, exponential backoff: ${serverErrorDelay}ms`,
				};

			default:
				return {
					action: "dlq",
					reason: `Unknown HTTP error: ${status} - ${errorMessage}`,
					alertLevel: "error",
				};
		}
	}

	/**
	 * Handle network/timeout errors
	 */
	private handleNetworkError(error: Error, context: ErrorContext): ErrorAction {
		log.error("Chatwit network error", {
			message: error.message,
			conversationId: context.conversationId,
			traceId: context.traceId,
			attemptCount: context.attemptCount,
		});

		if (context.attemptCount >= this.maxRetries) {
			return {
				action: "fallback",
				reason: "Network error retries exhausted",
				fallbackType: "human_handoff",
			};
		}

		const delay = this.calculateExponentialBackoff(context.attemptCount);
		return {
			action: "retry",
			delay,
			reason: `Network error, exponential backoff: ${delay}ms`,
		};
	}

	/**
	 * Handle validation errors
	 */
	private handleValidationError(error: Error, context: ErrorContext): ErrorAction {
		log.error("Chatwit validation error", {
			message: error.message,
			conversationId: context.conversationId,
			traceId: context.traceId,
		});

		return {
			action: "fallback",
			reason: `Validation error: ${error.message}`,
			fallbackType: "simple_text",
		};
	}

	/**
	 * Handle unknown errors
	 */
	private handleUnknownError(error: Error, context: ErrorContext): ErrorAction {
		log.error("Chatwit unknown error", {
			message: error.message,
			stack: error.stack,
			conversationId: context.conversationId,
			traceId: context.traceId,
		});

		return {
			action: "dlq",
			reason: `Unknown error: ${error.message}`,
			alertLevel: "error",
		};
	}

	/**
	 * Calculate exponential backoff delay
	 */
	private calculateExponentialBackoff(attemptCount: number): number {
		const delay = this.baseRetryDelay * Math.pow(2, attemptCount);
		return Math.min(delay, this.maxRetryDelay);
	}

	/**
	 * Check if error is an Axios error
	 */
	private isAxiosError(error: Error): error is AxiosError<ChatwitApiError> {
		return "isAxiosError" in error && error.isAxiosError === true;
	}

	/**
	 * Check if error is a network error
	 */
	private isNetworkError(error: Error): boolean {
		const networkErrorCodes = ["ECONNREFUSED", "ENOTFOUND", "ETIMEDOUT", "ECONNRESET"];
		return (
			networkErrorCodes.some((code) => error.message.includes(code)) ||
			error.message.includes("timeout") ||
			error.message.includes("network")
		);
	}

	/**
	 * Check if error is a validation error
	 */
	private isValidationError(error: Error): boolean {
		return (
			error.message.includes("validation") ||
			error.message.includes("schema") ||
			error.message.includes("invalid format")
		);
	}

	/**
	 * Record error metrics for monitoring
	 */
	private recordErrorMetrics(error: Error, action: ErrorAction, context: ErrorContext, duration: number): void {
		const metrics: ErrorMetrics = {
			errorType: this.getErrorType(error),
			statusCode: this.getStatusCode(error),
			action: action.action,
			channel: context.channel,
			accountId: context.accountId,
			duration,
		};

		// Log metrics for Prometheus/monitoring
		log.info("Chatwit error metrics", {
			...metrics,
			conversationId: context.conversationId,
			traceId: context.traceId,
			reason: action.reason,
		});

		// TODO: Emit metrics to monitoring system
		// prometheus.incrementCounter('ai_chatwit_errors_total', {
		//   error_type: metrics.errorType,
		//   action: metrics.action,
		//   channel: metrics.channel,
		//   account_id: metrics.accountId.toString()
		// });
	}

	/**
	 * Get error type for metrics
	 */
	private getErrorType(error: Error): string {
		if (this.isAxiosError(error)) {
			return "http_error";
		}
		if (this.isNetworkError(error)) {
			return "network_error";
		}
		if (this.isValidationError(error)) {
			return "validation_error";
		}
		return "unknown_error";
	}

	/**
	 * Get status code from error
	 */
	private getStatusCode(error: Error): number {
		if (this.isAxiosError(error)) {
			return error.response?.status || 0;
		}
		return 0;
	}

	/**
	 * Create human handoff payload
	 */
	createHandoffPayload(
		context: ErrorContext,
		reason: string,
	): {
		content: string;
		additionalAttributes: Record<string, any>;
	} {
		return {
			content: "Acionei um atendente humano",
			additionalAttributes: {
				provider: "meta",
				channel: context.channel,
				schema_version: "1.0.0",
				trace_id: context.traceId,
				handoff_reason: reason,
				assign_to_team: "support",
				conversation_tags: ["ai_handoff", "api_error"],
				conversation_status: "open",
			},
		};
	}

	/**
	 * Create simple text fallback payload
	 */
	createSimpleTextFallback(context: ErrorContext): {
		content: string;
		additionalAttributes: Record<string, any>;
	} {
		// Extract simple text from original content
		const simpleContent = this.extractSimpleText(context.originalContent);

		return {
			content: simpleContent,
			additionalAttributes: {
				provider: "meta",
				channel: context.channel,
				schema_version: "1.0.0",
				trace_id: context.traceId,
				fallback_reason: "interactive_content_failed",
			},
		};
	}

	/**
	 * Extract simple text from complex content
	 */
	private extractSimpleText(content: string): string {
		// Remove any markdown or special formatting
		let simpleText = content
			.replace(/\*\*(.*?)\*\*/g, "$1") // Remove bold
			.replace(/\*(.*?)\*/g, "$1") // Remove italic
			.replace(/`(.*?)`/g, "$1") // Remove code
			.replace(/\[(.*?)\]\(.*?\)/g, "$1") // Remove links
			.trim();

		// Ensure it's not empty
		if (!simpleText) {
			simpleText = "Como posso ajudar?";
		}

		// Truncate if too long
		if (simpleText.length > 1000) {
			simpleText = simpleText.substring(0, 997) + "...";
		}

		return simpleText;
	}

	/**
	 * Check if error should trigger alert
	 */
	shouldAlert(action: ErrorAction): boolean {
		return action.action === "dlq" && "alertLevel" in action && ["error", "critical"].includes(action.alertLevel);
	}

	/**
	 * Get alert severity
	 */
	getAlertSeverity(action: ErrorAction): "low" | "medium" | "high" | "critical" {
		if (action.action === "dlq" && "alertLevel" in action) {
			switch (action.alertLevel) {
				case "warning":
					return "low";
				case "error":
					return "medium";
				case "critical":
					return "critical";
				default:
					return "medium";
			}
		}
		return "low";
	}
}

/**
 * Create default error handler instance
 */
export function createChatwitErrorHandler(): ChatwitErrorHandler {
	return new ChatwitErrorHandler();
}
