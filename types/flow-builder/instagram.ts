/**
 * Flow Builder - Instagram/Facebook Types
 *
 * Tipos específicos para Instagram Direct e Facebook Messenger.
 */

import type { FlowNodeDataBase } from "./nodes";
import type { InstagramButtonType } from "./enums";

// =============================================================================
// QUICK REPLIES
// =============================================================================

/**
 * Item de Quick Reply para Instagram/Facebook
 */
export interface QuickReplyItem {
	id: string;
	/** Título do quick reply (max 20 chars) */
	title: string;
	/** Payload enviado quando clicado */
	payload: string;
	/** URL de ícone opcional */
	imageUrl?: string;
}

/**
 * Dados específicos para nó de Quick Replies (Instagram/Facebook)
 * Suporta até 13 quick replies
 */
export interface QuickRepliesNodeData extends FlowNodeDataBase {
	/** Texto da pergunta/prompt (max 1000 chars) */
	promptText: string;
	/** Lista de quick replies (max 13) */
	quickReplies: QuickReplyItem[];
}

// =============================================================================
// CAROUSEL (Generic Template)
// =============================================================================

/**
 * Botão de card do carrossel
 */
export interface CarouselCardButton {
	id: string;
	/** Tipo: web_url abre link, postback envia payload */
	type: InstagramButtonType;
	/** Título do botão (max 20 chars) */
	title: string;
	/** URL para web_url */
	url?: string;
	/** Payload para postback */
	payload?: string;
}

/**
 * Card do carrossel (Generic Template)
 */
export interface CarouselCard {
	id: string;
	/** Título do card (max 80 chars) */
	title: string;
	/** Subtítulo opcional (max 80 chars) */
	subtitle?: string;
	/** URL da imagem do card */
	imageUrl?: string;
	/** Ação padrão ao clicar no card */
	defaultAction?: {
		type: "web_url";
		url: string;
		messengerExtensions?: boolean;
		webviewHeightRatio?: "compact" | "tall" | "full";
	};
	/** Botões do card (max 3) */
	buttons?: CarouselCardButton[];
}

/**
 * Dados específicos para nó de Carrossel (Generic Template)
 * Suporta até 10 cards
 */
export interface CarouselNodeData extends FlowNodeDataBase {
	/** Cards do carrossel (max 10) */
	cards: CarouselCard[];
}

// =============================================================================
// VALIDATION RULES
// =============================================================================

/**
 * Regras de validação para nós Instagram/Facebook
 */
export const INSTAGRAM_VALIDATION = {
	quickReplies: {
		maxCount: 13,
		titleMaxLength: 20,
		promptMaxLength: 1000,
	},
	buttonTemplate: {
		maxButtons: 3,
		textMaxLength: 640,
		buttonTitleMaxLength: 20,
	},
	genericTemplate: {
		maxElements: 10,
		titleMaxLength: 80,
		subtitleMaxLength: 80,
		maxButtonsPerElement: 3,
	},
} as const;
