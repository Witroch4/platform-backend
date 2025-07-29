import { Queue } from 'bullmq';
import { connection } from '../redis';

export const INSTAGRAM_TRANSLATION_QUEUE_NAME = 'instagram-translation';

export interface InstagramTranslationJobData {
  intentName: string;
  inboxId: string;
  contactPhone: string;
  conversationId: string;
  originalPayload: any;
  correlationId: string;
  metadata?: {
    timestamp: Date;
    retryCount?: number;
  };
}

export interface InstagramTranslationResult {
  success: boolean;
  fulfillmentMessages?: any[];
  error?: string;
  processingTime: number;
}

// Instagram translation queue
export const instagramTranslationQueue = new Queue<InstagramTranslationJobData>(
  INSTAGRAM_TRANSLATION_QUEUE_NAME,
  {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { 
        type: 'exponential', 
        delay: 2000 
      },
      removeOnComplete: 100,
      removeOnFail: 50,
      delay: 0, // No initial delay
    }
  }
);

/**
 * Add Instagram translation job to queue
 */
export async function addInstagramTranslationJob(
  data: InstagramTranslationJobData
): Promise<string> {
  const jobName = `instagram-translation-${data.correlationId}`;
  
  try {
    const job = await instagramTranslationQueue.add(jobName, {
      ...data,
      metadata: {
        timestamp: new Date(),
        retryCount: 0,
        ...data.metadata,
      }
    }, {
      jobId: data.correlationId, // Use correlation ID as job ID for easy lookup
      priority: 10, // High priority for user-facing responses
    });
    
    console.log(`[Instagram Translation Queue] Job enqueued: ${jobName}`, {
      correlationId: data.correlationId,
      intentName: data.intentName,
      inboxId: data.inboxId,
      contactPhone: data.contactPhone,
    });
    
    return job.id!;
  } catch (error) {
    console.error(`[Instagram Translation Queue] Failed to enqueue job: ${jobName}`, error);
    throw error;
  }
}

/**
 * Create Instagram translation job data
 */
export function createInstagramTranslationJob(data: {
  intentName: string;
  inboxId: string;
  contactPhone: string;
  conversationId: string;
  originalPayload: any;
  correlationId: string;
}): InstagramTranslationJobData {
  return {
    intentName: data.intentName,
    inboxId: data.inboxId,
    contactPhone: data.contactPhone,
    conversationId: data.conversationId,
    originalPayload: data.originalPayload,
    correlationId: data.correlationId,
    metadata: {
      timestamp: new Date(),
      retryCount: 0,
    },
  };
}

/**
 * Get job result by correlation ID
 */
export async function getInstagramTranslationResult(
  correlationId: string
): Promise<InstagramTranslationResult | null> {
  try {
    const job = await instagramTranslationQueue.getJob(correlationId);
    
    if (!job) {
      return null;
    }
    
    // Check if job is completed
    if (await job.isCompleted()) {
      const result = job.returnvalue as InstagramTranslationResult;
      return result;
    }
    
    // Check if job failed
    if (await job.isFailed()) {
      return {
        success: false,
        error: job.failedReason || 'Job failed with unknown error',
        processingTime: 0,
      };
    }
    
    // Job is still processing
    return null;
  } catch (error) {
    console.error(`[Instagram Translation Queue] Error getting job result for ${correlationId}:`, error);
    return {
      success: false,
      error: 'Failed to retrieve job result',
      processingTime: 0,
    };
  }
}

/**
 * Wait for job completion with timeout
 */
export async function waitForInstagramTranslationResult(
  correlationId: string,
  timeoutMs: number = 4500
): Promise<InstagramTranslationResult> {
  const startTime = Date.now();
  
  return new Promise((resolve) => {
    const checkInterval = setInterval(async () => {
      const elapsed = Date.now() - startTime;
      
      // Check for timeout
      if (elapsed >= timeoutMs) {
        clearInterval(checkInterval);
        resolve({
          success: false,
          error: 'Translation timeout - response took too long',
          processingTime: elapsed,
        });
        return;
      }
      
      try {
        const result = await getInstagramTranslationResult(correlationId);
        
        if (result !== null) {
          clearInterval(checkInterval);
          resolve(result);
        }
      } catch (error) {
        clearInterval(checkInterval);
        resolve({
          success: false,
          error: `Error checking job status: ${error instanceof Error ? error.message : error}`,
          processingTime: elapsed,
        });
      }
    }, 100); // Check every 100ms
  });
}

/**
 * Enhanced correlation ID generation with timestamp and random components
 */
export function generateCorrelationId(): string {
  const timestamp = Date.now();
  const randomPart = Math.random().toString(36).substr(2, 9);
  const processId = process.pid.toString(36);
  
  return `ig-${timestamp}-${processId}-${randomPart}`;
}

/**
 * Enhanced logging function with correlation ID support
 */
export function logWithCorrelationId(
  level: 'info' | 'warn' | 'error' | 'debug',
  message: string,
  correlationId?: string,
  additionalData?: any
): void {
  const logData = {
    timestamp: new Date().toISOString(),
    level: level.toUpperCase(),
    message,
    correlationId: correlationId || 'unknown',
    ...additionalData,
  };
  
  const logMessage = `[Instagram Translation] [${logData.level}] [${logData.correlationId}] ${logData.message}`;
  
  switch (level) {
    case 'error':
      console.error(logMessage, additionalData ? logData : '');
      break;
    case 'warn':
      console.warn(logMessage, additionalData ? logData : '');
      break;
    case 'debug':
      console.debug(logMessage, additionalData ? logData : '');
      break;
    default:
      console.log(logMessage, additionalData ? logData : '');
  }
}