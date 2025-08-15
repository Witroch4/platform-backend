import { jest } from '@jest/globals';

// Mock OpenAI client
jest.mock('openai', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    apiKey: 'test-key',
    chat: {
      completions: {
        create: jest.fn(),
      },
    },
  })),
  toFile: jest.fn(),
}));

// Mock the cost wrapper before importing the service
jest.mock('@/lib/cost/openai-wrapper', () => ({
  openaiWithCost: jest.fn(),
  openaiChatWithCost: jest.fn(),
  openaiEmbeddingWithCost: jest.fn(),
  responsesCall: jest.fn(),
}));

// Set environment variable for tests
process.env.OPENAI_API_KEY = 'test-key';

import { openaiService } from '@/services/openai';
import { responsesCall } from '@/lib/cost/openai-wrapper';

const mockResponsesCall = responsesCall as jest.MockedFunction<typeof responsesCall>;

describe('OpenAI SocialWise Flow Enhancements', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('withDeadlineAbort', () => {
    it('should abort operation after deadline', async () => {
      // Mock a slow operation
      mockResponsesCall.mockImplementation(() => 
        new Promise(resolve => setTimeout(resolve, 500))
      );

      const agent = {
        model: 'gpt-4o',
        reasoningEffort: 'minimal' as const,
      };

      // Use non-empty intents to trigger the actual LLM call
      const intents = [{ slug: 'test_intent', desc: 'Test intent' }];
      const result = await openaiService.generateShortTitlesBatch(intents, agent);
      
      // Should return null when aborted
      expect(result).toBeNull();
    }, 10000);

    it('should return result when operation completes within deadline', async () => {
      mockResponsesCall.mockResolvedValue({
        id: 'test-response',
        output_text: '["Título 1", "Título 2"]',
        usage: { input_tokens: 10, output_tokens: 5 }
      });

      const agent = {
        model: 'gpt-4o',
        reasoningEffort: 'minimal' as const,
      };

      const intents = [
        { slug: 'test_intent', desc: 'Test intent description' }
      ];

      const result = await openaiService.generateShortTitlesBatch(intents, agent);
      
      expect(result).toEqual(['Título 1', 'Título 2']);
      expect(mockResponsesCall).toHaveBeenCalledWith(
        expect.any(Object),
        'gpt-4o',
        expect.any(Array),
        expect.objectContaining({
          intent: 'short_titles_generation'
        }),
        expect.any(AbortSignal)
      );
    });
  });

  describe('generateShortTitlesBatch', () => {
    it('should return empty array for empty intents', async () => {
      const agent = { model: 'gpt-4o' };
      const result = await openaiService.generateShortTitlesBatch([], agent);
      expect(result).toEqual([]);
    });

    it('should clamp titles to 20 characters and 4 words', async () => {
      mockResponsesCall.mockResolvedValue({
        id: 'test-response',
        output_text: '["Este é um título muito longo que precisa ser cortado", "Título Normal", "Um título com muitas palavras que excedem o limite"]',
        usage: { input_tokens: 10, output_tokens: 5 }
      });

      const agent = { model: 'gpt-4o' };
      const intents = [
        { slug: 'test1', desc: 'Test 1' },
        { slug: 'test2', desc: 'Test 2' },
        { slug: 'test3', desc: 'Test 3' }
      ];

      const result = await openaiService.generateShortTitlesBatch(intents, agent);
      
      expect(result).toBeDefined();
      expect(result![0].length).toBeLessThanOrEqual(20);
      expect(result![0].split(' ').length).toBeLessThanOrEqual(4);
      expect(result![1]).toBe('Título Normal');
    });

    it('should handle JSON parse errors gracefully', async () => {
      mockResponsesCall.mockResolvedValue({
        id: 'test-response',
        output_text: 'Invalid JSON response',
        usage: { input_tokens: 10, output_tokens: 5 }
      });

      const agent = { model: 'gpt-4o' };
      const intents = [{ slug: 'test', desc: 'Test' }];

      const result = await openaiService.generateShortTitlesBatch(intents, agent);
      expect(result).toBeNull();
    });
  });

  describe('generateWarmupButtons', () => {
    it('should return null for empty candidates', async () => {
      const agent = { model: 'gpt-4o' };
      const result = await openaiService.generateWarmupButtons('test message', [], agent);
      expect(result).toBeNull();
    });

    it('should validate and clamp response fields', async () => {
      const mockResponse = {
        introduction_text: 'Este é um texto de introdução muito longo que precisa ser cortado porque excede o limite de 180 caracteres estabelecido para garantir que a mensagem seja concisa e não cause problemas de formatação',
        buttons: [
          { title: 'Título muito longo que precisa ser cortado', payload: '@test_intent' },
          { title: 'Normal', payload: 'invalid_payload' },
          { title: 'Botão 3', payload: '@valid_intent' },
          { title: 'Botão 4', payload: '@extra_button' } // Should be removed (max 3)
        ]
      };

      mockResponsesCall.mockResolvedValue({
        id: 'test-response',
        output_text: JSON.stringify(mockResponse),
        usage: { input_tokens: 10, output_tokens: 5 }
      });

      const agent = { model: 'gpt-4o' };
      const candidates = [
        { slug: 'test_intent', desc: 'Test intent' }
      ];

      const result = await openaiService.generateWarmupButtons('test message', candidates, agent);
      
      expect(result).toBeDefined();
      expect(result!.introduction_text.length).toBeLessThanOrEqual(180);
      expect(result!.buttons).toHaveLength(3); // Max 3 buttons
      expect(result!.buttons[0].title.length).toBeLessThanOrEqual(20);
      expect(result!.buttons[1].payload).toMatch(/^@[a-z0-9_]+$/); // Should be fixed
    });

    it('should handle invalid response structure', async () => {
      mockResponsesCall.mockResolvedValue({
        id: 'test-response',
        output_text: '{"invalid": "structure"}',
        usage: { input_tokens: 10, output_tokens: 5 }
      });

      const agent = { model: 'gpt-4o' };
      const candidates = [{ slug: 'test', desc: 'Test' }];

      const result = await openaiService.generateWarmupButtons('test', candidates, agent);
      expect(result).toBeNull();
    });
  });

  describe('routerLLM', () => {
    it('should validate intent mode response', async () => {
      const mockResponse = {
        mode: 'intent',
        intent_payload: '@legal_consultation',
        introduction_text: 'Confirmação da intenção',
        buttons: [{ title: 'Confirmar', payload: '@legal_consultation' }]
      };

      mockResponsesCall.mockResolvedValue({
        id: 'test-response',
        output_text: JSON.stringify(mockResponse),
        usage: { input_tokens: 10, output_tokens: 5 }
      });

      const agent = { model: 'gpt-4o' };
      const result = await openaiService.routerLLM('Preciso de ajuda jurídica', agent);
      
      expect(result).toBeDefined();
      expect(result!.mode).toBe('intent');
      expect(result!.intent_payload).toBe('@legal_consultation');
    });

    it('should validate chat mode response', async () => {
      const mockResponse = {
        mode: 'chat',
        text: 'Olá! Posso ajudar você com questões jurídicas. Pode me contar mais detalhes sobre sua situação?'
      };

      mockResponsesCall.mockResolvedValue({
        id: 'test-response',
        output_text: JSON.stringify(mockResponse),
        usage: { input_tokens: 10, output_tokens: 5 }
      });

      const agent = { model: 'gpt-4o' };
      const result = await openaiService.routerLLM('Oi', agent);
      
      expect(result).toBeDefined();
      expect(result!.mode).toBe('chat');
      expect(result!.text).toBeDefined();
    });

    it('should reject invalid mode', async () => {
      mockResponsesCall.mockResolvedValue({
        id: 'test-response',
        output_text: '{"mode": "invalid_mode"}',
        usage: { input_tokens: 10, output_tokens: 5 }
      });

      const agent = { model: 'gpt-4o' };
      const result = await openaiService.routerLLM('test', agent);
      expect(result).toBeNull();
    });

    it('should reject intent mode without payload', async () => {
      mockResponsesCall.mockResolvedValue({
        id: 'test-response',
        output_text: '{"mode": "intent"}',
        usage: { input_tokens: 10, output_tokens: 5 }
      });

      const agent = { model: 'gpt-4o' };
      const result = await openaiService.routerLLM('test', agent);
      expect(result).toBeNull();
    });

    it('should reject chat mode without text', async () => {
      mockResponsesCall.mockResolvedValue({
        id: 'test-response',
        output_text: '{"mode": "chat"}',
        usage: { input_tokens: 10, output_tokens: 5 }
      });

      const agent = { model: 'gpt-4o' };
      const result = await openaiService.routerLLM('test', agent);
      expect(result).toBeNull();
    });

    it('should clamp text fields to limits', async () => {
      const longText = 'A'.repeat(2000); // Exceeds 1024 limit
      const longIntro = 'B'.repeat(300); // Exceeds 180 limit
      
      const mockResponse = {
        mode: 'chat',
        text: longText,
        introduction_text: longIntro
      };

      mockResponsesCall.mockResolvedValue({
        id: 'test-response',
        output_text: JSON.stringify(mockResponse),
        usage: { input_tokens: 10, output_tokens: 5 }
      });

      const agent = { model: 'gpt-4o' };
      const result = await openaiService.routerLLM('test', agent);
      
      expect(result).toBeDefined();
      expect(result!.text!.length).toBeLessThanOrEqual(1024);
      expect(result!.introduction_text!.length).toBeLessThanOrEqual(180);
    });
  });

  describe('Structured Output Validation', () => {
    it('should validate payload format in buttons', async () => {
      const mockResponse = {
        introduction_text: 'Test',
        buttons: [
          { title: 'Valid', payload: '@valid_intent' },
          { title: 'Invalid', payload: 'invalid-payload!' },
          { title: 'Needs Fix', payload: 'needs_fix' }
        ]
      };

      mockResponsesCall.mockResolvedValue({
        id: 'test-response',
        output_text: JSON.stringify(mockResponse),
        usage: { input_tokens: 10, output_tokens: 5 }
      });

      const agent = { model: 'gpt-4o' };
      const candidates = [{ slug: 'test', desc: 'Test' }];

      const result = await openaiService.generateWarmupButtons('test', candidates, agent);
      
      expect(result).toBeDefined();
      expect(result!.buttons[0].payload).toBe('@valid_intent');
      expect(result!.buttons[1].payload).toMatch(/^@[a-z0-9_]+$/);
      expect(result!.buttons[2].payload).toMatch(/^@[a-z0-9_]+$/);
    });
  });
});