/**
 * Regression snapshot tests for Chatwit content_attributes
 * 
 * These tests lock the contract for content_attributes format per channel
 * to prevent regressions in API response structure.
 * 
 * Requirements: 13.2, 4.1, 5.1
 */

import { MessageFormatterService } from '@/lib/ai-integration/services/message-formatter';
import { SanitizationService } from '@/lib/ai-integration/services/sanitization';

describe('Chatwit Content Attributes Regression Snapshots', () => {
  let messageFormatter: MessageFormatterService;
  let sanitizationService: SanitizationService;

  beforeEach(() => {
    messageFormatter = new MessageFormatterService();
    sanitizationService = new SanitizationService();
  });

  describe('WhatsApp Interactive Message Snapshots', () => {
    it('should match WhatsApp interactive button format snapshot', () => {
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
        traceId: 'trace-wa-interactive-001',
      });

      expect(result).toMatchSnapshot('whatsapp-interactive-button-format');
      expect(result.content_attributes.interactive.type).toBe('button');
      expect(result.content_attributes.interactive.action.buttons).toHaveLength(3);
    });

    it('should match WhatsApp interactive with header only snapshot', () => {
      const input = {
        body: 'Escolha uma opção abaixo:',
        header: 'Menu Principal',
        buttons: [
          { title: 'Produtos', id: 'intent:products' },
          { title: 'Suporte', id: 'intent:support' },
        ],
      };

      const result = messageFormatter.formatWhatsAppInteractive(input, {
        accountId: 123,
        conversationId: 456,
        traceId: 'trace-wa-header-only-001',
      });

      expect(result).toMatchSnapshot('whatsapp-interactive-header-only');
    });

    it('should match WhatsApp interactive with footer only snapshot', () => {
      const input = {
        body: 'Precisa de mais informações?',
        footer: 'Powered by SocialWise',
        buttons: [
          { title: 'Sim', id: 'intent:yes' },
          { title: 'Não', id: 'intent:no' },
        ],
      };

      const result = messageFormatter.formatWhatsAppInteractive(input, {
        accountId: 123,
        conversationId: 456,
        traceId: 'trace-wa-footer-only-001',
      });

      expect(result).toMatchSnapshot('whatsapp-interactive-footer-only');
    });

    it('should match WhatsApp interactive minimal format snapshot', () => {
      const input = {
        body: 'Confirmar ação?',
        buttons: [
          { title: 'Confirmar', id: 'confirm' },
        ],
      };

      const result = messageFormatter.formatWhatsAppInteractive(input, {
        accountId: 123,
        conversationId: 456,
        traceId: 'trace-wa-minimal-001',
      });

      expect(result).toMatchSnapshot('whatsapp-interactive-minimal');
    });

    it('should match WhatsApp interactive with economic mode snapshot', () => {
      const input = {
        body: 'Como ajudar?',
        buttons: [
          { title: 'Ajuda', id: 'help' },
        ],
      };

      const result = messageFormatter.formatWhatsAppInteractive(input, {
        accountId: 123,
        conversationId: 456,
        traceId: 'trace-wa-economic-001',
        economicMode: true,
      });

      expect(result).toMatchSnapshot('whatsapp-interactive-economic-mode');
      expect(result.additional_attributes.economic_mode).toBe(true);
    });

    it('should match WhatsApp interactive with sanitized content snapshot', () => {
      const input = {
        body: 'Esta é uma mensagem muito longa que precisa ser truncada para caber nos limites do WhatsApp. O texto original era muito maior mas foi cortado preservando as palavras completas sem cortar no meio de uma palavra para manter a legibilidade.',
        buttons: [
          { title: 'Botão com título muito longo que será truncado', id: 'long_button_1' },
          { title: 'Outro botão longo', id: 'long_button_2' },
          { title: 'Terceiro botão', id: 'button_3' },
          { title: 'Quarto botão que será removido', id: 'button_4' }, // Will be removed (max 3)
        ],
      };

      const sanitized = sanitizationService.sanitizeWhatsAppMessage(input);
      const result = messageFormatter.formatWhatsAppInteractive(sanitized.sanitized, {
        accountId: 123,
        conversationId: 456,
        traceId: 'trace-wa-sanitized-001',
      });

      expect(result).toMatchSnapshot('whatsapp-interactive-sanitized');
      expect(result.content_attributes.interactive.action.buttons).toHaveLength(3);
    });
  });

  describe('Instagram Quick Reply Message Snapshots', () => {
    it('should match Instagram quick reply format snapshot', () => {
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
        conversationId: 457,
        traceId: 'trace-ig-quick-reply-001',
      });

      expect(result).toMatchSnapshot('instagram-quick-reply-format');
      expect(result.content_attributes.ig.message.quick_replies).toHaveLength(3);
    });

    it('should match Instagram quick reply with single option snapshot', () => {
      const input = {
        text: 'Confirmar esta ação?',
        quick_replies: [
          { title: 'Confirmar', payload: 'confirm_action' },
        ],
      };

      const result = messageFormatter.formatInstagramQuickReply(input, {
        accountId: 123,
        conversationId: 457,
        traceId: 'trace-ig-quick-single-001',
      });

      expect(result).toMatchSnapshot('instagram-quick-reply-single');
    });

    it('should match Instagram quick reply with sanitized content snapshot', () => {
      const input = {
        text: 'Esta é uma mensagem muito longa para Instagram que precisa ser truncada para caber nos limites da plataforma. O texto original era muito maior mas foi cortado preservando as palavras completas.',
        quick_replies: Array.from({ length: 10 }, (_, i) => ({
          title: `Opção ${i + 1}`,
          payload: `option_${i + 1}`,
        })),
      };

      const sanitized = sanitizationService.sanitizeInstagramQuickReply(input);
      const result = messageFormatter.formatInstagramQuickReply(sanitized.sanitized, {
        accountId: 123,
        conversationId: 457,
        traceId: 'trace-ig-quick-sanitized-001',
      });

      expect(result).toMatchSnapshot('instagram-quick-reply-sanitized');
      expect(result.content_attributes.ig.message.quick_replies).toHaveLength(3); // Capped at 3
    });
  });

  describe('Instagram Button Template Message Snapshots', () => {
    it('should match Instagram button template format snapshot', () => {
      const input = {
        text: 'Como posso ajudar você?',
        buttons: [
          { type: 'postback' as const, title: 'Rastrear', payload: 'intent:track_order' },
          { type: 'web_url' as const, title: 'Site', url: 'https://example.com' },
          { type: 'postback' as const, title: 'Suporte', payload: 'human_handoff' },
        ],
      };

      const result = messageFormatter.formatInstagramButtonTemplate(input, {
        accountId: 123,
        conversationId: 457,
        traceId: 'trace-ig-button-template-001',
      });

      expect(result).toMatchSnapshot('instagram-button-template-format');
      expect(result.content_attributes.ig.message.attachment.payload.template_type).toBe('button');
      expect(result.content_attributes.ig.message.attachment.payload.buttons).toHaveLength(3);
    });

    it('should match Instagram button template with postback only snapshot', () => {
      const input = {
        text: 'Selecione uma categoria:',
        buttons: [
          { type: 'postback' as const, title: 'Eletrônicos', payload: 'category:electronics' },
          { type: 'postback' as const, title: 'Roupas', payload: 'category:clothing' },
        ],
      };

      const result = messageFormatter.formatInstagramButtonTemplate(input, {
        accountId: 123,
        conversationId: 457,
        traceId: 'trace-ig-postback-only-001',
      });

      expect(result).toMatchSnapshot('instagram-button-template-postback-only');
    });

    it('should match Instagram button template with web_url only snapshot', () => {
      const input = {
        text: 'Visite nossos links:',
        buttons: [
          { type: 'web_url' as const, title: 'Site Principal', url: 'https://example.com' },
          { type: 'web_url' as const, title: 'Blog', url: 'https://blog.example.com' },
        ],
      };

      const result = messageFormatter.formatInstagramButtonTemplate(input, {
        accountId: 123,
        conversationId: 457,
        traceId: 'trace-ig-weburl-only-001',
      });

      expect(result).toMatchSnapshot('instagram-button-template-weburl-only');
    });

    it('should match Instagram button template with HTTPS validation snapshot', () => {
      const input = {
        text: 'Links disponíveis:',
        buttons: [
          { type: 'web_url' as const, title: 'HTTP Site', url: 'http://example.com' }, // Will be removed
          { type: 'web_url' as const, title: 'HTTPS Site', url: 'https://example.com' }, // Will remain
          { type: 'postback' as const, title: 'Suporte', payload: 'support' },
        ],
      };

      const sanitized = sanitizationService.sanitizeInstagramButtonTemplate(input);
      const result = messageFormatter.formatInstagramButtonTemplate(sanitized.sanitized, {
        accountId: 123,
        conversationId: 457,
        traceId: 'trace-ig-https-validation-001',
      });

      expect(result).toMatchSnapshot('instagram-button-template-https-validation');
      expect(result.content_attributes.ig.message.attachment.payload.buttons).toHaveLength(2); // HTTP removed
    });
  });

  describe('Messenger Button Template Message Snapshots', () => {
    it('should match Messenger button template format snapshot', () => {
      const input = {
        text: 'How can I help you?',
        buttons: [
          { type: 'postback' as const, title: 'Track Order', payload: 'intent:track_order' },
          { type: 'web_url' as const, title: 'Website', url: 'https://example.com' },
        ],
      };

      const result = messageFormatter.formatMessengerButtonTemplate(input, {
        accountId: 123,
        conversationId: 458,
        traceId: 'trace-messenger-template-001',
      });

      expect(result).toMatchSnapshot('messenger-button-template-format');
      expect(result.content_attributes.messenger.message.attachment.payload.template_type).toBe('button');
      expect(result.additional_attributes.channel).toBe('messenger');
    });
  });

  describe('Special Response Format Snapshots', () => {
    it('should match human handoff response format snapshot', () => {
      const input = {
        text: 'Acionei um atendente humano para ajudar você.',
        handoffReason: 'ai_failure',
        assignToTeam: 'support',
        conversationTags: ['ai_handoff', 'escalation'],
      };

      const result = messageFormatter.formatHumanHandoff(input, {
        accountId: 123,
        conversationId: 456,
        traceId: 'trace-handoff-001',
        channel: 'whatsapp',
      });

      expect(result).toMatchSnapshot('human-handoff-response-format');
      expect(result.additional_attributes.handoff_reason).toBe('ai_failure');
      expect(result.additional_attributes.assign_to_team).toBe('support');
      expect(result.additional_attributes.conversation_tags).toContain('ai_handoff');
    });

    it('should match simple text response format snapshot', () => {
      const input = {
        text: 'Obrigado pela sua mensagem! Um atendente entrará em contato em breve.',
      };

      const result = messageFormatter.formatWhatsAppText(input, {
        accountId: 123,
        conversationId: 456,
        traceId: 'trace-simple-text-001',
      });

      expect(result).toMatchSnapshot('simple-text-response-format');
      expect(result.message_type).toBe('outgoing');
      expect(result.additional_attributes.channel).toBe('whatsapp');
    });
  });

  describe('Schema Version Compliance Snapshots', () => {
    it('should match schema version 1.0.0 compliance snapshot', () => {
      const testCases = [
        {
          name: 'whatsapp-text',
          result: messageFormatter.formatWhatsAppText(
            { text: 'Test message' },
            { accountId: 1, conversationId: 1, traceId: 'test-schema-wa-text' }
          ),
        },
        {
          name: 'whatsapp-interactive',
          result: messageFormatter.formatWhatsAppInteractive(
            { body: 'Test', buttons: [{ title: 'OK', id: 'ok' }] },
            { accountId: 1, conversationId: 1, traceId: 'test-schema-wa-interactive' }
          ),
        },
        {
          name: 'instagram-quick-reply',
          result: messageFormatter.formatInstagramQuickReply(
            { text: 'Test', quick_replies: [{ title: 'OK', payload: 'ok' }] },
            { accountId: 1, conversationId: 1, traceId: 'test-schema-ig-quick' }
          ),
        },
        {
          name: 'instagram-button-template',
          result: messageFormatter.formatInstagramButtonTemplate(
            { text: 'Test', buttons: [{ type: 'postback', title: 'OK', payload: 'ok' }] },
            { accountId: 1, conversationId: 1, traceId: 'test-schema-ig-button' }
          ),
        },
      ];

      testCases.forEach((testCase, index) => {
        expect(testCase.result.additional_attributes.schema_version).toBe('1.0.0');
        expect(testCase.result).toMatchSnapshot(`schema-version-compliance-${testCase.name}`);
      });
    });

    it('should match required additional_attributes fields snapshot', () => {
      const result = messageFormatter.formatWhatsAppText(
        { text: 'Test required fields' },
        {
          accountId: 123,
          conversationId: 456,
          traceId: 'trace-required-fields-001',
        }
      );

      expect(result).toMatchSnapshot('required-additional-attributes-fields');
      expect(result.additional_attributes).toHaveProperty('provider', 'meta');
      expect(result.additional_attributes).toHaveProperty('channel', 'whatsapp');
      expect(result.additional_attributes).toHaveProperty('schema_version', '1.0.0');
      expect(result.additional_attributes).toHaveProperty('trace_id', 'trace-required-fields-001');
    });
  });

  describe('Edge Cases and Sanitization Snapshots', () => {
    it('should match fallback button insertion snapshot', () => {
      const input = {
        body: 'Escolha uma opção:',
        buttons: [], // No buttons provided
      };

      const sanitized = sanitizationService.sanitizeWhatsAppMessage(input);
      const result = messageFormatter.formatWhatsAppInteractive(sanitized.sanitized, {
        accountId: 123,
        conversationId: 456,
        traceId: 'trace-fallback-button-001',
      });

      expect(result).toMatchSnapshot('fallback-button-insertion');
      expect(result.content_attributes.interactive.action.buttons).toHaveLength(1);
      expect(result.content_attributes.interactive.action.buttons[0].reply.title).toBe('Falar com atendente');
    });

    it('should match unique button titles enforcement snapshot', () => {
      const input = {
        body: 'Escolha uma opção:',
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
        traceId: 'trace-unique-titles-001',
      });

      expect(result).toMatchSnapshot('unique-button-titles-enforcement');
      expect(result.content_attributes.interactive.action.buttons).toHaveLength(2); // Duplicates removed
    });

    it('should match word boundary preservation snapshot', () => {
      const longText = 'Esta é uma mensagem muito longa que precisa ser truncada mas deve preservar as palavras completas sem cortar no meio de uma palavra para manter a legibilidade do texto. ' + 'A'.repeat(1000); // Ensure it exceeds 1024 chars
      const input = {
        body: longText,
        buttons: [{ title: 'OK', id: 'ok' }],
      };

      const sanitized = sanitizationService.sanitizeWhatsAppMessage(input);
      const result = messageFormatter.formatWhatsAppInteractive(sanitized.sanitized, {
        accountId: 123,
        conversationId: 456,
        traceId: 'trace-word-boundary-001',
      });

      expect(result).toMatchSnapshot('word-boundary-preservation');
      expect(result.content_attributes.interactive.body.text).not.toMatch(/\s\w+$/); // Should not end with partial word
      expect(result.content_attributes.interactive.body.text).toMatch(/\.\.\.$|…$/); // Should end with ellipsis
    });
  });

  describe('Cross-Channel Consistency Snapshots', () => {
    it('should match consistent additional_attributes across channels', () => {
      const baseContext = {
        accountId: 123,
        conversationId: 456,
        traceId: 'trace-consistency-001',
      };

      const whatsappResult = messageFormatter.formatWhatsAppText(
        { text: 'Test message' },
        baseContext
      );

      const instagramResult = messageFormatter.formatInstagramQuickReply(
        { text: 'Test message', quick_replies: [{ title: 'OK', payload: 'ok' }] },
        baseContext
      );

      const messengerResult = messageFormatter.formatMessengerButtonTemplate(
        { text: 'Test message', buttons: [{ type: 'postback', title: 'OK', payload: 'ok' }] },
        baseContext
      );

      expect({
        whatsapp: whatsappResult.additional_attributes,
        instagram: instagramResult.additional_attributes,
        messenger: messengerResult.additional_attributes,
      }).toMatchSnapshot('cross-channel-additional-attributes-consistency');

      // Verify all have required fields
      [whatsappResult, instagramResult, messengerResult].forEach(result => {
        expect(result.additional_attributes.provider).toBe('meta');
        expect(result.additional_attributes.schema_version).toBe('1.0.0');
        expect(result.additional_attributes.trace_id).toBe('trace-consistency-001');
      });
    });
  });
});