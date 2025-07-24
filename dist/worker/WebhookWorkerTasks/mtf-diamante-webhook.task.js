"use strict";
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
exports.processMtfDiamanteWebhookTask = processMtfDiamanteWebhookTask;
const prisma_1 = require("../../lib/prisma");
const whatsapp_reactions_1 = require("../../lib/whatsapp-reactions");
const whatsapp_messages_1 = require("../../lib/whatsapp-messages");
/**
 * Enhanced button click detection with support for multiple payload formats
 * Implements requirements 5.1, 5.2 for detecting button interactions
 */
function extractEnhancedButtonClickData(rawPayload) {
    try {
        // Method 1: Check Dialogflow payload format (Chatwoot integration)
        const chatwootPayload = rawPayload?.originalDetectIntentRequest?.payload;
        const interactive = chatwootPayload?.interactive;
        if (interactive?.type === 'button_reply') {
            return {
                isButtonClick: true,
                buttonId: interactive.button_reply?.id,
                buttonText: interactive.button_reply?.title,
                messageId: chatwootPayload?.id || chatwootPayload?.wamid,
                originalMessageId: chatwootPayload?.context?.id,
                interactionType: 'button_reply'
            };
        }
        if (interactive?.type === 'list_reply') {
            return {
                isButtonClick: true,
                buttonId: interactive.list_reply?.id,
                buttonText: interactive.list_reply?.title,
                messageId: chatwootPayload?.id || chatwootPayload?.wamid,
                originalMessageId: chatwootPayload?.context?.id,
                interactionType: 'list_reply'
            };
        }
        // Method 2: Check direct WhatsApp webhook format
        const whatsappMessage = rawPayload?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
        if (whatsappMessage?.type === 'interactive') {
            const whatsappInteractive = whatsappMessage.interactive;
            if (whatsappInteractive?.type === 'button_reply') {
                return {
                    isButtonClick: true,
                    buttonId: whatsappInteractive.button_reply?.id,
                    buttonText: whatsappInteractive.button_reply?.title,
                    messageId: whatsappMessage.id,
                    originalMessageId: whatsappMessage.context?.id,
                    interactionType: 'button_reply'
                };
            }
            if (whatsappInteractive?.type === 'list_reply') {
                return {
                    isButtonClick: true,
                    buttonId: whatsappInteractive.list_reply?.id,
                    buttonText: whatsappInteractive.list_reply?.title,
                    messageId: whatsappMessage.id,
                    originalMessageId: whatsappMessage.context?.id,
                    interactionType: 'list_reply'
                };
            }
        }
        // Method 3: Legacy format check
        const legacyButtonClick = extractButtonClickData(rawPayload);
        if (legacyButtonClick.isButtonClick) {
            return {
                ...legacyButtonClick,
                interactionType: 'button_reply'
            };
        }
        return { isButtonClick: false };
    }
    catch (error) {
        console.error('[MTF Diamante Webhook Worker] Error extracting enhanced button click data:', error);
        return { isButtonClick: false };
    }
}
/**
 * Legacy button click detection for backward compatibility
 */
function extractButtonClickData(rawPayload) {
    try {
        // Verificar se é uma mensagem interativa (button reply)
        const message = rawPayload?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
        if (message?.type === 'interactive' && message?.interactive?.type === 'button_reply') {
            return {
                isButtonClick: true,
                buttonId: message.interactive.button_reply.id,
                buttonText: message.interactive.button_reply.title,
                originalMessageId: message.context?.id // ID da mensagem original que continha o botão
            };
        }
        // Verificar se é uma resposta de lista
        if (message?.type === 'interactive' && message?.interactive?.type === 'list_reply') {
            return {
                isButtonClick: true,
                buttonId: message.interactive.list_reply.id,
                buttonText: message.interactive.list_reply.title,
                originalMessageId: message.context?.id
            };
        }
        return { isButtonClick: false };
    }
    catch (error) {
        console.error('Erro ao extrair dados de clique em botão:', error);
        return { isButtonClick: false };
    }
}
/**
 * Ponto central para extrair e validar todos os dados necessários do payload.
 * Garante que os IDs numéricos sejam convertidos para string e que dados essenciais existam.
 */
