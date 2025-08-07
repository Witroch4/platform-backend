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

  // Check if it's a button interaction based on interaction_type field
  if (chatwootPayload.interaction_type === 'button_reply' || interactive?.type === 'button_reply' || interactive?.type === 'list_reply') {
    interactionType = 'button_reply';
    buttonId = chatwootPayload.button_id || interactive?.button_reply?.id || interactive?.list_reply?.id;
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
    
    // Sanitize string fields (convert to string first if needed)
    inboxId: String(data.inboxId).trim(),
    contactSource: String(data.contactSource).trim(),
    messageId: String(data.messageId).trim(),
    wamid: String(data.wamid).trim(),
    conversationId: String(data.conversationId).trim(),
    
    // Sanitize optional fields
    intentName: data.intentName ? String(data.intentName).trim() : undefined,
    buttonId: data.buttonId ? String(data.buttonId).trim() : undefined,
    
    // Sanitize lead data
    leadData: {
      ...data.leadData,
      accountName: String(data.leadData.accountName).trim(),
    },
    
    // Keep original payload as-is for debugging (but could be removed in production)
    originalPayload: data.originalPayload,
  };
}

/**
 * Sanitizes any webhook payload for basic security
 * Removes potentially dangerous fields and normalizes common data types
 */
export function sanitizeGenericWebhookPayload(payload: any): any {
  if (!payload || typeof payload !== 'object') {
    return payload;
  }

  // Create a deep copy to avoid mutating the original
  const sanitized = JSON.parse(JSON.stringify(payload));

  // Recursive function to sanitize nested objects
  function sanitizeObject(obj: any): any {
    if (Array.isArray(obj)) {
      return obj.map(sanitizeObject);
    }
    
    if (obj && typeof obj === 'object') {
      const sanitizedObj: any = {};
      
      for (const [key, value] of Object.entries(obj)) {
        // Skip potentially dangerous fields
        if (key.toLowerCase().includes('password') || 
            key.toLowerCase().includes('secret') ||
            key.toLowerCase().includes('token') && key !== 'whatsapp_api_key' && key !== 'access_token') {
          continue;
        }
        
        // Sanitize string values
        if (typeof value === 'string') {
          sanitizedObj[key] = value.trim();
        }
        // Sanitize phone numbers
        else if (key.toLowerCase().includes('phone') && typeof value === 'string') {
          sanitizedObj[key] = value.replace(/\D/g, '');
        }
        // Recursively sanitize nested objects
        else if (typeof value === 'object') {
          sanitizedObj[key] = sanitizeObject(value);
        }
        // Keep other types as-is
        else {
          sanitizedObj[key] = value;
        }
      }
      
      return sanitizedObj;
    }
    
    return obj;
  }

  return sanitizeObject(sanitized);
}

/**
 * Parse Dialogflow request to identify request type
 * Enhanced to better detect button clicks from WhatsApp interactive messages
 */
export function parseDialogflowRequest(req: any): {
  type: "intent" | "button_click";
  intentName?: string;
  buttonId?: string;
  buttonText?: string;
  messageId?: string;
  originalMessageId?: string;
  recipientPhone: string;
  whatsappApiKey: string;
  inboxId?: string;
} {
  const webhookData = extractWebhookData(req);

  // Check if this is a button click from Dialogflow payload
  const chatwootPayload = req.originalDetectIntentRequest?.payload;
  const interactive = chatwootPayload?.interactive;

  // Enhanced button click detection
  if (interactive?.type === "button_reply") {
    return {
      type: "button_click",
      buttonId: interactive.button_reply?.id,
      buttonText: interactive.button_reply?.title,
      messageId: chatwootPayload?.id || chatwootPayload?.wamid,
      originalMessageId: chatwootPayload?.context?.id,
      recipientPhone: webhookData.contactPhone,
      whatsappApiKey: webhookData.whatsappApiKey,
      inboxId: webhookData.inboxId,
    };
  }

  // Check for list reply (also a type of button interaction)
  if (interactive?.type === "list_reply") {
    return {
      type: "button_click",
      buttonId: interactive.list_reply?.id,
      buttonText: interactive.list_reply?.title,
      messageId: chatwootPayload?.id || chatwootPayload?.wamid,
      originalMessageId: chatwootPayload?.context?.id,
      recipientPhone: webhookData.contactPhone,
      whatsappApiKey: webhookData.whatsappApiKey,
      inboxId: webhookData.inboxId,
    };
  }

  // Check for direct WhatsApp webhook format (fallback)
  const whatsappMessage = req.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
  if (whatsappMessage?.type === "interactive") {
    const whatsappInteractive = whatsappMessage.interactive;

    if (whatsappInteractive?.type === "button_reply") {
      return {
        type: "button_click",
        buttonId: whatsappInteractive.button_reply?.id,
        buttonText: whatsappInteractive.button_reply?.title,
        messageId: whatsappMessage.id,
        originalMessageId: whatsappMessage.context?.id,
        recipientPhone: whatsappMessage.from,
        whatsappApiKey: webhookData.whatsappApiKey,
        inboxId: webhookData.inboxId,
      };
    }

    if (whatsappInteractive?.type === "list_reply") {
      return {
        type: "button_click",
        buttonId: whatsappInteractive.list_reply?.id,
        buttonText: whatsappInteractive.list_reply?.title,
        messageId: whatsappMessage.id,
        originalMessageId: whatsappMessage.context?.id,
        recipientPhone: whatsappMessage.from,
        whatsappApiKey: webhookData.whatsappApiKey,
        inboxId: webhookData.inboxId,
      };
    }
  }

  // Otherwise it's an intent
  return {
    type: "intent",
    intentName: webhookData.intentName,
    recipientPhone: webhookData.contactPhone,
    whatsappApiKey: webhookData.whatsappApiKey,
    inboxId: String(webhookData.inboxId), // Garantir que seja string
  };
}

