import { Queue, Worker, Job } from 'bullmq';
import { connection } from '../redis';
import { webhookManager } from './webhook-manager';

// Webhook queue for processing deliveries
export const webhookQueue = new Queue('webhook-delivery', {
  connection,
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
export const webhookWorker = new Worker(
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
    connection,
    concurrency: 10, // Process up to 10 webhooks concurrently
    removeOnComplete: 100,
    removeOnFail: 50,
  }
);

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