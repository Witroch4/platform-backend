/**
 * Intent Classification System Tests
 * Tests for embedding generation, similarity search, and intent classification
 */

import { Redis } from 'ioredis';
import { getPrismaInstance } from "@/lib/connections";
import {
  EmbeddingGenerator,
  SimilaritySearchService,
  IntentClassifier,
  ThresholdTuner,
  PayloadRouter,
  ConversationContextStore,
  TemplateRegistry,
} from '../../../lib/ai-integration/services';

// Mock dependencies
jest.mock('ioredis');
jest.mock('@prisma/client');
jest.mock('openai');
jest.mock('../../../lib/log', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('Intent Classification System', () => {
  let mockRedis: jest.Mocked<Redis>;
  let mockPrisma: jest.Mocked<PrismaClient>;
  let embeddingGenerator: EmbeddingGenerator;
  let similaritySearch: SimilaritySearchService;
  let intentClassifier: IntentClassifier;

  beforeEach(() => {
    // Setup mocks
    mockRedis = {
      get: jest.fn(),
      set: jest.fn(),
      setex: jest.fn(),
      del: jest.fn(),
      hgetall: jest.fn(),
      hincrby: jest.fn(),
      hset: jest.fn(),
      expire: jest.fn(),
      pipeline: jest.fn(() => ({
        hincrby: jest.fn(),
        hset: jest.fn(),
        expire: jest.fn(),
        exec: jest.fn().mockResolvedValue([]),
      })),
    } as any;

    mockPrisma = {
      intent: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      intentHitLog: {
        createMany: jest.fn(),
        findMany: jest.fn(),
        deleteMany: jest.fn(),
        count: jest.fn(),
        aggregate: jest.fn(),
      },
      llmAudit: {
        create: jest.fn(),
      },
      $queryRaw: jest.fn(),
      $executeRaw: jest.fn(),
    } as any;

    // Mock OpenAI client
    const mockOpenAI = {
      embeddings: {
        create: jest.fn(),
      },
    };

    // Create services
    embeddingGenerator = new EmbeddingGenerator(
      mockOpenAI as any,
      mockRedis,
      { cacheEnabled: true }
    );

    similaritySearch = new SimilaritySearchService(mockPrisma);
    
    intentClassifier = new IntentClassifier(
      embeddingGenerator,
      similaritySearch,
      mockPrisma,
      mockRedis
    );
  });

  describe('EmbeddingGenerator', () => {
    it('should generate embeddings with caching', async () => {
      // Mock OpenAI response
      const mockEmbedding = [0.1, 0.2, 0.3];
      jest.spyOn(embeddingGenerator as any, 'generateWithRetry')
        .mockResolvedValue(mockEmbedding);

      // Mock cache miss
      mockRedis.get.mockResolvedValue(null);

      const result = await embeddingGenerator.generateEmbedding('test text', {
        traceId: 'test-trace',
        accountId: 123,
      });

      expect(result.success).toBe(true);
      expect(result.result?.values).toEqual(mockEmbedding);
      expect(result.cached).toBe(false);
      expect(mockRedis.setex).toHaveBeenCalled();
    });

    it('should return cached embeddings when available', async () => {
      const cachedEmbedding = {
        dimensions: 3,
        values: [0.1, 0.2, 0.3],
        model: 'text-embedding-3-small',
        generatedAt: new Date(),
      };

      mockRedis.get.mockResolvedValue(JSON.stringify(cachedEmbedding));

      const result = await embeddingGenerator.generateEmbedding('test text');

      expect(result.success).toBe(true);
      expect(result.cached).toBe(true);
      expect(result.result).toEqual(cachedEmbedding);
    });

    it('should preprocess text correctly', async () => {
      const preprocessText = (embeddingGenerator as any).preprocessText;
      
      const result = preprocessText('  Hello   World  \n\n  Test  ', {
        normalizeWhitespace: true,
        toLowerCase: true,
        maxLength: 100,
      });

      expect(result).toBe('hello world test');
    });

    it('should handle batch embedding generation', async () => {
      const mockEmbeddings = [
        [0.1, 0.2, 0.3],
        [0.4, 0.5, 0.6],
      ];

      jest.spyOn(embeddingGenerator, 'generateEmbedding')
        .mockResolvedValueOnce({
          success: true,
          result: { dimensions: 3, values: mockEmbeddings[0], model: 'test', generatedAt: new Date() },
          tokensUsed: 10,
          model: 'test',
          latencyMs: 100,
          cached: false,
        })
        .mockResolvedValueOnce({
          success: true,
          result: { dimensions: 3, values: mockEmbeddings[1], model: 'test', generatedAt: new Date() },
          tokensUsed: 10,
          model: 'test',
          latencyMs: 100,
          cached: false,
        });

      const result = await embeddingGenerator.generateBatchEmbeddings(['text1', 'text2']);

      expect(result.success).toBe(true);
      expect(result.result).toHaveLength(2);
      expect(result.tokensUsed).toBe(20);
    });
  });

  describe('SimilaritySearchService', () => {
    it('should perform vector similarity search', async () => {
      const mockResults = [
        {
          id: 'intent-1',
          name: 'track_order',
          description: 'Track order intent',
          actionType: 'TEMPLATE',
          templateId: 'template-1',
          similarityThreshold: 0.8,
          similarity: 0.9,
        },
        {
          id: 'intent-2',
          name: 'payment_help',
          description: 'Payment help intent',
          actionType: 'TEXT',
          templateId: null,
          similarityThreshold: 0.7,
          similarity: 0.75,
        },
      ];

      mockPrisma.$queryRaw.mockResolvedValue(mockResults);

      const result = await similaritySearch.searchSimilarIntents({
        embedding: [0.1, 0.2, 0.3],
        threshold: 0.7,
        limit: 10,
      });

      expect(result.candidates).toHaveLength(2);
      expect(result.bestMatch?.name).toBe('track_order');
      expect(result.bestMatch?.similarity).toBe(0.9);
    });

    it('should log intent candidates for audit', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([]);
      mockPrisma.intentHitLog.createMany.mockResolvedValue({ count: 0 });

      await similaritySearch.searchSimilarIntents(
        {
          embedding: [0.1, 0.2, 0.3],
          threshold: 0.8,
        },
        {
          conversationId: 123,
          messageId: 'msg-123',
          logCandidates: true,
        }
      );

      expect(mockPrisma.intentHitLog.createMany).toHaveBeenCalled();
    });

    it('should get intent metrics', async () => {
      mockPrisma.intentHitLog.count
        .mockResolvedValueOnce(100) // total hits
        .mockResolvedValueOnce(80); // chosen count

      mockPrisma.intentHitLog.aggregate.mockResolvedValue({
        _avg: { similarity: 0.85 },
        _max: { similarity: 0.95 },
        _min: { similarity: 0.70 },
      });

      const metrics = await similaritySearch.getIntentMetrics('track_order');

      expect(metrics.totalHits).toBe(100);
      expect(metrics.chosenCount).toBe(80);
      expect(metrics.averageSimilarity).toBe(0.85);
    });
  });

  describe('IntentClassifier', () => {
    it('should classify intent successfully', async () => {
      // Mock embedding generation
      jest.spyOn(embeddingGenerator, 'generateEmbedding').mockResolvedValue({
        success: true,
        result: { dimensions: 3, values: [0.1, 0.2, 0.3], model: 'test', generatedAt: new Date() },
        tokensUsed: 10,
        model: 'test',
        latencyMs: 100,
        cached: false,
      });

      // Mock similarity search
      jest.spyOn(similaritySearch, 'searchSimilarIntents').mockResolvedValue({
        candidates: [
          { name: 'track_order', similarity: 0.9, threshold: 0.8, actionType: 'TEMPLATE' },
        ],
        bestMatch: { name: 'track_order', similarity: 0.9, threshold: 0.8, actionType: 'TEMPLATE' },
        searchLatencyMs: 50,
      });

      const result = await intentClassifier.classifyIntent('I want to track my order', {
        traceId: 'test-trace',
        conversationId: 123,
        messageId: 'msg-123',
      });

      expect(result.classified).toBe(true);
      expect(result.intent).toBe('track_order');
      expect(result.score).toBe(0.9);
      expect(result.candidates).toHaveLength(1);
    });

    it('should handle classification failure gracefully', async () => {
      // Mock embedding generation failure
      jest.spyOn(embeddingGenerator, 'generateEmbedding').mockResolvedValue({
        success: false,
        error: 'OpenAI API error',
        tokensUsed: 0,
        model: 'test',
        latencyMs: 100,
        cached: false,
      });

      const result = await intentClassifier.classifyIntent('test text');

      expect(result.classified).toBe(false);
      expect(result.intent).toBeUndefined();
      expect(result.score).toBe(0);
    });

    it('should create audit logs', async () => {
      mockPrisma.llmAudit.create.mockResolvedValue({} as any);

      // Mock successful classification
      jest.spyOn(embeddingGenerator, 'generateEmbedding').mockResolvedValue({
        success: true,
        result: { dimensions: 3, values: [0.1, 0.2, 0.3], model: 'test', generatedAt: new Date() },
        tokensUsed: 10,
        model: 'test',
        latencyMs: 100,
        cached: false,
      });

      jest.spyOn(similaritySearch, 'searchSimilarIntents').mockResolvedValue({
        candidates: [],
        bestMatch: undefined,
        searchLatencyMs: 50,
      });

      await intentClassifier.classifyIntent('test text', {
        conversationId: 123,
        messageId: 'msg-123',
      });

      expect(mockPrisma.llmAudit.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          conversationId: '123',
          messageId: 'msg-123',
          mode: 'INTENT_CLASSIFY',
          inputText: expect.any(String),
          resultJson: expect.any(Object),
        }),
      });
    });

    it('should mask PII in audit logs', async () => {
      const maskPII = (intentClassifier as any).maskPII;
      
      const text = 'My phone is 11987654321 and email is test@example.com';
      const masked = maskPII(text);

      expect(masked).toContain('***PHONE***');
      expect(masked).toContain('***EMAIL***');
      expect(masked).not.toContain('11987654321');
      expect(masked).not.toContain('test@example.com');
    });
  });

  describe('PayloadRouter', () => {
    let payloadRouter: PayloadRouter;

    beforeEach(() => {
      payloadRouter = new PayloadRouter(mockRedis);
    });

    it('should parse valid namespaced payloads', async () => {
      const parsePayload = (payloadRouter as any).parsePayload;

      const intentRoute = parsePayload('intent:track_order');
      expect(intentRoute).toEqual({
        type: 'intent',
        slug: 'track_order',
        action: expect.any(Object),
      });

      const flowRoute = parsePayload('flow:onboarding');
      expect(flowRoute).toEqual({
        type: 'flow',
        slug: 'onboarding',
        action: expect.any(Object),
      });

      const helpRoute = parsePayload('help:payment');
      expect(helpRoute).toEqual({
        type: 'help',
        slug: 'payment',
        action: expect.any(Object),
      });
    });

    it('should reject invalid payload formats', async () => {
      const parsePayload = (payloadRouter as any).parsePayload;

      expect(parsePayload('invalid')).toBeNull();
      expect(parsePayload('intent:')).toBeNull();
      expect(parsePayload('unknown:test')).toBeNull();
      expect(parsePayload('intent:test@invalid')).toBeNull();
    });

    it('should route payloads correctly', async () => {
      mockRedis.hgetall.mockResolvedValue({});

      const result = await payloadRouter.routePayload('intent:track_order', {
        traceId: 'test-trace',
        accountId: 123,
      });

      expect(result.route?.type).toBe('intent');
      expect(result.route?.slug).toBe('track_order');
      expect(result.action).toBeDefined();
    });

    it('should update routing metrics', async () => {
      const updateMetrics = (payloadRouter as any).updateMetrics;
      
      await updateMetrics('success', 'intent', 'test-trace');

      expect(mockRedis.pipeline).toHaveBeenCalled();
    });
  });

  describe('ConversationContextStore', () => {
    let contextStore: ConversationContextStore;

    beforeEach(() => {
      contextStore = new ConversationContextStore(mockRedis);
    });

    it('should add messages to context', async () => {
      mockRedis.get.mockResolvedValue(null); // No existing context

      await contextStore.addMessage(123, {
        role: 'user',
        content: 'Hello, I need help',
        timestamp: Date.now(),
      });

      expect(mockRedis.setex).toHaveBeenCalledWith(
        'ai:context:123',
        900, // 15 minutes in seconds
        expect.any(String)
      );
    });

    it('should limit context to max messages', async () => {
      const existingContext = {
        conversationId: 123,
        messages: Array(10).fill(null).map((_, i) => ({
          role: 'user',
          content: `Message ${i}`,
          timestamp: Date.now() - (10 - i) * 1000,
        })),
        ttl: 900,
        lastUpdated: new Date(),
      };

      mockRedis.get.mockResolvedValue(JSON.stringify(existingContext));

      await contextStore.addMessage(123, {
        role: 'user',
        content: 'New message',
        timestamp: Date.now(),
      });

      // Should have called setex with context containing max 6 messages
      const setexCall = mockRedis.setex.mock.calls[0];
      const storedContext = JSON.parse(setexCall[2]);
      expect(storedContext.messages).toHaveLength(6);
    });

    it('should compose context for LLM', async () => {
      const context = {
        conversationId: 123,
        messages: [
          { role: 'user', content: 'Hello', timestamp: Date.now() - 2000 },
          { role: 'assistant', content: 'Hi there!', timestamp: Date.now() - 1000 },
          { role: 'user', content: 'I need help', timestamp: Date.now() },
        ],
        ttl: 900,
        lastUpdated: new Date(),
      };

      mockRedis.get.mockResolvedValue(JSON.stringify(context));

      const llmContext = await contextStore.composeContextForLLM(123);

      expect(llmContext).toContain('Histórico da conversa:');
      expect(llmContext).toContain('Cliente');
      expect(llmContext).toContain('Assistente');
      expect(llmContext).toContain('Hello');
      expect(llmContext).toContain('Hi there!');
      expect(llmContext).toContain('I need help');
    });

    it('should truncate long context', async () => {
      const longContext = {
        conversationId: 123,
        messages: [
          { role: 'user', content: 'A'.repeat(500), timestamp: Date.now() - 1000 },
          { role: 'assistant', content: 'B'.repeat(500), timestamp: Date.now() },
        ],
        ttl: 900,
        lastUpdated: new Date(),
      };

      mockRedis.get.mockResolvedValue(JSON.stringify(longContext));

      const llmContext = await contextStore.composeContextForLLM(123, { maxLength: 100 });

      expect(llmContext.length).toBeLessThanOrEqual(100);
    });
  });

  describe('Integration Tests', () => {
    it('should perform end-to-end intent classification', async () => {
      // Setup mocks for full flow
      jest.spyOn(embeddingGenerator, 'generateEmbedding').mockResolvedValue({
        success: true,
        result: { dimensions: 3, values: [0.1, 0.2, 0.3], model: 'test', generatedAt: new Date() },
        tokensUsed: 10,
        model: 'test',
        latencyMs: 100,
        cached: false,
      });

      mockPrisma.$queryRaw.mockResolvedValue([
        {
          id: 'intent-1',
          name: 'track_order',
          description: 'Track order intent',
          actionType: 'TEMPLATE',
          templateId: 'template-1',
          similarityThreshold: 0.8,
          similarity: 0.9,
        },
      ]);

      mockPrisma.intentHitLog.createMany.mockResolvedValue({ count: 1 });
      mockPrisma.llmAudit.create.mockResolvedValue({} as any);

      const result = await intentClassifier.classifyIntent(
        'I want to track my order #12345',
        {
          traceId: 'test-trace',
          accountId: 123,
          conversationId: 456,
          messageId: 'msg-789',
        }
      );

      expect(result.classified).toBe(true);
      expect(result.intent).toBe('track_order');
      expect(result.score).toBe(0.9);
      expect(result.candidates).toHaveLength(1);

      // Verify audit logging
      expect(mockPrisma.llmAudit.create).toHaveBeenCalled();
      expect(mockPrisma.intentHitLog.createMany).toHaveBeenCalled();
    });

    it('should handle classification with context', async () => {
      const contextStore = new ConversationContextStore(mockRedis);

      // Add some context
      await contextStore.addMessage(123, {
        role: 'user',
        content: 'I made an order yesterday',
        timestamp: Date.now() - 60000,
      });

      await contextStore.addMessage(123, {
        role: 'assistant',
        content: 'I can help you with that. What do you need?',
        timestamp: Date.now() - 30000,
      });

      // Mock context retrieval
      const context = {
        conversationId: 123,
        messages: [
          { role: 'user', content: 'I made an order yesterday', timestamp: Date.now() - 60000 },
          { role: 'assistant', content: 'I can help you with that. What do you need?', timestamp: Date.now() - 30000 },
        ],
        ttl: 900,
        lastUpdated: new Date(),
      };

      mockRedis.get.mockResolvedValue(JSON.stringify(context));

      const llmContext = await contextStore.composeContextForLLM(123);
      expect(llmContext).toContain('I made an order yesterday');
      expect(llmContext).toContain('I can help you with that');
    });
  });
});