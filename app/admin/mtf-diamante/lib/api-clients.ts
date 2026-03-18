// app/admin/mtf-diamante/lib/api-clients.ts
// API client functions for MTF Diamante data management

import type {
	InteractiveMessage,
	ChatwitInbox,
	MtfDiamanteLote,
	MtfDiamanteVariavel,
	MtfDiamanteApiKey,
	ButtonReaction,
	ApiResponse,
	CreateMessagePayload,
	UpdateMessagePayload,
	CreateCaixaPayload,
	UpdateCaixaPayload,
	CreateLotePayload,
	UpdateLotePayload,
	CreateVariavelPayload,
	UpdateVariavelPayload,
	CreateApiKeyPayload,
	UpdateApiKeyPayload,
	MtfApiError,
} from "./types";

// Import enhanced error handling
import { fetchWithErrorHandling, logError, MtfError, type ApiError } from "./error-handling";

// Base API configuration
const API_BASE = "/api/admin/mtf-diamante";

// Enhanced generic fetch wrapper with robust error handling
async function apiRequest<T = any>(
	endpoint: string,
	options: RequestInit = {},
	context: { operation?: string; retryCount?: number } = {},
): Promise<T> {
	const url = endpoint.startsWith("http") ? endpoint : `${API_BASE}${endpoint}`;

	const defaultHeaders = {
		"Content-Type": "application/json",
		Accept: "application/json",
	};

	const config: RequestInit = {
		...options,
		headers: {
			...defaultHeaders,
			...options.headers,
		},
	};

	try {
		// Use enhanced fetch with error handling
		const response = await fetchWithErrorHandling(url, config, {
			operation: context.operation || `API ${options.method || "GET"} ${endpoint}`,
			retryCount: context.retryCount,
		});

		const data = await response.json();

		// Log successful operations in development
		if (process.env.NODE_ENV === "development") {
			console.log(`✅ [API Success] ${context.operation || endpoint}`, {
				status: response.status,
				dataType: Array.isArray(data?.data) ? "array" : typeof data?.data,
				timestamp: new Date().toISOString(),
			});
		}

		return data;
	} catch (error) {
		// Enhanced error logging with context
		const apiError =
			error instanceof MtfError
				? error
				: new MtfError(error instanceof Error ? error.message : "Erro desconhecido na API", {
					context: context.operation || `API ${options.method || "GET"} ${endpoint}`,
					cause: error instanceof Error ? error : undefined,
				});

		// Log the error with additional context
		logError(apiError, {
			operation: context.operation || `API ${options.method || "GET"} ${endpoint}`,
			additionalData: {
				endpoint,
				method: options.method || "GET",
				retryCount: context.retryCount,
				url,
			},
		});

		throw apiError;
	}
}

