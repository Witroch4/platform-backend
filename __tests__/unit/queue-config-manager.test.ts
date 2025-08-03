/**
 * Unit tests for QueueConfigManager
 * Tests configuration management, validation, and caching functionality
 */

import { PrismaClient } from '@prisma/client'
import { getRedisInstance } from '../../lib/connections'
import { QueueConfigManager } from '../../lib/queue-management/services/QueueConfigManager'
import { 
  QueueConfig, 
  SYSTEM_CONFIG_KEYS,
  DEFAULT_QUEUE_CONFIG 
} from '../../lib/queue-management/types/config'

// Mock Prisma
const mockPrisma = {
  queueConfig: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn()
  },
  systemConfig: {
    findUnique: jest.fn(),
    upsert: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn()
  },
  auditLog: {
    create: jest.fn()
  }
} as unknown as PrismaClient

// Mock Redis
const mockRedis = {
  get: jest.fn(),
  setex: jest.fn(),
  del: jest.fn(),
  keys: jest.fn()
} as unknown as ReturnType<typeof getRedisInstance>

describe('QueueConfigManager', () => {
  let configManager: QueueConfigManager

  beforeEach(() => {
    jest.clearAllMocks()
    configManager = new QueueConfigManager(mockPrisma, mockRedis, {
      cacheEnabled: true,
      cacheTTL: 3600,
      validateOnSave: true,
      auditChanges: true
    })
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  describe('createQueueConfig', () => {
    it('should create a new queue configuration with defaults', async () => {
      const mockConfig = {
        name: 'test-queue',
        displayName: 'Test Queue',
        description: 'A test queue',
        priority: 50,
        concurrency: 5,
        retryPolicy: { attempts: 3, backoff: 'exponential' as const, delay: 1000, maxDelay: 30000 },
        cleanupPolicy: { removeOnComplete: 100, removeOnFail: 50 },
        alertThresholds: { waitingJobs: 100, processingTime: 30000, errorRate: 0.05 },
        createdBy: 'test-user'
      }

      const mockSavedConfig = {
        id: 'test-id',
        ...DEFAULT_QUEUE_CONFIG,
        ...mockConfig,
        createdAt: new Date(),
        updatedAt: new Date()
      }

      ;(mockPrisma.queueConfig.findUnique as jest.Mock).mockResolvedValue(null)
      ;(mockPrisma.queueConfig.create as jest.Mock).mockResolvedValue(mockSavedConfig)
      ;(mockPrisma.auditLog.create as jest.Mock).mockResolvedValue({})

      const result = await configManager.createQueueConfig(mockConfig)

      expect(result).toMatchObject({
        name: 'test-queue',
        displayName: 'Test Queue',
        priority: 50,
        concurrency: 5
      })
      expect(mockPrisma.queueConfig.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: 'test-queue',
          displayName: 'Test Queue',
          priority: 50,
          concurrency: 5,
          createdBy: 'test-user'
        })
      })
    })

    it('should throw error if queue name already exists', async () => {
      const mockConfig = {
        name: 'existing-queue',
        priority: 50,
        concurrency: 5,
        retryPolicy: { attempts: 3, backoff: 'exponential' as const, delay: 1000, maxDelay: 30000 },
        cleanupPolicy: { removeOnComplete: 100, removeOnFail: 50 },
        alertThresholds: { waitingJobs: 100, processingTime: 30000, errorRate: 0.05 },
        createdBy: 'test-user'
      }

      ;(mockPrisma.queueConfig.findUnique as jest.Mock).mockResolvedValue({ name: 'existing-queue' })

      await expect(configManager.createQueueConfig(mockConfig)).rejects.toThrow(
        "Queue configuration with name 'existing-queue' already exists"
      )
    })

    it('should validate configuration before saving', async () => {
      const invalidConfig = {
        name: '', // Invalid: empty name
        createdBy: 'test-user'
      }

      await expect(configManager.createQueueConfig(invalidConfig)).rejects.toThrow(
        'Invalid queue configuration'
      )
    })
  })

  describe('getQueueConfig', () => {
    it('should retrieve queue configuration from database', async () => {
      const mockConfig = {
        id: 'test-id',
        name: 'test-queue',
        displayName: 'Test Queue',
        priority: 50,
        concurrency: 5,
        retryPolicy: { attempts: 3, backoff: 'exponential', delay: 1000 },
        cleanupPolicy: { removeOnComplete: 100, removeOnFail: 50 },
        alertThresholds: { waitingJobs: 100, processingTime: 30000, errorRate: 0.05 },
        createdBy: 'test-user',
        createdAt: new Date(),
        updatedAt: new Date()
      }

      ;(mockPrisma.queueConfig.findUnique as jest.Mock).mockResolvedValue(mockConfig)
      ;(mockRedis.get as jest.Mock).mockResolvedValue(null)

      const result = await configManager.getQueueConfig('test-queue')

      expect(result).toMatchObject({
        name: 'test-queue',
        displayName: 'Test Queue',
        priority: 50
      })
      expect(mockPrisma.queueConfig.findUnique).toHaveBeenCalledWith({
        where: { name: 'test-queue' }
      })
    })

    it('should return cached configuration if available', async () => {
      const cachedConfig = {
        id: 'test-id',
        name: 'test-queue',
        displayName: 'Cached Test Queue',
        priority: 50,
        concurrency: 5,
        retryPolicy: { attempts: 3, backoff: 'exponential', delay: 1000 },
        cleanupPolicy: { removeOnComplete: 100, removeOnFail: 50 },
        alertThresholds: { waitingJobs: 100, processingTime: 30000, errorRate: 0.05 },
        createdBy: 'test-user',
        createdAt: new Date(),
        updatedAt: new Date()
      }

      ;(mockRedis.get as jest.Mock).mockResolvedValue(JSON.stringify(cachedConfig))

      const result = await configManager.getQueueConfig('test-queue')

      expect(result?.displayName).toBe('Cached Test Queue')
      expect(mockPrisma.queueConfig.findUnique).not.toHaveBeenCalled()
    })

    it('should return null if configuration not found', async () => {
      ;(mockPrisma.queueConfig.findUnique as jest.Mock).mockResolvedValue(null)
      ;(mockRedis.get as jest.Mock).mockResolvedValue(null)

      const result = await configManager.getQueueConfig('non-existent-queue')

      expect(result).toBeNull()
    })
  })

  describe('system configuration', () => {
    it('should get system configuration value', async () => {
      const mockValue = 90

      ;(mockPrisma.systemConfig.findUnique as jest.Mock).mockResolvedValue({
        key: SYSTEM_CONFIG_KEYS.QUEUE_DEFAULT_RETENTION_DAYS,
        value: mockValue
      })

      const result = await configManager.getSystemConfig(SYSTEM_CONFIG_KEYS.QUEUE_DEFAULT_RETENTION_DAYS)

      expect(result).toBe(90)
      expect(mockPrisma.systemConfig.findUnique).toHaveBeenCalledWith({
        where: { key: SYSTEM_CONFIG_KEYS.QUEUE_DEFAULT_RETENTION_DAYS }
      })
    })

    it('should set system configuration value', async () => {
      ;(mockPrisma.systemConfig.upsert as jest.Mock).mockResolvedValue({})
      ;(mockPrisma.auditLog.create as jest.Mock).mockResolvedValue({})

      await configManager.setSystemConfig(
        SYSTEM_CONFIG_KEYS.QUEUE_DEFAULT_RETENTION_DAYS,
        120,
        'admin-user',
        'Updated retention period'
      )

      expect(mockPrisma.systemConfig.upsert).toHaveBeenCalledWith({
        where: { key: SYSTEM_CONFIG_KEYS.QUEUE_DEFAULT_RETENTION_DAYS },
        update: expect.objectContaining({
          value: 120,
          description: 'Updated retention period',
          updatedBy: 'admin-user'
        }),
        create: expect.objectContaining({
          key: SYSTEM_CONFIG_KEYS.QUEUE_DEFAULT_RETENTION_DAYS,
          value: 120,
          description: 'Updated retention period',
          updatedBy: 'admin-user'
        })
      })
    })

    it('should validate system configuration before saving', async () => {
      await expect(
        configManager.setSystemConfig(
          'invalid-key' as any,
          'invalid-value',
          'admin-user'
        )
      ).rejects.toThrow('Invalid system configuration key')
    })
  })

  describe('validation', () => {
    it('should validate queue configuration', () => {
      const validConfig = {
        name: 'valid-queue',
        priority: 50,
        concurrency: 5,
        retryPolicy: { attempts: 3, backoff: 'exponential' as const, delay: 1000, maxDelay: 30000 },
        cleanupPolicy: { removeOnComplete: 100, removeOnFail: 50 },
        alertThresholds: { waitingJobs: 100, processingTime: 30000, errorRate: 0.05 },
        createdBy: 'test-user'
      }

      const result = configManager.validateConfig(validConfig)

      expect(result.isValid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('should return validation errors for invalid configuration', () => {
      const invalidConfig = {
        name: '', // Invalid: empty name
        priority: -1, // Invalid: negative priority
        concurrency: 0, // Invalid: zero concurrency
        createdBy: 'test-user'
      }

      const result = configManager.validateConfig(invalidConfig)

      expect(result.isValid).toBe(false)
      expect(result.errors.length).toBeGreaterThan(0)
      expect(result.errors.some(e => e.field === 'name')).toBe(true)
      expect(result.errors.some(e => e.field === 'priority')).toBe(true)
      expect(result.errors.some(e => e.field === 'concurrency')).toBe(true)
    })
  })

  describe('statistics', () => {
    it('should return configuration statistics', async () => {
      ;(mockPrisma.queueConfig.count as jest.Mock).mockResolvedValue(5)
      ;(mockPrisma.systemConfig.count as jest.Mock).mockResolvedValue(12)

      const stats = await configManager.getConfigStats()

      expect(stats).toEqual({
        totalQueues: 5,
        activeQueues: 5,
        totalSystemConfigs: 12
      })
    })
  })
})