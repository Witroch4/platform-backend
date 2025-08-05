/**
 * Tests for Log Aggregation
 */

import { LogAggregator, logAggregator, enableLogAggregation } from '../../../../lib/ai-integration/utils/log-aggregation';
import { LogEntry } from '../../../../lib/ai-integration/utils/logger';

describe('LogAggregator', () => {
  let aggregator: LogAggregator;

  beforeEach(() => {
    aggregator = new LogAggregator(100);
  });

  const createTestLog = (overrides: Partial<LogEntry> = {}): LogEntry => ({
    timestamp: new Date().toISOString(),
    level: 'info',
    message: 'Test message',
    context: {
      traceId: 'test-trace',
      accountId: 1,
      conversationId: 123,
      stage: 'webhook',
      ...overrides.context,
    },
    service: 'chatwit-ai-integration',
    version: '1.0.0',
    environment: 'test',
    ...overrides,
  });

  describe('log storage', () => {
    it('should add logs to memory store', () => {
      const log = createTestLog();
      aggregator.addLog(log);

      const result = aggregator.search({});
      expect(result.logs).toHaveLength(1);
      expect(result.logs[0]).toEqual(log);
    });

    it('should respect max logs limit', () => {
      const smallAggregator = new LogAggregator(2);

      for (let i = 0; i < 5; i++) {
        smallAggregator.addLog(createTestLog({ message: `Message ${i}` }));
      }

      const result = smallAggregator.search({});
      expect(result.logs).toHaveLength(2);
      expect(result.logs[0].message).toBe('Message 4');
      expect(result.logs[1].message).toBe('Message 3');
    });
  });

  describe('search functionality', () => {
    beforeEach(() => {
      // Add test logs
      aggregator.addLog(createTestLog({
        level: 'info',
        context: { traceId: 'trace-1', accountId: 1, stage: 'webhook', conversationId: 123 },
      }));
      aggregator.addLog(createTestLog({
        level: 'error',
        context: { traceId: 'trace-2', accountId: 2, stage: 'queue', conversationId: 456 },
      }));
      aggregator.addLog(createTestLog({
        level: 'warn',
        context: { traceId: 'trace-1', accountId: 1, stage: 'classify', conversationId: 123 },
      }));
    });

    it('should filter by trace ID', () => {
      const result = aggregator.search({ traceId: 'trace-1' });
      expect(result.logs).toHaveLength(2);
      expect(result.logs.every(log => log.context.traceId === 'trace-1')).toBe(true);
    });

    it('should filter by account ID', () => {
      const result = aggregator.search({ accountId: 1 });
      expect(result.logs).toHaveLength(2);
      expect(result.logs.every(log => log.context.accountId === 1)).toBe(true);
    });

    it('should filter by log level', () => {
      const result = aggregator.search({ level: 'error' });
      expect(result.logs).toHaveLength(1);
      expect(result.logs[0].level).toBe('error');
    });

    it('should filter by stage', () => {
      const result = aggregator.search({ stage: 'webhook' });
      expect(result.logs).toHaveLength(1);
      expect(result.logs[0].context.stage).toBe('webhook');
    });

    it('should support pagination', () => {
      const result = aggregator.search({ limit: 1, offset: 1 });
      expect(result.logs).toHaveLength(1);
      expect(result.hasMore).toBe(true);
      expect(result.total).toBe(3);
    });

    it('should search by message content', () => {
      aggregator.addLog(createTestLog({ message: 'Special error occurred' }));
      
      const result = aggregator.search({ message: 'special error' });
      expect(result.logs).toHaveLength(1);
      expect(result.logs[0].message).toBe('Special error occurred');
    });
  });

  describe('aggregation functionality', () => {
    beforeEach(() => {
      aggregator.addLog(createTestLog({ level: 'info', context: { stage: 'webhook', traceId: 'test' } }));
      aggregator.addLog(createTestLog({ level: 'info', context: { stage: 'webhook', traceId: 'test' } }));
      aggregator.addLog(createTestLog({ level: 'error', context: { stage: 'queue', traceId: 'test' } }));
      aggregator.addLog(createTestLog({ level: 'warn', context: { stage: 'classify', traceId: 'test' } }));
    });

    it('should aggregate by log level', () => {
      const result = aggregator.aggregate('level');
      expect(result.counts).toEqual({
        info: 2,
        error: 1,
        warn: 1,
      });
    });

    it('should aggregate by stage', () => {
      const result = aggregator.aggregate('stage');
      expect(result.counts).toEqual({
        webhook: 2,
        queue: 1,
        classify: 1,
      });
    });
  });

  describe('metrics calculation', () => {
    it('should calculate error rate', () => {
      const now = Date.now();
      
      // Add logs within the time window
      aggregator.addLog(createTestLog({
        level: 'info',
        timestamp: new Date(now - 60000).toISOString(), // 1 min ago
      }));
      aggregator.addLog(createTestLog({
        level: 'error',
        timestamp: new Date(now - 30000).toISOString(), // 30s ago
      }));

      const errorRate = aggregator.getErrorRate(5); // 5 minute window
      expect(errorRate).toBe(0.5); // 1 error out of 2 logs
    });

    it('should calculate average processing time', () => {
      aggregator.addLog(createTestLog({
        context: { stage: 'webhook', duration: 100, traceId: 'test' },
      }));
      aggregator.addLog(createTestLog({
        context: { stage: 'webhook', duration: 200, traceId: 'test' },
      }));

      const avgTime = aggregator.getAverageProcessingTime('webhook');
      expect(avgTime).toBe(150);
    });
  });

  describe('trace functionality', () => {
    it('should get logs by trace ID in chronological order', () => {
      const baseTime = Date.now();
      
      aggregator.addLog(createTestLog({
        context: { traceId: 'trace-123', stage: 'webhook' },
        timestamp: new Date(baseTime).toISOString(),
      }));
      aggregator.addLog(createTestLog({
        context: { traceId: 'trace-123', stage: 'queue' },
        timestamp: new Date(baseTime + 1000).toISOString(),
      }));
      aggregator.addLog(createTestLog({
        context: { traceId: 'trace-456', stage: 'webhook' },
        timestamp: new Date(baseTime + 500).toISOString(),
      }));

      const traceLogs = aggregator.getTraceLog('trace-123');
      expect(traceLogs).toHaveLength(2);
      expect(traceLogs[0].context.stage).toBe('webhook');
      expect(traceLogs[1].context.stage).toBe('queue');
    });
  });

  describe('maintenance operations', () => {
    it('should clear old logs', () => {
      const oldTime = Date.now() - 25 * 60 * 60 * 1000; // 25 hours ago
      const recentTime = Date.now() - 1 * 60 * 60 * 1000; // 1 hour ago

      aggregator.addLog(createTestLog({
        timestamp: new Date(oldTime).toISOString(),
      }));
      aggregator.addLog(createTestLog({
        timestamp: new Date(recentTime).toISOString(),
      }));

      const cleared = aggregator.clearOldLogs(24); // Clear logs older than 24 hours
      expect(cleared).toBe(1);

      const result = aggregator.search({});
      expect(result.logs).toHaveLength(1);
    });

    it('should export logs as NDJSON', () => {
      aggregator.addLog(createTestLog({ message: 'Log 1' }));
      aggregator.addLog(createTestLog({ message: 'Log 2' }));

      const exported = aggregator.exportLogs();
      const lines = exported.split('\n');
      
      expect(lines).toHaveLength(2);
      expect(JSON.parse(lines[0]).message).toBe('Log 2'); // Newest first
      expect(JSON.parse(lines[1]).message).toBe('Log 1');
    });
  });

  describe('stats', () => {
    it('should provide comprehensive stats', () => {
      aggregator.addLog(createTestLog({ level: 'info', context: { stage: 'webhook', traceId: 'test' } }));
      aggregator.addLog(createTestLog({ level: 'error', context: { stage: 'queue', traceId: 'test' } }));

      const stats = aggregator.getStats();
      
      expect(stats.totalLogs).toBe(2);
      expect(stats.logsByLevel.info).toBe(1);
      expect(stats.logsByLevel.error).toBe(1);
      expect(stats.logsByStage.webhook).toBe(1);
      expect(stats.logsByStage.queue).toBe(1);
    });
  });
});

describe('enableLogAggregation', () => {
  let originalConsoleLog: typeof console.log;
  let originalConsoleError: typeof console.error;

  beforeEach(() => {
    originalConsoleLog = console.log;
    originalConsoleError = console.error;
  });

  afterEach(() => {
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
  });

  it('should intercept and aggregate structured logs', () => {
    enableLogAggregation();

    const testLog = {
      timestamp: new Date().toISOString(),
      level: 'info',
      message: 'Test structured log',
      context: { traceId: 'test', stage: 'webhook' },
      service: 'chatwit-ai-integration',
      version: '1.0.0',
      environment: 'test',
    };

    console.log(JSON.stringify(testLog));

    const result = logAggregator.search({ message: 'Test structured log' });
    expect(result.logs).toHaveLength(1);
  });

  it('should ignore non-structured logs', () => {
    enableLogAggregation();

    const initialCount = logAggregator.search({}).total;
    console.log('Regular log message');
    
    const finalCount = logAggregator.search({}).total;
    expect(finalCount).toBe(initialCount);
  });
});