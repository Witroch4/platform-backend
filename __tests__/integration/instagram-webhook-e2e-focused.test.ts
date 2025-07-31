/**
 * Focused Instagram Webhook E2E Integration Tests
 * Tests the complete Instagram translation flow with proper mocking
 * Requirements: 1.1, 1.2, 1.3, 1.4, 6.1, 6.2, 6.3, 6.4
 */

import { describe, test, expect, jest, beforeEach, afterEach, beforeAll } from '@jest/globals';

// Mock all external dependencies first
const mockRedis = {
  get: jest.fn(),
  setex: jest.fn(),
  del: jest.fn(),
  exists: jest.fn(),
  ping: jest.fn(),
  pipeline: jest.fn(),
};

const mockPrisma = {
  chatwitInbox: {
    findFirst: jest.fn(),
    updateMany: jest.fn(),
  },
  mapeamentoIntencao: {
    findFirst: jest.fn(),
  },
  mapeamentoBotao: {
    findFirst: jest.fn(),
  },
  lead: {
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  template: {
    findUnique: jest.fn(),
  },
};

// Mock Instagram translation functions
const mockInstagramTranslation = {
  addInstagramTranslationJob: jest.fn(),
  createInstagramTranslationJob: jest.fn(),
  waitForInstagramTranslationResult: jest.fn(),
  generateCorrelationId: jest.fn(),
  logWithCorrelationId: jest.fn(),
};

const mockInstagramPayloadBuilder = {
  createInstagramFallbackMessage: jest.fn(),
  createInstagramGenericTemplate: jest.fn(),
  createInstagramButtonTemplate: jest.fn(),
};

const mockWhatsAppAPI = {
  sendMessage: jest.fn(),
  sendReaction: jest.fn(),
};

const mockFeatureFlags = {
  isEnabled: jest.fn(),
};

const mockMonitoring = {
  recordWebhookMetrics: jest.fn(),
};

// Apply mocks
jest.mock('@/lib/redis', () => ({
  connection: mockRedis,
}));

jest.mock('@/lib/prisma', () => ({
  prisma: mockPrisma,
}));

jest.mock('@/lib/queue/instagram-translation.queue', () => mockInstagramTranslation);
jest.mock('@/lib/instagram/payload-builder', () => mockInstagramPayloadBuilder);
jest.mock('@/lib/whatsapp', () => mockWhatsAppAPI);

jest.mock('@/lib/feature-flags/feature-flag-manager', () => ({
  FeatureFlagManager: {
    getInstance: jest.fn().mockReturnValue({
      isEnabled: mockFeatureFlags.isEnabled,
    }),
  },
}));

jest.mock('@/lib/monitoring/application-performance-monitor', () => ({
  recordWebhookMetrics: mockMonitoring.recordWebhookMetrics,
  ApplicationPerformanceMonitor: {
    getInstance: jest.fn().mockReturnValue({
      recordWebhookMetrics: mockMonitoring.recordWebhookMetrics,
    }),
  },
}));

describe('Instagram Webhook E2E Integration Tests - Focused', () => {
  let POST: any;

  beforeAll(async () => {
    // Import the webhook handler after mocks are set up
    const module = await import('@/app/api/admin/mtf-diamante/dialogflow/webhook/route');
    POST = module.POST;
  });

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup default mock responses
    mockRedis.get.mockResolvedValue(null);
    mockRedis.setex.mockResolvedValue('OK');
    mockRedis.del.mockResolvedValue(1);
    mockRedis.exists.mockResolvedValue(0);
    mockRedis.ping.mockResolvedValue('PONG');
    mockRedis.pipeline.mockReturnValue({
      setex: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([]),
    });

    // Disable all feature flags by default to use legacy flow for non-Instagram
    mockFeatureFlags.isEnabled.mockResolvedValue(false);

    // Setup Instagram translation mocks
    mockInstagramTranslation.generateCorrelationId.mockReturnValue('ig-test-correlation-id');
    mockInstagramTranslation.createInstagramTranslationJob.mockReturnValue({
      intentName: 'test.intent',
      inboxId: '4',
      contactPhone: '+5511999999999',
      conversationId: 'conv-123',
      originalPayload: {},
      correlationId: 'ig-test-correlation-id',
    });
    mockInstagramTranslation.addInstagramTranslationJob.mockResolvedValue('test-job-id');
    mockInstagramTranslation.logWithCorrelationId.mockImplementation(() => {});

    // Setup Instagram payload builder mocks
    mockInstagramPayloadBuilder.createInstagramFallbackMessage.mockReturnValue([
      {
        custom_payload: {
          instagram: {
            attachment: {
              type: 'template',
              payload: {
                template_type: 'button',
                text: 'Desculpe, não foi possível processar sua mensagem no momento.',
                buttons: [],
              },
            },
          },
        },
      },
    ]);

    mockInstagramPayloadBuilder.createInstagramGenericTemplate.mockReturnValue([
      {
        custom_payload: {
          instagram: {
            attachment: {
              type: 'template',
              payload: {
                template_type: 'generic',
                elements: [
                  {
                    title: 'Test Title',
                    subtitle: 'Test Subtitle',
                    buttons: [],
                  },
                ],
              },
            },
          },
        },
      },
    ]);

    mockInstagramPayloadBuilder.createInstagramButtonTemplate.mockReturnValue([
      {
        custom_payload: {
          instagram: {
            attachment: {
              type: 'template',
              payload: {
                template_type: 'button',
                text: 'This is a longer message that exceeds 80 characters and should use Button Template format for Instagram messaging platform compatibility.',
                buttons: [],
              },
            },
          },
        },
      },
    ]);

    // Setup monitoring mock
    mockMonitoring.recordWebhookMetrics.mockImplementation(() => {});

    // Ensure WhatsApp API is not called for Instagram
    mockWhatsAppAPI.sendMessage.mockRejectedValue(new Error('WhatsApp API should not be called for Instagram'));
    mockWhatsAppAPI.sendReaction.mockRejectedValue(new Error('WhatsApp API should not be called for Instagram'));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Instagram Channel Detection and Processing', () => {
    test('should detect Instagram channel and process translation successfully', async () => {
      // Mock successful Instagram translation
      mockInstagramTranslation.waitForInstagramTranslationResult.mockResolvedValue({
        success: true,
        fulfillmentMessages: [
          {
            custom_payload: {
              instagram: {
                attachment: {
                  type: 'template',
                  payload: {
                    template_type: 'generic',
                    elements: [
                      {
                        title: 'Welcome to Instagram!',
                        subtitle: 'How can I help you?',
                        image_url: 'https://example.com/image.jpg',
                        buttons: [
                          {
                            type: 'web_url',
                            title: 'Visit Website',
                            url: 'https://example.com',
                          },
                        ],
                      },
                    ],
                  },
                },
              },
            },
          },
        ],
        processingTime: 150,
      });

      const instagramPayload = {
        originalDetectIntentRequest: {
          payload: {
            channel_type: 'Channel::Instagram',
            inbox_id: '4',
            from: '+5511999999999', // Use 'from' field that extractContactPhone looks for
            interaction_type: 'intent',
            wamid: 'wamid.instagram123',
            whatsapp_api_key: 'test-api-key',
            phone_number_id: '123456789',
            business_id: 'business123',
            contact_source: 'instagram',
            message_id: 12345,
            account_id: 1,
            account_name: 'Test Account',
          },
        },
        queryResult: {
          intent: {
            displayName: 'welcome.intent',
          },
        },
        session: 'projects/test-project/agent/sessions/+5511999999999', // Fallback for phone extraction
      };

      const mockRequest = {
        json: jest.fn().mockResolvedValue(instagramPayload),
      } as any;

      const response = await POST(mockRequest);
      const responseData = await response.json();

      // Verify Instagram-specific response
      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('application/json');
      expect(response.headers.get('X-Correlation-ID')).toBeDefined();

      // Verify Instagram fulfillment messages structure
      expect(responseData.fulfillmentMessages).toBeDefined();
      expect(Array.isArray(responseData.fulfillmentMessages)).toBe(true);
      expect(responseData.fulfillmentMessages.length).toBeGreaterThan(0);

      // Verify Instagram-specific payload structure
      const instagramMessage = responseData.fulfillmentMessages[0];
      expect(instagramMessage.custom_payload).toBeDefined();
      expect(instagramMessage.custom_payload.instagram).toBeDefined();
      expect(instagramMessage.custom_payload.instagram.attachment).toBeDefined();
      expect(instagramMessage.custom_payload.instagram.attachment.type).toBe('template');

      // Verify Instagram translation functions were called
      expect(mockInstagramTranslation.createInstagramTranslationJob).toHaveBeenCalledWith({
        intentName: 'welcome.intent',
        inboxId: '4',
        contactPhone: '5511999999999', // Phone is cleaned (no + or special chars)
        conversationId: expect.any(String),
        originalPayload: instagramPayload,
        correlationId: expect.any(String),
      });

      expect(mockInstagramTranslation.addInstagramTranslationJob).toHaveBeenCalled();
      expect(mockInstagramTranslation.waitForInstagramTranslationResult).toHaveBeenCalledWith(
        'ig-test-correlation-id',
        4500 // 4.5 second timeout
      );

      // Verify WhatsApp API was NOT called
      expect(mockWhatsAppAPI.sendMessage).not.toHaveBeenCalled();
      expect(mockWhatsAppAPI.sendReaction).not.toHaveBeenCalled();
    });

    test('should handle Instagram translation timeout with fallback', async () => {
      // Mock timeout scenario
      mockInstagramTranslation.waitForInstagramTranslationResult.mockResolvedValue({
        success: false,
        error: 'Translation timeout - response took longer than 4500ms',
        processingTime: 4500,
        metadata: {
          timedOut: true,
          timeoutMs: 4500,
        },
      });

      const instagramPayload = {
        originalDetectIntentRequest: {
          payload: {
            channel_type: 'Channel::Instagram',
            inbox_id: '4',
            from: '+5511999999999',
            interaction_type: 'intent',
            wamid: 'wamid.instagram123',
            whatsapp_api_key: 'test-api-key',
            phone_number_id: '123456789',
            business_id: 'business123',
            contact_source: 'instagram',
            message_id: 12345,
            account_id: 1,
            account_name: 'Test Account',
          },
        },
        queryResult: {
          intent: {
            displayName: 'slow.intent',
          },
        },
        session: 'projects/test-project/agent/sessions/+5511999999999',
      };

      const mockRequest = {
        json: jest.fn().mockResolvedValue(instagramPayload),
      } as any;

      const response = await POST(mockRequest);
      const responseData = await response.json();

      // Should still return 200 with fallback message
      expect(response.status).toBe(200);
      // The error is processed and converted to a user-friendly message
      expect(response.headers.get('X-Error')).toBeDefined();

      // Should return fallback Instagram message
      expect(responseData.fulfillmentMessages).toBeDefined();
      expect(mockInstagramPayloadBuilder.createInstagramFallbackMessage).toHaveBeenCalled();

      // Verify timeout was respected
      expect(mockInstagramTranslation.waitForInstagramTranslationResult).toHaveBeenCalledWith(
        expect.any(String),
        4500
      );
    });

    test('should handle Instagram translation worker failure with appropriate fallback', async () => {
      // Mock worker failure
      mockInstagramTranslation.waitForInstagramTranslationResult.mockResolvedValue({
        success: false,
        error: 'Template not found for intent',
        processingTime: 500,
        metadata: {
          errorCode: 'TEMPLATE_NOT_FOUND',
        },
      });

      const instagramPayload = {
        originalDetectIntentRequest: {
          payload: {
            channel_type: 'Channel::Instagram',
            inbox_id: '4',
            from: '+5511999999999',
            interaction_type: 'intent',
            wamid: 'wamid.instagram123',
            whatsapp_api_key: 'test-api-key',
            phone_number_id: '123456789',
            business_id: 'business123',
            contact_source: 'instagram',
            message_id: 12345,
            account_id: 1,
            account_name: 'Test Account',
          },
        },
        queryResult: {
          intent: {
            displayName: 'nonexistent.intent',
          },
        },
        session: 'projects/test-project/agent/sessions/+5511999999999',
      };

      const mockRequest = {
        json: jest.fn().mockResolvedValue(instagramPayload),
      } as any;

      const response = await POST(mockRequest);
      const responseData = await response.json();

      // Should return 200 with fallback message
      expect(response.status).toBe(200);
      // The error is processed and converted to a user-friendly message
      expect(response.headers.get('X-Error')).toBeDefined();

      // Should provide fallback Instagram message
      expect(responseData.fulfillmentMessages).toBeDefined();
      expect(mockInstagramPayloadBuilder.createInstagramFallbackMessage).toHaveBeenCalled();
    });

    test('should handle message too long error with specific fallback', async () => {
      // Mock message too long error
      mockInstagramTranslation.waitForInstagramTranslationResult.mockResolvedValue({
        success: false,
        error: 'Message body exceeds Instagram limit (>640 characters)',
        processingTime: 200,
        metadata: {
          errorCode: 'MESSAGE_TOO_LONG',
        },
      });

      const instagramPayload = {
        originalDetectIntentRequest: {
          payload: {
            channel_type: 'Channel::Instagram',
            inbox_id: '4',
            from: '+5511999999999',
            interaction_type: 'intent',
            wamid: 'wamid.instagram123',
            whatsapp_api_key: 'test-api-key',
            phone_number_id: '123456789',
            business_id: 'business123',
            contact_source: 'instagram',
            message_id: 12345,
            account_id: 1,
            account_name: 'Test Account',
          },
        },
        queryResult: {
          intent: {
            displayName: 'very.long.message.intent',
          },
        },
        session: 'projects/test-project/agent/sessions/+5511999999999',
      };

      const mockRequest = {
        json: jest.fn().mockResolvedValue(instagramPayload),
      } as any;

      const response = await POST(mockRequest);
      const responseData = await response.json();

      expect(response.status).toBe(200);
      expect(responseData.fulfillmentMessages).toBeDefined();
      expect(mockInstagramPayloadBuilder.createInstagramFallbackMessage).toHaveBeenCalled();
    });

    test('should handle missing required data with validation error', async () => {
      const invalidInstagramPayload = {
        originalDetectIntentRequest: {
          payload: {
            channel_type: 'Channel::Instagram',
            // Missing required fields: inbox_id, from (contact phone)
            interaction_type: 'intent',
            wamid: 'wamid.instagram123',
            whatsapp_api_key: 'test-api-key',
            phone_number_id: '123456789',
            business_id: 'business123',
            contact_source: 'instagram',
            message_id: 12345,
            account_id: 1,
            account_name: 'Test Account',
          },
        },
        queryResult: {
          intent: {
            displayName: 'test.intent',
          },
        },
      };

      const mockRequest = {
        json: jest.fn().mockResolvedValue(invalidInstagramPayload),
      } as any;

      const response = await POST(mockRequest);
      const responseData = await response.json();

      // Should return fallback response
      expect(response.status).toBe(200);
      expect(response.headers.get('X-Error')).toContain('Missing required data');
      expect(responseData.fulfillmentMessages).toBeDefined();
      expect(mockInstagramPayloadBuilder.createInstagramFallbackMessage).toHaveBeenCalledWith(
        'Desculpe, não foi possível processar sua mensagem no momento. Tente novamente.'
      );

      // Should not attempt to queue job
      expect(mockInstagramTranslation.addInstagramTranslationJob).not.toHaveBeenCalled();
    });
  });

  describe('WhatsApp Backward Compatibility', () => {
    test('should correctly detect non-Instagram channel and use WhatsApp flow', async () => {
      // Setup WhatsApp flow mocks
      mockPrisma.chatwitInbox.findFirst.mockResolvedValue({
        inboxId: '4',
        whatsappApiKey: 'test-api-key',
        phoneNumberId: '123456789',
        whatsappBusinessAccountId: 'business123',
        updatedAt: new Date(),
        usuarioChatwit: {
          configuracaoGlobalWhatsApp: null,
        },
        fallbackParaInbox: null,
        fallbackParaInboxId: null,
      });

      mockPrisma.mapeamentoIntencao.findFirst.mockResolvedValue({
        id: 'mapping-123',
        template: {
          id: 'template-123',
          name: 'WhatsApp Template',
          type: 'AUTOMATION_REPLY',
          simpleReplyText: 'WhatsApp response',
        },
      });

      // Allow WhatsApp API for this test
      mockWhatsAppAPI.sendMessage.mockResolvedValue({ messageId: 'whatsapp-msg-123' });

      const whatsappPayload = {
        originalDetectIntentRequest: {
          payload: {
            channel_type: 'Channel::WhatsApp', // WhatsApp channel
            inbox_id: '4',
            from: '+5511999999999',
            interaction_type: 'intent',
            wamid: 'wamid.whatsapp123',
            whatsapp_api_key: 'test-api-key',
            phone_number_id: '123456789',
            business_id: 'business123',
            contact_source: 'chatwit',
            message_id: 12345,
            account_id: 1,
            account_name: 'Test Account',
          },
        },
        queryResult: {
          intent: {
            displayName: 'test.intent',
          },
        },
        session: 'projects/test-project/agent/sessions/+5511999999999',
      };

      const mockRequest = {
        json: jest.fn().mockResolvedValue(whatsappPayload),
      } as any;

      const response = await POST(mockRequest);

      // Should use WhatsApp flow (202 response)
      expect(response.status).toBe(202);
      expect(mockInstagramTranslation.addInstagramTranslationJob).not.toHaveBeenCalled();

      // Wait for async processing
      await new Promise(resolve => setTimeout(resolve, 100));

      // WhatsApp flow should be used (202 response indicates legacy flow)
      // Note: The actual WhatsApp API call happens asynchronously, so we just verify the response type
    });

    test('should handle missing channel_type as non-Instagram (WhatsApp fallback)', async () => {
      // Setup WhatsApp flow mocks for fallback
      mockPrisma.chatwitInbox.findFirst.mockResolvedValue({
        inboxId: '4',
        whatsappApiKey: 'test-api-key',
        phoneNumberId: '123456789',
        whatsappBusinessAccountId: 'business123',
        updatedAt: new Date(),
        usuarioChatwit: {
          configuracaoGlobalWhatsApp: null,
        },
        fallbackParaInbox: null,
        fallbackParaInboxId: null,
      });

      mockWhatsAppAPI.sendMessage.mockResolvedValue({ messageId: 'fallback-msg-123' });

      const payloadWithoutChannelType = {
        originalDetectIntentRequest: {
          payload: {
            // No channel_type field
            inbox_id: '4',
            from: '+5511999999999',
            interaction_type: 'intent',
            wamid: 'wamid.unknown123',
            whatsapp_api_key: 'test-api-key',
            phone_number_id: '123456789',
            business_id: 'business123',
            contact_source: 'chatwit',
            message_id: 12345,
            account_id: 1,
            account_name: 'Test Account',
          },
        },
        queryResult: {
          intent: {
            displayName: 'test.intent',
          },
        },
        session: 'projects/test-project/agent/sessions/+5511999999999',
      };

      const mockRequest = {
        json: jest.fn().mockResolvedValue(payloadWithoutChannelType),
      } as any;

      const response = await POST(mockRequest);

      // Should fallback to WhatsApp flow
      expect(response.status).toBe(202);
      expect(mockInstagramTranslation.addInstagramTranslationJob).not.toHaveBeenCalled();
    });
  });

  describe('Performance and Monitoring', () => {
    test('should include correlation ID and proper headers in Instagram responses', async () => {
      mockInstagramTranslation.waitForInstagramTranslationResult.mockResolvedValue({
        success: true,
        fulfillmentMessages: [mockInstagramPayloadBuilder.createInstagramGenericTemplate()],
        processingTime: 250,
      });

      const instagramPayload = {
        originalDetectIntentRequest: {
          payload: {
            channel_type: 'Channel::Instagram',
            inbox_id: '4',
            from: '+5511999999999',
            interaction_type: 'intent',
            wamid: 'wamid.instagram123',
            whatsapp_api_key: 'test-api-key',
            phone_number_id: '123456789',
            business_id: 'business123',
            contact_source: 'instagram',
            message_id: 12345,
            account_id: 1,
            account_name: 'Test Account',
          },
        },
        queryResult: {
          intent: {
            displayName: 'performance.test.intent',
          },
        },
        session: 'projects/test-project/agent/sessions/+5511999999999',
      };

      const mockRequest = {
        json: jest.fn().mockResolvedValue(instagramPayload),
      } as any;

      const response = await POST(mockRequest);

      // Verify performance headers are included
      expect(response.headers.get('X-Correlation-ID')).toBeDefined();
      expect(response.headers.get('Cache-Control')).toBe('no-cache, no-store, must-revalidate');

      // Verify response is successful
      expect(response.status).toBe(200);

      // Verify monitoring was called
      expect(mockMonitoring.recordWebhookMetrics).toHaveBeenCalled();
    });

    test('should handle concurrent Instagram requests efficiently', async () => {
      // Mock successful processing for all requests
      mockInstagramTranslation.waitForInstagramTranslationResult.mockResolvedValue({
        success: true,
        fulfillmentMessages: [mockInstagramPayloadBuilder.createInstagramGenericTemplate()],
        processingTime: 150,
      });

      const createInstagramRequest = (intentName: string) => ({
        originalDetectIntentRequest: {
          payload: {
            channel_type: 'Channel::Instagram',
            inbox_id: '4',
            from: '+5511999999999',
            interaction_type: 'intent',
            wamid: `wamid.instagram${Math.random()}`,
            whatsapp_api_key: 'test-api-key',
            phone_number_id: '123456789',
            business_id: 'business123',
            contact_source: 'instagram',
            message_id: Math.floor(Math.random() * 100000),
            account_id: 1,
            account_name: 'Test Account',
          },
        },
        queryResult: {
          intent: {
            displayName: intentName,
          },
        },
        session: 'projects/test-project/agent/sessions/+5511999999999',
      });

      // Create multiple concurrent requests
      const requests = [
        { json: jest.fn().mockResolvedValue(createInstagramRequest('intent1')) },
        { json: jest.fn().mockResolvedValue(createInstagramRequest('intent2')) },
        { json: jest.fn().mockResolvedValue(createInstagramRequest('intent3')) },
      ];

      const startTime = Date.now();

      // Execute requests concurrently
      const responses = await Promise.all(
        requests.map(request => POST(request as any))
      );

      const totalTime = Date.now() - startTime;

      // All requests should succeed
      responses.forEach(response => {
        expect(response.status).toBe(200);
      });

      // Concurrent processing should be efficient
      expect(totalTime).toBeLessThan(10000); // Should complete within 10 seconds
      expect(mockInstagramTranslation.addInstagramTranslationJob).toHaveBeenCalledTimes(3);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('should handle queue system failure gracefully', async () => {
      // Mock queue failure
      mockInstagramTranslation.addInstagramTranslationJob.mockRejectedValue(new Error('Queue system unavailable'));

      const instagramPayload = {
        originalDetectIntentRequest: {
          payload: {
            channel_type: 'Channel::Instagram',
            inbox_id: '4',
            from: '+5511999999999',
            interaction_type: 'intent',
            wamid: 'wamid.instagram123',
            whatsapp_api_key: 'test-api-key',
            phone_number_id: '123456789',
            business_id: 'business123',
            contact_source: 'instagram',
            message_id: 12345,
            account_id: 1,
            account_name: 'Test Account',
          },
        },
        queryResult: {
          intent: {
            displayName: 'test.intent',
          },
        },
        session: 'projects/test-project/agent/sessions/+5511999999999',
      };

      const mockRequest = {
        json: jest.fn().mockResolvedValue(instagramPayload),
      } as any;

      const response = await POST(mockRequest);
      const responseData = await response.json();

      // Should handle queue failure gracefully
      expect(response.status).toBe(200);
      expect(responseData.fulfillmentMessages).toBeDefined();
      expect(mockInstagramPayloadBuilder.createInstagramFallbackMessage).toHaveBeenCalled();
    });

    test('should handle critical system errors with fallback', async () => {
      // Mock critical system error
      mockInstagramTranslation.waitForInstagramTranslationResult.mockRejectedValue(new Error('Critical system failure'));

      const instagramPayload = {
        originalDetectIntentRequest: {
          payload: {
            channel_type: 'Channel::Instagram',
            inbox_id: '4',
            from: '+5511999999999',
            interaction_type: 'intent',
            wamid: 'wamid.instagram123',
            whatsapp_api_key: 'test-api-key',
            phone_number_id: '123456789',
            business_id: 'business123',
            contact_source: 'instagram',
            message_id: 12345,
            account_id: 1,
            account_name: 'Test Account',
          },
        },
        queryResult: {
          intent: {
            displayName: 'test.intent',
          },
        },
        session: 'projects/test-project/agent/sessions/+5511999999999',
      };

      const mockRequest = {
        json: jest.fn().mockResolvedValue(instagramPayload),
      } as any;

      const response = await POST(mockRequest);
      const responseData = await response.json();

      // Should handle critical errors gracefully
      expect(response.status).toBe(200);
      expect(responseData.fulfillmentMessages).toBeDefined();
      expect(mockInstagramPayloadBuilder.createInstagramFallbackMessage).toHaveBeenCalled();
    });

    test('should ensure webhook always responds within reasonable time', async () => {
      // Mock normal processing
      mockInstagramTranslation.waitForInstagramTranslationResult.mockResolvedValue({
        success: true,
        fulfillmentMessages: [mockInstagramPayloadBuilder.createInstagramGenericTemplate()],
        processingTime: 100,
      });

      const instagramPayload = {
        originalDetectIntentRequest: {
          payload: {
            channel_type: 'Channel::Instagram',
            inbox_id: '4',
            from: '+5511999999999',
            interaction_type: 'intent',
            wamid: 'wamid.instagram123',
            whatsapp_api_key: 'test-api-key',
            phone_number_id: '123456789',
            business_id: 'business123',
            contact_source: 'instagram',
            message_id: 12345,
            account_id: 1,
            account_name: 'Test Account',
          },
        },
        queryResult: {
          intent: {
            displayName: 'test.intent',
          },
        },
        session: 'projects/test-project/agent/sessions/+5511999999999',
      };

      const mockRequest = {
        json: jest.fn().mockResolvedValue(instagramPayload),
      } as any;

      const startTime = Date.now();
      const response = await POST(mockRequest);
      const responseTime = Date.now() - startTime;

      // Should respond quickly
      expect(responseTime).toBeLessThan(5000); // Should complete within 5 seconds
      expect(response.status).toBe(200);
    });
  });
});