/**
 * Flow Builder - Palette Items
 *
 * Definições de itens para paletas de nós e elementos.
 */

import { FlowNodeType } from "./enums";
import type { TemplatePaletteItem, TemplateElementItem } from "./templates";

// =============================================================================
// NODE PALETTE
// =============================================================================

/**
 * Item da paleta de nós
 */
export interface PaletteItem {
	type: FlowNodeType;
	icon: string;
	label: string;
	description: string;
	category: "trigger" | "message" | "reaction" | "action" | "logic";
}

// =============================================================================
// SHARED PALETTE ITEMS (Base items used by both WhatsApp and Instagram)
// =============================================================================

const SHARED_TRIGGER_ITEMS: PaletteItem[] = [
	{
		type: FlowNodeType.START,
		icon: "🚀",
		label: "Início",
		description: "Ponto de entrada do fluxo",
		category: "trigger",
	},
];

const SHARED_LOGIC_ITEMS: PaletteItem[] = [
	{
		type: FlowNodeType.DELAY,
		icon: "⏳",
		label: "Esperar",
		description: "Aguardar X segundos antes de continuar",
		category: "logic",
	},
];

const SHARED_ACTION_ITEMS: PaletteItem[] = [
	{
		type: FlowNodeType.WAIT_FOR_REPLY,
		icon: "📝",
		label: "Aguardar Resposta",
		description: "Coletar texto livre do usuário (email, CPF, etc.)",
		category: "action",
	},
	{
		type: FlowNodeType.HANDOFF,
		icon: "👤",
		label: "Transferir",
		description: "Transferir para agente humano",
		category: "action",
	},
	// ADD_TAG removido - usar CHATWIT_ACTION com add_label (funcional via API Chatwit)
	{
		type: FlowNodeType.CHATWIT_ACTION,
		icon: "🤖",
		label: "Ação Chatwit",
		description: "Resolver, Atribuir, Etiquetas",
		category: "action",
	},
	{
		type: FlowNodeType.END_CONVERSATION,
		icon: "✅",
		label: "Finalizar",
		description: "Encerrar conversa",
		category: "action",
	},
];

// =============================================================================
// WHATSAPP PALETTE
// =============================================================================

/**
 * Itens disponíveis na paleta de nós (WhatsApp)
 */
export const PALETTE_ITEMS: PaletteItem[] = [
	// Triggers
	...SHARED_TRIGGER_ITEMS,

	// Messages
	{
		type: FlowNodeType.INTERACTIVE_MESSAGE,
		icon: "📩",
		label: "Mensagem Interativa",
		description: "Mensagem com botões ou lista",
		category: "message",
	},
	{
		type: FlowNodeType.TEXT_MESSAGE,
		icon: "💬",
		label: "Texto Simples",
		description: "Mensagem de texto sem botões",
		category: "message",
	},
	{
		type: FlowNodeType.MEDIA,
		icon: "📎",
		label: "Mídia",
		description: "Enviar imagem, vídeo, PDF ou documento",
		category: "message",
	},
	{
		type: FlowNodeType.TEMPLATE,
		icon: "📋",
		label: "Template Oficial",
		description: "Template WhatsApp aprovado pela Meta",
		category: "message",
	},

	// Logic
	...SHARED_LOGIC_ITEMS,

	// Reactions
	{
		type: FlowNodeType.EMOJI_REACTION,
		icon: "😊",
		label: "Emoji",
		description: "Reagir com emoji",
		category: "reaction",
	},
	{
		type: FlowNodeType.TEXT_REACTION,
		icon: "✏️",
		label: "Resposta de Texto",
		description: "Responder com texto",
		category: "reaction",
	},

	// Actions
	...SHARED_ACTION_ITEMS,
];

// =============================================================================
// INSTAGRAM PALETTE
// =============================================================================

/**
 * Itens da paleta para Instagram/Facebook
 */
