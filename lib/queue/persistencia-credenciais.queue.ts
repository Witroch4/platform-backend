import { Queue, Job } from 'bullmq';
import { connection } from '../redis';

export const PERSISTENCIA_CREDENCIAIS_QUEUE_NAME = 'persistencia-credenciais';

// Job interfaces for low priority data persistence
export interface PersistenciaCredenciaisJobData {
  type: 'atualizarCredenciais' | 'atualizarLead' | 'batchUpdate';
  data: {
    inboxId: string;
    whatsappApiKey: string;
    phoneNumberId: string;
    businessId: string;
    contactSource: string;
    leadData: {
      messageId: number;
      accountId: number;
      accountName: string;
      contactPhone: string;
      wamid: string;
    };
    correlationId: string;
    // Batch processing data
    batchItems?: Array<{
      inboxId: string;
      credentials: {
        whatsappApiKey: string;
        phoneNumberId: string;
        businessId: string;
      };
      leadData: any;
    }>;
  };
}

// Low priority queue configuration for data persistence
export const persistenciaCredenciaisQueue = new Queue<PersistenciaCredenciaisJobData>(
  PERSISTENCIA_CREDENCIAIS_QUEUE_NAME,
  {
    connection,
    defaultJobOptions: {
      // Low priority processing
      priority: 1,
      // More lenient retry policy for background tasks
      attempts: 5,
      backoff: {
        type: 'exponential',
        delay: 5000, // Start with 5 second delay
      },
      // Keep more completed jobs for audit trail
      removeOnComplete: 200,
      removeOnFail: 100,
      // Allow some delay for batching
      delay: 1000,
      // Job timeout handled by worker implementation
    }
  }
);

// Dead letter queue for failed persistence jobs
export const persistenciaCredenciaisDeadLetterQueue = new Queue<PersistenciaCredenciaisJobData>(
  `${PERSISTENCIA_CREDENCIAIS_QUEUE_NAME}-dead-letter`,
  {
    connection,
    defaultJobOptions: {
      // Keep failed jobs longer for analysis
      removeOnComplete: 50,
      removeOnFail: 500,
    }
  }
);

// Add job to low priority queue
export async function addPersistenciaCredenciaisJob(
  jobData: PersistenciaCredenciaisJobData,
  options?: {
    priority?: number;
    delay?: number;
    batchId?: string;
  }
): Promise<Job<PersistenciaCredenciaisJobData, any, string>> {
  const jobName = `persistencia-${jobData.type}-${jobData.data.correlationId}`;
  
  try {
    const job = await persistenciaCredenciaisQueue.add(jobName, jobData, {
      // Override priority if specified (still low priority range)
      priority: options?.priority || 1,
      delay: options?.delay || 1000,
      // Use correlation ID and batch ID for tracing
      jobId: options?.batchId 
        ? `${jobName}-batch-${options.batchId}` 
        : `${jobName}-${jobData.data.correlationId}`,
      // Add metadata for monitoring
      ...options,
    });

    console.log(`[Persistencia Credenciais] Job enqueued: ${jobName}`, {
      correlationId: jobData.data.correlationId,
      type: jobData.type,
      inboxId: jobData.data.inboxId,
      jobId: job.id,
      batchId: options?.batchId,
    });

    return job;
  } catch (error) {
    console.error(`[Persistencia Credenciais] Failed to enqueue job: ${jobName}`, {
      error: error instanceof Error ? error.message : error,
      correlationId: jobData.data.correlationId,
    });
    throw error;
  }
}

// Helper function to create credentials update job
export function createCredentialsUpdateJob(data: {
  inboxId: string;
  whatsappApiKey: string;
  phoneNumberId: string;
  businessId: string;
  contactSource: string;
  leadData: {
    messageId: number;
    accountId: number;
    accountName: string;
    contactPhone: string;
    wamid: string;
  };
  correlationId: string;
}): PersistenciaCredenciaisJobData {
  return {
    type: 'atualizarCredenciais',
    data,
  };
}

// Helper function to create lead update job
export function createLeadUpdateJob(data: {
  inboxId: string;
  whatsappApiKey: string;
  phoneNumberId: string;
  businessId: string;
  contactSource: string;
  leadData: {
    messageId: number;
    accountId: number;
    accountName: string;
    contactPhone: string;
    wamid: string;
  };
  correlationId: string;
}): PersistenciaCredenciaisJobData {
  return {
    type: 'atualizarLead',
    data,
  };
}

