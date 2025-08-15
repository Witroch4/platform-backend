/**
 * Cache Hit/Miss Tests and TTL Validation for SocialWise Flow
 * Tests all cache operations with proper hit/miss tracking and TTL validation
 */

import { 
  SocialWiseFlowCacheManager,
  ClassificationResult,
  WarmupButtonsResult,
  MicrocopyResult,
  EmbeddingResult
} from '../cache-manager';
import { CacheKeyConfig, CACHE_TTL } from '../cache-key-builder';

// Mock Redis with detailed tracking
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

const mockPipeline = {
  setex: jest.fn(),
  exec: jest.fn(),
};

describe('SocialWise Flow Cache Hit/Miss and TTL Validation', () => {
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
    process.env.NODE_ENV = 'test';
  });

  afterEach(() => {
    delete process.env.NODE_ENV;
  });

  describe('Classification Cache Hit/Miss Tracking', () => {
    const mockClassificationResult: ClassificationResult = {
      top: [
        { slug: 'help_general', score: 0.85, desc: 'General help' },
        { slug: 'help_specific', score: 0.75, desc: 'Specific help' },
      ],
      ts: Date.now(),
      band: 'HARD',
      strategy: 'direct_map',
    };

    it('should track cache miss then hit for classification results', async () => {
      const userText = 'Preciso de ajuda com meu processo';
      
      // First call - cache miss
      mockRedis.get.mockResolvedValueOnce(null);
      const result1 = await cacheManager.getClassificationResult(mockConfig, userText);
      
      expect(result1).toBeNull();
      
      let stats = cacheManager.getStats();
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(1);
      expect(stats.hitRate).toBe(0);
      
      // Set the result with correct TTL
      mockRedis.setex.mockResolvedValueOnce('OK');
      await cacheManager.setClassificationResult(mockConfig, userText, mockClassificationResult);
      
      // Verify TTL was set correctly
      expect(mockRedis.setex).toHaveBeenCalledWith(
        expect.any(String),
        CACHE_TTL.CLASSIFY,
        expect.any(String)
      );
      
      stats = cacheManager.getStats();
      expect(stats.sets).toBe(1);
      
      // Second call - cache hit
      mockRedis.get.mockResolvedValueOnce(JSON.stringify({
        ...mockClassificationResult,
        ts: Date.now(),
      }));
      
      const result2 = await cacheManager.getClassificationResult(mockConfig, userText);
      
      expect(result2).toEqual(expect.objectContaining({
        top: mockClassificationResult.top,
        band: mockClassificationResult.band,
        strategy: mockClassificationResult.strategy,
      }));
      
      stats = cacheManager.getStats();
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
      expect(stats.hitRate).toBe(50); // 1 hit out of 2 operations
    });

    it('should use custom TTL when provided', async () => {
      const userText = 'Preciso de ajuda';
      const customTTL = 1800; // 30 minutes
      
      mockRedis.setex.mockResolvedValue('OK');
      
      await cacheManager.setClassificationResult(
        mockConfig, 
        userText, 
        mockClassificationResult, 
        customTTL
      );
      
      expect(mockRedis.setex).toHaveBeenCalledWith(
        expect.any(String),
        customTTL,
        expect.any(String)
      );
    });

    it('should handle cache errors and track them', async () => {
      const userText = 'Preciso de ajuda';
      mockRedis.get.mockRejectedValue(new Error('Redis connection failed'));
      
      const result = await cacheManager.getClassificationResult(mockConfig, userText);
      expect(result).toBeNull();
      
      const stats = cacheManager.getStats();
      expect(stats.errors).toBe(1);
      expect(stats.errorRate).toBe(100); // 1 error out of 1 operation
    });
  });

  describe('Warmup Buttons Cache with TTL Validation', () => {
    const mockWarmupResult: WarmupButtonsResult = {
      intro: 'Como posso ajudar você?',
      buttons: [
        { title: 'Ajuda Geral', payload: '@help_general' },
        { title: 'Suporte Técnico', payload: '@tech_support' },
      ],
      ts: Date.now(),
    };

    it('should cache warmup buttons with correct TTL', async () => {
      const userText = 'Preciso de ajuda';
      const candidates = [
        { slug: 'help_general', desc: 'General help' },
        { slug: 'tech_support', desc: 'Technical support' },
      ];
      
      mockRedis.setex.mockResolvedValue('OK');
      
      await cacheManager.setWarmupButtons(mockConfig, userText, candidates, mockWarmupResult);
      
      // Verify correct TTL (10-15m range, default 12m)
      expect(mockRedis.setex).toHaveBeenCalledWith(
        expect.any(String),
        CACHE_TTL.WARMUP,
        expect.any(String)
      );
      
      expect(CACHE_TTL.WARMUP).toBeGreaterThanOrEqual(10 * 60); // At least 10 minutes
      expect(CACHE_TTL.WARMUP).toBeLessThanOrEqual(15 * 60); // At most 15 minutes
    });

    it('should track hit/miss for warmup buttons', async () => {
      const userText = 'Preciso de ajuda';
      const candidates = [{ slug: 'help_general' }];
      
      // Miss
      mockRedis.get.mockResolvedValueOnce(null);
      const result1 = await cacheManager.getWarmupButtons(mockConfig, userText, candidates);
      expect(result1).toBeNull();
      
      // Hit
      mockRedis.get.mockResolvedValueOnce(JSON.stringify(mockWarmupResult));
      const result2 = await cacheManager.getWarmupButtons(mockConfig, userText, candidates);
      expect(result2).toEqual(expect.objectContaining(mockWarmupResult));
      
      const stats = cacheManager.getStats();
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
    });
  });

  describe('Short Titles Cache with Long TTL', () => {
    it('should cache short titles with 30-day TTL', async () => {
      const intentSlug = 'help_general';
      const title = 'Ajuda Geral';
      
      mockRedis.setex.mockResolvedValue('OK');
      
      await cacheManager.setShortTitle(mockConfig, intentSlug, title);
      
      // Verify 30-day TTL
      expect(mockRedis.setex).toHaveBeenCalledWith(
        expect.any(String),
        CACHE_TTL.STITLE,
        title
      );
      
      expect(CACHE_TTL.STITLE).toBe(30 * 24 * 60 * 60); // 30 days in seconds
    });

    it('should track batch operations correctly', async () => {
      const intentSlugs = ['help_general', 'tech_support', 'billing'];
      const titles = ['Ajuda Geral', null, 'Faturamento'];
      
      mockRedis.mget.mockResolvedValue(titles);
      
      const results = await cacheManager.batchGetShortTitles(mockConfig, intentSlugs);
      
      expect(results.get('help_general')).toBe('Ajuda Geral');
      expect(results.get('tech_support')).toBeNull();
      expect(results.get('billing')).toBe('Faturamento');
      
      const stats = cacheManager.getStats();
      expect(stats.hits).toBe(2); // 2 non-null results
      expect(stats.misses).toBe(1); // 1 null result
    });

    it('should handle batch set operations with correct TTL', async () => {
      const titleMap = new Map([
        ['help_general', 'Ajuda Geral'],
        ['tech_support', 'Suporte Técnico'],
      ]);
      
      await cacheManager.batchSetShortTitles(mockConfig, titleMap);
      
      expect(mockPipeline.setex).toHaveBeenCalledTimes(2);
      expect(mockPipeline.setex).toHaveBeenCalledWith(
        expect.any(String),
        CACHE_TTL.STITLE,
        'Ajuda Geral'
      );
      expect(mockPipeline.setex).toHaveBeenCalledWith(
        expect.any(String),
        CACHE_TTL.STITLE,
        'Suporte Técnico'
      );
    });
  });

  describe('Microcopy HARD Band Cache', () => {
    const mockMicrocopyResult: MicrocopyResult = {
      text: 'Confirma que você quer ajuda com isso?',
      buttons: [
        { title: 'Sim', payload: '@confirm_yes' },
        { title: 'Não', payload: '@confirm_no' },
      ],
      ts: Date.now(),
    };

    it('should cache microcopy with correct TTL (15-30m range)', async () => {
      const userText = 'Preciso de ajuda';
      const intentSlug = 'help_general';
      
      mockRedis.setex.mockResolvedValue('OK');
      
      await cacheManager.setMicrocopy(mockConfig, userText, intentSlug, mockMicrocopyResult);
      
      expect(mockRedis.setex).toHaveBeenCalledWith(
        expect.any(String),
        CACHE_TTL.CONFIRM,
        expect.any(String)
      );
      
      // Verify TTL is in 15-30 minute range
      expect(CACHE_TTL.CONFIRM).toBeGreaterThanOrEqual(15 * 60);
      expect(CACHE_TTL.CONFIRM).toBeLessThanOrEqual(30 * 60);
    });
  });

  describe('Embeddings Cache with 24h TTL', () => {
    const mockEmbeddingResult: EmbeddingResult = {
      vecId: 'vec_123',
      vector: [0.1, 0.2, 0.3, 0.4, 0.5],
      ts: Date.now(),
    };

    it('should cache embeddings with 24-hour TTL', async () => {
      const text = 'Preciso de ajuda com meu processo';
      
      mockRedis.setex.mockResolvedValue('OK');
      
      await cacheManager.setEmbedding(mockConfig, text, mockEmbeddingResult);
      
      expect(mockRedis.setex).toHaveBeenCalledWith(
        expect.any(String),
        CACHE_TTL.EMBEDDING,
        expect.any(String)
      );
      
      expect(CACHE_TTL.EMBEDDING).toBe(24 * 60 * 60); // 24 hours in seconds
    });

    it('should track embedding cache operations', async () => {
      const text = 'Preciso de ajuda';
      
      // Miss
      mockRedis.get.mockResolvedValueOnce(null);
      const result1 = await cacheManager.getEmbedding(mockConfig, text);
      expect(result1).toBeNull();
      
      // Hit
      mockRedis.get.mockResolvedValueOnce(JSON.stringify(mockEmbeddingResult));
      const result2 = await cacheManager.getEmbedding(mockConfig, text);
      expect(result2).toEqual(expect.objectContaining(mockEmbeddingResult));
      
      const stats = cacheManager.getStats();
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
    });
  });

  describe('Cache Statistics Accuracy', () => {
    it('should accurately track all operation types', async () => {
      const userText = 'test text';
      const mockResult: ClassificationResult = {
        top: [{ slug: 'test', score: 0.8 }],
        ts: Date.now(),
        band: 'HARD',
        strategy: 'direct',
      };
      
      // Simulate various operations
      mockRedis.get.mockResolvedValueOnce('cached'); // Hit
      mockRedis.get.mockResolvedValueOnce(null); // Miss
      mockRedis.get.mockRejectedValueOnce(new Error('Redis error')); // Error
      mockRedis.setex.mockResolvedValue('OK'); // Set
      mockRedis.del.mockResolvedValue(1); // Delete
      
      await cacheManager.getClassificationResult(mockConfig, userText);
      await cacheManager.getClassificationResult(mockConfig, userText);
      await cacheManager.getClassificationResult(mockConfig, userText);
      await cacheManager.setClassificationResult(mockConfig, userText, mockResult);
      await cacheManager.invalidateUserCache(mockConfig, userText);
      
      const stats = cacheManager.getStats();
      
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
      expect(stats.errors).toBe(1);
      expect(stats.sets).toBe(1);
      expect(stats.deletes).toBe(1);
      
      // Verify calculated rates
      expect(stats.hitRate).toBe(50); // 1 hit out of 2 successful operations
      expect(stats.errorRate).toBe(20); // 1 error out of 5 total operations
    });

    it('should reset statistics correctly', () => {
      // Manually set some stats
      cacheManager['stats'].hits = 10;
      cacheManager['stats'].misses = 5;
      cacheManager['stats'].errors = 2;
      
      const statsBefore = cacheManager.getStats();
      expect(statsBefore.hits).toBe(10);
      
      cacheManager.resetStats();
      
      const statsAfter = cacheManager.getStats();
      expect(statsAfter.hits).toBe(0);
      expect(statsAfter.misses).toBe(0);
      expect(statsAfter.errors).toBe(0);
      expect(statsAfter.hitRate).toBe(0);
      expect(statsAfter.errorRate).toBe(0);
    });
  });

  describe('TTL Constants Validation', () => {
    it('should have correct TTL values for all cache types', () => {
      // Classification: 10 minutes
      expect(CACHE_TTL.CLASSIFY).toBe(10 * 60);
      
      // Warmup: 12 minutes (in 10-15m range)
      expect(CACHE_TTL.WARMUP).toBe(12 * 60);
      expect(CACHE_TTL.WARMUP).toBeGreaterThanOrEqual(10 * 60);
      expect(CACHE_TTL.WARMUP).toBeLessThanOrEqual(15 * 60);
      
      // Short titles: 30 days
      expect(CACHE_TTL.STITLE).toBe(30 * 24 * 60 * 60);
      
      // Confirmation: 20 minutes (in 15-30m range)
      expect(CACHE_TTL.CONFIRM).toBe(20 * 60);
      expect(CACHE_TTL.CONFIRM).toBeGreaterThanOrEqual(15 * 60);
      expect(CACHE_TTL.CONFIRM).toBeLessThanOrEqual(30 * 60);
      
      // Embeddings: 24 hours
      expect(CACHE_TTL.EMBEDDING).toBe(24 * 60 * 60);
      
      // Idempotency: 24 hours
      expect(CACHE_TTL.IDEMPOTENCY).toBe(24 * 60 * 60);
      
      // Nonce: 5 minutes
      expect(CACHE_TTL.NONCE).toBe(5 * 60);
      
      // Rate limit: 1 hour
      expect(CACHE_TTL.RATE_LIMIT).toBe(60 * 60);
      
      // Health: 5 minutes
      expect(CACHE_TTL.HEALTH).toBe(5 * 60);
    });
  });

  describe('Cache Key Consistency', () => {
    it('should generate consistent keys for same input across operations', async () => {
      const userText = 'Preciso de ajuda';
      const mockResult: ClassificationResult = {
        top: [{ slug: 'test', score: 0.8 }],
        ts: Date.now(),
        band: 'HARD',
        strategy: 'direct',
      };
      
      mockRedis.get.mockResolvedValue(null);
      mockRedis.setex.mockResolvedValue('OK');
      
      // Get and set should use the same key
      await cacheManager.getClassificationResult(mockConfig, userText);
      await cacheManager.setClassificationResult(mockConfig, userText, mockResult);
      
      const getCalls = mockRedis.get.mock.calls;
      const setexCalls = mockRedis.setex.mock.calls;
      
      expect(getCalls[0][0]).toBe(setexCalls[0][0]); // Same cache key
    });

    it('should generate different keys for different configurations', async () => {
      const userText = 'same text';
      const config1 = { ...mockConfig, accountId: '123' };
      const config2 = { ...mockConfig, accountId: '124' };
      
      mockRedis.get.mockResolvedValue(null);
      
      await cacheManager.getClassificationResult(config1, userText);
      await cacheManager.getClassificationResult(config2, userText);
      
      const calls = mockRedis.get.mock.calls;
      expect(calls[0][0]).not.toBe(calls[1][0]); // Different cache keys
    });
  });

  describe('Error Handling and Graceful Degradation', () => {
    it('should handle Redis connection failures gracefully', async () => {
      const userText = 'test text';
      
      // Simulate Redis connection failure
      mockRedis.get.mockRejectedValue(new Error('ECONNREFUSED'));
      mockRedis.setex.mockRejectedValue(new Error('ECONNREFUSED'));
      
      // Operations should not throw, but return null/fail gracefully
      const result = await cacheManager.getClassificationResult(mockConfig, userText);
      expect(result).toBeNull();
      
      await expect(cacheManager.setClassificationResult(
        mockConfig, 
        userText, 
        {} as any
      )).resolves.not.toThrow();
      
      const stats = cacheManager.getStats();
      expect(stats.errors).toBeGreaterThan(0);
    });

    it('should handle malformed cache data gracefully', async () => {
      const userText = 'test text';
      
      // Return invalid JSON
      mockRedis.get.mockResolvedValue('invalid-json-data');
      
      const result = await cacheManager.getClassificationResult(mockConfig, userText);
      expect(result).toBeNull();
      
      const stats = cacheManager.getStats();
      expect(stats.errors).toBe(1);
    });
  });
});