// worker/init.ts — Single Orchestrator for all workers
// This is the ONLY entrypoint that should be used to start workers.

import {
	// [CLEANUP 2026-02-16] createParentWorker e getParentWorker REMOVIDOS
	// ParentWorker gerenciava filas resposta-rapida e persistencia-credenciais (código morto)
	waitForRedisConnection,
	initializeLegacyWorkers,
	initializeAutoNotificationsWorker,
	initializeInstagramTranslationWorker,
	setupWorkerEventHandlers,
	setupInstagramWorkerEventHandlers,
	setupLeadsWorkerEventHandlers,
	startInstagramResourceMonitoring,
	instagramWorkerConfig,
	initJobs,
} from "./webhook.worker";
import { initializeExistingAgendamentos } from "../lib/scheduler-bullmq";
// [CLEANUP 2026-02-16] AI Integration Workers REMOVIDOS - eram código morto (simulações, ninguém enfileirava jobs)
import { instagramWebhookWorker } from "./automacao.worker";
import { initializeQueueManagement, shutdownQueueManagement } from "./queue-manager-integration";
import { startTranscriptionWorker, stopTranscriptionWorker } from "../lib/oab-eval/transcription-queue";
import { sseManager } from "../lib/sse-manager";
import { startRedisHealthMonitoring } from "@/lib/redis-health-check";
import { getPrismaInstance } from "@/lib/connections";
import { initializeFxRateSystem, fxRateWorker } from "@/lib/cost/fx-rate-worker";
import { scheduleBudgetMonitoring, stopBudgetMonitoring, budgetWorker } from "@/lib/cost/budget-monitor";
import { getWebhookWorker, getWebhookQueue } from "@/lib/webhook/webhook-queue";
import dotenv from "dotenv";

dotenv.config();

// ============================================================================
// PHASE-BASED WORKER INITIALIZATION
// ============================================================================

/**
 * Initialize all workers in a controlled, phased sequence.
 * Single orchestrator — no other file should trigger worker initialization.
 */
export async function initializeWorkers() {
	try {
		console.log("[Worker] 🚀 Inicializando TODOS os workers em um único container...\n");

		// ====================================================================
		// PHASE 1: REDIS CONNECTION
		// ====================================================================
		await waitForRedisConnection();
		startRedisHealthMonitoring(60_000);
		console.log("[Worker] ✅ Redis conectado e monitoramento iniciado");

		// ====================================================================
		// PHASE 2: CORE WORKERS (parallel where possible)
		// ====================================================================

		// [CLEANUP 2026-02-16] ParentWorker REMOVIDO
		// O ParentWorker gerenciava filas resposta-rapida e persistencia-credenciais
		// Essas filas não são mais usadas - SocialWise Flow processa mensagens inline (síncrono)

		// 2a. Instagram Webhook Worker (automação "eu-quero")
		await instagramWebhookWorker.waitUntilReady();
		console.log("[Worker] ✅ Worker de Automação Instagram inicializado");

		// [CLEANUP 2026-02-16] AI Integration Workers REMOVIDOS - eram código morto

		// 2c. Legacy Workers + Auto Notifications + Instagram Translation (parallel)
		await Promise.all([
			initializeLegacyWorkers(),
			initializeAutoNotificationsWorker(),
			initializeInstagramTranslationWorker(),
		]);
		console.log("[Worker] ✅ Legacy, Auto-Notifications e Instagram Translation inicializados");

		// ====================================================================
		// PHASE 3: EVENT HANDLERS & MONITORING
		// ====================================================================
		setupWorkerEventHandlers();
		setupInstagramWorkerEventHandlers();
		setupLeadsWorkerEventHandlers();
		startInstagramResourceMonitoring();
		console.log("[Worker] ✅ Event handlers e monitoramento configurados");

		// ====================================================================
		// PHASE 4: SHARED RESOURCES
		// ====================================================================
		await sseManager.ensureRedisConnected();
		console.log("[Worker] ✅ SSE Redis conectado");

		startTranscriptionWorker();
		console.log("[Worker] ✅ Worker de Transcrição OAB inicializado");

		await initializeQueueManagement();
		console.log("[Worker] ✅ Sistema de Gerenciamento de Filas inicializado");

		// 4d. FX Rate Worker (formerly orphan - auto-initialized on import)
		try {
			await initializeFxRateSystem();
			console.log("[Worker] ✅ FX Rate Worker inicializado");
		} catch (error) {
			console.warn("[Worker] ⚠️ FX Rate Worker falhou (não-crítico):", error);
		}

		// 4e. Budget Monitor Worker (formerly orphan - auto-initialized on import)
		try {
			await scheduleBudgetMonitoring();
			console.log("[Worker] ✅ Budget Monitor inicializado");
		} catch (error) {
			console.warn("[Worker] ⚠️ Budget Monitor falhou (não-crítico):", error);
		}

		// 4f. Webhook Delivery Worker (formerly orphan - had its own SIGINT)
		try {
			const webhookWorker = getWebhookWorker();
			await webhookWorker.waitUntilReady();
			console.log("[Worker] ✅ Webhook Delivery Worker inicializado");
		} catch (error) {
			console.warn("[Worker] ⚠️ Webhook Delivery Worker falhou (não-crítico):", error);
		}

		// ====================================================================
		// PHASE 5: SCHEDULING
		// ====================================================================
		await initJobs();
		console.log("[Worker] ✅ Jobs recorrentes inicializados");

		const result = await initializeExistingAgendamentos();
		console.log("[Worker] ✅ Agendamentos existentes carregados");

		// ====================================================================
		// STARTUP BANNER
		// ====================================================================
		printStartupBanner(result.count ?? 0);

		return { success: true, count: result.count };
	} catch (error) {
		console.error("[Worker] ❌ Erro ao inicializar workers:", error);
		return { success: false, error };
	}
}

