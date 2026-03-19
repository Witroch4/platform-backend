/**
 * Centralised Configuration System
 * Loads config.yml with environment variable overrides
 */

import { readFileSync } from "fs";
import { join } from "path";
import * as yaml from "js-yaml";
import { createLogger } from "@/lib/utils/logger";

const configLogger = createLogger("Config");

export interface SocialwiseFlowConfig {
	concurrency: {
		max_concurrent_llm_calls_per_inbox: number;
		max_concurrent_llm_calls_global: number;
		queue_timeout_ms: number;
		degradation_enabled: boolean;
	};
}

export interface DatabaseConfig {
	connection_limit: number;
	pool_timeout: number;
	query_timeout: number;
}

export interface RedisConfig {
	max_retries: number;
	connect_timeout: number;
	command_timeout: number;
	keepalive: number;
}

export interface WorkersConfig {
	leads_chatwit: {
		concurrency: number;
		lock_duration: number;
	};
}

export interface ApplicationConfig {
	log_level: string;
	health_check_timeout: number;
	health_check_interval: number;
}

export interface WebhooksConfig {
	direct_processing: boolean;
}

export interface ContainerConfig {
	memory_limit: string;
	cpu_limit: string;
}

export interface OabEvalConfig {
	agentelocal: boolean;
	transcribe_concurrency: number;
	agentelocal_espelho?: boolean;
	mirror_concurrency?: number;
	runtime_defaults?: {
		transcription?: {
			max_output_tokens?: number;
			timeout_ms?: number;
			retry_attempts?: number;
			retry_base_delay_ms?: number;
			retry_max_delay_ms?: number;
		};
		mirror?: {
			max_output_tokens?: number;
			timeout_ms?: number;
			retry_attempts?: number;
			retry_base_delay_ms?: number;
			retry_max_delay_ms?: number;
		};
		analysis?: {
			max_output_tokens?: number;
			timeout_ms?: number;
			retry_attempts?: number;
			retry_base_delay_ms?: number;
			retry_max_delay_ms?: number;
		};
	};
	queue?: {
		name?: string;
		max_concurrent_jobs?: number;
		job_timeout?: number;
		retry_attempts?: number;
		retry_backoff_ms?: number;
		rate_limit_max?: number;
		rate_limit_duration_ms?: number;
	};
	debug?: {
		enabled?: boolean;
		log_prompts?: boolean;
		log_tokens?: boolean;
		dump_payload?: boolean;
	};
}

export interface AppConfig {
	socialwise_flow: SocialwiseFlowConfig;
	database: DatabaseConfig;
	redis: RedisConfig;
	workers: WorkersConfig;
	application: ApplicationConfig;
	webhooks: WebhooksConfig;
	container: ContainerConfig;
	oab_eval?: OabEvalConfig;
}

class ConfigManager {
	private static instance: ConfigManager;
	private config: AppConfig | null = null;
	private configPath = join(process.cwd(), "config.yml");

	private constructor() {}

	public static getInstance(): ConfigManager {
		if (!ConfigManager.instance) {
			ConfigManager.instance = new ConfigManager();
		}
		return ConfigManager.instance;
	}

	/**
	 * Load configuration from config.yml with environment variable overrides
	 */
	public loadConfig(): AppConfig {
		if (this.config) {
			return this.config;
		}

		try {
			// Load YAML config
			const yamlContent = readFileSync(this.configPath, "utf8");
			const yamlConfig = yaml.load(yamlContent) as AppConfig;

			// Apply environment variable overrides
			this.config = this.applyEnvOverrides(yamlConfig);

			configLogger.info("Configuration loaded successfully", {
				source: "config.yml",
				overrides: this.getAppliedOverrides(),
			});

			return this.config;
		} catch (error) {
			configLogger.error("Failed to load config.yml, falling back to environment variables only", {
				error: error instanceof Error ? error.message : String(error),
			});

			// Fallback to pure environment variables
			this.config = this.createFallbackConfig();
			return this.config;
		}
	}

