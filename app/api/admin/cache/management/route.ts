import { NextRequest, NextResponse } from "next/server";
import {
	credentialsCache,
	cacheHealthMonitor,
	cacheWarmingManager,
	cacheInvalidationManager,
} from "../../../../../lib/cache/credentials-cache";

// GET - Get cache statistics and health
export async function GET(request: NextRequest) {
	try {
		const { searchParams } = new URL(request.url);
		const action = searchParams.get("action");

		switch (action) {
			case "stats":
				const stats = credentialsCache.getStats();
				const performanceStats = cacheHealthMonitor.getPerformanceStats();
				const health = await credentialsCache.checkHealth();

				return NextResponse.json({
					success: true,
					data: {
						basicStats: stats,
						performanceStats,
						health,
					},
				});

			case "health":
				const healthStatus = await credentialsCache.checkHealth();
				return NextResponse.json({
					success: true,
					data: healthStatus,
				});

			default:
				return NextResponse.json(
					{
						success: false,
						error: "Invalid action. Use: stats, health",
					},
					{ status: 400 },
				);
		}
	} catch (error) {
		console.error("[Cache Management API] Error in GET:", error);
		return NextResponse.json(
			{
				success: false,
				error: error instanceof Error ? error.message : "Unknown error",
			},
			{ status: 500 },
		);
	}
}

// POST - Perform cache operations
export async function POST(request: NextRequest) {
	try {
		const body = await request.json();
		const { action, data } = body;

		switch (action) {
			case "warm":
				if (data?.inboxIds && Array.isArray(data.inboxIds)) {
					// Warm specific inboxes
					await cacheWarmingManager.warmSpecificInboxes(data.inboxIds);
					return NextResponse.json({
						success: true,
						message: `Cache warmed for ${data.inboxIds.length} inboxes`,
					});
				} else {
					// Warm frequently accessed credentials
					await cacheWarmingManager.warmFrequentlyAccessedCredentials();
					return NextResponse.json({
						success: true,
						message: "Cache warmed for frequently accessed credentials",
					});
				}

			case "invalidate":
				if (data?.inboxId) {
					// Invalidate specific inbox
					await cacheInvalidationManager.invalidateRelatedCaches(data.inboxId);
					return NextResponse.json({
						success: true,
						message: `Cache invalidated for inbox: ${data.inboxId}`,
					});
				} else if (data?.inboxIds && Array.isArray(data.inboxIds)) {
					// Invalidate multiple inboxes
					for (const inboxId of data.inboxIds) {
						cacheInvalidationManager.queueInvalidation(inboxId);
					}
					return NextResponse.json({
						success: true,
						message: `Cache invalidation queued for ${data.inboxIds.length} inboxes`,
					});
				} else {
					return NextResponse.json(
						{
							success: false,
							error: "inboxId or inboxIds required for invalidation",
						},
						{ status: 400 },
					);
				}

			case "clear":
				// Clear all cache (use with caution)
				await credentialsCache.clearAll();
				return NextResponse.json({
					success: true,
					message: "All cache cleared",
				});

			case "reset-stats":
				// Reset cache statistics
				credentialsCache.resetStats();
				return NextResponse.json({
					success: true,
					message: "Cache statistics reset",
				});

			case "health-check":
				// Force health check and recovery
				await cacheHealthMonitor.checkHealthAndRecover();
				const healthAfterCheck = await credentialsCache.checkHealth();
				return NextResponse.json({
					success: true,
					data: healthAfterCheck,
					message: "Health check completed",
				});

			default:
				return NextResponse.json(
					{
						success: false,
						error: "Invalid action. Use: warm, invalidate, clear, reset-stats, health-check",
					},
					{ status: 400 },
				);
		}
	} catch (error) {
		console.error("[Cache Management API] Error in POST:", error);
		return NextResponse.json(
			{
				success: false,
				error: error instanceof Error ? error.message : "Unknown error",
			},
			{ status: 500 },
		);
	}
}

// PUT - Update cache configuration
export async function PUT(request: NextRequest) {
	try {
		const body = await request.json();
		const { action, data } = body;

		switch (action) {
			case "set-credentials":
				if (!data?.inboxId || !data?.credentials) {
					return NextResponse.json(
						{
							success: false,
							error: "inboxId and credentials required",
						},
						{ status: 400 },
					);
				}

				await credentialsCache.setCredentials(data.inboxId, data.credentials, data.ttl);

				return NextResponse.json({
					success: true,
					message: `Credentials cached for inbox: ${data.inboxId}`,
				});

			case "mark-updated":
				if (!data?.inboxId) {
					return NextResponse.json(
						{
							success: false,
							error: "inboxId required",
						},
						{ status: 400 },
					);
				}

				await credentialsCache.markCredentialsUpdated(data.inboxId, data.ttl);

				return NextResponse.json({
					success: true,
					message: `Credentials marked as updated for inbox: ${data.inboxId}`,
				});

			default:
				return NextResponse.json(
					{
						success: false,
						error: "Invalid action. Use: set-credentials, mark-updated",
					},
					{ status: 400 },
				);
		}
	} catch (error) {
		console.error("[Cache Management API] Error in PUT:", error);
		return NextResponse.json(
			{
				success: false,
				error: error instanceof Error ? error.message : "Unknown error",
			},
			{ status: 500 },
		);
	}
}

// DELETE - Remove cache entries
export async function DELETE(request: NextRequest) {
	try {
		const { searchParams } = new URL(request.url);
		const inboxId = searchParams.get("inboxId");

		if (!inboxId) {
			return NextResponse.json(
				{
					success: false,
					error: "inboxId parameter required",
				},
				{ status: 400 },
			);
		}

		await credentialsCache.invalidateCredentials(inboxId);
		await credentialsCache.invalidateFallbackChain(inboxId);

		return NextResponse.json({
			success: true,
			message: `Cache entries deleted for inbox: ${inboxId}`,
		});
	} catch (error) {
		console.error("[Cache Management API] Error in DELETE:", error);
		return NextResponse.json(
			{
				success: false,
				error: error instanceof Error ? error.message : "Unknown error",
			},
			{ status: 500 },
		);
	}
}
