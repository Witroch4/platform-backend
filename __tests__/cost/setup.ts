import { jest } from '@jest/globals';

// Global test setup for cost system tests
beforeAll(async () => {
  // Set test environment variables
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/chatwit_test';
  process.env.REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379/1';
  
  // Mock external services that shouldn't be called in tests
  jest.mock('@/lib/mail', () => ({
    sendEmail: jest.fn().mockResolvedValue({ success: true }),
  }));
  
  jest.mock('@/lib/cost/budget-controls', () => ({
    sendBudgetAlert: jest.fn().mockResolvedValue(),
    applyBudgetControls: jest.fn().mockResolvedValue(),
    removeBudgetControls: jest.fn().mockResolvedValue(),
  }));
});

afterAll(async () => {
  // Clean up any global resources
  jest.restoreAllMocks();
});

// Helper function to wait for async operations
export const waitForAsync = (ms: number = 100) => 
  new Promise(resolve => setTimeout(resolve, ms));

// Helper to create test cost event data
export const createTestCostEvent = (overrides: any = {}) => ({
  ts: new Date().toISOString(),
  provider: 'OPENAI',
  product: 'gpt-4',
  unit: 'TOKENS_IN',
  units: 100,
  externalId: `test-${Date.now()}`,
  raw: {},
  ...overrides,
});

// Helper to create test budget data
export const createTestBudget = (overrides: any = {}) => ({
  name: 'Test Budget',
  period: 'monthly',
  limitUSD: 100.0,
  alertAt: 0.8,
  isActive: true,
  ...overrides,
});