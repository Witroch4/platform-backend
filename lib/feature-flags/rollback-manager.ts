import { PrismaClient, Prisma } from '@prisma/client';
import { Redis } from 'ioredis';
import { FeatureFlagManager } from './feature-flag-manager';

type J = Prisma.JsonValue;
type JObj = Prisma.JsonObject;

function isJsonObject(v: J | undefined | null): v is JObj {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export interface RollbackPlan {
  id: string;
  name: string;
  description: string;
  flags: {
    flagName: string;
    previousState: {
      enabled: boolean;
      rolloutPercentage: number;
      conditions?: Record<string, any>;
    };
    rollbackState: {
      enabled: boolean;
      rolloutPercentage: number;
      conditions?: Record<string, any>;
    };
  }[];
  createdAt: Date;
  createdBy: string;
}

export interface RollbackExecution {
  planId: string;
  executedAt: Date;
  executedBy: string;
  success: boolean;
  errors?: string[];
  duration: number;
}

export class RollbackManager {
  private static instance: RollbackManager;
  private prisma: PrismaClient;
  private redis: Redis;
  private featureFlagManager: FeatureFlagManager;

  constructor(prisma: PrismaClient, redis: Redis) {
    this.prisma = prisma;
    this.redis = redis;
    this.featureFlagManager = FeatureFlagManager.getInstance(prisma, redis);
  }

  static getInstance(prisma?: PrismaClient, redis?: Redis): RollbackManager {
    if (!RollbackManager.instance) {
      if (!prisma || !redis) {
        throw new Error('Prisma and Redis instances required for first initialization');
      }
      RollbackManager.instance = new RollbackManager(prisma, redis);
    }
    return RollbackManager.instance;
  }

  async createRollbackPlan(
    name: string,
    description: string,
    flagNames: string[],
    createdBy: string = 'system'
  ): Promise<RollbackPlan> {
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

    const plan: RollbackPlan = {
      id: planId,
      name,
      description,
      flags,
      createdAt: new Date(),
      createdBy,
    };

    // Store rollback plan
    await this.redis.setex(
      `rollback_plan:${planId}`,
      60 * 60 * 24 * 7, // 7 days
      JSON.stringify(plan)
    );

    console.log(`[Rollback] Created rollback plan: ${planId}`);
    return plan;
  }

  async executeRollbackPlan(
    planId: string,
    executedBy: string = 'system',
    reason: string = 'Manual rollback'
  ): Promise<RollbackExecution> {
    const startTime = Date.now();
    const errors: string[] = [];
    
    try {
      console.log(`[Rollback] Executing rollback plan: ${planId}`);
      
      const planData = await this.redis.get(`rollback_plan:${planId}`);
      if (!planData) {
        throw new Error(`Rollback plan ${planId} not found`);
      }

      const plan: RollbackPlan = JSON.parse(planData);
      
      // Execute rollback for each flag
      for (const flagConfig of plan.flags) {
        try {
          await this.featureFlagManager.setFeatureFlag(
            flagConfig.flagName,
            flagConfig.rollbackState.enabled,
            flagConfig.rollbackState.rolloutPercentage,
            flagConfig.rollbackState.conditions ?? {},
            `rollback-${executedBy}`
          );
          
          console.log(`[Rollback] Rolled back flag: ${flagConfig.flagName}`);
          } catch (error: unknown) {
            const errorMsg = `Failed to rollback flag ${flagConfig.flagName}: ${error instanceof Error ? error.message : 'Unknown error'}`;
            errors.push(errorMsg);
            console.error(`[Rollback] ${errorMsg}`);
          }
      }

      const execution: RollbackExecution = {
        planId,
        executedAt: new Date(),
        executedBy,
        success: errors.length === 0,
        errors: errors.length > 0 ? errors : undefined,
        duration: Date.now() - startTime,
      };

      // Store execution record
      await this.redis.lpush(
        'rollback_executions',
        JSON.stringify(execution)
      );

      // Send alert about rollback
      await this.sendRollbackAlert(plan, execution, reason);

      console.log(`[Rollback] Completed rollback plan: ${planId} in ${execution.duration}ms`);
      return execution;
      } catch (error: unknown) {
        const execution: RollbackExecution = {
        planId,
        executedAt: new Date(),
        executedBy,
        success: false,
        errors: [error instanceof Error ? error.message : 'Unknown error'],
        duration: Date.now() - startTime,
      };

      await this.redis.lpush(
        'rollback_executions',
        JSON.stringify(execution)
      );

      console.error(`[Rollback] Failed to execute rollback plan: ${planId}`, error);
      throw error;
    }
  }

  async emergencyRollback(
    flagNames: string[],
    reason: string,
    executedBy: string = 'emergency-system'
  ): Promise<RollbackExecution> {
    console.log(`[Rollback] EMERGENCY ROLLBACK initiated: ${reason}`);
    
    const plan = await this.createRollbackPlan(
      'Emergency Rollback',
      `Emergency rollback: ${reason}`,
      flagNames,
      executedBy
    );

    return await this.executeRollbackPlan(plan.id, executedBy, reason);
  }

  async getAllRollbackPlans(): Promise<RollbackPlan[]> {
    try {
      const keys = await this.redis.keys('rollback_plan:*');
      const plans: RollbackPlan[] = [];
      
      for (const key of keys) {
        const planData = await this.redis.get(key);
        if (planData) {
          plans.push(JSON.parse(planData));
        }
      }
      
      return plans.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      } catch (error: unknown) {
        console.error('[Rollback] Error getting rollback plans:', error);
        return [];
      }
  }

  async getRollbackExecutions(limit: number = 50): Promise<RollbackExecution[]> {
    try {
      const executions = await this.redis.lrange('rollback_executions', 0, limit - 1);
      return executions.map(exec => JSON.parse(exec));
      } catch (error: unknown) {
        console.error('[Rollback] Error getting rollback executions:', error);
        return [];
      }
  }

  async canRollback(flagName: string): Promise<{
    canRollback: boolean;
    reason: string;
    lastRollback?: Date;
  }> {
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
      const recentRollback = recentExecutions.find(exec => 
        exec.success && 
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
      } catch (error: unknown) {
        return {
          canRollback: false,
          reason: `Error checking rollback status: ${error instanceof Error ? error.message : 'Unknown error'}`,
        };
      }
  }

  private async sendRollbackAlert(
    plan: RollbackPlan,
    execution: RollbackExecution,
    reason: string
  ): Promise<void> {
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
      } catch (error: unknown) {
        console.error('[Rollback] Error sending rollback alert:', error);
      }
  }
}

