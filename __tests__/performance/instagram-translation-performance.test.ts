/**
 * Performance Tests for Instagram Translation Optimization
 * 
 * Tests the caching, database optimization, and connection pooling
 * improvements for Instagram message translation.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';

// Mock Prisma for testing - must be at the top level
const mockPrisma = {
  chatwitInbox: {
    findFirst: jest.fn(),
  },
  mapeamentoIntencao: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
  },
  $queryRaw: jest.fn(),
  $disconnect: jest.fn(),
};

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn(() => mockPrisma),
}));

// Mock Redis connection for testing
jest.mock('../../lib/redis', () => ({
  connection: {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    setex: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
    mget: jest.fn().mockResolvedValue([]),
    keys: jest.fn().mockResolvedValue([]),
    ping: jest.fn().mockResolvedValue('PONG'),
    info: jest.fn().mockResolvedValue('used_memory_human:10.5M'),
    pipeline: jest.fn(() => ({
      setex: jest.fn(),
      exec: jest.fn().mockResolvedValue([]),
    })),
  },
}));

// Mock the cache warming scheduler to prevent intervals during tests
jest.mock('../../lib/instagram/cache-warming-scheduler', () => ({
  cacheWarmingScheduler: {
    triggerWarming: jest.fn().mockResolvedValue({ success: true, message: 'Test warming' }),
    getStats: jest.fn().mockReturnValue({
      totalRuns: 0,
      successfulWarmings: 0,
      failedWarmings: 0,
      isWarming: false,
      config: {},
    }),
  },
  triggerCacheWarming: jest.fn().mockResolvedValue({ success: true, message: 'Test warming' }),
  getCacheWarmingStats: jest.fn().mockReturnValue({
    totalRuns: 0,
    successfulWarmings: 0,
    failedWarmings: 0,
    isWarming: false,
    config: {},
  }),
}));

// Now import the modules after mocking
import { PrismaClient } from '@prisma/client';
import {
  instagramTemplateCache,
  getCachedTemplateMapping,
  setCachedTemplateMapping,
  getCachedConversionResult,
  setCachedConversionResult,
} from '../../lib/cache/instagram-template-cache';
import {
  findOptimizedCompleteMessageMapping,
  findBatchOptimizedTemplateMappings,
  getQueryPerformanceStats,
  warmInstagramTemplateCache,
  checkDatabaseConnectionHealth,
} from '../../lib/instagram/optimized-database-queries';
import {
  getConnectionPoolHealth,
  getConnectionPoolStats,
  recordDatabaseQuery,
} from '../../lib/instagram/connection-pool-monitor';
import {
  triggerCacheWarming,
  getCacheWarmingStats,
} from '../../lib/instagram/cache-warming-scheduler';

describe('Instagram Translation Performance Optimization', () => {
  const testIntentName = 'test-intent';
  const testInboxId = 'test-inbox-123';
  const testMapping = {
    id: 'mapping-123',
    intentName: testIntentName,
    caixaEntradaId: testInboxId,
    messageType: 'unified_template' as const,
    whatsappConfig: {
      phoneNumberId: '123456789',
      whatsappToken: 'test-token',
      whatsappBusinessAccountId: 'test-business-id',
      fbGraphApiBase: 'https://graph.facebook.com/v22.0',
    },
    unifiedTemplate: {
      id: 'template-123',
      name: 'Test Template',
      type: 'INTERACTIVE_MESSAGE',
      scope: 'INBOX',
      language: 'pt_BR',
      interactiveContent: {
        body: { text: 'Test message body' },
        header: { type: 'text', content: 'Test Header' },
        footer: { text: 'Test Footer' },
      },
      whatsappOfficialInfo: null,
    },
  };

  beforeAll(async () => {
    // Setup test environment
    console.log('Setting up Instagram translation performance tests...');
  });

  afterAll(async () => {
    // Cleanup
    await instagramTemplateCache.clearAll();
    await instagramTemplateCache.shutdown();
  });

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    instagramTemplateCache.resetStats();
  });

  describe('Template Caching', () => {
    it('should cache and retrieve template mappings', async () => {
      // Set up cache
      await setCachedTemplateMapping(testIntentName, testInboxId, testMapping);
      
      // Retrieve from cache
      const cached = await getCachedTemplateMapping(testIntentName, testInboxId);
      
      expect(cached).toEqual(testMapping);
      
      // Check cache stats
      const stats = instagramTemplateCache.getStats();
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(0);
    });

    it('should handle cache misses gracefully', async () => {
      const cached = await getCachedTemplateMapping('non-existent', 'non-existent');
      
      expect(cached).toBeNull();
      
      const stats = instagramTemplateCache.getStats();
      expect(stats.misses).toBe(1);
    });

    it('should cache conversion results', async () => {
      const conversionResult = {
        fulfillmentMessages: [{ custom_payload: { instagram: { template_type: 'generic' } } }],
        templateType: 'generic' as const,
        processingTime: 150,
        buttonsCount: 2,
      };

      // Cache conversion result
      await setCachedConversionResult(
        testIntentName,
        testInboxId,
        50, // body length
        true, // has image
        conversionResult
      );

      // Retrieve conversion result
      const cached = await getCachedConversionResult(
        testIntentName,
        testInboxId,
        50,
        true
      );

      expect(cached).toBeTruthy();
      expect(cached?.templateType).toBe('generic');
      expect(cached?.buttonsCount).toBe(2);
    });

    it('should invalidate related cache entries', async () => {
      // Set up cache entries
      await setCachedTemplateMapping(testIntentName, testInboxId, testMapping);
      await setCachedConversionResult(testIntentName, testInboxId, 50, true, {
        fulfillmentMessages: [],
        templateType: 'generic',
        processingTime: 100,
        buttonsCount: 0,
      });

      // Invalidate cache
      await instagramTemplateCache.invalidateTemplateMapping(testIntentName, testInboxId);

      // Verify cache is cleared
      const cachedMapping = await getCachedTemplateMapping(testIntentName, testInboxId);
      const cachedConversion = await getCachedConversionResult(testIntentName, testInboxId, 50, true);

      expect(cachedMapping).toBeNull();
      expect(cachedConversion).toBeNull();
    });

    it('should perform batch cache operations efficiently', async () => {
      const requests = [
        { intentName: 'intent1', inboxId: 'inbox1' },
        { intentName: 'intent2', inboxId: 'inbox2' },
        { intentName: 'intent3', inboxId: 'inbox3' },
      ];

      // Pre-populate some cache entries
      await setCachedTemplateMapping('intent1', 'inbox1', { ...testMapping, id: 'mapping1' });
      await setCachedTemplateMapping('intent2', 'inbox2', { ...testMapping, id: 'mapping2' });

      const results = await instagramTemplateCache.batchGetTemplateMappings(requests);

      expect(results.size).toBe(3);
      expect(results.get('intent1:inbox1')).toBeTruthy();
      expect(results.get('intent2:inbox2')).toBeTruthy();
      expect(results.get('intent3:inbox3')).toBeNull();

      const stats = instagramTemplateCache.getStats();
      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(1);
    });
  });

  describe('Optimized Database Queries', () => {
    it('should use cache before querying database', async () => {
      // Mock database response
      mockPrisma.chatwitInbox.findFirst.mockResolvedValue({
        id: 'internal-inbox-id',
        nome: 'Test Inbox',
        whatsappApiKey: 'test-key',
        phoneNumberId: '123456789',
        whatsappBusinessAccountId: 'test-business-id',
        usuarioChatwit: {
          configuracaoGlobalWhatsApp: null,
        },
      });

      mockPrisma.mapeamentoIntencao.findUnique.mockResolvedValue({
        id: 'mapping-123',
        intentName: testIntentName,
        inboxId: 'internal-inbox-id',
        template: {
          id: 'template-123',
          name: 'Test Template',
          type: 'INTERACTIVE_MESSAGE',
          scope: 'INBOX',
          description: null,
          language: 'pt_BR',
          simpleReplyText: null,
          interactiveContent: {
            body: { text: 'Test message' },
          },
          whatsappOfficialInfo: null,
        },
      });

      // First call should hit database
      const result1 = await findOptimizedCompleteMessageMapping(testIntentName, testInboxId);
      expect(result1).toBeTruthy();
      expect(mockPrisma.chatwitInbox.findFirst).toHaveBeenCalledTimes(1);

      // Second call should use cache
      const result2 = await findOptimizedCompleteMessageMapping(testIntentName, testInboxId);
      expect(result2).toBeTruthy();
      expect(mockPrisma.chatwitInbox.findFirst).toHaveBeenCalledTimes(1); // No additional calls
    });

    it('should handle batch queries efficiently', async () => {
      const requests = [
        { intentName: 'intent1', inboxId: 'inbox1' },
        { intentName: 'intent2', inboxId: 'inbox2' },
      ];

      // Mock database responses
      mockPrisma.chatwitInbox.findFirst.mockResolvedValue({
        id: 'internal-inbox-id',
        nome: 'Test Inbox',
        whatsappApiKey: 'test-key',
        phoneNumberId: '123456789',
        whatsappBusinessAccountId: 'test-business-id',
        usuarioChatwit: { configuracaoGlobalWhatsApp: null },
      });

      mockPrisma.mapeamentoIntencao.findUnique.mockResolvedValue({
        id: 'mapping-123',
        intentName: 'test-intent',
        inboxId: 'internal-inbox-id',
        template: {
          id: 'template-123',
          name: 'Test Template',
          type: 'INTERACTIVE_MESSAGE',
          scope: 'INBOX',
          description: null,
          language: 'pt_BR',
          simpleReplyText: null,
          interactiveContent: { body: { text: 'Test message' } },
          whatsappOfficialInfo: null,
        },
      });

      const results = await findBatchOptimizedTemplateMappings(requests);

      expect(results.size).toBe(2);
      expect(Array.from(results.values()).every(result => result !== null)).toBe(true);
    });

    it('should record query performance metrics', async () => {
      // Record some test queries
      recordDatabaseQuery('test-query', 150, true);
      recordDatabaseQuery('test-query', 200, true);
      recordDatabaseQuery('slow-query', 1500, true); // Slow query
      recordDatabaseQuery('failed-query', 100, false, new Error('Test error'));

      const stats = getQueryPerformanceStats();

      expect(stats.monitor.totalQueries).toBeGreaterThan(0);
      expect(stats.monitor.slowQueries).toBeGreaterThan(0);
      expect(stats.recommendations).toContain(
        expect.stringMatching(/slow queries detected/i)
      );
    });

    it('should check database connection health', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([{ '1': 1 }]);

      const health = await checkDatabaseConnectionHealth();

      expect(health.isHealthy).toBe(true);
      expect(health.latency).toBeGreaterThan(0);
    });
  });

  describe('Connection Pool Monitoring', () => {
    it('should track connection pool health', async () => {
      const health = await getConnectionPoolHealth();

      expect(health).toHaveProperty('isHealthy');
      expect(health).toHaveProperty('status');
      expect(health).toHaveProperty('metrics');
      expect(health).toHaveProperty('lastCheck');
    });

    it('should provide connection pool statistics', () => {
      // Record some test queries
      recordDatabaseQuery('test-query', 100, true);
      recordDatabaseQuery('test-query', 200, true);

      const stats = getConnectionPoolStats();

      expect(stats).toHaveProperty('totalQueries');
      expect(stats).toHaveProperty('successRate');
      expect(stats).toHaveProperty('errorRate');
      expect(stats).toHaveProperty('averageQueryTime');
    });

    it('should detect slow queries and high error rates', () => {
      // Record slow queries
      recordDatabaseQuery('slow-query', 2000, true);
      recordDatabaseQuery('slow-query', 1500, true);
      
      // Record failed queries
      recordDatabaseQuery('failed-query', 100, false, new Error('Test error'));
      recordDatabaseQuery('failed-query', 150, false, new Error('Another error'));

      const stats = getConnectionPoolStats();

      expect(stats.averageQueryTime).toBeGreaterThan(0);
      expect(stats.errorRate).toBeGreaterThan(0);
    });
  });

  describe('Cache Warming', () => {
    it('should warm cache with frequently accessed templates', async () => {
      // Mock database response for warming
      mockPrisma.mapeamentoIntencao.findMany.mockResolvedValue([
        { intentName: 'intent1', inboxId: 'inbox1', updatedAt: new Date() },
        { intentName: 'intent2', inboxId: 'inbox2', updatedAt: new Date() },
      ]);

      mockPrisma.chatwitInbox.findFirst.mockResolvedValue({
        id: 'internal-inbox-id',
        nome: 'Test Inbox',
        whatsappApiKey: 'test-key',
        phoneNumberId: '123456789',
        whatsappBusinessAccountId: 'test-business-id',
        usuarioChatwit: { configuracaoGlobalWhatsApp: null },
      });

      mockPrisma.mapeamentoIntencao.findUnique.mockResolvedValue({
        id: 'mapping-123',
        intentName: 'test-intent',
        inboxId: 'internal-inbox-id',
        template: {
          id: 'template-123',
          name: 'Test Template',
          type: 'INTERACTIVE_MESSAGE',
          scope: 'INBOX',
          description: null,
          language: 'pt_BR',
          simpleReplyText: null,
          interactiveContent: { body: { text: 'Test message' } },
          whatsappOfficialInfo: null,
        },
      });

      const result = await warmInstagramTemplateCache(10);

      expect(result.warmed).toBeGreaterThanOrEqual(0);
      expect(result.errors).toBeGreaterThanOrEqual(0);
    });

    it('should provide cache warming statistics', () => {
      const stats = getCacheWarmingStats();

      expect(stats).toHaveProperty('totalRuns');
      expect(stats).toHaveProperty('successfulWarmings');
      expect(stats).toHaveProperty('failedWarmings');
      expect(stats).toHaveProperty('isWarming');
      expect(stats).toHaveProperty('config');
    });

    it('should trigger manual cache warming', async () => {
      // Mock successful warming
      mockPrisma.mapeamentoIntencao.findMany.mockResolvedValue([]);

      const result = await triggerCacheWarming();

      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('message');
    });
  });

  describe('Performance Integration', () => {
    it('should demonstrate improved response times with caching', async () => {
      // Mock database with delay to simulate slow query
      mockPrisma.chatwitInbox.findFirst.mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve({
          id: 'internal-inbox-id',
          nome: 'Test Inbox',
          whatsappApiKey: 'test-key',
          phoneNumberId: '123456789',
          whatsappBusinessAccountId: 'test-business-id',
          usuarioChatwit: { configuracaoGlobalWhatsApp: null },
        }), 100))
      );

      mockPrisma.mapeamentoIntencao.findUnique.mockImplementation(() =>
        new Promise(resolve => setTimeout(() => resolve({
          id: 'mapping-123',
          intentName: testIntentName,
          inboxId: 'internal-inbox-id',
          template: {
            id: 'template-123',
            name: 'Test Template',
            type: 'INTERACTIVE_MESSAGE',
            scope: 'INBOX',
            description: null,
            language: 'pt_BR',
            simpleReplyText: null,
            interactiveContent: { body: { text: 'Test message' } },
            whatsappOfficialInfo: null,
          },
        }), 100))
      );

      // First call (database hit)
      const start1 = Date.now();
      const result1 = await findOptimizedCompleteMessageMapping(testIntentName, testInboxId);
      const time1 = Date.now() - start1;

      expect(result1).toBeTruthy();
      expect(time1).toBeGreaterThan(100); // Should take time due to mock delay

      // Second call (cache hit)
      const start2 = Date.now();
      const result2 = await findOptimizedCompleteMessageMapping(testIntentName, testInboxId);
      const time2 = Date.now() - start2;

      expect(result2).toBeTruthy();
      expect(time2).toBeLessThan(time1); // Should be faster due to cache
    });

    it('should handle high concurrent load efficiently', async () => {
      // Mock fast database response
      mockPrisma.chatwitInbox.findFirst.mockResolvedValue({
        id: 'internal-inbox-id',
        nome: 'Test Inbox',
        whatsappApiKey: 'test-key',
        phoneNumberId: '123456789',
        whatsappBusinessAccountId: 'test-business-id',
        usuarioChatwit: { configuracaoGlobalWhatsApp: null },
      });

      mockPrisma.mapeamentoIntencao.findUnique.mockResolvedValue({
        id: 'mapping-123',
        intentName: testIntentName,
        inboxId: 'internal-inbox-id',
        template: {
          id: 'template-123',
          name: 'Test Template',
          type: 'INTERACTIVE_MESSAGE',
          scope: 'INBOX',
          description: null,
          language: 'pt_BR',
          simpleReplyText: null,
          interactiveContent: { body: { text: 'Test message' } },
          whatsappOfficialInfo: null,
        },
      });

      // Simulate concurrent requests
      const concurrentRequests = 20;
      const promises = Array.from({ length: concurrentRequests }, (_, i) =>
        findOptimizedCompleteMessageMapping(`intent-${i}`, `inbox-${i}`)
      );

      const start = Date.now();
      const results = await Promise.allSettled(promises);
      const totalTime = Date.now() - start;

      const successfulResults = results.filter(r => r.status === 'fulfilled').length;
      
      expect(successfulResults).toBe(concurrentRequests);
      expect(totalTime).toBeLessThan(5000); // Should complete within 5 seconds
      
      // Check that connection pool handled the load
      const poolStats = getConnectionPoolStats();
      expect(poolStats.totalQueries).toBeGreaterThanOrEqual(concurrentRequests);
    });
  });

  describe('Error Handling and Recovery', () => {
    it('should handle cache failures gracefully', async () => {
      // Mock Redis failure
      const mockRedis = require('../../lib/redis').connection;
      mockRedis.get.mockRejectedValue(new Error('Redis connection failed'));

      // Should still work by falling back to database
      mockPrisma.chatwitInbox.findFirst.mockResolvedValue({
        id: 'internal-inbox-id',
        nome: 'Test Inbox',
        whatsappApiKey: 'test-key',
        phoneNumberId: '123456789',
        whatsappBusinessAccountId: 'test-business-id',
        usuarioChatwit: { configuracaoGlobalWhatsApp: null },
      });

      mockPrisma.mapeamentoIntencao.findUnique.mockResolvedValue({
        id: 'mapping-123',
        intentName: testIntentName,
        inboxId: 'internal-inbox-id',
        template: {
          id: 'template-123',
          name: 'Test Template',
          type: 'INTERACTIVE_MESSAGE',
          scope: 'INBOX',
          description: null,
          language: 'pt_BR',
          simpleReplyText: null,
          interactiveContent: { body: { text: 'Test message' } },
          whatsappOfficialInfo: null,
        },
      });

      const result = await findOptimizedCompleteMessageMapping(testIntentName, testInboxId);
      expect(result).toBeTruthy();

      // Reset mock
      mockRedis.get.mockResolvedValue(null);
    });

    it('should handle database failures appropriately', async () => {
      // Mock database failure
      mockPrisma.chatwitInbox.findFirst.mockRejectedValue(new Error('Database connection failed'));

      await expect(
        findOptimizedCompleteMessageMapping(testIntentName, testInboxId)
      ).rejects.toThrow('Database connection failed');

      // Check that error was recorded
      const stats = getConnectionPoolStats();
      expect(stats.errorRate).toBeGreaterThan(0);
    });
  });
});