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
exports.RollbackManager = void 0;
exports.quickEmergencyRollback = quickEmergencyRollback;
exports.rollbackAllFlags = rollbackAllFlags;
const feature_flag_manager_1 = require("./feature-flag-manager");
function isJsonObject(v) {
    return typeof v === 'object' && v !== null && !Array.isArray(v);
}
class RollbackManager {
    static instance;
    prisma;
    redis;
    featureFlagManager;
    constructor(prisma, redis) {
        this.prisma = prisma;
        this.redis = redis;
        this.featureFlagManager = feature_flag_manager_1.FeatureFlagManager.getInstance(prisma, redis);
    }
    static getInstance(prisma, redis) {
        if (!RollbackManager.instance) {
            if (!prisma || !redis) {
                throw new Error('Prisma and Redis instances required for first initialization');
            }
            RollbackManager.instance = new RollbackManager(prisma, redis);
        }
        return RollbackManager.instance;
    }
    async createRollbackPlan(name, description, flagNames, createdBy = 'system') {
        const planId = `rollback_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const flags = [];
        for (const flagName of flagNames) {
            const currentFlag = await this.featureFlagManager.getAllFlags();
            const flag = currentFlag.find(f => f.name === flagName);
            if (flag) {
                flags.push({
                    flagName,
                    previousState: {
                        enabled: flag.enabled,
                        rolloutPercentage: flag.rolloutPercentage,
                        conditions: isJsonObject(flag.conditions) ? flag.conditions : undefined,
                    },
                    rollbackState: {
                        enabled: false,
                        rolloutPercentage: 0,
                        conditions: {},
                    },
                });
            }
        }
        const plan = {
            id: planId,
            name,
            description,
            flags,
            createdAt: new Date(),
            createdBy,
        };
        // Store rollback plan
        await this.redis.setex(`rollback_plan:${planId}`, 60 * 60 * 24 * 7, // 7 days
        JSON.stringify(plan));
        console.log(`[Rollback] Created rollback plan: ${planId}`);
        return plan;
    }
    async executeRollbackPlan(planId, executedBy = 'system', reason = 'Manual rollback') {
        const startTime = Date.now();
        const errors = [];
        try {
            console.log(`[Rollback] Executing rollback plan: ${planId}`);
            const planData = await this.redis.get(`rollback_plan:${planId}`);
            if (!planData) {
                throw new Error(`Rollback plan ${planId} not found`);
            }
            const plan = JSON.parse(planData);
            // Execute rollback for each flag
            for (const flagConfig of plan.flags) {
                try {
                    await this.featureFlagManager.setFeatureFlag(flagConfig.flagName, flagConfig.rollbackState.enabled, flagConfig.rollbackState.rolloutPercentage, flagConfig.rollbackState.conditions ?? {}, `rollback-${executedBy}`);
                    console.log(`[Rollback] Rolled back flag: ${flagConfig.flagName}`);
                }
                catch (error) {
                    const errorMsg = `Failed to rollback flag ${flagConfig.flagName}: ${error instanceof Error ? error.message : 'Unknown error'}`;
                    errors.push(errorMsg);
                    console.error(`[Rollback] ${errorMsg}`);
                }
            }
            const execution = {
                planId,
                executedAt: new Date(),
                executedBy,
                success: errors.length === 0,
                errors: errors.length > 0 ? errors : undefined,
                duration: Date.now() - startTime,
            };
            // Store execution record
            await this.redis.lpush('rollback_executions', JSON.stringify(execution));
            // Send alert about rollback
            await this.sendRollbackAlert(plan, execution, reason);
            console.log(`[Rollback] Completed rollback plan: ${planId} in ${execution.duration}ms`);
            return execution;
        }
        catch (error) {
            const execution = {
                planId,
                executedAt: new Date(),
                executedBy,
                success: false,
                errors: [error instanceof Error ? error.message : 'Unknown error'],
                duration: Date.now() - startTime,
            };
            await this.redis.lpush('rollback_executions', JSON.stringify(execution));
            console.error(`[Rollback] Failed to execute rollback plan: ${planId}`, error);
            throw error;
        }
    }
    async emergencyRollback(flagNames, reason, executedBy = 'emergency-system') {
        console.log(`[Rollback] EMERGENCY ROLLBACK initiated: ${reason}`);
        const plan = await this.createRollbackPlan('Emergency Rollback', `Emergency rollback: ${reason}`, flagNames, executedBy);
        return await this.executeRollbackPlan(plan.id, executedBy, reason);
    }
    async getAllRollbackPlans() {
        try {
            const keys = await this.redis.keys('rollback_plan:*');
            const plans = [];
            for (const key of keys) {
                const planData = await this.redis.get(key);
                if (planData) {
                    plans.push(JSON.parse(planData));
                }
            }
            return plans.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        }
        catch (error) {
            console.error('[Rollback] Error getting rollback plans:', error);
            return [];
        }
    }
    async getRollbackExecutions(limit = 50) {
        try {
            const executions = await this.redis.lrange('rollback_executions', 0, limit - 1);
            return executions.map(exec => JSON.parse(exec));
        }
        catch (error) {
            console.error('[Rollback] Error getting rollback executions:', error);
            return [];
        }
    }
    async canRollback(flagName) {
        try {
            // Check if flag exists
            const flags = await this.featureFlagManager.getAllFlags();
            const flag = flags.find(f => f.name === flagName);
            if (!flag) {
                return {
                    canRollback: false,
                    reason: 'Flag does not exist',
                };
            }
            // Check recent rollbacks
            const recentExecutions = await this.getRollbackExecutions(10);
            const recentRollback = recentExecutions.find(exec => exec.success &&
                Date.now() - new Date(exec.executedAt).getTime() < 5 * 60 * 1000 // 5 minutes
            );
            if (recentRollback) {
                return {
                    canRollback: false,
                    reason: 'Recent rollback detected, waiting for cooldown',
                    lastRollback: new Date(recentRollback.executedAt),
                };
            }
            return {
                canRollback: true,
                reason: 'Ready for rollback',
            };
        }
        catch (error) {
            return {
                canRollback: false,
                reason: `Error checking rollback status: ${error instanceof Error ? error.message : 'Unknown error'}`,
            };
        }
    }
    async sendRollbackAlert(plan, execution, reason) {
        try {
            const alert = {
                type: 'ROLLBACK_EXECUTED',
                severity: execution.success ? 'WARNING' : 'CRITICAL',
                title: `Rollback Executed: ${plan.name}`,
                message: `Rollback plan "${plan.name}" was executed. Reason: ${reason}`,
                details: {
                    planId: plan.id,
                    executedBy: execution.executedBy,
                    success: execution.success,
                    duration: execution.duration,
                    flagsAffected: plan.flags.map(f => f.flagName),
                    errors: execution.errors,
                },
                timestamp: new Date().toISOString(),
            };
            // Store alert
            await this.redis.lpush('system_alerts', JSON.stringify(alert));
            // Send to monitoring system
            console.log(`[Rollback] Alert sent:`, alert);
        }
        catch (error) {
            console.error('[Rollback] Error sending rollback alert:', error);
        }
    }
}
exports.RollbackManager = RollbackManager;
// Utility functions for emergency scenarios
async function quickEmergencyRollback(flagNames, reason = 'Emergency situation detected') {
    try {
        const { PrismaClient } = await Promise.resolve().then(() => __importStar(require('@prisma/client')));
        const { Redis } = await Promise.resolve().then(() => __importStar(require('ioredis')));
        const prisma = new PrismaClient();
        const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
        const rollbackManager = RollbackManager.getInstance(prisma, redis);
        await rollbackManager.emergencyRollback(flagNames, reason, 'quick-emergency');
        console.log(`[Rollback] Quick emergency rollback completed for flags: ${flagNames.join(', ')}`);
    }
    catch (error) {
        console.error('[Rollback] Quick emergency rollback failed:', error);
        throw error;
    }
}
async function rollbackAllFlags(reason = 'System-wide rollback') {
    try {
        const { PrismaClient } = await Promise.resolve().then(() => __importStar(require('@prisma/client')));
        const { Redis } = await Promise.resolve().then(() => __importStar(require('ioredis')));
        const prisma = new PrismaClient();
        const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
        const featureFlagManager = feature_flag_manager_1.FeatureFlagManager.getInstance(prisma, redis);
        const rollbackManager = RollbackManager.getInstance(prisma, redis);
        const allFlags = await featureFlagManager.getAllFlags();
        const flagNames = allFlags.map(flag => flag.name);
        await rollbackManager.emergencyRollback(flagNames, reason, 'system-wide-rollback');
        console.log(`[Rollback] System-wide rollback completed for ${flagNames.length} flags`);
    }
    catch (error) {
        console.error('[Rollback] System-wide rollback failed:', error);
        throw error;
    }
}
