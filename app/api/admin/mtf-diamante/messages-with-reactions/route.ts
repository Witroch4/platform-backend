import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
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
      media_url: z.string().url().optional(),
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
  caixaId: z.string().min(1, "Caixa ID is required"),
  message: ApiInteractiveMessageSchema,
  reactions: z.array(ApiButtonReactionSchema),
});

// Helper function to format reaction response
function formatReaction(reaction: any) {
  return {
    id: reaction.id,
    buttonId: reaction.buttonId,
    messageId: reaction.messageId,
    type: reaction.description ? "text" : "emoji",
    emoji: reaction.emoji,
    textReaction: reaction.description,
    isActive: reaction.isActive,
    createdAt: reaction.createdAt,
  };
}

// Helper function to format message response
function formatMessage(message: any) {
  return {
    id: message.id,
    name: message.name,
    type: message.type,
    content: {
      name: message.name,
      type: message.type,
      header: message.headerType
        ? {
            type: message.headerType,
            text: message.headerContent || "",
            media_url:
              message.headerType !== "text" ? message.headerContent || "" : "",
          }
        : undefined,
      body: {
        text: message.bodyText,
      },
      footer: message.footerText
        ? {
            text: message.footerText,
          }
        : undefined,
      action: message.actionData,
      // Location fields
      latitude: message.latitude,
      longitude: message.longitude,
      locationName: message.locationName,
      locationAddress: message.locationAddress,
      // Reaction fields
      reactionEmoji: message.reactionEmoji,
      targetMessageId: message.targetMessageId,
      // Sticker fields
      stickerMediaId: message.stickerMediaId,
      stickerUrl: message.stickerUrl,
    },
    createdAt: message.createdAt,
    updatedAt: message.updatedAt,
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
          userId: session.user.id,
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
          userId: session.user.id,
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

    const { caixaId, message, reactions } = validationResult.data;

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
          userId: session.user.id,
          caixaId,
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
    console.log(`[${requestId}] Creating message - User: ${session.user.id}, CaixaId: ${caixaId}`);
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
      caixa = await prisma.caixaEntrada.findFirst({
        where: {
          id: caixaId,
          usuarioChatwit: {
            appUserId: session.user.id,
          },
        },
      });
    } catch (dbError) {
      const error = errorHandler.handleError(
        dbError,
        {
          userId: session.user.id,
          caixaId,
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
      console.warn(`[${requestId}] Caixa not found or access denied - CaixaId: ${caixaId}, UserId: ${session.user.id}`);
      
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
      result = await prisma.$transaction(async (tx) => {
      // Create the interactive message
      const savedMessage = await tx.interactiveMessage.create({
        data: {
          caixaId,
          name: message.name,
          type: message.type,
          bodyText: message.body.text,
          headerType: message.header?.type || null,
          headerContent:
            message.header?.media_url || message.header?.text || null,
          footerText: message.footer?.text || null,
          actionData: message.action || null,
          // Location fields
          latitude: message.latitude || null,
          longitude: message.longitude || null,
          locationName: message.locationName || null,
          locationAddress: message.locationAddress || null,
          // Reaction fields
          reactionEmoji: message.reactionEmoji || null,
          targetMessageId: message.targetMessageId || null,
          // Sticker fields
          stickerMediaId: message.stickerMediaId || null,
          stickerUrl: message.stickerUrl || null,
          createdById: session.user.id,
        },
      });

      // Create button reactions if any
      const savedReactions = [];
      if (reactions.length > 0) {
        for (const reactionData of reactions) {
          if (reactionData.reaction) {
            const savedReaction = await tx.buttonReactionMapping.create({
              data: {
                buttonId: reactionData.buttonId,
                messageId: savedMessage.id,
                emoji: reactionData.reaction.value, // Store both emoji and text in emoji field
                description:
                  reactionData.reaction.type === "text"
                    ? reactionData.reaction.value
                    : null,
                createdBy: session.user.id,
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
          userId: session.user.id,
          caixaId,
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
      messageId: result.message.id,
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
        caixaId: undefined,
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

    const reactionsValidation = z
      .array(ButtonReactionSchema)
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
    const existingMessage = await prisma.interactiveMessage.findFirst({
      where: {
        id: messageId,
        createdById: session.user.id,
      },
    });

    if (!existingMessage) {
      return NextResponse.json(
        { error: "Message not found or access denied" },
        { status: 404 }
      );
    }

    // Execute atomic transaction
    const result = await prisma.$transaction(async (tx) => {
      // Update the interactive message
      const updatedMessage = await tx.interactiveMessage.update({
        where: { id: messageId },
        data: {
          ...(message.name && { name: message.name }),
          ...(message.type && { type: message.type }),
          ...(message.body?.text && { bodyText: message.body.text }),
          ...(message.header && {
            headerType: message.header.type,
            headerContent:
              message.header.media_url || message.header.text || null,
          }),
          ...(message.footer && { footerText: message.footer.text }),
          ...(message.action !== undefined && { actionData: message.action }),
          // Location fields
          ...(message.latitude !== undefined && { latitude: message.latitude }),
          ...(message.longitude !== undefined && {
            longitude: message.longitude,
          }),
          ...(message.locationName !== undefined && {
            locationName: message.locationName,
          }),
          ...(message.locationAddress !== undefined && {
            locationAddress: message.locationAddress,
          }),
          // Reaction fields
          ...(message.reactionEmoji !== undefined && {
            reactionEmoji: message.reactionEmoji,
          }),
          ...(message.targetMessageId !== undefined && {
            targetMessageId: message.targetMessageId,
          }),
          // Sticker fields
          ...(message.stickerMediaId !== undefined && {
            stickerMediaId: message.stickerMediaId,
          }),
          ...(message.stickerUrl !== undefined && {
            stickerUrl: message.stickerUrl,
          }),
        },
      });

      // Update button reactions if provided
      let updatedReactions = [];
      if (reactions && reactions.length >= 0) {
        // Remove existing reactions for this message
        await tx.buttonReactionMapping.deleteMany({
          where: { messageId },
        });

        // Create new reactions
        for (const reactionData of reactions) {
          if (reactionData.reaction) {
            const savedReaction = await tx.buttonReactionMapping.create({
              data: {
                buttonId: reactionData.buttonId,
                messageId: messageId,
                emoji: reactionData.reaction.value, // Store both emoji and text in emoji field
                description:
                  reactionData.reaction.type === "text"
                    ? reactionData.reaction.value
                    : null,
                createdBy: session.user.id,
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

    // Format response
    const formattedMessage = formatMessage(result.message);
    const formattedReactions = result.reactions.map(formatReaction);

    return NextResponse.json({
      success: true,
      messageId: result.message.id,
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
    const caixaId = searchParams.get("caixaId");

    if (!messageId && !caixaId) {
      return NextResponse.json(
        { error: "Either messageId or caixaId is required" },
        { status: 400 }
      );
    }

    if (messageId) {
      // Get specific message with reactions
      const message = await prisma.interactiveMessage.findFirst({
        where: {
          id: messageId,
          caixa: {
            usuarioChatwit: {
              appUserId: session.user.id,
            },
          },
        },
        include: {
          buttonReactions: {
            where: { isActive: true },
            orderBy: { createdAt: "asc" },
          },
        },
      });

      if (!message) {
        return NextResponse.json(
          { error: "Message not found or access denied" },
          { status: 404 }
        );
      }

      const formattedMessage = formatMessage(message);
      const formattedReactions = message.buttonReactions.map(formatReaction);

      return NextResponse.json({
        success: true,
        message: formattedMessage,
        reactions: formattedReactions,
      });
    }

    if (caixaId) {
      // Get all messages for a caixa with their reactions
      const messages = await prisma.interactiveMessage.findMany({
        where: {
          caixaId,
          caixa: {
            usuarioChatwit: {
              appUserId: session.user.id,
            },
          },
        },
        include: {
          buttonReactions: {
            where: { isActive: true },
            orderBy: { createdAt: "asc" },
          },
        },
        orderBy: { createdAt: "desc" },
      });

      const formattedMessages = messages.map((message) => ({
        ...formatMessage(message),
        reactions: message.buttonReactions.map(formatReaction),
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
