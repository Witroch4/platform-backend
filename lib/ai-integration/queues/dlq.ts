/**
 * Dead Letter Queue Manager
 * Requirements: 7.2, 7.3
 */

import { Job } from 'bullmq';
import { getRedisInstance } from '../../connections';
import { AiMessageJobData, EmbeddingUpsertJobData, DeadLetterQueueItem } from '../types/job-data';
import { aiLogger as logger }from '../utils/logger';
import { DLQ_OPTIONS } from './config';

const DLQ_KEYS = {
  AI_MESSAGE: 'dlq-ai-incoming-message',
  EMBEDDING_UPSERT: 'dlq-ai-embedding-upsert',
} as const;

/**
 * Add failed job to Dead Letter Queue
 */
export async function addToDLQ(
  job: Job<AiMessageJobData | EmbeddingUpsertJobData>,
  error: string,
  queueType: 'ai-message' | 'embedding-upsert'
): Promise<void> {
  const redis = getRedisInstance();
  const dlqKey = queueType === 'ai-message' ? DLQ_KEYS.AI_MESSAGE : DLQ_KEYS.EMBEDDING_UPSERT;

  const dlqItem: DeadLetterQueueItem = {
    jobId: job.id!,
    jobData: job.data,
    error,
    failedAt: Date.now(),
    attempts: job.attemptsMade,
    queue: job.queueName,
  };

  try {
    // Add to DLQ with score as timestamp for ordering
    await redis.zadd(dlqKey, Date.now(), JSON.stringify(dlqItem));

    // Trim DLQ to max size
    await redis.zremrangebyrank(dlqKey, 0, -(DLQ_OPTIONS.maxSize + 1));

    // Set expiry on the key if it doesn't exist
    const ttl = await redis.ttl(dlqKey);
    if (ttl === -1) {
      await redis.expire(dlqKey, Math.floor(DLQ_OPTIONS.maxAge / 1000));
    }

    logger.error('💀 Job added to DLQ', {
      jobId: job.id,
      stage: 'queue',
      error,
      traceId: job.data.traceId,
      metadata: {
        queueType,
        attempts: job.attemptsMade,
      },
    });
  } catch (dlqError) {
    logger.error('❌ Failed to add job to DLQ', {
      jobId: job.id,
      stage: 'queue',
      error: dlqError instanceof Error ? dlqError.message : String(dlqError),
      metadata: {
        originalError: error,
      },
    });
  }
}

/**
 * Get DLQ items with pagination
 */
export async function getDLQItems(
  queueType: 'ai-message' | 'embedding-upsert',
  options: {
    offset?: number;
    limit?: number;
    fromTime?: number;
    toTime?: number;
  } = {}
): Promise<DeadLetterQueueItem[]> {
  const redis = getRedisInstance();
  const dlqKey = queueType === 'ai-message' ? DLQ_KEYS.AI_MESSAGE : DLQ_KEYS.EMBEDDING_UPSERT;

  const { offset = 0, limit = 50, fromTime, toTime } = options;

  try {
    let items: string[];

    if (fromTime || toTime) {
      // Query by time range
      const min = fromTime ?? 0;
      const max = toTime ?? Date.now();
      items = await redis.zrangebyscore(dlqKey, min, max, 'LIMIT', offset, limit);
    } else {
      // Query by rank (most recent first)
      items = await redis.zrevrange(dlqKey, offset, offset + limit - 1);
    }

    return items.map(item => JSON.parse(item) as DeadLetterQueueItem);
  } catch (error) {
    logger.error('❌ Failed to get DLQ items', {
      stage: 'queue',
      error: error instanceof Error ? error.message : String(error),
      metadata: { queueType },
    });
    return [];
  }
}

/**
 * Get DLQ statistics
 */
