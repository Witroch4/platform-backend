// Tests for useInteractiveMessageValidation Hook
// Comprehensive test coverage for the validation hook functionality

import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { useInteractiveMessageValidation } from '../useInteractiveMessageValidation';
import type { 
  InteractiveMessage, 
  ButtonReaction
} from '@/types/interactive-messages';

// Mock dependencies
jest.mock('lodash', () => ({
  debounce: jest.fn((fn) => {
    const debouncedFn = (...args: any[]) => fn(...args);
    debouncedFn.cancel = jest.fn();
    return debouncedFn;
  })
}));

jest.mock('@/lib/validation/interactive-message-validation', () => ({
  InteractiveMessageValidator: {
    validateMessage: jest.fn(),
    validateField: jest.fn(),
    validateButtonReactions: jest.fn()
  }
}));

jest.mock('@/lib/error-handling/interactive-message-errors', () => ({
  errorHandler: {
    handleError: jest.fn(),
    handleValidationError: jest.fn()
  }
}));

import { InteractiveMessageValidator } from '@/lib/validation/interactive-message-validation';
import { errorHandler } from '@/lib/error-handling/interactive-message-errors';

describe('useInteractiveMessageValidation', () => {
  let validMessage: InteractiveMessage;
  let validReactions: ButtonReaction[];

  beforeEach(() => {
    validMessage = {
      name: 'Test Message',
      type: 'button',
      body: { text: 'Hello, this is a test message!' },
      header: {
        type: 'text',
        content: 'Welcome'
      },
      footer: { text: 'Thank you' },
      action: {
        type: 'button',
        buttons: [
          { id: 'btn1', title: 'Option 1' },
          { id: 'btn2', title: 'Option 2' }
        ]
      },
      isActive: true
    };

    validReactions = [
      {
        id: 'reaction1',
        buttonId: 'btn1',
        messageId: 'msg1',
        type: 'emoji',
        emoji: '👍',
        isActive: true
      }
    ];

    // Reset mocks
    jest.clearAllMocks();
    
    // Setup default mock implementations
    (InteractiveMessageValidator.validateMessage as jest.Mock).mockReturnValue({
      isValid: true,
      errors: [],
      warnings: []
    });

    (InteractiveMessageValidator.validateField as jest.Mock).mockReturnValue({
      field: 'test',
      isValid: true,
      errors: [],
      warnings: []
    });

    (InteractiveMessageValidator.validateButtonReactions as jest.Mock).mockReturnValue({
      isValid: true,
      errors: [],
      warnings: []
    });
  });

  describe('Hook initialization', () => {
    it('should initialize with default state', () => {
      const { result } = renderHook(() => 
        useInteractiveMessageValidation(validMessage, validReactions)
      );

      expect(result.current.validationState.isValidating).toBe(false);
      expect(result.current.validationState.lastValidated).toBeNull();
      expect(result.current.validationState.messageValidation).toBeNull();
      expect(result.current.validationState.fieldValidations).toEqual({});
      expect(result.current.validationState.isDirty).toBe(false);
      expect(result.current.validationState.hasErrors).toBe(false);
      expect(result.current.validationState.hasWarnings).toBe(false);
    });

    it('should initialize with custom configuration', () => {
      const config = {
        enableRealTimeValidation: false,
        debounceMs: 500,
        validateOnMount: true
      };

      const { result } = renderHook(() => 
        useInteractiveMessageValidation(validMessage, validReactions, config)
      );

      // Should not trigger real-time validation due to config
      expect(result.current.validationState.isValidating).toBe(false);
    });
  });

  describe('validateMessage', () => {
    it('should validate message successfully', async () => {
      const { result } = renderHook(() => 
        useInteractiveMessageValidation(validMessage, validReactions)
      );

      let validationResult;
      await act(async () => {
        validationResult = await result.current.validateMessage(validMessage);
      });

      expect(validationResult.isValid).toBe(true);
      expect(validationResult.errors).toHaveLength(0);
      expect(validationResult.warnings).toHaveLength(0);
      expect(result.current.validationState.messageValidation).toBeDefined();
      expect(result.current.validationState.lastValidated).toBeInstanceOf(Date);
      expect(result.current.validationState.isDirty).toBe(true);
    });

    it('should handle validation errors', async () => {
      const validationErrors = [
        {
          field: 'name',
          code: 'REQUIRED_FIELD',
          message: 'Name is required',
          severity: 'error' as const
        }
      ];

      (InteractiveMessageValidator.validateMessage as jest.Mock).mockReturnValue({
        isValid: false,
        errors: validationErrors,
        warnings: []
      });

      const { result } = renderHook(() => 
        useInteractiveMessageValidation(validMessage, validReactions)
      );

      let validationResult;
      await act(async () => {
        validationResult = await result.current.validateMessage(validMessage);
      });

      expect(validationResult.isValid).toBe(false);
      expect(validationResult.errors).toEqual(validationErrors);
      expect(result.current.validationState.hasErrors).toBe(true);
    });

    it('should combine message and reaction validation results', async () => {
      const messageErrors = [
        {
          field: 'name',
          code: 'REQUIRED_FIELD',
          message: 'Name is required',
          severity: 'error' as const
        }
      ];

      const reactionErrors = [
        {
          field: 'reactions',
          code: 'INVALID_BUTTON_REFERENCE',
          message: 'Invalid button reference',
          severity: 'error' as const
        }
      ];

      (InteractiveMessageValidator.validateMessage as jest.Mock).mockReturnValue({
        isValid: false,
        errors: messageErrors,
        warnings: []
      });

      (InteractiveMessageValidator.validateButtonReactions as jest.Mock).mockReturnValue({
        isValid: false,
        errors: reactionErrors,
        warnings: []
      });

      const { result } = renderHook(() => 
        useInteractiveMessageValidation(validMessage, validReactions)
      );

      let validationResult;
      await act(async () => {
        validationResult = await result.current.validateMessage(validMessage);
      });

      expect(validationResult.isValid).toBe(false);
      expect(validationResult.errors).toHaveLength(2);
      expect(validationResult.errors).toEqual([...messageErrors, ...reactionErrors]);
    });

    it('should handle validation exceptions', async () => {
      const validationError = new Error('Validation failed');
      (InteractiveMessageValidator.validateMessage as jest.Mock).mockImplementation(() => {
        throw validationError;
      });

      (errorHandler.handleError as jest.Mock).mockReturnValue({
        id: 'error1',
        message: 'Validation failed'
      });

      const { result } = renderHook(() => 
        useInteractiveMessageValidation(validMessage, validReactions)
      );

      await act(async () => {
        await expect(result.current.validateMessage(validMessage)).rejects.toThrow();
      });

      expect(errorHandler.handleError).toHaveBeenCalledWith(
        validationError,
        expect.objectContaining({
          component: 'useInteractiveMessageValidation',
          action: 'validateMessage'
        })
      );
      expect(result.current.validationState.hasErrors).toBe(true);
    });
  });

  describe('validateField', () => {
    it('should validate individual fields', () => {
      const fieldValidation = {
        field: 'name',
        isValid: true,
        errors: [],
        warnings: []
      };

      (InteractiveMessageValidator.validateField as jest.Mock).mockReturnValue(fieldValidation);

      const { result } = renderHook(() => 
        useInteractiveMessageValidation(validMessage, validReactions)
      );

      let validationResult;
      act(() => {
        validationResult = result.current.validateField('name', 'Test Name', validMessage);
      });

      expect(validationResult).toEqual(fieldValidation);
      expect(result.current.validationState.fieldValidations.name).toEqual(fieldValidation);
      expect(result.current.validationState.isDirty).toBe(true);
    });

    it('should handle field validation errors', () => {
      const fieldErrors = [
        {
          field: 'name',
          code: 'REQUIRED_FIELD',
          message: 'Name is required',
          severity: 'error' as const
        }
      ];

      const fieldValidation = {
        field: 'name',
        isValid: false,
        errors: fieldErrors,
        warnings: []
      };

      (InteractiveMessageValidator.validateField as jest.Mock).mockReturnValue(fieldValidation);

      const { result } = renderHook(() => 
        useInteractiveMessageValidation(validMessage, validReactions)
      );

      let validationResult;
      act(() => {
        validationResult = result.current.validateField('name', '', validMessage);
      });

      expect(validationResult.isValid).toBe(false);
      expect(validationResult.errors).toEqual(fieldErrors);
      expect(result.current.validationState.fieldValidations.name).toEqual(fieldValidation);
    });

    it('should handle field validation exceptions', () => {
      const validationError = new Error('Field validation failed');
      (InteractiveMessageValidator.validateField as jest.Mock).mockImplementation(() => {
        throw validationError;
      });

      (errorHandler.handleError as jest.Mock).mockReturnValue({
        id: 'error1',
        message: 'Field validation failed'
      });

      const { result } = renderHook(() => 
        useInteractiveMessageValidation(validMessage, validReactions)
      );

      let validationResult;
      act(() => {
        validationResult = result.current.validateField('name', 'Test', validMessage);
      });

      expect(validationResult.isValid).toBe(false);
      expect(validationResult.errors).toHaveLength(1);
      expect(validationResult.errors[0].code).toBe('VALIDATION_ERROR');
      expect(result.current.validationState.hasErrors).toBe(true);
    });
  });

  describe('validateButtonReactions', () => {
    it('should validate button reactions successfully', () => {
      const buttons = [
        { id: 'btn1', title: 'Option 1' },
        { id: 'btn2', title: 'Option 2' }
      ];

      const { result } = renderHook(() => 
        useInteractiveMessageValidation(validMessage, validReactions)
      );

      let validationResult;
      act(() => {
        validationResult = result.current.validateButtonReactions(validReactions, buttons);
      });

      expect(validationResult.isValid).toBe(true);
      expect(InteractiveMessageValidator.validateButtonReactions).toHaveBeenCalledWith(
        validReactions,
        buttons
      );
    });

    it('should handle button reaction validation errors', () => {
      const reactionErrors = [
        {
          field: 'reactions',
          code: 'INVALID_BUTTON_REFERENCE',
          message: 'Invalid button reference',
          severity: 'error' as const
        }
      ];

      (InteractiveMessageValidator.validateButtonReactions as jest.Mock).mockReturnValue({
        isValid: false,
        errors: reactionErrors,
        warnings: []
      });

      const buttons = [{ id: 'btn1', title: 'Option 1' }];

      const { result } = renderHook(() => 
        useInteractiveMessageValidation(validMessage, validReactions)
      );

      let validationResult;
      act(() => {
        validationResult = result.current.validateButtonReactions(validReactions, buttons);
      });

      expect(validationResult.isValid).toBe(false);
      expect(validationResult.errors).toEqual(reactionErrors);
    });
  });

  describe('Utility functions', () => {
    it('should check if field is valid', () => {
      const fieldValidation = {
        field: 'name',
        isValid: false,
        errors: [
          {
            field: 'name',
            code: 'REQUIRED_FIELD',
            message: 'Name is required',
            severity: 'error' as const
          }
        ],
        warnings: []
      };

      (InteractiveMessageValidator.validateField as jest.Mock).mockReturnValue(fieldValidation);

      const { result } = renderHook(() => 
        useInteractiveMessageValidation(validMessage, validReactions)
      );

      // First validate the field to populate the state
      act(() => {
        result.current.validateField('name', '', validMessage);
      });

      // Then check if it's valid
      expect(result.current.isFieldValid('name')).toBe(false);
      expect(result.current.isFieldValid('nonexistent')).toBe(true); // Non-existent fields are considered valid
    });

    it('should get field errors', () => {
      const fieldErrors = [
        {
          field: 'name',
          code: 'REQUIRED_FIELD',
          message: 'Name is required',
          severity: 'error' as const
        }
      ];

      const fieldValidation = {
        field: 'name',
        isValid: false,
        errors: fieldErrors,
        warnings: []
      };

      (InteractiveMessageValidator.validateField as jest.Mock).mockReturnValue(fieldValidation);

      const { result } = renderHook(() => 
        useInteractiveMessageValidation(validMessage, validReactions)
      );

      // First validate the field to populate the state
      act(() => {
        result.current.validateField('name', '', validMessage);
      });

      // Then get field errors
      expect(result.current.getFieldErrors('name')).toEqual(fieldErrors);
      expect(result.current.getFieldErrors('nonexistent')).toEqual([]);
    });

    it('should get field warnings', () => {
      const fieldWarnings = [
        {
          field: 'name',
          code: 'LENGTH_WARNING',
          message: 'Name is getting long',
          severity: 'warning' as const
        }
      ];

      const fieldValidation = {
        field: 'name',
        isValid: true,
        errors: [],
        warnings: fieldWarnings
      };

      (InteractiveMessageValidator.validateField as jest.Mock).mockReturnValue(fieldValidation);

      const { result } = renderHook(() => 
        useInteractiveMessageValidation(validMessage, validReactions)
      );

      // First validate the field to populate the state
      act(() => {
        result.current.validateField('name', 'Very long name', validMessage);
      });

      // Then get field warnings
      expect(result.current.getFieldWarnings('name')).toEqual(fieldWarnings);
      expect(result.current.getFieldWarnings('nonexistent')).toEqual([]);
    });

    it('should determine if can proceed', () => {
      const { result } = renderHook(() => 
        useInteractiveMessageValidation(validMessage, validReactions)
      );

      // Initially should be able to proceed (no errors)
      expect(result.current.canProceed()).toBe(true);

      // Add field validation error
      const fieldValidation = {
        field: 'name',
        isValid: false,
        errors: [
          {
            field: 'name',
            code: 'REQUIRED_FIELD',
            message: 'Name is required',
            severity: 'error' as const
          }
        ],
        warnings: []
      };

      (InteractiveMessageValidator.validateField as jest.Mock).mockReturnValue(fieldValidation);

      act(() => {
        result.current.validateField('name', '', validMessage);
      });

      // Now should not be able to proceed
      expect(result.current.canProceed()).toBe(false);
    });

    it('should clear validation state', () => {
      const { result } = renderHook(() => 
        useInteractiveMessageValidation(validMessage, validReactions)
      );

      // First add some validation state
      act(() => {
        result.current.validateField('name', 'Test', validMessage);
      });

      expect(result.current.validationState.isDirty).toBe(true);

      // Then clear it
      act(() => {
        result.current.clearValidation();
      });

      expect(result.current.validationState.isValidating).toBe(false);
      expect(result.current.validationState.lastValidated).toBeNull();
      expect(result.current.validationState.messageValidation).toBeNull();
      expect(result.current.validationState.fieldValidations).toEqual({});
      expect(result.current.validationState.isDirty).toBe(false);
      expect(result.current.validationState.hasErrors).toBe(false);
      expect(result.current.validationState.hasWarnings).toBe(false);
    });

    it('should handle validation errors', () => {
      const validationError = new Error('Validation failed');
      (errorHandler.handleValidationError as jest.Mock).mockReturnValue({
        id: 'error1',
        message: 'Validation failed'
      });

      const { result } = renderHook(() => 
        useInteractiveMessageValidation(validMessage, validReactions)
      );

      const structuredError = result.current.handleValidationError(validationError);

      expect(errorHandler.handleValidationError).toHaveBeenCalledWith(
        validationError,
        expect.objectContaining({
          component: 'useInteractiveMessageValidation',
          messageId: validMessage.id
        })
      );
      expect(structuredError).toEqual({
        id: 'error1',
        message: 'Validation failed'
      });
    });
  });

  describe('Real-time validation', () => {
    it('should trigger debounced validation when message changes', () => {
      const { rerender } = renderHook(
        ({ message }) => useInteractiveMessageValidation(message, validReactions),
        { initialProps: { message: validMessage } }
      );

      // Change the message
      const updatedMessage = { ...validMessage, name: 'Updated Name' };
      rerender({ message: updatedMessage });

      // Debounced validation should be triggered (mocked to execute immediately)
      expect(InteractiveMessageValidator.validateMessage).toHaveBeenCalled();
    });

    it('should not trigger real-time validation when disabled', () => {
      const config = { enableRealTimeValidation: false };

      const { rerender } = renderHook(
        ({ message }) => useInteractiveMessageValidation(message, validReactions, config),
        { initialProps: { message: validMessage } }
      );

      // Change the message
      const updatedMessage = { ...validMessage, name: 'Updated Name' };
      rerender({ message: updatedMessage });

      // Real-time validation should not be triggered
      expect(InteractiveMessageValidator.validateMessage).not.toHaveBeenCalled();
    });
  });
});