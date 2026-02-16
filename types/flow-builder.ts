/**
 * Flow Builder Types
 * Tipos para o sistema visual de construção de fluxos de mensagens interativas.
 */

import type { InteractiveMessage } from "./interactive-messages";

// =============================================================================
// ENUMS
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
	END_CONVERSATION = "end",

	// Logic
	CONDITION = "condition",
	DELAY = "delay",

	// Media
	MEDIA = "media",

	// Instagram/Facebook Specific
	QUICK_REPLIES = "quick_replies",
	CAROUSEL = "carousel",
}

/**
 * Status de execução de um nó
 */
export type FlowNodeExecutionStatus = "idle" | "running" | "success" | "error" | "waiting";

// =============================================================================
// NODE DATA INTERFACES
// =============================================================================

/**
 * Dados base para todos os nós
 */
export interface FlowNodeDataBase {
	label: string;
	isConfigured: boolean;
	execution?: {
		status: FlowNodeExecutionStatus;
		message?: string;
	};
}

/**
 * Dados específicos para nó START
 */
export interface StartNodeData extends FlowNodeDataBase {
	triggerType?: "manual" | "webhook" | "scheduled";
}

/**
 * Dados específicos para nó de mensagem interativa
 */
export interface InteractiveMessageNodeData extends FlowNodeDataBase {
	/** ID da mensagem existente (se vinculada) */
	messageId?: string;
	/** Mensagem completa (se vinculada a existente) */
	message?: InteractiveMessage;
	/** IDs dos botões disponíveis para conexão */
	buttonIds?: string[];

	// -------------------------------------------------------------------------
	// Arquitetura modular (Typebot/Flowise-like)
	// -------------------------------------------------------------------------

	/** Elementos (blocos) ordenados dentro da “casca” da Mensagem Interativa */
	elements?: InteractiveMessageElement[];

	// -------------------------------------------------------------------------
	// Campos legados (compatibilidade com flows antigos)
	// Preferir `elements` para novos fluxos
	// -------------------------------------------------------------------------

	/** @deprecated Use `elements` (header_text) */
	header?: string;
	/** @deprecated Use `elements` (body) */
	body?: string;
	/** @deprecated Use `elements` (footer) */
	footer?: string;
	/** @deprecated Use `elements` (button) */
	buttons?: Array<{ id: string; title: string; description?: string }>;
}

// =============================================================================
// INTERACTIVE MESSAGE ELEMENTS (Blocos)
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
];

/**
 * Dados específicos para nó de mensagem de texto simples
 */
export interface TextMessageNodeData extends FlowNodeDataBase {
	text: string;
}

/**
 * Dados específicos para nó de reação com emoji
 */
export interface EmojiReactionNodeData extends FlowNodeDataBase {
	emoji: string;
}

/**
 * Dados específicos para nó de reação com texto
 */
export interface TextReactionNodeData extends FlowNodeDataBase {
	textReaction: string;
}

/**
 * Dados específicos para nó de handoff
 */
export interface HandoffNodeData extends FlowNodeDataBase {
	targetTeam?: string;
	priority?: "low" | "normal" | "high";
}

/**
 * Dados específicos para nó de adicionar tag
 */
export interface AddTagNodeData extends FlowNodeDataBase {
	tagName: string;
	tagColor?: string;
}

/**
 * Dados específicos para nó de fim de conversa
 */
export interface EndConversationNodeData extends FlowNodeDataBase {
	endMessage?: string;
}

/**
 * Dados específicos para nó de delay/espera
 */
export interface DelayNodeData extends FlowNodeDataBase {
	/** Tempo de espera em segundos (1-30) */
	delaySeconds: number;
}

/**
 * Tipo de mídia suportado
 */
export type MediaType = "image" | "video" | "document" | "audio";

/**
 * Dados específicos para nó de mídia
 */
export interface MediaNodeData extends FlowNodeDataBase {
	/** Tipo de mídia */
	mediaType: MediaType;
	/** URL do arquivo no MinIO */
	mediaUrl?: string;
	/** Nome do arquivo */
	filename?: string;
	/** MIME type */
	mimeType?: string;
	/** Legenda/caption (para imagens e vídeos) */
	caption?: string;
}

