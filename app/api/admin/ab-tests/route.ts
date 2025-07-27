import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { Redis } from 'ioredis';
import { ABTestingManager } from '@/lib/feature-flags/ab-testing-manager';

const prisma = new PrismaClient();
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

export async function GET(request: NextRequest) {
  try {
    const abTestManager = ABTestingManager.getInstance(prisma, redis);
    const tests = await abTestManager.getAllABTests();
    
    // Get results for running tests
    const testsWithResults = await Promise.all(
      tests.map(async (test) => {
        if (test.status === 'RUNNING') {
          try {
            const results = await abTestManager.getABTestResults(test.id);
            return { ...test, results };
          } catch (error) {
            return { ...test, error: error.message };
          }
        }
        return test;
      })
    );

    const summary = {
      total: tests.length,
      running: tests.filter(t => t.status === 'RUNNING').length,
      completed: tests.filter(t => t.status === 'COMPLETED').length,
      draft: tests.filter(t => t.status === 'DRAFT').length,
    };

    return NextResponse.json({
      tests: testsWithResults,
      summary,
    });
  } catch (error) {
    console.error('[ABTests API] Error getting A/B tests:', error);
    return NextResponse.json(
      { error: 'Failed to get A/B tests' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      name,
      description,
      hypothesis,
      variants,
      metrics,
      targetSampleSize = 1000,
      confidenceLevel = 0.95,
      createdBy = 'admin-api',
    } = body;

    if (!name || !description || !hypothesis || !variants || !metrics) {
      return NextResponse.json(
        { error: 'Name, description, hypothesis, variants, and metrics are required' },
        { status: 400 }
      );
    }

    if (!variants.control || !variants.treatment) {
      return NextResponse.json(
        { error: 'Both control and treatment variants are required' },
        { status: 400 }
      );
    }

    if (!Array.isArray(metrics) || metrics.length === 0) {
      return NextResponse.json(
        { error: 'At least one metric is required' },
        { status: 400 }
      );
    }

    const abTestManager = ABTestingManager.getInstance(prisma, redis);
    
    const test = await abTestManager.createABTest(
      name,
      description,
      hypothesis,
      variants,
      metrics,
      targetSampleSize,
      confidenceLevel,
      createdBy
    );

    return NextResponse.json(test);
  } catch (error) {
    console.error('[ABTests API] Error creating A/B test:', error);
    return NextResponse.json(
      { error: 'Failed to create A/B test' },
      { status: 500 }
    );
  }
}