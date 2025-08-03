"use strict";
/**
 * Queue Configuration Manager Service
 * Centralized management of queue configurations with caching, validation, and audit support
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.QueueConfigManager = void 0;
const config_1 = require("../types/config");
const config_validation_1 = require("../validation/config-validation");
class QueueConfigManager {
    prisma;
    redis;
    options;
    configCache = new Map();
    systemConfigCache = new Map();
    constructor(prisma, redis, options = {}) {
        this.prisma = prisma;
        this.redis = redis;
        this.options = {
            cacheEnabled: options.cacheEnabled ?? true,
            cacheTTL: options.cacheTTL ?? 3600, // 1 hour
            validateOnSave: options.validateOnSave ?? true,
            auditChanges: options.auditChanges ?? true
        };
    }
    /**
     * Creates a new queue configuration
     */
    async createQueueConfig(config) {
        // Validate configuration
        if (this.options.validateOnSave) {
            const validation = (0, config_validation_1.validateQueueConfigComprehensive)(config);
            if (!validation.isValid) {
                throw new Error(`Invalid queue configuration: ${validation.errors.map(e => e.message).join(', ')}`);
            }
        }
        // Check if queue name already exists
        const existing = await this.getQueueConfig(config.name);
        if (existing) {
            throw new Error(`Queue configuration with name '${config.name}' already exists`);
        }
        // Merge with defaults (user config takes precedence)
        const configWithDefaults = {
            ...config_1.DEFAULT_QUEUE_CONFIG,
            ...config,
            createdAt: new Date(),
            updatedAt: new Date()
        };
        // Save to database
        const savedConfig = await this.prisma.queueConfig.create({
            data: {
                name: configWithDefaults.name,
                displayName: configWithDefaults.displayName,
                description: configWithDefaults.description,
                priority: configWithDefaults.priority,
                concurrency: configWithDefaults.concurrency,
                rateLimiter: configWithDefaults.rateLimiter,
                retryPolicy: configWithDefaults.retryPolicy,
                cleanupPolicy: configWithDefaults.cleanupPolicy,
                alertThresholds: configWithDefaults.alertThresholds,
                createdBy: configWithDefaults.createdBy
            }
        });
        const result = this.mapPrismaToQueueConfig(savedConfig);
        // Cache the result
        if (this.options.cacheEnabled) {
            await this.cacheQueueConfig(result);
        }
        // Audit log
        if (this.options.auditChanges) {
            await this.auditConfigChange('CREATE', 'queue_config', result.id, config.createdBy, result);
        }
        return result;
    }
    /**
     * Retrieves a queue configuration by name
     */
    async getQueueConfig(queueName) {
        // Check cache first
        if (this.options.cacheEnabled) {
            const cached = await this.getCachedQueueConfig(queueName);
            if (cached) {
                return cached;
            }
        }
        // Query database
        const config = await this.prisma.queueConfig.findUnique({
            where: { name: queueName }
        });
        if (!config) {
            return null;
        }
        const result = this.mapPrismaToQueueConfig(config);
        // Cache the result
        if (this.options.cacheEnabled) {
            await this.cacheQueueConfig(result);
        }
        return result;
    }
    /**
     * Retrieves all queue configurations
     */
    async getAllQueueConfigs() {
        const configs = await this.prisma.queueConfig.findMany({
            orderBy: [
                { priority: 'desc' },
                { name: 'asc' }
            ]
        });
        return configs.map(config => this.mapPrismaToQueueConfig(config));
    }
    /**
     * Updates an existing queue configuration
     */
    async updateQueueConfig(queueName, updates, updatedBy) {
        // Get existing config
        const existing = await this.getQueueConfig(queueName);
        if (!existing) {
            throw new Error(`Queue configuration '${queueName}' not found`);
        }
        // Merge updates with existing config
        const updatedConfig = {
            ...existing,
            ...updates,
            updatedAt: new Date()
        };
        // Validate updated configuration
        if (this.options.validateOnSave) {
            const validation = (0, config_validation_1.validateQueueConfigComprehensive)(updatedConfig);
            if (!validation.isValid) {
                throw new Error(`Invalid queue configuration: ${validation.errors.map(e => e.message).join(', ')}`);
            }
        }
        // Update in database
        const savedConfig = await this.prisma.queueConfig.update({
            where: { name: queueName },
            data: {
                displayName: updatedConfig.displayName,
                description: updatedConfig.description,
                priority: updatedConfig.priority,
                concurrency: updatedConfig.concurrency,
                rateLimiter: updatedConfig.rateLimiter,
                retryPolicy: updatedConfig.retryPolicy,
                cleanupPolicy: updatedConfig.cleanupPolicy,
                alertThresholds: updatedConfig.alertThresholds,
                updatedAt: updatedConfig.updatedAt
            }
        });
        const result = this.mapPrismaToQueueConfig(savedConfig);
        // Update cache
        if (this.options.cacheEnabled) {
            await this.cacheQueueConfig(result);
        }
        // Audit log
        if (this.options.auditChanges) {
            await this.auditConfigChange('UPDATE', 'queue_config', result.id, updatedBy, result, existing);
        }
        return result;
    }
    /**
     * Deletes a queue configuration
     */
    async deleteQueueConfig(queueName, deletedBy) {
        // Get existing config for audit
        const existing = await this.getQueueConfig(queueName);
        if (!existing) {
            return false;
        }
        // Delete from database
        await this.prisma.queueConfig.delete({
            where: { name: queueName }
        });
        // Remove from cache
        if (this.options.cacheEnabled) {
            await this.removeCachedQueueConfig(queueName);
        }
        // Audit log
        if (this.options.auditChanges) {
            await this.auditConfigChange('DELETE', 'queue_config', existing.id, deletedBy, null, existing);
        }
        return true;
    }
    /**
     * Gets a system configuration value
     */
    async getSystemConfig(key) {
        // Check cache first
        if (this.options.cacheEnabled && this.systemConfigCache.has(key)) {
            return this.systemConfigCache.get(key);
        }
        // Query database
        const config = await this.prisma.systemConfig.findUnique({
            where: { key }
        });
        if (!config) {
            return null;
        }
        const value = config.value;
        // Cache the result
        if (this.options.cacheEnabled) {
            this.systemConfigCache.set(key, value);
            // Set Redis cache if available
            if (this.redis) {
                await this.redis.setex(`system_config:${key}`, this.options.cacheTTL, JSON.stringify(value));
            }
        }
        return value;
    }
    /**
     * Sets a system configuration value
     */
    async setSystemConfig(key, value, updatedBy, description) {
        // Validate the key
        if (!(0, config_validation_1.isValidSystemConfigKey)(key)) {
            throw new Error(`Invalid system configuration key: ${key}`);
        }
        // Validate the configuration
        const configToValidate = { key, value, updatedBy, description };
        const validation = (0, config_validation_1.validateSystemConfig)(configToValidate);
        if (!validation.isValid) {
            throw new Error(`Invalid system configuration: ${validation.errors.map(e => e.message).join(', ')}`);
        }
        // Upsert in database
        await this.prisma.systemConfig.upsert({
            where: { key },
            update: {
                value: value,
                description,
                updatedAt: new Date(),
                updatedBy
            },
            create: {
                key,
                value: value,
                description,
                updatedBy
            }
        });
        // Update cache
        if (this.options.cacheEnabled) {
            this.systemConfigCache.set(key, value);
            // Update Redis cache if available
            if (this.redis) {
                await this.redis.setex(`system_config:${key}`, this.options.cacheTTL, JSON.stringify(value));
            }
        }
        // Audit log
        if (this.options.auditChanges) {
            await this.auditConfigChange('UPDATE', 'system_config', key, updatedBy, { key, value });
        }
    }
    /**
     * Gets all system configurations
     */
    async getAllSystemConfigs() {
        const configs = await this.prisma.systemConfig.findMany({
            orderBy: [
                { category: 'asc' },
                { key: 'asc' }
            ]
        });
        return configs.map(config => ({
            id: config.id,
            key: config.key,
            value: config.value,
            description: config.description,
            category: config.category,
            createdAt: config.createdAt,
            updatedAt: config.updatedAt,
            updatedBy: config.updatedBy
        }));
    }
    /**
     * Validates a queue configuration without saving
     */
    validateConfig(config) {
        return (0, config_validation_1.validateQueueConfigComprehensive)(config);
    }
    /**
     * Clears all cached configurations
     */
    async clearCache() {
        this.configCache.clear();
        this.systemConfigCache.clear();
        if (this.redis) {
            const keys = await this.redis.keys('queue_config:*');
            const systemKeys = await this.redis.keys('system_config:*');
            if (keys.length > 0) {
                await this.redis.del(...keys);
            }
            if (systemKeys.length > 0) {
                await this.redis.del(...systemKeys);
            }
        }
    }
    /**
     * Gets configuration statistics
     */
    async getConfigStats() {
        const [totalQueues, totalSystemConfigs] = await Promise.all([
            this.prisma.queueConfig.count(),
            this.prisma.systemConfig.count()
        ]);
        // For simplicity, we'll consider all queues as active
        // In a real implementation, this would check actual queue status
        const activeQueues = totalQueues;
        return {
            totalQueues,
            activeQueues,
            totalSystemConfigs
        };
    }
    // Private helper methods
    mapPrismaToQueueConfig(prismaConfig) {
        return {
            id: prismaConfig.id,
            name: prismaConfig.name,
            displayName: prismaConfig.displayName,
            description: prismaConfig.description,
            priority: prismaConfig.priority,
            concurrency: prismaConfig.concurrency,
            rateLimiter: prismaConfig.rateLimiter,
            retryPolicy: prismaConfig.retryPolicy,
            cleanupPolicy: prismaConfig.cleanupPolicy,
            alertThresholds: prismaConfig.alertThresholds,
            createdAt: prismaConfig.createdAt,
            updatedAt: prismaConfig.updatedAt,
            createdBy: prismaConfig.createdBy
        };
    }
    async cacheQueueConfig(config) {
        this.configCache.set(config.name, config);
        if (this.redis) {
            await this.redis.setex(`queue_config:${config.name}`, this.options.cacheTTL, JSON.stringify(config));
        }
    }
    async getCachedQueueConfig(queueName) {
        // Check in-memory cache first
        const memoryCache = this.configCache.get(queueName);
        if (memoryCache) {
            return memoryCache;
        }
        // Check Redis cache
        if (this.redis) {
            const cached = await this.redis.get(`queue_config:${queueName}`);
            if (cached) {
                const config = JSON.parse(cached);
                // Update in-memory cache
                this.configCache.set(queueName, config);
                return config;
            }
        }
        return null;
    }
    async removeCachedQueueConfig(queueName) {
        this.configCache.delete(queueName);
        if (this.redis) {
            await this.redis.del(`queue_config:${queueName}`);
        }
    }
    async auditConfigChange(action, resourceType, resourceId, userId, newValue, oldValue) {
        try {
            await this.prisma.auditLog.create({
                data: {
                    userId,
                    action: `CONFIG_${action}`,
                    resourceType,
                    resourceId,
                    details: {
                        action,
                        resourceType,
                        resourceId,
                        newValue,
                        oldValue,
                        timestamp: new Date().toISOString()
                    }
                }
            });
        }
        catch (error) {
            // Log error but don't fail the main operation
            console.error('Failed to create audit log:', error);
        }
    }
}
exports.QueueConfigManager = QueueConfigManager;
