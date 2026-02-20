/**
 * Flow Builder Queues Task Processor
 *
 * Processa jobs da fila flow-builder-queues.
 * Cada tipo de job (CHATWIT_ACTION, HTTP_REQUEST, etc.) tem seu handler dedicado.
 *
 * @see docs/flow-builder-queue.md
 * @see lib/queue/flow-builder-queues.ts
 */

import type { Job } from "bullmq";
import log from "@/lib/log";
import type {
	FlowBuilderJobData,
	FlowBuilderJobResult,
	ChatwitActionJobData,
	HttpRequestJobData,
	TagActionJobData,
	WebhookNotifyJobData,
	DelayJobData,
	MediaUploadJobData,
} from "@/lib/queue/flow-builder-queues";
import { ChatwitDeliveryService } from "@/services/flow-engine/chatwit-delivery-service";
import { getPrismaInstance } from "@/lib/connections";
import type { Prisma } from "@prisma/client";
import { addToDLQ } from "@/lib/queue/flow-builder-dlq";

// =============================================================================
// MAIN TASK PROCESSOR
// =============================================================================

/**
 * Processador principal da fila flow-builder-queues.
 * Roteia para o handler apropriado baseado no jobType.
 */
export async function processFlowBuilderTask(job: Job<FlowBuilderJobData>): Promise<FlowBuilderJobResult> {
	const startTime = Date.now();
	const { jobType, flowId, sessionId, nodeId } = job.data;

	log.info("[FlowBuilderQueue] Processando job", {
		jobId: job.id,
		jobType,
		flowId,
		sessionId,
		nodeId,
		attempt: job.attemptsMade + 1,
	});

	try {
		let result: FlowBuilderJobResult;

		switch (jobType) {
			case "CHATWIT_ACTION":
				result = await handleChatwitAction(job as Job<ChatwitActionJobData>);
				break;

			case "HTTP_REQUEST":
				result = await handleHttpRequest(job as Job<HttpRequestJobData>);
				break;

			case "TAG_ACTION":
				result = await handleTagAction(job as Job<TagActionJobData>);
				break;

			case "WEBHOOK_NOTIFY":
				result = await handleWebhookNotify(job as Job<WebhookNotifyJobData>);
				break;

			case "DELAY":
				result = await handleDelay(job as Job<DelayJobData>);
				break;

			case "MEDIA_UPLOAD":
				result = await handleMediaUpload(job as Job<MediaUploadJobData>);
				break;

			default:
				throw new Error(`Tipo de job desconhecido: ${jobType}`);
		}

		const processingTimeMs = Date.now() - startTime;

		log.info("[FlowBuilderQueue] Job concluído", {
			jobId: job.id,
			jobType,
			flowId,
			success: result.success,
			processingTimeMs,
			attempts: job.attemptsMade + 1,
		});

		return {
			...result,
			processingTimeMs,
			attempts: job.attemptsMade + 1,
		};
	} catch (error) {
		const processingTimeMs = Date.now() - startTime;
		const errorInstance = error instanceof Error ? error : new Error(String(error));

		log.error("[FlowBuilderQueue] Erro ao processar job", {
			jobId: job.id,
			jobType,
			flowId,
			error: errorInstance.message,
			processingTimeMs,
			attempts: job.attemptsMade + 1,
			maxAttempts: job.opts.attempts || 3,
		});

		// Se é a última tentativa, mover para DLQ
		const maxAttempts = job.opts.attempts || 3;
		const isLastAttempt = job.attemptsMade >= maxAttempts - 1;

		if (isLastAttempt) {
			try {
				await addToDLQ(job, errorInstance);
				log.warn("[FlowBuilderQueue] Job movido para DLQ após esgotar tentativas", {
					jobId: job.id,
					jobType,
					flowId,
					attempts: job.attemptsMade + 1,
				});
				// Retornar resultado de falha em vez de re-throw
				// para evitar que BullMQ marque como falha novamente
				return {
					success: false,
					jobType,
					flowId,
					sessionId,
					nodeId,
					error: `Movido para DLQ: ${errorInstance.message}`,
					attempts: job.attemptsMade + 1,
					processingTimeMs,
				};
			} catch (dlqError) {
				log.error("[FlowBuilderQueue] Erro ao mover job para DLQ", {
					jobId: job.id,
					dlqError: dlqError instanceof Error ? dlqError.message : String(dlqError),
				});
			}
		}

		// Re-throw para BullMQ fazer retry
		throw error;
	}
}

