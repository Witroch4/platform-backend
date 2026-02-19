/**
 * ChatwitDeliveryService — Entrega de mensagens via API Chatwit
 *
 * Responsável por enviar mensagens (texto, mídia, interactive) através
 * da API REST do Chatwit quando a ponte síncrona não é mais viável.
 *
 * Usa `api_access_token` do Agent Bot configurado no Chatwit.
 *
 * @see docs/interative_message_flow_builder.md §14.3
 */

import axios, { type AxiosInstance, type AxiosError } from "axios";
import log from "@/lib/log";
import type { DeliveryContext, DeliveryPayload } from "@/types/flow-engine";

// =============================================================================
// Config
// =============================================================================

const RETRY_ATTEMPTS = 3;
const RETRY_BASE_MS = 500;
const REQUEST_TIMEOUT_MS = 15_000;

// =============================================================================
// Types
// =============================================================================

export interface DeliveryResult {
	success: boolean;
	messageId?: number;
	error?: string;
	attempts: number;
}

interface ChatwitMessagePayload {
	content?: string;
	content_type?: string;
	content_attributes?: Record<string, unknown>;
	message_type: "outgoing";
	private?: boolean;
	/**
	 * Para mídia: array de blob_ids (signed_ids) retornados pelo endpoint /upload
	 * @see docs/chatwit-contrato-async-30s.md
	 */
	attachments?: string[];
}

// =============================================================================
// Service
// =============================================================================

export class ChatwitDeliveryService {
	private client: AxiosInstance;

	constructor(baseUrl: string, accessToken: string) {
		this.client = axios.create({
			baseURL: baseUrl,
			timeout: REQUEST_TIMEOUT_MS,
			headers: {
				api_access_token: accessToken,
				"Content-Type": "application/json",
				"User-Agent": "SocialWise-FlowEngine/1.0",
			},
		});
	}

	// ---------------------------------------------------------------------------
	// Public API
	// ---------------------------------------------------------------------------

	/**
	 * Entrega genérica — decide o método com base no `payload.type`.
	 */
	async deliver(ctx: DeliveryContext, payload: DeliveryPayload): Promise<DeliveryResult> {
		switch (payload.type) {
			case "text":
				return this.deliverText(ctx, payload.content ?? "", payload.private);
			case "media":
				return this.deliverMedia(ctx, payload.mediaUrl ?? "", payload.filename, payload.content);
			case "interactive":
				return this.deliverInteractive(ctx, payload.interactivePayload ?? {});
			case "reaction":
				// ⚠️ LIMITAÇÃO: Chatwit só suporta button_reaction na resposta síncrona.
				// Via API async, não é possível enviar uma reaction real no WhatsApp.
				// Enviamos o emoji como texto para pelo menos mostrar a intenção.
				log.warn("[ChatwitDelivery] Reaction via API async - enviando como texto (emoji)", {
					emoji: payload.emoji,
					targetMessageId: payload.targetMessageId,
				});
				return this.deliverText(ctx, payload.emoji ?? "👍", false);
			case "chatwit_action":
				return this.deliverChatwitAction(ctx, payload);
			default:
				log.warn("[ChatwitDelivery] Tipo de payload desconhecido", { type: payload.type });
				return { success: false, error: `Tipo desconhecido: ${payload.type}`, attempts: 0 };
		}
	}

