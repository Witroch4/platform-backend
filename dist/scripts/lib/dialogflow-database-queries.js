"use strict";
/**
 * Database Query Functions for Dialogflow Async Response System
 * Provides helper functions to fetch all necessary data for self-contained tasks
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.findCompleteMessageMappingByIntent = findCompleteMessageMappingByIntent;
exports.findReactionByButtonId = findReactionByButtonId;
exports.getAllActiveButtonReactions = getAllActiveButtonReactions;
exports.testDatabaseConnection = testDatabaseConnection;
exports.closeDatabaseConnection = closeDatabaseConnection;
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
// ============================================================================
// INTENT MAPPING QUERIES
// ============================================================================
/**
 * Find complete message mapping by intent name and caixa ID
 * Returns all data needed for the worker to send messages without additional DB queries
 */
async function findCompleteMessageMappingByIntent(intentName, inboxId) {
    try {
        console.log(`[DB Query] Finding complete mapping for intent: ${intentName}, inboxId: ${inboxId} (type: ${typeof inboxId})`);
        // Garantir que inboxId seja string
        const inboxIdString = String(inboxId);
        console.log(`[DB Query] Converted inboxId to string: ${inboxIdString} (type: ${typeof inboxIdString})`);
        // PRIMEIRO: Buscar a CaixaEntrada pelo inboxId para obter o ID interno
        console.log(`[DB Query] Step 1: Finding CaixaEntrada by inboxId: ${inboxIdString}`);
        const caixaEntrada = await prisma.caixaEntrada.findFirst({
            where: {
                inboxId: inboxIdString,
            },
        });
        if (!caixaEntrada) {
            console.log(`[DB Query] No CaixaEntrada found for inboxId: ${inboxIdString}`);
            return null;
        }
        console.log(`[DB Query] Found CaixaEntrada: ${caixaEntrada.id} (nome: ${caixaEntrada.nome}) for inboxId: ${inboxIdString}`);
        // SEGUNDO: Buscar o mapeamento usando o ID interno da CaixaEntrada
        console.log(`[DB Query] Step 2: Finding mapping with parameters:`, {
            intentName,
            caixaEntradaId: caixaEntrada.id,
            whereClause: `intentName_caixaEntradaId: { intentName: "${intentName}", caixaEntradaId: "${caixaEntrada.id}" }`
        });
        // Find the intent mapping with all related data
        const mapping = await prisma.mapeamentoIntencao.findUnique({
            where: {
                intentName_caixaEntradaId: {
                    intentName,
                    caixaEntradaId: caixaEntrada.id, // Usar o ID interno da CaixaEntrada
                },
            },
            include: {
                caixaEntrada: {
                    include: {
                        configuracaoWhatsApp: true,
                        usuarioChatwit: true,
                    },
                },
                template: true,
                mensagemInterativa: {
                    include: {
                        botoes: {
                            orderBy: { ordem: "asc" },
                        },
                    },
                },
                unifiedTemplate: {
                    include: {
                        interactiveContent: {
                            include: {
                                header: true,
                                body: true,
                                footer: true,
                                actionCtaUrl: true,
                                actionReplyButton: true,
                                actionList: true,
                                actionFlow: true,
                                actionLocationRequest: true,
                            },
                        },
                        whatsappOfficialInfo: true,
                    },
                },
                interactiveMessage: true,
            },
        });
        if (!mapping) {
            console.log(`[DB Query] No mapping found for intent: ${intentName}, caixaEntrada: ${caixaEntrada.id} (inboxId: ${inboxIdString})`);
            return null;
        }
        // Get WhatsApp configuration
        let whatsappConfig;
        if (mapping.caixaEntrada.configuracaoWhatsApp) {
            whatsappConfig = {
                phoneNumberId: mapping.caixaEntrada.configuracaoWhatsApp.phoneNumberId,
                whatsappToken: mapping.caixaEntrada.configuracaoWhatsApp.whatsappToken,
                whatsappBusinessAccountId: mapping.caixaEntrada.configuracaoWhatsApp.whatsappBusinessAccountId,
                fbGraphApiBase: mapping.caixaEntrada.configuracaoWhatsApp.fbGraphApiBase,
            };
        }
        else {
            // Fallback to environment variables
            whatsappConfig = {
                phoneNumberId: process.env.FROM_PHONE_NUMBER_ID || "",
                whatsappToken: process.env.WHATSAPP_TOKEN || "",
                whatsappBusinessAccountId: process.env.WHATSAPP_BUSINESS_ID || "",
                fbGraphApiBase: "https://graph.facebook.com/v22.0",
            };
        }
        // Determine message type and build response
        let messageType;
        const result = {
            id: mapping.id,
            intentName: mapping.intentName,
            caixaEntradaId: mapping.caixaEntradaId,
            messageType: "template", // default, will be overridden
            whatsappConfig,
        };
        // Check for unified template (highest priority)
        if (mapping.unifiedTemplate) {
            messageType = "unified_template";
            result.unifiedTemplate = {
                id: mapping.unifiedTemplate.id,
                name: mapping.unifiedTemplate.name,
                type: mapping.unifiedTemplate.type,
                scope: mapping.unifiedTemplate.scope,
                description: mapping.unifiedTemplate.description || undefined,
                language: mapping.unifiedTemplate.language,
                interactiveContent: mapping.unifiedTemplate.interactiveContent,
                whatsappOfficialInfo: mapping.unifiedTemplate.whatsappOfficialInfo,
            };
        }
        // Check for enhanced interactive message
        else if (mapping.interactiveMessage) {
            messageType = "enhanced_interactive";
            result.enhancedInteractiveMessage = {
                id: mapping.interactiveMessage.id,
                name: mapping.interactiveMessage.name,
                type: mapping.interactiveMessage.type,
                headerType: mapping.interactiveMessage.headerType || undefined,
                headerContent: mapping.interactiveMessage.headerContent || undefined,
                bodyText: mapping.interactiveMessage.bodyText,
                footerText: mapping.interactiveMessage.footerText || undefined,
                actionData: mapping.interactiveMessage.actionData,
                latitude: mapping.interactiveMessage.latitude || undefined,
                longitude: mapping.interactiveMessage.longitude || undefined,
                locationName: mapping.interactiveMessage.locationName || undefined,
                locationAddress: mapping.interactiveMessage.locationAddress || undefined,
                reactionEmoji: mapping.interactiveMessage.reactionEmoji || undefined,
                targetMessageId: mapping.interactiveMessage.targetMessageId || undefined,
                stickerMediaId: mapping.interactiveMessage.stickerMediaId || undefined,
                stickerUrl: mapping.interactiveMessage.stickerUrl || undefined,
            };
        }
        // Check for legacy template
        else if (mapping.template) {
            messageType = "template";
            result.template = {
                id: mapping.template.id,
                templateId: mapping.template.templateId,
                name: mapping.template.name,
                status: mapping.template.status,
                category: mapping.template.category,
                language: mapping.template.language,
                components: mapping.template.components,
                qualityScore: mapping.template.qualityScore || undefined,
            };
        }
        // Check for legacy interactive message
        else if (mapping.mensagemInterativa) {
            messageType = "interactive";
            result.interactiveMessage = {
                id: mapping.mensagemInterativa.id,
                nome: mapping.mensagemInterativa.nome || undefined,
                tipo: mapping.mensagemInterativa.tipo,
                texto: mapping.mensagemInterativa.texto,
                headerTipo: mapping.mensagemInterativa.headerTipo || undefined,
                headerConteudo: mapping.mensagemInterativa.headerConteudo || undefined,
                rodape: mapping.mensagemInterativa.rodape || undefined,
                botoes: mapping.mensagemInterativa.botoes.map((botao) => ({
                    id: botao.id,
                    titulo: botao.titulo,
                    ordem: botao.ordem,
                })),
            };
        }
        else {
            console.log(`[DB Query] No message data found for mapping: ${mapping.id}`);
            return null;
        }
        result.messageType = messageType;
        console.log(`[DB Query] Found complete mapping: ${messageType} for intent: ${intentName}`);
        return result;
    }
    catch (error) {
        console.error("[DB Query] Error finding complete message mapping:", error);
        throw new Error(`Database query failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
}
// ============================================================================
// BUTTON REACTION QUERIES
// ============================================================================
/**
 * Find button reaction mapping by button ID
 * Returns the emoji and metadata for button reactions
 * Falls back to config-based mappings if database model doesn't exist
 */
async function findReactionByButtonId(buttonId) {
    try {
        console.log(`[DB Query] Finding reaction mapping for button: ${buttonId}`);
        // Try database first (ButtonReactionMapping model should exist after migration)
        try {
            const reaction = await prisma.buttonReactionMapping.findUnique({
                where: {
                    buttonId: buttonId,
                },
            });
            if (reaction && reaction.isActive) {
                console.log(`[DB Query] Found database reaction mapping: ${buttonId} -> emoji: ${reaction.emoji}, text: ${reaction.textReaction}`);
                return {
                    id: reaction.id,
                    buttonId: reaction.buttonId,
                    emoji: reaction.emoji || undefined,
                    textReaction: reaction.textReaction || undefined,
                    description: reaction.description || undefined,
                    isActive: reaction.isActive,
                };
            }
        }
        catch (dbError) {
            console.log(`[DB Query] Database reaction mapping not available, falling back to config:`, dbError);
        }
        // Fallback to config-based mappings
        const { getEmojiForButton } = await Promise.resolve().then(() => __importStar(require('../../app/config/button-reaction-mapping')));
        const emoji = getEmojiForButton(buttonId);
        if (emoji) {
            console.log(`[DB Query] Found config reaction mapping: ${buttonId} -> ${emoji}`);
            return {
                id: `config-${buttonId}`,
                buttonId,
                emoji,
                description: `Config-based reaction for ${buttonId}`,
                isActive: true,
            };
        }
        console.log(`[DB Query] No reaction mapping found for button: ${buttonId}`);
        return null;
    }
    catch (error) {
        console.error("[DB Query] Error finding button reaction mapping:", error);
        throw new Error(`Database query failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
}
/**
 * Get all active button reaction mappings
 * Useful for caching or validation purposes
 * Falls back to config-based mappings if database model doesn't exist
 */
async function getAllActiveButtonReactions() {
    try {
        console.log("[DB Query] Fetching all active button reaction mappings");
        // Try database first (ButtonReactionMapping model should exist after migration)
        try {
            const reactions = await prisma.buttonReactionMapping.findMany({
                where: {
                    isActive: true,
                },
                orderBy: {
                    buttonId: "asc",
                },
            });
            if (reactions && reactions.length > 0) {
                console.log(`[DB Query] Found ${reactions.length} database button reaction mappings`);
                return reactions.map((reaction) => ({
                    id: reaction.id,
                    buttonId: reaction.buttonId,
                    emoji: reaction.emoji || undefined,
                    textReaction: reaction.textReaction || undefined,
                    description: reaction.description || undefined,
                    isActive: reaction.isActive,
                }));
            }
        }
        catch (dbError) {
            console.log(`[DB Query] Database reaction mappings not available, falling back to config:`, dbError);
        }
        // Fallback to config-based mappings
        const { getAllButtonReactions } = await Promise.resolve().then(() => __importStar(require('../../app/config/button-reaction-mapping')));
        const configReactions = getAllButtonReactions();
        console.log(`[DB Query] Found ${configReactions.length} config button reaction mappings`);
        return configReactions.map((reaction, index) => ({
            id: `config-${index}`,
            buttonId: reaction.buttonId,
            emoji: reaction.emoji,
            description: reaction.description,
            isActive: true,
        }));
    }
    catch (error) {
        console.error("[DB Query] Error fetching all button reaction mappings:", error);
        throw new Error(`Database query failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
}
// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================
/**
 * Test database connection
 */
async function testDatabaseConnection() {
    try {
        await prisma.$queryRaw `SELECT 1`;
        return true;
    }
    catch (error) {
        console.error("[DB Query] Database connection test failed:", error);
        return false;
    }
}
/**
 * Close database connection
 */
async function closeDatabaseConnection() {
    await prisma.$disconnect();
}
