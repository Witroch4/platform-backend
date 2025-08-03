/**
 * Comprehensive Cache Isolation Tests
 * 
 * Tests cache isolation between users to ensure that cache operations
 * for one user do not affect cache data for other users, even when
 * they share the same inboxId.
 */

import { PrismaClient } from '@prisma/client';
import { InstagramTemplateCache } from '@/lib/cache/instagram-template-cache';
import { findOptimizedCompleteMessageMapping } from '@/lib/instagram/optimized-database-queries';
import { CompleteMessageMapping } from '@/lib/dialogflow-database-queries';
import { getRedisInstance } from '../../lib/connections';

// Mock Redis for testing
jest.mock('ioredis');
const MockedIORedis = IORedis as jest.MockedClass<typeof IORedis>;

// Mock Prisma
jest.mock('@prisma/client');
const MockedPrismaClient = PrismaClient as jest.MockedClass<typeof PrismaClient>;

describe('Cache Isolation Tests', () => {
  let mockRedis: jest.Mocked<IORedis>;
  let mockPrisma: jest.Mocked<PrismaClient>;
  let cache: InstagramTemplateCache;

  // Test data for multiple users
  const testUsers = {
    user1: {
      usuarioChatwitId: 'user-123',
      inboxId: 'shared-inbox-456',
      intentName: 'welcome.intent'
    },
    user2: {
      usuarioChatwitId: 'user-789',
      inboxId: 'shared-inbox-456', // Same inboxId as user1
      intentName: 'welcome.intent'  // Same intent as user1
    },
    user3: {
      usuarioChatwitId: 'user-999',
      inboxId: 'different-inbox-101',
      intentName: 'welcome.intent'
    }
  };

  const mockMapping1: CompleteMessageMapping = {
    id: 'mapping-1',
    intentName: 'welcome.intent',
    caixaEntradaId: 'internal-inbox-1',
    usuarioChatwitId: 'user-123',
    messageType: 'unified_template',
    unifiedTemplate: {
      id: 'template-1',
      name: 'Welcome Template User 1',
      type: 'INTERACTIVE_MESSAGE',
      scope: 'user',
      language: 'pt-BR',
      interactiveContent: { body: { text: 'Welcome User 1!' } },
      whatsappOfficialInfo: null
    },
    whatsappConfig: {
      phoneNumberId: 'phone-1',
      whatsappToken: 'token-1',
      whatsappBusinessAccountId: 'business-1',
      fbGraphApiBase: 'https://graph.facebook.com/v22.0'
    }
  };

  const mockMapping2: CompleteMessageMapping = {
    id: 'mapping-2',
    intentName: 'welcome.intent',
    caixaEntradaId: 'internal-inbox-2',
    usuarioChatwitId: 'user-789',
    messageType: 'unified_template',
    unifiedTemplate: {
      id: 'template-2',
      name: 'Welcome Template User 2',
      type: 'INTERACTIVE_MESSAGE',
      scope: 'user',
      language: 'pt-BR',
      interactiveContent: { body: { text: 'Welcome User 2!' } },
      whatsappOfficialInfo: null
    },
    whatsappConfig: {
      phoneNumberId: 'phone-2',
      whatsappToken: 'token-2',
      whatsappBusinessAccountId: 'business-2',
      fbGraphApiBase: 'https://graph.facebook.com/v22.0'
    }
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup mock Redis
    mockRedis = {
      get: jest.fn(),
      setex: jest.fn(),
      del: jest.fn(),
      keys: jest.fn(),
      mget: jest.fn(),
      ping: jest.fn(),
      info: jest.fn(),
    } as any;

    MockedIORedis.mockImplementation(() => mockRedis);

    // Setup mock Prisma
    mockPrisma = {
      chatwitInbox: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
      },
      mapeamentoIntencao: {
        findUnique: jest.fn(),
      },
      $disconnect: jest.fn(),
    } as any;

    MockedPrismaClient.mockImplementation(() => mockPrisma);

    // Create cache instance with mocked Redis
    cache = new InstagramTemplateCache(mockRedis);
  });

  describe('Cache Key Isolation', () => {
    it('should generate different cache keys for different users with same inboxId and intent', async () => {
      const key1 = cache['getCacheKey']('instagram_template_mapping', 
        `${testUsers.user1.intentName}:${testUsers.user1.usuarioChatwitId}:${testUsers.user1.inboxId}`);
      
      const key2 = cache['getCacheKey']('instagram_template_mapping', 
        `${testUsers.user2.intentName}:${testUsers.user2.usuarioChatwitId}:${testUsers.user2.inboxId}`);

      expect(key1).toBe('chatwit:instagram_template_mapping:welcome.intent:user-123:shared-inbox-456');
      expect(key2).toBe('chatwit:instagram_template_mapping:welcome.intent:user-789:shared-inbox-456');
      expect(key1).not.toBe(key2);
    });

    it('should isolate cache operations between users', async () => {
      // Mock Redis responses for different users
      mockRedis.get.mockImplementation((key: string) => {
        if (key.includes('user-123')) {
          return Promise.resolve(JSON.stringify({
            mapping: mockMapping1,
            cachedAt: new Date(),
            hitCount: 1,
            lastAccessed: new Date()
          }));
        }
        if (key.includes('user-789')) {
          return Promise.resolve(null); // Cache miss for user2
        }
        return Promise.resolve(null);
      });

      // Get template mapping for user1 (should hit cache)
      const result1 = await cache.getTemplateMapping(
        testUsers.user1.intentName,
        testUsers.user1.usuarioChatwitId,
        testUsers.user1.inboxId
      );

      // Get template mapping for user2 (should miss cache)
      const result2 = await cache.getTemplateMapping(
        testUsers.user2.intentName,
        testUsers.user2.usuarioChatwitId,
        testUsers.user2.inboxId
      );

      expect(result1).toEqual(mockMapping1);
      expect(result2).toBeNull();

      // Verify correct cache keys were used
      expect(mockRedis.get).toHaveBeenCalledWith('chatwit:instagram_template_mapping:welcome.intent:user-123:shared-inbox-456');
      expect(mockRedis.get).toHaveBeenCalledWith('chatwit:instagram_template_mapping:welcome.intent:user-789:shared-inbox-456');
    });
  });

  describe('Cache Invalidation Isolation', () => {
    it('should invalidate cache only for the specific user', async () => {
      // Mock Redis keys method to return keys for both users
      mockRedis.keys.mockImplementation((pattern: string) => {
        if (pattern.includes('user-123')) {
          return Promise.resolve([
            'chatwit:instagram_template_mapping:welcome.intent:user-123:shared-inbox-456',
            'chatwit:instagram_conversion_result:welcome.intent:user-123:shared-inbox-456:100:false'
          ]);
        }
        return Promise.resolve([]);
      });

      mockRedis.del.mockResolvedValue(2);

      // Invalidate cache for user1
      await cache.invalidateTemplateMapping(
        testUsers.user1.intentName,
        testUsers.user1.usuarioChatwitId,
        testUsers.user1.inboxId
      );

      // Verify only user1's keys were searched and deleted
      expect(mockRedis.keys).toHaveBeenCalledWith('chatwit:instagram_conversion_result:welcome.intent:user-123:shared-inbox-456:*');
      expect(mockRedis.del).toHaveBeenCalledWith(
        'chatwit:instagram_template_mapping:welcome.intent:user-123:shared-inbox-456',
        'chatwit:instagram_conversion_result:welcome.intent:user-123:shared-inbox-456:100:false'
      );

      // Verify user2's cache keys were not affected
      expect(mockRedis.keys).not.toHaveBeenCalledWith(expect.stringContaining('user-789'));
    });

    it('should handle invalidation when users have overlapping cache patterns', async () => {
      // Mock keys to return results for both users
      mockRedis.keys.mockImplementation((pattern: string) => {
        if (pattern.includes('user-123')) {
          return Promise.resolve([
            'chatwit:instagram_conversion_result:welcome.intent:user-123:shared-inbox-456:50:true',
            'chatwit:instagram_conversion_result:welcome.intent:user-123:shared-inbox-456:100:false'
          ]);
        }
        if (pattern.includes('user-789')) {
          return Promise.resolve([
            'chatwit:instagram_conversion_result:welcome.intent:user-789:shared-inbox-456:50:true',
            'chatwit:instagram_conversion_result:welcome.intent:user-789:shared-inbox-456:75:false'
          ]);
        }
        return Promise.resolve([]);
      });

      mockRedis.del.mockResolvedValue(3);

      // Invalidate cache for user2
      await cache.invalidateTemplateMapping(
        testUsers.user2.intentName,
        testUsers.user2.usuarioChatwitId,
        testUsers.user2.inboxId
      );

      // Verify only user2's keys were deleted
      expect(mockRedis.del).toHaveBeenCalledWith(
        'chatwit:instagram_template_mapping:welcome.intent:user-789:shared-inbox-456',
        'chatwit:instagram_conversion_result:welcome.intent:user-789:shared-inbox-456:50:true',
        'chatwit:instagram_conversion_result:welcome.intent:user-789:shared-inbox-456:75:false'
      );

      // Verify user1's keys were not included in deletion
      expect(mockRedis.del).not.toHaveBeenCalledWith(
        expect.stringContaining('user-123')
      );
    });
  });

  describe('Database Query Integration', () => {
    it('should return correct user-specific data from database queries', async () => {
      // Mock database responses for different users
      mockPrisma.chatwitInbox.findFirst
        .mockResolvedValueOnce({
          id: 'internal-inbox-1',
          inboxId: 'shared-inbox-456',
          usuarioChatwitId: 'user-123',
          nome: 'Inbox User 1',
          whatsappApiKey: null,
          phoneNumberId: null,
          whatsappBusinessAccountId: null,
          usuarioChatwit: {
            id: 'user-123',
            configuracaoGlobalWhatsApp: {
              phoneNumberId: 'phone-1',
              whatsappApiKey: 'token-1',
              whatsappBusinessAccountId: 'business-1',
              graphApiBaseUrl: 'https://graph.facebook.com/v22.0'
            }
          }
        } as any)
        .mockResolvedValueOnce({
          id: 'internal-inbox-2',
          inboxId: 'shared-inbox-456',
          usuarioChatwitId: 'user-789',
          nome: 'Inbox User 2',
          whatsappApiKey: null,
          phoneNumberId: null,
          whatsappBusinessAccountId: null,
          usuarioChatwit: {
            id: 'user-789',
            configuracaoGlobalWhatsApp: {
              phoneNumberId: 'phone-2',
              whatsappApiKey: 'token-2',
              whatsappBusinessAccountId: 'business-2',
              graphApiBaseUrl: 'https://graph.facebook.com/v22.0'
            }
          }
        } as any);

      mockPrisma.mapeamentoIntencao.findUnique
        .mockResolvedValueOnce({
          id: 'mapping-1',
          intentName: 'welcome.intent',
          inboxId: 'internal-inbox-1',
          template: {
            id: 'template-1',
            name: 'Welcome Template User 1',
            type: 'INTERACTIVE_MESSAGE',
            scope: 'user',
            description: null,
            language: 'pt-BR',
            simpleReplyText: null,
            interactiveContent: { body: { text: 'Welcome User 1!' } },
            whatsappOfficialInfo: null
          }
        } as any)
        .mockResolvedValueOnce({
          id: 'mapping-2',
          intentName: 'welcome.intent',
          inboxId: 'internal-inbox-2',
          template: {
            id: 'template-2',
            name: 'Welcome Template User 2',
            type: 'INTERACTIVE_MESSAGE',
            scope: 'user',
            description: null,
            language: 'pt-BR',
            simpleReplyText: null,
            interactiveContent: { body: { text: 'Welcome User 2!' } },
            whatsappOfficialInfo: null
          }
        } as any);

      // Mock cache misses for both users
      mockRedis.get.mockResolvedValue(null);
      mockRedis.setex.mockResolvedValue('OK');

      // Query for user1
      const result1 = await findOptimizedCompleteMessageMapping(
        testUsers.user1.intentName,
        testUsers.user1.inboxId
      );

      // Query for user2 (same inboxId, same intent)
      const result2 = await findOptimizedCompleteMessageMapping(
        testUsers.user2.intentName,
        testUsers.user2.inboxId
      );

      // Verify results are user-specific
      expect(result1).toBeDefined();
      expect(result1?.usuarioChatwitId).toBe('user-123');
      expect(result1?.unifiedTemplate?.name).toBe('Welcome Template User 1');

      expect(result2).toBeDefined();
      expect(result2?.usuarioChatwitId).toBe('user-789');
      expect(result2?.unifiedTemplate?.name).toBe('Welcome Template User 2');

      // Verify different cache keys were used for caching
      expect(mockRedis.setex).toHaveBeenCalledWith(
        'chatwit:instagram_template_mapping:welcome.intent:user-123:shared-inbox-456',
        expect.any(Number),
        expect.any(String)
      );
      expect(mockRedis.setex).toHaveBeenCalledWith(
        'chatwit:instagram_template_mapping:welcome.intent:user-789:shared-inbox-456',
        expect.any(Number),
        expect.any(String)
      );
    });
  });

  describe('Conversion Result Cache Isolation', () => {
    it('should isolate conversion results between users', async () => {
      const conversionResult1 = {
        fulfillmentMessages: [{ text: { text: ['Welcome User 1!'] } }],
        templateType: 'generic' as const,
        processingTime: 100,
        buttonsCount: 0
      };

      const conversionResult2 = {
        fulfillmentMessages: [{ text: { text: ['Welcome User 2!'] } }],
        templateType: 'generic' as const,
        processingTime: 150,
        buttonsCount: 0
      };

      mockRedis.setex.mockResolvedValue('OK');

      // Set conversion results for both users
      await cache.setConversionResult(
        testUsers.user1.intentName,
        testUsers.user1.usuarioChatwitId,
        testUsers.user1.inboxId,
        100,
        false,
        conversionResult1
      );

      await cache.setConversionResult(
        testUsers.user2.intentName,
        testUsers.user2.usuarioChatwitId,
        testUsers.user2.inboxId,
        100,
        false,
        conversionResult2
      );

      // Verify different cache keys were used
      expect(mockRedis.setex).toHaveBeenCalledWith(
        'chatwit:instagram_conversion_result:welcome.intent:user-123:shared-inbox-456:100:false',
        expect.any(Number),
        expect.stringContaining('Welcome User 1!')
      );

      expect(mockRedis.setex).toHaveBeenCalledWith(
        'chatwit:instagram_conversion_result:welcome.intent:user-789:shared-inbox-456:100:false',
        expect.any(Number),
        expect.stringContaining('Welcome User 2!')
      );
    });

    it('should retrieve correct conversion results for each user', async () => {
      // Mock Redis to return different results for different users
      mockRedis.get.mockImplementation((key: string) => {
        if (key.includes('user-123')) {
          return Promise.resolve(JSON.stringify({
            fulfillmentMessages: [{ text: { text: ['Welcome User 1!'] } }],
            templateType: 'generic',
            processingTime: 100,
            cachedAt: new Date(),
            originalBodyLength: 100,
            buttonsCount: 0,
            hasImage: false
          }));
        }
        if (key.includes('user-789')) {
          return Promise.resolve(JSON.stringify({
            fulfillmentMessages: [{ text: { text: ['Welcome User 2!'] } }],
            templateType: 'generic',
            processingTime: 150,
            cachedAt: new Date(),
            originalBodyLength: 100,
            buttonsCount: 0,
            hasImage: false
          }));
        }
        return Promise.resolve(null);
      });

      // Get conversion results for both users
      const result1 = await cache.getConversionResult(
        testUsers.user1.intentName,
        testUsers.user1.usuarioChatwitId,
        testUsers.user1.inboxId,
        100,
        false
      );

      const result2 = await cache.getConversionResult(
        testUsers.user2.intentName,
        testUsers.user2.usuarioChatwitId,
        testUsers.user2.inboxId,
        100,
        false
      );

      // Verify user-specific results
      expect(result1?.fulfillmentMessages[0].text.text[0]).toBe('Welcome User 1!');
      expect(result1?.processingTime).toBe(100);

      expect(result2?.fulfillmentMessages[0].text.text[0]).toBe('Welcome User 2!');
      expect(result2?.processingTime).toBe(150);
    });
  });

  describe('Batch Operations Isolation', () => {
    it('should handle batch operations with proper user isolation', async () => {
      const requests = [
        { intentName: 'welcome.intent', inboxId: 'shared-inbox-456' },
        { intentName: 'goodbye.intent', inboxId: 'shared-inbox-456' }
      ];

      // Mock batch cache lookup
      mockRedis.mget.mockResolvedValue([null, null]); // Cache misses

      // Mock individual queries for different users
      mockPrisma.chatwitInbox.findFirst
        .mockResolvedValueOnce({
          usuarioChatwitId: 'user-123'
        } as any)
        .mockResolvedValueOnce({
          usuarioChatwitId: 'user-789'
        } as any);

      mockPrisma.mapeamentoIntencao.findUnique
        .mockResolvedValueOnce(null) // No mapping for user-123
        .mockResolvedValueOnce({    // Mapping for user-789
          id: 'mapping-goodbye',
          intentName: 'goodbye.intent',
          inboxId: 'internal-inbox-2',
          template: {
            id: 'template-goodbye',
            name: 'Goodbye Template',
            type: 'INTERACTIVE_MESSAGE',
            scope: 'user',
            description: null,
            language: 'pt-BR',
            simpleReplyText: null,
            interactiveContent: { body: { text: 'Goodbye!' } },
            whatsappOfficialInfo: null
          }
        } as any);

      const results = await cache.batchGetTemplateMappings(requests);

      // Verify results are properly isolated
      expect(results.get('welcome.intent:shared-inbox-456')).toBeNull();
      expect(results.get('goodbye.intent:shared-inbox-456')).toBeNull();

      // Verify correct cache keys were attempted
      expect(mockRedis.mget).toHaveBeenCalledWith(
        'chatwit:instagram_template_mapping:welcome.intent:shared-inbox-456',
        'chatwit:instagram_template_mapping:goodbye.intent:shared-inbox-456'
      );
    });
  });

  describe('Error Handling with User Context', () => {
    it('should handle Redis errors without affecting other users', async () => {
      // Mock Redis to fail for user1 but succeed for user2
      mockRedis.get.mockImplementation((key: string) => {
        if (key.includes('user-123')) {
          return Promise.reject(new Error('Redis connection failed'));
        }
        if (key.includes('user-789')) {
          return Promise.resolve(JSON.stringify({
            mapping: mockMapping2,
            cachedAt: new Date(),
            hitCount: 1,
            lastAccessed: new Date()
          }));
        }
        return Promise.resolve(null);
      });

      // Get template mapping for user1 (should handle error gracefully)
      const result1 = await cache.getTemplateMapping(
        testUsers.user1.intentName,
        testUsers.user1.usuarioChatwitId,
        testUsers.user1.inboxId
      );

      // Get template mapping for user2 (should succeed)
      const result2 = await cache.getTemplateMapping(
        testUsers.user2.intentName,
        testUsers.user2.usuarioChatwitId,
        testUsers.user2.inboxId
      );

      // Verify error handling doesn't affect other users
      expect(result1).toBeNull(); // Graceful failure
      expect(result2).toEqual(mockMapping2); // Success for user2
    });
  });

  describe('Cache Statistics Isolation', () => {
    it('should track cache statistics without user cross-contamination', async () => {
      // Mock different responses for different users
      mockRedis.get.mockImplementation((key: string) => {
        if (key.includes('user-123')) {
          return Promise.resolve(JSON.stringify({
            mapping: mockMapping1,
            cachedAt: new Date(),
            hitCount: 5,
            lastAccessed: new Date()
          }));
        }
        return Promise.resolve(null);
      });

      // Perform operations for both users
      await cache.getTemplateMapping(
        testUsers.user1.intentName,
        testUsers.user1.usuarioChatwitId,
        testUsers.user1.inboxId
      ); // Hit

      await cache.getTemplateMapping(
        testUsers.user2.intentName,
        testUsers.user2.usuarioChatwitId,
        testUsers.user2.inboxId
      ); // Miss

      const stats = cache.getStats();

      // Verify statistics are tracked correctly
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
      expect(stats.hitRate).toBe(50); // 1 hit out of 2 total requests
    });
  });
});