import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getPrismaInstance } from "@/lib/connections";
const prisma = getPrismaInstance();

// GET: Verificar se o usuário atual é administrador
export async function GET() {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({
        isAdmin: false,
        message: "Não autenticado"
      }, { status: 401 });
    }

    // Verificar se o usuário é administrador
    const user = await prisma.user.findUnique({
      where: {
        id: session.user.id
      },
      select: {
        role: true
      }
    });

    const isAdmin = user?.role === "ADMIN" || user?.role === "SUPERADMIN";

    return NextResponse.json({
      isAdmin,
      message: isAdmin ? "Usuário é administrador" : "Usuário não é administrador"
    }, { status: isAdmin ? 200 : 403 });
  } catch (error) {
    console.error("[ADMIN_CHECK]", error);
    return NextResponse.json({
      isAdmin: false,
      message: "Erro ao verificar permissões"
    }, { status: 500 });
  }
}