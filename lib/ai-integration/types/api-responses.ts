/**
 * API Response Types for Chatwit and OpenAI integrations
 * Based on requirements 13.1, 13.2
 */

export interface ChatwitMessagePayload {
	content: string;
	message_type: "outgoing";
	private?: boolean;
	content_attributes?: {
		interactive?: WhatsAppInteractiveContent;
		ig?: InstagramContent;
	};
	additional_attributes: {
		provider: "meta";
		channel: "whatsapp" | "instagram" | "messenger";
		schema_version: "1.0.0"; // OBRIGATÓRIO
		trace_id?: string;
		handoff_reason?: string;
		assign_to_team?: string;
		conversation_tags?: string[];
		conversation_status?: string;
	};
}

export interface WhatsAppInteractiveContent {
	type: "button";
	header?: {
		type: "text" | "image" | "video" | "document";
		text?: string;
		link?: string;
	};
	body: {
		text: string;
	};
	footer?: {
		text: string;
	};
	action: {
		buttons: Array<{
			type: "reply";
			reply: {
				id: string;
				title: string;
			};
		}>;
	};
}

export interface InstagramContent {
	quick_replies?: Array<{
		title: string;
		payload: string;
	}>;
	button_template?: {
		text: string;
		buttons: Array<{
			type: "postback" | "web_url";
			title: string;
			payload?: string;
			url?: string;
		}>;
	};
}

export interface ChatwitApiResponse {
	id?: number;
	content?: string;
	message_type?: string;
	created_at?: string;
	conversation_id?: number;
	error?: string;
	message?: string;
}

export interface OpenAIEmbeddingResponse {
	object: "list";
	data: Array<{
		object: "embedding";
		embedding: number[];
		index: number;
	}>;
	model: string;
	usage: {
		prompt_tokens: number;
		total_tokens: number;
	};
}

export interface OpenAIStructuredResponse<T = any> {
	id: string;
	object: "chat.completion";
	created: number;
	model: string;
	choices: Array<{
		index: number;
		message: {
			role: "assistant";
			content: string;
			parsed?: T;
		};
		finish_reason: "stop" | "length" | "content_filter";
	}>;
	usage: {
		prompt_tokens: number;
		completion_tokens: number;
		total_tokens: number;
	};
}

export interface ApiErrorResponse {
	error: {
		message: string;
		type: string;
		code?: string;
		param?: string;
	};
	status: number;
	retryable: boolean;
	retryAfter?: number;
}
