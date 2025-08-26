import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getPrismaInstance } from "@/lib/connections"
import { invalidateTemplateMappingCache } from "@/lib/cache/instagram-template-cache";

// DELETE - Deletar mensagem interativa
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: "Message ID is required" },
        { status: 400 }
      );
    }

    // Verificar se a mensagem existe
    const existingMessage = await getPrismaInstance().template.findUnique({
      where: {
        id,
        type: "INTERACTIVE_MESSAGE",
      },
      include: {
        interactiveContent: true,
      },
    });

    if (!existingMessage) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }

    // Verificar se a mensagem está sendo usada em mapeamentos
    const mappings = await getPrismaInstance().mapeamentoIntencao.findMany({
      where: { templateId: id },
      select: { intentName: true, inboxId: true },
    });

    // Deletar a mensagem (cascade irá deletar o interactiveContent automaticamente)
    await getPrismaInstance().template.delete({
      where: { id },
    });

    // Invalidate Instagram template cache for all affected mappings
    if (mappings.length > 0) {
      try {
        for (const mapping of mappings) {
          // Find the ChatwitInbox to get the correct inboxId for cache invalidation
          const chatwitInbox = await getPrismaInstance().chatwitInbox.findUnique({
            where: { id: mapping.inboxId },
            select: { inboxId: true, usuarioChatwitId: true },
          });

          if (chatwitInbox) {
            // Use the correct usuarioChatwitId and Chatwit inboxId for cache invalidation
            console.log(`[API Cache Invalidation] [DEBUG] Preparing cache invalidation for template deletion:`, {
              operation: 'DELETE /interactive-messages/[id]',
              userContext: { usuarioChatwitId: chatwitInbox.usuarioChatwitId, inboxId: chatwitInbox.inboxId },
              intentName: mapping.intentName,
              templateId: id,
              internalInboxId: mapping.inboxId,
              externalInboxId: chatwitInbox.inboxId,
              cacheKeyFormat: `${mapping.intentName}:${chatwitInbox.usuarioChatwitId}:${chatwitInbox.inboxId}`
            });
            
            await invalidateTemplateMappingCache(
              mapping.intentName,
              chatwitInbox.usuarioChatwitId,
              chatwitInbox.inboxId
            );
            
            console.log(`[API Cache Invalidation] [SUCCESS] Instagram cache cleared for template deletion:`, {
              operation: 'DELETE /interactive-messages/[id]',
              userContext: { usuarioChatwitId: chatwitInbox.usuarioChatwitId, inboxId: chatwitInbox.inboxId },
              intentName: mapping.intentName,
              templateId: id,
              internalInboxId: mapping.inboxId,
              externalInboxId: chatwitInbox.inboxId,
              reason: 'Template deleted'
            });
          } else {
            console.warn(`[API Cache Invalidation] [ERROR] ChatwitInbox not found for cache invalidation:`, {
              operation: 'DELETE /interactive-messages/[id]',
              intentName: mapping.intentName,
              templateId: id,
              internalInboxId: mapping.inboxId,
              error: 'ChatwitInbox not found',
              impact: 'Cache not invalidated - may serve stale data'
            });
          }
        }
      } catch (cacheError) {
        console.error(
          "[Cache Invalidation] Error clearing Instagram cache:",
          cacheError
        );
        // Don't fail the request if cache invalidation fails
      }
    }

    return NextResponse.json({
      success: true,
      message: "Interactive message deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting interactive message:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// GET - Buscar mensagem interativa específica
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: "Message ID is required" },
        { status: 400 }
      );
    }

    const template = await getPrismaInstance().template.findUnique({
      where: {
        id,
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
            actionLocationRequest: true,
          },
        },
      },
    });

    if (!template || !template.interactiveContent) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }

    const interactive = template.interactiveContent;

    // Determinar o tipo de ação
    let actionType = null;
    let actionData = null;

    if (interactive.actionCtaUrl) {
      actionType = "cta_url";
      actionData = interactive.actionCtaUrl;
    } else if (interactive.actionReplyButton) {
      actionType = "button";
      actionData = interactive.actionReplyButton;
    } else if (interactive.actionList) {
      actionType = "list";
      actionData = interactive.actionList;
    } else if (interactive.actionFlow) {
      actionType = "flow";
      actionData = interactive.actionFlow;
    } else if (interactive.actionLocationRequest) {
      actionType = "location_request";
      actionData = interactive.actionLocationRequest;
    }

    return NextResponse.json({
      success: true,
      message: {
        id: template.id,
        name: template.name,
        type: actionType,
        content: {
          name: template.name,
          type: actionType,
          header: interactive.header
            ? {
                type: interactive.header.type,
                text: interactive.header.content || "",
                media_url:
                  interactive.header.type !== "text"
                    ? interactive.header.content || ""
                    : "",
              }
            : undefined,
          body: {
            text: interactive.body?.text || "",
          },
          footer: interactive.footer
            ? {
                text: interactive.footer.text,
              }
            : undefined,
          action: actionData,
        },
        createdAt: template.createdAt,
        updatedAt: template.updatedAt,
      },
    });
  } catch (error) {
    console.error("Error fetching interactive message:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// PUT - Atualizar mensagem interativa
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const { message } = body;

    // LOG DETALHADO
    console.log("[INTERACTIVE-MESSAGE][PUT] Usuário:", session.user.id);
    console.log("[INTERACTIVE-MESSAGE][PUT] id:", id);
    console.log(
      "[INTERACTIVE-MESSAGE][PUT] message:",
      JSON.stringify(message, null, 2)
    );

    if (!id) {
      return NextResponse.json(
        { error: "Message ID is required" },
        { status: 400 }
      );
    }

    if (!message) {
      return NextResponse.json(
        { error: "Message data is required" },
        { status: 400 }
      );
    }

    // Validar campos obrigatórios
    if (!message.name || !message.body?.text) {
      return NextResponse.json(
        { error: "Message name and body text are required" },
        { status: 400 }
      );
    }

    // Verificar se a mensagem existe
    const existingTemplate = await getPrismaInstance().template.findUnique({
      where: {
        id,
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
            actionLocationRequest: true,
          },
        },
      },
    });

    if (!existingTemplate || !existingTemplate.interactiveContent) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }

    // Atualizar template
    const updatedTemplate = await getPrismaInstance().template.update({
      where: { id },
      data: {
        name: message.name,
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
            actionLocationRequest: true,
          },
        },
      },
    });

    // Atualizar conteúdo interativo
    const interactiveContentId = updatedTemplate.interactiveContent!.id;

    // Update body
    if (message.body?.text) {
      await getPrismaInstance().body.update({
        where: { id: updatedTemplate.interactiveContent!.bodyId },
        data: { text: message.body.text },
      });
    }

    // Update header
    if (message.header) {
      if (updatedTemplate.interactiveContent!.header) {
        await getPrismaInstance().header.update({
          where: { id: updatedTemplate.interactiveContent!.header.id },
          data: {
            type: message.header.type,
            content: message.header.media_url || message.header.text || "",
          },
        });
      } else {
        await getPrismaInstance().header.create({
          data: {
            type: message.header.type,
            content: message.header.media_url || message.header.text || "",
            interactiveContentId,
          },
        });
      }
    }

    // Update footer
    if (message.footer) {
      if (updatedTemplate.interactiveContent!.footer) {
        await getPrismaInstance().footer.update({
          where: { id: updatedTemplate.interactiveContent!.footer.id },
          data: { text: message.footer.text },
        });
      } else {
        await getPrismaInstance().footer.create({
          data: {
            text: message.footer.text,
            interactiveContentId,
          },
        });
      }
    }

    // Update actions based on type
    if (message.action && message.type) {
      // Delete existing actions
      if (updatedTemplate.interactiveContent!.actionCtaUrl) {
        await getPrismaInstance().actionCtaUrl.delete({
          where: { id: updatedTemplate.interactiveContent!.actionCtaUrl.id },
        });
      }
      if (updatedTemplate.interactiveContent!.actionReplyButton) {
        await getPrismaInstance().actionReplyButton.delete({
          where: {
            id: updatedTemplate.interactiveContent!.actionReplyButton.id,
          },
        });
      }
      if (updatedTemplate.interactiveContent!.actionList) {
        await getPrismaInstance().actionList.delete({
          where: { id: updatedTemplate.interactiveContent!.actionList.id },
        });
      }
      if (updatedTemplate.interactiveContent!.actionFlow) {
        await getPrismaInstance().actionFlow.delete({
          where: { id: updatedTemplate.interactiveContent!.actionFlow.id },
        });
      }
      if (updatedTemplate.interactiveContent!.actionLocationRequest) {
        await getPrismaInstance().actionLocationRequest.delete({
          where: {
            id: updatedTemplate.interactiveContent!.actionLocationRequest.id,
          },
        });
      }

      // Create new action based on type
      if (message.type === "cta_url") {
        await getPrismaInstance().actionCtaUrl.create({
          data: {
            displayText: message.action.displayText || "Clique aqui",
            url: message.action.url || "",
            interactiveContentId,
          },
        });
      } else if (message.type === "button" || message.type === "generic" || message.type === "button_template" || message.type === "quick_replies") {
        await getPrismaInstance().actionReplyButton.create({
          data: {
            buttons: message.action.buttons || [],
            interactiveContentId,
          },
        });
      } else if (message.type === "list") {
        await getPrismaInstance().actionList.create({
          data: {
            buttonText: message.action.buttonText || "Ver opções",
            sections: message.action.sections || [],
            interactiveContentId,
          },
        });
      } else if (message.type === "flow") {
        await getPrismaInstance().actionFlow.create({
          data: {
            flowId: message.action.flowId || "",
            flowCta: message.action.flowCta || "Iniciar",
            flowMode: message.action.flowMode || "published",
            flowData: message.action.flowData || null,
            interactiveContentId,
          },
        });
      } else if (message.type === "location_request") {
        await getPrismaInstance().actionLocationRequest.create({
          data: {
            requestText:
              message.action.requestText || "Compartilhar localização",
            interactiveContentId,
          },
        });
      }
    }

    // Fetch updated template with all relations
    const updatedMessage = await getPrismaInstance().template.findUnique({
      where: { id },
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
            actionLocationRequest: true,
          },
        },
      },
    });

    if (!updatedMessage || !updatedMessage.interactiveContent) {
      return NextResponse.json(
        { error: "Failed to update message" },
        { status: 500 }
      );
    }

    const interactive = updatedMessage.interactiveContent;

    // Determinar o tipo de ação
    let actionType = null;
    let actionData = null;

    if (interactive.actionCtaUrl) {
      actionType = "cta_url";
      actionData = interactive.actionCtaUrl;
    } else if (interactive.actionReplyButton) {
      actionType = "button";
      actionData = interactive.actionReplyButton;
    } else if (interactive.actionList) {
      actionType = "list";
      actionData = interactive.actionList;
    } else if (interactive.actionFlow) {
      actionType = "flow";
      actionData = interactive.actionFlow;
    } else if (interactive.actionLocationRequest) {
      actionType = "location_request";
      actionData = interactive.actionLocationRequest;
    }

    // Invalidate Instagram template cache for all mappings using this template
    try {
      const mappings = await getPrismaInstance().mapeamentoIntencao.findMany({
        where: { templateId: id },
        select: { intentName: true, inboxId: true },
      });

      for (const mapping of mappings) {
        // Find the ChatwitInbox to get the correct inboxId for cache invalidation
        const chatwitInbox = await getPrismaInstance().chatwitInbox.findUnique({
          where: { id: mapping.inboxId },
          select: { inboxId: true, usuarioChatwitId: true },
        });

        if (chatwitInbox) {
          // Use the correct usuarioChatwitId and Chatwit inboxId for cache invalidation
          console.log(`[API Cache Invalidation] [DEBUG] Preparing cache invalidation for template update:`, {
            operation: 'PUT /interactive-messages/[id]',
            userContext: { usuarioChatwitId: chatwitInbox.usuarioChatwitId, inboxId: chatwitInbox.inboxId },
            intentName: mapping.intentName,
            templateId: id,
            internalInboxId: mapping.inboxId,
            externalInboxId: chatwitInbox.inboxId,
            cacheKeyFormat: `${mapping.intentName}:${chatwitInbox.usuarioChatwitId}:${chatwitInbox.inboxId}`
          });
          
          await invalidateTemplateMappingCache(
            mapping.intentName,
            chatwitInbox.usuarioChatwitId,
            chatwitInbox.inboxId
          );
          
          console.log(`[API Cache Invalidation] [SUCCESS] Instagram cache cleared for template update:`, {
            operation: 'PUT /interactive-messages/[id]',
            userContext: { usuarioChatwitId: chatwitInbox.usuarioChatwitId, inboxId: chatwitInbox.inboxId },
            intentName: mapping.intentName,
            templateId: id,
            internalInboxId: mapping.inboxId,
            externalInboxId: chatwitInbox.inboxId,
            reason: 'Template updated'
          });
        } else {
          console.warn(`[API Cache Invalidation] [ERROR] ChatwitInbox not found for cache invalidation:`, {
            operation: 'PUT /interactive-messages/[id]',
            intentName: mapping.intentName,
            templateId: id,
            internalInboxId: mapping.inboxId,
            error: 'ChatwitInbox not found',
            impact: 'Cache not invalidated - may serve stale data'
          });
        }
      }
    } catch (cacheError) {
      console.error(
        "[Cache Invalidation] Error clearing Instagram cache:",
        cacheError
      );
      // Don't fail the request if cache invalidation fails
    }

    return NextResponse.json({
      success: true,
      message: {
        id: updatedMessage.id,
        name: updatedMessage.name,
        type: actionType,
        content: {
          name: updatedMessage.name,
          type: actionType,
          header: interactive.header
            ? {
                type: interactive.header.type,
                text: interactive.header.content || "",
                media_url:
                  interactive.header.type !== "text"
                    ? interactive.header.content || ""
                    : "",
              }
            : undefined,
          body: {
            text: interactive.body?.text || "",
          },
          footer: interactive.footer
            ? {
                text: interactive.footer.text,
              }
            : undefined,
          action: actionData,
        },
        createdAt: updatedMessage.createdAt,
        updatedAt: updatedMessage.updatedAt,
      },
    });
  } catch (error) {
    console.error("Error updating interactive message:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
