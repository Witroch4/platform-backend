/**
 * Flow Builder - Constants
 *
 * Constantes de configuração, limites e cores.
 */

import { FlowNodeType } from "./enums";

// =============================================================================
// CHANNEL LIMITS
// =============================================================================

/**
 * Limites de caracteres por canal (WhatsApp vs Instagram/Facebook)
 */
export const CHANNEL_CHAR_LIMITS = {
	whatsapp: {
		body: 1024,
		headerText: 60,
		footer: 60,
		buttonTitle: 20,
		copyCode: 15,
		payloadId: 256,
		maxButtons: 3,
		listItemTitle: 24,
		listItemDescription: 72,
	},
	instagram: {
		body: 1000,
		headerText: null, // N/A
		footer: null, // N/A
		buttonTitle: 20,
		payloadId: 1000,
		maxButtons: 3, // Para BT (botões); QR pode ter até 13
		maxQuickReplies: 13,
		carousel: 10,
		buttonTemplateBody: 640,
	},
} as const;

/**
 * Tipo do canal para limites de caracteres
 */
export type ChannelType = keyof typeof CHANNEL_CHAR_LIMITS;

/**
 * Retorna o limite de caracteres para um campo específico
 */
export function getCharLimit(
	field: "body" | "headerText" | "footer" | "buttonTitle" | "listItemTitle" | "listItemDescription",
	channel: ChannelType = "whatsapp",
): number | null {
	const limits = CHANNEL_CHAR_LIMITS[channel];
	return limits[field as keyof typeof limits] ?? null;
}

// =============================================================================
// CANVAS CONSTANTS
// =============================================================================

/**
 * Constantes do canvas
 */
export const FLOW_CANVAS_CONSTANTS = {
	GRID_SIZE: 20,
	DEFAULT_NODE_WIDTH: 280,
	DEFAULT_NODE_HEIGHT: 120,
	NODE_SPACING_X: 200,
	NODE_SPACING_Y: 150,
	MIN_ZOOM: 0.3,
	MAX_ZOOM: 2,
	DEFAULT_ZOOM: 1,
	DEFAULT_VIEWPORT: { x: 0, y: 0, zoom: 1 },
} as const;

// =============================================================================
// NODE COLORS
// =============================================================================

/**
 * Cores para diferentes tipos de nós
 */
export const NODE_COLORS = {
	[FlowNodeType.START]: {
		bg: "bg-green-50 dark:bg-green-950",
		border: "border-green-500",
		icon: "text-green-600",
	},
	[FlowNodeType.INTERACTIVE_MESSAGE]: {
		bg: "bg-blue-50 dark:bg-blue-950",
		border: "border-blue-500",
		icon: "text-blue-600",
	},
	[FlowNodeType.TEXT_MESSAGE]: {
		bg: "bg-slate-50 dark:bg-slate-950",
		border: "border-slate-500",
		icon: "text-slate-600",
	},
	[FlowNodeType.EMOJI_REACTION]: {
		bg: "bg-yellow-50 dark:bg-yellow-950",
		border: "border-yellow-500",
		icon: "text-yellow-600",
	},
	[FlowNodeType.TEXT_REACTION]: {
		bg: "bg-purple-50 dark:bg-purple-950",
		border: "border-purple-500",
		icon: "text-purple-600",
	},
	[FlowNodeType.HANDOFF]: {
		bg: "bg-orange-50 dark:bg-orange-900/40",
		border: "border-orange-500 dark:border-orange-400",
		icon: "text-orange-600 dark:text-orange-400",
	},
	[FlowNodeType.ADD_TAG]: {
		bg: "bg-pink-50 dark:bg-pink-950",
		border: "border-pink-500",
		icon: "text-pink-600",
	},
	[FlowNodeType.CHATWIT_ACTION]: {
		bg: "bg-indigo-50 dark:bg-indigo-950",
		border: "border-indigo-500",
		icon: "text-indigo-600",
	},
	[FlowNodeType.END_CONVERSATION]: {
		bg: "bg-red-50 dark:bg-red-950",
		border: "border-red-500",
		icon: "text-red-600",
	},
	[FlowNodeType.CONDITION]: {
		bg: "bg-indigo-50 dark:bg-indigo-950",
		border: "border-indigo-500",
		icon: "text-indigo-600",
	},
	[FlowNodeType.DELAY]: {
		bg: "bg-cyan-50 dark:bg-cyan-950",
		border: "border-cyan-500",
		icon: "text-cyan-600",
	},
	[FlowNodeType.MEDIA]: {
		bg: "bg-teal-50 dark:bg-teal-950",
		border: "border-teal-500",
		icon: "text-teal-600",
	},
	[FlowNodeType.QUICK_REPLIES]: {
		bg: "bg-violet-50 dark:bg-violet-950",
		border: "border-violet-500",
		icon: "text-violet-600",
	},
	[FlowNodeType.CAROUSEL]: {
		bg: "bg-amber-50 dark:bg-amber-950",
		border: "border-amber-500",
		icon: "text-amber-600",
	},
	[FlowNodeType.TEMPLATE]: {
		bg: "bg-emerald-50 dark:bg-emerald-950",
		border: "border-emerald-500",
		icon: "text-emerald-600",
	},
	[FlowNodeType.WHATSAPP_TEMPLATE]: {
		bg: "bg-emerald-50 dark:bg-emerald-950",
		border: "border-emerald-500",
		icon: "text-emerald-600",
	},
	// Deprecated but kept for backward compatibility
	[FlowNodeType.BUTTON_TEMPLATE]: {
		bg: "bg-sky-50 dark:bg-sky-950",
		border: "border-sky-500",
		icon: "text-sky-600",
	},
	[FlowNodeType.COUPON_TEMPLATE]: {
		bg: "bg-lime-50 dark:bg-lime-950",
		border: "border-lime-500",
		icon: "text-lime-600",
	},
	[FlowNodeType.CALL_TEMPLATE]: {
		bg: "bg-fuchsia-50 dark:bg-fuchsia-950",
		border: "border-fuchsia-500",
		icon: "text-fuchsia-600",
	},
	[FlowNodeType.URL_TEMPLATE]: {
		bg: "bg-rose-50 dark:bg-rose-950",
		border: "border-rose-500",
		icon: "text-rose-600",
	},
} as const;
