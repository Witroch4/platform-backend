/**
 * AI Message Queue Service
 * Based on requirements 1.1, 14.1
 */

import { Queue, Worker, Job } from 'bullmq';
import { getRedisInstance } from '../../connections';
import { AiMessageJobData } from '../types/job-data';

export interface QueueMetrics {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: boolean;
}

export class AiMessageQueueService {
  private readonly queue: Queue<AiMessageJobData>;
  private readonly redis: ReturnType<typeof getRedisInstance>;

  constructor() {
    this.redis = getRedisInstance();
    
    // Initialize the ai-incoming-message queue (avoid ':' which some backends reject)
    this.queue = new Queue<AiMessageJobData>('ai-incoming-message', {
      connection: this.redis,
      defaultJobOptions: {
        removeOnComplete: 100, // Keep last 100 completed jobs
        removeOnFail: 50, // Keep last 50 failed jobs
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1000, // Start with 1s, then 2s, 4s
        },
        delay: 0, // No delay by default
      },
    });

    this.setupEventListeners();
  }

  /**
   * Add a message to the processing queue
   */
  async enqueueMessage(
    jobData: AiMessageJobData,
    options?: {
      priority?: number;
      delay?: number;
      attempts?: number;
    }
  ): Promise<Job<AiMessageJobData>> {
    try {
      const job = await this.queue.add('process-ai-message', jobData, {
        priority: options?.priority || 0,
        delay: options?.delay || 0,
        attempts: options?.attempts || 3,
        jobId: `${jobData.accountId}-${jobData.conversationId}-${jobData.messageId}`,
      });

      console.log(`[AiMessageQueue] Enqueued message job: ${job.id}`, {
        accountId: jobData.accountId,
        conversationId: jobData.conversationId,
        messageId: jobData.messageId,
        channel: jobData.channel,
        traceId: jobData.traceId,
      });

      return job;
    } catch (error) {
      console.error('[AiMessageQueue] Failed to enqueue message:', error, {
        accountId: jobData.accountId,
        conversationId: jobData.conversationId,
        messageId: jobData.messageId,
      });
      throw error;
    }
  }

  /**
   * Get queue metrics
   */
  async getMetrics(): Promise<QueueMetrics> {
    try {
      const [waiting, active, completed, failed, delayed, paused] = await Promise.all([
        this.queue.getWaiting(),
        this.queue.getActive(),
        this.queue.getCompleted(),
        this.queue.getFailed(),
        this.queue.getDelayed(),
        this.queue.isPaused(),
      ]);

      return {
        waiting: waiting.length,
        active: active.length,
        completed: completed.length,
        failed: failed.length,
        delayed: delayed.length,
        paused,
      };
    } catch (error) {
      console.error('[AiMessageQueue] Failed to get metrics:', error);
      throw error;
    }
  }

  /**
   * Get a specific job by ID
   */
  async getJob(jobId: string): Promise<Job<AiMessageJobData> | undefined> {
    try {
      return await this.queue.getJob(jobId);
    } catch (error) {
      console.error(`[AiMessageQueue] Failed to get job ${jobId}:`, error);
      return undefined;
    }
  }

  /**
   * Pause the queue
   */
  async pause(): Promise<void> {
    try {
      await this.queue.pause();
      console.log('[AiMessageQueue] Queue paused');
    } catch (error) {
      console.error('[AiMessageQueue] Failed to pause queue:', error);
      throw error;
    }
  }

  /**
   * Resume the queue
   */
  async resume(): Promise<void> {
    try {
      await this.queue.resume();
      console.log('[AiMessageQueue] Queue resumed');
    } catch (error) {
      console.error('[AiMessageQueue] Failed to resume queue:', error);
      throw error;
    }
  }

  /**
   * Clean completed jobs older than specified time
   */
  async cleanCompleted(olderThanMs: number = 24 * 60 * 60 * 1000): Promise<number> {
    try {
      const cleaned = await this.queue.clean(olderThanMs, 100, 'completed');
      console.log(`[AiMessageQueue] Cleaned ${cleaned.length} completed jobs`);
      return cleaned.length;
    } catch (error) {
      console.error('[AiMessageQueue] Failed to clean completed jobs:', error);
      throw error;
    }
  }

  /**
   * Clean failed jobs older than specified time
   */
  async cleanFailed(olderThanMs: number = 7 * 24 * 60 * 60 * 1000): Promise<number> {
    try {
      const cleaned = await this.queue.clean(olderThanMs, 50, 'failed');
      console.log(`[AiMessageQueue] Cleaned ${cleaned.length} failed jobs`);
      return cleaned.length;
    } catch (error) {
      console.error('[AiMessageQueue] Failed to clean failed jobs:', error);
      throw error;
    }
  }

  /**
   * Get the queue instance for advanced operations
   */
  getQueue(): Queue<AiMessageJobData> {
    return this.queue;
  }

  /**
   * Close the queue connection
   */
  async close(): Promise<void> {
    try {
      await this.queue.close();
      console.log('[AiMessageQueue] Queue closed');
    } catch (error) {
      console.error('[AiMessageQueue] Failed to close queue:', error);
      throw error;
    }
  }

  /**
   * Setup event listeners for monitoring
   */
  private setupEventListeners(): void {
    this.queue.on('error', (error: Error) => {
      console.error('[AiMessageQueue] Queue error:', error);
    });

    // Note: BullMQ Queue events are limited. For job events, use QueueEvents
    // For now, we'll just set up basic error handling
    console.log('[AiMessageQueue] Event listeners initialized');
  }
}

// Singleton instance
let aiMessageQueueInstance: AiMessageQueueService | null = null;

export function getAiMessageQueueService(): AiMessageQueueService {
  if (!aiMessageQueueInstance) {
    aiMessageQueueInstance = new AiMessageQueueService();
  }
  return aiMessageQueueInstance;
}

// Reset singleton for testing
export function resetAiMessageQueueService(): void {
  aiMessageQueueInstance = null;
}