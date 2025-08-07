import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getPrismaInstance } from "@/lib/connections";
import { FlashIntentChecker } from "@/lib/resposta-rapida/flash-intent-checker";

export async function GET() {
  try {
    const session = await auth();
    
    if (!session?.user || (session.user.role !== "ADMIN" && session.user.role !== "SUPERADMIN")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const prisma = getPrismaInstance();

    // Buscar todos os usuários com informações sobre Flash Intent
    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    // Para cada usuário, verificar se tem Flash Intent ativa
    const flashIntentChecker = FlashIntentChecker.getInstance();
    
    const usersWithFlashIntent = await Promise.all(
      users.map(async (user) => {
        // Verificar se o usuário tem Flash Intent ativa através do sistema de feature flags
        const flashIntentEnabled = await flashIntentChecker.isFlashIntentEnabledForUser(user.id);
        
        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          flashIntentEnabled,
        };
      })
    );

    return NextResponse.json({
      users: usersWithFlashIntent,
      total: users.length,
    });

  } catch (error) {
    console.error("Erro ao buscar usuários:", error);
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500 }
    );
  }
}