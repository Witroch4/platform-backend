/**
 * Runtime Configuration Validation Service
 *
 * Validates environment variables and configuration on bootstrap
 * with fail-fast behavior and health check endpoints.
 */

import { z } from "zod";
import log from "@/lib/log";

/**
 * Configuration validation schema
 */
const ConfigSchema = z.object({
	// Database
	DATABASE_URL: z.string().url("DATABASE_URL must be a valid PostgreSQL URL"),

	// Redis
	REDIS_URL: z.string().url("REDIS_URL must be a valid Redis URL"),

	// AI Services
	OPENAI_API_KEY: z.string().min(20, "OPENAI_API_KEY must be at least 20 characters"),
	OPENAI_MODEL_EMBEDDING: z.string().default("text-embedding-3-small"),
	OPENAI_MODEL_LLM: z.string().default("gpt-4o-mini"),
	OPENAI_TIMEOUT_MS: z.coerce.number().min(1000).max(60000).default(10000),

	// Chatwit Integration
	CHATWIT_BASE_URL: z.string().url("CHATWIT_BASE_URL must be a valid URL"),
	CHATWIT_ACCESS_TOKEN: z.string().min(10, "CHATWIT_ACCESS_TOKEN must be at least 10 characters"),
	CHATWIT_WEBHOOK_SECRET: z.string().min(16, "CHATWIT_WEBHOOK_SECRET must be at least 16 characters"),

	// Rate Limiting
	RL_CONV: z
		.string()
		.regex(/^\d+\/\d+s$/, 'RL_CONV must be in format "8/10s"')
		.default("8/10s"),
	RL_ACC: z
		.string()
		.regex(/^\d+\/\d+s$/, 'RL_ACC must be in format "80/10s"')
		.default("80/10s"),
	RL_CONTACT: z
		.string()
		.regex(/^\d+\/\d+s$/, 'RL_CONTACT must be in format "15/10s"')
		.default("15/10s"),

	// Cost Control
	TOKENS_DIA_CONTA: z.coerce.number().min(1000).default(100000),
	R_DIA_LIMITE: z.coerce.number().min(1).default(50),
	ECONOMIC_MODE_ENABLED: z.coerce.boolean().default(false),

	// Feature Flags
	FF_INTENTS_ENABLED: z.coerce.boolean().default(true),
	FF_DYNAMIC_LLM_ENABLED: z.coerce.boolean().default(true),
	FF_INTERACTIVE_MESSAGES_ENABLED: z.coerce.boolean().default(true),

	// Security
	PII_MASKING_SALT: z.string().min(16, "PII_MASKING_SALT must be at least 16 characters"),

	// Observability
	TRACE_ENABLED: z.coerce.boolean().default(true),
	METRICS_ENABLED: z.coerce.boolean().default(true),
	LOG_LEVEL: z.enum(["error", "warn", "info", "debug"]).default("info"),

	// Environment
	NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

	// Optional but recommended
	NEXTAUTH_SECRET: z.string().min(32).optional(),
	NEXTAUTH_URL: z.string().url().optional(),
});

/**
 * Interface for validation result
 */
export interface ConfigValidationResult {
	isValid: boolean;
	errors: string[];
	warnings: string[];
	missingOptional: string[];
	config?: z.infer<typeof ConfigSchema>;
}

/**
 * Interface for health check result
 */
export interface ConfigHealthResult {
	status: "healthy" | "degraded" | "unhealthy";
	checks: {
		[key: string]: {
			status: "pass" | "warn" | "fail";
			message: string;
			value?: string;
		};
	};
	timestamp: string;
	version: string;
}

/**
 * Validates configuration on bootstrap
 */
