"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.globalBatchProcessor = exports.BatchProcessor = exports.persistenciaCredenciaisDeadLetterQueue = exports.persistenciaCredenciaisQueue = exports.PERSISTENCIA_CREDENCIAIS_QUEUE_NAME = void 0;
exports.addPersistenciaCredenciaisJob = addPersistenciaCredenciaisJob;
exports.createCredentialsUpdateJob = createCredentialsUpdateJob;
exports.createLeadUpdateJob = createLeadUpdateJob;
exports.createBatchUpdateJob = createBatchUpdateJob;
exports.handleJobFailure = handleJobFailure;
exports.getQueueHealth = getQueueHealth;
exports.cleanupOldJobs = cleanupOldJobs;
exports.schedulePeriodicCleanup = schedulePeriodicCleanup;
const bullmq_1 = require("bullmq");
const redis_1 = require("../redis");
exports.PERSISTENCIA_CREDENCIAIS_QUEUE_NAME = 'persistencia-credenciais';
// Low priority queue configuration for data persistence
exports.persistenciaCredenciaisQueue = new bullmq_1.Queue(exports.PERSISTENCIA_CREDENCIAIS_QUEUE_NAME, {
    connection: redis_1.connection,
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
});
// Dead letter queue for failed persistence jobs
exports.persistenciaCredenciaisDeadLetterQueue = new bullmq_1.Queue(`${exports.PERSISTENCIA_CREDENCIAIS_QUEUE_NAME}-dead-letter`, {
    connection: redis_1.connection,
    defaultJobOptions: {
        // Keep failed jobs longer for analysis
        removeOnComplete: 50,
        removeOnFail: 500,
    }
});
// Add job to low priority queue
async function addPersistenciaCredenciaisJob(jobData, options) {
    const jobName = `persistencia-${jobData.type}-${jobData.data.correlationId}`;
    try {
        const job = await exports.persistenciaCredenciaisQueue.add(jobName, jobData, {
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
    }
    catch (error) {
        console.error(`[Persistencia Credenciais] Failed to enqueue job: ${jobName}`, {
            error: error instanceof Error ? error.message : error,
            correlationId: jobData.data.correlationId,
        });
        throw error;
    }
}
// Helper function to create credentials update job
function createCredentialsUpdateJob(data) {
    return {
        type: 'atualizarCredenciais',
        data,
    };
}
// Helper function to create lead update job
function createLeadUpdateJob(data) {
    return {
        type: 'atualizarLead',
        data,
    };
}
// Helper function to create batch update job
function createBatchUpdateJob(data) {
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
class BatchProcessor {
    batchItems = [];
    batchTimeout = null;
    maxBatchSize = 10;
    batchTimeoutMs = 5000; // 5 seconds
    constructor() {
        this.processBatch = this.processBatch.bind(this);
    }
    // Add item to batch
    addToBatch(item) {
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
    async processBatch() {
        if (this.batchItems.length === 0)
            return;
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
        }
        catch (error) {
            console.error('[Persistencia Credenciais] Failed to process batch:', error);
        }
    }
    // Force process current batch
    async flush() {
        await this.processBatch();
    }
}
exports.BatchProcessor = BatchProcessor;
// Global batch processor instance
exports.globalBatchProcessor = new BatchProcessor();
// Job failure handler - moves failed jobs to dead letter queue
async function handleJobFailure(job, error) {
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
            await exports.persistenciaCredenciaisDeadLetterQueue.add(`dead-letter-${job.name}`, job.data, {
                // Add failure metadata
                delay: 0,
                removeOnComplete: 50,
                removeOnFail: 500,
            });
            console.log(`[Persistencia Credenciais] Job moved to dead letter queue: ${job.name}`, {
                jobId: job.id,
                correlationId: job.data.data.correlationId,
            });
        }
        catch (dlqError) {
            console.error(`[Persistencia Credenciais] Failed to move job to dead letter queue: ${job.name}`, {
                jobId: job.id,
                correlationId: job.data.data.correlationId,
                error: dlqError instanceof Error ? dlqError.message : dlqError,
            });
        }
    }
}
// Queue health monitoring
async function getQueueHealth() {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
        exports.persistenciaCredenciaisQueue.getWaiting(),
        exports.persistenciaCredenciaisQueue.getActive(),
        exports.persistenciaCredenciaisQueue.getCompleted(),
        exports.persistenciaCredenciaisQueue.getFailed(),
        exports.persistenciaCredenciaisQueue.getDelayed(),
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
async function cleanupOldJobs() {
    try {
        // Clean completed jobs older than 24 hours
        await exports.persistenciaCredenciaisQueue.clean(24 * 60 * 60 * 1000, 200, 'completed');
        // Clean failed jobs older than 7 days
        await exports.persistenciaCredenciaisQueue.clean(7 * 24 * 60 * 60 * 1000, 100, 'failed');
        console.log('[Persistencia Credenciais] Old jobs cleaned up successfully');
    }
    catch (error) {
        console.error('[Persistencia Credenciais] Failed to clean up old jobs:', error);
    }
}
// Schedule periodic cleanup (call this from your main application)
function schedulePeriodicCleanup() {
    // Clean up every hour
    setInterval(cleanupOldJobs, 60 * 60 * 1000);
    // Flush batch processor every 30 seconds
    setInterval(() => {
        exports.globalBatchProcessor.flush();
    }, 30 * 1000);
}
