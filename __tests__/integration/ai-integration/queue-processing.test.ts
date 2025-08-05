/**
 * Integration tests for queue processing
 * Tests BullMQ queue operations and worker processing
 */

import { testRedisConfig, isRedisAvailable } from '@/__tests__/setup/test-redis-config';
import { Queue, Worker, Job } from 'bullmq';
import Redis from 'ioredis';

// Mock external services
jest.mock('@/lib/ai-integration/services/openai-client');
jest.mock('@/lib/ai-integration/services/chatwit-api-client');
jest.mock('@/lib/ai-integration/services/intent-classifier');

describe('Queue Processing Integration', () => {
  let redis: Redis;
  let aiMessageQueue: Queue;
  let embeddingQueue: Queue;
  let worker: Worker;
  let redisAvailable: boolean;

  beforeAll(async () => {
    redisAvailable = await isRedisAvailable();
    
    if (!redisAvailable) {
      console.warn('Redis not available, skipping queue integration tests');
      return;
    }

    redis = new Redis(testRedisConfig);
    
    aiMessageQueue = new Queue('ai:incoming-message', {
      connection: testRedisConfig,
    });

    embeddingQueue = new Queue('ai:embedding-upsert', {
      connection: testRedisConfig,
    });
  });

  afterAll(async () => {
    if (!redisAvailable) return;

    if (worker) {
      await worker.close();
    }
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
  });

  describe('AI Message Queue Processing', () => {
    it('should process AI message job successfully', async () => {
      if (!redisAvailable) {
        console.warn('Skipping test - Redis not available');
        return;
      }

      // Mock services
      const mockIntentClassifier = require('@/lib/ai-integration/services/intent-classifier');
      const mockChatwitClient = require('@/lib/ai-integration/services/chatwit-api-client');

      mockIntentClassifier.IntentClassifierService.mockImplementation(() => ({
        classifyIntent: jest.fn().mockResolvedValue({
          intent: 'track_order',
          score: 0.85,
          candidates: [{ name: 'track_order', similarity: 0.85 }],
          tokensUsed: 10,
        }),
      }));

      mockChatwitClient.ChatwitApiClient.mockImplementation(() => ({
        postBotMessage: jest.fn().mockResolvedValue({
          success: true,
          messageId: 999,
        }),
      }));

      // Create worker
      const { aiMessageWorker } = require('@/lib/ai-integration/workers/ai-message-worker');
      worker = new Worker('ai:incoming-message', aiMessageWorker, {
        connection: testRedisConfig,
      });

      // Add job to queue
      const jobData = {
        accountId: 123,
        conversationId: 456,
        messageId: '789',
        text: 'Quero rastrear meu pedido',
        channel: 'whatsapp',
        traceId: 'trace-123',
        featureFlags: {
          intentsEnabled: true,
          dynamicLlmEnabled: true,
          interactiveMessagesEnabled: true,
          economicModeEnabled: false,
        },
      };

      const job = await aiMessageQueue.add('process-message', jobData);

      // Wait for job completion
      await job.waitUntilFinished(aiMessageQueue.events);

      // Verify job completed successfully
      const completedJobs = await aiMessageQueue.getCompleted();
      expect(completedJobs).toHaveLength(1);
      expect(completedJobs[0].returnvalue).toBeDefined();

      // Verify services were called
      const classifierInstance = mockIntentClassifier.IntentClassifierService.mock.instances[0];
      expect(classifierInstance.classifyIntent).toHaveBeenCalledWith(
        'Quero rastrear meu pedido',
        123
      );

      const chatwitInstance = mockChatwitClient.ChatwitApiClient.mock.instances[0];
      expect(chatwitInstance.postBotMessage).toHaveBeenCalled();
    });

    it('should handle job failures and retry', async () => {
      if (!redisAvailable) {
        console.warn('Skipping test - Redis not available');
        return;
      }

      // Mock service to fail initially then succeed
      const mockChatwitClient = require('@/lib/ai-integration/services/chatwit-api-client');
      let callCount = 0;
      
      mockChatwitClient.ChatwitApiClient.mockImplementation(() => ({
        postBotMessage: jest.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) {
            throw new Error('Temporary failure');
          }
          return Promise.resolve({
            success: true,
            messageId: 999,
          });
        }),
      }));

      // Create worker with retry configuration
      const { aiMessageWorker } = require('@/lib/ai-integration/workers/ai-message-worker');
      worker = new Worker('ai:incoming-message', aiMessageWorker, {
        connection: testRedisConfig,
        settings: {
          retryProcessDelay: 100, // Fast retry for testing
        },
      });

      const jobData = {
        accountId: 123,
        conversationId: 456,
        messageId: '789',
        text: 'Test message',
        channel: 'whatsapp',
        traceId: 'trace-123',
        featureFlags: {
          intentsEnabled: false,
          dynamicLlmEnabled: false,
          interactiveMessagesEnabled: false,
          economicModeEnabled: false,
        },
      };

      const job = await aiMessageQueue.add('process-message', jobData, {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 100,
        },
      });

      // Wait for job completion (should succeed on retry)
      await job.waitUntilFinished(aiMessageQueue.events);

      // Verify job eventually completed
      const completedJobs = await aiMessageQueue.getCompleted();
      expect(completedJobs).toHaveLength(1);

      // Verify service was called multiple times (initial + retry)
      const chatwitInstance = mockChatwitClient.ChatwitApiClient.mock.instances[0];
      expect(chatwitInstance.postBotMessage).toHaveBeenCalledTimes(2);
    });

    it('should send job to DLQ after max retries', async () => {
      if (!redisAvailable) {
        console.warn('Skipping test - Redis not available');
        return;
      }

      // Mock service to always fail
      const mockChatwitClient = require('@/lib/ai-integration/services/chatwit-api-client');
      mockChatwitClient.ChatwitApiClient.mockImplementation(() => ({
        postBotMessage: jest.fn().mockRejectedValue(new Error('Persistent failure')),
      }));

      // Create worker
      const { aiMessageWorker } = require('@/lib/ai-integration/workers/ai-message-worker');
      worker = new Worker('ai:incoming-message', aiMessageWorker, {
        connection: testRedisConfig,
        settings: {
          retryProcessDelay: 50,
        },
      });

      const jobData = {
        accountId: 123,
        conversationId: 456,
        messageId: '789',
        text: 'Test message',
        channel: 'whatsapp',
        traceId: 'trace-123',
        featureFlags: {
          intentsEnabled: false,
          dynamicLlmEnabled: false,
          interactiveMessagesEnabled: false,
          economicModeEnabled: false,
        },
      };

      const job = await aiMessageQueue.add('process-message', jobData, {
        attempts: 2, // Low attempts for faster test
        backoff: {
          type: 'exponential',
          delay: 50,
        },
      });

      // Wait for job to fail completely
      try {
        await job.waitUntilFinished(aiMessageQueue.events);
      } catch (error) {
        // Expected to fail
      }

      // Verify job is in failed state
      const failedJobs = await aiMessageQueue.getFailed();
      expect(failedJobs).toHaveLength(1);
      expect(failedJobs[0].attemptsMade).toBe(2);
    });

    it('should handle high concurrency', async () => {
      if (!redisAvailable) {
        console.warn('Skipping test - Redis not available');
        return;
      }

      // Mock services for fast processing
      const mockIntentClassifier = require('@/lib/ai-integration/services/intent-classifier');
      const mockChatwitClient = require('@/lib/ai-integration/services/chatwit-api-client');

      mockIntentClassifier.IntentClassifierService.mockImplementation(() => ({
        classifyIntent: jest.fn().mockResolvedValue({
          intent: null,
          score: 0.5,
          candidates: [],
          tokensUsed: 5,
        }),
      }));

      mockChatwitClient.ChatwitApiClient.mockImplementation(() => ({
        postBotMessage: jest.fn().mockResolvedValue({
          success: true,
          messageId: Math.floor(Math.random() * 1000),
        }),
      }));

      // Create worker with higher concurrency
      const { aiMessageWorker } = require('@/lib/ai-integration/workers/ai-message-worker');
      worker = new Worker('ai:incoming-message', aiMessageWorker, {
        connection: testRedisConfig,
        concurrency: 5,
      });

      // Add multiple jobs
      const jobs = [];
      for (let i = 0; i < 20; i++) {
        const jobData = {
          accountId: 123,
          conversationId: 456 + i,
          messageId: `msg-${i}`,
          text: `Test message ${i}`,
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

      // Wait for all jobs to complete
      await Promise.all(jobs.map(job => job.waitUntilFinished(aiMessageQueue.events)));

      // Verify all jobs completed
      const completedJobs = await aiMessageQueue.getCompleted();
      expect(completedJobs).toHaveLength(20);
    });
  });

  describe('Embedding Upsert Queue Processing', () => {
    it('should process embedding upsert job successfully', async () => {
      if (!redisAvailable) {
        console.warn('Skipping test - Redis not available');
        return;
      }

      // Mock services
      const mockEmbeddingGenerator = require('@/lib/ai-integration/services/embedding-generator');
      mockEmbeddingGenerator.EmbeddingGeneratorService.mockImplementation(() => ({
        generateEmbedding: jest.fn().mockResolvedValue({
          embedding: [0.1, 0.2, 0.3],
          tokensUsed: 10,
        }),
      }));

      // Create worker
      const { embeddingUpsertWorker } = require('@/lib/ai-integration/workers/embedding-upsert-worker');
      worker = new Worker('ai:embedding-upsert', embeddingUpsertWorker, {
        connection: testRedisConfig,
      });

      // Add job to queue
      const jobData = {
        intentId: 'intent-123',
        text: 'Rastrear pedido',
        accountId: 123,
        traceId: 'trace-123',
      };

      const job = await embeddingQueue.add('upsert-embedding', jobData);

      // Wait for job completion
      await job.waitUntilFinished(embeddingQueue.events);

      // Verify job completed successfully
      const completedJobs = await embeddingQueue.getCompleted();
      expect(completedJobs).toHaveLength(1);

      // Verify embedding service was called
      const embeddingInstance = mockEmbeddingGenerator.EmbeddingGeneratorService.mock.instances[0];
      expect(embeddingInstance.generateEmbedding).toHaveBeenCalledWith('Rastrear pedido');
    });

    it('should handle batch embedding updates', async () => {
      if (!redisAvailable) {
        console.warn('Skipping test - Redis not available');
        return;
      }

      // Mock batch embedding service
      const mockEmbeddingGenerator = require('@/lib/ai-integration/services/embedding-generator');
      mockEmbeddingGenerator.EmbeddingGeneratorService.mockImplementation(() => ({
        generateBatchEmbeddings: jest.fn().mockResolvedValue({
          embeddings: [
            [0.1, 0.2, 0.3],
            [0.4, 0.5, 0.6],
            [0.7, 0.8, 0.9],
          ],
          tokensUsed: 30,
        }),
      }));

      // Create worker
      const { embeddingUpsertWorker } = require('@/lib/ai-integration/workers/embedding-upsert-worker');
      worker = new Worker('ai:embedding-upsert', embeddingUpsertWorker, {
        connection: testRedisConfig,
      });

      // Add batch job
      const jobData = {
        batch: [
          { intentId: 'intent-1', text: 'Rastrear pedido', accountId: 123 },
          { intentId: 'intent-2', text: 'Cancelar pedido', accountId: 123 },
          { intentId: 'intent-3', text: 'Status do pedido', accountId: 123 },
        ],
        traceId: 'trace-batch-123',
      };

      const job = await embeddingQueue.add('batch-upsert-embeddings', jobData);

      // Wait for job completion
      await job.waitUntilFinished(embeddingQueue.events);

      // Verify job completed successfully
      const completedJobs = await embeddingQueue.getCompleted();
      expect(completedJobs).toHaveLength(1);

      // Verify batch service was called
      const embeddingInstance = mockEmbeddingGenerator.EmbeddingGeneratorService.mock.instances[0];
      expect(embeddingInstance.generateBatchEmbeddings).toHaveBeenCalledWith([
        'Rastrear pedido',
        'Cancelar pedido',
        'Status do pedido',
      ]);
    });
  });

  describe('Queue Management', () => {
    it('should pause and resume queue processing', async () => {
      if (!redisAvailable) {
        console.warn('Skipping test - Redis not available');
        return;
      }

      // Create worker
      const { aiMessageWorker } = require('@/lib/ai-integration/workers/ai-message-worker');
      worker = new Worker('ai:incoming-message', aiMessageWorker, {
        connection: testRedisConfig,
      });

      // Pause the queue
      await aiMessageQueue.pause();

      // Add job while paused
      const jobData = {
        accountId: 123,
        conversationId: 456,
        messageId: '789',
        text: 'Test message',
        channel: 'whatsapp',
        traceId: 'trace-123',
        featureFlags: {},
      };

      await aiMessageQueue.add('process-message', jobData);

      // Wait a bit to ensure job doesn't get processed
      await new Promise(resolve => setTimeout(resolve, 500));

      // Verify job is waiting
      const waitingJobs = await aiMessageQueue.getWaiting();
      expect(waitingJobs).toHaveLength(1);

      // Resume the queue
      await aiMessageQueue.resume();

      // Wait for job to be processed
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Verify job was processed
      const completedJobs = await aiMessageQueue.getCompleted();
      expect(completedJobs).toHaveLength(1);
    });

    it('should handle queue cleanup', async () => {
      if (!redisAvailable) {
        console.warn('Skipping test - Redis not available');
        return;
      }

      // Add multiple jobs
      for (let i = 0; i < 5; i++) {
        await aiMessageQueue.add('process-message', {
          accountId: 123,
          conversationId: 456 + i,
          messageId: `msg-${i}`,
          text: `Test message ${i}`,
          channel: 'whatsapp',
          traceId: `trace-${i}`,
          featureFlags: {},
        });
      }

      // Verify jobs were added
      const waitingJobs = await aiMessageQueue.getWaiting();
      expect(waitingJobs).toHaveLength(5);

      // Clean the queue
      await aiMessageQueue.clean(0, 10, 'waiting');

      // Verify jobs were cleaned
      const remainingJobs = await aiMessageQueue.getWaiting();
      expect(remainingJobs).toHaveLength(0);
    });

    it('should provide queue metrics', async () => {
      if (!redisAvailable) {
        console.warn('Skipping test - Redis not available');
        return;
      }

      // Add jobs in different states
      await aiMessageQueue.add('process-message', { test: 'waiting' });
      
      // Get queue counts
      const waiting = await aiMessageQueue.getWaiting();
      const active = await aiMessageQueue.getActive();
      const completed = await aiMessageQueue.getCompleted();
      const failed = await aiMessageQueue.getFailed();

      expect(waiting.length).toBeGreaterThanOrEqual(0);
      expect(active.length).toBeGreaterThanOrEqual(0);
      expect(completed.length).toBeGreaterThanOrEqual(0);
      expect(failed.length).toBeGreaterThanOrEqual(0);

      // Get job counts
      const jobCounts = await aiMessageQueue.getJobCounts();
      expect(jobCounts).toHaveProperty('waiting');
      expect(jobCounts).toHaveProperty('active');
      expect(jobCounts).toHaveProperty('completed');
      expect(jobCounts).toHaveProperty('failed');
    });
  });
});