	/**
	 * Apply environment variable overrides to YAML config
	 */
	private applyEnvOverrides(yamlConfig: AppConfig): AppConfig {
		const config = JSON.parse(JSON.stringify(yamlConfig)); // Deep clone

		if (!config.oab_eval) {
			config.oab_eval = { agentelocal: false, transcribe_concurrency: 10 };
		}

		if (!config.oab_eval.queue) {
			config.oab_eval.queue = {};
		}

		if (!config.oab_eval.runtime_defaults) {
			config.oab_eval.runtime_defaults = {};
		}

		for (const stage of ["transcription", "mirror", "analysis"] as const) {
			if (!config.oab_eval.runtime_defaults[stage]) {
				config.oab_eval.runtime_defaults[stage] = {};
			}
		}

		// SocialWise Flow overrides
		if (process.env.SOCIALWISE_CONCURRENCY_LIMIT) {
			config.socialwise_flow.concurrency.max_concurrent_llm_calls_per_inbox = parseInt(
				process.env.SOCIALWISE_CONCURRENCY_LIMIT,
				10,
			);
		}

		if (process.env.SOCIALWISE_GLOBAL_CONCURRENCY_LIMIT) {
			config.socialwise_flow.concurrency.max_concurrent_llm_calls_global = parseInt(
				process.env.SOCIALWISE_GLOBAL_CONCURRENCY_LIMIT,
				10,
			);
		}

		if (process.env.SOCIALWISE_QUEUE_TIMEOUT_MS) {
			config.socialwise_flow.concurrency.queue_timeout_ms = parseInt(process.env.SOCIALWISE_QUEUE_TIMEOUT_MS, 10);
		}

		if (process.env.SOCIALWISE_DEGRADATION_ENABLED !== undefined) {
			config.socialwise_flow.concurrency.degradation_enabled = process.env.SOCIALWISE_DEGRADATION_ENABLED !== "false";
		}

		// Database overrides
		if (process.env.DATABASE_CONNECTION_LIMIT) {
			config.database.connection_limit = parseInt(process.env.DATABASE_CONNECTION_LIMIT, 10);
		}

		if (process.env.DATABASE_POOL_TIMEOUT) {
			config.database.pool_timeout = parseInt(process.env.DATABASE_POOL_TIMEOUT, 10);
		}

		if (process.env.DATABASE_QUERY_TIMEOUT) {
			config.database.query_timeout = parseInt(process.env.DATABASE_QUERY_TIMEOUT, 10);
		}

		// Redis overrides
		if (process.env.REDIS_MAX_RETRIES) {
			config.redis.max_retries = parseInt(process.env.REDIS_MAX_RETRIES, 10);
		}

		if (process.env.REDIS_CONNECT_TIMEOUT) {
			config.redis.connect_timeout = parseInt(process.env.REDIS_CONNECT_TIMEOUT, 10);
		}

		if (process.env.REDIS_COMMAND_TIMEOUT) {
			config.redis.command_timeout = parseInt(process.env.REDIS_COMMAND_TIMEOUT, 10);
		}

		if (process.env.REDIS_KEEPALIVE) {
			config.redis.keepalive = parseInt(process.env.REDIS_KEEPALIVE, 10);
		}

		// Workers overrides
		if (process.env.LEADS_CHATWIT_CONCURRENCY) {
			config.workers.leads_chatwit.concurrency = parseInt(process.env.LEADS_CHATWIT_CONCURRENCY, 10);
		}

		if (process.env.LEADS_CHATWIT_LOCK_DURATION) {
			config.workers.leads_chatwit.lock_duration = parseInt(process.env.LEADS_CHATWIT_LOCK_DURATION, 10);
		}

		// Application overrides
		if (process.env.LOG_LEVEL) {
			config.application.log_level = process.env.LOG_LEVEL;
		}

		if (process.env.HEALTH_CHECK_TIMEOUT) {
			config.application.health_check_timeout = parseInt(process.env.HEALTH_CHECK_TIMEOUT, 10);
		}

		if (process.env.HEALTH_CHECK_INTERVAL) {
			config.application.health_check_interval = parseInt(process.env.HEALTH_CHECK_INTERVAL, 10);
		}

		// Webhooks overrides
		if (process.env.WEBHOOK_DIRECT_PROCESSING !== undefined) {
			config.webhooks.direct_processing = process.env.WEBHOOK_DIRECT_PROCESSING === "true";
		}

		if (process.env.OAB_EVAL_AGENT_LOCAL !== undefined) {
			config.oab_eval.agentelocal = process.env.OAB_EVAL_AGENT_LOCAL === "true";
		}

		// ⭐ CORREÇÃO: Aplicar override para agentelocal_espelho
		if (process.env.OAB_EVAL_AGENT_LOCAL_ESPELHO !== undefined) {
			config.oab_eval.agentelocal_espelho = process.env.OAB_EVAL_AGENT_LOCAL_ESPELHO === "true";
		}

		if (process.env.OAB_EVAL_TRANSCRIBE_CONCURRENCY) {
			const n = parseInt(process.env.OAB_EVAL_TRANSCRIBE_CONCURRENCY, 10);
			if (!Number.isNaN(n) && n > 0) config.oab_eval.transcribe_concurrency = n;
		}

		// Aplicar override para mirror_concurrency
		if (process.env.OAB_EVAL_MIRROR_CONCURRENCY) {
			const n = parseInt(process.env.OAB_EVAL_MIRROR_CONCURRENCY, 10);
			if (!Number.isNaN(n) && n > 0) config.oab_eval.mirror_concurrency = n;
		}

		if (process.env.OAB_EVAL_MAX_CONCURRENT_JOBS) {
			const n = parseInt(process.env.OAB_EVAL_MAX_CONCURRENT_JOBS, 10);
			if (!Number.isNaN(n) && n > 0) config.oab_eval.queue.max_concurrent_jobs = n;
		}

		if (process.env.OAB_EVAL_RETRY_ATTEMPTS) {
			const n = parseInt(process.env.OAB_EVAL_RETRY_ATTEMPTS, 10);
			if (!Number.isNaN(n) && n > 0) config.oab_eval.queue.retry_attempts = n;
		}

		if (process.env.OAB_EVAL_RETRY_BACKOFF_MS) {
			const n = parseInt(process.env.OAB_EVAL_RETRY_BACKOFF_MS, 10);
			if (!Number.isNaN(n) && n > 0) config.oab_eval.queue.retry_backoff_ms = n;
		}

		if (process.env.OAB_EVAL_RATE_LIMIT_MAX) {
			const n = parseInt(process.env.OAB_EVAL_RATE_LIMIT_MAX, 10);
			if (!Number.isNaN(n) && n > 0) config.oab_eval.queue.rate_limit_max = n;
		}

		if (process.env.OAB_EVAL_RATE_LIMIT_DURATION_MS) {
			const n = parseInt(process.env.OAB_EVAL_RATE_LIMIT_DURATION_MS, 10);
			if (!Number.isNaN(n) && n > 0) config.oab_eval.queue.rate_limit_duration_ms = n;
		}

		const runtimeEnvMap = [
			["transcription", "max_output_tokens", process.env.OAB_EVAL_TRANSCRIPTION_MAX_OUTPUT_TOKENS],
			["transcription", "timeout_ms", process.env.OAB_EVAL_TRANSCRIPTION_TIMEOUT_MS],
			["transcription", "retry_attempts", process.env.OAB_EVAL_TRANSCRIPTION_RETRY_ATTEMPTS],
			["transcription", "retry_base_delay_ms", process.env.OAB_EVAL_TRANSCRIPTION_RETRY_BASE_DELAY_MS],
			["transcription", "retry_max_delay_ms", process.env.OAB_EVAL_TRANSCRIPTION_RETRY_MAX_DELAY_MS],
			["mirror", "max_output_tokens", process.env.OAB_EVAL_MIRROR_MAX_OUTPUT_TOKENS],
			["mirror", "timeout_ms", process.env.OAB_EVAL_MIRROR_TIMEOUT_MS],
			["mirror", "retry_attempts", process.env.OAB_EVAL_MIRROR_RETRY_ATTEMPTS],
			["mirror", "retry_base_delay_ms", process.env.OAB_EVAL_MIRROR_RETRY_BASE_DELAY_MS],
			["mirror", "retry_max_delay_ms", process.env.OAB_EVAL_MIRROR_RETRY_MAX_DELAY_MS],
			["analysis", "max_output_tokens", process.env.OAB_EVAL_ANALYSIS_MAX_OUTPUT_TOKENS],
			["analysis", "timeout_ms", process.env.OAB_EVAL_ANALYSIS_TIMEOUT_MS],
			["analysis", "retry_attempts", process.env.OAB_EVAL_ANALYSIS_RETRY_ATTEMPTS],
			["analysis", "retry_base_delay_ms", process.env.OAB_EVAL_ANALYSIS_RETRY_BASE_DELAY_MS],
			["analysis", "retry_max_delay_ms", process.env.OAB_EVAL_ANALYSIS_RETRY_MAX_DELAY_MS],
		] as const;

		for (const [stage, field, value] of runtimeEnvMap) {
			if (!value) continue;
			const parsed = parseInt(value, 10);
			if (!Number.isNaN(parsed) && parsed > 0) {
				config.oab_eval.runtime_defaults[stage]![field] = parsed;
			}
		}

		return config;
	}

