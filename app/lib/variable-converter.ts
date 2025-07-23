/**
 * Variable Converter for MTF Diamante WhatsApp Templates
 * 
 * This class handles the conversion between custom variable names (e.g., {{pix}}, {{protocolo}})
 * and Meta API compatible sequential numeric format ({{1}}, {{2}}, etc.)
 */

export interface MtfDiamanteVariavel {
  id?: string;
  chave: string;
  valor: string;
}

export interface VariableMapping {
  customName: string;
  numericPosition: number;
  exampleValue: string;
}

export interface ConversionResult {
  convertedText: string;
  parameterArray: string[];
  mapping: VariableMapping[];
}

export class VariableConverter {
  /**
   * Extracts custom variables from template text
   * @param text - Template text containing variables like {{variable_name}}
   * @returns Array of variable names found in the text
   */
  extractVariables(text: string): string[] {
    if (!text || typeof text !== 'string') {
      return [];
    }

    const variableRegex = /\{\{([^}]+)\}\}/g;
    const variables: string[] = [];
    let match;

    while ((match = variableRegex.exec(text)) !== null) {
      const variableName = match[1].trim();
      if (variableName && !variables.includes(variableName)) {
        variables.push(variableName);
      }
    }

    return variables;
  }

  /**
   * Converts custom variables to Meta API format
   * @param templateText - Original template text with custom variables
   * @param variables - Array of available variables with their values
   * @returns Conversion result with Meta API compatible text and parameter array
   */
  convertToMetaFormat(templateText: string, variables: MtfDiamanteVariavel[]): ConversionResult {
    if (!templateText || typeof templateText !== 'string') {
      return {
        convertedText: templateText || '',
        parameterArray: [],
        mapping: []
      };
    }

    // Extract variables from template text
    const extractedVariables = this.extractVariables(templateText);
    
    if (extractedVariables.length === 0) {
      return {
        convertedText: templateText,
        parameterArray: [],
        mapping: []
      };
    }

    // Create mapping and parameter array
    const mapping: VariableMapping[] = [];
    const parameterArray: string[] = [];
    let convertedText = templateText;

    extractedVariables.forEach((variableName, index) => {
      const variable = variables.find(v => v.chave === variableName);
      const value = variable?.valor || `Example ${index + 1}`;
      const numericPosition = index + 1;

      // Create mapping
      mapping.push({
        customName: variableName,
        numericPosition,
        exampleValue: value
      });

      // Add to parameter array
      parameterArray.push(value);

      // Replace custom variable with numeric format in text
      const customVariableRegex = new RegExp(`\\{\\{${this.escapeRegExp(variableName)}\\}\\}`, 'g');
      convertedText = convertedText.replace(customVariableRegex, `{{${numericPosition}}}`);
    });

    return {
      convertedText,
      parameterArray,
      mapping
    };
  }

  /**
   * Generates preview text with actual variable values substituted
   * @param text - Template text with variables
   * @param variables - Array of variables with their values
   * @returns Text with variables replaced by their actual values
   */
  generatePreviewText(text: string, variables: MtfDiamanteVariavel[]): string {
    if (!text || typeof text !== 'string') {
      return text || '';
    }

    let previewText = text;

    variables.forEach(variable => {
      const variableRegex = new RegExp(`\\{\\{${this.escapeRegExp(variable.chave)}\\}\\}`, 'g');
      previewText = previewText.replace(variableRegex, variable.valor);
    });

    return previewText;
  }

  /**
   * Generates preview text with numbered variables and example values
   * @param text - Template text with variables
   * @param variables - Array of variables with their values
   * @returns Text with variables replaced by numbered format with examples
   */
  generateNumberedPreviewText(text: string, variables: MtfDiamanteVariavel[]): string {
    if (!text || typeof text !== 'string') {
      return text || '';
    }

    const extractedVariables = this.extractVariables(text);
    let previewText = text;

    extractedVariables.forEach((variableName, index) => {
      const variable = variables.find(v => v.chave === variableName);
      const exampleValue = variable?.valor || `Example ${index + 1}`;
      const numericPosition = index + 1;

      const variableRegex = new RegExp(`\\{\\{${this.escapeRegExp(variableName)}\\}\\}`, 'g');
      previewText = previewText.replace(variableRegex, `{{${numericPosition}}} (${exampleValue})`);
    });

    return previewText;
  }

  /**
   * Validates if a template text has valid variable syntax
   * @param text - Template text to validate
   * @returns Object with validation result and any errors found
   */
  validateTemplate(text: string): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!text || typeof text !== 'string') {
      return { isValid: true, errors: [] };
    }

    // Check for empty variables
    const emptyVariableRegex = /\{\{\s*\}\}/g;
    if (emptyVariableRegex.test(text)) {
      errors.push('Template contains empty variables. Variable names cannot be empty.');
    }

    // Check for invalid variable names (should contain only lowercase letters and underscores)
    const variables = this.extractVariables(text);
    variables.forEach(variable => {
      if (!/^[a-z_]+$/.test(variable)) {
        errors.push(`Invalid variable name "${variable}". Use only lowercase letters and underscores.`);
      }
    });

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Gets variable statistics for a template
   * @param text - Template text
   * @returns Statistics about variables in the template
   */
  getVariableStats(text: string): {
    totalVariables: number;
    uniqueVariables: number;
    variableNames: string[];
    variableOccurrences: Record<string, number>;
  } {
    if (!text || typeof text !== 'string') {
      return {
        totalVariables: 0,
        uniqueVariables: 0,
        variableNames: [],
        variableOccurrences: {}
      };
    }

    const variableRegex = /\{\{([^}]+)\}\}/g;
    const variableOccurrences: Record<string, number> = {};
    let match;
    let totalVariables = 0;

    while ((match = variableRegex.exec(text)) !== null) {
      const variableName = match[1].trim();
      if (variableName) {
        totalVariables++;
        variableOccurrences[variableName] = (variableOccurrences[variableName] || 0) + 1;
      }
    }

    const variableNames = Object.keys(variableOccurrences);

    return {
      totalVariables,
      uniqueVariables: variableNames.length,
      variableNames,
      variableOccurrences
    };
  }

  /**
   * Escapes special regex characters in a string
   * @param string - String to escape
   * @returns Escaped string safe for use in regex
   */
  private escapeRegExp(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}

// Export a singleton instance for convenience
export const variableConverter = new VariableConverter();