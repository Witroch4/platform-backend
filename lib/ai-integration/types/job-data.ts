/**
 * BullMQ Job Data Types
 * Based on requirements 13.1, 13.2
 */

export interface AiMessageJobData {
  accountId: number;
  conversationId: number;
  messageId: string;
  text: string;
  contentAttributes: Record<string, any>;
  channel: 'whatsapp' | 'instagram' | 'messenger';
  traceId: string;
  agentHandoffRequested?: boolean; // Forçar handoff humano via regra/flag
  featureFlags?: FeatureFlagConfig;
  sourceId?: string; // Provider-specific ID (wamid, mid)
  providerTimestamp?: number;
  enqueuedAt: number;
}

export interface EmbeddingUpsertJobData {
  intentId: string;
  intentName: string;
  description?: string;
  text: string;
  traceId: string;
  accountId: number;
  operation: 'create' | 'update' | 'delete';
}

export interface FeatureFlagConfig {
  intentsEnabled: boolean;
  dynamicLlmEnabled: boolean;
  interactiveMessagesEnabled: boolean;
  economicModeEnabled: boolean;
  budgetControlEnabled: boolean;
}

export interface JobMetadata {
  traceId: string;
  accountId: number;
  conversationId: number;
  messageId: string;
  channel: string;
  enqueuedAt: number;
  attempts: number;
  priority?: number;
}

export interface JobResult {
  success: boolean;
  result?: any;
  error?: string;
  fallbackReason?: string;
  metrics?: {
    processingTimeMs: number;
    llmTokensUsed?: number;
    intentScore?: number;
    costBrl?: number;
    economicModeUsed?: boolean;
    cacheHit?: boolean;
  };
}

export interface DeadLetterQueueItem {
  jobId: string;
  jobData: AiMessageJobData | EmbeddingUpsertJobData;
  error: string;
  failedAt: number;
  attempts: number;
  queue: string;
  reprocessReason?: string;
  reprocessedBy?: string;
}