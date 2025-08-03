/**
 * Queue Management Configuration Module
 * Provides factory functions and utilities for configuration management
 */

import { PrismaClient } from '@prisma/client'
import { getRedisInstance } from '../../../lib/connections'
import { QueueConfigManager } from '../services/QueueConfigManager'
import { 
  QueueConfig, 
  SystemConfig, 
  QueueConfigManagerOptions,
  DEFAULT_QUEUE_CONFIG,
  SYSTEM_CONFIG_KEYS,
  SystemConfigKey
} from '../types/config'

// Global instances
let globalConfigManager: QueueConfigManager | null = null
let globalPrisma: PrismaClient | null = null
let globalRedis: ReturnType<typeof getRedisInstance> | null = null

/**
 * Initializes the global configuration manager
 */
export function initializeConfigManager(
  prisma: PrismaClient,
  redis?: ReturnType<typeof getRedisInstance>,
  options?: QueueConfigManagerOptions
): QueueConfigManager {
  globalPrisma = prisma
  globalRedis = redis || null
  globalConfigManager = new QueueConfigManager(prisma, redis, options)
  return globalConfigManager
}

/**
 * Gets the global configuration manager instance
 */
export function getConfigManager(): QueueConfigManager {
  if (!globalConfigManager) {
    throw new Error('Configuration manager not initialized. Call initializeConfigManager() first.')
  }
  return globalConfigManager
}

/**
 * Creates a new configuration manager instance
 */
export function createConfigManager(
  prisma: PrismaClient,
  redis?: ReturnType<typeof getRedisInstance>,
  options?: QueueConfigManagerOptions
): QueueConfigManager {
  return new QueueConfigManager(prisma, redis, options)
}

/**
 * Configuration builder for creating queue configurations
 */
export class QueueConfigBuilder {
  private config: Partial<QueueConfig> = {}

  constructor(name: string, createdBy: string) {
    this.config = {
      name,
      createdBy,
      ...DEFAULT_QUEUE_CONFIG
    }
  }

  displayName(displayName: string): this {
    this.config.displayName = displayName
    return this
  }

  description(description: string): this {
    this.config.description = description
    return this
  }

  priority(priority: number): this {
    this.config.priority = priority
    return this
  }

  concurrency(concurrency: number): this {
    this.config.concurrency = concurrency
    return this
  }

  rateLimiter(max: number, duration: number, bounceBack?: boolean): this {
    this.config.rateLimiter = { max, duration, bounceBack }
    return this
  }

  retryPolicy(attempts: number, backoff: 'fixed' | 'exponential', delay: number, maxDelay?: number): this {
    this.config.retryPolicy = { attempts, backoff, delay, maxDelay }
    return this
  }

  cleanupPolicy(removeOnComplete: number, removeOnFail: number, maxAge?: number): this {
    this.config.cleanupPolicy = { removeOnComplete, removeOnFail, maxAge }
    return this
  }

  alertThresholds(waitingJobs: number, processingTime: number, errorRate: number): this {
    this.config.alertThresholds = {
      waitingJobs,
      processingTime,
      errorRate,
      ...this.config.alertThresholds
    }
    return this
  }

  memoryAlert(memoryUsage: number): this {
    if (!this.config.alertThresholds) {
      this.config.alertThresholds = DEFAULT_QUEUE_CONFIG.alertThresholds!
    }
    this.config.alertThresholds.memoryUsage = memoryUsage
    return this
  }

  cpuAlert(cpuUsage: number): this {
    if (!this.config.alertThresholds) {
      this.config.alertThresholds = DEFAULT_QUEUE_CONFIG.alertThresholds!
    }
    this.config.alertThresholds.cpuUsage = cpuUsage
    return this
  }

  build(): Omit<QueueConfig, 'id' | 'createdAt' | 'updatedAt'> {
    return this.config as Omit<QueueConfig, 'id' | 'createdAt' | 'updatedAt'>
  }