	/**
	 * Create fallback configuration from environment variables only
	 */
	private createFallbackConfig(): AppConfig {
		return {
			socialwise_flow: {
				concurrency: {
					max_concurrent_llm_calls_per_inbox: parseInt(process.env.SOCIALWISE_CONCURRENCY_LIMIT || "100", 10),
					max_concurrent_llm_calls_global: parseInt(process.env.SOCIALWISE_GLOBAL_CONCURRENCY_LIMIT || "300", 10),
					queue_timeout_ms: parseInt(process.env.SOCIALWISE_QUEUE_TIMEOUT_MS || "5000", 10),
					degradation_enabled: process.env.SOCIALWISE_DEGRADATION_ENABLED !== "false",
				},
			},
			database: {
				connection_limit: parseInt(process.env.DATABASE_CONNECTION_LIMIT || "10", 10),
				pool_timeout: parseInt(process.env.DATABASE_POOL_TIMEOUT || "10000", 10),
				query_timeout: parseInt(process.env.DATABASE_QUERY_TIMEOUT || "30000", 10),
			},
			redis: {
				max_retries: parseInt(process.env.REDIS_MAX_RETRIES || "3", 10),
				connect_timeout: parseInt(process.env.REDIS_CONNECT_TIMEOUT || "10000", 10),
				command_timeout: parseInt(process.env.REDIS_COMMAND_TIMEOUT || "5000", 10),
				keepalive: parseInt(process.env.REDIS_KEEPALIVE || "30000", 10),
			},
			workers: {
				leads_chatwit: {
					concurrency: parseInt(process.env.LEADS_CHATWIT_CONCURRENCY || "3", 10),
					lock_duration: parseInt(process.env.LEADS_CHATWIT_LOCK_DURATION || "60000", 10),
				},
			},
			application: {
				log_level: process.env.LOG_LEVEL || "info",
				health_check_timeout: parseInt(process.env.HEALTH_CHECK_TIMEOUT || "5000", 10),
				health_check_interval: parseInt(process.env.HEALTH_CHECK_INTERVAL || "30000", 10),
			},
			webhooks: {
				direct_processing: process.env.WEBHOOK_DIRECT_PROCESSING !== "false",
			},
			container: {
				memory_limit: process.env.CONTAINER_MEMORY_LIMIT || "1024M",
				cpu_limit: process.env.CONTAINER_CPU_LIMIT || "1.0",
			},
			oab_eval: {
				agentelocal: process.env.OAB_EVAL_AGENT_LOCAL === "true",
				agentelocal_espelho: process.env.OAB_EVAL_AGENT_LOCAL_ESPELHO === "true",
				transcribe_concurrency: parseInt(process.env.OAB_EVAL_TRANSCRIBE_CONCURRENCY || "10", 10),
				mirror_concurrency: parseInt(process.env.OAB_EVAL_MIRROR_CONCURRENCY || "5", 10),
				runtime_defaults: {
					transcription: {
						max_output_tokens: parseInt(process.env.OAB_EVAL_TRANSCRIPTION_MAX_OUTPUT_TOKENS || "17000", 10),
						timeout_ms: parseInt(process.env.OAB_EVAL_TRANSCRIPTION_TIMEOUT_MS || "120000", 10),
						retry_attempts: parseInt(process.env.OAB_EVAL_TRANSCRIPTION_RETRY_ATTEMPTS || "3", 10),
						retry_base_delay_ms: parseInt(process.env.OAB_EVAL_TRANSCRIPTION_RETRY_BASE_DELAY_MS || "2000", 10),
						retry_max_delay_ms: parseInt(process.env.OAB_EVAL_TRANSCRIPTION_RETRY_MAX_DELAY_MS || "10000", 10),
					},
					mirror: {
						max_output_tokens: parseInt(process.env.OAB_EVAL_MIRROR_MAX_OUTPUT_TOKENS || "12000", 10),
						timeout_ms: parseInt(process.env.OAB_EVAL_MIRROR_TIMEOUT_MS || "180000", 10),
						retry_attempts: parseInt(process.env.OAB_EVAL_MIRROR_RETRY_ATTEMPTS || "3", 10),
						retry_base_delay_ms: parseInt(process.env.OAB_EVAL_MIRROR_RETRY_BASE_DELAY_MS || "2000", 10),
						retry_max_delay_ms: parseInt(process.env.OAB_EVAL_MIRROR_RETRY_MAX_DELAY_MS || "10000", 10),
					},
					analysis: {
						max_output_tokens: parseInt(process.env.OAB_EVAL_ANALYSIS_MAX_OUTPUT_TOKENS || "16000", 10),
						timeout_ms: parseInt(process.env.OAB_EVAL_ANALYSIS_TIMEOUT_MS || "240000", 10),
						retry_attempts: parseInt(process.env.OAB_EVAL_ANALYSIS_RETRY_ATTEMPTS || "3", 10),
						retry_base_delay_ms: parseInt(process.env.OAB_EVAL_ANALYSIS_RETRY_BASE_DELAY_MS || "2000", 10),
						retry_max_delay_ms: parseInt(process.env.OAB_EVAL_ANALYSIS_RETRY_MAX_DELAY_MS || "10000", 10),
					},
				},
				queue: {
					name: process.env.OAB_EVAL_QUEUE_NAME || "oab-transcription",
					max_concurrent_jobs: parseInt(process.env.OAB_EVAL_MAX_CONCURRENT_JOBS || "10", 10),
					job_timeout: parseInt(process.env.OAB_EVAL_JOB_TIMEOUT || "300000", 10),
					retry_attempts: parseInt(process.env.OAB_EVAL_RETRY_ATTEMPTS || "4", 10),
					retry_backoff_ms: parseInt(process.env.OAB_EVAL_RETRY_BACKOFF_MS || "3000", 10),
					rate_limit_max: parseInt(process.env.OAB_EVAL_RATE_LIMIT_MAX || "10", 10),
					rate_limit_duration_ms: parseInt(process.env.OAB_EVAL_RATE_LIMIT_DURATION_MS || "1000", 10),
				},
			},
		};
	}

