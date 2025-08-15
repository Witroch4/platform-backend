/**
 * WhatsApp Reactions Service
 * Handles sending emoji reactions to WhatsApp messages
 */

import axios from 'axios';
import { getWhatsAppConfig, getWhatsAppApiUrl } from '@/app/lib';
import { auth } from '@/auth';
import { getPrismaInstance } from '@/lib/connections';
import { whatsappWithCost } from './cost/whatsapp-wrapper';

export interface ReactionMessageData {
  recipientPhone: string;
  messageId: string; // WhatsApp message ID (wamid) to react to
  emoji: string;
  whatsappApiKey?: string; // Optional override for API key
}

export interface ReactionResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Send a reaction message to a WhatsApp message
 */
export async function sendReactionMessage(data: ReactionMessageData): Promise<ReactionResult> {
  try {
    console.log('[WhatsApp Reactions] Enviando reação:', {
      recipientPhone: data.recipientPhone,
      messageId: data.messageId,
      emoji: data.emoji
    });

    // Get WhatsApp configuration
    let config;
    let apiUrl;
    
    if (data.whatsappApiKey) {
      // Use provided API key (from webhook context)
      config = {
        whatsappToken: data.whatsappApiKey,
        fbGraphApiBase: 'https://graph.facebook.com/v22.0'
      };
      // We need to get the phone number ID from somewhere - for now use a default approach
      const session = await auth();
      if (session?.user?.id) {
        const fullConfig = await getWhatsAppConfig(session.user.id);
        apiUrl = getWhatsAppApiUrl(fullConfig);
      } else {
        throw new Error('Não foi possível obter configuração do WhatsApp');
      }
    } else {
      // Use standard configuration
      const session = await auth();
      if (!session?.user?.id) {
        throw new Error('Usuário não autenticado');
      }
      
      config = await getWhatsAppConfig(session.user.id);
      apiUrl = getWhatsAppApiUrl(config);
    }

    // Format phone number to E.164
    const formattedPhone = formatPhoneForWhatsApp(data.recipientPhone);
    if (!formattedPhone) {
      throw new Error('Número de telefone inválido');
    }

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

    console.log('[WhatsApp Reactions] Payload da reação:', JSON.stringify(payload, null, 2));

    // Send reaction via WhatsApp API with cost tracking
    const sendFunction = async (templateName: string, to: string) => {
      const response = await axios.post(apiUrl, payload, {
        headers: {
          'Authorization': `Bearer ${config.whatsappToken}`,
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
        traceId: `whatsapp-reaction-${Date.now()}`,
        intent: 'reaction_send'
      }
    });

    const response = { data: { messages: [{ id: result.messageId }] } };

    console.log('[WhatsApp Reactions] Reação enviada com sucesso:', response.data);

    return {
      success: true,
      messageId: response.data.messages?.[0]?.id
    };

  } catch (error: any) {
    console.error('[WhatsApp Reactions] Erro ao enviar reação:', error.response?.data || error.message);
    
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
    // For now, just log to console
    // In the future, this could be stored in a database table
    console.log('[WhatsApp Reactions] Tentativa de reação registrada:', {
      timestamp: new Date().toISOString(),
      recipientPhone: data.recipientPhone,
      messageId: data.messageId,
      emoji: data.emoji,
      buttonId: data.buttonId,
      success: data.success,
      error: data.error
    });
  } catch (error) {
    console.error('[WhatsApp Reactions] Erro ao registrar tentativa de reação:', error);
  }
}