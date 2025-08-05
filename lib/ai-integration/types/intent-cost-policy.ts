/**
 * Intent Cost Policy Types
 * Based on requirements 15.2, 15.3
 */

export interface IntentCostPolicy {
  intentId: string;
  intentName: string;
  costCategory: 'cheap' | 'moderate' | 'expensive' | 'premium';
  estimatedTokens: number;
  estimatedCostBrl: number;
  maxTokensAllowed: number;
  fallbackStrategy: 'mini_model' | 'skip_llm' | 'template' | 'human_handoff';
  budgetThresholdPercent: number; // When to apply restrictions (e.g., 85%)
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface IntentCostConfig {
  accountId: number;
  policies: IntentCostPolicy[];
  globalBudgetThreshold: number; // Global threshold for all expensive intents
  economicModeOverrides: {
    maxExpensiveIntentsPerDay: number;
    forceTemplateAfterLimit: boolean;
    skipLlmForExpensive: boolean;
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface IntentCostDecision {
  intentId: string;
  intentName: string;
  allowed: boolean;
  strategy: 'full_llm' | 'mini_model' | 'template' | 'skip' | 'human_handoff';
  reason: string;
  estimatedCost: number;
  budgetRemaining: number;
  budgetPercentageUsed: number;
  economicModeActive: boolean;
}

export interface IntentUsageMetrics {
  intentId: string;
  accountId: number;
  date: string; // YYYY-MM-DD
  requestCount: number;
  tokensUsed: number;
  costBrl: number;
  averageTokensPerRequest: number;
  averageCostPerRequest: number;
  fallbackCount: number;
  fallbackRate: number;
  lastUpdated: Date;
}

export interface IntentCostAlert {
  intentId: string;
  accountId: number;
  alertType: 'budget_threshold' | 'expensive_intent_limit' | 'cost_spike';
  threshold: number;
  currentValue: number;
  message: string;
  timestamp: Date;
  acknowledged: boolean;
}

// Predefined cost categories for common intents
export const INTENT_COST_CATEGORIES = {
  // Cheap intents - simple responses, templates
  GREETING: { category: 'cheap' as const, estimatedTokens: 50, estimatedCostBrl: 0.001 },
  GOODBYE: { category: 'cheap' as const, estimatedTokens: 30, estimatedCostBrl: 0.0005 },
  THANKS: { category: 'cheap' as const, estimatedTokens: 40, estimatedCostBrl: 0.0008 },
  
  // Moderate intents - standard Q&A
  FAQ: { category: 'moderate' as const, estimatedTokens: 150, estimatedCostBrl: 0.003 },
  PRODUCT_INFO: { category: 'moderate' as const, estimatedTokens: 200, estimatedCostBrl: 0.004 },
  ORDER_STATUS: { category: 'moderate' as const, estimatedTokens: 120, estimatedCostBrl: 0.0025 },
  
  // Expensive intents - complex generation
  COMPLAINT_RESOLUTION: { category: 'expensive' as const, estimatedTokens: 400, estimatedCostBrl: 0.008 },
  TECHNICAL_SUPPORT: { category: 'expensive' as const, estimatedTokens: 500, estimatedCostBrl: 0.01 },
  CUSTOM_RECOMMENDATION: { category: 'expensive' as const, estimatedTokens: 600, estimatedCostBrl: 0.012 },
  
  // Premium intents - very complex, long responses
  LEGAL_ADVICE: { category: 'premium' as const, estimatedTokens: 800, estimatedCostBrl: 0.016 },
  DETAILED_ANALYSIS: { category: 'premium' as const, estimatedTokens: 1000, estimatedCostBrl: 0.02 },
  CUSTOM_CONTENT_GENERATION: { category: 'premium' as const, estimatedTokens: 1200, estimatedCostBrl: 0.024 }
} as const;

export type IntentCostCategory = keyof typeof INTENT_COST_CATEGORIES;

export interface IntentCostPolicyService {
  evaluateIntentCost(intentId: string, accountId: number): Promise<IntentCostDecision>;
  getIntentPolicy(intentId: string): Promise<IntentCostPolicy | null>;
  setIntentPolicy(policy: Omit<IntentCostPolicy, 'createdAt' | 'updatedAt'>): Promise<IntentCostPolicy>;
  updateIntentPolicy(intentId: string, updates: Partial<IntentCostPolicy>): Promise<IntentCostPolicy>;
  getAccountCostConfig(accountId: number): Promise<IntentCostConfig>;
  updateAccountCostConfig(accountId: number, config: Partial<IntentCostConfig>): Promise<IntentCostConfig>;
  recordIntentUsage(intentId: string, accountId: number, tokensUsed: number, costBrl: number): Promise<void>;
  getIntentMetrics(intentId: string, accountId: number, days?: number): Promise<IntentUsageMetrics[]>;
  checkCostAlerts(accountId: number): Promise<IntentCostAlert[]>;
}