/**
 * Feature Flag Metrics API
 * Based on requirements 16.1, 16.2, 16.3, 16.4
 */

import { NextRequest, NextResponse } from 'next/server';
import { getRedisInstance } from '@/lib/connections';
import { FeatureFlagManager } from '@/lib/ai-integration/services/feature-flag-manager';
import { AI_FEATURE_FLAGS } from '@/lib/ai-integration/types/feature-flags';
import log from '@/lib/log';

// GET /api/admin/feature-flags/metrics - Get feature flag metrics
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const flagId = searchParams.get('flagId');

    const redis = getRedisInstance();
    const flagManager = new FeatureFlagManager(redis);

    if (flagId) {
      // Get metrics for specific flag
      const metrics = await flagManager.getMetrics(flagId);
      
      return NextResponse.json({
        success: true,
        data: metrics
      });
    }

    // Get metrics for all AI feature flags
    const allMetrics = await Promise.all(
      Object.entries(AI_FEATURE_FLAGS).map(async ([key, flagId]) => {
        try {
          const metrics = await flagManager.getMetrics(flagId);
          return {
            key,
            ...metrics
          };
        } catch (error) {
          log.error('Error getting metrics for flag', { flagId, error });
          return {
            key,
            flagId,
            evaluations: 0,
            enabledCount: 0,
            disabledCount: 0,
            errorCount: 0,
            lastEvaluatedAt: new Date(),
            averageLatencyMs: 0
          };
        }
      })
    );

    return NextResponse.json({
      success: true,
      data: { metrics: allMetrics }
    });

  } catch (error) {
    log.error('Error in feature flag metrics API', { error });
    
    return NextResponse.json({
      success: false,
      error: 'Internal server error'
    }, { status: 500 });
  }
}