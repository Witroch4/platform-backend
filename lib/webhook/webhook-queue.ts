import { Queue, Worker, Job } from "bullmq";
import { getRedisInstance } from "../connections";
import { webhookManager } from "./webhook-manager";
import { attachStandardEventHandlers } from "../../worker/utils/worker-events";

// Lazy initialization to avoid Edge Runtime issues
let _webhookQueue: Queue | null = null;
let _webhookWorker: Worker | null = null;

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

// Webhook delivery worker (lazy initialization)
export function getWebhookWorker(): Worker {
	if (!_webhookWorker) {
		_webhookWorker = new Worker(
			"webhook-delivery",
			async (job: Job) => {
				const { deliveryId, webhookId, attempt } = job.data;

				console.log(`[WebhookDelivery] Processing delivery ${deliveryId} (attempt ${attempt})`);

				try {
					const result = await webhookManager.deliverWebhook(deliveryId);

					if (result.success) {
						console.log(`[WebhookDelivery] Delivery ${deliveryId} successful (${result.statusCode})`);
						return result;
					} else {
						console.warn(`[WebhookDelivery] Delivery ${deliveryId} failed: ${result.error}`);
						throw new Error(result.error || "Webhook delivery failed");
					}
				} catch (error) {
					console.error(`[WebhookDelivery] Error processing delivery ${deliveryId}:`, error);
					throw error;
				}
			},
			{
				connection: getRedisInstance(),
				concurrency: 10,
				removeOnComplete: 100 as any,
				removeOnFail: 50 as any,
			},
		);

		// Standardized event handlers
		attachStandardEventHandlers(_webhookWorker, { name: "WebhookDelivery" });
	}
	return _webhookWorker;
}

// Legacy exports for backward compatibility
export const webhookQueue = getWebhookQueue();
export const webhookWorker = getWebhookWorker();

// [CLEANUP 2026-02-16] Duplicated event handlers REMOVIDOS
// Event handlers já são registrados dentro de getWebhookWorker() (lazy init)
// SIGINT handler REMOVIDO - init.ts é o único responsável pelo graceful shutdown

export default { webhookQueue, webhookWorker };

