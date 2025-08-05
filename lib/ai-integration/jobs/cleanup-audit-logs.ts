/**
 * Cleanup Audit Logs Job
 * 
 * BullMQ job for automated cleanup of expired audit logs.
 * Runs daily to maintain LGPD compliance and database performance.
 */

import { Job } from 'bullmq';
import log from '@/lib/log';
import { cleanupExpiredLogs, getRetentionStats, CleanupStats } from '../services/data-retention';

/**
 * Interface for cleanup job data
 */
export interface CleanupJobData {
  force?: boolean; // Force cleanup even if not much to clean
  dryRun?: boolean; // Only report what would be cleaned, don't actually delete
  maxRecordsToDelete?: number; // Safety limit
}

/**
 * Interface for cleanup job result
 */
export interface CleanupJobResult extends CleanupStats {
  dryRun: boolean;
  retentionStatsBefore: any;
  retentionStatsAfter: any;
  warnings: string[];
}

/**
 * Processes the cleanup audit logs job
 */
export async function processCleanupAuditLogsJob(
  job: Job<CleanupJobData>
): Promise<CleanupJobResult> {
  const { force = false, dryRun = false, maxRecordsToDelete = 10000 } = job.data;
  
  try {
    log.info('Starting audit logs cleanup job', {
      jobId: job.id,
      force,
      dryRun,
      maxRecordsToDelete
    });
    
    // Get retention stats before cleanup
    const retentionStatsBefore = await getRetentionStats();
    
    // Calculate total records that would be deleted
    const totalExpired = retentionStatsBefore.llmAudit.expiringSoon + 
                        retentionStatsBefore.intentHitLog.expiringSoon;
    
    const warnings: string[] = [];
    
    // Safety checks
    if (totalExpired > maxRecordsToDelete && !force) {
      warnings.push(`Too many records to delete (${totalExpired} > ${maxRecordsToDelete}). Use force=true to override.`);
      
      return {
        llmAuditDeleted: 0,
        intentHitLogDeleted: 0,
        negativeExamplesDeleted: 0,
        totalDeleted: 0,
        executionTime: 0,
        dryRun: true,
        retentionStatsBefore,
        retentionStatsAfter: retentionStatsBefore,
        warnings
      };
    }
    
    if (totalExpired === 0 && !force) {
      log.info('No expired records found, skipping cleanup');
      
      return {
        llmAuditDeleted: 0,
        intentHitLogDeleted: 0,
        negativeExamplesDeleted: 0,
        totalDeleted: 0,
        executionTime: 0,
        dryRun: false,
        retentionStatsBefore,
        retentionStatsAfter: retentionStatsBefore,
        warnings: ['No expired records found']
      };
    }
    
    // Perform cleanup (or simulate if dry run)
    let cleanupStats: CleanupStats;
    
    if (dryRun) {
      log.info('Dry run mode - simulating cleanup', { totalExpired });
      
      cleanupStats = {
        llmAuditDeleted: Math.floor(totalExpired * 0.6), // Simulate distribution
        intentHitLogDeleted: Math.floor(totalExpired * 0.4),
        negativeExamplesDeleted: 0,
        totalDeleted: totalExpired,
        executionTime: 0
      };
    } else {
      // Perform actual cleanup
      cleanupStats = await cleanupExpiredLogs();
      
      // Update job progress
      await job.updateProgress(100);
    }
    
    // Get retention stats after cleanup
    const retentionStatsAfter = dryRun ? retentionStatsBefore : await getRetentionStats();
    
    // Log completion
    log.info('Audit logs cleanup job completed', {
      jobId: job.id,
      dryRun,
      ...cleanupStats,
      warnings
    });
    
    return {
      ...cleanupStats,
      dryRun,
      retentionStatsBefore,
      retentionStatsAfter,
      warnings
    };
    
  } catch (error) {
    log.error('Audit logs cleanup job failed', {
      jobId: job.id,
      error,
      data: job.data
    });
    
    throw error;
  }
}

/**
 * Schedules the cleanup job to run daily
 */
export function getCleanupJobSchedule() {
  return {
    // Run daily at 2 AM
    pattern: '0 2 * * *',
    data: {
      force: false,
      dryRun: false,
      maxRecordsToDelete: 10000
    },
    opts: {
      removeOnComplete: 10, // Keep last 10 completed jobs
      removeOnFail: 5,      // Keep last 5 failed jobs
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000
      }
    }
  };
}

/**
 * Validates cleanup job data
 */
export function validateCleanupJobData(data: any): CleanupJobData {
  const validated: CleanupJobData = {};
  
  if (typeof data?.force === 'boolean') {
    validated.force = data.force;
  }
  
  if (typeof data?.dryRun === 'boolean') {
    validated.dryRun = data.dryRun;
  }
  
  if (typeof data?.maxRecordsToDelete === 'number' && data.maxRecordsToDelete > 0) {
    validated.maxRecordsToDelete = Math.min(data.maxRecordsToDelete, 50000); // Hard limit
  }
  
  return validated;
}

/**
 * Creates a manual cleanup job (for admin interface)
 */
export async function createManualCleanupJob(
  queue: any,
  options: CleanupJobData = {}
): Promise<Job<CleanupJobData>> {
  try {
    const validatedData = validateCleanupJobData(options);
    
    const job = await queue.add('cleanup-audit-logs', validatedData, {
      priority: 10, // High priority for manual jobs
      removeOnComplete: 5,
      removeOnFail: 3,
      attempts: 2
    });
    
    log.info('Manual cleanup job created', {
      jobId: job.id,
      data: validatedData
    });
    
    return job;
    
  } catch (error) {
    log.error('Failed to create manual cleanup job', { error, options });
    throw error;
  }
}

/**
 * Gets cleanup job status and history
 */
export async function getCleanupJobStatus(queue: any): Promise<{
  lastCompleted?: {
    id: string;
    completedOn: number;
    returnvalue: CleanupJobResult;
  };
  lastFailed?: {
    id: string;
    failedReason: string;
    processedOn: number;
  };
  waiting: number;
  active: number;
  completed: number;
  failed: number;
}> {
  try {
    const [waiting, active, completed, failed] = await Promise.all([
      queue.getWaiting(),
      queue.getActive(),
      queue.getCompleted(0, 0), // Get count only
      queue.getFailed(0, 0)     // Get count only
    ]);
    
    const [lastCompletedJobs, lastFailedJobs] = await Promise.all([
      queue.getCompleted(0, 0), // Get last completed
      queue.getFailed(0, 0)     // Get last failed
    ]);
    
    const result: any = {
      waiting: waiting.length,
      active: active.length,
      completed: completed.length,
      failed: failed.length
    };
    
    if (lastCompletedJobs.length > 0) {
      const lastCompleted = lastCompletedJobs[0];
      result.lastCompleted = {
        id: lastCompleted.id,
        completedOn: lastCompleted.processedOn || lastCompleted.finishedOn,
        returnvalue: lastCompleted.returnvalue
      };
    }
    
    if (lastFailedJobs.length > 0) {
      const lastFailed = lastFailedJobs[0];
      result.lastFailed = {
        id: lastFailed.id,
        failedReason: lastFailed.failedReason,
        processedOn: lastFailed.processedOn || lastFailed.finishedOn
      };
    }
    
    return result;
    
  } catch (error) {
    log.error('Failed to get cleanup job status', { error });
    throw error;
  }
}