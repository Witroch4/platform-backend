import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getRedisInstance } from '@/lib/connections';
import { createLogger } from '@/lib/utils/logger';

const logger = createLogger('WebhookTestCacheClear');

export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Usuário não autenticado." },
        { status: 401 }
      );
    }

    const redis = getRedisInstance();
    
    // Clear various cache patterns related to webhook testing
    const patterns = [
      'socialwise:*',
      'chatwit:*',
      'webhook:*',
      'idempotency:*',
      'replay:*',
      'rate_limit:*'
    ];

    let totalCleared = 0;

    for (const pattern of patterns) {
      try {
        const keys = await redis.keys(pattern);
        if (keys.length > 0) {
          await redis.del(...keys);
          totalCleared += keys.length;
          logger.info(`Cleared ${keys.length} keys for pattern: ${pattern}`);
        }
      } catch (error) {
        logger.warn(`Failed to clear pattern ${pattern}:`, error);
      }
    }

    logger.info(`Cache cleared successfully. Total keys cleared: ${totalCleared}`);

    return NextResponse.json({
      success: true,
      message: `Cache limpo com sucesso. ${totalCleared} chaves removidas.`,
      keysCleared: totalCleared
    });

  } catch (error) {
    logger.error('Failed to clear cache:', error);
    
    return NextResponse.json(
      { 
        error: "Erro interno do servidor ao limpar cache.",
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}