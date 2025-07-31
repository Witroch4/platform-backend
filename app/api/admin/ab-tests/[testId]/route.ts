import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { Redis } from 'ioredis';
import { ABTestingManager } from '@/lib/feature-flags/ab-testing-manager';

const prisma = new PrismaClient();
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ testId: string }> }
) {
  try {
    const { testId } = await params;
    const abTestManager = ABTestingManager.getInstance(prisma, redis);
    
    const results = await abTestManager.getABTestResults(testId);
    
    return NextResponse.json(results);
  } catch (error) {
    console.error(`[ABTests API] Error getting test results for ${(await params).testId}:`, error);
    return NextResponse.json(
      { error: 'Failed to get A/B test results' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ testId: string }> }
) {
  try {
    const { testId } = await params;
    const body = await request.json();
    const { action, startedBy = 'admin-api' } = body;

    const abTestManager = ABTestingManager.getInstance(prisma, redis);

    switch (action) {
      case 'start':
        await abTestManager.startABTest(testId, startedBy);
        return NextResponse.json({
          success: true,
          message: `A/B test ${testId} started successfully`,
        });

      case 'stop':
        await abTestManager.stopABTest(testId, startedBy);
        return NextResponse.json({
          success: true,
          message: `A/B test ${testId} stopped successfully`,
        });

      default:
        return NextResponse.json(
          { error: 'Invalid action. Use "start" or "stop"' },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error(`[ABTests API] Error performing action on test ${(await params).testId}:`, error);
    return NextResponse.json(
      { error: 'Failed to perform action on A/B test' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ testId: string }> }
) {
  try {
    const { testId } = await params;
    const body = await request.json();
    const { userId, metricName, value, metadata } = body;

    if (!userId || !metricName || value === undefined) {
      return NextResponse.json(
        { error: 'userId, metricName, and value are required' },
        { status: 400 }
      );
    }

    const abTestManager = ABTestingManager.getInstance(prisma, redis);
    
    await abTestManager.recordMetric(testId, userId, metricName, value, metadata);
    
    return NextResponse.json({
      success: true,
      message: 'Metric recorded successfully',
    });
  } catch (error) {
    console.error(`[ABTests API] Error recording metric for test ${(await params).testId}:`, error);
    return NextResponse.json(
      { error: 'Failed to record metric' },
      { status: 500 }
    );
  }
}