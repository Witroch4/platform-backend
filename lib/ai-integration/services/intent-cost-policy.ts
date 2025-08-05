/**
 * Intent Cost Policy Service
 * Based on requirements 15.2, 15.3
 */

// Lazy import to avoid Edge Runtime issues
type Redis = any;
import { CostTrackingService } from './cost-tracker';
import { 
  IntentCostPolicy, 
  IntentCostConfig, 
  IntentCostDecision, 
  IntentUsageMetrics,
  IntentCostAlert,
  IntentCostPolicyService as IIntentCostPolicyService,
  INTENT_COST_CATEGORIES,
  IntentCostCategory
} from '../types/intent-cost-policy';
import log from '@/lib/log';

export class IntentCostPolicyService implements IIntentCostPolicyService {
  private redis: Redis;
  private costTracker: CostTrackingService;

  constructor(redis: Redis) {
    this.redis = redis;
    this.costTracker = new CostTrackingService(redis);
  }

  /**
   * Evaluate if an intent should be processed and with what strategy
   */
  async evaluateIntentCost(intentId: string, accountId: number): Promise<IntentCostDecision> {
    try {
      // Get intent policy
      const policy = await this.getIntentPolicy(intentId);
      if (!policy || !policy.enabled) {
        return this.createDefaultDecision(intentId, 'Intent policy not found or disabled');
      }

      // Get current budget status
      const budgetStatus = await this.costTracker.getBudgetStatus(accountId);
      const budgetPercentageUsed = budgetStatus.percentageUsed * 100;

      // Get account cost configuration
      const costConfig = await this.getAccountCostConfig(accountId);

      // Check if we're in economic mode
      const economicModeActive = budgetStatus.economicModeActive;

      // Apply economic mode restrictions first
      if (economicModeActive) {
        const economicDecision = await this.applyEconomicModeRestrictions(
          policy, 
          accountId, 
          budgetStatus
        );
        if (economicDecision) return economicDecision;
      }

      // Check budget threshold for expensive intents
      if (policy.costCategory === 'expensive' || policy.costCategory === 'premium') {
        if (budgetPercentageUsed >= policy.budgetThresholdPercent) {
          return {
            intentId,
            intentName: policy.intentName,
            allowed: true,
            strategy: policy.fallbackStrategy === 'mini_model' ? 'mini_model' : 'template',
            reason: `Budget at ${budgetPercentageUsed.toFixed(1)}% - using ${policy.fallbackStrategy}`,
            estimatedCost: policy.fallbackStrategy === 'mini_model' ? policy.estimatedCostBrl * 0.3 : 0,
            budgetRemaining: budgetStatus.costLimit - budgetStatus.costUsed,
            budgetPercentageUsed,
            economicModeActive
          };
        }
      }

      // Check daily limits for expensive intents
      if (policy.costCategory === 'expensive' || policy.costCategory === 'premium') {
        const dailyUsage = await this.getDailyIntentUsage(intentId, accountId);
        const maxExpensive = costConfig.economicModeOverrides.maxExpensiveIntentsPerDay;
        
        if (dailyUsage.requestCount >= maxExpensive) {
          return {
            intentId,
            intentName: policy.intentName,
            allowed: true,
            strategy: 'template',
            reason: `Daily limit of ${maxExpensive} expensive intents reached`,
            estimatedCost: 0,
            budgetRemaining: budgetStatus.costLimit - budgetStatus.costUsed,
            budgetPercentageUsed,
            economicModeActive
          };
        }
      }

      // Check if estimated cost would exceed remaining budget
      const remainingBudget = budgetStatus.costLimit - budgetStatus.costUsed;
      if (policy.estimatedCostBrl > remainingBudget) {
        return {
          intentId,
          intentName: policy.intentName,
          allowed: true,
          strategy: policy.fallbackStrategy === 'skip_llm' ? 'skip' : 'template',
          reason: `Estimated cost (R$${policy.estimatedCostBrl}) exceeds remaining budget (R$${remainingBudget})`,
          estimatedCost: 0,
          budgetRemaining: remainingBudget,
          budgetPercentageUsed,
          economicModeActive
        };
      }

      // Allow full LLM processing
      return {
        intentId,
        intentName: policy.intentName,
        allowed: true,
        strategy: 'full_llm',
        reason: 'Within budget limits',
        estimatedCost: policy.estimatedCostBrl,
        budgetRemaining: remainingBudget,
        budgetPercentageUsed,
        economicModeActive
      };

    } catch (error) {
      log.error('Error evaluating intent cost', { intentId, accountId, error });
      return this.createDefaultDecision(intentId, 'Error evaluating cost - allowing with caution');
    }
  }

