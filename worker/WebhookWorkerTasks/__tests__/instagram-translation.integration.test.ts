/**
 * Instagram Translation Worker Integration Test
 * 
 * Integration test to verify the worker can be properly initialized
 * and processes jobs from the queue
 */

import { Worker } from 'bullmq';
import { connection } from '../../../lib/redis';
import { 
  INSTAGRAM_TRANSLATION_QUEUE_NAME,
  addInstagramTranslationTask,
  generateCorrelationId,
} from '../../../lib/queue/instagram-translation.queue';
import { processInstagramTranslationTask } from '../instagram-translation.task';

// Mock the database and converter for integration test
jest.mock('../../../lib/prisma', () => ({
  prisma: {
    mapeamentoIntencao: {
      findUnique: jest.fn().mockResolvedValue({
        template: {
          id: 'test-template',
          interactiveContent: {
            body: { text: 'Test message' },
            header: null,
            footer: null,
            actionReplyButton: { buttons: '[]' },
          },
        },
      }),
    },
  },
}));

jest.mock('../../../lib/instagram/message-converter', () => ({
  messageConverter: {
    convert: jest.fn().mockReturnValue({
      success: true,
      instagramTemplate: {
        type: 'generic',
        payload: {
          template_type: 'generic',
          elements: [{ title: 'Test message', buttons: [] }],
        },
      },
    }),
  },
}));

jest.mock('../../../lib/validation/instagram-translation-validation', () => ({
  validateChannelType: jest.fn().mockReturnValue(true),
  validateForInstagramConversion: jest.fn().mockReturnValue({
    valid: true,
    templateType: 'generic',
    errors: [],
    warnings: [],
  }),
}));

describe('Instagram Translation Worker Integration', () => {
  let worker: Worker;

  beforeAll(async () => {
    // Create worker instance
    worker = new Worker(
      INSTAGRAM_TRANSLATION_QUEUE_NAME,
      processInstagramTranslationTask,
      {
        connection: connection(),
        concurrency: 1,
        lockDuration: 5000,
      }
    );

    await worker.waitUntilReady();
  });

  afterAll(async () => {
    await worker.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    console.log = jest.fn();
    console.error = jest.fn();
  });

  it('should initialize worker successfully', async () => {
    expect(worker).toBeDefined();
    expect(worker.name).toBe(INSTAGRAM_TRANSLATION_QUEUE_NAME);
  });

  it('should process a job successfully', async () => {
    const correlationId = generateCorrelationId();
    const jobData = {
      correlationId,
      intentName: 'test.intent',
      inboxId: 'test-inbox',
      contactPhone: '5511999999999',
      conversationId: 'test-conversation',
      originalPayload: {
        originalDetectIntentRequest: {
          payload: {
            channel_type: 'Channel::Instagram',
          },
        },
      },
    };

    // Add job to queue
    const jobId = await addInstagramTranslationTask(jobData);
    expect(jobId).toBeDefined();

    // Wait a bit for job to be processed
    await new Promise(resolve => setTimeout(resolve, 100));

    // Verify the job was processed (mocks were called)
    const { validateChannelType } = require('../../../lib/validation/instagram-translation-validation');
    expect(validateChannelType).toHaveBeenCalled();
  }, 10000);

  it('should handle worker errors gracefully', async () => {
    // Mock an error in the validation
    const { validateChannelType } = require('../../../lib/validation/instagram-translation-validation');
    validateChannelType.mockImplementationOnce(() => {
      throw new Error('Test validation error');
    });

    const correlationId = generateCorrelationId();
    const jobData = {
      correlationId,
      intentName: 'test.intent',
      inboxId: 'test-inbox',
      contactPhone: '5511999999999',
      conversationId: 'test-conversation',
      originalPayload: {
        originalDetectIntentRequest: {
          payload: {
            channel_type: 'Channel::Instagram',
          },
        },
      },
    };

    // Add job to queue
    const jobId = await addInstagramTranslationTask(jobData);
    expect(jobId).toBeDefined();

    // Wait a bit for job to be processed
    await new Promise(resolve => setTimeout(resolve, 100));

    // The job should have failed but the worker should still be running
    expect(worker.isRunning()).toBe(true);
  }, 10000);
});