/**
 * Unit tests for HMAC validation service
 */

import crypto from 'crypto';
import {
  validateHMACSignature,
  generateHMACSignature,
  extractHMACContext,
  validateWebhookHMAC,
  getSupportedHMACVersions,
  validateHMACConfig,
  HMACVersion,
  HMACValidationContext
} from '@/lib/ai-integration/services/hmac-validation';

describe('HMAC Validation Service', () => {
  const testSecret = 'test-secret-key-for-hmac-validation';
  const testBody = '{"test": "payload", "timestamp": 1234567890}';
  const testTimestamp = Math.floor(Date.now() / 1000).toString();
  
  describe('validateHMACSignature', () => {
    it('should validate correct HMAC signature', () => {
      const signature = generateHMACSignature(testBody, testTimestamp, testSecret);
      
      const context: HMACValidationContext = {
        rawBody: testBody,
        signature,
        timestamp: testTimestamp
      };
      
      const result = validateHMACSignature(context, { secret: testSecret });
      
      expect(result.isValid).toBe(true);
      expect(result.version).toBe(HMACVersion.V1);
      expect(result.error).toBeUndefined();
    });
    
    it('should reject invalid HMAC signature', () => {
      const context: HMACValidationContext = {
        rawBody: testBody,
        signature: 'v1=invalid-signature',
        timestamp: testTimestamp
      };
      
      const result = validateHMACSignature(context, { secret: testSecret });
      
      expect(result.isValid).toBe(false);
      expect(result.version).toBe(HMACVersion.V1);
      expect(result.error).toBe('Signature mismatch');
    });
    
    it('should reject expired timestamp', () => {
      const oldTimestamp = (Math.floor(Date.now() / 1000) - 400).toString(); // 400 seconds ago
      const signature = generateHMACSignature(testBody, oldTimestamp, testSecret);
      
      const context: HMACValidationContext = {
        rawBody: testBody,
        signature,
        timestamp: oldTimestamp
      };
      
      const result = validateHMACSignature(context, { 
        secret: testSecret,
        timestampToleranceSeconds: 300 // 5 minutes
      });
      
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Timestamp outside tolerance window');
      expect(result.timeDifference).toBeGreaterThan(300);
    });
    
    it('should accept timestamp within tolerance', () => {
      const recentTimestamp = (Math.floor(Date.now() / 1000) - 100).toString(); // 100 seconds ago
      const signature = generateHMACSignature(testBody, recentTimestamp, testSecret);
      
      const context: HMACValidationContext = {
        rawBody: testBody,
        signature,
        timestamp: recentTimestamp
      };
      
      const result = validateHMACSignature(context, { 
        secret: testSecret,
        timestampToleranceSeconds: 300
      });
      
      expect(result.isValid).toBe(true);
      expect(result.timeDifference).toBeLessThan(300);
    });
    
    it('should handle plain signature without version prefix', () => {
      // Generate signature and remove version prefix
      const fullSignature = generateHMACSignature(testBody, testTimestamp, testSecret);
      const plainSignature = fullSignature.replace('v1=', '');
      
      const context: HMACValidationContext = {
        rawBody: testBody,
        signature: plainSignature,
        timestamp: testTimestamp
      };
      
      const result = validateHMACSignature(context, { secret: testSecret });
      
      expect(result.isValid).toBe(true);
      expect(result.version).toBe(HMACVersion.V1);
    });
    
    it('should reject unsupported version', () => {
      const context: HMACValidationContext = {
        rawBody: testBody,
        signature: 'v2=some-signature',
        timestamp: testTimestamp
      };
      
      const result = validateHMACSignature(context, { 
        secret: testSecret,
        supportedVersions: [HMACVersion.V1]
      });
      
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Unsupported signature version: v2');
    });
    
    it('should handle explicit version header', () => {
      const signature = generateHMACSignature(testBody, testTimestamp, testSecret);
      
      const context: HMACValidationContext = {
        rawBody: testBody,
        signature,
        timestamp: testTimestamp,
        version: 'v1'
      };
      
      const result = validateHMACSignature(context, { secret: testSecret });
      
      expect(result.isValid).toBe(true);
      expect(result.version).toBe(HMACVersion.V1);
    });
    
    it('should handle Buffer body', () => {
      const bodyBuffer = Buffer.from(testBody, 'utf8');
      const signature = generateHMACSignature(bodyBuffer, testTimestamp, testSecret);
      
      const context: HMACValidationContext = {
        rawBody: bodyBuffer,
        signature,
        timestamp: testTimestamp
      };
      
      const result = validateHMACSignature(context, { secret: testSecret });
      
      expect(result.isValid).toBe(true);
    });
    
    it('should reject invalid timestamp format', () => {
      const context: HMACValidationContext = {
        rawBody: testBody,
        signature: 'v1=some-signature',
        timestamp: 'invalid-timestamp'
      };
      
      const result = validateHMACSignature(context, { secret: testSecret });
      
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Invalid timestamp format');
    });
    
    it('should handle missing signature version', () => {
      const context: HMACValidationContext = {
        rawBody: testBody,
        signature: '',
        timestamp: testTimestamp
      };
      
      const result = validateHMACSignature(context, { secret: testSecret });
      
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Invalid or missing signature version');
    });
  });
  
  describe('generateHMACSignature', () => {
    it('should generate consistent signatures', () => {
      const signature1 = generateHMACSignature(testBody, testTimestamp, testSecret);
      const signature2 = generateHMACSignature(testBody, testTimestamp, testSecret);
      
      expect(signature1).toBe(signature2);
      expect(signature1).toMatch(/^v1=[a-f0-9]{64}$/);
    });
    
    it('should generate different signatures for different inputs', () => {
      const signature1 = generateHMACSignature(testBody, testTimestamp, testSecret);
      const signature2 = generateHMACSignature(testBody + 'modified', testTimestamp, testSecret);
      
      expect(signature1).not.toBe(signature2);
    });
    
    it('should generate different signatures for different timestamps', () => {
      const signature1 = generateHMACSignature(testBody, testTimestamp, testSecret);
      const signature2 = generateHMACSignature(testBody, (parseInt(testTimestamp) + 1).toString(), testSecret);
      
      expect(signature1).not.toBe(signature2);
    });
    
    it('should generate different signatures for different secrets', () => {
      const signature1 = generateHMACSignature(testBody, testTimestamp, testSecret);
      const signature2 = generateHMACSignature(testBody, testTimestamp, testSecret + 'different');
      
      expect(signature1).not.toBe(signature2);
    });
  });
  
  describe('extractHMACContext', () => {
    it('should extract valid HMAC context from headers', () => {
      const headers = new Headers({
        'x-chatwit-signature': 'v1=abc123',
        'x-chatwit-timestamp': testTimestamp,
        'x-chatwit-signature-version': 'v1',
        'user-agent': 'Chatwit-Webhook/1.0',
        'x-forwarded-for': '192.168.1.1, 10.0.0.1'
      });
      
      const { context, error } = extractHMACContext(headers, testBody);
      
      expect(error).toBeUndefined();
      expect(context).toBeDefined();
      expect(context!.signature).toBe('v1=abc123');
      expect(context!.timestamp).toBe(testTimestamp);
      expect(context!.version).toBe('v1');
      expect(context!.userAgent).toBe('Chatwit-Webhook/1.0');
      expect(context!.ipAddress).toBe('192.168.1.1');
      expect(context!.rawBody).toBe(testBody);
    });
    
    it('should handle missing signature header', () => {
      const headers = new Headers({
        'x-chatwit-timestamp': testTimestamp
      });
      
      const { context, error } = extractHMACContext(headers, testBody);
      
      expect(context).toBeNull();
      expect(error).toBe('Missing X-Chatwit-Signature header');
    });
    
    it('should handle missing timestamp header', () => {
      const headers = new Headers({
        'x-chatwit-signature': 'v1=abc123'
      });
      
      const { context, error } = extractHMACContext(headers, testBody);
      
      expect(context).toBeNull();
      expect(error).toBe('Missing X-Chatwit-Timestamp header');
    });
    
    it('should handle optional headers gracefully', () => {
      const headers = new Headers({
        'x-chatwit-signature': 'v1=abc123',
        'x-chatwit-timestamp': testTimestamp
      });
      
      const { context, error } = extractHMACContext(headers, testBody);
      
      expect(error).toBeUndefined();
      expect(context).toBeDefined();
      expect(context!.version).toBeUndefined();
      expect(context!.userAgent).toBeUndefined();
      expect(context!.ipAddress).toBe('unknown');
    });
    
    it('should extract IP from different headers', () => {
      const testCases = [
        { header: 'x-forwarded-for', value: '192.168.1.1', expected: '192.168.1.1' },
        { header: 'x-real-ip', value: '10.0.0.1', expected: '10.0.0.1' },
        { header: 'cf-connecting-ip', value: '172.16.0.1', expected: '172.16.0.1' }
      ];
      
      testCases.forEach(({ header, value, expected }) => {
        const headers = new Headers({
          'x-chatwit-signature': 'v1=abc123',
          'x-chatwit-timestamp': testTimestamp,
          [header]: value
        });
        
        const { context } = extractHMACContext(headers, testBody);
        expect(context!.ipAddress).toBe(expected);
      });
    });
  });
  
  describe('validateWebhookHMAC', () => {
    it('should validate complete webhook request', () => {
      const signature = generateHMACSignature(testBody, testTimestamp, testSecret);
      
      const headers = new Headers({
        'x-chatwit-signature': signature,
        'x-chatwit-timestamp': testTimestamp,
        'x-chatwit-signature-version': 'v1'
      });
      
      const result = validateWebhookHMAC(headers, testBody, { secret: testSecret });
      
      expect(result.isValid).toBe(true);
      expect(result.version).toBe(HMACVersion.V1);
    });
    
    it('should reject webhook with invalid signature', () => {
      const headers = new Headers({
        'x-chatwit-signature': 'v1=invalid-signature',
        'x-chatwit-timestamp': testTimestamp
      });
      
      const result = validateWebhookHMAC(headers, testBody, { secret: testSecret });
      
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Signature mismatch');
    });
    
    it('should reject webhook with missing headers', () => {
      const headers = new Headers({
        'x-chatwit-signature': 'v1=abc123'
        // Missing timestamp
      });
      
      const result = validateWebhookHMAC(headers, testBody, { secret: testSecret });
      
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Missing X-Chatwit-Timestamp header');
    });
  });
  
  describe('getSupportedHMACVersions', () => {
    it('should return supported versions and headers', () => {
      const info = getSupportedHMACVersions();
      
      expect(info.versions).toContain(HMACVersion.V1);
      expect(info.default).toBe(HMACVersion.V1);
      expect(info.headers.signature).toBe('X-Chatwit-Signature');
      expect(info.headers.timestamp).toBe('X-Chatwit-Timestamp');
      expect(info.headers.version).toBe('X-Chatwit-Signature-Version');
    });
  });
  
  describe('validateHMACConfig', () => {
    it('should validate correct configuration', () => {
      const config = {
        secret: 'valid-secret-key-with-sufficient-length',
        timestampToleranceSeconds: 300,
        supportedVersions: [HMACVersion.V1],
        defaultVersion: HMACVersion.V1
      };
      
      const result = validateHMACConfig(config);
      
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
    
    it('should detect missing secret', () => {
      const config = { secret: '' };
      
      const result = validateHMACConfig(config);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('HMAC secret is required');
    });
    
    it('should warn about short secret', () => {
      const config = { secret: 'short' };
      
      const result = validateHMACConfig(config);
      
      expect(result.warnings).toContain('HMAC secret should be at least 16 characters long');
    });
    
    it('should detect default secret in production', () => {
      const config = { secret: 'default-secret-change-in-production' };
      
      const result = validateHMACConfig(config);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('HMAC secret must be changed from default value');
    });
    
    it('should warn about extreme timestamp tolerance', () => {
      const shortTolerance = { timestampToleranceSeconds: 30 };
      const longTolerance = { timestampToleranceSeconds: 700 };
      
      const shortResult = validateHMACConfig(shortTolerance);
      const longResult = validateHMACConfig(longTolerance);
      
      expect(shortResult.warnings).toContain('Timestamp tolerance less than 60 seconds may cause issues with clock skew');
      expect(longResult.warnings).toContain('Timestamp tolerance greater than 10 minutes may be insecure');
    });
    
    it('should validate version configuration', () => {
      const noVersions = { supportedVersions: [] };
      const invalidDefault = { 
        supportedVersions: [HMACVersion.V1],
        defaultVersion: 'v2' as HMACVersion
      };
      
      const noVersionsResult = validateHMACConfig(noVersions);
      const invalidDefaultResult = validateHMACConfig(invalidDefault);
      
      expect(noVersionsResult.errors).toContain('At least one HMAC version must be supported');
      expect(invalidDefaultResult.errors).toContain('Default HMAC version must be in supported versions list');
    });
  });
  
  describe('Timing Safety', () => {
    it('should use timing-safe comparison', () => {
      const correctSignature = generateHMACSignature(testBody, testTimestamp, testSecret);
      const incorrectSignature = correctSignature.replace('v1=', 'v1=0');
      
      const context1: HMACValidationContext = {
        rawBody: testBody,
        signature: correctSignature,
        timestamp: testTimestamp
      };
      
      const context2: HMACValidationContext = {
        rawBody: testBody,
        signature: incorrectSignature,
        timestamp: testTimestamp
      };
      
      // Both should take similar time (timing-safe comparison)
      const start1 = process.hrtime.bigint();
      const result1 = validateHMACSignature(context1, { secret: testSecret });
      const end1 = process.hrtime.bigint();
      
      const start2 = process.hrtime.bigint();
      const result2 = validateHMACSignature(context2, { secret: testSecret });
      const end2 = process.hrtime.bigint();
      
      expect(result1.isValid).toBe(true);
      expect(result2.isValid).toBe(false);
      
      // Time difference should be minimal (timing-safe)
      const time1 = Number(end1 - start1);
      const time2 = Number(end2 - start2);
      const timeDifference = Math.abs(time1 - time2);
      
      // Allow for some variance but should be relatively close
      expect(timeDifference).toBeLessThan(time1 * 0.5); // Within 50% of each other
    });
  });
});