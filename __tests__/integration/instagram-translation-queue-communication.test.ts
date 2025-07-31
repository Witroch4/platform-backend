/**
 * Integration tests for Instagram translation queue and communication
 * Tests the complete flow from job creation to worker processing and result communication
 */

import { jest } from '@jest/globals';

// Create comprehensive mocks
const mockQueue = {
  add: jest.fn(),
  getJob: jest.fn(),
  getJobs: jest.fn().mockResolvedValue([]),
  close: jest.fn().mockResolvedValue(undefined),
};

const mockWorker = {
  on: jest.fn(),
  close: jest.fn().mockResolvedValue(undefined),
};

const mockJob = {
  id: 'test-job-id',
  data: {},
  attemptsMade: 1,
  opts: { attempts: 3 },
  timestamp: Date.now(),
  processedOn: Date.now(),
  finishedOn: Date.now() + 1000,
  returnvalue: undefined,
  failedReason: undefined,
  isCompleted: jest.fn(),
  isFailed: jest.fn(),
  isActive: jest.fn(),
  isWaiting: jest.fn(),
};

// Mock BullMQ
jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => mockQueue),
  Worker: jest.fn().mockImplementation(() => mockWorker),
  Job: jest.fn(),
}));

// Mock external dependencies
jest.mock('@/lib/redis', () => ({
  connection: {
    host: 'localhost',
    port: 6379,
    db: 15,
  },
}));

jest.mock('@/lib/prisma', () => ({
  prisma: {
    $connect: jest.fn().mockResolvedValue(undefined),
    $disconnect: jest.fn().mockResolvedValue(undefined),
  },
}));

// Mock database queries
const mockFindCompleteMessageMappingByIntent = jest.fn();
jest.mock('@/lib/dialogflow-database-queries', () => ({
  findCompleteMessageMappingByIntent: mockFindCompleteMessageMappingByIntent,
}));

// Mock Instagram payload builder
const mockCreateInstagramGenericTemplate = jest.fn();
const mockCreateInstagramButtonTemplate = jest.fn();
const mockCreateInstagramFallbackMessage = jest.fn();
const mockDetermineInstagramTemplateType = jest.fn();
const mockValidateInstagramTemplate = jest.fn();
jest.mock('@/lib/instagram/payload-builder', () => ({
  createInstagramGenericTemplate: mockCreateInstagramGenericTemplate,
  createInstagramButtonTemplate: mockCreateInstagramButtonTemplate,
  createInstagramFallbackMessage: mockCreateInstagramFallbackMessage,
  determineInstagramTemplateType: mockDetermineInstagramTemplateType,
  validateInstagramTemplate: mockValidateInstagramTemplate,
  convertWhatsAppButtonsToInstagram: jest.fn().mockReturnValue([]),
  convertEnhancedButtonsToInstagram: jest.fn().mockReturnValue([]),
}));

// Mock validation
const mockValidateJobData = jest.fn();
const mockValidateForInstagramConversion = jest.fn();
jest.mock('@/lib/validation/instagram-translation-validation', () => ({
  validateJobData: mockValidateJobData,
  validateForInstagramConversion: mockValidateForInstagramConversion,
  sanitizeErrorMessage: jest.fn((error) => error?.message || String(error)),
}));

// Mock error handling
const mockCreateTemplateNotFoundError = jest.fn();
const mockCreateDatabaseError = jest.fn();
const mockCreateValidationError = jest.fn();
const mockCreateConversionFailedError = jest.fn();
const mockCreateMessageTooLongError = jest.fn();
const mockIsRetryableError = jest.fn();
const mockLogError = jest.fn();
const mockAttemptRecovery = jest.fn();

jest.mock('@/lib/error-handling/instagram-translation-errors', () => ({
  createTemplateNotFoundError: mockCreateTemplateNotFoundError,
  createDatabaseError: mockCreateDatabaseError,
  createValidationError: mockCreateValidationError,
  createConversionFailedError: mockCreateConversionFailedError,
  createMessageTooLongError: mockCreateMessageTooLongError,
  isRetryableError: mockIsRetryableError,
  logError: mockLogError,
  attemptRecovery: mockAttemptRecovery,
  InstagramTranslationError: class InstagramTranslationError extends Error {
    constructor(message: string, public code: string, public retryable: boolean, public correlationId: string) {
      super(message);
    }
  },
}));

