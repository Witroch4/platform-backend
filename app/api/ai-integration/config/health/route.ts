/**
 * Configuration Health Check API Endpoint
 * 
 * Provides health check information for AI integration configuration.
 * Admin-only endpoint that lists missing critical variables and configuration status.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAdminAccess } from '@/lib/ai-integration/middleware/access-control';
import { 
  performConfigHealthCheck,
  getConfigSummary,
  validateConfig
} from '@/lib/ai-integration/services/config-validation';
import { AIPermission } from '@/lib/ai-integration/services/access-control';

/**
 * GET /api/ai-integration/config/health
 * 
 * Returns comprehensive configuration health information
 */
async function handleGet(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const format = url.searchParams.get('format') || 'json';
    const includeValues = url.searchParams.get('includeValues') === 'true';
    
    // Perform health check
    const healthCheck = await performConfigHealthCheck();
    
    // Get configuration summary
    const summary = getConfigSummary();
    
    // Get detailed validation results
    const validation = validateConfig();
    
    const response = {
      status: healthCheck.status,
      timestamp: healthCheck.timestamp,
      version: healthCheck.version,
      summary,
      validation: {
        isValid: validation.isValid,
        errorCount: validation.errors.length,
        warningCount: validation.warnings.length,
        missingOptionalCount: validation.missingOptional.length,
        ...(includeValues && {
          errors: validation.errors,
          warnings: validation.warnings,
          missingOptional: validation.missingOptional
        })
      },
      checks: healthCheck.checks,
      recommendations: generateRecommendations(validation, healthCheck)
    };
    
    if (format === 'text') {
      const textReport = generateTextReport(response);
      return new NextResponse(textReport, {
        headers: { 'Content-Type': 'text/plain' }
      });
    }
    
    return NextResponse.json(response);
    
  } catch (error) {
    return NextResponse.json(
      { 
        error: 'Failed to perform health check',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/ai-integration/config/health/validate
 * 
 * Validates a specific configuration value
 */
async function handlePost(req: NextRequest) {
  try {
    const body = await req.json();
    const { key, value } = body;
    
    if (!key || typeof key !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid key parameter' },
        { status: 400 }
      );
    }
    
    if (value === undefined) {
      return NextResponse.json(
        { error: 'Missing value parameter' },
        { status: 400 }
      );
    }
    
    const { validateConfigValue } = await import('@/lib/ai-integration/services/config-validation');
    const result = validateConfigValue(key, value);
    
    return NextResponse.json({
      key,
      value: typeof value === 'string' && value.length > 20 ? '***' : value,
      ...result
    });
    
  } catch (error) {
    return NextResponse.json(
      { 
        error: 'Failed to validate configuration value',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

/**
 * Generates recommendations based on health check results
 */
function generateRecommendations(validation: any, healthCheck: any): string[] {
  const recommendations: string[] = [];
  
  // Critical errors
  if (validation.errors.length > 0) {
    recommendations.push('🔴 Fix configuration errors before deploying to production');
  }
  
  // Missing optional but recommended config
  if (validation.missingOptional.length > 0) {
    recommendations.push('🟡 Configure optional settings for better security and functionality');
  }
  
  // Production-specific recommendations
  if (process.env.NODE_ENV === 'production') {
    if (healthCheck.checks.env_nextauth_secret?.status !== 'pass') {
      recommendations.push('🔴 Configure NEXTAUTH_SECRET for production deployment');
    }
    
    if (healthCheck.checks.env_nextauth_url?.status !== 'pass') {
      recommendations.push('🔴 Configure NEXTAUTH_URL for production deployment');
    }
  }
  
  // Performance recommendations
  if (validation.warnings.some((w: string) => w.includes('High rate limit'))) {
    recommendations.push('⚡ Review rate limiting settings to optimize performance');
  }
  
  // Cost control recommendations
  if (healthCheck.checks.costControl?.status !== 'pass') {
    recommendations.push('💰 Configure cost control limits to prevent unexpected expenses');
  }
  
  // Security recommendations
  if (!healthCheck.checks.env_pii_masking_salt || healthCheck.checks.env_pii_masking_salt.status !== 'pass') {
    recommendations.push('🔒 Configure PII masking salt for LGPD compliance');
  }
  
  return recommendations;
}

/**
 * Generates a text report for the health check
 */
function generateTextReport(data: any): string {
  const { status, timestamp, summary, validation, checks, recommendations } = data;
  
  let report = `# AI Integration Configuration Health Report
Generated: ${timestamp}
Status: ${status.toUpperCase()}

## Summary
Environment: ${summary.environment}
Configuration Valid: ${validation.isValid ? 'YES' : 'NO'}
Errors: ${validation.errorCount}
Warnings: ${validation.warningCount}
Missing Optional: ${validation.missingOptionalCount}

## Features Status
`;
  
  Object.entries(summary.features).forEach(([key, value]) => {
    report += `- ${key}: ${value ? '✅ Enabled' : '❌ Disabled'}\n`;
  });
  
  report += `\n## Service Configuration
`;
  
  Object.entries(summary.services).forEach(([key, value]) => {
    report += `- ${key}: ${value}\n`;
  });
  
  report += `\n## Limits
`;
  
  Object.entries(summary.limits).forEach(([key, value]) => {
    report += `- ${key}: ${value}\n`;
  });
  
  report += `\n## Health Checks
`;
  
  Object.entries(checks).forEach(([key, check]: [string, any]) => {
    const icon = check.status === 'pass' ? '✅' : check.status === 'warn' ? '⚠️' : '❌';
    report += `${icon} ${key}: ${check.message}\n`;
  });
  
  if (recommendations.length > 0) {
    report += `\n## Recommendations
`;
    recommendations.forEach((rec: string) => {
      report += `${rec}\n`;
    });
  }
  
  return report;
}

// Apply admin access control middleware
export const GET = withAdminAccess(handleGet, {
  requiredPermission: AIPermission.VIEW_CONFIG,
  resourceType: 'AI_CONFIG_HEALTH'
});

export const POST = withAdminAccess(handlePost, {
  requiredPermission: AIPermission.MANAGE_CONFIG,
  resourceType: 'AI_CONFIG_VALIDATION'
});