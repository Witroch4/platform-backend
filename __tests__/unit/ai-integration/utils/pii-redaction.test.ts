/**
 * Tests for PII Redaction
 */

import { PIIRedactor, defaultRedactor, redactPII, redactString, containsPII } from '../../../../lib/ai-integration/utils/pii-redaction';

describe('PIIRedactor', () => {
  let redactor: PIIRedactor;

  beforeEach(() => {
    redactor = new PIIRedactor({
      enabled: true,
      preserveLength: true,
      redactionChar: '*',
    });
  });

  describe('string redaction', () => {
    it('should redact Brazilian phone numbers', () => {
      const tests = [
        { input: '(11) 99999-9999', expected: '***************' },
        { input: '+55 11 99999-9999', expected: '******************' },
        { input: '11999999999', expected: '***********' },
        { input: 'Meu telefone é (11) 99999-9999', expected: 'Meu telefone é ***************' },
      ];

      tests.forEach(({ input, expected }) => {
        expect(redactor.redactString(input)).toBe(expected);
      });
    });

    it('should redact email addresses', () => {
      const tests = [
        { input: 'user@example.com', expected: '****************' },
        { input: 'Contact me at user@example.com', expected: 'Contact me at ****************' },
        { input: 'test.email+tag@domain.co.uk', expected: '****************************' },
      ];

      tests.forEach(({ input, expected }) => {
        expect(redactor.redactString(input)).toBe(expected);
      });
    });

    it('should redact CPF numbers', () => {
      const tests = [
        { input: '123.456.789-01', expected: '**************' },
        { input: '12345678901', expected: '***********' },
        { input: 'CPF: 123.456.789-01', expected: 'CPF: **************' },
      ];

      tests.forEach(({ input, expected }) => {
        expect(redactor.redactString(input)).toBe(expected);
      });
    });

    it('should redact CNPJ numbers', () => {
      const tests = [
        { input: '12.345.678/0001-90', expected: '******************' },
        { input: '12345678000190', expected: '**************' },
      ];

      tests.forEach(({ input, expected }) => {
        expect(redactor.redactString(input)).toBe(expected);
      });
    });

    it('should redact credit card numbers', () => {
      const tests = [
        { input: '1234 5678 9012 3456', expected: '*******************' },
        { input: '1234-5678-9012-3456', expected: '*******************' },
        { input: '1234567890123456', expected: '****************' },
      ];

      tests.forEach(({ input, expected }) => {
        expect(redactor.redactString(input)).toBe(expected);
      });
    });

    it('should handle custom patterns', () => {
      const customRedactor = new PIIRedactor({
        patterns: {
          phone: false,
          email: false,
          cpf: false,
          cnpj: false,
          creditCard: false,
          custom: [/\b\d{4}-\d{4}\b/g], // Custom pattern for 4-4 digit codes
        },
      });

      expect(customRedactor.redactString('Code: 1234-5678')).toBe('Code: *********');
    });
  });

  describe('object redaction', () => {
    it('should redact strings in objects', () => {
      const input = {
        name: 'João Silva',
        phone: '(11) 99999-9999',
        email: 'joao@example.com',
        message: 'Meu telefone é (11) 88888-8888',
      };

      const result = redactor.redactObject(input);

      expect(result.name).toBe('João Silva'); // Not PII
      expect(result.phone).toBe('***************');
      expect(result.email).toBe('*****************');
      expect(result.message).toBe('Meu telefone é ***************');
    });

    it('should redact arrays', () => {
      const input = ['Normal text', '(11) 99999-9999', 'user@example.com'];
      const result = redactor.redactObject(input);

      expect(result).toEqual(['Normal text', '***************', '****************']);
    });

    it('should redact nested objects', () => {
      const input = {
        user: {
          contact: {
            phone: '(11) 99999-9999',
            email: 'user@example.com',
          },
          messages: ['Hello', 'My phone is (11) 88888-8888'],
        },
      };

      const result = redactor.redactObject(input);

      expect(result.user.contact.phone).toBe('***************');
      expect(result.user.contact.email).toBe('****************');
      expect(result.user.messages[1]).toBe('My phone is ***************');
    });
  });

  describe('sensitive field handling', () => {
    it('should apply special redaction to sensitive fields', () => {
      const input = {
        telefone: '(11) 99999-9999',
        email: 'user@example.com',
        cpf: '123.456.789-01',
        password: 'secret123',
      };

      const result = redactor.redactObject(input);

      expect(result.telefone).toBe('***-***-9999'); // Show last 4 digits
      expect(result.email).toBe('***@example.com'); // Show domain
      expect(result.cpf).toBe('***.***.**01'); // Show last 2 digits
      expect(result.password).toBe('*********'); // Full redaction
    });
  });

  describe('configuration options', () => {
    it('should respect disabled redaction', () => {
      const disabledRedactor = new PIIRedactor({ enabled: false });
      const input = 'Phone: (11) 99999-9999';

      expect(disabledRedactor.redactString(input)).toBe(input);
    });

    it('should use labels when preserveLength is false', () => {
      const labelRedactor = new PIIRedactor({ preserveLength: false });
      const input = 'Phone: (11) 99999-9999, Email: user@example.com';

      const result = labelRedactor.redactString(input);
      expect(result).toBe('Phone: [REDACTED_PHONE], Email: [REDACTED_EMAIL]');
    });

    it('should use custom redaction character', () => {
      const customRedactor = new PIIRedactor({ redactionChar: 'X' });
      const input = '(11) 99999-9999';

      expect(customRedactor.redactString(input)).toBe('XXXXXXXXXXXXXXX');
    });
  });

  describe('PII detection', () => {
    it('should detect if text contains PII', () => {
      expect(containsPII('Hello world')).toBe(false);
      expect(containsPII('My phone is (11) 99999-9999')).toBe(true);
      expect(containsPII('Contact: user@example.com')).toBe(true);
      expect(containsPII('CPF: 123.456.789-01')).toBe(true);
    });

    it('should provide detailed PII detection report', () => {
      const text = 'Phone: (11) 99999-9999, Email: user@example.com';
      const report = redactor.detectPII(text);

      expect(report).toHaveLength(2);
      expect(report[0].type).toBe('phone');
      expect(report[0].matches).toEqual(['***************']);
      expect(report[1].type).toBe('email');
      expect(report[1].matches).toEqual(['****************']);
    });
  });

  describe('identifier hashing', () => {
    it('should hash identifiers consistently', () => {
      const identifier = 'user123';
      const hash1 = redactor.hashIdentifier(identifier, 'salt1');
      const hash2 = redactor.hashIdentifier(identifier, 'salt1');
      const hash3 = redactor.hashIdentifier(identifier, 'salt2');

      expect(hash1).toBe(hash2); // Same salt = same hash
      expect(hash1).not.toBe(hash3); // Different salt = different hash
      expect(hash1).toHaveLength(8); // Truncated to 8 chars
    });

    it('should use environment salt by default', () => {
      const originalSalt = process.env.PII_HASH_SALT;
      process.env.PII_HASH_SALT = 'test-salt';

      const hash1 = redactor.hashIdentifier('test');
      const hash2 = redactor.hashIdentifier('test', 'test-salt');

      expect(hash1).toBe(hash2);

      process.env.PII_HASH_SALT = originalSalt;
    });
  });

  describe('default redactor', () => {
    it('should be properly configured', () => {
      expect(defaultRedactor).toBeInstanceOf(PIIRedactor);
    });

    it('should use environment variables for configuration', () => {
      const originalEnabled = process.env.PII_REDACTION_ENABLED;
      const originalChar = process.env.PII_REDACTION_CHAR;

      process.env.PII_REDACTION_ENABLED = 'false';
      process.env.PII_REDACTION_CHAR = 'X';

      const envRedactor = new PIIRedactor();
      expect(envRedactor.redactString('(11) 99999-9999')).toBe('(11) 99999-9999');

      process.env.PII_REDACTION_ENABLED = originalEnabled;
      process.env.PII_REDACTION_CHAR = originalChar;
    });
  });

  describe('convenience functions', () => {
    it('should provide working convenience functions', () => {
      const testData = {
        phone: '(11) 99999-9999',
        message: 'Normal message',
      };

      const redacted = redactPII(testData);
      expect(redacted.phone).toBe('***************');
      expect(redacted.message).toBe('Normal message');

      expect(redactString('Email: user@example.com')).toContain('***');
      expect(containsPII('(11) 99999-9999')).toBe(true);
    });
  });
});