export const INSTAGRAM_PALETTE_ITEMS: PaletteItem[] = [
	// Triggers
	...SHARED_TRIGGER_ITEMS,

	// Messages
	{
		type: FlowNodeType.QUICK_REPLIES,
		icon: "⚡",
		label: "Quick Replies",
		description: "Até 13 respostas rápidas",
		category: "message",
	},
	{
		type: FlowNodeType.INTERACTIVE_MESSAGE,
		icon: "📱",
		label: "Button Template",
		description: "Mensagem com 1-10 botões",
		category: "message",
	},
	{
		type: FlowNodeType.CAROUSEL,
		icon: "🎠",
		label: "Carrossel",
		description: "Até 10 cards com imagem e botões",
		category: "message",
	},
	{
		type: FlowNodeType.TEXT_MESSAGE,
		icon: "💬",
		label: "Texto Simples",
		description: "Mensagem de texto (max 1000 chars)",
		category: "message",
	},
	{
		type: FlowNodeType.MEDIA,
		icon: "📎",
		label: "Mídia",
		description: "Enviar imagem, vídeo ou áudio",
		category: "message",
	},

	// Logic
	...SHARED_LOGIC_ITEMS,

	// Reactions
	{
		type: FlowNodeType.EMOJI_REACTION,
		icon: "❤️",
		label: "Reagir",
		description: "Reagir com love (único emoji disponível)",
		category: "reaction",
	},

	// Actions
	...SHARED_ACTION_ITEMS,
];

// =============================================================================
// TEMPLATE PALETTE
// =============================================================================

/**
 * Itens da paleta de Templates WhatsApp
 */
export const TEMPLATE_PALETTE_ITEMS: TemplatePaletteItem[] = [
	{
		type: FlowNodeType.WHATSAPP_TEMPLATE,
		icon: "📋",
		label: "Template WhatsApp",
		description: "Mensagem oficial com até 10 botões",
		category: "template",
		buttonTypes: ["QUICK_REPLY", "URL", "PHONE_NUMBER", "COPY_CODE", "VOICE_CALL"],
		maxButtons: 10,
	},
];

/**
 * Elementos arrastáveis para dentro dos containers de template
 */
export const TEMPLATE_ELEMENT_ITEMS: TemplateElementItem[] = [
	{
		type: "body",
		icon: "📝",
		label: "Body",
		description: "Texto principal (obrigatório)",
		validContainers: [FlowNodeType.WHATSAPP_TEMPLATE],
	},
	{
		type: "button_quick_reply",
		icon: "🔘",
		label: "Botão",
		description: "Botão de resposta rápida (máx 10 total)",
		validContainers: [FlowNodeType.WHATSAPP_TEMPLATE],
	},
	{
		type: "button_url",
		icon: "🔗",
		label: "Botão URL",
		description: "Botão com link externo (máx 2)",
		validContainers: [FlowNodeType.WHATSAPP_TEMPLATE],
	},
	{
		type: "button_phone",
		icon: "📞",
		label: "Botão Ligar",
		description: "Ligar para telefone (máx 1)",
		validContainers: [FlowNodeType.WHATSAPP_TEMPLATE],
	},
	{
		type: "button_voice_call",
		icon: "📱",
		label: "Ligar WhatsApp",
		description: "Ligar via WhatsApp (máx 1)",
		validContainers: [FlowNodeType.WHATSAPP_TEMPLATE],
	},
	{
		type: "button_copy_code",
		icon: "🎫",
		label: "Copiar Código",
		description: "Botão para copiar código/PIX (máx 1)",
		validContainers: [FlowNodeType.WHATSAPP_TEMPLATE],
	},
];

/**
 * Botões ESPECIAIS - exclusivos para Templates WhatsApp
 */
export const TEMPLATE_SPECIAL_BUTTON_ITEMS: TemplateElementItem[] = [
	{
		type: "button_url",
		icon: "🔗",
		label: "Botão URL",
		description: "Botão com link externo (máx 2)",
		validContainers: [FlowNodeType.WHATSAPP_TEMPLATE],
	},
	{
		type: "button_phone",
		icon: "📞",
		label: "Botão Ligar",
		description: "Ligar para telefone (máx 1)",
		validContainers: [FlowNodeType.WHATSAPP_TEMPLATE],
	},
	{
		type: "button_voice_call",
		icon: "📱",
		label: "Ligar WhatsApp",
		description: "Ligar via WhatsApp (máx 1)",
		validContainers: [FlowNodeType.WHATSAPP_TEMPLATE],
	},
	{
		type: "button_copy_code",
		icon: "🎫",
		label: "Copiar Código",
		description: "Botão para copiar código/PIX (máx 1)",
		validContainers: [FlowNodeType.WHATSAPP_TEMPLATE],
	},
];

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Retorna o label padrão para um tipo de nó
 */
export function getDefaultLabel(type: FlowNodeType): string {
	const item =
		PALETTE_ITEMS.find((p) => p.type === type) ??
		INSTAGRAM_PALETTE_ITEMS.find((p) => p.type === type) ??
		TEMPLATE_PALETTE_ITEMS.find((p) => p.type === type);
	return item?.label ?? "Nó";
}