export function validateConfig(): ConfigValidationResult {
	try {
		log.info("Starting configuration validation");

		const errors: string[] = [];
		const warnings: string[] = [];
		const missingOptional: string[] = [];

		// Parse and validate configuration
		const result = ConfigSchema.safeParse(process.env);

		if (!result.success) {
			// Extract validation errors
			result.error.errors.forEach((error) => {
				const field = error.path.join(".");
				const message = `${field}: ${error.message}`;

				if (error.code === "invalid_type" && error.received === "undefined") {
					if (["NEXTAUTH_SECRET", "NEXTAUTH_URL"].includes(field)) {
						missingOptional.push(message);
					} else {
						errors.push(message);
					}
				} else {
					errors.push(message);
				}
			});
		}

		// Additional custom validations
		if (result.success) {
			const config = result.data;

			// Validate rate limiting format
			const rateLimitFields = ["RL_CONV", "RL_ACC", "RL_CONTACT"];
			rateLimitFields.forEach((field) => {
				const value = config[field as keyof typeof config] as string;
				const [requests, timeWindow] = value.split("/");
				const seconds = parseInt(timeWindow.replace("s", ""));

				if (parseInt(requests) > 1000) {
					warnings.push(`${field}: High rate limit (${requests} requests) may impact performance`);
				}

				if (seconds < 1 || seconds > 3600) {
					warnings.push(`${field}: Time window should be between 1s and 3600s`);
				}
			});

			// Validate cost limits
			if (config.TOKENS_DIA_CONTA > 1000000) {
				warnings.push("TOKENS_DIA_CONTA: Very high token limit may result in unexpected costs");
			}

			if (config.R_DIA_LIMITE > 500) {
				warnings.push("R_DIA_LIMITE: High daily cost limit may result in unexpected expenses");
			}

			// Validate production settings
			if (config.NODE_ENV === "production") {
				if (!process.env.NEXTAUTH_SECRET) {
					errors.push("NEXTAUTH_SECRET: Required in production environment");
				}

				if (!process.env.NEXTAUTH_URL) {
					errors.push("NEXTAUTH_URL: Required in production environment");
				}

				if (config.LOG_LEVEL === "debug") {
					warnings.push("LOG_LEVEL: Debug logging not recommended in production");
				}

				if (config.PII_MASKING_SALT === "default-salt-change-in-production") {
					errors.push("PII_MASKING_SALT: Must be changed from default value in production");
				}
			}

			// Validate OpenAI configuration
			if (!config.OPENAI_API_KEY.startsWith("sk-")) {
				warnings.push('OPENAI_API_KEY: Should start with "sk-" for OpenAI API keys');
			}

			// Validate Chatwit configuration
			if (config.CHATWIT_BASE_URL.includes("localhost") && config.NODE_ENV === "production") {
				warnings.push("CHATWIT_BASE_URL: Using localhost in production environment");
			}
		}

		const isValid = errors.length === 0;

		if (isValid) {
			log.info("Configuration validation passed", {
				warnings: warnings.length,
				missingOptional: missingOptional.length,
			});
		} else {
			log.error("Configuration validation failed", {
				errors: errors.length,
				warnings: warnings.length,
				missingOptional: missingOptional.length,
			});
		}

		return {
			isValid,
			errors,
			warnings,
			missingOptional,
			config: result.success ? result.data : undefined,
		};
	} catch (error) {
		log.error("Configuration validation error", { error });

		return {
			isValid: false,
			errors: [`Validation error: ${error instanceof Error ? error.message : "Unknown error"}`],
			warnings: [],
			missingOptional: [],
		};
	}
}

/**
 * Validates configuration and exits process if invalid (fail-fast)
 */
export function validateConfigOrExit(): z.infer<typeof ConfigSchema> {
	const result = validateConfig();

	if (!result.isValid) {
		console.error("❌ Configuration validation failed:");
		result.errors.forEach((error) => console.error(`  - ${error}`));

		if (result.warnings.length > 0) {
			console.warn("\n⚠️  Configuration warnings:");
			result.warnings.forEach((warning) => console.warn(`  - ${warning}`));
		}

		if (result.missingOptional.length > 0) {
			console.info("\nℹ️  Missing optional configuration:");
			result.missingOptional.forEach((missing) => console.info(`  - ${missing}`));
		}

		console.error("\n💥 Application startup aborted due to configuration errors.");
		process.exit(1);
	}

	if (result.warnings.length > 0) {
		console.warn("⚠️  Configuration warnings:");
		result.warnings.forEach((warning) => console.warn(`  - ${warning}`));
	}

	console.log("✅ Configuration validation passed");
	return result.config!;
}

