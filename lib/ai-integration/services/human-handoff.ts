/**
 * Human Handoff Service
 *
 * Handles transition from AI to human agents with proper tagging,
 * team assignment, and conversation status management.
 */

import log from "@/lib/log";
import { ChatwitApiClient } from "./chatwit-api-client";
import { MessageFormatter } from "./message-formatter";
import { ChatwitMessagePayload } from "../types/chatwit-api";

export interface HandoffReason {
	type: "ai_failure" | "user_request" | "complex_query" | "escalation" | "timeout" | "error";
	details: string;
	originalError?: string;
}

export interface HandoffConfig {
	defaultTeam: string;
	defaultMessage: string;
	changeConversationStatus: boolean;
	addTags: string[];
	notifyTeam: boolean;
}

export interface HandoffContext {
	accountId: number;
	conversationId: number;
	channel: "whatsapp" | "instagram" | "messenger";
	traceId: string;
	reason: HandoffReason;
	assignToTeam?: string;
	customMessage?: string;
	preserveContext?: boolean;
}

export interface HandoffResult {
	success: boolean;
	messageId?: number;
	error?: string;
	handoffId: string;
	timestamp: number;
}

export class HumanHandoffService {
	private chatwitClient: ChatwitApiClient;
	private messageFormatter: MessageFormatter;
	private defaultConfig: HandoffConfig;

	constructor(chatwitClient: ChatwitApiClient, messageFormatter: MessageFormatter, config?: Partial<HandoffConfig>) {
		this.chatwitClient = chatwitClient;
		this.messageFormatter = messageFormatter;

		this.defaultConfig = {
			defaultTeam: "support",
			defaultMessage: "Acionei um atendente humano",
			changeConversationStatus: true,
			addTags: ["ai_handoff"],
			notifyTeam: true,
			...config,
		};
	}

	/**
	 * Execute human handoff
	 */
	async executeHandoff(context: HandoffContext): Promise<HandoffResult> {
		const handoffId = this.generateHandoffId(context);
		const startTime = Date.now();

		try {
			log.info("Initiating human handoff", {
				handoffId,
				conversationId: context.conversationId,
				accountId: context.accountId,
				reason: context.reason,
				traceId: context.traceId,
			});

			// Prepare handoff message
			const message = this.prepareHandoffMessage(context, handoffId);

			// Send handoff message to Chatwit
			const response = await this.chatwitClient.postBotMessage({
				accountId: context.accountId,
				conversationId: context.conversationId,
				content: message.content,
				contentAttributes: message.contentAttributes,
				channel: context.channel,
				traceId: context.traceId,
				additionalAttributes: message.additionalAttributes,
			});

			// Update conversation metadata if needed
			if (this.defaultConfig.changeConversationStatus) {
				await this.updateConversationMetadata(context, handoffId);
			}

			// Notify team if configured
			if (this.defaultConfig.notifyTeam) {
				await this.notifyTeam(context, handoffId);
			}

			// Log handoff metrics
			this.logHandoffMetrics(context, handoffId, Date.now() - startTime, true);

			log.info("Human handoff completed successfully", {
				handoffId,
				conversationId: context.conversationId,
				messageId: response.id,
				duration: Date.now() - startTime,
				traceId: context.traceId,
			});

			return {
				success: true,
				messageId: response.id,
				handoffId,
				timestamp: Date.now(),
			};
		} catch (error) {
			const errorMessage = (error as Error).message;

			log.error("Human handoff failed", {
				handoffId,
				conversationId: context.conversationId,
				error: errorMessage,
				duration: Date.now() - startTime,
				traceId: context.traceId,
			});

			// Log handoff metrics for failure
			this.logHandoffMetrics(context, handoffId, Date.now() - startTime, false, errorMessage);

			return {
				success: false,
				error: errorMessage,
				handoffId,
				timestamp: Date.now(),
			};
		}
	}

	/**
	 * Prepare handoff message with proper formatting
	 */
	private prepareHandoffMessage(
		context: HandoffContext,
		handoffId: string,
	): {
		content: string;
		contentAttributes?: Record<string, any>;
		additionalAttributes: ChatwitMessagePayload["additional_attributes"];
	} {
		const message = context.customMessage || this.defaultConfig.defaultMessage;
		const team = context.assignToTeam || this.defaultConfig.defaultTeam;

		// Create tags including reason-specific tags
		const tags = [...this.defaultConfig.addTags, `handoff_reason_${context.reason.type}`, `handoff_id_${handoffId}`];

		// Add channel-specific tag
		tags.push(`channel_${context.channel}`);

		const additionalAttributes: ChatwitMessagePayload["additional_attributes"] = {
			provider: "meta",
			channel: context.channel,
			schema_version: "1.0.0",
			trace_id: context.traceId,
			handoff_reason: `${context.reason.type}: ${context.reason.details}`,
			assign_to_team: team,
			conversation_tags: tags,
			conversation_status: this.defaultConfig.changeConversationStatus ? "open" : undefined,
		};

		// Add original error if available
		if (context.reason.originalError) {
			(additionalAttributes as any).original_error = context.reason.originalError;
		}

		// Add handoff metadata
		(additionalAttributes as any).handoff_id = handoffId;
		(additionalAttributes as any).handoff_timestamp = Date.now();

		return {
			content: message,
			additionalAttributes,
		};
	}

