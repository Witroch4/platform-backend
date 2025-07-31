/**
 * Unit tests for Instagram Message Conversion Logic
 * Tests the core message conversion functionality from WhatsApp to Instagram format
 * 
 * Requirements covered:
 * - 3.1, 3.2, 3.3, 3.4, 3.5: Generic Template conversion scenarios
 * - 4.1, 4.2, 4.3, 4.4, 4.5: Button Template conversion scenarios  
 * - 7.1, 7.2, 7.3, 7.4, 7.5: Button conversion and validation
 * - Incompatible message handling (>640 chars)
 */

import {
  createInstagramGenericTemplate,
  createInstagramButtonTemplate,
  convertWhatsAppButtonsToInstagram,
  convertEnhancedButtonsToInstagram,
  determineInstagramTemplateType,
  validateInstagramTemplate,
  InstagramButton,
  InstagramGenericTemplate,
  InstagramButtonTemplate,
} from '@/lib/instagram/payload-builder';

describe('Instagram Message Conversion Logic', () => {
  describe('Generic Template Conversion (≤80 characters)', () => {
    describe('Requirement 3.1: Use Generic Template for messages ≤80 characters', () => {
      it('should use Generic Template for 80 character message', () => {
        const message = 'A'.repeat(80); // Exactly 80 characters
        const templateType = determineInstagramTemplateType(message);
        expect(templateType).toBe('generic');
      });

      it('should use Generic Template for messages under 80 characters', () => {
        const shortMessage = 'Hello World!'; // 12 characters
        const templateType = determineInstagramTemplateType(shortMessage);
        expect(templateType).toBe('generic');
      });

      it('should create valid Generic Template structure', () => {
        const result = createInstagramGenericTemplate('Short message');
        
        expect(result).toHaveLength(1);
        expect(result[0].custom_payload.instagram.template_type).toBe('generic');
        expect(result[0].custom_payload.instagram.elements).toHaveLength(1);
      });
    });

    describe('Requirement 3.2: Map WhatsApp body to Instagram title', () => {
      it('should map WhatsApp body text to Instagram title', () => {
        const bodyText = 'Welcome to our service!';
        const result = createInstagramGenericTemplate(bodyText);
        
        const template = result[0].custom_payload.instagram as InstagramGenericTemplate;
        expect(template.elements[0].title).toBe(bodyText);
      });

      it('should truncate title if it exceeds 80 characters', () => {
        const longBody = 'A'.repeat(100);
        const result = createInstagramGenericTemplate(longBody);
        
        const template = result[0].custom_payload.instagram as InstagramGenericTemplate;
        expect(template.elements[0].title).toHaveLength(80);
        expect(template.elements[0].title).toBe('A'.repeat(80));
      });

      it('should handle empty body text', () => {
        const result = createInstagramGenericTemplate('');
        
        const template = result[0].custom_payload.instagram as InstagramGenericTemplate;
        expect(template.elements[0].title).toBe('');
      });
    });

    describe('Requirement 3.3: Map WhatsApp footer to Instagram subtitle', () => {
      it('should map WhatsApp footer to Instagram subtitle', () => {
        const footerText = 'Thank you for choosing us';
        const result = createInstagramGenericTemplate('Title', footerText);
        
        const template = result[0].custom_payload.instagram as InstagramGenericTemplate;
        expect(template.elements[0].subtitle).toBe(footerText);
      });

      it('should truncate subtitle if it exceeds 80 characters', () => {
        const longFooter = 'B'.repeat(100);
        const result = createInstagramGenericTemplate('Title', longFooter);
        
        const template = result[0].custom_payload.instagram as InstagramGenericTemplate;
        expect(template.elements[0].subtitle).toHaveLength(80);
        expect(template.elements[0].subtitle).toBe('B'.repeat(80));
      });

      it('should not include subtitle if footer is undefined', () => {
        const result = createInstagramGenericTemplate('Title');
        
        const template = result[0].custom_payload.instagram as InstagramGenericTemplate;
        expect(template.elements[0].subtitle).toBeUndefined();
      });

      it('should not include subtitle if footer is empty string', () => {
        const result = createInstagramGenericTemplate('Title', '');
        
        const template = result[0].custom_payload.instagram as InstagramGenericTemplate;
        expect(template.elements[0].subtitle).toBeUndefined();
      });
    });

    describe('Requirement 3.4: Map WhatsApp header image to Instagram image_url', () => {
      it('should map WhatsApp header image to Instagram image_url', () => {
        const imageUrl = 'https://example.com/image.jpg';
        const result = createInstagramGenericTemplate('Title', 'Subtitle', imageUrl);
        
        const template = result[0].custom_payload.instagram as InstagramGenericTemplate;
        expect(template.elements[0].image_url).toBe(imageUrl);
      });

      it('should not include image_url if not provided', () => {
        const result = createInstagramGenericTemplate('Title', 'Subtitle');
        
        const template = result[0].custom_payload.instagram as InstagramGenericTemplate;
        expect(template.elements[0].image_url).toBeUndefined();
      });

      it('should handle various image URL formats', () => {
        const testUrls = [
          'https://example.com/image.jpg',
          'http://example.com/image.png',
          'https://cdn.example.com/path/to/image.gif',
        ];

        testUrls.forEach(url => {
          const result = createInstagramGenericTemplate('Title', undefined, url);
          const template = result[0].custom_payload.instagram as InstagramGenericTemplate;
          expect(template.elements[0].image_url).toBe(url);
        });
      });
    });

    describe('Requirement 3.5: Convert WhatsApp buttons to Instagram buttons', () => {
      it('should convert WhatsApp buttons to Instagram format', () => {
        const whatsappButtons = [
          { id: 'btn_1', titulo: 'Click Me', tipo: 'postback' },
          { id: 'btn_2', titulo: 'Visit Site', tipo: 'web_url', url: 'https://example.com' },
        ];
        
        const instagramButtons = convertWhatsAppButtonsToInstagram(whatsappButtons);
        const result = createInstagramGenericTemplate('Title', undefined, undefined, instagramButtons);
        
        const template = result[0].custom_payload.instagram as InstagramGenericTemplate;
        expect(template.elements[0].buttons).toHaveLength(2);
        expect(template.elements[0].buttons[0].title).toBe('Click Me');
        expect(template.elements[0].buttons[0].type).toBe('postback');
        expect(template.elements[0].buttons[1].title).toBe('Visit Site');
        expect(template.elements[0].buttons[1].type).toBe('web_url');
      });

      it('should handle Generic Template without buttons', () => {
        const result = createInstagramGenericTemplate('Title');
        
        const template = result[0].custom_payload.instagram as InstagramGenericTemplate;
        expect(template.elements[0].buttons).toEqual([]);
      });
    });
  });

  describe('Button Template Conversion (81-640 characters)', () => {
    describe('Requirement 4.1: Use Button Template for messages 81-640 characters', () => {
      it('should use Button Template for 81 character message', () => {
        const message = 'A'.repeat(81); // Exactly 81 characters
        const templateType = determineInstagramTemplateType(message);
        expect(templateType).toBe('button');
      });

      it('should use Button Template for 640 character message', () => {
        const message = 'A'.repeat(640); // Exactly 640 characters
        const templateType = determineInstagramTemplateType(message);
        expect(templateType).toBe('button');
      });

      it('should use Button Template for messages between 81-640 characters', () => {
        const mediumMessage = 'A'.repeat(200); // 200 characters
        const templateType = determineInstagramTemplateType(mediumMessage);
        expect(templateType).toBe('button');
      });

      it('should create valid Button Template structure', () => {
        const longMessage = 'A'.repeat(100);
        const result = createInstagramButtonTemplate(longMessage);
        
        expect(result).toHaveLength(1);
        expect(result[0].custom_payload.instagram.template_type).toBe('button');
        expect(result[0].custom_payload.instagram.text).toBe(longMessage);
      });
    });

    describe('Requirement 4.2: Map WhatsApp body to Instagram text', () => {
      it('should map WhatsApp body text to Instagram text field', () => {
        const bodyText = 'This is a longer message that will be used in a Button Template because it exceeds 80 characters in length.';
        const result = createInstagramButtonTemplate(bodyText);
        
        const template = result[0].custom_payload.instagram as InstagramButtonTemplate;
        expect(template.text).toBe(bodyText);
      });

      it('should truncate text if it exceeds 640 characters', () => {
        const longText = 'A'.repeat(700);
        const result = createInstagramButtonTemplate(longText);
        
        const template = result[0].custom_payload.instagram as InstagramButtonTemplate;
        expect(template.text).toHaveLength(640);
        expect(template.text).toBe('A'.repeat(640));
      });
    });

    describe('Requirement 4.3: Discard header and footer in Button Template', () => {
      it('should not include header or footer fields in Button Template', () => {
        const result = createInstagramButtonTemplate('Button template text');
        
        const template = result[0].custom_payload.instagram as InstagramButtonTemplate;
        expect(template).not.toHaveProperty('image_url');
        expect(template).not.toHaveProperty('subtitle');
        expect(template).not.toHaveProperty('elements');
        expect(template).toHaveProperty('text');
        expect(template).toHaveProperty('buttons');
        expect(template).toHaveProperty('template_type');
      });
    });

    describe('Requirement 4.4: Convert WhatsApp buttons to Instagram buttons', () => {
      it('should convert WhatsApp buttons for Button Template', () => {
        const whatsappButtons = [
          { id: 'btn_1', titulo: 'Action 1', tipo: 'postback' },
          { id: 'btn_2', titulo: 'Visit Website', tipo: 'web_url', url: 'https://example.com' },
        ];
        
        const instagramButtons = convertWhatsAppButtonsToInstagram(whatsappButtons);
        const result = createInstagramButtonTemplate('Choose an option:', instagramButtons);
        
        const template = result[0].custom_payload.instagram as InstagramButtonTemplate;
        expect(template.buttons).toHaveLength(2);
        expect(template.buttons[0].title).toBe('Action 1');
        expect(template.buttons[0].type).toBe('postback');
        expect(template.buttons[1].title).toBe('Visit Website');
        expect(template.buttons[1].type).toBe('web_url');
      });
    });

    describe('Requirement 4.5: Maintain up to 3 buttons for Instagram', () => {
      it('should limit buttons to 3 in Button Template', () => {
        const manyButtons: InstagramButton[] = [
          { type: 'postback', title: 'Button 1', payload: 'btn_1' },
          { type: 'postback', title: 'Button 2', payload: 'btn_2' },
          { type: 'postback', title: 'Button 3', payload: 'btn_3' },
          { type: 'postback', title: 'Button 4', payload: 'btn_4' },
          { type: 'postback', title: 'Button 5', payload: 'btn_5' },
        ];
        
        const result = createInstagramButtonTemplate('Choose:', manyButtons);
        
        const template = result[0].custom_payload.instagram as InstagramButtonTemplate;
        expect(template.buttons).toHaveLength(3);
        expect(template.buttons[0].title).toBe('Button 1');
        expect(template.buttons[2].title).toBe('Button 3');
      });
    });
  });

  describe('Incompatible Message Handling (>640 characters)', () => {
    it('should detect messages over 640 characters as incompatible', () => {
      const tooLongMessage = 'A'.repeat(641); // 641 characters
      const templateType = determineInstagramTemplateType(tooLongMessage);
      expect(templateType).toBe('incompatible');
    });

    it('should detect very long messages as incompatible', () => {
      const veryLongMessage = 'A'.repeat(1000); // 1000 characters
      const templateType = determineInstagramTemplateType(veryLongMessage);
      expect(templateType).toBe('incompatible');
    });

    it('should handle edge case at 641 characters', () => {
      const edgeCaseMessage = 'A'.repeat(641);
      const templateType = determineInstagramTemplateType(edgeCaseMessage);
      expect(templateType).toBe('incompatible');
    });
  });

  describe('Button Conversion and Validation', () => {
    describe('Requirement 7.1: Map web_url button type correctly', () => {
      it('should convert WhatsApp web_url buttons to Instagram web_url', () => {
        const whatsappButtons = [
          { id: 'btn_1', titulo: 'Visit Site', tipo: 'web_url', url: 'https://example.com' },
        ];
        
        const result = convertWhatsAppButtonsToInstagram(whatsappButtons);
        
        expect(result[0].type).toBe('web_url');
        expect(result[0].url).toBe('https://example.com');
        expect(result[0]).not.toHaveProperty('payload');
      });

      it('should handle web_url buttons without URL gracefully', () => {
        const whatsappButtons = [
          { id: 'btn_1', titulo: 'Visit Site', tipo: 'web_url' }, // Missing URL
        ];
        
        const result = convertWhatsAppButtonsToInstagram(whatsappButtons);
        
        expect(result[0].type).toBe('postback'); // Should fallback to postback
        expect(result[0].payload).toBe('btn_1');
        expect(result[0]).not.toHaveProperty('url');
      });
    });

    describe('Requirement 7.2: Map postback button type correctly', () => {
      it('should convert WhatsApp postback buttons to Instagram postback', () => {
        const whatsappButtons = [
          { id: 'btn_1', titulo: 'Click Me', tipo: 'postback' },
        ];
        
        const result = convertWhatsAppButtonsToInstagram(whatsappButtons);
        
        expect(result[0].type).toBe('postback');
        expect(result[0].payload).toBe('btn_1');
        expect(result[0]).not.toHaveProperty('url');
      });

      it('should handle postback buttons without ID gracefully', () => {
        const whatsappButtons = [
          { titulo: 'Click Me', tipo: 'postback' }, // Missing ID
        ];
        
        const result = convertWhatsAppButtonsToInstagram(whatsappButtons);
        
        expect(result[0].type).toBe('postback');
        expect(result[0].payload).toBe('default_payload');
      });
    });

    describe('Requirement 7.3: Preserve title and payload/url', () => {
      it('should preserve button titles', () => {
        const whatsappButtons = [
          { id: 'btn_1', titulo: 'Custom Title', tipo: 'postback' },
          { id: 'btn_2', titulo: 'Another Title', tipo: 'web_url', url: 'https://example.com' },
        ];
        
        const result = convertWhatsAppButtonsToInstagram(whatsappButtons);
        
        expect(result[0].title).toBe('Custom Title');
        expect(result[1].title).toBe('Another Title');
      });

      it('should preserve payload for postback buttons', () => {
        const whatsappButtons = [
          { id: 'custom_payload_123', titulo: 'Click', tipo: 'postback' },
        ];
        
        const result = convertWhatsAppButtonsToInstagram(whatsappButtons);
        
        expect(result[0].payload).toBe('custom_payload_123');
      });

      it('should preserve URL for web_url buttons', () => {
        const whatsappButtons = [
          { id: 'btn_1', titulo: 'Visit', tipo: 'web_url', url: 'https://custom-url.com/path' },
        ];
        
        const result = convertWhatsAppButtonsToInstagram(whatsappButtons);
        
        expect(result[0].url).toBe('https://custom-url.com/path');
      });
    });

    describe('Requirement 7.4: Limit to 3 buttons for Instagram', () => {
      it('should limit WhatsApp buttons to 3 for Instagram compatibility', () => {
        const manyWhatsappButtons = [
          { id: 'btn_1', titulo: 'Button 1', tipo: 'postback' },
          { id: 'btn_2', titulo: 'Button 2', tipo: 'postback' },
          { id: 'btn_3', titulo: 'Button 3', tipo: 'postback' },
          { id: 'btn_4', titulo: 'Button 4', tipo: 'postback' },
          { id: 'btn_5', titulo: 'Button 5', tipo: 'postback' },
        ];
        
        const instagramButtons = convertWhatsAppButtonsToInstagram(manyWhatsappButtons);
        const result = createInstagramGenericTemplate('Title', undefined, undefined, instagramButtons);
        
        const template = result[0].custom_payload.instagram as InstagramGenericTemplate;
        expect(template.elements[0].buttons).toHaveLength(3);
      });

      it('should preserve the first 3 buttons in order', () => {
        const whatsappButtons = [
          { id: 'btn_1', titulo: 'First', tipo: 'postback' },
          { id: 'btn_2', titulo: 'Second', tipo: 'postback' },
          { id: 'btn_3', titulo: 'Third', tipo: 'postback' },
          { id: 'btn_4', titulo: 'Fourth', tipo: 'postback' },
        ];
        
        const instagramButtons = convertWhatsAppButtonsToInstagram(whatsappButtons);
        const result = createInstagramButtonTemplate('Choose:', instagramButtons);
        
        const template = result[0].custom_payload.instagram as InstagramButtonTemplate;
        expect(template.buttons).toHaveLength(3);
        expect(template.buttons[0].title).toBe('First');
        expect(template.buttons[1].title).toBe('Second');
        expect(template.buttons[2].title).toBe('Third');
      });
    });

    describe('Requirement 7.5: Maintain original button order', () => {
      it('should maintain the original order of buttons', () => {
        const whatsappButtons = [
          { id: 'btn_3', titulo: 'Third Button', tipo: 'postback' },
          { id: 'btn_1', titulo: 'First Button', tipo: 'web_url', url: 'https://first.com' },
          { id: 'btn_2', titulo: 'Second Button', tipo: 'postback' },
        ];
        
        const result = convertWhatsAppButtonsToInstagram(whatsappButtons);
        
        expect(result[0].title).toBe('Third Button');
        expect(result[0].type).toBe('postback');
        expect(result[1].title).toBe('First Button');
        expect(result[1].type).toBe('web_url');
        expect(result[2].title).toBe('Second Button');
        expect(result[2].type).toBe('postback');
      });
    });

    describe('Enhanced Button Conversion', () => {
      it('should convert enhanced buttons to Instagram format', () => {
        const enhancedButtons = [
          { id: 'enh_1', title: 'Enhanced Click', type: 'postback' },
          { id: 'enh_2', title: 'Enhanced Visit', type: 'url', url: 'https://enhanced.com' },
        ];
        
        const result = convertEnhancedButtonsToInstagram(enhancedButtons);
        
        expect(result).toHaveLength(2);
        expect(result[0].title).toBe('Enhanced Click');
        expect(result[0].type).toBe('postback');
        expect(result[0].payload).toBe('enh_1');
        expect(result[1].title).toBe('Enhanced Visit');
        expect(result[1].type).toBe('web_url');
        expect(result[1].url).toBe('https://enhanced.com');
      });

      it('should handle enhanced buttons without proper type', () => {
        const enhancedButtons = [
          { id: 'enh_1', title: 'Enhanced Button' }, // Missing type
        ];
        
        const result = convertEnhancedButtonsToInstagram(enhancedButtons);
        
        expect(result[0].type).toBe('postback'); // Should default to postback
        expect(result[0].payload).toBe('enh_1');
      });
    });

    describe('Button Title Truncation', () => {
      it('should truncate button titles to 20 characters', () => {
        const whatsappButtons = [
          { id: 'btn_1', titulo: 'This is a very long button title that exceeds the Instagram limit', tipo: 'postback' },
        ];
        
        const result = convertWhatsAppButtonsToInstagram(whatsappButtons);
        
        expect(result[0].title).toHaveLength(20);
        expect(result[0].title).toBe('This is a very long ');
      });

      it('should not truncate titles under 20 characters', () => {
        const whatsappButtons = [
          { id: 'btn_1', titulo: 'Short Title', tipo: 'postback' },
        ];
        
        const result = convertWhatsAppButtonsToInstagram(whatsappButtons);
        
        expect(result[0].title).toBe('Short Title');
        expect(result[0].title.length).toBeLessThanOrEqual(20);
      });

      it('should handle exactly 20 character titles', () => {
        const exactTitle = 'A'.repeat(20); // Exactly 20 characters
        const whatsappButtons = [
          { id: 'btn_1', titulo: exactTitle, tipo: 'postback' },
        ];
        
        const result = convertWhatsAppButtonsToInstagram(whatsappButtons);
        
        expect(result[0].title).toBe(exactTitle);
        expect(result[0].title).toHaveLength(20);
      });
    });
  });

  describe('Template Validation', () => {
    it('should validate Generic Template with all fields', () => {
      const template: InstagramGenericTemplate = {
        template_type: 'generic',
        elements: [
          {
            title: 'Valid Title',
            subtitle: 'Valid Subtitle',
            image_url: 'https://example.com/image.jpg',
            buttons: [
              { type: 'postback', title: 'Button', payload: 'btn_1' }
            ],
          },
        ],
      };
      
      const result = validateInstagramTemplate(template);
      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should validate Button Template with all fields', () => {
      const template: InstagramButtonTemplate = {
        template_type: 'button',
        text: 'Valid button template text',
        buttons: [
          { type: 'web_url', title: 'Visit', url: 'https://example.com' }
        ],
      };
      
      const result = validateInstagramTemplate(template);
      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should detect validation errors in templates', () => {
      const invalidTemplate: InstagramGenericTemplate = {
        template_type: 'generic',
        elements: [
          {
            title: '', // Invalid: empty title
            subtitle: 'A'.repeat(100), // Invalid: too long
            buttons: new Array(5).fill({ type: 'postback', title: 'Button', payload: 'btn' }), // Invalid: too many buttons
          },
        ],
      };
      
      const result = validateInstagramTemplate(invalidTemplate);
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle empty button arrays', () => {
      const result = createInstagramGenericTemplate('Title', undefined, undefined, []);
      
      const template = result[0].custom_payload.instagram as InstagramGenericTemplate;
      expect(template.elements[0].buttons).toEqual([]);
    });

    it('should handle undefined button arrays', () => {
      const result = createInstagramButtonTemplate('Text');
      
      const template = result[0].custom_payload.instagram as InstagramButtonTemplate;
      expect(template.buttons).toEqual([]);
    });

    it('should handle malformed WhatsApp button data', () => {
      const malformedButtons = [
        {}, // Empty object
        { titulo: 'Only Title' }, // Missing required fields
        { id: 'only_id' }, // Missing title
        null, // Null value
      ].filter(Boolean); // Remove null values
      
      const result = convertWhatsAppButtonsToInstagram(malformedButtons);
      
      // Should handle gracefully without throwing errors
      expect(result).toHaveLength(3);
      result.forEach(button => {
        expect(button).toHaveProperty('title');
        expect(button).toHaveProperty('type');
        expect(['postback', 'web_url']).toContain(button.type);
      });
    });

    it('should handle special characters in text content', () => {
      const specialText = 'Hello! 🎉 Welcome to our service. Visit us at https://example.com & enjoy 50% off!';
      const result = createInstagramButtonTemplate(specialText);
      
      const template = result[0].custom_payload.instagram as InstagramButtonTemplate;
      expect(template.text).toBe(specialText);
    });

    it('should handle Unicode characters in button titles', () => {
      const whatsappButtons = [
        { id: 'btn_1', titulo: '🚀 Launch', tipo: 'postback' },
        { id: 'btn_2', titulo: '📞 Call Now', tipo: 'postback' },
      ];
      
      const result = convertWhatsAppButtonsToInstagram(whatsappButtons);
      
      expect(result[0].title).toBe('🚀 Launch');
      expect(result[1].title).toBe('📞 Call Now');
    });
  });
});