// =============================================================================
// CHATWIT ACTION HANDLER
// =============================================================================

/**
 * Handler para ações Chatwit (resolve, assign, add/remove label).
 * Usa o ChatwitDeliveryService com retry já integrado.
 */
async function handleChatwitAction(job: Job<ChatwitActionJobData>): Promise<FlowBuilderJobResult> {
	const { flowId, sessionId, nodeId, context, payload } = job.data;

	log.debug("[FlowBuilderQueue:ChatwitAction] Executando ação", {
		jobId: job.id,
		actionType: payload.actionType,
		conversationId: context.conversationId,
	});

	// Cria instância do delivery service
	const delivery = new ChatwitDeliveryService(context.chatwitBaseUrl, context.chatwitAccessToken);

	// Usa o dispatcher unificado (já tem retry interno)
	const result = await delivery.deliver(context, payload);

	if (!result.success) {
		log.warn("[FlowBuilderQueue:ChatwitAction] Ação falhou", {
			jobId: job.id,
			actionType: payload.actionType,
			error: result.error,
			attempts: result.attempts,
		});

		// Throw para BullMQ fazer retry no nível da fila também
		if (job.attemptsMade < (job.opts.attempts || 3) - 1) {
			throw new Error(`ChatwitAction falhou: ${result.error}`);
		}
	}

	return {
		success: result.success,
		jobType: "CHATWIT_ACTION",
		flowId,
		sessionId,
		nodeId,
		error: result.error,
		attempts: result.attempts,
		processingTimeMs: 0, // Será preenchido pelo caller
		data: {
			actionType: payload.actionType,
			conversationId: context.conversationId,
		},
	};
}

// =============================================================================
// HTTP REQUEST HANDLER
// =============================================================================

/**
 * Handler para HTTP requests externos.
 * Executa chamadas HTTP com timeout configurável e salva resposta em variável.
 */
async function handleHttpRequest(job: Job<HttpRequestJobData>): Promise<FlowBuilderJobResult> {
	const { flowId, sessionId, nodeId, payload, context } = job.data;
	const { url, method, headers, body, timeoutMs = 10000, responseVariable } = payload;

	log.info("[FlowBuilderQueue:HttpRequest] Executando request", {
		jobId: job.id,
		method,
		url,
		timeoutMs,
	});

	try {
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

		const response = await fetch(url, {
			method,
			headers: {
				"Content-Type": "application/json",
				"User-Agent": "Chatwit-FlowBuilder/1.0",
				...headers,
			},
			body: body || undefined,
			signal: controller.signal,
		});

		clearTimeout(timeoutId);

		let responseData: unknown = null;
		const contentType = response.headers.get("content-type") || "";

		if (contentType.includes("application/json")) {
			responseData = await response.json();
		} else {
			responseData = await response.text();
		}

		// Salvar resposta em variável da sessão se configurado
		if (responseVariable && sessionId) {
			await updateSessionVariable(sessionId, responseVariable, {
				status: response.status,
				statusText: response.statusText,
				data: responseData,
			});
		}

		if (!response.ok) {
			throw new Error(`HTTP ${response.status}: ${response.statusText}`);
		}

		log.info("[FlowBuilderQueue:HttpRequest] Request concluído", {
			jobId: job.id,
			status: response.status,
			responseVariable,
		});

		return {
			success: true,
			jobType: "HTTP_REQUEST",
			flowId,
			sessionId,
			nodeId,
			attempts: job.attemptsMade + 1,
			processingTimeMs: 0,
			data: {
				status: response.status,
				responseVariable,
			},
		};
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);

		log.error("[FlowBuilderQueue:HttpRequest] Erro no request", {
			jobId: job.id,
			url,
			error: errorMessage,
		});

		// Re-throw para BullMQ fazer retry
		if (job.attemptsMade < (job.opts.attempts || 3) - 1) {
			throw error;
		}

		return {
			success: false,
			jobType: "HTTP_REQUEST",
			flowId,
			sessionId,
			nodeId,
			error: errorMessage,
			attempts: job.attemptsMade + 1,
			processingTimeMs: 0,
		};
	}
}

/**
 * Atualiza uma variável na sessão do flow.
 */
