/**
 * Chatwit Webhook Payload Types
 * Based on requirements 13.1, 13.2
 */

export interface ChatwitWebhookPayload {
	account_id: number;
	channel: "whatsapp" | "instagram" | "messenger";
	conversation: {
		id: number;
		inbox_id: number;
		status: "open" | "resolved" | "pending";
	};
	message: {
		id: number;
		message_type: "incoming" | "outgoing";
		content_type: string | null;
		content: string | null; // Obrigatório content OR content_attributes
		content_attributes?: Record<string, any>; // Obrigatório content OR content_attributes
		created_at: number;
		source_id?: string | null; // ID no provedor (WhatsApp wamid, Instagram mid)
		sender?: {
			type: "contact" | "agent";
			id: number;
			name?: string | null;
		};
	};
}

export interface WebhookResponse {
	ok: boolean;
	skipped?: boolean;
	dedup?: boolean;
	throttled?: boolean;
}

export interface WebhookHeaders {
	"x-chatwit-signature": string;
	"x-chatwit-timestamp": string;
	"x-chatwit-signature-version"?: string;
	"content-type": string;
}

export interface WebhookValidationResult {
	isValid: boolean;
	error?: string;
	timestamp?: number;
}

export interface IdempotencyKey {
	accountId: number;
	conversationId: number;
	messageId: string;
}

export interface RateLimitScope {
	conversation: string; // conversation_id
	account: string; // account_id
	contact: string; // contact_id
}

export interface RateLimitConfig {
	conversation: { limit: number; window: number }; // 8/10s
	account: { limit: number; window: number }; // 80/10s
	contact: { limit: number; window: number }; // 15/10s
}
