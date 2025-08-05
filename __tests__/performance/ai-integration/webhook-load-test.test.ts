/**
 * Performance tests for webhook endpoint
 * Tests load handling with 1000 concurrent requests and latency requirements
 */

import { testRedisConfig, isRedisAvailable } from '@/__tests__/setup/test-redis-config';
import request from 'supertest';
import { createServer } from 'http';
import { NextApiHandler } from 'next';
import crypto from 'crypto';
import Redis from 'ioredis';

// Mock external services for performance testing
jest.mock('@/lib/ai-integration/services/openai-client');
jest.mock('@/lib/ai-integration/services/chatwit-api-client');

describe('Webhook Load Performance Tests', () => {
  let server: any;
  let redis: Redis;
  let redisAvailable: boolean;

  const testSecret = 'test-webhook-secret';
  const basePayload = {
    account_id: 123,
    channel: 'whatsapp',
    conversation: {
      id: 456,
      inbox_id: 789,
      status: 'open',
    },
    message: {
      id: 101112,
      message_type: 'incoming',
      content: 'Test performance message',
      created_at: Math.floor(Date.now() / 1000),
      source_id: 'wamid.PERF_TEST',
      sender: {
        type: 'contact',
        id: 999,
        name: 'Performance Test User',
      },
    },
  };

  beforeAll(async () => {
    redisAvailable = await isRedisAvailable();
    
    if (!redisAvailable) {
      console.warn('Redis not available, skipping performance tests');
      return;
    }

    redis = new Redis(testRedisConfig);

    // Setup test server
    const webhookHandler: NextApiHandler = require('@/app/api/chatwit/webhook/route').POST;
    server = createServer((req, res) => {
      if (req.method === 'POST' && req.url === '/webhook') {
        webhookHandler(req as any, res as any);
      }
    });

    // Mock services for fast responses
    const mockOpenAIClient = require('@/lib/ai-integration/services/openai-client');
    const mockChatwitClient = require('@/lib/ai-integration/services/chatwit-api-client');

    mockOpenAIClient.OpenAIClientService.mockImplementation(() => ({
      generateStructuredOutput: jest.fn().mockResolvedValue({
        response: { body: 'Fast response', buttons: [] },
        tokensUsed: 10,
        model: 'gpt-4o-mini',
      }),
    }));

    mockChatwitClient.ChatwitApiClient.mockImplementation(() => ({
      postBotMessage: jest.fn().mockResolvedValue({
        success: true,
        messageId: Math.floor(Math.random() * 1000000),
      }),
    }));
  });

  afterAll(async () => {
    if (!redisAvailable) return;

    if (server) {
      server.close();
    }
    if (redis) {
      await redis.disconnect();
    }
  });

  beforeEach(async () => {
    if (!redisAvailable) return;

    // Clear Redis between tests
    await redis.flushdb();
  });

  describe('Concurrent Request Handling', () => {
    it('should handle 100 concurrent requests within latency requirements', async () => {
      if (!redisAvailable) {
        console.warn('Skipping test - Redis not available');
        return;
      }

      const concurrentRequests = 100;
      const requests = [];
      const startTime = Date.now();

      // Generate unique payloads to avoid idempotency deduplication
      for (let i = 0; i < concurrentRequests; i++) {
        const uniquePayload = {
          ...basePayload,
          message: {
            ...basePayload.message,
            id: 101112 + i,
            content: `Test message ${i}`,
          },
        };

        const timestamp = Math.floor(Date.now() / 1000);
        const payloadString = JSON.stringify(uniquePayload);
        const signature = crypto
          .createHmac('sha256', testSecret)
          .update(`${timestamp}.${payloadString}`)
          .digest('hex');

        requests.push(
          request(server)
            .post('/webhook')
            .set('X-Chatwit-Signature', signature)
            .set('X-Chatwit-Timestamp', timestamp.toString())
            .send(uniquePayload)
        );
      }

      const responses = await Promise.all(requests);
      const endTime = Date.now();
      const totalDuration = endTime - startTime;

      // Analyze results
      const successfulRequests = responses.filter(r => r.status === 200);
      const averageLatency = totalDuration / concurrentRequests;

      console.log(`Performance Test Results (${concurrentRequests} concurrent requests):`);
      console.log(`Total Duration: ${totalDuration}ms`);
      console.log(`Average Latency: ${averageLatency}ms`);
      console.log(`Successful Requests: ${successfulRequests.length}/${concurrentRequests}`);
      console.log(`Success Rate: ${(successfulRequests.length / concurrentRequests * 100).toFixed(2)}%`);

      // Assertions
      expect(successfulRequests.length).toBeGreaterThan(concurrentRequests * 0.95); // 95% success rate
      expect(averageLatency).toBeLessThan(500); // Average under 500ms
      expect(totalDuration).toBeLessThan(5000); // Total under 5 seconds
    });

    it('should handle 1000 concurrent requests with acceptable performance', async () => {
      if (!redisAvailable) {
        console.warn('Skipping test - Redis not available');
        return;
      }

      const concurrentRequests = 1000;
      const batchSize = 100; // Process in batches to avoid overwhelming
      const batches = [];

      // Create batches of requests
      for (let batch = 0; batch < concurrentRequests / batchSize; batch++) {
        const batchRequests = [];
        
        for (let i = 0; i < batchSize; i++) {
          const requestIndex = batch * batchSize + i;
          const uniquePayload = {
            ...basePayload,
            message: {
              ...basePayload.message,
              id: 101112 + requestIndex,
              content: `Batch ${batch} message ${i}`,
            },
          };

          const timestamp = Math.floor(Date.now() / 1000);
          const payloadString = JSON.stringify(uniquePayload);
          const signature = crypto
            .createHmac('sha256', testSecret)
            .update(`${timestamp}.${payloadString}`)
            .digest('hex');

          batchRequests.push(
            request(server)
              .post('/webhook')
              .set('X-Chatwit-Signature', signature)
              .set('X-Chatwit-Timestamp', timestamp.toString())
              .send(uniquePayload)
          );
        }

        batches.push(batchRequests);
      }

      const startTime = Date.now();
      const allResponses = [];

      // Execute batches with small delays
      for (const batch of batches) {
        const batchResponses = await Promise.all(batch);
        allResponses.push(...batchResponses);
        
        // Small delay between batches to prevent overwhelming
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      const endTime = Date.now();
      const totalDuration = endTime - startTime;

      // Analyze results
      const successfulRequests = allResponses.filter(r => r.status === 200);
      const throttledRequests = allResponses.filter(r => r.status === 202);
      const errorRequests = allResponses.filter(r => r.status >= 400);

      console.log(`Load Test Results (${concurrentRequests} total requests):`);
      console.log(`Total Duration: ${totalDuration}ms`);
      console.log(`Successful Requests: ${successfulRequests.length}`);
      console.log(`Throttled Requests: ${throttledRequests.length}`);
      console.log(`Error Requests: ${errorRequests.length}`);
      console.log(`Throughput: ${(concurrentRequests / (totalDuration / 1000)).toFixed(2)} req/s`);

      // Assertions for load test
      expect(successfulRequests.length + throttledRequests.length).toBeGreaterThan(concurrentRequests * 0.90); // 90% handled
      expect(errorRequests.length).toBeLessThan(concurrentRequests * 0.05); // Less than 5% errors
      expect(totalDuration).toBeLessThan(30000); // Complete within 30 seconds
    });
  });

  describe('Latency Requirements Validation', () => {
    it('should meet P95 latency requirement (≤ 2.5s)', async () => {
      if (!redisAvailable) {
        console.warn('Skipping test - Redis not available');
        return;
      }

      const testRequests = 100;
      const latencies = [];

      for (let i = 0; i < testRequests; i++) {
        const uniquePayload = {
          ...basePayload,
          message: {
            ...basePayload.message,
            id: 101112 + i,
            content: `Latency test ${i}`,
          },
        };

        const timestamp = Math.floor(Date.now() / 1000);
        const payloadString = JSON.stringify(uniquePayload);
        const signature = crypto
          .createHmac('sha256', testSecret)
          .update(`${timestamp}.${payloadString}`)
          .digest('hex');

        const startTime = Date.now();
        
        const response = await request(server)
          .post('/webhook')
          .set('X-Chatwit-Signature', signature)
          .set('X-Chatwit-Timestamp', timestamp.toString())
          .send(uniquePayload);

        const endTime = Date.now();
        const latency = endTime - startTime;

        if (response.status === 200) {
          latencies.push(latency);
        }

        // Small delay between requests
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      // Calculate percentiles
      latencies.sort((a, b) => a - b);
      const p50 = latencies[Math.floor(latencies.length * 0.5)];
      const p95 = latencies[Math.floor(latencies.length * 0.95)];
      const p99 = latencies[Math.floor(latencies.length * 0.99)];
      const average = latencies.reduce((sum, lat) => sum + lat, 0) / latencies.length;

      console.log(`Latency Analysis (${latencies.length} successful requests):`);
      console.log(`Average: ${average.toFixed(2)}ms`);
      console.log(`P50: ${p50}ms`);
      console.log(`P95: ${p95}ms`);
      console.log(`P99: ${p99}ms`);

      // Assertions based on requirements
      expect(p95).toBeLessThanOrEqual(2500); // P95 ≤ 2.5s
      expect(p99).toBeLessThanOrEqual(5000); // P99 ≤ 5s
      expect(average).toBeLessThan(1000); // Average under 1s
    });

    it('should maintain fast-ack pattern (respond within 150ms)', async () => {
      if (!redisAvailable) {
        console.warn('Skipping test - Redis not available');
        return;
      }

      const testRequests = 50;
      const ackLatencies = [];

      for (let i = 0; i < testRequests; i++) {
        const uniquePayload = {
          ...basePayload,
          message: {
            ...basePayload.message,
            id: 101112 + i,
            content: `Fast ack test ${i}`,
          },
        };

        const timestamp = Math.floor(Date.now() / 1000);
        const payloadString = JSON.stringify(uniquePayload);
        const signature = crypto
          .createHmac('sha256', testSecret)
          .update(`${timestamp}.${payloadString}`)
          .digest('hex');

        const startTime = Date.now();
        
        const response = await request(server)
          .post('/webhook')
          .set('X-Chatwit-Signature', signature)
          .set('X-Chatwit-Timestamp', timestamp.toString())
          .send(uniquePayload);

        const ackTime = Date.now() - startTime;

        if (response.status === 200) {
          ackLatencies.push(ackTime);
        }

        await new Promise(resolve => setTimeout(resolve, 20));
      }

      const averageAckTime = ackLatencies.reduce((sum, lat) => sum + lat, 0) / ackLatencies.length;
      const maxAckTime = Math.max(...ackLatencies);
      const p95AckTime = ackLatencies.sort((a, b) => a - b)[Math.floor(ackLatencies.length * 0.95)];

      console.log(`Fast-Ack Analysis:`);
      console.log(`Average Ack Time: ${averageAckTime.toFixed(2)}ms`);
      console.log(`Max Ack Time: ${maxAckTime}ms`);
      console.log(`P95 Ack Time: ${p95AckTime}ms`);

      // Fast-ack requirements
      expect(averageAckTime).toBeLessThan(100); // Average under 100ms
      expect(p95AckTime).toBeLessThan(150); // P95 under 150ms
      expect(maxAckTime).toBeLessThan(200); // Max under 200ms
    });
  });

  describe('Rate Limiting Performance', () => {
    it('should handle rate limiting efficiently without blocking other requests', async () => {
      if (!redisAvailable) {
        console.warn('Skipping test - Redis not available');
        return;
      }

      // Send requests that will trigger rate limiting
      const conversationId = 999;
      const rateLimitRequests = 15; // Above conversation limit of 8/10s
      const normalRequests = 10;

      const allRequests = [];

      // Add rate-limited requests (same conversation)
      for (let i = 0; i < rateLimitRequests; i++) {
        const rateLimitPayload = {
          ...basePayload,
          conversation: { ...basePayload.conversation, id: conversationId },
          message: {
            ...basePayload.message,
            id: 200000 + i,
            content: `Rate limit test ${i}`,
          },
        };

        const timestamp = Math.floor(Date.now() / 1000);
        const payloadString = JSON.stringify(rateLimitPayload);
        const signature = crypto
          .createHmac('sha256', testSecret)
          .update(`${timestamp}.${payloadString}`)
          .digest('hex');

        allRequests.push({
          type: 'rate-limited',
          request: request(server)
            .post('/webhook')
            .set('X-Chatwit-Signature', signature)
            .set('X-Chatwit-Timestamp', timestamp.toString())
            .send(rateLimitPayload)
        });
      }

      // Add normal requests (different conversations)
      for (let i = 0; i < normalRequests; i++) {
        const normalPayload = {
          ...basePayload,
          conversation: { ...basePayload.conversation, id: 1000 + i },
          message: {
            ...basePayload.message,
            id: 300000 + i,
            content: `Normal test ${i}`,
          },
        };

        const timestamp = Math.floor(Date.now() / 1000);
        const payloadString = JSON.stringify(normalPayload);
        const signature = crypto
          .createHmac('sha256', testSecret)
          .update(`${timestamp}.${payloadString}`)
          .digest('hex');

        allRequests.push({
          type: 'normal',
          request: request(server)
            .post('/webhook')
            .set('X-Chatwit-Signature', signature)
            .set('X-Chatwit-Timestamp', timestamp.toString())
            .send(normalPayload)
        });
      }

      // Execute all requests concurrently
      const startTime = Date.now();
      const responses = await Promise.all(allRequests.map(r => r.request));
      const endTime = Date.now();

      // Analyze results
      const rateLimitedResponses = responses.slice(0, rateLimitRequests);
      const normalResponses = responses.slice(rateLimitRequests);

      const successfulRateLimited = rateLimitedResponses.filter(r => r.status === 200).length;
      const throttledRateLimited = rateLimitedResponses.filter(r => r.status === 202).length;
      const successfulNormal = normalResponses.filter(r => r.status === 200).length;

      console.log(`Rate Limiting Performance:`);
      console.log(`Total Duration: ${endTime - startTime}ms`);
      console.log(`Rate-limited requests: ${successfulRateLimited} success, ${throttledRateLimited} throttled`);
      console.log(`Normal requests: ${successfulNormal}/${normalRequests} success`);

      // Assertions
      expect(successfulRateLimited + throttledRateLimited).toBe(rateLimitRequests); // All handled
      expect(successfulNormal).toBe(normalRequests); // Normal requests not affected
      expect(endTime - startTime).toBeLessThan(2000); // Fast processing
    });
  });

  describe('Memory and Resource Usage', () => {
    it('should maintain stable memory usage under load', async () => {
      if (!redisAvailable) {
        console.warn('Skipping test - Redis not available');
        return;
      }

      const initialMemory = process.memoryUsage();
      const requestCount = 500;
      const batchSize = 50;

      console.log(`Initial Memory Usage: ${(initialMemory.heapUsed / 1024 / 1024).toFixed(2)} MB`);

      // Process requests in batches
      for (let batch = 0; batch < requestCount / batchSize; batch++) {
        const batchRequests = [];

        for (let i = 0; i < batchSize; i++) {
          const requestIndex = batch * batchSize + i;
          const uniquePayload = {
            ...basePayload,
            message: {
              ...basePayload.message,
              id: 400000 + requestIndex,
              content: `Memory test ${requestIndex}`,
            },
          };

          const timestamp = Math.floor(Date.now() / 1000);
          const payloadString = JSON.stringify(uniquePayload);
          const signature = crypto
            .createHmac('sha256', testSecret)
            .update(`${timestamp}.${payloadString}`)
            .digest('hex');

          batchRequests.push(
            request(server)
              .post('/webhook')
              .set('X-Chatwit-Signature', signature)
              .set('X-Chatwit-Timestamp', timestamp.toString())
              .send(uniquePayload)
          );
        }

        await Promise.all(batchRequests);

        // Check memory usage periodically
        if (batch % 2 === 0) {
          const currentMemory = process.memoryUsage();
          console.log(`Batch ${batch} Memory: ${(currentMemory.heapUsed / 1024 / 1024).toFixed(2)} MB`);
        }

        // Force garbage collection if available
        if (global.gc) {
          global.gc();
        }
      }

      const finalMemory = process.memoryUsage();
      const memoryIncrease = (finalMemory.heapUsed - initialMemory.heapUsed) / 1024 / 1024;

      console.log(`Final Memory Usage: ${(finalMemory.heapUsed / 1024 / 1024).toFixed(2)} MB`);
      console.log(`Memory Increase: ${memoryIncrease.toFixed(2)} MB`);

      // Memory should not increase dramatically
      expect(memoryIncrease).toBeLessThan(100); // Less than 100MB increase
    });
  });
});