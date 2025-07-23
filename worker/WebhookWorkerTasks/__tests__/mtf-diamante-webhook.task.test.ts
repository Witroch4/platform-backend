/**
 * Unit Tests for MTF Diamante Webhook Worker Tasks
 * Tests worker handlers to ensure they call correct library functions
 * Requirements: 2.1, 2.2, 2.3
 */

import type { Job } from 'bullmq';
import { processMtfDiamanteWebhookTask } from '../mtf-diamante-webhook.task';
import type {
  SendMessageTask,
  SendReactionTask,
  WebhookTaskData
} from '@/lib/queue/mtf-diamante-webhook.queue';

// Mock dependencies
jest.mock('@/lib/prisma', () => ({
  prisma: {
    webhookMessage: {
      create: jest.fn()
    },
    caixaEntrada: {
      findFirst: jest.fn()
    },
    whatsAppConfig: {
      upsert: jest.fn()
    },
    dialogflowIntent: {
      create: jest.fn()
    }
  }
}));

jest.mock('@/lib/whatsapp-messages', () => ({
  sendTemplateMessage: jest.fn(),
  sendInteractiveMessage: jest.fn()
}));

jest.mock('@/lib/whatsapp-reactions', () => ({
  sendReactionMessage: jest.fn(),
  logReactionAttempt: jest.fn()
}));

// Import mocked modules
import { sendTemplateMessage, sendInteractiveMessage } from '@/lib/whatsapp-messages';
import { sendReactionMessage, logReactionAttempt } from '@/lib/whatsapp-reactions';

