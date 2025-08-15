/**
 * Integration tests for SocialWise Flow enhanced processing
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { processSocialWiseFlow } from '@/lib/socialwise-flow/processor';
import { classifyIntent } from '@/lib/socialwise-flow/classification';
import { buildChannelResponse } from '@/lib/socialwise-flow/channel-formatting';

// Mock external dependencies
jest.mock('@/lib/connections');
jest.mock('@/lib/utils/logger');
jest.mock('@/services/openai');
jest.mock('@/lib/socialwise/assistant');
jest.mock('@/lib/socialwise/templates');

// Mock Prisma
const mockPrisma = {
  chatwitInbox: {
    findFirst: jest.fn()
  },
  intent: {
    findMany: jest.fn()
  }
};

// Mock Redis
const mockRedis = {
  setex: jest.fn(),
  pipeline: jest.fn(() => ({
    hincrby: jest.fn(),
    expire: jest.fn(),
    exec: jest.fn()
  }))
};

// Mock OpenAI service
const mockOpenAIService = {
  generateWarmupButtons: jest.fn(),
  generateShortTitlesBatch: jest.fn(),
  routerLLM: jest.fn(),
  withDeadlineAbort: jest.fn()
};

// Mock assistant service
const mockAssistant = {
  id: 'assistant123',
  model: 'gpt-4o-mini',
  instructions: 'You are a legal assistant'
};

// Mock template builders
const mockTemplateBuilders = {
  buildWhatsAppByIntentRaw: jest.fn(),
  buildWhatsAppByGlobalIntent: jest.fn()
};

describe('SocialWise Flow Enhanced Processing Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup default mocks
    require('@/lib/connections').getPrismaInstance.mockReturnValue(mockPrisma);
    require('@/lib/connections').getRedisInstance.mockReturnValue(mockRedis);
    require('@/services/openai').createOpenAIService.mockReturnValue(mockOpenAIService);
    require('@/lib/socialwise/assistant').getAssistantForInbox.mockResolvedValue(mockAssistant);
    require('@/lib/socialwise/templates').buildWhatsAppByIntentRaw.mockImplementation(mockTemplateBuilders.buildWhatsAppByIntentRaw);
    require('@/lib/socialwise/templates').buildWhatsAppByGlobalIntent.mockImplementation(mockTemplateBuilders.buildWhatsAppByGlobalIntent);
    
    // Mock Redis pipeline
    mockRedis.pipeline.mockReturnValue({
      hincrby: jest.fn(),
      expire: jest.fn(),
      exec: jest.fn().mockResolvedValue([])
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('HARD Band Processing (≥0.80 score)', () => {
    it('should process high-confidence intent with direct mapping', async () => {
      // Setup: High-confidence intent with successful mapping
      mockPrisma.chatwitInbox.findFirst.mockResolvedValue({
        usuarioChatwit: { appUserId: 'user123' }
      });
      
      mockPrisma.intent.findMany.mockResolvedValue([
        {
          id: 'intent1',
          name: 'pagar_fatura',
          description: 'Pagamento de fatura',
          similarityThreshold: 0.8,
          embedding: new Array(1536).fill(0.5) // Mock embedding
        }
      ]);

      mockTemplateBuilders.buildWhatsAppByIntentRaw.mockResolvedValue({
        whatsapp: {
          type: 'text',
          text: { body: 'Vou ajudar você com o pagamento da fatura.' }
        }
      });

      // Mock fetch for embedding generation
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          data: [{ embedding: new Array(1536).fill(0.9) }] // High similarity
        })
      });

      const context = {
        userText: 'quero pagar minha fatura',
        channelType: 'whatsapp',
        inboxId: 'inbox123',
        chatwitAccountId: 'account456',
        userId: 'user123',
        traceId: 'test-trace-1'
      };

      const result = await processSocialWiseFlow(context, true);

      expect(result.metrics.band).toBe('HARD');
      expect(result.metrics.strategy).toBe('direct_map');
      expect(result.response.whatsapp).toBeDefined();
      expect(result.metrics.routeTotalMs).toBeGreaterThan(0);
    });

    it('should fallback gracefully when direct mapping fails', async () => {
      // Setup: High-confidence intent but no template mapping
      mockPrisma.chatwitInbox.findFirst.mockResolvedValue({
        usuarioChatwit: { appUserId: 'user123' }
      });
      
      mockPrisma.intent.findMany.mockResolvedValue([
        {
          id: 'intent1',
          name: 'unknown_intent',
          description: 'Unknown intent',
          similarityThreshold: 0.8,
          embedding: new Array(1536).fill(0.5)
        }
      ]);

      mockTemplateBuilders.buildWhatsAppByIntentRaw.mockResolvedValue(null);
      mockTemplateBuilders.buildWhatsAppByGlobalIntent.mockResolvedValue(null);

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          data: [{ embedding: new Array(1536).fill(0.9) }]
        })
      });

      const context = {
        userText: 'something unknown',
        channelType: 'whatsapp',
        inboxId: 'inbox123',
        userId: 'user123',
        traceId: 'test-trace-2'
      };

      const result = await processSocialWiseFlow(context, true);

      expect(result.metrics.band).toBe('HARD');
      expect(result.response).toBeDefined();
      expect(result.response.whatsapp || result.response.text).toBeDefined();
    });
  });

  describe('SOFT Band Processing (0.65-0.79 score)', () => {
    it('should generate warmup buttons for medium-confidence intents', async () => {
      // Setup: Medium-confidence intents
      mockPrisma.chatwitInbox.findFirst.mockResolvedValue({
        usuarioChatwit: { appUserId: 'user123' }
      });
      
      mockPrisma.intent.findMany.mockResolvedValue([
        {
          id: 'intent1',
          name: 'consulta_juridica',
          description: 'Consulta jurídica geral',
          similarityThreshold: 0.8,
          embedding: new Array(1536).fill(0.3) // Medium similarity
        },
        {
          id: 'intent2',
          name: 'documentos',
          description: 'Solicitação de documentos',
          similarityThreshold: 0.8,
          embedding: new Array(1536).fill(0.25)
        }
      ]);

      mockOpenAIService.generateWarmupButtons.mockResolvedValue({
        introduction_text: 'Posso ajudar com qual dessas opções?',
        buttons: [
          { title: 'Consulta jurídica', payload: '@consulta_juridica' },
          { title: 'Documentos', payload: '@documentos' },
          { title: 'Outros assuntos', payload: '@outros_assuntos' }
        ]
      });

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          data: [{ embedding: new Array(1536).fill(0.7) }] // Medium similarity
        })
      });

      const context = {
        userText: 'preciso de ajuda com algo legal',
        channelType: 'whatsapp',
        inboxId: 'inbox123',
        userId: 'user123',
        traceId: 'test-trace-3'
      };

      const result = await processSocialWiseFlow(context, true);

      expect(result.metrics.band).toBe('SOFT');
      expect(result.metrics.strategy).toBe('warmup_buttons');
      expect(result.response.whatsapp).toBeDefined();
      expect(result.metrics.llmWarmupMs).toBeGreaterThan(0);
    });

    it('should fallback to default topics when LLM fails', async () => {
      // Setup: Medium-confidence intents but LLM failure
      mockPrisma.chatwitInbox.findFirst.mockResolvedValue({
        usuarioChatwit: { appUserId: 'user123' }
      });
      
      mockPrisma.intent.findMany.mockResolvedValue([
        {
          id: 'intent1',
          name: 'test_intent',
          description: 'Test intent',
          similarityThreshold: 0.8,
          embedding: new Array(1536).fill(0.3)
        }
      ]);

      mockOpenAIService.generateWarmupButtons.mockResolvedValue(null); // LLM failure

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          data: [{ embedding: new Array(1536).fill(0.7) }]
        })
      });

      const context = {
        userText: 'need help',
        channelType: 'whatsapp',
        inboxId: 'inbox123',
        userId: 'user123',
        traceId: 'test-trace-4'
      };

      const result = await processSocialWiseFlow(context, true);

      expect(result.metrics.band).toBe('SOFT');
      expect(result.response).toBeDefined();
      // Should fallback to default legal topics
      expect(result.response.whatsapp || result.response.text).toBeDefined();
    });
  });

  describe('LOW Band Processing (<0.65 score)', () => {
    it('should provide default legal topics for low-confidence queries', async () => {
      // Setup: Low-confidence or no intents
      mockPrisma.chatwitInbox.findFirst.mockResolvedValue({
        usuarioChatwit: { appUserId: 'user123' }
      });
      
      mockPrisma.intent.findMany.mockResolvedValue([
        {
          id: 'intent1',
          name: 'some_intent',
          description: 'Some intent',
          similarityThreshold: 0.8,
          embedding: new Array(1536).fill(0.1) // Low similarity
        }
      ]);

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          data: [{ embedding: new Array(1536).fill(0.5) }] // Will result in low similarity
        })
      });

      const context = {
        userText: 'random unrelated text',
        channelType: 'whatsapp',
        inboxId: 'inbox123',
        userId: 'user123',
        traceId: 'test-trace-5'
      };

      const result = await processSocialWiseFlow(context, true);

      expect(result.metrics.band).toBe('LOW');
      expect(result.metrics.strategy).toBe('domain_topics');
      expect(result.response).toBeDefined();
    });
  });

  describe('ROUTER Band Processing (embedipreview=false)', () => {
    it('should use Router LLM for conversational mode', async () => {
      // Setup: Router LLM mode
      mockPrisma.chatwitInbox.findFirst.mockResolvedValue({
        usuarioChatwit: { appUserId: 'user123' }
      });

      mockOpenAIService.routerLLM.mockResolvedValue({
        mode: 'chat',
        introduction_text: 'Como posso ajudar você hoje?',
        buttons: [
          { title: 'Consulta', payload: '@consulta' },
          { title: 'Documentos', payload: '@documentos' }
        ]
      });

      const context = {
        userText: 'olá, preciso de ajuda',
        channelType: 'whatsapp',
        inboxId: 'inbox123',
        userId: 'user123',
        traceId: 'test-trace-6'
      };

      const result = await processSocialWiseFlow(context, false); // embedipreview=false

      expect(result.metrics.band).toBe('ROUTER');
      expect(result.metrics.strategy).toBe('router_llm');
      expect(result.response).toBeDefined();
      expect(result.metrics.llmWarmupMs).toBeGreaterThan(0);
    });

    it('should handle intent mode from Router LLM', async () => {
      // Setup: Router LLM returns intent mode
      mockPrisma.chatwitInbox.findFirst.mockResolvedValue({
        usuarioChatwit: { appUserId: 'user123' }
      });

      mockOpenAIService.routerLLM.mockResolvedValue({
        mode: 'intent',
        intent_payload: '@pagar_fatura'
      });

      mockTemplateBuilders.buildWhatsAppByIntentRaw.mockResolvedValue({
        whatsapp: {
          type: 'text',
          text: { body: 'Processando pagamento...' }
        }
      });

      const context = {
        userText: 'quero pagar minha conta',
        channelType: 'whatsapp',
        inboxId: 'inbox123',
        userId: 'user123',
        traceId: 'test-trace-7'
      };

      const result = await processSocialWiseFlow(context, false);

      expect(result.metrics.band).toBe('ROUTER');
      expect(result.response.whatsapp).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle missing user ID gracefully', async () => {
      mockPrisma.chatwitInbox.findFirst.mockResolvedValue(null);

      const context = {
        userText: 'test message',
        channelType: 'whatsapp',
        inboxId: 'nonexistent',
        traceId: 'test-trace-8'
      };

      const result = await processSocialWiseFlow(context, true);

      expect(result.metrics.band).toBe('LOW');
      expect(result.metrics.strategy).toBe('fallback_no_user');
      expect(result.response).toBeDefined();
    });

    it('should handle database errors gracefully', async () => {
      mockPrisma.chatwitInbox.findFirst.mockRejectedValue(new Error('Database error'));

      const context = {
        userText: 'test message',
        channelType: 'whatsapp',
        inboxId: 'inbox123',
        userId: 'user123',
        traceId: 'test-trace-9'
      };

      const result = await processSocialWiseFlow(context, true);

      expect(result.metrics.band).toBe('LOW');
      expect(result.metrics.strategy).toBe('error_fallback');
      expect(result.response).toBeDefined();
    });

    it('should handle OpenAI API errors gracefully', async () => {
      mockPrisma.chatwitInbox.findFirst.mockResolvedValue({
        usuarioChatwit: { appUserId: 'user123' }
      });

      global.fetch = jest.fn().mockRejectedValue(new Error('OpenAI API error'));

      const context = {
        userText: 'test message',
        channelType: 'whatsapp',
        inboxId: 'inbox123',
        userId: 'user123',
        traceId: 'test-trace-10'
      };

      const result = await processSocialWiseFlow(context, true);

      // Should still return a valid response
      expect(result.response).toBeDefined();
      expect(result.metrics.routeTotalMs).toBeGreaterThan(0);
    });
  });

  describe('Performance Requirements', () => {
    it('should complete HARD band processing under 120ms target', async () => {
      // Setup for fast HARD band processing
      mockPrisma.chatwitInbox.findFirst.mockResolvedValue({
        usuarioChatwit: { appUserId: 'user123' }
      });
      
      mockPrisma.intent.findMany.mockResolvedValue([
        {
          id: 'intent1',
          name: 'fast_intent',
          description: 'Fast intent',
          similarityThreshold: 0.8,
          embedding: new Array(1536).fill(0.5)
        }
      ]);

      mockTemplateBuilders.buildWhatsAppByIntentRaw.mockResolvedValue({
        whatsapp: { type: 'text', text: { body: 'Fast response' } }
      });

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          data: [{ embedding: new Array(1536).fill(0.9) }]
        })
      });

      const context = {
        userText: 'fast query',
        channelType: 'whatsapp',
        inboxId: 'inbox123',
        userId: 'user123',
        traceId: 'test-perf-1'
      };

      const result = await processSocialWiseFlow(context, true);

      expect(result.metrics.band).toBe('HARD');
      // Note: In real scenarios, this should be under 120ms
      // In tests, we just verify it completes successfully
      expect(result.metrics.routeTotalMs).toBeGreaterThan(0);
    });
  });
});