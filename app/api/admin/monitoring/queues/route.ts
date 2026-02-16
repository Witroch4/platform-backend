import { NextRequest, NextResponse } from "next/server";
import { queueMonitor } from "../../../../../lib/monitoring/queue-monitor";

export async function GET(request: NextRequest) {
	try {
		const { searchParams } = new URL(request.url);
		const queueName = searchParams.get("queue");
		const timeWindow = parseInt(searchParams.get("timeWindow") || "60"); // minutes

		if (queueName) {
			// Get specific queue details
			const health = queueMonitor.getQueueHealth(queueName);
			const performance = queueMonitor.getQueuePerformanceStats(queueName, timeWindow);
			const jobMetrics = queueMonitor.getJobMetrics(queueName, 100);
			const failedJobs = queueMonitor.getFailedJobs(queueName, 20);
			const slowJobs = queueMonitor.getSlowJobs(queueName, 10000, 20);

			if (!health) {
				return NextResponse.json({ error: `Queue not found: ${queueName}` }, { status: 404 });
			}

			return NextResponse.json({
				queueName,
				health,
				performance,
				jobMetrics: jobMetrics.map((job) => ({
					...job,
					createdAt: job.createdAt.toISOString(),
					processedAt: job.processedAt?.toISOString(),
					finishedAt: job.finishedAt?.toISOString(),
				})),
				failedJobs: failedJobs.map((job) => ({
					...job,
					createdAt: job.createdAt.toISOString(),
					processedAt: job.processedAt?.toISOString(),
					finishedAt: job.finishedAt?.toISOString(),
				})),
				slowJobs: slowJobs.map((job) => ({
					...job,
					createdAt: job.createdAt.toISOString(),
					processedAt: job.processedAt?.toISOString(),
					finishedAt: job.finishedAt?.toISOString(),
				})),
				timestamp: new Date().toISOString(),
			});
		} else {
			// Get all queues overview
			const dashboard = queueMonitor.getQueueDashboard();

			// Add performance stats for each queue
			const queuesWithPerformance = dashboard.queues.map((queue) => ({
				...queue,
				performance: queueMonitor.getQueuePerformanceStats(queue.name, timeWindow),
				health: {
					...queue.health,
					timestamp: queue.health.timestamp.toISOString(),
				},
			}));

			return NextResponse.json({
				overview: dashboard.overview,
				queues: queuesWithPerformance,
				timeWindow: `${timeWindow} minutes`,
				timestamp: new Date().toISOString(),
			});
		}
	} catch (error) {
		console.error("[Monitoring Queues] Error fetching queue data:", error);

		return NextResponse.json(
			{
				error: "Failed to fetch queue data",
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
		const { queueName, action } = body;

		if (!queueName || !action) {
			return NextResponse.json({ error: "Missing required fields: queueName and action" }, { status: 400 });
		}

		let result = false;
		let message = "";

		switch (action) {
			case "pause":
				result = await queueMonitor.pauseQueue(queueName);
				message = result ? "Queue paused successfully" : "Failed to pause queue";
				break;

			case "resume":
				result = await queueMonitor.resumeQueue(queueName);
				message = result ? "Queue resumed successfully" : "Failed to resume queue";
				break;

			case "cleanFailed":
				const cleanedCount = await queueMonitor.cleanFailedJobs(queueName);
				result = cleanedCount > 0;
				message = `Cleaned ${cleanedCount} failed jobs`;
				break;

			default:
				return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
		}

		return NextResponse.json({
			success: result,
			message,
			queueName,
			action,
			timestamp: new Date().toISOString(),
		});
	} catch (error) {
		console.error("[Monitoring Queues] Error processing queue action:", error);

		return NextResponse.json(
			{
				error: "Failed to process queue action",
				message: error instanceof Error ? error.message : "Unknown error",
				timestamp: new Date().toISOString(),
			},
			{ status: 500 },
		);
	}
}
