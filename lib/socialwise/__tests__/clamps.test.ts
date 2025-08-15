/**
 * Unit tests for SocialWise clamps and validation utilities
 */

import {
  clampTitle,
  clampBody,
  validatePayloadFormat,
  clampPayload,
  clampButtonData,
  validateChannelLimits,
  CHANNEL_LIMITS,
  type ButtonData,
  type ClampedButtonData
} from '../clamps';

describe('clampTitle', () => {
  test('should return empty string for invalid input', () => {
    expect(clampTitle('')).toBe('');
    expect(clampTitle(null as any)).toBe('');
    expect(clampTitle(undefined as any)).toBe('');
    expect(clampTitle(123 as any)).toBe('');
  });

  test('should normalize whitespace', () => {
    expect(clampTitle('  hello   world  ')).toBe('hello world');
    expect(clampTitle('hello\n\tworld')).toBe('hello world');
    expect(clampTitle('multiple   spaces   here')).toBe('multiple spaces here');
  });

  test('should limit to 4 words by default', () => {
    expect(clampTitle('one two three four')).toBe('one two three four');
    expect(clampTitle('one two three four five')).toBe('one two three four');
    expect(clampTitle('one two three four five six seven')).toBe('one two three four');
  });

  test('should limit to 20 characters by default', () => {
    expect(clampTitle('short')).toBe('short');
    expect(clampTitle('exactly twenty chars')).toBe('exactly twenty chars'); // 20 chars
    expect(clampTitle('this is longer than twenty characters')).toBe('this is longer than'); // Truncated at word boundary
  });

  test('should prefer word boundaries when truncating', () => {
    expect(clampTitle('this is a very long title')).toBe('this is a very'); // Breaks at word
    expect(clampTitle('superlongwordthatcantbreak')).toBe('superlongwordthatcan'); // Hard truncate when no spaces
  });

  test('should handle custom limits', () => {
    expect(clampTitle('one two three', 10, 2)).toBe('one two');
    expect(clampTitle('very long text here', 8, 5)).toBe('very'); // Character limit wins
  });

  test('should handle edge cases', () => {
    expect(clampTitle('a')).toBe('a');
    expect(clampTitle('   ')).toBe('');
    expect(clampTitle('word')).toBe('word');
  });
});

describe('clampBody', () => {
  test('should return empty string for invalid input', () => {
    expect(clampBody('', 'whatsapp')).toBe('');
    expect(clampBody(null as any, 'whatsapp')).toBe('');
    expect(clampBody(undefined as any, 'whatsapp')).toBe('');
  });

  test('should respect WhatsApp limit of 1024 characters', () => {
    const shortText = 'This is a short message';
    expect(clampBody(shortText, 'whatsapp')).toBe(shortText);

    const longText = 'a'.repeat(1500);
    const clamped = clampBody(longText, 'whatsapp');
    expect(clamped.length).toBeLessThanOrEqual(1024);
  });

  test('should respect Instagram limit of 640 characters', () => {
    const shortText = 'This is a short message';
    expect(clampBody(shortText, 'instagram')).toBe(shortText);

    const longText = 'a'.repeat(800);
    const clamped = clampBody(longText, 'instagram');
    expect(clamped.length).toBeLessThanOrEqual(640);
  });

  test('should respect Facebook limit of 640 characters', () => {
    const shortText = 'This is a short message';
    expect(clampBody(shortText, 'facebook')).toBe(shortText);

    const longText = 'a'.repeat(800);
    const clamped = clampBody(longText, 'facebook');
    expect(clamped.length).toBeLessThanOrEqual(640);
  });

  test('should prefer sentence boundaries when truncating', () => {
    const text = 'First sentence. Second sentence. Third sentence that is very long and goes on and on.';
    const clamped = clampBody(text, 'instagram');
    
    // Should break at sentence boundary if possible
    expect(clamped).toMatch(/\.$|!$|\?$/);
  });

  test('should fall back to word boundaries', () => {
    const text = 'This is a very long text without proper sentence endings, just commas and spaces everywhere, making it hard to find good breaking points and should be truncated at some reasonable word boundary to avoid cutting words in half';
    const clamped = clampBody(text, 'instagram');
    
    expect(clamped.length).toBeLessThanOrEqual(640);
    // Should end with a complete word when possible
    if (clamped.length < text.length) {
      expect(clamped).toMatch(/\s$/); // Should end with space after word boundary truncation
    }
  });

  test('should hard truncate as last resort', () => {
    const text = 'a'.repeat(1000);
    const clamped = clampBody(text, 'instagram');
    
    expect(clamped.length).toBe(640);
  });
});

