/**
 * Button deduplication and uniqueness utilities
 * Requirements: 9.2, 9.4
 */

import { WhatsAppButton, InstagramQuickReply, InstagramButton } from '../types/channels';
import { normalizeText } from './text-normalization';

export interface DeduplicationResult<T> {
  deduplicated: T[];
  duplicatesRemoved: number;
  fallbackAdded: boolean;
  warnings: string[];
}

/**
 * Remove duplicate button titles (case-insensitive)
 * Requirements: 9.2, 9.4
 */
export function removeDuplicateButtons<T extends { title: string }>(
  buttons: T[]
): DeduplicationResult<T> {
  const seen = new Set<string>();
  const warnings: string[] = [];
  let duplicatesRemoved = 0;

  const deduplicated = buttons.filter(button => {
    const normalizedTitle = button.title.toLowerCase().trim();
    
    if (seen.has(normalizedTitle)) {
      duplicatesRemoved++;
      warnings.push(`Duplicate button title removed: "${button.title}"`);
      return false;
    }
    
    seen.add(normalizedTitle);
    return true;
  });

  return {
    deduplicated,
    duplicatesRemoved,
    fallbackAdded: false,
    warnings
  };
}

/**
 * Ensure unique button titles by appending numbers to duplicates
 * Requirements: 9.2, 9.4
 */
export function makeButtonTitlesUnique<T extends { title: string }>(
  buttons: T[]
): DeduplicationResult<T> {
  const titleCounts = new Map<string, number>();
  const warnings: string[] = [];

  const uniqueButtons = buttons.map(button => {
    const normalizedTitle = button.title.toLowerCase().trim();
    const count = titleCounts.get(normalizedTitle) || 0;
    titleCounts.set(normalizedTitle, count + 1);

    if (count > 0) {
      const newTitle = `${button.title} ${count + 1}`;
      warnings.push(`Button title made unique: "${button.title}" → "${newTitle}"`);
      return {
        ...button,
        title: newTitle
      };
    }

    return button;
  });

  return {
    deduplicated: uniqueButtons,
    duplicatesRemoved: 0,
    fallbackAdded: false,
    warnings
  };
}

/**
 * Add fallback button when no valid buttons remain
 * Requirements: 9.2, 9.4
 */
export function addFallbackButton<T extends { title: string }>(
  buttons: T[],
  createFallback: () => T
): DeduplicationResult<T> {
  if (buttons.length === 0) {
    return {
      deduplicated: [createFallback()],
      duplicatesRemoved: 0,
      fallbackAdded: true,
      warnings: ['No valid buttons found, added fallback button']
    };
  }

  return {
    deduplicated: buttons,
    duplicatesRemoved: 0,
    fallbackAdded: false,
    warnings: []
  };
}

/**
 * Complete button deduplication process for WhatsApp
 * Requirements: 9.2, 9.4
 */
export function deduplicateWhatsAppButtons(
  buttons: WhatsAppButton[]
): DeduplicationResult<WhatsAppButton> {
  // Step 1: Remove exact duplicates
  const dedupeResult = removeDuplicateButtons(buttons);
  
  // Step 2: Add fallback if no buttons remain
  const fallbackResult = addFallbackButton(
    dedupeResult.deduplicated,
    (): WhatsAppButton => ({
      type: 'reply',
      title: 'Falar com atendente',
      id: 'human_handoff'
    })
  );

  return {
    deduplicated: fallbackResult.deduplicated,
    duplicatesRemoved: dedupeResult.duplicatesRemoved,
    fallbackAdded: fallbackResult.fallbackAdded,
    warnings: [...dedupeResult.warnings, ...fallbackResult.warnings]
  };
}

/**
 * Complete button deduplication process for Instagram Quick Replies
 * Requirements: 9.2, 9.4
 */
export function deduplicateInstagramQuickReplies(
  quickReplies: InstagramQuickReply[]
): DeduplicationResult<InstagramQuickReply> {
  // Step 1: Remove exact duplicates
  const dedupeResult = removeDuplicateButtons(quickReplies);
  
  // Step 2: Add fallback if no buttons remain
  const fallbackResult = addFallbackButton(
    dedupeResult.deduplicated,
    () => ({
      title: 'Falar com atendente',
      payload: 'human_handoff'
    })
  );

  return {
    deduplicated: fallbackResult.deduplicated,
    duplicatesRemoved: dedupeResult.duplicatesRemoved,
    fallbackAdded: fallbackResult.fallbackAdded,
    warnings: [...dedupeResult.warnings, ...fallbackResult.warnings]
  };
}

/**
 * Complete button deduplication process for Instagram Button Templates
 * Requirements: 9.2, 9.4
 */
