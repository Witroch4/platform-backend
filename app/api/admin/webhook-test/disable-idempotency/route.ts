import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getRedisInstance } from '@/lib/connections';
import { createLogger } from '@/lib/utils/logger';

const logger = createLogger('WebhookTestIdempotencyControl');

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
    const body = await request.json();
    const { disable, duration = 300 } = body; // duration in seconds, default 5 minutes

    if (disable) {
      // Disable idempotency for testing
      await redis.setex('test:disable_idempotency', duration, '1');
      logger.info(`Idempotency disabled for ${duration} seconds`);
      
      return NextResponse.json({
        success: true,
        message: `Idempotência desabilitada por ${duration} segundos para testes.`,
        disabled: true,
        expiresAt: new Date(Date.now() + duration * 1000).toISOString()
      });
    } else {
      // Re-enable idempotency
      await redis.del('test:disable_idempotency');
      logger.info('Idempotency re-enabled');
      
      return NextResponse.json({
        success: true,
        message: 'Idempotência reabilitada.',
        disabled: false
      });
    }

  } catch (error) {
    logger.error('Failed to control idempotency:', error);
    
    return NextResponse.json(
      { 
        error: "Erro interno do servidor ao controlar idempotência.",
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
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
    const isDisabled = await redis.get('test:disable_idempotency');
    const ttl = isDisabled ? await redis.ttl('test:disable_idempotency') : -1;

    return NextResponse.json({
      success: true,
      disabled: !!isDisabled,
      ttl: ttl > 0 ? ttl : null,
      expiresAt: ttl > 0 ? new Date(Date.now() + ttl * 1000).toISOString() : null
    });

  } catch (error) {
    logger.error('Failed to get idempotency status:', error);
    
    return NextResponse.json(
      { 
        error: "Erro interno do servidor ao verificar status da idempotência.",
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}
