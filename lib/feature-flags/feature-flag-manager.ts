import { PrismaClient, Prisma, FeatureFlag } from '@prisma/client';
import { Redis } from 'ioredis';


export interface FeatureFlagEvaluation {
  flagName: string;
  enabled: boolean;
  reason: string;
  userId?: string;
  inboxId?: string;
  metadata?: Prisma.JsonObject;
}

export interface ABTestConfig {
  name: string;
  variants: {
    control: { percentage: number; config: Prisma.JsonObject };
    treatment: { percentage: number; config: Prisma.JsonObject };
  };
  metrics: string[];
  startDate: Date;
  endDate?: Date;
}

export class FeatureFlagManager {
  private static instance: FeatureFlagManager;
  private prisma: PrismaClient;
  private redis: Redis;
  private cache: Map<string, FeatureFlag> = new Map();
  private cacheExpiry: Map<string, number> = new Map();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  constructor(prisma: PrismaClient, redis: Redis) {
    this.prisma = prisma;
    this.redis = redis;
  }

  static getInstance(prisma?: PrismaClient, redis?: Redis): FeatureFlagManager {
    if (!FeatureFlagManager.instance) {
      if (!prisma || !redis) {
        throw new Error('Prisma and Redis instances required for first initialization');
      }
      FeatureFlagManager.instance = new FeatureFlagManager(prisma, redis);
    }
    return FeatureFlagManager.instance;
  }

