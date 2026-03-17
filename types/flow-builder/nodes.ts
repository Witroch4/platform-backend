/**
 * Flow Builder - Node Data Interfaces
 *
 * Interfaces para dados de cada tipo de nó.
 */

import type { InteractiveMessage } from "../interactive-messages";
import type {
	FlowNodeExecutionStatus,
	TemplateApprovalStatus,
	TemplateCategory,
	TemplateNodeMode,
	MediaType,
} from "./enums";
import type { InteractiveMessageElement } from "./elements";
import type { TemplateHeader, TemplateBody, TemplateFooter, TemplateButton, MetaTemplateComponents } from "./templates";

// =============================================================================
// BASE NODE DATA
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

// =============================================================================
// TRIGGER NODES
// =============================================================================

/**
 * Dados específicos para nó START
 */
export interface StartNodeData extends FlowNodeDataBase {
	triggerType?: "manual" | "webhook" | "scheduled";
}

// =============================================================================
// MESSAGE NODES
// =============================================================================

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

	/** Elementos (blocos) ordenados dentro da "casca" da Mensagem Interativa */
	elements?: InteractiveMessageElement[];

	// Campos legados (compatibilidade com flows antigos)
	/** @deprecated Use `elements` (header_text) */
	header?: string;
	/** @deprecated Use `elements` (body) */
	body?: string;
	/** @deprecated Use `elements` (footer) */
	footer?: string;
	/** @deprecated Use `elements` (button) */
	buttons?: Array<{ id: string; title: string; description?: string }>;
}

/**
 * Dados específicos para nó de mensagem de texto simples
 */
export interface TextMessageNodeData extends FlowNodeDataBase {
	text: string;
}

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
// REACTION NODES
// =============================================================================

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

// =============================================================================
// ACTION NODES
// =============================================================================

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

// =============================================================================
// LOGIC NODES
// =============================================================================

/**
 * Etiqueta do Chatwit com cor para exibição no canvas e execução
 */
export interface ChatwitLabel {
	title: string;
	color: string;
}

/**
 * Dados específicos para nó de ação do Chatwit
 */
export interface ChatwitActionNodeData extends FlowNodeDataBase {
	actionType: "resolve_conversation" | "assign_agent" | "snooze_conversation" | "add_label" | "remove_label" | "update_contact";
	assigneeId?: string;
	/** Nome do agente para exibição no canvas */
	assigneeName?: string;
	snoozeUntil?: string;
	/** Etiquetas a adicionar/remover, com cor para exibição no canvas */
	labels?: ChatwitLabel[];
	/** Para update_contact: mapeamento de campo → variável (ou valor direto) */
	contactFieldMappings?: Array<{ field: string; value: string }>;
}

// =============================================================================
// INPUT NODES
// =============================================================================

/**
 * Dados específicos para nó WAIT_FOR_REPLY (coleta de texto livre)
 */
export interface WaitForReplyNodeData extends FlowNodeDataBase {
	/** Texto exibido como prompt ao usuário */
	promptText: string;
	/** Nome da variável onde o valor coletado será salvo */
	variableName: string;
	/** Regex de validação (ex: email, CPF) — opcional */
	validationRegex?: string;
	/** Mensagem de erro quando validação falha */
	validationErrorMessage?: string;
	/** Máximo de tentativas antes de pular (default: 2) */
	maxAttempts?: number;
	/** Label do botão de pular */
	skipButtonLabel?: string;
}

// =============================================================================
// LOGIC NODES
// =============================================================================

/**
 * Dados específicos para nó de delay/espera
 */
export interface DelayNodeData extends FlowNodeDataBase {
	/** Tempo de espera em segundos (1-30) */
	delaySeconds: number;
}

// =============================================================================
// TEMPLATE NODES
// =============================================================================

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

	// CREATE MODE: Definição completa do template
	/** Header do template */
	header?: TemplateHeader;

	/** Body do template (obrigatório) */
	body?: TemplateBody;

	/** Footer do template */
	footer?: TemplateFooter;

	/** Botões do template (até 10 misturados) */
	buttons?: TemplateButton[];

	// IMPORT MODE: Componentes da Meta API (cache)
	/** Componentes JSON importados da Meta API */
	importedComponents?: MetaTemplateComponents;
}

