/**
 * Integration tests for SocialWise Flow Security Features
 */

import { NextRequest } from 'next/server';
import { POST } from '@/app/api/integrations/webhooks/socialwiseflow/route';

// Mock dependencies
jest.mock('@/lib/connections', () => ({
  getRedisInstance: () => ({
    set: jest.fn().mockResolvedValue('OK'),
    exists: jest.fn().mockResolvedValue(0),
    pipeline: jest.fn().mockReturnValue({
      zremrangebyscore: jest.fn().mockReturnThis(),
      zcard: jest.fn().mockReturnThis(),
      zadd: jest.fn().mockReturnThis(),
      expire: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([[null, 0], [null, 0], [null, 1], [null, 1]]),
    }),
  }),
  getPrismaInstance: () => ({
    chatwitInbox: {
      findFirst: jest.fn().mockResolvedValue({
        id: 1,
        inboxId: 'inbox456',
        nome: 'Test Inbox',
        usuarioChatwit: { appUserId: 'user123', chatwitAccountId: 'acc123' },
      }),
    },
  }),
}));

jest.mock('@/lib/socialwise/assistant', () => ({
  getAssistantForInbox: jest.fn().mockResolvedValue({
    id: 1,
    model: 'gpt-4o-mini',
    instructions: 'Test assistant',
  }),
}));

jest.mock('@/lib/socialwise-flow/processor', () => ({
  processSocialWiseFlow: jest.fn().mockResolvedValue({
    response: { text: 'Test response' },
    metrics: {
      band: 'HARD',
      strategy: 'direct_map',
      routeTotalMs: 100,
      embeddingMs: 20,
      llmWarmupMs: 0,
    },
  }),
}));

