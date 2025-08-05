/**
 * Contract tests for Chatwit webhook payloads
 * Tests webhook payload validation and processing with real fixtures
 */

import {
  whatsappIncomingTextFixture,
  whatsappButtonReplyFixture,
  instagramIncomingTextFixture,
  instagramQuickReplyFixture,
  instagramPostbackFixture,
  messengerIncomingTextFixture,
  invalidPayloadFixtures,
  edgeCaseFixtures,
} from './fixtures/chatwit-webhook-payloads';

import { validateWebhookPayload } from '@/lib/ai-integration/schemas/webhook';
import { processWebhookPayload } from '@/lib/ai-integration/services/payload-router';

// Mock external dependencies
jest.mock('@/lib/ai-integration/services/idempotency');
jest.mock('@/lib/ai-integration/services/rate-limiter');
jest.mock('@/lib/ai-integration/services/hmac-validation');

describe('Chatwit Webhook Contract Tests', () => {
  describe('WhatsApp Webhook Payloads', () => {
    it('should validate WhatsApp incoming text message', () => {
      const result = validateWebhookPayload(whatsappIncomingTextFixture);

      expect(result.isValid).toBe(true);
      expect(result.data).toMatchSnapshot('whatsapp-incoming-text');
      expect(result.data?.channel).toBe('whatsapp');
      expect(result.data?.message.content).toBe('Olá, preciso de ajuda com meu pedido');
      expect(result.data?.message.source_id).toMatch(/^wamid\./);
    });

    it('should validate WhatsApp button reply payload', () => {
      const result = validateWebhookPayload(whatsappButtonReplyFixture);

      expect(result.isValid).toBe(true);
      expect(result.data).toMatchSnapshot('whatsapp-button-reply');
      expect(result.data?.message.content_attributes?.interactive?.button_reply?.id).toBe('intent:track_order');
      expect(result.data?.message.content_attributes?.interactive?.button_reply?.title).toBe('Rastrear Pedido');
    });

    it('should process WhatsApp payload and extract button click', () => {
      const mockServices = {
        idempotency: { checkIdempotency: jest.fn().mockResolvedValue({ isDuplicate: false }) },
        rateLimiter: { checkRateLimit: jest.fn().mockResolvedValue({ allowed: true }) },
        hmacValidation: { validateSignature: jest.fn().mockReturnValue({ isValid: true }) },
      };

      const result = processWebhookPayload(whatsappButtonReplyFixture, mockServices);

      expect(result).toMatchSnapshot('whatsapp-button-processing');
      expect(result.payload).toBe('intent:track_order');
      expect(result.isButtonClick).toBe(true);
    });
  });

  describe('Instagram Webhook Payloads', () => {
    it('should validate Instagram incoming text message', () => {
      const result = validateWebhookPayload(instagramIncomingTextFixture);

      expect(result.isValid).toBe(true);
      expect(result.data).toMatchSnapshot('instagram-incoming-text');
      expect(result.data?.channel).toBe('instagram');
      expect(result.data?.message.content).toBe('Oi! Quero saber sobre meus pedidos');
      expect(result.data?.message.source_id).toMatch(/^mid\./);
    });

    it('should validate Instagram quick reply payload', () => {
      const result = validateWebhookPayload(instagramQuickReplyFixture);

      expect(result.isValid).toBe(true);
      expect(result.data).toMatchSnapshot('instagram-quick-reply');
      expect(result.data?.message.content_attributes?.quick_reply?.payload).toBe('intent:cancel_order');
    });

    it('should validate Instagram postback payload', () => {
      const result = validateWebhookPayload(instagramPostbackFixture);

      expect(result.isValid).toBe(true);
      expect(result.data).toMatchSnapshot('instagram-postback');
      expect(result.data?.message.content_attributes?.postback?.payload).toBe('flow:get_started');
      expect(result.data?.message.content_attributes?.postback?.title).toBe('Começar');
    });

    it('should process Instagram quick reply and extract payload', () => {
      const mockServices = {
        idempotency: { checkIdempotency: jest.fn().mockResolvedValue({ isDuplicate: false }) },
        rateLimiter: { checkRateLimit: jest.fn().mockResolvedValue({ allowed: true }) },
        hmacValidation: { validateSignature: jest.fn().mockReturnValue({ isValid: true }) },
      };

      const result = processWebhookPayload(instagramQuickReplyFixture, mockServices);

      expect(result).toMatchSnapshot('instagram-quick-reply-processing');
      expect(result.payload).toBe('intent:cancel_order');
      expect(result.isButtonClick).toBe(true);
    });
  });

  describe('Messenger Webhook Payloads', () => {
    it('should validate Messenger incoming text message', () => {
      const result = validateWebhookPayload(messengerIncomingTextFixture);

      expect(result.isValid).toBe(true);
      expect(result.data).toMatchSnapshot('messenger-incoming-text');
      expect(result.data?.channel).toBe('messenger');
      expect(result.data?.message.content).toBe('Hello, I need help with my order');
      expect(result.data?.message.source_id).toMatch(/^mid\.messenger/);
    });
  });

  describe('Invalid Payload Validation', () => {
    it('should reject payload with missing account_id', () => {
      const result = validateWebhookPayload(invalidPayloadFixtures.missingAccountId);

      expect(result.isValid).toBe(false);
      expect(result.errors).toMatchSnapshot('missing-account-id-errors');
      expect(result.errors?.some(error => error.path.includes('account_id'))).toBe(true);
    });

    it('should reject payload with invalid channel', () => {
      const result = validateWebhookPayload(invalidPayloadFixtures.invalidChannel);

      expect(result.isValid).toBe(false);
      expect(result.errors).toMatchSnapshot('invalid-channel-errors');
      expect(result.errors?.some(error => error.message.includes('Invalid enum value'))).toBe(true);
    });

    it('should reject payload without content or content_attributes', () => {
      const result = validateWebhookPayload(invalidPayloadFixtures.missingMessageContent);

      expect(result.isValid).toBe(false);
      expect(result.errors).toMatchSnapshot('missing-content-errors');
    });

    it('should reject payload with invalid timestamp', () => {
      const result = validateWebhookPayload(invalidPayloadFixtures.invalidTimestamp);

      expect(result.isValid).toBe(false);
      expect(result.errors).toMatchSnapshot('invalid-timestamp-errors');
      expect(result.errors?.some(error => 
        error.path.includes('created_at') && error.message.includes('number')
      )).toBe(true);
    });
  });

  describe('Edge Case Payloads', () => {
    it('should handle very long content', () => {
      const result = validateWebhookPayload(edgeCaseFixtures.veryLongContent);

      expect(result.isValid).toBe(true);
      expect(result.data).toMatchSnapshot('very-long-content');
      expect(result.data?.message.content?.length).toBe(4096);
    });

    it('should handle special characters in content', () => {
      const result = validateWebhookPayload(edgeCaseFixtures.specialCharacters);

      expect(result.isValid).toBe(true);
      expect(result.data).toMatchSnapshot('special-characters');
      expect(result.data?.message.content).toContain('🎉');
      expect(result.data?.message.content).toContain('@#$%^&*()');
    });

    it('should handle null values correctly', () => {
      const result = validateWebhookPayload(edgeCaseFixtures.nullValues);

      expect(result.isValid).toBe(true);
      expect(result.data).toMatchSnapshot('null-values');
      expect(result.data?.message.content_type).toBeNull();
      expect(result.data?.message.source_id).toBeNull();
      expect(result.data?.message.sender).toBeNull();
    });

    it('should handle large ID values', () => {
      const result = validateWebhookPayload(edgeCaseFixtures.largeIds);

      expect(result.isValid).toBe(true);
      expect(result.data).toMatchSnapshot('large-ids');
      expect(result.data?.account_id).toBe(999999999999);
      expect(result.data?.conversation.id).toBe(888888888888);
    });
  });

  describe('Payload Processing Contract', () => {
    it('should extract namespaced payloads correctly', () => {
      const intentPayload = { ...whatsappButtonReplyFixture };
      intentPayload.message.content_attributes.interactive.button_reply.id = 'intent:track_order';

      const flowPayload = { ...whatsappButtonReplyFixture };
      flowPayload.message.content_attributes.interactive.button_reply.id = 'flow:checkout';

      const helpPayload = { ...whatsappButtonReplyFixture };
      helpPayload.message.content_attributes.interactive.button_reply.id = 'help:faq';

      const mockServices = {
        idempotency: { checkIdempotency: jest.fn().mockResolvedValue({ isDuplicate: false }) },
        rateLimiter: { checkRateLimit: jest.fn().mockResolvedValue({ allowed: true }) },
        hmacValidation: { validateSignature: jest.fn().mockReturnValue({ isValid: true }) },
      };

      const intentResult = processWebhookPayload(intentPayload, mockServices);
      const flowResult = processWebhookPayload(flowPayload, mockServices);
      const helpResult = processWebhookPayload(helpPayload, mockServices);

      expect(intentResult).toMatchSnapshot('intent-payload-processing');
      expect(flowResult).toMatchSnapshot('flow-payload-processing');
      expect(helpResult).toMatchSnapshot('help-payload-processing');

      expect(intentResult.namespace).toBe('intent');
      expect(intentResult.action).toBe('track_order');
      expect(flowResult.namespace).toBe('flow');
      expect(flowResult.action).toBe('checkout');
      expect(helpResult.namespace).toBe('help');
      expect(helpResult.action).toBe('faq');
    });

    it('should handle media messages by skipping processing', () => {
      const mediaPayload = {
        ...whatsappIncomingTextFixture,
        message: {
          ...whatsappIncomingTextFixture.message,
          content_type: 'image',
          content: null,
          content_attributes: {
            media: {
              type: 'image',
              url: 'https://example.com/image.jpg',
            },
          },
        },
      };

      const mockServices = {
        idempotency: { checkIdempotency: jest.fn().mockResolvedValue({ isDuplicate: false }) },
        rateLimiter: { checkRateLimit: jest.fn().mockResolvedValue({ allowed: true }) },
        hmacValidation: { validateSignature: jest.fn().mockReturnValue({ isValid: true }) },
      };

      const result = processWebhookPayload(mediaPayload, mockServices);

      expect(result).toMatchSnapshot('media-message-processing');
      expect(result.shouldSkip).toBe(true);
      expect(result.skipReason).toBe('MEDIA_MESSAGE');
    });

    it('should normalize text content', () => {
      const unnormalizedPayload = {
        ...whatsappIncomingTextFixture,
        message: {
          ...whatsappIncomingTextFixture.message,
          content: '  Olá, preciso de ajuda!  \n\t',
        },
      };

      const mockServices = {
        idempotency: { checkIdempotency: jest.fn().mockResolvedValue({ isDuplicate: false }) },
        rateLimiter: { checkRateLimit: jest.fn().mockResolvedValue({ allowed: true }) },
        hmacValidation: { validateSignature: jest.fn().mockReturnValue({ isValid: true }) },
      };

      const result = processWebhookPayload(unnormalizedPayload, mockServices);

      expect(result).toMatchSnapshot('normalized-text-processing');
      expect(result.normalizedText).toBe('Olá, preciso de ajuda!');
    });
  });

  describe('Backward Compatibility', () => {
    it('should handle legacy payload formats', () => {
      const legacyPayload = {
        account_id: 123,
        channel: 'whatsapp',
        conversation: {
          id: 456,
          inbox_id: 789,
          status: 'open',
        },
        message: {
          id: 101112,
          message_type: 'incoming',
          content: 'Legacy format message',
          created_at: 1704067200,
          // Legacy fields that might be present
          legacy_field: 'legacy_value',
        },
      };

      const result = validateWebhookPayload(legacyPayload);

      expect(result.isValid).toBe(true);
      expect(result.data).toMatchSnapshot('legacy-payload-format');
    });

    it('should handle schema version changes gracefully', () => {
      const futurePayload = {
        ...whatsappIncomingTextFixture,
        schema_version: '2.0.0', // Future version
        new_field: 'new_value', // New field in future version
      };

      const result = validateWebhookPayload(futurePayload);

      expect(result.isValid).toBe(true);
      expect(result.data).toMatchSnapshot('future-schema-version');
    });
  });
});