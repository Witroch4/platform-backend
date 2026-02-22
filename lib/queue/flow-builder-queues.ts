/**
 * Flow Builder Queues — Fila genérica para ações do Flow Builder
 *
 * Esta fila processa ações assíncronas do Flow Engine que não precisam
 * de resposta imediata ao usuário (não bloqueiam UX de chat).
 *
 * Ações suportadas (extensível):
 * - CHATWIT_ACTION: resolve, assign_agent, add_label, remove_label
 * - (futuro) HTTP_REQUEST: chamadas externas
 * - (futuro) ADD_TAG, REMOVE_TAG: tags de conversa
 * - (futuro) WEBHOOK: notificações externas
 *
 * @see docs/flow-builder-queue.md
 */

import { Queue, type JobsOptions } from "bullmq";
import { getRedisInstance } from "@/lib/connections";
import { getQueueJobDefaults } from "@/lib/queue/job-defaults";
import log from "@/lib/log";
import type { DeliveryContext, DeliveryPayload } from "@/types/flow-engine";

// =============================================================================
// QUEUE NAME
// =============================================================================

export const FLOW_BUILDER_QUEUE_NAME = "flow-builder-queues";

// =============================================================================
// JOB TYPES — Extensível para novos tipos de ação
// =============================================================================

/**
 * Tipos de ação suportados pela fila.
 * Adicione novos tipos aqui conforme necessário.
 */
export type FlowBuilderJobType =
	| "CHATWIT_ACTION"
	| "HTTP_REQUEST"
	| "TAG_ACTION"
	| "WEBHOOK_NOTIFY"
	| "DELAY"
	| "MEDIA_UPLOAD";

/**
 * Payload base para todos os jobs da fila.
 */
export interface FlowBuilderJobBase {
	/** Tipo de ação a executar */
	jobType: FlowBuilderJobType;
	/** ID do flow (para rastreamento) */
	flowId: string;
	/** ID da sessão do flow */
	sessionId: string;
	/** ID do nó que originou a ação */
	nodeId: string;
	/** Contexto de entrega (account, conversation, tokens, etc.) */
	context: DeliveryContext;
	/** Metadata para observabilidade */
	metadata?: {
		timestamp?: string;
		retryCount?: number;
		critical?: boolean;
		correlationId?: string;
	};
}

/**
 * Job para ações Chatwit (resolve, assign, labels).
 */
export interface ChatwitActionJobData extends FlowBuilderJobBase {
	jobType: "CHATWIT_ACTION";
	/** Payload da ação (actionType, assigneeId, labels) */
	payload: DeliveryPayload;
}

/**
 * Job para HTTP requests (futuro).
 */
export interface HttpRequestJobData extends FlowBuilderJobBase {
	jobType: "HTTP_REQUEST";
	payload: {
		method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
		url: string;
		headers?: Record<string, string>;
		body?: string;
		timeoutMs?: number;
		responseVariable?: string;
	};
}

/**
 * Job para ações de tag (futuro).
 */
export interface TagActionJobData extends FlowBuilderJobBase {
	jobType: "TAG_ACTION";
	payload: {
		action: "add" | "remove";
		tagName: string;
	};
}

/**
 * Job para notificações webhook.
 */
export interface WebhookNotifyJobData extends FlowBuilderJobBase {
	jobType: "WEBHOOK_NOTIFY";
	payload: {
		url: string;
		method: "GET" | "POST";
		headers?: Record<string, string>;
		body?: Record<string, unknown>;
	};
}

/**
 * Job para delays longos (>5 minutos).
 * Usa o recurso de delay do BullMQ para agendar continuação do flow.
 */
export interface DelayJobData extends FlowBuilderJobBase {
	jobType: "DELAY";
	payload: {
		/** Delay em milissegundos */
		delayMs: number;
		/** ID do nó para continuar após o delay */
		resumeNodeId: string;
		/** Timestamp ISO de quando o delay foi agendado */
		scheduledFor: string;
	};
}

/**
 * Job para upload de mídia (imagem, documento, áudio, vídeo).
 * Processo de 2 etapas: upload do blob + envio da mensagem.
 */
