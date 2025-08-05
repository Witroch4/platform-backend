/**
 * Unit tests for PII masking utilities
 */

import {
  maskPII,
  hashSensitiveIdentifier,
  isBrazilianPhone,
  isValidCPF,
  isValidCNPJ,
  sanitizeForAudit,
  PIIDetectionResult,
  HashedIdentifier
} from '@/lib/ai-integration/utils/pii-masking';

describe('PII Masking Utilities', () => {
  describe('maskPII', () => {
    it('should mask Brazilian phone numbers', () => {
      const testCases = [
        'Meu telefone é (11) 99999-9999',
        'Ligue para +55 11 99999-9999',
        'WhatsApp: 11999999999',
        'Contato: (21) 3333-3333'
      ];
      
      testCases.forEach(text => {
        const result = maskPII(text);
        expect(result.hasPII).toBe(true);
        expect(result.detectedTypes).toContain('phone');
        expect(result.maskedText).toContain('[TELEFONE_MASCARADO]');
        expect(result.maskedText).not.toMatch(/\d{4,}/);
      });
    });
    
    it('should mask email addresses', () => {
      const testCases = [
        'Email: joao@exemplo.com',
        'Contato: maria.silva@empresa.com.br',
        'Envie para test123@gmail.com'
      ];
      
      testCases.forEach(text => {
        const result = maskPII(text);
        expect(result.hasPII).toBe(true);
        expect(result.detectedTypes).toContain('email');
        expect(result.maskedText).toContain('[EMAIL_MASCARADO]');
        expect(result.maskedText).not.toContain('@');
      });
    });
    
    it('should mask CPF numbers', () => {
      const testCases = [
        'CPF: 123.456.789-00',
        'Documento: 12345678900',
        'CPF 123.456.789.00'
      ];
      
      testCases.forEach(text => {
        const result = maskPII(text);
        expect(result.hasPII).toBe(true);
        expect(result.detectedTypes).toContain('cpf');
        expect(result.maskedText).toContain('[CPF_MASCARADO]');
      });
    });
    
    it('should mask CNPJ numbers', () => {
      const testCases = [
        'CNPJ: 12.345.678/0001-90',
        'Empresa: 12345678000190',
        'CNPJ 12.345.678/0001.90'
      ];
      
      testCases.forEach(text => {
        const result = maskPII(text);
        expect(result.hasPII).toBe(true);
        expect(result.detectedTypes).toContain('cnpj');
        expect(result.maskedText).toContain('[CNPJ_MASCARADO]');
      });
    });
    
    it('should mask credit card numbers', () => {
      const testCases = [
        'Cartão: 1234 5678 9012 3456',
        'CC: 1234-5678-9012-3456',
        'Card: 1234567890123456'
      ];
      
      testCases.forEach(text => {
        const result = maskPII(text);
        expect(result.hasPII).toBe(true);
        expect(result.detectedTypes).toContain('credit_card');
        expect(result.maskedText).toContain('[CARTAO_MASCARADO]');
      });
    });
    
    it('should handle multiple PII types in same text', () => {
      const text = 'João Silva, CPF 123.456.789-00, telefone (11) 99999-9999, email joao@exemplo.com';
      const result = maskPII(text);
      
      expect(result.hasPII).toBe(true);
      expect(result.detectedTypes).toEqual(expect.arrayContaining(['cpf', 'phone', 'email']));
      expect(result.maskedText).toContain('[CPF_MASCARADO]');
      expect(result.maskedText).toContain('[TELEFONE_MASCARADO]');
      expect(result.maskedText).toContain('[EMAIL_MASCARADO]');
      expect(result.maskedText).toContain('João Silva'); // Name should remain
    });
    
    it('should handle text without PII', () => {
      const text = 'Olá, preciso de ajuda com meu pedido';
      const result = maskPII(text);
      
      expect(result.hasPII).toBe(false);
      expect(result.detectedTypes).toHaveLength(0);
      expect(result.maskedText).toBe(text);
      expect(result.originalLength).toBe(text.length);
      expect(result.maskedLength).toBe(text.length);
    });
    
    it('should handle empty or invalid input', () => {
      const testCases = ['', null, undefined];
      
      testCases.forEach(input => {
        const result = maskPII(input as any);
        expect(result.hasPII).toBe(false);
        expect(result.detectedTypes).toHaveLength(0);
        expect(result.maskedText).toBe(input || '');
      });
    });
    
    it('should track length changes correctly', () => {
      const text = 'Telefone: (11) 99999-9999';
      const result = maskPII(text);
      
      expect(result.originalLength).toBe(text.length);
      expect(result.maskedLength).toBe(result.maskedText.length);
      expect(result.originalLength).not.toBe(result.maskedLength);
    });
  });
  
  describe('hashSensitiveIdentifier', () => {
    it('should hash phone numbers consistently', () => {
      const phone = '11999999999';
      const hash1 = hashSensitiveIdentifier(phone, 'phone');
      const hash2 = hashSensitiveIdentifier(phone, 'phone');
      
      expect(hash1.hash).toBe(hash2.hash);
      expect(hash1.type).toBe('phone');
      expect(hash1.lastFourDigits).toBe('9999');
      expect(hash1.hash).toHaveLength(64); // SHA-256 hex length
    });
    
    it('should hash different identifiers differently', () => {
      const phone1 = '11999999999';
      const phone2 = '11888888888';
      
      const hash1 = hashSensitiveIdentifier(phone1, 'phone');
      const hash2 = hashSensitiveIdentifier(phone2, 'phone');
      
      expect(hash1.hash).not.toBe(hash2.hash);
      expect(hash1.lastFourDigits).toBe('9999');
      expect(hash2.lastFourDigits).toBe('8888');
    });
    
    it('should handle email hashing', () => {
      const email = 'joao@exemplo.com';
      const hash = hashSensitiveIdentifier(email, 'email');
      
      expect(hash.type).toBe('email');
      expect(hash.hash).toHaveLength(64);
      expect(hash.lastFourDigits).toBeUndefined(); // Emails don't have last 4 digits
    });
    
    it('should clean identifiers before hashing', () => {
      const phone1 = '(11) 99999-9999';
      const phone2 = '11999999999';
      
      const hash1 = hashSensitiveIdentifier(phone1, 'phone');
      const hash2 = hashSensitiveIdentifier(phone2, 'phone');
      
      expect(hash1.hash).toBe(hash2.hash); // Should be same after cleaning
    });
    
    it('should throw error for invalid input', () => {
      expect(() => hashSensitiveIdentifier('', 'phone')).toThrow();
      expect(() => hashSensitiveIdentifier(null as any, 'phone')).toThrow();
      expect(() => hashSensitiveIdentifier(undefined as any, 'phone')).toThrow();
    });
  });
  
  describe('isBrazilianPhone', () => {
    it('should validate Brazilian mobile numbers', () => {
      const validMobiles = [
        '5511999999999',    // With country code
        '11999999999',      // Without country code
        '(11) 99999-9999',  // Formatted
        '+55 11 99999-9999' // International format
      ];
      
      validMobiles.forEach(phone => {
        expect(isBrazilianPhone(phone)).toBe(true);
      });
    });
    
    it('should validate Brazilian landline numbers', () => {
      const validLandlines = [
        '1133333333',       // Without country code
        '(11) 3333-3333',   // Formatted
        '+55 11 3333-3333'  // International format
      ];
      
      validLandlines.forEach(phone => {
        expect(isBrazilianPhone(phone)).toBe(true);
      });
    });
    
    it('should reject invalid phone numbers', () => {
      const invalidPhones = [
        '123456789',        // Too short
        '12345678901234',   // Too long
        '11111111111',      // Invalid mobile (doesn't start with 9)
        '1166666666',       // Invalid landline (starts with 6)
        'abc123456789'      // Contains letters
      ];
      
      invalidPhones.forEach(phone => {
        expect(isBrazilianPhone(phone)).toBe(false);
      });
    });
  });
  
  describe('isValidCPF', () => {
    it('should validate correct CPF numbers', () => {
      // These are mathematically valid CPF numbers (not real people)
      const validCPFs = [
        '11144477735',
        '111.444.777-35',
        '111.444.777.35'
      ];
      
      validCPFs.forEach(cpf => {
        expect(isValidCPF(cpf)).toBe(true);
      });
    });
    
    it('should reject invalid CPF numbers', () => {
      const invalidCPFs = [
        '12345678900',      // Invalid check digits
        '111.111.111-11',   // All same digits
        '123.456.789-00',   // Invalid check digits
        '123456789',        // Too short
        '1234567890123'     // Too long
      ];
      
      invalidCPFs.forEach(cpf => {
        expect(isValidCPF(cpf)).toBe(false);
      });
    });
  });
  
  describe('isValidCNPJ', () => {
    it('should validate correct CNPJ numbers', () => {
      // These are mathematically valid CNPJ numbers (not real companies)
      const validCNPJs = [
        '11222333000181',
        '11.222.333/0001-81'
      ];
      
      validCNPJs.forEach(cnpj => {
        expect(isValidCNPJ(cnpj)).toBe(true);
      });
    });
    
    it('should reject invalid CNPJ numbers', () => {
      const invalidCNPJs = [
        '12345678000190',   // Invalid check digits
        '11.111.111/1111-11', // All same digits
        '123456789012',     // Too short
        '123456789012345'   // Too long
      ];
      
      invalidCNPJs.forEach(cnpj => {
        expect(isValidCNPJ(cnpj)).toBe(false);
      });
    });
  });
  
  describe('sanitizeForAudit', () => {
    it('should sanitize string values', () => {
      const text = 'Telefone: (11) 99999-9999, email: joao@exemplo.com';
      const sanitized = sanitizeForAudit(text);
      
      expect(sanitized).toContain('[TELEFONE_MASCARADO]');
      expect(sanitized).toContain('[EMAIL_MASCARADO]');
    });
    
    it('should sanitize object properties', () => {
      const data = {
        name: 'João Silva',
        phone: '11999999999',
        email: 'joao@exemplo.com',
        cpf: '12345678900',
        message: 'Olá, preciso de ajuda'
      };
      
      const sanitized = sanitizeForAudit(data);
      
      expect(sanitized.name).toBe('João Silva'); // Non-sensitive data preserved
      expect(sanitized.message).toBe('Olá, preciso de ajuda');
      expect(sanitized.phone).toContain('PHONE_HASH_');
      expect(sanitized.phone_last4).toBe('9999');
      expect(sanitized.email).toContain('EMAIL_HASH_');
      expect(sanitized.cpf).toContain('CPF_HASH_');
    });
    
    it('should handle nested objects', () => {
      const data = {
        user: {
          contact: {
            phone: '11999999999',
            email: 'joao@exemplo.com'
          }
        },
        message: 'Meu telefone é (11) 88888-8888'
      };
      
      const sanitized = sanitizeForAudit(data);
      
      expect(sanitized.user.contact.phone).toContain('PHONE_HASH_');
      expect(sanitized.user.contact.email).toContain('EMAIL_HASH_');
      expect(sanitized.message).toContain('[TELEFONE_MASCARADO]');
    });
    
    it('should handle arrays', () => {
      const data = [
        { phone: '11999999999' },
        { email: 'joao@exemplo.com' },
        'Texto com telefone (11) 88888-8888'
      ];
      
      const sanitized = sanitizeForAudit(data);
      
      expect(sanitized[0].phone).toContain('PHONE_HASH_');
      expect(sanitized[1].email).toContain('EMAIL_HASH_');
      expect(sanitized[2]).toContain('[TELEFONE_MASCARADO]');
    });
    
    it('should handle null and undefined values', () => {
      const data = {
        phone: null,
        email: undefined,
        cpf: '',
        name: 'João'
      };
      
      const sanitized = sanitizeForAudit(data);
      
      expect(sanitized.phone).toBeNull();
      expect(sanitized.email).toBeUndefined();
      expect(sanitized.cpf).toBe('');
      expect(sanitized.name).toBe('João');
    });
    
    it('should preserve non-object types', () => {
      expect(sanitizeForAudit(123)).toBe(123);
      expect(sanitizeForAudit(true)).toBe(true);
      expect(sanitizeForAudit(null)).toBeNull();
    });
  });
});