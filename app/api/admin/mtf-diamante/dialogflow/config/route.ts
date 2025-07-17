import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { db } from '@/lib/db';

export async function GET() {
  try {
    const session = await auth();
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    // Buscar o usuário Chatwit
    const usuarioChatwit = await db.usuarioChatwit.findUnique({
      where: { appUserId: session.user.id },
      select: {
        chatwitAccountId: true,
        chatwitAccessToken: true,
      }
    });

    if (!usuarioChatwit) {
      return NextResponse.json({ error: 'Usuário Chatwit não encontrado' }, { status: 404 });
    }

    return NextResponse.json({
      config: {
        chatwitAccountId: usuarioChatwit.chatwitAccountId,
        chatwitAccessToken: usuarioChatwit.chatwitAccessToken,
      }
    });
  } catch (error) {
    console.error('Erro ao buscar configuração:', error);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const { chatwitAccountId, chatwitAccessToken } = await request.json();

    if (!chatwitAccountId || !chatwitAccessToken) {
      return NextResponse.json({ error: 'Account ID e Token são obrigatórios' }, { status: 400 });
    }

    // Buscar ou criar o usuário Chatwit
    let usuarioChatwit = await db.usuarioChatwit.findUnique({
      where: { appUserId: session.user.id }
    });

    if (!usuarioChatwit) {
      // Criar novo usuário Chatwit se não existir
      usuarioChatwit = await db.usuarioChatwit.create({
        data: {
          appUserId: session.user.id,
          name: session.user.name || 'Usuário',
          accountName: 'Conta Padrão',
          channel: 'WhatsApp',
          chatwitAccountId,
          chatwitAccessToken,
        }
      });
    } else {
      // Atualizar o usuário Chatwit existente
      await db.usuarioChatwit.update({
        where: { id: usuarioChatwit.id },
        data: {
          chatwitAccountId,
          chatwitAccessToken,
        }
      });
    }

    return NextResponse.json({ message: 'Configuração salva com sucesso' });
  } catch (error) {
    console.error('Erro ao salvar configuração:', error);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
} 