/**
 * Unit tests for SocialWise Flow payload validation and type coercion
 */

import { describe, it, expect } from '@jest/globals';
import { 
  validateSocialWisePayloadWithPreprocessing,
  preprocessSocialWisePayload,
  SocialWiseFlowPayloadSchema
} from '@/lib/socialwise-flow/schemas/payload';

describe('SocialWise Flow Payload Validation', () => {
  describe('Type Coercion', () => {
    it('should convert number IDs to strings', () => {
      const payloadWithNumbers = {
        session_id: 12345,
        message: 'Hello world',
        channel_type: 'whatsapp',
        context: {
          'socialwise-chatwit': {
            inbox_data: {
              id: 67890,
              name: 'Test Inbox',
              channel_type: 'whatsapp'
            },
            account_data: {
              id: 11111
            },
            whatsapp_phone_number_id: 22222,
            whatsapp_business_id: 33333,
            wamid: 'wamid.test123'
          },
          inbox_id: 67890,
          account_id: 11111
        }
      };

      const result = validateSocialWisePayloadWithPreprocessing(payloadWithNumbers);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data!.session_id).toBe('12345');
      expect(result.data!.context['socialwise-chatwit'].inbox_data.id).toBe('67890');
      expect(result.data!.context['socialwise-chatwit'].account_data.id).toBe('11111');
      expect(result.data!.context['socialwise-chatwit'].whatsapp_phone_number_id).toBe('22222');
      expect(result.data!.context['socialwise-chatwit'].whatsapp_business_id).toBe('33333');
      expect(result.data!.context.inbox_id).toBe('67890');
      expect(result.data!.context.account_id).toBe('11111');
    });

    it('should handle null values by converting to undefined', () => {
      const payloadWithNulls = {
        session_id: '12345',
        message: 'Hello world',
        channel_type: 'whatsapp',
        context: {
          'socialwise-chatwit': {
            inbox_data: {
              id: '67890',
              name: null,
              channel_type: 'whatsapp'
            },
            account_data: {
              id: '11111'
            },
            whatsapp_phone_number_id: null,
            whatsapp_business_id: null,
            wamid: 'wamid.test123'
          }
        }
      };

      const result = validateSocialWisePayloadWithPreprocessing(payloadWithNulls);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data!.context['socialwise-chatwit'].inbox_data.name).toBeUndefined();
      expect(result.data!.context['socialwise-chatwit'].whatsapp_phone_number_id).toBeUndefined();
      expect(result.data!.context['socialwise-chatwit'].whatsapp_business_id).toBeUndefined();
    });

    it('should handle mixed number and string IDs', () => {
      const mixedPayload = {
        session_id: '12345', // string
        message: 'Hello world',
        channel_type: 'whatsapp',
        context: {
          'socialwise-chatwit': {
            inbox_data: {
              id: 67890, // number
              channel_type: 'whatsapp'
            },
            account_data: {
              id: '11111' // string
            },
            wamid: 'wamid.test123'
          },
          inbox_id: 67890, // number
          account_id: '11111' // string
        }
      };

      const result = validateSocialWisePayloadWithPreprocessing(mixedPayload);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data!.session_id).toBe('12345');
      expect(result.data!.context['socialwise-chatwit'].inbox_data.id).toBe('67890');
      expect(result.data!.context['socialwise-chatwit'].account_data.id).toBe('11111');
      expect(result.data!.context.inbox_id).toBe('67890');
      expect(result.data!.context.account_id).toBe('11111');
    });

    it('should fail validation for missing required fields', () => {
      const incompletePayload = {
        session_id: '12345',
        message: 'Hello world',
        // missing channel_type
        context: {
          'socialwise-chatwit': {
            inbox_data: {
              id: '67890',
              // missing channel_type
            },
            account_data: {
              id: '11111'
            }
          }
        }
      };

      const result = validateSocialWisePayloadWithPreprocessing(incompletePayload);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should handle empty string IDs as invalid', () => {
      const payloadWithEmptyIds = {
        session_id: '', // empty string should fail
        message: 'Hello world',
        channel_type: 'whatsapp',
        context: {
          'socialwise-chatwit': {
            inbox_data: {
              id: '',
              channel_type: 'whatsapp'
            },
            account_data: {
              id: ''
            }
          }
        }
      };

      const result = validateSocialWisePayloadWithPreprocessing(payloadWithEmptyIds);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('Preprocessing Function', () => {
    it('should convert numbers to strings in nested objects', () => {
      const input = {
        session_id: 12345,
        context: {
          'socialwise-chatwit': {
            inbox_data: { id: 67890 },
            account_data: { id: 11111 },
            whatsapp_phone_number_id: 22222
          }
        }
      };

      const processed = preprocessSocialWisePayload(input);

      expect(processed.session_id).toBe('12345');
      expect(processed.context['socialwise-chatwit'].inbox_data.id).toBe('67890');
      expect(processed.context['socialwise-chatwit'].account_data.id).toBe('11111');
      expect(processed.context['socialwise-chatwit'].whatsapp_phone_number_id).toBe('22222');
    });

    it('should handle null and undefined values', () => {
      const input = {
        session_id: null,
        context: {
          'socialwise-chatwit': {
            inbox_data: { id: 67890, name: null },
            account_data: { id: undefined },
            whatsapp_phone_number_id: null
          }
        }
      };

      const processed = preprocessSocialWisePayload(input);

      expect(processed.session_id).toBeUndefined();
      expect(processed.context['socialwise-chatwit'].inbox_data.name).toBeUndefined();
      expect(processed.context['socialwise-chatwit'].account_data.id).toBeUndefined();
      expect(processed.context['socialwise-chatwit'].whatsapp_phone_number_id).toBeUndefined();
    });

    it('should not mutate the original object', () => {
      const input = {
        session_id: 12345,
        context: {
          'socialwise-chatwit': {
            inbox_data: { id: 67890 }
          }
        }
      };

      const original = JSON.parse(JSON.stringify(input));
      const processed = preprocessSocialWisePayload(input);

      // Original should be unchanged
      expect(input).toEqual(original);
      expect(input.session_id).toBe(12345); // Still a number
      
      // Processed should be converted
      expect(processed.session_id).toBe('12345'); // Now a string
    });
  });

  describe('Real-world Scenarios', () => {
    it('should handle typical SocialWise payload with numbers', () => {
      const realWorldPayload = {
        session_id: 1234567890,
        message: 'Olá, preciso de ajuda',
        channel_type: 'whatsapp',
        context: {
          'socialwise-chatwit': {
            inbox_data: {
              id: 42,
              name: 'Atendimento WhatsApp',
              channel_type: 'whatsapp'
            },
            account_data: {
              id: 123
            },
            whatsapp_phone_number_id: 15551234567,
            whatsapp_business_id: 98765432109876,
            wamid: 'wamid.HBgNNTU1MTIzNDU2NxUCABIYIDEyMzQ1Njc4OTBhYmNkZWY='
          },
          channel_type: 'whatsapp',
          inbox_id: 42,
          account_id: 123
        }
      };

      const result = validateSocialWisePayloadWithPreprocessing(realWorldPayload);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      
      // Verify all numeric IDs were converted to strings
      expect(typeof result.data!.session_id).toBe('string');
      expect(typeof result.data!.context['socialwise-chatwit'].inbox_data.id).toBe('string');
      expect(typeof result.data!.context['socialwise-chatwit'].account_data.id).toBe('string');
      expect(typeof result.data!.context['socialwise-chatwit'].whatsapp_phone_number_id).toBe('string');
      expect(typeof result.data!.context['socialwise-chatwit'].whatsapp_business_id).toBe('string');
      
      // Verify values are correct
      expect(result.data!.session_id).toBe('1234567890');
      expect(result.data!.context['socialwise-chatwit'].inbox_data.id).toBe('42');
      expect(result.data!.context['socialwise-chatwit'].account_data.id).toBe('123');
      expect(result.data!.context['socialwise-chatwit'].whatsapp_phone_number_id).toBe('15551234567');
      expect(result.data!.context['socialwise-chatwit'].whatsapp_business_id).toBe('98765432109876');
    });
  });
});