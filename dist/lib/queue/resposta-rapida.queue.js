"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.respostaRapidaDeadLetterQueue = exports.respostaRapidaQueue = exports.RESPOSTA_RAPIDA_QUEUE_NAME = void 0;
exports.addRespostaRapidaJob = addRespostaRapidaJob;
exports.createIntentJob = createIntentJob;
exports.createButtonJob = createButtonJob;
exports.generateCorrelationId = generateCorrelationId;
exports.handleJobFailure = handleJobFailure;
exports.getQueueHealth = getQueueHealth;
exports.cleanupOldJobs = cleanupOldJobs;
const bullmq_1 = require("bullmq");
const redis_1 = require("../redis");
exports.RESPOSTA_RAPIDA_QUEUE_NAME = 'resposta-rapida';
// High priority queue configuration for user responses
exports.respostaRapidaQueue = new bullmq_1.Queue(exports.RESPOSTA_RAPIDA_QUEUE_NAME, {
    connection: redis_1.connection,
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
});
// Dead letter queue for failed high priority jobs
exports.respostaRapidaDeadLetterQueue = new bullmq_1.Queue(`${exports.RESPOSTA_RAPIDA_QUEUE_NAME}-dead-letter`, {
    connection: redis_1.connection,
    defaultJobOptions: {
        // Keep failed jobs longer for analysis
        removeOnComplete: 10,
        removeOnFail: 100,
    }
});
// Add job to high priority queue with correlation ID tracking
async function addRespostaRapidaJob(jobData, options) {
    const jobName = `resposta-${jobData.data.interactionType}-${jobData.data.correlationId}`;
    try {
        const job = await exports.respostaRapidaQueue.add(jobName, jobData, {
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
    }
    catch (error) {
        console.error(`[Resposta Rapida] Failed to enqueue job: ${jobName}`, {
            error: error instanceof Error ? error.message : error,
            correlationId: jobData.data.correlationId,
        });
        throw error;
    }
}
// Helper function to create intent processing job
function createIntentJob(data) {
    return {
        type: 'processarResposta',
        data: {
            ...data,
            interactionType: 'intent',
        },
    };
}
// Helper function to create button click processing job
function createButtonJob(data) {
    return {
        type: 'processarResposta',
        data: {
            ...data,
            interactionType: 'button_reply',
        },
    };
}
// Generate correlation ID for request tracing
function generateCorrelationId() {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 9);
    return `${timestamp}-${random}`;
}
// Job failure handler - moves failed jobs to dead letter queue
async function handleJobFailure(job, error) {
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
            await exports.respostaRapidaDeadLetterQueue.add(`dead-letter-${job.name}`, job.data, {
                // Add failure metadata
                delay: 0,
                removeOnComplete: 10,
                removeOnFail: 100,
            });
            console.log(`[Resposta Rapida] Job moved to dead letter queue: ${job.name}`, {
                jobId: job.id,
                correlationId: job.data.data.correlationId,
            });
        }
        catch (dlqError) {
            console.error(`[Resposta Rapida] Failed to move job to dead letter queue: ${job.name}`, {
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
        exports.respostaRapidaQueue.getWaiting(),
        exports.respostaRapidaQueue.getActive(),
        exports.respostaRapidaQueue.getCompleted(),
        exports.respostaRapidaQueue.getFailed(),
        exports.respostaRapidaQueue.getDelayed(),
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
        // Clean completed jobs older than 1 hour
        await exports.respostaRapidaQueue.clean(60 * 60 * 1000, 50, 'completed');
        // Clean failed jobs older than 24 hours
        await exports.respostaRapidaQueue.clean(24 * 60 * 60 * 1000, 25, 'failed');
        console.log('[Resposta Rapida] Old jobs cleaned up successfully');
    }
    catch (error) {
        console.error('[Resposta Rapida] Failed to clean up old jobs:', error);
    }
}
