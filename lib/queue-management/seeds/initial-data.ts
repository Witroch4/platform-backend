/**
 * Queue Management System - Initial Data Seeds
 * 
 * Functions to populate the database with initial configuration and sample data
 */

import { getPrismaInstance } from "@/lib/connections"
import { DEFAULTS, PERMISSIONS, ROLE_PERMISSIONS } from '../constants'

const prisma = getPrismaInstance()

/**
 * Seed system configurations
 */
export async function seedSystemConfigs() {
  const configs = [
    {
      key: 'queue.default.concurrency',
      value: 5,
      description: 'Default concurrency for new queues',
      category: 'queue',
    },
    {
      key: 'queue.default.retry.attempts',
      value: 3,
      description: 'Default retry attempts for failed jobs',
      category: 'queue',
    },
    {
      key: 'queue.default.retry.delay',
      value: 1000,
      description: 'Default retry delay in milliseconds',
      category: 'queue',
    },
    {
      key: 'metrics.collection.interval',
      value: 30000,
      description: 'Metrics collection interval in milliseconds',
      category: 'metrics',
    },
    {
      key: 'metrics.retention.days',
      value: 90,
      description: 'Metrics retention period in days',
      category: 'metrics',
    },
    {
      key: 'alerts.evaluation.interval',
      value: 60000,
      description: 'Alert evaluation interval in milliseconds',
      category: 'alerts',
    },
    {
      key: 'alerts.cooldown.default',
      value: 300000,
      description: 'Default alert cooldown period in milliseconds',
      category: 'alerts',
    },
    {
      key: 'cache.ttl.queue_health',
      value: 30,
      description: 'Queue health cache TTL in seconds',
      category: 'cache',
    },
    {
      key: 'cache.ttl.metrics',
      value: 300,
      description: 'Metrics cache TTL in seconds',
      category: 'cache',
    },
    {
      key: 'api.rate_limit.window',
      value: 60000,
      description: 'API rate limit window in milliseconds',
      category: 'api',
    },
    {
      key: 'api.rate_limit.max_requests',
      value: 100,
      description: 'Maximum API requests per window',
      category: 'api',
    },
  ]

  for (const config of configs) {
    await prisma.systemConfig.upsert({
      where: { key: config.key },
      update: {
        value: config.value,
        description: config.description,
        category: config.category,
        updatedBy: 'system',
      },
      create: {
        key: config.key,
        value: config.value,
        description: config.description,
        category: config.category,
        updatedBy: 'system',
      },
    })
  }

  console.log(`✅ Seeded ${configs.length} system configurations`)
}

/**
 * Seed default queue configurations
 */
export async function seedDefaultQueueConfigs() {
  const defaultQueues = [
    {
      name: 'default',
      displayName: 'Default Queue',
      description: 'Default queue for general purpose jobs',
      priority: 0,
      concurrency: 5,
      retryPolicy: {
        attempts: 3,
        backoff: 'exponential',
        delay: 1000,
      },
      cleanupPolicy: {
        removeOnComplete: 100,
        removeOnFail: 50,
      },
      alertThresholds: {
        queueSize: {
          warning: 100,
          critical: 500,
        },
        processingTime: {
          warning: 30000,
          critical: 120000,
        },
        errorRate: {
          warning: 0.05,
          critical: 0.15,
        },
      },
    },
    {
      name: 'high-priority',
      displayName: 'High Priority Queue',
      description: 'Queue for high priority jobs that need immediate processing',
      priority: 10,
      concurrency: 10,
      retryPolicy: {
        attempts: 5,
        backoff: 'exponential',
        delay: 500,
      },
      cleanupPolicy: {
        removeOnComplete: 200,
        removeOnFail: 100,
      },
      alertThresholds: {
        queueSize: {
          warning: 50,
          critical: 200,
        },
        processingTime: {
          warning: 15000,
          critical: 60000,
        },
        errorRate: {
          warning: 0.02,
          critical: 0.10,
        },
      },
    },
    {
      name: 'background',
      displayName: 'Background Queue',
      description: 'Queue for background tasks and batch processing',
      priority: -5,
      concurrency: 2,
      retryPolicy: {
        attempts: 2,
        backoff: 'fixed',
        delay: 5000,
      },
      cleanupPolicy: {
        removeOnComplete: 50,
        removeOnFail: 25,
      },
      alertThresholds: {
        queueSize: {
          warning: 500,
          critical: 2000,
        },
        processingTime: {
          warning: 300000,
          critical: 900000,
        },
        errorRate: {
          warning: 0.10,
          critical: 0.25,
        },
      },
    },
  ]

  for (const queue of defaultQueues) {
    await prisma.queueConfig.upsert({
      where: { name: queue.name },
      update: {
        displayName: queue.displayName,
        description: queue.description,
        priority: queue.priority,
        concurrency: queue.concurrency,
        retryPolicy: queue.retryPolicy,
        cleanupPolicy: queue.cleanupPolicy,
        alertThresholds: queue.alertThresholds,
        createdBy: 'system',
      },
      create: {
        name: queue.name,
        displayName: queue.displayName,
        description: queue.description,
        priority: queue.priority,
        concurrency: queue.concurrency,
        retryPolicy: queue.retryPolicy,
        cleanupPolicy: queue.cleanupPolicy,
        alertThresholds: queue.alertThresholds,
        createdBy: 'system',
      },
    })
  }

  console.log(`✅ Seeded ${defaultQueues.length} default queue configurations`)
}

