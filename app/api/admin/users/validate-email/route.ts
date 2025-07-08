import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

// POST: Validar o email de um usuário (apenas para administradores)
export async function POST(req: Request) {
  try {
    const session = await auth();

    // Verificar se o usuário está autenticado e é administrador
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

    // Obter dados do corpo da requisição
    const body = await req.json();
    const { userId, email } = body;

    if (!userId || !email) {
      return new NextResponse("ID do usuário e email são obrigatórios", { status: 400 });
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

    // Verificar se o email corresponde ao usuário
    if (userExists.email !== email) {
      return new NextResponse("O email fornecido não corresponde ao usuário", { status: 400 });
    }

    // Atualizar o campo emailVerified para a data atual
    const updatedUser = await prisma.user.update({
      where: {
        id: userId
      },
      data: {
        emailVerified: new Date()
      }
    });

    return NextResponse.json({
      success: true,
      message: "Email validado com sucesso",
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        emailVerified: updatedUser.emailVerified
      }
    });
  } catch (error) {
    console.error("[VALIDATE_EMAIL]", error);
    return new NextResponse("Erro interno", { status: 500 });
  }
}