function extractAndValidateData(jobData) {
    const { payload } = jobData;
    // O payload aninhado contém os dados brutos do Chatwoot
    const chatwootPayload = payload?.originalDetectIntentRequest?.payload;
    if (!chatwootPayload) {
        throw new Error("Payload do Chatwoot (originalDetectIntentRequest.payload) não encontrado.");
    }
    const wamid = chatwootPayload.wamid;
    const chatwootMessageId = chatwootPayload.message_id;
    const chatwootConversationId = chatwootPayload.conversation_id;
    const chatwootInboxId = chatwootPayload.inbox_id;
    const contactPhone = chatwootPayload.contact_phone;
    const whatsappApiKey = chatwootPayload.whatsapp_api_key;
    const intentName = payload.queryResult?.intent?.displayName ?? null;
    // Validação de dados essenciais
    if (!wamid ||
        !chatwootMessageId ||
        !chatwootConversationId ||
        !chatwootInboxId ||
        !contactPhone ||
        !whatsappApiKey) {
        console.error("Payload recebido:", JSON.stringify(chatwootPayload, null, 2));
        throw new Error("Dados essenciais (wamid, message_id, conversation_id, inbox_id, etc.) estão faltando no payload do webhook.");
    }
    return {
        wamid,
        chatwootMessageId: String(chatwootMessageId), // Conversão para String
        chatwootConversationId: String(chatwootConversationId), // Conversão para String
        chatwootInboxId: String(chatwootInboxId), // Conversão para String
        contactPhone,
        whatsappApiKey,
        intentName,
        rawPayload: payload, // Salva o payload completo do Dialogflow
    };
}
async function processMtfDiamanteWebhookTask(job) {
    const { type } = job.data;
    console.log(`[MTF Diamante Webhook Worker] Processando task: ${type} - Job ID: ${job.id}`);
    try {
        // Route to appropriate handler based on task type
        switch (type) {
            // New async task types (self-contained)
            case "sendMessage":
                await processSendMessage(job.data);
                break;
            case "sendReaction":
                await processSendReaction(job.data);
                break;
            // New button reaction processing
            case "processButtonClick":
                await processButtonClick(job.data);
                break;
            // Legacy task types (for backward compatibility)
            case "store_message":
            case "update_api_key":
            case "process_intent":
            case "send_reaction":
                await processLegacyTask(job.data);
                break;
            default:
                throw new Error(`Tipo de task desconhecido: ${type}`);
        }
        console.log(`[MTF Diamante Webhook Worker] Task ${type} processada com sucesso - Job ID: ${job.id}`);
        return { success: true, type };
    }
    catch (error) {
        console.error(`[MTF Diamante Webhook Worker] Erro ao processar task ${type}:`, error);
        throw error;
    }
}
async function storeWebhookMessage(data) {
    try {
        const messageContent = extractMessageContent(data.rawPayload);
        const messageType = extractMessageType(data.rawPayload);
        // 1. Armazena a mensagem do webhook usando os IDs corretos
        await prisma_1.prisma.webhookMessage.create({
            data: {
                whatsappMessageId: data.wamid, // CORREÇÃO: Usando o WAMID real do WhatsApp
                conversationId: data.chatwootConversationId, // ID da conversa do Chatwoot
                contactPhone: data.contactPhone,
                messageContent,
                messageType,
                whatsappApiKey: data.whatsappApiKey,
                inboxId: data.chatwootInboxId, // ID da caixa de entrada do Chatwoot
                rawPayload: data.rawPayload,
                processed: true,
                timestamp: new Date(),
            },
        });
        // 2. Thread de conversa não é necessária para reações automáticas
        // O WebhookMessage já armazena todas as informações necessárias
        console.log(`[MTF Diamante Webhook Worker] Mensagem armazenada. WAMID: ${data.wamid}`);
    }
    catch (error) {
        console.error("[MTF Diamante Webhook Worker] Erro ao armazenar mensagem:", error);
        throw error;
    }
}
async function updateWhatsAppApiKey(data) {
    try {
        // A busca já usa o ID correto (string)
        const caixaEntrada = await prisma_1.prisma.caixaEntrada.findFirst({
            where: { inboxId: data.chatwootInboxId },
        });
        if (!caixaEntrada) {
            console.warn(`[MTF Diamante Webhook Worker] Caixa de entrada não encontrada para inboxId: ${data.chatwootInboxId}`);
            return;
        }
        // O upsert já usa o ID interno da caixaEntrada, o que está correto.
        await prisma_1.prisma.whatsAppConfig.upsert({
            where: {
                caixaEntradaId: caixaEntrada.id,
            },
            update: {
                whatsappToken: data.whatsappApiKey,
            },
            create: {
                whatsappToken: data.whatsappApiKey,
                // TODO: Popular estes campos de outra forma se necessário
                phoneNumberId: "default_phone_number_id",
                whatsappBusinessAccountId: "default_business_account_id",
                isActive: true,
                caixaEntradaId: caixaEntrada.id,
                usuarioChatwitId: caixaEntrada.usuarioChatwitId, // Garante a relação com o usuário
            },
        });
        console.log(`[MTF Diamante Webhook Worker] API key atualizada para inbox: ${data.chatwootInboxId}`);
    }
    catch (error) {
        console.error("[MTF Diamante Webhook Worker] Erro ao atualizar API key:", error);
        throw error;
    }
}
async function processDialogflowIntent(data) {
    try {
        // Criar registro apenas com os campos que existem no modelo DialogflowIntent
        await prisma_1.prisma.dialogflowIntent.create({
            data: {
                intentName: data.intentName,
                // Removido: payload, processed, timestamp - estes campos não existem no modelo
            },
        });
        console.log(`[MTF Diamante Webhook Worker] Intent processada: ${data.intentName} para ${data.contactPhone}`);
    }
    catch (error) {
        console.error("[MTF Diamante Webhook Worker] Erro ao processar intent:", error);
        throw error;
    }
}
// --- Funções de Extração Corrigidas ---
function extractMessageContent(payload) {
    // O conteúdo da mensagem do usuário está no payload do Chatwoot
    const chatwootPayload = payload?.originalDetectIntentRequest?.payload;
    return chatwootPayload?.message_content ?? "Mensagem sem conteúdo de texto";
}
function extractMessageType(payload) {
    // O tipo da mensagem também está no payload do Chatwoot
    const chatwootPayload = payload?.originalDetectIntentRequest?.payload;
    // O campo message_content_type (ex: 'text') parece mais apropriado que message_type ('incoming')
    return chatwootPayload?.message_content_type ?? "unknown";
}
// ============================================================================
// NEW ASYNC TASK HANDLERS (Self-contained, no database queries)
// ============================================================================
/**
 * Process sendMessage task - handles both template and interactive messages
 * Uses self-contained task data, no database queries needed
 * Implements comprehensive error handling and logging as per requirements 2.3
 */