// Utility functions for emergency scenarios
export async function quickEmergencyRollback(
  flagNames: string[],
  reason: string = 'Emergency situation detected'
): Promise<void> {
  try {
    const { PrismaClient } = await import('@prisma/client');
    const { Redis } = await import('ioredis');
    
    const prisma = new PrismaClient();
    const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
    
    const rollbackManager = RollbackManager.getInstance(prisma, redis);
    
    await rollbackManager.emergencyRollback(flagNames, reason, 'quick-emergency');
    
    console.log(`[Rollback] Quick emergency rollback completed for flags: ${flagNames.join(', ')}`);
  } catch (error: unknown) {
    console.error('[Rollback] Quick emergency rollback failed:', error);
    throw error;
  }
}

export async function rollbackAllFlags(reason: string = 'System-wide rollback'): Promise<void> {
  try {
    const { PrismaClient } = await import('@prisma/client');
    const { Redis } = await import('ioredis');
    
    const prisma = new PrismaClient();
    const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
    
    const featureFlagManager = FeatureFlagManager.getInstance(prisma, redis);
    const rollbackManager = RollbackManager.getInstance(prisma, redis);
    
    const allFlags = await featureFlagManager.getAllFlags();
    const flagNames = allFlags.map(flag => flag.name);
    
    await rollbackManager.emergencyRollback(flagNames, reason, 'system-wide-rollback');
    
    console.log(`[Rollback] System-wide rollback completed for ${flagNames.length} flags`);
  } catch (error: unknown) {
    console.error('[Rollback] System-wide rollback failed:', error);
    throw error;
  }
}