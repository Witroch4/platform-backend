// worker/init.ts — Single Orchestrator for all workers
// This is the ONLY entrypoint that should be used to start workers.
// All worker definitions live in registry.ts (single source of truth).

import { Worker, Queue } from "bullmq";
import { getRedisInstance } from "@/lib/connections";
import { getPrismaInstance } from "@/lib/connections";
import { checkRedisHealth, startRedisHealthMonitoring } from "@/lib/redis-health-check";
import { attachStandardEventHandlers } from "./utils/worker-events";
import { workerRegistry, getRegistryJobDefaults, type WorkerDefinition } from "./registry";
import { initCronJobs, stopCronJobs } from "./cron-jobs";
import { initializeExistingAgendamentos } from "../lib/scheduler-bullmq";
import { initializeQueueManagement, shutdownQueueManagement } from "./queue-manager-integration";
import { sseManager } from "../lib/sse-manager";
import { ensureInitialFxRate } from "@/lib/cost/fx-rate-worker";
import { getWebhookQueue } from "@/lib/webhook/webhook-queue";
import dotenv from "dotenv";

dotenv.config();

// ============================================================================
// WORKER INSTANCE TRACKING (for shutdown)
// ============================================================================

const activeWorkers = new Map<string, Worker>();
const scheduleQueues: Queue[] = []; // Queues used for recurring schedules

// ============================================================================
// REDIS CONNECTION
// ============================================================================

async function waitForRedisConnection(maxAttempts = 30, delayMs = 2000): Promise<void> {
	console.log("[Redis Health] 🔄 Waiting for Redis connection...");

	for (let attempt = 1; attempt <= maxAttempts; attempt++) {
		try {
			const health = await checkRedisHealth();
			if (health.healthy) {
				console.log(`[Redis Health] ✅ Redis connected successfully (latency: ${health.latency}ms)`);
				return;
			}
			console.log(`[Redis Health] ⏳ Attempt ${attempt}/${maxAttempts}: Redis not ready (status: ${health.connectionStatus})`);
		} catch (error) {
			console.log(`[Redis Health] ⏳ Attempt ${attempt}/${maxAttempts}: ${error instanceof Error ? error.message : "Unknown error"}`);
		}
		if (attempt < maxAttempts) await new Promise((r) => setTimeout(r, delayMs));
	}

	throw new Error(`Redis connection failed after ${maxAttempts} attempts`);
}

// ============================================================================
// PHASED INITIALIZATION
// ============================================================================

export async function initializeWorkers() {
	try {
		console.log("[Worker] 🚀 Inicializando TODOS os workers em um único container...\n");

		// ==================================================================
		// PHASE 1: REDIS
		// ==================================================================
		await waitForRedisConnection();
		startRedisHealthMonitoring(60_000);
		console.log("[Worker] ✅ Redis conectado e monitoramento iniciado");

		// ==================================================================
		// PHASE 2: WORKERS (registry-driven loop)
		// ==================================================================
		console.log(`[Worker] 🔄 Criando ${workerRegistry.length} workers do registry...`);

		const criticalWorkers: Promise<void>[] = [];
		const nonCriticalWorkers: Promise<void>[] = [];

		for (const def of workerRegistry) {
			const promise = createAndTrackWorker(def);
			if (def.critical === false) {
				nonCriticalWorkers.push(
					promise.catch((err) => {
						console.warn(`[Worker] ⚠️ Worker não-crítico ${def.name} falhou (container continua):`, err);
					}),
				);
			} else {
				criticalWorkers.push(promise);
			}
		}

		// Critical workers MUST succeed
		await Promise.all(criticalWorkers);
		// Non-critical workers are best-effort
		await Promise.all(nonCriticalWorkers);

		console.log(`[Worker] ✅ ${activeWorkers.size}/${workerRegistry.length} workers inicializados`);

		// ==================================================================
		// PHASE 2b: SCHEDULE RECURRING JOBS (registry-driven)
		// ==================================================================
		await scheduleRecurringJobs();

		// ==================================================================
		// PHASE 3: CRON JOBS
		// ==================================================================
		initCronJobs();
		console.log("[Worker] ✅ Cron jobs inicializados");

		// ==================================================================
		// PHASE 4: SHARED RESOURCES
		// ==================================================================
		await sseManager.ensureRedisConnected();
		console.log("[Worker] ✅ SSE Redis conectado");

		await initializeQueueManagement();
		console.log("[Worker] ✅ Sistema de Gerenciamento de Filas inicializado");

		// Ensure initial FX rate exists (one-time bootstrap, not scheduling)
		try {
			await ensureInitialFxRate();
		} catch (error) {
			console.warn("[Worker] ⚠️ FX Rate bootstrap falhou (não-crítico):", error);
		}

		// ==================================================================
		// PHASE 5: AGENDAMENTOS
		// ==================================================================
		const result = await initializeExistingAgendamentos();
		console.log("[Worker] ✅ Agendamentos existentes carregados");

		// ==================================================================
		// STARTUP BANNER
		// ==================================================================
		printStartupBanner(result.count ?? 0);

		return { success: true, count: result.count };
	} catch (error) {
		console.error("[Worker] ❌ Erro ao inicializar workers:", error);
		return { success: false, error };
	}
}

// ============================================================================
// WORKER CREATION (from registry definition)
// ============================================================================

async function createAndTrackWorker(def: WorkerDefinition): Promise<void> {
	const worker = new Worker(def.queue, def.processor, {
		connection: getRedisInstance(),
		concurrency: def.concurrency ?? 1,
		lockDuration: def.lockDuration ?? 30000,
		stalledInterval: def.stalledInterval ?? 30000,
		maxStalledCount: def.maxStalledCount ?? 1,
		...(def.limiter ? { limiter: def.limiter } : {}),
	});

	attachStandardEventHandlers(worker, { name: def.name });
	await worker.waitUntilReady();
	activeWorkers.set(def.name, worker);

	console.log(`[Worker]   ✅ ${def.name} (queue: ${def.queue}, concurrency: ${def.concurrency ?? 1})`);
}

