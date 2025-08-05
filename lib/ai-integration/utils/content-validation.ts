/**
 * Advanced content validation and truncation utilities
 * Requirements: 9.1, 9.2, 9.3, 9.4
 */

import { smartTruncate, normalizeText } from './text-normalization';
import { isValidHttpsUrl, isDomainAllowed } from './text-normalization';

export interface ContentValidationOptions {
  maxLength: number;
  preserveWordBoundaries?: boolean;
  allowedDomains?: string[];
  requireHttps?: boolean;
  allowMarkdown?: boolean;
  allowHtml?: boolean;
}

export interface ValidationResult {
  isValid: boolean;
  sanitized: string;
  errors: string[];
  warnings: string[];
  truncated: boolean;
}

/**
 * Validate and sanitize text content with smart truncation
 * Requirements: 9.1, 9.2, 9.3, 9.4
 */
export function validateAndSanitizeText(
  text: string,
  options: ContentValidationOptions
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  let sanitized = text || '';
  let truncated = false;

  // Normalize text first
  sanitized = normalizeText(sanitized, {
    removeInvisible: true,
    collapseSpaces: true,
    limitEmojis: 3
  });

  // Check if truncation is needed
  if (sanitized.length > options.maxLength) {
    const originalLength = sanitized.length;
    sanitized = smartTruncate(
      sanitized, 
      options.maxLength, 
      options.preserveWordBoundaries !== false
    );
    truncated = true;
    warnings.push(`Text truncated from ${originalLength} to ${sanitized.length} characters`);
  }

  // Validate content restrictions
  if (!options.allowMarkdown && containsMarkdown(sanitized)) {
    errors.push('Markdown formatting is not allowed');
  }

  if (!options.allowHtml && containsHtml(sanitized)) {
    errors.push('HTML content is not allowed');
  }

  // Extract and validate URLs
  const urls = extractUrls(sanitized);
  for (const url of urls) {
    if (options.requireHttps !== false && !isValidHttpsUrl(url)) {
      errors.push(`URL must use HTTPS: ${url}`);
    }

    if (options.allowedDomains && !isDomainAllowed(url, options.allowedDomains)) {
      errors.push(`URL domain not allowed: ${url}`);
    }
  }

  return {
    isValid: errors.length === 0,
    sanitized,
    errors,
    warnings,
    truncated
  };
}

/**
 * Validate interactive content fallback
 * Requirements: 9.1, 9.2, 9.3, 9.4
 */
export function createFallbackText(
  originalContent: any,
  reason: string
): string {
  const fallbackMessages = {
    'invalid_buttons': 'Desculpe, não foi possível exibir as opções. Digite sua mensagem ou "ajuda" para falar com um atendente.',
    'url_validation_failed': 'Alguns links não puderam ser exibidos por questões de segurança. Digite "ajuda" para falar com um atendente.',
    'content_too_long': 'A mensagem foi simplificada. Digite "ajuda" para mais informações ou falar com um atendente.',
    'unsupported_format': 'Formato não suportado neste canal. Digite "ajuda" para falar with um atendente.',
    'default': 'Ocorreu um problema ao processar sua mensagem. Digite "ajuda" para falar com um atendente.'
  };

  return fallbackMessages[reason as keyof typeof fallbackMessages] || fallbackMessages.default;
}

/**
 * Check if text contains markdown formatting
 */
function containsMarkdown(text: string): boolean {
  const markdownPatterns = [
    /\*\*.*?\*\*/,  // Bold
    /\*.*?\*/,      // Italic
    /`.*?`/,        // Code
    /\[.*?\]\(.*?\)/, // Links
    /^#{1,6}\s/m,   // Headers
    /^\s*[-*+]\s/m, // Lists
    /^\s*\d+\.\s/m  // Numbered lists
  ];

  return markdownPatterns.some(pattern => pattern.test(text));
}

/**
 * Check if text contains HTML tags
 */
function containsHtml(text: string): boolean {
  const htmlPattern = /<[^>]*>/;
  return htmlPattern.test(text);
}

/**
 * Extract URLs from text
 */
function extractUrls(text: string): string[] {
  const urlPattern = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi;
  return text.match(urlPattern) || [];
}

/**
 * Validate button title with specific rules
 * Requirements: 9.2, 9.4
 */
