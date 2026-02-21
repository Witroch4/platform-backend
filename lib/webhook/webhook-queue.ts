import { Queue, type Job } from "bullmq";
import { getRedisInstance } from "../connections";
import { webhookManager } from "./webhook-manager";

// Lazy initialization to avoid Edge Runtime issues
let _webhookQueue: Queue | null = null;

// Webhook queue for processing deliveries (lazy initialization)
export function getWebhookQueue(): Queue {
	if (!_webhookQueue) {
		_webhookQueue = new Queue("webhook-delivery", {
			connection: getRedisInstance(),
			defaultJobOptions: {
				removeOnComplete: 100 as any,
				removeOnFail: 50 as any,
				attempts: 3,
				backoff: {
					type: "exponential",
					delay: 1000,
				},
			},
		});
	}
	return _webhookQueue;
}

// Processor function — used by worker/registry.ts (Worker created by init.ts)
export async function processWebhookDelivery(job: Job): Promise<any> {
	const { deliveryId, attempt } = job.data;

	console.log(`[WebhookDelivery] Processing delivery ${deliveryId} (attempt ${attempt})`);

	const result = await webhookManager.deliverWebhook(deliveryId);

	if (result.success) {
		console.log(`[WebhookDelivery] Delivery ${deliveryId} successful (${result.statusCode})`);
		return result;
	}

	console.warn(`[WebhookDelivery] Delivery ${deliveryId} failed: ${result.error}`);
	throw new Error(result.error || "Webhook delivery failed");
}

// Legacy export for backward compatibility (queue only)
export const webhookQueue = getWebhookQueue();

// Worker is now created by worker/init.ts via the registry
// Event handlers are attached via attachStandardEventHandlers
