/**
 * Message Formatter Service
 *
 * Transforms sanitized content to Chatwit content_attributes format
 * with channel-specific formatting and required metadata.
 */

import log from "@/lib/log";
import { WhatsAppInteractiveContent, InstagramContent, ChatwitMessagePayload } from "../types/chatwit-api";
import {
	WhatsAppInteractiveMessage,
	InstagramQuickReplyMessage,
	InstagramButtonTemplateMessage,
} from "../types/channels";

// Interface for formatting context
export interface FormatContext {
	accountId: number;
	conversationId: number;
	traceId: string;
	channel?: "whatsapp" | "instagram" | "messenger";
	economicMode?: boolean;
}

// Input interfaces for different message types
export interface WhatsAppInteractiveInput {
	body: string;
	header?: string;
	footer?: string;
	buttons: Array<{ title: string; id: string }>;
}

export interface WhatsAppTextInput {
	text: string;
}

export interface InstagramQuickReplyInput {
	text: string;
	quick_replies: Array<{ title: string; payload: string }>;
}

export interface InstagramButtonTemplateInput {
	text: string;
	buttons: Array<{
		type: "postback" | "web_url";
		title: string;
		payload?: string;
		url?: string;
	}>;
}

export interface HumanHandoffInput {
	text: string;
	handoffReason: string;
	assignToTeam: string;
	conversationTags: string[];
}

// Output interface for formatted messages
export interface FormattedChatwitMessage {
	content: string;
	message_type: "outgoing";
	private: boolean;
	content_attributes?: Record<string, any>;
	additional_attributes: {
		provider: "meta";
		channel: "whatsapp" | "instagram" | "messenger";
		schema_version: "1.0.0";
		trace_id: string;
		economic_mode?: boolean;
		handoff_reason?: string;
		assign_to_team?: string;
		conversation_tags?: string[];
		conversation_status?: string;
	};
}

export interface FormatMessageParams {
	content: string;
	channel: "whatsapp" | "instagram" | "messenger";
	interactiveData?: WhatsAppInteractiveMessage | InstagramQuickReplyMessage | InstagramButtonTemplateMessage;
	traceId: string;
	accountId: number;
	conversationId: number;
}

export interface FormattedMessage {
	content: string;
	contentAttributes?: Record<string, any>;
	additionalAttributes: ChatwitMessagePayload["additional_attributes"];
}

/**
 * MessageFormatterService - Contract test compatible service
 */
export class MessageFormatterService {
	/**
	 * Format WhatsApp interactive message
	 */
	formatWhatsAppInteractive(input: WhatsAppInteractiveInput, context: FormatContext): FormattedChatwitMessage {
		const result: FormattedChatwitMessage = {
			content: input.body,
			message_type: "outgoing",
			private: false,
			content_attributes: {
				interactive: {
					type: "button",
					body: {
						text: input.body,
					},
					action: {
						buttons: input.buttons.map((button) => ({
							type: "reply",
							reply: {
								id: button.id,
								title: button.title,
							},
						})),
					},
				},
			},
			additional_attributes: {
				provider: "meta",
				channel: "whatsapp",
				schema_version: "1.0.0",
				trace_id: context.traceId,
			},
		};

		// Add optional header
		if (input.header) {
			result.content_attributes!.interactive!.header = {
				type: "text",
				text: input.header,
			};
		}

		// Add optional footer
		if (input.footer) {
			result.content_attributes!.interactive!.footer = {
				text: input.footer,
			};
		}

		// Add economic mode flag if enabled
		if (context.economicMode) {
			result.additional_attributes.economic_mode = true;
		}

		return result;
	}

	/**
	 * Format WhatsApp simple text message
	 */
	formatWhatsAppText(input: WhatsAppTextInput, context: FormatContext): FormattedChatwitMessage {
		return {
			content: input.text,
			message_type: "outgoing",
			private: false,
			additional_attributes: {
				provider: "meta",
				channel: "whatsapp",
				schema_version: "1.0.0",
				trace_id: context.traceId,
			},
		};
	}

	/**
	 * Format Instagram quick reply message
	 */
	formatInstagramQuickReply(input: InstagramQuickReplyInput, context: FormatContext): FormattedChatwitMessage {
		return {
			content: input.text,
			message_type: "outgoing",
			private: false,
			content_attributes: {
				ig: {
					messaging_type: "RESPONSE",
					message: {
						text: input.text,
						quick_replies: input.quick_replies.map((reply: any) => ({
							content_type: "text",
							title: reply.title,
							payload: reply.payload,
						})),
					},
				},
			},
			additional_attributes: {
				provider: "meta",
				channel: "instagram",
				schema_version: "1.0.0",
				trace_id: context.traceId,
			},
		};
	}

