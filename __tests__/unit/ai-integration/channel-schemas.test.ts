/**
 * Tests for Channel-Specific Schemas
 */

import {
  WhatsAppInteractiveSchema,
  InstagramQuickReplySchema,
  InstagramButtonTemplateSchema,
  DynamicResponseSchema,
  ChannelSchemaValidator,
  getChannelSchema,
} from '../../../lib/ai-integration/schemas/channel-schemas';

describe('Channel Schemas', () => {
  describe('WhatsAppInteractiveSchema', () => {
    it('should validate valid WhatsApp interactive message', () => {
      const validMessage = {
        body: 'How can I help you?',
        buttons: [
          { type: 'reply', title: 'Track Order', id: 'track_order' },
          { type: 'reply', title: 'Support', id: 'support' },
        ],
      };

      const result = WhatsAppInteractiveSchema.safeParse(validMessage);
      expect(result.success).toBe(true);
    });

    it('should reject message with body too long', () => {
      const invalidMessage = {
        body: 'a'.repeat(1025), // Too long
        buttons: [{ type: 'reply', title: 'OK', id: 'ok' }],
      };

      const result = WhatsAppInteractiveSchema.safeParse(invalidMessage);
      expect(result.success).toBe(false);
    });

    it('should reject message with too many buttons', () => {
      const invalidMessage = {
        body: 'Choose an option',
        buttons: [
          { type: 'reply', title: 'Option 1', id: 'opt1' },
          { type: 'reply', title: 'Option 2', id: 'opt2' },
          { type: 'reply', title: 'Option 3', id: 'opt3' },
          { type: 'reply', title: 'Option 4', id: 'opt4' }, // Too many
        ],
      };

      const result = WhatsAppInteractiveSchema.safeParse(invalidMessage);
      expect(result.success).toBe(false);
    });

    it('should reject button with title too long', () => {
      const invalidMessage = {
        body: 'Choose an option',
        buttons: [
          { type: 'reply', title: 'a'.repeat(21), id: 'long_title' }, // Too long
        ],
      };

      const result = WhatsAppInteractiveSchema.safeParse(invalidMessage);
      expect(result.success).toBe(false);
    });
  });

  describe('InstagramQuickReplySchema', () => {
    it('should validate valid Instagram quick reply message', () => {
      const validMessage = {
        text: 'What would you like to do?',
        quick_replies: [
          { content_type: 'text', title: 'Help', payload: 'help' },
          { content_type: 'text', title: 'Contact', payload: 'contact' },
        ],
      };

      const result = InstagramQuickReplySchema.safeParse(validMessage);
      expect(result.success).toBe(true);
    });

    it('should reject message with text too long', () => {
      const invalidMessage = {
        text: 'a'.repeat(1001), // Too long
        quick_replies: [{ content_type: 'text', title: 'OK', payload: 'ok' }],
      };

      const result = InstagramQuickReplySchema.safeParse(invalidMessage);
      expect(result.success).toBe(false);
    });
  });

  describe('InstagramButtonTemplateSchema', () => {
    it('should validate valid Instagram button template with postback', () => {
      const validMessage = {
        text: 'Choose an action',
        buttons: [
          { type: 'postback', title: 'Get Help', payload: 'help' },
          { type: 'web_url', title: 'Visit Site', url: 'https://example.com' },
        ],
      };

      const result = InstagramButtonTemplateSchema.safeParse(validMessage);
      expect(result.success).toBe(true);
    });

    it('should reject web_url button without HTTPS', () => {
      const invalidMessage = {
        text: 'Visit our site',
        buttons: [
          { type: 'web_url', title: 'Visit', url: 'http://example.com' }, // Not HTTPS
        ],
      };

      const result = InstagramButtonTemplateSchema.safeParse(invalidMessage);
      expect(result.success).toBe(false);
    });
  });

  describe('ChannelSchemaValidator', () => {
    describe('validateWhatsApp', () => {
      it('should sanitize and validate WhatsApp message', () => {
        const data = {
          body: 'How can I help you today?',
          buttons: [
            { type: 'reply', title: 'Track My Order', id: 'track' },
            { type: 'reply', title: 'Get Support', id: 'support' },
          ],
        };

        const result = ChannelSchemaValidator.validateWhatsApp(data);
        expect(result.valid).toBe(true);
        expect(result.data).toBeDefined();
      });

      it('should truncate long body text', () => {
        const data = {
          body: 'a'.repeat(1100), // Too long
          buttons: [{ type: 'reply', title: 'OK', id: 'ok' }],
        };

        const result = ChannelSchemaValidator.validateWhatsApp(data);
        expect(result.valid).toBe(true);
        expect(result.data?.body.length).toBeLessThanOrEqual(1024);
      });

      it('should remove duplicate button titles', () => {
        const data = {
          body: 'Choose an option',
          buttons: [
            { type: 'reply', title: 'Help', id: 'help1' },
            { type: 'reply', title: 'HELP', id: 'help2' }, // Duplicate (case-insensitive)
            { type: 'reply', title: 'Support', id: 'support' },
          ],
        };

        const result = ChannelSchemaValidator.validateWhatsApp(data);
        expect(result.valid).toBe(true);
        expect(result.data?.buttons.length).toBe(2); // Duplicate removed
      });

      it('should limit buttons to maximum 3', () => {
        const data = {
          body: 'Choose an option',
          buttons: [
            { type: 'reply', title: 'Option 1', id: 'opt1' },
            { type: 'reply', title: 'Option 2', id: 'opt2' },
            { type: 'reply', title: 'Option 3', id: 'opt3' },
            { type: 'reply', title: 'Option 4', id: 'opt4' },
            { type: 'reply', title: 'Option 5', id: 'opt5' },
          ],
        };

        const result = ChannelSchemaValidator.validateWhatsApp(data);
        expect(result.valid).toBe(true);
        expect(result.data?.buttons.length).toBe(3); // Limited to 3
      });
    });

    describe('validateInstagramQuickReply', () => {
      it('should sanitize and validate Instagram quick reply', () => {
        const data = {
          text: 'What would you like to do?',
          quick_replies: [
            { content_type: 'text', title: 'Help', payload: 'help' },
            { content_type: 'text', title: 'Contact', payload: 'contact' },
          ],
        };

        const result = ChannelSchemaValidator.validateInstagramQuickReply(data);
        expect(result.valid).toBe(true);
        expect(result.data).toBeDefined();
      });

      it('should cap quick replies to 3 for UX consistency', () => {
        const data = {
          text: 'Choose an option',
          quick_replies: [
            { content_type: 'text', title: 'Option 1', payload: 'opt1' },
            { content_type: 'text', title: 'Option 2', payload: 'opt2' },
            { content_type: 'text', title: 'Option 3', payload: 'opt3' },
            { content_type: 'text', title: 'Option 4', payload: 'opt4' },
            { content_type: 'text', title: 'Option 5', payload: 'opt5' },
          ],
        };

        const result = ChannelSchemaValidator.validateInstagramQuickReply(data);
        expect(result.valid).toBe(true);
        expect(result.data?.quick_replies.length).toBe(3); // Capped at 3
      });
    });

    describe('validateInstagramButtonTemplate', () => {
      it('should sanitize and validate Instagram button template', () => {
        const data = {
          text: 'Choose an action',
          buttons: [
            { type: 'postback', title: 'Get Help', payload: 'help' },
            { type: 'web_url', title: 'Visit Site', url: 'https://example.com' },
          ],
        };

        const result = ChannelSchemaValidator.validateInstagramButtonTemplate(data);
        expect(result.valid).toBe(true);
        expect(result.data).toBeDefined();
      });

      it('should filter out non-HTTPS web_url buttons', () => {
        const data = {
          text: 'Visit our sites',
          buttons: [
            { type: 'web_url', title: 'Secure Site', url: 'https://secure.com' },
            { type: 'web_url', title: 'Insecure Site', url: 'http://insecure.com' },
          ],
        };

        const result = ChannelSchemaValidator.validateInstagramButtonTemplate(data);
        expect(result.valid).toBe(true);
        expect(result.data?.buttons.length).toBe(1); // Non-HTTPS filtered out
      });
    });
  });

  describe('getChannelSchema', () => {
    it('should return WhatsApp schema for whatsapp channel', () => {
      const schema = getChannelSchema('whatsapp');
      expect(schema).toBe(WhatsAppInteractiveSchema);
    });

    it('should return Instagram quick reply schema by default', () => {
      const schema = getChannelSchema('instagram');
      expect(schema).toBe(InstagramQuickReplySchema);
    });

    it('should return Instagram button template schema when specified', () => {
      const schema = getChannelSchema('instagram', 'button_template');
      expect(schema).toBe(InstagramButtonTemplateSchema);
    });

    it('should throw error for unsupported channel', () => {
      expect(() => getChannelSchema('unsupported' as any)).toThrow('Unsupported channel');
    });
  });

  describe('DynamicResponseSchema', () => {
    it('should validate generic dynamic response', () => {
      const response = {
        text: 'How can I help you?',
        buttons: [
          { title: 'Track Order', id: 'intent:track', type: 'intent' },
          { title: 'Visit Site', id: 'url:site', type: 'url', url: 'https://example.com' },
        ],
        footer: 'SocialWise',
      };

      const result = DynamicResponseSchema.safeParse(response);
      expect(result.success).toBe(true);
    });

    it('should allow response without buttons', () => {
      const response = {
        text: 'Thank you for your message. An agent will contact you soon.',
      };

      const result = DynamicResponseSchema.safeParse(response);
      expect(result.success).toBe(true);
    });
  });
});