async function processSendMessage(taskData) {
    const startTime = Date.now();
    const { recipientPhone, whatsappApiKey, messageData, correlationId, metadata, } = taskData;
    // Structured logging with correlation ID for request tracing
    const logContext = {
        correlationId,
        recipientPhone,
        messageType: messageData.type,
        intentName: metadata?.intentName,
        caixaId: metadata?.caixaId,
        taskType: "sendMessage",
    };
    console.log(`[MTF Diamante Webhook Worker] Starting sendMessage task processing`, logContext);
    try {
        // Input validation
        if (!recipientPhone || !whatsappApiKey || !messageData) {
            throw new Error("Missing required task data: recipientPhone, whatsappApiKey, or messageData");
        }
        let result;
        // Determine message type and call appropriate handler
        if (messageData.type === "template") {
            console.log(`[MTF Diamante Webhook Worker] Processing template message`, {
                ...logContext,
                templateId: messageData.templateId,
                templateName: messageData.templateName,
            });
            // Validate template message requirements
            if (!messageData.templateId || !messageData.templateName) {
                throw new Error("Template ID and name are required for template messages");
            }
            // Template components should be included in the task data for self-contained processing
            const templateComponents = messageData.templateComponents || [];
            if (templateComponents.length === 0) {
                console.warn(`[MTF Diamante Webhook Worker] No template components provided for template ${messageData.templateName}. Message may not render correctly.`, logContext);
            }
            // Send template message with comprehensive error handling
            result = await (0, whatsapp_messages_1.sendTemplateMessage)({
                recipientPhone,
                templateId: messageData.templateId,
                templateName: messageData.templateName,
                variables: messageData.variables || {},
                whatsappApiKey,
                // Pass through additional template data if available
                language: messageData.language || "pt_BR",
                headerVar: messageData.headerVar,
                headerMedia: messageData.headerMedia,
                bodyVars: messageData.bodyVars,
                buttonOverrides: messageData.buttonOverrides,
                couponCode: messageData.couponCode,
            }, templateComponents);
        }
        else if (messageData.type === "text") {
            console.log(`[MTF Diamante Webhook Worker] Processing text message`, {
                ...logContext,
                textContent: messageData.textContent,
                replyToMessageId: messageData.replyToMessageId,
            });
            // Validate text message requirements
            if (!messageData.textContent) {
                throw new Error("Text content is required for text messages");
            }
            // Send text message (can be a reply or standalone)
            result = await (0, whatsapp_messages_1.sendTextMessage)({
                recipientPhone,
                whatsappApiKey,
                text: messageData.textContent,
                replyToMessageId: messageData.replyToMessageId,
            });
        }
        else if (messageData.type === "interactive") {
            console.log(`[MTF Diamante Webhook Worker] Processing interactive message`, {
                ...logContext,
                hasHeader: !!messageData.interactiveContent?.header,
                hasFooter: !!messageData.interactiveContent?.footer,
                buttonsCount: messageData.interactiveContent?.buttons?.length || 0,
                listSectionsCount: messageData.interactiveContent?.listSections?.length || 0,
            });
            // Validate interactive message requirements
            if (!messageData.interactiveContent) {
                throw new Error("Interactive content is required for interactive messages");
            }
            const { interactiveContent } = messageData;
            // Validate interactive content structure
            if (!interactiveContent.body) {
                throw new Error("Body text is required for interactive messages");
            }
            // Determine interactive message action type
            let actionType = "buttons";
            let actionData = {};
            if (interactiveContent.buttons && interactiveContent.buttons.length > 0) {
                actionType = "buttons";
                actionData = { buttons: interactiveContent.buttons };
                // Validate button structure
                for (const button of interactiveContent.buttons) {
                    if (!button.id || !button.title) {
                        throw new Error("Button ID and title are required for all buttons");
                    }
                }
            }
            else if (interactiveContent.listSections &&
                interactiveContent.listSections.length > 0) {
                actionType = "list";
                actionData = {
                    buttonText: interactiveContent.buttonText || "Select",
                    sections: interactiveContent.listSections,
                };
                // Validate list structure
                for (const section of interactiveContent.listSections) {
                    if (!section.title || !section.rows || section.rows.length === 0) {
                        throw new Error("List sections must have title and at least one row");
                    }
                    for (const row of section.rows) {
                        if (!row.id || !row.title) {
                            throw new Error("List row ID and title are required");
                        }
                    }
                }
            }
            else {
                throw new Error("Interactive message must have either buttons or list sections");
            }
            // Send interactive message with comprehensive error handling
            result = await (0, whatsapp_messages_1.sendInteractiveMessage)({
                recipientPhone,
                whatsappApiKey,
                header: interactiveContent.header,
                body: interactiveContent.body,
                footer: interactiveContent.footer,
                action: {
                    type: actionType,
                    data: actionData,
                },
            });
        }
        else {
            throw new Error(`Unsupported message type: ${messageData.type}`);
        }
        // Process result with detailed logging
        const processingTime = Date.now() - startTime;
        if (result.success) {
            console.log(`[MTF Diamante Webhook Worker] Message sent successfully`, {
                ...logContext,
                messageId: result.messageId,
                processingTimeMs: processingTime,
                success: true,
            });
            return {
                success: true,
                messageId: result.messageId,
                processingTime,
                correlationId,
            };
        }
        else {
            console.error(`[MTF Diamante Webhook Worker] Failed to send message`, {
                ...logContext,
                error: result.error,
                details: result.details,
                processingTimeMs: processingTime,
                success: false,
            });
            // Throw error to trigger retry mechanism
            throw new Error(`Message sending failed: ${result.error}`);
        }
    }
    catch (error) {
        const processingTime = Date.now() - startTime;
        console.error("[MTF Diamante Webhook Worker] Error processing sendMessage task:", {
            ...logContext,
            error: error.message,
            stack: error.stack,
            processingTimeMs: processingTime,
            success: false,
        });
        // Re-throw to trigger BullMQ retry mechanism
        throw error;
    }
}
/**
 * Process sendReaction task - sends emoji reactions
 * Uses self-contained task data, no database queries needed
 * Implements comprehensive error handling and logging as per requirements 2.3
 */
