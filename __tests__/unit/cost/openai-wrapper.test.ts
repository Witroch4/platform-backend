// Using global jest from jest.config.js
import OpenAI from 'openai';
import { Queue } from 'bullmq';
import { openaiWithCost, openaiChatWithCost, openaiEmbeddingWithCost } from '@/lib/cost/openai-wrapper';
import { guardOpenAIOperation, BudgetExceededException } from '@/lib/cost/budget-guard';

// Mock dependencies
jest.mock('bullmq');
jest.mock('@/lib/connections');
jest.mock('@/lib/cost/budget-guard');

const mockQueue = {
  add: jest.fn(),
  addBulk: jest.fn(),
} as any;

const mockGuardOpenAIOperation = guardOpenAIOperation as jest.MockedFunction<typeof guardOpenAIOperation>;

// Mock Queue constructor
(Queue as jest.MockedClass<typeof Queue>).mockImplementation(() => mockQueue);

describe('OpenAI Wrapper', () => {
  let mockClient: jest.Mocked<OpenAI>;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockClient = {
      chat: {
        completions: {
          create: jest.fn(),
        },
      },
      embeddings: {
        create: jest.fn(),
      },
    } as any;

    // Default budget guard response
    mockGuardOpenAIOperation.mockResolvedValue({
      allowed: true,
      model: 'gpt-4',
      reason: null,
    });
  });

  describe('openaiWithCost', () => {
    it('should capture cost events for successful OpenAI calls', async () => {
      // Arrange
      const mockResponse = {
        id: 'chatcmpl-123',
        usage: {
          input_tokens: 100,
          output_tokens: 50,
          input_tokens_details: {
            cached_tokens: 20,
          },
        },
      };

      mockClient.chat.completions.create.mockResolvedValue(mockResponse as any);

      const args = {
        model: 'gpt-4',
        input: [{ role: 'user', content: 'Hello' }],
        meta: {
          sessionId: 'session-123',
          inboxId: 'inbox-456',
          userId: 'user-789',
          intent: 'greeting',
          traceId: 'trace-abc',
        },
      };

      // Act
      const result = await openaiWithCost(mockClient, args);

      // Assert
      expect(result).toEqual(mockResponse);
      expect(mockClient.chat.completions.create).toHaveBeenCalledWith({
        model: 'gpt-4',
        messages: args.input,
      });

      expect(mockQueue.addBulk).toHaveBeenCalledWith([
        {
          name: 'cost-event',
          data: expect.objectContaining({
            provider: 'OPENAI',
            product: 'gpt-4',
            unit: 'TOKENS_IN',
            units: 80, // 100 - 20 cached
            externalId: 'chatcmpl-123',
            sessionId: 'session-123',
            inboxId: 'inbox-456',
            userId: 'user-789',
            intent: 'greeting',
            traceId: 'trace-abc',
          }),
        },
        {
          name: 'cost-event',
          data: expect.objectContaining({
            unit: 'TOKENS_CACHED',
            units: 20,
          }),
        },
        {
          name: 'cost-event',
          data: expect.objectContaining({
            unit: 'TOKENS_OUT',
            units: 50,
          }),
        },
      ]);
    });

    it('should handle budget guard blocking operation', async () => {
      // Arrange
      mockGuardOpenAIOperation.mockResolvedValue({
        allowed: false,
        model: 'gpt-4',
        reason: 'Orçamento excedido',
      });

      const args = {
        model: 'gpt-4',
        input: [{ role: 'user', content: 'Hello' }],
        meta: { inboxId: 'inbox-456' },
      };

      // Act & Assert
      await expect(openaiWithCost(mockClient, args)).rejects.toThrow(BudgetExceededException);
      expect(mockClient.chat.completions.create).not.toHaveBeenCalled();
      expect(mockQueue.addBulk).not.toHaveBeenCalled();
    });

    it('should handle model downgrade', async () => {
      // Arrange
      mockGuardOpenAIOperation.mockResolvedValue({
        allowed: true,
        model: 'gpt-3.5-turbo', // Downgraded model
        reason: null,
      });

      const mockResponse = {
        id: 'chatcmpl-123',
        usage: {
          input_tokens: 100,
          output_tokens: 50,
        },
      };

      mockClient.chat.completions.create.mockResolvedValue(mockResponse as any);

      const args = {
        model: 'gpt-4', // Original model
        input: [{ role: 'user', content: 'Hello' }],
      };

      // Act
      const result = await openaiWithCost(mockClient, args);

      // Assert
      expect(mockClient.chat.completions.create).toHaveBeenCalledWith({
        model: 'gpt-3.5-turbo', // Should use downgraded model
        messages: args.input,
      });

      expect(mockQueue.addBulk).toHaveBeenCalledWith([
        {
          name: 'cost-event',
          data: expect.objectContaining({
            product: 'gpt-3.5-turbo', // Should track actual model used
            raw: expect.objectContaining({
              model: 'gpt-3.5-turbo',
              originalModel: 'gpt-4', // Should track original model
            }),
          }),
        },
      ]);
    });

    it('should handle errors gracefully', async () => {
      // Arrange
      const error = new Error('API Error');
      mockClient.chat.completions.create.mockRejectedValue(error);

      const args = {
        model: 'gpt-4',
        input: [{ role: 'user', content: 'Hello' }],
      };

      // Act & Assert
      await expect(openaiWithCost(mockClient, args)).rejects.toThrow('API Error');
      expect(mockQueue.addBulk).not.toHaveBeenCalled();
    });

    it('should skip events with zero units', async () => {
      // Arrange
      const mockResponse = {
        id: 'chatcmpl-123',
        usage: {
          input_tokens: 0,
          output_tokens: 0,
        },
      };

      mockClient.chat.completions.create.mockResolvedValue(mockResponse as any);

      const args = {
        model: 'gpt-4',
        input: [{ role: 'user', content: 'Hello' }],
      };

      // Act
      await openaiWithCost(mockClient, args);

      // Assert
      expect(mockQueue.addBulk).toHaveBeenCalledWith([]);
    });
  });

  describe('openaiChatWithCost', () => {
    it('should call openaiWithCost with correct parameters', async () => {
      // Arrange
      const mockResponse = {
        id: 'chatcmpl-123',
        usage: { input_tokens: 100, output_tokens: 50 },
      };

      mockClient.chat.completions.create.mockResolvedValue(mockResponse as any);

      const messages = [{ role: 'user' as const, content: 'Hello' }];
      const meta = { sessionId: 'session-123' };

      // Act
      const result = await openaiChatWithCost(mockClient, 'gpt-4', messages, meta);

      // Assert
      expect(result).toEqual(mockResponse);
      expect(mockClient.chat.completions.create).toHaveBeenCalledWith({
        model: 'gpt-4',
        messages,
      });
    });
  });

  describe('openaiEmbeddingWithCost', () => {
    it('should capture cost events for embedding calls', async () => {
      // Arrange
      const mockResponse = {
        data: [{ embedding: [0.1, 0.2, 0.3] }],
        usage: { total_tokens: 100 },
      };

      mockClient.embeddings.create.mockResolvedValue(mockResponse as any);

      const input = 'Text to embed';
      const meta = { sessionId: 'session-123' };

      // Act
      const result = await openaiEmbeddingWithCost(mockClient, 'text-embedding-ada-002', input, meta);

      // Assert
      expect(result).toEqual(mockResponse);
      expect(mockClient.embeddings.create).toHaveBeenCalledWith({
        model: 'text-embedding-ada-002',
        input,
      });

      expect(mockQueue.add).toHaveBeenCalledWith('cost-event', {
        ts: expect.any(String),
        provider: 'OPENAI',
        product: 'text-embedding-ada-002',
        unit: 'TOKENS_IN',
        units: 100,
        externalId: expect.stringContaining('embedding-'),
        sessionId: 'session-123',
        raw: expect.objectContaining({
          usage: mockResponse.usage,
          inputType: 'string',
          inputLength: 1,
        }),
      });
    });

    it('should handle array input', async () => {
      // Arrange
      const mockResponse = {
        data: [{ embedding: [0.1, 0.2, 0.3] }],
        usage: { total_tokens: 200 },
      };

      mockClient.embeddings.create.mockResolvedValue(mockResponse as any);

      const input = ['Text 1', 'Text 2'];

      // Act
      await openaiEmbeddingWithCost(mockClient, 'text-embedding-ada-002', input);

      // Assert
      expect(mockQueue.add).toHaveBeenCalledWith('cost-event', {
        ts: expect.any(String),
        provider: 'OPENAI',
        product: 'text-embedding-ada-002',
        unit: 'TOKENS_IN',
        units: 200,
        externalId: expect.stringContaining('embedding-'),
        raw: expect.objectContaining({
          inputType: 'array',
          inputLength: 2,
        }),
      });
    });
  });
});