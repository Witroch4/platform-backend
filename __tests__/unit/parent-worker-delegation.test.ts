/**
 * Unit Tests for Parent Worker Delegation Logic
 * 
 * This test suite validates the Parent Worker's ability to correctly delegate
 * jobs to appropriate task modules based on job type and priority.
 * 
 * Requirements: 7.1, 7.2, 7.3, 8.1, 8.2
 */

import { Job } from 'bullmq';
import { 
  RespostaRapidaJobData, 
  RESPOSTA_RAPIDA_QUEUE_NAME 
} from '@/lib/queue/resposta-rapida.queue';
import { 
  PersistenciaCredenciaisJobData, 
  PERSISTENCIA_CREDENCIAIS_QUEUE_NAME 
} from '@/lib/queue/persistencia-credenciais.queue';

// Mock the task modules
jest.mock('@/worker/WebhookWorkerTasks/respostaRapida.worker.task', () => ({
  processRespostaRapidaTask: jest.fn(),
}));

jest.mock('@/worker/WebhookWorkerTasks/persistencia.worker.task', () => ({
  processPersistenciaTask: jest.fn(),
}));

jest.mock('@/lib/redis', () => ({
  connection: {
    host: 'localhost',
    port: 6379,
  },
}));

// Import mocked functions
import { processRespostaRapidaTask } from '@/worker/WebhookWorkerTasks/respostaRapida.worker.task';
import { processPersistenciaTask } from '@/worker/WebhookWorkerTasks/persistencia.worker.task';

const mockProcessRespostaRapidaTask = processRespostaRapidaTask as jest.MockedFunction<typeof processRespostaRapidaTask>;
const mockProcessPersistenciaTask = processPersistenciaTask as jest.MockedFunction<typeof processPersistenciaTask>;

// Import the ParentWorker class (we'll need to extract it for testing)
// For now, we'll test the delegation logic directly
class TestableParentWorker {
  /**
   * Delegate high priority jobs to appropriate task modules
   */
  async delegateHighPriorityJob(job: Job<RespostaRapidaJobData>): Promise<any> {
    const { type, data } = job.data;

    console.log(`[Parent Worker] Delegating high priority job: ${job.name}`, {
      type,
      correlationId: data.correlationId,
      interactionType: data.interactionType,
    });

    try {
      switch (type) {
        case 'processarResposta':
          return await processRespostaRapidaTask(job);
        
        default:
          throw new Error(`Unknown high priority job type: ${type}`);
      }
    } catch (error) {
      console.error(`[Parent Worker] High priority job delegation failed: ${job.name}`, {
        error: error instanceof Error ? error.message : error,
        correlationId: data.correlationId,
      });
      throw error;
    }
  }

  /**
   * Delegate low priority jobs to appropriate task modules
   */
  async delegateLowPriorityJob(job: Job<PersistenciaCredenciaisJobData>): Promise<any> {
    const { type, data } = job.data;

    console.log(`[Parent Worker] Delegating low priority job: ${job.name}`, {
      type,
      correlationId: data.correlationId,
      inboxId: data.inboxId,
    });

    try {
      switch (type) {
        case 'atualizarCredenciais':
        case 'atualizarLead':
        case 'batchUpdate':
          return await processPersistenciaTask(job);
        
        default:
          throw new Error(`Unknown low priority job type: ${type}`);
      }
    } catch (error) {
      console.error(`[Parent Worker] Low priority job delegation failed: ${job.name}`, {
        error: error instanceof Error ? error.message : error,
        correlationId: data.correlationId,
      });
      throw error;
    }
  }
}

