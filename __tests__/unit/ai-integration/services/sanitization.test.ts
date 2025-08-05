/**
 * Unit tests for message sanitization service
 * Tests channel-specific sanitization and validation
 */

import { SanitizationService } from '@/lib/ai-integration/services/sanitization';
import { WhatsAppLimits, InstagramLimits } from '@/lib/ai-integration/constants';

describe('SanitizationService', () => {
  let sanitizationService: SanitizationService;

  beforeEach(() => {
    sanitizationService = new SanitizationService();
  });

  describe('sanitizeWhatsAppMessage', () => {
    it('should sanitize valid WhatsApp interactive message', () => {
      const input = {
        body: 'Como posso ajudar você hoje?',
        header: 'Atendimento',
        footer: 'SocialWise',
        buttons: [
          { title: 'Rastrear', id: 'track_order' },
          { title: 'Cancelar', id: 'cancel_order' },
        ],
      };

      const result = sanitizationService.sanitizeWhatsAppMessage(input);

      expect(result.isValid).toBe(true);
      expect(result.sanitized).toEqual(input);
      expect(result.errors).toEqual([]);
    });

    it('should truncate body text exceeding 1024 characters', () => {
      const longText = 'a'.repeat(1100);
      const input = {
        body: longText,
        buttons: [{ title: 'OK', id: 'ok' }],
      };

      const result = sanitizationService.sanitizeWhatsAppMessage(input);

      expect(result.isValid).toBe(true);
      expect(result.sanitized.body.length).toBeLessThanOrEqual(WhatsAppLimits.BODY_MAX_LENGTH);
      expect(result.sanitized.body).toMatch(/\.\.\.$|…$/); // Should end with ellipsis
    });

    it('should truncate header exceeding 60 characters', () => {
      const longHeader = 'a'.repeat(70);
      const input = {
        body: 'Test message',
        header: longHeader,
        buttons: [{ title: 'OK', id: 'ok' }],
      };

      const result = sanitizationService.sanitizeWhatsAppMessage(input);

      expect(result.isValid).toBe(true);
      expect(result.sanitized.header.length).toBeLessThanOrEqual(WhatsAppLimits.HEADER_MAX_LENGTH);
    });

    it('should truncate footer exceeding 60 characters', () => {
      const longFooter = 'a'.repeat(70);
      const input = {
        body: 'Test message',
        footer: longFooter,
        buttons: [{ title: 'OK', id: 'ok' }],
      };

      const result = sanitizationService.sanitizeWhatsAppMessage(input);

      expect(result.isValid).toBe(true);
      expect(result.sanitized.footer.length).toBeLessThanOrEqual(WhatsAppLimits.FOOTER_MAX_LENGTH);
    });

    it('should limit buttons to maximum of 3', () => {
      const input = {
        body: 'Choose an option',
        buttons: [
          { title: 'Option 1', id: 'opt1' },
          { title: 'Option 2', id: 'opt2' },
          { title: 'Option 3', id: 'opt3' },
          { title: 'Option 4', id: 'opt4' },
          { title: 'Option 5', id: 'opt5' },
        ],
      };

      const result = sanitizationService.sanitizeWhatsAppMessage(input);

      expect(result.isValid).toBe(true);
      expect(result.sanitized.buttons).toHaveLength(WhatsAppLimits.BUTTONS_MAX_COUNT);
    });

    it('should truncate button titles exceeding 20 characters', () => {
      const input = {
        body: 'Choose an option',
        buttons: [
          { title: 'This is a very long button title that exceeds limit', id: 'long' },
        ],
      };

      const result = sanitizationService.sanitizeWhatsAppMessage(input);

      expect(result.isValid).toBe(true);
      expect(result.sanitized.buttons[0].title.length).toBeLessThanOrEqual(
        WhatsAppLimits.BUTTON_TITLE_MAX_LENGTH
      );
    });

    it('should ensure unique button titles (case-insensitive)', () => {
      const input = {
        body: 'Choose an option',
        buttons: [
          { title: 'Rastrear', id: 'track1' },
          { title: 'RASTREAR', id: 'track2' },
          { title: 'rastrear', id: 'track3' },
          { title: 'Cancelar', id: 'cancel' },
        ],
      };

      const result = sanitizationService.sanitizeWhatsAppMessage(input);

      expect(result.isValid).toBe(true);
      expect(result.sanitized.buttons).toHaveLength(2); // Only unique titles
      expect(result.sanitized.buttons.map(b => b.title.toLowerCase())).toEqual([
        'rastrear',
        'cancelar',
      ]);
    });

    it('should add fallback button when no valid buttons remain', () => {
      const input = {
        body: 'Choose an option',
        buttons: [], // No buttons
      };

      const result = sanitizationService.sanitizeWhatsAppMessage(input);

      expect(result.isValid).toBe(true);
      expect(result.sanitized.buttons).toHaveLength(1);
      expect(result.sanitized.buttons[0].title).toBe('Falar com atendente');
      expect(result.sanitized.buttons[0].id).toBe('human_handoff');
    });

    it('should preserve word boundaries when truncating', () => {
      const input = {
        body: 'Esta é uma mensagem muito longa que precisa ser truncada mas deve preservar as palavras completas sem cortar no meio',
        buttons: [{ title: 'OK', id: 'ok' }],
      };

      const result = sanitizationService.sanitizeWhatsAppMessage(input);

      expect(result.isValid).toBe(true);
      expect(result.sanitized.body).not.toMatch(/\s\w+$/); // Should not end with partial word
    });
  });

  describe('sanitizeInstagramQuickReply', () => {
    it('should sanitize valid Instagram quick reply', () => {
      const input = {
        text: 'Como posso ajudar?',
        quick_replies: [
          { title: 'Rastrear', payload: 'track_order' },
          { title: 'Cancelar', payload: 'cancel_order' },
        ],
      };

      const result = sanitizationService.sanitizeInstagramQuickReply(input);

      expect(result.isValid).toBe(true);
      expect(result.sanitized).toEqual(input);
    });

    it('should truncate text exceeding 1000 characters', () => {
      const longText = 'a'.repeat(1100);
      const input = {
        text: longText,
        quick_replies: [{ title: 'OK', payload: 'ok' }],
      };

      const result = sanitizationService.sanitizeInstagramQuickReply(input);

      expect(result.isValid).toBe(true);
      expect(result.sanitized.text.length).toBeLessThanOrEqual(
        InstagramLimits.QUICK_REPLY_TEXT_MAX_LENGTH
      );
    });

    it('should limit quick replies to 3 for UX consistency', () => {
      const input = {
        text: 'Choose an option',
        quick_replies: Array.from({ length: 10 }, (_, i) => ({
          title: `Option ${i + 1}`,
          payload: `opt${i + 1}`,
        })),
      };

      const result = sanitizationService.sanitizeInstagramQuickReply(input);

      expect(result.isValid).toBe(true);
      expect(result.sanitized.quick_replies).toHaveLength(3); // Capped for UX
    });

    it('should ensure unique quick reply titles', () => {
      const input = {
        text: 'Choose an option',
        quick_replies: [
          { title: 'Rastrear', payload: 'track1' },
          { title: 'RASTREAR', payload: 'track2' },
          { title: 'Cancelar', payload: 'cancel' },
        ],
      };

      const result = sanitizationService.sanitizeInstagramQuickReply(input);

      expect(result.isValid).toBe(true);
      expect(result.sanitized.quick_replies).toHaveLength(2);
    });
  });

  describe('sanitizeInstagramButtonTemplate', () => {
    it('should sanitize valid Instagram button template', () => {
      const input = {
        text: 'Como posso ajudar?',
        buttons: [
          { type: 'postback', title: 'Rastrear', payload: 'track_order' },
          { type: 'web_url', title: 'Site', url: 'https://example.com' },
        ],
      };

      const result = sanitizationService.sanitizeInstagramButtonTemplate(input);

      expect(result.isValid).toBe(true);
      expect(result.sanitized).toEqual(input);
    });

    it('should truncate text exceeding 640 characters', () => {
      const longText = 'a'.repeat(700);
      const input = {
        text: longText,
        buttons: [{ type: 'postback', title: 'OK', payload: 'ok' }],
      };

      const result = sanitizationService.sanitizeInstagramButtonTemplate(input);

      expect(result.isValid).toBe(true);
      expect(result.sanitized.text.length).toBeLessThanOrEqual(
        InstagramLimits.BUTTON_TEMPLATE_TEXT_MAX_LENGTH
      );
    });

    it('should validate HTTPS URLs for web_url buttons', () => {
      const input = {
        text: 'Visit our site',
        buttons: [
          { type: 'web_url', title: 'Site', url: 'http://example.com' }, // HTTP not allowed
          { type: 'web_url', title: 'Secure', url: 'https://example.com' }, // HTTPS allowed
        ],
      };

      const result = sanitizationService.sanitizeInstagramButtonTemplate(input);

      expect(result.isValid).toBe(true);
      expect(result.sanitized.buttons).toHaveLength(1); // Only HTTPS button remains
      expect(result.sanitized.buttons[0].url).toBe('https://example.com');
    });

    it('should limit buttons to maximum of 3', () => {
      const input = {
        text: 'Choose an option',
        buttons: [
          { type: 'postback', title: 'Option 1', payload: 'opt1' },
          { type: 'postback', title: 'Option 2', payload: 'opt2' },
          { type: 'postback', title: 'Option 3', payload: 'opt3' },
          { type: 'postback', title: 'Option 4', payload: 'opt4' },
        ],
      };

      const result = sanitizationService.sanitizeInstagramButtonTemplate(input);

      expect(result.isValid).toBe(true);
      expect(result.sanitized.buttons).toHaveLength(InstagramLimits.BUTTON_TEMPLATE_BUTTONS_MAX_COUNT);
    });
  });

  describe('normalizeText', () => {
    it('should normalize text with proper trimming and NFkc normalization', () => {
      const input = '  Olá, como está?  \n\t';
      const result = sanitizationService.normalizeText(input);

      expect(result).toBe('Olá, como está?');
    });

    it('should handle empty and whitespace-only strings', () => {
      expect(sanitizationService.normalizeText('')).toBe('');
      expect(sanitizationService.normalizeText('   ')).toBe('');
      expect(sanitizationService.normalizeText('\n\t')).toBe('');
    });

    it('should normalize Unicode characters', () => {
      const input = 'café'; // With combining characters
      const result = sanitizationService.normalizeText(input);

      expect(result).toBe('café'); // Normalized form
    });
  });

  describe('truncatePreservingWords', () => {
    it('should truncate at word boundaries', () => {
      const text = 'Esta é uma mensagem muito longa que precisa ser truncada';
      const result = sanitizationService.truncatePreservingWords(text, 30);

      expect(result.length).toBeLessThanOrEqual(30);
      expect(result).not.toMatch(/\s\w+$/); // Should not end with partial word
      expect(result).toMatch(/\.\.\.$|…$/); // Should end with ellipsis
    });

    it('should return original text if under limit', () => {
      const text = 'Short message';
      const result = sanitizationService.truncatePreservingWords(text, 100);

      expect(result).toBe(text);
    });

    it('should handle single word longer than limit', () => {
      const text = 'supercalifragilisticexpialidocious';
      const result = sanitizationService.truncatePreservingWords(text, 20);

      expect(result.length).toBeLessThanOrEqual(20);
      expect(result).toMatch(/\.\.\.$|…$/);
    });
  });
});