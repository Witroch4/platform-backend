import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { validateInput, handleApiError, createSuccessResponse } from '../../../../../../lib/utils/api-helpers';
import { webhookManager } from '../../../../../../lib/webhook/webhook-manager';

// Validation schemas
const DeliveryQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(1000).default(50),
  status: z.enum(['all', 'success', 'failed', 'pending', 'retrying']).default('all'),
  eventType: z.string().optional(),
  timeRange: z.enum(['1h', '6h', '24h', '7d', '30d']).default('24h'),
  sortBy: z.enum(['createdAt', 'deliveredAt', 'attempts', 'responseTime']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc')
});

const DeliveryActionSchema = z.object({
  action: z.enum(['retry', 'cancel', 'mark_success']),
  deliveryIds: z.array(z.string().uuid()).min(1).max(100)
});

/**
 * GET /api/admin/webhooks/[webhookId]/deliveries
 * Get webhook delivery history with filtering and pagination
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ webhookId: string }> }
) {
  try {
    const { webhookId } = await params;
    const { searchParams } = new URL(request.url);
    const query = DeliveryQuerySchema.parse(Object.fromEntries(searchParams));

    // Check if webhook exists
    const webhook = await webhookManager.getWebhook(webhookId);
    if (!webhook) {
      return NextResponse.json(
        { 
          success: false,
          error: {
            code: 'WEBHOOK_NOT_FOUND',
            message: `Webhook not found: ${webhookId}`,
            timestamp: new Date().toISOString()
          }
        },
        { status: 404 }
      );
    }

    // Calculate time range
    const timeRangeMs = getTimeRangeMs(query.timeRange);
    const startTime = new Date(Date.now() - timeRangeMs);

    const deliveries = await webhookManager.getWebhookDeliveries(webhookId, {
      page: query.page,
      limit: query.limit,
      status: query.status === 'all' ? undefined : query.status,
      eventType: query.eventType,
      startTime,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder
    });

    // Calculate summary statistics
    const allDeliveries = await webhookManager.getWebhookDeliveries(webhookId, {
      startTime,
      limit: 10000 // Get all for stats
    });

    const summary = {
      total: allDeliveries.items.length,
      byStatus: {
        success: allDeliveries.items.filter(d => d.status === 'success').length,
        failed: allDeliveries.items.filter(d => d.status === 'failed').length,
        pending: allDeliveries.items.filter(d => d.status === 'pending').length,
        retrying: allDeliveries.items.filter(d => d.status === 'retrying').length,
      },
      averageResponseTime: calculateAverageResponseTime(allDeliveries.items),
      successRate: calculateSuccessRate(allDeliveries.items)
    };

    return createSuccessResponse({
      webhook: {
        id: webhook.id,
        name: webhook.name,
        url: webhook.url,
        enabled: webhook.enabled
      },
      deliveries: deliveries.items,
      summary,
      pagination: deliveries.pagination,
      filters: {
        status: query.status,
        eventType: query.eventType,
        timeRange: query.timeRange,
        sortBy: query.sortBy,
        sortOrder: query.sortOrder
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    return handleApiError(error, `Failed to fetch webhook deliveries for ${params.webhookId}`);
  }
}

/**
 * POST /api/admin/webhooks/[webhookId]/deliveries/actions
 * Perform batch actions on webhook deliveries
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ webhookId: string }> }
) {
  try {
    const { webhookId } = await params;
    const body = await request.json();
    const { action, deliveryIds } = DeliveryActionSchema.parse(body);

    // Check if webhook exists
    const webhook = await webhookManager.getWebhook(webhookId);
    if (!webhook) {
      return NextResponse.json(
        { 
          success: false,
          error: {
            code: 'WEBHOOK_NOT_FOUND',
            message: `Webhook not found: ${webhookId}`,
            timestamp: new Date().toISOString()
          }
        },
        { status: 404 }
      );
    }

    const results: Array<{
      deliveryId: string;
      success: boolean;
      message: string;
      details?: any;
    }> = [];

    for (const deliveryId of deliveryIds) {
      try {
        let result = false;
        let message = '';
        let details: any = undefined;

        switch (action) {
          case 'retry':
            result = await webhookManager.retryDelivery(deliveryId);
            message = result ? 'Delivery retry initiated' : 'Failed to retry delivery';
            break;
          
          case 'cancel':
            result = await webhookManager.cancelDelivery(deliveryId);
            message = result ? 'Delivery cancelled' : 'Failed to cancel delivery';
            break;
          
          case 'mark_success':
            result = await webhookManager.markDeliverySuccess(deliveryId);
            message = result ? 'Delivery marked as successful' : 'Failed to mark delivery as successful';
            break;
          
          default:
            throw new Error(`Unknown action: ${action}`);
        }

        results.push({
          deliveryId,
          success: result,
          message,
          details
        });

      } catch (error) {
        results.push({
          deliveryId,
          success: false,
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const totalCount = results.length;

    return createSuccessResponse({
      action,
      webhookId,
      summary: {
        total: totalCount,
        successful: successCount,
        failed: totalCount - successCount
      },
      results,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    return handleApiError(error, `Failed to perform batch action on webhook deliveries for ${params.webhookId}`);
  }
}

// Helper functions
function getTimeRangeMs(timeRange: string): number {
  switch (timeRange) {
    case '1h': return 60 * 60 * 1000;
    case '6h': return 6 * 60 * 60 * 1000;
    case '24h': return 24 * 60 * 60 * 1000;
    case '7d': return 7 * 24 * 60 * 60 * 1000;
    case '30d': return 30 * 24 * 60 * 60 * 1000;
    default: return 24 * 60 * 60 * 1000;
  }
}

function calculateAverageResponseTime(deliveries: any[]): number {
  const successfulDeliveries = deliveries.filter(d => 
    d.status === 'success' && d.responseTime !== undefined && d.responseTime !== null
  );
  
  if (successfulDeliveries.length === 0) return 0;
  
  const sum = successfulDeliveries.reduce((acc, d) => acc + d.responseTime, 0);
  return Math.round((sum / successfulDeliveries.length) * 100) / 100;
}

function calculateSuccessRate(deliveries: any[]): number {
  if (deliveries.length === 0) return 0;
  
  const completedDeliveries = deliveries.filter(d => 
    d.status === 'success' || d.status === 'failed'
  );
  
  if (completedDeliveries.length === 0) return 0;
  
  const successfulDeliveries = completedDeliveries.filter(d => d.status === 'success');
  return Math.round((successfulDeliveries.length / completedDeliveries.length) * 10000) / 100;
}