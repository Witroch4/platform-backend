'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { debounce } from 'lodash';
import type { 
  InteractiveMessage, 
  ButtonReaction,
  QuickReplyButton
} from '@/types/interactive-messages';
import { 
  InteractiveMessageValidator,
  type ValidationResult,
  type FieldValidationResult,
  type ValidationError,
  type ValidationContext
} from '@/lib/validation/interactive-message-validation';
import { 
  errorHandler,
  type StructuredError
} from '@/lib/error-handling/interactive-message-errors';

// Hook state interface
interface ValidationState {
  isValidating: boolean;
  lastValidated: Date | null;
  messageValidation: ValidationResult | null;
  fieldValidations: Record<string, FieldValidationResult>;
  isDirty: boolean;
  hasErrors: boolean;
  hasWarnings: boolean;
}

// Hook configuration
interface UseValidationConfig {
  enableRealTimeValidation: boolean;
  debounceMs: number;
  validateOnMount: boolean;
  context?: ValidationContext;
}

// Default configuration
const DEFAULT_CONFIG: UseValidationConfig = {
  enableRealTimeValidation: true,
  debounceMs: 300,
  validateOnMount: false
};

// Hook return interface
interface UseInteractiveMessageValidationReturn {
  // State
  validationState: ValidationState;
  
  // Validation functions
  validateMessage: (message: InteractiveMessage) => Promise<ValidationResult>;
  validateField: (fieldName: string, value: any, message: InteractiveMessage) => FieldValidationResult;
  validateButtonReactions: (reactions: ButtonReaction[], buttons: QuickReplyButton[]) => ValidationResult;
  
  // Utility functions
  clearValidation: () => void;
  isFieldValid: (fieldName: string) => boolean;
  getFieldErrors: (fieldName: string) => ValidationError[];
  getFieldWarnings: (fieldName: string) => ValidationError[];
  canProceed: () => boolean;
  
  // Error handling
  handleValidationError: (error: any) => StructuredError;
}

