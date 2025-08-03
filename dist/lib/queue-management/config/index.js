"use strict";
/**
 * Queue Management Configuration Module
 * Provides factory functions and utilities for configuration management
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.QueueConfigManager = exports.ConfigValidationUtils = exports.SystemConfigUtils = exports.ConfigTemplates = exports.QueueConfigBuilder = void 0;
exports.initializeConfigManager = initializeConfigManager;
exports.getConfigManager = getConfigManager;
exports.createConfigManager = createConfigManager;
exports.createQueueConfig = createQueueConfig;
const QueueConfigManager_1 = require("../services/QueueConfigManager");
const config_1 = require("../types/config");
// Global instances
let globalConfigManager = null;
let globalPrisma = null;
let globalRedis = null;
/**
 * Initializes the global configuration manager
 */
function initializeConfigManager(prisma, redis, options) {
    globalPrisma = prisma;
    globalRedis = redis;
    globalConfigManager = new QueueConfigManager_1.QueueConfigManager(prisma, redis, options);
    return globalConfigManager;
}
/**
 * Gets the global configuration manager instance
 */
function getConfigManager() {
    if (!globalConfigManager) {
        throw new Error('Configuration manager not initialized. Call initializeConfigManager() first.');
    }
    return globalConfigManager;
}
/**
 * Creates a new configuration manager instance
 */
function createConfigManager(prisma, redis, options) {
    return new QueueConfigManager_1.QueueConfigManager(prisma, redis, options);
}
/**
 * Configuration builder for creating queue configurations
 */
class QueueConfigBuilder {
    config = {};
    constructor(name, createdBy) {
        this.config = {
            name,
            createdBy,
            ...config_1.DEFAULT_QUEUE_CONFIG
        };
    }
    displayName(displayName) {
        this.config.displayName = displayName;
        return this;
    }
    description(description) {
        this.config.description = description;
        return this;
    }
    priority(priority) {
        this.config.priority = priority;
        return this;
    }
    concurrency(concurrency) {
        this.config.concurrency = concurrency;
        return this;
    }
    rateLimiter(max, duration, bounceBack) {
        this.config.rateLimiter = { max, duration, bounceBack };
        return this;
    }
    retryPolicy(attempts, backoff, delay, maxDelay) {
        this.config.retryPolicy = { attempts, backoff, delay, maxDelay };
        return this;
    }
    cleanupPolicy(removeOnComplete, removeOnFail, maxAge) {
        this.config.cleanupPolicy = { removeOnComplete, removeOnFail, maxAge };
        return this;
    }
    alertThresholds(waitingJobs, processingTime, errorRate) {
        this.config.alertThresholds = {
            waitingJobs,
            processingTime,
            errorRate,
            ...this.config.alertThresholds
        };
        return this;
    }
    memoryAlert(memoryUsage) {
        if (!this.config.alertThresholds) {
            this.config.alertThresholds = config_1.DEFAULT_QUEUE_CONFIG.alertThresholds;
        }
        this.config.alertThresholds.memoryUsage = memoryUsage;
        return this;
    }
    cpuAlert(cpuUsage) {
        if (!this.config.alertThresholds) {
            this.config.alertThresholds = config_1.DEFAULT_QUEUE_CONFIG.alertThresholds;
        }
        this.config.alertThresholds.cpuUsage = cpuUsage;
        return this;
    }
    build() {
        return this.config;
    }
    async save() {
        const manager = getConfigManager();
        return await manager.createQueueConfig(this.build());
    }
}
exports.QueueConfigBuilder = QueueConfigBuilder;
/**
 * Creates a new queue configuration builder
 */
function createQueueConfig(name, createdBy) {
    return new QueueConfigBuilder(name, createdBy);
}
/**
 * Predefined configuration templates
 */
exports.ConfigTemplates = {
    /**
     * High-priority, low-latency queue for critical operations
     */
    critical: (name, createdBy) => createQueueConfig(name, createdBy)
        .priority(100)
        .concurrency(10)
        .retryPolicy(5, 'exponential', 500, 30000)
        .alertThresholds(10, 5000, 0.01) // 10 waiting jobs, 5s processing, 1% error rate
        .cleanupPolicy(50, 100),
    /**
     * Standard queue for regular operations
     */
    standard: (name, createdBy) => createQueueConfig(name, createdBy)
        .priority(50)
        .concurrency(5)
        .retryPolicy(3, 'exponential', 1000, 60000)
        .alertThresholds(100, 30000, 0.05) // 100 waiting jobs, 30s processing, 5% error rate
        .cleanupPolicy(100, 50),
    /**
     * Low-priority queue for background tasks
     */
    background: (name, createdBy) => createQueueConfig(name, createdBy)
        .priority(10)
        .concurrency(2)
        .retryPolicy(2, 'fixed', 5000)
        .alertThresholds(500, 120000, 0.10) // 500 waiting jobs, 2min processing, 10% error rate
        .cleanupPolicy(200, 25),
    /**
     * Batch processing queue for large operations
     */
    batch: (name, createdBy) => createQueueConfig(name, createdBy)
        .priority(25)
        .concurrency(1)
        .retryPolicy(1, 'fixed', 10000)
        .alertThresholds(50, 600000, 0.20) // 50 waiting jobs, 10min processing, 20% error rate
        .cleanupPolicy(10, 10)
        .rateLimiter(10, 60000), // 10 jobs per minute
    /**
     * Real-time queue for immediate processing
     */
    realtime: (name, createdBy) => createQueueConfig(name, createdBy)
        .priority(90)
        .concurrency(20)
        .retryPolicy(2, 'fixed', 100)
        .alertThresholds(5, 1000, 0.005) // 5 waiting jobs, 1s processing, 0.5% error rate
        .cleanupPolicy(1000, 200)
};
/**
 * System configuration utilities
 */
