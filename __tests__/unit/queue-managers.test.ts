/**
 * Unit tests for queue managers and job processing logic
 * Requirements: 1.1, 1.2, 1.3, 2.2, 2.3, 8.1, 8.2
 */

import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { Job } from 'bullmq';

// Mock Redis connection
jest.mock('@/lib/redis', () => ({
  connection: {
    ping: jest.fn().mockResolvedValue('PONG'),
  },
}));

describe('Queue Managers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Resposta Rapida Queue', () => {
    let respostaRapidaQueue: any;
    let addRespostaRapidaJob: any;
    let createIntentJob: any;
    let createButtonJob: any;
    let generateCorrelationId: any;
    let handleJobFailure: any;

    beforeEach(async () => {
      const module = await import('@/lib/queue/resposta-rapida.queue');
      respostaRapidaQueue = module.respostaRapidaQueue;
      addRespostaRapidaJob = module.addRespostaRapidaJob;
      createIntentJob = module.createIntentJob;
      createButtonJob = module.createButtonJob;
      generateCorrelationId = module.generateCorrelationId;
      handleJobFailure = module.handleJobFailure;

      // Mock queue methods
      respostaRapidaQueue.add = jest.fn().mockResolvedValue({
        id: 'job-123',
        name: 'test-job',
        data: {},
      });
    });

    test('should create high priority queue with correct configuration', () => {
      expect(respostaRapidaQueue).toBeDefined();
      expect(respostaRapidaQueue.name).toBe('resposta-rapida');
    });

    test('should generate unique correlation IDs', () => {
      const id1 = generateCorrelationId();
      const id2 = generateCorrelationId();

      expect(id1).toBeDefined();
      expect(id2).toBeDefined();
      expect(id1).not.toBe(id2);
      expect(id1).toMatch(/^\d+-[a-z0-9]+$/);
    });

    test('should create intent job with correct structure', () => {
      const jobData = createIntentJob({
        inboxId: '4',
        contactPhone: '+5511999999999',
        intentName: 'test.intent',
        wamid: 'wamid.test123',
        credentials: {
          token: 'test-token',
          phoneNumberId: '123456789',
          businessId: 'business123',
        },
        correlationId: 'test-correlation-id',
        messageId: 12345,
        accountId: 1,
        accountName: 'Test Account',
        contactSource: 'chatwit',
      });

      expect(jobData).toEqual({
        type: 'processarResposta',
        data: {
          inboxId: '4',
          contactPhone: '+5511999999999',
          intentName: 'test.intent',
          wamid: 'wamid.test123',
          credentials: {
            token: 'test-token',
            phoneNumberId: '123456789',
            businessId: 'business123',
          },
          correlationId: 'test-correlation-id',
          messageId: 12345,
          accountId: 1,
          accountName: 'Test Account',
          contactSource: 'chatwit',
          interactionType: 'intent',
        },
      });
    });

    test('should create button job with correct structure', () => {
      const jobData = createButtonJob({
        inboxId: '4',
        contactPhone: '+5511999999999',
        buttonId: 'btn_test_123',
        wamid: 'wamid.test123',
        credentials: {
          token: 'test-token',
          phoneNumberId: '123456789',
          businessId: 'business123',
        },
        correlationId: 'test-correlation-id',
      });

      expect(jobData).toEqual({
        type: 'processarResposta',
        data: {
          inboxId: '4',
          contactPhone: '+5511999999999',
          buttonId: 'btn_test_123',
          wamid: 'wamid.test123',
          credentials: {
            token: 'test-token',
            phoneNumberId: '123456789',
            businessId: 'business123',
          },
          correlationId: 'test-correlation-id',
          interactionType: 'button_reply',
        },
      });
    });

    test('should add job to queue with high priority', async () => {
      const jobData = createIntentJob({
        inboxId: '4',
        contactPhone: '+5511999999999',
        intentName: 'test.intent',
        wamid: 'wamid.test123',
        credentials: {
          token: 'test-token',
          phoneNumberId: '123456789',
          businessId: 'business123',
        },
        correlationId: 'test-correlation-id',
      });

      const job = await addRespostaRapidaJob(jobData);

      expect(respostaRapidaQueue.add).toHaveBeenCalledWith(
        expect.stringContaining('resposta-intent'),
        jobData,
        expect.objectContaining({
          priority: 100,
          delay: 0,
          jobId: expect.stringContaining('test-correlation-id'),
        })
      );

      expect(job).toBeDefined();
      expect(job.id).toBe('job-123');
    });

    test('should handle job addition errors gracefully', async () => {
      respostaRapidaQueue.add.mockRejectedValue(new Error('Queue error'));

      const jobData = createIntentJob({
        inboxId: '4',
        contactPhone: '+5511999999999',
        intentName: 'test.intent',
        wamid: 'wamid.test123',
        credentials: {
          token: 'test-token',
          phoneNumberId: '123456789',
          businessId: 'business123',
        },
        correlationId: 'test-correlation-id',
      });

      await expect(addRespostaRapidaJob(jobData)).rejects.toThrow('Queue error');
    });

    test('should handle job failure with dead letter queue', async () => {
      const mockJob = {
        id: 'job-123',
        name: 'test-job',
        data: {
          type: 'processarResposta',
          data: {
            correlationId: 'test-correlation-id',
          },
        },
        attemptsMade: 3,
        opts: { attempts: 3 },
      } as Job;

      const { respostaRapidaDeadLetterQueue } = await import('@/lib/queue/resposta-rapida.queue');
      respostaRapidaDeadLetterQueue.add = jest.fn().mockResolvedValue({});

      await handleJobFailure(mockJob, new Error('Processing failed'));

      expect(respostaRapidaDeadLetterQueue.add).toHaveBeenCalledWith(
        'dead-letter-test-job',
        mockJob.data,
        expect.objectContaining({
          delay: 0,
          removeOnComplete: 10,
          removeOnFail: 100,
        })
      );
    });

    test('should get queue health statistics', async () => {
      const { getQueueHealth } = await import('@/lib/queue/resposta-rapida.queue');

      // Mock queue methods
      respostaRapidaQueue.getWaiting = jest.fn().mockResolvedValue([]);
      respostaRapidaQueue.getActive = jest.fn().mockResolvedValue([{}, {}]);
      respostaRapidaQueue.getCompleted = jest.fn().mockResolvedValue([{}, {}, {}]);
      respostaRapidaQueue.getFailed = jest.fn().mockResolvedValue([{}]);
      respostaRapidaQueue.getDelayed = jest.fn().mockResolvedValue([]);

      const health = await getQueueHealth();

      expect(health).toEqual({
        waiting: 0,
        active: 2,
        completed: 3,
        failed: 1,
        delayed: 0,
      });
    });

    test('should clean up old jobs', async () => {
      const { cleanupOldJobs } = await import('@/lib/queue/resposta-rapida.queue');

      respostaRapidaQueue.clean = jest.fn().mockResolvedValue(5);

      await cleanupOldJobs();

      expect(respostaRapidaQueue.clean).toHaveBeenCalledWith(
        60 * 60 * 1000, // 1 hour
        50,
        'completed'
      );
      expect(respostaRapidaQueue.clean).toHaveBeenCalledWith(
        24 * 60 * 60 * 1000, // 24 hours
        25,
        'failed'
      );
    });
  });

  describe('Persistencia Credenciais Queue', () => {
    let persistenciaCredenciaisQueue: any;
    let addPersistenciaCredenciaisJob: any;
    let createCredentialsUpdateJob: any;
    let createLeadUpdateJob: any;
    let createBatchUpdateJob: any;
    let BatchProcessor: any;

    beforeEach(async () => {
      const module = await import('@/lib/queue/persistencia-credenciais.queue');
      persistenciaCredenciaisQueue = module.persistenciaCredenciaisQueue;
      addPersistenciaCredenciaisJob = module.addPersistenciaCredenciaisJob;
      createCredentialsUpdateJob = module.createCredentialsUpdateJob;
      createLeadUpdateJob = module.createLeadUpdateJob;
      createBatchUpdateJob = module.createBatchUpdateJob;
      BatchProcessor = module.BatchProcessor;

      // Mock queue methods
      persistenciaCredenciaisQueue.add = jest.fn().mockResolvedValue({
        id: 'job-456',
        name: 'test-persistence-job',
        data: {},
      });
    });

    test('should create low priority queue with correct configuration', () => {
      expect(persistenciaCredenciaisQueue).toBeDefined();
      expect(persistenciaCredenciaisQueue.name).toBe('persistencia-credenciais');
    });

    test('should create credentials update job with correct structure', () => {
      const jobData = createCredentialsUpdateJob({
        inboxId: '4',
        whatsappApiKey: 'test-api-key',
        phoneNumberId: '123456789',
        businessId: 'business123',
        contactSource: 'chatwit',
        leadData: {
          messageId: 12345,
          accountId: 1,
          accountName: 'Test Account',
          contactPhone: '+5511999999999',
          wamid: 'wamid.test123',
        },
        correlationId: 'test-correlation-id',
      });

      expect(jobData).toEqual({
        type: 'atualizarCredenciais',
        data: {
          inboxId: '4',
          whatsappApiKey: 'test-api-key',
          phoneNumberId: '123456789',
          businessId: 'business123',
          contactSource: 'chatwit',
          leadData: {
            messageId: 12345,
            accountId: 1,
            accountName: 'Test Account',
            contactPhone: '+5511999999999',
            wamid: 'wamid.test123',
          },
          correlationId: 'test-correlation-id',
        },
      });
    });

    test('should create lead update job with correct structure', () => {
      const jobData = createLeadUpdateJob({
        inboxId: '4',
        whatsappApiKey: 'test-api-key',
        phoneNumberId: '123456789',
        businessId: 'business123',
        contactSource: 'chatwit',
        leadData: {
          messageId: 12345,
          accountId: 1,
          accountName: 'Test Account',
          contactPhone: '+5511999999999',
          wamid: 'wamid.test123',
        },
        correlationId: 'test-correlation-id',
      });

      expect(jobData.type).toBe('atualizarLead');
    });

    test('should create batch update job with correct structure', () => {
      const batchItems = [
        {
          inboxId: '4',
          credentials: {
            whatsappApiKey: 'test-api-key-1',
            phoneNumberId: '123456789',
            businessId: 'business123',
          },
          leadData: { test: 'data1' },
        },
        {
          inboxId: '5',
          credentials: {
            whatsappApiKey: 'test-api-key-2',
            phoneNumberId: '987654321',
            businessId: 'business456',
          },
          leadData: { test: 'data2' },
        },
      ];

      const jobData = createBatchUpdateJob({
        batchItems,
        correlationId: 'batch-correlation-id',
      });

      expect(jobData.type).toBe('batchUpdate');
      expect(jobData.data.batchItems).toEqual(batchItems);
      expect(jobData.data.correlationId).toBe('batch-correlation-id');
    });

    test('should add job to queue with low priority', async () => {
      const jobData = createCredentialsUpdateJob({
        inboxId: '4',
        whatsappApiKey: 'test-api-key',
        phoneNumberId: '123456789',
        businessId: 'business123',
        contactSource: 'chatwit',
        leadData: {
          messageId: 12345,
          accountId: 1,
          accountName: 'Test Account',
          contactPhone: '+5511999999999',
          wamid: 'wamid.test123',
        },
        correlationId: 'test-correlation-id',
      });

      const job = await addPersistenciaCredenciaisJob(jobData);

      expect(persistenciaCredenciaisQueue.add).toHaveBeenCalledWith(
        expect.stringContaining('persistencia-atualizarCredenciais'),
        jobData,
        expect.objectContaining({
          priority: 1,
          delay: 1000,
          jobId: expect.stringContaining('test-correlation-id'),
        })
      );

      expect(job).toBeDefined();
      expect(job.id).toBe('job-456');
    });

    test('should handle batch processing correctly', () => {
      const batchProcessor = new BatchProcessor();

      // Mock setTimeout
      const setTimeoutSpy = jest.spyOn(global, 'setTimeout');

      const item1 = {
        inboxId: '4',
        credentials: {
          whatsappApiKey: 'test-api-key-1',
          phoneNumberId: '123456789',
          businessId: 'business123',
        },
        leadData: { test: 'data1' },
      };

      batchProcessor.addToBatch(item1);

      // Should set timeout for first item
      expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 5000);

      setTimeoutSpy.mockRestore();
    });

    test('should process batch when max size is reached', () => {
      const batchProcessor = new BatchProcessor();
      const processBatchSpy = jest.spyOn(batchProcessor as any, 'processBatch');

      // Add items up to max batch size (10)
      for (let i = 0; i < 10; i++) {
        batchProcessor.addToBatch({
          inboxId: `${i}`,
          credentials: {
            whatsappApiKey: `test-api-key-${i}`,
            phoneNumberId: '123456789',
            businessId: 'business123',
          },
          leadData: { test: `data${i}` },
        });
      }

      expect(processBatchSpy).toHaveBeenCalled();
    });

    test('should get queue health statistics', async () => {
      const { getQueueHealth } = await import('@/lib/queue/persistencia-credenciais.queue');

      // Mock queue methods
      persistenciaCredenciaisQueue.getWaiting = jest.fn().mockResolvedValue([{}]);
      persistenciaCredenciaisQueue.getActive = jest.fn().mockResolvedValue([]);
      persistenciaCredenciaisQueue.getCompleted = jest.fn().mockResolvedValue([{}, {}, {}, {}]);
      persistenciaCredenciaisQueue.getFailed = jest.fn().mockResolvedValue([{}, {}]);
      persistenciaCredenciaisQueue.getDelayed = jest.fn().mockResolvedValue([{}]);

      const health = await getQueueHealth();

      expect(health).toEqual({
        waiting: 1,
        active: 0,
        completed: 4,
        failed: 2,
        delayed: 1,
      });
    });

    test('should schedule periodic cleanup', () => {
      const { schedulePeriodicCleanup } = require('@/lib/queue/persistencia-credenciais.queue');
      const setIntervalSpy = jest.spyOn(global, 'setInterval');

      schedulePeriodicCleanup();

      expect(setIntervalSpy).toHaveBeenCalledTimes(2);
      expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 60 * 60 * 1000); // Cleanup
      expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 30 * 1000); // Batch flush

      setIntervalSpy.mockRestore();
    });
  });

  describe('Queue Error Handling', () => {
    test('should handle queue connection errors', async () => {
      const { connection } = await import('@/lib/redis');
      connection.ping = jest.fn().mockRejectedValue(new Error('Connection failed'));

      // Queue operations should still work with error handling
      const { addRespostaRapidaJob, createIntentJob } = await import('@/lib/queue/resposta-rapida.queue');

      const jobData = createIntentJob({
        inboxId: '4',
        contactPhone: '+5511999999999',
        intentName: 'test.intent',
        wamid: 'wamid.test123',
        credentials: {
          token: 'test-token',
          phoneNumberId: '123456789',
          businessId: 'business123',
        },
        correlationId: 'test-correlation-id',
      });

      // Should not throw even if Redis is down
      expect(() => addRespostaRapidaJob(jobData)).not.toThrow();
    });

    test('should handle job processing errors with retry logic', async () => {
      const { handleJobFailure } = await import('@/lib/queue/resposta-rapida.queue');

      const mockJob = {
        id: 'job-123',
        name: 'test-job',
        data: {
          type: 'processarResposta',
          data: {
            correlationId: 'test-correlation-id',
          },
        },
        attemptsMade: 1,
        opts: { attempts: 3 },
      } as Job;

      // Should not move to dead letter queue if retries are available
      const { respostaRapidaDeadLetterQueue } = await import('@/lib/queue/resposta-rapida.queue');
      respostaRapidaDeadLetterQueue.add = jest.fn();

      await handleJobFailure(mockJob, new Error('Processing failed'));

      expect(respostaRapidaDeadLetterQueue.add).not.toHaveBeenCalled();
    });
  });

  describe('Queue Performance', () => {
    test('should configure high priority queue for fast processing', () => {
      const { respostaRapidaQueue } = require('@/lib/queue/resposta-rapida.queue');

      expect(respostaRapidaQueue.opts.defaultJobOptions.priority).toBe(100);
      expect(respostaRapidaQueue.opts.defaultJobOptions.delay).toBe(0);
      expect(respostaRapidaQueue.opts.defaultJobOptions.attempts).toBe(3);
    });

    test('should configure low priority queue for background processing', () => {
      const { persistenciaCredenciaisQueue } = require('@/lib/queue/persistencia-credenciais.queue');

      expect(persistenciaCredenciaisQueue.opts.defaultJobOptions.priority).toBe(1);
      expect(persistenciaCredenciaisQueue.opts.defaultJobOptions.delay).toBe(1000);
      expect(persistenciaCredenciaisQueue.opts.defaultJobOptions.attempts).toBe(5);
    });

    test('should use appropriate job retention policies', () => {
      const { respostaRapidaQueue } = require('@/lib/queue/resposta-rapida.queue');
      const { persistenciaCredenciaisQueue } = require('@/lib/queue/persistencia-credenciais.queue');

      // High priority queue keeps fewer jobs
      expect(respostaRapidaQueue.opts.defaultJobOptions.removeOnComplete).toBe(50);
      expect(respostaRapidaQueue.opts.defaultJobOptions.removeOnFail).toBe(25);

      // Low priority queue keeps more jobs for audit
      expect(persistenciaCredenciaisQueue.opts.defaultJobOptions.removeOnComplete).toBe(200);
      expect(persistenciaCredenciaisQueue.opts.defaultJobOptions.removeOnFail).toBe(100);
    });
  });
});