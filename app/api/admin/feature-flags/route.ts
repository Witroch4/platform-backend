import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { Redis } from 'ioredis';
import { FeatureFlagManager } from '@/lib/feature-flags/feature-flag-manager';
import { RollbackManager } from '@/lib/feature-flags/rollback-manager';

const prisma = new PrismaClient();
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

export async function GET(request: NextRequest) {
  try {
    const featureFlagManager = FeatureFlagManager.getInstance(prisma, redis);
    const flags = await featureFlagManager.getAllFlags();
    
    // Get metrics for each flag
    const flagsWithMetrics = await Promise.all(
      flags.map(async (flag) => ({
        ...flag,
        metrics: await featureFlagManager.getFeatureFlagMetrics(flag.name),
      }))
    );

    return NextResponse.json({
      flags: flagsWithMetrics,
      total: flags.length,
      enabled: flags.filter(f => f.enabled).length,
      rollout: flags.filter(f => f.enabled && f.rolloutPercentage < 100).length,
    });
  } catch (error: unknown) {
    console.error('[FeatureFlags API] Error getting flags:', error);
    return NextResponse.json(
      { error: 'Failed to get feature flags' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, enabled, rolloutPercentage, conditions, createdBy } = body;

    if (!name) {
      return NextResponse.json(
        { error: 'Flag name is required' },
        { status: 400 }
      );
    }

    const featureFlagManager = FeatureFlagManager.getInstance(prisma, redis);
    
    const flag = await featureFlagManager.setFeatureFlag(
      name,
      enabled ?? false,
      rolloutPercentage ?? 0,
      conditions,
      createdBy ?? 'admin-api'
    );

    return NextResponse.json(flag);
  } catch (error: unknown) {
    console.error('[FeatureFlags API] Error creating/updating flag:', error);
    return NextResponse.json(
      { error: 'Failed to create/update feature flag' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const flagName = searchParams.get('name');
    const reason = searchParams.get('reason') || 'Manual deletion';

    if (!flagName) {
      return NextResponse.json(
        { error: 'Flag name is required' },
        { status: 400 }
      );
    }

    const featureFlagManager = FeatureFlagManager.getInstance(prisma, redis);
    await featureFlagManager.rollback(flagName, reason);

    return NextResponse.json({ success: true, message: 'Flag rolled back successfully' });
  } catch (error: unknown) {
    console.error('[FeatureFlags API] Error deleting flag:', error);
    return NextResponse.json(
      { error: 'Failed to delete feature flag' },
      { status: 500 }
    );
  }
}