/**
 * Feature Flag Service Tests
 * Based on requirements 16.1, 16.2, 16.3, 16.4
 */

import { FeatureFlagService } from '@/lib/ai-integration/services/feature-flag-service';
import { FeatureFlagManager } from '@/lib/ai-integration/services/feature-flag-manager';
import { AI_FEATURE_FLAGS } from '@/lib/ai-integration/types/feature-flags';

// Mock log module
jest.mock('@/lib/log', () => ({
  log: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));

// Mock Redis
const mockRedis = {
  get: jest.fn(),
  set: jest.fn(),
  setex: jest.fn(),
  del: jest.fn(),
  keys: jest.fn(),
  hmget: jest.fn(),
  multi: jest.fn().mockReturnValue({
    hincrby: jest.fn().mockReturnThis(),
    hincrbyfloat: jest.fn().mockReturnThis(),
    hset: jest.fn().mockReturnThis(),
    expire: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue([])
  })
};

describe('FeatureFlagService', () => {
  let flagService: FeatureFlagService;

  beforeEach(() => {
    jest.clearAllMocks();
    flagService = new FeatureFlagService(mockRedis as any);
    
    // Mock environment variables
    process.env.FEATURE_FLAG_CACHE_ENABLED = 'true';
    process.env.FEATURE_FLAG_CACHE_TTL = '300';
  });

  describe('isEnabled', () => {
    it('should return true when flag is enabled', async () => {
      process.env.AI_INTENTS_ENABLED = 'true';
      mockRedis.get.mockResolvedValue(null); // No cache
      
      const context = { accountId: 123 };
      const result = await flagService.isEnabled(AI_FEATURE_FLAGS.INTENTS_ENABLED, context);

      expect(result).toBe(true);
    });

    it('should return false when flag is disabled', async () => {
      process.env.AI_INTENTS_ENABLED = 'false';
      mockRedis.get.mockResolvedValue(null); // No cache
      
      const context = { accountId: 123 };
      const result = await flagService.isEnabled(AI_FEATURE_FLAGS.INTENTS_ENABLED, context);

      expect(result).toBe(false);
    });

    it('should return cached result when available', async () => {
      const cachedEvaluation = {
        flagId: AI_FEATURE_FLAGS.INTENTS_ENABLED,
        enabled: true,
        reason: 'Cached result',
        evaluatedAt: new Date(),
        context: { accountId: 123 }
      };

      mockRedis.get.mockResolvedValue(JSON.stringify(cachedEvaluation));
      mockRedis.hmget.mockResolvedValue(['1', '1', '0', '0', Date.now().toString(), '100']);

      const context = { accountId: 123 };
      const result = await flagService.isEnabled(AI_FEATURE_FLAGS.INTENTS_ENABLED, context);

      expect(result).toBe(true);
    });
  });

  describe('evaluate', () => {
    it('should evaluate flag with override', async () => {
      const override = {
        flagId: AI_FEATURE_FLAGS.INTENTS_ENABLED,
        accountId: 123,
        enabled: true,
        reason: 'Test override',
        createdBy: 'admin',
        createdAt: new Date()
      };

      mockRedis.get
        .mockResolvedValueOnce(null) // No cache
        .mockResolvedValueOnce(JSON.stringify(override)); // Override exists
      
      mockRedis.setex.mockResolvedValue('OK');
      mockRedis.multi.mockReturnValue({
        hincrby: jest.fn().mockReturnThis(),
        hset: jest.fn().mockReturnThis(),
        expire: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([])
      });

      const context = { accountId: 123 };
      const evaluation = await flagService.evaluate(AI_FEATURE_FLAGS.INTENTS_ENABLED, context);

      expect(evaluation.enabled).toBe(true);
      expect(evaluation.reason).toContain('Override');
    });

    it('should handle flag not found', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockRedis.multi.mockReturnValue({
        hincrby: jest.fn().mockReturnThis(),
        hset: jest.fn().mockReturnThis(),
        expire: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([])
      });

      const context = { accountId: 123 };
      const evaluation = await flagService.evaluate('non-existent-flag', context);

      expect(evaluation.enabled).toBe(false);
      expect(evaluation.reason).toBe('Flag not found');
    });

    it('should handle evaluation errors gracefully', async () => {
      mockRedis.get.mockRejectedValue(new Error('Redis error'));
      mockRedis.multi.mockReturnValue({
        hincrby: jest.fn().mockReturnThis(),
        hset: jest.fn().mockReturnThis(),
        expire: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([])
      });

      const context = { accountId: 123 };
      const evaluation = await flagService.evaluate(AI_FEATURE_FLAGS.INTENTS_ENABLED, context);

      expect(evaluation.enabled).toBe(false);
      expect(evaluation.reason).toContain('Error');
    });
  });

  describe('override', () => {
    it('should create override successfully', async () => {
      mockRedis.setex.mockResolvedValue('OK');
      mockRedis.keys.mockResolvedValue([]);

      const override = {
        flagId: AI_FEATURE_FLAGS.INTENTS_ENABLED,
        accountId: 123,
        enabled: true,
        reason: 'Test override',
        createdBy: 'admin'
      };

      await flagService.override(override);

      expect(mockRedis.setex).toHaveBeenCalledWith(
        expect.stringContaining('ff_override'),
        86400,
        expect.stringContaining('Test override')
      );
    });
  });

  describe('getMetrics', () => {
    it('should return metrics for flag', async () => {
      mockRedis.hmget.mockResolvedValue(['100', '80', '20', '0', Date.now().toString(), '5000']);

      const metrics = await flagService.getMetrics(AI_FEATURE_FLAGS.INTENTS_ENABLED);

      expect(metrics.evaluations).toBe(100);
      expect(metrics.enabledCount).toBe(80);
      expect(metrics.disabledCount).toBe(20);
      expect(metrics.errorCount).toBe(0);
      expect(metrics.averageLatencyMs).toBe(50); // 5000 / 100
    });

    it('should handle missing metrics', async () => {
      mockRedis.hmget.mockResolvedValue([null, null, null, null, null, null]);

      const metrics = await flagService.getMetrics(AI_FEATURE_FLAGS.INTENTS_ENABLED);

      expect(metrics.evaluations).toBe(0);
      expect(metrics.enabledCount).toBe(0);
      expect(metrics.disabledCount).toBe(0);
      expect(metrics.errorCount).toBe(0);
      expect(metrics.averageLatencyMs).toBe(0);
    });
  });
});

