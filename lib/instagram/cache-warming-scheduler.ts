/**
 * Cache Warming Scheduler for Instagram Translation
 * 
 * Automatically warms the Instagram template cache with frequently accessed
 * templates to improve response times and reduce database load.
 */

import { PrismaClient } from '@prisma/client';
import { instagramTemplateCache } from '../cache/instagram-template-cache';
import { findOptimizedCompleteMessageMapping } from './optimized-database-queries';

// Warming configuration
interface CacheWarmingConfig {
  enabled: boolean;
  intervalMs: number; // How often to run warming
  batchSize: number; // How many templates to warm at once
  maxTemplates: number; // Maximum templates to warm per run
  priorityThresholdDays: number; // Templates accessed within this many days get priority
  warmingTimeoutMs: number; // Timeout for warming operation
}

const DEFAULT_CONFIG: CacheWarmingConfig = {
  enabled: true,
  intervalMs: 30 * 60 * 1000, // 30 minutes
  batchSize: 10,
  maxTemplates: 100,
  priorityThresholdDays: 7,
  warmingTimeoutMs: 60000, // 1 minute
};

// Template access tracking
interface TemplateAccessInfo {
  intentName: string;
  inboxId: string;
  accessCount: number;
  lastAccessed: Date;
  averageResponseTime: number;
  priority: number;
}

class CacheWarmingScheduler {
  private config: CacheWarmingConfig;
  private prisma: PrismaClient;
  private warmingInterval?: NodeJS.Timeout;
  private isWarming = false;
  private warmingStats = {
    totalRuns: 0,
    successfulWarmings: 0,
    failedWarmings: 0,
    lastRun: null as Date | null,
    lastRunDuration: 0,
    templatesWarmed: 0,
  };

  constructor(config: Partial<CacheWarmingConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.prisma = new PrismaClient();
    
    // Don't start scheduler in test environment
    if (this.config.enabled && process.env.NODE_ENV !== 'test') {
      this.startScheduler();
    }
  }

  // Start the warming scheduler
  private startScheduler(): void {
    if (this.warmingInterval) {
      clearInterval(this.warmingInterval);
    }

    this.warmingInterval = setInterval(() => {
      this.performCacheWarming().catch(error => {
        console.error('[CacheWarmingScheduler] Warming failed:', error);
      });
    }, this.config.intervalMs);

    console.log('[CacheWarmingScheduler] Scheduler started', {
      intervalMs: this.config.intervalMs,
      batchSize: this.config.batchSize,
      maxTemplates: this.config.maxTemplates,
    });

    // Perform initial warming
    setTimeout(() => {
      this.performCacheWarming().catch(error => {
        console.error('[CacheWarmingScheduler] Initial warming failed:', error);
      });
    }, 5000); // Wait 5 seconds after startup
  }

