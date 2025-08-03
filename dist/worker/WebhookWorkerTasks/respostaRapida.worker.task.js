"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.respostaRapidaWorker = void 0;
exports.processRespostaRapidaTask = processRespostaRapidaTask;
const bullmq_1 = require("bullmq");
const redis_1 = require("../../lib/redis");
const resposta_rapida_queue_1 = require("../../lib/queue/resposta-rapida.queue");
const prisma_1 = require("../../lib/prisma");
const application_performance_monitor_1 = require("../../lib/monitoring/application-performance-monitor");
const perf_hooks_1 = require("perf_hooks");
// ============================================================================
// INTENT PROCESSING LOGIC (Subtask 3.1)
// ============================================================================
class IntentProcessor {
    /**
     * Process intent interaction using unified template system
     * Requirements: 4.2, 4.4, 4.5
     */
    async processIntent(intentName, inboxId, credentials, contactPhone, wamid, correlationId) {
        const startTime = Date.now();
        try {
            console.log(`[Intent Processor] Processing intent: ${intentName}`, {
                correlationId,
                inboxId,
                contactPhone,
            });
            // 1. Query MapeamentoIntencao for template mapping
            const templateMapping = await this.findTemplateByIntent(intentName, inboxId);
            if (!templateMapping) {
                console.log(`[Intent Processor] No mapping found for intent: ${intentName}`, {
                    correlationId,
                    inboxId,
                });
                // Fallback handling when no mapping is found
                return await this.handleNoMappingFallback(intentName, contactPhone, credentials, correlationId, startTime);
            }
            // 2. Resolve template based on type with priority logic
            const resolvedTemplate = await this.resolveTemplate(templateMapping);
            if (!resolvedTemplate) {
                throw new Error(`Failed to resolve template for intent: ${intentName}`);
            }
            // 3. Extract variables and substitute dynamic content
            const processedContent = await this.processTemplateContent(resolvedTemplate, {
                contactPhone,
                intentName,
                wamid,
                correlationId,
            });
            // 4. Send message via WhatsApp API with credential management
            const messageId = await whatsappApiManager.sendMessage(contactPhone, processedContent, credentials, inboxId, correlationId);
            const processingTime = Date.now() - startTime;
            console.log(`[Intent Processor] Successfully processed intent: ${intentName}`, {
                correlationId,
                messageId,
                processingTime,
            });
            return {
                success: true,
                messageId,
                processingTime,
                correlationId,
            };
        }
        catch (error) {
            const processingTime = Date.now() - startTime;
            const errorMessage = error instanceof Error ? error.message : "Unknown error";
            console.error(`[Intent Processor] Failed to process intent: ${intentName}`, {
                correlationId,
                error: errorMessage,
                processingTime,
            });
            return {
                success: false,
                error: errorMessage,
                processingTime,
                correlationId,
            };
        }
    }
    /**
     * Query MapeamentoIntencao for template mapping
     * Requirement: 4.2
     */
    async findTemplateByIntent(intentName, inboxId) {
        try {
            // Find the mapping using the unified model
            const mapping = await prisma_1.prisma.mapeamentoIntencao.findFirst({
                where: {
                    intentName,
                    inbox: {
                        inboxId: inboxId,
                    },
                },
                include: {
                    template: {
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
                },
            });
            if (!mapping || !mapping.template) {
                return null;
            }
            return {
                id: mapping.id,
                template: {
                    id: mapping.template.id,
                    name: mapping.template.name,
                    type: mapping.template.type,
                    simpleReplyText: mapping.template.simpleReplyText || undefined,
                    interactiveContent: mapping.template.interactiveContent,
                    whatsappOfficialInfo: mapping.template.whatsappOfficialInfo,
                },
            };
        }
        catch (error) {
            console.error("[Intent Processor] Error finding template mapping:", error);
            throw error;
        }
    }
    /**
     * Template resolution logic supporting all template types
     * Priority: unified template > enhanced interactive > legacy template
     * Requirement: 4.4, 4.5
     */
    async resolveTemplate(mapping) {
        const { template } = mapping;
        try {
            // Priority 1: WHATSAPP_OFFICIAL (unified template)
            if (template.type === "WHATSAPP_OFFICIAL" &&
                template.whatsappOfficialInfo) {
                console.log(`[Intent Processor] Using WhatsApp Official template: ${template.name}`);
                return {
                    type: "whatsapp_official",
                    data: template.whatsappOfficialInfo,
                    name: template.name,
                };
            }
            // Priority 2: INTERACTIVE_MESSAGE (enhanced interactive)
            if (template.type === "INTERACTIVE_MESSAGE" &&
                template.interactiveContent) {
                console.log(`[Intent Processor] Using Interactive Message template: ${template.name}`);
                return {
                    type: "interactive_message",
                    data: template.interactiveContent,
                    name: template.name,
                };
            }
            // Priority 3: AUTOMATION_REPLY (simple text)
            if (template.type === "AUTOMATION_REPLY" && template.simpleReplyText) {
                console.log(`[Intent Processor] Using Automation Reply template: ${template.name}`);
                return {
                    type: "automation_reply",
                    data: {
                        text: template.simpleReplyText,
                    },
                    name: template.name,
                };
            }
            throw new Error(`No valid template content found for template: ${template.name}`);
        }
        catch (error) {
            console.error("[Intent Processor] Error resolving template:", error);
            throw error;
        }
    }
    /**
     * Variable extraction and substitution for dynamic content
     * Requirement: 4.4
     */
    async processTemplateContent(resolvedTemplate, variables) {
        try {
            const { type, data, name } = resolvedTemplate;
            // Define available variables for substitution
            const variableMap = {
                "{{contact_phone}}": variables.contactPhone,
                "{{intent_name}}": variables.intentName,
                "{{wamid}}": variables.wamid,
                "{{correlation_id}}": variables.correlationId,
                "{{timestamp}}": new Date().toISOString(),
                "{{date}}": new Date().toLocaleDateString("pt-BR"),
                "{{time}}": new Date().toLocaleTimeString("pt-BR"),
            };
            console.log(`[Intent Processor] Processing template content: ${name}`, {
                type,
                variables: Object.keys(variableMap),
            });
            switch (type) {
                case "whatsapp_official":
                    return this.processWhatsAppOfficialTemplate(data, variableMap);
                case "interactive_message":
                    return this.processInteractiveMessageTemplate(data, variableMap);
                case "automation_reply":
                    return this.processAutomationReplyTemplate(data, variableMap);
                default:
                    throw new Error(`Unknown template type: ${type}`);
            }
        }
        catch (error) {
            console.error("[Intent Processor] Error processing template content:", error);
            throw error;
        }
    }
    /**
     * Process WhatsApp Official template with variable substitution
     */
    processWhatsAppOfficialTemplate(data, variables) {
        try {
            // Deep clone the template data
            const processedData = JSON.parse(JSON.stringify(data));
            // Process components for variable substitution
            if (processedData.components && Array.isArray(processedData.components)) {
                processedData.components = processedData.components.map((component) => {
                    if (component.type === "BODY" && component.text) {
                        component.text = this.substituteVariables(component.text, variables);
                    }
                    if (component.type === "HEADER" && component.text) {
                        component.text = this.substituteVariables(component.text, variables);
                    }
                    if (component.type === "FOOTER" && component.text) {
                        component.text = this.substituteVariables(component.text, variables);
                    }
                    return component;
                });
            }
            return {
                type: "template",
                template: {
                    name: processedData.metaTemplateId || "default",
                    language: {
                        code: processedData.language || "pt_BR",
                    },
                    components: processedData.components || [],
                },
            };
        }
        catch (error) {
            console.error("[Intent Processor] Error processing WhatsApp Official template:", error);
            throw error;
        }
    }
    /**
     * Process Interactive Message template with variable substitution
     */
    processInteractiveMessageTemplate(data, variables) {
        try {
            const processedData = JSON.parse(JSON.stringify(data));
            // Process body text
            if (processedData.body?.text) {
                processedData.body.text = this.substituteVariables(processedData.body.text, variables);
            }
            // Process header content
            if (processedData.header?.content) {
                processedData.header.content = this.substituteVariables(processedData.header.content, variables);
            }
            // Process footer text
            if (processedData.footer?.text) {
                processedData.footer.text = this.substituteVariables(processedData.footer.text, variables);
            }
            return {
                type: "interactive",
                interactive: processedData,
            };
        }
        catch (error) {
            console.error("[Intent Processor] Error processing Interactive Message template:", error);
            throw error;
        }
    }
    /**
     * Process Automation Reply template with variable substitution
     */
    processAutomationReplyTemplate(data, variables) {
        try {
            const processedText = this.substituteVariables(data.text, variables);
            return {
                type: "text",
                text: {
                    body: processedText,
                },
            };
        }
        catch (error) {
            console.error("[Intent Processor] Error processing Automation Reply template:", error);
            throw error;
        }
    }
    /**
     * Substitute variables in text content
     */
    substituteVariables(text, variables) {
        let processedText = text;
        for (const [placeholder, value] of Object.entries(variables)) {
            processedText = processedText.replace(new RegExp(placeholder, "g"), value);
        }
        return processedText;
    }
    /**
     * Fallback handling when no mapping is found
     * Requirement: 4.5
     */
    async handleNoMappingFallback(intentName, contactPhone, credentials, correlationId, startTime) {
        try {
            console.log(`[Intent Processor] Applying fallback for unmapped intent: ${intentName}`, {
                correlationId,
            });
            // Send a generic fallback message
            const fallbackMessage = {
                type: "text",
                text: {
                    body: `Desculpe, não consegui processar sua solicitação. Nossa equipe foi notificada. (Intent: ${intentName})`,
                },
            };
            const messageId = await whatsappApiManager.sendMessage(contactPhone, fallbackMessage, credentials, "fallback", correlationId);
            const processingTime = Date.now() - startTime;
            return {
                success: true,
                messageId,
                processingTime,
                correlationId,
            };
        }
        catch (error) {
            const processingTime = Date.now() - startTime;
            const errorMessage = error instanceof Error ? error.message : "Unknown error";
            return {
                success: false,
                error: `Fallback failed: ${errorMessage}`,
                processingTime,
                correlationId,
            };
        }
    }
}
// ============================================================================
// BUTTON CLICK PROCESSING LOGIC (Subtask 3.2)
// ============================================================================
class ButtonProcessor {
    /**
     * Process button click interaction with action mapping
     * Requirements: 4.3, 4.4, 5.1
     */
    async processButtonClick(buttonId, inboxId, credentials, contactPhone, wamid, correlationId) {
        const startTime = Date.now();
        try {
            console.log(`[Button Processor] Processing button click: ${buttonId}`, {
                correlationId,
                inboxId,
                contactPhone,
            });
            // 1. Query MapeamentoBotao for action mapping
            const actionMapping = await this.findActionByButtonId(buttonId, inboxId);
            if (!actionMapping) {
                console.log(`[Button Processor] No mapping found for button: ${buttonId}`, {
                    correlationId,
                    inboxId,
                });
                // Fallback to emoji reaction if no specific mapping exists
                return await this.handleEmojiReactionFallback(buttonId, contactPhone, wamid, credentials, correlationId, startTime);
            }
            // 2. Execute action based on action type
            const result = await this.executeAction(actionMapping, contactPhone, wamid, credentials, correlationId);
            const processingTime = Date.now() - startTime;
            console.log(`[Button Processor] Successfully processed button: ${buttonId}`, {
                correlationId,
                actionType: actionMapping.actionType,
                processingTime,
            });
            return {
                success: true,
                messageId: result.messageId,
                processingTime,
                correlationId,
            };
        }
        catch (error) {
            const processingTime = Date.now() - startTime;
            const errorMessage = error instanceof Error ? error.message : "Unknown error";
            console.error(`[Button Processor] Failed to process button: ${buttonId}`, {
                correlationId,
                error: errorMessage,
                processingTime,
            });
            return {
                success: false,
                error: errorMessage,
                processingTime,
                correlationId,
            };
        }
    }
    /**
     * Query MapeamentoBotao for action mapping
     * Requirement: 4.3
     */
    async findActionByButtonId(buttonId, inboxId) {
        try {
            // Find the mapping using the unified model
            const mapping = await prisma_1.prisma.mapeamentoBotao.findFirst({
                where: {
                    buttonId,
                    inbox: {
                        inboxId: inboxId,
                    },
                },
                include: {
                    inbox: true,
                },
            });
            if (!mapping) {
                return null;
            }
            return {
                id: mapping.id,
                buttonId: mapping.buttonId,
                actionType: mapping.actionType,
                actionPayload: mapping.actionPayload,
            };
        }
        catch (error) {
            console.error("[Button Processor] Error finding action mapping:", error);
            throw error;
        }
    }
    /**
     * Execute action based on action type
     * Support for different action types (SEND_TEMPLATE, ADD_TAG, etc.)
     * Requirement: 4.4
     */
    async executeAction(actionMapping, contactPhone, wamid, credentials, correlationId) {
        const { actionType, actionPayload } = actionMapping;
        console.log(`[Button Processor] Executing action: ${actionType}`, {
            correlationId,
            buttonId: actionMapping.buttonId,
            payload: actionPayload,
        });
        switch (actionType) {
            case "SEND_TEMPLATE":
                return await this.executeSendTemplateAction(actionPayload, contactPhone, credentials, correlationId);
            case "ADD_TAG":
                return await this.executeAddTagAction(actionPayload, contactPhone, correlationId);
            case "START_FLOW":
                return await this.executeStartFlowAction(actionPayload, contactPhone, credentials, correlationId);
            case "ASSIGN_TO_AGENT":
                return await this.executeAssignToAgentAction(actionPayload, contactPhone, correlationId);
            default:
                throw new Error(`Unknown action type: ${actionType}`);
        }
    }
    /**
     * Execute SEND_TEMPLATE action
     */
    async executeSendTemplateAction(payload, contactPhone, credentials, correlationId) {
        try {
            const { templateId, templateName, parameters } = payload;
            let messageContent;
            if (templateId) {
                // Find template by ID and process it
                const template = await prisma_1.prisma.template.findUnique({
                    where: { id: templateId },
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
                });
                if (!template) {
                    throw new Error(`Template not found: ${templateId}`);
                }
                messageContent = await this.processTemplateForAction(template, parameters);
            }
            else if (templateName) {
                // Use WhatsApp official template by name
                messageContent = {
                    type: "template",
                    template: {
                        name: templateName,
                        language: { code: "pt_BR" },
                        components: parameters || [],
                    },
                };
            }
            else {
                throw new Error("Either templateId or templateName must be provided");
            }
            const messageId = await whatsappApiManager.sendMessage(contactPhone, messageContent, credentials, "template-action", correlationId);
            console.log(`[Button Processor] Template sent successfully`, {
                correlationId,
                templateId,
                templateName,
                messageId,
            });
            return { messageId };
        }
        catch (error) {
            console.error("[Button Processor] Error executing SEND_TEMPLATE action:", error);
            throw error;
        }
    }
    /**
     * Execute ADD_TAG action
     */
    async executeAddTagAction(payload, contactPhone, correlationId) {
        try {
            const { tags, leadSource } = payload;
            if (!Array.isArray(tags) || tags.length === 0) {
                throw new Error("Tags array is required for ADD_TAG action");
            }
            // Find lead by contact phone and source
            const lead = await prisma_1.prisma.lead.findFirst({
                where: {
                    phone: contactPhone,
                    source: leadSource || "CHATWIT_OAB",
                },
            });
            if (lead) {
                // Add tags to existing lead
                const updatedTags = [...new Set([...lead.tags, ...tags])];
                await prisma_1.prisma.lead.update({
                    where: { id: lead.id },
                    data: { tags: updatedTags },
                });
                console.log(`[Button Processor] Tags added to lead: ${lead.id}`, {
                    correlationId,
                    addedTags: tags,
                    totalTags: updatedTags.length,
                });
            }
            else {
                console.log(`[Button Processor] Lead not found for tagging`, {
                    correlationId,
                    contactPhone,
                    leadSource,
                });
            }
            return {};
        }
        catch (error) {
            console.error("[Button Processor] Error executing ADD_TAG action:", error);
            throw error;
        }
    }
    /**
     * Execute START_FLOW action
     */
    async executeStartFlowAction(payload, contactPhone, credentials, correlationId) {
        try {
            const { flowId, flowCta, flowMode, flowData } = payload;
            if (!flowId) {
                throw new Error("Flow ID is required for START_FLOW action");
            }
            const messageContent = {
                type: "interactive",
                interactive: {
                    type: "flow",
                    action: {
                        name: "flow",
                        parameters: {
                            flow_message_version: "3",
                            flow_token: correlationId,
                            flow_id: flowId,
                            flow_cta: flowCta || "Continuar",
                            flow_action: "navigate",
                            flow_action_payload: {
                                screen: "WELCOME",
                                data: flowData || {},
                            },
                            mode: flowMode || "published",
                        },
                    },
                },
            };
            const messageId = await whatsappApiManager.sendMessage(contactPhone, messageContent, credentials, "flow-action", correlationId);
            console.log(`[Button Processor] Flow started successfully`, {
                correlationId,
                flowId,
                messageId,
            });
            return { messageId };
        }
        catch (error) {
            console.error("[Button Processor] Error executing START_FLOW action:", error);
            throw error;
        }
    }
    /**
     * Execute ASSIGN_TO_AGENT action
     */
    async executeAssignToAgentAction(payload, contactPhone, correlationId) {
        try {
            const { agentId, message } = payload;
            // This would typically integrate with your agent assignment system
            // For now, we'll just log the assignment
            console.log(`[Button Processor] Lead assigned to agent`, {
                correlationId,
                contactPhone,
                agentId,
                message,
            });
            // You could also send a notification message to the user
            // or update the lead status in the database
            return {};
        }
        catch (error) {
            console.error("[Button Processor] Error executing ASSIGN_TO_AGENT action:", error);
            throw error;
        }
    }
    /**
     * Process template for action execution
     */
    async processTemplateForAction(template, parameters) {
        try {
            switch (template.type) {
                case "WHATSAPP_OFFICIAL":
                    if (template.whatsappOfficialInfo) {
                        return {
                            type: "template",
                            template: {
                                name: template.whatsappOfficialInfo.metaTemplateId,
                                language: { code: template.language || "pt_BR" },
                                components: parameters || template.whatsappOfficialInfo.components || [],
                            },
                        };
                    }
                    break;
                case "INTERACTIVE_MESSAGE":
                    if (template.interactiveContent) {
                        return {
                            type: "interactive",
                            interactive: template.interactiveContent,
                        };
                    }
                    break;
                case "AUTOMATION_REPLY":
                    if (template.simpleReplyText) {
                        return {
                            type: "text",
                            text: {
                                body: template.simpleReplyText,
                            },
                        };
                    }
                    break;
            }
            throw new Error(`Unable to process template type: ${template.type}`);
        }
        catch (error) {
            console.error("[Button Processor] Error processing template for action:", error);
            throw error;
        }
    }
    /**
     * Emoji reaction sending with message ID validation
     * Requirement: 5.1
     */
    async handleEmojiReactionFallback(buttonId, contactPhone, wamid, credentials, correlationId, startTime) {
        try {
            console.log(`[Button Processor] Applying emoji reaction fallback for button: ${buttonId}`, {
                correlationId,
                wamid,
            });
            // Try to get emoji mapping from config or database
            const emoji = await this.getEmojiForButton(buttonId);
            if (emoji) {
                // Send emoji reaction
                const messageContent = {
                    type: "reaction",
                    reaction: {
                        message_id: wamid,
                        emoji: emoji,
                    },
                };
                const messageId = await whatsappApiManager.sendMessage(contactPhone, messageContent, credentials, "template-action", correlationId);
                const processingTime = Date.now() - startTime;
                console.log(`[Button Processor] Emoji reaction sent: ${emoji}`, {
                    correlationId,
                    buttonId,
                    messageId,
                });
                return {
                    success: true,
                    messageId,
                    processingTime,
                    correlationId,
                };
            }
            else {
                // Send text reaction as fallback
                return await this.handleTextReactionFallback(buttonId, contactPhone, wamid, credentials, correlationId, startTime);
            }
        }
        catch (error) {
            const processingTime = Date.now() - startTime;
            const errorMessage = error instanceof Error ? error.message : "Unknown error";
            return {
                success: false,
                error: `Emoji reaction fallback failed: ${errorMessage}`,
                processingTime,
                correlationId,
            };
        }
    }
    /**
     * Text reaction processing with reply-to functionality
     * Requirement: 5.1
     */
    async handleTextReactionFallback(buttonId, contactPhone, wamid, credentials, correlationId, startTime) {
        try {
            console.log(`[Button Processor] Applying text reaction fallback for button: ${buttonId}`, {
                correlationId,
                wamid,
            });
            // Generate a contextual text response
            const textResponse = this.generateTextResponseForButton(buttonId);
            const messageContent = {
                type: "text",
                text: {
                    body: textResponse,
                },
                context: {
                    message_id: wamid, // Reply to the original message
                },
            };
            const messageId = await whatsappApiManager.sendMessage(contactPhone, messageContent, credentials, "text-reaction", correlationId);
            const processingTime = Date.now() - startTime;
            console.log(`[Button Processor] Text reaction sent`, {
                correlationId,
                buttonId,
                messageId,
                textResponse,
            });
            return {
                success: true,
                messageId,
                processingTime,
                correlationId,
            };
        }
        catch (error) {
            const processingTime = Date.now() - startTime;
            const errorMessage = error instanceof Error ? error.message : "Unknown error";
            return {
                success: false,
                error: `Text reaction fallback failed: ${errorMessage}`,
                processingTime,
                correlationId,
            };
        }
    }
    /**
     * Get emoji for button from config or database
     */
    async getEmojiForButton(buttonId) {
        try {
            // Try database first
            const reaction = await prisma_1.prisma.mapeamentoBotao.findFirst({
                where: {
                    buttonId,
                    actionType: "SEND_TEMPLATE",
                },
            });
            if (reaction && reaction.actionPayload && typeof reaction.actionPayload === 'object' && 'emoji' in reaction.actionPayload) {
                return reaction.actionPayload.emoji;
            }
            // Fallback to config-based mapping
            const emojiMap = {
                like: "👍",
                love: "❤️",
                laugh: "😂",
                wow: "😮",
                sad: "😢",
                angry: "😡",
                thanks: "🙏",
                ok: "👌",
                yes: "✅",
                no: "❌",
            };
            // Try to match button ID with emoji mapping
            const lowerButtonId = buttonId.toLowerCase();
            for (const [key, emoji] of Object.entries(emojiMap)) {
                if (lowerButtonId.includes(key)) {
                    return emoji;
                }
            }
            return null;
        }
        catch (error) {
            console.error("[Button Processor] Error getting emoji for button:", error);
            return null;
        }
    }
    /**
     * Generate contextual text response for button
     */
    generateTextResponseForButton(buttonId) {
        const responses = {
            like: "Obrigado pelo feedback positivo! 👍",
            love: "Ficamos felizes que tenha gostado! ❤️",
            help: "Como posso ajudá-lo?",
            info: "Aqui estão as informações solicitadas.",
            contact: "Nossa equipe entrará em contato em breve.",
            schedule: "Vamos agendar um horário para você.",
            default: "Recebemos sua resposta. Obrigado!",
        };
        const lowerButtonId = buttonId.toLowerCase();
        for (const [key, response] of Object.entries(responses)) {
            if (lowerButtonId.includes(key)) {
                return response;
            }
        }
        return responses.default;
    }
}
// ============================================================================
// WHATSAPP API INTEGRATION WITH CREDENTIAL MANAGEMENT (Subtask 3.3)
// ============================================================================
class WhatsAppApiManager {
    /**
     * Enhanced WhatsApp message sending with credential management
     * Requirements: 1.4, 2.4, 2.5
     */
    async sendMessage(contactPhone, messageContent, payloadCredentials, inboxId, correlationId) {
        try {
            console.log(`[WhatsApp API] Sending message`, {
                correlationId,
                contactPhone,
                messageType: messageContent.type,
                inboxId,
            });
            // 1. Use credentials from job payload as primary source
            let credentials = payloadCredentials;
            // 2. Implement credential fallback logic when payload credentials are missing
            if (!this.areCredentialsValid(credentials)) {
                console.log(`[WhatsApp API] Payload credentials invalid, using fallback`, {
                    correlationId,
                    inboxId,
                });
                credentials = await this.getCredentialsWithFallback(inboxId);
            }
            // 3. Validate final credentials
            if (!this.areCredentialsValid(credentials)) {
                throw new Error("No valid WhatsApp credentials available");
            }
            // 4. Send message with comprehensive error handling and retry logic
            const messageId = await this.sendWithRetry(contactPhone, messageContent, credentials, correlationId);
            console.log(`[WhatsApp API] Message sent successfully`, {
                correlationId,
                messageId,
                credentialsSource: payloadCredentials.token ? "payload" : "fallback",
            });
            return messageId;
        }
        catch (error) {
            console.error(`[WhatsApp API] Failed to send message`, {
                correlationId,
                error: error instanceof Error ? error.message : error,
            });
            throw error;
        }
    }
    /**
     * Validate if credentials are complete and valid
     */
    areCredentialsValid(credentials) {
        return !!(credentials &&
            credentials.token &&
            credentials.phoneNumberId &&
            credentials.businessId &&
            credentials.token.trim() !== "" &&
            credentials.phoneNumberId.trim() !== "" &&
            credentials.businessId.trim() !== "");
    }
    /**
     * Get credentials with fallback logic when payload credentials are missing
     * Requirement: 2.4, 2.5
     */
    async getCredentialsWithFallback(inboxId) {
        try {
            console.log(`[WhatsApp API] Getting credentials with fallback for inbox: ${inboxId}`);
            // Step 1: Try to get credentials from ChatwitInbox
            const inboxCredentials = await this.getInboxCredentials(inboxId);
            if (inboxCredentials && this.areCredentialsValid(inboxCredentials)) {
                console.log(`[WhatsApp API] Using inbox-specific credentials`);
                return inboxCredentials;
            }
            // Step 2: Try fallback chain (if configured)
            const fallbackCredentials = await this.getFallbackCredentials(inboxId);
            if (fallbackCredentials &&
                this.areCredentialsValid(fallbackCredentials)) {
                console.log(`[WhatsApp API] Using fallback credentials`);
                return fallbackCredentials;
            }
            // Step 3: Use global configuration as last resort
            const globalCredentials = await this.getGlobalCredentials(inboxId);
            if (globalCredentials && this.areCredentialsValid(globalCredentials)) {
                console.log(`[WhatsApp API] Using global credentials`);
                return globalCredentials;
            }
            throw new Error("No valid credentials found in fallback chain");
        }
        catch (error) {
            console.error(`[WhatsApp API] Error in credential fallback:`, error);
            throw error;
        }
    }
    /**
     * Get credentials from ChatwitInbox
     */
    async getInboxCredentials(inboxId) {
        try {
            const inbox = await prisma_1.prisma.chatwitInbox.findFirst({
                where: {
                    inboxId: inboxId,
                },
            });
            if (!inbox ||
                !inbox.whatsappApiKey ||
                !inbox.phoneNumberId ||
                !inbox.whatsappBusinessAccountId) {
                return null;
            }
            return {
                token: inbox.whatsappApiKey,
                phoneNumberId: inbox.phoneNumberId,
                businessId: inbox.whatsappBusinessAccountId,
            };
        }
        catch (error) {
            console.error(`[WhatsApp API] Error getting inbox credentials:`, error);
            return null;
        }
    }
    /**
     * Get credentials from fallback chain with loop detection
     */
    async getFallbackCredentials(inboxId, visited = new Set(), depth = 0) {
        const MAX_FALLBACK_DEPTH = 5;
        // Protect against infinite loops and excessive depth
        if (visited.has(inboxId) || depth >= MAX_FALLBACK_DEPTH) {
            console.warn(`[WhatsApp API] Fallback loop detected or max depth reached`, {
                inboxId,
                depth,
                visited: Array.from(visited),
            });
            return null;
        }
        visited.add(inboxId);
        try {
            const inbox = await prisma_1.prisma.chatwitInbox.findFirst({
                where: {
                    inboxId: inboxId,
                },
                include: {
                    fallbackParaInbox: true,
                },
            });
            if (!inbox || !inbox.fallbackParaInbox) {
                return null;
            }
            // Check if fallback inbox has valid credentials
            const fallbackInbox = inbox.fallbackParaInbox;
            if (fallbackInbox.whatsappApiKey &&
                fallbackInbox.phoneNumberId &&
                fallbackInbox.whatsappBusinessAccountId) {
                return {
                    token: fallbackInbox.whatsappApiKey,
                    phoneNumberId: fallbackInbox.phoneNumberId,
                    businessId: fallbackInbox.whatsappBusinessAccountId,
                };
            }
            // Recursively check the fallback chain
            return await this.getFallbackCredentials(fallbackInbox.inboxId, visited, depth + 1);
        }
        catch (error) {
            console.error(`[WhatsApp API] Error in fallback chain:`, error);
            return null;
        }
    }
    /**
     * Get global credentials as last resort
     */
    async getGlobalCredentials(inboxId) {
        try {
            // Find the ChatwitInbox to get the user
            const inbox = await prisma_1.prisma.chatwitInbox.findFirst({
                where: {
                    inboxId: inboxId,
                },
                include: {
                    usuarioChatwit: {
                        include: {
                            configuracaoGlobalWhatsApp: true,
                        },
                    },
                },
            });
            if (!inbox?.usuarioChatwit?.configuracaoGlobalWhatsApp) {
                return null;
            }
            const globalConfig = inbox.usuarioChatwit.configuracaoGlobalWhatsApp;
            return {
                token: globalConfig.whatsappApiKey,
                phoneNumberId: globalConfig.phoneNumberId,
                businessId: globalConfig.whatsappBusinessAccountId,
            };
        }
        catch (error) {
            console.error(`[WhatsApp API] Error getting global credentials:`, error);
            return null;
        }
    }
    /**
     * Send message with comprehensive API error handling and retry logic
     * Requirement: 1.4
     */
    async sendWithRetry(contactPhone, messageContent, credentials, correlationId, maxRetries = 3) {
        let lastError = null;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                console.log(`[WhatsApp API] Sending message attempt ${attempt}/${maxRetries}`, {
                    correlationId,
                    contactPhone,
                });
                const messageId = await this.sendMessageToApi(contactPhone, messageContent, credentials);
                if (attempt > 1) {
                    console.log(`[WhatsApp API] Message sent successfully on retry attempt ${attempt}`, {
                        correlationId,
                        messageId,
                    });
                }
                return messageId;
            }
            catch (error) {
                lastError = error instanceof Error ? error : new Error("Unknown error");
                console.error(`[WhatsApp API] Attempt ${attempt} failed`, {
                    correlationId,
                    error: lastError.message,
                    willRetry: attempt < maxRetries,
                });
                // Check if error is retryable
                if (!this.isRetryableError(lastError) || attempt === maxRetries) {
                    break;
                }
                // Wait before retry with exponential backoff
                const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
                await new Promise((resolve) => setTimeout(resolve, delay));
            }
        }
        throw lastError || new Error("All retry attempts failed");
    }
    /**
     * Check if error is retryable
     */
    isRetryableError(error) {
        const retryableErrors = [
            "ECONNRESET",
            "ENOTFOUND",
            "ECONNREFUSED",
            "ETIMEDOUT",
            "Rate limit",
            "Service unavailable",
            "Internal server error",
        ];
        const errorMessage = error.message.toLowerCase();
        return retryableErrors.some((retryableError) => errorMessage.includes(retryableError.toLowerCase()));
    }
    /**
     * Send message to WhatsApp API
     */
    async sendMessageToApi(contactPhone, messageContent, credentials) {
        try {
            const url = `https://graph.facebook.com/v22.0/${credentials.phoneNumberId}/messages`;
            const payload = {
                messaging_product: "whatsapp",
                to: contactPhone,
                ...messageContent,
            };
            const response = await fetch(url, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${credentials.token}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(payload),
                // Add timeout to prevent hanging requests
                signal: AbortSignal.timeout(30000), // 30 seconds timeout
            });
            if (!response.ok) {
                const errorData = await response.text();
                // Parse WhatsApp API error for better error handling
                let errorMessage = `HTTP ${response.status}`;
                try {
                    const errorJson = JSON.parse(errorData);
                    if (errorJson.error?.message) {
                        errorMessage = errorJson.error.message;
                    }
                }
                catch {
                    errorMessage = errorData || errorMessage;
                }
                throw new Error(`WhatsApp API error: ${errorMessage}`);
            }
            const result = await response.json();
            if (result.messages && result.messages[0]?.id) {
                return result.messages[0].id;
            }
            throw new Error("No message ID returned from WhatsApp API");
        }
        catch (error) {
            if (error instanceof Error && error.name === "AbortError") {
                throw new Error("WhatsApp API request timeout");
            }
            throw error;
        }
    }
    /**
     * Add phone number ID resolution from database when needed
     * Requirement: 2.5
     */
    async resolvePhoneNumberId(inboxId, fallbackPhoneNumberId) {
        try {
            console.log(`[WhatsApp API] Resolving phone number ID for inbox: ${inboxId}`);
            // Try to get from ChatwitInbox first
            const inbox = await prisma_1.prisma.chatwitInbox.findFirst({
                where: {
                    inboxId: inboxId,
                },
            });
            if (inbox?.phoneNumberId) {
                console.log(`[WhatsApp API] Found phone number ID in inbox: ${inbox.phoneNumberId}`);
                return inbox.phoneNumberId;
            }
            // Try fallback chain
            const fallbackCredentials = await this.getFallbackCredentials(inboxId);
            if (fallbackCredentials?.phoneNumberId) {
                console.log(`[WhatsApp API] Found phone number ID in fallback: ${fallbackCredentials.phoneNumberId}`);
                return fallbackCredentials.phoneNumberId;
            }
            // Try global config
            const globalCredentials = await this.getGlobalCredentials(inboxId);
            if (globalCredentials?.phoneNumberId) {
                console.log(`[WhatsApp API] Found phone number ID in global config: ${globalCredentials.phoneNumberId}`);
                return globalCredentials.phoneNumberId;
            }
            // Use provided fallback
            if (fallbackPhoneNumberId) {
                console.log(`[WhatsApp API] Using provided fallback phone number ID: ${fallbackPhoneNumberId}`);
                return fallbackPhoneNumberId;
            }
            console.log(`[WhatsApp API] No phone number ID found for inbox: ${inboxId}`);
            return null;
        }
        catch (error) {
            console.error(`[WhatsApp API] Error resolving phone number ID:`, error);
            return fallbackPhoneNumberId || null;
        }
    }
}
// ============================================================================
// WORKER INITIALIZATION
// ============================================================================
const intentProcessor = new IntentProcessor();
const buttonProcessor = new ButtonProcessor();
const whatsappApiManager = new WhatsAppApiManager();
// Create the high priority worker
exports.respostaRapidaWorker = new bullmq_1.Worker(resposta_rapida_queue_1.RESPOSTA_RAPIDA_QUEUE_NAME, async (job) => {
    const { data } = job.data;
    const startTime = Date.now();
    console.log(`[Resposta Rapida Worker] Processing job: ${job.name}`, {
        correlationId: data.correlationId,
        interactionType: data.interactionType,
        jobId: job.id,
    });
    try {
        let result;
        // Route to appropriate processor based on interaction type
        if (data.interactionType === "intent") {
            if (!data.intentName) {
                throw new Error("Intent name is required for intent processing");
            }
            result = await intentProcessor.processIntent(data.intentName, data.inboxId, data.credentials, data.contactPhone, data.wamid, data.correlationId);
        }
        else if (data.interactionType === "button_reply") {
            if (!data.buttonId) {
                throw new Error("Button ID is required for button processing");
            }
            result = await buttonProcessor.processButtonClick(data.buttonId, data.inboxId, data.credentials, data.contactPhone, data.wamid, data.correlationId);
        }
        else {
            throw new Error(`Unknown interaction type: ${data.interactionType}`);
        }
        const totalProcessingTime = Date.now() - startTime;
        console.log(`[Resposta Rapida Worker] Job completed successfully: ${job.name}`, {
            correlationId: data.correlationId,
            success: result.success,
            messageId: result.messageId,
            processingTime: totalProcessingTime,
        });
        return result;
    }
    catch (error) {
        const totalProcessingTime = Date.now() - startTime;
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        console.error(`[Resposta Rapida Worker] Job failed: ${job.name}`, {
            correlationId: data.correlationId,
            error: errorMessage,
            processingTime: totalProcessingTime,
            jobId: job.id,
        });
        // Handle job failure
        await (0, resposta_rapida_queue_1.handleJobFailure)(job, error instanceof Error ? error : new Error(errorMessage));
        throw error;
    }
}, {
    connection: redis_1.connection,
    concurrency: 5, // Process up to 5 jobs concurrently
});
// Worker event handlers
exports.respostaRapidaWorker.on("completed", (job, result) => {
    console.log(`[Resposta Rapida Worker] Job completed: ${job.id}`, {
        correlationId: job.data.data.correlationId,
        result: result.success ? "success" : "failed",
    });
});
exports.respostaRapidaWorker.on("failed", (job, err) => {
    console.error(`[Resposta Rapida Worker] Job failed: ${job?.id}`, {
        correlationId: job?.data.data.correlationId,
        error: err.message,
    });
});
exports.respostaRapidaWorker.on("error", (err) => {
    console.error("[Resposta Rapida Worker] Worker error:", err);
});
console.log("[Resposta Rapida Worker] Worker initialized and ready to process jobs");
// ============================================================================
// EXPORT FOR PARENT WORKER DELEGATION
// ============================================================================
/**
 * Export the task processing function for Parent Worker delegation
 * This function will be called by the Parent Worker to process high priority jobs
 */
