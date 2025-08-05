/**
 * Fuzz testing for channel compliance
 * Tests edge cases and boundary conditions for WhatsApp and Instagram limits
 */

import { SanitizationService } from '@/lib/ai-integration/services/sanitization';
import { MessageFormatterService } from '@/lib/ai-integration/services/message-formatter';
import { WhatsAppLimits, InstagramLimits } from '@/lib/ai-integration/constants';

describe('Channel Compliance Fuzz Tests', () => {
  let sanitizationService: SanitizationService;
  let messageFormatter: MessageFormatterService;

  beforeEach(() => {
    sanitizationService = new SanitizationService();
    messageFormatter = new MessageFormatterService();
  });

  describe('WhatsApp Compliance Fuzz Tests', () => {
    it('should handle body text at exact limit (1024 chars)', () => {
      const exactLimitText = 'A'.repeat(WhatsAppLimits.BODY_MAX_LENGTH);
      const input = {
        body: exactLimitText,
        buttons: [{ title: 'OK', id: 'ok' }],
      };

      const sanitized = sanitizationService.sanitizeWhatsAppMessage(input);
      const result = messageFormatter.formatWhatsAppInteractive(sanitized.sanitized, {
        accountId: 123,
        conversationId: 456,
        traceId: 'fuzz-exact-limit',
      });

      expect(sanitized.isValid).toBe(true);
      expect(result.content_attributes.interactive.body.text).toBe(exactLimitText);
      expect(result.content_attributes.interactive.body.text.length).toBe(WhatsAppLimits.BODY_MAX_LENGTH);
    });

    it('should handle body text one character over limit (1025 chars)', () => {
      const overLimitText = 'A'.repeat(WhatsAppLimits.BODY_MAX_LENGTH + 1);
      const input = {
        body: overLimitText,
        buttons: [{ title: 'OK', id: 'ok' }],
      };

      const sanitized = sanitizationService.sanitizeWhatsAppMessage(input);

      expect(sanitized.isValid).toBe(true);
      expect(sanitized.sanitized.body.length).toBeLessThanOrEqual(WhatsAppLimits.BODY_MAX_LENGTH);
      expect(sanitized.sanitized.body).toMatch(/\.\.\.$|…$/);
    });

    it('should handle button titles at exact limit (20 chars)', () => {
      const exactLimitTitle = 'A'.repeat(WhatsAppLimits.BUTTON_TITLE_MAX_LENGTH);
      const input = {
        body: 'Choose option',
        buttons: [{ title: exactLimitTitle, id: 'exact' }],
      };

      const sanitized = sanitizationService.sanitizeWhatsAppMessage(input);

      expect(sanitized.isValid).toBe(true);
      expect(sanitized.sanitized.buttons[0].title).toBe(exactLimitTitle);
      expect(sanitized.sanitized.buttons[0].title.length).toBe(WhatsAppLimits.BUTTON_TITLE_MAX_LENGTH);
    });

    it('should handle button titles one character over limit (21 chars)', () => {
      const overLimitTitle = 'A'.repeat(WhatsAppLimits.BUTTON_TITLE_MAX_LENGTH + 1);
      const input = {
        body: 'Choose option',
        buttons: [{ title: overLimitTitle, id: 'over' }],
      };

      const sanitized = sanitizationService.sanitizeWhatsAppMessage(input);

      expect(sanitized.isValid).toBe(true);
      expect(sanitized.sanitized.buttons[0].title.length).toBeLessThanOrEqual(WhatsAppLimits.BUTTON_TITLE_MAX_LENGTH);
    });

    it('should handle exactly 3 buttons (max limit)', () => {
      const input = {
        body: 'Choose option',
        buttons: [
          { title: 'Option 1', id: 'opt1' },
          { title: 'Option 2', id: 'opt2' },
          { title: 'Option 3', id: 'opt3' },
        ],
      };

      const sanitized = sanitizationService.sanitizeWhatsAppMessage(input);

      expect(sanitized.isValid).toBe(true);
      expect(sanitized.sanitized.buttons).toHaveLength(WhatsAppLimits.BUTTONS_MAX_COUNT);
    });

    it('should handle 4 buttons (one over limit)', () => {
      const input = {
        body: 'Choose option',
        buttons: [
          { title: 'Option 1', id: 'opt1' },
          { title: 'Option 2', id: 'opt2' },
          { title: 'Option 3', id: 'opt3' },
          { title: 'Option 4', id: 'opt4' }, // Should be removed
        ],
      };

      const sanitized = sanitizationService.sanitizeWhatsAppMessage(input);

      expect(sanitized.isValid).toBe(true);
      expect(sanitized.sanitized.buttons).toHaveLength(WhatsAppLimits.BUTTONS_MAX_COUNT);
    });

    it('should handle header at exact limit (60 chars)', () => {
      const exactLimitHeader = 'A'.repeat(WhatsAppLimits.HEADER_MAX_LENGTH);
      const input = {
        body: 'Message body',
        header: exactLimitHeader,
        buttons: [{ title: 'OK', id: 'ok' }],
      };

      const sanitized = sanitizationService.sanitizeWhatsAppMessage(input);

      expect(sanitized.isValid).toBe(true);
      expect(sanitized.sanitized.header).toBe(exactLimitHeader);
      expect(sanitized.sanitized.header.length).toBe(WhatsAppLimits.HEADER_MAX_LENGTH);
    });

    it('should handle footer at exact limit (60 chars)', () => {
      const exactLimitFooter = 'A'.repeat(WhatsAppLimits.FOOTER_MAX_LENGTH);
      const input = {
        body: 'Message body',
        footer: exactLimitFooter,
        buttons: [{ title: 'OK', id: 'ok' }],
      };

      const sanitized = sanitizationService.sanitizeWhatsAppMessage(input);

      expect(sanitized.isValid).toBe(true);
      expect(sanitized.sanitized.footer).toBe(exactLimitFooter);
      expect(sanitized.sanitized.footer.length).toBe(WhatsAppLimits.FOOTER_MAX_LENGTH);
    });

    it('should handle button ID at exact limit (256 chars)', () => {
      const exactLimitId = 'A'.repeat(WhatsAppLimits.BUTTON_ID_MAX_LENGTH);
      const input = {
        body: 'Choose option',
        buttons: [{ title: 'OK', id: exactLimitId }],
      };

      const sanitized = sanitizationService.sanitizeWhatsAppMessage(input);

      expect(sanitized.isValid).toBe(true);
      expect(sanitized.sanitized.buttons[0].id).toBe(exactLimitId);
      expect(sanitized.sanitized.buttons[0].id.length).toBe(WhatsAppLimits.BUTTON_ID_MAX_LENGTH);
    });

    it('should handle extreme edge cases with empty strings', () => {
      const input = {
        body: '',
        header: '',
        footer: '',
        buttons: [{ title: '', id: '' }],
      };

      const sanitized = sanitizationService.sanitizeWhatsAppMessage(input);

      expect(sanitized.isValid).toBe(true);
      // Should add fallback button when no valid buttons
      expect(sanitized.sanitized.buttons).toHaveLength(1);
      expect(sanitized.sanitized.buttons[0].title).toBe('Falar com atendente');
    });

    it('should handle Unicode characters in limits', () => {
      const unicodeText = '🎉'.repeat(500) + 'A'.repeat(24); // Emojis + regular chars = 1024 total
      const input = {
        body: unicodeText,
        buttons: [{ title: '🎉Test🎉', id: 'unicode' }],
      };

      const sanitized = sanitizationService.sanitizeWhatsAppMessage(input);

      expect(sanitized.isValid).toBe(true);
      expect(sanitized.sanitized.body.length).toBeLessThanOrEqual(WhatsAppLimits.BODY_MAX_LENGTH);
    });
  });

  describe('Instagram Compliance Fuzz Tests', () => {
    it('should handle quick reply text at exact limit (1000 chars)', () => {
      const exactLimitText = 'A'.repeat(InstagramLimits.QUICK_REPLY_TEXT_MAX_LENGTH);
      const input = {
        text: exactLimitText,
        quick_replies: [{ title: 'OK', payload: 'ok' }],
      };

      const sanitized = sanitizationService.sanitizeInstagramQuickReply(input);

      expect(sanitized.isValid).toBe(true);
      expect(sanitized.sanitized.text).toBe(exactLimitText);
      expect(sanitized.sanitized.text.length).toBe(InstagramLimits.QUICK_REPLY_TEXT_MAX_LENGTH);
    });

    it('should handle button template text at exact limit (640 chars)', () => {
      const exactLimitText = 'A'.repeat(InstagramLimits.BUTTON_TEMPLATE_TEXT_MAX_LENGTH);
      const input = {
        text: exactLimitText,
        buttons: [{ type: 'postback', title: 'OK', payload: 'ok' }],
      };

      const sanitized = sanitizationService.sanitizeInstagramButtonTemplate(input);

      expect(sanitized.isValid).toBe(true);
      expect(sanitized.sanitized.text).toBe(exactLimitText);
      expect(sanitized.sanitized.text.length).toBe(InstagramLimits.BUTTON_TEMPLATE_TEXT_MAX_LENGTH);
    });

    it('should handle exactly 13 quick replies (Instagram max)', () => {
      const input = {
        text: 'Choose option',
        quick_replies: Array.from({ length: 13 }, (_, i) => ({
          title: `Option ${i + 1}`,
          payload: `opt${i + 1}`,
        })),
      };

      const sanitized = sanitizationService.sanitizeInstagramQuickReply(input);

      expect(sanitized.isValid).toBe(true);
      // Should be capped at 3 for UX consistency in SocialWise
      expect(sanitized.sanitized.quick_replies).toHaveLength(3);
    });

    it('should handle quick reply titles at exact limit (20 chars)', () => {
      const exactLimitTitle = 'A'.repeat(InstagramLimits.QUICK_REPLY_TITLE_MAX_LENGTH);
      const input = {
        text: 'Choose option',
        quick_replies: [{ title: exactLimitTitle, payload: 'exact' }],
      };

      const sanitized = sanitizationService.sanitizeInstagramQuickReply(input);

      expect(sanitized.isValid).toBe(true);
      expect(sanitized.sanitized.quick_replies[0].title).toBe(exactLimitTitle);
      expect(sanitized.sanitized.quick_replies[0].title.length).toBe(InstagramLimits.QUICK_REPLY_TITLE_MAX_LENGTH);
    });

    it('should handle quick reply payload at exact limit (1000 chars)', () => {
      const exactLimitPayload = 'A'.repeat(InstagramLimits.QUICK_REPLY_PAYLOAD_MAX_LENGTH);
      const input = {
        text: 'Choose option',
        quick_replies: [{ title: 'OK', payload: exactLimitPayload }],
      };

      const sanitized = sanitizationService.sanitizeInstagramQuickReply(input);

      expect(sanitized.isValid).toBe(true);
      expect(sanitized.sanitized.quick_replies[0].payload).toBe(exactLimitPayload);
      expect(sanitized.sanitized.quick_replies[0].payload.length).toBe(InstagramLimits.QUICK_REPLY_PAYLOAD_MAX_LENGTH);
    });

    it('should validate HTTPS URLs strictly', () => {
      const testUrls = [
        'https://example.com', // Valid
        'http://example.com',  // Invalid (not HTTPS)
        'ftp://example.com',   // Invalid (not HTTPS)
        'https://example.com/path?query=1', // Valid (HTTPS with path/query)
        'HTTPS://EXAMPLE.COM', // Valid (case insensitive)
        'https://',            // Invalid (incomplete)
        'not-a-url',          // Invalid (not URL)
      ];

      testUrls.forEach((url, index) => {
        const input = {
          text: 'Visit site',
          buttons: [{ type: 'web_url', title: 'Site', url }],
        };

        const sanitized = sanitizationService.sanitizeInstagramButtonTemplate(input);

        if (url.toLowerCase().startsWith('https://') && url.length > 8) {
          expect(sanitized.sanitized.buttons).toHaveLength(1);
          expect(sanitized.sanitized.buttons[0].url).toBe(url);
        } else {
          expect(sanitized.sanitized.buttons).toHaveLength(0);
        }
      });
    });

    it('should handle mixed button types correctly', () => {
      const input = {
        text: 'Choose action',
        buttons: [
          { type: 'postback', title: 'Action 1', payload: 'action1' },
          { type: 'web_url', title: 'Site', url: 'https://example.com' },
          { type: 'postback', title: 'Action 2', payload: 'action2' },
          { type: 'web_url', title: 'Invalid', url: 'http://example.com' }, // Should be removed
        ],
      };

      const sanitized = sanitizationService.sanitizeInstagramButtonTemplate(input);

      expect(sanitized.isValid).toBe(true);
      expect(sanitized.sanitized.buttons).toHaveLength(3); // 3 valid buttons (1 invalid removed)
      expect(sanitized.sanitized.buttons.filter(b => b.type === 'postback')).toHaveLength(2);
      expect(sanitized.sanitized.buttons.filter(b => b.type === 'web_url')).toHaveLength(1);
    });
  });

  describe('Cross-Channel Consistency Tests', () => {
    it('should maintain consistent button title uniqueness across channels', () => {
      const duplicateTitles = [
        { title: 'Rastrear', id: 'track1' },
        { title: 'RASTREAR', id: 'track2' },
        { title: 'rastrear', id: 'track3' },
        { title: 'Cancelar', id: 'cancel' },
      ];

      // Test WhatsApp
      const whatsappInput = {
        body: 'Choose option',
        buttons: duplicateTitles,
      };
      const whatsappSanitized = sanitizationService.sanitizeWhatsAppMessage(whatsappInput);

      // Test Instagram Quick Reply
      const instagramQRInput = {
        text: 'Choose option',
        quick_replies: duplicateTitles.map(b => ({ title: b.title, payload: b.id })),
      };
      const instagramQRSanitized = sanitizationService.sanitizeInstagramQuickReply(instagramQRInput);

      // Test Instagram Button Template
      const instagramBTInput = {
        text: 'Choose option',
        buttons: duplicateTitles.map(b => ({ type: 'postback', title: b.title, payload: b.id })),
      };
      const instagramBTSanitized = sanitizationService.sanitizeInstagramButtonTemplate(instagramBTInput);

      // All should have same number of unique titles
      expect(whatsappSanitized.sanitized.buttons).toHaveLength(2);
      expect(instagramQRSanitized.sanitized.quick_replies).toHaveLength(2);
      expect(instagramBTSanitized.sanitized.buttons).toHaveLength(2);
    });

    it('should handle text truncation consistently across channels', () => {
      const longText = 'A'.repeat(2000); // Longer than any channel limit

      // WhatsApp (1024 limit)
      const whatsappInput = { body: longText, buttons: [{ title: 'OK', id: 'ok' }] };
      const whatsappSanitized = sanitizationService.sanitizeWhatsAppMessage(whatsappInput);

      // Instagram Quick Reply (1000 limit)
      const instagramQRInput = { text: longText, quick_replies: [{ title: 'OK', payload: 'ok' }] };
      const instagramQRSanitized = sanitizationService.sanitizeInstagramQuickReply(instagramQRInput);

      // Instagram Button Template (640 limit)
      const instagramBTInput = { text: longText, buttons: [{ type: 'postback', title: 'OK', payload: 'ok' }] };
      const instagramBTSanitized = sanitizationService.sanitizeInstagramButtonTemplate(instagramBTInput);

      // All should be truncated to their respective limits
      expect(whatsappSanitized.sanitized.body.length).toBeLessThanOrEqual(1024);
      expect(instagramQRSanitized.sanitized.text.length).toBeLessThanOrEqual(1000);
      expect(instagramBTSanitized.sanitized.text.length).toBeLessThanOrEqual(640);

      // All should end with ellipsis
      expect(whatsappSanitized.sanitized.body).toMatch(/\.\.\.$|…$/);
      expect(instagramQRSanitized.sanitized.text).toMatch(/\.\.\.$|…$/);
      expect(instagramBTSanitized.sanitized.text).toMatch(/\.\.\.$|…$/);
    });
  });

  describe('Stress Tests', () => {
    it('should handle extremely large inputs gracefully', () => {
      const extremeInput = {
        body: 'A'.repeat(100000), // 100KB text
        header: 'B'.repeat(1000),
        footer: 'C'.repeat(1000),
        buttons: Array.from({ length: 100 }, (_, i) => ({
          title: `Button ${i}`.repeat(10),
          id: `btn${i}`.repeat(50),
        })),
      };

      const sanitized = sanitizationService.sanitizeWhatsAppMessage(extremeInput);

      expect(sanitized.isValid).toBe(true);
      expect(sanitized.sanitized.body.length).toBeLessThanOrEqual(WhatsAppLimits.BODY_MAX_LENGTH);
      expect(sanitized.sanitized.buttons.length).toBeLessThanOrEqual(WhatsAppLimits.BUTTONS_MAX_COUNT);
    });

    it('should handle rapid successive sanitization calls', () => {
      const inputs = Array.from({ length: 1000 }, (_, i) => ({
        body: `Message ${i}`,
        buttons: [{ title: `Button ${i}`, id: `btn${i}` }],
      }));

      const results = inputs.map(input => sanitizationService.sanitizeWhatsAppMessage(input));

      expect(results).toHaveLength(1000);
      expect(results.every(r => r.isValid)).toBe(true);
    });

    it('should handle malformed Unicode gracefully', () => {
      const malformedInputs = [
        { body: '\uD800\uD800', buttons: [{ title: 'OK', id: 'ok' }] }, // Invalid surrogate pairs
        { body: '\uDFFF\uDFFF', buttons: [{ title: 'OK', id: 'ok' }] }, // Invalid surrogate pairs
        { body: 'Test\u0000Null', buttons: [{ title: 'OK', id: 'ok' }] }, // Null character
        { body: 'Test\uFFFEBOM', buttons: [{ title: 'OK', id: 'ok' }] }, // BOM character
      ];

      malformedInputs.forEach((input, index) => {
        const sanitized = sanitizationService.sanitizeWhatsAppMessage(input);
        expect(sanitized.isValid).toBe(true); // Should handle gracefully
      });
    });
  });
});