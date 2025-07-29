/**
 * Load tests for webhook endpoint with 100ms response requirement
 * Requirements: 1.1, 1.3, 5.1, 5.2
 */

import { describe, test, expect, jest, beforeEach, afterEach, beforeAll, afterAll } from '@jest/globals';
import { NextRequest } from 'next/server';

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
};

jest.mock('@/lib/redis', () => ({
  connection: mockRedis,
}));

jest.mock('@/lib/prisma', () => ({
  prisma: mockPrisma,
}));

// Mock queue operations to be fast
jest.mock('@/lib/queue/resposta-rapida.queue', () => ({
  addRespostaRapidaJob: jest.fn().mockResolvedValue({ id: 'job-123' }),
  createIntentJob: jest.fn().mockReturnValue({ type: 'processarResposta', data: {} }),
  createButtonJob: jest.fn().mockReturnValue({ type: 'processarResposta', data: {} }),
}));

jest.mock('@/lib/queue/persistencia-credenciais.queue', () => ({
  addPersistenciaCredenciaisJob: jest.fn().mockResolvedValue({ id: 'job-456' }),
  createCredentialsUpdateJob: jest.fn().mockReturnValue({ type: 'atualizarCredenciais', data: {} }),
}));

describe('Webhook Performance Tests', () => {
  let POST: any;

  beforeAll(async () => {
    // Import the webhook handler after mocks are set up
    const module = await import('@/app/api/admin/mtf-diamante/dialogflow/webhook/route');
    POST = module.POST;
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
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Single Request Performance', () => {
    test('should respond within 50ms for simple intent payload', async () => {
      const mockPayload = {
        originalDetectIntentRequest: {
          payload: {
            inbox_id: '4',
            contact_phone: '+5511999999999',
            interaction_type: 'intent',
            wamid: 'wamid.test123',
            whatsapp_api_key: 'test-api-key',
            phone_number_id: '123456789',
            business_id: 'business123',
            contact_source: 'chatwit',
            message_id: 12345,
            account_id: 1,
            account_name: 'Test Account',
          },
        },
        queryResult: {
          intent: {
            displayName: 'test.intent',
          },
        },
      };

      const mockRequest = {
        json: jest.fn().mockResolvedValue(mockPayload),
      } as any;

      const startTime = performance.now();
      const response = await POST(mockRequest);
      const responseTime = performance.now() - startTime;

      expect(response.status).toBe(202);
      expect(responseTime).toBeLessThan(50); // Target: under 50ms
      expect(response.headers.get('X-Correlation-ID')).toBeDefined();
    });

    test('should respond within 75ms for complex button payload', async () => {
      const mockPayload = {
        originalDetectIntentRequest: {
          payload: {
            inbox_id: '4',
            contact_phone: '+5511999999999',
            interaction_type: 'button_reply',
            wamid: 'wamid.test123',
            whatsapp_api_key: 'test-api-key',
            phone_number_id: '123456789',
            business_id: 'business123',
            contact_source: 'chatwit',
            message_id: 12345,
            account_id: 1,
            account_name: 'Test Account',
            interactive: {
              type: 'button_reply',
              button_reply: {
                id: 'btn_complex_action',
                title: 'Complex Action',
              },
            },
          },
        },
        queryResult: {
          intent: {
            displayName: 'Default Fallback Intent',
          },
        },
      };

      const mockRequest = {
        json: jest.fn().mockResolvedValue(mockPayload),
      } as any;

      const startTime = performance.now();
      const response = await POST(mockRequest);
      const responseTime = performance.now() - startTime;

      expect(response.status).toBe(202);
      expect(responseTime).toBeLessThan(75); // Target: under 75ms for complex payloads
      expect(response.headers.get('X-Correlation-ID')).toBeDefined();
    });

    test('should respond within 100ms even with extraction errors', async () => {
      // Malformed payload that will cause extraction errors
      const malformedPayload = {
        originalDetectIntentRequest: {
          payload: {
            // Missing required fields to trigger extraction error
            inbox_id: null,
            contact_phone: undefined,
          },
        },
      };

      const mockRequest = {
        json: jest.fn().mockResolvedValue(malformedPayload),
      } as any;

      const startTime = performance.now();
      const response = await POST(mockRequest);
      const responseTime = performance.now() - startTime;

      expect(response.status).toBe(202);
      expect(responseTime).toBeLessThan(100); // Should still be fast even with errors
      expect(response.headers.get('X-Correlation-ID')).toBeDefined();
    });

    test('should respond within 100ms with JSON parsing errors', async () => {
      const mockRequest = {
        json: jest.fn().mockRejectedValue(new Error('Invalid JSON')),
      } as any;

      const startTime = performance.now();
      const response = await POST(mockRequest);
      const responseTime = performance.now() - startTime;

      expect(response.status).toBe(202);
      expect(responseTime).toBeLessThan(100); // Should handle errors quickly
      expect(response.headers.get('X-Correlation-ID')).toBeDefined();
    });
  });

  describe('Concurrent Request Performance', () => {
    test('should handle 10 concurrent requests within 100ms each', async () => {
      const mockPayload = {
        originalDetectIntentRequest: {
          payload: {
            inbox_id: '4',
            contact_phone: '+5511999999999',
            interaction_type: 'intent',
            wamid: 'wamid.test123',
            whatsapp_api_key: 'test-api-key',
            phone_number_id: '123456789',
            business_id: 'business123',
            contact_source: 'chatwit',
            message_id: 12345,
            account_id: 1,
            account_name: 'Test Account',
          },
        },
        queryResult: {
          intent: {
            displayName: 'concurrent.intent',
          },
        },
      };

      const createRequest = (id: number) => ({
        json: jest.fn().mockResolvedValue({
          ...mockPayload,
          originalDetectIntentRequest: {
            ...mockPayload.originalDetectIntentRequest,
            payload: {
              ...mockPayload.originalDetectIntentRequest.payload,
              wamid: `wamid.test${id}`,
              contact_phone: `+551199999999${id}`,
            },
          },
        }),
      } as any);

      const requests = Array.from({ length: 10 }, (_, i) => createRequest(i));

      const promises = requests.map(async (request, index) => {
        const startTime = performance.now();
        const response = await POST(request);
        const responseTime = performance.now() - startTime;
        return { response, responseTime, index };
      });

      const results = await Promise.all(promises);

      // All requests should complete within 100ms
      results.forEach(({ response, responseTime, index }) => {
        expect(response.status).toBe(202);
        expect(responseTime).toBeLessThan(100);
        expect(response.headers.get('X-Correlation-ID')).toBeDefined();
      });

      // Average response time should be well under 100ms
      const averageResponseTime = results.reduce((sum, { responseTime }) => sum + responseTime, 0) / results.length;
      expect(averageResponseTime).toBeLessThan(75);
    });

    test('should handle 50 concurrent requests without degradation', async () => {
      const mockPayload = {
        originalDetectIntentRequest: {
          payload: {
            inbox_id: '4',
            contact_phone: '+5511999999999',
            interaction_type: 'intent',
            wamid: 'wamid.test123',
            whatsapp_api_key: 'test-api-key',
            phone_number_id: '123456789',
            business_id: 'business123',
            contact_source: 'chatwit',
            message_id: 12345,
            account_id: 1,
            account_name: 'Test Account',
          },
        },
        queryResult: {
          intent: {
            displayName: 'load.test.intent',
          },
        },
      };

      const createRequest = (id: number) => ({
        json: jest.fn().mockResolvedValue({
          ...mockPayload,
          originalDetectIntentRequest: {
            ...mockPayload.originalDetectIntentRequest,
            payload: {
              ...mockPayload.originalDetectIntentRequest.payload,
              wamid: `wamid.load${id}`,
              contact_phone: `+55119999${String(id).padStart(4, '0')}`,
            },
          },
        }),
      } as any);

      const requests = Array.from({ length: 50 }, (_, i) => createRequest(i));

      const startTime = performance.now();
      const promises = requests.map(async (request, index) => {
        const requestStartTime = performance.now();
        const response = await POST(request);
        const responseTime = performance.now() - requestStartTime;
        return { response, responseTime, index };
      });

      const results = await Promise.all(promises);
      const totalTime = performance.now() - startTime;

      // All requests should complete successfully
      results.forEach(({ response, index }) => {
        expect(response.status).toBe(202);
        expect(response.headers.get('X-Correlation-ID')).toBeDefined();
      });

      // 95th percentile should be under 150ms
      const sortedResponseTimes = results.map(r => r.responseTime).sort((a, b) => a - b);
      const p95Index = Math.floor(sortedResponseTimes.length * 0.95);
      const p95ResponseTime = sortedResponseTimes[p95Index];
      expect(p95ResponseTime).toBeLessThan(150);

      // Average response time should remain reasonable
      const averageResponseTime = results.reduce((sum, { responseTime }) => sum + responseTime, 0) / results.length;
      expect(averageResponseTime).toBeLessThan(100);

      console.log(`Load test results:
        - Total requests: ${results.length}
        - Total time: ${totalTime.toFixed(2)}ms
        - Average response time: ${averageResponseTime.toFixed(2)}ms
        - 95th percentile: ${p95ResponseTime.toFixed(2)}ms
        - Min response time: ${Math.min(...sortedResponseTimes).toFixed(2)}ms
        - Max response time: ${Math.max(...sortedResponseTimes).toFixed(2)}ms
      `);
    });

    test('should handle mixed request types concurrently', async () => {
      const intentPayload = {
        originalDetectIntentRequest: {
          payload: {
            inbox_id: '4',
            contact_phone: '+5511999999999',
            interaction_type: 'intent',
            wamid: 'wamid.intent',
            whatsapp_api_key: 'test-api-key',
            phone_number_id: '123456789',
            business_id: 'business123',
            contact_source: 'chatwit',
            message_id: 12345,
            account_id: 1,
            account_name: 'Test Account',
          },
        },
        queryResult: {
          intent: {
            displayName: 'mixed.intent',
          },
        },
      };

      const buttonPayload = {
        originalDetectIntentRequest: {
          payload: {
            inbox_id: '4',
            contact_phone: '+5511999999999',
            interaction_type: 'button_reply',
            wamid: 'wamid.button',
            whatsapp_api_key: 'test-api-key',
            phone_number_id: '123456789',
            business_id: 'business123',
            contact_source: 'chatwit',
            message_id: 12345,
            account_id: 1,
            account_name: 'Test Account',
            interactive: {
              type: 'button_reply',
              button_reply: {
                id: 'btn_mixed_test',
                title: 'Mixed Test',
              },
            },
          },
        },
        queryResult: {
          intent: {
            displayName: 'Default Fallback Intent',
          },
        },
      };

      const createIntentRequest = (id: number) => ({
        json: jest.fn().mockResolvedValue({
          ...intentPayload,
          originalDetectIntentRequest: {
            ...intentPayload.originalDetectIntentRequest,
            payload: {
              ...intentPayload.originalDetectIntentRequest.payload,
              wamid: `wamid.intent${id}`,
            },
          },
        }),
      } as any);

      const createButtonRequest = (id: number) => ({
        json: jest.fn().mockResolvedValue({
          ...buttonPayload,
          originalDetectIntentRequest: {
            ...buttonPayload.originalDetectIntentRequest,
            payload: {
              ...buttonPayload.originalDetectIntentRequest.payload,
              wamid: `wamid.button${id}`,
            },
          },
        }),
      } as any);

      // Create mixed requests: 15 intents + 15 buttons
      const intentRequests = Array.from({ length: 15 }, (_, i) => createIntentRequest(i));
      const buttonRequests = Array.from({ length: 15 }, (_, i) => createButtonRequest(i));
      const allRequests = [...intentRequests, ...buttonRequests];

      // Shuffle requests to simulate real-world mixed load
      for (let i = allRequests.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [allRequests[i], allRequests[j]] = [allRequests[j], allRequests[i]];
      }

      const promises = allRequests.map(async (request, index) => {
        const startTime = performance.now();
        const response = await POST(request);
        const responseTime = performance.now() - startTime;
        return { response, responseTime, index };
      });

      const results = await Promise.all(promises);

      // All requests should complete successfully
      results.forEach(({ response }) => {
        expect(response.status).toBe(202);
        expect(response.headers.get('X-Correlation-ID')).toBeDefined();
      });

      // Performance should remain consistent across request types
      const averageResponseTime = results.reduce((sum, { responseTime }) => sum + responseTime, 0) / results.length;
      expect(averageResponseTime).toBeLessThan(100);

      // No request should take longer than 150ms
      results.forEach(({ responseTime }) => {
        expect(responseTime).toBeLessThan(150);
      });
    });
  });

  describe('Memory and Resource Usage', () => {
    test('should not leak memory during sustained load', async () => {
      const mockPayload = {
        originalDetectIntentRequest: {
          payload: {
            inbox_id: '4',
            contact_phone: '+5511999999999',
            interaction_type: 'intent',
            wamid: 'wamid.memory.test',
            whatsapp_api_key: 'test-api-key',
            phone_number_id: '123456789',
            business_id: 'business123',
            contact_source: 'chatwit',
            message_id: 12345,
            account_id: 1,
            account_name: 'Test Account',
          },
        },
        queryResult: {
          intent: {
            displayName: 'memory.test.intent',
          },
        },
      };

      const createRequest = (id: number) => ({
        json: jest.fn().mockResolvedValue({
          ...mockPayload,
          originalDetectIntentRequest: {
            ...mockPayload.originalDetectIntentRequest,
            payload: {
              ...mockPayload.originalDetectIntentRequest.payload,
              wamid: `wamid.memory${id}`,
            },
          },
        }),
      } as any);

      // Measure initial memory usage
      const initialMemory = process.memoryUsage();

      // Process requests in batches to simulate sustained load
      const batchSize = 20;
      const numBatches = 5;
      const allResponseTimes: number[] = [];

      for (let batch = 0; batch < numBatches; batch++) {
        const requests = Array.from({ length: batchSize }, (_, i) => createRequest(batch * batchSize + i));

        const promises = requests.map(async (request) => {
          const startTime = performance.now();
          const response = await POST(request);
          const responseTime = performance.now() - startTime;
          return { response, responseTime };
        });

        const results = await Promise.all(promises);

        // Verify all requests completed successfully
        results.forEach(({ response }) => {
          expect(response.status).toBe(202);
        });

        // Collect response times
        allResponseTimes.push(...results.map(r => r.responseTime));

        // Force garbage collection if available
        if (global.gc) {
          global.gc();
        }

        // Small delay between batches
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      // Measure final memory usage
      const finalMemory = process.memoryUsage();

      // Memory growth should be reasonable (less than 50MB)
      const memoryGrowth = finalMemory.heapUsed - initialMemory.heapUsed;
      expect(memoryGrowth).toBeLessThan(50 * 1024 * 1024); // 50MB

      // Performance should remain consistent across batches
      const averageResponseTime = allResponseTimes.reduce((sum, time) => sum + time, 0) / allResponseTimes.length;
      expect(averageResponseTime).toBeLessThan(100);

      // Performance should not degrade significantly over time
      const firstBatchAvg = allResponseTimes.slice(0, batchSize).reduce((sum, time) => sum + time, 0) / batchSize;
      const lastBatchAvg = allResponseTimes.slice(-batchSize).reduce((sum, time) => sum + time, 0) / batchSize;
      const performanceDegradation = lastBatchAvg - firstBatchAvg;
      expect(performanceDegradation).toBeLessThan(50); // Less than 50ms degradation

      console.log(`Memory test results:
        - Total requests: ${allResponseTimes.length}
        - Memory growth: ${(memoryGrowth / 1024 / 1024).toFixed(2)}MB
        - Average response time: ${averageResponseTime.toFixed(2)}ms
        - First batch avg: ${firstBatchAvg.toFixed(2)}ms
        - Last batch avg: ${lastBatchAvg.toFixed(2)}ms
        - Performance degradation: ${performanceDegradation.toFixed(2)}ms
      `);
    });

    test('should handle large payloads efficiently', async () => {
      // Create a large payload with extensive metadata
      const largePayload = {
        originalDetectIntentRequest: {
          payload: {
            inbox_id: '4',
            contact_phone: '+5511999999999',
            interaction_type: 'intent',
            wamid: 'wamid.large.payload.test',
            whatsapp_api_key: 'test-api-key',
            phone_number_id: '123456789',
            business_id: 'business123',
            contact_source: 'chatwit',
            message_id: 12345,
            account_id: 1,
            account_name: 'Test Account',
            // Add large metadata to simulate real-world complex payloads
            metadata: {
              userAgent: 'WhatsApp/2.21.15.15 A',
              deviceInfo: {
                platform: 'android',
                version: '11',
                model: 'SM-G991B',
                manufacturer: 'Samsung',
              },
              messageHistory: Array.from({ length: 100 }, (_, i) => ({
                id: `msg_${i}`,
                timestamp: Date.now() - i * 60000,
                type: 'text',
                content: `Message ${i} with some content that makes the payload larger`,
              })),
              customFields: Object.fromEntries(
                Array.from({ length: 50 }, (_, i) => [`field_${i}`, `value_${i}_with_some_additional_data`])
              ),
            },
          },
        },
        queryResult: {
          intent: {
            displayName: 'large.payload.intent',
          },
          parameters: Object.fromEntries(
            Array.from({ length: 20 }, (_, i) => [`param_${i}`, `parameter_value_${i}`])
          ),
        },
      };

      const mockRequest = {
        json: jest.fn().mockResolvedValue(largePayload),
      } as any;

      const startTime = performance.now();
      const response = await POST(mockRequest);
      const responseTime = performance.now() - startTime;

      expect(response.status).toBe(202);
      expect(responseTime).toBeLessThan(150); // Allow slightly more time for large payloads
      expect(response.headers.get('X-Correlation-ID')).toBeDefined();

      // Verify the payload was processed correctly
      const responseData = await response.json();
      expect(responseData.correlationId).toBeDefined();
    });
  });

  describe('Error Handling Performance', () => {
    test('should handle errors quickly without blocking', async () => {
      // Test various error scenarios
      const errorScenarios = [
        {
          name: 'JSON Parse Error',
          request: {
            json: jest.fn().mockRejectedValue(new Error('Invalid JSON')),
          },
        },
        {
          name: 'Missing Required Fields',
          request: {
            json: jest.fn().mockResolvedValue({
              originalDetectIntentRequest: {
                payload: {}, // Missing required fields
              },
            }),
          },
        },
        {
          name: 'Null Payload',
          request: {
            json: jest.fn().mockResolvedValue(null),
          },
        },
        {
          name: 'Malformed Structure',
          request: {
            json: jest.fn().mockResolvedValue({
              invalidStructure: true,
            }),
          },
        },
      ];

      const results = await Promise.all(
        errorScenarios.map(async ({ name, request }) => {
          const startTime = performance.now();
          const response = await POST(request as any);
          const responseTime = performance.now() - startTime;
          return { name, response, responseTime };
        })
      );

      // All error scenarios should complete quickly
      results.forEach(({ name, response, responseTime }) => {
        expect(response.status).toBe(202);
        expect(responseTime).toBeLessThan(100);
        expect(response.headers.get('X-Correlation-ID')).toBeDefined();
      });

      // Average error handling time should be very fast
      const averageErrorTime = results.reduce((sum, { responseTime }) => sum + responseTime, 0) / results.length;
      expect(averageErrorTime).toBeLessThan(50);
    });

    test('should maintain performance under mixed success/error load', async () => {
      const successPayload = {
        originalDetectIntentRequest: {
          payload: {
            inbox_id: '4',
            contact_phone: '+5511999999999',
            interaction_type: 'intent',
            wamid: 'wamid.success',
            whatsapp_api_key: 'test-api-key',
            phone_number_id: '123456789',
            business_id: 'business123',
            contact_source: 'chatwit',
            message_id: 12345,
            account_id: 1,
            account_name: 'Test Account',
          },
        },
        queryResult: {
          intent: {
            displayName: 'success.intent',
          },
        },
      };

      const createSuccessRequest = (id: number) => ({
        json: jest.fn().mockResolvedValue({
          ...successPayload,
          originalDetectIntentRequest: {
            ...successPayload.originalDetectIntentRequest,
            payload: {
              ...successPayload.originalDetectIntentRequest.payload,
              wamid: `wamid.success${id}`,
            },
          },
        }),
      } as any);

      const createErrorRequest = (id: number) => ({
        json: jest.fn().mockRejectedValue(new Error(`Error ${id}`)),
      } as any);

      // Create mixed requests: 70% success, 30% errors
      const successRequests = Array.from({ length: 14 }, (_, i) => createSuccessRequest(i));
      const errorRequests = Array.from({ length: 6 }, (_, i) => createErrorRequest(i));
      const allRequests = [...successRequests, ...errorRequests];

      // Shuffle to simulate real-world mixed load
      for (let i = allRequests.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [allRequests[i], allRequests[j]] = [allRequests[j], allRequests[i]];
      }

      const promises = allRequests.map(async (request, index) => {
        const startTime = performance.now();
        const response = await POST(request);
        const responseTime = performance.now() - startTime;
        return { response, responseTime, index };
      });

      const results = await Promise.all(promises);

      // All requests should complete with 202 status
      results.forEach(({ response }) => {
        expect(response.status).toBe(202);
        expect(response.headers.get('X-Correlation-ID')).toBeDefined();
      });

      // Performance should remain good despite errors
      const averageResponseTime = results.reduce((sum, { responseTime }) => sum + responseTime, 0) / results.length;
      expect(averageResponseTime).toBeLessThan(100);

      // No request should take longer than 150ms
      results.forEach(({ responseTime }) => {
        expect(responseTime).toBeLessThan(150);
      });
    });
  });

  describe('Correlation ID Performance', () => {
    test('should generate correlation IDs quickly', async () => {
      const { generateCorrelationId } = await import('@/lib/queue/mtf-diamante-webhook.queue');

      const iterations = 1000;
      const startTime = performance.now();

      const correlationIds = Array.from({ length: iterations }, () => generateCorrelationId());

      const generationTime = performance.now() - startTime;

      // Should generate 1000 IDs in less than 10ms
      expect(generationTime).toBeLessThan(10);

      // All IDs should be unique
      const uniqueIds = new Set(correlationIds);
      expect(uniqueIds.size).toBe(iterations);

      // IDs should follow expected format
      correlationIds.forEach(id => {
        expect(id).toMatch(/^\d+-[a-z0-9]+$/);
      });

      console.log(`Correlation ID generation:
        - Generated ${iterations} IDs in ${generationTime.toFixed(2)}ms
        - Average time per ID: ${(generationTime / iterations).toFixed(4)}ms
        - All IDs unique: ${uniqueIds.size === iterations}
      `);
    });

    test('should include correlation ID in response headers efficiently', async () => {
      const mockPayload = {
        originalDetectIntentRequest: {
          payload: {
            inbox_id: '4',
            contact_phone: '+5511999999999',
            interaction_type: 'intent',
            wamid: 'wamid.correlation.test',
            whatsapp_api_key: 'test-api-key',
            phone_number_id: '123456789',
            business_id: 'business123',
            contact_source: 'chatwit',
            message_id: 12345,
            account_id: 1,
            account_name: 'Test Account',
          },
        },
        queryResult: {
          intent: {
            displayName: 'correlation.test.intent',
          },
        },
      };

      const requests = Array.from({ length: 20 }, (_, i) => ({
        json: jest.fn().mockResolvedValue({
          ...mockPayload,
          originalDetectIntentRequest: {
            ...mockPayload.originalDetectIntentRequest,
            payload: {
              ...mockPayload.originalDetectIntentRequest.payload,
              wamid: `wamid.correlation${i}`,
            },
          },
        }),
      } as any));

      const promises = requests.map(async (request) => {
        const startTime = performance.now();
        const response = await POST(request);
        const responseTime = performance.now() - startTime;
        const responseData = await response.json();
        return {
          response,
          responseTime,
          correlationId: responseData.correlationId,
          headerCorrelationId: response.headers.get('X-Correlation-ID'),
        };
      });

      const results = await Promise.all(promises);

      // All requests should have correlation IDs
      results.forEach(({ response, correlationId, headerCorrelationId }) => {
        expect(response.status).toBe(202);
        expect(correlationId).toBeDefined();
        expect(headerCorrelationId).toBeDefined();
        expect(correlationId).toBe(headerCorrelationId);
      });

      // All correlation IDs should be unique
      const allCorrelationIds = results.map(r => r.correlationId);
      const uniqueCorrelationIds = new Set(allCorrelationIds);
      expect(uniqueCorrelationIds.size).toBe(allCorrelationIds.length);

      // Performance should not be affected by correlation ID handling
      const averageResponseTime = results.reduce((sum, { responseTime }) => sum + responseTime, 0) / results.length;
      expect(averageResponseTime).toBeLessThan(100);
    });
  });
});