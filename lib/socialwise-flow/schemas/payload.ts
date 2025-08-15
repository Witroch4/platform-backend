/**
 * SocialWise Flow Payload Validation Schemas
 * Based on requirements 4.2, 4.5, 4.6, 4.8
 */

import { z } from 'zod';

// Interactive data schemas for different channels
const WhatsAppInteractiveDataSchema = z.object({
  interaction_type: z.string().optional(),
  button_id: z.string().optional(),
  button_title: z.string().optional(),
});

const InstagramInteractiveDataSchema = z.object({
  interaction_type: z.string().optional(),
  postback_payload: z.string().optional(),
});

const MessageDataSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(val => String(val)).optional(),
  interactive_data: WhatsAppInteractiveDataSchema.optional(),
  instagram_data: InstagramInteractiveDataSchema.optional(),
});

const InboxDataSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(val => String(val)).refine(val => val.length > 0, "Inbox ID is required"),
  name: z.string().optional().nullable().transform(val => val || undefined),
  channel_type: z.string().min(1, "Channel type is required"),
});

const AccountDataSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(val => String(val)).refine(val => val.length > 0, "Account ID is required"),
});

const WhatsAppIdentifiersSchema = z.object({
  wamid: z.string().optional(),
  whatsapp_id: z.string().optional(),
  contact_source: z.string().optional(),
});

const SocialWiseChatwitContextSchema = z.object({
  inbox_data: InboxDataSchema,
  account_data: AccountDataSchema,
  whatsapp_identifiers: WhatsAppIdentifiersSchema.optional(),
  whatsapp_phone_number_id: z.union([z.string(), z.number()]).transform(val => String(val)).optional().nullable().transform(val => val || undefined),
  whatsapp_business_id: z.union([z.string(), z.number()]).transform(val => String(val)).optional().nullable().transform(val => val || undefined),
  wamid: z.string().optional().nullable().transform(val => val || undefined),
  message_data: MessageDataSchema.optional(),
  // Add all the other fields from the real payload
  contact_data: z.object({
    id: z.number().optional(),
    name: z.string().optional(),
    phone_number: z.string().optional(),
    email: z.string().nullable().optional().transform(val => val || undefined),
    identifier: z.string().nullable().optional().transform(val => val || undefined),
    custom_attributes: z.record(z.any()).optional(),
  }).optional(),
  conversation_data: z.object({
    id: z.number().optional(),
    status: z.string().optional(),
    assignee_id: z.number().nullable().optional().transform(val => val || undefined),
    created_at: z.string().optional(),
    updated_at: z.string().optional(),
  }).optional(),
  metadata: z.object({
    socialwise_active: z.boolean().optional(),
    is_whatsapp_channel: z.boolean().optional(),
    payload_version: z.string().optional(),
    timestamp: z.string().optional(),
    has_whatsapp_api_key: z.boolean().optional(),
  }).optional(),
  whatsapp_api_key: z.string().optional(),
  // Legacy flat fields for backward compatibility
  contact_source: z.string().optional(),
  contact_name: z.string().optional(),
  contact_phone: z.string().optional(),
  contact_email: z.string().nullable().optional().transform(val => val || undefined),
  contact_identifier: z.string().nullable().optional().transform(val => val || undefined),
  contact_id: z.number().optional(),
  conversation_id: z.number().optional(),
  conversation_status: z.string().optional(),
  conversation_assignee_id: z.number().nullable().optional().transform(val => val || undefined),
  conversation_created_at: z.string().optional(),
  conversation_updated_at: z.string().optional(),
  message_id: z.number().optional(),
  message_content: z.string().optional(),
  message_type: z.string().optional(),
  message_created_at: z.string().optional(),
  message_content_type: z.string().optional(),
  button_id: z.string().nullable().optional().transform(val => val || undefined),
  button_title: z.string().nullable().optional().transform(val => val || undefined),
  list_id: z.string().nullable().optional().transform(val => val || undefined),
  list_title: z.string().nullable().optional().transform(val => val || undefined),
  list_description: z.string().nullable().optional().transform(val => val || undefined),
  interaction_type: z.string().nullable().optional().transform(val => val || undefined),
  postback_payload: z.string().nullable().optional().transform(val => val || undefined),
  quick_reply_payload: z.string().nullable().optional().transform(val => val || undefined),
  inbox_id: z.number().optional(),
  inbox_name: z.string().optional(),
  channel_type: z.string().optional(),
  account_id: z.number().optional(),
  account_name: z.string().optional(),
  phone_number_id: z.string().optional(),
  business_id: z.string().optional(),
  socialwise_active: z.boolean().optional(),
  is_whatsapp_channel: z.boolean().optional(),
  has_whatsapp_api_key: z.boolean().optional(),
  payload_version: z.string().optional(),
  timestamp: z.string().optional(),
});

const MessageContentAttributesSchema = z.object({
  interaction_type: z.string().optional(),
  button_reply: z.object({
    id: z.string().optional(),
    title: z.string().optional(),
  }).optional(),
  quick_reply_payload: z.string().optional(),
  postback_payload: z.string().optional(),
  interactive_payload: z.object({
    button_reply: z.object({
      id: z.string().optional(),
      title: z.string().optional(),
    }).optional(),
  }).optional(),
});

