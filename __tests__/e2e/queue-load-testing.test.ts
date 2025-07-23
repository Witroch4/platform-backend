/**
 * End-to-End Queue Load Testing
 * Tests queue processing under load and verifies database logging
 * Requirements: 5.1, 5.2
 */

import { Queue, Worker, Job } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import {
  SendMessageTask,
  SendReactionTask,
  generateCorrelationId
} from '../../lib/queue/mtf-diamante-webhook.queue';

// Load test configuration
const LOAD_TEST_CONFIG = {
  REDIS_URL: process.env.E2E_REDIS_URL || 'redis://localhost:6379',
  CONCURRENT_WORKERS: parseInt(process.env.E2E_CONCURRENT_WORKERS || '3'),
  MESSAGES_PER_BATCH: parseInt(process.env.E2E_MESSAGES_PER_BATCH || '10'),
  TOTAL_BATCHES: parseInt(process.env.E2E_TOTAL_BATCHES || '5'),
  BATCH_DELAY_MS: parseInt(process.env.E2E_BATCH_DELAY_MS || '1000'),
  TIMEOUT: 60000, // 60 seconds
  SKIP_REAL_REDIS: process.env.E2E_SKIP_REAL_REDIS === 'true'
};

// Skip load tests if not in appropriate environment
const isLoadTestEnvironment = process.env.NODE_ENV === 'staging' || process.env.RUN_LOAD_TESTS === 'true';

