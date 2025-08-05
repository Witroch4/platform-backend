/**
 * Unit tests for Rate Limiter Service
 * Tests rate limiting logic and Redis integration
 */

import { RateLimiterService } from '@/lib/ai-integration/services/rate-limiter';
import { Redis } from 'ioredis';
import { RateLimitConfig } from '@/lib/ai-integration/types/webhook';

// Mock Redis
jest.mock('ioredis');

describe('RateLimiterService', () => {
  let rateLimiter: RateLimiterService;
  let mockRedis: jest.Mocked<Redis>;
  let mockConfig: RateLimitConfig;

  beforeEach(() => {
    mockRedis = {
      pipeline: jest.fn(),
      zremrangebyscore: jest.fn(),
      zadd: jest.fn(),
      zcard: jest.fn(),
      expire: jest.fn(),
      del: jest.fn(),
      get: jest.fn(),
      set: jest.fn(),
      incr: jest.fn(),
    } as any;

    mockConfig = {
      conversation: { limit: 10, window: 60 },
      account: { limit: 100, window: 3600 },
      contact: { limit: 20, window: 300 },
    };

    rateLimiter = new RateLimiterService(mockRedis, mockConfig);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('checkRateLimit', () => {
    it('should allow request when under all limits', async () => {
      const mockPipeline = {
        zremrangebyscore: jest.fn().mockReturnThis(),
        zadd: jest.fn().mockReturnThis(),
        zcard: jest.fn().mockReturnThis(),
        expire: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([
          [null, 0], // zremrangebyscore result
          [null, 1], // zadd result
          [null, 5], // zcard result (5 requests in window)
          [null, 1], // expire result
        ]),
      };

      mockRedis.pipeline.mockReturnValue(mockPipeline as any);

      const result = await rateLimiter.checkRateLimit('123', '456', '789');

      expect(result.allowed).toBe(true);
      expect(result.scope).toBe('conversation');
      expect(result.remaining).toBe(5); // 10 - 5
    });

    it('should reject when conversation limit exceeded', async () => {
      const mockPipeline = {
        zremrangebyscore: jest.fn().mockReturnThis(),
        zadd: jest.fn().mockReturnThis(),
        zcard: jest.fn().mockReturnThis(),
        expire: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([
          [null, 0], // zremrangebyscore result
          [null, 1], // zadd result
          [null, 10], // zcard result (10 requests in window - at limit)
          [null, 1], // expire result
        ]),
      };

      mockRedis.pipeline.mockReturnValue(mockPipeline as any);

      const result = await rateLimiter.checkRateLimit('123', '456', '789');

      expect(result.allowed).toBe(false);
      expect(result.scope).toBe('conversation');
      expect(result.remaining).toBe(0);
    });

    it('should reject when account limit exceeded', async () => {
      // First pipeline (conversation) - allowed
      const mockPipeline1 = {
        zremrangebyscore: jest.fn().mockReturnThis(),
        zadd: jest.fn().mockReturnThis(),
        zcard: jest.fn().mockReturnThis(),
        expire: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([
          [null, 0], [null, 1], [null, 5], [null, 1], // conversation allowed
        ]),
      };

      // Second pipeline (contact) - allowed
      const mockPipeline2 = {
        zremrangebyscore: jest.fn().mockReturnThis(),
        zadd: jest.fn().mockReturnThis(),
        zcard: jest.fn().mockReturnThis(),
        expire: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([
          [null, 0], [null, 1], [null, 10], [null, 1], // contact allowed
        ]),
      };

      // Third pipeline (account) - rejected
      const mockPipeline3 = {
        zremrangebyscore: jest.fn().mockReturnThis(),
        zadd: jest.fn().mockReturnThis(),
        zcard: jest.fn().mockReturnThis(),
        expire: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([
          [null, 0], [null, 1], [null, 100], [null, 1], // account at limit
        ]),
      };

      mockRedis.pipeline
        .mockReturnValueOnce(mockPipeline1 as any)
        .mockReturnValueOnce(mockPipeline2 as any)
        .mockReturnValueOnce(mockPipeline3 as any);

      const result = await rateLimiter.checkRateLimit('123', '456', '789');

      expect(result.allowed).toBe(false);
      expect(result.scope).toBe('account');
      expect(result.remaining).toBe(0);
    });

    it('should reject when contact limit exceeded', async () => {
      // First pipeline (conversation) - allowed
      const mockPipeline1 = {
        zremrangebyscore: jest.fn().mockReturnThis(),
        zadd: jest.fn().mockReturnThis(),
        zcard: jest.fn().mockReturnThis(),
        expire: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([
          [null, 0], [null, 1], [null, 5], [null, 1], // conversation allowed
        ]),
      };

      // Second pipeline (contact) - rejected
      const mockPipeline2 = {
        zremrangebyscore: jest.fn().mockReturnThis(),
        zadd: jest.fn().mockReturnThis(),
        zcard: jest.fn().mockReturnThis(),
        expire: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([
          [null, 0], [null, 1], [null, 20], [null, 1], // contact at limit
        ]),
      };

      mockRedis.pipeline
        .mockReturnValueOnce(mockPipeline1 as any)
        .mockReturnValueOnce(mockPipeline2 as any);

      const result = await rateLimiter.checkRateLimit('123', '456', '789');

      expect(result.allowed).toBe(false);
      expect(result.scope).toBe('contact');
      expect(result.remaining).toBe(0);
    });

    it('should handle Redis errors gracefully', async () => {
      const mockPipeline = {
        zremrangebyscore: jest.fn().mockReturnThis(),
        zadd: jest.fn().mockReturnThis(),
        zcard: jest.fn().mockReturnThis(),
        expire: jest.fn().mockReturnThis(),
        exec: jest.fn().mockRejectedValue(new Error('Redis connection failed')),
      };

      mockRedis.pipeline.mockReturnValue(mockPipeline as any);

      // Should allow request when Redis fails (fail-open)
      const result = await rateLimiter.checkRateLimit('123', '456', '789');

      expect(result.allowed).toBe(true);
      expect(result.scope).toBe('conversation');
    });

    it('should generate correct Redis keys', async () => {
      const mockPipeline = {
        zremrangebyscore: jest.fn().mockReturnThis(),
        zadd: jest.fn().mockReturnThis(),
        zcard: jest.fn().mockReturnThis(),
        expire: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([
          [null, 0], [null, 1], [null, 5], [null, 1],
        ]),
      };

      mockRedis.pipeline.mockReturnValue(mockPipeline as any);

      await rateLimiter.checkRateLimit('123', '456', '789');

      expect(mockPipeline.zremrangebyscore).toHaveBeenCalledWith('rl:conversation:123', '-inf', expect.any(Number));
      expect(mockPipeline.zadd).toHaveBeenCalledWith('rl:conversation:123', expect.any(Number), expect.any(String));
    });

    it('should set TTL for new keys', async () => {
      const mockPipeline = {
        zremrangebyscore: jest.fn().mockReturnThis(),
        zadd: jest.fn().mockReturnThis(),
        zcard: jest.fn().mockReturnThis(),
        expire: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([
          [null, 0], [null, 1], [null, 5], [null, 1],
        ]),
      };

      mockRedis.pipeline.mockReturnValue(mockPipeline as any);

      await rateLimiter.checkRateLimit('123', '456', '789');

      expect(mockPipeline.expire).toHaveBeenCalledWith('rl:conversation:123', 60);
    });
  });

  describe('getRateLimitStatus', () => {
    it('should return remaining requests for each scope', async () => {
      const mockPipeline = {
        zremrangebyscore: jest.fn().mockReturnThis(),
        zcard: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([
          [null, 0], // zremrangebyscore result
          [null, 5], // zcard result
        ]),
      };

      mockRedis.pipeline.mockReturnValue(mockPipeline as any);

      const result = await rateLimiter.getRateLimitStatus('conversation', '123', { limit: 10, window: 60 });

      expect(result.limit).toBe(10);
      expect(result.remaining).toBe(5);
      expect(result.scope).toBe('conversation');
    });

    it('should return full limits when no usage recorded', async () => {
      const mockPipeline = {
        zremrangebyscore: jest.fn().mockReturnThis(),
        zcard: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([
          [null, 0], // zremrangebyscore result
          [null, 0], // zcard result (no usage)
        ]),
      };

      mockRedis.pipeline.mockReturnValue(mockPipeline as any);

      const result = await rateLimiter.getRateLimitStatus('conversation', '123', { limit: 10, window: 60 });

      expect(result.limit).toBe(10);
      expect(result.remaining).toBe(10); // Full limit available
    });
  });

  describe('resetRateLimit', () => {
    it('should reset limits for specific scope', async () => {
      mockRedis.del = jest.fn().mockResolvedValue(1);

      await rateLimiter.resetRateLimit('conversation', '123');

      expect(mockRedis.del).toHaveBeenCalledWith('rl:conversation:123');
    });

    it('should reset all limits for account', async () => {
      mockRedis.del = jest.fn().mockResolvedValue(1);

      await rateLimiter.resetRateLimit('account', '456');

      expect(mockRedis.del).toHaveBeenCalledWith('rl:account:456');
    });
  });
});