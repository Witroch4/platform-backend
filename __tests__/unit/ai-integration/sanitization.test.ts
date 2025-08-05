/**
 * Tests for message sanitization and validation
 * Requirements: 9.1, 9.2, 9.3, 9.4
 */

import { 
  WhatsAppSanitizer, 
  InstagramSanitizer, 
  createSanitizer, 
  sanitizeMessage 
} from '../../../lib/ai-integration/services/sanitization';
import type { ChannelMessage, WhatsAppButton, InstagramQuickReply, InstagramButton } from '../../../lib/ai-integration/types/channels';

describe('WhatsApp Sanitizer', () => {
  let sanitizer: WhatsAppSanitizer;

  beforeEach(() => {
    sanitizer = new WhatsAppSanitizer();
  });

  describe('Text normalization', () => {
    it('should normalize text by removing ZWSP and collapsing spaces', () => {
      const message: ChannelMessage = {
        channel: 'whatsapp',
        text: 'Hello\u200B\u200C\u200D   world\uFEFF   test',
        buttons: []
      };

      const result = sanitizer.sanitize(message);
      expect(result.sanitized?.text).toBe('Hello world test');
      expect(result.isValid).toBe(true);
    });

    it('should limit consecutive emojis', () => {
      const message: ChannelMessage = {
        channel: 'whatsapp',
        text: 'Hello 😀😀😀😀😀 world',
        buttons: []
      };

      const result = sanitizer.sanitize(message);
      expect(result.sanitized?.text).toBe('Hello 😀😀😀 world');
    });

    it('should truncate body text exceeding 1024 characters', () => {
      const longText = 'a'.repeat(1100);
      const message: ChannelMessage = {
        channel: 'whatsapp',
        text: longText,
        buttons: []
      };

      const result = sanitizer.sanitize(message);
      expect(result.sanitized?.text.length).toBeLessThanOrEqual(1024);
      expect(result.warnings).toContain('Body text truncated to 1024 characters');
    });

    it('should preserve word boundaries when truncating', () => {
      const message: ChannelMessage = {
        channel: 'whatsapp',
        text: 'This is a very long message that needs to be truncated at word boundaries ' + 'x'.repeat(1000),
        buttons: []
      };

      const result = sanitizer.sanitize(message);
      expect(result.sanitized?.text).not.toMatch(/\sx+$/); // Should not end with partial word
    });
  });

  describe('Header and footer sanitization', () => {
    it('should truncate header text exceeding 60 characters', () => {
      const message: ChannelMessage = {
        channel: 'whatsapp',
        text: 'Hello',
        header: {
          type: 'text',
          text: 'This is a very long header that exceeds the 60 character limit'
        },
        buttons: []
      };

      const result = sanitizer.sanitize(message);
      expect(result.sanitized?.header?.text?.length).toBeLessThanOrEqual(60);
      expect(result.warnings).toContain('Header text truncated to 60 characters');
    });

    it('should truncate footer text exceeding 60 characters', () => {
      const message: ChannelMessage = {
        channel: 'whatsapp',
        text: 'Hello',
        footer: 'This is a very long footer that exceeds the 60 character limit',
        buttons: []
      };

      const result = sanitizer.sanitize(message);
      expect(result.sanitized?.footer?.length).toBeLessThanOrEqual(60);
      expect(result.warnings).toContain('Footer text truncated to 60 characters');
    });
  });

  describe('Button sanitization', () => {
    it('should limit buttons to maximum of 3', () => {
      const buttons: WhatsAppButton[] = [
        { type: 'reply', title: 'Button 1', id: 'btn1' },
        { type: 'reply', title: 'Button 2', id: 'btn2' },
        { type: 'reply', title: 'Button 3', id: 'btn3' },
        { type: 'reply', title: 'Button 4', id: 'btn4' },
      ];

      const message: ChannelMessage = {
        channel: 'whatsapp',
        text: 'Choose an option',
        buttons
      };

      const result = sanitizer.sanitize(message);
      expect(result.sanitized?.buttons?.length).toBe(3);
      expect(result.warnings).toContain('Button count reduced from 4 to 3');
    });

    it('should truncate button titles exceeding 20 characters', () => {
      const buttons: WhatsAppButton[] = [
        { type: 'reply', title: 'This is a very long button title', id: 'btn1' }
      ];

      const message: ChannelMessage = {
        channel: 'whatsapp',
        text: 'Choose an option',
        buttons
      };

      const result = sanitizer.sanitize(message);
      const sanitizedButton = result.sanitized?.buttons?.[0] as WhatsAppButton;
      expect(sanitizedButton.title.length).toBeLessThanOrEqual(20);
      expect(result.warnings.some(w => w.includes('truncated'))).toBe(true);
    });

    it('should truncate button IDs exceeding 256 characters', () => {
      const longId = 'x'.repeat(300);
      const buttons: WhatsAppButton[] = [
        { type: 'reply', title: 'Button', id: longId }
      ];

      const message: ChannelMessage = {
        channel: 'whatsapp',
        text: 'Choose an option',
        buttons
      };

      const result = sanitizer.sanitize(message);
      const sanitizedButton = result.sanitized?.buttons?.[0] as WhatsAppButton;
      expect(sanitizedButton.id.length).toBeLessThanOrEqual(256);
      expect(result.warnings).toContain('Button ID truncated to 256 characters');
    });

    it('should remove duplicate button titles (case-insensitive)', () => {
      const buttons: WhatsAppButton[] = [
        { type: 'reply', title: 'Option', id: 'btn1' },
        { type: 'reply', title: 'OPTION', id: 'btn2' },
        { type: 'reply', title: 'Different', id: 'btn3' }
      ];

      const message: ChannelMessage = {
        channel: 'whatsapp',
        text: 'Choose an option',
        buttons
      };

      const result = sanitizer.sanitize(message);
      expect(result.sanitized?.buttons?.length).toBe(2);
      expect(result.warnings).toContain('Duplicate button titles removed');
    });

    it('should normalize button titles with accents and apply title case', () => {
      const buttons: WhatsAppButton[] = [
        { type: 'reply', title: 'opção', id: 'btn1' },
        { type: 'reply', title: 'CONFIGURAÇÃO', id: 'btn2' }
      ];

      const message: ChannelMessage = {
        channel: 'whatsapp',
        text: 'Choose an option',
        buttons
      };

      const result = sanitizer.sanitize(message);
      const sanitizedButtons = result.sanitized?.buttons as WhatsAppButton[];
      expect(sanitizedButtons[0].title).toBe('Opcao');
      expect(sanitizedButtons[1].title).toBe('Configuracao');
    });

    it('should add fallback button when all buttons are invalid', () => {
      const buttons: WhatsAppButton[] = [
        { type: 'reply', title: '', id: 'btn1' }, // Empty title
      ];

      const message: ChannelMessage = {
        channel: 'whatsapp',
        text: 'Choose an option',
        buttons
      };

      // Mock the deduplication to remove all buttons
      const sanitizer = new WhatsAppSanitizer();
      const originalDedup = sanitizer['deduplicateButtonTitles'];
      sanitizer['deduplicateButtonTitles'] = jest.fn().mockReturnValue([]);

      const result = sanitizer.sanitize(message);
      expect(result.sanitized?.buttons?.length).toBe(1);
      expect((result.sanitized?.buttons?.[0] as WhatsAppButton).title).toBe('Falar com atendente');
      expect(result.warnings).toContain('All buttons were invalid, added fallback button');
    });
  });
});