	/**
	 * Get list of environment variables that were applied as overrides
	 */
	private getAppliedOverrides(): string[] {
		const overrides: string[] = [];
		const envVars = [
			"SOCIALWISE_CONCURRENCY_LIMIT",
			"SOCIALWISE_GLOBAL_CONCURRENCY_LIMIT",
			"SOCIALWISE_QUEUE_TIMEOUT_MS",
			"SOCIALWISE_DEGRADATION_ENABLED",
			"SOCIALWISE_DEBOUNCE_MS",
			"SOCIALWISE_DEBOUNCE_ENABLED",
			"DATABASE_CONNECTION_LIMIT",
			"DATABASE_POOL_TIMEOUT",
			"DATABASE_QUERY_TIMEOUT",
			"REDIS_MAX_RETRIES",
			"REDIS_CONNECT_TIMEOUT",
			"REDIS_COMMAND_TIMEOUT",
			"REDIS_KEEPALIVE",
			"LEADS_CHATWIT_CONCURRENCY",
			"LEADS_CHATWIT_LOCK_DURATION",
			"LOG_LEVEL",
			"HEALTH_CHECK_TIMEOUT",
			"HEALTH_CHECK_INTERVAL",
			"WEBHOOK_DIRECT_PROCESSING",
			"OAB_EVAL_AGENT_LOCAL",
			"OAB_EVAL_AGENT_LOCAL_ESPELHO",
			"OAB_EVAL_TRANSCRIBE_CONCURRENCY",
			"OAB_EVAL_MIRROR_CONCURRENCY",
			"OAB_EVAL_MAX_CONCURRENT_JOBS",
			"OAB_EVAL_RETRY_ATTEMPTS",
			"OAB_EVAL_RETRY_BACKOFF_MS",
			"OAB_EVAL_RATE_LIMIT_MAX",
			"OAB_EVAL_RATE_LIMIT_DURATION_MS",
			"OAB_EVAL_TRANSCRIPTION_MAX_OUTPUT_TOKENS",
			"OAB_EVAL_TRANSCRIPTION_TIMEOUT_MS",
			"OAB_EVAL_TRANSCRIPTION_RETRY_ATTEMPTS",
			"OAB_EVAL_TRANSCRIPTION_RETRY_BASE_DELAY_MS",
			"OAB_EVAL_TRANSCRIPTION_RETRY_MAX_DELAY_MS",
			"OAB_EVAL_MIRROR_MAX_OUTPUT_TOKENS",
			"OAB_EVAL_MIRROR_TIMEOUT_MS",
			"OAB_EVAL_MIRROR_RETRY_ATTEMPTS",
			"OAB_EVAL_MIRROR_RETRY_BASE_DELAY_MS",
			"OAB_EVAL_MIRROR_RETRY_MAX_DELAY_MS",
			"OAB_EVAL_ANALYSIS_MAX_OUTPUT_TOKENS",
			"OAB_EVAL_ANALYSIS_TIMEOUT_MS",
			"OAB_EVAL_ANALYSIS_RETRY_ATTEMPTS",
			"OAB_EVAL_ANALYSIS_RETRY_BASE_DELAY_MS",
			"OAB_EVAL_ANALYSIS_RETRY_MAX_DELAY_MS",
		];

		for (const envVar of envVars) {
			if (process.env[envVar] !== undefined) {
				overrides.push(envVar);
			}
		}

		return overrides;
	}

