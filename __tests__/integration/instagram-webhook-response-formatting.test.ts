/**
 * Integration tests for Instagram webhook response formatting
 * Tests the complete flow from webhook to Dialogflow response
 */

import { POST } from '@/app/api/admin/mtf-diamante/dialogflow/webhook/route';
import { detectChannelType } from '@/lib/webhook-utils';
import { createInstagramFallbackMessage } from '@/lib/instagram/payload-builder';

// Mock the Instagram translation queue and worker
jest.mock('@/lib/queue/instagram-translation.queue', () => ({
  addInstagramTranslationJob: jest.fn().mockResolvedValue('job-123'),
  createInstagramTranslationJob: jest.fn().mockImplementation((data) => data),
  waitForInstagramTranslationResult: jest.fn(),
  generateCorrelationId: jest.fn().mockReturnValue('test-correlation-id'),
  logWithCorrelationId: jest.fn(),
}));

// Mock the main webhook queue
jest.mock('@/lib/queue/mtf-diamante-webhook.queue', () => ({
  addStoreMessageTask: jest.fn(),
  addUpdateApiKeyTask: jest.fn(),
  addProcessIntentTask: jest.fn(),
  addSendMessageTask: jest.fn(),
  addSendReactionTask: jest.fn(),
  addProcessButtonClickTask: jest.fn(),
  generateCorrelationId: jest.fn().mockReturnValue('test-correlation-id'),
  createTemplateMessageTask: jest.fn(),
  createInteractiveMessageTask: jest.fn(),
  createReactionTask: jest.fn(),
  createTextReactionTask: jest.fn(),
  logWithCorrelationId: jest.fn(),
}));

// Mock the database queries
jest.mock('@/lib/dialogflow-database-queries', () => ({
  findCompleteMessageMappingByIntent: jest.fn(),
}));

// Mock webhook utils
jest.mock('@/lib/webhook-utils', () => ({
  ...jest.requireActual('@/lib/webhook-utils'),
  extractWebhookData: jest.fn().mockReturnValue({
    whatsappApiKey: 'test-api-key',
    messageId: 'msg-123',
    conversationId: 'conv-123',
    contactPhone: '1234567890',
    inboxId: '4',
    intentName: 'test-intent',
  }),
}));

// Mock other dependencies
jest.mock('@/lib/monitoring/application-performance-monitor', () => ({
  recordWebhookMetrics: jest.fn(),
}));

jest.mock('@/lib/feature-flags/feature-flag-manager', () => ({
  FeatureFlagManager: {
    getInstance: jest.fn().mockReturnValue({
      isEnabled: jest.fn().mockResolvedValue(false),
    }),
  },
}));

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('ioredis', () => ({
  Redis: jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    connect: jest.fn(),
    disconnect: jest.fn(),
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    // Add other Redis methods as needed
  })),
}));

const { waitForInstagramTranslationResult } = require('@/lib/queue/instagram-translation.queue');

