import { renderHook } from '@testing-library/react';
import { useTemplateValidation } from '../useTemplateValidation';

// Mock the variable converter
jest.mock('@/app/lib/variable-converter', () => ({
  variableConverter: {
    validateTemplate: jest.fn((text: string) => ({
      isValid: !text.includes('{{}}') && !text.includes('INVALID'),
      errors: text.includes('{{}}') 
        ? ['Template contains empty variables. Variable names cannot be empty.']
        : text.includes('INVALID')
        ? ['Invalid variable name']
        : []
    })),
    generatePreviewText: jest.fn((text: string, variables: any[]) => {
      return text.replace(/\{\{(\w+)\}\}/g, (match, varName) => {
        const variable = variables.find(v => v.chave === varName);
        return variable ? variable.valor : match;
      });
    }),
    generateNumberedPreviewText: jest.fn((text: string, variables: any[]) => {
      let counter = 1;
      return text.replace(/\{\{(\w+)\}\}/g, (match, varName) => {
        const variable = variables.find(v => v.chave === varName);
        const value = variable ? variable.valor : `Example ${counter}`;
        return `{{${counter++}}} (${value})`;
      });
    }),
    convertToMetaFormat: jest.fn((text: string, variables: any[]) => {
      let counter = 1;
      const convertedText = text.replace(/\{\{(\w+)\}\}/g, () => `{{${counter++}}}`);
      return {
        convertedText,
        parameterArray: ['value1', 'value2'],
        mapping: []
      };
    }),
    getVariableStats: jest.fn((text: string) => {
      const matches = text.match(/\{\{([^}]+)\}\}/g) || [];
      return {
        totalVariables: matches.length,
        uniqueVariables: new Set(matches).size,
        variableNames: matches.map(m => m.replace(/[{}]/g, ''))
      };
    })
  }
}));

const mockVariables = [
  { id: '1', chave: 'nome', valor: 'João Silva' },
  { id: '2', chave: 'protocolo', valor: 'ABC123' }
];

describe('useTemplateValidation', () => {
  const defaultProps = {
    headerText: '',
    bodyText: '',
    footerText: '',
    variables: mockVariables,
    headerType: 'TEXT' as const
  };

  it('validates template correctly with valid content', () => {
    const { result } = renderHook(() =>
      useTemplateValidation({
        ...defaultProps,
        headerText: 'Hello {{nome}}',
        bodyText: 'Your protocol is {{protocolo}}',
        footerText: 'Thank you'
      })
    );

    expect(result.current.isValid).toBe(true);
    expect(result.current.errors).toEqual([]);
    expect(result.current.validation.overall.isValid).toBe(true);
  });

  it('detects validation errors in template', () => {
    const { result } = renderHook(() =>
      useTemplateValidation({
        ...defaultProps,
        headerText: 'Hello {{}}',
        bodyText: 'Invalid content',
        footerText: 'Footer'
      })
    );

    expect(result.current.isValid).toBe(false);
    expect(result.current.errors).toContain('Template contains empty variables. Variable names cannot be empty.');
  });

  it('validates required body text', () => {
    const { result } = renderHook(() =>
      useTemplateValidation({
        ...defaultProps,
        headerText: 'Valid header',
        bodyText: '', // Empty body should be invalid
        footerText: 'Valid footer'
      })
    );

    expect(result.current.isValid).toBe(false);
    expect(result.current.errors).toContain('O corpo da mensagem é obrigatório');
  });

  it('validates header length for TEXT type', () => {
    const longHeader = 'a'.repeat(70); // Exceeds 60 character limit
    const { result } = renderHook(() =>
      useTemplateValidation({
        ...defaultProps,
        headerText: longHeader,
        bodyText: 'Valid body',
        footerText: 'Valid footer',
        headerType: 'TEXT'
      })
    );

    expect(result.current.isValid).toBe(false);
    expect(result.current.errors.some(error => error.includes('60 caracteres'))).toBe(true);
  });

  it('validates body length', () => {
    const longBody = 'a'.repeat(1030); // Exceeds 1024 character limit
    const { result } = renderHook(() =>
      useTemplateValidation({
        ...defaultProps,
        headerText: 'Valid header',
        bodyText: longBody,
        footerText: 'Valid footer'
      })
    );

    expect(result.current.isValid).toBe(false);
    expect(result.current.errors.some(error => error.includes('1024 caracteres'))).toBe(true);
  });

  it('validates footer length', () => {
    const longFooter = 'a'.repeat(70); // Exceeds 60 character limit
    const { result } = renderHook(() =>
      useTemplateValidation({
        ...defaultProps,
        headerText: 'Valid header',
        bodyText: 'Valid body',
        footerText: longFooter
      })
    );

    expect(result.current.isValid).toBe(false);
    expect(result.current.errors.some(error => error.includes('60 caracteres'))).toBe(true);
  });

  it('skips header validation when headerType is not TEXT', () => {
    const { result } = renderHook(() =>
      useTemplateValidation({
        ...defaultProps,
        headerText: 'This should be ignored',
        bodyText: 'Valid body',
        footerText: 'Valid footer',
        headerType: 'IMAGE'
      })
    );

    expect(result.current.validation.header.isValid).toBe(true);
    expect(result.current.validation.header.errors).toEqual([]);
  });

  it('generates preview text correctly', () => {
    const { result } = renderHook(() =>
      useTemplateValidation({
        ...defaultProps,
        bodyText: 'Hello {{nome}}, your protocol is {{protocolo}}'
      })
    );

    const actualPreview = result.current.getPreviewText('Hello {{nome}}', 'actual');
    const numberedPreview = result.current.getPreviewText('Hello {{nome}}', 'numbered');

    expect(actualPreview).toBe('Hello João Silva');
    expect(numberedPreview).toBe('Hello {{1}} (João Silva)');
  });

  it('gets Meta API conversion correctly', () => {
    const { result } = renderHook(() =>
      useTemplateValidation({
        ...defaultProps,
        bodyText: 'Hello {{nome}}'
      })
    );

    const conversion = result.current.getMetaConversion('Hello {{nome}}');

    expect(conversion.convertedText).toBe('Hello {{1}}');
    expect(conversion.parameterArray).toEqual(['value1', 'value2']);
  });

  it('gets variable statistics correctly', () => {
    const { result } = renderHook(() =>
      useTemplateValidation(defaultProps)
    );

    const stats = result.current.getVariableStats('Hello {{nome}} and {{protocolo}}');

    expect(stats.totalVariables).toBe(2);
    expect(stats.uniqueVariables).toBe(2);
    expect(stats.variableNames).toEqual(['nome', 'protocolo']);
  });
});