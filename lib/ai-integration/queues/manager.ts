/**
 * Queue Manager for AI Integration
 * Requirements: 7.1, 7.2, 7.3
 */

import { Queue, QueueEvents } from 'bullmq';
import { 
  QUEUE_NAMES, 
  aiMessageQueueOptions, 
  embeddingUpsertQueueOptions,
  JOB_PRIORITIES,
  getQueueRedisConnection 
} from './config';
import { AiMessageJobData, EmbeddingUpsertJobData } from '../types/job-data';
import { aiLogger as logger }from '../utils/logger';

// Queue instances
let aiMessageQueue: Queue<AiMessageJobData> | null = null;
let embeddingUpsertQueue: Queue<EmbeddingUpsertJobData> | null = null;

// Queue events for monitoring
let aiMessageQueueEvents: QueueEvents | null = null;
let embeddingUpsertQueueEvents: QueueEvents | null = null;

/**
 * Initialize all queues
 */
export async function initializeQueues(): Promise<void> {
  try {
    // Initialize AI Message Queue
    aiMessageQueue = new Queue<AiMessageJobData>(
      QUEUE_NAMES.AI_INCOMING_MESSAGE,
      aiMessageQueueOptions
    );

    // Initialize Embedding Upsert Queue
    embeddingUpsertQueue = new Queue<EmbeddingUpsertJobData>(
      QUEUE_NAMES.AI_EMBEDDING_UPSERT,
      embeddingUpsertQueueOptions
    );

    // Initialize queue events for monitoring
    aiMessageQueueEvents = new QueueEvents(QUEUE_NAMES.AI_INCOMING_MESSAGE, {
      connection: getQueueRedisConnection(),
    });

    embeddingUpsertQueueEvents = new QueueEvents(QUEUE_NAMES.AI_EMBEDDING_UPSERT, {
      connection: getQueueRedisConnection(),
    });

    // Setup event listeners
    setupQueueEventListeners();

    logger.info('✅ All queues initialized successfully', {
      stage: 'queue',
      metadata: {
        queues: Object.values(QUEUE_NAMES),
      },
    });
  } catch (error) {
    logger.error('❌ Failed to initialize queues', { 
      error: error instanceof Error ? error.message : String(error) 
    });
    throw error;
  }
}

/**
 * Get AI Message Queue instance
 */
export function getAiMessageQueue(): Queue<AiMessageJobData> {
  if (!aiMessageQueue) {
    throw new Error('AI Message Queue not initialized. Call initializeQueues() first.');
  }
  return aiMessageQueue;
}

/**
 * Get Embedding Upsert Queue instance
 */
export function getEmbeddingUpsertQueue(): Queue<EmbeddingUpsertJobData> {
  if (!embeddingUpsertQueue) {
    throw new Error('Embedding Upsert Queue not initialized. Call initializeQueues() first.');
  }
  return embeddingUpsertQueue;
}

/**
 * Add job to AI Message Queue
 */
export async function addAiMessageJob(
  data: AiMessageJobData,
  options: {
    priority?: number;
    delay?: number;
    traceId: string;
  } = { traceId: data.traceId }
): Promise<string> {
  const queue = getAiMessageQueue();
  
  // Determine priority based on content
  let priority = options.priority ?? JOB_PRIORITIES.NORMAL;
  
  // High priority for button clicks and quick replies
  if (data.contentAttributes?.button_reply || data.contentAttributes?.quick_reply) {
    priority = JOB_PRIORITIES.HIGH;
  }

  const job = await queue.add(
    'process-ai-message',
    data,
    {
      priority,
      delay: options.delay,
      jobId: `${data.conversationId}-${data.messageId}`, // Ensure uniqueness
      removeOnComplete: 100,
      removeOnFail: 50,
    }
  );

  logger.info('📤 AI message job added to queue', {
    jobId: job.id,
    traceId: options.traceId,
    accountId: data.accountId,
    conversationId: data.conversationId,
    messageId: data.messageId,
    stage: 'queue',
    metadata: {
      priority,
    },
  });

  return job.id!;
}

/**
 * Add job to Embedding Upsert Queue
 */