export interface MediaUploadJobData extends FlowBuilderJobBase {
	jobType: "MEDIA_UPLOAD";
	payload: {
		/** URL da mídia a ser baixada e enviada */
		mediaUrl: string;
		/** Nome do arquivo (opcional) */
		filename?: string;
		/** Legenda da mídia (opcional) */
		caption?: string;
		/** Tipo de mídia */
		mediaType: "image" | "document" | "audio" | "video";
	};
}

/**
 * Union type de todos os jobs suportados.
 */
export type FlowBuilderJobData =
	| ChatwitActionJobData
	| HttpRequestJobData
	| TagActionJobData
	| WebhookNotifyJobData
	| DelayJobData
	| MediaUploadJobData;

/**
 * Resultado do processamento de um job.
 */
export interface FlowBuilderJobResult {
	success: boolean;
	jobType: FlowBuilderJobType;
	flowId: string;
	sessionId: string;
	nodeId: string;
	error?: string;
	attempts: number;
	processingTimeMs: number;
	data?: Record<string, unknown>;
}

// =============================================================================
// QUEUE CONFIGURATION
// =============================================================================

const DEFAULT_JOB_OPTIONS: Partial<JobsOptions> = getQueueJobDefaults(FLOW_BUILDER_QUEUE_NAME);

// =============================================================================
// QUEUE INSTANCE
// =============================================================================

let queueInstance: Queue<FlowBuilderJobData> | null = null;

/**
 * Obtém a instância da fila (lazy initialization).
 */
export function getFlowBuilderQueue(): Queue<FlowBuilderJobData> {
	if (!queueInstance) {
		queueInstance = new Queue<FlowBuilderJobData>(FLOW_BUILDER_QUEUE_NAME, {
			connection: getRedisInstance(),
			defaultJobOptions: DEFAULT_JOB_OPTIONS,
		});

		log.info("[FlowBuilderQueue] Fila inicializada", {
			queueName: FLOW_BUILDER_QUEUE_NAME,
		});
	}

	return queueInstance;
}

// =============================================================================
// JOB CREATION HELPERS
// =============================================================================

/**
 * Adiciona um job de ação Chatwit à fila.
 */
export async function addChatwitActionJob(data: {
	flowId: string;
	sessionId: string;
	nodeId: string;
	context: DeliveryContext;
	payload: DeliveryPayload;
	critical?: boolean;
}): Promise<string> {
	const queue = getFlowBuilderQueue();

	const jobData: ChatwitActionJobData = {
		jobType: "CHATWIT_ACTION",
		flowId: data.flowId,
		sessionId: data.sessionId,
		nodeId: data.nodeId,
		context: data.context,
		payload: data.payload,
		metadata: {
			timestamp: new Date().toISOString(),
			retryCount: 0,
			critical: data.critical,
			correlationId: `${data.flowId}:${data.sessionId}:${data.nodeId}`,
		},
	};

	const jobId = `chatwit-action:${data.flowId}:${data.sessionId}:${data.nodeId}:${Date.now()}`;

	const job = await queue.add(`chatwit-action-${data.payload.actionType}`, jobData, {
		jobId,
		priority: data.critical ? 1 : 5,
		attempts: data.critical ? 5 : 3,
	});

	log.debug("[FlowBuilderQueue] Job CHATWIT_ACTION enfileirado", {
		jobId: job.id,
		flowId: data.flowId,
		actionType: data.payload.actionType,
	});

	return job.id!;
}

/**
 * Adiciona um job genérico à fila (para extensões futuras).
 */
export async function addFlowBuilderJob(
	data: FlowBuilderJobData,
	options?: Partial<JobsOptions>,
): Promise<string> {
	const queue = getFlowBuilderQueue();

	const jobId = `${data.jobType.toLowerCase()}:${data.flowId}:${data.sessionId}:${data.nodeId}:${Date.now()}`;

	const job = await queue.add(`${data.jobType.toLowerCase()}`, data, {
		jobId,
		priority: data.metadata?.critical ? 1 : 5,
		...options,
	});

	log.debug("[FlowBuilderQueue] Job enfileirado", {
		jobId: job.id,
		jobType: data.jobType,
		flowId: data.flowId,
	});

	return job.id!;
}

