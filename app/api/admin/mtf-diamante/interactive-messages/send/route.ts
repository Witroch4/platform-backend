import { NextResponse } from "next/server";
import { getPrismaInstance } from "@/lib/connections"
import { auth } from "@/auth";
import axios from "axios";
import {
  convertInteractiveMessageToWhatsApp,
  validateInteractiveMessage,
  type InteractiveMessage,
} from "@/app/lib/interactive-message-utils";
import type { MtfDiamanteVariavel } from "@/app/lib/variable-utils";

// Função para obter configuração do WhatsApp atual
async function getCurrentWhatsAppConfig() {
  const config = await getPrismaInstance().whatsAppGlobalConfig.findFirst({
    orderBy: { updatedAt: "desc" },
  });

  if (!config) {
    return {
      token: process.env.WHATSAPP_TOKEN || "",
      businessId: process.env.WHATSAPP_BUSINESS_ID || "",
      apiBase: "https://graph.facebook.com/v22.0",
    };
  }

  return {
    token: config.whatsappApiKey,
    businessId: config.whatsappBusinessAccountId,
    apiBase: "https://graph.facebook.com/v22.0",
  };
}

// Função para obter variáveis do MTF Diamante
async function getMtfDiamanteVariables(
  userId: string
): Promise<MtfDiamanteVariavel[]> {
  const config = await getPrismaInstance().mtfDiamanteConfig.findFirst({
    where: { userId: userId },
  });

  if (!config) {
    return [];
  }

  const variables = await getPrismaInstance().mtfDiamanteVariavel.findMany({
    where: { configId: config.id },
    orderBy: { chave: "asc" },
  });

  return variables.map((v) => ({
    id: v.id,
    chave: v.chave,
    valor: String(v.valor || ''),
  }));
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { messageId, recipientPhone, caixaId } = body;

    console.log("[INTERACTIVE-MESSAGE][SEND] Usuário:", session.user.id);
    console.log("[INTERACTIVE-MESSAGE][SEND] messageId:", messageId);
    console.log("[INTERACTIVE-MESSAGE][SEND] recipientPhone:", recipientPhone);
    console.log("[INTERACTIVE-MESSAGE][SEND] caixaId:", caixaId);

    // Validar dados obrigatórios
    if (!messageId || !recipientPhone) {
      return NextResponse.json(
        { error: "messageId and recipientPhone are required" },
        { status: 400 }
      );
    }

    // Buscar a mensagem interativa
    const template = await getPrismaInstance().template.findFirst({
      where: {
        id: messageId,
        createdById: session.user.id,
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
      }
    });

    if (!template || !template.interactiveContent) {
      return NextResponse.json(
        { error: "Interactive message not found" },
        { status: 404 }
      );
    }

    const interactive = template.interactiveContent;

    // Buscar variáveis do usuário
    const variables = await getMtfDiamanteVariables(session.user.id);

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

    // Converter dados da mensagem
    const messageData: InteractiveMessage = {
      id: template.id,
      name: template.name,
      type: actionType as any,
      header: interactive.header ? {
        type: interactive.header.type as any,
        text: interactive.header.content || undefined,
        media_url: interactive.header.content || undefined,
        filename: interactive.header.content ? `file.${interactive.header.type}` : undefined, // Placeholder filename
      } : undefined,
      body: { text: interactive.body?.text || '' },
      footer: interactive.footer ? { text: interactive.footer.text } : undefined,
      action: actionData || undefined,
    };

    // Validar mensagem
    const validation = validateInteractiveMessage(messageData);
    if (!validation.isValid) {
      return NextResponse.json(
        { error: "Invalid message", details: validation.errors },
        { status: 400 }
      );
    }

    // Converter para formato do WhatsApp
    const whatsappMessage = convertInteractiveMessageToWhatsApp(
      messageData,
      recipientPhone,
      variables
    );

    console.log(
      "[INTERACTIVE-MESSAGE][SEND] WhatsApp message:",
      JSON.stringify(whatsappMessage, null, 2)
    );

    // Obter configuração do WhatsApp
    const whatsappConfig = await getCurrentWhatsAppConfig();

    // Enviar mensagem para o WhatsApp
    const whatsappUrl = `${whatsappConfig.apiBase}/${whatsappConfig.businessId}/messages`;
    const whatsappHeaders = {
      Authorization: `Bearer ${whatsappConfig.token}`,
      "Content-Type": "application/json",
    };

    const response = await axios.post(whatsappUrl, whatsappMessage, {
      headers: whatsappHeaders,
    });

    console.log(
      "[INTERACTIVE-MESSAGE][SEND] WhatsApp response:",
      response.data
    );

    // Registrar o envio no banco de dados
    await getPrismaInstance().disparoMtfDiamante.create({
      data: {
        userId: session.user.id,
        templateName: template.name,
        leadId: recipientPhone,
        status: "SENT",
        sentAt: new Date(),
        parameters: JSON.parse(JSON.stringify({
          messageId: messageId,
          messageName: template.name,
          messageType: actionType,
          whatsappMessageId: response.data.messages?.[0]?.id,
          processedMessage: whatsappMessage,
        })),
      },
    });

    return NextResponse.json({
      success: true,
      whatsappMessageId: response.data.messages?.[0]?.id,
      message: "Interactive message sent successfully",
    });
  } catch (error: any) {
    console.error("[INTERACTIVE-MESSAGE][SEND] Error:", error);

    // Registrar erro no banco se possível
    try {
      const session = await auth();
      if (session?.user?.id) {
        await getPrismaInstance().disparoMtfDiamante.create({
          data: {
            userId: session.user.id,
            templateName: "interactive_message_error",
            leadId: "unknown",
            status: "FAILED",
            errorMessage: error.message,
            parameters: JSON.parse(JSON.stringify({
              error: error.message,
              stack: error.stack,
            })),
          },
        });
      }
    } catch (dbError) {
      console.error(
        "[INTERACTIVE-MESSAGE][SEND] Error logging to database:",
        dbError
      );
    }

    return NextResponse.json(
      {
        error: "Failed to send interactive message",
        details: error.response?.data || error.message,
      },
      { status: 500 }
    );
  }
}
