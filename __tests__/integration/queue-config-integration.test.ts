/**
 * Integration tests for Queue Configuration System
 * Tests the configuration system with actual database operations
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals'
import { getPrismaInstance } from "@/lib/connections"
import { 
  initializeConfigManager,
  createQueueConfig,
  ConfigTemplates,
  SystemConfigUtils,
  SYSTEM_CONFIG_KEYS
} from '../../lib/queue-management/config'

describe('Queue Configuration Integration', () => {
  let prisma: PrismaClient
  let testUserId: string

  beforeAll(async () => {
    prisma = new PrismaClient()
    testUserId = 'test-integration-user'
    
    // Initialize the configuration manager
    initializeConfigManager(prisma, undefined, {
      cacheEnabled: false, // Disable cache for integration tests
      validateOnSave: true,
      auditChanges: true
    })
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  beforeEach(async () => {
    // Clean up test data before each test
    await prisma.queueConfig.deleteMany({
      where: { createdBy: testUserId }
    })
    await prisma.auditLog.deleteMany({
      where: { userId: testUserId }
    })
  })

  describe('Queue Configuration CRUD Operations', () => {
    it('should create, read, update, and delete queue configuration', async () => {
      // Create
      const config = await createQueueConfig('integration-test-queue', testUserId)
        .displayName('Integration Test Queue')
        .description('A queue for integration testing')
        .priority(75)
        .concurrency(10)
        .retryPolicy(5, 'exponential', 500, 30000)
        .alertThresholds(50, 15000, 0.02)
        .save()

      expect(config.name).toBe('integration-test-queue')
      expect(config.displayName).toBe('Integration Test Queue')
      expect(config.priority).toBe(75)
      expect(config.concurrency).toBe(10)
      expect(config.id).toBeDefined()
      expect(config.createdAt).toBeDefined()

      // Read
      const manager = (await import('../../lib/queue-management/config')).getConfigManager()
      const retrieved = await manager.getQueueConfig('integration-test-queue')
      
      expect(retrieved).not.toBeNull()
      expect(retrieved!.name).toBe('integration-test-queue')
      expect(retrieved!.displayName).toBe('Integration Test Queue')

      // Update
      const updated = await manager.updateQueueConfig(
        'integration-test-queue',
        {
          displayName: 'Updated Integration Test Queue',
          priority: 90,
          concurrency: 15
        },
        testUserId
      )

      expect(updated.displayName).toBe('Updated Integration Test Queue')
      expect(updated.priority).toBe(90)
      expect(updated.concurrency).toBe(15)

      // Delete
      const deleted = await manager.deleteQueueConfig('integration-test-queue', testUserId)
      expect(deleted).toBe(true)

      // Verify deletion
      const afterDelete = await manager.getQueueConfig('integration-test-queue')
      expect(afterDelete).toBeNull()
    })

    it('should prevent duplicate queue names', async () => {
      // Create first queue
      await createQueueConfig('duplicate-test', testUserId)
        .displayName('First Queue')
        .save()

      // Try to create second queue with same name
      await expect(
        createQueueConfig('duplicate-test', testUserId)
          .displayName('Second Queue')
          .save()
      ).rejects.toThrow("Queue configuration with name 'duplicate-test' already exists")
    })

    it('should validate configuration before saving', async () => {
      await expect(
        createQueueConfig('', testUserId) // Invalid empty name
          .save()
      ).rejects.toThrow('Invalid queue configuration')

      await expect(
        createQueueConfig('invalid-concurrency', testUserId)
          .concurrency(0) // Invalid zero concurrency
          .save()
      ).rejects.toThrow('Invalid queue configuration')
    })
  })

  describe('Configuration Templates', () => {
    it('should create critical priority queue configuration', async () => {
      const config = await ConfigTemplates.critical('critical-queue', testUserId).save()

      expect(config.name).toBe('critical-queue')
      expect(config.priority).toBe(100)
      expect(config.concurrency).toBe(10)
      expect(config.retryPolicy.attempts).toBe(5)
      expect(config.retryPolicy.backoff).toBe('exponential')
      expect(config.alertThresholds.waitingJobs).toBe(10)
      expect(config.alertThresholds.processingTime).toBe(5000)
      expect(config.alertThresholds.errorRate).toBe(0.01)
    })

    it('should create standard queue configuration', async () => {
      const config = await ConfigTemplates.standard('standard-queue', testUserId).save()

      expect(config.name).toBe('standard-queue')
      expect(config.priority).toBe(50)
      expect(config.concurrency).toBe(5)
      expect(config.retryPolicy.attempts).toBe(3)
      expect(config.alertThresholds.waitingJobs).toBe(100)
      expect(config.alertThresholds.processingTime).toBe(30000)
    })

    it('should create background queue configuration', async () => {
      const config = await ConfigTemplates.background('background-queue', testUserId).save()

      expect(config.name).toBe('background-queue')
      expect(config.priority).toBe(10)
      expect(config.concurrency).toBe(2)
      expect(config.retryPolicy.attempts).toBe(2)
      expect(config.retryPolicy.backoff).toBe('fixed')
      expect(config.alertThresholds.waitingJobs).toBe(500)
    })

    it('should create batch processing queue configuration', async () => {
      const config = await ConfigTemplates.batch('batch-queue', testUserId).save()

      expect(config.name).toBe('batch-queue')
      expect(config.priority).toBe(25)
      expect(config.concurrency).toBe(1)
      expect(config.rateLimiter).toBeDefined()
      expect(config.rateLimiter!.max).toBe(10)
      expect(config.rateLimiter!.duration).toBe(60000)
    })

    it('should create realtime queue configuration', async () => {
      const config = await ConfigTemplates.realtime('realtime-queue', testUserId).save()

      expect(config.name).toBe('realtime-queue')
      expect(config.priority).toBe(90)
      expect(config.concurrency).toBe(20)
      expect(config.alertThresholds.waitingJobs).toBe(5)
      expect(config.alertThresholds.processingTime).toBe(1000)
      expect(config.alertThresholds.errorRate).toBe(0.005)
    })
  })

  describe('System Configuration', () => {
    it('should initialize default system configurations', async () => {
      await SystemConfigUtils.initializeDefaults(testUserId)

      const retentionDays = await SystemConfigUtils.getWithDefault(
        SYSTEM_CONFIG_KEYS.QUEUE_DEFAULT_RETENTION_DAYS,
        30
      )
      expect(retentionDays).toBe(90)

      const cleanupInterval = await SystemConfigUtils.getWithDefault(
        SYSTEM_CONFIG_KEYS.QUEUE_DEFAULT_CLEANUP_INTERVAL,
        1800
      )
      expect(cleanupInterval).toBe(3600)

      const autoRetryEnabled = await SystemConfigUtils.getWithDefault(
        SYSTEM_CONFIG_KEYS.AUTO_RETRY_ENABLED,
        false
      )
      expect(autoRetryEnabled).toBe(true)
    })

    it('should set and get system configuration values', async () => {
      const manager = (await import('../../lib/queue-management/config')).getConfigManager()

      // Set a configuration value
      await manager.setSystemConfig(
        SYSTEM_CONFIG_KEYS.METRICS_COLLECTION_INTERVAL_SECONDS,
        30,
        testUserId,
        'Updated for testing'
      )

      // Get the configuration value
      const value = await manager.getSystemConfig(SYSTEM_CONFIG_KEYS.METRICS_COLLECTION_INTERVAL_SECONDS)
      expect(value).toBe(30)

      // Verify it's in the database
      const dbConfig = await prisma.systemConfig.findUnique({
        where: { key: SYSTEM_CONFIG_KEYS.METRICS_COLLECTION_INTERVAL_SECONDS }
      })
      expect(dbConfig).not.toBeNull()
      expect(dbConfig!.value).toBe(30)
      expect(dbConfig!.description).toBe('Updated for testing')
      expect(dbConfig!.updatedBy).toBe(testUserId)
    })

    it('should get multiple system configurations at once', async () => {
      // Set some test values
      await SystemConfigUtils.setMultiple([
        { 
          key: SYSTEM_CONFIG_KEYS.CACHE_TTL_SECONDS, 
          value: 1800, 
          description: 'Test cache TTL' 
        },
        { 
          key: SYSTEM_CONFIG_KEYS.CONNECTION_POOL_SIZE, 
          value: 20, 
          description: 'Test pool size' 
        }
      ], testUserId)

      // Get multiple configurations
      const configs = await SystemConfigUtils.getMultiple([
        SYSTEM_CONFIG_KEYS.CACHE_TTL_SECONDS,
        SYSTEM_CONFIG_KEYS.CONNECTION_POOL_SIZE
      ])

      expect(configs[SYSTEM_CONFIG_KEYS.CACHE_TTL_SECONDS]).toBe(1800)
      expect(configs[SYSTEM_CONFIG_KEYS.CONNECTION_POOL_SIZE]).toBe(20)
    })

    it('should validate system configuration values', async () => {
      const manager = (await import('../../lib/queue-management/config')).getConfigManager()

      // Valid configuration
      await expect(
        manager.setSystemConfig(
          SYSTEM_CONFIG_KEYS.QUEUE_DEFAULT_RETENTION_DAYS,
          180,
          testUserId
        )
      ).resolves.not.toThrow()

      // Invalid configuration - retention days too high
      await expect(
        manager.setSystemConfig(
          SYSTEM_CONFIG_KEYS.QUEUE_DEFAULT_RETENTION_DAYS,
          400, // Max is 365
          testUserId
        )
      ).rejects.toThrow('Invalid system configuration')

      // Invalid configuration - negative value
      await expect(
        manager.setSystemConfig(
          SYSTEM_CONFIG_KEYS.METRICS_COLLECTION_INTERVAL_SECONDS,
          -10,
          testUserId
        )
      ).rejects.toThrow('Invalid system configuration')
    })
  })

  describe('Audit Logging', () => {
    it('should create audit logs for configuration changes', async () => {
      // Create a queue configuration
      await createQueueConfig('audit-test-queue', testUserId)
        .displayName('Audit Test Queue')
        .save()

      // Check that audit log was created
      const auditLogs = await prisma.auditLog.findMany({
        where: { 
          userId: testUserId,
          action: 'CONFIG_CREATE'
        }
      })

      expect(auditLogs.length).toBeGreaterThan(0)
      
      const createLog = auditLogs.find(log => 
        log.resourceType === 'queue_config' && 
        log.details && 
        (log.details as any).newValue?.name === 'audit-test-queue'
      )
      
      expect(createLog).toBeDefined()
      expect(createLog!.userId).toBe(testUserId)
      expect(createLog!.action).toBe('CONFIG_CREATE')
    })

    it('should create audit logs for system configuration changes', async () => {
      const manager = (await import('../../lib/queue-management/config')).getConfigManager()

      await manager.setSystemConfig(
        SYSTEM_CONFIG_KEYS.RATE_LIMIT_MAX_REQUESTS,
        200,
        testUserId,
        'Updated for audit test'
      )

      // Check that audit log was created
      const auditLogs = await prisma.auditLog.findMany({
        where: { 
          userId: testUserId,
          action: 'CONFIG_UPDATE',
          resourceType: 'system_config'
        }
      })

      expect(auditLogs.length).toBeGreaterThan(0)
      
      const updateLog = auditLogs.find(log => 
        log.resourceId === SYSTEM_CONFIG_KEYS.RATE_LIMIT_MAX_REQUESTS
      )
      
      expect(updateLog).toBeDefined()
      expect(updateLog!.userId).toBe(testUserId)
    })
  })

  describe('Configuration Statistics', () => {
    it('should return accurate configuration statistics', async () => {
      const manager = (await import('../../lib/queue-management/config')).getConfigManager()

      // Create some test configurations
      await createQueueConfig('stats-queue-1', testUserId).save()
      await createQueueConfig('stats-queue-2', testUserId).save()
      await createQueueConfig('stats-queue-3', testUserId).save()

      // Set some system configurations
      await manager.setSystemConfig(SYSTEM_CONFIG_KEYS.CACHE_TTL_SECONDS, 1800, testUserId)
      await manager.setSystemConfig(SYSTEM_CONFIG_KEYS.CONNECTION_POOL_SIZE, 15, testUserId)

      const stats = await manager.getConfigStats()

      expect(stats.totalQueues).toBeGreaterThanOrEqual(3)
      expect(stats.activeQueues).toBeGreaterThanOrEqual(3)
      expect(stats.totalSystemConfigs).toBeGreaterThanOrEqual(2)
    })
  })
})