/**
 * Property-Based Tests for KPI Calculations
 * 
 * Tests universal correctness properties for the Flow Analytics KPI Service
 * using fast-check for property-based testing with 100+ iterations per property.
 * 
 * @module __tests__/property/kpi-properties.test
 */

import fc from 'fast-check';
import { calculateExecutiveKPIs, buildWhereClause } from '@/lib/flow-analytics/kpi-service';
import type { DashboardFilters } from '@/lib/flow-analytics/kpi-service';

// Mock Prisma with a persistent mock instance
const mockPrisma = {
  flowSession: {
    count: jest.fn(),
    findMany: jest.fn(),
  },
};

jest.mock('@/lib/connections', () => ({
  getPrismaInstance: jest.fn(() => mockPrisma),
}));

/**
 * Helper to create mock session data for testing
 */
interface MockSession {
  id: string;
  status: 'COMPLETED' | 'ERROR' | 'ACTIVE' | 'WAITING_INPUT';
  createdAt: Date;
  completedAt: Date | null;
  executionLog: any[];
}

/**
 * Helper to setup Prisma mocks with generated session data
 */
function setupPrismaMocks(sessions: MockSession[]) {
  // Reset all mocks
  mockPrisma.flowSession.count.mockReset();
  mockPrisma.flowSession.findMany.mockReset();
  
  // Mock count queries
  mockPrisma.flowSession.count.mockImplementation(({ where }: any) => {
    if (!where || !where.status) {
      return Promise.resolve(sessions.length);
    }
    if (where.status === 'COMPLETED') {
      return Promise.resolve(sessions.filter(s => s.status === 'COMPLETED').length);
    }
    if (where.status === 'ERROR') {
      return Promise.resolve(sessions.filter(s => s.status === 'ERROR').length);
    }
    if (where.status === 'ACTIVE') {
      return Promise.resolve(sessions.filter(s => s.status === 'ACTIVE').length);
    }
    if (where.status === 'WAITING_INPUT') {
      return Promise.resolve(sessions.filter(s => s.status === 'WAITING_INPUT').length);
    }
    return Promise.resolve(0);
  });
  
  // Mock findMany query - ensure it returns an array
  mockPrisma.flowSession.findMany.mockResolvedValue([...sessions]);
}

