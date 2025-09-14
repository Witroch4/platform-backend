// app/api/admin/mtf-diamante/interactive-messages/[id]/route.ts
// API endpoints for individual interactive message operations

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getPrismaInstance } from '@/lib/connections';
import { z } from 'zod';
import type { InteractiveMessage, InteractiveMessageType } from '@/types/interactive-messages';
import type { ApiResponse } from '@/app/admin/mtf-diamante/lib/types';

const prisma = getPrismaInstance();

// Helper function to transform action data to the correct MessageAction format
function transformActionData(actionType: string, actionData: any): any {
  switch (actionType) {
    case 'button':
    case 'quick_replies':
    case 'button_template':
    case 'generic':
      // Handle both direct buttons array and wrapped structure from database
      const buttons = actionData?.buttons || actionData || [];
      return {
        type: 'button',
        buttons: Array.isArray(buttons) ? buttons : []
      };
    case 'list':
      return {
        type: 'list',
        button: actionData.buttonText || 'Select',
        sections: actionData.sections || [],
        buttonText: actionData.buttonText
      };
    case 'cta_url':
      return {
        type: 'cta_url',
        action: {
          displayText: actionData.displayText || '',
          url: actionData.url || ''
        }
      };
    case 'flow':
      return {
        type: 'flow',
        action: actionData
      };
    case 'location_request':
      return {
        type: 'location_request',
        action: {}
      };
    default:
      return undefined;
  }
}

// Validation schema for updates
const updateMessageSchema = z.object({
  message: z.object({
    name: z.string().min(1).optional(),
    type: z.enum(['button', 'list', 'cta_url', 'flow', 'location', 'location_request', 'reaction', 'sticker', 'generic', 'quick_replies', 'button_template']).optional(),
    header: z.object({
      type: z.enum(['text', 'image', 'video', 'document']),
      text: z.string().optional(),
      content: z.string().optional(),
      media_url: z.string().url().optional(),
      mediaUrl: z.string().url().optional(),
      filename: z.string().optional(),
    }).optional(),
    body: z.object({
      text: z.string().min(1),
    }).optional(),
    footer: z.object({
      text: z.string().max(60),
    }).optional(),
    action: z.any().optional(),
    isActive: z.boolean().optional(),
  }).optional(),
  // Support legacy format
  name: z.string().min(1).optional(),
  type: z.enum(['button', 'list', 'cta_url', 'flow', 'location', 'location_request', 'reaction', 'sticker', 'generic', 'quick_replies', 'button_template']).optional(),
  header: z.object({
    type: z.enum(['text', 'image', 'video', 'document']),
    text: z.string().optional(),
    content: z.string().optional(),
    media_url: z.string().url().optional(),
    mediaUrl: z.string().url().optional(),
    filename: z.string().optional(),
  }).optional(),
  body: z.object({
    text: z.string().min(1),
  }).optional(),
  footer: z.object({
    text: z.string().max(60),
  }).optional(),
  action: z.any().optional(),
  isActive: z.boolean().optional(),
});