  /**
   * Get intent policy by ID
   */
  async getIntentPolicy(intentId: string): Promise<IntentCostPolicy | null> {
    try {
      const cacheKey = `intent_policy:${intentId}`;
      const cached = await this.redis.get(cacheKey);
      
      if (cached) {
        return JSON.parse(cached);
      }

      // Check if it's a predefined intent
      const predefined = this.getPredefinedIntentPolicy(intentId);
      if (predefined) {
        // Cache for 1 hour
        await this.redis.setex(cacheKey, 3600, JSON.stringify(predefined));
        return predefined;
      }

      return null;
    } catch (error) {
      log.error('Error getting intent policy', { intentId, error });
      return null;
    }
  }

  /**
   * Set intent policy
   */
  async setIntentPolicy(policy: Omit<IntentCostPolicy, 'createdAt' | 'updatedAt'>): Promise<IntentCostPolicy> {
    const fullPolicy: IntentCostPolicy = {
      ...policy,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const cacheKey = `intent_policy:${policy.intentId}`;
    await this.redis.setex(cacheKey, 3600, JSON.stringify(fullPolicy));

    log.info('Intent policy set', { intentId: policy.intentId, costCategory: policy.costCategory });
    
    return fullPolicy;
  }

  /**
   * Update intent policy
   */
  async updateIntentPolicy(intentId: string, updates: Partial<IntentCostPolicy>): Promise<IntentCostPolicy> {
    const existing = await this.getIntentPolicy(intentId);
    if (!existing) {
      throw new Error(`Intent policy not found: ${intentId}`);
    }

    const updated: IntentCostPolicy = {
      ...existing,
      ...updates,
      updatedAt: new Date()
    };

    const cacheKey = `intent_policy:${intentId}`;
    await this.redis.setex(cacheKey, 3600, JSON.stringify(updated));

    log.info('Intent policy updated', { intentId, updates });
    
    return updated;
  }

  /**
   * Get account cost configuration
   */
  async getAccountCostConfig(accountId: number): Promise<IntentCostConfig> {
    try {
      const cacheKey = `intent_cost_config:${accountId}`;
      const cached = await this.redis.get(cacheKey);
      
      if (cached) {
        return JSON.parse(cached);
      }

      // Default configuration
      const defaultConfig: IntentCostConfig = {
        accountId,
        policies: [],
        globalBudgetThreshold: 85, // 85%
        economicModeOverrides: {
          maxExpensiveIntentsPerDay: parseInt(process.env.MAX_EXPENSIVE_INTENTS_PER_DAY || '10'),
          forceTemplateAfterLimit: true,
          skipLlmForExpensive: false
        },
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Cache for 5 minutes
      await this.redis.setex(cacheKey, 300, JSON.stringify(defaultConfig));
      
      return defaultConfig;
    } catch (error) {
      log.error('Error getting account cost config', { accountId, error });
      throw error;
    }
  }

  /**
   * Update account cost configuration
   */
  async updateAccountCostConfig(accountId: number, config: Partial<IntentCostConfig>): Promise<IntentCostConfig> {
    const existing = await this.getAccountCostConfig(accountId);
    
    const updated: IntentCostConfig = {
      ...existing,
      ...config,
      updatedAt: new Date()
    };

    const cacheKey = `intent_cost_config:${accountId}`;
    await this.redis.setex(cacheKey, 300, JSON.stringify(updated));

    log.info('Account cost config updated', { accountId, config });
    
    return updated;
  }

  /**
   * Record intent usage for cost tracking
   */
  async recordIntentUsage(intentId: string, accountId: number, tokensUsed: number, costBrl: number): Promise<void> {
    const today = new Date().toISOString().split('T')[0];
    const usageKey = `intent_usage:${accountId}:${intentId}:${today}`;
    
    await this.redis.multi()
      .hincrby(usageKey, 'requests', 1)
      .hincrby(usageKey, 'tokens', tokensUsed)
      .hincrbyfloat(usageKey, 'cost', costBrl)
      .expire(usageKey, 86400 * 7) // Keep for 7 days
      .exec();

    log.info('Intent usage recorded', { intentId, accountId, tokensUsed, costBrl });
  }

  /**
   * Get intent metrics for analysis
   */
  async getIntentMetrics(intentId: string, accountId: number, days: number = 7): Promise<IntentUsageMetrics[]> {
    const metrics: IntentUsageMetrics[] = [];
    
    for (let i = 0; i < days; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      
      const usageKey = `intent_usage:${accountId}:${intentId}:${dateStr}`;
      const usage = await this.redis.hmget(usageKey, 'requests', 'tokens', 'cost');
      
      const requestCount = parseInt(usage[0] || '0');
      const tokensUsed = parseInt(usage[1] || '0');
      const costBrl = parseFloat(usage[2] || '0');
      
      metrics.push({
        intentId,
        accountId,
        date: dateStr,
        requestCount,
        tokensUsed,
        costBrl,
        averageTokensPerRequest: requestCount > 0 ? tokensUsed / requestCount : 0,
        averageCostPerRequest: requestCount > 0 ? costBrl / requestCount : 0,
        fallbackCount: 0, // Would be tracked separately
        fallbackRate: 0,
        lastUpdated: new Date()
      });
    }
    
    return metrics;
  }

  /**
   * Check for cost alerts
   */
  async checkCostAlerts(accountId: number): Promise<IntentCostAlert[]> {
    const alerts: IntentCostAlert[] = [];
    
    try {
      const budgetStatus = await this.costTracker.getBudgetStatus(accountId);
      const costConfig = await this.getAccountCostConfig(accountId);
      
      // Check global budget threshold
      if (budgetStatus.percentageUsed * 100 >= costConfig.globalBudgetThreshold) {
        alerts.push({
          intentId: 'global',
          accountId,
          alertType: 'budget_threshold',
          threshold: costConfig.globalBudgetThreshold,
          currentValue: budgetStatus.percentageUsed * 100,
          message: `Global budget threshold of ${costConfig.globalBudgetThreshold}% exceeded`,
          timestamp: new Date(),
          acknowledged: false
        });
      }

      // Check expensive intent limits
      const today = new Date().toISOString().split('T')[0];
      const expensiveIntents = ['COMPLAINT_RESOLUTION', 'TECHNICAL_SUPPORT', 'CUSTOM_RECOMMENDATION'];
      
      for (const intentId of expensiveIntents) {
        const usage = await this.getDailyIntentUsage(intentId, accountId);
        const limit = costConfig.economicModeOverrides.maxExpensiveIntentsPerDay;
        
        if (usage.requestCount >= limit) {
          alerts.push({
            intentId,
            accountId,
            alertType: 'expensive_intent_limit',
            threshold: limit,
            currentValue: usage.requestCount,
            message: `Daily limit of ${limit} requests exceeded for expensive intent ${intentId}`,
            timestamp: new Date(),
            acknowledged: false
          });
        }
      }

      return alerts;
    } catch (error) {
      log.error('Error checking cost alerts', { accountId, error });
      return [];
    }
  }

  private async applyEconomicModeRestrictions(
    policy: IntentCostPolicy, 
    accountId: number, 
    budgetStatus: any
  ): Promise<IntentCostDecision | null> {
    const costConfig = await this.getAccountCostConfig(accountId);
    
    // Skip LLM for expensive intents in economic mode
    if ((policy.costCategory === 'expensive' || policy.costCategory === 'premium') && 
        costConfig.economicModeOverrides.skipLlmForExpensive) {
      return {
        intentId: policy.intentId,
        intentName: policy.intentName,
        allowed: true,
        strategy: 'template',
        reason: 'Economic mode: skipping LLM for expensive intent',
        estimatedCost: 0,
        budgetRemaining: budgetStatus.costLimit - budgetStatus.costUsed,
        budgetPercentageUsed: budgetStatus.percentageUsed * 100,
        economicModeActive: true
      };
    }

    // Force template after daily limit in economic mode
    if (costConfig.economicModeOverrides.forceTemplateAfterLimit) {
      const dailyUsage = await this.getDailyIntentUsage(policy.intentId, accountId);
      const limit = costConfig.economicModeOverrides.maxExpensiveIntentsPerDay;
      
      if (dailyUsage.requestCount >= limit && 
          (policy.costCategory === 'expensive' || policy.costCategory === 'premium')) {
        return {
          intentId: policy.intentId,
          intentName: policy.intentName,
          allowed: true,
          strategy: 'template',
          reason: `Economic mode: daily limit of ${limit} expensive intents reached`,
          estimatedCost: 0,
          budgetRemaining: budgetStatus.costLimit - budgetStatus.costUsed,
          budgetPercentageUsed: budgetStatus.percentageUsed * 100,
          economicModeActive: true
        };
      }
    }

    return null;
  }

  private async getDailyIntentUsage(intentId: string, accountId: number): Promise<IntentUsageMetrics> {
    const today = new Date().toISOString().split('T')[0];
    const usageKey = `intent_usage:${accountId}:${intentId}:${today}`;
    
    const usage = await this.redis.hmget(usageKey, 'requests', 'tokens', 'cost');
    
    const requestCount = parseInt(usage[0] || '0');
    const tokensUsed = parseInt(usage[1] || '0');
    const costBrl = parseFloat(usage[2] || '0');
    
    return {
      intentId,
      accountId,
      date: today,
      requestCount,
      tokensUsed,
      costBrl,
      averageTokensPerRequest: requestCount > 0 ? tokensUsed / requestCount : 0,
      averageCostPerRequest: requestCount > 0 ? costBrl / requestCount : 0,
      fallbackCount: 0,
      fallbackRate: 0,
      lastUpdated: new Date()
    };
  }

  private getPredefinedIntentPolicy(intentId: string): IntentCostPolicy | null {
    const category = intentId.toUpperCase() as IntentCostCategory;
    const predefined = INTENT_COST_CATEGORIES[category];
    
    if (!predefined) return null;

    return {
      intentId,
      intentName: intentId.replace(/_/g, ' ').toLowerCase(),
      costCategory: predefined.category,
      estimatedTokens: predefined.estimatedTokens,
      estimatedCostBrl: predefined.estimatedCostBrl,
      maxTokensAllowed: predefined.estimatedTokens * 2, // 2x buffer
      fallbackStrategy: predefined.category === 'expensive' || predefined.category === 'premium' 
        ? 'mini_model' : 'template',
      budgetThresholdPercent: predefined.category === 'expensive' ? 85 : 
                             predefined.category === 'premium' ? 80 : 95,
      enabled: true,
      createdAt: new Date(),
      updatedAt: new Date()
    };
  }

  private createDefaultDecision(intentId: string, reason: string): IntentCostDecision {
    return {
      intentId,
      intentName: intentId,
      allowed: true,
      strategy: 'full_llm',
      reason,
      estimatedCost: 0.005, // Default estimate
      budgetRemaining: 0,
      budgetPercentageUsed: 0,
      economicModeActive: false
    };
  }
}