/**
 * Parallel Processing Manager
 * Coordinates multiple lead processing operations in TURBO mode
 * Based on requirements 2.1, 2.2, 2.6
 */

import { TurboModeAccessService } from '@/lib/turbo-mode/user-access-service';
import { getRedisInstance } from '@/lib/connections';
import log from '@/lib/utils/logger';

export interface ProcessingTask {
  id: string;
  leadId: string;
  type: 'pdf_unification' | 'image_generation';
  priority: number;
  data: any;
  createdAt: Date;
}

export interface ProcessingResult {
  taskId: string;
  leadId: string;
  success: boolean;
  result?: any;
  error?: string;
  processingTime: number;
  startedAt: Date;
  completedAt: Date;
}

export interface ParallelProcessingStats {
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  averageProcessingTime: number;
  parallelEfficiency: number;
}

export class ParallelProcessingManager {
  private static instance: ParallelProcessingManager;
  private redis: ReturnType<typeof getRedisInstance>;
  private activeProcesses: Map<string, ProcessingTask> = new Map();
  private processingResults: Map<string, ProcessingResult> = new Map();
  
  private readonly MAX_RETRIES = 3;
  private readonly RETRY_DELAY_MS = 1000;
  private readonly PROCESS_TIMEOUT_MS = 300000; // 5 minutes

  constructor() {
    this.redis = getRedisInstance();
  }

  static getInstance(): ParallelProcessingManager {
    if (!ParallelProcessingManager.instance) {
      ParallelProcessingManager.instance = new ParallelProcessingManager();
    }
    return ParallelProcessingManager.instance;
  }

  /**
   * Process multiple tasks in parallel with TURBO mode
   */
  async processInParallel<T>(
    tasks: ProcessingTask[],
    processor: (task: ProcessingTask) => Promise<T>,
    userId: string
  ): Promise<ProcessingResult[]> {
    const startTime = Date.now();
    
    try {
      // Check TURBO mode access
      const hasAccess = await TurboModeAccessService.hasAccess(userId);
      if (!hasAccess) {
        log.warn('[ParallelProcessing] User does not have TURBO access, falling back to sequential', {
          userId
        });
        return await this.processSequentially(tasks, processor);
      }

      const config = TurboModeAccessService.getConfig();
      const batchSize = Math.min(tasks.length, config.maxParallelLeads);
      
      log.info('[ParallelProcessing] Starting parallel processing', {
        userId,
        totalTasks: tasks.length,
        batchSize,
        maxParallel: config.maxParallelLeads
      });

      // Process tasks in batches
      const results: ProcessingResult[] = [];
      for (let i = 0; i < tasks.length; i += batchSize) {
        const batch = tasks.slice(i, i + batchSize);
        const batchResults = await this.processBatch(batch, processor, config);
        results.push(...batchResults);
        
        // Check if we should continue or fallback
        const failureRate = batchResults.filter(r => !r.success).length / batchResults.length;
        if (failureRate > 0.5) { // More than 50% failure rate
          log.warn('[ParallelProcessing] High failure rate detected, falling back to sequential', {
            userId,
            failureRate,
            batch: i / batchSize + 1
          });
          
          // Process remaining tasks sequentially
          const remainingTasks = tasks.slice(i + batchSize);
          if (remainingTasks.length > 0) {
            const sequentialResults = await this.processSequentially(remainingTasks, processor);
            results.push(...sequentialResults);
          }
          break;
        }
      }

      const totalTime = Date.now() - startTime;
      await this.recordProcessingStats(userId, results, totalTime, true);

      log.info('[ParallelProcessing] Parallel processing completed', {
        userId,
        totalTasks: tasks.length,
        successfulTasks: results.filter(r => r.success).length,
        failedTasks: results.filter(r => !r.success).length,
        totalTime
      });

      return results;

    } catch (error) {
      log.error('[ParallelProcessing] Parallel processing failed, falling back to sequential', {
        userId,
        error
      });
      
      // Fallback to sequential processing
      return await this.processSequentially(tasks, processor);
    }
  }

