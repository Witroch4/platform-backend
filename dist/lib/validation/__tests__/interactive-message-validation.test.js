"use strict";
// Tests for Interactive Message Validation System
// Comprehensive test coverage for validation logic and error scenarios
Object.defineProperty(exports, "__esModule", { value: true });
const globals_1 = require("@jest/globals");
const interactive_message_validation_1 = require("../interactive-message-validation");
(0, globals_1.describe)('InteractiveMessageValidator', () => {
    let validMessage;
    let validButtons;
    let validReactions;
    (0, globals_1.beforeEach)(() => {
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
    (0, globals_1.describe)('validateMessage', () => {
        (0, globals_1.it)('should validate a correct message successfully', () => {
            const result = interactive_message_validation_1.InteractiveMessageValidator.validateMessage(validMessage);
            (0, globals_1.expect)(result.isValid).toBe(true);
            (0, globals_1.expect)(result.errors).toHaveLength(0);
            (0, globals_1.expect)(result.warnings).toHaveLength(0);
        });
        (0, globals_1.it)('should fail validation for missing required fields', () => {
            const invalidMessage = { ...validMessage, name: '', body: { text: '' } };
            const result = interactive_message_validation_1.InteractiveMessageValidator.validateMessage(invalidMessage);
            (0, globals_1.expect)(result.isValid).toBe(false);
            (0, globals_1.expect)(result.errors.length).toBeGreaterThan(0);
            (0, globals_1.expect)(result.errors.some(e => e.field === 'name')).toBe(true);
            (0, globals_1.expect)(result.errors.some(e => e.field === 'body.text')).toBe(true);
        });
        (0, globals_1.it)('should fail validation for text length limits', () => {
            const longText = 'a'.repeat(1025); // Exceeds 1024 character limit
            const invalidMessage = {
                ...validMessage,
                body: { text: longText },
                header: { type: 'text', content: 'a'.repeat(61) } // Exceeds 60 character limit
            };
            const result = interactive_message_validation_1.InteractiveMessageValidator.validateMessage(invalidMessage);
            (0, globals_1.expect)(result.isValid).toBe(false);
            (0, globals_1.expect)(result.errors.some(e => e.field === 'body.text' && e.code === 'INVALID_LENGTH')).toBe(true);
            (0, globals_1.expect)(result.errors.some(e => e.field === 'header.content' && e.code === 'INVALID_LENGTH')).toBe(true);
        });
        (0, globals_1.it)('should validate button message type with proper action', () => {
            const buttonMessage = {
                ...validMessage,
                type: 'button',
                action: {
                    type: 'button',
                    buttons: [{ id: 'btn1', title: 'Test Button' }]
                }
            };
            const result = interactive_message_validation_1.InteractiveMessageValidator.validateMessage(buttonMessage);
            (0, globals_1.expect)(result.isValid).toBe(true);
        });
        (0, globals_1.it)('should fail validation for button message without button action', () => {
            const invalidButtonMessage = {
                ...validMessage,
                type: 'button',
                action: undefined
            };
            const result = interactive_message_validation_1.InteractiveMessageValidator.validateMessage(invalidButtonMessage);
            (0, globals_1.expect)(result.isValid).toBe(false);
            (0, globals_1.expect)(result.errors.some(e => e.code === 'MISSING_REQUIRED_ACTION')).toBe(true);
        });
        (0, globals_1.it)('should generate warnings for long content approaching limits', () => {
            const warningMessage = {
                ...validMessage,
                name: 'a'.repeat(201), // Triggers warning at 200+ characters
                body: { text: 'a'.repeat(950) } // Triggers warning at 90% of 1024
            };
            const result = interactive_message_validation_1.InteractiveMessageValidator.validateMessage(warningMessage);
            (0, globals_1.expect)(result.warnings.length).toBeGreaterThan(0);
            (0, globals_1.expect)(result.warnings.some(w => w.field === 'name' && w.code === 'LENGTH_WARNING')).toBe(true);
            (0, globals_1.expect)(result.warnings.some(w => w.field === 'body.text' && w.code === 'LENGTH_WARNING')).toBe(true);
        });
    });
    (0, globals_1.describe)('validateField', () => {
        (0, globals_1.it)('should validate individual fields correctly', () => {
            const nameResult = interactive_message_validation_1.InteractiveMessageValidator.validateField('name', 'Valid Name', validMessage);
            (0, globals_1.expect)(nameResult.isValid).toBe(true);
            (0, globals_1.expect)(nameResult.field).toBe('name');
            const bodyResult = interactive_message_validation_1.InteractiveMessageValidator.validateField('body.text', 'Valid body text', validMessage);
            (0, globals_1.expect)(bodyResult.isValid).toBe(true);
            (0, globals_1.expect)(bodyResult.field).toBe('body.text');
        });
        (0, globals_1.it)('should fail validation for invalid field values', () => {
            const emptyNameResult = interactive_message_validation_1.InteractiveMessageValidator.validateField('name', '', validMessage);
            (0, globals_1.expect)(emptyNameResult.isValid).toBe(false);
            (0, globals_1.expect)(emptyNameResult.errors.some(e => e.code === 'REQUIRED_FIELD')).toBe(true);
            const longNameResult = interactive_message_validation_1.InteractiveMessageValidator.validateField('name', 'a'.repeat(256), validMessage);
            (0, globals_1.expect)(longNameResult.isValid).toBe(false);
            (0, globals_1.expect)(longNameResult.errors.some(e => e.code === 'INVALID_LENGTH')).toBe(true);
        });
        (0, globals_1.it)('should validate header content based on header type', () => {
            const textHeaderMessage = { ...validMessage, header: { type: 'text', content: '' } };
            const validTextResult = interactive_message_validation_1.InteractiveMessageValidator.validateField('header.content', 'Valid header', textHeaderMessage);
            (0, globals_1.expect)(validTextResult.isValid).toBe(true);
            const longTextResult = interactive_message_validation_1.InteractiveMessageValidator.validateField('header.content', 'a'.repeat(61), textHeaderMessage);
            (0, globals_1.expect)(longTextResult.isValid).toBe(false);
        });
        (0, globals_1.it)('should validate URL format for media headers', () => {
            const mediaHeaderMessage = { ...validMessage, header: { type: 'image', content: '' } };
            const validUrlResult = interactive_message_validation_1.InteractiveMessageValidator.validateField('header.content', 'https://example.com/image.jpg', mediaHeaderMessage);
            (0, globals_1.expect)(validUrlResult.isValid).toBe(true);
            const invalidUrlResult = interactive_message_validation_1.InteractiveMessageValidator.validateField('header.content', 'not-a-valid-url', mediaHeaderMessage);
            (0, globals_1.expect)(invalidUrlResult.isValid).toBe(false);
            (0, globals_1.expect)(invalidUrlResult.errors.some(e => e.code === 'INVALID_FORMAT')).toBe(true);
        });
    });
    (0, globals_1.describe)('validateButtonReactions', () => {
        (0, globals_1.it)('should validate correct button reactions', () => {
            const result = interactive_message_validation_1.InteractiveMessageValidator.validateButtonReactions(validReactions, validButtons);
            (0, globals_1.expect)(result.isValid).toBe(true);
            (0, globals_1.expect)(result.errors).toHaveLength(0);
        });
        (0, globals_1.it)('should fail validation for reactions referencing non-existent buttons', () => {
            const invalidReactions = [
                ...validReactions,
                {
                    id: 'reaction3',
                    buttonId: 'non-existent-button',
                    messageId: 'msg1',
                    type: 'emoji',
                    emoji: '👎',
                    isActive: true
                }
            ];
            const result = interactive_message_validation_1.InteractiveMessageValidator.validateButtonReactions(invalidReactions, validButtons);
            (0, globals_1.expect)(result.isValid).toBe(false);
            (0, globals_1.expect)(result.errors.some(e => e.code === 'INVALID_BUTTON_REFERENCE')).toBe(true);
        });
        (0, globals_1.it)('should fail validation for duplicate button reactions', () => {
            const duplicateReactions = [
                ...validReactions,
                {
                    id: 'reaction3',
                    buttonId: 'btn1', // Duplicate button ID
                    messageId: 'msg1',
                    type: 'text',
                    textResponse: 'Another reaction',
                    isActive: true
                }
            ];
            const result = interactive_message_validation_1.InteractiveMessageValidator.validateButtonReactions(duplicateReactions, validButtons);
            (0, globals_1.expect)(result.isValid).toBe(false);
            (0, globals_1.expect)(result.errors.some(e => e.code === 'DUPLICATE_BUTTON_REACTIONS')).toBe(true);
        });
        (0, globals_1.it)('should validate emoji reactions with proper emoji format', () => {
            const emojiReaction = {
                id: 'reaction1',
                buttonId: 'btn1',
                messageId: 'msg1',
                type: 'emoji',
                emoji: '👍',
                isActive: true
            };
            const result = interactive_message_validation_1.InteractiveMessageValidator.validateButtonReactions([emojiReaction], validButtons);
            (0, globals_1.expect)(result.isValid).toBe(true);
        });
        (0, globals_1.it)('should validate text reactions with proper text content', () => {
            const textReaction = {
                id: 'reaction1',
                buttonId: 'btn1',
                messageId: 'msg1',
                type: 'text',
                textResponse: 'Thank you for your selection!',
                isActive: true
            };
            const result = interactive_message_validation_1.InteractiveMessageValidator.validateButtonReactions([textReaction], validButtons);
            (0, globals_1.expect)(result.isValid).toBe(true);
        });
    });
    (0, globals_1.describe)('Button validation', () => {
        (0, globals_1.it)('should validate correct button configurations', () => {
            const buttons = [
                { id: 'btn1', title: 'Option 1' },
                { id: 'btn2', title: 'Option 2' },
                { id: 'btn3', title: 'Option 3' }
            ];
            const message = {
                ...validMessage,
                action: { type: 'button', buttons }
            };
            const result = interactive_message_validation_1.InteractiveMessageValidator.validateMessage(message);
            (0, globals_1.expect)(result.isValid).toBe(true);
        });
        (0, globals_1.it)('should fail validation for too many buttons', () => {
            const tooManyButtons = [
                { id: 'btn1', title: 'Option 1' },
                { id: 'btn2', title: 'Option 2' },
                { id: 'btn3', title: 'Option 3' },
                { id: 'btn4', title: 'Option 4' } // Exceeds limit of 3
            ];
            const message = {
                ...validMessage,
                action: { type: 'button', buttons: tooManyButtons }
            };
            const result = interactive_message_validation_1.InteractiveMessageValidator.validateMessage(message);
            (0, globals_1.expect)(result.isValid).toBe(false);
            (0, globals_1.expect)(result.errors.some(e => e.code === 'INVALID_COUNT')).toBe(true);
        });
        (0, globals_1.it)('should fail validation for duplicate button IDs', () => {
            const duplicateIdButtons = [
                { id: 'btn1', title: 'Option 1' },
                { id: 'btn1', title: 'Option 2' } // Duplicate ID
            ];
            const message = {
                ...validMessage,
                action: { type: 'button', buttons: duplicateIdButtons }
            };
            const result = interactive_message_validation_1.InteractiveMessageValidator.validateMessage(message);
            (0, globals_1.expect)(result.isValid).toBe(false);
            (0, globals_1.expect)(result.errors.some(e => e.code === 'DUPLICATE_VALUE')).toBe(true);
        });
        (0, globals_1.it)('should fail validation for duplicate button titles', () => {
            const duplicateTitleButtons = [
                { id: 'btn1', title: 'Same Title' },
                { id: 'btn2', title: 'Same Title' } // Duplicate title
            ];
            const message = {
                ...validMessage,
                action: { type: 'button', buttons: duplicateTitleButtons }
            };
            const result = interactive_message_validation_1.InteractiveMessageValidator.validateMessage(message);
            (0, globals_1.expect)(result.isValid).toBe(false);
            (0, globals_1.expect)(result.errors.some(e => e.code === 'DUPLICATE_VALUE')).toBe(true);
        });
        (0, globals_1.it)('should fail validation for button titles that are too long', () => {
            const longTitleButtons = [
                { id: 'btn1', title: 'a'.repeat(21) } // Exceeds 20 character limit
            ];
            const message = {
                ...validMessage,
                action: { type: 'button', buttons: longTitleButtons }
            };
            const result = interactive_message_validation_1.InteractiveMessageValidator.validateMessage(message);
            (0, globals_1.expect)(result.isValid).toBe(false);
            (0, globals_1.expect)(result.errors.some(e => e.code === 'INVALID_LENGTH')).toBe(true);
        });
    });
    (0, globals_1.describe)('Error handling and formatting', () => {
        (0, globals_1.it)('should format validation errors correctly', () => {
            const invalidMessage = { ...validMessage, name: '', body: { text: '' } };
            const result = interactive_message_validation_1.InteractiveMessageValidator.validateMessage(invalidMessage);
            const formattedErrors = (0, interactive_message_validation_1.formatValidationErrors)(result.errors);
            (0, globals_1.expect)(formattedErrors).toContain('name:');
            (0, globals_1.expect)(formattedErrors).toContain('body.text:');
        });
        (0, globals_1.it)('should group errors by field correctly', () => {
            const invalidMessage = { ...validMessage, name: '', body: { text: '' } };
            const result = interactive_message_validation_1.InteractiveMessageValidator.validateMessage(invalidMessage);
            const groupedErrors = (0, interactive_message_validation_1.groupErrorsByField)(result.errors);
            (0, globals_1.expect)(groupedErrors).toHaveProperty('name');
            (0, globals_1.expect)(groupedErrors).toHaveProperty('body.text');
            (0, globals_1.expect)(Array.isArray(groupedErrors.name)).toBe(true);
            (0, globals_1.expect)(Array.isArray(groupedErrors['body.text'])).toBe(true);
        });
        (0, globals_1.it)('should check for field errors correctly', () => {
            const invalidMessage = { ...validMessage, name: '' };
            const result = interactive_message_validation_1.InteractiveMessageValidator.validateMessage(invalidMessage);
            (0, globals_1.expect)((0, interactive_message_validation_1.hasFieldError)(result.errors, 'name')).toBe(true);
            (0, globals_1.expect)((0, interactive_message_validation_1.hasFieldError)(result.errors, 'body.text')).toBe(false);
        });
        (0, globals_1.it)('should get field errors correctly', () => {
            const invalidMessage = { ...validMessage, name: '' };
            const result = interactive_message_validation_1.InteractiveMessageValidator.validateMessage(invalidMessage);
            const nameErrors = (0, interactive_message_validation_1.getFieldErrors)(result.errors, 'name');
            (0, globals_1.expect)(nameErrors.length).toBeGreaterThan(0);
            (0, globals_1.expect)(nameErrors[0].field).toBe('name');
            const bodyErrors = (0, interactive_message_validation_1.getFieldErrors)(result.errors, 'body.text');
            (0, globals_1.expect)(bodyErrors).toHaveLength(0);
        });
    });
    (0, globals_1.describe)('InteractiveMessageValidationError', () => {
        (0, globals_1.it)('should create validation error with proper structure', () => {
            const errors = [
                {
                    field: 'name',
                    code: 'REQUIRED_FIELD',
                    message: 'Name is required',
                    severity: 'error'
                }
            ];
            const validationError = new interactive_message_validation_1.InteractiveMessageValidationError(errors);
            (0, globals_1.expect)(validationError.name).toBe('InteractiveMessageValidationError');
            (0, globals_1.expect)(validationError.errors).toEqual(errors);
            (0, globals_1.expect)(validationError.message).toContain('Validation failed');
        });
    });
    (0, globals_1.describe)('Context-aware validation', () => {
        (0, globals_1.it)('should warn about duplicate message names in context', () => {
            const context = {
                messageType: 'button',
                isEditing: false,
                existingMessages: [
                    { ...validMessage, id: 'existing1', name: 'Test Message' }
                ]
            };
            const result = interactive_message_validation_1.InteractiveMessageValidator.validateMessage(validMessage, context);
            (0, globals_1.expect)(result.warnings.some(w => w.code === 'DUPLICATE_NAME')).toBe(true);
        });
        (0, globals_1.it)('should not warn about duplicate names when editing the same message', () => {
            const context = {
                messageType: 'button',
                isEditing: true,
                existingMessages: [
                    { ...validMessage, id: 'msg1', name: 'Test Message' }
                ]
            };
            const messageBeingEdited = { ...validMessage, id: 'msg1' };
            const result = interactive_message_validation_1.InteractiveMessageValidator.validateMessage(messageBeingEdited, context);
            (0, globals_1.expect)(result.warnings.some(w => w.code === 'DUPLICATE_NAME')).toBe(false);
        });
    });
});
