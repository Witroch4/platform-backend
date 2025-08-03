"use strict";
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
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.FeatureFlagManager = void 0;
exports.initializeDefaultFeatureFlags = initializeDefaultFeatureFlags;
function isJsonObject(v) {
    return typeof v === 'object' && v !== null && !Array.isArray(v);
}
class FeatureFlagManager {
    static instance;
    prisma;
    redis;
    cache = new Map();
    cacheExpiry = new Map();
    CACHE_TTL = 5 * 60 * 1000; // 5 minutes
    constructor(prisma, redis) {
        this.prisma = prisma;
        this.redis = redis;
    }
    static getInstance(prisma, redis) {
        if (!FeatureFlagManager.instance) {
            if (!prisma || !redis) {
                throw new Error('Prisma and Redis instances required for first initialization');
            }
            FeatureFlagManager.instance = new FeatureFlagManager(prisma, redis);
        }
        return FeatureFlagManager.instance;
    }
    async setFeatureFlag(name, enabled, rolloutPercentage = 100, conditions, createdBy = 'system') {
        try {
            // Store in database
            const flag = await this.prisma.featureFlag.upsert({
                where: { name },
                update: {
                    enabled,
                    rolloutPercentage,
                    conditions: conditions || {},
                    updatedAt: new Date(),
                },
                create: {
                    name,
                    description: `Feature flag for ${name}`,
                    enabled,
                    rolloutPercentage,
                    conditions: conditions || {},
                    createdBy,
                },
            });
            // Update cache
            this.cache.set(name, flag);
            this.cacheExpiry.set(name, Date.now() + this.CACHE_TTL);
            // Store in Redis for distributed cache
            await this.redis.setex(`feature_flag:${name}`, 300, // 5 minutes
            JSON.stringify(flag));
            console.log(`[FeatureFlag] Set flag ${name}: enabled=${enabled}, rollout=${rolloutPercentage}%`);
            return flag;
        }
        catch (error) {
            console.error(`[FeatureFlag] Error setting flag ${name}:`, error);
            throw error;
        }
    }
    async isEnabled(flagName, userId, inboxId, metadata) {
        const evaluation = await this.evaluate(flagName, userId, inboxId, metadata);
        return evaluation.enabled;
    }
    async evaluate(flagName, userId, inboxId, metadata) {
        try {
            const flag = await this.getFeatureFlag(flagName);
            if (!flag) {
                return {
                    flagName,
                    enabled: false,
                    reason: 'Flag not found',
                    userId,
                    inboxId,
                    metadata,
                };
            }
            if (!flag.enabled) {
                return {
                    flagName,
                    enabled: false,
                    reason: 'Flag disabled',
                    userId,
                    inboxId,
                    metadata,
                };
            }
            // Check rollout percentage
            const rolloutEnabled = await this.checkRolloutPercentage(flagName, flag.rolloutPercentage, userId || inboxId || 'anonymous');
            if (!rolloutEnabled) {
                return {
                    flagName,
                    enabled: false,
                    reason: `Outside rollout percentage (${flag.rolloutPercentage}%)`,
                    userId,
                    inboxId,
                    metadata,
                };
            }
            // Check conditions
            if (flag.conditions) {
                const conditionsMet = await this.evaluateConditions(isJsonObject(flag.conditions) ? flag.conditions : {}, {
                    userId,
                    inboxId,
                    metadata: isJsonObject(metadata) ? metadata : {},
                });
                if (!conditionsMet) {
                    return {
                        flagName,
                        enabled: false,
                        reason: 'Conditions not met',
                        userId,
                        inboxId,
                        metadata,
                    };
                }
            }
            return {
                flagName,
                enabled: true,
                reason: 'All checks passed',
                userId,
                inboxId,
                metadata,
            };
        }
        catch (error) {
            console.error(`[FeatureFlag] Error evaluating flag ${flagName}:`, error);
            return {
                flagName,
                enabled: false,
                reason: `Evaluation error: ${error instanceof Error ? error.message : 'Unknown error'}`,
                userId,
                inboxId,
                metadata,
            };
        }
    }
    async gradualRollout(flagName, targetPercentage, incrementPercentage = 10, intervalMinutes = 30) {
        console.log(`[FeatureFlag] Starting gradual rollout for ${flagName} to ${targetPercentage}%`);
        const flag = await this.getFeatureFlag(flagName);
        if (!flag) {
            throw new Error(`Feature flag ${flagName} not found`);
        }
        let currentPercentage = flag.rolloutPercentage;
        while (currentPercentage < targetPercentage) {
            const nextPercentage = Math.min(currentPercentage + incrementPercentage, targetPercentage);
            await this.setFeatureFlag(flagName, flag.enabled, nextPercentage, flag.conditions, 'gradual-rollout');
            console.log(`[FeatureFlag] Rolled out ${flagName} to ${nextPercentage}%`);
            if (nextPercentage < targetPercentage) {
                await new Promise(resolve => setTimeout(resolve, intervalMinutes * 60 * 1000));
            }
            currentPercentage = nextPercentage;
        }
        console.log(`[FeatureFlag] Completed gradual rollout for ${flagName}`);
    }
    async createABTest(config) {
        console.log(`[FeatureFlag] Creating A/B test: ${config.name}`);
        // Create control variant flag
        await this.setFeatureFlag(`${config.name}_control`, true, config.variants.control.percentage, { variant: 'control', ...config.variants.control.config }, 'ab-test');
        // Create treatment variant flag
        await this.setFeatureFlag(`${config.name}_treatment`, true, config.variants.treatment.percentage, { variant: 'treatment', ...config.variants.treatment.config }, 'ab-test');
        // Store A/B test metadata
        await this.redis.setex(`ab_test:${config.name}`, 60 * 60 * 24 * 30, // 30 days
        JSON.stringify(config));
        console.log(`[FeatureFlag] A/B test ${config.name} created successfully`);
    }
    async rollback(flagName, reason = 'Emergency rollback') {
        console.log(`[FeatureFlag] Rolling back flag ${flagName}: ${reason}`);
        await this.setFeatureFlag(flagName, false, 0, {}, 'rollback');
        // Log rollback event
        await this.redis.lpush('feature_flag_rollbacks', JSON.stringify({
            flagName,
            reason,
            timestamp: new Date().toISOString(),
        }));
        console.log(`[FeatureFlag] Rollback completed for ${flagName}`);
    }
    async getAllFlags() {
        try {
            return await this.prisma.featureFlag.findMany({
                orderBy: { updatedAt: 'desc' },
            });
        }
        catch (error) {
            console.error('[FeatureFlag] Error getting all flags:', error);
            return [];
        }
    }
    async getFeatureFlagMetrics(flagName) {
        try {
            const metricsKey = `feature_flag_metrics:${flagName}`;
            const metrics = await this.redis.hgetall(metricsKey);
            return {
                evaluations: parseInt(metrics.evaluations || '0'),
                enabled: parseInt(metrics.enabled || '0'),
                disabled: parseInt(metrics.disabled || '0'),
                reasons: JSON.parse(metrics.reasons || '{}'),
            };
        }
        catch (error) {
            console.error(`[FeatureFlag] Error getting metrics for ${flagName}:`, error);
            return { evaluations: 0, enabled: 0, disabled: 0, reasons: {} };
        }
    }
    async getFeatureFlag(name) {
        // Check memory cache first
        const cached = this.cache.get(name);
        const expiry = this.cacheExpiry.get(name);
        if (cached && expiry && Date.now() < expiry) {
            return cached;
        }
        try {
            // Check Redis cache
            const redisValue = await this.redis.get(`feature_flag:${name}`);
            if (redisValue) {
                const flag = JSON.parse(redisValue);
                this.cache.set(name, flag);
                this.cacheExpiry.set(name, Date.now() + this.CACHE_TTL);
                return flag;
            }
            // Fallback to database
            const flag = await this.prisma.featureFlag.findUnique({
                where: { name },
            });
            if (flag) {
                this.cache.set(name, flag);
                this.cacheExpiry.set(name, Date.now() + this.CACHE_TTL);
                // Update Redis cache
                await this.redis.setex(`feature_flag:${name}`, 300, JSON.stringify(flag));
            }
            return flag;
        }
        catch (error) {
            console.error(`[FeatureFlag] Error getting flag ${name}:`, error);
            return null;
        }
    }
    async checkRolloutPercentage(flagName, percentage, identifier) {
        if (percentage >= 100)
            return true;
        if (percentage <= 0)
            return false;
        // Use consistent hashing to determine if user is in rollout
        const hash = this.hashString(`${flagName}:${identifier}`);
        const bucket = hash % 100;
        return bucket < percentage;
    }
    async evaluateConditions(conditions, context) {
        // Simple condition evaluation - can be extended
        for (const [key, value] of Object.entries(conditions)) {
            switch (key) {
                case 'inboxId':
                    if (context.inboxId !== value)
                        return false;
                    break;
                case 'userId':
                    if (context.userId !== value)
                        return false;
                    break;
                case 'metadata':
                    if (!isJsonObject(context.metadata))
                        return false;
                    if (isJsonObject(value)) {
                        for (const [metaKey, metaValue] of Object.entries(value)) {
                            if (context.metadata[metaKey] !== metaValue)
                                return false;
                        }
                    }
                    break;
            }
        }
        return true;
    }
    hashString(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return Math.abs(hash);
    }
}
exports.FeatureFlagManager = FeatureFlagManager;
// Initialize default feature flags
async function initializeDefaultFeatureFlags() {
    try {
        const { PrismaClient } = await Promise.resolve().then(() => __importStar(require('@prisma/client')));
        const { Redis } = await Promise.resolve().then(() => __importStar(require('ioredis')));
        const prisma = new PrismaClient();
        const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
        const flagManager = FeatureFlagManager.getInstance(prisma, redis);
        // Initialize system feature flags
        const defaultFlags = [
            { name: 'NEW_WEBHOOK_PROCESSING', enabled: false, rollout: 0 },
            { name: 'HIGH_PRIORITY_QUEUE', enabled: true, rollout: 100 },
            { name: 'LOW_PRIORITY_QUEUE', enabled: true, rollout: 100 },
            { name: 'UNIFIED_LEAD_MODEL', enabled: true, rollout: 100 },
            { name: 'INTELLIGENT_CACHING', enabled: true, rollout: 100 },
            { name: 'APPLICATION_MONITORING', enabled: true, rollout: 100 },
            { name: 'GRADUAL_ROLLOUT_ENABLED', enabled: true, rollout: 100 },
            { name: 'AB_TESTING_ENABLED', enabled: true, rollout: 100 },
        ];
        for (const flag of defaultFlags) {
            await flagManager.setFeatureFlag(flag.name, flag.enabled, flag.rollout, {}, 'system-init');
        }
        console.log('[FeatureFlag] Default feature flags initialized');
    }
    catch (error) {
        console.error('[FeatureFlag] Error initializing default flags:', error);
    }
}
