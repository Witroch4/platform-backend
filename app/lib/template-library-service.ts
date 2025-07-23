import { prisma } from '@/lib/prisma';
import type { TemplateLibrary, TemplateApprovalRequest, User } from '@prisma/client';
import { Prisma } from '@prisma/client';

export interface TemplateLibraryContent {
  header?: string;
  body: string;
  footer?: string;
  buttons?: Array<{
    type: string;
    text: string;
    url?: string;
    phone_number?: string;
  }>;
  variables: string[]; // List of required variables
  mediaUrl?: string;
  mediaType?: string;
}

export interface CreateTemplateLibraryData {
  name: string;
  description?: string;
  type: 'template' | 'interactive_message';
  scope: 'global' | 'account_specific';
  content: TemplateLibraryContent;
  category?: string;
  language?: string;
  tags?: string[];
  createdById: string;
}

export interface TemplateLibraryWithCreator extends TemplateLibrary {
  createdBy: Pick<User, 'id' | 'name' | 'email'>;
  approvalRequests?: TemplateApprovalRequest[];
}

export class TemplateLibraryService {
  /**
   * Get available templates/messages for user based on scope and type
   */
  static async getLibraryItems(
    userId: string,
    type?: 'template' | 'interactive_message',
    scope?: 'global' | 'account_specific'
  ): Promise<TemplateLibraryWithCreator[]> {
    const whereClause: any = {
      isActive: true,
      OR: [
        { scope: 'global' },
        { scope: 'account_specific', createdById: userId }
      ]
    };

    if (type) {
      whereClause.type = type;
    }

    if (scope) {
      whereClause.scope = scope;
    }

    return await prisma.templateLibrary.findMany({
      where: whereClause,
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
            requestedById: userId
          },
          orderBy: {
            requestedAt: 'desc'
          },
          take: 1
        }
      },
      orderBy: [
        { scope: 'asc' }, // Global first
        { createdAt: 'desc' }
      ]
    });
  }

  /**
   * Save template to library
   */
  static async saveToLibrary(data: CreateTemplateLibraryData): Promise<TemplateLibrary> {
    // For interactive messages, approval is not required
    const isApprovalRequired = data.type === 'template';

    return await prisma.templateLibrary.create({
      data: {
        name: data.name,
        description: data.description,
        type: data.type,
        scope: data.scope,
        content: data.content as any,
        category: data.category,
        language: data.language || 'pt_BR',
        tags: data.tags || [],
        createdById: data.createdById,
        isApprovalRequired: isApprovalRequired
      }
    });
  }

  /**
   * Request template approval for user account
   */
  static async requestApproval(
    templateId: string,
    userId: string,
    requestMessage?: string,
    customVariables?: Record<string, string>
  ): Promise<TemplateApprovalRequest> {
    // Check if template exists and requires approval
    const template = await prisma.templateLibrary.findUnique({
      where: { id: templateId }
    });

    if (!template) {
      throw new Error('Template not found');
    }

    if (!template.isApprovalRequired) {
      throw new Error('This template does not require approval');
    }

    // Check if user already has a pending request for this template
    const existingRequest = await prisma.templateApprovalRequest.findFirst({
      where: {
        templateLibraryId: templateId,
        requestedById: userId,
        status: 'pending'
      }
    });

    if (existingRequest) {
      throw new Error('You already have a pending approval request for this template');
    }

    return await prisma.templateApprovalRequest.create({
      data: {
        templateLibraryId: templateId,
        requestedById: userId,
        requestMessage,
        customVariables: customVariables || Prisma.JsonNull,
        status: 'pending'
      }
    });
  }

  /**
   * Process approval request (approve/reject)
   */
  static async processApprovalRequest(
    requestId: string,
    processedById: string,
    status: 'approved' | 'rejected',
    responseMessage?: string
  ): Promise<TemplateApprovalRequest> {
    return await prisma.templateApprovalRequest.update({
      where: { id: requestId },
      data: {
        status,
        processedById,
        responseMessage,
        processedAt: new Date()
      }
    });
  }

  /**
   * Use interactive message directly (no approval needed)
   */
  static async useInteractiveMessage(
    messageId: string,
    variables: Record<string, string>
  ): Promise<{ success: boolean; processedContent: TemplateLibraryContent }> {
    const message = await prisma.templateLibrary.findUnique({
      where: { id: messageId }
    });

    if (!message) {
      throw new Error('Interactive message not found');
    }

    if (message.type !== 'interactive_message') {
      throw new Error('This is not an interactive message');
    }

    // Increment usage count
    await prisma.templateLibrary.update({
      where: { id: messageId },
      data: {
        totalUsageCount: {
          increment: 1
        }
      }
    });

    // Process variables in content
    const content = message.content as unknown as TemplateLibraryContent;
    const processedContent = this.processVariablesInContent(content, variables);

    return {
      success: true,
      processedContent
    };
  }

  /**
   * Get template by ID with full details
   */
  static async getTemplateById(templateId: string): Promise<TemplateLibraryWithCreator | null> {
    return await prisma.templateLibrary.findUnique({
      where: { id: templateId },
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        approvalRequests: {
          include: {
            requestedBy: {
              select: {
                id: true,
                name: true,
                email: true
              }
            },
            processedBy: {
              select: {
                id: true,
                name: true,
                email: true
              }
            }
          },
          orderBy: {
            requestedAt: 'desc'
          }
        }
      }
    });
  }

  /**
   * Get approval requests for admin management
   */
  static async getApprovalRequests(
    status?: 'pending' | 'approved' | 'rejected'
  ): Promise<Array<TemplateApprovalRequest & {
    templateLibrary: TemplateLibrary;
    requestedBy: Pick<User, 'id' | 'name' | 'email'>;
    processedBy?: Pick<User, 'id' | 'name' | 'email'> | null;
  }>> {
    const whereClause: any = {};
    if (status) {
      whereClause.status = status;
    }

    return await prisma.templateApprovalRequest.findMany({
      where: whereClause,
      include: {
        templateLibrary: true,
        requestedBy: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        processedBy: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      },
      orderBy: {
        requestedAt: 'desc'
      }
    });
  }

  /**
   * Update template library item
   */
  static async updateTemplate(
    templateId: string,
    userId: string,
    updates: Partial<CreateTemplateLibraryData>
  ): Promise<TemplateLibrary> {
    // Check if user has permission to update (creator or admin)
    const template = await prisma.templateLibrary.findUnique({
      where: { id: templateId }
    });

    if (!template) {
      throw new Error('Template not found');
    }

    // Check if user is creator or admin
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      throw new Error('User not found');
    }

    const canUpdate = template.createdById === userId || 
                     user.role === 'ADMIN' || 
                     user.role === 'SUPERADMIN';

    if (!canUpdate) {
      throw new Error('You do not have permission to update this template');
    }

    return await prisma.templateLibrary.update({
      where: { id: templateId },
      data: {
        ...(updates.name && { name: updates.name }),
        ...(updates.description !== undefined && { description: updates.description }),
        ...(updates.content && { content: updates.content as any }),
        ...(updates.category !== undefined && { category: updates.category }),
        ...(updates.tags && { tags: updates.tags }),
        updatedAt: new Date()
      }
    });
  }

  /**
   * Delete template from library
   */
  static async deleteTemplate(templateId: string, userId: string): Promise<void> {
    // Check permissions same as update
    const template = await prisma.templateLibrary.findUnique({
      where: { id: templateId }
    });

    if (!template) {
      throw new Error('Template not found');
    }

    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      throw new Error('User not found');
    }

    const canDelete = template.createdById === userId || 
                     user.role === 'ADMIN' || 
                     user.role === 'SUPERADMIN';

    if (!canDelete) {
      throw new Error('You do not have permission to delete this template');
    }

    // Soft delete by setting isActive to false
    await prisma.templateLibrary.update({
      where: { id: templateId },
      data: {
        isActive: false,
        updatedAt: new Date()
      }
    });
  }

  /**
   * Process variables in template content
   */
  private static processVariablesInContent(
    content: TemplateLibraryContent,
    variables: Record<string, string>
  ): TemplateLibraryContent {
    const processText = (text: string): string => {
      return Object.entries(variables).reduce((processed, [key, value]) => {
        return processed.replace(new RegExp(`{{${key}}}`, 'g'), value);
      }, text);
    };

    return {
      ...content,
      header: content.header ? processText(content.header) : undefined,
      body: processText(content.body),
      footer: content.footer ? processText(content.footer) : undefined,
      buttons: content.buttons?.map(button => ({
        ...button,
        text: processText(button.text),
        url: button.url ? processText(button.url) : undefined
      }))
    };
  }

  /**
   * Get templates by category
   */
  static async getTemplatesByCategory(
    category: string,
    userId: string
  ): Promise<TemplateLibraryWithCreator[]> {
    return await prisma.templateLibrary.findMany({
      where: {
        category,
        isActive: true,
        OR: [
          { scope: 'global' },
          { scope: 'account_specific', createdById: userId }
        ]
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
  }

  /**
   * Search templates by name or description
   */
  static async searchTemplates(
    query: string,
    userId: string,
    type?: 'template' | 'interactive_message'
  ): Promise<TemplateLibraryWithCreator[]> {
    const whereClause: any = {
      isActive: true,
      OR: [
        { scope: 'global' },
        { scope: 'account_specific', createdById: userId }
      ],
      AND: {
        OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { description: { contains: query, mode: 'insensitive' } }
        ]
      }
    };

    if (type) {
      whereClause.type = type;
    }

    return await prisma.templateLibrary.findMany({
      where: whereClause,
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
  }
}