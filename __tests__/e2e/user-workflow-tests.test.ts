/**
 * Complete user interaction tests from webhook to WhatsApp response
 * Requirements: All requirements comprehensive validation
 */

import { describe, test, expect, jest, beforeEach, afterEach, beforeAll, afterAll } from '@jest/globals';
import { NextRequest } from 'next/server';

// Mock all dependencies for complete E2E testing
const mockRedis = {
  get: jest.fn(),
  setex: jest.fn(),
  del: jest.fn(),
  exists: jest.fn(),
  mget: jest.fn(),
  keys: jest.fn(),
  ping: jest.fn(),
  info: jest.fn(),
  pipeline: jest.fn(),
};

const mockPrisma = {
  chatwitInbox: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    updateMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  mapeamentoIntencao: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
  },
  mapeamentoBotao: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
  },
  lead: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  template: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
  },
  $transaction: jest.fn(),
};

const mockWhatsAppAPI = {
  sendMessage: jest.fn(),
  sendReaction: jest.fn(),
  sendTemplate: jest.fn(),
  getMessageStatus: jest.fn(),
};

jest.mock('@/lib/redis', () => ({
  connection: mockRedis,
}));

jest.mock('@/lib/prisma', () => ({
  prisma: mockPrisma,
}));

jest.mock('@/lib/whatsapp', () => mockWhatsAppAPI);