/**
 * Extract template variables from Dialogflow payload
 */
export function extractTemplateVariables(payload: any): Record<string, any> {
  const variables: Record<string, any> = {};

  // Handle null/undefined payloads
  if (!payload || typeof payload !== 'object') {
    return variables;
  }

  // Extract parameters from queryResult
  const parameters = payload.queryResult?.parameters || {};

  // Common variable mappings
  if (parameters.person?.name) {
    variables.name = String(parameters.person.name).trim();
    variables.nome = String(parameters.person.name).trim();
  }

  if (parameters.phone) {
    // Sanitize phone number
    variables.phone = String(parameters.phone).replace(/\D/g, '');
    variables.telefone = String(parameters.phone).replace(/\D/g, '');
  }

  if (parameters.email) {
    variables.email = String(parameters.email).trim().toLowerCase();
  }

  // Add all parameters as potential variables with sanitization
  Object.keys(parameters).forEach((key) => {
    if (parameters[key]) {
      if (typeof parameters[key] === 'string') {
        variables[key] = parameters[key].trim();
      } else if (typeof parameters[key] === 'number') {
        variables[key] = parameters[key];
      } else if (typeof parameters[key] === 'boolean') {
        variables[key] = parameters[key];
      } else {
        // For complex objects, convert to string
        variables[key] = String(parameters[key]).trim();
      }
    }
  });

  return variables;
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

/**
 * Logs sanitization process results
 */
export function logSanitizationResults(
  correlationId: string,
  originalSize: number,
  sanitizedSize: number,
  validation: { isValid: boolean; errors: string[]; warnings: string[] }
): void {
  const logData = {
    correlationId,
    timestamp: new Date().toISOString(),
    sanitization: {
      originalPayloadSize: originalSize,
      sanitizedPayloadSize: sanitizedSize,
      sizeReduction: originalSize - sanitizedSize,
      sizeReductionPercent: ((originalSize - sanitizedSize) / originalSize * 100).toFixed(2) + '%',
    },
    validation: {
      isValid: validation.isValid,
      errorsCount: validation.errors.length,
      warningsCount: validation.warnings.length,
      errors: validation.errors,
      warnings: validation.warnings,
    },
  };

  if (validation.isValid) {
    console.log(`[MTF Diamante Webhook] [${correlationId}] Payload sanitized successfully:`, logData);
  } else {
    console.error(`[MTF Diamante Webhook] [${correlationId}] Payload sanitization failed:`, logData);
  }
  
  if (validation.warnings.length > 0) {
    console.warn(`[MTF Diamante Webhook] [${correlationId}] Sanitization warnings:`, validation.warnings);
  }
}

/**
 * Creates standardized error response for webhook
 */
export function createWebhookErrorResponse(
  correlationId: string,
  error: string,
  details?: any,
  status: number = 400
): Response {
  const errorResponse = {
    correlationId,
    timestamp: new Date().toISOString(),
    error,
    details,
  };

  return new Response(JSON.stringify(errorResponse), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'X-Correlation-ID': correlationId,
      'X-Error-Type': 'webhook-processing-error',
    },
  });
}

/**
 * Creates standardized success response for webhook
 */
export function createWebhookSuccessResponse(
  correlationId: string,
  data: any,
  processingTime?: number
): Response {
  const successResponse = {
    correlationId,
    timestamp: new Date().toISOString(),
    ...data,
  };

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'X-Correlation-ID': correlationId,
  };

  if (processingTime !== undefined) {
    headers['X-Processing-Time'] = processingTime.toString();
  }

  return new Response(JSON.stringify(successResponse), {
    status: 200,
    headers,
  });
}

/**
 * Sanitizes data before enqueueing to resposta-rapida queue
 * Ensures all data is clean and safe for worker processing
 */
export function sanitizeRespostaRapidaJobData(data: {
  inboxId: string;
  contactPhone: string;
  interactionType: "button_reply" | "intent";
  buttonId?: string;
  intentName?: string;
  wamid: string;
  credentials: {
    token: string;
    phoneNumberId: string;
    businessId: string;
  };
  correlationId: string;
  messageId?: number;
  accountId?: number;
  accountName?: string;
  contactSource?: string;
}): {
  inboxId: string;
  contactPhone: string;
  interactionType: "button_reply" | "intent";
  buttonId?: string;
  intentName?: string;
  wamid: string;
  credentials: {
    token: string;
    phoneNumberId: string;
    businessId: string;
  };
  correlationId: string;
  messageId?: number;
  accountId?: number;
  accountName?: string;
  contactSource?: string;
} {
  return {
    // Sanitize core identifiers
    inboxId: String(data.inboxId).trim(),
    contactPhone: sanitizePhoneNumber(data.contactPhone),
    interactionType: data.interactionType,
    
    // Sanitize optional interaction data
    buttonId: data.buttonId ? sanitizeButtonId(data.buttonId) : undefined,
    intentName: data.intentName ? sanitizeIntentName(data.intentName) : undefined,
    
    // Sanitize message identifiers
    wamid: String(data.wamid).trim(),
    correlationId: String(data.correlationId).trim(),
    
    // Sanitize credentials
    credentials: {
      token: sanitizeApiKey(data.credentials.token),
      phoneNumberId: String(data.credentials.phoneNumberId).trim(),
      businessId: String(data.credentials.businessId).trim(),
    },
    
    // Sanitize optional metadata
    messageId: data.messageId ? Number(data.messageId) : undefined,
    accountId: data.accountId ? Number(data.accountId) : undefined,
    accountName: data.accountName ? sanitizeTextContent(data.accountName) : undefined,
    contactSource: data.contactSource ? sanitizeTextContent(data.contactSource) : undefined,
  };
}