export async function getDLQStats(): Promise<{
  aiMessage: { count: number; oldestItem?: number };
  embeddingUpsert: { count: number; oldestItem?: number };
}> {
  const redis = getRedisInstance();

  try {
    const [aiMessageCount, embeddingUpsertCount] = await Promise.all([
      redis.zcard(DLQ_KEYS.AI_MESSAGE),
      redis.zcard(DLQ_KEYS.EMBEDDING_UPSERT),
    ]);

    // Get oldest items
    const [aiMessageOldest, embeddingUpsertOldest] = await Promise.all([
      redis.zrange(DLQ_KEYS.AI_MESSAGE, 0, 0, 'WITHSCORES'),
      redis.zrange(DLQ_KEYS.EMBEDDING_UPSERT, 0, 0, 'WITHSCORES'),
    ]);

    return {
      aiMessage: {
        count: aiMessageCount,
        oldestItem: aiMessageOldest.length > 1 ? parseInt(aiMessageOldest[1]) : undefined,
      },
      embeddingUpsert: {
        count: embeddingUpsertCount,
        oldestItem: embeddingUpsertOldest.length > 1 ? parseInt(embeddingUpsertOldest[1]) : undefined,
      },
    };
  } catch (error) {
    logger.error('❌ Failed to get DLQ stats', {
      stage: 'queue',
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      aiMessage: { count: 0 },
      embeddingUpsert: { count: 0 },
    };
  }
}

/**
 * Remove item from DLQ
 */
export async function removeFromDLQ(
  queueType: 'ai-message' | 'embedding-upsert',
  jobId: string
): Promise<boolean> {
  const redis = getRedisInstance();
  const dlqKey = queueType === 'ai-message' ? DLQ_KEYS.AI_MESSAGE : DLQ_KEYS.EMBEDDING_UPSERT;

  try {
    // Get all items and find the one with matching jobId
    const items = await redis.zrange(dlqKey, 0, -1);
    
    for (const item of items) {
      const dlqItem = JSON.parse(item) as DeadLetterQueueItem;
      if (dlqItem.jobId === jobId) {
        const removed = await redis.zrem(dlqKey, item);
        if (removed > 0) {
          logger.info('🗑️ Item removed from DLQ', {
            jobId,
            stage: 'queue',
            metadata: { queueType },
          });
          return true;
        }
      }
    }

    return false;
  } catch (error) {
    logger.error('❌ Failed to remove item from DLQ', {
      jobId,
      stage: 'queue',
      error: error instanceof Error ? error.message : String(error),
      metadata: { queueType },
    });
    return false;
  }
}

/**
 * Clear all items from DLQ
 */
export async function clearDLQ(queueType: 'ai-message' | 'embedding-upsert'): Promise<number> {
  const redis = getRedisInstance();
  const dlqKey = queueType === 'ai-message' ? DLQ_KEYS.AI_MESSAGE : DLQ_KEYS.EMBEDDING_UPSERT;

  try {
    const count = await redis.zcard(dlqKey);
    await redis.del(dlqKey);
    
    logger.info('🧹 DLQ cleared', {
      stage: 'queue',
      metadata: { queueType, itemsRemoved: count },
    });
    return count;
  } catch (error) {
    logger.error('❌ Failed to clear DLQ', {
      stage: 'queue',
      error: error instanceof Error ? error.message : String(error),
      metadata: { queueType },
    });
    return 0;
  }
}

/**
 * Reprocess DLQ item
 */
export async function reprocessDLQItem(
  queueType: 'ai-message' | 'embedding-upsert',
  jobId: string,
  reprocessReason: string,
  reprocessedBy: string
): Promise<boolean> {
  const redis = getRedisInstance();
  const dlqKey = queueType === 'ai-message' ? DLQ_KEYS.AI_MESSAGE : DLQ_KEYS.EMBEDDING_UPSERT;

  try {
    // Get all items and find the one with matching jobId
    const items = await redis.zrange(dlqKey, 0, -1);
    
    for (const item of items) {
      const dlqItem = JSON.parse(item) as DeadLetterQueueItem;
      if (dlqItem.jobId === jobId) {
        // Update the item with reprocess info
        dlqItem.reprocessReason = reprocessReason;
        dlqItem.reprocessedBy = reprocessedBy;

        // Remove from DLQ
        await redis.zrem(dlqKey, item);

        // Re-add to appropriate queue
        if (queueType === 'ai-message') {
          const { addAiMessageJob } = await import('./manager');
          await addAiMessageJob(dlqItem.jobData as AiMessageJobData, {
            traceId: dlqItem.jobData.traceId,
          });
        } else {
          const { addEmbeddingUpsertJob } = await import('./manager');
          await addEmbeddingUpsertJob(dlqItem.jobData as EmbeddingUpsertJobData, {
            traceId: dlqItem.jobData.traceId,
          });
        }

        logger.info('🔄 DLQ item reprocessed', {
          jobId,
          stage: 'queue',
          metadata: {
            queueType,
            reprocessReason,
            reprocessedBy,
          },
        });

        return true;
      }
    }

    return false;
  } catch (error) {
    logger.error('❌ Failed to reprocess DLQ item', {
      jobId,
      stage: 'queue',
      error: error instanceof Error ? error.message : String(error),
      metadata: { queueType },
    });
    return false;
  }
}

/**
 * Clean up expired DLQ items
 */
export async function cleanupExpiredDLQItems(): Promise<void> {
  const redis = getRedisInstance();
  const cutoffTime = Date.now() - DLQ_OPTIONS.maxAge;

  try {
    const [aiMessageRemoved, embeddingUpsertRemoved] = await Promise.all([
      redis.zremrangebyscore(DLQ_KEYS.AI_MESSAGE, 0, cutoffTime),
      redis.zremrangebyscore(DLQ_KEYS.EMBEDDING_UPSERT, 0, cutoffTime),
    ]);

    if (aiMessageRemoved > 0 || embeddingUpsertRemoved > 0) {
      logger.info('🧹 Expired DLQ items cleaned up', {
        stage: 'queue',
        metadata: {
          aiMessageRemoved,
          embeddingUpsertRemoved,
          cutoffTime,
        },
      });
    }
  } catch (error) {
    logger.error('❌ Failed to cleanup expired DLQ items', {
      stage: 'queue',
      error: error instanceof Error ? error.message : String(error),
    });
  }
}