describe('Instagram Sanitizer', () => {
  let sanitizer: InstagramSanitizer;

  beforeEach(() => {
    sanitizer = new InstagramSanitizer();
  });

  describe('Quick Reply sanitization', () => {
    it('should cap quick replies to 3 for UX consistency', () => {
      const quickReplies: InstagramQuickReply[] = [
        { title: 'Option 1', payload: 'opt1' },
        { title: 'Option 2', payload: 'opt2' },
        { title: 'Option 3', payload: 'opt3' },
        { title: 'Option 4', payload: 'opt4' },
        { title: 'Option 5', payload: 'opt5' }
      ];

      const message: ChannelMessage = {
        channel: 'instagram',
        text: 'Choose an option',
        buttons: quickReplies
      };

      const result = sanitizer.sanitize(message);
      expect(result.sanitized?.buttons?.length).toBe(3);
      expect(result.warnings).toContain('Quick replies reduced from 5 to 3 for UX consistency');
    });

    it('should truncate text exceeding 1000 characters', () => {
      const longText = 'a'.repeat(1100);
      const message: ChannelMessage = {
        channel: 'instagram',
        text: longText,
        buttons: []
      };

      const result = sanitizer.sanitize(message);
      expect(result.sanitized?.text.length).toBeLessThanOrEqual(1000);
      expect(result.warnings).toContain('Text truncated to 1000 characters');
    });

    it('should truncate quick reply titles exceeding 20 characters', () => {
      const quickReplies: InstagramQuickReply[] = [
        { title: 'This is a very long quick reply title', payload: 'opt1' }
      ];

      const message: ChannelMessage = {
        channel: 'instagram',
        text: 'Choose an option',
        buttons: quickReplies
      };

      const result = sanitizer.sanitize(message);
      const sanitizedButton = result.sanitized?.buttons?.[0] as InstagramQuickReply;
      expect(sanitizedButton.title.length).toBeLessThanOrEqual(20);
    });

    it('should truncate quick reply payloads exceeding 1000 characters', () => {
      const longPayload = 'x'.repeat(1100);
      const quickReplies: InstagramQuickReply[] = [
        { title: 'Option', payload: longPayload }
      ];

      const message: ChannelMessage = {
        channel: 'instagram',
        text: 'Choose an option',
        buttons: quickReplies
      };

      const result = sanitizer.sanitize(message);
      const sanitizedButton = result.sanitized?.buttons?.[0] as InstagramQuickReply;
      expect(sanitizedButton.payload.length).toBeLessThanOrEqual(1000);
    });
  });

  describe('Button Template sanitization', () => {
    it('should truncate text exceeding 640 characters', () => {
      const longText = 'a'.repeat(700);
      const buttons: InstagramButton[] = [
        { type: 'web_url', title: 'Visit', url: 'https://example.com' }
      ];

      const message: ChannelMessage = {
        channel: 'instagram',
        text: longText,
        buttons
      };

      const result = sanitizer.sanitize(message);
      expect(result.sanitized?.text.length).toBeLessThanOrEqual(640);
      expect(result.warnings).toContain('Text truncated to 640 characters');
    });

    it('should validate HTTPS URLs for web_url buttons', () => {
      const buttons: InstagramButton[] = [
        { type: 'web_url', title: 'Visit', url: 'http://example.com' }, // HTTP not allowed
        { type: 'web_url', title: 'Secure', url: 'https://example.com' } // HTTPS allowed
      ];

      const message: ChannelMessage = {
        channel: 'instagram',
        text: 'Check these links',
        buttons
      };

      const result = sanitizer.sanitize(message);
      expect(result.errors).toContain('Web URL button "Visit" must use HTTPS');
      expect(result.isValid).toBe(false);
    });

    it('should validate domain allowlist for web_url buttons', () => {
      const config = {
        allowedDomains: ['example.com', 'trusted.com']
      };
      const sanitizer = new InstagramSanitizer(config);

      const buttons: InstagramButton[] = [
        { type: 'web_url', title: 'Allowed', url: 'https://example.com' },
        { type: 'web_url', title: 'Disallowed', url: 'https://malicious.com' }
      ];

      const message: ChannelMessage = {
        channel: 'instagram',
        text: 'Check these links',
        buttons
      };

      const result = sanitizer.sanitize(message);
      expect(result.errors).toContain('Web URL button "Disallowed" has invalid or disallowed domain');
      expect(result.isValid).toBe(false);
    });

    it('should limit buttons to maximum of 3', () => {
      const buttons: InstagramButton[] = [
        { type: 'postback', title: 'Button 1', payload: 'btn1' },
        { type: 'postback', title: 'Button 2', payload: 'btn2' },
        { type: 'postback', title: 'Button 3', payload: 'btn3' },
        { type: 'postback', title: 'Button 4', payload: 'btn4' }
      ];

      const message: ChannelMessage = {
        channel: 'instagram',
        text: 'Choose an option',
        buttons
      };

      const result = sanitizer.sanitize(message);
      expect(result.sanitized?.buttons?.length).toBe(3);
      expect(result.warnings).toContain('Button count reduced from 4 to 3');
    });

    it('should add fallback button when all buttons are invalid', () => {
      const buttons: InstagramButton[] = [
        { type: 'web_url', title: 'Invalid', url: 'http://malicious.com' }
      ];

      const message: ChannelMessage = {
        channel: 'instagram',
        text: 'Choose an option',
        buttons
      };

      const result = sanitizer.sanitize(message);
      expect(result.sanitized?.buttons?.length).toBe(1);
      expect((result.sanitized?.buttons?.[0] as InstagramButton).title).toBe('Falar com atendente');
      expect(result.warnings).toContain('All buttons were invalid, added fallback button');
    });
  });
});