async function processSendReaction(taskData) {
    const startTime = Date.now();
    const { recipientPhone, messageId, emoji, whatsappApiKey, correlationId, metadata, } = taskData;
    // Structured logging with correlation ID for request tracing
    const logContext = {
        correlationId,
        recipientPhone,
        messageId,
        emoji,
        buttonId: metadata?.buttonId,
        taskType: "sendReaction",
    };
    console.log(`[MTF Diamante Webhook Worker] Starting sendReaction task processing`, logContext);
    try {
        // Input validation
        if (!recipientPhone || !messageId || !emoji || !whatsappApiKey) {
            throw new Error("Missing required task data: recipientPhone, messageId, emoji, or whatsappApiKey");
        }
        // Validate emoji format (basic validation)
        if (emoji.length === 0 || emoji.length > 10) {
            throw new Error("Invalid emoji format: emoji must be 1-10 characters");
        }
        // Validate message ID format (WhatsApp message IDs typically start with 'wamid.')
        if (!messageId.includes("wamid.") &&
            !messageId.includes("gBG") &&
            messageId.length < 10) {
            console.warn(`[MTF Diamante Webhook Worker] Potentially invalid message ID format: ${messageId}`, logContext);
        }
        console.log(`[MTF Diamante Webhook Worker] Sending reaction to WhatsApp API`, {
            ...logContext,
            messageIdLength: messageId.length,
            emojiLength: emoji.length,
        });
        // Send the reaction message using self-contained data
        const result = await (0, whatsapp_reactions_1.sendReactionMessage)({
            recipientPhone,
            messageId,
            emoji,
            whatsappApiKey,
        });
        // Process result with detailed logging
        const processingTime = Date.now() - startTime;
        // Always log the reaction attempt for tracking/debugging
        try {
            await (0, whatsapp_reactions_1.logReactionAttempt)({
                recipientPhone,
                messageId,
                emoji,
                buttonId: metadata?.buttonId || "unknown",
                success: result.success,
                error: result.error,
            });
        }
        catch (logError) {
            // Don't fail the task if logging fails, but log the error
            console.error(`[MTF Diamante Webhook Worker] Failed to log reaction attempt`, {
                ...logContext,
                logError: logError instanceof Error ? logError.message : "Unknown log error",
            });
        }
        if (result.success) {
            console.log(`[MTF Diamante Webhook Worker] Reaction sent successfully`, {
                ...logContext,
                whatsappMessageId: result.messageId,
                processingTimeMs: processingTime,
                success: true,
            });
            return {
                success: true,
                messageId: result.messageId,
                processingTime,
                correlationId,
            };
        }
        else {
            console.error(`[MTF Diamante Webhook Worker] Failed to send reaction`, {
                ...logContext,
                error: result.error,
                processingTimeMs: processingTime,
                success: false,
            });
            // Throw error to trigger retry mechanism
            throw new Error(`Reaction sending failed: ${result.error}`);
        }
    }
    catch (error) {
        const processingTime = Date.now() - startTime;
        console.error("[MTF Diamante Webhook Worker] Error processing sendReaction task:", {
            ...logContext,
            error: error.message,
            stack: error.stack,
            processingTimeMs: processingTime,
            success: false,
        });
        // Re-throw to trigger BullMQ retry mechanism
        throw error;
    }
}
// ============================================================================
// LEGACY TASK PROCESSOR (For backward compatibility)
// ============================================================================
/**
 * Process legacy webhook tasks that require database queries
 *
 * LEGACY TASKS EXPLICADAS:
 * - store_message: Armazena a mensagem recebida no banco para histórico
 * - update_api_key: Atualiza/salva a API key do WhatsApp no banco
 * - process_intent: Salva informações da intenção do Dialogflow no banco
 * - send_reaction: Envia reações emoji (sistema antigo)
 *
 * Essas tasks são executadas em paralelo com o novo sistema assíncrono
 * para manter compatibilidade e histórico de dados.
 */
