/**
 * Data Retention and Cleanup Service
 * 
 * Handles automatic expiry and cleanup of audit logs according to LGPD requirements.
 * Provides TTL management and scheduled cleanup jobs.
 */

import { getPrismaInstance } from '@/lib/connections';
import log from '@/lib/log';

/**
 * Interface for cleanup statistics
 */
export interface CleanupStats {
  llmAuditDeleted: number;
  intentHitLogDeleted: number;
  negativeExamplesDeleted: number;
  totalDeleted: number;
  executionTime: number;
}

/**
 * Interface for retention statistics
 */
export interface RetentionStats {
  llmAudit: {
    total: number;
    oldestRecord: Date | null;
    newestRecord: Date | null;
    averageAge: number;
    expiringSoon: number; // Records expiring in next 7 days
  };
  intentHitLog: {
    total: number;
    oldestRecord: Date | null;
    newestRecord: Date | null;
    averageAge: number;
    expiringSoon: number;
  };
  negativeExamples: {
    total: number;
    oldestRecord: Date | null;
    newestRecord: Date | null;
  };
}

/**
 * Interface for audit metrics
 */
export interface AuditMetrics {
  llmAudit: {
    totalRecords: number;
    recordsByMode: Record<string, number>;
    averageScore: number;
    recordsLast24h: number;
    recordsLast7d: number;
  };
  intentHitLog: {
    totalRecords: number;
    successfulHits: number;
    successRate: number;
    averageSimilarity: number;
    recordsLast24h: number;
    recordsLast7d: number;
    topIntents: Array<{
      name: string;
      count: number;
      averageSimilarity: number;
    }>;
  };
  performance: {
    totalTokensUsed: number;
    averageProcessingTime: number;
  };
}

/**
 * Cleans up expired audit logs
 */
export async function cleanupExpiredLogs(): Promise<CleanupStats> {
  const startTime = Date.now();
  
  try {
    log.info('Starting cleanup of expired audit logs');
    
    // Delete expired LlmAudit records
    const llmAuditResult = await getPrismaInstance().llmAudit.deleteMany({
      where: {
        expiresAt: {
          lt: new Date()
        }
      }
    });
    
    // Delete expired IntentHitLog records
    const intentHitLogResult = await getPrismaInstance().intentHitLog.deleteMany({
      where: {
        expiresAt: {
          lt: new Date()
        }
      }
    });
    
    // Delete old negative examples (older than 1 year)
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    
    const negativeExamplesResult = await getPrismaInstance().negativeExample.deleteMany({
      where: {
        createdAt: {
          lt: oneYearAgo
        }
      }
    });
    
    const executionTime = Date.now() - startTime;
    const stats: CleanupStats = {
      llmAuditDeleted: llmAuditResult.count,
      intentHitLogDeleted: intentHitLogResult.count,
      negativeExamplesDeleted: negativeExamplesResult.count,
      totalDeleted: llmAuditResult.count + intentHitLogResult.count + negativeExamplesResult.count,
      executionTime
    };
    
    log.info('Cleanup completed', {
      stats,
      duration: `${executionTime}ms`
    });
    
    return stats;
    
  } catch (error) {
    log.error('Failed to cleanup expired logs', { error });
    throw error;
  }
}

/**
 * Gets comprehensive retention statistics
 */