describe('Factory functions', () => {
  it('should create WhatsApp sanitizer', () => {
    const sanitizer = createSanitizer('whatsapp');
    expect(sanitizer).toBeInstanceOf(WhatsAppSanitizer);
  });

  it('should create Instagram sanitizer', () => {
    const sanitizer = createSanitizer('instagram');
    expect(sanitizer).toBeInstanceOf(InstagramSanitizer);
  });

  it('should create Instagram sanitizer for messenger channel', () => {
    const sanitizer = createSanitizer('messenger');
    expect(sanitizer).toBeInstanceOf(InstagramSanitizer);
  });

  it('should throw error for unsupported channel', () => {
    expect(() => createSanitizer('unsupported' as any)).toThrow('Unsupported channel: unsupported');
  });
});

describe('Main sanitization function', () => {
  it('should sanitize WhatsApp message', () => {
    const message: ChannelMessage = {
      channel: 'whatsapp',
      text: 'Hello   world\u200B',
      buttons: [
        { type: 'reply', title: 'opção', id: 'btn1' }
      ]
    };

    const result = sanitizeMessage(message);
    expect(result.sanitized?.text).toBe('Hello world');
    expect((result.sanitized?.buttons?.[0] as WhatsAppButton).title).toBe('Opcao');
  });

  it('should sanitize Instagram message', () => {
    const message: ChannelMessage = {
      channel: 'instagram',
      text: 'Hello   world\u200B',
      buttons: [
        { title: 'opção', payload: 'opt1' }
      ]
    };

    const result = sanitizeMessage(message);
    expect(result.sanitized?.text).toBe('Hello world');
    expect((result.sanitized?.buttons?.[0] as InstagramQuickReply).title).toBe('Opcao');
  });

  it('should pass configuration to sanitizer', () => {
    const config = {
      allowedDomains: ['example.com'],
      maxConsecutiveEmojis: 2
    };

    const message: ChannelMessage = {
      channel: 'whatsapp',
      text: 'Hello 😀😀😀😀 world',
      buttons: []
    };

    const result = sanitizeMessage(message, config);
    expect(result.sanitized?.text).toBe('Hello 😀😀 world');
  });
});

