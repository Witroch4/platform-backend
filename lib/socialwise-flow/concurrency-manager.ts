/**
 * SocialWise Flow Concurrency Manager
 * Implements LLM concurrency limits per inbox with graceful degradation
 * Requirements: 1.1, 1.4
 */

import { createLogger } from '@/lib/utils/logger';
import { getRedisInstance } from '@/lib/connections';
import { getSocialwiseFlowConfig } from '@/lib/config';

const concurrencyLogger = createLogger('SocialWise-Concurrency');

export interface ConcurrencyConfig {
  maxConcurrentLlmCallsPerInbox: number;
  maxConcurrentLlmCallsGlobal: number;
  queueTimeoutMs: number;
  degradationEnabled: boolean;
}

export interface ConcurrencyResult {
  allowed: boolean;
  reason?: string;
  waitTimeMs?: number;
  degradationTriggered?: boolean;
}

export interface QueuedOperation {
  id: string;
  inboxId: string;
  priority: 'high' | 'medium' | 'low';
  operation: () => Promise<any>;
  resolve: (value: any) => void;
  reject: (error: any) => void;
  enqueuedAt: number;
  timeoutMs: number;
}

/**
 * Manages LLM concurrency limits per inbox and globally
 */
export class ConcurrencyManager {
  private static instance: ConcurrencyManager;
  private redis: any;
  private config: ConcurrencyConfig;
  private activeOperations = new Map<string, Set<string>>(); // inboxId -> Set<operationId>
  private globalActiveCount = 0;
  private operationQueue: QueuedOperation[] = [];
  private processingQueue = false;

  private constructor(config: ConcurrencyConfig) {
    this.config = config;
    this.redis = getRedisInstance();
  }

  public static getInstance(config?: ConcurrencyConfig): ConcurrencyManager {
    if (!ConcurrencyManager.instance) {
      // Load configuration from centralized config system
      const socialwiseConfig = getSocialwiseFlowConfig();
      const defaultConfig: ConcurrencyConfig = {
        maxConcurrentLlmCallsPerInbox: socialwiseConfig.concurrency.max_concurrent_llm_calls_per_inbox,
        maxConcurrentLlmCallsGlobal: socialwiseConfig.concurrency.max_concurrent_llm_calls_global,
        queueTimeoutMs: socialwiseConfig.concurrency.queue_timeout_ms,
        degradationEnabled: socialwiseConfig.concurrency.degradation_enabled
      };
      ConcurrencyManager.instance = new ConcurrencyManager(config || defaultConfig);
    }
    return ConcurrencyManager.instance;
  }

  /**
   * Check if an LLM operation can proceed immediately
   */
  async checkConcurrency(inboxId: string, operationId: string): Promise<ConcurrencyResult> {
    try {
      const inboxActiveCount = this.activeOperations.get(inboxId)?.size || 0;
      
      // Check inbox-specific limit
      if (inboxActiveCount >= this.config.maxConcurrentLlmCallsPerInbox) {
        concurrencyLogger.warn('Inbox concurrency limit exceeded', {
          inboxId,
          activeCount: inboxActiveCount,
          limit: this.config.maxConcurrentLlmCallsPerInbox
        });
        
        return {
          allowed: false,
          reason: 'inbox_limit_exceeded',
          degradationTriggered: this.config.degradationEnabled
        };
      }

      // Check global limit
      if (this.globalActiveCount >= this.config.maxConcurrentLlmCallsGlobal) {
        concurrencyLogger.warn('Global concurrency limit exceeded', {
          globalActiveCount: this.globalActiveCount,
          limit: this.config.maxConcurrentLlmCallsGlobal
        });
        
        return {
          allowed: false,
          reason: 'global_limit_exceeded',
          degradationTriggered: this.config.degradationEnabled
        };
      }

      // Operation can proceed
      return { allowed: true };
      
    } catch (error) {
      concurrencyLogger.error('Error checking concurrency', {
        error: error instanceof Error ? error.message : String(error),
        inboxId,
        operationId
      });
      
      // Allow operation on error to avoid blocking
      return { allowed: true };
    }
  }

  /**
   * Acquire a concurrency slot for an LLM operation
   */
  async acquireSlot(inboxId: string, operationId: string): Promise<boolean> {
    try {
      const concurrencyCheck = await this.checkConcurrency(inboxId, operationId);
      
      if (!concurrencyCheck.allowed) {
        return false;
      }

      // Add to active operations
      if (!this.activeOperations.has(inboxId)) {
        this.activeOperations.set(inboxId, new Set());
      }
      this.activeOperations.get(inboxId)!.add(operationId);
      this.globalActiveCount++;

      concurrencyLogger.debug('Concurrency slot acquired', {
        inboxId,
        operationId,
        inboxActiveCount: this.activeOperations.get(inboxId)!.size,
        globalActiveCount: this.globalActiveCount
      });

      return true;
      
    } catch (error) {
      concurrencyLogger.error('Error acquiring concurrency slot', {
        error: error instanceof Error ? error.message : String(error),
        inboxId,
        operationId
      });
      return false;
    }
  }

  /**
   * Release a concurrency slot after LLM operation completes
   */
  async releaseSlot(inboxId: string, operationId: string): Promise<void> {
    try {
      const inboxOperations = this.activeOperations.get(inboxId);
      if (inboxOperations) {
        inboxOperations.delete(operationId);
        if (inboxOperations.size === 0) {
          this.activeOperations.delete(inboxId);
        }
      }
      
      if (this.globalActiveCount > 0) {
        this.globalActiveCount--;
      }

      concurrencyLogger.debug('Concurrency slot released', {
        inboxId,
        operationId,
        inboxActiveCount: this.activeOperations.get(inboxId)?.size || 0,
        globalActiveCount: this.globalActiveCount
      });

      // Process queued operations
      this.processQueue();
      
    } catch (error) {
      concurrencyLogger.error('Error releasing concurrency slot', {
        error: error instanceof Error ? error.message : String(error),
        inboxId,
        operationId
      });
    }
  }

