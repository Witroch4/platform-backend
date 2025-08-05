/**
 * Budget Management API
 * Based on requirements 15.1, 15.3
 */

import { NextRequest, NextResponse } from 'next/server';
import { getRedisInstance } from '@/lib/connections';
import { BudgetGuardService } from '@/lib/ai-integration/services/budget-guard';
import { CostTrackingService } from '@/lib/ai-integration/services/cost-tracker';
import log from '@/lib/log';

// GET /api/admin/budget - Get budget status for account
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get('accountId');
    const includeHistory = searchParams.get('includeHistory') === 'true';

    if (!accountId) {
      return NextResponse.json({
        success: false,
        error: 'accountId is required'
      }, { status: 400 });
    }

    const redis = getRedisInstance();
    const budgetGuard = new BudgetGuardService(redis);

    if (includeHistory) {
      const statusWithHistory = await budgetGuard.getBudgetStatusWithHistory(parseInt(accountId));
      
      return NextResponse.json({
        success: true,
        data: statusWithHistory
      });
    }

    const costTracker = new CostTrackingService(redis);
    const budgetStatus = await costTracker.getBudgetStatus(parseInt(accountId));
    const allowanceCheck = await budgetGuard.isAccountAllowed(parseInt(accountId));

    return NextResponse.json({
      success: true,
      data: {
        budget: budgetStatus,
        allowance: allowanceCheck
      }
    });

  } catch (error) {
    log.error('Error in budget API', { error });
    
    return NextResponse.json({
      success: false,
      error: 'Internal server error'
    }, { status: 500 });
  }
}

// POST /api/admin/budget/reset - Reset budget for account
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { accountId, reason, userId } = body;

    if (!accountId || !reason || !userId) {
      return NextResponse.json({
        success: false,
        error: 'Missing required fields: accountId, reason, userId'
      }, { status: 400 });
    }

    const redis = getRedisInstance();
    const budgetGuard = new BudgetGuardService(redis);

    await budgetGuard.resetAccountBudget(accountId, reason, userId);

    return NextResponse.json({
      success: true,
      message: 'Budget reset successfully'
    });

  } catch (error) {
    log.error('Error resetting budget', { error });
    
    return NextResponse.json({
      success: false,
      error: 'Internal server error'
    }, { status: 500 });
  }
}

// PUT /api/admin/budget/limits - Set custom budget limits
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { accountId, dailyTokenLimit, dailyCostLimitBrl, userId } = body;

    if (!accountId || !userId) {
      return NextResponse.json({
        success: false,
        error: 'Missing required fields: accountId, userId'
      }, { status: 400 });
    }

    if (!dailyTokenLimit && !dailyCostLimitBrl) {
      return NextResponse.json({
        success: false,
        error: 'At least one limit must be provided: dailyTokenLimit or dailyCostLimitBrl'
      }, { status: 400 });
    }

    const redis = getRedisInstance();
    const budgetGuard = new BudgetGuardService(redis);

    const limits: any = {};
    if (dailyTokenLimit) limits.dailyTokenLimit = dailyTokenLimit;
    if (dailyCostLimitBrl) limits.dailyCostLimitBrl = dailyCostLimitBrl;

    await budgetGuard.setCustomBudgetLimits(accountId, limits, userId);

    return NextResponse.json({
      success: true,
      message: 'Custom budget limits set successfully'
    });

  } catch (error) {
    log.error('Error setting custom budget limits', { error });
    
    return NextResponse.json({
      success: false,
      error: 'Internal server error'
    }, { status: 500 });
  }
}