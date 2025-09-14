// app/api/admin/mtf-diamante/interactive-messages/route.ts
// API endpoints for interactive messages management

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

// Validation schemas
const createMessageSchema = z.object({
  inboxId: z.string().min(1, 'InboxId é obrigatório'),
  message: z.object({
    name: z.string().min(1, 'Nome da mensagem é obrigatório'),
    type: z.enum(['button', 'list', 'cta_url', 'flow', 'location', 'location_request', 'reaction', 'sticker', 'generic', 'quick_replies', 'button_template']).default('button'),
    header: z.object({
      type: z.enum(['text', 'image', 'video', 'document']),
      text: z.string().optional(),
      content: z.string().optional(),
      media_url: z.string().url().optional(),
      mediaUrl: z.string().url().optional(),
      filename: z.string().optional(),
    }).optional(),
    body: z.object({
      text: z.string().min(1, 'Texto do corpo é obrigatório'),
    }),
    footer: z.object({
      text: z.string().max(60, 'Texto do rodapé muito longo'),
    }).optional(),
    action: z.any().optional(),
    isActive: z.boolean().default(true),
  }),
});

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
  }),
});

// GET /api/admin/mtf-diamante/interactive-messages
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: "Usuário não autenticado." } as ApiResponse,
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const inboxId = searchParams.get('inboxId');

    // Build query conditions
    const whereConditions: any = {};
    
    if (inboxId && inboxId !== 'all') {
      whereConditions.inboxId = inboxId;
    }

    // Build query conditions for Template model
    const templateWhereConditions: any = {
      type: 'INTERACTIVE_MESSAGE',
      createdById: session.user.id,
    };
    
    if (inboxId && inboxId !== 'all') {
      templateWhereConditions.inboxId = inboxId;
    }

    // Fetch messages from database (using Template model)
    const messages = await prisma.template.findMany({
      where: templateWhereConditions,
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
      },
      orderBy: { createdAt: 'desc' }
    });

    // Transform to expected format using the formatMessage function pattern
    const transformedMessages: InteractiveMessage[] = messages.map((msg: any) => {
      const interactive = msg.interactiveContent;
      
      console.log(`[GET API] Processing message ${msg.id}:`, {
        interactive: !!interactive,
        actionReplyButton: !!interactive?.actionReplyButton,
        actionReplyButtonData: interactive?.actionReplyButton,
        allActions: {
          actionCtaUrl: !!interactive?.actionCtaUrl,
          actionReplyButton: !!interactive?.actionReplyButton,
          actionList: !!interactive?.actionList,
          actionFlow: !!interactive?.actionFlow,
          actionLocationRequest: !!interactive?.actionLocationRequest
        }
      });
      
      // Capturar dados da ação primeiro
      let actionData = null as any;
      if (interactive?.actionCtaUrl) actionData = interactive.actionCtaUrl;
      if (interactive?.actionReplyButton) actionData = interactive.actionReplyButton;
      if (interactive?.actionList) actionData = interactive.actionList;
      if (interactive?.actionFlow) actionData = interactive.actionFlow;
      if (interactive?.actionLocationRequest) actionData = interactive.actionLocationRequest;

      // Determinar o tipo: preferir o tipo salvo
      let actionType = ((interactive as any)?.interactiveType as string) || 'button';
      if (!((interactive as any)?.interactiveType)) {
        if (interactive?.actionCtaUrl) {
          actionType = 'cta_url';
        } else if (interactive?.actionReplyButton) {
          // Subtipos para IG
          const buttonCount = interactive.actionReplyButton.buttons?.length || 0;
          const bodyText = interactive?.body?.text || '';
          actionType = buttonCount > 3 ? 'quick_replies' : (bodyText.length <= 640 ? 'button_template' : 'quick_replies');
        } else if (interactive?.actionList) {
          actionType = 'list';
        } else if (interactive?.actionFlow) {
          actionType = 'flow';
        } else if (interactive?.actionLocationRequest) {
          actionType = 'location_request';
        } else {
          // Detecção baseada no conteúdo
          const bodyText = interactive?.body?.text || '';
          const hasHeader = !!interactive?.header;
          const hasFooter = !!interactive?.footer;
          actionType = hasHeader && hasFooter ? 'generic' : (bodyText.length <= 640 ? 'button_template' : 'quick_replies');
        }
      }
      
      const finalMessage = {
        id: msg.id,
        name: msg.name,
        type: actionType as InteractiveMessageType,
        header: interactive?.header ? {
          type: interactive.header.type as 'text' | 'image' | 'video' | 'document',
          text: interactive.header.content || '',
          content: interactive.header.content || '',
        } : undefined,
        body: {
          text: interactive?.body?.text || ''
        },
        footer: interactive?.footer ? {
          text: interactive.footer.text
        } : undefined,
        action: (transformActionData(actionType, actionData) || (interactive?.actionReplyButton?.buttons ? { type: 'button', buttons: interactive.actionReplyButton.buttons } : undefined)) as any,
        isActive: msg.isActive,
        createdAt: msg.createdAt,
        updatedAt: msg.updatedAt,
      };
      
      console.log(`[GET API] Final message structure for ${msg.id}:`, {
        id: finalMessage.id,
        name: finalMessage.name,
        type: finalMessage.type,
        hasAction: !!finalMessage.action,
        actionType: finalMessage.action?.type,
        buttonsCount: finalMessage.action?.buttons?.length || 0,
        buttons: finalMessage.action?.buttons || []
      });
      
      return finalMessage;
    });

    return NextResponse.json({
      success: true,
      data: transformedMessages,
      message: `${transformedMessages.length} mensagens encontradas`
    } as ApiResponse<InteractiveMessage[]>);

  } catch (error) {
    console.error('Error fetching interactive messages:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Erro interno do servidor' 
      } as ApiResponse,
      { status: 500 }
    );
  }
}