/**
 * Validates sanitized resposta-rapida job data
 */
export function validateRespostaRapidaJobData(data: any): {
  isValid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Validate required fields
  if (!data.inboxId || typeof data.inboxId !== 'string') {
    errors.push('inboxId is required and must be a string');
  }

  if (!data.contactPhone || typeof data.contactPhone !== 'string') {
    errors.push('contactPhone is required and must be a string');
  } else if (!/^\d{10,15}$/.test(data.contactPhone)) {
    errors.push('contactPhone must be 10-15 digits after sanitization');
  }

  if (!data.interactionType || !['button_reply', 'intent'].includes(data.interactionType)) {
    errors.push('interactionType must be either "button_reply" or "intent"');
  }

  if (!data.wamid || typeof data.wamid !== 'string') {
    errors.push('wamid is required and must be a string');
  }

  if (!data.correlationId || typeof data.correlationId !== 'string') {
    errors.push('correlationId is required and must be a string');
  }

  // Validate credentials
  if (!data.credentials || typeof data.credentials !== 'object') {
    errors.push('credentials object is required');
  } else {
    if (!data.credentials.token || typeof data.credentials.token !== 'string') {
      errors.push('credentials.token is required and must be a string');
    } else if (data.credentials.token.length < 10) {
      warnings.push('credentials.token appears to be too short after sanitization');
    }

    if (!data.credentials.phoneNumberId || typeof data.credentials.phoneNumberId !== 'string') {
      errors.push('credentials.phoneNumberId is required and must be a string');
    }

    if (!data.credentials.businessId || typeof data.credentials.businessId !== 'string') {
      errors.push('credentials.businessId is required and must be a string');
    }
  }

  // Validate interaction-specific fields
  if (data.interactionType === 'intent') {
    if (!data.intentName || typeof data.intentName !== 'string') {
      errors.push('intentName is required for intent interactions');
    } else if (data.intentName === 'Unknown') {
      warnings.push('intentName was sanitized to Unknown');
    }
  } else if (data.interactionType === 'button_reply') {
    if (!data.buttonId || typeof data.buttonId !== 'string') {
      errors.push('buttonId is required for button_reply interactions');
    } else if (data.buttonId === '') {
      errors.push('buttonId became empty after sanitization');
    }
  }

  // Validate optional numeric fields
  if (data.messageId !== undefined && (typeof data.messageId !== 'number' || isNaN(data.messageId))) {
    warnings.push('messageId should be a valid number');
  }

  if (data.accountId !== undefined && (typeof data.accountId !== 'number' || isNaN(data.accountId))) {
    warnings.push('accountId should be a valid number');
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Creates sanitized job data for resposta-rapida queue from webhook payload
 * Combines extraction, sanitization, and validation in one step
 */
export function createSanitizedRespostaRapidaJob(
  payload: any,
  correlationId: string
): {
  jobData: any;
  validation: { isValid: boolean; errors: string[]; warnings: string[] };
} {
  try {
    console.log(`[Webhook Utils] [${correlationId}] Creating sanitized job data...`);
    
    // Extract flash intent data from payload
    const flashIntentData = extractFlashIntentData(payload, correlationId);
    
    console.log(`[Webhook Utils] [${correlationId}] Flash intent data extracted:`, {
      type: flashIntentData.type,
      intentName: flashIntentData.intentName,
      buttonId: flashIntentData.buttonId,
      recipientPhone: flashIntentData.recipientPhone ? `${flashIntentData.recipientPhone.substring(0, 4)}****${flashIntentData.recipientPhone.substring(flashIntentData.recipientPhone.length - 4)}` : 'N/A',
      hasWhatsappApiKey: !!flashIntentData.whatsappApiKey,
      whatsappApiKeyLength: flashIntentData.whatsappApiKey?.length || 0,
      inboxId: flashIntentData.inboxId,
      wamid: flashIntentData.wamid,
    });
    
    // Create job data structure
    const rawJobData = {
      inboxId: flashIntentData.inboxId,
      contactPhone: flashIntentData.recipientPhone,
      interactionType: flashIntentData.type === 'button_click' ? 'button_reply' as const : 'intent' as const,
      buttonId: flashIntentData.buttonId,
      intentName: flashIntentData.intentName,
      wamid: flashIntentData.wamid,
      credentials: {
        token: flashIntentData.whatsappApiKey,
        phoneNumberId: flashIntentData.phoneNumberId,
        businessId: flashIntentData.businessId,
      },
      correlationId: correlationId,
      messageId: flashIntentData.messageId,
      accountId: flashIntentData.accountId,
      accountName: flashIntentData.accountName,
      contactSource: flashIntentData.contactSource,
    };

    console.log(`[Webhook Utils] [${correlationId}] Raw job data created:`, {
      interactionType: rawJobData.interactionType,
      hasIntentName: !!rawJobData.intentName,
      hasButtonId: !!rawJobData.buttonId,
      hasCredentialsToken: !!rawJobData.credentials.token,
      credentialsTokenLength: rawJobData.credentials.token?.length || 0,
    });

    // Sanitize the job data
    const sanitizedJobData = sanitizeRespostaRapidaJobData(rawJobData);
    
    console.log(`[Webhook Utils] [${correlationId}] Job data sanitized:`, {
      interactionType: sanitizedJobData.interactionType,
      hasIntentName: !!sanitizedJobData.intentName,
      hasButtonId: !!sanitizedJobData.buttonId,
      hasCredentialsToken: !!sanitizedJobData.credentials.token,
      credentialsTokenLength: sanitizedJobData.credentials.token?.length || 0,
      contactPhoneLength: sanitizedJobData.contactPhone?.length || 0,
    });
    
    // Validate the sanitized data
    const validation = validateRespostaRapidaJobData(sanitizedJobData);
    
    console.log(`[Webhook Utils] [${correlationId}] Job data validation:`, {
      isValid: validation.isValid,
      errorsCount: validation.errors.length,
      warningsCount: validation.warnings.length,
      errors: validation.errors,
      warnings: validation.warnings,
    });
    
    return {
      jobData: sanitizedJobData,
      validation,
    };
  } catch (error) {
    console.error(`[Webhook Utils] [${correlationId}] Error creating sanitized job data:`, error);
    return {
      jobData: null,
      validation: {
        isValid: false,
        errors: [`Failed to create job data: ${error instanceof Error ? error.message : 'Unknown error'}`],
        warnings: [],
      },
    };
  }
}

/**
 * Extracts user identification data from webhook payload
 */
export function extractUserIdentification(payload: any): {
  userId: string;
  contactId?: number;
  contactPhone: string;
  contactName?: string;
  contactEmail?: string;
  conversationId?: number;
  accountId?: number;
  accountName?: string;
} {
  const chatwootPayload = payload.originalDetectIntentRequest?.payload;
  const contactPhone = extractContactPhone(payload);
  
  // Priorizar contact_id se disponível, senão usar phone
  const userId = chatwootPayload?.contact_id ? 
    `contact_${chatwootPayload.contact_id}` : 
    contactPhone || `unknown_${Date.now()}`;
  
  return {
    userId,
    contactId: chatwootPayload?.contact_id,
    contactPhone,
    contactName: chatwootPayload?.contact_name,
    contactEmail: chatwootPayload?.contact_email,
    conversationId: chatwootPayload?.conversation_id,
    accountId: chatwootPayload?.account_id,
    accountName: chatwootPayload?.account_name,
  };
}

/**
 * Extracts conversation context from webhook payload
 */
export function extractConversationContext(payload: any): {
  conversationId: number | string;
  conversationStatus?: string;
  conversationAssigneeId?: number;
  conversationCreatedAt?: string;
  conversationUpdatedAt?: string;
  inboxId: string;
  inboxName?: string;
} {
  const chatwootPayload = payload.originalDetectIntentRequest?.payload;
  const webhookData = extractWebhookData(payload);
  
  return {
    conversationId: chatwootPayload?.conversation_id || webhookData.conversationId || 'unknown',
    conversationStatus: chatwootPayload?.conversation_status,
    conversationAssigneeId: chatwootPayload?.conversation_assignee_id,
    conversationCreatedAt: chatwootPayload?.conversation_created_at,
    conversationUpdatedAt: chatwootPayload?.conversation_updated_at,
    inboxId: webhookData.inboxId,
    inboxName: chatwootPayload?.inbox_name,
  };
}

/**
 * Logs detailed webhook payload information for debugging
 */
export function logDetailedWebhookPayload(
  correlationId: string,
  payload: any,
  stage: 'raw' | 'sanitized' | 'processed'
): void {
  const userIdentification = extractUserIdentification(payload);
  const conversationContext = extractConversationContext(payload);
  const dialogflowRequest = parseDialogflowRequest(payload);
  
  const logData = {
    correlationId,
    timestamp: new Date().toISOString(),
    stage,
    payloadSize: JSON.stringify(payload).length,
    userIdentification: {
      userId: userIdentification.userId,
      contactId: userIdentification.contactId,
      contactPhone: userIdentification.contactPhone ? 
        `${userIdentification.contactPhone.substring(0, 4)}****${userIdentification.contactPhone.substring(userIdentification.contactPhone.length - 4)}` : 
        'N/A',
      contactName: userIdentification.contactName,
      accountId: userIdentification.accountId,
      accountName: userIdentification.accountName,
    },
    conversationContext: {
      conversationId: conversationContext.conversationId,
      conversationStatus: conversationContext.conversationStatus,
      inboxId: conversationContext.inboxId,
      inboxName: conversationContext.inboxName,
    },
    requestType: {
      type: dialogflowRequest.type,
      intentName: dialogflowRequest.intentName,
      buttonId: dialogflowRequest.buttonId,
      buttonText: dialogflowRequest.buttonText,
    },
    channelInfo: detectChannelType(payload),
  };

  console.log(`[MTF Diamante Webhook] [${correlationId}] Detailed payload info (${stage}):`, logData);
}

/**
 * Creates a summary of sanitization changes made to the payload
 */
export function createSanitizationSummary(
  originalPayload: any,
  sanitizedPayload: any
): {
  fieldsModified: string[];
  fieldsRemoved: string[];
  sizeChange: {
    original: number;
    sanitized: number;
    reduction: number;
    reductionPercent: string;
  };
} {
  const originalSize = JSON.stringify(originalPayload).length;
  const sanitizedSize = JSON.stringify(sanitizedPayload).length;
  
  // Esta é uma implementação básica - pode ser expandida para detectar mudanças específicas
  const fieldsModified: string[] = [];
  const fieldsRemoved: string[] = [];
  
  // Comparar campos específicos que sabemos que são sanitizados
  const chatwootOriginal = originalPayload.originalDetectIntentRequest?.payload;
  const chatwootSanitized = sanitizedPayload.originalDetectIntentRequest?.payload;
  
  if (chatwootOriginal && chatwootSanitized) {
    // Verificar se phone foi modificado
    if (chatwootOriginal.from !== chatwootSanitized.from) {
      fieldsModified.push('originalDetectIntentRequest.payload.from');
    }
    
    // Verificar se text foi modificado
    if (chatwootOriginal.text !== chatwootSanitized.text) {
      fieldsModified.push('originalDetectIntentRequest.payload.text');
    }
    
    // Verificar se button_id foi modificado
    if (chatwootOriginal.button_id !== chatwootSanitized.button_id) {
      fieldsModified.push('originalDetectIntentRequest.payload.button_id');
    }
  }
  
  return {
    fieldsModified,
    fieldsRemoved,
    sizeChange: {
      original: originalSize,
      sanitized: sanitizedSize,
      reduction: originalSize - sanitizedSize,
      reductionPercent: ((originalSize - sanitizedSize) / originalSize * 100).toFixed(2) + '%',
    },
  };
}

/**
 * Analyzes and logs original Dialogflow request patterns for debugging
 * This function helps identify different payload structures and patterns
 */
export function analyzeOriginalDialogflowRequest(
  payload: any,
  correlationId: string
): {
  payloadType: 'intent' | 'button_click' | 'unknown';
  channelType: string;
  hasRequiredFields: boolean;
  patternAnalysis: any;
} {
  const chatwootPayload = payload.originalDetectIntentRequest?.payload;
  
  // Determine interaction type
  const isButtonInteraction = chatwootPayload?.interaction_type === "button_reply" || 
                             chatwootPayload?.interactive?.type === "button_reply" || 
                             chatwootPayload?.interactive?.type === "list_reply";
  
  const payloadType = isButtonInteraction ? 'button_click' : 
                     payload.queryResult?.intent?.displayName ? 'intent' : 'unknown';
  
  // Extract channel type
  const channelType = chatwootPayload?.channel_type || 'unknown';
  
  // Check for required fields
  const hasRequiredFields = !!(
    payload.responseId &&
    payload.queryResult &&
    payload.originalDetectIntentRequest &&
    chatwootPayload?.whatsapp_api_key &&
    chatwootPayload?.contact_phone
  );
  
  // Pattern analysis
  const patternAnalysis = {
    structure: {
      hasResponseId: !!payload.responseId,
      hasQueryResult: !!payload.queryResult,
      hasOriginalDetectIntentRequest: !!payload.originalDetectIntentRequest,
      hasSession: !!payload.session,
    },
    queryResult: {
      hasQueryText: !!payload.queryResult?.queryText,
      hasParameters: !!payload.queryResult?.parameters,
      hasIntent: !!payload.queryResult?.intent,
      intentName: payload.queryResult?.intent?.displayName,
      confidence: payload.queryResult?.intentDetectionConfidence,
      languageCode: payload.queryResult?.languageCode,
      outputContextsCount: payload.queryResult?.outputContexts?.length || 0,
    },
    chatwootPayload: chatwootPayload ? {
      // Core identifiers
      hasInboxId: !!chatwootPayload.inbox_id,
      hasConversationId: !!chatwootPayload.conversation_id,
      hasMessageId: !!chatwootPayload.message_id,
      hasContactId: !!chatwootPayload.contact_id,
      hasAccountId: !!chatwootPayload.account_id,
      
      // Contact information
      hasContactPhone: !!chatwootPayload.contact_phone,
      hasContactName: !!chatwootPayload.contact_name,
      hasContactEmail: !!chatwootPayload.contact_email,
      contactSource: chatwootPayload.contact_source,
      
      // WhatsApp specific
      hasWamid: !!chatwootPayload.wamid,
      hasPhoneNumberId: !!chatwootPayload.phone_number_id,
      hasBusinessId: !!chatwootPayload.business_id,
      hasWhatsappApiKey: !!chatwootPayload.whatsapp_api_key,
      whatsappApiKeyLength: chatwootPayload.whatsapp_api_key?.length || 0,
      
      // Message details
      messageType: chatwootPayload.message_type,
      messageContentType: chatwootPayload.message_content_type,
      hasMessageContent: !!chatwootPayload.message_content,
      
      // Interaction details
      interactionType: chatwootPayload.interaction_type,
      hasButtonId: !!chatwootPayload.button_id,
      hasButtonTitle: !!chatwootPayload.button_title,
      hasListId: !!chatwootPayload.list_id,
      hasInteractive: !!chatwootPayload.interactive,
      interactiveType: chatwootPayload.interactive?.type,
      
      // Conversation details
      conversationStatus: chatwootPayload.conversation_status,
      hasConversationAssignee: !!chatwootPayload.conversation_assignee_id,
      
      // Flags and metadata
      isWhatsappChannel: chatwootPayload.is_whatsapp_channel,
      socialwiseActive: chatwootPayload.socialwise_active,
      payloadVersion: chatwootPayload.payload_version,
      
      // All available keys for pattern analysis
      allPayloadKeys: Object.keys(chatwootPayload).sort(),
      payloadKeyCount: Object.keys(chatwootPayload).length,
    } : null,
    
    // Size analysis
    payloadSize: JSON.stringify(payload).length,
    chatwootPayloadSize: chatwootPayload ? JSON.stringify(chatwootPayload).length : 0,
    
    // Potential issues
    potentialIssues: [],
  };
  
  // Identify potential issues
  if (!hasRequiredFields) {
    patternAnalysis.potentialIssues.push('Missing required fields');
  }
  
  if (payloadType === 'unknown') {
    patternAnalysis.potentialIssues.push('Unknown interaction type');
  }
  
  if (channelType === 'unknown') {
    patternAnalysis.potentialIssues.push('Unknown channel type');
  }
  
  if (patternAnalysis.payloadSize > 100000) { // 100KB
    patternAnalysis.potentialIssues.push('Large payload size');
  }
  
  if (chatwootPayload && patternAnalysis.chatwootPayload?.whatsappApiKeyLength < 10) {
    patternAnalysis.potentialIssues.push('Short WhatsApp API key');
  }
  
  return {
    payloadType,
    channelType,
    hasRequiredFields,
    patternAnalysis,
  };
}

/**
 * Logs comprehensive original request analysis for pattern identification
 */
export function logOriginalRequestAnalysis(
  payload: any,
  correlationId: string,
  requestHeaders?: Record<string, string | null>
): void {
  const analysis = analyzeOriginalDialogflowRequest(payload, correlationId);
  
  console.log(`[OriginalRequestDialogflow] [${correlationId}] COMPREHENSIVE PATTERN ANALYSIS:`, {
    correlationId,
    timestamp: new Date().toISOString(),
    analysis,
    requestHeaders,
    rawPayloadPreview: {
      responseId: payload.responseId,
      sessionPath: payload.session,
      intentName: payload.queryResult?.intent?.displayName,
      queryText: payload.queryResult?.queryText,
      channelType: payload.originalDetectIntentRequest?.payload?.channel_type,
      interactionType: payload.originalDetectIntentRequest?.payload?.interaction_type,
    }
  });
}

/**
 * Extrai dados necessários para a Flash Intent do payload do webhook
 */
export function extractFlashIntentData(req: any, correlationId: string): {
  type: "intent" | "button_click";
  intentName?: string;
  buttonId?: string;
  recipientPhone: string;
  whatsappApiKey: string;
  phoneNumberId: string;
  businessId: string;
  inboxId: string;
  wamid: string;
  messageId?: number;
  accountId?: number;
  accountName?: string;
  contactSource?: string;
  userId: string;
  contactId?: number;
  conversationId?: number;
  correlationId: string;
  originalPayload: any;
} {
  const webhookData = extractWebhookData(req);
  const chatwootPayload = req.originalDetectIntentRequest?.payload;
  const userIdentification = extractUserIdentification(req);
  
  // Detectar se é button click ou intent
  const isButtonClick = chatwootPayload?.interaction_type === "button_reply" || 
                       chatwootPayload?.interactive?.type === "button_reply" || 
                       chatwootPayload?.interactive?.type === "list_reply";
  
  return {
    type: isButtonClick ? "button_click" : "intent",
    intentName: webhookData.intentName,
    buttonId: chatwootPayload?.button_id || chatwootPayload?.interactive?.button_reply?.id || chatwootPayload?.interactive?.list_reply?.id,
    recipientPhone: webhookData.contactPhone,
    whatsappApiKey: webhookData.whatsappApiKey,
    phoneNumberId: chatwootPayload?.phone_number_id || "unknown",
    businessId: chatwootPayload?.business_id || "unknown",
    inboxId: webhookData.inboxId,
    wamid: chatwootPayload?.wamid || chatwootPayload?.id || "unknown",
    messageId: chatwootPayload?.message_id,
    accountId: chatwootPayload?.account_id,
    accountName: chatwootPayload?.account_name,
    contactSource: chatwootPayload?.contact_source || "whatsapp",
    userId: userIdentification.userId,
    contactId: userIdentification.contactId,
    conversationId: userIdentification.conversationId,
    correlationId,
    originalPayload: req,
  };
}

/**
 * Processa webhook com Flash Intent usando a arquitetura correta
 */
export async function processWebhookWithFlashIntentFromUtils(
  req: any,
  correlationId: string,
  startTime: number,
  payloadSize: number
): Promise<Response> {
  try {
    // Importar dinamicamente para evitar dependências circulares
    const { processWebhookWithFlashIntent } = await import('@/lib/resposta-rapida/webhook-integration');
    const { recordWebhookMetrics } = await import('@/lib/monitoring/application-performance-monitor');
    
    // Extrair dados para Flash Intent
    const flashIntentData = extractFlashIntentData(req, correlationId);
    
    console.log(`[MTF Diamante Dispatcher] [${correlationId}] Processando com Flash Intent`, {
      type: flashIntentData.type,
      intentName: flashIntentData.intentName,
      buttonId: flashIntentData.buttonId,
      recipientPhone: flashIntentData.recipientPhone,
    });

    // Processar com Flash Intent
    const flashResult = await processWebhookWithFlashIntent(flashIntentData);
    
    console.log(`[MTF Diamante Dispatcher] [${correlationId}] Flash Intent processado`, {
      success: flashResult.success,
      processingMode: flashResult.processingMode,
      queueUsed: flashResult.queueUsed,
    });

    // Retornar resposta rápida
    const responseTime = performance.now() - startTime;
    
    // Record webhook metrics
    recordWebhookMetrics({
      responseTime,
      timestamp: new Date(),
      correlationId,
      success: flashResult.success,
      payloadSize,
      interactionType: flashIntentData.type === "button_click" ? "button_reply" : "intent",
    });

    return new Response(JSON.stringify({ 
      correlationId,
      processingMode: flashResult.processingMode,
      queueUsed: flashResult.queueUsed,
      responseTime: `${responseTime}ms`,
      message: flashResult.message,
    }), {
      status: 202,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'X-Correlation-ID': correlationId,
        'X-Processing-Mode': flashResult.processingMode,
        'X-Queue-Used': flashResult.queueUsed,
        'X-Response-Time': responseTime.toString(),
      },
    });

  } catch (flashIntentError) {
    console.error(`[MTF Diamante Dispatcher] [${correlationId}] Erro na Flash Intent, usando fallback:`, flashIntentError);
    
    // Fallback para processamento legacy
    return await processLegacyWebhookFallback(req, correlationId, startTime, payloadSize);
  }
}

/**
 * Sanitizes phone number to contain only digits
 */
export function sanitizePhoneNumber(phone: string | number): string {
  if (typeof phone === 'number') {
    return String(phone);
  }
  
  if (typeof phone !== 'string') {
    return '';
  }
  
  // Remove all non-digit characters
  const cleaned = phone.replace(/\D/g, '');
  
  // Validate phone number length (10-15 digits is typical for international numbers)
  if (cleaned.length < 10 || cleaned.length > 15) {
    console.warn(`[Webhook Utils] Invalid phone number length: ${cleaned.length} digits`);
  }
  
  return cleaned;
}

/**
 * Sanitizes email address
 */
export function sanitizeEmail(email: string): string {
  if (typeof email !== 'string') {
    return '';
  }
  
  const cleaned = email.trim().toLowerCase();
  
  // Basic email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(cleaned)) {
    console.warn(`[Webhook Utils] Invalid email format: ${email}`);
    return '';
  }
  
  return cleaned;
}