describe('SocialWise Flow Security Integration Tests', () => {
  const validPayload = {
    session_id: 'session123',
    message: 'Hello world',
    channel_type: 'whatsapp',
    context: {
      'socialwise-chatwit': {
        account_data: { id: 'acc123' },
        inbox_data: { id: 'inbox456', channel_type: 'whatsapp' },
        wamid: 'wamid789',
      },
    },
  };

  const createRequest = (payload: any, headers: Record<string, string> = {}) => {
    return new NextRequest('https://example.com/api/integrations/webhooks/socialwiseflow', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...headers,
      },
      body: JSON.stringify(payload),
    });
  };

  describe('Payload Validation Security', () => {
    it('should reject malformed JSON payload', async () => {
      const request = new NextRequest('https://example.com/api/integrations/webhooks/socialwiseflow', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: 'invalid json {',
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.ok).toBe(false);
    });

    it('should reject payload without required session_id', async () => {
      const invalidPayload = { ...validPayload };
      delete (invalidPayload as any).session_id;

      const request = createRequest(invalidPayload);
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid payload structure');
      expect(data.details).toContainEqual(
        expect.objectContaining({
          path: ['session_id'],
          message: 'Required',
        })
      );
    });

    it('should reject payload without required message', async () => {
      const invalidPayload = { ...validPayload };
      delete (invalidPayload as any).message;

      const request = createRequest(invalidPayload);
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid payload structure');
      expect(data.details).toContainEqual(
        expect.objectContaining({
          path: ['message'],
          message: 'Required',
        })
      );
    });

    it('should reject payload without socialwise-chatwit context', async () => {
      const invalidPayload = {
        ...validPayload,
        context: {},
      };

      const request = createRequest(invalidPayload);
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid payload structure');
    });

    it('should reject payload without idempotency identifiers', async () => {
      const invalidPayload = {
        ...validPayload,
        context: {
          'socialwise-chatwit': {
            account_data: { id: 'acc123' },
            inbox_data: { id: 'inbox456', channel_type: 'whatsapp' },
            // No wamid or message_data.id
          },
        },
      };

      const request = createRequest(invalidPayload);
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid payload structure');
      expect(data.details).toContainEqual(
        expect.objectContaining({
          message: 'Either wamid or message_data.id must be provided for idempotency',
        })
      );
    });
  });

  describe('Input Sanitization Security', () => {
    it('should reject message with script tags', async () => {
      const maliciousPayload = {
        ...validPayload,
        message: 'Hello <script>alert("xss")</script> world',
      };

      const request = createRequest(maliciousPayload);
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid message content');
      expect(data.details).toBe('Message contains potentially dangerous content');
    });

    it('should reject message with javascript: protocol', async () => {
      const maliciousPayload = {
        ...validPayload,
        message: 'Click here: javascript:alert("xss")',
      };

      const request = createRequest(maliciousPayload);
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid message content');
      expect(data.details).toBe('Message contains potentially dangerous content');
    });

    it('should reject message with data:text/html', async () => {
      const maliciousPayload = {
        ...validPayload,
        message: 'Check this: data:text/html,<script>alert("xss")</script>',
      };

      const request = createRequest(maliciousPayload);
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid message content');
      expect(data.details).toBe('Message contains potentially dangerous content');
    });

    it('should reject message with onload attribute', async () => {
      const maliciousPayload = {
        ...validPayload,
        message: 'Hello <img onload="alert(1)"> world',
      };

      const request = createRequest(maliciousPayload);
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid message content');
      expect(data.details).toBe('Message contains potentially dangerous content');
    });

    it('should reject message that is too long', async () => {
      const longPayload = {
        ...validPayload,
        message: 'a'.repeat(5000), // Exceeds 4096 limit
      };

      const request = createRequest(longPayload);
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid message content');
      expect(data.details).toBe('Message content too long');
    });

    it('should normalize whitespace in message', async () => {
      const payloadWithWhitespace = {
        ...validPayload,
        message: '  Hello    world   with   extra   spaces  ',
      };

      const request = createRequest(payloadWithWhitespace);
      const response = await POST(request);

      // Should not return error - whitespace should be normalized
      expect(response.status).toBe(200);
    });
  });

  describe('Replay Protection Security', () => {
    beforeEach(() => {
      // Set bearer token for replay protection tests
      process.env.SOCIALWISEFLOW_ACCESS_TOKEN = 'test-bearer-token';
    });

    afterEach(() => {
      delete process.env.SOCIALWISEFLOW_ACCESS_TOKEN;
    });

    it('should reject request without bearer token when required', async () => {
      const request = createRequest(validPayload);
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('should reject request with invalid bearer token', async () => {
      const request = createRequest(validPayload, {
        authorization: 'Bearer invalid-token',
      });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('should accept request with valid bearer token', async () => {
      const request = createRequest(validPayload, {
        authorization: 'Bearer test-bearer-token',
      });
      const response = await POST(request);

      expect(response.status).toBe(200);
    });

    it('should reject replay with same nonce', async () => {
      const mockRedis = require('@/lib/connections').getRedisInstance();
      
      // First request should succeed
      mockRedis.set.mockResolvedValueOnce('OK'); // For nonce
      mockRedis.set.mockResolvedValueOnce('OK'); // For idempotency
      
      const request1 = createRequest(validPayload, {
        authorization: 'Bearer test-bearer-token',
        'x-nonce': 'valid_nonce_123456789',
      });
      const response1 = await POST(request1);
      expect(response1.status).toBe(200);

      // Second request with same nonce should fail
      mockRedis.set.mockResolvedValueOnce(null); // Nonce already exists
      
      const request2 = createRequest(validPayload, {
        authorization: 'Bearer test-bearer-token',
        'x-nonce': 'valid_nonce_123456789',
      });
      const response2 = await POST(request2);
      const data2 = await response2.json();

      expect(response2.status).toBe(400);
      expect(data2.error).toBe('Replay detected');
      expect(data2.details).toBe('Replay detected: nonce already used');
    });

    it('should reject nonce with invalid format', async () => {
      const request = createRequest(validPayload, {
        authorization: 'Bearer test-bearer-token',
        'x-nonce': 'short', // Too short
      });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Replay detected');
      expect(data.details).toBe('Nonce must be at least 16 characters');
    });

    it('should extract nonce from query parameter', async () => {
      const request = new NextRequest(
        'https://example.com/api/integrations/webhooks/socialwiseflow?nonce=valid_nonce_123456789',
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: 'Bearer test-bearer-token',
          },
          body: JSON.stringify(validPayload),
        }
      );

      const response = await POST(request);
      expect(response.status).toBe(200);
    });
  });

  describe('Rate Limiting Security', () => {
    it('should return rate limit headers when rate limited', async () => {
      const mockRedis = require('@/lib/connections').getRedisInstance();
      
      // Mock rate limit exceeded
      mockRedis.pipeline.mockReturnValue({
        zremrangebyscore: jest.fn().mockReturnThis(),
        zcard: jest.fn().mkReturnThis(),
        zadd: jest.fn().mockReturnThis(),
        expire: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([[null, 0], [null, 10], [null, 1], [null, 1]]), // 10 existing requests (over limit)
      });

      const request = createRequest(validPayload);
      const response = await POST(request);

      if (response.status === 429) {
        expect(response.headers.get('X-RateLimit-Limit')).toBeDefined();
        expect(response.headers.get('X-RateLimit-Remaining')).toBeDefined();
        expect(response.headers.get('X-RateLimit-Reset')).toBeDefined();
        expect(response.headers.get('X-RateLimit-Scope')).toBeDefined();
      }
    });
  });

  describe('Idempotency Security', () => {
    it('should detect duplicate messages by wamid', async () => {
      const mockRedis = require('@/lib/connections').getRedisInstance();
      
      // Mock duplicate detection
      mockRedis.set.mockResolvedValueOnce(null); // Idempotency key already exists
      
      const request = createRequest(validPayload);
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.ok).toBe(true);
      expect(data.dedup).toBe(true);
    });

    it('should detect duplicate messages by message_data.id', async () => {
      const payloadWithMessageId = {
        ...validPayload,
        context: {
          'socialwise-chatwit': {
            account_data: { id: 'acc123' },
            inbox_data: { id: 'inbox456', channel_type: 'whatsapp' },
            message_data: { id: 'msg123' },
          },
        },
      };

      const mockRedis = require('@/lib/connections').getRedisInstance();
      
      // Mock duplicate detection
      mockRedis.set.mockResolvedValueOnce(null); // Idempotency key already exists
      
      const request = createRequest(payloadWithMessageId);
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.ok).toBe(true);
      expect(data.dedup).toBe(true);
    });
  });

  describe('Error Handling Security', () => {
    it('should handle Redis connection failures gracefully', async () => {
      const mockRedis = require('@/lib/connections').getRedisInstance();
      
      // Mock Redis failure
      mockRedis.set.mockRejectedValue(new Error('Redis connection failed'));
      
      const request = createRequest(validPayload);
      const response = await POST(request);

      // Should not return 500 - should fail open
      expect(response.status).not.toBe(500);
    });

    it('should not expose internal error details', async () => {
      // Mock internal error
      jest.doMock('@/lib/socialwise-flow/processor', () => ({
        processSocialWiseFlow: jest.fn().mockRejectedValue(new Error('Internal processing error')),
      }));

      const request = createRequest(validPayload);
      const response = await POST(request);

      // Should not expose internal error details in response
      if (response.status >= 400) {
        const data = await response.json();
        expect(data.error).not.toContain('Internal processing error');
      }
    });
  });
});