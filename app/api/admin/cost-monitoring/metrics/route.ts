import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getCostDashboard, getCostMetrics, getCostAlerts } from '@/lib/cost/cost-monitor';
import log from '@/lib/log';

/**
 * GET /api/admin/cost-monitoring/metrics
 * Retorna métricas do sistema de monitoramento de custos
 */
export async function GET(request: NextRequest) {
  try {
    // Verificar autenticação e autorização
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Usuário não autenticado." },
        { status: 401 }
      );
    }

    if (session.user.role !== "ADMIN" && session.user.role !== "SUPERADMIN") {
      return NextResponse.json(
        { error: "Acesso negado. Apenas administradores podem acessar métricas de custos." },
        { status: 403 }
      );
    }

    // Obter parâmetros da query
    const { searchParams } = new URL(request.url);
    const timeWindow = parseInt(searchParams.get('timeWindow') || '60'); // minutos
    const includeAlerts = searchParams.get('includeAlerts') === 'true';

    // Obter dados do dashboard
    const dashboard = getCostDashboard();
    
    // Obter métricas históricas
    const historicalMetrics = getCostMetrics(timeWindow);
    
    // Obter alertas se solicitado
    const alerts = includeAlerts ? getCostAlerts() : [];

    // Calcular estatísticas adicionais
    const stats = calculateAdditionalStats(historicalMetrics);

    const response = {
      timestamp: new Date().toISOString(),
      health: dashboard.health,
      summary: dashboard.summary,
      metrics: {
        recent: dashboard.recentMetrics.slice(-10), // Últimas 10 coletas
        historical: historicalMetrics,
        stats,
      },
      alerts: alerts,
      system: {
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage(),
        nodeVersion: process.version,
      },
    };

    log.info('[CostMonitoringAPI] Métricas de custos consultadas', {
      userId: session.user.id,
      timeWindow,
      metricsCount: historicalMetrics.length,
      alertsCount: alerts.length,
    });

    return NextResponse.json(response);

  } catch (error) {
    log.error('[CostMonitoringAPI] Erro ao obter métricas de custos:', error);
    
    return NextResponse.json(
      { 
        error: "Erro interno do servidor ao obter métricas de custos.",
        details: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined
      },
      { status: 500 }
    );
  }
}

/**
 * Calcula estatísticas adicionais das métricas
 */
function calculateAdditionalStats(metrics: any[]) {
  if (metrics.length === 0) {
    return {
      totalEvents: 0,
      totalCost: 0,
      averageErrorRate: 0,
      averageProcessingTime: 0,
      peakProcessingTime: 0,
      costTrend: 'stable',
      errorTrend: 'stable',
    };
  }

  const totalEvents = metrics.reduce((sum, m) => sum + m.eventsProcessed, 0);
  const totalCost = metrics.reduce((sum, m) => sum + m.totalCostUSD, 0);
  const averageErrorRate = metrics.reduce((sum, m) => sum + m.errorRate, 0) / metrics.length;
  const averageProcessingTime = metrics.reduce((sum, m) => sum + m.averageProcessingTime, 0) / metrics.length;
  const peakProcessingTime = Math.max(...metrics.map(m => m.averageProcessingTime));

  // Calcular tendências (comparar primeira e segunda metade)
  const midPoint = Math.floor(metrics.length / 2);
  const firstHalf = metrics.slice(0, midPoint);
  const secondHalf = metrics.slice(midPoint);

  const firstHalfCost = firstHalf.reduce((sum, m) => sum + m.totalCostUSD, 0) / firstHalf.length;
  const secondHalfCost = secondHalf.reduce((sum, m) => sum + m.totalCostUSD, 0) / secondHalf.length;
  const costTrend = secondHalfCost > firstHalfCost * 1.1 ? 'increasing' : 
                   secondHalfCost < firstHalfCost * 0.9 ? 'decreasing' : 'stable';

  const firstHalfError = firstHalf.reduce((sum, m) => sum + m.errorRate, 0) / firstHalf.length;
  const secondHalfError = secondHalf.reduce((sum, m) => sum + m.errorRate, 0) / secondHalf.length;
  const errorTrend = secondHalfError > firstHalfError * 1.5 ? 'increasing' : 
                     secondHalfError < firstHalfError * 0.5 ? 'decreasing' : 'stable';

  return {
    totalEvents,
    totalCost: Math.round(totalCost * 10000) / 10000,
    averageErrorRate: Math.round(averageErrorRate * 100) / 100,
    averageProcessingTime: Math.round(averageProcessingTime),
    peakProcessingTime: Math.round(peakProcessingTime),
    costTrend,
    errorTrend,
  };
}