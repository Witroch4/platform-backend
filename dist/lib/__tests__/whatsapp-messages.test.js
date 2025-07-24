"use strict";
/**
 * Unit Tests for WhatsApp Messages Service
 * Tests WhatsApp API communication functions in isolation
 * Requirements: 2.3
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const axios_1 = __importDefault(require("axios"));
const whatsapp_messages_1 = require("../whatsapp-messages");
// Mock axios
jest.mock('axios');
const mockedAxios = axios_1.default;
describe('WhatsApp Messages Service', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        // Mock environment variables
        process.env.FROM_PHONE_NUMBER_ID = 'test-phone-number-id';
    });
    afterEach(() => {
        delete process.env.FROM_PHONE_NUMBER_ID;
    });
    describe('formatPhoneNumber', () => {
        it('should format phone numbers to E.164 format', () => {
            const testCases = [
                { input: '11999999999', expected: '5511999999999' },
                { input: '5511999999999', expected: '5511999999999' },
                { input: '+55 11 99999-9999', expected: '5511999999999' },
                { input: '(11) 99999-9999', expected: '5511999999999' },
                { input: '', expected: null },
                { input: 'invalid', expected: null }
            ];
            testCases.forEach(({ input, expected }) => {
                const result = (0, whatsapp_messages_1.formatPhoneNumber)(input);
                expect(result).toBe(expected);
            });
        });
    });
    describe('sanitizeCouponCode', () => {
        it('should sanitize coupon codes correctly', () => {
            const testCases = [
                { input: 'SAVE20', expected: 'SAVE20' },
                { input: 'SAVE-20%', expected: 'SAVE20' },
                { input: 'código com espaços!', expected: 'cdigocomespaos' },
                { input: '123ABC456', expected: '123ABC456' },
                { input: 'a'.repeat(40), expected: 'a'.repeat(32) }, // Truncate to 32 chars
                { input: '', expected: Error },
                { input: '!@#$%', expected: Error }
            ];
            testCases.forEach(({ input, expected }) => {
                if (expected === Error) {
                    expect(() => (0, whatsapp_messages_1.sanitizeCouponCode)(input)).toThrow();
                }
                else {
                    const result = (0, whatsapp_messages_1.sanitizeCouponCode)(input);
                    expect(result).toBe(expected);
                }
            });
        });
    });
    describe('sendTemplateMessage', () => {
        it('should send template message successfully', async () => {
            const templateData = {
                recipientPhone: '5511999999999',
                templateId: 'welcome_template',
                templateName: 'welcome',
                language: 'pt_BR',
                whatsappApiKey: 'test-api-key',
                variables: { name: 'João' },
                bodyVars: ['João', 'ChatWit']
            };
            const templateComponents = [
                {
                    type: 'BODY',
                    text: 'Olá {{1}}, bem-vindo ao {{2}}!'
                }
            ];
            const mockResponse = {
                data: {
                    messages: [{ id: 'wamid.test123' }],
                    messaging_product: 'whatsapp'
                }
            };
            mockedAxios.post.mockResolvedValue(mockResponse);
            const result = await (0, whatsapp_messages_1.sendTemplateMessage)(templateData, templateComponents);
            expect(result).toEqual({
                success: true,
                messageId: 'wamid.test123',
                details: mockResponse.data
            });
            expect(mockedAxios.post).toHaveBeenCalledWith('https://graph.facebook.com/v22.0/test-phone-number-id/messages', {
                messaging_product: 'whatsapp',
                recipient_type: 'individual',
                to: '5511999999999',
                type: 'template',
                template: {
                    name: 'welcome',
                    language: { code: 'pt_BR' },
                    components: [
                        {
                            type: 'body',
                            parameters: [
                                { type: 'text', text: 'João' },
                                { type: 'text', text: 'ChatWit' }
                            ]
                        }
                    ]
                }
            }, {
                headers: {
                    'Authorization': 'Bearer test-api-key',
                    'Content-Type': 'application/json'
                }
            });
        });
        it('should handle template with header media', async () => {
            const templateData = {
                recipientPhone: '5511999999999',
                templateId: 'media_template',
                templateName: 'media',
                whatsappApiKey: 'test-api-key',
                headerMedia: 'https://example.com/image.jpg'
            };
            const templateComponents = [
                {
                    type: 'HEADER',
                    format: 'IMAGE'
                },
                {
                    type: 'BODY',
                    text: 'Confira esta imagem!'
                }
            ];
            mockedAxios.post.mockResolvedValue({
                data: { messages: [{ id: 'wamid.media123' }] }
            });
            const result = await (0, whatsapp_messages_1.sendTemplateMessage)(templateData, templateComponents);
            expect(result.success).toBe(true);
            expect(mockedAxios.post).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
                template: expect.objectContaining({
                    components: expect.arrayContaining([
                        {
                            type: 'header',
                            parameters: [{
                                    type: 'image',
                                    image: { link: 'https://example.com/image.jpg' }
                                }]
                        }
                    ])
                })
            }), expect.any(Object));
        });
        it('should handle template with coupon button', async () => {
            const templateData = {
                recipientPhone: '5511999999999',
                templateId: 'coupon_template',
                templateName: 'coupon',
                whatsappApiKey: 'test-api-key',
                couponCode: 'SAVE20'
            };
            const templateComponents = [
                {
                    type: 'BODY',
                    text: 'Use o cupom abaixo:'
                },
                {
                    type: 'BUTTONS',
                    buttons: [
                        {
                            type: 'COPY_CODE',
                            text: 'Copiar Código'
                        }
                    ]
                }
            ];
            mockedAxios.post.mockResolvedValue({
                data: { messages: [{ id: 'wamid.coupon123' }] }
            });
            const result = await (0, whatsapp_messages_1.sendTemplateMessage)(templateData, templateComponents);
            expect(result.success).toBe(true);
            expect(mockedAxios.post).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
                template: expect.objectContaining({
                    components: expect.arrayContaining([
                        {
                            type: 'button',
                            sub_type: 'copy_code',
                            index: '0',
                            parameters: [{
                                    type: 'coupon_code',
                                    coupon_code: 'SAVE20'
                                }]
                        }
                    ])
                })
            }), expect.any(Object));
        });
        it('should handle WhatsApp API errors', async () => {
            const templateData = {
                recipientPhone: '5511999999999',
                templateId: 'error_template',
                templateName: 'error',
                whatsappApiKey: 'invalid-key'
            };
            const errorResponse = {
                response: {
                    data: {
                        error: {
                            message: 'Invalid access token',
                            code: 190
                        }
                    }
                }
            };
            mockedAxios.post.mockRejectedValue(errorResponse);
            const result = await (0, whatsapp_messages_1.sendTemplateMessage)(templateData, []);
            expect(result).toEqual({
                success: false,
                error: 'Invalid access token',
                details: errorResponse.response.data
            });
        });
        it('should handle invalid phone number', async () => {
            const templateData = {
                recipientPhone: 'invalid-phone',
                templateId: 'test_template',
                templateName: 'test',
                whatsappApiKey: 'test-key'
            };
            const result = await (0, whatsapp_messages_1.sendTemplateMessage)(templateData, []);
            expect(result).toEqual({
                success: false,
                error: 'Invalid phone number format',
                details: undefined
            });
            expect(mockedAxios.post).not.toHaveBeenCalled();
        });
    });
    describe('sendInteractiveMessage', () => {
        it('should send interactive button message successfully', async () => {
            const interactiveData = {
                recipientPhone: '5511999999999',
                whatsappApiKey: 'test-api-key',
                header: {
                    type: 'text',
                    content: 'Menu Principal'
                },
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
            };
            const mockResponse = {
                data: {
                    messages: [{ id: 'wamid.interactive123' }]
                }
            };
            mockedAxios.post.mockResolvedValue(mockResponse);
            const result = await (0, whatsapp_messages_1.sendInteractiveMessage)(interactiveData);
            expect(result).toEqual({
                success: true,
                messageId: 'wamid.interactive123',
                details: mockResponse.data
            });
            expect(mockedAxios.post).toHaveBeenCalledWith('https://graph.facebook.com/v22.0/test-phone-number-id/messages', {
                messaging_product: 'whatsapp',
                recipient_type: 'individual',
                to: '5511999999999',
                type: 'interactive',
                interactive: {
                    type: 'buttons',
                    header: {
                        type: 'text',
                        text: 'Menu Principal'
                    },
                    body: { text: 'Escolha uma opção:' },
                    footer: { text: 'Powered by ChatWit' },
                    action: {
                        buttons: [
                            {
                                type: 'reply',
                                reply: { id: 'option1', title: 'Opção 1' }
                            },
                            {
                                type: 'reply',
                                reply: { id: 'option2', title: 'Opção 2' }
                            }
                        ]
                    }
                }
            }, {
                headers: {
                    'Authorization': 'Bearer test-api-key',
                    'Content-Type': 'application/json'
                }
            });
        });
        it('should send interactive list message successfully', async () => {
            const listData = {
                recipientPhone: '5511999999999',
                whatsappApiKey: 'test-api-key',
                body: 'Selecione um produto:',
                action: {
                    type: 'list',
                    data: {
                        buttonText: 'Ver Produtos',
                        sections: [
                            {
                                title: 'Produtos Disponíveis',
                                rows: [
                                    { id: 'product1', title: 'Produto 1', description: 'Descrição 1' },
                                    { id: 'product2', title: 'Produto 2', description: 'Descrição 2' }
                                ]
                            }
                        ]
                    }
                }
            };
            mockedAxios.post.mockResolvedValue({
                data: { messages: [{ id: 'wamid.list123' }] }
            });
            const result = await (0, whatsapp_messages_1.sendInteractiveMessage)(listData);
            expect(result.success).toBe(true);
            expect(mockedAxios.post).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
                interactive: expect.objectContaining({
                    type: 'list',
                    action: {
                        button: 'Ver Produtos',
                        sections: [
                            {
                                title: 'Produtos Disponíveis',
                                rows: [
                                    { id: 'product1', title: 'Produto 1', description: 'Descrição 1' },
                                    { id: 'product2', title: 'Produto 2', description: 'Descrição 2' }
                                ]
                            }
                        ]
                    }
                })
            }), expect.any(Object));
        });
        it('should send CTA URL message successfully', async () => {
            const ctaData = {
                recipientPhone: '5511999999999',
                whatsappApiKey: 'test-api-key',
                body: 'Visite nosso site:',
                action: {
                    type: 'cta_url',
                    data: {
                        displayText: 'Visitar Site',
                        url: 'https://example.com'
                    }
                }
            };
            mockedAxios.post.mockResolvedValue({
                data: { messages: [{ id: 'wamid.cta123' }] }
            });
            const result = await (0, whatsapp_messages_1.sendInteractiveMessage)(ctaData);
            expect(result.success).toBe(true);
            expect(mockedAxios.post).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
                interactive: expect.objectContaining({
                    type: 'cta_url',
                    action: {
                        name: 'cta_url',
                        parameters: {
                            display_text: 'Visitar Site',
                            url: 'https://example.com'
                        }
                    }
                })
            }), expect.any(Object));
        });
        it('should send location request message successfully', async () => {
            const locationData = {
                recipientPhone: '5511999999999',
                whatsappApiKey: 'test-api-key',
                body: 'Compartilhe sua localização:',
                action: {
                    type: 'location_request',
                    data: {}
                }
            };
            mockedAxios.post.mockResolvedValue({
                data: { messages: [{ id: 'wamid.location123' }] }
            });
            const result = await (0, whatsapp_messages_1.sendInteractiveMessage)(locationData);
            expect(result.success).toBe(true);
            expect(mockedAxios.post).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
                interactive: expect.objectContaining({
                    type: 'location_request',
                    action: {
                        name: 'send_location'
                    }
                })
            }), expect.any(Object));
        });
        it('should handle interactive message with image header', async () => {
            const imageHeaderData = {
                recipientPhone: '5511999999999',
                whatsappApiKey: 'test-api-key',
                header: {
                    type: 'image',
                    content: 'https://example.com/image.jpg'
                },
                body: 'Confira esta imagem:',
                action: {
                    type: 'buttons',
                    data: {
                        buttons: [{ id: 'like', title: 'Curtir' }]
                    }
                }
            };
            mockedAxios.post.mockResolvedValue({
                data: { messages: [{ id: 'wamid.imageheader123' }] }
            });
            const result = await (0, whatsapp_messages_1.sendInteractiveMessage)(imageHeaderData);
            expect(result.success).toBe(true);
            expect(mockedAxios.post).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
                interactive: expect.objectContaining({
                    header: {
                        type: 'image',
                        image: { link: 'https://example.com/image.jpg' }
                    }
                })
            }), expect.any(Object));
        });
        it('should handle WhatsApp API errors for interactive messages', async () => {
            const interactiveData = {
                recipientPhone: '5511999999999',
                whatsappApiKey: 'invalid-key',
                body: 'Test message',
                action: {
                    type: 'buttons',
                    data: { buttons: [{ id: 'test', title: 'Test' }] }
                }
            };
            const errorResponse = {
                response: {
                    data: {
                        error: {
                            message: 'Invalid interactive message format',
                            code: 131000
                        }
                    }
                }
            };
            mockedAxios.post.mockRejectedValue(errorResponse);
            const result = await (0, whatsapp_messages_1.sendInteractiveMessage)(interactiveData);
            expect(result).toEqual({
                success: false,
                error: 'Invalid interactive message format',
                details: errorResponse.response.data
            });
        });
        it('should handle invalid phone number for interactive messages', async () => {
            const interactiveData = {
                recipientPhone: 'invalid-phone',
                whatsappApiKey: 'test-key',
                body: 'Test message',
                action: {
                    type: 'buttons',
                    data: { buttons: [] }
                }
            };
            const result = await (0, whatsapp_messages_1.sendInteractiveMessage)(interactiveData);
            expect(result).toEqual({
                success: false,
                error: 'Invalid phone number format',
                details: undefined
            });
            expect(mockedAxios.post).not.toHaveBeenCalled();
        });
    });
    describe('Error Handling', () => {
        it('should handle network errors gracefully', async () => {
            const templateData = {
                recipientPhone: '5511999999999',
                templateId: 'test',
                templateName: 'test',
                whatsappApiKey: 'test-key'
            };
            mockedAxios.post.mockRejectedValue(new Error('Network Error'));
            const result = await (0, whatsapp_messages_1.sendTemplateMessage)(templateData, []);
            expect(result).toEqual({
                success: false,
                error: 'Network Error',
                details: undefined
            });
        });
        it('should handle axios timeout errors', async () => {
            const interactiveData = {
                recipientPhone: '5511999999999',
                whatsappApiKey: 'test-key',
                body: 'Test',
                action: {
                    type: 'buttons',
                    data: { buttons: [{ id: 'test', title: 'Test' }] }
                }
            };
            const timeoutError = {
                code: 'ECONNABORTED',
                message: 'timeout of 5000ms exceeded'
            };
            mockedAxios.post.mockRejectedValue(timeoutError);
            const result = await (0, whatsapp_messages_1.sendInteractiveMessage)(interactiveData);
            expect(result).toEqual({
                success: false,
                error: 'timeout of 5000ms exceeded',
                details: undefined
            });
        });
    });
});
