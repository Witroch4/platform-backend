/**
 * Security Tests for Idempotency and Anti-Replay Protection
 * Tests WAMID-based idempotency, nonce-based replay protection, and rate limiting
 */

import { 
  SocialWiseFlowCacheManager,
  checkMessageIdempotency,
  setMessageIdempotency,
  checkAntiReplayNonce,
  setAntiReplayNonce
} from '../cache-manager';
import { CacheKeyConfig, CACHE_TTL } from '../cache-key-builder';

// Mock Redis for security testing
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

describe('SocialWise Flow Security: Idempotency and Anti-Replay', () => {
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

  describe('WAMID-based Idempotency Protection', () => {
    it('should prevent duplicate message processing with WAMID', async () => {
      const wamid = 'wamid.HBgNMTU1MTIzNDU2NzgRGBIYFjA2NzgxMjM0NTY3ODkwAA==';
      
      // First check - message not processed yet
      mockRedis.exists.mockResolvedValueOnce(0);
      const isProcessed1 = await cacheManager.checkIdempotency(mockConfig, wamid);
      expect(isProcessed1).toBe(false);
      
      // Mark message as processed
      mockRedis.setex.mockResolvedValueOnce('OK');
      await cacheManager.setIdempotency(mockConfig, wamid);
      
      // Verify correct TTL (24 hours)
      expect(mockRedis.setex).toHaveBeenCalledWith(
        expect.any(String),
        CACHE_TTL.IDEMPOTENCY,
        '1'
      );
      expect(CACHE_TTL.IDEMPOTENCY).toBe(24 * 60 * 60);
      
      // Second check - message already processed
      mockRedis.exists.mockResolvedValueOnce(1);
      const isProcessed2 = await cacheManager.checkIdempotency(mockConfig, wamid);
      expect(isProcessed2).toBe(true);
      
      // Verify cache key contains WAMID
      const setexCall = mockRedis.setex.mock.calls[0];
      expect(setexCall[0]).toContain(':idem:');
      expect(setexCall[0]).toContain(wamid.replace(/[^a-zA-Z0-9_-]/g, ''));
    });

    it('should handle different WAMID formats correctly', async () => {
      const wamids = [
        'wamid.HBgNMTU1MTIzNDU2NzgRGBIYFjA2NzgxMjM0NTY3ODkwAA==',
        'wamid.ABC123DEF456',
        'wamid.simple-format-123',
        'wamid.complex@format#with$special%chars',
      ];
      
      mockRedis.exists.mockResolvedValue(0);
      mockRedis.setex.mockResolvedValue('OK');
      
      for (const wamid of wamids) {
        await cacheManager.checkIdempotency(mockConfig, wamid);
        await cacheManager.setIdempotency(mockConfig, wamid);
      }
      
      // Verify all WAMIDs were processed and cleaned properly
      expect(mockRedis.exists).toHaveBeenCalledTimes(wamids.length);
      expect(mockRedis.setex).toHaveBeenCalledTimes(wamids.length);
      
      // Check that special characters were cleaned from cache keys
      const setexCalls = mockRedis.setex.mock.calls;
      setexCalls.forEach(call => {
        const cacheKey = call[0];
        expect(cacheKey).toMatch(/^sw:test:acc123:inb456:agt789:ms:gpt-4o-mini:pv1\.2:chan:whatsapp:ep:true:idem:[a-zA-Z0-9_.-]+$/);
      });
    });

    it('should fail safe on Redis errors for idempotency', async () => {
      const wamid = 'wamid.test123';
      
      // Simulate Redis connection failure
      mockRedis.exists.mockRejectedValue(new Error('Redis connection failed'));
      
      const isProcessed = await cacheManager.checkIdempotency(mockConfig, wamid);
      expect(isProcessed).toBe(false); // Fail safe - allow processing
      
      const stats = cacheManager.getStats();
      expect(stats.errors).toBe(1);
    });

    it('should work with utility functions', async () => {
      const wamid = 'wamid.utility-test-123';
      
      mockRedis.exists.mockResolvedValueOnce(0);
      mockRedis.setex.mockResolvedValueOnce('OK');
      mockRedis.exists.mockResolvedValueOnce(1);
      
      // Test utility functions
      const isProcessed1 = await checkMessageIdempotency(mockConfig, wamid);
      expect(isProcessed1).toBe(false);
      
      await setMessageIdempotency(mockConfig, wamid);
      
      const isProcessed2 = await checkMessageIdempotency(mockConfig, wamid);
      expect(isProcessed2).toBe(true);
    });

    it('should use custom TTL when provided', async () => {
      const wamid = 'wamid.custom-ttl-test';
      const customTTL = 12 * 60 * 60; // 12 hours
      
      mockRedis.setex.mockResolvedValue('OK');
      
      await cacheManager.setIdempotency(mockConfig, wamid, customTTL);
      
      expect(mockRedis.setex).toHaveBeenCalledWith(
        expect.any(String),
        customTTL,
        '1'
      );
    });
  });

  describe('Nonce-based Anti-Replay Protection', () => {
    it('should prevent replay attacks with nonces', async () => {
      const nonce = 'nonce-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
      
      // First check - nonce is fresh
      mockRedis.exists.mockResolvedValueOnce(0);
      const isUsed1 = await cacheManager.checkNonce(mockConfig, nonce);
      expect(isUsed1).toBe(false);
      
      // Mark nonce as used
      mockRedis.setex.mockResolvedValueOnce('OK');
      await cacheManager.setNonce(mockConfig, nonce);
      
      // Verify correct TTL (5 minutes)
      expect(mockRedis.setex).toHaveBeenCalledWith(
        expect.any(String),
        CACHE_TTL.NONCE,
        '1'
      );
      expect(CACHE_TTL.NONCE).toBe(5 * 60);
      
      // Second check - nonce already used
      mockRedis.exists.mockResolvedValueOnce(1);
      const isUsed2 = await cacheManager.checkNonce(mockConfig, nonce);
      expect(isUsed2).toBe(true);
      
      // Verify cache key format
      const setexCall = mockRedis.setex.mock.calls[0];
      expect(setexCall[0]).toContain(':nonce:');
    });

    it('should handle various nonce formats', async () => {
      const nonces = [
        'nonce-simple-123',
        'nonce_with_underscores_456',
        'nonce-with-dashes-789',
        'nonce@with#special$chars%',
        'NONCE-UPPERCASE-ABC',
        'nonce.with.dots.def',
      ];
      
      mockRedis.exists.mockResolvedValue(0);
      mockRedis.setex.mockResolvedValue('OK');
      
      for (const nonce of nonces) {
        await cacheManager.checkNonce(mockConfig, nonce);
        await cacheManager.setNonce(mockConfig, nonce);
      }
      
      // Verify all nonces were processed
      expect(mockRedis.exists).toHaveBeenCalledTimes(nonces.length);
      expect(mockRedis.setex).toHaveBeenCalledTimes(nonces.length);
      
      // Check that special characters were cleaned from cache keys
      const setexCalls = mockRedis.setex.mock.calls;
      setexCalls.forEach(call => {
        const cacheKey = call[0];
        expect(cacheKey).toMatch(/^sw:test:acc123:inb456:agt789:ms:gpt-4o-mini:pv1\.2:chan:whatsapp:ep:true:nonce:[a-zA-Z0-9_-]+$/);
      });
    });

    it('should fail secure on Redis errors for nonces', async () => {
      const nonce = 'nonce-error-test';
      
      // Simulate Redis connection failure
      mockRedis.exists.mockRejectedValue(new Error('Redis connection failed'));
      
      const isUsed = await cacheManager.checkNonce(mockConfig, nonce);
      expect(isUsed).toBe(true); // Fail secure - assume nonce is used
      
      const stats = cacheManager.getStats();
      expect(stats.errors).toBe(1);
    });

    it('should work with utility functions', async () => {
      const nonce = 'nonce-utility-test-456';
      
      mockRedis.exists.mockResolvedValueOnce(0);
      mockRedis.setex.mockResolvedValueOnce('OK');
      mockRedis.exists.mockResolvedValueOnce(1);
      
      // Test utility functions
      const isUsed1 = await checkAntiReplayNonce(mockConfig, nonce);
      expect(isUsed1).toBe(false);
      
      await setAntiReplayNonce(mockConfig, nonce);
      
      const isUsed2 = await checkAntiReplayNonce(mockConfig, nonce);
      expect(isUsed2).toBe(true);
    });

    it('should use custom TTL when provided', async () => {
      const nonce = 'nonce-custom-ttl-test';
      const customTTL = 10 * 60; // 10 minutes
      
      mockRedis.setex.mockResolvedValue('OK');
      
      await cacheManager.setNonce(mockConfig, nonce, customTTL);
      
      expect(mockRedis.setex).toHaveBeenCalledWith(
        expect.any(String),
        customTTL,
        '1'
      );
    });
  });

  describe('Rate Limiting Integration', () => {
    it('should implement sliding window rate limiting', async () => {
      const identifier = 'user-rate-limit-test';
      const limit = 10;
      const windowSeconds = 60;
      
      // Mock Redis operations for sliding window
      mockRedis.zremrangebyscore.mockResolvedValue(2); // Removed 2 old entries
      mockRedis.zcard.mockResolvedValueOnce(5); // Current count: 5
      mockRedis.zadd.mockResolvedValue(1);
      mockRedis.expire.mockResolvedValue(1);
      
      const result = await cacheManager.checkRateLimit(mockConfig, identifier, limit, windowSeconds);
      
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(4); // limit - currentCount - 1 = 10 - 5 - 1
      expect(result.resetTime).toBeGreaterThan(Date.now());
      
      // Verify Redis operations
      expect(mockRedis.zremrangebyscore).toHaveBeenCalled();
      expect(mockRedis.zcard).toHaveBeenCalled();
      expect(mockRedis.zadd).toHaveBeenCalled();
      expect(mockRedis.expire).toHaveBeenCalledWith(expect.any(String), windowSeconds);
    });

    it('should deny requests when rate limit exceeded', async () => {
      const identifier = 'user-rate-limit-exceeded';
      const limit = 5;
      const windowSeconds = 60;
      
      mockRedis.zremrangebyscore.mockResolvedValue(0);
      mockRedis.zcard.mockResolvedValueOnce(5); // At limit
      
      const result = await cacheManager.checkRateLimit(mockConfig, identifier, limit, windowSeconds);
      
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
      
      // Should not add new entry when limit exceeded
      expect(mockRedis.zadd).not.toHaveBeenCalled();
    });

    it('should hash rate limit identifiers to prevent PII exposure', async () => {
      const sensitiveIdentifier = 'user@example.com';
      const limit = 5;
      const windowSeconds = 60;
      
      mockRedis.zremrangebyscore.mockResolvedValue(0);
      mockRedis.zcard.mockResolvedValue(0);
      mockRedis.zadd.mockResolvedValue(1);
      mockRedis.expire.mockResolvedValue(1);
      
      await cacheManager.checkRateLimit(mockConfig, sensitiveIdentifier, limit, windowSeconds);
      
      // Verify that the cache key doesn't contain the original identifier
      const zremCall = mockRedis.zremrangebyscore.mock.calls[0];
      const cacheKey = zremCall[0];
      
      expect(cacheKey).not.toContain('user@example.com');
      expect(cacheKey).toContain(':rate:');
      expect(cacheKey).toMatch(/^sw:test:acc123:inb456:agt789:ms:gpt-4o-mini:pv1\.2:chan:whatsapp:ep:true:rate:[a-f0-9]{16}$/);
    });

    it('should fail open on rate limiting errors', async () => {
      const identifier = 'user-rate-limit-error';
      const limit = 5;
      const windowSeconds = 60;
      
      mockRedis.zremrangebyscore.mockRejectedValue(new Error('Redis connection failed'));
      
      const result = await cacheManager.checkRateLimit(mockConfig, identifier, limit, windowSeconds);
      
      expect(result.allowed).toBe(true); // Fail open
      expect(result.remaining).toBe(0);
      
      const stats = cacheManager.getStats();
      expect(stats.errors).toBe(1);
    });

    it('should handle concurrent rate limit checks correctly', async () => {
      const identifier = 'user-concurrent-test';
      const limit = 3;
      const windowSeconds = 60;
      
      // Simulate concurrent requests
      mockRedis.zremrangebyscore.mockResolvedValue(0);
      mockRedis.zcard
        .mockResolvedValueOnce(0) // First request
        .mockResolvedValueOnce(1) // Second request
        .mockResolvedValueOnce(2); // Third request
      mockRedis.zadd.mockResolvedValue(1);
      mockRedis.expire.mockResolvedValue(1);
      
      const results = await Promise.all([
        cacheManager.checkRateLimit(mockConfig, identifier, limit, windowSeconds),
        cacheManager.checkRateLimit(mockConfig, identifier, limit, windowSeconds),
        cacheManager.checkRateLimit(mockConfig, identifier, limit, windowSeconds),
      ]);
      
      // All should be allowed
      results.forEach(result => {
        expect(result.allowed).toBe(true);
      });
      
      // Verify decreasing remaining counts
      expect(results[0].remaining).toBe(2); // 3 - 0 - 1
      expect(results[1].remaining).toBe(1); // 3 - 1 - 1
      expect(results[2].remaining).toBe(0); // 3 - 2 - 1
    });
  });

  describe('Security Edge Cases', () => {
    it('should handle empty or invalid WAMIDs', async () => {
      const invalidWamids = ['', null, undefined, 'invalid'];
      
      for (const wamid of invalidWamids) {
        if (wamid === '' || wamid === 'invalid') {
          // These should throw errors
          await expect(cacheManager.checkIdempotency(mockConfig, wamid as any))
            .rejects.toThrow();
        } else {
          // null/undefined should throw
          await expect(cacheManager.checkIdempotency(mockConfig, wamid as any))
            .rejects.toThrow();
        }
      }
    });

    it('should handle empty or invalid nonces', async () => {
      const invalidNonces = ['', null, undefined];
      
      for (const nonce of invalidNonces) {
        await expect(cacheManager.checkNonce(mockConfig, nonce as any))
          .rejects.toThrow();
      }
    });

    it('should prevent cache key collisions between different types', async () => {
      const identifier = 'same-identifier-123';
      
      mockRedis.exists.mockResolvedValue(0);
      mockRedis.setex.mockResolvedValue('OK');
      mockRedis.zremrangebyscore.mockResolvedValue(0);
      mockRedis.zcard.mockResolvedValue(0);
      mockRedis.zadd.mockResolvedValue(1);
      mockRedis.expire.mockResolvedValue(1);
      
      // Use same identifier for different security mechanisms
      await cacheManager.checkIdempotency(mockConfig, `wamid.${identifier}`);
      await cacheManager.checkNonce(mockConfig, `nonce-${identifier}`);
      await cacheManager.checkRateLimit(mockConfig, identifier, 5, 60);
      
      // Verify different cache key prefixes were used
      const allCalls = [
        ...mockRedis.exists.mock.calls,
        ...mockRedis.setex.mock.calls,
        ...mockRedis.zremrangebyscore.mock.calls,
      ];
      
      const cacheKeys = allCalls.map(call => call[0]);
      const uniquePrefixes = new Set(
        cacheKeys.map(key => key.split(':').slice(-2, -1)[0])
      );
      
      expect(uniquePrefixes.has('idem')).toBe(true);
      expect(uniquePrefixes.has('nonce')).toBe(true);
      expect(uniquePrefixes.has('rate')).toBe(true);
    });

    it('should maintain security across different configurations', async () => {
      const wamid = 'wamid.cross-config-test';
      const config1 = { ...mockConfig, accountId: '123' };
      const config2 = { ...mockConfig, accountId: '124' };
      
      mockRedis.exists.mockResolvedValue(0);
      mockRedis.setex.mockResolvedValue('OK');
      
      // Same WAMID should be isolated between different accounts
      await cacheManager.checkIdempotency(config1, wamid);
      await cacheManager.checkIdempotency(config2, wamid);
      
      const existsCalls = mockRedis.exists.mock.calls;
      expect(existsCalls[0][0]).not.toBe(existsCalls[1][0]); // Different cache keys
      expect(existsCalls[0][0]).toContain('acc123');
      expect(existsCalls[1][0]).toContain('acc124');
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle high-volume idempotency checks efficiently', async () => {
      const wamids = Array.from({ length: 100 }, (_, i) => `wamid.bulk-test-${i}`);
      
      mockRedis.exists.mockResolvedValue(0);
      
      const startTime = Date.now();
      
      const results = await Promise.all(
        wamids.map(wamid => cacheManager.checkIdempotency(mockConfig, wamid))
      );
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      // All should return false (not processed)
      results.forEach(result => expect(result).toBe(false));
      
      // Should complete reasonably quickly (less than 1 second for 100 operations)
      expect(duration).toBeLessThan(1000);
      
      // Verify all calls were made
      expect(mockRedis.exists).toHaveBeenCalledTimes(100);
    });

    it('should handle rate limiting for multiple users efficiently', async () => {
      const users = Array.from({ length: 50 }, (_, i) => `user-${i}`);
      const limit = 10;
      const windowSeconds = 60;
      
      mockRedis.zremrangebyscore.mockResolvedValue(0);
      mockRedis.zcard.mockResolvedValue(0);
      mockRedis.zadd.mockResolvedValue(1);
      mockRedis.expire.mockResolvedValue(1);
      
      const startTime = Date.now();
      
      const results = await Promise.all(
        users.map(user => cacheManager.checkRateLimit(mockConfig, user, limit, windowSeconds))
      );
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      // All should be allowed
      results.forEach(result => expect(result.allowed).toBe(true));
      
      // Should complete reasonably quickly
      expect(duration).toBeLessThan(2000);
      
      // Verify operations were called for each user
      expect(mockRedis.zremrangebyscore).toHaveBeenCalledTimes(50);
    });
  });
});