/**
 * Instagram Translation Validation Schemas
 *
 * Zod schemas for validating Instagram translation data structures
 */

import { z } from "zod";

// Channel Type Validation
export const ChannelTypeSchema = z.enum([
	"Channel::Instagram",
	"Channel::WhatsApp",
	"Channel::Facebook",
	"Channel::Telegram",
]);

// Dialogflow Payload Validation
export const DialogflowPayloadSchema = z
	.object({
		originalDetectIntentRequest: z
			.object({
				payload: z
					.object({
						channel_type: ChannelTypeSchema.optional(),
						// Other Dialogflow payload fields
					})
					.passthrough(),
			})
			.passthrough(),
		// Other Dialogflow fields
	})
	.passthrough();

// WhatsApp Template Validation
export const WhatsAppButtonSchema = z.object({
	id: z.string(),
	titulo: z.string().max(20, "Button title must be ≤20 characters"),
	tipo: z.enum(["web_url", "postback", "phone_number"]),
	url: z.string().url().optional(),
	payload: z.string().optional(),
});

export const WhatsAppTemplateSchema = z.object({
	headerTipo: z.enum(["text", "image", "video", "document"]).optional(),
	headerConteudo: z.string().optional(),
	texto: z.string().min(1, "Message text is required"),
	rodape: z.string().max(60, "Footer must be ≤60 characters").optional(),
	botoes: z.array(WhatsAppButtonSchema).max(10, "Maximum 10 buttons allowed"),
});

// Instagram Template Validation
export const InstagramButtonSchema = z.object({
	type: z.enum(["web_url", "postback"]),
	title: z.string().max(20, "Button title must be ≤20 characters"),
	url: z.string().url().optional(),
	payload: z.string().optional(),
});

export const InstagramGenericTemplateSchema = z.object({
	template_type: z.literal("generic"),
	elements: z
		.array(
			z.object({
				title: z.string().max(80, "Title must be ≤80 characters"),
				image_url: z.string().url().optional(),
				subtitle: z.string().max(80, "Subtitle must be ≤80 characters").optional(),
				buttons: z.array(InstagramButtonSchema).max(3, "Maximum 3 buttons for Instagram"),
			}),
		)
		.min(1)
		.max(1, "Generic template supports only 1 element"),
});

export const InstagramButtonTemplateSchema = z.object({
	template_type: z.literal("button"),
	text: z.string().min(1).max(640, "Text must be between 1-640 characters"),
	buttons: z.array(InstagramButtonSchema).max(3, "Maximum 3 buttons for Instagram"),
});

export const InstagramTemplateSchema = z.discriminatedUnion("template_type", [
	InstagramGenericTemplateSchema,
	InstagramButtonTemplateSchema,
]);

// Conversion Rules Validation
export const ConversionRulesSchema = z.object({
	maxBodyLengthForGeneric: z.number().positive().default(80),
	maxBodyLengthForButton: z.number().positive().default(640),
	maxSubtitleLength: z.number().positive().default(80),
	maxTitleLength: z.number().positive().default(80),
	maxButtonsCount: z.number().positive().default(3),
});

// Conversion Result Validation
export const ConversionResultSchema = z.object({
	success: z.boolean(),
	templateType: z.enum(["generic", "button", "incompatible"]).optional(),
	instagramTemplate: InstagramTemplateSchema.optional(),
	error: z.string().optional(),
	warnings: z.array(z.string()).optional(),
	metadata: z
		.object({
			originalLength: z.number(),
			truncated: z.boolean(),
			buttonsRemoved: z.number(),
			conversionTime: z.number(),
		})
		.optional(),
});

// Database Query Validation
export const TemplateQueryParamsSchema = z.object({
	intentName: z.string().min(1),
	inboxId: z.string().min(1),
});

export const MensagemInterativaSchema = z.object({
	id: z.string(),
	headerTipo: z.string().nullable(),
	headerConteudo: z.string().nullable(),
	texto: z.string(),
	rodape: z.string().nullable(),
	botoes: z.array(
		z.object({
			id: z.string(),
			titulo: z.string(),
			tipo: z.string(),
			url: z.string().nullable(),
		}),
	),
});

// Webhook Request Validation
export const WebhookRequestSchema = z
	.object({
		queryResult: z.object({
			intent: z.object({
				displayName: z.string(),
			}),
		}),
		originalDetectIntentRequest: z.object({
			payload: z
				.object({
					channel_type: ChannelTypeSchema.optional(),
					from: z.object({
						phone: z.string(),
					}),
					conversation: z.object({
						id: z.string(),
					}),
					// Additional payload fields
				})
				.passthrough(),
		}),
		// Additional webhook fields
	})
	.passthrough();

// Response Validation
export const DialogflowResponseSchema = z.object({
	fulfillmentMessages: z.array(
		z.object({
			platform: z.string().optional(),
			payload: z.any().optional(),
			text: z
				.object({
					text: z.array(z.string()),
				})
				.optional(),
		}),
	),
});

