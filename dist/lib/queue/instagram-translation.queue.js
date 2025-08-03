"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.instagramTranslationQueue = exports.INSTAGRAM_TRANSLATION_QUEUE_NAME = void 0;
exports.addInstagramTranslationJob = addInstagramTranslationJob;
exports.createInstagramTranslationJob = createInstagramTranslationJob;
exports.getInstagramTranslationResult = getInstagramTranslationResult;
exports.waitForInstagramTranslationResult = waitForInstagramTranslationResult;
exports.generateCorrelationId = generateCorrelationId;
exports.logWithCorrelationId = logWithCorrelationId;
exports.createErrorResult = createErrorResult;
exports.createSuccessResult = createSuccessResult;
exports.getQueueHealth = getQueueHealth;
exports.cleanupOldJobs = cleanupOldJobs;
const bullmq_1 = require("bullmq");
const redis_1 = require("../redis");
exports.INSTAGRAM_TRANSLATION_QUEUE_NAME = 'instagram-translation';
// Enhanced retry configuration with exponential backoff
const RETRY_CONFIG = {
    attempts: 3,
    backoff: {
        type: 'exponential',
        delay: 2000, // Start with 2 seconds
        settings: {
            multiplier: 2, // Double the delay each time
            maxDelay: 30000, // Max 30 seconds
            jitter: true, // Add randomness to prevent thundering herd
        },
    },
    removeOnComplete: 100,
    removeOnFail: 50,
    delay: 0, // No initial delay
};
// Instagram translation queue
exports.instagramTranslationQueue = new bullmq_1.Queue(exports.INSTAGRAM_TRANSLATION_QUEUE_NAME, {
    connection: redis_1.connection,
    defaultJobOptions: RETRY_CONFIG,
});
/**
 * Add Instagram translation job to queue with comprehensive error handling
 */
async function addInstagramTranslationJob(data) {
    const jobName = `instagram-translation-${data.correlationId}`;
    try {
        // Validate job data before adding to queue
        if (!data.correlationId || !data.intentName || !data.inboxId) {
            throw new Error('Missing required job data fields');
        }
        // Check if job already exists to prevent duplicates
        const existingJob = await exports.instagramTranslationQueue.getJob(data.correlationId);
        if (existingJob && !await existingJob.isCompleted() && !await existingJob.isFailed()) {
            logWithCorrelationId('warn', 'Job already exists in queue', data.correlationId, {
                jobId: existingJob.id,
                jobName,
            });
            return existingJob.id;
        }
        const job = await exports.instagramTranslationQueue.add(jobName, {
            ...data,
            metadata: {
                timestamp: new Date(),
                retryCount: 0,
                ...data.metadata,
            }
        }, {
            jobId: data.correlationId, // Use correlation ID as job ID for easy lookup
            priority: 10, // High priority for user-facing responses
            // Add job-specific retry configuration for critical jobs
            attempts: data.metadata?.critical ? 5 : RETRY_CONFIG.attempts,
            backoff: RETRY_CONFIG.backoff,
        });
        logWithCorrelationId('info', 'Job enqueued successfully', data.correlationId, {
            jobId: job.id,
            jobName,
            intentName: data.intentName,
            inboxId: data.inboxId,
            priority: 10,
        });
        return job.id;
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logWithCorrelationId('error', 'Failed to enqueue job', data.correlationId, {
            jobName,
            error: errorMessage,
            intentName: data.intentName,
            inboxId: data.inboxId,
        });
        // Wrap in a more specific error
        throw new Error(`Failed to enqueue Instagram translation job: ${errorMessage}`);
    }
}
/**
 * Create Instagram translation job data
 */
