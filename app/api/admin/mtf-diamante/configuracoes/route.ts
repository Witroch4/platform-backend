import { type NextRequest, NextResponse } from "next/server";
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
    const inboxId = searchParams.get("inboxId");

    // Função para criar máscara segura do token
    const createTokenMask = (token: string) => {
      if (!token || token.length < 5) return '';
      const lastFive = token.slice(-5);
      const dots = '•'.repeat(Math.max(0, token.length - 5));
      return `${dots}${lastFive}`;
    };

    // Caso 1: Busca a configuração para UMA caixa específica (com fallback para a padrão)
    if (inboxId) {
      // Buscar configuração global primeiro
      let config = await db.whatsAppGlobalConfig.findFirst({
        where: { usuarioChatwitId: usuarioChatwit.id },
      });

      // Buscar configuração específica da caixa
      const inboxConfig = await db.chatwitInbox.findFirst({
        where: { id: inboxId, usuarioChatwitId: usuarioChatwit.id },
      });

      // Se não há configuração global, usar valores do .env
      if (!config) {
        config = {
          id: 'env-config',
          usuarioChatwitId: usuarioChatwit.id,
          whatsappApiKey: process.env.WHATSAPP_TOKEN || '',
          phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
          whatsappBusinessAccountId: process.env.WHATSAPP_BUSINESS_ID || '',
          graphApiBaseUrl: process.env.FB_GRAPH_API_BASE || 'https://graph.facebook.com/v22.0',
          updatedAt: new Date()
        };
      }

      // Transforma a configuração para não expor o token
      const configSegura = config ? {
        ...config,
        whatsappApiKey: undefined, // Remove o token completo
        hasToken: !!config.whatsappApiKey,
        tokenMask: config.whatsappApiKey ? createTokenMask(config.whatsappApiKey) : undefined,
        fbGraphApiBase: config.graphApiBaseUrl // Mapear para o campo esperado pelo frontend
      } : null;

      return NextResponse.json({ success: true, config: configSegura });
    }

    // Caso 2: Busca TUDO para a tela principal de configurações
    const configPadrao = await db.whatsAppGlobalConfig.findFirst({
      where: { usuarioChatwitId: usuarioChatwit.id },
    });

    // Transforma a configuração padrão para não expor o token
    const configPadraoSegura = configPadrao ? {
      ...configPadrao,
      whatsappApiKey: undefined, // Remove o token completo
      hasToken: !!configPadrao.whatsappApiKey,
      tokenMask: configPadrao.whatsappApiKey ? createTokenMask(configPadrao.whatsappApiKey) : undefined,
      fbGraphApiBase: configPadrao.graphApiBaseUrl // Mapear para o campo esperado pelo frontend
    } : null;

    const caixas = await db.chatwitInbox.findMany({
      where: { usuarioChatwitId: usuarioChatwit.id },
      include: {
        templates: true,
        mapeamentosIntencao: true,
        _count: { select: { templates: true, mapeamentosIntencao: true } },
      },
      orderBy: { nome: 'asc' },
    });

    // Transforma as configurações das caixas para não expor tokens
    const caixasSeguras = caixas.map(caixa => ({
      ...caixa,
      whatsappApiKey: caixa.whatsappApiKey ? createTokenMask(caixa.whatsappApiKey) : undefined,
      hasToken: !!caixa.whatsappApiKey
    }));

    return NextResponse.json({ success: true, configPadrao: configPadraoSegura, caixas: caixasSeguras });

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
    const { inboxId, phoneNumberId, whatsappBusinessAccountId, fbGraphApiBase, token } = body;

    if (!phoneNumberId) {
      return NextResponse.json({ error: "phoneNumberId é obrigatório" }, { status: 400 });
    }

    if (!whatsappBusinessAccountId) {
      return NextResponse.json({ error: "whatsappBusinessAccountId é obrigatório" }, { status: 400 });
    }

    if (!fbGraphApiBase) {
      return NextResponse.json({ error: "fbGraphApiBase é obrigatório" }, { status: 400 });
    }

    const usuarioChatwit = await db.usuarioChatwit.findUnique({
      where: { appUserId: session.user.id },
    });

    if (!usuarioChatwit) {
      return NextResponse.json({ error: "Usuário Chatwit não encontrado" }, { status: 404 });
    }

    let savedConfig;

    // Função para criar máscara segura do token
    const createTokenMask = (token: string) => {
      if (!token || token.length < 5) return '';
      const lastFive = token.slice(-5);
      const dots = '•'.repeat(Math.max(0, token.length - 5));
      return `${dots}${lastFive}`;
    };

    if (inboxId) {
      // Configuração específica para uma caixa - usar ChatwitInbox
      const existingInbox = await db.chatwitInbox.findFirst({
        where: {
          id: inboxId,
          usuarioChatwitId: usuarioChatwit.id,
        },
      });

      if (!existingInbox) {
        return NextResponse.json({ error: "Caixa de entrada não encontrada" }, { status: 404 });
      }

      // Atualiza a caixa de entrada com as configurações
      savedConfig = await db.chatwitInbox.update({
        where: { id: inboxId },
        data: {
          phoneNumberId,
          whatsappBusinessAccountId,
          whatsappApiKey: token || existingInbox.whatsappApiKey,
        },
      });
    } else {
      // Configuração padrão (global) - usar WhatsAppGlobalConfig
      const existingConfig = await db.whatsAppGlobalConfig.findFirst({
        where: {
          usuarioChatwitId: usuarioChatwit.id,
        },
      });

      if (existingConfig) {
        // Atualiza a configuração existente
        savedConfig = await db.whatsAppGlobalConfig.update({
          where: { id: existingConfig.id },
          data: {
            phoneNumberId,
            whatsappBusinessAccountId,
            graphApiBaseUrl: fbGraphApiBase,
            whatsappApiKey: token || existingConfig.whatsappApiKey,
          },
        });
      } else {
        // Cria uma nova configuração padrão (token é obrigatório para criação)
        if (!token) {
          return NextResponse.json({ error: "Token é obrigatório para criar nova configuração" }, { status: 400 });
        }
        savedConfig = await db.whatsAppGlobalConfig.create({
          data: {
            phoneNumberId,
            whatsappApiKey: token,
            whatsappBusinessAccountId,
            graphApiBaseUrl: fbGraphApiBase,
            usuarioChatwitId: usuarioChatwit.id,
          },
        });
      }
    }

    // Transforma a configuração salva para não expor o token
    const configSegura = {
      ...savedConfig,
      whatsappApiKey: undefined, // Remove o token completo
      hasToken: !!savedConfig.whatsappApiKey,
      tokenMask: savedConfig.whatsappApiKey ? createTokenMask(savedConfig.whatsappApiKey) : undefined,
      fbGraphApiBase: 'graphApiBaseUrl' in savedConfig ? savedConfig.graphApiBaseUrl : 'https://graph.facebook.com/v22.0' // Mapear para o campo esperado pelo frontend
    };

    return NextResponse.json({ success: true, config: configSegura });

  } catch (error) {
    console.error("Erro em POST /configuracoes:", error);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}