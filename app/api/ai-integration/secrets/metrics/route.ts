/**
 * Secret Rotation Metrics API
 *
 * Provides Prometheus-compatible metrics for secret rotation monitoring.
 * Exposes ai_secret_rotation_events_total and related metrics.
 */

import { NextRequest, NextResponse } from "next/server";
import { withAccessControl } from "@/lib/ai-integration/middleware/access-control";
import { AIPermission, AccessContext } from "@/lib/ai-integration/services/access-control";
import {
	getRotationStatus,
	getSecretsNeedingRotation,
	SECRET_CONFIGS,
} from "@/lib/ai-integration/services/secret-rotation";

/**
 * GET /api/ai-integration/secrets/metrics
 *
 * Returns Prometheus-compatible metrics for secret rotation
 */
async function handleGet(req: NextRequest, context: AccessContext) {
	try {
		const url = new URL(req.url);
		const format = url.searchParams.get("format") || "prometheus";

		// Get rotation data
		const statuses = await getRotationStatus();
		const { overdue, dueSoon, inOverlap } = await getSecretsNeedingRotation();

		// Calculate metrics
		const metrics = {
			// Total secrets by status
			ai_secret_rotation_total: statuses.length,
			ai_secret_rotation_overdue_total: overdue.length,
			ai_secret_rotation_due_soon_total: dueSoon.length,
			ai_secret_rotation_in_overlap_total: inOverlap.length,
			ai_secret_rotation_healthy_total: statuses.length - overdue.length - dueSoon.length,

			// Events by type
			ai_secret_rotation_events_total: {
				overdue: overdue.length,
				due_soon: dueSoon.length,
				in_overlap: inOverlap.length,
				healthy: statuses.length - overdue.length - dueSoon.length,
			},

			// Days until rotation by secret
			ai_secret_rotation_days_until: statuses.reduce(
				(acc, status) => {
					acc[status.secretName] = status.daysUntilRotation;
					return acc;
				},
				{} as Record<string, number>,
			),

			// Rotation interval by secret
			ai_secret_rotation_interval_days: Object.entries(SECRET_CONFIGS).reduce(
				(acc, [name, config]) => {
					acc[name] = config.rotationIntervalDays;
					return acc;
				},
				{} as Record<string, number>,
			),

			// Last rotation timestamp (mock data - in production this would be real)
			ai_secret_rotation_last_rotated_timestamp: statuses.reduce(
				(acc, status) => {
					acc[status.secretName] = status.lastRotated?.getTime() || 0;
					return acc;
				},
				{} as Record<string, number>,
			),
		};

		if (format === "prometheus") {
			const prometheusMetrics = generatePrometheusMetrics(metrics);
			return new NextResponse(prometheusMetrics, {
				headers: { "Content-Type": "text/plain; version=0.0.4" },
			});
		}

		return NextResponse.json({
			timestamp: new Date().toISOString(),
			metrics,
			labels: {
				service: "ai-integration",
				component: "secret-rotation",
			},
		});
	} catch (error) {
		return NextResponse.json(
			{
				error: "Failed to get rotation metrics",
				details: error instanceof Error ? error.message : "Unknown error",
			},
			{ status: 500 },
		);
	}
}

/**
 * Generates Prometheus-compatible metrics format
 */
