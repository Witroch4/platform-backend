/**
 * Batch Operation Service
 * 
 * Handles batch operations with progress tracking, rollback capabilities,
 * and advanced error handling for queue management operations.
 */

import { EventEmitter } from 'events'
import { Job } from 'bullmq'
import { 
  BatchResult, 
  JobAction, 
  BatchAction, 
  User 
} from '../../../types/queue-management'
import { 
  DEFAULTS, 
  ERROR_CODES, 
  EVENT_TYPES 
} from '../constants'
import { 
  QueueManagementError, 
  ValidationError 
} from '../errors'
import { Logger, measurePerformance } from '../utils/logger'
import { getPermissionManager } from './permission-manager.service'

export interface BatchOperationProgress {
  id: string
  operation: string
  total: number
  processed: number
  successful: number
  failed: number
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  startedAt: Date
  completedAt?: Date
  estimatedCompletion?: Date
  errors: Array<{ id: string; error: string }>
  rollbackInfo?: RollbackInfo
}

export interface RollbackInfo {
  canRollback: boolean
  rollbackActions: Array<{
    type: 'restore_job' | 'unpause_queue' | 'revert_state'
    jobId?: string
    queueName?: string
    originalState?: any
  }>
}

export interface BatchOperationOptions {
  batchSize?: number
  maxConcurrency?: number
  timeout?: number
  enableRollback?: boolean
  progressCallback?: (progress: BatchOperationProgress) => void
}

/**
 * Batch Operation Service Implementation
 */
export class BatchOperationService extends EventEmitter {
  private logger: Logger
  private permissionManager = getPermissionManager()
  private activeOperations = new Map<string, BatchOperationProgress>()
  private operationCounter = 0

  constructor() {
    super()
    this.logger = new Logger('BatchOperationService')
  }

  /**
   * Execute a batch job operation with progress tracking
   */
  public async executeBatchJobOperation(
    jobs: Job[],
    operation: 'retry' | 'remove' | 'promote' | 'delay',
    options: BatchOperationOptions = {},
    user?: User,
    delay?: number
  ): Promise<BatchOperationProgress> {
    const operationId = this.generateOperationId()
    const progress: BatchOperationProgress = {
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
    }

    this.activeOperations.set(operationId, progress)

    try {
      // Validate batch size limits
      this.validateBatchSize(jobs.length)

      // Validate permissions for all jobs
      if (user) {
        await this.validateBatchPermissions(jobs, operation, user)
      }

      progress.status = 'running'
      this.emit(EVENT_TYPES.BATCH_OPERATION_STARTED, progress)

      // Process jobs in batches
      const batchSize = options.batchSize || DEFAULTS.BATCH_LIMITS.MAX_JOBS_PER_BATCH
      const maxConcurrency = options.maxConcurrency || DEFAULTS.BATCH_LIMITS.MAX_CONCURRENT_BATCHES
      
      await this.processBatchesWithConcurrency(
        jobs,
        operation,
        batchSize,
        maxConcurrency,
        progress,
        options,
        delay
      )

      progress.status = progress.failed > 0 ? 'completed' : 'completed'
      progress.completedAt = new Date()

      this.logger.info(`Batch operation completed: ${operation}`, {
        operationId,
        operation,
        total: progress.total,
        successful: progress.successful,
        failed: progress.failed,
        duration: progress.completedAt.getTime() - progress.startedAt.getTime(),
        userId: user?.userId
      })

      this.emit(EVENT_TYPES.BATCH_OPERATION_COMPLETED, progress)
      return progress

    } catch (error) {
      progress.status = 'failed'
      progress.completedAt = new Date()
      
      this.logger.error(`Batch operation failed: ${operation}`, error, {
        operationId,
        operation,
        userId: user?.userId
      })

      // Attempt rollback if enabled
      if (options.enableRollback && progress.rollbackInfo) {
        await this.attemptRollback(progress)
      }

      this.emit(EVENT_TYPES.BATCH_OPERATION_FAILED, progress)
      throw new QueueManagementError(
        `Batch operation failed: ${error.message}`,
        ERROR_CODES.INTERNAL_ERROR,
        500,
        { operationId, originalError: error.message }
      )
    } finally {
      // Clean up after some time
      setTimeout(() => {
        this.activeOperations.delete(operationId)
      }, 300000) // 5 minutes
    }
  }