const MessageContextSchema = z.object({
  id: z.number().optional(),
  source_id: z.string().optional(), // Priority field for message identification (wamid for WhatsApp, message ID for Instagram/Facebook)
  content_attributes: MessageContentAttributesSchema.optional(),
});

const ContextSchema = z.object({
  'socialwise-chatwit': SocialWiseChatwitContextSchema,
  message: MessageContextSchema.optional(),
  channel_type: z.string().optional(),
  inbox_id: z.union([z.string(), z.number()]).transform(val => String(val)).optional(),
  account_id: z.union([z.string(), z.number()]).transform(val => String(val)).optional(),
  interaction_type: z.string().optional(),
  postback_payload: z.string().optional(),
  quick_reply_payload: z.string().optional(),
});

// Main SocialWise Flow payload schema
export const SocialWiseFlowPayloadSchema = z.object({
  session_id: z.union([z.string(), z.number()]).transform(val => String(val)).refine(val => val.length > 0, "Session ID is required"),
  context: ContextSchema,
  message: z.string().min(1, "Message content is required"),
  channel_type: z.string().min(1, "Channel type is required"),
}).refine(
  (data) => {
    // Ensure we have identifier for idempotency - priority: context.message.source_id > wamid > message_data.id
    const swContext = data.context['socialwise-chatwit'];
    const messageSourceId = data.context.message?.source_id;
    const wamid = swContext?.wamid || swContext?.whatsapp_identifiers?.wamid;
    const messageId = swContext?.message_data?.id || swContext?.message_id;
    const sessionId = data.session_id;
    
    // At minimum, we need session_id for idempotency, but prefer message source_id, wamid or message_id
    return sessionId && (messageSourceId || wamid || messageId || sessionId);
  },
  {
    message: "Session ID is required for idempotency, with optional message source_id, wamid or message_data.id",
    path: ['context'],
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
 * Preprocess payload to handle common type coercion issues
 * Converts numbers to strings where expected and handles null values
 */
export function preprocessSocialWisePayload(payload: any): any {
  if (!payload || typeof payload !== 'object') {
    return payload;
  }

  // Helper function to convert number/null to string or remove null/undefined
  const processValue = (value: any, shouldConvertToString = true): any => {
    if (value === null || value === undefined) {
      return undefined;
    }
    return shouldConvertToString ? String(value) : value;
  };

  // Helper function to remove null values from an object
  const removeNulls = (obj: any): any => {
    if (obj === null || obj === undefined) {
      return undefined;
    }
    if (typeof obj !== 'object' || Array.isArray(obj)) {
      return obj;
    }
    const cleaned: any = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value !== null) {
        cleaned[key] = typeof value === 'object' && !Array.isArray(value) ? removeNulls(value) : value;
      }
    }
    return cleaned;
  };

  // Deep clone to avoid mutating original
  const processed = JSON.parse(JSON.stringify(payload));

  // Convert session_id
  if ('session_id' in processed) {
    processed.session_id = processValue(processed.session_id);
  }

  // Convert context fields
  if (processed.context) {
    if ('inbox_id' in processed.context) {
      processed.context.inbox_id = processValue(processed.context.inbox_id);
    }
    if ('account_id' in processed.context) {
      processed.context.account_id = processValue(processed.context.account_id);
    }

    // Convert socialwise-chatwit context
    const swContext = processed.context['socialwise-chatwit'];
    if (swContext) {
      // Convert inbox_data
      if (swContext.inbox_data) {
        if ('id' in swContext.inbox_data) {
          swContext.inbox_data.id = processValue(swContext.inbox_data.id);
        }
        if ('name' in swContext.inbox_data) {
          swContext.inbox_data.name = processValue(swContext.inbox_data.name, false);
          if (swContext.inbox_data.name === undefined) {
            delete swContext.inbox_data.name;
          }
        }
      }
      
      // Convert account_data.id
      if (swContext.account_data && 'id' in swContext.account_data) {
        swContext.account_data.id = processValue(swContext.account_data.id);
      }

      // Convert WhatsApp IDs
      if ('whatsapp_phone_number_id' in swContext) {
        swContext.whatsapp_phone_number_id = processValue(swContext.whatsapp_phone_number_id);
        if (swContext.whatsapp_phone_number_id === undefined) {
          delete swContext.whatsapp_phone_number_id;
        }
      }
      if ('whatsapp_business_id' in swContext) {
        swContext.whatsapp_business_id = processValue(swContext.whatsapp_business_id);
        if (swContext.whatsapp_business_id === undefined) {
          delete swContext.whatsapp_business_id;
        }
      }

      // Convert message_data.id
      if (swContext.message_data && 'id' in swContext.message_data) {
        swContext.message_data.id = processValue(swContext.message_data.id);
      }
    }
  }

  // Apply null removal to the entire context to clean up any remaining nulls
  if (processed.context) {
    processed.context = removeNulls(processed.context);
  }

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