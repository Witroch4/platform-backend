/**
 * Unit tests for webhook schema validation
 * Tests Zod schema validation for incoming webhook payloads
 */

import { 
  ChatwitWebhookPayloadSchema,
  validateWebhookPayload,
  WhatsAppWebhookSchema,
  InstagramWebhookSchema 
} from '@/lib/ai-integration/schemas/webhook';

describe('Webhook Schema Validation', () => {
  describe('ChatwitWebhookPayloadSchema', () => {
    const validPayload = {
      account_id: 123,
      channel: 'whatsapp',
      conversation: {
        id: 456,
        inbox_id: 789,
        status: 'open',
      },
      message: {
        id: 101112,
        message_type: 'incoming',
        content_type: 'text',
        content: 'Hello, I need help',
        created_at: 1704067200,
        source_id: 'wamid.ABC123',
        sender: {
          type: 'contact',
          id: 999,
          name: 'John Doe',
        },
      },
    };

    it('should validate correct webhook payload', () => {
      const result = ChatwitWebhookPayloadSchema.safeParse(validPayload);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.account_id).toBe(123);
        expect(result.data.channel).toBe('whatsapp');
        expect(result.data.message.content).toBe('Hello, I need help');
      }
    });

    it('should accept payload with content_attributes instead of content', () => {
      const payloadWithAttributes = {
        ...validPayload,
        message: {
          ...validPayload.message,
          content: null,
          content_attributes: {
            interactive: {
              type: 'button_reply',
              button_reply: {
                id: 'track_order',
                title: 'Track Order',
              },
            },
          },
        },
      };

      const result = ChatwitWebhookPayloadSchema.safeParse(payloadWithAttributes);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.message.content_attributes).toBeDefined();
      }
    });

    it('should reject payload without required fields', () => {
      const invalidPayload = {
        account_id: 123,
        // Missing channel
        conversation: {
          id: 456,
          // Missing inbox_id
          status: 'open',
        },
        message: {
          // Missing id
          message_type: 'incoming',
          content: 'Hello',
          created_at: 1704067200,
        },
      };

      const result = ChatwitWebhookPayloadSchema.safeParse(invalidPayload);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues).toHaveLength(3); // channel, inbox_id, message.id
      }
    });

    it('should reject payload with invalid channel', () => {
      const invalidPayload = {
        ...validPayload,
        channel: 'invalid_channel',
      };

      const result = ChatwitWebhookPayloadSchema.safeParse(invalidPayload);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('Invalid enum value');
      }
    });

    it('should reject payload with invalid message_type', () => {
      const invalidPayload = {
        ...validPayload,
        message: {
          ...validPayload.message,
          message_type: 'invalid_type',
        },
      };

      const result = ChatwitWebhookPayloadSchema.safeParse(invalidPayload);

      expect(result.success).toBe(false);
    });

    it('should reject payload without content or content_attributes', () => {
      const invalidPayload = {
        ...validPayload,
        message: {
          ...validPayload.message,
          content: null,
          content_attributes: undefined,
        },
      };

      const result = ChatwitWebhookPayloadSchema.safeParse(invalidPayload);

      expect(result.success).toBe(false);
    });

    it('should accept valid timestamp formats', () => {
      const payloadWithTimestamp = {
        ...validPayload,
        message: {
          ...validPayload.message,
          created_at: Math.floor(Date.now() / 1000), // Current timestamp
        },
      };

      const result = ChatwitWebhookPayloadSchema.safeParse(payloadWithTimestamp);

      expect(result.success).toBe(true);
    });

    it('should handle optional fields correctly', () => {
      const minimalPayload = {
        account_id: 123,
        channel: 'whatsapp',
        conversation: {
          id: 456,
          inbox_id: 789,
          status: 'open',
        },
        message: {
          id: 101112,
          message_type: 'incoming',
          content: 'Hello',
          created_at: 1704067200,
          // Optional fields omitted
        },
      };

      const result = ChatwitWebhookPayloadSchema.safeParse(minimalPayload);

      expect(result.success).toBe(true);
    });
  });

  describe('WhatsAppWebhookSchema', () => {
    const whatsappPayload = {
      account_id: 123,
      channel: 'whatsapp',
      conversation: {
        id: 456,
        inbox_id: 789,
        status: 'open',
      },
      message: {
        id: 101112,
        message_type: 'incoming',
        content_type: 'text',
        content: 'Hello from WhatsApp',
        created_at: 1704067200,
        source_id: 'wamid.ABC123DEF456',
      },
    };

    it('should validate WhatsApp-specific payload', () => {
      const result = WhatsAppWebhookSchema.safeParse(whatsappPayload);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.channel).toBe('whatsapp');
        expect(result.data.message.source_id).toMatch(/^wamid\./);
      }
    });

    it('should validate WhatsApp button reply payload', () => {
      const buttonReplyPayload = {
        ...whatsappPayload,
        message: {
          ...whatsappPayload.message,
          content: null,
          content_attributes: {
            interactive: {
              type: 'button_reply',
              button_reply: {
                id: 'track_order',
                title: 'Track Order',
              },
            },
          },
        },
      };

      const result = WhatsAppWebhookSchema.safeParse(buttonReplyPayload);

      expect(result.success).toBe(true);
    });
  });

  describe('InstagramWebhookSchema', () => {
    const instagramPayload = {
      account_id: 123,
      channel: 'instagram',
      conversation: {
        id: 456,
        inbox_id: 789,
        status: 'open',
      },
      message: {
        id: 101112,
        message_type: 'incoming',
        content_type: 'text',
        content: 'Hello from Instagram',
        created_at: 1704067200,
        source_id: 'mid.ABC123',
      },
    };

    it('should validate Instagram-specific payload', () => {
      const result = InstagramWebhookSchema.safeParse(instagramPayload);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.channel).toBe('instagram');
        expect(result.data.message.source_id).toMatch(/^mid\./);
      }
    });

    it('should validate Instagram quick reply payload', () => {
      const quickReplyPayload = {
        ...instagramPayload,
        message: {
          ...instagramPayload.message,
          content: null,
          content_attributes: {
            quick_reply: {
              payload: 'track_order',
            },
          },
        },
      };

      const result = InstagramWebhookSchema.safeParse(quickReplyPayload);

      expect(result.success).toBe(true);
    });

    it('should validate Instagram postback payload', () => {
      const postbackPayload = {
        ...instagramPayload,
        message: {
          ...instagramPayload.message,
          content: null,
          content_attributes: {
            postback: {
              payload: 'get_started',
              title: 'Get Started',
            },
          },
        },
      };

      const result = InstagramWebhookSchema.safeParse(postbackPayload);

      expect(result.success).toBe(true);
    });
  });

  describe('validateWebhookPayload', () => {
    it('should validate and return parsed payload for valid input', () => {
      const validPayload = {
        account_id: 123,
        channel: 'whatsapp',
        conversation: {
          id: 456,
          inbox_id: 789,
          status: 'open',
        },
        message: {
          id: 101112,
          message_type: 'incoming',
          content: 'Hello',
          created_at: 1704067200,
        },
      };

      const result = validateWebhookPayload(validPayload);

      expect(result.isValid).toBe(true);
      expect(result.data).toEqual(validPayload);
      expect(result.errors).toBeUndefined();
    });

    it('should return validation errors for invalid payload', () => {
      const invalidPayload = {
        account_id: 'invalid', // Should be number
        channel: 'invalid_channel',
        conversation: {
          id: 456,
          // Missing inbox_id
        },
        message: {
          // Missing required fields
          content: 'Hello',
        },
      };

      const result = validateWebhookPayload(invalidPayload);

      expect(result.isValid).toBe(false);
      expect(result.data).toBeUndefined();
      expect(result.errors).toBeDefined();
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should provide detailed error messages', () => {
      const invalidPayload = {
        account_id: 123,
        channel: 'whatsapp',
        conversation: {
          id: 456,
          inbox_id: 789,
          status: 'open',
        },
        message: {
          id: 101112,
          message_type: 'incoming',
          created_at: 'invalid_timestamp', // Should be number
        },
      };

      const result = validateWebhookPayload(invalidPayload);

      expect(result.isValid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors.some(error => 
        error.path.includes('created_at') && error.message.includes('number')
      )).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle null and undefined values correctly', () => {
      const payloadWithNulls = {
        account_id: 123,
        channel: 'whatsapp',
        conversation: {
          id: 456,
          inbox_id: 789,
          status: 'open',
        },
        message: {
          id: 101112,
          message_type: 'incoming',
          content_type: null, // Allowed to be null
          content: 'Hello',
          created_at: 1704067200,
          source_id: null, // Allowed to be null
          sender: null, // Allowed to be null
        },
      };

      const result = ChatwitWebhookPayloadSchema.safeParse(payloadWithNulls);

      expect(result.success).toBe(true);
    });

    it('should handle very large account and conversation IDs', () => {
      const payloadWithLargeIds = {
        account_id: 999999999999,
        channel: 'whatsapp',
        conversation: {
          id: 888888888888,
          inbox_id: 777777777777,
          status: 'open',
        },
        message: {
          id: 666666666666,
          message_type: 'incoming',
          content: 'Hello',
          created_at: 1704067200,
        },
      };

      const result = ChatwitWebhookPayloadSchema.safeParse(payloadWithLargeIds);

      expect(result.success).toBe(true);
    });

    it('should handle special characters in content', () => {
      const payloadWithSpecialChars = {
        account_id: 123,
        channel: 'whatsapp',
        conversation: {
          id: 456,
          inbox_id: 789,
          status: 'open',
        },
        message: {
          id: 101112,
          message_type: 'incoming',
          content: 'Hello! 🎉 Special chars: @#$%^&*()_+-=[]{}|;:,.<>?',
          created_at: 1704067200,
        },
      };

      const result = ChatwitWebhookPayloadSchema.safeParse(payloadWithSpecialChars);

      expect(result.success).toBe(true);
    });
  });
});