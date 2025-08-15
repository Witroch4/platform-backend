// Using global jest from jest.config.js
import { 
  checkAllBudgets,
  checkSpecificBudget,
  scheduleBudgetMonitoring,
  scheduleImmediateBudgetCheck,
  getBudgetMonitorStats
} from '@/lib/cost/budget-monitor';
import { CostBudget } from '@prisma/client';
import { sendBudgetAlert, applyBudgetControls, removeBudgetControls } from '@/lib/cost/budget-controls';

// Mock dependencies
jest.mock('@/lib/connections');
jest.mock('@/lib/cost/budget-controls');
jest.mock('bullmq');

const mockPrisma = {
  costBudget: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
  },
  costEvent: {
    aggregate: jest.fn(),
  },
};

const mockQueue = {
  add: jest.fn(),
  addBulk: jest.fn(),
  obliterate: jest.fn(),
  getWaiting: jest.fn(),
  getActive: jest.fn(),
  getCompleted: jest.fn(),
  getFailed: jest.fn(),
  getDelayed: jest.fn(),
  close: jest.fn(),
};

const mockWorker = {
  close: jest.fn(),
  waitUntilReady: jest.fn(),
  on: jest.fn(),
};

// Mock the connections and BullMQ
jest.mocked(require('@/lib/connections')).getPrismaInstance = jest.fn(() => mockPrisma);
jest.mocked(require('@/lib/connections')).getRedisInstance = jest.fn(() => ({}));
jest.mocked(require('bullmq')).Queue = jest.fn(() => mockQueue);
jest.mocked(require('bullmq')).Worker = jest.fn(() => mockWorker);

const mockSendBudgetAlert = sendBudgetAlert as jest.MockedFunction<typeof sendBudgetAlert>;
const mockApplyBudgetControls = applyBudgetControls as jest.MockedFunction<typeof applyBudgetControls>;
const mockRemoveBudgetControls = removeBudgetControls as jest.MockedFunction<typeof removeBudgetControls>;

