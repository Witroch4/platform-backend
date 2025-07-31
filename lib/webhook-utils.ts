/**
 * Utility functions for extracting data from Dialogflow webhook payloads
 */

export interface ExtractedWebhookData {
  whatsappApiKey: string;
  messageId: string;
  conversationId: string;
  contactPhone: string;
  inboxId: string;
  intentName: string;
}

/**
 * Enhanced interface for unified webhook payload structure
 * Supports the new "Super Modelo" requirements
 */
export interface UnifiedWebhookPayload {
  // Core identification
  inboxId: string;
  contactPhone: string;
  contactSource: string;
  
  // WhatsApp credentials (source of truth from payload)
  credentials: {
    whatsappApiKey: string;
    phoneNumberId: string;
    businessId: string;
  };
  
  // Message context
  messageId: string;
  wamid: string;
  conversationId: string;
  
  // Interaction details
  interactionType: 'intent' | 'button_reply';
  intentName?: string;
  buttonId?: string;
  
  // Lead data for persistence
  leadData: {
    messageId: number;
    accountId: number;
    accountName: string;
  };
  
  // Original payload for debugging
  originalPayload: any;
}

/**
 * Extracts WhatsApp API key and message information from Dialogflow payload
 * Legacy function maintained for backward compatibility
 */
export function extractWebhookData(payload: any): ExtractedWebhookData {
  // Handle null/undefined payloads
  if (!payload || typeof payload !== 'object') {
    return {
      whatsappApiKey: '',
      messageId: `msg_${Date.now()}`,
      conversationId: '',
      contactPhone: '',
      inboxId: '',
      intentName: 'Unknown'
    };
  }

  // Extract WhatsApp API key from originalDetectIntentRequest
  const whatsappApiKey = payload.originalDetectIntentRequest?.payload?.whatsapp_api_key || 
                        payload.originalDetectIntentRequest?.payload?.access_token ||
                        '';

  // Extract message ID (wamid) from payload
  const messageId = payload.originalDetectIntentRequest?.payload?.message_id ||
                   payload.originalDetectIntentRequest?.payload?.wamid ||
                   payload.originalDetectIntentRequest?.payload?.id ||
                   `msg_${Date.now()}`;

  // Extract conversation ID and ensure it's a string
  const rawConversationId = payload.originalDetectIntentRequest?.payload?.conversation_id ||
                           payload.originalDetectIntentRequest?.payload?.from ||
                           payload.session?.split('/').pop() ||
                           '';
  const conversationId = String(rawConversationId);

  // Extract contact phone from session or payload
  const contactPhone = extractContactPhone(payload);

  // Extract inbox ID and convert to string
  const rawInboxId = payload.originalDetectIntentRequest?.payload?.inbox_id ||
                     payload.originalDetectIntentRequest?.payload?.source_id ||
                     '';
  const inboxId = String(rawInboxId);

  // Extract intent name
  const intentName = payload.queryResult?.intent?.displayName || 'Unknown';

  return {
    whatsappApiKey,
    messageId,
    conversationId,
    contactPhone,
    inboxId,
    intentName
  };
}

/**
 * Enhanced extraction function for unified webhook payload structure
 * Optimized for millisecond response times and new "Super Modelo" requirements
 */
