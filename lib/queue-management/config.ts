/**
 * Queue Management System Configuration
 * 
 * Central configuration for the BullMQ queue management system
 */

import { z } from 'zod'

// Configuration Schema
const QueueManagementConfigSchema = z.object({
  // Redis Configuration
  redis: z.object({
    host: z.string().default('localhost'),
    port: z.number().default(6379),
    password: z.string().optional(),
    db: z.number().default(0),
    maxRetriesPerRequest: z.number().default(3),
    retryDelayOnFailover: z.number().default(100),
    enableReadyCheck: z.boolean().default(true),
    lazyConnect: z.boolean().default(true),
  }),

  // Database Configuration
  database: z.object({
    url: z.string(),
    maxConnections: z.number().default(20),
    connectionTimeout: z.number().default(30000),
    queryTimeout: z.number().default(60000),
  }),

  // Metrics Configuration
  metrics: z.object({
    enabled: z.boolean().default(true),
    collectionInterval: z.number().default(30000), // 30 seconds
    retentionDays: z.number().default(90),
    aggregationIntervals: z.array(z.enum(['1m', '5m', '1h', '1d'])).default(['1m', '5m', '1h', '1d']),
    batchSize: z.number().default(1000),
  }),

  // Alerts Configuration
  alerts: z.object({
    enabled: z.boolean().default(true),
    evaluationInterval: z.number().default(60000), // 1 minute
    cooldownPeriod: z.number().default(300000), // 5 minutes
    maxAlertsPerHour: z.number().default(100),
    channels: z.object({
      email: z.object({
        enabled: z.boolean().default(false),
        smtp: z.object({
          host: z.string().optional(),
          port: z.number().optional(),
          secure: z.boolean().default(true),
          auth: z.object({
            user: z.string().optional(),
            pass: z.string().optional(),
          }).optional(),
        }).optional(),
      }),
      slack: z.object({
        enabled: z.boolean().default(false),
        webhookUrl: z.string().optional(),
        channel: z.string().optional(),
      }),
      webhook: z.object({
        enabled: z.boolean().default(false),
        url: z.string().optional(),
        secret: z.string().optional(),
      }),
    }),
  }),

  // Performance Configuration
  performance: z.object({
    cacheEnabled: z.boolean().default(true),
    cacheTtl: z.object({
      queueHealth: z.number().default(30), // 30 seconds
      queueConfig: z.number().default(3600), // 1 hour
      userSession: z.number().default(1800), // 30 minutes
      metrics: z.number().default(300), // 5 minutes
    }),
    rateLimiting: z.object({
      enabled: z.boolean().default(true),
      windowMs: z.number().default(60000), // 1 minute
      maxRequests: z.number().default(100),
    }),
    pagination: z.object({
      defaultLimit: z.number().default(50),
      maxLimit: z.number().default(1000),
    }),
  }),

  // Security Configuration
  security: z.object({
    jwtSecret: z.string(),
    jwtExpiresIn: z.string().default('24h'),
    bcryptRounds: z.number().default(12),
    corsOrigins: z.array(z.string()).default(['http://localhost:3000']),
    apiKeyLength: z.number().default(32),
  }),

  // Feature Flags
  features: z.object({
    flowAnalysis: z.boolean().default(true),
    machineLearning: z.boolean().default(false),
    advancedMetrics: z.boolean().default(true),
    webhooks: z.boolean().default(true),
    auditLogging: z.boolean().default(true),
    automationPolicies: z.boolean().default(true),
  }),
})

export type QueueManagementConfig = z.infer<typeof QueueManagementConfigSchema>

