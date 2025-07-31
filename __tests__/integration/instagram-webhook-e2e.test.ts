/**
 * End-to-End Instagram Webhook Integration Tests
 * Tests complete Instagram flow: webhook receives → waits → worker processes → webhook responds with final payload
 * Requirements: 1.1, 1.2, 1.3, 1.4, 6.1, 6.2, 6.3, 6.4
 */

import { describe, test, expect, jest, beforeEach, afterEach, beforeAll, afterAll } from '@jest/globals';
import { NextRequest } from 'next/server';

// Mock Redis and database connections
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
  mensagemInterativa: {
    findFirst: jest.fn(),
  },
  mensagemInterativaAprimorada: {
    findFirst: jest.fn(),
  },
};

jest.mock('@/lib/redis', () => ({
  connection: mockRedis,
}));

jest.mock('@/lib/prisma', () => ({
  prisma: mockPrisma,
}));

// Mock Instagram translation queue and worker
const mockInstagramQueue = {
  add: jest.fn(),
  getJob: jest.fn(),
  close: jest.fn(),
};

const mockInstagramJob = {
  id: 'test-job-id',
  isCompleted: jest.fn(),
  isFailed: jest.fn(),
  isActive: jest.fn(),
  isWaiting: jest.fn(),
  returnvalue: null,
  failedReason: null,
  attemptsMade: 0,
  opts: { attempts: 3 },
  finishedOn: null,
  processedOn: null,
  timestamp: Date.now(),
};

jest.mock('@/lib/queue/instagram-translation.queue', () => ({
  instagramTranslationQueue: mockInstagramQueue,
  addInstagramTranslationJob: jest.fn(),
  createInstagramTranslationJob: jest.fn(),
  waitForInstagramTranslationResult: jest.fn(),
  generateCorrelationId: jest.fn().mockReturnValue('ig-test-correlation-id'),
  logWithCorrelationId: jest.fn(),
  INSTAGRAM_TRANSLATION_QUEUE_NAME: 'instagram-translation',
  InstagramTranslationErrorCodes: {
    TEMPLATE_NOT_FOUND: 'TEMPLATE_NOT_FOUND',
    MESSAGE_TOO_LONG: 'MESSAGE_TOO_LONG',
    INVALID_CHANNEL: 'INVALID_CHANNEL',
    DATABASE_ERROR: 'DATABASE_ERROR',
    CONVERSION_FAILED: 'CONVERSION_FAILED',
    TIMEOUT_ERROR: 'TIMEOUT_ERROR',
  },
}));

// Mock Instagram payload builder
jest.mock('@/lib/instagram/payload-builder', () => ({
  createInstagramFallbackMessage: jest.fn(),
  createInstagramGenericTemplate: jest.fn(),
  createInstagramButtonTemplate: jest.fn(),
  convertWhatsAppButtonsToInstagram: jest.fn(),
  determineInstagramTemplateType: jest.fn(),
  validateInstagramTemplate: jest.fn(),
}));

// Mock WhatsApp API (should not be called for Instagram)
const mockWhatsAppAPI = {
  sendMessage: jest.fn(),
  sendReaction: jest.fn(),
};

jest.mock('@/lib/whatsapp', () => mockWhatsAppAPI);

// Mock feature flags to disable new webhook processing for cleaner tests
jest.mock('@/lib/feature-flags/feature-flag-manager', () => ({
  FeatureFlagManager: {
    getInstance: jest.fn().mockReturnValue({
      isEnabled: jest.fn().mockResolvedValue(false), // Disable all feature flags by default
    }),
  },
}));

// Mock monitoring to avoid Redis issues in tests
jest.mock('@/lib/monitoring/application-performance-monitor', () => ({
  recordWebhookMetrics: jest.fn(),
  ApplicationPerformanceMonitor: {
    getInstance: jest.fn().mockReturnValue({
      recordWebhookMetrics: jest.fn(),
    }),
  },
}));

