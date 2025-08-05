/**
 * Feature Flag Service
 * Based on requirements 16.1, 16.2, 16.3, 16.4
 */

// Lazy import to avoid Edge Runtime issues
type Redis = any;
import { getPrismaInstance } from '@/lib/connections';
import { 
  FeatureFlag, 
  FeatureFlagEvaluation, 
  FeatureFlagContext, 
  FeatureFlagConfig,
  FeatureFlagOverride,
  FeatureFlagMetrics,
  FeatureFlagAudit,
  FeatureFlagService as IFeatureFlagService,
  AI_FEATURE_FLAGS
} from '../types/feature-flags';
import log from '@/lib/log';
import crypto from 'crypto';

export class FeatureFlagService implements IFeatureFlagService {
  private redis: Redis;
  private config: FeatureFlagConfig;

  constructor(redis: Redis) {
    this.redis = redis;
    this.config = {
      source: (process.env.FEATURE_FLAG_SOURCE as any) || 'database',
      priority: 'inbox', // inbox > account > global
      cacheEnabled: process.env.FEATURE_FLAG_CACHE_ENABLED !== 'false',
      cacheTtlSeconds: parseInt(process.env.FEATURE_FLAG_CACHE_TTL || '300'), // 5 minutes
      evaluationLogging: process.env.FEATURE_FLAG_EVALUATION_LOGGING === 'true'
    };
  }

  /**
   * Check if a feature flag is enabled for the given context
   */
  async isEnabled(flagId: string, context: FeatureFlagContext): Promise<boolean> {
    const evaluation = await this.evaluate(flagId, context);
    return evaluation.enabled;
  }

  /**
   * Evaluate a feature flag with full context and reasoning
   */
  async evaluate(flagId: string, context: FeatureFlagContext): Promise<FeatureFlagEvaluation> {
    const startTime = Date.now();
    
    try {
      // Check cache first
      if (this.config.cacheEnabled) {
        const cached = await this.getCachedEvaluation(flagId, context);
        if (cached) {
          await this.recordMetrics(flagId, cached.enabled, Date.now() - startTime);
          return cached;
        }
      }

      // Check for overrides first (highest priority)
      const override = await this.getOverride(flagId, context);
      if (override) {
        const evaluation: FeatureFlagEvaluation = {
          flagId,
          enabled: override.enabled,
          reason: `Override: ${override.reason}`,
          evaluatedAt: new Date(),
          context
        };
        
        await this.cacheEvaluation(evaluation);
        await this.recordMetrics(flagId, evaluation.enabled, Date.now() - startTime);
        return evaluation;
      }

      // Get flag configuration
      const flag = await this.getFlag(flagId);
      if (!flag) {
        const evaluation: FeatureFlagEvaluation = {
          flagId,
          enabled: false,
          reason: 'Flag not found',
          evaluatedAt: new Date(),
          context
        };
        
        await this.recordMetrics(flagId, false, Date.now() - startTime, true);
        return evaluation;
      }

      // Evaluate based on rules
      const evaluation = await this.evaluateFlag(flag, context);
      
      // Cache the result
      if (this.config.cacheEnabled) {
        await this.cacheEvaluation(evaluation);
      }

      // Log evaluation if enabled
      if (this.config.evaluationLogging) {
        await this.logEvaluation(evaluation);
      }

      await this.recordMetrics(flagId, evaluation.enabled, Date.now() - startTime);
      return evaluation;

    } catch (error) {
      log.error('Feature flag evaluation error', { flagId, context, error });
      
      await this.recordMetrics(flagId, false, Date.now() - startTime, true);
      
      // Return safe default (disabled)
      return {
        flagId,
        enabled: false,
        reason: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        evaluatedAt: new Date(),
        context
      };
    }
  }

  /**
   * Get a feature flag by ID
   */
  async getFlag(flagId: string): Promise<FeatureFlag | null> {
    // Check environment variables first for built-in flags
    if (Object.values(AI_FEATURE_FLAGS).includes(flagId as any)) {
      return this.getBuiltInFlag(flagId);
    }

    // Check database
    try {
      // This would be implemented with actual database schema
      // For now, return null as we don't have the schema yet
      return null;
    } catch (error) {
      log.error('Error fetching flag from database', { flagId, error });
      return null;
    }
  }

