/**
 * Configuration validation using Zod schemas
 * Provides comprehensive validation for queue configurations and system settings
 */

import { z } from 'zod'
import { 
  QueueConfig, 
  SystemConfig, 
  QueueConfigValidationResult, 
  QueueConfigValidationError,
  SystemConfigKey,
  SYSTEM_CONFIG_KEYS,
  RetryPolicy,
  CleanupPolicy,
  AlertThresholds
} from '../types/config'

// Base validation schemas
const RateLimiterConfigSchema = z.object({
  max: z.number().int().min(1).max(10000),
  duration: z.number().int().min(1000).max(3600000), // 1 second to 1 hour
  bounceBack: z.boolean().optional()
}).optional()

const RetryPolicySchema = z.object({
  attempts: z.number().int().min(1).max(10),
  backoff: z.enum(['fixed', 'exponential']),
  delay: z.number().int().min(0).max(300000), // max 5 minutes
  maxDelay: z.number().int().min(1000).max(3600000).optional() // max 1 hour
})

const CleanupPolicySchema = z.object({
  removeOnComplete: z.number().int().min(0).max(10000),
  removeOnFail: z.number().int().min(0).max(10000),
  maxAge: z.number().int().min(60000).optional() // min 1 minute
})

const AlertThresholdsSchema = z.object({
  waitingJobs: z.number().int().min(1).max(100000),
  processingTime: z.number().int().min(1000).max(3600000), // 1 second to 1 hour
  errorRate: z.number().min(0).max(1), // 0% to 100%
  memoryUsage: z.number().int().min(1024).optional(), // min 1KB
  cpuUsage: z.number().min(0).max(1).optional() // 0% to 100%
})

// Main queue configuration schema
export const QueueConfigSchema = z.object({
  id: z.string().optional(),
  name: z.string()
    .min(1, 'Queue name is required')
    .max(255, 'Queue name must be less than 255 characters')
    .regex(/^[a-zA-Z0-9_-]+$/, 'Queue name can only contain letters, numbers, underscores, and hyphens'),
  displayName: z.string().max(255).optional(),
  description: z.string().max(1000).optional(),
  priority: z.number().int().min(0).max(100),
  concurrency: z.number().int().min(1).max(1000),
  rateLimiter: RateLimiterConfigSchema,
  retryPolicy: RetryPolicySchema,
  cleanupPolicy: CleanupPolicySchema,
  alertThresholds: AlertThresholdsSchema,
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
  createdBy: z.string().min(1, 'Created by is required')
})

// System configuration schema
export const SystemConfigSchema = z.object({
  id: z.string().optional(),
  key: z.string().min(1, 'Configuration key is required'),
  value: z.any(),
  description: z.string().max(500).optional(),
  category: z.string().max(100).optional(),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
  updatedBy: z.string().optional()
})

// Specific validation for system config keys
const SystemConfigValueSchemas: Record<string, z.ZodSchema> = {
  [SYSTEM_CONFIG_KEYS.QUEUE_DEFAULT_RETENTION_DAYS]: z.number().int().min(1).max(365),
  [SYSTEM_CONFIG_KEYS.QUEUE_DEFAULT_CLEANUP_INTERVAL]: z.number().int().min(60).max(86400), // 1 minute to 1 day
  [SYSTEM_CONFIG_KEYS.QUEUE_DEFAULT_MAX_CONCURRENT_JOBS]: z.number().int().min(1).max(10000),
  [SYSTEM_CONFIG_KEYS.ALERTS_DEFAULT_COOLDOWN_MINUTES]: z.number().int().min(1).max(1440), // 1 minute to 1 day
  [SYSTEM_CONFIG_KEYS.ALERTS_DEFAULT_CHANNELS]: z.array(z.string()),
  [SYSTEM_CONFIG_KEYS.METRICS_COLLECTION_INTERVAL_SECONDS]: z.number().int().min(10).max(3600), // 10 seconds to 1 hour
  [SYSTEM_CONFIG_KEYS.METRICS_RETENTION_DAYS]: z.number().int().min(1).max(365),
  [SYSTEM_CONFIG_KEYS.CACHE_TTL_SECONDS]: z.number().int().min(10).max(86400), // 10 seconds to 1 day
  [SYSTEM_CONFIG_KEYS.CONNECTION_POOL_SIZE]: z.number().int().min(1).max(100),
  [SYSTEM_CONFIG_KEYS.RATE_LIMIT_WINDOW_MS]: z.number().int().min(1000).max(3600000), // 1 second to 1 hour
  [SYSTEM_CONFIG_KEYS.RATE_LIMIT_MAX_REQUESTS]: z.number().int().min(1).max(10000),
  [SYSTEM_CONFIG_KEYS.AUTO_RETRY_ENABLED]: z.boolean(),
  [SYSTEM_CONFIG_KEYS.AUTO_CLEANUP_ENABLED]: z.boolean(),
  [SYSTEM_CONFIG_KEYS.AUTO_SCALING_ENABLED]: z.boolean()
}

