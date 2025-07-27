/**
 * Cache performance tests for credential lookup times
 * Requirements: 1.1, 1.3, 5.1, 5.2
 */

import { describe, test, expect, jest, beforeEach, afterEach, beforeAll, afterAll } from '@jest/globals';

// Mock Redis connection for performance testing
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

describe('Cache Performance Tests', () => {
  let CredentialsCache: any;
  let credentialsCache: any;
  let CacheInvalidationManager: any;
  let CacheWarmingManager: any;
  let CacheHealthMonitor: any;

  beforeAll(async () => {
    // Import cache modules after mocks are set up
    const module = await import('@/lib/cache/credentials-cache');
    CredentialsCache = module.CredentialsCache;
    credentialsCache = module.credentialsCache;
    CacheInvalidationManager = module.CacheInvalidationManager;
    CacheWarmingManager = module.CacheWarmingManager;
    CacheHealthMonitor = module.CacheHealthMonitor;
  });

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup fast mock responses
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

  describe('Single Cache Operation Performance', () => {
    test('should get credentials within 10ms', async () => {
      const mockCredentials = {
        whatsappApiKey: 'test-api-key',
        phoneNumberId: '123456789',
        businessId: 'business123',
        inboxId: '4',
        source: 'inbox',
        updatedAt: new Date().toISOString(),
      };

      mockRedis.get.mockResolvedValue(JSON.stringify(mockCredentials));

      const startTime = performance.now();
      const result = await credentialsCache.getCredentials('4');
      const operationTime = performance.now() - startTime;

      expect(result).toEqual(mockCredentials);
      expect(operationTime).toBeLessThan(10); // Target: under 10ms
      expect(mockRedis.get).toHaveBeenCalledWith('chatwit:credentials:4');

      console.log(`Cache get performance: ${operationTime.toFixed(2)}ms`);
    });

    test('should set credentials within 15ms', async () => {
      const credentials = {
        whatsappApiKey: 'test-api-key',
        phoneNumberId: '123456789',
        businessId: 'business123',
        inboxId: '4',
        source: 'inbox' as const,
        updatedAt: new Date(),
      };

      const startTime = performance.now();
      await credentialsCache.setCredentials('4', credentials);
      const operationTime = performance.now() - startTime;

      expect(operationTime).toBeLessThan(15); // Target: under 15ms
      expect(mockRedis.setex).toHaveBeenCalledWith(
        'chatwit:credentials:4',
        3600,
        expect.any(String)
      );

      console.log(`Cache set performance: ${operationTime.toFixed(2)}ms`);
    });

    test('should invalidate credentials within 20ms', async () => {
      const startTime = performance.now();
      await credentialsCache.invalidateCredentials('4');
      const operationTime = performance.now() - startTime;

      expect(operationTime).toBeLessThan(20); // Target: under 20ms
      expect(mockRedis.del).toHaveBeenCalledWith(
        'chatwit:credentials:4',
        'chatwit:credentials_updated:4'
      );

      console.log(`Cache invalidation performance: ${operationTime.toFixed(2)}ms`);
    });

    test('should check credentials update status within 5ms', async () => {
      mockRedis.exists.mockResolvedValue(1);

      const startTime = performance.now();
      const result = await credentialsCache.isCredentialsUpdated('4');
      const operationTime = performance.now() - startTime;

      expect(result).toBe(true);
      expect(operationTime).toBeLessThan(5); // Target: under 5ms
      expect(mockRedis.exists).toHaveBeenCalledWith('chatwit:credentials_updated:4');

      console.log(`Cache exists check performance: ${operationTime.toFixed(2)}ms`);
    });
  });

  describe('Batch Operation Performance', () => {
    test('should batch get 100 credentials within 50ms', async () => {
      const inboxIds = Array.from({ length: 100 }, (_, i) => `${i + 1}`);
      const mockResults = inboxIds.map((id, index) => 
        index % 3 === 0 ? null : JSON.stringify({
          whatsappApiKey: `key-${id}`,
          phoneNumberId: `${123456789 + parseInt(id)}`,
          businessId: `business-${id}`,
          inboxId: id,
          source: 'inbox',
          updatedAt: new Date().toISOString(),
        })
      );

      mockRedis.mget.mockResolvedValue(mockResults);

      const startTime = performance.now();
      const result = await credentialsCache.batchGetCredentials(inboxIds);
      const operationTime = performance.now() - startTime;

      expect(operationTime).toBeLessThan(50); // Target: under 50ms for 100 items
      expect(result.size).toBe(100);
      expect(mockRedis.mget).toHaveBeenCalledTimes(1);

      // Verify hit/miss ratio
      const hits = Array.from(result.values()).filter(v => v !== null).length;
      const misses = Array.from(result.values()).filter(v => v === null).length;

      console.log(`Batch get performance:
        - Items: ${inboxIds.length}
        - Time: ${operationTime.toFixed(2)}ms
        - Time per item: ${(operationTime / inboxIds.length).toFixed(3)}ms
        - Hits: ${hits}
        - Misses: ${misses}
      `);
    });

    test('should batch set 50 credentials within 100ms', async () => {
      const credentialsMap = new Map();
      
      for (let i = 1; i <= 50; i++) {
        credentialsMap.set(`${i}`, {
          whatsappApiKey: `batch-key-${i}`,
          phoneNumberId: `${123456789 + i}`,
          businessId: `batch-business-${i}`,
          inboxId: `${i}`,
          source: 'inbox' as const,
          updatedAt: new Date(),
        });
      }

      const mockPipeline = {
        setex: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(Array(50).fill(['OK'])),
      };
      mockRedis.pipeline.mockReturnValue(mockPipeline);

      const startTime = performance.now();
      await credentialsCache.batchSetCredentials(credentialsMap);
      const operationTime = performance.now() - startTime;

      expect(operationTime).toBeLessThan(100); // Target: under 100ms for 50 items
      expect(mockPipeline.setex).toHaveBeenCalledTimes(50);
      expect(mockPipeline.exec).toHaveBeenCalledTimes(1);

      console.log(`Batch set performance:
        - Items: ${credentialsMap.size}
        - Time: ${operationTime.toFixed(2)}ms
        - Time per item: ${(operationTime / credentialsMap.size).toFixed(3)}ms
      `);
    });

    test('should handle large batch operations efficiently', async () => {
      const batchSize = 500;
      const inboxIds = Array.from({ length: batchSize }, (_, i) => `${i + 1}`);
      
      // Simulate mixed results (70% hits, 30% misses)
      const mockResults = inboxIds.map((id, index) => 
        index % 10 < 7 ? JSON.stringify({
          whatsappApiKey: `large-key-${id}`,
          phoneNumberId: `${123456789 + parseInt(id)}`,
          businessId: `large-business-${id}`,
          inboxId: id,
          source: 'inbox',
          updatedAt: new Date().toISOString(),
        }) : null
      );

      mockRedis.mget.mockResolvedValue(mockResults);

      const startTime = performance.now();
      const result = await credentialsCache.batchGetCredentials(inboxIds);
      const operationTime = performance.now() - startTime;

      expect(operationTime).toBeLessThan(200); // Target: under 200ms for 500 items
      expect(result.size).toBe(batchSize);

      const hits = Array.from(result.values()).filter(v => v !== null).length;
      const hitRate = (hits / batchSize) * 100;

      console.log(`Large batch operation performance:
        - Items: ${batchSize}
        - Time: ${operationTime.toFixed(2)}ms
        - Time per item: ${(operationTime / batchSize).toFixed(3)}ms
        - Hit rate: ${hitRate.toFixed(1)}%
        - Throughput: ${(batchSize / (operationTime / 1000)).toFixed(0)} ops/sec
      `);
    });
  });

  describe('Concurrent Operation Performance', () => {
    test('should handle 50 concurrent get operations efficiently', async () => {
      const mockCredentials = {
        whatsappApiKey: 'concurrent-key',
        phoneNumberId: '123456789',
        businessId: 'concurrent-business',
        inboxId: '4',
        source: 'inbox',
        updatedAt: new Date().toISOString(),
      };

      mockRedis.get.mockResolvedValue(JSON.stringify(mockCredentials));

      const numOperations = 50;
      const startTime = performance.now();

      const promises = Array.from({ length: numOperations }, async (_, i) => {
        const opStartTime = performance.now();
        const result = await credentialsCache.getCredentials(`${i + 1}`);
        const opTime = performance.now() - opStartTime;
        return { result, opTime };
      });

      const results = await Promise.all(promises);
      const totalTime = performance.now() - startTime;

      // All operations should complete successfully
      results.forEach(({ result }) => {
        expect(result).toEqual(mockCredentials);
      });

      // Calculate performance metrics
      const operationTimes = results.map(r => r.opTime);
      const averageOpTime = operationTimes.reduce((sum, time) => sum + time, 0) / operationTimes.length;
      const maxOpTime = Math.max(...operationTimes);
      const minOpTime = Math.min(...operationTimes);

      expect(averageOpTime).toBeLessThan(20); // Average under 20ms
      expect(maxOpTime).toBeLessThan(50); // No operation should take more than 50ms

      console.log(`Concurrent get operations performance:
        - Operations: ${numOperations}
        - Total time: ${totalTime.toFixed(2)}ms
        - Average op time: ${averageOpTime.toFixed(2)}ms
        - Min op time: ${minOpTime.toFixed(2)}ms
        - Max op time: ${maxOpTime.toFixed(2)}ms
        - Ops per second: ${(numOperations / (totalTime / 1000)).toFixed(0)}
      `);
    });

    test('should handle mixed concurrent operations without degradation', async () => {
      const mockCredentials = {
        whatsappApiKey: 'mixed-key',
        phoneNumberId: '123456789',
        businessId: 'mixed-business',
        inboxId: '4',
        source: 'inbox' as const,
        updatedAt: new Date(),
      };

      mockRedis.get.mockResolvedValue(JSON.stringify(mockCredentials));
      mockRedis.exists.mockResolvedValue(1);

      const numOperations = 30;
      const startTime = performance.now();

      // Create mixed operations: get, set, exists, invalidate
      const promises = Array.from({ length: numOperations }, async (_, i) => {
        const opStartTime = performance.now();
        let result;
        let opType;

        switch (i % 4) {
          case 0:
            result = await credentialsCache.getCredentials(`${i + 1}`);
            opType = 'get';
            break;
          case 1:
            await credentialsCache.setCredentials(`${i + 1}`, mockCredentials);
            result = 'set_complete';
            opType = 'set';
            break;
          case 2:
            result = await credentialsCache.isCredentialsUpdated(`${i + 1}`);
            opType = 'exists';
            break;
          case 3:
            await credentialsCache.invalidateCredentials(`${i + 1}`);
            result = 'invalidate_complete';
            opType = 'invalidate';
            break;
        }

        const opTime = performance.now() - opStartTime;
        return { result, opTime, opType };
      });

      const results = await Promise.all(promises);
      const totalTime = performance.now() - startTime;

      // Group results by operation type
      const opsByType = results.reduce((acc, { opType, opTime }) => {
        if (!acc[opType]) acc[opType] = [];
        acc[opType].push(opTime);
        return acc;
      }, {} as Record<string, number[]>);

      // Calculate averages for each operation type
      Object.entries(opsByType).forEach(([opType, times]) => {
        const avgTime = times.reduce((sum, time) => sum + time, 0) / times.length;
        expect(avgTime).toBeLessThan(30); // Each operation type should average under 30ms
      });

      console.log(`Mixed concurrent operations performance:
        - Total operations: ${numOperations}
        - Total time: ${totalTime.toFixed(2)}ms
        - Operation averages:
          ${Object.entries(opsByType).map(([type, times]) => 
            `  ${type}: ${(times.reduce((sum, time) => sum + time, 0) / times.length).toFixed(2)}ms (${times.length} ops)`
          ).join('\n          ')}
      `);
    });

    test('should maintain performance under sustained concurrent load', async () => {
      const mockCredentials = {
        whatsappApiKey: 'sustained-key',
        phoneNumberId: '123456789',
        businessId: 'sustained-business',
        inboxId: '4',
        source: 'inbox',
        updatedAt: new Date().toISOString(),
      };

      mockRedis.get.mockResolvedValue(JSON.stringify(mockCredentials));

      // Run multiple rounds of concurrent operations
      const roundSize = 20;
      const numRounds = 5;
      const allOperationTimes: number[] = [];

      for (let round = 0; round < numRounds; round++) {
        const roundStartTime = performance.now();

        const promises = Array.from({ length: roundSize }, async (_, i) => {
          const opStartTime = performance.now();
          const result = await credentialsCache.getCredentials(`${round * roundSize + i + 1}`);
          const opTime = performance.now() - opStartTime;
          return { result, opTime };
        });

        const results = await Promise.all(promises);
        const roundTime = performance.now() - roundStartTime;

        // Collect operation times
        allOperationTimes.push(...results.map(r => r.opTime));

        // Verify all operations completed successfully
        results.forEach(({ result }) => {
          expect(result).toEqual(mockCredentials);
        });

        console.log(`Round ${round + 1}: ${roundTime.toFixed(2)}ms for ${roundSize} operations`);

        // Small delay between rounds
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      // Analyze performance consistency across rounds
      const totalOperations = allOperationTimes.length;
      const averageOpTime = allOperationTimes.reduce((sum, time) => sum + time, 0) / totalOperations;

      // Check for performance degradation
      const firstRoundAvg = allOperationTimes.slice(0, roundSize).reduce((sum, time) => sum + time, 0) / roundSize;
      const lastRoundAvg = allOperationTimes.slice(-roundSize).reduce((sum, time) => sum + time, 0) / roundSize;
      const performanceDegradation = lastRoundAvg - firstRoundAvg;

      expect(averageOpTime).toBeLessThan(25);
      expect(performanceDegradation).toBeLessThan(10); // Less than 10ms degradation

      console.log(`Sustained load performance:
        - Total operations: ${totalOperations}
        - Average op time: ${averageOpTime.toFixed(2)}ms
        - First round avg: ${firstRoundAvg.toFixed(2)}ms
        - Last round avg: ${lastRoundAvg.toFixed(2)}ms
        - Performance degradation: ${performanceDegradation.toFixed(2)}ms
      `);
    });
  });

  describe('Cache Health and Monitoring Performance', () => {
    test('should check cache health within 50ms', async () => {
      mockRedis.ping.mockResolvedValue('PONG');
      mockRedis.info.mockResolvedValue('used_memory_human:15.2M\r\nused_memory:15925248\r\n');

      const startTime = performance.now();
      const health = await credentialsCache.checkHealth();
      const operationTime = performance.now() - startTime;

      expect(operationTime).toBeLessThan(50); // Target: under 50ms
      expect(health.isConnected).toBe(true);
      expect(health.latency).toBeGreaterThan(0);
      expect(health.memoryUsage).toBe('15.2M');

      console.log(`Health check performance:
        - Time: ${operationTime.toFixed(2)}ms
        - Latency: ${health.latency.toFixed(2)}ms
        - Connected: ${health.isConnected}
        - Memory: ${health.memoryUsage}
      `);
    });

    test('should record cache statistics efficiently', async () => {
      const monitor = CacheHealthMonitor.getInstance();

      const numOperations = 1000;
      const startTime = performance.now();

      // Record many operations
      for (let i = 0; i < numOperations; i++) {
        const latency = Math.random() * 20; // Random latency 0-20ms
        const opType = i % 3 === 0 ? 'hit' : i % 3 === 1 ? 'miss' : 'error';
        monitor.recordCacheOperation(opType as any, latency);
      }

      const recordingTime = performance.now() - startTime;

      expect(recordingTime).toBeLessThan(100); // Should record 1000 operations in under 100ms

      const stats = monitor.getPerformanceStats();
      expect(stats.totalRequests).toBe(numOperations);
      expect(stats.hitRate).toBeGreaterThan(0);
      expect(stats.averageLatency).toBeGreaterThan(0);

      console.log(`Statistics recording performance:
        - Operations: ${numOperations}
        - Recording time: ${recordingTime.toFixed(2)}ms
        - Time per operation: ${(recordingTime / numOperations).toFixed(4)}ms
        - Hit rate: ${stats.hitRate.toFixed(1)}%
        - Average latency: ${stats.averageLatency.toFixed(2)}ms
      `);
    });

    test('should handle cache warming efficiently', async () => {
      // Mock Prisma for cache warming
      jest.doMock('@/lib/prisma', () => ({
        prisma: {
          chatwitInbox: {
            findMany: jest.fn().mockResolvedValue(
              Array.from({ length: 100 }, (_, i) => ({
                inboxId: `${i + 1}`,
                whatsappApiKey: `warm-key-${i}`,
                phoneNumberId: `${123456789 + i}`,
                whatsappBusinessAccountId: `warm-business-${i}`,
                updatedAt: new Date(),
              }))
            ),
          },
        },
      }));

      const warmingManager = CacheWarmingManager.getInstance();

      const startTime = performance.now();
      await warmingManager.warmFrequentlyAccessedCredentials();
      const warmingTime = performance.now() - startTime;

      expect(warmingTime).toBeLessThan(1000); // Should warm 100 credentials in under 1 second
      expect(mockRedis.setex).toHaveBeenCalledTimes(100);

      console.log(`Cache warming performance:
        - Items warmed: 100
        - Warming time: ${warmingTime.toFixed(2)}ms
        - Time per item: ${(warmingTime / 100).toFixed(2)}ms
      `);
    });

    test('should handle cache invalidation efficiently', async () => {
      const manager = CacheInvalidationManager.getInstance();

      const numInvalidations = 50;
      const startTime = performance.now();

      // Queue multiple invalidations
      for (let i = 1; i <= numInvalidations; i++) {
        manager.queueInvalidation(`${i}`);
      }

      // Wait for batch processing
      await new Promise(resolve => setTimeout(resolve, 1100));

      const invalidationTime = performance.now() - startTime;

      expect(invalidationTime).toBeLessThan(2000); // Should complete batch invalidation in under 2 seconds

      console.log(`Cache invalidation performance:
        - Items invalidated: ${numInvalidations}
        - Total time: ${invalidationTime.toFixed(2)}ms
        - Time per item: ${(invalidationTime / numInvalidations).toFixed(2)}ms
      `);
    });
  });

  describe('Memory Usage and Resource Efficiency', () => {
    test('should not leak memory during intensive cache operations', async () => {
      const initialMemory = process.memoryUsage();

      const mockCredentials = {
        whatsappApiKey: 'memory-test-key',
        phoneNumberId: '123456789',
        businessId: 'memory-test-business',
        inboxId: '4',
        source: 'inbox' as const,
        updatedAt: new Date(),
      };

      mockRedis.get.mockResolvedValue(JSON.stringify(mockCredentials));

      // Perform intensive cache operations
      const numOperations = 1000;
      const batchSize = 100;
      const numBatches = numOperations / batchSize;

      for (let batch = 0; batch < numBatches; batch++) {
        const promises = Array.from({ length: batchSize }, async (_, i) => {
          const inboxId = `${batch * batchSize + i + 1}`;
          
          // Mix of operations
          await credentialsCache.getCredentials(inboxId);
          await credentialsCache.setCredentials(inboxId, mockCredentials);
          await credentialsCache.isCredentialsUpdated(inboxId);
          
          if (i % 10 === 0) {
            await credentialsCache.invalidateCredentials(inboxId);
          }
        });

        await Promise.all(promises);

        // Force garbage collection if available
        if (global.gc) {
          global.gc();
        }
      }

      const finalMemory = process.memoryUsage();
      const memoryGrowth = finalMemory.heapUsed - initialMemory.heapUsed;

      // Memory growth should be reasonable (less than 50MB)
      expect(memoryGrowth).toBeLessThan(50 * 1024 * 1024);

      console.log(`Memory usage test:
        - Operations performed: ${numOperations * 3} (get/set/exists)
        - Memory growth: ${(memoryGrowth / 1024 / 1024).toFixed(2)}MB
        - Initial heap: ${(initialMemory.heapUsed / 1024 / 1024).toFixed(2)}MB
        - Final heap: ${(finalMemory.heapUsed / 1024 / 1024).toFixed(2)}MB
      `);
    });

    test('should handle large cache keys efficiently', async () => {
      // Create credentials with large data
      const largeCredentials = {
        whatsappApiKey: 'large-key-' + 'x'.repeat(1000),
        phoneNumberId: '123456789',
        businessId: 'large-business-' + 'y'.repeat(500),
        inboxId: '4',
        source: 'inbox' as const,
        updatedAt: new Date(),
        metadata: {
          largeField: 'z'.repeat(5000),
          arrayField: Array.from({ length: 100 }, (_, i) => `item-${i}-${'a'.repeat(50)}`),
          objectField: Object.fromEntries(
            Array.from({ length: 50 }, (_, i) => [`key-${i}`, `value-${i}-${'b'.repeat(100)}`])
          ),
        },
      };

      const serializedSize = JSON.stringify(largeCredentials).length;

      const startTime = performance.now();
      await credentialsCache.setCredentials('large-test', largeCredentials);
      const setTime = performance.now() - startTime;

      mockRedis.get.mockResolvedValue(JSON.stringify(largeCredentials));

      const getStartTime = performance.now();
      const result = await credentialsCache.getCredentials('large-test');
      const getTime = performance.now() - getStartTime;

      expect(setTime).toBeLessThan(50); // Should handle large objects in under 50ms
      expect(getTime).toBeLessThan(30); // Should retrieve large objects in under 30ms
      expect(result).toEqual(largeCredentials);

      console.log(`Large cache object performance:
        - Serialized size: ${(serializedSize / 1024).toFixed(2)}KB
        - Set time: ${setTime.toFixed(2)}ms
        - Get time: ${getTime.toFixed(2)}ms
      `);
    });
  });

  describe('Error Handling Performance', () => {
    test('should handle cache errors quickly', async () => {
      // Simulate Redis errors
      mockRedis.get.mockRejectedValue(new Error('Redis connection timeout'));
      mockRedis.setex.mockRejectedValue(new Error('Redis write error'));
      mockRedis.del.mockRejectedValue(new Error('Redis delete error'));

      const credentials = {
        whatsappApiKey: 'error-test-key',
        phoneNumberId: '123456789',
        businessId: 'error-test-business',
        inboxId: '4',
        source: 'inbox' as const,
        updatedAt: new Date(),
      };

      // Test error handling performance
      const operations = [
        { name: 'get', fn: () => credentialsCache.getCredentials('error-test') },
        { name: 'set', fn: () => credentialsCache.setCredentials('error-test', credentials) },
        { name: 'invalidate', fn: () => credentialsCache.invalidateCredentials('error-test') },
      ];

      const results = await Promise.all(
        operations.map(async ({ name, fn }) => {
          const startTime = performance.now();
          const result = await fn();
          const operationTime = performance.now() - startTime;
          return { name, result, operationTime };
        })
      );

      // All error handling should be fast
      results.forEach(({ name, operationTime }) => {
        expect(operationTime).toBeLessThan(100); // Error handling should be under 100ms
      });

      // Get should return null on error, set/invalidate should not throw
      expect(results[0].result).toBeNull(); // get returns null on error
      expect(results[1].result).toBeUndefined(); // set returns void
      expect(results[2].result).toBeUndefined(); // invalidate returns void

      console.log(`Error handling performance:
        ${results.map(({ name, operationTime }) => 
          `- ${name}: ${operationTime.toFixed(2)}ms`
        ).join('\n        ')}
      `);
    });

    test('should maintain performance under mixed success/error conditions', async () => {
      const mockCredentials = {
        whatsappApiKey: 'mixed-error-key',
        phoneNumberId: '123456789',
        businessId: 'mixed-error-business',
        inboxId: '4',
        source: 'inbox',
        updatedAt: new Date().toISOString(),
      };

      // Setup mixed responses: 70% success, 30% errors
      mockRedis.get.mockImplementation((key) => {
        const keyNum = parseInt(key.split(':').pop() || '0');
        if (keyNum % 10 < 7) {
          return Promise.resolve(JSON.stringify(mockCredentials));
        } else {
          return Promise.reject(new Error('Simulated Redis error'));
        }
      });

      const numOperations = 100;
      const startTime = performance.now();

      const promises = Array.from({ length: numOperations }, async (_, i) => {
        const opStartTime = performance.now();
        const result = await credentialsCache.getCredentials(`${i + 1}`);
        const opTime = performance.now() - opStartTime;
        return { result, opTime, success: result !== null };
      });

      const results = await Promise.all(promises);
      const totalTime = performance.now() - startTime;

      // Calculate success/error metrics
      const successResults = results.filter(r => r.success);
      const errorResults = results.filter(r => !r.success);

      expect(successResults.length).toBeGreaterThan(60); // Should have ~70% success
      expect(errorResults.length).toBeGreaterThan(20); // Should have ~30% errors

      // Performance should remain good despite errors
      const averageOpTime = results.reduce((sum, { opTime }) => sum + opTime, 0) / results.length;
      expect(averageOpTime).toBeLessThan(50);

      const successAvgTime = successResults.reduce((sum, { opTime }) => sum + opTime, 0) / successResults.length;
      const errorAvgTime = errorResults.reduce((sum, { opTime }) => sum + opTime, 0) / errorResults.length;

      console.log(`Mixed success/error performance:
        - Total operations: ${numOperations}
        - Success operations: ${successResults.length}
        - Error operations: ${errorResults.length}
        - Total time: ${totalTime.toFixed(2)}ms
        - Average op time: ${averageOpTime.toFixed(2)}ms
        - Success avg time: ${successAvgTime.toFixed(2)}ms
        - Error avg time: ${errorAvgTime.toFixed(2)}ms
      `);
    });
  });
});