export function validateButtonTitle(
  title: string,
  maxLength: number = 20
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  let sanitized = title || '';
  let truncated = false;

  // Normalize title
  sanitized = normalizeText(sanitized, {
    removeInvisible: true,
    collapseSpaces: true,
    normalizeAccents: true,
    titleCase: true,
    limitEmojis: 1 // Limit to 1 emoji in button titles
  });

  // Check for empty title
  if (!sanitized.trim()) {
    errors.push('Button title cannot be empty');
    return {
      isValid: false,
      sanitized: '',
      errors,
      warnings,
      truncated: false
    };
  }

  // Truncate if needed
  if (sanitized.length > maxLength) {
    const originalLength = sanitized.length;
    sanitized = smartTruncate(sanitized, maxLength, true);
    truncated = true;
    warnings.push(`Button title truncated from ${originalLength} to ${sanitized.length} characters`);
  }

  // Validate content
  if (containsHtml(sanitized)) {
    errors.push('Button title cannot contain HTML');
  }

  if (containsMarkdown(sanitized)) {
    errors.push('Button title cannot contain markdown');
  }

  // Check for special characters that might cause issues
  const invalidChars = /[<>{}[\]\\]/;
  if (invalidChars.test(sanitized)) {
    errors.push('Button title contains invalid characters');
  }

  return {
    isValid: errors.length === 0,
    sanitized,
    errors,
    warnings,
    truncated
  };
}

/**
 * Validate URL for web buttons with comprehensive checks
 * Requirements: 9.1, 9.4
 */
export function validateWebUrl(
  url: string,
  allowedDomains?: string[]
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  let sanitized = url?.trim() || '';

  if (!sanitized) {
    errors.push('URL is required for web buttons');
    return {
      isValid: false,
      sanitized: '',
      errors,
      warnings,
      truncated: false
    };
  }

  // Add protocol if missing
  if (!sanitized.startsWith('http://') && !sanitized.startsWith('https://')) {
    sanitized = 'https://' + sanitized;
    warnings.push('Added HTTPS protocol to URL');
  }

  // Validate URL format
  try {
    const urlObj = new URL(sanitized);
    
    // Ensure HTTPS
    if (urlObj.protocol !== 'https:') {
      errors.push('URL must use HTTPS protocol');
    }

    // Check domain allowlist
    if (allowedDomains && allowedDomains.length > 0) {
      const hostname = urlObj.hostname.toLowerCase();
      const isAllowed = allowedDomains.some(domain => {
        const normalizedDomain = domain.toLowerCase();
        return hostname === normalizedDomain || hostname.endsWith('.' + normalizedDomain);
      });

      if (!isAllowed) {
        errors.push(`Domain ${hostname} is not in the allowlist`);
      }
    }

    // Validate URL length (some platforms have limits)
    if (sanitized.length > 2000) {
      errors.push('URL is too long (maximum 2000 characters)');
    }

    // Check for suspicious patterns
    if (urlObj.hostname.includes('localhost') || urlObj.hostname.includes('127.0.0.1')) {
      errors.push('Local URLs are not allowed');
    }

    // Normalize URL
    sanitized = urlObj.toString();

  } catch (error) {
    errors.push('Invalid URL format');
  }

  return {
    isValid: errors.length === 0,
    sanitized,
    errors,
    warnings,
    truncated: false
  };
}

/**
 * Create safe fallback content when interactive content fails validation
 * Requirements: 9.1, 9.2, 9.3, 9.4
 */
export function createSafeFallback(
  originalText: string,
  channel: 'whatsapp' | 'instagram' | 'messenger',
  reason: 'invalid_buttons' | 'url_validation' | 'content_too_long' | 'general_error'
): {
  text: string;
  includeHelpButton: boolean;
} {
  const maxLength = channel === 'instagram' ? 1000 : 1024;
  
  // Sanitize original text
  const validation = validateAndSanitizeText(originalText, {
    maxLength: maxLength - 100, // Reserve space for fallback message
    preserveWordBoundaries: true
  });

  let fallbackText = validation.sanitized;
  
  // Add appropriate fallback message
  const fallbackMessages = {
    invalid_buttons: '\n\nDigite "ajuda" para falar com um atendente.',
    url_validation: '\n\nAlguns links não puderam ser exibidos. Digite "ajuda" para mais informações.',
    content_too_long: '\n\nMensagem simplificada. Digite "ajuda" para versão completa.',
    general_error: '\n\nDigite "ajuda" para falar com um atendente.'
  };

  const suffix = fallbackMessages[reason];
  
  // Ensure total length doesn't exceed limit
  if ((fallbackText + suffix).length > maxLength) {
    const availableLength = maxLength - suffix.length;
    fallbackText = smartTruncate(fallbackText, availableLength, true);
  }

  return {
    text: fallbackText + suffix,
    includeHelpButton: reason === 'invalid_buttons'
  };
}