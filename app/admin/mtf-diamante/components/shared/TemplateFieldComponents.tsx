'use client';

import React, { forwardRef } from 'react';
import { EnhancedTextArea, EnhancedTextAreaRef } from '../EnhancedTextArea';
import { variableConverter } from '@/app/lib/variable-converter';

interface MtfDiamanteVariavel {
  id?: string;
  chave: string;
  valor: string;
}

interface BaseFieldProps {
  value: string;
  onChange: (value: string) => void;
  variables: MtfDiamanteVariavel[];
  disabled?: boolean;
  className?: string;
  showValidation?: boolean;
  showVariableStats?: boolean;
  onValidationChange?: (isValid: boolean, errors: string[]) => void;
}

interface HeaderFieldProps extends BaseFieldProps {
  headerType?: 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT' | 'NONE';
}

interface BodyFieldProps extends BaseFieldProps {
  showPreview?: boolean;
  previewMode?: 'numbered' | 'actual';
}

interface FooterFieldProps extends BaseFieldProps {
  autoPopulateCompanyName?: boolean;
}

// Header Field Component
export const HeaderField = forwardRef<EnhancedTextAreaRef, HeaderFieldProps>(({
  value,
  onChange,
  variables,
  disabled = false,
  className,
  showValidation = true,
  showVariableStats = false,
  onValidationChange,
  headerType = 'TEXT'
}, ref) => {
  // Only show for TEXT headers
  if (headerType !== 'TEXT') {
    return null;
  }

  return (
    <EnhancedTextArea
      ref={ref}
      value={value}
      onChange={onChange}
      variables={variables}
      disabled={disabled}
      className={className}
      multiline={false}
      maxLength={60}
      placeholder="Digite o texto do cabeçalho (máximo 60 caracteres)"
      label="Texto do Cabeçalho"
      description="O cabeçalho aparece no topo da mensagem. Use variáveis para personalizar o conteúdo."
      showValidation={showValidation}
      showVariableStats={showVariableStats}
      onValidationChange={onValidationChange}
    />
  );
});

HeaderField.displayName = 'HeaderField';

// Body Field Component
export const BodyField = forwardRef<EnhancedTextAreaRef, BodyFieldProps>(({
  value,
  onChange,
  variables,
  disabled = false,
  className,
  showValidation = true,
  showVariableStats = true,
  onValidationChange,
  showPreview = false,
  previewMode = 'numbered'
}, ref) => {
  const previewText = React.useMemo(() => {
    if (!showPreview || !value) return '';
    
    if (previewMode === 'actual') {
      return variableConverter.generatePreviewText(value, variables);
    } else {
      return variableConverter.generateNumberedPreviewText(value, variables);
    }
  }, [value, variables, showPreview, previewMode]);

  return (
    <div className="space-y-3">
      <EnhancedTextArea
        ref={ref}
        value={value}
        onChange={onChange}
        variables={variables}
        disabled={disabled}
        className={className}
        multiline={true}
        rows={4}
        maxLength={1024}
        placeholder="Digite o conteúdo principal da mensagem (máximo 1024 caracteres)"
        label="Corpo da Mensagem *"
        description="O corpo é o conteúdo principal da mensagem. Use variáveis para personalizar o texto para cada destinatário."
        showValidation={showValidation}
        showVariableStats={showVariableStats}
        onValidationChange={onValidationChange}
      />
      
      {/* Preview Section */}
      {showPreview && previewText && (
        <div className="border rounded-lg p-3 bg-muted/30">
          <div className="text-xs font-medium text-muted-foreground mb-2">
            Pré-visualização {previewMode === 'actual' ? '(com valores reais)' : '(formato numerado)'}:
          </div>
          <div className="text-sm whitespace-pre-wrap">
            {previewText}
          </div>
        </div>
      )}
    </div>
  );
});

BodyField.displayName = 'BodyField';

// Footer Field Component
export const FooterField = forwardRef<EnhancedTextAreaRef, FooterFieldProps>(({
  value,
  onChange,
  variables,
  disabled = false,
  className,
  showValidation = true,
  showVariableStats = false,
  onValidationChange,
  autoPopulateCompanyName = true
}, ref) => {
  // Auto-populate footer with company name if enabled and footer is empty
  React.useEffect(() => {
    if (autoPopulateCompanyName && !value) {
      const companyNameVar = variables.find(v => v.chave === 'nome_do_escritorio_rodape');
      if (companyNameVar) {
        onChange(`{{nome_do_escritorio_rodape}}`);
      }
    }
  }, [autoPopulateCompanyName, value, variables, onChange]);

  return (
    <EnhancedTextArea
      ref={ref}
      value={value}
      onChange={onChange}
      variables={variables}
      disabled={disabled}
      className={className}
      multiline={false}
      maxLength={60}
      placeholder="Digite o texto do rodapé (opcional, máximo 60 caracteres)"
      label="Rodapé da Mensagem"
      description="O rodapé aparece na parte inferior da mensagem. Geralmente usado para informações da empresa."
      showValidation={showValidation}
      showVariableStats={showVariableStats}
      onValidationChange={onValidationChange}
    />
  );
});

FooterField.displayName = 'FooterField';

// Combined Template Fields Component
interface TemplateFieldsProps {
  headerType: 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT' | 'NONE';
  headerValue: string;
  onHeaderChange: (value: string) => void;
  bodyValue: string;
  onBodyChange: (value: string) => void;
  footerValue: string;
  onFooterChange: (value: string) => void;
  variables: MtfDiamanteVariavel[];
  disabled?: boolean;
  showPreview?: boolean;
  previewMode?: 'numbered' | 'actual';
  autoPopulateFooter?: boolean;
  onValidationChange?: (field: 'header' | 'body' | 'footer', isValid: boolean, errors: string[]) => void;
}

export const TemplateFields: React.FC<TemplateFieldsProps> = ({
  headerType,
  headerValue,
  onHeaderChange,
  bodyValue,
  onBodyChange,
  footerValue,
  onFooterChange,
  variables,
  disabled = false,
  showPreview = false,
  previewMode = 'numbered',
  autoPopulateFooter = true,
  onValidationChange
}) => {
  const handleHeaderValidation = React.useCallback((isValid: boolean, errors: string[]) => {
    onValidationChange?.('header', isValid, errors);
  }, [onValidationChange]);

  const handleBodyValidation = React.useCallback((isValid: boolean, errors: string[]) => {
    onValidationChange?.('body', isValid, errors);
  }, [onValidationChange]);

  const handleFooterValidation = React.useCallback((isValid: boolean, errors: string[]) => {
    onValidationChange?.('footer', isValid, errors);
  }, [onValidationChange]);

  return (
    <div className="space-y-6">
      {/* Header Field */}
      {headerType === 'TEXT' && (
        <HeaderField
          value={headerValue}
          onChange={onHeaderChange}
          variables={variables}
          disabled={disabled}
          headerType={headerType}
          onValidationChange={handleHeaderValidation}
        />
      )}

      {/* Body Field */}
      <BodyField
        value={bodyValue}
        onChange={onBodyChange}
        variables={variables}
        disabled={disabled}
        showPreview={showPreview}
        previewMode={previewMode}
        onValidationChange={handleBodyValidation}
      />

      {/* Footer Field */}
      <FooterField
        value={footerValue}
        onChange={onFooterChange}
        variables={variables}
        disabled={disabled}
        autoPopulateCompanyName={autoPopulateFooter}
        onValidationChange={handleFooterValidation}
      />
    </div>
  );
};

export default TemplateFields;