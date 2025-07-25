"use strict";
/**
 * Unit Tests for Enhanced Button Reaction Processing
 * Tests the enhanced webhook processing for automatic reactions
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 6.1, 6.2, 6.3
 */
Object.defineProperty(exports, "__esModule", { value: true });
const mtf_diamante_webhook_task_1 = require("../mtf-diamante-webhook.task");
// Mock dependencies
jest.mock('@/lib/prisma', () => ({
    prisma: {
        buttonReactionMapping: {
            findUnique: jest.fn()
        },
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
jest.mock('@/lib/whatsapp-reactions', () => ({
    sendReactionMessage: jest.fn(),
    logReactionAttempt: jest.fn()
}));
jest.mock('@/lib/whatsapp-messages', () => ({
    sendTextMessage: jest.fn()
}));
jest.mock('@/lib/dialogflow-database-queries', () => ({
    findReactionByButtonId: jest.fn()
}));
// Import mocked modules
const prisma_1 = require("../../../lib/prisma");
const whatsapp_reactions_1 = require("../../../lib/whatsapp-reactions");
const whatsapp_messages_1 = require("../../../lib/whatsapp-messages");
const dialogflow_database_queries_1 = require("../../../lib/dialogflow-database-queries");
describe('Enhanced Button Reaction Processing', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });
    describe('Button Click Detection', () => {
        it('should detect button click from Dialogflow payload format', async () => {
            const buttonClickTask = {
                type: 'processButtonClick',
                payload: {
                    originalDetectIntentRequest: {
                        payload: {
                            wamid: 'wamid.test123',
                            message_id: 'msg123',
                            conversation_id: 'conv123',
                            inbox_id: 'inbox123',
                            contact_phone: '5511999999999',
                            whatsapp_api_key: 'test-api-key',
                            interactive: {
                                type: 'button_reply',
                                button_reply: {
                                    id: 'like_button',
                                    title: 'Like'
                                }
                            },
                            context: {
                                id: 'wamid.original123'
                            }
                        }
                    },
                    queryResult: {
                        intent: { displayName: 'button_click' }
                    }
                },
                contactPhone: '5511999999999',
                whatsappApiKey: 'test-api-key'
            };
            const mockJob = {
                id: 'test-job-id',
                data: buttonClickTask
            };
            // Mock button reaction lookup
            prisma_1.prisma.buttonReactionMapping.findUnique.mockResolvedValue({
                id: 'reaction123',
                buttonId: 'like_button',
                emoji: '👍',
                textReaction: null,
                isActive: true
            });
            // Mock WhatsApp API response
            whatsapp_reactions_1.sendReactionMessage.mockResolvedValue({
                success: true,
                messageId: 'wamid.reaction123'
            });
            whatsapp_reactions_1.logReactionAttempt.mockResolvedValue(undefined);
            const result = await (0, mtf_diamante_webhook_task_1.processMtfDiamanteWebhookTask)(mockJob);
            expect(result).toEqual({
                success: true,
                type: 'processButtonClick'
            });
            expect(prisma_1.prisma.buttonReactionMapping.findUnique).toHaveBeenCalledWith({
                where: { buttonId: 'like_button' }
            });
            expect(whatsapp_reactions_1.sendReactionMessage).toHaveBeenCalledWith({
                recipientPhone: '5511999999999',
                messageId: 'wamid.original123',
                emoji: '👍',
                whatsappApiKey: 'test-api-key'
            });
        });
        it('should detect list reply from Dialogflow payload format', async () => {
            const listReplyTask = {
                type: 'processButtonClick',
                payload: {
                    originalDetectIntentRequest: {
                        payload: {
                            wamid: 'wamid.test456',
                            message_id: 'msg456',
                            conversation_id: 'conv456',
                            inbox_id: 'inbox456',
                            contact_phone: '5511888888888',
                            whatsapp_api_key: 'test-api-key-2',
                            interactive: {
                                type: 'list_reply',
                                list_reply: {
                                    id: 'product_1',
                                    title: 'Product 1'
                                }
                            },
                            context: {
                                id: 'wamid.original456'
                            }
                        }
                    }
                },
                contactPhone: '5511888888888',
                whatsappApiKey: 'test-api-key-2'
            };
            const mockJob = {
                id: 'test-job-id-2',
                data: listReplyTask
            };
            // Mock button reaction lookup
            prisma_1.prisma.buttonReactionMapping.findUnique.mockResolvedValue({
                id: 'reaction456',
                buttonId: 'product_1',
                emoji: null,
                textReaction: 'Thank you for selecting Product 1!',
                isActive: true
            });
            // Mock WhatsApp API response
            whatsapp_messages_1.sendTextMessage.mockResolvedValue({
                success: true,
                messageId: 'wamid.text456'
            });
            const result = await (0, mtf_diamante_webhook_task_1.processMtfDiamanteWebhookTask)(mockJob);
            expect(result).toEqual({
                success: true,
                type: 'processButtonClick'
            });
            expect(whatsapp_messages_1.sendTextMessage).toHaveBeenCalledWith({
                recipientPhone: '5511888888888',
                whatsappApiKey: 'test-api-key-2',
                text: 'Thank you for selecting Product 1!',
                replyToMessageId: 'wamid.original456'
            });
        });
        it('should detect button click from direct WhatsApp webhook format', async () => {
            const whatsappWebhookTask = {
                type: 'processButtonClick',
                payload: {
                    entry: [{
                            changes: [{
                                    value: {
                                        messages: [{
                                                id: 'wamid.direct789',
                                                from: '5511777777777',
                                                type: 'interactive',
                                                interactive: {
                                                    type: 'button_reply',
                                                    button_reply: {
                                                        id: 'share_button',
                                                        title: 'Share'
                                                    }
                                                },
                                                context: {
                                                    id: 'wamid.original789'
                                                }
                                            }]
                                    }
                                }]
                        }],
                    originalDetectIntentRequest: {
                        payload: {
                            wamid: 'wamid.direct789',
                            message_id: 'msg789',
                            conversation_id: 'conv789',
                            inbox_id: 'inbox789',
                            contact_phone: '5511777777777',
                            whatsapp_api_key: 'test-api-key-3'
                        }
                    }
                },
                contactPhone: '5511777777777',
                whatsappApiKey: 'test-api-key-3'
            };
            const mockJob = {
                id: 'test-job-id-3',
                data: whatsappWebhookTask
            };
            // Mock button reaction lookup
            prisma_1.prisma.buttonReactionMapping.findUnique.mockResolvedValue({
                id: 'reaction789',
                buttonId: 'share_button',
                emoji: '🔗',
                textReaction: 'Link shared successfully!',
                isActive: true
            });
            // Mock WhatsApp API responses
            whatsapp_reactions_1.sendReactionMessage.mockResolvedValue({
                success: true,
                messageId: 'wamid.reaction789'
            });
            whatsapp_messages_1.sendTextMessage.mockResolvedValue({
                success: true,
                messageId: 'wamid.text789'
            });
            whatsapp_reactions_1.logReactionAttempt.mockResolvedValue(undefined);
            const result = await (0, mtf_diamante_webhook_task_1.processMtfDiamanteWebhookTask)(mockJob);
            expect(result).toEqual({
                success: true,
                type: 'processButtonClick'
            });
            // Should send both emoji reaction and text message
            expect(whatsapp_reactions_1.sendReactionMessage).toHaveBeenCalledWith({
                recipientPhone: '5511777777777',
                messageId: 'wamid.original789',
                emoji: '🔗',
                whatsappApiKey: 'test-api-key-3'
            });
            expect(whatsapp_messages_1.sendTextMessage).toHaveBeenCalledWith({
                recipientPhone: '5511777777777',
                whatsappApiKey: 'test-api-key-3',
                text: 'Link shared successfully!',
                replyToMessageId: 'wamid.original789'
            });
        });
    });
    describe('Reaction Type Detection', () => {
        it('should process emoji-only reactions', async () => {
            const buttonClickTask = {
                type: 'processButtonClick',
                payload: {
                    originalDetectIntentRequest: {
                        payload: {
                            wamid: 'wamid.emoji123',
                            message_id: 'msg123',
                            conversation_id: 'conv123',
                            inbox_id: 'inbox123',
                            contact_phone: '5511999999999',
                            whatsapp_api_key: 'test-api-key',
                            interactive: {
                                type: 'button_reply',
                                button_reply: {
                                    id: 'emoji_button',
                                    title: 'React'
                                }
                            },
                            context: {
                                id: 'wamid.original123'
                            }
                        }
                    }
                },
                contactPhone: '5511999999999',
                whatsappApiKey: 'test-api-key'
            };
            const mockJob = {
                id: 'test-job-id',
                data: buttonClickTask
            };
            // Mock emoji-only reaction
            prisma_1.prisma.buttonReactionMapping.findUnique.mockResolvedValue({
                id: 'reaction123',
                buttonId: 'emoji_button',
                emoji: '🎉',
                textReaction: null,
                isActive: true
            });
            whatsapp_reactions_1.sendReactionMessage.mockResolvedValue({
                success: true,
                messageId: 'wamid.reaction123'
            });
            whatsapp_reactions_1.logReactionAttempt.mockResolvedValue(undefined);
            await (0, mtf_diamante_webhook_task_1.processMtfDiamanteWebhookTask)(mockJob);
            expect(whatsapp_reactions_1.sendReactionMessage).toHaveBeenCalledWith({
                recipientPhone: '5511999999999',
                messageId: 'wamid.original123',
                emoji: '🎉',
                whatsappApiKey: 'test-api-key'
            });
            expect(whatsapp_messages_1.sendTextMessage).not.toHaveBeenCalled();
        });
        it('should process text-only reactions', async () => {
            const buttonClickTask = {
                type: 'processButtonClick',
                payload: {
                    originalDetectIntentRequest: {
                        payload: {
                            wamid: 'wamid.text123',
                            message_id: 'msg123',
                            conversation_id: 'conv123',
                            inbox_id: 'inbox123',
                            contact_phone: '5511999999999',
                            whatsapp_api_key: 'test-api-key',
                            interactive: {
                                type: 'button_reply',
                                button_reply: {
                                    id: 'text_button',
                                    title: 'Get Info'
                                }
                            },
                            context: {
                                id: 'wamid.original123'
                            }
                        }
                    }
                },
                contactPhone: '5511999999999',
                whatsappApiKey: 'test-api-key'
            };
            const mockJob = {
                id: 'test-job-id',
                data: buttonClickTask
            };
            // Mock text-only reaction
            prisma_1.prisma.buttonReactionMapping.findUnique.mockResolvedValue({
                id: 'reaction123',
                buttonId: 'text_button',
                emoji: null,
                textReaction: 'Here is the information you requested.',
                isActive: true
            });
            whatsapp_messages_1.sendTextMessage.mockResolvedValue({
                success: true,
                messageId: 'wamid.text123'
            });
            await (0, mtf_diamante_webhook_task_1.processMtfDiamanteWebhookTask)(mockJob);
            expect(whatsapp_messages_1.sendTextMessage).toHaveBeenCalledWith({
                recipientPhone: '5511999999999',
                whatsappApiKey: 'test-api-key',
                text: 'Here is the information you requested.',
                replyToMessageId: 'wamid.original123'
            });
            expect(whatsapp_reactions_1.sendReactionMessage).not.toHaveBeenCalled();
        });
        it('should process combined emoji and text reactions', async () => {
            const buttonClickTask = {
                type: 'processButtonClick',
                payload: {
                    originalDetectIntentRequest: {
                        payload: {
                            wamid: 'wamid.combined123',
                            message_id: 'msg123',
                            conversation_id: 'conv123',
                            inbox_id: 'inbox123',
                            contact_phone: '5511999999999',
                            whatsapp_api_key: 'test-api-key',
                            interactive: {
                                type: 'button_reply',
                                button_reply: {
                                    id: 'combined_button',
                                    title: 'Like & Comment'
                                }
                            },
                            context: {
                                id: 'wamid.original123'
                            }
                        }
                    }
                },
                contactPhone: '5511999999999',
                whatsappApiKey: 'test-api-key'
            };
            const mockJob = {
                id: 'test-job-id',
                data: buttonClickTask
            };
            // Mock combined reaction
            prisma_1.prisma.buttonReactionMapping.findUnique.mockResolvedValue({
                id: 'reaction123',
                buttonId: 'combined_button',
                emoji: '❤️',
                textReaction: 'Thanks for your feedback!',
                isActive: true
            });
            whatsapp_reactions_1.sendReactionMessage.mockResolvedValue({
                success: true,
                messageId: 'wamid.reaction123'
            });
            whatsapp_messages_1.sendTextMessage.mockResolvedValue({
                success: true,
                messageId: 'wamid.text123'
            });
            whatsapp_reactions_1.logReactionAttempt.mockResolvedValue(undefined);
            await (0, mtf_diamante_webhook_task_1.processMtfDiamanteWebhookTask)(mockJob);
            expect(whatsapp_reactions_1.sendReactionMessage).toHaveBeenCalledWith({
                recipientPhone: '5511999999999',
                messageId: 'wamid.original123',
                emoji: '❤️',
                whatsappApiKey: 'test-api-key'
            });
            expect(whatsapp_messages_1.sendTextMessage).toHaveBeenCalledWith({
                recipientPhone: '5511999999999',
                whatsappApiKey: 'test-api-key',
                text: 'Thanks for your feedback!',
                replyToMessageId: 'wamid.original123'
            });
        });
    });
    describe('Fallback to Config-based Mappings', () => {
        it('should fallback to config when database reaction not found', async () => {
            const buttonClickTask = {
                type: 'processButtonClick',
                payload: {
                    originalDetectIntentRequest: {
                        payload: {
                            wamid: 'wamid.config123',
                            message_id: 'msg123',
                            conversation_id: 'conv123',
                            inbox_id: 'inbox123',
                            contact_phone: '5511999999999',
                            whatsapp_api_key: 'test-api-key',
                            interactive: {
                                type: 'button_reply',
                                button_reply: {
                                    id: 'config_button',
                                    title: 'Config Button'
                                }
                            },
                            context: {
                                id: 'wamid.original123'
                            }
                        }
                    }
                },
                contactPhone: '5511999999999',
                whatsappApiKey: 'test-api-key'
            };
            const mockJob = {
                id: 'test-job-id',
                data: buttonClickTask
            };
            // Mock database lookup returning null
            prisma_1.prisma.buttonReactionMapping.findUnique.mockResolvedValue(null);
            // Mock config-based fallback
            dialogflow_database_queries_1.findReactionByButtonId.mockResolvedValue({
                id: 'config-reaction123',
                buttonId: 'config_button',
                emoji: '⚙️',
                textReaction: null,
                isActive: true
            });
            whatsapp_reactions_1.sendReactionMessage.mockResolvedValue({
                success: true,
                messageId: 'wamid.reaction123'
            });
            whatsapp_reactions_1.logReactionAttempt.mockResolvedValue(undefined);
            await (0, mtf_diamante_webhook_task_1.processMtfDiamanteWebhookTask)(mockJob);
            expect(prisma_1.prisma.buttonReactionMapping.findUnique).toHaveBeenCalledWith({
                where: { buttonId: 'config_button' }
            });
            expect(dialogflow_database_queries_1.findReactionByButtonId).toHaveBeenCalledWith('config_button');
            expect(whatsapp_reactions_1.sendReactionMessage).toHaveBeenCalledWith({
                recipientPhone: '5511999999999',
                messageId: 'wamid.original123',
                emoji: '⚙️',
                whatsappApiKey: 'test-api-key'
            });
        });
    });
    describe('Error Handling', () => {
        it('should handle WhatsApp API failures gracefully', async () => {
            const buttonClickTask = {
                type: 'processButtonClick',
                payload: {
                    originalDetectIntentRequest: {
                        payload: {
                            wamid: 'wamid.error123',
                            message_id: 'msg123',
                            conversation_id: 'conv123',
                            inbox_id: 'inbox123',
                            contact_phone: '5511999999999',
                            whatsapp_api_key: 'test-api-key',
                            interactive: {
                                type: 'button_reply',
                                button_reply: {
                                    id: 'error_button',
                                    title: 'Error Button'
                                }
                            },
                            context: {
                                id: 'wamid.original123'
                            }
                        }
                    }
                },
                contactPhone: '5511999999999',
                whatsappApiKey: 'test-api-key'
            };
            const mockJob = {
                id: 'test-job-id',
                data: buttonClickTask
            };
            // Mock button reaction lookup
            prisma_1.prisma.buttonReactionMapping.findUnique.mockResolvedValue({
                id: 'reaction123',
                buttonId: 'error_button',
                emoji: '❌',
                textReaction: 'Error message',
                isActive: true
            });
            // Mock WhatsApp API failures
            whatsapp_reactions_1.sendReactionMessage.mockResolvedValue({
                success: false,
                error: 'Message not found'
            });
            whatsapp_messages_1.sendTextMessage.mockResolvedValue({
                success: false,
                error: 'Rate limit exceeded'
            });
            whatsapp_reactions_1.logReactionAttempt.mockResolvedValue(undefined);
            // Should not throw error, but handle gracefully
            const result = await (0, mtf_diamante_webhook_task_1.processMtfDiamanteWebhookTask)(mockJob);
            expect(result).toEqual({
                success: true,
                type: 'processButtonClick'
            });
            expect(whatsapp_reactions_1.sendReactionMessage).toHaveBeenCalled();
            expect(whatsapp_messages_1.sendTextMessage).toHaveBeenCalled();
        });
        it('should handle missing button reaction configuration', async () => {
            const buttonClickTask = {
                type: 'processButtonClick',
                payload: {
                    originalDetectIntentRequest: {
                        payload: {
                            wamid: 'wamid.missing123',
                            message_id: 'msg123',
                            conversation_id: 'conv123',
                            inbox_id: 'inbox123',
                            contact_phone: '5511999999999',
                            whatsapp_api_key: 'test-api-key',
                            interactive: {
                                type: 'button_reply',
                                button_reply: {
                                    id: 'missing_button',
                                    title: 'Missing Button'
                                }
                            },
                            context: {
                                id: 'wamid.original123'
                            }
                        }
                    }
                },
                contactPhone: '5511999999999',
                whatsappApiKey: 'test-api-key'
            };
            const mockJob = {
                id: 'test-job-id',
                data: buttonClickTask
            };
            // Mock no reaction found
            prisma_1.prisma.buttonReactionMapping.findUnique.mockResolvedValue(null);
            dialogflow_database_queries_1.findReactionByButtonId.mockResolvedValue(null);
            const result = await (0, mtf_diamante_webhook_task_1.processMtfDiamanteWebhookTask)(mockJob);
            expect(result).toEqual({
                success: true,
                type: 'processButtonClick'
            });
            expect(whatsapp_reactions_1.sendReactionMessage).not.toHaveBeenCalled();
            expect(whatsapp_messages_1.sendTextMessage).not.toHaveBeenCalled();
        });
        it('should handle non-button-click payloads gracefully', async () => {
            const nonButtonTask = {
                type: 'processButtonClick',
                payload: {
                    originalDetectIntentRequest: {
                        payload: {
                            wamid: 'wamid.text123',
                            message_id: 'msg123',
                            conversation_id: 'conv123',
                            inbox_id: 'inbox123',
                            contact_phone: '5511999999999',
                            whatsapp_api_key: 'test-api-key',
                            message_content: 'Hello world',
                            message_content_type: 'text'
                        }
                    },
                    queryResult: {
                        intent: { displayName: 'greeting' }
                    }
                },
                contactPhone: '5511999999999',
                whatsappApiKey: 'test-api-key'
            };
            const mockJob = {
                id: 'test-job-id',
                data: nonButtonTask
            };
            const result = await (0, mtf_diamante_webhook_task_1.processMtfDiamanteWebhookTask)(mockJob);
            expect(result).toEqual({
                success: true,
                type: 'processButtonClick'
            });
            expect(prisma_1.prisma.buttonReactionMapping.findUnique).not.toHaveBeenCalled();
            expect(whatsapp_reactions_1.sendReactionMessage).not.toHaveBeenCalled();
            expect(whatsapp_messages_1.sendTextMessage).not.toHaveBeenCalled();
        });
    });
    describe('Integration with Queue System', () => {
        it('should process button click task through queue system', async () => {
            const buttonClickTask = {
                type: 'processButtonClick',
                payload: {
                    originalDetectIntentRequest: {
                        payload: {
                            wamid: 'wamid.queue123',
                            message_id: 'msg123',
                            conversation_id: 'conv123',
                            inbox_id: 'inbox123',
                            contact_phone: '5511999999999',
                            whatsapp_api_key: 'test-api-key',
                            interactive: {
                                type: 'button_reply',
                                button_reply: {
                                    id: 'queue_button',
                                    title: 'Queue Test'
                                }
                            },
                            context: {
                                id: 'wamid.original123'
                            }
                        }
                    }
                },
                contactPhone: '5511999999999',
                whatsappApiKey: 'test-api-key'
            };
            const mockJob = {
                id: 'queue-test-job',
                data: buttonClickTask,
                opts: {
                    attempts: 3,
                    backoff: { type: 'exponential', delay: 2000 }
                }
            };
            // Mock successful processing
            prisma_1.prisma.buttonReactionMapping.findUnique.mockResolvedValue({
                id: 'reaction123',
                buttonId: 'queue_button',
                emoji: '🔄',
                textReaction: null,
                isActive: true
            });
            whatsapp_reactions_1.sendReactionMessage.mockResolvedValue({
                success: true,
                messageId: 'wamid.reaction123'
            });
            whatsapp_reactions_1.logReactionAttempt.mockResolvedValue(undefined);
            const result = await (0, mtf_diamante_webhook_task_1.processMtfDiamanteWebhookTask)(mockJob);
            expect(result).toEqual({
                success: true,
                type: 'processButtonClick'
            });
            expect(mockJob.id).toBe('queue-test-job');
        });
    });
});
