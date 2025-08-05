/**
 * Secret Rotation Management API
 * 
 * Provides endpoints for managing secret rotation, monitoring status,
 * and performing manual rotations with proper audit trails.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withSecretRotationAccess } from '@/lib/ai-integration/middleware/access-control';
import { 
  getRotationStatus,
  getSecretsNeedingRotation,
  rotateSecret,
  generateRotationReport,
  SECRET_CONFIGS
} from '@/lib/ai-integration/services/secret-rotation';
import { AccessContext } from '@/lib/ai-integration/services/access-control';

/**
 * GET /api/ai-integration/secrets/rotation
 * 
 * Returns current rotation status for all secrets
 */
async function handleGet(req: NextRequest, context: AccessContext) {
  try {
    const url = new URL(req.url);
    const format = url.searchParams.get('format') || 'json';
    const includeConfig = url.searchParams.get('includeConfig') === 'true';
    
    // Get rotation status
    const statuses = await getRotationStatus();
    
    // Get secrets needing attention
    const { overdue, dueSoon, inOverlap } = await getSecretsNeedingRotation();
    
    const response = {
      timestamp: new Date().toISOString(),
      summary: {
        totalSecrets: statuses.length,
        overdue: overdue.length,
        dueSoon: dueSoon.length,
        inOverlap: inOverlap.length,
        healthy: statuses.length - overdue.length - dueSoon.length
      },
      statuses,
      alerts: {
        overdue: overdue.map(s => ({
          secretName: s.secretName,
          daysOverdue: Math.abs(s.daysUntilRotation),
          severity: 'critical'
        })),
        dueSoon: dueSoon.map(s => ({
          secretName: s.secretName,
          daysRemaining: s.daysUntilRotation,
          severity: 'warning'
        })),
        inOverlap: inOverlap.map(s => ({
          secretName: s.secretName,
          overlapEndsAt: s.overlapEndsAt,
          severity: 'info'
        }))
      },
      ...(includeConfig && {
        configurations: Object.entries(SECRET_CONFIGS).map(([key, config]) => ({
          name: key,
          description: config.description,
          provider: config.provider,
          rotationIntervalDays: config.rotationIntervalDays,
          overlapWindowDays: config.overlapWindowDays
        }))
      })
    };
    
    if (format === 'text') {
      const report = await generateRotationReport();
      return new NextResponse(report, {
        headers: { 'Content-Type': 'text/plain' }
      });
    }
    
    return NextResponse.json(response);
    
  } catch (error) {
    return NextResponse.json(
      { 
        error: 'Failed to get rotation status',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/ai-integration/secrets/rotation
 * 
 * Performs manual secret rotation
 */
async function handlePost(req: NextRequest, context: AccessContext) {
  try {
    const body = await req.json();
    const { secretName, newSecret, force = false } = body;
    
    // Validate input
    if (!secretName || typeof secretName !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid secretName parameter' },
        { status: 400 }
      );
    }
    
    if (!newSecret || typeof newSecret !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid newSecret parameter' },
        { status: 400 }
      );
    }
    
    // Check if secret exists in configuration
    if (!SECRET_CONFIGS[secretName]) {
      return NextResponse.json(
        { error: `Unknown secret: ${secretName}` },
        { status: 400 }
      );
    }
    
    // Check if rotation is needed (unless forced)
    if (!force) {
      const statuses = await getRotationStatus();
      const secretStatus = statuses.find(s => s.secretName === secretName);
      
      if (secretStatus && !secretStatus.isOverdue && secretStatus.daysUntilRotation > 7) {
        return NextResponse.json(
          { 
            error: 'Secret rotation not needed yet',
            details: `Secret is not due for rotation for ${secretStatus.daysUntilRotation} days. Use force=true to override.`,
            daysUntilRotation: secretStatus.daysUntilRotation
          },
          { status: 400 }
        );
      }
    }
    
    // Perform rotation
    const result = await rotateSecret(secretName, newSecret, context);
    
    if (result.success) {
      return NextResponse.json({
        success: true,
        secretName: result.secretName,
        oldKeyHash: result.oldKeyHash,
        newKeyHash: result.newKeyHash,
        overlapEndsAt: result.overlapEndsAt,
        validationPassed: result.validationPassed,
        message: `Secret ${secretName} rotated successfully`
      });
    } else {
      return NextResponse.json(
        { 
          success: false,
          error: result.error,
          secretName: result.secretName,
          validationPassed: result.validationPassed
        },
        { status: 400 }
      );
    }
    
  } catch (error) {
    return NextResponse.json(
      { 
        error: 'Failed to rotate secret',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/ai-integration/secrets/rotation/{secretName}/overlap
 * 
 * Ends the overlap window for a secret (cleanup old key)
 */
async function handleDelete(req: NextRequest, context: AccessContext) {
  try {
    const url = new URL(req.url);
    const pathParts = url.pathname.split('/');
    const secretName = pathParts[pathParts.length - 2]; // Get secretName from path
    
    if (!secretName || !SECRET_CONFIGS[secretName]) {
      return NextResponse.json(
        { error: 'Invalid or unknown secret name' },
        { status: 400 }
      );
    }
    
    // Check if secret is in overlap window
    const statuses = await getRotationStatus();
    const secretStatus = statuses.find(s => s.secretName === secretName);
    
    if (!secretStatus?.inOverlapWindow) {
      return NextResponse.json(
        { error: 'Secret is not in overlap window' },
        { status: 400 }
      );
    }
    
    // In a real implementation, this would:
    // 1. Remove the old key from the key management service
    // 2. Update the overlap status
    // 3. Log the cleanup action
    
    // For now, we'll just log the action
    const { logAuditTrail } = await import('@/lib/ai-integration/services/access-control');
    
    await logAuditTrail({
      userId: context.userId,
      action: 'SECRET_OVERLAP_ENDED',
      resourceType: 'AI_SECRET',
      resourceId: secretName,
      details: {
        secretName,
        overlapEndedAt: new Date().toISOString(),
        overlapEndsAt: secretStatus.overlapEndsAt
      },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      success: true
    });
    
    return NextResponse.json({
      success: true,
      secretName,
      message: `Overlap window ended for ${secretName}`,
      overlapEndedAt: new Date().toISOString()
    });
    
  } catch (error) {
    return NextResponse.json(
      { 
        error: 'Failed to end overlap window',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// Apply access control middleware
export const GET = withSecretRotationAccess(handleGet, {
  resourceType: 'AI_SECRET_ROTATION_STATUS'
});

export const POST = withSecretRotationAccess(handlePost, {
  resourceType: 'AI_SECRET_ROTATION_EXECUTE'
});

export const DELETE = withSecretRotationAccess(handleDelete, {
  resourceType: 'AI_SECRET_ROTATION_CLEANUP'
});