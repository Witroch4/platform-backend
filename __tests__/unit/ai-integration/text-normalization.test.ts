/**
 * Tests for text normalization utilities
 * Requirements: 9.1, 9.2, 9.3, 9.4
 */

import {
  removeInvisibleCharacters,
  collapseWhitespace,
  limitConsecutiveEmojis,
  normalizeAccents,
  applyTitleCase,
  smartTruncate,
  isValidHttpsUrl,
  isDomainAllowed,
  normalizeText,
  makeUniqueTitles,
  removeDuplicateTitles
} from '../../../lib/ai-integration/utils/text-normalization';

describe('Text Normalization Utilities', () => {
  describe('removeInvisibleCharacters', () => {
    it('should remove ZWSP characters', () => {
      const text = 'Hello\u200BWorld';
      expect(removeInvisibleCharacters(text)).toBe('HelloWorld');
    });

    it('should remove ZWNJ characters', () => {
      const text = 'Hello\u200CWorld';
      expect(removeInvisibleCharacters(text)).toBe('HelloWorld');
    });

    it('should remove ZWJ characters', () => {
      const text = 'Hello\u200DWorld';
      expect(removeInvisibleCharacters(text)).toBe('HelloWorld');
    });

    it('should remove BOM characters', () => {
      const text = 'Hello\uFEFFWorld';
      expect(removeInvisibleCharacters(text)).toBe('HelloWorld');
    });

    it('should handle empty string', () => {
      expect(removeInvisibleCharacters('')).toBe('');
    });

    it('should handle null/undefined', () => {
      expect(removeInvisibleCharacters(null as any)).toBe('');
      expect(removeInvisibleCharacters(undefined as any)).toBe('');
    });
  });

  describe('collapseWhitespace', () => {
    it('should collapse multiple spaces', () => {
      const text = 'Hello    World';
      expect(collapseWhitespace(text)).toBe('Hello World');
    });

    it('should collapse mixed whitespace characters', () => {
      const text = 'Hello \t\n  World';
      expect(collapseWhitespace(text)).toBe('Hello World');
    });

    it('should trim leading and trailing whitespace', () => {
      const text = '  Hello World  ';
      expect(collapseWhitespace(text)).toBe('Hello World');
    });

    it('should handle string with only whitespace', () => {
      const text = '   \t\n   ';
      expect(collapseWhitespace(text)).toBe('');
    });

    it('should handle empty string', () => {
      expect(collapseWhitespace('')).toBe('');
    });
  });

  describe('limitConsecutiveEmojis', () => {
    it('should limit consecutive emojis to specified count', () => {
      const text = 'Hello 😀😀😀😀😀 World';
      expect(limitConsecutiveEmojis(text, 3)).toBe('Hello 😀😀😀 World');
    });

    it('should handle different emoji types', () => {
      const text = 'Test 🚀🚀🚀🚀 rockets';
      expect(limitConsecutiveEmojis(text, 2)).toBe('Test 🚀🚀 rockets');
    });

    it('should not affect non-consecutive emojis', () => {
      const text = 'Hello 😀 World 😀 Test';
      expect(limitConsecutiveEmojis(text, 2)).toBe('Hello 😀 World 😀 Test');
    });

    it('should handle zero limit', () => {
      const text = 'Hello 😀😀😀 World';
      expect(limitConsecutiveEmojis(text, 0)).toBe(text);
    });

    it('should handle negative limit', () => {
      const text = 'Hello 😀😀😀 World';
      expect(limitConsecutiveEmojis(text, -1)).toBe(text);
    });

    it('should handle text without emojis', () => {
      const text = 'Hello World';
      expect(limitConsecutiveEmojis(text, 3)).toBe('Hello World');
    });
  });

  describe('normalizeAccents', () => {
    it('should remove accents from Portuguese characters', () => {
      expect(normalizeAccents('ação')).toBe('acao');
      expect(normalizeAccents('configuração')).toBe('configuracao');
      expect(normalizeAccents('opção')).toBe('opcao');
    });

    it('should remove accents from various languages', () => {
      expect(normalizeAccents('café')).toBe('cafe');
      expect(normalizeAccents('naïve')).toBe('naive');
      expect(normalizeAccents('résumé')).toBe('resume');
    });

    it('should handle text without accents', () => {
      expect(normalizeAccents('hello')).toBe('hello');
    });

    it('should handle empty string', () => {
      expect(normalizeAccents('')).toBe('');
    });
  });

  describe('applyTitleCase', () => {
    it('should capitalize first letter and lowercase rest', () => {
      expect(applyTitleCase('hello')).toBe('Hello');
      expect(applyTitleCase('HELLO')).toBe('Hello');
      expect(applyTitleCase('hELLO')).toBe('Hello');
    });

    it('should handle single character', () => {
      expect(applyTitleCase('a')).toBe('A');
      expect(applyTitleCase('A')).toBe('A');
    });

    it('should handle empty string', () => {
      expect(applyTitleCase('')).toBe('');
    });
  });

  describe('smartTruncate', () => {
    it('should truncate at word boundary when preserveWords is true', () => {
      const text = 'This is a long sentence that needs truncation';
      const result = smartTruncate(text, 20, true);
      expect(result.length).toBeLessThanOrEqual(20);
      expect(result).toBe('This is a long');
    });

    it('should truncate at character limit when preserveWords is false', () => {
      const text = 'This is a long sentence';
      const result = smartTruncate(text, 10, false);
      expect(result).toBe('This is a ');
    });

    it('should truncate at character limit when no word boundary found', () => {
      const text = 'Thisisaverylongwordwithoutspaces';
      const result = smartTruncate(text, 10, true);
      expect(result).toBe('Thisisaver');
    });

    it('should return original text if shorter than limit', () => {
      const text = 'Short text';
      const result = smartTruncate(text, 20, true);
      expect(result).toBe('Short text');
    });

    it('should handle empty string', () => {
      expect(smartTruncate('', 10)).toBe('');
    });

    it('should truncate at character limit when word boundary is too close to beginning', () => {
      const text = 'A verylongwordthatexceedslimit';
      const result = smartTruncate(text, 20, true);
      // Should truncate at character limit since space is at position 1 (< 70% of 20)
      expect(result.length).toBe(20);
    });
  });

  describe('isValidHttpsUrl', () => {
    it('should validate HTTPS URLs', () => {
      expect(isValidHttpsUrl('https://example.com')).toBe(true);
      expect(isValidHttpsUrl('https://subdomain.example.com/path')).toBe(true);
    });

    it('should reject HTTP URLs', () => {
      expect(isValidHttpsUrl('http://example.com')).toBe(false);
    });

    it('should reject invalid URLs', () => {
      expect(isValidHttpsUrl('not-a-url')).toBe(false);
      expect(isValidHttpsUrl('ftp://example.com')).toBe(false);
    });

    it('should reject empty/null URLs', () => {
      expect(isValidHttpsUrl('')).toBe(false);
      expect(isValidHttpsUrl(null as any)).toBe(false);
    });
  });

  describe('isDomainAllowed', () => {
    const allowedDomains = ['example.com', 'trusted.org'];

    it('should allow exact domain matches', () => {
      expect(isDomainAllowed('https://example.com', allowedDomains)).toBe(true);
      expect(isDomainAllowed('https://trusted.org', allowedDomains)).toBe(true);
    });

    it('should allow subdomain matches', () => {
      expect(isDomainAllowed('https://sub.example.com', allowedDomains)).toBe(true);
      expect(isDomainAllowed('https://api.trusted.org', allowedDomains)).toBe(true);
    });

    it('should reject non-allowed domains', () => {
      expect(isDomainAllowed('https://malicious.com', allowedDomains)).toBe(false);
      expect(isDomainAllowed('https://notexample.com', allowedDomains)).toBe(false);
    });

    it('should be case insensitive', () => {
      expect(isDomainAllowed('https://EXAMPLE.COM', allowedDomains)).toBe(true);
      expect(isDomainAllowed('https://Example.Com', allowedDomains)).toBe(true);
    });

    it('should return true when no allowlist provided', () => {
      expect(isDomainAllowed('https://any.com', [])).toBe(true);
      expect(isDomainAllowed('https://any.com', null as any)).toBe(true);
    });

    it('should handle invalid URLs', () => {
      expect(isDomainAllowed('not-a-url', allowedDomains)).toBe(false);
    });
  });

  describe('normalizeText', () => {
    it('should apply all normalizations by default', () => {
      const text = 'Hello\u200B   😀😀😀😀   World\uFEFF';
      const result = normalizeText(text);
      expect(result).toBe('Hello 😀😀😀 World');
    });

    it('should apply selective normalizations based on options', () => {
      const text = 'Hello\u200B   😀😀😀😀   World\uFEFF';
      const result = normalizeText(text, {
        removeInvisible: true,
        collapseSpaces: false,
        limitEmojis: 0
      });
      expect(result).toBe('Hello   😀😀😀😀   World');
    });

    it('should apply accent normalization and title case', () => {
      const text = 'configuração';
      const result = normalizeText(text, {
        normalizeAccents: true,
        titleCase: true
      });
      expect(result).toBe('Configuracao');
    });

    it('should handle empty string', () => {
      expect(normalizeText('')).toBe('');
    });
  });

  describe('makeUniqueTitles', () => {
    it('should make duplicate titles unique by appending numbers', () => {
      const items = [
        { title: 'Option', id: '1' },
        { title: 'Option', id: '2' },
        { title: 'Different', id: '3' },
        { title: 'option', id: '4' } // Case insensitive
      ];

      const result = makeUniqueTitles(items);
      expect(result).toEqual([
        { title: 'Option', id: '1' },
        { title: 'Option 2', id: '2' },
        { title: 'Different', id: '3' },
        { title: 'option 2', id: '4' }
      ]);
    });

    it('should handle empty array', () => {
      expect(makeUniqueTitles([])).toEqual([]);
    });

    it('should handle array with unique titles', () => {
      const items = [
        { title: 'Option 1', id: '1' },
        { title: 'Option 2', id: '2' }
      ];

      const result = makeUniqueTitles(items);
      expect(result).toEqual(items);
    });
  });

  describe('removeDuplicateTitles', () => {
    it('should remove duplicate titles (case insensitive)', () => {
      const items = [
        { title: 'Option', id: '1' },
        { title: 'OPTION', id: '2' },
        { title: 'Different', id: '3' },
        { title: 'option', id: '4' }
      ];

      const result = removeDuplicateTitles(items);
      expect(result).toEqual([
        { title: 'Option', id: '1' },
        { title: 'Different', id: '3' }
      ]);
    });

    it('should preserve order of first occurrence', () => {
      const items = [
        { title: 'B', id: '1' },
        { title: 'A', id: '2' },
        { title: 'b', id: '3' },
        { title: 'C', id: '4' }
      ];

      const result = removeDuplicateTitles(items);
      expect(result).toEqual([
        { title: 'B', id: '1' },
        { title: 'A', id: '2' },
        { title: 'C', id: '4' }
      ]);
    });

    it('should handle empty array', () => {
      expect(removeDuplicateTitles([])).toEqual([]);
    });

    it('should handle array with unique titles', () => {
      const items = [
        { title: 'Option 1', id: '1' },
        { title: 'Option 2', id: '2' }
      ];

      const result = removeDuplicateTitles(items);
      expect(result).toEqual(items);
    });
  });
});