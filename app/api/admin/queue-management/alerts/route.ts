import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

interface Alert {
	id: string;
	ruleId: string;
	queueName?: string;
	severity: "info" | "warning" | "error" | "critical";
	title: string;
	message: string;
	metrics?: Record<string, any>;
	status: "active" | "acknowledged" | "resolved";
	createdAt: Date;
	acknowledgedAt?: Date;
	acknowledgedBy?: string;
	resolvedAt?: Date;
	resolutionNote?: string;
}

// Mock data for demonstration - in production this would come from database
let mockAlerts: Alert[] = [
	{
		id: "alert-1",
		ruleId: "rule-1",
		queueName: "webhook-processing",
		severity: "warning" as const,
		title: "High Queue Backlog",
		message: "Queue has accumulated over 100 waiting jobs",
		metrics: {
			waitingJobs: 156,
			throughput: 45.2,
			avgProcessingTime: 1200,
		},
		status: "active" as const,
		createdAt: new Date(Date.now() - 1000 * 60 * 15), // 15 minutes ago
	},
	{
		id: "alert-2",
		ruleId: "rule-2",
		queueName: "image-processing",
		severity: "critical" as const,
		title: "High Error Rate",
		message: "Error rate has exceeded 10% in the last 10 minutes",
		metrics: {
			errorRate: 12.8,
			failedJobs: 67,
			successRate: 87.2,
		},
		status: "active" as const,
		createdAt: new Date(Date.now() - 1000 * 60 * 8), // 8 minutes ago
	},
	{
		id: "alert-3",
		ruleId: "rule-3",
		queueName: "email-notifications",
		severity: "error" as const,
		title: "Processing Time Exceeded",
		message: "Average processing time has exceeded 30 seconds",
		metrics: {
			avgProcessingTime: 35000,
			p95Latency: 45000,
			throughput: 12.5,
		},
		status: "acknowledged" as const,
		createdAt: new Date(Date.now() - 1000 * 60 * 25), // 25 minutes ago
		acknowledgedAt: new Date(Date.now() - 1000 * 60 * 10), // 10 minutes ago
		acknowledgedBy: "admin@example.com",
	},
	{
		id: "alert-4",
		ruleId: "rule-4",
		severity: "info" as const,
		title: "System Health Check",
		message: "All queues are operating within normal parameters",
		metrics: {
			totalQueues: 4,
			healthyQueues: 4,
			avgThroughput: 65.3,
		},
		status: "resolved" as const,
		createdAt: new Date(Date.now() - 1000 * 60 * 60), // 1 hour ago
		resolvedAt: new Date(Date.now() - 1000 * 60 * 45), // 45 minutes ago
	},
];

const AlertActionSchema = z.object({
	alertId: z.string(),
	action: z.enum(["acknowledge", "resolve", "dismiss"]),
	note: z.string().optional(),
});

export async function GET(request: NextRequest) {
	try {
		const { searchParams } = new URL(request.url);
		const queueName = searchParams.get("queueName");
		const severity = searchParams.get("severity");
		const status = searchParams.get("status");
		const limit = parseInt(searchParams.get("limit") || "50");

		let alerts = [...mockAlerts];

		// Filter by queue name if specified
		if (queueName) {
			alerts = alerts.filter((alert) => alert.queueName === queueName);
		}

		// Filter by severity if specified
		if (severity && severity !== "all") {
			alerts = alerts.filter((alert) => alert.severity === severity);
		}

		// Filter by status if specified
		if (status && status !== "all") {
			alerts = alerts.filter((alert) => alert.status === status);
		}

		// Sort by timestamp (newest first) and limit
		alerts = alerts.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, limit);

		// Calculate statistics
		const stats = {
			total: mockAlerts.length,
			active: mockAlerts.filter((a) => a.status === "active").length,
			acknowledged: mockAlerts.filter((a) => a.status === "acknowledged").length,
			resolved: mockAlerts.filter((a) => a.status === "resolved").length,
			critical: mockAlerts.filter((a) => a.severity === "critical" && a.status === "active").length,
			bySeverity: {
				critical: mockAlerts.filter((a) => a.severity === "critical").length,
				error: mockAlerts.filter((a) => a.severity === "error").length,
				warning: mockAlerts.filter((a) => a.severity === "warning").length,
				info: mockAlerts.filter((a) => a.severity === "info").length,
			},
			byQueue: mockAlerts.reduce(
				(acc, alert) => {
					if (alert.queueName) {
						acc[alert.queueName] = (acc[alert.queueName] || 0) + 1;
					}
					return acc;
				},
				{} as Record<string, number>,
			),
		};

		return NextResponse.json({
			success: true,
			alerts,
			stats,
			timestamp: new Date().toISOString(),
		});
	} catch (error) {
		console.error("[Queue Alerts] Error fetching alerts:", error);

		return NextResponse.json(
			{
				success: false,
				error: "Failed to fetch alerts",
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
		const { alertId, action, note }: z.infer<typeof AlertActionSchema> = AlertActionSchema.parse(body);

		const alertIndex = mockAlerts.findIndex((alert) => alert.id === alertId);

		if (alertIndex === -1) {
			return NextResponse.json(
				{
					success: false,
					error: "Alert not found",
				},
				{ status: 404 },
			);
		}

		const alert: Alert = mockAlerts[alertIndex];
		let message = "";

		switch (action) {
			case "acknowledge":
				if (alert.status === "active") {
					mockAlerts[alertIndex] = {
						...alert,
						status: "acknowledged",
						acknowledgedAt: new Date(),
						acknowledgedBy: "current-user@example.com", // In production, get from auth
						resolvedAt: undefined,
						resolutionNote: undefined,
					};
					message = "Alert acknowledged successfully";
				} else {
					return NextResponse.json(
						{
							success: false,
							error: "Alert is not in active state",
						},
						{ status: 400 },
					);
				}
				break;

			case "resolve":
				if (alert.status === "acknowledged" || alert.status === "active") {
					mockAlerts[alertIndex] = {
						...alert,
						status: "resolved",
						resolvedAt: new Date(),
						...(note && { resolutionNote: note }),
					};
					message = "Alert resolved successfully";
				} else {
					return NextResponse.json(
						{
							success: false,
							error: "Alert cannot be resolved from current state",
						},
						{ status: 400 },
					);
				}
				break;

			case "dismiss":
				// Remove alert from active list (soft delete)
				mockAlerts[alertIndex] = {
					...alert,
					status: "resolved",
					resolvedAt: new Date(),
					resolutionNote: note || "Dismissed by user",
					acknowledgedAt: alert.acknowledgedAt ?? new Date(),
					acknowledgedBy: alert.acknowledgedBy ?? "current-user@example.com",
				};
				message = "Alert dismissed successfully";
				break;

			default:
				return NextResponse.json(
					{
						success: false,
						error: `Unknown action: ${action}`,
					},
					{ status: 400 },
				);
		}

		return NextResponse.json({
			success: true,
			message,
			alert: mockAlerts[alertIndex],
			timestamp: new Date().toISOString(),
		});
	} catch (error) {
		if (error instanceof z.ZodError) {
			return NextResponse.json(
				{
					success: false,
					error: "Invalid request data",
					details: error.errors,
				},
				{ status: 400 },
			);
		}

		console.error("[Queue Alerts] Error processing alert action:", error);

		return NextResponse.json(
			{
				success: false,
				error: "Failed to process alert action",
				message: error instanceof Error ? error.message : "Unknown error",
				timestamp: new Date().toISOString(),
			},
			{ status: 500 },
		);
	}
}
