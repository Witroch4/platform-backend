/**
 * Unit tests for SocialWise Flow Cache Manager
 * Tests cache operations, hit/miss tracking, and TTL validation
 */

import { 
  SocialWiseFlowCacheManager,
  socialWiseFlowCache,
  ClassificationResult,
  WarmupButtonsResult,
  MicrocopyResult,
  EmbeddingResult,
  getCachedClassification,
  setCachedClassification,
  checkMessageIdempotency,
  setMessageIdempotency
} from '../cache-manager';
import { CacheKeyConfig } from '../cache-key-builder';

// Mock Redis
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

// Mock pipeline
const mockPipeline = {
  setex: jest.fn(),
  exec: jest.fn(),
};

describe('SocialWiseFlowCacheManager', () => {
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
    mockRedis.pipeline.mockReturnValue(mockPipeline);
    mockPipeline.exec.mockResolvedValue([]);
    
    cacheManager = new SocialWiseFlowCacheManager(mockRedis as any);
    
    // Set test environment to avoid health checks
    process.env.NODE_ENV = 'test';
  });

  afterEach(() => {
    delete process.env.NODE_ENV;
  });

  describe('Classification Results Cache', () => {
    const mockClassificationResult: ClassificationResult = {
      top: [
        { slug: 'help_general', score: 0.85, desc: 'General help' },
        { slug: 'help_specific', score: 0.75, desc: 'Specific help' },
      ],
      ts: Date.now(),
      band: 'HARD',
      strategy: 'direct_map',
    };

    it('should cache and retrieve classification results', async () => {
      const userText = 'Preciso de ajuda';
      
      // Mock cache miss then cache hit
      mockRedis.get.mockResolvedValueOnce(null);
      mockRedis.setex.mockResolvedValueOnce('OK');
      mockRedis.get.mockResolvedValueOnce(JSON.stringify(mockClassificationResult));
      
      // First call should be a miss
      const result1 = await cacheManager.getClassificationResult(mockConfig, userText);
      expect(result1).toBeNull();
      
      // Set the result
      await cacheManager.setClassificationResult(mockConfig, userText, mockClassificationResult);
      
      // Second call should be a hit
      const result2 = await cacheManager.getClassificationResult(mockConfig, userText);
      expect(result2).toEqual(expect.objectContaining({
        top: mockClassificationResult.top,
        band: mockClassificationResult.band,
        strategy: mockClassificationResult.strategy,
      }));
      
      // Verify Redis calls
      expect(mockRedis.get).toHaveBeenCalledTimes(2);
      expect(mockRedis.setex).toHaveBeenCalledTimes(1);
    });

    it('should handle cache errors gracefully', async () => {
      const userText = 'Preciso de ajuda';
      mockRedis.get.mockRejectedValue(new Error('Redis connection failed'));
      
      const result = await cacheManager.getClassificationResult(mockConfig, userText);
      expect(result).toBeNull();
      
      const stats = cacheManager.getStats();
      expect(stats.errors).toBe(1);
    });

    it('should use custom TTL when provided', async () => {
      const userText = 'Preciso de ajuda';
      const customTTL = 1800; // 30 minutes
      
      mockRedis.setex.mockResolvedValue('OK');
      
      await cacheManager.setClassificationResult(mockConfig, userText, mockClassificationResult, customTTL);
      
      expect(mockRedis.setex).toHaveBeenCalledWith(
        expect.any(String),
        customTTL,
        expect.any(String)
      );
    });
  });

  describe('Warmup Buttons Cache', () => {
    const mockWarmupResult: WarmupButtonsResult = {
      intro: 'Como posso ajudar você?',
      buttons: [
        { title: 'Ajuda Geral', payload: '@help_general' },
        { title: 'Suporte Técnico', payload: '@tech_support' },
      ],
      ts: Date.now(),
    };

    it('should cache and retrieve warmup buttons', async () => {
      const userText = 'Preciso de ajuda';
      const candidates = [
        { slug: 'help_general', desc: 'General help' },
        { slug: 'tech_support', desc: 'Technical support' },
      ];
      
      mockRedis.get.mockResolvedValueOnce(null);
      mockRedis.setex.mockResolvedValueOnce('OK');
      mockRedis.get.mockResolvedValueOnce(JSON.stringify(mockWarmupResult));
      
      // First call should be a miss
      const result1 = await cacheManager.getWarmupButtons(mockConfig, userText, candidates);
      expect(result1).toBeNull();
      
      // Set the result
      await cacheManager.setWarmupButtons(mockConfig, userText, candidates, mockWarmupResult);
      
      // Second call should be a hit
      const result2 = await cacheManager.getWarmupButtons(mockConfig, userText, candidates);
      expect(result2).toEqual(expect.objectContaining({
        intro: mockWarmupResult.intro,
        buttons: mockWarmupResult.buttons,
      }));
    });

    it('should generate same cache key regardless of candidate order', async () => {
      const userText = 'Preciso de ajuda';
      const candidates1 = [
        { slug: 'help_general' },
        { slug: 'tech_support' },
      ];
      const candidates2 = [
        { slug: 'tech_support' },
        { slug: 'help_general' },
      ];
      
      mockRedis.get.mockResolvedValue(null);
      
      await cacheManager.getWarmupButtons(mockConfig, userText, candidates1);
      await cacheManager.getWarmupButtons(mockConfig, userText, candidates2);
      
      // Should use the same cache key (same Redis get call)
      const calls = mockRedis.get.mock.calls;
      expect(calls[0][0]).toBe(calls[1][0]);
    });
  });

  describe('Short Titles Cache', () => {
    it('should cache and retrieve short titles', async () => {
      const intentSlug = 'help_general';
      const title = 'Ajuda Geral';
      
      mockRedis.get.mockResolvedValueOnce(null);
      mockRedis.setex.mockResolvedValueOnce('OK');
      mockRedis.get.mockResolvedValueOnce(title);
      
      // First call should be a miss
      const result1 = await cacheManager.getShortTitle(mockConfig, intentSlug);
      expect(result1).toBeNull();
      
      // Set the title
      await cacheManager.setShortTitle(mockConfig, intentSlug, title);
      
      // Second call should be a hit
      const result2 = await cacheManager.getShortTitle(mockConfig, intentSlug);
      expect(result2).toBe(title);
    });

    it('should handle batch operations for short titles', async () => {
      const intentSlugs = ['help_general', 'tech_support', 'billing'];
      const titles = ['Ajuda Geral', 'Suporte Técnico', 'Faturamento'];
      
      // Mock batch get
      mockRedis.mget.mockResolvedValue([titles[0], null, titles[2]]);
      
      const results = await cacheManager.batchGetShortTitles(mockConfig, intentSlugs);
      
      expect(results.get('help_general')).toBe(titles[0]);
      expect(results.get('tech_support')).toBeNull();
      expect(results.get('billing')).toBe(titles[2]);
      
      // Mock batch set
      const titleMap = new Map([
        ['help_general', titles[0]],
        ['tech_support', titles[1]],
      ]);
      
      await cacheManager.batchSetShortTitles(mockConfig, titleMap);
      
      expect(mockPipeline.setex).toHaveBeenCalledTimes(2);
      expect(mockPipeline.exec).toHaveBeenCalledTimes(1);
    });

    it('should handle batch operation errors gracefully', async () => {
      const intentSlugs = ['help_general', 'tech_support'];
      mockRedis.mget.mockRejectedValue(new Error('Redis error'));
      
      const results = await cacheManager.batchGetShortTitles(mockConfig, intentSlugs);
      
      // Should return null for all slugs on error
      expect(results.get('help_general')).toBeNull();
      expect(results.get('tech_support')).toBeNull();
      
      const stats = cacheManager.getStats();
      expect(stats.errors).toBe(1);
    });
  });

  describe('Microcopy Cache', () => {
    const mockMicrocopyResult: MicrocopyResult = {
      text: 'Confirma que você quer ajuda com isso?',
      buttons: [
        { title: 'Sim', payload: '@confirm_yes' },
        { title: 'Não', payload: '@confirm_no' },
      ],
      ts: Date.now(),
    };

    it('should cache and retrieve microcopy results', async () => {
      const userText = 'Preciso de ajuda';
      const intentSlug = 'help_general';
      
      mockRedis.get.mockResolvedValueOnce(null);
      mockRedis.setex.mockResolvedValueOnce('OK');
      mockRedis.get.mockResolvedValueOnce(JSON.stringify(mockMicrocopyResult));
      
      // First call should be a miss
      const result1 = await cacheManager.getMicrocopy(mockConfig, userText, intentSlug);
      expect(result1).toBeNull();
      
      // Set the result
      await cacheManager.setMicrocopy(mockConfig, userText, intentSlug, mockMicrocopyResult);
      
      // Second call should be a hit
      const result2 = await cacheManager.getMicrocopy(mockConfig, userText, intentSlug);
      expect(result2).toEqual(expect.objectContaining({
        text: mockMicrocopyResult.text,
        buttons: mockMicrocopyResult.buttons,
      }));
    });
  });

  describe('Embeddings Cache', () => {
    const mockEmbeddingResult: EmbeddingResult = {
      vecId: 'vec_123',
      vector: [0.1, 0.2, 0.3, 0.4, 0.5],
      ts: Date.now(),
    };

    it('should cache and retrieve embeddings', async () => {
      const text = 'Preciso de ajuda com meu processo';
      
      mockRedis.get.mockResolvedValueOnce(null);
      mockRedis.setex.mockResolvedValueOnce('OK');
      mockRedis.get.mockResolvedValueOnce(JSON.stringify(mockEmbeddingResult));
      
      // First call should be a miss
      const result1 = await cacheManager.getEmbedding(mockConfig, text);
      expect(result1).toBeNull();
      
      // Set the result
      await cacheManager.setEmbedding(mockConfig, text, mockEmbeddingResult);
      
      // Second call should be a hit
      const result2 = await cacheManager.getEmbedding(mockConfig, text);
      expect(result2).toEqual(expect.objectContaining({
        vecId: mockEmbeddingResult.vecId,
        vector: mockEmbeddingResult.vector,
      }));
    });
  });

  describe('Idempotency Cache', () => {
    it('should check and set idempotency correctly', async () => {
      const wamid = 'wamid.ABC123DEF456';
      
      // Mock first check (not exists)
      mockRedis.exists.mockResolvedValueOnce(0);
      mockRedis.setex.mockResolvedValueOnce('OK');
      
      // Mock second check (exists)
      mockRedis.exists.mockResolvedValueOnce(1);
      
      // First check should return false (not processed)
      const exists1 = await cacheManager.checkIdempotency(mockConfig, wamid);
      expect(exists1).toBe(false);
      
      // Set idempotency
      await cacheManager.setIdempotency(mockConfig, wamid);
      
      // Second check should return true (already processed)
      const exists2 = await cacheManager.checkIdempotency(mockConfig, wamid);
      expect(exists2).toBe(true);
      
      expect(mockRedis.exists).toHaveBeenCalledTimes(2);
      expect(mockRedis.setex).toHaveBeenCalledTimes(1);
    });

    it('should handle idempotency errors gracefully', async () => {
      const wamid = 'wamid.ABC123DEF456';
      mockRedis.exists.mockRejectedValue(new Error('Redis error'));
      
      const exists = await cacheManager.checkIdempotency(mockConfig, wamid);
      expect(exists).toBe(false); // Fail safe
      
      const stats = cacheManager.getStats();
      expect(stats.errors).toBe(1);
    });
  });

  describe('Anti-Replay Nonce Cache', () => {
    it('should check and set nonces correctly', async () => {
      const nonce = 'nonce-123-abc';
      
      // Mock first check (not exists)
      mockRedis.exists.mockResolvedValueOnce(0);
      mockRedis.setex.mockResolvedValueOnce('OK');
      
      // Mock second check (exists)
      mockRedis.exists.mockResolvedValueOnce(1);
      
      // First check should return false (fresh nonce)
      const used1 = await cacheManager.checkNonce(mockConfig, nonce);
      expect(used1).toBe(false);
      
      // Set nonce as used
      await cacheManager.setNonce(mockConfig, nonce);
      
      // Second check should return true (nonce already used)
      const used2 = await cacheManager.checkNonce(mockConfig, nonce);
      expect(used2).toBe(true);
    });

    it('should fail secure on nonce errors', async () => {
      const nonce = 'nonce-123-abc';
      mockRedis.exists.mockRejectedValue(new Error('Redis error'));
      
      const used = await cacheManager.checkNonce(mockConfig, nonce);
      expect(used).toBe(true); // Fail secure - assume nonce is used
      
      const stats = cacheManager.getStats();
      expect(stats.errors).toBe(1);
    });
  });

  describe('Rate Limiting Cache', () => {
    it('should implement sliding window rate limiting', async () => {
      const identifier = 'user-123';
      const limit = 5;
      const windowSeconds = 60;
      
      // Mock Redis operations for rate limiting
      mockRedis.zremrangebyscore.mockResolvedValue(0);
      mockRedis.zcard.mockResolvedValueOnce(2); // Current count
      mockRedis.zadd.mockResolvedValue(1);
      mockRedis.expire.mockResolvedValue(1);
      
      const result = await cacheManager.checkRateLimit(mockConfig, identifier, limit, windowSeconds);
      
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(2); // limit - currentCount - 1
      expect(result.resetTime).toBeGreaterThan(Date.now());
      
      expect(mockRedis.zremrangebyscore).toHaveBeenCalled();
      expect(mockRedis.zcard).toHaveBeenCalled();
      expect(mockRedis.zadd).toHaveBeenCalled();
      expect(mockRedis.expire).toHaveBeenCalled();
    });

    it('should deny requests when rate limit exceeded', async () => {
      const identifier = 'user-123';
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

    it('should fail open on rate limiting errors', async () => {
      const identifier = 'user-123';
      const limit = 5;
      const windowSeconds = 60;
      
      mockRedis.zremrangebyscore.mockRejectedValue(new Error('Redis error'));
      
      const result = await cacheManager.checkRateLimit(mockConfig, identifier, limit, windowSeconds);
      
      expect(result.allowed).toBe(true); // Fail open
      
      const stats = cacheManager.getStats();
      expect(stats.errors).toBe(1);
    });
  });

  describe('Cache Invalidation', () => {
    it('should invalidate user-specific cache', async () => {
      const userText = 'Preciso de ajuda';
      
      mockRedis.del.mockResolvedValue(2);
      
      await cacheManager.invalidateUserCache(mockConfig, userText);
      
      expect(mockRedis.del).toHaveBeenCalledWith(
        expect.stringContaining(':classify:'),
        expect.stringContaining(':emb:')
      );
    });

    it('should invalidate all cache for namespace when no user text provided', async () => {
      mockRedis.keys.mockResolvedValue(['key1', 'key2', 'key3']);
      mockRedis.del.mockResolvedValue(3);
      
      await cacheManager.invalidateUserCache(mockConfig);
      
      expect(mockRedis.keys).toHaveBeenCalledWith(expect.stringContaining('sw:test:acc123:inb456:agt789'));
      expect(mockRedis.del).toHaveBeenCalledWith('key1', 'key2', 'key3');
    });

    it('should invalidate intent-specific cache', async () => {
      const intentSlug = 'help_general';
      
      mockRedis.del.mockResolvedValue(1);
      
      await cacheManager.invalidateIntentCache(mockConfig, intentSlug);
      
      expect(mockRedis.del).toHaveBeenCalledWith(
        expect.stringContaining(':stitle:help_general')
      );
    });
  });

  describe('Statistics and Health', () => {
    it('should track cache statistics correctly', async () => {
      // Simulate some cache operations
      mockRedis.get.mockResolvedValueOnce('cached_value'); // Hit
      mockRedis.get.mockResolvedValueOnce(null); // Miss
      mockRedis.get.mockRejectedValueOnce(new Error('Redis error')); // Error
      mockRedis.setex.mockResolvedValue('OK'); // Set
      
      await cacheManager.getClassificationResult(mockConfig, 'text1');
      await cacheManager.getClassificationResult(mockConfig, 'text2');
      await cacheManager.getClassificationResult(mockConfig, 'text3');
      await cacheManager.setClassificationResult(mockConfig, 'text4', {} as any);
      
      const stats = cacheManager.getStats();
      
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
      expect(stats.errors).toBe(1);
      expect(stats.sets).toBe(1);
      expect(stats.hitRate).toBe(50); // 1 hit out of 2 successful operations
      expect(stats.errorRate).toBe(25); // 1 error out of 4 total operations
    });

    it('should reset statistics', () => {
      // Set some stats first
      cacheManager['stats'].hits = 10;
      cacheManager['stats'].misses = 5;
      cacheManager['stats'].errors = 2;
      
      cacheManager.resetStats();
      
      const stats = cacheManager.getStats();
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
      expect(stats.errors).toBe(0);
    });

    it('should check cache health', async () => {
      mockRedis.ping.mockResolvedValue('PONG');
      mockRedis.info.mockResolvedValue('used_memory_human:10.5M\nother_info:value');
      mockRedis.keys.mockResolvedValue(['key1', 'key2']);
      
      const health = await cacheManager.checkHealth();
      
      expect(health.isConnected).toBe(true);
      expect(health.latency).toBeGreaterThan(0);
      expect(health.memoryUsage).toBe('10.5M');
      expect(health.keyCount).toBe(2);
      expect(health.lastCheck).toBeInstanceOf(Date);
    });

    it('should handle health check failures', async () => {
      mockRedis.ping.mockRejectedValue(new Error('Connection failed'));
      
      const health = await cacheManager.checkHealth();
      
      expect(health.isConnected).toBe(false);
      expect(health.latency).toBeGreaterThan(0);
      expect(health.keyCount).toBe(0);
    });
  });

  describe('Cache Warming', () => {
    it('should warm cache with provided data', async () => {
      const warmingData = {
        classifications: [
          { userText: 'text1', result: { top: [], ts: Date.now(), band: 'HARD', strategy: 'direct' } as ClassificationResult },
        ],
        shortTitles: new Map([['intent1', 'Title 1']]),
        embeddings: [
          { text: 'text1', result: { vecId: 'vec1', ts: Date.now() } as EmbeddingResult },
        ],
      };
      
      await cacheManager.warmCache(mockConfig, warmingData);
      
      expect(mockPipeline.setex).toHaveBeenCalledTimes(3); // 1 classification + 1 title + 1 embedding
      expect(mockPipeline.exec).toHaveBeenCalledTimes(1);
    });

    it('should handle empty warming data', async () => {
      await cacheManager.warmCache(mockConfig, {});
      
      expect(mockPipeline.setex).not.toHaveBeenCalled();
      expect(mockPipeline.exec).toHaveBeenCalledTimes(1);
    });
  });

  describe('Utility Functions', () => {
    it('should work with getCachedClassification utility', async () => {
      const userText = 'test text';
      const mockResult: ClassificationResult = {
        top: [{ slug: 'test', score: 0.8 }],
        ts: Date.now(),
        band: 'HARD',
        strategy: 'direct',
      };
      
      mockRedis.get.mockResolvedValue(JSON.stringify(mockResult));
      
      const result = await getCachedClassification(mockConfig, userText);
      expect(result).toEqual(expect.objectContaining(mockResult));
    });

    it('should work with setCachedClassification utility', async () => {
      const userText = 'test text';
      const mockResult: ClassificationResult = {
        top: [{ slug: 'test', score: 0.8 }],
        ts: Date.now(),
        band: 'HARD',
        strategy: 'direct',
      };
      
      mockRedis.setex.mockResolvedValue('OK');
      
      await setCachedClassification(mockConfig, userText, mockResult);
      expect(mockRedis.setex).toHaveBeenCalled();
    });

    it('should work with idempotency utilities', async () => {
      const wamid = 'wamid.test123';
      
      mockRedis.exists.mockResolvedValueOnce(0);
      mockRedis.setex.mockResolvedValue('OK');
      mockRedis.exists.mockResolvedValueOnce(1);
      
      const exists1 = await checkMessageIdempotency(mockConfig, wamid);
      expect(exists1).toBe(false);
      
      await setMessageIdempotency(mockConfig, wamid);
      
      const exists2 = await checkMessageIdempotency(mockConfig, wamid);
      expect(exists2).toBe(true);
    });
  });

  describe('Global Instance', () => {
    it('should provide global socialWiseFlowCache instance', () => {
      expect(socialWiseFlowCache).toBeInstanceOf(SocialWiseFlowCacheManager);
    });
  });
});