describe('validatePayloadFormat', () => {
  test('should validate correct payload format', () => {
    expect(validatePayloadFormat('@valid_intent')).toBe(true);
    expect(validatePayloadFormat('@intent123')).toBe(true);
    expect(validatePayloadFormat('@simple')).toBe(true);
    expect(validatePayloadFormat('@test_intent_123')).toBe(true);
  });

  test('should reject invalid payload formats', () => {
    expect(validatePayloadFormat('')).toBe(false);
    expect(validatePayloadFormat('invalid')).toBe(false);
    expect(validatePayloadFormat('@Invalid')).toBe(false); // Uppercase
    expect(validatePayloadFormat('@invalid-intent')).toBe(false); // Hyphen
    expect(validatePayloadFormat('@invalid intent')).toBe(false); // Space
    expect(validatePayloadFormat('@invalid.intent')).toBe(false); // Dot
    expect(validatePayloadFormat('@@invalid')).toBe(false); // Double @
    expect(validatePayloadFormat(null as any)).toBe(false);
    expect(validatePayloadFormat(undefined as any)).toBe(false);
  });
});

describe('clampPayload', () => {
  test('should respect WhatsApp button ID limit of 256 characters', () => {
    const shortPayload = '@short_intent';
    expect(clampPayload(shortPayload, 'whatsapp')).toBe(shortPayload);

    const longPayload = '@' + 'a'.repeat(300);
    const clamped = clampPayload(longPayload, 'whatsapp');
    expect(clamped.length).toBe(256);
  });

  test('should respect Instagram payload limit of 1000 characters', () => {
    const shortPayload = '@short_intent';
    expect(clampPayload(shortPayload, 'instagram')).toBe(shortPayload);

    const longPayload = '@' + 'a'.repeat(1200);
    const clamped = clampPayload(longPayload, 'instagram');
    expect(clamped.length).toBe(1000);
  });

  test('should handle empty and invalid input', () => {
    expect(clampPayload('', 'whatsapp')).toBe('');
    expect(clampPayload('   ', 'whatsapp')).toBe('');
    expect(clampPayload(null as any, 'whatsapp')).toBe('');
  });
});

describe('clampButtonData', () => {
  test('should clamp valid button data', () => {
    const button: ButtonData = {
      title: 'Valid Title',
      payload: '@valid_intent'
    };

    const result = clampButtonData(button, 'whatsapp');

    expect(result.isValid).toBe(true);
    expect(result.title).toBe('Valid Title');
    expect(result.payload).toBe('@valid_intent');
    expect(result.originalTitle).toBeUndefined();
    expect(result.originalPayload).toBeUndefined();
  });

  test('should clamp long title', () => {
    const button: ButtonData = {
      title: 'This is a very long title that exceeds the limit',
      payload: '@valid_intent'
    };

    const result = clampButtonData(button, 'whatsapp');

    expect(result.isValid).toBe(true);
    expect(result.title.length).toBeLessThanOrEqual(20);
    expect(result.originalTitle).toBe(button.title);
  });

  test('should clamp long payload', () => {
    const longPayload = '@' + 'a'.repeat(300);
    const button: ButtonData = {
      title: 'Valid Title',
      payload: longPayload
    };

    const result = clampButtonData(button, 'whatsapp');

    expect(result.isValid).toBe(true);
    expect(result.payload.length).toBeLessThanOrEqual(256);
    expect(result.originalPayload).toBe(longPayload);
  });

  test('should mark invalid when payload format is wrong', () => {
    const button: ButtonData = {
      title: 'Valid Title',
      payload: 'invalid_payload'
    };

    const result = clampButtonData(button, 'whatsapp');

    expect(result.isValid).toBe(false);
    expect(result.title).toBe('Valid Title');
    expect(result.payload).toBe('invalid_payload');
  });

  test('should mark invalid when title is empty after clamping', () => {
    const button: ButtonData = {
      title: '',
      payload: '@valid_intent'
    };

    const result = clampButtonData(button, 'whatsapp');

    expect(result.isValid).toBe(false);
  });
});

