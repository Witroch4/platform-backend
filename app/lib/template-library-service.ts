import { db } from '@/lib/db';
import type { Template, TemplateApprovalRequest, User } from '@prisma/client';
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
  type: 'WHATSAPP_OFFICIAL' | 'INTERACTIVE_MESSAGE' | 'AUTOMATION_REPLY';
  scope: 'GLOBAL' | 'PRIVATE';
  content: TemplateLibraryContent;
  language?: string;
  tags?: string[];
  createdById: string;
}

export interface TemplateLibraryWithCreator extends Template {
  createdBy: Pick<User, 'id' | 'name' | 'email'>;
  approvalRequests?: TemplateApprovalRequest[];
}

export class TemplateLibraryService {
  /**
   * Get available templates/messages for user based on scope and type
   */
  static async getLibraryItems(
    userId: string,
    type?: 'WHATSAPP_OFFICIAL' | 'INTERACTIVE_MESSAGE' | 'AUTOMATION_REPLY',
    scope?: 'GLOBAL' | 'PRIVATE'
  ): Promise<TemplateLibraryWithCreator[]> {
    const whereClause: any = {
      isActive: true,
      OR: [
        { scope: 'GLOBAL' },
        { scope: 'PRIVATE', createdById: userId }
      ]
    };

    if (type) {
      whereClause.type = type;
    }

    if (scope) {
      whereClause.scope = scope;
    }

    return await db.template.findMany({
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
  static async saveToLibrary(data: CreateTemplateLibraryData): Promise<Template> {
    return await db.template.create({
      data: {
        name: data.name,
        description: data.description,
        type: data.type,
        scope: data.scope,
        language: data.language || 'pt_BR',
        tags: data.tags || [],
        createdById: data.createdById
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
    const template = await db.template.findUnique({
      where: { id: templateId }
    });

    if (!template) {
      throw new Error('Template not found');
    }

    // For now, all templates require approval
    // This can be enhanced later based on template type or other criteria

    // Check if user already has a pending request for this template
    const existingRequest = await db.templateApprovalRequest.findFirst({
      where: {
        templateLibraryId: templateId,
        requestedById: userId,
        status: 'pending'
      }
    });

    if (existingRequest) {
      throw new Error('You already have a pending approval request for this template');
    }

    return await db.templateApprovalRequest.create({
      data: {
        templateId: templateId,
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
    return await db.templateApprovalRequest.update({
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
    const message = await db.template.findUnique({
      where: { id: messageId }
    });

    if (!message) {
      throw new Error('Interactive message not found');
    }

    // Check if this is an interactive message type
    if (message.type !== 'INTERACTIVE_MESSAGE') {
      throw new Error('This is not an interactive message');
    }

    // Increment usage count
    await db.template.update({
      where: { id: messageId },
      data: {
        usageCount: {
          increment: 1
        }
      }
    });

    // Process variables in content
    // Note: Template model doesn't have direct content field, 
    // content is stored in interactiveContent or whatsappOfficialInfo relations
    const processedContent = this.processVariablesInContent({
      body: message.simpleReplyText || '',
      variables: []
    }, variables);

    return {
      success: true,
      processedContent
    };
  }

  /**
   * Get template by ID with full details
   */
  static async getTemplateById(templateId: string): Promise<TemplateLibraryWithCreator | null> {
    return await db.template.findUnique({
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
    template: Template;
    requestedBy: Pick<User, 'id' | 'name' | 'email'>;
    processedBy?: Pick<User, 'id' | 'name' | 'email'> | null;
  }>> {
    const whereClause: any = {};
    if (status) {
      whereClause.status = status;
    }

    return await db.templateApprovalRequest.findMany({
      where: whereClause,
      include: {
        template: true,
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
    const template = await db.template.findUnique({
      where: { id: templateId }
    });

    if (!template) {
      throw new Error('Template not found');
    }

    // Check if user is creator or admin
    const user = await db.user.findUnique({
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

    return await db.template.update({
      where: { id: templateId },
      data: {
        ...(updates.name && { name: updates.name }),
        ...(updates.description !== undefined && { description: updates.description }),
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
    const template = await db.template.findUnique({
      where: { id: templateId }
    });

    if (!template) {
      throw new Error('Template not found');
    }

    const user = await db.user.findUnique({
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
    await db.template.update({
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
    return await db.template.findMany({
      where: {
        tags: {
          has: category
        },
        isActive: true,
        OR: [
          { scope: 'GLOBAL' },
          { scope: 'PRIVATE', createdById: userId }
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
    type?: 'WHATSAPP_OFFICIAL' | 'INTERACTIVE_MESSAGE' | 'AUTOMATION_REPLY'
  ): Promise<TemplateLibraryWithCreator[]> {
    const whereClause: any = {
      isActive: true,
      OR: [
        { scope: 'GLOBAL' },
        { scope: 'PRIVATE', createdById: userId }
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

    return await db.template.findMany({
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