export function extractUnifiedWebhookData(payload: any): UnifiedWebhookPayload {
  // Handle null/undefined payloads with minimal processing
  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid payload: payload is null or not an object');
  }

  const originalDetectIntentRequest = payload.originalDetectIntentRequest;
  if (!originalDetectIntentRequest?.payload) {
    throw new Error('Invalid payload: missing originalDetectIntentRequest.payload');
  }

  const chatwootPayload = originalDetectIntentRequest.payload;

  // Extract required fields with validation
  const inboxId = String(chatwootPayload.inbox_id || '');
  if (!inboxId) {
    throw new Error('Invalid payload: missing inbox_id');
  }

  const contactPhone = extractContactPhone(payload);
  if (!contactPhone) {
    throw new Error('Invalid payload: missing or invalid contact_phone');
  }

  // Extract credentials (source of truth from payload)
  const whatsappApiKey = chatwootPayload.whatsapp_api_key || chatwootPayload.access_token || '';
  const phoneNumberId = chatwootPayload.phone_number_id || '';
  const businessId = chatwootPayload.business_id || '';

  if (!whatsappApiKey) {
    throw new Error('Invalid payload: missing whatsapp_api_key');
  }

  // Extract message context
  const messageId = chatwootPayload.message_id || chatwootPayload.wamid || chatwootPayload.id || `msg_${Date.now()}`;
  const wamid = chatwootPayload.wamid || messageId;
  const rawConversationId = chatwootPayload.conversation_id || chatwootPayload.from || contactPhone;
  const conversationId = String(rawConversationId);

  // Extract contact source for lead identification
  const contactSource = chatwootPayload.contact_source || 'chatwit_webhook';

  // Determine interaction type
  const interactive = chatwootPayload.interactive;
  let interactionType: 'intent' | 'button_reply' = 'intent';
  let intentName: string | undefined;
  let buttonId: string | undefined;

  if (interactive?.type === 'button_reply' || interactive?.type === 'list_reply') {
    interactionType = 'button_reply';
    buttonId = interactive.button_reply?.id || interactive.list_reply?.id;
  } else {
    intentName = payload.queryResult?.intent?.displayName || 'Unknown';
  }

  // Extract lead data for persistence
  const leadData = {
    messageId: Number(chatwootPayload.message_id) || 0,
    accountId: Number(chatwootPayload.account_id) || 0,
    accountName: chatwootPayload.account_name || '',
  };

  return {
    inboxId,
    contactPhone,
    contactSource,
    credentials: {
      whatsappApiKey,
      phoneNumberId,
      businessId,
    },
    messageId,
    wamid,
    conversationId,
    interactionType,
    intentName,
    buttonId,
    leadData,
    originalPayload: payload,
  };
}

/**
 * Extracts contact phone number from various possible locations in the payload
 */
export function extractContactPhone(payload: any): string {
  // Handle null/undefined payloads
  if (!payload || typeof payload !== 'object') {
    return '';
  }

  // Try different possible locations for phone number
  const possiblePhones = [
    payload.originalDetectIntentRequest?.payload?.from,
    payload.originalDetectIntentRequest?.payload?.phone,
    payload.originalDetectIntentRequest?.payload?.contact?.phone,
    payload.session?.split('/').pop(),
    payload.originalDetectIntentRequest?.payload?.sender?.phone,
    payload.originalDetectIntentRequest?.payload?.user?.phone
  ];

  for (const phone of possiblePhones) {
    if (phone && typeof phone === 'string') {
      // Clean phone number - remove non-numeric characters
      const cleanPhone = phone.replace(/\D/g, '');
      if (cleanPhone.length >= 10) {
        return cleanPhone;
      }
    }
  }

  // Fallback: extract from session if it contains phone-like pattern
  const session = payload.session || '';
  const sessionParts = session.split('/');
  const lastPart = sessionParts[sessionParts.length - 1];
  if (lastPart && /^\d{10,}$/.test(lastPart.replace(/\D/g, ''))) {
    return lastPart.replace(/\D/g, '');
  }

  return '';
}

/**
 * Validates if the extracted webhook data is complete
 * Legacy function maintained for backward compatibility
 */
export function validateWebhookData(data: ExtractedWebhookData): boolean {
  return !!(
    data.messageId &&
    data.contactPhone &&
    data.intentName
  );
}

/**
 * Validates unified webhook payload data
 * Performs comprehensive validation for required fields and security
 */
