/**
 * Simplified Cache Isolation Tests
 * 
 * Tests cache isolation between users with a focus on key generation
 * and basic isolation scenarios.
 */

import { InstagramTemplateCache } from '@/lib/cache/instagram-template-cache';
import { CompleteMessageMapping } from '@/lib/dialogflow-database-queries';

// Mock Redis
const mockRedis = {
  get: jest.fn(),
  setex: jest.fn(),
  del: jest.fn(),
  keys: jest.fn(),
  mget: jest.fn(),
  ping: jest.fn(),
  info: jest.fn(),
};

describe('Cache Isolation Simple Tests', () => {
  let cache: InstagramTemplateCache;

  // Test users with shared inboxId
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

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Reset mock implementations
    mockRedis.get.mockResolvedValue(null);
    mockRedis.setex.mockResolvedValue('OK');
    mockRedis.del.mockResolvedValue(1);
    mockRedis.keys.mockResolvedValue([]);
    mockRedis.ping.mockResolvedValue('PONG');
    mockRedis.info.mockResolvedValue('used_memory_human:1M');

    // Create cache instance with mocked Redis
    cache = new InstagramTemplateCache(mockRedis as any);
  });

  describe('Cache Key Generation', () => {
    it('should generate different cache keys for different users with same inboxId and intent', () => {
      // Access private method for testing
      const getCacheKey = (cache as any).getCacheKey.bind(cache);
      
      const key1 = getCacheKey('instagram_template_mapping', 
        `${testUsers.user1.intentName}:${testUsers.user1.usuarioChatwitId}:${testUsers.user1.inboxId}`);
      
      const key2 = getCacheKey('instagram_template_mapping', 
        `${testUsers.user2.intentName}:${testUsers.user2.usuarioChatwitId}:${testUsers.user2.inboxId}`);

      expect(key1).toBe('chatwit:instagram_template_mapping:welcome.intent:user-123:shared-inbox-456');
      expect(key2).toBe('chatwit:instagram_template_mapping:welcome.intent:user-789:shared-inbox-456');
      expect(key1).not.toBe(key2);
    });

    it('should include usuarioChatwitId in cache keys for proper isolation', () => {
      const getCacheKey = (cache as any).getCacheKey.bind(cache);
      
      const key = getCacheKey('instagram_template_mapping', 
        `${testUsers.user1.intentName}:${testUsers.user1.usuarioChatwitId}:${testUsers.user1.inboxId}`);

      expect(key).toContain(testUsers.user1.usuarioChatwitId);
      expect(key).toContain(testUsers.user1.inboxId);
      expect(key).toContain(testUsers.user1.intentName);
    });
  });

  describe('Cache Operations Isolation', () => {
    it('should use different cache keys for different users during get operations', async () => {
      // Mock Redis to return data for user1 only
      mockRedis.get.mockImplementation((key: string) => {
        if (key.includes('user-123')) {
          return Promise.resolve(JSON.stringify({
            mapping: mockMapping1,
            cachedAt: new Date(),
            hitCount: 1,
            lastAccessed: new Date()
          }));
        }
        return Promise.resolve(null);
      });

      // Get template mapping for user1
      await cache.getTemplateMapping(
        testUsers.user1.intentName,
        testUsers.user1.usuarioChatwitId,
        testUsers.user1.inboxId
      );

      // Get template mapping for user2
      await cache.getTemplateMapping(
        testUsers.user2.intentName,
        testUsers.user2.usuarioChatwitId,
        testUsers.user2.inboxId
      );

      // Verify different cache keys were used
      expect(mockRedis.get).toHaveBeenCalledWith(
        'chatwit:instagram_template_mapping:welcome.intent:user-123:shared-inbox-456'
      );
      expect(mockRedis.get).toHaveBeenCalledWith(
        'chatwit:instagram_template_mapping:welcome.intent:user-789:shared-inbox-456'
      );
      expect(mockRedis.get).toHaveBeenCalledTimes(2);
    });

    it('should use different cache keys for different users during set operations', async () => {
      // Set template mapping for user1
      await cache.setTemplateMapping(
        testUsers.user1.intentName,
        testUsers.user1.usuarioChatwitId,
        testUsers.user1.inboxId,
        mockMapping1
      );

      // Set template mapping for user2 (modified mapping)
      const mockMapping2 = { ...mockMapping1, usuarioChatwitId: 'user-789' };
      await cache.setTemplateMapping(
        testUsers.user2.intentName,
        testUsers.user2.usuarioChatwitId,
        testUsers.user2.inboxId,
        mockMapping2
      );

      // Verify different cache keys were used
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
      expect(mockRedis.setex).toHaveBeenCalledTimes(2);
    });
  });

  describe('Cache Invalidation Isolation', () => {
    it('should invalidate cache only for the specific user', async () => {
      // Mock Redis keys to return keys for user1 only
      mockRedis.keys.mockImplementation((pattern: string) => {
        if (pattern.includes('user-123')) {
          return Promise.resolve([
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

      // Verify only user1's keys were searched
      expect(mockRedis.keys).toHaveBeenCalledWith(
        'chatwit:instagram_conversion_result:welcome.intent:user-123:shared-inbox-456:*'
      );

      // Verify deletion included user1's mapping key
      expect(mockRedis.del).toHaveBeenCalledWith(
        'chatwit:instagram_template_mapping:welcome.intent:user-123:shared-inbox-456',
        'chatwit:instagram_conversion_result:welcome.intent:user-123:shared-inbox-456:100:false'
      );

      // Verify user2's cache keys were not searched
      expect(mockRedis.keys).not.toHaveBeenCalledWith(
        expect.stringContaining('user-789')
      );
    });

    it('should handle multiple users with overlapping patterns correctly', async () => {
      // Mock keys to return different results for different patterns
      mockRedis.keys.mockImplementation((pattern: string) => {
        if (pattern.includes('user-123')) {
          return Promise.resolve([
            'chatwit:instagram_conversion_result:welcome.intent:user-123:shared-inbox-456:50:true'
          ]);
        }
        if (pattern.includes('user-789')) {
          return Promise.resolve([
            'chatwit:instagram_conversion_result:welcome.intent:user-789:shared-inbox-456:50:true'
          ]);
        }
        return Promise.resolve([]);
      });

      // Invalidate cache for user2
      await cache.invalidateTemplateMapping(
        testUsers.user2.intentName,
        testUsers.user2.usuarioChatwitId,
        testUsers.user2.inboxId
      );

      // Verify only user2's pattern was searched
      expect(mockRedis.keys).toHaveBeenCalledWith(
        'chatwit:instagram_conversion_result:welcome.intent:user-789:shared-inbox-456:*'
      );

      // Verify only user2's keys were deleted
      expect(mockRedis.del).toHaveBeenCalledWith(
        'chatwit:instagram_template_mapping:welcome.intent:user-789:shared-inbox-456',
        'chatwit:instagram_conversion_result:welcome.intent:user-789:shared-inbox-456:50:true'
      );
    });
  });

  describe('Conversion Result Cache Isolation', () => {
    it('should use different cache keys for conversion results', async () => {
      const conversionResult = {
        fulfillmentMessages: [{ text: { text: ['Welcome!'] } }],
        templateType: 'generic' as const,
        processingTime: 100,
        buttonsCount: 0
      };

      // Set conversion results for both users
      await cache.setConversionResult(
        testUsers.user1.intentName,
        testUsers.user1.usuarioChatwitId,
        testUsers.user1.inboxId,
        100,
        false,
        conversionResult
      );

      await cache.setConversionResult(
        testUsers.user2.intentName,
        testUsers.user2.usuarioChatwitId,
        testUsers.user2.inboxId,
        100,
        false,
        conversionResult
      );

      // Verify different cache keys were used
      expect(mockRedis.setex).toHaveBeenCalledWith(
        'chatwit:instagram_conversion_result:welcome.intent:user-123:shared-inbox-456:100:false',
        expect.any(Number),
        expect.any(String)
      );

      expect(mockRedis.setex).toHaveBeenCalledWith(
        'chatwit:instagram_conversion_result:welcome.intent:user-789:shared-inbox-456:100:false',
        expect.any(Number),
        expect.any(String)
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

      // Verify correct cache keys were used
      expect(mockRedis.get).toHaveBeenCalledWith(
        'chatwit:instagram_conversion_result:welcome.intent:user-123:shared-inbox-456:100:false'
      );
      expect(mockRedis.get).toHaveBeenCalledWith(
        'chatwit:instagram_conversion_result:welcome.intent:user-789:shared-inbox-456:100:false'
      );
    });
  });

  describe('Error Handling with User Context', () => {
    it('should handle Redis errors gracefully without affecting other operations', async () => {
      // Mock Redis to fail for one operation but succeed for others
      let callCount = 0;
      mockRedis.get.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.reject(new Error('Redis connection failed'));
        }
        return Promise.resolve(null);
      });

      // First call should handle error gracefully
      const result1 = await cache.getTemplateMapping(
        testUsers.user1.intentName,
        testUsers.user1.usuarioChatwitId,
        testUsers.user1.inboxId
      );

      // Second call should work normally
      const result2 = await cache.getTemplateMapping(
        testUsers.user2.intentName,
        testUsers.user2.usuarioChatwitId,
        testUsers.user2.inboxId
      );

      // Both should return null (graceful failure and cache miss)
      expect(result1).toBeNull();
      expect(result2).toBeNull();

      // Verify both calls were made with correct keys
      expect(mockRedis.get).toHaveBeenCalledTimes(2);
    });
  });

  describe('Cache Statistics', () => {
    it('should track cache statistics correctly across users', async () => {
      // Mock different responses for different users
      mockRedis.get.mockImplementation((key: string) => {
        if (key.includes('user-123')) {
          return Promise.resolve(JSON.stringify({
            mapping: mockMapping1,
            cachedAt: new Date(),
            hitCount: 1,
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
      ); // Should be a hit

      await cache.getTemplateMapping(
        testUsers.user2.intentName,
        testUsers.user2.usuarioChatwitId,
        testUsers.user2.inboxId
      ); // Should be a miss

      const stats = cache.getStats();

      // Verify statistics are tracked correctly
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
      expect(stats.hitRate).toBe(50); // 1 hit out of 2 total requests
    });
  });

  describe('Real-world Scenario Simulation', () => {
    it('should maintain isolation in a realistic multi-tenant scenario', async () => {
      // Simulate multiple companies using the same WhatsApp Business API
      const companies = [
        {
          usuarioChatwitId: 'company-abc-123',
          inboxId: 'whatsapp-shared-456',
          intentName: 'customer.support'
        },
        {
          usuarioChatwitId: 'company-xyz-789',
          inboxId: 'whatsapp-shared-456', // Same WhatsApp Business Account
          intentName: 'customer.support'   // Same intent
        }
      ];

      const cacheOperations: Array<{ operation: string; key: string; company: string }> = [];

      // Track all cache operations
      mockRedis.get.mockImplementation((key: string) => {
        const company = companies.find(c => key.includes(c.usuarioChatwitId));
        if (company) {
          cacheOperations.push({ 
            operation: 'get', 
            key, 
            company: company.usuarioChatwitId 
          });
        }
        return Promise.resolve(null);
      });

      mockRedis.setex.mockImplementation((key: string) => {
        const company = companies.find(c => key.includes(c.usuarioChatwitId));
        if (company) {
          cacheOperations.push({ 
            operation: 'set', 
            key, 
            company: company.usuarioChatwitId 
          });
        }
        return Promise.resolve('OK');
      });

      // Simulate operations for both companies
      for (const company of companies) {
        await cache.getTemplateMapping(
          company.intentName,
          company.usuarioChatwitId,
          company.inboxId
        );

        await cache.setTemplateMapping(
          company.intentName,
          company.usuarioChatwitId,
          company.inboxId,
          { ...mockMapping1, usuarioChatwitId: company.usuarioChatwitId }
        );
      }

      // Verify operations were properly isolated
      const company1Ops = cacheOperations.filter(op => op.company === 'company-abc-123');
      const company2Ops = cacheOperations.filter(op => op.company === 'company-xyz-789');

      expect(company1Ops.length).toBe(2); // get + set
      expect(company2Ops.length).toBe(2); // get + set

      // Verify no cross-contamination in cache keys
      company1Ops.forEach(op => {
        expect(op.key).toContain('company-abc-123');
        expect(op.key).not.toContain('company-xyz-789');
      });

      company2Ops.forEach(op => {
        expect(op.key).toContain('company-xyz-789');
        expect(op.key).not.toContain('company-abc-123');
      });

      // Verify cache key format
      cacheOperations.forEach(op => {
        const keyParts = op.key.split(':');
        expect(keyParts).toHaveLength(5); // chatwit:prefix:intent:user:inbox
        expect(keyParts[0]).toBe('chatwit');
        expect(keyParts[3]).toBe(op.company); // usuarioChatwitId in correct position
      });
    });
  });
});