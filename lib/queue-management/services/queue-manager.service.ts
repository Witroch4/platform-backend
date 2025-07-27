/**
 * Queue Manager Service
 * 
 * Central service for managing BullMQ queues with advanced monitoring,
 * health tracking, and event-driven architecture.
 */

import { EventEmitter } from 'events'
import { Queue, Job, QueueEvents } from 'bullmq'
import { Redis } from 'ioredis'
import { 
  QueueConfig, 
  QueueHealth, 
  JobState, 
  QueueState, 
  JobMetrics,
  BatchResult,
  JobAction,
  BatchAction,
  Pagination,
  JobFilters,
  PaginatedResponse,
  User
} from '../../../types/queue-management'
import { 
  JOB_STATES, 
  QUEUE_STATES, 
  EVENT_TYPES, 
  CACHE_KEYS, 
  DEFAULTS,
  ERROR_CODES 
} from '../constants'
import { getQueueManagementConfig } from '../config'
import { 
  QueueManagementError, 
  QueueNotFoundError, 
  JobNotFoundError, 
  JobInvalidStateError,
  ValidationError,
  InsufficientPermissionsError,
  RateLimitExceededError
} from '../errors'
import { Logger, measurePerformance, auditLog } from '../utils/logger'
import { getPermissionManager, PermissionManagerService } from './permission-manager.service'
import { getBatchOperationService, BatchOperationService, BatchOperationProgress } from './batch-operation.service'
import { getFlowControlService, FlowControlService, FlowControlConfig, FlowControlMetrics } from './flow-control.service'

export interface QueueManagerServiceInterface {
  // Queue Registration and Management
  registerQueue(queue: Queue, config: QueueConfig): Promise<void>
  unregisterQueue(queueName: string): Promise<void>
  getRegisteredQueues(): Map<string, Queue>
  
  // Queue Health and Status
  getQueueHealth(queueName: string): Promise<QueueHealth>
  getAllQueuesHealth(): Promise<Map<string, QueueHealth>>
  
  // Job Operations
  getJobs(queueName: string, state: JobState, pagination: Pagination, filters?: JobFilters, user?: User): Promise<PaginatedResponse<Job>>
  getJob(queueName: string, jobId: string, user?: User): Promise<Job | null>
  retryJob(queueName: string, jobId: string, user?: User): Promise<boolean>
  removeJob(queueName: string, jobId: string, user?: User): Promise<boolean>
  promoteJob(queueName: string, jobId: string, user?: User): Promise<boolean>
  delayJob(queueName: string, jobId: string, delay: number, user?: User): Promise<boolean>
  
  // Batch Operations
  retryAllFailed(queueName: string, user?: User): Promise<BatchResult>
  cleanCompleted(queueName: string, olderThan?: number, user?: User): Promise<BatchResult>
  pauseQueue(queueName: string, user?: User): Promise<boolean>
  resumeQueue(queueName: string, user?: User): Promise<boolean>
  
  // Job Actions
  executeJobAction(action: JobAction, user?: User): Promise<BatchResult>
  executeBatchAction(action: BatchAction, user?: User): Promise<BatchResult>
  
  // Advanced Batch Operations
  executeBatchJobOperationWithProgress(
    queueName: string,
    jobIds: string[],
    operation: 'retry' | 'remove' | 'promote' | 'delay',
    options?: { batchSize?: number; maxConcurrency?: number; enableRollback?: boolean; delay?: number },
    user?: User
  ): Promise<BatchOperationProgress>
  
  executeBatchQueueOperationWithProgress(
    queueNames: string[],
    operation: 'pause' | 'resume' | 'clean',
    options?: { enableRollback?: boolean; cleanOptions?: { olderThan: number } },
    user?: User
  ): Promise<BatchOperationProgress>
  
  getBatchOperationProgress(operationId: string): BatchOperationProgress | null
  cancelBatchOperation(operationId: string, user?: User): Promise<boolean>
  rollbackBatchOperation(operationId: string, user?: User): Promise<boolean>
  
  // Flow Control
  configureFlowControl(config: FlowControlConfig, user?: User): Promise<void>
  updateQueueConcurrency(queueName: string, concurrency: number, user?: User): Promise<void>
  checkRateLimit(queueName: string, identifier?: string): Promise<boolean>
  getFlowControlMetrics(queueName: string): Promise<FlowControlMetrics | null>
  removeFlowControl(queueName: string, user?: User): Promise<void>
  
  // Event System
  on(event: string, listener: (...args: any[]) => void): void
  off(event: string, listener: (...args: any[]) => void): void
  emit(event: string, ...args: any[]): boolean
}

/**
 * Singleton Queue Manager Service
 */
export class QueueManagerService extends EventEmitter implements QueueManagerServiceInterface {
  private static instance: QueueManagerService | null = null
  private queues = new Map<string, Queue>()
  private queueConfigs = new Map<string, QueueConfig>()
  private queueEvents = new Map<string, QueueEvents>()
  private redis: Redis
  private logger: Logger
  private permissionManager: PermissionManagerService
  private batchOperationService: BatchOperationService
  private flowControlService: FlowControlService
  private config = getQueueManagementConfig()
  private healthCheckInterval: NodeJS.Timeout | null = null

  private constructor() {
    super()
    this.logger = new Logger('QueueManagerService')
    this.permissionManager = getPermissionManager()
    this.batchOperationService = getBatchOperationService()
    this.redis = new Redis(this.config.redis)
    this.flowControlService = getFlowControlService(this.redis)
    this.setupEventListeners()
    this.startHealthMonitoring()
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): QueueManagerService {
    if (!QueueManagerService.instance) {
      QueueManagerService.instance = new QueueManagerService()
    }
    return QueueManagerService.instance
  }

  /**
   * Register a queue with the manager
   */
  public async registerQueue(queue: Queue, config: QueueConfig): Promise<void> {
    try {
      this.logger.info(`Registering queue: ${config.name}`)
      
      // Validate queue configuration
      this.validateQueueConfig(config)
      
      // Store queue and config
      this.queues.set(config.name, queue)
      this.queueConfigs.set(config.name, config)
      
      // Setup queue events
      const queueEvents = new QueueEvents(config.name, { connection: this.redis })
      this.queueEvents.set(config.name, queueEvents)
      
      // Setup event listeners for this queue
      this.setupQueueEventListeners(config.name, queueEvents)
      
      // Cache queue configuration
      if (this.config.performance.cacheEnabled) {
        await this.cacheQueueConfig(config)
      }
      
      // Emit registration event
      this.emit(EVENT_TYPES.QUEUE_CREATED, {
        queueName: config.name,
        config,
        timestamp: new Date()
      })
      
      this.logger.info(`Queue registered successfully: ${config.name}`)
    } catch (error) {
      this.logger.error(`Failed to register queue ${config.name}:`, error)
      throw new QueueManagementError(
        `Failed to register queue: ${error.message}`,
        ERROR_CODES.INTERNAL_ERROR
      )
    }
  }

