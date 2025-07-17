import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const whatsappConfigSchema = z.object({
  phoneNumberId: z.string().min(1, "ID do número de telefone é obrigatório"),
  fbGraphApiBase: z.string().url("URL da API deve ser válida"),
  whatsappBusinessAccountId: z.string().min(1, "ID da conta business é obrigatório"),
  whatsappToken: z.string().min(1, "Token de acesso é obrigatório")
});

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    }

    if (session.user.role !== 'ADMIN' && session.user.role !== 'SUPERADMIN') {
      return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
    }

    // Buscar o usuário Chatwit
    const usuarioChatwit = await prisma.usuarioChatwit.findUnique({
      where: { appUserId: session.user.id }
    });

    let config = null;
    if (usuarioChatwit) {
      // Buscar configuração ativa do WhatsApp do usuário
      config = await prisma.whatsAppConfig.findFirst({
        where: {
          usuarioChatwitId: usuarioChatwit.id,
          isActive: true
        },
        orderBy: {
          updatedAt: 'desc'
        }
      });
    }

    // Se não houver configuração no banco, usar valores do .env
    if (!config) {
      return NextResponse.json({
        success: true,
        config: {
          fbGraphApiBase: process.env.FB_GRAPH_API_BASE || 'https://graph.facebook.com/v22.0',
          whatsappBusinessAccountId: process.env.WHATSAPP_BUSINESS_ID || '',
          whatsappToken: process.env.WHATSAPP_TOKEN || ''
        },
        isEnvConfig: true
      });
    }

    return NextResponse.json({
      success: true,
      config: {
        id: config.id,
        fbGraphApiBase: config.fbGraphApiBase,
        whatsappBusinessAccountId: config.whatsappBusinessAccountId,
        whatsappToken: config.whatsappToken,
        createdAt: config.createdAt,
        updatedAt: config.updatedAt
      },
      isEnvConfig: false
    });

  } catch (error) {
    console.error('Erro ao buscar configurações do WhatsApp:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    }

    if (session.user.role !== 'ADMIN' && session.user.role !== 'SUPERADMIN') {
      return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
    }

    const body = await request.json();
    const validatedData = whatsappConfigSchema.parse(body);

    // Buscar o usuário Chatwit
    const usuarioChatwit = await prisma.usuarioChatwit.findUnique({
      where: { appUserId: session.user.id }
    });

    if (!usuarioChatwit) {
      return NextResponse.json({ error: 'Usuário Chatwit não encontrado' }, { status: 404 });
    }

    // Usar transação para garantir consistência
    const result = await prisma.$transaction(async (tx) => {
      // Desativar configurações anteriores
      await tx.whatsAppConfig.updateMany({
        where: {
          usuarioChatwitId: usuarioChatwit.id,
          isActive: true
        },
        data: { isActive: false }
      });

      // Criar nova configuração
      const newConfig = await tx.whatsAppConfig.create({
        data: {
          usuarioChatwitId: usuarioChatwit.id,
          phoneNumberId: validatedData.phoneNumberId || '',
          fbGraphApiBase: validatedData.fbGraphApiBase,
          whatsappBusinessAccountId: validatedData.whatsappBusinessAccountId,
          whatsappToken: validatedData.whatsappToken,
          isActive: true
        }
      });

      return newConfig;
    });

    return NextResponse.json({
      success: true,
      message: 'Configurações do WhatsApp salvas com sucesso',
      config: {
        id: result.id,
        fbGraphApiBase: result.fbGraphApiBase,
        whatsappBusinessAccountId: result.whatsappBusinessAccountId,
        createdAt: result.createdAt,
        updatedAt: result.updatedAt
      }
    });

  } catch (error) {
    console.error('Erro ao salvar configurações do WhatsApp:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Dados inválidos', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
} 