	/**
	 * Format Instagram button template message
	 */
	formatInstagramButtonTemplate(input: InstagramButtonTemplateInput, context: FormatContext): FormattedChatwitMessage {
		return {
			content: input.text,
			message_type: "outgoing",
			private: false,
			content_attributes: {
				ig: {
					messaging_type: "RESPONSE",
					message: {
						attachment: {
							type: "template",
							payload: {
								template_type: "button",
								text: input.text,
								buttons: input.buttons.map((button) => ({
									type: button.type,
									title: button.title,
									payload: button.type === "postback" ? button.payload : undefined,
									url: button.type === "web_url" ? button.url : undefined,
								})),
							},
						},
					},
				},
			},
			additional_attributes: {
				provider: "meta",
				channel: "instagram",
				schema_version: "1.0.0",
				trace_id: context.traceId,
			},
		};
	}

	/**
	 * Format Messenger button template message
	 */
	formatMessengerButtonTemplate(input: InstagramButtonTemplateInput, context: FormatContext): FormattedChatwitMessage {
		return {
			content: input.text,
			message_type: "outgoing",
			private: false,
			content_attributes: {
				messenger: {
					messaging_type: "RESPONSE",
					message: {
						attachment: {
							type: "template",
							payload: {
								template_type: "button",
								text: input.text,
								buttons: input.buttons.map((button) => ({
									type: button.type,
									title: button.title,
									payload: button.type === "postback" ? button.payload : undefined,
									url: button.type === "web_url" ? button.url : undefined,
								})),
							},
						},
					},
				},
			},
			additional_attributes: {
				provider: "meta",
				channel: "messenger",
				schema_version: "1.0.0",
				trace_id: context.traceId,
			},
		};
	}

	/**
	 * Format human handoff message
	 */
	formatHumanHandoff(
		input: HumanHandoffInput,
		context: FormatContext & { channel: "whatsapp" | "instagram" | "messenger" },
	): FormattedChatwitMessage {
		return {
			content: input.text,
			message_type: "outgoing",
			private: false,
			additional_attributes: {
				provider: "meta",
				channel: context.channel,
				schema_version: "1.0.0",
				trace_id: context.traceId,
				handoff_reason: input.handoffReason,
				assign_to_team: input.assignToTeam,
				conversation_tags: input.conversationTags,
				conversation_status: "open",
			},
		};
	}

	/**
	 * Normalize legacy input format
	 */
	normalizeLegacyInput(legacyInput: any): WhatsAppTextInput {
		return {
			text: legacyInput.message_text || legacyInput.text || "Test message",
		};
	}
}

export class MessageFormatter {
	/**
	 * Format message for Chatwit API
	 */
	formatMessage(params: FormatMessageParams): FormattedMessage {
		const baseResult: FormattedMessage = {
			content: params.content,
			additionalAttributes: {
				provider: "meta",
				channel: params.channel,
				schema_version: "1.0.0",
				trace_id: params.traceId,
			},
		};

		// Add interactive content if provided
		if (params.interactiveData) {
			baseResult.contentAttributes = this.formatInteractiveContent(params.interactiveData, params.channel);
		}

		log.debug("Message formatted for Chatwit", {
			channel: params.channel,
			hasInteractive: !!params.interactiveData,
			traceId: params.traceId,
			conversationId: params.conversationId,
		});

		return baseResult;
	}

	/**
	 * Format interactive content based on channel
	 */
	private formatInteractiveContent(
		data: WhatsAppInteractiveMessage | InstagramQuickReplyMessage | InstagramButtonTemplateMessage,
		channel: "whatsapp" | "instagram" | "messenger",
	): Record<string, any> {
		switch (channel) {
			case "whatsapp":
				return this.formatWhatsAppInteractive(data as WhatsAppInteractiveMessage);

			case "instagram":
			case "messenger":
				return this.formatInstagramContent(data as InstagramQuickReplyMessage | InstagramButtonTemplateMessage);

			default:
				throw new Error(`Unsupported channel: ${channel}`);
		}
	}

