import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { processCostEvent, calculateCost, isEventAlreadyProcessed } from '../cost-worker';
import { Provider, Unit } from '@prisma/client';
import type { CostEventData } from '../cost-worker';

// Mock dependencies
jest.mock('@/lib/connections');
jest.mock('../pricing-service');
jest.mock('../idempotency-service');
jest.mock('@/lib/log');

describe('Cost Worker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('calculateCost', () => {
    it('should calculate cost for token units correctly', () => {
      const cost = calculateCost(1000000, 0.002, 'TOKENS_IN' as Unit);
      expect(cost).toBe(0.002); // 1M tokens * 0.002 / 1M = 0.002
    });

    it('should calculate cost for non-token units correctly', () => {
      const cost = calculateCost(5, 0.1, 'WHATSAPP_TEMPLATE' as Unit);
      expect(cost).toBe(0.5); // 5 * 0.1 = 0.5
    });
  });

  describe('processCostEvent', () => {
    const mockEventData: CostEventData = {
      ts: new Date().toISOString(),
      provider: 'OPENAI',
      product: 'gpt-4o-mini',
      unit: 'TOKENS_IN',
      units: 1000,
      externalId: 'test-123',
      traceId: 'trace-123',
      sessionId: 'session-123',
      inboxId: 'inbox-123',
      userId: 'user-123',
      intent: 'test-intent',
      raw: { test: 'data' },
    };

    it('should validate required fields', async () => {
      const invalidEventData = {
        ...mockEventData,
        provider: '',
      };

      await expect(processCostEvent(invalidEventData)).rejects.toThrow('Dados de evento incompletos');
    });

    it('should validate units field', async () => {
      const invalidEventData = {
        ...mockEventData,
        units: -1,
      };

      await expect(processCostEvent(invalidEventData)).rejects.toThrow('Unidades inválidas');
    });
  });
});