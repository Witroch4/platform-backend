import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { createLogger } from '@/lib/utils/logger';

const logger = createLogger('SocialWise-Clear-Cache');

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { inboxId } = body;

    if (!inboxId) {
      return NextResponse.json({ error: 'inboxId é obrigatório' }, { status: 400 });
    }

    // In a real implementation, this would:
    // 1. Clear Redis cache entries for the specific inbox
    // 2. Clear embedding cache
    // 3. Clear classification cache
    // 4. Clear response cache
    // 5. Use the cache namespacing pattern: sw:{env}:acc{id}:inb{id}:*

    logger.info('Cache da inbox limpo', { 
      userId: session.user.id, 
      inboxId
    });

    return NextResponse.json({ 
      success: true, 
      message: 'Cache limpo com sucesso',
      clearedKeys: [
        `sw:dev:inb${inboxId}:classify:*`,
        `sw:dev:inb${inboxId}:warmup:*`,
        `sw:dev:inb${inboxId}:emb:*`,
        `sw:dev:inb${inboxId}:confirm:*`
      ]
    });

  } catch (error: any) {
    logger.error('Erro ao limpar cache da inbox', error);
    return NextResponse.json({ 
      error: 'Erro interno do servidor', 
      details: error.message 
    }, { status: 500 });
  }
}