// Interactive Messages API
export const interactiveMessagesApi = {
	// Get all messages for an inbox
	getAll: async (inboxId?: string): Promise<InteractiveMessage[]> => {
		const endpoint = inboxId ? `/messages-with-reactions?inboxId=${inboxId}` : "/messages-with-reactions";

		const response = await apiRequest<any>(
			endpoint,
			{},
			{ operation: `Fetch Interactive Messages${inboxId ? ` for inbox ${inboxId}` : ""}` },
		);

		// messages-with-reactions returns: { success: true, messages: [...] }
		return response.messages || response.data || [];
	},

	// Get a specific message
	getById: async (messageId: string): Promise<InteractiveMessage> => {
		const response = await apiRequest<any>(
			`/messages-with-reactions?messageId=${messageId}`,
			{},
			{ operation: `Fetch Interactive Message ${messageId}` },
		);

		// messages-with-reactions returns: { success: true, message: {...} }
		if (!response.message) {
			throw new MtfError("Mensagem não encontrada", {
				status: 404,
				context: "Interactive Message Not Found",
				code: "MESSAGE_NOT_FOUND",
			});
		}

		return response.message;
	},

	// Create a new message
	create: async (payload: CreateMessagePayload): Promise<InteractiveMessage> => {
		// Use messages-with-reactions endpoint for atomic creation with reactions
		const response = await apiRequest<any>(
			"/messages-with-reactions",
			{
				method: "POST",
				body: JSON.stringify(payload),
			},
			{ operation: "Create Interactive Message" },
		);

		// messages-with-reactions returns: { success: true, message: {...}, reactions: [...] }
		if (!response.message) {
			throw new MtfError("Falha ao criar mensagem", {
				context: "Interactive Message Creation Failed",
				code: "MESSAGE_CREATE_FAILED",
			});
		}

		return response.message;
	},

	// Update an existing message
	update: async (payload: UpdateMessagePayload): Promise<InteractiveMessage> => {
		// Use messages-with-reactions endpoint for atomic update with reactions
		const response = await apiRequest<any>(
			`/messages-with-reactions`,
			{
				method: "PUT",
				body: JSON.stringify(payload),
			},
			{ operation: `Update Interactive Message ${payload.messageId}` },
		);

		// messages-with-reactions returns: { success: true, message: {...}, reactions: [...] }
		if (!response.message) {
			throw new MtfError("Falha ao atualizar mensagem", {
				context: "Interactive Message Update Failed",
				code: "MESSAGE_UPDATE_FAILED",
			});
		}

		return response.message;
	},

	// Delete a message
	delete: async (messageId: string): Promise<void> => {
		await apiRequest<ApiResponse>(
			`/messages-with-reactions?messageId=${messageId}`,
			{
				method: "DELETE",
			},
			{ operation: `Delete Interactive Message ${messageId}` },
		);
	},
};

// Caixas API
export const caixasApi = {
	// Get all caixas WITH AI assistants data (to match useCaixas hook)
	getAll: async (): Promise<ChatwitInbox[]> => {
		const response = await apiRequest<any>(
			"/inbox-view?dataType=caixas",
			{},
			{ operation: "Fetch All Caixas with AI Assistants" },
		);
		return response.caixas || [];
	},

	// Get a specific caixa
	getById: async (caixaId: string): Promise<ChatwitInbox> => {
		const response = await apiRequest<ApiResponse<ChatwitInbox>>(
			`/caixas/${caixaId}`,
			{},
			{ operation: `Fetch Caixa ${caixaId}` },
		);

		if (!response.data) {
			throw new MtfError("Caixa não encontrada", {
				status: 404,
				context: "Caixa Not Found",
				code: "CAIXA_NOT_FOUND",
			});
		}

		return response.data;
	},

	// Create a new caixa
	create: async (payload: CreateCaixaPayload): Promise<ChatwitInbox> => {
		const response = await apiRequest<ApiResponse<ChatwitInbox>>(
			"/caixas",
			{
				method: "POST",
				body: JSON.stringify(payload),
			},
			{ operation: "Create Caixa" },
		);

		if (!response.data) {
			throw new MtfError("Falha ao criar caixa", {
				context: "Caixa Creation Failed",
				code: "CAIXA_CREATE_FAILED",
			});
		}

		return response.data;
	},

	// Update an existing caixa
	update: async (payload: UpdateCaixaPayload): Promise<ChatwitInbox> => {
		const response = await apiRequest<ApiResponse<ChatwitInbox>>(
			`/caixas/${payload.caixaId}`,
			{
				method: "PUT",
				body: JSON.stringify(payload),
			},
			{ operation: `Update Caixa ${payload.caixaId}` },
		);

		if (!response.data) {
			throw new MtfError("Falha ao atualizar caixa", {
				context: "Caixa Update Failed",
				code: "CAIXA_UPDATE_FAILED",
			});
		}

		return response.data;
	},

	// Delete a caixa
	delete: async (caixaId: string): Promise<void> => {
		await apiRequest<ApiResponse>(
			`/caixas/${caixaId}`,
			{
				method: "DELETE",
			},
			{ operation: `Delete Caixa ${caixaId}` },
		);
	},
};

