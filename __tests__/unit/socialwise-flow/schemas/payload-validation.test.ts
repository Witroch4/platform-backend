/**
 * Unit tests for SocialWise Flow Payload Validation and Security
 */

import {
  validateSocialWisePayload,
  sanitizeUserText,
  validateNonce,
  SocialWiseFlowPayloadSchema,
  SanitizedTextSchema,
  NonceSchema,
} from '@/lib/socialwise-flow/schemas/payload';

describe('SocialWise Flow Payload Validation', () => {
  describe('validateSocialWisePayload', () => {
    const validPayload = {
      session_id: 'session123',
      message: 'Hello world',
      channel_type: 'whatsapp',
      context: {
        'socialwise-chatwit': {
          account_data: { id: 'acc123' },
          inbox_data: { id: 'inbox456', channel_type: 'whatsapp' },
          wamid: 'wamid789',
        },
      },
    };

    it('should validate correct payload', () => {
      const result = validateSocialWisePayload(validPayload);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(validPayload);
      expect(result.error).toBeUndefined();
    });

    it('should reject payload without session_id', () => {
      const invalidPayload = { ...validPayload };
      delete (invalidPayload as any).session_id;

      const result = validateSocialWisePayload(invalidPayload);

      expect(result.success).toBe(false);
      expect(result.error?.errors).toContainEqual(
        expect.objectContaining({
          path: ['session_id'],
          message: 'Required',
        })
      );
    });

    it('should reject payload with empty session_id', () => {
      const invalidPayload = { ...validPayload, session_id: '' };

      const result = validateSocialWisePayload(invalidPayload);

      expect(result.success).toBe(false);
      expect(result.error?.errors).toContainEqual(
        expect.objectContaining({
          path: ['session_id'],
          message: 'Session ID is required',
        })
      );
    });

    it('should reject payload without message', () => {
      const invalidPayload = { ...validPayload };
      delete (invalidPayload as any).message;

      const result = validateSocialWisePayload(invalidPayload);

      expect(result.success).toBe(false);
      expect(result.error?.errors).toContainEqual(
        expect.objectContaining({
          path: ['message'],
          message: 'Required',
        })
      );
    });

    it('should reject payload with empty message', () => {
      const invalidPayload = { ...validPayload, message: '' };

      const result = validateSocialWisePayload(invalidPayload);

      expect(result.success).toBe(false);
      expect(result.error?.errors).toContainEqual(
        expect.objectContaining({
          path: ['message'],
          message: 'Message content is required',
        })
      );
    });

    it('should reject payload without channel_type', () => {
      const invalidPayload = { ...validPayload };
      delete (invalidPayload as any).channel_type;

      const result = validateSocialWisePayload(invalidPayload);

      expect(result.success).toBe(false);
      expect(result.error?.errors).toContainEqual(
        expect.objectContaining({
          path: ['channel_type'],
          message: 'Required',
        })
      );
    });

    it('should reject payload without context', () => {
      const invalidPayload = { ...validPayload };
      delete (invalidPayload as any).context;

      const result = validateSocialWisePayload(invalidPayload);

      expect(result.success).toBe(false);
      expect(result.error?.errors).toContainEqual(
        expect.objectContaining({
          path: ['context'],
          message: 'Required',
        })
      );
    });

    it('should reject payload without socialwise-chatwit context', () => {
      const invalidPayload = {
        ...validPayload,
        context: {},
      };

      const result = validateSocialWisePayload(invalidPayload);

      expect(result.success).toBe(false);
      expect(result.error?.errors).toContainEqual(
        expect.objectContaining({
          path: ['context', 'socialwise-chatwit'],
          message: 'Required',
        })
      );
    });

    it('should reject payload without account_data', () => {
      const invalidPayload = {
        ...validPayload,
        context: {
          'socialwise-chatwit': {
            inbox_data: { id: 'inbox456', channel_type: 'whatsapp' },
            wamid: 'wamid789',
          },
        },
      };

      const result = validateSocialWisePayload(invalidPayload);

      expect(result.success).toBe(false);
      expect(result.error?.errors).toContainEqual(
        expect.objectContaining({
          path: ['context', 'socialwise-chatwit', 'account_data'],
          message: 'Required',
        })
      );
    });

    it('should reject payload without inbox_data', () => {
      const invalidPayload = {
        ...validPayload,
        context: {
          'socialwise-chatwit': {
            account_data: { id: 'acc123' },
            wamid: 'wamid789',
          },
        },
      };

      const result = validateSocialWisePayload(invalidPayload);

      expect(result.success).toBe(false);
      expect(result.error?.errors).toContainEqual(
        expect.objectContaining({
          path: ['context', 'socialwise-chatwit', 'inbox_data'],
          message: 'Required',
        })
      );
    });

    it('should reject payload without wamid or message_data.id', () => {
      const invalidPayload = {
        ...validPayload,
        context: {
          'socialwise-chatwit': {
            account_data: { id: 'acc123' },
            inbox_data: { id: 'inbox456', channel_type: 'whatsapp' },
            // No wamid or message_data
          },
        },
      };

      const result = validateSocialWisePayload(invalidPayload);

      expect(result.success).toBe(false);
      expect(result.error?.errors).toContainEqual(
        expect.objectContaining({
          path: ['context'],
          message: 'Either wamid or message_data.id must be provided for idempotency',
        })
      );
    });

    it('should accept payload with message_data.id instead of wamid', () => {
      const payloadWithMessageId = {
        ...validPayload,
        context: {
          'socialwise-chatwit': {
            account_data: { id: 'acc123' },
            inbox_data: { id: 'inbox456', channel_type: 'whatsapp' },
            message_data: { id: 'msg123' },
          },
        },
      };

      const result = validateSocialWisePayload(payloadWithMessageId);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(payloadWithMessageId);
    });

    it('should handle malformed JSON gracefully', () => {
      const malformedPayload = 'not a json object';

      const result = validateSocialWisePayload(malformedPayload);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should handle null payload', () => {
      const result = validateSocialWisePayload(null);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should handle undefined payload', () => {
      const result = validateSocialWisePayload(undefined);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('sanitizeUserText', () => {
    it('should accept clean text', () => {
      const text = 'Hello, this is a normal message!';
      const result = sanitizeUserText(text);

      expect(result.success).toBe(true);
      expect(result.data).toBe(text);
    });

    it('should normalize whitespace', () => {
      const text = '  Hello    world   with   extra   spaces  ';
      const result = sanitizeUserText(text);

      expect(result.success).toBe(true);
      expect(result.data).toBe('Hello world with extra spaces');
    });

    it('should reject text with script tags', () => {
      const text = 'Hello <script>alert("xss")</script> world';
      const result = sanitizeUserText(text);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Message contains potentially dangerous content');
    });

    it('should reject text with javascript: protocol', () => {
      const text = 'Click here: javascript:alert("xss")';
      const result = sanitizeUserText(text);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Message contains potentially dangerous content');
    });

    it('should reject text with data:text/html', () => {
      const text = 'Check this: data:text/html,<script>alert("xss")</script>';
      const result = sanitizeUserText(text);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Message contains potentially dangerous content');
    });

    it('should reject text with vbscript:', () => {
      const text = 'vbscript:msgbox("xss")';
      const result = sanitizeUserText(text);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Message contains potentially dangerous content');
    });

    it('should reject text with onload= attribute', () => {
      const text = 'Hello <img onload="alert(1)"> world';
      const result = sanitizeUserText(text);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Message contains potentially dangerous content');
    });

    it('should reject text with onerror= attribute', () => {
      const text = 'Hello <img onerror="alert(1)"> world';
      const result = sanitizeUserText(text);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Message contains potentially dangerous content');
    });

    it('should reject text that is too long', () => {
      const text = 'a'.repeat(5000); // Exceeds 4096 limit
      const result = sanitizeUserText(text);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Message content too long');
    });

    it('should truncate text at 4096 characters', () => {
      const text = 'a'.repeat(4100); // Slightly over limit
      const result = sanitizeUserText(text);

      expect(result.success).toBe(true);
      expect(result.data?.length).toBe(4096);
    });

    it('should handle empty string', () => {
      const result = sanitizeUserText('');

      expect(result.success).toBe(true);
      expect(result.data).toBe('');
    });

    it('should handle string with only whitespace', () => {
      const result = sanitizeUserText('   \n\t   ');

      expect(result.success).toBe(true);
      expect(result.data).toBe('');
    });
  });

  describe('validateNonce', () => {
    it('should accept valid nonce', () => {
      const nonce = 'abcd1234efgh5678ijkl';
      const result = validateNonce(nonce);

      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should accept nonce with valid characters', () => {
      const nonce = 'valid_nonce-123_ABC-xyz';
      const result = validateNonce(nonce);

      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should reject nonce that is too short', () => {
      const nonce = 'short';
      const result = validateNonce(nonce);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Nonce must be at least 16 characters');
    });

    it('should reject nonce that is too long', () => {
      const nonce = 'a'.repeat(129);
      const result = validateNonce(nonce);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Nonce too long');
    });

    it('should reject nonce with invalid characters', () => {
      const nonce = 'invalid@nonce#with$special%chars';
      const result = validateNonce(nonce);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Nonce contains invalid characters');
    });

    it('should reject nonce with spaces', () => {
      const nonce = 'nonce with spaces in it';
      const result = validateNonce(nonce);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Nonce contains invalid characters');
    });

    it('should reject nonce with special characters', () => {
      const nonce = 'nonce!@#$%^&*()+={}[]|\\:";\'<>?,./';
      const result = validateNonce(nonce);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Nonce contains invalid characters');
    });
  });
});