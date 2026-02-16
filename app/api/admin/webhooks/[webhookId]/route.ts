import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateInput, handleApiError, createSuccessResponse } from "../../../../../lib/utils/api-helpers";
import { webhookManager, type WebhookConfig } from "../../../../../lib/webhook/webhook-manager";

// Validation schemas
const WebhookUpdateSchema = z.object({
	name: z.string().min(1).max(255).optional(),
	url: z.string().url().max(1000).optional(),
	events: z
		.array(
			z.enum([
				"job.created",
				"job.active",
				"job.completed",
				"job.failed",
				"job.delayed",
				"job.retry",
				"job.removed",
				"queue.paused",
				"queue.resumed",
				"queue.cleaned",
				"queue.drained",
				"alert.created",
				"alert.resolved",
				"metrics.threshold_exceeded",
			]),
		)
		.min(1)
		.optional(),
	headers: z.record(z.string()).optional(),
	secret: z.string().min(8).max(255).optional(),
	enabled: z.boolean().optional(),
	retryPolicy: z
		.object({
			maxAttempts: z.number().int().min(1).max(10),
			backoffType: z.enum(["fixed", "exponential"]),
			initialDelay: z.number().int().min(100).max(60000),
			maxDelay: z.number().int().min(1000).max(300000),
		})
		.optional(),
	filters: z
		.object({
			queueNames: z.array(z.string()).optional(),
			jobTypes: z.array(z.string()).optional(),
			severityLevels: z.array(z.enum(["info", "warning", "error", "critical"])).optional(),
		})
		.optional(),
	timeout: z.number().int().min(1000).max(30000).optional(),
});

const WebhookActionSchema = z.object({
	action: z.enum(["enable", "disable", "test", "reset_failures"]),
	testPayload: z.record(z.any()).optional(),
});