export function deduplicateInstagramButtons(
  buttons: InstagramButton[]
): DeduplicationResult<InstagramButton> {
  // Step 1: Remove exact duplicates
  const dedupeResult = removeDuplicateButtons(buttons);
  
  // Step 2: Add fallback if no buttons remain
  const fallbackResult = addFallbackButton(
    dedupeResult.deduplicated,
    (): InstagramButton => ({
      type: 'postback',
      title: 'Falar com atendente',
      payload: 'human_handoff'
    })
  );

  return {
    deduplicated: fallbackResult.deduplicated,
    duplicatesRemoved: dedupeResult.duplicatesRemoved,
    fallbackAdded: fallbackResult.fallbackAdded,
    warnings: [...dedupeResult.warnings, ...fallbackResult.warnings]
  };
}

/**
 * Validate button titles for common issues
 * Requirements: 9.2, 9.4
 */
export function validateButtonTitles<T extends { title: string }>(
  buttons: T[]
): {
  valid: T[];
  invalid: T[];
  issues: string[];
} {
  const valid: T[] = [];
  const invalid: T[] = [];
  const issues: string[] = [];

  buttons.forEach(button => {
    const normalizedTitle = normalizeText(button.title, {
      removeInvisible: true,
      collapseSpaces: true
    });

    // Check for empty titles
    if (!normalizedTitle.trim()) {
      invalid.push(button);
      issues.push(`Button with empty title removed`);
      return;
    }

    // Check for titles that are too short (less than 2 characters)
    if (normalizedTitle.trim().length < 2) {
      invalid.push(button);
      issues.push(`Button title too short: "${button.title}"`);
      return;
    }

    // Check for titles with only special characters
    if (!/[a-zA-Z0-9\u00C0-\u017F]/.test(normalizedTitle)) {
      invalid.push(button);
      issues.push(`Button title contains only special characters: "${button.title}"`);
      return;
    }

    valid.push(button);
  });

  return { valid, invalid, issues };
}

/**
 * Smart button deduplication with validation and fallback
 * Requirements: 9.2, 9.4
 */
export function smartDeduplicateButtons<T extends { title: string }>(
  buttons: T[],
  createFallback: () => T,
  options: {
    strategy: 'remove' | 'make_unique';
    validateTitles?: boolean;
  } = { strategy: 'remove', validateTitles: true }
): DeduplicationResult<T> {
  let processedButtons = buttons;
  const allWarnings: string[] = [];

  // Step 1: Validate button titles if requested
  if (options.validateTitles) {
    const validation = validateButtonTitles(processedButtons);
    processedButtons = validation.valid;
    allWarnings.push(...validation.issues);
  }

  // Step 2: Apply deduplication strategy
  let dedupeResult: DeduplicationResult<T>;
  
  if (options.strategy === 'make_unique') {
    dedupeResult = makeButtonTitlesUnique(processedButtons);
  } else {
    dedupeResult = removeDuplicateButtons(processedButtons);
  }

  allWarnings.push(...dedupeResult.warnings);

  // Step 3: Add fallback if no buttons remain
  const fallbackResult = addFallbackButton(dedupeResult.deduplicated, createFallback);
  allWarnings.push(...fallbackResult.warnings);

  return {
    deduplicated: fallbackResult.deduplicated,
    duplicatesRemoved: dedupeResult.duplicatesRemoved,
    fallbackAdded: fallbackResult.fallbackAdded,
    warnings: allWarnings
  };
}

/**
 * Normalize button titles for comparison
 * Requirements: 9.2, 9.4
 */
export function normalizeButtonTitle(title: string): string {
  return normalizeText(title, {
    removeInvisible: true,
    collapseSpaces: true,
    normalizeAccents: true
  }).toLowerCase().trim();
}

/**
 * Check if two button titles are considered duplicates
 * Requirements: 9.2, 9.4
 */
export function areButtonTitlesDuplicate(title1: string, title2: string): boolean {
  const normalized1 = normalizeButtonTitle(title1);
  const normalized2 = normalizeButtonTitle(title2);
  
  return normalized1 === normalized2;
}

/**
 * Get duplicate button groups
 * Requirements: 9.2, 9.4
 */
export function findDuplicateButtonGroups<T extends { title: string }>(
  buttons: T[]
): Map<string, T[]> {
  const groups = new Map<string, T[]>();

  buttons.forEach(button => {
    const normalizedTitle = normalizeButtonTitle(button.title);
    
    if (!groups.has(normalizedTitle)) {
      groups.set(normalizedTitle, []);
    }
    
    groups.get(normalizedTitle)!.push(button);
  });

  // Return only groups with duplicates
  const duplicateGroups = new Map<string, T[]>();
  groups.forEach((group, title) => {
    if (group.length > 1) {
      duplicateGroups.set(title, group);
    }
  });

  return duplicateGroups;
}