// GET /api/admin/mtf-diamante/interactive-messages/[id]
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: "Usuário não autenticado." } as ApiResponse,
        { status: 401 }
      );
    }

    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'ID da mensagem é obrigatório' } as ApiResponse,
        { status: 400 }
      );
    }

    // Fetch message from database (using Template model)
    const message = await prisma.template.findFirst({
      where: {
        id: id,
        type: 'INTERACTIVE_MESSAGE',
        createdById: session.user.id, // Ensure user owns the message
      },
      include: {
        interactiveContent: {
          include: {
            header: true,
            body: true,
            footer: true,
            actionCtaUrl: true,
            actionReplyButton: true,
            actionList: true,
            actionFlow: true,
            actionLocationRequest: true
          }
        },
        inbox: {
          select: {
            id: true,
            nome: true,
          }
        }
      }
    });

    if (!message) {
      return NextResponse.json(
        { success: false, error: 'Mensagem não encontrada' } as ApiResponse,
        { status: 404 }
      );
    }

    // Transform to expected format using the formatMessage function pattern
    const interactive = message.interactiveContent;
    
    // Capturar dados da ação primeiro
    let actionData = null as any;
    if (interactive?.actionCtaUrl) actionData = interactive.actionCtaUrl;
    if (interactive?.actionReplyButton) actionData = interactive.actionReplyButton;
    if (interactive?.actionList) actionData = interactive.actionList;
    if (interactive?.actionFlow) actionData = interactive.actionFlow;
    if (interactive?.actionLocationRequest) actionData = interactive.actionLocationRequest;

    // Determinar tipo: priorizar tipo salvo
    let actionType = ((interactive as any)?.interactiveType as string) || 'button';
    if (!((interactive as any)?.interactiveType)) {
      if (interactive?.actionCtaUrl) {
        actionType = 'cta_url';
      } else if (interactive?.actionReplyButton) {
        actionType = 'button';
      } else if (interactive?.actionList) {
        actionType = 'list';
      } else if (interactive?.actionFlow) {
        actionType = 'flow';
      } else if (interactive?.actionLocationRequest) {
        actionType = 'location_request';
      } else {
        const bodyText = interactive?.body?.text || '';
        const hasHeader = !!interactive?.header;
        const hasFooter = !!interactive?.footer;
        actionType = hasHeader && hasFooter ? 'generic' : (bodyText.length <= 640 ? 'button_template' : 'quick_replies');
      }
    }

    const transformedMessage: InteractiveMessage = {
      id: message.id,
      name: message.name,
      type: actionType as InteractiveMessageType,
      header: interactive?.header ? {
        type: interactive.header.type as 'text' | 'image' | 'video' | 'document',
        content: interactive.header.content || '',
      } : undefined,
      body: {
        text: interactive?.body?.text || ''
      },
      footer: interactive?.footer ? {
        text: interactive.footer.text
      } : undefined,
      action: (transformActionData(actionType, actionData) || (interactive?.actionReplyButton?.buttons ? { type: 'button', buttons: interactive.actionReplyButton.buttons } : undefined)) as any,
      isActive: message.isActive,
      createdAt: message.createdAt,
      updatedAt: message.updatedAt,
    };

    return NextResponse.json({
      success: true,
      data: transformedMessage,
      message: 'Mensagem encontrada'
    } as ApiResponse<InteractiveMessage>);

  } catch (error) {
    console.error('Error fetching interactive message:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Erro interno do servidor' 
      } as ApiResponse,
      { status: 500 }
    );
  }
}