// POST /api/admin/mtf-diamante/interactive-messages
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: "Usuário não autenticado." } as ApiResponse,
        { status: 401 }
      );
    }

    const body = await request.json();
    console.log(`[InteractiveMessages API] Raw body received:`, JSON.stringify(body, null, 2));
    console.log(`[InteractiveMessages API] Body keys:`, Object.keys(body));
    console.log(`[InteractiveMessages API] Message structure:`, body.message ? JSON.stringify(body.message, null, 2) : 'NO MESSAGE FIELD');
    
    // Validate request body
    const validation = createMessageSchema.safeParse(body);
    if (!validation.success) {
      console.error('Validation failed for interactive message creation:', {
        errors: validation.error.errors,
        receivedBody: body
      });
      console.log(`[InteractiveMessages API] Expected schema structure - checking required fields:`);
      console.log(`  - inboxId: ${body.inboxId ? 'PRESENT' : 'MISSING'}`);
      console.log(`  - message: ${body.message ? 'PRESENT' : 'MISSING'}`);
      if (body.message) {
        console.log(`  - message.name: ${body.message.name ? 'PRESENT' : 'MISSING'}`);
        console.log(`  - message.type: ${body.message.type ? 'PRESENT' : 'MISSING'}`);
        console.log(`  - message.body: ${body.message.body ? 'PRESENT' : 'MISSING'}`);
        if (body.message.body) {
          console.log(`  - message.body.text: ${body.message.body.text ? 'PRESENT' : 'MISSING'}`);
        }
      }
      return NextResponse.json(
        { 
          success: false, 
          error: 'Dados inválidos', 
          details: validation.error.errors 
        } as ApiResponse,
        { status: 400 }
      );
    }

    const { inboxId, message } = validation.data;

    console.log(`[InteractiveMessages API] Validated data:`, {
      inboxId,
      messageType: message.type,
      hasAction: !!message.action,
      actionStructure: message.action ? JSON.stringify(message.action, null, 2) : 'NO ACTION',
      conditions: {
        isButtonType: ['button', 'quick_replies', 'button_template'].includes(message.type),
        hasActionButtons: !!(message.action && message.action.buttons && message.action.buttons.length > 0)
      }
    });

    // Verify inbox exists and user has access
    const inbox = await prisma.chatwitInbox.findFirst({
      where: {
        id: inboxId,
        usuarioChatwit: {
          appUserId: session.user.id,
        }
      }
    });

    if (!inbox) {
      return NextResponse.json(
        { success: false, error: 'Caixa não encontrada ou sem permissão de acesso' } as ApiResponse,
        { status: 404 }
      );
    }

    // Create the message using Template model with interactiveContent
    const createdMessage = await prisma.template.create({
      data: {
        name: message.name,
        type: 'INTERACTIVE_MESSAGE',
        description: `Mensagem interativa: ${message.name}`,
        scope: 'PRIVATE',
        status: 'APPROVED',
        language: 'pt_BR',
        tags: [],
        isActive: message.isActive,
        createdById: session.user.id,
        inboxId: inboxId,
        interactiveContent: {
          create: {
            interactiveType: message.type,
            body: {
              create: {
                text: message.body.text
              }
            },
            // Create header if provided
            ...(message.header && {
              header: {
                create: {
                  type: message.header.type,
                  content: message.header.content || message.header.text || message.header.media_url || message.header.mediaUrl || '',
                }
              }
            }),
            // Create footer if provided
            ...(message.footer && {
              footer: {
                create: {
                  text: message.footer.text
                }
              }
            }),
            // Create action based on type
            ...((message.type === 'button' || message.type === 'quick_replies' || message.type === 'button_template' || message.type === 'generic') && message.action && (() => {
              console.log(`[InteractiveMessages API] Creating actionReplyButton for type ${message.type} with buttons:`, message.action.buttons);
              return {
                actionReplyButton: {
                  create: {
                    buttons: message.type === 'quick_replies'
                      ? ((message.action.quick_replies || message.action.buttons || []))
                      : (message.action.buttons || [])
                  }
                }
              };
            })()),
            ...(message.type === 'list' && message.action && {
              actionList: {
                create: {
                  // Remove invalid fields and keep only valid ones for ActionList
                  ...(message.action.sections && { sections: message.action.sections }),
                  ...(message.action.title && { title: message.action.title }),
                  ...(message.action.description && { description: message.action.description })
                }
              }
            }),
            ...(message.type === 'cta_url' && message.action && {
              actionCtaUrl: {
                create: {
                  // Remove invalid fields and keep only valid ones for ActionCtaUrl
                  ...(message.action.displayText && { displayText: message.action.displayText }),
                  ...(message.action.url && { url: message.action.url })
                }
              }
            }),
            ...(message.type === 'flow' && message.action && {
              actionFlow: {
                create: {
                  // Remove invalid fields and keep only valid ones for ActionFlow
                  ...(message.action.flowId && { flowId: message.action.flowId }),
                  ...(message.action.flowToken && { flowToken: message.action.flowToken })
                }
              }
            }),
            ...(message.type === 'location_request' && message.action && {
              actionLocationRequest: {
                create: {
                  // Remove invalid fields and keep only valid ones for ActionLocationRequest
                  ...(message.action.requestType && { requestType: message.action.requestType })
                }
              }
            }),
          }
        }
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

    // Transform to expected format using the formatMessage function pattern
    const interactive = createdMessage.interactiveContent;
    
    // Determine action type and data
    let actionType = ((interactive as any)?.interactiveType as string) || message.type;
    let actionData = null;
    
    if (interactive?.actionCtaUrl) {
      actionData = interactive.actionCtaUrl;
    } else if (interactive?.actionReplyButton) {
      actionData = interactive.actionReplyButton;
    } else if (interactive?.actionList) {
      actionData = interactive.actionList;
    } else if (interactive?.actionFlow) {
      actionData = interactive.actionFlow;
    } else if (interactive?.actionLocationRequest) {
      actionData = interactive.actionLocationRequest;
    }

    const transformedMessage: InteractiveMessage = {
      id: createdMessage.id,
      name: createdMessage.name,
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
      action: actionData ? transformActionData(actionType, actionData) : undefined,
      isActive: createdMessage.isActive,
      createdAt: createdMessage.createdAt,
      updatedAt: createdMessage.updatedAt,
    };

    return NextResponse.json({
      success: true,
      data: transformedMessage,
      message: 'Mensagem criada com sucesso'
    } as ApiResponse<InteractiveMessage>, { status: 201 });

  } catch (error) {
    console.error('Error creating interactive message:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Erro interno do servidor' 
      } as ApiResponse,
      { status: 500 }
    );
  }
}