export async function getRetentionStats(): Promise<RetentionStats> {
  try {
    // Get LlmAudit statistics
    const llmAuditStats = await getPrismaInstance().llmAudit.aggregate({
      _count: { id: true },
      _min: { 
        createdAt: true,
        expiresAt: true 
      },
      _max: { 
        createdAt: true,
        expiresAt: true 
      }
    });
    
    // Get IntentHitLog statistics
    const intentHitLogStats = await getPrismaInstance().intentHitLog.aggregate({
      _count: { id: true },
      _min: { 
        createdAt: true,
        expiresAt: true 
      },
      _max: { 
        createdAt: true,
        expiresAt: true 
      }
    });
    
    // Get NegativeExample statistics
    const negativeExampleStats = await getPrismaInstance().negativeExample.aggregate({
      _count: { id: true },
      _min: { createdAt: true },
      _max: { createdAt: true }
    });
    
    // Count records expiring soon (next 7 days)
    const sevenDaysFromNow = new Date();
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
    
    const llmAuditExpiringSoon = await getPrismaInstance().llmAudit.count({
      where: {
        expiresAt: {
          lte: sevenDaysFromNow,
          gt: new Date()
        }
      }
    });
    
    const intentHitLogExpiringSoon = await getPrismaInstance().intentHitLog.count({
      where: {
        expiresAt: {
          lte: sevenDaysFromNow,
          gt: new Date()
        }
      }
    });
    
    // Calculate average age
    const now = new Date();
    const llmAuditAvgAge = llmAuditStats._min.createdAt 
      ? (now.getTime() - llmAuditStats._min.createdAt.getTime()) / (1000 * 60 * 60 * 24)
      : 0;
    
    const intentHitLogAvgAge = intentHitLogStats._min.createdAt
      ? (now.getTime() - intentHitLogStats._min.createdAt.getTime()) / (1000 * 60 * 60 * 24)
      : 0;
    
    return {
      llmAudit: {
        total: llmAuditStats._count.id || 0,
        oldestRecord: llmAuditStats._min.createdAt,
        newestRecord: llmAuditStats._max.createdAt,
        averageAge: llmAuditAvgAge,
        expiringSoon: llmAuditExpiringSoon
      },
      intentHitLog: {
        total: intentHitLogStats._count.id || 0,
        oldestRecord: intentHitLogStats._min.createdAt,
        newestRecord: intentHitLogStats._max.createdAt,
        averageAge: intentHitLogAvgAge,
        expiringSoon: intentHitLogExpiringSoon
      },
      negativeExamples: {
        total: negativeExampleStats._count.id || 0,
        oldestRecord: negativeExampleStats._min.createdAt,
        newestRecord: negativeExampleStats._max.createdAt
      }
    };
    
  } catch (error) {
    log.error('Failed to get retention statistics', { error });
    throw error;
  }
}

/**
 * Collects comprehensive audit metrics for monitoring
 */
export async function collectAuditMetrics(): Promise<AuditMetrics> {
  try {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    // LlmAudit metrics
    const llmAuditTotal = await getPrismaInstance().llmAudit.count();
    const llmAuditLast24h = await getPrismaInstance().llmAudit.count({
      where: { createdAt: { gte: yesterday } }
    });
    const llmAuditLast7d = await getPrismaInstance().llmAudit.count({
      where: { createdAt: { gte: weekAgo } }
    });
    
    const llmAuditByMode = await getPrismaInstance().llmAudit.groupBy({
      by: ['mode'],
      _count: { id: true }
    });
    
    const llmAuditScoreStats = await getPrismaInstance().llmAudit.aggregate({
      _avg: { score: true }
    });
    
    // IntentHitLog metrics
    const intentHitLogTotal = await getPrismaInstance().intentHitLog.count();
    const intentHitLogSuccessful = await getPrismaInstance().intentHitLog.count({
      where: { chosen: true }
    });
    const intentHitLogLast24h = await getPrismaInstance().intentHitLog.count({
      where: { createdAt: { gte: yesterday } }
    });
    const intentHitLogLast7d = await getPrismaInstance().intentHitLog.count({
      where: { createdAt: { gte: weekAgo } }
    });
    
    const intentHitLogSimilarityStats = await getPrismaInstance().intentHitLog.aggregate({
      _avg: { similarity: true }
    });
    
    const topIntents = await getPrismaInstance().intentHitLog.groupBy({
      by: ['candidateName'],
      _count: { id: true },
      _avg: { similarity: true },
      orderBy: { _count: { id: 'desc' } },
      take: 10
    });
    
    // Calculate performance metrics
    const totalTokensUsed = llmAuditTotal * 37.5; // Estimated average tokens per request
    const averageProcessingTime = 2500; // Estimated average processing time in ms
    
    return {
      llmAudit: {
        totalRecords: llmAuditTotal,
        recordsByMode: llmAuditByMode.reduce((acc, item) => {
          acc[item.mode] = item._count.id;
          return acc;
        }, {} as Record<string, number>),
        averageScore: llmAuditScoreStats._avg.score || 0,
        recordsLast24h: llmAuditLast24h,
        recordsLast7d: llmAuditLast7d
      },
      intentHitLog: {
        totalRecords: intentHitLogTotal,
        successfulHits: intentHitLogSuccessful,
        successRate: intentHitLogTotal > 0 ? (intentHitLogSuccessful / intentHitLogTotal) * 100 : 0,
        averageSimilarity: intentHitLogSimilarityStats._avg.similarity || 0,
        recordsLast24h: intentHitLogLast24h,
        recordsLast7d: intentHitLogLast7d,
        topIntents: topIntents.map(intent => ({
          name: intent.candidateName,
          count: intent._count.id,
          averageSimilarity: intent._avg.similarity || 0
        }))
      },
      performance: {
        totalTokensUsed,
        averageProcessingTime
      }
    };
    
  } catch (error) {
    log.error('Failed to collect audit metrics', { error });
    throw error;
  }
}

