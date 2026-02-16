/**
 * Chatwit Integration Service
 *
 * Main orchestrator for Chatwit API integration that combines all
 * the individual services into a cohesive integration layer.
 */

import log from "@/lib/log";
import { ChatwitApiClient, createChatwitApiClient } from "./chatwit-api-client";
import { MessageFormatter, createMessageFormatter } from "./message-formatter";
import { ChatwitErrorHandler, createChatwitErrorHandler } from "./chatwit-error-handler";
import { OutboundIdempotencyService, createOutboundIdempotencyService } from "./outbound-idempotency";
import { HumanHandoffService, createHumanHandoffService } from "./human-handoff";
import { TypingIndicatorsService, createTypingIndicatorsService } from "./typing-indicators";
import { RetryClassifier, createRetryClassifier } from "./retry-classifier";
import {
	WhatsAppInteractiveMessage,
	InstagramQuickReplyMessage,
	InstagramButtonTemplateMessage,
} from "../types/channels";

export interface SendMessageParams {
	accountId: number;
	conversationId: number;
	content: string;
	channel: "whatsapp" | "instagram" | "messenger";
	traceId: string;
	interactiveData?: WhatsAppInteractiveMessage | InstagramQuickReplyMessage | InstagramButtonTemplateMessage;
	showTypingIndicator?: boolean;
	expectedProcessingTime?: number;
}

export interface SendMessageResult {
	success: boolean;
	messageId?: number;
	error?: string;
	wasDuplicate?: boolean;
	handoffTriggered?: boolean;
	retryCount?: number;
}

export interface HandoffParams {
	accountId: number;
	conversationId: number;
	channel: "whatsapp" | "instagram" | "messenger";
	traceId: string;
	reason: string;
	originalError?: Error;
	assignToTeam?: string;
	customMessage?: string;
}

export class ChatwitIntegrationService {
	private apiClient: ChatwitApiClient;
	private messageFormatter: MessageFormatter;
	private errorHandler: ChatwitErrorHandler;
	private idempotencyService: OutboundIdempotencyService;
	private handoffService: HumanHandoffService;
	private typingService: TypingIndicatorsService;
	private retryClassifier: RetryClassifier;

	constructor() {
		// Initialize all services
		this.apiClient = createChatwitApiClient();
		this.messageFormatter = createMessageFormatter();
		this.errorHandler = createChatwitErrorHandler();
		this.idempotencyService = createOutboundIdempotencyService();
		this.retryClassifier = createRetryClassifier();

		// Services that depend on others
		this.handoffService = createHumanHandoffService(this.apiClient, this.messageFormatter);
		this.typingService = createTypingIndicatorsService(this.apiClient);

		log.info("Chatwit integration service initialized");
	}

	/**
	 * Send message to Chatwit with full integration features
	 */
	async sendMessage(params: SendMessageParams): Promise<SendMessageResult> {
		const startTime = Date.now();
		let retryCount = 0;

		try {
			// Format message for Chatwit
			const formattedMessage = this.messageFormatter.formatMessage({
				content: params.content,
				channel: params.channel,
				interactiveData: params.interactiveData,
				traceId: params.traceId,
				accountId: params.accountId,
				conversationId: params.conversationId,
			});

			// Validate formatted message
			if (!this.messageFormatter.validateFormattedMessage(formattedMessage)) {
				throw new Error("Invalid message format");
			}

			// Use typing indicator if requested
			if (params.showTypingIndicator) {
				return await this.typingService.withTypingIndicator(
					{
						accountId: params.accountId,
						conversationId: params.conversationId,
						traceId: params.traceId,
						expectedProcessingTime: params.expectedProcessingTime,
					},
					() => this.sendMessageWithRetry(params, formattedMessage, startTime),
				);
			} else {
				return await this.sendMessageWithRetry(params, formattedMessage, startTime);
			}
		} catch (error) {
			log.error("Failed to send message to Chatwit", {
				conversationId: params.conversationId,
				traceId: params.traceId,
				error: (error as Error).message,
				duration: Date.now() - startTime,
			});

			return {
				success: false,
				error: (error as Error).message,
				retryCount,
			};
		}
	}

	/**
	 * Send message with retry logic
	 */
	private async sendMessageWithRetry(
		params: SendMessageParams,
		formattedMessage: any,
		startTime: number,
	): Promise<SendMessageResult> {
		let retryCount = 0;
		let lastError: Error | null = null;

		while (retryCount <= 3) {
			try {
				const response = await this.apiClient.postBotMessage({
					accountId: params.accountId,
					conversationId: params.conversationId,
					content: formattedMessage.content,
					contentAttributes: formattedMessage.contentAttributes,
					channel: params.channel,
					traceId: params.traceId,
					additionalAttributes: formattedMessage.additionalAttributes,
				});

				// Check if it was a duplicate
				const wasDuplicate = response.id === -1;

				log.info("Message sent to Chatwit successfully", {
					conversationId: params.conversationId,
					messageId: response.id,
					traceId: params.traceId,
					retryCount,
					wasDuplicate,
					duration: Date.now() - startTime,
				});

				return {
					success: true,
					messageId: response.id,
					wasDuplicate,
					retryCount,
				};
			} catch (error) {
				lastError = error as Error;

				// Use error handler to determine action
				const errorAction = this.errorHandler.handleError(lastError, {
					conversationId: params.conversationId,
					accountId: params.accountId,
					channel: params.channel,
					traceId: params.traceId,
					attemptCount: retryCount,
					originalContent: params.content,
				});

				if (errorAction.action === "retry") {
					retryCount++;
					if (retryCount <= 3) {
						log.info("Retrying message send", {
							conversationId: params.conversationId,
							traceId: params.traceId,
							attempt: retryCount,
							delay: errorAction.delay,
							reason: errorAction.reason,
						});

						await this.delay(errorAction.delay);
						continue;
					}
				}

				if (errorAction.action === "fallback") {
					// Trigger human handoff
					const handoffResult = await this.executeHandoff({
						accountId: params.accountId,
						conversationId: params.conversationId,
						channel: params.channel,
						traceId: params.traceId,
						reason: errorAction.reason,
						originalError: lastError,
					});

					return {
						success: handoffResult.success,
						messageId: handoffResult.messageId,
						handoffTriggered: true,
						retryCount,
						error: handoffResult.success ? undefined : handoffResult.error,
					};
				}

				// DLQ or no retry
				break;
			}
		}

		return {
			success: false,
			error: lastError?.message || "Unknown error",
			retryCount,
		};
	}