  /**
   * Process tasks sequentially as fallback
   */
  async processSequentially<T>(
    tasks: ProcessingTask[],
    processor: (task: ProcessingTask) => Promise<T>
  ): Promise<ProcessingResult[]> {
    const results: ProcessingResult[] = [];
    
    for (const task of tasks) {
      const startTime = Date.now();
      const startedAt = new Date();
      
      try {
        const result = await processor(task);
        const completedAt = new Date();
        
        results.push({
          taskId: task.id,
          leadId: task.leadId,
          success: true,
          result,
          processingTime: Date.now() - startTime,
          startedAt,
          completedAt
        });
        
        log.info('[ParallelProcessing] Sequential task completed', {
          taskId: task.id,
          leadId: task.leadId,
          processingTime: Date.now() - startTime
        });
        
      } catch (error) {
        const completedAt = new Date();
        
        results.push({
          taskId: task.id,
          leadId: task.leadId,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          processingTime: Date.now() - startTime,
          startedAt,
          completedAt
        });
        
        log.error('[ParallelProcessing] Sequential task failed', {
          taskId: task.id,
          leadId: task.leadId,
          error
        });
      }
    }
    
    return results;
  }

  /**
   * Process a batch of tasks in parallel
   */
  private async processBatch<T>(
    tasks: ProcessingTask[],
    processor: (task: ProcessingTask) => Promise<T>,
    config: any
  ): Promise<ProcessingResult[]> {
    // Register active processes
    for (const task of tasks) {
      this.activeProcesses.set(task.id, task);
      await this.redis.sadd('turbo_mode_active_processes', task.id);
    }

    try {
      // Create processing promises with timeout
      const processingPromises = tasks.map(task => 
        this.processTaskWithTimeout(task, processor, config.timeoutMs)
      );

      // Wait for all tasks to complete
      const results = await Promise.allSettled(processingPromises);
      
      // Convert results
      const processedResults: ProcessingResult[] = results.map((result, index) => {
        const task = tasks[index];
        
        if (result.status === 'fulfilled') {
          return result.value;
        } else {
          return {
            taskId: task.id,
            leadId: task.leadId,
            success: false,
            error: result.reason instanceof Error ? result.reason.message : 'Processing failed',
            processingTime: config.timeoutMs,
            startedAt: new Date(),
            completedAt: new Date()
          };
        }
      });

      return processedResults;

    } finally {
      // Clean up active processes
      for (const task of tasks) {
        this.activeProcesses.delete(task.id);
        await this.redis.srem('turbo_mode_active_processes', task.id);
      }
    }
  }