// ============================================================================
// STARTUP BANNER
// ============================================================================

function printStartupBanner(agendamentosCount: number) {
	console.log("\n" + "=".repeat(70));
	console.log("🎉 WORKERS UNIFICADOS INICIADOS COM SUCESSO!");
	console.log("=".repeat(70));
	console.log("📊 Status dos Workers:");
	// [CLEANUP 2026-02-16] Parent Worker REMOVIDO (resposta-rapida + persistencia eram código morto)
	console.log("   📱 Instagram Webhook   → Automação Instagram");
	console.log("   📝 Workers Legados     → Manuscrito, Leads, Tradução");
	console.log("   📄 Transcription OAB   → Digitação de manuscritos com LangGraph");
	console.log("   🔍 Analysis OAB        → Análise comparativa Prova × Espelho");
	console.log("   💱 FX Rate             → Atualização diária câmbio USD/BRL");
	console.log("   💰 Budget Monitor      → Monitoramento de orçamentos");
	console.log("   📤 Webhook Delivery    → Entrega de webhooks com retry");
	console.log("   ⏰ Jobs Recorrentes    → Configurados e ativos");
	console.log("   📊 Queue Management    → Monitorando todas as filas");
	console.log("-".repeat(70));
	console.log(`📈 Agendamentos:  ${agendamentosCount} carregados`);
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
	}, instagramWorkerConfig.lifecycle.gracefulShutdownTimeout);

	try {
		// 1. Stop queue management
		await shutdownQueueManagement();

		// 2. Stop transcription worker
		await stopTranscriptionWorker();

		// 3. Close all BullMQ workers
		// [CLEANUP 2026-02-16] ParentWorker REMOVIDO do shutdown
		const workersToClose: Promise<void>[] = [];
		if (instagramWebhookWorker) workersToClose.push(instagramWebhookWorker.close());

		// Close orphan workers now managed by orchestrator
		try { if (fxRateWorker) workersToClose.push(fxRateWorker.close()); } catch { }
		try { if (budgetWorker) workersToClose.push(budgetWorker.close()); } catch { }
		try {
			const ww = getWebhookWorker();
			const wq = getWebhookQueue();
			workersToClose.push(ww.close());
			workersToClose.push(wq.close());
		} catch { }

		await Promise.race([
			Promise.all(workersToClose),
			new Promise<void>((_, reject) => setTimeout(() => reject(new Error("Worker shutdown timeout")), 25_000)),
		]);

		// 4. Disconnect database
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
