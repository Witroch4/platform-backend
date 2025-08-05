/**
 * Unit tests for HMAC validation service
 * Tests webhook authentication and timestamp validation
 */

import { HmacValidationService } from '@/lib/ai-integration/services/hmac-validation';
import crypto from 'crypto';

describe('HmacValidationService', () => {
  let hmacService: HmacValidationService;
  const testSecret = 'test-webhook-secret';
  const testPayload = JSON.stringify({ test: 'data' });

  beforeEach(() => {
    hmacService = new HmacValidationService(testSecret);
  });

  describe('validateSignature', () => {
    it('should validate correct HMAC signature', () => {
      const timestamp = Math.floor(Date.now() / 1000);
      const canonicalString = `${timestamp}.${testPayload}`;
      const expectedSignature = crypto
        .createHmac('sha256', testSecret)
        .update(canonicalString)
        .digest('hex');

      const result = hmacService.validateSignature(
        testPayload,
        expectedSignature,
        timestamp
      );

      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should reject invalid HMAC signature', () => {
      const timestamp = Math.floor(Date.now() / 1000);
      const invalidSignature = 'invalid-signature';

      const result = hmacService.validateSignature(
        testPayload,
        invalidSignature,
        timestamp
      );

      expect(result.isValid).toBe(false);
      expect(result.error).toBe('INVALID_SIGNATURE');
    });

    it('should reject timestamp outside 5-minute window', () => {
      const oldTimestamp = Math.floor(Date.now() / 1000) - 400; // 6+ minutes ago
      const canonicalString = `${oldTimestamp}.${testPayload}`;
      const signature = crypto
        .createHmac('sha256', testSecret)
        .update(canonicalString)
        .digest('hex');

      const result = hmacService.validateSignature(
        testPayload,
        signature,
        oldTimestamp
      );

      expect(result.isValid).toBe(false);
      expect(result.error).toBe('TIMESTAMP_OUT_OF_WINDOW');
    });

    it('should reject future timestamp outside window', () => {
      const futureTimestamp = Math.floor(Date.now() / 1000) + 400; // 6+ minutes future
      const canonicalString = `${futureTimestamp}.${testPayload}`;
      const signature = crypto
        .createHmac('sha256', testSecret)
        .update(canonicalString)
        .digest('hex');

      const result = hmacService.validateSignature(
        testPayload,
        signature,
        futureTimestamp
      );

      expect(result.isValid).toBe(false);
      expect(result.error).toBe('TIMESTAMP_OUT_OF_WINDOW');
    });

    it('should handle timing-safe comparison', () => {
      const timestamp = Math.floor(Date.now() / 1000);
      const canonicalString = `${timestamp}.${testPayload}`;
      const correctSignature = crypto
        .createHmac('sha256', testSecret)
        .update(canonicalString)
        .digest('hex');
      
      // Create signature with same length but different content
      const incorrectSignature = correctSignature.replace(/a/g, 'b').replace(/1/g, '2');

      const result = hmacService.validateSignature(
        testPayload,
        incorrectSignature,
        timestamp
      );

      expect(result.isValid).toBe(false);
      expect(result.error).toBe('INVALID_SIGNATURE');
    });
  });

  describe('generateSignature', () => {
    it('should generate correct signature for given payload and timestamp', () => {
      const timestamp = Math.floor(Date.now() / 1000);
      const signature = hmacService.generateSignature(testPayload, timestamp);
      
      const expectedSignature = crypto
        .createHmac('sha256', testSecret)
        .update(`${timestamp}.${testPayload}`)
        .digest('hex');

      expect(signature).toBe(expectedSignature);
    });
  });

  describe('isTimestampValid', () => {
    it('should accept timestamp within 5-minute window', () => {
      const currentTime = Math.floor(Date.now() / 1000);
      const validTimestamp = currentTime - 200; // 3+ minutes ago

      expect(hmacService.isTimestampValid(validTimestamp)).toBe(true);
    });

    it('should reject timestamp outside 5-minute window', () => {
      const currentTime = Math.floor(Date.now() / 1000);
      const invalidTimestamp = currentTime - 400; // 6+ minutes ago

      expect(hmacService.isTimestampValid(invalidTimestamp)).toBe(false);
    });

    it('should accept current timestamp', () => {
      const currentTime = Math.floor(Date.now() / 1000);

      expect(hmacService.isTimestampValid(currentTime)).toBe(true);
    });
  });
});