describe('FeatureFlagManager', () => {
  let flagManager: FeatureFlagManager;

  beforeEach(() => {
    jest.clearAllMocks();
    flagManager = new FeatureFlagManager(mockRedis as any);
  });

  describe('getAIFeatureFlags', () => {
    it('should return all AI feature flags', async () => {
      // Mock all flags as enabled
      process.env.AI_INTENTS_ENABLED = 'true';
      process.env.AI_LLM_DYNAMIC_ENABLED = 'true';
      process.env.AI_MESSAGES_INTERACTIVE_ENABLED = 'true';
      process.env.AI_ECONOMIC_MODE_ENABLED = 'true';
      process.env.AI_BUDGET_CONTROL_ENABLED = 'true';

      mockRedis.get.mockResolvedValue(null); // No cache or overrides

      const context = { accountId: 123 };
      const config = await flagManager.getAIFeatureFlags(context);

      expect(config.intentsEnabled).toBe(true);
      expect(config.dynamicLlmEnabled).toBe(true);
      expect(config.interactiveMessagesEnabled).toBe(true);
      expect(config.economicModeEnabled).toBe(true);
      expect(config.budgetControlEnabled).toBe(true);
    });

    it('should return safe defaults on error', async () => {
      mockRedis.get.mockRejectedValue(new Error('Redis error'));

      const context = { accountId: 123 };
      const config = await flagManager.getAIFeatureFlags(context);

      expect(config.intentsEnabled).toBe(false);
      expect(config.dynamicLlmEnabled).toBe(false);
      expect(config.interactiveMessagesEnabled).toBe(false);
      expect(config.economicModeEnabled).toBe(false);
      expect(config.budgetControlEnabled).toBe(false);
    });
  });

  describe('createContextFromJobData', () => {
    it('should create context from job data', () => {
      const context = flagManager.createContextFromJobData({
        accountId: 123,
        inboxId: 456,
        conversationId: 789,
        channel: 'whatsapp'
      });

      expect(context.accountId).toBe(123);
      expect(context.inboxId).toBe(456);
      expect(context.conversationId).toBe(789);
      expect(context.channel).toBe('whatsapp');
    });
  });

  describe('enableForAccount', () => {
    it('should enable flag for account', async () => {
      mockRedis.setex.mockResolvedValue('OK');
      mockRedis.keys.mockResolvedValue([]);

      await flagManager.enableForAccount(
        AI_FEATURE_FLAGS.INTENTS_ENABLED,
        123,
        'Testing',
        'admin'
      );

      expect(mockRedis.setex).toHaveBeenCalled();
    });
  });

  describe('validateFeatureFlagConfig', () => {
    it('should validate valid configuration', () => {
      const config = {
        intentsEnabled: true,
        dynamicLlmEnabled: true,
        interactiveMessagesEnabled: true,
        economicModeEnabled: true,
        budgetControlEnabled: true
      };

      const result = flagManager.validateFeatureFlagConfig(config);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect invalid configuration', () => {
      const config = {
        intentsEnabled: true,
        dynamicLlmEnabled: false,
        interactiveMessagesEnabled: true, // Requires dynamic LLM
        economicModeEnabled: true,
        budgetControlEnabled: false // Economic mode requires budget control
      };

      const result = flagManager.validateFeatureFlagConfig(config);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Economic mode requires budget control to be enabled');
      expect(result.errors).toContain('Interactive messages require dynamic LLM to be enabled');
    });
  });
});