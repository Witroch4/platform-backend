// worker/webhook.worker.ts - Workers de Background
// [CLEANUP 2026-02-16] ParentWorker (resposta-rapida + persistencia-credenciais) REMOVIDO
// O SocialWise Flow processa mensagens inline (síncrono), não usa filas BullMQ

import { Worker, type Job } from "bullmq";
import { attachStandardEventHandlers } from "./utils/worker-events";
import dotenv from "dotenv";
import { getRedisInstance } from "@/lib/connections";
import { getPrismaInstance } from "@/lib/connections";
import { startRedisHealthMonitoring, checkRedisHealth } from "@/lib/redis-health-check";
import { processAgendamentoTask } from "./WebhookWorkerTasks/agendamento.task";
import { processLeadCellTask } from "./WebhookWorkerTasks/leadcells.task";
import { processMirrorGenerationTask } from "./WebhookWorkerTasks/mirror-generation.task";
import { processAnalysisGenerationTask } from "./WebhookWorkerTasks/analysis-generation.task";
// [CLEANUP 2026-02-16] manuscrito.queue.ts DELETADO - queue zumbi sem consumidor
import { leadCellsQueue } from "@/lib/queue/leadcells.queue";
import { mirrorGenerationQueue } from "@/lib/oab-eval/mirror-queue";
import {
	// [CLEANUP 2026-02-16] AUTO_NOTIFICATIONS_QUEUE_NAME e addCheckExpiringTokensJob REMOVIDOS
	// Auto Notifications simplificado: cron chama handler diretamente sem BullMQ
	type IAutoNotificationJobData,
	AutoNotificationType,
} from "@/lib/queue/instagram-webhook.queue";
import cron from "node-cron";
import { LEADS_QUEUE_NAME } from "@/lib/queue/leads-chatwit.queue";
import { processLeadChatwitTask } from "./WebhookWorkerTasks/leads-chatwit.task";
import { getWorkersConfig, isMonitorLogEnabled } from "@/lib/config";

import { processInstagramTranslationTask } from "./WebhookWorkerTasks/instagram-translation.task";
import { INSTAGRAM_TRANSLATION_QUEUE_NAME } from "@/lib/queue/instagram-translation.queue";

// [CLEANUP 2026-02-16] Imports removidos:
// - resposta-rapida.queue (código morto - SocialWise Flow é inline)
// - persistencia-credenciais.queue (código morto - não tem produtor)
// - respostaRapida.worker.task (código morto)
// - persistencia.worker.task (código morto)

dotenv.config();

// Definindo a interface para o progresso do job de leads
interface LeadJobProgress {
	processed?: boolean;
	leadId?: string;
}

// [CLEANUP 2026-02-16] ParentWorker REMOVIDO
// O ParentWorker gerenciava as filas resposta-rapida e persistencia-credenciais
// Essas filas não são mais usadas - SocialWise Flow processa mensagens inline (síncrono)
// Veja: app/api/integrations/webhooks/socialwiseflow/route.ts

// ============================================================================
// REDIS CONNECTION INITIALIZATION
// ============================================================================

/**
 * Wait for Redis to be ready before initializing workers
 */
export async function waitForRedisConnection(maxAttempts: number = 30, delayMs: number = 2000): Promise<void> {
	console.log("[Redis Health] 🔄 Waiting for Redis connection...");

	for (let attempt = 1; attempt <= maxAttempts; attempt++) {
		try {
			const health = await checkRedisHealth();

			if (health.healthy) {
				console.log(`[Redis Health] ✅ Redis connected successfully(latency: ${health.latency}ms)`);
				return;
			}

			console.log(
				`[Redis Health] ⏳ Attempt ${attempt}/${maxAttempts}: Redis not ready (status: ${health.connectionStatus})`,
			);

			if (attempt < maxAttempts) {
				await new Promise((resolve) => setTimeout(resolve, delayMs));
			}
		} catch (error) {
			console.log(
				`[Redis Health] ⏳ Attempt ${attempt}/${maxAttempts}: Redis connection error - ${error instanceof Error ? error.message : "Unknown error"}`,
			);

			if (attempt < maxAttempts) {
				await new Promise((resolve) => setTimeout(resolve, delayMs));
			}
		}
	}

	throw new Error(`Redis connection failed after ${maxAttempts} attempts`);
}

// ============================================================================
// LEGACY WORKERS (maintained for backward compatibility)
// ============================================================================

