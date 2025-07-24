"use strict";
/**
 * Unit Tests for WhatsApp Text Messages Service
 * Tests text message sending functionality for reactions
 * Requirements: 5.2, 5.4
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
describe('WhatsApp Text Messages Service', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        // Mock environment variables
        process.env.FROM_PHONE_NUMBER_ID = 'test-phone-id';
    });
    describe('sendTextMessage', () => {
        it('should send text message successfully', async () => {
            const textData = {
                recipientPhone: '5511999999999',
                whatsappApiKey: 'test-api-key',
                text: 'Hello, this is a test message!'
            };
            const mockResponse = {
                data: {
                    messages: [{ id: 'wamid.text123' }]
                }
            };
            mockedAxios.post.mockResolvedValue(mockResponse);
            const result = await (0, whatsapp_messages_1.sendTextMessage)(textData);
            expect(result).toEqual({
                success: true,
                messageId: 'wamid.text123',
                details: mockResponse.data
            });
            expect(mockedAxios.post).toHaveBeenCalledWith('https://graph.facebook.com/v22.0/test-phone-id/messages', {
                messaging_product: 'whatsapp',
                recipient_type: 'individual',
                to: '5511999999999',
                type: 'text',
                text: {
                    body: 'Hello, this is a test message!'
                }
            }, {
                headers: {
                    'Authorization': 'Bearer test-api-key',
                    'Content-Type': 'application/json'
                }
            });
        });
        it('should send text message as reply to specific message', async () => {
            const textData = {
                recipientPhone: '5511999999999',
                whatsappApiKey: 'test-api-key',
                text: 'This is a reply message',
                replyToMessageId: 'wamid.original123'
            };
            const mockResponse = {
                data: {
                    messages: [{ id: 'wamid.reply123' }]
                }
            };
            mockedAxios.post.mockResolvedValue(mockResponse);
            const result = await (0, whatsapp_messages_1.sendTextMessage)(textData);
            expect(result).toEqual({
                success: true,
                messageId: 'wamid.reply123',
                details: mockResponse.data
            });
            expect(mockedAxios.post).toHaveBeenCalledWith('https://graph.facebook.com/v22.0/test-phone-id/messages', {
                messaging_product: 'whatsapp',
                recipient_type: 'individual',
                to: '5511999999999',
                type: 'text',
                text: {
                    body: 'This is a reply message'
                },
                context: {
                    message_id: 'wamid.original123'
                }
            }, {
                headers: {
                    'Authorization': 'Bearer test-api-key',
                    'Content-Type': 'application/json'
                }
            });
        });
        it('should handle phone number formatting', async () => {
            const testCases = [
                { input: '11999999999', expected: '5511999999999' },
                { input: '5511999999999', expected: '5511999999999' },
                { input: '+55 11 99999-9999', expected: '5511999999999' },
                { input: '(11) 99999-9999', expected: '5511999999999' }
            ];
            mockedAxios.post.mockResolvedValue({
                data: { messages: [{ id: 'wamid.test' }] }
            });
            for (const { input, expected } of testCases) {
                const textData = {
                    recipientPhone: input,
                    whatsappApiKey: 'test-api-key',
                    text: 'Test message'
                };
                await (0, whatsapp_messages_1.sendTextMessage)(textData);
                expect(mockedAxios.post).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
                    to: expected
                }), expect.any(Object));
            }
        });
        it('should handle invalid phone numbers', async () => {
            const textData = {
                recipientPhone: 'invalid-phone',
                whatsappApiKey: 'test-api-key',
                text: 'Test message'
            };
            const result = await (0, whatsapp_messages_1.sendTextMessage)(textData);
            expect(result).toEqual({
                success: false,
                error: 'Invalid phone number format'
            });
            expect(mockedAxios.post).not.toHaveBeenCalled();
        });
        it('should handle WhatsApp API errors', async () => {
            const textData = {
                recipientPhone: '5511999999999',
                whatsappApiKey: 'invalid-api-key',
                text: 'Test message'
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
            const result = await (0, whatsapp_messages_1.sendTextMessage)(textData);
            expect(result).toEqual({
                success: false,
                error: 'Invalid access token',
                details: errorResponse.response.data
            });
        });
        it('should handle network errors', async () => {
            const textData = {
                recipientPhone: '5511999999999',
                whatsappApiKey: 'test-api-key',
                text: 'Test message'
            };
            mockedAxios.post.mockRejectedValue(new Error('Network timeout'));
            const result = await (0, whatsapp_messages_1.sendTextMessage)(textData);
            expect(result).toEqual({
                success: false,
                error: 'Network timeout'
            });
        });
        it('should handle empty text message', async () => {
            const textData = {
                recipientPhone: '5511999999999',
                whatsappApiKey: 'test-api-key',
                text: ''
            };
            mockedAxios.post.mockResolvedValue({
                data: { messages: [{ id: 'wamid.empty' }] }
            });
            const result = await (0, whatsapp_messages_1.sendTextMessage)(textData);
            expect(result.success).toBe(true);
            expect(mockedAxios.post).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
                text: {
                    body: ''
                }
            }), expect.any(Object));
        });
        it('should handle long text messages', async () => {
            const longText = 'A'.repeat(4096); // WhatsApp limit is 4096 characters
            const textData = {
                recipientPhone: '5511999999999',
                whatsappApiKey: 'test-api-key',
                text: longText
            };
            mockedAxios.post.mockResolvedValue({
                data: { messages: [{ id: 'wamid.long' }] }
            });
            const result = await (0, whatsapp_messages_1.sendTextMessage)(textData);
            expect(result.success).toBe(true);
            expect(mockedAxios.post).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
                text: {
                    body: longText
                }
            }), expect.any(Object));
        });
        it('should handle special characters in text', async () => {
            const specialText = 'Hello! 👋 This message contains emojis 🎉 and special chars: @#$%^&*()';
            const textData = {
                recipientPhone: '5511999999999',
                whatsappApiKey: 'test-api-key',
                text: specialText
            };
            mockedAxios.post.mockResolvedValue({
                data: { messages: [{ id: 'wamid.special' }] }
            });
            const result = await (0, whatsapp_messages_1.sendTextMessage)(textData);
            expect(result.success).toBe(true);
            expect(mockedAxios.post).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
                text: {
                    body: specialText
                }
            }), expect.any(Object));
        });
    });
    describe('formatPhoneNumber', () => {
        it('should format Brazilian phone numbers correctly', () => {
            const testCases = [
                { input: '11999999999', expected: '5511999999999' },
                { input: '5511999999999', expected: '5511999999999' },
                { input: '+55 11 99999-9999', expected: '5511999999999' },
                { input: '(11) 99999-9999', expected: '5511999999999' },
                { input: '11 99999-9999', expected: '5511999999999' },
                { input: '11 9 9999-9999', expected: '5511999999999' }
            ];
            for (const { input, expected } of testCases) {
                expect((0, whatsapp_messages_1.formatPhoneNumber)(input)).toBe(expected);
            }
        });
        it('should handle invalid phone numbers', () => {
            const invalidNumbers = [
                '',
                'abc',
                '123',
                'invalid-phone',
                null,
                undefined
            ];
            for (const invalid of invalidNumbers) {
                expect((0, whatsapp_messages_1.formatPhoneNumber)(invalid)).toBeNull();
            }
        });
        it('should handle international numbers with country code', () => {
            const testCases = [
                { input: '5511999999999', expected: '5511999999999' },
                { input: '+5511999999999', expected: '5511999999999' },
                { input: '55 11 99999-9999', expected: '5511999999999' }
            ];
            for (const { input, expected } of testCases) {
                expect((0, whatsapp_messages_1.formatPhoneNumber)(input)).toBe(expected);
            }
        });
    });
    describe('Edge Cases', () => {
        it('should handle missing environment variables', async () => {
            delete process.env.FROM_PHONE_NUMBER_ID;
            const textData = {
                recipientPhone: '5511999999999',
                whatsappApiKey: 'test-api-key',
                text: 'Test message'
            };
            mockedAxios.post.mockResolvedValue({
                data: { messages: [{ id: 'wamid.test' }] }
            });
            const result = await (0, whatsapp_messages_1.sendTextMessage)(textData);
            expect(result.success).toBe(true);
            expect(mockedAxios.post).toHaveBeenCalledWith('https://graph.facebook.com/v22.0//messages', // Empty phone number ID
            expect.any(Object), expect.any(Object));
        });
        it('should handle malformed API responses', async () => {
            const textData = {
                recipientPhone: '5511999999999',
                whatsappApiKey: 'test-api-key',
                text: 'Test message'
            };
            // Mock response without messages array
            mockedAxios.post.mockResolvedValue({
                data: { status: 'sent' }
            });
            const result = await (0, whatsapp_messages_1.sendTextMessage)(textData);
            expect(result).toEqual({
                success: true,
                messageId: undefined,
                details: { status: 'sent' }
            });
        });
        it('should handle rate limiting errors', async () => {
            const textData = {
                recipientPhone: '5511999999999',
                whatsappApiKey: 'test-api-key',
                text: 'Test message'
            };
            const rateLimitError = {
                response: {
                    data: {
                        error: {
                            message: 'Rate limit exceeded',
                            code: 4,
                            error_subcode: 2018109
                        }
                    }
                }
            };
            mockedAxios.post.mockRejectedValue(rateLimitError);
            const result = await (0, whatsapp_messages_1.sendTextMessage)(textData);
            expect(result).toEqual({
                success: false,
                error: 'Rate limit exceeded',
                details: rateLimitError.response.data
            });
        });
    });
});
