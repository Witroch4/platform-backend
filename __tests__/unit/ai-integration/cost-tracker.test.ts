/**
 * Cost Tracker Service Tests
 * Based on requirements 15.1, 15.2, 15.3
 */

import { CostTrackingService } from '@/lib/ai-integration/services/cost-tracker';
import { BudgetStatus } from '@/lib/ai-integration/types/cost-control';

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
  hmget: jest.fn(),
  multi: jest.fn(),
  keys: jest.fn()
};

describe('CostTrackingService', () => {
  let costTracker: CostTrackingService;

  beforeEach(() => {
    jest.clearAllMocks();
    costTracker = new CostTrackingService(mockRedis as any);
    
    // Mock environment variables
    process.env.TOKENS_DIA_CONTA = '100000';
    process.env.R_DIA_LIMITE = '50.00';
    process.env.BUDGET_CONTROL_ENABLED = 'true';
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('trackCost', () => {
    it('should track cost for LLM usage', async () => {
      const params = {
        accountId: 123,
        model: 'gpt-4o-mini',
        inputTokens: 100,
        outputTokens: 50,
        operation: 'generation' as const,
        traceId: 'trace-123'
      };

      mockRedis.hmget.mockResolvedValue(['0', '0', '0']);
      mockRedis.multi.mockReturnValue({
        hincrby: jest.fn().mockReturnThis(),
        hincrbyfloat: jest.fn().mockReturnThis(),
        expire: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([])
      });

      const result = await costTracker.trackCost(params);

      expect(result.tokensUsed).toBe(150);
      expect(result.costBrl).toBeGreaterThan(0);
      expect(result.model).toBe('gpt-4o-mini');
      expect(result.operation).toBe('generation');
      expect(mockRedis.multi).toHaveBeenCalled();
    });

    it('should handle unknown model gracefully', async () => {
      const params = {
        accountId: 123,
        model: 'unknown-model',
        inputTokens: 100,
        outputTokens: 50,
        operation: 'generation' as const,
        traceId: 'trace-123'
      };

      mockRedis.hmget.mockResolvedValue(['0', '0', '0']);
      mockRedis.multi.mockReturnValue({
        hincrby: jest.fn().mockReturnThis(),
        hincrbyfloat: jest.fn().mockReturnThis(),
        expire: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([])
      });

      const result = await costTracker.trackCost(params);

      expect(result.tokensUsed).toBe(150);
      expect(result.costBrl).toBe(0);
      expect(result.model).toBe('unknown-model');
    });
  });

  describe('getBudgetStatus', () => {
    it('should return budget status with economic mode inactive', async () => {
      mockRedis.hmget.mockResolvedValue(['1000', '5.0', '10']);
      mockRedis.get.mockResolvedValue(null);

      const status = await costTracker.getBudgetStatus(123);

      expect(status.accountId).toBe(123);
      expect(status.tokensUsed).toBe(1000);
      expect(status.costUsed).toBe(5.0);
      expect(status.economicModeActive).toBe(false);
      expect(status.budgetExceeded).toBe(false);
      expect(status.percentageUsed).toBeLessThan(0.8);
    });

    it('should activate economic mode when threshold reached', async () => {
      mockRedis.hmget.mockResolvedValue(['85000', '5.0', '100']);
      mockRedis.get.mockResolvedValue(null);
      mockRedis.setex.mockResolvedValue('OK');

      const status = await costTracker.getBudgetStatus(123);

      expect(status.economicModeActive).toBe(true);
      expect(status.budgetExceeded).toBe(false);
      expect(status.percentageUsed).toBeGreaterThan(0.8);
      expect(mockRedis.setex).toHaveBeenCalledWith('economic:123', 86400, '1');
    });

    it('should detect budget exceeded', async () => {
      mockRedis.hmget.mockResolvedValue(['120000', '60.0', '200']);
      mockRedis.get.mockResolvedValue(null);

      const status = await costTracker.getBudgetStatus(123);

      expect(status.budgetExceeded).toBe(true);
      expect(status.economicModeActive).toBe(true);
      expect(status.percentageUsed).toBeGreaterThan(1.0);
    });
  });

  describe('isEconomicModeActive', () => {
    it('should return true when economic flag is set', async () => {
      mockRedis.get.mockResolvedValue('1');

      const result = await costTracker.isEconomicModeActive(123);

      expect(result).toBe(true);
      expect(mockRedis.get).toHaveBeenCalledWith('economic:123');
    });

    it('should check budget status when flag not set', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockRedis.hmget.mockResolvedValue(['85000', '5.0', '100']);

      const result = await costTracker.isEconomicModeActive(123);

      expect(result).toBe(true);
    });
  });

  describe('resetDailyBudget', () => {
    it('should reset daily budget for account', async () => {
      mockRedis.multi.mockReturnValue({
        del: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([])
      });

      await costTracker.resetDailyBudget(123);

      expect(mockRedis.multi).toHaveBeenCalled();
    });
  });

  describe('getBudgetConfig', () => {
    it('should return cached config if available', async () => {
      const config = {
        accountId: 123,
        dailyTokenLimit: 100000,
        dailyCostLimitBrl: 50.0,
        economicModeThreshold: 0.8,
        enabled: true,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockRedis.get.mockResolvedValue(JSON.stringify(config));

      const result = await costTracker.getBudgetConfig(123);

      expect(result.accountId).toBe(123);
      expect(result.dailyTokenLimit).toBe(100000);
      expect(result.dailyCostLimitBrl).toBe(50.0);
    });

    it('should return default config and cache it', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockRedis.setex.mockResolvedValue('OK');

      const result = await costTracker.getBudgetConfig(123);

      expect(result.accountId).toBe(123);
      expect(result.dailyTokenLimit).toBe(100000);
      expect(result.dailyCostLimitBrl).toBe(50.0);
      expect(result.economicModeThreshold).toBe(0.8);
      expect(mockRedis.setex).toHaveBeenCalled();
    });
  });

  describe('getCostSummary', () => {
    it('should return cost summary for multiple days', async () => {
      // Mock the hmget calls for cost data (3 days)
      mockRedis.hmget
        .mockResolvedValueOnce(['1000', '5.0', '10'])  // Day 0 (today)
        .mockResolvedValueOnce(['0', '0', '0'])        // Day 0 budget check
        .mockResolvedValueOnce(['2000', '10.0', '20']) // Day 1 (yesterday)
        .mockResolvedValueOnce(['0', '0', '0'])        // Day 1 budget check
        .mockResolvedValueOnce(['500', '2.5', '5'])    // Day 2 (day before)
        .mockResolvedValueOnce(['0', '0', '0']);       // Day 2 budget check

      // Mock get calls for economic mode checks
      mockRedis.get.mockResolvedValue(null);

      const summary = await costTracker.getCostSummary(123, 3);

      expect(summary).toHaveLength(3);
      expect(summary[0].tokensUsed).toBe(1000); // Today
      expect(summary[0].costBrl).toBe(5.0);
      expect(summary[0].requestCount).toBe(10);
      expect(summary[1].tokensUsed).toBe(2000); // Yesterday
      expect(summary[2].tokensUsed).toBe(500);  // Day before
    });
  });
});