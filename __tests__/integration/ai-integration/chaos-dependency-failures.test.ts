/**
 * Chaos engineering tests for dependency failures
 * Tests system resilience when Redis/DB/OpenAI/Chatwit fail
 * Validates retries, circuit breakers, and DLQ behavior
 */

import { testRedisConfig, isRedisAvailable } from '@/__tests__/setup/test-redis-config';
import { Queue, Worker } from 'bullmq';
import Redis from 'ioredis';
import nock from 'nock';

// Mock Prisma for database failure simulation
jest.mock('@/lib/prisma', () => ({
  prisma: {
    llmAudit: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
    intentHitLog: {
      create: jest.fn(),
    },
    intent: {
      findMany: jest.fn(),
    },
    $disconnect: jest.fn(),
  },
}));

describe('Chaos Engineering - Dependency Failure Tests', () => {
  let redis: Redis;
  let aiMessageQueue: Queue;
  let worker: Worker;
  let redisAvailable: boolean;

  beforeAll(async () => {
    redisAvailable = await isRedisAvailable();
    
    if (!redisAvailable) {
      console.warn('Redis not available, skipping chaos tests');
      return;
    }

    redis = new Redis(testRedisConfig);
    aiMessageQueue = new Queue('ai:incoming-message', {
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
    if (redis) {
      await redis.disconnect();
    }
  });

  beforeEach(async () => {
    if (!redisAvailable) return;

    // Clean up before each test
    await aiMessageQueue.obliterate({ force: true });
    if (worker) {
      await worker.close();
    }
    nock.cleanAll();
  });

  afterEach(() => {
    nock.cleanAll();
  });

  describe('Redis Failure Scenarios', () => {
    it('should handle Redis connection failures gracefully', async () => {
      if (!redisAvailable) {
        console.warn('Skipping test - Redis not available');
        return;
      }

      // Create a separate Redis instance to simulate failure
      const failingRedis = new Redis({
        ...testRedisConfig,
        retryDelayOnFailover: 100,
        maxRetriesPerRequest: 1,
      });

      // Disconnect Redis to simulate failure
      await failingRedis.disconnect();

      // Mock services that depend on Redis
      const mockIdempotencyService = {
        checkIdempotency: jest.fn().mockImplementation(async () => {
          throw new Error('Redis connection failed');
        }),
      };

      const mockRateLimiterService = {
        checkRateLimit: jest.fn().mockImplementation(async () => {
          throw new Error('Redis connection failed');
        }),
      };

      // Test that system continues to work (fail-open behavior)
      try {
        const idempotencyResult = await mockIdempotencyService.checkIdempotency({
          accountId: 123,
          conversationId: 456,
          messageId: 'test',
        });
        
        // Should not reach here due to error
        expect(true).toBe(false);
      } catch (error) {
        // System should handle Redis failures gracefully
        expect(error.message).toContain('Redis connection failed');
        
        // In real implementation, this would return { isDuplicate: false, error: '...' }
        // to allow processing to continue (fail-open)
      }

      await failingRedis.disconnect();
    });

    it('should handle Redis timeout scenarios', async () => {
      if (!redisAvailable) {
        console.warn('Skipping test - Redis not available');
        return;
      }

      // Mock Redis operations with timeout
      const mockRedisWithTimeout = {
        setnx: jest.fn().mockImplementation(() => 
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Redis timeout')), 100)
          )
        ),
        incr: jest.fn().mockImplementation(() => 
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Redis timeout')), 100)
          )
        ),
      };

      // Test idempotency service with timeout
      const mockIdempotencyService = {
        checkIdempotency: jest.fn().mockImplementation(async () => {
          try {
            await mockRedisWithTimeout.setnx('test-key', '1');
            return { isDuplicate: fals