export function validateUnifiedWebhookData(data: UnifiedWebhookPayload): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Validate core identification
  if (!data.inboxId || typeof data.inboxId !== 'string') {
    errors.push('Invalid or missing inboxId');
  }

  if (!data.contactPhone || typeof data.contactPhone !== 'string') {
    errors.push('Invalid or missing contactPhone');
  } else if (!/^\d{10,15}$/.test(data.contactPhone)) {
    errors.push('contactPhone must be 10-15 digits');
  }

  if (!data.contactSource || typeof data.contactSource !== 'string') {
    errors.push('Invalid or missing contactSource');
  }

  // Validate credentials
  if (!data.credentials.whatsappApiKey || typeof data.credentials.whatsappApiKey !== 'string') {
    errors.push('Invalid or missing whatsappApiKey');
  } else if (data.credentials.whatsappApiKey.length < 10) {
    errors.push('whatsappApiKey too short (minimum 10 characters)');
  }

  // phoneNumberId and businessId are optional but should be strings if present
  if (data.credentials.phoneNumberId && typeof data.credentials.phoneNumberId !== 'string') {
    errors.push('phoneNumberId must be a string');
  }

  if (data.credentials.businessId && typeof data.credentials.businessId !== 'string') {
    errors.push('businessId must be a string');
  }

  // Validate message context
  if (!data.messageId || typeof data.messageId !== 'string') {
    errors.push('Invalid or missing messageId');
  }

  if (!data.wamid || typeof data.wamid !== 'string') {
    errors.push('Invalid or missing wamid');
  }

  // Validate interaction type specific fields
  if (data.interactionType === 'intent') {
    if (!data.intentName || typeof data.intentName !== 'string') {
      errors.push('intentName is required for intent interactions');
    }
  } else if (data.interactionType === 'button_reply') {
    if (!data.buttonId || typeof data.buttonId !== 'string') {
      errors.push('buttonId is required for button_reply interactions');
    }
  } else {
    errors.push('interactionType must be either "intent" or "button_reply"');
  }

  // Validate lead data types
  if (typeof data.leadData.messageId !== 'number') {
    errors.push('leadData.messageId must be a number');
  }

  if (typeof data.leadData.accountId !== 'number') {
    errors.push('leadData.accountId must be a number');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Sanitizes webhook payload data for security
 * Removes potentially dangerous fields and normalizes data
 */
export function sanitizeWebhookPayload(data: UnifiedWebhookPayload): UnifiedWebhookPayload {
  return {
    ...data,
    // Sanitize phone number (remove non-digits)
    contactPhone: data.contactPhone.replace(/\D/g, ''),
    
    // Sanitize credentials (trim whitespace)
    credentials: {
      whatsappApiKey: data.credentials.whatsappApiKey.trim(),
      phoneNumberId: data.credentials.phoneNumberId.trim(),
      businessId: data.credentials.businessId.trim(),
    },
    
    // Sanitize string fields
    inboxId: data.inboxId.trim(),
    contactSource: data.contactSource.trim(),
    messageId: data.messageId.trim(),
    wamid: data.wamid.trim(),
    conversationId: data.conversationId.trim(),
    
    // Sanitize optional fields
    intentName: data.intentName?.trim(),
    buttonId: data.buttonId?.trim(),
    
    // Sanitize lead data
    leadData: {
      ...data.leadData,
      accountName: data.leadData.accountName.trim(),
    },
    
    // Keep original payload as-is for debugging (but could be removed in production)
    originalPayload: data.originalPayload,
  };
}

/**
 * Extracts message content from Dialogflow payload
 */
export function extractMessageContent(payload: any): string {
  if (!payload || typeof payload !== 'object') {
    return 'Mensagem sem conteúdo de texto';
  }
  
  return payload.queryResult?.queryText ||
         payload.originalDetectIntentRequest?.payload?.message?.text ||
         payload.originalDetectIntentRequest?.payload?.text ||
         'Mensagem sem conteúdo de texto';
}

/**
 * Extracts message type from Dialogflow payload
 */
export function extractMessageType(payload: any): string {
  if (!payload || typeof payload !== 'object') {
    return 'unknown';
  }
  
  return payload.originalDetectIntentRequest?.payload?.message?.type ||
         payload.originalDetectIntentRequest?.payload?.type ||
         (payload.queryResult?.queryText ? 'text' : 'unknown');
}

/**
 * Checks if the payload contains a valid WhatsApp API key
 */
export function hasValidApiKey(payload: any): boolean {
  if (!payload || typeof payload !== 'object') {
    return false;
  }
  
  const apiKey = payload.originalDetectIntentRequest?.payload?.whatsapp_api_key ||
                payload.originalDetectIntentRequest?.payload?.access_token;
  
  return !!(apiKey && typeof apiKey === 'string' && apiKey.length > 10);
}

/**
 * Logs webhook data for debugging purposes
 * Legacy function maintained for backward compatibility
 */
export function logWebhookData(data: ExtractedWebhookData, payload: any): void {
  console.log('[MTF Diamante Webhook] Dados extraídos:', {
    whatsappApiKey: data.whatsappApiKey ? `${data.whatsappApiKey.substring(0, 10)}...` : 'N/A',
    messageId: data.messageId,
    conversationId: data.conversationId,
    contactPhone: data.contactPhone,
    inboxId: data.inboxId,
    inboxIdType: typeof data.inboxId,
    intentName: data.intentName,
    hasApiKey: hasValidApiKey(payload),
    payloadKeys: Object.keys(payload)
  });
  
  // Log detalhado do originalDetectIntentRequest.payload
  console.log('[MTF Diamante Webhook] originalDetectIntentRequest.payload:', 
    JSON.stringify(payload.originalDetectIntentRequest?.payload, null, 2)
  );
}

/**
 * Detects the channel type from Dialogflow payload
 */
export function detectChannelType(payload: any): {
  isInstagram: boolean;
  channelType: string;
  originalPayload: any;
} {
  // Handle null/undefined payloads
  if (!payload || typeof payload !== 'object') {
    return {
      isInstagram: false,
      channelType: 'unknown',
      originalPayload: payload,
    };
  }

  // Extract channel_type from originalDetectIntentRequest.payload
  const channelType = payload.originalDetectIntentRequest?.payload?.channel_type || '';
  
  // Check if it's Instagram channel
  const isInstagram = channelType === 'Channel::Instagram';
  
  return {
    isInstagram,
    channelType,
    originalPayload: payload,
  };
}

/**
 * Enhanced logging function with correlation ID support for unified webhook data
 */
export function logUnifiedWebhookData(
  data: UnifiedWebhookPayload,
  correlationId: string,
  processingTimeMs?: number
): void {
  const logData = {
    correlationId,
    timestamp: new Date().toISOString(),
    processingTimeMs,
    extractedData: {
      inboxId: data.inboxId,
      contactPhone: data.contactPhone ? `${data.contactPhone.substring(0, 4)}****${data.contactPhone.substring(data.contactPhone.length - 4)}` : 'N/A',
      contactSource: data.contactSource,
      interactionType: data.interactionType,
      intentName: data.intentName,
      buttonId: data.buttonId,
      hasCredentials: {
        whatsappApiKey: !!data.credentials.whatsappApiKey,
        phoneNumberId: !!data.credentials.phoneNumberId,
        businessId: !!data.credentials.businessId,
      },
      messageContext: {
        messageId: data.messageId,
        wamid: data.wamid,
        conversationId: data.conversationId ? `${data.conversationId.substring(0, 8)}...` : 'N/A',
      },
      leadData: {
        messageId: data.leadData.messageId,
        accountId: data.leadData.accountId,
        accountName: data.leadData.accountName,
      },
    },
  };

  console.log(`[MTF Diamante Webhook] [${correlationId}] Unified webhook data extracted:`, logData);
}

/**
 * Logs webhook processing errors with correlation ID
 */
export function logWebhookError(
  error: Error,
  correlationId: string,
  context?: any
): void {
  const errorData = {
    correlationId,
    timestamp: new Date().toISOString(),
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack,
    },
    context,
  };

  console.error(`[MTF Diamante Webhook] [${correlationId}] Error:`, errorData);
}