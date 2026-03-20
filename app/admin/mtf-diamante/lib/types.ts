// app/admin/mtf-diamante/lib/types.ts
// Consolidated TypeScript interfaces for MTF Diamante hooks and data management

import type React from "react";
import type { ChatwitInbox, AgenteDialogflow } from "@/types/dialogflow";
import type { InteractiveMessage } from "@/types/interactive-messages";
import { MapeamentoBotao, Template } from "@prisma/client";

// Re-export commonly used types for convenience
export type { ChatwitInbox, AgenteDialogflow, InteractiveMessage };

// MTF Diamante specific types
export interface MtfDiamanteVariavel {
	id?: string;
	chave: string;
	valor: string;
}

export interface MtfDiamanteLote {
	id?: string;
	numero: number;
	nome: string;
	valor: string;
	dataInicio: string;
	dataFim: string;
	isActive: boolean;
}

// API Key interface
export interface MtfDiamanteApiKey {
	id?: string;
	name: string;
	key: string;
	type: "whatsapp" | "instagram" | "openai" | "other";
	isActive: boolean;
	createdAt?: string;
	updatedAt?: string;
	// Legacy compatibility properties
	label?: string;
	tokenPrefix?: string;
	tokenSuffix?: string;
	active?: boolean;
}

// Button Reaction interface
export interface ButtonReaction {
	id?: string;
	messageId: string;
	buttonId: string;
	emoji: string;
	label: string;
	action: string;
	createdAt?: string;
	updatedAt?: string;
}

// Hook return types
export interface UseInteractiveMessagesReturn {
	messages: InteractiveMessage[];
	isLoading: boolean;
	error: any;
	addMessage: (optimisticMessage: InteractiveMessage, apiPayload: any) => Promise<void>;
	updateMessage: (updatedMessage: InteractiveMessage, apiPayload: any) => Promise<void>;
	deleteMessage: (messageId: string) => Promise<void>;
	mutate: () => Promise<any>;
}

export interface UseCaixasReturn {
	caixas: ChatwitInbox[];
	isLoading: boolean;
	error: any;
	addCaixa: (optimisticCaixa: ChatwitInbox, apiPayload: any) => Promise<void>;
	updateCaixa: (updatedCaixa: ChatwitInbox, apiPayload: any) => Promise<void>;
	deleteCaixa: (caixaId: string) => Promise<void>;
	mutate: () => Promise<any>;
}

export interface UseLotesReturn {
	lotes: MtfDiamanteLote[];
	isLoading: boolean;
	error: any;
	addLote: (optimisticLote: MtfDiamanteLote, apiPayload: any) => Promise<void>;
	updateLote: (updatedLote: MtfDiamanteLote, apiPayload: any) => Promise<void>;
	deleteLote: (loteId: string) => Promise<void>;
	mutate: () => Promise<any>;
}

export interface UseVariaveisReturn {
	variaveis: MtfDiamanteVariavel[];
	isLoading: boolean;
	error: any;
	addVariavel: (optimisticVariavel: MtfDiamanteVariavel, apiPayload: any) => Promise<void>;
	updateVariavel: (updatedVariavel: MtfDiamanteVariavel, apiPayload: any) => Promise<void>;
	deleteVariavel: (variavelId: string) => Promise<void>;
	mutate: () => Promise<any>;
}

export interface UseApiKeysReturn {
	apiKeys: MtfDiamanteApiKey[];
	isLoading: boolean;
	error: any;
	addApiKey: (optimisticApiKey: MtfDiamanteApiKey, apiPayload: any) => Promise<void>;
	updateApiKey: (updatedApiKey: MtfDiamanteApiKey, apiPayload: any) => Promise<void>;
	deleteApiKey: (apiKeyId: string) => Promise<void>;
	mutate: () => Promise<any>;
}

export interface UseButtonReactionsReturn {
	buttonReactions: MapeamentoBotao[];
	templates: Template[];
	isLoading: boolean;
	addButtonReaction: (optimisticReaction: ButtonReaction, apiPayload: any) => Promise<void>;
	updateButtonReaction: (updatedReaction: ButtonReaction, apiPayload: any) => Promise<void>;
	deleteButtonReaction: (reactionId: string) => Promise<void>;
	mutate: () => Promise<any>;
}

// WhatsApp Template types
export interface WhatsAppTemplate {
	id: string;
	name: string;
	status: "APPROVED" | "PENDING" | "REJECTED";
	category: string;
	language: string;
	components?: Array<{
		type: string;
		text?: string;
		format?: string;
		buttons?: Array<{ type: string; text: string; url?: string; phone_number?: string }>;
	}>;
}

export interface UseApprovedTemplatesReturn {
	templates: WhatsAppTemplate[];
	isLoading: boolean;
	error: any;
	mutate: () => Promise<any>;
}

// =============================================================================
// CHATWIT AGENT
// =============================================================================

export interface ChatwitAgent {
	id: number;
	name: string;
	email: string;
	role: string;
	avatar_url?: string;
}

// =============================================================================
// PROVIDER CONTEXT
// =============================================================================

// API Response types
export interface ApiResponse<T = any> {
	success: boolean;
	data?: T;
	error?: string;
	message?: string;
}

// Common API payload types
export interface CreateMessagePayload {
	inboxId: string;
	message: Omit<InteractiveMessage, "id" | "createdAt" | "updatedAt">;
}

export interface UpdateMessagePayload {
	messageId: string;
	message: Partial<Omit<InteractiveMessage, "id" | "createdAt" | "updatedAt">>;
}

