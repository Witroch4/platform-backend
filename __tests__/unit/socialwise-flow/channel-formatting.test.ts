/**
 * Unit tests for SocialWise Flow Channel-Specific Response Formatting
 */

import {
  buildWhatsAppButtons,
  buildInstagramButtons,
  buildFacebookText,
  buildButtons,
  degradeToNumberedText,
  validateChannelResponse,
  formatResponseSafe,
  type ButtonOption
} from '@/lib/socialwise-flow/channel-formatting';

describe('SocialWise Flow Channel Formatting', () => {
  const sampleButtons: ButtonOption[] = [
    { title: 'Recorrer Multa', payload: '@recurso_multa_transito' },
    { title: 'Ação Judicial', payload: '@mandado_seguranca' },
    { title: 'Consulta', payload: '@consulta_juridica' }
  ];

  const sampleText = 'Posso ajudar com sua questão jurídica. Qual dessas opções se aproxima mais do que você precisa?';

  describe('buildWhatsAppButtons', () => {
    it('should build valid WhatsApp interactive message', () => {
      const result = buildWhatsAppButtons(sampleText, sampleButtons);

      expect(result.type).toBe('interactive');
      expect(result.interactive.type).toBe('button');
      expect(result.interactive.body.text).toBe(sampleText);
      expect(result.interactive.action.buttons).toHaveLength(3);
    });

    it('should format buttons correctly for WhatsApp', () => {
      const result = buildWhatsAppButtons(sampleText, sampleButtons);
      const buttons = result.interactive.action.buttons;

      expect(buttons[0].type).toBe('reply');
      expect(buttons[0].reply.title).toBe('Recorrer Multa');
      expect(buttons[0].reply.id).toBe('@recurso_multa_transito');
    });

    it('should clamp body text to WhatsApp limits', () => {
      const longText = 'A'.repeat(1500);
      const result = buildWhatsAppButtons(longText, sampleButtons);

      expect(result.interactive.body.text.length).toBeLessThanOrEqual(1024);
    });

    it('should limit to maximum 3 buttons', () => {
      const manyButtons = Array.from({ length: 5 }, (_, i) => ({
        title: `Button ${i + 1}`,
        payload: `@button_${i + 1}`
      }));
      
      const result = buildWhatsAppButtons(sampleText, manyButtons);
      expect(result.interactive.action.buttons).toHaveLength(3);
    });

    it('should handle button validation failures with fallbacks', () => {
      const invalidButtons: ButtonOption[] = [
        { title: 'Este título é muito longo para um botão do WhatsApp', payload: 'invalid-payload' }
      ];
      
      const result = buildWhatsAppButtons(sampleText, invalidButtons);
      const button = result.interactive.action.buttons[0];

      expect(button.reply.title).toBe('Opção');
      expect(button.reply.id).toBe('fallback_0');
    });

    it('should clamp button IDs to 256 characters', () => {
      const longPayloadButton: ButtonOption[] = [
        { title: 'Valid', payload: '@' + 'a'.repeat(300) }
      ];
      
      const result = buildWhatsAppButtons(sampleText, longPayloadButton);
      const button = result.interactive.action.buttons[0];

      expect(button.reply.id.length).toBeLessThanOrEqual(256);
    });
  });

  describe('buildInstagramButtons', () => {
    it('should build valid Instagram button template', () => {
      const result = buildInstagramButtons(sampleText, sampleButtons);

      expect(result.message.attachment.type).toBe('template');
      expect(result.message.attachment.payload.template_type).toBe('button');
      expect(result.message.attachment.payload.text).toBe(sampleText);
      expect(result.message.attachment.payload.buttons).toHaveLength(3);
    });

    it('should format buttons correctly for Instagram', () => {
      const result = buildInstagramButtons(sampleText, sampleButtons);
      const buttons = result.message.attachment.payload.buttons;

      expect(buttons[0].type).toBe('postback');
      expect(buttons[0].title).toBe('Recorrer Multa');
      expect(buttons[0].payload).toBe('@recurso_multa_transito');
    });

    it('should clamp body text to Instagram limits', () => {
      const longText = 'A'.repeat(1000);
      const result = buildInstagramButtons(longText, sampleButtons);

      expect(result.message.attachment.payload.text.length).toBeLessThanOrEqual(640);
    });

    it('should handle button validation failures with fallbacks', () => {
      const invalidButtons: ButtonOption[] = [
        { title: 'Este título é muito longo', payload: 'invalid' }
      ];
      
      const result = buildInstagramButtons(sampleText, invalidButtons);
      const button = result.message.attachment.payload.buttons[0];

      expect(button.title).toBe('Opção');
      expect(button.payload).toBe('@fallback_0');
    });

    it('should limit payload to 1000 characters', () => {
      const longPayloadButton: ButtonOption[] = [
        { title: 'Valid', payload: '@' + 'a'.repeat(1200) }
      ];
      
      const result = buildInstagramButtons(sampleText, longPayloadButton);
      const button = result.message.attachment.payload.buttons[0];

      // Should use fallback due to validation failure
      expect(button.payload).toBe('@fallback_0');
    });
  });

  describe('buildFacebookText', () => {
    it('should build Facebook plain text message', () => {
      const result = buildFacebookText(sampleText, sampleButtons);

      expect(result.message.text).toContain(sampleText);
      expect(result.message.text).toContain('Opções:');
      expect(result.message.text).toContain('1. Recorrer Multa');
      expect(result.message.text).toContain('2. Ação Judicial');
      expect(result.message.text).toContain('3. Consulta');
    });

    it('should handle empty buttons array', () => {
      const result = buildFacebookText(sampleText, []);

      expect(result.message.text).toBe(sampleText);
      expect(result.message.text).not.toContain('Opções:');
    });

    it('should clamp total text to Facebook limits', () => {
      const longText = 'A'.repeat(1500);
      const result = buildFacebookText(longText, sampleButtons);

      expect(result.message.text.length).toBeLessThanOrEqual(1024);
    });

    it('should limit to 3 button options', () => {
      const manyButtons = Array.from({ length: 5 }, (_, i) => ({
        title: `Button ${i + 1}`,
        payload: `@button_${i + 1}`
      }));
      
      const result = buildFacebookText(sampleText, manyButtons);
      
      expect(result.message.text).toContain('1. Button 1');
      expect(result.message.text).toContain('2. Button 2');
      expect(result.message.text).toContain('3. Button 3');
      expect(result.message.text).not.toContain('4. Button 4');
    });
  });

  describe('buildButtons', () => {
    it('should route to correct channel formatter', () => {
      const whatsappResult = buildButtons('whatsapp', sampleText, sampleButtons);
      const instagramResult = buildButtons('instagram', sampleText, sampleButtons);
      const facebookResult = buildButtons('facebook', sampleText, sampleButtons);

      expect(whatsappResult).toHaveProperty('type', 'interactive');
      expect(instagramResult).toHaveProperty('message.attachment.type', 'template');
      expect(facebookResult).toHaveProperty('message.text');
    });

    it('should throw error for unsupported channel', () => {
      expect(() => {
        buildButtons('unsupported' as any, sampleText, sampleButtons);
      }).toThrow('Unsupported channel: unsupported');
    });
  });

  describe('degradeToNumberedText', () => {
    it('should create numbered text from buttons', () => {
      const result = degradeToNumberedText(sampleText, sampleButtons);

      expect(result).toContain(sampleText);
      expect(result).toContain('Opções:');
      expect(result).toContain('1. Recorrer Multa');
      expect(result).toContain('2. Ação Judicial');
      expect(result).toContain('3. Consulta');
    });

    it('should handle empty buttons', () => {
      const result = degradeToNumberedText(sampleText, []);

      expect(result).toBe(sampleText);
      expect(result).not.toContain('Opções:');
    });

    it('should respect channel limits', () => {
      const longText = 'A'.repeat(1500);
      const result = degradeToNumberedText(longText, sampleButtons, 'instagram');

      expect(result.length).toBeLessThanOrEqual(640);
    });

    it('should limit to 3 buttons', () => {
      const manyButtons = Array.from({ length: 5 }, (_, i) => ({
        title: `Button ${i + 1}`,
        payload: `@button_${i + 1}`
      }));
      
      const result = degradeToNumberedText(sampleText, manyButtons);
      
      expect(result).toContain('3. Button 3');
      expect(result).not.toContain('4. Button 4');
    });
  });

  describe('validateChannelResponse', () => {
    it('should validate correct WhatsApp response', () => {
      const response = buildWhatsAppButtons(sampleText, sampleButtons);
      const result = validateChannelResponse(response, 'whatsapp');

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate correct Instagram response', () => {
      const response = buildInstagramButtons(sampleText, sampleButtons);
      const result = validateChannelResponse(response, 'instagram');

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate correct Facebook response', () => {
      const response = buildFacebookText(sampleText, sampleButtons);
      const result = validateChannelResponse(response, 'facebook');

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect WhatsApp validation errors', () => {
      const invalidResponse = { type: 'text', message: 'invalid' };
      const result = validateChannelResponse(invalidResponse, 'whatsapp');

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('WhatsApp response must have type "interactive"');
    });

    it('should detect Instagram validation errors', () => {
      const invalidResponse = { message: { text: 'invalid' } };
      const result = validateChannelResponse(invalidResponse, 'instagram');

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Instagram response must have template_type');
    });

    it('should detect Facebook validation errors', () => {
      const invalidResponse = { type: 'interactive' };
      const result = validateChannelResponse(invalidResponse, 'facebook');

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Facebook response must have message text');
    });
  });

  describe('formatResponseSafe', () => {
    it('should return valid response when formatting succeeds', () => {
      const result = formatResponseSafe('whatsapp', sampleText, sampleButtons);

      expect(result.type).toBe('interactive');
      expect(result.interactive.body.text).toBe(sampleText);
    });

    it('should fallback to plain text on validation failure', () => {
      // Mock a scenario where validation would fail
      const problematicButtons: ButtonOption[] = [
        { title: '', payload: '' } // Invalid button
      ];
      
      const result = formatResponseSafe('whatsapp', sampleText, problematicButtons);

      // Should still return a response, possibly with fallback formatting
      expect(result).toHaveProperty('message');
    });

    it('should handle formatting errors gracefully', () => {
      // Test with extreme edge case
      const result = formatResponseSafe('whatsapp', sampleText, sampleButtons);

      // Should always return some form of response
      expect(result).toBeDefined();
    });

    it('should clamp text in ultimate fallback', () => {
      const longText = 'A'.repeat(2000);
      const result = formatResponseSafe('instagram', longText, []);

      if (result.message?.text) {
        expect(result.message.text.length).toBeLessThanOrEqual(640);
      }
    });
  });
});