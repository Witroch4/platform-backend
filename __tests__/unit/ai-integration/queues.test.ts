/**
 * Queue Infrastructure Tests
 * Requirements: 7.1, 7.2, 7.3
 */

import { QUEUE_NAMES } from '../../../lib/ai-integration/queues/config';
import { AiMessageJobData, EmbeddingUpsertJobData } from '../../../lib/ai-integration/types/job-data';

// Mock BullMQ for testing
jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation((name, options) => ({
    name,
    options,
    add: jest.fn().mockResolvedValue({ id: 'mock-job-id' }),
    getJobCounts: jest.fn().mockResolvedValue({
      active: 0,
      completed: 0,
      delayed: 0,
      failed: 0,
      paused: 0,
      prioritized: 0,
      waiting: 0,
      'waiting-children': 0,
    }),
    pause: jest.fn().mockResolvedValue(undefined),
    resume: jest.fn().mockResolvedValue(undefined),
    close: jest.fn().mockResolvedValue(undefined),
  })),
  QueueEvents: jest.fn().mockImplementation((name, options) => ({
    name,
    options,
    on: jest.fn(),
    close: jest.fn().mockResolvedValue(undefined),
  })),
  Worker: jest.fn().mockImplementation((name, processor, options) => ({
    name,
    processor,
    options,
    on: jest.fn(),
    close: jest.fn().mockResolvedValue(undefined),
    isRunning: jest.fn().mockReturnValue(true),
  })),
}));

describe('Queue Infrastructure', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Queue Configuration', () => {
    it('should have correct queue names', () => {
      expect(QUEUE_NAMES.AI_INCOMING_MESSAGE).toBe('ai-incoming-message');
      expect(QUEUE_NAMES.AI_EMBEDDING_UPSERT).toBe('ai-embedding-upsert');
    });
  });

  describe('Job Data Types', () => {
    it('should validate AI message job data structure', () => {
      const jobData: AiMessageJobData = {
        accountId: 1,
        conversationId: 123,
        messageId: 'msg-456',
        text: 'Hello, I need help',
        contentAttributes: {},
        channel: 'whatsapp',
        traceId: 'trace-789',
        enqueuedAt: Date.now(),
        featureFlags: {
          intentsEnabled: true,
          dynamicLlmEnabled: true,
          interactiveMessagesEnabled: true,
          economicModeEnabled: false,
        },
      };

      expect(jobData.accountId).toBe(1);
      expect(jobData.channel).toBe('whatsapp');
      expect(jobData.featureFlags?.intentsEnabled).toBe(true);
    });

    it('should validate embedding upsert job data structure', () => {
      const jobData: EmbeddingUpsertJobData = {
        intentId: 'intent-123',
        intentName: 'track_order',
        description: 'Help users track their orders',
        text: 'track order delivery status',
        traceId: 'trace-embedding-456',
        accountId: 1,
        operation: 'create',
      };

      expect(jobData.intentId).toBe('intent-123');
      expect(jobData.operation).toBe('create');
      expect(jobData.accountId).toBe(1);
    });
  });

  describe('Queue Manager Integration', () => {
    it('should initialize queues without errors', async () => {
      const { initializeQueues } = await import('../../../lib/ai-integration/queues/manager');
      
      await expect(initializeQueues()).resolves.not.toThrow();
    });

    it('should add jobs to queues', async () => {
      const { initializeQueues, addAiMessageJob, addEmbeddingUpsertJob } = 
        await import('../../../lib/ai-integration/queues/manager');
      
      await initializeQueues();

      const aiJobData: AiMessageJobData = {
        accountId: 1,
        conversationId: 123,
        messageId: 'msg-456',
        text: 'Hello, I need help',
        contentAttributes: {},
        channel: 'whatsapp',
        traceId: 'trace-789',
        enqueuedAt: Date.now(),
        featureFlags: {
          intentsEnabled: true,
          dynamicLlmEnabled: true,
          interactiveMessagesEnabled: true,
          economicModeEnabled: false,
        },
      };

      const embeddingJobData: EmbeddingUpsertJobData = {
        intentId: 'intent-123',
        intentName: 'track_order',
        description: 'Help users track their orders',
        text: 'track order delivery status',
        traceId: 'trace-embedding-456',
        accountId: 1,
        operation: 'create',
      };

      const aiJobId = await addAiMessageJob(aiJobData, { traceId: aiJobData.traceId });
      const embeddingJobId = await addEmbeddingUpsertJob(embeddingJobData, { traceId: embeddingJobData.traceId });
      
      expect(aiJobId).toBe('mock-job-id');
      expect(embeddingJobId).toBe('mock-job-id');
    });
  });
});