  /**
   * Unregister a queue from the manager
   */
  public async unregisterQueue(queueName: string): Promise<void> {
    try {
      this.logger.info(`Unregistering queue: ${queueName}`)
      
      // Remove event listeners
      const queueEvents = this.queueEvents.get(queueName)
      if (queueEvents) {
        queueEvents.removeAllListeners()
        await queueEvents.close()
        this.queueEvents.delete(queueName)
      }
      
      // Remove from maps
      this.queues.delete(queueName)
      this.queueConfigs.delete(queueName)
      
      // Clear cache
      if (this.config.performance.cacheEnabled) {
        await this.clearQueueCache(queueName)
      }
      
      // Emit unregistration event
      this.emit(EVENT_TYPES.QUEUE_DELETED, {
        queueName,
        timestamp: new Date()
      })
      
      this.logger.info(`Queue unregistered successfully: ${queueName}`)
    } catch (error) {
      this.logger.error(`Failed to unregister queue ${queueName}:`, error)
      throw new QueueManagementError(
        `Failed to unregister queue: ${error.message}`,
        ERROR_CODES.INTERNAL_ERROR
      )
    }
  }

  /**
   * Get all registered queues
   */
  public getRegisteredQueues(): Map<string, Queue> {
    return new Map(this.queues)
  }

  /**
   * Get health status for a specific queue
   */
  public async getQueueHealth(queueName: string): Promise<QueueHealth> {
    try {
      // Check cache first
      if (this.config.performance.cacheEnabled) {
        const cached = await this.getCachedQueueHealth(queueName)
        if (cached) {
          return cached
        }
      }

      const queue = this.queues.get(queueName)
      if (!queue) {
        throw new QueueNotFoundError(queueName)
      }

      // Get job counts
      const waiting = await queue.getWaiting()
      const active = await queue.getActive()
      const completed = await queue.getCompleted()
      const failed = await queue.getFailed()
      const delayed = await queue.getDelayed()
      const paused = await queue.isPaused()

      const counts = {
        waiting: waiting.length,
        active: active.length,
        completed: completed.length,
        failed: failed.length,
        delayed: delayed.length,
        paused: paused ? 1 : 0
      }

      // Calculate performance metrics
      const performance = await this.calculatePerformanceMetrics(queueName, active, completed, failed)
      
      // Calculate resource usage
      const resources = await this.calculateResourceUsage(queueName)
      
      // Determine queue status
      const status = this.determineQueueStatus(counts, performance, resources, queueName)

      const health: QueueHealth = {
        name: queueName,
        status,
        counts,
        performance,
        resources,
        lastUpdated: new Date()
      }

      // Cache the result
      if (this.config.performance.cacheEnabled) {
        await this.cacheQueueHealth(queueName, health)
      }

      return health
    } catch (error) {
      this.logger.error(`Failed to get queue health for ${queueName}:`, error)
      if (error instanceof QueueNotFoundError) {
        throw error
      }
      throw new QueueManagementError(
        `Failed to get queue health: ${error.message}`,
        ERROR_CODES.INTERNAL_ERROR
      )
    }
  }

  /**
   * Get health status for all registered queues
   */
  public async getAllQueuesHealth(): Promise<Map<string, QueueHealth>> {
    const healthMap = new Map<string, QueueHealth>()
    
    const promises = Array.from(this.queues.keys()).map(async (queueName) => {
      try {
        const health = await this.getQueueHealth(queueName)
        healthMap.set(queueName, health)
      } catch (error) {
        this.logger.error(`Failed to get health for queue ${queueName}:`, error)
        // Continue with other queues even if one fails
      }
    })

    await Promise.all(promises)
    return healthMap
  }

