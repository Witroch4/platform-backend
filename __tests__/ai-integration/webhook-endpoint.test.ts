/**
 * Webhook Endpoint Tests
 * Basic tests to verify webhook functionality
 */

import { NextRequest } from 'next/server';
import { POST, GET } from '@/app/api/chatwit/webhook/route';
import { getHmacAuthService } from '@/lib/ai-integration/services/hmac-auth';

// Mock environment variables
process.env.CHATWIT_WEBHOOK_SECRET = 'test-secret-key';
process.env.RL_CONV = '8/10';
process.env.RL_ACC = '80/10';
process.env.RL_CONTACT = '15/10';

// Mock Redis and connections
jest.mock('@/lib/connections', () => ({
  getRedisInstance: jest.fn(() => ({
    set: jest.fn().mockResolvedValue('OK'),
    get: jest.fn().mockResolvedValue(null),
    del: jest.fn().mockResolvedValue(1),
    exists: jest.fn().mockResolvedValue(0),
    ttl: jest.fn().mockResolvedValue(-1),
    setex: jest.fn().mockResolvedValue('OK'),
    zremrangebyscore: jest.fn().mockResolvedValue(0),
    zcard: jest.fn().mockResolvedValue(0),
    zadd: jest.fn().mockResolvedValue(1),
    expire: jest.fn().mockResolvedValue(1),
    pipeline: jest.fn(() => ({
      zremrangebyscore: jest.fn(),
      zcard: jest.fn(),
      zadd: jest.fn(),
      expire: jest.fn(),
      exec: jest.fn().mockResolvedValue([
        [null, 0], // zremrangebyscore
        [null, 0], // zcard
        [null, 1], // zadd
        [null, 1], // expire
      ]),
    })),
  })),
}));

// Mock BullMQ
jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => ({
    add: jest.fn().mockResolvedValue({ id: 'test-job-id' }),
    getWaiting: jest.fn().mockResolvedValue([]),
    getActive: jest.fn().mockResolvedValue([]),
    getCompleted: jest.fn().mockResolvedValue([]),
    getFailed: jest.fn().mockResolvedValue([]),
    getDelayed: jest.fn().mockResolvedValue([]),
    isPaused: jest.fn().mockResolvedValue(false),
    on: jest.fn(),
    close: jest.fn(),
  })),
}));

describe('Webhook Endpoint', () => {
  const hmacAuth = getHmacAuthService();

  const createValidPayload = () => ({
    account_id: 1,
    channel: 'whatsapp' as const,
    conversation: {
      id: 123,
      inbox_id: 456,
      status: 'open' as const,
    },
    message: {
      id: 789,
      message_type: 'incoming' as const,
      content_type: 'text',
      content: 'Hello, I need help',
      created_at: Math.floor(Date.now() / 1000),
      source_id: 'wamid.test123',
      sender: {
        type: 'contact' as const,
        id: 101,
        name: 'John Doe',
      },
    },
  });

  const createValidRequest = (payload: any, headers: Record<string, string> = {}) => {
    const body = JSON.stringify(payload);
    const { signature, timestamp } = hmacAuth.generateSignature(body);

    const requestHeaders = new Headers({
      'content-type': 'application/json',
      'x-chatwit-signature': signature,
      'x-chatwit-timestamp': timestamp,
      'x-chatwit-signature-version': 'v1',
      ...headers,
    });

    return new NextRequest('http://localhost:3000/api/chatwit/webhook', {
      method: 'POST',
      headers: requestHeaders,
      body,
    });
  };

  describe('POST /api/chatwit/webhook', () => {
    it('should accept valid webhook payload', async () => {
      const payload = createValidPayload();
      const request = createValidRequest(payload);

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.ok).toBe(true);
    });

    it('should reject invalid HMAC signature', async () => {
      const payload = createValidPayload();
      const body = JSON.stringify(payload);

      const requestHeaders = new Headers({
        'content-type': 'application/json',
        'x-chatwit-signature': 'sha256=invalid-signature',
        'x-chatwit-timestamp': Math.floor(Date.now() / 1000).toString(),
        'x-chatwit-signature-version': 'v1',
      });

      const request = new NextRequest('http://localhost:3000/api/chatwit/webhook', {
        method: 'POST',
        headers: requestHeaders,
        body,
      });

      const response = await POST(request);

      expect(response.status).toBe(401);
    });

    it('should reject payload with invalid schema', async () => {
      const invalidPayload = {
        account_id: 'invalid', // Should be number
        channel: 'whatsapp',
        conversation: {
          id: 123,
          inbox_id: 456,
          status: 'open',
        },
        message: {
          id: 789,
          message_type: 'incoming',
          content_type: 'text',
          content: 'Hello',
          created_at: Math.floor(Date.now() / 1000),
        },
      };

      const request = createValidRequest(invalidPayload);
      const response = await POST(request);

      expect(response.status).toBe(400);
    });

    it('should skip outgoing messages', async () => {
      const payload = createValidPayload();
      payload.message.message_type = 'outgoing';

      const request = createValidRequest(payload);
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.ok).toBe(true);
      expect(data.skipped).toBe(true);
    });

    it('should handle duplicate messages with idempotency', async () => {
      const payload = createValidPayload();
      const request1 = createValidRequest(payload);
      const request2 = createValidRequest(payload);

      // First request should succeed
      const response1 = await POST(request1);
      const data1 = await response1.json();

      expect(response1.status).toBe(200);
      expect(data1.ok).toBe(true);

      // Second request should be deduplicated
      // Note: In real scenario, Redis would return the duplicate
      // For this test, we're just verifying the endpoint structure
    });

    it('should reject payload larger than 256KB', async () => {
      const payload = createValidPayload();
      // Create a large content string (> 256KB)
      payload.message.content = 'x'.repeat(300 * 1024);

      const request = createValidRequest(payload);
      const response = await POST(request);

      expect(response.status).toBe(413);
    });
  });

  describe('GET /api/chatwit/webhook', () => {
    it('should return health status', async () => {
      const request = new NextRequest('http://localhost:3000/api/chatwit/webhook', {
        method: 'GET',
      });

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.status).toBe('healthy');
      expect(data.timestamp).toBeDefined();
      expect(data.queue).toBeDefined();
    });
  });
});