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
 * Extracts WhatsApp API key and message information from Dialogflow payload
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

  // Extract conversation ID
  const conversationId = payload.originalDetectIntentRequest?.payload?.conversation_id ||
                        payload.originalDetectIntentRequest?.payload?.from ||
                        payload.session?.split('/').pop() ||
                        '';

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
 */
export function validateWebhookData(data: ExtractedWebhookData): boolean {
  return !!(
    data.messageId &&
    data.contactPhone &&
    data.intentName
  );
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