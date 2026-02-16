import { NextRequest, NextResponse } from "next/server";
import { databaseMonitor } from "../../../../../lib/monitoring/database-monitor";

export async function GET(request: NextRequest) {
	try {
		const { searchParams } = new URL(request.url);
		const timeWindow = parseInt(searchParams.get("timeWindow") || "60"); // minutes
		const action = searchParams.get("action");

		switch (action) {
			case "performance":
				const performanceStats = databaseMonitor.getQueryPerformanceStats(timeWindow);
				return NextResponse.json({
					performance: performanceStats,
					timeWindow: `${timeWindow} minutes`,
					timestamp: new Date().toISOString(),
				});

			case "slowQueries":
				const slowQueries = databaseMonitor.getSlowQueryAlerts();
				return NextResponse.json({
					slowQueries: slowQueries.map((query) => ({
						...query,
						lastOccurrence: query.lastOccurrence.toISOString(),
					})),
					timestamp: new Date().toISOString(),
				});

			case "failedQueries":
				const failedQueries = databaseMonitor.getFailedQueries(50);
				return NextResponse.json({
					failedQueries: failedQueries.map((query) => ({
						...query,
						timestamp: query.timestamp.toISOString(),
					})),
					timestamp: new Date().toISOString(),
				});

			case "recentQueries":
				const recentQueries = databaseMonitor.getRecentQueryMetrics(100);
				return NextResponse.json({
					recentQueries: recentQueries.map((query) => ({
						...query,
						timestamp: query.timestamp.toISOString(),
					})),
					timestamp: new Date().toISOString(),
				});

			case "connections":
				const connectionMetrics = databaseMonitor.getConnectionMetrics();
				return NextResponse.json({
					connectionMetrics: connectionMetrics.map((metrics) => ({
						...metrics,
						timestamp: metrics.timestamp.toISOString(),
					})),
					timestamp: new Date().toISOString(),
				});

			default:
				// Get comprehensive database dashboard
				const dashboard = databaseMonitor.getDatabaseDashboard();
				return NextResponse.json({
					dashboard: {
						...dashboard,
						slowQueries: dashboard.slowQueries.map((query) => ({
							...query,
							lastOccurrence: query.lastOccurrence.toISOString(),
						})),
						recentFailures: dashboard.recentFailures.map((query) => ({
							...query,
							timestamp: query.timestamp.toISOString(),
						})),
						connectionStatus: dashboard.connectionStatus
							? {
									...dashboard.connectionStatus,
									timestamp: dashboard.connectionStatus.timestamp.toISOString(),
								}
							: null,
					},
					timeWindow: `${timeWindow} minutes`,
					timestamp: new Date().toISOString(),
				});
		}
	} catch (error) {
		console.error("[Monitoring Database] Error fetching database data:", error);

		return NextResponse.json(
			{
				error: "Failed to fetch database data",
				message: error instanceof Error ? error.message : "Unknown error",
				timestamp: new Date().toISOString(),
			},
			{ status: 500 },
		);
	}
}

export async function POST(request: NextRequest) {
	try {
		const body = await request.json();
		const { action, queryHash } = body;

		if (!action) {
			return NextResponse.json({ error: "Missing required field: action" }, { status: 400 });
		}

		let result = false;
		let message = "";

		switch (action) {
			case "clearSlowQueryAlert":
				if (!queryHash) {
					return NextResponse.json({ error: "Missing required field: queryHash" }, { status: 400 });
				}
				result = databaseMonitor.clearSlowQueryAlert(queryHash);
				message = result ? "Slow query alert cleared successfully" : "Slow query alert not found";
				break;

			default:
				return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
		}

		return NextResponse.json({
			success: result,
			message,
			action,
			queryHash,
			timestamp: new Date().toISOString(),
		});
	} catch (error) {
		console.error("[Monitoring Database] Error processing database action:", error);

		return NextResponse.json(
			{
				error: "Failed to process database action",
				message: error instanceof Error ? error.message : "Unknown error",
				timestamp: new Date().toISOString(),
			},
			{ status: 500 },
		);
	}
}