	/**
	 * Entrega ação Chatwit (resolve, assign, add/remove label).
	 * Usa retry logic padrão do pipeline para consistência com outros nós.
	 */
	async deliverChatwitAction(ctx: DeliveryContext, payload: DeliveryPayload): Promise<DeliveryResult> {
		const actionType = payload.actionType || "resolve_conversation";
		const targetId = ctx.conversationDisplayId || ctx.conversationId;

		log.debug("[ChatwitDelivery] Executando ação Chatwit", {
			actionType,
			conversationId: ctx.conversationId,
			assigneeId: payload.assigneeId,
			labels: payload.labels,
		});

		switch (actionType) {
			case "resolve_conversation":
				return this.postChatwitAction(
					ctx,
					`/api/v1/accounts/${ctx.accountId}/conversations/${targetId}/toggle_status`,
					{ status: "resolved" },
					"resolve_conversation",
				);

			case "assign_agent":
				if (!payload.assigneeId) {
					log.warn("[ChatwitDelivery] assign_agent sem assigneeId", { conversationId: ctx.conversationId });
					return { success: false, error: "assigneeId não fornecido", attempts: 0 };
				}
				return this.postChatwitAction(
					ctx,
					`/api/v1/accounts/${ctx.accountId}/conversations/${targetId}/assignments`,
					{ assignee_id: payload.assigneeId },
					"assign_agent",
				);

			case "add_label":
				if (!payload.labels || payload.labels.length === 0) {
					log.warn("[ChatwitDelivery] add_label sem labels", { conversationId: ctx.conversationId });
					return { success: false, error: "labels não fornecidas", attempts: 0 };
				}
				return this.postChatwitAction(
					ctx,
					`/api/v1/accounts/${ctx.accountId}/conversations/${targetId}/labels`,
					{ labels: payload.labels },
					"add_label",
				);

			case "remove_label":
				if (!payload.labels || payload.labels.length === 0) {
					log.warn("[ChatwitDelivery] remove_label sem labels", { conversationId: ctx.conversationId });
					return { success: false, error: "labels não fornecidas", attempts: 0 };
				}
				// Remove labels uma a uma (API Chatwit não suporta batch delete)
				return this.removeLabelsBatch(ctx, targetId, payload.labels);

			default:
				log.warn("[ChatwitDelivery] Tipo de ação Chatwit desconhecido", { actionType });
				return { success: false, error: `Tipo desconhecido: ${actionType}`, attempts: 0 };
		}
	}

	/**
	 * Envia mensagem de texto simples.
	 */
	async deliverText(ctx: DeliveryContext, content: string, isPrivate?: boolean): Promise<DeliveryResult> {
		const body: ChatwitMessagePayload = {
			content,
			message_type: "outgoing",
			private: isPrivate ?? false,
		};

		return this.postMessage(ctx, body);
	}

	/**
	 * Envia arquivo/mídia (PDF, imagem, áudio, etc.).
	 * Usa fluxo de 2 etapas conforme contrato Chatwit v1.3.0:
	 * 1. POST /upload com external_url → retorna blob_id
	 * 2. POST /messages com blob_id como attachment
	 * @see docs/chatwit-contrato-async-30s.md
	 */
	async deliverMedia(
		ctx: DeliveryContext,
		mediaUrl: string,
		filename?: string,
		caption?: string,
	): Promise<DeliveryResult> {
		// Etapa 1: Upload via URL externa
		const uploadUrl = `/api/v1/accounts/${ctx.accountId}/upload`;

		log.debug("[ChatwitDelivery] Iniciando upload de mídia", {
			uploadUrl,
			mediaUrl,
			filename,
		});

		let blobId: string;
		try {
			const uploadRes = await this.client.post(uploadUrl, {
				external_url: mediaUrl,
			});
			blobId = uploadRes.data?.blob_id;

			if (!blobId) {
				log.error("[ChatwitDelivery] Upload retornou sem blob_id", {
					response: uploadRes.data,
				});
				return {
					success: false,
					error: "Upload falhou: blob_id não retornado",
					attempts: 1,
				};
			}

			log.debug("[ChatwitDelivery] Upload concluído", {
				blobId: blobId.substring(0, 20) + "...",
				fileUrl: uploadRes.data?.file_url,
			});
		} catch (err) {
			const axiosErr = err as AxiosError;
			log.error("[ChatwitDelivery] Erro no upload de mídia", {
				status: axiosErr.response?.status,
				message: axiosErr.message,
				mediaUrl,
			});
			return {
				success: false,
				error: `Upload falhou: ${axiosErr.message}`,
				attempts: 1,
			};
		}

		// Etapa 2: Criar mensagem com blob_id como attachment
		const body: ChatwitMessagePayload = {
			content: caption ?? "",
			message_type: "outgoing",
			attachments: [blobId], // Array de strings (signed_ids), não objetos
		};

		return this.postMessage(ctx, body);
	}

	/**
	 * Envia mensagem interativa (botões, lista, etc.).
	 * Usa `content_type: integrations` conforme contrato Chatwit v1.2.0+
	 * @see docs/chatwit-contrato-async-30s.md
	 */
	async deliverInteractive(ctx: DeliveryContext, interactivePayload: Record<string, unknown>): Promise<DeliveryResult> {
		// Extrair texto do body para o campo content (usado como preview no chat)
		const bodyText = (interactivePayload as { body?: { text?: string } })?.body?.text || "";

		const body: ChatwitMessagePayload = {
			content: bodyText,
			content_type: "integrations", // ✅ Formato correto para Chatwit
			content_attributes: {
				interactive: interactivePayload, // Payload dentro de "interactive"
			},
			message_type: "outgoing",
		};

		return this.postMessage(ctx, body);
	}

