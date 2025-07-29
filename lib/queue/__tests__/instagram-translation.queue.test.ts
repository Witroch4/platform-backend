/**
 * Instagram Translation Queue Tests
 * 
 * Unit tests for Instagram translation queue infrastructure
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import {
  addInstagramTranslationTask,
  generateCorrelationId,
  validateCorrelationId,
  storeJobResult,
  getJobResult,
  waitForJobResult,
  cleanupJobResult,
  createErrorResult,
  createSuccessResult,
  InstagramTranslationErrorCodes,
  type InstagramTranslationJobData,
  type InstagramTranslationResult,
} from '../instagram-translation.queue';

// Mock Redis connection
jest.mock('../../redis', () => ({
  connection: {
    setex: jest.fn(),
    get: jest.fn(),
    del: jest.fn(),
    ping: jest.fn(),
  },
}));

// Mock BullMQ
jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => ({
    add: jest.fn(),
    getWaiting: jest.fn().mockResolvedValue([]),
    getActive: jest.fn().mockResolvedValue([]),
    getCompleted: jest.fn().mockResolvedValue([]),
    getFailed: jest.fn().mockResolvedValue([]),
    getDelayed: jest.fn().mockResolvedValue([]),
    clean: jest.fn(),
  })),
}));

describe('Instagram Translation Queue', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Correlation ID Management', () => {
    it('should generate valid correlation IDs', () => {
      const correlationId = generateCorrelationId();
      
      expect(correlationId).toMatch(/^ig-\d{13}-[0-9a-z]+-[0-9a-z]+$/);
      expect(validateCorrelationId(correlationId)).toBe(true);
    });

    it('should validate correlation ID format', () => {
      // Valid IDs
      expect(validateCorrelationId('ig-1234567890123-abc-def')).toBe(true);
      
      // Invalid IDs
      expect(validateCorrelationId('')).toBe(false);
      expect(validateCorrelationId('invalid')).toBe(false);
      expect(validateCorrelationId('ig-123-abc')).toBe(false); // Missing part
      expect(validateCorrelationId('wa-1234567890123-abc-def')).toBe(false); // Wrong prefix
      expect(validateCorrelationId('ig-123-abc-def')).toBe(false); // Invalid timestamp
    });

    it('should generate unique correlation IDs', () => {
      const ids = new Set();
      for (let i = 0; i < 100; i++) {
        ids.add(generateCorrelationId());
      }
      expect(ids.size).toBe(100);
    });
  });

  describe('Job Data Validation', () => {
    const validJobData: InstagramTranslationJobData = {
      intentName: 'test-intent',
      inboxId: 'inbox-123',
      contactPhone: '+1234567890',
      conversationId: 'conv-123',
      originalPayload: { test: 'data' },
      correlationId: generateCorrelationId(),
      metadata: {
        timestamp: new Date(),
        retryCount: 0,
      },
    };

    it('should accept valid job data', async () => {
      const mockQueue = {
        add: jest.fn().mockResolvedValue({ id: 'job-123' }),
      };
      
      // Mock the queue instance
      jest.doMock('../instagram-translation.queue', () => ({
        ...jest.requireActual('../instagram-translation.queue'),
        instagramTranslationQueue: mockQueue,
      }));

      await expect(addInstagramTranslationTask(validJobData)).resolves.toBeDefined();
    });

    it('should reject invalid job data', async () => {
      const invalidJobData = {
        ...validJobData,
        intentName: '', // Invalid: empty string
      };

      await expect(addInstagramTranslationTask(invalidJobData)).rejects.toThrow();
    });

    it('should add default metadata if not provided', async () => {
      const jobDataWithoutMetadata = {
        intentName: 'test-intent',
        inboxId: 'inbox-123',
        contactPhone: '+1234567890',
        conversationId: 'conv-123',
        originalPayload: { test: 'data' },
        correlationId: generateCorrelationId(),
      };

      const mockQueue = {
        add: jest.fn().mockResolvedValue({ id: 'job-123' }),
      };
      
      jest.doMock('../instagram-translation.queue', () => ({
        ...jest.requireActual('../instagram-translation.queue'),
        instagramTranslationQueue: mockQueue,
      }));

      await addInstagramTranslationTask(jobDataWithoutMetadata);
      
      expect(mockQueue.add).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          metadata: expect.objectContaining({
            timestamp: expect.any(Date),
            retryCount: 0,
          }),
        }),
        expect.any(Object)
      );
    });
  });

  describe('Result Storage and Retrieval', () => {
    const mockRedis = require('../../redis').connection;
    const correlationId = generateCorrelationId();
    
    const successResult: InstagramTranslationResult = {
      success: true,
      fulfillmentMessages: [{ test: 'message' }],
      processingTime: 1000,
      correlationId,
    };

    const errorResult: InstagramTranslationResult = {
      success: false,
      error: 'Test error',
      errorCode: InstagramTranslationErrorCodes.CONVERSION_FAILED,
      processingTime: 500,
      correlationId,
    };

    beforeEach(() => {
      mockRedis.setex.mockResolvedValue('OK');
      mockRedis.get.mockResolvedValue(null);
      mockRedis.del.mockResolvedValue(1);
    });

    it('should store job results', async () => {
      await storeJobResult(correlationId, successResult);
      
      expect(mockRedis.setex).toHaveBeenCalledWith(
        `instagram-translation-result:${correlationId}`,
        300, // TTL
        JSON.stringify(successResult)
      );
    });

    it('should retrieve stored job results', async () => {
      mockRedis.get.mockResolvedValue(JSON.stringify(successResult));
      
      const result = await getJobResult(correlationId);
      
      expect(result).toEqual(successResult);
      expect(mockRedis.get).toHaveBeenCalledWith(
        `instagram-translation-result:${correlationId}`
      );
    });

    it('should return null for non-existent results', async () => {
      mockRedis.get.mockResolvedValue(null);
      
      const result = await getJobResult(correlationId);
      
      expect(result).toBeNull();
    });

    it('should cleanup job results', async () => {
      await cleanupJobResult(correlationId);
      
      expect(mockRedis.del).toHaveBeenCalledWith(
        `instagram-translation-result:${correlationId}`
      );
    });

    it('should wait for job results with timeout', async () => {
      // Simulate result appearing after delay
      setTimeout(() => {
        mockRedis.get.mockResolvedValue(JSON.stringify(successResult));
      }, 50);

      const result = await waitForJobResult(correlationId, 200);
      
      expect(result).toEqual(successResult);
    }, 1000);

    it('should timeout when waiting for results', async () => {
      mockRedis.get.mockResolvedValue(null); // No result available
      
      const result = await waitForJobResult(correlationId, 100);
      
      expect(result).toBeNull();
    }, 1000);
  });

  describe('Result Creation Helpers', () => {
    const correlationId = generateCorrelationId();

    it('should create error results', () => {
      const error = createErrorResult(
        correlationId,
        'Test error',
        InstagramTranslationErrorCodes.TEMPLATE_NOT_FOUND,
        1000
      );

      expect(error).toEqual({
        success: false,
        error: 'Test error',
        errorCode: InstagramTranslationErrorCodes.TEMPLATE_NOT_FOUND,
        processingTime: 1000,
        correlationId,
      });
    });

    it('should create success results', () => {
      const fulfillmentMessages = [{ test: 'message' }];
      const metadata = { templateFound: true };
      
      const result = createSuccessResult(
        correlationId,
        fulfillmentMessages,
        1500,
        metadata
      );

      expect(result).toEqual({
        success: true,
        fulfillmentMessages,
        processingTime: 1500,
        correlationId,
        metadata,
      });
    });
  });

  describe('Queue Health', () => {
    it('should return queue health information', async () => {
      const mockQueue = require('../instagram-translation.queue').instagramTranslationQueue;
      
      mockQueue.getWaiting.mockResolvedValue([1, 2, 3]);
      mockQueue.getActive.mockResolvedValue([1]);
      mockQueue.getCompleted.mockResolvedValue([1, 2, 3, 4, 5]);
      mockQueue.getFailed.mockResolvedValue([1, 2]);
      mockQueue.getDelayed.mockResolvedValue([]);

      const { getQueueHealth } = await import('../instagram-translation.queue');
      const health = await getQueueHealth();

      expect(health).toEqual({
        name: 'instagram-translation',
        counts: {
          waiting: 3,
          active: 1,
          completed: 5,
          failed: 2,
          delayed: 0,
        },
        status: 'healthy',
        lastUpdated: expect.any(Date),
      });
    });

    it('should handle queue health errors', async () => {
      const mockQueue = require('../instagram-translation.queue').instagramTranslationQueue;
      
      mockQueue.getWaiting.mockRejectedValue(new Error('Redis connection failed'));

      const { getQueueHealth } = await import('../instagram-translation.queue');
      const health = await getQueueHealth();

      expect(health.status).toBe('error');
      expect(health.error).toBeDefined();
    });
  });

  describe('Job Cleanup', () => {
    it('should clean up old jobs', async () => {
      const mockQueue = require('../instagram-translation.queue').instagramTranslationQueue;
      
      mockQueue.clean.mockResolvedValue(10);

      const { cleanupOldJobs } = await import('../instagram-translation.queue');
      await cleanupOldJobs();

      expect(mockQueue.clean).toHaveBeenCalledTimes(2);
      expect(mockQueue.clean).toHaveBeenCalledWith(60 * 60 * 1000, 100, 'completed');
      expect(mockQueue.clean).toHaveBeenCalledWith(24 * 60 * 60 * 1000, 50, 'failed');
    });

    it('should handle cleanup errors gracefully', async () => {
      const mockQueue = require('../instagram-translation.queue').instagramTranslationQueue;
      
      mockQueue.clean.mockRejectedValue(new Error('Cleanup failed'));

      const { cleanupOldJobs } = await import('../instagram-translation.queue');
      
      // Should not throw
      await expect(cleanupOldJobs()).resolves.toBeUndefined();
    });
  });
});

describe('Error Codes', () => {
  it('should have all required error codes', () => {
    const expectedCodes = [
      'TEMPLATE_NOT_FOUND',
      'MESSAGE_TOO_LONG',
      'INVALID_CHANNEL',
      'DATABASE_ERROR',
      'CONVERSION_FAILED',
      'VALIDATION_ERROR',
      'TIMEOUT_ERROR',
      'UNKNOWN_ERROR',
    ];

    for (const code of expectedCodes) {
      expect(InstagramTranslationErrorCodes[code as keyof typeof InstagramTranslationErrorCodes]).toBeDefined();
    }
  });
});