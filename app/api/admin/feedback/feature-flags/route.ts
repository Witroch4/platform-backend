import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { Redis } from 'ioredis';
import {
  FeedbackCollector,
  getFeedbackCollector,
} from '@/lib/feedback/feedback-collector';

const prisma = new PrismaClient();
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const flagName = searchParams.get('flagName');

    if (!flagName) {
      return NextResponse.json(
        { error: 'Flag name is required' },
        { status: 400 }
      );
    }

    const feedbackCollector = getFeedbackCollector(prisma, redis);
    const metrics = await feedbackCollector.getFeatureFlagFeedbackMetrics(flagName);

    return NextResponse.json(metrics);
  } catch (error) {
    console.error('[Feedback API] Error getting feature flag feedback:', error);
    return NextResponse.json(
      { error: 'Failed to get feature flag feedback' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      userId,
      flagName,
      enabled,
      variant,
      experience,
      description,
      metadata,
    } = body;

    if (!userId || !flagName || !experience || !description) {
      return NextResponse.json(
        { error: 'userId, flagName, experience, and description are required' },
        { status: 400 }
      );
    }

    if (!['POSITIVE', 'NEGATIVE', 'NEUTRAL'].includes(experience)) {
      return NextResponse.json(
        { error: 'Experience must be POSITIVE, NEGATIVE, or NEUTRAL' },
        { status: 400 }
      );
    }

    const feedbackCollector = getFeedbackCollector(prisma, redis);
    
    const feedback = await feedbackCollector.submitFeatureFlagFeedback(
      userId,
      flagName,
      enabled ?? false,
      variant,
      experience,
      description,
      metadata
    );

    return NextResponse.json(feedback);
  } catch (error) {
    console.error('[Feedback API] Error submitting feature flag feedback:', error);
    return NextResponse.json(
      { error: 'Failed to submit feature flag feedback' },
      { status: 500 }
    );
  }
}