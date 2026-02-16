/**
 * OAB Transcription Queue
 * Fila dedicada para processamento de digitação de manuscritos
 * com suporte a progresso granular via SSE
 */

import { Queue, Worker, Job, QueueEvents } from "bullmq";
import { getRedisInstance } from "@/lib/connections";
import { sseManager } from "@/lib/sse-manager";
import { transcribeManuscript, type TranscribeManuscriptResult } from "./transcription-agent";
import { getConfigValue } from "@/lib/config";
import { addManuscritoJob } from "@/lib/queue/leadcells.queue";

// --- Tipos ---

export interface TranscriptionJobData {
	leadID: string;
	images: string[]; // URLs ou base64 das imagens
	telefone?: string;
	nome?: string;
	userId: string;
	priority?: number; // 0-10 (10 = urgente)
	selectedProvider?: "OPENAI" | "GEMINI"; // Provider selecionado pelo usuário no frontend
}

export interface TranscriptionProgress {
	leadID: string;
	currentPage: number;
	totalPages: number;
	percentage: number;
	startedAt: Date;
	estimatedTimeRemaining?: number; // em segundos
}

export interface TranscriptionResult {
	leadID: string;
	blocks: Array<{
		pageLabel: string;
		transcription: string;
	}>;
	totalPages: number;
	processingTimeMs: number;
	textoDAprova: Array<{ output: string }>;
	combinedText: string;
}

export type TranscriptionEvent =
	| { type: "queued"; position: number }
	| { type: "started"; totalPages: number; startedAt: string }
	| { type: "page-complete"; page: number; totalPages: number; percentage: number; estimatedTimeRemaining?: number }
	| { type: "completed"; result: TranscriptionResult }
	| { type: "failed"; error: string };

// --- Configuração da Fila ---

const QUEUE_NAME = "oab-transcription";

const redis = getRedisInstance();

export const transcriptionQueue = new Queue<TranscriptionJobData>(QUEUE_NAME, {
	connection: redis,
	defaultJobOptions: {
		attempts: 2,
		backoff: {
			type: "exponential",
			delay: 5000,
		},
		removeOnComplete: {
			count: 100, // Manter últimos 100 jobs completados
			age: 24 * 3600, // Remover após 24h
		},
		removeOnFail: {
			count: 50,
			age: 7 * 24 * 3600, // Manter falhas por 7 dias
		},
	},
});

export const transcriptionQueueEvents = new QueueEvents(QUEUE_NAME, {
	connection: redis,
});

// --- Worker ---

let worker: Worker<TranscriptionJobData, TranscriptionResult> | null = null;

export function startTranscriptionWorker() {
	if (worker) {
		console.log("[TranscriptionQueue] Worker já está rodando");
		return worker;
	}

	const maxConcurrentJobs = getConfigValue("oab_eval.queue.max_concurrent_jobs", 3);
	const concurrency = getConfigValue("oab_eval.transcribe_concurrency", 10);

	console.log(
		`[TranscriptionQueue] 🚀 Iniciando worker (max concurrent: ${maxConcurrentJobs}, page concurrency: ${concurrency})`,
	);

	worker = new Worker<TranscriptionJobData, TranscriptionResult>(
		QUEUE_NAME,
		async (job: Job<TranscriptionJobData>) => {
			return processTranscriptionJob(job);
		},
		{
			connection: redis,
			concurrency: maxConcurrentJobs,
			limiter: {
				max: maxConcurrentJobs,
				duration: 1000,
			},
		},
	);

	// Event listeners
	worker.on("completed", (job) => {
		console.log(`[TranscriptionQueue] ✅ Job ${job.id} concluído para lead ${job.data.leadID}`);
	});

	worker.on("failed", (job, err) => {
		console.error(`[TranscriptionQueue] ❌ Job ${job?.id} falhou para lead ${job?.data.leadID}:`, err.message);
	});

	worker.on("error", (err) => {
		console.error("[TranscriptionQueue] ❌ Erro no worker:", err);
	});

	return worker;
}

// --- Processamento do Job ---

