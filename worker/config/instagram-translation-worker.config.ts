/**
 * Instagram Translation Worker Configuration
 * 
 * Defines resource limits, performance settings, and monitoring configuration
 * for the Instagram translation worker to ensure optimal performance and reliability.
 */

export interface InstagramTranslationWorkerConfig {
  // Worker Performance Settings
  concurrency: number;
  lockDuration: number; // milliseconds
  maxRetries: number;
  
  // Resource Limits
  resourceLimits: {
    memory: {
      max: string;
      warning: string;
      critical: string;
    };
    cpu: {
      max: number; // percentage
      warning: number;
      critical: number;
    };
    processing: {
      maxProcessingTime: number; // milliseconds
      warningThreshold: number; // milliseconds
    };
  };
  
  // Queue Configuration
  queue: {
    priority: number;
    removeOnComplete: number;
    removeOnFail: number;
    backoff: {
      type: 'exponential';
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
      memoryUsage: number; // percentage
      cpuUsage: number; // percentage
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
  
  // 5 second lock duration to ensure webhook response within limits
  lockDuration: 5000,
  
  // Maximum retry attempts
  maxRetries: 3,
  
  // Resource limits for monitoring and alerting
  resourceLimits: {
    memory: {
      max: "512MB",      // Maximum memory allocation
      warning: "384MB",  // Warning threshold at 75%
      critical: "460MB", // Critical threshold at 90%
    },
    cpu: {
      max: 100,      // 1 CPU core equivalent (100%)
      warning: 75,   // Warning at 75% CPU usage
      critical: 90,  // Critical at 90% CPU usage
    },
    processing: {
      maxProcessingTime: 4500,  // Must complete within 4.5s for webhook timeout
      warningThreshold: 3000,   // Warning if processing takes > 3s
    },
  },
  
  // Queue configuration optimized for high throughput
  queue: {
    priority: 10, // High priority for user-facing responses
    removeOnComplete: 100,
    removeOnFail: 50,
    backoff: {
      type: 'exponential',
      delay: 2000,      // Start with 2 seconds
      multiplier: 2,    // Double each retry
      maxDelay: 30000,  // Max 30 seconds
    },
  },
  
  // Comprehensive monitoring configuration
  monitoring: {
    enabled: true,
    metricsInterval: 30000,     // Collect metrics every 30 seconds
    healthCheckInterval: 60000, // Health check every minute
    alertThresholds: {
      errorRate: 5,           // Alert if error rate > 5%
      queueDepth: 50,         // Alert if queue depth > 50 jobs
      processingTime: 4000,   // Alert if processing time > 4s
      memoryUsage: 80,        // Alert if memory usage > 80%
      cpuUsage: 85,           // Alert if CPU usage > 85%
    },
  },
  
  // Lifecycle management settings
  lifecycle: {
    gracefulShutdownTimeout: 30000, // 30 seconds for graceful shutdown
    healthCheckTimeout: 5000,       // 5 seconds for health checks
    startupTimeout: 10000,          // 10 seconds for startup
  },
};

/**
 * Environment-specific configuration overrides
 */
export function getInstagramTranslationWorkerConfig(environment?: string): InstagramTranslationWorkerConfig {
  const baseConfig = { ...INSTAGRAM_TRANSLATION_WORKER_CONFIG };
  
  switch (environment) {
    case 'development':
      return {
        ...baseConfig,
        concurrency: 10, // Lower concurrency for development
        monitoring: {
          ...baseConfig.monitoring,
          metricsInterval: 60000, // Less frequent metrics collection
        },
        resourceLimits: {
          ...baseConfig.resourceLimits,
          memory: {
            max: "256MB",
            warning: "192MB",
            critical: "230MB",
          },
        },
      };
      
    case 'test':
      return {
        ...baseConfig,
        concurrency: 5, // Very low concurrency for testing
        monitoring: {
          ...baseConfig.monitoring,
          enabled: false, // Disable monitoring in tests
        },
        lockDuration: 1000, // Shorter lock duration for faster tests
      };
      
    case 'production':
      return {
        ...baseConfig,
        // Production uses default configuration
        // May be tuned based on actual performance metrics
        resourceLimits: {
          ...baseConfig.resourceLimits,
          memory: {
            max: "1GB",      // Higher memory limit in production
            warning: "768MB",
            critical: "920MB",
          },
          cpu: {
            max: 200,      // Allow up to 2 CPU cores in production
            warning: 150,
            critical: 180,
          },
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
    errors.push('Concurrency must be between 1 and 1000');
  }
  
  // Validate lock duration
  if (config.lockDuration < 1000 || config.lockDuration > 60000) {
    errors.push('Lock duration must be between 1 and 60 seconds');
  }
  
  // Validate processing time limits
  if (config.resourceLimits.processing.maxProcessingTime > config.lockDuration) {
    errors.push('Max processing time cannot exceed lock duration');
  }
  
  // Validate monitoring intervals
  if (config.monitoring.metricsInterval < 10000) {
    errors.push('Metrics interval must be at least 10 seconds');
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
  const environment = process.env.NODE_ENV || 'development';
  const config = getInstagramTranslationWorkerConfig(environment);
  
  const validation = validateWorkerConfig(config);
  if (!validation.valid) {
    console.warn('[Instagram Worker Config] Configuration validation failed:', validation.errors);
    // Return default config if validation fails
    return INSTAGRAM_TRANSLATION_WORKER_CONFIG;
  }
  
  return config;
}

/**
 * Log current worker configuration
 */
export function logWorkerConfiguration(config: InstagramTranslationWorkerConfig): void {
  console.log('[Instagram Worker Config] Worker configuration:', {
    concurrency: config.concurrency,
    lockDuration: `${config.lockDuration}ms`,
    maxRetries: config.maxRetries,
    resourceLimits: {
      memory: config.resourceLimits.memory.max,
      cpu: `${config.resourceLimits.cpu.max}%`,
      maxProcessingTime: `${config.resourceLimits.processing.maxProcessingTime}ms`,
    },
    monitoring: {
      enabled: config.monitoring.enabled,
      metricsInterval: `${config.monitoring.metricsInterval}ms`,
      healthCheckInterval: `${config.monitoring.healthCheckInterval}ms`,
    },
    environment: process.env.NODE_ENV || 'development',
  });
}

// Export configuration constants for easy access
export const WORKER_METRICS = {
  CONCURRENCY_FACTOR: 100,
  MAX_PROCESSING_TIME: 4500,
  LOCK_DURATION: 5000,
  HIGH_PRIORITY: 10,
} as const;

export const RESOURCE_LIMITS = {
  MEMORY_MAX: "512MB",
  CPU_MAX: 100, // 1 core
  PROCESSING_TIMEOUT: 4500,
} as const;

export const MONITORING_INTERVALS = {
  METRICS_COLLECTION: 30000,
  HEALTH_CHECK: 60000,
  PERFORMANCE_REVIEW: 300000, // 5 minutes
} as const;