async function processLegacyTask(jobData) {
    const { type } = jobData;
    console.log(`[MTF Diamante Webhook Worker] Processing legacy task: ${type}`);
    console.log(`[MTF Diamante Webhook Worker] Legacy task data:`, {
        type,
        hasPayload: !!jobData.payload,
        hasReactionData: !!jobData.reactionData,
        payloadKeys: jobData.payload ? Object.keys(jobData.payload) : [],
    });
    try {
        // Extract and validate data for legacy tasks
        const data = extractAndValidateData(jobData);
        console.log(`[MTF Diamante Webhook Worker] Extracted data for legacy task ${type}:`, {
            wamid: data.wamid,
            contactPhone: data.contactPhone,
            intentName: data.intentName,
            chatwootInboxId: data.chatwootInboxId,
            hasWhatsappApiKey: !!data.whatsappApiKey,
        });
        switch (type) {
            case "store_message":
                console.log(`[MTF Diamante Webhook Worker] Storing webhook message in database...`);
                await storeWebhookMessage(data);
                break;
            case "update_api_key":
                console.log(`[MTF Diamante Webhook Worker] Updating WhatsApp API key in database...`);
                await updateWhatsAppApiKey({
                    chatwootInboxId: data.chatwootInboxId,
                    whatsappApiKey: data.whatsappApiKey,
                });
                break;
            case "process_intent":
                if (!data.intentName) {
                    console.warn(`[MTF Diamante Webhook Worker] Attempted to process intent, but intent name not found`);
                    break;
                }
                console.log(`[MTF Diamante Webhook Worker] Processing Dialogflow intent: ${data.intentName}`);
                await processDialogflowIntent({
                    payload: data.rawPayload,
                    intentName: data.intentName,
                    contactPhone: data.contactPhone,
                });
                break;
            case "send_reaction":
                console.log(`[MTF Diamante Webhook Worker] Processing legacy reaction send...`);
                await processLegacySendReaction(jobData);
                break;
            default:
                throw new Error(`Unknown legacy task type: ${type}`);
        }
    }
    catch (error) {
        console.error(`[MTF Diamante Webhook Worker] Error processing legacy task ${type}:`, error);
        throw error;
    }
}
/**
 * Process button click and send automatic reaction
 * Enhanced to detect button clicks and send configured emoji/text reactions
 * Implements requirements 5.1, 5.2, 5.3, 5.4, 5.5, 5.6
 */