  /**
   * Process a single task with timeout and retry logic
   */
  private async processTaskWithTimeout<T>(
    task: ProcessingTask,
    processor: (task: ProcessingTask) => Promise<T>,
    timeoutMs: number
  ): Promise<ProcessingResult> {
    const startTime = Date.now();
    const startedAt = new Date();
    
    let lastError: Error | null = null;
    
    // Retry logic
    for (let attempt = 1; attempt <= this.MAX_RETRIES; attempt++) {
      try {
        // Create timeout promise
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Processing timeout')), timeoutMs);
        });

        // Race between processing and timeout
        const result = await Promise.race([
          processor(task),
          timeoutPromise
        ]);

        const completedAt = new Date();
        
        log.info('[ParallelProcessing] Task completed successfully', {
          taskId: task.id,
          leadId: task.leadId,
          attempt,
          processingTime: Date.now() - startTime
        });

        return {
          taskId: task.id,
          leadId: task.leadId,
          success: true,
          result,
          processingTime: Date.now() - startTime,
          startedAt,
          completedAt
        };

      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');
        
        log.warn('[ParallelProcessing] Task attempt failed', {
          taskId: task.id,
          leadId: task.leadId,
          attempt,
          error: lastError.message
        });

        // Wait before retry (except on last attempt)
        if (attempt < this.MAX_RETRIES) {
          await new Promise(resolve => setTimeout(resolve, this.RETRY_DELAY_MS * attempt));
        }
      }
    }

    // All attempts failed
    const completedAt = new Date();
    
    log.error('[ParallelProcessing] Task failed after all retries', {
      taskId: task.id,
      leadId: task.leadId,
      attempts: this.MAX_RETRIES,
      error: lastError?.message
    });

    return {
      taskId: task.id,
      leadId: task.leadId,
      success: false,
      error: lastError?.message || 'Unknown error',
      processingTime: Date.now() - startTime,
      startedAt,
      completedAt
    };
  }

  /**
   * Get current processing statistics
   */
  async getProcessingStats(): Promise<ParallelProcessingStats> {
    try {
      const activeProcessCount = await this.redis.scard('turbo_mode_active_processes') || 0;
      
      // Get recent processing results from Redis
      const recentResults = await this.redis.lrange('turbo_mode_results', 0, 99);
      const results = recentResults.map((r: string) => JSON.parse(r) as ProcessingResult);
      
      const totalTasks = results.length;
      const completedTasks = results.filter((r: ProcessingResult) => r.success).length;
      const failedTasks = results.filter((r: ProcessingResult) => !r.success).length;
      
      const averageProcessingTime = totalTasks > 0 
        ? results.reduce((sum: number, r: ProcessingResult) => sum + r.processingTime, 0) / totalTasks 
        : 0;
      
      // Calculate parallel efficiency (simplified)
      const parallelEfficiency = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;

      return {
        totalTasks,
        completedTasks,
        failedTasks,
        averageProcessingTime,
        parallelEfficiency
      };
    } catch (error) {
      log.error('[ParallelProcessing] Error getting processing stats', { error });
      return {
        totalTasks: 0,
        completedTasks: 0,
        failedTasks: 0,
        averageProcessingTime: 0,
        parallelEfficiency: 0
      };
    }
  }

  /**
   * Cancel all active processes for a user
   */
  async cancelActiveProcesses(userId: string): Promise<void> {
    try {
      const activeProcessIds = await this.redis.smembers('turbo_mode_active_processes');
      
      for (const processId of activeProcessIds) {
        const process = this.activeProcesses.get(processId);
        if (process) {
          this.activeProcesses.delete(processId);
          await this.redis.srem('turbo_mode_active_processes', processId);
        }
      }

      log.info('[ParallelProcessing] Active processes cancelled', {
        userId,
        cancelledProcesses: activeProcessIds.length
      });
    } catch (error) {
      log.error('[ParallelProcessing] Error cancelling active processes', { userId, error });
    }
  }

  /**
   * Record processing statistics for monitoring
   */
  private async recordProcessingStats(
    userId: string,
    results: ProcessingResult[],
    totalTime: number,
    wasParallel: boolean
  ): Promise<void> {
    try {
      const stats = {
        userId,
        totalTasks: results.length,
        successfulTasks: results.filter(r => r.success).length,
        failedTasks: results.filter(r => !r.success).length,
        totalTime,
        wasParallel,
        timestamp: new Date().toISOString()
      };

      // Store in Redis for monitoring
      await this.redis.lpush('turbo_mode_stats', JSON.stringify(stats));
      await this.redis.ltrim('turbo_mode_stats', 0, 999); // Keep last 1000 entries

      // Store individual results
      for (const result of results) {
        await this.redis.lpush('turbo_mode_results', JSON.stringify(result));
      }
      await this.redis.ltrim('turbo_mode_results', 0, 999); // Keep last 1000 results

    } catch (error) {
      log.error('[ParallelProcessing] Error recording processing stats', { userId, error });
    }
  }
}

// Export singleton instance getter
export const getParallelProcessingManager = () => {
  return ParallelProcessingManager.getInstance();
};