async function processTranscriptionJob(job: Job<TranscriptionJobData>): Promise<TranscriptionResult> {
	const { leadID, images, userId, selectedProvider } = job.data;
	const totalPages = images.length;

	console.log(`[TranscriptionQueue] 🎯 Processando job ${job.id} - Lead: ${leadID}, Páginas: ${totalPages}`);

	// Garantir que SSE está conectado
	await sseManager.ensureRedisConnected();

	// Notificar início
	await sendSSEEvent(leadID, {
		type: "started",
		totalPages,
		startedAt: new Date().toISOString(),
	});

	const startTime = Date.now();
	const pageTimes: number[] = []; // Para calcular tempo médio e estimativa

	try {
		// Processar com callback de progresso
		const transcriptionOutput: TranscribeManuscriptResult = await transcribeManuscript({
			images,
			leadId: leadID,
			selectedProvider,
			concurrency: getConfigValue("oab_eval.transcribe_concurrency", 10),
			onPageComplete: async (pageIndex: number, pageLabel: string) => {
				const currentPage = pageIndex + 1;
				const percentage = Math.round((currentPage / totalPages) * 100);

				// Calcular tempo médio por página e estimar tempo restante
				const elapsedTime = Date.now() - startTime;
				pageTimes.push(elapsedTime / currentPage);

				const avgTimePerPage = pageTimes.reduce((a, b) => a + b, 0) / pageTimes.length;
				const pagesRemaining = totalPages - currentPage;
				const estimatedTimeRemaining = Math.round((avgTimePerPage * pagesRemaining) / 1000); // em segundos

				console.log(
					`[TranscriptionQueue] 📄 Lead ${leadID}: Página ${currentPage}/${totalPages} (${percentage}%) - Tempo restante: ~${estimatedTimeRemaining}s`,
				);

				// Atualizar progresso do job
				await job.updateProgress({
					currentPage,
					totalPages,
					percentage,
					estimatedTimeRemaining,
				});

				// Notificar via SSE
				await sendSSEEvent(leadID, {
					type: "page-complete",
					page: currentPage,
					totalPages,
					percentage,
					estimatedTimeRemaining,
				});
			},
		});

		const processingTimeMs = Date.now() - startTime;

		console.log(
			`[TranscriptionQueue] ✅ Lead ${leadID}: Digitação concluída em ${(processingTimeMs / 1000).toFixed(1)}s`,
		);

		const transcriptionResult: TranscriptionResult = {
			leadID,
			blocks: transcriptionOutput.blocks,
			totalPages,
			processingTimeMs,
			textoDAprova: transcriptionOutput.textoDAprova,
			combinedText: transcriptionOutput.combinedText,
		};

		// Notificar conclusão
		await sendSSEEvent(leadID, {
			type: "completed",
			result: transcriptionResult,
		});

		// Enfileirar job para atualizar o lead no banco de dados
		console.log(`[TranscriptionQueue] 📝 Enfileirando job de manuscrito para atualização do lead ${leadID}`);

		await addManuscritoJob({
			leadID,
			textoDAprova: transcriptionOutput.textoDAprova,
			nome: job.data.nome,
			telefone: job.data.telefone,
			manuscrito: true,
		});

		console.log(`[TranscriptionQueue] ✅ Job de manuscrito enfileirado com sucesso`);

		return transcriptionResult;
	} catch (error: any) {
		console.error(`[TranscriptionQueue] ❌ Erro ao processar lead ${leadID}:`, error);

		// Notificar erro
		await sendSSEEvent(leadID, {
			type: "failed",
			error: error.message || "Erro desconhecido ao processar manuscrito",
		});

		throw error;
	}
}

// --- Helpers ---

async function sendSSEEvent(leadID: string, event: TranscriptionEvent): Promise<void> {
	try {
		await sseManager.sendNotification(leadID, {
			category: "transcription",
			event,
		});
	} catch (error) {
		console.error(`[TranscriptionQueue] ⚠️ Falha ao enviar SSE para ${leadID}:`, error);
	}
}

// --- API Pública ---

/**
 * Adiciona um job de transcrição à fila
 * DEDUPLICAÇÃO: Se já existir um job ativo/pendente para o lead, retorna o existente
 */
