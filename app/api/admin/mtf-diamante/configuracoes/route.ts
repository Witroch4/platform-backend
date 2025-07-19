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

    // Função para criar máscara segura do token
    const createTokenMask = (token: string) => {
      if (!token || token.length < 5) return '';
      const lastFive = token.slice(-5);
      const dots = '•'.repeat(Math.max(0, token.length - 5));
      return `${dots}${lastFive}`;
    };

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

      // Transforma a configuração para não expor o token
      const configSegura = config ? {
        ...config,
        whatsappToken: undefined, // Remove o token completo
        hasToken: !!config.whatsappToken,
        tokenMask: config.whatsappToken ? createTokenMask(config.whatsappToken) : undefined
      } : null;

      return NextResponse.json({ success: true, config: configSegura });
    }

    // Caso 2: Busca TUDO para a tela principal de configurações
    const configPadrao = await db.whatsAppConfig.findFirst({
      where: { caixaEntradaId: null, usuarioChatwitId: usuarioChatwit.id },
    });

    // Transforma a configuração padrão para não expor o token
    const configPadraoSegura = configPadrao ? {
      ...configPadrao,
      whatsappToken: undefined, // Remove o token completo
      hasToken: !!configPadrao.whatsappToken,
      tokenMask: configPadrao.whatsappToken ? createTokenMask(configPadrao.whatsappToken) : undefined
    } : null;

    const caixas = await db.caixaEntrada.findMany({
      where: { usuarioChatwitId: usuarioChatwit.id },
      include: {
        configuracaoWhatsApp: true,
        _count: { select: { templates: true, mensagensInterativas: true, mapeamentosIntencao: true } },
      },
      orderBy: { nome: 'asc' },
    });

    // Transforma as configurações das caixas para não expor tokens
    const caixasSeguras = caixas.map(caixa => ({
      ...caixa,
      configuracaoWhatsApp: caixa.configuracaoWhatsApp ? {
        ...caixa.configuracaoWhatsApp,
        whatsappToken: undefined, // Remove o token completo
        hasToken: !!caixa.configuracaoWhatsApp.whatsappToken,
        tokenMask: caixa.configuracaoWhatsApp.whatsappToken ? createTokenMask(caixa.configuracaoWhatsApp.whatsappToken) : undefined
      } : null
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
    const { caixaId, phoneNumberId, token } = body;

    if (!phoneNumberId) {
      return NextResponse.json({ error: "phoneNumberId é obrigatório" }, { status: 400 });
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

    // Prepara os dados para atualização
    const updateData: any = { phoneNumberId };
    
    // Só inclui o token se foi fornecido
    if (token) {
      updateData.whatsappToken = token;
    }

    if (caixaId) {
      // Configuração específica para uma caixa
      const existingConfig = await db.whatsAppConfig.findFirst({
        where: {
          usuarioChatwitId: usuarioChatwit.id,
          caixaEntradaId: caixaId,
        },
      });

      if (existingConfig) {
        // Atualiza configuração existente
        savedConfig = await db.whatsAppConfig.update({
          where: { id: existingConfig.id },
          data: updateData,
        });
      } else {
        // Cria nova configuração (token é obrigatório para criação)
        if (!token) {
          return NextResponse.json({ error: "Token é obrigatório para criar nova configuração" }, { status: 400 });
        }
        savedConfig = await db.whatsAppConfig.create({
          data: {
            phoneNumberId,
            whatsappToken: token,
            whatsappBusinessAccountId: process.env.WHATSAPP_BUSINESS_ID || '',
            fbGraphApiBase: process.env.FB_GRAPH_API_BASE || 'https://graph.facebook.com/v22.0',
            usuarioChatwitId: usuarioChatwit.id,
            caixaEntradaId: caixaId,
            isActive: true
          },
        });
      }
    } else {
      // Configuração padrão (global) - caixaEntradaId é null
      const existingConfig = await db.whatsAppConfig.findFirst({
        where: {
          usuarioChatwitId: usuarioChatwit.id,
          caixaEntradaId: null,
        },
      });

      if (existingConfig) {
        // Atualiza a configuração existente
        savedConfig = await db.whatsAppConfig.update({
          where: { id: existingConfig.id },
          data: updateData,
        });
      } else {
        // Cria uma nova configuração padrão (token é obrigatório para criação)
        if (!token) {
          return NextResponse.json({ error: "Token é obrigatório para criar nova configuração" }, { status: 400 });
        }
        savedConfig = await db.whatsAppConfig.create({
          data: {
            phoneNumberId,
            whatsappToken: token,
            whatsappBusinessAccountId: process.env.WHATSAPP_BUSINESS_ID || '',
            fbGraphApiBase: process.env.FB_GRAPH_API_BASE || 'https://graph.facebook.com/v22.0',
            usuarioChatwitId: usuarioChatwit.id,
            caixaEntradaId: null,
            isActive: true
          },
        });
      }
    }

    // Transforma a configuração salva para não expor o token
    const configSegura = {
      ...savedConfig,
      whatsappToken: undefined, // Remove o token completo
      hasToken: !!savedConfig.whatsappToken,
      tokenMask: savedConfig.whatsappToken ? createTokenMask(savedConfig.whatsappToken) : undefined
    };

    return NextResponse.json({ success: true, config: configSegura });

  } catch (error) {
    console.error("Erro em POST /configuracoes:", error);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}