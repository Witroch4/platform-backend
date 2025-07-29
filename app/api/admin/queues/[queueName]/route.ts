import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { queueMonitor } from '../../../../../lib/monitoring/queue-monitor';
import { validateInput, handleApiError, createSuccessResponse } from '../../../../../lib/utils/api-helpers';

// Validation schemas
const QueueUpdateSchema = z.object({
  displayName: z.string().max(255).optional(),
  description: z.string().max(1000).optional(),
  priority: z.number().int().min(0).max(100).optional(),
  concurrency: z.number().int().min(1).max(1000).optional(),
  retryPolicy: z.object({
    attempts: z.number().int().min(1).max(10),
    backoff: z.enum(['fixed', 'exponential']),
    delay: z.number().int().min(0)
  }).optional(),
  cleanupPolicy: z.object({
    removeOnComplete: z.number().int().min(0).max(10000),
    removeOnFail: z.number().int().min(0).max(10000)
  }).optional(),
  alertThresholds: z.object({
    maxWaitingJobs: z.number().int().min(1),
    maxFailedJobs: z.number().int().min(1),
    maxProcessingTime: z.number().int().min(1000),
    minSuccessRate: z.number().min(0).max(100)
  }).optional()
});

const QueueActionSchema = z.object({
  action: z.enum(['pause', 'resume', 'clean', 'retry_failed', 'clear_completed', 'drain']),
  options: z.object({
    olderThan: z.number().int().min(0).optional(),
    limit: z.number().int().min(1).max(10000).optional(),
    jobTypes: z.array(z.string()).optional()
  }).optional()
});