// =============================================================================
// INSTAGRAM/FACEBOOK SPECIFIC NODE DATA
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

/**
 * Tipo de botão para Instagram/Facebook
 */
export type InstagramButtonType = "web_url" | "postback";

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
// WHATSAPP OFFICIAL TEMPLATE NODE
// =============================================================================

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

/**
 * Dados específicos para nó de Template WhatsApp Oficial
 * Suporta dois modos: Import (templates aprovados) e Create (criar e enviar para aprovação)
 */
export interface TemplateNodeData extends FlowNodeDataBase {
	/** Modo de operação do nó */
	mode: TemplateNodeMode;

	/** Status de aprovação do template */
	status: TemplateApprovalStatus;

	/** ID do Template no banco de dados */
	templateId?: string;

	/** ID do template na Meta Graph API */
	metaTemplateId?: string;

	/** Nome do template (lowercase + underscore) */
	templateName?: string;

	/** Categoria do template */
	category?: TemplateCategory;

	/** Idioma do template */
	language?: string;

	// -------------------------------------------------------------------------
	// CREATE MODE: Definição completa do template
	// -------------------------------------------------------------------------

	/** Header do template */
	header?: TemplateHeader;

	/** Body do template (obrigatório) */
	body?: TemplateBody;

	/** Footer do template */
	footer?: TemplateFooter;

	/** Botões do template (até 10 misturados) */
	buttons?: TemplateButton[];

	// -------------------------------------------------------------------------
	// IMPORT MODE: Componentes da Meta API (cache)
	// -------------------------------------------------------------------------

	/** Componentes JSON importados da Meta API */
	importedComponents?: MetaTemplateComponents;
}

// =============================================================================
// TEMPLATE CONTAINER NODE DATA (Specific Types)
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

/**
 * @deprecated Use WHATSAPP_TEMPLATE_LIMITS
 */
export const BUTTON_TEMPLATE_LIMITS = {
	bodyMaxLength: 1024,
	buttonTextMaxLength: 25,
	maxButtons: 10,
	buttonType: "QUICK_REPLY" as const,
} as const;

/**
 * @deprecated Use WHATSAPP_TEMPLATE_LIMITS
 */
export const COUPON_TEMPLATE_LIMITS = {
	bodyMaxLength: 1024,
	couponCodeMaxLength: 15,
	buttonTextMaxLength: 25,
	maxButtons: 10,
	maxCopyCodeButtons: 1,
	maxUrlButtons: 2,
	maxPhoneButtons: 1,
	buttonType: "COPY_CODE" as const,
} as const;

/**
 * @deprecated Use WHATSAPP_TEMPLATE_LIMITS
 */
export const CALL_TEMPLATE_LIMITS = {
	bodyMaxLength: 1024,
	buttonTextMaxLength: 25,
	phoneNumberPattern: /^\+[1-9]\d{1,14}$/,
	maxButtons: 1,
	buttonType: "PHONE_NUMBER" as const,
} as const;

/**
 * @deprecated Use WHATSAPP_TEMPLATE_LIMITS
 */
export const URL_TEMPLATE_LIMITS = {
	bodyMaxLength: 1024,
	buttonTextMaxLength: 25,
	maxButtons: 2,
	buttonType: "URL" as const,
} as const;

/**
 * Dados específicos para nó Button Template
 * Mensagem com 1-10 botões QUICK_REPLY
 */
export interface ButtonTemplateNodeData extends FlowNodeDataBase {
	/** Status de aprovação do template */
	status?: TemplateApprovalStatus;

	/** Nome do template (para envio à Meta) */
	templateName?: string;

	/** ID do template na Meta */
	metaTemplateId?: string;

	/** Categoria do template */
	category?: TemplateCategory;

	/** Idioma */
	language?: string;

	/** Corpo da mensagem (legacy - usar elements) */
	body?: {
		text: string;
		variables?: string[];
	};

	/** Botões QUICK_REPLY (legacy - usar elements) */
	buttons?: Array<{
		id: string;
		type?: "QUICK_REPLY";
		text: string; // Max 20 chars
	}>;

