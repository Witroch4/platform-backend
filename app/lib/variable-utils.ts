/**
 * Variable utilities for MTF Diamante system
 * Provides centralized variable management and automatic footer population
 */

export interface MtfDiamanteVariavel {
  id?: string;
  chave: string;
  valor: string;
  tipo?: 'special' | 'custom';
  isRequired?: boolean;
  maxLength?: number;
  description?: string;
}

/**
 * Special variables that are always required in the system
 */
export const SPECIAL_VARIABLES = {
  chave_pix: {
    chave: 'chave_pix',
    tipo: 'special' as const,
    isRequired: true,
    maxLength: 15,
    description: 'PIX key for copy code button (max 15 characters)'
  },
  nome_do_escritorio_rodape: {
    chave: 'nome_do_escritorio_rodape',
    tipo: 'special' as const,
    isRequired: true,
    description: 'Company name that appears in footer automatically'
  }
} as const;

/**
 * Validates a variable according to system rules
 */
export function validateVariable(variavel: MtfDiamanteVariavel): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check if variable name is valid (lowercase letters and underscores only)
  if (!/^[a-z_]+$/.test(variavel.chave)) {
    errors.push(`Variable name "${variavel.chave}" is invalid. Use only lowercase letters and underscores.`);
  }

  // Check if variable name is empty
  if (!variavel.chave.trim()) {
    errors.push('Variable name cannot be empty.');
  }

  // Check if variable value is empty
  if (!variavel.valor.trim()) {
    errors.push(`Variable "${variavel.chave}" cannot have an empty value.`);
  }

  // Special validation for PIX variable (max 15 characters)
  if (variavel.chave === 'chave_pix' && variavel.valor.length > 15) {
    errors.push('PIX key cannot exceed 15 characters.');
  }

  // Check for required special variables
  if (variavel.tipo === 'special' && variavel.isRequired && !variavel.valor.trim()) {
    errors.push(`Special variable "${variavel.chave}" is required and cannot be empty.`);
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Automatically populates footer with company name if the variable exists
 */
export function getAutoFooter(variables: MtfDiamanteVariavel[], currentFooter?: string): string {
  const companyNameVar = variables.find(v => v.chave === 'nome_do_escritorio_rodape');
  
  if (!companyNameVar?.valor) {
    return currentFooter || '';
  }

  // If footer is empty or doesn't contain the company name variable, add it
  if (!currentFooter || !currentFooter.includes('{{nome_do_escritorio_rodape}}')) {
    const baseFooter = currentFooter || '';
    const separator = baseFooter ? '\n\n' : '';
    return `${baseFooter}${separator}{{nome_do_escritorio_rodape}}`;
  }

  return currentFooter;
}

/**
 * Gets the company name from variables
 */
export function getCompanyName(variables: MtfDiamanteVariavel[]): string {
  const companyNameVar = variables.find(v => v.chave === 'nome_do_escritorio_rodape');
  return companyNameVar?.valor || '';
}

/**
 * Gets the PIX key from variables
 */
export function getPixKey(variables: MtfDiamanteVariavel[]): string {
  const pixVar = variables.find(v => v.chave === 'chave_pix');
  return pixVar?.valor || '';
}

/**
 * Ensures special variables exist in the variables array
 */
export function ensureSpecialVariables(variables: MtfDiamanteVariavel[]): MtfDiamanteVariavel[] {
  const result = [...variables];
  
  // Ensure PIX variable exists
  if (!result.find(v => v.chave === 'chave_pix')) {
    result.push({
      chave: 'chave_pix',
      valor: '',
      tipo: 'special',
      isRequired: true,
      maxLength: 15,
      description: 'PIX key for copy code button (max 15 characters)'
    });
  }

  // Ensure company name variable exists
  if (!result.find(v => v.chave === 'nome_do_escritorio_rodape')) {
    result.push({
      chave: 'nome_do_escritorio_rodape',
      valor: '',
      tipo: 'special',
      isRequired: true,
      description: 'Company name that appears in footer automatically'
    });
  }

  return result;
}

/**
 * Filters variables by type
 */
export function filterVariablesByType(variables: MtfDiamanteVariavel[], type: 'special' | 'custom'): MtfDiamanteVariavel[] {
  if (type === 'special') {
    return variables.filter(v => ['chave_pix', 'nome_do_escritorio_rodape'].includes(v.chave));
  } else {
    return variables.filter(v => !['chave_pix', 'nome_do_escritorio_rodape'].includes(v.chave));
  }
}

/**
 * Creates a template with automatic footer population
 */
export function createTemplateWithAutoFooter(
  header: string,
  body: string,
  footer: string,
  variables: MtfDiamanteVariavel[]
): { header: string; body: string; footer: string } {
  return {
    header,
    body,
    footer: getAutoFooter(variables, footer)
  };
}