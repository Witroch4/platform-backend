import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { auth } from "@/auth";

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    
    if (!session || !session.user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    // Buscar o UsuarioChatwit do usuário logado
    const usuarioChatwit = await db.usuarioChatwit.findUnique({
      where: { appUserId: session.user.id },
      select: { id: true }
    });

    if (!usuarioChatwit) {
      return NextResponse.json({
        success: true,
        config: {
          fbGraphApiBase: 'https://graph.facebook.com/v22.0',
          whatsappBusinessAccountId: '',
          whatsappToken: ''
        }
      });
    }

    // Buscar configuração do WhatsApp do usuário
    const config = await db.whatsAppConfig.findFirst({
      where: {
        usuarioChatwitId: usuarioChatwit.id,
        isActive: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    return NextResponse.json({
      success: true,
      config: config ? {
        fbGraphApiBase: config.fbGraphApiBase,
        whatsappBusinessAccountId: config.whatsappBusinessAccountId,
        whatsappToken: config.whatsappToken
      } : {
        fbGraphApiBase: 'https://graph.facebook.com/v22.0',
        whatsappBusinessAccountId: '',
        whatsappToken: ''
      }
    });

  } catch (error: any) {
    console.error("[API] Erro ao buscar configuração WhatsApp:", error);
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    
    if (!session || !session.user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const { fbGraphApiBase, whatsappBusinessAccountId, whatsappToken } = await request.json();

    if (!whatsappBusinessAccountId || !whatsappToken) {
      return NextResponse.json(
        { error: "ID da conta e token são obrigatórios" },
        { status: 400 }
      );
    }

    // Buscar o UsuarioChatwit do usuário logado
    const usuarioChatwit = await db.usuarioChatwit.findUnique({
      where: { appUserId: session.user.id },
      select: { id: true }
    });

    if (!usuarioChatwit) {
      return NextResponse.json(
        { error: "Usuário Chatwit não encontrado. Configure seu token primeiro." },
        { status: 404 }
      );
    }

    // Verificar se já existe uma configuração para este usuário
    const existingConfig = await db.whatsAppConfig.findFirst({
      where: {
        usuarioChatwitId: usuarioChatwit.id,
        isActive: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    let config;
    if (existingConfig) {
      // Atualizar configuração existente
      config = await db.whatsAppConfig.update({
        where: { id: existingConfig.id },
        data: {
          fbGraphApiBase: fbGraphApiBase || 'https://graph.facebook.com/v22.0',
          whatsappBusinessAccountId: whatsappBusinessAccountId.trim(),
          whatsappToken: whatsappToken.trim(),
          updatedAt: new Date()
        }
      });
    } else {
      // Criar nova configuração
      config = await db.whatsAppConfig.create({
        data: {
          fbGraphApiBase: fbGraphApiBase || 'https://graph.facebook.com/v22.0',
          whatsappBusinessAccountId: whatsappBusinessAccountId.trim(),
          whatsappToken: whatsappToken.trim(),
          usuarioChatwitId: usuarioChatwit.id,
          isActive: true
        }
      });
    }

    console.log(`[API] Configuração WhatsApp ${existingConfig ? 'atualizada' : 'criada'} para usuário ${session.user.id}`);

    return NextResponse.json({
      success: true,
      message: "Configuração salva com sucesso",
      config: {
        fbGraphApiBase: config.fbGraphApiBase,
        whatsappBusinessAccountId: config.whatsappBusinessAccountId,
        whatsappToken: config.whatsappToken
      }
    });

  } catch (error: any) {
    console.error("[API] Erro ao salvar configuração WhatsApp:", error);
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500 }
    );
  }
} 