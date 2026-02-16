/**
 * Chatwit API Client
 *
 * Handles communication with Chatwit API for posting bot messages
 * with proper authentication, retry logic, and error handling.
 */

import axios, { AxiosInstance, AxiosError } from "axios";
import crypto from "crypto";
import log from "@/lib/log";
import {
	ChatwitMessagePayload,
	ChatwitApiResponse,
	ChatwitApiError,
	PostMessageParams,
	RetryConfig,
	ChatwitApiClientConfig,
	RetryDecision,
	ApiCallMetrics,
} from "../types/chatwit-api";

export class ChatwitApiClient {
	private client: AxiosInstance;
	private retryConfig: RetryConfig;
	private baseUrl: string;

	constructor(config: ChatwitApiClientConfig) {
		this.baseUrl = config.baseUrl;
		this.retryConfig = config.retryConfig;

		this.client = axios.create({
			baseURL: config.baseUrl,
			timeout: config.timeout,
			headers: {
				Authorization: `Bearer ${config.accessToken}`,
				"Content-Type": "application/json",
				"User-Agent": "SocialWise-AI/1.0.0",
			},
		});

		// Add request interceptor for logging
		this.client.interceptors.request.use(
			(config) => {
				log.debug("Chatwit API request", {
					method: config.method?.toUpperCase(),
					url: config.url,
					traceId: config.headers?.["X-Trace-ID"],
				});
				return config;
			},
			(error) => {
				log.error("Chatwit API request error", { error: error.message });
				return Promise.reject(error);
			},
		);

		// Add response interceptor for logging
		this.client.interceptors.response.use(
			(response) => {
				log.debug("Chatwit API response", {
					status: response.status,
					url: response.config.url,
					traceId: response.config.headers?.["X-Trace-ID"],
				});
				return response;
			},
			(error) => {
				log.error("Chatwit API response error", {
					status: error.response?.status,
					message: error.message,
					url: error.config?.url,
					traceId: error.config?.headers?.["X-Trace-ID"],
				});
				return Promise.reject(error);
			},
		);
	}

	/**
	 * Post a bot message to Chatwit
	 */
	async postBotMessage(params: PostMessageParams): Promise<ChatwitApiResponse> {
		const startTime = Date.now();
		let retryCount = 0;
		let lastError: Error | null = null;

		const payload = this.buildMessagePayload(params);
		const payloadHash = this.hashPayload(payload);

		// Check for idempotent outbound (task 9.4)
		const idempotencyKey = `out:${params.conversationId}:${payloadHash}`;
		const isDuplicate = await this.checkOutboundIdempotency(idempotencyKey);

		if (isDuplicate) {
			log.info("Skipping duplicate outbound message", {
				conversationId: params.conversationId,
				traceId: params.traceId,
				payloadHash,
			});

			// Return a mock response for duplicate
			return {
				id: -1,
				content: payload.content,
				message_type: "outgoing",
				created_at: new Date().toISOString(),
				conversation_id: params.conversationId,
				account_id: params.accountId,
			};
		}

		while (retryCount <= this.retryConfig.maxRetries) {
			try {
				const response = await this.client.post<ChatwitApiResponse>(
					`/api/v1/accounts/${params.accountId}/conversations/${params.conversationId}/messages`,
					payload,
					{
						headers: {
							"X-Trace-ID": params.traceId,
							"X-Idempotency-Key": idempotencyKey,
						},
					},
				);

				// Mark as sent in Redis journal
				await this.markOutboundSent(idempotencyKey);

				const metrics: ApiCallMetrics = {
					duration: Date.now() - startTime,
					status: response.status,
					retryCount,
					finalOutcome: "success",
				};

				this.logApiCall(params, metrics);
				return response.data;
			} catch (error) {
				lastError = error as Error;
				const axiosError = error as AxiosError<ChatwitApiError>;

				const retryDecision = this.shouldRetry(axiosError, retryCount);

				log.warn("Chatwit API call failed", {
					conversationId: params.conversationId,
					traceId: params.traceId,
					attempt: retryCount + 1,
					status: axiosError.response?.status,
					error: axiosError.message,
					retryDecision: retryDecision.reason,
					willRetry: retryDecision.shouldRetry,
				});

				if (!retryDecision.shouldRetry) {
					const metrics: ApiCallMetrics = {
						duration: Date.now() - startTime,
						status: axiosError.response?.status || 0,
						retryCount,
						finalOutcome: "dlq",
					};

					this.logApiCall(params, metrics, axiosError);
					throw this.createChatwitError(axiosError, retryDecision.reason);
				}

				retryCount++;
				if (retryCount <= this.retryConfig.maxRetries) {
					await this.delay(retryDecision.delay);
				}
			}
		}

		// All retries exhausted
		const metrics: ApiCallMetrics = {
			duration: Date.now() - startTime,
			status: (lastError as AxiosError)?.response?.status || 0,
			retryCount,
			finalOutcome: "failure",
		};

		this.logApiCall(params, metrics, lastError);
		throw new Error(`Failed to post message after ${retryCount} retries: ${lastError?.message}`);
	}

