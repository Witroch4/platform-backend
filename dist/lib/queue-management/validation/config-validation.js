"use strict";
/**
 * Configuration validation using Zod schemas
 * Provides comprehensive validation for queue configurations and system settings
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SystemConfigSchema = exports.QueueConfigSchema = void 0;
exports.validateQueueConfig = validateQueueConfig;
exports.validateSystemConfig = validateSystemConfig;
exports.validateRetryPolicyConsistency = validateRetryPolicyConsistency;
exports.validateCleanupPolicyConsistency = validateCleanupPolicyConsistency;
exports.validateAlertThresholdsConsistency = validateAlertThresholdsConsistency;
exports.validateQueueConfigComprehensive = validateQueueConfigComprehensive;
exports.isValidSystemConfigKey = isValidSystemConfigKey;
exports.getSystemConfigKeyType = getSystemConfigKeyType;
const zod_1 = require("zod");
const config_1 = require("../types/config");
// Base validation schemas
const RateLimiterConfigSchema = zod_1.z.object({
    max: zod_1.z.number().int().min(1).max(10000),
    duration: zod_1.z.number().int().min(1000).max(3600000), // 1 second to 1 hour
    bounceBack: zod_1.z.boolean().optional()
}).optional();
const RetryPolicySchema = zod_1.z.object({
    attempts: zod_1.z.number().int().min(1).max(10),
    backoff: zod_1.z.enum(['fixed', 'exponential']),
    delay: zod_1.z.number().int().min(0).max(300000), // max 5 minutes
    maxDelay: zod_1.z.number().int().min(1000).max(3600000).optional() // max 1 hour
});
const CleanupPolicySchema = zod_1.z.object({
    removeOnComplete: zod_1.z.number().int().min(0).max(10000),
    removeOnFail: zod_1.z.number().int().min(0).max(10000),
    maxAge: zod_1.z.number().int().min(60000).optional() // min 1 minute
});
const AlertThresholdsSchema = zod_1.z.object({
    waitingJobs: zod_1.z.number().int().min(1).max(100000),
    processingTime: zod_1.z.number().int().min(1000).max(3600000), // 1 second to 1 hour
    errorRate: zod_1.z.number().min(0).max(1), // 0% to 100%
    memoryUsage: zod_1.z.number().int().min(1024).optional(), // min 1KB
    cpuUsage: zod_1.z.number().min(0).max(1).optional() // 0% to 100%
});
// Main queue configuration schema
exports.QueueConfigSchema = zod_1.z.object({
    id: zod_1.z.string().optional(),
    name: zod_1.z.string()
        .min(1, 'Queue name is required')
        .max(255, 'Queue name must be less than 255 characters')
        .regex(/^[a-zA-Z0-9_-]+$/, 'Queue name can only contain letters, numbers, underscores, and hyphens'),
    displayName: zod_1.z.string().max(255).optional(),
    description: zod_1.z.string().max(1000).optional(),
    priority: zod_1.z.number().int().min(0).max(100),
    concurrency: zod_1.z.number().int().min(1).max(1000),
    rateLimiter: RateLimiterConfigSchema,
    retryPolicy: RetryPolicySchema,
    cleanupPolicy: CleanupPolicySchema,
    alertThresholds: AlertThresholdsSchema,
    createdAt: zod_1.z.date().optional(),
    updatedAt: zod_1.z.date().optional(),
    createdBy: zod_1.z.string().min(1, 'Created by is required')
});
// System configuration schema
exports.SystemConfigSchema = zod_1.z.object({
    id: zod_1.z.string().optional(),
    key: zod_1.z.string().min(1, 'Configuration key is required'),
    value: zod_1.z.any(),
    description: zod_1.z.string().max(500).optional(),
    category: zod_1.z.string().max(100).optional(),
    createdAt: zod_1.z.date().optional(),
    updatedAt: zod_1.z.date().optional(),
    updatedBy: zod_1.z.string().optional()
});
// Specific validation for system config keys
const SystemConfigValueSchemas = {
    [config_1.SYSTEM_CONFIG_KEYS.QUEUE_DEFAULT_RETENTION_DAYS]: zod_1.z.number().int().min(1).max(365),
    [config_1.SYSTEM_CONFIG_KEYS.QUEUE_DEFAULT_CLEANUP_INTERVAL]: zod_1.z.number().int().min(60).max(86400), // 1 minute to 1 day
    [config_1.SYSTEM_CONFIG_KEYS.QUEUE_DEFAULT_MAX_CONCURRENT_JOBS]: zod_1.z.number().int().min(1).max(10000),
    [config_1.SYSTEM_CONFIG_KEYS.ALERTS_DEFAULT_COOLDOWN_MINUTES]: zod_1.z.number().int().min(1).max(1440), // 1 minute to 1 day
    [config_1.SYSTEM_CONFIG_KEYS.ALERTS_DEFAULT_CHANNELS]: zod_1.z.array(zod_1.z.string()),
    [config_1.SYSTEM_CONFIG_KEYS.METRICS_COLLECTION_INTERVAL_SECONDS]: zod_1.z.number().int().min(10).max(3600), // 10 seconds to 1 hour
    [config_1.SYSTEM_CONFIG_KEYS.METRICS_RETENTION_DAYS]: zod_1.z.number().int().min(1).max(365),
    [config_1.SYSTEM_CONFIG_KEYS.CACHE_TTL_SECONDS]: zod_1.z.number().int().min(10).max(86400), // 10 seconds to 1 day
    [config_1.SYSTEM_CONFIG_KEYS.CONNECTION_POOL_SIZE]: zod_1.z.number().int().min(1).max(100),
    [config_1.SYSTEM_CONFIG_KEYS.RATE_LIMIT_WINDOW_MS]: zod_1.z.number().int().min(1000).max(3600000), // 1 second to 1 hour
    [config_1.SYSTEM_CONFIG_KEYS.RATE_LIMIT_MAX_REQUESTS]: zod_1.z.number().int().min(1).max(10000),
    [config_1.SYSTEM_CONFIG_KEYS.AUTO_RETRY_ENABLED]: zod_1.z.boolean(),
    [config_1.SYSTEM_CONFIG_KEYS.AUTO_CLEANUP_ENABLED]: zod_1.z.boolean(),
    [config_1.SYSTEM_CONFIG_KEYS.AUTO_SCALING_ENABLED]: zod_1.z.boolean()
};
/**
 * Validates a queue configuration object
 */
