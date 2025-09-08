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
  type: z.enum(["emoji", "text", "action"]),
  value: z.string().min(1),
});

const ApiButtonReactionSchema = z.object({
  buttonId: z.string().min(1),
  reaction: ApiReactionSchema.optional(),
  action: z.string().optional(), // Para suportar handoff e outras ações
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
    // Instagram specific types
    "generic",
    "quick_replies", 
    "button_template"
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
    text: z.string().min(1, "Body text is required"),
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
  // Parse actionPayload to extract emoji, textReaction, and action
  const actionPayload = reaction.actionPayload as any;
  const emoji = actionPayload?.emoji;
  const textReaction = actionPayload?.textReaction;
  const action = actionPayload?.action;
  
  // Determine type based on what's present (prioritize action > text > emoji)
  let type: 'emoji' | 'text' | 'action' = 'emoji';
  if (action) {
    type = 'action';
  } else if (textReaction) {
    type = 'text';
  }
  
  return {
    id: reaction.id,
    buttonId: reaction.buttonId,
    messageId: reaction.inboxId, // Use inboxId instead of messageId
    type,
    emoji: emoji || null,
    textReaction: textReaction || null,
    textResponse: textReaction || null, // Alias for compatibility
    action: action || null,
    isActive: true, // MapeamentoBotao doesn't have isActive field, assume active
    createdAt: reaction.createdAt,
  };
}

// Helper function to format message response
function formatMessage(template: any) {
  const interactive = template.interactiveContent;
  if (!interactive) return null;

  // Determinar o tipo de ação (para WhatsApp)
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

  // Para templates Instagram, usar os tipos específicos baseados no conteúdo
  if (!actionType) {
    const bodyText = interactive.body?.text || '';
    const hasHeader = !!interactive.header;
    const hasFooter = !!interactive.footer;
    
    // Instagram type detection based on content
    if (hasHeader && hasFooter) {
      actionType = 'generic'; // Carousel/Generic template
    } else if (bodyText.length <= 640) {
      actionType = 'button_template'; // Button template
    } else if (bodyText.length <= 1000) {
      actionType = 'quick_replies'; // Quick replies
    } else {
      actionType = 'generic'; // Default fallback
    }
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
        media_url: interactive.header.type !== 'text' ? interactive.header.content || "" : "",
        content: interactive.header.content || ""
      } : null, // ✅ FIX: Retornar null em vez de undefined para headers vazios
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

    // Instagram specific validation
    if (message.type === 'generic' || message.type === 'quick_replies' || message.type === 'button_template') {
      const bodyTextLength = message.body.text.length;
      
      if (message.type === 'generic' && bodyTextLength > 80) {
        return NextResponse.json(
          {
            error: "Generic template title too long",
            code: "INSTAGRAM_VALIDATION_FAILED",
            details: [{ field: "body.text", message: "Generic template title must be 80 characters or less" }],
            requestId
          },
          { status: 400 }
        );
      }
      
      if (message.type === 'button_template' && bodyTextLength > 640) {
        return NextResponse.json(
          {
            error: "Button template text too long", 
            code: "INSTAGRAM_VALIDATION_FAILED",
            details: [{ field: "body.text", message: "Button template text must be 640 characters or less" }],
            requestId
          },
          { status: 400 }
        );
      }
      
      if (message.type === 'quick_replies' && bodyTextLength > 1000) {
        return NextResponse.json(
          {
            error: "Quick replies text too long",
            code: "INSTAGRAM_VALIDATION_FAILED", 
            details: [{ field: "body.text", message: "Quick replies text must be 1000 characters or less" }],
            requestId
          },
          { status: 400 }
        );
      }
    }

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
              // Instagram Quick Replies e Button Template não usam header nem footer
              // ✅ FIX: Só criar header se tiver conteúdo real (não vazio)
              ...(message.header && 
                  message.type !== 'quick_replies' && 
                  message.type !== 'button_template' && 
                  (message.header.content || message.header.media_url || message.header.mediaUrl || message.header.text) && 
                  (message.header.content || message.header.media_url || message.header.mediaUrl || message.header.text)?.trim() !== "" && {
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
              ...(message.footer && message.type !== 'quick_replies' && message.type !== 'button_template' && {
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
              ...((message.type === 'button' || message.type === 'generic' || message.type === 'button_template' || message.type === 'quick_replies') && message.action && {
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
      const savedReactions = [] as any[];
      if (reactions.length > 0) {
        // Group by buttonId to support emoji + text + action coexistindo em um único registro
        const grouped = new Map<string, { emoji?: string | null; textReaction?: string | null; action?: string | null }>();
        for (const r of reactions) {
          if (!r?.reaction && !r?.action) continue;
          const current = grouped.get(r.buttonId) || { emoji: null, textReaction: null, action: null };
          
          if (r.reaction?.type === 'emoji') current.emoji = r.reaction.value;
          if (r.reaction?.type === 'text') current.textReaction = r.reaction.value;
          if (r.reaction?.type === 'action') current.action = r.reaction.value;
          if (r.action) current.action = r.action; // Fallback para formato alternativo
          
          grouped.set(r.buttonId, current);
        }

        const buttonIds = Array.from(grouped.keys());
        if (buttonIds.length > 0) {
          // Evita violação de unique (MapeamentoBotao_buttonId_key)
          await tx.mapeamentoBotao.deleteMany({ where: { buttonId: { in: buttonIds } } });
        }

        for (const [buttonId, payload] of grouped.entries()) {
          const savedReaction = await tx.mapeamentoBotao.create({
            data: {
              buttonId,
              inboxId: inboxId, // ChatwitInbox id
              actionType: 'BUTTON_REACTION',
              actionPayload: payload,
              description: payload.action ? `Ação: ${payload.action}` : (payload.textReaction || payload.emoji || null),
            },
          });
          savedReactions.push(savedReaction);
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

    // Format response with enhanced debugging
    const formattedMessage = formatMessage(result.message);
    const formattedReactions = result.reactions.map(formatReaction);

    console.log(`[${requestId}] Response formatting completed:`, {
      hasMessage: !!formattedMessage,
      messageId: result.message?.id,
      reactionsCount: formattedReactions.length,
      messageType: formattedMessage?.type
    });

    const responseData = {
      success: true,
      messageId: result.message?.id || null,
      reactionIds: result.reactions.map((r: any) => r.id),
      message: formattedMessage,
      reactions: formattedReactions,
      requestId
    };

    console.log(`[${requestId}] Final response data:`, JSON.stringify(responseData, null, 2));

    return NextResponse.json(responseData);
    
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
    // Mas podem vir no formato ButtonReaction do frontend, então transformamos primeiro
    console.log('🔍 [PUT] Validating reactions:', { 
      reactionsCount: reactions?.length || 0, 
      reactionsData: reactions,
      messageId 
    });
    
    // Transformar ButtonReaction format para ApiButtonReaction format se necessário
    const transformedReactions = (reactions || []).map((reaction: any, index: number) => {
      console.log(`🔍 [PUT] Processing reaction ${index}:`, reaction);
      
      // Se já está no formato correto, validar se tem valores válidos
      if (reaction.reaction || reaction.action) {
        // Verificar se reaction.value não está vazio
        if (reaction.reaction && (!reaction.reaction.value || reaction.reaction.value.trim() === '')) {
          console.log(`⚠️ [PUT] Skipping reaction ${index} - empty reaction.value:`, reaction);
          return null;
        }
        // Verificar se action não está vazio
        if (reaction.action && reaction.action.trim() === '') {
          console.log(`⚠️ [PUT] Skipping reaction ${index} - empty action:`, reaction);
          return null;
        }
        return reaction;
      }
      
      // Se está no formato ButtonReaction, transformar
      if (reaction.buttonId) {
        const transformed: any = { buttonId: reaction.buttonId };
        let hasValidValue = false;
        
        // Só adicionar reaction se houver valor válido (não vazio)
        if (reaction.emoji && reaction.emoji.trim()) {
          transformed.reaction = { type: 'emoji', value: reaction.emoji.trim() };
          hasValidValue = true;
        } else if (reaction.textResponse && reaction.textResponse.trim()) {
          transformed.reaction = { type: 'text', value: reaction.textResponse.trim() };
          hasValidValue = true;
        } else if (reaction.action && reaction.action.trim()) {
          transformed.action = reaction.action.trim();
          hasValidValue = true;
        }
        
        if (!hasValidValue) {
          // Se não há valor válido, marcar como inválida
          console.log(`⚠️ [PUT] Skipping reaction ${index} - no valid values:`, reaction);
          return null;
        }
        
        console.log(`🔄 [PUT] Transformed reaction ${index}:`, { original: reaction, transformed });
        return transformed;
      }
      
      console.log(`⚠️ [PUT] Skipping reaction ${index} - no buttonId:`, reaction);
      return null;
    }).filter(Boolean); // Remove reações nulas/inválidas
    
    console.log('📊 [PUT] Transformation summary:', {
      originalCount: reactions?.length || 0,
      transformedCount: transformedReactions.length,
      transformedReactions
    });
    
    // Permitir array vazio quando todas as reações são removidas
    const reactionsValidation = z
      .array(ApiButtonReactionSchema)
      .safeParse(transformedReactions);
    
    // Se a validação falhou
    if (!reactionsValidation.success) {
      // Se são reações vazias (remoção total), isso é válido
      if (Array.isArray(transformedReactions) && transformedReactions.length === 0) {
        console.log('✅ [PUT] Empty reactions array - allowing removal of all reactions');
      } else {
        console.error('❌ [PUT] Reactions validation failed:', {
          errors: reactionsValidation.error.errors,
          originalData: reactions,
          transformedData: transformedReactions,
          expectedSchema: 'ApiButtonReactionSchema = { buttonId, reaction?: { type, value }, action?: string }'
        });
        
        // Log cada reação que falhou
        transformedReactions.forEach((reaction: any, index: number) => {
          try {
            ApiButtonReactionSchema.parse(reaction);
            console.log(`✅ Reaction ${index} is valid:`, reaction);
          } catch (error) {
            console.error(`❌ Reaction ${index} failed validation:`, { reaction, error });
          }
        });
        
        return NextResponse.json(
          {
            error: "Reactions validation failed",
            details: reactionsValidation.error.errors,
            receivedData: reactions,
            transformedData: transformedReactions,
            expectedFormat: "Array<{ buttonId: string, reaction?: { type: 'emoji'|'text'|'action', value: string }, action?: string }>"
          },
          { status: 400 }
        );
      }
    } else {
      console.log('✅ [PUT] All reactions validated successfully:', transformedReactions);
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

        // Update header (não salvar para Instagram Quick Replies e Button Template)
        // ✅ FIX: Só atualizar header se tiver conteúdo real (não vazio)
        if (message.header && 
            message.type !== 'quick_replies' && 
            message.type !== 'button_template' &&
            (message.header.content || message.header.media_url || message.header.mediaUrl || message.header.text) &&
            (message.header.content || message.header.media_url || message.header.mediaUrl || message.header.text)?.trim() !== "") {
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
        } else if (message.header && 
                   (!(message.header.content || message.header.media_url || message.header.mediaUrl || message.header.text) ||
                    (message.header.content || message.header.media_url || message.header.mediaUrl || message.header.text)?.trim() === "") &&
                   updatedTemplate.interactiveContent.header) {
          // ✅ FIX: Remover header se foi deixado vazio
          await tx.header.delete({
            where: { id: updatedTemplate.interactiveContent.header.id }
          });
        }

        // Update footer (não salvar para Instagram Quick Replies e Button Template)
        if (message.footer && message.type !== 'quick_replies' && message.type !== 'button_template') {
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
          } else if (message.type === 'button' || message.type === 'generic' || message.type === 'button_template' || message.type === 'quick_replies') {
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
          // Use validated reactions or empty array
          const validatedReactions = reactionsValidation.success ? reactionsValidation.data : [];
          
          console.log('🗑️ [PUT] Clearing ALL existing reactions for inbox:', templateInboxId);
          
          // CORREÇÃO: Primeiro limpar TODAS as reações desta inbox
          // Isso garante que reações removidas sejam deletadas do banco
          await tx.mapeamentoBotao.deleteMany({
            where: {
              inboxId: templateInboxId,
            },
          });

          console.log('✅ [PUT] All existing reactions cleared, now adding new ones:', validatedReactions.length);

          // Group incoming reactions by buttonId to support emoji + text + action coexistence
          const grouped = new Map<string, { emoji?: string | null; textReaction?: string | null; action?: string | null }>();
          const reactionsToProcess = validatedReactions;
          
          for (const r of reactionsToProcess) {
            if (!r?.reaction && !r?.action) continue;
            const current = grouped.get(r.buttonId) || { emoji: null, textReaction: null, action: null };
            
            if (r.reaction?.type === 'emoji') current.emoji = r.reaction.value;
            if (r.reaction?.type === 'text') current.textReaction = r.reaction.value;
            if (r.reaction?.type === 'action') current.action = r.reaction.value;
            if (r.action) current.action = r.action; // Fallback para formato alternativo
            
            grouped.set(r.buttonId, current);
          }

          // Create one mapping per buttonId with merged payload
          for (const [buttonId, payload] of grouped.entries()) {
            const savedReaction = await tx.mapeamentoBotao.create({
              data: {
                buttonId,
                inboxId: templateInboxId, // Use the ChatwitInbox id
                actionType: 'BUTTON_REACTION',
                actionPayload: payload,
                description: payload.action ? `Ação: ${payload.action}` : (payload.textReaction || payload.emoji || null),
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
    const reactionsOnly = searchParams.get("reactionsOnly") === "true";

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

      // Special case: return only reactions for this inbox
      if (reactionsOnly) {
        const buttonReactions = await getPrismaInstance().mapeamentoBotao.findMany({
          where: { 
            inboxId: inboxId,
          },
          orderBy: { createdAt: "asc" },
        });

        const formattedReactions = buttonReactions.map(formatReaction);

        return NextResponse.json({
          success: true,
          reactions: formattedReactions,
        });
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

// DELETE - Delete message with reactions atomically
export async function DELETE(request: NextRequest) {
  const requestId = `delete_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  try {
    // Authentication check
    const session = await auth();
    if (!session?.user?.id) {
      console.error(`[${requestId}] Authentication failed`);
      
      return NextResponse.json(
        { 
          error: "Unauthorized",
          code: "AUTH_UNAUTHORIZED",
          requestId 
        }, 
        { status: 401 }
      );
    }

    // Get messageId from query parameters
    const { searchParams } = new URL(request.url);
    const messageId = searchParams.get("messageId");

    if (!messageId) {
      console.error(`[${requestId}] Missing messageId parameter`);
      
      return NextResponse.json(
        {
          error: "messageId is required",
          code: "MISSING_MESSAGE_ID",
          requestId
        },
        { status: 400 }
      );
    }

    console.log(`[${requestId}] Deleting message - User: ${session.user!.id}, MessageId: ${messageId}`);

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
            actionReplyButton: true,
          }
        }
      }
    });

    if (!existingMessage) {
      console.warn(`[${requestId}] Message not found or access denied - MessageId: ${messageId}, UserId: ${session.user!.id}`);
      
      return NextResponse.json(
        { 
          error: "Message not found or access denied",
          code: "MESSAGE_NOT_FOUND",
          requestId
        },
        { status: 404 }
      );
    }

    // Execute atomic transaction to delete message and related data
    await getPrismaInstance().$transaction(async (tx) => {
      // 1. Delete button reactions first (foreign key dependency)
      if (existingMessage.interactiveContent?.actionReplyButton) {
        // Get all button IDs from the message
        const buttons = existingMessage.interactiveContent.actionReplyButton.buttons as any[] || [];
        const buttonIds = buttons.map((btn: any) => btn.id).filter(Boolean);
        
        if (buttonIds.length > 0) {
          console.log(`[${requestId}] Deleting ${buttonIds.length} button reactions`);
          await tx.mapeamentoBotao.deleteMany({
            where: { 
              buttonId: { in: buttonIds },
              inboxId: existingMessage.inboxId!
            }
          });
        }
      }

      // 2. Delete the template (cascade will handle related data)
      await tx.template.delete({
        where: { id: messageId }
      });
      
      console.log(`[${requestId}] Template deleted successfully`);
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
        
        console.log(`[${requestId}] Cache invalidated for ${mappedIntents.length} mapped intents`);
      }
    } catch (cacheError) {
      console.warn(`[${requestId}] Cache invalidation failed:`, cacheError);
      // Não falhar a requisição por causa de cache
    }

    console.log(`[${requestId}] Message deletion completed successfully`);

    return NextResponse.json({
      success: true,
      messageId,
      requestId
    });
    
  } catch (error) {
    console.error(`[${requestId}] Error deleting message:`, error);

    // Handle specific database errors
    if (error instanceof Error) {
      if (error.message.includes("Foreign key constraint")) {
        return NextResponse.json(
          { 
            error: "Cannot delete message due to existing references",
            code: "DATABASE_FOREIGN_KEY_VIOLATION",
            requestId
          },
          { status: 409 }
        );
      }
    }

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
