/**
 * Configuration Bootstrap
 *
 * Validates configuration on application startup with fail-fast behavior.
 * Should be called early in the application lifecycle.
 */

import { validateConfigOrExit } from "../services/config-validation";
import log from "@/lib/log";

/**
 * Validated configuration instance
 */
let validatedConfig: ReturnType<typeof validateConfigOrExit> | null = null;

/**
 * Bootstraps and validates configuration
 *
 * This function should be called once during application startup.
 * It will validate all required configuration and exit the process
 * if any critical configuration is missing or invalid.
 */
export function bootstrapConfig() {
	if (validatedConfig) {
		log.warn("Configuration already bootstrapped, skipping validation");
		return validatedConfig;
	}

	try {
		log.info("Bootstrapping AI integration configuration...");

		// Validate configuration with fail-fast behavior
		validatedConfig = validateConfigOrExit();

		// Log successful bootstrap
		log.info("Configuration bootstrap completed successfully", {
			environment: validatedConfig.NODE_ENV,
			features: {
				intents: validatedConfig.FF_INTENTS_ENABLED,
				dynamicLlm: validatedConfig.FF_DYNAMIC_LLM_ENABLED,
				interactiveMessages: validatedConfig.FF_INTERACTIVE_MESSAGES_ENABLED,
				economicMode: validatedConfig.ECONOMIC_MODE_ENABLED,
			},
			services: {
				openaiModel: validatedConfig.OPENAI_MODEL_LLM,
				embeddingModel: validatedConfig.OPENAI_MODEL_EMBEDDING,
				chatwitConfigured: !!validatedConfig.CHATWIT_BASE_URL,
			},
		});

		return validatedConfig;
	} catch (error) {
		log.error("Configuration bootstrap failed", { error });

		// This should not happen as validateConfigOrExit handles errors,
		// but we include it for completeness
		console.error("💥 Unexpected error during configuration bootstrap");
		console.error(error);
		process.exit(1);
	}
}

/**
 * Gets the validated configuration
 *
 * Returns the configuration that was validated during bootstrap.
 * Throws an error if bootstrap hasn't been called yet.
 */
export function getValidatedConfig() {
	if (!validatedConfig) {
		throw new Error("Configuration not bootstrapped. Call bootstrapConfig() first.");
	}

	return validatedConfig;
}

/**
 * Checks if configuration has been bootstrapped
 */
export function isConfigBootstrapped(): boolean {
	return validatedConfig !== null;
}

/**
 * Re-validates configuration (for hot reloading in development)
 */
export function revalidateConfig() {
	log.info("Re-validating configuration...");

	validatedConfig = null;
	return bootstrapConfig();
}

/**
 * Gets specific configuration values with type safety
 */
export function getConfigValue<K extends keyof ReturnType<typeof validateConfigOrExit>>(
	key: K,
): ReturnType<typeof validateConfigOrExit>[K] {
	const config = getValidatedConfig();
	return config[key];
}

/**
 * Checks if a feature flag is enabled
 */
export function isFeatureEnabled(feature: "intents" | "dynamicLlm" | "interactiveMessages" | "economicMode"): boolean {
	const config = getValidatedConfig();

	switch (feature) {
		case "intents":
			return config.FF_INTENTS_ENABLED;
		case "dynamicLlm":
			return config.FF_DYNAMIC_LLM_ENABLED;
		case "interactiveMessages":
			return config.FF_INTERACTIVE_MESSAGES_ENABLED;
		case "economicMode":
			return config.ECONOMIC_MODE_ENABLED;
		default:
			return false;
	}
}

/**
 * Gets rate limiting configuration
 */
export function getRateLimitConfig(): {
	conversation: { requests: number; windowSeconds: number };
	account: { requests: number; windowSeconds: number };
	contact: { requests: number; windowSeconds: number };
} {
	const config = getValidatedConfig();

	const parseRateLimit = (value: string) => {
		const [requests, timeWindow] = value.split("/");
		const windowSeconds = parseInt(timeWindow.replace("s", ""));
		return { requests: parseInt(requests), windowSeconds };
	};

	return {
		conversation: parseRateLimit(config.RL_CONV),
		account: parseRateLimit(config.RL_ACC),
		contact: parseRateLimit(config.RL_CONTACT),
	};
}

/**
 * Gets cost control configuration
 */
export function getCostControlConfig(): {
	tokensPerDay: number;
	costPerDay: number;
	economicModeEnabled: boolean;
} {
	const config = getValidatedConfig();

	return {
		tokensPerDay: config.TOKENS_DIA_CONTA,
		costPerDay: config.R_DIA_LIMITE,
		economicModeEnabled: config.ECONOMIC_MODE_ENABLED,
	};
}

