/**
 * SocialWise Flow Performance Tests
 * Tests for sub-400ms p95 response time requirement and band-specific latency targets
 * Requirements: 1.1, 4.1, 4.2, 4.3
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
  hget: jest.fn(),
  hset: jest.fn(),
  expire: jest.fn(),
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
  agente: {
    findFirst: jest.fn(),
  },
};

const mockOpenAI = {
  generateWarmupButtons: jest.fn(),
  routerLLM: jest.fn(),
  generateShortTitlesBatch: jest.fn(),
  withDeadlineAbort: jest.fn(),
};

jest.mock('@/lib/redis', () => ({
  connection: mockRedis,
}));

jest.mock('@/lib/connections', () => ({
  getPrismaInstance: () => mockPrisma,
  getRedisInstance: () => mockRedis,
}));

jest.mock('@/services/openai', () => ({
  openaiService: mockOpenAI,
}));

// Mock SocialWise Flow services
jest.mock('@/lib/socialwise-flow/classification', () => ({
  classifyIntent: jest.fn(),
}));

jest.mock('@/lib/socialwise/assistant', () => ({
  getAssistantForInbox: jest.fn(),
}));

jest.mock('@/lib/socialwise/templates', () => ({
  buildWhatsAppByIntentRaw: jest.fn(),
  buildWhatsAppByGlobalIntent: jest.fn(),
}));

describe('SocialWise Flow Performance Tests', () => {
  let POST: any;
  let mockClassifyIntent: jest.MockedFunction<any>;
  let mockGetAssistantForInbox: jest.MockedFunction<any>;
  let mockBuildWhatsAppByIntentRaw: jest.MockedFunction<any>;

  beforeAll(async () => {
    // Import the webhook handler after mocks are set up
    const module = await import('@/app/api/integrations/webhooks/socialwiseflow/route');
    POST = module.POST;

    // Get mock functions
    const { classifyIntent } = await import('@/lib/socialwise-flow/classification');
    const { getAssistantForInbox } = await import('@/lib/socialwise/assistant');
    const { buildWhatsAppByIntentRaw } = await import('@/lib/socialwise/templates');
    
    mockClassifyIntent = classifyIntent as jest.MockedFunction<any>;
    mockGetAssistantForInbox = getAssistantForInbox as jest.MockedFunction<any>;
    mockBuildWhatsAppByIntentRaw = buildWhatsAppByIntentRaw as jest.MockedFunction<any>;
  });

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup fast mock responses
    mockRedis.get.mockResolvedValue(null);
    mockRedis.setex.mockResolvedValue('OK');
    mockRedis.del.mockResolvedValue(1);
    mockRedis.exists.mockResolvedValue(0);
    mockRedis.ping.mockResolvedValue('PONG');
    mockRedis.hget.mockResolvedValue(null);
    mockRedis.hset.mockResolvedValue(1);
    mockRedis.expire.mockResolvedValue(1);
    mockRedis.pipeline.mockReturnValue({
      setex: jest.fn().mockReturnThis(),
      hset: jest.fn().mockReturnThis(),
      expire: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([]),
    });

    mockPrisma.chatwitInbox.findFirst.mockResolvedValue({
      id: 'inbox-123',
      inboxId: '4',
      nome: 'Test Inbox',
      usuarioChatwit: {
        appUserId: 'user-123',
        chatwitAccountId: 1,
      },
    });

    mockGetAssistantForInbox.mockResolvedValue({
      id: 'agent-123',
      model: 'gpt-4o-mini',
      instructions: 'You are a legal assistant',
      embedipreview: true,
    });

    // Setup OpenAI mocks with fast responses
    mockOpenAI.withDeadlineAbort.mockImplementation(async (fn, timeout) => {
      return await fn();
    });

    mockOpenAI.generateWarmupButtons.mockResolvedValue({
      response_text: 'Como posso ajudar com sua questão jurídica?',
      buttons: [
        { title: 'Recurso OAB', payload: '@recurso_oab' },
        { title: 'Inscrição', payload: '@inscricao' },
        { title: 'Falar com atendente', payload: 'handoff:human' },
      ],
    });

    mockOpenAI.routerLLM.mockResolvedValue({
      mode: 'intent',
      intent_payload: '@recurso_oab',
      response_text: 'Vou ajudar com seu recurso na OAB.',
    });

    mockBuildWhatsAppByIntentRaw.mockResolvedValue({
      whatsapp: {
        type: 'interactive',
        interactive: {
          type: 'button',
          body: { text: 'Recurso OAB processado com sucesso.' },
          action: {
            buttons: [
              { type: 'reply', reply: { id: 'btn_continue', title: 'Continuar' } },
            ],
          },
        },
      },
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('HARD Band Performance (<120ms)', () => {
    beforeEach(() => {
      // Mock HARD band classification (≥0.80 score)
      mockClassifyIntent.mockResolvedValue({
        band: 'HARD',
        score: 0.85,
        candidates: [
          { slug: 'recurso_oab', name: 'Recurso OAB', score: 0.85 },
        ],
        strategy: 'direct_map',
        metrics: { embedding_ms: 15, route_total_ms: 50 },
      });
    });

    test('should respond within 120ms for HARD band classification', async () => {
      const mockPayload = {
        session_id: 'session-123',
        context: {
          'socialwise-chatwit': {
            inbox_data: { id: '4', name: 'Test Inbox', channel_type: 'whatsapp' },
            account_data: { id: '1' },
            whatsapp_phone_number_id: '123456789',
            whatsapp_business_id: 'business123',
            wamid: 'wamid.hard123',
          },
        },
        message: 'quero fazer um recurso na oab',
        channel_type: 'whatsapp',
      };

      const mockRequest = {
        headers: {
          get: jest.fn().mockReturnValue(null),
        },
        text: jest.fn().mockResolvedValue(JSON.stringify(mockPayload)),
      } as any;

      const startTime = performance.now();
      const response = await POST(mockRequest);
      const responseTime = performance.now() - startTime;

      expect(response.status).toBe(200);
      expect(responseTime).toBeLessThan(120); // HARD band target: <120ms
      
      const responseData = await response.json();
      expect(responseData.whatsapp).toBeDefined();
    });

    test('should handle 50 concurrent HARD band requests under 120ms each', async () => {
      const createRequest = (id: number) => {
        const mockPayload = {
          session_id: `session-hard-${id}`,
          context: {
            'socialwise-chatwit': {
              inbox_data: { id: '4', name: 'Test Inbox', channel_type: 'whatsapp' },
              account_data: { id: '1' },
              whatsapp_phone_number_id: '123456789',
              whatsapp_business_id: 'business123',
              wamid: `wamid.hard${id}`,
            },
          },
          message: `recurso oab ${id}`,
          channel_type: 'whatsapp',
        };

        return {
          headers: {
            get: jest.fn().mockReturnValue(null),
          },
          text: jest.fn().mockResolvedValue(JSON.stringify(mockPayload)),
        } as any;
      };

      const requests = Array.from({ length: 50 }, (_, i) => createRequest(i));

      const promises = requests.map(async (request, index) => {
        const startTime = performance.now();
        const response = await POST(request);
        const responseTime = performance.now() - startTime;
        return { response, responseTime, index };
      });

      const results = await Promise.all(promises);

      // All requests should complete successfully
      results.forEach(({ response, responseTime, index }) => {
        expect(response.status).toBe(200);
        expect(responseTime).toBeLessThan(120); // HARD band requirement
      });

      // Calculate performance statistics
      const responseTimes = results.map(r => r.responseTime);
      const averageTime = responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length;
      const p95Time = responseTimes.sort((a, b) => a - b)[Math.floor(responseTimes.length * 0.95)];

      expect(averageTime).toBeLessThan(80); // Should be well under limit
      expect(p95Time).toBeLessThan(120); // P95 should meet requirement

      console.log(`HARD band concurrent test results:
        - Requests: ${results.length}
        - Average: ${averageTime.toFixed(2)}ms
        - P95: ${p95Time.toFixed(2)}ms
        - Max: ${Math.max(...responseTimes).toFixed(2)}ms
        - Min: ${Math.min(...responseTimes).toFixed(2)}ms
      `);
    });

    test('should maintain HARD band performance with cache hits', async () => {
      // Setup cache hit scenario
      mockRedis.get.mockResolvedValue(JSON.stringify({
        whatsapp: {
          type: 'interactive',
          interactive: {
            type: 'button',
            body: { text: 'Cached response for recurso OAB.' },
          },
        },
      }));

      const mockPayload = {
        session_id: 'session-cached',
        context: {
          'socialwise-chatwit': {
            inbox_data: { id: '4', name: 'Test Inbox', channel_type: 'whatsapp' },
            account_data: { id: '1' },
            whatsapp_phone_number_id: '123456789',
            whatsapp_business_id: 'business123',
            wamid: 'wamid.cached123',
          },
        },
        message: 'recurso oab cached',
        channel_type: 'whatsapp',
      };

      const mockRequest = {
        headers: {
          get: jest.fn().mockReturnValue(null),
        },
        text: jest.fn().mockResolvedValue(JSON.stringify(mockPayload)),
      } as any;

      const startTime = performance.now();
      const response = await POST(mockRequest);
      const responseTime = performance.now() - startTime;

      expect(response.status).toBe(200);
      expect(responseTime).toBeLessThan(50); // Cache hits should be very fast
    });
  });

  describe('SOFT Band Performance (<300ms)', () => {
    beforeEach(() => {
      // Mock SOFT band classification (0.65-0.79 score)
      mockClassifyIntent.mockResolvedValue({
        band: 'SOFT',
        score: 0.72,
        candidates: [
          { slug: 'recurso_oab', name: 'Recurso OAB', score: 0.72 },
          { slug: 'inscricao', name: 'Inscrição', score: 0.68 },
          { slug: 'consulta', name: 'Consulta', score: 0.65 },
        ],
        strategy: 'warmup_buttons',
        metrics: { embedding_ms: 25, route_total_ms: 200 },
      });
    });

    test('should respond within 300ms for SOFT band classification', async () => {
      const mockPayload = {
        session_id: 'session-soft',
        context: {
          'socialwise-chatwit': {
            inbox_data: { id: '4', name: 'Test Inbox', channel_type: 'whatsapp' },
            account_data: { id: '1' },
            whatsapp_phone_number_id: '123456789',
            whatsapp_business_id: 'business123',
            wamid: 'wamid.soft123',
          },
        },
        message: 'preciso de ajuda com algo da oab',
        channel_type: 'whatsapp',
      };

      const mockRequest = {
        headers: {
          get: jest.fn().mockReturnValue(null),
        },
        text: jest.fn().mockResolvedValue(JSON.stringify(mockPayload)),
      } as any;

      const startTime = performance.now();
      const response = await POST(mockRequest);
      const responseTime = performance.now() - startTime;

      expect(response.status).toBe(200);
      expect(responseTime).toBeLessThan(300); // SOFT band target: <300ms
      
      const responseData = await response.json();
      expect(responseData.whatsapp).toBeDefined();
      expect(responseData.whatsapp.interactive.action.buttons).toHaveLength(3);
    });

    test('should handle LLM timeout gracefully in SOFT band', async () => {
      // Mock LLM timeout
      mockOpenAI.generateWarmupButtons.mockRejectedValue(new Error('Timeout'));

      const mockPayload = {
        session_id: 'session-timeout',
        context: {
          'socialwise-chatwit': {
            inbox_data: { id: '4', name: 'Test Inbox', channel_type: 'whatsapp' },
            account_data: { id: '1' },
            whatsapp_phone_number_id: '123456789',
            whatsapp_business_id: 'business123',
            wamid: 'wamid.timeout123',
          },
        },
        message: 'ajuda com questão jurídica',
        channel_type: 'whatsapp',
      };

      const mockRequest = {
        headers: {
          get: jest.fn().mockReturnValue(null),
        },
        text: jest.fn().mockResolvedValue(JSON.stringify(mockPayload)),
      } as any;

      const startTime = performance.now();
      const response = await POST(mockRequest);
      const responseTime = performance.now() - startTime;

      expect(response.status).toBe(200);
      expect(responseTime).toBeLessThan(200); // Should fallback quickly
      
      const responseData = await response.json();
      expect(responseData.whatsapp || responseData.text).toBeDefined();
    });

    test('should maintain SOFT band performance under concurrent load', async () => {
      const createRequest = (id: number) => {
        const mockPayload = {
          session_id: `session-soft-${id}`,
          context: {
            'socialwise-chatwit': {
              inbox_data: { id: '4', name: 'Test Inbox', channel_type: 'whatsapp' },
              account_data: { id: '1' },
              whatsapp_phone_number_id: '123456789',
              whatsapp_business_id: 'business123',
              wamid: `wamid.soft${id}`,
            },
          },
          message: `questão jurídica ${id}`,
          channel_type: 'whatsapp',
        };

        return {
          headers: {
            get: jest.fn().mockReturnValue(null),
          },
          text: jest.fn().mockResolvedValue(JSON.stringify(mockPayload)),
        } as any;
      };

      const requests = Array.from({ length: 20 }, (_, i) => createRequest(i));

      const promises = requests.map(async (request, index) => {
        const startTime = performance.now();
        const response = await POST(request);
        const responseTime = performance.now() - startTime;
        return { response, responseTime, index };
      });

      const results = await Promise.all(promises);

      // All requests should complete within SOFT band limits
      results.forEach(({ response, responseTime }) => {
        expect(response.status).toBe(200);
        expect(responseTime).toBeLessThan(300);
      });

      const responseTimes = results.map(r => r.responseTime);
      const averageTime = responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length;
      const p95Time = responseTimes.sort((a, b) => a - b)[Math.floor(responseTimes.length * 0.95)];

      expect(averageTime).toBeLessThan(250);
      expect(p95Time).toBeLessThan(300);

      console.log(`SOFT band concurrent test results:
        - Requests: ${results.length}
        - Average: ${averageTime.toFixed(2)}ms
        - P95: ${p95Time.toFixed(2)}ms
      `);
    });
  });

  describe('LOW Band Performance (<200ms)', () => {
    beforeEach(() => {
      // Mock LOW band classification (<0.65 score)
      mockClassifyIntent.mockResolvedValue({
        band: 'LOW',
        score: 0.45,
        candidates: [],
        strategy: 'domain_topics',
        metrics: { embedding_ms: 20, route_total_ms: 100 },
      });
    });

    test('should respond within 200ms for LOW band classification', async () => {
      const mockPayload = {
        session_id: 'session-low',
        context: {
          'socialwise-chatwit': {
            inbox_data: { id: '4', name: 'Test Inbox', channel_type: 'whatsapp' },
            account_data: { id: '1' },
            whatsapp_phone_number_id: '123456789',
            whatsapp_business_id: 'business123',
            wamid: 'wamid.low123',
          },
        },
        message: 'oi tudo bem',
        channel_type: 'whatsapp',
      };

      const mockRequest = {
        headers: {
          get: jest.fn().mockReturnValue(null),
        },
        text: jest.fn().mockResolvedValue(JSON.stringify(mockPayload)),
      } as any;

      const startTime = performance.now();
      const response = await POST(mockRequest);
      const responseTime = performance.now() - startTime;

      expect(response.status).toBe(200);
      expect(responseTime).toBeLessThan(200); // LOW band target: <200ms
      
      const responseData = await response.json();
      expect(responseData.whatsapp || responseData.text).toBeDefined();
    });

    test('should provide deterministic fallback topics quickly', async () => {
      const mockPayload = {
        session_id: 'session-fallback',
        context: {
          'socialwise-chatwit': {
            inbox_data: { id: '4', name: 'Test Inbox', channel_type: 'whatsapp' },
            account_data: { id: '1' },
            whatsapp_phone_number_id: '123456789',
            whatsapp_business_id: 'business123',
            wamid: 'wamid.fallback123',
          },
        },
        message: 'xyz random text',
        channel_type: 'whatsapp',
      };

      const mockRequest = {
        headers: {
          get: jest.fn().mockReturnValue(null),
        },
        text: jest.fn().mockResolvedValue(JSON.stringify(mockPayload)),
      } as any;

      const startTime = performance.now();
      const response = await POST(mockRequest);
      const responseTime = performance.now() - startTime;

      expect(response.status).toBe(200);
      expect(responseTime).toBeLessThan(150); // Should be very fast for deterministic responses
      
      const responseData = await response.json();
      expect(responseData.whatsapp || responseData.text).toBeDefined();
    });
  });

  describe('ROUTER Band Performance (<300ms)', () => {
    beforeEach(() => {
      // Mock embedipreview=false scenario
      mockGetAssistantForInbox.mockResolvedValue({
        id: 'agent-123',
        model: 'gpt-4o-mini',
        instructions: 'You are a legal assistant',
        embedipreview: false, // Router mode
      });
    });

    test('should respond within 300ms for ROUTER band processing', async () => {
      const mockPayload = {
        session_id: 'session-router',
        context: {
          'socialwise-chatwit': {
            inbox_data: { id: '4', name: 'Test Inbox', channel_type: 'whatsapp' },
            account_data: { id: '1' },
            whatsapp_phone_number_id: '123456789',
            whatsapp_business_id: 'business123',
            wamid: 'wamid.router123',
          },
        },
        message: 'preciso de ajuda jurídica',
        channel_type: 'whatsapp',
      };

      const mockRequest = {
        headers: {
          get: jest.fn().mockReturnValue(null),
        },
        text: jest.fn().mockResolvedValue(JSON.stringify(mockPayload)),
      } as any;

      const startTime = performance.now();
      const response = await POST(mockRequest);
      const responseTime = performance.now() - startTime;

      expect(response.status).toBe(200);
      expect(responseTime).toBeLessThan(300); // ROUTER band target: <300ms
      
      const responseData = await response.json();
      expect(responseData.whatsapp).toBeDefined();
    });

    test('should handle router LLM decisions efficiently', async () => {
      // Mock chat mode decision
      mockOpenAI.routerLLM.mockResolvedValue({
        mode: 'chat',
        text: 'Posso ajudar com sua questão jurídica. Qual é o problema específico?',
        buttons: [
          { title: 'Direito Civil', payload: '@direito_civil' },
          { title: 'Direito Penal', payload: '@direito_penal' },
        ],
      });

      const mockPayload = {
        session_id: 'session-chat',
        context: {
          'socialwise-chatwit': {
            inbox_data: { id: '4', name: 'Test Inbox', channel_type: 'whatsapp' },
            account_data: { id: '1' },
            whatsapp_phone_number_id: '123456789',
            whatsapp_business_id: 'business123',
            wamid: 'wamid.chat123',
          },
        },
        message: 'tenho uma dúvida complexa',
        channel_type: 'whatsapp',
      };

      const mockRequest = {
        headers: {
          get: jest.fn().mockReturnValue(null),
        },
        text: jest.fn().mockResolvedValue(JSON.stringify(mockPayload)),
      } as any;

      const startTime = performance.now();
      const response = await POST(mockRequest);
      const responseTime = performance.now() - startTime;

      expect(response.status).toBe(200);
      expect(responseTime).toBeLessThan(300);
      
      const responseData = await response.json();
      expect(responseData.whatsapp.interactive.action.buttons).toHaveLength(2);
    });
  });

  describe('Abort Mechanism Effectiveness', () => {
    test('should abort LLM calls after deadline', async () => {
      let abortCalled = false;
      
      // Mock LLM call that takes too long
      mockOpenAI.withDeadlineAbort.mockImplementation(async (fn, timeout) => {
        return new Promise((resolve, reject) => {
          const abortController = new AbortController();
          
          // Simulate timeout
          setTimeout(() => {
            abortCalled = true;
            abortController.abort();
            reject(new Error('AbortError'));
          }, timeout || 250);
          
          // Simulate slow operation
          setTimeout(() => {
            resolve(fn());
          }, 500); // Longer than timeout
        });
      });

      const mockPayload = {
        session_id: 'session-abort',
        context: {
          'socialwise-chatwit': {
            inbox_data: { id: '4', name: 'Test Inbox', channel_type: 'whatsapp' },
            account_data: { id: '1' },
            whatsapp_phone_number_id: '123456789',
            whatsapp_business_id: 'business123',
            wamid: 'wamid.abort123',
          },
        },
        message: 'test abort mechanism',
        channel_type: 'whatsapp',
      };

      const mockRequest = {
        headers: {
          get: jest.fn().mockReturnValue(null),
        },
        text: jest.fn().mockResolvedValue(JSON.stringify(mockPayload)),
      } as any;

      const startTime = performance.now();
      const response = await POST(mockRequest);
      const responseTime = performance.now() - startTime;

      expect(response.status).toBe(200);
      expect(responseTime).toBeLessThan(400); // Should fallback quickly
      expect(abortCalled).toBe(true); // Abort should have been called
    });

    test('should prevent resource waste on aborted requests', async () => {
      let resourcesUsed = 0;
      
      mockOpenAI.withDeadlineAbort.mockImplementation(async (fn, timeout) => {
        const abortController = new AbortController();
        
        setTimeout(() => {
          abortController.abort();
        }, timeout || 250);
        
        try {
          const result = await fn();
          resourcesUsed++; // This should not happen if aborted
          return result;
        } catch (error) {
          if (error.name === 'AbortError') {
            return null; // Proper abort handling
          }
          throw error;
        }
      });

      const requests = Array.from({ length: 10 }, (_, i) => {
        const mockPayload = {
          session_id: `session-resource-${i}`,
          context: {
            'socialwise-chatwit': {
              inbox_data: { id: '4', name: 'Test Inbox', channel_type: 'whatsapp' },
              account_data: { id: '1' },
              whatsapp_phone_number_id: '123456789',
              whatsapp_business_id: 'business123',
              wamid: `wamid.resource${i}`,
            },
          },
          message: `test resource ${i}`,
          channel_type: 'whatsapp',
        };

        return {
          headers: {
            get: jest.fn().mockReturnValue(null),
          },
          text: jest.fn().mockResolvedValue(JSON.stringify(mockPayload)),
        } as any;
      });

      const promises = requests.map(request => POST(request));
      const results = await Promise.all(promises);

      // All requests should complete with fallback responses
      results.forEach(response => {
        expect(response.status).toBe(200);
      });

      // Resources should not be wasted on aborted requests
      expect(resourcesUsed).toBe(0);
    });
  });

  describe('Overall P95 Response Time Requirement', () => {
    test('should maintain sub-400ms p95 response time under mixed load', async () => {
      // Setup mixed band classifications
      let callCount = 0;
      mockClassifyIntent.mockImplementation(async () => {
        callCount++;
        const bands = [
          { band: 'HARD', score: 0.85, strategy: 'direct_map' },
          { band: 'SOFT', score: 0.72, strategy: 'warmup_buttons' },
          { band: 'LOW', score: 0.45, strategy: 'domain_topics' },
        ];
        
        const selected = bands[callCount % bands.length];
        return {
          ...selected,
          candidates: selected.band === 'HARD' ? [{ slug: 'recurso_oab', name: 'Recurso OAB', score: selected.score }] : [],
          metrics: { embedding_ms: 20, route_total_ms: 150 },
        };
      });

      const createRequest = (id: number) => {
        const mockPayload = {
          session_id: `session-mixed-${id}`,
          context: {
            'socialwise-chatwit': {
              inbox_data: { id: '4', name: 'Test Inbox', channel_type: 'whatsapp' },
              account_data: { id: '1' },
              whatsapp_phone_number_id: '123456789',
              whatsapp_business_id: 'business123',
              wamid: `wamid.mixed${id}`,
            },
          },
          message: `mixed load test ${id}`,
          channel_type: 'whatsapp',
        };

        return {
          headers: {
            get: jest.fn().mockReturnValue(null),
          },
          text: jest.fn().mockResolvedValue(JSON.stringify(mockPayload)),
        } as any;
      };

      // Test with 100 requests to get meaningful p95 statistics
      const requests = Array.from({ length: 100 }, (_, i) => createRequest(i));

      const promises = requests.map(async (request, index) => {
        const startTime = performance.now();
        const response = await POST(request);
        const responseTime = performance.now() - startTime;
        return { response, responseTime, index };
      });

      const results = await Promise.all(promises);

      // All requests should complete successfully
      results.forEach(({ response }) => {
        expect(response.status).toBe(200);
      });

      // Calculate performance statistics
      const responseTimes = results.map(r => r.responseTime).sort((a, b) => a - b);
      const p95Index = Math.floor(responseTimes.length * 0.95);
      const p95Time = responseTimes[p95Index];
      const averageTime = responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length;
      const maxTime = Math.max(...responseTimes);
      const minTime = Math.min(...responseTimes);

      // Main requirement: P95 should be under 400ms
      expect(p95Time).toBeLessThan(400);
      
      // Additional quality checks
      expect(averageTime).toBeLessThan(300); // Average should be well under limit
      expect(maxTime).toBeLessThan(500); // Even worst case should be reasonable

      console.log(`Mixed load P95 test results:
        - Total requests: ${results.length}
        - P95 response time: ${p95Time.toFixed(2)}ms (target: <400ms)
        - Average response time: ${averageTime.toFixed(2)}ms
        - Min response time: ${minTime.toFixed(2)}ms
        - Max response time: ${maxTime.toFixed(2)}ms
        - Requests under 120ms (HARD): ${responseTimes.filter(t => t < 120).length}
        - Requests under 300ms (SOFT): ${responseTimes.filter(t => t < 300).length}
        - Requests under 400ms (P95): ${responseTimes.filter(t => t < 400).length}
      `);
    });

    test('should handle sustained load without performance degradation', async () => {
      // Test performance over time to detect memory leaks or degradation
      const batchSize = 25;
      const numBatches = 4;
      const allResponseTimes: number[] = [];
      const batchAverages: number[] = [];

      for (let batch = 0; batch < numBatches; batch++) {
        const requests = Array.from({ length: batchSize }, (_, i) => {
          const mockPayload = {
            session_id: `session-sustained-${batch}-${i}`,
            context: {
              'socialwise-chatwit': {
                inbox_data: { id: '4', name: 'Test Inbox', channel_type: 'whatsapp' },
                account_data: { id: '1' },
                whatsapp_phone_number_id: '123456789',
                whatsapp_business_id: 'business123',
                wamid: `wamid.sustained${batch}${i}`,
              },
            },
            message: `sustained load batch ${batch} request ${i}`,
            channel_type: 'whatsapp',
          };

          return {
            headers: {
              get: jest.fn().mockReturnValue(null),
            },
            text: jest.fn().mockResolvedValue(JSON.stringify(mockPayload)),
          } as any;
        });

        const promises = requests.map(async (request) => {
          const startTime = performance.now();
          const response = await POST(request);
          const responseTime = performance.now() - startTime;
          return { response, responseTime };
        });

        const results = await Promise.all(promises);

        // Verify all requests completed successfully
        results.forEach(({ response }) => {
          expect(response.status).toBe(200);
        });

        const batchResponseTimes = results.map(r => r.responseTime);
        const batchAverage = batchResponseTimes.reduce((sum, time) => sum + time, 0) / batchResponseTimes.length;
        
        allResponseTimes.push(...batchResponseTimes);
        batchAverages.push(batchAverage);

        // Force garbage collection if available
        if (global.gc) {
          global.gc();
        }

        // Small delay between batches
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      // Check for performance degradation over time
      const firstBatchAvg = batchAverages[0];
      const lastBatchAvg = batchAverages[batchAverages.length - 1];
      const performanceDegradation = lastBatchAvg - firstBatchAvg;

      // Performance should not degrade significantly
      expect(performanceDegradation).toBeLessThan(100); // Less than 100ms degradation

      // Overall P95 should still meet requirements
      const sortedTimes = allResponseTimes.sort((a, b) => a - b);
      const p95Time = sortedTimes[Math.floor(sortedTimes.length * 0.95)];
      expect(p95Time).toBeLessThan(400);

      console.log(`Sustained load test results:
        - Total requests: ${allResponseTimes.length}
        - Batches: ${numBatches}
        - First batch average: ${firstBatchAvg.toFixed(2)}ms
        - Last batch average: ${lastBatchAvg.toFixed(2)}ms
        - Performance degradation: ${performanceDegradation.toFixed(2)}ms
        - Overall P95: ${p95Time.toFixed(2)}ms
      `);
    });
  });

  describe('Error Handling Performance', () => {
    test('should handle classification errors quickly', async () => {
      // Mock classification failure
      mockClassifyIntent.mockRejectedValue(new Error('Classification failed'));

      const mockPayload = {
        session_id: 'session-error',
        context: {
          'socialwise-chatwit': {
            inbox_data: { id: '4', name: 'Test Inbox', channel_type: 'whatsapp' },
            account_data: { id: '1' },
            whatsapp_phone_number_id: '123456789',
            whatsapp_business_id: 'business123',
            wamid: 'wamid.error123',
          },
        },
        message: 'test error handling',
        channel_type: 'whatsapp',
      };

      const mockRequest = {
        headers: {
          get: jest.fn().mockReturnValue(null),
        },
        text: jest.fn().mockResolvedValue(JSON.stringify(mockPayload)),
      } as any;

      const startTime = performance.now();
      const response = await POST(mockRequest);
      const responseTime = performance.now() - startTime;

      expect(response.status).toBe(200);
      expect(responseTime).toBeLessThan(200); // Error handling should be fast
      
      const responseData = await response.json();
      expect(responseData.whatsapp || responseData.text).toBeDefined();
    });

    test('should maintain performance under mixed success/error conditions', async () => {
      let callCount = 0;
      mockClassifyIntent.mockImplementation(async () => {
        callCount++;
        
        // 70% success, 30% errors
        if (callCount % 10 < 7) {
          return {
            band: 'HARD',
            score: 0.85,
            candidates: [{ slug: 'recurso_oab', name: 'Recurso OAB', score: 0.85 }],
            strategy: 'direct_map',
            metrics: { embedding_ms: 20, route_total_ms: 100 },
          };
        } else {
          throw new Error('Simulated classification error');
        }
      });

      const requests = Array.from({ length: 30 }, (_, i) => {
        const mockPayload = {
          session_id: `session-mixed-error-${i}`,
          context: {
            'socialwise-chatwit': {
              inbox_data: { id: '4', name: 'Test Inbox', channel_type: 'whatsapp' },
              account_data: { id: '1' },
              whatsapp_phone_number_id: '123456789',
              whatsapp_business_id: 'business123',
              wamid: `wamid.mixederror${i}`,
            },
          },
          message: `mixed error test ${i}`,
          channel_type: 'whatsapp',
        };

        return {
          headers: {
            get: jest.fn().mockReturnValue(null),
          },
          text: jest.fn().mockResolvedValue(JSON.stringify(mockPayload)),
        } as any;
      });

      const promises = requests.map(async (request, index) => {
        const startTime = performance.now();
        const response = await POST(request);
        const responseTime = performance.now() - startTime;
        return { response, responseTime, index };
      });

      const results = await Promise.all(promises);

      // All requests should complete successfully (with fallbacks for errors)
      results.forEach(({ response }) => {
        expect(response.status).toBe(200);
      });

      // Performance should remain good despite errors
      const responseTimes = results.map(r => r.responseTime);
      const averageTime = responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length;
      const p95Time = responseTimes.sort((a, b) => a - b)[Math.floor(responseTimes.length * 0.95)];

      expect(averageTime).toBeLessThan(300);
      expect(p95Time).toBeLessThan(400);

      console.log(`Mixed success/error test results:
        - Total requests: ${results.length}
        - Average response time: ${averageTime.toFixed(2)}ms
        - P95 response time: ${p95Time.toFixed(2)}ms
      `);
    });
  });
});