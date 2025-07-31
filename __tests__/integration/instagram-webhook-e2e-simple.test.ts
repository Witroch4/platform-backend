/**
 * Simplified Instagram Webhook E2E Integration Tests
 * Focus on core functionality to verify Instagram translation flow
 * Requirements: 1.1, 1.2, 1.3, 1.4, 6.1, 6.2, 6.3, 6.4
 */

import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals';

// Mock the webhook utils to test channel detection
import * as webhookUtils from '@/lib/webhook-utils';

describe('Instagram Webhook Channel Detection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Channel Type Detection', () => {
    test('should correctly detect Instagram channel type from payload', () => {
      const instagramPayload = {
        originalDetectIntentRequest: {
          payload: {
            channel_type: 'Channel::Instagram',
            inbox_id: '4',
            contact_phone: '+5511999999999',
            interaction_type: 'intent',
            wamid: 'wamid.instagram123',
            whatsapp_api_key: 'test-api-key',
            phone_number_id: '123456789',
            business_id: 'business123',
            contact_source: 'instagram',
            message_id: 12345,
            account_id: 1,
            account_name: 'Test Account',
          },
        },
        queryResult: {
          intent: {
            displayName: 'test.intent',
          },
        },
      };

      const result = webhookUtils.detectChannelType(instagramPayload);

      expect(result.isInstagram).toBe(true);
      expect(result.channelType).toBe('Channel::Instagram');
      expect(result.originalPayload).toBe(instagramPayload);
    });

    test('should correctly detect WhatsApp channel type from payload', () => {
      const whatsappPayload = {
        originalDetectIntentRequest: {
          payload: {
            channel_type: 'Channel::WhatsApp',
            inbox_id: '4',
            contact_phone: '+5511999999999',
            interaction_type: 'intent',
            wamid: 'wamid.whatsapp123',
            whatsapp_api_key: 'test-api-key',
            phone_number_id: '123456789',
            business_id: 'business123',
            contact_source: 'chatwit',
            message_id: 12345,
            account_id: 1,
            account_name: 'Test Account',
          },
        },
        queryResult: {
          intent: {
            displayName: 'test.intent',
          },
        },
      };

      const result = webhookUtils.detectChannelType(whatsappPayload);

      expect(result.isInstagram).toBe(false);
      expect(result.channelType).toBe('Channel::WhatsApp');
      expect(result.originalPayload).toBe(whatsappPayload);
    });

    test('should handle missing channel_type as non-Instagram', () => {
      const payloadWithoutChannelType = {
        originalDetectIntentRequest: {
          payload: {
            // No channel_type field
            inbox_id: '4',
            contact_phone: '+5511999999999',
            interaction_type: 'intent',
            wamid: 'wamid.unknown123',
            whatsapp_api_key: 'test-api-key',
            phone_number_id: '123456789',
            business_id: 'business123',
            contact_source: 'chatwit',
            message_id: 12345,
            account_id: 1,
            account_name: 'Test Account',
          },
        },
        queryResult: {
          intent: {
            displayName: 'test.intent',
          },
        },
      };

      const result = webhookUtils.detectChannelType(payloadWithoutChannelType);

      expect(result.isInstagram).toBe(false);
      expect(result.channelType).toBe('');
      expect(result.originalPayload).toBe(payloadWithoutChannelType);
    });

    test('should handle null/undefined payload gracefully', () => {
      const result1 = webhookUtils.detectChannelType(null);
      expect(result1.isInstagram).toBe(false);
      expect(result1.channelType).toBe('unknown');

      const result2 = webhookUtils.detectChannelType(undefined);
      expect(result2.isInstagram).toBe(false);
      expect(result2.channelType).toBe('unknown');

      const result3 = webhookUtils.detectChannelType({});
      expect(result3.isInstagram).toBe(false);
      expect(result3.channelType).toBe('');
    });

    test('should handle malformed payload gracefully', () => {
      const malformedPayload = {
        originalDetectIntentRequest: {
          // Missing payload field
        },
      };

      const result = webhookUtils.detectChannelType(malformedPayload);

      expect(result.isInstagram).toBe(false);
      expect(result.channelType).toBe('');
      expect(result.originalPayload).toBe(malformedPayload);
    });
  });

  describe('Webhook Data Extraction', () => {
    test('should extract webhook data correctly for Instagram', () => {
      const instagramPayload = {
        originalDetectIntentRequest: {
          payload: {
            channel_type: 'Channel::Instagram',
            inbox_id: '4',
            contact_phone: '+5511999999999',
            interaction_type: 'intent',
            wamid: 'wamid.instagram123',
            whatsapp_api_key: 'test-api-key',
            phone_number_id: '123456789',
            business_id: 'business123',
            contact_source: 'instagram',
            message_id: 12345,
            account_id: 1,
            account_name: 'Test Account',
          },
        },
        queryResult: {
          intent: {
            displayName: 'test.intent',
          },
        },
        session: 'projects/test-project/agent/sessions/+5511999999999',
      };

      const result = webhookUtils.extractWebhookData(instagramPayload);

      expect(result.whatsappApiKey).toBe('test-api-key');
      expect(result.messageId).toBe(12345); // message_id takes precedence over wamid
      expect(result.contactPhone).toBe('5511999999999'); // Cleaned phone number
      expect(result.inboxId).toBe('4');
      expect(result.intentName).toBe('test.intent');
      expect(result.conversationId).toBe('+5511999999999');
    });

    test('should extract contact phone from various payload locations', () => {
      // Test phone extraction from session
      const payload1 = {
        session: 'projects/test-project/agent/sessions/+5511999999999',
        originalDetectIntentRequest: {
          payload: {
            inbox_id: '4',
            whatsapp_api_key: 'test-api-key',
          },
        },
        queryResult: {
          intent: {
            displayName: 'test.intent',
          },
        },
      };

      const result1 = webhookUtils.extractContactPhone(payload1);
      expect(result1).toBe('5511999999999');

      // Test phone extraction from payload.from
      const payload2 = {
        originalDetectIntentRequest: {
          payload: {
            from: '+5511888888888',
            inbox_id: '4',
            whatsapp_api_key: 'test-api-key',
          },
        },
        queryResult: {
          intent: {
            displayName: 'test.intent',
          },
        },
      };

      const result2 = webhookUtils.extractContactPhone(payload2);
      expect(result2).toBe('5511888888888');
    });

    test('should validate webhook data correctly', () => {
      const validData = {
        whatsappApiKey: 'test-api-key',
        messageId: 'msg-123',
        conversationId: 'conv-123',
        contactPhone: '5511999999999',
        inboxId: '4',
        intentName: 'test.intent',
      };

      const result = webhookUtils.validateWebhookData(validData);
      expect(result).toBe(true);

      // Test with missing required fields
      const invalidData = {
        whatsappApiKey: '',
        messageId: '',
        conversationId: '',
        contactPhone: '',
        inboxId: '',
        intentName: '',
      };

      const result2 = webhookUtils.validateWebhookData(invalidData);
      expect(result2).toBe(false);
    });

    test('should check for valid API key correctly', () => {
      const payloadWithValidKey = {
        originalDetectIntentRequest: {
          payload: {
            whatsapp_api_key: 'valid-api-key-12345',
          },
        },
      };

      const result1 = webhookUtils.hasValidApiKey(payloadWithValidKey);
      expect(result1).toBe(true);

      const payloadWithShortKey = {
        originalDetectIntentRequest: {
          payload: {
            whatsapp_api_key: 'short',
          },
        },
      };

      const result2 = webhookUtils.hasValidApiKey(payloadWithShortKey);
      expect(result2).toBe(false);

      const payloadWithoutKey = {
        originalDetectIntentRequest: {
          payload: {},
        },
      };

      const result3 = webhookUtils.hasValidApiKey(payloadWithoutKey);
      expect(result3).toBe(false);
    });
  });

  describe('Message Content and Type Extraction', () => {
    test('should extract message content correctly', () => {
      const payload = {
        queryResult: {
          queryText: 'Hello, this is a test message',
        },
        originalDetectIntentRequest: {
          payload: {
            message: {
              text: 'Alternative text',
            },
          },
        },
      };

      const result = webhookUtils.extractMessageContent(payload);
      expect(result).toBe('Hello, this is a test message');

      // Test fallback to payload message text
      const payload2 = {
        originalDetectIntentRequest: {
          payload: {
            message: {
              text: 'Fallback text',
            },
          },
        },
      };

      const result2 = webhookUtils.extractMessageContent(payload2);
      expect(result2).toBe('Fallback text');

      // Test default message
      const emptyPayload = {};
      const result3 = webhookUtils.extractMessageContent(emptyPayload);
      expect(result3).toBe('Mensagem sem conteúdo de texto');
    });

    test('should extract message type correctly', () => {
      const textPayload = {
        queryResult: {
          queryText: 'Hello',
        },
      };

      const result1 = webhookUtils.extractMessageType(textPayload);
      expect(result1).toBe('text');

      const interactivePayload = {
        originalDetectIntentRequest: {
          payload: {
            type: 'interactive',
          },
        },
      };

      const result2 = webhookUtils.extractMessageType(interactivePayload);
      expect(result2).toBe('interactive');

      const unknownPayload = {};
      const result3 = webhookUtils.extractMessageType(unknownPayload);
      expect(result3).toBe('unknown');
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('should handle null/undefined payloads gracefully in all functions', () => {
      // Test extractWebhookData
      const result1 = webhookUtils.extractWebhookData(null);
      expect(result1.whatsappApiKey).toBe('');
      expect(result1.contactPhone).toBe('');
      expect(result1.inboxId).toBe('');
      expect(result1.intentName).toBe('Unknown');

      // Test extractContactPhone
      const result2 = webhookUtils.extractContactPhone(null);
      expect(result2).toBe('');

      // Test hasValidApiKey
      const result3 = webhookUtils.hasValidApiKey(null);
      expect(result3).toBe(false);

      // Test extractMessageContent
      const result4 = webhookUtils.extractMessageContent(null);
      expect(result4).toBe('Mensagem sem conteúdo de texto');

      // Test extractMessageType
      const result5 = webhookUtils.extractMessageType(null);
      expect(result5).toBe('unknown');
    });

    test('should handle malformed payloads gracefully', () => {
      const malformedPayload = {
        originalDetectIntentRequest: {
          // Missing payload field
        },
        queryResult: {
          // Missing intent field
        },
      };

      const result = webhookUtils.extractWebhookData(malformedPayload);
      expect(result.whatsappApiKey).toBe('');
      expect(result.messageId).toMatch(/^msg_\d+$/); // Should generate a timestamp-based ID
      expect(result.contactPhone).toBe('');
      expect(result.inboxId).toBe('');
      expect(result.intentName).toBe('Unknown');
    });

    test('should clean phone numbers correctly', () => {
      const payloads = [
        {
          session: 'projects/test/sessions/+55(11)99999-9999',
          originalDetectIntentRequest: { payload: {} },
          queryResult: { intent: { displayName: 'test' } },
        },
        {
          session: 'projects/test/sessions/55 11 99999 9999',
          originalDetectIntentRequest: { payload: {} },
          queryResult: { intent: { displayName: 'test' } },
        },
        {
          session: 'projects/test/sessions/+55.11.99999.9999',
          originalDetectIntentRequest: { payload: {} },
          queryResult: { intent: { displayName: 'test' } },
        },
      ];

      payloads.forEach(payload => {
        const result = webhookUtils.extractContactPhone(payload);
        expect(result).toBe('5511999999999');
      });
    });

    test('should handle very long phone numbers', () => {
      const payload = {
        session: 'projects/test/sessions/+551199999999912345678901234567890',
        originalDetectIntentRequest: { payload: {} },
        queryResult: { intent: { displayName: 'test' } },
      };

      const result = webhookUtils.extractContactPhone(payload);
      expect(result).toBe('551199999999912345678901234567890');
      expect(result.length).toBeGreaterThan(10); // Should accept long numbers
    });

    test('should reject very short phone numbers', () => {
      const payload = {
        session: 'projects/test/sessions/123456789', // Only 9 digits
        originalDetectIntentRequest: { payload: {} },
        queryResult: { intent: { displayName: 'test' } },
      };

      const result = webhookUtils.extractContactPhone(payload);
      expect(result).toBe(''); // Should reject short numbers
    });
  });
});