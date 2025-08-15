/**
 * Unit tests for SocialWise Flow clamps and validation utilities
 */

import {
  clampTitle,
  clampBody,
  validatePayload,
  sanitizePayload,
  validateIntentExists,
  validateButton,
  clampButton,
  CHANNEL_LIMITS
} from '@/lib/socialwise-flow/clamps';

describe('SocialWise Flow Clamps', () => {
  describe('clampTitle', () => {
    it('should clamp title to 4 words and 20 characters by default', () => {
      const longTitle = 'Este é um título muito longo com muitas palavras';
      const result = clampTitle(longTitle);
      
      expect(result.split(' ')).toHaveLength(4);
      expect(result.length).toBeLessThanOrEqual(20);
    });

    it('should preserve short titles unchanged', () => {
      const shortTitle = 'Recorrer Multa';
      const result = clampTitle(shortTitle);
      
      expect(result).toBe(shortTitle);
    });

    it('should handle empty and null inputs', () => {
      expect(clampTitle('')).toBe('');
      expect(clampTitle(null as any)).toBe('');
      expect(clampTitle(undefined as any)).toBe('');
    });

    it('should clamp at word boundaries when possible', () => {
      const title = 'Recorrer Multa de Trânsito Administrativa';
      const result = clampTitle(title, 4, 20);
      
      // Should not cut words in the middle
      expect(result).not.toContain('Administrat');
      expect(result.length).toBeLessThanOrEqual(20);
      // Should clamp at word boundary, so may have fewer than 4 words due to char limit
      expect(result.split(' ').length).toBeLessThanOrEqual(4);
    });

    it('should respect custom limits', () => {
      const title = 'Ação Judicial';
      const result = clampTitle(title, 2, 10);
      
      expect(result.split(' ').length).toBeLessThanOrEqual(2);
      expect(result.length).toBeLessThanOrEqual(10);
      // With 10 char limit, "Ação Judicial" (13 chars) should be clamped to "Ação" (4 chars)
      expect(result).toBe('Ação');
    });

    it('should normalize whitespace', () => {
      const title = '  Recorrer    Multa  ';
      const result = clampTitle(title);
      
      expect(result).toBe('Recorrer Multa');
    });
  });

  describe('clampBody', () => {
    it('should clamp WhatsApp body to 1024 characters', () => {
      const longText = 'A'.repeat(1500);
      const result = clampBody(longText, 'whatsapp');
      
      expect(result.length).toBeLessThanOrEqual(1024);
    });

    it('should clamp Instagram body to 640 characters', () => {
      const longText = 'A'.repeat(1000);
      const result = clampBody(longText, 'instagram');
      
      expect(result.length).toBeLessThanOrEqual(640);
    });

    it('should preserve short text unchanged', () => {
      const shortText = 'Posso ajudar com sua questão jurídica.';
      const result = clampBody(shortText, 'whatsapp');
      
      expect(result).toBe(shortText);
    });

    it('should clamp at word boundaries when possible', () => {
      const text = 'Este é um texto longo que precisa ser cortado em uma palavra completa para manter a legibilidade do conteúdo.';
      const result = clampBody(text, 'instagram');
      
      // Should not end with a partial word
      expect(result).not.toMatch(/\w+$/);
    });

    it('should default to WhatsApp limits', () => {
      const longText = 'A'.repeat(1500);
      const result = clampBody(longText);
      
      expect(result.length).toBeLessThanOrEqual(1024);
    });
  });

  describe('validatePayload', () => {
    it('should validate correct payload format', () => {
      expect(validatePayload('@recurso_multa_transito')).toBe(true);
      expect(validatePayload('@consulta_juridica')).toBe(true);
      expect(validatePayload('@acao123')).toBe(true);
    });

    it('should reject invalid payload formats', () => {
      expect(validatePayload('recurso_multa')).toBe(false);
      expect(validatePayload('@recurso-multa')).toBe(false);
      expect(validatePayload('@recurso multa')).toBe(false);
      expect(validatePayload('@RECURSO_MULTA')).toBe(false);
      expect(validatePayload('')).toBe(false);
    });
  });

  describe('sanitizePayload', () => {
    it('should sanitize invalid payloads to correct format', () => {
      expect(sanitizePayload('recurso multa')).toBe('@recurso_multa');
      expect(sanitizePayload('RECURSO-MULTA')).toBe('@recurso_multa');
      expect(sanitizePayload('@recurso@multa')).toBe('@recurso_multa');
    });

    it('should preserve valid payloads', () => {
      expect(sanitizePayload('@recurso_multa')).toBe('@recurso_multa');
    });

    it('should handle empty inputs', () => {
      expect(sanitizePayload('')).toBe('@');
      expect(sanitizePayload(null as any)).toBe('@');
    });
  });

  describe('validateIntentExists', () => {
    const intentCatalog = ['recurso_multa_transito', 'consulta_juridica', 'acao_cobranca'];

    it('should validate existing intents', () => {
      expect(validateIntentExists('@recurso_multa_transito', intentCatalog)).toBe(true);
      expect(validateIntentExists('consulta_juridica', intentCatalog)).toBe(true);
    });

    it('should reject non-existing intents', () => {
      expect(validateIntentExists('@intent_inexistente', intentCatalog)).toBe(false);
      expect(validateIntentExists('outro_intent', intentCatalog)).toBe(false);
    });
  });

  describe('validateButton', () => {
    it('should validate correct WhatsApp button', () => {
      const button = { title: 'Recorrer Multa', payload: '@recurso_multa' };
      const result = validateButton(button, 'whatsapp');
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect title length violations', () => {
      const button = { title: 'Este título é muito longo para um botão', payload: '@valid' };
      const result = validateButton(button, 'whatsapp');
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Button title exceeds 20 characters');
    });

    it('should detect invalid payload format', () => {
      const button = { title: 'Valid', payload: 'invalid-payload' };
      const result = validateButton(button, 'whatsapp');
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Button payload must match format ^@[a-z0-9_]+$');
    });

    it('should detect empty fields', () => {
      const button = { title: '', payload: '' };
      const result = validateButton(button, 'whatsapp');
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Button title cannot be empty');
      expect(result.errors).toContain('Button payload cannot be empty');
    });

    it('should validate Instagram button limits', () => {
      const longPayload = '@' + 'a'.repeat(1000);
      const button = { title: 'Valid', payload: longPayload };
      const result = validateButton(button, 'instagram');
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('instagram button payload exceeds 1000 characters');
    });
  });

  describe('clampButton', () => {
    it('should clamp button title and sanitize payload', () => {
      const button = { 
        title: 'Este título é muito longo para um botão', 
        payload: 'invalid payload format' 
      };
      const result = clampButton(button, 'whatsapp');
      
      expect(result.title.length).toBeLessThanOrEqual(20);
      expect(result.payload).toMatch(/^@[a-z0-9_]+$/);
    });

    it('should preserve valid buttons unchanged', () => {
      const button = { title: 'Recorrer Multa', payload: '@recurso_multa' };
      const result = clampButton(button, 'whatsapp');
      
      expect(result).toEqual(button);
    });

    it('should handle different channel limits', () => {
      const button = { title: 'Valid Title', payload: '@valid' };
      
      const whatsappResult = clampButton(button, 'whatsapp');
      const instagramResult = clampButton(button, 'instagram');
      const facebookResult = clampButton(button, 'facebook');
      
      expect(whatsappResult.title.length).toBeLessThanOrEqual(CHANNEL_LIMITS.whatsapp.buttonTitle);
      expect(instagramResult.title.length).toBeLessThanOrEqual(CHANNEL_LIMITS.instagram.buttonTitle);
      expect(facebookResult.title.length).toBeLessThanOrEqual(CHANNEL_LIMITS.facebook.buttonTitle);
    });
  });

  describe('CHANNEL_LIMITS', () => {
    it('should have correct WhatsApp limits', () => {
      expect(CHANNEL_LIMITS.whatsapp.buttonTitle).toBe(20);
      expect(CHANNEL_LIMITS.whatsapp.buttonId).toBe(256);
      expect(CHANNEL_LIMITS.whatsapp.bodyText).toBe(1024);
      expect(CHANNEL_LIMITS.whatsapp.maxButtons).toBe(3);
    });

    it('should have correct Instagram limits', () => {
      expect(CHANNEL_LIMITS.instagram.buttonTitle).toBe(20);
      expect(CHANNEL_LIMITS.instagram.payload).toBe(1000);
      expect(CHANNEL_LIMITS.instagram.bodyText).toBe(640);
      expect(CHANNEL_LIMITS.instagram.maxButtons).toBe(3);
    });

    it('should have correct Facebook limits', () => {
      expect(CHANNEL_LIMITS.facebook.buttonTitle).toBe(20);
      expect(CHANNEL_LIMITS.facebook.payload).toBe(1000);
      expect(CHANNEL_LIMITS.facebook.bodyText).toBe(1024);
      expect(CHANNEL_LIMITS.facebook.maxButtons).toBe(3);
    });
  });
});