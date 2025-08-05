/**
 * Worker Health Check API
 * Requirements: 11.2
 */

import { NextResponse } from 'next/server';
import { getWorkerHealth } from '@/lib/ai-integration/workers';
import { getQueueStats } from '@/lib/ai-integration/queues/manager';
import { getDLQStats } from '@/lib/ai-integration/queues/dlq';

export async function GET() {
  try {
    // Get worker health
    const workerHealth = getWorkerHealth();
    
    // Get queue statistics
    const queueStats = await getQueueStats();
    
    // Get DLQ statistics
    const dlqStats = await getDLQStats();

    // Determine overall health
    const isHealthy = workerHealth.initialized && 
                     workerHealth.workers.aiMessage.active && 
                     workerHealth.workers.embeddingUpsert.active;

    const response = {
      status: isHealthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      workers: workerHealth,
      queues: queueStats,
      dlq: dlqStats,
    };

    return NextResponse.json(response, {
      status: isHealthy ? 200 : 503,
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: 'error',
        timestamp: new Date().toISOString(),
        error: 'Failed to check worker health',
      },
      { status: 500 }
    );
  }
}