	/** Sistema unificado de elementos (igual Mensagem Interativa) */
	elements?: InteractiveMessageElement[];
}

/**
 * Dados específicos para nó Coupon Template
 * Mensagem com botão COPY_CODE (PIX, cupons) + opcionais URL, PHONE_NUMBER e QUICK_REPLY
 * Meta aceita: COPY_CODE + URL + PHONE_NUMBER + QUICK_REPLY (agrupados por tipo)
 */
export interface CouponTemplateNodeData extends FlowNodeDataBase {
	/** Status de aprovação do template */
	status?: TemplateApprovalStatus;

	/** Nome do template */
	templateName?: string;

	/** ID do template na Meta */
	metaTemplateId?: string;

	/** Categoria do template */
	category?: TemplateCategory;

	/** Idioma */
	language?: string;

	/** Corpo da mensagem (legacy) */
	body?: {
		text: string;
		variables?: string[];
	};

	/** Código do cupom/PIX (max 15 chars) */
	couponCode?: string;

	/** Texto do botão de copiar */
	buttonText?: string;

	/** Botões adicionais: QUICK_REPLY, URL e/ou PHONE_NUMBER (legacy - usar elements) */
	buttons?: Array<{
		id: string;
		type?: "QUICK_REPLY" | "URL" | "PHONE_NUMBER";
		text: string;
		url?: string;
		phoneNumber?: string;
	}>;

	/** Sistema unificado de elementos */
	elements?: InteractiveMessageElement[];
}

/**
 * Dados específicos para nó Call Template
 * Mensagem com botão PHONE_NUMBER
 */
export interface CallTemplateNodeData extends FlowNodeDataBase {
	/** Status de aprovação do template */
	status?: TemplateApprovalStatus;

	/** Nome do template */
	templateName?: string;

	/** ID do template na Meta */
	metaTemplateId?: string;

	/** Categoria do template */
	category?: TemplateCategory;

	/** Idioma */
	language?: string;

	/** Corpo da mensagem (legacy) */
	body?: {
		text: string;
		variables?: string[];
	};

	/** Número de telefone (formato E.164: +5511999999999) */
	phoneNumber?: string;

	/** Texto do botão de ligar */
	buttonText?: string;

	/** Sistema unificado de elementos */
	elements?: InteractiveMessageElement[];
}

/**
 * Dados específicos para nó URL Template
 * Mensagem com 1-2 botões URL
 */
export interface UrlTemplateNodeData extends FlowNodeDataBase {
	/** Status de aprovação do template */
	status?: TemplateApprovalStatus;

	/** Nome do template */
	templateName?: string;

	/** ID do template na Meta */
	metaTemplateId?: string;

	/** Categoria do template */
	category?: TemplateCategory;

	/** Idioma */
	language?: string;

	/** Corpo da mensagem (legacy) */
	body?: {
		text: string;
		variables?: string[];
	};

	/** Botões URL (legacy - max 2) */
	buttons?: Array<{
		id: string;
		type?: "URL";
		text: string; // Max 25 chars
		url: string;
	}>;

	/** Sistema unificado de elementos */
	elements?: InteractiveMessageElement[];
}

/**
 * Dados específicos para nó Template WhatsApp Unificado
 * Aceita TODOS os tipos de botão: QUICK_REPLY, URL, PHONE_NUMBER, COPY_CODE, VOICE_CALL
 *
 * Regras da Meta API:
 * - Máximo 10 botões totais
 * - COPY_CODE: máx 1
 * - URL: máx 2
 * - PHONE_NUMBER: máx 1
 * - VOICE_CALL: máx 1
 * - PHONE_NUMBER e VOICE_CALL são mutuamente exclusivos
 * - Botões devem ser agrupados: CTAs primeiro, QUICK_REPLY por último
 */
export interface WhatsAppTemplateNodeData extends FlowNodeDataBase {
	/** Status de aprovação do template */
	status?: TemplateApprovalStatus;

	/** Nome do template (para envio à Meta) */
	templateName?: string;

	/** ID do template na Meta */
	metaTemplateId?: string;

	/** Categoria do template */
	category?: TemplateCategory;

