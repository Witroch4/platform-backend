/**
 * Zod schemas for channel-specific validation
 * Based on requirements 13.1, 13.2
 */

import { z } from 'zod';

export const WhatsAppButtonSchema = z.object({
  type: z.literal('reply'),
  title: z.string().min(1).max(20),
  id: z.string().min(1).max(256),
});

export const InstagramQuickReplySchema = z.object({
  title: z.string().min(1).max(20),
  payload: z.string().min(1).max(1000),
});

export const InstagramButtonSchema = z.object({
  type: z.enum(['postback', 'web_url']),
  title: z.string().min(1).max(20),
  payload: z.string().min(1).max(1000).optional(),
  url: z.string().url().refine(
    (url) => url.startsWith('https://'),
    { message: 'URL must use HTTPS protocol' }
  ).optional(),
}).refine(
  (data) => {
    if (data.type === 'postback') return data.payload !== undefined;
    if (data.type === 'web_url') return data.url !== undefined;
    return false;
  },
  { message: 'postback requires payload, web_url requires url' }
);

export const WhatsAppInteractiveSchema = z.object({
  header: z.object({
    type: z.enum(['text', 'image', 'video', 'document']),
    text: z.string().max(60).optional(),
    link: z.string().url().optional(),
  }).optional(),
  body: z.string().min(1).max(1024),
  footer: z.string().max(60).optional(),
  buttons: z.array(WhatsAppButtonSchema).min(1).max(3),
});

export const InstagramQuickReplyMessageSchema = z.object({
  text: z.string().min(1).max(1000),
  quick_replies: z.array(InstagramQuickReplySchema).min(1).max(13),
});

export const InstagramButtonTemplateSchema = z.object({
  text: z.string().min(1).max(640),
  buttons: z.array(InstagramButtonSchema).min(1).max(3),
});

export const ChannelMessageSchema = z.object({
  channel: z.enum(['whatsapp', 'instagram', 'messenger']),
  text: z.string().min(1),
  buttons: z.union([
    z.array(WhatsAppButtonSchema),
    z.array(InstagramQuickReplySchema),
    z.array(InstagramButtonSchema),
  ]).optional(),
  header: z.object({
    type: z.enum(['text', 'image', 'video', 'document']),
    text: z.string().optional(),
    link: z.string().url().optional(),
  }).optional(),
  footer: z.string().optional(),
});

export const ButtonPayloadSchema = z.object({
  type: z.enum(['intent', 'flow', 'help']),
  slug: z.string().min(1),
  metadata: z.record(z.any()).optional(),
});

export const ClickPayloadSchema = z.object({
  channel: z.enum(['whatsapp', 'instagram', 'messenger']),
  payloadType: z.enum(['button_reply', 'quick_reply', 'postback']),
  payload: z.string().min(1),
  conversationId: z.number().int().positive(),
  messageId: z.string().min(1),
  timestamp: z.number().int().positive(),
});

export const ChannelValidationResultSchema = z.object({
  isValid: z.boolean(),
  errors: z.array(z.string()),
  warnings: z.array(z.string()),
  sanitized: ChannelMessageSchema.optional(),
});

// Type inference
export type WhatsAppButtonType = z.infer<typeof WhatsAppButtonSchema>;
export type InstagramQuickReplyType = z.infer<typeof InstagramQuickReplySchema>;
export type InstagramButtonType = z.infer<typeof InstagramButtonSchema>;
export type WhatsAppInteractiveType = z.infer<typeof WhatsAppInteractiveSchema>;
export type InstagramQuickReplyMessageType = z.infer<typeof InstagramQuickReplyMessageSchema>;
export type InstagramButtonTemplateType = z.infer<typeof InstagramButtonTemplateSchema>;
export type ChannelMessageType = z.infer<typeof ChannelMessageSchema>;
export type ButtonPayloadType = z.infer<typeof ButtonPayloadSchema>;
export type ClickPayloadType = z.infer<typeof ClickPayloadSchema>;
export type ChannelValidationResultType = z.infer<typeof ChannelValidationResultSchema>;