describe('MTF Diamante Webhook Worker Tasks', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('processSendMessage - Template Messages', () => {
    it('should process template message task successfully', async () => {
      const templateTask: SendMessageTask = {
        type: 'sendMessage',
        recipientPhone: '5511999999999',
        whatsappApiKey: 'test-api-key',
        correlationId: 'test-correlation-id',
        messageData: {
          type: 'template',
          templateId: 'welcome_template',
          templateName: 'welcome',
          variables: {
            name: 'João',
            phone: '11999999999'
          }
        },
        metadata: {
          intentName: 'welcome',
          caixaId: 'test-caixa-id'
        }
      };

      const mockJob = {
        id: 'test-job-id',
        data: templateTask
      } as Job<SendMessageTask>;

      // Mock successful WhatsApp API response
      (sendTemplateMessage as jest.Mock).mockResolvedValue({
        success: true,
        messageId: 'wamid.test123',
        details: { status: 'sent' }
      });

      const result = await processMtfDiamanteWebhookTask(mockJob);

      expect(result).toEqual({
        success: true,
        type: 'sendMessage'
      });

      expect(sendTemplateMessage).toHaveBeenCalledWith(
        {
          recipientPhone: '5511999999999',
          templateId: 'welcome_template',
          templateName: 'welcome',
          variables: {
            name: 'João',
            phone: '11999999999'
          },
          whatsappApiKey: 'test-api-key',
          language: 'pt_BR'
        },
        [] // Empty template components for this test
      );
    });

    it('should handle template message validation errors', async () => {
      const invalidTemplateTask: SendMessageTask = {
        type: 'sendMessage',
        recipientPhone: '5511999999999',
        whatsappApiKey: 'test-api-key',
        messageData: {
          type: 'template'
          // Missing required templateId and templateName
        }
      };

      const mockJob = {
        id: 'test-job-id',
        data: invalidTemplateTask
      } as Job<SendMessageTask>;

      await expect(processMtfDiamanteWebhookTask(mockJob)).rejects.toThrow(
        'Template ID and name are required for template messages'
      );

      expect(sendTemplateMessage).not.toHaveBeenCalled();
    });

    it('should handle WhatsApp API failures for template messages', async () => {
      const templateTask: SendMessageTask = {
        type: 'sendMessage',
        recipientPhone: '5511999999999',
        whatsappApiKey: 'test-api-key',
        messageData: {
          type: 'template',
          templateId: 'welcome_template',
          templateName: 'welcome'
        }
      };

      const mockJob = {
        id: 'test-job-id',
        data: templateTask
      } as Job<SendMessageTask>;

      // Mock WhatsApp API failure
      (sendTemplateMessage as jest.Mock).mockResolvedValue({
        success: false,
        error: 'Template not found',
        details: { error_code: 132000 }
      });

      await expect(processMtfDiamanteWebhookTask(mockJob)).rejects.toThrow(
        'Message sending failed: Template not found'
      );
    });
  });

  describe('processSendMessage - Interactive Messages', () => {
    it('should process interactive message task successfully', async () => {
      const interactiveTask: SendMessageTask = {
        type: 'sendMessage',
        recipientPhone: '5511999999999',
        whatsappApiKey: 'test-api-key',
        correlationId: 'test-correlation-id',
        messageData: {
          type: 'interactive',
          interactiveContent: {
            body: 'Escolha uma opção:',
            footer: 'Powered by ChatWit',
            buttons: [
              { id: 'option1', title: 'Opção 1' },
              { id: 'option2', title: 'Opção 2' }
            ]
          }
        },
        metadata: {
          intentName: 'menu',
          caixaId: 'test-caixa-id'
        }
      };

      const mockJob = {
        id: 'test-job-id',
        data: interactiveTask
      } as Job<SendMessageTask>;

      // Mock successful WhatsApp API response
      (sendInteractiveMessage as jest.Mock).mockResolvedValue({
        success: true,
        messageId: 'wamid.interactive123',
        details: { status: 'sent' }
      });

      const result = await processMtfDiamanteWebhookTask(mockJob);

      expect(result).toEqual({
        success: true,
        type: 'sendMessage'
      });

      expect(sendInteractiveMessage).toHaveBeenCalledWith({
        recipientPhone: '5511999999999',
        whatsappApiKey: 'test-api-key',
        header: undefined,
        body: 'Escolha uma opção:',
        footer: 'Powered by ChatWit',
        action: {
          type: 'buttons',
          data: {
            buttons: [
              { id: 'option1', title: 'Opção 1' },
              { id: 'option2', title: 'Opção 2' }
            ]
          }
        }
      });
    });

    it('should process interactive list message successfully', async () => {
      const listTask: SendMessageTask = {
        type: 'sendMessage',
        recipientPhone: '5511999999999',
        whatsappApiKey: 'test-api-key',
        messageData: {
          type: 'interactive',
          interactiveContent: {
            body: 'Selecione um produto:',
            buttonText: 'Ver Produtos',
            listSections: [
              {
                title: 'Produtos Disponíveis',
                rows: [
                  { id: 'product1', title: 'Produto 1', description: 'Descrição do produto 1' },
                  { id: 'product2', title: 'Produto 2', description: 'Descrição do produto 2' }
                ]
              }
            ]
          }
        }
      };

      const mockJob = {
        id: 'test-job-id',
        data: listTask
      } as Job<SendMessageTask>;

      (sendInteractiveMessage as jest.Mock).mockResolvedValue({
        success: true,
        messageId: 'wamid.list123'
      });

      const result = await processMtfDiamanteWebhookTask(mockJob);

      expect(result).toEqual({
        success: true,
        type: 'sendMessage'
      });

      expect(sendInteractiveMessage).toHaveBeenCalledWith({
        recipientPhone: '5511999999999',
        whatsappApiKey: 'test-api-key',
        header: undefined,
        body: 'Selecione um produto:',
        footer: undefined,
        action: {
          type: 'list',
          data: {
            buttonText: 'Ver Produtos',
            sections: [
              {
                title: 'Produtos Disponíveis',
                rows: [
                  { id: 'product1', title: 'Produto 1', description: 'Descrição do produto 1' },
                  { id: 'product2', title: 'Produto 2', description: 'Descrição do produto 2' }
                ]
              }
            ]
          }
        }
      });
    });

    it('should handle interactive message validation errors', async () => {
      const invalidInteractiveTask: SendMessageTask = {
        type: 'sendMessage',
        recipientPhone: '5511999999999',
        whatsappApiKey: 'test-api-key',
        messageData: {
          type: 'interactive',
          interactiveContent: {
            // Missing required body
            buttons: [{ id: 'test', title: 'Test' }]
          }
        }
      };

      const mockJob = {
        id: 'test-job-id',
        data: invalidInteractiveTask
      } as Job<SendMessageTask>;

      await expect(processMtfDiamanteWebhookTask(mockJob)).rejects.toThrow(
        'Body text is required for interactive messages'
      );

      expect(sendInteractiveMessage).not.toHaveBeenCalled();
    });
  });

  describe('processSendReaction', () => {
    it('should process reaction task successfully', async () => {
      const reactionTask: SendReactionTask = {
        type: 'sendReaction',
        recipientPhone: '5511999999999',
        messageId: 'wamid.original123',
        emoji: '👍',
        whatsappApiKey: 'test-api-key',
        correlationId: 'test-correlation-id',
        metadata: {
          buttonId: 'like_button'
        }
      };

      const mockJob = {
        id: 'test-job-id',
        data: reactionTask
      } as Job<SendReactionTask>;

      // Mock successful WhatsApp API response
      (sendReactionMessage as jest.Mock).mockResolvedValue({
        success: true,
        messageId: 'wamid.reaction123'
      });

      (logReactionAttempt as jest.Mock).mockResolvedValue(undefined);

      const result = await processMtfDiamanteWebhookTask(mockJob);

      expect(result).toEqual({
        success: true,
        type: 'sendReaction'
      });

      expect(sendReactionMessage).toHaveBeenCalledWith({
        recipientPhone: '5511999999999',
        messageId: 'wamid.original123',
        emoji: '👍',
        whatsappApiKey: 'test-api-key'
      });

      expect(logReactionAttempt).toHaveBeenCalledWith({
        recipientPhone: '5511999999999',
        messageId: 'wamid.original123',
        emoji: '👍',
        buttonId: 'like_button',
        success: true,
        error: undefined
      });
    });

    it('should handle reaction validation errors', async () => {
      const invalidReactionTask: SendReactionTask = {
        type: 'sendReaction',
        recipientPhone: '5511999999999',
        messageId: 'wamid.original123',
        emoji: '', // Invalid empty emoji
        whatsappApiKey: 'test-api-key'
      };

      const mockJob = {
        id: 'test-job-id',
        data: invalidReactionTask
      } as Job<SendReactionTask>;

      await expect(processMtfDiamanteWebhookTask(mockJob)).rejects.toThrow(
        'Invalid emoji format: emoji must be 1-10 characters'
      );

      expect(sendReactionMessage).not.toHaveBeenCalled();
    });

    it('should handle WhatsApp API failures for reactions', async () => {
      const reactionTask: SendReactionTask = {
        type: 'sendReaction',
        recipientPhone: '5511999999999',
        messageId: 'wamid.original123',
        emoji: '👍',
        whatsappApiKey: 'test-api-key'
      };

      const mockJob = {
        id: 'test-job-id',
        data: reactionTask
      } as Job<SendReactionTask>;

      // Mock WhatsApp API failure
      (sendReactionMessage as jest.Mock).mockResolvedValue({
        success: false,
        error: 'Message not found'
      });

      (logReactionAttempt as jest.Mock).mockResolvedValue(undefined);

      await expect(processMtfDiamanteWebhookTask(mockJob)).rejects.toThrow(
        'Reaction sending failed: Message not found'
      );

      expect(logReactionAttempt).toHaveBeenCalledWith({
        recipientPhone: '5511999999999',
        messageId: 'wamid.original123',
        emoji: '👍',
        buttonId: 'unknown',
        success: false,
        error: 'Message not found'
      });
    });

    it('should continue processing even if logging fails', async () => {
      const reactionTask: SendReactionTask = {
        type: 'sendReaction',
        recipientPhone: '5511999999999',
        messageId: 'wamid.original123',
        emoji: '👍',
        whatsappApiKey: 'test-api-key'
      };

      const mockJob = {
        id: 'test-job-id',
        data: reactionTask
      } as Job<SendReactionTask>;

      (sendReactionMessage as jest.Mock).mockResolvedValue({
        success: true,
        messageId: 'wamid.reaction123'
      });

      // Mock logging failure
      (logReactionAttempt as jest.Mock).mockRejectedValue(
        new Error('Logging service unavailable')
      );

      const result = await processMtfDiamanteWebhookTask(mockJob);

      expect(result).toEqual({
        success: true,
        type: 'sendReaction'
      });

      expect(sendReactionMessage).toHaveBeenCalled();
    });
  });

  describe('Task Input Validation', () => {
    it('should validate required fields for sendMessage tasks', async () => {
      const incompleteTask: Partial<SendMessageTask> = {
        type: 'sendMessage',
        recipientPhone: '5511999999999'
        // Missing whatsappApiKey and messageData
      };

      const mockJob = {
        id: 'test-job-id',
        data: incompleteTask
      } as Job<SendMessageTask>;

      await expect(processMtfDiamanteWebhookTask(mockJob)).rejects.toThrow(
        'Missing required task data: recipientPhone, whatsappApiKey, or messageData'
      );
    });

    it('should validate required fields for sendReaction tasks', async () => {
      const incompleteTask: Partial<SendReactionTask> = {
        type: 'sendReaction',
        recipientPhone: '5511999999999'
        // Missing messageId, emoji, and whatsappApiKey
      };

      const mockJob = {
        id: 'test-job-id',
        data: incompleteTask
      } as Job<SendReactionTask>;

      await expect(processMtfDiamanteWebhookTask(mockJob)).rejects.toThrow(
        'Missing required task data: recipientPhone, messageId, emoji, or whatsappApiKey'
      );
    });
  });

  describe('Legacy Task Processing', () => {
    it('should process legacy store_message task', async () => {
      const legacyTask: WebhookTaskData = {
        type: 'store_message',
        payload: {
          originalDetectIntentRequest: {
            payload: {
              wamid: 'wamid.test123',
              message_id: 'msg123',
              conversation_id: 'conv123',
              inbox_id: 'inbox123',
              contact_phone: '5511999999999',
              whatsapp_api_key: 'test-api-key',
              message_content: 'Hello',
              message_content_type: 'text'
            }
          },
          queryResult: {
            intent: { displayName: 'greeting' }
          }
        },
        messageId: 'msg123',
        conversationId: 'conv123',
        contactPhone: '5511999999999',
        whatsappApiKey: 'test-api-key',
        inboxId: 'inbox123'
      };

      const mockJob = {
        id: 'test-job-id',
        data: legacyTask
      } as Job<WebhookTaskData>;

      const result = await processMtfDiamanteWebhookTask(mockJob);

      expect(result).toEqual({
        success: true,
        type: 'store_message'
      });
    });
  });

  describe('Error Handling and Retry Logic', () => {
    it('should throw errors to trigger BullMQ retry mechanism', async () => {
      const templateTask: SendMessageTask = {
        type: 'sendMessage',
        recipientPhone: '5511999999999',
        whatsappApiKey: 'test-api-key',
        messageData: {
          type: 'template',
          templateId: 'test',
          templateName: 'test'
        }
      };

      const mockJob = {
        id: 'test-job-id',
        data: templateTask
      } as Job<SendMessageTask>;

      // Mock network error
      (sendTemplateMessage as jest.Mock).mockRejectedValue(
        new Error('Network timeout')
      );

      await expect(processMtfDiamanteWebhookTask(mockJob)).rejects.toThrow(
        'Network timeout'
      );
    });

    it('should handle unknown task types gracefully', async () => {
      const unknownTask = {
        type: 'unknown_type'
      } as any;

      const mockJob = {
        id: 'test-job-id',
        data: unknownTask
      } as Job<any>;

      await expect(processMtfDiamanteWebhookTask(mockJob)).rejects.toThrow(
        'Tipo de task desconhecido: unknown_type'
      );
    });
  });
});