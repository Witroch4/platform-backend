/**
 * Rate Limiting Integration Tests
 * Tests integration with existing rate limiting services and cache-based rate limiting
 */

import { SocialWiseFlowCacheManager } from '../cache-manager';
import { CacheKeyConfig } from '../cache-key-builder';

// Mock Redis for rate limiting integration
const mockRedis = {
  get: jest.fn(),
  set: jest.fn(),
  setex: jest.fn(),
  del: jest.fn(),
  exists: jest.fn(),
  mget: jest.fn(),
  keys: jest.fn(),
  pipeline: jest.fn(),
  ping: jest.fn(),
  info: jest.fn(),
  zremrangebyscore: jest.fn(),
  zcard: jest.fn(),
  zadd: jest.fn(),
  expire: jest.fn(),
};

describe('Rate Limiting Integration with Existing Services', () => {
  let cacheManager: SocialWiseFlowCacheManager;
  
  const mockConfig: CacheKeyConfig = {
    accountId: '123',
    inboxId: '456',
    agentId: '789',
    model: 'gpt-4o-mini',
    promptVersion: 'v1.2',
    channelType: 'whatsapp',
    embedipreview: true,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    cacheManager = new SocialWiseFlowCacheManager(mockRedis as any);
    process.env.NODE_ENV = 'test';
  });

  afterEach(() => {
    delete process.env.NODE_ENV;
  });

  describe('Sliding Window Rate Limiting', () => {
    it('should implement accurate sliding window algorithm', async () => {
      const identifier = 'user-sliding-window-test';
      const limit = 5;
      const windowSeconds = 60;
      const now = Date.now();
      
      // Mock Redis operations for sliding window
      mockRedis.zremrangebyscore.mockImplementation((key, min, max) => {
        // Simulate removing old entries
        expect(min).toBe(0);
        expect(max).toBeLessThanOrEqual(now);
        return Promise.resolve(2); // Removed 2 old entries
      });
      
      mockRedis.zcard.mockResolvedValue(3); // Current count after cleanup
      mockRedis.zadd.mockResolvedValue(1);
      mockRedis.expire.mockResolvedValue(1);
      
      const result = await cacheManager.checkRateLimit(mockConfig, identifier, limit, windowSeconds);
      
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(1); // 5 - 3 - 1 = 1
      expect(result.resetTime).toBeGreaterThan(now);
      
      // Verify sliding window operations
      expect(mockRedis.zremrangebyscore).toHaveBeenCalledWith(
        expect.stringContaining(':rate:'),
        0,
        expect.any(Number)
      );
      
      expect(mockRedis.zadd).toHaveBeenCalledWith(
        expect.stringContaining(':rate:'),
        expect.any(Number),
        expect.stringMatching(/^\d+-0\.\d+$/) // timestamp-random format
      );
      
      expect(mockRedis.expire).toHaveBeenCalledWith(
        expect.stringContaining(':rate:'),
        windowSeconds
      );
    });

    it('should handle burst traffic correctly', async () => {
      const identifier = 'user-burst-test';
      const limit = 10;
      const windowSeconds = 60;
      
      // Simulate burst of requests
      let currentCount = 0;
      mockRedis.zremrangebyscore.mockResolvedValue(0);
      mockRedis.zcard.mockImplementation(() => {
        return Promise.resolve(currentCount++);
      });
      mockRedis.zadd.mockResolvedValue(1);
      mockRedis.expire.mockResolvedValue(1);
      
      const burstSize = 15; // More than limit
      const results = await Promise.all(
        Array.from({ length: burstSize }, () =>
          cacheManager.checkRateLimit(mockConfig, identifier, limit, windowSeconds)
        )
      );
      
      // First 10 should be allowed, rest denied
      const allowedCount = results.filter(r => r.allowed).length;
      const deniedCount = results.filter(r => !r.allowed).length;
      
      expect(allowedCount).toBe(10);
      expect(deniedCount).toBe(5);
      
      // Check remaining counts decrease correctly
      const allowedResults = results.filter(r => r.allowed);
      for (let i = 0; i < allowedResults.length; i++) {
        expect(allowedResults[i].remaining).toBe(limit - i - 1);
      }
    });

    it('should handle different window sizes correctly', async () => {
      const identifier = 'user-window-test';
      const limit = 5;
      const testCases = [
        { windowSeconds: 30, expectedExpire: 30 },
        { windowSeconds: 60, expectedExpire: 60 },
        { windowSeconds: 300, expectedExpire: 300 }, // 5 minutes
        { windowSeconds: 3600, expectedExpire: 3600 }, // 1 hour
      ];
      
      mockRedis.zremrangebyscore.mockResolvedValue(0);
      mockRedis.zcard.mockResolvedValue(0);
      mockRedis.zadd.mockResolvedValue(1);
      mockRedis.expire.mockResolvedValue(1);
      
      for (const testCase of testCases) {
        await cacheManager.checkRateLimit(mockConfig, identifier, limit, testCase.windowSeconds);
        
        expect(mockRedis.expire).toHaveBeenCalledWith(
          expect.any(String),
          testCase.expectedExpire
        );
      }
    });
  });

  describe('Rate Limiting with Different Identifiers', () => {
    it('should isolate rate limits by user identifier', async () => {
      const users = ['user-a', 'user-b', 'user-c'];
      const limit = 3;
      const windowSeconds = 60;
      
      mockRedis.zremrangebyscore.mockResolvedValue(0);
      mockRedis.zcard.mockResolvedValue(0);
      mockRedis.zadd.mockResolvedValue(1);
      mockRedis.expire.mockResolvedValue(1);
      
      // Each user should have independent rate limits
      for (const user of users) {
        const results = await Promise.all([
          cacheManager.checkRateLimit(mockConfig, user, limit, windowSeconds),
          cacheManager.checkRateLimit(mockConfig, user, limit, windowSeconds),
          cacheManager.checkRateLimit(mockConfig, user, limit, windowSeconds),
        ]);
        
        // All should be allowed for each user independently
        results.forEach(result => expect(result.allowed).toBe(true));
      }
      
      // Verify separate cache keys were used
      const zremCalls = mockRedis.zremrangebyscore.mock.calls;
      const cacheKeys = zremCalls.map(call => call[0]);
      const uniqueKeys = new Set(cacheKeys);
      
      expect(uniqueKeys.size).toBe(users.length); // One unique key per user
    });

    it('should handle IP-based rate limiting', async () => {
      const ipAddresses = ['192.168.1.1', '10.0.0.1', '172.16.0.1'];
      const limit = 5;
      const windowSeconds = 60;
      
      mockRedis.zremrangebyscore.mockResolvedValue(0);
      mockRedis.zcard.mockResolvedValue(0);
      mockRedis.zadd.mockResolvedValue(1);
      mockRedis.expire.mockResolvedValue(1);
      
      for (const ip of ipAddresses) {
        const result = await cacheManager.checkRateLimit(mockConfig, ip, limit, windowSeconds);
        expect(result.allowed).toBe(true);
      }
      
      // Verify IP addresses are hashed in cache keys (no PII exposure)
      const zremCalls = mockRedis.zremrangebyscore.mock.calls;
      const cacheKeys = zremCalls.map(call => call[0]);
      
      cacheKeys.forEach(key => {
        ipAddresses.forEach(ip => {
          expect(key).not.toContain(ip); // IP should not appear in cache key
        });
        expect(key).toMatch(/^sw:test:acc123:inb456:agt789:ms:gpt-4o-mini:pv1\.2:chan:whatsapp:ep:true:rate:[a-f0-9]{16}$/);
      });
    });

    it('should handle session-based rate limiting', async () => {
      const sessionIds = [
        'sess_abc123def456',
        'sess_xyz789uvw012',
        'sess_mno345pqr678',
      ];
      const limit = 10;
      const windowSeconds = 300; // 5 minutes
      
      mockRedis.zremrangebyscore.mockResolvedValue(0);
      mockRedis.zcard.mockResolvedValue(2); // Some existing requests
      mockRedis.zadd.mockResolvedValue(1);
      mockRedis.expire.mockResolvedValue(1);
      
      for (const sessionId of sessionIds) {
        const result = await cacheManager.checkRateLimit(mockConfig, sessionId, limit, windowSeconds);
        
        expect(result.allowed).toBe(true);
        expect(result.remaining).toBe(7); // 10 - 2 - 1 = 7
      }
    });
  });

  describe('Rate Limiting Error Handling', () => {
    it('should fail open on Redis connection errors', async () => {
      const identifier = 'user-connection-error';
      const limit = 5;
      const windowSeconds = 60;
      
      mockRedis.zremrangebyscore.mockRejectedValue(new Error('ECONNREFUSED'));
      
      const result = await cacheManager.checkRateLimit(mockConfig, identifier, limit, windowSeconds);
      
      expect(result.allowed).toBe(true); // Fail open
      expect(result.remaining).toBe(0);
      expect(result.resetTime).toBeGreaterThan(Date.now() - 1000); // Recent timestamp
      
      const stats = cacheManager.getStats();
      expect(stats.errors).toBe(1);
    });

    it('should handle Redis timeout errors gracefully', async () => {
      const identifier = 'user-timeout-error';
      const limit = 5;
      const windowSeconds = 60;
      
      mockRedis.zremrangebyscore.mockImplementation(() => {
        return new Promise((_, reject) => {
          setTimeout(() => reject(new Error('ETIMEDOUT')), 100);
        });
      });
      
      const result = await cacheManager.checkRateLimit(mockConfig, identifier, limit, windowSeconds);
      
      expect(result.allowed).toBe(true); // Fail open
      
      const stats = cacheManager.getStats();
      expect(stats.errors).toBe(1);
    });

    it('should handle partial Redis operation failures', async () => {
      const identifier = 'user-partial-failure';
      const limit = 5;
      const windowSeconds = 60;
      
      // zremrangebyscore succeeds, but zcard fails
      mockRedis.zremrangebyscore.mockResolvedValue(1);
      mockRedis.zcard.mockRejectedValue(new Error('Redis operation failed'));
      
      const result = await cacheManager.checkRateLimit(mockConfig, identifier, limit, windowSeconds);
      
      expect(result.allowed).toBe(true); // Fail open
      
      const stats = cacheManager.getStats();
      expect(stats.errors).toBe(1);
    });
  });

  describe('Rate Limiting Performance', () => {
    it('should handle high-throughput rate limiting efficiently', async () => {
      const userCount = 100;
      const requestsPerUser = 5;
      const limit = 10;
      const windowSeconds = 60;
      
      mockRedis.zremrangebyscore.mockResolvedValue(0);
      mockRedis.zcard.mockImplementation(() => {
        // Simulate increasing count
        return Promise.resolve(Math.floor(Math.random() * 3));
      });
      mockRedis.zadd.mockResolvedValue(1);
      mockRedis.expire.mockResolvedValue(1);
      
      const startTime = Date.now();
      
      const allRequests = [];
      for (let userId = 0; userId < userCount; userId++) {
        for (let req = 0; req < requestsPerUser; req++) {
          allRequests.push(
            cacheManager.checkRateLimit(mockConfig, `user-${userId}`, limit, windowSeconds)
          );
        }
      }
      
      const results = await Promise.all(allRequests);
      const endTime = Date.now();
      
      const duration = endTime - startTime;
      const totalRequests = userCount * requestsPerUser;
      
      // Should handle 500 requests reasonably quickly (less than 5 seconds)
      expect(duration).toBeLessThan(5000);
      
      // Most requests should be allowed (since we're under the limit)
      const allowedCount = results.filter(r => r.allowed).length;
      expect(allowedCount).toBeGreaterThan(totalRequests * 0.8); // At least 80% allowed
      
      console.log(`Processed ${totalRequests} rate limit checks in ${duration}ms`);
      console.log(`Average: ${(duration / totalRequests).toFixed(2)}ms per request`);
    });

    it('should minimize Redis operations for rate limiting', async () => {
      const identifier = 'user-optimization-test';
      const limit = 5;
      const windowSeconds = 60;
      
      mockRedis.zremrangebyscore.mockResolvedValue(0);
      mockRedis.zcard.mockResolvedValue(2);
      mockRedis.zadd.mockResolvedValue(1);
      mockRedis.expire.mockResolvedValue(1);
      
      await cacheManager.checkRateLimit(mockConfig, identifier, limit, windowSeconds);
      
      // Should use exactly 4 Redis operations for allowed request:
      // 1. zremrangebyscore (cleanup)
      // 2. zcard (count)
      // 3. zadd (add new entry)
      // 4. expire (set TTL)
      expect(mockRedis.zremrangebyscore).toHaveBeenCalledTimes(1);
      expect(mockRedis.zcard).toHaveBeenCalledTimes(1);
      expect(mockRedis.zadd).toHaveBeenCalledTimes(1);
      expect(mockRedis.expire).toHaveBeenCalledTimes(1);
    });
  });

  describe('Integration with Existing Rate Limiting Services', () => {
    it('should complement existing rate limiting without conflicts', async () => {
      // Simulate existing rate limiting service
      const existingRateLimitCheck = jest.fn().mockResolvedValue({ allowed: true });
      
      const identifier = 'user-integration-test';
      const limit = 5;
      const windowSeconds = 60;
      
      mockRedis.zremrangebyscore.mockResolvedValue(0);
      mockRedis.zcard.mockResolvedValue(1);
      mockRedis.zadd.mockResolvedValue(1);
      mockRedis.expire.mockResolvedValue(1);
      
      // Check both existing and new rate limiting
      const existingResult = await existingRateLimitCheck(identifier);
      const newResult = await cacheManager.checkRateLimit(mockConfig, identifier, limit, windowSeconds);
      
      expect(existingResult.allowed).toBe(true);
      expect(newResult.allowed).toBe(true);
      
      // Both systems should be independent
      expect(existingRateLimitCheck).toHaveBeenCalledWith(identifier);
    });

    it('should provide detailed rate limiting information for monitoring', async () => {
      const identifier = 'user-monitoring-test';
      const limit = 10;
      const windowSeconds = 300;
      
      mockRedis.zremrangebyscore.mockResolvedValue(2); // Cleaned up 2 old entries
      mockRedis.zcard.mockResolvedValue(7); // Current count
      mockRedis.zadd.mockResolvedValue(1);
      mockRedis.expire.mockResolvedValue(1);
      
      const result = await cacheManager.checkRateLimit(mockConfig, identifier, limit, windowSeconds);
      
      // Should provide comprehensive rate limiting information
      expect(result).toEqual({
        allowed: true,
        remaining: 2, // 10 - 7 - 1
        resetTime: expect.any(Number),
      });
      
      expect(result.resetTime).toBeGreaterThan(Date.now());
      expect(result.resetTime).toBeLessThanOrEqual(Date.now() + (windowSeconds * 1000));
    });
  });
});