/**
 * Performs health check on configuration
 */
export async function performConfigHealthCheck(): Promise<ConfigHealthResult> {
	const checks: ConfigHealthResult["checks"] = {};
	let overallStatus: "healthy" | "degraded" | "unhealthy" = "healthy";

	try {
		// Validate current configuration
		const validation = validateConfig();

		checks.configValidation = {
			status: validation.isValid ? "pass" : "fail",
			message: validation.isValid ? "Configuration is valid" : `${validation.errors.length} validation errors`,
			value: validation.isValid ? "valid" : "invalid",
		};

		if (!validation.isValid) {
			overallStatus = "unhealthy";
		} else if (validation.warnings.length > 0) {
			overallStatus = "degraded";
		}

		// Check critical environment variables
		const criticalVars = [
			"DATABASE_URL",
			"REDIS_URL",
			"OPENAI_API_KEY",
			"CHATWIT_ACCESS_TOKEN",
			"CHATWIT_WEBHOOK_SECRET",
		];

		criticalVars.forEach((varName) => {
			const value = process.env[varName];
			checks[`env_${varName.toLowerCase()}`] = {
				status: value ? "pass" : "fail",
				message: value ? "Present" : "Missing",
				value: value ? "***" : "undefined",
			};

			if (!value) {
				overallStatus = "unhealthy";
			}
		});

		// Check optional but recommended variables
		const recommendedVars = ["NEXTAUTH_SECRET", "NEXTAUTH_URL"];
		recommendedVars.forEach((varName) => {
			const value = process.env[varName];
			checks[`env_${varName.toLowerCase()}`] = {
				status: value ? "pass" : "warn",
				message: value ? "Present" : "Missing (recommended)",
				value: value ? "***" : "undefined",
			};

			if (!value && overallStatus === "healthy") {
				overallStatus = "degraded";
			}
		});

		// Check feature flags consistency
		const featureFlags = ["FF_INTENTS_ENABLED", "FF_DYNAMIC_LLM_ENABLED", "FF_INTERACTIVE_MESSAGES_ENABLED"];

		const enabledFlags = featureFlags.filter((flag) => process.env[flag] === "true" || process.env[flag] === "1");

		checks.featureFlags = {
			status: enabledFlags.length > 0 ? "pass" : "warn",
			message: `${enabledFlags.length}/${featureFlags.length} features enabled`,
			value: enabledFlags.join(", ") || "none",
		};

		// Check rate limiting configuration
		const rateLimits = ["RL_CONV", "RL_ACC", "RL_CONTACT"];
		const rateLimitStatus = rateLimits.every((rl) => {
			const value = process.env[rl];
			return value && /^\d+\/\d+s$/.test(value);
		});

		checks.rateLimiting = {
			status: rateLimitStatus ? "pass" : "fail",
			message: rateLimitStatus ? "Rate limits configured" : "Invalid rate limit format",
			value: rateLimits.map((rl) => `${rl}=${process.env[rl]}`).join(", "),
		};

		if (!rateLimitStatus) {
			overallStatus = "unhealthy";
		}

		// Check cost control settings
		const tokenLimit = parseInt(process.env.TOKENS_DIA_CONTA || "0");
		const costLimit = parseFloat(process.env.R_DIA_LIMITE || "0");

		checks.costControl = {
			status: tokenLimit > 0 && costLimit > 0 ? "pass" : "warn",
			message: tokenLimit > 0 && costLimit > 0 ? "Cost limits configured" : "Cost limits not set",
			value: `tokens: ${tokenLimit}, cost: R$${costLimit}`,
		};

		return {
			status: overallStatus,
			checks,
			timestamp: new Date().toISOString(),
			version: process.env.npm_package_version || "1.0.0",
		};
	} catch (error) {
		log.error("Config health check failed", { error });

		return {
			status: "unhealthy",
			checks: {
				healthCheck: {
					status: "fail",
					message: `Health check error: ${error instanceof Error ? error.message : "Unknown error"}`,
				},
			},
			timestamp: new Date().toISOString(),
			version: process.env.npm_package_version || "1.0.0",
		};
	}
}

