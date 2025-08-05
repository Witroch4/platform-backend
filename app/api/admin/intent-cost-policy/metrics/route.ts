/**
 * Intent Cost Metrics API
 * Based on requirements 15.2, 15.3
 */

import { NextRequest, NextResponse } from 'next/server';
import { getRedisInstance } from '@/lib/connections';
import { IntentCostPolicyService } from '@/lib/ai-integration/services/intent-cost-policy';
import log from '@/lib/log';

// GET /api/admin/intent-cost-policy/metrics - Get intent usage metrics
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const intentId = searchParams.get('intentId');
    const accountId = searchParams.get('accountId');
    const days = parseInt(searchParams.get('days') || '7');

    if (!accountId) {
      return NextResponse.json({
        success: false,
        error: 'accountId is required'
      }, { status: 400 });
    }

    const redis = getRedisInstance();
    const policyService = new IntentCostPolicyService(redis);

    if (intentId) {
      // Get metrics for specific intent
      const metrics = await policyService.getIntentMetrics(intentId, parseInt(accountId), days);
      
      return NextResponse.json({
        success: true,
        data: { metrics }
      });
    }

    // Get metrics for all common intents
    const { INTENT_COST_CATEGORIES } = await import('@/lib/ai-integration/types/intent-cost-policy');
    const intentIds = Object.keys(INTENT_COST_CATEGORIES);
    
    const allMetrics = await Promise.all(
      intentIds.map(async (id) => {
        try {
          const metrics = await policyService.getIntentMetrics(id, parseInt(accountId), days);
          return {
            intentId: id,
            metrics
          };
        } catch (error) {
          log.error('Error getting metrics for intent', { intentId: id, accountId, error });
          return {
            intentId: id,
            metrics: []
          };
        }
      })
    );

    return NextResponse.json({
      success: true,
      data: { allMetrics }
    });

  } catch (error) {
    log.error('Error in intent metrics API', { error });
    
    return NextResponse.json({
      success: false,
      error: 'Internal server error'
    }, { status: 500 });
  }
}

// POST /api/admin/intent-cost-policy/metrics - Record intent usage
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { intentId, accountId, tokensUsed, costBrl } = body;

    if (!intentId || !accountId || tokensUsed === undefined || costBrl === undefined) {
      return NextResponse.json({
        success: false,
        error: 'Missing required fields: intentId, accountId, tokensUsed, costBrl'
      }, { status: 400 });
    }

    const redis = getRedisInstance();
    const policyService = new IntentCostPolicyService(redis);

    await policyService.recordIntentUsage(intentId, accountId, tokensUsed, costBrl);

    return NextResponse.json({
      success: true,
      message: 'Intent usage recorded successfully'
    });

  } catch (error) {
    log.error('Error recording intent usage', { error });
    
    return NextResponse.json({
      success: false,
      error: 'Internal server error'
    }, { status: 500 });
  }
}