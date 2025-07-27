/**
 * Queue Manager Service Tests
 * 
 * Basic tests to verify the queue manager service functionality
 */

import { QueueManagerService } from '../services/queue-manager.service'
import { QueueConfig } from '../../../types/queue-management'

// Mock Redis and BullMQ
jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    setex: jest.fn(),
    get: jest.fn(),
    del: jest.fn(),
    incr: jest.fn(),
    expire: jest.fn(),
    quit: jest.fn(),
    on: jest.fn(),
  }))
})

jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => ({
    getWaiting: jest.fn().mockResolvedValue([]),
    getActive: jest.fn().mockResolvedValue([]),
    getCompleted: jest.fn().mockResolvedValue([]),
    getFailed: jest.fn().mockResolvedValue([]),
    getDelayed: jest.fn().mockResolvedValue([]),
    isPaused: jest.fn().mockResolvedValue(false),
    getWaitingCount: jest.fn().mockResolvedValue(0),
    getActiveCount: jest.fn().mockResolvedValue(0),
    getCompletedCount: jest.fn().mockResolvedValue(0),
    getFailedCount: jest.fn().mockResolvedValue(0),
    getDelayedCount: jest.fn().mockResolvedValue(0),
    getJob: jest.fn().mockResolvedValue(null),
    pause: jest.fn(),
    resume: jest.fn(),
  })),
  QueueEvents: jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    removeAllListeners: jest.fn(),
    close: jest.fn(),
  })),
}))