	// ---------------------------------------------------------------------------
	// Chatwit Actions
	// ---------------------------------------------------------------------------

	/**
	 * Resolva uma conversa.
	 * @see https://www.chatwit.com/docs/api#toggle-status-of-a-conversation
	 */
	async resolveConversation(ctx: DeliveryContext): Promise<DeliveryResult> {
		const targetId = ctx.conversationDisplayId || ctx.conversationId;
		const url = `/api/v1/accounts/${ctx.accountId}/conversations/${targetId}/toggle_status`;

		try {
			await this.client.post(url, { status: "resolved" });
			return { success: true, attempts: 1 };
		} catch (err: any) {
			log.error("[ChatwitDelivery] Falha ao resolver conversa", { error: err.message, conversationId: ctx.conversationId });
			return { success: false, error: err.message, attempts: 1 };
		}
	}

	/**
	 * Resolva uma conversa (com contexto).
	 */
	async resolveConversationWithContext(ctx: DeliveryContext, conversationId: string): Promise<DeliveryResult> {
		const targetId = ctx.conversationDisplayId || conversationId;
		const url = `/api/v1/accounts/${ctx.accountId}/conversations/${targetId}/toggle_status`;

		try {
			await this.client.post(url, { status: "resolved" });
			return { success: true, attempts: 1 };
		} catch (err: any) {
			log.error("[ChatwitDelivery] Falha ao resolver conversa", { error: err.message, conversationId });
			return { success: false, error: err.message, attempts: 1 };
		}
	}

	/**
	 * Atribuir conversa a um agente.
	 * @see https://www.chatwit.com/docs/api#assign-an-agent
	 */
	async assignAgent(ctx: DeliveryContext, agentId: number): Promise<DeliveryResult> {
		const targetId = ctx.conversationDisplayId || ctx.conversationId;
		const url = `/api/v1/accounts/${ctx.accountId}/conversations/${targetId}/assignments`;

		try {
			await this.client.post(url, { assignee_id: agentId });
			return { success: true, attempts: 1 };
		} catch (err: any) {
			log.error("[ChatwitDelivery] Falha ao atribuir agente", { error: err.message, conversationId: ctx.conversationId, agentId });
			return { success: false, error: err.message, attempts: 1 };
		}
	}

	/**
	 * Adicionar etiquetas a uma conversa.
	 * @deprecated Use deliver(ctx, { type: 'chatwit_action', actionType: 'add_label', labels }) para retry automático.
	 * @see https://www.chatwit.com/docs/api#add-labels
	 */
	async addLabels(ctx: DeliveryContext, labels: string[]): Promise<DeliveryResult> {
		const targetId = ctx.conversationDisplayId || ctx.conversationId;
		const url = `/api/v1/accounts/${ctx.accountId}/conversations/${targetId}/labels`;

		try {
			await this.client.post(url, { labels });
			return { success: true, attempts: 1 };
		} catch (err: any) {
			log.error("[ChatwitDelivery] Falha ao adicionar etiquetas", { error: err.message, conversationId: ctx.conversationId, labels });
			return { success: false, error: err.message, attempts: 1 };
		}
	}

	/**
	 * Remove etiquetas de uma conversa em batch.
	 * API Chatwit usa DELETE individual, então iteramos com retry.
	 */
	private async removeLabelsBatch(
		ctx: DeliveryContext,
		conversationId: number | string,
		labels: string[],
	): Promise<DeliveryResult> {
		let totalAttempts = 0;
		const errors: string[] = [];

		for (const label of labels) {
			const result = await this.postChatwitAction(
				ctx,
				`/api/v1/accounts/${ctx.accountId}/conversations/${conversationId}/labels`,
				{ labels: [label] },
				"remove_label",
				"DELETE",
			);

			totalAttempts += result.attempts;

			if (!result.success) {
				errors.push(`${label}: ${result.error}`);
				// Continua tentando remover as outras labels
			}
		}

		if (errors.length > 0) {
			log.warn("[ChatwitDelivery] Algumas etiquetas não foram removidas", {
				conversationId: ctx.conversationId,
				errors,
			});
			return {
				success: errors.length < labels.length, // Parcialmente bem sucedido
				error: errors.join("; "),
				attempts: totalAttempts,
			};
		}

		return { success: true, attempts: totalAttempts };
	}

