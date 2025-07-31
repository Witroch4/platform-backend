/**
 * Unit tests for Instagram Payload Builder
 * Tests the creation of Generic and Button templates for Instagram
 */

import {
  createInstagramGenericTemplate,
  createInstagramButtonTemplate,
  createInstagramFallbackMessage,
  convertWhatsAppButtonsToInstagram,
  convertEnhancedButtonsToInstagram,
  determineInstagramTemplateType,
  validateInstagramTemplate,
  InstagramButton,
} from '@/lib/instagram/payload-builder';

describe('Instagram Payload Builder', () => {
  describe('createInstagramGenericTemplate', () => {
    it('should create a valid Generic Template with title only', () => {
      const result = createInstagramGenericTemplate('Hello World');
      
      expect(result).toHaveLength(1);
      expect(result[0]).toHaveProperty('custom_payload');
      expect(result[0].custom_payload).toHaveProperty('instagram');
      
      const template = result[0].custom_payload.instagram;
      expect(template.template_type).toBe('generic');
      expect(template.elements).toHaveLength(1);
      expect(template.elements[0].title).toBe('Hello World');
      expect(template.elements[0].buttons).toEqual([]);
    });

    it('should create a Generic Template with title, subtitle, and image', () => {
      const buttons: InstagramButton[] = [
        { type: 'postback', title: 'Click Me', payload: 'button_1' }
      ];
      
      const result = createInstagramGenericTemplate(
        'Hello World',
        'This is a subtitle',
        'https://example.com/image.jpg',
        buttons
      );
      
      const template = result[0].custom_payload.instagram;
      expect(template.elements[0].title).toBe('Hello World');
      expect(template.elements[0].subtitle).toBe('This is a subtitle');
      expect(template.elements[0].image_url).toBe('https://example.com/image.jpg');
      expect(template.elements[0].buttons).toHaveLength(1);
      expect(template.elements[0].buttons[0].title).toBe('Click Me');
    });

    it('should truncate title to 80 characters', () => {
      const longTitle = 'A'.repeat(100);
      const result = createInstagramGenericTemplate(longTitle);
      
      const template = result[0].custom_payload.instagram;
      expect(template.elements[0].title).toHaveLength(80);
      expect(template.elements[0].title).toBe('A'.repeat(80));
    });

    it('should truncate subtitle to 80 characters', () => {
      const longSubtitle = 'B'.repeat(100);
      const result = createInstagramGenericTemplate('Title', longSubtitle);
      
      const template = result[0].custom_payload.instagram;
      expect(template.elements[0].subtitle).toHaveLength(80);
      expect(template.elements[0].subtitle).toBe('B'.repeat(80));
    });

    it('should limit buttons to 3', () => {
      const buttons: InstagramButton[] = [
        { type: 'postback', title: 'Button 1', payload: 'btn_1' },
        { type: 'postback', title: 'Button 2', payload: 'btn_2' },
        { type: 'postback', title: 'Button 3', payload: 'btn_3' },
        { type: 'postback', title: 'Button 4', payload: 'btn_4' },
        { type: 'postback', title: 'Button 5', payload: 'btn_5' },
      ];
      
      const result = createInstagramGenericTemplate('Title', undefined, undefined, buttons);
      
      const template = result[0].custom_payload.instagram;
      expect(template.elements[0].buttons).toHaveLength(3);
      expect(template.elements[0].buttons[0].title).toBe('Button 1');
      expect(template.elements[0].buttons[2].title).toBe('Button 3');
    });
  });

  describe('createInstagramButtonTemplate', () => {
    it('should create a valid Button Template with text only', () => {
      const result = createInstagramButtonTemplate('This is a longer message for button template');
      
      expect(result).toHaveLength(1);
      expect(result[0]).toHaveProperty('custom_payload');
      expect(result[0].custom_payload).toHaveProperty('instagram');
      
      const template = result[0].custom_payload.instagram;
      expect(template.template_type).toBe('button');
      expect(template.text).toBe('This is a longer message for button template');
      expect(template.buttons).toEqual([]);
    });

    it('should create a Button Template with text and buttons', () => {
      const buttons: InstagramButton[] = [
        { type: 'web_url', title: 'Visit Site', url: 'https://example.com' },
        { type: 'postback', title: 'Click Me', payload: 'button_click' }
      ];
      
      const result = createInstagramButtonTemplate('Choose an option:', buttons);
      
      const template = result[0].custom_payload.instagram;
      expect(template.text).toBe('Choose an option:');
      expect(template.buttons).toHaveLength(2);
      expect(template.buttons[0].type).toBe('web_url');
      expect(template.buttons[0].url).toBe('https://example.com');
      expect(template.buttons[1].type).toBe('postback');
      expect(template.buttons[1].payload).toBe('button_click');
    });

    it('should truncate text to 640 characters', () => {
      const longText = 'A'.repeat(700);
      const result = createInstagramButtonTemplate(longText);
      
      const template = result[0].custom_payload.instagram;
      expect(template.text).toHaveLength(640);
      expect(template.text).toBe('A'.repeat(640));
    });

    it('should limit buttons to 3', () => {
      const buttons: InstagramButton[] = [
        { type: 'postback', title: 'Button 1', payload: 'btn_1' },
        { type: 'postback', title: 'Button 2', payload: 'btn_2' },
        { type: 'postback', title: 'Button 3', payload: 'btn_3' },
        { type: 'postback', title: 'Button 4', payload: 'btn_4' },
      ];
      
      const result = createInstagramButtonTemplate('Choose:', buttons);
      
      const template = result[0].custom_payload.instagram;
      expect(template.buttons).toHaveLength(3);
    });
  });

  describe('createInstagramFallbackMessage', () => {
    it('should create a fallback message with default text', () => {
      const result = createInstagramFallbackMessage();
      
      const template = result[0].custom_payload.instagram;
      expect(template.template_type).toBe('button');
      expect(template.text).toBe('Desculpe, não foi possível processar sua mensagem no momento.');
      expect(template.buttons).toEqual([]);
    });

    it('should create a fallback message with custom text', () => {
      const customMessage = 'Custom error message';
      const result = createInstagramFallbackMessage(customMessage);
      
      const template = result[0].custom_payload.instagram;
      expect(template.text).toBe(customMessage);
    });

    it('should truncate long error messages to 640 characters', () => {
      const longMessage = 'Error: ' + 'A'.repeat(700);
      const result = createInstagramFallbackMessage(longMessage);
      
      const template = result[0].custom_payload.instagram;
      expect(template.text).toHaveLength(640);
    });
  });

  describe('convertWhatsAppButtonsToInstagram', () => {
    it('should convert WhatsApp buttons to Instagram format', () => {
      const whatsappButtons = [
        { id: 'btn_1', titulo: 'Click Me', tipo: 'postback' },
        { id: 'btn_2', titulo: 'Visit Site', tipo: 'web_url', url: 'https://example.com' },
      ];
      
      const result = convertWhatsAppButtonsToInstagram(whatsappButtons);
      
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        title: 'Click Me',
        type: 'postback',
        payload: 'btn_1',
      });
      expect(result[1]).toEqual({
        title: 'Visit Site',
        type: 'web_url',
        url: 'https://example.com',
      });
    });

    it('should truncate button titles to 20 characters', () => {
      const whatsappButtons = [
        { id: 'btn_1', titulo: 'This is a very long button title that exceeds limit', tipo: 'postback' },
      ];
      
      const result = convertWhatsAppButtonsToInstagram(whatsappButtons);
      
      expect(result[0].title).toHaveLength(20);
      expect(result[0].title).toBe('This is a very long ');
    });

    it('should handle missing button data gracefully', () => {
      const whatsappButtons = [
        { id: 'btn_1' }, // Missing titulo and tipo
        { titulo: 'Button 2' }, // Missing id and tipo
      ];
      
      const result = convertWhatsAppButtonsToInstagram(whatsappButtons);
      
      expect(result).toHaveLength(2);
      expect(result[0].title).toBe('Button');
      expect(result[0].payload).toBe('btn_1');
      expect(result[1].title).toBe('Button 2');
      expect(result[1].payload).toBe('default_payload');
    });
  });

  describe('convertEnhancedButtonsToInstagram', () => {
    it('should convert enhanced buttons to Instagram format', () => {
      const enhancedButtons = [
        { id: 'btn_1', title: 'Click Me', type: 'postback' },
        { id: 'btn_2', title: 'Visit Site', type: 'url', url: 'https://example.com' },
      ];
      
      const result = convertEnhancedButtonsToInstagram(enhancedButtons);
      
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        title: 'Click Me',
        type: 'postback',
        payload: 'btn_1',
      });
      expect(result[1]).toEqual({
        title: 'Visit Site',
        type: 'web_url',
        url: 'https://example.com',
      });
    });
  });

  describe('determineInstagramTemplateType', () => {
    it('should return "generic" for messages ≤80 characters', () => {
      expect(determineInstagramTemplateType('Short message')).toBe('generic');
      expect(determineInstagramTemplateType('A'.repeat(80))).toBe('generic');
    });

    it('should return "button" for messages 81-640 characters', () => {
      expect(determineInstagramTemplateType('A'.repeat(81))).toBe('button');
      expect(determineInstagramTemplateType('A'.repeat(640))).toBe('button');
    });

    it('should return "incompatible" for messages >640 characters', () => {
      expect(determineInstagramTemplateType('A'.repeat(641))).toBe('incompatible');
      expect(determineInstagramTemplateType('A'.repeat(1000))).toBe('incompatible');
    });
  });

  describe('validateInstagramTemplate', () => {
    it('should validate a correct Generic Template', () => {
      const template = {
        template_type: 'generic' as const,
        elements: [
          {
            title: 'Valid Title',
            subtitle: 'Valid Subtitle',
            image_url: 'https://example.com/image.jpg',
            buttons: [
              { type: 'postback' as const, title: 'Button', payload: 'btn_1' }
            ],
          },
        ],
      };
      
      const result = validateInstagramTemplate(template);
      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should validate a correct Button Template', () => {
      const template = {
        template_type: 'button' as const,
        text: 'This is a valid button template text',
        buttons: [
          { type: 'web_url' as const, title: 'Visit', url: 'https://example.com' }
        ],
      };
      
      const result = validateInstagramTemplate(template);
      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should detect errors in Generic Template', () => {
      const template = {
        template_type: 'generic' as const,
        elements: [
          {
            title: '', // Empty title
            subtitle: 'A'.repeat(100), // Too long subtitle
            buttons: new Array(5).fill({ type: 'postback', title: 'Button', payload: 'btn' }), // Too many buttons
          },
        ],
      };
      
      const result = validateInstagramTemplate(template);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Element 0 must have a title');
      expect(result.errors).toContain('Element 0 subtitle exceeds 80 characters');
      expect(result.errors).toContain('Element 0 has more than 3 buttons');
    });

    it('should detect errors in Button Template', () => {
      const template = {
        template_type: 'button' as const,
        text: 'A'.repeat(700), // Too long text
        buttons: new Array(5).fill({ type: 'postback', title: 'Button', payload: 'btn' }), // Too many buttons
      };
      
      const result = validateInstagramTemplate(template);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Button template text exceeds 640 characters');
      expect(result.errors).toContain('Button template has more than 3 buttons');
    });
  });
});