  /**
   * Execute an LLM operation with concurrency control
   */
  async executeLlmOperation<T>(
    inboxId: string,
    operation: () => Promise<T>,
    options: {
      priority?: 'high' | 'medium' | 'low';
      timeoutMs?: number;
      allowDegradation?: boolean;
    } = {}
  ): Promise<T | null> {
    const operationId = `llm-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const priority = options.priority || 'medium';
    const timeoutMs = options.timeoutMs || this.config.queueTimeoutMs;
    const allowDegradation = options.allowDegradation ?? this.config.degradationEnabled;

    try {
      // Try to acquire slot immediately
      const acquired = await this.acquireSlot(inboxId, operationId);
      
      if (acquired) {
        try {
          const result = await operation();
          return result;
        } finally {
          await this.releaseSlot(inboxId, operationId);
        }
      }

      // If degradation is enabled and slot not available, return null
      if (allowDegradation) {
        concurrencyLogger.info('LLM operation degraded due to concurrency limits', {
          inboxId,
          operationId,
          priority
        });
        return null;
      }

      // Queue the operation for later execution
      return await this.queueOperation(inboxId, operationId, operation, priority, timeoutMs);
      
    } catch (error) {
      concurrencyLogger.error('Error executing LLM operation', {
        error: error instanceof Error ? error.message : String(error),
        inboxId,
        operationId
      });
      
      // Release slot if it was acquired
      await this.releaseSlot(inboxId, operationId);
      throw error;
    }
  }

  /**
   * Queue an operation for later execution
   */
  private async queueOperation<T>(
    inboxId: string,
    operationId: string,
    operation: () => Promise<T>,
    priority: 'high' | 'medium' | 'low',
    timeoutMs: number
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const queuedOp: QueuedOperation = {
        id: operationId,
        inboxId,
        priority,
        operation,
        resolve,
        reject,
        enqueuedAt: Date.now(),
        timeoutMs
      };

      // Insert based on priority
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      let insertIndex = this.operationQueue.length;
      
      for (let i = 0; i < this.operationQueue.length; i++) {
        if (priorityOrder[priority] < priorityOrder[this.operationQueue[i].priority]) {
          insertIndex = i;
          break;
        }
      }
      
      this.operationQueue.splice(insertIndex, 0, queuedOp);

      // Set timeout for queued operation
      setTimeout(() => {
        const index = this.operationQueue.findIndex(op => op.id === operationId);
        if (index !== -1) {
          this.operationQueue.splice(index, 1);
          reject(new Error(`Operation timed out in queue after ${timeoutMs}ms`));
        }
      }, timeoutMs);

      concurrencyLogger.debug('Operation queued', {
        operationId,
        inboxId,
        priority,
        queueLength: this.operationQueue.length,
        timeoutMs
      });

      // Try to process queue
      this.processQueue();
    });
  }

  /**
   * Process queued operations when slots become available
   */
  private async processQueue(): Promise<void> {
    if (this.processingQueue || this.operationQueue.length === 0) {
      return;
    }

    this.processingQueue = true;

    try {
      while (this.operationQueue.length > 0) {
        const queuedOp = this.operationQueue[0];
        
        // Check if operation has timed out
        const waitTime = Date.now() - queuedOp.enqueuedAt;
        if (waitTime > queuedOp.timeoutMs) {
          this.operationQueue.shift();
          queuedOp.reject(new Error(`Operation timed out in queue after ${waitTime}ms`));
          continue;
        }

        // Try to acquire slot for queued operation
        const acquired = await this.acquireSlot(queuedOp.inboxId, queuedOp.id);
        
        if (!acquired) {
          // No slots available, stop processing
          break;
        }

        // Remove from queue and execute
        this.operationQueue.shift();
        
        try {
          const result = await queuedOp.operation();
          queuedOp.resolve(result);
        } catch (error) {
          queuedOp.reject(error);
        } finally {
          await this.releaseSlot(queuedOp.inboxId, queuedOp.id);
        }
      }
    } finally {
      this.processingQueue = false;
    }
  }

  /**
   * Get current concurrency statistics
   */
  getConcurrencyStats(): {
    globalActive: number;
    globalLimit: number;
    inboxStats: Array<{ inboxId: string; active: number; limit: number }>;
    queueLength: number;
  } {
    const inboxStats = Array.from(this.activeOperations.entries()).map(([inboxId, operations]) => ({
      inboxId,
      active: operations.size,
      limit: this.config.maxConcurrentLlmCallsPerInbox
    }));

    return {
      globalActive: this.globalActiveCount,
      globalLimit: this.config.maxConcurrentLlmCallsGlobal,
      inboxStats,
      queueLength: this.operationQueue.length
    };
  }

  /**
   * Update concurrency configuration
   */
  updateConfig(newConfig: Partial<ConcurrencyConfig>): void {
    this.config = { ...this.config, ...newConfig };
    concurrencyLogger.info('Concurrency configuration updated', this.config);
  }
}

/**
 * Convenience function to get the singleton concurrency manager
 */
export function getConcurrencyManager(config?: ConcurrencyConfig): ConcurrencyManager {
  return ConcurrencyManager.getInstance(config);
}