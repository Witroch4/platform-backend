import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getPrismaInstance } from "@/lib/connections"

// GET - Listar mensagens interativas
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const caixaId = searchParams.get("caixaId");
    const type = searchParams.get("type");

    if (!caixaId) {
      return NextResponse.json(
        { error: "caixaId is required" },
        { status: 400 }
      );
    }

    const whereClause: any = {
      inboxId: caixaId,
    };

    if (type) {
      whereClause.type = type;
    }

    const messages = await getPrismaInstance().template.findMany({
      where: {
        ...whereClause,
        type: "INTERACTIVE_MESSAGE",
        interactiveContent: {
          isNot: null
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
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return NextResponse.json(
      messages.map((template) => {
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
          nome: template.name,
          texto: interactive.body?.text || '',
          headerTipo: interactive.header?.type || null,
          headerConteudo: interactive.header?.content || null,
          rodape: interactive.footer?.text || null,
          botoes: actionType === 'button' && actionData && 'buttons' in actionData ? (actionData.buttons as any) || [] : [],
          // Campos adicionais para compatibilidade
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
      }).filter(Boolean)
    );
  } catch (error) {
    console.error("Error fetching interactive messages:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// POST - Criar nova mensagem interativa
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { caixaId, message } = body;

    // LOG DETALHADO
    console.log("[INTERACTIVE-MESSAGE][POST] Usuário:", session.user.id);
    console.log("[INTERACTIVE-MESSAGE][POST] caixaId:", caixaId);
    console.log("[INTERACTIVE-MESSAGE][POST] message:", JSON.stringify(message, null, 2));

    if (!caixaId || !message) {
      return NextResponse.json(
        { error: "caixaId and message are required" },
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

    // Validar tipo de mensagem
    const validTypes = [
      "cta_url",
      "flow",
      "list",
      "button",
      "location",
      "location_request",
      "reaction",
      "sticker",
    ];

    if (!validTypes.includes(message.type)) {
      return NextResponse.json(
        { error: "Invalid message type" },
        { status: 400 }
      );
    }

    // Criar template e conteúdo interativo
    const template = await getPrismaInstance().template.create({
      data: {
        name: message.name,
        type: "INTERACTIVE_MESSAGE",
        description: `Mensagem interativa: ${message.name}`,
        scope: "PRIVATE",
        status: "APPROVED",
        language: "pt_BR",
        tags: [],
        isActive: true,
        createdById: session.user.id,
        inboxId: caixaId,
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
                  content: message.header.media_url || message.header.text || ""
                }
              }
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

    const interactive = template.interactiveContent;
    if (!interactive) {
      return NextResponse.json(
        { error: "Failed to create interactive content" },
        { status: 500 }
      );
    }

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

    return NextResponse.json({
      success: true,
      message: {
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
      },
    });
  } catch (error) {
    console.error("Error creating interactive message:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