	/** Idioma */
	language?: string;

	/** Corpo da mensagem (legacy - usar elements) */
	body?: {
		text: string;
		variables?: string[];
	};

	/** Código do cupom/PIX (max 15 chars) - para COPY_CODE */
	couponCode?: string;

	/** Número de telefone (formato E.164) - para PHONE_NUMBER */
	phoneNumber?: string;

	/** Botões mistos (legacy - usar elements) */
	buttons?: Array<{
		id: string;
		type: "QUICK_REPLY" | "URL" | "PHONE_NUMBER" | "COPY_CODE" | "VOICE_CALL";
		text: string;
		url?: string;
		phoneNumber?: string;
		couponCode?: string;
		ttlMinutes?: number; // para VOICE_CALL (padrão: 10080 = 7 dias)
	}>;

	/** Sistema unificado de elementos (igual Mensagem Interativa) */
	elements?: InteractiveMessageElement[];
}

/**
 * União de todos os tipos de dados de nós
 */
export type FlowNodeData =
	| StartNodeData
	| InteractiveMessageNodeData
	| TextMessageNodeData
	| EmojiReactionNodeData
	| TextReactionNodeData
	| HandoffNodeData
	| AddTagNodeData
	| EndConversationNodeData
	| DelayNodeData
	| MediaNodeData
	| QuickRepliesNodeData
	| CarouselNodeData
	| TemplateNodeData
	| WhatsAppTemplateNodeData
	| ButtonTemplateNodeData
	| CouponTemplateNodeData
	| CallTemplateNodeData
	| UrlTemplateNodeData;

// =============================================================================
// NODE INTERFACES
// =============================================================================

/**
 * Estrutura de um nó no Flow Builder
 */
export interface FlowNode<T extends FlowNodeData = FlowNodeData> {
	id: string;
	type: FlowNodeType;
	position: { x: number; y: number };
	data: T;
	/** Dimensões opcionais do nó */
	width?: number;
	height?: number;
	/** Se o nó está selecionado */
	selected?: boolean;
	/** Se o nó está sendo arrastado */
	dragging?: boolean;
}

/**
 * Nó de início tipado
 */
export type StartNode = FlowNode<StartNodeData>;

/**
 * Nó de mensagem interativa tipado
 */
export type InteractiveMessageNode = FlowNode<InteractiveMessageNodeData>;

/**
 * Nó de reação com emoji tipado
 */
export type EmojiReactionNode = FlowNode<EmojiReactionNodeData>;

/**
 * Nó de reação com texto tipado
 */
export type TextReactionNode = FlowNode<TextReactionNodeData>;

/**
 * Nó de handoff tipado
 */
export type HandoffNode = FlowNode<HandoffNodeData>;

// =============================================================================
// EDGE INTERFACES
// =============================================================================

/**
 * Dados de uma edge (conexão entre nós)
 */
export interface FlowEdgeData {
	/** ID do botão que dispara esta conexão (para edges de mensagens interativas) */
	buttonId?: string;
	/** Label do botão (para exibição) */
	buttonLabel?: string;
	/** Status da edge */
	status?: "idle" | "active" | "success" | "error";
}

/**
 * Estrutura de uma edge no Flow Builder
 */
export interface FlowEdge {
	id: string;
	/** ID do nó de origem */
	source: string;
	/** ID do nó de destino */
	target: string;
	/** Handle específico de origem (ex: buttonId) */
	sourceHandle?: string;
	/** Handle específico de destino */
	targetHandle?: string;
	/** Dados adicionais da edge */
	data?: FlowEdgeData;
	/** Tipo de edge para renderização customizada */
	type?: "default" | "smoothstep" | "step" | "straight" | "button";
	/** Se a edge está animada */
	animated?: boolean;
	/** Se a edge está selecionada */
	selected?: boolean;
}

// =============================================================================
// CANVAS INTERFACES
// =============================================================================

/**
 * Estado do viewport do canvas
 */
export interface FlowViewport {
	x: number;
	y: number;
	zoom: number;
}

/**
 * Estrutura completa do canvas de fluxo
 */
