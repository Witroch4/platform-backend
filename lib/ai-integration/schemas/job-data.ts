/**
 * Zod schemas for job data validation
 * Based on requirements 13.1, 13.2
 */

import { z } from 'zod';

export const FeatureFlagConfigSchema = z.object({
  intentsEnabled: z.boolean(),
  dynamicLlmEnabled: z.boolean(),
  interactiveMessagesEnabled: z.boolean(),
  economicModeEnabled: z.boolean(),
});

export const AiMessageJobDataSchema = z.object({
  accountId: z.number().int().positive(),
  conversationId: z.number().int().positive(),
  messageId: z.string().min(1),
  text: z.string().min(1),
  contentAttributes: z.record(z.any()),
  channel: z.enum(['whatsapp', 'instagram', 'messenger']),
  traceId: z.string().min(1),
  agentHandoffRequested: z.boolean().optional(),
  featureFlags: FeatureFlagConfigSchema.optional(),
  sourceId: z.string().optional(),
  providerTimestamp: z.number().int().positive().optional(),
  enqueuedAt: z.number().int().positive(),
});

export const EmbeddingUpsertJobDataSchema = z.object({
  intentId: z.string().min(1),
  intentName: z.string().min(1),
  description: z.string().optional(),
  text: z.string().min(1),
  traceId: z.string().min(1),
  accountId: z.number().int().positive(),
  operation: z.enum(['create', 'update', 'delete']),
});

export const JobMetadataSchema = z.object({
  traceId: z.string().min(1),
  accountId: z.number().int().positive(),
  conversationId: z.number().int().positive(),
  messageId: z.string().min(1),
  channel: z.string().min(1),
  enqueuedAt: z.number().int().positive(),
  attempts: z.number().int().nonnegative(),
  priority: z.number().int().optional(),
});

export const JobResultSchema = z.object({
  success: z.boolean(),
  result: z.any().optional(),
  error: z.string().optional(),
  fallbackReason: z.string().optional(),
  metrics: z.object({
    processingTimeMs: z.number().nonnegative(),
    llmTokensUsed: z.number().int().nonnegative().optional(),
    intentScore: z.number().min(0).max(1).optional(),
  }).optional(),
});

export const DeadLetterQueueItemSchema = z.object({
  jobId: z.string().min(1),
  jobData: z.union([AiMessageJobDataSchema, EmbeddingUpsertJobDataSchema]),
  error: z.string().min(1),
  failedAt: z.number().int().positive(),
  attempts: z.number().int().nonnegative(),
  queue: z.string().min(1),
  reprocessReason: z.string().optional(),
  reprocessedBy: z.string().optional(),
});

// Type inference
export type FeatureFlagConfigType = z.infer<typeof FeatureFlagConfigSchema>;
export type AiMessageJobDataType = z.infer<typeof AiMessageJobDataSchema>;
export type EmbeddingUpsertJobDataType = z.infer<typeof EmbeddingUpsertJobDataSchema>;
export type JobMetadataType = z.infer<typeof JobMetadataSchema>;
export type JobResultType = z.infer<typeof JobResultSchema>;
export type DeadLetterQueueItemType = z.infer<typeof DeadLetterQueueItemSchema>;