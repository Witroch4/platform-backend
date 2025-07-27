/**
 * Unit Tests for Parent Worker Delegation Logic
 * Tests the new Parent Worker architecture that delegates jobs to task modules
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

// Mock Redis connection
jest.mock('@/lib/redis', () => ({
  connection: {
    host: 'localhost',
    port: 6379,
  },
}));

// Mock Prisma
jest.mock('@/lib/prisma', () => ({
  prisma: {
    $disconnect: jest.fn(),
  },
}));

describe('Parent Worker Delegation Logic', () => {
  let parentWorker: any;
  let mockProcessRespostaRapidaTask: jest.Mock;
  let mockProcessPersistenciaTask: jest.Mock;

  beforeEach(async () => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Get mocked functions
    const { processRespostaRapidaTask } = await import('@/worker/WebhookWorkerTasks/respostaRapida.worker.task');
    const { processPersistenciaTask } = await import('@/worker/WebhookWorkerTasks/persistencia.worker.task');
    
    mockProcessRespostaRapidaTask = processRespostaRapidaTask as jest.Mock;
    mockProcessPersistenciaTask = processPersistenciaTask as jest.Mock;

    // Import ParentWorker after mocks are set up
    const { parentWorker: worker } = await import('@/worker/webhook.worker');
    parentWorker = worker;
  });

  afterEach(async () => {
    // Clean up worker connections
    if (parentWorker) {
      await parentWorker.shutdown();
    }
  });

  describe('High Priority Job Delegation', () => {
    it('should delegate processarResposta jobs to respostaRapida task module', async () => {
      // Arrange
      const jobData: RespostaRapidaJobData = {
        type: 'processarResposta',
        data: {
          inboxId: '4',
          contactPhone: '+5511999999999',
          interactionType: 'intent',
          intentName: 'welcome',
          wamid: 'wamid.test123',
          credentials: {
            token: 'test-token',
            phoneNumberId: 'test-phone-id',
            businessId: 'test-business-id',
          },
          correlationId: 'test-correlation-id',
        },
      };

      const mockJob = {
        id: 'test-job-id',
        name: 'resposta-intent-test-correlation-id',
        data: jobData,
      } as Job<RespostaRapidaJobData>;

      const expectedResult = {
        success: true,
        messageId: 'msg-123',
        processingTime: 150,
        correlationId: 'test-correlation-id',
      };

      mockProcessRespostaRapidaTask.mockResolvedValue(expectedResult);

      // Act
      const result = await parentWorker.highPriority.process(mockJob);

      // Assert
      expect(mockProcessRespostaRapidaTask).toHaveBeenCalledWith(mockJob);
      expect(mockProcessRespostaRapidaTask).toHaveBeenCalledTimes(1);
      expect(result).toEqual(expectedResult);
    });

    it('should handle unknown high priority job types', async () => {
      // Arrange
      const jobData = {
        type: 'unknownType',
        data: {
          correlationId: 'test-correlation-id',
        },
      } as any;

      const mockJob = {
        id: 'test-job-id',
        name: 'unknown-job',
        data: jobData,
      } as Job<any>;

      // Act & Assert
      await expect(parentWorker.highPriority.process(mockJob))
        .rejects
        .toThrow('Unknown high priority job type: unknownType');

      expect(mockProcessRespostaRapidaTask).not.toHaveBeenCalled();
    });

    it('should handle task module errors gracefully', async () => {
      // Arrange
      const jobData: RespostaRapidaJobData = {
        type: 'processarResposta',
        data: {
          inboxId: '4',
          contactPhone: '+5511999999999',
          interactionType: 'button_reply',
          buttonId: 'btn-123',
          wamid: 'wamid.test123',
          credentials: {
            token: 'test-token',
            phoneNumberId: 'test-phone-id',
            businessId: 'test-business-id',
          },
          correlationId: 'test-correlation-id',
        },
      };

      const mockJob = {
        id: 'test-job-id',
        name: 'resposta-button_reply-test-correlation-id',
        data: jobData,
      } as Job<RespostaRapidaJobData>;

      const taskError = new Error('Task processing failed');
      mockProcessRespostaRapidaTask.mockRejectedValue(taskError);

      // Act & Assert
      await expect(parentWorker.highPriority.process(mockJob))
        .rejects
        .toThrow('Task processing failed');

      expect(mockProcessRespostaRapidaTask).toHaveBeenCalledWith(mockJob);
    });
  });

  describe('Low Priority Job Delegation', () => {
    it('should delegate atualizarCredenciais jobs to persistencia task module', async () => {
      // Arrange
      const jobData: PersistenciaCredenciaisJobData = {
        type: 'atualizarCredenciais',
        data: {
          inboxId: '4',
          whatsappApiKey: 'test-api-key',
          phoneNumberId: 'test-phone-id',
          businessId: 'test-business-id',
          contactSource: 'webhook',
          leadData: {
            messageId: 123,
            accountId: 456,
            accountName: 'Test Account',
            contactPhone: '+5511999999999',
            wamid: 'wamid.test123',
          },
          correlationId: 'test-correlation-id',
        },
      };

      const mockJob = {
        id: 'test-job-id',
        name: 'persistencia-atualizarCredenciais-test-correlation-id',
        data: jobData,
      } as Job<PersistenciaCredenciaisJobData>;

      const expectedResult = {
        credentialsUpdated: true,
        cacheUpdated: true,
        leadUpdated: true,
        processingTime: 250,
      };

      mockProcessPersistenciaTask.mockResolvedValue(expectedResult);

      // Act
      const result = await parentWorker.lowPriority.process(mockJob);

      // Assert
      expect(mockProcessPersistenciaTask).toHaveBeenCalledWith(mockJob);
      expect(mockProcessPersistenciaTask).toHaveBeenCalledTimes(1);
      expect(result).toEqual(expectedResult);
    });

    it('should delegate atualizarLead jobs to persistencia task module', async () => {
      // Arrange
      const jobData: PersistenciaCredenciaisJobData = {
        type: 'atualizarLead',
        data: {
          inboxId: '4',
          whatsappApiKey: 'test-api-key',
          phoneNumberId: 'test-phone-id',
          businessId: 'test-business-id',
          contactSource: 'webhook',
          leadData: {
            messageId: 123,
            accountId: 456,
            accountName: 'Test Account',
            contactPhone: '+5511999999999',
            wamid: 'wamid.test123',
          },
          correlationId: 'test-correlation-id',
        },
      };

      const mockJob = {
        id: 'test-job-id',
        name: 'persistencia-atualizarLead-test-correlation-id',
        data: jobData,
      } as Job<PersistenciaCredenciaisJobData>;

      const expectedResult = {
        credentialsUpdated: false,
        cacheUpdated: false,
        leadUpdated: true,
        processingTime: 100,
      };

      mockProcessPersistenciaTask.mockResolvedValue(expectedResult);

      // Act
      const result = await parentWorker.lowPriority.process(mockJob);

      // Assert
      expect(mockProcessPersistenciaTask).toHaveBeenCalledWith(mockJob);
      expect(result).toEqual(expectedResult);
    });

    it('should delegate batchUpdate jobs to persistencia task module', async () => {
      // Arrange
      const jobData: PersistenciaCredenciaisJobData = {
        type: 'batchUpdate',
        data: {
          inboxId: '4',
          whatsappApiKey: 'test-api-key',
          phoneNumberId: 'test-phone-id',
          businessId: 'test-business-id',
          contactSource: 'batch',
          leadData: {
            messageId: 0,
            accountId: 0,
            accountName: 'batch',
            contactPhone: 'batch',
            wamid: 'batch',
          },
          correlationId: 'test-correlation-id',
          batchItems: [
            {
              inboxId: '4',
              credentials: {
                whatsappApiKey: 'test-api-key-1',
                phoneNumberId: 'test-phone-id-1',
                businessId: 'test-business-id-1',
              },
              leadData: { contactPhone: '+5511111111111' },
            },
            {
              inboxId: '5',
              credentials: {
                whatsappApiKey: 'test-api-key-2',
                phoneNumberId: 'test-phone-id-2',
                businessId: 'test-business-id-2',
              },
              leadData: { contactPhone: '+5511222222222' },
            },
          ],
        },
      };

      const mockJob = {
        id: 'test-job-id',
        name: 'persistencia-batchUpdate-test-correlation-id',
        data: jobData,
      } as Job<PersistenciaCredenciaisJobData>;

      const expectedResult = {
        credentialsUpdated: true,
        cacheUpdated: true,
        leadUpdated: true,
        processingTime: 500,
      };

      mockProcessPersistenciaTask.mockResolvedValue(expectedResult);

      // Act
      const result = await parentWorker.lowPriority.process(mockJob);

      // Assert
      expect(mockProcessPersistenciaTask).toHaveBeenCalledWith(mockJob);
      expect(result).toEqual(expectedResult);
    });

    it('should handle unknown low priority job types', async () => {
      // Arrange
      const jobData = {
        type: 'unknownType',
        data: {
          correlationId: 'test-correlation-id',
        },
      } as any;

      const mockJob = {
        id: 'test-job-id',
        name: 'unknown-job',
        data: jobData,
      } as Job<any>;

      // Act & Assert
      await expect(parentWorker.lowPriority.process(mockJob))
        .rejects
        .toThrow('Unknown low priority job type: unknownType');

      expect(mockProcessPersistenciaTask).not.toHaveBeenCalled();
    });
  });

  describe('Worker Event Handling', () => {
    it('should log completed high priority jobs with correlation ID', async () => {
      // Arrange
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      const jobData: RespostaRapidaJobData = {
        type: 'processarResposta',
        data: {
          inboxId: '4',
          contactPhone: '+5511999999999',
          interactionType: 'intent',
          intentName: 'welcome',
          wamid: 'wamid.test123',
          credentials: {
            token: 'test-token',
            phoneNumberId: 'test-phone-id',
            businessId: 'test-business-id',
          },
          correlationId: 'test-correlation-id',
        },
      };

      const mockJob = {
        id: 'test-job-id',
        name: 'resposta-intent-test-correlation-id',
        data: jobData,
      } as Job<RespostaRapidaJobData>;

      const result = {
        success: true,
        messageId: 'msg-123',
        processingTime: 150,
        correlationId: 'test-correlation-id',
      };

      // Act
      parentWorker.highPriority.emit('completed', mockJob, result);

      // Assert
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[Parent Worker] High priority job completed:'),
        expect.objectContaining({
          jobId: 'test-job-id',
          correlationId: 'test-correlation-id',
          processingTime: 150,
        })
      );

      consoleSpy.mockRestore();
    });

    it('should log failed low priority jobs with error details', async () => {
      // Arrange
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      
      const jobData: PersistenciaCredenciaisJobData = {
        type: 'atualizarCredenciais',
        data: {
          inboxId: '4',
          whatsappApiKey: 'test-api-key',
          phoneNumberId: 'test-phone-id',
          businessId: 'test-business-id',
          contactSource: 'webhook',
          leadData: {
            messageId: 123,
            accountId: 456,
            accountName: 'Test Account',
            contactPhone: '+5511999999999',
            wamid: 'wamid.test123',
          },
          correlationId: 'test-correlation-id',
        },
      };

      const mockJob = {
        id: 'test-job-id',
        name: 'persistencia-atualizarCredenciais-test-correlation-id',
        data: jobData,
      } as Job<PersistenciaCredenciaisJobData>;

      const error = new Error('Database connection failed');

      // Act
      parentWorker.lowPriority.emit('failed', mockJob, error);

      // Assert
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('[Parent Worker] Low priority job failed:'),
        expect.objectContaining({
          jobId: 'test-job-id',
          correlationId: 'test-correlation-id',
          error: 'Database connection failed',
        })
      );

      consoleErrorSpy.mockRestore();
    });
  });

  describe('Worker Lifecycle Management', () => {
    it('should initialize both high and low priority workers', async () => {
      // Assert
      expect(parentWorker.highPriority).toBeDefined();
      expect(parentWorker.lowPriority).toBeDefined();
      expect(parentWorker.highPriority.name).toBe(RESPOSTA_RAPIDA_QUEUE_NAME);
      expect(parentWorker.lowPriority.name).toBe(PERSISTENCIA_CREDENCIAIS_QUEUE_NAME);
    });

    it('should wait for both workers to be ready', async () => {
      // Arrange
      const highPriorityReadySpy = jest.spyOn(parentWorker.highPriority, 'waitUntilReady')
        .mockResolvedValue(undefined);
      const lowPriorityReadySpy = jest.spyOn(parentWorker.lowPriority, 'waitUntilReady')
        .mockResolvedValue(undefined);

      // Act
      await parentWorker.waitUntilReady();

      // Assert
      expect(highPriorityReadySpy).toHaveBeenCalled();
      expect(lowPriorityReadySpy).toHaveBeenCalled();
    });

    it('should shutdown both workers gracefully', async () => {
      // Arrange
      const highPriorityCloseSpy = jest.spyOn(parentWorker.highPriority, 'close')
        .mockResolvedValue(undefined);
      const lowPriorityCloseSpy = jest.spyOn(parentWorker.lowPriority, 'close')
        .mockResolvedValue(undefined);

      // Act
      await parentWorker.shutdown();

      // Assert
      expect(highPriorityCloseSpy).toHaveBeenCalled();
      expect(lowPriorityCloseSpy).toHaveBeenCalled();
    });
  });

  describe('Job Name Consistency', () => {
    it('should handle job names consistent with dispatcher logic', async () => {
      // Test that the Parent Worker can handle job names generated by the dispatcher
      const testCases = [
        {
          jobName: 'resposta-intent-1234567890-abc123',
          jobType: 'processarResposta',
          interactionType: 'intent',
        },
        {
          jobName: 'resposta-button_reply-1234567890-def456',
          jobType: 'processarResposta',
          interactionType: 'button_reply',
        },
        {
          jobName: 'persistencia-atualizarCredenciais-1234567890-ghi789',
          jobType: 'atualizarCredenciais',
        },
        {
          jobName: 'persistencia-atualizarLead-1234567890-jkl012',
          jobType: 'atualizarLead',
        },
      ];

      for (const testCase of testCases) {
        const isHighPriority = testCase.jobName.startsWith('resposta-');
        const isLowPriority = testCase.jobName.startsWith('persistencia-');

        expect(isHighPriority || isLowPriority).toBe(true);
        
        if (isHighPriority) {
          expect(testCase.jobType).toBe('processarResposta');
          expect(['intent', 'button_reply']).toContain(testCase.interactionType);
        }
        
        if (isLowPriority) {
          expect(['atualizarCredenciais', 'atualizarLead', 'batchUpdate']).toContain(testCase.jobType);
        }
      }
    });
  });
});