/**
 * Sanitizes WhatsApp API key
 */
export function sanitizeApiKey(apiKey: string): string {
  if (typeof apiKey !== 'string') {
    console.warn(`[Webhook Utils] API key is not a string: ${typeof apiKey}`);
    return '';
  }
  
  const cleaned = apiKey.trim();
  
  // Validate minimum length for API key
  if (cleaned.length < 10) {
    console.warn(`[Webhook Utils] API key too short: ${cleaned.length} characters`);
    return '';
  }
  
  // Validate maximum length for API key (Facebook tokens are usually < 500 chars)
  if (cleaned.length > 500) {
    console.warn(`[Webhook Utils] API key too long: ${cleaned.length} characters`);
    return cleaned.substring(0, 500);
  }
  
  // Log successful sanitization for debugging
  console.log(`[Webhook Utils] API key sanitized successfully: ${cleaned.length} characters`);
  
  return cleaned;
}

/**
 * Sanitizes text content by removing potentially dangerous characters
 */
export function sanitizeTextContent(text: string): string {
  if (typeof text !== 'string') {
    return '';
  }
  
  // Remove potentially dangerous characters but keep basic punctuation
  return text
    .trim()
    .replace(/[<>]/g, '') // Remove HTML-like brackets
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .replace(/on\w+\s*=/gi, '') // Remove event handlers
    .substring(0, 4096); // Limit length to prevent abuse
}

