/**
 * Tests for emoji normalization utilities
 * Requirements: 9.1
 */

import {
  EMOJI_CATEGORIES,
  removeInvisibleCharacters,
  normalizeWhitespace,
  countEmojis,
  extractEmojis,
  limitConsecutiveEmojis,
  removeEmojis,
  replaceEmojisWithText,
  validateEmojiUsage,
  normalizeForChannelUX,
  getEmojiStats,
  suggestEmojiReplacements
} from '../../../lib/ai-integration/utils/emoji-normalization';

describe('Emoji Normalization Utilities', () => {
  describe('removeInvisibleCharacters', () => {
    it('should remove zero-width spaces', () => {
      const text = 'Hello\u200BWorld\u200C\u200D';
      expect(removeInvisibleCharacters(text)).toBe('HelloWorld');
    });

    it('should remove byte order mark', () => {
      const text = 'Hello\uFEFFWorld';
      expect(removeInvisibleCharacters(text)).toBe('HelloWorld');
    });

    it('should remove various invisible characters', () => {
      const text = 'Hello\u00AD\u034F\u061C\u180EWorld';
      expect(removeInvisibleCharacters(text)).toBe('HelloWorld');
    });

    it('should handle text without invisible characters', () => {
      const text = 'Hello World';
      expect(removeInvisibleCharacters(text)).toBe('Hello World');
    });

    it('should handle empty string', () => {
      expect(removeInvisibleCharacters('')).toBe('');
    });

    it('should preserve normal characters', () => {
      const text = 'Hello 123 !@# World';
      expect(removeInvisibleCharacters(text)).toBe('Hello 123 !@# World');
    });
  });

  describe('normalizeWhitespace', () => {
    it('should collapse multiple spaces by default', () => {
      const text = 'Hello    World';
      expect(normalizeWhitespace(text)).toBe('Hello World');
    });

    it('should trim ends by default', () => {
      const text = '  Hello World  ';
      expect(normalizeWhitespace(text)).toBe('Hello World');
    });

    it('should replace various whitespace characters', () => {
      const text = 'Hello\tWorld\fTest\vMore';
      expect(normalizeWhitespace(text)).toBe('Hello World Test More');
    });

    it('should preserve line breaks when requested', () => {
      const text = 'Hello\nWorld\n\nTest';
      const result = normalizeWhitespace(text, { preserveLineBreaks: true });
      expect(result).toBe('Hello\nWorld\n\nTest');
    });

    it('should limit consecutive spaces', () => {
      const text = 'Hello     World';
      const result = normalizeWhitespace(text, { maxConsecutiveSpaces: 2 });
      expect(result).toBe('Hello  World');
    });

    it('should not collapse spaces when disabled', () => {
      const text = 'Hello    World';
      const result = normalizeWhitespace(text, { collapseSpaces: false });
      expect(result).toBe('Hello    World');
    });

    it('should not trim ends when disabled', () => {
      const text = '  Hello World  ';
      const result = normalizeWhitespace(text, { trimEnds: false });
      expect(result).toBe('  Hello World  ');
    });

    it('should handle empty string', () => {
      expect(normalizeWhitespace('')).toBe('');
    });
  });

  describe('countEmojis', () => {
    it('should count basic emojis', () => {
      const text = 'Hello 😀 World 😃';
      expect(countEmojis(text)).toBe(2);
    });

    it('should count various emoji types', () => {
      const text = '😀🚀❤️🎉';
      expect(countEmojis(text)).toBe(4);
    });

    it('should handle text without emojis', () => {
      const text = 'Hello World';
      expect(countEmojis(text)).toBe(0);
    });

    it('should handle empty string', () => {
      expect(countEmojis('')).toBe(0);
    });

    it('should count complex emojis', () => {
      const text = '👨‍👩‍👧‍👦 👍🏽 🏳️‍🌈';
      expect(countEmojis(text)).toBeGreaterThan(0);
    });
  });

  describe('extractEmojis', () => {
    it('should extract emojis from text', () => {
      const text = 'Hello 😀 World 😃 Test';
      const emojis = extractEmojis(text);
      expect(emojis).toContain('😀');
      expect(emojis).toContain('😃');
      expect(emojis.length).toBe(2);
    });

    it('should return empty array for text without emojis', () => {
      const text = 'Hello World';
      expect(extractEmojis(text)).toEqual([]);
    });

    it('should handle empty string', () => {
      expect(extractEmojis('')).toEqual([]);
    });

    it('should extract various emoji types', () => {
      const text = '😀🚀❤️🎉';
      const emojis = extractEmojis(text);
      expect(emojis.length).toBe(4);
    });
  });

  describe('limitConsecutiveEmojis', () => {
    it('should limit consecutive emojis to specified count', () => {
      const text = 'Hello 😀😀😀😀😀 World';
      const result = limitConsecutiveEmojis(text, 3);
      expect(result).toBe('Hello 😀😀😀 World');
    });

    it('should not affect non-consecutive emojis', () => {
      const text = 'Hello 😀 World 😀 Test 😀';
      const result = limitConsecutiveEmojis(text, 2);
      expect(result).toBe('Hello 😀 World 😀 Test 😀');
    });

    it('should handle mixed consecutive sequences', () => {
      const text = '😀😀😀 text 🚀🚀🚀🚀';
      const result = limitConsecutiveEmojis(text, 2);
      expect(result).toBe('😀😀 text 🚀🚀');
    });

    it('should handle zero limit', () => {
      const text = 'Hello 😀😀😀 World';
      const result = limitConsecutiveEmojis(text, 0);
      expect(result).toBe(text);
    });

    it('should handle text without emojis', () => {
      const text = 'Hello World';
      const result = limitConsecutiveEmojis(text, 3);
      expect(result).toBe('Hello World');
    });

    it('should handle empty string', () => {
      expect(limitConsecutiveEmojis('', 3)).toBe('');
    });
  });

  describe('removeEmojis', () => {
    it('should remove all emojis from text', () => {
      const text = 'Hello 😀 World 😃 Test';
      expect(removeEmojis(text)).toBe('Hello  World  Test');
    });

    it('should handle text without emojis', () => {
      const text = 'Hello World';
      expect(removeEmojis(text)).toBe('Hello World');
    });

    it('should handle empty string', () => {
      expect(removeEmojis('')).toBe('');
    });

    it('should remove various emoji types', () => {
      const text = '😀🚀❤️🎉 Text';
      expect(removeEmojis(text)).toBe(' Text');
    });
  });

  describe('replaceEmojisWithText', () => {
    it('should replace common emojis with text descriptions', () => {
      const text = 'Hello 😀 World 👍';
      const result = replaceEmojisWithText(text);
      expect(result).toContain('[sorrindo]');
      expect(result).toContain('[joinha]');
    });

    it('should replace unknown emojis with generic placeholder', () => {
      const text = 'Hello 🦄 World'; // Unicorn emoji not in mapping
      const result = replaceEmojisWithText(text);
      expect(result).toContain('[emoji]');
    });

    it('should handle text without emojis', () => {
      const text = 'Hello World';
      expect(replaceEmojisWithText(text)).toBe('Hello World');
    });

    it('should handle empty string', () => {
      expect(replaceEmojisWithText('')).toBe('');
    });

    it('should replace multiple instances of same emoji', () => {
      const text = '😀😀😀';
      const result = replaceEmojisWithText(text);
      expect(result).toBe('[sorrindo][sorrindo][sorrindo]');
    });
  });

  describe('validateEmojiUsage', () => {
    it('should validate emoji count within limits', () => {
      const text = 'Hello 😀 World 😃';
      const result = validateEmojiUsage(text, { maxTotal: 5 });
      expect(result.isValid).toBe(true);
      expect(result.emojiCount).toBe(2);
    });

    it('should reject text with too many emojis', () => {
      const text = '😀😃😄😁😆😅😂🤣😊😇😍'; // 11 emojis
      const result = validateEmojiUsage(text, { maxTotal: 5 });
      expect(result.isValid).toBe(false);
      expect(result.issues).toContain('Too many emojis: 11 (max 5)');
    });

    it('should reject text with too many consecutive emojis', () => {
      const text = 'Hello 😀😀😀😀 World';
      const result = validateEmojiUsage(text, { maxConsecutive: 2 });
      expect(result.isValid).toBe(false);
      expect(result.issues.some(issue => issue.includes('consecutive'))).toBe(true);
    });

    it('should validate allowed categories', () => {
      const text = 'Hello 😀 World 👍'; // faces and gestures
      const result = validateEmojiUsage(text, { allowedCategories: ['faces'] });
      expect(result.isValid).toBe(false);
      expect(result.issues.some(issue => issue.includes('Disallowed emojis'))).toBe(true);
    });

    it('should provide channel-specific suggestions', () => {
      const text = '😀😃😄😁😆😅'; // 6 emojis
      const whatsappResult = validateEmojiUsage(text, { channel: 'whatsapp' });
      const instagramResult = validateEmojiUsage(text, { channel: 'instagram' });
      
      expect(whatsappResult.suggestions.some(s => s.includes('WhatsApp'))).toBe(true);
      expect(instagramResult.suggestions.length).toBeGreaterThanOrEqual(0);
    });

    it('should handle text without emojis', () => {
      const text = 'Hello World';
      const result = validateEmojiUsage(text);
      expect(result.isValid).toBe(true);
      expect(result.emojiCount).toBe(0);
    });
  });

  describe('normalizeForChannelUX', () => {
    it('should normalize text for WhatsApp', () => {
      const text = 'Hello\u200B   😀😀😀😀   World';
      const result = normalizeForChannelUX(text, 'whatsapp');
      
      expect(result.normalized).not.toContain('\u200B');
      expect(result.normalized).toContain('😀😀😀'); // Limited to 3
      expect(result.changes.length).toBeGreaterThan(0);
    });

    it('should normalize text for Instagram', () => {
      const text = 'Hello\u200B   😀😀😀😀😀   World';
      const result = normalizeForChannelUX(text, 'instagram');
      
      expect(result.normalized).not.toContain('\u200B');
      expect(result.normalized).toContain('😀😀😀😀'); // Limited to 4 for Instagram
      expect(result.changes.length).toBeGreaterThan(0);
    });

    it('should track changes made during normalization', () => {
      const text = 'Hello\u200B   😀😀😀😀   World';
      const result = normalizeForChannelUX(text, 'whatsapp');
      
      expect(result.changes).toContain('Removed invisible characters');
      expect(result.changes).toContain('Normalized whitespace');
      expect(result.changes).toContain('Limited consecutive emojis to 3');
    });

    it('should handle text that needs no normalization', () => {
      const text = 'Hello World 😀';
      const result = normalizeForChannelUX(text, 'whatsapp');
      
      expect(result.normalized).toBe(text);
      expect(result.changes.length).toBe(0);
    });

    it('should handle empty string', () => {
      const result = normalizeForChannelUX('', 'whatsapp');
      expect(result.normalized).toBe('');
      expect(result.changes.length).toBe(0);
    });
  });

  describe('getEmojiStats', () => {
    it('should provide comprehensive emoji statistics', () => {
      const text = 'Hello 😀😀 World 👍 Test ❤️';
      const stats = getEmojiStats(text);
      
      expect(stats.totalEmojis).toBe(4);
      expect(stats.uniqueEmojis).toBe(3);
      expect(stats.maxConsecutive).toBe(2);
      expect(stats.emojiDensity).toBeGreaterThan(0);
      expect(stats.emojis).toContain('😀');
      expect(stats.emojis).toContain('👍');
      expect(stats.emojis).toContain('❤️');
    });

    it('should categorize emojis correctly', () => {
      const text = '😀👍❤️';
      const stats = getEmojiStats(text);
      
      expect(stats.categories.faces).toBe(1);
      expect(stats.categories.gestures).toBe(1);
      expect(stats.categories.hearts).toBe(1);
    });

    it('should handle text without emojis', () => {
      const text = 'Hello World';
      const stats = getEmojiStats(text);
      
      expect(stats.totalEmojis).toBe(0);
      expect(stats.uniqueEmojis).toBe(0);
      expect(stats.emojiDensity).toBe(0);
      expect(stats.maxConsecutive).toBe(0);
      expect(Object.keys(stats.categories)).toHaveLength(0);
    });

    it('should handle empty string', () => {
      const stats = getEmojiStats('');
      
      expect(stats.totalEmojis).toBe(0);
      expect(stats.uniqueEmojis).toBe(0);
      expect(stats.emojiDensity).toBe(0);
      expect(stats.maxConsecutive).toBe(0);
    });

    it('should calculate emoji density correctly', () => {
      const text = '😀😀'; // 2 emojis in 2 characters = 100% density
      const stats = getEmojiStats(text);
      
      expect(stats.emojiDensity).toBe(100);
    });
  });

  describe('suggestEmojiReplacements', () => {
    it('should suggest replacements for less common emojis', () => {
      const text = 'Hello 🤪 World 🥳';
      const result = suggestEmojiReplacements(text);
      
      expect(result.suggestions.length).toBeGreaterThan(0);
      expect(result.suggestions.some(s => s.original === '🤪')).toBe(true);
      expect(result.suggestions.some(s => s.original === '🥳')).toBe(true);
      expect(result.optimizedText).not.toContain('🤪');
      expect(result.optimizedText).not.toContain('🥳');
    });

    it('should provide reasons for replacements', () => {
      const text = 'Hello 🤪 World';
      const result = suggestEmojiReplacements(text);
      
      const suggestion = result.suggestions.find(s => s.original === '🤪');
      expect(suggestion?.reason).toBeTruthy();
    });

    it('should handle text without problematic emojis', () => {
      const text = 'Hello 😀 World 👍';
      const result = suggestEmojiReplacements(text);
      
      expect(result.suggestions.length).toBe(0);
      expect(result.optimizedText).toBe(text);
    });

    it('should handle text without emojis', () => {
      const text = 'Hello World';
      const result = suggestEmojiReplacements(text);
      
      expect(result.suggestions.length).toBe(0);
      expect(result.optimizedText).toBe(text);
    });

    it('should handle empty string', () => {
      const result = suggestEmojiReplacements('');
      
      expect(result.suggestions.length).toBe(0);
      expect(result.optimizedText).toBe('');
    });
  });

  describe('EMOJI_CATEGORIES', () => {
    it('should contain expected emoji categories', () => {
      expect(EMOJI_CATEGORIES.faces).toBeDefined();
      expect(EMOJI_CATEGORIES.gestures).toBeDefined();
      expect(EMOJI_CATEGORIES.hearts).toBeDefined();
      expect(EMOJI_CATEGORIES.activities).toBeDefined();
      expect(EMOJI_CATEGORIES.food).toBeDefined();
      expect(EMOJI_CATEGORIES.travel).toBeDefined();
    });

    it('should have emojis in each category', () => {
      Object.values(EMOJI_CATEGORIES).forEach(category => {
        expect(category.length).toBeGreaterThan(0);
      });
    });

    it('should contain valid emojis', () => {
      Object.values(EMOJI_CATEGORIES).flat().forEach(emoji => {
        expect(typeof emoji).toBe('string');
        expect(emoji.length).toBeGreaterThan(0);
      });
    });
  });
});