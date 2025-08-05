/**
 * Secret Rotation Service
 * 
 * Handles quarterly rotation of sensitive API keys and tokens
 * with overlap windows and comprehensive audit trails.
 */

import log from '@/lib/log';
import { logAuditTrail, AccessContext } from './access-control';

/**
 * Interface for secret configuration
 */
export interface SecretConfig {
  name: string;
  envKey: string;
  description: string;
  rotationIntervalDays: number;
  overlapWindowDays: number;
  provider: 'openai' | 'chatwit' | 'custom';
  validationEndpoint?: string;
  validationMethod?: 'GET' | 'POST';
}

/**
 * Interface for rotation result
 */
export interface RotationResult {
  secretName: string;
  success: boolean;
  oldKeyHash: string;
  newKeyHash: string;
  overlapEndsAt: Date;
  error?: string;
  validationPassed: boolean;
}

/**
 * Interface for rotation status
 */
export interface RotationStatus {
  secretName: string;
  lastRotated: Date | null;
  nextRotationDue: Date | null;
  isOverdue: boolean;
  daysUntilRotation: number;
  inOverlapWindow: boolean;
  overlapEndsAt: Date | null;
}

/**
 * Predefined secret configurations
 */
export const SECRET_CONFIGS: Record<string, SecretConfig> = {
  OPENAI_API_KEY: {
    name: 'OpenAI API Key',
    envKey: 'OPENAI_API_KEY',
    description: 'API key for OpenAI services (embeddings and LLM)',
    rotationIntervalDays: 90, // Quarterly
    overlapWindowDays: 7,     // 1 week overlap
    provider: 'openai',
    validationEndpoint: 'https://api.openai.com/v1/models',
    validationMethod: 'GET'
  },
  CHATWIT_TOKEN: {
    name: 'Chatwit Access Token',
    envKey: 'CHATWIT_ACCESS_TOKEN',
    description: 'Access token for Chatwit API integration',
    rotationIntervalDays: 90, // Quarterly
    overlapWindowDays: 7,     // 1 week overlap
    provider: 'chatwit',
    validationEndpoint: process.env.CHATWIT_BASE_URL ? `${process.env.CHATWIT_BASE_URL}/api/v1/accounts` : undefined,
    validationMethod: 'GET'
  },
  CHATWIT_WEBHOOK_SECRET: {
    name: 'Chatwit Webhook Secret',
    envKey: 'CHATWIT_WEBHOOK_SECRET',
    description: 'HMAC secret for webhook signature validation',
    rotationIntervalDays: 90, // Quarterly
    overlapWindowDays: 7,     // 1 week overlap
    provider: 'chatwit'
  },
  PII_MASKING_SALT: {
    name: 'PII Masking Salt',
    envKey: 'PII_MASKING_SALT',
    description: 'Salt for hashing sensitive identifiers',
    rotationIntervalDays: 180, // Semi-annually (longer due to data consistency needs)
    overlapWindowDays: 14,     // 2 weeks overlap
    provider: 'custom'
  }
};

/**
 * Gets the current rotation status for all secrets
 */
