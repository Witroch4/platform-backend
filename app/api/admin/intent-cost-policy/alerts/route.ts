/**
 * Intent Cost Alerts API
 * Based on requirements 15.2, 15.3
 */

import { NextRequest, NextResponse } from 'next/server';
import { getRedisInstance } from '@/lib/connections';
import { IntentCostPolicyService } from '@/lib/ai-integration/services/intent-cost-policy';
import log from '@/lib/log';

// GET /api/admin/intent-cost-policy/alerts - Get cost alerts for account
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get('accountId');

    if (!accountId) {
      return NextResponse.json({
        success: false,
        error: 'accountId is required'
      }, { status: 400 });
    }

    const redis = getRedisInstance();
    const policyService = new IntentCostPolicyService(redis);

    const alerts = await policyService.checkCostAlerts(parseInt(accountId));

    return NextResponse.json({
      success: true,
      data: { alerts }
    });

  } catch (error) {
    log.error('Error getting cost alerts', { error });
    
    return NextResponse.json({
      success: false,
      error: 'Internal server error'
    }, { status: 500 });
  }
}

// POST /api/admin/intent-cost-policy/alerts/batch - Check alerts for multiple accounts
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { accountIds } = body;

    if (!accountIds || !Array.isArray(accountIds)) {
      return NextResponse.json({
        success: false,
        error: 'accountIds array is required'
      }, { status: 400 });
    }

    const redis = getRedisInstance();
    const policyService = new IntentCostPolicyService(redis);

    const results = await Promise.all(
      accountIds.map(async (accountId: number) => {
        try {
          const alerts = await policyService.checkCostAlerts(accountId);
          return {
            accountId,
            alerts,
            error: null
          };
        } catch (error) {
          log.error('Error checking alerts for account', { accountId, error });
          return {
            accountId,
            alerts: [],
            error: error instanceof Error ? error.message : 'Unknown error'
          };
        }
      })
    );

    return NextResponse.json({
      success: true,
      data: { results }
    });

  } catch (error) {
    log.error('Error in batch alerts check', { error });
    
    return NextResponse.json({
      success: false,
      error: 'Internal server error'
    }, { status: 500 });
  }
}