  async save(): Promise<QueueConfig> {
    const manager = getConfigManager()
    return await manager.createQueueConfig(this.build())
  }
}

/**
 * Creates a new queue configuration builder
 */
export function createQueueConfig(name: string, createdBy: string): QueueConfigBuilder {
  return new QueueConfigBuilder(name, createdBy)
}

/**
 * Predefined configuration templates
 */
export const ConfigTemplates = {
  /**
   * High-priority, low-latency queue for critical operations
   */
  critical: (name: string, createdBy: string) => 
    createQueueConfig(name, createdBy)
      .priority(100)
      .concurrency(10)
      .retryPolicy(5, 'exponential', 500, 30000)
      .alertThresholds(10, 5000, 0.01) // 10 waiting jobs, 5s processing, 1% error rate
      .cleanupPolicy(50, 100),

  /**
   * Standard queue for regular operations
   */
  standard: (name: string, createdBy: string) =>
    createQueueConfig(name, createdBy)
      .priority(50)
      .concurrency(5)
      .retryPolicy(3, 'exponential', 1000, 60000)
      .alertThresholds(100, 30000, 0.05) // 100 waiting jobs, 30s processing, 5% error rate
      .cleanupPolicy(100, 50),

  /**
   * Low-priority queue for background tasks
   */
  background: (name: string, createdBy: string) =>
    createQueueConfig(name, createdBy)
      .priority(10)
      .concurrency(2)
      .retryPolicy(2, 'fixed', 5000)
      .alertThresholds(500, 120000, 0.10) // 500 waiting jobs, 2min processing, 10% error rate
      .cleanupPolicy(200, 25),

  /**
   * Batch processing queue for large operations
   */
  batch: (name: string, createdBy: string) =>
    createQueueConfig(name, createdBy)
      .priority(25)
      .concurrency(1)
      .retryPolicy(1, 'fixed', 10000)
      .alertThresholds(50, 600000, 0.20) // 50 waiting jobs, 10min processing, 20% error rate
      .cleanupPolicy(10, 10)
      .rateLimiter(10, 60000), // 10 jobs per minute

  /**
   * Real-time queue for immediate processing
   */
  realtime: (name: string, createdBy: string) =>
    createQueueConfig(name, createdBy)
      .priority(90)
      .concurrency(20)
      .retryPolicy(2, 'fixed', 100)
      .alertThresholds(5, 1000, 0.005) // 5 waiting jobs, 1s processing, 0.5% error rate
      .cleanupPolicy(1000, 200)
}

/**
 * System configuration utilities
 */
