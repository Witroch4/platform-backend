import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getPrismaInstance } from '@/lib/connections';
import { createLogger } from '@/lib/utils/logger';

const prisma = getPrismaInstance();
const logger = createLogger('SocialWise-Config-History');

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const inboxId = searchParams.get('inboxId');

  if (!inboxId) {
    return NextResponse.json({ error: 'inboxId é obrigatório' }, { status: 400 });
  }

  try {
    // In a real implementation, this would query a configuration history table
    // For now, we'll return simulated history
    const changes = [
      {
        id: 'hist_1',
        timestamp: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
        changes: { embedipreview: true, warmupDeadlineMs: 250 },
        userId: session.user.id,
        userName: session.user.name || 'Usuário'
      },
      {
        id: 'hist_2',
        timestamp: new Date(Date.now() - 7200000).toISOString(), // 2 hours ago
        changes: { hardDeadlineMs: 120, softDeadlineMs: 300 },
        userId: session.user.id,
        userName: session.user.name || 'Usuário'
      }
    ];

    logger.info('Histórico de configuração carregado', { 
      userId: session.user.id, 
      inboxId,
      changesCount: changes.length
    });

    return NextResponse.json({ changes });

  } catch (error: any) {
    logger.error('Erro ao carregar histórico de configuração', error);
    return NextResponse.json({ 
      error: 'Erro interno do servidor', 
      details: error.message 
    }, { status: 500 });
  }
}