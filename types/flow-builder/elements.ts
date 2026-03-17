/**
 * Flow Builder - Interactive Message Elements
 *
 * Blocos modulares que compõem mensagens interativas (Typebot/Flowise-like).
 */

// =============================================================================
// ELEMENT TYPES
// =============================================================================

export type InteractiveMessageElementType =
	| "header_text"
	| "header_image"
	| "body"
	| "footer"
	| "button"
	| "button_copy_code"
	| "button_phone"
	| "button_voice_call"
	| "button_url";

// =============================================================================
// ELEMENT INTERFACES
// =============================================================================

export interface InteractiveMessageElementBase {
	id: string;
	type: InteractiveMessageElementType;
}

export interface InteractiveMessageHeaderTextElement extends InteractiveMessageElementBase {
	type: "header_text";
	text: string;
}

export interface InteractiveMessageHeaderImageElement extends InteractiveMessageElementBase {
	type: "header_image";
	url?: string;
	caption?: string;
	/** Handle da Meta API para templates (obtido após upload via MetaMediaUpload) */
	mediaHandle?: string;
}

export interface InteractiveMessageBodyElement extends InteractiveMessageElementBase {
	type: "body";
	text: string;
}

export interface InteractiveMessageFooterElement extends InteractiveMessageElementBase {
	type: "footer";
	text: string;
}

export interface InteractiveMessageButtonElement extends InteractiveMessageElementBase {
	type: "button";
	title: string;
	description?: string;
}

/** Botão COPY_CODE para Coupon Templates (PIX, cupons) */
export interface InteractiveMessageButtonCopyCodeElement extends InteractiveMessageElementBase {
	type: "button_copy_code";
	title: string;
	couponCode: string;
}

/** Botão PHONE_NUMBER para Call Templates (ligação direta) */
export interface InteractiveMessageButtonPhoneElement extends InteractiveMessageElementBase {
	type: "button_phone";
	title: string;
	phoneNumber: string;
}

/** Botão URL para URL Templates (links externos) */
export interface InteractiveMessageButtonUrlElement extends InteractiveMessageElementBase {
	type: "button_url";
	title: string;
	url: string;
}

/** Botão VOICE_CALL para ligar via WhatsApp */
export interface InteractiveMessageButtonVoiceCallElement extends InteractiveMessageElementBase {
	type: "button_voice_call";
	title: string;
	/** TTL em minutos (padrão: 10080 = 7 dias) */
	ttlMinutes?: number;
}

// =============================================================================
// UNION TYPE
// =============================================================================

export type InteractiveMessageElement =
	| InteractiveMessageHeaderTextElement
	| InteractiveMessageHeaderImageElement
	| InteractiveMessageBodyElement
	| InteractiveMessageFooterElement
	| InteractiveMessageButtonElement
	| InteractiveMessageButtonCopyCodeElement
	| InteractiveMessageButtonPhoneElement
	| InteractiveMessageButtonVoiceCallElement
	| InteractiveMessageButtonUrlElement;

// =============================================================================
// ELEMENT PALETTE
// =============================================================================

export const FLOWBUILDER_ELEMENT_MIME = "application/flowbuilder-element";

export interface ElementPaletteItem {
	type: InteractiveMessageElementType;
	icon: string;
	label: string;
	description: string;
}

/**
 * Elementos para Mensagem Interativa (paleta principal)
 */
export const INTERACTIVE_MESSAGE_ELEMENT_ITEMS: ElementPaletteItem[] = [
	{
		type: "header_text",
		icon: "🏷️",
		label: "Header (texto)",
		description: "Título acima do corpo da mensagem",
	},
	{
		type: "header_image",
		icon: "🖼️",
		label: "Header (imagem)",
		description: "Imagem no topo da mensagem",
	},
	{
		type: "body",
		icon: "📝",
		label: "Body",
		description: "Texto principal (obrigatório)",
	},
	{
		type: "footer",
		icon: "📎",
		label: "Footer",
		description: "Texto de rodapé",
	},
	{
		type: "button",
		icon: "🔘",
		label: "Botão",
		description: "Um botão (ponto de conexão)",
	},
	{
		type: "button_url",
		icon: "🔗",
		label: "Botão CTA (URL)",
		description: "Link externo (checkout, site)",
	},
];

/**
 * Elementos COMPARTILHADOS - funcionam tanto para Mensagem Interativa quanto para Templates
 */
export const SHARED_ELEMENT_ITEMS: ElementPaletteItem[] = [
	{
		type: "header_text",
		icon: "🏷️",
		label: "Header (texto)",
		description: "Título acima do corpo da mensagem",
	},
	{
		type: "header_image",
		icon: "🖼️",
		label: "Header (imagem)",
		description: "Imagem no topo da mensagem",
	},
	{
		type: "body",
		icon: "📝",
		label: "Body",
		description: "Texto principal (obrigatório)",
	},
	{
		type: "footer",
		icon: "📎",
		label: "Footer",
		description: "Texto de rodapé",
	},
	{
		type: "button",
		icon: "🔘",
		label: "Botão",
		description: "Um botão (ponto de conexão)",
	},
	{
		type: "button_url",
		icon: "🔗",
		label: "Botão CTA (URL)",
		description: "Link externo (checkout, site)",
	},
];