describe('validateChannelLimits', () => {
  test('should validate content within limits', () => {
    const content = {
      body: 'Short message',
      buttons: [
        { title: 'Button 1', payload: '@intent1' },
        { title: 'Button 2', payload: '@intent2' }
      ]
    };

    const result = validateChannelLimits(content, 'whatsapp');

    expect(result.isValid).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  test('should detect body text violations', () => {
    const content = {
      body: 'a'.repeat(1500), // Exceeds WhatsApp limit
      buttons: []
    };

    const result = validateChannelLimits(content, 'whatsapp');

    expect(result.isValid).toBe(false);
    expect(result.violations.some(v => v.includes('Body text exceeds 1024 characters'))).toBe(true);
  });

  test('should detect too many buttons', () => {
    const content = {
      buttons: [
        { title: 'Button 1', payload: '@intent1' },
        { title: 'Button 2', payload: '@intent2' },
        { title: 'Button 3', payload: '@intent3' },
        { title: 'Button 4', payload: '@intent4' } // Exceeds limit of 3
      ]
    };

    const result = validateChannelLimits(content, 'whatsapp');

    expect(result.isValid).toBe(false);
    expect(result.violations.some(v => v.includes('Too many buttons: 4 (max: 3)'))).toBe(true);
  });

  test('should detect button title violations', () => {
    const content = {
      buttons: [
        { title: 'This is a very long button title that exceeds the limit', payload: '@intent1' }
      ]
    };

    const result = validateChannelLimits(content, 'whatsapp');

    expect(result.isValid).toBe(false);
    expect(result.violations.some(v => v.includes('Button 1 title exceeds 20 characters'))).toBe(true);
  });

  test('should detect WhatsApp button ID violations', () => {
    const longPayload = '@' + 'a'.repeat(300);
    const content = {
      buttons: [
        { title: 'Button', payload: longPayload }
      ]
    };

    const result = validateChannelLimits(content, 'whatsapp');

    expect(result.isValid).toBe(false);
    expect(result.violations.some(v => v.includes('Button 1 ID exceeds 256 characters'))).toBe(true);
  });

  test('should detect Instagram payload violations', () => {
    const longPayload = '@' + 'a'.repeat(1200);
    const content = {
      buttons: [
        { title: 'Button', payload: longPayload }
      ]
    };

    const result = validateChannelLimits(content, 'instagram');

    expect(result.isValid).toBe(false);
    expect(result.violations.some(v => v.includes('Button 1 payload exceeds 1000 characters'))).toBe(true);
  });

  test('should detect invalid payload format', () => {
    const content = {
      buttons: [
        { title: 'Button', payload: 'invalid_format' }
      ]
    };

    const result = validateChannelLimits(content, 'whatsapp');

    expect(result.isValid).toBe(false);
    expect(result.violations.some(v => v.includes('Button 1 payload format invalid'))).toBe(true);
  });

  test('should handle multiple violations', () => {
    const content = {
      body: 'a'.repeat(1500),
      buttons: [
        { title: 'Very long button title that exceeds limit', payload: 'invalid' },
        { title: 'Button 2', payload: '@valid' },
        { title: 'Button 3', payload: '@valid' },
        { title: 'Button 4', payload: '@valid' } // Too many buttons
      ]
    };

    const result = validateChannelLimits(content, 'whatsapp');

    expect(result.isValid).toBe(false);
    expect(result.violations.length).toBeGreaterThan(1);
  });
});

describe('CHANNEL_LIMITS', () => {
  test('should have correct WhatsApp limits', () => {
    expect(CHANNEL_LIMITS.whatsapp.buttonTitle).toBe(20);
    expect(CHANNEL_LIMITS.whatsapp.buttonId).toBe(256);
    expect(CHANNEL_LIMITS.whatsapp.bodyText).toBe(1024);
    expect(CHANNEL_LIMITS.whatsapp.maxButtons).toBe(3);
  });

  test('should have correct Instagram limits', () => {
    expect(CHANNEL_LIMITS.instagram.buttonTitle).toBe(20);
    expect(CHANNEL_LIMITS.instagram.payload).toBe(1000);
    expect(CHANNEL_LIMITS.instagram.bodyText).toBe(640);
    expect(CHANNEL_LIMITS.instagram.maxButtons).toBe(3);
  });

  test('should have correct Facebook limits', () => {
    expect(CHANNEL_LIMITS.facebook.buttonTitle).toBe(20);
    expect(CHANNEL_LIMITS.facebook.payload).toBe(1000);
    expect(CHANNEL_LIMITS.facebook.bodyText).toBe(640);
    expect(CHANNEL_LIMITS.facebook.maxButtons).toBe(3);
  });
});