	/**
	 * Format WhatsApp interactive message
	 */
	private formatWhatsAppInteractive(data: WhatsAppInteractiveMessage): { interactive: WhatsAppInteractiveContent } {
		const interactive: WhatsAppInteractiveContent = {
			type: "button",
			body: {
				text: data.body,
			},
			action: {
				buttons: data.buttons.map((button: any) => ({
					type: "reply",
					reply: {
						id: button.id,
						title: button.title,
					},
				})),
			},
		};

		// Add optional header
		if (data.header) {
			interactive.header = {
				type: data.header.type,
				text: data.header.text,
				link: data.header.link,
			};
		}

		// Add optional footer
		if (data.footer) {
			interactive.footer = {
				text: data.footer,
			};
		}

		return { interactive };
	}

	/**
	 * Format Instagram content (Quick Reply or Button Template)
	 */
	private formatInstagramContent(data: InstagramQuickReplyMessage | InstagramButtonTemplateMessage): {
		ig: InstagramContent;
	} {
		const ig: InstagramContent = {};

		// Check if it's a Quick Reply message
		if ("quick_replies" in data) {
			ig.quick_replies = data.quick_replies.map((reply: any) => ({
				title: reply.title,
				payload: reply.payload,
			}));
		}

		// Check if it's a Button Template message
		if ("buttons" in data) {
			ig.button_template = {
				text: data.text,
				buttons: data.buttons.map((button: any) => ({
					type: button.type,
					title: button.title,
					payload: button.type === "postback" ? button.payload : undefined,
					url: button.type === "web_url" ? button.url : undefined,
				})),
			};
		}

		return { ig };
	}

	/**
	 * Format simple text message
	 */
	formatTextMessage(params: {
		content: string;
		channel: "whatsapp" | "instagram" | "messenger";
		traceId: string;
	}): FormattedMessage {
		return {
			content: params.content,
			additionalAttributes: {
				provider: "meta",
				channel: params.channel,
				schema_version: "1.0.0",
				trace_id: params.traceId,
			},
		};
	}

	/**
	 * Format human handoff message
	 */
	formatHandoffMessage(params: {
		content: string;
		channel: "whatsapp" | "instagram" | "messenger";
		traceId: string;
		reason: string;
		assignToTeam?: string;
		conversationTags?: string[];
		changeStatus?: boolean;
	}): FormattedMessage {
		return {
			content: params.content,
			additionalAttributes: {
				provider: "meta",
				channel: params.channel,
				schema_version: "1.0.0",
				trace_id: params.traceId,
				handoff_reason: params.reason,
				assign_to_team: params.assignToTeam || "support",
				conversation_tags: params.conversationTags || ["ai_handoff"],
				conversation_status: params.changeStatus ? "open" : undefined,
			},
		};
	}

	/**
	 * Validate formatted message
	 */
	validateFormattedMessage(message: FormattedMessage): boolean {
		// Check required fields
		if (!message.content || !message.additionalAttributes) {
			return false;
		}

		const attrs = message.additionalAttributes;

		// Check required additional_attributes
		if (!attrs.provider || !attrs.channel || !attrs.schema_version) {
			return false;
		}

		// Validate schema version
		if (attrs.schema_version !== "1.0.0") {
			log.warn("Invalid schema version", {
				version: attrs.schema_version,
				expected: "1.0.0",
			});
			return false;
		}

		// Validate channel
		if (!["whatsapp", "instagram", "messenger"].includes(attrs.channel)) {
			log.warn("Invalid channel", { channel: attrs.channel });
			return false;
		}

		// Validate provider
		if (attrs.provider !== "meta") {
			log.warn("Invalid provider", { provider: attrs.provider });
			return false;
		}

		return true;
	}

	/**
	 * Get content attributes size for logging
	 */
	getContentAttributesSize(contentAttributes?: Record<string, any>): number {
		if (!contentAttributes) return 0;
		return JSON.stringify(contentAttributes).length;
	}

	/**
	 * Extract channel from interactive data
	 */
	detectChannelFromData(
		data: WhatsAppInteractiveMessage | InstagramQuickReplyMessage | InstagramButtonTemplateMessage,
	): "whatsapp" | "instagram" {
		// WhatsApp has 'buttons' with 'id' field
		if ("buttons" in data && data.buttons.length > 0 && "id" in data.buttons[0]) {
			return "whatsapp";
		}

		// Instagram has 'quick_replies' or 'buttons' with 'payload'/'url'
		if (
			"quick_replies" in data ||
			("buttons" in data && data.buttons.length > 0 && ("payload" in data.buttons[0] || "url" in data.buttons[0]))
		) {
			return "instagram";
		}

		// Default to WhatsApp if unclear
		return "whatsapp";
	}
}

/**
 * Create default message formatter instance
 */
export function createMessageFormatter(): MessageFormatter {
	return new MessageFormatter();
}