describe('Budget Monitor', () => {
  const mockBudget: CostBudget = {
    id: 'budget-123',
    name: 'Test Budget',
    inboxId: 'inbox-456',
    userId: null,
    period: 'monthly',
    limitUSD: new Decimal(100),
    alertAt: new Decimal(0.8),
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Default mocks
    mockSendBudgetAlert.mockResolvedValue();
    mockApplyBudgetControls.mockResolvedValue();
    mockRemoveBudgetControls.mockResolvedValue();
    mockQueue.obliterate.mockResolvedValue();
    mockQueue.add.mockResolvedValue({} as any);
  });

  describe('scheduleBudgetMonitoring', () => {
    it('should schedule budget monitoring successfully', async () => {
      // Act
      const result = await scheduleBudgetMonitoring();

      // Assert
      expect(result.success).toBe(true);
      expect(mockQueue.obliterate).toHaveBeenCalledWith({ force: true });
      expect(mockQueue.add).toHaveBeenCalledWith(
        'check-all-budgets',
        { type: 'check-all-budgets' },
        {
          repeat: { pattern: '0 * * * *' },
          jobId: 'budget-monitor-hourly',
        }
      );
    });

    it('should handle scheduling errors', async () => {
      // Arrange
      mockQueue.add.mockRejectedValue(new Error('Queue error'));

      // Act
      const result = await scheduleBudgetMonitoring();

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBeInstanceOf(Error);
    });
  });

  describe('checkAllBudgets', () => {
    it('should check all active budgets successfully', async () => {
      // Arrange
      const budgets = [mockBudget];
      mockPrisma.costBudget.findMany.mockResolvedValue(budgets);
      
      // Mock spending calculation (50% of budget)
      mockPrisma.costEvent.aggregate.mockResolvedValue({
        _sum: { cost: new Decimal(50) },
      });

      // Act
      const result = await checkAllBudgets();

      // Assert
      expect(result.checked).toBe(1);
      expect(result.alerts).toBe(0); // 50% is below 80% threshold
      expect(result.blocked).toBe(0);
      expect(result.errors).toHaveLength(0);
      expect(mockPrisma.costBudget.findMany).toHaveBeenCalledWith({
        where: { isActive: true },
        orderBy: { createdAt: 'desc' },
      });
    });

    it('should send alert when budget reaches warning threshold', async () => {
      // Arrange
      const budgets = [mockBudget];
      mockPrisma.costBudget.findMany.mockResolvedValue(budgets);
      
      // Mock spending at 85% of budget (above 80% threshold)
      mockPrisma.costEvent.aggregate.mockResolvedValue({
        _sum: { cost: new Decimal(85) },
      });

      // Act
      const result = await checkAllBudgets();

      // Assert
      expect(result.alerts).toBe(1);
      expect(result.blocked).toBe(0);
      expect(mockSendBudgetAlert).toHaveBeenCalledWith(
        mockBudget,
        85,
        0.85,
        'WARNING'
      );
      expect(mockRemoveBudgetControls).toHaveBeenCalledWith(mockBudget);
    });

    it('should apply controls when budget is exceeded', async () => {
      // Arrange
      const budgets = [mockBudget];
      mockPrisma.costBudget.findMany.mockResolvedValue(budgets);
      
      // Mock spending at 120% of budget (exceeded)
      mockPrisma.costEvent.aggregate.mockResolvedValue({
        _sum: { cost: new Decimal(120) },
      });

      // Act
      const result = await checkAllBudgets();

      // Assert
      expect(result.alerts).toBe(1);
      expect(result.blocked).toBe(1);
      expect(mockApplyBudgetControls).toHaveBeenCalledWith(mockBudget);
      expect(mockSendBudgetAlert).toHaveBeenCalledWith(
        mockBudget,
        120,
        1.2,
        'EXCEEDED'
      );
    });

    it('should handle individual budget check errors', async () => {
      // Arrange
      const budgets = [mockBudget];
      mockPrisma.costBudget.findMany.mockResolvedValue(budgets);
      mockPrisma.costEvent.aggregate.mockRejectedValue(new Error('Database error'));

      // Act
      const result = await checkAllBudgets();

      // Assert
      expect(result.checked).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Database error');
    });

    it('should handle general errors', async () => {
      // Arrange
      mockPrisma.costBudget.findMany.mockRejectedValue(new Error('Connection error'));

      // Act
      const result = await checkAllBudgets();

      // Assert
      expect(result.checked).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Connection error');
    });
  });

  describe('checkSpecificBudget', () => {
    it('should check specific budget successfully', async () => {
      // Arrange
      mockPrisma.costBudget.findUnique.mockResolvedValue(mockBudget);
      mockPrisma.costEvent.aggregate.mockResolvedValue({
        _sum: { cost: new Decimal(50) },
      });

      // Act
      const result = await checkSpecificBudget('budget-123');

      // Assert
      expect(result.budgetId).toBe('budget-123');
      expect(result.status).toBe('OK');
      expect(result.currentSpending).toBe(50);
      expect(result.percentage).toBe(0.5);
      expect(result.alertSent).toBe(false);
      expect(result.controlsApplied).toBe(false);
    });

    it('should throw error for non-existent budget', async () => {
      // Arrange
      mockPrisma.costBudget.findUnique.mockResolvedValue(null);

      // Act & Assert
      await expect(checkSpecificBudget('non-existent')).rejects.toThrow(
        'Orçamento non-existent não encontrado ou inativo'
      );
    });
  });

  describe('spending calculation', () => {
    it('should calculate daily spending correctly', async () => {
      // Arrange
      const dailyBudget = { ...mockBudget, period: 'daily' };
      mockPrisma.costBudget.findUnique.mockResolvedValue(dailyBudget);
      mockPrisma.costEvent.aggregate.mockResolvedValue({
        _sum: { cost: new Decimal(25) },
      });

      // Act
      const result = await checkSpecificBudget('budget-123');

      // Assert
      expect(mockPrisma.costEvent.aggregate).toHaveBeenCalledWith({
        where: expect.objectContaining({
          ts: { gte: expect.any(Date) },
          status: 'PRICED',
          cost: { not: null },
          inboxId: 'inbox-456',
        }),
        _sum: { cost: true },
      });
    });

    it('should calculate weekly spending correctly', async () => {
      // Arrange
      const weeklyBudget = { ...mockBudget, period: 'weekly' };
      mockPrisma.costBudget.findUnique.mockResolvedValue(weeklyBudget);
      mockPrisma.costEvent.aggregate.mockResolvedValue({
        _sum: { cost: new Decimal(25) },
      });

      // Act
      await checkSpecificBudget('budget-123');

      // Assert
      expect(mockPrisma.costEvent.aggregate).toHaveBeenCalledWith({
        where: expect.objectContaining({
          ts: { gte: expect.any(Date) },
          status: 'PRICED',
          cost: { not: null },
          inboxId: 'inbox-456',
        }),
        _sum: { cost: true },
      });
    });

    it('should filter by userId when specified', async () => {
      // Arrange
      const userBudget = { ...mockBudget, inboxId: null, userId: 'user-789' };
      mockPrisma.costBudget.findUnique.mockResolvedValue(userBudget);
      mockPrisma.costEvent.aggregate.mockResolvedValue({
        _sum: { cost: new Decimal(25) },
      });

      // Act
      await checkSpecificBudget('budget-123');

      // Assert
      expect(mockPrisma.costEvent.aggregate).toHaveBeenCalledWith({
        where: expect.objectContaining({
          userId: 'user-789',
        }),
        _sum: { cost: true },
      });
    });
  });

  describe('scheduleImmediateBudgetCheck', () => {
    it('should schedule immediate budget check', async () => {
      // Act
      await scheduleImmediateBudgetCheck('budget-123');

      // Assert
      expect(mockQueue.add).toHaveBeenCalledWith(
        'check-specific-budget',
        {
          type: 'check-specific-budget',
          budgetId: 'budget-123',
        },
        { priority: 1 }
      );
    });
  });

  describe('getBudgetMonitorStats', () => {
    it('should return queue statistics', async () => {
      // Arrange
      mockQueue.getWaiting.mockResolvedValue([1, 2]);
      mockQueue.getActive.mockResolvedValue([1]);
      mockQueue.getCompleted.mockResolvedValue([1, 2, 3]);
      mockQueue.getFailed.mockResolvedValue([]);
      mockQueue.getDelayed.mockResolvedValue([1]);

      // Act
      const stats = await getBudgetMonitorStats();

      // Assert
      expect(stats).toEqual({
        waiting: 2,
        active: 1,
        completed: 3,
        failed: 0,
        delayed: 1,
      });
    });
  });
});

// Helper to create Decimal mock
class Decimal {
  constructor(private value: number) {}
  
  toString() {
    return this.value.toString();
  }
  
  valueOf() {
    return this.value;
  }
}

// Make Decimal available globally for the test
(global as any).Decimal = Decimal;