	/**
	 * Executa ação Chatwit com retry logic (padrão do pipeline).
	 * Reutiliza mesma lógica de retry de postMessage para consistência.
	 */
	private async postChatwitAction(
		ctx: DeliveryContext,
		url: string,
		body: Record<string, unknown>,
		actionName: string,
		method: "POST" | "DELETE" = "POST",
	): Promise<DeliveryResult> {
		log.debug("[ChatwitDelivery] Executando ação", {
			action: actionName,
			url,
			method,
			conversationId: ctx.conversationId,
		});

		let lastError = "";
		for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
			try {
				if (method === "DELETE") {
					await this.client.delete(url, { data: body });
				} else {
					await this.client.post(url, body);
				}

				log.debug("[ChatwitDelivery] Ação executada com sucesso", {
					action: actionName,
					conversationId: ctx.conversationId,
					attempt,
				});

				return { success: true, attempts: attempt };
			} catch (err) {
				const axiosErr = err as AxiosError;
				lastError = axiosErr.message;
				const status = axiosErr.response?.status;

				// Não tentar de novo para erros 4xx (exceto 429 rate limit)
				if (status && status >= 400 && status < 500 && status !== 429) {
					log.error("[ChatwitDelivery] Erro não-retriable na ação", {
						action: actionName,
						status,
						message: lastError,
						url,
					});
					return { success: false, error: lastError, attempts: attempt };
				}

				// Exponential backoff
				if (attempt < RETRY_ATTEMPTS) {
					const delay = RETRY_BASE_MS * Math.pow(2, attempt - 1);
					log.warn("[ChatwitDelivery] Retry na ação", {
						action: actionName,
						attempt,
						delay,
						error: lastError,
					});
					await this.sleep(delay);
				}
			}
		}

		log.error("[ChatwitDelivery] Todas as tentativas falharam para ação", {
			action: actionName,
			url,
			attempts: RETRY_ATTEMPTS,
			lastError,
		});

		return { success: false, error: lastError, attempts: RETRY_ATTEMPTS };
	}

	private async postMessage(ctx: DeliveryContext, body: ChatwitMessagePayload): Promise<DeliveryResult> {
		// 🔧 FIX: API usa display_id, não id interno
		const targetConversationId = ctx.conversationDisplayId || ctx.conversationId;
		const url = `/api/v1/accounts/${ctx.accountId}/conversations/${targetConversationId}/messages`;

		log.debug("[ChatwitDelivery] Configuração do request", {
			baseURL: this.client.defaults.baseURL,
			url,
			fullUrl: `${this.client.defaults.baseURL}${url}`,
			accountId: ctx.accountId,
			conversationId: ctx.conversationId,
			conversationDisplayId: ctx.conversationDisplayId,
			usedId: targetConversationId,
		});

		let lastError = "";
		for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
			try {
				const res = await this.client.post(url, body);
				const messageId = res.data?.id ?? res.data?.data?.id;

				log.debug("[ChatwitDelivery] Mensagem enviada", {
					messageId,
					conversationId: ctx.conversationId,
					type: body.content_type ?? "text",
					attempt,
				});

				return { success: true, messageId, attempts: attempt };
			} catch (err) {
				const axiosErr = err as AxiosError;
				lastError = axiosErr.message;
				const status = axiosErr.response?.status;

				// Não tentar de novo para erros 4xx (exceto 429 rate limit)
				if (status && status >= 400 && status < 500 && status !== 429) {
					log.error("[ChatwitDelivery] Erro não-retriable", {
						status,
						message: lastError,
						url,
					});
					return { success: false, error: lastError, attempts: attempt };
				}

				// Exponential backoff
				if (attempt < RETRY_ATTEMPTS) {
					const delay = RETRY_BASE_MS * Math.pow(2, attempt - 1);
					log.warn("[ChatwitDelivery] Retry", { attempt, delay, error: lastError });
					await this.sleep(delay);
				}
			}
		}

		log.error("[ChatwitDelivery] Todas as tentativas falharam", {
			url,
			attempts: RETRY_ATTEMPTS,
			lastError,
		});

		return { success: false, error: lastError, attempts: RETRY_ATTEMPTS };
	}

	// resolveDataType removido - não mais necessário com o fluxo de upload blob_id
	// O Chatwit detecta o tipo automaticamente a partir do Content-Type da URL

	private sleep(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}
}

// =============================================================================
// Factory
// =============================================================================

/**
 * Cria instância a partir do DeliveryContext.
 */
export function createDeliveryService(ctx: DeliveryContext): ChatwitDeliveryService {
	return new ChatwitDeliveryService(ctx.chatwitBaseUrl, ctx.chatwitAccessToken);
}