	/**
	 * Get current configuration
	 */
	public getConfig(): AppConfig {
		return this.loadConfig();
	}

	/**
	 * Reload configuration (useful for testing or hot-reload scenarios)
	 */
	public reloadConfig(): AppConfig {
		this.config = null;
		return this.loadConfig();
	}
}

// Singleton instance
const configManager = ConfigManager.getInstance();

/**
 * Get the current application configuration
 */
export function getConfig(): AppConfig {
	return configManager.getConfig();
}

/**
 * Reload configuration from disk
 */
export function reloadConfig(): AppConfig {
	return configManager.reloadConfig();
}

/**
 * Get specific configuration sections
 */
export function getSocialwiseFlowConfig(): SocialwiseFlowConfig {
	return getConfig().socialwise_flow;
}

export function getDatabaseConfig(): DatabaseConfig {
	return getConfig().database;
}

export function getRedisConfig(): RedisConfig {
	return getConfig().redis;
}

export function getWorkersConfig(): WorkersConfig {
	return getConfig().workers;
}

export function getApplicationConfig(): ApplicationConfig {
	return getConfig().application;
}

export function getWebhooksConfig(): WebhooksConfig {
	return getConfig().webhooks;
}

export function getContainerConfig(): ContainerConfig {
	return getConfig().container;
}

export function getOabEvalConfig(): OabEvalConfig {
	const config = getConfig();
	return config.oab_eval ?? { agentelocal: false, transcribe_concurrency: 10 };
}

/**
 * Get a specific configuration value by path (dot notation)
 * Example: getConfigValue('oab_eval.queue.max_concurrent_jobs', 3)
 */
export function getConfigValue<T = any>(path: string, defaultValue?: T): T {
	const config = getConfig();
	const keys = path.split(".");

	let value: any = config;
	for (const key of keys) {
		if (value && typeof value === "object" && key in value) {
			value = value[key];
		} else {
			return defaultValue as T;
		}
	}

	return (value !== undefined ? value : defaultValue) as T;
}

/**
 * Check if monitoring logs are enabled
 * Controlled by MONITOR_LOG environment variable (default: false)
 * Used to reduce console noise from heartbeats, queue metrics, and resource usage logs
 */
export function isMonitorLogEnabled(): boolean {
	return process.env.MONITOR_LOG === "true";
}