function createInstagramTranslationJob(data) {
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
 * Get job result by correlation ID with enhanced error handling
 */
async function getInstagramTranslationResult(correlationId) {
    try {
        if (!correlationId || typeof correlationId !== 'string') {
            logWithCorrelationId('error', 'Invalid correlation ID provided', correlationId);
            return {
                success: false,
                error: 'Invalid correlation ID',
                processingTime: 0,
            };
        }
        const job = await exports.instagramTranslationQueue.getJob(correlationId);
        if (!job) {
            logWithCorrelationId('debug', 'Job not found in queue', correlationId);
            return null;
        }
        // Check if job is completed
        if (await job.isCompleted()) {
            const result = job.returnvalue;
            logWithCorrelationId('debug', 'Job completed successfully', correlationId, {
                processingTime: result.processingTime,
                success: result.success,
            });
            return result;
        }
        // Check if job failed
        if (await job.isFailed()) {
            const failedReason = job.failedReason || 'Job failed with unknown error';
            const attemptsMade = job.attemptsMade || 0;
            const maxAttempts = job.opts?.attempts || RETRY_CONFIG.attempts;
            logWithCorrelationId('error', 'Job failed after all attempts', correlationId, {
                failedReason,
                attemptsMade,
                maxAttempts,
                finishedOn: job.finishedOn,
            });
            return {
                success: false,
                error: `Job failed after ${attemptsMade}/${maxAttempts} attempts: ${failedReason}`,
                processingTime: job.finishedOn ? job.finishedOn - (job.processedOn || job.timestamp) : 0,
                metadata: {
                    attemptsMade,
                    maxAttempts,
                    failedReason,
                },
            };
        }
        // Check if job is active (being processed)
        if (await job.isActive()) {
            logWithCorrelationId('debug', 'Job is currently being processed', correlationId, {
                processedOn: job.processedOn,
            });
            return null;
        }
        // Check if job is waiting
        if (await job.isWaiting()) {
            logWithCorrelationId('debug', 'Job is waiting in queue', correlationId, {
                timestamp: job.timestamp,
            });
            return null;
        }
        // Job is in unknown state
        logWithCorrelationId('warn', 'Job in unknown state', correlationId, {
            jobId: job.id,
            timestamp: job.timestamp,
        });
        return null;
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logWithCorrelationId('error', 'Error getting job result', correlationId, {
            error: errorMessage,
        });
        return {
            success: false,
            error: `Failed to retrieve job result: ${errorMessage}`,
            processingTime: 0,
        };
    }
}
/**
 * Wait for job completion with timeout and exponential backoff polling
 */
async function waitForInstagramTranslationResult(correlationId, timeoutMs = 4500) {
    const startTime = Date.now();
    let pollInterval = 50; // Start with 50ms
    const maxPollInterval = 500; // Max 500ms between polls
    const pollMultiplier = 1.2; // Increase poll interval by 20% each time
    logWithCorrelationId('debug', 'Starting to wait for job result', correlationId, {
        timeoutMs,
        initialPollInterval: pollInterval,
    });
    return new Promise((resolve) => {
        let timeoutHandle;
        let pollHandle;
        const cleanup = () => {
            if (timeoutHandle)
                clearTimeout(timeoutHandle);
            if (pollHandle)
                clearTimeout(pollHandle);
        };
        const poll = async () => {
            const elapsed = Date.now() - startTime;
            try {
                const result = await getInstagramTranslationResult(correlationId);
                if (result !== null) {
                    cleanup();
                    logWithCorrelationId('debug', 'Job result received', correlationId, {
                        elapsed,
                        success: result.success,
                    });
                    resolve(result);
                    return;
                }
                // Schedule next poll with exponential backoff
                pollInterval = Math.min(pollInterval * pollMultiplier, maxPollInterval);
                pollHandle = setTimeout(poll, pollInterval);
            }
            catch (error) {
                cleanup();
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                logWithCorrelationId('error', 'Error while polling for job result', correlationId, {
                    error: errorMessage,
                    elapsed,
                });
                resolve({
                    success: false,
                    error: `Error checking job status: ${errorMessage}`,
                    processingTime: elapsed,
                });
            }
        };
        // Set up timeout
        timeoutHandle = setTimeout(() => {
            cleanup();
            const elapsed = Date.now() - startTime;
            logWithCorrelationId('warn', 'Job result wait timed out', correlationId, {
                elapsed,
                timeoutMs,
            });
            resolve({
                success: false,
                error: `Translation timeout - response took longer than ${timeoutMs}ms`,
                processingTime: elapsed,
                metadata: {
                    timedOut: true,
                    timeoutMs,
                },
            });
        }, timeoutMs);
        // Start polling
        poll();
    });
}
/**
 * Enhanced correlation ID generation with timestamp and random components
 */
function generateCorrelationId() {
    const timestamp = Date.now();
    const randomPart = Math.random().toString(36).substr(2, 9);
    const processId = process.pid.toString(36);
    return `ig-${timestamp}-${processId}-${randomPart}`;
}
/**
 * Enhanced logging function with correlation ID support
 */
function logWithCorrelationId(level, message, correlationId, additionalData) {
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
/**
 * Create error result for Instagram translation
 */
function createErrorResult(correlationId, error, errorCode, processingTime) {
    return {
        success: false,
        error,
        processingTime,
        metadata: {
            correlationId,
            errorCode,
            timestamp: new Date().toISOString(),
        },
    };
}
/**
 * Create success result for Instagram translation
 */
function createSuccessResult(correlationId, fulfillmentMessages, processingTime, metadata) {
    return {
        success: true,
        fulfillmentMessages,
        processingTime,
        metadata: {
            correlationId,
            timestamp: new Date().toISOString(),
            ...metadata,
        },
    };
}
/**
 * Get queue health information
 */
async function getQueueHealth() {
    try {
        const [waiting, active, completed, failed, delayed] = await Promise.all([
            exports.instagramTranslationQueue.getWaiting(),
            exports.instagramTranslationQueue.getActive(),
            exports.instagramTranslationQueue.getCompleted(),
            exports.instagramTranslationQueue.getFailed(),
            exports.instagramTranslationQueue.getDelayed(),
        ]);
        const counts = {
            waiting: waiting.length,
            active: active.length,
            completed: completed.length,
            failed: failed.length,
            delayed: delayed.length,
        };
        // Determine status based on counts
        let status = 'healthy';
        if (counts.failed > 10 || counts.active > 50) {
            status = 'warning';
        }
        if (counts.failed > 50 || counts.active > 100) {
            status = 'error';
        }
        return {
            name: exports.INSTAGRAM_TRANSLATION_QUEUE_NAME,
            counts,
            status,
            lastUpdated: new Date(),
        };
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logWithCorrelationId('error', 'Failed to get queue health', undefined, { error: errorMessage });
        return {
            name: exports.INSTAGRAM_TRANSLATION_QUEUE_NAME,
            counts: { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 },
            status: 'error',
            lastUpdated: new Date(),
            error: errorMessage,
        };
    }
}
/**
 * Clean up old completed and failed jobs
 */
async function cleanupOldJobs() {
    try {
        // Clean completed jobs older than 1 hour, keep last 100
        await exports.instagramTranslationQueue.clean(60 * 60 * 1000, 100, 'completed');
        // Clean failed jobs older than 24 hours, keep last 50
        await exports.instagramTranslationQueue.clean(24 * 60 * 60 * 1000, 50, 'failed');
        logWithCorrelationId('info', 'Old jobs cleaned up successfully');
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logWithCorrelationId('error', 'Failed to clean up old jobs', undefined, { error: errorMessage });
    }
}