// Error Response Validation
export const ErrorResponseSchema = z.object({
	success: z.literal(false),
	error: z.string(),
	errorCode: z.string(),
	fallbackAction: z.enum(["whatsapp_only", "retry", "skip"]),
	correlationId: z.string(),
	timestamp: z.date(),
});

// Validation Helper Functions
export function validateChannelType(payload: any): boolean {
	try {
		const result = DialogflowPayloadSchema.safeParse(payload);
		if (!result.success) return false;

		const channelType = result.data.originalDetectIntentRequest.payload.channel_type;
		return channelType === "Channel::Instagram";
	} catch {
		return false;
	}
}

export function validateWhatsAppTemplate(template: any): {
	success: boolean;
	data?: z.infer<typeof WhatsAppTemplateSchema>;
	errors?: z.ZodError;
} {
	const result = WhatsAppTemplateSchema.safeParse(template);

	if (result.success) {
		return { success: true, data: result.data };
	} else {
		return { success: false, errors: result.error };
	}
}

export function validateInstagramTemplate(template: any): {
	success: boolean;
	data?: z.infer<typeof InstagramTemplateSchema>;
	errors?: z.ZodError;
} {
	const result = InstagramTemplateSchema.safeParse(template);

	if (result.success) {
		return { success: true, data: result.data };
	} else {
		return { success: false, errors: result.error };
	}
}

export function validateConversionResult(result: any): {
	success: boolean;
	data?: z.infer<typeof ConversionResultSchema>;
	errors?: z.ZodError;
} {
	const validationResult = ConversionResultSchema.safeParse(result);

	if (validationResult.success) {
		return { success: true, data: validationResult.data };
	} else {
		return { success: false, errors: validationResult.error };
	}
}

