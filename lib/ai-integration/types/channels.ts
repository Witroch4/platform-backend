/**
 * Channel-specific types and configurations
 * Based on requirements 13.1, 13.2
 */

export type Channel = "whatsapp" | "instagram" | "messenger";

export interface ChannelLimits {
	whatsapp: {
		body: 1024;
		header: 60;
		footer: 60;
		buttons: { min: 1; max: 3 };
		buttonTitle: 20;
		buttonId: 256;
	};
	instagram: {
		quickReply: {
			text: 1000;
			maxItems: 13; // Capar em 3 por UX
			title: 20;
			payload: 1000;
		};
		buttonTemplate: {
			text: 640;
			buttons: { min: 1; max: 3 };
			title: 20;
			requireHttps: true;
		};
	};
}

export interface WhatsAppButton {
	type: "reply";
	title: string;
	id: string;
}

export interface InstagramQuickReply {
	title: string;
	payload: string;
}

export interface InstagramButton {
	type: "postback" | "web_url";
	title: string;
	payload?: string;
	url?: string;
}

export interface ChannelMessage {
	channel: Channel;
	text: string;
	buttons?: WhatsAppButton[] | InstagramQuickReply[] | InstagramButton[];
	header?: {
		type: "text" | "image" | "video" | "document";
		text?: string;
		link?: string;
	};
	footer?: string;
}

export interface ChannelValidationResult {
	isValid: boolean;
	errors: string[];
	warnings: string[];
	sanitized?: ChannelMessage;
}

export interface ButtonPayload {
	type: "intent" | "flow" | "help";
	slug: string;
	metadata?: Record<string, any>;
}

export interface ClickPayload {
	channel: Channel;
	payloadType: "button_reply" | "quick_reply" | "postback";
	payload: string;
	conversationId: number;
	messageId: string;
	timestamp: number;
}

// Additional types for message formatting
export interface WhatsAppInteractiveMessage {
	body: string;
	header?: {
		type: "text" | "image" | "video" | "document";
		text?: string;
		link?: string;
	};
	footer?: string;
	buttons: WhatsAppButton[];
}

export interface InstagramQuickReplyMessage {
	text: string;
	quick_replies: InstagramQuickReply[];
}

export interface InstagramButtonTemplateMessage {
	text: string;
	buttons: InstagramButton[];
}
