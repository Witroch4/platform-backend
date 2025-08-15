/**
 * Unit tests for SocialWise Intent Classification System
 * Tests score band logic, embedding search, timeout mechanisms, and Router LLM
 */

import {
  classifyWithEmbeddings,
  routerLLM,
  classifyIntent,
  prewarmEmbeddings,
  clearClassificationCache,
  getClassificationCacheStats,
  type ClassificationResult,
  type RouterDecision,
  type ClassificationConfig,
  type AgentClassificationConfig,
} from '../classification';

// Mock dependencies
jest.mock('@/lib/connections', () => ({
  getPrismaInstance: jest.fn(),
  getRedisInstance: jest.fn(),
}));

jest.mock('@/lib/utils/logger', () => ({
  createLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  })),
}));

// Mock fetch globally
global.fetch = jest.fn();

describe('SocialWise Classification System', () => {
  let mockPrisma: any;
  let mockRedis: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup mock Prisma
    mockPrisma = {
      intent: {
        findMany: jest.fn(),
        update: jest.fn(),
      },
    };
    
    // Setup mock Redis
    mockRedis = {
      get: jest.fn(),
      setex: jest.fn(),
      keys: jest.fn(),
      del: jest.fn(),
    };

    const { getPrismaInstance, getRedisInstance } = require('@/lib/connections');
    getPrismaInstance.mockReturnValue(mockPrisma);
    getRedisInstance.mockReturnValue(mockRedis);

    // Mock environment variables
    process.env.OPENAI_API_KEY = 'test-api-key';
  });

  describe('Score Band Classification', () => {
    // Create controlled embeddings for predictable similarity scores
    const mockIntents = [
      {
        id: '1',
        name: 'mandado_seguranca',
        description: 'Ação judicial para direito líquido e certo',
        embedding: [1, 0, 0, ...new Array(1533).fill(0)], // Orthogonal vector 1
        similarityThreshold: 0.8,
      },
      {
        id: '2',
        name: 'recurso_multa_transito',
        description: 'Defesa administrativa no órgão de trânsito',
        embedding: [0, 1, 0, ...new Array(1533).fill(0)], // Orthogonal vector 2
        similarityThreshold: 0.8,
      },
      {
        id: '3',
        name: 'consultoria_juridica',
        description: 'Orientação jurídica geral',
        embedding: [0, 0, 1, ...new Array(1533).fill(0)], // Orthogonal vector 3
        similarityThreshold: 0.8,
      },
    ];

    beforeEach(() => {
      mockPrisma.intent.findMany.mockResolvedValue(mockIntents);
      
      // Mock embedding API response - high similarity with first intent
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          data: [{ embedding: [0.9, 0.1, 0.1, ...new Array(1533).fill(0)] }] // High similarity with first intent
        }),
      });
    });

    test('should classify as HARD band for high similarity (≥0.80)', async () => {
      const config: ClassificationConfig = {
        hardThreshold: 0.80,
        softThreshold: 0.65,
        maxCandidates: 5,
        cacheEmbeddingsTtl: 3600,
        cacheClassificationTtl: 600,
        embeddingTimeout: 2000,
      };

      const result = await classifyWithEmbeddings(
        'preciso de um mandado de segurança',
        'inbox123',
        'user456',
        config
      );

      expect(result).toBeTruthy();
      expect(result!.band).toBe('HARD');
      expect(result!.strategy).toBe('direct_map');
      expect(result!.score).toBeGreaterThanOrEqual(0.80);
      expect(result!.candidates).toHaveLength(3);
      expect(result!.candidates[0].slug).toBe('mandado_seguranca');
    });

    test('should classify as SOFT band for medium similarity (0.65-0.79)', async () => {
      // Create vectors that will give us exactly 0.7 similarity
      // If intent has [1,0,0] and we want 0.7 similarity, we need [0.7, sqrt(1-0.7^2), 0]
      const targetSimilarity = 0.7;
      const orthogonalComponent = Math.sqrt(1 - targetSimilarity * targetSimilarity);
      
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          data: [{ embedding: [targetSimilarity, orthogonalComponent, 0, ...new Array(1533).fill(0)] }]
        }),
      });

      const config: ClassificationConfig = {
        hardThreshold: 0.80,
        softThreshold: 0.65,
        maxCandidates: 5,
        cacheEmbeddingsTtl: 3600,
        cacheClassificationTtl: 600,
        embeddingTimeout: 2000,
      };

      const result = await classifyWithEmbeddings(
        'tenho uma questão jurídica',
        'inbox123',
        'user456',
        config
      );

      expect(result).toBeTruthy();
      expect(result!.band).toBe('SOFT');
      expect(result!.strategy).toBe('warmup_buttons');
      expect(result!.score).toBeGreaterThanOrEqual(0.65);
      expect(result!.score).toBeLessThan(0.80);
    });

    test('should classify as LOW band for low similarity (<0.65)', async () => {
      // Mock very low similarity embedding - should score around 0.1 with all intents
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          data: [{ embedding: [0.1, 0.1, 0.1, ...new Array(1533).fill(0)] }] // Very low similarity
        }),
      });

      const config: ClassificationConfig = {
        hardThreshold: 0.80,
        softThreshold: 0.65,
        maxCandidates: 5,
        cacheEmbeddingsTtl: 3600,
        cacheClassificationTtl: 600,
        embeddingTimeout: 2000,
      };

      const result = await classifyWithEmbeddings(
        'olá como vai',
        'inbox123',
        'user456',
        config
      );

      expect(result).toBeTruthy();
      expect(result!.band).toBe('LOW');
      expect(result!.strategy).toBe('domain_topics');
      expect(result!.score).toBeLessThan(0.65);
    });

    test('should limit candidates to maxCandidates', async () => {
      const config: ClassificationConfig = {
        hardThreshold: 0.80,
        softThreshold: 0.65,
        maxCandidates: 2, // Limit to 2 candidates
        cacheEmbeddingsTtl: 3600,
        cacheClassificationTtl: 600,
        embeddingTimeout: 2000,
      };

      const result = await classifyWithEmbeddings(
        'questão jurídica',
        'inbox123',
        'user456',
        config
      );

      expect(result).toBeTruthy();
      expect(result!.candidates).toHaveLength(2);
    });
  });

  describe('Embedding Search with Timeout', () => {
    test('should handle embedding API timeout gracefully', async () => {
      mockPrisma.intent.findMany.mockResolvedValue([
        {
          id: '1',
          name: 'test_intent',
          description: 'Test intent',
          embedding: new Array(1536).fill(0.1),
          similarityThreshold: 0.8,
        },
      ]);

      // Mock slow API response that will timeout
      (global.fetch as jest.Mock).mockImplementation(() => 
        new Promise(resolve => setTimeout(resolve, 3000)) // 3 second delay
      );

      const config: ClassificationConfig = {
        hardThreshold: 0.80,
        softThreshold: 0.65,
        maxCandidates: 5,
        cacheEmbeddingsTtl: 3600,
        cacheClassificationTtl: 600,
        embeddingTimeout: 1000, // 1 second timeout
      };

      const result = await classifyWithEmbeddings(
        'test message',
        'inbox123',
        'user456',
        config
      );

      expect(result).toBeNull(); // Should return null on timeout
    });

    test('should use cached embeddings when available', async () => {
      mockPrisma.intent.findMany.mockResolvedValue([
        {
          id: '1',
          name: 'test_intent',
          description: 'Test intent',
          embedding: new Array(1536).fill(0.1),
          similarityThreshold: 0.8,
        },
      ]);

      // Mock cached embedding
      mockRedis.get.mockResolvedValue(JSON.stringify(new Array(1536).fill(0.1)));

      const result = await classifyWithEmbeddings(
        'test message',
        'inbox123',
        'user456'
      );

      expect(result).toBeTruthy();
      expect(result!.cacheHit).toBe(true);
      expect(global.fetch).not.toHaveBeenCalled(); // Should not call API when cached
    });

    test('should cache embedding results after successful API call', async () => {
      mockPrisma.intent.findMany.mockResolvedValue([
        {
          id: '1',
          name: 'test_intent',
          description: 'Test intent',
          embedding: new Array(1536).fill(0.1),
          similarityThreshold: 0.8,
        },
      ]);

      // Mock no cache initially
      mockRedis.get.mockResolvedValue(null);
      
      // Mock successful API response
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          data: [{ embedding: new Array(1536).fill(0.1) }]
        }),
      });

      await classifyWithEmbeddings(
        'test message',
        'inbox123',
        'user456'
      );

      expect(mockRedis.setex).toHaveBeenCalledWith(
        expect.stringMatching(/^emb:/),
        expect.any(Number),
        expect.any(String)
      );
    });
  });

  describe('Router LLM for embedipreview=false mode', () => {
    test('should return intent mode decision with payload', async () => {
      const mockResponse = {
        output_text: JSON.stringify({
          mode: 'intent',
          intent_payload: '@mandado_seguranca',
          introduction_text: 'Vou ajudar com seu mandado de segurança',
          buttons: [
            { title: 'Continuar', payload: '@mandado_seguranca' },
            { title: 'Falar com atendente', payload: 'handoff:human' }
          ]
        })
      };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
        text: () => Promise.resolve(''),
      });

      const agentConfig: AgentClassificationConfig = {
        embedipreview: false,
        model: 'gpt-4o-mini',
        developer: 'Legal assistant',
        instructions: 'Help with legal matters',
        reasoningEffort: 'minimal',
        tempSchema: 0.1,
      };

      const result = await routerLLM(
        'preciso de um mandado de segurança',
        agentConfig,
        10000 // Longer timeout for test
      );

      expect(result).toBeTruthy();
      expect(result!.mode).toBe('intent');
      expect(result!.intent_payload).toBe('@mandado_seguranca');
      expect(result!.introduction_text).toBeTruthy();
      expect(result!.buttons).toHaveLength(2);
    });

    test('should return chat mode decision with conversational response', async () => {
      const mockResponse = {
        output_text: JSON.stringify({
          mode: 'chat',
          text: 'Olá! Como posso ajudar você hoje?',
          buttons: [
            { title: 'Direito Civil', payload: '@direito_civil' },
            { title: 'Direito Trabalhista', payload: '@direito_trabalhista' },
            { title: 'Outros assuntos', payload: '@outros_assuntos' }
          ]
        })
      };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
        text: () => Promise.resolve(''),
      });

      const agentConfig: AgentClassificationConfig = {
        embedipreview: false,
        model: 'gpt-4o-mini',
        reasoningEffort: 'minimal',
        tempSchema: 0.1,
      };

      const result = await routerLLM('olá', agentConfig, 10000);

      expect(result).toBeTruthy();
      expect(result!.mode).toBe('chat');
      expect(result!.text).toBeTruthy();
      expect(result!.buttons).toHaveLength(3);
    });

    test('should handle Router LLM timeout gracefully', async () => {
      // Mock slow API response
      (global.fetch as jest.Mock).mockImplementation(() => 
        new Promise(resolve => setTimeout(resolve, 5000)) // 5 second delay
      );

      const agentConfig: AgentClassificationConfig = {
        embedipreview: false,
        model: 'gpt-4o-mini',
        reasoningEffort: 'minimal',
        tempSchema: 0.1,
      };

      const result = await routerLLM(
        'test message',
        agentConfig,
        1000 // 1 second timeout
      );

      expect(result).toBeNull(); // Should return null on timeout
    });

    test('should handle invalid JSON response gracefully', async () => {
      const mockResponse = {
        output_text: 'invalid json response'
      };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const agentConfig: AgentClassificationConfig = {
        embedipreview: false,
        model: 'gpt-4o-mini',
        reasoningEffort: 'minimal',
        tempSchema: 0.1,
      };

      const result = await routerLLM('test message', agentConfig);

      expect(result).toBeNull(); // Should return null for invalid JSON
    });

    test('should validate router decision structure', async () => {
      const mockResponse = {
        output_text: JSON.stringify({
          mode: 'invalid_mode', // Invalid mode
          text: 'Some text'
        })
      };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const agentConfig: AgentClassificationConfig = {
        embedipreview: false,
        model: 'gpt-4o-mini',
        reasoningEffort: 'minimal',
        tempSchema: 0.1,
      };

      const result = await routerLLM('test message', agentConfig);

      expect(result).toBeNull(); // Should return null for invalid mode
    });
  });

  describe('Main Classification Entry Point', () => {
    test('should use embedding-first mode when embedipreview=true', async () => {
      mockPrisma.intent.findMany.mockResolvedValue([
        {
          id: '1',
          name: 'test_intent',
          description: 'Test intent',
          embedding: new Array(1536).fill(0.1),
          similarityThreshold: 0.8,
        },
      ]);

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          data: [{ embedding: new Array(1536).fill(0.1) }]
        }),
      });

      const agentConfig: AgentClassificationConfig = {
        embedipreview: true,
        model: 'gpt-4o-mini',
        reasoningEffort: 'minimal',
        tempSchema: 0.1,
      };

      const result = await classifyIntent(
        'test message',
        'inbox123',
        'user456',
        agentConfig
      );

      expect(result).toBeTruthy();
      expect('band' in result!).toBe(true); // Should be ClassificationResult
      expect('mode' in result!).toBe(false); // Should not be RouterDecision
    });

    test('should use LLM-first mode when embedipreview=false', async () => {
      const mockResponse = {
        output_text: JSON.stringify({
          mode: 'chat',
          text: 'How can I help?'
        })
      };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const agentConfig: AgentClassificationConfig = {
        embedipreview: false,
        model: 'gpt-4o-mini',
        reasoningEffort: 'minimal',
        tempSchema: 0.1,
      };

      const result = await classifyIntent(
        'test message',
        'inbox123',
        'user456',
        agentConfig
      );

      expect(result).toBeTruthy();
      expect('mode' in result!).toBe(true); // Should be RouterDecision
      expect('band' in result!).toBe(false); // Should not be ClassificationResult
    });
  });

  describe('Pre-warming Embeddings', () => {
    test('should process intents without embeddings', async () => {
      const mockIntents = [
        {
          id: '1',
          name: 'intent1',
          description: 'First intent',
          embedding: null, // No embedding yet
        },
        {
          id: '2',
          name: 'intent2',
          description: 'Second intent',
          embedding: new Array(1536).fill(0.1), // Already has embedding
        },
      ];

      mockPrisma.intent.findMany.mockResolvedValue(mockIntents);
      mockPrisma.intent.update.mockResolvedValue({});

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          data: [{ embedding: new Array(1536).fill(0.1) }]
        }),
      });

      const result = await prewarmEmbeddings('inbox123', 'user456');

      expect(result.processed).toBe(2);
      expect(result.cached).toBe(1); // One already had embedding
      expect(result.errors).toBe(0);
      expect(mockPrisma.intent.update).toHaveBeenCalledTimes(1); // Only update the one without embedding
    });

    test('should handle embedding API errors during pre-warming', async () => {
      const mockIntents = [
        {
          id: '1',
          name: 'intent1',
          description: 'First intent',
          embedding: null,
        },
      ];

      mockPrisma.intent.findMany.mockResolvedValue(mockIntents);

      // Mock API error
      (global.fetch as jest.Mock).mockRejectedValue(new Error('API Error'));

      const result = await prewarmEmbeddings('inbox123', 'user456');

      expect(result.processed).toBe(1);
      expect(result.cached).toBe(0);
      expect(result.errors).toBe(1);
    });
  });

  describe('Cache Management', () => {
    test('should clear classification cache for specific inbox', async () => {
      mockRedis.keys.mockResolvedValue(['classify:hash1:inbox123', 'classify:hash2:inbox123']);
      mockRedis.del.mockResolvedValue(2);

      const result = await clearClassificationCache('inbox123');

      expect(result).toBe(2);
      expect(mockRedis.keys).toHaveBeenCalledWith('classify:*:inbox123');
      expect(mockRedis.del).toHaveBeenCalledWith('classify:hash1:inbox123', 'classify:hash2:inbox123');
    });

    test('should clear all classification cache when no inbox specified', async () => {
      mockRedis.keys.mockResolvedValue(['classify:hash1:inbox1', 'classify:hash2:inbox2']);
      mockRedis.del.mockResolvedValue(2);

      const result = await clearClassificationCache();

      expect(result).toBe(2);
      expect(mockRedis.keys).toHaveBeenCalledWith('classify:*');
    });

    test('should get cache statistics', async () => {
      mockRedis.keys
        .mockResolvedValueOnce(['classify:hash1:inbox123', 'classify:hash2:inbox123']) // Classification keys
        .mockResolvedValueOnce(['emb:hash1:inbox123', 'emb:hash2:inbox123', 'emb:hash3:inbox123']); // Embedding keys

      const result = await getClassificationCacheStats('inbox123');

      expect(result.classificationKeys).toBe(2);
      expect(result.embeddingKeys).toBe(3);
      expect(result.totalSize).toBe(5);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    test('should handle empty user text', async () => {
      const result = await classifyWithEmbeddings('', 'inbox123', 'user456');
      expect(result).toBeNull();
    });

    test('should handle no intents found', async () => {
      mockPrisma.intent.findMany.mockResolvedValue([]);

      const result = await classifyWithEmbeddings('test message', 'inbox123', 'user456');
      expect(result).toBeNull();
    });

    test('should handle Redis connection errors gracefully', async () => {
      mockRedis.get.mockRejectedValue(new Error('Redis connection error'));
      mockRedis.setex.mockRejectedValue(new Error('Redis connection error'));

      mockPrisma.intent.findMany.mockResolvedValue([
        {
          id: '1',
          name: 'test_intent',
          description: 'Test intent',
          embedding: new Array(1536).fill(0.1),
          similarityThreshold: 0.8,
        },
      ]);

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          data: [{ embedding: new Array(1536).fill(0.1) }]
        }),
      });

      const result = await classifyWithEmbeddings('test message', 'inbox123', 'user456');

      expect(result).toBeTruthy(); // Should still work despite Redis errors
      expect(result!.cacheHit).toBe(false);
    });

    test('should handle database connection errors', async () => {
      mockPrisma.intent.findMany.mockRejectedValue(new Error('Database connection error'));

      const result = await classifyWithEmbeddings('test message', 'inbox123', 'user456');
      expect(result).toBeNull();
    });
  });
});