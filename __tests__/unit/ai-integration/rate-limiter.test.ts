/**
 * Unit tests for Rate Limiter
 */

import { RateLimiter } from '../../../lib/ai-integration/services/rate-limiter';
import { getRedisInstance } from '../../../lib/connections';

// Mock Redis
jest.mock('../../../lib/connections');

const mockRedis = {
  pipeline: jest.fn(),
  zremrangebyscore: jest.fn(),
  zcard: jest.fn(),
  zadd: jest.fn(),
  expire: jest.fn(),
  zrem: jest.fn(),
  del: jest.fn(),
};

const mockPipeline = {
  zremrangebyscore: jest.fn().mockReturnThis(),
  zcard: jest.fn().mockReturnThis(),
  zadd: jest.fn().mockReturnThis(),
  expire: jest.fn().mockReturnThis(),
  exec: jest.fn(),
  del: jest.fn().mockReturnThis(),
};

(getRedisInstance as jest.Mock).mockReturnValue(mockRedis);

// Mock environment variables
const originalEnv = process.env;

describe('RateLimiter', () => {
  let rateLimiter: RateLimiter;

  beforeEach(() => {
    jest.clearAllMocks();
    mockRedis.pipeline.mockReturnValue(mockPipeline);
    
    // Reset environment variables
    process.env = { ...originalEnv };
    delete process.env.RL_CONV;
    delete process.env.RL_ACC;
    delete process.env.RL_CONTACT;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('configuration loading', () => {
    it('should use default configuration when no env vars are set', () => {
      rateLimiter = new RateLimiter();
      const config = rateLimiter.getConfig();

      expect(config).toEqual({
        conversation: { requests: 8, windowSeconds: 10 },
        account: { requests: 80, windowSeconds: 10 },
        contact: { requests: 15, windowSeconds: 10 },
      });
    });

    it('should parse environment variables correctly', () => {
      process.env.RL_CONV = '5/15s';
      process.env.RL_ACC = '100/20s';
      process.env.RL_CONTACT = '20/30s';

      rateLimiter = new RateLimiter();
      const config = rateLimiter.getConfig();

      expect(config).toEqual({
        conversation: { requests: 5, windowSeconds: 15 },
        account: { requests: 100, windowSeconds: 20 },
        contact: { requests: 20, windowSeconds: 30 },
      });
    });

    it('should use defaults for invalid environment variables', () => {
      process.env.RL_CONV = 'invalid';
      process.env.RL_ACC = '100'; // missing time unit
      process.env.RL_CONTACT = '20/30m'; // wrong time unit

      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      rateLimiter = new RateLimiter();
      const config = rateLimiter.getConfig();

      expect(config).toEqual({
        conversation: { requests: 8, windowSeconds: 10 },
        account: { requests: 80, windowSeconds: 10 },
        contact: { requests: 15, windowSeconds: 10 },
      });

      expect(consoleSpy).toHaveBeenCalledTimes(3);
      consoleSpy.mockRestore();
    });

    it('should allow configuration overrides', () => {
      rateLimiter = new RateLimiter({
        conversation: { requests: 12, windowSeconds: 5 },
        account: { requests: 200, windowSeconds: 15 },
      });

      const config = rateLimiter.getConfig();

      expect(config).toEqual({
        conversation: { requests: 12, windowSeconds: 5 },
        account: { requests: 200, windowSeconds: 15 },
        contact: { requests: 15, windowSeconds: 10 }, // default
      });
    });
  });

  describe('key generation', () => {
    beforeEach(() => {
      rateLimiter = new RateLimiter();
    });

    it('should generate correct keys for different scopes', async () => {
      const params = {
        accountId: 1,
        conversationId: 123,
        contactId: 456,
      };

      mockPipeline.exec.mockResolvedValue([
        [null, 0], // zremrangebyscore
        [null, 0], // zcard
        [null, 1], // zadd
        [null, 1], // expire
      ]);

      await rateLimiter.checkLimits(params);

      // Check that correct keys were used
      expect(mockPipeline.zremrangebyscore).toHaveBeenCalledWith('rl:conv:1:123', 0, expect.any(Number));
      expect(mockPipeline.zcard).toHaveBeenCalledWith('rl:conv:1:123');
    });
  });

  describe('checkLimits', () => {
    beforeEach(() => {
      rateLimiter = new RateLimiter();
    });

    const testParams = {
      accountId: 1,
      conversationId: 123,
      contactId: 456,
    };

    it('should allow request when under all limits', async () => {
      // Mock pipeline results for all scopes (under limit)
      mockPipeline.exec
        .mockResolvedValueOnce([
          [null, 0], // zremrangebyscore
          [null, 5], // zcard (under limit of 8)
          [null, 1], // zadd
          [null, 1], // expire
        ])
        .mockResolvedValueOnce([
          [null, 0], // zremrangebyscore
          [null, 50], // zcard (under limit of 80)
          [null, 1], // zadd
          [null, 1], // expire
        ])
        .mockResolvedValueOnce([
          [null, 0], // zremrangebyscore
          [null, 10], // zcard (under limit of 15)
          [null, 1], // zadd
          [null, 1], // expire
        ]);

      const result = await rateLimiter.checkLimits(testParams);

      expect(result).toEqual({
        allowed: true,
        scope: 'conversation',
        remaining: 2, // 8 - 5 - 1
        resetTime: expect.any(Number),
        key: 'rl:conv:1:123',
      });
    });

    it('should reject request when conversation limit is exceeded', async () => {
      mockPipeline.exec.mockResolvedValueOnce([
        [null, 0], // zremrangebyscore
        [null, 8], // zcard (at limit of 8)
        [null, 1], // zadd
        [null, 1], // expire
      ]);

      mockRedis.zrem.mockResolvedValue(1);

      const result = await rateLimiter.checkLimits(testParams);

      expect(result).toEqual({
        allowed: false,
        scope: 'conversation',
        remaining: 0,
        resetTime: expect.any(Number),
        key: 'rl:conv:1:123',
      });

      // Should remove the request that was added
      expect(mockRedis.zrem).toHaveBeenCalled();
    });

    it('should reject request when account limit is exceeded', async () => {
      // Conversation limit passes
      mockPipeline.exec
        .mockResolvedValueOnce([
          [null, 0], // zremrangebyscore
          [null, 5], // zcard (under limit)
          [null, 1], // zadd
          [null, 1], // expire
        ])
        // Account limit fails
        .mockResolvedValueOnce([
          [null, 0], // zremrangebyscore
          [null, 80], // zcard (at limit of 80)
          [null, 1], // zadd
          [null, 1], // expire
        ]);

      mockRedis.zrem.mockResolvedValue(1);

      const result = await rateLimiter.checkLimits(testParams);

      expect(result).toEqual({
        allowed: false,
        scope: 'account',
        remaining: 0,
        resetTime: expect.any(Number),
        key: 'rl:acc:1',
      });
    });

    it('should reject request when contact limit is exceeded', async () => {
      // Conversation and account limits pass
      mockPipeline.exec
        .mockResolvedValueOnce([
          [null, 0], // zremrangebyscore
          [null, 5], // zcard (under limit)
          [null, 1], // zadd
          [null, 1], // expire
        ])
        .mockResolvedValueOnce([
          [null, 0], // zremrangebyscore
          [null, 50], // zcard (under limit)
          [null, 1], // zadd
          [null, 1], // expire
        ])
        // Contact limit fails
        .mockResolvedValueOnce([
          [null, 0], // zremrangebyscore
          [null, 15], // zcard (at limit of 15)
          [null, 1], // zadd
          [null, 1], // expire
        ]);

      mockRedis.zrem.mockResolvedValue(1);

      const result = await rateLimiter.checkLimits(testParams);

      expect(result).toEqual({
        allowed: false,
        scope: 'contact',
        remaining: 0,
        resetTime: expect.any(Number),
        key: 'rl:contact:1:456',
      });
    });

    it('should skip contact limit when contactId is not provided', async () => {
      const paramsWithoutContact = {
        accountId: 1,
        conversationId: 123,
      };

      mockPipeline.exec
        .mockResolvedValueOnce([
          [null, 0], // zremrangebyscore
          [null, 5], // zcard (under limit)
          [null, 1], // zadd
          [null, 1], // expire
        ])
        .mockResolvedValueOnce([
          [null, 0], // zremrangebyscore
          [null, 50], // zcard (under limit)
          [null, 1], // zadd
          [null, 1], // expire
        ]);

      const result = await rateLimiter.checkLimits(paramsWithoutContact);

      expect(result.allowed).toBe(true);
      // Should only check conversation and account, not contact
      expect(mockPipeline.exec).toHaveBeenCalledTimes(2);
    });

    it('should fail open on Redis error', async () => {
      mockPipeline.exec.mockRejectedValue(new Error('Redis connection failed'));

      const result = await rateLimiter.checkLimits(testParams);

      expect(result.allowed).toBe(true);
    });
  });

  describe('getCurrentUsage', () => {
    beforeEach(() => {
      rateLimiter = new RateLimiter();
    });

    const testParams = {
      accountId: 1,
      conversationId: 123,
      contactId: 456,
    };

    it('should return current usage for all scopes', async () => {
      mockRedis.zremrangebyscore.mockResolvedValue(0);
      mockRedis.zcard
        .mockResolvedValueOnce(5) // conversation
        .mockResolvedValueOnce(50) // account
        .mockResolvedValueOnce(10); // contact

      const usage = await rateLimiter.getCurrentUsage(testParams);

      expect(usage).toEqual({
        conversation: { current: 5, limit: 8, remaining: 3 },
        account: { current: 50, limit: 80, remaining: 30 },
        contact: { current: 10, limit: 15, remaining: 5 },
      });
    });

    it('should not include contact usage when contactId is not provided', async () => {
      const paramsWithoutContact = {
        accountId: 1,
        conversationId: 123,
      };

      mockRedis.zremrangebyscore.mockResolvedValue(0);
      mockRedis.zcard
        .mockResolvedValueOnce(5) // conversation
        .mockResolvedValueOnce(50); // account

      const usage = await rateLimiter.getCurrentUsage(paramsWithoutContact);

      expect(usage).toEqual({
        conversation: { current: 5, limit: 8, remaining: 3 },
        account: { current: 50, limit: 80, remaining: 30 },
      });
      expect(usage.contact).toBeUndefined();
    });

    it('should handle Redis errors gracefully', async () => {
      mockRedis.zremrangebyscore.mockRejectedValue(new Error('Redis error'));

      const usage = await rateLimiter.getCurrentUsage(testParams);

      expect(usage).toEqual({
        conversation: { current: 0, limit: 8, remaining: 8 },
        account: { current: 0, limit: 80, remaining: 80 },
        contact: { current: 0, limit: 15, remaining: 15 },
      });
    });
  });

  describe('resetLimits', () => {
    beforeEach(() => {
      rateLimiter = new RateLimiter();
    });

    const testParams = {
      accountId: 1,
      conversationId: 123,
      contactId: 456,
    };

    it('should reset all scopes by default', async () => {
      mockPipeline.exec.mockResolvedValue([]);

      await rateLimiter.resetLimits(testParams);

      expect(mockPipeline.del).toHaveBeenCalledWith('rl:conv:1:123');
      expect(mockPipeline.del).toHaveBeenCalledWith('rl:acc:1');
      expect(mockPipeline.del).toHaveBeenCalledWith('rl:contact:1:456');
    });

    it('should reset only specified scopes', async () => {
      mockPipeline.exec.mockResolvedValue([]);

      await rateLimiter.resetLimits(testParams, ['conversation', 'account']);

      expect(mockPipeline.del).toHaveBeenCalledWith('rl:conv:1:123');
      expect(mockPipeline.del).toHaveBeenCalledWith('rl:acc:1');
      expect(mockPipeline.del).not.toHaveBeenCalledWith('rl:contact:1:456');
    });

    it('should skip contact scope when contactId is not provided', async () => {
      const paramsWithoutContact = {
        accountId: 1,
        conversationId: 123,
      };

      mockPipeline.exec.mockResolvedValue([]);

      await rateLimiter.resetLimits(paramsWithoutContact);

      expect(mockPipeline.del).toHaveBeenCalledWith('rl:conv:1:123');
      expect(mockPipeline.del).toHaveBeenCalledWith('rl:acc:1');
      expect(mockPipeline.del).not.toHaveBeenCalledWith(expect.stringContaining('rl:contact'));
    });
  });

  describe('metrics callback', () => {
    beforeEach(() => {
      rateLimiter = new RateLimiter();
    });

    it('should call metrics callback when rate limit is hit', async () => {
      const metricsCallback = jest.fn();
      rateLimiter.setMetricsCallback(metricsCallback);

      mockPipeline.exec.mockResolvedValueOnce([
        [null, 0], // zremrangebyscore
        [null, 8], // zcard (at limit)
        [null, 1], // zadd
        [null, 1], // expire
      ]);

      mockRedis.zrem.mockResolvedValue(1);

      await rateLimiter.checkLimits({
        accountId: 1,
        conversationId: 123,
      });

      expect(metricsCallback).toHaveBeenCalledWith({
        scope: 'conversation',
        accountId: 1,
        hits: 1,
        timestamp: expect.any(Number),
      });
    });

    it('should not call metrics callback when request is allowed', async () => {
      const metricsCallback = jest.fn();
      rateLimiter.setMetricsCallback(metricsCallback);

      mockPipeline.exec.mockResolvedValueOnce([
        [null, 0], // zremrangebyscore
        [null, 5], // zcard (under limit)
        [null, 1], // zadd
        [null, 1], // expire
      ]);

      await rateLimiter.checkLimits({
        accountId: 1,
        conversationId: 123,
      });

      expect(metricsCallback).not.toHaveBeenCalled();
    });
  });

  describe('updateConfig', () => {
    beforeEach(() => {
      rateLimiter = new RateLimiter();
    });

    it('should update configuration partially', () => {
      rateLimiter.updateConfig({
        conversation: { requests: 12, windowSeconds: 5 },
      });

      const config = rateLimiter.getConfig();

      expect(config).toEqual({
        conversation: { requests: 12, windowSeconds: 5 },
        account: { requests: 80, windowSeconds: 10 }, // unchanged
        contact: { requests: 15, windowSeconds: 10 }, // unchanged
      });
    });
  });
});