// Default Configuration
const defaultConfig: QueueManagementConfig = {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_DB || '0'),
    maxRetriesPerRequest: 3,
    retryDelayOnFailover: 100,
    enableReadyCheck: true,
    lazyConnect: true,
  },
  database: {
    url: process.env.DATABASE_URL || '',
    maxConnections: parseInt(process.env.DB_MAX_CONNECTIONS || '20'),
    connectionTimeout: parseInt(process.env.DB_CONNECTION_TIMEOUT || '30000'),
    queryTimeout: parseInt(process.env.DB_QUERY_TIMEOUT || '60000'),
  },
  metrics: {
    enabled: process.env.QUEUE_METRICS_ENABLED !== 'false',
    collectionInterval: parseInt(process.env.QUEUE_METRICS_INTERVAL || '30000'),
    retentionDays: parseInt(process.env.QUEUE_METRICS_RETENTION_DAYS || '90'),
    aggregationIntervals: ['1m', '5m', '1h', '1d'],
    batchSize: parseInt(process.env.QUEUE_METRICS_BATCH_SIZE || '1000'),
  },
  alerts: {
    enabled: process.env.QUEUE_ALERTS_ENABLED !== 'false',
    evaluationInterval: parseInt(process.env.QUEUE_ALERTS_EVALUATION_INTERVAL || '60000'),
    cooldownPeriod: parseInt(process.env.QUEUE_ALERTS_COOLDOWN || '300000'),
    maxAlertsPerHour: parseInt(process.env.QUEUE_ALERTS_MAX_PER_HOUR || '100'),
    channels: {
      email: {
        enabled: process.env.QUEUE_ALERTS_EMAIL_ENABLED === 'true',
        smtp: {
          host: process.env.SMTP_HOST,
          port: parseInt(process.env.SMTP_PORT || '587'),
          secure: process.env.SMTP_SECURE === 'true',
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
          },
        },
      },
      slack: {
        enabled: process.env.QUEUE_ALERTS_SLACK_ENABLED === 'true',
        webhookUrl: process.env.SLACK_WEBHOOK_URL,
        channel: process.env.SLACK_CHANNEL,
      },
      webhook: {
        enabled: process.env.QUEUE_ALERTS_WEBHOOK_ENABLED === 'true',
        url: process.env.QUEUE_ALERTS_WEBHOOK_URL,
        secret: process.env.QUEUE_ALERTS_WEBHOOK_SECRET,
      },
    },
  },
  performance: {
    cacheEnabled: process.env.QUEUE_CACHE_ENABLED !== 'false',
    cacheTtl: {
      queueHealth: parseInt(process.env.QUEUE_CACHE_HEALTH_TTL || '30'),
      queueConfig: parseInt(process.env.QUEUE_CACHE_CONFIG_TTL || '3600'),
      userSession: parseInt(process.env.QUEUE_CACHE_SESSION_TTL || '1800'),
      metrics: parseInt(process.env.QUEUE_CACHE_METRICS_TTL || '300'),
    },
    rateLimiting: {
      enabled: process.env.QUEUE_RATE_LIMITING_ENABLED !== 'false',
      windowMs: parseInt(process.env.QUEUE_RATE_LIMIT_WINDOW || '60000'),
      maxRequests: parseInt(process.env.QUEUE_RATE_LIMIT_MAX || '100'),
    },
    pagination: {
      defaultLimit: parseInt(process.env.QUEUE_PAGINATION_DEFAULT_LIMIT || '50'),
      maxLimit: parseInt(process.env.QUEUE_PAGINATION_MAX_LIMIT || '1000'),
    },
  },
  security: {
    jwtSecret: process.env.QUEUE_JWT_SECRET || process.env.NEXTAUTH_SECRET || '',
    jwtExpiresIn: process.env.QUEUE_JWT_EXPIRES_IN || '24h',
    bcryptRounds: parseInt(process.env.QUEUE_BCRYPT_ROUNDS || '12'),
    corsOrigins: process.env.QUEUE_CORS_ORIGINS?.split(',') || ['http://localhost:3000'],
    apiKeyLength: parseInt(process.env.QUEUE_API_KEY_LENGTH || '32'),
  },
  features: {
    flowAnalysis: process.env.QUEUE_FEATURE_FLOW_ANALYSIS !== 'false',
    machineLearning: process.env.QUEUE_FEATURE_ML === 'true',
    advancedMetrics: process.env.QUEUE_FEATURE_ADVANCED_METRICS !== 'false',
    webhooks: process.env.QUEUE_FEATURE_WEBHOOKS !== 'false',
    auditLogging: process.env.QUEUE_FEATURE_AUDIT_LOGGING !== 'false',
    automationPolicies: process.env.QUEUE_FEATURE_AUTOMATION !== 'false',
  },
}

// Configuration instance
let config: QueueManagementConfig | null = null

/**
 * Get the queue management configuration
 */
export function getQueueManagementConfig(): QueueManagementConfig {
  if (!config) {
    try {
      config = QueueManagementConfigSchema.parse(defaultConfig)
    } catch (error) {
      console.error('Invalid queue management configuration:', error)
      throw new Error('Failed to load queue management configuration')
    }
  }
  return config
}

/**
 * Update configuration (useful for testing)
 */
export function setQueueManagementConfig(newConfig: Partial<QueueManagementConfig>): void {
  config = QueueManagementConfigSchema.parse({
    ...defaultConfig,
    ...newConfig,
  })
}

/**
 * Reset configuration to default
 */
export function resetQueueManagementConfig(): void {
  config = null
}

export default getQueueManagementConfig