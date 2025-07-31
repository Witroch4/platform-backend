import { NextRequest, NextResponse } from 'next/server';
import { instagramTranslationMonitor } from '@/lib/monitoring/instagram-translation-monitor';
import { instagramTranslationLogger } from '@/lib/logging/instagram-translation-logger';
import { getInstagramErrorStatistics } from '@/lib/monitoring/instagram-error-tracker';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const timeWindow = parseInt(searchParams.get('timeWindow') || '60'); // Default 1 hour
    const correlationId = searchParams.get('correlationId');
    const action = searchParams.get('action') || 'summary';

    switch (action) {
      case 'summary':
        // Get comprehensive performance summary
        const performanceSummary = await instagramTranslationMonitor.getPerformanceSummary(timeWindow);
        const errorStatistics = await getInstagramErrorStatistics(Math.ceil(timeWindow / 60));
        
        return NextResponse.json({
          success: true,
          data: {
            performance: performanceSummary,
            errors: errorStatistics,
            timeWindow: `${timeWindow} minutes`,
            timestamp: new Date().toISOString(),
          },
        });

      case 'logs':
        // Get logs for specific correlation ID or recent logs
        const logs = await instagramTranslationLogger.queryLogs(
          correlationId || undefined,
          undefined,
          undefined,
          Math.ceil(timeWindow / 60)
        );
        
        return NextResponse.json({
          success: true,
          data: {
            logs,
            totalLogs: logs.length,
            correlationId: correlationId || 'all',
            timeWindow: `${Math.ceil(timeWindow / 60)} hour(s)`,
          },
        });

      case 'log-statistics':
        // Get log statistics
        const logStats = await instagramTranslationLogger.getLogStatistics(Math.ceil(timeWindow / 60));
        
        return NextResponse.json({
          success: true,
          data: {
            statistics: logStats,
            timeWindow: `${Math.ceil(timeWindow / 60)} hour(s)`,
          },
        });

      case 'health':
        // Get current health status
        const healthData = {
          monitor: {
            initialized: true,
            uptime: process.uptime(),
          },
          performance: await instagramTranslationMonitor.getPerformanceSummary(5), // Last 5 minutes
          errors: await getInstagramErrorStatistics(1), // Last hour
          timestamp: new Date().toISOString(),
        };
        
        return NextResponse.json({
          success: true,
          data: healthData,
        });

      default:
        return NextResponse.json({
          success: false,
          error: 'Invalid action. Supported actions: summary, logs, log-statistics, health',
        }, { status: 400 });
    }

  } catch (error) {
    console.error('[Instagram Translation Monitoring API] Error:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      timestamp: new Date().toISOString(),
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, ...params } = body;

    switch (action) {
      case 'resolve-error':
        // Resolve a specific error
        const { errorId, resolution } = params;
        
        if (!errorId || !resolution) {
          return NextResponse.json({
            success: false,
            error: 'errorId and resolution are required',
          }, { status: 400 });
        }

        const { resolveInstagramError } = await import('@/lib/monitoring/instagram-error-tracker');
        const resolved = await resolveInstagramError(errorId, resolution);
        
        return NextResponse.json({
          success: true,
          data: {
            resolved,
            errorId,
            resolution,
            timestamp: new Date().toISOString(),
          },
        });

      case 'trigger-health-check':
        // Trigger a manual health check
        const performanceSummary = await instagramTranslationMonitor.getPerformanceSummary(5);
        const errorStatistics = await getInstagramErrorStatistics(1);
        
        // Determine health status based on metrics
        const isHealthy = 
          performanceSummary.translations.successRate > 90 &&
          performanceSummary.queue.failed < 10 &&
          errorStatistics.errorRate < 5;
        
        return NextResponse.json({
          success: true,
          data: {
            healthy: isHealthy,
            performance: performanceSummary,
            errors: errorStatistics,
            timestamp: new Date().toISOString(),
          },
        });

      default:
        return NextResponse.json({
          success: false,
          error: 'Invalid action. Supported actions: resolve-error, trigger-health-check',
        }, { status: 400 });
    }

  } catch (error) {
    console.error('[Instagram Translation Monitoring API] POST Error:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      timestamp: new Date().toISOString(),
    }, { status: 500 });
  }
}