/**
 * Gets configuration summary for admin interface
 */
export function getConfigSummary(): {
	environment: string;
	features: Record<string, boolean>;
	limits: Record<string, string | number>;
	services: Record<string, string>;
	security: Record<string, boolean>;
} {
	return {
		environment: process.env.NODE_ENV || "development",
		features: {
			intentsEnabled: process.env.FF_INTENTS_ENABLED === "true",
			dynamicLlmEnabled: process.env.FF_DYNAMIC_LLM_ENABLED === "true",
			interactiveMessagesEnabled: process.env.FF_INTERACTIVE_MESSAGES_ENABLED === "true",
			economicModeEnabled: process.env.ECONOMIC_MODE_ENABLED === "true",
			tracingEnabled: process.env.TRACE_ENABLED === "true",
			metricsEnabled: process.env.METRICS_ENABLED === "true",
		},
		limits: {
			tokensPerDay: parseInt(process.env.TOKENS_DIA_CONTA || "100000"),
			costPerDay: parseFloat(process.env.R_DIA_LIMITE || "50"),
			conversationRateLimit: process.env.RL_CONV || "8/10s",
			accountRateLimit: process.env.RL_ACC || "80/10s",
			contactRateLimit: process.env.RL_CONTACT || "15/10s",
			openaiTimeout: parseInt(process.env.OPENAI_TIMEOUT_MS || "10000"),
		},
		services: {
			openaiModel: process.env.OPENAI_MODEL_LLM || "gpt-4o-mini",
			embeddingModel: process.env.OPENAI_MODEL_EMBEDDING || "text-embedding-3-small",
			chatwitBaseUrl: process.env.CHATWIT_BASE_URL || "not-configured",
			logLevel: process.env.LOG_LEVEL || "info",
		},
		security: {
			piiMaskingEnabled: !!process.env.PII_MASKING_SALT,
			webhookSecretConfigured: !!process.env.CHATWIT_WEBHOOK_SECRET,
			nextAuthConfigured: !!process.env.NEXTAUTH_SECRET,
		},
	};
}

/**
 * Validates a specific configuration value
 */
export function validateConfigValue(
	key: string,
	value: string,
): {
	isValid: boolean;
	error?: string;
	warning?: string;
} {
	try {
		// Create a partial schema for the specific key
		const fieldSchema = ConfigSchema.shape[key as keyof typeof ConfigSchema.shape];

		if (!fieldSchema) {
			return {
				isValid: false,
				error: `Unknown configuration key: ${key}`,
			};
		}

		const result = fieldSchema.safeParse(value);

		if (!result.success) {
			return {
				isValid: false,
				error: result.error.errors[0]?.message || "Validation failed",
			};
		}

		// Additional warnings for specific fields
		let warning: string | undefined;

		if (key === "OPENAI_API_KEY" && !value.startsWith("sk-")) {
			warning = 'OpenAI API key should start with "sk-"';
		}

		if (key === "LOG_LEVEL" && value === "debug" && process.env.NODE_ENV === "production") {
			warning = "Debug logging not recommended in production";
		}

		return {
			isValid: true,
			warning,
		};
	} catch (error) {
		return {
			isValid: false,
			error: `Validation error: ${error instanceof Error ? error.message : "Unknown error"}`,
		};
	}
}
