/**
 * Tests for domain allowlist service
 * Requirements: 9.1, 9.4
 */

import {
  getDomainAllowlistForAccount,
  updateDomainAllowlistForAccount,
  addDomainToAllowlist,
  removeDomainFromAllowlist,
  validateUrlForAccount,
  validateUrlsForAccount,
  getDomainAllowlistStats,
  isDefaultAllowedDomain,
  getDomainSuggestions,
  clearDomainAllowlistCache,
  DEFAULT_ALLOWED_DOMAINS
} from '../../../lib/ai-integration/services/domain-allowlist';

describe('Domain Allowlist Service', () => {
  beforeEach(() => {
    // Clear cache before each test
    clearDomainAllowlistCache();
  });

  describe('getDomainAllowlistForAccount', () => {
    it('should return default domains for new account', async () => {
      const domains = await getDomainAllowlistForAccount(123);
      
      expect(domains).toContain('instagram.com');
      expect(domains).toContain('facebook.com');
      expect(domains).toContain('google.com');
      expect(domains.length).toBeGreaterThan(0);
    });

    it('should cache results for subsequent calls', async () => {
      const domains1 = await getDomainAllowlistForAccount(123);
      const domains2 = await getDomainAllowlistForAccount(123);
      
      expect(domains1).toEqual(domains2);
    });

    it('should return different results for different accounts', async () => {
      const domains1 = await getDomainAllowlistForAccount(123);
      const domains2 = await getDomainAllowlistForAccount(456);
      
      // Initially they should be the same (default domains)
      expect(domains1).toEqual(domains2);
      
      // But after updating one account, they should differ
      await updateDomainAllowlistForAccount(123, ['example.com']);
      const updatedDomains1 = await getDomainAllowlistForAccount(123);
      const unchangedDomains2 = await getDomainAllowlistForAccount(456);
      
      expect(updatedDomains1).not.toEqual(unchangedDomains2);
    });
  });

  describe('updateDomainAllowlistForAccount', () => {
    it('should update domain allowlist for account', async () => {
      const newDomains = ['example.com', 'test.org'];
      await updateDomainAllowlistForAccount(123, newDomains, 'admin');
      
      const domains = await getDomainAllowlistForAccount(123);
      expect(domains).toEqual(newDomains);
    });

    it('should normalize domains before saving', async () => {
      const domains = ['EXAMPLE.COM', 'www.test.org', 'https://another.com/path'];
      await updateDomainAllowlistForAccount(123, domains);
      
      const savedDomains = await getDomainAllowlistForAccount(123);
      expect(savedDomains).toContain('example.com');
      expect(savedDomains).toContain('test.org');
      expect(savedDomains).toContain('another.com');
    });

    it('should reject invalid domains', async () => {
      const invalidDomains = ['invalid..domain', '', 'too-long-domain-name-that-exceeds-the-maximum-length-allowed-for-domain-names-which-is-253-characters-and-this-domain-name-is-definitely-longer-than-that-limit-so-it-should-be-rejected-by-the-validation-function.com'];
      
      await expect(updateDomainAllowlistForAccount(123, invalidDomains))
        .rejects.toThrow('Invalid domains');
    });

    it('should handle empty domain list', async () => {
      await updateDomainAllowlistForAccount(123, []);
      
      const domains = await getDomainAllowlistForAccount(123);
      expect(domains).toEqual([]);
    });
  });

  describe('addDomainToAllowlist', () => {
    it('should add new domain to existing allowlist', async () => {
      // Start with default domains
      const initialDomains = await getDomainAllowlistForAccount(123);
      const initialCount = initialDomains.length;
      
      await addDomainToAllowlist(123, 'newdomain.com', 'admin');
      
      const updatedDomains = await getDomainAllowlistForAccount(123);
      expect(updatedDomains).toContain('newdomain.com');
      expect(updatedDomains.length).toBe(initialCount + 1);
    });

    it('should not add duplicate domains', async () => {
      await addDomainToAllowlist(123, 'example.com');
      const domainsAfterFirst = await getDomainAllowlistForAccount(123);
      
      await addDomainToAllowlist(123, 'example.com');
      const domainsAfterSecond = await getDomainAllowlistForAccount(123);
      
      expect(domainsAfterFirst).toEqual(domainsAfterSecond);
    });

    it('should normalize domain before adding', async () => {
      await addDomainToAllowlist(123, 'EXAMPLE.COM');
      
      const domains = await getDomainAllowlistForAccount(123);
      expect(domains).toContain('example.com');
    });

    it('should reject invalid domains', async () => {
      await expect(addDomainToAllowlist(123, 'invalid..domain'))
        .rejects.toThrow('Invalid domain');
    });
  });

  describe('removeDomainFromAllowlist', () => {
    it('should remove domain from allowlist', async () => {
      await updateDomainAllowlistForAccount(123, ['example.com', 'test.org']);
      
      await removeDomainFromAllowlist(123, 'example.com', 'admin');
      
      const domains = await getDomainAllowlistForAccount(123);
      expect(domains).not.toContain('example.com');
      expect(domains).toContain('test.org');
    });

    it('should handle removal of non-existent domain', async () => {
      await updateDomainAllowlistForAccount(123, ['example.com']);
      const initialDomains = await getDomainAllowlistForAccount(123);
      
      await removeDomainFromAllowlist(123, 'nonexistent.com');
      
      const finalDomains = await getDomainAllowlistForAccount(123);
      expect(finalDomains).toEqual(initialDomains);
    });

    it('should normalize domain before removing', async () => {
      await updateDomainAllowlistForAccount(123, ['example.com']);
      
      await removeDomainFromAllowlist(123, 'EXAMPLE.COM');
      
      const domains = await getDomainAllowlistForAccount(123);
      expect(domains).not.toContain('example.com');
    });
  });

  describe('validateUrlForAccount', () => {
    it('should validate URLs against account allowlist', async () => {
      await updateDomainAllowlistForAccount(123, ['example.com']);
      
      const validResult = await validateUrlForAccount('https://example.com/path', 123);
      expect(validResult.isValid).toBe(true);
      expect(validResult.domain).toBe('example.com');
      
      const invalidResult = await validateUrlForAccount('https://malicious.com', 123);
      expect(invalidResult.isValid).toBe(false);
      expect(invalidResult.domain).toBe('malicious.com');
    });

    it('should require HTTPS URLs', async () => {
      await updateDomainAllowlistForAccount(123, ['example.com']);
      
      const result = await validateUrlForAccount('http://example.com', 123);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('URL must use HTTPS protocol');
    });

    it('should handle invalid URL formats', async () => {
      const result = await validateUrlForAccount('not-a-url', 123);
      expect(result.isValid).toBe(false);
      expect(result.domain).toBeNull();
    });

    it('should allow subdomains of allowed domains', async () => {
      await updateDomainAllowlistForAccount(123, ['example.com']);
      
      const result = await validateUrlForAccount('https://api.example.com', 123);
      expect(result.isValid).toBe(true);
      expect(result.domain).toBe('api.example.com');
    });
  });

  describe('validateUrlsForAccount', () => {
    it('should validate multiple URLs efficiently', async () => {
      await updateDomainAllowlistForAccount(123, ['example.com', 'test.org']);
      
      const urls = [
        'https://example.com',
        'https://test.org',
        'https://malicious.com',
        'invalid-url'
      ];
      
      const results = await validateUrlsForAccount(urls, 123);
      
      expect(results.get('https://example.com')?.isValid).toBe(true);
      expect(results.get('https://test.org')?.isValid).toBe(true);
      expect(results.get('https://malicious.com')?.isValid).toBe(false);
      expect(results.get('invalid-url')?.isValid).toBe(false);
    });

    it('should handle empty URL list', async () => {
      const results = await validateUrlsForAccount([], 123);
      expect(results.size).toBe(0);
    });
  });

  describe('getDomainAllowlistStats', () => {
    it('should return stats for account with default domains', async () => {
      const stats = await getDomainAllowlistStats(123);
      
      expect(stats.totalDomains).toBeGreaterThan(0);
      expect(stats.customDomains).toBe(0);
      expect(stats.defaultDomains).toBe(stats.totalDomains);
      expect(stats.lastUpdated).toBeTruthy();
      expect(stats.updatedBy).toBeNull();
    });

    it('should return stats for account with custom domains', async () => {
      await updateDomainAllowlistForAccount(123, ['example.com', 'instagram.com'], 'admin');
      
      const stats = await getDomainAllowlistStats(123);
      
      expect(stats.totalDomains).toBe(2);
      expect(stats.customDomains).toBe(1); // example.com is custom
      expect(stats.defaultDomains).toBe(1); // instagram.com is default
      expect(stats.updatedBy).toBe('admin');
    });
  });

  describe('isDefaultAllowedDomain', () => {
    it('should identify default allowed domains', () => {
      expect(isDefaultAllowedDomain('instagram.com')).toBe(true);
      expect(isDefaultAllowedDomain('facebook.com')).toBe(true);
      expect(isDefaultAllowedDomain('google.com')).toBe(true);
    });

    it('should identify non-default domains', () => {
      expect(isDefaultAllowedDomain('example.com')).toBe(false);
      expect(isDefaultAllowedDomain('malicious.com')).toBe(false);
    });

    it('should handle subdomains of default domains', () => {
      expect(isDefaultAllowedDomain('api.instagram.com')).toBe(true);
      expect(isDefaultAllowedDomain('www.facebook.com')).toBe(true);
    });

    it('should handle case insensitivity', () => {
      expect(isDefaultAllowedDomain('INSTAGRAM.COM')).toBe(true);
      expect(isDefaultAllowedDomain('Facebook.Com')).toBe(true);
    });
  });

  describe('getDomainSuggestions', () => {
    it('should return social media suggestions', () => {
      const suggestions = getDomainSuggestions('social');
      
      expect(suggestions).toContain('instagram.com');
      expect(suggestions).toContain('facebook.com');
      expect(suggestions).toContain('twitter.com');
    });

    it('should return e-commerce suggestions', () => {
      const suggestions = getDomainSuggestions('ecommerce');
      
      expect(suggestions).toContain('shopify.com');
      expect(suggestions).toContain('mercadolivre.com.br');
      expect(suggestions).toContain('amazon.com.br');
    });

    it('should return payment suggestions', () => {
      const suggestions = getDomainSuggestions('payment');
      
      expect(suggestions).toContain('pagseguro.uol.com.br');
      expect(suggestions).toContain('mercadopago.com.br');
      expect(suggestions).toContain('paypal.com');
    });

    it('should return business suggestions', () => {
      const suggestions = getDomainSuggestions('business');
      
      expect(suggestions).toContain('google.com');
      expect(suggestions).toContain('microsoft.com');
      expect(suggestions).toContain('apple.com');
    });

    it('should return all suggestions when no category specified', () => {
      const suggestions = getDomainSuggestions();
      
      expect(suggestions.length).toBeGreaterThan(10);
      expect(suggestions).toContain('instagram.com');
      expect(suggestions).toContain('shopify.com');
      expect(suggestions).toContain('paypal.com');
      expect(suggestions).toContain('google.com');
    });

    it('should handle unknown categories', () => {
      const suggestions = getDomainSuggestions('unknown');
      
      expect(suggestions.length).toBeGreaterThan(10);
    });
  });

  describe('clearDomainAllowlistCache', () => {
    it('should clear cache for specific account', async () => {
      // Populate cache
      await getDomainAllowlistForAccount(123);
      await getDomainAllowlistForAccount(456);
      
      // Clear cache for one account
      clearDomainAllowlistCache(123);
      
      // Account 123 should get fresh data, 456 should use cache
      const domains123 = await getDomainAllowlistForAccount(123);
      const domains456 = await getDomainAllowlistForAccount(456);
      
      expect(domains123).toBeTruthy();
      expect(domains456).toBeTruthy();
    });

    it('should clear all cache when no account specified', async () => {
      // Populate cache
      await getDomainAllowlistForAccount(123);
      await getDomainAllowlistForAccount(456);
      
      // Clear all cache
      clearDomainAllowlistCache();
      
      // Both accounts should get fresh data
      const domains123 = await getDomainAllowlistForAccount(123);
      const domains456 = await getDomainAllowlistForAccount(456);
      
      expect(domains123).toBeTruthy();
      expect(domains456).toBeTruthy();
    });
  });

  describe('DEFAULT_ALLOWED_DOMAINS', () => {
    it('should contain expected default domains', () => {
      expect(DEFAULT_ALLOWED_DOMAINS).toContain('instagram.com');
      expect(DEFAULT_ALLOWED_DOMAINS).toContain('facebook.com');
      expect(DEFAULT_ALLOWED_DOMAINS).toContain('google.com');
      expect(DEFAULT_ALLOWED_DOMAINS).toContain('mercadolivre.com.br');
      expect(DEFAULT_ALLOWED_DOMAINS).toContain('pagseguro.uol.com.br');
    });

    it('should not contain invalid domains', () => {
      DEFAULT_ALLOWED_DOMAINS.forEach(domain => {
        expect(domain).not.toContain('http');
        expect(domain).not.toContain('www.');
        expect(domain).not.toContain('/');
        expect(domain).toBe(domain.toLowerCase());
      });
    });

    it('should have reasonable number of default domains', () => {
      expect(DEFAULT_ALLOWED_DOMAINS.length).toBeGreaterThan(10);
      expect(DEFAULT_ALLOWED_DOMAINS.length).toBeLessThan(100);
    });
  });
});