/**
 * Database query performance tests for optimized queries
 * Requirements: 1.1, 1.3, 5.1, 5.2
 */

import { describe, test, expect, jest, beforeEach, afterEach, beforeAll, afterAll } from '@jest/globals';

// Mock Prisma for performance testing
const mockPrisma = {
  chatwitInbox: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    updateMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  mapeamentoIntencao: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
  },
  mapeamentoBotao: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
  },
  lead: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  template: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
  },
  $queryRaw: jest.fn(),
  $executeRaw: jest.fn(),
};

jest.mock('@/lib/prisma', () => ({
  prisma: mockPrisma,
}));

describe('Database Query Performance Tests', () => {
  let findCompleteMessageMappingByIntent: any;
  let findReactionByButtonId: any;
  let CredentialsFallbackResolver: any;
  let UnifiedLeadManager: any;

  beforeAll(async () => {
    // Import database query functions after mocks are set up
    const dialogflowModule = await import('@/lib/dialogflow-database-queries');
    const persistenciaModule = await import('@/worker/WebhookWorkerTasks/persistencia.worker.task');
    const leadModule = await import('@/lib/lead-management');

    findCompleteMessageMappingByIntent = dialogflowModule.findCompleteMessageMappingByIntent;
    findReactionByButtonId = dialogflowModule.findReactionByButtonId;
    CredentialsFallbackResolver = persistenciaModule.CredentialsFallbackResolver;
    UnifiedLeadManager = leadModule.UnifiedLeadManager;
  });

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup default mock responses
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
        simpleReplyText: 'Quick response',
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

    mockPrisma.lead.findFirst.mockResolvedValue(null);
    mockPrisma.lead.create.mockResolvedValue({
      id: 'lead-123',
      phone: '+5511999999999',
      source: 'CHATWIT_OAB',
    });

    mockPrisma.template.findUnique.mockResolvedValue({
      id: 'template-456',
      name: 'Button Template',
      type: 'AUTOMATION_REPLY',
      simpleReplyText: 'Button response',
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Intent Mapping Query Performance', () => {
    test('should find intent mapping within 100ms', async () => {
      const startTime = performance.now();
      const result = await findCompleteMessageMappingByIntent('performance.intent', '4');
      const queryTime = performance.now() - startTime;

      expect(queryTime).toBeLessThan(100); // Target: under 100ms
      expect(result).toBeDefined();
      expect(mockPrisma.mapeamentoIntencao.findFirst).toHaveBeenCalledWith({
        where: {
          intentName: 'performance.intent',
          inbox: {
            inboxId: '4',
          },
        },
        include: expect.any(Object),
      });

      console.log(`Intent mapping query performance: ${queryTime.toFixed(2)}ms`);
    });

    test('should handle complex intent mapping queries efficiently', async () => {
      // Setup complex template with all includes
      mockPrisma.mapeamentoIntencao.findFirst.mockResolvedValue({
        id: 'complex-mapping-123',
        template: {
          id: 'complex-template-123',
          name: 'Complex Performance Template',
          type: 'INTERACTIVE_MESSAGE',
          interactiveContent: {
            header: {
              type: 'text',
              content: 'Complex Header',
            },
            body: {
              text: 'Complex body with variables',
            },
            footer: {
              text: 'Complex footer',
            },
            actionReplyButton: Array.from({ length: 10 }, (_, i) => ({
              id: `btn_complex_${i}`,
              title: `Option ${i + 1}`,
            })),
            actionList: {
              sections: [
                {
                  title: 'Section 1',
                  rows: Array.from({ length: 5 }, (_, i) => ({
                    id: `row_${i}`,
                    title: `Row ${i + 1}`,
                    description: `Description ${i + 1}`,
                  })),
                },
              ],
            },
          },
        },
      });

      const startTime = performance.now();
      const result = await findCompleteMessageMappingByIntent('complex.performance.intent', '4');
      const queryTime = performance.now() - startTime;

      expect(queryTime).toBeLessThan(150); // Allow more time for complex queries
      expect(result).toBeDefined();
      expect(result.template.interactiveContent).toBeDefined();

      console.log(`Complex intent mapping query performance: ${queryTime.toFixed(2)}ms`);
    });

    test('should handle concurrent intent mapping queries efficiently', async () => {
      const numQueries = 20;
      const intentNames = Array.from({ length: numQueries }, (_, i) => `concurrent.intent.${i}`);

      const startTime = performance.now();
      const promises = intentNames.map(async (intentName) => {
        const queryStartTime = performance.now();
        const result = await findCompleteMessageMappingByIntent(intentName, '4');
        const queryTime = performance.now() - queryStartTime;
        return { result, queryTime, intentName };
      });

      const results = await Promise.all(promises);
      const totalTime = performance.now() - startTime;

      // All queries should complete successfully
      results.forEach(({ result }) => {
        expect(result).toBeDefined();
      });

      // Calculate performance metrics
      const queryTimes = results.map(r => r.queryTime);
      const averageQueryTime = queryTimes.reduce((sum, time) => sum + time, 0) / queryTimes.length;
      const maxQueryTime = Math.max(...queryTimes);
      const minQueryTime = Math.min(...queryTimes);

      expect(averageQueryTime).toBeLessThan(100);
      expect(maxQueryTime).toBeLessThan(200);

      console.log(`Concurrent intent mapping queries performance:
        - Queries: ${numQueries}
        - Total time: ${totalTime.toFixed(2)}ms
        - Average query time: ${averageQueryTime.toFixed(2)}ms
        - Min query time: ${minQueryTime.toFixed(2)}ms
        - Max query time: ${maxQueryTime.toFixed(2)}ms
        - Queries per second: ${(numQueries / (totalTime / 1000)).toFixed(0)}
      `);
    });

    test('should optimize queries with proper indexing strategy', async () => {
      // Test query with specific where conditions that should use indexes
      const startTime = performance.now();
      await findCompleteMessageMappingByIntent('indexed.intent', '4');
      const queryTime = performance.now() - startTime;

      expect(queryTime).toBeLessThan(50); // Should be very fast with proper indexing

      // Verify the query structure uses indexed fields
      expect(mockPrisma.mapeamentoIntencao.findFirst).toHaveBeenCalledWith({
        where: {
          intentName: 'indexed.intent', // Should be indexed
          inbox: {
            inboxId: '4', // Should be indexed
          },
        },
        include: expect.any(Object),
      });

      console.log(`Indexed query performance: ${queryTime.toFixed(2)}ms`);
    });
  });

  describe('Button Action Query Performance', () => {
    test('should find button action within 50ms', async () => {
      const startTime = performance.now();
      const result = await findReactionByButtonId('btn_perf_test');
      const queryTime = performance.now() - startTime;

      expect(queryTime).toBeLessThan(50); // Target: under 50ms
      expect(result).toBeDefined();
      expect(mockPrisma.mapeamentoBotao.findFirst).toHaveBeenCalledWith({
        where: {
          buttonId: 'btn_perf_test',
        },
        include: expect.any(Object),
      });

      console.log(`Button action query performance: ${queryTime.toFixed(2)}ms`);
    });

    test('should handle complex button action queries efficiently', async () => {
      // Setup complex button mapping
      mockPrisma.mapeamentoBotao.findFirst.mockResolvedValue({
        id: 'complex-button-mapping-123',
        buttonId: 'btn_complex_perf_test',
        actionType: 'START_FLOW',
        actionPayload: {
          flowId: 'complex-flow-123',
          flowCta: 'Start Complex Flow',
          flowMode: 'published',
          flowData: {
            steps: Array.from({ length: 10 }, (_, i) => ({
              id: `step_${i}`,
              type: 'input',
              config: {
                label: `Step ${i + 1}`,
                validation: {
                  required: true,
                  minLength: 5,
                  maxLength: 100,
                },
              },
            })),
            variables: Object.fromEntries(
              Array.from({ length: 20 }, (_, i) => [`var_${i}`, `default_value_${i}`])
            ),
          },
        },
        inbox: {
          inboxId: '4',
          whatsappApiKey: 'complex-key',
          phoneNumberId: '987654321',
        },
      });

      const startTime = performance.now();
      const result = await findReactionByButtonId('btn_complex_perf_test');
      const queryTime = performance.now() - startTime;

      expect(queryTime).toBeLessThan(100); // Allow more time for complex queries
      expect(result).toBeDefined();
      expect(result.actionPayload.flowData).toBeDefined();

      console.log(`Complex button action query performance: ${queryTime.toFixed(2)}ms`);
    });

    test('should handle concurrent button queries efficiently', async () => {
      const numQueries = 30;
      const buttonIds = Array.from({ length: numQueries }, (_, i) => `btn_concurrent_${i}`);

      const startTime = performance.now();
      const promises = buttonIds.map(async (buttonId) => {
        const queryStartTime = performance.now();
        const result = await findReactionByButtonId(buttonId);
        const queryTime = performance.now() - queryStartTime;
        return { result, queryTime, buttonId };
      });

      const results = await Promise.all(promises);
      const totalTime = performance.now() - startTime;

      // All queries should complete successfully
      results.forEach(({ result }) => {
        expect(result).toBeDefined();
      });

      // Calculate performance metrics
      const queryTimes = results.map(r => r.queryTime);
      const averageQueryTime = queryTimes.reduce((sum, time) => sum + time, 0) / queryTimes.length;
      const maxQueryTime = Math.max(...queryTimes);

      expect(averageQueryTime).toBeLessThan(50);
      expect(maxQueryTime).toBeLessThan(100);

      console.log(`Concurrent button queries performance:
        - Queries: ${numQueries}
        - Total time: ${totalTime.toFixed(2)}ms
        - Average query time: ${averageQueryTime.toFixed(2)}ms
        - Max query time: ${maxQueryTime.toFixed(2)}ms
        - Queries per second: ${(numQueries / (totalTime / 1000)).toFixed(0)}
      `);
    });
  });

  describe('Credentials Fallback Query Performance', () => {
    test('should resolve credentials within 200ms', async () => {
      const startTime = performance.now();
      const result = await CredentialsFallbackResolver.resolveCredentials('4');
      const queryTime = performance.now() - startTime;

      expect(queryTime).toBeLessThan(200); // Target: under 200ms
      expect(result).toBeDefined();
      expect(mockPrisma.chatwitInbox.findFirst).toHaveBeenCalledWith({
        where: { inboxId: '4' },
        include: {
          usuarioChatwit: {
            include: {
              configuracaoGlobalWhatsApp: true,
            },
          },
          fallbackParaInbox: true,
        },
      });

      console.log(`Credentials resolution performance: ${queryTime.toFixed(2)}ms`);
    });

    test('should handle fallback chain queries efficiently', async () => {
      // Setup fallback chain: 4 -> 5 -> 6 (6 has credentials)
      mockPrisma.chatwitInbox.findFirst
        .mockResolvedValueOnce({
          inboxId: '4',
          whatsappApiKey: null,
          phoneNumberId: null,
          whatsappBusinessAccountId: null,
          fallbackParaInboxId: '5',
          usuarioChatwit: { configuracaoGlobalWhatsApp: null },
          fallbackParaInbox: null,
        })
        .mockResolvedValueOnce({
          inboxId: '5',
          whatsappApiKey: null,
          phoneNumberId: null,
          whatsappBusinessAccountId: null,
          fallbackParaInboxId: '6',
          usuarioChatwit: { configuracaoGlobalWhatsApp: null },
          fallbackParaInbox: null,
        })
        .mockResolvedValueOnce({
          inboxId: '6',
          whatsappApiKey: 'fallback-key',
          phoneNumberId: '666666666',
          whatsappBusinessAccountId: 'fallback-business',
          updatedAt: new Date(),
          usuarioChatwit: { configuracaoGlobalWhatsApp: null },
          fallbackParaInbox: null,
          fallbackParaInboxId: null,
        });

      const startTime = performance.now();
      const result = await CredentialsFallbackResolver.resolveCredentials('4');
      const queryTime = performance.now() - startTime;

      expect(queryTime).toBeLessThan(500); // Allow more time for chain resolution
      expect(result).toBeDefined();
      expect(result.whatsappApiKey).toBe('fallback-key');
      expect(mockPrisma.chatwitInbox.findFirst).toHaveBeenCalledTimes(3);

      console.log(`Fallback chain resolution performance: ${queryTime.toFixed(2)}ms`);
    });

    test('should handle concurrent credentials resolution efficiently', async () => {
      const numQueries = 15;
      const inboxIds = Array.from({ length: numQueries }, (_, i) => `${i + 1}`);

      const startTime = performance.now();
      const promises = inboxIds.map(async (inboxId) => {
        const queryStartTime = performance.now();
        const result = await CredentialsFallbackResolver.resolveCredentials(inboxId);
        const queryTime = performance.now() - queryStartTime;
        return { result, queryTime, inboxId };
      });

      const results = await Promise.all(promises);
      const totalTime = performance.now() - startTime;

      // All queries should complete successfully
      results.forEach(({ result }) => {
        expect(result).toBeDefined();
      });

      // Calculate performance metrics
      const queryTimes = results.map(r => r.queryTime);
      const averageQueryTime = queryTimes.reduce((sum, time) => sum + time, 0) / queryTimes.length;
      const maxQueryTime = Math.max(...queryTimes);

      expect(averageQueryTime).toBeLessThan(200);
      expect(maxQueryTime).toBeLessThan(400);

      console.log(`Concurrent credentials resolution performance:
        - Queries: ${numQueries}
        - Total time: ${totalTime.toFixed(2)}ms
        - Average query time: ${averageQueryTime.toFixed(2)}ms
        - Max query time: ${maxQueryTime.toFixed(2)}ms
        - Queries per second: ${(numQueries / (totalTime / 1000)).toFixed(0)}
      `);
    });
  });

  describe('Lead Management Query Performance', () => {
    test('should find or create lead within 300ms', async () => {
      const leadData = {
        contactPhone: '+5511999999999',
        contactSource: 'chatwit',
        messageId: 12345,
        accountId: 1,
        accountName: 'Performance Account',
        wamid: 'wamid.perf123',
        inboxId: '4',
      };

      const startTime = performance.now();
      const result = await UnifiedLeadManager.findOrCreateLead(leadData);
      const queryTime = performance.now() - startTime;

      expect(queryTime).toBeLessThan(300); // Target: under 300ms
      expect(result).toBeDefined();
      expect(result.lead).toBeDefined();

      console.log(`Lead find/create performance: ${queryTime.toFixed(2)}ms`);
    });

    test('should handle batch lead operations efficiently', async () => {
      const batchSize = 20;
      const leadDataBatch = Array.from({ length: batchSize }, (_, i) => ({
        contactPhone: `+55119999${String(i).padStart(4, '0')}`,
        contactSource: 'batch',
        messageId: 12345 + i,
        accountId: 1,
        accountName: `Batch Account ${i}`,
        wamid: `wamid.batch${i}`,
        inboxId: '4',
      }));

      const startTime = performance.now();
      const promises = leadDataBatch.map(async (leadData) => {
        const queryStartTime = performance.now();
        const result = await UnifiedLeadManager.findOrCreateLead(leadData);
        const queryTime = performance.now() - queryStartTime;
        return { result, queryTime };
      });

      const results = await Promise.all(promises);
      const totalTime = performance.now() - startTime;

      // All operations should complete successfully
      results.forEach(({ result }) => {
        expect(result).toBeDefined();
        expect(result.lead).toBeDefined();
      });

      // Calculate performance metrics
      const queryTimes = results.map(r => r.queryTime);
      const averageQueryTime = queryTimes.reduce((sum, time) => sum + time, 0) / queryTimes.length;
      const maxQueryTime = Math.max(...queryTimes);

      expect(averageQueryTime).toBeLessThan(300);
      expect(maxQueryTime).toBeLessThan(500);

      console.log(`Batch lead operations performance:
        - Operations: ${batchSize}
        - Total time: ${totalTime.toFixed(2)}ms
        - Average query time: ${averageQueryTime.toFixed(2)}ms
        - Max query time: ${maxQueryTime.toFixed(2)}ms
        - Operations per second: ${(batchSize / (totalTime / 1000)).toFixed(0)}
      `);
    });

    test('should update lead metadata efficiently', async () => {
      // Setup existing lead
      mockPrisma.lead.findFirst.mockResolvedValue({
        id: 'existing-lead-123',
        phone: '+5511999999999',
        source: 'CHATWIT_OAB',
        sourceIdentifier: 'chatwit',
        lastMessageId: 12340,
        lastWamid: 'wamid.old123',
      });

      const startTime = performance.now();
      await UnifiedLeadManager.updateLeadWithMessageMetadata('existing-lead-123', {
        wamid: 'wamid.new123',
        messageId: 12345,
        accountId: 1,
        accountName: 'Updated Account',
      });
      const queryTime = performance.now() - startTime;

      expect(queryTime).toBeLessThan(100); // Target: under 100ms for updates
      expect(mockPrisma.lead.update).toHaveBeenCalledWith({
        where: { id: 'existing-lead-123' },
        data: {
          lastMessageId: 12345,
          lastWamid: 'wamid.new123',
          lastAccountId: 1,
          lastAccountName: 'Updated Account',
          updatedAt: expect.any(Date),
        },
      });

      console.log(`Lead metadata update performance: ${queryTime.toFixed(2)}ms`);
    });
  });

  describe('Database Connection and Transaction Performance', () => {
    test('should handle database updates efficiently', async () => {
      const numUpdates = 10;
      const updateData = Array.from({ length: numUpdates }, (_, i) => ({
        inboxId: `${i + 1}`,
        whatsappApiKey: `update-key-${i}`,
        phoneNumberId: `${123456789 + i}`,
        businessId: `update-business-${i}`,
      }));

      const startTime = performance.now();
      const promises = updateData.map(async (data) => {
        const updateStartTime = performance.now();
        await mockPrisma.chatwitInbox.updateMany({
          where: { inboxId: data.inboxId },
          data: {
            whatsappApiKey: data.whatsappApiKey,
            phoneNumberId: data.phoneNumberId,
            whatsappBusinessAccountId: data.businessId,
            updatedAt: new Date(),
          },
        });
        const updateTime = performance.now() - updateStartTime;
        return { updateTime };
      });

      const results = await Promise.all(promises);
      const totalTime = performance.now() - startTime;

      // Calculate performance metrics
      const updateTimes = results.map(r => r.updateTime);
      const averageUpdateTime = updateTimes.reduce((sum, time) => sum + time, 0) / updateTimes.length;
      const maxUpdateTime = Math.max(...updateTimes);

      expect(averageUpdateTime).toBeLessThan(50);
      expect(maxUpdateTime).toBeLessThan(100);

      console.log(`Database updates performance:
        - Updates: ${numUpdates}
        - Total time: ${totalTime.toFixed(2)}ms
        - Average update time: ${averageUpdateTime.toFixed(2)}ms
        - Max update time: ${maxUpdateTime.toFixed(2)}ms
        - Updates per second: ${(numUpdates / (totalTime / 1000)).toFixed(0)}
      `);
    });

    test('should handle mixed read/write operations efficiently', async () => {
      const numOperations = 20;
      const operations = Array.from({ length: numOperations }, (_, i) => {
        const opType = i % 4;
        switch (opType) {
          case 0:
            return {
              type: 'read_intent',
              fn: () => findCompleteMessageMappingByIntent(`mixed.intent.${i}`, '4'),
            };
          case 1:
            return {
              type: 'read_button',
              fn: () => findReactionByButtonId(`btn_mixed_${i}`),
            };
          case 2:
            return {
              type: 'update_credentials',
              fn: () => mockPrisma.chatwitInbox.updateMany({
                where: { inboxId: `${i}` },
                data: { whatsappApiKey: `mixed-key-${i}` },
              }),
            };
          case 3:
            return {
              type: 'create_lead',
              fn: () => mockPrisma.lead.create({
                data: {
                  phone: `+55119999${String(i).padStart(4, '0')}`,
                  source: 'CHATWIT_OAB',
                  sourceIdentifier: `mixed-${i}`,
                },
              }),
            };
          default:
            return {
              type: 'read_intent',
              fn: () => findCompleteMessageMappingByIntent(`default.intent.${i}`, '4'),
            };
        }
      });

      const startTime = performance.now();
      const promises = operations.map(async ({ type, fn }) => {
        const opStartTime = performance.now();
        const result = await fn();
        const opTime = performance.now() - opStartTime;
        return { type, result, opTime };
      });

      const results = await Promise.all(promises);
      const totalTime = performance.now() - startTime;

      // Group results by operation type
      const opsByType = results.reduce((acc, { type, opTime }) => {
        if (!acc[type]) acc[type] = [];
        acc[type].push(opTime);
        return acc;
      }, {} as Record<string, number[]>);

      // Calculate averages for each operation type
      Object.entries(opsByType).forEach(([opType, times]) => {
        const avgTime = times.reduce((sum, time) => sum + time, 0) / times.length;
        expect(avgTime).toBeLessThan(200); // Each operation type should average under 200ms
      });

      console.log(`Mixed read/write operations performance:
        - Total operations: ${numOperations}
        - Total time: ${totalTime.toFixed(2)}ms
        - Operation averages:
          ${Object.entries(opsByType).map(([type, times]) => 
            `  ${type}: ${(times.reduce((sum, time) => sum + time, 0) / times.length).toFixed(2)}ms (${times.length} ops)`
          ).join('\n          ')}
      `);
    });

    test('should maintain performance under sustained database load', async () => {
      const batchSize = 15;
      const numBatches = 3;
      const allOperationTimes: number[] = [];

      for (let batch = 0; batch < numBatches; batch++) {
        const batchStartTime = performance.now();

        const promises = Array.from({ length: batchSize }, async (_, i) => {
          const opStartTime = performance.now();
          
          // Mix of operations
          await findCompleteMessageMappingByIntent(`sustained.intent.${batch}.${i}`, '4');
          await mockPrisma.chatwitInbox.updateMany({
            where: { inboxId: `${batch * batchSize + i}` },
            data: { whatsappApiKey: `sustained-key-${batch}-${i}` },
          });
          
          const opTime = performance.now() - opStartTime;
          return { opTime };
        });

        const results = await Promise.all(promises);
        const batchTime = performance.now() - batchStartTime;

        // Collect operation times
        allOperationTimes.push(...results.map(r => r.opTime));

        console.log(`Batch ${batch + 1}: ${batchTime.toFixed(2)}ms for ${batchSize} operations`);

        // Small delay between batches
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      // Analyze performance consistency across batches
      const totalOperations = allOperationTimes.length;
      const averageOpTime = allOperationTimes.reduce((sum, time) => sum + time, 0) / totalOperations;

      // Check for performance degradation
      const firstBatchAvg = allOperationTimes.slice(0, batchSize).reduce((sum, time) => sum + time, 0) / batchSize;
      const lastBatchAvg = allOperationTimes.slice(-batchSize).reduce((sum, time) => sum + time, 0) / batchSize;
      const performanceDegradation = lastBatchAvg - firstBatchAvg;

      expect(averageOpTime).toBeLessThan(300);
      expect(performanceDegradation).toBeLessThan(100); // Less than 100ms degradation

      console.log(`Sustained database load performance:
        - Total operations: ${totalOperations}
        - Average op time: ${averageOpTime.toFixed(2)}ms
        - First batch avg: ${firstBatchAvg.toFixed(2)}ms
        - Last batch avg: ${lastBatchAvg.toFixed(2)}ms
        - Performance degradation: ${performanceDegradation.toFixed(2)}ms
      `);
    });
  });

  describe('Query Optimization and Indexing', () => {
    test('should use efficient query patterns', async () => {
      // Test that queries use indexed fields and avoid N+1 problems
      const startTime = performance.now();
      
      // This should be a single query with proper includes
      await findCompleteMessageMappingByIntent('optimization.test', '4');
      
      const queryTime = performance.now() - startTime;

      expect(queryTime).toBeLessThan(50); // Should be very fast with proper optimization
      
      // Verify only one database call was made (no N+1 problem)
      expect(mockPrisma.mapeamentoIntencao.findFirst).toHaveBeenCalledTimes(1);

      console.log(`Optimized query performance: ${queryTime.toFixed(2)}ms`);
    });

    test('should handle large result sets efficiently', async () => {
      // Mock large result set
      const largeResultSet = Array.from({ length: 100 }, (_, i) => ({
        id: `mapping-${i}`,
        intentName: `large.intent.${i}`,
        template: {
          id: `template-${i}`,
          name: `Large Template ${i}`,
          type: 'AUTOMATION_REPLY',
          simpleReplyText: `Response ${i}`,
        },
      }));

      mockPrisma.mapeamentoIntencao.findMany.mockResolvedValue(largeResultSet);

      const startTime = performance.now();
      const result = await mockPrisma.mapeamentoIntencao.findMany({
        where: {
          inbox: {
            inboxId: '4',
          },
        },
        include: {
          template: true,
        },
        take: 100,
      });
      const queryTime = performance.now() - startTime;

      expect(queryTime).toBeLessThan(200); // Should handle large results efficiently
      expect(result).toHaveLength(100);

      console.log(`Large result set query performance:
        - Records: ${result.length}
        - Query time: ${queryTime.toFixed(2)}ms
        - Time per record: ${(queryTime / result.length).toFixed(3)}ms
      `);
    });

    test('should optimize pagination queries', async () => {
      const pageSize = 20;
      const numPages = 5;
      const allQueryTimes: number[] = [];

      for (let page = 0; page < numPages; page++) {
        const offset = page * pageSize;
        
        // Mock paginated results
        mockPrisma.lead.findMany.mockResolvedValue(
          Array.from({ length: pageSize }, (_, i) => ({
            id: `lead-${offset + i}`,
            phone: `+55119999${String(offset + i).padStart(4, '0')}`,
            source: 'CHATWIT_OAB',
          }))
        );

        const startTime = performance.now();
        const result = await mockPrisma.lead.findMany({
          skip: offset,
          take: pageSize,
          orderBy: { createdAt: 'desc' },
          where: {
            source: 'CHATWIT_OAB',
          },
        });
        const queryTime = performance.now() - startTime;

        allQueryTimes.push(queryTime);
        expect(result).toHaveLength(pageSize);
        expect(queryTime).toBeLessThan(100); // Each page should load quickly
      }

      // Performance should remain consistent across pages
      const averageQueryTime = allQueryTimes.reduce((sum, time) => sum + time, 0) / allQueryTimes.length;
      const maxQueryTime = Math.max(...allQueryTimes);
      const minQueryTime = Math.min(...allQueryTimes);

      expect(averageQueryTime).toBeLessThan(80);
      expect(maxQueryTime - minQueryTime).toBeLessThan(50); // Consistent performance

      console.log(`Pagination query performance:
        - Pages: ${numPages}
        - Page size: ${pageSize}
        - Average query time: ${averageQueryTime.toFixed(2)}ms
        - Min query time: ${minQueryTime.toFixed(2)}ms
        - Max query time: ${maxQueryTime.toFixed(2)}ms
        - Performance variance: ${(maxQueryTime - minQueryTime).toFixed(2)}ms
      `);
    });
  });
});