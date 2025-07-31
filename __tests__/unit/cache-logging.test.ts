/**
 * Tests for comprehensive cache logging utilities
 */

import {
  logCacheHit,
  logCacheMiss,
  logCacheSet,
  logCacheInvalidation,
  logCacheError,
  logCacheKeyGeneration,
  logApiCacheInvalidation,
  createCacheLogContext,
  type CacheLogContext
} from '@/lib/logging/cache-logging';

// Mock console methods
const mockConsoleLog = jest.spyOn(console, 'log').mockImplementation();
const mockConsoleError = jest.spyOn(console, 'error').mockImplementation();
const mockConsoleWarn = jest.spyOn(console, 'warn').mockImplementation();

describe('Cache Logging Utilities', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(() => {
    mockConsoleLog.mockRestore();
    mockConsoleError.mockRestore();
    mockConsoleWarn.mockRestore();
  });

  describe('createCacheLogContext', () => {
    it('should create a proper cache log context', () => {
      const context = createCacheLogContext(
        'user123',
        'inbox456',
        'test.intent',
        'getTemplateMapping',
        'corr-789'
      );

      expect(context).toEqual({
        userContext: {
          usuarioChatwitId: 'user123',
          inboxId: 'inbox456'
        },
        intentName: 'test.intent',
        operation: 'getTemplateMapping',
        correlationId: 'corr-789'
      });
    });

    it('should create context without correlation ID', () => {
      const context = createCacheLogContext(
        'user123',
        'inbox456',
        'test.intent',
        'getTemplateMapping'
      );

      expect(context.correlationId).toBeUndefined();
    });
  });

  describe('logCacheHit', () => {
    it('should log cache hit with comprehensive context', () => {
      const context = createCacheLogContext('user123', 'inbox456', 'test.intent', 'getTemplateMapping');
      
      logCacheHit(
        { ...context, cacheKey: 'test:key' },
        { latency: 50, hitCount: 5 },
        { messageType: 'unified_template' }
      );

      expect(mockConsoleLog).toHaveBeenCalledWith(
        '[Cache] [HIT] getTemplateMapping:',
        expect.objectContaining({
          userContext: { usuarioChatwitId: 'user123', inboxId: 'inbox456' },
          intentName: 'test.intent',
          operation: 'getTemplateMapping',
          cacheKey: 'test:key',
          latency: 50,
          hitCount: 5,
          messageType: 'unified_template',
          cacheResult: 'HIT',
          timestamp: expect.any(String)
        })
      );
    });
  });

  describe('logCacheMiss', () => {
    it('should log cache miss with reason', () => {
      const context = createCacheLogContext('user123', 'inbox456', 'test.intent', 'getTemplateMapping');
      
      logCacheMiss(
        { ...context, cacheKey: 'test:key' },
        { latency: 25 },
        'Key not found in cache',
        { bodyLength: 100 }
      );

      expect(mockConsoleLog).toHaveBeenCalledWith(
        '[Cache] [MISS] getTemplateMapping:',
        expect.objectContaining({
          userContext: { usuarioChatwitId: 'user123', inboxId: 'inbox456' },
          intentName: 'test.intent',
          operation: 'getTemplateMapping',
          cacheKey: 'test:key',
          latency: 25,
          bodyLength: 100,
          reason: 'Key not found in cache',
          cacheResult: 'MISS',
          timestamp: expect.any(String)
        })
      );
    });
  });

  describe('logCacheSet', () => {
    it('should log cache set operation', () => {
      const context = createCacheLogContext('user123', 'inbox456', 'test.intent', 'setTemplateMapping');
      
      logCacheSet(
        { ...context, cacheKey: 'test:key' },
        { ttl: 3600, dataSize: 1024 },
        { messageType: 'unified_template', mappingId: 'mapping123' }
      );

      expect(mockConsoleLog).toHaveBeenCalledWith(
        '[Cache] [SET] setTemplateMapping:',
        expect.objectContaining({
          userContext: { usuarioChatwitId: 'user123', inboxId: 'inbox456' },
          intentName: 'test.intent',
          operation: 'setTemplateMapping',
          cacheKey: 'test:key',
          ttl: 3600,
          dataSize: 1024,
          messageType: 'unified_template',
          mappingId: 'mapping123',
          cacheResult: 'SET',
          timestamp: expect.any(String)
        })
      );
    });
  });

  describe('logCacheInvalidation', () => {
    it('should log cache invalidation with deleted keys', () => {
      const context = createCacheLogContext('user123', 'inbox456', 'test.intent', 'invalidateTemplateMapping');
      const keysDeleted = ['key1', 'key2', 'key3'];
      
      logCacheInvalidation(
        context,
        keysDeleted,
        'Template mapping updated',
        { mappingId: 'mapping123' }
      );

      expect(mockConsoleLog).toHaveBeenCalledWith(
        '[Cache] [INVALIDATED] invalidateTemplateMapping:',
        expect.objectContaining({
          userContext: { usuarioChatwitId: 'user123', inboxId: 'inbox456' },
          intentName: 'test.intent',
          operation: 'invalidateTemplateMapping',
          keysDeleted,
          keysDeletedCount: 3,
          reason: 'Template mapping updated',
          mappingId: 'mapping123',
          cacheResult: 'INVALIDATED',
          timestamp: expect.any(String)
        })
      );
    });
  });

  describe('logCacheError', () => {
    it('should log cache error with Error object', () => {
      const context = createCacheLogContext('user123', 'inbox456', 'test.intent', 'getTemplateMapping');
      const error = new Error('Redis connection failed');
      
      logCacheError(
        { ...context, cacheKey: 'test:key' },
        error,
        'Failed to retrieve from cache',
        { retryCount: 3 }
      );

      expect(mockConsoleError).toHaveBeenCalledWith(
        '[Cache] [ERROR] getTemplateMapping:',
        expect.objectContaining({
          userContext: { usuarioChatwitId: 'user123', inboxId: 'inbox456' },
          intentName: 'test.intent',
          operation: 'getTemplateMapping',
          cacheKey: 'test:key',
          error: {
            message: 'Redis connection failed',
            name: 'Error',
            stack: expect.any(String)
          },
          impact: 'Failed to retrieve from cache',
          retryCount: 3,
          cacheResult: 'ERROR',
          timestamp: expect.any(String)
        })
      );
    });

    it('should log cache error with error details object', () => {
      const context = createCacheLogContext('user123', 'inbox456', 'test.intent', 'getTemplateMapping');
      const errorDetails = {
        message: 'Connection timeout',
        name: 'TimeoutError'
      };
      
      logCacheError(
        { ...context, cacheKey: 'test:key' },
        errorDetails,
        'Operation timed out'
      );

      expect(mockConsoleError).toHaveBeenCalledWith(
        '[Cache] [ERROR] getTemplateMapping:',
        expect.objectContaining({
          error: errorDetails,
          impact: 'Operation timed out',
          cacheResult: 'ERROR'
        })
      );
    });
  });

  describe('logCacheKeyGeneration', () => {
    it('should log cache key generation for debugging', () => {
      const context = createCacheLogContext('user123', 'inbox456', 'test.intent', 'getTemplateMapping');
      const keyComponents = {
        intentName: 'test.intent',
        usuarioChatwitId: 'user123',
        inboxId: 'inbox456'
      };
      
      logCacheKeyGeneration(
        context,
        keyComponents,
        'chatwit:instagram_template_mapping:intentName:usuarioChatwitId:inboxId',
        { generatedKey: 'chatwit:instagram_template_mapping:test.intent:user123:inbox456' }
      );

      expect(mockConsoleLog).toHaveBeenCalledWith(
        '[Cache] [DEBUG] Key generation for getTemplateMapping:',
        expect.objectContaining({
          userContext: { usuarioChatwitId: 'user123', inboxId: 'inbox456' },
          intentName: 'test.intent',
          operation: 'getTemplateMapping_key_generation',
          keyComponents,
          keyFormat: 'chatwit:instagram_template_mapping:intentName:usuarioChatwitId:inboxId',
          generatedKey: 'chatwit:instagram_template_mapping:test.intent:user123:inbox456',
          timestamp: expect.any(String)
        })
      );
    });
  });

  describe('logApiCacheInvalidation', () => {
    it('should log successful API cache invalidation', () => {
      const context = createCacheLogContext('user123', 'inbox456', 'test.intent', 'invalidateTemplateMapping');
      
      logApiCacheInvalidation(
        'POST /mapeamentos',
        context,
        true,
        'New mapping created',
        { templateId: 'template123', mappingId: 'mapping456' }
      );

      expect(mockConsoleLog).toHaveBeenCalledWith(
        '[API Cache Invalidation] [SUCCESS] POST /mapeamentos:',
        expect.objectContaining({
          apiOperation: 'POST /mapeamentos',
          userContext: { usuarioChatwitId: 'user123', inboxId: 'inbox456' },
          intentName: 'test.intent',
          operation: 'invalidateTemplateMapping',
          success: true,
          reason: 'New mapping created',
          templateId: 'template123',
          mappingId: 'mapping456',
          timestamp: expect.any(String)
        })
      );
    });

    it('should log failed API cache invalidation', () => {
      const context = createCacheLogContext('user123', 'inbox456', 'test.intent', 'invalidateTemplateMapping');
      
      logApiCacheInvalidation(
        'POST /mapeamentos',
        context,
        false,
        'ChatwitInbox not found',
        { error: 'Database connection failed' }
      );

      expect(mockConsoleError).toHaveBeenCalledWith(
        '[API Cache Invalidation] [ERROR] POST /mapeamentos:',
        expect.objectContaining({
          apiOperation: 'POST /mapeamentos',
          success: false,
          reason: 'ChatwitInbox not found',
          error: 'Database connection failed'
        })
      );
    });
  });

  describe('User Context Isolation', () => {
    it('should properly isolate user contexts in logs', () => {
      const context1 = createCacheLogContext('user123', 'inbox456', 'intent1', 'getTemplateMapping');
      const context2 = createCacheLogContext('user789', 'inbox101', 'intent2', 'getTemplateMapping');
      
      logCacheHit({ ...context1, cacheKey: 'key1' }, { latency: 10 });
      logCacheHit({ ...context2, cacheKey: 'key2' }, { latency: 20 });

      expect(mockConsoleLog).toHaveBeenCalledTimes(2);
      
      // Verify first call has correct user context
      expect(mockConsoleLog).toHaveBeenNthCalledWith(1,
        '[Cache] [HIT] getTemplateMapping:',
        expect.objectContaining({
          userContext: { usuarioChatwitId: 'user123', inboxId: 'inbox456' },
          intentName: 'intent1',
          cacheKey: 'key1',
          latency: 10
        })
      );
      
      // Verify second call has different user context
      expect(mockConsoleLog).toHaveBeenNthCalledWith(2,
        '[Cache] [HIT] getTemplateMapping:',
        expect.objectContaining({
          userContext: { usuarioChatwitId: 'user789', inboxId: 'inbox101' },
          intentName: 'intent2',
          cacheKey: 'key2',
          latency: 20
        })
      );
    });
  });

  describe('Cache Key Format Validation', () => {
    it('should log cache key generation with proper format validation', () => {
      const context = createCacheLogContext('user123', 'inbox456', 'test.intent', 'getTemplateMapping');
      const keyComponents = {
        intentName: 'test.intent',
        usuarioChatwitId: 'user123',
        inboxId: 'inbox456',
        bodyLength: 100,
        hasImage: true
      };
      
      logCacheKeyGeneration(
        context,
        keyComponents,
        'chatwit:instagram_conversion_result:intentName:usuarioChatwitId:inboxId:bodyLength:hasImage',
        { generatedKey: 'chatwit:instagram_conversion_result:test.intent:user123:inbox456:100:true' }
      );

      expect(mockConsoleLog).toHaveBeenCalledWith(
        '[Cache] [DEBUG] Key generation for getTemplateMapping:',
        expect.objectContaining({
          keyComponents: expect.objectContaining({
            intentName: 'test.intent',
            usuarioChatwitId: 'user123',
            inboxId: 'inbox456',
            bodyLength: 100,
            hasImage: true
          }),
          keyFormat: 'chatwit:instagram_conversion_result:intentName:usuarioChatwitId:inboxId:bodyLength:hasImage',
          generatedKey: 'chatwit:instagram_conversion_result:test.intent:user123:inbox456:100:true'
        })
      );
    });
  });
});