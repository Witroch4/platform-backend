/**
 * Unit tests for credential fallback resolution with loop detection
 * Requirements: 1.1, 1.2, 1.3, 2.2, 2.3, 8.1, 8.2
 */

import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals';

// Mock dependencies
jest.mock('@/lib/cache/credentials-cache');
jest.mock('@/lib/prisma');

describe('Credential Fallback Resolver', () => {
  let CredentialsFallbackResolver: any;
  let mockPrisma: any;
  let mockCredentialsCache: any;

  beforeEach(async () => {
    jest.clearAllMocks();

    // Mock Prisma
    mockPrisma = {
      chatwitInbox: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
    };

    jest.doMock('@/lib/prisma', () => ({
      prisma: mockPrisma,
    }));

    // Mock credentials cache
    mockCredentialsCache = {
      getCredentials: jest.fn(),
      setCredentials: jest.fn(),
    };

    jest.doMock('@/lib/cache/credentials-cache', () => ({
      credentialsCache: mockCredentialsCache,
    }));

    // Import after mocking
    const module = await import('@/worker/WebhookWorkerTasks/persistencia.worker.task');
    CredentialsFallbackResolver = module.CredentialsFallbackResolver;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Basic Credential Resolution', () => {
    test('should return cached credentials when available', async () => {
      const mockCredentials = {
        whatsappApiKey: 'cached-key',
        phoneNumberId: '123456789',
        businessId: 'business123',
        inboxId: '4',
        source: 'inbox',
        updatedAt: new Date(),
      };

      mockCredentialsCache.getCredentials.mockResolvedValue(mockCredentials);

      const result = await CredentialsFallbackResolver.resolveCredentials('4');

      expect(mockCredentialsCache.getCredentials).toHaveBeenCalledWith('4');
      expect(result).toEqual(mockCredentials);
      expect(mockPrisma.chatwitInbox.findFirst).not.toHaveBeenCalled();
    });

    test('should query database when cache miss occurs', async () => {
      mockCredentialsCache.getCredentials.mockResolvedValue(null);

      const mockInbox = {
        inboxId: '4',
        whatsappApiKey: 'db-key',
        phoneNumberId: '123456789',
        whatsappBusinessAccountId: 'business123',
        updatedAt: new Date(),
        usuarioChatwit: {
          configuracaoGlobalWhatsApp: null,
        },
        fallbackParaInbox: null,
        fallbackParaInboxId: null,
      };

      mockPrisma.chatwitInbox.findFirst.mockResolvedValue(mockInbox);

      const result = await CredentialsFallbackResolver.resolveCredentials('4');

      expect(mockPrisma.chatwitInbox.findFirst).toHaveBeenCalledWith({
        where: { inboxId: '4' },
        include: {
          usuarioChatwit: {
            include: {
              configuracaoGlobalWhatsApp: true,
            },
          },
          fallbackParaInbox: true,
        },
      });

      expect(result).toEqual({
        whatsappApiKey: 'db-key',
        phoneNumberId: '123456789',
        businessId: 'business123',
        inboxId: '4',
        source: 'inbox',
        updatedAt: mockInbox.updatedAt,
      });

      expect(mockCredentialsCache.setCredentials).toHaveBeenCalledWith('4', result);
    });

    test('should return null when inbox not found', async () => {
      mockCredentialsCache.getCredentials.mockResolvedValue(null);
      mockPrisma.chatwitInbox.findFirst.mockResolvedValue(null);

      const result = await CredentialsFallbackResolver.resolveCredentials('nonexistent');

      expect(result).toBeNull();
    });

    test('should return null when inbox has no credentials', async () => {
      mockCredentialsCache.getCredentials.mockResolvedValue(null);

      const mockInbox = {
        inboxId: '4',
        whatsappApiKey: null,
        phoneNumberId: null,
        whatsappBusinessAccountId: null,
        usuarioChatwit: {
          configuracaoGlobalWhatsApp: null,
        },
        fallbackParaInbox: null,
        fallbackParaInboxId: null,
      };

      mockPrisma.chatwitInbox.findFirst.mockResolvedValue(mockInbox);

      const result = await CredentialsFallbackResolver.resolveCredentials('4');

      expect(result).toBeNull();
    });
  });

  describe('Fallback Chain Resolution', () => {
    test('should resolve credentials from fallback inbox', async () => {
      mockCredentialsCache.getCredentials.mockResolvedValue(null);

      // First inbox has no credentials but has fallback
      const mockInbox1 = {
        inboxId: '4',
        whatsappApiKey: null,
        phoneNumberId: null,
        whatsappBusinessAccountId: null,
        fallbackParaInboxId: '5',
        usuarioChatwit: {
          configuracaoGlobalWhatsApp: null,
        },
        fallbackParaInbox: null,
      };

      // Fallback inbox has credentials
      const mockInbox2 = {
        inboxId: '5',
        whatsappApiKey: 'fallback-key',
        phoneNumberId: '987654321',
        whatsappBusinessAccountId: 'fallback-business',
        updatedAt: new Date(),
        usuarioChatwit: {
          configuracaoGlobalWhatsApp: null,
        },
        fallbackParaInbox: null,
        fallbackParaInboxId: null,
      };

      mockPrisma.chatwitInbox.findFirst
        .mockResolvedValueOnce(mockInbox1)
        .mockResolvedValueOnce(mockInbox2);

      const result = await CredentialsFallbackResolver.resolveCredentials('4');

      expect(result).toEqual({
        whatsappApiKey: 'fallback-key',
        phoneNumberId: '987654321',
        businessId: 'fallback-business',
        inboxId: '5',
        source: 'fallback',
        updatedAt: mockInbox2.updatedAt,
      });

      // Should cache the fallback credentials for the original inbox
      expect(mockCredentialsCache.setCredentials).toHaveBeenCalledWith('4', result);
    });

    test('should resolve credentials from global configuration', async () => {
      mockCredentialsCache.getCredentials.mockResolvedValue(null);

      const mockGlobalConfig = {
        whatsappApiKey: 'global-key',
        phoneNumberId: '111111111',
        whatsappBusinessAccountId: 'global-business',
        updatedAt: new Date(),
      };

      const mockInbox = {
        inboxId: '4',
        whatsappApiKey: null,
        phoneNumberId: null,
        whatsappBusinessAccountId: null,
        fallbackParaInboxId: null,
        usuarioChatwit: {
          configuracaoGlobalWhatsApp: mockGlobalConfig,
        },
        fallbackParaInbox: null,
      };

      mockPrisma.chatwitInbox.findFirst.mockResolvedValue(mockInbox);

      const result = await CredentialsFallbackResolver.resolveCredentials('4');

      expect(result).toEqual({
        whatsappApiKey: 'global-key',
        phoneNumberId: '111111111',
        businessId: 'global-business',
        inboxId: '4',
        source: 'global',
        updatedAt: mockGlobalConfig.updatedAt,
      });
    });

    test('should handle complex fallback chain', async () => {
      mockCredentialsCache.getCredentials.mockResolvedValue(null);

      // Chain: 4 -> 5 -> 6 (6 has credentials)
      const mockInbox4 = {
        inboxId: '4',
        whatsappApiKey: null,
        phoneNumberId: null,
        whatsappBusinessAccountId: null,
        fallbackParaInboxId: '5',
        usuarioChatwit: { configuracaoGlobalWhatsApp: null },
        fallbackParaInbox: null,
      };

      const mockInbox5 = {
        inboxId: '5',
        whatsappApiKey: null,
        phoneNumberId: null,
        whatsappBusinessAccountId: null,
        fallbackParaInboxId: '6',
        usuarioChatwit: { configuracaoGlobalWhatsApp: null },
        fallbackParaInbox: null,
      };

      const mockInbox6 = {
        inboxId: '6',
        whatsappApiKey: 'final-key',
        phoneNumberId: '666666666',
        whatsappBusinessAccountId: 'final-business',
        updatedAt: new Date(),
        usuarioChatwit: { configuracaoGlobalWhatsApp: null },
        fallbackParaInbox: null,
        fallbackParaInboxId: null,
      };

      mockPrisma.chatwitInbox.findFirst
        .mockResolvedValueOnce(mockInbox4)
        .mockResolvedValueOnce(mockInbox5)
        .mockResolvedValueOnce(mockInbox6);

      const result = await CredentialsFallbackResolver.resolveCredentials('4');

      expect(result).toEqual({
        whatsappApiKey: 'final-key',
        phoneNumberId: '666666666',
        businessId: 'final-business',
        inboxId: '6',
        source: 'fallback',
        updatedAt: mockInbox6.updatedAt,
      });
    });
  });

  describe('Loop Detection', () => {
    test('should detect simple loop (A -> B -> A)', async () => {
      mockCredentialsCache.getCredentials.mockResolvedValue(null);

      const mockInboxA = {
        inboxId: 'A',
        whatsappApiKey: null,
        phoneNumberId: null,
        whatsappBusinessAccountId: null,
        fallbackParaInboxId: 'B',
        usuarioChatwit: { configuracaoGlobalWhatsApp: null },
        fallbackParaInbox: null,
      };

      const mockInboxB = {
        inboxId: 'B',
        whatsappApiKey: null,
        phoneNumberId: null,
        whatsappBusinessAccountId: null,
        fallbackParaInboxId: 'A', // Loop back to A
        usuarioChatwit: { configuracaoGlobalWhatsApp: null },
        fallbackParaInbox: null,
      };

      mockPrisma.chatwitInbox.findFirst
        .mockResolvedValueOnce(mockInboxA)
        .mockResolvedValueOnce(mockInboxB);

      const result = await CredentialsFallbackResolver.resolveCredentials('A');

      expect(result).toBeNull();
    });

    test('should detect complex loop (A -> B -> C -> B)', async () => {
      mockCredentialsCache.getCredentials.mockResolvedValue(null);

      const mockInboxA = {
        inboxId: 'A',
        whatsappApiKey: null,
        phoneNumberId: null,
        whatsappBusinessAccountId: null,
        fallbackParaInboxId: 'B',
        usuarioChatwit: { configuracaoGlobalWhatsApp: null },
        fallbackParaInbox: null,
      };

      const mockInboxB = {
        inboxId: 'B',
        whatsappApiKey: null,
        phoneNumberId: null,
        whatsappBusinessAccountId: null,
        fallbackParaInboxId: 'C',
        usuarioChatwit: { configuracaoGlobalWhatsApp: null },
        fallbackParaInbox: null,
      };

      const mockInboxC = {
        inboxId: 'C',
        whatsappApiKey: null,
        phoneNumberId: null,
        whatsappBusinessAccountId: null,
        fallbackParaInboxId: 'B', // Loop back to B
        usuarioChatwit: { configuracaoGlobalWhatsApp: null },
        fallbackParaInbox: null,
      };

      mockPrisma.chatwitInbox.findFirst
        .mockResolvedValueOnce(mockInboxA)
        .mockResolvedValueOnce(mockInboxB)
        .mockResolvedValueOnce(mockInboxC);

      const result = await CredentialsFallbackResolver.resolveCredentials('A');

      expect(result).toBeNull();
    });

    test('should respect maximum fallback depth', async () => {
      mockCredentialsCache.getCredentials.mockResolvedValue(null);

      // Create a long chain: 1 -> 2 -> 3 -> 4 -> 5 -> 6 (exceeds MAX_FALLBACK_DEPTH of 5)
      const createMockInbox = (id: string, fallbackId?: string) => ({
        inboxId: id,
        whatsappApiKey: null,
        phoneNumberId: null,
        whatsappBusinessAccountId: null,
        fallbackParaInboxId: fallbackId || null,
        usuarioChatwit: { configuracaoGlobalWhatsApp: null },
        fallbackParaInbox: null,
      });

      mockPrisma.chatwitInbox.findFirst
        .mockResolvedValueOnce(createMockInbox('1', '2'))
        .mockResolvedValueOnce(createMockInbox('2', '3'))
        .mockResolvedValueOnce(createMockInbox('3', '4'))
        .mockResolvedValueOnce(createMockInbox('4', '5'))
        .mockResolvedValueOnce(createMockInbox('5', '6'));

      const result = await CredentialsFallbackResolver.resolveCredentials('1');

      expect(result).toBeNull();
      // Should not query for inbox '6' due to depth limit
      expect(mockPrisma.chatwitInbox.findFirst).toHaveBeenCalledTimes(5);
    });

    test('should handle self-referencing inbox', async () => {
      mockCredentialsCache.getCredentials.mockResolvedValue(null);

      const mockInbox = {
        inboxId: '4',
        whatsappApiKey: null,
        phoneNumberId: null,
        whatsappBusinessAccountId: null,
        fallbackParaInboxId: '4', // Self-reference
        usuarioChatwit: { configuracaoGlobalWhatsApp: null },
        fallbackParaInbox: null,
      };

      mockPrisma.chatwitInbox.findFirst.mockResolvedValue(mockInbox);

      const result = await CredentialsFallbackResolver.resolveCredentials('4');

      expect(result).toBeNull();
    });
  });

  describe('Error Handling', () => {
    test('should handle database errors gracefully', async () => {
      mockCredentialsCache.getCredentials.mockResolvedValue(null);
      mockPrisma.chatwitInbox.findFirst.mockRejectedValue(new Error('Database error'));

      const result = await CredentialsFallbackResolver.resolveCredentials('4');

      expect(result).toBeNull();
    });

    test('should handle cache errors gracefully', async () => {
      mockCredentialsCache.getCredentials.mockRejectedValue(new Error('Cache error'));

      const mockInbox = {
        inboxId: '4',
        whatsappApiKey: 'db-key',
        phoneNumberId: '123456789',
        whatsappBusinessAccountId: 'business123',
        updatedAt: new Date(),
        usuarioChatwit: { configuracaoGlobalWhatsApp: null },
        fallbackParaInbox: null,
        fallbackParaInboxId: null,
      };

      mockPrisma.chatwitInbox.findFirst.mockResolvedValue(mockInbox);

      const result = await CredentialsFallbackResolver.resolveCredentials('4');

      // Should still resolve from database despite cache error
      expect(result).toEqual({
        whatsappApiKey: 'db-key',
        phoneNumberId: '123456789',
        businessId: 'business123',
        inboxId: '4',
        source: 'inbox',
        updatedAt: mockInbox.updatedAt,
      });
    });

    test('should handle cache set errors gracefully', async () => {
      mockCredentialsCache.getCredentials.mockResolvedValue(null);
      mockCredentialsCache.setCredentials.mockRejectedValue(new Error('Cache set error'));

      const mockInbox = {
        inboxId: '4',
        whatsappApiKey: 'db-key',
        phoneNumberId: '123456789',
        whatsappBusinessAccountId: 'business123',
        updatedAt: new Date(),
        usuarioChatwit: { configuracaoGlobalWhatsApp: null },
        fallbackParaInbox: null,
        fallbackParaInboxId: null,
      };

      mockPrisma.chatwitInbox.findFirst.mockResolvedValue(mockInbox);

      const result = await CredentialsFallbackResolver.resolveCredentials('4');

      // Should still return credentials despite cache set error
      expect(result).toEqual({
        whatsappApiKey: 'db-key',
        phoneNumberId: '123456789',
        businessId: 'business123',
        inboxId: '4',
        source: 'inbox',
        updatedAt: mockInbox.updatedAt,
      });
    });

    test('should handle malformed database data', async () => {
      mockCredentialsCache.getCredentials.mockResolvedValue(null);

      const mockInbox = {
        inboxId: '4',
        whatsappApiKey: 'db-key',
        phoneNumberId: '123456789',
        whatsappBusinessAccountId: null, // Missing required field
        updatedAt: new Date(),
        usuarioChatwit: { configuracaoGlobalWhatsApp: null },
        fallbackParaInbox: null,
        fallbackParaInboxId: null,
      };

      mockPrisma.chatwitInbox.findFirst.mockResolvedValue(mockInbox);

      const result = await CredentialsFallbackResolver.resolveCredentials('4');

      expect(result).toBeNull();
    });
  });

  describe('Caching Behavior', () => {
    test('should cache resolved credentials at each level', async () => {
      mockCredentialsCache.getCredentials.mockResolvedValue(null);

      const mockInbox = {
        inboxId: '4',
        whatsappApiKey: 'db-key',
        phoneNumberId: '123456789',
        whatsappBusinessAccountId: 'business123',
        updatedAt: new Date(),
        usuarioChatwit: { configuracaoGlobalWhatsApp: null },
        fallbackParaInbox: null,
        fallbackParaInboxId: null,
      };

      mockPrisma.chatwitInbox.findFirst.mockResolvedValue(mockInbox);

      await CredentialsFallbackResolver.resolveCredentials('4');

      expect(mockCredentialsCache.setCredentials).toHaveBeenCalledWith(
        '4',
        expect.objectContaining({
          whatsappApiKey: 'db-key',
          phoneNumberId: '123456789',
          businessId: 'business123',
          inboxId: '4',
          source: 'inbox',
        })
      );
    });

    test('should cache fallback credentials for original inbox', async () => {
      mockCredentialsCache.getCredentials.mockResolvedValue(null);

      const mockInbox1 = {
        inboxId: '4',
        whatsappApiKey: null,
        phoneNumberId: null,
        whatsappBusinessAccountId: null,
        fallbackParaInboxId: '5',
        usuarioChatwit: { configuracaoGlobalWhatsApp: null },
        fallbackParaInbox: null,
      };

      const mockInbox2 = {
        inboxId: '5',
        whatsappApiKey: 'fallback-key',
        phoneNumberId: '987654321',
        whatsappBusinessAccountId: 'fallback-business',
        updatedAt: new Date(),
        usuarioChatwit: { configuracaoGlobalWhatsApp: null },
        fallbackParaInbox: null,
        fallbackParaInboxId: null,
      };

      mockPrisma.chatwitInbox.findFirst
        .mockResolvedValueOnce(mockInbox1)
        .mockResolvedValueOnce(mockInbox2);

      await CredentialsFallbackResolver.resolveCredentials('4');

      // Should cache fallback credentials for the original inbox (4)
      expect(mockCredentialsCache.setCredentials).toHaveBeenCalledWith(
        '4',
        expect.objectContaining({
          whatsappApiKey: 'fallback-key',
          source: 'fallback',
        })
      );
    });

    test('should not cache when resolution fails', async () => {
      mockCredentialsCache.getCredentials.mockResolvedValue(null);
      mockPrisma.chatwitInbox.findFirst.mockResolvedValue(null);

      await CredentialsFallbackResolver.resolveCredentials('4');

      expect(mockCredentialsCache.setCredentials).not.toHaveBeenCalled();
    });
  });

  describe('Performance Considerations', () => {
    test('should minimize database queries with cache hits', async () => {
      const mockCredentials = {
        whatsappApiKey: 'cached-key',
        phoneNumberId: '123456789',
        businessId: 'business123',
        inboxId: '4',
        source: 'inbox',
        updatedAt: new Date(),
      };

      mockCredentialsCache.getCredentials.mockResolvedValue(mockCredentials);

      await CredentialsFallbackResolver.resolveCredentials('4');

      expect(mockPrisma.chatwitInbox.findFirst).not.toHaveBeenCalled();
    });

    test('should handle concurrent resolution requests', async () => {
      mockCredentialsCache.getCredentials.mockResolvedValue(null);

      const mockInbox = {
        inboxId: '4',
        whatsappApiKey: 'db-key',
        phoneNumberId: '123456789',
        whatsappBusinessAccountId: 'business123',
        updatedAt: new Date(),
        usuarioChatwit: { configuracaoGlobalWhatsApp: null },
        fallbackParaInbox: null,
        fallbackParaInboxId: null,
      };

      mockPrisma.chatwitInbox.findFirst.mockResolvedValue(mockInbox);

      // Simulate concurrent requests
      const promises = [
        CredentialsFallbackResolver.resolveCredentials('4'),
        CredentialsFallbackResolver.resolveCredentials('4'),
        CredentialsFallbackResolver.resolveCredentials('4'),
      ];

      const results = await Promise.all(promises);

      // All should resolve successfully
      results.forEach(result => {
        expect(result).toEqual(expect.objectContaining({
          whatsappApiKey: 'db-key',
          phoneNumberId: '123456789',
          businessId: 'business123',
        }));
      });
    });
  });
});