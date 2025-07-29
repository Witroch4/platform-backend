/**
 * Unit tests for Instagram Message Converter
 */

import { MessageConverter, CONVERSION_RULES, type WhatsAppTemplate } from '../message-converter';

describe('MessageConverter', () => {
  let converter: MessageConverter;

  beforeEach(() => {
    converter = new MessageConverter();
  });

  describe('Generic Template Conversion (≤80 chars)', () => {
    it('should convert short message to Generic Template', () => {
      const whatsappTemplate: WhatsAppTemplate = {
        body: { text: 'Short message' }, // 13 chars
        header: { type: 'image', content: 'https://example.com/image.jpg' },
        footer: { text: 'Footer text' },
        buttons: [
          { id: '1', title: 'Visit', type: 'web_url', url: 'https://example.com' },
          { id: '2', title: 'Reply', type: 'postback', payload: 'reply_payload' },
        ],
      };

      const result = converter.convert(whatsappTemplate);

      expect(result.success).toBe(true);
      expect(result.instagramTemplate?.type).toBe('generic');
      
      const payload = result.instagramTemplate?.payload as any;
      expect(payload.template_type).toBe('generic');
      expect(payload.elements).toHaveLength(1);
      
      const element = payload.elements[0];
      expect(element.title).toBe('Short message');
      expect(element.subtitle).toBe('Footer text');
      expect(element.image_url).toBe('https://example.com/image.jpg');
      expect(element.buttons).toHaveLength(2);
      
      expect(element.buttons[0]).toEqual({
        type: 'web_url',
        title: 'Visit',
        url: 'https://example.com',
      });
      
      expect(element.buttons[1]).toEqual({
        type: 'postback',
        title: 'Reply',
        payload: 'reply_payload',
      });
    });

    it('should handle exactly 80 characters as Generic Template', () => {
      const text80chars = 'A'.repeat(80); // Exactly 80 chars
      const whatsappTemplate: WhatsAppTemplate = {
        body: { text: text80chars },
      };

      const result = converter.convert(whatsappTemplate);

      expect(result.success).toBe(true);
      expect(result.instagramTemplate?.type).toBe('generic');
    });

    it('should convert 85 char message to Button Template (not Generic)', () => {
      const longText = 'A'.repeat(85); // 85 chars, should be Button Template
      const whatsappTemplate: WhatsAppTemplate = {
        body: { text: longText },
      };

      const result = converter.convert(whatsappTemplate);

      expect(result.success).toBe(true);
      expect(result.instagramTemplate?.type).toBe('button');
      
      const payload = result.instagramTemplate?.payload as any;
      expect(payload.text).toBe(longText);
    });

    it('should truncate title if it exceeds 80 characters in Generic Template', () => {
      // Use custom rules to force Generic Template with long title
      const customRules = {
        maxBodyLengthForGeneric: 100, // Allow 100 chars for Generic
        maxBodyLengthForButton: 640,
        maxSubtitleLength: 80,
        maxTitleLength: 80,
        maxButtonsCount: 3,
      };
      const customConverter = new MessageConverter(customRules);
      
      const longText = 'A'.repeat(85); // 85 chars, will be Generic with custom rules
      const whatsappTemplate: WhatsAppTemplate = {
        body: { text: longText },
      };

      const result = customConverter.convert(whatsappTemplate);

      expect(result.success).toBe(true);
      expect(result.instagramTemplate?.type).toBe('generic');
      expect(result.warnings).toContain('Title truncated to 80 characters');
      
      const payload = result.instagramTemplate?.payload as any;
      const element = payload.elements[0];
      expect(element.title).toHaveLength(80);
      expect(element.title.endsWith('...')).toBe(true);
    });

    it('should truncate subtitle if footer exceeds 80 characters', () => {
      const longFooter = 'B'.repeat(85); // 85 chars
      const whatsappTemplate: WhatsAppTemplate = {
        body: { text: 'Short body' },
        footer: { text: longFooter },
      };

      const result = converter.convert(whatsappTemplate);

      expect(result.success).toBe(true);
      expect(result.warnings).toContain('Subtitle truncated to 80 characters');
      
      const payload = result.instagramTemplate?.payload as any;
      const element = payload.elements[0];
      expect(element.subtitle).toHaveLength(80);
      expect(element.subtitle.endsWith('...')).toBe(true);
    });

    it('should handle Generic Template without header', () => {
      const whatsappTemplate: WhatsAppTemplate = {
        body: { text: 'Message without header' },
        footer: { text: 'Footer' },
      };

      const result = converter.convert(whatsappTemplate);

      expect(result.success).toBe(true);
      
      const payload = result.instagramTemplate?.payload as any;
      const element = payload.elements[0];
      expect(element.image_url).toBeUndefined();
      expect(element.title).toBe('Message without header');
      expect(element.subtitle).toBe('Footer');
    });

    it('should handle Generic Template without footer', () => {
      const whatsappTemplate: WhatsAppTemplate = {
        body: { text: 'Message without footer' },
        header: { type: 'image', content: 'https://example.com/image.jpg' },
      };

      const result = converter.convert(whatsappTemplate);

      expect(result.success).toBe(true);
      
      const payload = result.instagramTemplate?.payload as any;
      const element = payload.elements[0];
      expect(element.subtitle).toBeUndefined();
      expect(element.title).toBe('Message without footer');
      expect(element.image_url).toBe('https://example.com/image.jpg');
    });
  });

  describe('Button Template Conversion (81-640 chars)', () => {
    it('should convert medium message to Button Template', () => {
      const text120chars = 'A'.repeat(120); // 120 chars
      const whatsappTemplate: WhatsAppTemplate = {
        body: { text: text120chars },
        header: { type: 'image', content: 'https://example.com/image.jpg' },
        footer: { text: 'Footer text' },
        buttons: [
          { id: '1', title: 'Visit', type: 'web_url', url: 'https://example.com' },
        ],
      };

      const result = converter.convert(whatsappTemplate);

      expect(result.success).toBe(true);
      expect(result.instagramTemplate?.type).toBe('button');
      expect(result.warnings).toContain('Header discarded in Button Template format');
      expect(result.warnings).toContain('Footer discarded in Button Template format');
      
      const payload = result.instagramTemplate?.payload as any;
      expect(payload.template_type).toBe('button');
      expect(payload.text).toBe(text120chars);
      expect(payload.buttons).toHaveLength(1);
      expect(payload.buttons[0]).toEqual({
        type: 'web_url',
        title: 'Visit',
        url: 'https://example.com',
      });
    });

    it('should handle exactly 81 characters as Button Template', () => {
      const text81chars = 'A'.repeat(81); // Exactly 81 chars
      const whatsappTemplate: WhatsAppTemplate = {
        body: { text: text81chars },
      };

      const result = converter.convert(whatsappTemplate);

      expect(result.success).toBe(true);
      expect(result.instagramTemplate?.type).toBe('button');
    });

    it('should handle exactly 640 characters as Button Template', () => {
      const text640chars = 'A'.repeat(640); // Exactly 640 chars
      const whatsappTemplate: WhatsAppTemplate = {
        body: { text: text640chars },
      };

      const result = converter.convert(whatsappTemplate);

      expect(result.success).toBe(true);
      expect(result.instagramTemplate?.type).toBe('button');
      
      const payload = result.instagramTemplate?.payload as any;
      expect(payload.text).toBe(text640chars);
    });
  });

  describe('Incompatible Messages (>640 chars)', () => {
    it('should reject messages longer than 640 characters', () => {
      const text641chars = 'A'.repeat(641); // 641 chars
      const whatsappTemplate: WhatsAppTemplate = {
        body: { text: text641chars },
      };

      const result = converter.convert(whatsappTemplate);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Message body exceeds Instagram limit of 640 characters');
      expect(result.error).toContain('641 chars');
    });

    it('should reject very long messages', () => {
      const text1000chars = 'A'.repeat(1000); // 1000 chars
      const whatsappTemplate: WhatsAppTemplate = {
        body: { text: text1000chars },
      };

      const result = converter.convert(whatsappTemplate);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Message body exceeds Instagram limit of 640 characters');
    });
  });

  describe('Button Conversion Logic', () => {
    it('should convert web_url buttons correctly', () => {
      const whatsappTemplate: WhatsAppTemplate = {
        body: { text: 'Test message' },
        buttons: [
          { id: '1', title: 'Visit Website', type: 'web_url', url: 'https://example.com' },
        ],
      };

      const result = converter.convert(whatsappTemplate);

      expect(result.success).toBe(true);
      
      const payload = result.instagramTemplate?.payload as any;
      const buttons = payload.elements[0].buttons;
      expect(buttons[0]).toEqual({
        type: 'web_url',
        title: 'Visit Website',
        url: 'https://example.com',
      });
    });

    it('should convert postback buttons correctly', () => {
      const whatsappTemplate: WhatsAppTemplate = {
        body: { text: 'Test message' },
        buttons: [
          { id: '1', title: 'Reply', type: 'postback', payload: 'custom_payload' },
        ],
      };

      const result = converter.convert(whatsappTemplate);

      expect(result.success).toBe(true);
      
      const payload = result.instagramTemplate?.payload as any;
      const buttons = payload.elements[0].buttons;
      expect(buttons[0]).toEqual({
        type: 'postback',
        title: 'Reply',
        payload: 'custom_payload',
      });
    });

    it('should use button id as payload if payload is missing', () => {
      const whatsappTemplate: WhatsAppTemplate = {
        body: { text: 'Test message' },
        buttons: [
          { id: 'button_id', title: 'Reply', type: 'postback' },
        ],
      };

      const result = converter.convert(whatsappTemplate);

      expect(result.success).toBe(true);
      
      const payload = result.instagramTemplate?.payload as any;
      const buttons = payload.elements[0].buttons;
      expect(buttons[0]).toEqual({
        type: 'postback',
        title: 'Reply',
        payload: 'button_id',
      });
    });

    it('should limit buttons to maximum of 3', () => {
      const whatsappTemplate: WhatsAppTemplate = {
        body: { text: 'Test message' },
        buttons: [
          { id: '1', title: 'Button 1', type: 'postback', payload: 'payload1' },
          { id: '2', title: 'Button 2', type: 'postback', payload: 'payload2' },
          { id: '3', title: 'Button 3', type: 'postback', payload: 'payload3' },
          { id: '4', title: 'Button 4', type: 'postback', payload: 'payload4' },
          { id: '5', title: 'Button 5', type: 'postback', payload: 'payload5' },
        ],
      };

      const result = converter.convert(whatsappTemplate);

      expect(result.success).toBe(true);
      expect(result.warnings).toContain('Only first 3 buttons will be used (5 provided)');
      
      const payload = result.instagramTemplate?.payload as any;
      const buttons = payload.elements[0].buttons;
      expect(buttons).toHaveLength(3);
      expect(buttons[0].title).toBe('Button 1');
      expect(buttons[1].title).toBe('Button 2');
      expect(buttons[2].title).toBe('Button 3');
    });

    it('should preserve button order', () => {
      const whatsappTemplate: WhatsAppTemplate = {
        body: { text: 'Test message' },
        buttons: [
          { id: '1', title: 'First', type: 'postback', payload: 'first' },
          { id: '2', title: 'Second', type: 'web_url', url: 'https://example.com' },
          { id: '3', title: 'Third', type: 'postback', payload: 'third' },
        ],
      };

      const result = converter.convert(whatsappTemplate);

      expect(result.success).toBe(true);
      
      const payload = result.instagramTemplate?.payload as any;
      const buttons = payload.elements[0].buttons;
      expect(buttons[0].title).toBe('First');
      expect(buttons[1].title).toBe('Second');
      expect(buttons[2].title).toBe('Third');
    });

    it('should skip unsupported button types', () => {
      const whatsappTemplate: WhatsAppTemplate = {
        body: { text: 'Test message' },
        buttons: [
          { id: '1', title: 'Valid', type: 'postback', payload: 'valid' },
          { id: '2', title: 'Invalid', type: 'unsupported_type' as any },
          { id: '3', title: 'Also Valid', type: 'web_url', url: 'https://example.com' },
        ],
      };

      const result = converter.convert(whatsappTemplate);

      expect(result.success).toBe(true);
      expect(result.warnings).toContain('Button "Invalid" could not be converted (unsupported type: unsupported_type)');
      
      const payload = result.instagramTemplate?.payload as any;
      const buttons = payload.elements[0].buttons;
      expect(buttons).toHaveLength(2);
      expect(buttons[0].title).toBe('Valid');
      expect(buttons[1].title).toBe('Also Valid');
    });

    it('should skip web_url buttons without URL', () => {
      const whatsappTemplate: WhatsAppTemplate = {
        body: { text: 'Test message' },
        buttons: [
          { id: '1', title: 'Valid', type: 'postback', payload: 'valid' },
          { id: '2', title: 'No URL', type: 'web_url' }, // Missing URL
        ],
      };

      const result = converter.convert(whatsappTemplate);

      expect(result.success).toBe(true);
      expect(result.warnings).toContain('Button "No URL" could not be converted (unsupported type: web_url)');
      
      const payload = result.instagramTemplate?.payload as any;
      const buttons = payload.elements[0].buttons;
      expect(buttons).toHaveLength(1);
      expect(buttons[0].title).toBe('Valid');
    });
  });

  describe('Input Validation', () => {
    it('should reject null template', () => {
      const result = converter.convert(null as any);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Template is required');
    });

    it('should reject template without body', () => {
      const result = converter.convert({} as any);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Template body text is required');
    });

    it('should reject template with empty body text', () => {
      const whatsappTemplate: WhatsAppTemplate = {
        body: { text: '' },
      };

      const result = converter.convert(whatsappTemplate);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Template body text cannot be empty');
    });

    it('should reject template with whitespace-only body text', () => {
      const whatsappTemplate: WhatsAppTemplate = {
        body: { text: '   \n\t   ' },
      };

      const result = converter.convert(whatsappTemplate);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Template body text cannot be empty');
    });

    it('should reject template with non-string body text', () => {
      const whatsappTemplate = {
        body: { text: 123 },
      } as any;

      const result = converter.convert(whatsappTemplate);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Template body text must be a string');
    });

    it('should reject header without type or content', () => {
      const whatsappTemplate: WhatsAppTemplate = {
        body: { text: 'Test message' },
        header: { type: '', content: 'content' },
      };

      const result = converter.convert(whatsappTemplate);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Header must have both type and content');
    });

    it('should reject buttons that are not an array', () => {
      const whatsappTemplate = {
        body: { text: 'Test message' },
        buttons: 'not an array',
      } as any;

      const result = converter.convert(whatsappTemplate);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Buttons must be an array');
    });

    it('should reject buttons without required fields', () => {
      const whatsappTemplate: WhatsAppTemplate = {
        body: { text: 'Test message' },
        buttons: [
          { id: '', title: 'Button', type: 'postback' }, // Missing id
        ],
      };

      const result = converter.convert(whatsappTemplate);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Each button must have id, title, and type');
    });


  });

  describe('Error Handling', () => {
    it('should handle conversion errors gracefully', () => {
      // Mock a scenario that would cause an error during conversion
      const converter = new MessageConverter();
      const originalConvertToGeneric = (converter as any).convertToGenericTemplate;
      
      (converter as any).convertToGenericTemplate = () => {
        throw new Error('Conversion error');
      };

      const whatsappTemplate: WhatsAppTemplate = {
        body: { text: 'Short message' },
      };

      const result = converter.convert(whatsappTemplate);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Conversion failed: Conversion error');

      // Restore original method
      (converter as any).convertToGenericTemplate = originalConvertToGeneric;
    });
  });

  describe('Custom Rules', () => {
    it('should use custom conversion rules', () => {
      const customRules = {
        maxBodyLengthForGeneric: 50,
        maxBodyLengthForButton: 300,
        maxSubtitleLength: 40,
        maxTitleLength: 40,
        maxButtonsCount: 2,
      };

      const customConverter = new MessageConverter(customRules);

      // Test with 60 chars - should be Button Template with custom rules
      const text60chars = 'A'.repeat(60);
      const whatsappTemplate: WhatsAppTemplate = {
        body: { text: text60chars },
      };

      const result = customConverter.convert(whatsappTemplate);

      expect(result.success).toBe(true);
      expect(result.instagramTemplate?.type).toBe('button');
    });
  });
});