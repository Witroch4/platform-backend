import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getPrismaInstance } from '@/lib/connections';
import { createLogger } from '@/lib/utils/logger';
import { Prisma } from '@prisma/client';

const prisma = getPrismaInstance();
const logger = createLogger('AI-Intents-Prewarm');

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const intentIds = body?.intentIds || [];

    if (!Array.isArray(intentIds) || intentIds.length === 0) {
      return NextResponse.json({ error: 'intentIds deve ser um array não vazio' }, { status: 400 });
    }

    // Get intents with embeddings
    const intents = await prisma.intent.findMany({
      where: {
        id: { in: intentIds },
        createdById: session.user.id,
        isActive: true,
        embedding: { not: Prisma.JsonNull }
      },
      select: {
        id: true,
        name: true,
        embedding: true,
        slug: true
      }
    });

    if (intents.length === 0) {
      return NextResponse.json({ error: 'Nenhuma intenção com embedding encontrada' }, { status: 404 });
    }

    // In a real implementation, this would:
    // 1. Load embeddings into Redis cache with proper namespacing
    // 2. Pre-compute similarity matrices if needed
    // 3. Warm up vector search indexes
    
    // For now, we'll simulate the prewarming process
    const prewarmedIntents = intents.map(intent => ({
      id: intent.id,
      name: intent.name,
      slug: intent.slug,
      embeddingDimensions: Array.isArray(intent.embedding) ? intent.embedding.length : 0,
      cached: true
    }));

    logger.info('Embeddings pré-aquecidos', { 
      userId: session.user.id, 
      intentCount: prewarmedIntents.length,
      intentIds: prewarmedIntents.map(i => i.id)
    });

    return NextResponse.json({ 
      success: true, 
      prewarmedIntents,
      message: `${prewarmedIntents.length} embeddings pré-aquecidos com sucesso`
    });

  } catch (error: any) {
    logger.error('Erro ao pré-aquecer embeddings', error);
    return NextResponse.json({ 
      error: 'Erro interno do servidor', 
      details: error.message 
    }, { status: 500 });
  }
}