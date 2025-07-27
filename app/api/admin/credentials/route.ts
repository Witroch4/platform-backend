// app/api/admin/credentials/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

/**
 * GET - Lista configurações de credenciais (ChatwitInbox e WhatsAppGlobalConfig)
 */
export async function GET(request: NextRequest): Promise<Response> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type'); // 'inbox' | 'global' | null (ambos)

    // Buscar usuário Chatwit
    const usuarioChatwit = await prisma.usuarioChatwit.findUnique({
      where: { appUserId: session.user.id },
      include: {
        configuracaoGlobalWhatsApp: true,
        inboxes: {
          include: {
            fallbackParaInbox: {
              select: { id: true, nome: true, inboxId: true },
            },
            fallbackDeInboxes: {
              select: { id: true, nome: true, inboxId: true },
            },
          },
          orderBy: { nome: 'asc' },
        },
      },
    });

    if (!usuarioChatwit) {
      return NextResponse.json(
        { error: 'Usuário Chatwit não encontrado' },
        { status: 404 }
      );
    }

    const response: any = {
      usuarioChatwitId: usuarioChatwit.id,
    };

    // Incluir configuração global se solicitado
    if (!type || type === 'global') {
      response.globalConfig = usuarioChatwit.configuracaoGlobalWhatsApp ? {
        id: usuarioChatwit.configuracaoGlobalWhatsApp.id,
        whatsappApiKey: usuarioChatwit.configuracaoGlobalWhatsApp.whatsappApiKey ? '***' : null, // Mascarar por segurança
        phoneNumberId: usuarioChatwit.configuracaoGlobalWhatsApp.phoneNumberId,
        whatsappBusinessAccountId: usuarioChatwit.configuracaoGlobalWhatsApp.whatsappBusinessAccountId,
        graphApiBaseUrl: usuarioChatwit.configuracaoGlobalWhatsApp.graphApiBaseUrl,
        updatedAt: usuarioChatwit.configuracaoGlobalWhatsApp.updatedAt,
        hasCredentials: !!usuarioChatwit.configuracaoGlobalWhatsApp.whatsappApiKey,
      } : null;
    }

    // Incluir configurações de inbox se solicitado
    if (!type || type === 'inbox') {
      response.inboxConfigs = usuarioChatwit.inboxes.map(inbox => ({
        id: inbox.id,
        nome: inbox.nome,
        inboxId: inbox.inboxId,
        channelType: inbox.channelType,
        whatsappApiKey: inbox.whatsappApiKey ? '***' : null, // Mascarar por segurança
        phoneNumberId: inbox.phoneNumberId,
        whatsappBusinessAccountId: inbox.whatsappBusinessAccountId,
        fallbackParaInboxId: inbox.fallbackParaInboxId,
        fallbackParaInbox: inbox.fallbackParaInbox,
        fallbackDeInboxes: inbox.fallbackDeInboxes,
        createdAt: inbox.createdAt,
        updatedAt: inbox.updatedAt,
        hasCredentials: !!(inbox.whatsappApiKey || inbox.phoneNumberId || inbox.whatsappBusinessAccountId),
        hasFallback: !!inbox.fallbackParaInboxId,
        isUsedAsFallback: inbox.fallbackDeInboxes.length > 0,
      }));
    }

    console.log(`[Credentials API] Configurações encontradas para usuário: ${usuarioChatwit.id}`);

    return NextResponse.json(response);

  } catch (error) {
    console.error('[Credentials API] Erro ao buscar configurações:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}