export const useInteractiveMessageValidation = (
  message: InteractiveMessage,
  reactions: ButtonReaction[] = [],
  config: Partial<UseValidationConfig> = {}
): UseInteractiveMessageValidationReturn => {
  
  const finalConfig = useMemo(() => ({ ...DEFAULT_CONFIG, ...config }), [config]);
  
  // State management
  const [validationState, setValidationState] = useState<ValidationState>({
    isValidating: false,
    lastValidated: null,
    messageValidation: null,
    fieldValidations: {},
    isDirty: false,
    hasErrors: false,
    hasWarnings: false
  });

  // Extract buttons from message for reaction validation
  const buttons = useMemo(() => {
    if (message.action?.type === 'button') {
      return message.action.buttons || [];
    }
    return [];
  }, [message.action]);

  // Debounced validation function
  const debouncedValidateMessage = useMemo(
    () => debounce(async (messageToValidate: InteractiveMessage) => {
      if (!finalConfig.enableRealTimeValidation) return;
      
      setValidationState(prev => ({ ...prev, isValidating: true }));
      
      try {
        const result = InteractiveMessageValidator.validateMessage(messageToValidate, finalConfig.context);
        const reactionResult = InteractiveMessageValidator.validateButtonReactions(reactions, buttons);
        
        // Combine message and reaction validation results
        const combinedResult: ValidationResult = {
          isValid: result.isValid && reactionResult.isValid,
          errors: [...result.errors, ...reactionResult.errors],
          warnings: [...result.warnings, ...reactionResult.warnings]
        };
        
        setValidationState(prev => ({
          ...prev,
          isValidating: false,
          lastValidated: new Date(),
          messageValidation: combinedResult,
          hasErrors: combinedResult.errors.length > 0,
          hasWarnings: combinedResult.warnings.length > 0,
          isDirty: true
        }));
      } catch (error) {
        const structuredError = errorHandler.handleError(error, {
          component: 'useInteractiveMessageValidation',
          action: 'validateMessage'
        });
        
        setValidationState(prev => ({
          ...prev,
          isValidating: false,
          hasErrors: true
        }));
        
        console.error('Validation error:', structuredError);
      }
    }, finalConfig.debounceMs),
    [finalConfig.enableRealTimeValidation, finalConfig.debounceMs, finalConfig.context, reactions, buttons]
  );

  // Main validation function
  const validateMessage = useCallback(async (messageToValidate: InteractiveMessage): Promise<ValidationResult> => {
    setValidationState(prev => ({ ...prev, isValidating: true }));
    
    try {
      const result = InteractiveMessageValidator.validateMessage(messageToValidate, finalConfig.context);
      const reactionResult = InteractiveMessageValidator.validateButtonReactions(reactions, buttons);
      
      // Combine results
      const combinedResult: ValidationResult = {
        isValid: result.isValid && reactionResult.isValid,
        errors: [...result.errors, ...reactionResult.errors],
        warnings: [...result.warnings, ...reactionResult.warnings]
      };
      
      setValidationState(prev => ({
        ...prev,
        isValidating: false,
        lastValidated: new Date(),
        messageValidation: combinedResult,
        hasErrors: combinedResult.errors.length > 0,
        hasWarnings: combinedResult.warnings.length > 0,
        isDirty: true
      }));
      
      return combinedResult;
    } catch (error) {
      const structuredError = errorHandler.handleError(error, {
        component: 'useInteractiveMessageValidation',
        action: 'validateMessage'
      });
      
      setValidationState(prev => ({
        ...prev,
        isValidating: false,
        hasErrors: true
      }));
      
      throw structuredError;
    }
  }, [finalConfig.context, reactions, buttons]);

  // Field validation function
  const validateField = useCallback((fieldName: string, value: any, messageToValidate: InteractiveMessage): FieldValidationResult => {
    try {
      const result = InteractiveMessageValidator.validateField(fieldName, value, messageToValidate, finalConfig.context);
      
      setValidationState(prev => ({
        ...prev,
        fieldValidations: {
          ...prev.fieldValidations,
          [fieldName]: result
        },
        isDirty: true
      }));
      
      return result;
    } catch (error) {
      const structuredError = errorHandler.handleError(error, {
        component: 'useInteractiveMessageValidation',
        action: 'validateField',
        messageId: messageToValidate.id
      });
      
      const errorResult: FieldValidationResult = {
        field: fieldName,
        isValid: false,
        errors: [{
          field: fieldName,
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          severity: 'error'
        }],
        warnings: []
      };
      
      setValidationState(prev => ({
        ...prev,
        fieldValidations: {
          ...prev.fieldValidations,
          [fieldName]: errorResult
        },
        hasErrors: true,
        isDirty: true
      }));
      
      return errorResult;
    }
  }, [finalConfig.context]);

  // Button reactions validation
  const validateButtonReactions = useCallback((reactionsToValidate: ButtonReaction[], buttonsToValidate: QuickReplyButton[]): ValidationResult => {
    try {
      return InteractiveMessageValidator.validateButtonReactions(reactionsToValidate, buttonsToValidate);
    } catch (error) {
      const structuredError = errorHandler.handleError(error, {
        component: 'useInteractiveMessageValidation',
        action: 'validateButtonReactions'
      });
      
      throw structuredError;
    }
  }, []);

  // Clear validation state
  const clearValidation = useCallback(() => {
    setValidationState({
      isValidating: false,
      lastValidated: null,
      messageValidation: null,
      fieldValidations: {},
      isDirty: false,
      hasErrors: false,
      hasWarnings: false
    });
  }, []);

  // Utility functions
  const isFieldValid = useCallback((fieldName: string): boolean => {
    const fieldValidation = validationState.fieldValidations[fieldName];
    if (!fieldValidation) return true;
    return fieldValidation.isValid;
  }, [validationState.fieldValidations]);

  const getFieldErrors = useCallback((fieldName: string): ValidationError[] => {
    const fieldValidation = validationState.fieldValidations[fieldName];
    if (!fieldValidation) return [];
    return fieldValidation.errors;
  }, [validationState.fieldValidations]);

  const getFieldWarnings = useCallback((fieldName: string): ValidationError[] => {
    const fieldValidation = validationState.fieldValidations[fieldName];
    if (!fieldValidation) return [];
    return fieldValidation.warnings;
  }, [validationState.fieldValidations]);

  const canProceed = useCallback((): boolean => {
    // Check if there are any validation errors
    if (validationState.hasErrors) return false;
    
    // Check field validations
    const hasFieldErrors = Object.values(validationState.fieldValidations).some(
      validation => !validation.isValid
    );
    
    return !hasFieldErrors;
  }, [validationState.hasErrors, validationState.fieldValidations]);

  const handleValidationError = useCallback((error: any): StructuredError => {
    return errorHandler.handleValidationError(error, {
      component: 'useInteractiveMessageValidation',
      messageId: message.id
    });
  }, [message.id]);

  // Effect for real-time validation
  useEffect(() => {
    if (finalConfig.enableRealTimeValidation && validationState.isDirty) {
      debouncedValidateMessage(message);
    }
    
    return () => {
      debouncedValidateMessage.cancel();
    };
  }, [message, debouncedValidateMessage, finalConfig.enableRealTimeValidation, validationState.isDirty]);

  // Effect for validation on mount
  useEffect(() => {
    if (finalConfig.validateOnMount) {
      validateMessage(message);
    }
  }, [finalConfig.validateOnMount]); // Only run on mount

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      debouncedValidateMessage.cancel();
    };
  }, [debouncedValidateMessage]);

  return {
    validationState,
    validateMessage,
    validateField,
    validateButtonReactions,
    clearValidation,
    isFieldValid,
    getFieldErrors,
    getFieldWarnings,
    canProceed,
    handleValidationError
  };
};

export default useInteractiveMessageValidation;