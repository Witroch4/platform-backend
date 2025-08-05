/**
 * Contract tests for Chatwit API responses
 * Tests API response format compliance and channel-specific content
 */

import {
  whatsappInteractiveResponseFixture,
  whatsappSimpleTextResponseFixture,
  instagramQuickReplyResponseFixture,
  instagramButtonTemplateResponseFixture,
  messengerButtonTemplateResponseFixture,
  humanHandoffResponseFixture,
  economicModeResponseFixture,
  sanitizedResponseFixtures,
  errorResponseFixtures,
} from './fixtures/chatwit-api-responses';

import { MessageFormatterService } from '@/lib/ai-integration/services/message-formatter';
import { SanitizationService } from '@/lib/ai-integration/services/sanitization';

describe('Chatwit API Contract Tests', () => {
  let messageFormatter: MessageFormatterService;
  let sanitizationService: SanitizationService;

  beforeEach(() => {
    messageFormatter = new MessageFormatterService();
    sanitizationService = new SanitizationService();
  });

  describe('WhatsApp API Response Contracts', () => {
    it('should format WhatsApp interactive message correctly', () => {
      const input = {
        body: 'Como posso ajudar você hoje?',
        header: 'Atendimento',
        footer: 'SocialWise',
        buttons: [
          { title: 'Rastrear Pedido', id: 'intent:track_order' },
          { title: 'Cancelar Pedido', id: 'intent:cancel_order' },
          { title: 'Falar com Atendente', id: 'human_handoff' },
        ],
      };

      const result = messageFormatter.formatWhatsAppInteractive(input, {
        accountId: 123,
        conversationId: 456,
        traceId: 'trace-abc-123',
      });

      expect(result).toMatchSnapshot('whatsapp-interactive-format');
      expect(result.content_attributes.interactive.type).toBe('button');
      expect(result.content_attributes.interactive.action.buttons).toHaveLength(3);
      expect(result.additional_attributes.schema_version).toBe('1.0.0');
    });

    it('should format WhatsApp simple text message correctly', () => {
      const input = {
        text: 'Obrigado pela sua mensagem! Um atendente entrará em contato em breve.',
      };

      const result = messageFormatter.formatWhatsAppText(input, {
        accountId: 123,
        conversationId: 456,
        traceId: 'trace-def-456',
      });

      expect(result).toMatchSnapshot('whatsapp-text-format');
      expect(result.content).toBe(input.text);
      expect(result.message_type).toBe('outgoing');
      expect(result.additional_attributes.channel).toBe('whatsapp');
    });

    it('should validate WhatsApp interactive button limits', () => {
      const input = {
        body: 'Choose an option',
        buttons: [
          { title: 'Option 1', id: 'opt1' },
          { title: 'Option 2', id: 'opt2' },
          { title: 'Option 3', id: 'opt3' },
          { title: 'Option 4', id: 'opt4' }, // Should be removed (max 3)
        ],
      };

      const sanitized = sanitizationService.sanitizeWhatsAppMessage(input);
      const result = messageFormatter.formatWhatsAppInteractive(sanitized.sanitized, {
        accountId: 123,
        conversationId: 456,
        traceId: 'trace-limits',
      });

      expect(result).toMatchSnapshot('whatsapp-button-limits');
      expect(result.content_attributes.interactive.action.buttons).toHaveLength(3);
    });

    it('should handle WhatsApp text truncation', () => {
      const longText = 'A'.repeat(1100); // Exceeds 1024 limit
      const input = {
        body: longText,
        buttons: [{ title: 'OK', id: 'ok' }],
      };

      const sanitized = sanitizationService.sanitizeWhatsAppMessage(input);
      const result = messageFormatter.formatWhatsAppInteractive(sanitized.sanitized, {
        accountId: 123,
        conversationId: 456,
        traceId: 'trace-truncation',
      });

      expect(result).toMatchSnapshot('whatsapp-text-truncation');
      expect(result.content_attributes.interactive.body.text.length).toBeLessThanOrEqual(1024);
      expect(result.content_attributes.interactive.body.text).toMatch(/\.\.\.$|…$/);
    });
  });

  describe('Instagram API Response Contracts', () => {
    it('should format Instagram quick reply correctly', () => {
      const input = {
        text: 'Escolha uma das opções abaixo:',
        quick_replies: [
          { title: 'Rastrear', payload: 'intent:track_order' },
          { title: 'Cancelar', payload: 'intent:cancel_order' },
          { title: 'Suporte', payload: 'human_handoff' },
        ],
      };

      const result = messageFormatter.formatInstagramQuickReply(input, {
        accountId: 123,
        conversationId: 456,
        traceId: 'trace-ghi-789',
      });

      expect(result).toMatchSnapshot('instagram-quick-reply-format');
      expect(result.content_attributes.ig.message.quick_replies).toHaveLength(3);
      expect(result.additional_attributes.channel).toBe('instagram');
    });

    it('should format Instagram button template correctly', () => {
      const input = {
        text: 'Como posso ajudar você?',
        buttons: [
          { type: 'postback', title: 'Rastrear', payload: 'intent:track_order' },
          { type: 'web_url', title: 'Site', url: 'https://example.com' },
          { type: 'postback', title: 'Suporte', payload: 'human_handoff' },
        ],
      };

      const result = messageFormatter.formatInstagramButtonTemplate(input, {
        accountId: 123,
        conversationId: 456,
        traceId: 'trace-jkl-012',
      });

      expect(result).toMatchSnapshot('instagram-button-template-format');
      expect(result.content_attributes.ig.message.attachment.payload.buttons).toHaveLength(3);
      expect(result.content_attributes.ig.message.attachment.payload.template_type).toBe('button');
    });

    it('should validate Instagram HTTPS URL requirement', () => {
      const input = {
        text: 'Visit our site',
        buttons: [
          { type: 'web_url', title: 'HTTP Site', url: 'http://example.com' }, // Should be removed
          { type: 'web_url', title: 'HTTPS Site', url: 'https://example.com' }, // Should remain
        ],
      };

      const sanitized = sanitizationService.sanitizeInstagramButtonTemplate(input);
      const result = messageFormatter.formatInstagramButtonTemplate(sanitized.sanitized, {
        accountId: 123,
        conversationId: 456,
        traceId: 'trace-https',
      });

      expect(result).toMatchSnapshot('instagram-https-validation');
      expect(result.content_attributes.ig.message.attachment.payload.buttons).toHaveLength(1);
      expect(result.content_attributes.ig.message.attachment.payload.buttons[0].url).toBe('https://example.com');
    });

    it('should limit Instagram quick replies to 3 for UX consistency', () => {
      const input = {
        text: 'Choose an option',
        quick_replies: Array.from({ length: 10 }, (_, i) => ({
          title: `Option ${i + 1}`,
          payload: `opt${i + 1}`,
        })),
      };

      const sanitized = sanitizationService.sanitizeInstagramQuickReply(input);
      const result = messageFormatter.formatInstagramQuickReply(sanitized.sanitized, {
        accountId: 123,
        conversationId: 456,
        traceId: 'trace-limit',
      });

      expect(result).toMatchSnapshot('instagram-quick-reply-limit');
      expect(result.content_attributes.ig.message.quick_replies).toHaveLength(3);
    });
  });

  describe('Messenger API Response Contracts', () => {
    it('should format Messenger button template correctly', () => {
      const input = {
        text: 'How can I help you?',
        buttons: [
          { type: 'postback', title: 'Track Order', payload: 'intent:track_order' },
          { type: 'web_url', title: 'Website', url: 'https://example.com' },
        ],
      };

      const result = messageFormatter.formatMessengerButtonTemplate(input, {
        accountId: 123,
        conversationId: 456,
        traceId: 'trace-mno-345',
      });

      expect(result).toMatchSnapshot('messenger-button-template-format');
      expect(result.content_attributes.messenger.message.attachment.payload.template_type).toBe('button');
      expect(result.additional_attributes.channel).toBe('messenger');
    });
  });

  describe('Special Response Contracts', () => {
    it('should format human handoff response correctly', () => {
      const input = {
        text: 'Acionei um atendente humano para ajudar você.',
        handoffReason: 'ai_failure',
        assignToTeam: 'support',
        conversationTags: ['ai_handoff'],
      };

      const result = messageFormatter.formatHumanHandoff(input, {
        accountId: 123,
        conversationId: 456,
        traceId: 'trace-pqr-678',
        channel: 'whatsapp',
      });

      expect(result).toMatchSnapshot('human-handoff-format');
      expect(result.additional_attributes.handoff_reason).toBe('ai_failure');
      expect(result.additional_attributes.assign_to_team).toBe('support');
      expect(result.additional_attributes.conversation_tags).toContain('ai_handoff');
    });

    it('should format economic mode response correctly', () => {
      const input = {
        body: 'Como ajudar?',
        buttons: [{ title: 'Ajuda', id: 'help' }],
        economicMode: true,
      };

      const result = messageFormatter.formatWhatsAppInteractive(input, {
        accountId: 123,
        conversationId: 456,
        traceId: 'trace-stu-901',
        economicMode: true,
      });

      expect(result).toMatchSnapshot('economic-mode-format');
      expect(result.additional_attributes.economic_mode).toBe(true);
      expect(result.content_attributes.interactive.body.text.length).toBeLessThan(200);
    });
  });

  describe('Sanitization Contract Compliance', () => {
    it('should ensure unique button titles (case-insensitive)', () => {
      const input = {
        body: 'Choose an option',
        buttons: [
          { title: 'Rastrear', id: 'track1' },
          { title: 'RASTREAR', id: 'track2' }, // Duplicate (different case)
          { title: 'rastrear', id: 'track3' }, // Duplicate (different case)
          { title: 'Cancelar', id: 'cancel' },
        ],
      };

      const sanitized = sanitizationService.sanitizeWhatsAppMessage(input);
      const result = messageFormatter.formatWhatsAppInteractive(sanitized.sanitized, {
        accountId: 123,
        conversationId: 456,
        traceId: 'trace-unique',
      });

      expect(result).toMatchSnapshot('unique-button-titles');
      expect(result.content_attributes.interactive.action.buttons).toHaveLength(2);
      
      const titles = result.content_attributes.interactive.action.buttons.map(b => b.reply.title.toLowerCase());
      expect(new Set(titles).size).toBe(titles.length); // All titles should be unique
    });

    it('should add fallback button when no valid buttons remain', () => {
      const input = {
        body: 'Choose an option',
        buttons: [], // No buttons
      };

      const sanitized = sanitizationService.sanitizeWhatsAppMessage(input);
      const result = messageFormatter.formatWhatsAppInteractive(sanitized.sanitized, {
        accountId: 123,
        conversationId: 456,
        traceId: 'trace-fallback',
      });

      expect(result).toMatchSnapshot('fallback-button');
      expect(result.content_attributes.interactive.action.buttons).toHaveLength(1);
      expect(result.content_attributes.interactive.action.buttons[0].reply.title).toBe('Falar com atendente');
      expect(result.content_attributes.interactive.action.buttons[0].reply.id).toBe('human_handoff');
    });

    it('should preserve word boundaries when truncating', () => {
      const input = {
        body: 'Esta é uma mensagem muito longa que precisa ser truncada mas deve preservar as palavras completas sem cortar no meio de uma palavra para manter a legibilidade do texto. ' + 'A'.repeat(1000), // Ensure it exceeds 1024 chars
        buttons: [{ title: 'OK', id: 'ok' }],
      };

      const sanitized = sanitizationService.sanitizeWhatsAppMessage(input);
      const result = messageFormatter.formatWhatsAppInteractive(sanitized.sanitized, {
        accountId: 123,
        conversationId: 456,
        traceId: 'trace-word-boundary',
      });

      expect(result).toMatchSnapshot('word-boundary-truncation');
      expect(result.content_attributes.interactive.body.text).not.toMatch(/\s\w+$/); // Should not end with partial word
    });
  });

  describe('Schema Version Compliance', () => {
    it('should always include schema_version in additional_attributes', () => {
      const testCases = [
        () => messageFormatter.formatWhatsAppText({ text: 'Test' }, { accountId: 1, conversationId: 1, traceId: 'test' }),
        () => messageFormatter.formatWhatsAppInteractive({ body: 'Test', buttons: [] }, { accountId: 1, conversationId: 1, traceId: 'test' }),
        () => messageFormatter.formatInstagramQuickReply({ text: 'Test', quick_replies: [] }, { accountId: 1, conversationId: 1, traceId: 'test' }),
        () => messageFormatter.formatInstagramButtonTemplate({ text: 'Test', buttons: [] }, { accountId: 1, conversationId: 1, traceId: 'test' }),
      ];

      testCases.forEach((testCase, index) => {
        const result = testCase();
        expect(result.additional_attributes.schema_version).toBe('1.0.0');
        expect(result).toMatchSnapshot(`schema-version-compliance-${index}`);
      });
    });

    it('should include required additional_attributes fields', () => {
      const result = messageFormatter.formatWhatsAppText({ text: 'Test' }, {
        accountId: 123,
        conversationId: 456,
        traceId: 'trace-required-fields',
      });

      expect(result).toMatchSnapshot('required-additional-attributes');
      expect(result.additional_attributes).toHaveProperty('provider', 'meta');
      expect(result.additional_attributes).toHaveProperty('channel');
      expect(result.additional_attributes).toHaveProperty('schema_version', '1.0.0');
      expect(result.additional_attributes).toHaveProperty('trace_id', 'trace-required-fields');
    });
  });

  describe('Error Response Contracts', () => {
    it('should handle validation error responses', () => {
      const errorResponse = errorResponseFixtures.invalidPayload;

      expect(errorResponse).toMatchSnapshot('validation-error-response');
      expect(errorResponse.code).toBe('VALIDATION_ERROR');
      expect(errorResponse.details).toHaveProperty('field');
      expect(errorResponse.details).toHaveProperty('message');
    });

    it('should handle authentication error responses', () => {
      const errorResponse = errorResponseFixtures.authenticationError;

      expect(errorResponse).toMatchSnapshot('authentication-error-response');
      expect(errorResponse.code).toBe('AUTHENTICATION_ERROR');
    });

    it('should handle rate limit error responses', () => {
      const errorResponse = errorResponseFixtures.rateLimitError;

      expect(errorResponse).toMatchSnapshot('rate-limit-error-response');
      expect(errorResponse.code).toBe('RATE_LIMIT_EXCEEDED');
      expect(errorResponse.retry_after).toBe(60);
    });

    it('should handle server error responses', () => {
      const errorResponse = errorResponseFixtures.serverError;

      expect(errorResponse).toMatchSnapshot('server-error-response');
      expect(errorResponse.code).toBe('INTERNAL_ERROR');
    });

    it('should handle resource not found responses', () => {
      const errorResponse = errorResponseFixtures.conversationNotFound;

      expect(errorResponse).toMatchSnapshot('resource-not-found-response');
      expect(errorResponse.code).toBe('RESOURCE_NOT_FOUND');
      expect(errorResponse.resource).toBe('conversation');
      expect(errorResponse.id).toBe(456);
    });
  });

  describe('Backward Compatibility', () => {
    it('should maintain compatibility with v1.0.0 schema', () => {
      const result = messageFormatter.formatWhatsAppText({ text: 'Test' }, {
        accountId: 123,
        conversationId: 456,
        traceId: 'trace-v1',
      });

      expect(result).toMatchSnapshot('v1-schema-compatibility');
      expect(result.additional_attributes.schema_version).toBe('1.0.0');
    });

    it('should handle legacy field names gracefully', () => {
      // Test that formatter can handle legacy input formats
      const legacyInput = {
        message_text: 'Test message', // Legacy field name
        interactive_buttons: [{ text: 'OK', value: 'ok' }], // Legacy format
      };

      // The formatter should normalize these to current format
      const normalized = messageFormatter.normalizeLegacyInput(legacyInput);
      const result = messageFormatter.formatWhatsAppText(normalized, {
        accountId: 123,
        conversationId: 456,
        traceId: 'trace-legacy',
      });

      expect(result).toMatchSnapshot('legacy-field-compatibility');
    });
  });
});