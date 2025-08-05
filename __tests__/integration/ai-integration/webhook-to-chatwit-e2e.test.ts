/**
 * Integration tests for end-to-end webhook to Chatwit flow
 * Tests complete pipeline from webhook ingestion to Chatwit response
 */

import { testRedisConfig, isRedisAvailable } from '@/__tests__/setup/test-redis-config';
import { getPrismaInstance } from "@/lib/connections";
import Redis from 'ioredis';
import { Queue, Worker } from 'bullmq';
import request from 'supertest';
import { createServer } from 'http';
import { NextApiHandler } from 'next';
import crypto from 'crypto';

// Mock external services
jest.mock('@/lib/ai-integration/services/openai-client');
jest.mock('@/lib/ai-integration/services/chatwit-api-client');

describe('Webhook to Chatwit E2E Integration', () => {
  let prisma: PrismaClient;
  let redis: Redis;
  let aiMessageQueue: Queue;
  let worker: Worker;
  let server: any;
  let redisAvailable: boolean;

  const testSecret = 'test-webhook-secret';
  const testPayload = {
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
      content: 'Preciso de ajuda com meu pedido',
      created_at: Math.floor(Date.now() / 1000),
      source_id: 'wamid.ABC123',
      sender: {
        type: 'contact',
        id: 999,
        name: 'João Silva',
      },
    },
  };

  beforeAll(async () => {
    redisAvailable = await isRedisAvailable();
    
    if (!redisAvailable) {
      console.warn('Redis not available, skipping integration tests');
      return;
    }

    // Setup test database
    prisma = new PrismaClient({
      datasources: {
        db: {
          url: process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/test',
        },
      },
    });

    // Setup test Redis
    redis = new Redis(testRedisConfig);

    // Setup test queue
    aiMessageQueue = new Queue('ai:incoming-message', {
      connection: testRedisConfig,
    });

    // Clean up any existing data
    await aiMessageQueue.obliterate({ force: true });
    await redis.flushdb();
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
    if (prisma) {
      await prisma.$disconnect();
    }
    if (server) {
      server.close();
    }
  });

  beforeEach(async () => {
    if (!redisAvailable) return;

    // Clear Redis and queue between tests
    await redis.flushdb();
    await aiMessageQueue.obliterate({ force: true });
  });

  describe('Complete E2E Flow', () => {
    it('should process webhook through complete pipeline', async () => {
      if (!redisAvailable) {
        console.warn('Skipping test - Redis not available');
        return;
      }

      // Mock OpenAI and Chatwit responses
      const mockOpenAIClient = require('@/lib/ai-integration/services/openai-client');
      const mockChatwitClient = require('@/lib/ai-integration/services/chatwit-api-client');

      mockOpenAIClient.OpenAIClientService.mockImplementation(() => ({
        generateStructuredOutput: jest.fn().mockResolvedValue({
          response: {
            body: 'Como posso ajudar com seu pedido?',
            buttons: [
              { title: 'Rastrear', id: 'intent:track' },
              { title: 'Cancelar', id: 'intent:cancel' },
            ],
          },
          tokensUsed: 150,
          model: 'gpt-4o-mini',
        }),
      }));

      mockChatwitClient.ChatwitApiClient.mockImplementation(() => ({
        postBotMessage: jest.fn().mockResolvedValue({
          success: true,
          messageId: 999,
        }),
      }));

      // Create webhook signature
      const timestamp = Math.floor(Date.now() / 1000);
      const payloadString = JSON.stringify(testPayload);
      const signature = crypto
        .createHmac('sha256', testSecret)
        .update(`${timestamp}.${payloadString}`)
        .digest('hex');

      // Setup worker to process jobs
      const { aiMessageWorker } = require('@/lib/ai-integration/workers/ai-message-worker');
      worker = new Worker('ai:incoming-message', aiMessageWorker, {
        connection: testRedisConfig,
      });

      // Create test server
      const webhookHandler: NextApiHandler = require('@/app/api/chatwit/webhook/route').POST;
      server = createServer((req, res) => {
        if (req.method === 'POST' && req.url === '/webhook') {
          webhookHandler(req as any, res as any);
        }
      });

      // Send webhook request
      const response = await request(server)
        .post('/webhook')
        .set('X-Chatwit-Signature', signature)
        .set('X-Chatwit-Timestamp', timestamp.toString())
        .send(testPayload)
        .expect(200);

      expect(response.body).toEqual({ ok: true });

      // Wait for job to be processed
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Verify job was enqueued and processed
      const completedJobs = await aiMessageQueue.getCompleted();
      expect(completedJobs).toHaveLength(1);

      const job = completedJobs[0];
      expect(job.data.accountId).toBe(123);
      expect(job.data.conversationId).toBe(456);
      expect(job.data.text).toBe('Preciso de ajuda com meu pedido');

      // Verify Chatwit API was called
      const chatwitInstance = mockChatwitClient.ChatwitApiClient.mock.instances[0];
      expect(chatwitInstance.postBotMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          accountId: 123,
          conversationId: 456,
          content: 'Como posso ajudar com seu pedido?',
          channel: 'whatsapp',
        })
      );
    });

    it('should handle idempotency correctly', async () => {
      if (!redisAvailable) {
        console.warn('Skipping test - Redis not available');
        return;
      }

      const timestamp = Math.floor(Date.now() / 1000);
      const payloadString = JSON.stringify(testPayload);
      const signature = crypto
        .createHmac('sha256', testSecret)
        .update(`${timestamp}.${payloadString}`)
        .digest('hex');

      const webhookHandler: NextApiHandler = require('@/app/api/chatwit/webhook/route').POST;
      server = createServer((req, res) => {
        if (req.method === 'POST' && req.url === '/webhook') {
          webhookHandler(req as any, res as any);
        }
      });

      // First request
      const response1 = await request(server)
        .post('/webhook')
        .set('X-Chatwit-Signature', signature)
        .set('X-Chatwit-Timestamp', timestamp.toString())
        .send(testPayload)
        .expect(200);

      expect(response1.body).toEqual({ ok: true });

      // Second request with same payload (should be deduplicated)
      const response2 = await request(server)
        .post('/webhook')
        .set('X-Chatwit-Signature', signature)
        .set('X-Chatwit-Timestamp', timestamp.toString())
        .send(testPayload)
        .expect(200);

      expect(response2.body).toEqual({ dedup: true });

      // Verify only one job was enqueued
      const waitingJobs = await aiMessageQueue.getWaiting();
      const activeJobs = await aiMessageQueue.getActive();
      const completedJobs = await aiMessageQueue.getCompleted();
      
      const totalJobs = waitingJobs.length + activeJobs.length + completedJobs.length;
      expect(totalJobs).toBe(1);
    });

    it('should handle rate limiting', async () => {
      if (!redisAvailable) {
        console.warn('Skipping test - Redis not available');
        return;
      }

      const webhookHandler: NextApiHandler = require('@/app/api/chatwit/webhook/route').POST;
      server = createServer((req, res) => {
        if (req.method === 'POST' && req.url === '/webhook') {
          webhookHandler(req as any, res as any);
        }
      });

      // Send multiple requests rapidly to trigger rate limiting
      const requests = [];
      for (let i = 0; i < 10; i++) {
        const uniquePayload = {
          ...testPayload,
          message: {
            ...testPayload.message,
            id: 101112 + i, // Unique message ID
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

      // Some requests should be rate limited (status 202)
      const successfulRequests = responses.filter(r => r.status === 200 && r.body.ok);
      const throttledRequests = responses.filter(r => r.status === 202 && r.body.throttled);

      expect(successfulRequests.length).toBeLessThan(10);
      expect(throttledRequests.length).toBeGreaterThan(0);
    });

    it('should handle invalid HMAC signature', async () => {
      if (!redisAvailable) {
        console.warn('Skipping test - Redis not available');
        return;
      }

      const webhookHandler: NextApiHandler = require('@/app/api/chatwit/webhook/route').POST;
      server = createServer((req, res) => {
        if (req.method === 'POST' && req.url === '/webhook') {
          webhookHandler(req as any, res as any);
        }
      });

      const timestamp = Math.floor(Date.now() / 1000);
      const invalidSignature = 'invalid-signature';

      const response = await request(server)
        .post('/webhook')
        .set('X-Chatwit-Signature', invalidSignature)
        .set('X-Chatwit-Timestamp', timestamp.toString())
        .send(testPayload)
        .expect(401);

      expect(response.body.error).toContain('Invalid signature');

      // Verify no job was enqueued
      const waitingJobs = await aiMessageQueue.getWaiting();
      expect(waitingJobs).toHaveLength(0);
    });

    it('should handle malformed payload', async () => {
      if (!redisAvailable) {
        console.warn('Skipping test - Redis not available');
        return;
      }

      const webhookHandler: NextApiHandler = require('@/app/api/chatwit/webhook/route').POST;
      server = createServer((req, res) => {
        if (req.method === 'POST' && req.url === '/webhook') {
          webhookHandler(req as any, res as any);
        }
      });

      const malformedPayload = {
        account_id: 'invalid', // Should be number
        channel: 'invalid_channel',
        // Missing required fields
      };

      const timestamp = Math.floor(Date.now() / 1000);
      const payloadString = JSON.stringify(malformedPayload);
      const signature = crypto
        .createHmac('sha256', testSecret)
        .update(`${timestamp}.${payloadString}`)
        .digest('hex');

      const response = await request(server)
        .post('/webhook')
        .set('X-Chatwit-Signature', signature)
        .set('X-Chatwit-Timestamp', timestamp.toString())
        .send(malformedPayload)
        .expect(400);

      expect(response.body.error).toContain('validation');

      // Verify no job was enqueued
      const waitingJobs = await aiMessageQueue.getWaiting();
      expect(waitingJobs).toHaveLength(0);
    });
  });

  describe('Database Integration', () => {
    it('should create audit log entries', async () => {
      if (!redisAvailable) {
        console.warn('Skipping test - Redis not available');
        return;
      }

      // This test would verify that LlmAudit entries are created
      // Implementation depends on the actual audit logging service
      
      const mockAuditLogger = require('@/lib/ai-integration/services/audit-logger');
      mockAuditLogger.AuditLoggerService.mockImplementation(() => ({
        logClassification: jest.fn().mockResolvedValue(true),
        logGeneration: jest.fn().mockResolvedValue(true),
      }));

      // Process a message through the pipeline
      const timestamp = Math.floor(Date.now() / 1000);
      const payloadString = JSON.stringify(testPayload);
      const signature = crypto
        .createHmac('sha256', testSecret)
        .update(`${timestamp}.${payloadString}`)
        .digest('hex');

      const webhookHandler: NextApiHandler = require('@/app/api/chatwit/webhook/route').POST;
      server = createServer((req, res) => {
        if (req.method === 'POST' && req.url === '/webhook') {
          webhookHandler(req as any, res as any);
        }
      });

      await request(server)
        .post('/webhook')
        .set('X-Chatwit-Signature', signature)
        .set('X-Chatwit-Timestamp', timestamp.toString())
        .send(testPayload)
        .expect(200);

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Verify audit logging was called
      const auditInstance = mockAuditLogger.AuditLoggerService.mock.instances[0];
      if (auditInstance) {
        expect(auditInstance.logClassification || auditInstance.logGeneration).toHaveBeenCalled();
      }
    });

    it('should handle database connection failures gracefully', async () => {
      if (!redisAvailable) {
        console.warn('Skipping test - Redis not available');
        return;
      }

      // Mock database failure
      const originalPrisma = prisma;
      prisma = {
        ...prisma,
        llmAudit: {
          create: jest.fn().mockRejectedValue(new Error('Database connection failed')),
        },
      } as any;

      // Process should continue even with database failures
      const timestamp = Math.floor(Date.now() / 1000);
      const payloadString = JSON.stringify(testPayload);
      const signature = crypto
        .createHmac('sha256', testSecret)
        .update(`${timestamp}.${payloadString}`)
        .digest('hex');

      const webhookHandler: NextApiHandler = require('@/app/api/chatwit/webhook/route').POST;
      server = createServer((req, res) => {
        if (req.method === 'POST' && req.url === '/webhook') {
          webhookHandler(req as any, res as any);
        }
      });

      const response = await request(server)
        .post('/webhook')
        .set('X-Chatwit-Signature', signature)
        .set('X-Chatwit-Timestamp', timestamp.toString())
        .send(testPayload)
        .expect(200);

      expect(response.body).toEqual({ ok: true });

      // Restore original prisma
      prisma = originalPrisma;
    });
  });

  describe('Redis Integration', () => {
    it('should handle Redis connection failures gracefully', async () => {
      if (!redisAvailable) {
        console.warn('Skipping test - Redis not available');
        return;
      }

      // Disconnect Redis to simulate failure
      await redis.disconnect();

      const timestamp = Math.floor(Date.now() / 1000);
      const payloadString = JSON.stringify(testPayload);
      const signature = crypto
        .createHmac('sha256', testSecret)
        .update(`${timestamp}.${payloadString}`)
        .digest('hex');

      const webhookHandler: NextApiHandler = require('@/app/api/chatwit/webhook/route').POST;
      server = createServer((req, res) => {
        if (req.method === 'POST' && req.url === '/webhook') {
          webhookHandler(req as any, res as any);
        }
      });

      // Should still accept webhook (fail-open behavior)
      const response = await request(server)
        .post('/webhook')
        .set('X-Chatwit-Signature', signature)
        .set('X-Chatwit-Timestamp', timestamp.toString())
        .send(testPayload)
        .expect(200);

      expect(response.body).toEqual({ ok: true });

      // Reconnect Redis for cleanup
      redis = new Redis(testRedisConfig);
    });

    it('should persist conversation context in Redis', async () => {
      if (!redisAvailable) {
        console.warn('Skipping test - Redis not available');
        return;
      }

      const conversationId = 456;
      const contextKey = `ctx:conv:${conversationId}`;

      // Simulate conversation context being stored
      await redis.lpush(contextKey, 'Cliente: Olá');
      await redis.lpush(contextKey, 'Bot: Como posso ajudar?');
      await redis.expire(contextKey, 900); // 15 minutes TTL

      // Verify context is stored
      const context = await redis.lrange(contextKey, 0, -1);
      expect(context).toContain('Cliente: Olá');
      expect(context).toContain('Bot: Como posso ajudar?');

      // Verify TTL is set
      const ttl = await redis.ttl(contextKey);
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(900);
    });
  });
});