describe('Feature: flow-admin-quality-dashboard, Property 1: KPI Calculation Accuracy', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  /**
   * **Validates: Requirements 1.2, 1.3, 1.6**
   * 
   * Property: Completion rate should equal (completed sessions / total sessions) * 100
   */
  it('completion rate should equal (completed / total) * 100', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            id: fc.string(),
            status: fc.constantFrom('COMPLETED', 'ERROR', 'ACTIVE', 'WAITING_INPUT'),
            createdAt: fc.date(),
            completedAt: fc.option(fc.date(), { nil: null }),
            executionLog: fc.constant([]),
          }),
          { minLength: 1, maxLength: 100 }
        ),
        async (sessions) => {
          setupPrismaMocks(sessions as MockSession[]);
          
          const total = sessions.length;
          const completed = sessions.filter(s => s.status === 'COMPLETED').length;
          const expectedRate = (completed / total) * 100;
          
          const kpis = await calculateExecutiveKPIs({});
          
          // Allow small floating point differences (2 decimal places)
          expect(kpis.completionRate).toBeCloseTo(expectedRate, 2);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 1.2, 1.3, 1.6**
   * 
   * Property: Abandonment rate should equal ((total - completed - error) / total) * 100
   */
  it('abandonment rate should equal ((total - completed - error) / total) * 100', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            id: fc.string(),
            status: fc.constantFrom('COMPLETED', 'ERROR', 'ACTIVE', 'WAITING_INPUT'),
            createdAt: fc.date(),
            completedAt: fc.option(fc.date(), { nil: null }),
            executionLog: fc.constant([]),
          }),
          { minLength: 1, maxLength: 100 }
        ),
        async (sessions) => {
          setupPrismaMocks(sessions as MockSession[]);
          
          const total = sessions.length;
          const completed = sessions.filter(s => s.status === 'COMPLETED').length;
          const error = sessions.filter(s => s.status === 'ERROR').length;
          const abandoned = total - completed - error;
          const expectedRate = (abandoned / total) * 100;
          
          const kpis = await calculateExecutiveKPIs({});
          
          expect(kpis.abandonmentRate).toBeCloseTo(expectedRate, 2);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 1.2, 1.3, 1.6**
   * 
   * Property: Error rate should equal (error sessions / total sessions) * 100
   */
  it('error rate should equal (error / total) * 100', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            id: fc.string(),
            status: fc.constantFrom('COMPLETED', 'ERROR', 'ACTIVE', 'WAITING_INPUT'),
            createdAt: fc.date(),
            completedAt: fc.option(fc.date(), { nil: null }),
            executionLog: fc.constant([]),
          }),
          { minLength: 1, maxLength: 100 }
        ),
        async (sessions) => {
          setupPrismaMocks(sessions as MockSession[]);
          
          const total = sessions.length;
          const error = sessions.filter(s => s.status === 'ERROR').length;
          const expectedRate = (error / total) * 100;
          
          const kpis = await calculateExecutiveKPIs({});
          
          expect(kpis.errorRate).toBeCloseTo(expectedRate, 2);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 1.2, 1.3, 1.6**
   * 
   * Property: Sum of completion, abandonment, and error rates should equal 100%
   */
  it('sum of completion, abandonment, and error rates should equal 100%', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            id: fc.string(),
            status: fc.constantFrom('COMPLETED', 'ERROR', 'ACTIVE', 'WAITING_INPUT'),
            createdAt: fc.date(),
            completedAt: fc.option(fc.date(), { nil: null }),
            executionLog: fc.constant([]),
          }),
          { minLength: 1, maxLength: 100 }
        ),
        async (sessions) => {
          setupPrismaMocks(sessions as MockSession[]);
          
          const kpis = await calculateExecutiveKPIs({});
          
          const sum = kpis.completionRate + kpis.abandonmentRate + kpis.errorRate;
          
          // Should sum to 100% (allow small floating point error)
          expect(sum).toBeCloseTo(100, 1);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 1.2**
   * 
   * Property: Total executions should equal the number of sessions
   */
  it('total executions should equal session count', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            id: fc.string(),
            status: fc.constantFrom('COMPLETED', 'ERROR', 'ACTIVE', 'WAITING_INPUT'),
            createdAt: fc.date(),
            completedAt: fc.option(fc.date(), { nil: null }),
            executionLog: fc.constant([]),
          }),
          { minLength: 1, maxLength: 100 }
        ),
        async (sessions) => {
          setupPrismaMocks(sessions as MockSession[]);
          
          const kpis = await calculateExecutiveKPIs({});
          
          expect(kpis.totalExecutions).toBe(sessions.length);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 1.2, 1.3, 1.6**
   * 
   * Property: All rate metrics should be between 0 and 100 inclusive
   */
  it('all rate metrics should be between 0 and 100', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            id: fc.string(),
            status: fc.constantFrom('COMPLETED', 'ERROR', 'ACTIVE', 'WAITING_INPUT'),
            createdAt: fc.date(),
            completedAt: fc.option(fc.date(), { nil: null }),
            executionLog: fc.constant([]),
          }),
          { minLength: 1, maxLength: 100 }
        ),
        async (sessions) => {
          setupPrismaMocks(sessions as MockSession[]);
          
          const kpis = await calculateExecutiveKPIs({});
          
          expect(kpis.completionRate).toBeGreaterThanOrEqual(0);
          expect(kpis.completionRate).toBeLessThanOrEqual(100);
          
          expect(kpis.abandonmentRate).toBeGreaterThanOrEqual(0);
          expect(kpis.abandonmentRate).toBeLessThanOrEqual(100);
          
          expect(kpis.errorRate).toBeGreaterThanOrEqual(0);
          expect(kpis.errorRate).toBeLessThanOrEqual(100);
          
          expect(kpis.startToEndRate).toBeGreaterThanOrEqual(0);
          expect(kpis.startToEndRate).toBeLessThanOrEqual(100);
          
          expect(kpis.startToFirstInteractionRate).toBeGreaterThanOrEqual(0);
          expect(kpis.startToFirstInteractionRate).toBeLessThanOrEqual(100);
          
          expect(kpis.avgClickThroughRate).toBeGreaterThanOrEqual(0);
          expect(kpis.avgClickThroughRate).toBeLessThanOrEqual(100);
          
          expect(kpis.avgResponseRateAfterDelay).toBeGreaterThanOrEqual(0);
          expect(kpis.avgResponseRateAfterDelay).toBeLessThanOrEqual(100);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 1.2, 1.3, 1.6**
   * 
   * Property: Empty dataset should return all zeros
   */
  it('empty dataset should return all zeros', async () => {
    setupPrismaMocks([]);
    
    const kpis = await calculateExecutiveKPIs({});
    
    expect(kpis.totalExecutions).toBe(0);
    expect(kpis.completionRate).toBe(0);
    expect(kpis.abandonmentRate).toBe(0);
    expect(kpis.errorRate).toBe(0);
    expect(kpis.avgTimeToCompletion).toBe(0);
    expect(kpis.avgTimeToAbandonment).toBe(0);
    expect(kpis.startToEndRate).toBe(0);
    expect(kpis.startToFirstInteractionRate).toBe(0);
    expect(kpis.avgClickThroughRate).toBe(0);
    expect(kpis.avgResponseRateAfterDelay).toBe(0);
  });

  /**
   * **Validates: Requirements 1.2, 1.3**
   * 
   * Property: 100% completion rate when all sessions are completed
   */
  it('should return 100% completion rate when all sessions completed', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            id: fc.string(),
            status: fc.constant('COMPLETED'),
            createdAt: fc.date(),
            completedAt: fc.date(),
            executionLog: fc.constant([]),
          }),
          { minLength: 1, maxLength: 100 }
        ),
        async (sessions) => {
          setupPrismaMocks(sessions as MockSession[]);
          
          const kpis = await calculateExecutiveKPIs({});
          
          expect(kpis.completionRate).toBeCloseTo(100, 2);
          expect(kpis.abandonmentRate).toBeCloseTo(0, 2);
          expect(kpis.errorRate).toBeCloseTo(0, 2);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 1.6**
   * 
   * Property: 100% error rate when all sessions have errors
   */
  it('should return 100% error rate when all sessions have errors', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            id: fc.string(),
            status: fc.constant('ERROR'),
            createdAt: fc.date(),
            completedAt: fc.option(fc.date(), { nil: null }),
            executionLog: fc.constant([]),
          }),
          { minLength: 1, maxLength: 100 }
        ),
        async (sessions) => {
          setupPrismaMocks(sessions as MockSession[]);
          
          const kpis = await calculateExecutiveKPIs({});
          
          expect(kpis.errorRate).toBeCloseTo(100, 2);
          expect(kpis.completionRate).toBeCloseTo(0, 2);
          expect(kpis.abandonmentRate).toBeCloseTo(0, 2);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 1.3**
   * 
   * Property: 100% abandonment rate when all sessions are abandoned (ACTIVE or WAITING_INPUT)
   */
  it('should return 100% abandonment rate when all sessions abandoned', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            id: fc.string(),
            status: fc.constantFrom('ACTIVE', 'WAITING_INPUT'),
            createdAt: fc.date(),
            completedAt: fc.constant(null),
            executionLog: fc.constant([]),
          }),
          { minLength: 1, maxLength: 100 }
        ),
        async (sessions) => {
          setupPrismaMocks(sessions as MockSession[]);
          
          const kpis = await calculateExecutiveKPIs({});
          
          expect(kpis.abandonmentRate).toBeCloseTo(100, 2);
          expect(kpis.completionRate).toBeCloseTo(0, 2);
          expect(kpis.errorRate).toBeCloseTo(0, 2);
        }
      ),
      { numRuns: 100 }
    );
  });
});
