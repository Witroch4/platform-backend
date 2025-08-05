/**
 * Domain validation utilities for Instagram web_url buttons
 * Requirements: 9.1, 9.4
 */

export interface DomainConfig {
  allowedDomains: string[];
  requireHttps: boolean;
}

/**
 * Default domain configuration per account
 * This would typically come from database or configuration
 */
const DEFAULT_ALLOWED_DOMAINS = [
  'example.com',
  'socialwise.com',
  'chatwit.com'
];

/**
 * Validate URL against domain allowlist and HTTPS requirement
 * Requirement: 9.1, 9.4
 */
export function validateUrl(url: string, config?: DomainConfig): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  
  if (!url) {
    errors.push('URL is required');
    return { isValid: false, errors };
  }
  
  let urlObj: URL;
  try {
    urlObj = new URL(url);
  } catch {
    errors.push('Invalid URL format');
    return { isValid: false, errors };
  }
  
  // Check HTTPS requirement
  const requireHttps = config?.requireHttps !== false; // Default to true
  if (requireHttps && urlObj.protocol !== 'https:') {
    errors.push('URL must use HTTPS protocol');
  }
  
  // Check domain allowlist
  const allowedDomains = config?.allowedDomains || DEFAULT_ALLOWED_DOMAINS;
  if (allowedDomains.length > 0) {
    const hostname = urlObj.hostname.toLowerCase();
    const isDomainAllowed = allowedDomains.some(domain => {
      const normalizedDomain = domain.toLowerCase();
      return hostname === normalizedDomain || hostname.endsWith('.' + normalizedDomain);
    });
    
    if (!isDomainAllowed) {
      errors.push(`Domain ${hostname} is not in the allowlist`);
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Get allowed domains for an account
 * This would typically query the database
 */
export async function getAllowedDomainsForAccount(accountId: number): Promise<string[]> {
  // TODO: Implement database query to get account-specific allowed domains
  // For now, return default domains
  return DEFAULT_ALLOWED_DOMAINS;
}

/**
 * Sanitize URL by ensuring proper format
 */
export function sanitizeUrl(url: string): string {
  if (!url) return '';
  
  // Trim whitespace
  let sanitized = url.trim();
  
  // Ensure protocol is present
  if (!sanitized.startsWith('http://') && !sanitized.startsWith('https://')) {
    sanitized = 'https://' + sanitized;
  }
  
  try {
    // Validate and normalize URL
    const urlObj = new URL(sanitized);
    return urlObj.toString();
  } catch {
    return url; // Return original if can't parse
  }
}

/**
 * Check if domain is a subdomain of allowed domain
 */
export function isSubdomainOf(hostname: string, allowedDomain: string): boolean {
  const normalizedHostname = hostname.toLowerCase();
  const normalizedDomain = allowedDomain.toLowerCase();
  
  return normalizedHostname === normalizedDomain || 
         normalizedHostname.endsWith('.' + normalizedDomain);
}

/**
 * Extract domain from URL
 */
export function extractDomain(url: string): string | null {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch {
    return null;
  }
}