// Helper function to create batch update job
export function createBatchUpdateJob(data: {
  batchItems: Array<{
    inboxId: string;
    credentials: {
      whatsappApiKey: string;
      phoneNumberId: string;
      businessId: string;
    };
    leadData: any;
  }>;
  correlationId: string;
}): PersistenciaCredenciaisJobData {
  return {
    type: 'batchUpdate',
    data: {
      // Use first item's data for required fields
      inboxId: data.batchItems[0]?.inboxId || '',
      whatsappApiKey: data.batchItems[0]?.credentials.whatsappApiKey || '',
      phoneNumberId: data.batchItems[0]?.credentials.phoneNumberId || '',
      businessId: data.batchItems[0]?.credentials.businessId || '',
      contactSource: 'batch',
      leadData: {
        messageId: 0,
        accountId: 0,
        accountName: 'batch',
        contactPhone: 'batch',
        wamid: 'batch',
      },
      correlationId: data.correlationId,
      batchItems: data.batchItems,
    },
  };
}

// Batch processing helper - collects jobs for efficient processing
export class BatchProcessor {
  private batchItems: Array<{
    inboxId: string;
    credentials: {
      whatsappApiKey: string;
      phoneNumberId: string;
      businessId: string;
    };
    leadData: any;
  }> = [];
  
  private batchTimeout: NodeJS.Timeout | null = null;
  private readonly maxBatchSize = 10;
  private readonly batchTimeoutMs = 5000; // 5 seconds

  constructor() {
    this.processBatch = this.processBatch.bind(this);
  }

  // Add item to batch
  addToBatch(item: {
    inboxId: string;
    credentials: {
      whatsappApiKey: string;
      phoneNumberId: string;
      businessId: string;
    };
    leadData: any;
  }): void {
    this.batchItems.push(item);

    // Process batch if it reaches max size
    if (this.batchItems.length >= this.maxBatchSize) {
      this.processBatch();
      return;
    }

    // Set timeout to process batch if it's the first item
    if (this.batchItems.length === 1) {
      this.batchTimeout = setTimeout(this.processBatch, this.batchTimeoutMs);
    }
  }

  // Process current batch
  private async processBatch(): Promise<void> {
    if (this.batchItems.length === 0) return;

    // Clear timeout
    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout);
      this.batchTimeout = null;
    }

    // Create batch job
    const batchJob = createBatchUpdateJob({
      batchItems: [...this.batchItems],
      correlationId: `batch-${Date.now()}`,
    });

    // Clear current batch
    this.batchItems = [];

    try {
      await addPersistenciaCredenciaisJob(batchJob, {
        batchId: batchJob.data.correlationId,
      });
    } catch (error) {
      console.error('[Persistencia Credenciais] Failed to process batch:', error);
    }
  }

  // Force process current batch
  async flush(): Promise<void> {
    await this.processBatch();
  }
}

// Global batch processor instance
export const globalBatchProcessor = new BatchProcessor();

// Job failure handler - moves failed jobs to dead letter queue
export async function handleJobFailure(
  job: Job<PersistenciaCredenciaisJobData>,
  error: Error
): Promise<void> {
  console.error(`[Persistencia Credenciais] Job failed: ${job.name}`, {
    jobId: job.id,
    correlationId: job.data.data.correlationId,
    error: error.message,
    attemptsMade: job.attemptsMade,
    maxAttempts: job.opts.attempts,
  });

  // If job has exhausted all retries, move to dead letter queue
  if (job.attemptsMade >= (job.opts.attempts || 5)) {
    try {
      await persistenciaCredenciaisDeadLetterQueue.add(
        `dead-letter-${job.name}`,
        job.data,
        {
          // Add failure metadata
          delay: 0,
          removeOnComplete: 50,
          removeOnFail: 500,
        }
      );

      console.log(`[Persistencia Credenciais] Job moved to dead letter queue: ${job.name}`, {
        jobId: job.id,
        correlationId: job.data.data.correlationId,
      });
    } catch (dlqError) {
      console.error(`[Persistencia Credenciais] Failed to move job to dead letter queue: ${job.name}`, {
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
    persistenciaCredenciaisQueue.getWaiting(),
    persistenciaCredenciaisQueue.getActive(),
    persistenciaCredenciaisQueue.getCompleted(),
    persistenciaCredenciaisQueue.getFailed(),
    persistenciaCredenciaisQueue.getDelayed(),
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
    // Clean completed jobs older than 24 hours
    await persistenciaCredenciaisQueue.clean(24 * 60 * 60 * 1000, 200, 'completed');
    
    // Clean failed jobs older than 7 days
    await persistenciaCredenciaisQueue.clean(7 * 24 * 60 * 60 * 1000, 100, 'failed');
    
    console.log('[Persistencia Credenciais] Old jobs cleaned up successfully');
  } catch (error) {
    console.error('[Persistencia Credenciais] Failed to clean up old jobs:', error);
  }
}

// Schedule periodic cleanup (call this from your main application)
export function schedulePeriodicCleanup(): void {
  // Clean up every hour
  setInterval(cleanupOldJobs, 60 * 60 * 1000);
  
  // Flush batch processor every 30 seconds
  setInterval(() => {
    globalBatchProcessor.flush();
  }, 30 * 1000);
}