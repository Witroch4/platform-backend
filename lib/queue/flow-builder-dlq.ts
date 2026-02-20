/**
 * Flow Builder Dead Letter Queue (DLQ)
 *
 * Jobs que falham após todas as tentativas são movidos para a DLQ.
 * Isso permite:
 * - Análise de padrões de falha
 * - Retry manual de jobs problemáticos
 * - Alertas sobre crescimento da DLQ
 *
 * @see docs/flow-builder-queue.md
 */

import { Queue, type Job } from "bullmq";
import { getRedisInstance } from "@/lib/connections";
import log from "@/lib/log";
import type { FlowBuilderJobData, FlowBuilderJobType } from "./flow-builder-queues";

// =============================================================================
// CONSTANTS
// =============================================================================

export const FLOW_BUILDER_DLQ_NAME = "flow-builder-dlq";

// =============================================================================
// TYPES
// =============================================================================

export interface DLQJobData {
	/** ID do job original */
	originalJobId: string;
	/** Nome da fila original */
	originalQueue: string;
	/** Tipo do job */
	jobType: FlowBuilderJobType;
	/** Dados completos do job original */
	originalData: FlowBuilderJobData;
	/** Razão da falha */
	failureReason: string;
	/** Stack trace se disponível */
	stackTrace?: string;
	/** Número de tentativas feitas */
	attempts: number;
	/** Timestamp da última tentativa */
	lastAttemptAt: string;
	/** Timestamp de quando foi movido para DLQ */
	movedToDlqAt: string;
	/** Metadata adicional */
	metadata?: {
		flowId?: string;
		sessionId?: string;
		nodeId?: string;
		conversationId?: string;
	};
}

export interface DLQMetrics {
	total: number;
	byJobType: Record<FlowBuilderJobType, number>;
	oldestJobAge: number; // em milissegundos
	recentFailures: number; // últimas 24h
}

// =============================================================================
// QUEUE INSTANCE
// =============================================================================

let dlqInstance: Queue<DLQJobData> | null = null;

/**
 * Obtém a instância da DLQ (lazy initialization).
 */
export function getDLQueue(): Queue<DLQJobData> {
	if (!dlqInstance) {
		dlqInstance = new Queue<DLQJobData>(FLOW_BUILDER_DLQ_NAME, {
			connection: getRedisInstance(),
			defaultJobOptions: {
				removeOnComplete: 500, // Mantém mais jobs para análise
				removeOnFail: false, // Nunca remove falhas da DLQ
			},
		});

		log.info("[FlowBuilderDLQ] DLQ inicializada", {
			queueName: FLOW_BUILDER_DLQ_NAME,
		});
	}

	return dlqInstance;
}

// =============================================================================
// DLQ OPERATIONS
// =============================================================================

/**
 * Move um job falhado para a DLQ.
 * Chamado quando um job esgota todas as tentativas.
 */
export async function addToDLQ(
	originalJob: Job<FlowBuilderJobData>,
	error: Error,
): Promise<string> {
	const dlq = getDLQueue();

	const dlqData: DLQJobData = {
		originalJobId: originalJob.id || "unknown",
		originalQueue: originalJob.queueName,
		jobType: originalJob.data.jobType,
		originalData: originalJob.data,
		failureReason: error.message,
		stackTrace: error.stack,
		attempts: originalJob.attemptsMade,
		lastAttemptAt: new Date().toISOString(),
		movedToDlqAt: new Date().toISOString(),
		metadata: {
			flowId: originalJob.data.flowId,
			sessionId: originalJob.data.sessionId,
			nodeId: originalJob.data.nodeId,
			conversationId: originalJob.data.context?.conversationId
				? String(originalJob.data.context.conversationId)
				: undefined,
		},
	};

	const dlqJobId = `dlq:${originalJob.id}:${Date.now()}`;

	const job = await dlq.add("dlq-entry", dlqData, {
		jobId: dlqJobId,
	});

	log.warn("[FlowBuilderDLQ] Job movido para DLQ", {
		originalJobId: originalJob.id,
		dlqJobId: job.id,
		jobType: originalJob.data.jobType,
		failureReason: error.message,
		attempts: originalJob.attemptsMade,
	});

	return job.id!;
}