export interface FlowCanvas {
	nodes: FlowNode[];
	edges: FlowEdge[];
	viewport: FlowViewport;
}

/**
 * Estado persistido do canvas (armazenado no banco)
 */
export interface FlowCanvasState {
	id?: string;
	inboxId: string;
	canvas: FlowCanvas;
	version: number;
	isActive: boolean;
	createdAt?: Date;
	updatedAt?: Date;
}

// =============================================================================
// API INTERFACES
// =============================================================================

/**
 * Request para criar/atualizar canvas
 */
export interface SaveFlowCanvasRequest {
	inboxId: string;
	canvas: FlowCanvas;
}

/**
 * Response de operações no canvas
 */
export interface FlowCanvasResponse {
	success: boolean;
	data?: FlowCanvasState;
	error?: string;
}

// =============================================================================
// CONVERSION INTERFACES (Flow <-> MapeamentoBotao)
// =============================================================================

/**
 * Payload de reação de botão para sincronização
 */
export interface ButtonReactionPayload {
	buttonId: string;
	emoji?: string;
	textReaction?: string;
	action?: string;
	messageId?: string;
	actionType: "BUTTON_REACTION" | "SEND_TEMPLATE" | "ASSIGN_TO_AGENT" | "ADD_TAG";
}

// =============================================================================
// PALETTE INTERFACES
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

/**
 * Itens disponíveis na paleta de nós
 */
