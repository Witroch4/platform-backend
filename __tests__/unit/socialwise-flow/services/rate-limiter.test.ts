/**
 * Unit tests for SocialWise Flow Rate Limiter Service
 */

import { SocialWiseRateLimiterService } from '@/lib/socialwise-flow/services/rate-limiter';
import { SocialWiseFlowPayloadType } from '@/lib/socialwise-flow/schemas/payload';

// Mock Redis
const mockRedis = {
  pipeline: jest.fn(),
  zremrangebyscore: jest.fn(),
  zcard: jest.fn(),
  zadd: jest.fn(),
  expire: jest.fn(),
  exec: jest.fn(),
};

// Mock pipeline
const mockPipeline = {
  zremrangebyscore: jest.fn().mockReturnThis(),
  zcard: jest.fn().mockReturnThis(),
  zadd: jest.fn().mockReturnThis(),
  expire: jest.fn().mockReturnThis(),
  exec: jest.fn(),
};

// Mock connections and rate limit config
jest.mock('@/lib/connections', () => ({
  getRedisInstance: () => mockRedis,
}));

jest.mock('@/lib/ai-integration/services/rate-limiter', () => ({
  parseRateLimitConfig: () => ({
    conversation: { limit: 8, window: 10 },
    account: { limit: 80, window: 10 },
    contact: { limit: 15, window: 10 },
  }),
  RateLimiterService: class MockRateLimiterService {
    constructor(redis: any, config: any) {}
    
    async checkRateLimit(conversationId: string, accountId: string, contactId: string, clientIp?: string) {
      return {
        allowed: true,
        scope: 'conversation' as const,
        limit: 8,
        remaining: 7,
        resetTime: Date.now() + 10000,
      };
    }

    async checkScopeLimit(scope: string, identifier: string, config: { limit: number; window: number }) {
      return {
        allowed: true,
        scope: scope as any,
        limit: config.limit,
        remaining: config.limit - 1,
        resetTime: Date.now() + (config.window * 1000),
      };
    }
  },
}));

describe('SocialWiseRateLimiterService', () => {
  let service: SocialWiseRateLimiterService;

  beforeEach(() => {
    service = new SocialWiseRateLimiterService();
    jest.clearAllMocks();
    mockRedis.pipeline.mockReturnValue(mockPipeline);
  });

  describe('extractRateLimitContext', () => {
    it('should extract rate limit context from payload and request', () => {
      const payload: SocialWiseFlowPayloadType = {
        session_id: 'session123',
        message: 'Hello',
        channel_type: 'whatsapp',
        context: {
          'socialwise-chatwit': {
            account_data: { id: 'acc123' },
            inbox_data: { id: 'inbox456', channel_type: 'whatsapp' },
            wamid: 'wamid789',
          },
        },
      };

      const request = new Request('https://example.com', {
        headers: {
          'x-forwarded-for': '192.168.1.1',
          'user-agent': 'Mozilla/5.0',
        },
      });

      const context = service.extractRateLimitContext(payload, request);

      expect(context).toEqual({
        accountId: 'acc123',
        inboxId: 'inbox456',
        sessionId: 'session123',
        clientIp: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
      });
    });

    it('should handle missing headers gracefully', () => {
      const payload: SocialWiseFlowPayloadType = {
        session_id: 'session123',
        message: 'Hello',
        channel_type: 'whatsapp',
        context: {
          'socialwise-chatwit': {
            account_data: { id: 'acc123' },
            inbox_data: { id: 'inbox456', channel_type: 'whatsapp' },
            wamid: 'wamid789',
          },
        },
      };

      const request = new Request('https://example.com');

      const context = service.extractRateLimitContext(payload, request);

      expect(context).toEqual({
        accountId: 'acc123',
        inboxId: 'inbox456',
        sessionId: 'session123',
        clientIp: 'unknown',
        userAgent: 'unknown',
      });
    });

    it('should prefer x-forwarded-for over x-real-ip', () => {
      const payload: SocialWiseFlowPayloadType = {
        session_id: 'session123',
        message: 'Hello',
        channel_type: 'whatsapp',
        context: {
          'socialwise-chatwit': {
            account_data: { id: 'acc123' },
            inbox_data: { id: 'inbox456', channel_type: 'whatsapp' },
            wamid: 'wamid789',
          },
        },
      };

      const request = new Request('https://example.com', {
        headers: {
          'x-forwarded-for': '192.168.1.1',
          'x-real-ip': '10.0.0.1',
          'cf-connecting-ip': '172.16.0.1',
        },
      });

      const context = service.extractRateLimitContext(payload, request);

      expect(context.clientIp).toBe('192.168.1.1');
    });
  });

  describe('checkSocialWiseRateLimit', () => {
    it('should check rate limits with SocialWise context', async () => {
      const context = {
        accountId: 'acc123',
        inboxId: 'inbox456',
        sessionId: 'session123',
        clientIp: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
      };

      const result = await service.checkSocialWiseRateLimit(context);

      expect(result).toEqual({
        allowed: true,
        scope: 'conversation',
        limit: 8,
        remaining: 7,
        resetTime: expect.any(Number),
      });
    });
  });

  describe('checkPayloadRateLimit', () => {
    it('should check rate limits for complete payload', async () => {
      const payload: SocialWiseFlowPayloadType = {
        session_id: 'session123',
        message: 'Hello',
        channel_type: 'whatsapp',
        context: {
          'socialwise-chatwit': {
            account_data: { id: 'acc123' },
            inbox_data: { id: 'inbox456', channel_type: 'whatsapp' },
            wamid: 'wamid789',
          },
        },
      };

      const request = new Request('https://example.com', {
        headers: {
          'x-forwarded-for': '192.168.1.1',
        },
      });

      const result = await service.checkPayloadRateLimit(payload, request);

      expect(result).toEqual({
        allowed: true,
        scope: 'conversation',
        limit: 8,
        remaining: 7,
        resetTime: expect.any(Number),
      });
    });
  });

  describe('getSocialWiseRateLimitConfig', () => {
    it('should return default configuration', () => {
      const config = SocialWiseRateLimiterService.getSocialWiseRateLimitConfig();

      expect(config).toEqual({
        inbox: { limit: 20, window: 60 },
        session: { limit: 10, window: 60 },
        account: { limit: 100, window: 60 },
        ip: { limit: 200, window: 60 },
      });
    });

    it('should use environment variables when available', () => {
      const originalEnv = process.env;
      process.env = {
        ...originalEnv,
        SW_RL_INBOX_LIMIT: '30',
        SW_RL_INBOX_WINDOW: '120',
        SW_RL_SESSION_LIMIT: '15',
        SW_RL_SESSION_WINDOW: '90',
      };

      const config = SocialWiseRateLimiterService.getSocialWiseRateLimitConfig();

      expect(config).toEqual({
        inbox: { limit: 30, window: 120 },
        session: { limit: 15, window: 90 },
        account: { limit: 100, window: 60 }, // Default values
        ip: { limit: 200, window: 60 },
      });

      process.env = originalEnv;
    });
  });
});