export async function addEmbeddingUpsertJob(
  data: EmbeddingUpsertJobData,
  options: {
    delay?: number;
    traceId: string;
  } = { traceId: data.traceId }
): Promise<string> {
  const queue = getEmbeddingUpsertQueue();
  
  const job = await queue.add(
    'upsert-embedding',
    data,
    {
      priority: JOB_PRIORITIES.LOW, // Always low priority
      delay: options.delay,
      jobId: `embedding-${data.intentId}-${Date.now()}`, // Ensure uniqueness
      removeOnComplete: 50,
      removeOnFail: 25,
    }
  );

  logger.info('📤 Embedding upsert job added to queue', {
    jobId: job.id,
    traceId: options.traceId,
    stage: 'queue',
    metadata: {
      intentId: data.intentId,
      operation: data.operation,
    },
  });

  return job.id!;
}

/**
 * Setup event listeners for queue monitoring
 */
function setupQueueEventListeners(): void {
  // AI Message Queue Events
  if (aiMessageQueueEvents) {
    aiMessageQueueEvents.on('completed', ({ jobId, returnvalue }) => {
      logger.info('✅ AI message job completed', { 
        jobId, 
        stage: 'queue',
        metadata: { returnvalue }
      });
    });

    aiMessageQueueEvents.on('failed', ({ jobId, failedReason }) => {
      logger.error('❌ AI message job failed', { 
        jobId, 
        stage: 'queue',
        metadata: { failedReason }
      });
    });

    aiMessageQueueEvents.on('stalled', ({ jobId }) => {
      logger.warn('⚠️ AI message job stalled', { 
        jobId,
        stage: 'queue'
      });
    });
  }

  // Embedding Upsert Queue Events
  if (embeddingUpsertQueueEvents) {
    embeddingUpsertQueueEvents.on('completed', ({ jobId, returnvalue }) => {
      logger.info('✅ Embedding upsert job completed', { 
        jobId, 
        stage: 'queue',
        metadata: { returnvalue }
      });
    });

    embeddingUpsertQueueEvents.on('failed', ({ jobId, failedReason }) => {
      logger.error('❌ Embedding upsert job failed', { 
        jobId, 
        stage: 'queue',
        metadata: { failedReason }
      });
    });

    embeddingUpsertQueueEvents.on('stalled', ({ jobId }) => {
      logger.warn('⚠️ Embedding upsert job stalled', { 
        jobId,
        stage: 'queue'
      });
    });
  }
}

/**
 * Get queue statistics
 */
export async function getQueueStats() {
  const aiMessageQueue = getAiMessageQueue();
  const embeddingUpsertQueue = getEmbeddingUpsertQueue();

  const [aiMessageStats, embeddingUpsertStats] = await Promise.all([
    aiMessageQueue.getJobCounts(),
    embeddingUpsertQueue.getJobCounts(),
  ]);

  return {
    aiMessage: {
      name: QUEUE_NAMES.AI_INCOMING_MESSAGE,
      ...aiMessageStats,
    },
    embeddingUpsert: {
      name: QUEUE_NAMES.AI_EMBEDDING_UPSERT,
      ...embeddingUpsertStats,
    },
  };
}

/**
 * Pause all queues
 */
export async function pauseAllQueues(): Promise<void> {
  const aiMessageQueue = getAiMessageQueue();
  const embeddingUpsertQueue = getEmbeddingUpsertQueue();

  await Promise.all([
    aiMessageQueue.pause(),
    embeddingUpsertQueue.pause(),
  ]);

  logger.info('⏸️ All queues paused', { stage: 'queue' });
}

/**
 * Resume all queues
 */
export async function resumeAllQueues(): Promise<void> {
  const aiMessageQueue = getAiMessageQueue();
  const embeddingUpsertQueue = getEmbeddingUpsertQueue();

  await Promise.all([
    aiMessageQueue.resume(),
    embeddingUpsertQueue.resume(),
  ]);

  logger.info('▶️ All queues resumed', { stage: 'queue' });
}

/**
 * Clean up queues and close connections
 */
export async function closeQueues(): Promise<void> {
  const promises: Promise<void>[] = [];

  if (aiMessageQueue) {
    promises.push(aiMessageQueue.close());
  }

  if (embeddingUpsertQueue) {
    promises.push(embeddingUpsertQueue.close());
  }

  if (aiMessageQueueEvents) {
    promises.push(aiMessageQueueEvents.close());
  }

  if (embeddingUpsertQueueEvents) {
    promises.push(embeddingUpsertQueueEvents.close());
  }

  await Promise.all(promises);

  // Reset instances
  aiMessageQueue = null;
  embeddingUpsertQueue = null;
  aiMessageQueueEvents = null;
  embeddingUpsertQueueEvents = null;

  logger.info('🔌 All queues closed', { stage: 'queue' });
}