import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getPrismaInstance } from "@/lib/connections"
import bcryptjs from "bcryptjs";

// POST: Definir uma nova senha para um usuário (apenas para administradores)
export async function POST(req: Request) {
  try {
    const session = await auth();

    // Verificar se o usuário está autenticado e é administrador
    if (!session?.user?.id) {
      return new NextResponse("Não autorizado", { status: 401 });
    }

    // Verificar se o usuário é SUPERADMIN
    const adminUser = await getPrismaInstance().user.findUnique({
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
    const { userId, password } = body;

    if (!userId || !password) {
      return new NextResponse("ID do usuário e senha são obrigatórios", { status: 400 });
    }

    // Verificar se o usuário existe
    const userExists = await getPrismaInstance().user.findUnique({
      where: {
        id: userId
      }
    });

    if (!userExists) {
      return new NextResponse("Usuário não encontrado", { status: 404 });
    }

    // Gerar hash da senha
    const hashedPassword = await bcryptjs.hash(password, 10);

    // Atualizar a senha do usuário
    const updatedUser = await getPrismaInstance().user.update({
      where: {
        id: userId
      },
      data: {
        password: hashedPassword
      }
    });

    return NextResponse.json({
      success: true,
      message: "Senha definida com sucesso",
      user: {
        id: updatedUser.id,
        email: updatedUser.email
      }
    });
  } catch (error) {
    console.error("[SET_PASSWORD]", error);
    return new NextResponse("Erro interno", { status: 500 });
  }
}