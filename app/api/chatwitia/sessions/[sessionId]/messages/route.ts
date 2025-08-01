import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";

// Use Node.js runtime instead of Edge to enable Prisma
export const runtime = 'nodejs';

// GET - Listar mensagens de uma sessão de chat
export async function GET(
  req: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params;
    
    const session = await auth();
    
    if (!session?.user?.id) {
      return new NextResponse("Não autorizado", { status: 401 });
    }
    
    // Verificar se a sessão pertence ao usuário
    const chatSession = await db.chatSession.findUnique({
      where: {
        id: sessionId,
        userId: session.user.id
      }
    });
    
    if (!chatSession) {
      return new NextResponse("Sessão não encontrada", { status: 404 });
    }
    
    const messages = await db.chatMessage.findMany({
      where: {
        sessionId
      },
      orderBy: {
        createdAt: "asc"
      }
    });
    
    return NextResponse.json(messages);
  } catch (error) {
    console.error("[CHAT_MESSAGES_GET]", error);
    return new NextResponse("Erro interno do servidor", { status: 500 });
  }
}

// POST - Adicionar mensagem a uma sessão de chat
export async function POST(
  req: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params;
    
    // Primeiro processar a autenticação
    const session = await auth();
    
    if (!session?.user?.id) {
      return new NextResponse("Não autorizado", { status: 401 });
    }
    
    // Extrair dados do corpo da requisição
    const body = await req.json();
    const { role, content, contentType = "text", audioData, imageUrl } = body;
    
    // Verificar se a sessão pertence ao usuário
    const chatSession = await db.chatSession.findUnique({
      where: {
        id: sessionId,
        userId: session.user.id
      }
    });
    
    if (!chatSession) {
      return new NextResponse("Sessão não encontrada", { status: 404 });
    }
    
    const message = await db.chatMessage.create({
      data: {
        sessionId,
        role,
        content,
        contentType,
        audioData,
        imageUrl
      }
    });
    
    // Atualizar o timestamp da sessão
    await db.chatSession.update({
      where: {
        id: sessionId
      },
      data: {
        updatedAt: new Date()
      }
    });
    
    return NextResponse.json(message);
  } catch (error) {
    console.error("[CHAT_MESSAGES_POST]", error);
    return new NextResponse("Erro interno do servidor", { status: 500 });
  }
} 