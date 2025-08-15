/**
 * SocialWise Flow Metrics API
 * Provides access to performance metrics and monitoring data
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getClassificationRates, getErrorRates, getPerformancePercentiles } from '@/lib/socialwise-flow/metrics';
import { createLogger } from '@/lib/utils/logger';

const metricsApiLogger = createLogger('SocialWise-MetricsAPI');

/**
 * GET /api/admin/socialwise-flow/metrics
 * Get performance metrics for a date range
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    // Authentication check
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Usuário não autenticado." },
        { status: 401 }
      );
    }

    // Parse query parameters
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate') || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const endDate = searchParams.get('endDate') || new Date().toISOString().split('T')[0];
    const metricType = searchParams.get('type') || 'all';

    // Validate date format
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(startDate) || !dateRegex.test(endDate)) {
      return NextResponse.json(
        { error: "Formato de data inválido. Use YYYY-MM-DD." },
        { status: 400 }
      );
    }

    const startTime = Date.now();
    let result: any = {};

    switch (metricType) {
      case 'classification':
        result = await getClassificationRates(startDate, endDate);
        break;
      
      case 'errors':
        result = await getErrorRates(startDate, endDate);
        break;
      
      case 'performance':
        result = await getPerformancePercentiles(startDate, endDate);
        break;
      
      case 'all':
      default:
        const [classificationRates, errorRates, performancePercentiles] = await Promise.all([
          getClassificationRates(startDate, endDate),
          getErrorRates(startDate, endDate),
          getPerformancePercentiles(startDate, endDate)
        ]);
        
        result = {
          classification: classificationRates,
          errors: errorRates,
          performance: performancePercentiles,
          dateRange: { startDate, endDate }
        };
        break;
    }

    const queryTime = Date.now() - startTime;

    metricsApiLogger.info('Metrics query completed', {
      metricType,
      startDate,
      endDate,
      queryTimeMs: queryTime,
      userId: session.user.id
    });

    return NextResponse.json({
      success: true,
      data: result,
      meta: {
        queryTimeMs: queryTime,
        dateRange: { startDate, endDate },
        metricType
      }
    });

  } catch (error) {
    metricsApiLogger.error('Metrics query failed', {
      error: error instanceof Error ? error.message : String(error)
    });

    return NextResponse.json(
      { 
        error: "Erro interno do servidor.",
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/socialwise-flow/metrics
 * Manually trigger metrics collection (for testing)
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // Authentication check
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Usuário não autenticado." },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { collectPerformanceMetrics, createPerformanceMetrics } = await import('@/lib/socialwise-flow/metrics');

    // Validate required fields
    if (!body.band || !body.strategy || typeof body.routeTotalMs !== 'number') {
      return NextResponse.json(
        { error: "Campos obrigatórios: band, strategy, routeTotalMs" },
        { status: 400 }
      );
    }

    // Create test metrics
    const testMetrics = createPerformanceMetrics(
      body.band,
      body.strategy,
      body.routeTotalMs,
      {
        channelType: body.channelType || 'test',
        userId: session.user.id,
        inboxId: body.inboxId || 'test',
        traceId: `test-${Date.now()}`,
        embeddingMs: body.embeddingMs,
        llmWarmupMs: body.llmWarmupMs,
        timeoutOccurred: body.timeoutOccurred || false,
        jsonParseSuccess: body.jsonParseSuccess !== false,
        abortOccurred: body.abortOccurred || false
      }
    );

    // Collect the metrics
    await collectPerformanceMetrics(testMetrics);

    metricsApiLogger.info('Test metrics collected', {
      band: body.band,
      strategy: body.strategy,
      routeTotalMs: body.routeTotalMs,
      userId: session.user.id
    });

    return NextResponse.json({
      success: true,
      message: "Métricas de teste coletadas com sucesso.",
      metrics: testMetrics
    });

  } catch (error) {
    metricsApiLogger.error('Test metrics collection failed', {
      error: error instanceof Error ? error.message : String(error)
    });

    return NextResponse.json(
      { 
        error: "Erro ao coletar métricas de teste.",
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}