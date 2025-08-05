/**
 * Demonstration script for the Queue Configuration System
 * Shows how to use the configuration manager and templates
 */

import { getPrismaInstance } from "@/lib/connections"
import * as QueueConfig from '../lib/queue-management/config'

async function demonstrateQueueConfig() {
  console.log('🚀 Queue Configuration System Demo\n')

  const prisma = getPrismaInstance()
  
  try {
    // Initialize the configuration manager
    console.log('1. Initializing configuration manager...')
    QueueConfig.initializeConfigManager(prisma, undefined, {
      cacheEnabled: false, // Disable cache for demo
      validateOnSave: true,
      auditChanges: true
    })
    console.log('✅ Configuration manager initialized\n')

    // Initialize default system configurations
    console.log('2. Setting up default system configurations...')
    await QueueConfig.SystemConfigUtils.initializeDefaults('demo-user')
    console.log('✅ Default system configurations initialized\n')

    // Create queue configurations using templates
    console.log('3. Creating queue configurations using templates...')
    
    const criticalQueue = await QueueConfig.ConfigTemplates.critical('payment-processing', 'demo-user')
      .displayName('Payment Processing Queue')
      .description('High-priority queue for payment processing')
      .save()
    console.log(`✅ Created critical queue: ${criticalQueue.name} (Priority: ${criticalQueue.priority})`)

    const standardQueue = await QueueConfig.ConfigTemplates.standard('email-notifications', 'demo-user')
      .displayName('Email Notifications Queue')
      .description('Standard queue for sending email notifications')
      .save()
    console.log(`✅ Created standard queue: ${standardQueue.name} (Priority: ${standardQueue.priority})`)

    const backgroundQueue = await QueueConfig.ConfigTemplates.background('data-cleanup', 'demo-user')
      .displayName('Data Cleanup Queue')
      .description('Background queue for data cleanup tasks')
      .save()
    console.log(`✅ Created background queue: ${backgroundQueue.name} (Priority: ${backgroundQueue.priority})`)

    const batchQueue = await QueueConfig.ConfigTemplates.batch('report-generation', 'demo-user')
      .displayName('Report Generation Queue')
      .description('Batch processing queue for generating reports')
      .save()
    console.log(`✅ Created batch queue: ${batchQueue.name} (Priority: ${batchQueue.priority})`)

    const realtimeQueue = await QueueConfig.ConfigTemplates.realtime('chat-messages', 'demo-user')
      .displayName('Chat Messages Queue')
      .description('Real-time queue for chat message processing')
      .save()
    console.log(`✅ Created realtime queue: ${realtimeQueue.name} (Priority: ${realtimeQueue.priority})\n`)

    // Create a custom queue configuration
    console.log('4. Creating custom queue configuration...')
    const customQueue = await QueueConfig.createQueueConfig('custom-webhook-processor', 'demo-user')
      .displayName('Custom Webhook Processor')
      .description('Custom queue for processing webhooks with specific requirements')
      .priority(75)
      .concurrency(8)
      .retryPolicy(4, 'exponential', 2000, 60000)
      .cleanupPolicy(200, 100, 86400000) // 24 hours
      .alertThresholds(25, 10000, 0.03) // 25 waiting jobs, 10s processing, 3% error rate
      .memoryAlert(512 * 1024 * 1024) // 512MB
      .cpuAlert(0.8) // 80% CPU
      .rateLimiter(50, 60000) // 50 requests per minute
      .save()
    console.log(`✅ Created custom queue: ${customQueue.name} (Priority: ${customQueue.priority})\n`)

    // Retrieve and display all configurations
    console.log('5. Retrieving all queue configurations...')
    const manager = QueueConfig.getConfigManager()
    const allConfigs = await manager.getAllQueueConfigs()
    
    console.log(`📊 Total configurations: ${allConfigs.length}`)
    allConfigs.forEach(config => {
      console.log(`   • ${config.name} (${config.displayName}) - Priority: ${config.priority}, Concurrency: ${config.concurrency}`)
    })
    console.log()

    // Update a configuration
    console.log('6. Updating a queue configuration...')
    const updatedQueue = await manager.updateQueueConfig(
      'email-notifications',
      {
        displayName: 'Updated Email Notifications Queue',
        concurrency: 8,
        priority: 60
      },
      'demo-user'
    )
    console.log(`✅ Updated queue: ${updatedQueue.name} - New priority: ${updatedQueue.priority}, New concurrency: ${updatedQueue.concurrency}\n`)

    // Demonstrate system configuration
    console.log('7. Working with system configurations...')
    
    // Set some system configurations
    await QueueConfig.SystemConfigUtils.setMultiple([
      { 
        key: QueueConfig.SYSTEM_CONFIG_KEYS.METRICS_COLLECTION_INTERVAL_SECONDS, 
        value: 30, 
        description: 'Collect metrics every 30 seconds for demo' 
      },
      { 
        key: QueueConfig.SYSTEM_CONFIG_KEYS.CACHE_TTL_SECONDS, 
        value: 1800, 
        description: '30 minute cache TTL for demo' 
      }
    ], 'demo-user')

    // Get system configurations
    const metricsInterval = await QueueConfig.SystemConfigUtils.getWithDefault(
      QueueConfig.SYSTEM_CONFIG_KEYS.METRICS_COLLECTION_INTERVAL_SECONDS,
      60
    )
    const cacheTTL = await QueueConfig.SystemConfigUtils.getWithDefault(
      QueueConfig.SYSTEM_CONFIG_KEYS.CACHE_TTL_SECONDS,
      3600
    )
    
    console.log(`✅ Metrics collection interval: ${metricsInterval} seconds`)
    console.log(`✅ Cache TTL: ${cacheTTL} seconds\n`)

    // Show configuration statistics
    console.log('8. Configuration statistics...')
    const stats = await manager.getConfigStats()
    console.log(`📈 Statistics:`)
    console.log(`   • Total queues: ${stats.totalQueues}`)
    console.log(`   • Active queues: ${stats.activeQueues}`)
    console.log(`   • System configurations: ${stats.totalSystemConfigs}\n`)

    // Validate a configuration
    console.log('9. Configuration validation example...')
    const validationResult = manager.validateConfig({
      name: 'test-validation',
      priority: 50,
      concurrency: 5,
      retryPolicy: { attempts: 3, backoff: 'exponential', delay: 1000, maxDelay: 30000 },
      cleanupPolicy: { removeOnComplete: 100, removeOnFail: 50 },
      alertThresholds: { waitingJobs: 100, processingTime: 30000, errorRate: 0.05 },
      createdBy: 'demo-user'
    })
    
    if (validationResult.isValid) {
      console.log('✅ Configuration validation passed')
    } else {
      console.log('❌ Configuration validation failed:')
      validationResult.errors.forEach(error => {
        console.log(`   • ${error.field}: ${error.message}`)
      })
    }
    console.log()

    // Clean up demo data
    console.log('10. Cleaning up demo data...')
    const demoQueues = ['payment-processing', 'email-notifications', 'data-cleanup', 'report-generation', 'chat-messages', 'custom-webhook-processor']
    
    for (const queueName of demoQueues) {
      await manager.deleteQueueConfig(queueName, 'demo-user')
    }
    console.log('✅ Demo data cleaned up\n')

    console.log('🎉 Queue Configuration System Demo completed successfully!')

  } catch (error) {
    console.error('❌ Demo failed:', error)
  } finally {
    await prisma.$disconnect()
  }
}

// Run the demo
if (require.main === module) {
  demonstrateQueueConfig()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('Demo error:', error)
      process.exit(1)
    })
}

export { demonstrateQueueConfig }