// Character Limit Validation
export function validateCharacterLimits(
	text: string,
	type: "generic" | "button",
): {
	valid: boolean;
	length: number;
	maxLength: number;
	exceedsLimit: boolean;
} {
	const maxLength = type === "generic" ? 80 : 640;
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
export function validateButtonCount(buttons: any[]): {
	valid: boolean;
	count: number;
	maxCount: number;
	exceedsLimit: boolean;
} {
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
export function validateForInstagramConversion(template: any): {
	valid: boolean;
	templateType: "generic" | "button" | "incompatible";
	errors: string[];
	warnings: string[];
} {
	const errors: string[] = [];
	const warnings: string[] = [];

	// Validate basic template structure
	const templateValidation = validateWhatsAppTemplate(template);
	if (!templateValidation.success) {
		errors.push("Invalid WhatsApp template structure");
		return {
			valid: false,
			templateType: "incompatible",
			errors,
			warnings,
		};
	}

	const validTemplate = templateValidation.data!;

	// Determine template type based on text length
	const textLength = validTemplate.texto.length;
	let templateType: "generic" | "button" | "incompatible";

	if (textLength <= 80) {
		templateType = "generic";
	} else if (textLength <= 640) {
		templateType = "button";
	} else {
		templateType = "incompatible";
		errors.push(`Message text too long (${textLength} chars). Instagram supports max 640 characters.`);
	}

	// Validate button count
	const buttonValidation = validateButtonCount(validTemplate.botoes);
	if (!buttonValidation.valid) {
		warnings.push(`Too many buttons (${buttonValidation.count}). Only first 3 will be used for Instagram.`);
	}

	// Validate button types
	for (const button of validTemplate.botoes) {
		if (!["web_url", "postback"].includes(button.tipo)) {
			warnings.push(`Button type "${button.tipo}" not supported on Instagram. Will be converted to postback.`);
		}

		if (button.titulo.length > 20) {
			warnings.push(`Button title "${button.titulo}" too long. Will be truncated to 20 characters.`);
		}
	}

	// Validate footer for generic template
	if (templateType === "generic" && validTemplate.rodape && validTemplate.rodape.length > 80) {
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
export function validateJobData(data: any): {
	valid: boolean;
	errors: string[];
	sanitizedData?: any;
} {
	const errors: string[] = [];

	// Required fields validation
	if (!data.intentName || typeof data.intentName !== "string" || data.intentName.trim().length === 0) {
		errors.push("intentName is required and must be a non-empty string");
	}

	if (!data.inboxId || typeof data.inboxId !== "string" || data.inboxId.trim().length === 0) {
		errors.push("inboxId is required and must be a non-empty string");
	}

	if (!data.contactPhone || typeof data.contactPhone !== "string" || data.contactPhone.trim().length === 0) {
		errors.push("contactPhone is required and must be a non-empty string");
	}

	// Convert conversationId to string if it's a number, then validate
	const conversationIdStr = data.conversationId ? String(data.conversationId).trim() : "";
	if (!conversationIdStr || conversationIdStr.length === 0) {
		errors.push("conversationId is required and must be a non-empty string");
	}

	if (!data.correlationId || typeof data.correlationId !== "string" || data.correlationId.trim().length === 0) {
		errors.push("correlationId is required and must be a non-empty string");
	}

	if (!data.originalPayload || typeof data.originalPayload !== "object") {
		errors.push("originalPayload is required and must be an object");
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

export function validateCorrelationId(correlationId: any): {
	valid: boolean;
	error?: string;
	sanitized?: string;
} {
	if (!correlationId) {
		return { valid: false, error: "Correlation ID is required" };
	}

	if (typeof correlationId !== "string") {
		return { valid: false, error: "Correlation ID must be a string" };
	}

	const sanitized = correlationId.trim();

	if (sanitized.length === 0) {
		return { valid: false, error: "Correlation ID cannot be empty" };
	}

	if (sanitized.length > 100) {
		return { valid: false, error: "Correlation ID too long (max 100 characters)" };
	}

	// Check for valid characters (alphanumeric, hyphens, underscores)
	if (!/^[a-zA-Z0-9\-_]+$/.test(sanitized)) {
		return { valid: false, error: "Correlation ID contains invalid characters" };
	}

	return { valid: true, sanitized };
}

export function validateTimeout(timeoutMs: any): {
	valid: boolean;
	error?: string;
	sanitized?: number;
} {
	if (timeoutMs === undefined || timeoutMs === null) {
		return { valid: true, sanitized: 4500 }; // Default timeout
	}

	if (typeof timeoutMs !== "number") {
		return { valid: false, error: "Timeout must be a number" };
	}

	if (timeoutMs < 100) {
		return { valid: false, error: "Timeout too short (minimum 100ms)" };
	}

	if (timeoutMs > 30000) {
		return { valid: false, error: "Timeout too long (maximum 30 seconds)" };
	}

	return { valid: true, sanitized: Math.floor(timeoutMs) };
}

export function sanitizeErrorMessage(error: any): string {
	if (!error) {
		return "Unknown error occurred";
	}

	if (typeof error === "string") {
		return error.substring(0, 500); // Limit error message length
	}

	if (error instanceof Error) {
		return error.message.substring(0, 500);
	}

	if (typeof error === "object" && error.message) {
		return String(error.message).substring(0, 500);
	}

	return String(error).substring(0, 500);
}

// Security validation functions
export function validatePayloadSecurity(payload: any): {
	safe: boolean;
	issues: string[];
} {
	const issues: string[] = [];

	// Check for potential XSS patterns
	const xssPatterns = [/<script/i, /javascript:/i, /on\w+\s*=/i, /<iframe/i, /<object/i, /<embed/i];

	const payloadString = JSON.stringify(payload);

	for (const pattern of xssPatterns) {
		if (pattern.test(payloadString)) {
			issues.push(`Potential XSS pattern detected: ${pattern.source}`);
		}
	}

	// Check for SQL injection patterns
	const sqlPatterns = [/union\s+select/i, /drop\s+table/i, /delete\s+from/i, /insert\s+into/i, /update\s+set/i];

	for (const pattern of sqlPatterns) {
		if (pattern.test(payloadString)) {
			issues.push(`Potential SQL injection pattern detected: ${pattern.source}`);
		}
	}

	// Check payload size
	if (payloadString.length > 100000) {
		// 100KB limit
		issues.push("Payload too large (exceeds 100KB)");
	}

	return {
		safe: issues.length === 0,
		issues,
	};
}

// Rate limiting validation
export function validateRateLimit(
	inboxId: string,
	rateLimitMap: Map<string, number[]>,
): {
	allowed: boolean;
	reason?: string;
	retryAfter?: number;
} {
	const now = Date.now();
	const windowMs = 60000; // 1 minute window
	const maxRequests = 100; // Max 100 requests per minute per inbox

	if (!rateLimitMap.has(inboxId)) {
		rateLimitMap.set(inboxId, []);
	}

	const requests = rateLimitMap.get(inboxId)!;

	// Remove old requests outside the window
	const validRequests = requests.filter((timestamp) => now - timestamp < windowMs);
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

// Export all schemas and types
export type ChannelType = z.infer<typeof ChannelTypeSchema>;
export type WhatsAppTemplate = z.infer<typeof WhatsAppTemplateSchema>;
export type WhatsAppButton = z.infer<typeof WhatsAppButtonSchema>;
export type InstagramTemplate = z.infer<typeof InstagramTemplateSchema>;
export type InstagramButton = z.infer<typeof InstagramButtonSchema>;
export type ConversionResult = z.infer<typeof ConversionResultSchema>;
export type ConversionRules = z.infer<typeof ConversionRulesSchema>;
export type WebhookRequest = z.infer<typeof WebhookRequestSchema>;
export type DialogflowResponse = z.infer<typeof DialogflowResponseSchema>;
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;