export async function enqueueTranscription(data: TranscriptionJobData): Promise<Job<TranscriptionJobData>> {
	const priority = data.priority || 5;
	const jobId = `transcribe-${data.leadID}`;

	// DEDUPLICAÇÃO: Verificar se já existe um job ativo ou pendente para este lead
	const existingJobs = await transcriptionQueue.getJobs(["waiting", "active", "delayed"]);
	const activeJob = existingJobs.find((j) => j.data.leadID === data.leadID);

	if (activeJob) {
		const state = await activeJob.getState();
		console.log(
			`[TranscriptionQueue] ⚠️ Job já existe para lead ${data.leadID} (${activeJob.id}, estado: ${state}) - ignorando duplicata`,
		);

		// Notificar que já está na fila
		await sendSSEEvent(data.leadID, {
			type: "queued",
			position: 0,
		});

		return activeJob;
	}

	console.log(
		`[TranscriptionQueue] ➕ Enfileirando transcrição - Lead: ${data.leadID}, Páginas: ${data.images.length}, Prioridade: ${priority}`,
	);

	const job = await transcriptionQueue.add("transcribe", data, {
		priority: 10 - priority, // BullMQ usa ordem inversa (menor valor = maior prioridade)
		jobId: `${jobId}-${Date.now()}`, // Mantém timestamp para histórico, mas dedup é por verificação acima
	});

	// Notificar posição na fila
	const waiting = await transcriptionQueue.getWaitingCount();
	await sendSSEEvent(data.leadID, {
		type: "queued",
		position: waiting,
	});

	return job;
}

/**
 * Obtém status de um job de transcrição
 */
export async function getTranscriptionStatus(leadID: string): Promise<{
	status: "queued" | "processing" | "completed" | "failed" | "not-found";
	progress?: TranscriptionProgress;
	result?: TranscriptionResult;
	error?: string;
}> {
	// Buscar jobs recentes para este lead
	const jobs = await transcriptionQueue.getJobs(["waiting", "active", "completed", "failed"]);
	const job = jobs.find((j) => j.data.leadID === leadID);

	if (!job) {
		return { status: "not-found" };
	}

	const state = await job.getState();

	if (state === "waiting") {
		const position = await transcriptionQueue.getWaitingCount();
		return {
			status: "queued",
			progress: { leadID, currentPage: 0, totalPages: job.data.images.length, percentage: 0, startedAt: new Date() },
		};
	}

	if (state === "active") {
		const progress = job.progress as any;
		return {
			status: "processing",
			progress: progress
				? {
					leadID,
					currentPage: progress.currentPage,
					totalPages: progress.totalPages,
					percentage: progress.percentage,
					startedAt: new Date(job.processedOn || Date.now()),
					estimatedTimeRemaining: progress.estimatedTimeRemaining,
				}
				: undefined,
		};
	}

	if (state === "completed") {
		return {
			status: "completed",
			result: job.returnvalue as TranscriptionResult,
		};
	}

	if (state === "failed") {
		return {
			status: "failed",
			error: job.failedReason || "Erro desconhecido",
		};
	}

	return { status: "not-found" };
}

/**
 * Cancela um job de transcrição
 */
export async function cancelTranscription(leadID: string): Promise<boolean> {
	const jobs = await transcriptionQueue.getJobs(["waiting", "active"]);
	const job = jobs.find((j) => j.data.leadID === leadID);

	if (job) {
		await job.remove();
		console.log(`[TranscriptionQueue] ❌ Job cancelado para lead ${leadID}`);
		return true;
	}

	return false;
}

/**
 * Obtém métricas da fila
 */
export async function getQueueMetrics() {
	const [waiting, active, completed, failed, delayed] = await Promise.all([
		transcriptionQueue.getWaitingCount(),
		transcriptionQueue.getActiveCount(),
		transcriptionQueue.getCompletedCount(),
		transcriptionQueue.getFailedCount(),
		transcriptionQueue.getDelayedCount(),
	]);

	return {
		waiting,
		active,
		completed,
		failed,
		delayed,
		total: waiting + active + completed + failed + delayed,
	};
}

// --- Cleanup ---

export async function stopTranscriptionWorker() {
	if (worker) {
		console.log("[TranscriptionQueue] 🛑 Parando worker...");
		await worker.close();
		worker = null;
		console.log("[TranscriptionQueue] ✅ Worker parado");
	}
}

// [CLEANUP 2026-02-16] SIGTERM/SIGINT handlers REMOVIDOS
// init.ts é o único responsável pelo graceful shutdown (já chama stopTranscriptionWorker())
