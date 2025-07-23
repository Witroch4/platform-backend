/**
 * Unit Tests for Enhanced Button Reaction Processing
 * Tests the enhanced webhook processing for automatic reactions
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 6.1, 6.2, 6.3
 */

import type { Job } from 'bullmq';
import { processMtfDiamanteWebhookTask } from '../mtf-diamante-webhook.task';
import type { WebhookTaskData } from '@/lib/queue/mtf-diamante-webhook.queue';

// Mock dependencies
jest.mock('@/lib/prisma', () => ({
  prisma: {
    buttonReactionMapping: {
      findUnique: jest.fn()
    },
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

jest.mock('@/lib/whatsapp-reactions', () => ({
  sendReactionMessage: jest.fn(),
  logReactionAttempt: jest.fn()
}));

jest.mock('@/lib/whatsapp-messages', () => ({
  sendTextMessage: jest.fn()
}));

jest.mock('@/lib/dialogflow-database-queries', () => ({
  findReactionByButtonId: jest.fn()
}));

// Import mocked modules
import { prisma } from '@/lib/prisma';
import { sendReactionMessage, logReactionAttempt } from '@/lib/whatsapp-reactions';
import { sendTextMessage } from '@/lib/whatsapp-messages';
import { findReactionByButtonId } from '@/lib/dialogflow-database-queries';

describe('Enhanced Button Reaction Processing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Button Click Detection', () => {
    it('should detect button click from Dialogflow payload format', async () => {
      const buttonClickTask: WebhookTaskData = {
        type: 'processButtonClick',
        payload: {
          originalDetectIntentRequest: {
            payload: {
              wamid: 'wamid.test123',
              message_id: 'msg123',
              conversation_id: 'conv123',
              inbox_id: 'inbox123',
              contact_phone: '5511999999999',
              whatsapp_api_key: 'test-api-key',
              interactive: {
                type: 'button_reply',
                button_reply: {
                  id: 'like_button',
                  title: 'Like'
                }
              },
              context: {
                id: 'wamid.original123'
              }
            }
          },
          queryResult: {
            intent: { displayName: 'button_click' }
          }
        },
        contactPhone: '5511999999999',
        whatsappApiKey: 'test-api-key'
      };

      const mockJob = {
        id: 'test-job-id',
        data: buttonClickTask
      } as Job<WebhookTaskData>;

      // Mock button reaction lookup
      (prisma.buttonReactionMapping.findUnique as jest.Mock).mockResolvedValue({
        id: 'reaction123',
        buttonId: 'like_button',
        emoji: '👍',
        textReaction: null,
        isActive: true
      });

      // Mock WhatsApp API response
      (sendReactionMessage as jest.Mock).mockResolvedValue({
        success: true,
        messageId: 'wamid.reaction123'
      });

      (logReactionAttempt as jest.Mock).mockResolvedValue(undefined);

      const result = await processMtfDiamanteWebhookTask(mockJob);

      expect(result).toEqual({
        success: true,
        type: 'processButtonClick'
      });

      expect(prisma.buttonReactionMapping.findUnique).toHaveBeenCalledWith({
        where: { buttonId: 'like_button' }
      });

      expect(sendReactionMessage).toHaveBeenCalledWith({
        recipientPhone: '5511999999999',
        messageId: 'wamid.original123',
        emoji: '👍',
        whatsappApiKey: 'test-api-key'
      });
    });

    it('should detect list reply from Dialogflow payload format', async () => {
      const listReplyTask: WebhookTaskData = {
        type: 'processButtonClick',
        payload: {
          originalDetectIntentRequest: {
            payload: {
              wamid: 'wamid.test456',
              message_id: 'msg456',
              conversation_id: 'conv456',
              inbox_id: 'inbox456',
              contact_phone: '5511888888888',
              whatsapp_api_key: 'test-api-key-2',
              interactive: {
                type: 'list_reply',
                list_reply: {
                  id: 'product_1',
                  title: 'Product 1'
                }
              },
              context: {
                id: 'wamid.original456'
              }
            }
          }
        },
        contactPhone: '5511888888888',
        whatsappApiKey: 'test-api-key-2'
      };

      const mockJob = {
        id: 'test-job-id-2',
        data: listReplyTask
      } as Job<WebhookTaskData>;

      // Mock button reaction lookup
      (prisma.buttonReactionMapping.findUnique as jest.Mock).mockResolvedValue({
        id: 'reaction456',
        buttonId: 'product_1',
        emoji: null,
        textReaction: 'Thank you for selecting Product 1!',
        isActive: true
      });

      // Mock WhatsApp API response
      (sendTextMessage as jest.Mock).mockResolvedValue({
        success: true,
        messageId: 'wamid.text456'
      });

      const result = await processMtfDiamanteWebhookTask(mockJob);

      expect(result).toEqual({
        success: true,
        type: 'processButtonClick'
      });

      expect(sendTextMessage).toHaveBeenCalledWith({
        recipientPhone: '5511888888888',
        whatsappApiKey: 'test-api-key-2',
        text: 'Thank you for selecting Product 1!',
        replyToMessageId: 'wamid.original456'
      });
    });

    it('should detect button click from direct WhatsApp webhook format', async () => {
      const whatsappWebhookTask: WebhookTaskData = {
        type: 'processButtonClick',
        payload: {
          entry: [{
            changes: [{
              value: {
                messages: [{
                  id: 'wamid.direct789',
                  from: '5511777777777',
                  type: 'interactive',
                  interactive: {
                    type: 'button_reply',
                    button_reply: {
                      id: 'share_button',
                      title: 'Share'
                    }
                  },
                  context: {
                    id: 'wamid.original789'
                  }
                }]
              }
            }]
          }],
          originalDetectIntentRequest: {
            payload: {
              wamid: 'wamid.direct789',
              message_id: 'msg789',
              conversation_id: 'conv789',
              inbox_id: 'inbox789',
              contact_phone: '5511777777777',
              whatsapp_api_key: 'test-api-key-3'
            }
          }
        },
        contactPhone: '5511777777777',
        whatsappApiKey: 'test-api-key-3'
      };

      const mockJob = {
        id: 'test-job-id-3',
        data: whatsappWebhookTask
      } as Job<WebhookTaskData>;

      // Mock button reaction lookup
      (prisma.buttonReactionMapping.findUnique as jest.Mock).mockResolvedValue({
        id: 'reaction789',
        buttonId: 'share_button',
        emoji: '🔗',
        textReaction: 'Link shared successfully!',
        isActive: true
      });

      // Mock WhatsApp API responses
      (sendReactionMessage as jest.Mock).mockResolvedValue({
        success: true,
        messageId: 'wamid.reaction789'
      });

      (sendTextMessage as jest.Mock).mockResolvedValue({
        success: true,
        messageId: 'wamid.text789'
      });

      (logReactionAttempt as jest.Mock).mockResolvedValue(undefined);

      const result = await processMtfDiamanteWebhookTask(mockJob);

      expect(result).toEqual({
        success: true,
        type: 'processButtonClick'
      });

      // Should send both emoji reaction and text message
      expect(sendReactionMessage).toHaveBeenCalledWith({
        recipientPhone: '5511777777777',
        messageId: 'wamid.original789',
        emoji: '🔗',
        whatsappApiKey: 'test-api-key-3'
      });

      expect(sendTextMessage).toHaveBeenCalledWith({
        recipientPhone: '5511777777777',
        whatsappApiKey: 'test-api-key-3',
        text: 'Link shared successfully!',
        replyToMessageId: 'wamid.original789'
      });
    });
  });

  describe('Reaction Type Detection', () => {
    it('should process emoji-only reactions', async () => {
      const buttonClickTask: WebhookTaskData = {
        type: 'processButtonClick',
        payload: {
          originalDetectIntentRequest: {
            payload: {
              wamid: 'wamid.emoji123',
              message_id: 'msg123',
              conversation_id: 'conv123',
              inbox_id: 'inbox123',
              contact_phone: '5511999999999',
              whatsapp_api_key: 'test-api-key',
              interactive: {
                type: 'button_reply',
                button_reply: {
                  id: 'emoji_button',
                  title: 'React'
                }
              },
              context: {
                id: 'wamid.original123'
              }
            }
          }
        },
        contactPhone: '5511999999999',
        whatsappApiKey: 'test-api-key'
      };

      const mockJob = {
        id: 'test-job-id',
        data: buttonClickTask
      } as Job<WebhookTaskData>;

      // Mock emoji-only reaction
      (prisma.buttonReactionMapping.findUnique as jest.Mock).mockResolvedValue({
        id: 'reaction123',
        buttonId: 'emoji_button',
        emoji: '🎉',
        textReaction: null,
        isActive: true
      });

      (sendReactionMessage as jest.Mock).mockResolvedValue({
        success: true,
        messageId: 'wamid.reaction123'
      });

      (logReactionAttempt as jest.Mock).mockResolvedValue(undefined);

      await processMtfDiamanteWebhookTask(mockJob);

      expect(sendReactionMessage).toHaveBeenCalledWith({
        recipientPhone: '5511999999999',
        messageId: 'wamid.original123',
        emoji: '🎉',
        whatsappApiKey: 'test-api-key'
      });

      expect(sendTextMessage).not.toHaveBeenCalled();
    });

    it('should process text-only reactions', async () => {
      const buttonClickTask: WebhookTaskData = {
        type: 'processButtonClick',
        payload: {
          originalDetectIntentRequest: {
            payload: {
              wamid: 'wamid.text123',
              message_id: 'msg123',
              conversation_id: 'conv123',
              inbox_id: 'inbox123',
              contact_phone: '5511999999999',
              whatsapp_api_key: 'test-api-key',
              interactive: {
                type: 'button_reply',
                button_reply: {
                  id: 'text_button',
                  title: 'Get Info'
                }
              },
              context: {
                id: 'wamid.original123'
              }
            }
          }
        },
        contactPhone: '5511999999999',
        whatsappApiKey: 'test-api-key'
      };

      const mockJob = {
        id: 'test-job-id',
        data: buttonClickTask
      } as Job<WebhookTaskData>;

      // Mock text-only reaction
      (prisma.buttonReactionMapping.findUnique as jest.Mock).mockResolvedValue({
        id: 'reaction123',
        buttonId: 'text_button',
        emoji: null,
        textReaction: 'Here is the information you requested.',
        isActive: true
      });

      (sendTextMessage as jest.Mock).mockResolvedValue({
        success: true,
        messageId: 'wamid.text123'
      });

      await processMtfDiamanteWebhookTask(mockJob);

      expect(sendTextMessage).toHaveBeenCalledWith({
        recipientPhone: '5511999999999',
        whatsappApiKey: 'test-api-key',
        text: 'Here is the information you requested.',
        replyToMessageId: 'wamid.original123'
      });

      expect(sendReactionMessage).not.toHaveBeenCalled();
    });

    it('should process combined emoji and text reactions', async () => {
      const buttonClickTask: WebhookTaskData = {
        type: 'processButtonClick',
        payload: {
          originalDetectIntentRequest: {
            payload: {
              wamid: 'wamid.combined123',
              message_id: 'msg123',
              conversation_id: 'conv123',
              inbox_id: 'inbox123',
              contact_phone: '5511999999999',
              whatsapp_api_key: 'test-api-key',
              interactive: {
                type: 'button_reply',
                button_reply: {
                  id: 'combined_button',
                  title: 'Like & Comment'
                }
              },
              context: {
                id: 'wamid.original123'
              }
            }
          }
        },
        contactPhone: '5511999999999',
        whatsappApiKey: 'test-api-key'
      };

      const mockJob = {
        id: 'test-job-id',
        data: buttonClickTask
      } as Job<WebhookTaskData>;

      // Mock combined reaction
      (prisma.buttonReactionMapping.findUnique as jest.Mock).mockResolvedValue({
        id: 'reaction123',
        buttonId: 'combined_button',
        emoji: '❤️',
        textReaction: 'Thanks for your feedback!',
        isActive: true
      });

      (sendReactionMessage as jest.Mock).mockResolvedValue({
        success: true,
        messageId: 'wamid.reaction123'
      });

      (sendTextMessage as jest.Mock).mockResolvedValue({
        success: true,
        messageId: 'wamid.text123'
      });

      (logReactionAttempt as jest.Mock).mockResolvedValue(undefined);

      await processMtfDiamanteWebhookTask(mockJob);

      expect(sendReactionMessage).toHaveBeenCalledWith({
        recipientPhone: '5511999999999',
        messageId: 'wamid.original123',
        emoji: '❤️',
        whatsappApiKey: 'test-api-key'
      });

      expect(sendTextMessage).toHaveBeenCalledWith({
        recipientPhone: '5511999999999',
        whatsappApiKey: 'test-api-key',
        text: 'Thanks for your feedback!',
        replyToMessageId: 'wamid.original123'
      });
    });
  });

  describe('Fallback to Config-based Mappings', () => {
    it('should fallback to config when database reaction not found', async () => {
      const buttonClickTask: WebhookTaskData = {
        type: 'processButtonClick',
        payload: {
          originalDetectIntentRequest: {
            payload: {
              wamid: 'wamid.config123',
              message_id: 'msg123',
              conversation_id: 'conv123',
              inbox_id: 'inbox123',
              contact_phone: '5511999999999',
              whatsapp_api_key: 'test-api-key',
              interactive: {
                type: 'button_reply',
                button_reply: {
                  id: 'config_button',
                  title: 'Config Button'
                }
              },
              context: {
                id: 'wamid.original123'
              }
            }
          }
        },
        contactPhone: '5511999999999',
        whatsappApiKey: 'test-api-key'
      };

      const mockJob = {
        id: 'test-job-id',
        data: buttonClickTask
      } as Job<WebhookTaskData>;

      // Mock database lookup returning null
      (prisma.buttonReactionMapping.findUnique as jest.Mock).mockResolvedValue(null);

      // Mock config-based fallback
      (findReactionByButtonId as jest.Mock).mockResolvedValue({
        id: 'config-reaction123',
        buttonId: 'config_button',
        emoji: '⚙️',
        textReaction: null,
        isActive: true
      });

      (sendReactionMessage as jest.Mock).mockResolvedValue({
        success: true,
        messageId: 'wamid.reaction123'
      });

      (logReactionAttempt as jest.Mock).mockResolvedValue(undefined);

      await processMtfDiamanteWebhookTask(mockJob);

      expect(prisma.buttonReactionMapping.findUnique).toHaveBeenCalledWith({
        where: { buttonId: 'config_button' }
      });

      expect(findReactionByButtonId).toHaveBeenCalledWith('config_button');

      expect(sendReactionMessage).toHaveBeenCalledWith({
        recipientPhone: '5511999999999',
        messageId: 'wamid.original123',
        emoji: '⚙️',
        whatsappApiKey: 'test-api-key'
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle WhatsApp API failures gracefully', async () => {
      const buttonClickTask: WebhookTaskData = {
        type: 'processButtonClick',
        payload: {
          originalDetectIntentRequest: {
            payload: {
              wamid: 'wamid.error123',
              message_id: 'msg123',
              conversation_id: 'conv123',
              inbox_id: 'inbox123',
              contact_phone: '5511999999999',
              whatsapp_api_key: 'test-api-key',
              interactive: {
                type: 'button_reply',
                button_reply: {
                  id: 'error_button',
                  title: 'Error Button'
                }
              },
              context: {
                id: 'wamid.original123'
              }
            }
          }
        },
        contactPhone: '5511999999999',
        whatsappApiKey: 'test-api-key'
      };

      const mockJob = {
        id: 'test-job-id',
        data: buttonClickTask
      } as Job<WebhookTaskData>;

      // Mock button reaction lookup
      (prisma.buttonReactionMapping.findUnique as jest.Mock).mockResolvedValue({
        id: 'reaction123',
        buttonId: 'error_button',
        emoji: '❌',
        textReaction: 'Error message',
        isActive: true
      });

      // Mock WhatsApp API failures
      (sendReactionMessage as jest.Mock).mockResolvedValue({
        success: false,
        error: 'Message not found'
      });

      (sendTextMessage as jest.Mock).mockResolvedValue({
        success: false,
        error: 'Rate limit exceeded'
      });

      (logReactionAttempt as jest.Mock).mockResolvedValue(undefined);

      // Should not throw error, but handle gracefully
      const result = await processMtfDiamanteWebhookTask(mockJob);

      expect(result).toEqual({
        success: true,
        type: 'processButtonClick'
      });

      expect(sendReactionMessage).toHaveBeenCalled();
      expect(sendTextMessage).toHaveBeenCalled();
    });

    it('should handle missing button reaction configuration', async () => {
      const buttonClickTask: WebhookTaskData = {
        type: 'processButtonClick',
        payload: {
          originalDetectIntentRequest: {
            payload: {
              wamid: 'wamid.missing123',
              message_id: 'msg123',
              conversation_id: 'conv123',
              inbox_id: 'inbox123',
              contact_phone: '5511999999999',
              whatsapp_api_key: 'test-api-key',
              interactive: {
                type: 'button_reply',
                button_reply: {
                  id: 'missing_button',
                  title: 'Missing Button'
                }
              },
              context: {
                id: 'wamid.original123'
              }
            }
          }
        },
        contactPhone: '5511999999999',
        whatsappApiKey: 'test-api-key'
      };

      const mockJob = {
        id: 'test-job-id',
        data: buttonClickTask
      } as Job<WebhookTaskData>;

      // Mock no reaction found
      (prisma.buttonReactionMapping.findUnique as jest.Mock).mockResolvedValue(null);
      (findReactionByButtonId as jest.Mock).mockResolvedValue(null);

      const result = await processMtfDiamanteWebhookTask(mockJob);

      expect(result).toEqual({
        success: true,
        type: 'processButtonClick'
      });

      expect(sendReactionMessage).not.toHaveBeenCalled();
      expect(sendTextMessage).not.toHaveBeenCalled();
    });

    it('should handle non-button-click payloads gracefully', async () => {
      const nonButtonTask: WebhookTaskData = {
        type: 'processButtonClick',
        payload: {
          originalDetectIntentRequest: {
            payload: {
              wamid: 'wamid.text123',
              message_id: 'msg123',
              conversation_id: 'conv123',
              inbox_id: 'inbox123',
              contact_phone: '5511999999999',
              whatsapp_api_key: 'test-api-key',
              message_content: 'Hello world',
              message_content_type: 'text'
            }
          },
          queryResult: {
            intent: { displayName: 'greeting' }
          }
        },
        contactPhone: '5511999999999',
        whatsappApiKey: 'test-api-key'
      };

      const mockJob = {
        id: 'test-job-id',
        data: nonButtonTask
      } as Job<WebhookTaskData>;

      const result = await processMtfDiamanteWebhookTask(mockJob);

      expect(result).toEqual({
        success: true,
        type: 'processButtonClick'
      });

      expect(prisma.buttonReactionMapping.findUnique).not.toHaveBeenCalled();
      expect(sendReactionMessage).not.toHaveBeenCalled();
      expect(sendTextMessage).not.toHaveBeenCalled();
    });
  });

  describe('Integration with Queue System', () => {
    it('should process button click task through queue system', async () => {
      const buttonClickTask: WebhookTaskData = {
        type: 'processButtonClick',
        payload: {
          originalDetectIntentRequest: {
            payload: {
              wamid: 'wamid.queue123',
              message_id: 'msg123',
              conversation_id: 'conv123',
              inbox_id: 'inbox123',
              contact_phone: '5511999999999',
              whatsapp_api_key: 'test-api-key',
              interactive: {
                type: 'button_reply',
                button_reply: {
                  id: 'queue_button',
                  title: 'Queue Test'
                }
              },
              context: {
                id: 'wamid.original123'
              }
            }
          }
        },
        contactPhone: '5511999999999',
        whatsappApiKey: 'test-api-key'
      };

      const mockJob = {
        id: 'queue-test-job',
        data: buttonClickTask,
        opts: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 }
        }
      } as Job<WebhookTaskData>;

      // Mock successful processing
      (prisma.buttonReactionMapping.findUnique as jest.Mock).mockResolvedValue({
        id: 'reaction123',
        buttonId: 'queue_button',
        emoji: '🔄',
        textReaction: null,
        isActive: true
      });

      (sendReactionMessage as jest.Mock).mockResolvedValue({
        success: true,
        messageId: 'wamid.reaction123'
      });

      (logReactionAttempt as jest.Mock).mockResolvedValue(undefined);

      const result = await processMtfDiamanteWebhookTask(mockJob);

      expect(result).toEqual({
        success: true,
        type: 'processButtonClick'
      });

      expect(mockJob.id).toBe('queue-test-job');
    });
  });
});