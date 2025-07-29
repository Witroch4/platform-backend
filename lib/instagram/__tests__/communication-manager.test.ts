/**
 * Instagram Translation Communication Manager Tests
 * 
 * Unit tests for the communication manager
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { EventEmitter } from 'events';
import {
  InstagramTranslationCommunicationManager,
  getCommunicationManager,
  cleanupCommunicationManager,
  CHANNELS,
  type JobCompletedMessage,
  type JobFailedMessage,
  type JobProgressMessage,
  type WorkerHealthMessage,
} from '../communication-manager';
import { InstagramTranslationErrorCodes } from '../../queue/instagram-translation.queue';

// Mock Redis connection
const mockRedisConnection = {
  duplicate: jest.fn(),
  subscribe: jest.fn(),
  publish: jest.fn(),
  ping: jest.fn(),
  disconnect: jest.fn(),
  unsubscribe: jest.fn(),
  on: jest.fn(),
};

jest.mock('../../redis', () => ({
  connection: mockRedisConnection,
}));

describe('InstagramTranslationCommunicationManager', () => {
  let communicationManager: InstagramTranslationCommunicationManager;
  let mockSubscriber: any;
  let mockPublisher: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup mock Redis connections
    mockSubscriber = {
      on: jest.fn(),
      subscribe: jest.fn().mockResolvedValue(undefined),
      unsubscribe: jest.fn().mockResolvedValue(undefined),
      disconnect: jest.fn(),
    };
    
    mockPublisher = {
      publish: jest.fn().mockResolvedValue(1),
      ping: jest.fn().mockResolvedValue('PONG'),
      disconnect: jest.fn(),
    };

    mockRedisConnection.duplicate
      .mockReturnValueOnce(mockSubscriber)
      .mockReturnValueOnce(mockPublisher);

    communicationManager = new InstagramTranslationCommunicationManager();
  });

  afterEach(async () => {
    await communicationManager.cleanup();
  });

  describe('Initialization', () => {
    it('should setup subscriber and publisher connections', () => {
      expect(mockRedisConnection.duplicate).toHaveBeenCalledTimes(2);
      expect(mockSubscriber.on).toHaveBeenCalledWith('message', expect.any(Function));
      expect(mockSubscriber.on).toHaveBeenCalledWith('error', expect.any(Function));
    });

    it('should subscribe to all communication channels', async () => {
      // Wait for setup to complete
      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(mockSubscriber.subscribe).toHaveBeenCalledWith(
        CHANNELS.JOB_COMPLETED,
        CHANNELS.JOB_FAILED,
        CHANNELS.JOB_PROGRESS,
        CHANNELS.WORKER_HEALTH
      );
    });
  });

  describe('Message Publishing', () => {
    const correlationId = 'ig-1234567890123-abc-def';
    
    it('should publish job completion messages', async () => {
      const result = {
        success: true as const,
        fulfillmentMessages: [{ test: 'message' }],
        processingTime: 1000,
        correlationId,
      };

      await communicationManager.publishJobCompleted(correlationId, result);

      expect(mockPublisher.publish).toHaveBeenCalledWith(
        CHANNELS.JOB_COMPLETED,
        JSON.stringify({
          correlationId,
          success: true,
          result,
          timestamp: expect.any(Number),
        })
      );
    });

    it('should publish job failure messages', async () => {
      const error = 'Test error';
      const errorCode = InstagramTranslationErrorCodes.CONVERSION_FAILED;

      await communicationManager.publishJobFailed(correlationId, error, errorCode);

      expect(mockPublisher.publish).toHaveBeenCalledWith(
        CHANNELS.JOB_FAILED,
        JSON.stringify({
          correlationId,
          success: false,
          error,
          errorCode,
          timestamp: expect.any(Number),
        })
      );
    });

    it('should publish job progress messages', async () => {
      const progress = 50;
      const stage = 'Converting template';

      await communicationManager.publishJobProgress(correlationId, progress, stage);

      expect(mockPublisher.publish).toHaveBeenCalledWith(
        CHANNELS.JOB_PROGRESS,
        JSON.stringify({
          correlationId,
          progress,
          stage,
          timestamp: expect.any(Number),
        })
      );
    });

    it('should publish worker health messages', async () => {
      const workerId = 'worker-123';
      const status = 'healthy';
      const activeJobs = 5;

      await communicationManager.publishWorkerHealth(workerId, status, activeJobs);

      expect(mockPublisher.publish).toHaveBeenCalledWith(
        CHANNELS.WORKER_HEALTH,
        JSON.stringify({
          workerId,
          status,
          activeJobs,
          timestamp: expect.any(Number),
        })
      );
    });

    it('should validate correlation IDs before publishing', async () => {
      const invalidCorrelationId = 'invalid-id';
      const result = {
        success: true as const,
        fulfillmentMessages: [],
        processingTime: 1000,
        correlationId: invalidCorrelationId,
      };

      await expect(
        communicationManager.publishJobCompleted(invalidCorrelationId, result)
      ).rejects.toThrow('Invalid correlation ID');
    });

    it('should clamp progress values between 0-100', async () => {
      await communicationManager.publishJobProgress(correlationId, 150, 'test');
      
      const publishCall = mockPublisher.publish.mock.calls[0];
      const message = JSON.parse(publishCall[1]);
      expect(message.progress).toBe(100);

      await communicationManager.publishJobProgress(correlationId, -10, 'test');
      
      const publishCall2 = mockPublisher.publish.mock.calls[1];
      const message2 = JSON.parse(publishCall2[1]);
      expect(message2.progress).toBe(0);
    });
  });

  describe('Message Handling', () => {
    it('should handle job completion messages', (done) => {
      const correlationId = 'ig-1234567890123-abc-def';
      const message: JobCompletedMessage = {
        correlationId,
        success: true,
        result: {
          success: true,
          fulfillmentMessages: [],
          processingTime: 1000,
          correlationId,
        },
        timestamp: Date.now(),
      };

      communicationManager.on('job-completed', (receivedMessage) => {
        expect(receivedMessage).toEqual(message);
        done();
      });

      // Simulate message reception
      const messageHandler = mockSubscriber.on.mock.calls.find(
        call => call[0] === 'message'
      )[1];
      
      messageHandler(CHANNELS.JOB_COMPLETED, JSON.stringify(message));
    });

    it('should handle job failure messages', (done) => {
      const correlationId = 'ig-1234567890123-abc-def';
      const message: JobFailedMessage = {
        correlationId,
        success: false,
        error: 'Test error',
        errorCode: InstagramTranslationErrorCodes.CONVERSION_FAILED,
        timestamp: Date.now(),
      };

      communicationManager.on('job-failed', (receivedMessage) => {
        expect(receivedMessage).toEqual(message);
        done();
      });

      const messageHandler = mockSubscriber.on.mock.calls.find(
        call => call[0] === 'message'
      )[1];
      
      messageHandler(CHANNELS.JOB_FAILED, JSON.stringify(message));
    });

    it('should handle job progress messages', (done) => {
      const correlationId = 'ig-1234567890123-abc-def';
      const message: JobProgressMessage = {
        correlationId,
        progress: 75,
        stage: 'Finalizing conversion',
        timestamp: Date.now(),
      };

      communicationManager.on('job-progress', (receivedMessage) => {
        expect(receivedMessage).toEqual(message);
        done();
      });

      const messageHandler = mockSubscriber.on.mock.calls.find(
        call => call[0] === 'message'
      )[1];
      
      messageHandler(CHANNELS.JOB_PROGRESS, JSON.stringify(message));
    });

    it('should handle worker health messages', (done) => {
      const message: WorkerHealthMessage = {
        workerId: 'worker-123',
        status: 'busy',
        activeJobs: 3,
        timestamp: Date.now(),
      };

      communicationManager.on('worker-health', (receivedMessage) => {
        expect(receivedMessage).toEqual(message);
        done();
      });

      const messageHandler = mockSubscriber.on.mock.calls.find(
        call => call[0] === 'message'
      )[1];
      
      messageHandler(CHANNELS.WORKER_HEALTH, JSON.stringify(message));
    });

    it('should handle malformed messages gracefully', () => {
      const messageHandler = mockSubscriber.on.mock.calls.find(
        call => call[0] === 'message'
      )[1];
      
      // Should not throw
      expect(() => {
        messageHandler(CHANNELS.JOB_COMPLETED, 'invalid json');
      }).not.toThrow();
    });
  });

  describe('Job Completion Waiting', () => {
    const correlationId = 'ig-1234567890123-abc-def';

    it('should wait for job completion', async () => {
      const result = {
        success: true as const,
        fulfillmentMessages: [],
        processingTime: 1000,
        correlationId,
      };

      // Simulate job completion after delay
      setTimeout(() => {
        communicationManager.emit('job-completed', {
          correlationId,
          success: true,
          result,
          timestamp: Date.now(),
        });
      }, 50);

      const receivedResult = await communicationManager.waitForJobCompletion(correlationId, 200);
      expect(receivedResult).toEqual(result);
    });

    it('should wait for job failure', async () => {
      const error = 'Test error';
      const errorCode = InstagramTranslationErrorCodes.CONVERSION_FAILED;

      // Simulate job failure after delay
      setTimeout(() => {
        communicationManager.emit('job-failed', {
          correlationId,
          success: false,
          error,
          errorCode,
          timestamp: Date.now(),
        });
      }, 50);

      const result = await communicationManager.waitForJobCompletion(correlationId, 200);
      expect(result.success).toBe(false);
      expect(result.error).toBe(error);
      expect(result.errorCode).toBe(errorCode);
    });

    it('should timeout when waiting for completion', async () => {
      const result = await communicationManager.waitForJobCompletion(correlationId, 100);
      
      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(InstagramTranslationErrorCodes.TIMEOUT_ERROR);
    });

    it('should reject invalid correlation IDs', async () => {
      await expect(
        communicationManager.waitForJobCompletion('invalid-id', 100)
      ).rejects.toThrow('Invalid correlation ID');
    });
  });

  describe('Progress Listening', () => {
    const correlationId = 'ig-1234567890123-abc-def';

    it('should listen for job progress updates', (done) => {
      const cleanup = communicationManager.onJobProgress(correlationId, (progress, stage) => {
        expect(progress).toBe(50);
        expect(stage).toBe('Converting template');
        cleanup();
        done();
      });

      // Simulate progress update
      communicationManager.emit('job-progress', {
        correlationId,
        progress: 50,
        stage: 'Converting template',
        timestamp: Date.now(),
      });
    });

    it('should filter progress updates by correlation ID', (done) => {
      let callCount = 0;
      
      const cleanup = communicationManager.onJobProgress(correlationId, () => {
        callCount++;
      });

      // Emit progress for different correlation ID
      communicationManager.emit('job-progress', {
        correlationId: 'different-id',
        progress: 25,
        stage: 'test',
        timestamp: Date.now(),
      });

      // Emit progress for correct correlation ID
      communicationManager.emit('job-progress', {
        correlationId,
        progress: 75,
        stage: 'test',
        timestamp: Date.now(),
      });

      setTimeout(() => {
        expect(callCount).toBe(1);
        cleanup();
        done();
      }, 10);
    });
  });

  describe('Health Status', () => {
    it('should return health status', async () => {
      const health = await communicationManager.getHealthStatus();
      
      expect(health).toEqual({
        subscriber: expect.any(Boolean),
        publisher: true,
        activeListeners: expect.any(Number),
        channels: Object.values(CHANNELS),
      });
    });

    it('should handle publisher health check failure', async () => {
      mockPublisher.ping.mockRejectedValue(new Error('Connection failed'));
      
      const health = await communicationManager.getHealthStatus();
      
      expect(health.publisher).toBe(false);
    });
  });

  describe('Cleanup', () => {
    it('should cleanup connections and listeners', async () => {
      await communicationManager.cleanup();
      
      expect(mockSubscriber.unsubscribe).toHaveBeenCalled();
      expect(mockSubscriber.disconnect).toHaveBeenCalled();
      expect(mockPublisher.disconnect).toHaveBeenCalled();
    });
  });
});

describe('Singleton Communication Manager', () => {
  afterEach(async () => {
    await cleanupCommunicationManager();
  });

  it('should return the same instance', () => {
    const manager1 = getCommunicationManager();
    const manager2 = getCommunicationManager();
    
    expect(manager1).toBe(manager2);
  });

  it('should cleanup singleton instance', async () => {
    const manager = getCommunicationManager();
    await cleanupCommunicationManager();
    
    const newManager = getCommunicationManager();
    expect(newManager).not.toBe(manager);
  });
});