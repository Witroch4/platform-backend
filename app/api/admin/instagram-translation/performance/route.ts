import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import {
	getQueryPerformanceStats,
	warmInstagramTemplateCache,
	checkDatabaseConnectionHealth,
} from "@/lib/instagram/optimized-database-queries";
import { getConnectionPoolHealth, getConnectionPoolStats } from "@/lib/instagram/connection-pool-monitor";
import { instagramTemplateCache } from "@/lib/cache/instagram-template-cache";

/**
 * GET /api/admin/instagram-translation/performance
 * Get comprehensive performance statistics for Instagram translation system
 */
export async function GET(request: NextRequest) {
	try {
		const session = await auth();

		if (!session?.user) {
			return NextResponse.json({ error: "Authentication required" }, { status: 401 });
		}

		// Check if user has admin privileges (you may want to add role checking)
		// For now, we'll allow any authenticated user to view performance stats

		const searchParams = request.nextUrl.searchParams;
		const includeDetails = searchParams.get("details") === "true";
		const includeRecommendations = searchParams.get("recommendations") === "true";

		// Gather performance statistics
		const [queryStats, connectionPoolHealth, connectionPoolStats, databaseHealth, cacheStats] =
			await Promise.allSettled([
				getQueryPerformanceStats(),
				getConnectionPoolHealth(),
				getConnectionPoolStats(),
				checkDatabaseConnectionHealth(),
				Promise.resolve(instagramTemplateCache.getStats()),
			]);

		// Build response object
		const response: any = {
			timestamp: new Date().toISOString(),
			status: "healthy",
			summary: {
				totalQueries: 0,
				cacheHitRate: 0,
				averageResponseTime: 0,
				errorRate: 0,
				systemHealth: "unknown",
			},
		};

		// Process query statistics
		if (queryStats.status === "fulfilled") {
			const stats = queryStats.value;
			response.queryPerformance = {
				database: stats.monitor,
				cache: stats.cache,
			};

			if (includeRecommendations) {
				response.recommendations = stats.recommendations;
			}

			// Update summary
			response.summary.totalQueries = stats.monitor.totalQueries;
			response.summary.cacheHitRate = stats.cache.hitRate;
			response.summary.averageResponseTime = stats.cache.averageResponseTime;
			response.summary.errorRate =
				stats.monitor.totalQueries > 0
					? ((stats.monitor.totalQueries -
							stats.monitor.queryBreakdown.reduce((sum: number, q: { count: number }) => sum + q.count, 0)) /
							stats.monitor.totalQueries) *
						100
					: 0;
		} else {
			response.queryPerformance = { error: "Failed to retrieve query performance stats" };
		}

		// Process connection pool health
		if (connectionPoolHealth.status === "fulfilled") {
			response.connectionPool = {
				health: connectionPoolHealth.value,
			};

			// Update system health based on connection pool
			if (connectionPoolHealth.value.status === "critical") {
				response.status = "critical";
				response.summary.systemHealth = "critical";
			} else if (connectionPoolHealth.value.status === "degraded" && response.status === "healthy") {
				response.status = "degraded";
				response.summary.systemHealth = "degraded";
			} else if (response.summary.systemHealth === "unknown") {
				response.summary.systemHealth = connectionPoolHealth.value.status;
			}
		} else {
			response.connectionPool = { error: "Failed to retrieve connection pool health" };
			response.status = "degraded";
		}

		// Process connection pool statistics
		if (connectionPoolStats.status === "fulfilled") {
			response.connectionPool = {
				...response.connectionPool,
				stats: connectionPoolStats.value,
			};
		}

		// Process database health
		if (databaseHealth.status === "fulfilled") {
			response.database = {
				health: databaseHealth.value,
			};

			if (!databaseHealth.value.isHealthy && response.status !== "critical") {
				response.status = "critical";
				response.summary.systemHealth = "critical";
			}
		} else {
			response.database = { error: "Failed to retrieve database health" };
			response.status = "critical";
		}

		// Process cache statistics
		if (cacheStats.status === "fulfilled") {
			response.cache = {
				stats: cacheStats.value,
				health: await instagramTemplateCache.checkHealth(),
			};
		} else {
			response.cache = { error: "Failed to retrieve cache stats" };
		}

		// Include detailed metrics if requested
		if (includeDetails) {
			response.details = {
				queryBreakdown: queryStats.status === "fulfilled" ? queryStats.value.monitor.queryBreakdown : [],
				cacheMetrics:
					cacheStats.status === "fulfilled" ? (await instagramTemplateCache.getQueryPerformanceMetrics?.()) || [] : [],
				connectionPoolMetrics: connectionPoolHealth.status === "fulfilled" ? connectionPoolHealth.value.metrics : {},
			};
		}

		// Set appropriate HTTP status based on system health
		let httpStatus = 200;
		if (response.status === "critical") {
			httpStatus = 503; // Service Unavailable
		} else if (response.status === "degraded") {
			httpStatus = 206; // Partial Content
		}

		return NextResponse.json(response, { status: httpStatus });
	} catch (error) {
		console.error("[Instagram Performance API] Error retrieving performance stats:", error);

		return NextResponse.json(
			{
				error: "Failed to retrieve performance statistics",
				details: error instanceof Error ? error.message : "Unknown error",
				timestamp: new Date().toISOString(),
				status: "error",
			},
			{ status: 500 },
		);
	}
}

