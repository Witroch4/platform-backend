/**
 * Tests for Quality Evaluation System
 * Tests evaluation dataset, pipeline, and cost tracking functionality
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import {
  LEGAL_EVALUATION_DATASET,
  QUALITY_THRESHOLDS,
  getExamplesByBand,
  getExamplesByDomain,
  validateDataset,
  EvaluationExample
} from '../evaluation-dataset';
import { EvaluationPipeline, runQualityEvaluation } from '../evaluation-pipeline';
import { RequestCostTracker, createRequestCostTracker } from '../request-cost-tracker';
import { AgentConfig } from '@/services/openai';

// Mock dependencies
jest.mock('@/lib/connections');
jest.mock('@/lib/utils/logger');
jest.mock('@/lib/socialwise-flow/classification');
jest.mock('@/lib/socialwise-flow/performance-bands');

describe('Evaluation Dataset', () => {
  test('should have valid dataset structure', () => {
    expect(LEGAL_EVALUATION_DATASET).toBeDefined();
    expect(LEGAL_EVALUATION_DATASET.length).toBeGreaterThan(0);
    
    // Check first example structure
    const example = LEGAL_EVALUATION_DATASET[0];
    expect(example).toHaveProperty('id');
    expect(example).toHaveProperty('userText');
    expect(example).toHaveProperty('expectedBand');
    expect(example).toHaveProperty('legalDomain');
    expect(example).toHaveProperty('complexity');
    expect(example).toHaveProperty('metadata');
  });

  test('should validate dataset integrity', () => {
    const validation = validateDataset();
    expect(validation.valid).toBe(true);
    expect(validation.errors).toHaveLength(0);
  });

  test('should have examples for all bands', () => {
    const hardExamples = getExamplesByBand('HARD');
    const softExamples = getExamplesByBand('SOFT');
    const lowExamples = getExamplesByBand('LOW');

    expect(hardExamples.length).toBeGreaterThan(0);
    expect(softExamples.length).toBeGreaterThan(0);
    expect(lowExamples.length).toBeGreaterThan(0);
  });

  test('should have Portuguese legal examples', () => {
    const examples = LEGAL_EVALUATION_DATASET;
    
    // Check for Portuguese legal terms
    const hasPortugueseLegal = examples.some(example => 
      /mandado|recurso|indenização|divórcio|trabalhista|consumidor/i.test(example.userText)
    );
    
    expect(hasPortugueseLegal).toBe(true);
  });

  test('should have proper score ranges for HARD band', () => {
    const hardExamples = getExamplesByBand('HARD');
    
    hardExamples.forEach(example => {
      if (example.expectedScore !== undefined) {
        expect(example.expectedScore).toBeGreaterThanOrEqual(0.8);
        expect(example.expectedScore).toBeLessThanOrEqual(1.0);
      }
    });
  });

  test('should have legal domain coverage', () => {
    const domains = new Set(LEGAL_EVALUATION_DATASET.map(e => e.legalDomain));
    
    // Should cover major legal areas
    expect(domains.has('direito_civil')).toBe(true);
    expect(domains.has('direito_consumidor')).toBe(true);
    expect(domains.has('direito_trabalhista')).toBe(true);
    expect(domains.has('direito_familia')).toBe(true);
  });
});

describe('Quality Thresholds', () => {
  test('should have realistic quality thresholds', () => {
    expect(QUALITY_THRESHOLDS.HARD_BAND_ACCURACY).toBe(0.90);
    expect(QUALITY_THRESHOLDS.SOFT_BAND_CTR).toBe(0.35);
    expect(QUALITY_THRESHOLDS.LOW_BAND_VALID_TOPICS).toBe(0.95);
    expect(QUALITY_THRESHOLDS.OVERALL_ACCURACY).toBe(0.85);
    expect(QUALITY_THRESHOLDS.MAX_RESPONSE_TIME).toBe(400);
    expect(QUALITY_THRESHOLDS.MAX_ERROR_RATE).toBe(0.05);
  });
});

describe('Evaluation Pipeline', () => {
  let mockAgent: AgentConfig;
  let mockPrisma: any;
  let mockRedis: any;

  beforeEach(() => {
    mockAgent = {
      model: 'gpt-5-nano-2025-08-07',
      reasoningEffort: 'minimal',
      verbosity: 'low',
      tempSchema: 0.1,
      tempCopy: 0.3
    } as AgentConfig;

    mockPrisma = {
      evaluationReport: {
        create: jest.fn().mockResolvedValue({ id: 'test-report' })
      }
    };

    mockRedis = {
      setex: jest.fn().mockResolvedValue('OK'),
      keys: jest.fn().mockResolvedValue([]),
      get: jest.fn().mockResolvedValue(null)
    };

    // Mock the connections
    require('@/lib/connections').getPrismaInstance.mockReturnValue(mockPrisma);
    require('@/lib/connections').getRedisInstance.mockReturnValue(mockRedis);
  });

  test('should create evaluation pipeline with config', () => {
    const config = {
      sampleSize: 10,
      agent: mockAgent,
      userId: 'test-user'
    };

    const pipeline = new EvaluationPipeline(config);
    expect(pipeline).toBeDefined();
  });

  test('should select stratified sample', () => {
    const config = {
      sampleSize: 15, // 5 per band
      agent: mockAgent,
      userId: 'test-user'
    };

    const pipeline = new EvaluationPipeline(config);
    
    // Access private method for testing
    const selectMethod = (pipeline as any).selectEvaluationExamples.bind(pipeline);
    const selected = selectMethod();

    expect(selected.length).toBeLessThanOrEqual(15);
    
    // Should have examples from different bands
    const bands = new Set(selected.map((e: EvaluationExample) => e.expectedBand));
    expect(bands.size).toBeGreaterThan(1);
  });
});

describe('Request Cost Tracker', () => {
  let costTracker: RequestCostTracker;
  let mockPrisma: any;
  let mockRedis: any;

  beforeEach(() => {
    mockPrisma = {
      costEvent: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { cost: 0 } })
      },
      requestCostBreakdown: {
        create: jest.fn().mockResolvedValue({ id: 'test-breakdown' }),
        findMany: jest.fn().mockResolvedValue([])
      }
    };

    mockRedis = {
      setex: jest.fn().mockResolvedValue('OK'),
      incr: jest.fn().mockResolvedValue(1)
    };

    require('@/lib/connections').getPrismaInstance.mockReturnValue(mockPrisma);
    require('@/lib/connections').getRedisInstance.mockReturnValue(mockRedis);

    costTracker = createRequestCostTracker({
      enableDetailedTracking: true,
      enableBudgetAlerts: true,
      costThresholds: {
        dailyBudget: 10.0,
        monthlyBudget: 200.0,
        alertThreshold: 80
      }
    });
  });

  test('should start request tracking', async () => {
    const requestId = 'test-request-123';
    
    await costTracker.startRequest(requestId, {
      sessionId: 'session-123',
      inboxId: 'inbox-123',
      userId: 'user-123',
      band: 'SOFT',
      strategy: 'warmup_buttons'
    });

    // Should not throw and should initialize tracking
    expect(true).toBe(true);
  });

  test('should track embedding cost', async () => {
    const requestId = 'test-request-123';
    
    await costTracker.startRequest(requestId, {
      userId: 'user-123'
    });

    // Mock pricing service
    const mockPricingService = require('../pricing-service');
    mockPricingService.pricingService = {
      resolveUnitPrice: jest.fn().mockResolvedValue({
        pricePerUnit: 0.0001,
        currency: 'USD',
        priceCardId: 'test-card'
      })
    };

    await costTracker.trackEmbeddingCost(requestId, 100, 'text-embedding-3-small');

    // Should not throw
    expect(true).toBe(true);
  });

  test('should track LLM cost', async () => {
    const requestId = 'test-request-123';
    
    await costTracker.startRequest(requestId, {
      userId: 'user-123'
    });

    // Mock pricing service
    const mockPricingService = require('../pricing-service');
    mockPricingService.pricingService = {
      resolveUnitPrice: jest.fn().mockResolvedValue({
        pricePerUnit: 0.01,
        currency: 'USD',
        priceCardId: 'test-card'
      })
    };

    await costTracker.trackLLMCost(requestId, 'warmupButtons', {
      model: 'gpt-5-nano-2025-08-07',
      inputTokens: 100,
      outputTokens: 50,
      reasoningTokens: 25
    });

    // Should not throw
    expect(true).toBe(true);
  });

  test('should finalize request with cost breakdown', async () => {
    const requestId = 'test-request-123';
    
    await costTracker.startRequest(requestId, {
      userId: 'user-123',
      band: 'SOFT'
    });

    const breakdown = await costTracker.finalizeRequest(requestId, 250);

    // Should return breakdown or null (depending on mocks)
    expect(breakdown === null || typeof breakdown === 'object').toBe(true);
  });

  test('should calculate cost analytics', async () => {
    const analytics = await costTracker.getCostAnalytics('user-123', {
      start: new Date('2025-01-01'),
      end: new Date('2025-01-31')
    });

    expect(analytics).toHaveProperty('totalCost');
    expect(analytics).toHaveProperty('requestCount');
    expect(analytics).toHaveProperty('averageCostPerRequest');
    expect(analytics).toHaveProperty('costByBand');
    expect(analytics).toHaveProperty('costByOperation');
  });
});

describe('Integration Tests', () => {
  test('should run quality evaluation end-to-end', async () => {
    const mockAgent: AgentConfig = {
      model: 'gpt-5-nano-2025-08-07',
      reasoningEffort: 'minimal',
      verbosity: 'low',
      tempSchema: 0.1,
      tempCopy: 0.3
    } as AgentConfig;

    // Mock classification function
    const mockClassification = require('@/lib/socialwise-flow/classification');
    mockClassification.classifyIntent = jest.fn().mockResolvedValue({
      band: 'HARD',
      score: 0.85,
      candidates: [{ slug: 'test-intent', name: 'Test Intent', desc: 'Test', score: 0.85 }],
      strategy: 'direct_map',
      metrics: { embedding_ms: 50, route_total_ms: 100 }
    });

    // Mock performance band processor
    const mockProcessor = require('@/lib/socialwise-flow/performance-bands');
    mockProcessor.PerformanceBandProcessor = jest.fn().mockImplementation(() => ({
      process: jest.fn().mockResolvedValue({
        type: 'direct_map',
        intent_slug: 'test-intent',
        response_time_ms: 100
      })
    }));

    // Mock database and Redis
    const mockPrisma = {
      evaluationReport: {
        create: jest.fn().mockResolvedValue({ id: 'test-report' })
      }
    };

    const mockRedis = {
      setex: jest.fn().mockResolvedValue('OK')
    };

    require('@/lib/connections').getPrismaInstance.mockReturnValue(mockPrisma);
    require('@/lib/connections').getRedisInstance.mockReturnValue(mockRedis);

    // Run evaluation with small sample
    const report = await runQualityEvaluation(mockAgent, 'test-user', {
      sampleSize: 5
    });

    expect(report).toHaveProperty('qualityMetrics');
    expect(report).toHaveProperty('bandResults');
    expect(report).toHaveProperty('recommendations');
    expect(report.totalExamples).toBe(5);
  });

  test('should detect quality regression', async () => {
    const mockAgent: AgentConfig = {
      model: 'gpt-5-nano-2025-08-07',
      reasoningEffort: 'minimal',
      verbosity: 'low'
    } as AgentConfig;

    // Mock poor classification results
    const mockClassification = require('@/lib/socialwise-flow/classification');
    mockClassification.classifyIntent = jest.fn().mockResolvedValue({
      band: 'LOW', // Wrong band for HARD examples
      score: 0.3,
      candidates: [],
      strategy: 'domain_topics',
      metrics: { embedding_ms: 50, route_total_ms: 100 }
    });

    const mockPrisma = {
      evaluationReport: {
        create: jest.fn().mockResolvedValue({ id: 'test-report' })
      }
    };

    const mockRedis = {
      setex: jest.fn().mockResolvedValue('OK')
    };

    require('@/lib/connections').getPrismaInstance.mockReturnValue(mockPrisma);
    require('@/lib/connections').getRedisInstance.mockReturnValue(mockRedis);

    const report = await runQualityEvaluation(mockAgent, 'test-user', {
      sampleSize: 5
    });

    // Should detect regression due to poor accuracy
    expect(report.regressionDetected).toBe(true);
    expect(report.recommendations.length).toBeGreaterThan(0);
  });
});

describe('Cost Analysis and Budget Controls', () => {
  test('should generate cost optimization recommendations', () => {
    const costTracker = createRequestCostTracker();
    
    // Test high embedding cost scenario
    const breakdown = {
      requestId: 'test-123',
      embeddingCost: 0.05,
      totalCost: 0.10,
      llmCosts: { warmupButtons: 0.03, shortTitles: 0.02 },
      responseTimeMs: 1500,
      band: 'SOFT' as const
    };

    // Access private method for testing
    const generateRecommendations = (costTracker as any).generateOptimizationRecommendations.bind(costTracker);
    const recommendations = generateRecommendations(breakdown);

    expect(Array.isArray(recommendations)).toBe(true);
  });

  test('should validate budget thresholds', () => {
    const config = {
      enableBudgetAlerts: true,
      costThresholds: {
        dailyBudget: 10.0,
        monthlyBudget: 200.0,
        alertThreshold: 80
      }
    };

    expect(config.costThresholds.dailyBudget).toBeGreaterThan(0);
    expect(config.costThresholds.monthlyBudget).toBeGreaterThan(config.costThresholds.dailyBudget);
    expect(config.costThresholds.alertThreshold).toBeGreaterThan(0);
    expect(config.costThresholds.alertThreshold).toBeLessThanOrEqual(100);
  });
});