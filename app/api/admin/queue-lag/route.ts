/**
 * Queue Lag Monitoring API
 * Based on requirements 10.4, 11.2
 */

import { NextRequest, NextResponse } from "next/server";
import { queueLagMonitor } from "../../../../lib/ai-integration/utils/queue-lag-monitor";
import { aiLogger } from "../../../../lib/ai-integration/utils/logger";

// GET /api/admin/queue-lag - Get queue lag data
export async function GET(request: NextRequest) {
	const startTime = Date.now();

	try {
		// Basic auth check
		const authHeader = request.headers.get("authorization");
		const expectedAuth = process.env.ADMIN_AUTH_TOKEN;

		if (expectedAuth && authHeader !== `Bearer ${expectedAuth}`) {
			return new NextResponse("Unauthorized", { status: 401 });
		}

		const url = new URL(request.url);
		const action = url.searchParams.get("action") || "current";
		const queueName = url.searchParams.get("queue_name");
		const windowMinutes = parseInt(url.searchParams.get("window") || "60");
		const limit = parseInt(url.searchParams.get("limit") || "50");

		let responseData: any;

		switch (action) {
			case "current":
				responseData = {
					measurements: queueLagMonitor.getLatestMeasurements(),
					timestamp: Date.now(),
				};
				break;

			case "history":
				if (!queueName) {
					return new NextResponse("Queue name is required for history action", { status: 400 });
				}

				responseData = {
					queueName,
					history: queueLagMonitor.getQueueHistory(queueName, limit),
					limit,
					timestamp: Date.now(),
				};
				break;

			case "stats":
				if (!queueName) {
					return new NextResponse("Queue name is required for stats action", { status: 400 });
				}

				responseData = {
					queueName,
					stats: queueLagMonitor.getQueueStats(queueName, windowMinutes),
					windowMinutes,
					timestamp: Date.now(),
				};
				break;

			case "all_stats":
				const allStats: Record<string, any> = {};
				const status = queueLagMonitor.getStatus();

				for (const queue of status.config.queues) {
					allStats[queue] = queueLagMonitor.getQueueStats(queue, windowMinutes);
				}

				responseData = {
					stats: allStats,
					windowMinutes,
					timestamp: Date.now(),
				};
				break;

			case "status":
				responseData = {
					status: queueLagMonitor.getStatus(),
					timestamp: Date.now(),
				};
				break;

			case "report":
				try {
					const report = await queueLagMonitor.forceMeasurement();
					responseData = report;
				} catch (error) {
					return new NextResponse("Failed to generate lag report", { status: 500 });
				}
				break;

			default:
				return new NextResponse(`Invalid action: ${action}`, { status: 400 });
		}

		const duration = Date.now() - startTime;

		aiLogger.info("Queue lag API request completed", {
			stage: "admin",
			duration,
			metadata: {
				action,
				queueName,
				windowMinutes,
				limit,
			},
		});

		return NextResponse.json(responseData);
	} catch (error) {
		const duration = Date.now() - startTime;

		aiLogger.errorWithStack("Queue lag API request failed", error as Error, {
			stage: "admin",
			duration,
		});

		return new NextResponse("Internal Server Error", { status: 500 });
	}
}

// POST /api/admin/queue-lag - Control queue lag monitoring
export async function POST(request: NextRequest) {
	const startTime = Date.now();

	try {
		// Basic auth check
		const authHeader = request.headers.get("authorization");
		const expectedAuth = process.env.ADMIN_AUTH_TOKEN;

		if (expectedAuth && authHeader !== `Bearer ${expectedAuth}`) {
			return new NextResponse("Unauthorized", { status: 401 });
		}

		const body = await request.json();
		const { action, config } = body;

		let responseData: any;

		switch (action) {
			case "start":
				queueLagMonitor.start();
				responseData = {
					message: "Queue lag monitoring started",
					status: queueLagMonitor.getStatus(),
				};
				break;

			case "stop":
				queueLagMonitor.stop();
				responseData = {
					message: "Queue lag monitoring stopped",
					status: queueLagMonitor.getStatus(),
				};
				break;

			case "force_measurement":
				try {
					const report = await queueLagMonitor.forceMeasurement();
					responseData = {
						message: "Queue lag measurement forced",
						report,
					};
				} catch (error) {
					return new NextResponse("Failed to force measurement", { status: 500 });
				}
				break;

			case "update_config":
				if (!config) {
					return new NextResponse("Config is required for update_config action", { status: 400 });
				}

				queueLagMonitor.updateConfig(config);
				responseData = {
					message: "Queue lag monitoring configuration updated",
					status: queueLagMonitor.getStatus(),
				};
				break;

			case "clear_history":
				queueLagMonitor.clearHistory();
				responseData = {
					message: "Queue lag history cleared",
					timestamp: Date.now(),
				};
				break;

			default:
				return new NextResponse(`Invalid action: ${action}`, { status: 400 });
		}

		const duration = Date.now() - startTime;

		aiLogger.info("Queue lag monitoring control completed", {
			stage: "admin",
			duration,
			metadata: {
				action,
				config: config ? Object.keys(config) : undefined,
			},
		});

		return NextResponse.json(responseData);
	} catch (error) {
		const duration = Date.now() - startTime;

		aiLogger.errorWithStack("Queue lag monitoring control failed", error as Error, {
			stage: "admin",
			duration,
		});

		return new NextResponse("Internal Server Error", { status: 500 });
	}
}