async function updateSessionVariable(
	sessionId: string,
	variableName: string,
	value: unknown,
): Promise<void> {
	const prisma = getPrismaInstance();

	const session = await prisma.flowSession.findUnique({
		where: { id: sessionId },
		select: { variables: true },
	});

	if (!session) {
		log.warn("[FlowBuilderQueue] Sessão não encontrada para atualizar variável", {
			sessionId,
			variableName,
		});
		return;
	}

	const currentVars = (session.variables as Record<string, unknown>) || {};
	const updatedVars = {
		...currentVars,
		[variableName]: value,
	};

	await prisma.flowSession.update({
		where: { id: sessionId },
		data: { variables: updatedVars as Prisma.InputJsonValue },
	});

	log.debug("[FlowBuilderQueue] Variável atualizada na sessão", {
		sessionId,
		variableName,
	});
}

// =============================================================================
// TAG ACTION HANDLER
// =============================================================================

/**
 * Handler para ações de tag (add/remove).
 * Usa a API de labels do Chatwit.
 */
async function handleTagAction(job: Job<TagActionJobData>): Promise<FlowBuilderJobResult> {
	const { flowId, sessionId, nodeId, payload, context } = job.data;
	const { action, tagName } = payload;

	log.info("[FlowBuilderQueue:TagAction] Executando ação de tag", {
		jobId: job.id,
		action,
		tagName,
		conversationId: context.conversationId,
	});

	try {
		const { chatwitBaseUrl, chatwitAccessToken, accountId, conversationId } = context;
		const baseUrl = chatwitBaseUrl.replace(/\/$/, "");

		if (action === "add") {
			// POST /api/v1/accounts/{account_id}/conversations/{conversation_id}/labels
			const response = await fetch(
				`${baseUrl}/api/v1/accounts/${accountId}/conversations/${conversationId}/labels`,
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						api_access_token: chatwitAccessToken,
					},
					body: JSON.stringify({ labels: [tagName] }),
				},
			);

			if (!response.ok) {
				const errorText = await response.text();
				throw new Error(`Falha ao adicionar label: ${response.status} - ${errorText}`);
			}
		} else if (action === "remove") {
			// DELETE não funciona com body no fetch padrão, usar custom approach
			// A API do Chatwoot/Chatwit espera: POST com labels vazios ou DELETE específico
			// Vamos usar a abordagem de GET labels -> filter -> POST com labels atualizados
			const getResponse = await fetch(
				`${baseUrl}/api/v1/accounts/${accountId}/conversations/${conversationId}/labels`,
				{
					method: "GET",
					headers: {
						api_access_token: chatwitAccessToken,
					},
				},
			);

			if (!getResponse.ok) {
				throw new Error(`Falha ao obter labels: ${getResponse.status}`);
			}

			const labelsData = await getResponse.json();
			const currentLabels: string[] = labelsData.payload || [];
			const updatedLabels = currentLabels.filter((l: string) => l !== tagName);

			const updateResponse = await fetch(
				`${baseUrl}/api/v1/accounts/${accountId}/conversations/${conversationId}/labels`,
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						api_access_token: chatwitAccessToken,
					},
					body: JSON.stringify({ labels: updatedLabels }),
				},
			);

			if (!updateResponse.ok) {
				const errorText = await updateResponse.text();
				throw new Error(`Falha ao remover label: ${updateResponse.status} - ${errorText}`);
			}
		}

		log.info("[FlowBuilderQueue:TagAction] Ação de tag concluída", {
			jobId: job.id,
			action,
			tagName,
		});

		return {
			success: true,
			jobType: "TAG_ACTION",
			flowId,
			sessionId,
			nodeId,
			attempts: job.attemptsMade + 1,
			processingTimeMs: 0,
			data: { action, tagName },
		};
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);

		log.error("[FlowBuilderQueue:TagAction] Erro na ação de tag", {
			jobId: job.id,
			action,
			tagName,
			error: errorMessage,
		});

		// Re-throw para BullMQ fazer retry
		if (job.attemptsMade < (job.opts.attempts || 3) - 1) {
			throw error;
		}

		return {
			success: false,
			jobType: "TAG_ACTION",
			flowId,
			sessionId,
			nodeId,
			error: errorMessage,
			attempts: job.attemptsMade + 1,
			processingTimeMs: 0,
		};
	}
}

// =============================================================================
// WEBHOOK NOTIFY HANDLER
// =============================================================================

/**
 * Handler para notificações webhook externas.
 * Fire-and-forget: envia notificação mas não processa resposta.
 */
