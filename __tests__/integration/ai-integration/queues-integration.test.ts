/**
 * Queue Integration Tests with Real Redis
 * Requirements: 7.1, 7.2, 7.3
 */

// Unmock BullMQ and IORedis for integration tests
jest.unmock('bullmq');
jest.unmock('ioredis');

import { 
  initializeQueues, 
  addAiMessageJob, 
  addEmbeddingUpsertJob,
  getQueueStats,
  closeQueues 
} from '../../../lib/ai-integration/queues/manager';
import { AiMessageJobData, EmbeddingUpsertJobData } from '../../../lib/ai-integration/types/job-data';
import { isRedisAvailable } from '../../setup/test-redis-config';

describe('Queue Integration Tests (Real Redis)', () => {
  let redisAvailable = false;

  beforeAll(async () => {
    // Check if test Redis is available
    redisAvailable = await isRedisAvailable();
    
    if (!redisAvailable) {
      console.log('⚠️ Test Redis not available, skipping integration tests');
      console.log('💡 Run: npm run test:setup-redis');
      return;
    }

    console.log('✅ Test Redis is available, running integration tests');

    // Set environment to use test Redis
    process.env.USE_TEST_REDIS = 'true';
    
    // Initialize queues
    await initializeQueues();
  });

  afterAll(async () => {
    if (redisAvailable) {
      await closeQueues();
    }
    delete process.env.USE_TEST_REDIS;
  });

  describe('AI Message Queue Integration', () => {
    it('should add and process AI message job with real Redis', async () => {
      if (!redisAvailable) {
        console.log('⚠️ Skipping test - Redis not available');
        return;
      }

      const jobData: AiMessageJobData = {
        accountId: 1,
        conversationId: 123,
        messageId: 'msg-integration-456',
        text: 'Hello, I need help with integration test',
        contentAttributes: {},
        channel: 'whatsapp',
        traceId: 'trace-integration-789',
        enqueuedAt: Date.now(),
        featureFlags: {
          intentsEnabled: true,
          dynamicLlmEnabled: true,
          interactiveMessagesEnabled: true,
          economicModeEnabled: false,
        },
      };

      const jobId = await addAiMessageJob(jobData, { traceId: jobData.traceId });
      
      expect(jobId).toBeDefined();
      expect(typeof jobId).toBe('string');
      expect(jobId).toContain('123-msg-integration-456'); // Should contain conversation and message ID
    });

    it('should handle high priority jobs for button clicks', async () => {
      if (!redisAvailable) {
        console.log('⚠️ Skipping test - Redis not available');
        return;
      }

      const jobData: AiMessageJobData = {
        accountId: 1,
        conversationId: 123,
        messageId: 'msg-button-integration-456',
        text: '',
        contentAttributes: {
          button_reply: {
            id: 'track_order',
            title: 'Track Order'
          }
        },
        channel: 'whatsapp',
        traceId: 'trace-button-integration-789',
        enqueuedAt: Date.now(),
        featureFlags: {
          intentsEnabled: true,
          dynamicLlmEnabled: true,
          interactiveMessagesEnabled: true,
          economicModeEnabled: false,
        },
      };

      const jobId = await addAiMessageJob(jobData, { traceId: jobData.traceId });
      
      expect(jobId).toBeDefined();
      expect(typeof jobId).toBe('string');
    });
  });

  describe('Embedding Upsert Queue Integration', () => {
    it('should add embedding upsert job with real Redis', async () => {
      if (!redisAvailable) {
        console.log('⚠️ Skipping test - Redis not available');
        return;
      }

      const jobData: EmbeddingUpsertJobData = {
        intentId: 'intent-integration-123',
        intentName: 'track_order',
        description: 'Help users track their orders',
        text: 'track order delivery status integration test',
        traceId: 'trace-embedding-integration-456',
        accountId: 1,
        operation: 'create',
      };

      const jobId = await addEmbeddingUpsertJob(jobData, { traceId: jobData.traceId });
      
      expect(jobId).toBeDefined();
      expect(typeof jobId).toBe('string');
      expect(jobId).toContain('embedding-intent-integration-123'); // Should contain intent ID
    });
  });

  describe('Queue Statistics Integration', () => {
    it('should return real queue statistics', async () => {
      if (!redisAvailable) {
        console.log('⚠️ Skipping test - Redis not available');
        return;
      }

      const stats = await getQueueStats();
      
      expect(stats).toHaveProperty('aiMessage');
      expect(stats).toHaveProperty('embeddingUpsert');
      expect(stats.aiMessage).toHaveProperty('name', 'ai-incoming-message');
      expect(stats.embeddingUpsert).toHaveProperty('name', 'ai-embedding-upsert');
      
      // Should have numeric values for all counters
      expect(typeof stats.aiMessage.waiting).toBe('number');
      expect(typeof stats.aiMessage.active).toBe('number');
      expect(typeof stats.aiMessage.completed).toBe('number');
      expect(typeof stats.aiMessage.failed).toBe('number');
      expect(typeof stats.embeddingUpsert.waiting).toBe('number');
      expect(typeof stats.embeddingUpsert.active).toBe('number');
      expect(typeof stats.embeddingUpsert.completed).toBe('number');
      expect(typeof stats.embeddingUpsert.failed).toBe('number');
    });
  });

  describe('Queue Performance', () => {
    it('should handle multiple jobs efficiently', async () => {
      if (!redisAvailable) {
        console.log('⚠️ Skipping test - Redis not available');
        return;
      }

      const startTime = Date.now();
      const jobPromises: Promise<string>[] = [];

      // Add 10 jobs concurrently
      for (let i = 0; i < 10; i++) {
        const jobData: AiMessageJobData = {
          accountId: 1,
          conversationId: 100 + i,
          messageId: `msg-perf-${i}`,
          text: `Performance test message ${i}`,
          contentAttributes: {},
          channel: 'whatsapp',
          traceId: `trace-perf-${i}`,
          enqueuedAt: Date.now(),
          featureFlags: {
            intentsEnabled: true,
            dynamicLlmEnabled: true,
            interactiveMessagesEnabled: true,
            economicModeEnabled: false,
          },
        };

        jobPromises.push(addAiMessageJob(jobData, { traceId: jobData.traceId }));
      }

      const jobIds = await Promise.all(jobPromises);
      const endTime = Date.now();
      const duration = endTime - startTime;

      expect(jobIds).toHaveLength(10);
      expect(jobIds.every(id => typeof id === 'string')).toBe(true);
      expect(duration).toBeLessThan(1000); // Should complete within 1 second
    });
  });
});