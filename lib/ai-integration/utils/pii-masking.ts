/**
 * PII Masking Utilities for LGPD Compliance
 * 
 * This module provides utilities to detect and mask personally identifiable information
 * in text content before storing in audit logs, ensuring compliance with LGPD requirements.
 */

import crypto from 'crypto';

// Salt for hashing sensitive identifiers (should be from env in production)
const PII_SALT = process.env.PII_MASKING_SALT || 'default-salt-change-in-production';

/**
 * Phone number patterns for Brazilian numbers
 */
const PHONE_PATTERNS = [
  // Brazilian mobile: +55 11 99999-9999 or (11) 99999-9999 or 11999999999
  /(\+55\s?)?(\(?\d{2}\)?\s?)?(9\d{4}[-\s]?\d{4})/g,
  // Brazilian landline: +55 11 3333-3333 or (11) 3333-3333 or 1133333333
  /(\+55\s?)?(\(?\d{2}\)?\s?)?([2-5]\d{3}[-\s]?\d{4})/g,
  // Generic phone patterns
  /(\+\d{1,3}\s?)?\(?\d{2,3}\)?\s?\d{4,5}[-\s]?\d{4}/g
];

/**
 * Email pattern
 */
const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

/**
 * CPF pattern (Brazilian tax ID)
 */
const CPF_PATTERN = /\d{3}\.?\d{3}\.?\d{3}[-\.]?\d{2}/g;

/**
 * CNPJ pattern (Brazilian company ID)
 */
const CNPJ_PATTERN = /\d{2}\.?\d{3}\.?\d{3}\/?\d{4}[-\.]?\d{2}/g;

/**
 * Credit card pattern (basic)
 */
const CREDIT_CARD_PATTERN = /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g;

/**
 * Interface for PII detection result
 */
export interface PIIDetectionResult {
  hasPII: boolean;
  maskedText: string;
  detectedTypes: string[];
  originalLength: number;
  maskedLength: number;
}

/**
 * Interface for sensitive identifier hashing
 */
export interface HashedIdentifier {
  hash: string;
  lastFourDigits?: string;
  type: 'phone' | 'email' | 'cpf' | 'cnpj' | 'credit_card' | 'contact_id';
}

/**
 * Masks PII in text content
 */
export function maskPII(text: string): PIIDetectionResult {
  if (!text || typeof text !== 'string') {
    return {
      hasPII: false,
      maskedText: text || '',
      detectedTypes: [],
      originalLength: 0,
      maskedLength: 0
    };
  }

  let maskedText = text;
  const detectedTypes: string[] = [];
  const originalLength = text.length;

  // Mask phone numbers
  PHONE_PATTERNS.forEach(pattern => {
    if (pattern.test(maskedText)) {
      detectedTypes.push('phone');
      maskedText = maskedText.replace(pattern, '[TELEFONE_MASCARADO]');
    }
  });

  // Mask emails
  if (EMAIL_PATTERN.test(maskedText)) {
    detectedTypes.push('email');
    maskedText = maskedText.replace(EMAIL_PATTERN, '[EMAIL_MASCARADO]');
  }

  // Mask CPF
  if (CPF_PATTERN.test(maskedText)) {
    detectedTypes.push('cpf');
    maskedText = maskedText.replace(CPF_PATTERN, '[CPF_MASCARADO]');
  }

  // Mask CNPJ
  if (CNPJ_PATTERN.test(maskedText)) {
    detectedTypes.push('cnpj');
    maskedText = maskedText.replace(CNPJ_PATTERN, '[CNPJ_MASCARADO]');
  }

  // Mask credit cards
  if (CREDIT_CARD_PATTERN.test(maskedText)) {
    detectedTypes.push('credit_card');
    maskedText = maskedText.replace(CREDIT_CARD_PATTERN, '[CARTAO_MASCARADO]');
  }

  return {
    hasPII: detectedTypes.length > 0,
    maskedText,
    detectedTypes: [...new Set(detectedTypes)], // Remove duplicates
    originalLength,
    maskedLength: maskedText.length
  };
}

/**
 * Hashes sensitive identifiers with salt for LGPD compliance
 */