async function processButtonClick(jobData) {
    const startTime = Date.now();
    try {
        console.log('[MTF Diamante Webhook Worker] Processing button click...');
        // Extract button click data from payload with enhanced detection
        const buttonClickData = extractEnhancedButtonClickData(jobData.payload);
        if (!buttonClickData.isButtonClick) {
            console.log('[MTF Diamante Webhook Worker] Not a button click, skipping reaction processing');
            return;
        }
        console.log('[MTF Diamante Webhook Worker] Button click detected:', {
            buttonId: buttonClickData.buttonId,
            buttonText: buttonClickData.buttonText,
            originalMessageId: buttonClickData.originalMessageId,
            messageId: buttonClickData.messageId,
            interactionType: buttonClickData.interactionType
        });
        // Extract validated data for API calls
        const data = extractAndValidateData(jobData);
        // Look up configured reaction for this button using the enhanced query
        const buttonReaction = await findButtonReactionWithFallback(buttonClickData.buttonId || '');
        if (!buttonReaction) {
            console.log(`[MTF Diamante Webhook Worker] No reaction configured for button: ${buttonClickData.buttonId}`);
            return;
        }
        console.log('[MTF Diamante Webhook Worker] Found button reaction:', {
            buttonId: buttonReaction.buttonId,
            reactionType: buttonReaction.type,
            emoji: buttonReaction.emoji,
            textReaction: buttonReaction.textReaction,
            isActive: buttonReaction.isActive
        });
        // Determine the target message ID for reactions
        const targetMessageId = buttonClickData.originalMessageId || buttonClickData.messageId || data.wamid;
        if (!targetMessageId) {
            console.error('[MTF Diamante Webhook Worker] No target message ID found for reaction');
            return;
        }
        // Process reactions based on type with enhanced error handling
        const reactionResults = await processButtonReactions({
            buttonReaction,
            targetMessageId,
            recipientPhone: data.contactPhone,
            whatsappApiKey: data.whatsappApiKey,
            buttonClickData,
            correlationId: `button-click-${Date.now()}`
        });
        // Log all reaction attempts for monitoring
        await logButtonReactionAttempts(reactionResults);
        const processingTime = Date.now() - startTime;
        console.log(`[MTF Diamante Webhook Worker] Button click processed successfully in ${processingTime}ms`, {
            buttonId: buttonClickData.buttonId,
            reactionsProcessed: reactionResults.length,
            successfulReactions: reactionResults.filter(r => r.success).length
        });
    }
    catch (error) {
        const processingTime = Date.now() - startTime;
        console.error('[MTF Diamante Webhook Worker] Error processing button click:', {
            error: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined,
            processingTimeMs: processingTime,
            buttonId: jobData.payload?.originalDetectIntentRequest?.payload?.interactive?.button_reply?.id
        });
        throw error;
    }
}
// ============================================================================
// ENHANCED BUTTON REACTION PROCESSING FUNCTIONS
// ============================================================================
/**
 * Enhanced button reaction lookup with fallback to config-based mappings
 * Implements requirements 6.1, 6.2 for database integration
 */
