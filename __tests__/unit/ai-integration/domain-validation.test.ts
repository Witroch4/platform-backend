/**
 * Tests for domain validation utilities
 * Requirements: 9.1, 9.4
 */

import {
  validateUrl,
  getAllowedDomainsForAccount,
  sanitizeUrl,
  isSubdomainOf,
  extractDomain
} from '../../../lib/ai-integration/utils/domain-validation';

describe('Domain Validation Utilities', () => {
  describe('validateUrl', () => {
    it('should validate HTTPS URLs by default', () => {
      const result = validateUrl('https://example.com');
      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should reject HTTP URLs by default', () => {
      const result = validateUrl('http://example.com');
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('URL must use HTTPS protocol');
    });

    it('should allow HTTP when HTTPS not required', () => {
      const config = { requireHttps: false, allowedDomains: [] };
      const result = validateUrl('http://example.com', config);
      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should validate against domain allowlist', () => {
      const config = {
        requireHttps: true,
        allowedDomains: ['example.com', 'trusted.org']
      };

      const validResult = validateUrl('https://example.com', config);
      expect(validResult.isValid).toBe(true);

      const invalidResult = validateUrl('https://malicious.com', config);
      expect(invalidResult.isValid).toBe(false);
      expect(invalidResult.errors).toContain('Domain malicious.com is not in the allowlist');
    });

    it('should allow subdomains of allowed domains', () => {
      const config = {
        requireHttps: true,
        allowedDomains: ['example.com']
      };

      const result = validateUrl('https://api.example.com', config);
      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should be case insensitive for domains', () => {
      const config = {
        requireHttps: true,
        allowedDomains: ['Example.Com']
      };

      const result = validateUrl('https://EXAMPLE.COM', config);
      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should reject empty URLs', () => {
      const result = validateUrl('');
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('URL is required');
    });

    it('should reject invalid URL formats', () => {
      const result = validateUrl('not-a-url');
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Invalid URL format');
    });

    it('should handle multiple validation errors', () => {
      const config = {
        requireHttps: true,
        allowedDomains: ['example.com']
      };

      const result = validateUrl('http://malicious.com', config);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('URL must use HTTPS protocol');
      expect(result.errors).toContain('Domain malicious.com is not in the allowlist');
    });

    it('should pass validation when no allowlist provided', () => {
      const config = { requireHttps: true, allowedDomains: [] };
      const result = validateUrl('https://any-domain.com', config);
      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });
  });

  describe('getAllowedDomainsForAccount', () => {
    it('should return default domains for now', async () => {
      const domains = await getAllowedDomainsForAccount(123);
      expect(domains).toEqual(['example.com', 'socialwise.com', 'chatwit.com']);
    });

    it('should handle different account IDs', async () => {
      const domains1 = await getAllowedDomainsForAccount(1);
      const domains2 = await getAllowedDomainsForAccount(999);
      
      // For now, both should return the same default domains
      expect(domains1).toEqual(domains2);
    });
  });

  describe('sanitizeUrl', () => {
    it('should trim whitespace', () => {
      const result = sanitizeUrl('  https://example.com  ');
      expect(result).toBe('https://example.com');
    });

    it('should add HTTPS protocol when missing', () => {
      const result = sanitizeUrl('example.com');
      expect(result).toBe('https://example.com');
    });

    it('should preserve existing HTTPS protocol', () => {
      const result = sanitizeUrl('https://example.com');
      expect(result).toBe('https://example.com');
    });

    it('should preserve existing HTTP protocol', () => {
      const result = sanitizeUrl('http://example.com');
      expect(result).toBe('http://example.com');
    });

    it('should handle URLs with paths and query parameters', () => {
      const result = sanitizeUrl('example.com/path?query=value');
      expect(result).toBe('https://example.com/path?query=value');
    });

    it('should return original URL if parsing fails', () => {
      const invalidUrl = 'not-a-valid-url-format';
      const result = sanitizeUrl(invalidUrl);
      expect(result).toBe(invalidUrl);
    });

    it('should handle empty string', () => {
      const result = sanitizeUrl('');
      expect(result).toBe('');
    });

    it('should normalize URL format', () => {
      const result = sanitizeUrl('HTTPS://EXAMPLE.COM/PATH');
      expect(result).toBe('https://example.com/PATH');
    });
  });

  describe('isSubdomainOf', () => {
    it('should match exact domains', () => {
      expect(isSubdomainOf('example.com', 'example.com')).toBe(true);
    });

    it('should match subdomains', () => {
      expect(isSubdomainOf('api.example.com', 'example.com')).toBe(true);
      expect(isSubdomainOf('sub.api.example.com', 'example.com')).toBe(true);
    });

    it('should not match different domains', () => {
      expect(isSubdomainOf('different.com', 'example.com')).toBe(false);
      expect(isSubdomainOf('notexample.com', 'example.com')).toBe(false);
    });

    it('should be case insensitive', () => {
      expect(isSubdomainOf('API.EXAMPLE.COM', 'example.com')).toBe(true);
      expect(isSubdomainOf('api.example.com', 'EXAMPLE.COM')).toBe(true);
    });

    it('should not match partial domain names', () => {
      expect(isSubdomainOf('notexample.com', 'example.com')).toBe(false);
      expect(isSubdomainOf('example.com.malicious.com', 'example.com')).toBe(false);
    });

    it('should handle empty strings', () => {
      expect(isSubdomainOf('', 'example.com')).toBe(false);
      expect(isSubdomainOf('example.com', '')).toBe(false);
    });
  });

  describe('extractDomain', () => {
    it('should extract domain from HTTPS URL', () => {
      const domain = extractDomain('https://example.com/path');
      expect(domain).toBe('example.com');
    });

    it('should extract domain from HTTP URL', () => {
      const domain = extractDomain('http://example.com');
      expect(domain).toBe('example.com');
    });

    it('should extract subdomain', () => {
      const domain = extractDomain('https://api.example.com');
      expect(domain).toBe('api.example.com');
    });

    it('should handle URLs with ports', () => {
      const domain = extractDomain('https://example.com:8080/path');
      expect(domain).toBe('example.com');
    });

    it('should handle URLs with query parameters', () => {
      const domain = extractDomain('https://example.com/path?query=value');
      expect(domain).toBe('example.com');
    });

    it('should return null for invalid URLs', () => {
      const domain = extractDomain('not-a-url');
      expect(domain).toBeNull();
    });

    it('should return null for empty string', () => {
      const domain = extractDomain('');
      expect(domain).toBeNull();
    });

    it('should handle complex URLs', () => {
      const domain = extractDomain('https://user:pass@api.example.com:443/v1/endpoint?param=value#fragment');
      expect(domain).toBe('api.example.com');
    });
  });
});