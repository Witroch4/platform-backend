/**
 * Flow Builder - Enums & Status Types
 *
 * Tipos de nós, status de execução e categorias.
 */

// =============================================================================
// NODE TYPES
// =============================================================================

/**
 * Tipos de nós suportados no Flow Builder
 */
export enum FlowNodeType {
	// Triggers
	START = "start",

	// Messages
	INTERACTIVE_MESSAGE = "interactive_message",
	TEXT_MESSAGE = "text_message",

	// WhatsApp Official Templates
	/** @deprecated Use WHATSAPP_TEMPLATE instead */
	TEMPLATE = "template",

	// WhatsApp Template Unificado (aceita todos os tipos de botão)
	WHATSAPP_TEMPLATE = "whatsapp_template",

	// @deprecated - Templates antigos (manter para backward compatibility em flows existentes)
	/** @deprecated Use WHATSAPP_TEMPLATE */
	BUTTON_TEMPLATE = "button_template",
	/** @deprecated Use WHATSAPP_TEMPLATE */
	COUPON_TEMPLATE = "coupon_template",
	/** @deprecated Use WHATSAPP_TEMPLATE */
	CALL_TEMPLATE = "call_template",
	/** @deprecated Use WHATSAPP_TEMPLATE */
	URL_TEMPLATE = "url_template",

	// Reactions
	EMOJI_REACTION = "emoji_reaction",
	TEXT_REACTION = "text_reaction",

	// Actions
	HANDOFF = "handoff",
	ADD_TAG = "add_tag",
	REMOVE_TAG = "remove_tag",
	CHATWIT_ACTION = "chatwit_action", // Nova ação
	END_CONVERSATION = "end",

	// Logic
	CONDITION = "condition",
	DELAY = "delay",

	// Input
	WAIT_FOR_REPLY = "wait_for_reply",

	// Media
	MEDIA = "media",

	// Instagram/Facebook Specific
	QUICK_REPLIES = "quick_replies",
	CAROUSEL = "carousel",
}

// =============================================================================
// STATUS TYPES
// =============================================================================

/**
 * Status de execução de um nó
 */
export type FlowNodeExecutionStatus = "idle" | "running" | "success" | "error" | "waiting";

/**
 * Status de aprovação do template WhatsApp
 */
export type TemplateApprovalStatus = "APPROVED" | "PENDING" | "REJECTED" | "DRAFT";

/**
 * Modo de operação do nó de template
 */
export type TemplateNodeMode = "import" | "create" | "draft";

/**
 * Categoria do template WhatsApp
 */
export type TemplateCategory = "MARKETING" | "UTILITY" | "AUTHENTICATION";

/**
 * Tipo de mídia suportado
 */
export type MediaType = "image" | "video" | "document" | "audio";

/**
 * Tipo de botão para Instagram/Facebook
 */
export type InstagramButtonType = "web_url" | "postback";