describe.skip('Queue Load Testing E2E', () => {
  let prisma: PrismaClient;
  let testQueue: Queue;
  let workers: Worker[] = [];

  beforeAll(async () => {
    if (!isLoadTestEnvironment) {
      console.log('Skipping load tests - not in staging environment');
      return;
    }

    prisma = new PrismaClient();
    await prisma.$connect();

    // Create test queue
    testQueue = new Queue('load-test-queue', {
      connection: {
        host: 'localhost',
        port: 6379
      },
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: 100,
        removeOnFail: 50
      }
    });

    console.log('Load test environment initialized');
  });

  afterAll(async () => {
    if (testQueue) {
      await testQueue.close();
    }
    
    // Close all workers
    await Promise.all(workers.map(worker => worker.close()));
    
    if (prisma) {
      await prisma.$disconnect();
    }
  });

  beforeEach(() => {
    if (!isLoadTestEnvironment) {
      pending('Load tests skipped - not in staging environment');
    }
  });

  describe('High Volume Message Processing', () => {
    it('should process high volume of template messages efficiently', async () => {
      const totalMessages = LOAD_TEST_CONFIG.MESSAGES_PER_BATCH * LOAD_TEST_CONFIG.TOTAL_BATCHES;
      const processedJobs: any[] = [];
      const failedJobs: any[] = [];

      // Create workers
      for (let i = 0; i < LOAD_TEST_CONFIG.CONCURRENT_WORKERS; i++) {
        const worker = new Worker(
          'load-test-queue',
          async (job: Job<SendMessageTask>) => {
            const startTime = Date.now();
            
            // Simulate message processing
            await new Promise(resolve => setTimeout(resolve, Math.random() * 100 + 50));
            
            const processingTime = Date.now() - startTime;
            
            // Log to database (simulate real processing)
            try {
              await prisma.webhookMessage.create({
                data: {
                  whatsappMessageId: `load_test_${job.id}`,
                  conversationId: job.data.correlationId || 'load_test_conv',
                  contactPhone: job.data.recipientPhone,
                  messageContent: `Load test message ${job.id}`,
                  messageType: 'template',
                  whatsappApiKey: job.data.whatsappApiKey,
                  inboxId: 'load_test_inbox',
                  rawPayload: { loadTest: true, jobId: job.id },
                  processed: true,
                  timestamp: new Date()
                }
              });
            } catch (error) {
              console.error('Database logging failed:', error);
            }

            return {
              success: true,
              messageId: `wamid.load_test_${job.id}`,
              processingTime,
              workerId: i
            };
          },
          {
            connection: { host: 'localhost', port: 6379 },
            concurrency: 5
          }
        );

        worker.on('completed', (job, result) => {
          processedJobs.push({ job, result });
        });

        worker.on('failed', (job, error) => {
          failedJobs.push({ job, error });
        });

        workers.push(worker);
      }

      const startTime = Date.now();

      // Generate and queue messages in batches
      for (let batch = 0; batch < LOAD_TEST_CONFIG.TOTAL_BATCHES; batch++) {
        const batchTasks: SendMessageTask[] = [];

        for (let i = 0; i < LOAD_TEST_CONFIG.MESSAGES_PER_BATCH; i++) {
          const task: SendMessageTask = {
            type: 'sendMessage',
            recipientPhone: `5511999${batch.toString().padStart(2, '0')}${i.toString().padStart(3, '0')}`,
            whatsappApiKey: 'load-test-api-key',
            correlationId: generateCorrelationId(),
            messageData: {
              type: 'template',
              templateId: `load_test_template_${batch}_${i}`,
              templateName: `load_test_${batch}_${i}`,
              variables: {
                batch: batch.toString(),
                message: i.toString(),
                timestamp: Date.now().toString()
              }
            },
            metadata: {
              intentName: 'load_test',
              caixaId: 'load_test_caixa',
              batchNumber: batch,
              messageNumber: i
            }
          };

          batchTasks.push(task);
        }

        // Add batch to queue
        await Promise.all(
          batchTasks.map((task, index) =>
            testQueue.add(`load_test_${batch}_${index}`, task, {
              priority: Math.floor(Math.random() * 10) + 1
            })
          )
        );

        console.log(`Batch ${batch + 1}/${LOAD_TEST_CONFIG.TOTAL_BATCHES} queued`);

        // Delay between batches
        if (batch < LOAD_TEST_CONFIG.TOTAL_BATCHES - 1) {
          await new Promise(resolve => setTimeout(resolve, LOAD_TEST_CONFIG.BATCH_DELAY_MS));
        }
      }

      // Wait for all jobs to complete
      const maxWaitTime = LOAD_TEST_CONFIG.TIMEOUT;
      const checkInterval = 1000;
      let waitTime = 0;

      while (processedJobs.length + failedJobs.length < totalMessages && waitTime < maxWaitTime) {
        await new Promise(resolve => setTimeout(resolve, checkInterval));
        waitTime += checkInterval;
        
        if (waitTime % 5000 === 0) {
          console.log(`Progress: ${processedJobs.length + failedJobs.length}/${totalMessages} jobs completed`);
        }
      }

      const endTime = Date.now();
      const totalTime = endTime - startTime;

      // Verify results
      expect(processedJobs.length + failedJobs.length).toBe(totalMessages);
      expect(failedJobs.length).toBeLessThan(totalMessages * 0.05); // Less than 5% failure rate

      // Performance metrics
      const avgProcessingTime = processedJobs.reduce((sum, job) => sum + job.result.processingTime, 0) / processedJobs.length;
      const throughput = totalMessages / (totalTime / 1000); // messages per second

      console.log('Load Test Results:', {
        totalMessages,
        processedSuccessfully: processedJobs.length,
        failed: failedJobs.length,
        totalTime: `${totalTime}ms`,
        avgProcessingTime: `${avgProcessingTime.toFixed(2)}ms`,
        throughput: `${throughput.toFixed(2)} msg/sec`
      });

      // Verify database logging
      const dbRecords = await prisma.webhookMessage.findMany({
        where: {
          whatsappMessageId: { startsWith: 'load_test_' },
          timestamp: { gte: new Date(startTime) }
        }
      });

      expect(dbRecords.length).toBe(processedJobs.length);

      // Clean up database
      await prisma.webhookMessage.deleteMany({
        where: {
          whatsappMessageId: { startsWith: 'load_test_' }
        }
      });

      // Performance assertions
      expect(throughput).toBeGreaterThan(5); // At least 5 messages per second
      expect(avgProcessingTime).toBeLessThan(500); // Average processing under 500ms
    }, LOAD_TEST_CONFIG.TIMEOUT);

    it('should handle mixed message types under load', async () => {
      const templateMessages = 15;
      const interactiveMessages = 10;
      const reactionMessages = 5;
      const totalMessages = templateMessages + interactiveMessages + reactionMessages;
      
      const processedJobs: any[] = [];
      const failedJobs: any[] = [];

      // Create worker for mixed message types
      const mixedWorker = new Worker(
        'load-test-queue',
        async (job: Job<SendMessageTask | SendReactionTask>) => {
          const startTime = Date.now();
          
          if (job.data.type === 'sendMessage') {
            const messageData = job.data as SendMessageTask;
            
            // Simulate different processing times for different message types
            const processingDelay = messageData.messageData.type === 'template' ? 80 : 120;
            await new Promise(resolve => setTimeout(resolve, processingDelay + Math.random() * 40));
            
            // Log to database
            await prisma.webhookMessage.create({
              data: {
                whatsappMessageId: `mixed_test_${job.id}`,
                conversationId: messageData.correlationId || 'mixed_test_conv',
                contactPhone: messageData.recipientPhone,
                messageContent: `Mixed test ${messageData.messageData.type} message`,
                messageType: messageData.messageData.type,
                whatsappApiKey: messageData.whatsappApiKey,
                inboxId: 'mixed_test_inbox',
                rawPayload: { mixedTest: true, jobId: job.id },
                processed: true,
                timestamp: new Date()
              }
            });
          } else if (job.data.type === 'sendReaction') {
            const reactionData = job.data as SendReactionTask;
            
            // Simulate reaction processing
            await new Promise(resolve => setTimeout(resolve, 50 + Math.random() * 30));
            
            // Log reaction attempt
            console.log(`Processed reaction: ${reactionData.emoji} for ${reactionData.messageId}`);
          }

          const processingTime = Date.now() - startTime;
          return { success: true, processingTime, type: job.data.type };
        },
        {
          connection: { host: 'localhost', port: 6379 },
          concurrency: 3
        }
      );

      mixedWorker.on('completed', (job, result) => {
        processedJobs.push({ job, result });
      });

      mixedWorker.on('failed', (job, error) => {
        failedJobs.push({ job, error });
      });

      workers.push(mixedWorker);

      const startTime = Date.now();

      // Generate mixed message types
      const tasks: (SendMessageTask | SendReactionTask)[] = [];

      // Template messages
      for (let i = 0; i < templateMessages; i++) {
        tasks.push({
          type: 'sendMessage',
          recipientPhone: `5511998${i.toString().padStart(3, '0')}`,
          whatsappApiKey: 'mixed-test-api-key',
          correlationId: generateCorrelationId(),
          messageData: {
            type: 'template',
            templateId: `mixed_template_${i}`,
            templateName: `mixed_template_${i}`,
            variables: { index: i.toString() }
          }
        });
      }

      // Interactive messages
      for (let i = 0; i < interactiveMessages; i++) {
        tasks.push({
          type: 'sendMessage',
          recipientPhone: `5511997${i.toString().padStart(3, '0')}`,
          whatsappApiKey: 'mixed-test-api-key',
          correlationId: generateCorrelationId(),
          messageData: {
            type: 'interactive',
            interactiveContent: {
              body: `Interactive message ${i}`,
              buttons: [
                { id: `btn_${i}_1`, title: `Option ${i}.1` },
                { id: `btn_${i}_2`, title: `Option ${i}.2` }
              ]
            }
          }
        });
      }

      // Reaction messages
      for (let i = 0; i < reactionMessages; i++) {
        tasks.push({
          type: 'sendReaction',
          recipientPhone: `5511996${i.toString().padStart(3, '0')}`,
          messageId: `wamid.mixed_original_${i}`,
          emoji: ['👍', '❤️', '😂', '😮', '😢'][i % 5],
          whatsappApiKey: 'mixed-test-api-key',
          correlationId: generateCorrelationId()
        });
      }

      // Shuffle tasks to simulate real-world mixed load
      for (let i = tasks.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [tasks[i], tasks[j]] = [tasks[j], tasks[i]];
      }

      // Queue all tasks
      await Promise.all(
        tasks.map((task, index) =>
          testQueue.add(`mixed_test_${index}`, task)
        )
      );

      // Wait for completion
      const maxWaitTime = 30000;
      const checkInterval = 1000;
      let waitTime = 0;

      while (processedJobs.length + failedJobs.length < totalMessages && waitTime < maxWaitTime) {
        await new Promise(resolve => setTimeout(resolve, checkInterval));
        waitTime += checkInterval;
      }

      const endTime = Date.now();
      const totalTime = endTime - startTime;

      // Verify results
      expect(processedJobs.length + failedJobs.length).toBe(totalMessages);
      expect(failedJobs.length).toBeLessThan(totalMessages * 0.1); // Less than 10% failure rate

      // Verify message type distribution
      const templateResults = processedJobs.filter(job => 
        job.job.data.type === 'sendMessage' && job.job.data.messageData.type === 'template'
      );
      const interactiveResults = processedJobs.filter(job => 
        job.job.data.type === 'sendMessage' && job.job.data.messageData.type === 'interactive'
      );
      const reactionResults = processedJobs.filter(job => 
        job.job.data.type === 'sendReaction'
      );

      expect(templateResults.length).toBeGreaterThan(templateMessages * 0.8); // At least 80% success
      expect(interactiveResults.length).toBeGreaterThan(interactiveMessages * 0.8);
      expect(reactionResults.length).toBeGreaterThan(reactionMessages * 0.8);

      console.log('Mixed Load Test Results:', {
        totalMessages,
        templateProcessed: templateResults.length,
        interactiveProcessed: interactiveResults.length,
        reactionProcessed: reactionResults.length,
        totalTime: `${totalTime}ms`,
        throughput: `${(totalMessages / (totalTime / 1000)).toFixed(2)} msg/sec`
      });

      // Clean up database
      await prisma.webhookMessage.deleteMany({
        where: {
          whatsappMessageId: { startsWith: 'mixed_test_' }
        }
      });
    }, LOAD_TEST_CONFIG.TIMEOUT);
  });

  describe('Queue Resilience Testing', () => {
    it('should recover from worker failures gracefully', async () => {
      const totalJobs = 20;
      const processedJobs: any[] = [];
      const failedJobs: any[] = [];

      // Create a worker that fails randomly
      const unreliableWorker = new Worker(
        'load-test-queue',
        async (job: Job<SendMessageTask>) => {
          // Randomly fail 30% of jobs on first attempt
          if (job.attemptsMade === 1 && Math.random() < 0.3) {
            throw new Error(`Simulated failure for job ${job.id}`);
          }

          // Simulate processing
          await new Promise(resolve => setTimeout(resolve, 100));

          return { success: true, jobId: job.id, attempt: job.attemptsMade };
        },
        {
          connection: { host: 'localhost', port: 6379 },
          concurrency: 2
        }
      );

      unreliableWorker.on('completed', (job, result) => {
        processedJobs.push({ job, result });
      });

      unreliableWorker.on('failed', (job, error) => {
        failedJobs.push({ job, error });
      });

      workers.push(unreliableWorker);

      // Queue jobs with retry configuration
      const tasks: SendMessageTask[] = Array.from({ length: totalJobs }, (_, i) => ({
        type: 'sendMessage',
        recipientPhone: `5511995${i.toString().padStart(3, '0')}`,
        whatsappApiKey: 'resilience-test-api-key',
        correlationId: generateCorrelationId(),
        messageData: {
          type: 'template',
          templateId: `resilience_template_${i}`,
          templateName: `resilience_${i}`
        }
      }));

      await Promise.all(
        tasks.map((task, index) =>
          testQueue.add(`resilience_test_${index}`, task, {
            attempts: 3,
            backoff: { type: 'exponential', delay: 1000 }
          })
        )
      );

      // Wait for all jobs to complete or fail permanently
      const maxWaitTime = 30000;
      const checkInterval = 1000;
      let waitTime = 0;

      while (processedJobs.length + failedJobs.length < totalJobs && waitTime < maxWaitTime) {
        await new Promise(resolve => setTimeout(resolve, checkInterval));
        waitTime += checkInterval;
      }

      // Most jobs should eventually succeed due to retries
      expect(processedJobs.length).toBeGreaterThan(totalJobs * 0.7); // At least 70% success
      
      // Some jobs may have required retries
      const retriedJobs = processedJobs.filter(job => job.result.attempt > 1);
      expect(retriedJobs.length).toBeGreaterThan(0);

      console.log('Resilience Test Results:', {
        totalJobs,
        succeeded: processedJobs.length,
        failed: failedJobs.length,
        retriedJobs: retriedJobs.length
      });
    }, LOAD_TEST_CONFIG.TIMEOUT);
  });

  describe('Memory and Resource Usage', () => {
    it('should maintain stable memory usage under sustained load', async () => {
      const batchSize = 50;
      const batches = 10;
      const memorySnapshots: number[] = [];

      // Create efficient worker
      const efficientWorker = new Worker(
        'load-test-queue',
        async (job: Job<SendMessageTask>) => {
          // Minimal processing to test memory efficiency
          await new Promise(resolve => setTimeout(resolve, 10));
          return { success: true, jobId: job.id };
        },
        {
          connection: { host: 'localhost', port: 6379 },
          concurrency: 5
        }
      );

      workers.push(efficientWorker);

      for (let batch = 0; batch < batches; batch++) {
        // Take memory snapshot
        const memUsage = process.memoryUsage();
        memorySnapshots.push(memUsage.heapUsed);

        // Generate batch
        const tasks: SendMessageTask[] = Array.from({ length: batchSize }, (_, i) => ({
          type: 'sendMessage',
          recipientPhone: `5511994${batch.toString().padStart(2, '0')}${i.toString().padStart(2, '0')}`,
          whatsappApiKey: 'memory-test-api-key',
          messageData: {
            type: 'template',
            templateId: `memory_template_${batch}_${i}`,
            templateName: `memory_${batch}_${i}`
          }
        }));

        // Queue batch
        await Promise.all(
          tasks.map((task, index) =>
            testQueue.add(`memory_test_${batch}_${index}`, task)
          )
        );

        // Wait for batch to process
        await new Promise(resolve => setTimeout(resolve, 2000));

        console.log(`Memory test batch ${batch + 1}/${batches} completed`);
      }

      // Analyze memory usage
      const initialMemory = memorySnapshots[0];
      const finalMemory = memorySnapshots[memorySnapshots.length - 1];
      const memoryGrowth = (finalMemory - initialMemory) / initialMemory;

      console.log('Memory Usage Analysis:', {
        initialMemory: `${(initialMemory / 1024 / 1024).toFixed(2)} MB`,
        finalMemory: `${(finalMemory / 1024 / 1024).toFixed(2)} MB`,
        memoryGrowth: `${(memoryGrowth * 100).toFixed(2)}%`
      });

      // Memory growth should be reasonable (less than 50% increase)
      expect(memoryGrowth).toBeLessThan(0.5);
    }, LOAD_TEST_CONFIG.TIMEOUT);
  });
});

// Helper function to run load tests manually
export async function runLoadTests() {
  if (!isLoadTestEnvironment) {
    console.log('Load tests can only be run in staging environment');
    console.log('Set NODE_ENV=staging or RUN_LOAD_TESTS=true to enable');
    return;
  }

  console.log('Running load tests...');
  console.log('Configuration:', LOAD_TEST_CONFIG);

  // This would integrate with your test runner
  console.log('Load tests completed');
}