// Lotes API
export const lotesApi = {
	// Get all lotes
	getAll: async (): Promise<MtfDiamanteLote[]> => {
		const response = await apiRequest<ApiResponse<MtfDiamanteLote[]>>("/lotes", {}, { operation: "Fetch All Lotes" });
		return response.data || [];
	},

	// Get a specific lote
	getById: async (loteId: string): Promise<MtfDiamanteLote> => {
		const response = await apiRequest<ApiResponse<MtfDiamanteLote>>(
			`/lotes/${loteId}`,
			{},
			{ operation: `Fetch Lote ${loteId}` },
		);

		if (!response.data) {
			throw new MtfError("Lote não encontrado", {
				status: 404,
				context: "Lote Not Found",
				code: "LOTE_NOT_FOUND",
			});
		}

		return response.data;
	},

	// Create a new lote
	create: async (payload: CreateLotePayload): Promise<MtfDiamanteLote> => {
		const response = await apiRequest<ApiResponse<MtfDiamanteLote>>(
			"/lotes",
			{
				method: "POST",
				body: JSON.stringify(payload),
			},
			{ operation: "Create Lote" },
		);

		if (!response.data) {
			throw new MtfError("Falha ao criar lote", {
				context: "Lote Creation Failed",
				code: "LOTE_CREATE_FAILED",
			});
		}

		return response.data;
	},

	// Update an existing lote
	update: async (payload: UpdateLotePayload): Promise<MtfDiamanteLote> => {
		const response = await apiRequest<ApiResponse<MtfDiamanteLote>>(
			`/lotes/${payload.loteId}`,
			{
				method: "PATCH",
				body: JSON.stringify(payload),
			},
			{ operation: `Update Lote ${payload.loteId}` },
		);

		if (!response.data) {
			throw new MtfError("Falha ao atualizar lote", {
				context: "Lote Update Failed",
				code: "LOTE_UPDATE_FAILED",
			});
		}

		return response.data;
	},

	// Delete a lote
	delete: async (loteId: string): Promise<void> => {
		await apiRequest<ApiResponse>(
			`/lotes/${loteId}`,
			{
				method: "DELETE",
			},
			{ operation: `Delete Lote ${loteId}` },
		);
	},
};

// Variáveis API
export const variaveisApi = {
	// Get all variáveis
	getAll: async (): Promise<MtfDiamanteVariavel[]> => {
		const response = await apiRequest<ApiResponse<MtfDiamanteVariavel[]>>(
			"/variaveis",
			{},
			{ operation: "Fetch All Variáveis" },
		);
		return response.data || [];
	},

	// Get a specific variável
	getById: async (variavelId: string): Promise<MtfDiamanteVariavel> => {
		const response = await apiRequest<ApiResponse<MtfDiamanteVariavel>>(
			`/variaveis/${variavelId}`,
			{},
			{ operation: `Fetch Variável ${variavelId}` },
		);

		if (!response.data) {
			throw new MtfError("Variável não encontrada", {
				status: 404,
				context: "Variável Not Found",
				code: "VARIAVEL_NOT_FOUND",
			});
		}

		return response.data;
	},

	// Create a new variável
	create: async (payload: CreateVariavelPayload): Promise<MtfDiamanteVariavel> => {
		const response = await apiRequest<ApiResponse<MtfDiamanteVariavel>>(
			"/variaveis",
			{
				method: "POST",
				body: JSON.stringify(payload),
			},
			{ operation: "Create Variável" },
		);

		if (!response.data) {
			throw new MtfError("Falha ao criar variável", {
				context: "Variável Creation Failed",
				code: "VARIAVEL_CREATE_FAILED",
			});
		}

		return response.data;
	},

	// Update an existing variável
	update: async (payload: UpdateVariavelPayload): Promise<MtfDiamanteVariavel> => {
		const response = await apiRequest<ApiResponse<MtfDiamanteVariavel>>(
			`/variaveis/${payload.variavelId}`,
			{
				method: "PUT",
				body: JSON.stringify(payload),
			},
			{ operation: `Update Variável ${payload.variavelId}` },
		);

		if (!response.data) {
			throw new MtfError("Falha ao atualizar variável", {
				context: "Variável Update Failed",
				code: "VARIAVEL_UPDATE_FAILED",
			});
		}

		return response.data;
	},

	// Delete a variável
	delete: async (variavelId: string): Promise<void> => {
		await apiRequest<ApiResponse>(
			`/variaveis/${variavelId}`,
			{
				method: "DELETE",
			},
			{ operation: `Delete Variável ${variavelId}` },
		);
	},
};

