/**
 * Tests for OpenAI Structured Output Client
 */

import { z } from 'zod';
import { OpenAIStructuredClient, createOpenAIClient } from '../../../lib/ai-integration/services/openai-client';

// Mock OpenAI
jest.mock('openai');

const mockOpenAI = {
  chat: {
    completions: {
      create: jest.fn(),
    },
  },
};

// Mock the OpenAI constructor
const OpenAIMock = jest.fn().mockImplementation(() => mockOpenAI);
require('openai').default = OpenAIMock;

describe('OpenAIStructuredClient', () => {
  let client: OpenAIStructuredClient;
  
  const mockConfig = {
    apiKey: 'test-key',
    model: 'gpt-4o-mini',
    maxTokens: 1000,
    temperature: 0.7,
    timeoutMs: 10000,
    retryAttempts: 3,
    circuitBreaker: {
      failureThreshold: 5,
      recoveryTimeout: 30000,
      monitoringWindow: 60000,
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    client = new OpenAIStructuredClient(mockConfig);
  });

  describe('generateStructuredOutput', () => {
    const testSchema = z.object({
      text: z.string().max(100),
      buttons: z.array(z.object({
        title: z.string().max(20),
        id: z.string(),
      })).optional(),
    });

    it('should generate structured output successfully', async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: JSON.stringify({
              text: 'Hello, how can I help?',
              buttons: [{ title: 'Help', id: 'help' }],
            }),
          },
        }],
        usage: { total_tokens: 50 },
      };

      mockOpenAI.chat.completions.create.mockResolvedValue(mockResponse);

      const result = await client.generateStructuredOutput({
        schema: testSchema,
        systemPrompt: 'You are a helpful assistant',
        userPrompt: 'Generate a response',
      });

      expect(result.success).toBe(true);
      expect(result.result).toEqual({
        text: 'Hello, how can I help?',
        buttons: [{ title: 'Help', id: 'help' }],
      });
      expect(result.tokensUsed).toBe(50);
    });

    it('should handle circuit breaker OPEN state', async () => {
      // Create a client with faster circuit breaker for testing
      const fastClient = new OpenAIStructuredClient({
        ...mockConfig,
        retryAttempts: 0, // No retries to speed up test
        circuitBreaker: {
          failureThreshold: 2, // Lower threshold
          recoveryTimeout: 1000, // Shorter recovery
          monitoringWindow: 5000, // Shorter window
        },
      });

      const error = new Error('API Error');
      (error as any).status = 500;
      
      mockOpenAI.chat.completions.create.mockRejectedValue(error);

      // Trigger failures to open circuit breaker
      await fastClient.generateStructuredOutput({
        schema: testSchema,
        systemPrompt: 'test',
        userPrompt: 'test',
      });
      
      await fastClient.generateStructuredOutput({
        schema: testSchema,
        systemPrompt: 'test',
        userPrompt: 'test',
      });

      // Next call should be blocked by circuit breaker
      const result = await fastClient.generateStructuredOutput({
        schema: testSchema,
        systemPrompt: 'test',
        userPrompt: 'test',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Circuit breaker is OPEN');
    }, 10000);

    it('should retry on retryable errors', async () => {
      const error = new Error('Rate limited');
      (error as any).status = 429;
      
      mockOpenAI.chat.completions.create
        .mockRejectedValueOnce(error)
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce({
          choices: [{ message: { content: '{"text": "success"}' } }],
          usage: { total_tokens: 10 },
        });

      const result = await client.generateStructuredOutput({
        schema: z.object({ text: z.string() }),
        systemPrompt: 'test',
        userPrompt: 'test',
      });

      expect(result.success).toBe(true);
      expect(mockOpenAI.chat.completions.create).toHaveBeenCalledTimes(3);
    });

    it('should not retry on non-retryable errors', async () => {
      const error = new Error('Bad request');
      (error as any).status = 400;
      
      mockOpenAI.chat.completions.create.mockRejectedValue(error);

      const result = await client.generateStructuredOutput({
        schema: z.object({ text: z.string() }),
        systemPrompt: 'test',
        userPrompt: 'test',
      });

      expect(result.success).toBe(false);
      expect(mockOpenAI.chat.completions.create).toHaveBeenCalledTimes(1);
    });

    it('should apply economic mode constraints', async () => {
      mockOpenAI.chat.completions.create.mockResolvedValue({
        choices: [{ message: { content: '{"text": "short"}' } }],
        usage: { total_tokens: 5 },
      });

      await client.generateStructuredOutput({
        schema: z.object({ text: z.string() }),
        systemPrompt: 'test',
        userPrompt: 'test',
        economicMode: true,
      });

      const call = mockOpenAI.chat.completions.create.mock.calls[0][0];
      expect(call.max_tokens).toBe(200); // Economic mode limit
    });
  });

  describe('createOpenAIClient', () => {
    it('should create client with default config', () => {
      const client = createOpenAIClient();
      expect(client).toBeInstanceOf(OpenAIStructuredClient);
    });

    it('should create client with overrides', () => {
      const client = createOpenAIClient({ model: 'custom-model' });
      expect(client).toBeInstanceOf(OpenAIStructuredClient);
    });
  });

  describe('healthCheck', () => {
    it('should return true when API is healthy', async () => {
      mockOpenAI.chat.completions.create.mockResolvedValue({
        choices: [{ message: { content: 'test' } }],
      });

      const isHealthy = await client.healthCheck();
      expect(isHealthy).toBe(true);
    });

    it('should return false when API is unhealthy', async () => {
      mockOpenAI.chat.completions.create.mockRejectedValue(new Error('API down'));

      const isHealthy = await client.healthCheck();
      expect(isHealthy).toBe(false);
    });
  });
});