/**
 * Validates a queue configuration object
 */
export function validateQueueConfig(config: Partial<QueueConfig>): QueueConfigValidationResult {
  try {
    QueueConfigSchema.parse(config)
    return { isValid: true, errors: [] }
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errors: QueueConfigValidationError[] = error.errors.map(err => ({
        field: err.path.join('.'),
        message: err.message,
        value: err.code === 'invalid_type' ? undefined : (err as any).received
      }))
      return { isValid: false, errors }
    }
    return {
      isValid: false,
      errors: [{ field: 'unknown', message: 'Unknown validation error' }]
    }
  }
}

/**
 * Validates a system configuration object
 */
export function validateSystemConfig(config: Partial<SystemConfig>): QueueConfigValidationResult {
  try {
    // First validate the basic structure
    SystemConfigSchema.parse(config)
    
    // Then validate the value based on the key
    if (config.key && config.value !== undefined) {
      const valueSchema = SystemConfigValueSchemas[config.key as SystemConfigKey]
      if (valueSchema) {
        valueSchema.parse(config.value)
      }
    }
    
    return { isValid: true, errors: [] }
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errors: QueueConfigValidationError[] = error.errors.map(err => ({
        field: err.path.join('.'),
        message: err.message,
        value: err.code === 'invalid_type' ? undefined : (err as any).received
      }))
      return { isValid: false, errors }
    }
    return {
      isValid: false,
      errors: [{ field: 'unknown', message: 'Unknown validation error' }]
    }
  }
}

/**
 * Validates that retry policy configuration is consistent
 */
export function validateRetryPolicyConsistency(retryPolicy: RetryPolicy): QueueConfigValidationError[] {
  const errors: QueueConfigValidationError[] = []
  
  if (retryPolicy.backoff === 'exponential' && !retryPolicy.maxDelay) {
    errors.push({
      field: 'retryPolicy.maxDelay',
      message: 'maxDelay is required when using exponential backoff'
    })
  }
  
  if (retryPolicy.maxDelay && retryPolicy.maxDelay <= retryPolicy.delay) {
    errors.push({
      field: 'retryPolicy.maxDelay',
      message: 'maxDelay must be greater than delay'
    })
  }
  
  return errors
}

/**
 * Validates that cleanup policy configuration is reasonable
 */
export function validateCleanupPolicyConsistency(cleanupPolicy: CleanupPolicy): QueueConfigValidationError[] {
  const errors: QueueConfigValidationError[] = []
  
  if (cleanupPolicy.removeOnComplete === 0 && cleanupPolicy.removeOnFail === 0) {
    errors.push({
      field: 'cleanupPolicy',
      message: 'At least one cleanup policy must be greater than 0 to prevent infinite storage growth'
    })
  }
  
  return errors
}

/**
 * Validates that alert thresholds are reasonable
 */
export function validateAlertThresholdsConsistency(alertThresholds: AlertThresholds): QueueConfigValidationError[] {
  const errors: QueueConfigValidationError[] = []
  
  if (alertThresholds.errorRate >= 1) {
    errors.push({
      field: 'alertThresholds.errorRate',
      message: 'Error rate threshold of 100% or higher is not practical'
    })
  }
  
  if (alertThresholds.processingTime < 1000) {
    errors.push({
      field: 'alertThresholds.processingTime',
      message: 'Processing time threshold should be at least 1 second for practical alerting'
    })
  }
  
  return errors
}

/**
 * Performs comprehensive validation including consistency checks
 */
export function validateQueueConfigComprehensive(config: Partial<QueueConfig>): QueueConfigValidationResult {
  // First run basic validation
  const basicValidation = validateQueueConfig(config)
  if (!basicValidation.isValid) {
    return basicValidation
  }
  
  const errors: QueueConfigValidationError[] = []
  
  // Run consistency checks
  if (config.retryPolicy) {
    errors.push(...validateRetryPolicyConsistency(config.retryPolicy))
  }
  
  if (config.cleanupPolicy) {
    errors.push(...validateCleanupPolicyConsistency(config.cleanupPolicy))
  }
  
  if (config.alertThresholds) {
    errors.push(...validateAlertThresholdsConsistency(config.alertThresholds))
  }
  
  return {
    isValid: errors.length === 0,
    errors
  }
}

/**
 * Validates that a system config key is recognized
 */
export function isValidSystemConfigKey(key: string): key is SystemConfigKey {
  return Object.values(SYSTEM_CONFIG_KEYS).includes(key as SystemConfigKey)
}

/**
 * Gets the expected type for a system config key
 */
export function getSystemConfigKeyType(key: SystemConfigKey): string {
  const schema = SystemConfigValueSchemas[key]
  if (!schema) return 'unknown'
  
  if (schema instanceof z.ZodNumber) return 'number'
  if (schema instanceof z.ZodString) return 'string'
  if (schema instanceof z.ZodBoolean) return 'boolean'
  if (schema instanceof z.ZodArray) return 'array'
  if (schema instanceof z.ZodObject) return 'object'
  
  return 'unknown'
}