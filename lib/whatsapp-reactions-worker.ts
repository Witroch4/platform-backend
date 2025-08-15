/**
 * WhatsApp Reactions Service - Worker Version
 * Handles sending emoji reactions to WhatsApp messages
 * This version is designed for use in Node.js workers without Next.js dependencies
 */

import axios from 'axios';
import { whatsappWithCost } from './cost/whatsapp-wrapper';

export interface ReactionMessageData {
  recipientPhone: string;
  messageId: string; // WhatsApp message ID (wamid) to react to
  emoji: string;
  whatsappApiKey: string; // Required for worker context
  phoneNumberId?: string; // Add phoneNumberId to reaction data
}

export interface ReactionResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Send a reaction message to a WhatsApp message
 * Worker-safe version that doesn't depend on Next.js or NextAuth
 */
export async function sendReactionMessage(data: ReactionMessageData): Promise<ReactionResult> {
  try {
    console.log('[WhatsApp Reactions Worker] Enviando reação:', {
      recipientPhone: data.recipientPhone,
      messageId: data.messageId,
      emoji: data.emoji
    });

    // Format phone number to E.164
    const formattedPhone = formatPhoneForWhatsApp(data.recipientPhone);
    if (!formattedPhone) {
      throw new Error('Número de telefone inválido');
    }

    // Use phoneNumberId from data or fallback to environment variable
    const phoneNumberId = data.phoneNumberId || process.env.FROM_PHONE_NUMBER_ID;
    if (!phoneNumberId) {
      throw new Error('Phone Number ID is required but not provided');
    }

    // Build API URL
    const apiUrl = `https://graph.facebook.com/v22.0/${phoneNumberId}/messages`;

    // Prepare reaction payload
    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: formattedPhone,
      type: 'reaction',
      reaction: {
        message_id: data.messageId,
        emoji: data.emoji
      }
    };

    console.log('[WhatsApp Reactions Worker] Payload da reação:', JSON.stringify(payload, null, 2));

    // Send reaction via WhatsApp API with cost tracking
    const sendFunction = async (templateName: string, to: string) => {
      const response = await axios.post(apiUrl, payload, {
        headers: {
          'Authorization': `Bearer ${data.whatsappApiKey}`,
          'Content-Type': 'application/json'
        }
      });
      return {
        messageId: response.data.messages?.[0]?.id || `reaction-${Date.now()}`,
        status: response.status === 200 ? 'sent' : 'failed'
      };
    };

    const result = await whatsappWithCost(sendFunction, {
      templateName: 'reaction_message',
      to: data.recipientPhone,
      meta: {
        traceId: `whatsapp-reaction-worker-${Date.now()}`,
        intent: 'reaction_send'
      }
    });

    const response = { data: { messages: [{ id: result.messageId }] } };

    console.log('[WhatsApp Reactions Worker] Reação enviada com sucesso:', response.data);

    return {
      success: true,
      messageId: response.data.messages?.[0]?.id
    };

  } catch (error: any) {
    console.error('[WhatsApp Reactions Worker] Erro ao enviar reação:', error.response?.data || error.message);
    
    return {
      success: false,
      error: error.response?.data?.error?.message || error.message
    };
  }
}

/**
 * Format phone number for WhatsApp API (E.164 format)
 */
function formatPhoneForWhatsApp(phone: string): string | null {
  if (!phone) return null;
  
  // Remove all non-numeric characters
  const cleanPhone = phone.replace(/\D/g, '');
  
  if (!cleanPhone) return null;
  
  // Add country code if not present (assuming Brazil +55)
  if (cleanPhone.startsWith('55')) {
    return cleanPhone;
  } else if (cleanPhone.length >= 10) {
    return `55${cleanPhone}`;
  }
  
  return null;
}

/**
 * Store reaction attempt for tracking/debugging
 * Worker-safe version that only logs to console
 */
export async function logReactionAttempt(data: {
  recipientPhone: string;
  messageId: string;
  emoji: string;
  buttonId: string;
  success: boolean;
  error?: string;
}): Promise<void> {
  try {
    // For workers, just log to console
    // Database logging should be handled by the main application
    console.log('[WhatsApp Reactions Worker] Tentativa de reação registrada:', {
      timestamp: new Date().toISOString(),
      recipientPhone: data.recipientPhone,
      messageId: data.messageId,
      emoji: data.emoji,
      buttonId: data.buttonId,
      success: data.success,
      error: data.error
    });
  } catch (error) {
    console.error('[WhatsApp Reactions Worker] Erro ao registrar tentativa de reação:', error);
  }
}