/**
 * Flow Campaign Queue — Fila dedicada para disparos em massa
 *
 * Esta fila processa campanhas de disparo de flows para múltiplos contatos.
 * Características:
 * - Prioridade baixa (não compete com interações ao vivo)
 * - Rate limiting por inbox/canal
 * - Pause/Resume de campanhas
 * - Progress tracking
 *
 * @see docs/flow-builder-queue.md
 *
 * TODO: Worker consumer pendente — ver docs/proximo-passo-flow-campaign.md
 * Esta fila tem producers mas NENHUM Worker processando jobs.
 * Jobs enfileirados ficam acumulando no Redis até o worker ser implementado.
 */

import { Queue, type JobsOptions } from "bullmq";
import { getRedisInstance } from "@/lib/connections";
import { getQueueJobDefaults } from "@/lib/queue/job-defaults";
import log from "@/lib/log";
import type { DeliveryContext } from "@/types/flow-engine";

// =============================================================================
// CONSTANTS
// =============================================================================

export const FLOW_CAMPAIGN_QUEUE_NAME = "flow-campaign";

/**
 * Rate limits por canal (msgs/min)
 * Valores conservadores para evitar bloqueios
 */
export const CHANNEL_RATE_LIMITS: Record<string, { perMinute: number; perHour: number }> = {
	whatsapp: { perMinute: 30, perHour: 1000 },
	instagram: { perMinute: 20, perHour: 500 },
	facebook: { perMinute: 25, perHour: 800 },
	default: { perMinute: 20, perHour: 400 },
};

// =============================================================================
// TYPES
// =============================================================================

export type CampaignJobType = "EXECUTE_CONTACT" | "PROCESS_BATCH" | "CAMPAIGN_CONTROL";

/**
 * Job base para campanhas
 */
export interface CampaignJobBase {
	jobType: CampaignJobType;
	campaignId: string;
	metadata?: {
		timestamp?: string;
		correlationId?: string;
	};
}

/**
 * Job para executar flow para um contato específico
 */
export interface ExecuteContactJobData extends CampaignJobBase {
	jobType: "EXECUTE_CONTACT";
	contactId: string;
	contactPhone?: string;
	contactName?: string;
	flowId: string;
	inboxId: string;
	variables: Record<string, unknown>;
	context: Partial<DeliveryContext>;
}

/**
 * Job para processar um batch de contatos
 */
export interface ProcessBatchJobData extends CampaignJobBase {
	jobType: "PROCESS_BATCH";
	batchIndex: number;
	contactIds: string[];
	flowId: string;
	inboxId: string;
}

/**
 * Job para controle de campanha (pause, resume, cancel)
 */
export interface CampaignControlJobData extends CampaignJobBase {
	jobType: "CAMPAIGN_CONTROL";
	action: "pause" | "resume" | "cancel" | "complete";
	reason?: string;
}

export type CampaignJobData =
	| ExecuteContactJobData
	| ProcessBatchJobData
	| CampaignControlJobData;

export interface CampaignJobResult {
	success: boolean;
	jobType: CampaignJobType;
	campaignId: string;
	contactId?: string;
	error?: string;
	processingTimeMs: number;
}

// =============================================================================
// QUEUE CONFIGURATION
// =============================================================================

const DEFAULT_JOB_OPTIONS: Partial<JobsOptions> = getQueueJobDefaults(FLOW_CAMPAIGN_QUEUE_NAME);

// =============================================================================
// QUEUE INSTANCE
// =============================================================================

let queueInstance: Queue<CampaignJobData> | null = null;

/**
 * Obtém a instância da fila de campanhas (lazy initialization).
 */
export function getCampaignQueue(): Queue<CampaignJobData> {
	if (!queueInstance) {
		queueInstance = new Queue<CampaignJobData>(FLOW_CAMPAIGN_QUEUE_NAME, {
			connection: getRedisInstance(),
			defaultJobOptions: DEFAULT_JOB_OPTIONS,
		});

		log.info("[CampaignQueue] Fila de campanhas inicializada", {
			queueName: FLOW_CAMPAIGN_QUEUE_NAME,
		});
	}

	return queueInstance;
}

// =============================================================================
// JOB CREATION HELPERS
// =============================================================================

/**
 * Adiciona um job para executar flow em um contato específico.
 */