/**
 * Dados específicos para nó Template WhatsApp Unificado
 * Aceita TODOS os tipos de botão: QUICK_REPLY, URL, PHONE_NUMBER, COPY_CODE, VOICE_CALL
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
		ttlMinutes?: number;
	}>;

	/** Sistema unificado de elementos (igual Mensagem Interativa) */
	elements?: InteractiveMessageElement[];
}

// =============================================================================
// INTEGRATION NODES
// =============================================================================

/**
 * Dados específicos para nó GENERATE_PAYMENT_LINK
 * Gera link de checkout dinâmico (InfinitePay, MercadoPago, Asaas)
 * e salva a URL em uma variável de sessão.
 */
export interface GeneratePaymentLinkNodeData extends FlowNodeDataBase {
	/** Provider de pagamento */
	provider: "infinitepay" | "mercadopago" | "asaas";
	/** Handle/identificador do merchant no provider (suporta {{variavel}}) */
	handle: string;
	/** Valor em centavos ou formato monetário (suporta {{variavel}}, ex: {{valor_analise}}) */
	amountCents: string;
	/** Descrição do item (suporta {{variavel}}, ex: "Análise Lead {{contact_name}}") */
	description: string;
	/** Nome da variável de sessão com email do cliente (ex: "user_email") */
	customerEmailVar?: string;
	/** Nome da variável onde o link será salvo (default: "payment_url") */
	outputVariable: string;
	/** Nome da variável onde o ID do link será salvo */
	linkIdVariable?: string;
}

// =============================================================================
// DEPRECATED TEMPLATE NODES (Backward Compatibility)
// =============================================================================

/**
 * @deprecated Use WhatsAppTemplateNodeData
 * Dados específicos para nó Button Template
 */
export interface ButtonTemplateNodeData extends FlowNodeDataBase {
	status?: TemplateApprovalStatus;
	templateName?: string;
	metaTemplateId?: string;
	category?: TemplateCategory;
	language?: string;
	body?: { text: string; variables?: string[] };
	buttons?: Array<{ id: string; type?: "QUICK_REPLY"; text: string }>;
	elements?: InteractiveMessageElement[];
}

/**
 * @deprecated Use WhatsAppTemplateNodeData
 * Dados específicos para nó Coupon Template
 */
export interface CouponTemplateNodeData extends FlowNodeDataBase {
	status?: TemplateApprovalStatus;
	templateName?: string;
	metaTemplateId?: string;
	category?: TemplateCategory;
	language?: string;
	body?: { text: string; variables?: string[] };
	couponCode?: string;
	buttonText?: string;
	buttons?: Array<{
		id: string;
		type?: "QUICK_REPLY" | "URL" | "PHONE_NUMBER";
		text: string;
		url?: string;
		phoneNumber?: string;
	}>;
	elements?: InteractiveMessageElement[];
}

/**
 * @deprecated Use WhatsAppTemplateNodeData
 * Dados específicos para nó Call Template
 */
export interface CallTemplateNodeData extends FlowNodeDataBase {
	status?: TemplateApprovalStatus;
	templateName?: string;
	metaTemplateId?: string;
	category?: TemplateCategory;
	language?: string;
	body?: { text: string; variables?: string[] };
	phoneNumber?: string;
	buttonText?: string;
	elements?: InteractiveMessageElement[];
}

/**
 * @deprecated Use WhatsAppTemplateNodeData
 * Dados específicos para nó URL Template
 */
export interface UrlTemplateNodeData extends FlowNodeDataBase {
	status?: TemplateApprovalStatus;
	templateName?: string;
	metaTemplateId?: string;
	category?: TemplateCategory;
	language?: string;
	body?: { text: string; variables?: string[] };
	buttons?: Array<{ id: string; type?: "URL"; text: string; url: string }>;
	elements?: InteractiveMessageElement[];
}

// =============================================================================
// UNION TYPE
// =============================================================================

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
	| TemplateNodeData
	| WhatsAppTemplateNodeData
	| ButtonTemplateNodeData
	| CouponTemplateNodeData
	| CallTemplateNodeData
	| UrlTemplateNodeData
	| ChatwitActionNodeData
	| WaitForReplyNodeData
	| GeneratePaymentLinkNodeData;
