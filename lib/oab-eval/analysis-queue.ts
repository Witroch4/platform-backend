/**
 * Analysis Queue — BullMQ queue for comparative analysis (Prova × Espelho)
 *
 * Feature flag: BLUEPRINT_ANALISE=true (activates internal processing)
 * Quando desativada, o fluxo externo (n8n webhook) permanece inalterado.
 */

import { Queue, Worker, type Job } from "bullmq";
import { getRedisInstance } from "@/lib/connections";
import { getOabEvalConfig } from "@/lib/config";

// ============================================================================
// TYPES
// ============================================================================

export interface AnalysisJobData {
	leadId: string;
	textoProva: string;
	textoEspelho: string;
	selectedProvider?: "OPENAI" | "GEMINI";
	telefone?: string;
	nome?: string;
	userId?: string;
	priority?: number;
}

export interface AnalysisJobResult {
	leadId: string;
	success: boolean;
	error?: string;
	processedAt: string;
}

// ============================================================================
// QUEUE CONFIGURATION
// ============================================================================

const QUEUE_NAME = "oab-analysis";

function getAnalysisQueueConfig() {
	try {
		const config = getOabEvalConfig();
		return {
			maxConcurrentJobs: config.mirror_concurrency || 3,
			jobTimeout: config.queue?.job_timeout || 300000, // 5 minutos
			retryAttempts: config.queue?.retry_attempts || 2,
		};
	} catch {
		return {
			maxConcurrentJobs: 3,
			jobTimeout: 300000,
			retryAttempts: 2,
		};
	}
}

// ============================================================================
// QUEUE INSTANCE
// ============================================================================

const queueConfig = getAnalysisQueueConfig();

export const analysisQueue = new Queue<AnalysisJobData, AnalysisJobResult>(QUEUE_NAME, {
	connection: getRedisInstance(),
	defaultJobOptions: {
		removeOnComplete: {
			count: 20,
			age: 86400, // 24h
		},
		removeOnFail: {
			count: 10,
			age: 172800, // 48h
		},
		attempts: queueConfig.retryAttempts,
		backoff: {
			type: "exponential",
			delay: 5000,
		},
	},
});

// ============================================================================
// ENQUEUE FUNCTION
// ============================================================================

/**
 * Adiciona job de análise comparativa na fila.
 * Só deve ser chamado quando BLUEPRINT_ANALISE=true.
 */
export async function enqueueAnalysis(data: AnalysisJobData): Promise<Job<AnalysisJobData, AnalysisJobResult>> {
	console.log(`[AnalysisQueue] 📥 Enfileirando análise para lead ${data.leadId}`);
	console.log(`[AnalysisQueue] 🎛️ Provider: ${data.selectedProvider || "OPENAI (padrão)"}`);
	console.log(
		`[AnalysisQueue] 📏 Tamanhos: prova=${data.textoProva.length} chars, espelho=${data.textoEspelho.length} chars`,
	);

	if (!data.leadId) {
		throw new Error("leadId é obrigatório para enfileirar análise");
	}
	if (!data.textoProva || data.textoProva.trim().length < 10) {
		throw new Error("Texto da prova é obrigatório para análise");
	}
	if (!data.textoEspelho || data.textoEspelho.trim().length < 10) {
		throw new Error("Texto do espelho é obrigatório para análise");
	}

	const normalizedData: AnalysisJobData = {
		...data,
		selectedProvider: data.selectedProvider || "OPENAI",
	};

	const priority = normalizedData.priority ?? 3; // Mesma prioridade que análises existentes

	const job = await analysisQueue.add("analyzeProva", normalizedData, {
		jobId: `analysis-${normalizedData.leadId}-${Date.now()}`,
		priority,
	});

	console.log(
		`[AnalysisQueue] ✅ Job ${job.id} criado (prioridade: ${priority}, provider: ${normalizedData.selectedProvider})`,
	);

	return job;
}

// ============================================================================
// QUEUE UTILITIES
// ============================================================================

/**
 * Obtém status de um job específico
 */
export async function getAnalysisJobStatus(jobId: string) {
	const job = await analysisQueue.getJob(jobId);
	if (!job) return null;

	const state = await job.getState();
	return {
		id: job.id,
		state,
		progress: job.progress,
		data: { leadId: job.data.leadId, selectedProvider: job.data.selectedProvider },
		attemptsMade: job.attemptsMade,
		failedReason: job.failedReason,
		processedOn: job.processedOn,
		finishedOn: job.finishedOn,
	};
}

/**
 * Obtém contagem de jobs por estado
 */
export async function getAnalysisQueueCounts() {
	return analysisQueue.getJobCounts("active", "completed", "delayed", "failed", "waiting");
}

export { QUEUE_NAME as ANALYSIS_QUEUE_NAME };
