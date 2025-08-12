import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getPrismaInstance } from "@/lib/connections"
import { z } from "zod";
import { 
  InteractiveMessageSchema,
  ButtonReactionSchema,
  InteractiveMessageValidator,
  InteractiveMessageValidationError
} from "@/lib/validation/interactive-message-validation";
import { 
  errorHandler,
  ErrorCategory,
  ErrorSeverity
} from "@/lib/error-handling/interactive-message-errors";
import { invalidateTemplateMappingCache } from "@/lib/cache/instagram-template-cache";

// API-specific validation schemas (extending the base schemas)
const ApiReactionSchema = z.object({
  type: z.enum(["emoji", "text"]),
  value: z.string().min(1),
});

const ApiButtonReactionSchema = z.object({
  buttonId: z.string().min(1),
  reaction: ApiReactionSchema.optional(),
});

const ApiInteractiveMessageSchema = z.object({
  name: z.string().min(1).max(255),
  type: z.enum([
    "cta_url",
    "flow",
    "list",
    "button",
    "location",
    "location_request",
    "reaction",
    "sticker",
  ]),
  header: z
    .object({
      type: z.enum(["text", "image", "video", "document"]),
      text: z.string().optional(),
      content: z.string().optional(),
      media_url: z.string().url().optional(),
      mediaUrl: z.string().url().optional(),
      filename: z.string().optional(),
    })
    .optional(),
  body: z.object({
    text: z.string().min(1, "Body text is required").max(1024, "Body text too long"),
  }),
  footer: z
    .object({
      text: z.string().max(60, "Footer text too long"),
    })
    .optional(),
  action: z.any().optional(), // JSON field for flexibility
  // Location fields
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  locationName: z.string().optional(),
  locationAddress: z.string().optional(),
  // Reaction fields
  reactionEmoji: z.string().optional(),
  targetMessageId: z.string().optional(),
  // Sticker fields
  stickerMediaId: z.string().optional(),
  stickerUrl: z.string().optional(),
});

const SaveMessageWithReactionsSchema = z.object({
  inboxId: z.string().min(1, "Inbox ID is required"),
  message: ApiInteractiveMessageSchema,
  reactions: z.array(ApiButtonReactionSchema),
});

// Helper function to format reaction response
function formatReaction(reaction: any) {
  // Parse actionPayload to extract emoji and textReaction
  const actionPayload = reaction.actionPayload as any;
  const emoji = actionPayload?.emoji;
  const textReaction = actionPayload?.textReaction;
  
  return {
    id: reaction.id,
    buttonId: reaction.buttonId,
    messageId: reaction.inboxId, // Use inboxId instead of messageId
    type: textReaction ? "text" : "emoji",
    emoji: emoji || null,
    textReaction: textReaction || null,
    isActive: true, // MapeamentoBotao doesn't have isActive field, assume active
    createdAt: reaction.createdAt,
  };
}

// Helper function to format message response
function formatMessage(template: any) {
  const interactive = template.interactiveContent;
  if (!interactive) return null;

  // Determinar o tipo de ação
  let actionType = null;
  let actionData = null;
  
  if (interactive.actionCtaUrl) {
    actionType = 'cta_url';
    actionData = interactive.actionCtaUrl;
  } else if (interactive.actionReplyButton) {
    actionType = 'button';
    actionData = interactive.actionReplyButton;
  } else if (interactive.actionList) {
    actionType = 'list';
    actionData = interactive.actionList;
  } else if (interactive.actionFlow) {
    actionType = 'flow';
    actionData = interactive.actionFlow;
  } else if (interactive.actionLocationRequest) {
    actionType = 'location_request';
    actionData = interactive.actionLocationRequest;
  }

  return {
    id: template.id,
    name: template.name,
    type: actionType,
    content: {
      name: template.name,
      type: actionType,
      header: interactive.header ? {
        type: interactive.header.type,
        text: interactive.header.content || "",
        media_url: interactive.header.type !== 'text' ? interactive.header.content || "" : ""
      } : undefined,
      body: {
        text: interactive.body?.text || ''
      },
      footer: interactive.footer ? {
        text: interactive.footer.text
      } : undefined,
      action: actionData,
    },
    createdAt: template.createdAt,
    updatedAt: template.updatedAt,
  };
}