  // Perform cache warming operation
  private async performCacheWarming(): Promise<void> {
    if (this.isWarming) {
      console.log('[CacheWarmingScheduler] Warming already in progress, skipping');
      return;
    }

    this.isWarming = true;
    const startTime = Date.now();
    this.warmingStats.totalRuns++;
    this.warmingStats.lastRun = new Date();

    try {
      console.log('[CacheWarmingScheduler] Starting cache warming');

      // Get templates to warm based on priority
      const templatesToWarm = await this.getTemplatesToWarm();
      
      if (templatesToWarm.length === 0) {
        console.log('[CacheWarmingScheduler] No templates to warm');
        return;
      }

      console.log(`[CacheWarmingScheduler] Found ${templatesToWarm.length} templates to warm`);

      // Warm templates in batches
      let warmed = 0;
      let failed = 0;

      for (let i = 0; i < templatesToWarm.length; i += this.config.batchSize) {
        const batch = templatesToWarm.slice(i, i + this.config.batchSize);
        
        const batchResults = await Promise.allSettled(
          batch.map(template => this.warmTemplate(template))
        );

        // Count results
        for (const result of batchResults) {
          if (result.status === 'fulfilled' && result.value) {
            warmed++;
          } else {
            failed++;
          }
        }

        // Add small delay between batches to avoid overwhelming the system
        if (i + this.config.batchSize < templatesToWarm.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      this.warmingStats.successfulWarmings += warmed;
      this.warmingStats.failedWarmings += failed;
      this.warmingStats.templatesWarmed += warmed;

      const duration = Date.now() - startTime;
      this.warmingStats.lastRunDuration = duration;

      console.log('[CacheWarmingScheduler] Cache warming completed', {
        templatesWarmed: warmed,
        templatesFailed: failed,
        duration,
        totalTemplates: templatesToWarm.length,
      });

    } catch (error) {
      console.error('[CacheWarmingScheduler] Cache warming error:', error);
      this.warmingStats.failedWarmings++;
    } finally {
      this.isWarming = false;
    }
  }

  // Get templates that should be warmed based on priority
  private async getTemplatesToWarm(): Promise<TemplateAccessInfo[]> {
    try {
      // Get recently accessed templates from database
      const recentMappings = await this.prisma.mapeamentoIntencao.findMany({
        where: {
          updatedAt: {
            gte: new Date(Date.now() - this.config.priorityThresholdDays * 24 * 60 * 60 * 1000),
          },
        },
        select: {
          intentName: true,
          inboxId: true,
          updatedAt: true,
        },
        orderBy: {
          updatedAt: 'desc',
        },
        take: this.config.maxTemplates * 2, // Get more than needed for filtering
      });

      // Convert to access info and calculate priorities
      const accessInfos: TemplateAccessInfo[] = recentMappings.map(mapping => {
        const daysSinceAccess = (Date.now() - mapping.updatedAt.getTime()) / (24 * 60 * 60 * 1000);
        const priority = Math.max(1, 10 - daysSinceAccess); // Higher priority for more recent access
        
        return {
          intentName: mapping.intentName,
          inboxId: mapping.inboxId,
          accessCount: 1, // We don't track this yet, so assume 1
          lastAccessed: mapping.updatedAt,
          averageResponseTime: 0, // We don't track this yet
          priority,
        };
      });

      // Sort by priority and limit
      const prioritizedTemplates = accessInfos
        .sort((a, b) => b.priority - a.priority)
        .slice(0, this.config.maxTemplates);

      // Filter out templates that are already cached
      const templatesToWarm: TemplateAccessInfo[] = [];
      
      for (const template of prioritizedTemplates) {
        const cached = await instagramTemplateCache.getTemplateMapping(
          template.intentName, 
          template.inboxId
        );
        
        if (!cached) {
          templatesToWarm.push(template);
        }
      }

      return templatesToWarm;

    } catch (error) {
      console.error('[CacheWarmingScheduler] Error getting templates to warm:', error);
      return [];
    }
  }

  // Warm a single template
  private async warmTemplate(template: TemplateAccessInfo): Promise<boolean> {
    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Warming timeout')), this.config.warmingTimeoutMs);
      });

      const warmingPromise = findOptimizedCompleteMessageMapping(
        template.intentName,
        template.inboxId
      );

      // Race between warming and timeout
      const result = await Promise.race([warmingPromise, timeoutPromise]);

      if (result) {
        console.log(`[CacheWarmingScheduler] Warmed template: ${template.intentName}:${template.inboxId}`);
        return true;
      } else {
        console.warn(`[CacheWarmingScheduler] Template not found: ${template.intentName}:${template.inboxId}`);
        return false;
      }

    } catch (error) {
      console.error(`[CacheWarmingScheduler] Error warming template ${template.intentName}:${template.inboxId}:`, error);
      return false;
    }
  }

  // Get warming statistics
  getStats(): typeof this.warmingStats & { isWarming: boolean; config: CacheWarmingConfig } {
    return {
      ...this.warmingStats,
      isWarming: this.isWarming,
      config: this.config,
    };
  }

  // Update configuration
  updateConfig(newConfig: Partial<CacheWarmingConfig>): void {
    const oldConfig = { ...this.config };
    this.config = { ...this.config, ...newConfig };

    console.log('[CacheWarmingScheduler] Configuration updated', {
      oldConfig,
      newConfig: this.config,
    });

    // Restart scheduler if interval changed
    if (oldConfig.intervalMs !== this.config.intervalMs || oldConfig.enabled !== this.config.enabled) {
      if (this.config.enabled) {
        this.startScheduler();
      } else {
        this.stopScheduler();
      }
    }
  }

  // Stop the scheduler
  stopScheduler(): void {
    if (this.warmingInterval) {
      clearInterval(this.warmingInterval);
      this.warmingInterval = undefined;
    }

    console.log('[CacheWarmingScheduler] Scheduler stopped');
  }

  // Manually trigger cache warming
  async triggerWarming(): Promise<{ success: boolean; message: string; stats?: any }> {
    if (this.isWarming) {
      return {
        success: false,
        message: 'Cache warming is already in progress',
      };
    }

    try {
      await this.performCacheWarming();
      return {
        success: true,
        message: 'Cache warming completed successfully',
        stats: this.getStats(),
      };
    } catch (error) {
      return {
        success: false,
        message: `Cache warming failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  // Shutdown the scheduler
  async shutdown(): Promise<void> {
    this.stopScheduler();
    
    // Wait for current warming to complete
    while (this.isWarming) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    await this.prisma.$disconnect();
    console.log('[CacheWarmingScheduler] Shutdown completed');
  }
}

// Global scheduler instance
export const cacheWarmingScheduler = new CacheWarmingScheduler();

// Utility functions
export async function triggerCacheWarming(): Promise<ReturnType<CacheWarmingScheduler['triggerWarming']>> {
  return cacheWarmingScheduler.triggerWarming();
}

export function getCacheWarmingStats(): ReturnType<CacheWarmingScheduler['getStats']> {
  return cacheWarmingScheduler.getStats();
}

export function updateCacheWarmingConfig(config: Partial<CacheWarmingConfig>): void {
  cacheWarmingScheduler.updateConfig(config);
}

// Graceful shutdown handling
process.on('SIGTERM', () => {
  console.log('[CacheWarmingScheduler] Received SIGTERM, shutting down...');
  cacheWarmingScheduler.shutdown().catch(error => {
    console.error('[CacheWarmingScheduler] Error during shutdown:', error);
  });
});

process.on('SIGINT', () => {
  console.log('[CacheWarmingScheduler] Received SIGINT, shutting down...');
  cacheWarmingScheduler.shutdown().catch(error => {
    console.error('[CacheWarmingScheduler] Error during shutdown:', error);
  });
});

console.log('[CacheWarmingScheduler] Cache warming scheduler initialized');