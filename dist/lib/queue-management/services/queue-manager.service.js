"use strict";
/**
 * Queue Manager Service
 *
 * Central service for managing BullMQ queues with advanced monitoring,
 * health tracking, and event-driven architecture.
 */
var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
};
var __esDecorate = (this && this.__esDecorate) || function (ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
    function accept(f) { if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected"); return f; }
    var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
    var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
    var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
    var _, done = false;
    for (var i = decorators.length - 1; i >= 0; i--) {
        var context = {};
        for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
        for (var p in contextIn.access) context.access[p] = contextIn.access[p];
        context.addInitializer = function (f) { if (done) throw new TypeError("Cannot add initializers after decoration has completed"); extraInitializers.push(accept(f || null)); };
        var result = (0, decorators[i])(kind === "accessor" ? { get: descriptor.get, set: descriptor.set } : descriptor[key], context);
        if (kind === "accessor") {
            if (result === void 0) continue;
            if (result === null || typeof result !== "object") throw new TypeError("Object expected");
            if (_ = accept(result.get)) descriptor.get = _;
            if (_ = accept(result.set)) descriptor.set = _;
            if (_ = accept(result.init)) initializers.unshift(_);
        }
        else if (_ = accept(result)) {
            if (kind === "field") initializers.unshift(_);
            else descriptor[key] = _;
        }
    }
    if (target) Object.defineProperty(target, contextIn.name, descriptor);
    done = true;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getQueueManager = exports.QueueManagerService = void 0;
const events_1 = require("events");
const bullmq_1 = require("bullmq");
const ioredis_1 = require("ioredis");
const constants_1 = require("../constants");
const config_1 = require("../config");
const errors_1 = require("../errors");
const logger_1 = require("../utils/logger");
const permission_manager_service_1 = require("./permission-manager.service");
const batch_operation_service_1 = require("./batch-operation.service");
const flow_control_service_1 = require("./flow-control.service");
/**
 * Singleton Queue Manager Service
 */
let QueueManagerService = (() => {
    let _classSuper = events_1.EventEmitter;
    let _instanceExtraInitializers = [];
    let _removeJob_decorators;
    let _promoteJob_decorators;
    let _delayJob_decorators;
    let _cleanCompleted_decorators;
    let _executeJobAction_decorators;
    let _executeBatchAction_decorators;
    let _executeBatchJobOperationWithProgress_decorators;
    let _executeBatchQueueOperationWithProgress_decorators;
    let _cancelBatchOperation_decorators;
    let _rollbackBatchOperation_decorators;
    let _configureFlowControl_decorators;
    let _updateQueueConcurrency_decorators;
    let _getFlowControlMetrics_decorators;
    let _removeFlowControl_decorators;
    return class QueueManagerService extends _classSuper {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            _removeJob_decorators = [(0, logger_1.measurePerformance)(new logger_1.Logger('QueueManagerService'), 'removeJob'), (0, logger_1.auditLog)(new logger_1.Logger('QueueManagerService'), 'job:remove')];
            _promoteJob_decorators = [(0, logger_1.measurePerformance)(new logger_1.Logger('QueueManagerService'), 'promoteJob'), (0, logger_1.auditLog)(new logger_1.Logger('QueueManagerService'), 'job:promote')];
            _delayJob_decorators = [(0, logger_1.measurePerformance)(new logger_1.Logger('QueueManagerService'), 'delayJob'), (0, logger_1.auditLog)(new logger_1.Logger('QueueManagerService'), 'job:delay')];
            _cleanCompleted_decorators = [(0, logger_1.measurePerformance)(new logger_1.Logger('QueueManagerService'), 'cleanCompleted'), (0, logger_1.auditLog)(new logger_1.Logger('QueueManagerService'), 'batch:clean_completed')];
            _executeJobAction_decorators = [(0, logger_1.measurePerformance)(new logger_1.Logger('QueueManagerService'), 'executeJobAction')];
            _executeBatchAction_decorators = [(0, logger_1.measurePerformance)(new logger_1.Logger('QueueManagerService'), 'executeBatchAction')];
            _executeBatchJobOperationWithProgress_decorators = [(0, logger_1.measurePerformance)(new logger_1.Logger('QueueManagerService'), 'executeBatchJobOperationWithProgress')];
            _executeBatchQueueOperationWithProgress_decorators = [(0, logger_1.measurePerformance)(new logger_1.Logger('QueueManagerService'), 'executeBatchQueueOperationWithProgress')];
            _cancelBatchOperation_decorators = [(0, logger_1.auditLog)(new logger_1.Logger('QueueManagerService'), 'batch:cancel')];
            _rollbackBatchOperation_decorators = [(0, logger_1.auditLog)(new logger_1.Logger('QueueManagerService'), 'batch:rollback')];
            _configureFlowControl_decorators = [(0, logger_1.measurePerformance)(new logger_1.Logger('QueueManagerService'), 'configureFlowControl'), (0, logger_1.auditLog)(new logger_1.Logger('QueueManagerService'), 'flow_control:configure')];
            _updateQueueConcurrency_decorators = [(0, logger_1.measurePerformance)(new logger_1.Logger('QueueManagerService'), 'updateQueueConcurrency'), (0, logger_1.auditLog)(new logger_1.Logger('QueueManagerService'), 'queue:update_concurrency')];
            _getFlowControlMetrics_decorators = [(0, logger_1.measurePerformance)(new logger_1.Logger('QueueManagerService'), 'getFlowControlMetrics')];
            _removeFlowControl_decorators = [(0, logger_1.measurePerformance)(new logger_1.Logger('QueueManagerService'), 'removeFlowControl'), (0, logger_1.auditLog)(new logger_1.Logger('QueueManagerService'), 'flow_control:remove')];
            __esDecorate(this, null, _removeJob_decorators, { kind: "method", name: "removeJob", static: false, private: false, access: { has: obj => "removeJob" in obj, get: obj => obj.removeJob }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _promoteJob_decorators, { kind: "method", name: "promoteJob", static: false, private: false, access: { has: obj => "promoteJob" in obj, get: obj => obj.promoteJob }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _delayJob_decorators, { kind: "method", name: "delayJob", static: false, private: false, access: { has: obj => "delayJob" in obj, get: obj => obj.delayJob }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _cleanCompleted_decorators, { kind: "method", name: "cleanCompleted", static: false, private: false, access: { has: obj => "cleanCompleted" in obj, get: obj => obj.cleanCompleted }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _executeJobAction_decorators, { kind: "method", name: "executeJobAction", static: false, private: false, access: { has: obj => "executeJobAction" in obj, get: obj => obj.executeJobAction }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _executeBatchAction_decorators, { kind: "method", name: "executeBatchAction", static: false, private: false, access: { has: obj => "executeBatchAction" in obj, get: obj => obj.executeBatchAction }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _executeBatchJobOperationWithProgress_decorators, { kind: "method", name: "executeBatchJobOperationWithProgress", static: false, private: false, access: { has: obj => "executeBatchJobOperationWithProgress" in obj, get: obj => obj.executeBatchJobOperationWithProgress }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _executeBatchQueueOperationWithProgress_decorators, { kind: "method", name: "executeBatchQueueOperationWithProgress", static: false, private: false, access: { has: obj => "executeBatchQueueOperationWithProgress" in obj, get: obj => obj.executeBatchQueueOperationWithProgress }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _cancelBatchOperation_decorators, { kind: "method", name: "cancelBatchOperation", static: false, private: false, access: { has: obj => "cancelBatchOperation" in obj, get: obj => obj.cancelBatchOperation }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _rollbackBatchOperation_decorators, { kind: "method", name: "rollbackBatchOperation", static: false, private: false, access: { has: obj => "rollbackBatchOperation" in obj, get: obj => obj.rollbackBatchOperation }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _configureFlowControl_decorators, { kind: "method", name: "configureFlowControl", static: false, private: false, access: { has: obj => "configureFlowControl" in obj, get: obj => obj.configureFlowControl }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _updateQueueConcurrency_decorators, { kind: "method", name: "updateQueueConcurrency", static: false, private: false, access: { has: obj => "updateQueueConcurrency" in obj, get: obj => obj.updateQueueConcurrency }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _getFlowControlMetrics_decorators, { kind: "method", name: "getFlowControlMetrics", static: false, private: false, access: { has: obj => "getFlowControlMetrics" in obj, get: obj => obj.getFlowControlMetrics }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _removeFlowControl_decorators, { kind: "method", name: "removeFlowControl", static: false, private: false, access: { has: obj => "removeFlowControl" in obj, get: obj => obj.removeFlowControl }, metadata: _metadata }, null, _instanceExtraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        static instance = null;
        queues = (__runInitializers(this, _instanceExtraInitializers), new Map());
        queueConfigs = new Map();
        queueEvents = new Map();
        redis;
        logger;
        permissionManager;
        batchOperationService;
        flowControlService;
        config = (0, config_1.getQueueManagementConfig)();
        healthCheckInterval = null;
        constructor() {
            super();
            this.logger = new logger_1.Logger('QueueManagerService');
            this.permissionManager = (0, permission_manager_service_1.getPermissionManager)();
            this.batchOperationService = (0, batch_operation_service_1.getBatchOperationService)();
            this.redis = new ioredis_1.Redis(this.config.redis);
            this.flowControlService = (0, flow_control_service_1.getFlowControlService)(this.redis);
            this.setupEventListeners();
            this.startHealthMonitoring();
        }
        /**
         * Get singleton instance
         */
        static getInstance() {
            if (!QueueManagerService.instance) {
                QueueManagerService.instance = new QueueManagerService();
            }
            return QueueManagerService.instance;
        }
        /**
         * Register a queue with the manager
         */
        async registerQueue(queue, config) {
            try {
                this.logger.info(`Registering queue: ${config.name}`);
                // Validate queue configuration
                this.validateQueueConfig(config);
                // Store queue and config
                this.queues.set(config.name, queue);
                this.queueConfigs.set(config.name, config);
                // Setup queue events
                const queueEvents = new bullmq_1.QueueEvents(config.name, { connection: this.redis });
                this.queueEvents.set(config.name, queueEvents);
                // Setup event listeners for this queue
                this.setupQueueEventListeners(config.name, queueEvents);
                // Cache queue configuration
                if (this.config.performance.cacheEnabled) {
                    await this.cacheQueueConfig(config);
                }
                // Emit registration event
                this.emit(constants_1.EVENT_TYPES.QUEUE_CREATED, {
                    queueName: config.name,
                    config,
                    timestamp: new Date()
                });
                this.logger.info(`Queue registered successfully: ${config.name}`);
            }
            catch (error) {
                this.logger.error(`Failed to register queue ${config.name}:`, error);
                throw new errors_1.QueueManagementError(`Failed to register queue: ${error.message}`, constants_1.ERROR_CODES.INTERNAL_ERROR);
            }
        }
        /**
         * Unregister a queue from the manager
         */
        async unregisterQueue(queueName) {
            try {
                this.logger.info(`Unregistering queue: ${queueName}`);
                // Remove event listeners
                const queueEvents = this.queueEvents.get(queueName);
                if (queueEvents) {
                    queueEvents.removeAllListeners();
                    await queueEvents.close();
                    this.queueEvents.delete(queueName);
                }
                // Remove from maps
                this.queues.delete(queueName);
                this.queueConfigs.delete(queueName);
                // Clear cache
                if (this.config.performance.cacheEnabled) {
                    await this.clearQueueCache(queueName);
                }
                // Emit unregistration event
                this.emit(constants_1.EVENT_TYPES.QUEUE_DELETED, {
                    queueName,
                    timestamp: new Date()
                });
                this.logger.info(`Queue unregistered successfully: ${queueName}`);
            }
            catch (error) {
                this.logger.error(`Failed to unregister queue ${queueName}:`, error);
                throw new errors_1.QueueManagementError(`Failed to unregister queue: ${error.message}`, constants_1.ERROR_CODES.INTERNAL_ERROR);
            }
        }
        /**
         * Get all registered queues
         */
        getRegisteredQueues() {
            return new Map(this.queues);
        }
        /**
         * Get health status for a specific queue
         */
        async getQueueHealth(queueName) {
            try {
                // Check cache first
                if (this.config.performance.cacheEnabled) {
                    const cached = await this.getCachedQueueHealth(queueName);
                    if (cached) {
                        return cached;
                    }
                }
                const queue = this.queues.get(queueName);
                if (!queue) {
                    throw new errors_1.QueueNotFoundError(queueName);
                }
                // Get job counts
                const waiting = await queue.getWaiting();
                const active = await queue.getActive();
                const completed = await queue.getCompleted();
                const failed = await queue.getFailed();
                const delayed = await queue.getDelayed();
                const paused = await queue.isPaused();
                const counts = {
                    waiting: waiting.length,
                    active: active.length,
                    completed: completed.length,
                    failed: failed.length,
                    delayed: delayed.length,
                    paused: paused ? 1 : 0
                };
                // Calculate performance metrics
                const performance = await this.calculatePerformanceMetrics(queueName, active, completed, failed);
                // Calculate resource usage
                const resources = await this.calculateResourceUsage(queueName);
                // Determine queue status
                const status = this.determineQueueStatus(counts, performance, resources, queueName);
                const health = {
                    name: queueName,
                    status,
                    counts,
                    performance,
                    resources,
                    lastUpdated: new Date()
                };
                // Cache the result
                if (this.config.performance.cacheEnabled) {
                    await this.cacheQueueHealth(queueName, health);
                }
                return health;
            }
            catch (error) {
                this.logger.error(`Failed to get queue health for ${queueName}:`, error);
                if (error instanceof errors_1.QueueNotFoundError) {
                    throw error;
                }
                throw new errors_1.QueueManagementError(`Failed to get queue health: ${error.message}`, constants_1.ERROR_CODES.INTERNAL_ERROR);
            }
        }
        /**
         * Get health status for all registered queues
         */
        async getAllQueuesHealth() {
            const healthMap = new Map();
            const promises = Array.from(this.queues.keys()).map(async (queueName) => {
                try {
                    const health = await this.getQueueHealth(queueName);
                    healthMap.set(queueName, health);
                }
                catch (error) {
                    this.logger.error(`Failed to get health for queue ${queueName}:`, error);
                    // Continue with other queues even if one fails
                }
            });
            await Promise.all(promises);
            return healthMap;
        }
        /**
         * Get jobs from a queue with pagination and filters
         */
        async getJobs(queueName, state, pagination, filters, user) {
            try {
                // Validate permissions
                if (user) {
                    this.permissionManager.validateJobOperation(user, 'view', queueName);
                }
                // Validate inputs
                this.validatePagination(pagination);
                this.validateJobState(state);
                const queue = this.queues.get(queueName);
                if (!queue) {
                    throw new errors_1.QueueNotFoundError(queueName);
                }
                const { page, limit } = pagination;
                const start = (page - 1) * limit;
                const end = start + limit - 1;
                let jobs = [];
                // Get jobs based on state
                switch (state) {
                    case constants_1.JOB_STATES.WAITING:
                        jobs = await queue.getWaiting(start, end);
                        break;
                    case constants_1.JOB_STATES.ACTIVE:
                        jobs = await queue.getActive(start, end);
                        break;
                    case constants_1.JOB_STATES.COMPLETED:
                        jobs = await queue.getCompleted(start, end);
                        break;
                    case constants_1.JOB_STATES.FAILED:
                        jobs = await queue.getFailed(start, end);
                        break;
                    case constants_1.JOB_STATES.DELAYED:
                        jobs = await queue.getDelayed(start, end);
                        break;
                    default:
                        throw new errors_1.ValidationError(`Invalid job state: ${state}`);
                }
                // Apply filters if provided
                if (filters) {
                    jobs = this.applyJobFilters(jobs, filters);
                }
                // Get total count for pagination
                const totalCount = await this.getJobCount(queue, state);
                const totalPages = Math.ceil(totalCount / limit);
                this.logger.debug(`Retrieved ${jobs.length} jobs from queue ${queueName}`, {
                    queueName,
                    state,
                    page,
                    limit,
                    totalCount,
                    userId: user?.userId
                });
                return {
                    data: jobs,
                    pagination: {
                        page,
                        limit,
                        total: totalCount,
                        totalPages,
                        hasNext: page < totalPages,
                        hasPrev: page > 1
                    }
                };
            }
            catch (error) {
                this.logger.error(`Failed to get jobs for queue ${queueName}:`, error, {
                    queueName,
                    state,
                    userId: user?.userId
                });
                if (error instanceof errors_1.QueueNotFoundError || error instanceof errors_1.QueueManagementError) {
                    throw error;
                }
                throw new errors_1.QueueManagementError(`Failed to get jobs: ${error.message}`, constants_1.ERROR_CODES.INTERNAL_ERROR);
            }
        }
        /**
         * Get a specific job by ID
         */
        async getJob(queueName, jobId, user) {
            try {
                // Validate permissions
                if (user) {
                    this.permissionManager.validateJobOperation(user, 'view', queueName, jobId);
                }
                // Validate inputs
                this.validateJobId(jobId);
                const queue = this.queues.get(queueName);
                if (!queue) {
                    throw new errors_1.QueueNotFoundError(queueName);
                }
                const job = await queue.getJob(jobId);
                this.logger.debug(`Retrieved job ${jobId} from queue ${queueName}`, {
                    queueName,
                    jobId,
                    found: !!job,
                    userId: user?.userId
                });
                return job;
            }
            catch (error) {
                this.logger.error(`Failed to get job ${jobId} from queue ${queueName}:`, error, {
                    queueName,
                    jobId,
                    userId: user?.userId
                });
                if (error instanceof errors_1.QueueNotFoundError || error instanceof errors_1.QueueManagementError) {
                    throw error;
                }
                throw new errors_1.QueueManagementError(`Failed to get job: ${error.message}`, constants_1.ERROR_CODES.INTERNAL_ERROR);
            }
        }
        /**
         * Retry a specific job
         */
        async retryJob(queueName, jobId, user) {
            try {
                // Validate permissions
                if (user) {
                    this.permissionManager.validateJobOperation(user, 'retry', queueName, jobId);
                }
                // Validate inputs
                this.validateJobId(jobId);
                const job = await this.getJob(queueName, jobId, user);
                if (!job) {
                    throw new errors_1.JobNotFoundError(jobId, queueName);
                }
                // Validate job state
                if (job.finishedOn && !job.failedReason) {
                    throw new errors_1.JobInvalidStateError(jobId, 'completed', 'failed');
                }
                const previousAttempts = job.attemptsMade;
                await job.retry();
                // Emit event
                this.emit(constants_1.EVENT_TYPES.JOB_RETRIED, {
                    queueName,
                    jobId,
                    previousAttempts,
                    userId: user?.userId,
                    timestamp: new Date()
                });
                this.logger.info(`Job retried successfully: ${jobId} in queue ${queueName}`, {
                    queueName,
                    jobId,
                    previousAttempts,
                    userId: user?.userId
                });
                return true;
            }
            catch (error) {
                this.logger.error(`Failed to retry job ${jobId} in queue ${queueName}:`, error, {
                    queueName,
                    jobId,
                    userId: user?.userId
                });
                if (error instanceof errors_1.JobNotFoundError ||
                    error instanceof errors_1.QueueNotFoundError ||
                    error instanceof errors_1.JobInvalidStateError ||
                    error instanceof errors_1.QueueManagementError) {
                    throw error;
                }
                throw new errors_1.QueueManagementError(`Failed to retry job: ${error.message}`, constants_1.ERROR_CODES.INTERNAL_ERROR);
            }
        }
        /**
         * Remove a specific job
         */
        async removeJob(queueName, jobId, user) {
            try {
                // Validate permissions
                if (user) {
                    this.permissionManager.validateJobOperation(user, 'remove', queueName, jobId);
                }
                // Validate inputs
                this.validateJobId(jobId);
                const job = await this.getJob(queueName, jobId, user);
                if (!job) {
                    throw new errors_1.JobNotFoundError(jobId, queueName);
                }
                // Store job info before removal
                const jobInfo = {
                    id: job.id,
                    name: job.name,
                    data: job.data,
                    state: await job.getState(),
                    attempts: job.attemptsMade
                };
                await job.remove();
                // Emit event
                this.emit(constants_1.EVENT_TYPES.JOB_REMOVED, {
                    queueName,
                    jobId,
                    jobInfo,
                    userId: user?.userId,
                    timestamp: new Date()
                });
                this.logger.info(`Job removed successfully: ${jobId} from queue ${queueName}`, {
                    queueName,
                    jobId,
                    jobName: jobInfo.name,
                    userId: user?.userId
                });
                return true;
            }
            catch (error) {
                this.logger.error(`Failed to remove job ${jobId} from queue ${queueName}:`, error, {
                    queueName,
                    jobId,
                    userId: user?.userId
                });
                if (error instanceof errors_1.JobNotFoundError ||
                    error instanceof errors_1.QueueNotFoundError ||
                    error instanceof errors_1.QueueManagementError) {
                    throw error;
                }
                throw new errors_1.QueueManagementError(`Failed to remove job: ${error.message}`, constants_1.ERROR_CODES.INTERNAL_ERROR);
            }
        }
        /**
         * Promote a delayed job to waiting
         */
        async promoteJob(queueName, jobId, user) {
            try {
                // Validate permissions
                if (user) {
                    this.permissionManager.validateJobOperation(user, 'promote', queueName, jobId);
                }
                // Validate inputs
                this.validateJobId(jobId);
                const job = await this.getJob(queueName, jobId, user);
                if (!job) {
                    throw new errors_1.JobNotFoundError(jobId, queueName);
                }
                // Validate job state - only delayed jobs can be promoted
                const jobState = await job.getState();
                if (jobState !== 'delayed') {
                    throw new errors_1.JobInvalidStateError(jobId, jobState, 'delayed');
                }
                const originalDelay = job.delay;
                await job.promote();
                // Emit event
                this.emit(constants_1.EVENT_TYPES.JOB_PROMOTED, {
                    queueName,
                    jobId,
                    originalDelay,
                    userId: user?.userId,
                    timestamp: new Date()
                });
                this.logger.info(`Job promoted successfully: ${jobId} in queue ${queueName}`, {
                    queueName,
                    jobId,
                    originalDelay,
                    userId: user?.userId
                });
                return true;
            }
            catch (error) {
                this.logger.error(`Failed to promote job ${jobId} in queue ${queueName}:`, error, {
                    queueName,
                    jobId,
                    userId: user?.userId
                });
                if (error instanceof errors_1.JobNotFoundError ||
                    error instanceof errors_1.QueueNotFoundError ||
                    error instanceof errors_1.JobInvalidStateError ||
                    error instanceof errors_1.QueueManagementError) {
                    throw error;
                }
                throw new errors_1.QueueManagementError(`Failed to promote job: ${error.message}`, constants_1.ERROR_CODES.INTERNAL_ERROR);
            }
        }
        /**
         * Delay a job by specified milliseconds
         */
        async delayJob(queueName, jobId, delay, user) {
            try {
                // Validate permissions
                if (user) {
                    this.permissionManager.validateJobOperation(user, 'delay', queueName, jobId);
                }
                // Validate inputs
                this.validateJobId(jobId);
                this.validateDelay(delay);
                const job = await this.getJob(queueName, jobId, user);
                if (!job) {
                    throw new errors_1.JobNotFoundError(jobId, queueName);
                }
                // Validate job state - only waiting jobs can be delayed
                const jobState = await job.getState();
                if (jobState !== 'waiting') {
                    throw new errors_1.JobInvalidStateError(jobId, jobState, 'waiting');
                }
                // Update job with delay
                await job.changeDelay(delay);
                // Emit event
                this.emit(constants_1.EVENT_TYPES.JOB_DELAYED, {
                    queueName,
                    jobId,
                    delay,
                    userId: user?.userId,
                    timestamp: new Date()
                });
                this.logger.info(`Job delayed successfully: ${jobId} in queue ${queueName}`, {
                    queueName,
                    jobId,
                    delay,
                    userId: user?.userId
                });
                return true;
            }
            catch (error) {
                this.logger.error(`Failed to delay job ${jobId} in queue ${queueName}:`, error, {
                    queueName,
                    jobId,
                    delay,
                    userId: user?.userId
                });
                if (error instanceof errors_1.JobNotFoundError ||
                    error instanceof errors_1.QueueNotFoundError ||
                    error instanceof errors_1.JobInvalidStateError ||
                    error instanceof errors_1.QueueManagementError) {
                    throw error;
                }
                throw new errors_1.QueueManagementError(`Failed to delay job: ${error.message}`, constants_1.ERROR_CODES.INTERNAL_ERROR);
            }
        }
        /**
         * Retry all failed jobs in a queue
         */
        async retryAllFailed(queueName, user) {
            try {
                // Validate permissions
                if (user) {
                    this.permissionManager.validateBatchOperation(user, 'retry_all_failed', queueName, 0);
                }
                const queue = this.queues.get(queueName);
                if (!queue) {
                    throw new errors_1.QueueNotFoundError(queueName);
                }
                const failedJobs = await queue.getFailed();
                // Additional permission check for large batches
                if (user) {
                    this.permissionManager.validateBatchOperation(user, 'retry_all_failed', queueName, failedJobs.length);
                }
                const result = {
                    total: failedJobs.length,
                    successful: 0,
                    failed: 0,
                    errors: []
                };
                for (const job of failedJobs) {
                    try {
                        await job.retry();
                        result.successful++;
                    }
                    catch (error) {
                        result.failed++;
                        result.errors.push({
                            id: job.id,
                            error: error.message
                        });
                    }
                }
                this.logger.info(`Batch retry completed for queue ${queueName}: ${result.successful}/${result.total} successful`, {
                    queueName,
                    result,
                    userId: user?.userId
                });
                return result;
            }
            catch (error) {
                this.logger.error(`Failed to retry all failed jobs in queue ${queueName}:`, error, {
                    queueName,
                    userId: user?.userId
                });
                if (error instanceof errors_1.QueueNotFoundError || error instanceof errors_1.QueueManagementError) {
                    throw error;
                }
                throw new errors_1.QueueManagementError(`Failed to retry all failed jobs: ${error.message}`, constants_1.ERROR_CODES.INTERNAL_ERROR);
            }
        }
        /**
         * Clean completed jobs older than specified time
         */
        async cleanCompleted(queueName, olderThan = 24 * 60 * 60 * 1000, user) {
            try {
                // Validate permissions
                if (user) {
                    this.permissionManager.validateBatchOperation(user, 'clean_completed', queueName, 0);
                }
                // Validate inputs
                if (olderThan < 0) {
                    throw new errors_1.ValidationError('olderThan must be non-negative', 'olderThan', olderThan);
                }
                const queue = this.queues.get(queueName);
                if (!queue) {
                    throw new errors_1.QueueNotFoundError(queueName);
                }
                const completedJobs = await queue.getCompleted();
                const cutoffTime = Date.now() - olderThan;
                const jobsToClean = completedJobs.filter(job => job.finishedOn && job.finishedOn < cutoffTime);
                // Additional permission check for large batches
                if (user) {
                    this.permissionManager.validateBatchOperation(user, 'clean_completed', queueName, jobsToClean.length);
                }
                const result = {
                    total: jobsToClean.length,
                    successful: 0,
                    failed: 0,
                    errors: []
                };
                for (const job of jobsToClean) {
                    try {
                        await job.remove();
                        result.successful++;
                    }
                    catch (error) {
                        result.failed++;
                        result.errors.push({
                            id: job.id,
                            error: error.message
                        });
                    }
                }
                this.logger.info(`Batch cleanup completed for queue ${queueName}: ${result.successful}/${result.total} jobs cleaned`, {
                    queueName,
                    olderThan,
                    cutoffTime: new Date(cutoffTime),
                    result,
                    userId: user?.userId
                });
                return result;
            }
            catch (error) {
                this.logger.error(`Failed to clean completed jobs in queue ${queueName}:`, error, {
                    queueName,
                    olderThan,
                    userId: user?.userId
                });
                if (error instanceof errors_1.QueueNotFoundError || error instanceof errors_1.QueueManagementError) {
                    throw error;
                }
                throw new errors_1.QueueManagementError(`Failed to clean completed jobs: ${error.message}`, constants_1.ERROR_CODES.INTERNAL_ERROR);
            }
        }
        /**
         * Pause a queue
         */
        async pauseQueue(queueName, user) {
            try {
                // Validate permissions
                if (user) {
                    this.permissionManager.validateQueueOperation(user, 'pause', queueName);
                }
                const queue = this.queues.get(queueName);
                if (!queue) {
                    throw new errors_1.QueueNotFoundError(queueName);
                }
                // Check if queue is already paused
                const isPaused = await queue.isPaused();
                if (isPaused) {
                    this.logger.warn(`Queue ${queueName} is already paused`, {
                        queueName,
                        userId: user?.userId
                    });
                    return true;
                }
                await queue.pause();
                // Emit event
                this.emit(constants_1.EVENT_TYPES.QUEUE_PAUSED, {
                    queueName,
                    userId: user?.userId,
                    timestamp: new Date()
                });
                this.logger.info(`Queue paused successfully: ${queueName}`, {
                    queueName,
                    userId: user?.userId
                });
                return true;
            }
            catch (error) {
                this.logger.error(`Failed to pause queue ${queueName}:`, error, {
                    queueName,
                    userId: user?.userId
                });
                if (error instanceof errors_1.QueueNotFoundError || error instanceof errors_1.QueueManagementError) {
                    throw error;
                }
                throw new errors_1.QueueManagementError(`Failed to pause queue: ${error.message}`, constants_1.ERROR_CODES.INTERNAL_ERROR);
            }
        }
        /**
         * Resume a paused queue
         */
        async resumeQueue(queueName, user) {
            try {
                // Validate permissions
                if (user) {
                    this.permissionManager.validateQueueOperation(user, 'resume', queueName);
                }
                const queue = this.queues.get(queueName);
                if (!queue) {
                    throw new errors_1.QueueNotFoundError(queueName);
                }
                // Check if queue is already running
                const isPaused = await queue.isPaused();
                if (!isPaused) {
                    this.logger.warn(`Queue ${queueName} is already running`, {
                        queueName,
                        userId: user?.userId
                    });
                    return true;
                }
                await queue.resume();
                // Emit event
                this.emit(constants_1.EVENT_TYPES.QUEUE_RESUMED, {
                    queueName,
                    userId: user?.userId,
                    timestamp: new Date()
                });
                this.logger.info(`Queue resumed successfully: ${queueName}`, {
                    queueName,
                    userId: user?.userId
                });
                return true;
            }
            catch (error) {
                this.logger.error(`Failed to resume queue ${queueName}:`, error, {
                    queueName,
                    userId: user?.userId
                });
                if (error instanceof errors_1.QueueNotFoundError || error instanceof errors_1.QueueManagementError) {
                    throw error;
                }
                throw new errors_1.QueueManagementError(`Failed to resume queue: ${error.message}`, constants_1.ERROR_CODES.INTERNAL_ERROR);
            }
        }
        /**
         * Execute a job action (retry, remove, promote, delay)
         */
        async executeJobAction(action, user) {
            try {
                // Validate action
                this.validateJobAction(action);
                const result = {
                    total: action.jobIds.length,
                    successful: 0,
                    failed: 0,
                    errors: []
                };
                // Process each job
                for (const jobId of action.jobIds) {
                    try {
                        let success = false;
                        switch (action.action) {
                            case 'retry':
                                success = await this.retryJob('', jobId, user); // Queue name should be provided in action
                                break;
                            case 'remove':
                                success = await this.removeJob('', jobId, user);
                                break;
                            case 'promote':
                                success = await this.promoteJob('', jobId, user);
                                break;
                            case 'delay':
                                success = await this.delayJob('', jobId, action.delay || 0, user);
                                break;
                        }
                        if (success) {
                            result.successful++;
                        }
                        else {
                            result.failed++;
                            result.errors.push({
                                id: jobId,
                                error: 'Operation failed'
                            });
                        }
                    }
                    catch (error) {
                        result.failed++;
                        result.errors.push({
                            id: jobId,
                            error: error.message
                        });
                    }
                }
                this.logger.info(`Batch job action completed: ${action.action}`, {
                    action: action.action,
                    total: result.total,
                    successful: result.successful,
                    failed: result.failed,
                    userId: user?.userId
                });
                return result;
            }
            catch (error) {
                this.logger.error(`Failed to execute job action:`, error, {
                    action: action.action,
                    jobCount: action.jobIds.length,
                    userId: user?.userId
                });
                throw new errors_1.QueueManagementError(`Failed to execute job action: ${error.message}`, constants_1.ERROR_CODES.INTERNAL_ERROR);
            }
        }
        /**
         * Execute a batch action (retry all failed, clean completed, pause/resume queue)
         */
        async executeBatchAction(action, user) {
            try {
                // Validate action
                this.validateBatchAction(action);
                let result;
                switch (action.action) {
                    case 'retry_all_failed':
                        result = await this.retryAllFailed(action.queueName, user);
                        break;
                    case 'clean_completed':
                        const olderThan = action.options?.olderThan || 24 * 60 * 60 * 1000; // 24 hours default
                        result = await this.cleanCompleted(action.queueName, olderThan, user);
                        break;
                    case 'pause_queue':
                        const pauseSuccess = await this.pauseQueue(action.queueName, user);
                        result = {
                            total: 1,
                            successful: pauseSuccess ? 1 : 0,
                            failed: pauseSuccess ? 0 : 1,
                            errors: pauseSuccess ? [] : [{ id: action.queueName, error: 'Failed to pause queue' }]
                        };
                        break;
                    case 'resume_queue':
                        const resumeSuccess = await this.resumeQueue(action.queueName, user);
                        result = {
                            total: 1,
                            successful: resumeSuccess ? 1 : 0,
                            failed: resumeSuccess ? 0 : 1,
                            errors: resumeSuccess ? [] : [{ id: action.queueName, error: 'Failed to resume queue' }]
                        };
                        break;
                    default:
                        throw new errors_1.ValidationError(`Invalid batch action: ${action.action}`);
                }
                this.logger.info(`Batch action completed: ${action.action}`, {
                    action: action.action,
                    queueName: action.queueName,
                    result,
                    userId: user?.userId
                });
                return result;
            }
            catch (error) {
                this.logger.error(`Failed to execute batch action:`, error, {
                    action: action.action,
                    queueName: action.queueName,
                    userId: user?.userId
                });
                throw new errors_1.QueueManagementError(`Failed to execute batch action: ${error.message}`, constants_1.ERROR_CODES.INTERNAL_ERROR);
            }
        }
        /**
         * Execute batch job operation with progress tracking and rollback support
         */
        async executeBatchJobOperationWithProgress(queueName, jobIds, operation, options = {}, user) {
            try {
                // Validate permissions
                if (user) {
                    this.permissionManager.validateBatchOperation(user, `${operation}_batch`, queueName, jobIds.length);
                }
                // Get queue
                const queue = this.queues.get(queueName);
                if (!queue) {
                    throw new errors_1.QueueNotFoundError(queueName);
                }
                // Get jobs
                const jobs = [];
                for (const jobId of jobIds) {
                    const job = await queue.getJob(jobId);
                    if (job) {
                        jobs.push(job);
                    }
                    else {
                        this.logger.warn(`Job not found: ${jobId} in queue ${queueName}`, {
                            queueName,
                            jobId,
                            userId: user?.userId
                        });
                    }
                }
                if (jobs.length === 0) {
                    throw new errors_1.ValidationError('No valid jobs found for batch operation');
                }
                // Execute batch operation with progress tracking
                const progress = await this.batchOperationService.executeBatchJobOperation(jobs, operation, {
                    batchSize: options.batchSize || constants_1.DEFAULTS.BATCH_LIMITS.MAX_JOBS_PER_BATCH,
                    maxConcurrency: options.maxConcurrency || constants_1.DEFAULTS.BATCH_LIMITS.MAX_CONCURRENT_BATCHES,
                    enableRollback: options.enableRollback || false,
                    progressCallback: options.progressCallback
                }, user, options.delay);
                this.logger.info(`Advanced batch job operation completed: ${operation}`, {
                    queueName,
                    operation,
                    operationId: progress.id,
                    total: progress.total,
                    successful: progress.successful,
                    failed: progress.failed,
                    userId: user?.userId
                });
                return progress;
            }
            catch (error) {
                this.logger.error(`Failed to execute advanced batch job operation: ${operation}`, error, {
                    queueName,
                    operation,
                    jobCount: jobIds.length,
                    userId: user?.userId
                });
                throw new errors_1.QueueManagementError(`Failed to execute batch job operation: ${error.message}`, constants_1.ERROR_CODES.INTERNAL_ERROR);
            }
        }
        /**
         * Execute batch queue operation with progress tracking
         */
        async executeBatchQueueOperationWithProgress(queueNames, operation, options = {}, user) {
            try {
                // Validate permissions for all queues
                if (user) {
                    for (const queueName of queueNames) {
                        this.permissionManager.validateQueueOperation(user, operation, queueName);
                    }
                }
                // Validate that all queues exist
                for (const queueName of queueNames) {
                    if (!this.queues.has(queueName)) {
                        throw new errors_1.QueueNotFoundError(queueName);
                    }
                }
                // Execute batch operation with progress tracking
                const progress = await this.batchOperationService.executeBatchQueueOperation(queueNames, operation, {
                    enableRollback: options.enableRollback || false,
                    progressCallback: options.progressCallback
                }, user, options.cleanOptions);
                this.logger.info(`Advanced batch queue operation completed: ${operation}`, {
                    operation,
                    operationId: progress.id,
                    queueCount: queueNames.length,
                    successful: progress.successful,
                    failed: progress.failed,
                    userId: user?.userId
                });
                return progress;
            }
            catch (error) {
                this.logger.error(`Failed to execute advanced batch queue operation: ${operation}`, error, {
                    operation,
                    queueCount: queueNames.length,
                    userId: user?.userId
                });
                throw new errors_1.QueueManagementError(`Failed to execute batch queue operation: ${error.message}`, constants_1.ERROR_CODES.INTERNAL_ERROR);
            }
        }
        /**
         * Get progress of a batch operation
         */
        getBatchOperationProgress(operationId) {
            return this.batchOperationService.getBatchOperationProgress(operationId);
        }
        /**
         * Cancel a running batch operation
         */
        async cancelBatchOperation(operationId, user) {
            try {
                const result = await this.batchOperationService.cancelBatchOperation(operationId, user);
                this.logger.info(`Batch operation cancelled: ${operationId}`, {
                    operationId,
                    userId: user?.userId
                });
                return result;
            }
            catch (error) {
                this.logger.error(`Failed to cancel batch operation: ${operationId}`, error, {
                    operationId,
                    userId: user?.userId
                });
                throw error;
            }
        }
        /**
         * Rollback a completed batch operation
         */
        async rollbackBatchOperation(operationId, user) {
            try {
                // Additional permission check for rollback operations
                if (user && !this.permissionManager.hasElevatedPrivileges(user)) {
                    throw new errors_1.InsufficientPermissionsError('rollback_batch_operation', 'system', user.userId);
                }
                const result = await this.batchOperationService.rollbackBatchOperation(operationId, user);
                this.logger.info(`Batch operation rolled back: ${operationId}`, {
                    operationId,
                    userId: user?.userId
                });
                return result;
            }
            catch (error) {
                this.logger.error(`Failed to rollback batch operation: ${operationId}`, error, {
                    operationId,
                    userId: user?.userId
                });
                throw error;
            }
        }
        /**
         * Get all active batch operations
         */
        getActiveBatchOperations(user) {
            const operations = this.batchOperationService.getActiveBatchOperations();
            // Filter operations based on user permissions if needed
            if (user && !this.permissionManager.hasElevatedPrivileges(user)) {
                // Only return operations initiated by the user
                return operations.filter(op => 
                // This would need to be tracked in the operation metadata
                true // For now, return all operations
                );
            }
            return operations;
        }
        /**
         * Configure flow control for a queue
         */
        async configureFlowControl(config, user) {
            try {
                // Validate that queue exists
                if (!this.queues.has(config.queueName)) {
                    throw new errors_1.QueueNotFoundError(config.queueName);
                }
                await this.flowControlService.configureFlowControl(config, user);
                this.logger.info(`Flow control configured for queue: ${config.queueName}`, {
                    queueName: config.queueName,
                    concurrency: config.concurrency,
                    userId: user?.userId
                });
            }
            catch (error) {
                this.logger.error(`Failed to configure flow control for queue ${config.queueName}:`, error, {
                    queueName: config.queueName,
                    userId: user?.userId
                });
                throw error;
            }
        }
        /**
         * Update queue concurrency
         */
        async updateQueueConcurrency(queueName, concurrency, user) {
            try {
                // Validate that queue exists
                if (!this.queues.has(queueName)) {
                    throw new errors_1.QueueNotFoundError(queueName);
                }
                // Validate concurrency value
                if (concurrency < 1 || concurrency > 1000) {
                    throw new errors_1.ValidationError('Concurrency must be between 1 and 1000', 'concurrency', concurrency);
                }
                await this.flowControlService.updateConcurrency(queueName, concurrency, user);
                this.logger.info(`Concurrency updated for queue: ${queueName}`, {
                    queueName,
                    concurrency,
                    userId: user?.userId
                });
            }
            catch (error) {
                this.logger.error(`Failed to update concurrency for queue ${queueName}:`, error, {
                    queueName,
                    concurrency,
                    userId: user?.userId
                });
                throw error;
            }
        }
        /**
         * Check rate limit for queue operations
         */
        async checkRateLimit(queueName, identifier) {
            try {
                return await this.flowControlService.checkRateLimit(queueName, identifier);
            }
            catch (error) {
                if (error instanceof errors_1.RateLimitExceededError) {
                    throw error;
                }
                this.logger.error(`Failed to check rate limit for queue ${queueName}:`, error, {
                    queueName,
                    identifier
                });
                return true; // Allow on error to avoid blocking
            }
        }
        /**
         * Get flow control metrics for a queue
         */
        async getFlowControlMetrics(queueName) {
            try {
                if (!this.queues.has(queueName)) {
                    throw new errors_1.QueueNotFoundError(queueName);
                }
                return await this.flowControlService.getFlowControlMetrics(queueName);
            }
            catch (error) {
                this.logger.error(`Failed to get flow control metrics for queue ${queueName}:`, error, {
                    queueName
                });
                return null;
            }
        }
        /**
         * Remove flow control configuration for a queue
         */
        async removeFlowControl(queueName, user) {
            try {
                if (!this.queues.has(queueName)) {
                    throw new errors_1.QueueNotFoundError(queueName);
                }
                await this.flowControlService.removeFlowControl(queueName, user);
                this.logger.info(`Flow control removed for queue: ${queueName}`, {
                    queueName,
                    userId: user?.userId
                });
            }
            catch (error) {
                this.logger.error(`Failed to remove flow control for queue ${queueName}:`, error, {
                    queueName,
                    userId: user?.userId
                });
                throw error;
            }
        }
        /**
         * Apply dynamic priority to a job (internal method)
         */
        async applyDynamicPriority(queueName, job) {
            try {
                return await this.flowControlService.applyDynamicPriority(queueName, job);
            }
            catch (error) {
                this.logger.error(`Failed to apply dynamic priority for job ${job.id}:`, error, {
                    queueName,
                    jobId: job.id
                });
                return job.opts.priority || 0;
            }
        }
        /**
         * Check circuit breaker status (internal method)
         */
        async checkCircuitBreaker(queueName) {
            try {
                return await this.flowControlService.checkCircuitBreaker(queueName);
            }
            catch (error) {
                this.logger.error(`Failed to check circuit breaker for queue ${queueName}:`, error, {
                    queueName
                });
                return true; // Allow on error
            }
        }
        /**
         * Record circuit breaker result (internal method)
         */
        async recordCircuitBreakerResult(queueName, success) {
            try {
                await this.flowControlService.recordCircuitBreakerResult(queueName, success);
            }
            catch (error) {
                this.logger.error(`Failed to record circuit breaker result for queue ${queueName}:`, error, {
                    queueName,
                    success
                });
            }
        }
        // Private helper methods
        validateQueueConfig(config) {
            if (!config.name || config.name.trim() === '') {
                throw new errors_1.QueueManagementError('Queue name is required', constants_1.ERROR_CODES.VALIDATION_ERROR);
            }
            if (this.queues.has(config.name)) {
                throw new errors_1.QueueManagementError(`Queue ${config.name} already exists`, constants_1.ERROR_CODES.QUEUE_ALREADY_EXISTS);
            }
        }
        setupEventListeners() {
            this.redis.on('error', (error) => {
                this.logger.error('Redis connection error:', error);
                this.emit('redis:error', error);
            });
            this.redis.on('connect', () => {
                this.logger.info('Redis connected successfully');
                this.emit('redis:connected');
            });
        }
        setupQueueEventListeners(queueName, queueEvents) {
            queueEvents.on('completed', (job) => {
                this.emit(constants_1.EVENT_TYPES.JOB_COMPLETED, {
                    queueName,
                    jobId: job.jobId,
                    returnValue: job.returnvalue,
                    timestamp: new Date()
                });
            });
            queueEvents.on('failed', (job) => {
                this.emit(constants_1.EVENT_TYPES.JOB_FAILED, {
                    queueName,
                    jobId: job.jobId,
                    error: job.failedReason,
                    timestamp: new Date()
                });
            });
            queueEvents.on('active', (job) => {
                this.emit(constants_1.EVENT_TYPES.JOB_STARTED, {
                    queueName,
                    jobId: job.jobId,
                    timestamp: new Date()
                });
            });
        }
        async calculatePerformanceMetrics(queueName, activeJobs, completedJobs, failedJobs) {
            const totalJobs = completedJobs.length + failedJobs.length;
            const successRate = totalJobs > 0 ? (completedJobs.length / totalJobs) * 100 : 100;
            const errorRate = totalJobs > 0 ? (failedJobs.length / totalJobs) * 100 : 0;
            // Calculate average processing time from completed jobs
            const processingTimes = completedJobs
                .filter(job => job.processedOn && job.finishedOn)
                .map(job => job.finishedOn - job.processedOn);
            const avgProcessingTime = processingTimes.length > 0
                ? processingTimes.reduce((sum, time) => sum + time, 0) / processingTimes.length
                : 0;
            // Calculate throughput (jobs per minute)
            const oneMinuteAgo = Date.now() - 60000;
            const recentCompletedJobs = completedJobs.filter(job => job.finishedOn && job.finishedOn > oneMinuteAgo);
            const throughput = recentCompletedJobs.length;
            return {
                throughput,
                avgProcessingTime,
                successRate,
                errorRate
            };
        }
        async calculateResourceUsage(queueName) {
            // This is a simplified implementation
            // In a real scenario, you'd integrate with system monitoring tools
            return {
                memoryUsage: 0, // bytes
                cpuUsage: 0, // percentage
                connections: 1 // number of connections
            };
        }
        determineQueueStatus(counts, performance, resources, queueName) {
            const config = this.queueConfigs.get(queueName);
            const thresholds = config?.alertThresholds;
            // Check if queue is paused
            if (counts.paused > 0) {
                return constants_1.QUEUE_STATES.PAUSED;
            }
            // Check critical conditions
            if (thresholds?.queueSize?.critical && counts.waiting > thresholds.queueSize.critical) {
                return constants_1.QUEUE_STATES.CRITICAL;
            }
            if (thresholds?.errorRate?.critical && performance.errorRate > thresholds.errorRate.critical * 100) {
                return constants_1.QUEUE_STATES.CRITICAL;
            }
            // Check warning conditions
            if (thresholds?.queueSize?.warning && counts.waiting > thresholds.queueSize.warning) {
                return constants_1.QUEUE_STATES.WARNING;
            }
            if (thresholds?.errorRate?.warning && performance.errorRate > thresholds.errorRate.warning * 100) {
                return constants_1.QUEUE_STATES.WARNING;
            }
            return constants_1.QUEUE_STATES.HEALTHY;
        }
        async getJobCount(queue, state) {
            switch (state) {
                case constants_1.JOB_STATES.WAITING:
                    return await queue.getWaitingCount();
                case constants_1.JOB_STATES.ACTIVE:
                    return await queue.getActiveCount();
                case constants_1.JOB_STATES.COMPLETED:
                    return await queue.getCompletedCount();
                case constants_1.JOB_STATES.FAILED:
                    return await queue.getFailedCount();
                case constants_1.JOB_STATES.DELAYED:
                    return await queue.getDelayedCount();
                default:
                    return 0;
            }
        }
        applyJobFilters(jobs, filters) {
            let filteredJobs = jobs;
            if (filters.search) {
                const searchTerm = filters.search.toLowerCase();
                filteredJobs = filteredJobs.filter(job => job.name.toLowerCase().includes(searchTerm) ||
                    job.id?.toString().includes(searchTerm));
            }
            if (filters.correlationId) {
                filteredJobs = filteredJobs.filter(job => job.data?.correlationId === filters.correlationId);
            }
            if (filters.dateRange) {
                filteredJobs = filteredJobs.filter(job => {
                    const jobTime = job.timestamp;
                    return jobTime >= filters.dateRange.start.getTime() &&
                        jobTime <= filters.dateRange.end.getTime();
                });
            }
            return filteredJobs;
        }
        async cacheQueueConfig(config) {
            const key = constants_1.CACHE_KEYS.QUEUE_CONFIG(config.name);
            await this.redis.setex(key, this.config.performance.cacheTtl.queueConfig, JSON.stringify(config));
        }
        async cacheQueueHealth(queueName, health) {
            const key = constants_1.CACHE_KEYS.QUEUE_HEALTH(queueName);
            await this.redis.setex(key, this.config.performance.cacheTtl.queueHealth, JSON.stringify(health));
        }
        async getCachedQueueHealth(queueName) {
            const key = constants_1.CACHE_KEYS.QUEUE_HEALTH(queueName);
            const cached = await this.redis.get(key);
            return cached ? JSON.parse(cached) : null;
        }
        async clearQueueCache(queueName) {
            const keys = [
                constants_1.CACHE_KEYS.QUEUE_CONFIG(queueName),
                constants_1.CACHE_KEYS.QUEUE_HEALTH(queueName)
            ];
            await this.redis.del(...keys);
        }
        startHealthMonitoring() {
            if (this.healthCheckInterval) {
                clearInterval(this.healthCheckInterval);
            }
            this.healthCheckInterval = setInterval(async () => {
                try {
                    const healthMap = await this.getAllQueuesHealth();
                    this.emit('health:updated', healthMap);
                }
                catch (error) {
                    this.logger.error('Health monitoring error:', error);
                }
            }, 30000); // Check every 30 seconds
        }
        // Validation methods
        validatePagination(pagination) {
            if (pagination.page < 1) {
                throw new errors_1.ValidationError('Page must be greater than 0', 'page', pagination.page);
            }
            if (pagination.limit < 1 || pagination.limit > constants_1.DEFAULTS.MAX_PAGE_SIZE) {
                throw new errors_1.ValidationError(`Limit must be between 1 and ${constants_1.DEFAULTS.MAX_PAGE_SIZE}`, 'limit', pagination.limit);
            }
        }
        validateJobState(state) {
            const validStates = Object.values(constants_1.JOB_STATES);
            if (!validStates.includes(state)) {
                throw new errors_1.ValidationError(`Invalid job state: ${state}`, 'state', state);
            }
        }
        validateJobId(jobId) {
            if (!jobId || jobId.trim() === '') {
                throw new errors_1.ValidationError('Job ID is required', 'jobId', jobId);
            }
        }
        validateDelay(delay) {
            if (delay < 0) {
                throw new errors_1.ValidationError('Delay must be non-negative', 'delay', delay);
            }
            if (delay > 365 * 24 * 60 * 60 * 1000) { // 1 year max
                throw new errors_1.ValidationError('Delay cannot exceed 1 year', 'delay', delay);
            }
        }
        validateJobAction(action) {
            const validActions = ['retry', 'remove', 'promote', 'delay'];
            if (!validActions.includes(action.action)) {
                throw new errors_1.ValidationError(`Invalid job action: ${action.action}`, 'action', action.action);
            }
            if (action.action === 'delay' && (action.delay === undefined || action.delay < 0)) {
                throw new errors_1.ValidationError('Delay must be a positive number for delay action');
            }
        }
        validateBatchAction(action) {
            const validActions = ['retry_all_failed', 'clean_completed', 'pause_queue', 'resume_queue'];
            if (!validActions.includes(action.action)) {
                throw new errors_1.ValidationError(`Invalid batch action: ${action.action}`, 'action', action.action);
            }
        }
        getAuditContext() {
            // This method can be used by the audit decorator
            return {
                userId: 'system', // Default, should be overridden by actual user context
                resource: 'queue-manager'
            };
        }
        /**
         * Cleanup resources
         */
        async destroy() {
            if (this.healthCheckInterval) {
                clearInterval(this.healthCheckInterval);
            }
            // Close all queue events
            for (const [queueName, queueEvents] of this.queueEvents) {
                queueEvents.removeAllListeners();
                await queueEvents.close();
            }
            // Cleanup flow control service
            await this.flowControlService.destroy();
            // Close Redis connection
            await this.redis.quit();
            // Clear instance
            QueueManagerService.instance = null;
        }
    };
})();
exports.QueueManagerService = QueueManagerService;
// Export singleton instance getter
const getQueueManager = () => QueueManagerService.getInstance();
exports.getQueueManager = getQueueManager;
