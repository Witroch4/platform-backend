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
} from "@/lib/queue/flow-builder-queues";
import { ChatwitDeliveryService } from "@/services/flow-engine/chatwit-delivery-service";

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
		const errorMessage = error instanceof Error ? error.message : String(error);

		log.error("[FlowBuilderQueue] Erro ao processar job", {
			jobId: job.id,
			jobType,
			flowId,
			error: errorMessage,
			processingTimeMs,
			attempts: job.attemptsMade + 1,
		});

		// Re-throw para BullMQ fazer retry se configurado
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
// HTTP REQUEST HANDLER (FUTURO)
// =============================================================================

/**
 * Handler para HTTP requests externos.
 * TODO: Implementar quando migrar HTTP_REQUEST para fila.
 */
async function handleHttpRequest(job: Job<HttpRequestJobData>): Promise<FlowBuilderJobResult> {
	const { flowId, sessionId, nodeId, payload } = job.data;

	log.warn("[FlowBuilderQueue:HttpRequest] Handler não implementado", {
		jobId: job.id,
		url: payload.url,
	});

	// Placeholder - retorna sucesso para não bloquear
	return {
		success: false,
		jobType: "HTTP_REQUEST",
		flowId,
		sessionId,
		nodeId,
		error: "HTTP_REQUEST handler não implementado ainda",
		attempts: 1,
		processingTimeMs: 0,
	};
}

// =============================================================================
// TAG ACTION HANDLER (FUTURO)
// =============================================================================

/**
 * Handler para ações de tag (add/remove).
 * TODO: Implementar quando migrar ADD_TAG/REMOVE_TAG para fila.
 */
async function handleTagAction(job: Job<TagActionJobData>): Promise<FlowBuilderJobResult> {
	const { flowId, sessionId, nodeId, payload } = job.data;

	log.warn("[FlowBuilderQueue:TagAction] Handler não implementado", {
		jobId: job.id,
		action: payload.action,
		tagName: payload.tagName,
	});

	// Placeholder
	return {
		success: false,
		jobType: "TAG_ACTION",
		flowId,
		sessionId,
		nodeId,
		error: "TAG_ACTION handler não implementado ainda",
		attempts: 1,
		processingTimeMs: 0,
	};
}

// =============================================================================
// WEBHOOK NOTIFY HANDLER (FUTURO)
// =============================================================================

/**
 * Handler para notificações webhook externas.
 * TODO: Implementar quando adicionar suporte a webhooks no flow builder.
 */
async function handleWebhookNotify(job: Job<WebhookNotifyJobData>): Promise<FlowBuilderJobResult> {
	const { flowId, sessionId, nodeId, payload } = job.data;

	log.warn("[FlowBuilderQueue:WebhookNotify] Handler não implementado", {
		jobId: job.id,
		url: payload.url,
	});

	// Placeholder
	return {
		success: false,
		jobType: "WEBHOOK_NOTIFY",
		flowId,
		sessionId,
		nodeId,
		error: "WEBHOOK_NOTIFY handler não implementado ainda",
		attempts: 1,
		processingTimeMs: 0,
	};
}
