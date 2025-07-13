import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const session = await auth();
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Usuário não autenticado" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true }
    });

    if (!user) {
      return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });
    }

    // Buscar o usuário Chatwit
    const usuarioChatwit = await prisma.usuarioChatwit.findUnique({
      where: { appUserId: session.user.id },
      select: { chatwitAccessToken: true }
    });

    return NextResponse.json({ 
      chatwitAccessToken: usuarioChatwit?.chatwitAccessToken,
      role: user.role 
    });
  } catch (error) {
    console.error("Erro ao buscar chatwitAccessToken:", error);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
} 