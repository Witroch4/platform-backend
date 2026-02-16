/**
 * Payload Normalization Service
 * Based on requirements 1.1, 4.4, 5.4
 */

import { ChatwitWebhookPayload } from "../types/webhook";

export interface NormalizedPayload {
	text: string;
	isButtonClick: boolean;
	buttonPayload?: string;
	hasMedia: boolean;
	originalContent: string | null;
	originalContentAttributes?: Record<string, any>;
}

export class PayloadNormalizerService {
	/**
	 * Normalize incoming webhook payload
	 * - Normalize text (trim, NFkc)
	 * - Drop media and attachments
	 * - Extract click payloads (WA button_reply.id, IG quick_reply.payload/postback.payload)
	 */
	normalizePayload(payload: ChatwitWebhookPayload): NormalizedPayload {
		const { message } = payload;

		// Initialize result
		const result: NormalizedPayload = {
			text: "",
			isButtonClick: false,
			hasMedia: false,
			originalContent: message.content,
			originalContentAttributes: message.content_attributes,
		};

		// Check for button clicks first
		const buttonClick = this.extractButtonClick(payload);
		if (buttonClick) {
			result.isButtonClick = true;
			result.buttonPayload = buttonClick.payload;
			result.text = buttonClick.text || buttonClick.payload;
			return result;
		}

		// Check for media content
		result.hasMedia = this.hasMediaContent(message);

		// Extract and normalize text content
		let textContent = "";

		if (message.content) {
			textContent = message.content;
		} else if (message.content_attributes) {
			textContent = this.extractTextFromContentAttributes(message.content_attributes);
		}

		// Normalize text: trim and Unicode normalization (NFkC)
		result.text = this.normalizeText(textContent);

		return result;
	}

	/**
	 * Extract button click payloads from different channels
	 */
	private extractButtonClick(payload: ChatwitWebhookPayload): { payload: string; text?: string } | null {
		const { message, channel } = payload;

		if (!message.content_attributes) {
			return null;
		}

		const attrs = message.content_attributes;

		switch (channel) {
			case "whatsapp":
				// WhatsApp button_reply.id
				if (attrs.interactive?.button_reply?.id) {
					return {
						payload: attrs.interactive.button_reply.id,
						text: attrs.interactive.button_reply.title,
					};
				}
				break;

			case "instagram":
				// Instagram quick_reply.payload
				if (attrs.quick_reply?.payload) {
					return {
						payload: attrs.quick_reply.payload,
						text: attrs.quick_reply.title,
					};
				}

				// Instagram postback.payload
				if (attrs.postback?.payload) {
					return {
						payload: attrs.postback.payload,
						text: attrs.postback.title,
					};
				}
				break;

			case "messenger":
				// Messenger postback.payload (similar to Instagram)
				if (attrs.postback?.payload) {
					return {
						payload: attrs.postback.payload,
						text: attrs.postback.title,
					};
				}

				// Messenger quick_reply.payload
				if (attrs.quick_reply?.payload) {
					return {
						payload: attrs.quick_reply.payload,
					};
				}
				break;
		}

		return null;
	}

	/**
	 * Check if message contains media content
	 */
	private hasMediaContent(message: ChatwitWebhookPayload["message"]): boolean {
		// Check content_type for media types
		if (message.content_type) {
			const mediaTypes = ["image", "video", "audio", "document", "sticker", "location"];
			if (mediaTypes.some((type) => message.content_type?.includes(type))) {
				return true;
			}
		}

		// Check content_attributes for media
		if (message.content_attributes) {
			const attrs = message.content_attributes;

			// Common media indicators
			const mediaKeys = ["image", "video", "audio", "document", "sticker", "location", "attachment"];
			if (mediaKeys.some((key) => attrs[key])) {
				return true;
			}

			// WhatsApp specific media
			if (attrs.type && ["image", "video", "audio", "document", "sticker", "location"].includes(attrs.type)) {
				return true;
			}
		}

		return false;
	}

	/**
	 * Extract text content from content_attributes
	 */
	private extractTextFromContentAttributes(contentAttributes: Record<string, any>): string {
		// Try common text fields
		const textFields = ["text", "body", "message", "content"];

		for (const field of textFields) {
			if (contentAttributes[field] && typeof contentAttributes[field] === "string") {
				return contentAttributes[field];
			}

			// Check nested objects
			if (contentAttributes[field] && typeof contentAttributes[field] === "object") {
				const nestedText = this.extractTextFromContentAttributes(contentAttributes[field]);
				if (nestedText) {
					return nestedText;
				}
			}
		}

		// WhatsApp specific
		if (contentAttributes.interactive?.body?.text) {
			return contentAttributes.interactive.body.text;
		}

		// Instagram/Messenger specific
		if (contentAttributes.message?.text) {
			return contentAttributes.message.text;
		}

		return "";
	}

	/**
	 * Normalize text content
	 * - Trim whitespace
	 * - Unicode normalization (NFkC)
	 * - Remove zero-width characters
	 * - Collapse multiple spaces
	 */
	private normalizeText(text: string): string {
		if (!text || typeof text !== "string") {
			return "";
		}

		return text
			.trim() // Remove leading/trailing whitespace
			.normalize("NFKC") // Unicode normalization
			.replace(/[\u200B-\u200D\uFEFF]/g, "") // Remove zero-width characters
			.replace(/\s+/g, " ") // Collapse multiple spaces
			.trim(); // Final trim
	}

	/**
	 * Check if payload should be skipped (media only, no text)
	 */
	shouldSkipPayload(normalized: NormalizedPayload): boolean {
		// Skip if it's media without text and not a button click
		return normalized.hasMedia && !normalized.text && !normalized.isButtonClick;
	}

	/**
	 * Extract provider correlation fields
	 */
	extractProviderFields(payload: ChatwitWebhookPayload): {
		sourceId?: string;
		providerTimestamp?: number;
		channel: string;
	} {
		return {
			sourceId: payload.message.source_id || undefined,
			providerTimestamp: payload.message.created_at,
			channel: payload.channel,
		};
	}

	/**
	 * Validate payload size (reject > 256 KB)
	 */
	validatePayloadSize(payload: any, maxSizeKB: number = 256): boolean {
		try {
			const payloadSize = Buffer.byteLength(JSON.stringify(payload), "utf8");
			const maxSizeBytes = maxSizeKB * 1024;
			return payloadSize <= maxSizeBytes;
		} catch (error) {
			console.error("Failed to calculate payload size:", error);
			return false;
		}
	}

	/**
	 * Get payload size in bytes
	 */
	getPayloadSize(payload: any): number {
		try {
			return Buffer.byteLength(JSON.stringify(payload), "utf8");
		} catch (error) {
			console.error("Failed to calculate payload size:", error);
			return 0;
		}
	}
}