async function findButtonReactionWithFallback(buttonId) {
    try {
        // First try database lookup
        const dbReaction = await prisma_1.prisma.buttonReactionMapping.findUnique({
            where: { buttonId }
        });
        if (dbReaction && dbReaction.isActive) {
            const type = dbReaction.emoji && dbReaction.textReaction ? 'both' :
                dbReaction.emoji ? 'emoji' : 'text';
            return {
                id: dbReaction.id,
                buttonId: dbReaction.buttonId,
                type,
                emoji: dbReaction.emoji || undefined,
                textReaction: dbReaction.textReaction || undefined,
                isActive: dbReaction.isActive
            };
        }
        // Fallback to config-based mapping
        const { findReactionByButtonId } = await Promise.resolve().then(() => __importStar(require('@/lib/dialogflow-database-queries')));
        const configReaction = await findReactionByButtonId(buttonId);
        if (configReaction) {
            const type = configReaction.emoji && configReaction.textReaction ? 'both' :
                configReaction.emoji ? 'emoji' : 'text';
            return {
                id: configReaction.id,
                buttonId: configReaction.buttonId,
                type,
                emoji: configReaction.emoji,
                textReaction: configReaction.textReaction,
                isActive: configReaction.isActive
            };
        }
        return null;
    }
    catch (error) {
        console.error('[MTF Diamante Webhook Worker] Error finding button reaction:', error);
        return null;
    }
}
/**
 * Process button reactions with comprehensive error handling
 * Implements requirements 5.3, 5.4, 5.5 for reaction processing
 */
