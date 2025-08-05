/**
 * Admin API for Queue Management
 * Requirements: 7.2, 10.4
 */

import { NextRequest, NextResponse } from 'next/server';
import { 
  getQueueStats, 
  pauseAllQueues, 
  resumeAllQueues,
  getAiMessageQueue,
  getEmbeddingUpsertQueue
} from '@/lib/ai-integration/queues/manager';
import { aiLogger as logger }from '@/lib/ai-integration/utils/logger';

// GET /api/admin/queues - Get queue statistics
export async function GET(request: NextRequest) {
  try {
    const stats = await getQueueStats();
    
    return NextResponse.json({
      success: true,
      data: stats,
      timestamp: Date.now(),
    });
  } catch (error) {
    logger.error('Failed to get queue stats', {
      stage: 'admin',
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST /api/admin/queues - Queue control actions
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, queue } = body;

    if (!action) {
      return NextResponse.json(
        { success: false, error: 'Action is required' },
        { status: 400 }
      );
    }

    switch (action) {
      case 'pause':
        if (queue === 'all') {
          await pauseAllQueues();
          logger.info('All queues paused via admin API');
          return NextResponse.json({ success: true, message: 'All queues paused' });
        } else if (queue === 'ai-message') {
          const aiQueue = getAiMessageQueue();
          await aiQueue.pause();
          logger.info('AI message queue paused via admin API');
          return NextResponse.json({ success: true, message: 'AI message queue paused' });
        } else if (queue === 'embedding-upsert') {
          const embeddingQueue = getEmbeddingUpsertQueue();
          await embeddingQueue.pause();
          logger.info('Embedding upsert queue paused via admin API');
          return NextResponse.json({ success: true, message: 'Embedding upsert queue paused' });
        }
        break;

      case 'resume':
        if (queue === 'all') {
          await resumeAllQueues();
          logger.info('All queues resumed via admin API');
          return NextResponse.json({ success: true, message: 'All queues resumed' });
        } else if (queue === 'ai-message') {
          const aiQueue = getAiMessageQueue();
          await aiQueue.resume();
          logger.info('AI message queue resumed via admin API');
          return NextResponse.json({ success: true, message: 'AI message queue resumed' });
        } else if (queue === 'embedding-upsert') {
          const embeddingQueue = getEmbeddingUpsertQueue();
          await embeddingQueue.resume();
          logger.info('Embedding upsert queue resumed via admin API');
          return NextResponse.json({ success: true, message: 'Embedding upsert queue resumed' });
        }
        break;

      default:
        return NextResponse.json(
          { success: false, error: 'Invalid action' },
          { status: 400 }
        );
    }

    return NextResponse.json(
      { success: false, error: 'Invalid queue specified' },
      { status: 400 }
    );
  } catch (error) {
    logger.error('Failed to execute queue action', {
      stage: 'admin',
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}