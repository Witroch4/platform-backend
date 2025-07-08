import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

// PATCH: Atualizar um usuário específico (apenas para SUPERADMIN)
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    const resolvedParams = await params;

    if (!session?.user?.id) {
      return new NextResponse("Não autorizado", { status: 401 });
    }

    // Verificar se o usuário é SUPERADMIN
    const adminUser = await prisma.user.findUnique({
      where: {
        id: session.user.id
      },
      select: {
        role: true
      }
    });

    if (adminUser?.role !== "SUPERADMIN") {
      return new NextResponse("Acesso negado. Apenas SUPERADMIN pode acessar.", { status: 403 });
    }

    const userId = resolvedParams.id;

    if (!userId) {
      return new NextResponse("ID do usuário não fornecido", { status: 400 });
    }

    // Verificar se o usuário existe
    const userExists = await prisma.user.findUnique({
      where: {
        id: userId
      }
    });

    if (!userExists) {
      return new NextResponse("Usuário não encontrado", { status: 404 });
    }

    // Obter dados do corpo da requisição
    const body = await req.json();
    const { name, email, role } = body;

    // Validar dados
    if (email && !email.includes('@')) {
      return new NextResponse("Email inválido", { status: 400 });
    }

    if (role && !['DEFAULT', 'ADMIN'].includes(role)) {
      return new NextResponse("Função inválida", { status: 400 });
    }

    // Atualizar o usuário
    const updatedUser = await prisma.user.update({
      where: {
        id: userId
      },
      data: {
        ...(name !== undefined && { name }),
        ...(email !== undefined && { email }),
        ...(role !== undefined && { role })
      }
    });

    return NextResponse.json({
      success: true,
      message: "Usuário atualizado com sucesso",
      user: {
        id: updatedUser.id,
        name: updatedUser.name,
        email: updatedUser.email,
        role: updatedUser.role
      }
    });
  } catch (error) {
    console.error("[ADMIN_USER_UPDATE]", error);
    return new NextResponse("Erro interno", { status: 500 });
  }
}

// GET: Obter detalhes de um usuário específico (apenas para SUPERADMIN)
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    const resolvedParams = await params;

    if (!session?.user?.id) {
      return new NextResponse("Não autorizado", { status: 401 });
    }

    // Verificar se o usuário é SUPERADMIN
    const adminUser = await prisma.user.findUnique({
      where: {
        id: session.user.id
      },
      select: {
        role: true
      }
    });

    if (adminUser?.role !== "SUPERADMIN") {
      return new NextResponse("Acesso negado. Apenas SUPERADMIN pode acessar.", { status: 403 });
    }

    const userId = resolvedParams.id;

    // Verificar se deve incluir as contas
    const url = new URL(req.url);
    const includeAccounts = url.searchParams.get('includeAccounts') !== 'false';

    // Buscar o usuário
    const user = await prisma.user.findUnique({
      where: {
        id: userId
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isTwoFactorAuthEnabled: true,
        createdAt: true,
        emailVerified: true,
        image: true,
        accounts: includeAccounts ? {
          select: {
            id: true,
            provider: true,
            providerAccountId: true,
            type: true,
            access_token: true,
            refresh_token: true,
            expires_at: true,
            token_type: true,
            scope: true,
            id_token: true,
            session_state: true,
            igUserId: true,
            igUsername: true,
            isMain: true,
            createdAt: true,
            updatedAt: true
          }
        } : false
      }
    });

    if (!user) {
      return new NextResponse("Usuário não encontrado", { status: 404 });
    }

    return NextResponse.json({
      success: true,
      user
    });
  } catch (error) {
    console.error("[ADMIN_GET_USER]", error);
    return new NextResponse("Erro interno", { status: 500 });
  }
}