/**
 * SocialWise Flow Payload Validation Schemas
 * Based on requirements 4.2, 4.5, 4.6, 4.8
 */

import { z } from 'zod';

// Tipo para socialwise-chatwit para manter compatibilidade sem validação estrita
export interface SocialWiseChatwitData {
  wamid?: string;
  contact_data?: {
    id?: number;
    name?: string;
    phone_number?: string | null;
    email?: string | null;
  };
  message_data?: {
    id?: number;
    content?: string;
    interactive_data?: any;
    instagram_data?: any;
  };
  inbox_data?: {
    id?: number;
    name?: string;
    channel_type?: string;
  };
  account_data?: {
    id?: number;
    name?: string;
  };
  contact_name?: string;
  contact_phone?: string | null;
  [key: string]: any; // Permite qualquer campo extra
}

// 🎯 SCHEMAS SIMPLIFICADOS: Validar apenas campos críticos
// Permitir campos extras sem validação para máxima flexibilidade

// Schema básico para dados críticos da mensagem - apenas campos essenciais
const CriticalMessageSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(val => String(val)),
  content: z.string().min(1),
  account_id: z.union([z.string(), z.number()]).transform(val => Number(val)),
  inbox_id: z.union([z.string(), z.number()]).transform(val => Number(val)),
  conversation_id: z.union([z.string(), z.number()]).transform(val => Number(val)),
  message_type: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  source_id: z.string(), // CRÍTICO: wamid para WhatsApp, messageId para outros canais
  content_type: z.string(),
  sender_type: z.string(),
  sender_id: z.union([z.string(), z.number()]).transform(val => Number(val)),
}).passthrough(); // Permite campos extras

// Schema básico para dados críticos da conversa - apenas campos essenciais
const CriticalConversationSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(val => Number(val)),
  account_id: z.union([z.string(), z.number()]).transform(val => Number(val)),
  inbox_id: z.union([z.string(), z.number()]).transform(val => Number(val)),
  status: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  contact_id: z.union([z.string(), z.number()]).transform(val => Number(val)),
}).passthrough(); // Permite campos extras

// Schema básico para dados críticos do contato - apenas campos essenciais
const CriticalContactSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(val => Number(val)),
  name: z.string(),
  account_id: z.union([z.string(), z.number()]).transform(val => Number(val)),
  created_at: z.string(),
  updated_at: z.string(),
  additional_attributes: z.object({
    social_instagram_user_name: z.string().optional(),
    social_profiles: z.object({
      instagram: z.string().optional(),
    }).optional(),
  }).optional(),
}).passthrough(); // Permite campos extras

// Schema básico para dados críticos da caixa - apenas campos essenciais
const CriticalInboxSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(val => Number(val)),
  account_id: z.union([z.string(), z.number()]).transform(val => Number(val)),
  name: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  channel_type: z.string(),
}).passthrough(); // Permite campos extras

// Schema crítico do contexto - apenas campos essenciais obrigatórios
const CriticalContextSchema = z.object({
  message: CriticalMessageSchema,
  conversation: CriticalConversationSchema,
  contact: CriticalContactSchema,
  inbox: CriticalInboxSchema,
}).passthrough(); // Permite qualquer campo extra sem validação

// Main SocialWise Flow payload schema - SIMPLIFICADO
// Valida apenas campos críticos, permite qualquer campo extra
export const SocialWiseFlowPayloadSchema = z.object({
  session_id: z.union([z.string(), z.number()]).transform(val => String(val)).refine(val => val.length > 0, "Session ID is required"),
  message: z.string().min(1, "Message content is required"),
  channel_type: z.string().min(1, "Channel type is required"),
  language: z.string().optional(),
  context: CriticalContextSchema,
}).passthrough() // Permite qualquer campo extra no nível raiz
.refine(
  (data) => {
    // Validação básica de integridade
    return data.session_id && data.message && data.channel_type;
  },
  {
    message: "Session ID, message and channel_type are required",
    path: ['session_id'],
  }
);

