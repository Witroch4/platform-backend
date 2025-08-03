"use strict";
/**
 * Queue Management System Configuration
 *
 * Central configuration for the BullMQ queue management system
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getQueueManagementConfig = getQueueManagementConfig;
exports.setQueueManagementConfig = setQueueManagementConfig;
exports.resetQueueManagementConfig = resetQueueManagementConfig;
const zod_1 = require("zod");
// Configuration Schema
const QueueManagementConfigSchema = zod_1.z.object({
    // Redis Configuration
    redis: zod_1.z.object({
        host: zod_1.z.string().default('localhost'),
        port: zod_1.z.number().default(6379),
        password: zod_1.z.string().optional(),
        db: zod_1.z.number().default(0),
        maxRetriesPerRequest: zod_1.z.number().default(3),
        retryDelayOnFailover: zod_1.z.number().default(100),
        enableReadyCheck: zod_1.z.boolean().default(true),
        lazyConnect: zod_1.z.boolean().default(true),
    }),
    // Database Configuration
    database: zod_1.z.object({
        url: zod_1.z.string(),
        maxConnections: zod_1.z.number().default(20),
        connectionTimeout: zod_1.z.number().default(30000),
        queryTimeout: zod_1.z.number().default(60000),
    }),
    // Metrics Configuration
    metrics: zod_1.z.object({
        enabled: zod_1.z.boolean().default(true),
        collectionInterval: zod_1.z.number().default(30000), // 30 seconds
        retentionDays: zod_1.z.number().default(90),
        aggregationIntervals: zod_1.z.array(zod_1.z.enum(['1m', '5m', '1h', '1d'])).default(['1m', '5m', '1h', '1d']),
        batchSize: zod_1.z.number().default(1000),
    }),
    // Alerts Configuration
    alerts: zod_1.z.object({
        enabled: zod_1.z.boolean().default(true),
        evaluationInterval: zod_1.z.number().default(60000), // 1 minute
        cooldownPeriod: zod_1.z.number().default(300000), // 5 minutes
        maxAlertsPerHour: zod_1.z.number().default(100),
        channels: zod_1.z.object({
            email: zod_1.z.object({
                enabled: zod_1.z.boolean().default(false),
                smtp: zod_1.z.object({
                    host: zod_1.z.string().optional(),
                    port: zod_1.z.number().optional(),
                    secure: zod_1.z.boolean().default(true),
                    auth: zod_1.z.object({
                        user: zod_1.z.string().optional(),
                        pass: zod_1.z.string().optional(),
                    }).optional(),
                }).optional(),
            }),
            slack: zod_1.z.object({
                enabled: zod_1.z.boolean().default(false),
                webhookUrl: zod_1.z.string().optional(),
                channel: zod_1.z.string().optional(),
            }),
            webhook: zod_1.z.object({
                enabled: zod_1.z.boolean().default(false),
                url: zod_1.z.string().optional(),
                secret: zod_1.z.string().optional(),
            }),
        }),
    }),
    // Performance Configuration
    performance: zod_1.z.object({
        cacheEnabled: zod_1.z.boolean().default(true),
        cacheTtl: zod_1.z.object({
            queueHealth: zod_1.z.number().default(30), // 30 seconds
            queueConfig: zod_1.z.number().default(3600), // 1 hour
            userSession: zod_1.z.number().default(1800), // 30 minutes
            metrics: zod_1.z.number().default(300), // 5 minutes
        }),
        rateLimiting: zod_1.z.object({
            enabled: zod_1.z.boolean().default(true),
            windowMs: zod_1.z.number().default(60000), // 1 minute
            maxRequests: zod_1.z.number().default(100),
        }),
        pagination: zod_1.z.object({
            defaultLimit: zod_1.z.number().default(50),
            maxLimit: zod_1.z.number().default(1000),
        }),
    }),
    // Security Configuration
    security: zod_1.z.object({
        jwtSecret: zod_1.z.string(),
        jwtExpiresIn: zod_1.z.string().default('24h'),
        bcryptRounds: zod_1.z.number().default(12),
        corsOrigins: zod_1.z.array(zod_1.z.string()).default(['http://localhost:3000']),
        apiKeyLength: zod_1.z.number().default(32),
    }),
    // Feature Flags
    features: zod_1.z.object({
        flowAnalysis: zod_1.z.boolean().default(true),
        machineLearning: zod_1.z.boolean().default(false),
        advancedMetrics: zod_1.z.boolean().default(true),
        webhooks: zod_1.z.boolean().default(true),
        auditLogging: zod_1.z.boolean().default(true),
        automationPolicies: zod_1.z.boolean().default(true),
    }),
});
// Default Configuration
const defaultConfig = {
    redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD,
        db: parseInt(process.env.REDIS_DB || '0'),
        maxRetriesPerRequest: 3,
        retryDelayOnFailover: 100,
        enableReadyCheck: true,
        lazyConnect: true,
    },
    database: {
        url: process.env.DATABASE_URL || '',
        maxConnections: parseInt(process.env.DB_MAX_CONNECTIONS || '20'),
        connectionTimeout: parseInt(process.env.DB_CONNECTION_TIMEOUT || '30000'),
        queryTimeout: parseInt(process.env.DB_QUERY_TIMEOUT || '60000'),
    },
    metrics: {
        enabled: process.env.QUEUE_METRICS_ENABLED !== 'false',
        collectionInterval: parseInt(process.env.QUEUE_METRICS_INTERVAL || '30000'),
        retentionDays: parseInt(process.env.QUEUE_METRICS_RETENTION_DAYS || '90'),
        aggregationIntervals: ['1m', '5m', '1h', '1d'],
        batchSize: parseInt(process.env.QUEUE_METRICS_BATCH_SIZE || '1000'),
    },
    alerts: {
        enabled: process.env.QUEUE_ALERTS_ENABLED !== 'false',
        evaluationInterval: parseInt(process.env.QUEUE_ALERTS_EVALUATION_INTERVAL || '60000'),
        cooldownPeriod: parseInt(process.env.QUEUE_ALERTS_COOLDOWN || '300000'),
        maxAlertsPerHour: parseInt(process.env.QUEUE_ALERTS_MAX_PER_HOUR || '100'),
        channels: {
            email: {
                enabled: process.env.QUEUE_ALERTS_EMAIL_ENABLED === 'true',
                smtp: {
                    host: process.env.SMTP_HOST,
                    port: parseInt(process.env.SMTP_PORT || '587'),
                    secure: process.env.SMTP_SECURE === 'true',
                    auth: {
                        user: process.env.SMTP_USER,
                        pass: process.env.SMTP_PASS,
                    },
                },
            },
            slack: {
                enabled: process.env.QUEUE_ALERTS_SLACK_ENABLED === 'true',
                webhookUrl: process.env.SLACK_WEBHOOK_URL,
                channel: process.env.SLACK_CHANNEL,
            },
            webhook: {
                enabled: process.env.QUEUE_ALERTS_WEBHOOK_ENABLED === 'true',
                url: process.env.QUEUE_ALERTS_WEBHOOK_URL,
                secret: process.env.QUEUE_ALERTS_WEBHOOK_SECRET,
            },
        },
    },
    performance: {
        cacheEnabled: process.env.QUEUE_CACHE_ENABLED !== 'false',
        cacheTtl: {
            queueHealth: parseInt(process.env.QUEUE_CACHE_HEALTH_TTL || '30'),
            queueConfig: parseInt(process.env.QUEUE_CACHE_CONFIG_TTL || '3600'),
            userSession: parseInt(process.env.QUEUE_CACHE_SESSION_TTL || '1800'),
            metrics: parseInt(process.env.QUEUE_CACHE_METRICS_TTL || '300'),
        },
        rateLimiting: {
            enabled: process.env.QUEUE_RATE_LIMITING_ENABLED !== 'false',
            windowMs: parseInt(process.env.QUEUE_RATE_LIMIT_WINDOW || '60000'),
            maxRequests: parseInt(process.env.QUEUE_RATE_LIMIT_MAX || '100'),
        },
        pagination: {
            defaultLimit: parseInt(process.env.QUEUE_PAGINATION_DEFAULT_LIMIT || '50'),
            maxLimit: parseInt(process.env.QUEUE_PAGINATION_MAX_LIMIT || '1000'),
        },
    },
    security: {
        jwtSecret: process.env.QUEUE_JWT_SECRET || process.env.NEXTAUTH_SECRET || '',
        jwtExpiresIn: process.env.QUEUE_JWT_EXPIRES_IN || '24h',
        bcryptRounds: parseInt(process.env.QUEUE_BCRYPT_ROUNDS || '12'),
        corsOrigins: process.env.QUEUE_CORS_ORIGINS?.split(',') || ['http://localhost:3000'],
        apiKeyLength: parseInt(process.env.QUEUE_API_KEY_LENGTH || '32'),
    },
    features: {
        flowAnalysis: process.env.QUEUE_FEATURE_FLOW_ANALYSIS !== 'false',
        machineLearning: process.env.QUEUE_FEATURE_ML === 'true',
        advancedMetrics: process.env.QUEUE_FEATURE_ADVANCED_METRICS !== 'false',
        webhooks: process.env.QUEUE_FEATURE_WEBHOOKS !== 'false',
        auditLogging: process.env.QUEUE_FEATURE_AUDIT_LOGGING !== 'false',
        automationPolicies: process.env.QUEUE_FEATURE_AUTOMATION !== 'false',
    },
};
// Configuration instance
let config = null;
/**
 * Get the queue management configuration
 */
function getQueueManagementConfig() {
    if (!config) {
        try {
            config = QueueManagementConfigSchema.parse(defaultConfig);
        }
        catch (error) {
            console.error('Invalid queue management configuration:', error);
            throw new Error('Failed to load queue management configuration');
        }
    }
    return config;
}
/**
 * Update configuration (useful for testing)
 */
function setQueueManagementConfig(newConfig) {
    config = QueueManagementConfigSchema.parse({
        ...defaultConfig,
        ...newConfig,
    });
}
/**
 * Reset configuration to default
 */
function resetQueueManagementConfig() {
    config = null;
}
exports.default = getQueueManagementConfig;
