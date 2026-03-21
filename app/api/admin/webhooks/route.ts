import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateInput, handleApiError, createSuccessResponse } from "../../../../lib/utils/api-helpers";
import { webhookManager, type WebhookConfig } from "../../../../lib/webhook/webhook-manager";

// Validation schemas
const WebhookConfigSchema = z.object({
	name: z.string().min(1).max(255),
	url: z.string().url().max(1000),
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
		.min(1),
	headers: z.record(z.string()).optional(),
	secret: z.string().min(8).max(255).optional(),
	enabled: z.boolean().default(true),
	retryPolicy: z
		.object({
			maxAttempts: z.number().int().min(1).max(10).default(3),
			backoffType: z.enum(["fixed", "exponential"]).default("exponential"),
			initialDelay: z.number().int().min(100).max(60000).default(1000), // ms
			maxDelay: z.number().int().min(1000).max(300000).default(30000), // ms
		})
		.optional(),
	filters: z
		.object({
			queueNames: z.array(z.string()).optional(),
			jobTypes: z.array(z.string()).optional(),
			severityLevels: z.array(z.enum(["info", "warning", "error", "critical"])).optional(),
		})
		.optional(),
	timeout: z.number().int().min(1000).max(30000).default(10000), // ms
});

const WebhookUpdateSchema = WebhookConfigSchema.partial().omit({ name: true });

const WebhookQuerySchema = z.object({
	page: z.coerce.number().int().min(1).default(1),
	limit: z.coerce.number().int().min(1).max(100).default(20),
	search: z.string().optional(),
	enabled: z.coerce.boolean().optional(),
	events: z.array(z.string()).optional(),
	sortBy: z.enum(["name", "url", "enabled", "createdAt", "lastDelivery"]).default("createdAt"),
	sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

const WebhookTestSchema = z.object({
	webhookId: z.string().min(1),
	eventType: z.string(),
	testPayload: z.record(z.any()).optional(),
});

/**
 * GET /api/admin/webhooks
 * Retrieve all webhook configurations with filtering and pagination
 */
export async function GET(request: NextRequest) {
	try {
		const { searchParams } = new URL(request.url);
		const query = WebhookQuerySchema.parse(Object.fromEntries(searchParams));

		const webhooks = await webhookManager.getAllWebhooks({
			page: query.page,
			limit: query.limit,
			search: query.search,
			enabled: query.enabled,
			events: query.events,
			sortBy: query.sortBy,
			sortOrder: query.sortOrder,
		});

		return createSuccessResponse({
			webhooks: webhooks.items,
			pagination: webhooks.pagination,
			filters: {
				search: query.search,
				enabled: query.enabled,
				events: query.events,
				sortBy: query.sortBy,
				sortOrder: query.sortOrder,
			},
			timestamp: new Date().toISOString(),
		});
	} catch (error) {
		return handleApiError(error, "Failed to fetch webhooks");
	}
}

/**
 * POST /api/admin/webhooks
 * Create a new webhook configuration
 */
export async function POST(request: NextRequest) {
	try {
		const body = await request.json();

		// Verificar se é um teste de webhook
		if (body.testWebhook) {
			return await testWebhook(request);
		}

		const config = WebhookConfigSchema.parse(body);

		// Check if webhook with same name already exists
		const existingWebhook = await webhookManager.getWebhookByName(config.name);
		if (existingWebhook) {
			return NextResponse.json(
				{
					success: false,
					error: {
						code: "WEBHOOK_NAME_EXISTS",
						message: `Webhook with name '${config.name}' already exists`,
						timestamp: new Date().toISOString(),
					},
				},
				{ status: 409 },
			);
		}

		const webhook = await webhookManager.createWebhook(config as Partial<WebhookConfig>);

		return createSuccessResponse(
			{
				message: "Webhook created successfully",
				webhook: {
					...webhook,
					secret: webhook.secret ? "[REDACTED]" : undefined, // Don't expose secret in response
				},
			},
			201,
		);
	} catch (error) {
		return handleApiError(error, "Failed to create webhook");
	}
}

/**
 * Test webhook delivery
 */
async function testWebhook(request: NextRequest) {
	try {
		const body = await request.json();
		const { webhookId, eventType, testPayload } = WebhookTestSchema.parse(body);

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

		// Create test payload
		const payload = testPayload || {
			eventType,
			timestamp: new Date().toISOString(),
			data: {
				test: true,
				message: "This is a test webhook delivery",
				webhookId,
				webhookName: webhook.name,
			},
		};

		const result = await webhookManager.testWebhook(webhookId, eventType, payload);

		return createSuccessResponse({
			message: "Webhook test completed",
			webhookId,
			eventType,
			result: {
				success: result.success,
				statusCode: result.statusCode,
				responseTime: result.responseTime,
				error: result.error,
				deliveryId: result.deliveryId,
			},
			timestamp: new Date().toISOString(),
		});
	} catch (error) {
		return handleApiError(error, "Failed to test webhook");
	}
}
