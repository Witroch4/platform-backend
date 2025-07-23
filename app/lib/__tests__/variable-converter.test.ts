import { VariableConverter, MtfDiamanteVariavel } from '../variable-converter';

describe('VariableConverter', () => {
  let converter: VariableConverter;
  let mockVariables: MtfDiamanteVariavel[];

  beforeEach(() => {
    converter = new VariableConverter();
    mockVariables = [
      { chave: 'nome', valor: 'João Silva' },
      { chave: 'protocolo', valor: 'ABC123' },
      { chave: 'chave_pix', valor: '12345678901' }
    ];
  });

  describe('extractVariables', () => {
    it('should extract variables from text', () => {
      const text = 'Olá {{nome}}, seu protocolo é {{protocolo}}';
      const result = converter.extractVariables(text);
      expect(result).toEqual(['nome', 'protocolo']);
    });

    it('should handle text without variables', () => {
      const text = 'Texto sem variáveis';
      const result = converter.extractVariables(text);
      expect(result).toEqual([]);
    });

    it('should handle empty text', () => {
      const result = converter.extractVariables('');
      expect(result).toEqual([]);
    });

    it('should remove duplicate variables', () => {
      const text = 'Olá {{nome}}, {{nome}} é seu nome';
      const result = converter.extractVariables(text);
      expect(result).toEqual(['nome']);
    });
  });

  describe('convertToMetaFormat', () => {
    it('should convert custom variables to Meta API format', () => {
      const text = 'Olá {{nome}}, seu protocolo é {{protocolo}}';
      const result = converter.convertToMetaFormat(text, mockVariables);
      
      expect(result.convertedText).toBe('Olá {{1}}, seu protocolo é {{2}}');
      expect(result.parameterArray).toEqual(['João Silva', 'ABC123']);
      expect(result.mapping).toHaveLength(2);
      expect(result.mapping[0]).toEqual({
        customName: 'nome',
        numericPosition: 1,
        exampleValue: 'João Silva'
      });
    });

    it('should handle text without variables', () => {
      const text = 'Texto sem variáveis';
      const result = converter.convertToMetaFormat(text, mockVariables);
      
      expect(result.convertedText).toBe('Texto sem variáveis');
      expect(result.parameterArray).toEqual([]);
      expect(result.mapping).toEqual([]);
    });

    it('should handle missing variable values', () => {
      const text = 'Olá {{nome_inexistente}}';
      const result = converter.convertToMetaFormat(text, mockVariables);
      
      expect(result.convertedText).toBe('Olá {{1}}');
      expect(result.parameterArray).toEqual(['Example 1']);
    });
  });

  describe('generatePreviewText', () => {
    it('should replace variables with actual values', () => {
      const text = 'Olá {{nome}}, seu PIX é {{chave_pix}}';
      const result = converter.generatePreviewText(text, mockVariables);
      
      expect(result).toBe('Olá João Silva, seu PIX é 12345678901');
    });

    it('should handle text without variables', () => {
      const text = 'Texto sem variáveis';
      const result = converter.generatePreviewText(text, mockVariables);
      
      expect(result).toBe('Texto sem variáveis');
    });
  });

  describe('generateNumberedPreviewText', () => {
    it('should replace variables with numbered format and examples', () => {
      const text = 'Olá {{nome}}, seu protocolo é {{protocolo}}';
      const result = converter.generateNumberedPreviewText(text, mockVariables);
      
      expect(result).toBe('Olá {{1}} (João Silva), seu protocolo é {{2}} (ABC123)');
    });

    it('should handle missing variable values with default examples', () => {
      const text = 'Olá {{nome_inexistente}}';
      const result = converter.generateNumberedPreviewText(text, mockVariables);
      
      expect(result).toBe('Olá {{1}} (Example 1)');
    });
  });

  describe('validateTemplate', () => {
    it('should validate correct template', () => {
      const text = 'Olá {{nome}}, seu protocolo é {{protocolo_oab}}';
      const result = converter.validateTemplate(text);
      
      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should detect empty variables', () => {
      const text = 'Olá {{}}, como vai?';
      const result = converter.validateTemplate(text);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Template contains empty variables. Variable names cannot be empty.');
    });

    it('should detect invalid variable names', () => {
      const text = 'Olá {{Nome}}, seu protocolo é {{protocolo-123}}';
      const result = converter.validateTemplate(text);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Invalid variable name "Nome". Use only lowercase letters and underscores.');
      expect(result.errors).toContain('Invalid variable name "protocolo-123". Use only lowercase letters and underscores.');
    });
  });

  describe('getVariableStats', () => {
    it('should return correct statistics', () => {
      const text = 'Olá {{nome}}, {{nome}} é seu nome. Protocolo: {{protocolo}}';
      const result = converter.getVariableStats(text);
      
      expect(result.totalVariables).toBe(3);
      expect(result.uniqueVariables).toBe(2);
      expect(result.variableNames).toEqual(['nome', 'protocolo']);
      expect(result.variableOccurrences).toEqual({
        nome: 2,
        protocolo: 1
      });
    });

    it('should handle text without variables', () => {
      const text = 'Texto sem variáveis';
      const result = converter.getVariableStats(text);
      
      expect(result.totalVariables).toBe(0);
      expect(result.uniqueVariables).toBe(0);
      expect(result.variableNames).toEqual([]);
      expect(result.variableOccurrences).toEqual({});
    });
  });
});