#!/usr/bin/env tsx

/**
 * Test script to verify the queue management database structure
 * This script tests all the tables and indexes created for the BullMQ queue management system
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function testQueueDatabaseStructure() {
  console.log('🔍 Testing Queue Management Database Structure...\n')

  try {
    // Test 1: Verify QueueConfig table
    console.log('1. Testing QueueConfig table...')
    const testQueueConfig = await prisma.queueConfig.create({
      data: {
        name: 'test-queue',
        displayName: 'Test Queue',
        description: 'Test queue for verification',
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
          waitingJobs: 100,
          processingTime: 30000,
          errorRate: 0.05
        },
        createdBy: 'test-user'
      }
    })
    console.log('✅ QueueConfig created successfully')

    // Test 2: Verify QueueMetrics table
    console.log('2. Testing QueueMetrics table...')
    const testQueueMetrics = await prisma.queueMetrics.create({
      data: {
        queueName: 'test-queue',
        timestamp: new Date(),
        waitingCount: 10,
        activeCount: 2,
        completedCount: 100,
        failedCount: 5,
        delayedCount: 3,
        throughputPerMinute: 15.5,
        avgProcessingTime: 2500.0,
        successRate: 95.0,
        errorRate: 5.0,
        memoryUsage: BigInt(1024 * 1024 * 100), // 100MB
        cpuUsage: 25.5
      }
    })
    console.log('✅ QueueMetrics created successfully')

    // Test 3: Verify JobMetrics table
    console.log('3. Testing JobMetrics table...')
    const testJobMetrics = await prisma.jobMetrics.create({
      data: {
        jobId: 'job-123',
        queueName: 'test-queue',
        jobName: 'test-job',
        jobType: 'email-processing',
        status: 'completed',
        createdAt: new Date(),
        startedAt: new Date(),
        completedAt: new Date(),
        processingTime: 2500,
        waitTime: 1000,
        attempts: 1,
        maxAttempts: 3,
        memoryPeak: BigInt(1024 * 1024 * 50), // 50MB
        cpuTime: 2000,
        correlationId: 'corr-123',
        flowId: 'flow-456',
        payloadSize: 1024,
        resultSize: 512
      }
    })
    console.log('✅ JobMetrics created successfully')

    // Test 4: Verify AlertRule table
    console.log('4. Testing AlertRule table...')
    const testAlertRule = await prisma.alertRule.create({
      data: {
        name: 'High Error Rate Alert',
        description: 'Alert when error rate exceeds 10%',
        queueName: 'test-queue',
        condition: {
          metric: 'errorRate',
          operator: '>',
          threshold: 10,
          timeWindow: 5
        },
        severity: 'warning',
        channels: ['email', 'slack'],
        cooldown: 10,
        createdBy: 'test-user'
      }
    })
    console.log('✅ AlertRule created successfully')

    // Test 5: Verify Alert table
    console.log('5. Testing Alert table...')
    const testAlert = await prisma.alert.create({
      data: {
        ruleId: testAlertRule.id,
        queueName: 'test-queue',
        severity: 'warning',
        title: 'High Error Rate Detected',
        message: 'Error rate has exceeded 10% threshold',
        metrics: {
          errorRate: 12.5,
          timeWindow: '5m'
        }
      }
    })
    console.log('✅ Alert created successfully')

    // Test 6: Verify JobFlow table
    console.log('6. Testing JobFlow table...')
    const testJobFlow = await prisma.jobFlow.create({
      data: {
        flowId: 'flow-456',
        name: 'Email Processing Flow',
        description: 'Complete email processing workflow',
        rootJobId: 'job-123',
        status: 'running',
        totalJobs: 5,
        completedJobs: 2,
        failedJobs: 0,
        startedAt: new Date(),
        metadata: {
          priority: 'high',
          tags: ['email', 'processing']
        }
      }
    })
    console.log('✅ JobFlow created successfully')

    // Test 7: Verify JobDependency table
    console.log('7. Testing JobDependency table...')
    const testJobDependency = await prisma.jobDependency.create({
      data: {
        flowId: 'flow-456',
        jobId: 'job-124',
        parentJobId: 'job-123',
        dependencyType: 'sequential',
        condition: {
          waitFor: 'completion'
        }
      }
    })
    console.log('✅ JobDependency created successfully')

    // Test 8: Verify SystemConfig table
    console.log('8. Testing SystemConfig table...')
    const testSystemConfig = await prisma.systemConfig.create({
      data: {
        key: 'queue.default.concurrency',
        value: { concurrency: 10 },
        description: 'Default concurrency for new queues',
        category: 'queue-defaults',
        updatedBy: 'test-user'
      }
    })
    console.log('✅ SystemConfig created successfully')

    // Test 9: Verify QueueUser table
    console.log('9. Testing QueueUser table...')
    const testQueueUser = await prisma.queueUser.create({
      data: {
        userId: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        role: 'operator',
        permissions: ['queue:view', 'job:retry'],
        queueAccess: {
          'test-queue': ['view', 'manage']
        }
      }
    })
    console.log('✅ QueueUser created successfully')

    // Test 10: Verify AuditLog table
    console.log('10. Testing AuditLog table...')
    const testAuditLog = await prisma.auditLog.create({
      data: {
        userId: 'user-123',
        action: 'job.retry',
        resourceType: 'job',
        resourceId: 'job-123',
        queueName: 'test-queue',
        details: {
          reason: 'Manual retry requested',
          previousAttempts: 1
        },
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0 Test Browser'
      }
    })
    console.log('✅ AuditLog created successfully')

    // Test 11: Verify AutomationPolicy table
    console.log('11. Testing AutomationPolicy table...')
    const testAutomationPolicy = await prisma.automationPolicy.create({
      data: {
        name: 'Auto Retry Failed Jobs',
        description: 'Automatically retry failed jobs with exponential backoff',
        queueName: 'test-queue',
        triggerCondition: {
          event: 'job.failed',
          condition: 'attempts < maxAttempts'
        },
        actions: [
          {
            type: 'retry',
            delay: 'exponential',
            maxAttempts: 3
          }
        ],
        priority: 1,
        createdBy: 'test-user'
      }
    })
    console.log('✅ AutomationPolicy created successfully')

    // Test 12: Verify WebhookConfig table
    console.log('12. Testing WebhookConfig table...')
    const testWebhookConfig = await prisma.webhookConfig.create({
      data: {
        name: 'Slack Notifications',
        url: 'https://hooks.slack.com/services/test/webhook',
        events: ['job.failed', 'alert.triggered'],
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-token'
        },
        secret: 'webhook-secret-123',
        retryPolicy: {
          attempts: 3,
          backoff: 'exponential'
        },
        createdBy: 'test-user'
      }
    })
    console.log('✅ WebhookConfig created successfully')

    // Test 13: Verify WebhookDelivery table
    console.log('13. Testing WebhookDelivery table...')
    const testWebhookDelivery = await prisma.webhookDelivery.create({
      data: {
        webhookId: testWebhookConfig.id,
        eventType: 'job.failed',
        payload: {
          jobId: 'job-123',
          queueName: 'test-queue',
          error: 'Processing failed',
          timestamp: new Date().toISOString()
        },
        responseStatus: 200,
        responseBody: 'OK',
        attempts: 1,
        deliveredAt: new Date()
      }
    })
    console.log('✅ WebhookDelivery created successfully')

    // Test 14: Verify indexes are working with queries
    console.log('14. Testing index performance...')
    
    // Test queue metrics query with time-based index
    const recentMetrics = await prisma.queueMetrics.findMany({
      where: {
        queueName: 'test-queue',
        timestamp: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
        }
      },
      orderBy: {
        timestamp: 'desc'
      },
      take: 10
    })
    console.log(`✅ Found ${recentMetrics.length} recent metrics`)

    // Test job metrics query with correlation ID
    const correlatedJobs = await prisma.jobMetrics.findMany({
      where: {
        correlationId: 'corr-123'
      }
    })
    console.log(`✅ Found ${correlatedJobs.length} correlated jobs`)

    // Test alert query with severity filter
    const criticalAlerts = await prisma.alert.findMany({
      where: {
        severity: 'warning',
        status: 'active'
      },
      include: {
        rule: true
      }
    })
    console.log(`✅ Found ${criticalAlerts.length} active alerts`)

    console.log('\n🎉 All database structure tests passed successfully!')
    console.log('\n📊 Database Summary:')
    console.log(`- QueueConfig: ${await prisma.queueConfig.count()} records`)
    console.log(`- QueueMetrics: ${await prisma.queueMetrics.count()} records`)
    console.log(`- JobMetrics: ${await prisma.jobMetrics.count()} records`)
    console.log(`- AlertRule: ${await prisma.alertRule.count()} records`)
    console.log(`- Alert: ${await prisma.alert.count()} records`)
    console.log(`- JobFlow: ${await prisma.jobFlow.count()} records`)
    console.log(`- JobDependency: ${await prisma.jobDependency.count()} records`)
    console.log(`- SystemConfig: ${await prisma.systemConfig.count()} records`)
    console.log(`- QueueUser: ${await prisma.queueUser.count()} records`)
    console.log(`- AuditLog: ${await prisma.auditLog.count()} records`)
    console.log(`- AutomationPolicy: ${await prisma.automationPolicy.count()} records`)
    console.log(`- WebhookConfig: ${await prisma.webhookConfig.count()} records`)
    console.log(`- WebhookDelivery: ${await prisma.webhookDelivery.count()} records`)

  } catch (error) {
    console.error('❌ Database structure test failed:', error)
    throw error
  } finally {
    // Cleanup test data
    console.log('\n🧹 Cleaning up test data...')
    try {
      await prisma.webhookDelivery.deleteMany({ where: { webhookId: { contains: 'test' } } })
      await prisma.webhookConfig.deleteMany({ where: { name: { contains: 'test' } } })
      await prisma.automationPolicy.deleteMany({ where: { name: { contains: 'test' } } })
      await prisma.auditLog.deleteMany({ where: { userId: 'user-123' } })
      await prisma.queueUser.deleteMany({ where: { userId: 'user-123' } })
      await prisma.systemConfig.deleteMany({ where: { key: { contains: 'test' } } })
      await prisma.jobDependency.deleteMany({ where: { flowId: 'flow-456' } })
      await prisma.jobFlow.deleteMany({ where: { flowId: 'flow-456' } })
      await prisma.alert.deleteMany({ where: { queueName: 'test-queue' } })
      await prisma.alertRule.deleteMany({ where: { queueName: 'test-queue' } })
      await prisma.jobMetrics.deleteMany({ where: { queueName: 'test-queue' } })
      await prisma.queueMetrics.deleteMany({ where: { queueName: 'test-queue' } })
      await prisma.queueConfig.deleteMany({ where: { name: 'test-queue' } })
      console.log('✅ Test data cleaned up successfully')
    } catch (cleanupError) {
      console.warn('⚠️ Some test data may not have been cleaned up:', cleanupError)
    }
    
    await prisma.$disconnect()
  }
}

// Run the test
testQueueDatabaseStructure()
  .then(() => {
    console.log('\n✅ Queue management database structure verification completed successfully!')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n❌ Queue management database structure verification failed:', error)
    process.exit(1)
  })