describe('Edge cases', () => {
  it('should handle empty text', () => {
    const message: ChannelMessage = {
      channel: 'whatsapp',
      text: '',
      buttons: []
    };

    const result = sanitizeMessage(message);
    expect(result.sanitized?.text).toBe('');
    expect(result.isValid).toBe(true);
  });

  it('should handle null/undefined values', () => {
    const message: ChannelMessage = {
      channel: 'whatsapp',
      text: 'Hello',
      header: {
        type: 'text',
        text: undefined
      },
      footer: undefined,
      buttons: undefined
    };

    const result = sanitizeMessage(message);
    expect(result.isValid).toBe(true);
    expect(result.sanitized?.text).toBe('Hello');
  });

  it('should handle messages with only whitespace', () => {
    const message: ChannelMessage = {
      channel: 'whatsapp',
      text: '   \n\t   ',
      buttons: []
    };

    const result = sanitizeMessage(message);
    expect(result.sanitized?.text).toBe('');
  });

  it('should handle buttons with empty titles', () => {
    const buttons: WhatsAppButton[] = [
      { type: 'reply', title: '', id: 'btn1' },
      { type: 'reply', title: '   ', id: 'btn2' },
      { type: 'reply', title: 'Valid', id: 'btn3' }
    ];

    const message: ChannelMessage = {
      channel: 'whatsapp',
      text: 'Choose an option',
      buttons
    };

    const result = sanitizeMessage(message);
    // Should keep only the valid button
    expect(result.sanitized?.buttons?.length).toBe(1);
    expect((result.sanitized?.buttons?.[0] as WhatsAppButton).title).toBe('Valid');
  });
});