  /**
   * Execute a batch queue operation
   */
  public async executeBatchQueueOperation(
    queueNames: string[],
    operation: 'pause' | 'resume' | 'clean',
    options: BatchOperationOptions = {},
    user?: User,
    cleanOptions?: { olderThan: number }
  ): Promise<BatchOperationProgress> {
    const operationId = this.generateOperationId()
    const progress: BatchOperationProgress = {
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
    }

    this.activeOperations.set(operationId, progress)

    try {
      // Validate permissions for all queues
      if (user) {
        await this.validateQueueBatchPermissions(queueNames, operation, user)
      }

      progress.status = 'running'
      this.emit(EVENT_TYPES.BATCH_OPERATION_STARTED, progress)

      // Process queues sequentially to avoid overwhelming the system
      for (const queueName of queueNames) {
        try {
          await this.executeQueueOperation(queueName, operation, cleanOptions, progress)
          progress.successful++
        } catch (error) {
          progress.failed++
          progress.errors.push({
            id: queueName,
            error: error.message
          })
          
          this.logger.error(`Queue operation failed for ${queueName}:`, error, {
            operationId,
            queueName,
            operation
          })
        }

        progress.processed++
        
        // Update progress
        if (options.progressCallback) {
          options.progressCallback(progress)
        }
        
        this.emit(EVENT_TYPES.BATCH_OPERATION_PROGRESS, progress)
      }

      progress.status = 'completed'
      progress.completedAt = new Date()

      this.logger.info(`Batch queue operation completed: ${operation}`, {
        operationId,
        operation,
        total: progress.total,
        successful: progress.successful,
        failed: progress.failed,
        userId: user?.userId
      })

      this.emit(EVENT_TYPES.BATCH_OPERATION_COMPLETED, progress)
      return progress

    } catch (error) {
      progress.status = 'failed'
      progress.completedAt = new Date()
      
      this.logger.error(`Batch queue operation failed: ${operation}`, error, {
        operationId,
        operation,
        userId: user?.userId
      })

      this.emit(EVENT_TYPES.BATCH_OPERATION_FAILED, progress)
      throw new QueueManagementError(
        `Batch queue operation failed: ${error.message}`,
        ERROR_CODES.INTERNAL_ERROR,
        500,
        { operationId, originalError: error.message }
      )
    } finally {
      setTimeout(() => {
        this.activeOperations.delete(operationId)
      }, 300000) // 5 minutes
    }
  }

  /**
   * Get progress of an active batch operation
   */
  public getBatchOperationProgress(operationId: string): BatchOperationProgress | null {
    return this.activeOperations.get(operationId) || null
  }

  /**
   * Get all active batch operations
   */
  public getActiveBatchOperations(): BatchOperationProgress[] {
    return Array.from(this.activeOperations.values())
  }

  /**
   * Cancel a running batch operation
   */
  public async cancelBatchOperation(operationId: string, user?: User): Promise<boolean> {
    const progress = this.activeOperations.get(operationId)
    if (!progress) {
      throw new QueueManagementError(
        `Batch operation not found: ${operationId}`,
        ERROR_CODES.NOT_FOUND
      )
    }

    if (progress.status !== 'running') {
      throw new QueueManagementError(
        `Cannot cancel batch operation in status: ${progress.status}`,
        ERROR_CODES.VALIDATION_ERROR
      )
    }

    progress.status = 'cancelled'
    progress.completedAt = new Date()

    this.logger.info(`Batch operation cancelled: ${operationId}`, {
      operationId,
      operation: progress.operation,
      processed: progress.processed,
      total: progress.total,
      userId: user?.userId
    })

    this.emit(EVENT_TYPES.BATCH_OPERATION_CANCELLED, progress)
    return true
  }

