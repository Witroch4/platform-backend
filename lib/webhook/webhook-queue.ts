import { Queue, Worker, Job } from 'bullmq';
import { getRedisInstance } from '../connections';
import { webhookManager } from './webhook-manager';

// Lazy initialization to avoid Edge Runtime issues
let _webhookQueue: Queue | null = null;
let _webhookWorker: Worker | null = null;

// Webhook queue for processing deliveries (lazy initialization)
export function getWebhookQueue(): Queue {
  if (!_webhookQueue) {
    _webhookQueue = new Queue('webhook-delivery', {
      connection: getRedisInstance(),
      defaultJobOptions: {
        removeOnComplete: 100 as any,
        removeOnFail: 50 as any,
        attempts: 3,
        backoff: {
          type: 'exponential',
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
      'webhook-delivery',
      async (job: Job) => {
        const { deliveryId, webhookId, attempt } = job.data;

        console.log(`[WebhookWorker] Processing delivery ${deliveryId} (attempt ${attempt})`);

        try {
          const result = await webhookManager.deliverWebhook(deliveryId);
          
          if (result.success) {
            console.log(`[WebhookWorker] Delivery ${deliveryId} successful (${result.statusCode})`);
            return result;
          } else {
            console.warn(`[WebhookWorker] Delivery ${deliveryId} failed: ${result.error}`);
            throw new Error(result.error || 'Webhook delivery failed');
          }
        } catch (error) {
          console.error(`[WebhookWorker] Error processing delivery ${deliveryId}:`, error);
          throw error;
        }
      },
      {
        connection: getRedisInstance(),
        concurrency: 10, // Process up to 10 webhooks concurrently
        removeOnComplete: 100 as any,
        removeOnFail: 50 as any,
      }
    );

    // Event listeners
    _webhookWorker.on('completed', (job: Job, result: any) => {
      console.log(`[WebhookWorker] Job ${job.id} completed successfully:`, {
        deliveryId: job.data.deliveryId,
        statusCode: result.statusCode,
        responseTime: result.responseTime,
      });
    });

    _webhookWorker.on('failed', (job: Job | undefined, error: Error) => {
      console.error(`[WebhookWorker] Job ${job?.id} failed:`, {
        deliveryId: job?.data?.deliveryId,
        error: error.message,
        attempts: job?.attemptsMade,
      });
    });

    _webhookWorker.on('stalled', (jobId: string) => {
      console.warn(`[WebhookWorker] Job ${jobId} stalled`);
    });

    _webhookWorker.on('error', (error: Error) => {
      console.error('[WebhookWorker] Worker error:', error);
    });
  }
  return _webhookWorker;
}

// Legacy exports for backward compatibility
export const webhookQueue = getWebhookQueue();
export const webhookWorker = getWebhookWorker();

// Event listeners
webhookWorker.on('completed', (job: Job, result: any) => {
  console.log(`[WebhookWorker] Job ${job.id} completed successfully:`, {
    deliveryId: job.data.deliveryId,
    statusCode: result.statusCode,
    responseTime: result.responseTime,
  });
});

webhookWorker.on('failed', (job: Job | undefined, error: Error) => {
  console.error(`[WebhookWorker] Job ${job?.id} failed:`, {
    deliveryId: job?.data?.deliveryId,
    error: error.message,
    attempts: job?.attemptsMade,
  });
});

webhookWorker.on('stalled', (jobId: string) => {
  console.warn(`[WebhookWorker] Job ${jobId} stalled`);
});

webhookWorker.on('error', (error: Error) => {
  console.error('[WebhookWorker] Worker error:', error);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('[WebhookWorker] Shutting down webhook worker...');
  await webhookWorker.close();
  await webhookQueue.close();
  process.exit(0);
});

export default { webhookQueue, webhookWorker };