exports.SystemConfigUtils = {
    /**
     * Gets a system configuration with a default value
     */
    async getWithDefault(key, defaultValue) {
        const manager = getConfigManager();
        const value = await manager.getSystemConfig(key);
        return value ?? defaultValue;
    },
    /**
     * Gets multiple system configurations at once
     */
    async getMultiple(keys) {
        const manager = getConfigManager();
        const results = {};
        await Promise.all(keys.map(async (key) => {
            results[key] = await manager.getSystemConfig(key);
        }));
        return results;
    },
    /**
     * Sets multiple system configurations at once
     */
    async setMultiple(configs, updatedBy) {
        const manager = getConfigManager();
        await Promise.all(configs.map(({ key, value, description }) => manager.setSystemConfig(key, value, updatedBy, description)));
    },
    /**
     * Initializes default system configurations
     */
    async initializeDefaults(updatedBy = 'system') {
        const manager = getConfigManager();
        const defaults = [
            { key: config_1.SYSTEM_CONFIG_KEYS.QUEUE_DEFAULT_RETENTION_DAYS, value: 90, description: 'Default retention period for queue metrics in days' },
            { key: config_1.SYSTEM_CONFIG_KEYS.QUEUE_DEFAULT_CLEANUP_INTERVAL, value: 3600, description: 'Default cleanup interval in seconds' },
            { key: config_1.SYSTEM_CONFIG_KEYS.QUEUE_DEFAULT_MAX_CONCURRENT_JOBS, value: 100, description: 'Default maximum concurrent jobs per queue' },
            { key: config_1.SYSTEM_CONFIG_KEYS.ALERTS_DEFAULT_COOLDOWN_MINUTES, value: 5, description: 'Default cooldown period for alerts in minutes' },
            { key: config_1.SYSTEM_CONFIG_KEYS.ALERTS_DEFAULT_CHANNELS, value: ['email'], description: 'Default alert channels' },
            { key: config_1.SYSTEM_CONFIG_KEYS.METRICS_COLLECTION_INTERVAL_SECONDS, value: 60, description: 'Metrics collection interval in seconds' },
            { key: config_1.SYSTEM_CONFIG_KEYS.METRICS_RETENTION_DAYS, value: 90, description: 'Metrics retention period in days' },
            { key: config_1.SYSTEM_CONFIG_KEYS.CACHE_TTL_SECONDS, value: 3600, description: 'Cache TTL in seconds' },
            { key: config_1.SYSTEM_CONFIG_KEYS.CONNECTION_POOL_SIZE, value: 10, description: 'Database connection pool size' },
            { key: config_1.SYSTEM_CONFIG_KEYS.RATE_LIMIT_WINDOW_MS, value: 60000, description: 'Rate limit window in milliseconds' },
            { key: config_1.SYSTEM_CONFIG_KEYS.RATE_LIMIT_MAX_REQUESTS, value: 100, description: 'Maximum requests per rate limit window' },
            { key: config_1.SYSTEM_CONFIG_KEYS.AUTO_RETRY_ENABLED, value: true, description: 'Enable automatic retry of failed jobs' },
            { key: config_1.SYSTEM_CONFIG_KEYS.AUTO_CLEANUP_ENABLED, value: true, description: 'Enable automatic cleanup of old jobs' },
            { key: config_1.SYSTEM_CONFIG_KEYS.AUTO_SCALING_ENABLED, value: false, description: 'Enable automatic scaling of workers' }
        ];
        for (const { key, value, description } of defaults) {
            try {
                const existing = await manager.getSystemConfig(key);
                if (existing === null) {
                    await manager.setSystemConfig(key, value, updatedBy, description);
                }
            }
            catch (error) {
                console.error(`Failed to initialize system config ${key}:`, error);
            }
        }
    }
};
/**
 * Configuration validation utilities
 */
exports.ConfigValidationUtils = {
    /**
     * Validates a queue name
     */
    isValidQueueName(name) {
        return /^[a-zA-Z0-9_-]+$/.test(name) && name.length > 0 && name.length <= 255;
    },
    /**
     * Suggests a valid queue name based on input
     */
    suggestQueueName(input) {
        return input
            .toLowerCase()
            .replace(/[^a-zA-Z0-9_-]/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '')
            .substring(0, 255);
    },
    /**
     * Validates concurrency settings
     */
    isValidConcurrency(concurrency, priority) {
        // High priority queues should have reasonable concurrency limits
        if (priority > 80 && concurrency > 50) {
            return false;
        }
        return concurrency >= 1 && concurrency <= 1000;
    },
    /**
     * Validates retry policy settings
     */
    isValidRetryPolicy(attempts, delay, maxDelay) {
        if (attempts < 1 || attempts > 10)
            return false;
        if (delay < 0 || delay > 300000)
            return false;
        if (maxDelay && (maxDelay <= delay || maxDelay > 3600000))
            return false;
        return true;
    }
};
// Export all types and constants
__exportStar(require("../types/config"), exports);
__exportStar(require("../validation/config-validation"), exports);
var QueueConfigManager_2 = require("../services/QueueConfigManager");
Object.defineProperty(exports, "QueueConfigManager", { enumerable: true, get: function () { return QueueConfigManager_2.QueueConfigManager; } });
