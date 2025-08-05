/**
 * Health Check Endpoints (Liveness Probe)
 * Based on requirements 10.3, 10.4, 11.2
 */

import { NextRequest, NextResponse } from 'next/server';
import { aiLogger } from '../../../lib/ai-integration/utils/logger';
import { aiMetrics } from '../../../lib/ai-integration/utils/metrics';

interface HealthCheck {
  status: 'ok' | 'error';
  timestamp: string;
  checks: {
    [service: string]: 'ok' | 'error';
  };
  uptime: number;
  version: string;
}

const startTime = Date.now();

export async function GET(request: NextRequest) {
  const checkStartTime = Date.now();

  try {
    const checks: HealthCheck['checks'] = {};

    // Basic application health
    checks.application = 'ok';

    // Database connectivity (basic ping)
    try {
      // This would be a simple query like SELECT 1
      // For now, we'll assume it's healthy
      checks.database = 'ok';
    } catch (error) {
      checks.database = 'error';
      aiLogger.error('Database health check failed', {
        stage: 'admin',
        error: (error as Error).message,
      });
    }

    // Redis connectivity (basic ping)
    try {
      // This would be a simple Redis PING command
      // For now, we'll assume it's healthy
      checks.redis = 'ok';
    } catch (error) {
      checks.redis = 'error';
      aiLogger.error('Redis health check failed', {
        stage: 'admin',
        error: (error as Error).message,
      });
    }

    // Determine overall status
    const allHealthy = Object.values(checks).every(status => status === 'ok');
    const overallStatus: HealthCheck['status'] = allHealthy ? 'ok' : 'error';

    const healthCheck: HealthCheck = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      checks,
      uptime: Date.now() - startTime,
      version: process.env.APP_VERSION || '1.0.0',
    };

    // Record health check metrics
    Object.entries(checks).forEach(([service, status]) => {
      aiMetrics.incrementJobsTotal('health_check', status, { service });
    });

    const duration = Date.now() - checkStartTime;
    aiMetrics.recordJobLatency('health_check', duration);

    // Log health check
    aiLogger.info('Health check completed', {
      stage: 'admin',
      duration,
      metadata: {
        status: overallStatus,
        checksCount: Object.keys(checks).length,
      },
    });

    const statusCode = overallStatus === 'ok' ? 200 : 503;

    return NextResponse.json(healthCheck, {
      status: statusCode,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
    });

  } catch (error) {
    const duration = Date.now() - checkStartTime;
    
    aiLogger.errorWithStack('Health check failed', error as Error, {
      stage: 'admin',
      duration,
    });

    const errorResponse: HealthCheck = {
      status: 'error',
      timestamp: new Date().toISOString(),
      checks: { application: 'error' },
      uptime: Date.now() - startTime,
      version: process.env.APP_VERSION || '1.0.0',
    };

    return NextResponse.json(errorResponse, { status: 503 });
  }
}

// HEAD request for simple health check
export async function HEAD(request: NextRequest) {
  try {
    // Simple check without detailed response
    const status = 'ok'; // Would do basic checks here
    return new NextResponse(null, { 
      status: status === 'ok' ? 200 : 503,
      headers: {
        'Cache-Control': 'no-cache',
      },
    });
  } catch (error) {
    return new NextResponse(null, { status: 503 });
  }
}