async function handleWebhookNotify(job: Job<WebhookNotifyJobData>): Promise<FlowBuilderJobResult> {
	const { flowId, sessionId, nodeId, payload, context } = job.data;
	const { url, method, headers, body } = payload;

	log.info("[FlowBuilderQueue:WebhookNotify] Enviando notificação webhook", {
		jobId: job.id,
		method,
		url,
	});

	try {
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout

		// Adicionar contexto do flow ao body
		const webhookBody = {
			...body,
			_flowContext: {
				flowId,
				sessionId,
				nodeId,
				conversationId: context.conversationId,
				accountId: context.accountId,
				timestamp: new Date().toISOString(),
			},
		};

		const response = await fetch(url, {
			method,
			headers: {
				"Content-Type": "application/json",
				"User-Agent": "Chatwit-FlowBuilder-Webhook/1.0",
				"X-Flow-Id": flowId,
				"X-Session-Id": sessionId,
				...headers,
			},
			body: method !== "GET" ? JSON.stringify(webhookBody) : undefined,
			signal: controller.signal,
		});

		clearTimeout(timeoutId);

		// Fire-and-forget: não verificamos resposta detalhada
		// Apenas logamos o status
		log.info("[FlowBuilderQueue:WebhookNotify] Notificação enviada", {
			jobId: job.id,
			status: response.status,
			ok: response.ok,
		});

		// Consideramos sucesso se recebemos qualquer resposta (2xx, 3xx, 4xx)
		// Apenas 5xx ou timeout são considerados falha para retry
		if (response.status >= 500) {
			throw new Error(`Webhook retornou erro do servidor: ${response.status}`);
		}

		return {
			success: true,
			jobType: "WEBHOOK_NOTIFY",
			flowId,
			sessionId,
			nodeId,
			attempts: job.attemptsMade + 1,
			processingTimeMs: 0,
			data: {
				status: response.status,
				url,
			},
		};
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);

		log.error("[FlowBuilderQueue:WebhookNotify] Erro ao enviar webhook", {
			jobId: job.id,
			url,
			error: errorMessage,
		});

		// Re-throw para BullMQ fazer retry
		if (job.attemptsMade < (job.opts.attempts || 3) - 1) {
			throw error;
		}

		return {
			success: false,
			jobType: "WEBHOOK_NOTIFY",
			flowId,
			sessionId,
			nodeId,
			error: errorMessage,
			attempts: job.attemptsMade + 1,
			processingTimeMs: 0,
		};
	}
}

// =============================================================================
// DELAY HANDLER
// =============================================================================

/**
 * Handler para delays longos (>5 minutos).
 * O BullMQ já agendou o job com delay, então quando este handler executa,
 * o delay já passou. Precisamos retomar o flow do ponto onde parou.
 */
async function handleDelay(job: Job<DelayJobData>): Promise<FlowBuilderJobResult> {
	const { flowId, sessionId, nodeId, payload, context } = job.data;
	const { resumeNodeId, scheduledFor } = payload;

	log.info("[FlowBuilderQueue:Delay] Retomando flow após delay", {
		jobId: job.id,
		flowId,
		sessionId,
		resumeNodeId,
		scheduledFor,
	});

	try {
		const prisma = getPrismaInstance();

		// Verificar se a sessão ainda está ativa
		const session = await prisma.flowSession.findUnique({
			where: { id: sessionId },
			select: { status: true, flowId: true },
		});

		if (!session) {
			log.warn("[FlowBuilderQueue:Delay] Sessão não encontrada", { sessionId });
			return {
				success: false,
				jobType: "DELAY",
				flowId,
				sessionId,
				nodeId,
				error: "Sessão não encontrada",
				attempts: job.attemptsMade + 1,
				processingTimeMs: 0,
			};
		}

		if (session.status !== "ACTIVE" && session.status !== "WAITING_INPUT") {
			log.info("[FlowBuilderQueue:Delay] Sessão não está mais ativa", {
				sessionId,
				status: session.status,
			});
			return {
				success: true,
				jobType: "DELAY",
				flowId,
				sessionId,
				nodeId,
				attempts: job.attemptsMade + 1,
				processingTimeMs: 0,
				data: { skipped: true, reason: "session_not_active" },
			};
		}

		// Atualizar sessão para marcar que o delay foi processado
		await prisma.flowSession.update({
			where: { id: sessionId },
			data: {
				currentNodeId: resumeNodeId,
				updatedAt: new Date(),
			},
		});

		// TODO: Integrar com FlowOrchestrator para continuar execução
		// Por enquanto, apenas registramos que o delay foi processado
		// A continuação real será implementada quando integrarmos com FlowExecutor.resumeFromDelay()

		log.info("[FlowBuilderQueue:Delay] Delay processado com sucesso", {
			jobId: job.id,
			resumeNodeId,
		});

		return {
			success: true,
			jobType: "DELAY",
			flowId,
			sessionId,
			nodeId,
			attempts: job.attemptsMade + 1,
			processingTimeMs: 0,
			data: { resumeNodeId },
		};
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);

		log.error("[FlowBuilderQueue:Delay] Erro ao processar delay", {
			jobId: job.id,
			error: errorMessage,
		});

		if (job.attemptsMade < (job.opts.attempts || 3) - 1) {
			throw error;
		}

		return {
			success: false,
			jobType: "DELAY",
			flowId,
			sessionId,
			nodeId,
			error: errorMessage,
			attempts: job.attemptsMade + 1,
			processingTimeMs: 0,
		};
	}
}