// Input sanitization schema
export const SanitizedTextSchema = z.string()
  .max(4096, "Message content too long")
  .refine(
    (text) => {
      // Basic XSS prevention - no script tags or javascript: protocols
      const dangerous = /<script|javascript:|data:text\/html|vbscript:|onload=|onerror=/i;
      return !dangerous.test(text);
    },
    {
      message: "Message contains potentially dangerous content",
    }
  );

// Nonce validation for replay protection
export const NonceSchema = z.string()
  .min(16, "Nonce must be at least 16 characters")
  .max(128, "Nonce too long")
  .regex(/^[a-zA-Z0-9_-]+$/, "Nonce contains invalid characters");

// Bearer token validation
export const BearerTokenSchema = z.string()
  .min(32, "Bearer token too short")
  .max(256, "Bearer token too long");

// Type inference
export type SocialWiseFlowPayloadType = z.infer<typeof SocialWiseFlowPayloadSchema>;
export type SanitizedTextType = z.infer<typeof SanitizedTextSchema>;
export type NonceType = z.infer<typeof NonceSchema>;
export type BearerTokenType = z.infer<typeof BearerTokenSchema>;

// Validation helper functions
export function validateSocialWisePayload(payload: unknown): {
  success: boolean;
  data?: SocialWiseFlowPayloadType;
  error?: z.ZodError;
} {
  const result = SocialWiseFlowPayloadSchema.safeParse(payload);
  return {
    success: result.success,
    data: result.success ? result.data : undefined,
    error: result.success ? undefined : result.error,
  };
}

export function sanitizeUserText(text: string): {
  success: boolean;
  data?: string;
  error?: string;
} {
  const result = SanitizedTextSchema.safeParse(text);
  if (!result.success) {
    return {
      success: false,
      error: result.error.errors[0]?.message || "Invalid text content",
    };
  }

  // Additional sanitization - remove excessive whitespace and normalize
  const sanitized = result.data
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 4096); // Hard limit

  return {
    success: true,
    data: sanitized,
  };
}

export function validateNonce(nonce: string): {
  success: boolean;
  error?: string;
} {
  const result = NonceSchema.safeParse(nonce);
  return {
    success: result.success,
    error: result.success ? undefined : result.error.errors[0]?.message,
  };
}

/**
 * Preprocess payload simples - apenas conversões básicas de tipo
 * Remove complexidade desnecessária, focando apenas no essencial
 */
export function preprocessSocialWisePayload(payload: any): any {
  if (!payload || typeof payload !== 'object') {
    return payload;
  }

  // Deep clone simples
  const processed = JSON.parse(JSON.stringify(payload));

  // Conversões básicas apenas nos campos críticos
  if ('session_id' in processed) {
    processed.session_id = String(processed.session_id || '');
  }

  // Garante que context existe
  if (!processed.context) {
    processed.context = {};
  }

  // NÃO remove nulls - aceita nulls como valores válidos
  // A validação Zod deve lidar com nullable() campos adequadamente
  
  return processed;
}

/**
 * Enhanced validation function that includes preprocessing
 */
export function validateSocialWisePayloadWithPreprocessing(payload: unknown): {
  success: boolean;
  data?: SocialWiseFlowPayloadType;
  error?: z.ZodError;
  preprocessed?: any;
} {
  try {
    // First preprocess the payload
    const preprocessed = preprocessSocialWisePayload(payload);
    
    // Then validate
    const result = SocialWiseFlowPayloadSchema.safeParse(preprocessed);
    
    return {
      success: result.success,
      data: result.success ? result.data : undefined,
      error: result.success ? undefined : result.error,
      preprocessed,
    };
  } catch (error) {
    return {
      success: false,
      error: new z.ZodError([{
        code: 'custom',
        message: `Preprocessing failed: ${error instanceof Error ? error.message : String(error)}`,
        path: [],
      }]),
    };
  }
}