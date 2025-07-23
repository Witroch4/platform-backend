'use client';

import type React from 'react';
import { useRef, useCallback, forwardRef, useImperativeHandle, useState, useEffect } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { VariableContextMenu } from './VariableContextMenu';
import { variableConverter } from '@/app/lib/variable-converter';
import { cn } from '@/lib/utils';
import { AlertCircle, CheckCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface MtfDiamanteVariavel {
  id?: string;
  chave: string;
  valor: string;
}

interface EnhancedTextAreaProps {
  value: string;
  onChange: (value: string) => void;
  variables: MtfDiamanteVariavel[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  multiline?: boolean;
  maxLength?: number;
  rows?: number;
  label?: React.ReactNode;
  description?: string;
  showValidation?: boolean;
  showVariableStats?: boolean;
  onValidationChange?: (isValid: boolean, errors: string[]) => void;
}

export interface EnhancedTextAreaRef {
  focus: () => void;
  insertVariable: (variable: string) => void;
}

export const EnhancedTextArea = forwardRef<EnhancedTextAreaRef, EnhancedTextAreaProps>(({
  value,
  onChange,
  variables,
  placeholder,
  className,
  disabled = false,
  multiline = true,
  maxLength,
  rows = 3,
  label,
  description,
  showValidation = true,
  showVariableStats = false,
  onValidationChange
}, ref) => {
  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [validation, setValidation] = useState<{ isValid: boolean; errors: string[] }>({ isValid: true, errors: [] });
  const [variableStats, setVariableStats] = useState<{
    totalVariables: number;
    uniqueVariables: number;
    variableNames: string[];
  }>({ totalVariables: 0, uniqueVariables: 0, variableNames: [] });

  // Validate template and update stats when value changes
  useEffect(() => {
    if (showValidation || showVariableStats) {
      const validationResult = variableConverter.validateTemplate(value);
      const statsResult = variableConverter.getVariableStats(value);
      
      setValidation(validationResult);
      setVariableStats({
        totalVariables: statsResult.totalVariables,
        uniqueVariables: statsResult.uniqueVariables,
        variableNames: statsResult.variableNames
      });

      // Notify parent component of validation changes
      if (onValidationChange) {
        onValidationChange(validationResult.isValid, validationResult.errors);
      }
    }
  }, [value, showValidation, showVariableStats, onValidationChange]);

  const handleVariableInsert = useCallback((variable: string) => {
    const element = multiline ? textAreaRef.current : inputRef.current;
    if (!element) return;

    const start = element.selectionStart || 0;
    const end = element.selectionEnd || 0;
    const newValue = value.substring(0, start) + variable + value.substring(end);
    
    onChange(newValue);
    
    // Restore cursor position after the inserted variable
    setTimeout(() => {
      const newCursorPosition = start + variable.length;
      element.setSelectionRange(newCursorPosition, newCursorPosition);
      element.focus();
    }, 0);
  }, [value, onChange, multiline]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    // Allow Ctrl+Space or Alt+Space to trigger variable insertion
    if ((e.ctrlKey || e.altKey) && e.code === 'Space') {
      e.preventDefault();
      // This could trigger a variable selection dialog in the future
      // For now, we rely on right-click context menu
    }
  }, []);

  // Expose methods to parent component
  useImperativeHandle(ref, () => ({
    focus: () => {
      const element = multiline ? textAreaRef.current : inputRef.current;
      element?.focus();
    },
    insertVariable: handleVariableInsert
  }), [handleVariableInsert, multiline]);

  const commonProps = {
    value,
    onChange: (e: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) => onChange(e.target.value),
    placeholder,
    disabled,
    maxLength,
    onKeyDown: handleKeyDown,
    className: cn(
      "transition-colors",
      "focus:ring-2 focus:ring-primary/20",
      className
    )
  };

  const inputElement = multiline ? (
    <Textarea
      ref={textAreaRef}
      rows={rows}
      {...commonProps}
    />
  ) : (
    <Input
      ref={inputRef}
      {...commonProps}
    />
  );

  return (
    <div className="space-y-2">
      {label && (
        <div className="space-y-1">
          <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
            {label}
          </label>
          {description && (
            <p className="text-xs text-muted-foreground">
              {description}
            </p>
          )}
        </div>
      )}
      <VariableContextMenu
        onVariableInsert={handleVariableInsert}
        variables={variables}
        disabled={disabled}
      >
        {inputElement}
      </VariableContextMenu>
      
      {/* Validation Messages */}
      {showValidation && !validation.isValid && (
        <Alert variant="destructive" className="mt-2">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            <div className="space-y-1">
              {validation.errors.map((error, index) => (
                <div key={index} className="text-sm">
                  {error}
                </div>
              ))}
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Variable Statistics */}
      {showVariableStats && variableStats.totalVariables > 0 && (
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <CheckCircle className="h-3 w-3" />
            <span>{variableStats.totalVariables} variáveis encontradas</span>
          </div>
          {variableStats.uniqueVariables !== variableStats.totalVariables && (
            <div>
              <span>{variableStats.uniqueVariables} únicas</span>
            </div>
          )}
          {variableStats.variableNames.length > 0 && (
            <div className="flex items-center gap-1">
              <span>Variáveis:</span>
              <span className="font-mono text-xs bg-muted px-1 rounded">
                {variableStats.variableNames.join(', ')}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Character Count */}
      {maxLength && (
        <div className="text-xs text-muted-foreground text-right">
          {value.length}/{maxLength}
        </div>
      )}
    </div>
  );
});

EnhancedTextArea.displayName = 'EnhancedTextArea';

export default EnhancedTextArea;