	/**
	 * Post human handoff message (task 9.5)
	 */
	async postHumanHandoff(params: {
		accountId: number;
		conversationId: number;
		traceId: string;
		reason: string;
		assignToTeam?: string;
		changeStatus?: boolean;
	}): Promise<ChatwitApiResponse> {
		const handoffParams: PostMessageParams = {
			accountId: params.accountId,
			conversationId: params.conversationId,
			content: "Acionei um atendente humano",
			channel: "whatsapp", // Default, will be overridden by additional_attributes
			traceId: params.traceId,
			additionalAttributes: {
				handoff_reason: params.reason,
				assign_to_team: params.assignToTeam || "support",
				conversation_tags: ["ai_handoff"],
				conversation_status: params.changeStatus ? "open" : undefined,
			},
		};

		return this.postBotMessage(handoffParams);
	}

	/**
	 * Send typing indicator (task 9.6 - optional)
	 */
	async sendTypingIndicator(params: {
		accountId: number;
		conversationId: number;
		traceId: string;
	}): Promise<void> {
		try {
			await this.client.post(
				`/api/v1/accounts/${params.accountId}/conversations/${params.conversationId}/typing`,
				{ typing: true },
				{
					headers: {
						"X-Trace-ID": params.traceId,
					},
				},
			);

			log.debug("Typing indicator sent", {
				conversationId: params.conversationId,
				traceId: params.traceId,
			});
		} catch (error) {
			// Typing indicators are optional, don't fail the main flow
			log.warn("Failed to send typing indicator", {
				conversationId: params.conversationId,
				traceId: params.traceId,
				error: (error as Error).message,
			});
		}
	}

	/**
	 * Build message payload from parameters
	 */
	private buildMessagePayload(params: PostMessageParams): ChatwitMessagePayload {
		const basePayload: ChatwitMessagePayload = {
			content: params.content,
			message_type: "outgoing",
			additional_attributes: {
				provider: "meta",
				channel: params.channel,
				schema_version: "1.0.0",
				trace_id: params.traceId,
				...params.additionalAttributes,
			},
		};

		if (params.contentAttributes) {
			basePayload.content_attributes = params.contentAttributes;
		}

		return basePayload;
	}

	/**
	 * Determine retry strategy based on error (task 9.7)
	 */
	private shouldRetry(error: AxiosError<ChatwitApiError>, retryCount: number): RetryDecision {
		const status = error.response?.status;

		// No retry for client errors (except 429)
		if (status && [400, 401, 403, 409].includes(status)) {
			return {
				shouldRetry: false,
				reason: `Non-retryable client error: ${status}`,
			};
		}

		// Rate limiting - honor Retry-After header
		if (status === 429) {
			if (retryCount >= 3) {
				return {
					shouldRetry: false,
					reason: "Rate limit retries exhausted",
				};
			}

			const retryAfter = error.response?.headers["retry-after"];
			const delay = retryAfter ? parseInt(retryAfter) * 1000 : 5000;

			return {
				shouldRetry: true,
				delay: Math.min(delay, this.retryConfig.maxDelay),
				reason: `Rate limited, retry after ${delay}ms`,
			};
		}

		// Server errors - exponential backoff
		if (status && status >= 500) {
			if (retryCount >= 3) {
				return {
					shouldRetry: false,
					reason: "Server error retries exhausted",
				};
			}

			const delay = Math.min(this.retryConfig.baseDelay * Math.pow(2, retryCount), this.retryConfig.maxDelay);

			return {
				shouldRetry: true,
				delay,
				reason: `Server error, exponential backoff: ${delay}ms`,
			};
		}

		// Network errors
		if (!status) {
			if (retryCount >= 3) {
				return {
					shouldRetry: false,
					reason: "Network error retries exhausted",
				};
			}

			const delay = Math.min(this.retryConfig.baseDelay * Math.pow(2, retryCount), this.retryConfig.maxDelay);

			return {
				shouldRetry: true,
				delay,
				reason: `Network error, exponential backoff: ${delay}ms`,
			};
		}

		return {
			shouldRetry: false,
			reason: `Unknown error status: ${status}`,
		};
	}