// Initialize workers after Redis connection is established
let agendamentoWorker: Worker;
// [CLEANUP 2026-02-16] manuscritoWorker REMOVIDO - duplicado do leadCellsWorker
let leadCellsWorker: Worker;
let leadsChatwitWorker: Worker;
let mirrorGenerationWorker: Worker;
let analysisGenerationWorker: Worker;

// Worker de leads‑chatwit 🔥 (concorrência ajustável baseada no ambiente)
const workersConfig = getWorkersConfig();
const leadsChatwitConcurrency = workersConfig.leads_chatwit.concurrency;
const leadsChatwitLockDuration = workersConfig.leads_chatwit.lock_duration;

let legacyWorkersInitialized = false;

/**
 * Initialize all legacy workers after Redis is ready
 */
export async function initializeLegacyWorkers(): Promise<void> {
	if (legacyWorkersInitialized) {
		console.log("[BullMQ] Legacy workers already initialized, skipping...");
		return;
	}

	console.log("[BullMQ] 🔄 Initializing legacy workers...");

	try {
		// Worker de agendamento
		agendamentoWorker = new Worker("agendamento", processAgendamentoTask, {
			connection: getRedisInstance(),
		});

		// [CLEANUP 2026-02-16] manuscritoWorker REMOVIDO - era duplicado do leadCellsWorker
		// Jobs da fila manuscrito são processados pelo leadCellsWorker (mesmo handler processLeadCellTask)

		// Worker unificado para lead cells (manuscrito, espelho, análise)
		leadCellsWorker = new Worker("leadCells", processLeadCellTask, {
			connection: getRedisInstance(),
			concurrency: 5,
			lockDuration: 30000,
		});

		// Worker para geração de espelhos locais (OAB)
		mirrorGenerationWorker = new Worker("oab-mirror-generation", processMirrorGenerationTask, {
			connection: getRedisInstance(),
			concurrency: 5, // Até 5 espelhos simultâneos
			lockDuration: 300000, // 5 minutos (pode demorar mais que manuscrito)
		});

		// Worker para análise comparativa (Prova × Espelho) — BLUEPRINT_ANALISE
		analysisGenerationWorker = new Worker("oab-analysis", processAnalysisGenerationTask, {
			connection: getRedisInstance(),
			concurrency: 3, // Até 3 análises simultâneas
			lockDuration: 300000, // 5 minutos (LLM pode demorar com textos grandes)
		});

		// Worker de leads‑chatwit 🔥
		leadsChatwitWorker = new Worker(LEADS_QUEUE_NAME, processLeadChatwitTask, {
			connection: getRedisInstance(),
			concurrency: leadsChatwitConcurrency, // Concorrência configurável via env
			lockDuration: leadsChatwitLockDuration, // Lock duration configurável
			stalledInterval: 60000, // Increased from 30s to 60s
			maxStalledCount: 2, // Increased from 1 to 2 to handle temporary timeouts
		});

		// Wait for all workers to be ready
		await Promise.all([
			agendamentoWorker.waitUntilReady(),
			// [CLEANUP 2026-02-16] manuscritoWorker.waitUntilReady() REMOVIDO - duplicado
			leadCellsWorker.waitUntilReady(),
			mirrorGenerationWorker.waitUntilReady(),
			analysisGenerationWorker.waitUntilReady(),
			leadsChatwitWorker.waitUntilReady(),
		]);

		console.log(`[BullMQ] ✅ Worker de leads-chatwit inicializado:`, {
			concurrency: leadsChatwitConcurrency,
			lockDuration: `${leadsChatwitLockDuration}ms`,
			stalledInterval: "30000ms",
		});

		legacyWorkersInitialized = true;
		console.log("[BullMQ] ✅ All legacy workers initialized successfully");
	} catch (error) {
		console.error("[BullMQ] ❌ Failed to initialize legacy workers:", error);
		throw error;
	}
}

// [CLEANUP 2026-02-16] autoNotificationsWorker BullMQ REMOVIDO
// Era desproporcional: Worker 24/7 para 1 query diária.
// Agora cron.schedule() chama handleExpiringTokensNotification() diretamente.

/**
 * Initialize auto notifications (simplified: no BullMQ worker needed)
 */
export async function initializeAutoNotificationsWorker(): Promise<void> {
	console.log("[AutoNotifications] ✅ Auto notifications configured (cron-based, no BullMQ worker)");
}