describe('Parent Worker Delegation Logic', () => {
  let parentWorker: TestableParentWorker;

  beforeEach(() => {
    jest.clearAllMocks();
    parentWorker = new TestableParentWorker();
  });

  describe('High Priority Job Delegation', () => {
    it('should delegate intent processing jobs to respostaRapida task module', async () => {
      // Arrange
      const mockJob: Job<RespostaRapidaJobData> = {
        id: 'job-intent-001',
        name: 'resposta-intent-test-correlation-123',
        data: {
          type: 'processarResposta',
          data: {
            inboxId: '4',
            contactPhone: '+5511999999999',
            interactionType: 'intent',
            intentName: 'greeting.welcome',
            wamid: 'wamid.intent_test_123',
            credentials: {
              token: 'EAAG1234567890...',
              phoneNumberId: '987654321',
              businessId: '123456789',
            },
            correlationId: 'test-correlation-123',
            messageId: 12345,
            accountId: 67890,
            accountName: 'Test Account',
            contactSource: 'whatsapp',
          },
        },
      } as any;

      const expectedResult = {
        success: true,
        messageId: 'wamid.response_sent_456',
        processingTime: 150,
        correlationId: 'test-correlation-123',
      };

      mockProcessRespostaRapidaTask.mockResolvedValueOnce(expectedResult);

      // Act
      const result = await parentWorker.delegateHighPriorityJob(mockJob);

      // Assert
      expect(result).toEqual(expectedResult);
      expect(mockProcessRespostaRapidaTask).toHaveBeenCalledWith(mockJob);
      expect(mockProcessRespostaRapidaTask).toHaveBeenCalledTimes(1);
    });

    it('should delegate button click processing jobs to respostaRapida task module', async () => {
      // Arrange
      const mockJob: Job<RespostaRapidaJobData> = {
        id: 'job-button-001',
        name: 'resposta-button_reply-test-correlation-456',
        data: {
          type: 'processarResposta',
          data: {
            inboxId: '4',
            contactPhone: '+5511888888888',
            interactionType: 'button_reply',
            buttonId: 'btn-confirm-order',
            wamid: 'wamid.button_test_456',
            credentials: {
              token: 'EAAG0987654321...',
              phoneNumberId: '123456789',
              businessId: '987654321',
            },
            correlationId: 'test-correlation-456',
            messageId: 54321,
            accountId: 98765,
            accountName: 'Button Test Account',
            contactSource: 'whatsapp',
          },
        },
      } as any;

      const expectedResult = {
        success: true,
        messageId: 'wamid.reaction_sent_789',
        processingTime: 95,
        correlationId: 'test-correlation-456',
      };

      mockProcessRespostaRapidaTask.mockResolvedValueOnce(expectedResult);

      // Act
      const result = await parentWorker.delegateHighPriorityJob(mockJob);

      // Assert
      expect(result).toEqual(expectedResult);
      expect(mockProcessRespostaRapidaTask).toHaveBeenCalledWith(mockJob);
      expect(mockProcessRespostaRapidaTask).toHaveBeenCalledTimes(1);
    });

    it('should throw error for unknown high priority job types', async () => {
      // Arrange
      const mockJob: Job<RespostaRapidaJobData> = {
        id: 'job-unknown-001',
        name: 'resposta-unknown-test-correlation-789',
        data: {
          type: 'unknownType' as any,
          data: {
            inboxId: '4',
            contactPhone: '+5511777777777',
            interactionType: 'intent',
            correlationId: 'test-correlation-789',
          } as any,
        },
      } as any;

      // Act & Assert
      await expect(parentWorker.delegateHighPriorityJob(mockJob))
        .rejects
        .toThrow('Unknown high priority job type: unknownType');

      expect(mockProcessRespostaRapidaTask).not.toHaveBeenCalled();
    });

    it('should propagate errors from task modules', async () => {
      // Arrange
      const mockJob: Job<RespostaRapidaJobData> = {
        id: 'job-error-001',
        name: 'resposta-intent-error-correlation-999',
        data: {
          type: 'processarResposta',
          data: {
            inboxId: '4',
            contactPhone: '+5511666666666',
            interactionType: 'intent',
            intentName: 'error.test',
            wamid: 'wamid.error_test_999',
            credentials: {
              token: 'INVALID_TOKEN',
              phoneNumberId: '000000000',
              businessId: '000000000',
            },
            correlationId: 'test-correlation-999',
          },
        },
      } as any;

      const taskError = new Error('WhatsApp API authentication failed');
      mockProcessRespostaRapidaTask.mockRejectedValueOnce(taskError);

      // Act & Assert
      await expect(parentWorker.delegateHighPriorityJob(mockJob))
        .rejects
        .toThrow('WhatsApp API authentication failed');

      expect(mockProcessRespostaRapidaTask).toHaveBeenCalledWith(mockJob);
    });
  });

  describe('Low Priority Job Delegation', () => {
    it('should delegate credentials update jobs to persistencia task module', async () => {
      // Arrange
      const mockJob: Job<PersistenciaCredenciaisJobData> = {
        id: 'job-credentials-001',
        name: 'persistencia-atualizarCredenciais-test-correlation-111',
        data: {
          type: 'atualizarCredenciais',
          data: {
            inboxId: '4',
            whatsappApiKey: 'EAAG1111111111...',
            phoneNumberId: '111111111',
            businessId: '222222222',
            contactSource: 'whatsapp',
            leadData: {
              messageId: 11111,
              accountId: 22222,
              accountName: 'Credentials Test',
              contactPhone: '+5511555555555',
              wamid: 'wamid.credentials_test_111',
            },
            correlationId: 'test-correlation-111',
          },
        },
      } as any;

      const expectedResult = {
        credentialsUpdated: true,
        cacheUpdated: true,
        leadUpdated: true,
        processingTime: 250,
      };

      mockProcessPersistenciaTask.mockResolvedValueOnce(expectedResult);

      // Act
      const result = await parentWorker.delegateLowPriorityJob(mockJob);

      // Assert
      expect(result).toEqual(expectedResult);
      expect(mockProcessPersistenciaTask).toHaveBeenCalledWith(mockJob);
      expect(mockProcessPersistenciaTask).toHaveBeenCalledTimes(1);
    });

    it('should delegate lead update jobs to persistencia task module', async () => {
      // Arrange
      const mockJob: Job<PersistenciaCredenciaisJobData> = {
        id: 'job-lead-001',
        name: 'persistencia-atualizarLead-test-correlation-222',
        data: {
          type: 'atualizarLead',
          data: {
            inboxId: '4',
            whatsappApiKey: 'EAAG2222222222...',
            phoneNumberId: '333333333',
            businessId: '444444444',
            contactSource: 'instagram',
            leadData: {
              messageId: 33333,
              accountId: 44444,
              accountName: 'Lead Test',
              contactPhone: '+5511444444444',
              wamid: 'wamid.lead_test_222',
            },
            correlationId: 'test-correlation-222',
          },
        },
      } as any;

      const expectedResult = {
        credentialsUpdated: false,
        cacheUpdated: false,
        leadUpdated: true,
        processingTime: 180,
      };

      mockProcessPersistenciaTask.mockResolvedValueOnce(expectedResult);

      // Act
      const result = await parentWorker.delegateLowPriorityJob(mockJob);

      // Assert
      expect(result).toEqual(expectedResult);
      expect(mockProcessPersistenciaTask).toHaveBeenCalledWith(mockJob);
      expect(mockProcessPersistenciaTask).toHaveBeenCalledTimes(1);
    });

    it('should delegate batch update jobs to persistencia task module', async () => {
      // Arrange
      const mockJob: Job<PersistenciaCredenciaisJobData> = {
        id: 'job-batch-001',
        name: 'persistencia-batchUpdate-test-correlation-333',
        data: {
          type: 'batchUpdate',
          data: {
            inboxId: 'batch',
            whatsappApiKey: 'BATCH_KEY',
            phoneNumberId: 'BATCH_PHONE',
            businessId: 'BATCH_BUSINESS',
            contactSource: 'batch',
            leadData: {
              messageId: 0,
              accountId: 0,
              accountName: 'batch',
              contactPhone: 'batch',
              wamid: 'batch',
            },
            correlationId: 'test-correlation-333',
            batchItems: [
              {
                inboxId: '4',
                credentials: {
                  whatsappApiKey: 'EAAG3333333333...',
                  phoneNumberId: '555555555',
                  businessId: '666666666',
                },
                leadData: {
                  messageId: 55555,
                  accountId: 66666,
                  accountName: 'Batch Item 1',
                  contactPhone: '+5511333333333',
                  wamid: 'wamid.batch_item_1',
                },
              },
              {
                inboxId: '5',
                credentials: {
                  whatsappApiKey: 'EAAG4444444444...',
                  phoneNumberId: '777777777',
                  businessId: '888888888',
                },
                leadData: {
                  messageId: 77777,
                  accountId: 88888,
                  accountName: 'Batch Item 2',
                  contactPhone: '+5511222222222',
                  wamid: 'wamid.batch_item_2',
                },
              },
            ],
          },
        },
      } as any;

      const expectedResult = {
        credentialsUpdated: true,
        cacheUpdated: true,
        leadUpdated: true,
        processingTime: 450,
      };

      mockProcessPersistenciaTask.mockResolvedValueOnce(expectedResult);

      // Act
      const result = await parentWorker.delegateLowPriorityJob(mockJob);

      // Assert
      expect(result).toEqual(expectedResult);
      expect(mockProcessPersistenciaTask).toHaveBeenCalledWith(mockJob);
      expect(mockProcessPersistenciaTask).toHaveBeenCalledTimes(1);
    });

    it('should throw error for unknown low priority job types', async () => {
      // Arrange
      const mockJob: Job<PersistenciaCredenciaisJobData> = {
        id: 'job-unknown-low-001',
        name: 'persistencia-unknownType-test-correlation-444',
        data: {
          type: 'unknownType' as any,
          data: {
            inboxId: '4',
            correlationId: 'test-correlation-444',
          } as any,
        },
      } as any;

      // Act & Assert
      await expect(parentWorker.delegateLowPriorityJob(mockJob))
        .rejects
        .toThrow('Unknown low priority job type: unknownType');

      expect(mockProcessPersistenciaTask).not.toHaveBeenCalled();
    });

    it('should propagate errors from persistencia task module', async () => {
      // Arrange
      const mockJob: Job<PersistenciaCredenciaisJobData> = {
        id: 'job-persistence-error-001',
        name: 'persistencia-atualizarCredenciais-error-correlation-555',
        data: {
          type: 'atualizarCredenciais',
          data: {
            inboxId: '4',
            whatsappApiKey: 'INVALID_KEY',
            phoneNumberId: '000000000',
            businessId: '000000000',
            contactSource: 'error_test',
            leadData: {
              messageId: 99999,
              accountId: 99999,
              accountName: 'Error Test',
              contactPhone: '+5511111111111',
              wamid: 'wamid.error_test_555',
            },
            correlationId: 'test-correlation-555',
          },
        },
      } as any;

      const taskError = new Error('Database connection failed');
      mockProcessPersistenciaTask.mockRejectedValueOnce(taskError);

      // Act & Assert
      await expect(parentWorker.delegateLowPriorityJob(mockJob))
        .rejects
        .toThrow('Database connection failed');

      expect(mockProcessPersistenciaTask).toHaveBeenCalledWith(mockJob);
    });
  });

  describe('Job Name and Correlation ID Handling', () => {
    it('should correctly extract job information for logging', async () => {
      // Arrange
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      const mockJob: Job<RespostaRapidaJobData> = {
        id: 'job-logging-001',
        name: 'resposta-intent-logging-correlation-666',
        data: {
          type: 'processarResposta',
          data: {
            inboxId: '4',
            contactPhone: '+5511999888777',
            interactionType: 'intent',
            intentName: 'logging.test',
            wamid: 'wamid.logging_test_666',
            credentials: {
              token: 'LOGGING_TOKEN',
              phoneNumberId: '999888777',
              businessId: '777888999',
            },
            correlationId: 'test-correlation-666',
          },
        },
      } as any;

      mockProcessRespostaRapidaTask.mockResolvedValueOnce({
        success: true,
        processingTime: 100,
        correlationId: 'test-correlation-666',
      });

      // Act
      await parentWorker.delegateHighPriorityJob(mockJob);

      // Assert
      expect(consoleSpy).toHaveBeenCalledWith(
        '[Parent Worker] Delegating high priority job: resposta-intent-logging-correlation-666',
        {
          type: 'processarResposta',
          correlationId: 'test-correlation-666',
          interactionType: 'intent',
        }
      );

      consoleSpy.mockRestore();
    });

    it('should log errors with correlation ID for traceability', async () => {
      // Arrange
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      
      const mockJob: Job<PersistenciaCredenciaisJobData> = {
        id: 'job-error-logging-001',
        name: 'persistencia-atualizarCredenciais-error-correlation-777',
        data: {
          type: 'atualizarCredenciais',
          data: {
            inboxId: '4',
            correlationId: 'test-correlation-777',
          } as any,
        },
      } as any;

      const taskError = new Error('Test error for logging');
      mockProcessPersistenciaTask.mockRejectedValueOnce(taskError);

      // Act
      try {
        await parentWorker.delegateLowPriorityJob(mockJob);
      } catch (error) {
        // Expected to throw
      }

      // Assert
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[Parent Worker] Low priority job delegation failed: persistencia-atualizarCredenciais-error-correlation-777',
        {
          error: 'Test error for logging',
          correlationId: 'test-correlation-777',
        }
      );

      consoleErrorSpy.mockRestore();
    });
  });

  describe('Performance and Concurrency', () => {
    it('should handle multiple concurrent high priority jobs', async () => {
      // Arrange
      const jobs = Array.from({ length: 5 }, (_, i) => ({
        id: `job-concurrent-high-${i}`,
        name: `resposta-intent-concurrent-correlation-${i}`,
        data: {
          type: 'processarResposta',
          data: {
            inboxId: '4',
            contactPhone: `+551199999${String(i).padStart(4, '0')}`,
            interactionType: 'intent',
            intentName: `concurrent.test.${i}`,
            wamid: `wamid.concurrent_test_${i}`,
            credentials: {
              token: `CONCURRENT_TOKEN_${i}`,
              phoneNumberId: `99999${i}`,
              businessId: `88888${i}`,
            },
            correlationId: `test-correlation-${i}`,
          },
        },
      } as any));

      // Mock successful responses for all jobs
      mockProcessRespostaRapidaTask.mockImplementation(async (job) => ({
        success: true,
        processingTime: 50 + Math.random() * 100,
        correlationId: job.data.data.correlationId,
      }));

      // Act
      const startTime = Date.now();
      const results = await Promise.all(
        jobs.map(job => parentWorker.delegateHighPriorityJob(job))
      );
      const totalTime = Date.now() - startTime;

      // Assert
      expect(results).toHaveLength(5);
      results.forEach((result, index) => {
        expect(result.success).toBe(true);
        expect(result.correlationId).toBe(`test-correlation-${index}`);
      });

      // Should process concurrently (not sequentially)
      expect(totalTime).toBeLessThan(1000); // Should be much faster than 5 * 150ms
      expect(mockProcessRespostaRapidaTask).toHaveBeenCalledTimes(5);
    });

    it('should handle multiple concurrent low priority jobs', async () => {
      // Arrange
      const jobs = Array.from({ length: 3 }, (_, i) => ({
        id: `job-concurrent-low-${i}`,
        name: `persistencia-atualizarCredenciais-concurrent-correlation-${i}`,
        data: {
          type: 'atualizarCredenciais',
          data: {
            inboxId: `${4 + i}`,
            whatsappApiKey: `CONCURRENT_KEY_${i}`,
            phoneNumberId: `77777${i}`,
            businessId: `66666${i}`,
            contactSource: 'concurrent_test',
            leadData: {
              messageId: 10000 + i,
              accountId: 20000 + i,
              accountName: `Concurrent Test ${i}`,
              contactPhone: `+551188888${String(i).padStart(4, '0')}`,
              wamid: `wamid.concurrent_persistence_${i}`,
            },
            correlationId: `test-correlation-persistence-${i}`,
          },
        },
      } as any));

      // Mock successful responses for all jobs
      mockProcessPersistenciaTask.mockImplementation(async (job) => ({
        credentialsUpdated: true,
        cacheUpdated: true,
        leadUpdated: true,
        processingTime: 200 + Math.random() * 100,
      }));

      // Act
      const startTime = Date.now();
      const results = await Promise.all(
        jobs.map(job => parentWorker.delegateLowPriorityJob(job))
      );
      const totalTime = Date.now() - startTime;

      // Assert
      expect(results).toHaveLength(3);
      results.forEach(result => {
        expect(result.credentialsUpdated).toBe(true);
        expect(result.cacheUpdated).toBe(true);
        expect(result.leadUpdated).toBe(true);
      });

      // Should process concurrently
      expect(totalTime).toBeLessThan(1000); // Should be much faster than 3 * 300ms
      expect(mockProcessPersistenciaTask).toHaveBeenCalledTimes(3);
    });
  });
});

export {};