	/**
	 * Create standardized Chatwit error
	 */
	private createChatwitError(error: AxiosError<ChatwitApiError>, reason: string): Error {
		const status = error.response?.status || 0;
		const message = error.response?.data?.message || error.message;

		const chatwitError = new Error(`Chatwit API Error (${status}): ${message}`);
		(chatwitError as any).status = status;
		(chatwitError as any).reason = reason;
		(chatwitError as any).response = error.response?.data;

		return chatwitError;
	}

	/**
	 * Hash payload for idempotency
	 */
	private hashPayload(payload: ChatwitMessagePayload): string {
		const normalizedPayload = {
			content: payload.content,
			content_attributes: payload.content_attributes,
			// Exclude trace_id and timestamps from hash
			additional_attributes: {
				...payload.additional_attributes,
				trace_id: undefined,
			},
		};

		return crypto.createHash("sha256").update(JSON.stringify(normalizedPayload)).digest("hex").substring(0, 16); // First 16 chars for brevity
	}

	/**
	 * Check if message was already sent (idempotency)
	 */
	private async checkOutboundIdempotency(key: string): Promise<boolean> {
		try {
			const { getRedisInstance } = await import("@/lib/connections");
			const redis = getRedisInstance();
			const exists = await redis.exists(key);
			return exists === 1;
		} catch (error) {
			log.error("Failed to check outbound idempotency", {
				key,
				error: (error as Error).message,
			});
			return false; // Fail open - allow sending
		}
	}

	/**
	 * Mark message as sent in Redis journal
	 */
	private async markOutboundSent(key: string): Promise<void> {
		try {
			const { getRedisInstance } = await import("@/lib/connections");
			const redis = getRedisInstance();
			await redis.setex(key, 60, "1"); // 60 second TTL
		} catch (error) {
			log.error("Failed to mark outbound as sent", {
				key,
				error: (error as Error).message,
			});
			// Don't throw - this is for deduplication only
		}
	}

	/**
	 * Log API call metrics
	 */
	private logApiCall(params: PostMessageParams, metrics: ApiCallMetrics, error?: Error | null): void {
		const logData = {
			conversationId: params.conversationId,
			accountId: params.accountId,
			channel: params.channel,
			traceId: params.traceId,
			duration: metrics.duration,
			status: metrics.status,
			retryCount: metrics.retryCount,
			outcome: metrics.finalOutcome,
			deliver_retry_reason: error ? (error as any).reason : undefined,
		};

		if (metrics.finalOutcome === "success") {
			log.info("Chatwit message delivered", logData);
		} else {
			log.error("Chatwit message delivery failed", {
				...logData,
				error: error?.message,
			});
		}
	}

	/**
	 * Delay helper for retries
	 */
	private delay(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}
}

/**
 * Create default Chatwit API client
 */
export function createChatwitApiClient(): ChatwitApiClient {
	const config: ChatwitApiClientConfig = {
		baseUrl: process.env.CHATWIT_BASE_URL || "http://localhost:3000",
		accessToken: process.env.CHATWIT_ACCESS_TOKEN || "",
		timeout: parseInt(process.env.CHATWIT_TIMEOUT_MS || "10000"),
		retryConfig: {
			maxRetries: 3,
			baseDelay: 1000, // 1s
			maxDelay: 8000, // 8s max
			retryableStatuses: [429, 500, 502, 503, 504],
			nonRetryableStatuses: [400, 401, 403, 409],
		},
	};

	if (!config.accessToken) {
		throw new Error("CHATWIT_ACCESS_TOKEN environment variable is required");
	}

	return new ChatwitApiClient(config);
}
