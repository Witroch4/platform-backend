/**
 * Comprehensive end-to-end webhook tests with 202 response validation
 * Requirements: 1.1, 1.4, 2.1, 2.4, 5.1, 5.4
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
};

jest.mock('@/lib/redis', () => ({
  connection: mockRedis,
}));

jest.mock('@/lib/prisma', () => ({
  prisma: mockPrisma,
}));

// Mock WhatsApp API
const mockWhatsAppAPI = {
  sendMessage: jest.fn(),
  sendReaction: jest.fn(),
};

jest.mock('@/lib/whatsapp', () => mockWhatsAppAPI);

describe('Webhook E2E Integration Tests', () => {
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

    mockPrisma.mapeamentoIntencao.findFirst.mockResolvedValue(null);
    mockPrisma.mapeamentoBotao.findFirst.mockResolvedValue(null);
    mockPrisma.lead.findFirst.mockResolvedValue(null);
    mockPrisma.lead.create.mockResolvedValue({
      id: 'lead-123',
      phone: '+5511999999999',
      source: 'CHATWIT_OAB',
    });

    mockWhatsAppAPI.sendMessage.mockResolvedValue({ messageId: 'msg-123' });
    mockWhatsAppAPI.sendReaction.mockResolvedValue({ success: true });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Complete Webhook Flow - Intent Processing', () => {
    test('should process complete intent flow from webhook to WhatsApp response', async () => {
      // Setup intent mapping
      mockPrisma.mapeamentoIntencao.findFirst.mockResolvedValue({
        id: 'mapping-123',
        template: {
          id: 'template-123',
          name: 'Welcome Template',
          type: 'AUTOMATION_REPLY',
          simpleReplyText: 'Olá! Como posso ajudar você?',
        },
      });

      const mockPayload = {
        originalDetectIntentRequest: {
          payload: {
            inbox_id: '4',
            contact_phone: '+5511999999999',
            interaction_type: 'intent',
            wamid: 'wamid.test123',
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
            displayName: 'welcome.intent',
          },
        },
      };

      const mockRequest = {
        json: jest.fn().mockResolvedValue(mockPayload),
      } as any;

      // Execute webhook
      const startTime = Date.now();
      const response = await POST(mockRequest);
      const responseTime = Date.now() - startTime;
      const responseData = await response.json();

      // Validate immediate response (< 100ms)
      expect(responseTime).toBeLessThan(100);
      expect(response.status).toBe(202);
      expect(response.headers.get('Content-Type')).toBe('application/json');
      expect(response.headers.get('X-Correlation-ID')).toBeDefined();
      expect(responseData.correlationId).toBeDefined();

      // Wait for async processing to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify high priority job was processed (intent processing)
      expect(mockPrisma.mapeamentoIntencao.findFirst).toHaveBeenCalledWith({
        where: {
          intentName: 'welcome.intent',
          inbox: {
            inboxId: '4',
          },
        },
        include: expect.any(Object),
      });

      // Verify WhatsApp message was sent
      expect(mockWhatsAppAPI.sendMessage).toHaveBeenCalledWith(
        '+5511999999999',
        expect.objectContaining({
          type: 'text',
          text: {
            body: 'Olá! Como posso ajudar você?',
          },
        }),
        expect.objectContaining({
          token: 'test-api-key',
          phoneNumberId: '123456789',
          businessId: 'business123',
        }),
        expect.any(String),
        expect.any(String)
      );

      // Verify low priority job was processed (credentials update)
      expect(mockPrisma.chatwitInbox.updateMany).toHaveBeenCalledWith({
        where: { inboxId: '4' },
        data: {
          whatsappApiKey: 'test-api-key',
          phoneNumberId: '123456789',
          whatsappBusinessAccountId: 'business123',
          updatedAt: expect.any(Date),
        },
      });

      // Verify lead was created/updated
      expect(mockPrisma.lead.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          phone: '+5511999999999',
          source: 'CHATWIT_OAB',
          sourceIdentifier: 'chatwit',
        }),
      });

      // Verify cache operations
      expect(mockRedis.setex).toHaveBeenCalledWith(
        'chatwit:credentials_updated:4',
        1800,
        expect.any(String)
      );
    });

    test('should handle intent with interactive message template', async () => {
      // Setup interactive message mapping
      mockPrisma.mapeamentoIntencao.findFirst.mockResolvedValue({
        id: 'mapping-123',
        template: {
          id: 'template-123',
          name: 'Interactive Template',
          type: 'INTERACTIVE_MESSAGE',
          interactiveContent: {
            body: { text: 'Escolha uma opção:' },
            actionReplyButton: [
              { id: 'btn1', title: 'Opção 1' },
              { id: 'btn2', title: 'Opção 2' },
            ],
          },
        },
      });

      const mockPayload = {
        originalDetectIntentRequest: {
          payload: {
            inbox_id: '4',
            contact_phone: '+5511999999999',
            interaction_type: 'intent',
            wamid: 'wamid.test123',
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
            displayName: 'menu.intent',
          },
        },
      };

      const mockRequest = {
        json: jest.fn().mockResolvedValue(mockPayload),
      } as any;

      const response = await POST(mockRequest);

      expect(response.status).toBe(202);

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify interactive message was sent
      expect(mockWhatsAppAPI.sendMessage).toHaveBeenCalledWith(
        '+5511999999999',
        expect.objectContaining({
          type: 'interactive',
          interactive: expect.objectContaining({
            body: { text: 'Escolha uma opção:' },
          }),
        }),
        expect.any(Object),
        expect.any(String),
        expect.any(String)
      );
    });

    test('should handle intent with WhatsApp official template', async () => {
      // Setup WhatsApp official template mapping
      mockPrisma.mapeamentoIntencao.findFirst.mockResolvedValue({
        id: 'mapping-123',
        template: {
          id: 'template-123',
          name: 'Official Template',
          type: 'WHATSAPP_OFFICIAL',
          whatsappOfficialInfo: {
            metaTemplateId: 'welcome_template',
            language: 'pt_BR',
            components: [
              {
                type: 'BODY',
                text: 'Bem-vindo, {{contact_phone}}!',
              },
            ],
          },
        },
      });

      const mockPayload = {
        originalDetectIntentRequest: {
          payload: {
            inbox_id: '4',
            contact_phone: '+5511999999999',
            interaction_type: 'intent',
            wamid: 'wamid.test123',
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
            displayName: 'welcome.intent',
          },
        },
      };

      const mockRequest = {
        json: jest.fn().mockResolvedValue(mockPayload),
      } as any;

      const response = await POST(mockRequest);

      expect(response.status).toBe(202);

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify WhatsApp official template was sent
      expect(mockWhatsAppAPI.sendMessage).toHaveBeenCalledWith(
        '+5511999999999',
        expect.objectContaining({
          type: 'template',
          template: expect.objectContaining({
            name: 'welcome_template',
            language: { code: 'pt_BR' },
            components: expect.arrayContaining([
              expect.objectContaining({
                type: 'BODY',
                text: 'Bem-vindo, +5511999999999!',
              }),
            ]),
          }),
        }),
        expect.any(Object),
        expect.any(String),
        expect.any(String)
      );
    });
  });

  describe('Complete Webhook Flow - Button Processing', () => {
    test('should process complete button flow from webhook to reaction', async () => {
      // Setup button mapping
      mockPrisma.mapeamentoBotao.findFirst.mockResolvedValue({
        id: 'button-mapping-123',
        buttonId: 'btn_yes',
        actionType: 'SEND_TEMPLATE',
        actionPayload: {
          templateId: 'template-456',
        },
      });

      mockPrisma.template.findUnique.mockResolvedValue({
        id: 'template-456',
        name: 'Confirmation Template',
        type: 'AUTOMATION_REPLY',
        simpleReplyText: 'Obrigado pela confirmação!',
      });

      const mockPayload = {
        originalDetectIntentRequest: {
          payload: {
            inbox_id: '4',
            contact_phone: '+5511999999999',
            interaction_type: 'button_reply',
            wamid: 'wamid.test123',
            whatsapp_api_key: 'test-api-key',
            phone_number_id: '123456789',
            business_id: 'business123',
            contact_source: 'chatwit',
            message_id: 12345,
            account_id: 1,
            account_name: 'Test Account',
            interactive: {
              type: 'button_reply',
              button_reply: {
                id: 'btn_yes',
                title: 'Sim',
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
        json: jest.fn().mockResolvedValue(mockPayload),
      } as any;

      const response = await POST(mockRequest);

      expect(response.status).toBe(202);

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify button mapping was queried
      expect(mockPrisma.mapeamentoBotao.findFirst).toHaveBeenCalledWith({
        where: {
          buttonId: 'btn_yes',
          inbox: {
            inboxId: '4',
          },
        },
        include: expect.any(Object),
      });

      // Verify template was sent
      expect(mockWhatsAppAPI.sendMessage).toHaveBeenCalledWith(
        '+5511999999999',
        expect.objectContaining({
          type: 'text',
          text: {
            body: 'Obrigado pela confirmação!',
          },
        }),
        expect.any(Object),
        expect.any(String),
        expect.any(String)
      );
    });

    test('should handle button with emoji reaction action', async () => {
      // Setup button mapping with emoji reaction
      mockPrisma.mapeamentoBotao.findFirst.mockResolvedValue({
        id: 'button-mapping-123',
        buttonId: 'btn_like',
        actionType: 'SEND_TEMPLATE',
        actionPayload: {
          emoji: '👍',
        },
      });

      const mockPayload = {
        originalDetectIntentRequest: {
          payload: {
            inbox_id: '4',
            contact_phone: '+5511999999999',
            interaction_type: 'button_reply',
            wamid: 'wamid.test123',
            whatsapp_api_key: 'test-api-key',
            phone_number_id: '123456789',
            business_id: 'business123',
            contact_source: 'chatwit',
            message_id: 12345,
            account_id: 1,
            account_name: 'Test Account',
            interactive: {
              type: 'button_reply',
              button_reply: {
                id: 'btn_like',
                title: 'Curtir',
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
        json: jest.fn().mockResolvedValue(mockPayload),
      } as any;

      const response = await POST(mockRequest);

      expect(response.status).toBe(202);

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify emoji reaction was sent
      expect(mockWhatsAppAPI.sendMessage).toHaveBeenCalledWith(
        '+5511999999999',
        expect.objectContaining({
          type: 'reaction',
          reaction: {
            message_id: 'wamid.test123',
            emoji: '👍',
          },
        }),
        expect.any(Object),
        expect.any(String),
        expect.any(String)
      );
    });
  });

  describe('Credential Fallback Chain Scenarios', () => {
    test('should use inbox-specific credentials when available', async () => {
      // Inbox has its own credentials
      mockPrisma.chatwitInbox.findFirst.mockResolvedValue({
        inboxId: '4',
        whatsappApiKey: 'inbox-specific-key',
        phoneNumberId: '111111111',
        whatsappBusinessAccountId: 'inbox-business',
        updatedAt: new Date(),
        usuarioChatwit: {
          configuracaoGlobalWhatsApp: {
            whatsappApiKey: 'global-key',
            phoneNumberId: '999999999',
            whatsappBusinessAccountId: 'global-business',
          },
        },
        fallbackParaInbox: null,
        fallbackParaInboxId: null,
      });

      mockPrisma.mapeamentoIntencao.findFirst.mockResolvedValue({
        id: 'mapping-123',
        template: {
          id: 'template-123',
          name: 'Test Template',
          type: 'AUTOMATION_REPLY',
          simpleReplyText: 'Test message',
        },
      });

      const mockPayload = {
        originalDetectIntentRequest: {
          payload: {
            inbox_id: '4',
            contact_phone: '+5511999999999',
            interaction_type: 'intent',
            wamid: 'wamid.test123',
            whatsapp_api_key: 'payload-key', // This should be overridden by inbox-specific
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
        json: jest.fn().mockResolvedValue(mockPayload),
      } as any;

      const response = await POST(mockRequest);

      expect(response.status).toBe(202);

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify inbox-specific credentials were used
      expect(mockWhatsAppAPI.sendMessage).toHaveBeenCalledWith(
        '+5511999999999',
        expect.any(Object),
        expect.objectContaining({
          token: 'inbox-specific-key',
          phoneNumberId: '111111111',
          businessId: 'inbox-business',
        }),
        expect.any(String),
        expect.any(String)
      );
    });

    test('should fallback to parent inbox credentials', async () => {
      // First call: child inbox without credentials
      // Second call: parent inbox with credentials
      mockPrisma.chatwitInbox.findFirst
        .mockResolvedValueOnce({
          inboxId: '4',
          whatsappApiKey: null,
          phoneNumberId: null,
          whatsappBusinessAccountId: null,
          fallbackParaInboxId: '5',
          usuarioChatwit: {
            configuracaoGlobalWhatsApp: null,
          },
          fallbackParaInbox: null,
        })
        .mockResolvedValueOnce({
          inboxId: '5',
          whatsappApiKey: 'parent-key',
          phoneNumberId: '555555555',
          whatsappBusinessAccountId: 'parent-business',
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
          name: 'Test Template',
          type: 'AUTOMATION_REPLY',
          simpleReplyText: 'Test message',
        },
      });

      const mockPayload = {
        originalDetectIntentRequest: {
          payload: {
            inbox_id: '4',
            contact_phone: '+5511999999999',
            interaction_type: 'intent',
            wamid: 'wamid.test123',
            whatsapp_api_key: 'payload-key',
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
        json: jest.fn().mockResolvedValue(mockPayload),
      } as any;

      const response = await POST(mockRequest);

      expect(response.status).toBe(202);

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify parent inbox credentials were used
      expect(mockWhatsAppAPI.sendMessage).toHaveBeenCalledWith(
        '+5511999999999',
        expect.any(Object),
        expect.objectContaining({
          token: 'parent-key',
          phoneNumberId: '555555555',
          businessId: 'parent-business',
        }),
        expect.any(String),
        expect.any(String)
      );
    });

    test('should fallback to global configuration', async () => {
      // Inbox without credentials but with global config
      mockPrisma.chatwitInbox.findFirst.mockResolvedValue({
        inboxId: '4',
        whatsappApiKey: null,
        phoneNumberId: null,
        whatsappBusinessAccountId: null,
        fallbackParaInboxId: null,
        usuarioChatwit: {
          configuracaoGlobalWhatsApp: {
            whatsappApiKey: 'global-key',
            phoneNumberId: '777777777',
            whatsappBusinessAccountId: 'global-business',
            updatedAt: new Date(),
          },
        },
        fallbackParaInbox: null,
      });

      mockPrisma.mapeamentoIntencao.findFirst.mockResolvedValue({
        id: 'mapping-123',
        template: {
          id: 'template-123',
          name: 'Test Template',
          type: 'AUTOMATION_REPLY',
          simpleReplyText: 'Test message',
        },
      });

      const mockPayload = {
        originalDetectIntentRequest: {
          payload: {
            inbox_id: '4',
            contact_phone: '+5511999999999',
            interaction_type: 'intent',
            wamid: 'wamid.test123',
            whatsapp_api_key: 'payload-key',
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
        json: jest.fn().mockResolvedValue(mockPayload),
      } as any;

      const response = await POST(mockRequest);

      expect(response.status).toBe(202);

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify global credentials were used
      expect(mockWhatsAppAPI.sendMessage).toHaveBeenCalledWith(
        '+5511999999999',
        expect.any(Object),
        expect.objectContaining({
          token: 'global-key',
          phoneNumberId: '777777777',
          businessId: 'global-business',
        }),
        expect.any(String),
        expect.any(String)
      );
    });

    test('should detect and handle fallback loops', async () => {
      // Create a loop: 4 -> 5 -> 4
      mockPrisma.chatwitInbox.findFirst
        .mockResolvedValueOnce({
          inboxId: '4',
          whatsappApiKey: null,
          phoneNumberId: null,
          whatsappBusinessAccountId: null,
          fallbackParaInboxId: '5',
          usuarioChatwit: { configuracaoGlobalWhatsApp: null },
          fallbackParaInbox: null,
        })
        .mockResolvedValueOnce({
          inboxId: '5',
          whatsappApiKey: null,
          phoneNumberId: null,
          whatsappBusinessAccountId: null,
          fallbackParaInboxId: '4', // Loop back to 4
          usuarioChatwit: { configuracaoGlobalWhatsApp: null },
          fallbackParaInbox: null,
        });

      const mockPayload = {
        originalDetectIntentRequest: {
          payload: {
            inbox_id: '4',
            contact_phone: '+5511999999999',
            interaction_type: 'intent',
            wamid: 'wamid.test123',
            whatsapp_api_key: 'payload-key',
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
        json: jest.fn().mockResolvedValue(mockPayload),
      } as any;

      const response = await POST(mockRequest);

      expect(response.status).toBe(202);

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 100));

      // Should use payload credentials as fallback when loop is detected
      expect(mockWhatsAppAPI.sendMessage).toHaveBeenCalledWith(
        '+5511999999999',
        expect.any(Object),
        expect.objectContaining({
          token: 'payload-key',
          phoneNumberId: '123456789',
          businessId: 'business123',
        }),
        expect.any(String),
        expect.any(String)
      );
    });
  });

  describe('Database Updates and Cache Synchronization', () => {
    test('should update credentials in database and cache', async () => {
      // Cache miss scenario
      mockRedis.exists.mockResolvedValue(0); // Not recently updated

      const mockPayload = {
        originalDetectIntentRequest: {
          payload: {
            inbox_id: '4',
            contact_phone: '+5511999999999',
            interaction_type: 'intent',
            wamid: 'wamid.test123',
            whatsapp_api_key: 'new-api-key',
            phone_number_id: '987654321',
            business_id: 'new-business',
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
        json: jest.fn().mockResolvedValue(mockPayload),
      } as any;

      const response = await POST(mockRequest);

      expect(response.status).toBe(202);

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify database update
      expect(mockPrisma.chatwitInbox.updateMany).toHaveBeenCalledWith({
        where: { inboxId: '4' },
        data: {
          whatsappApiKey: 'new-api-key',
          phoneNumberId: '987654321',
          whatsappBusinessAccountId: 'new-business',
          updatedAt: expect.any(Date),
        },
      });

      // Verify cache operations
      expect(mockRedis.setex).toHaveBeenCalledWith(
        'chatwit:credentials_updated:4',
        1800,
        expect.any(String)
      );
    });

    test('should skip database update when credentials recently updated', async () => {
      // Cache hit scenario
      mockRedis.exists.mockResolvedValue(1); // Recently updated

      const mockPayload = {
        originalDetectIntentRequest: {
          payload: {
            inbox_id: '4',
            contact_phone: '+5511999999999',
            interaction_type: 'intent',
            wamid: 'wamid.test123',
            whatsapp_api_key: 'api-key',
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
        json: jest.fn().mockResolvedValue(mockPayload),
      } as any;

      const response = await POST(mockRequest);

      expect(response.status).toBe(202);

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify database update was skipped
      expect(mockPrisma.chatwitInbox.updateMany).not.toHaveBeenCalled();
    });

    test('should create new lead when not exists', async () => {
      mockPrisma.lead.findFirst.mockResolvedValue(null); // Lead doesn't exist

      const mockPayload = {
        originalDetectIntentRequest: {
          payload: {
            inbox_id: '4',
            contact_phone: '+5511999999999',
            interaction_type: 'intent',
            wamid: 'wamid.test123',
            whatsapp_api_key: 'api-key',
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
        json: jest.fn().mockResolvedValue(mockPayload),
      } as any;

      const response = await POST(mockRequest);

      expect(response.status).toBe(202);

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify lead creation
      expect(mockPrisma.lead.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          phone: '+5511999999999',
          source: 'CHATWIT_OAB',
          sourceIdentifier: 'chatwit',
        }),
      });
    });

    test('should update existing lead', async () => {
      const existingLead = {
        id: 'existing-lead-123',
        phone: '+5511999999999',
        source: 'CHATWIT_OAB',
        sourceIdentifier: 'chatwit',
      };

      mockPrisma.lead.findFirst.mockResolvedValue(existingLead);

      const mockPayload = {
        originalDetectIntentRequest: {
          payload: {
            inbox_id: '4',
            contact_phone: '+5511999999999',
            interaction_type: 'intent',
            wamid: 'wamid.test123',
            whatsapp_api_key: 'api-key',
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
        json: jest.fn().mockResolvedValue(mockPayload),
      } as any;

      const response = await POST(mockRequest);

      expect(response.status).toBe(202);

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify lead update
      expect(mockPrisma.lead.update).toHaveBeenCalledWith({
        where: { id: 'existing-lead-123' },
        data: expect.objectContaining({
          lastMessageId: 12345,
          lastWamid: 'wamid.test123',
          lastAccountId: 1,
          lastAccountName: 'Test Account',
          updatedAt: expect.any(Date),
        }),
      });
    });
  });

  describe('Error Handling and Resilience', () => {
    test('should handle database errors gracefully', async () => {
      mockPrisma.chatwitInbox.findFirst.mockRejectedValue(new Error('Database error'));

      const mockPayload = {
        originalDetectIntentRequest: {
          payload: {
            inbox_id: '4',
            contact_phone: '+5511999999999',
            interaction_type: 'intent',
            wamid: 'wamid.test123',
            whatsapp_api_key: 'api-key',
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
        json: jest.fn().mockResolvedValue(mockPayload),
      } as any;

      const response = await POST(mockRequest);

      // Should still return 202 despite database error
      expect(response.status).toBe(202);
      expect(response.headers.get('X-Correlation-ID')).toBeDefined();
    });

    test('should handle cache errors gracefully', async () => {
      mockRedis.get.mockRejectedValue(new Error('Redis error'));
      mockRedis.setex.mockRejectedValue(new Error('Redis error'));

      const mockPayload = {
        originalDetectIntentRequest: {
          payload: {
            inbox_id: '4',
            contact_phone: '+5511999999999',
            interaction_type: 'intent',
            wamid: 'wamid.test123',
            whatsapp_api_key: 'api-key',
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
        json: jest.fn().mockResolvedValue(mockPayload),
      } as any;

      const response = await POST(mockRequest);

      // Should still return 202 despite cache errors
      expect(response.status).toBe(202);
      expect(response.headers.get('X-Correlation-ID')).toBeDefined();
    });

    test('should handle WhatsApp API errors gracefully', async () => {
      mockWhatsAppAPI.sendMessage.mockRejectedValue(new Error('WhatsApp API error'));

      mockPrisma.mapeamentoIntencao.findFirst.mockResolvedValue({
        id: 'mapping-123',
        template: {
          id: 'template-123',
          name: 'Test Template',
          type: 'AUTOMATION_REPLY',
          simpleReplyText: 'Test message',
        },
      });

      const mockPayload = {
        originalDetectIntentRequest: {
          payload: {
            inbox_id: '4',
            contact_phone: '+5511999999999',
            interaction_type: 'intent',
            wamid: 'wamid.test123',
            whatsapp_api_key: 'api-key',
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
        json: jest.fn().mockResolvedValue(mockPayload),
      } as any;

      const response = await POST(mockRequest);

      // Should still return 202 despite WhatsApp API error
      expect(response.status).toBe(202);
      expect(response.headers.get('X-Correlation-ID')).toBeDefined();

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 100));

      // Database operations should still complete
      expect(mockPrisma.chatwitInbox.updateMany).toHaveBeenCalled();
    });

    test('should handle malformed payload gracefully', async () => {
      const malformedPayload = {
        // Missing required fields
        originalDetectIntentRequest: {
          payload: {
            // Missing inbox_id, contact_phone, etc.
          },
        },
      };

      const mockRequest = {
        json: jest.fn().mockResolvedValue(malformedPayload),
      } as any;

      const response = await POST(mockRequest);

      // Should still return 202 and fallback to legacy processing
      expect(response.status).toBe(202);
      expect(response.headers.get('X-Correlation-ID')).toBeDefined();
    });
  });

  describe('Performance and Monitoring', () => {
    test('should maintain response time under load', async () => {
      const mockPayload = {
        originalDetectIntentRequest: {
          payload: {
            inbox_id: '4',
            contact_phone: '+5511999999999',
            interaction_type: 'intent',
            wamid: 'wamid.test123',
            whatsapp_api_key: 'api-key',
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
        json: jest.fn().mockResolvedValue(mockPayload),
      } as any;

      // Simulate concurrent requests
      const promises = Array.from({ length: 10 }, async () => {
        const startTime = Date.now();
        const response = await POST(mockRequest);
        const responseTime = Date.now() - startTime;
        return { response, responseTime };
      });

      const results = await Promise.all(promises);

      // All requests should complete within 100ms
      results.forEach(({ response, responseTime }) => {
        expect(response.status).toBe(202);
        expect(responseTime).toBeLessThan(100);
      });
    });

    test('should include correlation ID in all operations', async () => {
      const mockPayload = {
        originalDetectIntentRequest: {
          payload: {
            inbox_id: '4',
            contact_phone: '+5511999999999',
            interaction_type: 'intent',
            wamid: 'wamid.test123',
            whatsapp_api_key: 'api-key',
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
        json: jest.fn().mockResolvedValue(mockPayload),
      } as any;

      const response = await POST(mockRequest);
      const responseData = await response.json();

      // Verify correlation ID is present
      expect(responseData.correlationId).toBeDefined();
      expect(response.headers.get('X-Correlation-ID')).toBe(responseData.correlationId);

      // Correlation ID should be used in all subsequent operations
      // This would be verified through logs in a real scenario
    });
  });
});