"use strict";
/**
 * Instagram Translation Communication Manager
 *
 * Manages communication between webhook and worker processes
 * using Redis Pub/Sub and job result storage
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.CHANNELS = exports.InstagramTranslationCommunicationManager = void 0;
exports.getCommunicationManager = getCommunicationManager;
exports.cleanupCommunicationManager = cleanupCommunicationManager;
const redis_1 = require("../redis");
const instagram_translation_queue_1 = require("../queue/instagram-translation.queue");
const events_1 = require("events");
// Communication channels
const CHANNELS = {
    JOB_COMPLETED: 'instagram-translation:job-completed',
    JOB_FAILED: 'instagram-translation:job-failed',
    JOB_PROGRESS: 'instagram-translation:job-progress',
    WORKER_HEALTH: 'instagram-translation:worker-health',
};
exports.CHANNELS = CHANNELS;
/**
 * Communication Manager for Instagram Translation
 */
class InstagramTranslationCommunicationManager extends events_1.EventEmitter {
    subscriber;
    publisher;
    isSubscribed = false;
    activeListeners = new Map();
    constructor() {
        super();
        // Use separate connections for pub/sub to avoid blocking
        this.subscriber = redis_1.connection.duplicate();
        this.publisher = redis_1.connection.duplicate();
        this.setupSubscriber();
    }
    /**
     * Setup Redis subscriber for communication channels
     */
    async setupSubscriber() {
        try {
            this.subscriber.on('message', this.handleMessage.bind(this));
            this.subscriber.on('error', (error) => {
                console.error('[Instagram Translation Communication] Subscriber error:', error);
                this.emit('error', error);
            });
            await this.subscriber.subscribe(CHANNELS.JOB_COMPLETED, CHANNELS.JOB_FAILED, CHANNELS.JOB_PROGRESS, CHANNELS.WORKER_HEALTH);
            this.isSubscribed = true;
            console.log('[Instagram Translation Communication] Subscribed to communication channels');
        }
        catch (error) {
            console.error('[Instagram Translation Communication] Failed to setup subscriber:', error);
            throw error;
        }
    }
    /**
     * Handle incoming messages from Redis channels
     */
    handleMessage(channel, message) {
        try {
            const data = JSON.parse(message);
            switch (channel) {
                case CHANNELS.JOB_COMPLETED:
                    this.handleJobCompleted(data);
                    break;
                case CHANNELS.JOB_FAILED:
                    this.handleJobFailed(data);
                    break;
                case CHANNELS.JOB_PROGRESS:
                    this.handleJobProgress(data);
                    break;
                case CHANNELS.WORKER_HEALTH:
                    this.handleWorkerHealth(data);
                    break;
                default:
                    console.warn(`[Instagram Translation Communication] Unknown channel: ${channel}`);
            }
        }
        catch (error) {
            console.error(`[Instagram Translation Communication] Failed to parse message from ${channel}:`, error);
        }
    }
    /**
     * Handle job completion messages
     */
    handleJobCompleted(message) {
        console.log(`[Instagram Translation Communication] Job completed: ${message.correlationId}`);
        this.emit('job-completed', message);
        this.cleanupListener(message.correlationId);
    }
    /**
     * Handle job failure messages
     */
    handleJobFailed(message) {
        console.log(`[Instagram Translation Communication] Job failed: ${message.correlationId}`);
        this.emit('job-failed', message);
        this.cleanupListener(message.correlationId);
    }
    /**
     * Handle job progress messages
     */
    handleJobProgress(message) {
        console.log(`[Instagram Translation Communication] Job progress: ${message.correlationId} - ${message.stage} (${message.progress}%)`);
        this.emit('job-progress', message);
    }
    /**
     * Handle worker health messages
     */
    handleWorkerHealth(message) {
        console.log(`[Instagram Translation Communication] Worker health: ${message.workerId} - ${message.status}`);
        this.emit('worker-health', message);
    }
    /**
     * Publish job completion message
     */
    async publishJobCompleted(correlationId, result) {
        if (!(0, instagram_translation_queue_1.validateCorrelationId)(correlationId)) {
            throw new Error(`Invalid correlation ID: ${correlationId}`);
        }
        const message = {
            correlationId,
            success: true,
            result,
            timestamp: Date.now(),
        };
        try {
            await this.publisher.publish(CHANNELS.JOB_COMPLETED, JSON.stringify(message));
            console.log(`[Instagram Translation Communication] Published job completion: ${correlationId}`);
        }
        catch (error) {
            console.error(`[Instagram Translation Communication] Failed to publish job completion: ${correlationId}`, error);
            throw error;
        }
    }
    /**
     * Publish job failure message
     */
    async publishJobFailed(correlationId, error, errorCode = instagram_translation_queue_1.InstagramTranslationErrorCodes.UNKNOWN_ERROR) {
        if (!(0, instagram_translation_queue_1.validateCorrelationId)(correlationId)) {
            throw new Error(`Invalid correlation ID: ${correlationId}`);
        }
        const message = {
            correlationId,
            success: false,
            error,
            errorCode,
            timestamp: Date.now(),
        };
        try {
            await this.publisher.publish(CHANNELS.JOB_FAILED, JSON.stringify(message));
            console.log(`[Instagram Translation Communication] Published job failure: ${correlationId}`);
        }
        catch (error) {
            console.error(`[Instagram Translation Communication] Failed to publish job failure: ${correlationId}`, error);
            throw error;
        }
    }
    /**
     * Publish job progress message
     */
    async publishJobProgress(correlationId, progress, stage) {
        if (!(0, instagram_translation_queue_1.validateCorrelationId)(correlationId)) {
            throw new Error(`Invalid correlation ID: ${correlationId}`);
        }
        const message = {
            correlationId,
            progress: Math.max(0, Math.min(100, progress)), // Clamp between 0-100
            stage,
            timestamp: Date.now(),
        };
        try {
            await this.publisher.publish(CHANNELS.JOB_PROGRESS, JSON.stringify(message));
        }
        catch (error) {
            console.error(`[Instagram Translation Communication] Failed to publish job progress: ${correlationId}`, error);
        }
    }
    /**
     * Publish worker health message
     */
    async publishWorkerHealth(workerId, status, activeJobs = 0) {
        const message = {
            workerId,
            status,
            activeJobs,
            timestamp: Date.now(),
        };
        try {
            await this.publisher.publish(CHANNELS.WORKER_HEALTH, JSON.stringify(message));
        }
        catch (error) {
            console.error(`[Instagram Translation Communication] Failed to publish worker health: ${workerId}`, error);
        }
    }
    /**
     * Wait for job completion with timeout
     */
    async waitForJobCompletion(correlationId, timeoutMs = 4500) {
        if (!(0, instagram_translation_queue_1.validateCorrelationId)(correlationId)) {
            throw new Error(`Invalid correlation ID: ${correlationId}`);
        }
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                this.cleanupListener(correlationId);
                const timeoutError = (0, instagram_translation_queue_1.createErrorResult)(correlationId, `Job timeout after ${timeoutMs}ms`, instagram_translation_queue_1.InstagramTranslationErrorCodes.TIMEOUT_ERROR, timeoutMs);
                resolve(timeoutError);
            }, timeoutMs);
            // Store timeout for cleanup
            this.activeListeners.set(correlationId, timeout);
            // Listen for completion
            const onCompleted = (message) => {
                if (message.correlationId === correlationId) {
                    this.off('job-completed', onCompleted);
                    this.off('job-failed', onFailed);
                    clearTimeout(timeout);
                    this.cleanupListener(correlationId);
                    resolve(message.result);
                }
            };
            // Listen for failure
            const onFailed = (message) => {
                if (message.correlationId === correlationId) {
                    this.off('job-completed', onCompleted);
                    this.off('job-failed', onFailed);
                    clearTimeout(timeout);
                    this.cleanupListener(correlationId);
                    const errorResult = (0, instagram_translation_queue_1.createErrorResult)(correlationId, message.error, message.errorCode, Date.now() - message.timestamp);
                    resolve(errorResult);
                }
            };
            this.on('job-completed', onCompleted);
            this.on('job-failed', onFailed);
        });
    }
    /**
     * Listen for job progress updates
     */
    onJobProgress(correlationId, callback) {
        const listener = (message) => {
            if (message.correlationId === correlationId) {
                callback(message.progress, message.stage);
            }
        };
        this.on('job-progress', listener);
        // Return cleanup function
        return () => {
            this.off('job-progress', listener);
        };
    }
    /**
     * Listen for worker health updates
     */
    onWorkerHealth(callback) {
        const listener = (message) => {
            callback(message.workerId, message.status, message.activeJobs);
        };
        this.on('worker-health', listener);
        // Return cleanup function
        return () => {
            this.off('worker-health', listener);
        };
    }
    /**
     * Cleanup listener timeout
     */
    cleanupListener(correlationId) {
        const timeout = this.activeListeners.get(correlationId);
        if (timeout) {
            clearTimeout(timeout);
            this.activeListeners.delete(correlationId);
        }
    }
    /**
     * Get communication health status
     */
    async getHealthStatus() {
        try {
            // Test publisher connection
            await this.publisher.ping();
            return {
                subscriber: this.isSubscribed,
                publisher: true,
                activeListeners: this.activeListeners.size,
                channels: Object.values(CHANNELS),
            };
        }
        catch (error) {
            return {
                subscriber: this.isSubscribed,
                publisher: false,
                activeListeners: this.activeListeners.size,
                channels: Object.values(CHANNELS),
            };
        }
    }
    /**
     * Cleanup and close connections
     */
    async cleanup() {
        try {
            // Clear all active listeners
            for (const timeout of this.activeListeners.values()) {
                clearTimeout(timeout);
            }
            this.activeListeners.clear();
            // Unsubscribe from channels
            if (this.isSubscribed) {
                await this.subscriber.unsubscribe();
                this.isSubscribed = false;
            }
            // Close connections
            this.subscriber.disconnect();
            this.publisher.disconnect();
            console.log('[Instagram Translation Communication] Cleanup completed');
        }
        catch (error) {
            console.error('[Instagram Translation Communication] Cleanup error:', error);
        }
    }
}
exports.InstagramTranslationCommunicationManager = InstagramTranslationCommunicationManager;
// Singleton instance
let communicationManager = null;
/**
 * Get singleton communication manager instance
 */
function getCommunicationManager() {
    if (!communicationManager) {
        communicationManager = new InstagramTranslationCommunicationManager();
    }
    return communicationManager;
}
/**
 * Cleanup communication manager (for testing or shutdown)
 */
async function cleanupCommunicationManager() {
    if (communicationManager) {
        await communicationManager.cleanup();
        communicationManager = null;
    }
}
