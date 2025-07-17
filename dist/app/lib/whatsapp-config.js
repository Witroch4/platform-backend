"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getWhatsAppConfig = getWhatsAppConfig;
exports.getWhatsAppApiUrl = getWhatsAppApiUrl;
exports.getWhatsAppTemplatesUrl = getWhatsAppTemplatesUrl;
exports.getApiVersion = getApiVersion;
const prisma_1 = __importDefault(require("../../lib/prisma"));
/**
 * Obtém as configurações ativas do WhatsApp para um usuário
 * Retorna as configurações do banco de dados ou utiliza os valores de fallback do .env
 */
async function getWhatsAppConfig(userId) {
    let config;
    // Se temos um userId, tentamos obter configuração personalizada do banco
    if (userId) {
        // Buscar o usuário Chatwit primeiro
        const usuarioChatwit = await prisma_1.default.usuarioChatwit.findUnique({
            where: { appUserId: userId }
        });
        if (usuarioChatwit) {
            config = await prisma_1.default.whatsAppConfig.findFirst({
                where: {
                    usuarioChatwitId: usuarioChatwit.id,
                    isActive: true
                },
                orderBy: {
                    updatedAt: 'desc'
                }
            });
        }
    }
    // Se não encontrarmos configuração no banco, usamos valores do .env
    if (!config) {
        return {
            whatsappToken: process.env.WHATSAPP_TOKEN || '',
            whatsappBusinessAccountId: process.env.WHATSAPP_BUSINESS_ID || '',
            phoneNumberId: process.env.FROM_PHONE_NUMBER_ID || '',
            fbGraphApiBase: 'https://graph.facebook.com/v22.0', // Forçar versão v22.0
            isFromEnv: true
        };
    }
    // Forçamos a versão v22.0 mesmo para configurações do banco
    return {
        whatsappToken: config.whatsappToken,
        whatsappBusinessAccountId: config.whatsappBusinessAccountId,
        phoneNumberId: process.env.FROM_PHONE_NUMBER_ID || '', // Usar phoneNumberId do .env pois o banco não armazena
        fbGraphApiBase: 'https://graph.facebook.com/v22.0', // Forçar versão v22.0
        isFromEnv: false
    };
}
/**
 * Monta a URL para a API do WhatsApp para envio de mensagens
 */
function getWhatsAppApiUrl(config) {
    // Usar phoneNumberId se disponível (correto segundo a documentação), caso contrário usar o WABA ID
    const id = config.phoneNumberId || config.whatsappBusinessAccountId;
    return `${config.fbGraphApiBase}/${id}/messages`;
}
/**
 * Monta a URL para a API do WhatsApp para templates
 */
function getWhatsAppTemplatesUrl(config) {
    return `${config.fbGraphApiBase}/${config.whatsappBusinessAccountId}/message_templates`;
}
/**
 * Obtém a versão da API do Facebook a partir da URL base
 */
function getApiVersion(fbGraphApiBase) {
    const version = fbGraphApiBase.split('/').pop();
    return version || 'v22.0';
}
