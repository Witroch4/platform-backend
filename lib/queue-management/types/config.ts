/**
 * Configuration types for the BullMQ Queue Management System
 * Defines interfaces for queue configuration, retry policies, and system settings
 */

export interface RateLimiterConfig {
	max: number;
	duration: number; // milliseconds
	bounceBack?: boolean;
}

export interface RetryPolicy {
	attempts: number;
	backoff: "fixed" | "exponential";
	delay: number; // milliseconds
	maxDelay?: number; // milliseconds for exponential backoff
}

export interface CleanupPolicy {
	removeOnComplete: number;
	removeOnFail: number;
	maxAge?: number; // milliseconds
}

export interface AlertThresholds {
	waitingJobs: number;
	processingTime: number; // milliseconds
	errorRate: number; // percentage (0-1)
	memoryUsage?: number; // bytes
	cpuUsage?: number; // percentage (0-1)
}

export interface QueueConfig {
	id?: string;
	name: string;
	displayName?: string;
	description?: string;
	priority: number;
	concurrency: number;
	rateLimiter?: RateLimiterConfig;
	retryPolicy: RetryPolicy;
	cleanupPolicy: CleanupPolicy;
	alertThresholds: AlertThresholds;
	createdAt?: Date;
	updatedAt?: Date;
	createdBy: string;
}

export interface SystemConfig {
	id?: string;
	key: string;
	value: any;
	description?: string;
	category?: string;
	createdAt?: Date;
	updatedAt?: Date;
	updatedBy?: string;
}

export interface QueueConfigValidationError {
	field: string;
	message: string;
	value?: any;
}

export interface QueueConfigValidationResult {
	isValid: boolean;
	errors: QueueConfigValidationError[];
}

export interface QueueConfigManagerOptions {
	cacheEnabled?: boolean;
	cacheTTL?: number; // seconds
	validateOnSave?: boolean;
	auditChanges?: boolean;
}

export const DEFAULT_QUEUE_CONFIG: Partial<QueueConfig> = {
	priority: 0,
	concurrency: 1,
	retryPolicy: {
		attempts: 3,
		backoff: "exponential",
		delay: 1000,
		maxDelay: 30000,
	},
	cleanupPolicy: {
		removeOnComplete: 100,
		removeOnFail: 50,
		maxAge: 24 * 60 * 60 * 1000, // 24 hours
	},
	alertThresholds: {
		waitingJobs: 100,
		processingTime: 30000, // 30 seconds
		errorRate: 0.05, // 5%
	},
};

export const SYSTEM_CONFIG_KEYS = {
	// Queue defaults
	QUEUE_DEFAULT_RETENTION_DAYS: "queue.default.retention_days",
	QUEUE_DEFAULT_CLEANUP_INTERVAL: "queue.default.cleanup_interval",
	QUEUE_DEFAULT_MAX_CONCURRENT_JOBS: "queue.default.max_concurrent_jobs",

	// Alert defaults
	ALERTS_DEFAULT_COOLDOWN_MINUTES: "alerts.default.cooldown_minutes",
	ALERTS_DEFAULT_CHANNELS: "alerts.default.channels",

	// Metrics collection
	METRICS_COLLECTION_INTERVAL_SECONDS: "metrics.collection.interval_seconds",
	METRICS_RETENTION_DAYS: "metrics.retention.days",

	// Performance settings
	CACHE_TTL_SECONDS: "cache.ttl.seconds",
	CONNECTION_POOL_SIZE: "connection.pool.size",

	// Security settings
	RATE_LIMIT_WINDOW_MS: "rate_limit.window_ms",
	RATE_LIMIT_MAX_REQUESTS: "rate_limit.max_requests",

	// Automation settings
	AUTO_RETRY_ENABLED: "automation.auto_retry.enabled",
	AUTO_CLEANUP_ENABLED: "automation.auto_cleanup.enabled",
	AUTO_SCALING_ENABLED: "automation.auto_scaling.enabled",
} as const;

export type SystemConfigKey = (typeof SYSTEM_CONFIG_KEYS)[keyof typeof SYSTEM_CONFIG_KEYS];
