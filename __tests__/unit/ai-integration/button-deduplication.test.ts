/**
 * Tests for button deduplication utilities
 * Requirements: 9.2, 9.4
 */

import {
  removeDuplicateButtons,
  makeButtonTitlesUnique,
  addFallbackButton,
  deduplicateWhatsAppButtons,
  deduplicateInstagramQuickReplies,
  deduplicateInstagramButtons,
  validateButtonTitles,
  smartDeduplicateButtons,
  normalizeButtonTitle,
  areButtonTitlesDuplicate,
  findDuplicateButtonGroups
} from '../../../lib/ai-integration/utils/button-deduplication';
import type { WhatsAppButton, InstagramQuickReply, InstagramButton } from '../../../lib/ai-integration/types/channels';

describe('Button Deduplication Utilities', () => {
  describe('removeDuplicateButtons', () => {
    it('should remove exact duplicate titles (case-insensitive)', () => {
      const buttons = [
        { title: 'Option', id: '1' },
        { title: 'OPTION', id: '2' },
        { title: 'Different', id: '3' },
        { title: 'option', id: '4' }
      ];

      const result = removeDuplicateButtons(buttons);
      
      expect(result.deduplicated).toHaveLength(2);
      expect(result.deduplicated[0].title).toBe('Option');
      expect(result.deduplicated[1].title).toBe('Different');
      expect(result.duplicatesRemoved).toBe(2);
      expect(result.warnings).toHaveLength(2);
    });

    it('should handle buttons with no duplicates', () => {
      const buttons = [
        { title: 'Option 1', id: '1' },
        { title: 'Option 2', id: '2' },
        { title: 'Option 3', id: '3' }
      ];

      const result = removeDuplicateButtons(buttons);
      
      expect(result.deduplicated).toHaveLength(3);
      expect(result.duplicatesRemoved).toBe(0);
      expect(result.warnings).toHaveLength(0);
    });

    it('should handle empty array', () => {
      const result = removeDuplicateButtons([]);
      
      expect(result.deduplicated).toHaveLength(0);
      expect(result.duplicatesRemoved).toBe(0);
      expect(result.warnings).toHaveLength(0);
    });

    it('should preserve first occurrence of duplicate titles', () => {
      const buttons = [
        { title: 'First', id: '1', extra: 'data1' },
        { title: 'Second', id: '2', extra: 'data2' },
        { title: 'first', id: '3', extra: 'data3' }
      ];

      const result = removeDuplicateButtons(buttons);
      
      expect(result.deduplicated).toHaveLength(2);
      expect(result.deduplicated[0].extra).toBe('data1'); // First occurrence preserved
      expect(result.deduplicated[1].extra).toBe('data2');
    });
  });

  describe('makeButtonTitlesUnique', () => {
    it('should make duplicate titles unique by appending numbers', () => {
      const buttons = [
        { title: 'Option', id: '1' },
        { title: 'Option', id: '2' },
        { title: 'Different', id: '3' },
        { title: 'option', id: '4' }
      ];

      const result = makeButtonTitlesUnique(buttons);
      
      expect(result.deduplicated).toHaveLength(4);
      expect(result.deduplicated[0].title).toBe('Option');
      expect(result.deduplicated[1].title).toBe('Option 2');
      expect(result.deduplicated[2].title).toBe('Different');
      expect(result.deduplicated[3].title).toBe('option 2');
      expect(result.warnings).toHaveLength(2);
    });

    it('should handle multiple duplicates correctly', () => {
      const buttons = [
        { title: 'Test', id: '1' },
        { title: 'Test', id: '2' },
        { title: 'Test', id: '3' }
      ];

      const result = makeButtonTitlesUnique(buttons);
      
      expect(result.deduplicated[0].title).toBe('Test');
      expect(result.deduplicated[1].title).toBe('Test 2');
      expect(result.deduplicated[2].title).toBe('Test 3');
    });
  });

  describe('addFallbackButton', () => {
    it('should add fallback button when array is empty', () => {
      const createFallback = () => ({ title: 'Fallback', id: 'fallback' });
      const result = addFallbackButton([], createFallback);
      
      expect(result.deduplicated).toHaveLength(1);
      expect(result.deduplicated[0].title).toBe('Fallback');
      expect(result.fallbackAdded).toBe(true);
      expect(result.warnings).toContain('No valid buttons found, added fallback button');
    });

    it('should not add fallback when buttons exist', () => {
      const buttons = [{ title: 'Existing', id: '1' }];
      const createFallback = () => ({ title: 'Fallback', id: 'fallback' });
      const result = addFallbackButton(buttons, createFallback);
      
      expect(result.deduplicated).toHaveLength(1);
      expect(result.deduplicated[0].title).toBe('Existing');
      expect(result.fallbackAdded).toBe(false);
      expect(result.warnings).toHaveLength(0);
    });
  });

  describe('deduplicateWhatsAppButtons', () => {
    it('should deduplicate WhatsApp buttons and add fallback if needed', () => {
      const buttons: WhatsAppButton[] = [
        { type: 'reply', title: 'Option', id: 'opt1' },
        { type: 'reply', title: 'OPTION', id: 'opt2' }
      ];

      const result = deduplicateWhatsAppButtons(buttons);
      
      expect(result.deduplicated).toHaveLength(1);
      expect(result.deduplicated[0].title).toBe('Option');
      expect(result.duplicatesRemoved).toBe(1);
    });

    it('should add fallback button when all buttons are duplicates', () => {
      const buttons: WhatsAppButton[] = [];
      const result = deduplicateWhatsAppButtons(buttons);
      
      expect(result.deduplicated).toHaveLength(1);
      expect(result.deduplicated[0].title).toBe('Falar com atendente');
      expect(result.deduplicated[0].id).toBe('human_handoff');
      expect(result.fallbackAdded).toBe(true);
    });
  });

  describe('deduplicateInstagramQuickReplies', () => {
    it('should deduplicate Instagram quick replies', () => {
      const quickReplies: InstagramQuickReply[] = [
        { title: 'Option', payload: 'opt1' },
        { title: 'option', payload: 'opt2' },
        { title: 'Different', payload: 'diff1' }
      ];

      const result = deduplicateInstagramQuickReplies(quickReplies);
      
      expect(result.deduplicated).toHaveLength(2);
      expect(result.duplicatesRemoved).toBe(1);
    });

    it('should add fallback quick reply when needed', () => {
      const result = deduplicateInstagramQuickReplies([]);
      
      expect(result.deduplicated).toHaveLength(1);
      expect(result.deduplicated[0].title).toBe('Falar com atendente');
      expect(result.deduplicated[0].payload).toBe('human_handoff');
      expect(result.fallbackAdded).toBe(true);
    });
  });

  describe('deduplicateInstagramButtons', () => {
    it('should deduplicate Instagram buttons', () => {
      const buttons: InstagramButton[] = [
        { type: 'postback', title: 'Option', payload: 'opt1' },
        { type: 'postback', title: 'OPTION', payload: 'opt2' },
        { type: 'web_url', title: 'Link', url: 'https://example.com' }
      ];

      const result = deduplicateInstagramButtons(buttons);
      
      expect(result.deduplicated).toHaveLength(2);
      expect(result.duplicatesRemoved).toBe(1);
    });

    it('should add fallback button when needed', () => {
      const result = deduplicateInstagramButtons([]);
      
      expect(result.deduplicated).toHaveLength(1);
      expect(result.deduplicated[0].title).toBe('Falar com atendente');
      expect((result.deduplicated[0] as InstagramButton).type).toBe('postback');
      expect((result.deduplicated[0] as InstagramButton).payload).toBe('human_handoff');
      expect(result.fallbackAdded).toBe(true);
    });
  });

  describe('validateButtonTitles', () => {
    it('should validate button titles and separate valid from invalid', () => {
      const buttons = [
        { title: 'Valid Option', id: '1' },
        { title: '', id: '2' }, // Empty
        { title: '   ', id: '3' }, // Whitespace only
        { title: 'A', id: '4' }, // Too short
        { title: '!@#$%', id: '5' }, // Only special characters
        { title: 'Another Valid', id: '6' }
      ];

      const result = validateButtonTitles(buttons);
      
      expect(result.valid).toHaveLength(2);
      expect(result.invalid).toHaveLength(4);
      expect(result.issues).toHaveLength(4);
      expect(result.valid[0].title).toBe('Valid Option');
      expect(result.valid[1].title).toBe('Another Valid');
    });

    it('should handle all valid buttons', () => {
      const buttons = [
        { title: 'Option 1', id: '1' },
        { title: 'Option 2', id: '2' }
      ];

      const result = validateButtonTitles(buttons);
      
      expect(result.valid).toHaveLength(2);
      expect(result.invalid).toHaveLength(0);
      expect(result.issues).toHaveLength(0);
    });

    it('should handle buttons with accented characters', () => {
      const buttons = [
        { title: 'Opção', id: '1' },
        { title: 'Configuração', id: '2' }
      ];

      const result = validateButtonTitles(buttons);
      
      expect(result.valid).toHaveLength(2);
      expect(result.invalid).toHaveLength(0);
    });
  });

  describe('smartDeduplicateButtons', () => {
    it('should use remove strategy by default', () => {
      const buttons = [
        { title: 'Option', id: '1' },
        { title: 'option', id: '2' },
        { title: 'Different', id: '3' }
      ];
      const createFallback = () => ({ title: 'Fallback', id: 'fallback' });

      const result = smartDeduplicateButtons(buttons, createFallback);
      
      expect(result.deduplicated).toHaveLength(2);
      expect(result.duplicatesRemoved).toBe(1);
    });

    it('should use make_unique strategy when specified', () => {
      const buttons = [
        { title: 'Option', id: '1' },
        { title: 'option', id: '2' },
        { title: 'Different', id: '3' }
      ];
      const createFallback = () => ({ title: 'Fallback', id: 'fallback' });

      const result = smartDeduplicateButtons(buttons, createFallback, {
        strategy: 'make_unique'
      });
      
      expect(result.deduplicated).toHaveLength(3);
      expect(result.deduplicated[1].title).toBe('option 2');
    });

    it('should validate titles when requested', () => {
      const buttons = [
        { title: 'Valid', id: '1' },
        { title: '', id: '2' }, // Invalid
        { title: 'Also Valid', id: '3' }
      ];
      const createFallback = () => ({ title: 'Fallback', id: 'fallback' });

      const result = smartDeduplicateButtons(buttons, createFallback, {
        strategy: 'remove',
        validateTitles: true
      });
      
      expect(result.deduplicated).toHaveLength(2);
      expect(result.warnings.some(w => w.includes('empty title'))).toBe(true);
    });

    it('should skip validation when not requested', () => {
      const buttons = [
        { title: 'Valid', id: '1' },
        { title: '', id: '2' }, // Would be invalid
        { title: 'Also Valid', id: '3' }
      ];
      const createFallback = () => ({ title: 'Fallback', id: 'fallback' });

      const result = smartDeduplicateButtons(buttons, createFallback, {
        strategy: 'remove',
        validateTitles: false
      });
      
      expect(result.deduplicated).toHaveLength(3); // Invalid button not removed
    });
  });

  describe('normalizeButtonTitle', () => {
    it('should normalize button titles for comparison', () => {
      expect(normalizeButtonTitle('  Option  ')).toBe('option');
      expect(normalizeButtonTitle('OPTION')).toBe('option');
      expect(normalizeButtonTitle('Opção')).toBe('opcao');
      expect(normalizeButtonTitle('Option\u200B')).toBe('option');
    });

    it('should handle empty and whitespace strings', () => {
      expect(normalizeButtonTitle('')).toBe('');
      expect(normalizeButtonTitle('   ')).toBe('');
    });
  });

  describe('areButtonTitlesDuplicate', () => {
    it('should detect duplicate titles', () => {
      expect(areButtonTitlesDuplicate('Option', 'OPTION')).toBe(true);
      expect(areButtonTitlesDuplicate('Opção', 'opcao')).toBe(true);
      expect(areButtonTitlesDuplicate('  Option  ', 'option')).toBe(true);
    });

    it('should detect non-duplicate titles', () => {
      expect(areButtonTitlesDuplicate('Option 1', 'Option 2')).toBe(false);
      expect(areButtonTitlesDuplicate('Different', 'Another')).toBe(false);
    });

    it('should handle edge cases', () => {
      expect(areButtonTitlesDuplicate('', '')).toBe(true);
      expect(areButtonTitlesDuplicate('Option', '')).toBe(false);
    });
  });

  describe('findDuplicateButtonGroups', () => {
    it('should find groups of duplicate buttons', () => {
      const buttons = [
        { title: 'Option', id: '1' },
        { title: 'OPTION', id: '2' },
        { title: 'Different', id: '3' },
        { title: 'option', id: '4' },
        { title: 'Another', id: '5' }
      ];

      const groups = findDuplicateButtonGroups(buttons);
      
      expect(groups.size).toBe(1);
      expect(groups.has('option')).toBe(true);
      expect(groups.get('option')).toHaveLength(3);
    });

    it('should return empty map when no duplicates exist', () => {
      const buttons = [
        { title: 'Option 1', id: '1' },
        { title: 'Option 2', id: '2' },
        { title: 'Option 3', id: '3' }
      ];

      const groups = findDuplicateButtonGroups(buttons);
      
      expect(groups.size).toBe(0);
    });

    it('should handle empty array', () => {
      const groups = findDuplicateButtonGroups([]);
      
      expect(groups.size).toBe(0);
    });

    it('should group multiple sets of duplicates', () => {
      const buttons = [
        { title: 'Option', id: '1' },
        { title: 'option', id: '2' },
        { title: 'Test', id: '3' },
        { title: 'TEST', id: '4' },
        { title: 'Unique', id: '5' }
      ];

      const groups = findDuplicateButtonGroups(buttons);
      
      expect(groups.size).toBe(2);
      expect(groups.has('option')).toBe(true);
      expect(groups.has('test')).toBe(true);
      expect(groups.get('option')).toHaveLength(2);
      expect(groups.get('test')).toHaveLength(2);
    });
  });
});