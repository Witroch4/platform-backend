"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.webhookWorker = exports.webhookQueue = void 0;
const bullmq_1 = require("bullmq");
const redis_1 = require("../redis");
const webhook_manager_1 = require("./webhook-manager");
// Webhook queue for processing deliveries
exports.webhookQueue = new bullmq_1.Queue('webhook-delivery', {
    connection: redis_1.connection,
    defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 50,
        attempts: 3,
        backoff: {
            type: 'exponential',
            delay: 1000,
        },
    },
});
// Webhook delivery worker
exports.webhookWorker = new bullmq_1.Worker('webhook-delivery', async (job) => {
    const { deliveryId, webhookId, attempt } = job.data;
    console.log(`[WebhookWorker] Processing delivery ${deliveryId} (attempt ${attempt})`);
    try {
        const result = await webhook_manager_1.webhookManager.deliverWebhook(deliveryId);
        if (result.success) {
            console.log(`[WebhookWorker] Delivery ${deliveryId} successful (${result.statusCode})`);
            return result;
        }
        else {
            console.warn(`[WebhookWorker] Delivery ${deliveryId} failed: ${result.error}`);
            throw new Error(result.error || 'Webhook delivery failed');
        }
    }
    catch (error) {
        console.error(`[WebhookWorker] Error processing delivery ${deliveryId}:`, error);
        throw error;
    }
}, {
    connection: redis_1.connection,
    concurrency: 10, // Process up to 10 webhooks concurrently
    removeOnComplete: 100,
    removeOnFail: 50,
});
// Event listeners
exports.webhookWorker.on('completed', (job, result) => {
    console.log(`[WebhookWorker] Job ${job.id} completed successfully:`, {
        deliveryId: job.data.deliveryId,
        statusCode: result.statusCode,
        responseTime: result.responseTime,
    });
});
exports.webhookWorker.on('failed', (job, error) => {
    console.error(`[WebhookWorker] Job ${job?.id} failed:`, {
        deliveryId: job?.data?.deliveryId,
        error: error.message,
        attempts: job?.attemptsMade,
    });
});
exports.webhookWorker.on('stalled', (jobId) => {
    console.warn(`[WebhookWorker] Job ${jobId} stalled`);
});
exports.webhookWorker.on('error', (error) => {
    console.error('[WebhookWorker] Worker error:', error);
});
// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('[WebhookWorker] Shutting down webhook worker...');
    await exports.webhookWorker.close();
    await exports.webhookQueue.close();
    process.exit(0);
});
exports.default = { webhookQueue: exports.webhookQueue, webhookWorker: exports.webhookWorker };
