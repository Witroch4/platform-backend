import { Queue, Job } from 'bullmq';
import { connection } from '../redis';

export const RESPOSTA_RAPIDA_QUEUE_NAME = 'resposta-rapida';

// Job interfaces for high priority user response processing
export interface RespostaRapidaJobData {
  type: 'processarResposta';
  data: {
    inboxId: string;
    contactPhone: string;
    interactionType: 'button_reply' | 'intent';
    buttonId?: string;
    intentName?: string;
    wamid: string;
    credentials: {
      token: string;
      phoneNumberId: string;
      businessId: string;
    };
    correlationId: string;
    // Additional context data
    messageId?: number;
    accountId?: number;
    accountName?: string;
    contactSource?: string;
  };
}

// High priority queue configuration for user responses
export const respostaRapidaQueue = new Queue<RespostaRapidaJobData>(
  RESPOSTA_RAPIDA_QUEUE_NAME,
  {
    connection,
    defaultJobOptions: {
      // High priority processing
      priority: 100,
      // Aggressive retry policy for user-facing responses
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 1000, // Start with 1 second delay
      },
      // Keep fewer completed jobs to save memory
      removeOnComplete: 50,
      removeOnFail: 25,
      // No initial delay for immediate processing
      delay: 0,
      // Job timeout handled by worker implementation
    }
  }
);

// Dead letter queue for failed high priority jobs
export const respostaRapidaDeadLetterQueue = new Queue<RespostaRapidaJobData>(
  `${RESPOSTA_RAPIDA_QUEUE_NAME}-dead-letter`,
  {
    connection,
    defaultJobOptions: {
      // Keep failed jobs longer for analysis
      removeOnComplete: 10,
      removeOnFail: 100,
    }
  }
);

// Add job to high priority queue with correlation ID tracking
export async function addRespostaRapidaJob(
  jobData: RespostaRapidaJobData,
  options?: {
    priority?: number;
    delay?: number;
    correlationId?: string;
  }
): Promise<Job<RespostaRapidaJobData, any, string>> {
  const jobName = `resposta-${jobData.data.interactionType}-${jobData.data.correlationId}`;
  
  try {
    const job = await respostaRapidaQueue.add(jobName, jobData, {
      // Override priority if specified
      priority: options?.priority || 100,
      delay: options?.delay || 0,
      // Use correlation ID as job ID for tracing
      jobId: `${jobName}-${jobData.data.correlationId}`,
      // Add metadata for monitoring
      ...options,
    });

    console.log(`[Resposta Rapida] Job enqueued: ${jobName}`, {
      correlationId: jobData.data.correlationId,
      interactionType: jobData.data.interactionType,
      contactPhone: jobData.data.contactPhone,
      inboxId: jobData.data.inboxId,
      jobId: job.id,
    });

    return job;
  } catch (error) {
    console.error(`[Resposta Rapida] Failed to enqueue job: ${jobName}`, {
      error: error instanceof Error ? error.message : error,
      correlationId: jobData.data.correlationId,
    });
    throw error;
  }
}

// Helper function to create intent processing job
export function createIntentJob(data: {
  inboxId: string;
  contactPhone: string;
  intentName: string;
  wamid: string;
  credentials: {
    token: string;
    phoneNumberId: string;
    businessId: string;
  };
  correlationId: string;
  messageId?: number;
  accountId?: number;
  accountName?: string;
  contactSource?: string;
}): RespostaRapidaJobData {
  return {
    type: 'processarResposta',
    data: {
      ...data,
      interactionType: 'intent',
    },
  };
}

// Helper function to create button click processing job
export function createButtonJob(data: {
  inboxId: string;
  contactPhone: string;
  buttonId: string;
  wamid: string;
  credentials: {
    token: string;
    phoneNumberId: string;
    businessId: string;
  };
  correlationId: string;
  messageId?: number;
  accountId?: number;
  accountName?: string;
  contactSource?: string;
}): RespostaRapidaJobData {
  return {
    type: 'processarResposta',
    data: {
      ...data,
      interactionType: 'button_reply',
    },
  };
}

// Generate correlation ID for request tracing
export function generateCorrelationId(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substr(2, 9);
  return `${timestamp}-${random}`;
}

// Job failure handler - moves failed jobs to dead letter queue
export async function handleJobFailure(
  job: Job<RespostaRapidaJobData>,
  error: Error
): Promise<void> {
  console.error(`[Resposta Rapida] Job failed: ${job.name}`, {
    jobId: job.id,
    correlationId: job.data.data.correlationId,
    error: error.message,
    attemptsMade: job.attemptsMade,
    maxAttempts: job.opts.attempts,
  });

  // If job has exhausted all retries, move to dead letter queue
  if (job.attemptsMade >= (job.opts.attempts || 3)) {
    try {
      await respostaRapidaDeadLetterQueue.add(
        `dead-letter-${job.name}`,
        job.data,
        {
          // Add failure metadata
          delay: 0,
          removeOnComplete: 10,
          removeOnFail: 100,
        }
      );

      console.log(`[Resposta Rapida] Job moved to dead letter queue: ${job.name}`, {
        jobId: job.id,
        correlationId: job.data.data.correlationId,
      });
    } catch (dlqError) {
      console.error(`[Resposta Rapida] Failed to move job to dead letter queue: ${job.name}`, {
        jobId: job.id,
        correlationId: job.data.data.correlationId,
        error: dlqError instanceof Error ? dlqError.message : dlqError,
      });
    }
  }
}

// Queue health monitoring
export async function getQueueHealth(): Promise<{
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}> {
  const [waiting, active, completed, failed, delayed] = await Promise.all([
    respostaRapidaQueue.getWaiting(),
    respostaRapidaQueue.getActive(),
    respostaRapidaQueue.getCompleted(),
    respostaRapidaQueue.getFailed(),
    respostaRapidaQueue.getDelayed(),
  ]);

  return {
    waiting: waiting.length,
    active: active.length,
    completed: completed.length,
    failed: failed.length,
    delayed: delayed.length,
  };
}

// Clean up old jobs periodically
export async function cleanupOldJobs(): Promise<void> {
  try {
    // Clean completed jobs older than 1 hour
    await respostaRapidaQueue.clean(60 * 60 * 1000, 50, 'completed');
    
    // Clean failed jobs older than 24 hours
    await respostaRapidaQueue.clean(24 * 60 * 60 * 1000, 25, 'failed');
    
    console.log('[Resposta Rapida] Old jobs cleaned up successfully');
  } catch (error) {
    console.error('[Resposta Rapida] Failed to clean up old jobs:', error);
  }
}