/**
 * Sanitizes button ID to ensure it's safe for database storage
 */
export function sanitizeButtonId(buttonId: string): string {
  if (typeof buttonId !== 'string') {
    return '';
  }
  
  // Allow alphanumeric, underscore, hyphen, and dot
  return buttonId
    .trim()
    .replace(/[^a-zA-Z0-9_.-]/g, '')
    .substring(0, 255); // Limit length
}

/**
 * Sanitizes intent name to ensure it's safe
 */
export function sanitizeIntentName(intentName: string): string {
  if (typeof intentName !== 'string') {
    return 'Unknown';
  }
  
  // Allow alphanumeric, underscore, hyphen, dot, and space
  return intentName
    .trim()
    .replace(/[^a-zA-Z0-9_.\- ]/g, '')
    .substring(0, 255); // Limit length
}

/**
 * Comprehensive sanitization for webhook payload
 * Applies specific sanitization rules based on field types
 */
export function sanitizeWebhookPayloadComprehensive(payload: any): any {
  if (!payload || typeof payload !== 'object') {
    return payload;
  }

  const sanitized = { ...payload };

  // Sanitize specific fields if they exist
  if (sanitized.originalDetectIntentRequest?.payload) {
    const chatwootPayload = sanitized.originalDetectIntentRequest.payload;
    
    // Sanitize phone numbers
    if (chatwootPayload.from) {
      chatwootPayload.from = sanitizePhoneNumber(chatwootPayload.from);
    }
    if (chatwootPayload.phone) {
      chatwootPayload.phone = sanitizePhoneNumber(chatwootPayload.phone);
    }
    
    // Sanitize API keys
    if (chatwootPayload.whatsapp_api_key) {
      chatwootPayload.whatsapp_api_key = sanitizeApiKey(chatwootPayload.whatsapp_api_key);
    }
    if (chatwootPayload.access_token) {
      chatwootPayload.access_token = sanitizeApiKey(chatwootPayload.access_token);
    }
    
    // Sanitize text content
    if (chatwootPayload.text) {
      chatwootPayload.text = sanitizeTextContent(chatwootPayload.text);
    }
    if (chatwootPayload.message?.text) {
      chatwootPayload.message.text = sanitizeTextContent(chatwootPayload.message.text);
    }
    
    // Sanitize button ID - only if not empty
    if (chatwootPayload.button_id && chatwootPayload.button_id.trim() !== '') {
      chatwootPayload.button_id = sanitizeButtonId(chatwootPayload.button_id);
    }
    if (chatwootPayload.interactive?.button_reply?.id && chatwootPayload.interactive.button_reply.id.trim() !== '') {
      chatwootPayload.interactive.button_reply.id = sanitizeButtonId(chatwootPayload.interactive.button_reply.id);
    }
    if (chatwootPayload.interactive?.list_reply?.id && chatwootPayload.interactive.list_reply.id.trim() !== '') {
      chatwootPayload.interactive.list_reply.id = sanitizeButtonId(chatwootPayload.interactive.list_reply.id);
    }
    
    // Sanitize interaction_type - only if not empty
    if (chatwootPayload.interaction_type && chatwootPayload.interaction_type.trim() !== '') {
      chatwootPayload.interaction_type = sanitizeTextContent(chatwootPayload.interaction_type);
    }
    
    // Sanitize contact_phone field specifically
    if (chatwootPayload.contact_phone) {
      chatwootPayload.contact_phone = sanitizePhoneNumber(chatwootPayload.contact_phone);
    }
    
    // Sanitize account name
    if (chatwootPayload.account_name) {
      chatwootPayload.account_name = sanitizeTextContent(chatwootPayload.account_name);
    }
    
    // Sanitize contact source
    if (chatwootPayload.contact_source) {
      chatwootPayload.contact_source = sanitizeTextContent(chatwootPayload.contact_source);
    }
  }
  
  // Sanitize query result
  if (sanitized.queryResult) {
    // Sanitize intent name
    if (sanitized.queryResult.intent?.displayName) {
      sanitized.queryResult.intent.displayName = sanitizeIntentName(sanitized.queryResult.intent.displayName);
    }
    
    // Sanitize query text
    if (sanitized.queryResult.queryText) {
      sanitized.queryResult.queryText = sanitizeTextContent(sanitized.queryResult.queryText);
    }
    
    // Sanitize parameters
    if (sanitized.queryResult.parameters) {
      const params = sanitized.queryResult.parameters;
      
      // Sanitize common parameter types
      Object.keys(params).forEach(key => {
        const value = params[key];
        
        if (typeof value === 'string') {
          if (key.toLowerCase().includes('phone')) {
            params[key] = sanitizePhoneNumber(value);
          } else if (key.toLowerCase().includes('email')) {
            params[key] = sanitizeEmail(value);
          } else {
            params[key] = sanitizeTextContent(value);
          }
        }
      });
    }
  }
  
  return sanitized;
}

