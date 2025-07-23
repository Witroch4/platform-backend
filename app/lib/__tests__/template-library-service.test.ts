import { TemplateLibraryService, CreateTemplateLibraryData } from '../template-library-service';
import { prisma } from '@/lib/prisma';

// Mock Prisma
jest.mock('@/lib/prisma', () => ({
  prisma: {
    templateLibrary: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    templateApprovalRequest: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
  },
}));

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

describe('TemplateLibraryService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getLibraryItems', () => {
    it('should return templates for user with global and account-specific scope', async () => {
      const mockTemplates = [
        {
          id: '1',
          name: 'Global Template',
          scope: 'global',
          type: 'template',
          createdBy: { id: 'admin', name: 'Admin', email: 'admin@test.com' },
          approvalRequests: [],
        },
        {
          id: '2',
          name: 'User Template',
          scope: 'account_specific',
          type: 'template',
          createdBy: { id: 'user1', name: 'User', email: 'user@test.com' },
          approvalRequests: [],
        },
      ];

      mockPrisma.templateLibrary.findMany.mockResolvedValue(mockTemplates as any);

      const result = await TemplateLibraryService.getLibraryItems('user1');

      expect(mockPrisma.templateLibrary.findMany).toHaveBeenCalledWith({
        where: {
          isActive: true,
          OR: [
            { scope: 'global' },
            { scope: 'account_specific', createdById: 'user1' }
          ]
        },
        include: {
          createdBy: {
            select: {
              id: true,
              name: true,
              email: true
            }
          },
          approvalRequests: {
            where: {
              requestedById: 'user1'
            },
            orderBy: {
              requestedAt: 'desc'
            },
            take: 1
          }
        },
        orderBy: [
          { scope: 'asc' },
          { createdAt: 'desc' }
        ]
      });

      expect(result).toEqual(mockTemplates);
    });

    it('should filter by type when specified', async () => {
      mockPrisma.templateLibrary.findMany.mockResolvedValue([]);

      await TemplateLibraryService.getLibraryItems('user1', 'template');

      expect(mockPrisma.templateLibrary.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            type: 'template'
          })
        })
      );
    });
  });

  describe('saveToLibrary', () => {
    it('should create a new template library item', async () => {
      const templateData: CreateTemplateLibraryData = {
        name: 'Test Template',
        description: 'Test Description',
        type: 'template',
        scope: 'global',
        content: {
          body: 'Hello {{name}}',
          variables: ['name']
        },
        category: 'Marketing',
        language: 'pt_BR',
        tags: ['test'],
        createdById: 'user1'
      };

      const mockCreatedTemplate = {
        id: '1',
        ...templateData,
        isApprovalRequired: true,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockPrisma.templateLibrary.create.mockResolvedValue(mockCreatedTemplate as any);

      const result = await TemplateLibraryService.saveToLibrary(templateData);

      expect(mockPrisma.templateLibrary.create).toHaveBeenCalledWith({
        data: {
          name: templateData.name,
          description: templateData.description,
          type: templateData.type,
          scope: templateData.scope,
          content: templateData.content,
          category: templateData.category,
          language: templateData.language,
          tags: templateData.tags,
          createdById: templateData.createdById,
          isApprovalRequired: true // Templates require approval
        }
      });

      expect(result).toEqual(mockCreatedTemplate);
    });

    it('should set isApprovalRequired to false for interactive messages', async () => {
      const templateData: CreateTemplateLibraryData = {
        name: 'Test Interactive Message',
        type: 'interactive_message',
        scope: 'global',
        content: {
          body: 'Hello {{name}}',
          variables: ['name']
        },
        createdById: 'user1'
      };

      mockPrisma.templateLibrary.create.mockResolvedValue({} as any);

      await TemplateLibraryService.saveToLibrary(templateData);

      expect(mockPrisma.templateLibrary.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          isApprovalRequired: false // Interactive messages don't require approval
        })
      });
    });
  });

  describe('requestApproval', () => {
    it('should create an approval request for a template', async () => {
      const mockTemplate = {
        id: 'template1',
        isApprovalRequired: true
      };

      mockPrisma.templateLibrary.findUnique.mockResolvedValue(mockTemplate as any);
      mockPrisma.templateApprovalRequest.findFirst.mockResolvedValue(null);
      
      const mockApprovalRequest = {
        id: 'request1',
        templateLibraryId: 'template1',
        requestedById: 'user1',
        status: 'pending'
      };

      mockPrisma.templateApprovalRequest.create.mockResolvedValue(mockApprovalRequest as any);

      const result = await TemplateLibraryService.requestApproval(
        'template1',
        'user1',
        'Please approve this template'
      );

      expect(mockPrisma.templateApprovalRequest.create).toHaveBeenCalledWith({
        data: {
          templateLibraryId: 'template1',
          requestedById: 'user1',
          requestMessage: 'Please approve this template',
          customVariables: null,
          status: 'pending'
        }
      });

      expect(result).toEqual(mockApprovalRequest);
    });

    it('should throw error if template not found', async () => {
      mockPrisma.templateLibrary.findUnique.mockResolvedValue(null);

      await expect(
        TemplateLibraryService.requestApproval('nonexistent', 'user1')
      ).rejects.toThrow('Template not found');
    });

    it('should throw error if template does not require approval', async () => {
      const mockTemplate = {
        id: 'template1',
        isApprovalRequired: false
      };

      mockPrisma.templateLibrary.findUnique.mockResolvedValue(mockTemplate as any);

      await expect(
        TemplateLibraryService.requestApproval('template1', 'user1')
      ).rejects.toThrow('This template does not require approval');
    });

    it('should throw error if user already has pending request', async () => {
      const mockTemplate = {
        id: 'template1',
        isApprovalRequired: true
      };

      const mockExistingRequest = {
        id: 'existing',
        status: 'pending'
      };

      mockPrisma.templateLibrary.findUnique.mockResolvedValue(mockTemplate as any);
      mockPrisma.templateApprovalRequest.findFirst.mockResolvedValue(mockExistingRequest as any);

      await expect(
        TemplateLibraryService.requestApproval('template1', 'user1')
      ).rejects.toThrow('You already have a pending approval request for this template');
    });
  });

  describe('processApprovalRequest', () => {
    it('should update approval request status', async () => {
      const mockUpdatedRequest = {
        id: 'request1',
        status: 'approved',
        processedById: 'admin1',
        responseMessage: 'Approved!',
        processedAt: new Date()
      };

      mockPrisma.templateApprovalRequest.update.mockResolvedValue(mockUpdatedRequest as any);

      const result = await TemplateLibraryService.processApprovalRequest(
        'request1',
        'admin1',
        'approved',
        'Approved!'
      );

      expect(mockPrisma.templateApprovalRequest.update).toHaveBeenCalledWith({
        where: { id: 'request1' },
        data: {
          status: 'approved',
          processedById: 'admin1',
          responseMessage: 'Approved!',
          processedAt: expect.any(Date)
        }
      });

      expect(result).toEqual(mockUpdatedRequest);
    });
  });

  describe('useInteractiveMessage', () => {
    it('should process interactive message and increment usage count', async () => {
      const mockMessage = {
        id: 'message1',
        type: 'interactive_message',
        content: {
          body: 'Hello {{name}}',
          variables: ['name']
        }
      };

      mockPrisma.templateLibrary.findUnique.mockResolvedValue(mockMessage as any);
      mockPrisma.templateLibrary.update.mockResolvedValue({} as any);

      const variables = { name: 'John' };
      const result = await TemplateLibraryService.useInteractiveMessage('message1', variables);

      expect(mockPrisma.templateLibrary.update).toHaveBeenCalledWith({
        where: { id: 'message1' },
        data: {
          totalUsageCount: {
            increment: 1
          }
        }
      });

      expect(result.success).toBe(true);
      expect(result.processedContent.body).toBe('Hello John');
    });

    it('should throw error if message not found', async () => {
      mockPrisma.templateLibrary.findUnique.mockResolvedValue(null);

      await expect(
        TemplateLibraryService.useInteractiveMessage('nonexistent', {})
      ).rejects.toThrow('Interactive message not found');
    });

    it('should throw error if not an interactive message', async () => {
      const mockTemplate = {
        id: 'template1',
        type: 'template'
      };

      mockPrisma.templateLibrary.findUnique.mockResolvedValue(mockTemplate as any);

      await expect(
        TemplateLibraryService.useInteractiveMessage('template1', {})
      ).rejects.toThrow('This is not an interactive message');
    });
  });

  describe('updateTemplate', () => {
    it('should allow creator to update template', async () => {
      const mockTemplate = {
        id: 'template1',
        createdById: 'user1'
      };

      const mockUser = {
        id: 'user1',
        role: 'DEFAULT'
      };

      const mockUpdatedTemplate = {
        id: 'template1',
        name: 'Updated Template'
      };

      mockPrisma.templateLibrary.findUnique.mockResolvedValue(mockTemplate as any);
      mockPrisma.user.findUnique.mockResolvedValue(mockUser as any);
      mockPrisma.templateLibrary.update.mockResolvedValue(mockUpdatedTemplate as any);

      const updates = { name: 'Updated Template' };
      const result = await TemplateLibraryService.updateTemplate('template1', 'user1', updates);

      expect(mockPrisma.templateLibrary.update).toHaveBeenCalledWith({
        where: { id: 'template1' },
        data: {
          name: 'Updated Template',
          updatedAt: expect.any(Date)
        }
      });

      expect(result).toEqual(mockUpdatedTemplate);
    });

    it('should allow admin to update any template', async () => {
      const mockTemplate = {
        id: 'template1',
        createdById: 'user1'
      };

      const mockAdmin = {
        id: 'admin1',
        role: 'ADMIN'
      };

      mockPrisma.templateLibrary.findUnique.mockResolvedValue(mockTemplate as any);
      mockPrisma.user.findUnique.mockResolvedValue(mockAdmin as any);
      mockPrisma.templateLibrary.update.mockResolvedValue({} as any);

      await TemplateLibraryService.updateTemplate('template1', 'admin1', { name: 'Updated' });

      expect(mockPrisma.templateLibrary.update).toHaveBeenCalled();
    });

    it('should throw error if user has no permission', async () => {
      const mockTemplate = {
        id: 'template1',
        createdById: 'user1'
      };

      const mockUser = {
        id: 'user2',
        role: 'DEFAULT'
      };

      mockPrisma.templateLibrary.findUnique.mockResolvedValue(mockTemplate as any);
      mockPrisma.user.findUnique.mockResolvedValue(mockUser as any);

      await expect(
        TemplateLibraryService.updateTemplate('template1', 'user2', { name: 'Updated' })
      ).rejects.toThrow('You do not have permission to update this template');
    });
  });

  describe('searchTemplates', () => {
    it('should search templates by name and description', async () => {
      const mockTemplates = [
        {
          id: '1',
          name: 'Marketing Template',
          description: 'For marketing campaigns'
        }
      ];

      mockPrisma.templateLibrary.findMany.mockResolvedValue(mockTemplates as any);

      const result = await TemplateLibraryService.searchTemplates('marketing', 'user1');

      expect(mockPrisma.templateLibrary.findMany).toHaveBeenCalledWith({
        where: {
          isActive: true,
          OR: [
            { scope: 'global' },
            { scope: 'account_specific', createdById: 'user1' }
          ],
          AND: {
            OR: [
              { name: { contains: 'marketing', mode: 'insensitive' } },
              { description: { contains: 'marketing', mode: 'insensitive' } }
            ]
          }
        },
        include: {
          createdBy: {
            select: {
              id: true,
              name: true,
              email: true
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        }
      });

      expect(result).toEqual(mockTemplates);
    });
  });
});