/**
 * Worker performance tests for job processing SLAs
 * Requirements: 1.1, 1.3, 5.1, 5.2
 */

import { describe, test, expect, jest, beforeEach, afterEach, beforeAll, afterAll } from '@jest/globals';
import { Job } from 'bullmq';

// Mock dependencies for performance testing
const mockRedis = {
  get: jest.fn(),
  setex: jest.fn(),
  del: jest.fn(),
  exists: jest.fn(),
  ping: jest.fn(),
  pipeline: jest.fn(),
};

const mockPrisma = {
  chatwitInbox: {
    findFirst: jest.fn(),
    updateMany: jest.fn(),
  },
  mapeamentoIntencao: {
    findFirst: jest.fn(),
  },
  mapeamentoBotao: {
    findFirst: jest.fn(),
  },
  lead: {
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  template: {
    findUnique: jest.fn(),
  },
};

const mockWhatsAppAPI = {
  sendMessage: jest.fn(),
  sendReaction: jest.fn(),
};

jest.mock('@/lib/redis', () => ({
  connection: mockRedis,
}));

jest.mock('@/lib/prisma', () => ({
  prisma: mockPrisma,
}));

jest.mock('@/lib/whatsapp', () => mockWhatsAppAPI);

describe('Worker Performance Tests', () => {
  let respostaRapidaWorkerTask: any;
  let persistenciaWorkerTask: any;

  beforeAll(async () => {
    // Import worker tasks after mocks are set up
    const respostaModule = await import('@/worker/WebhookWorkerTasks/respostaRapida.worker.task');
    const persistenciaModule = await import('@/worker/WebhookWorkerTasks/persistencia.worker.task');

    respostaRapidaWorkerTask = respostaModule.processRespostaRapidaTask;
    persistenciaWorkerTask = persistenciaModule.processPersistenciaTask;
  });

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup fast mock responses
    mockRedis.get.mockResolvedValue(null);
    mockRedis.setex.mockResolvedValue('OK');
    mockRedis.del.mockResolvedValue(1);
    mockRedis.exists.mockResolvedValue(0);
    mockRedis.ping.mockResolvedValue('PONG');
    mockRedis.pipeline.mockReturnValue({
      setex: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([]),
    });

    mockPrisma.chatwitInbox.findFirst.mockResolvedValue({
      inboxId: '4',
      whatsappApiKey: 'test-api-key',
      phoneNumberId: '123456789',
      whatsappBusinessAccountId: 'business123',
      updatedAt: new Date(),
      usuarioChatwit: {
        configuracaoGlobalWhatsApp: null,
      },
      fallbackParaInbox: null,
      fallbackParaInboxId: null,
    });

    mockPrisma.mapeamentoIntencao.findFirst.mockResolvedValue({
      id: 'mapping-123',
      template: {
        id: 'template-123',
        name: 'Performance Template',
        type: 'AUTOMATION_REPLY',
        simpleReplyText: 'Quick response for performance test',
      },
    });

    mockPrisma.mapeamentoBotao.findFirst.mockResolvedValue({
      id: 'button-mapping-123',
      buttonId: 'btn_perf_test',
      actionType: 'SEND_TEMPLATE',
      actionPayload: {
        templateId: 'template-456',
      },
    });

    mockPrisma.template.findUnique.mockResolvedValue({
      id: 'template-456',
      name: 'Button Template',
      type: 'AUTOMATION_REPLY',
      simpleReplyText: 'Button response',
    });

    mockPrisma.lead.findFirst.mockResolvedValue(null);
    mockPrisma.lead.create.mockResolvedValue({
      id: 'lead-123',
      phone: '+5511999999999',
      source: 'CHATWIT_OAB',
    });

    mockWhatsAppAPI.sendMessage.mockResolvedValue({ messageId: 'msg-123' });
    mockWhatsAppAPI.sendReaction.mockResolvedValue({ success: true });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('High Priority Worker Performance', () => {
    test('should process intent job within 2 seconds', async () => {
      const jobData = {
        type: 'processarResposta' as const,
        data: {
          inboxId: '4',
          contactPhone: '+5511999999999',
          interactionType: 'intent' as const,
          intentName: 'performance.intent',
          wamid: 'wamid.perf123',
          credentials: {
            token: 'test-api-key',
            phoneNumberId: '123456789',
            businessId: 'business123',
          },
          correlationId: 'perf-correlation-id',
        },
      };

      const mockJob = {
        id: 'job-123',
        name: 'resposta-intent-perf-correlation-id',
        data: jobData,
        attemptsMade: 1,
        opts: { attempts: 3 },
      } as Job;

      const startTime = performance.now();
      const result = await respostaRapidaWorkerTask(mockJob);
      const processingTime = performance.now() - startTime;

      expect(result.success).toBe(true);
      expect(processingTime).toBeLessThan(2000); // 2 seconds SLA
      expect(result.processingTime).toBeLessThan(2000);
      expect(result.correlationId).toBe('perf-correlation-id');

      console.log(`Intent processing performance:
        - Processing time: ${processingTime.toFixed(2)}ms
        - Result processing time: ${result.processingTime.toFixed(2)}ms
        - Success: ${result.success}
      `);
    });

    test('should process button job within 2 seconds', async () => {
      const jobData = {
        type: 'processarResposta' as const,
        data: {
          inboxId: '4',
          contactPhone: '+5511999999999',
          interactionType: 'button_reply' as const,
          buttonId: 'btn_perf_test',
          wamid: 'wamid.perf123',
          credentials: {
            token: 'test-api-key',
            phoneNumberId: '123456789',
            businessId: 'business123',
          },
          correlationId: 'perf-correlation-id',
        },
      };

      const mockJob = {
        id: 'job-123',
        name: 'resposta-button-perf-correlation-id',
        data: jobData,
        attemptsMade: 1,
        opts: { attempts: 3 },
      } as Job;

      const startTime = performance.now();
      const result = await respostaRapidaWorkerTask(mockJob);
      const processingTime = performance.now() - startTime;

      expect(result.success).toBe(true);
      expect(processingTime).toBeLessThan(2000); // 2 seconds SLA
      expect(result.processingTime).toBeLessThan(2000);
      expect(result.correlationId).toBe('perf-correlation-id');

      console.log(`Button processing performance:
        - Processing time: ${processingTime.toFixed(2)}ms
        - Result processing time: ${result.processingTime.toFixed(2)}ms
        - Success: ${result.success}
      `);
    });

    test('should handle concurrent high priority jobs efficiently', async () => {
      const createJobData = (id: number) => ({
        type: 'processarResposta' as const,
        data: {
          inboxId: '4',
          contactPhone: `+551199999999${id}`,
          interactionType: 'intent' as const,
          intentName: 'concurrent.performance.intent',
          wamid: `wamid.concurrent${id}`,
          credentials: {
            token: 'test-api-key',
            phoneNumberId: '123456789',
            businessId: 'business123',
          },
          correlationId: `concurrent-correlation-id-${id}`,
        },
      });

      const createMockJob = (id: number) => ({
        id: `job-${id}`,
        name: `resposta-intent-concurrent-correlation-id-${id}`,
        data: createJobData(id),
        attemptsMade: 1,
        opts: { attempts: 3 },
      } as Job);

      const numJobs = 20;
      const jobs = Array.from({ length: numJobs }, (_, i) => createMockJob(i));

      const startTime = performance.now();
      const promises = jobs.map(async (job) => {
        const jobStartTime = performance.now();
        const result = await respostaRapidaWorkerTask(job);
        const jobProcessingTime = performance.now() - jobStartTime;
        return { result, jobProcessingTime };
      });

      const results = await Promise.all(promises);
      const totalTime = performance.now() - startTime;

      // All jobs should complete successfully
      results.forEach(({ result }) => {
        expect(result.success).toBe(true);
      });

      // Calculate performance metrics
      const processingTimes = results.map(r => r.jobProcessingTime);
      const averageTime = processingTimes.reduce((sum, time) => sum + time, 0) / processingTimes.length;
      const maxTime = Math.max(...processingTimes);
      const minTime = Math.min(...processingTimes);

      // Performance requirements
      expect(averageTime).toBeLessThan(2000); // Average under 2 seconds
      expect(maxTime).toBeLessThan(5000); // No job should take more than 5 seconds

      console.log(`Concurrent high priority jobs performance:
        - Total jobs: ${numJobs}
        - Total time: ${totalTime.toFixed(2)}ms
        - Average job time: ${averageTime.toFixed(2)}ms
        - Min job time: ${minTime.toFixed(2)}ms
        - Max job time: ${maxTime.toFixed(2)}ms
        - Jobs per second: ${(numJobs / (totalTime / 1000)).toFixed(2)}
      `);
    });

    test('should maintain performance with complex interactive templates', async () => {
      // Setup complex interactive template
      mockPrisma.mapeamentoIntencao.findFirst.mockResolvedValue({
        id: 'mapping-123',
        template: {
          id: 'template-123',
          name: 'Complex Interactive Template',
          type: 'INTERACTIVE_MESSAGE',
          interactiveContent: {
            header: {
              type: 'text',
              content: 'Complex Header with Variables {{contact_phone}}',
            },
            body: {
              text: 'This is a complex interactive message with multiple variables: {{contact_phone}}, {{intent_name}}, {{timestamp}}',
            },
            footer: {
              text: 'Footer with correlation: {{correlation_id}}',
            },
            actionReplyButton: Array.from({ length: 10 }, (_, i) => ({
              id: `btn_complex_${i}`,
              title: `Option ${i + 1}`,
            })),
          },
        },
      });

      const jobData = {
        type: 'processarResposta' as const,
        data: {
          inboxId: '4',
          contactPhone: '+5511999999999',
          interactionType: 'intent' as const,
          intentName: 'complex.interactive.intent',
          wamid: 'wamid.complex123',
          credentials: {
            token: 'test-api-key',
            phoneNumberId: '123456789',
            businessId: 'business123',
          },
          correlationId: 'complex-correlation-id',
        },
      };

      const mockJob = {
        id: 'job-complex',
        name: 'resposta-intent-complex-correlation-id',
        data: jobData,
        attemptsMade: 1,
        opts: { attempts: 3 },
      } as Job;

      const startTime = performance.now();
      const result = await respostaRapidaWorkerTask(mockJob);
      const processingTime = performance.now() - startTime;

      expect(result.success).toBe(true);
      expect(processingTime).toBeLessThan(3000); // Allow slightly more time for complex templates
      expect(result.processingTime).toBeLessThan(3000);

      // Verify complex template was processed
      expect(mockWhatsAppAPI.sendMessage).toHaveBeenCalledWith(
        '+5511999999999',
        expect.objectContaining({
          type: 'interactive',
          interactive: expect.objectContaining({
            body: expect.objectContaining({
              text: expect.stringContaining('+5511999999999'),
            }),
          }),
        }),
        expect.any(Object),
        expect.any(String),
        'complex-correlation-id'
      );

      console.log(`Complex template processing performance:
        - Processing time: ${processingTime.toFixed(2)}ms
        - Template type: INTERACTIVE_MESSAGE
        - Variables processed: 4
        - Buttons: 10
      `);
    });

    test('should handle WhatsApp official templates efficiently', async () => {
      // Setup WhatsApp official template with multiple components
      mockPrisma.mapeamentoIntencao.findFirst.mockResolvedValue({
        id: 'mapping-123',
        template: {
          id: 'template-123',
          name: 'Official Performance Template',
          type: 'WHATSAPP_OFFICIAL',
          whatsappOfficialInfo: {
            metaTemplateId: 'performance_template',
            language: 'pt_BR',
            components: [
              {
                type: 'HEADER',
                text: 'Performance Test Header {{contact_phone}}',
              },
              {
                type: 'BODY',
                text: 'This is a performance test for WhatsApp official template with variables: {{contact_phone}}, {{intent_name}}, {{timestamp}}, {{correlation_id}}',
              },
              {
                type: 'FOOTER',
                text: 'Performance test footer',
              },
              {
                type: 'BUTTONS',
                buttons: Array.from({ length: 3 }, (_, i) => ({
                  type: 'QUICK_REPLY',
                  text: `Quick Reply ${i + 1}`,
                })),
              },
            ],
          },
        },
      });

      const jobData = {
        type: 'processarResposta' as const,
        data: {
          inboxId: '4',
          contactPhone: '+5511999999999',
          interactionType: 'intent' as const,
          intentName: 'official.performance.intent',
          wamid: 'wamid.official123',
          credentials: {
            token: 'test-api-key',
            phoneNumberId: '123456789',
            businessId: 'business123',
          },
          correlationId: 'official-correlation-id',
        },
      };

      const mockJob = {
        id: 'job-official',
        name: 'resposta-intent-official-correlation-id',
        data: jobData,
        attemptsMade: 1,
        opts: { attempts: 3 },
      } as Job;

      const startTime = performance.now();
      const result = await respostaRapidaWorkerTask(mockJob);
      const processingTime = performance.now() - startTime;

      expect(result.success).toBe(true);
      expect(processingTime).toBeLessThan(2500); // Allow slightly more time for official templates
      expect(result.processingTime).toBeLessThan(2500);

      // Verify official template was processed with variable substitution
      expect(mockWhatsAppAPI.sendMessage).toHaveBeenCalledWith(
        '+5511999999999',
        expect.objectContaining({
          type: 'template',
          template: expect.objectContaining({
            name: 'performance_template',
            language: { code: 'pt_BR' },
            components: expect.arrayContaining([
              expect.objectContaining({
                type: 'HEADER',
                text: expect.stringContaining('+5511999999999'),
              }),
              expect.objectContaining({
                type: 'BODY',
                text: expect.stringContaining('+5511999999999'),
              }),
            ]),
          }),
        }),
        expect.any(Object),
        expect.any(String),
        'official-correlation-id'
      );

      console.log(`WhatsApp official template processing performance:
        - Processing time: ${processingTime.toFixed(2)}ms
        - Template components: 4
        - Variables substituted: 4
        - Buttons: 3
      `);
    });
  });

  describe('Low Priority Worker Performance', () => {
    test('should process credentials update within 5 seconds', async () => {
      const jobData = {
        type: 'atualizarCredenciais' as const,
        data: {
          inboxId: '4',
          whatsappApiKey: 'perf-api-key',
          phoneNumberId: '987654321',
          businessId: 'perf-business',
          contactSource: 'chatwit',
          leadData: {
            messageId: 12345,
            accountId: 1,
            accountName: 'Performance Account',
            contactPhone: '+5511999999999',
            wamid: 'wamid.perf123',
          },
          correlationId: 'perf-correlation-id',
        },
      };

      const mockJob = {
        id: 'job-456',
        name: 'persistencia-atualizarCredenciais-perf-correlation-id',
        data: jobData,
        attemptsMade: 1,
        opts: { attempts: 5 },
      } as Job;

      const startTime = performance.now();
      const result = await persistenciaWorkerTask(mockJob);
      const processingTime = performance.now() - startTime;

      expect(result.credentialsUpdated).toBe(true);
      expect(result.leadUpdated).toBe(true);
      expect(processingTime).toBeLessThan(5000); // 5 seconds SLA
      expect(result.processingTime).toBeLessThan(5000);

      console.log(`Credentials update performance:
        - Processing time: ${processingTime.toFixed(2)}ms
        - Result processing time: ${result.processingTime.toFixed(2)}ms
        - Credentials updated: ${result.credentialsUpdated}
        - Cache updated: ${result.cacheUpdated}
        - Lead updated: ${result.leadUpdated}
      `);
    });

    test('should handle batch updates efficiently', async () => {
      const batchSize = 50;
      const batchItems = Array.from({ length: batchSize }, (_, i) => ({
        inboxId: `${4 + i}`,
        credentials: {
          whatsappApiKey: `batch-key-${i}`,
          phoneNumberId: `${111111111 + i}`,
          businessId: `batch-business-${i}`,
        },
        leadData: {
          contactPhone: `+55119999${String(i).padStart(4, '0')}`,
          contactSource: 'batch',
          messageId: 12345 + i,
          accountId: 1,
          accountName: `Batch Account ${i}`,
          wamid: `wamid.batch${i}`,
        },
      }));

      const jobData = {
        type: 'batchUpdate' as const,
        data: {
          inboxId: '4',
          whatsappApiKey: 'batch-key-0',
          phoneNumberId: '111111111',
          businessId: 'batch-business-0',
          contactSource: 'batch',
          leadData: {
            messageId: 0,
            accountId: 0,
            accountName: 'batch',
            contactPhone: 'batch',
            wamid: 'batch',
          },
          correlationId: 'batch-correlation-id',
          batchItems,
        },
      };

      const mockJob = {
        id: 'job-batch',
        name: 'persistencia-batchUpdate-batch-correlation-id',
        data: jobData,
        attemptsMade: 1,
        opts: { attempts: 5 },
      } as Job;

      // Mock cache checks for all items
      mockRedis.exists.mockResolvedValue(0);

      const startTime = performance.now();
      const result = await persistenciaWorkerTask(mockJob);
      const processingTime = performance.now() - startTime;

      expect(result.credentialsUpdated).toBe(true);
      expect(result.leadUpdated).toBe(true);
      expect(processingTime).toBeLessThan(10000); // 10 seconds for batch processing
      expect(result.processingTime).toBeLessThan(10000);

      // Verify all items were processed
      expect(mockPrisma.chatwitInbox.updateMany).toHaveBeenCalledTimes(batchSize);
      expect(mockPrisma.lead.create).toHaveBeenCalledTimes(batchSize);

      console.log(`Batch update performance:
        - Batch size: ${batchSize}
        - Processing time: ${processingTime.toFixed(2)}ms
        - Time per item: ${(processingTime / batchSize).toFixed(2)}ms
        - Items per second: ${(batchSize / (processingTime / 1000)).toFixed(2)}
      `);
    });

    test('should handle concurrent low priority jobs efficiently', async () => {
      const createJobData = (id: number) => ({
        type: 'atualizarCredenciais' as const,
        data: {
          inboxId: `${4 + id}`,
          whatsappApiKey: `concurrent-key-${id}`,
          phoneNumberId: `${123456789 + id}`,
          businessId: `concurrent-business-${id}`,
          contactSource: 'chatwit',
          leadData: {
            messageId: 12345 + id,
            accountId: 1,
            accountName: `Concurrent Account ${id}`,
            contactPhone: `+55119999${String(id).padStart(4, '0')}`,
            wamid: `wamid.concurrent${id}`,
          },
          correlationId: `concurrent-correlation-id-${id}`,
        },
      });

      const createMockJob = (id: number) => ({
        id: `job-${id}`,
        name: `persistencia-atualizarCredenciais-concurrent-correlation-id-${id}`,
        data: createJobData(id),
        attemptsMade: 1,
        opts: { attempts: 5 },
      } as Job);

      const numJobs = 15;
      const jobs = Array.from({ length: numJobs }, (_, i) => createMockJob(i));

      const startTime = performance.now();
      const promises = jobs.map(async (job) => {
        const jobStartTime = performance.now();
        const result = await persistenciaWorkerTask(job);
        const jobProcessingTime = performance.now() - jobStartTime;
        return { result, jobProcessingTime };
      });

      const results = await Promise.all(promises);
      const totalTime = performance.now() - startTime;

      // All jobs should complete successfully
      results.forEach(({ result }) => {
        expect(result.credentialsUpdated).toBe(true);
        expect(result.leadUpdated).toBe(true);
      });

      // Calculate performance metrics
      const processingTimes = results.map(r => r.jobProcessingTime);
      const averageTime = processingTimes.reduce((sum, time) => sum + time, 0) / processingTimes.length;
      const maxTime = Math.max(...processingTimes);
      const minTime = Math.min(...processingTimes);

      // Performance requirements
      expect(averageTime).toBeLessThan(5000); // Average under 5 seconds
      expect(maxTime).toBeLessThan(10000); // No job should take more than 10 seconds

      console.log(`Concurrent low priority jobs performance:
        - Total jobs: ${numJobs}
        - Total time: ${totalTime.toFixed(2)}ms
        - Average job time: ${averageTime.toFixed(2)}ms
        - Min job time: ${minTime.toFixed(2)}ms
        - Max job time: ${maxTime.toFixed(2)}ms
        - Jobs per second: ${(numJobs / (totalTime / 1000)).toFixed(2)}
      `);
    });

    test('should optimize database operations for performance', async () => {
      // Test with cache hit scenario (should skip database update)
      mockRedis.exists.mockResolvedValue(1); // Recently updated

      const jobData = {
        type: 'atualizarCredenciais' as const,
        data: {
          inboxId: '4',
          whatsappApiKey: 'cached-key',
          phoneNumberId: '123456789',
          businessId: 'cached-business',
          contactSource: 'chatwit',
          leadData: {
            messageId: 12345,
            accountId: 1,
            accountName: 'Cached Account',
            contactPhone: '+5511999999999',
            wamid: 'wamid.cached123',
          },
          correlationId: 'cached-correlation-id',
        },
      };

      const mockJob = {
        id: 'job-cached',
        name: 'persistencia-atualizarCredenciais-cached-correlation-id',
        data: jobData,
        attemptsMade: 1,
        opts: { attempts: 5 },
      } as Job;

      const startTime = performance.now();
      const result = await persistenciaWorkerTask(mockJob);
      const processingTime = performance.now() - startTime;

      expect(result.credentialsUpdated).toBe(false); // Skipped due to cache
      expect(result.leadUpdated).toBe(true); // Lead should still be processed
      expect(processingTime).toBeLessThan(2000); // Should be faster due to cache optimization

      // Verify database update was skipped
      expect(mockPrisma.chatwitInbox.updateMany).not.toHaveBeenCalled();

      console.log(`Optimized database operations performance:
        - Processing time: ${processingTime.toFixed(2)}ms
        - Credentials update skipped: ${!result.credentialsUpdated}
        - Lead still processed: ${result.leadUpdated}
        - Cache optimization effective: ${processingTime < 2000}
      `);
    });
  });

  describe('Memory Usage and Resource Management', () => {
    test('should not leak memory during sustained worker processing', async () => {
      const initialMemory = process.memoryUsage();

      // Process multiple batches of jobs
      const batchSize = 10;
      const numBatches = 5;
      const allProcessingTimes: number[] = [];

      for (let batch = 0; batch < numBatches; batch++) {
        const jobs = Array.from({ length: batchSize }, (_, i) => {
          const jobId = batch * batchSize + i;
          return {
            id: `job-${jobId}`,
            name: `resposta-intent-memory-test-${jobId}`,
            data: {
              type: 'processarResposta' as const,
              data: {
                inboxId: '4',
                contactPhone: `+55119999${String(jobId).padStart(4, '0')}`,
                interactionType: 'intent' as const,
                intentName: 'memory.test.intent',
                wamid: `wamid.memory${jobId}`,
                credentials: {
                  token: 'test-api-key',
                  phoneNumberId: '123456789',
                  businessId: 'business123',
                },
                correlationId: `memory-correlation-id-${jobId}`,
              },
            },
            attemptsMade: 1,
            opts: { attempts: 3 },
          } as Job;
        });

        const promises = jobs.map(async (job) => {
          const startTime = performance.now();
          const result = await respostaRapidaWorkerTask(job);
          const processingTime = performance.now() - startTime;
          return { result, processingTime };
        });

        const results = await Promise.all(promises);

        // Verify all jobs completed successfully
        results.forEach(({ result }) => {
          expect(result.success).toBe(true);
        });

        // Collect processing times
        allProcessingTimes.push(...results.map(r => r.processingTime));

        // Force garbage collection if available
        if (global.gc) {
          global.gc();
        }

        // Small delay between batches
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      const finalMemory = process.memoryUsage();

      // Memory growth should be reasonable (less than 100MB)
      const memoryGrowth = finalMemory.heapUsed - initialMemory.heapUsed;
      expect(memoryGrowth).toBeLessThan(100 * 1024 * 1024); // 100MB

      // Performance should remain consistent
      const averageProcessingTime = allProcessingTimes.reduce((sum, time) => sum + time, 0) / allProcessingTimes.length;
      expect(averageProcessingTime).toBeLessThan(2000);

      // Performance should not degrade significantly over time
      const firstBatchAvg = allProcessingTimes.slice(0, batchSize).reduce((sum, time) => sum + time, 0) / batchSize;
      const lastBatchAvg = allProcessingTimes.slice(-batchSize).reduce((sum, time) => sum + time, 0) / batchSize;
      const performanceDegradation = lastBatchAvg - firstBatchAvg;
      expect(performanceDegradation).toBeLessThan(500); // Less than 500ms degradation

      console.log(`Worker memory test results:
        - Total jobs processed: ${allProcessingTimes.length}
        - Memory growth: ${(memoryGrowth / 1024 / 1024).toFixed(2)}MB
        - Average processing time: ${averageProcessingTime.toFixed(2)}ms
        - First batch avg: ${firstBatchAvg.toFixed(2)}ms
        - Last batch avg: ${lastBatchAvg.toFixed(2)}ms
        - Performance degradation: ${performanceDegradation.toFixed(2)}ms
      `);
    });

    test('should handle large job payloads efficiently', async () => {
      // Create a job with large payload data
      const largeJobData = {
        type: 'processarResposta' as const,
        data: {
          inboxId: '4',
          contactPhone: '+5511999999999',
          interactionType: 'intent' as const,
          intentName: 'large.payload.intent',
          wamid: 'wamid.large123',
          credentials: {
            token: 'test-api-key',
            phoneNumberId: '123456789',
            businessId: 'business123',
          },
          correlationId: 'large-correlation-id',
          // Add large metadata to simulate real-world scenarios
          metadata: {
            conversationHistory: Array.from({ length: 100 }, (_, i) => ({
              id: `msg_${i}`,
              timestamp: Date.now() - i * 60000,
              type: 'text',
              content: `Historical message ${i} with substantial content that increases payload size significantly`,
              sender: i % 2 === 0 ? 'user' : 'bot',
            })),
            userProfile: {
              preferences: Object.fromEntries(
                Array.from({ length: 50 }, (_, i) => [`pref_${i}`, `preference_value_${i}_with_detailed_information`])
              ),
              tags: Array.from({ length: 20 }, (_, i) => `tag_${i}`),
              customFields: Object.fromEntries(
                Array.from({ length: 30 }, (_, i) => [`field_${i}`, `custom_field_value_${i}_with_extensive_data`])
              ),
            },
          },
        },
      };

      const mockJob = {
        id: 'job-large',
        name: 'resposta-intent-large-correlation-id',
        data: largeJobData,
        attemptsMade: 1,
        opts: { attempts: 3 },
      } as Job;

      const startTime = performance.now();
      const result = await respostaRapidaWorkerTask(mockJob);
      const processingTime = performance.now() - startTime;

      expect(result.success).toBe(true);
      expect(processingTime).toBeLessThan(3000); // Allow more time for large payloads
      expect(result.processingTime).toBeLessThan(3000);

      console.log(`Large payload processing performance:
        - Processing time: ${processingTime.toFixed(2)}ms
        - Payload size: ~${JSON.stringify(largeJobData).length} characters
        - Success: ${result.success}
      `);
    });
  });

  describe('Error Handling Performance', () => {
    test('should handle worker errors quickly', async () => {
      // Simulate database error
      mockPrisma.mapeamentoIntencao.findFirst.mockRejectedValue(new Error('Database connection timeout'));

      const jobData = {
        type: 'processarResposta' as const,
        data: {
          inboxId: '4',
          contactPhone: '+5511999999999',
          interactionType: 'intent' as const,
          intentName: 'error.test.intent',
          wamid: 'wamid.error123',
          credentials: {
            token: 'test-api-key',
            phoneNumberId: '123456789',
            businessId: 'business123',
          },
          correlationId: 'error-correlation-id',
        },
      };

      const mockJob = {
        id: 'job-error',
        name: 'resposta-intent-error-correlation-id',
        data: jobData,
        attemptsMade: 1,
        opts: { attempts: 3 },
      } as Job;

      const startTime = performance.now();
      const result = await respostaRapidaWorkerTask(mockJob);
      const processingTime = performance.now() - startTime;

      expect(result.success).toBe(false);
      expect(result.error).toContain('Database connection timeout');
      expect(processingTime).toBeLessThan(5000); // Error handling should be fast
      expect(result.processingTime).toBeLessThan(5000);

      console.log(`Error handling performance:
        - Processing time: ${processingTime.toFixed(2)}ms
        - Error handled gracefully: ${!result.success}
        - Error message: ${result.error}
      `);
    });

    test('should maintain performance under mixed success/error conditions', async () => {
      const createSuccessJob = (id: number) => ({
        id: `job-success-${id}`,
        name: `resposta-intent-success-${id}`,
        data: {
          type: 'processarResposta' as const,
          data: {
            inboxId: '4',
            contactPhone: `+55119999${String(id).padStart(4, '0')}`,
            interactionType: 'intent' as const,
            intentName: 'success.intent',
            wamid: `wamid.success${id}`,
            credentials: {
              token: 'test-api-key',
              phoneNumberId: '123456789',
              businessId: 'business123',
            },
            correlationId: `success-correlation-id-${id}`,
          },
        },
        attemptsMade: 1,
        opts: { attempts: 3 },
      } as Job);

      const createErrorJob = (id: number) => ({
        id: `job-error-${id}`,
        name: `resposta-intent-error-${id}`,
        data: {
          type: 'processarResposta' as const,
          data: {
            inboxId: '4',
            contactPhone: `+55119999${String(id).padStart(4, '0')}`,
            interactionType: 'intent' as const,
            intentName: 'error.intent',
            wamid: `wamid.error${id}`,
            credentials: {
              token: 'test-api-key',
              phoneNumberId: '123456789',
              businessId: 'business123',
            },
            correlationId: `error-correlation-id-${id}`,
          },
        },
        attemptsMade: 1,
        opts: { attempts: 3 },
      } as Job);

      // Create mixed jobs: 70% success, 30% errors
      const successJobs = Array.from({ length: 14 }, (_, i) => createSuccessJob(i));
      const errorJobs = Array.from({ length: 6 }, (_, i) => createErrorJob(i));
      const allJobs = [...successJobs, ...errorJobs];

      // Setup mock responses
      mockPrisma.mapeamentoIntencao.findFirst.mockImplementation((query) => {
        if (query.where.intentName === 'error.intent') {
          return Promise.reject(new Error('Simulated database error'));
        }
        return Promise.resolve({
          id: 'mapping-123',
          template: {
            id: 'template-123',
            name: 'Success Template',
            type: 'AUTOMATION_REPLY',
            simpleReplyText: 'Success response',
          },
        });
      });

      // Shuffle jobs to simulate real-world mixed load
      for (let i = allJobs.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [allJobs[i], allJobs[j]] = [allJobs[j], allJobs[i]];
      }

      const promises = allJobs.map(async (job) => {
        const startTime = performance.now();
        const result = await respostaRapidaWorkerTask(job);
        const processingTime = performance.now() - startTime;
        return { result, processingTime, jobId: job.id };
      });

      const results = await Promise.all(promises);

      // Verify results
      const successResults = results.filter(r => r.result.success);
      const errorResults = results.filter(r => !r.result.success);

      expect(successResults.length).toBe(14);
      expect(errorResults.length).toBe(6);

      // Performance should remain good despite errors
      const averageProcessingTime = results.reduce((sum, { processingTime }) => sum + processingTime, 0) / results.length;
      expect(averageProcessingTime).toBeLessThan(3000);

      // Error handling should not significantly impact performance
      const successAvgTime = successResults.reduce((sum, { processingTime }) => sum + processingTime, 0) / successResults.length;
      const errorAvgTime = errorResults.reduce((sum, { processingTime }) => sum + processingTime, 0) / errorResults.length;

      expect(successAvgTime).toBeLessThan(2000);
      expect(errorAvgTime).toBeLessThan(5000);

      console.log(`Mixed success/error performance:
        - Total jobs: ${results.length}
        - Success jobs: ${successResults.length}
        - Error jobs: ${errorResults.length}
        - Average processing time: ${averageProcessingTime.toFixed(2)}ms
        - Success avg time: ${successAvgTime.toFixed(2)}ms
        - Error avg time: ${errorAvgTime.toFixed(2)}ms
      `);
    });
  });
});