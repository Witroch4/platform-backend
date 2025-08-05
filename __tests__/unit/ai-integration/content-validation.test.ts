/**
 * Tests for content validation utilities
 * Requirements: 9.1, 9.2, 9.3, 9.4
 */

import {
  validateAndSanitizeText,
  createFallbackText,
  validateButtonTitle,
  validateWebUrl,
  createSafeFallback
} from '../../../lib/ai-integration/utils/content-validation';

describe('Content Validation Utilities', () => {
  describe('validateAndSanitizeText', () => {
    it('should validate and sanitize normal text', () => {
      const result = validateAndSanitizeText('Hello   world\u200B', {
        maxLength: 100
      });

      expect(result.isValid).toBe(true);
      expect(result.sanitized).toBe('Hello world');
      expect(result.truncated).toBe(false);
      expect(result.errors).toEqual([]);
    });

    it('should truncate text exceeding max length', () => {
      const longText = 'This is a very long text that exceeds the maximum length limit';
      const result = validateAndSanitizeText(longText, {
        maxLength: 20,
        preserveWordBoundaries: true
      });

      expect(result.isValid).toBe(true);
      expect(result.sanitized.length).toBeLessThanOrEqual(20);
      expect(result.truncated).toBe(true);
      expect(result.warnings).toContain(expect.stringContaining('Text truncated'));
    });

    it('should preserve word boundaries when truncating', () => {
      const text = 'This is a test message';
      const result = validateAndSanitizeText(text, {
        maxLength: 10,
        preserveWordBoundaries: true
      });

      expect(result.sanitized).toBe('This is a');
      expect(result.truncated).toBe(true);
    });

    it('should reject markdown when not allowed', () => {
      const textWithMarkdown = 'Hello **bold** text and *italic* text';
      const result = validateAndSanitizeText(textWithMarkdown, {
        maxLength: 100,
        allowMarkdown: false
      });

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Markdown formatting is not allowed');
    });

    it('should reject HTML when not allowed', () => {
      const textWithHtml = 'Hello <b>bold</b> text';
      const result = validateAndSanitizeText(textWithHtml, {
        maxLength: 100,
        allowHtml: false
      });

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('HTML content is not allowed');
    });

    it('should validate HTTPS URLs when required', () => {
      const textWithUrl = 'Visit http://example.com for more info';
      const result = validateAndSanitizeText(textWithUrl, {
        maxLength: 100,
        requireHttps: true
      });

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain(expect.stringContaining('URL must use HTTPS'));
    });

    it('should validate domain allowlist', () => {
      const textWithUrl = 'Visit https://malicious.com for more info';
      const result = validateAndSanitizeText(textWithUrl, {
        maxLength: 100,
        allowedDomains: ['example.com', 'trusted.org']
      });

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain(expect.stringContaining('URL domain not allowed'));
    });

    it('should allow valid HTTPS URLs from allowed domains', () => {
      const textWithUrl = 'Visit https://example.com for more info';
      const result = validateAndSanitizeText(textWithUrl, {
        maxLength: 100,
        requireHttps: true,
        allowedDomains: ['example.com']
      });

      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });
  });

  describe('createFallbackText', () => {
    it('should create fallback text for invalid buttons', () => {
      const fallback = createFallbackText({}, 'invalid_buttons');
      expect(fallback).toContain('não foi possível exibir as opções');
      expect(fallback).toContain('ajuda');
    });

    it('should create fallback text for URL validation failure', () => {
      const fallback = createFallbackText({}, 'url_validation_failed');
      expect(fallback).toContain('links não puderam ser exibidos');
      expect(fallback).toContain('segurança');
    });

    it('should create fallback text for content too long', () => {
      const fallback = createFallbackText({}, 'content_too_long');
      expect(fallback).toContain('mensagem foi simplificada');
    });

    it('should create default fallback text for unknown reasons', () => {
      const fallback = createFallbackText({}, 'unknown_reason');
      expect(fallback).toContain('Ocorreu um problema');
      expect(fallback).toContain('ajuda');
    });
  });

  describe('validateButtonTitle', () => {
    it('should validate normal button title', () => {
      const result = validateButtonTitle('Confirmar', 20);
      
      expect(result.isValid).toBe(true);
      expect(result.sanitized).toBe('Confirmar');
      expect(result.truncated).toBe(false);
    });

    it('should normalize accents and apply title case', () => {
      const result = validateButtonTitle('configuração', 20);
      
      expect(result.isValid).toBe(true);
      expect(result.sanitized).toBe('Configuracao');
    });

    it('should truncate long titles', () => {
      const longTitle = 'This is a very long button title';
      const result = validateButtonTitle(longTitle, 20);
      
      expect(result.isValid).toBe(true);
      expect(result.sanitized.length).toBeLessThanOrEqual(20);
      expect(result.truncated).toBe(true);
    });

    it('should reject empty titles', () => {
      const result = validateButtonTitle('', 20);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Button title cannot be empty');
    });

    it('should reject titles with HTML', () => {
      const result = validateButtonTitle('<b>Bold</b>', 20);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Button title cannot contain HTML');
    });

    it('should reject titles with markdown', () => {
      const result = validateButtonTitle('**Bold**', 20);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Button title cannot contain markdown');
    });

    it('should reject titles with invalid characters', () => {
      const result = validateButtonTitle('Title<>{}', 20);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Button title contains invalid characters');
    });

    it('should limit emojis in button titles', () => {
      const result = validateButtonTitle('Test 😀😀😀😀', 20);
      
      expect(result.isValid).toBe(true);
      expect(result.sanitized).toBe('Test 😀');
    });

    it('should handle whitespace-only titles', () => {
      const result = validateButtonTitle('   \t\n   ', 20);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Button title cannot be empty');
    });
  });

  describe('validateWebUrl', () => {
    it('should validate HTTPS URLs', () => {
      const result = validateWebUrl('https://example.com');
      
      expect(result.isValid).toBe(true);
      expect(result.sanitized).toBe('https://example.com/');
    });

    it('should add HTTPS protocol when missing', () => {
      const result = validateWebUrl('example.com');
      
      expect(result.isValid).toBe(true);
      expect(result.sanitized).toBe('https://example.com/');
      expect(result.warnings).toContain('Added HTTPS protocol to URL');
    });

    it('should reject HTTP URLs', () => {
      const result = validateWebUrl('http://example.com');
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('URL must use HTTPS protocol');
    });

    it('should validate domain allowlist', () => {
      const result = validateWebUrl('https://malicious.com', ['example.com']);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Domain malicious.com is not in the allowlist');
    });

    it('should allow subdomains of allowed domains', () => {
      const result = validateWebUrl('https://api.example.com', ['example.com']);
      
      expect(result.isValid).toBe(true);
      expect(result.sanitized).toBe('https://api.example.com/');
    });

    it('should reject empty URLs', () => {
      const result = validateWebUrl('');
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('URL is required for web buttons');
    });

    it('should reject invalid URL formats', () => {
      const result = validateWebUrl('not-a-url');
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Invalid URL format');
    });

    it('should reject URLs that are too long', () => {
      const longUrl = 'https://example.com/' + 'x'.repeat(2000);
      const result = validateWebUrl(longUrl);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('URL is too long (maximum 2000 characters)');
    });

    it('should reject localhost URLs', () => {
      const result = validateWebUrl('https://localhost:3000');
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Local URLs are not allowed');
    });

    it('should reject 127.0.0.1 URLs', () => {
      const result = validateWebUrl('https://127.0.0.1:8080');
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Local URLs are not allowed');
    });

    it('should normalize URLs', () => {
      const result = validateWebUrl('https://EXAMPLE.COM/PATH');
      
      expect(result.isValid).toBe(true);
      expect(result.sanitized).toBe('https://example.com/PATH');
    });
  });

  describe('createSafeFallback', () => {
    it('should create safe fallback for WhatsApp with invalid buttons', () => {
      const originalText = 'Choose an option from the buttons below';
      const result = createSafeFallback(originalText, 'whatsapp', 'invalid_buttons');
      
      expect(result.text).toContain(originalText);
      expect(result.text).toContain('ajuda');
      expect(result.includeHelpButton).toBe(true);
    });

    it('should create safe fallback for Instagram with URL validation error', () => {
      const originalText = 'Click the link below';
      const result = createSafeFallback(originalText, 'instagram', 'url_validation');
      
      expect(result.text).toContain(originalText);
      expect(result.text).toContain('links não puderam ser exibidos');
      expect(result.includeHelpButton).toBe(false);
    });

    it('should truncate original text if too long', () => {
      const longText = 'x'.repeat(1000);
      const result = createSafeFallback(longText, 'whatsapp', 'content_too_long');
      
      expect(result.text.length).toBeLessThanOrEqual(1024);
      expect(result.text).toContain('Mensagem simplificada');
    });

    it('should respect Instagram text limits', () => {
      const longText = 'x'.repeat(950);
      const result = createSafeFallback(longText, 'instagram', 'general_error');
      
      expect(result.text.length).toBeLessThanOrEqual(1000);
      expect(result.text).toContain('ajuda');
    });

    it('should handle empty original text', () => {
      const result = createSafeFallback('', 'whatsapp', 'general_error');
      
      expect(result.text).toContain('ajuda');
      expect(result.includeHelpButton).toBe(false);
    });

    it('should preserve word boundaries when truncating', () => {
      const text = 'This is a test message that needs to be truncated properly';
      const result = createSafeFallback(text, 'whatsapp', 'content_too_long');
      
      // Should not end with partial words
      expect(result.text).not.toMatch(/\w+$/);
    });
  });
});