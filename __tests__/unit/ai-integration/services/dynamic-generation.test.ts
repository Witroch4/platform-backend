/**
 * Unit tests for dynamic LLM generation service
 * Tests OpenAI structured output and channel-specific generation
 */

import { DynamicGenerationService } from '@/lib/ai-integration/services/dynamic-generation';
import { OpenAIClientService } from '@/lib/ai-integration/services/openai-client';
import { SafetyGuardsService } from '@/lib/ai-integration/services/safety-guards';

// Mock dependencies
jest.mock('@/lib/ai-integration/services/openai-client');
jest.mock('@/lib/ai-integration/services/safety-guards');

describe('DynamicGenerationService', () => {
  let dynamicGeneration: DynamicGenerationService;
  let mockOpenAIClient: jest.Mocked<OpenAIClientService>;
  let mockSafetyGuards: jest.Mocked<SafetyGuardsService>;

  beforeEach(() => {
    mockOpenAIClient = {
      generateStructuredOutput: jest.fn(),
      generateCompletion: jest.fn(),
    } as any;

    mockSafetyGuards = {
      validateResponse: jest.fn(),
      filterContent: jest.fn(),
      checkPromptInjection: jest.fn(),
    } as any;

    dynamicGeneration = new DynamicGenerationService(
      mockOpenAIClient,
      mockSafetyGuards
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('generateWhatsAppResponse', () => {
    const testParams = {
      text: 'Preciso de ajuda com meu pedido',
      conversationContext: ['Cliente: Olá', 'Bot: Como posso ajudar?'],
      accountId: 123,
      traceId: 'trace-123',
    };

    it('should generate valid WhatsApp interactive response', async () => {
      const mockLLMResponse = {
        body: 'Como posso ajudar com seu pedido?',
        footer: 'SocialWise',
        buttons: [
          { title: 'Rastrear', id: 'intent:track' },
          { title: 'Cancelar', id: 'intent:cancel' },
        ],
      };

      mockOpenAIClient.generateStructuredOutput.mockResolvedValue({
        response: mockLLMResponse,
        tokensUsed: 150,
        model: 'gpt-4o-mini',
      });

      mockSafetyGuards.validateResponse.mockReturnValue({
        isValid: true,
        filtered: mockLLMResponse,
      });

      const result = await dynamicGeneration.generateWhatsAppResponse(testParams);

      expect(result.success).toBe(true);
      expect(result.response).toEqual(mockLLMResponse);
      expect(result.tokensUsed).toBe(150);
      expect(mockOpenAIClient.generateStructuredOutput).toHaveBeenCalledWith(
        expect.objectContaining({
          schema: expect.objectContaining({
            type: 'object',
            required: ['body', 'buttons'],
          }),
        })
      );
    });

    it('should handle LLM generation failure with fallback', async () => {
      mockOpenAIClient.generateStructuredOutput.mockRejectedValue(
        new Error('OpenAI API error')
      );

      const result = await dynamicGeneration.generateWhatsAppResponse(testParams);

      expect(result.success).toBe(false);
      expect(result.fallback).toBeDefined();
      expect(result.fallback.body).toContain('Acionei um atendente humano');
      expect(result.fallback.buttons).toHaveLength(1);
      expect(result.fallback.buttons[0].id).toBe('human_handoff');
      expect(result.error).toBe('OpenAI API error');
    });

    it('should apply safety guards to generated content', async () => {
      const mockLLMResponse = {
        body: 'Visite nosso site em http://malicious.com',
        buttons: [{ title: 'OK', id: 'ok' }],
      };

      const filteredResponse = {
        body: 'Como posso ajudar você?',
        buttons: [{ title: 'OK', id: 'ok' }],
      };

      mockOpenAIClient.generateStructuredOutput.mockResolvedValue({
        response: mockLLMResponse,
        tokensUsed: 150,
        model: 'gpt-4o-mini',
      });

      mockSafetyGuards.validateResponse.mockReturnValue({
        isValid: false,
        filtered: filteredResponse,
        violations: ['EXTERNAL_URL'],
      });

      const result = await dynamicGeneration.generateWhatsAppResponse(testParams);

      expect(result.success).toBe(true);
      expect(result.response).toEqual(filteredResponse);
      expect(result.safetyViolations).toEqual(['EXTERNAL_URL']);
    });

    it('should include conversation context in prompt', async () => {
      const mockLLMResponse = {
        body: 'Baseado no contexto, posso ajudar',
        buttons: [{ title: 'Sim', id: 'yes' }],
      };

      mockOpenAIClient.generateStructuredOutput.mockResolvedValue({
        response: mockLLMResponse,
        tokensUsed: 150,
        model: 'gpt-4o-mini',
      });

      mockSafetyGuards.validateResponse.mockReturnValue({
        isValid: true,
        filtered: mockLLMResponse,
      });

      await dynamicGeneration.generateWhatsAppResponse(testParams);

      expect(mockOpenAIClient.generateStructuredOutput).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({
              content: expect.stringContaining('Cliente: Olá'),
            }),
          ]),
        })
      );
    });

    it('should handle economic mode with shorter responses', async () => {
      const economicParams = {
        ...testParams,
        economicMode: true,
      };

      const mockLLMResponse = {
        body: 'Como ajudar?',
        buttons: [{ title: 'Ajuda', id: 'help' }],
      };

      mockOpenAIClient.generateStructuredOutput.mockResolvedValue({
        response: mockLLMResponse,
        tokensUsed: 50,
        model: 'gpt-4o-mini',
      });

      mockSafetyGuards.validateResponse.mockReturnValue({
        isValid: true,
        filtered: mockLLMResponse,
      });

      const result = await dynamicGeneration.generateWhatsAppResponse(economicParams);

      expect(result.success).toBe(true);
      expect(result.response.body.length).toBeLessThan(200); // Economic mode limit
    });
  });

  describe('generateInstagramQuickReply', () => {
    const testParams = {
      text: 'Preciso de ajuda',
      conversationContext: [],
      accountId: 123,
      traceId: 'trace-123',
    };

    it('should generate valid Instagram quick reply response', async () => {
      const mockLLMResponse = {
        text: 'Como posso ajudar você?',
        quick_replies: [
          { title: 'Rastrear', payload: 'intent:track' },
          { title: 'Cancelar', payload: 'intent:cancel' },
        ],
      };

      mockOpenAIClient.generateStructuredOutput.mockResolvedValue({
        response: mockLLMResponse,
        tokensUsed: 120,
        model: 'gpt-4o-mini',
      });

      mockSafetyGuards.validateResponse.mockReturnValue({
        isValid: true,
        filtered: mockLLMResponse,
      });

      const result = await dynamicGeneration.generateInstagramQuickReply(testParams);

      expect(result.success).toBe(true);
      expect(result.response).toEqual(mockLLMResponse);
      expect(result.tokensUsed).toBe(120);
    });

    it('should limit quick replies to 3 for UX consistency', async () => {
      const mockLLMResponse = {
        text: 'Escolha uma opção',
        quick_replies: [
          { title: 'Opção 1', payload: 'opt1' },
          { title: 'Opção 2', payload: 'opt2' },
          { title: 'Opção 3', payload: 'opt3' },
          { title: 'Opção 4', payload: 'opt4' },
          { title: 'Opção 5', payload: 'opt5' },
        ],
      };

      mockOpenAIClient.generateStructuredOutput.mockResolvedValue({
        response: mockLLMResponse,
        tokensUsed: 120,
        model: 'gpt-4o-mini',
      });

      mockSafetyGuards.validateResponse.mockReturnValue({
        isValid: true,
        filtered: {
          ...mockLLMResponse,
          quick_replies: mockLLMResponse.quick_replies.slice(0, 3),
        },
      });

      const result = await dynamicGeneration.generateInstagramQuickReply(testParams);

      expect(result.success).toBe(true);
      expect(result.response.quick_replies).toHaveLength(3);
    });
  });

  describe('generateInstagramButtonTemplate', () => {
    const testParams = {
      text: 'Preciso de ajuda',
      conversationContext: [],
      accountId: 123,
      traceId: 'trace-123',
    };

    it('should generate valid Instagram button template', async () => {
      const mockLLMResponse = {
        text: 'Como posso ajudar você?',
        buttons: [
          { type: 'postback', title: 'Rastrear', payload: 'intent:track' },
          { type: 'web_url', title: 'Site', url: 'https://example.com' },
        ],
      };

      mockOpenAIClient.generateStructuredOutput.mockResolvedValue({
        response: mockLLMResponse,
        tokensUsed: 130,
        model: 'gpt-4o-mini',
      });

      mockSafetyGuards.validateResponse.mockReturnValue({
        isValid: true,
        filtered: mockLLMResponse,
      });

      const result = await dynamicGeneration.generateInstagramButtonTemplate(testParams);

      expect(result.success).toBe(true);
      expect(result.response).toEqual(mockLLMResponse);
    });

    it('should validate HTTPS URLs in web_url buttons', async () => {
      const mockLLMResponse = {
        text: 'Visite nosso site',
        buttons: [
          { type: 'web_url', title: 'Site', url: 'http://example.com' }, // HTTP not allowed
          { type: 'web_url', title: 'Seguro', url: 'https://example.com' }, // HTTPS allowed
        ],
      };

      const filteredResponse = {
        text: 'Visite nosso site',
        buttons: [
          { type: 'web_url', title: 'Seguro', url: 'https://example.com' },
        ],
      };

      mockOpenAIClient.generateStructuredOutput.mockResolvedValue({
        response: mockLLMResponse,
        tokensUsed: 130,
        model: 'gpt-4o-mini',
      });

      mockSafetyGuards.validateResponse.mockReturnValue({
        isValid: false,
        filtered: filteredResponse,
        violations: ['INVALID_URL_SCHEME'],
      });

      const result = await dynamicGeneration.generateInstagramButtonTemplate(testParams);

      expect(result.success).toBe(true);
      expect(result.response.buttons).toHaveLength(1);
      expect(result.response.buttons[0].url).toBe('https://example.com');
    });
  });

  describe('generateSimpleTextResponse', () => {
    it('should generate simple text response as fallback', async () => {
      const testParams = {
        text: 'Preciso de ajuda',
        conversationContext: [],
        accountId: 123,
        traceId: 'trace-123',
      };

      mockOpenAIClient.generateCompletion.mockResolvedValue({
        response: 'Como posso ajudar você hoje?',
        tokensUsed: 50,
        model: 'gpt-4o-mini',
      });

      mockSafetyGuards.filterContent.mockReturnValue({
        filtered: 'Como posso ajudar você hoje?',
        violations: [],
      });

      const result = await dynamicGeneration.generateSimpleTextResponse(testParams);

      expect(result.success).toBe(true);
      expect(result.response).toBe('Como posso ajudar você hoje?');
      expect(result.tokensUsed).toBe(50);
    });

    it('should provide hardcoded fallback when LLM fails', async () => {
      const testParams = {
        text: 'Preciso de ajuda',
        conversationContext: [],
        accountId: 123,
        traceId: 'trace-123',
      };

      mockOpenAIClient.generateCompletion.mockRejectedValue(
        new Error('OpenAI API error')
      );

      const result = await dynamicGeneration.generateSimpleTextResponse(testParams);

      expect(result.success).toBe(false);
      expect(result.fallback).toBe('Acionei um atendente humano para ajudar você.');
      expect(result.error).toBe('OpenAI API error');
    });
  });

  describe('buildPromptContext', () => {
    it('should build proper prompt context with conversation history', () => {
      const context = ['Cliente: Olá', 'Bot: Como posso ajudar?', 'Cliente: Preciso de ajuda'];
      const currentMessage = 'Quero rastrear meu pedido';

      const result = dynamicGeneration.buildPromptContext(context, currentMessage);

      expect(result).toContain('Olá');
      expect(result).toContain('Como posso ajudar?');
      expect(result).toContain('Quero rastrear meu pedido');
      expect(result.length).toBeLessThan(800); // Context shaping limit
    });

    it('should limit context to prevent token overflow', () => {
      const longContext = Array.from({ length: 20 }, (_, i) => 
        `Cliente: Esta é uma mensagem muito longa número ${i} que pode causar overflow de tokens`
      );
      const currentMessage = 'Mensagem atual';

      const result = dynamicGeneration.buildPromptContext(longContext, currentMessage);

      expect(result.length).toBeLessThan(800);
      expect(result).toContain('Mensagem atual');
    });
  });
});