/**
 * Gets OpenAI configuration
 */
export function getOpenAIConfig(): {
	apiKey: string;
	embeddingModel: string;
	llmModel: string;
	timeoutMs: number;
} {
	const config = getValidatedConfig();

	return {
		apiKey: config.OPENAI_API_KEY,
		embeddingModel: config.OPENAI_MODEL_EMBEDDING,
		llmModel: config.OPENAI_MODEL_LLM,
		timeoutMs: config.OPENAI_TIMEOUT_MS,
	};
}

/**
 * Gets Chatwit configuration
 */
export function getChatwitConfig(): {
	baseUrl: string;
	accessToken: string;
	webhookSecret: string;
} {
	const config = getValidatedConfig();

	return {
		baseUrl: config.CHATWIT_BASE_URL,
		accessToken: config.CHATWIT_ACCESS_TOKEN,
		webhookSecret: config.CHATWIT_WEBHOOK_SECRET,
	};
}

/**
 * Gets security configuration
 */
export function getSecurityConfig(): {
	piiMaskingSalt: string;
	traceEnabled: boolean;
	metricsEnabled: boolean;
	logLevel: string;
} {
	const config = getValidatedConfig();

	return {
		piiMaskingSalt: config.PII_MASKING_SALT,
		traceEnabled: config.TRACE_ENABLED,
		metricsEnabled: config.METRICS_ENABLED,
		logLevel: config.LOG_LEVEL,
	};
}

/**
 * Validates that all required services are accessible
 *
 * This function can be called after bootstrap to verify that
 * external services are reachable with the provided configuration.
 */
export async function validateServiceConnectivity(): Promise<{
	database: boolean;
	redis: boolean;
	openai: boolean;
	chatwit: boolean;
	errors: string[];
}> {
	const config = getValidatedConfig();
	const errors: string[] = [];
	let database = false;
	let redis = false;
	let openai = false;
	let chatwit = false;

	try {
		// Test database connection
		try {
			const { getPrismaInstance } = await import("@/lib/connections");
			const prisma = getPrismaInstance();
			await prisma.$queryRaw`SELECT 1`;
			database = true;
			log.info("Database connectivity verified");
		} catch (error) {
			errors.push(`Database connection failed: ${error instanceof Error ? error.message : "Unknown error"}`);
		}

		// Test Redis connection
		try {
			const { getRedisInstance } = await import("@/lib/connections");
			const redisInstance = getRedisInstance();
			await redisInstance.ping();
			redis = true;
			log.info("Redis connectivity verified");
		} catch (error) {
			errors.push(`Redis connection failed: ${error instanceof Error ? error.message : "Unknown error"}`);
		}

		// Test OpenAI API
		try {
			const controller = new AbortController();
			const timeoutId = setTimeout(() => controller.abort(), 10000);

			const response = await fetch("https://api.openai.com/v1/models", {
				headers: {
					Authorization: `Bearer ${config.OPENAI_API_KEY}`,
					"User-Agent": "SocialWise-ConfigValidation/1.0",
				},
				signal: controller.signal,
			});

			clearTimeout(timeoutId);

			if (response.ok) {
				openai = true;
				log.info("OpenAI API connectivity verified");
			} else {
				errors.push(`OpenAI API returned status ${response.status}`);
			}
		} catch (error) {
			errors.push(`OpenAI API connection failed: ${error instanceof Error ? error.message : "Unknown error"}`);
		}

		// Test Chatwit API
		try {
			const controller = new AbortController();
			const timeoutId = setTimeout(() => controller.abort(), 10000);

			const response = await fetch(`${config.CHATWIT_BASE_URL}/api/v1/accounts`, {
				headers: {
					Authorization: `Bearer ${config.CHATWIT_ACCESS_TOKEN}`,
					"User-Agent": "SocialWise-ConfigValidation/1.0",
				},
				signal: controller.signal,
			});

			clearTimeout(timeoutId);

			if (response.ok) {
				chatwit = true;
				log.info("Chatwit API connectivity verified");
			} else {
				errors.push(`Chatwit API returned status ${response.status}`);
			}
		} catch (error) {
			errors.push(`Chatwit API connection failed: ${error instanceof Error ? error.message : "Unknown error"}`);
		}
	} catch (error) {
		errors.push(`Service connectivity check failed: ${error instanceof Error ? error.message : "Unknown error"}`);
	}

	const allServicesHealthy = database && redis && openai && chatwit;

	log.info("Service connectivity check completed", {
		database,
		redis,
		openai,
		chatwit,
		allHealthy: allServicesHealthy,
		errorCount: errors.length,
	});

	return { database, redis, openai, chatwit, errors };
}
