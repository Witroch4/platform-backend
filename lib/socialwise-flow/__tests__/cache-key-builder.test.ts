/**
 * Unit tests for SocialWise Flow Cache Key Builder
 * Tests secure key generation, HMAC hashing, and collision prevention
 */

import { 
  SocialWiseCacheKeyBuilder, 
  socialWiseCacheKeyBuilder,
  buildCacheKey,
  parseCacheKey,
  validateCacheKey,
  CACHE_TTL 
} from '../cache-key-builder';

describe('SocialWiseCacheKeyBuilder', () => {
  let keyBuilder: SocialWiseCacheKeyBuilder;
  
  const mockConfig = {
    accountId: '123',
    inboxId: '456',
    agentId: '789',
    model: 'gpt-4o-mini',
    promptVersion: 'v1.2',
    channelType: 'whatsapp' as const,
    embedipreview: true,
  };

  beforeEach(() => {
    keyBuilder = new SocialWiseCacheKeyBuilder();
    // Set test environment
    process.env.NODE_ENV = 'test';
    process.env.SOCIALWISE_CACHE_HMAC_SECRET = 'test-secret-key-for-hmac';
  });

  afterEach(() => {
    delete process.env.SOCIALWISE_CACHE_HMAC_SECRET;
  });

  describe('Constructor and Environment Handling', () => {
    it('should use environment-specific HMAC secret', () => {
      process.env.SOCIALWISE_CACHE_HMAC_SECRET = 'custom-secret';
      const builder = new SocialWiseCacheKeyBuilder();
      expect(builder).toBeDefined();
    });

    it('should fallback to NEXTAUTH_SECRET if SOCIALWISE_CACHE_HMAC_SECRET not set', () => {
      delete process.env.SOCIALWISE_CACHE_HMAC_SECRET;
      process.env.NEXTAUTH_SECRET = 'nextauth-secret';
      const builder = new SocialWiseCacheKeyBuilder();
      expect(builder).toBeDefined();
    });

    it('should throw error in production without proper secret', () => {
      delete process.env.SOCIALWISE_CACHE_HMAC_SECRET;
      delete process.env.NEXTAUTH_SECRET;
      process.env.NODE_ENV = 'production';
      
      expect(() => new SocialWiseCacheKeyBuilder()).toThrow(
        'SOCIALWISE_CACHE_HMAC_SECRET must be set in production'
      );
      
      process.env.NODE_ENV = 'test';
    });
  });

  describe('Classification Keys', () => {
    it('should generate consistent classification keys for same input', () => {
      const userText = 'Preciso de ajuda com meu processo';
      
      const key1 = keyBuilder.buildClassificationKey(mockConfig, userText);
      const key2 = keyBuilder.buildClassificationKey(mockConfig, userText);
      
      expect(key1).toBe(key2);
      expect(key1).toMatch(/^sw:test:acc123:inb456:agt789:ms:gpt-4o-mini:pv1\.2:chan:whatsapp:ep:true:classify:[a-f0-9]{16}$/);
    });

    it('should generate different keys for different user text', () => {
      const text1 = 'Preciso de ajuda com meu processo';
      const text2 = 'Quero cancelar minha conta';
      
      const key1 = keyBuilder.buildClassificationKey(mockConfig, text1);
      const key2 = keyBuilder.buildClassificationKey(mockConfig, text2);
      
      expect(key1).not.toBe(key2);
    });

    it('should normalize text before hashing', () => {
      const text1 = '  Preciso   de   ajuda  ';
      const text2 = 'preciso de ajuda';
      const text3 = 'PRECISO DE AJUDA';
      
      const key1 = keyBuilder.buildClassificationKey(mockConfig, text1);
      const key2 = keyBuilder.buildClassificationKey(mockConfig, text2);
      const key3 = keyBuilder.buildClassificationKey(mockConfig, text3);
      
      expect(key1).toBe(key2);
      expect(key2).toBe(key3);
    });

    it('should throw error for empty user text', () => {
      expect(() => keyBuilder.buildClassificationKey(mockConfig, '')).toThrow(
        'User text must be a non-empty string'
      );
      expect(() => keyBuilder.buildClassificationKey(mockConfig, null as any)).toThrow(
        'User text must be a non-empty string'
      );
    });
  });

  describe('Warmup Keys', () => {
    it('should generate consistent warmup keys for same input', () => {
      const userText = 'Preciso de ajuda';
      const candidates = [
        { slug: 'help_general', desc: 'Ajuda geral' },
        { slug: 'help_specific', desc: 'Ajuda específica' },
      ];
      
      const key1 = keyBuilder.buildWarmupKey(mockConfig, userText, candidates);
      const key2 = keyBuilder.buildWarmupKey(mockConfig, userText, candidates);
      
      expect(key1).toBe(key2);
      expect(key1).toMatch(/^sw:test:acc123:inb456:agt789:ms:gpt-4o-mini:pv1\.2:chan:whatsapp:ep:true:warmup:[a-f0-9]{16}$/);
    });

    it('should generate same key regardless of candidate order', () => {
      const userText = 'Preciso de ajuda';
      const candidates1 = [
        { slug: 'help_general' },
        { slug: 'help_specific' },
      ];
      const candidates2 = [
        { slug: 'help_specific' },
        { slug: 'help_general' },
      ];
      
      const key1 = keyBuilder.buildWarmupKey(mockConfig, userText, candidates1);
      const key2 = keyBuilder.buildWarmupKey(mockConfig, userText, candidates2);
      
      expect(key1).toBe(key2);
    });

    it('should generate different keys for different candidates', () => {
      const userText = 'Preciso de ajuda';
      const candidates1 = [{ slug: 'help_general' }];
      const candidates2 = [{ slug: 'help_specific' }];
      
      const key1 = keyBuilder.buildWarmupKey(mockConfig, userText, candidates1);
      const key2 = keyBuilder.buildWarmupKey(mockConfig, userText, candidates2);
      
      expect(key1).not.toBe(key2);
    });
  });

  describe('Short Title Keys', () => {
    it('should generate consistent short title keys', () => {
      const intentSlug = 'help_general';
      
      const key1 = keyBuilder.buildShortTitleKey(mockConfig, intentSlug);
      const key2 = keyBuilder.buildShortTitleKey(mockConfig, intentSlug);
      
      expect(key1).toBe(key2);
      expect(key1).toBe('sw:test:acc123:inb456:agt789:ms:gpt-4o-mini:pv1.2:chan:whatsapp:ep:true:stitle:help_general');
    });

    it('should clean intent slugs', () => {
      const dirtySlug = 'Help-General@123!';
      const key = keyBuilder.buildShortTitleKey(mockConfig, dirtySlug);
      
      expect(key).toContain(':stitle:help-general');
    });

    it('should throw error for empty intent slug', () => {
      expect(() => keyBuilder.buildShortTitleKey(mockConfig, '')).toThrow(
        'Intent slug must be a non-empty string'
      );
    });
  });

  describe('Confirmation Keys', () => {
    it('should generate consistent confirmation keys', () => {
      const userText = 'Preciso de ajuda';
      const intentSlug = 'help_general';
      
      const key1 = keyBuilder.buildConfirmationKey(mockConfig, userText, intentSlug);
      const key2 = keyBuilder.buildConfirmationKey(mockConfig, userText, intentSlug);
      
      expect(key1).toBe(key2);
      expect(key1).toMatch(/^sw:test:acc123:inb456:agt789:ms:gpt-4o-mini:pv1\.2:chan:whatsapp:ep:true:confirm:[a-f0-9]{16}$/);
    });

    it('should generate different keys for different intents', () => {
      const userText = 'Preciso de ajuda';
      
      const key1 = keyBuilder.buildConfirmationKey(mockConfig, userText, 'help_general');
      const key2 = keyBuilder.buildConfirmationKey(mockConfig, userText, 'help_specific');
      
      expect(key1).not.toBe(key2);
    });
  });

  describe('Embedding Keys', () => {
    it('should generate consistent embedding keys', () => {
      const text = 'Preciso de ajuda com meu processo';
      
      const key1 = keyBuilder.buildEmbeddingKey(mockConfig, text);
      const key2 = keyBuilder.buildEmbeddingKey(mockConfig, text);
      
      expect(key1).toBe(key2);
      expect(key1).toMatch(/^sw:test:acc123:inb456:agt789:ms:gpt-4o-mini:pv1\.2:chan:whatsapp:ep:true:emb:[a-f0-9]{16}$/);
    });
  });

  describe('Idempotency Keys', () => {
    it('should generate consistent idempotency keys', () => {
      const wamid = 'wamid.ABC123DEF456';
      
      const key1 = keyBuilder.buildIdempotencyKey(mockConfig, wamid);
      const key2 = keyBuilder.buildIdempotencyKey(mockConfig, wamid);
      
      expect(key1).toBe(key2);
      expect(key1).toBe('sw:test:acc123:inb456:agt789:ms:gpt-4o-mini:pv1.2:chan:whatsapp:ep:true:idem:wamid.ABC123DEF456');
    });

    it('should clean WAMIDs', () => {
      const dirtyWamid = 'wamid.ABC@123#DEF$456';
      const key = keyBuilder.buildIdempotencyKey(mockConfig, dirtyWamid);
      
      expect(key).toContain(':idem:wamid.ABC123DEF456');
    });

    it('should throw error for empty WAMID', () => {
      expect(() => keyBuilder.buildIdempotencyKey(mockConfig, '')).toThrow(
        'WAMID must be a non-empty string'
      );
    });
  });

  describe('Nonce Keys', () => {
    it('should generate consistent nonce keys', () => {
      const nonce = 'nonce-123-abc';
      
      const key1 = keyBuilder.buildNonceKey(mockConfig, nonce);
      const key2 = keyBuilder.buildNonceKey(mockConfig, nonce);
      
      expect(key1).toBe(key2);
      expect(key1).toBe('sw:test:acc123:inb456:agt789:ms:gpt-4o-mini:pv1.2:chan:whatsapp:ep:true:nonce:nonce-123-abc');
    });

    it('should throw error for empty nonce', () => {
      expect(() => keyBuilder.buildNonceKey(mockConfig, '')).toThrow(
        'Nonce must be a non-empty string'
      );
    });
  });

  describe('Rate Limit Keys', () => {
    it('should generate consistent rate limit keys', () => {
      const identifier = 'user-123';
      
      const key1 = keyBuilder.buildRateLimitKey(mockConfig, identifier);
      const key2 = keyBuilder.buildRateLimitKey(mockConfig, identifier);
      
      expect(key1).toBe(key2);
      expect(key1).toMatch(/^sw:test:acc123:inb456:agt789:ms:gpt-4o-mini:pv1\.2:chan:whatsapp:ep:true:rate:[a-f0-9]{16}$/);
    });

    it('should hash identifiers to avoid PII', () => {
      const identifier1 = 'user@example.com';
      const identifier2 = 'different@example.com';
      
      const key1 = keyBuilder.buildRateLimitKey(mockConfig, identifier1);
      const key2 = keyBuilder.buildRateLimitKey(mockConfig, identifier2);
      
      expect(key1).not.toBe(key2);
      expect(key1).not.toContain('user@example.com');
      expect(key2).not.toContain('different@example.com');
    });
  });

  describe('Health Keys', () => {
    it('should generate consistent health keys', () => {
      const component = 'embedding-service';
      
      const key1 = keyBuilder.buildHealthKey(mockConfig, component);
      const key2 = keyBuilder.buildHealthKey(mockConfig, component);
      
      expect(key1).toBe(key2);
      expect(key1).toBe('sw:test:acc123:inb456:agt789:ms:gpt-4o-mini:pv1.2:chan:whatsapp:ep:true:health:embedding-service');
    });

    it('should clean component names', () => {
      const dirtyComponent = 'Embedding@Service#123!';
      const key = keyBuilder.buildHealthKey(mockConfig, dirtyComponent);
      
      expect(key).toContain(':health:embeddingservice');
    });
  });

  describe('Key Parsing and Validation', () => {
    it('should parse valid cache keys correctly', () => {
      const key = 'sw:test:acc123:inb456:agt789:ms:gpt-4o-mini:pv1.2:chan:whatsapp:ep:true:classify:abc123def456';
      const parsed = keyBuilder.parseKey(key);
      
      expect(parsed).toEqual({
        environment: 'test',
        accountId: '123',
        inboxId: '456',
        agentId: '789',
        model: 'gpt-4o-mini',
        promptVersion: '1.2',
        channelType: 'whatsapp',
        embedipreview: true,
        keyType: 'classify',
        identifier: 'abc123def456',
      });
    });

    it('should return null for invalid cache keys', () => {
      const invalidKeys = [
        'invalid-key',
        'sw:test:invalid',
        'different:prefix:acc123:inb456',
        '',
      ];
      
      for (const key of invalidKeys) {
        expect(keyBuilder.parseKey(key)).toBeNull();
      }
    });

    it('should validate cache keys correctly', () => {
      const validKey = 'sw:test:acc123:inb456:agt789:ms:gpt-4o-mini:pv1.2:chan:whatsapp:ep:true:classify:abc123';
      const invalidKey = 'invalid-key-format';
      
      expect(keyBuilder.validateKey(validKey)).toBe(true);
      expect(keyBuilder.validateKey(invalidKey)).toBe(false);
    });
  });

  describe('TTL Management', () => {
    it('should return correct TTL for each key type', () => {
      expect(keyBuilder.getTTL('classify')).toBe(CACHE_TTL.CLASSIFY);
      expect(keyBuilder.getTTL('warmup')).toBe(CACHE_TTL.WARMUP);
      expect(keyBuilder.getTTL('stitle')).toBe(CACHE_TTL.STITLE);
      expect(keyBuilder.getTTL('confirm')).toBe(CACHE_TTL.CONFIRM);
      expect(keyBuilder.getTTL('emb')).toBe(CACHE_TTL.EMBEDDING);
      expect(keyBuilder.getTTL('idem')).toBe(CACHE_TTL.IDEMPOTENCY);
      expect(keyBuilder.getTTL('nonce')).toBe(CACHE_TTL.NONCE);
      expect(keyBuilder.getTTL('rate')).toBe(CACHE_TTL.RATE_LIMIT);
      expect(keyBuilder.getTTL('health')).toBe(CACHE_TTL.HEALTH);
    });

    it('should throw error for unknown key type', () => {
      expect(() => keyBuilder.getTTL('unknown' as any)).toThrow(
        'Unknown cache key type: unknown'
      );
    });
  });

  describe('buildKeyWithTTL', () => {
    it('should build classification key with TTL', () => {
      const result = keyBuilder.buildKeyWithTTL('classify', mockConfig, 'test text');
      
      expect(result.key).toMatch(/^sw:test:acc123:inb456:agt789:ms:gpt-4o-mini:pv1\.2:chan:whatsapp:ep:true:classify:[a-f0-9]{16}$/);
      expect(result.ttl).toBe(CACHE_TTL.CLASSIFY);
    });

    it('should build warmup key with TTL', () => {
      const candidates = [{ slug: 'test' }];
      const result = keyBuilder.buildKeyWithTTL('warmup', mockConfig, 'test text', candidates);
      
      expect(result.key).toMatch(/^sw:test:acc123:inb456:agt789:ms:gpt-4o-mini:pv1\.2:chan:whatsapp:ep:true:warmup:[a-f0-9]{16}$/);
      expect(result.ttl).toBe(CACHE_TTL.WARMUP);
    });

    it('should build short title key with TTL', () => {
      const result = keyBuilder.buildKeyWithTTL('stitle', mockConfig, 'test_intent');
      
      expect(result.key).toBe('sw:test:acc123:inb456:agt789:ms:gpt-4o-mini:pv1.2:chan:whatsapp:ep:true:stitle:test_intent');
      expect(result.ttl).toBe(CACHE_TTL.STITLE);
    });
  });

  describe('Configuration Validation', () => {
    it('should throw error for missing required config fields', () => {
      const incompleteConfigs = [
        { ...mockConfig, accountId: '' },
        { ...mockConfig, inboxId: '' },
        { ...mockConfig, agentId: '' },
        { ...mockConfig, model: '' },
        { ...mockConfig, promptVersion: '' },
        { ...mockConfig, channelType: '' as any },
      ];
      
      for (const config of incompleteConfigs) {
        expect(() => keyBuilder.buildClassificationKey(config, 'test')).toThrow();
      }
    });
  });

  describe('Collision Prevention', () => {
    it('should generate different keys for different configurations', () => {
      const config1 = { ...mockConfig, accountId: '123' };
      const config2 = { ...mockConfig, accountId: '124' };
      const userText = 'same text';
      
      const key1 = keyBuilder.buildClassificationKey(config1, userText);
      const key2 = keyBuilder.buildClassificationKey(config2, userText);
      
      expect(key1).not.toBe(key2);
    });

    it('should generate different keys for different channel types', () => {
      const config1 = { ...mockConfig, channelType: 'whatsapp' as const };
      const config2 = { ...mockConfig, channelType: 'instagram' as const };
      const userText = 'same text';
      
      const key1 = keyBuilder.buildClassificationKey(config1, userText);
      const key2 = keyBuilder.buildClassificationKey(config2, userText);
      
      expect(key1).not.toBe(key2);
    });

    it('should generate different keys for different embedipreview settings', () => {
      const config1 = { ...mockConfig, embedipreview: true };
      const config2 = { ...mockConfig, embedipreview: false };
      const userText = 'same text';
      
      const key1 = keyBuilder.buildClassificationKey(config1, userText);
      const key2 = keyBuilder.buildClassificationKey(config2, userText);
      
      expect(key1).not.toBe(key2);
    });
  });

  describe('Utility Functions', () => {
    it('should work with buildCacheKey utility', () => {
      const result = buildCacheKey('classify', mockConfig, 'test text');
      
      expect(result.key).toMatch(/^sw:test:acc123:inb456:agt789:ms:gpt-4o-mini:pv1\.2:chan:whatsapp:ep:true:classify:[a-f0-9]{16}$/);
      expect(result.ttl).toBe(CACHE_TTL.CLASSIFY);
    });

    it('should work with parseCacheKey utility', () => {
      const key = 'sw:test:acc123:inb456:agt789:ms:gpt-4o-mini:pv1.2:chan:whatsapp:ep:true:classify:abc123';
      const parsed = parseCacheKey(key);
      
      expect(parsed).toBeDefined();
      expect(parsed?.accountId).toBe('123');
    });

    it('should work with validateCacheKey utility', () => {
      const validKey = 'sw:test:acc123:inb456:agt789:ms:gpt-4o-mini:pv1.2:chan:whatsapp:ep:true:classify:abc123';
      const invalidKey = 'invalid';
      
      expect(validateCacheKey(validKey)).toBe(true);
      expect(validateCacheKey(invalidKey)).toBe(false);
    });
  });

  describe('Global Instance', () => {
    it('should provide global socialWiseCacheKeyBuilder instance', () => {
      expect(socialWiseCacheKeyBuilder).toBeInstanceOf(SocialWiseCacheKeyBuilder);
    });
  });
});