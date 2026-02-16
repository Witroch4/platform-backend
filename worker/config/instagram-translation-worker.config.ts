/**
 * Instagram Translation Worker Configuration
 *
 * Defines performance settings, processing time limits, and monitoring configuration
 * for the Instagram translation worker to ensure optimal performance and reliability.
 *
 * Note: Resource limits (memory, CPU) are managed by Docker Swarm container configuration.
 */

export interface InstagramTranslationWorkerConfig {
	// Worker Performance Settings
	concurrency: number;
	lockDuration: number; // milliseconds
	maxRetries: number;

	// Processing Time Limits (for webhook timeout compliance)
	processing: {
		maxProcessingTime: number; // milliseconds
		warningThreshold: number; // milliseconds
	};

	// Queue Configuration
	queue: {
		priority: number;
		removeOnComplete: number;
		removeOnFail: number;
		backoff: {
			type: "exponential";
			delay: number;
			multiplier: number;
			maxDelay: number;
		};
	};

	// Monitoring Configuration
	monitoring: {
		enabled: boolean;
		metricsInterval: number; // milliseconds
		healthCheckInterval: number; // milliseconds
		alertThresholds: {
			errorRate: number; // percentage
			queueDepth: number;
			processingTime: number; // milliseconds
		};
	};

	// Lifecycle Management
	lifecycle: {
		gracefulShutdownTimeout: number; // milliseconds
		healthCheckTimeout: number; // milliseconds
		startupTimeout: number; // milliseconds
	};
}

/**
 * Default configuration for Instagram Translation Worker
 * Optimized for IO-bound translation tasks with high concurrency
 */
export const INSTAGRAM_TRANSLATION_WORKER_CONFIG: InstagramTranslationWorkerConfig = {
	// High concurrency for IO-bound tasks as per requirement 8.2
	concurrency: 100,

	// 30 second lock duration to prevent Redis timeouts
	lockDuration: 30000,

	// Maximum retry attempts
	maxRetries: 3,

	// Processing time limits for webhook timeout compliance
	processing: {
		maxProcessingTime: 25000, // Must complete within 25s to prevent Redis timeout
		warningThreshold: 15000, // Warning if processing takes > 15s
	},

	// Queue configuration optimized for high throughput
	queue: {
		priority: 10, // High priority for user-facing responses
		removeOnComplete: 100,
		removeOnFail: 50,
		backoff: {
			type: "exponential",
			delay: 2000, // Start with 2 seconds
			multiplier: 2, // Double each retry
			maxDelay: 30000, // Max 30 seconds
		},
	},

	// Comprehensive monitoring configuration
	monitoring: {
		enabled: true,
		metricsInterval: 30000, // Collect metrics every 30 seconds
		healthCheckInterval: 60000, // Health check every minute
		alertThresholds: {
			errorRate: 5, // Alert if error rate > 5%
			queueDepth: 50, // Alert if queue depth > 50 jobs
			processingTime: 4000, // Alert if processing time > 4s
			// memoryUsage: 80,        // Alert if memory usage > 80% (not supported yet)
			// cpuUsage: 85,           // Alert if CPU usage > 85% (not supported yet)
		},
	},

	// Lifecycle management settings
	lifecycle: {
		gracefulShutdownTimeout: 30000, // 30 seconds for graceful shutdown
		healthCheckTimeout: 5000, // 5 seconds for health checks
		startupTimeout: 10000, // 10 seconds for startup
	},
};

/**
 * Environment-specific configuration overrides
 */
export function getInstagramTranslationWorkerConfig(environment?: string): InstagramTranslationWorkerConfig {
	const baseConfig = { ...INSTAGRAM_TRANSLATION_WORKER_CONFIG };

	switch (environment) {
		case "development":
			return {
				...baseConfig,
				concurrency: 10, // Lower concurrency for development
				monitoring: {
					...baseConfig.monitoring,
					metricsInterval: 60000, // Less frequent metrics collection
				},
				processing: {
					...baseConfig.processing,
				},
			};

		case "test":
			return {
				...baseConfig,
				concurrency: 5, // Very low concurrency for testing
				monitoring: {
					...baseConfig.monitoring,
					enabled: false, // Disable monitoring in tests
				},
				lockDuration: 1000, // Shorter lock duration for faster tests
			};

		case "production":
			return {
				...baseConfig,
				// Production uses default configuration
				// May be tuned based on actual performance metrics
				processing: {
					...baseConfig.processing,
				},
			};

		default:
			return baseConfig;
	}
}

/**
 * Validate worker configuration
 */
export function validateWorkerConfig(config: InstagramTranslationWorkerConfig): {
	valid: boolean;
	errors: string[];
} {
	const errors: string[] = [];

	// Validate concurrency
	if (config.concurrency < 1 || config.concurrency > 1000) {
		errors.push("Concurrency must be between 1 and 1000");
	}

	// Validate lock duration
	if (config.lockDuration < 1000 || config.lockDuration > 120000) {
		errors.push("Lock duration must be between 1 and 120 seconds");
	}

	// Validate processing time limits
	if (config.processing.maxProcessingTime > config.lockDuration) {
		errors.push("Max processing time cannot exceed lock duration");
	}

	// Validate monitoring intervals
	if (config.monitoring.metricsInterval < 10000) {
		errors.push("Metrics interval must be at least 10 seconds");
	}

	return {
		valid: errors.length === 0,
		errors,
	};
}

/**
 * Get current worker configuration based on environment
 */
export function getCurrentWorkerConfig(): InstagramTranslationWorkerConfig {
	const environment = process.env.NODE_ENV || "development";
	const config = getInstagramTranslationWorkerConfig(environment);

	const validation = validateWorkerConfig(config);
	if (!validation.valid) {
		console.warn("[Instagram Worker Config] Configuration validation failed:", validation.errors);
		// Return default config if validation fails
		return INSTAGRAM_TRANSLATION_WORKER_CONFIG;
	}

	return config;
}

/**
 * Log current worker configuration
 */
export function logWorkerConfiguration(config: InstagramTranslationWorkerConfig): void {
	console.log("[Instagram Worker Config] Worker configuration:", {
		concurrency: config.concurrency,
		lockDuration: `${config.lockDuration}ms`,
		maxRetries: config.maxRetries,
		processing: {
			maxProcessingTime: `${config.processing.maxProcessingTime}ms`,
		},
		monitoring: {
			enabled: config.monitoring.enabled,
			metricsInterval: `${config.monitoring.metricsInterval}ms`,
			healthCheckInterval: `${config.monitoring.healthCheckInterval}ms`,
		},
		environment: process.env.NODE_ENV || "development",
	});
}

// Export configuration constants for easy access
export const WORKER_METRICS = {
	CONCURRENCY_FACTOR: 100,
	MAX_PROCESSING_TIME: 25000,
	LOCK_DURATION: 30000,
	HIGH_PRIORITY: 10,
} as const;

export const PROCESSING_LIMITS = {
	MAX_PROCESSING_TIME: 25000,
	WARNING_THRESHOLD: 15000,
} as const;

export const MONITORING_INTERVALS = {
	METRICS_COLLECTION: 30000,
	HEALTH_CHECK: 60000,
	PERFORMANCE_REVIEW: 300000, // 5 minutes
} as const;
