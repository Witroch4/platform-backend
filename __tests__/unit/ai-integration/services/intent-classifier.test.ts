/**
 * Unit tests for Intent Classification Service
 * Tests intent classification and batch processing
 */

import { IntentClassifier } from '@/lib/ai-integration/services/intent-classifier';
import { EmbeddingGenerator } from '@/lib/ai-integration/services/embedding-generator';
import { SimilaritySearchService } from '@/lib/ai-integration/services/similarity-search';
import { getPrismaInstance } from "@/lib/connections";
import { Redis } from 'ioredis';

// Mock dependencies
jest.mock('@/lib/ai-integration/services/embedding-generator');
jest.mock('@/lib/ai-integration/services/similarity-search');
jest.mock('@prisma/client');
jest.mock('ioredis');

describe('IntentClassifier', () => {
  let intentClassifier: IntentClassifier;
  let mockEmbeddingGenerator: jest.Mocked<EmbeddingGenerator>;
  let mockSimilaritySearch: jest.Mocked<SimilaritySearchService>;
  let mockPrisma: jest.Mocked<PrismaClient>;
  let mockRedis: jest.Mocked<Redis>;

  beforeEach(() => {
    mockEmbeddingGenerator = {
      generateEmbedding: jest.fn(),
    } as any;

    mockSimilaritySearch = {
      searchSimilarIntents: jest.fn(),
    } as any;

    mockPrisma = {
      llmAudit: {
        create: jest.fn(),
      },
    } as any;

    mockRedis = {
      get: jest.fn(),
      set: jest.fn(),
      incr: jest.fn(),
      expire: jest.fn(),
    } as any;

    intentClassifier = new IntentClassifier(
      mockEmbeddingGenerator,
      mockSimilaritySearch,
      mockPrisma,
      mockRedis,
      {
        defaultThreshold: 0.8,
        maxCandidates: 5,
        enableMetrics: true,
        auditEnabled: true,
        auditTtlDays: 90,
      }
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('classifyIntent', () => {
    const testOptions = {
      traceId: 'test-trace-123',
      accountId: 123,
      conversationId: 456,
      messageId: 'msg-789',
    };

    it('should classify intent successfully when above threshold', async () => {
      const testText = 'I need help with my order';
      const mockEmbedding = [0.1, 0.2, 0.3];
      const mockCandidates = [
        { intent: 'order_help', score: 0.95, examples: ['help with order'] },
        { intent: 'general_help', score: 0.75, examples: ['need help'] },
      ];

      mockEmbeddingGenerator.generateEmbedding.mockResolvedValue(mockEmbedding);
      mockSimilaritySearch.searchSimilarIntents.mockResolvedValue(mockCandidates);

      const result = await intentClassifier.classifyIntent(testText, testOptions);

      expect(result.intent).toBe('order_help');
      expect(result.confidence).toBe(0.95);
      expect(result.candidates).toHaveLength(2);
      expect(mockEmbeddingGenerator.generateEmbedding).toHaveBeenCalledWith(
        testText,
        { traceId: 'test-trace-123', accountId: 123, skipCache: false }
      );
    });

    it('should return null when no intent above threshold', async () => {
      const testText = 'Random text';
      const mockEmbedding = [0.1, 0.2, 0.3];
      const mockCandidates = [
        { intent: 'order_help', score: 0.6, examples: ['help with order'] },
        { intent: 'general_help', score: 0.5, examples: ['need help'] },
      ];

      mockEmbeddingGenerator.generateEmbedding.mockResolvedValue(mockEmbedding);
      mockSimilaritySearch.searchSimilarIntents.mockResolvedValue(mockCandidates);

      const result = await intentClassifier.classifyIntent(testText, testOptions);

      expect(result.intent).toBeNull();
      expect(result.confidence).toBe(0.6);
      expect(result.candidates).toHaveLength(2);
    });

    it('should return null when no candidates found', async () => {
      const testText = 'Completely unrelated text';
      const mockEmbedding = [0.1, 0.2, 0.3];

      mockEmbeddingGenerator.generateEmbedding.mockResolvedValue(mockEmbedding);
      mockSimilaritySearch.searchSimilarIntents.mockResolvedValue([]);

      const result = await intentClassifier.classifyIntent(testText, testOptions);

      expect(result.intent).toBeNull();
      expect(result.confidence).toBe(0);
      expect(result.candidates).toHaveLength(0);
    });

    it('should handle embedding generation errors', async () => {
      const testText = 'Test text';
      const error = new Error('Embedding generation failed');

      mockEmbeddingGenerator.generateEmbedding.mockRejectedValue(error);

      await expect(intentClassifier.classifyIntent(testText, testOptions)).rejects.toThrow(
        'Embedding generation failed'
      );
    });

    it('should handle similarity search errors', async () => {
      const testText = 'Test text';
      const mockEmbedding = [0.1, 0.2, 0.3];
      const error = new Error('Similarity search failed');

      mockEmbeddingGenerator.generateEmbedding.mockResolvedValue(mockEmbedding);
      mockSimilaritySearch.searchSimilarIntents.mockRejectedValue(error);

      await expect(intentClassifier.classifyIntent(testText, testOptions)).rejects.toThrow(
        'Similarity search failed'
      );
    });

    it('should normalize text before processing', async () => {
      const testText = '  TEST TEXT  ';
      const mockEmbedding = [0.1, 0.2, 0.3];
      const mockCandidates = [
        { intent: 'test_intent', score: 0.9, examples: ['test text'] },
      ];

      mockEmbeddingGenerator.generateEmbedding.mockResolvedValue(mockEmbedding);
      mockSimilaritySearch.searchSimilarIntents.mockResolvedValue(mockCandidates);

      await intentClassifier.classifyIntent(testText, testOptions);

      expect(mockEmbeddingGenerator.generateEmbedding).toHaveBeenCalledWith(
        'TEST TEXT',
        expect.any(Object)
      );
    });
  });

  describe('classifyBatch', () => {
    const testOptions = {
      traceId: 'test-trace-123',
      accountId: 123,
    };

    it('should classify multiple texts in batch', async () => {
      const texts = ['Help with order', 'Cancel subscription', 'General question'];
      const mockEmbedding = [0.1, 0.2, 0.3];
      const mockCandidates = [
        { intent: 'order_help', score: 0.9, examples: ['help with order'] },
      ];

      mockEmbeddingGenerator.generateEmbedding.mockResolvedValue(mockEmbedding);
      mockSimilaritySearch.searchSimilarIntents.mockResolvedValue(mockCandidates);

      const results = await intentClassifier.classifyBatch(texts, testOptions);

      expect(results).toHaveLength(3);
      expect(results[0].intent).toBe('order_help');
      expect(results[1].intent).toBe('order_help');
      expect(results[2].intent).toBe('order_help');
    });

    it('should handle partial failures in batch processing', async () => {
      const texts = ['Help with order', 'Cancel subscription', 'General question'];
      const mockEmbedding = [0.1, 0.2, 0.3];
      const mockCandidates = [
        { intent: 'order_help', score: 0.9, examples: ['help with order'] },
      ];

      mockEmbeddingGenerator.generateEmbedding
        .mockResolvedValueOnce(mockEmbedding)
        .mockRejectedValueOnce(new Error('Embedding failed'))
        .mockResolvedValueOnce(mockEmbedding);
      mockSimilaritySearch.searchSimilarIntents.mockResolvedValue(mockCandidates);

      const results = await intentClassifier.classifyBatch(texts, testOptions);

      expect(results).toHaveLength(3);
      expect(results[0].intent).toBe('order_help');
      expect(results[1].intent).toBeNull(); // Failed
      expect(results[2].intent).toBe('order_help');
    });
  });

  describe('getMetrics', () => {
    it('should return classification metrics', async () => {
      mockRedis.get.mockResolvedValue('100'); // totalClassifications
      mockRedis.get.mockResolvedValue('80');  // successfulClassifications
      mockRedis.get.mockResolvedValue('20');  // rejectedByThreshold
      mockRedis.get.mockResolvedValue('150'); // totalLatency
      mockRedis.get.mockResolvedValue('60');  // cacheHits
      mockRedis.get.mockResolvedValue('100'); // totalRequests

      const metrics = await intentClassifier.getMetrics({ traceId: 'test-trace' });

      expect(metrics.totalClassifications).toBe(100);
      expect(metrics.successfulClassifications).toBe(80);
      expect(metrics.rejectedByThreshold).toBe(20);
      expect(metrics.averageLatency).toBe(1.5); // 150 / 100
      expect(metrics.cacheHitRate).toBe(0.6); // 60 / 100
    });
  });
});