// Now import the modules
import { Queue, Worker, Job } from 'bullmq';
import {
  addInstagramTranslationJob,
  createInstagramTranslationJob,
  getInstagramTranslationResult,
  waitForInstagramTranslationResult,
  generateCorrelationId,
  INSTAGRAM_TRANSLATION_QUEUE_NAME,
  InstagramTranslationJobData,
  InstagramTranslationResult,
  logWithCorrelationId,
} from '@/lib/queue/instagram-translation.queue';
import { processInstagramTranslationTask } from '@/worker/WebhookWorkerTasks/instagram-translation.task';

describe('Instagram Translation Queue Communication Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Reset mock implementations
    mockQueue.add.mockResolvedValue({ id: 'test-job-id' });
    mockQueue.getJob.mockResolvedValue(mockJob);
    
    mockJob.isCompleted.mockResolvedValue(false);
    mockJob.isFailed.mockResolvedValue(false);
    mockJob.isActive.mockResolvedValue(false);
    mockJob.isWaiting.mockResolvedValue(true);
    mockJob.returnvalue = undefined;
    mockJob.failedReason = undefined;

    // Reset validation mocks
    mockValidateJobData.mockReturnValue({ valid: true, sanitizedData: {} });
    mockValidateForInstagramConversion.mockReturnValue({ valid: true, warnings: [] });
    mockValidateInstagramTemplate.mockReturnValue({ isValid: true, errors: [] });

    // Reset payload builder mocks
    mockCreateInstagramGenericTemplate.mockReturnValue([{
      custom_payload: { instagram: { test: 'generic-payload' } }
    }]);
    mockCreateInstagramButtonTemplate.mockReturnValue([{
      custom_payload: { instagram: { test: 'button-payload' } }
    }]);
    mockDetermineInstagramTemplateType.mockReturnValue('generic');

    // Reset error handling mocks
    mockIsRetryableError.mockReturnValue(false);
    mockAttemptRecovery.mockResolvedValue({ fallbackAction: 'none' });
  });

  afterEach(async () => {
    await mockQueue?.close();
    await mockWorker?.close();
  });

  describe('Instagram translation queue job creation with unique IDs', () => {
    it('should create job with unique correlation ID', async () => {
      // Arrange
      const correlationId = generateCorrelationId();
      const jobData = createInstagramTranslationJob({
        intentName: 'test.intent',
        inboxId: '4',
        contactPhone: '+5511999999999',
        conversationId: 'conv-123',
        originalPayload: { test: 'data' },
        correlationId,
      });

      // Mock no existing job
      mockQueue.getJob.mockResolvedValue(null);

      // Act
      const jobId = await addInstagramTranslationJob(jobData);

      // Assert
      expect(jobId).toBe('test-job-id');
      expect(mockQueue.add).toHaveBeenCalledWith(
        `instagram-translation-${correlationId}`,
        expect.objectContaining({
          correlationId,
          intentName: 'test.intent',
          inboxId: '4',
          contactPhone: '+5511999999999',
          conversationId: 'conv-123',
          originalPayload: { test: 'data' },
          metadata: expect.objectContaining({
            timestamp: expect.any(Date),
            retryCount: 0,
            queuedAt: expect.any(String),
          }),
        }),
        expect.objectContaining({
          jobId: correlationId,
          priority: 10,
          attempts: 3,
          backoff: expect.objectContaining({
            type: 'exponential',
            delay: 2000,
          }),
        })
      );
    });

    it('should prevent duplicate jobs with same correlation ID', async () => {
      // Arrange
      const correlationId = generateCorrelationId();
      const jobData = createInstagramTranslationJob({
        intentName: 'test.intent',
        inboxId: '4',
        contactPhone: '+5511999999999',
        conversationId: 'conv-123',
        originalPayload: { test: 'data' },
        correlationId,
      });

      // Mock existing job that's not completed or failed
      mockJob.isCompleted.mockResolvedValue(false);
      mockJob.isFailed.mockResolvedValue(false);
      
      // First call returns null (no existing job), second call returns existing job
      mockQueue.getJob
        .mockResolvedValueOnce(null)  // First call - no existing job
        .mockResolvedValue(mockJob);  // Second call - existing job

      // Act
      const jobId1 = await addInstagramTranslationJob(jobData);
      const jobId2 = await addInstagramTranslationJob(jobData);

      // Assert
      expect(jobId1).toBe(jobId2);
      expect(mockQueue.add).toHaveBeenCalledTimes(1);
    });

    it('should generate unique correlation IDs', () => {
      // Act
      const id1 = generateCorrelationId();
      const id2 = generateCorrelationId();
      const id3 = generateCorrelationId();

      // Assert
      expect(id1).not.toBe(id2);
      expect(id2).not.toBe(id3);
      expect(id1).not.toBe(id3);
      
      // Check format: ig-{timestamp}-{processId}-{random}
      expect(id1).toMatch(/^ig-\d+-[a-z0-9]+-[a-z0-9]+$/);
      expect(id2).toMatch(/^ig-\d+-[a-z0-9]+-[a-z0-9]+$/);
      expect(id3).toMatch(/^ig-\d+-[a-z0-9]+-[a-z0-9]+$/);
    });

    it('should validate job data before adding to queue', async () => {
      // Arrange
      const invalidJobData = {
        intentName: '', // Invalid: empty
        inboxId: '4',
        contactPhone: '+5511999999999',
        conversationId: 'conv-123',
        originalPayload: { test: 'data' },
        correlationId: '', // Invalid: empty
      } as InstagramTranslationJobData;

      // Act & Assert
      await expect(addInstagramTranslationJob(invalidJobData)).rejects.toThrow(
        'Failed to enqueue Instagram translation job: Missing required job data fields'
      );
      expect(mockQueue.add).not.toHaveBeenCalled();
    });
  });

  describe('Worker correctly publishes result after processing', () => {
    it('should process job and return success result', async () => {
      // Arrange
      const correlationId = generateCorrelationId();
      const jobData: InstagramTranslationJobData = {
        intentName: 'test.intent',
        inboxId: '4',
        contactPhone: '+5511999999999',
        conversationId: 'conv-123',
        originalPayload: { test: 'data' },
        correlationId,
      };

      const mockJobInstance = {
        ...mockJob,
        data: jobData,
        id: correlationId,
      };

      // Mock successful processing
      mockValidateJobData.mockReturnValue({ valid: true, sanitizedData: jobData });
      mockFindCompleteMessageMappingByIntent.mockResolvedValue({
        messageType: 'interactive',
        interactiveMessage: {
          texto: 'Test message',
          rodape: 'Test footer',
          botoes: [],
        },
      });

      // Act
      const result = await processInstagramTranslationTask(mockJobInstance as Job<InstagramTranslationJobData>);

      // Assert
      expect(result).toEqual(expect.objectContaining({
        success: true,
        fulfillmentMessages: expect.arrayContaining([
          expect.objectContaining({
            custom_payload: expect.objectContaining({
              instagram: expect.any(Object),
            }),
          }),
        ]),
        processingTime: expect.any(Number),
      }));
      expect(mockFindCompleteMessageMappingByIntent).toHaveBeenCalledWith('test.intent', '4');
    });

    it('should handle processing errors and return error result', async () => {
      // Arrange
      const correlationId = generateCorrelationId();
      const jobData: InstagramTranslationJobData = {
        intentName: 'nonexistent.intent',
        inboxId: '4',
        contactPhone: '+5511999999999',
        conversationId: 'conv-123',
        originalPayload: { test: 'data' },
        correlationId,
      };

      const mockJobInstance = {
        ...mockJob,
        data: jobData,
        id: correlationId,
        attemptsMade: 3,
        opts: { attempts: 3 },
      };

      // Mock template not found
      mockValidateJobData.mockReturnValue({ valid: true, sanitizedData: jobData });
      mockFindCompleteMessageMappingByIntent.mockResolvedValue(null);

      // Create a proper Instagram translation error
      const InstagramTranslationError = require('@/lib/error-handling/instagram-translation-errors').InstagramTranslationError;
      const mockError = new InstagramTranslationError('Template not found', 'TEMPLATE_NOT_FOUND', false, correlationId);
      mockCreateTemplateNotFoundError.mockReturnValue(mockError);

      // Act
      const result = await processInstagramTranslationTask(mockJobInstance as Job<InstagramTranslationJobData>);

      // Assert
      expect(result).toEqual(expect.objectContaining({
        success: false,
        error: expect.stringContaining('Template not found'),
        processingTime: expect.any(Number),
        metadata: expect.objectContaining({
          errorCode: 'TEMPLATE_NOT_FOUND',
          retryable: false,
        }),
      }));
    });
  });

  describe('Webhook "wait" logic correctly receives worker signals', () => {
    it('should wait for and receive successful result', async () => {
      // Arrange
      const correlationId = generateCorrelationId();
      const mockResult: InstagramTranslationResult = {
        success: true,
        fulfillmentMessages: [{ custom_payload: { instagram: { test: 'payload' } } }],
        processingTime: 200,
      };

      // Mock job completion
      mockJob.isCompleted.mockResolvedValue(true);
      mockJob.returnvalue = mockResult;
      mockQueue.getJob.mockResolvedValue(mockJob);

      // Act
      const result = await waitForInstagramTranslationResult(correlationId, 5000);

      // Assert
      expect(result).toEqual(mockResult);
      expect(mockQueue.getJob).toHaveBeenCalledWith(correlationId);
    });

    it('should wait for and receive failed result', async () => {
      // Arrange
      const correlationId = generateCorrelationId();
      
      // Mock job failure
      mockJob.isCompleted.mockResolvedValue(false);
      mockJob.isFailed.mockResolvedValue(true);
      mockJob.failedReason = 'Template not found';
      mockJob.attemptsMade = 3;
      mockJob.opts = { attempts: 3 };
      mockQueue.getJob.mockResolvedValue(mockJob);

      // Act
      const result = await waitForInstagramTranslationResult(correlationId, 5000);

      // Assert
      expect(result).toEqual(expect.objectContaining({
        success: false,
        error: expect.stringContaining('Template not found'),
        processingTime: expect.any(Number),
        metadata: expect.objectContaining({
          attemptsMade: 3,
          maxAttempts: 3,
          failedReason: 'Template not found',
        }),
      }));
    });

    it('should timeout if job takes too long', async () => {
      // Arrange
      const correlationId = generateCorrelationId();
      
      // Mock job that never completes
      mockJob.isCompleted.mockResolvedValue(false);
      mockJob.isFailed.mockResolvedValue(false);
      mockJob.isActive.mockResolvedValue(true);
      mockQueue.getJob.mockResolvedValue(mockJob);

      // Act
      const result = await waitForInstagramTranslationResult(correlationId, 100); // Short timeout

      // Assert
      expect(result).toEqual(expect.objectContaining({
        success: false,
        error: expect.stringContaining('Translation timeout'),
        metadata: expect.objectContaining({
          timedOut: true,
          timeoutMs: 100,
        }),
      }));
    });
  });  