export async function getRotationStatus(): Promise<RotationStatus[]> {
  const statuses: RotationStatus[] = [];
  
  for (const [key, config] of Object.entries(SECRET_CONFIGS)) {
    try {
      const lastRotated = await getLastRotationDate(key);
      const nextRotationDue = lastRotated 
        ? new Date(lastRotated.getTime() + config.rotationIntervalDays * 24 * 60 * 60 * 1000)
        : new Date(); // If never rotated, due now
      
      const now = new Date();
      const daysUntilRotation = Math.ceil((nextRotationDue.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
      const isOverdue = daysUntilRotation < 0;
      
      const overlapEndsAt = await getOverlapEndDate(key);
      const inOverlapWindow = overlapEndsAt ? now < overlapEndsAt : false;
      
      statuses.push({
        secretName: key,
        lastRotated,
        nextRotationDue,
        isOverdue,
        daysUntilRotation,
        inOverlapWindow,
        overlapEndsAt
      });
      
    } catch (error) {
      log.error('Failed to get rotation status', { error, secretName: key });
      
      statuses.push({
        secretName: key,
        lastRotated: null,
        nextRotationDue: null,
        isOverdue: true,
        daysUntilRotation: -999,
        inOverlapWindow: false,
        overlapEndsAt: null
      });
    }
  }
  
  return statuses;
}

/**
 * Rotates a specific secret
 */
export async function rotateSecret(
  secretName: string,
  newSecret: string,
  context: AccessContext
): Promise<RotationResult> {
  const config = SECRET_CONFIGS[secretName];
  if (!config) {
    throw new Error(`Unknown secret: ${secretName}`);
  }
  
  try {
    log.info('Starting secret rotation', { secretName, userId: context.userId });
    
    // Get current secret for comparison
    const currentSecret = process.env[config.envKey];
    const oldKeyHash = currentSecret ? hashSecret(currentSecret) : 'none';
    const newKeyHash = hashSecret(newSecret);
    
    // Validate new secret
    const validationPassed = await validateSecret(config, newSecret);
    if (!validationPassed) {
      throw new Error('New secret failed validation');
    }
    
    // Store rotation metadata
    const overlapEndsAt = new Date();
    overlapEndsAt.setDate(overlapEndsAt.getDate() + config.overlapWindowDays);
    
    await storeRotationMetadata(secretName, {
      rotatedAt: new Date(),
      rotatedBy: context.userId,
      oldKeyHash,
      newKeyHash,
      overlapEndsAt
    });
    
    // Log successful rotation
    await logAuditTrail({
      userId: context.userId,
      action: 'SECRET_ROTATED',
      resourceType: 'AI_SECRET',
      resourceId: secretName,
      details: {
        secretName,
        provider: config.provider,
        oldKeyHash,
        newKeyHash,
        overlapEndsAt,
        validationPassed
      },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      success: true
    });
    
    log.info('Secret rotation completed successfully', {
      secretName,
      userId: context.userId,
      overlapEndsAt
    });
    
    return {
      secretName,
      success: true,
      oldKeyHash,
      newKeyHash,
      overlapEndsAt,
      validationPassed
    };
    
  } catch (error) {
    log.error('Secret rotation failed', { error, secretName, userId: context.userId });
    
    // Log failed rotation
    await logAuditTrail({
      userId: context.userId,
      action: 'SECRET_ROTATION_FAILED',
      resourceType: 'AI_SECRET',
      resourceId: secretName,
      details: {
        secretName,
        provider: config.provider,
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      success: false,
      errorMessage: error instanceof Error ? error.message : 'Unknown error'
    });
    
    return {
      secretName,
      success: false,
      oldKeyHash: 'error',
      newKeyHash: 'error',
      overlapEndsAt: new Date(),
      error: error instanceof Error ? error.message : 'Unknown error',
      validationPassed: false
    };
  }
}

/**
 * Validates a secret by testing it against the provider's API
 */
async function validateSecret(config: SecretConfig, secret: string): Promise<boolean> {
  if (!config.validationEndpoint) {
    log.warn('No validation endpoint configured for secret', { secretName: config.name });
    return true; // Assume valid if no validation possible
  }
  
  try {
    const headers: Record<string, string> = {
      'User-Agent': 'SocialWise-SecretRotation/1.0'
    };
    
    // Add provider-specific authentication
    switch (config.provider) {
      case 'openai':
        headers['Authorization'] = `Bearer ${secret}`;
        break;
      case 'chatwit':
        headers['Authorization'] = `Bearer ${secret}`;
        break;
    }
    
    // Create an AbortController for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
    
    const response = await fetch(config.validationEndpoint, {
      method: config.validationMethod || 'GET',
      headers,
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    
    const isValid = response.ok;
  
    log.info('Secret validation completed', {
      secretName: config.name,
      endpoint: config.validationEndpoint,
      status: response.status,
      isValid
    });
    
    return isValid;
    
  } catch (error) {
    log.error('Secret validation failed', {
      error,
      secretName: config.name,
      endpoint: config.validationEndpoint
    });
    
    return false;
  }
}

/**
 * Hashes a secret for audit purposes (one-way hash)
 */
function hashSecret(secret: string): string {
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(secret).digest('hex').substring(0, 8);
}

/**
 * Stores rotation metadata (in production, this would use a secure key management service)
 */
async function storeRotationMetadata(secretName: string, metadata: {
  rotatedAt: Date;
  rotatedBy: string;
  oldKeyHash: string;
  newKeyHash: string;
  overlapEndsAt: Date;
}): Promise<void> {
  // In production, this would store in a secure key management service
  // For now, we'll use environment variables or a secure database table
  
  const key = `SECRET_ROTATION_${secretName}`;
  const value = JSON.stringify(metadata);
  
  // This is a placeholder - in production you'd use AWS Secrets Manager,
  // Azure Key Vault, or similar secure storage
  log.info('Storing rotation metadata', { secretName, key });
  
  // TODO: Implement actual secure storage
}

/**
 * Gets the last rotation date for a secret
 */
async function getLastRotationDate(secretName: string): Promise<Date | null> {
  try {
    // In production, this would query the secure key management service
    // For now, return null to indicate no previous rotation
    return null;
    
  } catch (error) {
    log.error('Failed to get last rotation date', { error, secretName });
    return null;
  }
}

/**
 * Gets the overlap end date for a secret
 */
async function getOverlapEndDate(secretName: string): Promise<Date | null> {
  try {
    // In production, this would query the secure key management service
    // For now, return null to indicate no active overlap
    return null;
    
  } catch (error) {
    log.error('Failed to get overlap end date', { error, secretName });
    return null;
  }
}

/**
 * Gets secrets that are due for rotation
 */
export async function getSecretsNeedingRotation(): Promise<{
  overdue: RotationStatus[];
  dueSoon: RotationStatus[]; // Due within 7 days
  inOverlap: RotationStatus[];
}> {
  const statuses = await getRotationStatus();
  
  const overdue = statuses.filter(s => s.isOverdue);
  const dueSoon = statuses.filter(s => !s.isOverdue && s.daysUntilRotation <= 7);
  const inOverlap = statuses.filter(s => s.inOverlapWindow);
  
  return { overdue, dueSoon, inOverlap };
}

/**
 * Generates a rotation report
 */
export async function generateRotationReport(): Promise<string> {
  try {
    const statuses = await getRotationStatus();
    const { overdue, dueSoon, inOverlap } = await getSecretsNeedingRotation();
    
    const report = `
# Secret Rotation Status Report
Generated: ${new Date().toISOString()}

## Summary
- Total Secrets: ${statuses.length}
- Overdue: ${overdue.length}
- Due Soon (≤7 days): ${dueSoon.length}
- In Overlap Window: ${inOverlap.length}

## Secret Status Details
${statuses.map(status => `
### ${status.secretName}
- Last Rotated: ${status.lastRotated?.toISOString() || 'Never'}
- Next Due: ${status.nextRotationDue?.toISOString() || 'Unknown'}
- Days Until Rotation: ${status.daysUntilRotation}
- Status: ${status.isOverdue ? '🔴 OVERDUE' : status.daysUntilRotation <= 7 ? '🟡 DUE SOON' : '🟢 OK'}
- In Overlap: ${status.inOverlapWindow ? 'Yes' : 'No'}
${status.overlapEndsAt ? `- Overlap Ends: ${status.overlapEndsAt.toISOString()}` : ''}
`).join('\n')}

## Action Items
${overdue.length > 0 ? `
### Immediate Action Required (Overdue)
${overdue.map(s => `- ${s.secretName}: ${Math.abs(s.daysUntilRotation)} days overdue`).join('\n')}
` : ''}

${dueSoon.length > 0 ? `
### Schedule Soon (Due Within 7 Days)
${dueSoon.map(s => `- ${s.secretName}: ${s.daysUntilRotation} days remaining`).join('\n')}
` : ''}

${inOverlap.length > 0 ? `
### Active Overlaps (Clean Up Old Keys)
${inOverlap.map(s => `- ${s.secretName}: Overlap ends ${s.overlapEndsAt?.toISOString()}`).join('\n')}
` : ''}
`;
    
    return report.trim();
    
  } catch (error) {
    log.error('Failed to generate rotation report', { error });
    throw error;
  }
}

/**
 * Schedules automatic rotation reminders
 */
export async function scheduleRotationReminders(): Promise<void> {
  try {
    const { overdue, dueSoon } = await getSecretsNeedingRotation();
    
    if (overdue.length > 0) {
      log.warn('Secrets are overdue for rotation', {
        overdueSecrets: overdue.map(s => s.secretName),
        count: overdue.length
      });
      
      // In production, this would send alerts to administrators
      // via email, Slack, or monitoring systems
    }
    
    if (dueSoon.length > 0) {
      log.info('Secrets due for rotation soon', {
        dueSoonSecrets: dueSoon.map(s => s.secretName),
        count: dueSoon.length
      });
    }
    
  } catch (error) {
    log.error('Failed to schedule rotation reminders', { error });
    throw error;
  }
}