	/**
	 * Execute human handoff
	 */
	async executeHandoff(params: HandoffParams): Promise<{
		success: boolean;
		messageId?: number;
		error?: string;
	}> {
		try {
			const handoffReason = params.originalError
				? HumanHandoffService.createHandoffReasonFromError(params.originalError, params.reason)
				: HumanHandoffService.createUserRequestHandoff(params.reason);

			const result = await this.handoffService.executeHandoff({
				accountId: params.accountId,
				conversationId: params.conversationId,
				channel: params.channel,
				traceId: params.traceId,
				reason: handoffReason,
				assignToTeam: params.assignToTeam,
				customMessage: params.customMessage,
			});

			return {
				success: result.success,
				messageId: result.messageId,
				error: result.error,
			};
		} catch (error) {
			log.error("Handoff execution failed", {
				conversationId: params.conversationId,
				traceId: params.traceId,
				error: (error as Error).message,
			});

			return {
				success: false,
				error: (error as Error).message,
			};
		}
	}

	/**
	 * Send simple text message
	 */
	async sendTextMessage(params: {
		accountId: number;
		conversationId: number;
		content: string;
		channel: "whatsapp" | "instagram" | "messenger";
		traceId: string;
	}): Promise<SendMessageResult> {
		return this.sendMessage({
			...params,
			showTypingIndicator: false,
		});
	}

	/**
	 * Send interactive message
	 */
	async sendInteractiveMessage(params: {
		accountId: number;
		conversationId: number;
		content: string;
		channel: "whatsapp" | "instagram" | "messenger";
		traceId: string;
		interactiveData: WhatsAppInteractiveMessage | InstagramQuickReplyMessage | InstagramButtonTemplateMessage;
		showTypingIndicator?: boolean;
	}): Promise<SendMessageResult> {
		return this.sendMessage({
			...params,
			showTypingIndicator: params.showTypingIndicator ?? true,
			expectedProcessingTime: 2000, // 2 seconds for interactive messages
		});
	}

	/**
	 * Get integration statistics
	 */
	async getStats(): Promise<{
		apiClient: any;
		idempotency: any;
		typing: any;
		handoff: any;
	}> {
		return {
			apiClient: {}, // Would get from API client
			idempotency: await this.idempotencyService.getStats(),
			typing: this.typingService.getStats(),
			handoff: await this.handoffService.getHandoffStats(),
		};
	}

	/**
	 * Health check for all services
	 */
	async healthCheck(): Promise<{
		healthy: boolean;
		services: Record<string, boolean>;
		errors: string[];
	}> {
		const errors: string[] = [];
		const services: Record<string, boolean> = {};

		try {
			// Check retry classifier config
			services.retryClassifier = this.retryClassifier.validateConfig();
			if (!services.retryClassifier) {
				errors.push("Retry classifier configuration invalid");
			}

			// Check if required environment variables are set
			const requiredEnvVars = ["CHATWIT_BASE_URL", "CHATWIT_ACCESS_TOKEN"];
			for (const envVar of requiredEnvVars) {
				if (!process.env[envVar]) {
					errors.push(`Missing required environment variable: ${envVar}`);
					services.environment = false;
				}
			}

			if (!services.environment) {
				services.environment = true;
			}

			// All services are healthy if no errors
			const healthy = errors.length === 0;

			return {
				healthy,
				services,
				errors,
			};
		} catch (error) {
			errors.push(`Health check failed: ${(error as Error).message}`);

			return {
				healthy: false,
				services,
				errors,
			};
		}
	}

	/**
	 * Shutdown all services
	 */
	async shutdown(): Promise<void> {
		log.info("Shutting down Chatwit integration service");

		try {
			await this.typingService.shutdown();
			log.info("Chatwit integration service shutdown complete");
		} catch (error) {
			log.error("Error during shutdown", {
				error: (error as Error).message,
			});
		}
	}

	/**
	 * Delay helper
	 */
	private delay(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}
}

/**
 * Create default Chatwit integration service
 */
export function createChatwitIntegrationService(): ChatwitIntegrationService {
	return new ChatwitIntegrationService();
}

// Export singleton instance
let integrationServiceInstance: ChatwitIntegrationService | null = null;

export function getChatwitIntegrationService(): ChatwitIntegrationService {
	if (!integrationServiceInstance) {
		integrationServiceInstance = createChatwitIntegrationService();
	}
	return integrationServiceInstance;
}
