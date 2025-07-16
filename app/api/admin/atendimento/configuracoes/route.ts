import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";

// GET: Busca configurações de um usuário (geral ou específica)
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const usuarioChatwit = await db.usuarioChatwit.findUnique({
      where: { appUserId: session.user.id },
    });

    if (!usuarioChatwit) {
      return NextResponse.json({ error: "Usuário Chatwit não encontrado" }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const caixaId = searchParams.get("caixaId");

    // Caso 1: Busca a configuração para UMA caixa específica (com fallback para a padrão)
    if (caixaId) {
      let config = await db.whatsAppConfig.findFirst({
        where: { caixaEntradaId: caixaId, usuarioChatwitId: usuarioChatwit.id },
      });

      if (!config) {
        config = await db.whatsAppConfig.findFirst({
          where: { caixaEntradaId: null, usuarioChatwitId: usuarioChatwit.id },
        });
      }
      return NextResponse.json({ success: true, config });
    }

    // Caso 2: Busca TUDO para a tela principal de configurações
    const configPadrao = await db.whatsAppConfig.findFirst({
      where: { caixaEntradaId: null, usuarioChatwitId: usuarioChatwit.id },
    });

    const caixas = await db.caixaEntrada.findMany({
      where: { usuarioChatwitId: usuarioChatwit.id },
      include: {
        configuracaoWhatsApp: true,
        _count: { select: { templates: true, mensagensInterativas: true, mapeamentosIntencao: true } },
      },
      orderBy: { nome: 'asc' },
    });

    return NextResponse.json({ success: true, configPadrao, caixas });

  } catch (error) {
    console.error("Erro em GET /configuracoes:", error);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}

// POST: Cria ou atualiza uma configuração de WhatsApp
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const body = await request.json();
    const { caixaId, phoneNumberId, token } = body;

    if (!phoneNumberId || !token) {
      return NextResponse.json({ error: "phoneNumberId e token são obrigatórios" }, { status: 400 });
    }

    const usuarioChatwit = await db.usuarioChatwit.findUnique({
      where: { appUserId: session.user.id },
    });

    if (!usuarioChatwit) {
      return NextResponse.json({ error: "Usuário Chatwit não encontrado" }, { status: 404 });
    }

    const savedConfig = await db.whatsAppConfig.upsert({
      where: {
        usuarioChatwitId_caixaEntradaId: {
          usuarioChatwitId: usuarioChatwit.id,
          caixaEntradaId: caixaId || null,
        },
      },
      update: { phoneNumberId, token },
      create: {
        phoneNumberId,
        token,
        usuarioChatwitId: usuarioChatwit.id,
        caixaEntradaId: caixaId || null,
      },
    });

    return NextResponse.json({ success: true, config: savedConfig });

  } catch (error) {
    console.error("Erro em POST /configuracoes:", error);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}