describe('Instagram Webhook E2E Integration Tests', () => {
  let POST: any;
  let mockAddInstagramTranslationJob: jest.MockedFunction<any>;
  let mockCreateInstagramTranslationJob: jest.MockedFunction<any>;
  let mockWaitForInstagramTranslationResult: jest.MockedFunction<any>;
  let mockGenerateCorrelationId: jest.MockedFunction<any>;
  let mockCreateInstagramFallbackMessage: jest.MockedFunction<any>;
  let mockCreateInstagramGenericTemplate: jest.MockedFunction<any>;
  let mockCreateInstagramButtonTemplate: jest.MockedFunction<any>;

  beforeAll(async () => {
    // Import the webhook handler after mocks are set up
    const module = await import('@/app/api/admin/mtf-diamante/dialogflow/webhook/route');
    POST = module.POST;

    // Get mocked functions
    const instagramQueueModule = await import('@/lib/queue/instagram-translation.queue');
    mockAddInstagramTranslationJob = instagramQueueModule.addInstagramTranslationJob as jest.MockedFunction<any>;
    mockCreateInstagramTranslationJob = instagramQueueModule.createInstagramTranslationJob as jest.MockedFunction<any>;
    mockWaitForInstagramTranslationResult = instagramQueueModule.waitForInstagramTranslationResult as jest.MockedFunction<any>;
    mockGenerateCorrelationId = instagramQueueModule.generateCorrelationId as jest.MockedFunction<any>;

    const payloadBuilderModule = await import('@/lib/instagram/payload-builder');
    mockCreateInstagramFallbackMessage = payloadBuilderModule.createInstagramFallbackMessage as jest.MockedFunction<any>;
    mockCreateInstagramGenericTemplate = payloadBuilderModule.createInstagramGenericTemplate as jest.MockedFunction<any>;
    mockCreateInstagramButtonTemplate = payloadBuilderModule.createInstagramButtonTemplate as jest.MockedFunction<any>;
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

    // Setup Instagram queue mocks
    mockGenerateCorrelationId.mockReturnValue('ig-test-correlation-id');
    mockCreateInstagramTranslationJob.mockReturnValue({
      intentName: 'test.intent',
      inboxId: '4',
      contactPhone: '+5511999999999',
      conversationId: 'conv-123',
      originalPayload: {},
      correlationId: 'ig-test-correlation-id',
    });
    mockAddInstagramTranslationJob.mockResolvedValue('test-job-id');

    // Setup Instagram payload builder mocks
    mockCreateInstagramFallbackMessage.mockReturnValue([
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

    mockCreateInstagramGenericTemplate.mockReturnValue([
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

    mockCreateInstagramButtonTemplate.mockReturnValue([
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

    // Ensure WhatsApp API is not called for Instagram
    mockWhatsAppAPI.sendMessage.mockRejectedValue(new Error('WhatsApp API should not be called for Instagram'));
    mockWhatsAppAPI.sendReaction.mockRejectedValue(new Error('WhatsApp API should not be called for Instagram'));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Complete Instagram Flow - Intent Processing', () => {
    test('should process complete Instagram intent flow: webhook → queue → worker → response', async () => {
      // Mock successful worker processing
      mockWaitForInstagramTranslationResult.mockResolvedValue({
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
            channel_type: 'Channel::Instagram', // Instagram channel identifier
            inbox_id: '4',
            contact_phone: '+5511999999999',
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
      };

      const mockRequest = {
        json: jest.fn().mockResolvedValue(instagramPayload),
      } as any;

      // Execute webhook
      const startTime = Date.now();
      const response = await POST(mockRequest);
      const responseTime = Date.now() - startTime;
      const responseData = await response.json();

      // Validate Instagram-specific response (not 202 like WhatsApp)
      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('application/json');
      expect(response.headers.get('X-Correlation-ID')).toBeDefined();

      // Validate Instagram fulfillment messages structure
      expect(responseData.fulfillmentMessages).toBeDefined();
      expect(Array.isArray(responseData.fulfillmentMessages)).toBe(true);
      expect(responseData.fulfillmentMessages.length).toBeGreaterThan(0);

      // Validate Instagram-specific payload structure
      const instagramMessage = responseData.fulfillmentMessages[0];
      expect(instagramMessage.custom_payload).toBeDefined();
      expect(instagramMessage.custom_payload.instagram).toBeDefined();
      expect(instagramMessage.custom_payload.instagram.attachment).toBeDefined();
      expect(instagramMessage.custom_payload.instagram.attachment.type).toBe('template');

      // Verify Instagram translation job was created and processed
      expect(mockCreateInstagramTranslationJob).toHaveBeenCalledWith({
        intentName: 'welcome.intent',
        inboxId: '4',
        contactPhone: '+5511999999999',
        conversationId: expect.any(String),
        originalPayload: instagramPayload,
        correlationId: expect.any(String),
      });

      expect(mockAddInstagramTranslationJob).toHaveBeenCalledWith(
        expect.objectContaining({
          intentName: 'welcome.intent',
          inboxId: '4',
          contactPhone: '+5511999999999',
        })
      );

      expect(mockWaitForInstagramTranslationResult).toHaveBeenCalledWith(
        'ig-test-correlation-id',
        4500 // 4.5 second timeout
      );

      // Verify WhatsApp API was NOT called
      expect(mockWhatsAppAPI.sendMessage).not.toHaveBeenCalled();
      expect(mockWhatsAppAPI.sendReaction).not.toHaveBeenCalled();

      // Verify response time is reasonable for Instagram (should be longer than WhatsApp due to processing)
      expect(responseTime).toBeLessThan(5000); // Should complete within 5 seconds
    });

    test('should handle Instagram intent with Generic Template (≤80 chars)', async () => {
      // Mock worker processing for short message
      mockWaitForInstagramTranslationResult.mockResolvedValue({
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
                        title: 'Short message', // ≤80 characters
                        subtitle: 'Footer text',
                        image_url: 'https://example.com/image.jpg',
                        buttons: [
                          {
                            type: 'postback',
                            title: 'Click Me',
                            payload: 'BUTTON_CLICKED',
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
        processingTime: 120,
      });

      const instagramPayload = {
        originalDetectIntentRequest: {
          payload: {
            channel_type: 'Channel::Instagram',
            inbox_id: '4',
            contact_phone: '+5511999999999',
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
            displayName: 'short.message.intent',
          },
        },
      };

      const mockRequest = {
        json: jest.fn().mockResolvedValue(instagramPayload),
      } as any;

      const response = await POST(mockRequest);
      const responseData = await response.json();

      expect(response.status).toBe(200);

      // Validate Generic Template structure
      const instagramMessage = responseData.fulfillmentMessages[0];
      const template = instagramMessage.custom_payload.instagram.attachment.payload;
      
      expect(template.template_type).toBe('generic');
      expect(template.elements).toBeDefined();
      expect(Array.isArray(template.elements)).toBe(true);
      expect(template.elements[0].title).toBeDefined();
      expect(template.elements[0].subtitle).toBeDefined();
      expect(template.elements[0].buttons).toBeDefined();
    });

    test('should handle Instagram intent with Button Template (81-640 chars)', async () => {
      // Mock worker processing for longer message
      mockWaitForInstagramTranslationResult.mockResolvedValue({
        success: true,
        fulfillmentMessages: [
          {
            custom_payload: {
              instagram: {
                attachment: {
                  type: 'template',
                  payload: {
                    template_type: 'button',
                    text: 'This is a longer message that exceeds 80 characters and should use Button Template format for Instagram messaging platform compatibility.',
                    buttons: [
                      {
                        type: 'web_url',
                        title: 'Learn More',
                        url: 'https://example.com/learn',
                      },
                      {
                        type: 'postback',
                        title: 'Contact Us',
                        payload: 'CONTACT_US',
                      },
                    ],
                  },
                },
              },
            },
          },
        ],
        processingTime: 180,
      });

      const instagramPayload = {
        originalDetectIntentRequest: {
          payload: {
            channel_type: 'Channel::Instagram',
            inbox_id: '4',
            contact_phone: '+5511999999999',
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
            displayName: 'long.message.intent',
          },
        },
      };

      const mockRequest = {
        json: jest.fn().mockResolvedValue(instagramPayload),
      } as any;

      const response = await POST(mockRequest);
      const responseData = await response.json();

      expect(response.status).toBe(200);

      // Validate Button Template structure
      const instagramMessage = responseData.fulfillmentMessages[0];
      const template = instagramMessage.custom_payload.instagram.attachment.payload;
      
      expect(template.template_type).toBe('button');
      expect(template.text).toBeDefined();
      expect(template.text.length).toBeGreaterThan(80);
      expect(template.text.length).toBeLessThanOrEqual(640);
      expect(template.buttons).toBeDefined();
      expect(Array.isArray(template.buttons)).toBe(true);
    });
  });

  describe('Channel Type Detection', () => {
    test('should correctly detect Instagram channel type', async () => {
      mockWaitForInstagramTranslationResult.mockResolvedValue({
        success: true,
        fulfillmentMessages: [mockCreateInstagramGenericTemplate()],
        processingTime: 100,
      });

      const instagramPayload = {
        originalDetectIntentRequest: {
          payload: {
            channel_type: 'Channel::Instagram', // Key identifier
            inbox_id: '4',
            contact_phone: '+5511999999999',
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
        json: jest.fn().mockResolvedValue(instagramPayload),
      } as any;

      const response = await POST(mockRequest);

      expect(response.status).toBe(200);
      expect(mockAddInstagramTranslationJob).toHaveBeenCalled();
      expect(mockWhatsAppAPI.sendMessage).not.toHaveBeenCalled();
    });

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
            contact_phone: '+5511999999999',
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
      };

      const mockRequest = {
        json: jest.fn().mockResolvedValue(whatsappPayload),
      } as any;

      const response = await POST(mockRequest);

      // Should use WhatsApp flow (202 response)
      expect(response.status).toBe(202);
      expect(mockAddInstagramTranslationJob).not.toHaveBeenCalled();
      
      // Wait for async processing
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // WhatsApp API should be called
      expect(mockWhatsAppAPI.sendMessage).toHaveBeenCalled();
    });

    test('should handle missing or invalid channel_type', async () => {
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
            contact_phone: '+5511999999999',
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
      };

      const mockRequest = {
        json: jest.fn().mockResolvedValue(payloadWithoutChannelType),
      } as any;

      const response = await POST(mockRequest);

      // Should fallback to WhatsApp flow
      expect(response.status).toBe(202);
      expect(mockAddInstagramTranslationJob).not.toHaveBeenCalled();
    });
  });

  describe('Internal Timeout Scenarios', () => {
    test('should handle Instagram translation timeout (4.5 second limit)', async () => {
      // Mock timeout scenario
      mockWaitForInstagramTranslationResult.mockResolvedValue({
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
            contact_phone: '+5511999999999',
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
      };

      const mockRequest = {
        json: jest.fn().mockResolvedValue(instagramPayload),
      } as any;

      const response = await POST(mockRequest);
      const responseData = await response.json();

      // Should still return 200 with fallback message
      expect(response.status).toBe(200);
      expect(response.headers.get('X-Error')).toContain('timeout');

      // Should return fallback Instagram message
      expect(responseData.fulfillmentMessages).toBeDefined();
      expect(mockCreateInstagramFallbackMessage).toHaveBeenCalledWith(
        'Processamento demorou muito. Tente novamente.'
      );

      // Verify timeout was respected
      expect(mockWaitForInstagramTranslationResult).toHaveBeenCalledWith(
        expect.any(String),
        4500
      );
    });

    test('should ensure webhook always responds within timeout even if worker fails', async () => {
      // Mock worker failure
      mockWaitForInstagramTranslationResult.mockResolvedValue({
        success: false,
        error: 'Worker processing failed',
        processingTime: 2000,
      });

      const instagramPayload = {
        originalDetectIntentRequest: {
          payload: {
            channel_type: 'Channel::Instagram',
            inbox_id: '4',
            contact_phone: '+5511999999999',
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
            displayName: 'failing.intent',
          },
        },
      };

      const mockRequest = {
        json: jest.fn().mockResolvedValue(instagramPayload),
      } as any;

      const startTime = Date.now();
      const response = await POST(mockRequest);
      const responseTime = Date.now() - startTime;
      const responseData = await response.json();

      // Should respond quickly with fallback
      expect(responseTime).toBeLessThan(5000);
      expect(response.status).toBe(200);
      expect(responseData.fulfillmentMessages).toBeDefined();
      expect(mockCreateInstagramFallbackMessage).toHaveBeenCalled();
    });
  });

  describe('WhatsApp Backward Compatibility', () => {
    test('should ensure WhatsApp logic remains completely unchanged', async () => {
      // Setup complete WhatsApp flow
      mockPrisma.chatwitInbox.findFirst.mockResolvedValue({
        inboxId: '4',
        whatsappApiKey: 'whatsapp-api-key',
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
          simpleReplyText: 'WhatsApp message response',
        },
      });

      mockPrisma.lead.findFirst.mockResolvedValue(null);
      mockPrisma.lead.create.mockResolvedValue({
        id: 'lead-123',
        phone: '+5511999999999',
        source: 'CHATWIT_OAB',
      });

      mockWhatsAppAPI.sendMessage.mockResolvedValue({ messageId: 'whatsapp-msg-123' });

      const whatsappPayload = {
        originalDetectIntentRequest: {
          payload: {
            // No channel_type or different channel_type (not Instagram)
            inbox_id: '4',
            contact_phone: '+5511999999999',
            interaction_type: 'intent',
            wamid: 'wamid.whatsapp123',
            whatsapp_api_key: 'whatsapp-api-key',
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
            displayName: 'whatsapp.intent',
          },
        },
      };

      const mockRequest = {
        json: jest.fn().mockResolvedValue(whatsappPayload),
      } as any;

      const response = await POST(mockRequest);
      const responseData = await response.json();

      // Should use original WhatsApp flow (202 response)
      expect(response.status).toBe(202);
      expect(response.headers.get('Content-Type')).toBe('application/json');
      expect(response.headers.get('X-Correlation-ID')).toBeDefined();
      expect(responseData.correlationId).toBeDefined();

      // Instagram translation should NOT be triggered
      expect(mockAddInstagramTranslationJob).not.toHaveBeenCalled();
      expect(mockWaitForInstagramTranslationResult).not.toHaveBeenCalled();

      // Wait for async processing
      await new Promise(resolve => setTimeout(resolve, 100));

      // WhatsApp flow should work normally
      expect(mockPrisma.mapeamentoIntencao.findFirst).toHaveBeenCalledWith({
        where: {
          intentName: 'whatsapp.intent',
          inbox: {
            inboxId: '4',
          },
        },
        include: expect.any(Object),
      });

      expect(mockWhatsAppAPI.sendMessage).toHaveBeenCalledWith(
        '+5511999999999',
        expect.objectContaining({
          type: 'text',
          text: {
            body: 'WhatsApp message response',
          },
        }),
        expect.any(Object),
        expect.any(String),
        expect.any(String)
      );

      // Database updates should work normally
      expect(mockPrisma.chatwitInbox.updateMany).toHaveBeenCalled();
      expect(mockPrisma.lead.create).toHaveBeenCalled();
    });

    test('should handle WhatsApp button interactions without affecting Instagram logic', async () => {
      // Setup button mapping for WhatsApp
      mockPrisma.mapeamentoBotao.findFirst.mockResolvedValue({
        id: 'button-mapping-123',
        buttonId: 'whatsapp_btn_yes',
        actionType: 'SEND_TEMPLATE',
        actionPayload: {
          templateId: 'template-456',
        },
      });

      mockPrisma.template.findUnique.mockResolvedValue({
        id: 'template-456',
        name: 'WhatsApp Button Response',
        type: 'AUTOMATION_REPLY',
        simpleReplyText: 'WhatsApp button clicked!',
      });

      mockWhatsAppAPI.sendMessage.mockResolvedValue({ messageId: 'whatsapp-btn-msg-123' });

      const whatsappButtonPayload = {
        originalDetectIntentRequest: {
          payload: {
            // WhatsApp button interaction (no Instagram channel_type)
            inbox_id: '4',
            contact_phone: '+5511999999999',
            interaction_type: 'button_reply',
            wamid: 'wamid.whatsapp123',
            whatsapp_api_key: 'whatsapp-api-key',
            phone_number_id: '123456789',
            business_id: 'business123',
            contact_source: 'chatwit',
            message_id: 12345,
            account_id: 1,
            account_name: 'Test Account',
            interactive: {
              type: 'button_reply',
              button_reply: {
                id: 'whatsapp_btn_yes',
                title: 'Yes',
              },
            },
          },
        },
        queryResult: {
          intent: {
            displayName: 'Default Fallback Intent',
          },
        },
      };

      const mockRequest = {
        json: jest.fn().mockResolvedValue(whatsappButtonPayload),
      } as any;

      const response = await POST(mockRequest);

      // Should use WhatsApp flow
      expect(response.status).toBe(202);
      expect(mockAddInstagramTranslationJob).not.toHaveBeenCalled();

      // Wait for async processing
      await new Promise(resolve => setTimeout(resolve, 100));

      // WhatsApp button processing should work
      expect(mockPrisma.mapeamentoBotao.findFirst).toHaveBeenCalledWith({
        where: {
          buttonId: 'whatsapp_btn_yes',
          inbox: {
            inboxId: '4',
          },
        },
        include: expect.any(Object),
      });

      expect(mockWhatsAppAPI.sendMessage).toHaveBeenCalled();
    });
  });

  describe('Error Scenarios and Fallback Behavior', () => {
    test('should handle Instagram translation worker failure with fallback', async () => {
      // Mock worker failure
      mockWaitForInstagramTranslationResult.mockResolvedValue({
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
            contact_phone: '+5511999999999',
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
      };

      const mockRequest = {
        json: jest.fn().mockResolvedValue(instagramPayload),
      } as any;

      const response = await POST(mockRequest);
      const responseData = await response.json();

      // Should return 200 with fallback message
      expect(response.status).toBe(200);
      expect(response.headers.get('X-Error')).toContain('Template not found');

      // Should provide fallback Instagram message
      expect(responseData.fulfillmentMessages).toBeDefined();
      expect(mockCreateInstagramFallbackMessage).toHaveBeenCalledWith(
        'Mensagem não configurada para Instagram.'
      );
    });

    test('should handle message too long error with appropriate fallback', async () => {
      // Mock message too long error
      mockWaitForInstagramTranslationResult.mockResolvedValue({
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
            contact_phone: '+5511999999999',
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
      };

      const mockRequest = {
        json: jest.fn().mockResolvedValue(instagramPayload),
      } as any;

      const response = await POST(mockRequest);
      const responseData = await response.json();

      expect(response.status).toBe(200);
      expect(responseData.fulfillmentMessages).toBeDefined();
      expect(mockCreateInstagramFallbackMessage).toHaveBeenCalledWith(
        'Sua mensagem é muito longa para o Instagram. Tente uma mensagem mais curta.'
      );
    });

    test('should handle missing required data with validation error', async () => {
      const invalidInstagramPayload = {
        originalDetectIntentRequest: {
          payload: {
            channel_type: 'Channel::Instagram',
            // Missing required fields: inbox_id, contact_phone
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
      expect(mockCreateInstagramFallbackMessage).toHaveBeenCalledWith(
        'Desculpe, não foi possível processar sua mensagem no momento. Tente novamente.'
      );

      // Should not attempt to queue job
      expect(mockAddInstagramTranslationJob).not.toHaveBeenCalled();
    });

    test('should handle queue system failure gracefully', async () => {
      // Mock queue failure
      mockAddInstagramTranslationJob.mockRejectedValue(new Error('Queue system unavailable'));

      const instagramPayload = {
        originalDetectIntentRequest: {
          payload: {
            channel_type: 'Channel::Instagram',
            inbox_id: '4',
            contact_phone: '+5511999999999',
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
        json: jest.fn().mockResolvedValue(instagramPayload),
      } as any;

      const response = await POST(mockRequest);
      const responseData = await response.json();

      // Should handle queue failure gracefully
      expect(response.status).toBe(200);
      expect(responseData.fulfillmentMessages).toBeDefined();
      expect(mockCreateInstagramFallbackMessage).toHaveBeenCalled();
    });

    test('should handle critical system errors with fallback', async () => {
      // Mock critical system error
      mockWaitForInstagramTranslationResult.mockRejectedValue(new Error('Critical system failure'));

      const instagramPayload = {
        originalDetectIntentRequest: {
          payload: {
            channel_type: 'Channel::Instagram',
            inbox_id: '4',
            contact_phone: '+5511999999999',
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
        json: jest.fn().mockResolvedValue(instagramPayload),
      } as any;

      const response = await POST(mockRequest);
      const responseData = await response.json();

      // Should handle critical errors gracefully
      expect(response.status).toBe(200);
      expect(responseData.fulfillmentMessages).toBeDefined();
      expect(mockCreateInstagramFallbackMessage).toHaveBeenCalled();
    });
  });

  describe('Performance and Monitoring', () => {
    test('should include performance metrics in response headers', async () => {
      mockWaitForInstagramTranslationResult.mockResolvedValue({
        success: true,
        fulfillmentMessages: [mockCreateInstagramGenericTemplate()],
        processingTime: 250,
      });

      const instagramPayload = {
        originalDetectIntentRequest: {
          payload: {
            channel_type: 'Channel::Instagram',
            inbox_id: '4',
            contact_phone: '+5511999999999',
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
      };

      const mockRequest = {
        json: jest.fn().mockResolvedValue(instagramPayload),
      } as any;

      const response = await POST(mockRequest);

      // Verify performance headers are included
      expect(response.headers.get('X-Correlation-ID')).toBeDefined();
      expect(response.headers.get('Cache-Control')).toBe('no-cache, no-store, must-revalidate');

      // Verify response time is reasonable
      expect(response.status).toBe(200);
    });

    test('should handle concurrent Instagram requests efficiently', async () => {
      // Mock successful processing for all requests
      mockWaitForInstagramTranslationResult.mockResolvedValue({
        success: true,
        fulfillmentMessages: [mockCreateInstagramGenericTemplate()],
        processingTime: 150,
      });

      const createInstagramRequest = (intentName: string) => ({
        originalDetectIntentRequest: {
          payload: {
            channel_type: 'Channel::Instagram',
            inbox_id: '4',
            contact_phone: '+5511999999999',
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
      expect(mockAddInstagramTranslationJob).toHaveBeenCalledTimes(3);
    });
  });
});