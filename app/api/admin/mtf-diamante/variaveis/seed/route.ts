import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { ensureMtfVariaveisPopulated } from "@/app/lib/mtf-diamante-seed";

// POST: Executa o seed automático das variáveis MTF Diamante para o usuário atual
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    // Executa o seed automático (só popula se ainda não foi populado)
    await ensureMtfVariaveisPopulated(session.user.id);

    return NextResponse.json({ 
      success: true, 
      message: "Seed automático executado com sucesso" 
    });

  } catch (error) {
    console.error("Erro no seed automático:", error);
    return NextResponse.json({ 
      error: "Erro interno do servidor",
      success: false 
    }, { status: 500 });
  }
}