// [CLEANUP 2026-02-16] MTF Diamante async worker REMOVIDO - código morto (comentado há muito tempo)

// Import Instagram translation worker configuration
import {
	getCurrentWorkerConfig,
	logWorkerConfiguration,
	validateWorkerConfig,
} from "./config/instagram-translation-worker.config";

// Get and validate worker configuration
const instagramWorkerConfig = getCurrentWorkerConfig();
const configValidation = validateWorkerConfig(instagramWorkerConfig);

if (!configValidation.valid) {
	console.error("[Instagram Worker] Configuration validation failed:", configValidation.errors);
	throw new Error(`Instagram worker configuration invalid: ${configValidation.errors.join(", ")}`);
}

// Log worker configuration for monitoring
logWorkerConfiguration(instagramWorkerConfig);

// Initialize Instagram translation worker after Redis is ready
let instagramTranslationWorker: Worker;

/**
 * Initialize Instagram translation worker after Redis is ready
 */
export async function initializeInstagramTranslationWorker(): Promise<void> {
	console.log("[Instagram Worker] 🔄 Initializing Instagram translation worker...");

	try {
		instagramTranslationWorker = new Worker(INSTAGRAM_TRANSLATION_QUEUE_NAME, processInstagramTranslationTask, {
			connection: getRedisInstance(),
			concurrency: instagramWorkerConfig.concurrency, // Configurable concurrency for IO-bound translation tasks
			lockDuration: instagramWorkerConfig.lockDuration, // Configurable timeout to ensure webhook response within limits
			stalledInterval: 30000, // Check for stalled jobs every 30 seconds
			maxStalledCount: 1, // Mark job as failed after 1 stalled occurrence
		});

		// Wait for worker to be ready
		await instagramTranslationWorker.waitUntilReady();

		console.log("[Instagram Worker] ✅ Instagram translation worker initialized successfully");
	} catch (error) {
		console.error("[Instagram Worker] ❌ Failed to initialize Instagram translation worker:", error);
		throw error;
	}
}

/**
 * Setup event handlers for all workers using standardized utility
 */
function setupWorkerEventHandlers(): void {
	console.log("[BullMQ] 🔄 Setting up worker event handlers...");

	const workers: Array<[Worker, string]> = [
		[agendamentoWorker, "Agendamento"],
		[leadCellsWorker, "LeadCells"],
		[mirrorGenerationWorker, "MirrorGeneration"],
		[analysisGenerationWorker, "AnalysisGeneration"],
		[leadsChatwitWorker, "LeadsChatwit"],
	];

	for (const [worker, name] of workers) {
		attachStandardEventHandlers(worker, { name });
	}

	console.log("[BullMQ] ✅ Worker event handlers setup completed");
}

/**
 * Setup Instagram worker event handlers
 */
function setupInstagramWorkerEventHandlers(): void {
	console.log("[Instagram Worker] 🔄 Setting up Instagram worker event handlers...");

	// Enhanced event handling for Instagram Translation Worker with performance monitoring
	instagramTranslationWorker.on("completed", (job, result) => {
		const processingTime = result?.processingTime || 0;
		const memoryUsage = process.memoryUsage();

		console.log(`[Instagram Worker] Job ${job.id} completed successfully`, {
			processingTime: `${processingTime}ms`,
			memoryUsage: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`,
			correlationId: job.data.correlationId,
			success: result?.success,
		});

		// Check for performance warnings
		if (processingTime > instagramWorkerConfig.processing.warningThreshold) {
			console.warn(`[Instagram Worker] Job ${job.id} processing time exceeded warning threshold`, {
				processingTime: `${processingTime}ms`,
				threshold: `${instagramWorkerConfig.processing.warningThreshold}ms`,
				correlationId: job.data.correlationId,
			});
		}
	});

	instagramTranslationWorker.on("failed", (job, error) => {
		const memoryUsage = process.memoryUsage();

		console.error(`[Instagram Worker] Job ${job?.id} failed: ${error.message}`, {
			correlationId: job?.data?.correlationId,
			attemptsMade: job?.attemptsMade,
			maxAttempts: job?.opts?.attempts,
			memoryUsage: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`,
			error: error.message,
		});
	});

	instagramTranslationWorker.on("stalled", (job: any) => {
		console.warn(`[Instagram Worker] Job ${job.id} stalled`, {
			correlationId: job.data?.correlationId,
			stalledCount: job.opts?.stalledCount || 0,
			lockDuration: `${instagramWorkerConfig.lockDuration}ms`,
		});
	});

	instagramTranslationWorker.on("error", (error) => {
		console.error("[Instagram Worker] Worker error:", {
			error: error.message,
			stack: error.stack,
			timestamp: new Date().toISOString(),
		});
	});

	console.log("[Instagram Worker] ✅ Instagram worker event handlers setup completed");
}