export interface CreateCaixaPayload {
	nome: string;
	descricao?: string;
	isActive?: boolean;
}

export interface UpdateCaixaPayload {
	caixaId: string;
	nome?: string;
	descricao?: string;
	isActive?: boolean;
}

export interface CreateLotePayload {
	numero: number;
	nome: string;
	valor: string;
	dataInicio: string;
	dataFim: string;
	isActive?: boolean;
}

export interface UpdateLotePayload {
	loteId: string;
	numero?: number;
	nome?: string;
	valor?: string;
	dataInicio?: string;
	dataFim?: string;
	isActive?: boolean;
}

export interface CreateVariavelPayload {
	chave: string;
	valor: string;
}

export interface UpdateVariavelPayload {
	variavelId: string;
	chave?: string;
	valor?: string;
}

export interface CreateApiKeyPayload {
	name: string;
	key: string;
	type: "whatsapp" | "instagram" | "openai" | "other";
	isActive?: boolean;
}

export interface UpdateApiKeyPayload {
	apiKeyId: string;
	name?: string;
	key?: string;
	type?: "whatsapp" | "instagram" | "openai" | "other";
	isActive?: boolean;
}

// SWR Configuration types
export interface SWRHookOptions {
	isPaused?: boolean;
	refreshInterval?: number;
	revalidateOnFocus?: boolean;
	revalidateOnReconnect?: boolean;
	keepPreviousData?: boolean;
}

// Error types
export interface MtfApiError extends Error {
	status?: number;
	code?: string;
	details?: any;
}

// Optimistic update types
export interface OptimisticUpdateOptions {
	revalidate?: boolean;
	populateCache?: boolean;
	rollbackOnError?: boolean;
}

// Context types for the refactored provider
export interface MtfDataContextType {
	// Mensagens Interativas
	interactiveMessages: InteractiveMessage[];
	isLoadingMessages: boolean;
	addMessage: (optimisticMessage: InteractiveMessage, apiPayload: any) => Promise<void>;
	updateMessage: (updatedMessage: InteractiveMessage, apiPayload: any) => Promise<void>;
	deleteMessage: (messageId: string) => Promise<void>;

	// Caixas
	caixas: ChatwitInbox[];
	isLoadingCaixas: boolean;
	loadingCaixas: boolean; // Legacy compatibility
	setCaixas: React.Dispatch<React.SetStateAction<ChatwitInbox[]>>; // Legacy compatibility
	addCaixa: (optimisticCaixa: ChatwitInbox, apiPayload: any) => Promise<void>;
	updateCaixa: (updatedCaixa: ChatwitInbox, apiPayload: any) => Promise<void>;
	deleteCaixa: (caixaId: string) => Promise<void>;
	prefetchInbox: (inboxId: string) => Promise<void>; // Legacy compatibility

	// Lotes
	lotes: MtfDiamanteLote[];
	isLoadingLotes: boolean;
	loadingLotes: boolean; // Legacy compatibility
	addLote: (optimisticLote: MtfDiamanteLote, apiPayload: any) => Promise<void>;
	updateLote: (updatedLote: MtfDiamanteLote, apiPayload: any) => Promise<void>;
	deleteLote: (loteId: string) => Promise<void>;

	// Variáveis
	variaveis: MtfDiamanteVariavel[];
	isLoadingVariaveis: boolean;
	loadingVariaveis: boolean; // Legacy compatibility
	addVariavel: (optimisticVariavel: MtfDiamanteVariavel, apiPayload: any) => Promise<void>;
	updateVariavel: (updatedVariavel: MtfDiamanteVariavel, apiPayload: any) => Promise<void>;
	deleteVariavel: (variavelId: string) => Promise<void>;

	// API Keys
	apiKeys: MtfDiamanteApiKey[];
	isLoadingApiKeys: boolean;
	addApiKey: (optimisticApiKey: MtfDiamanteApiKey, apiPayload: any) => Promise<void>;
	updateApiKey: (updatedApiKey: MtfDiamanteApiKey, apiPayload: any) => Promise<void>;
	deleteApiKey: (apiKeyId: string) => Promise<void>;

	// Button Reactions
	buttonReactions: ButtonReaction[];
	isLoadingButtonReactions: boolean;
	addButtonReaction: (optimisticReaction: ButtonReaction, apiPayload: any) => Promise<void>;
	updateButtonReaction: (updatedReaction: ButtonReaction, apiPayload: any) => Promise<void>;
	deleteButtonReaction: (reactionId: string) => Promise<void>;

	// Approved Templates
	approvedTemplates: WhatsAppTemplate[];
	isLoadingTemplates: boolean;
	refreshTemplates: () => Promise<any>;

	// Chatwit Agents
	chatwitAgents: ChatwitAgent[];

	// Controle de Pausa
	isUpdatesPaused: boolean;
	pauseUpdates: () => void;
	resumeUpdates: () => void;

	// Compatibilidade (deprecated mas mantido)
	saveMessage: (apiPayload: any, isEdit: boolean) => Promise<any>;
	updateMessagesCache: (messageOrId: any, action: string, reactions?: any[]) => Promise<any>;

	// Refresh functions
	refreshMessages: () => Promise<any>;
	refreshCaixas: () => Promise<any>;
	refreshLotes: () => Promise<any>;
	refreshVariaveis: () => Promise<any>;
	refreshApiKeys: () => Promise<any>;
	refreshButtonReactions: () => Promise<any>;

	// General state
	isInitialized: boolean;
}
