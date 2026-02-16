import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getPrismaInstance, getRedisInstance } from "@/lib/connections";
import logger from "@/lib/utils/logger";

export async function GET(request: NextRequest) {
	try {
		const session = await auth();

		if (!session?.user?.id || session.user.role !== "SUPERADMIN") {
			return NextResponse.json(
				{ error: "Acesso negado. Apenas SUPERADMIN pode acessar métricas de performance." },
				{ status: 403 },
			);
		}

		const { searchParams } = new URL(request.url);
		const days = parseInt(searchParams.get("days") || "7");
		const flagId = searchParams.get("flagId");

		const prisma = getPrismaInstance();

		// Calculate date range
		const endDate = new Date();
		const startDate = new Date();
		startDate.setDate(startDate.getDate() - days);

		// Build where clause
		const whereClause: any = {
			date: {
				gte: startDate,
				lte: endDate,
			},
		};

		if (flagId) {
			whereClause.flagId = flagId;
		}

		// Get performance metrics
		const metrics = await prisma.featureFlagMetrics.findMany({
			where: whereClause,
			include: {
				flag: {
					select: {
						id: true,
						name: true,
						category: true,
					},
				},
			},
			orderBy: [{ date: "desc" }, { averageLatencyMs: "desc" }],
		});

		// Calculate performance statistics
		const performanceStats = {
			totalEvaluations: 0,
			totalLatency: 0,
			minLatency: Number.MAX_VALUE,
			maxLatency: 0,
			flagCount: new Set<string>(),
			dailyStats: new Map<
				string,
				{
					date: string;
					evaluations: number;
					averageLatency: number;
					flagsEvaluated: number;
				}
			>(),
		};

		// Process metrics
		metrics.forEach((metric) => {
			performanceStats.totalEvaluations += metric.evaluations;
			performanceStats.totalLatency += metric.averageLatencyMs * metric.evaluations;
			performanceStats.minLatency = Math.min(performanceStats.minLatency, metric.averageLatencyMs);
			performanceStats.maxLatency = Math.max(performanceStats.maxLatency, metric.averageLatencyMs);
			performanceStats.flagCount.add(metric.flagId);

			// Daily aggregation
			const dateKey = metric.date.toISOString().split("T")[0];
			const existing = performanceStats.dailyStats.get(dateKey) || {
				date: dateKey,
				evaluations: 0,
				averageLatency: 0,
				flagsEvaluated: 0,
			};

			existing.evaluations += metric.evaluations;
			existing.averageLatency =
				(existing.averageLatency * existing.flagsEvaluated + metric.averageLatencyMs) / (existing.flagsEvaluated + 1);
			existing.flagsEvaluated += 1;

			performanceStats.dailyStats.set(dateKey, existing);
		});

		// Calculate overall average latency
		const overallAverageLatency =
			performanceStats.totalEvaluations > 0 ? performanceStats.totalLatency / performanceStats.totalEvaluations : 0;

		// Get Redis performance metrics
		let redisMetrics = null;
		try {
			const redis = getRedisInstance();
			const info = await redis.info("stats");
			const lines = info.split("\r\n");

			redisMetrics = {
				totalCommandsProcessed: parseInt(
					lines.find((l: string) => l.startsWith("total_commands_processed:"))?.split(":")[1] || "0",
				),
				instantaneousOpsPerSec: parseInt(
					lines.find((l: string) => l.startsWith("instantaneous_ops_per_sec:"))?.split(":")[1] || "0",
				),
				keyspaceHits: parseInt(lines.find((l: string) => l.startsWith("keyspace_hits:"))?.split(":")[1] || "0"),
				keyspaceMisses: parseInt(lines.find((l: string) => l.startsWith("keyspace_misses:"))?.split(":")[1] || "0"),
				usedMemory: parseInt(lines.find((l: string) => l.startsWith("used_memory:"))?.split(":")[1] || "0"),
				cacheHitRate: 0,
			};

			// Calculate cache hit rate
			const totalRequests = redisMetrics.keyspaceHits + redisMetrics.keyspaceMisses;
			redisMetrics.cacheHitRate = totalRequests > 0 ? (redisMetrics.keyspaceHits / totalRequests) * 100 : 0;
		} catch (redisError) {
			logger.warn("Failed to get Redis metrics", {
				error: redisError instanceof Error ? redisError.message : "Unknown error",
			});
		}

		// Get slowest flags
		const slowestFlags = metrics
			.sort((a, b) => b.averageLatencyMs - a.averageLatencyMs)
			.slice(0, 10)
			.map((metric) => ({
				flagId: metric.flagId,
				flagName: metric.flag.name,
				category: metric.flag.category,
				averageLatencyMs: metric.averageLatencyMs,
				evaluations: metric.evaluations,
				date: metric.date.toISOString().split("T")[0],
			}));

		// Performance thresholds and alerts
		const performanceAlerts = [];
		const HIGH_LATENCY_THRESHOLD = 100; // ms
		const LOW_CACHE_HIT_THRESHOLD = 80; // %

		if (overallAverageLatency > HIGH_LATENCY_THRESHOLD) {
			performanceAlerts.push({
				type: "HIGH_LATENCY",
				severity: "warning",
				message: `Latência média de avaliação de flags está alta: ${overallAverageLatency.toFixed(2)}ms`,
				threshold: HIGH_LATENCY_THRESHOLD,
				currentValue: overallAverageLatency,
			});
		}

		if (redisMetrics && redisMetrics.cacheHitRate < LOW_CACHE_HIT_THRESHOLD) {
			performanceAlerts.push({
				type: "LOW_CACHE_HIT_RATE",
				severity: "warning",
				message: `Taxa de acerto do cache está baixa: ${redisMetrics.cacheHitRate.toFixed(2)}%`,
				threshold: LOW_CACHE_HIT_THRESHOLD,
				currentValue: redisMetrics.cacheHitRate,
			});
		}

		const response = {
			period: {
				days,
				startDate: startDate.toISOString().split("T")[0],
				endDate: endDate.toISOString().split("T")[0],
			},
			performance: {
				totalEvaluations: performanceStats.totalEvaluations,
				averageLatencyMs: overallAverageLatency,
				minLatencyMs: performanceStats.minLatency === Number.MAX_VALUE ? 0 : performanceStats.minLatency,
				maxLatencyMs: performanceStats.maxLatency,
				uniqueFlags: performanceStats.flagCount.size,
			},
			dailyStats: Array.from(performanceStats.dailyStats.values()).sort((a, b) => a.date.localeCompare(b.date)),
			slowestFlags,
			redisMetrics,
			alerts: performanceAlerts,
			recommendations: [] as string[],
		};

		// Add performance recommendations
		if (overallAverageLatency > 50) {
			response.recommendations.push("Considere otimizar a avaliação de feature flags ou implementar cache adicional");
		}

		if (redisMetrics && redisMetrics.cacheHitRate < 90) {
			response.recommendations.push("Considere ajustar a estratégia de cache ou aumentar o TTL dos flags");
		}

		if (performanceStats.flagCount.size > 100) {
			response.recommendations.push("Considere arquivar ou remover feature flags não utilizadas");
		}

		logger.info("Performance metrics retrieved successfully", {
			userId: session.user.id,
			period: days,
			totalEvaluations: performanceStats.totalEvaluations,
			averageLatency: overallAverageLatency,
		});

		return NextResponse.json(response);
	} catch (error) {
		logger.error("Error retrieving performance metrics", {
			error: error instanceof Error ? error.message : "Unknown error",
		});

		return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
	}
}