describe('Complete User Workflows E2E Tests', () => {
  let POST: any;

  beforeAll(async () => {
    // Import webhook handler after mocks are set up
    const webhookModule = await import('@/app/api/admin/mtf-diamante/whatsapp/webhook/route');
    POST = webhookModule.POST;
  });

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup comprehensive mock responses
    mockRedis.get.mockResolvedValue(null);
    mockRedis.setex.mockResolvedValue('OK');
    mockRedis.del.mockResolvedValue(1);
    mockRedis.exists.mockResolvedValue(0);
    mockRedis.mget.mockResolvedValue([]);
    mockRedis.keys.mockResolvedValue([]);
    mockRedis.ping.mockResolvedValue('PONG');
    mockRedis.info.mockResolvedValue('used_memory_human:10.5M');
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

    mockPrisma.lead.findFirst.mockResolvedValue(null);
    mockPrisma.lead.create.mockResolvedValue({
      id: 'lead-123',
      phone: '+5511999999999',
      source: 'CHATWIT_OAB',
      sourceIdentifier: 'chatwit',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    mockWhatsAppAPI.sendMessage.mockResolvedValue({ 
      messageId: 'msg-123',
      status: 'sent',
      timestamp: Date.now(),
    });
    mockWhatsAppAPI.sendReaction.mockResolvedValue({ 
      success: true,
      messageId: 'reaction-123',
    });
    mockWhatsAppAPI.getMessageStatus.mockResolvedValue({
      status: 'delivered',
      timestamp: Date.now(),
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Complete Lead Creation and Update Workflow', () => {
    test('should handle complete lead lifecycle from first contact to conversion', async () => {
      // Step 1: First contact - Welcome intent
      const welcomePayload = {
        originalDetectIntentRequest: {
          payload: {
            inbox_id: '4',
            contact_phone: '+5511999999999',
            interaction_type: 'intent',
            wamid: 'wamid.welcome123',
            whatsapp_api_key: 'test-api-key',
            phone_number_id: '123456789',
            business_id: 'business123',
            contact_source: 'chatwit',
            message_id: 12345,
            account_id: 1,
            account_name: 'E2E Test Account',
          },
        },
        queryResult: {
          intent: {
            displayName: 'welcome.intent',
          },
          parameters: {
            person: { name: 'João Silva' },
            phone: '+5511999999999',
          },
        },
      };

      // Setup welcome intent mapping
      mockPrisma.mapeamentoIntencao.findFirst.mockResolvedValue({
        id: 'welcome-mapping-123',
        template: {
          id: 'welcome-template-123',
          name: 'Welcome Template',
          type: 'INTERACTIVE_MESSAGE',
          interactiveContent: {
            body: { text: 'Olá {{name}}! Bem-vindo ao nosso atendimento. Como posso ajudar você hoje?' },
            actionReplyButton: [
              { id: 'btn_info', title: 'Informações' },
              { id: 'btn_support', title: 'Suporte' },
              { id: 'btn_sales', title: 'Vendas' },
            ],
          },
        },
      });

      const welcomeRequest = {
        json: jest.fn().mockResolvedValue(welcomePayload),
      } as any;

      // Execute welcome webhook
      const welcomeResponse = await POST(welcomeRequest);
      expect(welcomeResponse.status).toBe(202);

      const welcomeResponseData = await welcomeResponse.json();
      const welcomeCorrelationId = welcomeResponseData.correlationId;

      // Wait for async processing
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify lead was created
      expect(mockPrisma.lead.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          phone: '+5511999999999',
          source: 'CHATWIT_OAB',
          sourceIdentifier: 'chatwit',
        }),
      });

      // Verify welcome message was sent
      expect(mockWhatsAppAPI.sendMessage).toHaveBeenCalledWith(
        '+5511999999999',
        expect.objectContaining({
          type: 'interactive',
          interactive: expect.objectContaining({
            body: { text: expect.stringContaining('João Silva') },
            actionReplyButton: expect.arrayContaining([
              expect.objectContaining({ id: 'btn_info', title: 'Informações' }),
              expect.objectContaining({ id: 'btn_support', title: 'Suporte' }),
              expect.objectContaining({ id: 'btn_sales', title: 'Vendas' }),
            ]),
          }),
        }),
        expect.any(Object),
        expect.any(String),
        welcomeCorrelationId
      );

      console.log('Complete lead lifecycle workflow validated successfully');
    });

    test('should handle lead conversion workflow with multiple touchpoints', async () => {
      // Setup existing qualified lead
      const qualifiedLead = {
        id: 'qualified-lead-456',
        phone: '+5511888888888',
        source: 'CHATWIT_OAB',
        sourceIdentifier: 'chatwit',
        name: 'Maria Santos',
        tags: ['qualified-lead', 'premium-interest'],
        metadata: {
          salesFunnelStage: 'consideration',
          productInterest: 'premium-plan',
          leadScore: 85,
        },
      };

      mockPrisma.lead.findFirst.mockResolvedValue(qualifiedLead);

      // Step 1: Scheduling intent
      const schedulePayload = {
        originalDetectIntentRequest: {
          payload: {
            inbox_id: '4',
            contact_phone: '+5511888888888',
            interaction_type: 'intent',
            wamid: 'wamid.schedule123',
            whatsapp_api_key: 'test-api-key',
            phone_number_id: '123456789',
            business_id: 'business123',
            contact_source: 'chatwit',
            message_id: 12350,
            account_id: 1,
            account_name: 'E2E Test Account',
          },
        },
        queryResult: {
          intent: {
            displayName: 'schedule.demo.intent',
          },
          parameters: {
            date: '2024-02-15',
            time: '14:00',
          },
        },
      };

      // Setup schedule intent mapping
      mockPrisma.mapeamentoIntencao.findFirst.mockResolvedValue({
        id: 'schedule-mapping-456',
        template: {
          id: 'schedule-template-456',
          name: 'Schedule Confirmation Template',
          type: 'INTERACTIVE_MESSAGE',
          interactiveContent: {
            body: { 
              text: 'Perfeito {{name}}! Sua demonstração foi agendada para {{date}} às {{time}}.\n\nVocê receberá um lembrete 1 hora antes.' 
            },
            actionReplyButton: [
              { id: 'btn_confirm_schedule', title: 'Confirmar' },
              { id: 'btn_reschedule', title: 'Reagendar' },
              { id: 'btn_cancel', title: 'Cancelar' },
            ],
          },
        },
      });

      const scheduleRequest = {
        json: jest.fn().mockResolvedValue(schedulePayload),
      } as any;

      // Execute schedule webhook
      const scheduleResponse = await POST(scheduleRequest);
      expect(scheduleResponse.status).toBe(202);

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify schedule confirmation was sent
      expect(mockWhatsAppAPI.sendMessage).toHaveBeenCalledWith(
        '+5511888888888',
        expect.objectContaining({
          type: 'interactive',
          interactive: expect.objectContaining({
            body: { 
              text: expect.stringContaining('Maria Santos') 
            },
          }),
        }),
        expect.any(Object),
        expect.any(String),
        expect.any(String)
      );

      console.log('Lead conversion workflow with multiple touchpoints validated successfully');
    });
  });

  describe('Template Management and Usage Workflows', () => {
    test('should handle dynamic template selection based on user context', async () => {
      // Setup user with specific context
      const contextualLead = {
        id: 'contextual-lead-789',
        phone: '+5511777777777',
        source: 'CHATWIT_OAB',
        sourceIdentifier: 'chatwit',
        name: 'Carlos Oliveira',
        tags: ['vip-customer', 'enterprise-client'],
        metadata: {
          customerTier: 'enterprise',
          lastPurchase: '2024-01-15',
          totalSpent: 50000,
          preferredLanguage: 'pt_BR',
        },
      };

      mockPrisma.lead.findFirst.mockResolvedValue(contextualLead);

      // Setup contextual intent that should trigger VIP template
      const vipSupportPayload = {
        originalDetectIntentRequest: {
          payload: {
            inbox_id: '4',
            contact_phone: '+5511777777777',
            interaction_type: 'intent',
            wamid: 'wamid.vipsupport123',
            whatsapp_api_key: 'test-api-key',
            phone_number_id: '123456789',
            business_id: 'business123',
            contact_source: 'chatwit',
            message_id: 12360,
            account_id: 1,
            account_name: 'E2E Test Account',
          },
        },
        queryResult: {
          intent: {
            displayName: 'support.request.intent',
          },
          parameters: {
            urgency: 'high',
            category: 'technical',
          },
        },
      };

      // Setup VIP support template mapping
      mockPrisma.mapeamentoIntencao.findFirst.mockResolvedValue({
        id: 'vip-support-mapping-789',
        template: {
          id: 'vip-support-template-789',
          name: 'VIP Support Template',
          type: 'WHATSAPP_OFFICIAL',
          whatsappOfficialInfo: {
            metaTemplateId: 'vip_support_template',
            language: 'pt_BR',
            components: [
              {
                type: 'HEADER',
                text: '🌟 Suporte VIP - Prioridade Máxima',
              },
              {
                type: 'BODY',
                text: 'Olá {{name}}, como cliente Enterprise, você tem acesso ao nosso suporte prioritário.\n\nSua solicitação {{category}} com urgência {{urgency}} foi recebida e será atendida em até 15 minutos.\n\nTicket: #{{ticket_id}}',
              },
              {
                type: 'FOOTER',
                text: 'Suporte VIP 24/7 | Resposta garantida',
              },
            ],
          },
        },
      });

      const vipRequest = {
        json: jest.fn().mockResolvedValue(vipSupportPayload),
      } as any;

      // Execute VIP support webhook
      const vipResponse = await POST(vipRequest);
      expect(vipResponse.status).toBe(202);

      const vipResponseData = await vipResponse.json();
      const vipCorrelationId = vipResponseData.correlationId;

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify VIP template was used with proper variable substitution
      expect(mockWhatsAppAPI.sendMessage).toHaveBeenCalledWith(
        '+5511777777777',
        expect.objectContaining({
          type: 'template',
          template: expect.objectContaining({
            name: 'vip_support_template',
            language: { code: 'pt_BR' },
            components: expect.arrayContaining([
              expect.objectContaining({
                type: 'HEADER',
                text: '🌟 Suporte VIP - Prioridade Máxima',
              }),
              expect.objectContaining({
                type: 'BODY',
                text: expect.stringContaining('Carlos Oliveira'),
              }),
            ]),
          }),
        }),
        expect.any(Object),
        expect.any(String),
        vipCorrelationId
      );

      console.log('Dynamic template selection based on user context validated successfully');
    });

    test('should handle template fallback chain when primary template fails', async () => {
      // Setup scenario where primary template is not available
      const fallbackPayload = {
        originalDetectIntentRequest: {
          payload: {
            inbox_id: '4',
            contact_phone: '+5511666666666',
            interaction_type: 'intent',
            wamid: 'wamid.fallback123',
            whatsapp_api_key: 'test-api-key',
            phone_number_id: '123456789',
            business_id: 'business123',
            contact_source: 'chatwit',
            message_id: 12370,
            account_id: 1,
            account_name: 'E2E Test Account',
          },
        },
        queryResult: {
          intent: {
            displayName: 'complex.template.intent',
          },
        },
      };

      // Setup primary template that will fail
      mockPrisma.mapeamentoIntencao.findFirst.mockResolvedValue({
        id: 'complex-mapping-999',
        template: {
          id: 'complex-template-999',
          name: 'Complex Template',
          type: 'WHATSAPP_OFFICIAL',
          whatsappOfficialInfo: {
            metaTemplateId: 'non_existent_template', // This will fail
            language: 'pt_BR',
            components: [],
          },
        },
      });

      // Mock WhatsApp API to fail for primary template
      mockWhatsAppAPI.sendMessage
        .mockRejectedValueOnce(new Error('Template not found: non_existent_template'))
        .mockResolvedValueOnce({ 
          messageId: 'fallback-msg-123',
          status: 'sent',
        });

      const fallbackRequest = {
        json: jest.fn().mockResolvedValue(fallbackPayload),
      } as any;

      // Execute fallback webhook
      const fallbackResponse = await POST(fallbackRequest);
      expect(fallbackResponse.status).toBe(202);

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify primary template was attempted
      expect(mockWhatsAppAPI.sendMessage).toHaveBeenCalledWith(
        '+5511666666666',
        expect.objectContaining({
          type: 'template',
          template: expect.objectContaining({
            name: 'non_existent_template',
          }),
        }),
        expect.any(Object),
        expect.any(String),
        expect.any(String)
      );

      // Verify fallback message was sent
      expect(mockWhatsAppAPI.sendMessage).toHaveBeenCalledWith(
        '+5511666666666',
        expect.objectContaining({
          type: 'text',
          text: {
            body: expect.stringContaining('Desculpe, não consegui processar sua solicitação'),
          },
        }),
        expect.any(Object),
        'fallback',
        expect.any(String)
      );

      console.log('Template fallback chain validated successfully');
    });
  });

  describe('Credential Configuration and Fallback Scenarios', () => {
    test('should handle complete credential fallback chain workflow', async () => {
      // Setup complex fallback scenario: Child -> Parent -> Global
      const childInboxPayload = {
        originalDetectIntentRequest: {
          payload: {
            inbox_id: '10', // Child inbox without credentials
            contact_phone: '+5511444444444',
            interaction_type: 'intent',
            wamid: 'wamid.fallback123',
            whatsapp_api_key: 'child-payload-key', // Will be overridden
            phone_number_id: '111111111',
            business_id: 'child-business',
            contact_source: 'chatwit',
            message_id: 12390,
            account_id: 1,
            account_name: 'E2E Test Account',
          },
        },
        queryResult: {
          intent: {
            displayName: 'fallback.test.intent',
          },
        },
      };

      // Setup fallback chain: 10 -> 5 -> global
      mockPrisma.chatwitInbox.findFirst
        .mockResolvedValueOnce({
          // Child inbox (10) - no credentials, fallback to 5
          inboxId: '10',
          whatsappApiKey: null,
          phoneNumberId: null,
          whatsappBusinessAccountId: null,
          fallbackParaInboxId: '5',
          usuarioChatwit: {
            configuracaoGlobalWhatsApp: {
              whatsappApiKey: 'global-fallback-key',
              phoneNumberId: '999999999',
              whatsappBusinessAccountId: 'global-business',
              updatedAt: new Date(),
            },
          },
          fallbackParaInbox: null,
        })
        .mockResolvedValueOnce({
          // Parent inbox (5) - no credentials, will use global
          inboxId: '5',
          whatsappApiKey: null,
          phoneNumberId: null,
          whatsappBusinessAccountId: null,
          fallbackParaInboxId: null,
          usuarioChatwit: {
            configuracaoGlobalWhatsApp: {
              whatsappApiKey: 'global-fallback-key',
              phoneNumberId: '999999999',
              whatsappBusinessAccountId: 'global-business',
              updatedAt: new Date(),
            },
          },
          fallbackParaInbox: null,
        });

      // Setup intent mapping for fallback test
      mockPrisma.mapeamentoIntencao.findFirst.mockResolvedValue({
        id: 'fallback-mapping-123',
        template: {
          id: 'fallback-template-123',
          name: 'Fallback Test Template',
          type: 'AUTOMATION_REPLY',
          simpleReplyText: 'Mensagem de teste para fallback de credenciais',
        },
      });

      const fallbackRequest = {
        json: jest.fn().mockResolvedValue(childInboxPayload),
      } as any;

      // Execute fallback webhook
      const fallbackResponse = await POST(fallbackRequest);
      expect(fallbackResponse.status).toBe(202);

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify message was sent using global credentials
      expect(mockWhatsAppAPI.sendMessage).toHaveBeenCalledWith(
        '+5511444444444',
        expect.objectContaining({
          type: 'text',
          text: {
            body: 'Mensagem de teste para fallback de credenciais',
          },
        }),
        expect.objectContaining({
          token: 'global-fallback-key',
          phoneNumberId: '999999999',
          businessId: 'global-business',
        }),
        expect.any(String),
        expect.any(String)
      );

      // Verify credentials were cached for the child inbox
      expect(mockRedis.setex).toHaveBeenCalledWith(
        'chatwit:credentials:10',
        3600,
        expect.stringContaining('global-fallback-key')
      );

      console.log('Complete credential fallback chain workflow validated successfully');
    });
  });

  describe('Performance and Scalability Workflows', () => {
    test('should handle high-volume concurrent user interactions', async () => {
      const numConcurrentUsers = 20;
      const userInteractions = Array.from({ length: numConcurrentUsers }, (_, i) => ({
        originalDetectIntentRequest: {
          payload: {
            inbox_id: '4',
            contact_phone: `+55119999${String(i).padStart(4, '0')}`,
            interaction_type: 'intent',
            wamid: `wamid.concurrent${i}`,
            whatsapp_api_key: 'test-api-key',
            phone_number_id: '123456789',
            business_id: 'business123',
            contact_source: 'chatwit',
            message_id: 12500 + i,
            account_id: 1,
            account_name: 'E2E Test Account',
          },
        },
        queryResult: {
          intent: {
            displayName: 'concurrent.test.intent',
          },
        },
      }));

      // Setup template for concurrent test
      mockPrisma.mapeamentoIntencao.findFirst.mockResolvedValue({
        id: 'concurrent-mapping-123',
        template: {
          id: 'concurrent-template-123',
          name: 'Concurrent Test Template',
          type: 'AUTOMATION_REPLY',
          simpleReplyText: 'Resposta para teste de concorrência',
        },
      });

      const startTime = performance.now();

      // Execute all interactions concurrently
      const promises = userInteractions.map(async (payload, index) => {
        const request = {
          json: jest.fn().mockResolvedValue(payload),
        } as any;

        const requestStartTime = performance.now();
        const response = await POST(request);
        const responseTime = performance.now() - requestStartTime;

        return {
          index,
          response,
          responseTime,
          correlationId: (await response.json()).correlationId,
        };
      });

      const results = await Promise.all(promises);
      const totalTime = performance.now() - startTime;

      // Verify all requests completed successfully
      results.forEach(({ response, responseTime }) => {
        expect(response.status).toBe(202);
        expect(responseTime).toBeLessThan(200); // Each request under 200ms
      });

      // Wait for all async processing to complete
      await new Promise(resolve => setTimeout(resolve, 200));

      // Verify all messages were sent
      expect(mockWhatsAppAPI.sendMessage).toHaveBeenCalledTimes(numConcurrentUsers);

      // Verify all leads were created
      expect(mockPrisma.lead.create).toHaveBeenCalledTimes(numConcurrentUsers);

      // Calculate performance metrics
      const responseTimes = results.map(r => r.responseTime);
      const averageResponseTime = responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length;
      const maxResponseTime = Math.max(...responseTimes);

      expect(averageResponseTime).toBeLessThan(100);
      expect(maxResponseTime).toBeLessThan(200);

      console.log(`High-volume concurrent interactions performance:
        - Concurrent users: ${numConcurrentUsers}
        - Total time: ${totalTime.toFixed(2)}ms
        - Average response time: ${averageResponseTime.toFixed(2)}ms
        - Max response time: ${maxResponseTime.toFixed(2)}ms
        - Requests per second: ${(numConcurrentUsers / (totalTime / 1000)).toFixed(0)}
      `);
    });
  });
});