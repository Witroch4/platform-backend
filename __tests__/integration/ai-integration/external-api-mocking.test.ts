/**
 * Integration tests for external API integrations with mocking
 * Tests OpenAI API and Chatwit API integrations
 */

import nock from 'nock';
import { OpenAIClientService } from '@/lib/ai-integration/services/openai-client';
import { ChatwitApiClient } from '@/lib/ai-integration/services/chatwit-api-client';
import { ChatwitErrorHandler } from '@/lib/ai-integration/services/chatwit-error-handler';

describe('External API Integration with Mocking', () => {
  beforeEach(() => {
    // Clean all HTTP mocks before each test
    nock.cleanAll();
  });

  afterEach(() => {
    // Verify all mocks were used
    if (!nock.isDone()) {
      console.warn('Unused nock interceptors:', nock.pendingMocks());
    }
    nock.cleanAll();
  });

  describe('OpenAI API Integration', () => {
    let openaiClient: OpenAIClientService;

    beforeEach(() => {
      openaiClient = new OpenAIClientService({
        apiKey: 'test-api-key',
        model: 'gpt-4o-mini',
        timeout: 10000,
      });
    });

    it('should generate structured output successfully', async () => {
      const mockResponse = {
        id: 'chatcmpl-123',
        object: 'chat.completion',
        created: 1677652288,
        model: 'gpt-4o-mini',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: JSON.stringify({
                body: 'Como posso ajudar você?',
                buttons: [
                  { title: 'Rastrear', id: 'intent:track' },
                  { title: 'Cancelar', id: 'intent:cancel' },
                ],
              }),
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 50,
          completion_tokens: 30,
          total_tokens: 80,
        },
      };

      nock('https://api.openai.com')
        .post('/v1/chat/completions')
        .reply(200, mockResponse);

      const result = await openaiClient.generateStructuredOutput({
        messages: [
          {
            role: 'user',
            content: 'Preciso de ajuda com meu pedido',
          },
        ],
        schema: {
          type: 'object',
          required: ['body', 'buttons'],
          properties: {
            body: { type: 'string' },
            buttons: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  title: { type: 'string' },
                  id: { type: 'string' },
                },
              },
            },
          },
        },
      });

      expect(result.success).toBe(true);
      expect(result.response.body).toBe('Como posso ajudar você?');
      expect(result.response.buttons).toHaveLength(2);
      expect(result.tokensUsed).toBe(80);
    });

    it('should handle OpenAI API rate limiting', async () => {
      nock('https://api.openai.com')
        .post('/v1/chat/completions')
        .reply(429, {
          error: {
            message: 'Rate limit exceeded',
            type: 'rate_limit_exceeded',
          },
        }, {
          'retry-after': '60',
        });

      const result = await openaiClient.generateStructuredOutput({
        messages: [{ role: 'user', content: 'Test' }],
        schema: { type: 'object', properties: {} },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Rate limit exceeded');
      expect(result.retryAfter).toBe(60000);
    });

    it('should handle OpenAI API server errors', async () => {
      nock('https://api.openai.com')
        .post('/v1/chat/completions')
        .reply(500, {
          error: {
            message: 'Internal server error',
            type: 'server_error',
          },
        });

      const result = await openaiClient.generateStructuredOutput({
        messages: [{ role: 'user', content: 'Test' }],
        schema: { type: 'object', properties: {} },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Internal server error');
      expect(result.shouldRetry).toBe(true);
    });

    it('should handle network timeouts', async () => {
      nock('https://api.openai.com')
        .post('/v1/chat/completions')
        .delayConnection(15000) // Longer than timeout
        .reply(200, {});

      const result = await openaiClient.generateStructuredOutput({
        messages: [{ role: 'user', content: 'Test' }],
        schema: { type: 'object', properties: {} },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('timeout');
      expect(result.shouldRetry).toBe(true);
    });

    it('should generate embeddings successfully', async () => {
      const mockResponse = {
        object: 'list',
        data: [
          {
            object: 'embedding',
            embedding: [0.1, 0.2, 0.3, 0.4, 0.5],
            index: 0,
          },
        ],
        model: 'text-embedding-3-small',
        usage: {
          prompt_tokens: 10,
          total_tokens: 10,
        },
      };

      nock('https://api.openai.com')
        .post('/v1/embeddings')
        .reply(200, mockResponse);

      const result = await openaiClient.generateEmbedding('Rastrear pedido');

      expect(result.success).toBe(true);
      expect(result.embedding).toEqual([0.1, 0.2, 0.3, 0.4, 0.5]);
      expect(result.tokensUsed).toBe(10);
    });

    it('should handle malformed JSON responses', async () => {
      nock('https://api.openai.com')
        .post('/v1/chat/completions')
        .reply(200, {
          choices: [
            {
              message: {
                content: 'Invalid JSON response',
              },
            },
          ],
          usage: { total_tokens: 20 },
        });

      const result = await openaiClient.generateStructuredOutput({
        messages: [{ role: 'user', content: 'Test' }],
        schema: { type: 'object', properties: {} },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('JSON');
    });
  });

  describe('Chatwit API Integration', () => {
    let chatwitClient: ChatwitApiClient;
    let errorHandler: ChatwitErrorHandler;

    beforeEach(() => {
      errorHandler = new ChatwitErrorHandler();
      chatwitClient = new ChatwitApiClient({
        baseUrl: 'https://chatwit.example.com',
        accessToken: 'test-token',
        timeout: 10000,
        errorHandler,
      });
    });

    it('should post bot message successfully', async () => {
      const mockResponse = {
        id: 999,
        content: 'Test message',
        message_type: 'outgoing',
        created_at: '2024-01-01T00:00:00Z',
      };

      nock('https://chatwit.example.com')
        .post('/api/v1/accounts/123/conversations/456/messages')
        .reply(200, mockResponse);

      const result = await chatwitClient.postBotMessage({
        accountId: 123,
        conversationId: 456,
        content: 'Test message',
        channel: 'whatsapp',
        traceId: 'trace-123',
      });

      expect(result.success).toBe(true);
      expect(result.messageId).toBe(999);
    });

    it('should post interactive message with content_attributes', async () => {
      const mockResponse = {
        id: 999,
        content: 'Interactive message',
        message_type: 'outgoing',
      };

      const expectedPayload = {
        content: 'Choose an option',
        message_type: 'outgoing',
        private: false,
        content_attributes: {
          interactive: {
            type: 'button',
            body: { text: 'Choose an option' },
            action: {
              buttons: [
                { type: 'reply', reply: { id: 'opt1', title: 'Option 1' } },
              ],
            },
          },
        },
        additional_attributes: {
          provider: 'meta',
          channel: 'whatsapp',
          schema_version: '1.0.0',
          trace_id: 'trace-123',
        },
      };

      nock('https://chatwit.example.com')
        .post('/api/v1/accounts/123/conversations/456/messages', expectedPayload)
        .reply(200, mockResponse);

      const result = await chatwitClient.postBotMessage({
        accountId: 123,
        conversationId: 456,
        content: 'Choose an option',
        contentAttributes: {
          interactive: {
            type: 'button',
            body: { text: 'Choose an option' },
            action: {
              buttons: [
                { type: 'reply', reply: { id: 'opt1', title: 'Option 1' } },
              ],
            },
          },
        },
        channel: 'whatsapp',
        traceId: 'trace-123',
      });

      expect(result.success).toBe(true);
    });

    it('should handle Chatwit API authentication errors', async () => {
      nock('https://chatwit.example.com')
        .post('/api/v1/accounts/123/conversations/456/messages')
        .reply(401, {
          error: 'Invalid access token',
        });

      const result = await chatwitClient.postBotMessage({
        accountId: 123,
        conversationId: 456,
        content: 'Test message',
        channel: 'whatsapp',
        traceId: 'trace-123',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid access token');
      expect(result.shouldRetry).toBe(false);
    });

    it('should handle Chatwit API rate limiting', async () => {
      nock('https://chatwit.example.com')
        .post('/api/v1/accounts/123/conversations/456/messages')
        .reply(429, {
          error: 'Rate limit exceeded',
        }, {
          'retry-after': '30',
        });

      const result = await chatwitClient.postBotMessage({
        accountId: 123,
        conversationId: 456,
        content: 'Test message',
        channel: 'whatsapp',
        traceId: 'trace-123',
      });

      expect(result.success).toBe(false);
      expect(result.shouldRetry).toBe(true);
      expect(result.retryAfter).toBe(30000);
    });

    it('should handle Chatwit API server errors', async () => {
      nock('https://chatwit.example.com')
        .post('/api/v1/accounts/123/conversations/456/messages')
        .reply(500, {
          error: 'Internal server error',
        });

      const result = await chatwitClient.postBotMessage({
        accountId: 123,
        conversationId: 456,
        content: 'Test message',
        channel: 'whatsapp',
        traceId: 'trace-123',
      });

      expect(result.success).toBe(false);
      expect(result.shouldRetry).toBe(true);
    });

    it('should get conversation status successfully', async () => {
      const mockResponse = {
        id: 456,
        status: 'open',
        assignee: {
          id: 1,
          name: 'Agent Smith',
        },
        labels: ['support', 'priority'],
      };

      nock('https://chatwit.example.com')
        .get('/api/v1/accounts/123/conversations/456')
        .reply(200, mockResponse);

      const result = await chatwitClient.getConversationStatus(123, 456);

      expect(result.success).toBe(true);
      expect(result.data.status).toBe('open');
      expect(result.data.assignee.name).toBe('Agent Smith');
    });

    it('should update conversation status successfully', async () => {
      const mockResponse = {
        id: 456,
        status: 'resolved',
      };

      nock('https://chatwit.example.com')
        .patch('/api/v1/accounts/123/conversations/456')
        .reply(200, mockResponse);

      const result = await chatwitClient.updateConversationStatus(123, 456, 'resolved');

      expect(result.success).toBe(true);
    });

    it('should assign conversation to agent successfully', async () => {
      const mockResponse = {
        id: 456,
        assignee_id: 789,
      };

      nock('https://chatwit.example.com')
        .patch('/api/v1/accounts/123/conversations/456')
        .reply(200, mockResponse);

      const result = await chatwitClient.assignConversation(123, 456, 789);

      expect(result.success).toBe(true);
    });

    it('should add conversation labels successfully', async () => {
      const mockResponse = {
        labels: ['ai_handoff', 'support'],
      };

      nock('https://chatwit.example.com')
        .post('/api/v1/accounts/123/conversations/456/labels')
        .reply(200, mockResponse);

      const result = await chatwitClient.addConversationLabels(123, 456, ['ai_handoff']);

      expect(result.success).toBe(true);
    });

    it('should handle network connectivity issues', async () => {
      nock('https://chatwit.example.com')
        .post('/api/v1/accounts/123/conversations/456/messages')
        .replyWithError({
          code: 'ECONNREFUSED',
          message: 'Connection refused',
        });

      const result = await chatwitClient.postBotMessage({
        accountId: 123,
        conversationId: 456,
        content: 'Test message',
        channel: 'whatsapp',
        traceId: 'trace-123',
      });

      expect(result.success).toBe(false);
      expect(result.shouldRetry).toBe(true);
      expect(result.error).toContain('Connection refused');
    });
  });

  describe('API Integration Resilience', () => {
    it('should handle partial service failures gracefully', async () => {
      // Mock OpenAI success but Chatwit failure
      nock('https://api.openai.com')
        .post('/v1/chat/completions')
        .reply(200, {
          choices: [
            {
              message: {
                content: JSON.stringify({
                  body: 'Generated response',
                  buttons: [],
                }),
              },
            },
          ],
          usage: { total_tokens: 50 },
        });

      nock('https://chatwit.example.com')
        .post('/api/v1/accounts/123/conversations/456/messages')
        .reply(500, { error: 'Server error' });

      const openaiClient = new OpenAIClientService({
        apiKey: 'test-key',
        model: 'gpt-4o-mini',
        timeout: 10000,
      });

      const chatwitClient = new ChatwitApiClient({
        baseUrl: 'https://chatwit.example.com',
        accessToken: 'test-token',
        timeout: 10000,
        errorHandler: new ChatwitErrorHandler(),
      });

      // OpenAI should succeed
      const llmResult = await openaiClient.generateStructuredOutput({
        messages: [{ role: 'user', content: 'Test' }],
        schema: { type: 'object', properties: {} },
      });

      expect(llmResult.success).toBe(true);

      // Chatwit should fail but indicate retry
      const chatwitResult = await chatwitClient.postBotMessage({
        accountId: 123,
        conversationId: 456,
        content: 'Test',
        channel: 'whatsapp',
        traceId: 'trace-123',
      });

      expect(chatwitResult.success).toBe(false);
      expect(chatwitResult.shouldRetry).toBe(true);
    });

    it('should handle API response format changes', async () => {
      // Mock unexpected response format
      nock('https://api.openai.com')
        .post('/v1/chat/completions')
        .reply(200, {
          // Missing expected fields
          unexpected_field: 'value',
        });

      const openaiClient = new OpenAIClientService({
        apiKey: 'test-key',
        model: 'gpt-4o-mini',
        timeout: 10000,
      });

      const result = await openaiClient.generateStructuredOutput({
        messages: [{ role: 'user', content: 'Test' }],
        schema: { type: 'object', properties: {} },
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});