import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { queueMonitor } from '../../../../lib/monitoring/queue-monitor';
import { validateInput, handleApiError, createSuccessResponse } from '../../../../lib/utils/api-helpers';

// Validation schemas
const QueueConfigSchema = z.object({
  name: z.string().min(1).max(255).regex(/^[a-zA-Z0-9_-]+$/),
  displayName: z.string().max(255).optional(),
  description: z.string().max(1000).optional(),
  priority: z.number().int().min(0).max(100).default(0),
  concurrency: z.number().int().min(1).max(1000).default(1),
  retryPolicy: z.object({
    attempts: z.number().int().min(1).max(10),
    backoff: z.enum(['fixed', 'exponential']),
    delay: z.number().int().min(0)
  }),
  cleanupPolicy: z.object({
    removeOnComplete: z.number().int().min(0).max(10000),
    removeOnFail: z.number().int().min(0).max(10000)
  }),
  alertThresholds: z.object({
    maxWaitingJobs: z.number().int().min(1).default(100),
    maxFailedJobs: z.number().int().min(1).default(50),
    maxProcessingTime: z.number().int().min(1000).default(30000),
    minSuccessRate: z.number().min(0).max(100).default(95)
  }).optional()
});

const QueueActionSchema = z.object({
  action: z.enum(['pause', 'resume', 'clean', 'retry_failed', 'clear_completed']),
  queueNames: z.array(z.string()).min(1).max(50),
  options: z.object({
    olderThan: z.number().int().min(0).optional(),
    limit: z.number().int().min(1).max(10000).optional()
  }).optional()
});

const QueueQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  status: z.enum(['all', 'healthy', 'warning', 'critical']).default('all'),
  sortBy: z.enum(['name', 'waiting', 'active', 'failed', 'throughput']).default('name'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
  timeWindow: z.coerce.number().int().min(1).max(1440).default(60) // minutes
});

/**
 * GET /api/admin/queues
 * Retrieve all queues with health metrics and performance stats
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const query = QueueQuerySchema.parse(Object.fromEntries(searchParams));

    // Get dashboard data
    const dashboard = queueMonitor.getQueueDashboard();
    
    // Add performance stats for each queue
    let queuesWithDetails = dashboard.queues.map(queue => ({
      ...queue,
      performance: queueMonitor.getQueuePerformanceStats(queue.name, query.timeWindow),
      status: determineQueueStatus(queue.health),
      health: {
        ...queue.health,
        timestamp: queue.health.timestamp.toISOString(),
      },
    }));

    // Apply filters
    if (query.search) {
      const searchLower = query.search.toLowerCase();
      queuesWithDetails = queuesWithDetails.filter(queue =>
        queue.name.toLowerCase().includes(searchLower) ||
        (queue.health as any).displayName?.toLowerCase().includes(searchLower)
      );
    }

    if (query.status !== 'all') {
      queuesWithDetails = queuesWithDetails.filter(queue => queue.status === query.status);
    }

    // Apply sorting
    queuesWithDetails.sort((a, b) => {
      let aValue: any, bValue: any;
      
      switch (query.sortBy) {
        case 'name':
          aValue = a.name;
          bValue = b.name;
          break;
        case 'waiting':
          aValue = a.health.waiting;
          bValue = b.health.waiting;
          break;
        case 'active':
          aValue = a.health.active;
          bValue = b.health.active;
          break;
        case 'failed':
          aValue = a.health.failed;
          bValue = b.health.failed;
          break;
        case 'throughput':
          aValue = a.performance?.throughput.jobsPerMinute || 0;
          bValue = b.performance?.throughput.jobsPerMinute || 0;
          break;
        default:
          aValue = a.name;
          bValue = b.name;
      }

      if (typeof aValue === 'string') {
        const comparison = aValue.localeCompare(bValue);
        return query.sortOrder === 'asc' ? comparison : -comparison;
      } else {
        return query.sortOrder === 'asc' ? aValue - bValue : bValue - aValue;
      }
    });

    // Apply pagination
    const total = queuesWithDetails.length;
    const startIndex = (query.page - 1) * query.limit;
    const endIndex = startIndex + query.limit;
    const paginatedQueues = queuesWithDetails.slice(startIndex, endIndex);

    return createSuccessResponse({
      overview: dashboard.overview,
      queues: paginatedQueues,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
        hasNext: endIndex < total,
        hasPrev: query.page > 1
      },
      filters: {
        search: query.search,
        status: query.status,
        sortBy: query.sortBy,
        sortOrder: query.sortOrder,
        timeWindow: query.timeWindow
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    return handleApiError(error, 'Failed to fetch queues');
  }
}

/**
 * POST /api/admin/queues
 * Create or register a new queue
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const config = QueueConfigSchema.parse(body);

    // TODO: Implement queue creation/registration
    // This would involve creating a new BullMQ queue with the specified configuration
    // and registering it with the queue monitor
    
    return createSuccessResponse({
      message: 'Queue creation endpoint - implementation pending',
      config
    }, 201);

  } catch (error) {
    return handleApiError(error, 'Failed to create queue');
  }
}

/**
 * PATCH /api/admin/queues
 * Perform batch operations on multiple queues
 */
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, queueNames, options } = QueueActionSchema.parse(body);

    const results: Array<{
      queueName: string;
      success: boolean;
      message: string;
      details?: any;
    }> = [];

    for (const queueName of queueNames) {
      try {
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
            // TODO: Implement retry failed jobs
            message = 'Retry failed jobs - implementation pending';
            break;
          
          case 'clear_completed':
            // TODO: Implement clear completed jobs
            message = 'Clear completed jobs - implementation pending';
            break;
          
          default:
            throw new Error(`Unknown action: ${action}`);
        }

        results.push({
          queueName,
          success: result,
          message,
          details
        });

      } catch (error) {
        results.push({
          queueName,
          success: false,
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const totalCount = results.length;

    return createSuccessResponse({
      action,
      summary: {
        total: totalCount,
        successful: successCount,
        failed: totalCount - successCount
      },
      results,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    return handleApiError(error, 'Failed to perform batch queue operation');
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