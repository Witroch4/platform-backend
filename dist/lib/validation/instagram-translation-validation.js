"use strict";
/**
 * Instagram Translation Validation Schemas
 *
 * Zod schemas for validating Instagram translation data structures
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ErrorResponseSchema = exports.DialogflowResponseSchema = exports.WebhookRequestSchema = exports.MensagemInterativaSchema = exports.TemplateQueryParamsSchema = exports.ConversionResultSchema = exports.ConversionRulesSchema = exports.InstagramTemplateSchema = exports.InstagramButtonTemplateSchema = exports.InstagramGenericTemplateSchema = exports.InstagramButtonSchema = exports.WhatsAppTemplateSchema = exports.WhatsAppButtonSchema = exports.DialogflowPayloadSchema = exports.ChannelTypeSchema = void 0;
exports.validateChannelType = validateChannelType;
exports.validateWhatsAppTemplate = validateWhatsAppTemplate;
exports.validateInstagramTemplate = validateInstagramTemplate;
exports.validateConversionResult = validateConversionResult;
exports.validateCharacterLimits = validateCharacterLimits;
exports.validateButtonCount = validateButtonCount;
exports.validateForInstagramConversion = validateForInstagramConversion;
exports.validateJobData = validateJobData;
exports.validateCorrelationId = validateCorrelationId;
exports.validateTimeout = validateTimeout;
exports.sanitizeErrorMessage = sanitizeErrorMessage;
exports.validatePayloadSecurity = validatePayloadSecurity;
exports.validateRateLimit = validateRateLimit;
const zod_1 = require("zod");
// Channel Type Validation
exports.ChannelTypeSchema = zod_1.z.enum([
    'Channel::Instagram',
    'Channel::WhatsApp',
    'Channel::Facebook',
    'Channel::Telegram',
]);
// Dialogflow Payload Validation
exports.DialogflowPayloadSchema = zod_1.z.object({
    originalDetectIntentRequest: zod_1.z.object({
        payload: zod_1.z.object({
            channel_type: exports.ChannelTypeSchema.optional(),
            // Other Dialogflow payload fields
        }).passthrough(),
    }).passthrough(),
    // Other Dialogflow fields
}).passthrough();
// WhatsApp Template Validation
exports.WhatsAppButtonSchema = zod_1.z.object({
    id: zod_1.z.string(),
    titulo: zod_1.z.string().max(20, 'Button title must be ≤20 characters'),
    tipo: zod_1.z.enum(['web_url', 'postback', 'phone_number']),
    url: zod_1.z.string().url().optional(),
    payload: zod_1.z.string().optional(),
});
exports.WhatsAppTemplateSchema = zod_1.z.object({
    headerTipo: zod_1.z.enum(['text', 'image', 'video', 'document']).optional(),
    headerConteudo: zod_1.z.string().optional(),
    texto: zod_1.z.string().min(1, 'Message text is required'),
    rodape: zod_1.z.string().max(60, 'Footer must be ≤60 characters').optional(),
    botoes: zod_1.z.array(exports.WhatsAppButtonSchema).max(10, 'Maximum 10 buttons allowed'),
});
// Instagram Template Validation
exports.InstagramButtonSchema = zod_1.z.object({
    type: zod_1.z.enum(['web_url', 'postback']),
    title: zod_1.z.string().max(20, 'Button title must be ≤20 characters'),
    url: zod_1.z.string().url().optional(),
    payload: zod_1.z.string().optional(),
});
exports.InstagramGenericTemplateSchema = zod_1.z.object({
    template_type: zod_1.z.literal('generic'),
    elements: zod_1.z.array(zod_1.z.object({
        title: zod_1.z.string().max(80, 'Title must be ≤80 characters'),
        image_url: zod_1.z.string().url().optional(),
        subtitle: zod_1.z.string().max(80, 'Subtitle must be ≤80 characters').optional(),
        buttons: zod_1.z.array(exports.InstagramButtonSchema).max(3, 'Maximum 3 buttons for Instagram'),
    })).min(1).max(1, 'Generic template supports only 1 element'),
});
exports.InstagramButtonTemplateSchema = zod_1.z.object({
    template_type: zod_1.z.literal('button'),
    text: zod_1.z.string().min(1).max(640, 'Text must be between 1-640 characters'),
    buttons: zod_1.z.array(exports.InstagramButtonSchema).max(3, 'Maximum 3 buttons for Instagram'),
});
exports.InstagramTemplateSchema = zod_1.z.discriminatedUnion('template_type', [
    exports.InstagramGenericTemplateSchema,
    exports.InstagramButtonTemplateSchema,
]);
// Conversion Rules Validation
exports.ConversionRulesSchema = zod_1.z.object({
    maxBodyLengthForGeneric: zod_1.z.number().positive().default(80),
    maxBodyLengthForButton: zod_1.z.number().positive().default(640),
    maxSubtitleLength: zod_1.z.number().positive().default(80),
    maxTitleLength: zod_1.z.number().positive().default(80),
    maxButtonsCount: zod_1.z.number().positive().default(3),
});
// Conversion Result Validation
exports.ConversionResultSchema = zod_1.z.object({
    success: zod_1.z.boolean(),
    templateType: zod_1.z.enum(['generic', 'button', 'incompatible']).optional(),
    instagramTemplate: exports.InstagramTemplateSchema.optional(),
    error: zod_1.z.string().optional(),
    warnings: zod_1.z.array(zod_1.z.string()).optional(),
    metadata: zod_1.z.object({
        originalLength: zod_1.z.number(),
        truncated: zod_1.z.boolean(),
        buttonsRemoved: zod_1.z.number(),
        conversionTime: zod_1.z.number(),
    }).optional(),
});
// Database Query Validation
exports.TemplateQueryParamsSchema = zod_1.z.object({
    intentName: zod_1.z.string().min(1),
    inboxId: zod_1.z.string().min(1),
});
exports.MensagemInterativaSchema = zod_1.z.object({
    id: zod_1.z.string(),
    headerTipo: zod_1.z.string().nullable(),
    headerConteudo: zod_1.z.string().nullable(),
    texto: zod_1.z.string(),
    rodape: zod_1.z.string().nullable(),
    botoes: zod_1.z.array(zod_1.z.object({
        id: zod_1.z.string(),
        titulo: zod_1.z.string(),
        tipo: zod_1.z.string(),
        url: zod_1.z.string().nullable(),
    })),
});
// Webhook Request Validation
exports.WebhookRequestSchema = zod_1.z.object({
    queryResult: zod_1.z.object({
        intent: zod_1.z.object({
            displayName: zod_1.z.string(),
        }),
    }),
    originalDetectIntentRequest: zod_1.z.object({
        payload: zod_1.z.object({
            channel_type: exports.ChannelTypeSchema.optional(),
            from: zod_1.z.object({
                phone: zod_1.z.string(),
            }),
            conversation: zod_1.z.object({
                id: zod_1.z.string(),
            }),
            // Additional payload fields
        }).passthrough(),
    }),
    // Additional webhook fields
}).passthrough();
// Response Validation
exports.DialogflowResponseSchema = zod_1.z.object({
    fulfillmentMessages: zod_1.z.array(zod_1.z.object({
        platform: zod_1.z.string().optional(),
        payload: zod_1.z.any().optional(),
        text: zod_1.z.object({
            text: zod_1.z.array(zod_1.z.string()),
        }).optional(),
    })),
});
// Error Response Validation
exports.ErrorResponseSchema = zod_1.z.object({
    success: zod_1.z.literal(false),
    error: zod_1.z.string(),
    errorCode: zod_1.z.string(),
    fallbackAction: zod_1.z.enum(['whatsapp_only', 'retry', 'skip']),
    correlationId: zod_1.z.string(),
    timestamp: zod_1.z.date(),
});
// Validation Helper Functions
function validateChannelType(payload) {
    try {
        const result = exports.DialogflowPayloadSchema.safeParse(payload);
        if (!result.success)
            return false;
        const channelType = result.data.originalDetectIntentRequest.payload.channel_type;
        return channelType === 'Channel::Instagram';
    }
    catch {
        return false;
    }
}
function validateWhatsAppTemplate(template) {
    const result = exports.WhatsAppTemplateSchema.safeParse(template);
    if (result.success) {
        return { success: true, data: result.data };
    }
    else {
        return { success: false, errors: result.error };
    }
}
function validateInstagramTemplate(template) {
    const result = exports.InstagramTemplateSchema.safeParse(template);
    if (result.success) {
        return { success: true, data: result.data };
    }
    else {
        return { success: false, errors: result.error };
    }
}
function validateConversionResult(result) {
    const validationResult = exports.ConversionResultSchema.safeParse(result);
    if (validationResult.success) {
        return { success: true, data: validationResult.data };
    }
    else {
        return { success: false, errors: validationResult.error };
    }
}
// Character Limit Validation
function validateCharacterLimits(text, type) {
    const maxLength = type === 'generic' ? 80 : 640;
    const length = text.length;
    const exceedsLimit = length > maxLength;
    return {
        valid: !exceedsLimit,
        length,
        maxLength,
        exceedsLimit,
    };
}
// Button Validation
function validateButtonCount(buttons) {
    const maxCount = 3; // Instagram limit
    const count = buttons.length;
    const exceedsLimit = count > maxCount;
    return {
        valid: !exceedsLimit,
        count,
        maxCount,
        exceedsLimit,
    };
}
// Comprehensive Validation
function validateForInstagramConversion(template) {
    const errors = [];
    const warnings = [];
    // Validate basic template structure
    const templateValidation = validateWhatsAppTemplate(template);
    if (!templateValidation.success) {
        errors.push('Invalid WhatsApp template structure');
        return {
            valid: false,
            templateType: 'incompatible',
            errors,
            warnings,
        };
    }
    const validTemplate = templateValidation.data;
    // Determine template type based on text length
    const textLength = validTemplate.texto.length;
    let templateType;
    if (textLength <= 80) {
        templateType = 'generic';
    }
    else if (textLength <= 640) {
        templateType = 'button';
    }
    else {
        templateType = 'incompatible';
        errors.push(`Message text too long (${textLength} chars). Instagram supports max 640 characters.`);
    }
    // Validate button count
    const buttonValidation = validateButtonCount(validTemplate.botoes);
    if (!buttonValidation.valid) {
        warnings.push(`Too many buttons (${buttonValidation.count}). Only first 3 will be used for Instagram.`);
    }
    // Validate button types
    for (const button of validTemplate.botoes) {
        if (!['web_url', 'postback'].includes(button.tipo)) {
            warnings.push(`Button type "${button.tipo}" not supported on Instagram. Will be converted to postback.`);
        }
        if (button.titulo.length > 20) {
            warnings.push(`Button title "${button.titulo}" too long. Will be truncated to 20 characters.`);
        }
    }
    // Validate footer for generic template
    if (templateType === 'generic' && validTemplate.rodape && validTemplate.rodape.length > 80) {
        warnings.push(`Footer too long (${validTemplate.rodape.length} chars). Will be truncated to 80 characters.`);
    }
    return {
        valid: errors.length === 0,
        templateType,
        errors,
        warnings,
    };
}
// Enhanced Input Validation Functions
function validateJobData(data) {
    const errors = [];
    // Required fields validation
    if (!data.intentName || typeof data.intentName !== 'string' || data.intentName.trim().length === 0) {
        errors.push('intentName is required and must be a non-empty string');
    }
    if (!data.inboxId || typeof data.inboxId !== 'string' || data.inboxId.trim().length === 0) {
        errors.push('inboxId is required and must be a non-empty string');
    }
    if (!data.contactPhone || typeof data.contactPhone !== 'string' || data.contactPhone.trim().length === 0) {
        errors.push('contactPhone is required and must be a non-empty string');
    }
    // Convert conversationId to string if it's a number, then validate
    const conversationIdStr = data.conversationId ? String(data.conversationId).trim() : '';
    if (!conversationIdStr || conversationIdStr.length === 0) {
        errors.push('conversationId is required and must be a non-empty string');
    }
    if (!data.correlationId || typeof data.correlationId !== 'string' || data.correlationId.trim().length === 0) {
        errors.push('correlationId is required and must be a non-empty string');
    }
    if (!data.originalPayload || typeof data.originalPayload !== 'object') {
        errors.push('originalPayload is required and must be an object');
    }
    // Sanitize data if valid
    if (errors.length === 0) {
        const sanitizedData = {
            intentName: data.intentName.trim(),
            inboxId: data.inboxId.trim(),
            contactPhone: data.contactPhone.trim(),
            conversationId: conversationIdStr, // Use the converted string version
            correlationId: data.correlationId.trim(),
            originalPayload: data.originalPayload,
            metadata: {
                timestamp: new Date(),
                retryCount: 0,
                ...data.metadata,
            },
        };
        return { valid: true, errors: [], sanitizedData };
    }
    return { valid: false, errors };
}
function validateCorrelationId(correlationId) {
    if (!correlationId) {
        return { valid: false, error: 'Correlation ID is required' };
    }
    if (typeof correlationId !== 'string') {
        return { valid: false, error: 'Correlation ID must be a string' };
    }
    const sanitized = correlationId.trim();
    if (sanitized.length === 0) {
        return { valid: false, error: 'Correlation ID cannot be empty' };
    }
    if (sanitized.length > 100) {
        return { valid: false, error: 'Correlation ID too long (max 100 characters)' };
    }
    // Check for valid characters (alphanumeric, hyphens, underscores)
    if (!/^[a-zA-Z0-9\-_]+$/.test(sanitized)) {
        return { valid: false, error: 'Correlation ID contains invalid characters' };
    }
    return { valid: true, sanitized };
}
function validateTimeout(timeoutMs) {
    if (timeoutMs === undefined || timeoutMs === null) {
        return { valid: true, sanitized: 4500 }; // Default timeout
    }
    if (typeof timeoutMs !== 'number') {
        return { valid: false, error: 'Timeout must be a number' };
    }
    if (timeoutMs < 100) {
        return { valid: false, error: 'Timeout too short (minimum 100ms)' };
    }
    if (timeoutMs > 30000) {
        return { valid: false, error: 'Timeout too long (maximum 30 seconds)' };
    }
    return { valid: true, sanitized: Math.floor(timeoutMs) };
}
function sanitizeErrorMessage(error) {
    if (!error) {
        return 'Unknown error occurred';
    }
    if (typeof error === 'string') {
        return error.substring(0, 500); // Limit error message length
    }
    if (error instanceof Error) {
        return error.message.substring(0, 500);
    }
    if (typeof error === 'object' && error.message) {
        return String(error.message).substring(0, 500);
    }
    return String(error).substring(0, 500);
}
// Security validation functions
function validatePayloadSecurity(payload) {
    const issues = [];
    // Check for potential XSS patterns
    const xssPatterns = [
        /<script/i,
        /javascript:/i,
        /on\w+\s*=/i,
        /<iframe/i,
        /<object/i,
        /<embed/i,
    ];
    const payloadString = JSON.stringify(payload);
    for (const pattern of xssPatterns) {
        if (pattern.test(payloadString)) {
            issues.push(`Potential XSS pattern detected: ${pattern.source}`);
        }
    }
    // Check for SQL injection patterns
    const sqlPatterns = [
        /union\s+select/i,
        /drop\s+table/i,
        /delete\s+from/i,
        /insert\s+into/i,
        /update\s+set/i,
    ];
    for (const pattern of sqlPatterns) {
        if (pattern.test(payloadString)) {
            issues.push(`Potential SQL injection pattern detected: ${pattern.source}`);
        }
    }
    // Check payload size
    if (payloadString.length > 100000) { // 100KB limit
        issues.push('Payload too large (exceeds 100KB)');
    }
    return {
        safe: issues.length === 0,
        issues,
    };
}
// Rate limiting validation
function validateRateLimit(inboxId, rateLimitMap) {
    const now = Date.now();
    const windowMs = 60000; // 1 minute window
    const maxRequests = 100; // Max 100 requests per minute per inbox
    if (!rateLimitMap.has(inboxId)) {
        rateLimitMap.set(inboxId, []);
    }
    const requests = rateLimitMap.get(inboxId);
    // Remove old requests outside the window
    const validRequests = requests.filter(timestamp => now - timestamp < windowMs);
    rateLimitMap.set(inboxId, validRequests);
    if (validRequests.length >= maxRequests) {
        const oldestRequest = Math.min(...validRequests);
        const retryAfter = Math.ceil((oldestRequest + windowMs - now) / 1000);
        return {
            allowed: false,
            reason: `Rate limit exceeded for inbox ${inboxId}`,
            retryAfter,
        };
    }
    // Add current request
    validRequests.push(now);
    rateLimitMap.set(inboxId, validRequests);
    return { allowed: true };
}