// API Keys API
export const apiKeysApi = {
	// Get all API keys
	getAll: async (): Promise<MtfDiamanteApiKey[]> => {
		const response = await apiRequest<ApiResponse<MtfDiamanteApiKey[]>>(
			"/api-keys",
			{},
			{ operation: "Fetch All API Keys" },
		);
		return response.data || [];
	},

	// Get a specific API key
	getById: async (apiKeyId: string): Promise<MtfDiamanteApiKey> => {
		const response = await apiRequest<ApiResponse<MtfDiamanteApiKey>>(
			`/api-keys/${apiKeyId}`,
			{},
			{ operation: `Fetch API Key ${apiKeyId}` },
		);

		if (!response.data) {
			throw new MtfError("API Key não encontrada", {
				status: 404,
				context: "API Key Not Found",
				code: "API_KEY_NOT_FOUND",
			});
		}

		return response.data;
	},

	// Create a new API key
	create: async (payload: CreateApiKeyPayload): Promise<MtfDiamanteApiKey> => {
		const response = await apiRequest<ApiResponse<MtfDiamanteApiKey>>(
			"/api-keys",
			{
				method: "POST",
				body: JSON.stringify(payload),
			},
			{ operation: "Create API Key" },
		);

		if (!response.data) {
			throw new MtfError("Falha ao criar API Key", {
				context: "API Key Creation Failed",
				code: "API_KEY_CREATE_FAILED",
			});
		}

		return response.data;
	},

	// Update an existing API key
	update: async (payload: UpdateApiKeyPayload): Promise<MtfDiamanteApiKey> => {
		const response = await apiRequest<ApiResponse<MtfDiamanteApiKey>>(
			`/api-keys/${payload.apiKeyId}`,
			{
				method: "PUT",
				body: JSON.stringify(payload),
			},
			{ operation: `Update API Key ${payload.apiKeyId}` },
		);

		if (!response.data) {
			throw new MtfError("Falha ao atualizar API Key", {
				context: "API Key Update Failed",
				code: "API_KEY_UPDATE_FAILED",
			});
		}

		return response.data;
	},

	// Delete an API key
	delete: async (apiKeyId: string): Promise<void> => {
		await apiRequest<ApiResponse>(
			`/api-keys/${apiKeyId}`,
			{
				method: "DELETE",
			},
			{ operation: `Delete API Key ${apiKeyId}` },
		);
	},
};

