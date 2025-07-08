import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { auth } from "@/auth";

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    
    if (!session || !session.user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const { customAccessToken } = await request.json();

    if (!customAccessToken || typeof customAccessToken !== 'string') {
      return NextResponse.json(
        { error: "Token de acesso é obrigatório" },
        { status: 400 }
      );
    }

    // Verificar se o token já está sendo usado por outro usuário
    const existingUser = await db.user.findFirst({
      where: {
        customAccessToken,
        id: {
          not: session.user.id
        }
      }
    });

    if (existingUser) {
      return NextResponse.json(
        { error: "Este token já está sendo usado por outro usuário" },
        { status: 400 }
      );
    }

    // Atualizar o usuário com o novo token
    const updatedUser = await db.user.update({
      where: {
        id: session.user.id
      },
      data: {
        customAccessToken: customAccessToken.trim()
      }
    });

    console.log(`[API] Token atualizado para usuário ${session.user.id}: ${customAccessToken}`);

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

    // Buscar o usuário atual com o token
    const user = await db.user.findUnique({
      where: {
        id: session.user.id
      },
      select: {
        id: true,
        name: true,
        email: true,
        customAccessToken: true,
        role: true
      }
    });

    if (!user) {
      return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });
    }

    return NextResponse.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        hasToken: !!user.customAccessToken,
        role: user.role
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