/**
 * Queue Manager Integration Module
 *
 * This module integrates the queue management system with existing workers
 * and registers all active queues for monitoring and management.
 */

import { getQueueManager } from "@/lib/queue-management/services/queue-manager.service";
import { getRedisInstance } from "@/lib/connections";
import { Queue } from "bullmq";

// Import existing queue configurations
// [CLEANUP 2026-02-16] RESPOSTA_RAPIDA_QUEUE_NAME e PERSISTENCIA_CREDENCIAIS_QUEUE_NAME removidos
// Essas filas não são mais usadas - SocialWise Flow processa mensagens inline
import { INSTAGRAM_TRANSLATION_QUEUE_NAME } from "@/lib/queue/instagram-translation.queue";
import { LEADS_QUEUE_NAME } from "@/lib/queue/leads-chatwit.queue";
// [CLEANUP 2026-02-16] manuscrito.queue.ts DELETADO - queue zumbi sem consumidor
// [CLEANUP 2026-02-21] AUTO_NOTIFICATIONS_QUEUE_NAME REMOVIDO - queue zombie (cron direto em cron-jobs.ts)

interface QueueRegistrationConfig {
	name: string;
	description: string;
	priority: number; // Use numeric priority: 1 = high, 5 = medium, 10 = low
	concurrency: number;
	retryAttempts: number;
	alertThresholds: {
		queueSize: { warning: number; critical: number };
		errorRate: { warning: number; critical: number };
		processingTime: { warning: number; critical: number };
	};
}

// [CLEANUP 2026-02-16] Filas removidas:
// - RESPOSTA_RAPIDA_QUEUE_NAME (código morto - SocialWise Flow é inline)
// - PERSISTENCIA_CREDENCIAIS_QUEUE_NAME (código morto - não tem produtor)
const QUEUE_CONFIGS: QueueRegistrationConfig[] = [
	{
		name: INSTAGRAM_TRANSLATION_QUEUE_NAME,
		description: "Tradução de mensagens do Instagram",
		priority: 5, // Medium priority
		concurrency: 5,
		retryAttempts: 3,
		alertThresholds: {
			queueSize: { warning: 30, critical: 60 },
			errorRate: { warning: 0.05, critical: 0.12 },
			processingTime: { warning: 8000, critical: 20000 },
		},
	},
	{
		name: LEADS_QUEUE_NAME,
		description: "Processamento de leads do ChatWit",
		priority: 5, // Medium priority
		concurrency: 3,
		retryAttempts: 3,
		alertThresholds: {
			queueSize: { warning: 25, critical: 50 },
			errorRate: { warning: 0.04, critical: 0.1 },
			processingTime: { warning: 7000, critical: 18000 },
		},
	},
	// [CLEANUP 2026-02-16] MANUSCRITO_QUEUE_NAME REMOVIDO - queue zumbi sem consumidor
	// [CLEANUP 2026-02-21] AUTO_NOTIFICATIONS_QUEUE_NAME REMOVIDO - queue zombie (cron direto)
];

// [CLEANUP 2026-02-16] AI_QUEUE_CONFIGS REMOVIDO - AI workers foram deletados na Fase 4

/**
 * Initialize and register all queues with the Queue Manager
 */
export async function initializeQueueManagement(): Promise<void> {
	try {
		console.log("[Queue Manager] 🚀 Initializing queue management system...");

		const queueManager = getQueueManager();
		const redis = getRedisInstance();

		// Register core system queues
		for (const config of QUEUE_CONFIGS) {
			try {
				// Create Queue instance for registration
				const queue = new Queue(config.name, { connection: redis });

				// Register with Queue Manager
				await queueManager.registerQueue(queue, config);

				console.log(`[Queue Manager] ✅ Registered queue: ${config.name}`);
			} catch (error) {
				console.error(`[Queue Manager] ❌ Failed to register queue ${config.name}:`, error);
			}
		}

		// [CLEANUP 2026-02-16] AI queues REMOVIDAS - workers deletados na Fase 4

		console.log("[Queue Manager] ✅ Queue management system initialized successfully");

		// Start health monitoring
		console.log("[Queue Manager] 🔄 Starting health monitoring...");
		startQueueHealthMonitoring();
	} catch (error) {
		console.error("[Queue Manager] ❌ Failed to initialize queue management:", error);
		throw error;
	}
}

/**
 * Start periodic health monitoring for all registered queues
 */
function startQueueHealthMonitoring(): void {
	const queueManager = getQueueManager();

	// Health check every 30 seconds
	setInterval(async () => {
		try {
			const healthMap = await queueManager.getAllQueuesHealth();

			// Log any critical issues
			for (const [queueName, health] of healthMap.entries()) {
				if (health.status === "critical") {
					console.warn(`[Queue Manager] 🚨 CRITICAL: Queue ${queueName} is in critical state`, {
						queueName,
						status: health.status,
						counts: health.counts,
						performance: health.performance,
					});
				}
			}
		} catch (error) {
			console.error("[Queue Manager] ❌ Health monitoring error:", error);
		}
	}, 30000);

	console.log("[Queue Manager] ✅ Health monitoring started");
}

/**
 * Gracefully shutdown queue management
 */
export async function shutdownQueueManagement(): Promise<void> {
	try {
		console.log("[Queue Manager] 🛑 Shutting down queue management...");

		const queueManager = getQueueManager();
		await queueManager.destroy();

		console.log("[Queue Manager] ✅ Queue management shutdown complete");
	} catch (error) {
		console.error("[Queue Manager] ❌ Error during queue management shutdown:", error);
	}
}

/**
 * Get current queue statistics for monitoring
 */
export async function getQueueStatistics() {
	try {
		const queueManager = getQueueManager();
		const healthMap = await queueManager.getAllQueuesHealth();

		const statistics = {
			totalQueues: healthMap.size,
			healthyQueues: 0,
			warningQueues: 0,
			criticalQueues: 0,
			totalJobs: 0,
			activeJobs: 0,
			failedJobs: 0,
			queueDetails: [] as any[],
		};

		for (const [queueName, health] of healthMap.entries()) {
			// Count queue statuses
			switch (health.status) {
				case "healthy":
					statistics.healthyQueues++;
					break;
				case "warning":
					statistics.warningQueues++;
					break;
				case "critical":
					statistics.criticalQueues++;
					break;
			}

			// Aggregate job counts
			statistics.totalJobs +=
				health.counts.waiting + health.counts.active + health.counts.completed + health.counts.failed;
			statistics.activeJobs += health.counts.active;
			statistics.failedJobs += health.counts.failed;

			// Queue details
			statistics.queueDetails.push({
				name: queueName,
				status: health.status,
				waiting: health.counts.waiting,
				active: health.counts.active,
				completed: health.counts.completed,
				failed: health.counts.failed,
				delayed: health.counts.delayed,
				throughput: health.performance.throughput,
				avgProcessingTime: health.performance.avgProcessingTime,
				errorRate: health.performance.errorRate,
			});
		}

		return statistics;
	} catch (error) {
		console.error("[Queue Manager] ❌ Error getting queue statistics:", error);
		throw error;
	}
}
