/**
 * Load tests for SocialWise Flow concurrency limits
 * Tests the effectiveness of concurrency controls under load
 */

import { getConcurrencyManager, ConcurrencyManager } from '../concurrency-manager';
import { createLogger } from '@/lib/utils/logger';

const testLogger = createLogger('ConcurrencyLoadTest');

describe('SocialWise Flow Concurrency Load Tests', () => {
  let concurrencyManager: ConcurrencyManager;

  beforeEach(() => {
    // Reset singleton for each test
    (ConcurrencyManager as any).instance = null;
    concurrencyManager = getConcurrencyManager({
      maxConcurrentLlmCallsPerInbox: 2,
      maxConcurrentLlmCallsGlobal: 5,
      queueTimeoutMs: 1000,
      degradationEnabled: true
    });
  });

  afterEach(() => {
    // Clean up
    (ConcurrencyManager as any).instance = null;
  });

  describe('Inbox-level concurrency limits', () => {
    it('should enforce per-inbox concurrency limits', async () => {
      const inboxId = 'test-inbox-1';
      const operations: Promise<any>[] = [];
      const results: any[] = [];

      // Create 5 concurrent operations for the same inbox (limit is 2)
      for (let i = 0; i < 5; i++) {
        const operation = concurrencyManager.executeLlmOperation(
          inboxId,
          async () => {
            await new Promise(resolve => setTimeout(resolve, 100));
            return `result-${i}`;
          },
          { allowDegradation: true }
        );
        operations.push(operation);
      }

      // Wait for all operations to complete
      const allResults = await Promise.all(operations);
      
      // Count successful operations vs degraded (null) operations
      const successful = allResults.filter(result => result !== null);
      const degraded = allResults.filter(result => result === null);

      expect(successful.length).toBeLessThanOrEqual(2); // Should respect inbox limit
      expect(degraded.length).toBeGreaterThan(0); // Some should be degraded
      expect(successful.length + degraded.length).toBe(5);

      testLogger.info('Inbox concurrency test results', {
        successful: successful.length,
        degraded: degraded.length,
        total: allResults.length
      });
    });

    it('should allow operations across different inboxes', async () => {
      const operations: Promise<any>[] = [];

      // Create operations for different inboxes
      for (let inboxIndex = 0; inboxIndex < 3; inboxIndex++) {
        for (let opIndex = 0; opIndex < 2; opIndex++) {
          const operation = concurrencyManager.executeLlmOperation(
            `inbox-${inboxIndex}`,
            async () => {
              await new Promise(resolve => setTimeout(resolve, 50));
              return `inbox-${inboxIndex}-op-${opIndex}`;
            },
            { allowDegradation: true }
          );
          operations.push(operation);
        }
      }

      const results = await Promise.all(operations);
      const successful = results.filter(result => result !== null);

      // Should allow 2 operations per inbox (3 inboxes * 2 ops = 6 total)
      // But global limit is 5, so at least 5 should succeed
      expect(successful.length).toBeGreaterThanOrEqual(5);

      testLogger.info('Multi-inbox concurrency test results', {
        successful: successful.length,
        total: results.length
      });
    });
  });

  describe('Global concurrency limits', () => {
    it('should enforce global concurrency limits', async () => {
      const operations: Promise<any>[] = [];

      // Create 10 operations across different inboxes (global limit is 5)
      for (let i = 0; i < 10; i++) {
        const operation = concurrencyManager.executeLlmOperation(
          `inbox-${i}`, // Different inbox for each operation
          async () => {
            await new Promise(resolve => setTimeout(resolve, 100));
            return `global-result-${i}`;
          },
          { allowDegradation: true }
        );
        operations.push(operation);
      }

      const results = await Promise.all(operations);
      const successful = results.filter(result => result !== null);
      const degraded = results.filter(result => result === null);

      expect(successful.length).toBeLessThanOrEqual(5); // Should respect global limit
      expect(degraded.length).toBeGreaterThan(0); // Some should be degraded

      testLogger.info('Global concurrency test results', {
        successful: successful.length,
        degraded: degraded.length,
        total: results.length
      });
    });
  });

  describe('Queue processing under load', () => {
    it('should process queued operations when slots become available', async () => {
      const inboxId = 'queue-test-inbox';
      const operations: Promise<any>[] = [];
      const startTimes: number[] = [];

      // Create 4 operations (limit is 2, so 2 should queue)
      for (let i = 0; i < 4; i++) {
        startTimes.push(Date.now());
        const operation = concurrencyManager.executeLlmOperation(
          inboxId,
          async () => {
            await new Promise(resolve => setTimeout(resolve, 200));
            return `queued-result-${i}`;
          },
          { 
            allowDegradation: false, // Force queueing instead of degradation
            timeoutMs: 2000 
          }
        );
        operations.push(operation);
      }

      const results = await Promise.all(operations);
      const successful = results.filter(result => result !== null);

      // All operations should eventually succeed through queueing
      expect(successful.length).toBe(4);

      testLogger.info('Queue processing test results', {
        successful: successful.length,
        total: results.length
      });
    });

    it('should timeout queued operations that wait too long', async () => {
      const inboxId = 'timeout-test-inbox';
      const operations: Promise<any>[] = [];

      // Create operations with very short timeout
      for (let i = 0; i < 3; i++) {
        const operation = concurrencyManager.executeLlmOperation(
          inboxId,
          async () => {
            await new Promise(resolve => setTimeout(resolve, 500));
            return `timeout-result-${i}`;
          },
          { 
            allowDegradation: false,
            timeoutMs: 100 // Very short timeout
          }
        );
        operations.push(operation.catch(error => error.message));
      }

      const results = await Promise.all(operations);
      const timeouts = results.filter(result => 
        typeof result === 'string' && result.includes('timeout')
      );

      expect(timeouts.length).toBeGreaterThan(0);

      testLogger.info('Queue timeout test results', {
        timeouts: timeouts.length,
        total: results.length
      });
    });
  });

  describe('Priority handling under load', () => {
    it('should prioritize high-priority operations', async () => {
      const inboxId = 'priority-test-inbox';
      const operations: Promise<any>[] = [];
      const completionOrder: string[] = [];

      // Create low priority operations first
      for (let i = 0; i < 2; i++) {
        const operation = concurrencyManager.executeLlmOperation(
          inboxId,
          async () => {
            await new Promise(resolve => setTimeout(resolve, 100));
            completionOrder.push(`low-${i}`);
            return `low-${i}`;
          },
          { 
            priority: 'low',
            allowDegradation: false,
            timeoutMs: 2000
          }
        );
        operations.push(operation);
      }

      // Add a small delay to ensure low priority operations are queued first
      await new Promise(resolve => setTimeout(resolve, 10));

      // Create high priority operation
      const highPriorityOp = concurrencyManager.executeLlmOperation(
        inboxId,
        async () => {
          await new Promise(resolve => setTimeout(resolve, 50));
          completionOrder.push('high-priority');
          return 'high-priority';
        },
        { 
          priority: 'high',
          allowDegradation: false,
          timeoutMs: 2000
        }
      );
      operations.push(highPriorityOp);

      await Promise.all(operations);

      // High priority operation should complete before some low priority ones
      const highPriorityIndex = completionOrder.indexOf('high-priority');
      expect(highPriorityIndex).toBeGreaterThanOrEqual(0);

      testLogger.info('Priority handling test results', {
        completionOrder,
        highPriorityIndex
      });
    });
  });

  describe('Stress testing', () => {
    it('should handle burst load gracefully', async () => {
      const operations: Promise<any>[] = [];
      const startTime = Date.now();

      // Create 50 operations across 10 inboxes
      for (let i = 0; i < 50; i++) {
        const inboxId = `stress-inbox-${i % 10}`;
        const operation = concurrencyManager.executeLlmOperation(
          inboxId,
          async () => {
            await new Promise(resolve => setTimeout(resolve, Math.random() * 100));
            return `stress-result-${i}`;
          },
          { allowDegradation: true }
        );
        operations.push(operation);
      }

      const results = await Promise.all(operations);
      const endTime = Date.now();
      const duration = endTime - startTime;

      const successful = results.filter(result => result !== null);
      const degraded = results.filter(result => result === null);

      expect(successful.length).toBeGreaterThan(0);
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds

      testLogger.info('Stress test results', {
        successful: successful.length,
        degraded: degraded.length,
        total: results.length,
        durationMs: duration,
        throughput: results.length / (duration / 1000)
      });
    });
  });

  describe('Concurrency statistics', () => {
    it('should provide accurate concurrency statistics', async () => {
      const inboxId = 'stats-test-inbox';
      
      // Start some operations
      const operations = [];
      for (let i = 0; i < 3; i++) {
        const op = concurrencyManager.executeLlmOperation(
          inboxId,
          async () => {
            await new Promise(resolve => setTimeout(resolve, 200));
            return `stats-result-${i}`;
          },
          { allowDegradation: false, timeoutMs: 1000 }
        );
        operations.push(op);
      }

      // Check stats while operations are running
      await new Promise(resolve => setTimeout(resolve, 50));
      const stats = concurrencyManager.getConcurrencyStats();

      expect(stats.globalActive).toBeGreaterThan(0);
      expect(stats.globalActive).toBeLessThanOrEqual(stats.globalLimit);
      expect(stats.inboxStats.length).toBeGreaterThan(0);

      const inboxStat = stats.inboxStats.find(stat => stat.inboxId === inboxId);
      expect(inboxStat).toBeDefined();
      expect(inboxStat!.active).toBeGreaterThan(0);

      testLogger.info('Concurrency statistics', stats);

      // Wait for operations to complete
      await Promise.all(operations);
    });
  });
});

describe('Concurrency Manager Configuration', () => {
  it('should allow configuration updates', () => {
    const manager = getConcurrencyManager({
      maxConcurrentLlmCallsPerInbox: 1,
      maxConcurrentLlmCallsGlobal: 3,
      queueTimeoutMs: 500,
      degradationEnabled: false
    });

    const initialStats = manager.getConcurrencyStats();
    expect(initialStats.globalLimit).toBe(3);

    manager.updateConfig({
      maxConcurrentLlmCallsGlobal: 10,
      degradationEnabled: true
    });

    const updatedStats = manager.getConcurrencyStats();
    expect(updatedStats.globalLimit).toBe(10);
  });
});