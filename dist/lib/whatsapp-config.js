"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getWhatsAppConfig = getWhatsAppConfig;
exports.getAllWhatsAppConfigs = getAllWhatsAppConfigs;
exports.isConfigActive = isConfigActive;
exports.validateWhatsAppConfig = validateWhatsAppConfig;
const db_1 = require("../lib/db");
/**
 * Busca configuração do WhatsApp para uma caixa de entrada específica
 * Se não encontrar configuração específica, retorna a configuração padrão
 */
async function getWhatsAppConfig(usuarioChatwitId, caixaEntradaId) {
    try {
        let config = null;
        // Se foi especificada uma caixa de entrada, buscar configuração específica
        if (caixaEntradaId) {
            config = await db_1.db.whatsAppConfig.findFirst({
                where: {
                    caixaEntradaId,
                    usuarioChatwitId,
                    isActive: true
                }
            });
        }
        // Se não encontrou configuração específica, buscar a padrão
        if (!config) {
            config = await db_1.db.whatsAppConfig.findFirst({
                where: {
                    usuarioChatwitId,
                    caixaEntradaId: null,
                    isActive: true
                }
            });
        }
        return config;
    }
    catch (error) {
        console.error("Erro ao buscar configuração do WhatsApp:", error);
        return null;
    }
}
/**
 * Busca todas as configurações do WhatsApp de um usuário
 */
async function getAllWhatsAppConfigs(usuarioChatwitId) {
    try {
        const configs = await db_1.db.whatsAppConfig.findMany({
            where: {
                usuarioChatwitId,
                isActive: true
            },
            include: {
                caixaEntrada: {
                    select: {
                        id: true,
                        nome: true,
                        inboxId: true,
                        inboxName: true,
                        channelType: true
                    }
                }
            },
            orderBy: [
                { caixaEntradaId: 'asc' }, // Configurações específicas primeiro
                { createdAt: 'desc' }
            ]
        });
        return configs;
    }
    catch (error) {
        console.error("Erro ao buscar configurações do WhatsApp:", error);
        return [];
    }
}
/**
 * Verifica se uma configuração está ativa
 */
function isConfigActive(config) {
    return config && config.isActive &&
        config.whatsappToken &&
        config.whatsappBusinessAccountId;
}
/**
 * Valida uma configuração do WhatsApp
 */
function validateWhatsAppConfig(config) {
    const errors = [];
    if (!config.whatsappToken) {
        errors.push("Token do WhatsApp é obrigatório");
    }
    if (!config.whatsappBusinessAccountId) {
        errors.push("ID da conta Business do WhatsApp é obrigatório");
    }
    if (!config.fbGraphApiBase) {
        errors.push("URL base da API do Facebook é obrigatória");
    }
    return {
        isValid: errors.length === 0,
        errors
    };
}