describe('QueueManagerService', () => {
  let queueManager: QueueManagerService
  let mockQueue: any

  beforeEach(() => {
    // Reset singleton instance
    (QueueManagerService as any).instance = null
    queueManager = QueueManagerService.getInstance()
    
    mockQueue = {
      getWaiting: jest.fn().mockResolvedValue([]),
      getActive: jest.fn().mockResolvedValue([]),
      getCompleted: jest.fn().mockResolvedValue([]),
      getFailed: jest.fn().mockResolvedValue([]),
      getDelayed: jest.fn().mockResolvedValue([]),
      isPaused: jest.fn().mockResolvedValue(false),
      getWaitingCount: jest.fn().mockResolvedValue(0),
      getActiveCount: jest.fn().mockResolvedValue(0),
      getCompletedCount: jest.fn().mockResolvedValue(0),
      getFailedCount: jest.fn().mockResolvedValue(0),
      getDelayedCount: jest.fn().mockResolvedValue(0),
      getJob: jest.fn().mockResolvedValue(null),
      pause: jest.fn(),
      resume: jest.fn(),
    }
  })

  afterEach(async () => {
    await queueManager.destroy()
  })

  describe('Queue Registration', () => {
    it('should register a queue successfully', async () => {
      const config: QueueConfig = {
        name: 'test-queue',
        displayName: 'Test Queue',
        priority: 1,
        concurrency: 5,
        retryPolicy: {
          attempts: 3,
          backoff: 'exponential',
          delay: 1000
        },
        cleanupPolicy: {
          removeOnComplete: 100,
          removeOnFail: 50
        },
        alertThresholds: {
          queueSize: {
            warning: 100,
            critical: 1000
          }
        },
        createdBy: 'test-user'
      }

      await expect(queueManager.registerQueue(mockQueue, config)).resolves.not.toThrow()
      
      const registeredQueues = queueManager.getRegisteredQueues()
      expect(registeredQueues.has('test-queue')).toBe(true)
    })

    it('should throw error when registering duplicate queue', async () => {
      const config: QueueConfig = {
        name: 'test-queue',
        priority: 1,
        concurrency: 5,
        retryPolicy: {
          attempts: 3,
          backoff: 'exponential',
          delay: 1000
        },
        cleanupPolicy: {
          removeOnComplete: 100,
          removeOnFail: 50
        },
        alertThresholds: {},
        createdBy: 'test-user'
      }

      await queueManager.registerQueue(mockQueue, config)
      
      await expect(queueManager.registerQueue(mockQueue, config))
        .rejects.toThrow('Queue test-queue already exists')
    })
  })

  describe('Queue Health', () => {
    beforeEach(async () => {
      const config: QueueConfig = {
        name: 'health-test-queue',
        priority: 1,
        concurrency: 5,
        retryPolicy: {
          attempts: 3,
          backoff: 'exponential',
          delay: 1000
        },
        cleanupPolicy: {
          removeOnComplete: 100,
          removeOnFail: 50
        },
        alertThresholds: {
          queueSize: {
            warning: 10,
            critical: 50
          }
        },
        createdBy: 'test-user'
      }

      await queueManager.registerQueue(mockQueue, config)
    })

    it('should get queue health successfully', async () => {
      const health = await queueManager.getQueueHealth('health-test-queue')
      
      expect(health).toBeDefined()
      expect(health.name).toBe('health-test-queue')
      expect(health.status).toBeDefined()
      expect(health.counts).toBeDefined()
      expect(health.performance).toBeDefined()
      expect(health.resources).toBeDefined()
    })

    it('should throw error for non-existent queue', async () => {
      await expect(queueManager.getQueueHealth('non-existent-queue'))
        .rejects.toThrow('Queue not found: non-existent-queue')
    })
  })

  describe('Job Operations', () => {
    beforeEach(async () => {
      const config: QueueConfig = {
        name: 'job-test-queue',
        priority: 1,
        concurrency: 5,
        retryPolicy: {
          attempts: 3,
          backoff: 'exponential',
          delay: 1000
        },
        cleanupPolicy: {
          removeOnComplete: 100,
          removeOnFail: 50
        },
        alertThresholds: {},
        createdBy: 'test-user'
      }

      await queueManager.registerQueue(mockQueue, config)
    })

    it('should get jobs with pagination', async () => {
      const result = await queueManager.getJobs('job-test-queue', 'waiting', { page: 1, limit: 10 })
      
      expect(result).toBeDefined()
      expect(result.data).toBeInstanceOf(Array)
      expect(result.pagination).toBeDefined()
      expect(result.pagination.page).toBe(1)
      expect(result.pagination.limit).toBe(10)
    })

    it('should validate pagination parameters', async () => {
      await expect(queueManager.getJobs('job-test-queue', 'waiting', { page: 0, limit: 10 }))
        .rejects.toThrow('Page must be greater than 0')
      
      await expect(queueManager.getJobs('job-test-queue', 'waiting', { page: 1, limit: 0 }))
        .rejects.toThrow('Limit must be between 1 and 1000')
    })
  })

  describe('Batch Operations', () => {
    beforeEach(async () => {
      const config: QueueConfig = {
        name: 'batch-test-queue',
        priority: 1,
        concurrency: 5,
        retryPolicy: {
          attempts: 3,
          backoff: 'exponential',
          delay: 1000
        },
        cleanupPolicy: {
          removeOnComplete: 100,
          removeOnFail: 50
        },
        alertThresholds: {},
        createdBy: 'test-user'
      }

      await queueManager.registerQueue(mockQueue, config)
    })

    it('should pause and resume queue', async () => {
      const pauseResult = await queueManager.pauseQueue('batch-test-queue')
      expect(pauseResult).toBe(true)
      expect(mockQueue.pause).toHaveBeenCalled()

      const resumeResult = await queueManager.resumeQueue('batch-test-queue')
      expect(resumeResult).toBe(true)
      expect(mockQueue.resume).toHaveBeenCalled()
    })

    it('should retry all failed jobs', async () => {
      const mockFailedJob = {
        id: 'failed-job-1',
        retry: jest.fn()
      }
      mockQueue.getFailed.mockResolvedValue([mockFailedJob])

      const result = await queueManager.retryAllFailed('batch-test-queue')
      
      expect(result.total).toBe(1)
      expect(result.successful).toBe(1)
      expect(result.failed).toBe(0)
      expect(mockFailedJob.retry).toHaveBeenCalled()
    })
  })

  describe('Singleton Pattern', () => {
    it('should return the same instance', () => {
      const instance1 = QueueManagerService.getInstance()
      const instance2 = QueueManagerService.getInstance()
      
      expect(instance1).toBe(instance2)
    })
  })
})