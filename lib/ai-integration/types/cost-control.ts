/**
 * Cost Control and Economic Mode Types
 * Based on requirements 15.1, 15.2, 15.3
 */

export interface CostTracker {
  accountId: number;
  date: string; // YYYY-MM-DD format
  tokensUsed: number;
  costBrl: number;
  requestCount: number;
  economicModeActive: boolean;
  budgetExceeded: boolean;
  lastUpdated: Date;
}

export interface BudgetConfig {
  accountId: number;
  dailyTokenLimit: number;
  dailyCostLimitBrl: number;
  economicModeThreshold: number; // Percentage (0.8 = 80%)
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface EconomicModeConfig {
  enabled: boolean;
  maxResponseLength: number;
  useOnlyMiniModel: boolean;
  skipLlmForCachedResponses: boolean;
  disableMediaHeaders: boolean;
  fallbackToTemplates: boolean;
}

export interface CostMetrics {
  tokensUsed: number;
  costBrl: number;
  model: string;
  operation: 'embedding' | 'generation';
  cached: boolean;
  economicMode: boolean;
}

export interface TokenPricing {
  model: string;
  inputTokenCostPer1k: number; // Cost in BRL per 1000 tokens
  outputTokenCostPer1k: number;
  embeddingCostPer1k: number;
}

export interface CacheEntry {
  key: string;
  response: any;
  tokensUsed: number;
  createdAt: Date;
  expiresAt: Date;
  hitCount: number;
}

export interface BudgetStatus {
  accountId: number;
  tokensUsed: number;
  tokensLimit: number;
  costUsed: number;
  costLimit: number;
  percentageUsed: number;
  economicModeActive: boolean;
  budgetExceeded: boolean;
  resetAt: Date;
}