export function hashSensitiveIdentifier(
  identifier: string, 
  type: 'phone' | 'email' | 'cpf' | 'cnpj' | 'credit_card' | 'contact_id'
): HashedIdentifier {
  if (!identifier || typeof identifier !== 'string') {
    throw new Error('Invalid identifier provided for hashing');
  }

  // Clean the identifier (remove spaces, dashes, dots)
  const cleanIdentifier = identifier.replace(/[\s\-\.\/\(\)]/g, '');
  
  // Create hash with salt
  const hash = crypto
    .createHmac('sha256', PII_SALT)
    .update(cleanIdentifier)
    .digest('hex');

  // Extract last 4 digits for certain types (when necessary for business logic)
  let lastFourDigits: string | undefined;
  if (['phone', 'cpf', 'cnpj', 'credit_card', 'contact_id'].includes(type) && cleanIdentifier.length >= 4) {
    lastFourDigits = cleanIdentifier.slice(-4);
  }

  return {
    hash,
    lastFourDigits,
    type
  };
}

/**
 * Validates if a phone number is Brazilian
 */
export function isBrazilianPhone(phone: string): boolean {
  const cleanPhone = phone.replace(/[\s\-\.\(\)\+]/g, '');
  
  // Brazilian mobile: 11 digits starting with country code 55
  if (cleanPhone.startsWith('55') && cleanPhone.length === 13) {
    return true;
  }
  
  // Brazilian mobile without country code: 11 digits
  if (cleanPhone.length === 11 && cleanPhone.charAt(2) === '9') {
    return true;
  }
  
  // Brazilian landline without country code: 10 digits
  if (cleanPhone.length === 10 && ['2', '3', '4', '5'].includes(cleanPhone.charAt(2))) {
    return true;
  }
  
  return false;
}

/**
 * Validates Brazilian CPF
 */
export function isValidCPF(cpf: string): boolean {
  const cleanCPF = cpf.replace(/[\.\-]/g, '');
  
  if (cleanCPF.length !== 11 || /^(\d)\1{10}$/.test(cleanCPF)) {
    return false;
  }
  
  // CPF validation algorithm
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(cleanCPF.charAt(i)) * (10 - i);
  }
  
  let remainder = (sum * 10) % 11;
  if (remainder === 10 || remainder === 11) remainder = 0;
  if (remainder !== parseInt(cleanCPF.charAt(9))) return false;
  
  sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += parseInt(cleanCPF.charAt(i)) * (11 - i);
  }
  
  remainder = (sum * 10) % 11;
  if (remainder === 10 || remainder === 11) remainder = 0;
  if (remainder !== parseInt(cleanCPF.charAt(10))) return false;
  
  return true;
}

/**
 * Validates Brazilian CNPJ
 */
export function isValidCNPJ(cnpj: string): boolean {
  const cleanCNPJ = cnpj.replace(/[\.\-\/]/g, '');
  
  if (cleanCNPJ.length !== 14 || /^(\d)\1{13}$/.test(cleanCNPJ)) {
    return false;
  }
  
  // CNPJ validation algorithm
  const weights1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const weights2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += parseInt(cleanCNPJ.charAt(i)) * weights1[i];
  }
  
  let remainder = sum % 11;
  const digit1 = remainder < 2 ? 0 : 11 - remainder;
  
  if (digit1 !== parseInt(cleanCNPJ.charAt(12))) return false;
  
  sum = 0;
  for (let i = 0; i < 13; i++) {
    sum += parseInt(cleanCNPJ.charAt(i)) * weights2[i];
  }
  
  remainder = sum % 11;
  const digit2 = remainder < 2 ? 0 : 11 - remainder;
  
  return digit2 === parseInt(cleanCNPJ.charAt(13));
}

/**
 * Comprehensive PII sanitization for audit logs
 */
export function sanitizeForAudit(data: any): any {
  if (typeof data === 'string') {
    return maskPII(data).maskedText;
  }
  
  if (Array.isArray(data)) {
    return data.map(item => sanitizeForAudit(item));
  }
  
  if (data && typeof data === 'object') {
    const sanitized: any = {};
    
    for (const [key, value] of Object.entries(data)) {
      // Special handling for known sensitive fields
      if (['phone', 'email', 'cpf', 'cnpj', 'contact_id'].includes(key.toLowerCase())) {
        if (typeof value === 'string' && value.length > 0) {
          const type = key.toLowerCase() as 'phone' | 'email' | 'cpf' | 'cnpj';
          try {
            const hashed = hashSensitiveIdentifier(value, type);
            sanitized[key] = `${type.toUpperCase()}_HASH_${hashed.hash.substring(0, 8)}`;
            if (hashed.lastFourDigits) {
              sanitized[`${key}_last4`] = hashed.lastFourDigits;
            }
          } catch (error) {
            sanitized[key] = `[${type.toUpperCase()}_MASCARADO]`;
          }
        } else {
          sanitized[key] = value;
        }
      } else {
        sanitized[key] = sanitizeForAudit(value);
      }
    }
    
    return sanitized;
  }
  
  return data;
}