import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

// DELETE - Deletar mensagem interativa
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = params;

    if (!id) {
      return NextResponse.json(
        { error: "Message ID is required" },
        { status: 400 }
      );
    }

    // Verificar se a mensagem existe
    const existingMessage = await prisma.interactiveMessage.findUnique({
      where: { id },
    });

    if (!existingMessage) {
      return NextResponse.json(
        { error: "Message not found" },
        { status: 404 }
      );
    }

    // Deletar a mensagem
    await prisma.interactiveMessage.delete({
      where: { id },
    });

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
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = params;

    if (!id) {
      return NextResponse.json(
        { error: "Message ID is required" },
        { status: 400 }
      );
    }

    const message = await prisma.interactiveMessage.findUnique({
      where: { id },
    });

    if (!message) {
      return NextResponse.json(
        { error: "Message not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: {
        id: message.id,
        name: message.name,
        type: message.type,
        content: {
          name: message.name,
          type: message.type,
          header: message.headerType ? {
            type: message.headerType,
            text: message.headerContent || "",
            media_url: message.headerType !== 'text' ? message.headerContent || "" : ""
          } : undefined,
          body: {
            text: message.bodyText
          },
          footer: message.footerText ? {
            text: message.footerText
          } : undefined,
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
          stickerUrl: message.stickerUrl
        },
        createdAt: message.createdAt,
        updatedAt: message.updatedAt,
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
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = params;
    const body = await request.json();
    const { message } = body;

    // LOG DETALHADO
    console.log("[INTERACTIVE-MESSAGE][PUT] Usuário:", session.user.id);
    console.log("[INTERACTIVE-MESSAGE][PUT] id:", id);
    console.log("[INTERACTIVE-MESSAGE][PUT] message:", JSON.stringify(message, null, 2));

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
    const existingMessage = await prisma.interactiveMessage.findUnique({
      where: { id },
    });

    if (!existingMessage) {
      return NextResponse.json(
        { error: "Message not found" },
        { status: 404 }
      );
    }

    // Atualizar mensagem interativa
    const updatedMessage = await prisma.interactiveMessage.update({
      where: { id },
      data: {
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
      },
    });

    return NextResponse.json({
      success: true,
      message: {
        id: updatedMessage.id,
        name: updatedMessage.name,
        type: updatedMessage.type,
        content: {
          name: updatedMessage.name,
          type: updatedMessage.type,
          header: updatedMessage.headerType ? {
            type: updatedMessage.headerType,
            text: updatedMessage.headerContent || "",
            media_url: updatedMessage.headerType !== 'text' ? updatedMessage.headerContent || "" : ""
          } : undefined,
          body: {
            text: updatedMessage.bodyText
          },
          footer: updatedMessage.footerText ? {
            text: updatedMessage.footerText
          } : undefined,
          action: updatedMessage.actionData,
          // Location fields
          latitude: updatedMessage.latitude,
          longitude: updatedMessage.longitude,
          locationName: updatedMessage.locationName,
          locationAddress: updatedMessage.locationAddress,
          // Reaction fields
          reactionEmoji: updatedMessage.reactionEmoji,
          targetMessageId: updatedMessage.targetMessageId,
          // Sticker fields
          stickerMediaId: updatedMessage.stickerMediaId,
          stickerUrl: updatedMessage.stickerUrl
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