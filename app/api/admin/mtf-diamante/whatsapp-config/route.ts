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
      config = await prisma.whatsAppGlobalConfig.findFirst({
        where: {
          usuarioChatwitId: usuarioChatwit.id
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
        phoneNumberId: config.phoneNumberId,
        fbGraphApiBase: config.graphApiBaseUrl,
        whatsappBusinessAccountId: config.whatsappBusinessAccountId,
        whatsappToken: config.whatsappApiKey,
        createdAt: config.updatedAt,
        updatedAt: config.updatedAt
      }
    });

  } catch (error) {
    console.error('Erro ao buscar configuração do WhatsApp:', error);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
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
      // Verificar se já existe configuração
      const existingConfig = await tx.whatsAppGlobalConfig.findFirst({
        where: {
          usuarioChatwitId: usuarioChatwit.id
        }
      });

      let newConfig;
      if (existingConfig) {
        // Atualizar configuração existente
        newConfig = await tx.whatsAppGlobalConfig.update({
          where: { id: existingConfig.id },
          data: {
            phoneNumberId: validatedData.phoneNumberId,
            graphApiBaseUrl: validatedData.fbGraphApiBase,
            whatsappBusinessAccountId: validatedData.whatsappBusinessAccountId,
            whatsappApiKey: validatedData.whatsappToken
          }
        });
      } else {
        // Criar nova configuração
        newConfig = await tx.whatsAppGlobalConfig.create({
          data: {
            usuarioChatwitId: usuarioChatwit.id,
            phoneNumberId: validatedData.phoneNumberId,
            graphApiBaseUrl: validatedData.fbGraphApiBase,
            whatsappBusinessAccountId: validatedData.whatsappBusinessAccountId,
            whatsappApiKey: validatedData.whatsappToken
          }
        });
      }

      return newConfig;
    });

    return NextResponse.json({
      success: true,
      message: 'Configurações do WhatsApp salvas com sucesso',
      config: {
        id: result.id,
        phoneNumberId: result.phoneNumberId,
        fbGraphApiBase: result.graphApiBaseUrl,
        whatsappBusinessAccountId: result.whatsappBusinessAccountId,
        createdAt: result.updatedAt,
        updatedAt: result.updatedAt
      }
    });

  } catch (error) {
    console.error('Erro ao salvar configuração do WhatsApp:', error);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
} 