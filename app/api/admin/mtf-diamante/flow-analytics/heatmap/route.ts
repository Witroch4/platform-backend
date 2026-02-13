import { type NextRequest, NextResponse } from 'next/server';
import { getPrismaInstance, getRedisInstance } from '@/lib/connections';
import { auth } from '@/auth';
import { calculateHeatmapData } from '@/lib/flow-analytics/heatmap-service';
import type { NodeHeatmapData } from '@/types/flow-analytics';
import type { ApiResponse } from '@/types/flow-analytics';

// =============================================================================
// CONSTANTS
// =============================================================================

const CACHE_TTL_SECONDS = 60;
const CACHE_KEY_PREFIX = 'flow-analytics:heatmap';

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Verifica se o usuário tem acesso à inbox
 */
async function verifyInboxAccess(
  inboxId: string,
  userId: string
): Promise<boolean> {
  const inbox = await getPrismaInstance().chatwitInbox.findFirst({
    where: {
      id: inboxId,
      usuarioChatwit: {
        appUserId: userId,
      },
    },
  });

  return !!inbox;
}

/**
 * Gera chave de cache baseada nos filtros
 */
function getCacheKey(
  flowId: string,
  inboxId?: string,
  dateStart?: string,
  dateEnd?: string
): string {
  const parts = [CACHE_KEY_PREFIX, flowId];
  
  if (inboxId) {
    parts.push(`inbox:${inboxId}`);
  }
  
  if (dateStart && dateEnd) {
    parts.push(`range:${dateStart}-${dateEnd}`);
  }
  
  return parts.join(':');
}

// =============================================================================
// GET - Obter dados de heatmap para um flow
// =============================================================================

/**
 * GET /api/admin/mtf-diamante/flow-analytics/heatmap
 * 
 * Query Parameters:
 * - flowId (required): ID do flow
 * - inboxId (optional): Filtrar por inbox específica
 * - dateStart (optional): Data inicial (ISO string)
 * - dateEnd (optional): Data final (ISO string)
 * 
 * Returns: NodeHeatmapData[]
 * 
 * Validates Requirement 19.2: Heatmap API endpoint with caching
 */
export async function GET(request: NextRequest) {
  try {
    // Autenticação
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'Usuário não autenticado.' },
        { status: 401 }
      );
    }

    // Extrair parâmetros
    const { searchParams } = new URL(request.url);
    const flowId = searchParams.get('flowId');
    const inboxId = searchParams.get('inboxId');
    const dateStart = searchParams.get('dateStart');
    const dateEnd = searchParams.get('dateEnd');

    // Validar flowId obrigatório
    if (!flowId) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'flowId é obrigatório' },
        { status: 400 }
      );
    }

    // Verificar se o flow existe e obter inboxId
    const flow = await getPrismaInstance().flow.findUnique({
      where: { id: flowId },
      select: { id: true, inboxId: true, name: true },
    });

    if (!flow) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'Flow não encontrado' },
        { status: 404 }
      );
    }

    // Verificar acesso à inbox do flow
    const hasAccess = await verifyInboxAccess(flow.inboxId, session.user.id);
    if (!hasAccess) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'Acesso negado a esta caixa' },
        { status: 403 }
      );
    }

    // Verificar cache
    const cacheKey = getCacheKey(flowId, inboxId || undefined, dateStart || undefined, dateEnd || undefined);
    
    try {
      const redisClient = getRedisInstance();
      const cachedData = await redisClient.get(cacheKey);
      
      if (cachedData) {
        const parsed = JSON.parse(cachedData) as NodeHeatmapData[];
        return NextResponse.json<ApiResponse<NodeHeatmapData[]>>({
          success: true,
          data: parsed,
        });
      }
    } catch (cacheError) {
      // Log cache error but continue with database query
      console.warn('[heatmap] Cache read error:', cacheError);
    }

    // Construir filtros de data
    const dateFilter: { createdAt?: { gte?: Date; lte?: Date } } = {};
    if (dateStart || dateEnd) {
      dateFilter.createdAt = {};
      if (dateStart) {
        dateFilter.createdAt.gte = new Date(dateStart);
      }
      if (dateEnd) {
        dateFilter.createdAt.lte = new Date(dateEnd);
      }
    }

    // Buscar sessões do flow com filtros
    const sessions = await getPrismaInstance().flowSession.findMany({
      where: {
        flowId,
        ...(inboxId ? { inboxId } : {}),
        ...dateFilter,
      },
      select: {
        id: true,
        executionLog: true,
        status: true,
        createdAt: true,
        completedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    // Buscar definição do flow (nodes)
    const flowWithNodes = await getPrismaInstance().flow.findUnique({
      where: { id: flowId },
      include: {
        nodes: {
          select: {
            id: true,
            nodeType: true,
            config: true,
          },
        },
      },
    });

    if (!flowWithNodes) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'Flow não encontrado' },
        { status: 404 }
      );
    }

    // Calcular heatmap data
    const heatmapData = calculateHeatmapData(
      sessions.map(s => ({
        executionLog: s.executionLog as any[],
        status: s.status,
        createdAt: s.createdAt,
        completedAt: s.completedAt,
      })),
      {
        nodes: flowWithNodes.nodes.map(n => ({
          id: n.id,
          nodeType: n.nodeType as any,
          config: n.config as Record<string, unknown>,
        })),
      }
    );

    // Salvar no cache
    try {
      const redisClient = getRedisInstance();
      await redisClient.setex(
        cacheKey,
        CACHE_TTL_SECONDS,
        JSON.stringify(heatmapData)
      );
    } catch (cacheError) {
      // Log cache error but return data anyway
      console.warn('[heatmap] Cache write error:', cacheError);
    }

    return NextResponse.json<ApiResponse<NodeHeatmapData[]>>({
      success: true,
      data: heatmapData,
    });
  } catch (error) {
    console.error('[heatmap] GET error:', error);
    return NextResponse.json<ApiResponse<never>>(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Erro interno',
      },
      { status: 500 }
    );
  }
}