  /**
   * Get jobs from a queue with pagination and filters
   */
  public async getJobs(
    queueName: string, 
    state: JobState, 
    pagination: Pagination,
    filters?: JobFilters,
    user?: User
  ): Promise<PaginatedResponse<Job>> {
    try {
      // Validate permissions
      if (user) {
        this.permissionManager.validateJobOperation(user, 'view', queueName)
      }

      // Validate inputs
      this.validatePagination(pagination)
      this.validateJobState(state)

      const queue = this.queues.get(queueName)
      if (!queue) {
        throw new QueueNotFoundError(queueName)
      }

      const { page, limit } = pagination
      const start = (page - 1) * limit
      const end = start + limit - 1

      let jobs: Job[] = []
      
      // Get jobs based on state
      switch (state) {
        case JOB_STATES.WAITING:
          jobs = await queue.getWaiting(start, end)
          break
        case JOB_STATES.ACTIVE:
          jobs = await queue.getActive(start, end)
          break
        case JOB_STATES.COMPLETED:
          jobs = await queue.getCompleted(start, end)
          break
        case JOB_STATES.FAILED:
          jobs = await queue.getFailed(start, end)
          break
        case JOB_STATES.DELAYED:
          jobs = await queue.getDelayed(start, end)
          break
        default:
          throw new ValidationError(`Invalid job state: ${state}`)
      }

      // Apply filters if provided
      if (filters) {
        jobs = this.applyJobFilters(jobs, filters)
      }

      // Get total count for pagination
      const totalCount = await this.getJobCount(queue, state)
      const totalPages = Math.ceil(totalCount / limit)

      this.logger.debug(`Retrieved ${jobs.length} jobs from queue ${queueName}`, {
        queueName,
        state,
        page,
        limit,
        totalCount,
        userId: user?.userId
      })

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
      }
    } catch (error) {
      this.logger.error(`Failed to get jobs for queue ${queueName}:`, error, {
        queueName,
        state,
        userId: user?.userId
      })
      if (error instanceof QueueNotFoundError || error instanceof QueueManagementError) {
        throw error
      }
      throw new QueueManagementError(
        `Failed to get jobs: ${error.message}`,
        ERROR_CODES.INTERNAL_ERROR
      )
    }
  }

  /**
   * Get a specific job by ID
   */
  public async getJob(queueName: string, jobId: string, user?: User): Promise<Job | null> {
    try {
      // Validate permissions
      if (user) {
        this.permissionManager.validateJobOperation(user, 'view', queueName, jobId)
      }

      // Validate inputs
      this.validateJobId(jobId)

      const queue = this.queues.get(queueName)
      if (!queue) {
        throw new QueueNotFoundError(queueName)
      }

      const job = await queue.getJob(jobId)
      
      this.logger.debug(`Retrieved job ${jobId} from queue ${queueName}`, {
        queueName,
        jobId,
        found: !!job,
        userId: user?.userId
      })

      return job
    } catch (error) {
      this.logger.error(`Failed to get job ${jobId} from queue ${queueName}:`, error, {
        queueName,
        jobId,
        userId: user?.userId
      })
      if (error instanceof QueueNotFoundError || error instanceof QueueManagementError) {
        throw error
      }
      throw new QueueManagementError(
        `Failed to get job: ${error.message}`,
        ERROR_CODES.INTERNAL_ERROR
      )
    }
  }

  /**
   * Retry a specific job
   */
  public async retryJob(queueName: string, jobId: string, user?: User): Promise<boolean> {
    try {
      // Validate permissions
      if (user) {
        this.permissionManager.validateJobOperation(user, 'retry', queueName, jobId)
      }

      // Validate inputs
      this.validateJobId(jobId)

      const job = await this.getJob(queueName, jobId, user)
      if (!job) {
        throw new JobNotFoundError(jobId, queueName)
      }

      // Validate job state
      if (job.finishedOn && !job.failedReason) {
        throw new JobInvalidStateError(jobId, 'completed', 'failed')
      }

      const previousAttempts = job.attemptsMade
      await job.retry()
      
      // Emit event
      this.emit(EVENT_TYPES.JOB_RETRIED, {
        queueName,
        jobId,
        previousAttempts,
        userId: user?.userId,
        timestamp: new Date()
      })

      this.logger.info(`Job retried successfully: ${jobId} in queue ${queueName}`, {
        queueName,
        jobId,
        previousAttempts,
        userId: user?.userId
      })
      
      return true
    } catch (error) {
      this.logger.error(`Failed to retry job ${jobId} in queue ${queueName}:`, error, {
        queueName,
        jobId,
        userId: user?.userId
      })
      if (error instanceof JobNotFoundError || 
          error instanceof QueueNotFoundError || 
          error instanceof JobInvalidStateError ||
          error instanceof QueueManagementError) {
        throw error
      }
      throw new QueueManagementError(
        `Failed to retry job: ${error.message}`,
        ERROR_CODES.INTERNAL_ERROR
      )
    }
  }

  /**
   * Remove a specific job
   */
  @measurePerformance(new Logger('QueueManagerService'), 'removeJob')
  @auditLog(new Logger('QueueManagerService'), 'job:remove')
  public async removeJob(queueName: string, jobId: string, user?: User): Promise<boolean> {
    try {
      // Validate permissions
      if (user) {
        this.permissionManager.validateJobOperation(user, 'remove', queueName, jobId)
      }

      // Validate inputs
      this.validateJobId(jobId)

      const job = await this.getJob(queueName, jobId, user)
      if (!job) {
        throw new JobNotFoundError(jobId, queueName)
      }

      // Store job info before removal
      const jobInfo = {
        id: job.id,
        name: job.name,
        data: job.data,
        state: await job.getState(),
        attempts: job.attemptsMade
      }

      await job.remove()
      
      // Emit event
      this.emit(EVENT_TYPES.JOB_REMOVED, {
        queueName,
        jobId,
        jobInfo,
        userId: user?.userId,
        timestamp: new Date()
      })

      this.logger.info(`Job removed successfully: ${jobId} from queue ${queueName}`, {
        queueName,
        jobId,
        jobName: jobInfo.name,
        userId: user?.userId
      })
      
      return true
    } catch (error) {
      this.logger.error(`Failed to remove job ${jobId} from queue ${queueName}:`, error, {
        queueName,
        jobId,
        userId: user?.userId
      })
      if (error instanceof JobNotFoundError || 
          error instanceof QueueNotFoundError || 
          error instanceof QueueManagementError) {
        throw error
      }
      throw new QueueManagementError(
        `Failed to remove job: ${error.message}`,
        ERROR_CODES.INTERNAL_ERROR
      )
    }
  }

  /**
   * Promote a delayed job to waiting
   */
  @measurePerformance(new Logger('QueueManagerService'), 'promoteJob')
  @auditLog(new Logger('QueueManagerService'), 'job:promote')
  public async promoteJob(queueName: string, jobId: string, user?: User): Promise<boolean> {
    try {
      // Validate permissions
      if (user) {
        this.permissionManager.validateJobOperation(user, 'promote', queueName, jobId)
      }

      // Validate inputs
      this.validateJobId(jobId)

      const job = await this.getJob(queueName, jobId, user)
      if (!job) {
        throw new JobNotFoundError(jobId, queueName)
      }

      // Validate job state - only delayed jobs can be promoted
      const jobState = await job.getState()
      if (jobState !== 'delayed') {
        throw new JobInvalidStateError(jobId, jobState, 'delayed')
      }

      const originalDelay = job.delay
      await job.promote()
      
      // Emit event
      this.emit(EVENT_TYPES.JOB_PROMOTED, {
        queueName,
        jobId,
        originalDelay,
        userId: user?.userId,
        timestamp: new Date()
      })

      this.logger.info(`Job promoted successfully: ${jobId} in queue ${queueName}`, {
        queueName,
        jobId,
        originalDelay,
        userId: user?.userId
      })
      
      return true
    } catch (error) {
      this.logger.error(`Failed to promote job ${jobId} in queue ${queueName}:`, error, {
        queueName,
        jobId,
        userId: user?.userId
      })
      if (error instanceof JobNotFoundError || 
          error instanceof QueueNotFoundError || 
          error instanceof JobInvalidStateError ||
          error instanceof QueueManagementError) {
        throw error
      }
      throw new QueueManagementError(
        `Failed to promote job: ${error.message}`,
        ERROR_CODES.INTERNAL_ERROR
      )
    }
  }

  /**
   * Delay a job by specified milliseconds
   */
  @measurePerformance(new Logger('QueueManagerService'), 'delayJob')
  @auditLog(new Logger('QueueManagerService'), 'job:delay')
  public async delayJob(queueName: string, jobId: string, delay: number, user?: User): Promise<boolean> {
    try {
      // Validate permissions
      if (user) {
        this.permissionManager.validateJobOperation(user, 'delay', queueName, jobId)
      }

      // Validate inputs
      this.validateJobId(jobId)
      this.validateDelay(delay)

      const job = await this.getJob(queueName, jobId, user)
      if (!job) {
        throw new JobNotFoundError(jobId, queueName)
      }

      // Validate job state - only waiting jobs can be delayed
      const jobState = await job.getState()
      if (jobState !== 'waiting') {
        throw new JobInvalidStateError(jobId, jobState, 'waiting')
      }

      // Update job with delay
      await job.changeDelay(delay)
      
      // Emit event
      this.emit(EVENT_TYPES.JOB_DELAYED, {
        queueName,
        jobId,
        delay,
        userId: user?.userId,
        timestamp: new Date()
      })

      this.logger.info(`Job delayed successfully: ${jobId} in queue ${queueName}`, {
        queueName,
        jobId,
        delay,
        userId: user?.userId
      })
      
      return true
    } catch (error) {
      this.logger.error(`Failed to delay job ${jobId} in queue ${queueName}:`, error, {
        queueName,
        jobId,
        delay,
        userId: user?.userId
      })
      if (error instanceof JobNotFoundError || 
          error instanceof QueueNotFoundError || 
          error instanceof JobInvalidStateError ||
          error instanceof QueueManagementError) {
        throw error
      }
      throw new QueueManagementError(
        `Failed to delay job: ${error.message}`,
        ERROR_CODES.INTERNAL_ERROR
      )
    }
  }

  /**
   * Retry all failed jobs in a queue
   */
  public async retryAllFailed(queueName: string, user?: User): Promise<BatchResult> {
    try {
      // Validate permissions
      if (user) {
        this.permissionManager.validateBatchOperation(user, 'retry_all_failed', queueName, 0)
      }

      const queue = this.queues.get(queueName)
      if (!queue) {
        throw new QueueNotFoundError(queueName)
      }

      const failedJobs = await queue.getFailed()
      
      // Additional permission check for large batches
      if (user) {
        this.permissionManager.validateBatchOperation(user, 'retry_all_failed', queueName, failedJobs.length)
      }

      const result: BatchResult = {
        total: failedJobs.length,
        successful: 0,
        failed: 0,
        errors: []
      }

      for (const job of failedJobs) {
        try {
          await job.retry()
          result.successful++
        } catch (error) {
          result.failed++
          result.errors.push({
            id: job.id!,
            error: error.message
          })
        }
      }

      this.logger.info(`Batch retry completed for queue ${queueName}: ${result.successful}/${result.total} successful`, {
        queueName,
        result,
        userId: user?.userId
      })
      
      return result
    } catch (error) {
      this.logger.error(`Failed to retry all failed jobs in queue ${queueName}:`, error, {
        queueName,
        userId: user?.userId
      })
      if (error instanceof QueueNotFoundError || error instanceof QueueManagementError) {
        throw error
      }
      throw new QueueManagementError(
        `Failed to retry all failed jobs: ${error.message}`,
        ERROR_CODES.INTERNAL_ERROR
      )
    }
  }

  /**
   * Clean completed jobs older than specified time
   */
  @measurePerformance(new Logger('QueueManagerService'), 'cleanCompleted')
  @auditLog(new Logger('QueueManagerService'), 'batch:clean_completed')
  public async cleanCompleted(queueName: string, olderThan: number = 24 * 60 * 60 * 1000, user?: User): Promise<BatchResult> {
    try {
      // Validate permissions
      if (user) {
        this.permissionManager.validateBatchOperation(user, 'clean_completed', queueName, 0)
      }

      // Validate inputs
      if (olderThan < 0) {
        throw new ValidationError('olderThan must be non-negative', 'olderThan', olderThan)
      }

      const queue = this.queues.get(queueName)
      if (!queue) {
        throw new QueueNotFoundError(queueName)
      }

      const completedJobs = await queue.getCompleted()
      const cutoffTime = Date.now() - olderThan
      const jobsToClean = completedJobs.filter(job => job.finishedOn && job.finishedOn < cutoffTime)

      // Additional permission check for large batches
      if (user) {
        this.permissionManager.validateBatchOperation(user, 'clean_completed', queueName, jobsToClean.length)
      }

      const result: BatchResult = {
        total: jobsToClean.length,
        successful: 0,
        failed: 0,
        errors: []
      }

      for (const job of jobsToClean) {
        try {
          await job.remove()
          result.successful++
        } catch (error) {
          result.failed++
          result.errors.push({
            id: job.id!,
            error: error.message
          })
        }
      }

      this.logger.info(`Batch cleanup completed for queue ${queueName}: ${result.successful}/${result.total} jobs cleaned`, {
        queueName,
        olderThan,
        cutoffTime: new Date(cutoffTime),
        result,
        userId: user?.userId
      })
      
      return result
    } catch (error) {
      this.logger.error(`Failed to clean completed jobs in queue ${queueName}:`, error, {
        queueName,
        olderThan,
        userId: user?.userId
      })
      if (error instanceof QueueNotFoundError || error instanceof QueueManagementError) {
        throw error
      }
      throw new QueueManagementError(
        `Failed to clean completed jobs: ${error.message}`,
        ERROR_CODES.INTERNAL_ERROR
      )
    }
  }

  /**
   * Pause a queue
   */
  public async pauseQueue(queueName: string, user?: User): Promise<boolean> {
    try {
      // Validate permissions
      if (user) {
        this.permissionManager.validateQueueOperation(user, 'pause', queueName)
      }

      const queue = this.queues.get(queueName)
      if (!queue) {
        throw new QueueNotFoundError(queueName)
      }

      // Check if queue is already paused
      const isPaused = await queue.isPaused()
      if (isPaused) {
        this.logger.warn(`Queue ${queueName} is already paused`, {
          queueName,
          userId: user?.userId
        })
        return true
      }

      await queue.pause()
      
      // Emit event
      this.emit(EVENT_TYPES.QUEUE_PAUSED, {
        queueName,
        userId: user?.userId,
        timestamp: new Date()
      })

      this.logger.info(`Queue paused successfully: ${queueName}`, {
        queueName,
        userId: user?.userId
      })
      
      return true
    } catch (error) {
      this.logger.error(`Failed to pause queue ${queueName}:`, error, {
        queueName,
        userId: user?.userId
      })
      if (error instanceof QueueNotFoundError || error instanceof QueueManagementError) {
        throw error
      }
      throw new QueueManagementError(
        `Failed to pause queue: ${error.message}`,
        ERROR_CODES.INTERNAL_ERROR
      )
    }
  }

  /**
   * Resume a paused queue
   */
  public async resumeQueue(queueName: string, user?: User): Promise<boolean> {
    try {
      // Validate permissions
      if (user) {
        this.permissionManager.validateQueueOperation(user, 'resume', queueName)
      }

      const queue = this.queues.get(queueName)
      if (!queue) {
        throw new QueueNotFoundError(queueName)
      }

      // Check if queue is already running
      const isPaused = await queue.isPaused()
      if (!isPaused) {
        this.logger.warn(`Queue ${queueName} is already running`, {
          queueName,
          userId: user?.userId
        })
        return true
      }

      await queue.resume()
      
      // Emit event
      this.emit(EVENT_TYPES.QUEUE_RESUMED, {
        queueName,
        userId: user?.userId,
        timestamp: new Date()
      })

      this.logger.info(`Queue resumed successfully: ${queueName}`, {
        queueName,
        userId: user?.userId
      })
      
      return true
    } catch (error) {
      this.logger.error(`Failed to resume queue ${queueName}:`, error, {
        queueName,
        userId: user?.userId
      })
      if (error instanceof QueueNotFoundError || error instanceof QueueManagementError) {
        throw error
      }
      throw new QueueManagementError(
        `Failed to resume queue: ${error.message}`,
        ERROR_CODES.INTERNAL_ERROR
      )
    }
  }

  /**
   * Execute a job action (retry, remove, promote, delay)
   */
  @measurePerformance(new Logger('QueueManagerService'), 'executeJobAction')
  public async executeJobAction(action: JobAction, user?: User): Promise<BatchResult> {
    try {
      // Validate action
      this.validateJobAction(action)

      const result: BatchResult = {
        total: action.jobIds.length,
        successful: 0,
        failed: 0,
        errors: []
      }

      // Process each job
      for (const jobId of action.jobIds) {
        try {
          let success = false
          
          switch (action.action) {
            case 'retry':
              success = await this.retryJob('', jobId, user) // Queue name should be provided in action
              break
            case 'remove':
              success = await this.removeJob('', jobId, user)
              break
            case 'promote':
              success = await this.promoteJob('', jobId, user)
              break
            case 'delay':
              success = await this.delayJob('', jobId, action.delay || 0, user)
              break
          }

          if (success) {
            result.successful++
          } else {
            result.failed++
            result.errors.push({
              id: jobId,
              error: 'Operation failed'
            })
          }
        } catch (error) {
          result.failed++
          result.errors.push({
            id: jobId,
            error: error.message
          })
        }
      }

      this.logger.info(`Batch job action completed: ${action.action}`, {
        action: action.action,
        total: result.total,
        successful: result.successful,
        failed: result.failed,
        userId: user?.userId
      })

      return result
    } catch (error) {
      this.logger.error(`Failed to execute job action:`, error, {
        action: action.action,
        jobCount: action.jobIds.length,
        userId: user?.userId
      })
      throw new QueueManagementError(
        `Failed to execute job action: ${error.message}`,
        ERROR_CODES.INTERNAL_ERROR
      )
    }
  }

  /**
   * Execute a batch action (retry all failed, clean completed, pause/resume queue)
   */
  @measurePerformance(new Logger('QueueManagerService'), 'executeBatchAction')
  public async executeBatchAction(action: BatchAction, user?: User): Promise<BatchResult> {
    try {
      // Validate action
      this.validateBatchAction(action)

      let result: BatchResult

      switch (action.action) {
        case 'retry_all_failed':
          result = await this.retryAllFailed(action.queueName, user)
          break
        case 'clean_completed':
          const olderThan = action.options?.olderThan || 24 * 60 * 60 * 1000 // 24 hours default
          result = await this.cleanCompleted(action.queueName, olderThan, user)
          break
        case 'pause_queue':
          const pauseSuccess = await this.pauseQueue(action.queueName, user)
          result = {
            total: 1,
            successful: pauseSuccess ? 1 : 0,
            failed: pauseSuccess ? 0 : 1,
            errors: pauseSuccess ? [] : [{ id: action.queueName, error: 'Failed to pause queue' }]
          }
          break
        case 'resume_queue':
          const resumeSuccess = await this.resumeQueue(action.queueName, user)
          result = {
            total: 1,
            successful: resumeSuccess ? 1 : 0,
            failed: resumeSuccess ? 0 : 1,
            errors: resumeSuccess ? [] : [{ id: action.queueName, error: 'Failed to resume queue' }]
          }
          break
        default:
          throw new ValidationError(`Invalid batch action: ${action.action}`)
      }

      this.logger.info(`Batch action completed: ${action.action}`, {
        action: action.action,
        queueName: action.queueName,
        result,
        userId: user?.userId
      })

      return result
    } catch (error) {
      this.logger.error(`Failed to execute batch action:`, error, {
        action: action.action,
        queueName: action.queueName,
        userId: user?.userId
      })
      throw new QueueManagementError(
        `Failed to execute batch action: ${error.message}`,
        ERROR_CODES.INTERNAL_ERROR
      )
    }
  }

  /**
   * Execute batch job operation with progress tracking and rollback support
   */
  @measurePerformance(new Logger('QueueManagerService'), 'executeBatchJobOperationWithProgress')
  public async executeBatchJobOperationWithProgress(
    queueName: string,
    jobIds: string[],
    operation: 'retry' | 'remove' | 'promote' | 'delay',
    options: { 
      batchSize?: number; 
      maxConcurrency?: number; 
      enableRollback?: boolean; 
      delay?: number;
      progressCallback?: (progress: BatchOperationProgress) => void;
    } = {},
    user?: User
  ): Promise<BatchOperationProgress> {
    try {
      // Validate permissions
      if (user) {
        this.permissionManager.validateBatchOperation(user, `${operation}_batch`, queueName, jobIds.length)
      }

      // Get queue
      const queue = this.queues.get(queueName)
      if (!queue) {
        throw new QueueNotFoundError(queueName)
      }

      // Get jobs
      const jobs: Job[] = []
      for (const jobId of jobIds) {
        const job = await queue.getJob(jobId)
        if (job) {
          jobs.push(job)
        } else {
          this.logger.warn(`Job not found: ${jobId} in queue ${queueName}`, {
            queueName,
            jobId,
            userId: user?.userId
          })
        }
      }

      if (jobs.length === 0) {
        throw new ValidationError('No valid jobs found for batch operation')
      }

      // Execute batch operation with progress tracking
      const progress = await this.batchOperationService.executeBatchJobOperation(
        jobs,
        operation,
        {
          batchSize: options.batchSize || DEFAULTS.BATCH_LIMITS.MAX_JOBS_PER_BATCH,
          maxConcurrency: options.maxConcurrency || DEFAULTS.BATCH_LIMITS.MAX_CONCURRENT_BATCHES,
          enableRollback: options.enableRollback || false,
          progressCallback: options.progressCallback
        },
        user,
        options.delay
      )

      this.logger.info(`Advanced batch job operation completed: ${operation}`, {
        queueName,
        operation,
        operationId: progress.id,
        total: progress.total,
        successful: progress.successful,
        failed: progress.failed,
        userId: user?.userId
      })

      return progress
    } catch (error) {
      this.logger.error(`Failed to execute advanced batch job operation: ${operation}`, error, {
        queueName,
        operation,
        jobCount: jobIds.length,
        userId: user?.userId
      })
      throw new QueueManagementError(
        `Failed to execute batch job operation: ${error.message}`,
        ERROR_CODES.INTERNAL_ERROR
      )
    }
  }

  /**
   * Execute batch queue operation with progress tracking
   */
  @measurePerformance(new Logger('QueueManagerService'), 'executeBatchQueueOperationWithProgress')
  public async executeBatchQueueOperationWithProgress(
    queueNames: string[],
    operation: 'pause' | 'resume' | 'clean',
    options: { 
      enableRollback?: boolean; 
      cleanOptions?: { olderThan: number };
      progressCallback?: (progress: BatchOperationProgress) => void;
    } = {},
    user?: User
  ): Promise<BatchOperationProgress> {
    try {
      // Validate permissions for all queues
      if (user) {
        for (const queueName of queueNames) {
          this.permissionManager.validateQueueOperation(user, operation, queueName)
        }
      }

      // Validate that all queues exist
      for (const queueName of queueNames) {
        if (!this.queues.has(queueName)) {
          throw new QueueNotFoundError(queueName)
        }
      }

      // Execute batch operation with progress tracking
      const progress = await this.batchOperationService.executeBatchQueueOperation(
        queueNames,
        operation,
        {
          enableRollback: options.enableRollback || false,
          progressCallback: options.progressCallback
        },
        user,
        options.cleanOptions
      )

      this.logger.info(`Advanced batch queue operation completed: ${operation}`, {
        operation,
        operationId: progress.id,
        queueCount: queueNames.length,
        successful: progress.successful,
        failed: progress.failed,
        userId: user?.userId
      })

      return progress
    } catch (error) {
      this.logger.error(`Failed to execute advanced batch queue operation: ${operation}`, error, {
        operation,
        queueCount: queueNames.length,
        userId: user?.userId
      })
      throw new QueueManagementError(
        `Failed to execute batch queue operation: ${error.message}`,
        ERROR_CODES.INTERNAL_ERROR
      )
    }
  }

  /**
   * Get progress of a batch operation
   */
  public getBatchOperationProgress(operationId: string): BatchOperationProgress | null {
    return this.batchOperationService.getBatchOperationProgress(operationId)
  }

  /**
   * Cancel a running batch operation
   */
  @auditLog(new Logger('QueueManagerService'), 'batch:cancel')
  public async cancelBatchOperation(operationId: string, user?: User): Promise<boolean> {
    try {
      const result = await this.batchOperationService.cancelBatchOperation(operationId, user)
      
      this.logger.info(`Batch operation cancelled: ${operationId}`, {
        operationId,
        userId: user?.userId
      })

      return result
    } catch (error) {
      this.logger.error(`Failed to cancel batch operation: ${operationId}`, error, {
        operationId,
        userId: user?.userId
      })
      throw error
    }
  }

  /**
   * Rollback a completed batch operation
   */
  @auditLog(new Logger('QueueManagerService'), 'batch:rollback')
  public async rollbackBatchOperation(operationId: string, user?: User): Promise<boolean> {
    try {
      // Additional permission check for rollback operations
      if (user && !this.permissionManager.hasElevatedPrivileges(user)) {
        throw new InsufficientPermissionsError('rollback_batch_operation', 'system', user.userId)
      }

      const result = await this.batchOperationService.rollbackBatchOperation(operationId, user)
      
      this.logger.info(`Batch operation rolled back: ${operationId}`, {
        operationId,
        userId: user?.userId
      })

      return result
    } catch (error) {
      this.logger.error(`Failed to rollback batch operation: ${operationId}`, error, {
        operationId,
        userId: user?.userId
      })
      throw error
    }
  }

  /**
   * Get all active batch operations
   */
  public getActiveBatchOperations(user?: User): BatchOperationProgress[] {
    const operations = this.batchOperationService.getActiveBatchOperations()
    
    // Filter operations based on user permissions if needed
    if (user && !this.permissionManager.hasElevatedPrivileges(user)) {
      // Only return operations initiated by the user
      return operations.filter(op => 
        // This would need to be tracked in the operation metadata
        true // For now, return all operations
      )
    }

    return operations
  }

  /**
   * Configure flow control for a queue
   */
  @measurePerformance(new Logger('QueueManagerService'), 'configureFlowControl')
  @auditLog(new Logger('QueueManagerService'), 'flow_control:configure')
  public async configureFlowControl(config: FlowControlConfig, user?: User): Promise<void> {
    try {
      // Validate that queue exists
      if (!this.queues.has(config.queueName)) {
        throw new QueueNotFoundError(config.queueName)
      }

      await this.flowControlService.configureFlowControl(config, user)
      
      this.logger.info(`Flow control configured for queue: ${config.queueName}`, {
        queueName: config.queueName,
        concurrency: config.concurrency,
        userId: user?.userId
      })

    } catch (error) {
      this.logger.error(`Failed to configure flow control for queue ${config.queueName}:`, error, {
        queueName: config.queueName,
        userId: user?.userId
      })
      throw error
    }
  }

  /**
   * Update queue concurrency
   */
  @measurePerformance(new Logger('QueueManagerService'), 'updateQueueConcurrency')
  @auditLog(new Logger('QueueManagerService'), 'queue:update_concurrency')
  public async updateQueueConcurrency(queueName: string, concurrency: number, user?: User): Promise<void> {
    try {
      // Validate that queue exists
      if (!this.queues.has(queueName)) {
        throw new QueueNotFoundError(queueName)
      }

      // Validate concurrency value
      if (concurrency < 1 || concurrency > 1000) {
        throw new ValidationError('Concurrency must be between 1 and 1000', 'concurrency', concurrency)
      }

      await this.flowControlService.updateConcurrency(queueName, concurrency, user)
      
      this.logger.info(`Concurrency updated for queue: ${queueName}`, {
        queueName,
        concurrency,
        userId: user?.userId
      })

    } catch (error) {
      this.logger.error(`Failed to update concurrency for queue ${queueName}:`, error, {
        queueName,
        concurrency,
        userId: user?.userId
      })
      throw error
    }
  }

  /**
   * Check rate limit for queue operations
   */
  public async checkRateLimit(queueName: string, identifier?: string): Promise<boolean> {
    try {
      return await this.flowControlService.checkRateLimit(queueName, identifier)
    } catch (error) {
      if (error instanceof RateLimitExceededError) {
        throw error
      }
      this.logger.error(`Failed to check rate limit for queue ${queueName}:`, error, {
        queueName,
        identifier
      })
      return true // Allow on error to avoid blocking
    }
  }

  /**
   * Get flow control metrics for a queue
   */
  @measurePerformance(new Logger('QueueManagerService'), 'getFlowControlMetrics')
  public async getFlowControlMetrics(queueName: string): Promise<FlowControlMetrics | null> {
    try {
      if (!this.queues.has(queueName)) {
        throw new QueueNotFoundError(queueName)
      }

      return await this.flowControlService.getFlowControlMetrics(queueName)
    } catch (error) {
      this.logger.error(`Failed to get flow control metrics for queue ${queueName}:`, error, {
        queueName
      })
      return null
    }
  }

  /**
   * Remove flow control configuration for a queue
   */
  @measurePerformance(new Logger('QueueManagerService'), 'removeFlowControl')
  @auditLog(new Logger('QueueManagerService'), 'flow_control:remove')
  public async removeFlowControl(queueName: string, user?: User): Promise<void> {
    try {
      if (!this.queues.has(queueName)) {
        throw new QueueNotFoundError(queueName)
      }

      await this.flowControlService.removeFlowControl(queueName, user)
      
      this.logger.info(`Flow control removed for queue: ${queueName}`, {
        queueName,
        userId: user?.userId
      })

    } catch (error) {
      this.logger.error(`Failed to remove flow control for queue ${queueName}:`, error, {
        queueName,
        userId: user?.userId
      })
      throw error
    }
  }

  /**
   * Apply dynamic priority to a job (internal method)
   */
  private async applyDynamicPriority(queueName: string, job: Job): Promise<number> {
    try {
      return await this.flowControlService.applyDynamicPriority(queueName, job)
    } catch (error) {
      this.logger.error(`Failed to apply dynamic priority for job ${job.id}:`, error, {
        queueName,
        jobId: job.id
      })
      return job.opts.priority || 0
    }
  }

  /**
   * Check circuit breaker status (internal method)
   */
  private async checkCircuitBreaker(queueName: string): Promise<boolean> {
    try {
      return await this.flowControlService.checkCircuitBreaker(queueName)
    } catch (error) {
      this.logger.error(`Failed to check circuit breaker for queue ${queueName}:`, error, {
        queueName
      })
      return true // Allow on error
    }
  }

  /**
   * Record circuit breaker result (internal method)
   */
  private async recordCircuitBreakerResult(queueName: string, success: boolean): Promise<void> {
    try {
      await this.flowControlService.recordCircuitBreakerResult(queueName, success)
    } catch (error) {
      this.logger.error(`Failed to record circuit breaker result for queue ${queueName}:`, error, {
        queueName,
        success
      })
    }
  }

  // Private helper methods

  private validateQueueConfig(config: QueueConfig): void {
    if (!config.name || config.name.trim() === '') {
      throw new QueueManagementError(
        'Queue name is required',
        ERROR_CODES.VALIDATION_ERROR
      )
    }

    if (this.queues.has(config.name)) {
      throw new QueueManagementError(
        `Queue ${config.name} already exists`,
        ERROR_CODES.QUEUE_ALREADY_EXISTS
      )
    }
  }

  private setupEventListeners(): void {
    this.redis.on('error', (error) => {
      this.logger.error('Redis connection error:', error)
      this.emit('redis:error', error)
    })

    this.redis.on('connect', () => {
      this.logger.info('Redis connected successfully')
      this.emit('redis:connected')
    })
  }

  private setupQueueEventListeners(queueName: string, queueEvents: QueueEvents): void {
    queueEvents.on('completed', (job) => {
      this.emit(EVENT_TYPES.JOB_COMPLETED, {
        queueName,
        jobId: job.jobId,
        returnValue: job.returnvalue,
        timestamp: new Date()
      })
    })

    queueEvents.on('failed', (job) => {
      this.emit(EVENT_TYPES.JOB_FAILED, {
        queueName,
        jobId: job.jobId,
        error: job.failedReason,
        timestamp: new Date()
      })
    })

    queueEvents.on('active', (job) => {
      this.emit(EVENT_TYPES.JOB_STARTED, {
        queueName,
        jobId: job.jobId,
        timestamp: new Date()
      })
    })
  }

  private async calculatePerformanceMetrics(
    queueName: string, 
    activeJobs: Job[], 
    completedJobs: Job[], 
    failedJobs: Job[]
  ) {
    const totalJobs = completedJobs.length + failedJobs.length
    const successRate = totalJobs > 0 ? (completedJobs.length / totalJobs) * 100 : 100
    const errorRate = totalJobs > 0 ? (failedJobs.length / totalJobs) * 100 : 0

    // Calculate average processing time from completed jobs
    const processingTimes = completedJobs
      .filter(job => job.processedOn && job.finishedOn)
      .map(job => job.finishedOn! - job.processedOn!)
    
    const avgProcessingTime = processingTimes.length > 0 
      ? processingTimes.reduce((sum, time) => sum + time, 0) / processingTimes.length 
      : 0

    // Calculate throughput (jobs per minute)
    const oneMinuteAgo = Date.now() - 60000
    const recentCompletedJobs = completedJobs.filter(job => 
      job.finishedOn && job.finishedOn > oneMinuteAgo
    )
    const throughput = recentCompletedJobs.length

    return {
      throughput,
      avgProcessingTime,
      successRate,
      errorRate
    }
  }

  private async calculateResourceUsage(queueName: string) {
    // This is a simplified implementation
    // In a real scenario, you'd integrate with system monitoring tools
    return {
      memoryUsage: 0, // bytes
      cpuUsage: 0, // percentage
      connections: 1 // number of connections
    }
  }

  private determineQueueStatus(
    counts: any, 
    performance: any, 
    resources: any, 
    queueName: string
  ): QueueState {
    const config = this.queueConfigs.get(queueName)
    const thresholds = config?.alertThresholds

    // Check if queue is paused
    if (counts.paused > 0) {
      return QUEUE_STATES.PAUSED
    }

    // Check critical conditions
    if (thresholds?.queueSize?.critical && counts.waiting > thresholds.queueSize.critical) {
      return QUEUE_STATES.CRITICAL
    }
    
    if (thresholds?.errorRate?.critical && performance.errorRate > thresholds.errorRate.critical * 100) {
      return QUEUE_STATES.CRITICAL
    }

    // Check warning conditions
    if (thresholds?.queueSize?.warning && counts.waiting > thresholds.queueSize.warning) {
      return QUEUE_STATES.WARNING
    }
    
    if (thresholds?.errorRate?.warning && performance.errorRate > thresholds.errorRate.warning * 100) {
      return QUEUE_STATES.WARNING
    }

    return QUEUE_STATES.HEALTHY
  }

  private async getJobCount(queue: Queue, state: JobState): Promise<number> {
    switch (state) {
      case JOB_STATES.WAITING:
        return await queue.getWaitingCount()
      case JOB_STATES.ACTIVE:
        return await queue.getActiveCount()
      case JOB_STATES.COMPLETED:
        return await queue.getCompletedCount()
      case JOB_STATES.FAILED:
        return await queue.getFailedCount()
      case JOB_STATES.DELAYED:
        return await queue.getDelayedCount()
      default:
        return 0
    }
  }

  private applyJobFilters(jobs: Job[], filters: JobFilters): Job[] {
    let filteredJobs = jobs

    if (filters.search) {
      const searchTerm = filters.search.toLowerCase()
      filteredJobs = filteredJobs.filter(job => 
        job.name.toLowerCase().includes(searchTerm) ||
        job.id?.toString().includes(searchTerm)
      )
    }

    if (filters.correlationId) {
      filteredJobs = filteredJobs.filter(job => 
        job.data?.correlationId === filters.correlationId
      )
    }

    if (filters.dateRange) {
      filteredJobs = filteredJobs.filter(job => {
        const jobTime = job.timestamp
        return jobTime >= filters.dateRange!.start.getTime() && 
               jobTime <= filters.dateRange!.end.getTime()
      })
    }

    return filteredJobs
  }

  private async cacheQueueConfig(config: QueueConfig): Promise<void> {
    const key = CACHE_KEYS.QUEUE_CONFIG(config.name)
    await this.redis.setex(
      key, 
      this.config.performance.cacheTtl.queueConfig, 
      JSON.stringify(config)
    )
  }

  private async cacheQueueHealth(queueName: string, health: QueueHealth): Promise<void> {
    const key = CACHE_KEYS.QUEUE_HEALTH(queueName)
    await this.redis.setex(
      key, 
      this.config.performance.cacheTtl.queueHealth, 
      JSON.stringify(health)
    )
  }

  private async getCachedQueueHealth(queueName: string): Promise<QueueHealth | null> {
    const key = CACHE_KEYS.QUEUE_HEALTH(queueName)
    const cached = await this.redis.get(key)
    return cached ? JSON.parse(cached) : null
  }

  private async clearQueueCache(queueName: string): Promise<void> {
    const keys = [
      CACHE_KEYS.QUEUE_CONFIG(queueName),
      CACHE_KEYS.QUEUE_HEALTH(queueName)
    ]
    await this.redis.del(...keys)
  }

  private startHealthMonitoring(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval)
    }

    this.healthCheckInterval = setInterval(async () => {
      try {
        const healthMap = await this.getAllQueuesHealth()
        this.emit('health:updated', healthMap)
      } catch (error) {
        this.logger.error('Health monitoring error:', error)
      }
    }, 30000) // Check every 30 seconds
  }

  // Validation methods

  private validatePagination(pagination: Pagination): void {
    if (pagination.page < 1) {
      throw new ValidationError('Page must be greater than 0', 'page', pagination.page)
    }
    if (pagination.limit < 1 || pagination.limit > DEFAULTS.MAX_PAGE_SIZE) {
      throw new ValidationError(
        `Limit must be between 1 and ${DEFAULTS.MAX_PAGE_SIZE}`, 
        'limit', 
        pagination.limit
      )
    }
  }

  private validateJobState(state: JobState): void {
    const validStates = Object.values(JOB_STATES)
    if (!validStates.includes(state)) {
      throw new ValidationError(`Invalid job state: ${state}`, 'state', state)
    }
  }

  private validateJobId(jobId: string): void {
    if (!jobId || jobId.trim() === '') {
      throw new ValidationError('Job ID is required', 'jobId', jobId)
    }
  }

  private validateDelay(delay: number): void {
    if (delay < 0) {
      throw new ValidationError('Delay must be non-negative', 'delay', delay)
    }
    if (delay > 365 * 24 * 60 * 60 * 1000) { // 1 year max
      throw new ValidationError('Delay cannot exceed 1 year', 'delay', delay)
    }
  }

  private validateJobAction(action: JobAction): void {
    const validActions = ['retry', 'remove', 'promote', 'delay']
    if (!validActions.includes(action.action)) {
      throw new ValidationError(`Invalid job action: ${action.action}`, 'action', action.action)
    }

    if (!action.jobIds || action.jobIds.length === 0) {
      throw new ValidationError('Job IDs are required', 'jobIds', action.jobIds)
    }

    if (action.jobIds.length > DEFAULTS.BATCH_LIMITS.MAX_JOBS_PER_BATCH) {
      throw new ValidationError(
        `Too many jobs in batch: ${action.jobIds.length}. Maximum allowed: ${DEFAULTS.BATCH_LIMITS.MAX_JOBS_PER_BATCH}`,
        'jobIds',
        action.jobIds.length
      )
    }

    if (action.action === 'delay' && (action.delay === undefined || action.delay < 0)) {
      throw new ValidationError('Delay is required for delay action', 'delay', action.delay)
    }
  }

  private validateBatchAction(action: BatchAction): void {
    const validActions = ['retry_all_failed', 'clean_completed', 'pause_queue', 'resume_queue']
    if (!validActions.includes(action.action)) {
      throw new ValidationError(`Invalid batch action: ${action.action}`, 'action', action.action)
    }

    if (!action.queueName || action.queueName.trim() === '') {
      throw new ValidationError('Queue name is required', 'queueName', action.queueName)
    }
  }

  private getAuditContext(): any {
    // This method can be used by the audit decorator
    return {
      userId: 'system', // Default, should be overridden by actual user context
      resource: 'queue-manager'
    }
  }

  /**
   * Cleanup resources
   */
  public async destroy(): Promise<void> {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval)
    }

    // Close all queue events
    for (const [queueName, queueEvents] of this.queueEvents) {
      queueEvents.removeAllListeners()
      await queueEvents.close()
    }

    // Cleanup flow control service
    await this.flowControlService.destroy()

    // Close Redis connection
    await this.redis.quit()

    // Clear instance
    QueueManagerService.instance = null
  }
}

// Export singleton instance getter
export const getQueueManager = () => QueueManagerService.getInstance()