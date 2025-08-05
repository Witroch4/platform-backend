/**
 * Unit tests for Chatwit API client
 * Tests message posting and error handling
 */

import { ChatwitApiClient } from '@/lib/ai-integration/services/chatwit-api-client';
import axios from 'axios';

// Mock axios and dependencies
jest.mock('axios');

const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('ChatwitApiClient', () => {
  let chatwitClient: ChatwitApiClient;
  let mockAxiosInstance: any;

  beforeEach(() => {
    // Create a mock axios instance
    mockAxiosInstance = {
      post: jest.fn(),
      get: jest.fn(),
      put: jest.fn(),
      interceptors: {
        request: {
          use: jest.fn()
        },
        response: {
          use: jest.fn()
        }
      }
    };

    mockedAxios.create.mockReturnValue(mockAxiosInstance);

    chatwitClient = new ChatwitApiClient({
      baseUrl: 'https://chatwit.example.com',
      accessToken: 'test-token',
      timeout: 10000,
      retryConfig: {
        maxRetries: 3,
        baseDelay: 1000,
        maxDelay: 8000
      }
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('postBotMessage', () => {
    const testParams = {
      accountId: 123,
      conversationId: 456,
      content: 'Test message',
      channel: 'whatsapp' as const,
      traceId: 'trace-123',
    };

    it('should post message successfully', async () => {
      const mockResponse = {
        status: 200,
        data: { 
          id: 789, 
          content: 'Test message',
          message_type: 'outgoing',
          created_at: '2023-01-01T00:00:00Z',
          conversation_id: 456,
          account_id: 123
        },
      };

      mockAxiosInstance.post.mockResolvedValue(mockResponse);

      const result = await chatwitClient.postBotMessage(testParams);

      expect(result.id).toBe(789);
      expect(result.content).toBe('Test message');
      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        `/api/v1/accounts/123/conversations/456/messages`,
        expect.objectContaining({
          content: 'Test message',
          message_type: 'outgoing'
        }),
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Trace-ID': 'trace-123'
          })
        })
      );
    });

    it('should post interactive message with content_attributes', async () => {
      const paramsWithInteractive = {
        ...testParams,
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
      };

      const mockResponse = {
        status: 200,
        data: { 
          id: 789, 
          content: 'Interactive message',
          message_type: 'outgoing',
          created_at: '2023-01-01T00:00:00Z',
          conversation_id: 456,
          account_id: 123
        },
      };

      mockAxiosInstance.post.mockResolvedValue(mockResponse);

      const result = await chatwitClient.postBotMessage(paramsWithInteractive);

      expect(result.id).toBe(789);
      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        `/api/v1/accounts/123/conversations/456/messages`,
        expect.objectContaining({
          content: 'Test message',
          message_type: 'outgoing',
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
          }
        }),
        expect.any(Object)
      );
    });

    it('should handle 4xx errors without retry', async () => {
      const error = {
        response: {
          status: 400,
          data: { message: 'Bad Request' }
        },
        isAxiosError: true,
        message: 'Bad Request'
      };

      mockAxiosInstance.post.mockRejectedValue(error);

      await expect(chatwitClient.postBotMessage(testParams)).rejects.toThrow();
    });

    it('should handle 5xx errors with retry', async () => {
      const error = {
        response: {
          status: 500,
          data: { message: 'Internal Server Error' }
        },
        isAxiosError: true,
        message: 'Internal Server Error'
      };

      mockAxiosInstance.post.mockRejectedValue(error);

      await expect(chatwitClient.postBotMessage(testParams)).rejects.toThrow();
    });

    it('should handle 429 rate limiting with Retry-After header', async () => {
      const error = {
        response: {
          status: 429,
          headers: { 'retry-after': '5' },
          data: { message: 'Rate Limited' }
        },
        isAxiosError: true,
        message: 'Too Many Requests'
      };

      mockAxiosInstance.post.mockRejectedValue(error);

      await expect(chatwitClient.postBotMessage(testParams)).rejects.toThrow();
    });

    it('should handle network errors', async () => {
      const error = new Error('ECONNREFUSED: Connection refused');
      mockAxiosInstance.post.mockRejectedValue(error);

      await expect(chatwitClient.postBotMessage(testParams)).rejects.toThrow();
    });

    it('should handle timeout errors', async () => {
      const error = new Error('ETIMEDOUT: Request timeout');
      mockAxiosInstance.post.mockRejectedValue(error);

      await expect(chatwitClient.postBotMessage(testParams)).rejects.toThrow();
    });

    it('should include proper headers for different channels', async () => {
      const mockResponse = {
        status: 200,
        data: { 
          id: 789, 
          content: 'Test message',
          message_type: 'outgoing',
          created_at: '2023-01-01T00:00:00Z',
          conversation_id: 456,
          account_id: 123
        },
      };

      mockAxiosInstance.post.mockResolvedValue(mockResponse);

      await chatwitClient.postBotMessage({
        ...testParams,
        channel: 'instagram'
      });

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          additional_attributes: expect.objectContaining({
            channel: 'instagram'
          })
        }),
        expect.any(Object)
      );
    });
  });

  describe('getConversationStatus', () => {
    it('should get conversation status successfully', async () => {
      const mockResponse = {
        status: 200,
        data: { 
          id: 456,
          status: 'open',
          account_id: 123
        },
      };

      mockAxiosInstance.get.mockResolvedValue(mockResponse);

      const result = await chatwitClient.getConversationStatus(123, 456, 'trace-123');

      expect(result.status).toBe('open');
      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        `/api/v1/accounts/123/conversations/456`,
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Trace-ID': 'trace-123'
          })
        })
      );
    });

    it('should handle conversation not found', async () => {
      const error = {
        response: {
          status: 404,
          data: { message: 'Conversation not found' }
        },
        isAxiosError: true,
        message: 'Not Found'
      };

      mockAxiosInstance.get.mockRejectedValue(error);

      await expect(chatwitClient.getConversationStatus(123, 456, 'trace-123')).rejects.toThrow();
    });
  });

  describe('updateConversationStatus', () => {
    it('should update conversation status successfully', async () => {
      const mockResponse = {
        status: 200,
        data: { 
          id: 456,
          status: 'closed',
          account_id: 123
        },
      };

      mockAxiosInstance.put.mockResolvedValue(mockResponse);

      const result = await chatwitClient.updateConversationStatus(123, 456, 'closed', 'trace-123');

      expect(result.status).toBe('closed');
      expect(mockAxiosInstance.put).toHaveBeenCalledWith(
        `/api/v1/accounts/123/conversations/456`,
        { status: 'closed' },
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Trace-ID': 'trace-123'
          })
        })
      );
    });
  });

  describe('assignConversation', () => {
    it('should assign conversation to agent successfully', async () => {
      const mockResponse = {
        status: 200,
        data: { 
          id: 456,
          assigned_to: 'agent-123',
          account_id: 123
        },
      };

      mockAxiosInstance.put.mockResolvedValue(mockResponse);

      const result = await chatwitClient.assignConversation(123, 456, 'agent-123', 'trace-123');

      expect(result.assigned_to).toBe('agent-123');
      expect(mockAxiosInstance.put).toHaveBeenCalledWith(
        `/api/v1/accounts/123/conversations/456/assign`,
        { agent_id: 'agent-123' },
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Trace-ID': 'trace-123'
          })
        })
      );
    });
  });

  describe('addConversationLabels', () => {
    it('should add labels to conversation successfully', async () => {
      const mockResponse = {
        status: 200,
        data: { 
          id: 456,
          labels: ['urgent', 'support'],
          account_id: 123
        },
      };

      mockAxiosInstance.post.mockResolvedValue(mockResponse);

      const result = await chatwitClient.addConversationLabels(123, 456, ['urgent', 'support'], 'trace-123');

      expect(result.labels).toContain('urgent');
      expect(result.labels).toContain('support');
      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        `/api/v1/accounts/123/conversations/456/labels`,
        { labels: ['urgent', 'support'] },
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Trace-ID': 'trace-123'
          })
        })
      );
    });
  });
});