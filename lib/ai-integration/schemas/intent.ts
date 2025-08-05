/**
 * Zod schemas for intent classification validation
 * Based on requirements 13.1, 13.2
 */

import { z } from 'zod';

export const IntentSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  actionType: z.string().min(1),
  templateId: z.string().optional(),
  embedding: z.array(z.number()).length(1536), // text-embedding-3-small dimensions
  similarityThreshold: z.number().min(0).max(1).default(0.8),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const IntentCandidateSchema = z.object({
  name: z.string().min(1),
  similarity: z.number().min(0).max(1),
  threshold: z.number().min(0).max(1),
  actionType: z.string().min(1),
  templateId: z.string().optional(),
});

export const IntentClassificationResultSchema = z.object({
  intent: z.string().optional(),
  score: z.number().min(0).max(1),
  candidates: z.array(z.object({
    name: z.string().min(1),
    similarity: z.number().min(0).max(1),
  })),
  threshold: z.number().min(0).max(1),
  classified: z.boolean(),
});

export const IntentHitSchema = z.object({
  id: z.string().min(1),
  conversationId: z.string().min(1),
  messageId: z.string().min(1),
  candidateName: z.string().min(1),
  similarity: z.number().min(0).max(1),
  chosen: z.boolean().default(false),
  traceId: z.string().optional(),
  createdAt: z.date(),
  expiresAt: z.date(),
});

export const EmbeddingVectorSchema = z.object({
  dimensions: z.number().int().positive(),
  values: z.array(z.number()),
  model: z.string().min(1),
  generatedAt: z.date(),
});

export const SimilaritySearchParamsSchema = z.object({
  embedding: z.array(z.number()).length(1536),
  threshold: z.number().min(0).max(1),
  limit: z.number().int().positive().optional().default(10),
  accountId: z.number().int().positive().optional(),
});

export const SimilaritySearchResultSchema = z.object({
  intent: z.string().min(1),
  similarity: z.number().min(0).max(1),
  actionType: z.string().min(1),
  templateId: z.string().optional(),
});

// Type inference
export type IntentType = z.infer<typeof IntentSchema>;
export type IntentCandidateType = z.infer<typeof IntentCandidateSchema>;
export type IntentClassificationResultType = z.infer<typeof IntentClassificationResultSchema>;
export type IntentHitType = z.infer<typeof IntentHitSchema>;
export type EmbeddingVectorType = z.infer<typeof EmbeddingVectorSchema>;
export type SimilaritySearchParamsType = z.infer<typeof SimilaritySearchParamsSchema>;
export type SimilaritySearchResultType = z.infer<typeof SimilaritySearchResultSchema>;