export const SystemConfigUtils = {
  /**
   * Gets a system configuration with a default value
   */
  async getWithDefault<T>(key: SystemConfigKey, defaultValue: T): Promise<T> {
    const manager = getConfigManager()
    const value = await manager.getSystemConfig<T>(key)
    return value ?? defaultValue
  },

  /**
   * Gets multiple system configurations at once
   */
  async getMultiple(keys: SystemConfigKey[]): Promise<Record<string, any>> {
    const manager = getConfigManager()
    const results: Record<string, any> = {}
    
    await Promise.all(
      keys.map(async (key) => {
        results[key] = await manager.getSystemConfig(key)
      })
    )
    
    return results
  },

  /**
   * Sets multiple system configurations at once
   */
  async setMultiple(
    configs: Array<{ key: SystemConfigKey; value: any; description?: string }>,
    updatedBy: string
  ): Promise<void> {
    const manager = getConfigManager()
    
    await Promise.all(
      configs.map(({ key, value, description }) =>
        manager.setSystemConfig(key, value, updatedBy, description)
      )
    )
  },

  /**
   * Initializes default system configurations
   */
  async initializeDefaults(updatedBy: string = 'system'): Promise<void> {
    const manager = getConfigManager()
    
    const defaults = [
      { key: SYSTEM_CONFIG_KEYS.QUEUE_DEFAULT_RETENTION_DAYS, value: 90, description: 'Default retention period for queue metrics in days' },
      { key: SYSTEM_CONFIG_KEYS.QUEUE_DEFAULT_CLEANUP_INTERVAL, value: 3600, description: 'Default cleanup interval in seconds' },
      { key: SYSTEM_CONFIG_KEYS.QUEUE_DEFAULT_MAX_CONCURRENT_JOBS, value: 100, description: 'Default maximum concurrent jobs per queue' },
      { key: SYSTEM_CONFIG_KEYS.ALERTS_DEFAULT_COOLDOWN_MINUTES, value: 5, description: 'Default cooldown period for alerts in minutes' },
      { key: SYSTEM_CONFIG_KEYS.ALERTS_DEFAULT_CHANNELS, value: ['email'], description: 'Default alert channels' },
      { key: SYSTEM_CONFIG_KEYS.METRICS_COLLECTION_INTERVAL_SECONDS, value: 60, description: 'Metrics collection interval in seconds' },
      { key: SYSTEM_CONFIG_KEYS.METRICS_RETENTION_DAYS, value: 90, description: 'Metrics retention period in days' },
      { key: SYSTEM_CONFIG_KEYS.CACHE_TTL_SECONDS, value: 3600, description: 'Cache TTL in seconds' },
      { key: SYSTEM_CONFIG_KEYS.CONNECTION_POOL_SIZE, value: 10, description: 'Database connection pool size' },
      { key: SYSTEM_CONFIG_KEYS.RATE_LIMIT_WINDOW_MS, value: 60000, description: 'Rate limit window in milliseconds' },
      { key: SYSTEM_CONFIG_KEYS.RATE_LIMIT_MAX_REQUESTS, value: 100, description: 'Maximum requests per rate limit window' },
      { key: SYSTEM_CONFIG_KEYS.AUTO_RETRY_ENABLED, value: true, description: 'Enable automatic retry of failed jobs' },
      { key: SYSTEM_CONFIG_KEYS.AUTO_CLEANUP_ENABLED, value: true, description: 'Enable automatic cleanup of old jobs' },
      { key: SYSTEM_CONFIG_KEYS.AUTO_SCALING_ENABLED, value: false, description: 'Enable automatic scaling of workers' }
    ]

    for (const { key, value, description } of defaults) {
      try {
        const existing = await manager.getSystemConfig(key)
        if (existing === null) {
          await manager.setSystemConfig(key, value, updatedBy, description)
        }
      } catch (error) {
        console.error(`Failed to initialize system config ${key}:`, error)
      }
    }
  }
}

/**
 * Configuration validation utilities
 */
export const ConfigValidationUtils = {
  /**
   * Validates a queue name
   */
  isValidQueueName(name: string): boolean {
    return /^[a-zA-Z0-9_-]+$/.test(name) && name.length > 0 && name.length <= 255
  },

  /**
   * Suggests a valid queue name based on input
   */
  suggestQueueName(input: string): string {
    return input
      .toLowerCase()
      .replace(/[^a-zA-Z0-9_-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 255)
  },

  /**
   * Validates concurrency settings
   */
  isValidConcurrency(concurrency: number, priority: number): boolean {
    // High priority queues should have reasonable concurrency limits
    if (priority > 80 && concurrency > 50) {
      return false
    }
    return concurrency >= 1 && concurrency <= 1000
  },

  /**
   * Validates retry policy settings
   */
  isValidRetryPolicy(attempts: number, delay: number, maxDelay?: number): boolean {
    if (attempts < 1 || attempts > 10) return false
    if (delay < 0 || delay > 300000) return false
    if (maxDelay && (maxDelay <= delay || maxDelay > 3600000)) return false
    return true
  }
}

// Export all types and constants
export * from '../types/config'
export * from '../validation/config-validation'
export { QueueConfigManager } from '../services/QueueConfigManager'