async function processButtonReactions(params) {
    const { buttonReaction, targetMessageId, recipientPhone, whatsappApiKey, buttonClickData, correlationId } = params;
    const results = [];
    // Process emoji reaction if configured
    if (buttonReaction.emoji) {
        console.log(`[MTF Diamante Webhook Worker] Sending emoji reaction: ${buttonReaction.emoji}`);
        try {
            const reactionResult = await (0, whatsapp_reactions_1.sendReactionMessage)({
                recipientPhone,
                messageId: targetMessageId,
                emoji: buttonReaction.emoji,
                whatsappApiKey
            });
            results.push({
                type: 'emoji',
                success: reactionResult.success,
                messageId: reactionResult.messageId,
                error: reactionResult.error,
                buttonId: buttonReaction.buttonId,
                recipientPhone,
                targetMessageId
            });
            if (reactionResult.success) {
                console.log('[MTF Diamante Webhook Worker] Emoji reaction sent successfully');
            }
            else {
                console.error('[MTF Diamante Webhook Worker] Failed to send emoji reaction:', reactionResult.error);
            }
        }
        catch (error) {
            console.error('[MTF Diamante Webhook Worker] Exception sending emoji reaction:', error);
            results.push({
                type: 'emoji',
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
                buttonId: buttonReaction.buttonId,
                recipientPhone,
                targetMessageId
            });
        }
    }
    // Process text reaction if configured (as a reply message)
    if (buttonReaction.textReaction) {
        console.log(`[MTF Diamante Webhook Worker] Sending text reaction: ${buttonReaction.textReaction}`);
        try {
            const textResult = await (0, whatsapp_messages_1.sendTextMessage)({
                recipientPhone,
                whatsappApiKey,
                text: buttonReaction.textReaction,
                replyToMessageId: targetMessageId
            });
            results.push({
                type: 'text',
                success: textResult.success,
                messageId: textResult.messageId,
                error: textResult.error,
                buttonId: buttonReaction.buttonId,
                recipientPhone,
                targetMessageId
            });
            if (textResult.success) {
                console.log('[MTF Diamante Webhook Worker] Text reaction sent successfully');
            }
            else {
                console.error('[MTF Diamante Webhook Worker] Failed to send text reaction:', textResult.error);
            }
        }
        catch (error) {
            console.error('[MTF Diamante Webhook Worker] Exception sending text reaction:', error);
            results.push({
                type: 'text',
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
                buttonId: buttonReaction.buttonId,
                recipientPhone,
                targetMessageId
            });
        }
    }
    return results;
}
/**
 * Log button reaction attempts for monitoring and debugging
 * Implements requirement 6.4 for comprehensive logging
 */
async function logButtonReactionAttempts(reactionResults) {
    for (const result of reactionResults) {
        try {
            if (result.type === 'emoji') {
                await (0, whatsapp_reactions_1.logReactionAttempt)({
                    recipientPhone: result.recipientPhone,
                    messageId: result.targetMessageId,
                    emoji: '📱', // Generic emoji for logging
                    buttonId: result.buttonId,
                    success: result.success,
                    error: result.error
                });
            }
            // For text reactions, we could extend the logging system
            console.log('[MTF Diamante Webhook Worker] Reaction attempt logged:', {
                timestamp: new Date().toISOString(),
                type: result.type,
                buttonId: result.buttonId,
                recipientPhone: result.recipientPhone,
                targetMessageId: result.targetMessageId,
                success: result.success,
                error: result.error,
                sentMessageId: result.messageId
            });
        }
        catch (logError) {
            console.error('[MTF Diamante Webhook Worker] Failed to log reaction attempt:', {
                logError: logError instanceof Error ? logError.message : 'Unknown log error',
                reactionResult: result
            });
        }
    }
}
/**
 * Legacy reaction processing (uses database queries)
 */
async function processLegacySendReaction(jobData) {
    try {
        if (!jobData.reactionData) {
            throw new Error("Dados de reação não encontrados no job");
        }
        const { reactionData, whatsappApiKey } = jobData;
        console.log(`[MTF Diamante Webhook Worker] Enviando reação ${reactionData.emoji} para mensagem ${reactionData.originalMessageId}`);
        // Send the reaction message
        const result = await (0, whatsapp_reactions_1.sendReactionMessage)({
            recipientPhone: reactionData.recipientPhone,
            messageId: reactionData.originalMessageId,
            emoji: reactionData.emoji,
            whatsappApiKey: whatsappApiKey,
        });
        // Log the reaction attempt
        await (0, whatsapp_reactions_1.logReactionAttempt)({
            recipientPhone: reactionData.recipientPhone,
            messageId: reactionData.originalMessageId,
            emoji: reactionData.emoji,
            buttonId: reactionData.buttonId,
            success: result.success,
            error: result.error,
        });
        if (result.success) {
            console.log(`[MTF Diamante Webhook Worker] Reação enviada com sucesso para botão ${reactionData.buttonId}`);
        }
        else {
            console.error(`[MTF Diamante Webhook Worker] Falha ao enviar reação para botão ${reactionData.buttonId}: ${result.error}`);
        }
    }
    catch (error) {
        console.error("[MTF Diamante Webhook Worker] Erro ao processar envio de reação:", error);
        throw error;
    }
}