describe('Error handling and retry mechanisms', () => {
    it('should retry failed jobs with exponential backoff', async () => {
      // Arrange
      const correlationId = generateCorrelationId();
      const jobData = createInstagramTranslationJob({
        intentName: 'test.intent',
        inboxId: '4',
        contactPhone: '+5511999999999',
        conversationId: 'conv-123',
        originalPayload: { test: 'data' },
        correlationId,
      });

      // Mock no existing job
      mockQueue.getJob.mockResolvedValue(null);

      // Act
      await addInstagramTranslationJob(jobData);

      // Assert - Check retry configuration
      expect(mockQueue.add).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({
          attempts: 3,
          backoff: expect.objectContaining({
            type: 'exponential',
            delay: 2000,
            settings: expect.objectContaining({
              multiplier: 2,
              maxDelay: 30000,
              jitter: true,
            }),
          }),
        })
      );
    });

    it('should handle queue errors gracefully', async () => {
      // Arrange
      const correlationId = generateCorrelationId();
      
      // Mock queue error
      mockQueue.getJob.mockRejectedValue(new Error('Redis connection failed'));

      // Act
      const result = await getInstagramTranslationResult(correlationId);

      // Assert
      expect(result).toEqual(expect.objectContaining({
        success: false,
        error: expect.stringContaining('Failed to retrieve job result'),
        processingTime: 0,
      }));
    });
  });

  describe('Correlation ID tracking throughout the flow', () => {
    it('should maintain correlation ID from job creation to completion', async () => {
      // Arrange
      const correlationId = generateCorrelationId();
      const jobData = createInstagramTranslationJob({
        intentName: 'test.intent',
        inboxId: '4',
        contactPhone: '+5511999999999',
        conversationId: 'conv-123',
        originalPayload: { test: 'data' },
        correlationId,
      });

      // Mock successful completion
      const mockResult: InstagramTranslationResult = {
        success: true,
        fulfillmentMessages: [{ custom_payload: { instagram: { test: 'payload' } } }],
        processingTime: 150,
      };

      mockQueue.getJob.mockResolvedValueOnce(null); // For addInstagramTranslationJob
      mockJob.isCompleted.mockResolvedValue(true);
      mockJob.returnvalue = mockResult;
      mockQueue.getJob.mockResolvedValue(mockJob); // For getInstagramTranslationResult

      // Act
      const jobId = await addInstagramTranslationJob(jobData);
      const result = await getInstagramTranslationResult(correlationId);

      // Assert
      expect(jobId).toBe('test-job-id');
      expect(result).toEqual(mockResult);
      expect(mockQueue.add).toHaveBeenCalledWith(
        expect.stringContaining(correlationId),
        expect.objectContaining({ correlationId }),
        expect.objectContaining({ jobId: correlationId })
      );
    });
  });
});