async function processRespostaRapidaTask(job) {
    const startTime = perf_hooks_1.performance.now();
    const { type, data } = job.data;
    let success = false;
    let error;
    console.log(`[Resposta Rapida Task] Processing job: ${job.name}`, {
        jobId: job.id,
        type,
        correlationId: data.correlationId,
        interactionType: data.interactionType,
        contactPhone: data.contactPhone,
        inboxId: data.inboxId,
    });
    try {
        // Validate job type
        if (type !== 'processarResposta') {
            throw new Error(`Invalid job type: ${type}`);
        }
        // Process based on interaction type
        let result;
        if (data.interactionType === 'intent' && data.intentName) {
            const intentProcessor = new IntentProcessor();
            result = await intentProcessor.processIntent(data.intentName, data.inboxId, {
                token: data.credentials.token,
                phoneNumberId: data.credentials.phoneNumberId,
                businessId: data.credentials.businessId,
            }, data.contactPhone, data.wamid, data.correlationId);
        }
        else if (data.interactionType === 'button_reply' && data.buttonId) {
            const buttonProcessor = new ButtonProcessor();
            result = await buttonProcessor.processButtonClick(data.buttonId, data.inboxId, {
                token: data.credentials.token,
                phoneNumberId: data.credentials.phoneNumberId,
                businessId: data.credentials.businessId,
            }, data.contactPhone, data.wamid, data.correlationId);
        }
        else {
            throw new Error(`Invalid interaction type or missing required data: ${data.interactionType}`);
        }
        // Record successful worker metrics
        success = result.success;
        error = result.error;
        (0, application_performance_monitor_1.recordWorkerMetrics)({
            jobId: job.id || 'unknown',
            jobType: `resposta-rapida-${data.interactionType}`,
            processingTime: perf_hooks_1.performance.now() - startTime,
            queueWaitTime: job.processedOn && job.timestamp ? job.processedOn - job.timestamp : 0,
            success: result.success,
            error: result.error,
            timestamp: new Date(),
            correlationId: data.correlationId,
            retryCount: job.attemptsMade || 0,
        });
        return result;
    }
    catch (error) {
        const processingTime = perf_hooks_1.performance.now() - startTime;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`[Resposta Rapida Task] Job processing failed: ${job.name}`, {
            jobId: job.id,
            correlationId: data.correlationId,
            error: errorMessage,
            processingTime,
        });
        // Record failed worker metrics
        (0, application_performance_monitor_1.recordWorkerMetrics)({
            jobId: job.id || 'unknown',
            jobType: `resposta-rapida-${data.interactionType}`,
            processingTime,
            queueWaitTime: job.processedOn && job.timestamp ? job.processedOn - job.timestamp : 0,
            success: false,
            error: errorMessage,
            timestamp: new Date(),
            correlationId: data.correlationId,
            retryCount: job.attemptsMade || 0,
        });
        return {
            success: false,
            error: errorMessage,
            processingTime,
            correlationId: data.correlationId,
        };
    }
}
