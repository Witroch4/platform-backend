/**
 * API route para gerar botões de chat livre na banda LOW
 * 🎯 NOVA FUNCIONALIDADE: Chat livre com IA usando instruções do agente configurado
 */

import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";
import { openaiService } from "@/services/openai";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // 🎯 CORREÇÃO: Verificar autenticação para proteger API
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Usuário não autenticado." },
        { status: 401 }
      );
    }

    const { userText, agent } = await request.json();

    if (!userText || !agent) {
      return NextResponse.json(
        { error: "Parâmetros 'userText' e 'agent' são obrigatórios." },
        { status: 400 }
      );
    }

    // 🎯 USAR INSTRUÇÕES DO AGENTE configurado no Capitão
    const result = await openaiService.generateFreeChatButtons(userText, agent);

    if (!result) {
      return NextResponse.json(
        { error: "Falha ao gerar botões de chat livre." },
        { status: 500 }
      );
    }

    return NextResponse.json(result);

  } catch (error) {
    console.error("Erro na API de chat livre:", error);
    return NextResponse.json(
      { error: "Erro interno do servidor." },
      { status: 500 }
    );
  }
}
