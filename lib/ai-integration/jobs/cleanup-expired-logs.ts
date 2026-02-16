import { getPrismaInstance } from "@/lib/connections";
import type { PrismaClient } from "@prisma/client";

// Get prisma instance using singleton
const prisma = getPrismaInstance();

/**
 * Job para limpeza automática de logs expirados
 * Remove registros de LlmAudit e IntentHitLog que passaram da data de expiração
 */
export async function cleanupExpiredLogs() {
	const now = new Date();

	try {
		console.log(`[Cleanup] Starting expired logs cleanup at ${now.toISOString()}`);

		// Limpar LlmAudit expirados
		const deletedLlmAudit = await prisma.llmAudit.deleteMany({
			where: {
				expiresAt: {
					lt: now,
				},
			},
		});

		// Limpar IntentHitLog expirados
		const deletedIntentHitLog = await prisma.intentHitLog.deleteMany({
			where: {
				expiresAt: {
					lt: now,
				},
			},
		});

		console.log(`[Cleanup] Deleted ${deletedLlmAudit.count} expired LlmAudit records`);
		console.log(`[Cleanup] Deleted ${deletedIntentHitLog.count} expired IntentHitLog records`);

		return {
			llmAuditDeleted: deletedLlmAudit.count,
			intentHitLogDeleted: deletedIntentHitLog.count,
			totalDeleted: deletedLlmAudit.count + deletedIntentHitLog.count,
		};
	} catch (error) {
		console.error("[Cleanup] Error during expired logs cleanup:", error);
		throw error;
	}
}

/**
 * Agenda a limpeza periódica de logs expirados
 * Executa a cada 6 horas por padrão
 */
export function schedulePeriodicCleanup(intervalHours: number = 6) {
	const intervalMs = intervalHours * 60 * 60 * 1000;

	console.log(`[Cleanup] Scheduling periodic cleanup every ${intervalHours} hours`);

	// Executa imediatamente uma vez
	cleanupExpiredLogs().catch((error) => {
		console.error("[Cleanup] Initial cleanup failed:", error);
	});

	// Agenda execuções periódicas
	const intervalId = setInterval(async () => {
		try {
			await cleanupExpiredLogs();
		} catch (error) {
			console.error("[Cleanup] Scheduled cleanup failed:", error);
		}
	}, intervalMs);

	return intervalId;
}

/**
 * Obtém estatísticas dos logs para monitoramento
 */
export async function getLogsStatistics() {
	try {
		const [llmAuditStats, intentHitLogStats] = await Promise.all([
			prisma.llmAudit.aggregate({
				_count: { id: true },
				_min: { createdAt: true, expiresAt: true },
				_max: { createdAt: true, expiresAt: true },
			}),
			prisma.intentHitLog.aggregate({
				_count: { id: true },
				_min: { createdAt: true, expiresAt: true },
				_max: { createdAt: true, expiresAt: true },
			}),
		]);

		// Contar registros que expiram nas próximas 24 horas
		const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
		const [llmAuditExpiringSoon, intentHitLogExpiringSoon] = await Promise.all([
			prisma.llmAudit.count({
				where: {
					expiresAt: {
						lt: tomorrow,
						gte: new Date(),
					},
				},
			}),
			prisma.intentHitLog.count({
				where: {
					expiresAt: {
						lt: tomorrow,
						gte: new Date(),
					},
				},
			}),
		]);

		return {
			llmAudit: {
				total: llmAuditStats._count.id,
				oldestRecord: llmAuditStats._min.createdAt,
				newestRecord: llmAuditStats._max.createdAt,
				earliestExpiry: llmAuditStats._min.expiresAt,
				latestExpiry: llmAuditStats._max.expiresAt,
				expiringSoon: llmAuditExpiringSoon,
			},
			intentHitLog: {
				total: intentHitLogStats._count.id,
				oldestRecord: intentHitLogStats._min.createdAt,
				newestRecord: intentHitLogStats._max.createdAt,
				earliestExpiry: intentHitLogStats._min.expiresAt,
				latestExpiry: intentHitLogStats._max.expiresAt,
				expiringSoon: intentHitLogExpiringSoon,
			},
		};
	} catch (error) {
		console.error("[Cleanup] Error getting logs statistics:", error);
		throw error;
	}
}