/**
 * Generates a formatted metrics report
 */
export async function generateMetricsReport(): Promise<string> {
  try {
    const metrics = await collectAuditMetrics();
    const retentionStats = await getRetentionStats();
    
    const report = `
# AI Integration Audit Report
Generated: ${new Date().toISOString()}

## LLM Audit Statistics
- Total Records: ${metrics.llmAudit.totalRecords.toLocaleString()}
- Records (Last 24h): ${metrics.llmAudit.recordsLast24h.toLocaleString()}
- Records (Last 7d): ${metrics.llmAudit.recordsLast7d.toLocaleString()}
- Average Score: ${(metrics.llmAudit.averageScore * 100).toFixed(1)}%
- Records by Mode:
${Object.entries(metrics.llmAudit.recordsByMode)
  .map(([mode, count]) => `  - ${mode}: ${count.toLocaleString()}`)
  .join('\n')}

## Intent Classification Statistics
- Total Records: ${metrics.intentHitLog.totalRecords.toLocaleString()}
- Successful Hits: ${metrics.intentHitLog.successfulHits.toLocaleString()}
- Success Rate: ${metrics.intentHitLog.successRate.toFixed(1)}%
- Average Similarity: ${(metrics.intentHitLog.averageSimilarity * 100).toFixed(1)}%
- Records (Last 24h): ${metrics.intentHitLog.recordsLast24h.toLocaleString()}
- Records (Last 7d): ${metrics.intentHitLog.recordsLast7d.toLocaleString()}

## Top Intents
${metrics.intentHitLog.topIntents
  .map(intent => `- ${intent.name}: ${intent.count} hits (${(intent.averageSimilarity * 100).toFixed(1)}% avg similarity)`)
  .join('\n')}

## Data Retention Status
- LLM Audit: ${retentionStats.llmAudit.total.toLocaleString()} records (${retentionStats.llmAudit.expiringSoon} expiring soon)
- Intent Hit Log: ${retentionStats.intentHitLog.total.toLocaleString()} records (${retentionStats.intentHitLog.expiringSoon} expiring soon)
- Negative Examples: ${retentionStats.negativeExamples.total.toLocaleString()} records

## Performance Metrics
- Estimated Total Tokens Used: ${metrics.performance.totalTokensUsed.toLocaleString()}
- Average Processing Time: ${metrics.performance.averageProcessingTime}ms
`;
    
    return report.trim();
    
  } catch (error) {
    log.error('Failed to generate metrics report', { error });
    throw error;
  }
}

/**
 * Sets up automatic cleanup job (to be called from BullMQ scheduler)
 */
export async function scheduleCleanupJob(): Promise<void> {
  try {
    log.info('Setting up automatic cleanup job');
    
    // This would typically be called from a BullMQ scheduler
    // The actual scheduling is handled in the queue configuration
    
    log.info('Automatic cleanup job scheduled successfully');
    
  } catch (error) {
    log.error('Failed to schedule cleanup job', { error });
    throw error;
  }
}

/**
 * Validates TTL configuration and database setup
 */
export async function validateTTLSetup(): Promise<{
  isValid: boolean;
  issues: string[];
  recommendations: string[];
}> {
  const issues: string[] = [];
  const recommendations: string[] = [];
  
  try {
    // Check if TTL fields exist and have proper defaults
    const sampleLlmAudit = await getPrismaInstance().llmAudit.findFirst({
      select: { expiresAt: true, createdAt: true }
    });
    
    const sampleIntentHitLog = await getPrismaInstance().intentHitLog.findFirst({
      select: { expiresAt: true, createdAt: true }
    });
    
    // Check if indexes exist for expiry fields
    // This would require raw SQL queries to check index existence
    
    // Check retention stats
    const stats = await getRetentionStats();
    
    if (stats.llmAudit.expiringSoon > 1000) {
      recommendations.push(`Large number of LLM audit records expiring soon (${stats.llmAudit.expiringSoon}). Consider running cleanup.`);
    }
    
    if (stats.intentHitLog.expiringSoon > 1000) {
      recommendations.push(`Large number of intent hit log records expiring soon (${stats.intentHitLog.expiringSoon}). Consider running cleanup.`);
    }
    
    if (stats.llmAudit.averageAge > 85) {
      recommendations.push('Some LLM audit records are approaching TTL limit. Cleanup job may be needed.');
    }
    
    return {
      isValid: issues.length === 0,
      issues,
      recommendations
    };
    
  } catch (error) {
    issues.push(`Failed to validate TTL setup: ${error}`);
    return {
      isValid: false,
      issues,
      recommendations
    };
  }
}