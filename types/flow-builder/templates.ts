/**
 * Flow Builder - WhatsApp Template Types
 *
 * Tipos específicos para WhatsApp Official Templates (Meta API).
 */

import type { FlowNodeType } from "./enums";
import type { InteractiveMessageElement, ElementPaletteItem } from "./elements";

// =============================================================================
// TEMPLATE BUTTON TYPES
// =============================================================================

/**
 * Tipo de botão do template WhatsApp (até 10 botões misturados)
 */
export type TemplateButtonType =
	| "QUICK_REPLY"
	| "URL"
	| "PHONE_NUMBER"
	| "COPY_CODE"
	| "VOICE_CALL"
	| "FLOW"
	| "SPM"
	| "MPM";

/**
 * Botão de template WhatsApp
 */
export interface TemplateButton {
	/** ID único do botão (flow_tpl_btn_*) */
	id: string;
	/** Tipo do botão */
	type: TemplateButtonType;
	/** Texto do botão (max 25 chars) */
	text: string;
	/** URL para botão URL */
	url?: string;
	/** Número de telefone para botão PHONE_NUMBER */
	phoneNumber?: string;
	/** Código de exemplo para COPY_CODE (max 15 chars) */
	exampleCode?: string;
	/** ID do WhatsApp Flow para botão FLOW */
	flowId?: string;
	/** ID do produto para SPM/MPM */
	productId?: string;
	/** TTL em minutos para VOICE_CALL (padrão: 10080 = 7 dias) */
	ttlMinutes?: number;
}

// =============================================================================
// TEMPLATE STRUCTURE
// =============================================================================

/**
 * Header do template WhatsApp
 */
export interface TemplateHeader {
	/** Tipo de header */
	type: "NONE" | "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT";
	/** Conteúdo textual (para TEXT) */
	content?: string;
	/** URL da mídia (para IMAGE/VIDEO/DOCUMENT) */
	mediaUrl?: string;
	/** Handle da Meta API para mídia (obtido após upload) */
	mediaHandle?: string;
	/** Variáveis extraídas do header */
	variables?: string[];
}

/**
 * Body do template WhatsApp
 */
export interface TemplateBody {
	/** Texto do body (max 1024 chars) */
	text: string;
	/** Variáveis extraídas ({{nome}}, {{data}}, etc.) */
	variables?: string[];
	/** Parâmetros nomeados com exemplos para Meta API */
	namedParams?: Array<{ name: string; example: string }>;
}

/**
 * Footer do template WhatsApp
 */
export interface TemplateFooter {
	/** Texto do footer (max 60 chars) */
	text: string;
}

/**
 * Componentes importados da Meta API
 */
export interface MetaTemplateComponents {
	header?: unknown;
	body?: unknown;
	footer?: unknown;
	buttons?: unknown[];
}

// =============================================================================
// TEMPLATE LIMITS (UNIFIED)
// =============================================================================

/**
 * Limites de validação para Template WhatsApp Unificado
 *
 * Regras descobertas via testes na Meta API:
 * - Máximo 10 botões totais
 * - CTAs agrupados (COPY_CODE → VOICE_CALL → PHONE_NUMBER → URL) + QUICK_REPLY no final
 * - PHONE_NUMBER e VOICE_CALL são mutuamente exclusivos (telefone OU WhatsApp, não ambos)
 * - FLOW nativo não é compatível com outros CTAs
 */
export const WHATSAPP_TEMPLATE_LIMITS = {
	bodyMaxLength: 1024,
	buttonTextMaxLength: 25,
	couponCodeMaxLength: 15,
	phoneNumberPattern: /^\+[1-9]\d{1,14}$/, // E.164

	// Limites totais
	maxButtons: 10,

	// Limites por tipo CTA
	maxCopyCodeButtons: 1,
	maxUrlButtons: 2,
	maxPhoneButtons: 1, // PHONE_NUMBER (ligar para telefone)
	maxVoiceCallButtons: 1, // VOICE_CALL (ligar via WhatsApp)

	// Restrição especial
	phoneAndVoiceCallMutuallyExclusive: true, // não pode ter ambos

	// TTL padrão para VOICE_CALL (7 dias)
	voiceCallDefaultTtlMinutes: 10080,
} as const;

// =============================================================================
// DEPRECATED LIMITS (Backward Compatibility)
// =============================================================================

/** @deprecated Use WHATSAPP_TEMPLATE_LIMITS */
export const BUTTON_TEMPLATE_LIMITS = WHATSAPP_TEMPLATE_LIMITS;

/** @deprecated Use WHATSAPP_TEMPLATE_LIMITS */
export const COUPON_TEMPLATE_LIMITS = WHATSAPP_TEMPLATE_LIMITS;

/** @deprecated Use WHATSAPP_TEMPLATE_LIMITS */
export const CALL_TEMPLATE_LIMITS = WHATSAPP_TEMPLATE_LIMITS;

/** @deprecated Use WHATSAPP_TEMPLATE_LIMITS */
export const URL_TEMPLATE_LIMITS = WHATSAPP_TEMPLATE_LIMITS;

// =============================================================================
// TEMPLATE PALETTE
// =============================================================================

/**
 * Item da paleta de templates
 */
export interface TemplatePaletteItem {
	type: FlowNodeType;
	icon: string;
	label: string;
	description: string;
	category: "template";
	/** Tipos de botão aceitos neste container (múltiplos para template unificado) */
	buttonTypes: TemplateButtonType[];
	/** Número máximo de botões */
	maxButtons: number;
}

/**
 * Tipo de elemento para templates
 */
export type TemplateElementType =
	| "header_text"
	| "header_image"
	| "body"
	| "footer"
	| "button"
	| "button_quick_reply"
	| "button_url"
	| "button_phone"
	| "button_voice_call"
	| "button_copy_code";

/**
 * Item de elemento para templates
 */
export interface TemplateElementItem {
	type: TemplateElementType;
	icon: string;
	label: string;
	description: string;
	/** Tipos de container que aceitam este elemento */
	validContainers: FlowNodeType[];
}

/**
 * MIME type para drag & drop de elementos de template
 */
export const TEMPLATE_ELEMENT_MIME = "application/flowbuilder-template-element";

// =============================================================================
// TEMPLATE PALETTE ITEMS (requires FlowNodeType - defer to palette.ts)
// =============================================================================

// Note: TEMPLATE_PALETTE_ITEMS, TEMPLATE_ELEMENT_ITEMS, and TEMPLATE_SPECIAL_BUTTON_ITEMS
// are defined in palette.ts to avoid circular dependency with FlowNodeType