  /**
   * Rollback a completed batch operation
   */
  public async rollbackBatchOperation(operationId: string, user?: User): Promise<boolean> {
    const progress = this.activeOperations.get(operationId)
    if (!progress) {
      throw new QueueManagementError(
        `Batch operation not found: ${operationId}`,
        ERROR_CODES.NOT_FOUND
      )
    }

    if (!progress.rollbackInfo?.canRollback) {
      throw new QueueManagementError(
        `Batch operation cannot be rolled back: ${operationId}`,
        ERROR_CODES.VALIDATION_ERROR
      )
    }

    try {
      await this.attemptRollback(progress)
      
      this.logger.info(`Batch operation rolled back: ${operationId}`, {
        operationId,
        operation: progress.operation,
        rollbackActions: progress.rollbackInfo.rollbackActions.length,
        userId: user?.userId
      })

      return true
    } catch (error) {
      this.logger.error(`Failed to rollback batch operation: ${operationId}`, error, {
        operationId,
        userId: user?.userId
      })
      throw new QueueManagementError(
        `Failed to rollback batch operation: ${error.message}`,
        ERROR_CODES.INTERNAL_ERROR
      )
    }
  }

  // Private helper methods

  private generateOperationId(): string {
    return `batch_${Date.now()}_${++this.operationCounter}`
  }

  private validateBatchSize(size: number): void {
    if (size > DEFAULTS.BATCH_LIMITS.MAX_JOBS_PER_BATCH) {
      throw new ValidationError(
        `Batch size exceeds maximum limit: ${size} > ${DEFAULTS.BATCH_LIMITS.MAX_JOBS_PER_BATCH}`,
        'batchSize',
        size
      )
    }
  }

  private async validateBatchPermissions(jobs: Job[], operation: string, user: User): Promise<void> {
    // Group jobs by queue for efficient permission checking
    const jobsByQueue = new Map<string, Job[]>()
    
    for (const job of jobs) {
      const queueName = job.queueName
      if (!jobsByQueue.has(queueName)) {
        jobsByQueue.set(queueName, [])
      }
      jobsByQueue.get(queueName)!.push(job)
    }

    // Validate permissions for each queue
    for (const [queueName, queueJobs] of jobsByQueue) {
      this.permissionManager.validateBatchOperation(user, `${operation}_batch`, queueName, queueJobs.length)
    }
  }

  private async validateQueueBatchPermissions(queueNames: string[], operation: string, user: User): Promise<void> {
    for (const queueName of queueNames) {
      this.permissionManager.validateQueueOperation(user, operation, queueName)
    }
  }

  private async processBatchesWithConcurrency(
    jobs: Job[],
    operation: string,
    batchSize: number,
    maxConcurrency: number,
    progress: BatchOperationProgress,
    options: BatchOperationOptions,
    delay?: number
  ): Promise<void> {
    const batches: Job[][] = []
    
    // Split jobs into batches
    for (let i = 0; i < jobs.length; i += batchSize) {
      batches.push(jobs.slice(i, i + batchSize))
    }

    // Process batches with limited concurrency
    const semaphore = new Array(maxConcurrency).fill(null)
    const promises: Promise<void>[] = []

    for (const batch of batches) {
      const promise = this.waitForSlot(semaphore).then(async (slotIndex) => {
        try {
          await this.processBatch(batch, operation, progress, options, delay)
        } finally {
          semaphore[slotIndex] = null // Release slot
        }
      })
      promises.push(promise)
    }

    await Promise.all(promises)
  }

  private async waitForSlot(semaphore: any[]): Promise<number> {
    return new Promise((resolve) => {
      const checkSlot = () => {
        const availableSlot = semaphore.findIndex(slot => slot === null)
        if (availableSlot !== -1) {
          semaphore[availableSlot] = true // Occupy slot
          resolve(availableSlot)
        } else {
          setTimeout(checkSlot, 10) // Check again in 10ms
        }
      }
      checkSlot()
    })
  }