// Button Reactions API
export const buttonReactionsApi = {
	// Get all button reactions for a message
	getByMessageId: async (messageId: string): Promise<ButtonReaction[]> => {
		const response = await apiRequest<ApiResponse<ButtonReaction[]>>(
			`/button-reactions?messageId=${messageId}`,
			{},
			{ operation: `Fetch Button Reactions for Message ${messageId}` },
		);
		return response.data || [];
	},

	// Get all button reactions
	getAll: async (): Promise<ButtonReaction[]> => {
		const response = await apiRequest<ApiResponse<ButtonReaction[]>>(
			"/button-reactions",
			{},
			{ operation: "Fetch All Button Reactions" },
		);
		return response.data || [];
	},

	// Create a new button reaction
	create: async (reaction: Omit<ButtonReaction, "id" | "createdAt" | "updatedAt">): Promise<ButtonReaction> => {
		const response = await apiRequest<ApiResponse<ButtonReaction>>(
			"/button-reactions",
			{
				method: "POST",
				body: JSON.stringify(reaction),
			},
			{ operation: "Create Button Reaction" },
		);

		if (!response.data) {
			throw new MtfError("Falha ao criar reação de botão", {
				context: "Button Reaction Creation Failed",
				code: "BUTTON_REACTION_CREATE_FAILED",
			});
		}

		return response.data;
	},

	// Update an existing button reaction
	update: async (reactionId: string, updates: Partial<ButtonReaction>): Promise<ButtonReaction> => {
		const response = await apiRequest<ApiResponse<ButtonReaction>>(
			`/button-reactions/${reactionId}`,
			{
				method: "PUT",
				body: JSON.stringify(updates),
			},
			{ operation: `Update Button Reaction ${reactionId}` },
		);

		if (!response.data) {
			throw new MtfError("Falha ao atualizar reação de botão", {
				context: "Button Reaction Update Failed",
				code: "BUTTON_REACTION_UPDATE_FAILED",
			});
		}

		return response.data;
	},

	// Delete a button reaction
	delete: async (reactionId: string): Promise<void> => {
		await apiRequest<ApiResponse>(
			`/button-reactions/${reactionId}`,
			{
				method: "DELETE",
			},
			{ operation: `Delete Button Reaction ${reactionId}` },
		);
	},
};

// Chatwit Agents API
export const chatwitAgentsApi = {
	getAll: async (): Promise<any[]> => {
		const response = await apiRequest<any>(
			"/inbox-view?dataType=chatwitAgents",
			{},
			{ operation: "Fetch Chatwit Agents" },
		);
		return response.chatwitAgents || [];
	},
};

// Chatwit Labels API
export const chatwitLabelsApi = {
	getAll: async (): Promise<Array<{ title: string; color: string }>> => {
		const response = await apiRequest<any>(
			"/inbox-view?dataType=chatwitLabels",
			{},
			{ operation: "Fetch Chatwit Labels" },
		);
		return response.chatwitLabels || [];
	},
};

// Legacy API for backward compatibility
export const legacyApi = {
	// Legacy messages with reactions endpoint
	saveMessageWithReactions: async (payload: any, isEdit: boolean): Promise<any> => {
		const url = "/messages-with-reactions";
		const method = isEdit ? "PUT" : "POST";

		// Extract messageId for PUT requests
		if (isEdit) {
			const messageId = payload.editingMessageId || payload.messageId || payload.message?.id || payload.id;

			if (!messageId || messageId.toString().startsWith("temp-")) {
				throw new MtfError("ID válido é obrigatório para edições. IDs temporários não são permitidos.", {
					status: 400,
					context: "Legacy Message Save - Invalid ID",
					code: "INVALID_MESSAGE_ID",
				});
			}

			payload.messageId = messageId;
		}

		return apiRequest(
			url,
			{
				method,
				body: JSON.stringify(payload),
			},
			{
				operation: `Legacy Save Message with Reactions (${isEdit ? "Edit" : "Create"})`,
			},
		);
	},

	// Legacy inbox view endpoint
	getInboxView: async (inboxId?: string): Promise<any> => {
		const endpoint = inboxId && inboxId !== "all" ? `/inbox-view?inboxId=${inboxId}` : "/inbox-view";

		return apiRequest(
			endpoint,
			{},
			{
				operation: `Legacy Inbox View${inboxId ? ` for inbox ${inboxId}` : ""}`,
			},
		);
	},
};

// Export all APIs as a single object for convenience
export const mtfApi = {
	interactiveMessages: interactiveMessagesApi,
	caixas: caixasApi,
	lotes: lotesApi,
	variaveis: variaveisApi,
	apiKeys: apiKeysApi,
	buttonReactions: buttonReactionsApi,
	legacy: legacyApi,
};

// Default export
export default mtfApi;