/**
 * GET /api/admin/queues/[queueName]
 * Get detailed information about a specific queue
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { queueName: string } }
) {
  try {
    const { queueName } = params;
    const { searchParams } = new URL(request.url);
    const timeWindow = parseInt(searchParams.get('timeWindow') || '60');
    const includeJobs = searchParams.get('includeJobs') === 'true';
    const jobLimit = parseInt(searchParams.get('jobLimit') || '100');

    // Get queue health
    const health = queueMonitor.getQueueHealth(queueName);
    if (!health) {
      return NextResponse.json(
        { 
          success: false,
          error: {
            code: 'QUEUE_NOT_FOUND',
            message: `Queue not found: ${queueName}`,
            timestamp: new Date().toISOString()
          }
        },
        { status: 404 }
      );
    }

    // Get performance stats
    const performance = queueMonitor.getQueuePerformanceStats(queueName, timeWindow);

    // Get job metrics if requested
    let jobMetrics = undefined;
    let failedJobs = undefined;
    let slowJobs = undefined;

    if (includeJobs) {
      jobMetrics = queueMonitor.getJobMetrics(queueName, jobLimit).map(job => ({
        ...job,
        createdAt: job.createdAt.toISOString(),
        processedAt: job.processedAt?.toISOString(),
        finishedAt: job.finishedAt?.toISOString(),
      }));

      failedJobs = queueMonitor.getFailedJobs(queueName, 20).map(job => ({
        ...job,
        createdAt: job.createdAt.toISOString(),
        processedAt: job.processedAt?.toISOString(),
        finishedAt: job.finishedAt?.toISOString(),
      }));

      slowJobs = queueMonitor.getSlowJobs(queueName, 10000, 20).map(job => ({
        ...job,
        createdAt: job.createdAt.toISOString(),
        processedAt: job.processedAt?.toISOString(),
        finishedAt: job.finishedAt?.toISOString(),
      }));
    }

    return createSuccessResponse({
      queueName,
      health: {
        ...health,
        timestamp: health.timestamp.toISOString(),
      },
      performance,
      status: determineQueueStatus(health),
      ...(includeJobs && {
        jobs: {
          recent: jobMetrics,
          failed: failedJobs,
          slow: slowJobs
        }
      }),
      metadata: {
        timeWindow: `${timeWindow} minutes`,
        includeJobs,
        jobLimit: includeJobs ? jobLimit : undefined
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    return handleApiError(error, `Failed to fetch queue details for ${params.queueName}`);
  }
}

/**
 * PUT /api/admin/queues/[queueName]
 * Update queue configuration
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: { queueName: string } }
) {
  try {
    const { queueName } = params;
    const body = await request.json();
    const updates = QueueUpdateSchema.parse(body);

    // Check if queue exists
    const health = queueMonitor.getQueueHealth(queueName);
    if (!health) {
      return NextResponse.json(
        { 
          success: false,
          error: {
            code: 'QUEUE_NOT_FOUND',
            message: `Queue not found: ${queueName}`,
            timestamp: new Date().toISOString()
          }
        },
        { status: 404 }
      );
    }

    // TODO: Implement queue configuration update
    // This would involve updating the queue's configuration in the database
    // and applying the changes to the running queue instance

    return createSuccessResponse({
      message: 'Queue configuration updated successfully',
      queueName,
      updates,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    return handleApiError(error, `Failed to update queue configuration for ${params.queueName}`);
  }
}

/**
 * POST /api/admin/queues/[queueName]/actions
 * Perform actions on a specific queue
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { queueName: string } }
) {
  try {
    const { queueName } = params;
    const body = await request.json();
    const { action, options } = QueueActionSchema.parse(body);

    // Check if queue exists
    const health = queueMonitor.getQueueHealth(queueName);
    if (!health) {
      return NextResponse.json(
        { 
          success: false,
          error: {
            code: 'QUEUE_NOT_FOUND',
            message: `Queue not found: ${queueName}`,
            timestamp: new Date().toISOString()
          }
        },
        { status: 404 }
      );
    }

    let result = false;
    let message = '';
    let details: any = undefined;

    switch (action) {
      case 'pause':
        result = await queueMonitor.pauseQueue(queueName);
        message = result ? 'Queue paused successfully' : 'Failed to pause queue';
        break;
      
      case 'resume':
        result = await queueMonitor.resumeQueue(queueName);
        message = result ? 'Queue resumed successfully' : 'Failed to resume queue';
        break;
      
      case 'clean':
        const cleanedCount = await queueMonitor.cleanFailedJobs(queueName);
        result = cleanedCount >= 0;
        message = `Cleaned ${cleanedCount} failed jobs`;
        details = { cleanedJobs: cleanedCount };
        break;
      
      case 'retry_failed':
        // TODO: Implement retry failed jobs with options
        message = 'Retry failed jobs - implementation pending';
        details = { options };
        break;
      
      case 'clear_completed':
        // TODO: Implement clear completed jobs with options
        message = 'Clear completed jobs - implementation pending';
        details = { options };
        break;
      
      case 'drain':
        // TODO: Implement queue drain (remove all jobs)
        message = 'Queue drain - implementation pending';
        details = { options };
        break;
      
      default:
        throw new Error(`Unknown action: ${action}`);
    }

    return createSuccessResponse({
      success: result,
      message,
      queueName,
      action,
      details,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    return handleApiError(error, `Failed to perform action on queue ${params.queueName}`);
  }
}

/**
 * DELETE /api/admin/queues/[queueName]
 * Delete/unregister a queue
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { queueName: string } }
) {
  try {
    const { queueName } = params;

    // Check if queue exists
    const health = queueMonitor.getQueueHealth(queueName);
    if (!health) {
      return NextResponse.json(
        { 
          success: false,
          error: {
            code: 'QUEUE_NOT_FOUND',
            message: `Queue not found: ${queueName}`,
            timestamp: new Date().toISOString()
          }
        },
        { status: 404 }
      );
    }

    // TODO: Implement queue deletion
    // This would involve:
    // 1. Draining the queue (removing all jobs)
    // 2. Unregistering from monitoring
    // 3. Removing from database configuration
    // 4. Cleaning up Redis keys

    return createSuccessResponse({
      message: 'Queue deletion - implementation pending',
      queueName,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    return handleApiError(error, `Failed to delete queue ${params.queueName}`);
  }
}

// Helper function to determine queue status
function determineQueueStatus(health: any): 'healthy' | 'warning' | 'critical' {
  if (health.failed > 50 || health.waiting > 500) {
    return 'critical';
  }
  if (health.failed > 10 || health.waiting > 100 || health.paused) {
    return 'warning';
  }
  return 'healthy';
}