// POST - Create message with reactions atomically
export async function POST(request: NextRequest) {
  const requestId = `post_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  try {
    // Authentication check
    const session = await auth();
    if (!session?.user?.id) {
      const error = errorHandler.handleError(
        new Error("User not authenticated"),
        {
          userId: undefined,
          action: 'create_message_with_reactions',
          component: 'messages-with-reactions-api'
        }
      );
      
      console.error(`[${requestId}] Authentication failed:`, error);
      
      return NextResponse.json(
        { 
          error: "Unauthorized",
          code: "AUTH_UNAUTHORIZED",
          requestId 
        }, 
        { status: 401 }
      );
    }

    // Parse request body with error handling
    let body;
    try {
      body = await request.json();
    } catch (parseError) {
      const error = errorHandler.handleError(
        new Error("Invalid JSON in request body"),
        {
          userId: session.user!.id,
          action: 'parse_request_body',
          component: 'messages-with-reactions-api'
        }
      );
      
      console.error(`[${requestId}] JSON parse error:`, error);
      
      return NextResponse.json(
        {
          error: "Invalid request format",
          code: "INVALID_JSON",
          requestId
        },
        { status: 400 }
      );
    }

    // Enhanced validation with detailed error reporting
    const validationResult = SaveMessageWithReactionsSchema.safeParse(body);
    if (!validationResult.success) {
      const validationError = errorHandler.handleValidationError(
        validationResult.error.errors,
        {
          userId: session.user!.id,
          action: 'validate_request',
          component: 'messages-with-reactions-api'
        }
      );
      
      console.error(`[${requestId}] Validation failed:`, validationError);
      
      return NextResponse.json(
        {
          error: "Validation failed",
          code: "VALIDATION_FAILED",
          details: validationResult.error.errors.map(err => ({
            field: err.path.join('.'),
            message: err.message,
            code: err.code
          })),
          requestId
        },
        { status: 400 }
      );
    }

    const { inboxId, message, reactions } = validationResult.data;

    // Additional business logic validation
    try {
      const messageValidation = InteractiveMessageValidator.validateMessage({
        ...message,
        isActive: true
      } as any);
      
      if (!messageValidation.isValid) {
        console.error(`[${requestId}] Business validation failed:`, messageValidation.errors);
        
        return NextResponse.json(
          {
            error: "Message validation failed",
            code: "BUSINESS_VALIDATION_FAILED",
            details: messageValidation.errors,
            requestId
          },
          { status: 400 }
        );
      }
    } catch (businessValidationError) {
      const error = errorHandler.handleError(
        businessValidationError,
        {
          userId: session.user!.id,
          inboxId,
          action: 'business_validation',
          component: 'messages-with-reactions-api'
        }
      );
      
      console.error(`[${requestId}] Business validation error:`, error);
      
      return NextResponse.json(
        {
          error: "Validation error",
          code: "BUSINESS_VALIDATION_ERROR",
          requestId
        },
        { status: 400 }
      );
    }

    // Enhanced logging for debugging
    console.log(`[${requestId}] Creating message - User: ${session.user!.id}, InboxId: ${inboxId}`);
    console.log(`[${requestId}] Message data:`, {
      name: message.name,
      type: message.type,
      bodyLength: message.body.text.length,
      hasHeader: !!message.header,
      hasFooter: !!message.footer,
      hasAction: !!message.action
    });
    console.log(`[${requestId}] Reactions count: ${reactions.length}`);

    // Verify caixa exists and user has access
    let caixa;
    try {
      caixa = await getPrismaInstance().chatwitInbox.findFirst({
        where: {
          id: inboxId, // inboxId is actually the internal ChatwitInbox id
          usuarioChatwit: {
            appUserId: session.user!.id,
          },
        },
      });
    } catch (dbError) {
      const error = errorHandler.handleError(
        dbError,
        {
          userId: session.user!.id,
          inboxId,
          action: 'verify_caixa_access',
          component: 'messages-with-reactions-api'
        }
      );
      
      console.error(`[${requestId}] Database error verifying caixa:`, error);
      
      return NextResponse.json(
        {
          error: "Database error",
          code: "DATABASE_ERROR",
          requestId
        },
        { status: 500 }
      );
    }

    if (!caixa) {
      console.warn(`[${requestId}] Caixa not found or access denied - InboxId: ${inboxId}, UserId: ${session.user!.id}`);
      
      return NextResponse.json(
        { 
          error: "Caixa not found or access denied",
          code: "CAIXA_NOT_FOUND",
          requestId
        },
        { status: 404 }
      );
    }

    // Execute atomic transaction with enhanced error handling
    let result;
    try {
      result = await getPrismaInstance().$transaction(async (tx) => {
      // Create the interactive message
      const savedMessage = await tx.template.create({
        data: {
          name: message.name,
          type: "INTERACTIVE_MESSAGE",
          description: `Mensagem interativa: ${message.name}`,
          scope: "PRIVATE",
          status: "APPROVED",
          language: "pt_BR",
          tags: [],
          isActive: true,
          createdById: session.user!.id,
          inboxId: inboxId, // Use the passed inboxId (which is the internal ChatwitInbox id)
          interactiveContent: {
            create: {
              body: {
                create: {
                  text: message.body.text
                }
              },
              ...(message.header && {
                header: {
                  create: {
                    type: message.header.type,
                    // Suporta ambos formatos: content (texto) e media_url (mídia)
                    content:
                      message.header.content ||
                      message.header.media_url ||
                      (message as any).header?.mediaUrl ||
                      message.header.text ||
                      "",
                  },
                },
              }),
              ...(message.footer && {
                footer: {
                  create: {
                    text: message.footer.text
                  }
                }
              }),
              ...(message.type === 'cta_url' && message.action && {
                actionCtaUrl: {
                  create: {
                    displayText: message.action.displayText || "Clique aqui",
                    url: message.action.url || ""
                  }
                }
              }),
              ...(message.type === 'button' && message.action && {
                actionReplyButton: {
                  create: {
                    buttons: message.action.buttons || []
                  }
                }
              }),
              ...(message.type === 'list' && message.action && {
                actionList: {
                  create: {
                    buttonText: message.action.buttonText || "Ver opções",
                    sections: message.action.sections || []
                  }
                }
              }),
              ...(message.type === 'flow' && message.action && {
                actionFlow: {
                  create: {
                    flowId: message.action.flowId || "",
                    flowCta: message.action.flowCta || "Iniciar",
                    flowMode: message.action.flowMode || "published",
                    flowData: message.action.flowData || null
                  }
                }
              }),
              ...(message.type === 'location_request' && message.action && {
                actionLocationRequest: {
                  create: {
                    requestText: message.action.requestText || "Compartilhar localização"
                  }
                }
              })
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
          }
        }
      });

      // Create button reactions if any
      const savedReactions = [];
      if (reactions.length > 0) {
        for (const reactionData of reactions) {
          if (reactionData.reaction) {
            const actionPayload = {
              emoji: reactionData.reaction.type === 'emoji' ? reactionData.reaction.value : null,
              textReaction: reactionData.reaction.type === 'text' ? reactionData.reaction.value : null,
            };
            
            const savedReaction = await tx.mapeamentoBotao.create({
              data: {
                buttonId: reactionData.buttonId,
                inboxId: inboxId, // Use the passed inboxId (which is the internal ChatwitInbox id)
                actionType: 'SEND_TEMPLATE',
                actionPayload,
                description:
                  reactionData.reaction.type === "text"
                    ? reactionData.reaction.value
                    : null,
              },
            });
            savedReactions.push(savedReaction);
          }
        }
      }

        return {
          message: savedMessage,
          reactions: savedReactions,
        };
      });
      
      console.log(`[${requestId}] Transaction completed successfully - MessageId: ${result.message.id}, ReactionsCount: ${result.reactions.length}`);
      
    } catch (transactionError) {
      const error = errorHandler.handleError(
        transactionError,
        {
          userId: session.user!.id,
          inboxId,
          action: 'database_transaction',
          component: 'messages-with-reactions-api'
        }
      );
      
      console.error(`[${requestId}] Transaction failed:`, error);
      
      // Handle specific database errors with detailed responses
      if (transactionError instanceof Error) {
        if (transactionError.message.includes("Unique constraint")) {
          return NextResponse.json(
            { 
              error: "Duplicate button ID detected",
              code: "DATABASE_CONSTRAINT_VIOLATION",
              details: "Button IDs must be unique within a message",
              requestId
            },
            { status: 409 }
          );
        }
        if (transactionError.message.includes("Foreign key constraint")) {
          return NextResponse.json(
            { 
              error: "Invalid reference data",
              code: "DATABASE_FOREIGN_KEY_VIOLATION",
              details: "Referenced data does not exist",
              requestId
            },
            { status: 400 }
          );
        }
        if (transactionError.message.includes("Connection")) {
          return NextResponse.json(
            {
              error: "Database connection error",
              code: "DATABASE_CONNECTION_ERROR",
              details: "Unable to connect to database",
              requestId
            },
            { status: 503 }
          );
        }
      }
      
      return NextResponse.json(
        { 
          error: "Database transaction failed",
          code: "DATABASE_TRANSACTION_FAILED",
          requestId
        },
        { status: 500 }
      );
    }

    // Format response
    const formattedMessage = formatMessage(result.message);
    const formattedReactions = result.reactions.map(formatReaction);

    console.log(`[${requestId}] Response formatted successfully`);

    return NextResponse.json({
      success: true,
      messageId: result.message?.id || null,
      reactionIds: result.reactions.map((r) => r.id),
      message: formattedMessage,
      reactions: formattedReactions,
      requestId
    });
    
  } catch (error) {
    // Catch-all error handler for unexpected errors
    const structuredError = errorHandler.handleError(
      error,
      {
        userId: undefined,
        inboxId: undefined,
        action: 'create_message_with_reactions',
        component: 'messages-with-reactions-api'
      }
    );
    
    console.error(`[${requestId}] Unexpected error:`, structuredError);

    return NextResponse.json(
      { 
        error: "Internal server error",
        code: "INTERNAL_SERVER_ERROR",
        requestId
      },
      { status: 500 }
    );
  }
}

// PUT - Update existing message with reactions atomically
export async function PUT(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { messageId, message, reactions } = body;

    if (!messageId) {
      return NextResponse.json(
        { error: "messageId is required for updates" },
        { status: 400 }
      );
    }

    // Validate request body (partial update allowed)
    const PartialMessageSchema = InteractiveMessageSchema.partial();
    const messageValidation = PartialMessageSchema.safeParse(message);
    if (!messageValidation.success) {
      return NextResponse.json(
        {
          error: "Message validation failed",
          details: messageValidation.error.errors,
        },
        { status: 400 }
      );
    }

    // Reações no fluxo unificado vêm como { buttonId, reaction: { type, value } }
    // Usamos o mesmo schema do POST para evitar 400 indevido
    const reactionsValidation = z
      .array(ApiButtonReactionSchema)
      .safeParse(reactions || []);
    if (!reactionsValidation.success) {
      return NextResponse.json(
        {
          error: "Reactions validation failed",
          details: reactionsValidation.error.errors,
        },
        { status: 400 }
      );
    }

    // Verify message exists and user has access
    const existingMessage = await getPrismaInstance().template.findFirst({
      where: {
        id: messageId,
        createdById: session.user!.id,
        type: "INTERACTIVE_MESSAGE",
      },
      include: {
        inbox: { select: { usuarioChatwitId: true } },
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
        }
      }
    });

    if (!existingMessage) {
      return NextResponse.json(
        { error: "Message not found or access denied" },
        { status: 404 }
      );
    }

    // Execute atomic transaction
    const result = await getPrismaInstance().$transaction(async (tx) => {
      // Update the template
      const updatedTemplate = await tx.template.update({
        where: { id: messageId },
        data: {
          ...(message.name && { name: message.name }),
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
          }
        }
      });

      // Update interactive content if it exists
      if (updatedTemplate.interactiveContent) {
        const interactiveContentId = updatedTemplate.interactiveContent.id;
        
        // Update body
        if (message.body?.text) {
          await tx.body.update({
            where: { id: updatedTemplate.interactiveContent.bodyId },
            data: { text: message.body.text }
          });
        }

        // Update header
        if (message.header) {
          if (updatedTemplate.interactiveContent.header) {
            await tx.header.update({
              where: { id: updatedTemplate.interactiveContent.header.id },
              data: {
                type: message.header.type,
                content: message.header.content || message.header.media_url || message.header.mediaUrl || message.header.text || ""
              }
            });
          } else {
            await tx.header.create({
              data: {
                type: message.header.type,
                content: message.header.content || message.header.media_url || message.header.mediaUrl || message.header.text || "",
                interactiveContentId
              }
            });
          }
        }

        // Update footer
        if (message.footer) {
          if (updatedTemplate.interactiveContent.footer) {
            await tx.footer.update({
              where: { id: updatedTemplate.interactiveContent.footer.id },
              data: { text: message.footer.text }
            });
          } else {
            await tx.footer.create({
              data: {
                text: message.footer.text,
                interactiveContentId
              }
            });
          }
        }

        // Update actions based on type
        if (message.action && message.type) {
          // Delete existing actions
          if (updatedTemplate.interactiveContent.actionCtaUrl) {
            await tx.actionCtaUrl.delete({ where: { id: updatedTemplate.interactiveContent.actionCtaUrl.id } });
          }
          if (updatedTemplate.interactiveContent.actionReplyButton) {
            await tx.actionReplyButton.delete({ where: { id: updatedTemplate.interactiveContent.actionReplyButton.id } });
          }
          if (updatedTemplate.interactiveContent.actionList) {
            await tx.actionList.delete({ where: { id: updatedTemplate.interactiveContent.actionList.id } });
          }
          if (updatedTemplate.interactiveContent.actionFlow) {
            await tx.actionFlow.delete({ where: { id: updatedTemplate.interactiveContent.actionFlow.id } });
          }
          if (updatedTemplate.interactiveContent.actionLocationRequest) {
            await tx.actionLocationRequest.delete({ where: { id: updatedTemplate.interactiveContent.actionLocationRequest.id } });
          }

          // Create new action based on type
          if (message.type === 'cta_url') {
            await tx.actionCtaUrl.create({
              data: {
                displayText: message.action.displayText || "Clique aqui",
                url: message.action.url || "",
                interactiveContentId
              }
            });
          } else if (message.type === 'button') {
            await tx.actionReplyButton.create({
              data: {
                buttons: message.action.buttons || [],
                interactiveContentId
              }
            });
          } else if (message.type === 'list') {
            await tx.actionList.create({
              data: {
                buttonText: message.action.buttonText || "Ver opções",
                sections: message.action.sections || [],
                interactiveContentId
              }
            });
          } else if (message.type === 'flow') {
            await tx.actionFlow.create({
              data: {
                flowId: message.action.flowId || "",
                flowCta: message.action.flowCta || "Iniciar",
                flowMode: message.action.flowMode || "published",
                flowData: message.action.flowData || null,
                interactiveContentId
              }
            });
          } else if (message.type === 'location_request') {
            await tx.actionLocationRequest.create({
              data: {
                requestText: message.action.requestText || "Compartilhar localização",
                interactiveContentId
              }
            });
          }
        }
      }

      // Fetch updated template with all relations
      const updatedMessage = await tx.template.findUnique({
        where: { id: messageId },
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
          }
        }
      });

      // Update button reactions if provided
      let updatedReactions = [];
      if (reactions && reactions.length >= 0) {
        // Get the ChatwitInbox id for this template
        const templateInboxId = existingMessage.inboxId;
        
        if (templateInboxId) {
      // Limpar apenas reações dos botões presentes no payload de reactions
      const incomingButtonIds = Array.from(new Set(
        (reactions || []).map((r: any) => r?.buttonId).filter(Boolean)
      ));

      if (incomingButtonIds.length > 0) {
        await tx.mapeamentoBotao.deleteMany({
          where: {
            inboxId: templateInboxId,
            buttonId: { in: incomingButtonIds },
          },
        });
      }

          // Group incoming reactions by buttonId to support emoji + text coexistence
          const grouped = new Map<string, { emoji?: string | null; textReaction?: string | null }>();
          for (const r of reactions) {
            if (!r?.reaction) continue;
            const current = grouped.get(r.buttonId) || { emoji: null, textReaction: null };
            if (r.reaction.type === 'emoji') current.emoji = r.reaction.value;
            if (r.reaction.type === 'text') current.textReaction = r.reaction.value;
            grouped.set(r.buttonId, current);
          }

          // Create one mapping per buttonId with merged payload
          for (const [buttonId, payload] of grouped.entries()) {
            const savedReaction = await tx.mapeamentoBotao.create({
              data: {
                buttonId,
                inboxId: templateInboxId, // Use the ChatwitInbox id
                actionType: 'SEND_TEMPLATE',
                actionPayload: payload,
                description: payload.textReaction || null,
              },
            });
            updatedReactions.push(savedReaction);
          }
        }
      }

      return {
        message: updatedMessage,
        reactions: updatedReactions,
      };
    });

    // Invalidação de cache do Instagram para intents vinculadas a este template/inbox
    try {
      const inboxId = existingMessage.inboxId;
      const usuarioChatwitId = existingMessage.inbox?.usuarioChatwitId;

      if (inboxId && usuarioChatwitId) {
        // Buscar intents que apontam para este template nesta inbox
        const mappedIntents = await getPrismaInstance().mapeamentoIntencao.findMany({
          where: { templateId: messageId, inboxId },
          select: { intentName: true },
        });

        for (const mi of mappedIntents) {
          await invalidateTemplateMappingCache(mi.intentName, usuarioChatwitId, inboxId);
        }
      }
    } catch (cacheError) {
      console.warn("[MessagesWithReactions][PUT] Cache invalidation failed", cacheError);
      // Não falhar a requisição por causa de cache
    }

    // Format response
    const formattedMessage = formatMessage(result.message);
    const formattedReactions = result.reactions.map(formatReaction);

    return NextResponse.json({
      success: true,
      messageId: result.message?.id || null,
      reactionIds: result.reactions.map((r) => r.id),
      message: formattedMessage,
      reactions: formattedReactions,
    });
  } catch (error) {
    console.error("Error updating message with reactions:", error);

    // Handle specific database errors
    if (error instanceof Error) {
      if (error.message.includes("Unique constraint")) {
        return NextResponse.json(
          { error: "Duplicate button ID detected" },
          { status: 409 }
        );
      }
      if (error.message.includes("Foreign key constraint")) {
        return NextResponse.json(
          { error: "Invalid reference data" },
          { status: 400 }
        );
      }
    }

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// GET - Retrieve message with reactions
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const messageId = searchParams.get("messageId");
    const inboxId = searchParams.get("inboxId");

    if (!messageId && !inboxId) {
      return NextResponse.json(
        { error: "Either messageId or inboxId is required" },
        { status: 400 }
      );
    }

    if (messageId) {
      // Get specific message with reactions
      const message = await getPrismaInstance().template.findFirst({
        where: {
          id: messageId,
          type: "INTERACTIVE_MESSAGE",
          inbox: {
            usuarioChatwit: {
              appUserId: session.user!.id,
            },
          },
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
          }
        }
      });

      if (!message) {
        return NextResponse.json(
          { error: "Message not found or access denied" },
          { status: 404 }
        );
      }

      // Get button reactions for this message's inbox
      const buttonReactions = await getPrismaInstance().mapeamentoBotao.findMany({
        where: { 
          inboxId: message.inboxId!, // Use the ChatwitInbox id from the template
        },
        orderBy: { createdAt: "asc" },
      });

      const formattedMessage = formatMessage(message);
      const formattedReactions = buttonReactions.map(formatReaction);

      return NextResponse.json({
        success: true,
        message: formattedMessage,
        reactions: formattedReactions,
      });
    }

    if (inboxId) {
      // Verify user has access to this ChatwitInbox
      const chatwitInbox = await getPrismaInstance().chatwitInbox.findFirst({
        where: {
          id: inboxId, // inboxId is the internal ChatwitInbox id
          usuarioChatwit: {
            appUserId: session.user!.id,
          },
        },
      });

      if (!chatwitInbox) {
        return NextResponse.json(
          { error: "Inbox not found or access denied" },
          { status: 404 }
        );
      }

      // Get all messages for this ChatwitInbox
      const messages = await getPrismaInstance().template.findMany({
        where: {
          inboxId: inboxId, // Use the passed inboxId directly
          type: "INTERACTIVE_MESSAGE",
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
          }
        },
        orderBy: { createdAt: "desc" },
      });

      // Get all button reactions for this inbox
      const allButtonReactions = await getPrismaInstance().mapeamentoBotao.findMany({
        where: { 
          inboxId: inboxId, // Use the passed inboxId directly
        },
        orderBy: { createdAt: "asc" },
      });

      // Group reactions by message ID
      const reactionsByMessageId = allButtonReactions.reduce((acc, reaction) => {
        if (!acc[reaction.inboxId]) {
          acc[reaction.inboxId] = [];
        }
        acc[reaction.inboxId].push(reaction);
        return acc;
      }, {} as Record<string, any[]>);

      const formattedMessages = messages.map((message) => ({
        ...formatMessage(message),
        reactions: (reactionsByMessageId[message.id] || []).map(formatReaction),
      }));

      return NextResponse.json({
        success: true,
        messages: formattedMessages,
      });
    }
  } catch (error) {
    console.error("Error fetching messages with reactions:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
