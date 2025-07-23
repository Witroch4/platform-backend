import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

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
      caixaId: caixaId,
    };

    if (type) {
      whereClause.type = type;
    }

    const messages = await prisma.interactiveMessage.findMany({
      where: whereClause,
      orderBy: {
        createdAt: "desc",
      },
    });

    return NextResponse.json(
      messages.map((msg) => ({
        id: msg.id,
        nome: msg.name,
        texto: msg.bodyText,
        headerTipo: msg.headerType,
        headerConteudo: msg.headerContent,
        rodape: msg.footerText,
        botoes: (msg.actionData as any)?.buttons || [],
        // Campos adicionais para compatibilidade
        name: msg.name,
        type: msg.type,
        content: {
          name: msg.name,
          type: msg.type,
          header: msg.headerType ? {
            type: msg.headerType,
            text: msg.headerContent || "",
            media_url: msg.headerType !== 'text' ? msg.headerContent || "" : ""
          } : undefined,
          body: {
            text: msg.bodyText
          },
          footer: msg.footerText ? {
            text: msg.footerText
          } : undefined,
          action: msg.actionData,
          // Location fields
          latitude: msg.latitude,
          longitude: msg.longitude,
          locationName: msg.locationName,
          locationAddress: msg.locationAddress,
          // Reaction fields
          reactionEmoji: msg.reactionEmoji,
          targetMessageId: msg.targetMessageId,
          // Sticker fields
          stickerMediaId: msg.stickerMediaId,
          stickerUrl: msg.stickerUrl
        },
        createdAt: msg.createdAt,
        updatedAt: msg.updatedAt,
      }))
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

    // Criar mensagem interativa
    const interactiveMessage = await prisma.interactiveMessage.create({
      data: {
        caixaId,
        name: message.name,
        type: message.type,
        bodyText: message.body.text,
        headerType: message.header?.type || null,
        headerContent: message.header?.media_url || message.header?.text || null,
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

    return NextResponse.json({
      success: true,
      message: {
        id: interactiveMessage.id,
        name: interactiveMessage.name,
        type: interactiveMessage.type,
        content: {
          name: interactiveMessage.name,
          type: interactiveMessage.type,
          header: interactiveMessage.headerType ? {
            type: interactiveMessage.headerType,
            text: interactiveMessage.headerContent || "",
            media_url: interactiveMessage.headerType !== 'text' ? interactiveMessage.headerContent || "" : ""
          } : undefined,
          body: {
            text: interactiveMessage.bodyText
          },
          footer: interactiveMessage.footerText ? {
            text: interactiveMessage.footerText
          } : undefined,
          action: interactiveMessage.actionData,
          // Location fields
          latitude: interactiveMessage.latitude,
          longitude: interactiveMessage.longitude,
          locationName: interactiveMessage.locationName,
          locationAddress: interactiveMessage.locationAddress,
          // Reaction fields
          reactionEmoji: interactiveMessage.reactionEmoji,
          targetMessageId: interactiveMessage.targetMessageId,
          // Sticker fields
          stickerMediaId: interactiveMessage.stickerMediaId,
          stickerUrl: interactiveMessage.stickerUrl
        },
        createdAt: interactiveMessage.createdAt,
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