/**
 * Adiciona um job de delay longo à fila.
 * Para delays > 5 minutos, usa o recurso de delay do BullMQ.
 */
export async function addDelayJob(data: {
	flowId: string;
	sessionId: string;
	nodeId: string;
	context: DeliveryContext;
	delayMs: number;
	resumeNodeId: string;
}): Promise<string> {
	const queue = getFlowBuilderQueue();

	const scheduledFor = new Date(Date.now() + data.delayMs).toISOString();

	const jobData: DelayJobData = {
		jobType: "DELAY",
		flowId: data.flowId,
		sessionId: data.sessionId,
		nodeId: data.nodeId,
		context: data.context,
		payload: {
			delayMs: data.delayMs,
			resumeNodeId: data.resumeNodeId,
			scheduledFor,
		},
		metadata: {
			timestamp: new Date().toISOString(),
			correlationId: `${data.flowId}:${data.sessionId}:${data.nodeId}`,
		},
	};

	const jobId = `delay:${data.flowId}:${data.sessionId}:${data.nodeId}:${Date.now()}`;

	const job = await queue.add("delay", jobData, {
		jobId,
		delay: data.delayMs, // BullMQ vai agendar para execução futura
		priority: 5,
	});

	log.info("[FlowBuilderQueue] Job DELAY enfileirado", {
		jobId: job.id,
		flowId: data.flowId,
		delayMs: data.delayMs,
		scheduledFor,
	});

	return job.id!;
}

/**
 * Adiciona um job de upload de mídia à fila.
 */
export async function addMediaUploadJob(data: {
	flowId: string;
	sessionId: string;
	nodeId: string;
	context: DeliveryContext;
	mediaUrl: string;
	filename?: string;
	caption?: string;
	mediaType: "image" | "document" | "audio" | "video";
}): Promise<string> {
	const queue = getFlowBuilderQueue();

	const jobData: MediaUploadJobData = {
		jobType: "MEDIA_UPLOAD",
		flowId: data.flowId,
		sessionId: data.sessionId,
		nodeId: data.nodeId,
		context: data.context,
		payload: {
			mediaUrl: data.mediaUrl,
			filename: data.filename,
			caption: data.caption,
			mediaType: data.mediaType,
		},
		metadata: {
			timestamp: new Date().toISOString(),
			correlationId: `${data.flowId}:${data.sessionId}:${data.nodeId}`,
		},
	};

	const jobId = `media-upload:${data.flowId}:${data.sessionId}:${data.nodeId}:${Date.now()}`;

	const job = await queue.add("media-upload", jobData, {
		jobId,
		priority: 3, // Mídia tem prioridade mais alta
		attempts: 5, // Mais tentativas para uploads
	});

	log.info("[FlowBuilderQueue] Job MEDIA_UPLOAD enfileirado", {
		jobId: job.id,
		flowId: data.flowId,
		mediaType: data.mediaType,
	});

	return job.id!;
}

// =============================================================================
// QUEUE UTILITIES
// =============================================================================

/**
 * Obtém métricas da fila.
 */
export async function getQueueMetrics(): Promise<{
	waiting: number;
	active: number;
	completed: number;
	failed: number;
	delayed: number;
}> {
	const queue = getFlowBuilderQueue();

	const [waiting, active, completed, failed, delayed] = await Promise.all([
		queue.getWaitingCount(),
		queue.getActiveCount(),
		queue.getCompletedCount(),
		queue.getFailedCount(),
		queue.getDelayedCount(),
	]);

	return { waiting, active, completed, failed, delayed };
}

/**
 * Limpa jobs antigos da fila.
 */
export async function cleanOldJobs(maxAge: number = 24 * 60 * 60 * 1000): Promise<void> {
	const queue = getFlowBuilderQueue();

	await queue.clean(maxAge, 1000, "completed");
	await queue.clean(maxAge, 500, "failed");

	log.info("[FlowBuilderQueue] Jobs antigos limpos", { maxAgeMs: maxAge });
}

/**
 * Fecha a conexão da fila (para shutdown graceful).
 */
export async function closeQueue(): Promise<void> {
	if (queueInstance) {
		await queueInstance.close();
		queueInstance = null;
		log.info("[FlowBuilderQueue] Fila fechada");
	}
}