/**
 * GET /api/admin/webhooks/[webhookId]
 * Get detailed information about a specific webhook
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ webhookId: string }> }) {
	const { webhookId } = await params;
	try {
		const { searchParams } = new URL(request.url);
		const includeDeliveries = searchParams.get("includeDeliveries") === "true";
		const deliveryLimit = parseInt(searchParams.get("deliveryLimit") || "50");

		const webhook = await webhookManager.getWebhookById(webhookId);
		if (!webhook) {
			return NextResponse.json(
				{
					success: false,
					error: {
						code: "WEBHOOK_NOT_FOUND",
						message: `Webhook not found: ${webhookId}`,
						timestamp: new Date().toISOString(),
					},
				},
				{ status: 404 },
			);
		}

		// Get webhook statistics
		const stats = await webhookManager.getWebhookStatsById(webhookId);

		const response: any = {
			webhook: {
				...webhook,
				secret: webhook.secret ? "[REDACTED]" : undefined, // Don't expose secret
			},
			stats,
			metadata: {
				includeDeliveries,
				deliveryLimit: includeDeliveries ? deliveryLimit : undefined,
			},
		};

		// Include recent deliveries if requested
		if (includeDeliveries) {
			const deliveries = await webhookManager.getWebhookDeliveries(webhookId, {
				limit: deliveryLimit,
				sortOrder: "desc",
			});
			response.recentDeliveries = deliveries;
		}

		return createSuccessResponse({
			...response,
			timestamp: new Date().toISOString(),
		});
	} catch (error) {
		return handleApiError(error, `Failed to fetch webhook details for ${webhookId}`);
	}
}

/**
 * PUT /api/admin/webhooks/[webhookId]
 * Update webhook configuration
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ webhookId: string }> }) {
	const { webhookId } = await params;
	try {
		const body = await request.json();
		const updates = WebhookUpdateSchema.parse(body);

		const webhook = await webhookManager.getWebhookById(webhookId);
		if (!webhook) {
			return NextResponse.json(
				{
					success: false,
					error: {
						code: "WEBHOOK_NOT_FOUND",
						message: `Webhook not found: ${webhookId}`,
						timestamp: new Date().toISOString(),
					},
				},
				{ status: 404 },
			);
		}

		// Check if name is being changed and if it conflicts
		if (updates.name && updates.name !== webhook.name) {
			const existingWebhook = await webhookManager.getWebhookByName(updates.name);
			if (existingWebhook && existingWebhook.id !== webhookId) {
				return NextResponse.json(
					{
						success: false,
						error: {
							code: "WEBHOOK_NAME_EXISTS",
							message: `Webhook with name '${updates.name}' already exists`,
							timestamp: new Date().toISOString(),
						},
					},
					{ status: 409 },
				);
			}
		}

		const updatedWebhook = await webhookManager.updateWebhook(webhookId, updates as Partial<WebhookConfig>);

		return createSuccessResponse({
			message: "Webhook updated successfully",
			webhook: {
				...updatedWebhook,
				secret: updatedWebhook.secret ? "[REDACTED]" : undefined,
			},
			changes: updates,
			timestamp: new Date().toISOString(),
		});
	} catch (error) {
		return handleApiError(error, `Failed to update webhook ${webhookId}`);
	}
}

/**
 * POST /api/admin/webhooks/[webhookId]/actions
 * Perform actions on a specific webhook
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ webhookId: string }> }) {
	const { webhookId } = await params;
	try {
		const body = await request.json();
		const { action, testPayload } = WebhookActionSchema.parse(body);

		const webhook = await webhookManager.getWebhookById(webhookId);
		if (!webhook) {
			return NextResponse.json(
				{
					success: false,
					error: {
						code: "WEBHOOK_NOT_FOUND",
						message: `Webhook not found: ${webhookId}`,
						timestamp: new Date().toISOString(),
					},
				},
				{ status: 404 },
			);
		}

		let result: any = {};
		let message = "";

		switch (action) {
			case "enable":
				await webhookManager.updateWebhook(webhookId, { enabled: true });
				message = "Webhook enabled successfully";
				result = { enabled: true };
				break;

			case "disable":
				await webhookManager.updateWebhook(webhookId, { enabled: false });
				message = "Webhook disabled successfully";
				result = { enabled: false };
				break;

			case "test":
				const testResult = await webhookManager.testWebhook(
					webhookId,
					"test.manual",
					testPayload || {
						eventType: "test.manual",
						timestamp: new Date().toISOString(),
						data: {
							test: true,
							message: "Manual webhook test",
							webhookId,
							webhookName: webhook.name,
						},
					},
				);
				message = "Webhook test completed";
				result = {
					success: testResult.success,
					statusCode: testResult.statusCode,
					responseTime: testResult.responseTime,
					error: testResult.error,
					deliveryId: testResult.deliveryId,
				};
				break;

			case "reset_failures":
				await webhookManager.resetWebhookFailures(webhookId);
				message = "Webhook failure count reset successfully";
				result = { failuresReset: true };
				break;

			default:
				throw new Error(`Unknown action: ${action}`);
		}

		return createSuccessResponse({
			message,
			webhookId,
			action,
			result,
			timestamp: new Date().toISOString(),
		});
	} catch (error) {
		return handleApiError(error, `Failed to perform action on webhook ${webhookId}`);
	}
}

/**
 * DELETE /api/admin/webhooks/[webhookId]
 * Delete a webhook configuration
 */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ webhookId: string }> }) {
	const { webhookId } = await params;
	try {
		const { searchParams } = new URL(request.url);
		const force = searchParams.get("force") === "true";

		const webhook = await webhookManager.getWebhookById(webhookId);
		if (!webhook) {
			return NextResponse.json(
				{
					success: false,
					error: {
						code: "WEBHOOK_NOT_FOUND",
						message: `Webhook not found: ${webhookId}`,
						timestamp: new Date().toISOString(),
					},
				},
				{ status: 404 },
			);
		}

		// Check if webhook has pending deliveries (unless force is true)
		if (!force) {
			const stats = await webhookManager.getWebhookStatsById(webhookId);
			if (stats.pendingDeliveries > 0) {
				return NextResponse.json(
					{
						success: false,
						error: {
							code: "WEBHOOK_HAS_PENDING_DELIVERIES",
							message: `Webhook has ${stats.pendingDeliveries} pending deliveries. Use force=true to delete anyway.`,
							details: { pendingDeliveries: stats.pendingDeliveries },
							timestamp: new Date().toISOString(),
						},
					},
					{ status: 409 },
				);
			}
		}

		await webhookManager.deleteWebhook(webhookId, force);

		return createSuccessResponse({
			message: "Webhook deleted successfully",
			webhookId,
			webhookName: webhook.name,
			force,
			timestamp: new Date().toISOString(),
		});
	} catch (error) {
		return handleApiError(error, `Failed to delete webhook ${webhookId}`);
	}
}
