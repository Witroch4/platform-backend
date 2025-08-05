/**
 * SLO Management API Endpoint
 * Based on requirements 11.1, 11.2
 */

import { NextRequest, NextResponse } from 'next/server';
import { sloMeasurementService } from '../../../../lib/ai-integration/utils/slo-measurement';
import { sloMeasurementJob } from '../../../../lib/ai-integration/jobs/slo-measurement-job';
import { aiLogger } from '../../../../lib/ai-integration/utils/logger';

// GET /api/admin/slo - Get SLO reports and status
export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Basic auth check
    const authHeader = request.headers.get('authorization');
    const expectedAuth = process.env.ADMIN_AUTH_TOKEN;
    
    if (expectedAuth && authHeader !== `Bearer ${expectedAuth}`) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const url = new URL(request.url);
    const action = url.searchParams.get('action') || 'report';
    const windowMinutes = parseInt(url.searchParams.get('window') || '60');
    const accountId = url.searchParams.get('account_id');
    const channel = url.searchParams.get('channel');

    let responseData: any;

    switch (action) {
      case 'report':
        if (accountId) {
          responseData = sloMeasurementService.generateAccountSLOReport(
            parseInt(accountId),
            windowMinutes
          );
        } else if (channel) {
          responseData = sloMeasurementService.generateChannelSLOReport(
            channel,
            windowMinutes
          );
        } else {
          responseData = sloMeasurementService.generateSLOReport(windowMinutes);
        }
        break;

      case 'targets':
        responseData = {
          targets: sloMeasurementService.getSLOTargets(),
          timestamp: Date.now(),
        };
        break;

      case 'violations':
        const violationWindow = parseInt(url.searchParams.get('violation_window') || '5');
        responseData = {
          violations: sloMeasurementService.checkCurrentSLOViolations(violationWindow),
          windowMinutes: violationWindow,
          timestamp: Date.now(),
        };
        break;

      case 'burn_rate':
        const sloName = url.searchParams.get('slo');
        if (!sloName) {
          return new NextResponse('SLO name is required for burn rate calculation', { status: 400 });
        }
        
        try {
          responseData = {
            slo: sloName,
            ...sloMeasurementService.calculateSLOBurnRate(sloName, windowMinutes),
            windowMinutes,
            timestamp: Date.now(),
          };
        } catch (error) {
          return new NextResponse(`Invalid SLO name: ${sloName}`, { status: 400 });
        }
        break;

      case 'trend':
        const hours = parseInt(url.searchParams.get('hours') || '24');
        responseData = {
          trend: sloMeasurementService.getSLOComplianceTrend(hours),
          hours,
          timestamp: Date.now(),
        };
        break;

      case 'job_status':
        responseData = {
          job: sloMeasurementJob.getStatus(),
          timestamp: Date.now(),
        };
        break;

      default:
        return new NextResponse(`Invalid action: ${action}`, { status: 400 });
    }

    const duration = Date.now() - startTime;
    
    aiLogger.info('SLO API request completed', {
      stage: 'admin',
      duration,
      metadata: {
        action,
        windowMinutes,
        accountId,
        channel,
      },
    });

    return NextResponse.json(responseData);

  } catch (error) {
    const duration = Date.now() - startTime;
    
    aiLogger.errorWithStack('SLO API request failed', error as Error, {
      stage: 'admin',
      duration,
    });

    return new NextResponse('Internal Server Error', { status: 500 });
  }
}

// POST /api/admin/slo - Control SLO measurement job
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Basic auth check
    const authHeader = request.headers.get('authorization');
    const expectedAuth = process.env.ADMIN_AUTH_TOKEN;
    
    if (expectedAuth && authHeader !== `Bearer ${expectedAuth}`) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const body = await request.json();
    const { action, config } = body;

    let responseData: any;

    switch (action) {
      case 'start':
        sloMeasurementJob.start();
        responseData = {
          message: 'SLO measurement job started',
          status: sloMeasurementJob.getStatus(),
        };
        break;

      case 'stop':
        sloMeasurementJob.stop();
        responseData = {
          message: 'SLO measurement job stopped',
          status: sloMeasurementJob.getStatus(),
        };
        break;

      case 'force_run':
        await sloMeasurementJob.forceMeasurement();
        responseData = {
          message: 'SLO measurement forced',
          timestamp: Date.now(),
        };
        break;

      case 'update_config':
        if (!config) {
          return new NextResponse('Config is required for update_config action', { status: 400 });
        }
        
        sloMeasurementJob.updateConfig(config);
        responseData = {
          message: 'SLO measurement job configuration updated',
          status: sloMeasurementJob.getStatus(),
        };
        break;

      default:
        return new NextResponse(`Invalid action: ${action}`, { status: 400 });
    }

    const duration = Date.now() - startTime;
    
    aiLogger.info('SLO job control completed', {
      stage: 'admin',
      duration,
      metadata: {
        action,
        config: config ? Object.keys(config) : undefined,
      },
    });

    return NextResponse.json(responseData);

  } catch (error) {
    const duration = Date.now() - startTime;
    
    aiLogger.errorWithStack('SLO job control failed', error as Error, {
      stage: 'admin',
      duration,
    });

    return new NextResponse('Internal Server Error', { status: 500 });
  }
}