  /**
   * Create a new feature flag
   */
  async createFlag(flag: Omit<FeatureFlag, 'id' | 'createdAt' | 'updatedAt'>): Promise<FeatureFlag> {
    const newFlag: FeatureFlag = {
      ...flag,
      id: crypto.randomUUID(),
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // This would be implemented with actual database operations
    log.info('Feature flag created', { flagId: newFlag.id, name: newFlag.name });
    
    return newFlag;
  }

  /**
   * Update an existing feature flag
   */
  async updateFlag(flagId: string, updates: Partial<FeatureFlag>): Promise<FeatureFlag> {
    const existingFlag = await this.getFlag(flagId);
    if (!existingFlag) {
      throw new Error(`Flag ${flagId} not found`);
    }

    const updatedFlag: FeatureFlag = {
      ...existingFlag,
      ...updates,
      updatedAt: new Date()
    };

    // Clear cache
    await this.clearFlagCache(flagId);

    log.info('Feature flag updated', { flagId, updates });
    
    return updatedFlag;
  }

  /**
   * Delete a feature flag
   */
  async deleteFlag(flagId: string): Promise<void> {
    // This would be implemented with actual database operations
    await this.clearFlagCache(flagId);
    
    log.info('Feature flag deleted', { flagId });
  }

  /**
   * List all feature flags
   */
  async listFlags(): Promise<FeatureFlag[]> {
    // This would be implemented with actual database operations
    return [];
  }

  /**
   * Create an override for a feature flag
   */
  async override(override: Omit<FeatureFlagOverride, 'createdAt'>): Promise<void> {
    const overrideWithTimestamp: FeatureFlagOverride = {
      ...override,
      createdAt: new Date()
    };

    const key = this.getOverrideKey(override.flagId, override.accountId, override.inboxId);
    await this.redis.setex(key, 86400, JSON.stringify(overrideWithTimestamp)); // 24h TTL

    // Clear related cache
    await this.clearFlagCache(override.flagId);

    log.info('Feature flag override created', { 
      flagId: override.flagId, 
      accountId: override.accountId,
      inboxId: override.inboxId,
      enabled: override.enabled 
    });
  }

  /**
   * Remove an override for a feature flag
   */
  async removeOverride(flagId: string, accountId?: number, inboxId?: number): Promise<void> {
    const key = this.getOverrideKey(flagId, accountId, inboxId);
    await this.redis.del(key);
    
    // Clear related cache
    await this.clearFlagCache(flagId);

    log.info('Feature flag override removed', { flagId, accountId, inboxId });
  }

  /**
   * Get metrics for a feature flag
   */
  async getMetrics(flagId: string): Promise<FeatureFlagMetrics> {
    const metricsKey = `ff_metrics:${flagId}`;
    const metrics = await this.redis.hmget(
      metricsKey, 
      'evaluations', 
      'enabled', 
      'disabled', 
      'errors', 
      'lastEvaluated', 
      'totalLatency'
    );

    const evaluations = parseInt(metrics[0] || '0');
    const enabled = parseInt(metrics[1] || '0');
    const disabled = parseInt(metrics[2] || '0');
    const errors = parseInt(metrics[3] || '0');
    const lastEvaluated = metrics[4] ? new Date(parseInt(metrics[4])) : new Date();
    const totalLatency = parseInt(metrics[5] || '0');

    return {
      flagId,
      evaluations,
      enabledCount: enabled,
      disabledCount: disabled,
      errorCount: errors,
      lastEvaluatedAt: lastEvaluated,
      averageLatencyMs: evaluations > 0 ? totalLatency / evaluations : 0
    };
  }

  /**
   * Get audit log for a feature flag
   */
  async getAuditLog(flagId: string, limit: number = 100): Promise<FeatureFlagAudit[]> {
    // This would be implemented with actual database operations
    return [];
  }

  private async evaluateFlag(flag: FeatureFlag, context: FeatureFlagContext): Promise<FeatureFlagEvaluation> {
    // If flag is globally disabled
    if (!flag.enabled) {
      return {
        flagId: flag.id,
        enabled: false,
        reason: 'Flag globally disabled',
        evaluatedAt: new Date(),
        context
      };
    }

    // Check inbox-specific rules (highest priority)
    if (context.inboxId && flag.inboxIds?.includes(context.inboxId)) {
      return {
        flagId: flag.id,
        enabled: true,
        reason: 'Inbox whitelist match',
        evaluatedAt: new Date(),
        context
      };
    }

    // Check account-specific rules
    if (flag.accountIds?.includes(context.accountId)) {
      return {
        flagId: flag.id,
        enabled: true,
        reason: 'Account whitelist match',
        evaluatedAt: new Date(),
        context
      };
    }

    // Check rollout percentage
    if (flag.rolloutPercentage > 0) {
      const hash = this.hashContext(flag.id, context);
      const percentage = (hash % 100) + 1;
      
      if (percentage <= flag.rolloutPercentage) {
        return {
          flagId: flag.id,
          enabled: true,
          reason: `Rollout percentage match (${percentage}% <= ${flag.rolloutPercentage}%)`,
          evaluatedAt: new Date(),
          context
        };
      }
    }

    return {
      flagId: flag.id,
      enabled: false,
      reason: 'No matching rules',
      evaluatedAt: new Date(),
      context
    };
  }

  private getBuiltInFlag(flagId: string): FeatureFlag | null {
    const envKey = flagId.toUpperCase().replace(/\./g, '_');
    const enabled = process.env[envKey] === 'true';

    return {
      id: flagId,
      name: flagId,
      description: `Built-in flag: ${flagId}`,
      enabled,
      rolloutPercentage: enabled ? 100 : 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: 'system',
      updatedBy: 'system'
    };
  }

  private async getOverride(flagId: string, context: FeatureFlagContext): Promise<FeatureFlagOverride | null> {
    // Check inbox-specific override first
    if (context.inboxId) {
      const inboxKey = this.getOverrideKey(flagId, context.accountId, context.inboxId);
      const override = await this.redis.get(inboxKey);
      if (override) {
        const parsed = JSON.parse(override);
        if (!parsed.expiresAt || new Date(parsed.expiresAt) > new Date()) {
          return parsed;
        }
      }
    }

    // Check account-specific override
    const accountKey = this.getOverrideKey(flagId, context.accountId);
    const override = await this.redis.get(accountKey);
    if (override) {
      const parsed = JSON.parse(override);
      if (!parsed.expiresAt || new Date(parsed.expiresAt) > new Date()) {
        return parsed;
      }
    }

    return null;
  }

  private getOverrideKey(flagId: string, accountId?: number, inboxId?: number): string {
    if (inboxId) {
      return `ff_override:${flagId}:inbox:${inboxId}`;
    }
    if (accountId) {
      return `ff_override:${flagId}:account:${accountId}`;
    }
    return `ff_override:${flagId}:global`;
  }

  private async getCachedEvaluation(flagId: string, context: FeatureFlagContext): Promise<FeatureFlagEvaluation | null> {
    const cacheKey = this.getCacheKey(flagId, context);
    const cached = await this.redis.get(cacheKey);
    
    if (cached) {
      return JSON.parse(cached);
    }
    
    return null;
  }

  private async cacheEvaluation(evaluation: FeatureFlagEvaluation): Promise<void> {
    const cacheKey = this.getCacheKey(evaluation.flagId, evaluation.context);
    await this.redis.setex(cacheKey, this.config.cacheTtlSeconds, JSON.stringify(evaluation));
  }

  private getCacheKey(flagId: string, context: FeatureFlagContext): string {
    const contextHash = this.hashContext(flagId, context);
    return `ff_cache:${flagId}:${contextHash}`;
  }

  private async clearFlagCache(flagId: string): Promise<void> {
    const pattern = `ff_cache:${flagId}:*`;
    const keys = await this.redis.keys(pattern);
    
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }

  private hashContext(flagId: string, context: FeatureFlagContext): number {
    const str = `${flagId}:${context.accountId}:${context.inboxId || ''}:${context.userId || ''}`;
    const hash = crypto.createHash('sha256').update(str).digest('hex');
    return parseInt(hash.substring(0, 8), 16);
  }

  private async recordMetrics(flagId: string, enabled: boolean, latencyMs: number, error: boolean = false): Promise<void> {
    const metricsKey = `ff_metrics:${flagId}`;
    
    await this.redis.multi()
      .hincrby(metricsKey, 'evaluations', 1)
      .hincrby(metricsKey, enabled ? 'enabled' : 'disabled', 1)
      .hincrby(metricsKey, 'errors', error ? 1 : 0)
      .hincrby(metricsKey, 'totalLatency', latencyMs)
      .hset(metricsKey, 'lastEvaluated', Date.now())
      .expire(metricsKey, 86400 * 7) // Keep metrics for 7 days
      .exec();
  }

  private async logEvaluation(evaluation: FeatureFlagEvaluation): Promise<void> {
    // This would be implemented with actual audit logging
    log.info('Feature flag evaluated', {
      flagId: evaluation.flagId,
      enabled: evaluation.enabled,
      reason: evaluation.reason,
      context: evaluation.context
    });
  }
}