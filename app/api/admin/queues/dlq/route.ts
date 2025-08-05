/**
 * Admin API for Dead Letter Queue Management
 * Requirements: 7.2, 7.3
 */

import { NextRequest, NextResponse } from 'next/server';
import { 
  getDLQItems, 
  getDLQStats, 
  removeFromDLQ, 
  clearDLQ, 
  reprocessDLQItem 
} from '@/lib/ai-integration/queues/dlq';
import { aiLogger as logger } from '@/lib/ai-integration/utils/logger';

// GET /api/admin/queues/dlq - Get DLQ items and stats
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const queueType = searchParams.get('queue') as 'ai-message' | 'embedding-upsert' | null;
    const action = (searchParams.get('action') as string) || 'list';

    if (action === 'stats') {
      const stats = await getDLQStats();
      return NextResponse.json({ success: true, data: stats });
    }

    if (!queueType) {
      return NextResponse.json(
        { success: false, error: 'Queue type is required' },
        { status: 400 }
      );
    }

    const offset = parseInt(searchParams.get('offset') as string || '0');
    const limit = parseInt(searchParams.get('limit') as string || '50');
    const fromTime = searchParams.get('fromTime') ? parseInt(searchParams.get('fromTime') as string) : undefined;
    const toTime = searchParams.get('toTime') ? parseInt(searchParams.get('toTime') as string) : undefined;

    const items = await getDLQItems(queueType, { offset, limit, fromTime, toTime });

    return NextResponse.json({
      success: true,
      data: {
        items,
        pagination: { offset, limit },
      },
    });
  } catch (error) {
    logger.error('Failed to get DLQ data');
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST /api/admin/queues/dlq - Reprocess DLQ item
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, queueType, jobId, reason, reprocessedBy } = body;

    if (!queueType || !['ai-message', 'embedding-upsert'].includes(queueType)) {
      return NextResponse.json(
        { success: false, error: 'Invalid queue type' },
        { status: 400 }
      );
    }

    if (action === 'reprocess') {
      if (!jobId || !reason || !reprocessedBy) {
        return NextResponse.json(
          { success: false, error: 'jobId, reason, and reprocessedBy are required for reprocessing' },
          { status: 400 }
        );
      }

      const success = await reprocessDLQItem(queueType, jobId, reason, reprocessedBy);
      
      if (success) {
        logger.info('DLQ item reprocessed via admin API');
        return NextResponse.json({ success: true, message: 'Item reprocessed successfully' });
      } else {
        return NextResponse.json(
          { success: false, error: 'Item not found or failed to reprocess' },
          { status: 404 }
        );
      }
    }

    return NextResponse.json(
      { success: false, error: 'Invalid action' },
      { status: 400 }
    );
  } catch (error) {
    logger.error('Failed to process DLQ action');
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE /api/admin/queues/dlq - Remove or clear DLQ items
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const queueType = searchParams.get('queue') as 'ai-message' | 'embedding-upsert' | null;
    const jobId = searchParams.get('jobId') as string | null;
    const action = (searchParams.get('action') as string) || 'remove';

    if (!queueType || !['ai-message', 'embedding-upsert'].includes(queueType)) {
      return NextResponse.json(
        { success: false, error: 'Invalid queue type' },
        { status: 400 }
      );
    }

    if (action === 'clear') {
      const removedCount = await clearDLQ(queueType);
      logger.info('DLQ cleared via admin API');
      return NextResponse.json({ 
        success: true, 
        message: `Cleared ${removedCount} items from DLQ` 
      });
    }

    if (action === 'remove') {
      if (!jobId) {
        return NextResponse.json(
          { success: false, error: 'jobId is required for removing specific item' },
          { status: 400 }
        );
      }

      const success = await removeFromDLQ(queueType, jobId);
      
      if (success) {
        logger.info('DLQ item removed via admin API');
        return NextResponse.json({ success: true, message: 'Item removed successfully' });
      } else {
        return NextResponse.json(
          { success: false, error: 'Item not found' },
          { status: 404 }
        );
      }
    }

    return NextResponse.json(
      { success: false, error: 'Invalid action' },
      { status: 400 }
    );
  } catch (error) {
    logger.error('Failed to delete DLQ item');
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}