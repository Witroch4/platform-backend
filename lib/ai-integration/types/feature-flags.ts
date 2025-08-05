/**
 * Feature Flag System Types
 * Based on requirements 16.1, 16.2, 16.3, 16.4
 */

export interface FeatureFlag {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  rolloutPercentage: number;
  accountIds?: number[];
  inboxIds?: number[];
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  updatedBy: string;
}

export interface FeatureFlagRule {
  id: string;
  flagId: string;
  type: 'account' | 'inbox' | 'percentage' | 'user';
  targetIds: number[];
  enabled: boolean;
  priority: number; // Higher priority wins
  createdAt: Date;
  updatedAt: Date;
}

export interface FeatureFlagEvaluation {
  flagId: string;
  enabled: boolean;
  reason: string;
  ruleId?: string;
  evaluatedAt: Date;
  context: FeatureFlagContext;
}

export interface FeatureFlagContext {
  accountId: number;
  inboxId?: number;
  userId?: number;
  channel?: 'whatsapp' | 'instagram' | 'messenger';
  conversationId?: number;
  userAgent?: string;
  ipAddress?: string;
}

export interface FeatureFlagConfig {
  source: 'env' | 'database' | 'redis';
  priority: 'inbox' | 'account' | 'global';
  cacheEnabled: boolean;
  cacheTtlSeconds: number;
  evaluationLogging: boolean;
}

export interface FeatureFlagOverride {
  flagId: string;
  accountId?: number;
  inboxId?: number;
  enabled: boolean;
  reason: string;
  expiresAt?: Date;
  createdBy: string;
  createdAt: Date;
}

export interface FeatureFlagMetrics {
  flagId: string;
  evaluations: number;
  enabledCount: number;
  disabledCount: number;
  errorCount: number;
  lastEvaluatedAt: Date;
  averageLatencyMs: number;
}

export interface FeatureFlagAudit {
  id: string;
  flagId: string;
  action: 'created' | 'updated' | 'deleted' | 'evaluated' | 'overridden';
  oldValue?: any;
  newValue?: any;
  context: FeatureFlagContext;
  userId: string;
  timestamp: Date;
  reason?: string;
}

// Built-in feature flags for AI integration
export const AI_FEATURE_FLAGS = {
  INTENTS_ENABLED: 'ai.intents.enabled',
  DYNAMIC_LLM_ENABLED: 'ai.llm.dynamic.enabled',
  INTERACTIVE_MESSAGES_ENABLED: 'ai.messages.interactive.enabled',
  ECONOMIC_MODE_ENABLED: 'ai.economic.mode.enabled',
  BUDGET_CONTROL_ENABLED: 'ai.budget.control.enabled',
  CACHING_ENABLED: 'ai.caching.enabled',
  TEMPLATE_FALLBACK_ENABLED: 'ai.templates.fallback.enabled',
  HUMAN_HANDOFF_ENABLED: 'ai.handoff.human.enabled',
  METRICS_COLLECTION_ENABLED: 'ai.metrics.collection.enabled',
  AUDIT_LOGGING_ENABLED: 'ai.audit.logging.enabled'
} as const;

export type AIFeatureFlag = typeof AI_FEATURE_FLAGS[keyof typeof AI_FEATURE_FLAGS];

export interface FeatureFlagService {
  isEnabled(flagId: string, context: FeatureFlagContext): Promise<boolean>;
  evaluate(flagId: string, context: FeatureFlagContext): Promise<FeatureFlagEvaluation>;
  getFlag(flagId: string): Promise<FeatureFlag | null>;
  createFlag(flag: Omit<FeatureFlag, 'id' | 'createdAt' | 'updatedAt'>): Promise<FeatureFlag>;
  updateFlag(flagId: string, updates: Partial<FeatureFlag>): Promise<FeatureFlag>;
  deleteFlag(flagId: string): Promise<void>;
  listFlags(): Promise<FeatureFlag[]>;
  override(override: Omit<FeatureFlagOverride, 'createdAt'>): Promise<void>;
  removeOverride(flagId: string, accountId?: number, inboxId?: number): Promise<void>;
  getMetrics(flagId: string): Promise<FeatureFlagMetrics>;
  getAuditLog(flagId: string, limit?: number): Promise<FeatureFlagAudit[]>;
}