/**
 * Unit Tests for Webhook Utilities
 * Tests utility functions (DB queries, message formatters) in isolation
 * Requirements: 1.1, 1.3, 3.1, 3.2
 */

import {
  extractWebhookData,
  extractContactPhone,
  validateWebhookData,
  extractMessageContent,
  extractMessageType,
  hasValidApiKey,
  logWebhookData
} from '../webhook-utils';

describe('Webhook Utilities', () => {
  describe('extractWebhookData', () => {
    it('should extract complete webhook data from Dialogflow payload', () => {
      const payload = {
        queryResult: {
          intent: { displayName: 'welcome' },
          queryText: 'Hello'
        },
        originalDetectIntentRequest: {
          payload: {
            whatsapp_api_key: 'test-api-key-123',
            message_id: 'msg_123',
            wamid: 'wamid.456',
            conversation_id: 'conv_789',
            from: '5511999999999',
            inbox_id: 'inbox_101',
            contact_phone: '11999999999'
          }
        },
        session: 'projects/test/sessions/5511999999999'
      };

      const result = extractWebhookData(payload);

      expect(result).toEqual({
        whatsappApiKey: 'test-api-key-123',
        messageId: 'msg_123',
        conversationId: 'conv_789',
        contactPhone: '5511999999999',
        inboxId: 'inbox_101',
        intentName: 'welcome'
      });
    });

    it('should handle missing fields gracefully with fallbacks', () => {
      const payload = {
        queryResult: {
          intent: { displayName: 'test_intent' }
        },
        originalDetectIntentRequest: {
          payload: {
            access_token: 'fallback-token',
            id: 'fallback-id',
            from: '5511888888888'
          }
        },
        session: 'projects/test/sessions/5511888888888'
      };

      const result = extractWebhookData(payload);

      expect(result).toEqual({
        whatsappApiKey: 'fallback-token',
        messageId: 'fallback-id',
        conversationId: '5511888888888',
        contactPhone: '5511888888888',
        inboxId: '',
        intentName: 'test_intent'
      });
    });

    it('should generate fallback message ID when none provided', () => {
      const payload = {
        queryResult: {
          intent: { displayName: 'test' }
        },
        originalDetectIntentRequest: {
          payload: {}
        }
      };

      const result = extractWebhookData(payload);

      expect(result.messageId).toMatch(/^msg_\d+$/);
      expect(result.intentName).toBe('test');
    });
  });

  describe('extractContactPhone', () => {
    it('should extract phone from various payload locations', () => {
      const testCases = [
        {
          payload: {
            originalDetectIntentRequest: {
              payload: { from: '5511999999999' }
            }
          },
          expected: '5511999999999'
        },
        {
          payload: {
            originalDetectIntentRequest: {
              payload: { phone: '11-99999-9999' }
            }
          },
          expected: '11999999999'
        },
        {
          payload: {
            originalDetectIntentRequest: {
              payload: { contact: { phone: '+55 11 99999-9999' } }
            }
          },
          expected: '5511999999999'
        },
        {
          payload: {
            session: 'projects/test/sessions/5511888888888'
          },
          expected: '5511888888888'
        }
      ];

      testCases.forEach(({ payload, expected }) => {
        const result = extractContactPhone(payload);
        expect(result).toBe(expected);
      });
    });

    it('should return empty string for invalid phone numbers', () => {
      const testCases = [
        { originalDetectIntentRequest: { payload: { from: '123' } } }, // Too short
        { originalDetectIntentRequest: { payload: { phone: 'invalid' } } }, // Non-numeric
        { originalDetectIntentRequest: { payload: {} } }, // Missing
        {} // Empty payload
      ];

      testCases.forEach((payload) => {
        const result = extractContactPhone(payload);
        expect(result).toBe('');
      });
    });

    it('should clean phone numbers by removing non-numeric characters', () => {
      const payload = {
        originalDetectIntentRequest: {
          payload: { from: '+55 (11) 99999-9999' }
        }
      };

      const result = extractContactPhone(payload);
      expect(result).toBe('5511999999999');
    });
  });

  describe('validateWebhookData', () => {
    it('should validate complete webhook data', () => {
      const validData = {
        whatsappApiKey: 'test-api-key',
        messageId: 'msg_123',
        conversationId: 'conv_456',
        contactPhone: '5511999999999',
        inboxId: 'inbox_789',
        intentName: 'welcome'
      };

      const result = validateWebhookData(validData);
      expect(result).toBe(true);
    });

    it('should reject incomplete webhook data', () => {
      const testCases = [
        {
          // Missing messageId
          whatsappApiKey: 'test-api-key',
          messageId: '',
          conversationId: 'conv_456',
          contactPhone: '5511999999999',
          inboxId: 'inbox_789',
          intentName: 'welcome'
        },
        {
          // Missing contactPhone
          whatsappApiKey: 'test-api-key',
          messageId: 'msg_123',
          conversationId: 'conv_456',
          contactPhone: '',
          inboxId: 'inbox_789',
          intentName: 'welcome'
        },
        {
          // Missing intentName
          whatsappApiKey: 'test-api-key',
          messageId: 'msg_123',
          conversationId: 'conv_456',
          contactPhone: '5511999999999',
          inboxId: 'inbox_789',
          intentName: ''
        }
      ];

      testCases.forEach((data) => {
        const result = validateWebhookData(data);
        expect(result).toBe(false);
      });
    });
  });

  describe('extractMessageContent', () => {
    it('should extract message content from various payload locations', () => {
      const testCases = [
        {
          payload: {
            queryResult: { queryText: 'Hello from queryText' }
          },
          expected: 'Hello from queryText'
        },
        {
          payload: {
            originalDetectIntentRequest: {
              payload: {
                message: { text: 'Hello from message.text' }
              }
            }
          },
          expected: 'Hello from message.text'
        },
        {
          payload: {
            originalDetectIntentRequest: {
              payload: { text: 'Hello from payload.text' }
            }
          },
          expected: 'Hello from payload.text'
        },
        {
          payload: {},
          expected: 'Mensagem sem conteúdo de texto'
        }
      ];

      testCases.forEach(({ payload, expected }) => {
        const result = extractMessageContent(payload);
        expect(result).toBe(expected);
      });
    });
  });

  describe('extractMessageType', () => {
    it('should extract message type from payload', () => {
      const testCases = [
        {
          payload: {
            originalDetectIntentRequest: {
              payload: {
                message: { type: 'text' }
              }
            }
          },
          expected: 'text'
        },
        {
          payload: {
            originalDetectIntentRequest: {
              payload: { type: 'image' }
            }
          },
          expected: 'image'
        },
        {
          payload: {
            queryResult: { queryText: 'Some text' }
          },
          expected: 'text'
        },
        {
          payload: {},
          expected: 'unknown'
        }
      ];

      testCases.forEach(({ payload, expected }) => {
        const result = extractMessageType(payload);
        expect(result).toBe(expected);
      });
    });
  });

  describe('hasValidApiKey', () => {
    it('should validate WhatsApp API keys', () => {
      const testCases = [
        {
          payload: {
            originalDetectIntentRequest: {
              payload: { whatsapp_api_key: 'valid-api-key-123456' }
            }
          },
          expected: true
        },
        {
          payload: {
            originalDetectIntentRequest: {
              payload: { access_token: 'valid-access-token-123456' }
            }
          },
          expected: true
        },
        {
          payload: {
            originalDetectIntentRequest: {
              payload: { whatsapp_api_key: 'short' }
            }
          },
          expected: false
        },
        {
          payload: {
            originalDetectIntentRequest: {
              payload: { whatsapp_api_key: 123 }
            }
          },
          expected: false
        },
        {
          payload: {
            originalDetectIntentRequest: {
              payload: {}
            }
          },
          expected: false
        }
      ];

      testCases.forEach(({ payload, expected }) => {
        const result = hasValidApiKey(payload);
        expect(result).toBe(expected);
      });
    });
  });

  describe('logWebhookData', () => {
    let consoleSpy: jest.SpyInstance;

    beforeEach(() => {
      consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    });

    afterEach(() => {
      consoleSpy.mockRestore();
    });

    it('should log webhook data with masked API key', () => {
      const data = {
        whatsappApiKey: 'very-long-api-key-123456789',
        messageId: 'msg_123',
        conversationId: 'conv_456',
        contactPhone: '5511999999999',
        inboxId: 'inbox_789',
        intentName: 'welcome'
      };

      const payload = {
        queryResult: { intent: { displayName: 'welcome' } },
        originalDetectIntentRequest: {
          payload: { whatsapp_api_key: 'very-long-api-key-123456789' }
        }
      };

      logWebhookData(data, payload);

      expect(consoleSpy).toHaveBeenCalledWith(
        '[MTF Diamante Webhook] Dados extraídos:',
        expect.objectContaining({
          whatsappApiKey: 'very-long-...', // Masked API key
          messageId: 'msg_123',
          conversationId: 'conv_456',
          contactPhone: '5511999999999',
          inboxId: 'inbox_789',
          intentName: 'welcome',
          hasApiKey: true,
          payloadKeys: expect.any(Array)
        })
      );
    });

    it('should handle missing API key gracefully', () => {
      const data = {
        whatsappApiKey: '',
        messageId: 'msg_123',
        conversationId: 'conv_456',
        contactPhone: '5511999999999',
        inboxId: 'inbox_789',
        intentName: 'welcome'
      };

      const payload = {};

      logWebhookData(data, payload);

      expect(consoleSpy).toHaveBeenCalledWith(
        '[MTF Diamante Webhook] Dados extraídos:',
        expect.objectContaining({
          whatsappApiKey: 'N/A',
          hasApiKey: false
        })
      );
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle null/undefined payloads gracefully', () => {
      const testCases = [null, undefined, {}];

      testCases.forEach((payload) => {
        expect(() => extractWebhookData(payload as any)).not.toThrow();
        expect(() => extractContactPhone(payload as any)).not.toThrow();
        expect(() => extractMessageContent(payload as any)).not.toThrow();
        expect(() => extractMessageType(payload as any)).not.toThrow();
        expect(() => hasValidApiKey(payload as any)).not.toThrow();
      });
    });

    it('should handle deeply nested missing properties', () => {
      const payload = {
        queryResult: {},
        originalDetectIntentRequest: {}
      };

      const result = extractWebhookData(payload);

      expect(result).toEqual({
        whatsappApiKey: '',
        messageId: expect.stringMatching(/^msg_\d+$/),
        conversationId: '',
        contactPhone: '',
        inboxId: '',
        intentName: 'Unknown'
      });
    });

    it('should handle circular references in payload', () => {
      const payload: any = {
        queryResult: {
          intent: { displayName: 'test' }
        }
      };
      payload.circular = payload; // Create circular reference

      expect(() => extractWebhookData(payload)).not.toThrow();
      expect(() => logWebhookData(extractWebhookData(payload), payload)).not.toThrow();
    });
  });
});