/**
 * Seed default alert rules
 */
export async function seedDefaultAlertRules() {
  const alertRules = [
    {
      name: 'High Queue Size',
      description: 'Alert when queue size exceeds threshold',
      condition: {
        metric: 'queue_size',
        operator: '>',
        threshold: 100,
        timeWindow: 5,
        aggregation: 'avg',
      },
      severity: 'warning' as const,
      channels: [
        {
          type: 'webhook',
          config: {
            url: process.env.QUEUE_ALERTS_WEBHOOK_URL || 'http://localhost:3000/api/webhooks/alerts',
          },
        },
      ],
      cooldown: 15,
      enabled: true,
      createdBy: 'system',
    },
    {
      name: 'Critical Queue Size',
      description: 'Critical alert when queue size is extremely high',
      condition: {
        metric: 'queue_size',
        operator: '>',
        threshold: 500,
        timeWindow: 2,
        aggregation: 'avg',
      },
      severity: 'critical' as const,
      channels: [
        {
          type: 'webhook',
          config: {
            url: process.env.QUEUE_ALERTS_WEBHOOK_URL || 'http://localhost:3000/api/webhooks/alerts',
          },
        },
      ],
      cooldown: 5,
      enabled: true,
      createdBy: 'system',
    },
    {
      name: 'High Error Rate',
      description: 'Alert when job error rate is high',
      condition: {
        metric: 'error_rate',
        operator: '>',
        threshold: 0.05,
        timeWindow: 10,
        aggregation: 'avg',
      },
      severity: 'error' as const,
      channels: [
        {
          type: 'webhook',
          config: {
            url: process.env.QUEUE_ALERTS_WEBHOOK_URL || 'http://localhost:3000/api/webhooks/alerts',
          },
        },
      ],
      cooldown: 10,
      enabled: true,
      createdBy: 'system',
    },
    {
      name: 'Slow Processing Time',
      description: 'Alert when job processing time is too slow',
      condition: {
        metric: 'avg_processing_time',
        operator: '>',
        threshold: 30000,
        timeWindow: 15,
        aggregation: 'avg',
      },
      severity: 'warning' as const,
      channels: [
        {
          type: 'webhook',
          config: {
            url: process.env.QUEUE_ALERTS_WEBHOOK_URL || 'http://localhost:3000/api/webhooks/alerts',
          },
        },
      ],
      cooldown: 20,
      enabled: true,
      createdBy: 'system',
    },
  ]

  for (const rule of alertRules) {
    await prisma.alertRule.upsert({
      where: { id: rule.name }, // Using name as id for seeding
      update: {
        description: rule.description,
        condition: rule.condition,
        severity: rule.severity,
        channels: rule.channels,
        cooldown: rule.cooldown,
        enabled: rule.enabled,
        createdBy: rule.createdBy,
      },
      create: {
        ...rule,
        id: rule.name, // Using name as id for seeding
      },
    })
  }

  console.log(`✅ Seeded ${alertRules.length} default alert rules`)
}

/**
 * Seed default automation policies
 */
export async function seedDefaultAutomationPolicies() {
  const policies = [
    {
      name: 'Auto Retry Failed Jobs',
      description: 'Automatically retry failed jobs with exponential backoff',
      triggerCondition: {
        type: 'job_state',
        config: {
          state: 'failed',
          maxAttempts: 3,
        },
      },
      actions: [
        {
          type: 'retry_jobs',
          config: {
            delay: 5000,
            backoff: 'exponential',
          },
        },
      ],
      enabled: true,
      priority: 1,
      createdBy: 'system',
    },
    {
      name: 'Pause Overloaded Queues',
      description: 'Pause queues when they become overloaded',
      triggerCondition: {
        type: 'metric_threshold',
        config: {
          metric: 'queue_size',
          threshold: 1000,
          timeWindow: 5,
        },
      },
      actions: [
        {
          type: 'pause_queue',
          config: {
            duration: 300000, // 5 minutes
          },
        },
        {
          type: 'send_alert',
          config: {
            severity: 'critical',
            message: 'Queue paused due to overload',
          },
        },
      ],
      enabled: false, // Disabled by default for safety
      priority: 10,
      createdBy: 'system',
    },
    {
      name: 'Clean Old Completed Jobs',
      description: 'Automatically clean old completed jobs',
      triggerCondition: {
        type: 'time_based',
        config: {
          schedule: '0 2 * * *', // Daily at 2 AM
        },
      },
      actions: [
        {
          type: 'execute_script',
          config: {
            script: 'cleanup-completed-jobs',
            maxAge: 604800000, // 7 days
          },
        },
      ],
      enabled: true,
      priority: 0,
      createdBy: 'system',
    },
  ]

  for (const policy of policies) {
    await prisma.automationPolicy.upsert({
      where: { id: policy.name }, // Using name as id for seeding
      update: {
        description: policy.description,
        triggerCondition: policy.triggerCondition,
        actions: policy.actions,
        enabled: policy.enabled,
        priority: policy.priority,
        createdBy: policy.createdBy,
      },
      create: {
        ...policy,
        id: policy.name, // Using name as id for seeding
      },
    })
  }

  console.log(`✅ Seeded ${policies.length} default automation policies`)
}

