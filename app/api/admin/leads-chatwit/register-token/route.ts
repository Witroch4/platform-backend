import { type NextRequest, NextResponse } from "next/server";
import { getPrismaInstance } from "@/lib/connections"
import { auth } from "@/auth";

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    
    if (!session || !session.user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const { chatwitAccessToken, chatwitAccountId } = await request.json();

    if (!chatwitAccessToken || typeof chatwitAccessToken !== 'string') {
      return NextResponse.json(
        { error: "Token de acesso é obrigatório" },
        { status: 400 }
      );
    }

    if (!chatwitAccountId || typeof chatwitAccountId !== 'string') {
      return NextResponse.json(
        { error: "ID da conta Chatwit é obrigatório" },
        { status: 400 }
      );
    }

    // Garantir que o usuário base exista (após reset pode não existir)
    const prisma = getPrismaInstance();
    let dbUser = await prisma.user.findUnique({ where: { id: session.user.id } });
    if (!dbUser) {
      const email = (session.user as any)?.email as string | undefined;
      const name = session.user.name || undefined;
      const syntheticEmail = `${session.user.id}@local.invalid`;
      dbUser = await prisma.user.create({
        data: { id: session.user.id, email: email || syntheticEmail, name },
      });
    }

    // Verificar se o token já está sendo usado por outro usuário
    const existingUsuario = await prisma.usuarioChatwit.findFirst({
      where: {
        chatwitAccessToken,
        appUserId: {
          not: session.user.id
        }
      }
    });

    if (existingUsuario) {
      return NextResponse.json(
        { error: "Este token já está sendo usado por outro usuário" },
        { status: 400 }
      );
    }

    // Buscar ou criar o usuário Chatwit
    let usuarioChatwit = await prisma.usuarioChatwit.findUnique({
      where: { appUserId: session.user.id }
    });

    if (!usuarioChatwit) {
      // Criar novo usuário Chatwit se não existir
      usuarioChatwit = await prisma.usuarioChatwit.create({
        data: {
          appUserId: session.user.id,
          name: session.user.name || 'Usuário',
          accountName: 'Conta Padrão',
          channel: 'WhatsApp',
          chatwitAccountId: chatwitAccountId.trim(),
          chatwitAccessToken: chatwitAccessToken.trim()
        }
      });
    } else {
      // Atualizar o usuário Chatwit existente
      usuarioChatwit = await prisma.usuarioChatwit.update({
        where: {
          id: usuarioChatwit.id
        },
        data: {
          chatwitAccountId: chatwitAccountId.trim(),
          chatwitAccessToken: chatwitAccessToken.trim()
        }
      });
    }

    console.log(`[API] Token atualizado para usuário ${session.user.id}: ${chatwitAccessToken}`);

    return NextResponse.json({
      success: true,
      message: "Token de acesso registrado com sucesso!"
    });

  } catch (error: any) {
    console.error("[API] Erro ao registrar token:", error);
    
    // Tratamento específico para violação de unique constraint
    if (error.code === 'P2002') {
      return NextResponse.json(
        { error: "Este token já está sendo usado por outro usuário" },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    
    if (!session || !session.user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    // Buscar o usuário atual
    const prisma = getPrismaInstance();
    let user = await prisma.user.findUnique({
      where: {
        id: session.user.id
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true
      }
    });

    if (!user) {
      // Criar usuário automaticamente se não existir (após reset)
      const email = (session.user as any)?.email as string | undefined;
      const name = session.user.name || undefined;
      const syntheticEmail = `${session.user.id}@local.invalid`;
      await prisma.user.create({
        data: { id: session.user.id, email: email || syntheticEmail, name },
      });
      user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { id: true, name: true, email: true, role: true },
      });
    }

    // Buscar o usuário Chatwit
    const usuarioChatwit = await prisma.usuarioChatwit.findUnique({
      where: { appUserId: session.user.id },
      select: {
        chatwitAccessToken: true,
        chatwitAccountId: true
      }
    });

    return NextResponse.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        hasToken: !!usuarioChatwit?.chatwitAccessToken,
        role: user.role,
        chatwitAccessToken: usuarioChatwit?.chatwitAccessToken || "",
        chatwitAccountId: usuarioChatwit?.chatwitAccountId || ""
      }
    });

  } catch (error) {
    console.error("[API] Erro ao buscar informações do usuário:", error);
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500 }
    );
  }
} 