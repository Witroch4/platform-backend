import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import { createCostWorker, startCostWorker, stopCostWorker } from '../cost-worker';
import { createCostQueue } from '../queue-config';

// Mock dependencies for integration test
jest.mock('@/lib/connections', () => ({
  getPrismaInstance: jest.fn(() => ({
    costEvent: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    priceCard: {
      findFirst: jest.fn(),
    },
  })),
  getRedisInstance: jest.fn(() => ({
    incr: jest.fn(),
    setex: jest.fn(),
    get: jest.fn(),
    keys: jest.fn(() => []),
    del: jest.fn(),
    multi: jest.fn(() => ({
      hincrby: jest.fn().mockReturnThis(),
      hincrbyfloat: jest.fn().mockReturnThis(),
      expire: jest.fn().mockReturnThis(),
      exec: jest.fn(),
    })),
  })),
}));

jest.mock('@/lib/log', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
}));

describe('Cost Worker Integration', () => {
  it('should create cost worker without errors', () => {
    expect(() => {
      const worker = createCostWorker();
      expect(worker).toBeDefined();
    }).not.toThrow();
  });

  it('should create cost queue without errors', () => {
    expect(() => {
      const queue = createCostQueue();
      expect(queue).toBeDefined();
    }).not.toThrow();
  });
});