import {
  validateVariable,
  getAutoFooter,
  getCompanyName,
  getPixKey,
  ensureSpecialVariables,
  filterVariablesByType,
  createTemplateWithAutoFooter,
  type MtfDiamanteVariavel
} from '../variable-utils';

describe('Variable Utils', () => {
  const mockVariables: MtfDiamanteVariavel[] = [
    {
      id: '1',
      chave: 'chave_pix',
      valor: '12345678901',
      tipo: 'special',
      isRequired: true,
      maxLength: 15
    },
    {
      id: '2',
      chave: 'nome_do_escritorio_rodape',
      valor: 'Test Law Firm',
      tipo: 'special',
      isRequired: true
    },
    {
      id: '3',
      chave: 'custom_var',
      valor: 'Custom Value',
      tipo: 'custom'
    }
  ];

  describe('validateVariable', () => {
    it('should validate valid variable names', () => {
      const validVariable: MtfDiamanteVariavel = {
        chave: 'valid_variable',
        valor: 'Valid Value'
      };

      const result = validateVariable(validVariable);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject invalid variable names with uppercase letters', () => {
      const invalidVariable: MtfDiamanteVariavel = {
        chave: 'Invalid_Variable',
        valor: 'Valid Value'
      };

      const result = validateVariable(invalidVariable);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Variable name "Invalid_Variable" is invalid. Use only lowercase letters and underscores.');
    });

    it('should reject variable names with special characters', () => {
      const invalidVariable: MtfDiamanteVariavel = {
        chave: 'invalid-variable',
        valor: 'Valid Value'
      };

      const result = validateVariable(invalidVariable);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Variable name "invalid-variable" is invalid. Use only lowercase letters and underscores.');
    });

    it('should reject empty variable names', () => {
      const invalidVariable: MtfDiamanteVariavel = {
        chave: '',
        valor: 'Valid Value'
      };

      const result = validateVariable(invalidVariable);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Variable name cannot be empty.');
    });

    it('should reject empty variable values', () => {
      const invalidVariable: MtfDiamanteVariavel = {
        chave: 'valid_variable',
        valor: ''
      };

      const result = validateVariable(invalidVariable);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Variable "valid_variable" cannot have an empty value.');
    });

    it('should validate PIX key length (max 15 characters)', () => {
      const validPixVariable: MtfDiamanteVariavel = {
        chave: 'chave_pix',
        valor: '123456789012345' // 15 characters
      };

      const result = validateVariable(validPixVariable);
      expect(result.isValid).toBe(true);

      const invalidPixVariable: MtfDiamanteVariavel = {
        chave: 'chave_pix',
        valor: '1234567890123456' // 16 characters
      };

      const invalidResult = validateVariable(invalidPixVariable);
      expect(invalidResult.isValid).toBe(false);
      expect(invalidResult.errors).toContain('PIX key cannot exceed 15 characters.');
    });

    it('should validate required special variables', () => {
      const requiredVariable: MtfDiamanteVariavel = {
        chave: 'chave_pix',
        valor: '',
        tipo: 'special',
        isRequired: true
      };

      const result = validateVariable(requiredVariable);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Special variable "chave_pix" is required and cannot be empty.');
    });
  });

  describe('getAutoFooter', () => {
    it('should add company name to empty footer', () => {
      const result = getAutoFooter(mockVariables, '');
      expect(result).toBe('{{nome_do_escritorio_rodape}}');
    });

    it('should add company name to existing footer', () => {
      const result = getAutoFooter(mockVariables, 'Existing footer');
      expect(result).toBe('Existing footer\n\n{{nome_do_escritorio_rodape}}');
    });

    it('should not duplicate company name if already present', () => {
      const existingFooter = 'Footer with {{nome_do_escritorio_rodape}}';
      const result = getAutoFooter(mockVariables, existingFooter);
      expect(result).toBe(existingFooter);
    });

    it('should return current footer if no company name variable exists', () => {
      const variablesWithoutCompany = mockVariables.filter(v => v.chave !== 'nome_do_escritorio_rodape');
      const result = getAutoFooter(variablesWithoutCompany, 'Current footer');
      expect(result).toBe('Current footer');
    });
  });

  describe('getCompanyName', () => {
    it('should return company name from variables', () => {
      const result = getCompanyName(mockVariables);
      expect(result).toBe('Test Law Firm');
    });

    it('should return empty string if company name variable not found', () => {
      const variablesWithoutCompany = mockVariables.filter(v => v.chave !== 'nome_do_escritorio_rodape');
      const result = getCompanyName(variablesWithoutCompany);
      expect(result).toBe('');
    });
  });

  describe('getPixKey', () => {
    it('should return PIX key from variables', () => {
      const result = getPixKey(mockVariables);
      expect(result).toBe('12345678901');
    });

    it('should return empty string if PIX key variable not found', () => {
      const variablesWithoutPix = mockVariables.filter(v => v.chave !== 'chave_pix');
      const result = getPixKey(variablesWithoutPix);
      expect(result).toBe('');
    });
  });

  describe('ensureSpecialVariables', () => {
    it('should add missing special variables', () => {
      const customOnlyVariables = mockVariables.filter(v => v.tipo === 'custom');
      const result = ensureSpecialVariables(customOnlyVariables);
      
      expect(result).toHaveLength(3); // 1 custom + 2 special
      expect(result.find(v => v.chave === 'chave_pix')).toBeDefined();
      expect(result.find(v => v.chave === 'nome_do_escritorio_rodape')).toBeDefined();
    });

    it('should not duplicate existing special variables', () => {
      const result = ensureSpecialVariables(mockVariables);
      expect(result).toHaveLength(3); // Should remain the same
    });
  });

  describe('filterVariablesByType', () => {
    it('should filter special variables', () => {
      const result = filterVariablesByType(mockVariables, 'special');
      expect(result).toHaveLength(2);
      expect(result.every(v => ['chave_pix', 'nome_do_escritorio_rodape'].includes(v.chave))).toBe(true);
    });

    it('should filter custom variables', () => {
      const result = filterVariablesByType(mockVariables, 'custom');
      expect(result).toHaveLength(1);
      expect(result[0].chave).toBe('custom_var');
    });
  });

  describe('createTemplateWithAutoFooter', () => {
    it('should create template with automatic footer population', () => {
      const result = createTemplateWithAutoFooter(
        'Header',
        'Body',
        'Footer',
        mockVariables
      );

      expect(result.header).toBe('Header');
      expect(result.body).toBe('Body');
      expect(result.footer).toBe('Footer\n\n{{nome_do_escritorio_rodape}}');
    });

    it('should not modify footer if company name already present', () => {
      const result = createTemplateWithAutoFooter(
        'Header',
        'Body',
        'Footer with {{nome_do_escritorio_rodape}}',
        mockVariables
      );

      expect(result.footer).toBe('Footer with {{nome_do_escritorio_rodape}}');
    });
  });
});