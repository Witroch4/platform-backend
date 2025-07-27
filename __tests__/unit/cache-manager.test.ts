/**
 * Unit tests for cache manager with various scenarios
 * Requirements: 1.1, 1.2, 1.3, 2.2, 2.3, 8.1, 8.2
 */

import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals';

// Mock Redis connection
const mockRedis = {
  get: jest.fn(),
  setex: jest.fn(),
  del: jest.fn(),
  exists: jest.fn(),
  mget: jest.fn(),
  keys: jest.fn(),
  ping: jest.fn(),
  info: jest.fn(),
  pipeline: jest.fn(),
};

jest.mock('@/lib/redis', () => ({
  connection: mockRedis,
}));

describe('Cache Manager', () => {
  let CredentialsCache: any;
  let credentialsCache: any;
  let WhatsAppCredentials: any;
  let CacheInvalidationManager: any;
  let CacheWarmingManager: any;
  let CacheHealthMonitor: any;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module = await import('@/lib/cache/credentials-cache');
    CredentialsCache = module.CredentialsCache;
    credentialsCache = module.credentialsCache;
    CacheInvalidationManager = module.CacheInvalidationManager;
    CacheWarmingManager = module.CacheWarmingManager;
    CacheHealthMonitor = module.CacheHealthMonitor;

    // Reset Redis mocks
    mockRedis.get.mockResolvedValue(null);
    mockRedis.setex.mockResolvedValue('OK');
    mockRedis.del.mockResolvedValue(1);
    mockRedis.exists.mockResolvedValue(0);
    mockRedis.mget.mockResolvedValue([]);
    mockRedis.keys.mockResolvedValue([]);
    mockRedis.ping.mockResolvedValue('PONG');
    mockRedis.info.mockResolvedValue('used_memory_human:10.5M');
    mockRedis.pipeline.mockReturnValue({
      setex: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([]),
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('CredentialsCache Basic Operations', () => {
    test('should get credentials from cache', async () => {
      const mockCredentials = {
        whatsappApiKey: 'test-api-key',
        phoneNumberId: '123456789',
        businessId: 'business123',
        inboxId: '4',
        source: 'inbox',
        updatedAt: new Date().toISOString(),
      };

      mockRedis.get.mockResolvedValue(JSON.stringify(mockCredentials));

      const result = await credentialsCache.getCredentials('4');

      expect(mockRedis.get).toHaveBeenCalledWith('chatwit:credentials:4');
      expect(result).toEqual(mockCredentials);
    });

    test('should return null when credentials not in cache', async () => {
      mockRedis.get.mockResolvedValue(null);

      const result = await credentialsCache.getCredentials('4');

      expect(result).toBeNull();
    });

    test('should handle cache get errors gracefully', async () => {
      mockRedis.get.mockRejectedValue(new Error('Redis error'));

      const result = await credentialsCache.getCredentials('4');

      expect(result).toBeNull();
    });

    test('should set credentials in cache', async () => {
      const credentials = {
        whatsappApiKey: 'test-api-key',
        phoneNumberId: '123456789',
        businessId: 'business123',
        inboxId: '4',
        source: 'inbox' as const,
        updatedAt: new Date(),
      };

      await credentialsCache.setCredentials('4', credentials);

      expect(mockRedis.setex).toHaveBeenCalledWith(
        'chatwit:credentials:4',
        3600, // 1 hour TTL
        expect.stringContaining('"whatsappApiKey":"test-api-key"')
      );
    });

    test('should set credentials with custom TTL', async () => {
      const credentials = {
        whatsappApiKey: 'test-api-key',
        phoneNumberId: '123456789',
        businessId: 'business123',
        inboxId: '4',
        source: 'inbox' as const,
        updatedAt: new Date(),
      };

      await credentialsCache.setCredentials('4', credentials, 7200);

      expect(mockRedis.setex).toHaveBeenCalledWith(
        'chatwit:credentials:4',
        7200, // 2 hours TTL
        expect.any(String)
      );
    });

    test('should handle cache set errors gracefully', async () => {
      mockRedis.setex.mockRejectedValue(new Error('Redis error'));

      const credentials = {
        whatsappApiKey: 'test-api-key',
        phoneNumberId: '123456789',
        businessId: 'business123',
        inboxId: '4',
        source: 'inbox' as const,
        updatedAt: new Date(),
      };

      // Should not throw
      await expect(credentialsCache.setCredentials('4', credentials)).resolves.not.toThrow();
    });

    test('should invalidate credentials cache', async () => {
      await credentialsCache.invalidateCredentials('4');

      expect(mockRedis.del).toHaveBeenCalledWith(
        'chatwit:credentials:4',
        'chatwit:credentials_updated:4'
      );
    });

    test('should check if credentials were recently updated', async () => {
      mockRedis.exists.mockResolvedValue(1);

      const result = await credentialsCache.isCredentialsUpdated('4');

      expect(mockRedis.exists).toHaveBeenCalledWith('chatwit:credentials_updated:4');
      expect(result).toBe(true);
    });

    test('should mark credentials as updated', async () => {
      await credentialsCache.markCredentialsUpdated('4');

      expect(mockRedis.setex).toHaveBeenCalledWith(
        'chatwit:credentials_updated:4',
        1800, // 30 minutes TTL
        expect.any(String)
      );
    });
  });

  describe('Fallback Chain Caching', () => {
    test('should get fallback chain from cache', async () => {
      const mockChain = ['4', '5', 'global'];
      mockRedis.get.mockResolvedValue(JSON.stringify(mockChain));

      const result = await credentialsCache.getFallbackChain('4');

      expect(mockRedis.get).toHaveBeenCalledWith('chatwit:fallback_chain:4');
      expect(result).toEqual(mockChain);
    });

    test('should set fallback chain in cache', async () => {
      const chain = ['4', '5', 'global'];

      await credentialsCache.setFallbackChain('4', chain);

      expect(mockRedis.setex).toHaveBeenCalledWith(
        'chatwit:fallback_chain:4',
        86400, // 24 hours TTL
        JSON.stringify(chain)
      );
    });

    test('should invalidate fallback chain cache', async () => {
      await credentialsCache.invalidateFallbackChain('4');

      expect(mockRedis.del).toHaveBeenCalledWith('chatwit:fallback_chain:4');
    });
  });

  describe('Batch Operations', () => {
    test('should batch get credentials for multiple inboxes', async () => {
      const inboxIds = ['4', '5', '6'];
      const mockCredentials = [
        JSON.stringify({ inboxId: '4', whatsappApiKey: 'key1' }),
        null,
        JSON.stringify({ inboxId: '6', whatsappApiKey: 'key3' }),
      ];

      mockRedis.mget.mockResolvedValue(mockCredentials);

      const result = await credentialsCache.batchGetCredentials(inboxIds);

      expect(mockRedis.mget).toHaveBeenCalledWith(
        'chatwit:credentials:4',
        'chatwit:credentials:5',
        'chatwit:credentials:6'
      );

      expect(result.get('4')).toEqual({ inboxId: '4', whatsappApiKey: 'key1' });
      expect(result.get('5')).toBeNull();
      expect(result.get('6')).toEqual({ inboxId: '6', whatsappApiKey: 'key3' });
    });

    test('should batch set credentials for multiple inboxes', async () => {
      const credentialsMap = new Map([
        ['4', {
          whatsappApiKey: 'key1',
          phoneNumberId: '123',
          businessId: 'biz1',
          inboxId: '4',
          source: 'inbox' as const,
          updatedAt: new Date(),
        }],
        ['5', {
          whatsappApiKey: 'key2',
          phoneNumberId: '456',
          businessId: 'biz2',
          inboxId: '5',
          source: 'inbox' as const,
          updatedAt: new Date(),
        }],
      ]);

      const mockPipeline = {
        setex: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([]),
      };
      mockRedis.pipeline.mockReturnValue(mockPipeline);

      await credentialsCache.batchSetCredentials(credentialsMap);

      expect(mockPipeline.setex).toHaveBeenCalledTimes(2);
      expect(mockPipeline.exec).toHaveBeenCalled();
    });

    test('should handle batch operation errors gracefully', async () => {
      mockRedis.mget.mockRejectedValue(new Error('Redis error'));

      const result = await credentialsCache.batchGetCredentials(['4', '5']);

      // Should return empty results on error
      expect(result.get('4')).toBeNull();
      expect(result.get('5')).toBeNull();
    });
  });

  describe('Cache Statistics and Health', () => {
    test('should track cache statistics', async () => {
      // Simulate cache hit
      mockRedis.get.mockResolvedValue(JSON.stringify({ test: 'data' }));
      await credentialsCache.getCredentials('4');

      // Simulate cache miss
      mockRedis.get.mockResolvedValue(null);
      await credentialsCache.getCredentials('5');

      const stats = credentialsCache.getStats();

      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
      expect(stats.errors).toBe(0);
    });

    test('should reset cache statistics', () => {
      credentialsCache.resetStats();

      const stats = credentialsCache.getStats();

      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
      expect(stats.errors).toBe(0);
    });

    test('should check cache health', async () => {
      mockRedis.ping.mockResolvedValue('PONG');
      mockRedis.info.mockResolvedValue('used_memory_human:10.5M\r\n');

      const health = await credentialsCache.checkHealth();

      expect(health.isConnected).toBe(true);
      expect(health.latency).toBeGreaterThan(0);
      expect(health.memoryUsage).toBe('10.5M');
      expect(health.lastCheck).toBeInstanceOf(Date);
    });

    test('should handle health check failures', async () => {
      mockRedis.ping.mockRejectedValue(new Error('Connection failed'));

      const health = await credentialsCache.checkHealth();

      expect(health.isConnected).toBe(false);
      expect(health.latency).toBeGreaterThan(0);
    });

    test('should clear all cache entries', async () => {
      mockRedis.keys.mockResolvedValue(['chatwit:credentials:4', 'chatwit:credentials:5']);

      await credentialsCache.clearAll();

      expect(mockRedis.keys).toHaveBeenCalledWith('chatwit:*');
      expect(mockRedis.del).toHaveBeenCalledWith('chatwit:credentials:4', 'chatwit:credentials:5');
    });
  });

  describe('Cache Invalidation Manager', () => {
    test('should queue invalidation for batch processing', () => {
      const manager = CacheInvalidationManager.getInstance();
      const setTimeoutSpy = jest.spyOn(global, 'setTimeout');

      manager.queueInvalidation('4');

      expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 1000);

      setTimeoutSpy.mockRestore();
    });

    test('should process batch invalidation', async () => {
      const manager = CacheInvalidationManager.getInstance();

      // Mock the private method
      const processBatchSpy = jest.spyOn(manager as any, 'processBatchInvalidation');

      manager.queueInvalidation('4');
      manager.queueInvalidation('5');

      // Wait for timeout
      await new Promise(resolve => setTimeout(resolve, 1100));

      expect(processBatchSpy).toHaveBeenCalled();
    });

    test('should invalidate related caches', async () => {
      // Mock Prisma
      jest.doMock('@/lib/prisma', () => ({
        prisma: {
          chatwitInbox: {
            findMany: jest.fn().mockResolvedValue([
              { inboxId: '5' },
              { inboxId: '6' },
            ]),
          },
        },
      }));

      const manager = CacheInvalidationManager.getInstance();

      await manager.invalidateRelatedCaches('4');

      // Should invalidate the inbox itself and dependent inboxes
      expect(mockRedis.del).toHaveBeenCalledTimes(6); // 3 inboxes × 2 keys each
    });
  });

  describe('Cache Warming Manager', () => {
    test('should warm frequently accessed credentials', async () => {
      // Mock Prisma
      jest.doMock('@/lib/prisma', () => ({
        prisma: {
          chatwitInbox: {
            findMany: jest.fn().mockResolvedValue([
              {
                inboxId: '4',
                whatsappApiKey: 'key1',
                phoneNumberId: '123',
                whatsappBusinessAccountId: 'biz1',
                updatedAt: new Date(),
              },
              {
                inboxId: '5',
                whatsappApiKey: 'key2',
                phoneNumberId: '456',
                whatsappBusinessAccountId: 'biz2',
                updatedAt: new Date(),
              },
            ]),
          },
        },
      }));

      const manager = CacheWarmingManager.getInstance();

      await manager.warmFrequentlyAccessedCredentials();

      expect(mockRedis.setex).toHaveBeenCalledTimes(2);
    });

    test('should warm specific inboxes', async () => {
      // Mock CredentialsFallbackResolver
      jest.doMock('@/worker/WebhookWorkerTasks/persistencia.worker.task', () => ({
        CredentialsFallbackResolver: {
          resolveCredentials: jest.fn().mockResolvedValue({
            whatsappApiKey: 'key1',
            phoneNumberId: '123',
            businessId: 'biz1',
            inboxId: '4',
            source: 'inbox',
            updatedAt: new Date(),
          }),
        },
      }));

      const manager = CacheWarmingManager.getInstance();

      await manager.warmSpecificInboxes(['4', '5']);

      expect(mockRedis.setex).toHaveBeenCalledTimes(2);
    });

    test('should start periodic warming', () => {
      const manager = CacheWarmingManager.getInstance();
      const setIntervalSpy = jest.spyOn(global, 'setInterval');

      manager.startPeriodicWarming();

      expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 30 * 60 * 1000);

      setIntervalSpy.mockRestore();
    });
  });

  describe('Cache Health Monitor', () => {
    test('should record cache operations', () => {
      const monitor = CacheHealthMonitor.getInstance();

      monitor.recordCacheOperation('hit', 50);
      monitor.recordCacheOperation('miss', 75);
      monitor.recordCacheOperation('error');

      const stats = monitor.getPerformanceStats();

      expect(stats.hitRate).toBe(50); // 1 hit out of 2 total requests
      expect(stats.errorRate).toBe(33.33); // 1 error out of 3 total requests
      expect(stats.averageLatency).toBe(62.5); // (50 + 75) / 2
      expect(stats.totalRequests).toBe(3);
    });

    test('should check health and trigger recovery', async () => {
      const monitor = CacheHealthMonitor.getInstance();

      // Mock unhealthy cache
      mockRedis.ping.mockRejectedValue(new Error('Connection failed'));

      const attemptRecoverySpy = jest.spyOn(monitor as any, 'attemptRecovery');

      await monitor.checkHealthAndRecover();

      expect(attemptRecoverySpy).toHaveBeenCalled();
    });

    test('should start health monitoring', () => {
      const monitor = CacheHealthMonitor.getInstance();
      const setIntervalSpy = jest.spyOn(global, 'setInterval');

      monitor.startHealthMonitoring();

      expect(setIntervalSpy).toHaveBeenCalledTimes(2);
      expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 5 * 60 * 1000); // Health check
      expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 60 * 60 * 1000); // Stats reset

      setIntervalSpy.mockRestore();
    });
  });

  describe('Cache Error Scenarios', () => {
    test('should handle Redis connection failures', async () => {
      mockRedis.get.mockRejectedValue(new Error('ECONNREFUSED'));

      const result = await credentialsCache.getCredentials('4');

      expect(result).toBeNull();
    });

    test('should handle Redis timeout errors', async () => {
      mockRedis.setex.mockRejectedValue(new Error('TIMEOUT'));

      const credentials = {
        whatsappApiKey: 'test-api-key',
        phoneNumberId: '123456789',
        businessId: 'business123',
        inboxId: '4',
        source: 'inbox' as const,
        updatedAt: new Date(),
      };

      // Should not throw
      await expect(credentialsCache.setCredentials('4', credentials)).resolves.not.toThrow();
    });

    test('should handle malformed cache data', async () => {
      mockRedis.get.mockResolvedValue('invalid-json');

      const result = await credentialsCache.getCredentials('4');

      expect(result).toBeNull();
    });

    test('should handle cache invalidation errors', async () => {
      mockRedis.del.mockRejectedValue(new Error('Redis error'));

      // Should not throw
      await expect(credentialsCache.invalidateCredentials('4')).resolves.not.toThrow();
    });
  });

  describe('Cache Performance Optimization', () => {
    test('should use appropriate TTL values', async () => {
      const credentials = {
        whatsappApiKey: 'test-api-key',
        phoneNumberId: '123456789',
        businessId: 'business123',
        inboxId: '4',
        source: 'inbox' as const,
        updatedAt: new Date(),
      };

      await credentialsCache.setCredentials('4', credentials);

      expect(mockRedis.setex).toHaveBeenCalledWith(
        expect.any(String),
        3600, // 1 hour default TTL
        expect.any(String)
      );
    });

    test('should use pipeline for batch operations', async () => {
      const credentialsMap = new Map([
        ['4', {
          whatsappApiKey: 'key1',
          phoneNumberId: '123',
          businessId: 'biz1',
          inboxId: '4',
          source: 'inbox' as const,
          updatedAt: new Date(),
        }],
      ]);

      await credentialsCache.batchSetCredentials(credentialsMap);

      expect(mockRedis.pipeline).toHaveBeenCalled();
    });

    test('should track latency for performance monitoring', async () => {
      const monitor = CacheHealthMonitor.getInstance();

      monitor.recordCacheOperation('hit', 25);
      monitor.recordCacheOperation('hit', 75);

      const stats = monitor.getPerformanceStats();

      expect(stats.averageLatency).toBe(50);
    });
  });
});