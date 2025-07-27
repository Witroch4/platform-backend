import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { Redis } from 'ioredis';
import { FeatureFlagManager } from '@/lib/feature-flags/feature-flag-manager';

const prisma = new PrismaClient();
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      flagName, 
      targetPercentage, 
      incrementPercentage = 10, 
      intervalMinutes = 30 
    } = body;

    if (!flagName || targetPercentage === undefined) {
      return NextResponse.json(
        { error: 'Flag name and target percentage are required' },
        { status: 400 }
      );
    }

    if (targetPercentage < 0 || targetPercentage > 100) {
      return NextResponse.json(
        { error: 'Target percentage must be between 0 and 100' },
        { status: 400 }
      );
    }

    const featureFlagManager = FeatureFlagManager.getInstance(prisma, redis);
    
    // Start gradual rollout (this will run asynchronously)
    featureFlagManager.gradualRollout(
      flagName,
      targetPercentage,
      incrementPercentage,
      intervalMinutes
    ).catch(error => {
      console.error(`[FeatureFlags API] Gradual rollout failed for ${flagName}:`, error);
    });

    return NextResponse.json({
      success: true,
      message: `Gradual rollout started for ${flagName}`,
      details: {
        flagName,
        targetPercentage,
        incrementPercentage,
        intervalMinutes,
      },
    });
  } catch (error) {
    console.error('[FeatureFlags API] Error starting gradual rollout:', error);
    return NextResponse.json(
      { error: 'Failed to start gradual rollout' },
      { status: 500 }
    );
  }
}