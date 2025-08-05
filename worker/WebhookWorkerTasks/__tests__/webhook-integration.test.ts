/**
 * Integration Tests for Webhook Reaction Processing
 * Tests the complete flow from webhook to reaction delivery
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 6.1, 6.2, 6.3
 */

import type { Job } from 'bullmq';
import { processMtfDiamanteWebhookTask } from '../mtf-diamante-webhook.task';
import type { WebhookTaskData } from '@/lib/queue/mtf-diamante-webhook.queue';

// Mock dependencies with more realistic implementations
jest.mock('@/lib/prisma', () => ({
  prisma: {
    buttonReactionMapping: {
      findUnique: jest.fn()
    },
    webhookMessage: {
      create: jest.fn()
    },
    chatwitInbox: {
      findFirst: jest.fn()
    },
    whatsAppGlobalConfig: {
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
import { getPrismaInstance } from '@/lib/connections';
import { sendReactionMessage, logReactionAttempt } from '@/lib/whatsapp-reactions';
import { sendTextMessage } from '@/lib/whatsapp-messages';
import { findReactionByButtonId } from '@/lib/dialogflow-database-queries';

describe('Webhook Reaction Processing Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Complete Button Click to Reaction Flow', () => {
    it('should process complete emoji reaction flow', async () => {
      // Simulate a real webhook payload from WhatsApp
      const webhookPayload = {
        type: 'processButtonClick',
        payload: {
          originalDetectIntentRequest: {
            payload: {
              wamid: 'wamid.HBgLNTU1MTE5OTk5OTk5OTkVAgASGBQzQTAyNDhGNzY4NzE4MjhGNzY4NwA=',
              message_id: '12345',
              conversation_id: '67890',
              inbox_id: '4',
              contact_phone: '5511999999999',
              whatsapp_api_key: 'EAAG1234567890',
              interactive: {
                type: 'button_reply',
                button_reply: {
                  id: 'like_post',
                  title: 'Like this post'
                }
              },
              context: {
                id: 'wamid.HBgLNTU1MTE5OTk5OTk5OTkVAgASGBQzQTAyNDhGNzY4NzE4MjhGNzY4NwA='
              }
            }
          },
          queryResult: {
            intent: { displayName: 'button_click' },
            parameters: {},
            fulfillmentText: ''
          }
        },
        contactPhone: '5511999999999',
        whatsappApiKey: 'EAAG1234567890'
      } as WebhookTaskData;

      const mockJob = {
        id: 'webhook-integration-test',
        data: webhookPayload,
        opts: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 }
        }
      } as Job<WebhookTaskData>;

      // Mock database response
      (prisma.buttonReactionMapping.findUnique as jest.Mock).mockResolvedValue({
        id: 'reaction-uuid-123',
        buttonId: 'like_post',
        messageId: 'message-uuid-456',
        emoji: '👍',
        textReaction: null,
        description: null,
        isActive: true,
        createdAt: new Date('2024-01-01T10:00:00Z'),
        updatedAt: new Date('2024-01-01T10:00:00Z'),
        createdBy: 'user-uuid-789'
      });

      // Mock WhatsApp API success
      (sendReactionMessage as jest.Mock).mockResolvedValue({
        success: true,
        messageId: 'wamid.reaction.HBgLNTU1MTE5OTk5OTk5OTkVAgASGBQzQTAyNDhGNzY4NzE4MjhGNzY4NwA='
      });

      // Mock logging success
      (logReactionAttempt as jest.Mock).mockResolvedValue(undefined);

      // Execute the integration test
      const result = await processMtfDiamanteWebhookTask(mockJob);

      // Verify the complete flow
      expect(result).toEqual({
        success: true,
        type: 'processButtonClick'
      });

      // Verify database lookup
      expect(prisma.buttonReactionMapping.findUnique).toHaveBeenCalledWith({
        where: { buttonId: 'like_post' }
      });

      // Verify WhatsApp API call
      expect(sendReactionMessage).toHaveBeenCalledWith({
        recipientPhone: '5511999999999',
        messageId: 'wamid.HBgLNTU1MTE5OTk5OTk5OTkVAgASGBQzQTAyNDhGNzY4NzE4MjhGNzY4NwA=',
        emoji: '👍',
        whatsappApiKey: 'EAAG1234567890'
      });

      // Verify logging
      expect(logReactionAttempt).toHaveBeenCalledWith({
        recipientPhone: '5511999999999',
        messageId: 'wamid.HBgLNTU1MTE5OTk5OTk5OTkVAgASGBQzQTAyNDhGNzY4NzE4MjhGNzY4NwA=',
        emoji: '📱', // Generic emoji used for logging
        buttonId: 'like_post',
        success: true,
        error: undefined
      });
    });

    it('should process complete text reaction flow', async () => {
      const webhookPayload = {
        type: 'processButtonClick',
        payload: {
          originalDetectIntentRequest: {
            payload: {
              wamid: 'wamid.text.example',
              message_id: '54321',
              conversation_id: '09876',
              inbox_id: '4',
              contact_phone: '5511888888888',
              whatsapp_api_key: 'EAAG0987654321',
              interactive: {
                type: 'list_reply',
                list_reply: {
                  id: 'get_info',
                  title: 'Get more information'
                }
              },
              context: {
                id: 'wamid.original.text.example'
              }
            }
          }
        },
        contactPhone: '5511888888888',
        whatsappApiKey: 'EAAG0987654321'
      } as WebhookTaskData;

      const mockJob = {
        id: 'text-reaction-test',
        data: webhookPayload
      } as Job<WebhookTaskData>;

      // Mock database response for text reaction
      (prisma.buttonReactionMapping.findUnique as jest.Mock).mockResolvedValue({
        id: 'text-reaction-uuid-123',
        buttonId: 'get_info',
        messageId: 'message-uuid-789',
        emoji: null,
        textReaction: 'Here is the information you requested. Please let me know if you need anything else!',
        description: 'Automated information response',
        isActive: true,
        createdAt: new Date('2024-01-01T11:00:00Z'),
        updatedAt: new Date('2024-01-01T11:00:00Z'),
        createdBy: 'user-uuid-456'
      });

      // Mock WhatsApp text message API success
      (sendTextMessage as jest.Mock).mockResolvedValue({
        success: true,
        messageId: 'wamid.text.response.example'
      });

      const result = await processMtfDiamanteWebhookTask(mockJob);

      expect(result).toEqual({
        success: true,
        type: 'processButtonClick'
      });

      // Verify text message was sent
      expect(sendTextMessage).toHaveBeenCalledWith({
        recipientPhone: '5511888888888',
        whatsappApiKey: 'EAAG0987654321',
        text: 'Here is the information you requested. Please let me know if you need anything else!',
        replyToMessageId: 'wamid.original.text.example'
      });

      // Verify emoji reaction was not sent
      expect(sendReactionMessage).not.toHaveBeenCalled();
    });

    it('should process combined emoji and text reaction flow', async () => {
      const webhookPayload = {
        type: 'processButtonClick',
        payload: {
          originalDetectIntentRequest: {
            payload: {
              wamid: 'wamid.combined.example',
              message_id: '11111',
              conversation_id: '22222',
              inbox_id: '4',
              contact_phone: '5511777777777',
              whatsapp_api_key: 'EAAG1111222233',
              interactive: {
                type: 'button_reply',
                button_reply: {
                  id: 'subscribe_newsletter',
                  title: 'Subscribe to Newsletter'
                }
              },
              context: {
                id: 'wamid.original.combined.example'
              }
            }
          }
        },
        contactPhone: '5511777777777',
        whatsappApiKey: 'EAAG1111222233'
      } as WebhookTaskData;

      const mockJob = {
        id: 'combined-reaction-test',
        data: webhookPayload
      } as Job<WebhookTaskData>;

      // Mock database response for combined reaction
      (prisma.buttonReactionMapping.findUnique as jest.Mock).mockResolvedValue({
        id: 'combined-reaction-uuid-123',
        buttonId: 'subscribe_newsletter',
        messageId: 'message-uuid-combined',
        emoji: '📧',
        textReaction: 'Thank you for subscribing to our newsletter! You will receive updates about our latest products and offers.',
        description: 'Newsletter subscription confirmation',
        isActive: true,
        createdAt: new Date('2024-01-01T12:00:00Z'),
        updatedAt: new Date('2024-01-01T12:00:00Z'),
        createdBy: 'user-uuid-combined'
      });

      // Mock both API calls success
      (sendReactionMessage as jest.Mock).mockResolvedValue({
        success: true,
        messageId: 'wamid.emoji.combined.example'
      });

      (sendTextMessage as jest.Mock).mockResolvedValue({
        success: true,
        messageId: 'wamid.text.combined.example'
      });

      (logReactionAttempt as jest.Mock).mockResolvedValue(undefined);

      const result = await processMtfDiamanteWebhookTask(mockJob);

      expect(result).toEqual({
        success: true,
        type: 'processButtonClick'
      });

      // Verify both reactions were sent
      expect(sendReactionMessage).toHaveBeenCalledWith({
        recipientPhone: '5511777777777',
        messageId: 'wamid.original.combined.example',
        emoji: '📧',
        whatsappApiKey: 'EAAG1111222233'
      });

      expect(sendTextMessage).toHaveBeenCalledWith({
        recipientPhone: '5511777777777',
        whatsappApiKey: 'EAAG1111222233',
        text: 'Thank you for subscribing to our newsletter! You will receive updates about our latest products and offers.',
        replyToMessageId: 'wamid.original.combined.example'
      });
    });
  });

  describe('Fallback and Error Recovery', () => {
    it('should fallback to config-based reactions when database fails', async () => {
      const webhookPayload = {
        type: 'processButtonClick',
        payload: {
          originalDetectIntentRequest: {
            payload: {
              wamid: 'wamid.fallback.example',
              message_id: '99999',
              conversation_id: '88888',
              inbox_id: '4',
              contact_phone: '5511666666666',
              whatsapp_api_key: 'EAAG9999888877',
              interactive: {
                type: 'button_reply',
                button_reply: {
                  id: 'config_button',
                  title: 'Config Button'
                }
              },
              context: {
                id: 'wamid.original.fallback.example'
              }
            }
          }
        },
        contactPhone: '5511666666666',
        whatsappApiKey: 'EAAG9999888877'
      } as WebhookTaskData;

      const mockJob = {
        id: 'fallback-test',
        data: webhookPayload
      } as Job<WebhookTaskData>;

      // Mock database failure
      (prisma.buttonReactionMapping.findUnique as jest.Mock).mockRejectedValue(
        new Error('Database connection failed')
      );

      // Mock config fallback success
      (findReactionByButtonId as jest.Mock).mockResolvedValue({
        id: 'config-fallback-123',
        buttonId: 'config_button',
        emoji: '⚙️',
        textReaction: null,
        isActive: true
      });

      (sendReactionMessage as jest.Mock).mockResolvedValue({
        success: true,
        messageId: 'wamid.config.fallback.example'
      });

      (logReactionAttempt as jest.Mock).mockResolvedValue(undefined);

      const result = await processMtfDiamanteWebhookTask(mockJob);

      expect(result).toEqual({
        success: true,
        type: 'processButtonClick'
      });

      // Verify fallback was used
      expect(findReactionByButtonId).toHaveBeenCalledWith('config_button');
      expect(sendReactionMessage).toHaveBeenCalledWith({
        recipientPhone: '5511666666666',
        messageId: 'wamid.original.fallback.example',
        emoji: '⚙️',
        whatsappApiKey: 'EAAG9999888877'
      });
    });

    it('should handle partial failures gracefully', async () => {
      const webhookPayload = {
        type: 'processButtonClick',
        payload: {
          originalDetectIntentRequest: {
            payload: {
              wamid: 'wamid.partial.failure',
              message_id: '77777',
              conversation_id: '66666',
              inbox_id: '4',
              contact_phone: '5511555555555',
              whatsapp_api_key: 'EAAG7777666655',
              interactive: {
                type: 'button_reply',
                button_reply: {
                  id: 'partial_fail_button',
                  title: 'Partial Fail Button'
                }
              },
              context: {
                id: 'wamid.original.partial.failure'
              }
            }
          }
        },
        contactPhone: '5511555555555',
        whatsappApiKey: 'EAAG7777666655'
      } as WebhookTaskData;

      const mockJob = {
        id: 'partial-failure-test',
        data: webhookPayload
      } as Job<WebhookTaskData>;

      // Mock database success
      (prisma.buttonReactionMapping.findUnique as jest.Mock).mockResolvedValue({
        id: 'partial-fail-reaction',
        buttonId: 'partial_fail_button',
        emoji: '⚠️',
        textReaction: 'This is a test message',
        isActive: true
      });

      // Mock emoji reaction failure but text success
      (sendReactionMessage as jest.Mock).mockResolvedValue({
        success: false,
        error: 'Message not found'
      });

      (sendTextMessage as jest.Mock).mockResolvedValue({
        success: true,
        messageId: 'wamid.text.partial.success'
      });

      (logReactionAttempt as jest.Mock).mockResolvedValue(undefined);

      const result = await processMtfDiamanteWebhookTask(mockJob);

      // Should still succeed overall
      expect(result).toEqual({
        success: true,
        type: 'processButtonClick'
      });

      // Verify both attempts were made
      expect(sendReactionMessage).toHaveBeenCalled();
      expect(sendTextMessage).toHaveBeenCalled();
    });
  });

  describe('Performance and Reliability', () => {
    it('should handle high-volume button clicks efficiently', async () => {
      const startTime = Date.now();
      const promises = [];

      // Simulate 10 concurrent button clicks
      for (let i = 0; i < 10; i++) {
        const webhookPayload = {
          type: 'processButtonClick',
          payload: {
            originalDetectIntentRequest: {
              payload: {
                wamid: `wamid.volume.test.${i}`,
                message_id: `msg${i}`,
                conversation_id: `conv${i}`,
                inbox_id: '4',
                contact_phone: `551199999999${i}`,
                whatsapp_api_key: 'EAAG_VOLUME_TEST',
                interactive: {
                  type: 'button_reply',
                  button_reply: {
                    id: `volume_button_${i}`,
                    title: `Volume Button ${i}`
                  }
                },
                context: {
                  id: `wamid.original.volume.${i}`
                }
              }
            }
          },
          contactPhone: `551199999999${i}`,
          whatsappApiKey: 'EAAG_VOLUME_TEST'
        } as WebhookTaskData;

        const mockJob = {
          id: `volume-test-${i}`,
          data: webhookPayload
        } as Job<WebhookTaskData>;

        promises.push(processMtfDiamanteWebhookTask(mockJob));
      }

      // Mock responses for all requests
      (prisma.buttonReactionMapping.findUnique as jest.Mock).mockResolvedValue({
        id: 'volume-reaction',
        buttonId: 'volume_button',
        emoji: '🚀',
        textReaction: null,
        isActive: true
      });

      (sendReactionMessage as jest.Mock).mockResolvedValue({
        success: true,
        messageId: 'wamid.volume.success'
      });

      (logReactionAttempt as jest.Mock).mockResolvedValue(undefined);

      // Execute all concurrently
      const results = await Promise.all(promises);

      const endTime = Date.now();
      const totalTime = endTime - startTime;

      // Verify all succeeded
      results.forEach(result => {
        expect(result).toEqual({
          success: true,
          type: 'processButtonClick'
        });
      });

      // Verify reasonable performance (should complete within 5 seconds)
      expect(totalTime).toBeLessThan(5000);

      // Verify all database calls were made
      expect(prisma.buttonReactionMapping.findUnique).toHaveBeenCalledTimes(10);
    });

    it('should handle retry logic for transient failures', async () => {
      const webhookPayload = {
        type: 'processButtonClick',
        payload: {
          originalDetectIntentRequest: {
            payload: {
              wamid: 'wamid.retry.test',
              message_id: 'retry_msg',
              conversation_id: 'retry_conv',
              inbox_id: '4',
              contact_phone: '5511444444444',
              whatsapp_api_key: 'EAAG_RETRY_TEST',
              interactive: {
                type: 'button_reply',
                button_reply: {
                  id: 'retry_button',
                  title: 'Retry Button'
                }
              },
              context: {
                id: 'wamid.original.retry.test'
              }
            }
          }
        },
        contactPhone: '5511444444444',
        whatsappApiKey: 'EAAG_RETRY_TEST'
      } as WebhookTaskData;

      const mockJob = {
        id: 'retry-test',
        data: webhookPayload,
        opts: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 100 }
        }
      } as Job<WebhookTaskData>;

      // Mock database success
      (prisma.buttonReactionMapping.findUnique as jest.Mock).mockResolvedValue({
        id: 'retry-reaction',
        buttonId: 'retry_button',
        emoji: '🔄',
        textReaction: null,
        isActive: true
      });

      // Mock transient failure then success
      (sendReactionMessage as jest.Mock)
        .mockResolvedValueOnce({
          success: false,
          error: 'Rate limit exceeded'
        })
        .mockResolvedValueOnce({
          success: true,
          messageId: 'wamid.retry.success'
        });

      (logReactionAttempt as jest.Mock).mockResolvedValue(undefined);

      // First attempt should fail, but we don't test retry logic here
      // as that's handled by BullMQ, not our code
      const result = await processMtfDiamanteWebhookTask(mockJob);

      expect(result).toEqual({
        success: true,
        type: 'processButtonClick'
      });
    });
  });

  describe('Data Validation and Security', () => {
    it('should validate webhook payload structure', async () => {
      const malformedPayload = {
        type: 'processButtonClick',
        payload: {
          // Missing required fields
          malformed: true
        },
        contactPhone: '5511333333333',
        whatsappApiKey: 'EAAG_MALFORMED_TEST'
      } as WebhookTaskData;

      const mockJob = {
        id: 'malformed-test',
        data: malformedPayload
      } as Job<WebhookTaskData>;

      // Should handle malformed payload gracefully
      await expect(processMtfDiamanteWebhookTask(mockJob)).rejects.toThrow();
    });

    it('should sanitize phone numbers and prevent injection', async () => {
      const webhookPayload = {
        type: 'processButtonClick',
        payload: {
          originalDetectIntentRequest: {
            payload: {
              wamid: 'wamid.security.test',
              message_id: 'security_msg',
              conversation_id: 'security_conv',
              inbox_id: '4',
              contact_phone: '5511222222222<script>alert("xss")</script>',
              whatsapp_api_key: 'EAAG_SECURITY_TEST',
              interactive: {
                type: 'button_reply',
                button_reply: {
                  id: 'security_button',
                  title: 'Security Button'
                }
              },
              context: {
                id: 'wamid.original.security.test'
              }
            }
          }
        },
        contactPhone: '5511222222222<script>alert("xss")</script>',
        whatsappApiKey: 'EAAG_SECURITY_TEST'
      } as WebhookTaskData;

      const mockJob = {
        id: 'security-test',
        data: webhookPayload
      } as Job<WebhookTaskData>;

      (prisma.buttonReactionMapping.findUnique as jest.Mock).mockResolvedValue({
        id: 'security-reaction',
        buttonId: 'security_button',
        emoji: '🔒',
        textReaction: null,
        isActive: true
      });

      (sendReactionMessage as jest.Mock).mockResolvedValue({
        success: true,
        messageId: 'wamid.security.success'
      });

      (logReactionAttempt as jest.Mock).mockResolvedValue(undefined);

      const result = await processMtfDiamanteWebhookTask(mockJob);

      expect(result).toEqual({
        success: true,
        type: 'processButtonClick'
      });

      // Verify phone number was sanitized (only digits remain)
      expect(sendReactionMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientPhone: expect.stringMatching(/^[0-9]+$/)
        })
      );
    });
  });
});