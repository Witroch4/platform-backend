import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { openaiService } from "@/services/openai";

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Usuário não autenticado." },
        { status: 401 }
      );
    }

    const { intents, agent } = await request.json();

    if (!intents || !Array.isArray(intents) || !agent) {
      return NextResponse.json(
        { error: "Parâmetros inválidos. Esperado: intents (array) e agent (object)." },
        { status: 400 }
      );
    }

    const titles = await openaiService.generateShortTitlesBatch(intents, agent);

    return NextResponse.json({ titles });
  } catch (error) {
    console.error("Erro ao gerar títulos curtos:", error);
    return NextResponse.json(
      { error: "Erro interno do servidor." },
      { status: 500 }
    );
  }
}