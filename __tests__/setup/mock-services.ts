/**
 * Mock Services for SocialWise Flow Testing
 * Provides consistent mock implementations for external dependencies
 */

import { jest } from '@jest/globals';

export function createMockRedis() {
  const mockRedis = {
    get: jest.fn(),
    setex: jest.fn(),
    del: jest.fn(),
    exists: jest.fn(),
    ping: jest.fn(),
    hget: jest.fn(),
    hset: jest.fn(),
    expire: jest.fn(),
    pipeline: jest.fn(),
    
    setupDefaults: () => {
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
    },
  };

  return mockRedis;
}

export function createMockPrisma() {
  const mockPrisma = {
    chatwitInbox: {
      findFirst: jest.fn(),
      updateMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    mapeamentoIntencao: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    mapeamentoBotao: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    lead: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    agente: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    
    setupDefaults: () => {
      mockPrisma.chatwitInbox.findFirst.mockResolvedValue({
        id: 'inbox-123',
        inboxId: '4',
        nome: 'Test Inbox',
        usuarioChatwit: {
          appUserId: 'user-123',
          chatwitAccountId: 1,
        },
      });
      
      mockPrisma.agente.findFirst.mockResolvedValue({
        id: 'agent-123',
        model: 'gpt-4o-mini',
        instructions: 'You are a legal assistant',
        embedipreview: true,
      });
    },
  };

  return mockPrisma;
}

export function createMockOpenAI() {
  const mockOpenAI = {
    generateWarmupButtons: jest.fn(),
    routerLLM: jest.fn(),
    generateShortTitlesBatch: jest.fn(),
    withDeadlineAbort: jest.fn(),
    responsesCall: jest.fn(),
    
    setupDefaults: () => {
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

      mockOpenAI.generateShortTitlesBatch.mockResolvedValue([
        'Recurso OAB',
        'Inscrição',
        'Consulta',
      ]);

      mockOpenAI.responsesCall.mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify({
              response_text: 'Como posso ajudar?',
              buttons: [
                { title: 'Opção 1', payload: '@opcao_1' },
                { title: 'Opção 2', payload: '@opcao_2' },
              ],
            }),
          },
        }],
      });
    },
  };

  return mockOpenAI;
}

export function createMockClassification() {
  return {
    classifyIntent: jest.fn().mockResolvedValue({
      band: 'HARD',
      score: 0.85,
      candidates: [
        {
          slug: 'recurso_oab',
          name: 'Recurso OAB',
          description: 'Recurso administrativo junto à Ordem dos Advogados do Brasil',
          score: 0.85,
        },
      ],
      strategy: 'direct_map',
      metrics: {
        embedding_ms: 15,
        route_total_ms: 50,
      },
    }),
  };
}

export function createMockTemplates() {
  return {
    buildWhatsAppByIntentRaw: jest.fn().mockResolvedValue({
      whatsapp: {
        type: 'interactive',
        interactive: {
          type: 'button',
          body: { text: 'Template encontrado para sua solicitação.' },
          action: {
            buttons: [
              { type: 'reply', reply: { id: 'btn_continue', title: 'Continuar' } },
              { type: 'reply', reply: { id: 'handoff:human', title: 'Falar com atendente' } },
            ],
          },
        },
      },
    }),
    
    buildWhatsAppByGlobalIntent: jest.fn().mockResolvedValue({
      whatsapp: {
        type: 'interactive',
        interactive: {
          type: 'button',
          body: { text: 'Template global encontrado.' },
          action: {
            buttons: [
              { type: 'reply', reply: { id: 'btn_global', title: 'Continuar' } },
            ],
          },
        },
      },
    }),
  };
}

export function createMockAssistant() {
  return {
    getAssistantForInbox: jest.fn().mockResolvedValue({
      id: 'agent-123',
      model: 'gpt-4o-mini',
      instructions: 'You are a legal assistant specialized in Brazilian law.',
      embedipreview: true,
    }),
  };
}

export function createMockSocialWiseServices() {
  return {
    SocialWiseIdempotencyService: jest.fn().mockImplementation(() => ({
      isPayloadDuplicate: jest.fn().mockResolvedValue(false),
    })),
    
    SocialWiseRateLimiterService: jest.fn().mockImplementation(() => ({
      checkPayloadRateLimit: jest.fn().mockResolvedValue({
        allowed: true,
        scope: 'session',
        limit: 100,
        remaining: 99,
        resetTime: Date.now() + 60000,
      }),
    })),
    
    SocialWiseReplayProtectionService: jest.fn().mockImplementation(() => ({
      extractNonceFromRequest: jest.fn().mockReturnValue(null),
      checkAndMarkNonce: jest.fn().mockResolvedValue({
        allowed: true,
        error: null,
      }),
    })),
  };
}

export function createMockMetrics() {
  return {
    collectPerformanceMetrics: jest.fn().mockResolvedValue(undefined),
    createPerformanceMetrics: jest.fn().mockReturnValue({
      band: 'HARD',
      strategy: 'direct_map',
      routeTotalMs: 50,
      embeddingMs: 15,
      channelType: 'whatsapp',
      userId: 'user-123',
      inboxId: '4',
      traceId: 'trace-123',
    }),
  };
}

export function createMockConcurrencyManager() {
  return {
    getConcurrencyManager: jest.fn().mockReturnValue({
      executeLlmOperation: jest.fn().mockImplementation(async (inboxId, operation, options) => {
        return await operation();
      }),
      
      checkConcurrencyLimit: jest.fn().mockReturnValue({
        allowed: true,
        currentCount: 1,
        limit: 10,
      }),
      
      releaseLlmOperation: jest.fn().mockResolvedValue(undefined),
    }),
  };
}

export function createMockDegradationStrategies() {
  return {
    selectDegradationStrategy: jest.fn().mockReturnValue({
      strategy: 'humanized_fallback',
      fallbackLevel: 'medium',
      degradationMs: 50,
      response: {
        whatsapp: {
          type: 'interactive',
          interactive: {
            type: 'button',
            body: { text: 'Como posso ajudar você hoje?' },
            action: {
              buttons: [
                { type: 'reply', reply: { id: '@recurso_oab', title: 'Recurso OAB' } },
                { type: 'reply', reply: { id: '@inscricao', title: 'Inscrição' } },
                { type: 'reply', reply: { id: 'handoff:human', title: 'Falar com atendente' } },
              ],
            },
          },
        },
      },
    }),
    
    shouldDegrade: jest.fn().mockReturnValue(true),
    
    determineFailurePoint: jest.fn().mockReturnValue('llm_timeout'),
  };
}

export function setupAllMocks() {
  const mocks = {
    redis: createMockRedis(),
    prisma: createMockPrisma(),
    openai: createMockOpenAI(),
    classification: createMockClassification(),
    templates: createMockTemplates(),
    assistant: createMockAssistant(),
    socialwiseServices: createMockSocialWiseServices(),
    metrics: createMockMetrics(),
    concurrencyManager: createMockConcurrencyManager(),
    degradationStrategies: createMockDegradationStrategies(),
  };

  // Setup defaults for all mocks
  Object.values(mocks).forEach(mock => {
    if (typeof mock === 'object' && 'setupDefaults' in mock) {
      (mock as any).setupDefaults();
    }
  });

  return mocks;
}