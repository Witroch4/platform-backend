/**
 * Unit Tests for Dialogflow Database Queries
 * Tests database query functions in isolation with mocked Prisma
 * Requirements: 1.3, 4.4
 */

import {
  findCompleteMessageMappingByIntent,
  findReactionByButtonId,
  getAllActiveButtonReactions,
  testDatabaseConnection,
  closeDatabaseConnection
} from '../dialogflow-database-queries';

// Mock Prisma
const mockPrisma = {
  mapeamentoIntencao: {
    findUnique: jest.fn()
  },
  buttonReactionMapping: {
    findUnique: jest.fn(),
    findMany: jest.fn()
  },
  $queryRaw: jest.fn(),
  $disconnect: jest.fn()
};

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn(() => mockPrisma)
}));

// Mock config-based button reactions
jest.mock('@/app/config/button-reaction-mapping', () => ({
  getEmojiForButton: jest.fn(),
  getAllButtonReactions: jest.fn()
}));

import { getEmojiForButton, getAllButtonReactions } from '@/app/config/button-reaction-mapping';

describe('Dialogflow Database Queries', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('findCompleteMessageMappingByIntent', () => {
    it('should find complete template message mapping', async () => {
      const mockMapping = {
        id: 'mapping-123',
        intentName: 'welcome',
        inboxId: 'caixa-456',
        templateId: 'template-789',
        mensagemInterativaId: null,
        unifiedTemplateId: null,
        interactiveMessageId: null,
        chatwitInbox: {
          whatsAppGlobalConfig: {
            phoneNumberId: 'phone-123',
            whatsappToken: 'token-456',
            whatsappBusinessAccountId: 'business-789',
            fbGraphApiBase: 'https://graph.facebook.com/v22.0'
          }
        },
        template: {
          id: 'template-789',
          templateId: 'welcome_template',
          name: 'welcome',
          status: 'APPROVED',
          category: 'MARKETING',
          language: 'pt_BR',
          components: [
            {
              type: 'BODY',
              text: 'Olá {{1}}, bem-vindo!'
            }
          ],
          qualityScore: 'GREEN'
        },
        mensagemInterativa: null,
        unifiedTemplate: null,
        interactiveMessage: null
      };

      mockPrisma.mapeamentoIntencao.findUnique.mockResolvedValue(mockMapping);

      const result = await findCompleteMessageMappingByIntent('welcome', 'caixa-456');

      expect(result).toEqual({
        id: 'mapping-123',
        intentName: 'welcome',
        inboxId: 'caixa-456',
        messageType: 'template',
        template: {
          id: 'template-789',
          templateId: 'welcome_template',
          name: 'welcome',
          status: 'APPROVED',
          category: 'MARKETING',
          language: 'pt_BR',
          components: [
            {
              type: 'BODY',
              text: 'Olá {{1}}, bem-vindo!'
            }
          ],
          qualityScore: 'GREEN'
        },
        whatsappConfig: {
          phoneNumberId: 'phone-123',
          whatsappToken: 'token-456',
          whatsappBusinessAccountId: 'business-789',
          fbGraphApiBase: 'https://graph.facebook.com/v22.0'
        }
      });

      expect(mockPrisma.mapeamentoIntencao.findUnique).toHaveBeenCalledWith({
        where: {
          intentName_inboxId: {
            intentName: 'welcome',
            inboxId: 'caixa-456'
          }
        },
        include: expect.objectContaining({
          chatwitInbox: {
            include: {
              whatsAppGlobalConfig: true,
              usuarioChatwit: true
            }
          },
          template: true,
          mensagemInterativa: {
            include: {
              botoes: {
                orderBy: { ordem: 'asc' }
              }
            }
          }
        })
      });
    });

    it('should find complete interactive message mapping', async () => {
      const mockMapping = {
        id: 'mapping-456',
        intentName: 'menu',
        inboxId: 'caixa-789',
        templateId: null,
        mensagemInterativaId: 'interactive-123',
        chatwitInbox: {
          whatsAppGlobalConfig: {
            phoneNumberId: 'phone-456',
            whatsappToken: 'token-789',
            whatsappBusinessAccountId: 'business-123',
            fbGraphApiBase: 'https://graph.facebook.com/v22.0'
          }
        },
        template: null,
        mensagemInterativa: {
          id: 'interactive-123',
          nome: 'Menu Principal',
          tipo: 'buttons',
          texto: 'Escolha uma opção:',
          headerTipo: 'text',
          headerConteudo: 'Menu',
          rodape: 'Powered by ChatWit',
          botoes: [
            { id: 'option1', titulo: 'Opção 1', ordem: 1 },
            { id: 'option2', titulo: 'Opção 2', ordem: 2 }
          ]
        },
        unifiedTemplate: null,
        interactiveMessage: null
      };

      mockPrisma.mapeamentoIntencao.findUnique.mockResolvedValue(mockMapping);

      const result = await findCompleteMessageMappingByIntent('menu', 'caixa-789');

      expect(result).toEqual({
        id: 'mapping-456',
        intentName: 'menu',
        inboxId: 'caixa-789',
        messageType: 'interactive',
        interactiveMessage: {
          id: 'interactive-123',
          nome: 'Menu Principal',
          tipo: 'buttons',
          texto: 'Escolha uma opção:',
          headerTipo: 'text',
          headerConteudo: 'Menu',
          rodape: 'Powered by ChatWit',
          botoes: [
            { id: 'option1', titulo: 'Opção 1', ordem: 1 },
            { id: 'option2', titulo: 'Opção 2', ordem: 2 }
          ]
        },
        whatsappConfig: {
          phoneNumberId: 'phone-456',
          whatsappToken: 'token-789',
          whatsappBusinessAccountId: 'business-123',
          fbGraphApiBase: 'https://graph.facebook.com/v22.0'
        }
      });
    });

    it('should use environment fallback when WhatsApp config is missing', async () => {
      const mockMapping = {
        id: 'mapping-789',
        intentName: 'test',
        inboxId: 'caixa-123',
        templateId: 'template-456',
        chatwitInbox: {
          whatsAppGlobalConfig: null // No WhatsApp config
        },
        template: {
          id: 'template-456',
          templateId: 'test_template',
          name: 'test',
          status: 'APPROVED',
          category: 'UTILITY',
          language: 'pt_BR',
          components: []
        },
        mensagemInterativa: null,
        unifiedTemplate: null,
        interactiveMessage: null
      };

      // Mock environment variables
      process.env.FROM_PHONE_NUMBER_ID = 'env-phone-123';
      process.env.WHATSAPP_TOKEN = 'env-token-456';
      process.env.WHATSAPP_BUSINESS_ID = 'env-business-789';

      mockPrisma.mapeamentoIntencao.findUnique.mockResolvedValue(mockMapping);

      const result = await findCompleteMessageMappingByIntent('test', 'caixa-123');

      expect(result?.whatsappConfig).toEqual({
        phoneNumberId: 'env-phone-123',
        whatsappToken: 'env-token-456',
        whatsappBusinessAccountId: 'env-business-789',
        fbGraphApiBase: 'https://graph.facebook.com/v22.0'
      });

      // Clean up environment variables
      delete process.env.FROM_PHONE_NUMBER_ID;
      delete process.env.WHATSAPP_TOKEN;
      delete process.env.WHATSAPP_BUSINESS_ID;
    });

    it('should return null when no mapping is found', async () => {
      mockPrisma.mapeamentoIntencao.findUnique.mockResolvedValue(null);

      const result = await findCompleteMessageMappingByIntent('nonexistent', 'caixa-123');

      expect(result).toBeNull();
    });

    it('should return null when mapping has no message data', async () => {
      const mockMapping = {
        id: 'mapping-empty',
        intentName: 'empty',
        inboxId: 'caixa-123',
        templateId: null,
        mensagemInterativaId: null,
        unifiedTemplateId: null,
        interactiveMessageId: null,
        chatwitInbox: {
          whatsAppGlobalConfig: {
            phoneNumberId: 'phone-123',
            whatsappToken: 'token-456',
            whatsappBusinessAccountId: 'business-789',
            fbGraphApiBase: 'https://graph.facebook.com/v22.0'
          }
        },
        template: null,
        mensagemInterativa: null,
        unifiedTemplate: null,
        interactiveMessage: null
      };

      mockPrisma.mapeamentoIntencao.findUnique.mockResolvedValue(mockMapping);

      const result = await findCompleteMessageMappingByIntent('empty', 'caixa-123');

      expect(result).toBeNull();
    });

    it('should handle database errors gracefully', async () => {
      mockPrisma.mapeamentoIntencao.findUnique.mockRejectedValue(
        new Error('Database connection failed')
      );

      await expect(
        findCompleteMessageMappingByIntent('test', 'caixa-123')
      ).rejects.toThrow('Database query failed: Database connection failed');
    });
  });

  describe('findReactionByButtonId', () => {
    it('should find button reaction from database', async () => {
      const mockReaction = {
        id: 'reaction-123',
        buttonId: 'like_button',
        emoji: '👍',
        description: 'Like reaction',
        isActive: true
      };

      mockPrisma.buttonReactionMapping = {
        findUnique: jest.fn().mockResolvedValue(mockReaction)
      };

      const result = await findReactionByButtonId('like_button');

      expect(result).toEqual({
        id: 'reaction-123',
        buttonId: 'like_button',
        emoji: '👍',
        description: 'Like reaction',
        isActive: true
      });
    });

    it('should fallback to config when database model does not exist', async () => {
      // Simulate database model not existing
      mockPrisma.buttonReactionMapping = undefined;

      (getEmojiForButton as jest.Mock).mockReturnValue('❤️');

      const result = await findReactionByButtonId('love_button');

      expect(result).toEqual({
        id: 'config-love_button',
        buttonId: 'love_button',
        emoji: '❤️',
        description: 'Config-based reaction for love_button',
        isActive: true
      });

      expect(getEmojiForButton).toHaveBeenCalledWith('love_button');
    });

    it('should return null when no reaction is found', async () => {
      mockPrisma.buttonReactionMapping = {
        findUnique: jest.fn().mockResolvedValue(null)
      };

      (getEmojiForButton as jest.Mock).mockReturnValue(null);

      const result = await findReactionByButtonId('nonexistent_button');

      expect(result).toBeNull();
    });

    it('should ignore inactive database reactions', async () => {
      const mockInactiveReaction = {
        id: 'reaction-456',
        buttonId: 'inactive_button',
        emoji: '😴',
        description: 'Inactive reaction',
        isActive: false
      };

      mockPrisma.buttonReactionMapping = {
        findUnique: jest.fn().mockResolvedValue(mockInactiveReaction)
      };

      (getEmojiForButton as jest.Mock).mockReturnValue('⚡');

      const result = await findReactionByButtonId('inactive_button');

      expect(result).toEqual({
        id: 'config-inactive_button',
        buttonId: 'inactive_button',
        emoji: '⚡',
        description: 'Config-based reaction for inactive_button',
        isActive: true
      });
    });

    it('should handle database errors gracefully', async () => {
      mockPrisma.buttonReactionMapping = {
        findUnique: jest.fn().mockRejectedValue(new Error('Database error'))
      };

      await expect(findReactionByButtonId('error_button')).rejects.toThrow(
        'Database query failed: Database error'
      );
    });
  });

  describe('getAllActiveButtonReactions', () => {
    it('should get all active reactions from database', async () => {
      const mockReactions = [
        {
          id: 'reaction-1',
          buttonId: 'like',
          emoji: '👍',
          description: 'Like',
          isActive: true
        },
        {
          id: 'reaction-2',
          buttonId: 'love',
          emoji: '❤️',
          description: 'Love',
          isActive: true
        }
      ];

      mockPrisma.buttonReactionMapping = {
        findMany: jest.fn().mockResolvedValue(mockReactions)
      };

      const result = await getAllActiveButtonReactions();

      expect(result).toEqual([
        {
          id: 'reaction-1',
          buttonId: 'like',
          emoji: '👍',
          description: 'Like',
          isActive: true
        },
        {
          id: 'reaction-2',
          buttonId: 'love',
          emoji: '❤️',
          description: 'Love',
          isActive: true
        }
      ]);

      expect(mockPrisma.buttonReactionMapping.findMany).toHaveBeenCalledWith({
        where: { isActive: true },
        orderBy: { buttonId: 'asc' }
      });
    });

    it('should fallback to config when database is empty', async () => {
      mockPrisma.buttonReactionMapping = {
        findMany: jest.fn().mockResolvedValue([])
      };

      const mockConfigReactions = [
        { buttonId: 'config_like', emoji: '👍', description: 'Config like' },
        { buttonId: 'config_love', emoji: '❤️', description: 'Config love' }
      ];

      (getAllButtonReactions as jest.Mock).mockReturnValue(mockConfigReactions);

      const result = await getAllActiveButtonReactions();

      expect(result).toEqual([
        {
          id: 'config-0',
          buttonId: 'config_like',
          emoji: '👍',
          description: 'Config like',
          isActive: true
        },
        {
          id: 'config-1',
          buttonId: 'config_love',
          emoji: '❤️',
          description: 'Config love',
          isActive: true
        }
      ]);
    });

    it('should handle database errors gracefully', async () => {
      mockPrisma.buttonReactionMapping = {
        findMany: jest.fn().mockRejectedValue(new Error('Database error'))
      };

      await expect(getAllActiveButtonReactions()).rejects.toThrow(
        'Database query failed: Database error'
      );
    });
  });

  describe('testDatabaseConnection', () => {
    it('should return true for successful connection', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);

      const result = await testDatabaseConnection();

      expect(result).toBe(true);
      expect(mockPrisma.$queryRaw).toHaveBeenCalledWith(expect.anything());
    });

    it('should return false for failed connection', async () => {
      mockPrisma.$queryRaw.mockRejectedValue(new Error('Connection failed'));

      const result = await testDatabaseConnection();

      expect(result).toBe(false);
    });
  });

  describe('closeDatabaseConnection', () => {
    it('should close database connection', async () => {
      mockPrisma.$disconnect.mockResolvedValue(undefined);

      await closeDatabaseConnection();

      expect(mockPrisma.$disconnect).toHaveBeenCalled();
    });
  });

  describe('Message Type Priority', () => {
    it('should prioritize unified template over other types', async () => {
      const mockMapping = {
        id: 'mapping-priority',
        intentName: 'priority_test',
        inboxId: 'caixa-priority',
        templateId: 'template-123',
        mensagemInterativaId: 'interactive-456',
        unifiedTemplateId: 'unified-789',
        chatwitInbox: {
          whatsAppGlobalConfig: {
            phoneNumberId: 'phone-123',
            whatsappToken: 'token-456',
            whatsappBusinessAccountId: 'business-789',
            fbGraphApiBase: 'https://graph.facebook.com/v22.0'
          }
        },
        template: { id: 'template-123', templateId: 'test', name: 'test' },
        mensagemInterativa: { id: 'interactive-456', texto: 'test' },
        unifiedTemplate: {
          id: 'unified-789',
          name: 'Unified Test',
          type: 'interactive',
          scope: 'global',
          language: 'pt_BR'
        },
        interactiveMessage: null
      };

      mockPrisma.mapeamentoIntencao.findUnique.mockResolvedValue(mockMapping);

      const result = await findCompleteMessageMappingByIntent('priority_test', 'caixa-priority');

      expect(result?.messageType).toBe('unified_template');
      expect(result?.unifiedTemplate).toBeDefined();
    });
  });
});