// =============================================================================
// MEDIA UPLOAD HANDLER
// =============================================================================

/**
 * Handler para upload de mídia (imagem, documento, áudio, vídeo).
 * Processo de 2 etapas: download da mídia + upload para Chatwit + envio da mensagem.
 */
async function handleMediaUpload(job: Job<MediaUploadJobData>): Promise<FlowBuilderJobResult> {
	const { flowId, sessionId, nodeId, payload, context } = job.data;
	const { mediaUrl, filename, caption, mediaType } = payload;

	log.info("[FlowBuilderQueue:MediaUpload] Iniciando upload de mídia", {
		jobId: job.id,
		mediaType,
		mediaUrl: mediaUrl.substring(0, 50) + "...",
	});

	try {
		// 1. Download da mídia
		const mediaResponse = await fetch(mediaUrl, {
			signal: AbortSignal.timeout(30000), // 30s timeout para download
		});

		if (!mediaResponse.ok) {
			throw new Error(`Falha ao baixar mídia: ${mediaResponse.status}`);
		}

		const contentType = mediaResponse.headers.get("content-type") || "application/octet-stream";

		// 2. Determinar nome do arquivo
		const finalFilename = filename || `media_${Date.now()}.${getExtensionFromMimeType(contentType)}`;

		// 3. Enviar mídia via ChatwitDeliveryService (faz download + upload internamente)
		const delivery = new ChatwitDeliveryService(context.chatwitBaseUrl, context.chatwitAccessToken);

		const result = await delivery.deliver(context, {
			type: "media",
			mediaUrl,
			filename: finalFilename,
			content: caption, // deliverMedia() recebe caption via payload.content
		});

		if (!result.success) {
			throw new Error(result.error || "Falha no upload de mídia");
		}

		log.info("[FlowBuilderQueue:MediaUpload] Mídia enviada com sucesso", {
			jobId: job.id,
			mediaType,
			filename: finalFilename,
		});

		return {
			success: true,
			jobType: "MEDIA_UPLOAD",
			flowId,
			sessionId,
			nodeId,
			attempts: job.attemptsMade + 1,
			processingTimeMs: 0,
			data: { mediaType, filename: finalFilename },
		};
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);

		log.error("[FlowBuilderQueue:MediaUpload] Erro no upload de mídia", {
			jobId: job.id,
			mediaType,
			error: errorMessage,
		});

		if (job.attemptsMade < (job.opts.attempts || 5) - 1) {
			throw error;
		}

		return {
			success: false,
			jobType: "MEDIA_UPLOAD",
			flowId,
			sessionId,
			nodeId,
			error: errorMessage,
			attempts: job.attemptsMade + 1,
			processingTimeMs: 0,
		};
	}
}

/**
 * Obtém extensão de arquivo a partir do MIME type.
 */
function getExtensionFromMimeType(mimeType: string): string {
	const mimeMap: Record<string, string> = {
		"image/jpeg": "jpg",
		"image/png": "png",
		"image/gif": "gif",
		"image/webp": "webp",
		"video/mp4": "mp4",
		"video/webm": "webm",
		"audio/mpeg": "mp3",
		"audio/ogg": "ogg",
		"audio/wav": "wav",
		"application/pdf": "pdf",
		"application/msword": "doc",
		"application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
	};

	return mimeMap[mimeType] || "bin";
}
