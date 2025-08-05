/**
 * Cost Tracking Service
 * Based on requirements 15.1, 15.2, 15.3
 */

// Lazy import to avoid Edge Runtime issues
type Redis = any;
import { getPrismaInstance } from "@/lib/connections";
import {
  CostTracker,
  BudgetConfig,
  BudgetStatus,
  CostMetrics,
  TokenPricing,
} from "../types/cost-control";
import log from "@/lib/log";

export class CostTrackingService {
  private redis: Redis;
  private tokenPricing: Map<string, TokenPricing> = new Map();

  constructor(redis: Redis) {
    this.redis = redis;
    this.initializeTokenPricing();
  }

  private initializeTokenPricing() {
    // OpenAI pricing in BRL (approximate, should be updated regularly)
    const pricing: TokenPricing[] = [
      {
        model: "gpt-4o-mini",
        inputTokenCostPer1k: 0.0008, // ~R$ 0.0008 per 1k input tokens
        outputTokenCostPer1k: 0.0024, // ~R$ 0.0024 per 1k output tokens
        embeddingCostPer1k: 0.0001,
      },
      {
        model: "text-embedding-3-small",
        inputTokenCostPer1k: 0.0001,
        outputTokenCostPer1k: 0,
        embeddingCostPer1k: 0.0001,
      },
    ];

    pricing.forEach((p) => this.tokenPricing.set(p.model, p));
  }

  /**
   * Track cost for LLM usage
   */
  async trackCost(params: {
    accountId: number;
    model: string;
    inputTokens: number;
    outputTokens: number;
    operation: "embedding" | "generation";
    traceId: string;
  }): Promise<CostMetrics> {
    const { accountId, model, inputTokens, outputTokens, operation, traceId } =
      params;

    const pricing = this.tokenPricing.get(model);
    if (!pricing) {
      log.warn("Unknown model pricing", { model, traceId });
      return {
        tokensUsed: inputTokens + outputTokens,
        costBrl: 0,
        model,
        operation,
        cached: false,
        economicMode: false,
      };
    }

    const totalTokens = inputTokens + outputTokens;
    const cost =
      operation === "embedding"
        ? (totalTokens / 1000) * pricing.embeddingCostPer1k
        : (inputTokens / 1000) * pricing.inputTokenCostPer1k +
          (outputTokens / 1000) * pricing.outputTokenCostPer1k;

    // Update daily cost tracking in Redis
    const today = new Date().toISOString().split("T")[0];
    const costKey = `cost:${accountId}:${today}`;

    await this.redis
      .multi()
      .hincrby(costKey, "tokens", totalTokens)
      .hincrbyfloat(costKey, "cost", cost)
      .hincrby(costKey, "requests", 1)
      .expire(costKey, 86400 * 2) // Keep for 2 days
      .exec();

    // Check if budget exceeded
    const budgetStatus = await this.getBudgetStatus(accountId);

    log.info("Cost tracked", {
      accountId,
      model,
      tokensUsed: totalTokens,
      costBrl: cost,
      operation,
      budgetExceeded: budgetStatus.budgetExceeded,
      traceId,
    });

    return {
      tokensUsed: totalTokens,
      costBrl: cost,
      model,
      operation,
      cached: false,
      economicMode: budgetStatus.economicModeActive,
    };
  }

  /**
   * Get current budget status for account
   */
  async getBudgetStatus(accountId: number): Promise<BudgetStatus> {
    const today = new Date().toISOString().split("T")[0];
    const costKey = `cost:${accountId}:${today}`;

    // Get current usage from Redis
    const usage = await this.redis.hmget(costKey, "tokens", "cost", "requests");
    const tokensUsed = parseInt(usage[0] || "0");
    const costUsed = parseFloat(usage[1] || "0");

    // Get budget configuration
    const budgetConfig = await this.getBudgetConfig(accountId);

    const percentageUsed = Math.max(
      tokensUsed / budgetConfig.dailyTokenLimit,
      costUsed / budgetConfig.dailyCostLimitBrl
    );

    const economicModeActive =
      percentageUsed >= budgetConfig.economicModeThreshold;
    const budgetExceeded = percentageUsed >= 1.0;

    // Update economic mode flag in Redis if needed
    if (economicModeActive) {
      await this.redis.setex(`economic:${accountId}`, 86400, "1");
    }

    // Emit metric if budget exceeded
    if (budgetExceeded) {
      // This would be handled by metrics service
      log.warn("Budget exceeded", {
        accountId,
        tokensUsed,
        costUsed,
        percentageUsed,
      });
    }

    return {
      accountId,
      tokensUsed,
      tokensLimit: budgetConfig.dailyTokenLimit,
      costUsed,
      costLimit: budgetConfig.dailyCostLimitBrl,
      percentageUsed,
      economicModeActive,
      budgetExceeded,
      resetAt: new Date(Date.now() + 86400000), // Tomorrow
    };
  }

  /**
   * Get budget configuration for account
   */
  async getBudgetConfig(accountId: number): Promise<BudgetConfig> {
    const cacheKey = `budget_config:${accountId}`;
    const cached = await this.redis.get(cacheKey);

    if (cached) {
      return JSON.parse(cached);
    }

    // Default budget configuration
    const defaultConfig: BudgetConfig = {
      accountId,
      dailyTokenLimit: parseInt(process.env.TOKENS_DIA_CONTA || "100000"),
      dailyCostLimitBrl: parseFloat(process.env.R_DIA_LIMITE || "50.00"),
      economicModeThreshold: 0.8, // 80%
      enabled: process.env.BUDGET_CONTROL_ENABLED !== "false",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Cache for 5 minutes
    await this.redis.setex(cacheKey, 300, JSON.stringify(defaultConfig));

    return defaultConfig;
  }

  /**
   * Check if account is in economic mode
   */
  async isEconomicModeActive(accountId: number): Promise<boolean> {
    const economicFlag = await this.redis.get(`economic:${accountId}`);
    if (economicFlag) return true;

    // Check budget status
    const status = await this.getBudgetStatus(accountId);
    return status.economicModeActive;
  }

  /**
   * Reset daily budget for account (for testing/admin)
   */
  async resetDailyBudget(accountId: number): Promise<void> {
    const today = new Date().toISOString().split("T")[0];
    const costKey = `cost:${accountId}:${today}`;
    const economicKey = `economic:${accountId}`;

    await this.redis.multi().del(costKey).del(economicKey).exec();

    log.info("Daily budget reset", { accountId });
  }

  /**
   * Get cost summary for account
   */
  async getCostSummary(
    accountId: number,
    days: number = 7
  ): Promise<CostTracker[]> {
    const summaries: CostTracker[] = [];

    for (let i = 0; i < days; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split("T")[0];

      const costKey = `cost:${accountId}:${dateStr}`;
      const usage = await this.redis.hmget(
        costKey,
        "tokens",
        "cost",
        "requests"
      );

      const tokensUsed = parseInt(usage[0] || "0");
      const costBrl = parseFloat(usage[1] || "0");
      const requestCount = parseInt(usage[2] || "0");

      const budgetStatus = await this.getBudgetStatus(accountId);

      summaries.push({
        accountId,
        date: dateStr,
        tokensUsed,
        costBrl,
        requestCount,
        economicModeActive: budgetStatus.economicModeActive,
        budgetExceeded: budgetStatus.budgetExceeded,
        lastUpdated: new Date(),
      });
    }

    return summaries;
  }
}
