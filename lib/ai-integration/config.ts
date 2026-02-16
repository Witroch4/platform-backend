/**
 * Configuration for AI Integration
 * Based on requirements 13.1, 13.2
 */

import { z } from "zod";

const AiIntegrationConfigSchema = z.object({
	// Core settings
	chatwit: z.object({
		baseUrl: z.string().url(),
		accessToken: z.string().min(1),
		webhookSecret: z.string().min(1),
	}),

	// OpenAI settings
	openai: z.object({
		apiKey: z.string().min(1),
		modelEmbedding: z.string().default("text-embedding-3-small"),
		modelLlm: z.string().default("gpt-4o-mini"),
		timeoutMs: z.number().int().positive().default(10000),
	}),

	// Rate limiting
	rateLimits: z.object({
		conversation: z
			.string()
			.regex(/^\d+\/\d+s$/)
			.default("8/10s"),
		account: z
			.string()
			.regex(/^\d+\/\d+s$/)
			.default("80/10s"),
		contact: z
			.string()
			.regex(/^\d+\/\d+s$/)
			.default("15/10s"),
	}),

	// Cost control
	costControl: z.object({
		tokensPerDayPerAccount: z.number().int().positive().default(100000),
		dailyBudgetLimit: z.number().positive().default(50.0),
		economicModeEnabled: z.boolean().default(false),
	}),

	// Feature flags
	featureFlags: z.object({
		intentsEnabled: z.boolean().default(true),
		dynamicLlmEnabled: z.boolean().default(true),
		interactiveMessagesEnabled: z.boolean().default(true),
	}),

	// Observability
	observability: z.object({
		traceEnabled: z.boolean().default(true),
		metricsEnabled: z.boolean().default(true),
		logLevel: z.enum(["debug", "info", "warn", "error"]).default("info"),
	}),
});

export type AiIntegrationConfig = z.infer<typeof AiIntegrationConfigSchema>;

export function loadAiIntegrationConfig(): AiIntegrationConfig {
	const config = {
		chatwit: {
			baseUrl: process.env.CHATWIT_BASE_URL || "",
			accessToken: process.env.CHATWIT_ACCESS_TOKEN || "",
			webhookSecret: process.env.CHATWIT_WEBHOOK_SECRET || "",
		},
		openai: {
			apiKey: process.env.OPENAI_API_KEY || "",
			modelEmbedding: process.env.OPENAI_MODEL_EMBEDDING || "text-embedding-3-small",
			modelLlm: process.env.OPENAI_MODEL_LLM || "gpt-4o-mini",
			timeoutMs: parseInt(process.env.OPENAI_TIMEOUT_MS || "10000"),
		},
		rateLimits: {
			conversation: process.env.RL_CONV || "8/10s",
			account: process.env.RL_ACC || "80/10s",
			contact: process.env.RL_CONTACT || "15/10s",
		},
		costControl: {
			tokensPerDayPerAccount: parseInt(process.env.TOKENS_DIA_CONTA || "100000"),
			dailyBudgetLimit: parseFloat(process.env.R_DIA_LIMITE || "50.0"),
			economicModeEnabled: process.env.ECONOMIC_MODE_ENABLED === "true",
		},
		featureFlags: {
			intentsEnabled: process.env.FF_INTENTS_ENABLED !== "false",
			dynamicLlmEnabled: process.env.FF_DYNAMIC_LLM_ENABLED !== "false",
			interactiveMessagesEnabled: process.env.FF_INTERACTIVE_MESSAGES_ENABLED !== "false",
		},
		observability: {
			traceEnabled: process.env.TRACE_ENABLED !== "false",
			metricsEnabled: process.env.METRICS_ENABLED !== "false",
			logLevel: (process.env.LOG_LEVEL as any) || "info",
		},
	};

	return AiIntegrationConfigSchema.parse(config);
}

export function parseRateLimit(rateLimitStr: string): { limit: number; window: number } {
	const match = rateLimitStr.match(/^(\d+)\/(\d+)s$/);
	if (!match) {
		throw new Error(`Invalid rate limit format: ${rateLimitStr}`);
	}
	return {
		limit: parseInt(match[1]),
		window: parseInt(match[2]),
	};
}
