/**
 * Integration tests for complete job processing flow through both queues
 * Requirements: 1.1, 1.4, 2.1, 2.4, 5.1, 5.4
 */

import { describe, test, expect, jest, beforeEach, afterEach, beforeAll, afterAll } from '@jest/globals';
import { Job } from 'bullmq';

// Mock dependencies
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

const mockWhatsAppAPI = {
  sendMessage: jest.fn(),
  sendReaction: jest.fn(),
};

jest.mock('@/lib/redis', () => ({
  connection: mockRedis,
}));

jest.mock('@/lib/prisma', () => ({
  prisma: mockPrisma,
}));

jest.mock('@/lib/whatsapp', () => mockWhatsAppAPI);

describe('Job Processing Flow Integration Tests', () => {
  let respostaRapidaWorkerTask: any;
  let persistenciaWorkerTask: any;
  let RespostaRapidaJobData: any;
  let PersistenciaCredenciaisJobData: any;

  beforeAll(async () => {
    // Import worker tasks after mocks are set up
    const respostaModule = await import('@/worker/WebhookWorkerTasks/respostaRapida.worker.task');
    const persistenciaModule = await import('@/worker/WebhookWorkerTasks/persistencia.worker.task');

    respostaRapidaWorkerTask = respostaModule.processRespostaRapidaTask;
    persistenciaWorkerTask = persistenciaModule.processPersistenciaTask;
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

  describe('High Priority Queue - Intent Processing', () => {
    test('should process intent job with template response', async () => {
      // Setup template mapping
      mockPrisma.mapeamentoIntencao.findFirst.mockResolvedValue({
        id: 'mapping-123',
        template: {
          id: 'template-123',
          name: 'Welcome Template',
          type: 'AUTOMATION_REPLY',
          simpleReplyText: 'Olá! Como posso ajudar você hoje?',
        },
      });

      const jobData = {
        type: 'processarResposta' as const,
        data: {
          inboxId: '4',
          contactPhone: '+5511999999999',
          interactionType: 'intent' as const,
          intentName: 'welcome.intent',
          wamid: 'wamid.test123',
          credentials: {
            token: 'test-api-key',
            phoneNumberId: '123456789',
            businessId: 'business123',
          },
          correlationId: 'test-correlation-id',
          messageId: 12345,
          accountId: 1,
          accountName: 'Test Account',
          contactSource: 'chatwit',
        },
      };

      const mockJob = {
        id: 'job-123',
        name: 'resposta-intent-test-correlation-id',
        data: jobData,
        attemptsMade: 1,
        opts: { attempts: 3 },
      } as Job;

      const result = await respostaRapidaWorkerTask(mockJob);

      expect(result.success).toBe(true);
      expect(result.correlationId).toBe('test-correlation-id');
      expect(result.processingTime).toBeGreaterThan(0);

      // Verify template mapping was queried
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
            body: 'Olá! Como posso ajudar você hoje?',
          },
        }),
        expect.objectContaining({
          token: 'test-api-key',
          phoneNumberId: '123456789',
          businessId: 'business123',
        }),
        '4',
        'test-correlation-id'
      );
    });

    test('should process intent job with interactive message template', async () => {
      // Setup interactive template mapping
      mockPrisma.mapeamentoIntencao.findFirst.mockResolvedValue({
        id: 'mapping-123',
        template: {
          id: 'template-123',
          name: 'Menu Template',
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

      const jobData = {
        type: 'processarResposta' as const,
        data: {
          inboxId: '4',
          contactPhone: '+5511999999999',
          interactionType: 'intent' as const,
          intentName: 'menu.intent',
          wamid: 'wamid.test123',
          credentials: {
            token: 'test-api-key',
            phoneNumberId: '123456789',
            businessId: 'business123',
          },
          correlationId: 'test-correlation-id',
        },
      };

      const mockJob = {
        id: 'job-123',
        name: 'resposta-intent-test-correlation-id',
        data: jobData,
        attemptsMade: 1,
        opts: { attempts: 3 },
      } as Job;

      const result = await respostaRapidaWorkerTask(mockJob);

      expect(result.success).toBe(true);

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
        'test-correlation-id'
      );
    });

    test('should process intent job with WhatsApp official template', async () => {
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

      const jobData = {
        type: 'processarResposta' as const,
        data: {
          inboxId: '4',
          contactPhone: '+5511999999999',
          interactionType: 'intent' as const,
          intentName: 'welcome.intent',
          wamid: 'wamid.test123',
          credentials: {
            token: 'test-api-key',
            phoneNumberId: '123456789',
            businessId: 'business123',
          },
          correlationId: 'test-correlation-id',
        },
      };

      const mockJob = {
        id: 'job-123',
        name: 'resposta-intent-test-correlation-id',
        data: jobData,
        attemptsMade: 1,
        opts: { attempts: 3 },
      } as Job;

      const result = await respostaRapidaWorkerTask(mockJob);

      expect(result.success).toBe(true);

      // Verify WhatsApp official template was sent with variable substitution
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
        'test-correlation-id'
      );
    });

    test('should handle intent with no mapping (fallback)', async () => {
      // No mapping found
      mockPrisma.mapeamentoIntencao.findFirst.mockResolvedValue(null);

      const jobData = {
        type: 'processarResposta' as const,
        data: {
          inboxId: '4',
          contactPhone: '+5511999999999',
          interactionType: 'intent' as const,
          intentName: 'unknown.intent',
          wamid: 'wamid.test123',
          credentials: {
            token: 'test-api-key',
            phoneNumberId: '123456789',
            businessId: 'business123',
          },
          correlationId: 'test-correlation-id',
        },
      };

      const mockJob = {
        id: 'job-123',
        name: 'resposta-intent-test-correlation-id',
        data: jobData,
        attemptsMade: 1,
        opts: { attempts: 3 },
      } as Job;

      const result = await respostaRapidaWorkerTask(mockJob);

      expect(result.success).toBe(true);

      // Verify fallback message was sent
      expect(mockWhatsAppAPI.sendMessage).toHaveBeenCalledWith(
        '+5511999999999',
        expect.objectContaining({
          type: 'text',
          text: {
            body: expect.stringContaining('Desculpe, não consegui processar sua solicitação'),
          },
        }),
        expect.any(Object),
        'fallback',
        'test-correlation-id'
      );
    });
  });

  describe('High Priority Queue - Button Processing', () => {
    test('should process button job with template action', async () => {
      // Setup button mapping
      mockPrisma.mapeamentoBotao.findFirst.mockResolvedValue({
        id: 'button-mapping-123',
        buttonId: 'btn_confirm',
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

      const jobData = {
        type: 'processarResposta' as const,
        data: {
          inboxId: '4',
          contactPhone: '+5511999999999',
          interactionType: 'button_reply' as const,
          buttonId: 'btn_confirm',
          wamid: 'wamid.test123',
          credentials: {
            token: 'test-api-key',
            phoneNumberId: '123456789',
            businessId: 'business123',
          },
          correlationId: 'test-correlation-id',
        },
      };

      const mockJob = {
        id: 'job-123',
        name: 'resposta-button-test-correlation-id',
        data: jobData,
        attemptsMade: 1,
        opts: { attempts: 3 },
      } as Job;

      const result = await respostaRapidaWorkerTask(mockJob);

      expect(result.success).toBe(true);

      // Verify button mapping was queried
      expect(mockPrisma.mapeamentoBotao.findFirst).toHaveBeenCalledWith({
        where: {
          buttonId: 'btn_confirm',
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
        'template-action',
        'test-correlation-id'
      );
    });

    test('should process button job with emoji reaction fallback', async () => {
      // No button mapping found, should fallback to emoji
      mockPrisma.mapeamentoBotao.findFirst.mockResolvedValue(null);

      const jobData = {
        type: 'processarResposta' as const,
        data: {
          inboxId: '4',
          contactPhone: '+5511999999999',
          interactionType: 'button_reply' as const,
          buttonId: 'btn_like',
          wamid: 'wamid.test123',
          credentials: {
            token: 'test-api-key',
            phoneNumberId: '123456789',
            businessId: 'business123',
          },
          correlationId: 'test-correlation-id',
        },
      };

      const mockJob = {
        id: 'job-123',
        name: 'resposta-button-test-correlation-id',
        data: jobData,
        attemptsMade: 1,
        opts: { attempts: 3 },
      } as Job;

      const result = await respostaRapidaWorkerTask(mockJob);

      expect(result.success).toBe(true);

      // Should attempt to send emoji reaction or text fallback
      expect(mockWhatsAppAPI.sendMessage).toHaveBeenCalled();
    });

    test('should process button job with ADD_TAG action', async () => {
      // Setup button mapping with ADD_TAG action
      mockPrisma.mapeamentoBotao.findFirst.mockResolvedValue({
        id: 'button-mapping-123',
        buttonId: 'btn_interested',
        actionType: 'ADD_TAG',
        actionPayload: {
          tags: ['interested', 'hot-lead'],
          leadSource: 'CHATWIT_OAB',
        },
      });

      // Setup existing lead
      mockPrisma.lead.findFirst.mockResolvedValue({
        id: 'lead-123',
        phone: '+5511999999999',
        source: 'CHATWIT_OAB',
        tags: ['existing-tag'],
      });

      const jobData = {
        type: 'processarResposta' as const,
        data: {
          inboxId: '4',
          contactPhone: '+5511999999999',
          interactionType: 'button_reply' as const,
          buttonId: 'btn_interested',
          wamid: 'wamid.test123',
          credentials: {
            token: 'test-api-key',
            phoneNumberId: '123456789',
            businessId: 'business123',
          },
          correlationId: 'test-correlation-id',
        },
      };

      const mockJob = {
        id: 'job-123',
        name: 'resposta-button-test-correlation-id',
        data: jobData,
        attemptsMade: 1,
        opts: { attempts: 3 },
      } as Job;

      const result = await respostaRapidaWorkerTask(mockJob);

      expect(result.success).toBe(true);

      // Verify lead was updated with new tags
      expect(mockPrisma.lead.update).toHaveBeenCalledWith({
        where: { id: 'lead-123' },
        data: {
          tags: expect.arrayContaining(['existing-tag', 'interested', 'hot-lead']),
        },
      });
    });

    test('should process button job with START_FLOW action', async () => {
      // Setup button mapping with START_FLOW action
      mockPrisma.mapeamentoBotao.findFirst.mockResolvedValue({
        id: 'button-mapping-123',
        buttonId: 'btn_start_flow',
        actionType: 'START_FLOW',
        actionPayload: {
          flowId: 'flow-123',
          flowCta: 'Começar',
          flowMode: 'published',
          flowData: { step: 'welcome' },
        },
      });

      const jobData = {
        type: 'processarResposta' as const,
        data: {
          inboxId: '4',
          contactPhone: '+5511999999999',
          interactionType: 'button_reply' as const,
          buttonId: 'btn_start_flow',
          wamid: 'wamid.test123',
          credentials: {
            token: 'test-api-key',
            phoneNumberId: '123456789',
            businessId: 'business123',
          },
          correlationId: 'test-correlation-id',
        },
      };

      const mockJob = {
        id: 'job-123',
        name: 'resposta-button-test-correlation-id',
        data: jobData,
        attemptsMade: 1,
        opts: { attempts: 3 },
      } as Job;

      const result = await respostaRapidaWorkerTask(mockJob);

      expect(result.success).toBe(true);

      // Verify flow message was sent
      expect(mockWhatsAppAPI.sendMessage).toHaveBeenCalledWith(
        '+5511999999999',
        expect.objectContaining({
          type: 'interactive',
          interactive: expect.objectContaining({
            type: 'flow',
            action: expect.objectContaining({
              parameters: expect.objectContaining({
                flow_id: 'flow-123',
                flow_cta: 'Começar',
                flow_token: 'test-correlation-id',
              }),
            }),
          }),
        }),
        expect.any(Object),
        'flow-action',
        'test-correlation-id'
      );
    });
  });

  describe('Low Priority Queue - Data Persistence', () => {
    test('should process credentials update job', async () => {
      // Cache miss scenario
      mockRedis.exists.mockResolvedValue(0); // Not recently updated

      const jobData = {
        type: 'atualizarCredenciais' as const,
        data: {
          inboxId: '4',
          whatsappApiKey: 'new-api-key',
          phoneNumberId: '987654321',
          businessId: 'new-business',
          contactSource: 'chatwit',
          leadData: {
            messageId: 12345,
            accountId: 1,
            accountName: 'Test Account',
            contactPhone: '+5511999999999',
            wamid: 'wamid.test123',
          },
          correlationId: 'test-correlation-id',
        },
      };

      const mockJob = {
        id: 'job-456',
        name: 'persistencia-atualizarCredenciais-test-correlation-id',
        data: jobData,
        attemptsMade: 1,
        opts: { attempts: 5 },
      } as Job;

      const result = await persistenciaWorkerTask(mockJob);

      expect(result.credentialsUpdated).toBe(true);
      expect(result.cacheUpdated).toBe(true);
      expect(result.leadUpdated).toBe(true);
      expect(result.processingTime).toBeGreaterThan(0);

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

      // Verify lead creation
      expect(mockPrisma.lead.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          phone: '+5511999999999',
          source: 'CHATWIT_OAB',
          sourceIdentifier: 'chatwit',
        }),
      });
    });

    test('should skip database update when credentials recently updated', async () => {
      // Cache hit scenario
      mockRedis.exists.mockResolvedValue(1); // Recently updated

      const jobData = {
        type: 'atualizarCredenciais' as const,
        data: {
          inboxId: '4',
          whatsappApiKey: 'api-key',
          phoneNumberId: '123456789',
          businessId: 'business123',
          contactSource: 'chatwit',
          leadData: {
            messageId: 12345,
            accountId: 1,
            accountName: 'Test Account',
            contactPhone: '+5511999999999',
            wamid: 'wamid.test123',
          },
          correlationId: 'test-correlation-id',
        },
      };

      const mockJob = {
        id: 'job-456',
        name: 'persistencia-atualizarCredenciais-test-correlation-id',
        data: jobData,
        attemptsMade: 1,
        opts: { attempts: 5 },
      } as Job;

      const result = await persistenciaWorkerTask(mockJob);

      expect(result.credentialsUpdated).toBe(false);
      expect(result.leadUpdated).toBe(true);

      // Verify database update was skipped
      expect(mockPrisma.chatwitInbox.updateMany).not.toHaveBeenCalled();

      // But lead should still be processed
      expect(mockPrisma.lead.create).toHaveBeenCalled();
    });

    test('should process lead update job', async () => {
      const jobData = {
        type: 'atualizarLead' as const,
        data: {
          inboxId: '4',
          whatsappApiKey: 'api-key',
          phoneNumberId: '123456789',
          businessId: 'business123',
          contactSource: 'instagram',
          leadData: {
            messageId: 12345,
            accountId: 1,
            accountName: 'Test Account',
            contactPhone: '+5511999999999',
            wamid: 'wamid.test123',
          },
          correlationId: 'test-correlation-id',
        },
      };

      const mockJob = {
        id: 'job-456',
        name: 'persistencia-atualizarLead-test-correlation-id',
        data: jobData,
        attemptsMade: 1,
        opts: { attempts: 5 },
      } as Job;

      const result = await persistenciaWorkerTask(mockJob);

      expect(result.credentialsUpdated).toBe(false);
      expect(result.leadUpdated).toBe(true);

      // Verify lead creation with Instagram source
      expect(mockPrisma.lead.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          phone: '+5511999999999',
          source: 'INSTAGRAM',
          sourceIdentifier: 'instagram',
        }),
      });
    });

    test('should process batch update job', async () => {
      const batchItems = [
        {
          inboxId: '4',
          credentials: {
            whatsappApiKey: 'key1',
            phoneNumberId: '111111111',
            businessId: 'biz1',
          },
          leadData: {
            contactPhone: '+5511111111111',
            contactSource: 'chatwit',
            messageId: 1,
            accountId: 1,
            accountName: 'Account 1',
            wamid: 'wamid1',
          },
        },
        {
          inboxId: '5',
          credentials: {
            whatsappApiKey: 'key2',
            phoneNumberId: '222222222',
            businessId: 'biz2',
          },
          leadData: {
            contactPhone: '+5511222222222',
            contactSource: 'instagram',
            messageId: 2,
            accountId: 2,
            accountName: 'Account 2',
            wamid: 'wamid2',
          },
        },
      ];

      const jobData = {
        type: 'batchUpdate' as const,
        data: {
          inboxId: '4', // Required field
          whatsappApiKey: 'key1',
          phoneNumberId: '111111111',
          businessId: 'biz1',
          contactSource: 'batch',
          leadData: {
            messageId: 0,
            accountId: 0,
            accountName: 'batch',
            contactPhone: 'batch',
            wamid: 'batch',
          },
          correlationId: 'batch-correlation-id',
          batchItems,
        },
      };

      const mockJob = {
        id: 'job-456',
        name: 'persistencia-batchUpdate-batch-correlation-id',
        data: jobData,
        attemptsMade: 1,
        opts: { attempts: 5 },
      } as Job;

      // Mock cache checks for both inboxes
      mockRedis.exists.mockResolvedValueOnce(0).mockResolvedValueOnce(0);

      const result = await persistenciaWorkerTask(mockJob);

      expect(result.credentialsUpdated).toBe(true);
      expect(result.leadUpdated).toBe(true);

      // Verify both inboxes were updated
      expect(mockPrisma.chatwitInbox.updateMany).toHaveBeenCalledTimes(2);
      expect(mockPrisma.lead.create).toHaveBeenCalledTimes(2);
    });
  });

  describe('Error Handling in Job Processing', () => {
    test('should handle high priority job errors gracefully', async () => {
      // Simulate database error
      mockPrisma.mapeamentoIntencao.findFirst.mockRejectedValue(new Error('Database error'));

      const jobData = {
        type: 'processarResposta' as const,
        data: {
          inboxId: '4',
          contactPhone: '+5511999999999',
          interactionType: 'intent' as const,
          intentName: 'test.intent',
          wamid: 'wamid.test123',
          credentials: {
            token: 'test-api-key',
            phoneNumberId: '123456789',
            businessId: 'business123',
          },
          correlationId: 'test-correlation-id',
        },
      };

      const mockJob = {
        id: 'job-123',
        name: 'resposta-intent-test-correlation-id',
        data: jobData,
        attemptsMade: 1,
        opts: { attempts: 3 },
      } as Job;

      const result = await respostaRapidaWorkerTask(mockJob);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Database error');
      expect(result.correlationId).toBe('test-correlation-id');
    });

    test('should handle low priority job errors gracefully', async () => {
      // Simulate database error
      mockPrisma.chatwitInbox.updateMany.mockRejectedValue(new Error('Database error'));

      const jobData = {
        type: 'atualizarCredenciais' as const,
        data: {
          inboxId: '4',
          whatsappApiKey: 'api-key',
          phoneNumberId: '123456789',
          businessId: 'business123',
          contactSource: 'chatwit',
          leadData: {
            messageId: 12345,
            accountId: 1,
            accountName: 'Test Account',
            contactPhone: '+5511999999999',
            wamid: 'wamid.test123',
          },
          correlationId: 'test-correlation-id',
        },
      };

      const mockJob = {
        id: 'job-456',
        name: 'persistencia-atualizarCredenciais-test-correlation-id',
        data: jobData,
        attemptsMade: 1,
        opts: { attempts: 5 },
      } as Job;

      const result = await persistenciaWorkerTask(mockJob);

      expect(result.credentialsUpdated).toBe(false);
      expect(result.error).toContain('Database error');
    });

    test('should handle WhatsApp API errors in high priority jobs', async () => {
      // Setup template mapping
      mockPrisma.mapeamentoIntencao.findFirst.mockResolvedValue({
        id: 'mapping-123',
        template: {
          id: 'template-123',
          name: 'Test Template',
          type: 'AUTOMATION_REPLY',
          simpleReplyText: 'Test message',
        },
      });

      // Simulate WhatsApp API error
      mockWhatsAppAPI.sendMessage.mockRejectedValue(new Error('WhatsApp API error'));

      const jobData = {
        type: 'processarResposta' as const,
        data: {
          inboxId: '4',
          contactPhone: '+5511999999999',
          interactionType: 'intent' as const,
          intentName: 'test.intent',
          wamid: 'wamid.test123',
          credentials: {
            token: 'test-api-key',
            phoneNumberId: '123456789',
            businessId: 'business123',
          },
          correlationId: 'test-correlation-id',
        },
      };

      const mockJob = {
        id: 'job-123',
        name: 'resposta-intent-test-correlation-id',
        data: jobData,
        attemptsMade: 1,
        opts: { attempts: 3 },
      } as Job;

      const result = await respostaRapidaWorkerTask(mockJob);

      expect(result.success).toBe(false);
      expect(result.error).toContain('WhatsApp API error');
    });

    test('should handle cache errors in low priority jobs', async () => {
      // Simulate cache error
      mockRedis.exists.mockRejectedValue(new Error('Redis error'));
      mockRedis.setex.mockRejectedValue(new Error('Redis error'));

      const jobData = {
        type: 'atualizarCredenciais' as const,
        data: {
          inboxId: '4',
          whatsappApiKey: 'api-key',
          phoneNumberId: '123456789',
          businessId: 'business123',
          contactSource: 'chatwit',
          leadData: {
            messageId: 12345,
            accountId: 1,
            accountName: 'Test Account',
            contactPhone: '+5511999999999',
            wamid: 'wamid.test123',
          },
          correlationId: 'test-correlation-id',
        },
      };

      const mockJob = {
        id: 'job-456',
        name: 'persistencia-atualizarCredenciais-test-correlation-id',
        data: jobData,
        attemptsMade: 1,
        opts: { attempts: 5 },
      } as Job;

      const result = await persistenciaWorkerTask(mockJob);

      // Should still process despite cache errors
      expect(result.credentialsUpdated).toBe(true);
      expect(result.leadUpdated).toBe(true);
      expect(result.error).toBeUndefined();
    });
  });

  describe('Job Processing Performance', () => {
    test('should process high priority jobs within SLA', async () => {
      // Setup simple template mapping
      mockPrisma.mapeamentoIntencao.findFirst.mockResolvedValue({
        id: 'mapping-123',
        template: {
          id: 'template-123',
          name: 'Simple Template',
          type: 'AUTOMATION_REPLY',
          simpleReplyText: 'Quick response',
        },
      });

      const jobData = {
        type: 'processarResposta' as const,
        data: {
          inboxId: '4',
          contactPhone: '+5511999999999',
          interactionType: 'intent' as const,
          intentName: 'quick.intent',
          wamid: 'wamid.test123',
          credentials: {
            token: 'test-api-key',
            phoneNumberId: '123456789',
            businessId: 'business123',
          },
          correlationId: 'test-correlation-id',
        },
      };

      const mockJob = {
        id: 'job-123',
        name: 'resposta-intent-test-correlation-id',
        data: jobData,
        attemptsMade: 1,
        opts: { attempts: 3 },
      } as Job;

      const startTime = Date.now();
      const result = await respostaRapidaWorkerTask(mockJob);
      const processingTime = Date.now() - startTime;

      expect(result.success).toBe(true);
      expect(processingTime).toBeLessThan(5000); // Should complete within 5 seconds
      expect(result.processingTime).toBeLessThan(5000);
    });

    test('should process low priority jobs efficiently', async () => {
      const jobData = {
        type: 'atualizarCredenciais' as const,
        data: {
          inboxId: '4',
          whatsappApiKey: 'api-key',
          phoneNumberId: '123456789',
          businessId: 'business123',
          contactSource: 'chatwit',
          leadData: {
            messageId: 12345,
            accountId: 1,
            accountName: 'Test Account',
            contactPhone: '+5511999999999',
            wamid: 'wamid.test123',
          },
          correlationId: 'test-correlation-id',
        },
      };

      const mockJob = {
        id: 'job-456',
        name: 'persistencia-atualizarCredenciais-test-correlation-id',
        data: jobData,
        attemptsMade: 1,
        opts: { attempts: 5 },
      } as Job;

      const startTime = Date.now();
      const result = await persistenciaWorkerTask(mockJob);
      const processingTime = Date.now() - startTime;

      expect(result.credentialsUpdated).toBe(true);
      expect(processingTime).toBeLessThan(10000); // Should complete within 10 seconds
      expect(result.processingTime).toBeLessThan(10000);
    });

    test('should handle concurrent job processing', async () => {
      // Setup template mapping
      mockPrisma.mapeamentoIntencao.findFirst.mockResolvedValue({
        id: 'mapping-123',
        template: {
          id: 'template-123',
          name: 'Concurrent Template',
          type: 'AUTOMATION_REPLY',
          simpleReplyText: 'Concurrent response',
        },
      });

      const createJobData = (id: string) => ({
        type: 'processarResposta' as const,
        data: {
          inboxId: '4',
          contactPhone: `+551199999999${id}`,
          interactionType: 'intent' as const,
          intentName: 'concurrent.intent',
          wamid: `wamid.test${id}`,
          credentials: {
            token: 'test-api-key',
            phoneNumberId: '123456789',
            businessId: 'business123',
          },
          correlationId: `test-correlation-id-${id}`,
        },
      });

      const createMockJob = (id: string) => ({
        id: `job-${id}`,
        name: `resposta-intent-test-correlation-id-${id}`,
        data: createJobData(id),
        attemptsMade: 1,
        opts: { attempts: 3 },
      } as Job);

      // Process multiple jobs concurrently
      const jobs = ['1', '2', '3', '4', '5'].map(createMockJob);
      const promises = jobs.map(job => respostaRapidaWorkerTask(job));

      const results = await Promise.all(promises);

      // All jobs should complete successfully
      results.forEach((result, index) => {
        expect(result.success).toBe(true);
        expect(result.correlationId).toBe(`test-correlation-id-${index + 1}`);
      });

      // All WhatsApp messages should be sent
      expect(mockWhatsAppAPI.sendMessage).toHaveBeenCalledTimes(5);
    });
  });
});