	/**
	 * Update conversation metadata in Chatwit
	 */
	private async updateConversationMetadata(context: HandoffContext, handoffId: string): Promise<void> {
		try {
			// This would typically call Chatwit's conversation update API
			// For now, we'll log the intended update
			log.info("Updating conversation metadata for handoff", {
				conversationId: context.conversationId,
				handoffId,
				status: "open",
				assignedTeam: context.assignToTeam || this.defaultConfig.defaultTeam,
				traceId: context.traceId,
			});

			// TODO: Implement actual Chatwit conversation update API call
			// await this.chatwitClient.updateConversation(context.conversationId, {
			//   status: 'open',
			//   assigned_team: context.assignToTeam || this.defaultConfig.defaultTeam,
			//   tags: this.defaultConfig.addTags
			// });
		} catch (error) {
			log.warn("Failed to update conversation metadata", {
				conversationId: context.conversationId,
				handoffId,
				error: (error as Error).message,
				traceId: context.traceId,
			});
			// Don't throw - handoff message was already sent
		}
	}

	/**
	 * Notify team about handoff
	 */
	private async notifyTeam(context: HandoffContext, handoffId: string): Promise<void> {
		try {
			// This would typically send a notification to the assigned team
			// For now, we'll log the intended notification
			log.info("Notifying team about handoff", {
				conversationId: context.conversationId,
				handoffId,
				team: context.assignToTeam || this.defaultConfig.defaultTeam,
				reason: context.reason.type,
				traceId: context.traceId,
			});

			// TODO: Implement actual team notification
			// This could be:
			// - Slack/Teams notification
			// - Email notification
			// - In-app notification via Chatwit
			// - Push notification to mobile app
		} catch (error) {
			log.warn("Failed to notify team about handoff", {
				conversationId: context.conversationId,
				handoffId,
				error: (error as Error).message,
				traceId: context.traceId,
			});
			// Don't throw - handoff was successful
		}
	}

	/**
	 * Generate unique handoff ID
	 */
	private generateHandoffId(context: HandoffContext): string {
		const timestamp = Date.now().toString(36);
		const random = Math.random().toString(36).substring(2, 8);
		const conversationId = context.conversationId.toString(36);

		return `ho_${timestamp}_${conversationId}_${random}`;
	}

	/**
	 * Log handoff metrics for monitoring
	 */
	private logHandoffMetrics(
		context: HandoffContext,
		handoffId: string,
		duration: number,
		success: boolean,
		error?: string,
	): void {
		const metrics = {
			handoff_id: handoffId,
			conversation_id: context.conversationId,
			account_id: context.accountId,
			channel: context.channel,
			reason_type: context.reason.type,
			assigned_team: context.assignToTeam || this.defaultConfig.defaultTeam,
			duration_ms: duration,
			success,
			error,
			trace_id: context.traceId,
		};

		log.info("Human handoff metrics", metrics);

		// TODO: Emit metrics to monitoring system
		// prometheus.incrementCounter('ai_human_handoffs_total', {
		//   channel: context.channel,
		//   reason: context.reason.type,
		//   success: success.toString(),
		//   account_id: context.accountId.toString()
		// });
		//
		// prometheus.recordHistogram('ai_handoff_duration_ms', duration, {
		//   channel: context.channel,
		//   reason: context.reason.type
		// });
	}

	/**
	 * Create handoff reason from error
	 */
	static createHandoffReasonFromError(error: Error, details?: string): HandoffReason {
		return {
			type: "ai_failure",
			details: details || "AI processing failed",
			originalError: error.message,
		};
	}

	/**
	 * Create handoff reason for user request
	 */
	static createUserRequestHandoff(details: string = "User requested human agent"): HandoffReason {
		return {
			type: "user_request",
			details,
		};
	}

	/**
	 * Create handoff reason for complex query
	 */
	static createComplexQueryHandoff(details: string = "Query too complex for AI"): HandoffReason {
		return {
			type: "complex_query",
			details,
		};
	}

	/**
	 * Create handoff reason for escalation
	 */
	static createEscalationHandoff(details: string = "Escalated to human agent"): HandoffReason {
		return {
			type: "escalation",
			details,
		};
	}

	/**
	 * Create handoff reason for timeout
	 */
	static createTimeoutHandoff(details: string = "AI processing timeout"): HandoffReason {
		return {
			type: "timeout",
			details,
		};
	}

	/**
	 * Get handoff statistics
	 */
	async getHandoffStats(
		accountId?: number,
		timeRange?: { start: Date; end: Date },
	): Promise<{
		total: number;
		byReason: Record<string, number>;
		byChannel: Record<string, number>;
		byTeam: Record<string, number>;
		successRate: number;
	}> {
		// This would typically query the database or monitoring system
		// For now, return mock data
		return {
			total: 0,
			byReason: {},
			byChannel: {},
			byTeam: {},
			successRate: 0,
		};
	}

	/**
	 * Check if handoff is needed based on context
	 */
	shouldHandoff(context: {
		errorCount: number;
		processingTime: number;
		userMessage: string;
		confidence?: number;
	}): boolean {
		// High error count
		if (context.errorCount >= 3) {
			return true;
		}

		// Long processing time
		if (context.processingTime > 30000) {
			// 30 seconds
			return true;
		}

		// Low confidence
		if (context.confidence !== undefined && context.confidence < 0.3) {
			return true;
		}

		// User explicitly asks for human
		const humanKeywords = ["atendente", "humano", "pessoa", "falar com alguém", "supervisor"];
		const message = context.userMessage.toLowerCase();
		if (humanKeywords.some((keyword) => message.includes(keyword))) {
			return true;
		}

		return false;
	}
}

/**
 * Create default human handoff service
 */
export function createHumanHandoffService(
	chatwitClient: ChatwitApiClient,
	messageFormatter: MessageFormatter,
	config?: Partial<HandoffConfig>,
): HumanHandoffService {
	return new HumanHandoffService(chatwitClient, messageFormatter, config);
}
