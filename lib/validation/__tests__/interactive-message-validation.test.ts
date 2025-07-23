// Tests for Interactive Message Validation System
// Comprehensive test coverage for validation logic and error scenarios

import { describe, it, expect, beforeEach } from '@jest/globals';
import { 
  InteractiveMessageValidator,
  InteractiveMessageValidationError,
  formatValidationErrors,
  groupErrorsByField,
  hasFieldError,
  getFieldErrors
} from '../interactive-message-validation';
import type { 
  InteractiveMessage, 
  ButtonReaction,
  QuickReplyButton
} from '@/types/interactive-messages';

describe('InteractiveMessageValidator', () => {
  let validMessage: InteractiveMessage;
  let validButtons: QuickReplyButton[];
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

    validButtons = [
      { id: 'btn1', title: 'Option 1' },
      { id: 'btn2', title: 'Option 2' }
    ];

    validReactions = [
      {
        id: 'reaction1',
        buttonId: 'btn1',
        messageId: 'msg1',
        type: 'emoji',
        emoji: '👍',
        isActive: true
      },
      {
        id: 'reaction2',
        buttonId: 'btn2',
        messageId: 'msg1',
        type: 'text',
        textResponse: 'Thank you for your selection!',
        isActive: true
      }
    ];
  });

  describe('validateMessage', () => {
    it('should validate a correct message successfully', () => {
      const result = InteractiveMessageValidator.validateMessage(validMessage);
      
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });

    it('should fail validation for missing required fields', () => {
      const invalidMessage = { ...validMessage, name: '', body: { text: '' } };
      
      const result = InteractiveMessageValidator.validateMessage(invalidMessage);
      
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some(e => e.field === 'name')).toBe(true);
      expect(result.errors.some(e => e.field === 'body.text')).toBe(true);
    });

    it('should fail validation for text length limits', () => {
      const longText = 'a'.repeat(1025); // Exceeds 1024 character limit
      const invalidMessage = { 
        ...validMessage, 
        body: { text: longText },
        header: { type: 'text' as const, content: 'a'.repeat(61) } // Exceeds 60 character limit
      };
      
      const result = InteractiveMessageValidator.validateMessage(invalidMessage);
      
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.field === 'body.text' && e.code === 'INVALID_LENGTH')).toBe(true);
      expect(result.errors.some(e => e.field === 'header.content' && e.code === 'INVALID_LENGTH')).toBe(true);
    });

    it('should validate button message type with proper action', () => {
      const buttonMessage = {
        ...validMessage,
        type: 'button' as const,
        action: {
          type: 'button' as const,
          buttons: [{ id: 'btn1', title: 'Test Button' }]
        }
      };
      
      const result = InteractiveMessageValidator.validateMessage(buttonMessage);
      
      expect(result.isValid).toBe(true);
    });

    it('should fail validation for button message without button action', () => {
      const invalidButtonMessage = {
        ...validMessage,
        type: 'button' as const,
        action: undefined
      };
      
      const result = InteractiveMessageValidator.validateMessage(invalidButtonMessage);
      
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.code === 'MISSING_REQUIRED_ACTION')).toBe(true);
    });

    it('should generate warnings for long content approaching limits', () => {
      const warningMessage = {
        ...validMessage,
        name: 'a'.repeat(201), // Triggers warning at 200+ characters
        body: { text: 'a'.repeat(950) } // Triggers warning at 90% of 1024
      };
      
      const result = InteractiveMessageValidator.validateMessage(warningMessage);
      
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings.some(w => w.field === 'name' && w.code === 'LENGTH_WARNING')).toBe(true);
      expect(result.warnings.some(w => w.field === 'body.text' && w.code === 'LENGTH_WARNING')).toBe(true);
    });
  });

  describe('validateField', () => {
    it('should validate individual fields correctly', () => {
      const nameResult = InteractiveMessageValidator.validateField('name', 'Valid Name', validMessage);
      expect(nameResult.isValid).toBe(true);
      expect(nameResult.field).toBe('name');

      const bodyResult = InteractiveMessageValidator.validateField('body.text', 'Valid body text', validMessage);
      expect(bodyResult.isValid).toBe(true);
      expect(bodyResult.field).toBe('body.text');
    });

    it('should fail validation for invalid field values', () => {
      const emptyNameResult = InteractiveMessageValidator.validateField('name', '', validMessage);
      expect(emptyNameResult.isValid).toBe(false);
      expect(emptyNameResult.errors.some(e => e.code === 'REQUIRED_FIELD')).toBe(true);

      const longNameResult = InteractiveMessageValidator.validateField('name', 'a'.repeat(256), validMessage);
      expect(longNameResult.isValid).toBe(false);
      expect(longNameResult.errors.some(e => e.code === 'INVALID_LENGTH')).toBe(true);
    });

    it('should validate header content based on header type', () => {
      const textHeaderMessage = { ...validMessage, header: { type: 'text' as const, content: '' } };
      
      const validTextResult = InteractiveMessageValidator.validateField(
        'header.content', 
        'Valid header', 
        textHeaderMessage
      );
      expect(validTextResult.isValid).toBe(true);

      const longTextResult = InteractiveMessageValidator.validateField(
        'header.content', 
        'a'.repeat(61), 
        textHeaderMessage
      );
      expect(longTextResult.isValid).toBe(false);
    });

    it('should validate URL format for media headers', () => {
      const mediaHeaderMessage = { ...validMessage, header: { type: 'image' as const, content: '' } };
      
      const validUrlResult = InteractiveMessageValidator.validateField(
        'header.content', 
        'https://example.com/image.jpg', 
        mediaHeaderMessage
      );
      expect(validUrlResult.isValid).toBe(true);

      const invalidUrlResult = InteractiveMessageValidator.validateField(
        'header.content', 
        'not-a-valid-url', 
        mediaHeaderMessage
      );
      expect(invalidUrlResult.isValid).toBe(false);
      expect(invalidUrlResult.errors.some(e => e.code === 'INVALID_FORMAT')).toBe(true);
    });
  });

  describe('validateButtonReactions', () => {
    it('should validate correct button reactions', () => {
      const result = InteractiveMessageValidator.validateButtonReactions(validReactions, validButtons);
      
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail validation for reactions referencing non-existent buttons', () => {
      const invalidReactions = [
        ...validReactions,
        {
          id: 'reaction3',
          buttonId: 'non-existent-button',
          messageId: 'msg1',
          type: 'emoji' as const,
          emoji: '👎',
          isActive: true
        }
      ];
      
      const result = InteractiveMessageValidator.validateButtonReactions(invalidReactions, validButtons);
      
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.code === 'INVALID_BUTTON_REFERENCE')).toBe(true);
    });

    it('should fail validation for duplicate button reactions', () => {
      const duplicateReactions = [
        ...validReactions,
        {
          id: 'reaction3',
          buttonId: 'btn1', // Duplicate button ID
          messageId: 'msg1',
          type: 'text' as const,
          textResponse: 'Another reaction',
          isActive: true
        }
      ];
      
      const result = InteractiveMessageValidator.validateButtonReactions(duplicateReactions, validButtons);
      
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.code === 'DUPLICATE_BUTTON_REACTIONS')).toBe(true);
    });

    it('should validate emoji reactions with proper emoji format', () => {
      const emojiReaction: ButtonReaction = {
        id: 'reaction1',
        buttonId: 'btn1',
        messageId: 'msg1',
        type: 'emoji',
        emoji: '👍',
        isActive: true
      };
      
      const result = InteractiveMessageValidator.validateButtonReactions([emojiReaction], validButtons);
      expect(result.isValid).toBe(true);
    });

    it('should validate text reactions with proper text content', () => {
      const textReaction: ButtonReaction = {
        id: 'reaction1',
        buttonId: 'btn1',
        messageId: 'msg1',
        type: 'text',
        textResponse: 'Thank you for your selection!',
        isActive: true
      };
      
      const result = InteractiveMessageValidator.validateButtonReactions([textReaction], validButtons);
      expect(result.isValid).toBe(true);
    });
  });

  describe('Button validation', () => {
    it('should validate correct button configurations', () => {
      const buttons: QuickReplyButton[] = [
        { id: 'btn1', title: 'Option 1' },
        { id: 'btn2', title: 'Option 2' },
        { id: 'btn3', title: 'Option 3' }
      ];
      
      const message = {
        ...validMessage,
        action: { type: 'button' as const, buttons }
      };
      
      const result = InteractiveMessageValidator.validateMessage(message);
      expect(result.isValid).toBe(true);
    });

    it('should fail validation for too many buttons', () => {
      const tooManyButtons: QuickReplyButton[] = [
        { id: 'btn1', title: 'Option 1' },
        { id: 'btn2', title: 'Option 2' },
        { id: 'btn3', title: 'Option 3' },
        { id: 'btn4', title: 'Option 4' } // Exceeds limit of 3
      ];
      
      const message = {
        ...validMessage,
        action: { type: 'button' as const, buttons: tooManyButtons }
      };
      
      const result = InteractiveMessageValidator.validateMessage(message);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.code === 'INVALID_COUNT')).toBe(true);
    });

    it('should fail validation for duplicate button IDs', () => {
      const duplicateIdButtons: QuickReplyButton[] = [
        { id: 'btn1', title: 'Option 1' },
        { id: 'btn1', title: 'Option 2' } // Duplicate ID
      ];
      
      const message = {
        ...validMessage,
        action: { type: 'button' as const, buttons: duplicateIdButtons }
      };
      
      const result = InteractiveMessageValidator.validateMessage(message);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.code === 'DUPLICATE_VALUE')).toBe(true);
    });

    it('should fail validation for duplicate button titles', () => {
      const duplicateTitleButtons: QuickReplyButton[] = [
        { id: 'btn1', title: 'Same Title' },
        { id: 'btn2', title: 'Same Title' } // Duplicate title
      ];
      
      const message = {
        ...validMessage,
        action: { type: 'button' as const, buttons: duplicateTitleButtons }
      };
      
      const result = InteractiveMessageValidator.validateMessage(message);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.code === 'DUPLICATE_VALUE')).toBe(true);
    });

    it('should fail validation for button titles that are too long', () => {
      const longTitleButtons: QuickReplyButton[] = [
        { id: 'btn1', title: 'a'.repeat(21) } // Exceeds 20 character limit
      ];
      
      const message = {
        ...validMessage,
        action: { type: 'button' as const, buttons: longTitleButtons }
      };
      
      const result = InteractiveMessageValidator.validateMessage(message);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.code === 'INVALID_LENGTH')).toBe(true);
    });
  });

  describe('Error handling and formatting', () => {
    it('should format validation errors correctly', () => {
      const invalidMessage = { ...validMessage, name: '', body: { text: '' } };
      const result = InteractiveMessageValidator.validateMessage(invalidMessage);
      
      const formattedErrors = formatValidationErrors(result.errors);
      expect(formattedErrors).toContain('name:');
      expect(formattedErrors).toContain('body.text:');
    });

    it('should group errors by field correctly', () => {
      const invalidMessage = { ...validMessage, name: '', body: { text: '' } };
      const result = InteractiveMessageValidator.validateMessage(invalidMessage);
      
      const groupedErrors = groupErrorsByField(result.errors);
      expect(groupedErrors).toHaveProperty('name');
      expect(groupedErrors).toHaveProperty('body.text');
      expect(Array.isArray(groupedErrors.name)).toBe(true);
      expect(Array.isArray(groupedErrors['body.text'])).toBe(true);
    });

    it('should check for field errors correctly', () => {
      const invalidMessage = { ...validMessage, name: '' };
      const result = InteractiveMessageValidator.validateMessage(invalidMessage);
      
      expect(hasFieldError(result.errors, 'name')).toBe(true);
      expect(hasFieldError(result.errors, 'body.text')).toBe(false);
    });

    it('should get field errors correctly', () => {
      const invalidMessage = { ...validMessage, name: '' };
      const result = InteractiveMessageValidator.validateMessage(invalidMessage);
      
      const nameErrors = getFieldErrors(result.errors, 'name');
      expect(nameErrors.length).toBeGreaterThan(0);
      expect(nameErrors[0].field).toBe('name');
      
      const bodyErrors = getFieldErrors(result.errors, 'body.text');
      expect(bodyErrors).toHaveLength(0);
    });
  });

  describe('InteractiveMessageValidationError', () => {
    it('should create validation error with proper structure', () => {
      const errors = [
        {
          field: 'name',
          code: 'REQUIRED_FIELD',
          message: 'Name is required',
          severity: 'error' as const
        }
      ];
      
      const validationError = new InteractiveMessageValidationError(errors);
      
      expect(validationError.name).toBe('InteractiveMessageValidationError');
      expect(validationError.errors).toEqual(errors);
      expect(validationError.message).toContain('Validation failed');
    });
  });

  describe('Context-aware validation', () => {
    it('should warn about duplicate message names in context', () => {
      const context = {
        messageType: 'button' as const,
        isEditing: false,
        existingMessages: [
          { ...validMessage, id: 'existing1', name: 'Test Message' }
        ]
      };
      
      const result = InteractiveMessageValidator.validateMessage(validMessage, context);
      
      expect(result.warnings.some(w => w.code === 'DUPLICATE_NAME')).toBe(true);
    });

    it('should not warn about duplicate names when editing the same message', () => {
      const context = {
        messageType: 'button' as const,
        isEditing: true,
        existingMessages: [
          { ...validMessage, id: 'msg1', name: 'Test Message' }
        ]
      };
      
      const messageBeingEdited = { ...validMessage, id: 'msg1' };
      const result = InteractiveMessageValidator.validateMessage(messageBeingEdited, context);
      
      expect(result.warnings.some(w => w.code === 'DUPLICATE_NAME')).toBe(false);
    });
  });
});