export async function addExecuteContactJob(data: {
	campaignId: string;
	contactId: string;
	contactPhone?: string;
	contactName?: string;
	flowId: string;
	inboxId: string;
	variables: Record<string, unknown>;
	context: Partial<DeliveryContext>;
}): Promise<string> {
	const queue = getCampaignQueue();

	const jobData: ExecuteContactJobData = {
		jobType: "EXECUTE_CONTACT",
		campaignId: data.campaignId,
		contactId: data.contactId,
		contactPhone: data.contactPhone,
		contactName: data.contactName,
		flowId: data.flowId,
		inboxId: data.inboxId,
		variables: data.variables,
		context: data.context,
		metadata: {
			timestamp: new Date().toISOString(),
			correlationId: `${data.campaignId}-${data.contactId}`,
		},
	};

	const jobId = `campaign-${data.campaignId}-contact-${data.contactId}-${Date.now()}`;

	const job = await queue.add("execute-contact", jobData, {
		jobId,
	});

	log.debug("[CampaignQueue] Job EXECUTE_CONTACT enfileirado", {
		jobId: job.id,
		campaignId: data.campaignId,
		contactId: data.contactId,
	});

	return job.id!;
}

/**
 * Adiciona um job para processar um batch de contatos.
 */
export async function addProcessBatchJob(data: {
	campaignId: string;
	batchIndex: number;
	contactIds: string[];
	flowId: string;
	inboxId: string;
}): Promise<string> {
	const queue = getCampaignQueue();

	const jobData: ProcessBatchJobData = {
		jobType: "PROCESS_BATCH",
		campaignId: data.campaignId,
		batchIndex: data.batchIndex,
		contactIds: data.contactIds,
		flowId: data.flowId,
		inboxId: data.inboxId,
		metadata: {
			timestamp: new Date().toISOString(),
			correlationId: `${data.campaignId}-batch-${data.batchIndex}`,
		},
	};

	const jobId = `campaign-${data.campaignId}-batch-${data.batchIndex}-${Date.now()}`;

	const job = await queue.add("process-batch", jobData, {
		jobId,
	});

	log.info("[CampaignQueue] Job PROCESS_BATCH enfileirado", {
		jobId: job.id,
		campaignId: data.campaignId,
		batchIndex: data.batchIndex,
		contactCount: data.contactIds.length,
	});

	return job.id!;
}

/**
 * Adiciona um job de controle de campanha.
 */
export async function addCampaignControlJob(data: {
	campaignId: string;
	action: "pause" | "resume" | "cancel" | "complete";
	reason?: string;
}): Promise<string> {
	const queue = getCampaignQueue();

	const jobData: CampaignControlJobData = {
		jobType: "CAMPAIGN_CONTROL",
		campaignId: data.campaignId,
		action: data.action,
		reason: data.reason,
		metadata: {
			timestamp: new Date().toISOString(),
			correlationId: `${data.campaignId}-control-${data.action}`,
		},
	};

	const jobId = `campaign-${data.campaignId}-control-${data.action}-${Date.now()}`;

	const job = await queue.add("campaign-control", jobData, {
		jobId,
		priority: 1, // Controle tem prioridade alta
	});

	log.info("[CampaignQueue] Job CAMPAIGN_CONTROL enfileirado", {
		jobId: job.id,
		campaignId: data.campaignId,
		action: data.action,
	});

	return job.id!;
}

// =============================================================================
// QUEUE UTILITIES
// =============================================================================

/**
 * Obtém métricas da fila de campanhas.
 */
export async function getCampaignQueueMetrics(): Promise<{
	waiting: number;
	active: number;
	completed: number;
	failed: number;
	delayed: number;
}> {
	const queue = getCampaignQueue();

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
 * Pausa todos os jobs pendentes de uma campanha específica.
 */
export async function pauseCampaignJobs(campaignId: string): Promise<number> {
	const queue = getCampaignQueue();
	const waiting = await queue.getWaiting(0, 10000);

	let paused = 0;
	for (const job of waiting) {
		if (job.data.campaignId === campaignId) {
			await job.moveToDelayed(Date.now() + 365 * 24 * 60 * 60 * 1000); // 1 ano no futuro
			paused++;
		}
	}

	log.info("[CampaignQueue] Jobs da campanha pausados", { campaignId, paused });
	return paused;
}

/**
 * Cancela todos os jobs pendentes de uma campanha específica.
 */
export async function cancelCampaignJobs(campaignId: string): Promise<number> {
	const queue = getCampaignQueue();
	const [waiting, delayed] = await Promise.all([
		queue.getWaiting(0, 10000),
		queue.getDelayed(0, 10000),
	]);

	let cancelled = 0;
	for (const job of [...waiting, ...delayed]) {
		if (job.data.campaignId === campaignId) {
			await job.remove();
			cancelled++;
		}
	}

	log.info("[CampaignQueue] Jobs da campanha cancelados", { campaignId, cancelled });
	return cancelled;
}

/**
 * Fecha a conexão da fila (para shutdown graceful).
 */
export async function closeCampaignQueue(): Promise<void> {
	if (queueInstance) {
		await queueInstance.close();
		queueInstance = null;
		log.info("[CampaignQueue] Fila de campanhas fechada");
	}
}
