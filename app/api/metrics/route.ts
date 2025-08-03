/**
 * Endpoint de métricas para Prometheus/Grafana
 */

import { NextResponse } from 'next/server';
import { getPrometheusMetrics } from '@/lib/container-monitoring';

export async function GET() {
  try {
    const metrics = await getPrometheusMetrics();
    
    return new NextResponse(metrics, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  } catch (error) {
    console.error('❌ Erro ao gerar métricas:', error);
    
    return NextResponse.json(
      { error: 'Failed to generate metrics' },
      { status: 500 }
    );
  }
}