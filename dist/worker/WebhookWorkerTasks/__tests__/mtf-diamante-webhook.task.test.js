"use strict";
/**
 * Unit Tests for MTF Diamante Webhook Worker Tasks
 * Tests worker handlers to ensure they call correct library functions
 * Requirements: 2.1, 2.2, 2.3
 */
Object.defineProperty(exports, "__esModule", { value: true });
const mtf_diamante_webhook_task_1 = require("../mtf-diamante-webhook.task");
// Mock dependencies
jest.mock('@/lib/prisma', () => ({
    prisma: {
        webhookMessage: {
            create: jest.fn()
        },
        caixaEntrada: {
            findFirst: jest.fn()
        },
        whatsAppConfig: {
            upsert: jest.fn()
        },
        dialogflowIntent: {
            create: jest.fn()
        }
    }
}));
jest.mock('@/lib/whatsapp-messages', () => ({
    sendTemplateMessage: jest.fn(),
    sendInteractiveMessage: jest.fn()
}));
jest.mock('@/lib/whatsapp-reactions', () => ({
    sendReactionMessage: jest.fn(),
    logReactionAttempt: jest.fn()
}));
// Import mocked modules
const whatsapp_messages_1 = require("@/lib/whatsapp-messages");
const whatsapp_reactions_1 = require("@/lib/whatsapp-reactions");
describe('MTF Diamante Webhook Worker Tasks', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });
    describe('processSendMessage - Template Messages', () => {
        it('should process template message task successfully', async () => {
            const templateTask = {
                type: 'sendMessage',
                recipientPhone: '5511999999999',
                whatsappApiKey: 'test-api-key',
                correlationId: 'test-correlation-id',
                messageData: {
                    type: 'template',
                    templateId: 'welcome_template',
                    templateName: 'welcome',
                    variables: {
                        name: 'João',
                        phone: '11999999999'
                    }
                },
                metadata: {
                    intentName: 'welcome',
                    caixaId: 'test-caixa-id'
                }
            };
            const mockJob = {
                id: 'test-job-id',
                data: templateTask
            };
            // Mock successful WhatsApp API response
            whatsapp_messages_1.sendTemplateMessage.mockResolvedValue({
                success: true,
                messageId: 'wamid.test123',
                details: { status: 'sent' }
            });
            const result = await (0, mtf_diamante_webhook_task_1.processMtfDiamanteWebhookTask)(mockJob);
            expect(result).toEqual({
                success: true,
                type: 'sendMessage'
            });
            expect(whatsapp_messages_1.sendTemplateMessage).toHaveBeenCalledWith({
                recipientPhone: '5511999999999',
                templateId: 'welcome_template',
                templateName: 'welcome',
                variables: {
                    name: 'João',
                    phone: '11999999999'
                },
                whatsappApiKey: 'test-api-key',
                language: 'pt_BR'
            }, [] // Empty template components for this test
            );
        });
        it('should handle template message validation errors', async () => {
            const invalidTemplateTask = {
                type: 'sendMessage',
                recipientPhone: '5511999999999',
                whatsappApiKey: 'test-api-key',
                messageData: {
                    type: 'template'
                    // Missing required templateId and templateName
                }
            };
            const mockJob = {
                id: 'test-job-id',
                data: invalidTemplateTask
            };
            await expect((0, mtf_diamante_webhook_task_1.processMtfDiamanteWebhookTask)(mockJob)).rejects.toThrow('Template ID and name are required for template messages');
            expect(whatsapp_messages_1.sendTemplateMessage).not.toHaveBeenCalled();
        });
        it('should handle WhatsApp API failures for template messages', async () => {
            const templateTask = {
                type: 'sendMessage',
                recipientPhone: '5511999999999',
                whatsappApiKey: 'test-api-key',
                messageData: {
                    type: 'template',
                    templateId: 'welcome_template',
                    templateName: 'welcome'
                }
            };
            const mockJob = {
                id: 'test-job-id',
                data: templateTask
            };
            // Mock WhatsApp API failure
            whatsapp_messages_1.sendTemplateMessage.mockResolvedValue({
                success: false,
                error: 'Template not found',
                details: { error_code: 132000 }
            });
            await expect((0, mtf_diamante_webhook_task_1.processMtfDiamanteWebhookTask)(mockJob)).rejects.toThrow('Message sending failed: Template not found');
        });
    });
    describe('processSendMessage - Interactive Messages', () => {
        it('should process interactive message task successfully', async () => {
            const interactiveTask = {
                type: 'sendMessage',
                recipientPhone: '5511999999999',
                whatsappApiKey: 'test-api-key',
                correlationId: 'test-correlation-id',
                messageData: {
                    type: 'interactive',
                    interactiveContent: {
                        body: 'Escolha uma opção:',
                        footer: 'Powered by ChatWit',
                        buttons: [
                            { id: 'option1', title: 'Opção 1' },
                            { id: 'option2', title: 'Opção 2' }
                        ]
                    }
                },
                metadata: {
                    intentName: 'menu',
                    caixaId: 'test-caixa-id'
                }
            };
            const mockJob = {
                id: 'test-job-id',
                data: interactiveTask
            };
            // Mock successful WhatsApp API response
            whatsapp_messages_1.sendInteractiveMessage.mockResolvedValue({
                success: true,
                messageId: 'wamid.interactive123',
                details: { status: 'sent' }
            });
            const result = await (0, mtf_diamante_webhook_task_1.processMtfDiamanteWebhookTask)(mockJob);
            expect(result).toEqual({
                success: true,
                type: 'sendMessage'
            });
            expect(whatsapp_messages_1.sendInteractiveMessage).toHaveBeenCalledWith({
                recipientPhone: '5511999999999',
                whatsappApiKey: 'test-api-key',
                header: undefined,
                body: 'Escolha uma opção:',
                footer: 'Powered by ChatWit',
                action: {
                    type: 'buttons',
                    data: {
                        buttons: [
                            { id: 'option1', title: 'Opção 1' },
                            { id: 'option2', title: 'Opção 2' }
                        ]
                    }
                }
            });
        });
        it('should process interactive list message successfully', async () => {
            const listTask = {
                type: 'sendMessage',
                recipientPhone: '5511999999999',
                whatsappApiKey: 'test-api-key',
                messageData: {
                    type: 'interactive',
                    interactiveContent: {
                        body: 'Selecione um produto:',
                        buttonText: 'Ver Produtos',
                        listSections: [
                            {
                                title: 'Produtos Disponíveis',
                                rows: [
                                    { id: 'product1', title: 'Produto 1', description: 'Descrição do produto 1' },
                                    { id: 'product2', title: 'Produto 2', description: 'Descrição do produto 2' }
                                ]
                            }
                        ]
                    }
                }
            };
            const mockJob = {
                id: 'test-job-id',
                data: listTask
            };
            whatsapp_messages_1.sendInteractiveMessage.mockResolvedValue({
                success: true,
                messageId: 'wamid.list123'
            });
            const result = await (0, mtf_diamante_webhook_task_1.processMtfDiamanteWebhookTask)(mockJob);
            expect(result).toEqual({
                success: true,
                type: 'sendMessage'
            });
            expect(whatsapp_messages_1.sendInteractiveMessage).toHaveBeenCalledWith({
                recipientPhone: '5511999999999',
                whatsappApiKey: 'test-api-key',
                header: undefined,
                body: 'Selecione um produto:',
                footer: undefined,
                action: {
                    type: 'list',
                    data: {
                        buttonText: 'Ver Produtos',
                        sections: [
                            {
                                title: 'Produtos Disponíveis',
                                rows: [
                                    { id: 'product1', title: 'Produto 1', description: 'Descrição do produto 1' },
                                    { id: 'product2', title: 'Produto 2', description: 'Descrição do produto 2' }
                                ]
                            }
                        ]
                    }
                }
            });
        });
        it('should handle interactive message validation errors', async () => {
            const invalidInteractiveTask = {
                type: 'sendMessage',
                recipientPhone: '5511999999999',
                whatsappApiKey: 'test-api-key',
                messageData: {
                    type: 'interactive',
                    interactiveContent: {
                        // Missing required body
                        buttons: [{ id: 'test', title: 'Test' }]
                    }
                }
            };
            const mockJob = {
                id: 'test-job-id',
                data: invalidInteractiveTask
            };
            await expect((0, mtf_diamante_webhook_task_1.processMtfDiamanteWebhookTask)(mockJob)).rejects.toThrow('Body text is required for interactive messages');
            expect(whatsapp_messages_1.sendInteractiveMessage).not.toHaveBeenCalled();
        });
    });
    describe('processSendReaction', () => {
        it('should process reaction task successfully', async () => {
            const reactionTask = {
                type: 'sendReaction',
                recipientPhone: '5511999999999',
                messageId: 'wamid.original123',
                emoji: '👍',
                whatsappApiKey: 'test-api-key',
                correlationId: 'test-correlation-id',
                metadata: {
                    buttonId: 'like_button'
                }
            };
            const mockJob = {
                id: 'test-job-id',
                data: reactionTask
            };
            // Mock successful WhatsApp API response
            whatsapp_reactions_1.sendReactionMessage.mockResolvedValue({
                success: true,
                messageId: 'wamid.reaction123'
            });
            whatsapp_reactions_1.logReactionAttempt.mockResolvedValue(undefined);
            const result = await (0, mtf_diamante_webhook_task_1.processMtfDiamanteWebhookTask)(mockJob);
            expect(result).toEqual({
                success: true,
                type: 'sendReaction'
            });
            expect(whatsapp_reactions_1.sendReactionMessage).toHaveBeenCalledWith({
                recipientPhone: '5511999999999',
                messageId: 'wamid.original123',
                emoji: '👍',
                whatsappApiKey: 'test-api-key'
            });
            expect(whatsapp_reactions_1.logReactionAttempt).toHaveBeenCalledWith({
                recipientPhone: '5511999999999',
                messageId: 'wamid.original123',
                emoji: '👍',
                buttonId: 'like_button',
                success: true,
                error: undefined
            });
        });
        it('should handle reaction validation errors', async () => {
            const invalidReactionTask = {
                type: 'sendReaction',
                recipientPhone: '5511999999999',
                messageId: 'wamid.original123',
                emoji: '', // Invalid empty emoji
                whatsappApiKey: 'test-api-key'
            };
            const mockJob = {
                id: 'test-job-id',
                data: invalidReactionTask
            };
            await expect((0, mtf_diamante_webhook_task_1.processMtfDiamanteWebhookTask)(mockJob)).rejects.toThrow('Invalid emoji format: emoji must be 1-10 characters');
            expect(whatsapp_reactions_1.sendReactionMessage).not.toHaveBeenCalled();
        });
        it('should handle WhatsApp API failures for reactions', async () => {
            const reactionTask = {
                type: 'sendReaction',
                recipientPhone: '5511999999999',
                messageId: 'wamid.original123',
                emoji: '👍',
                whatsappApiKey: 'test-api-key'
            };
            const mockJob = {
                id: 'test-job-id',
                data: reactionTask
            };
            // Mock WhatsApp API failure
            whatsapp_reactions_1.sendReactionMessage.mockResolvedValue({
                success: false,
                error: 'Message not found'
            });
            whatsapp_reactions_1.logReactionAttempt.mockResolvedValue(undefined);
            await expect((0, mtf_diamante_webhook_task_1.processMtfDiamanteWebhookTask)(mockJob)).rejects.toThrow('Reaction sending failed: Message not found');
            expect(whatsapp_reactions_1.logReactionAttempt).toHaveBeenCalledWith({
                recipientPhone: '5511999999999',
                messageId: 'wamid.original123',
                emoji: '👍',
                buttonId: 'unknown',
                success: false,
                error: 'Message not found'
            });
        });
        it('should continue processing even if logging fails', async () => {
            const reactionTask = {
                type: 'sendReaction',
                recipientPhone: '5511999999999',
                messageId: 'wamid.original123',
                emoji: '👍',
                whatsappApiKey: 'test-api-key'
            };
            const mockJob = {
                id: 'test-job-id',
                data: reactionTask
            };
            whatsapp_reactions_1.sendReactionMessage.mockResolvedValue({
                success: true,
                messageId: 'wamid.reaction123'
            });
            // Mock logging failure
            whatsapp_reactions_1.logReactionAttempt.mockRejectedValue(new Error('Logging service unavailable'));
            const result = await (0, mtf_diamante_webhook_task_1.processMtfDiamanteWebhookTask)(mockJob);
            expect(result).toEqual({
                success: true,
                type: 'sendReaction'
            });
            expect(whatsapp_reactions_1.sendReactionMessage).toHaveBeenCalled();
        });
    });
    describe('Task Input Validation', () => {
        it('should validate required fields for sendMessage tasks', async () => {
            const incompleteTask = {
                type: 'sendMessage',
                recipientPhone: '5511999999999'
                // Missing whatsappApiKey and messageData
            };
            const mockJob = {
                id: 'test-job-id',
                data: incompleteTask
            };
            await expect((0, mtf_diamante_webhook_task_1.processMtfDiamanteWebhookTask)(mockJob)).rejects.toThrow('Missing required task data: recipientPhone, whatsappApiKey, or messageData');
        });
        it('should validate required fields for sendReaction tasks', async () => {
            const incompleteTask = {
                type: 'sendReaction',
                recipientPhone: '5511999999999'
                // Missing messageId, emoji, and whatsappApiKey
            };
            const mockJob = {
                id: 'test-job-id',
                data: incompleteTask
            };
            await expect((0, mtf_diamante_webhook_task_1.processMtfDiamanteWebhookTask)(mockJob)).rejects.toThrow('Missing required task data: recipientPhone, messageId, emoji, or whatsappApiKey');
        });
    });
    describe('Legacy Task Processing', () => {
        it('should process legacy store_message task', async () => {
            const legacyTask = {
                type: 'store_message',
                payload: {
                    originalDetectIntentRequest: {
                        payload: {
                            wamid: 'wamid.test123',
                            message_id: 'msg123',
                            conversation_id: 'conv123',
                            inbox_id: 'inbox123',
                            contact_phone: '5511999999999',
                            whatsapp_api_key: 'test-api-key',
                            message_content: 'Hello',
                            message_content_type: 'text'
                        }
                    },
                    queryResult: {
                        intent: { displayName: 'greeting' }
                    }
                },
                messageId: 'msg123',
                conversationId: 'conv123',
                contactPhone: '5511999999999',
                whatsappApiKey: 'test-api-key',
                inboxId: 'inbox123'
            };
            const mockJob = {
                id: 'test-job-id',
                data: legacyTask
            };
            const result = await (0, mtf_diamante_webhook_task_1.processMtfDiamanteWebhookTask)(mockJob);
            expect(result).toEqual({
                success: true,
                type: 'store_message'
            });
        });
    });
    describe('Error Handling and Retry Logic', () => {
        it('should throw errors to trigger BullMQ retry mechanism', async () => {
            const templateTask = {
                type: 'sendMessage',
                recipientPhone: '5511999999999',
                whatsappApiKey: 'test-api-key',
                messageData: {
                    type: 'template',
                    templateId: 'test',
                    templateName: 'test'
                }
            };
            const mockJob = {
                id: 'test-job-id',
                data: templateTask
            };
            // Mock network error
            whatsapp_messages_1.sendTemplateMessage.mockRejectedValue(new Error('Network timeout'));
            await expect((0, mtf_diamante_webhook_task_1.processMtfDiamanteWebhookTask)(mockJob)).rejects.toThrow('Network timeout');
        });
        it('should handle unknown task types gracefully', async () => {
            const unknownTask = {
                type: 'unknown_type'
            };
            const mockJob = {
                id: 'test-job-id',
                data: unknownTask
            };
            await expect((0, mtf_diamante_webhook_task_1.processMtfDiamanteWebhookTask)(mockJob)).rejects.toThrow('Tipo de task desconhecido: unknown_type');
        });
    });
});