/**
 * Validates if a sanitized webhook payload is safe to process
 */
export function validateSanitizedWebhookPayload(payload: any): {
  isValid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!payload || typeof payload !== 'object') {
    errors.push('Payload is not a valid object');
    return { isValid: false, errors, warnings };
  }

  // Check for required structure
  if (!payload.originalDetectIntentRequest) {
    errors.push('Missing originalDetectIntentRequest');
  }

  if (!payload.queryResult) {
    errors.push('Missing queryResult');
  }

  // Validate API key if present
  const chatwootPayload = payload.originalDetectIntentRequest?.payload;
  if (chatwootPayload) {
    const apiKey = chatwootPayload.whatsapp_api_key || chatwootPayload.access_token;
    if (apiKey && apiKey.length < 10) {
      warnings.push('API key appears to be too short after sanitization');
    }

    // Validate phone number if present
    const phone = chatwootPayload.from || chatwootPayload.phone;
    if (phone && (phone.length < 10 || phone.length > 15)) {
      warnings.push('Phone number length is outside normal range after sanitization');
    }

    // Check for empty critical fields after sanitization
    if (chatwootPayload.button_id === '') {
      warnings.push('Button ID became empty after sanitization');
    }
  }

  // Validate intent name if present
  const intentName = payload.queryResult?.intent?.displayName;
  if (intentName && intentName === 'Unknown') {
    warnings.push('Intent name was sanitized to Unknown');
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Processa webhook usando o sistema legacy como fallback
 */
export async function processLegacyWebhookFallback(
  req: any,
  correlationId: string,
  startTime: number,
  payloadSize: number
): Promise<Response> {
  try {
    const { recordWebhookMetrics } = await import('@/lib/monitoring/application-performance-monitor');
    
    // Sanitizar payload antes do processamento
    const sanitizedReq = sanitizeWebhookPayloadComprehensive(req);
    
    const webhookData = extractWebhookData(sanitizedReq);
    logWebhookData(webhookData, sanitizedReq);
    
    // Processar usando as funções da própria lib
    const dialogflowRequest = parseDialogflowRequest(sanitizedReq);
    
    console.log(`[MTF Diamante Dispatcher] [${correlationId}] Processamento legacy fallback`, {
      type: dialogflowRequest.type,
      intentName: dialogflowRequest.intentName,
      buttonId: dialogflowRequest.buttonId,
    });
    
    const responseTime = performance.now() - startTime;
    
    recordWebhookMetrics({
      responseTime,
      timestamp: new Date(),
      correlationId,
      success: true,
      payloadSize,
      interactionType: dialogflowRequest.type === 'button_click' ? 'button_reply' : 'intent',
    });
    
    return new Response(JSON.stringify({ 
      correlationId,
      processingMode: "legacy_fallback",
      responseTime: `${responseTime}ms`,
      requestType: dialogflowRequest.type,
    }), {
      status: 202,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'X-Correlation-ID': correlationId,
        'X-Processing-Mode': 'legacy_fallback',
      },
    });
    
  } catch (error) {
    console.error(`[MTF Diamante Dispatcher] [${correlationId}] Erro no fallback legacy:`, error);
    
    const responseTime = performance.now() - startTime;
    
    return new Response(JSON.stringify({ 
      correlationId,
      error: 'Processing failed',
      responseTime: `${responseTime}ms`,
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'X-Correlation-ID': correlationId,
      },
    });
  }
}