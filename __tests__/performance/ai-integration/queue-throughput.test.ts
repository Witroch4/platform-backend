/**
 * Performance tests for queue throughput and worker performance
 * Tests BullMQ queue processing under load
 */

import { testRedisConfig, isRedisAvailable } from '@/__tests__/setup/test-redis-config';
import { Queue, Worker } from 'bullmq';
import Redis from 'ioredis';

// Mock external services for performance testing
jest.mock('@/lib/ai-integration/services/openai-client');
jest.mock('@/lib/ai-integration/services/chatwit-api-client');
jest.mock('@/lib/ai-integration/services/intent-classifier');

describe('Queue Throughput Performance Tests', () => {
  let redis: Redis;
  let aiMessageQueue: Queue;
  let embeddingQueue: Queue;
  let workers: Worker[] = [];
  let redisAvailable: boolean;

  beforeAll(async () => {
    redisAvailable = await isRedisAvailable();
    
    if (!redisAvailable) {
      console.warn('Redis not available, skipping queue performance tests');
      return;
    }

    redis = new Redis(testRedisConfig);
    
    aiMessageQueue = new Queue('ai:incoming-message', {
      connection: testRedisConfig,
    });

    embeddingQueue = new Queue('ai:embedding-upsert', {
      connection: testRedisConfig,
    });

    // Mock services for fast processing
    const mockIntentClassifier = require('@/lib/ai-integration/services/intent-classifier');
    const mockChatwitClient = require('@/lib/ai-integration/services/chatwit-api-client');
    const mockEmbeddingGenerator = require('@/lib/ai-integration/services/embedding-generator');

    mockIntentClassifier.IntentClassifierService.mockImplementation(() => ({
      classifyIntent: jest.fn().mockResolvedValue({
        intent: 'test_intent',
        score: 0.85,
        candidates: [],
        tokensUsed: 5,
      }),
    }));

    mockChatwitClient.ChatwitApiClient.mockImplementation(() => ({
      postBotMessage: jest.fn().mockResolvedValue({
        success: true,
        messageId: Math.floor(Math.random() * 1000000),
      }),
    }));

    mockEmbeddingGenerator.EmbeddingGeneratorService.mockImplementation(() => ({
      generateEmbedding: jest.fn().mockResolvedValue({
        embedding: Array.from({ length: 1536 }, () => Math.random()),
        tokensUsed: 10,
      }),
    }));
  });

  afterAll(async () => {
    if (!redisAvailable) return;

    // Close all workers
    await Promise.all(workers.map(worker => worker.close()));
    
    if (aiMessageQueue) {
      await aiMessageQueue.close();
    }
    if (embeddingQueue) {
      await embeddingQueue.close();
    }
    if (redis) {
      await redis.disconnect();
    }
  });

  beforeEach(async () => {
    if (!redisAvailable) return;

    // Clean queues between tests
    await aiMessageQueue.obliterate({ force: true });
    await embeddingQueue.obliterate({ force: true });
    
    // Close any existing workers
    await Promise.all(workers.map(worker => worker.close()));
    workers = [];
  });

  describe('AI Message Queue Throughput', () => {
    it('should process 100 jobs within acceptable time', async () => {
      if (!redisAvailable) {
        console.warn('Skipping test - Redis not available');
        return;
      }

      const jobCount = 100;
      const concurrency = 5;

      // Create worker
      const { aiMessageWorker } = require('@/lib/ai-integration/workers/ai-message-worker');
      const worker = new Worker('ai:incoming-message', aiMessageWorker, {
        connection: testRedisConfig,
        concurrency,
      });
      workers.push(worker);

      // Add jobs
      const startTime = Date.now();
      const jobs = [];

      for (let i = 0; i < jobCount; i++) {
        const jobData = {
          accountId: 123,
          conversationId: 456 + (i % 10), // Distribute across conversations
          messageId: `msg-${i}`,
          text: `Performance test message ${i}`,
          channel: 'whatsapp',
          traceId: `trace-${i}`,
          featureFlags: {
            intentsEnabled: true,
            dynamicLlmEnabled: false,
            interactiveMessagesEnabled: false,
            economicModeEnabled: false,
          },
        };

        jobs.push(await aiMessageQueue.add('process-message', jobData));
      }

      const jobsAddedTime = Date.now();
      console.log(`Added ${jobCount} jobs in ${jobsAddedTime - startTime}ms`);

      // Wait for all jobs to complete
      await Promise.all(jobs.map(job => job.waitUntilFinished(aiMessageQueue.events)));

      const endTime = Date.now();
      const totalProcessingTime = endTime - jobsAddedTime;
      const throughput = (jobCount / (totalProcessingTime / 1000)).toFixed(2);

      console.log(`Queue Throughput Performance:`);
      console.log(`Jobs: ${jobCount}`);
      console.log(`Concurrency: ${concurrency}`);
      console.log(`Processing Time: ${totalProcessingTime}ms`);
      console.log(`Throughput: ${throughput} jobs/second`);
      console.log(`Average Job Time: ${(totalProcessingTime / jobCount).toFixed(2)}ms`);

      // Performance assertions
      expect(totalProcessingTime).toBeLessThan(30000); // Under 30 seconds
      expect(parseFloat(throughput)).toBeGreaterThan(3); // At least 3 jobs/second
    });

    it('should handle high concurrency efficiently', async () => {
      if (!redisAvailable) {
        console.warn('Skipping test - Redis not available');
        return;
      }

      const jobCount = 200;
      const highConcurrency = 10;

      // Create worker with high concurrency
      const { aiMessageWorker } = require('@/lib/ai-integration/workers/ai-message-worker');
      const worker = new Worker('ai:incoming-message', aiMessageWorker, {
        connection: testRedisConfig,
        concurrency: highConcurrency,
      });
      workers.push(worker);

      // Add jobs rapidly
      const jobs = [];
      const startTime = Date.now();

      for (let i = 0; i < jobCount; i++) {
        const jobData = {
          accountId: 123,
          conversationId: 456 + (i % 20),
          messageId: `concurrent-${i}`,
          text: `Concurrent test ${i}`,
          channel: 'whatsapp',
          traceId: `trace-concurrent-${i}`,
          featureFlags: {
            intentsEnabled: true,
            dynamicLlmEnabled: false,
            interactiveMessagesEnabled: false,
            economicModeEnabled: false,
          },
        };

        jobs.push(await aiMessageQueue.add('process-message', jobData));
      }

      // Wait for completion
      await Promise.all(jobs.map(job => job.waitUntilFinished(aiMessageQueue.events)));

      const endTime = Date.now();
      const totalTime = endTime - startTime;
      const throughput = (jobCount / (totalTime / 1000)).toFixed(2);

      console.log(`High Concurrency Performance:`);
      console.log(`Jobs: ${jobCount}`);
      console.log(`Concurrency: ${highConcurrency}`);
      console.log(`Total Time: ${totalTime}ms`);
      console.log(`Throughput: ${throughput} jobs/second`);

      // Should be faster with higher concurrency
      expect(parseFloat(throughput)).toBeGreaterThan(5); // At least 5 jobs/second
      expect(totalTime).toBeLessThan(40000); // Under 40 seconds
    });

    it('should maintain performance with mixed job types', async () => {
      if (!redisAvailable) {
        console.warn('Skipping test - Redis not available');
        return;
      }

      const totalJobs = 150;
      const concurrency = 8;

      // Create worker
      const { aiMessageWorker } = require('@/lib/ai-integration/workers/ai-message-worker');
      const worker = new Worker('ai:incoming-message', aiMessageWorker, {
        connection: testRedisConfig,
        concurrency,
      });
      workers.push(worker);

      const jobs = [];
      const startTime = Date.now();

      // Mix of different job types
      for (let i = 0; i < totalJobs; i++) {
        const jobType = i % 3;
        let jobData;

        switch (jobType) {
          case 0: // Intent classification only
            jobData = {
              accountId: 123,
              conversationId: 456 + (i % 15),
              messageId: `intent-${i}`,
              text: `Intent test ${i}`,
              channel: 'whatsapp',
              traceId: `trace-intent-${i}`,
              featureFlags: {
                intentsEnabled: true,
                dynamicLlmEnabled: false,
                interactiveMessagesEnabled: false,
                economicModeEnabled: false,
              },
            };
            break;
          case 1: // Dynamic generation
            jobData = {
              accountId: 123,
              conversationId: 456 + (i % 15),
              messageId: `dynamic-${i}`,
              text: `Dynamic test ${i}`,
              channel: 'whatsapp',
              traceId: `trace-dynamic-${i}`,
              featureFlags: {
                intentsEnabled: false,
                dynamicLlmEnabled: true,
                interactiveMessagesEnabled: true,
                economicModeEnabled: false,
              },
            };
            break;
          case 2: // Economic mode
            jobData = {
              accountId: 123,
              conversationId: 456 + (i % 15),
              messageId: `economic-${i}`,
              text: `Economic test ${i}`,
              channel: 'whatsapp',
              traceId: `trace-economic-${i}`,
              featureFlags: {
                intentsEnabled: true,
                dynamicLlmEnabled: true,
                interactiveMessagesEnabled: false,
                economicModeEnabled: true,
              },
            };
            break;
        }

        jobs.push(await aiMessageQueue.add('process-message', jobData));
      }

      // Wait for completion
      await Promise.all(jobs.map(job => job.waitUntilFinished(aiMessageQueue.events)));

      const endTime = Date.now();
      const totalTime = endTime - startTime;
      const throughput = (totalJobs / (totalTime / 1000)).toFixed(2);

      console.log(`Mixed Job Types Performance:`);
      console.log(`Total Jobs: ${totalJobs}`);
      console.log(`Job Types: Intent (${Math.ceil(totalJobs/3)}), Dynamic (${Math.ceil(totalJobs/3)}), Economic (${Math.floor(totalJobs/3)})`);
      console.log(`Total Time: ${totalTime}ms`);
      console.log(`Throughput: ${throughput} jobs/second`);

      expect(parseFloat(throughput)).toBeGreaterThan(3); // Maintain good throughput
      expect(totalTime).toBeLessThan(50000); // Under 50 seconds
    });
  });

  describe('Embedding Queue Throughput', () => {
    it('should process embedding jobs efficiently', async () => {
      if (!redisAvailable) {
        console.warn('Skipping test - Redis not available');
        return;
      }

      const jobCount = 50; // Fewer jobs as embeddings are more expensive
      const concurrency = 3;

      // Create embedding worker
      const { embeddingUpsertWorker } = require('@/lib/ai-integration/workers/embedding-upsert-worker');
      const worker = new Worker('ai:embedding-upsert', embeddingUpsertWorker, {
        connection: testRedisConfig,
        concurrency,
      });
      workers.push(worker);

      const jobs = [];
      const startTime = Date.now();

      for (let i = 0; i < jobCount; i++) {
        const jobData = {
          intentId: `intent-${i}`,
          text: `Embedding test text ${i} with some additional content to make it realistic`,
          accountId: 123,
          traceId: `trace-embedding-${i}`,
        };

        jobs.push(await embeddingQueue.add('upsert-embedding', jobData));
      }

      // Wait for completion
      await Promise.all(jobs.map(job => job.waitUntilFinished(embeddingQueue.events)));

      const endTime = Date.now();
      const totalTime = endTime - startTime;
      const throughput = (jobCount / (totalTime / 1000)).toFixed(2);

      console.log(`Embedding Queue Performance:`);
      console.log(`Jobs: ${jobCount}`);
      console.log(`Concurrency: ${concurrency}`);
      console.log(`Total Time: ${totalTime}ms`);
      console.log(`Throughput: ${throughput} embeddings/second`);

      expect(parseFloat(throughput)).toBeGreaterThan(1); // At least 1 embedding/second
      expect(totalTime).toBeLessThan(60000); // Under 60 seconds
    });

    it('should handle batch embedding jobs efficiently', async () => {
      if (!redisAvailable) {
        console.warn('Skipping test - Redis not available');
        return;
      }

      const batchCount = 10;
      const itemsPerBatch = 5;
      const concurrency = 2;

      // Mock batch embedding service
      const mockEmbeddingGenerator = require('@/lib/ai-integration/services/embedding-generator');
      mockEmbeddingGenerator.EmbeddingGeneratorService.mockImplementation(() => ({
        generateBatchEmbeddings: jest.fn().mockResolvedValue({
          embeddings: Array.from({ length: itemsPerBatch }, () => 
            Array.from({ length: 1536 }, () => Math.random())
          ),
          tokensUsed: itemsPerBatch * 10,
        }),
      }));

      // Create worker
      const { embeddingUpsertWorker } = require('@/lib/ai-integration/workers/embedding-upsert-worker');
      const worker = new Worker('ai:embedding-upsert', embeddingUpsertWorker, {
        connection: testRedisConfig,
        concurrency,
      });
      workers.push(worker);

      const jobs = [];
      const startTime = Date.now();

      for (let i = 0; i < batchCount; i++) {
        const batchData = {
          batch: Array.from({ length: itemsPerBatch }, (_, j) => ({
            intentId: `batch-${i}-intent-${j}`,
            text: `Batch ${i} item ${j} text content`,
            accountId: 123,
          })),
          traceId: `trace-batch-${i}`,
        };

        jobs.push(await embeddingQueue.add('batch-upsert-embeddings', batchData));
      }

      // Wait for completion
      await Promise.all(jobs.map(job => job.waitUntilFinished(embeddingQueue.events)));

      const endTime = Date.now();
      const totalTime = endTime - startTime;
      const totalItems = batchCount * itemsPerBatch;
      const throughput = (totalItems / (totalTime / 1000)).toFixed(2);

      console.log(`Batch Embedding Performance:`);
      console.log(`Batches: ${batchCount}`);
      console.log(`Items per Batch: ${itemsPerBatch}`);
      console.log(`Total Items: ${totalItems}`);
      console.log(`Total Time: ${totalTime}ms`);
      console.log(`Throughput: ${throughput} items/second`);

      // Batch processing should be more efficient
      expect(parseFloat(throughput)).toBeGreaterThan(2); // At least 2 items/second
      expect(totalTime).toBeLessThan(30000); // Under 30 seconds
    });
  });

  describe('Queue Management Performance', () => {
    it('should handle queue operations efficiently under load', async () => {
      if (!redisAvailable) {
        console.warn('Skipping test - Redis not available');
        return;
      }

      const operationCount = 100;
      const startTime = Date.now();

      // Test various queue operations
      const operations = [];

      // Add jobs
      for (let i = 0; i < operationCount; i++) {
        operations.push(
          aiMessageQueue.add('test-job', {
            id: i,
            data: `Test data ${i}`,
          })
        );
      }

      await Promise.all(operations);
      const addTime = Date.now();

      // Get queue stats
      const statsOperations = [];
      for (let i = 0; i < 20; i++) {
        statsOperations.push(aiMessageQueue.getJobCounts());
        statsOperations.push(aiMessageQueue.getWaiting());
        statsOperations.push(aiMessageQueue.getActive());
      }

      await Promise.all(statsOperations);
      const statsTime = Date.now();

      // Clean operations
      await aiMessageQueue.clean(0, 1000, 'waiting');
      const cleanTime = Date.now();

      console.log(`Queue Operations Performance:`);
      console.log(`Add ${operationCount} jobs: ${addTime - startTime}ms`);
      console.log(`Stats operations: ${statsTime - addTime}ms`);
      console.log(`Clean operation: ${cleanTime - statsTime}ms`);
      console.log(`Total time: ${cleanTime - startTime}ms`);

      // Performance assertions
      expect(addTime - startTime).toBeLessThan(5000); // Add jobs under 5s
      expect(statsTime - addTime).toBeLessThan(2000); // Stats under 2s
      expect(cleanTime - statsTime).toBeLessThan(1000); // Clean under 1s
    });

    it('should maintain performance with large queue backlogs', async () => {
      if (!redisAvailable) {
        console.warn('Skipping test - Redis not available');
        return;
      }

      const backlogSize = 500;
      const processingBatch = 50;

      // Create large backlog
      const backlogJobs = [];
      for (let i = 0; i < backlogSize; i++) {
        backlogJobs.push(
          aiMessageQueue.add('backlog-job', {
            id: i,
            data: `Backlog data ${i}`,
          })
        );
      }

      await Promise.all(backlogJobs);
      console.log(`Created backlog of ${backlogSize} jobs`);

      // Start worker to process some jobs
      const { aiMessageWorker } = require('@/lib/ai-integration/workers/ai-message-worker');
      const worker = new Worker('ai:incoming-message', aiMessageWorker, {
        connection: testRedisConfig,
        concurrency: 5,
      });
      workers.push(worker);

      // Add new jobs while backlog exists
      const newJobs = [];
      const startTime = Date.now();

      for (let i = 0; i < processingBatch; i++) {
        newJobs.push(
          aiMessageQueue.add('new-job', {
            accountId: 123,
            conversationId: 456 + i,
            messageId: `new-${i}`,
            text: `New job ${i}`,
            channel: 'whatsapp',
            traceId: `trace-new-${i}`,
            featureFlags: {
              intentsEnabled: true,
              dynamicLlmEnabled: false,
              interactiveMessagesEnabled: false,
              economicModeEnabled: false,
            },
          })
        );
      }

      // Wait for new jobs to complete (they should be processed despite backlog)
      await Promise.all(newJobs.map(job => job.waitUntilFinished(aiMessageQueue.events)));

      const endTime = Date.now();
      const processingTime = endTime - startTime;

      console.log(`Backlog Performance:`);
      console.log(`Backlog Size: ${backlogSize} jobs`);
      console.log(`New Jobs: ${processingBatch}`);
      console.log(`Processing Time: ${processingTime}ms`);

      // Should still process new jobs efficiently despite backlog
      expect(processingTime).toBeLessThan(30000); // Under 30 seconds

      // Clean up backlog
      await aiMessageQueue.clean(0, 1000, 'waiting');
    });
  });

  describe('Resource Usage Under Load', () => {
    it('should maintain stable Redis connection pool', async () => {
      if (!redisAvailable) {
        console.warn('Skipping test - Redis not available');
        return;
      }

      const connectionTests = 100;
      const operations = [];

      // Test Redis connection stability under load
      for (let i = 0; i < connectionTests; i++) {
        operations.push(
          redis.ping(),
          redis.set(`test-key-${i}`, `test-value-${i}`),
          redis.get(`test-key-${i}`),
          redis.del(`test-key-${i}`)
        );
      }

      const startTime = Date.now();
      const results = await Promise.all(operations);
      const endTime = Date.now();

      const successfulOps = results.filter(r => r !== null).length;
      const totalOps = operations.length;

      console.log(`Redis Connection Performance:`);
      console.log(`Total Operations: ${totalOps}`);
      console.log(`Successful Operations: ${successfulOps}`);
      console.log(`Success Rate: ${(successfulOps / totalOps * 100).toFixed(2)}%`);
      console.log(`Total Time: ${endTime - startTime}ms`);
      console.log(`Ops/Second: ${(totalOps / ((endTime - startTime) / 1000)).toFixed(2)}`);

      expect(successfulOps / totalOps).toBeGreaterThan(0.95); // 95% success rate
      expect(endTime - startTime).toBeLessThan(5000); // Under 5 seconds
    });
  });
});