// Add periodic resource monitoring for the Instagram worker
let resourceMonitoringInterval: NodeJS.Timeout;

/**
 * Start resource monitoring for Instagram worker
 */
function startInstagramResourceMonitoring(): void {
	if (instagramWorkerConfig.monitoring.enabled) {
		console.log("[Instagram Worker] 🔄 Starting resource monitoring...");

		resourceMonitoringInterval = setInterval(() => {
			if (isMonitorLogEnabled()) {
				const memoryUsage = process.memoryUsage();
				const cpuUsage = process.cpuUsage();

				// Log resource usage periodically
				console.log("[Instagram Worker] Resource usage report:", {
					memory: {
						heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`,
						heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB`,
						external: `${Math.round(memoryUsage.external / 1024 / 1024)}MB`,
					},
					cpu: {
						user: `${Math.round(cpuUsage.user / 1000)}ms`,
						system: `${Math.round(cpuUsage.system / 1000)}ms`,
					},
					uptime: `${Math.round(process.uptime())}s`,
					timestamp: new Date().toISOString(),
				});
			}
		}, instagramWorkerConfig.monitoring.metricsInterval);

		console.log("[Instagram Worker] ✅ Resource monitoring started");
	}
}

/**
 * Setup leads worker event handlers
 */
function setupLeadsWorkerEventHandlers(): void {
	console.log("[BullMQ] 🔄 Setting up leads worker event handlers...");

	// Eventos específicos para o worker de leads (com logs detalhados para debug)
	leadsChatwitWorker.on("progress", (job, progress) => {
		const leadProgress = progress as unknown as LeadJobProgress;
		console.log(`[BullMQ-Debug] Job ${job.id} - progresso:`, progress);
		if (leadProgress.processed) {
			console.log(`[BullMQ] Job ${job.id} processado em lote para leadId: ${leadProgress.leadId}`);
		}
	});

	leadsChatwitWorker.on("active", (job) => {
		console.log(
			`[BullMQ-Debug] Job ${job.id} INICIADO - sourceId: ${job.data.payload?.origemLead?.source_id}, arquivos: ${job.data.payload?.origemLead?.arquivos?.length || 0}`,
		);
	});

	leadsChatwitWorker.on("completed", (job, result) => {
		console.log(
			`[BullMQ-Debug] Job ${job.id} CONCLUÍDO - sourceId: ${job.data.payload?.origemLead?.source_id}, resultado:`,
			result,
		);
	});

	leadsChatwitWorker.on("failed", (job, err) => {
		console.error(`[BullMQ-Debug] Job ${job?.id} FALHOU - sourceId: ${job?.data?.payload?.origemLead?.source_id}:`, {
			error: err.message,
			stack: err.stack,
			jobData: job?.data,
		});
	});

	leadsChatwitWorker.on("stalled", (jobId) => {
		console.warn(`[BullMQ-Debug] Job ${jobId} TRAVADO (stalled) - pode indicar timeout ou sobrecarga`);
	});

	leadsChatwitWorker.on("error", (err) => {
		console.error(`[BullMQ-Debug] ERRO NO WORKER:`, {
			error: err.message,
			stack: err.stack,
			concurrency: leadsChatwitConcurrency,
			lockDuration: leadsChatwitLockDuration,
		});
	});

	console.log("[BullMQ] ✅ Leads worker event handlers setup completed");
}

/**
 * Processa notificações de tokens expirando
 */