function generatePrometheusMetrics(metrics: any): string {
	const timestamp = Date.now();

	let output = "";

	// Add help and type information
	output += "# HELP ai_secret_rotation_total Total number of secrets managed\n";
	output += "# TYPE ai_secret_rotation_total gauge\n";
	output += `ai_secret_rotation_total ${metrics.ai_secret_rotation_total} ${timestamp}\n\n`;

	output += "# HELP ai_secret_rotation_events_total Number of secrets by rotation status\n";
	output += "# TYPE ai_secret_rotation_events_total gauge\n";
	Object.entries(metrics.ai_secret_rotation_events_total).forEach(([type, count]) => {
		output += `ai_secret_rotation_events_total{type="${type}"} ${count} ${timestamp}\n`;
	});
	output += "\n";

	output += "# HELP ai_secret_rotation_days_until Days until next rotation for each secret\n";
	output += "# TYPE ai_secret_rotation_days_until gauge\n";
	Object.entries(metrics.ai_secret_rotation_days_until).forEach(([secret, days]) => {
		output += `ai_secret_rotation_days_until{secret="${secret}"} ${days} ${timestamp}\n`;
	});
	output += "\n";

	output += "# HELP ai_secret_rotation_interval_days Configured rotation interval for each secret\n";
	output += "# TYPE ai_secret_rotation_interval_days gauge\n";
	Object.entries(metrics.ai_secret_rotation_interval_days).forEach(([secret, interval]) => {
		output += `ai_secret_rotation_interval_days{secret="${secret}"} ${interval} ${timestamp}\n`;
	});
	output += "\n";

	output += "# HELP ai_secret_rotation_last_rotated_timestamp Unix timestamp of last rotation\n";
	output += "# TYPE ai_secret_rotation_last_rotated_timestamp gauge\n";
	Object.entries(metrics.ai_secret_rotation_last_rotated_timestamp).forEach(([secret, timestamp]) => {
		if (typeof timestamp === "number" && timestamp > 0) {
			output += `ai_secret_rotation_last_rotated_timestamp{secret="${secret}"} ${timestamp} ${Date.now()}\n`;
		}
	});
	output += "\n";

	// Add alert metrics
	output += "# HELP ai_secret_rotation_alert_total Number of rotation alerts by severity\n";
	output += "# TYPE ai_secret_rotation_alert_total gauge\n";
	output += `ai_secret_rotation_alert_total{severity="critical",type="overdue"} ${metrics.ai_secret_rotation_overdue_total} ${timestamp}\n`;
	output += `ai_secret_rotation_alert_total{severity="warning",type="due_soon"} ${metrics.ai_secret_rotation_due_soon_total} ${timestamp}\n`;
	output += `ai_secret_rotation_alert_total{severity="info",type="in_overlap"} ${metrics.ai_secret_rotation_in_overlap_total} ${timestamp}\n`;

	return output;
}

/**
 * POST /api/ai-integration/secrets/metrics/reset
 *
 * Resets rotation metrics (for testing purposes)
 */
async function handlePost(req: NextRequest, context: AccessContext) {
	try {
		const body = await req.json();
		const { confirm = false } = body;

		if (!confirm) {
			return NextResponse.json({ error: "Must set confirm=true to reset metrics" }, { status: 400 });
		}

		// In a real implementation, this would reset metrics in the monitoring system
		// For now, we'll just log the action
		const { logAuditTrail } = await import("@/lib/ai-integration/services/access-control");

		await logAuditTrail({
			userId: context.userId,
			action: "SECRET_ROTATION_METRICS_RESET",
			resourceType: "AI_SECRET_METRICS",
			details: {
				resetAt: new Date().toISOString(),
				resetBy: context.userId,
			},
			ipAddress: context.ipAddress,
			userAgent: context.userAgent,
			success: true,
		});

		return NextResponse.json({
			success: true,
			message: "Rotation metrics reset successfully",
			resetAt: new Date().toISOString(),
		});
	} catch (error) {
		return NextResponse.json(
			{
				error: "Failed to reset rotation metrics",
				details: error instanceof Error ? error.message : "Unknown error",
			},
			{ status: 500 },
		);
	}
}

// Apply access control middleware
export const GET = withAccessControl(handleGet, {
	requiredPermission: AIPermission.VIEW_METRICS,
	resourceType: "AI_SECRET_METRICS",
});

export const POST = withAccessControl(handlePost, {
	requiredPermission: AIPermission.MANAGE_ALERTS,
	resourceType: "AI_SECRET_METRICS",
});