/**
 * Seed sample webhook configurations
 */
export async function seedSampleWebhooks() {
  const webhooks = [
    {
      name: 'Alert Notifications',
      url: process.env.QUEUE_ALERTS_WEBHOOK_URL || 'http://localhost:3000/api/webhooks/alerts',
      events: ['alert.triggered'],
      headers: {
        'Content-Type': 'application/json',
        'X-Source': 'queue-management',
      },
      enabled: true,
      retryPolicy: {
        attempts: 3,
        backoff: 'exponential',
        delay: 1000,
      },
      createdBy: 'system',
    },
    {
      name: 'Job Completion Notifications',
      url: process.env.QUEUE_JOB_WEBHOOK_URL || 'http://localhost:3000/api/webhooks/jobs',
      events: ['job.completed', 'job.failed'],
      headers: {
        'Content-Type': 'application/json',
        'X-Source': 'queue-management',
      },
      enabled: false, // Disabled by default to avoid spam
      retryPolicy: {
        attempts: 2,
        backoff: 'fixed',
        delay: 2000,
      },
      createdBy: 'system',
    },
  ]

  for (const webhook of webhooks) {
    await prisma.webhookConfig.upsert({
      where: { id: webhook.name }, // Using name as id for seeding
      update: {
        url: webhook.url,
        events: webhook.events,
        headers: webhook.headers,
        enabled: webhook.enabled,
        retryPolicy: webhook.retryPolicy,
        createdBy: webhook.createdBy,
      },
      create: {
        ...webhook,
        id: webhook.name, // Using name as id for seeding
      },
    })
  }

  console.log(`✅ Seeded ${webhooks.length} sample webhook configurations`)
}

/**
 * Create default admin user for queue management
 */
export async function seedDefaultQueueUser(userId: string, email: string, name: string) {
  await prisma.queueUser.upsert({
    where: { userId },
    update: {
      email,
      name,
      role: 'superadmin',
      permissions: Object.values(PERMISSIONS),
      queueAccess: {},
    },
    create: {
      userId,
      email,
      name,
      role: 'superadmin',
      permissions: Object.values(PERMISSIONS),
      queueAccess: {},
    },
  })

  console.log(`✅ Created default queue management admin user: ${email}`)
}

/**
 * Run all seed functions
 */
export async function seedQueueManagementSystem(adminUserId?: string, adminEmail?: string, adminName?: string) {
  try {
    console.log('🌱 Seeding Queue Management System...')

    await seedSystemConfigs()
    await seedDefaultQueueConfigs()
    await seedDefaultAlertRules()
    await seedDefaultAutomationPolicies()
    await seedSampleWebhooks()

    if (adminUserId && adminEmail && adminName) {
      await seedDefaultQueueUser(adminUserId, adminEmail, adminName)
    }

    console.log('✅ Queue Management System seeding completed successfully!')
  } catch (error) {
    console.error('❌ Error seeding Queue Management System:', error)
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

/**
 * Clean up all queue management data (for testing)
 */
export async function cleanupQueueManagementData() {
  try {
    console.log('🧹 Cleaning up Queue Management System data...')

    // Delete in reverse dependency order
    await prisma.webhookDelivery.deleteMany()
    await prisma.webhookConfig.deleteMany()
    await prisma.automationPolicy.deleteMany()
    await prisma.auditLog.deleteMany()
    await prisma.queueUser.deleteMany()
    await prisma.systemConfig.deleteMany()
    await prisma.jobDependency.deleteMany()
    await prisma.jobFlow.deleteMany()
    await prisma.alert.deleteMany()
    await prisma.alertRule.deleteMany()
    await prisma.jobMetrics.deleteMany()
    await prisma.queueMetrics.deleteMany()
    await prisma.queueConfig.deleteMany()

    console.log('✅ Queue Management System cleanup completed!')
  } catch (error) {
    console.error('❌ Error cleaning up Queue Management System:', error)
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

