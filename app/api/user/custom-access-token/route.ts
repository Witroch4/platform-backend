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
      select: { customAccessToken: true, role: true }
    });

    if (!user) {
      return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });
    }

    return NextResponse.json({ 
      customAccessToken: user.customAccessToken,
      role: user.role 
    });
  } catch (error) {
    console.error("Erro ao buscar customAccessToken:", error);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
} 