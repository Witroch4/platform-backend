/**
 * Feature Flag Admin API
 * Based on requirements 16.1, 16.2, 16.3, 16.4
 */

import { NextRequest, NextResponse } from 'next/server';
import { getRedisInstance } from '@/lib/connections';
import { FeatureFlagManager } from '@/lib/ai-integration/services/feature-flag-manager';
import { AI_FEATURE_FLAGS } from '@/lib/ai-integration/types/feature-flags';
import log from '@/lib/log';

// GET /api/admin/feature-flags - List all feature flags
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get('accountId');
    const inboxId = searchParams.get('inboxId');

    const redis = getRedisInstance();
    const flagManager = new FeatureFlagManager(redis);

    if (accountId) {
      // Get feature flag status for specific account
      const status = await flagManager.getAccountFeatureFlagStatus(
        parseInt(accountId),
        inboxId ? parseInt(inboxId) : undefined
      );

      return NextResponse.json({
        success: true,
        data: {
          accountId: parseInt(accountId),
          inboxId: inboxId ? parseInt(inboxId) : undefined,
          flags: status
        }
      });
    }

    // List all available AI feature flags
    const flags = Object.entries(AI_FEATURE_FLAGS).map(([key, flagId]) => ({
      key,
      flagId,
      name: flagId.replace(/\./g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
      description: `AI Integration: ${key.replace(/_/g, ' ').toLowerCase()}`
    }));

    return NextResponse.json({
      success: true,
      data: { flags }
    });

  } catch (error) {
    log.error('Error in feature flags API', { error });
    
    return NextResponse.json({
      success: false,
      error: 'Internal server error'
    }, { status: 500 });
  }
}

// POST /api/admin/feature-flags - Create or update feature flag override
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { flagId, accountId, inboxId, enabled, reason, userId } = body;

    if (!flagId || !reason || !userId) {
      return NextResponse.json({
        success: false,
        error: 'Missing required fields: flagId, reason, userId'
      }, { status: 400 });
    }

    const redis = getRedisInstance();
    const flagManager = new FeatureFlagManager(redis);

    if (inboxId) {
      if (enabled) {
        await flagManager.enableForInbox(flagId, accountId, inboxId, reason, userId);
      } else {
        await flagManager.disableForInbox(flagId, accountId, inboxId, reason, userId);
      }
    } else if (accountId) {
      if (enabled) {
        await flagManager.enableForAccount(flagId, accountId, reason, userId);
      } else {
        await flagManager.disableForAccount(flagId, accountId, reason, userId);
      }
    } else {
      return NextResponse.json({
        success: false,
        error: 'Either accountId or inboxId must be provided'
      }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      message: `Feature flag ${enabled ? 'enabled' : 'disabled'} successfully`
    });

  } catch (error) {
    log.error('Error updating feature flag', { error });
    
    return NextResponse.json({
      success: false,
      error: 'Internal server error'
    }, { status: 500 });
  }
}

// DELETE /api/admin/feature-flags - Remove feature flag override
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const flagId = searchParams.get('flagId');
    const accountId = searchParams.get('accountId');
    const inboxId = searchParams.get('inboxId');

    if (!flagId) {
      return NextResponse.json({
        success: false,
        error: 'flagId is required'
      }, { status: 400 });
    }

    const redis = getRedisInstance();
    const flagManager = new FeatureFlagManager(redis);

    await flagManager.removeOverride(
      flagId,
      accountId ? parseInt(accountId) : undefined,
      inboxId ? parseInt(inboxId) : undefined
    );

    return NextResponse.json({
      success: true,
      message: 'Feature flag override removed successfully'
    });

  } catch (error) {
    log.error('Error removing feature flag override', { error });
    
    return NextResponse.json({
      success: false,
      error: 'Internal server error'
    }, { status: 500 });
  }
}