// ============================================================================
// RECURRING SCHEDULES (registry-driven — replaces manual scheduling calls)
// ============================================================================

async function scheduleRecurringJobs(): Promise<void> {
	let scheduledCount = 0;

	for (const def of workerRegistry) {
		if (!def.schedule?.length) continue;

		const queue = new Queue(def.queue, {
			connection: getRedisInstance(),
			defaultJobOptions: getRegistryJobDefaults(def.queue),
		});
		scheduleQueues.push(queue);

		for (const sched of def.schedule) {
			try {
				await queue.add(sched.jobName, sched.jobData ?? {}, {
					repeat: { pattern: sched.pattern },
					jobId: `${def.name}-${sched.jobName}`,
				});
				scheduledCount++;
				console.log(`[Worker]   📅 ${def.name}: ${sched.description ?? sched.pattern}`);
			} catch (error) {
				console.warn(`[Worker]   ⚠️ Schedule falhou ${def.name}/${sched.jobName}:`, error);
			}
		}
	}

	if (scheduledCount > 0) {
		console.log(`[Worker] ✅ ${scheduledCount} recurring jobs agendados via registry`);
	}
}

// ============================================================================
// STARTUP BANNER
// ============================================================================

function printStartupBanner(agendamentosCount: number) {
	console.log("\n" + "=".repeat(70));
	console.log("🎉 WORKERS UNIFICADOS INICIADOS COM SUCESSO!");
	console.log("=".repeat(70));
	console.log("📊 Workers ativos:");

	for (const def of workerRegistry) {
		const status = activeWorkers.has(def.name) ? "✅" : "❌";
		console.log(`   ${def.icon ?? "🔹"} ${status} ${def.name.padEnd(22)} → ${def.description ?? def.queue}`);

		// Show schedules under the worker
		if (def.schedule?.length) {
			for (const sched of def.schedule) {
				console.log(`      📅 ${sched.description ?? sched.pattern}`);
			}
		}
	}

	console.log("-".repeat(70));
	console.log("📅 Cron jobs: Verificação tokens 8h UTC (node-cron)");
	console.log(`📈 Agendamentos:  ${agendamentosCount} carregados`);
	console.log(`🔧 Total workers: ${activeWorkers.size}/${workerRegistry.length}`);
	console.log("=".repeat(70) + "\n");
}

// ============================================================================
// GRACEFUL SHUTDOWN (single, consolidated handler)
// ============================================================================

async function gracefulShutdown(signal: string) {
	console.log(`[Worker] 🛑 Recebido sinal ${signal}, iniciando shutdown graceful...`);

	const shutdownTimeout = setTimeout(() => {
		console.error("[Worker] Shutdown timeout exceeded, forcing exit");
		process.exit(1);
	}, 30_000);

	try {
		// 1. Stop cron jobs
		stopCronJobs();

		// 2. Stop queue management
		await shutdownQueueManagement();

		// 3. Close ALL workers (from registry — no more missing workers)
		const closePromises = Array.from(activeWorkers.entries()).map(async ([name, worker]) => {
			try {
				await worker.close();
				console.log(`[Worker]   ✅ ${name} fechado`);
			} catch (err) {
				console.warn(`[Worker]   ⚠️ ${name} falhou ao fechar:`, err);
			}
		});

		await Promise.race([
			Promise.all(closePromises),
			new Promise<void>((_, reject) => setTimeout(() => reject(new Error("Worker shutdown timeout")), 25_000)),
		]);

		// 4. Close schedule queues and other standalone queues
		for (const q of scheduleQueues) {
			try { await q.close(); } catch { }
		}
		try {
			const wq = getWebhookQueue();
			await wq.close();
		} catch { }

		// 5. Disconnect database
		await getPrismaInstance().$disconnect();

		clearTimeout(shutdownTimeout);
		console.log("[Worker] 👋 Shutdown concluído com sucesso");
		process.exit(0);
	} catch (error) {
		console.error("[Worker] ❌ Erro durante shutdown:", error);
		clearTimeout(shutdownTimeout);
		process.exit(1);
	}
}

// Register shutdown handlers (only once, only here)
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGUSR2", () => gracefulShutdown("SIGUSR2")); // For nodemon

process.on("uncaughtException", (error) => {
	console.error("[Worker] Uncaught exception:", error);
	gracefulShutdown("UNCAUGHT_EXCEPTION");
});

process.on("unhandledRejection", (reason, _promise) => {
	console.error("[Worker] Unhandled rejection:", reason);
	gracefulShutdown("UNHANDLED_REJECTION");
});

// ============================================================================
// ENTRYPOINT
// ============================================================================

if (require.main === module) {
	console.log("🚀 Iniciando container unificado de workers...");

	initializeWorkers()
		.then((result) => {
			if (result.success) {
				console.log("[Worker] 🎉 Inicialização concluída com sucesso!");
				console.log("[Worker] 🔄 Container de workers rodando e aguardando jobs...");

				// Keep process alive
				setInterval(() => {
					if (process.env.MONITOR_LOG === "true") {
						console.log("[Worker] 💓 Heartbeat - Todos os workers ativos");
					}
				}, 60_000);
			} else {
				console.error("[Worker] ❌ Falha na inicialização:", result.error);
				process.exit(1);
			}
		})
		.catch((error) => {
			console.error("[Worker] ❌ Erro na inicialização:", error);
			process.exit(1);
		});
}