describe('Instagram Webhook Response Formatting Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Successful Instagram Translation', () => {
    it('should return properly formatted Generic Template response', async () => {
      // Mock successful translation result with Generic Template
      const mockGenericTemplateResult = {
        success: true,
        fulfillmentMessages: [
          {
            custom_payload: {
              instagram: {
                template_type: 'generic',
                elements: [
                  {
                    title: 'Hello Instagram',
                    subtitle: 'This is a subtitle',
                    image_url: 'https://example.com/image.jpg',
                    buttons: [
                      {
                        type: 'postback',
                        title: 'Click Me',
                        payload: 'button_1',
                      },
                    ],
                  },
                ],
              },
            },
          },
        ],
        processingTime: 150,
      };

      waitForInstagramTranslationResult.mockResolvedValue(mockGenericTemplateResult);

      const instagramWebhookRequest = {
        originalDetectIntentRequest: {
          payload: {
            channel_type: 'Channel::Instagram',
            whatsapp_api_key: 'test-api-key',
            message_id: 'msg-123',
            conversation_id: 'conv-123',
            contact_phone: '+1234567890',
            inbox_id: '4',
            wamid: 'wamid.123',
            from: '+1234567890',
          },
        },
        queryResult: {
          intent: {
            displayName: 'test-intent',
          },
          parameters: {},
        },
        session: 'projects/test/sessions/session-123',
      };

      const request = new Request('http://localhost/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(instagramWebhookRequest),
      });

      const response = await POST(request);
      const responseData = await response.json();

      // Verify response structure
      expect(response.status).toBe(200);
      expect(responseData).toHaveProperty('fulfillmentMessages');
      expect(responseData.fulfillmentMessages).toHaveLength(1);

      // Verify Instagram payload structure
      const fulfillmentMessage = responseData.fulfillmentMessages[0];
      expect(fulfillmentMessage).toHaveProperty('custom_payload');
      expect(fulfillmentMessage.custom_payload).toHaveProperty('instagram');

      const instagramPayload = fulfillmentMessage.custom_payload.instagram;
      expect(instagramPayload.template_type).toBe('generic');
      expect(instagramPayload.elements).toHaveLength(1);
      expect(instagramPayload.elements[0].title).toBe('Hello Instagram');
      expect(instagramPayload.elements[0].subtitle).toBe('This is a subtitle');
      expect(instagramPayload.elements[0].image_url).toBe('https://example.com/image.jpg');
      expect(instagramPayload.elements[0].buttons).toHaveLength(1);

      // Verify response headers
      expect(response.headers.get('Content-Type')).toBe('application/json');
      expect(response.headers.get('X-Correlation-ID')).toBeTruthy();
      expect(response.headers.get('X-Processing-Time')).toBe('150');
    });

    it('should return properly formatted Button Template response', async () => {
      // Mock successful translation result with Button Template
      const mockButtonTemplateResult = {
        success: true,
        fulfillmentMessages: [
          {
            custom_payload: {
              instagram: {
                template_type: 'button',
                text: 'This is a longer message that uses the Button Template format for Instagram because it exceeds 80 characters.',
                buttons: [
                  {
                    type: 'web_url',
                    title: 'Visit Site',
                    url: 'https://example.com',
                  },
                  {
                    type: 'postback',
                    title: 'Click Me',
                    payload: 'button_click',
                  },
                ],
              },
            },
          },
        ],
        processingTime: 200,
      };

      waitForInstagramTranslationResult.mockResolvedValue(mockButtonTemplateResult);

      const instagramWebhookRequest = {
        originalDetectIntentRequest: {
          payload: {
            channel_type: 'Channel::Instagram',
            whatsapp_api_key: 'test-api-key',
            message_id: 'msg-456',
            conversation_id: 'conv-456',
            contact_phone: '+1234567890',
            inbox_id: '4',
          },
        },
        queryResult: {
          intent: {
            displayName: 'long-message-intent',
          },
        },
        session: 'projects/test/sessions/session-456',
      };

      const request = new Request('http://localhost/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(instagramWebhookRequest),
      });

      const response = await POST(request);
      const responseData = await response.json();

      // Verify response structure
      expect(response.status).toBe(200);
      expect(responseData).toHaveProperty('fulfillmentMessages');
      expect(responseData.fulfillmentMessages).toHaveLength(1);

      // Verify Instagram payload structure
      const fulfillmentMessage = responseData.fulfillmentMessages[0];
      const instagramPayload = fulfillmentMessage.custom_payload.instagram;
      expect(instagramPayload.template_type).toBe('button');
      expect(instagramPayload.text).toContain('This is a longer message');
      expect(instagramPayload.buttons).toHaveLength(2);
      expect(instagramPayload.buttons[0].type).toBe('web_url');
      expect(instagramPayload.buttons[1].type).toBe('postback');

      // Verify response headers
      expect(response.headers.get('X-Processing-Time')).toBe('200');
    });
  });

  describe('Error Handling and Fallback Responses', () => {
    it('should return fallback response when translation fails', async () => {
      // Mock failed translation result
      const mockFailedResult = {
        success: false,
        error: 'Message body too long for Instagram (700 chars, max 640)',
        processingTime: 100,
      };

      waitForInstagramTranslationResult.mockResolvedValue(mockFailedResult);

      const instagramWebhookRequest = {
        originalDetectIntentRequest: {
          payload: {
            channel_type: 'Channel::Instagram',
            whatsapp_api_key: 'test-api-key',
            message_id: 'msg-error',
            conversation_id: 'conv-error',
            contact_phone: '+1234567890',
            inbox_id: '4',
          },
        },
        queryResult: {
          intent: {
            displayName: 'error-intent',
          },
        },
        session: 'projects/test/sessions/session-error',
      };

      const request = new Request('http://localhost/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(instagramWebhookRequest),
      });

      const response = await POST(request);
      const responseData = await response.json();

      // Verify fallback response structure
      expect(response.status).toBe(200);
      expect(responseData).toHaveProperty('fulfillmentMessages');
      expect(responseData.fulfillmentMessages).toHaveLength(1);

      // Verify Instagram fallback payload
      const fulfillmentMessage = responseData.fulfillmentMessages[0];
      expect(fulfillmentMessage).toHaveProperty('custom_payload');
      expect(fulfillmentMessage.custom_payload).toHaveProperty('instagram');

      const instagramPayload = fulfillmentMessage.custom_payload.instagram;
      expect(instagramPayload.template_type).toBe('button');
      expect(instagramPayload.text).toBe('Sua mensagem é muito longa para o Instagram. Tente uma mensagem mais curta.');
      expect(instagramPayload.buttons).toEqual([]);

      // Verify error headers
      expect(response.headers.get('X-Error')).toBeTruthy();
    });

    it('should return fallback response when translation times out', async () => {
      // Mock timeout result
      const mockTimeoutResult = {
        success: false,
        error: 'Translation timeout - response took too long',
        processingTime: 4500,
      };

      waitForInstagramTranslationResult.mockResolvedValue(mockTimeoutResult);

      const instagramWebhookRequest = {
        originalDetectIntentRequest: {
          payload: {
            channel_type: 'Channel::Instagram',
            whatsapp_api_key: 'test-api-key',
            message_id: 'msg-timeout',
            conversation_id: 'conv-timeout',
            contact_phone: '+1234567890',
            inbox_id: '4',
          },
        },
        queryResult: {
          intent: {
            displayName: 'timeout-intent',
          },
        },
        session: 'projects/test/sessions/session-timeout',
      };

      const request = new Request('http://localhost/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(instagramWebhookRequest),
      });

      const response = await POST(request);
      const responseData = await response.json();

      // Verify timeout fallback response
      expect(response.status).toBe(200);
      const instagramPayload = responseData.fulfillmentMessages[0].custom_payload.instagram;
      expect(instagramPayload.text).toBe('Processamento demorou muito. Tente novamente.');
    });

    it('should return fallback response when no message mapping found', async () => {
      // Mock no mapping result
      const mockNoMappingResult = {
        success: false,
        error: 'No message mapping found for intent: unknown-intent',
        processingTime: 50,
      };

      waitForInstagramTranslationResult.mockResolvedValue(mockNoMappingResult);

      const instagramWebhookRequest = {
        originalDetectIntentRequest: {
          payload: {
            channel_type: 'Channel::Instagram',
            whatsapp_api_key: 'test-api-key',
            message_id: 'msg-no-mapping',
            conversation_id: 'conv-no-mapping',
            contact_phone: '+1234567890',
            inbox_id: '4',
          },
        },
        queryResult: {
          intent: {
            displayName: 'unknown-intent',
          },
        },
        session: 'projects/test/sessions/session-no-mapping',
      };

      const request = new Request('http://localhost/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(instagramWebhookRequest),
      });

      const response = await POST(request);
      const responseData = await response.json();

      // Verify no mapping fallback response
      expect(response.status).toBe(200);
      const instagramPayload = responseData.fulfillmentMessages[0].custom_payload.instagram;
      expect(instagramPayload.text).toBe('Mensagem não configurada para Instagram.');
    });

    it('should handle invalid Instagram payload structure', async () => {
      // Mock result with invalid payload structure
      const mockInvalidResult = {
        success: true,
        fulfillmentMessages: [
          {
            // Missing custom_payload.instagram structure
            text: {
              text: ['Invalid structure'],
            },
          },
        ],
        processingTime: 75,
      };

      waitForInstagramTranslationResult.mockResolvedValue(mockInvalidResult);

      const instagramWebhookRequest = {
        originalDetectIntentRequest: {
          payload: {
            channel_type: 'Channel::Instagram',
            whatsapp_api_key: 'test-api-key',
            message_id: 'msg-invalid',
            conversation_id: 'conv-invalid',
            contact_phone: '+1234567890',
            inbox_id: '4',
          },
        },
        queryResult: {
          intent: {
            displayName: 'invalid-intent',
          },
        },
        session: 'projects/test/sessions/session-invalid',
      };

      const request = new Request('http://localhost/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(instagramWebhookRequest),
      });

      const response = await POST(request);
      const responseData = await response.json();

      // Verify fallback response for invalid payload
      expect(response.status).toBe(200);
      const instagramPayload = responseData.fulfillmentMessages[0].custom_payload.instagram;
      expect(instagramPayload.template_type).toBe('button');
      expect(instagramPayload.text).toBe('Desculpe, não foi possível processar sua mensagem no momento. Tente novamente.');
    });

    it('should handle empty fulfillment messages', async () => {
      // Mock result with empty fulfillment messages
      const mockEmptyResult = {
        success: true,
        fulfillmentMessages: [],
        processingTime: 25,
      };

      waitForInstagramTranslationResult.mockResolvedValue(mockEmptyResult);

      const instagramWebhookRequest = {
        originalDetectIntentRequest: {
          payload: {
            channel_type: 'Channel::Instagram',
            whatsapp_api_key: 'test-api-key',
            message_id: 'msg-empty',
            conversation_id: 'conv-empty',
            contact_phone: '+1234567890',
            inbox_id: '4',
          },
        },
        queryResult: {
          intent: {
            displayName: 'empty-intent',
          },
        },
        session: 'projects/test/sessions/session-empty',
      };

      const request = new Request('http://localhost/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(instagramWebhookRequest),
      });

      const response = await POST(request);
      const responseData = await response.json();

      // Verify fallback response for empty messages
      expect(response.status).toBe(200);
      expect(response.headers.get('X-Error')).toBe('Empty response from Instagram translation');
    });
  });

  describe('WhatsApp Backward Compatibility', () => {
    it('should not process WhatsApp requests through Instagram translation', async () => {
      const whatsappWebhookRequest = {
        originalDetectIntentRequest: {
          payload: {
            channel_type: 'Channel::WhatsApp', // WhatsApp channel
            whatsapp_api_key: 'test-api-key',
            message_id: 'msg-whatsapp',
            conversation_id: 'conv-whatsapp',
            contact_phone: '+1234567890',
            inbox_id: '4',
          },
        },
        queryResult: {
          intent: {
            displayName: 'whatsapp-intent',
          },
        },
        session: 'projects/test/sessions/session-whatsapp',
      };

      // Test channel detection
      const channelDetection = detectChannelType(whatsappWebhookRequest);
      expect(channelDetection.isInstagram).toBe(false);
      expect(channelDetection.channelType).toBe('Channel::WhatsApp');

      const request = new Request('http://localhost/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(whatsappWebhookRequest),
      });

      const response = await POST(request);

      // Should return 202 Accepted for WhatsApp (not Instagram translation)
      expect(response.status).toBe(202);
      
      // Should not call Instagram translation
      expect(waitForInstagramTranslationResult).not.toHaveBeenCalled();
    });
  });

  describe('Response Headers and Metadata', () => {
    it('should include proper response headers for successful Instagram translation', async () => {
      const mockSuccessResult = {
        success: true,
        fulfillmentMessages: [
          {
            custom_payload: {
              instagram: {
                template_type: 'generic',
                elements: [{ title: 'Test', buttons: [] }],
              },
            },
          },
        ],
        processingTime: 300,
      };

      waitForInstagramTranslationResult.mockResolvedValue(mockSuccessResult);

      const instagramWebhookRequest = {
        originalDetectIntentRequest: {
          payload: {
            channel_type: 'Channel::Instagram',
            whatsapp_api_key: 'test-api-key',
            message_id: 'msg-headers',
            conversation_id: 'conv-headers',
            contact_phone: '+1234567890',
            inbox_id: '4',
          },
        },
        queryResult: {
          intent: {
            displayName: 'headers-intent',
          },
        },
        session: 'projects/test/sessions/session-headers',
      };

      const request = new Request('http://localhost/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(instagramWebhookRequest),
      });

      const response = await POST(request);

      // Verify response headers
      expect(response.headers.get('Content-Type')).toBe('application/json');
      expect(response.headers.get('Cache-Control')).toBe('no-cache, no-store, must-revalidate');
      expect(response.headers.get('X-Correlation-ID')).toBeTruthy();
      expect(response.headers.get('X-Processing-Time')).toBe('300');
      expect(response.headers.get('X-Response-Time')).toBeTruthy();
    });
  });
});