/**
 * Zod schemas for webhook validation
 * Based on requirements 13.1, 13.2
 */

import { z } from 'zod';

export const ChatwitWebhookPayloadSchema = z.object({
  account_id: z.number().int().positive(),
  channel: z.enum(['whatsapp', 'instagram', 'messenger']),
  conversation: z.object({
    id: z.number().int().positive(),
    inbox_id: z.number().int().positive(),
    status: z.enum(['open', 'resolved', 'pending']),
  }),
  message: z.object({
    id: z.number().int().positive(),
    message_type: z.enum(['incoming', 'outgoing']),
    content_type: z.string().nullable(),
    content: z.string().nullable(),
    content_attributes: z.record(z.any()).optional(),
    created_at: z.number().int().positive(),
    source_id: z.string().nullable().optional(),
    sender: z.object({
      type: z.enum(['contact', 'agent']),
      id: z.number().int().positive(),
      name: z.string().nullable().optional(),
    }).optional(),
  }),
}).refine(
  (data) => data.message.content !== null || data.message.content_attributes !== undefined,
  {
    message: "Either 'content' or 'content_attributes' must be provided",
    path: ['message'],
  }
);

export const WebhookHeadersSchema = z.object({
  'x-chatwit-signature': z.string().min(1),
  'x-chatwit-timestamp': z.string().regex(/^\d+$/),
  'x-chatwit-signature-version': z.string().optional().default('v1'),
  'content-type': z.string(),
});

export const WebhookResponseSchema = z.object({
  ok: z.boolean(),
  skipped: z.boolean().optional(),
  dedup: z.boolean().optional(),
  throttled: z.boolean().optional(),
});

export const IdempotencyKeySchema = z.object({
  accountId: z.number().int().positive(),
  conversationId: z.number().int().positive(),
  messageId: z.string().min(1),
});

export const RateLimitConfigSchema = z.object({
  conversation: z.object({
    limit: z.number().int().positive(),
    window: z.number().int().positive(),
  }),
  account: z.object({
    limit: z.number().int().positive(),
    window: z.number().int().positive(),
  }),
  contact: z.object({
    limit: z.number().int().positive(),
    window: z.number().int().positive(),
  }),
});

// Type inference
export type ChatwitWebhookPayloadType = z.infer<typeof ChatwitWebhookPayloadSchema>;
export type WebhookHeadersType = z.infer<typeof WebhookHeadersSchema>;
export type WebhookResponseType = z.infer<typeof WebhookResponseSchema>;
export type IdempotencyKeyType = z.infer<typeof IdempotencyKeySchema>;
export type RateLimitConfigType = z.infer<typeof RateLimitConfigSchema>;