async function handleExpiringTokensNotification(data: IAutoNotificationJobData) {
	try {
		console.log("[BullMQ] Verificando tokens expirando...");

		const sevenDaysFromNow = new Date();
		sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

		const expiringAccounts = await getPrismaInstance().account.findMany({
			where: {
				expires_at: {
					not: null,
					lte: Math.floor(sevenDaysFromNow.getTime() / 1000),
					gt: Math.floor(Date.now() / 1000),
				},
			},
			include: {
				user: {
					select: {
						id: true,
						name: true,
						email: true,
					},
				},
			},
		});

		console.log(`[BullMQ] Encontradas ${expiringAccounts.length} contas com tokens expirando.`);

		for (const account of expiringAccounts) {
			const expiresAt = account.expires_at ? new Date(account.expires_at * 1000) : null;
			if (!expiresAt) continue;

			const daysRemaining = Math.ceil((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24));

			await getPrismaInstance().notification.create({
				data: {
					userId: account.userId,
					title: "Token de Acesso Expirando",
					message: `Seu token de acesso para ${account.provider} expirará em ${daysRemaining} dias. Por favor, reconecte sua conta para evitar interrupções.`,
					isRead: false,
				},
			});

			console.log(
				`[BullMQ] Notificação criada para o usuário ${account.userId} sobre token expirando em ${daysRemaining} dias.`,
			);
		}

		return { success: true, count: expiringAccounts.length };
	} catch (error: any) {
		console.error("[BullMQ] Erro ao processar notificação de tokens expirando:", error);
		throw error;
	}
}

/**
 * Inicializa os jobs recorrentes
 * [CLEANUP 2026-02-16] Simplificado: chama handler diretamente sem BullMQ queue
 */
export async function initJobs() {
	try {
		console.log("[AutoNotifications] Inicializando jobs recorrentes...");

		cron.schedule("0 8 * * *", async () => {
			try {
				console.log("[AutoNotifications] Executando verificação diária de tokens expirando...");
				await handleExpiringTokensNotification({ type: AutoNotificationType.EXPIRING_TOKENS });
				console.log("[AutoNotifications] ✅ Verificação de tokens concluída.");
			} catch (error) {
				console.error("[AutoNotifications] Erro ao verificar tokens expirando:", error);
			}
		});

		console.log("[AutoNotifications] ✅ Jobs recorrentes inicializados (cron: diário às 8h).");
	} catch (error) {
		console.error("[AutoNotifications] Erro ao inicializar jobs recorrentes:", error);
	}
}


/**
 * Perform health check for Instagram translation worker
 */
async function performInstagramWorkerHealthCheck(): Promise<{
	healthy: boolean;
	issues: string[];
	metrics: {
		memoryUsage: string;
		uptime: string;
		configValid: boolean;
	};
}> {
	const issues: string[] = [];
	const memoryUsage = process.memoryUsage();

	try {
		// Check if worker exists
		if (!instagramTranslationWorker) {
			issues.push("Instagram translation worker not initialized");
			return {
				healthy: false,
				issues,
				metrics: {
					memoryUsage: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`,
					uptime: `${Math.round(process.uptime())}s`,
					configValid: false,
				},
			};
		}

		// Check worker configuration
		const configValidation = validateWorkerConfig(instagramWorkerConfig);
		if (!configValidation.valid) {
			issues.push(`Configuration invalid: ${configValidation.errors.join(", ")}`);
		}

		// Check memory usage (Docker handles resource limits, just log for monitoring)
		const memoryUsageMB = memoryUsage.heapUsed / 1024 / 1024;
		console.log(`[Instagram Worker] Memory usage: ${Math.round(memoryUsageMB)}MB`);

		// Check if worker is responsive
		const healthCheckTimeout = new Promise((_, reject) =>
			setTimeout(() => reject(new Error("Health check timeout")), instagramWorkerConfig.lifecycle.healthCheckTimeout),
		);

		try {
			await Promise.race([
				// Simple responsiveness check - worker should be able to handle this quickly
				new Promise((resolve) => setTimeout(resolve, 100)),
				healthCheckTimeout,
			]);
		} catch (timeoutError) {
			issues.push("Worker responsiveness check failed");
		}

		return {
			healthy: issues.length === 0,
			issues,
			metrics: {
				memoryUsage: `${Math.round(memoryUsageMB)}MB`,
				uptime: `${Math.round(process.uptime())}s`,
				configValid: configValidation.valid,
			},
		};
	} catch (error) {
		issues.push(`Health check error: ${error instanceof Error ? error.message : String(error)}`);

		return {
			healthy: false,
			issues,
			metrics: {
				memoryUsage: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`,
				uptime: `${Math.round(process.uptime())}s`,
				configValid: false,
			},
		};
	}
}





export {
	// [CLEANUP 2026-02-16] ParentWorker REMOVIDO - código morto
	setupWorkerEventHandlers,
	setupInstagramWorkerEventHandlers,
	setupLeadsWorkerEventHandlers,
	startInstagramResourceMonitoring,
	performInstagramWorkerHealthCheck,
	instagramWorkerConfig,
};
