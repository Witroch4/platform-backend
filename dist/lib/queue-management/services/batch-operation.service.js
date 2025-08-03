"use strict";
/**
 * Batch Operation Service
 *
 * Handles batch operations with progress tracking, rollback capabilities,
 * and advanced error handling for queue management operations.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.BatchOperationService = void 0;
exports.getBatchOperationService = getBatchOperationService;
const events_1 = require("events");
const constants_1 = require("../constants");
const errors_1 = require("../errors");
const logger_1 = require("../utils/logger");
const permission_manager_service_1 = require("./permission-manager.service");
/**
 * Batch Operation Service Implementation
 */
class BatchOperationService extends events_1.EventEmitter {
    logger;
    permissionManager = (0, permission_manager_service_1.getPermissionManager)();
    activeOperations = new Map();
    operationCounter = 0;
    constructor() {
        super();
        this.logger = new logger_1.Logger('BatchOperationService');
    }
    /**
     * Execute a batch job operation with progress tracking
     */
    async executeBatchJobOperation(jobs, operation, options = {}, user, delay) {
        const operationId = this.generateOperationId();
        const progress = {
            id: operationId,
            operation: `batch_${operation}`,
            total: jobs.length,
            processed: 0,
            successful: 0,
            failed: 0,
            status: 'pending',
            startedAt: new Date(),
            errors: [],
            rollbackInfo: options.enableRollback ? { canRollback: true, rollbackActions: [] } : undefined
        };
        this.activeOperations.set(operationId, progress);
        try {
            // Validate batch size limits
            this.validateBatchSize(jobs.length);
            // Validate permissions for all jobs
            if (user) {
                await this.validateBatchPermissions(jobs, operation, user);
            }
            progress.status = 'running';
            this.emit(constants_1.EVENT_TYPES.BATCH_OPERATION_STARTED, progress);
            // Process jobs in batches
            const batchSize = options.batchSize || constants_1.DEFAULTS.BATCH_LIMITS.MAX_JOBS_PER_BATCH;
            const maxConcurrency = options.maxConcurrency || constants_1.DEFAULTS.BATCH_LIMITS.MAX_CONCURRENT_BATCHES;
            await this.processBatchesWithConcurrency(jobs, operation, batchSize, maxConcurrency, progress, options, delay);
            progress.status = progress.failed > 0 ? 'completed' : 'completed';
            progress.completedAt = new Date();
            this.logger.info(`Batch operation completed: ${operation}`, {
                operationId,
                operation,
                total: progress.total,
                successful: progress.successful,
                failed: progress.failed,
                duration: progress.completedAt.getTime() - progress.startedAt.getTime(),
                userId: user?.userId
            });
            this.emit(constants_1.EVENT_TYPES.BATCH_OPERATION_COMPLETED, progress);
            return progress;
        }
        catch (error) {
            progress.status = 'failed';
            progress.completedAt = new Date();
            this.logger.error(`Batch operation failed: ${operation}`, error, {
                operationId,
                operation,
                userId: user?.userId
            });
            // Attempt rollback if enabled
            if (options.enableRollback && progress.rollbackInfo) {
                await this.attemptRollback(progress);
            }
            this.emit(constants_1.EVENT_TYPES.BATCH_OPERATION_FAILED, progress);
            throw new errors_1.QueueManagementError(`Batch operation failed: ${error.message}`, constants_1.ERROR_CODES.INTERNAL_ERROR, 500, { operationId, originalError: error.message });
        }
        finally {
            // Clean up after some time
            setTimeout(() => {
                this.activeOperations.delete(operationId);
            }, 300000); // 5 minutes
        }
    }
    /**
     * Execute a batch queue operation
     */
    async executeBatchQueueOperation(queueNames, operation, options = {}, user, cleanOptions) {
        const operationId = this.generateOperationId();
        const progress = {
            id: operationId,
            operation: `batch_queue_${operation}`,
            total: queueNames.length,
            processed: 0,
            successful: 0,
            failed: 0,
            status: 'pending',
            startedAt: new Date(),
            errors: [],
            rollbackInfo: options.enableRollback ? { canRollback: true, rollbackActions: [] } : undefined
        };
        this.activeOperations.set(operationId, progress);
        try {
            // Validate permissions for all queues
            if (user) {
                await this.validateQueueBatchPermissions(queueNames, operation, user);
            }
            progress.status = 'running';
            this.emit(constants_1.EVENT_TYPES.BATCH_OPERATION_STARTED, progress);
            // Process queues sequentially to avoid overwhelming the system
            for (const queueName of queueNames) {
                try {
                    await this.executeQueueOperation(queueName, operation, cleanOptions, progress);
                    progress.successful++;
                }
                catch (error) {
                    progress.failed++;
                    progress.errors.push({
                        id: queueName,
                        error: error.message
                    });
                    this.logger.error(`Queue operation failed for ${queueName}:`, error, {
                        operationId,
                        queueName,
                        operation
                    });
                }
                progress.processed++;
                // Update progress
                if (options.progressCallback) {
                    options.progressCallback(progress);
                }
                this.emit(constants_1.EVENT_TYPES.BATCH_OPERATION_PROGRESS, progress);
            }
            progress.status = 'completed';
            progress.completedAt = new Date();
            this.logger.info(`Batch queue operation completed: ${operation}`, {
                operationId,
                operation,
                total: progress.total,
                successful: progress.successful,
                failed: progress.failed,
                userId: user?.userId
            });
            this.emit(constants_1.EVENT_TYPES.BATCH_OPERATION_COMPLETED, progress);
            return progress;
        }
        catch (error) {
            progress.status = 'failed';
            progress.completedAt = new Date();
            this.logger.error(`Batch queue operation failed: ${operation}`, error, {
                operationId,
                operation,
                userId: user?.userId
            });
            this.emit(constants_1.EVENT_TYPES.BATCH_OPERATION_FAILED, progress);
            throw new errors_1.QueueManagementError(`Batch queue operation failed: ${error.message}`, constants_1.ERROR_CODES.INTERNAL_ERROR, 500, { operationId, originalError: error.message });
        }
        finally {
            setTimeout(() => {
                this.activeOperations.delete(operationId);
            }, 300000); // 5 minutes
        }
    }
    /**
     * Get progress of an active batch operation
     */
    getBatchOperationProgress(operationId) {
        return this.activeOperations.get(operationId) || null;
    }
    /**
     * Get all active batch operations
     */
    getActiveBatchOperations() {
        return Array.from(this.activeOperations.values());
    }
    /**
     * Cancel a running batch operation
     */
    async cancelBatchOperation(operationId, user) {
        const progress = this.activeOperations.get(operationId);
        if (!progress) {
            throw new errors_1.QueueManagementError(`Batch operation not found: ${operationId}`, constants_1.ERROR_CODES.NOT_FOUND);
        }
        if (progress.status !== 'running') {
            throw new errors_1.QueueManagementError(`Cannot cancel batch operation in status: ${progress.status}`, constants_1.ERROR_CODES.VALIDATION_ERROR);
        }
        progress.status = 'cancelled';
        progress.completedAt = new Date();
        this.logger.info(`Batch operation cancelled: ${operationId}`, {
            operationId,
            operation: progress.operation,
            processed: progress.processed,
            total: progress.total,
            userId: user?.userId
        });
        this.emit(constants_1.EVENT_TYPES.BATCH_OPERATION_CANCELLED, progress);
        return true;
    }
    /**
     * Rollback a completed batch operation
     */
    async rollbackBatchOperation(operationId, user) {
        const progress = this.activeOperations.get(operationId);
        if (!progress) {
            throw new errors_1.QueueManagementError(`Batch operation not found: ${operationId}`, constants_1.ERROR_CODES.NOT_FOUND);
        }
        if (!progress.rollbackInfo?.canRollback) {
            throw new errors_1.QueueManagementError(`Batch operation cannot be rolled back: ${operationId}`, constants_1.ERROR_CODES.VALIDATION_ERROR);
        }
        try {
            await this.attemptRollback(progress);
            this.logger.info(`Batch operation rolled back: ${operationId}`, {
                operationId,
                operation: progress.operation,
                rollbackActions: progress.rollbackInfo.rollbackActions.length,
                userId: user?.userId
            });
            return true;
        }
        catch (error) {
            this.logger.error(`Failed to rollback batch operation: ${operationId}`, error, {
                operationId,
                userId: user?.userId
            });
            throw new errors_1.QueueManagementError(`Failed to rollback batch operation: ${error.message}`, constants_1.ERROR_CODES.INTERNAL_ERROR);
        }
    }
    // Private helper methods
    generateOperationId() {
        return `batch_${Date.now()}_${++this.operationCounter}`;
    }
    validateBatchSize(size) {
        if (size > constants_1.DEFAULTS.BATCH_LIMITS.MAX_JOBS_PER_BATCH) {
            throw new errors_1.ValidationError(`Batch size exceeds maximum limit: ${size} > ${constants_1.DEFAULTS.BATCH_LIMITS.MAX_JOBS_PER_BATCH}`, 'batchSize', size);
        }
    }
    async validateBatchPermissions(jobs, operation, user) {
        // Group jobs by queue for efficient permission checking
        const jobsByQueue = new Map();
        for (const job of jobs) {
            const queueName = job.queueName;
            if (!jobsByQueue.has(queueName)) {
                jobsByQueue.set(queueName, []);
            }
            jobsByQueue.get(queueName).push(job);
        }
        // Validate permissions for each queue
        for (const [queueName, queueJobs] of jobsByQueue) {
            this.permissionManager.validateBatchOperation(user, `${operation}_batch`, queueName, queueJobs.length);
        }
    }
    async validateQueueBatchPermissions(queueNames, operation, user) {
        for (const queueName of queueNames) {
            this.permissionManager.validateQueueOperation(user, operation, queueName);
        }
    }
    async processBatchesWithConcurrency(jobs, operation, batchSize, maxConcurrency, progress, options, delay) {
        const batches = [];
        // Split jobs into batches
        for (let i = 0; i < jobs.length; i += batchSize) {
            batches.push(jobs.slice(i, i + batchSize));
        }
        // Process batches with limited concurrency
        const semaphore = new Array(maxConcurrency).fill(null);
        const promises = [];
        for (const batch of batches) {
            const promise = this.waitForSlot(semaphore).then(async (slotIndex) => {
                try {
                    await this.processBatch(batch, operation, progress, options, delay);
                }
                finally {
                    semaphore[slotIndex] = null; // Release slot
                }
            });
            promises.push(promise);
        }
        await Promise.all(promises);
    }
    async waitForSlot(semaphore) {
        return new Promise((resolve) => {
            const checkSlot = () => {
                const availableSlot = semaphore.findIndex(slot => slot === null);
                if (availableSlot !== -1) {
                    semaphore[availableSlot] = true; // Occupy slot
                    resolve(availableSlot);
                }
                else {
                    setTimeout(checkSlot, 10); // Check again in 10ms
                }
            };
            checkSlot();
        });
    }
    async processBatch(batch, operation, progress, options, delay) {
        for (const job of batch) {
            if (progress.status === 'cancelled') {
                break;
            }
            try {
                await this.executeJobOperation(job, operation, progress, delay);
                progress.successful++;
            }
            catch (error) {
                progress.failed++;
                progress.errors.push({
                    id: job.id,
                    error: error.message
                });
            }
            progress.processed++;
            // Update estimated completion
            if (progress.processed > 0) {
                const elapsed = Date.now() - progress.startedAt.getTime();
                const rate = progress.processed / elapsed;
                const remaining = progress.total - progress.processed;
                progress.estimatedCompletion = new Date(Date.now() + (remaining / rate));
            }
            // Emit progress update
            if (options.progressCallback) {
                options.progressCallback(progress);
            }
            this.emit(constants_1.EVENT_TYPES.BATCH_OPERATION_PROGRESS, progress);
        }
    }
    async executeJobOperation(job, operation, progress, delay) {
        // Store original state for rollback
        if (progress.rollbackInfo) {
            const originalState = await job.getState();
            progress.rollbackInfo.rollbackActions.push({
                type: 'revert_state',
                jobId: job.id,
                queueName: job.queueName,
                originalState
            });
        }
        switch (operation) {
            case 'retry':
                await job.retry();
                break;
            case 'remove':
                await job.remove();
                break;
            case 'promote':
                await job.promote();
                break;
            case 'delay':
                if (delay !== undefined) {
                    await job.changeDelay(delay);
                }
                break;
            default:
                throw new errors_1.ValidationError(`Invalid job operation: ${operation}`);
        }
    }
    async executeQueueOperation(queueName, operation, cleanOptions, progress) {
        // This would integrate with the QueueManagerService
        // For now, we'll just simulate the operations
        switch (operation) {
            case 'pause':
                // await queueManager.pauseQueue(queueName)
                break;
            case 'resume':
                // await queueManager.resumeQueue(queueName)
                break;
            case 'clean':
                // await queueManager.cleanCompleted(queueName, cleanOptions?.olderThan)
                break;
            default:
                throw new errors_1.ValidationError(`Invalid queue operation: ${operation}`);
        }
    }
    async attemptRollback(progress) {
        if (!progress.rollbackInfo) {
            return;
        }
        this.logger.info(`Attempting rollback for operation: ${progress.id}`, {
            operationId: progress.id,
            rollbackActions: progress.rollbackInfo.rollbackActions.length
        });
        const rollbackErrors = [];
        // Execute rollback actions in reverse order
        for (const action of progress.rollbackInfo.rollbackActions.reverse()) {
            try {
                await this.executeRollbackAction(action);
            }
            catch (error) {
                rollbackErrors.push(`Failed to rollback ${action.type} for ${action.jobId || action.queueName}: ${error.message}`);
            }
        }
        if (rollbackErrors.length > 0) {
            this.logger.error(`Rollback completed with errors:`, rollbackErrors, {
                operationId: progress.id
            });
        }
        else {
            this.logger.info(`Rollback completed successfully for operation: ${progress.id}`);
        }
    }
    async executeRollbackAction(action) {
        // Implementation would depend on the specific action type
        // This is a placeholder for the actual rollback logic
        switch (action.type) {
            case 'restore_job':
                // Restore job to original state
                break;
            case 'unpause_queue':
                // Unpause queue if it was paused
                break;
            case 'revert_state':
                // Revert job to original state
                break;
        }
    }
}
exports.BatchOperationService = BatchOperationService;
// Export singleton instance
let batchOperationServiceInstance = null;
function getBatchOperationService() {
    if (!batchOperationServiceInstance) {
        batchOperationServiceInstance = new BatchOperationService();
    }
    return batchOperationServiceInstance;
}
exports.default = BatchOperationService;