  private async processBatch(
    batch: Job[],
    operation: string,
    progress: BatchOperationProgress,
    options: BatchOperationOptions,
    delay?: number
  ): Promise<void> {
    for (const job of batch) {
      if (progress.status === 'cancelled') {
        break
      }

      try {
        await this.executeJobOperation(job, operation, progress, delay)
        progress.successful++
      } catch (error) {
        progress.failed++
        progress.errors.push({
          id: job.id!,
          error: error.message
        })
      }

      progress.processed++

      // Update estimated completion
      if (progress.processed > 0) {
        const elapsed = Date.now() - progress.startedAt.getTime()
        const rate = progress.processed / elapsed
        const remaining = progress.total - progress.processed
        progress.estimatedCompletion = new Date(Date.now() + (remaining / rate))
      }

      // Emit progress update
      if (options.progressCallback) {
        options.progressCallback(progress)
      }
      
      this.emit(EVENT_TYPES.BATCH_OPERATION_PROGRESS, progress)
    }
  }

  private async executeJobOperation(
    job: Job,
    operation: string,
    progress: BatchOperationProgress,
    delay?: number
  ): Promise<void> {
    // Store original state for rollback
    if (progress.rollbackInfo) {
      const originalState = await job.getState()
      progress.rollbackInfo.rollbackActions.push({
        type: 'revert_state',
        jobId: job.id!,
        queueName: job.queueName,
        originalState
      })
    }

    switch (operation) {
      case 'retry':
        await job.retry()
        break
      case 'remove':
        await job.remove()
        break
      case 'promote':
        await job.promote()
        break
      case 'delay':
        if (delay !== undefined) {
          await job.changeDelay(delay)
        }
        break
      default:
        throw new ValidationError(`Invalid job operation: ${operation}`)
    }
  }

  private async executeQueueOperation(
    queueName: string,
    operation: string,
    cleanOptions?: { olderThan: number },
    progress?: BatchOperationProgress
  ): Promise<void> {
    // This would integrate with the QueueManagerService
    // For now, we'll just simulate the operations
    switch (operation) {
      case 'pause':
        // await queueManager.pauseQueue(queueName)
        break
      case 'resume':
        // await queueManager.resumeQueue(queueName)
        break
      case 'clean':
        // await queueManager.cleanCompleted(queueName, cleanOptions?.olderThan)
        break
      default:
        throw new ValidationError(`Invalid queue operation: ${operation}`)
    }
  }

  private async attemptRollback(progress: BatchOperationProgress): Promise<void> {
    if (!progress.rollbackInfo) {
      return
    }

    this.logger.info(`Attempting rollback for operation: ${progress.id}`, {
      operationId: progress.id,
      rollbackActions: progress.rollbackInfo.rollbackActions.length
    })

    const rollbackErrors: string[] = []

    // Execute rollback actions in reverse order
    for (const action of progress.rollbackInfo.rollbackActions.reverse()) {
      try {
        await this.executeRollbackAction(action)
      } catch (error) {
        rollbackErrors.push(`Failed to rollback ${action.type} for ${action.jobId || action.queueName}: ${error.message}`)
      }
    }

    if (rollbackErrors.length > 0) {
      this.logger.error(`Rollback completed with errors:`, rollbackErrors, {
        operationId: progress.id
      })
    } else {
      this.logger.info(`Rollback completed successfully for operation: ${progress.id}`)
    }
  }

  private async executeRollbackAction(action: RollbackInfo['rollbackActions'][0]): Promise<void> {
    // Implementation would depend on the specific action type
    // This is a placeholder for the actual rollback logic
    switch (action.type) {
      case 'restore_job':
        // Restore job to original state
        break
      case 'unpause_queue':
        // Unpause queue if it was paused
        break
      case 'revert_state':
        // Revert job to original state
        break
    }
  }
}

// Export singleton instance
let batchOperationServiceInstance: BatchOperationService | null = null

export function getBatchOperationService(): BatchOperationService {
  if (!batchOperationServiceInstance) {
    batchOperationServiceInstance = new BatchOperationService()
  }
  return batchOperationServiceInstance
}

export default BatchOperationService