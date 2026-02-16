/**
 * Zod schemas for LLM and dynamic generation validation
 * Based on requirements 13.1, 13.2
 */

import { z } from "zod";

export const LlmAuditSchema = z.object({
	id: z.string().min(1),
	conversationId: z.string().min(1),
	messageId: z.string().min(1),
	mode: z.enum(["INTENT_CLASSIFY", "DYNAMIC_GENERATE"]),
	inputText: z.string().min(1), // PII mascarado
	resultJson: z.any(),
	score: z.number().min(0).max(1).optional(),
	traceId: z.string().optional(),
	createdAt: z.date(),
	expiresAt: z.date(),
});

export const DynamicGenerationResultSchema = z.object({
	text: z.string().min(1),
	buttons: z
		.array(
			z.object({
				type: z.literal("reply"),
				title: z.string().min(1).max(20),
				id: z.string().min(1).max(256),
			}),
		)
		.optional(),
	header: z
		.object({
			type: z.enum(["text", "image", "video", "document"]),
			text: z.string().optional(),
			link: z.string().url().optional(),
		})
		.optional(),
	footer: z.string().optional(),
});

export const LlmPromptContextSchema = z.object({
	userMessage: z.string().min(1),
	conversationHistory: z.array(z.string()).optional(),
	channel: z.enum(["whatsapp", "instagram", "messenger"]),
	accountId: z.number().int().positive(),
	conversationId: z.number().int().positive(),
	economicMode: z.boolean(),
});

export const LlmResponseSchema = z.object({
	success: z.boolean(),
	result: z.any().optional(),
	error: z.string().optional(),
	tokensUsed: z.number().int().nonnegative(),
	model: z.string().min(1),
	latencyMs: z.number().nonnegative(),
	cached: z.boolean(),
});

export const CircuitBreakerStateSchema = z.object({
	state: z.enum(["CLOSED", "OPEN", "HALF_OPEN"]),
	failureCount: z.number().int().nonnegative(),
	lastFailureTime: z.number().int().nonnegative(),
	nextAttemptTime: z.number().int().nonnegative(),
});

export const LlmConfigSchema = z.object({
	model: z.string().min(1),
	maxTokens: z.number().int().positive(),
	temperature: z.number().min(0).max(2),
	timeoutMs: z.number().int().positive(),
	retryAttempts: z.number().int().nonnegative(),
	circuitBreaker: z.object({
		failureThreshold: z.number().int().positive(),
		recoveryTimeout: z.number().int().positive(),
		monitoringWindow: z.number().int().positive(),
	}),
});

export const ConversationContextSchema = z.object({
	conversationId: z.number().int().positive(),
	messages: z.array(
		z.object({
			role: z.enum(["user", "assistant"]),
			content: z.string().min(1),
			timestamp: z.number().int().positive(),
		}),
	),
	ttl: z.number().int().positive(),
	lastUpdated: z.date(),
});

// Type inference
export type LlmAuditType = z.infer<typeof LlmAuditSchema>;
export type DynamicGenerationResultType = z.infer<typeof DynamicGenerationResultSchema>;
export type LlmPromptContextType = z.infer<typeof LlmPromptContextSchema>;
export type LlmResponseType = z.infer<typeof LlmResponseSchema>;
export type CircuitBreakerStateType = z.infer<typeof CircuitBreakerStateSchema>;
export type LlmConfigType = z.infer<typeof LlmConfigSchema>;
export type ConversationContextType = z.infer<typeof ConversationContextSchema>;
