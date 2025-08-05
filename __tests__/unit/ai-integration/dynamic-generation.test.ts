/**
 * Tests for Dynamic Generation Service
 */

import { DynamicGenerationService, createDynamicGenerationService } from '../../../lib/ai-integration/services/dynamic-generation';
import { OpenAIStructuredClient } from '../../../lib/ai-integration/services/openai-client';
import { LlmPromptContext } from '../../../lib/ai-integration/types/llm';

// Mock OpenAI client
const mockOpenAIClient = {
  generateStructuredOutput: jest.fn(),
  healthCheck: jest.fn(),
  getCircuitBreakerState: jest.fn(),
} as unknown as OpenAIStructuredClient;

describe('DynamicGenerationService', () => {
  let service: DynamicGenerationService;
  
  const mockContext: LlmPromptContext = {
    userMessage: 'Preciso de ajuda com meu pedido',
    channel: 'whatsapp',
    accountId: 1,
    conversationId: 123,
    economicMode: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new DynamicGenerationService(mockOpenAIClient);
  });

  describe('generateChannelResponse', () => {
    it('should generate WhatsApp interactive response successfully', async () => {
      const mockLlmResponse = {
        success: true,
        result: {
          text: 'Como posso ajudar com seu pedido?',
          buttons: [
            { title: 'Rastrear', id: 'intent:track', type: 'intent' },
            { title: 'Cancelar', id: 'intent:cancel', type: 'intent' },
          ],
        },
        tokensUsed: 50,
        model: 'gpt-4o-mini',
        latencyMs: 1000,
        cached: false,
      };

      (mockOpenAIClient.generateStructuredOutput as jest.Mock).mockResolvedValue(mockLlmResponse);

      const result = await service.generateChannelResponse({ context: mockContext });

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('body');
      expect(result.data).toHaveProperty('buttons');
      expect(result.tokensUsed).toBe(50);
      expect(result.fallbackUsed).toBe(false);
    });

    it('should generate Instagram quick reply response', async () => {
      const instagramContext = { ...mockContext, channel: 'instagram' as const };
      
      const mockLlmResponse = {
        success: true,
        result: {
          text: 'Como posso ajudar?',
          buttons: [
            { title: 'Ajuda', id: 'help', type: 'intent' },
            { title: 'Contato', id: 'contact', type: 'intent' },
          ],
        },
        tokensUsed: 30,
        model: 'gpt-4o-mini',
        latencyMs: 800,
        cached: false,
      };

      (mockOpenAIClient.generateStructuredOutput as jest.Mock).mockResolvedValue(mockLlmResponse);

      const result = await service.generateChannelResponse({ context: instagramContext });

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('text');
      expect(result.data).toHaveProperty('quick_replies');
      expect(result.fallbackUsed).toBe(false);
    });

    it('should use fallback when LLM fails', async () => {
      (mockOpenAIClient.generateStructuredOutput as jest.Mock).mockResolvedValue({
        success: false,
        error: 'API Error',
        tokensUsed: 0,
        model: 'gpt-4o-mini',
        latencyMs: 5000,
        cached: false,
      });

      const result = await service.generateChannelResponse({ context: mockContext });

      expect(result.success).toBe(true);
      expect(result.fallbackUsed).toBe(true);
      expect(result.model).toBe('fallback');
      expect(result.data).toHaveProperty('body');
      expect(result.data).toHaveProperty('buttons');
    });

    it('should handle economic mode', async () => {
      const economicContext = { ...mockContext, economicMode: true };
      
      const mockLlmResponse = {
        success: true,
        result: {
          text: 'Ajuda rápida',
          buttons: [{ title: 'OK', id: 'ok', type: 'intent' }],
        },
        tokensUsed: 10,
        model: 'gpt-4o-mini',
        latencyMs: 500,
        cached: false,
      };

      (mockOpenAIClient.generateStructuredOutput as jest.Mock).mockResolvedValue(mockLlmResponse);

      const result = await service.generateChannelResponse({ 
        context: economicContext, 
        economicMode: true 
      });

      expect(result.success).toBe(true);
      expect(result.tokensUsed).toBe(10);
      
      // Verify economic mode was passed to OpenAI client
      const call = (mockOpenAIClient.generateStructuredOutput as jest.Mock).mock.calls[0][0];
      expect(call.economicMode).toBe(true);
    });

    it('should generate simple text response when no buttons', async () => {
      const mockLlmResponse = {
        success: true,
        result: {
          text: 'Obrigado pela sua mensagem. Um atendente entrará em contato.',
        },
        tokensUsed: 25,
        model: 'gpt-4o-mini',
        latencyMs: 600,
        cached: false,
      };

      (mockOpenAIClient.generateStructuredOutput as jest.Mock).mockResolvedValue(mockLlmResponse);

      const result = await service.generateChannelResponse({ context: mockContext });

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ text: 'Obrigado pela sua mensagem. Um atendente entrará em contato.' });
      expect(result.fallbackUsed).toBe(false);
    });

    it('should handle Instagram button template with web URLs', async () => {
      const instagramContext = { ...mockContext, channel: 'instagram' as const };
      
      const mockLlmResponse = {
        success: true,
        result: {
          text: 'Confira nossos produtos',
          buttons: [
            { title: 'Ver Site', id: 'site', type: 'url', url: 'https://example.com' },
            { title: 'Contato', id: 'contact', type: 'intent' },
          ],
        },
        tokensUsed: 40,
        model: 'gpt-4o-mini',
        latencyMs: 900,
        cached: false,
      };

      (mockOpenAIClient.generateStructuredOutput as jest.Mock).mockResolvedValue(mockLlmResponse);

      const result = await service.generateChannelResponse({ context: instagramContext });

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('text');
      expect(result.data).toHaveProperty('buttons');
      
      const data = result.data as any;
      expect(data.buttons).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: 'web_url', url: 'https://example.com' }),
          expect.objectContaining({ type: 'postback' }),
        ])
      );
    });

    it('should include conversation history in prompt', async () => {
      const contextWithHistory = {
        ...mockContext,
        conversationHistory: [
          'Usuário: Olá',
          'Bot: Olá! Como posso ajudar?',
          'Usuário: Preciso de ajuda com meu pedido',
        ],
      };

      const mockLlmResponse = {
        success: true,
        result: { text: 'Claro, vou ajudar com seu pedido.' },
        tokensUsed: 35,
        model: 'gpt-4o-mini',
        latencyMs: 700,
        cached: false,
      };

      (mockOpenAIClient.generateStructuredOutput as jest.Mock).mockResolvedValue(mockLlmResponse);

      await service.generateChannelResponse({ context: contextWithHistory });

      const call = (mockOpenAIClient.generateStructuredOutput as jest.Mock).mock.calls[0][0];
      expect(call.userPrompt).toContain('Histórico recente da conversa');
      expect(call.userPrompt).toContain('Olá! Como posso ajudar?');
    });
  });

  describe('healthCheck', () => {
    it('should return true when OpenAI client is healthy', async () => {
      (mockOpenAIClient.healthCheck as jest.Mock).mockResolvedValue(true);

      const isHealthy = await service.healthCheck();
      expect(isHealthy).toBe(true);
    });

    it('should return false when OpenAI client is unhealthy', async () => {
      (mockOpenAIClient.healthCheck as jest.Mock).mockResolvedValue(false);

      const isHealthy = await service.healthCheck();
      expect(isHealthy).toBe(false);
    });

    it('should return false when health check throws', async () => {
      (mockOpenAIClient.healthCheck as jest.Mock).mockRejectedValue(new Error('Health check failed'));

      const isHealthy = await service.healthCheck();
      expect(isHealthy).toBe(false);
    });
  });

  describe('getCircuitBreakerState', () => {
    it('should return circuit breaker state from OpenAI client', () => {
      const mockState = {
        state: 'CLOSED' as const,
        failureCount: 0,
        lastFailureTime: 0,
        nextAttemptTime: 0,
      };

      (mockOpenAIClient.getCircuitBreakerState as jest.Mock).mockReturnValue(mockState);

      const state = service.getCircuitBreakerState();
      expect(state).toEqual(mockState);
    });
  });

  describe('createDynamicGenerationService', () => {
    it('should create service with provided OpenAI client', () => {
      const service = createDynamicGenerationService(mockOpenAIClient);
      expect(service).toBeInstanceOf(DynamicGenerationService);
    });

    it('should create service with default OpenAI client', () => {
      const service = createDynamicGenerationService();
      expect(service).toBeInstanceOf(DynamicGenerationService);
    });
  });
});  
describe('degradation mode', () => {
    it('should enter degraded mode after consecutive failures', async () => {
      // Mock consecutive failures
      (mockOpenAIClient.generateStructuredOutput as jest.Mock).mockResolvedValue({
        success: false,
        error: 'API Error',
        tokensUsed: 0,
        model: 'gpt-4o-mini',
        latencyMs: 1000,
        cached: false,
      });

      // Trigger 3 consecutive failures
      for (let i = 0; i < 3; i++) {
        await service.generateChannelResponse({ context: mockContext });
      }

      // Next call should use degraded response
      const result = await service.generateChannelResponse({ context: mockContext });

      expect(result.success).toBe(true);
      expect(result.model).toBe('degraded-template');
      expect(result.fallbackUsed).toBe(true);
      expect(result.error).toContain('Degraded mode');
    });

    it('should enter degraded mode on high latency', async () => {
      // Mock high latency response
      (mockOpenAIClient.generateStructuredOutput as jest.Mock).mockImplementation(
        () => new Promise(resolve => {
          setTimeout(() => resolve({
            success: true,
            result: { text: 'Response' },
            tokensUsed: 50,
            model: 'gpt-4o-mini',
            latencyMs: 9000, // High latency
            cached: false,
          }), 100);
        })
      );

      // First call should succeed but trigger degradation
      const result1 = await service.generateChannelResponse({ context: mockContext });
      expect(result1.success).toBe(true);

      // Second call should use degraded mode
      const result2 = await service.generateChannelResponse({ context: mockContext });
      expect(result2.model).toBe('degraded-template');
    });

    it('should use degraded templates for different channels', async () => {
      service.forceDegradation(60000); // Force degradation for 1 minute

      // Test WhatsApp degraded response
      const whatsappResult = await service.generateChannelResponse({ 
        context: { ...mockContext, channel: 'whatsapp' } 
      });
      expect(whatsappResult.data).toHaveProperty('body');
      expect(whatsappResult.data).toHaveProperty('buttons');

      // Test Instagram degraded response
      const instagramResult = await service.generateChannelResponse({ 
        context: { ...mockContext, channel: 'instagram' } 
      });
      expect(instagramResult.data).toHaveProperty('text');
      expect(instagramResult.data).toHaveProperty('quick_replies');
    });

    it('should provide performance metrics', () => {
      const metrics = service.getPerformanceMetrics();
      
      expect(metrics).toHaveProperty('consecutiveFailures');
      expect(metrics).toHaveProperty('averageLatency');
      expect(metrics).toHaveProperty('isDegraded');
      expect(metrics).toHaveProperty('circuitBreakerState');
    });

    it('should clear degradation mode', async () => {
      service.forceDegradation(60000);
      expect(service.getPerformanceMetrics().isDegraded).toBe(true);

      service.clearDegradation();
      expect(service.getPerformanceMetrics().isDegraded).toBe(false);
    });

    it('should respect circuit breaker OPEN state', async () => {
      // Mock circuit breaker in OPEN state
      (mockOpenAIClient.getCircuitBreakerState as jest.Mock).mockReturnValue({
        state: 'OPEN',
        failureCount: 5,
        lastFailureTime: Date.now(),
        nextAttemptTime: Date.now() + 30000,
      });

      const result = await service.generateChannelResponse({ context: mockContext });

      expect(result.success).toBe(true);
      expect(result.model).toBe('degraded-template');
      expect(result.fallbackUsed).toBe(true);
    });
  });
});