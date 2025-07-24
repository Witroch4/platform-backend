"use strict";
// Comprehensive validation system for Interactive Messages
// Provides client-side and server-side validation with detailed error reporting
Object.defineProperty(exports, "__esModule", { value: true });
exports.InteractiveMessageValidator = exports.ButtonReactionSchema = exports.InteractiveMessageSchema = exports.MessageActionSchema = exports.LocationRequestActionSchema = exports.FlowActionSchema = exports.CtaUrlActionSchema = exports.ListActionSchema = exports.ListSectionSchema = exports.ListRowSchema = exports.ButtonActionSchema = exports.QuickReplyButtonSchema = exports.FooterSchema = exports.BodySchema = exports.HeaderSchema = exports.InteractiveMessageValidationError = void 0;
exports.formatValidationErrors = formatValidationErrors;
exports.groupErrorsByField = groupErrorsByField;
exports.hasFieldError = hasFieldError;
exports.getFieldErrors = getFieldErrors;
const zod_1 = require("zod");
const validation_1 = require("@/types/validation");
// Custom validation error class
class InteractiveMessageValidationError extends Error {
    errors;
    constructor(errors) {
        const message = `Validation failed: ${errors.map(e => e.message).join(', ')}`;
        super(message);
        this.name = 'InteractiveMessageValidationError';
        this.errors = errors;
    }
}
exports.InteractiveMessageValidationError = InteractiveMessageValidationError;
// Zod schemas for server-side validation
exports.HeaderSchema = zod_1.z.object({
    type: zod_1.z.enum(['text', 'image', 'video', 'document']),
    content: zod_1.z.string().optional(),
    mediaUrl: zod_1.z.string().url().optional(),
    media_url: zod_1.z.string().url().optional(), // Support both formats
    mediaId: zod_1.z.string().optional(),
    filename: zod_1.z.string().optional(),
}).refine((data) => {
    if (data.type === 'text') {
        return data.content && data.content.length <= validation_1.MESSAGE_LIMITS.HEADER_TEXT_MAX_LENGTH;
    }
    return data.content || data.mediaUrl || data.media_url || data.mediaId;
}, {
    message: "Header content is required and must meet type-specific requirements"
});
exports.BodySchema = zod_1.z.object({
    text: zod_1.z.string()
        .min(1, validation_1.VALIDATION_MESSAGES.BODY_TEXT_REQUIRED)
        .max(validation_1.MESSAGE_LIMITS.BODY_TEXT_MAX_LENGTH, validation_1.VALIDATION_MESSAGES.BODY_TOO_LONG)
});
exports.FooterSchema = zod_1.z.object({
    text: zod_1.z.string()
        .max(validation_1.MESSAGE_LIMITS.FOOTER_TEXT_MAX_LENGTH, validation_1.VALIDATION_MESSAGES.FOOTER_TOO_LONG)
});
exports.QuickReplyButtonSchema = zod_1.z.object({
    id: zod_1.z.string().min(1, validation_1.VALIDATION_MESSAGES.BUTTON_ID_REQUIRED),
    title: zod_1.z.string()
        .min(1, validation_1.VALIDATION_MESSAGES.BUTTON_TITLE_REQUIRED)
        .max(validation_1.MESSAGE_LIMITS.BUTTON_TITLE_MAX_LENGTH, validation_1.VALIDATION_MESSAGES.BUTTON_TITLE_TOO_LONG),
    payload: zod_1.z.string().optional()
});
exports.ButtonActionSchema = zod_1.z.object({
    type: zod_1.z.literal('button'),
    buttons: zod_1.z.array(exports.QuickReplyButtonSchema)
        .min(1, 'At least one button is required')
        .max(validation_1.MESSAGE_LIMITS.BUTTON_MAX_COUNT, validation_1.VALIDATION_MESSAGES.TOO_MANY_BUTTONS)
        .refine((buttons) => {
        const ids = buttons.map(b => b.id);
        return new Set(ids).size === ids.length;
    }, { message: validation_1.VALIDATION_MESSAGES.DUPLICATE_BUTTON_ID })
        .refine((buttons) => {
        const titles = buttons.map(b => b.title);
        return new Set(titles).size === titles.length;
    }, { message: validation_1.VALIDATION_MESSAGES.DUPLICATE_BUTTON_TITLE })
});
exports.ListRowSchema = zod_1.z.object({
    id: zod_1.z.string().min(1, 'Row ID is required'),
    title: zod_1.z.string()
        .min(1, validation_1.VALIDATION_MESSAGES.LIST_ROW_TITLE_REQUIRED)
        .max(validation_1.MESSAGE_LIMITS.LIST_TITLE_MAX_LENGTH, validation_1.VALIDATION_MESSAGES.LIST_TITLE_TOO_LONG),
    description: zod_1.z.string()
        .max(validation_1.MESSAGE_LIMITS.LIST_DESCRIPTION_MAX_LENGTH, validation_1.VALIDATION_MESSAGES.LIST_DESCRIPTION_TOO_LONG)
        .optional()
});
exports.ListSectionSchema = zod_1.z.object({
    title: zod_1.z.string()
        .min(1, validation_1.VALIDATION_MESSAGES.LIST_SECTION_TITLE_REQUIRED)
        .max(validation_1.MESSAGE_LIMITS.LIST_TITLE_MAX_LENGTH, validation_1.VALIDATION_MESSAGES.LIST_TITLE_TOO_LONG),
    rows: zod_1.z.array(exports.ListRowSchema)
        .min(1, 'At least one row is required per section')
        .max(validation_1.MESSAGE_LIMITS.LIST_ROW_MAX_COUNT, validation_1.VALIDATION_MESSAGES.TOO_MANY_ROWS)
});
exports.ListActionSchema = zod_1.z.object({
    type: zod_1.z.literal('list'),
    buttonText: zod_1.z.string().min(1, 'Button text is required'),
    sections: zod_1.z.array(exports.ListSectionSchema)
        .min(1, 'At least one section is required')
        .max(validation_1.MESSAGE_LIMITS.LIST_SECTION_MAX_COUNT, validation_1.VALIDATION_MESSAGES.TOO_MANY_SECTIONS)
});
exports.CtaUrlActionSchema = zod_1.z.object({
    type: zod_1.z.literal('cta_url'),
    action: zod_1.z.object({
        displayText: zod_1.z.string().min(1, validation_1.VALIDATION_MESSAGES.CTA_DISPLAY_TEXT_REQUIRED),
        url: zod_1.z.string().url(validation_1.VALIDATION_MESSAGES.INVALID_URL)
    })
});
exports.FlowActionSchema = zod_1.z.object({
    type: zod_1.z.literal('flow'),
    action: zod_1.z.object({
        flowId: zod_1.z.string().min(1, validation_1.VALIDATION_MESSAGES.FLOW_ID_REQUIRED),
        flowCta: zod_1.z.string().min(1, validation_1.VALIDATION_MESSAGES.FLOW_CTA_REQUIRED),
        flowMode: zod_1.z.enum(['draft', 'published']),
        flowData: zod_1.z.record(zod_1.z.any()).optional()
    })
});
exports.LocationRequestActionSchema = zod_1.z.object({
    type: zod_1.z.literal('location_request'),
    action: zod_1.z.object({
        requestText: zod_1.z.string().min(1, 'Request text is required')
    })
});
exports.MessageActionSchema = zod_1.z.discriminatedUnion('type', [
    exports.ButtonActionSchema,
    exports.ListActionSchema,
    exports.CtaUrlActionSchema,
    exports.FlowActionSchema,
    exports.LocationRequestActionSchema
]);
exports.InteractiveMessageSchema = zod_1.z.object({
    id: zod_1.z.string().optional(),
    name: zod_1.z.string()
        .min(1, validation_1.VALIDATION_MESSAGES.NAME_REQUIRED)
        .max(255, validation_1.VALIDATION_MESSAGES.NAME_TOO_LONG),
    type: zod_1.z.enum([
        'button', 'list', 'cta_url', 'flow', 'location_request',
        'location', 'reaction', 'sticker', 'product', 'product_list'
    ]),
    header: exports.HeaderSchema.optional(),
    body: exports.BodySchema,
    footer: exports.FooterSchema.optional(),
    action: exports.MessageActionSchema.optional(),
    isActive: zod_1.z.boolean().default(true),
    createdAt: zod_1.z.date().optional(),
    updatedAt: zod_1.z.date().optional()
});
exports.ButtonReactionSchema = zod_1.z.object({
    id: zod_1.z.string().optional(),
    buttonId: zod_1.z.string().min(1, 'Button ID is required'),
    messageId: zod_1.z.string().optional(),
    type: zod_1.z.enum(['emoji', 'text']),
    emoji: zod_1.z.string().optional(),
    textResponse: zod_1.z.string().optional(),
    isActive: zod_1.z.boolean().default(true)
}).refine((data) => {
    if (data.type === 'emoji') {
        return data.emoji && validation_1.VALIDATION_PATTERNS.EMOJI.test(data.emoji);
    }
    if (data.type === 'text') {
        return data.textResponse && data.textResponse.trim().length > 0;
    }
    return false;
}, {
    message: "Reaction must have appropriate content for its type"
});
// Client-side validation functions
class InteractiveMessageValidator {
    static validateMessage(message, context) {
        const errors = [];
        const warnings = [];
        try {
            // Use Zod schema for basic validation
            exports.InteractiveMessageSchema.parse(message);
        }
        catch (error) {
            if (error instanceof zod_1.z.ZodError) {
                errors.push(...this.convertZodErrors(error));
            }
        }
        // Additional business logic validation
        this.validateBusinessRules(message, context, errors, warnings);
        return {
            isValid: errors.length === 0,
            errors,
            warnings
        };
    }
    static validateField(fieldName, value, message, context) {
        const errors = [];
        const warnings = [];
        switch (fieldName) {
            case 'name':
                this.validateName(value, errors, warnings);
                break;
            case 'body.text':
                this.validateBodyText(value, errors, warnings);
                break;
            case 'header.content':
                this.validateHeaderContent(value, errors, warnings, message.header?.type);
                break;
            case 'footer.text':
                this.validateFooterText(value, errors, warnings);
                break;
            case 'action.buttons':
                this.validateButtons(value, errors, warnings);
                break;
            default:
                // Generic validation for unknown fields
                break;
        }
        return {
            field: fieldName,
            isValid: errors.length === 0,
            errors,
            warnings
        };
    }
    static validateButtonReactions(reactions, buttons) {
        const errors = [];
        const warnings = [];
        // Validate each reaction
        reactions.forEach((reaction, index) => {
            try {
                exports.ButtonReactionSchema.parse(reaction);
            }
            catch (error) {
                if (error instanceof zod_1.z.ZodError) {
                    errors.push(...this.convertZodErrors(error, `reactions[${index}]`));
                }
            }
            // Check if button exists
            const buttonExists = buttons.some(b => b.id === reaction.buttonId);
            if (!buttonExists) {
                errors.push({
                    field: `reactions[${index}].buttonId`,
                    code: 'INVALID_BUTTON_REFERENCE',
                    message: `Reaction references non-existent button: ${reaction.buttonId}`,
                    value: reaction.buttonId,
                    severity: 'error'
                });
            }
        });
        // Check for duplicate button reactions
        const buttonIds = reactions.map(r => r.buttonId);
        const duplicates = buttonIds.filter((id, index) => buttonIds.indexOf(id) !== index);
        if (duplicates.length > 0) {
            errors.push({
                field: 'reactions',
                code: 'DUPLICATE_BUTTON_REACTIONS',
                message: `Multiple reactions configured for buttons: ${duplicates.join(', ')}`,
                value: duplicates,
                severity: 'error'
            });
        }
        return {
            isValid: errors.length === 0,
            errors,
            warnings
        };
    }
    // Private validation methods
    static validateName(name, errors, warnings) {
        if (!name || !name.trim()) {
            errors.push({
                field: 'name',
                code: 'REQUIRED_FIELD',
                message: validation_1.VALIDATION_MESSAGES.NAME_REQUIRED,
                severity: 'error'
            });
        }
        else if (name.length > 255) {
            errors.push({
                field: 'name',
                code: 'INVALID_LENGTH',
                message: validation_1.VALIDATION_MESSAGES.NAME_TOO_LONG,
                value: name.length,
                limit: 255,
                severity: 'error'
            });
        }
        else if (name.length > 200) {
            warnings.push({
                field: 'name',
                code: 'LENGTH_WARNING',
                message: 'Consider using a shorter name for better readability',
                value: name.length,
                limit: 200,
                severity: 'warning'
            });
        }
    }
    static validateBodyText(text, errors, warnings) {
        if (!text || !text.trim()) {
            errors.push({
                field: 'body.text',
                code: 'REQUIRED_FIELD',
                message: validation_1.VALIDATION_MESSAGES.BODY_TEXT_REQUIRED,
                severity: 'error'
            });
        }
        else if (text.length > validation_1.MESSAGE_LIMITS.BODY_TEXT_MAX_LENGTH) {
            errors.push({
                field: 'body.text',
                code: 'INVALID_LENGTH',
                message: validation_1.VALIDATION_MESSAGES.BODY_TOO_LONG,
                value: text.length,
                limit: validation_1.MESSAGE_LIMITS.BODY_TEXT_MAX_LENGTH,
                severity: 'error'
            });
        }
        else if (text.length > validation_1.MESSAGE_LIMITS.BODY_TEXT_MAX_LENGTH * 0.9) {
            warnings.push({
                field: 'body.text',
                code: 'LENGTH_WARNING',
                message: 'Body text is approaching the character limit',
                value: text.length,
                limit: validation_1.MESSAGE_LIMITS.BODY_TEXT_MAX_LENGTH,
                severity: 'warning'
            });
        }
    }
    static validateHeaderContent(content, errors, warnings, type) {
        if (type === 'text' && content) {
            if (content.length > validation_1.MESSAGE_LIMITS.HEADER_TEXT_MAX_LENGTH) {
                errors.push({
                    field: 'header.content',
                    code: 'INVALID_LENGTH',
                    message: validation_1.VALIDATION_MESSAGES.HEADER_TOO_LONG,
                    value: content.length,
                    limit: validation_1.MESSAGE_LIMITS.HEADER_TEXT_MAX_LENGTH,
                    severity: 'error'
                });
            }
        }
        else if (type && type !== 'text' && content) {
            // Validate URL format for media headers
            if (!validation_1.VALIDATION_PATTERNS.URL.test(content)) {
                errors.push({
                    field: 'header.content',
                    code: 'INVALID_FORMAT',
                    message: validation_1.VALIDATION_MESSAGES.INVALID_URL,
                    value: content,
                    severity: 'error'
                });
            }
        }
    }
    static validateFooterText(text, errors, warnings) {
        if (text && text.length > validation_1.MESSAGE_LIMITS.FOOTER_TEXT_MAX_LENGTH) {
            errors.push({
                field: 'footer.text',
                code: 'INVALID_LENGTH',
                message: validation_1.VALIDATION_MESSAGES.FOOTER_TOO_LONG,
                value: text.length,
                limit: validation_1.MESSAGE_LIMITS.FOOTER_TEXT_MAX_LENGTH,
                severity: 'error'
            });
        }
    }
    static validateButtons(buttons, errors, warnings) {
        if (buttons.length > validation_1.MESSAGE_LIMITS.BUTTON_MAX_COUNT) {
            errors.push({
                field: 'action.buttons',
                code: 'INVALID_COUNT',
                message: validation_1.VALIDATION_MESSAGES.TOO_MANY_BUTTONS,
                value: buttons.length,
                limit: validation_1.MESSAGE_LIMITS.BUTTON_MAX_COUNT,
                severity: 'error'
            });
        }
        // Check for duplicate IDs and titles
        const ids = buttons.map(b => b.id);
        const titles = buttons.map(b => b.title);
        if (new Set(ids).size !== ids.length) {
            errors.push({
                field: 'action.buttons',
                code: 'DUPLICATE_VALUE',
                message: validation_1.VALIDATION_MESSAGES.DUPLICATE_BUTTON_ID,
                severity: 'error'
            });
        }
        if (new Set(titles).size !== titles.length) {
            errors.push({
                field: 'action.buttons',
                code: 'DUPLICATE_VALUE',
                message: validation_1.VALIDATION_MESSAGES.DUPLICATE_BUTTON_TITLE,
                severity: 'error'
            });
        }
    }
    static validateBusinessRules(message, context, errors, warnings) {
        // Message type specific validation
        if (message.type === 'button' && (!message.action || message.action.type !== 'button')) {
            errors.push({
                field: 'action',
                code: 'MISSING_REQUIRED_ACTION',
                message: 'Button message type requires button action configuration',
                severity: 'error'
            });
        }
        // Context-specific validation
        if (context?.existingMessages) {
            const duplicateName = context.existingMessages.find(m => m.name === message.name && m.id !== message.id);
            if (duplicateName) {
                warnings.push({
                    field: 'name',
                    code: 'DUPLICATE_NAME',
                    message: 'A message with this name already exists',
                    severity: 'warning'
                });
            }
        }
    }
    static convertZodErrors(zodError, prefix = '') {
        return zodError.errors.map(error => ({
            field: prefix ? `${prefix}.${error.path.join('.')}` : error.path.join('.'),
            code: error.code.toUpperCase(),
            message: error.message,
            value: error.received,
            severity: 'error'
        }));
    }
}
exports.InteractiveMessageValidator = InteractiveMessageValidator;
// Utility functions for error handling
function formatValidationErrors(errors) {
    return errors.map(error => `${error.field}: ${error.message}`).join('\n');
}
function groupErrorsByField(errors) {
    return errors.reduce((acc, error) => {
        if (!acc[error.field]) {
            acc[error.field] = [];
        }
        acc[error.field].push(error);
        return acc;
    }, {});
}
function hasFieldError(errors, fieldName) {
    return errors.some(error => error.field === fieldName || error.field.startsWith(`${fieldName}.`));
}
function getFieldErrors(errors, fieldName) {
    return errors.filter(error => error.field === fieldName || error.field.startsWith(`${fieldName}.`));
}
