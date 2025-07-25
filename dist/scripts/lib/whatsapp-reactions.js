"use strict";
/**
 * WhatsApp Reactions Service
 * Handles sending emoji reactions to WhatsApp messages
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendReactionMessage = sendReactionMessage;
exports.logReactionAttempt = logReactionAttempt;
const axios_1 = __importDefault(require("axios"));
const lib_1 = require("../../app/lib");
const auth_1 = require("../../auth");
/**
 * Send a reaction message to a WhatsApp message
 */
async function sendReactionMessage(data) {
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
            const session = await (0, auth_1.auth)();
            if (session?.user?.id) {
                const fullConfig = await (0, lib_1.getWhatsAppConfig)(session.user.id);
                apiUrl = (0, lib_1.getWhatsAppApiUrl)(fullConfig);
            }
            else {
                throw new Error('Não foi possível obter configuração do WhatsApp');
            }
        }
        else {
            // Use standard configuration
            const session = await (0, auth_1.auth)();
            if (!session?.user?.id) {
                throw new Error('Usuário não autenticado');
            }
            config = await (0, lib_1.getWhatsAppConfig)(session.user.id);
            apiUrl = (0, lib_1.getWhatsAppApiUrl)(config);
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
        // Send reaction via WhatsApp API
        const response = await axios_1.default.post(apiUrl, payload, {
            headers: {
                'Authorization': `Bearer ${config.whatsappToken}`,
                'Content-Type': 'application/json'
            }
        });
        console.log('[WhatsApp Reactions] Reação enviada com sucesso:', response.data);
        return {
            success: true,
            messageId: response.data.messages?.[0]?.id
        };
    }
    catch (error) {
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
function formatPhoneForWhatsApp(phone) {
    if (!phone)
        return null;
    // Remove all non-numeric characters
    const cleanPhone = phone.replace(/\D/g, '');
    if (!cleanPhone)
        return null;
    // Add country code if not present (assuming Brazil +55)
    if (cleanPhone.startsWith('55')) {
        return cleanPhone;
    }
    else if (cleanPhone.length >= 10) {
        return `55${cleanPhone}`;
    }
    return null;
}
/**
 * Store reaction attempt for tracking/debugging
 */
async function logReactionAttempt(data) {
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
    }
    catch (error) {
        console.error('[WhatsApp Reactions] Erro ao registrar tentativa de reação:', error);
    }
}
