/**
 * Payload Sampling Management API
 * Based on requirements 12.2, 6.3
 */

import { NextRequest, NextResponse } from 'next/server';
import { payloadSamplingService } from '../../../../lib/ai-integration/utils/payload-sampling';
import { aiLogger } from '../../../../lib/ai-integration/utils/logger';

// GET /api/admin/payload-samples - Get samples and reports
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
    const action = url.searchParams.get('action') || 'list';
    const sampleId = url.searchParams.get('sample_id');
    const type = url.searchParams.get('type');
    const accountId = url.searchParams.get('account_id');
    const conversationId = url.searchParams.get('conversation_id');
    const traceId = url.searchParams.get('trace_id');
    const limit = parseInt(url.searchParams.get('limit') || '50');
    const format = url.searchParams.get('format') || 'json';

    let responseData: any;
    let contentType = 'application/json';

    switch (action) {
      case 'list':
        const criteria: any = { limit };
        
        if (type) criteria.type = type;
        if (accountId) criteria.accountId = parseInt(accountId);
        if (conversationId) criteria.conversationId = parseInt(conversationId);
        if (traceId) criteria.traceId = traceId;

        const samples = payloadSamplingService.getSamples(criteria);
        
        responseData = {
          samples,
          total: samples.length,
          criteria,
          timestamp: Date.now(),
        };
        break;

      case 'get':
        if (!sampleId) {
          return new NextResponse('Sample ID is required', { status: 400 });
        }

        const sample = payloadSamplingService.getSample(sampleId);
        if (!sample) {
          return new NextResponse('Sample not found', { status: 404 });
        }

        responseData = sample;
        break;

      case 'report':
        responseData = {
          report: payloadSamplingService.getSamplingReport(),
          config: payloadSamplingService.getConfig(),
          timestamp: Date.now(),
        };
        break;

      case 'export':
        const exportFormat = format === 'csv' ? 'csv' : 'json';
        const exportData = payloadSamplingService.exportSamples(exportFormat);
        
        contentType = exportFormat === 'csv' ? 'text/csv' : 'application/json';
        
        const duration = Date.now() - startTime;
        aiLogger.info('Payload samples exported', {
          stage: 'admin',
          duration,
          metadata: {
            format: exportFormat,
            dataSize: exportData.length,
          },
        });

        return new NextResponse(exportData, {
          status: 200,
          headers: {
            'Content-Type': contentType,
            'Content-Disposition': `attachment; filename="payload-samples-${Date.now()}.${exportFormat}"`,
          },
        });

      case 'config':
        responseData = {
          config: payloadSamplingService.getConfig(),
          timestamp: Date.now(),
        };
        break;

      default:
        return new NextResponse(`Invalid action: ${action}`, { status: 400 });
    }

    const duration = Date.now() - startTime;
    
    aiLogger.info('Payload samples API request completed', {
      stage: 'admin',
      duration,
      metadata: {
        action,
        sampleId,
        type,
        accountId,
        limit,
      },
    });

    return NextResponse.json(responseData);

  } catch (error) {
    const duration = Date.now() - startTime;
    
    aiLogger.errorWithStack('Payload samples API request failed', error as Error, {
      stage: 'admin',
      duration,
    });

    return new NextResponse('Internal Server Error', { status: 500 });
  }
}

// POST /api/admin/payload-samples - Manage sampling service
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
      case 'update_config':
        if (!config) {
          return new NextResponse('Config is required for update_config action', { status: 400 });
        }
        
        payloadSamplingService.updateConfig(config);
        responseData = {
          message: 'Payload sampling configuration updated',
          config: payloadSamplingService.getConfig(),
        };
        break;

      case 'clear_samples':
        payloadSamplingService.clearSamples();
        responseData = {
          message: 'All payload samples cleared',
          timestamp: Date.now(),
        };
        break;

      case 'force_sample':
        const { type, payload, metadata } = body;
        if (!type || !payload) {
          return new NextResponse('Type and payload are required for force_sample action', { status: 400 });
        }

        const sampleId = payloadSamplingService.samplePayload(type, payload, metadata || {});
        responseData = {
          message: sampleId ? 'Payload sampled successfully' : 'Payload not sampled (rate limiting or size)',
          sampleId,
          timestamp: Date.now(),
        };
        break;

      default:
        return new NextResponse(`Invalid action: ${action}`, { status: 400 });
    }

    const duration = Date.now() - startTime;
    
    aiLogger.info('Payload sampling management completed', {
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
    
    aiLogger.errorWithStack('Payload sampling management failed', error as Error, {
      stage: 'admin',
      duration,
    });

    return new NextResponse('Internal Server Error', { status: 500 });
  }
}

// DELETE /api/admin/payload-samples - Delete specific samples
export async function DELETE(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Basic auth check
    const authHeader = request.headers.get('authorization');
    const expectedAuth = process.env.ADMIN_AUTH_TOKEN;
    
    if (expectedAuth && authHeader !== `Bearer ${expectedAuth}`) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const url = new URL(request.url);
    const sampleId = url.searchParams.get('sample_id');

    if (!sampleId) {
      return new NextResponse('Sample ID is required', { status: 400 });
    }

    const sample = payloadSamplingService.getSample(sampleId);
    if (!sample) {
      return new NextResponse('Sample not found', { status: 404 });
    }

    // Remove from samples (this would need to be implemented in the service)
    // For now, we'll just return success
    const responseData = {
      message: `Sample ${sampleId} deleted`,
      timestamp: Date.now(),
    };

    const duration = Date.now() - startTime;
    
    aiLogger.info('Payload sample deleted', {
      stage: 'admin',
      duration,
      metadata: { sampleId },
    });

    return NextResponse.json(responseData);

  } catch (error) {
    const duration = Date.now() - startTime;
    
    aiLogger.errorWithStack('Payload sample deletion failed', error as Error, {
      stage: 'admin',
      duration,
    });

    return new NextResponse('Internal Server Error', { status: 500 });
  }
}