/**
 * Obtém métricas da DLQ.
 */
export async function getDLQMetrics(): Promise<DLQMetrics> {
	const dlq = getDLQueue();

	const [waiting, completed] = await Promise.all([
		dlq.getWaiting(0, 1000),
		dlq.getCompleted(0, 1000),
	]);

	const allJobs = [...waiting, ...completed];

	// Contar por tipo de job
	const byJobType: Record<string, number> = {};
	let oldestTimestamp = Date.now();
	let recentFailures = 0;
	const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;

	for (const job of allJobs) {
		const jobType = job.data.jobType;
		byJobType[jobType] = (byJobType[jobType] || 0) + 1;

		const movedAt = new Date(job.data.movedToDlqAt).getTime();
		if (movedAt < oldestTimestamp) {
			oldestTimestamp = movedAt;
		}
		if (movedAt > oneDayAgo) {
			recentFailures++;
		}
	}

	return {
		total: allJobs.length,
		byJobType: byJobType as Record<FlowBuilderJobType, number>,
		oldestJobAge: Date.now() - oldestTimestamp,
		recentFailures,
	};
}

/**
 * Retenta um job específico da DLQ.
 * Move o job de volta para a fila principal.
 */
export async function retryDLQJob(dlqJobId: string): Promise<boolean> {
	const dlq = getDLQueue();
	const { FLOW_BUILDER_QUEUE_NAME, getFlowBuilderQueue } = await import("./flow-builder-queues");

	const job = await dlq.getJob(dlqJobId);
	if (!job) {
		log.warn("[FlowBuilderDLQ] Job não encontrado para retry", { dlqJobId });
		return false;
	}

	const mainQueue = getFlowBuilderQueue();

	// Re-adicionar na fila principal com novo ID
	const newJobId = `retry:${job.data.originalJobId}:${Date.now()}`;
	await mainQueue.add(`retry-${job.data.jobType.toLowerCase()}`, job.data.originalData, {
		jobId: newJobId,
		attempts: 3, // Reset tentativas
	});

	// Remover da DLQ
	await job.remove();

	log.info("[FlowBuilderDLQ] Job retentado", {
		dlqJobId,
		newJobId,
		jobType: job.data.jobType,
	});

	return true;
}

/**
 * Lista jobs na DLQ com paginação.
 */
export async function listDLQJobs(
	offset = 0,
	limit = 50,
): Promise<{
	jobs: Array<{ id: string; data: DLQJobData; timestamp: number }>;
	total: number;
}> {
	const dlq = getDLQueue();

	const [jobs, totalCount] = await Promise.all([
		dlq.getWaiting(offset, offset + limit - 1),
		dlq.getWaitingCount(),
	]);

	return {
		jobs: jobs.map((job) => ({
			id: job.id!,
			data: job.data,
			timestamp: job.timestamp,
		})),
		total: totalCount,
	};
}

/**
 * Limpa jobs antigos da DLQ.
 * @param maxAge Idade máxima em ms (default: 7 dias)
 */
export async function cleanOldDLQJobs(maxAge: number = 7 * 24 * 60 * 60 * 1000): Promise<number> {
	const dlq = getDLQueue();
	const cutoff = Date.now() - maxAge;

	const jobs = await dlq.getWaiting(0, 10000);
	let removed = 0;

	for (const job of jobs) {
		const movedAt = new Date(job.data.movedToDlqAt).getTime();
		if (movedAt < cutoff) {
			await job.remove();
			removed++;
		}
	}

	log.info("[FlowBuilderDLQ] Jobs antigos removidos", {
		removed,
		maxAgeMs: maxAge,
	});

	return removed;
}

/**
 * Fecha a conexão da DLQ (para shutdown graceful).
 */
export async function closeDLQueue(): Promise<void> {
	if (dlqInstance) {
		await dlqInstance.close();
		dlqInstance = null;
		log.info("[FlowBuilderDLQ] DLQ fechada");
	}
}