export const PALETTE_ITEMS: PaletteItem[] = [
	// Triggers
	{
		type: FlowNodeType.START,
		icon: "🚀",
		label: "Início",
		description: "Ponto de entrada do fluxo",
		category: "trigger",
	},

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
	{
		type: FlowNodeType.DELAY,
		icon: "⏳",
		label: "Esperar",
		description: "Aguardar X segundos antes de continuar",
		category: "logic",
	},

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
	{
		type: FlowNodeType.HANDOFF,
		icon: "👤",
		label: "Transferir",
		description: "Transferir para agente humano",
		category: "action",
	},
	{
		type: FlowNodeType.ADD_TAG,
		icon: "🏷️",
		label: "Adicionar Tag",
		description: "Adiciona tag ao contato",
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

/**
 * Itens da paleta para Instagram/Facebook
 * Inclui Quick Replies e Carrossel, oculta header/footer
 */
export const INSTAGRAM_PALETTE_ITEMS: PaletteItem[] = [
	// Triggers
	{
		type: FlowNodeType.START,
		icon: "🚀",
		label: "Início",
		description: "Ponto de entrada do fluxo",
		category: "trigger",
	},

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
	{
		type: FlowNodeType.DELAY,
		icon: "⏳",
		label: "Esperar",
		description: "Aguardar X segundos antes de continuar",
		category: "logic",
	},

	// Reactions
	{
		type: FlowNodeType.EMOJI_REACTION,
		icon: "❤️",
		label: "Reagir",
		description: "Reagir com love (único emoji disponível)",
		category: "reaction",
	},

	// Actions
	{
		type: FlowNodeType.HANDOFF,
		icon: "👤",
		label: "Transferir",
		description: "Transferir para agente humano",
		category: "action",
	},
	{
		type: FlowNodeType.ADD_TAG,
		icon: "🏷️",
		label: "Adicionar Tag",
		description: "Adiciona tag ao contato",
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
// TEMPLATE PALETTE (WhatsApp Templates - Containers)
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
 * Itens da paleta de Templates WhatsApp
 * Apenas o Template WhatsApp unificado - aceita todos os tipos de botão
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
 * Tipo de elemento para templates
 * Inclui elementos compartilhados (header_text, header_image, body, footer, button)
 * que podem ser dropados em containers de template
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
 * Elementos COMPARTILHADOS - funcionam tanto para Mensagem Interativa quanto para Templates
 * Usados na seção "Elementos" da sidebar (reorganizada)
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
];

/**
 * Botões ESPECIAIS - exclusivos para Templates WhatsApp
 * Usados na subseção "Botões Especiais" dentro da seção Templates
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

/**
 * MIME type para drag & drop de elementos de template
 */
export const TEMPLATE_ELEMENT_MIME = "application/flowbuilder-template-element";

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Limites de caracteres por canal (WhatsApp vs Instagram/Facebook)
 * Referência: docs/interative_message_flow_builder.md
 */
export const CHANNEL_CHAR_LIMITS = {
	whatsapp: {
		body: 1024,
		headerText: 60,
		footer: 60,
		buttonTitle: 20,
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

/**
 * Tipo do canal para limites de caracteres
 */
export type ChannelType = keyof typeof CHANNEL_CHAR_LIMITS;

/**
 * Retorna o limite de caracteres para um campo específico
 * Por padrão usa WhatsApp que é mais restritivo
 */
export function getCharLimit(
	field: "body" | "headerText" | "footer" | "buttonTitle" | "listItemTitle" | "listItemDescription",
	channel: ChannelType = "whatsapp",
): number | null {
	const limits = CHANNEL_CHAR_LIMITS[channel];
	return limits[field as keyof typeof limits] ?? null;
}

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
		bg: "bg-orange-50 dark:bg-orange-950",
		border: "border-orange-500",
		icon: "text-orange-600",
	},
	[FlowNodeType.ADD_TAG]: {
		bg: "bg-pink-50 dark:bg-pink-950",
		border: "border-pink-500",
		icon: "text-pink-600",
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

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Cria um nó com valores padrão
 */
export function createFlowNode(
	type: FlowNodeType,
	position: { x: number; y: number },
	data: Partial<FlowNodeData> = {},
): FlowNode {
	const id = `${type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

	const baseData: FlowNodeDataBase = {
		label: getDefaultLabel(type),
		isConfigured: false,
		...data,
	};

	return {
		id,
		type,
		position,
		data: baseData as FlowNodeData,
	};
}

/**
 * Retorna o label padrão para um tipo de nó
 */
function getDefaultLabel(type: FlowNodeType): string {
	// Procura em todas as paletas: PALETTE_ITEMS, INSTAGRAM_PALETTE_ITEMS e TEMPLATE_PALETTE_ITEMS
	const item =
		PALETTE_ITEMS.find((p) => p.type === type) ??
		INSTAGRAM_PALETTE_ITEMS.find((p) => p.type === type) ??
		TEMPLATE_PALETTE_ITEMS.find((p) => p.type === type);
	return item?.label ?? "Nó";
}

/**
 * Cria uma edge entre dois nós
 */
export function createFlowEdge(source: string, target: string, sourceHandle?: string, data?: FlowEdgeData): FlowEdge {
	const id = `edge_${source}_${target}_${sourceHandle ?? "default"}_${Date.now()}`;

	return {
		id,
		source,
		target,
		sourceHandle,
		data,
		type: "smoothstep",
		animated: false,
	};
}

/**
 * Valida se um canvas é válido
 *
 * Regras:
 * - O fluxo pode começar com START ou diretamente com INTERACTIVE_MESSAGE
 * - Nós raiz (sem conexão de entrada) devem ser START ou INTERACTIVE_MESSAGE
 * - Nós não raiz devem ter pelo menos uma conexão de entrada
 * - Todos os nós (exceto START) devem estar configurados
 */
export function validateFlowCanvas(canvas: FlowCanvas): {
	valid: boolean;
	errors: string[];
	warnings: string[];
} {
	const errors: string[] = [];
	const warnings: string[] = [];

	// Identificar nós raiz (sem conexão de entrada)
	const nodesWithIncomingEdges = new Set(canvas.edges.map((e) => e.target));
	const rootNodes = canvas.nodes.filter((n) => !nodesWithIncomingEdges.has(n.id));

	// Nós raiz válidos: START, INTERACTIVE_MESSAGE, QUICK_REPLIES ou CAROUSEL
	const validRootTypes = [
		FlowNodeType.START,
		FlowNodeType.INTERACTIVE_MESSAGE,
		FlowNodeType.QUICK_REPLIES,
		FlowNodeType.CAROUSEL,
	];
	const invalidRootNodes = rootNodes.filter((n) => !validRootTypes.includes(n.type as FlowNodeType));

	if (rootNodes.length === 0) {
		errors.push("O fluxo deve ter pelo menos um ponto de início");
	}

	if (invalidRootNodes.length > 0) {
		errors.push(`${invalidRootNodes.length} nó(s) sem conexão de entrada não são válidos como início de fluxo`);
	}

	// Verificar múltiplos START (warning, não erro)
	const startNodes = canvas.nodes.filter((n) => n.type === FlowNodeType.START);
	if (startNodes.length > 1) {
		warnings.push("O fluxo tem múltiplos nós de início");
	}

	// Verificar nós órfãos (nós que não são raiz válidos e não têm conexão de entrada)
	const orphanNodes = canvas.nodes.filter(
		(n) => !validRootTypes.includes(n.type as FlowNodeType) && !nodesWithIncomingEdges.has(n.id),
	);
	if (orphanNodes.length > 0) {
		errors.push(`Existem ${orphanNodes.length} nó(s) sem conexão de entrada`);
	}

	// Verificar nós não configurados
	const unconfiguredNodes = canvas.nodes.filter((n) => n.type !== FlowNodeType.START && !n.data.isConfigured);
	if (unconfiguredNodes.length > 0) {
		warnings.push(`Existem ${unconfiguredNodes.length} nó(s) não configurado(s)`);
	}

	return {
		valid: errors.length === 0,
		errors,
		warnings,
	};
}

/**
 * Cria um canvas vazio com nó START inicial
 */
export function createEmptyFlowCanvas(): FlowCanvas {
	const startNode = createFlowNode(FlowNodeType.START, { x: 250, y: 50 });
	startNode.data.isConfigured = true;

	return {
		nodes: [startNode],
		edges: [],
		viewport: { ...FLOW_CANVAS_CONSTANTS.DEFAULT_VIEWPORT },
	};
}

// =============================================================================
// N8N-STYLE EXPORT/IMPORT TYPES
// =============================================================================

/**
 * Metadata para flow exportado
 */
export interface FlowExportMeta {
	/** Versão do formato de exportação */
	version: string;
	/** Data/hora da exportação (ISO 8601) */
	exportedAt: string;
	/** ID original do flow (opcional, para referência) */
	flowId?: string;
	/** Nome do flow */
	flowName: string;
	/** ID da inbox original (opcional) */
	inboxId?: string;
}

/**
 * Target de conexão no estilo n8n
 * Representa um nó de destino e qual input conectar
 */
export interface N8nConnectionTarget {
	/** ID do nó de destino */
	node: string;
	/** Tipo de conexão (sempre 'main' por ora) */
	type: "main";
	/** Índice do input no nó destino (geralmente 0) */
	index: number;
}

/**
 * Mapa de conexões no estilo n8n
 * Chave: ID do nó de origem
 * Valor: { main: [[targets do output 0], [targets do output 1], ...] }
 *
 * Para interactive_message: cada botão = 1 output (índice = ordem do botão)
 * Para condition: 2 outputs (0=true, 1=false)
 * Para demais nodes: 1 output (default)
 */
export interface N8nConnectionsMap {
	[sourceNodeId: string]: {
		main: N8nConnectionTarget[][];
	};
}

/**
 * Node estendido para exportação (inclui contagem de outputs)
 */
export interface FlowNodeExport extends FlowNode {
	/** Número de outputs do nó (botões para interactive_message, branches para condition) */
	outputs?: number;
}

/**
 * Formato completo de exportação no estilo n8n
 */
export interface FlowExportFormat {
	/** Metadata do flow */
	meta: FlowExportMeta;
	/** Lista de nós com outputs calculados */
	nodes: FlowNodeExport[];
	/** Mapa de conexões no estilo n8n */
	connections: N8nConnectionsMap;
	/** Estado do viewport */
	viewport: FlowViewport;
}

/**
 * Resultado de validação de importação
 */
export interface FlowImportValidation {
	/** Se a estrutura é válida para importação */
	valid: boolean;
	/** Erros que impedem a importação */
	errors: string[];
	/** Avisos que não impedem mas merecem atenção */
	warnings: string[];
	/** Número de nós no flow */
	nodeCount: number;
	/** Número total de conexões */
	connectionCount: number;
}