function validateQueueConfig(config) {
    try {
        exports.QueueConfigSchema.parse(config);
        return { isValid: true, errors: [] };
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            const errors = error.errors.map(err => ({
                field: err.path.join('.'),
                message: err.message,
                value: err.code === 'invalid_type' ? undefined : err.received
            }));
            return { isValid: false, errors };
        }
        return {
            isValid: false,
            errors: [{ field: 'unknown', message: 'Unknown validation error' }]
        };
    }
}
/**
 * Validates a system configuration object
 */
function validateSystemConfig(config) {
    try {
        // First validate the basic structure
        exports.SystemConfigSchema.parse(config);
        // Then validate the value based on the key
        if (config.key && config.value !== undefined) {
            const valueSchema = SystemConfigValueSchemas[config.key];
            if (valueSchema) {
                valueSchema.parse(config.value);
            }
        }
        return { isValid: true, errors: [] };
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            const errors = error.errors.map(err => ({
                field: err.path.join('.'),
                message: err.message,
                value: err.code === 'invalid_type' ? undefined : err.received
            }));
            return { isValid: false, errors };
        }
        return {
            isValid: false,
            errors: [{ field: 'unknown', message: 'Unknown validation error' }]
        };
    }
}
/**
 * Validates that retry policy configuration is consistent
 */
function validateRetryPolicyConsistency(retryPolicy) {
    const errors = [];
    if (retryPolicy.backoff === 'exponential' && !retryPolicy.maxDelay) {
        errors.push({
            field: 'retryPolicy.maxDelay',
            message: 'maxDelay is required when using exponential backoff'
        });
    }
    if (retryPolicy.maxDelay && retryPolicy.maxDelay <= retryPolicy.delay) {
        errors.push({
            field: 'retryPolicy.maxDelay',
            message: 'maxDelay must be greater than delay'
        });
    }
    return errors;
}
/**
 * Validates that cleanup policy configuration is reasonable
 */
function validateCleanupPolicyConsistency(cleanupPolicy) {
    const errors = [];
    if (cleanupPolicy.removeOnComplete === 0 && cleanupPolicy.removeOnFail === 0) {
        errors.push({
            field: 'cleanupPolicy',
            message: 'At least one cleanup policy must be greater than 0 to prevent infinite storage growth'
        });
    }
    return errors;
}
/**
 * Validates that alert thresholds are reasonable
 */
function validateAlertThresholdsConsistency(alertThresholds) {
    const errors = [];
    if (alertThresholds.errorRate >= 1) {
        errors.push({
            field: 'alertThresholds.errorRate',
            message: 'Error rate threshold of 100% or higher is not practical'
        });
    }
    if (alertThresholds.processingTime < 1000) {
        errors.push({
            field: 'alertThresholds.processingTime',
            message: 'Processing time threshold should be at least 1 second for practical alerting'
        });
    }
    return errors;
}
/**
 * Performs comprehensive validation including consistency checks
 */
function validateQueueConfigComprehensive(config) {
    // First run basic validation
    const basicValidation = validateQueueConfig(config);
    if (!basicValidation.isValid) {
        return basicValidation;
    }
    const errors = [];
    // Run consistency checks
    if (config.retryPolicy) {
        errors.push(...validateRetryPolicyConsistency(config.retryPolicy));
    }
    if (config.cleanupPolicy) {
        errors.push(...validateCleanupPolicyConsistency(config.cleanupPolicy));
    }
    if (config.alertThresholds) {
        errors.push(...validateAlertThresholdsConsistency(config.alertThresholds));
    }
    return {
        isValid: errors.length === 0,
        errors
    };
}
/**
 * Validates that a system config key is recognized
 */
function isValidSystemConfigKey(key) {
    return Object.values(config_1.SYSTEM_CONFIG_KEYS).includes(key);
}
/**
 * Gets the expected type for a system config key
 */
function getSystemConfigKeyType(key) {
    const schema = SystemConfigValueSchemas[key];
    if (!schema)
        return 'unknown';
    if (schema instanceof zod_1.z.ZodNumber)
        return 'number';
    if (schema instanceof zod_1.z.ZodString)
        return 'string';
    if (schema instanceof zod_1.z.ZodBoolean)
        return 'boolean';
    if (schema instanceof zod_1.z.ZodArray)
        return 'array';
    if (schema instanceof zod_1.z.ZodObject)
        return 'object';
    return 'unknown';
}