// PUT /api/admin/mtf-diamante/interactive-messages/[id]
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: "Usuário não autenticado." } as ApiResponse,
        { status: 401 }
      );
    }

    const { id } = await params;
    const body = await request.json();

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'ID da mensagem é obrigatório' } as ApiResponse,
        { status: 400 }
      );
    }

    // Validate request body
    const validation = updateMessageSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Dados inválidos', 
          details: validation.error.errors 
        } as ApiResponse,
        { status: 400 }
      );
    }

    const validatedData = validation.data;

    // Support both nested message format and flat format
    const updateData = validatedData.message || {
      name: validatedData.name,
      type: validatedData.type,
      header: validatedData.header,
      body: validatedData.body,
      footer: validatedData.footer,
      action: validatedData.action,
      isActive: validatedData.isActive,
    };

    // Remove undefined values
    const cleanUpdateData = Object.fromEntries(
      Object.entries(updateData).filter(([_, value]) => value !== undefined)
    );

    if (Object.keys(cleanUpdateData).length === 0) {
      return NextResponse.json(
        { success: false, error: 'Nenhum dado para atualizar' } as ApiResponse,
        { status: 400 }
      );
    }

    // Verify message exists and user has access
    const existingMessage = await prisma.template.findFirst({
      where: {
        id: id,
        type: 'INTERACTIVE_MESSAGE',
        createdById: session.user.id,
      }
    });

    if (!existingMessage) {
      return NextResponse.json(
        { success: false, error: 'Mensagem não encontrada ou sem permissão de acesso' } as ApiResponse,
        { status: 404 }
      );
    }

    // Prepare update data for Template model
    const templateUpdateData: any = {};
    
    if (cleanUpdateData.name) {
      templateUpdateData.name = cleanUpdateData.name;
    }
    
    if (cleanUpdateData.isActive !== undefined) {
      templateUpdateData.isActive = cleanUpdateData.isActive;
    }

    // ✅ FIXED: Implement complex interactiveContent updates
    if (Object.keys(templateUpdateData).length > 0) {
      await prisma.template.update({
        where: { id: id },
        data: templateUpdateData,
      });
    }

    // Update interactive content if provided
    const interactiveUpdateData = cleanUpdateData;
    
    if (interactiveUpdateData.header || interactiveUpdateData.body || interactiveUpdateData.footer || interactiveUpdateData.action) {
      // Get existing interactive content
      const existingInteractive = await prisma.interactiveContent.findFirst({
        where: { templateId: id },
        include: {
          header: true,
          body: true,
          footer: true
        }
      });

      if (existingInteractive) {
        // Persist explicit interactive type if provided
        if (interactiveUpdateData.type) {
          await prisma.interactiveContent.update({
            where: { id: existingInteractive.id },
            data: { interactiveType: interactiveUpdateData.type },
          });
        }
        // Update header if provided
        if (interactiveUpdateData.header) {
          const headerData = {
            type: interactiveUpdateData.header.type,
            content: interactiveUpdateData.header.content
          };
          
          if (existingInteractive.header) {
            await prisma.header.update({
              where: { id: existingInteractive.header.id },
              data: headerData
            });
          } else {
            await prisma.header.create({
              data: {
                ...headerData,
                interactiveContentId: existingInteractive.id
              }
            });
          }
        }

        // Update body if provided
        if (interactiveUpdateData.body) {
          const bodyData = {
            text: interactiveUpdateData.body.text
          };
          
          await prisma.body.update({
            where: { id: existingInteractive.bodyId },
            data: bodyData
          });
        }

        // Update footer if provided
        if (interactiveUpdateData.footer) {
          const footerData = {
            text: interactiveUpdateData.footer.text
          };
          
          if (existingInteractive.footer) {
            await prisma.footer.update({
              where: { id: existingInteractive.footer.id },
              data: footerData
            });
          } else {
            await prisma.footer.create({
              data: {
                ...footerData,
                interactiveContentId: existingInteractive.id
              }
            });
          }
        }

        // ✅ FIXED: Update actions if provided
        if (interactiveUpdateData.action) {
          const messageType = interactiveUpdateData.type || 'generic';
          
          console.log(`[InteractiveMessages API UPDATE] Updating action for type ${messageType}:`, interactiveUpdateData.action);
          
          // Clear existing actions
          await prisma.actionReplyButton.deleteMany({
            where: { interactiveContentId: existingInteractive.id }
          });
          await prisma.actionList.deleteMany({
            where: { interactiveContentId: existingInteractive.id }
          });
          await prisma.actionCtaUrl.deleteMany({
            where: { interactiveContentId: existingInteractive.id }
          });
          await prisma.actionFlow.deleteMany({
            where: { interactiveContentId: existingInteractive.id }
          });
          await prisma.actionLocationRequest.deleteMany({
            where: { interactiveContentId: existingInteractive.id }
          });

          // Create new action based on type
          if (['button', 'quick_replies', 'button_template', 'generic'].includes(messageType) && (interactiveUpdateData.action.buttons || (interactiveUpdateData.action as any).quick_replies)) {
            console.log(`[InteractiveMessages API UPDATE] Creating actionReplyButton with buttons:`, interactiveUpdateData.action.buttons || (interactiveUpdateData.action as any).quick_replies);
            await prisma.actionReplyButton.create({
              data: {
                interactiveContentId: existingInteractive.id,
                buttons: messageType === 'quick_replies'
                  ? ((interactiveUpdateData.action as any).quick_replies || interactiveUpdateData.action.buttons)
                  : interactiveUpdateData.action.buttons
              }
            });
          } else if (messageType === 'list') {
            await prisma.actionList.create({
              data: {
                interactiveContentId: existingInteractive.id,
                ...(interactiveUpdateData.action.sections && { sections: interactiveUpdateData.action.sections }),
                ...(interactiveUpdateData.action.title && { title: interactiveUpdateData.action.title }),
                ...(interactiveUpdateData.action.description && { description: interactiveUpdateData.action.description })
              }
            });
          } else if (messageType === 'cta_url') {
            await prisma.actionCtaUrl.create({
              data: {
                interactiveContentId: existingInteractive.id,
                ...(interactiveUpdateData.action.displayText && { displayText: interactiveUpdateData.action.displayText }),
                ...(interactiveUpdateData.action.url && { url: interactiveUpdateData.action.url })
              }
            });
          } else if (messageType === 'flow') {
            await prisma.actionFlow.create({
              data: {
                interactiveContentId: existingInteractive.id,
                ...(interactiveUpdateData.action.flowId && { flowId: interactiveUpdateData.action.flowId }),
                ...(interactiveUpdateData.action.flowToken && { flowToken: interactiveUpdateData.action.flowToken })
              }
            });
          } else if (messageType === 'location_request') {
            await prisma.actionLocationRequest.create({
              data: {
                interactiveContentId: existingInteractive.id,
                ...(interactiveUpdateData.action.requestType && { requestType: interactiveUpdateData.action.requestType })
              }
            });
          }
        }
      }
    }

    // Fetch the updated message
    const updatedMessage = await prisma.template.findFirst({
      where: { id: id },
      include: {
        interactiveContent: {
          include: {
            header: true,
            body: true,
            footer: true,
            actionCtaUrl: true,
            actionReplyButton: true,
            actionList: true,
            actionFlow: true,
            actionLocationRequest: true
          }
        },
        inbox: {
          select: {
            id: true,
            nome: true,
          }
        }
      }
    });

    if (!updatedMessage) {
      return NextResponse.json(
        { success: false, error: 'Mensagem não encontrada após atualização' } as ApiResponse,
        { status: 404 }
      );
    }

    // Transform to expected format using the formatMessage function pattern
    const interactive = updatedMessage.interactiveContent;
    
    // Determine action type and data (prefer stored explicit type)
    let actionType = ((interactive as any)?.interactiveType as string) || 'button'; // default
    let actionData = null;
    
    if (!((interactive as any)?.interactiveType) && interactive?.actionCtaUrl) {
      actionType = 'cta_url';
      actionData = interactive.actionCtaUrl;
    } else if (!((interactive as any)?.interactiveType) && interactive?.actionReplyButton) {
      // Determine correct button type based on button count and content
      const buttons = interactive.actionReplyButton.buttons as any[];
      const buttonCount = Array.isArray(buttons) ? buttons.length : 0;
      const bodyText = interactive?.body?.text || '';
      
      if (buttonCount > 3) {
        actionType = 'quick_replies';
      } else if (buttonCount <= 3 && bodyText.length <= 640) {
        actionType = 'button_template';
      } else {
        actionType = 'quick_replies';
      }
      
      actionData = interactive.actionReplyButton;
    } else if (!((interactive as any)?.interactiveType) && interactive?.actionList) {
      actionType = 'list';
      actionData = interactive.actionList;
    } else if (!((interactive as any)?.interactiveType) && interactive?.actionFlow) {
      actionType = 'flow';
      actionData = interactive.actionFlow;
    } else if (!((interactive as any)?.interactiveType) && interactive?.actionLocationRequest) {
      actionType = 'location_request';
      actionData = interactive.actionLocationRequest;
    } else if (!((interactive as any)?.interactiveType)) {
      // For Instagram templates, detect type based on content
      const bodyText = interactive?.body?.text || '';
      const hasHeader = !!interactive?.header;
      const hasFooter = !!interactive?.footer;
      
      if (hasHeader && hasFooter) {
        actionType = 'generic';
      } else if (bodyText.length <= 640) {
        actionType = 'button_template';
      } else if (bodyText.length <= 1000) {
        actionType = 'quick_replies';
      } else {
        actionType = 'generic';
      }
    }

    const transformedMessage: InteractiveMessage = {
      id: updatedMessage.id,
      name: updatedMessage.name,
      type: actionType as InteractiveMessageType,
      header: interactive?.header ? {
        type: interactive.header.type as 'text' | 'image' | 'video' | 'document',
        content: interactive.header.content || '',
      } : undefined,
      body: {
        text: interactive?.body?.text || ''
      },
      footer: interactive?.footer ? {
        text: interactive.footer.text
      } : undefined,
      action: (transformActionData(actionType, actionData) || (interactive?.actionReplyButton?.buttons ? { type: 'button', buttons: interactive.actionReplyButton.buttons } : undefined)) as any,
      isActive: updatedMessage.isActive,
      createdAt: updatedMessage.createdAt,
      updatedAt: updatedMessage.updatedAt,
    };

    return NextResponse.json({
      success: true,
      data: transformedMessage,
      message: 'Mensagem atualizada com sucesso'
    } as ApiResponse<InteractiveMessage>);

  } catch (error) {
    console.error('Error updating interactive message:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Erro interno do servidor' 
      } as ApiResponse,
      { status: 500 }
    );
  }
}

// DELETE /api/admin/mtf-diamante/interactive-messages/[id]
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: "Usuário não autenticado." } as ApiResponse,
        { status: 401 }
      );
    }

    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'ID da mensagem é obrigatório' } as ApiResponse,
        { status: 400 }
      );
    }

    // Verify message exists and user has access
    const existingMessage = await prisma.template.findFirst({
      where: {
        id: id,
        type: 'INTERACTIVE_MESSAGE',
        createdById: session.user.id,
      }
    });

    if (!existingMessage) {
      return NextResponse.json(
        { success: false, error: 'Mensagem não encontrada ou sem permissão de acesso' } as ApiResponse,
        { status: 404 }
      );
    }

    // Delete associated button reactions (cascade should handle this)

    // Delete the message (cascade should handle interactiveContent)
    await prisma.template.delete({
      where: { id: id }
    });

    return NextResponse.json({
      success: true,
      message: 'Mensagem deletada com sucesso'
    } as ApiResponse);

  } catch (error) {
    console.error('Error deleting interactive message:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Erro interno do servidor' 
      } as ApiResponse,
      { status: 500 }
    );
  }
}