  async setFeatureFlag(
    name: string,
    enabled: boolean,
    rolloutPercentage: number = 100,
    conditions?: Prisma.JsonObject,
    createdBy: string = 'system'
  ): Promise<FeatureFlag> {
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
      this.cache.set(name, flag as FeatureFlag);
      this.cacheExpiry.set(name, Date.now() + this.CACHE_TTL);

      // Store in Redis for distributed cache
      await this.redis.setex(
        `feature_flag:${name}`,
        300, // 5 minutes
        JSON.stringify(flag)
      );

      console.log(`[FeatureFlag] Set flag ${name}: enabled=${enabled}, rollout=${rolloutPercentage}%`);
      return flag as FeatureFlag;
    } catch (error: unknown) {
      console.error(`[FeatureFlag] Error setting flag ${name}:`, error);
      throw error;
    }
  }

  async isEnabled(
    flagName: string,
    userId?: string,
    inboxId?: string,
    metadata?: Prisma.JsonObject
  ): Promise<boolean> {
    const evaluation = await this.evaluate(flagName, userId, inboxId, metadata);
    return evaluation.enabled;
  }

  async evaluate(
    flagName: string,
    userId?: string,
    inboxId?: string,
    metadata?: Prisma.JsonObject
  ): Promise<FeatureFlagEvaluation> {
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
      const rolloutEnabled = await this.checkRolloutPercentage(
        flagName,
        flag.rolloutPercentage,
        userId || inboxId || 'anonymous'
      );

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
      if (flag.conditions && Object.keys(flag.conditions).length > 0) {
        const conditionsMet = await this.evaluateConditions(flag.conditions, {
          userId,
          inboxId,
          metadata,
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
    } catch (error: unknown) {
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

  async gradualRollout(
    flagName: string,
    targetPercentage: number,
    incrementPercentage: number = 10,
    intervalMinutes: number = 30
  ): Promise<void> {
    console.log(`[FeatureFlag] Starting gradual rollout for ${flagName} to ${targetPercentage}%`);
    
    const flag = await this.getFeatureFlag(flagName);
    if (!flag) {
      throw new Error(`Feature flag ${flagName} not found`);
    }

    let currentPercentage = flag.rolloutPercentage;
    
    while (currentPercentage < targetPercentage) {
      const nextPercentage = Math.min(currentPercentage + incrementPercentage, targetPercentage);
      
      await this.setFeatureFlag(
        flagName,
        flag.enabled,
        nextPercentage,
        flag.conditions,
        'gradual-rollout'
      );

      console.log(`[FeatureFlag] Rolled out ${flagName} to ${nextPercentage}%`);
      
      if (nextPercentage < targetPercentage) {
        await new Promise(resolve => setTimeout(resolve, intervalMinutes * 60 * 1000));
      }
      
      currentPercentage = nextPercentage;
    }

    console.log(`[FeatureFlag] Completed gradual rollout for ${flagName}`);
  }

  async createABTest(config: ABTestConfig): Promise<void> {
    console.log(`[FeatureFlag] Creating A/B test: ${config.name}`);
    
    // Create control variant flag
    await this.setFeatureFlag(
      `${config.name}_control`,
      true,
      config.variants.control.percentage,
      { variant: 'control', ...config.variants.control.config },
      'ab-test'
    );

    // Create treatment variant flag
    await this.setFeatureFlag(
      `${config.name}_treatment`,
      true,
      config.variants.treatment.percentage,
      { variant: 'treatment', ...config.variants.treatment.config },
      'ab-test'
    );

    // Store A/B test metadata
    await this.redis.setex(
      `ab_test:${config.name}`,
      60 * 60 * 24 * 30, // 30 days
      JSON.stringify(config)
    );

    console.log(`[FeatureFlag] A/B test ${config.name} created successfully`);
  }

  async rollback(flagName: string, reason: string = 'Emergency rollback'): Promise<void> {
    console.log(`[FeatureFlag] Rolling back flag ${flagName}: ${reason}`);
    
    await this.setFeatureFlag(flagName, false, 0, {}, 'rollback');
    
    // Log rollback event
    await this.redis.lpush(
      'feature_flag_rollbacks',
      JSON.stringify({
        flagName,
        reason,
        timestamp: new Date().toISOString(),
      })
    );

    console.log(`[FeatureFlag] Rollback completed for ${flagName}`);
  }

  async getAllFlags(): Promise<FeatureFlag[]> {
    try {
      return await this.prisma.featureFlag.findMany({
        orderBy: { updatedAt: 'desc' },
      });
    } catch (error: unknown) {
      console.error('[FeatureFlag] Error getting all flags:', error);
      return [];
    }
  }

  async getFeatureFlagMetrics(flagName: string): Promise<{
    evaluations: number;
    enabled: number;
    disabled: number;
    reasons: Record<string, number>;
  }> {
    try {
      const metricsKey = `feature_flag_metrics:${flagName}`;
      const metrics = await this.redis.hgetall(metricsKey);
      
      return {
        evaluations: parseInt(metrics.evaluations || '0'),
        enabled: parseInt(metrics.enabled || '0'),
        disabled: parseInt(metrics.disabled || '0'),
        reasons: JSON.parse(metrics.reasons || '{}'),
      };
    } catch (error: unknown) {
      console.error(`[FeatureFlag] Error getting metrics for ${flagName}:`, error);
      return { evaluations: 0, enabled: 0, disabled: 0, reasons: {} };
    }
  }

  private async getFeatureFlag(name: string): Promise<FeatureFlag | null> {
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
        await this.redis.setex(
          `feature_flag:${name}`,
          300,
          JSON.stringify(flag)
        );
      }

      return flag;
      } catch (error: unknown) {
        console.error(`[FeatureFlag] Error getting flag ${name}:`, error);
        return null;
    }
  }

  private async checkRolloutPercentage(
    flagName: string,
    percentage: number,
    identifier: string
  ): Promise<boolean> {
    if (percentage >= 100) return true;
    if (percentage <= 0) return false;

    // Use consistent hashing to determine if user is in rollout
    const hash = this.hashString(`${flagName}:${identifier}`);
    const bucket = hash % 100;
    
    return bucket < percentage;
  }

  private async evaluateConditions(
    conditions: Prisma.JsonObject,
    context: {
      userId?: string;
      inboxId?: string;
      metadata?: Prisma.JsonObject;
    }
  ): Promise<boolean> {
    // Simple condition evaluation - can be extended
    for (const [key, value] of Object.entries(conditions)) {
      switch (key) {
        case 'inboxId':
          if (context.inboxId !== value) return false;
          break;
        case 'userId':
          if (context.userId !== value) return false;
          break;
        case 'metadata':
          if (!context.metadata) return false;
          for (const [metaKey, metaValue] of Object.entries(value)) {
            if (context.metadata[metaKey] !== metaValue) return false;
          }
          break;
      }
    }
    
    return true;
  }

  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }
}

// Initialize default feature flags
export async function initializeDefaultFeatureFlags(): Promise<void> {
  try {
    const { PrismaClient } = await import('@prisma/client');
    const { Redis } = await import('ioredis');
    
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
      await flagManager.setFeatureFlag(
        flag.name,
        flag.enabled,
        flag.rollout,
        {},
        'system-init'
      );
    }

    console.log('[FeatureFlag] Default feature flags initialized');
  } catch (error: unknown) {
    console.error('[FeatureFlag] Error initializing default flags:', error);
  }
}