/**
 * POST /api/admin/instagram-translation/performance
 * Perform performance optimization actions
 */
export async function POST(request: NextRequest) {
	try {
		const session = await auth();

		if (!session?.user) {
			return NextResponse.json({ error: "Authentication required" }, { status: 401 });
		}

		const body = await request.json();
		const { action, parameters = {} } = body;

		let result: any = { success: false };

		switch (action) {
			case "warm_cache":
				const limit = parameters.limit || 100;
				const warmResult = await warmInstagramTemplateCache(limit);
				result = {
					success: true,
					action: "warm_cache",
					result: warmResult,
					message: `Cache warmed with ${warmResult.warmed} templates, ${warmResult.errors} errors`,
				};
				break;

			case "clear_cache":
				await instagramTemplateCache.clearAll();
				result = {
					success: true,
					action: "clear_cache",
					message: "All Instagram translation cache cleared",
				};
				break;

			case "reset_stats":
				instagramTemplateCache.resetStats();
				result = {
					success: true,
					action: "reset_stats",
					message: "Performance statistics reset",
				};
				break;

			case "health_check":
				const healthResults = await Promise.allSettled([
					getConnectionPoolHealth(),
					checkDatabaseConnectionHealth(),
					instagramTemplateCache.checkHealth(),
				]);

				result = {
					success: true,
					action: "health_check",
					result: {
						connectionPool: healthResults[0].status === "fulfilled" ? healthResults[0].value : { error: "Failed" },
						database: healthResults[1].status === "fulfilled" ? healthResults[1].value : { error: "Failed" },
						cache: healthResults[2].status === "fulfilled" ? healthResults[2].value : { error: "Failed" },
					},
					message: "Health check completed",
				};
				break;

			default:
				return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
		}

		return NextResponse.json(result);
	} catch (error) {
		console.error("[Instagram Performance API] Error performing action:", error);

		return NextResponse.json(
			{
				error: "Failed to perform action",
				details: error instanceof Error ? error.message : "Unknown error",
			},
			{ status: 500 },
		);
	}
}

/**
 * DELETE /api/admin/instagram-translation/performance
 * Clear performance data and reset monitoring
 */
export async function DELETE(request: NextRequest) {
	try {
		const session = await auth();

		if (!session?.user) {
			return NextResponse.json({ error: "Authentication required" }, { status: 401 });
		}

		// Clear all performance-related data
		await Promise.allSettled([instagramTemplateCache.clearAll(), instagramTemplateCache.resetStats()]);

		return NextResponse.json({
			success: true,
			message: "All Instagram translation performance data cleared",
			timestamp: new Date().toISOString(),
		});
	} catch (error) {
		console.error("[Instagram Performance API] Error clearing performance data:", error);

		return NextResponse.json(
			{
				error: "Failed to clear performance data",
				details: error instanceof Error ? error.message : "Unknown error",
			},
			{ status: 500 },
		);
	}
}
