import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    // Teste simples para verificar se a rota está funcionando
    const testData = {
      timestamp: new Date().toISOString(),
      status: 'OK',
      message: 'Dashboard de monitoramento funcionando!',
      systemOverview: {
        status: 'HEALTHY',
        healthScore: 95,
        uptime: process.uptime(),
        version: '1.0.0',
        environment: process.env.NODE_ENV || 'development',
        components: {
          webhook: 'HEALTHY',
          workers: 'HEALTHY',
          database: 'HEALTHY',
          cache: 'HEALTHY',
          queues: 'HEALTHY',
        },
      },
      featureFlags: {
        totalFlags: 10,
        enabledFlags: 8,
        rolloutFlags: 2,
      },
      abTests: {
        totalTests: 3,
        runningTests: 1,
        completedTests: 2,
      },
      feedback: {
        totalFeedback: 25,
        satisfactionScore: 4.2,
      },
      alerts: [],
      recommendations: [
        {
          type: 'INFO',
          priority: 'LOW',
          title: 'Sistema funcionando normalmente',
          description: 'Todos os componentes estão operacionais',
          actions: ['Continuar monitoramento'],
        },
      ],
    };

    return NextResponse.json(testData);
  } catch (error) {
    console.error('[Dashboard Test] Error:', error);
    return NextResponse.json(
      { error: 'Failed to generate test dashboard data' },
      { status: 500 }
    );
  }
}