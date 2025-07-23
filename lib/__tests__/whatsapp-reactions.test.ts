/**
 * Unit Tests for WhatsApp Reactions Service
 * Tests reaction sending functionality in isolation
 * Requirements: 2.3
 */

import axios from 'axios';
import {
  sendReactionMessage,
  logReactionAttempt,
  ReactionMessageData
} from '../whatsapp-reactions';

// Mock dependencies
jest.mock('axios');
jest.mock('@/app/lib', () => ({
  getWhatsAppConfig: jest.fn(),
  getWhatsAppApiUrl: jest.fn()
}));
jest.mock('@/auth', () => ({
  auth: jest.fn()
}));
jest.mock('@/lib/db');

const mockedAxios = axios as jest.Mocked<typeof axios>;

// Import mocked modules
import { getWhatsAppConfig, getWhatsAppApiUrl } from '@/app/lib';
import { auth } from '@/auth';

describe('WhatsApp Reactions Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('sendReactionMessage', () => {
    it('should send reaction with provided API key successfully', async () => {
      const reactionData: ReactionMessageData = {
        recipientPhone: '5511999999999',
        messageId: 'wamid.original123',
        emoji: '👍',
        whatsappApiKey: 'test-api-key'
      };

      const mockSession = { user: { id: 'user123' } };
      const mockConfig = {
        whatsappToken: 'session-token',
        phoneNumberId: 'phone123',
        fbGraphApiBase: 'https://graph.facebook.com/v22.0'
      };
      const mockApiUrl = 'https://graph.facebook.com/v22.0/phone123/messages';

      (auth as jest.Mock).mockResolvedValue(mockSession);
      (getWhatsAppConfig as jest.Mock).mockResolvedValue(mockConfig);
      (getWhatsAppApiUrl as jest.Mock).mockReturnValue(mockApiUrl);

      const mockResponse = {
        data: {
          messages: [{ id: 'wamid.reaction123' }]
        }
      };

      mockedAxios.post.mockResolvedValue(mockResponse);

      const result = await sendReactionMessage(reactionData);

      expect(result).toEqual({
        success: true,
        messageId: 'wamid.reaction123'
      });

      expect(mockedAxios.post).toHaveBeenCalledWith(
        mockApiUrl,
        {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: '5511999999999',
          type: 'reaction',
          reaction: {
            message_id: 'wamid.original123',
            emoji: '👍'
          }
        },
        {
          headers: {
            'Authorization': 'Bearer test-api-key',
            'Content-Type': 'application/json'
          }
        }
      );
    });

    it('should send reaction without provided API key using session config', async () => {
      const reactionData: ReactionMessageData = {
        recipientPhone: '5511999999999',
        messageId: 'wamid.original456',
        emoji: '❤️'
        // No whatsappApiKey provided
      };

      const mockSession = { user: { id: 'user456' } };
      const mockConfig = {
        whatsappToken: 'session-token-456',
        phoneNumberId: 'phone456',
        fbGraphApiBase: 'https://graph.facebook.com/v22.0'
      };
      const mockApiUrl = 'https://graph.facebook.com/v22.0/phone456/messages';

      (auth as jest.Mock).mockResolvedValue(mockSession);
      (getWhatsAppConfig as jest.Mock).mockResolvedValue(mockConfig);
      (getWhatsAppApiUrl as jest.Mock).mockReturnValue(mockApiUrl);

      mockedAxios.post.mockResolvedValue({
        data: { messages: [{ id: 'wamid.reaction456' }] }
      });

      const result = await sendReactionMessage(reactionData);

      expect(result).toEqual({
        success: true,
        messageId: 'wamid.reaction456'
      });

      expect(mockedAxios.post).toHaveBeenCalledWith(
        mockApiUrl,
        expect.objectContaining({
          reaction: {
            message_id: 'wamid.original456',
            emoji: '❤️'
          }
        }),
        {
          headers: {
            'Authorization': 'Bearer session-token-456',
            'Content-Type': 'application/json'
          }
        }
      );
    });

    it('should handle phone number formatting correctly', async () => {
      const testCases = [
        { input: '11999999999', expected: '5511999999999' },
        { input: '5511999999999', expected: '5511999999999' },
        { input: '+55 11 99999-9999', expected: '5511999999999' },
        { input: '(11) 99999-9999', expected: '5511999999999' }
      ];

      const mockSession = { user: { id: 'user123' } };
      const mockConfig = {
        whatsappToken: 'test-token',
        phoneNumberId: 'phone123'
      };

      (auth as jest.Mock).mockResolvedValue(mockSession);
      (getWhatsAppConfig as jest.Mock).mockResolvedValue(mockConfig);
      (getWhatsAppApiUrl as jest.Mock).mockReturnValue('https://api.test.com');

      mockedAxios.post.mockResolvedValue({
        data: { messages: [{ id: 'wamid.test' }] }
      });

      for (const { input, expected } of testCases) {
        const reactionData: ReactionMessageData = {
          recipientPhone: input,
          messageId: 'wamid.test',
          emoji: '👍',
          whatsappApiKey: 'test-key'
        };

        await sendReactionMessage(reactionData);

        expect(mockedAxios.post).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            to: expected
          }),
          expect.any(Object)
        );
      }
    });

    it('should handle invalid phone numbers', async () => {
      const reactionData: ReactionMessageData = {
        recipientPhone: 'invalid-phone',
        messageId: 'wamid.test',
        emoji: '👍',
        whatsappApiKey: 'test-key'
      };

      const result = await sendReactionMessage(reactionData);

      expect(result).toEqual({
        success: false,
        error: 'Número de telefone inválido'
      });

      expect(mockedAxios.post).not.toHaveBeenCalled();
    });

    it('should handle authentication errors', async () => {
      const reactionData: ReactionMessageData = {
        recipientPhone: '5511999999999',
        messageId: 'wamid.test',
        emoji: '👍'
        // No API key and no session
      };

      (auth as jest.Mock).mockResolvedValue(null);

      const result = await sendReactionMessage(reactionData);

      expect(result).toEqual({
        success: false,
        error: 'Usuário não autenticado'
      });

      expect(mockedAxios.post).not.toHaveBeenCalled();
    });

    it('should handle WhatsApp API errors', async () => {
      const reactionData: ReactionMessageData = {
        recipientPhone: '5511999999999',
        messageId: 'wamid.nonexistent',
        emoji: '👍',
        whatsappApiKey: 'test-key'
      };

      const mockSession = { user: { id: 'user123' } };
      const mockConfig = { whatsappToken: 'test-token' };

      (auth as jest.Mock).mockResolvedValue(mockSession);
      (getWhatsAppConfig as jest.Mock).mockResolvedValue(mockConfig);
      (getWhatsAppApiUrl as jest.Mock).mockReturnValue('https://api.test.com');

      const errorResponse = {
        response: {
          data: {
            error: {
              message: 'Message not found',
              code: 131000
            }
          }
        }
      };

      mockedAxios.post.mockRejectedValue(errorResponse);

      const result = await sendReactionMessage(reactionData);

      expect(result).toEqual({
        success: false,
        error: 'Message not found'
      });
    });

    it('should handle network errors', async () => {
      const reactionData: ReactionMessageData = {
        recipientPhone: '5511999999999',
        messageId: 'wamid.test',
        emoji: '👍',
        whatsappApiKey: 'test-key'
      };

      const mockSession = { user: { id: 'user123' } };
      const mockConfig = { whatsappToken: 'test-token' };

      (auth as jest.Mock).mockResolvedValue(mockSession);
      (getWhatsAppConfig as jest.Mock).mockResolvedValue(mockConfig);
      (getWhatsAppApiUrl as jest.Mock).mockReturnValue('https://api.test.com');

      mockedAxios.post.mockRejectedValue(new Error('Network timeout'));

      const result = await sendReactionMessage(reactionData);

      expect(result).toEqual({
        success: false,
        error: 'Network timeout'
      });
    });

    it('should handle configuration errors', async () => {
      const reactionData: ReactionMessageData = {
        recipientPhone: '5511999999999',
        messageId: 'wamid.test',
        emoji: '👍',
        whatsappApiKey: 'test-key'
      };

      const mockSession = { user: { id: 'user123' } };

      (auth as jest.Mock).mockResolvedValue(mockSession);
      (getWhatsAppConfig as jest.Mock).mockRejectedValue(
        new Error('WhatsApp configuration not found')
      );

      const result = await sendReactionMessage(reactionData);

      expect(result).toEqual({
        success: false,
        error: 'WhatsApp configuration not found'
      });
    });
  });

  describe('logReactionAttempt', () => {
    let consoleSpy: jest.SpyInstance;

    beforeEach(() => {
      consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    });

    afterEach(() => {
      consoleSpy.mockRestore();
    });

    it('should log successful reaction attempt', async () => {
      const logData = {
        recipientPhone: '5511999999999',
        messageId: 'wamid.test123',
        emoji: '👍',
        buttonId: 'like_button',
        success: true
      };

      await logReactionAttempt(logData);

      expect(consoleSpy).toHaveBeenCalledWith(
        '[WhatsApp Reactions] Tentativa de reação registrada:',
        expect.objectContaining({
          timestamp: expect.any(String),
          recipientPhone: '5511999999999',
          messageId: 'wamid.test123',
          emoji: '👍',
          buttonId: 'like_button',
          success: true,
          error: undefined
        })
      );
    });

    it('should log failed reaction attempt with error', async () => {
      const logData = {
        recipientPhone: '5511999999999',
        messageId: 'wamid.test456',
        emoji: '❤️',
        buttonId: 'love_button',
        success: false,
        error: 'Message not found'
      };

      await logReactionAttempt(logData);

      expect(consoleSpy).toHaveBeenCalledWith(
        '[WhatsApp Reactions] Tentativa de reação registrada:',
        expect.objectContaining({
          timestamp: expect.any(String),
          recipientPhone: '5511999999999',
          messageId: 'wamid.test456',
          emoji: '❤️',
          buttonId: 'love_button',
          success: false,
          error: 'Message not found'
        })
      );
    });

    it('should handle logging errors gracefully', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      
      // Force an error in the logging function
      consoleSpy.mockImplementation(() => {
        throw new Error('Console error');
      });

      const logData = {
        recipientPhone: '5511999999999',
        messageId: 'wamid.test',
        emoji: '👍',
        buttonId: 'test_button',
        success: true
      };

      // Should not throw an error
      await expect(logReactionAttempt(logData)).resolves.toBeUndefined();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[WhatsApp Reactions] Erro ao registrar tentativa de reação:',
        expect.any(Error)
      );

      consoleErrorSpy.mockRestore();
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty emoji', async () => {
      const reactionData: ReactionMessageData = {
        recipientPhone: '5511999999999',
        messageId: 'wamid.test',
        emoji: '',
        whatsappApiKey: 'test-key'
      };

      const mockSession = { user: { id: 'user123' } };
      const mockConfig = { whatsappToken: 'test-token' };

      (auth as jest.Mock).mockResolvedValue(mockSession);
      (getWhatsAppConfig as jest.Mock).mockResolvedValue(mockConfig);
      (getWhatsAppApiUrl as jest.Mock).mockReturnValue('https://api.test.com');

      mockedAxios.post.mockResolvedValue({
        data: { messages: [{ id: 'wamid.test' }] }
      });

      const result = await sendReactionMessage(reactionData);

      expect(result.success).toBe(true);
      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          reaction: {
            message_id: 'wamid.test',
            emoji: ''
          }
        }),
        expect.any(Object)
      );
    });

    it('should handle special emoji characters', async () => {
      const specialEmojis = ['🎉', '🚀', '💯', '🔥', '⭐'];

      const mockSession = { user: { id: 'user123' } };
      const mockConfig = { whatsappToken: 'test-token' };

      (auth as jest.Mock).mockResolvedValue(mockSession);
      (getWhatsAppConfig as jest.Mock).mockResolvedValue(mockConfig);
      (getWhatsAppApiUrl as jest.Mock).mockReturnValue('https://api.test.com');

      mockedAxios.post.mockResolvedValue({
        data: { messages: [{ id: 'wamid.test' }] }
      });

      for (const emoji of specialEmojis) {
        const reactionData: ReactionMessageData = {
          recipientPhone: '5511999999999',
          messageId: 'wamid.test',
          emoji,
          whatsappApiKey: 'test-key'
        };

        const result = await sendReactionMessage(reactionData);

        expect(result.success).toBe(true);
        expect(mockedAxios.post).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            reaction: {
              message_id: 'wamid.test',
              emoji
            }
          }),
          expect.any(Object)
        );
      }
    });

    it('should handle very long message IDs', async () => {
      const longMessageId = 'wamid.' + 'a'.repeat(100);

      const reactionData: ReactionMessageData = {
        recipientPhone: '5511999999999',
        messageId: longMessageId,
        emoji: '👍',
        whatsappApiKey: 'test-key'
      };

      const mockSession = { user: { id: 'user123' } };
      const mockConfig = { whatsappToken: 'test-token' };

      (auth as jest.Mock).mockResolvedValue(mockSession);
      (getWhatsAppConfig as jest.Mock).mockResolvedValue(mockConfig);
      (getWhatsAppApiUrl as jest.Mock).mockReturnValue('https://api.test.com');

      mockedAxios.post.mockResolvedValue({
        data: { messages: [{ id: 'wamid.reaction' }] }
      });

      const result = await sendReactionMessage(reactionData);

      expect(result.success).toBe(true);
      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          reaction: {
            message_id: longMessageId,
            emoji: '👍'
          }
        }),
        expect.any(Object)
      );
    });
  });
});