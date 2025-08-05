/**
 * Tests for locale normalization utilities
 * Requirements: 9.1
 */

import {
  PORTUGUESE_BUTTON_TITLES,
  normalizePortugueseAccents,
  applyPortugueseTitleCase,
  normalizePortugueseButtonTitle,
  getSuggestedPortugueseButtonTitles,
  validatePortugueseButtonTitle,
  PORTUGUESE_ABBREVIATIONS,
  expandPortugueseAbbreviations,
  normalizeButtonTitleForLocale,
  getLocaleFallbackButtons
} from '../../../lib/ai-integration/utils/locale-normalization';

describe('Locale Normalization Utilities', () => {
  describe('normalizePortugueseAccents', () => {
    it('should remove Portuguese accents', () => {
      expect(normalizePortugueseAccents('ação')).toBe('acao');
      expect(normalizePortugueseAccents('configuração')).toBe('configuracao');
      expect(normalizePortugueseAccents('opção')).toBe('opcao');
      expect(normalizePortugueseAccents('informações')).toBe('informacoes');
      expect(normalizePortugueseAccents('promoção')).toBe('promocao');
    });

    it('should handle uppercase accents', () => {
      expect(normalizePortugueseAccents('AÇÃO')).toBe('ACAO');
      expect(normalizePortugueseAccents('CONFIGURAÇÃO')).toBe('CONFIGURACAO');
    });

    it('should handle mixed case', () => {
      expect(normalizePortugueseAccents('Configuração')).toBe('Configuracao');
      expect(normalizePortugueseAccents('InformaÇÕes')).toBe('InformaCOes');
    });

    it('should handle text without accents', () => {
      expect(normalizePortugueseAccents('hello')).toBe('hello');
      expect(normalizePortugueseAccents('test')).toBe('test');
    });

    it('should handle empty string', () => {
      expect(normalizePortugueseAccents('')).toBe('');
    });

    it('should handle cedilla', () => {
      expect(normalizePortugueseAccents('preço')).toBe('preco');
      expect(normalizePortugueseAccents('Preço')).toBe('Preco');
    });

    it('should handle tilde', () => {
      expect(normalizePortugueseAccents('não')).toBe('nao');
      expect(normalizePortugueseAccents('informações')).toBe('informacoes');
    });
  });

  describe('applyPortugueseTitleCase', () => {
    it('should apply title case to known Portuguese button titles', () => {
      expect(applyPortugueseTitleCase('rastrear')).toBe('Rastrear');
      expect(applyPortugueseTitleCase('PAGAMENTO')).toBe('Pagamento');
      expect(applyPortugueseTitleCase('configuração')).toBe('Configuração');
      expect(applyPortugueseTitleCase('INFORMAÇÕES')).toBe('Informações');
    });

    it('should handle unknown titles with standard title case', () => {
      expect(applyPortugueseTitleCase('unknown')).toBe('Unknown');
      expect(applyPortugueseTitleCase('CUSTOM')).toBe('Custom');
    });

    it('should handle empty string', () => {
      expect(applyPortugueseTitleCase('')).toBe('');
    });

    it('should handle single character', () => {
      expect(applyPortugueseTitleCase('a')).toBe('A');
    });

    it('should normalize accents before lookup', () => {
      expect(applyPortugueseTitleCase('configuração')).toBe('Configuração');
      expect(applyPortugueseTitleCase('CONFIGURAÇÃO')).toBe('Configuração');
    });
  });

  describe('normalizePortugueseButtonTitle', () => {
    it('should normalize Portuguese button titles', () => {
      expect(normalizePortugueseButtonTitle('  rastrear  ')).toBe('Rastrear');
      expect(normalizePortugueseButtonTitle('PAGAMENTO')).toBe('Pagamento');
      expect(normalizePortugueseButtonTitle('configuração')).toBe('Configuração');
    });

    it('should remove invisible characters', () => {
      expect(normalizePortugueseButtonTitle('rastrear\u200B')).toBe('Rastrear');
      expect(normalizePortugueseButtonTitle('\u200Cpagamento\u200D')).toBe('Pagamento');
    });

    it('should collapse multiple spaces', () => {
      expect(normalizePortugueseButtonTitle('meu   pedido')).toBe('Meu pedido');
    });

    it('should handle empty string', () => {
      expect(normalizePortugueseButtonTitle('')).toBe('');
    });

    it('should handle whitespace-only string', () => {
      expect(normalizePortugueseButtonTitle('   ')).toBe('');
    });
  });

  describe('getSuggestedPortugueseButtonTitles', () => {
    it('should suggest order-related buttons for order context', () => {
      const suggestions = getSuggestedPortugueseButtonTitles('Sobre meu pedido');
      expect(suggestions).toContain('Rastrear');
      expect(suggestions).toContain('Cancelar');
      expect(suggestions).toContain('Detalhes');
    });

    it('should suggest payment-related buttons for payment context', () => {
      const suggestions = getSuggestedPortugueseButtonTitles('Problema com pagamento');
      expect(suggestions).toContain('Pagamento');
      expect(suggestions).toContain('Confirmar');
      expect(suggestions).toContain('Cancelar');
    });

    it('should suggest help-related buttons for support context', () => {
      const suggestions = getSuggestedPortugueseButtonTitles('Preciso de ajuda');
      expect(suggestions).toContain('Ajuda');
      expect(suggestions).toContain('Contato');
      expect(suggestions).toContain('Suporte');
    });

    it('should suggest product-related buttons for product context', () => {
      const suggestions = getSuggestedPortugueseButtonTitles('Informações do produto');
      expect(suggestions).toContain('Detalhes');
      expect(suggestions).toContain('Comprar');
      expect(suggestions).toContain('Catálogo');
    });

    it('should suggest service-related buttons for service context', () => {
      const suggestions = getSuggestedPortugueseButtonTitles('Agendar serviço');
      expect(suggestions).toContain('Agendar');
      expect(suggestions).toContain('Horários');
      expect(suggestions).toContain('Contato');
    });

    it('should suggest location-related buttons for location context', () => {
      const suggestions = getSuggestedPortugueseButtonTitles('Onde fica a loja');
      expect(suggestions).toContain('Localização');
      expect(suggestions).toContain('Endereço');
      expect(suggestions).toContain('Contato');
    });

    it('should provide default suggestions for unknown context', () => {
      const suggestions = getSuggestedPortugueseButtonTitles('Random text');
      expect(suggestions).toContain('Ajuda');
      expect(suggestions).toContain('Contato');
      expect(suggestions).toContain('Informações');
    });

    it('should limit suggestions to 3 items', () => {
      const suggestions = getSuggestedPortugueseButtonTitles('pedido pagamento ajuda produto');
      expect(suggestions).toHaveLength(3);
    });
  });

  describe('validatePortugueseButtonTitle', () => {
    it('should validate correct Portuguese button titles', () => {
      const result = validatePortugueseButtonTitle('Rastrear');
      expect(result.isValid).toBe(true);
      expect(result.normalized).toBe('Rastrear');
      expect(result.issues).toHaveLength(0);
    });

    it('should normalize and validate titles', () => {
      const result = validatePortugueseButtonTitle('  rastrear  ');
      expect(result.isValid).toBe(true);
      expect(result.normalized).toBe('Rastrear');
    });

    it('should reject empty titles', () => {
      const result = validatePortugueseButtonTitle('');
      expect(result.isValid).toBe(false);
      expect(result.issues).toContain('Button title is empty');
      expect(result.suggestions).toContain('Ajuda');
    });

    it('should reject titles that are too long', () => {
      const longTitle = 'This is a very long button title that exceeds the limit';
      const result = validatePortugueseButtonTitle(longTitle);
      expect(result.isValid).toBe(false);
      expect(result.issues.some(issue => issue.includes('too long'))).toBe(true);
    });

    it('should reject titles that are too short', () => {
      const result = validatePortugueseButtonTitle('A');
      expect(result.isValid).toBe(false);
      expect(result.issues).toContain('Title too short (minimum 2 characters)');
    });

    it('should reject titles with invalid characters', () => {
      const result = validatePortugueseButtonTitle('Test<>{}');
      expect(result.isValid).toBe(false);
      expect(result.issues).toContain('Contains invalid characters');
    });

    it('should warn about all caps titles', () => {
      const result = validatePortugueseButtonTitle('RASTREAR');
      expect(result.isValid).toBe(false);
      expect(result.issues).toContain('Should use title case instead of all caps');
    });

    it('should warn about all lowercase titles', () => {
      const result = validatePortugueseButtonTitle('rastrear');
      expect(result.isValid).toBe(false);
      expect(result.issues).toContain('Should use title case instead of all lowercase');
    });

    it('should provide context-aware suggestions', () => {
      const result = validatePortugueseButtonTitle('pedido');
      expect(result.suggestions).toContain('Rastrear');
    });
  });

  describe('expandPortugueseAbbreviations', () => {
    it('should expand common Portuguese abbreviations', () => {
      expect(expandPortugueseAbbreviations('info')).toBe('Informações');
      expect(expandPortugueseAbbreviations('config')).toBe('Configuração');
      expect(expandPortugueseAbbreviations('tel')).toBe('Telefone');
      expect(expandPortugueseAbbreviations('prod')).toBe('Produto');
    });

    it('should handle mixed case abbreviations', () => {
      expect(expandPortugueseAbbreviations('INFO')).toBe('Informações');
      expect(expandPortugueseAbbreviations('Config')).toBe('Configuração');
    });

    it('should only expand whole word abbreviations', () => {
      expect(expandPortugueseAbbreviations('information')).toBe('Information');
      expect(expandPortugueseAbbreviations('config-test')).toBe('Configuração-test');
    });

    it('should handle multiple abbreviations', () => {
      expect(expandPortugueseAbbreviations('info prod')).toBe('Informações produto');
    });

    it('should handle text without abbreviations', () => {
      expect(expandPortugueseAbbreviations('rastrear')).toBe('Rastrear');
    });

    it('should handle empty string', () => {
      expect(expandPortugueseAbbreviations('')).toBe('');
    });
  });

  describe('normalizeButtonTitleForLocale', () => {
    it('should normalize Portuguese titles', () => {
      expect(normalizeButtonTitleForLocale('rastrear', 'pt-BR')).toBe('Rastrear');
      expect(normalizeButtonTitleForLocale('configuração', 'pt')).toBe('Configuração');
    });

    it('should normalize English titles', () => {
      expect(normalizeButtonTitleForLocale('track order', 'en')).toBe('Track order');
      expect(normalizeButtonTitleForLocale('HELP', 'en-US')).toBe('Help');
    });

    it('should normalize Spanish titles', () => {
      expect(normalizeButtonTitleForLocale('configuración', 'es')).toBe('Configuracion');
      expect(normalizeButtonTitleForLocale('AYUDA', 'es-ES')).toBe('Ayuda');
    });

    it('should use default normalization for unknown locales', () => {
      expect(normalizeButtonTitleForLocale('test', 'fr')).toBe('Test');
      expect(normalizeButtonTitleForLocale('HELLO', 'de')).toBe('Hello');
    });

    it('should default to pt-BR when no locale specified', () => {
      expect(normalizeButtonTitleForLocale('rastrear')).toBe('Rastrear');
    });

    it('should handle empty string', () => {
      expect(normalizeButtonTitleForLocale('', 'pt-BR')).toBe('');
    });
  });

  describe('getLocaleFallbackButtons', () => {
    it('should return Portuguese fallback buttons', () => {
      const fallbacks = getLocaleFallbackButtons('pt-BR');
      expect(fallbacks.help).toBe('Ajuda');
      expect(fallbacks.contact).toBe('Contato');
      expect(fallbacks.info).toBe('Informações');
    });

    it('should return English fallback buttons', () => {
      const fallbacks = getLocaleFallbackButtons('en');
      expect(fallbacks.help).toBe('Help');
      expect(fallbacks.contact).toBe('Contact');
      expect(fallbacks.info).toBe('Information');
    });

    it('should return Spanish fallback buttons', () => {
      const fallbacks = getLocaleFallbackButtons('es');
      expect(fallbacks.help).toBe('Ayuda');
      expect(fallbacks.contact).toBe('Contacto');
      expect(fallbacks.info).toBe('Información');
    });

    it('should return default English buttons for unknown locales', () => {
      const fallbacks = getLocaleFallbackButtons('fr');
      expect(fallbacks.help).toBe('Help');
      expect(fallbacks.contact).toBe('Contact');
      expect(fallbacks.info).toBe('Info');
    });

    it('should default to pt-BR when no locale specified', () => {
      const fallbacks = getLocaleFallbackButtons();
      expect(fallbacks.help).toBe('Ajuda');
      expect(fallbacks.contact).toBe('Contato');
      expect(fallbacks.info).toBe('Informações');
    });

    it('should handle case-insensitive locale matching', () => {
      const fallbacks1 = getLocaleFallbackButtons('PT-BR');
      const fallbacks2 = getLocaleFallbackButtons('pt-br');
      expect(fallbacks1).toEqual(fallbacks2);
    });
  });

  describe('PORTUGUESE_BUTTON_TITLES', () => {
    it('should contain common Portuguese button titles', () => {
      expect(PORTUGUESE_BUTTON_TITLES['rastrear']).toBe('Rastrear');
      expect(PORTUGUESE_BUTTON_TITLES['pagamento']).toBe('Pagamento');
      expect(PORTUGUESE_BUTTON_TITLES['configuracao']).toBe('Configuração');
      expect(PORTUGUESE_BUTTON_TITLES['informacoes']).toBe('Informações');
    });

    it('should have consistent capitalization', () => {
      Object.values(PORTUGUESE_BUTTON_TITLES).forEach(title => {
        expect(title.charAt(0)).toBe(title.charAt(0).toUpperCase());
      });
    });
  });

  describe('PORTUGUESE_ABBREVIATIONS', () => {
    it('should contain common Portuguese abbreviations', () => {
      expect(PORTUGUESE_ABBREVIATIONS['info']).toBe('Informações');
      expect(PORTUGUESE_ABBREVIATIONS['config']).toBe('Configuração');
      expect(PORTUGUESE_ABBREVIATIONS['tel']).toBe('Telefone');
      expect(PORTUGUESE_ABBREVIATIONS['prod']).toBe('Produto');
    });

    it('should have consistent capitalization in expansions', () => {
      Object.values(PORTUGUESE_ABBREVIATIONS).forEach(expansion => {
        expect(expansion.charAt(0)).toBe(expansion.charAt(0).toUpperCase());
      });
    });
  });
});