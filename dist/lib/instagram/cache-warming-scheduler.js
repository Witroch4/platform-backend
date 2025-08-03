"use strict";
/**
 * Cache Warming Scheduler for Instagram Translation
 *
 * Automatically warms the Instagram template cache with frequently accessed
 * templates to improve response times and reduce database load.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.cacheWarmingScheduler = void 0;
exports.triggerCacheWarming = triggerCacheWarming;
exports.getCacheWarmingStats = getCacheWarmingStats;
exports.updateCacheWarmingConfig = updateCacheWarmingConfig;
const client_1 = require("@prisma/client");
const instagram_template_cache_1 = require("../cache/instagram-template-cache");
const optimized_database_queries_1 = require("./optimized-database-queries");
const DEFAULT_CONFIG = {
    enabled: true,
    intervalMs: 30 * 60 * 1000, // 30 minutes
    batchSize: 10,
    maxTemplates: 100,
    priorityThresholdDays: 7,
    warmingTimeoutMs: 60000, // 1 minute
};
class CacheWarmingScheduler {
    config;
    prisma;
    warmingInterval;
    isWarming = false;
    warmingStats = {
        totalRuns: 0,
        successfulWarmings: 0,
        failedWarmings: 0,
        lastRun: null,
        lastRunDuration: 0,
        templatesWarmed: 0,
    };
    constructor(config = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.prisma = new client_1.PrismaClient();
        // Don't start scheduler in test environment
        if (this.config.enabled && process.env.NODE_ENV !== 'test') {
            this.startScheduler();
        }
    }
    // Start the warming scheduler
    startScheduler() {
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
    async performCacheWarming() {
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
                const batchResults = await Promise.allSettled(batch.map(template => this.warmTemplate(template)));
                // Count results
                for (const result of batchResults) {
                    if (result.status === 'fulfilled' && result.value) {
                        warmed++;
                    }
                    else {
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
        }
        catch (error) {
            console.error('[CacheWarmingScheduler] Cache warming error:', error);
            this.warmingStats.failedWarmings++;
        }
        finally {
            this.isWarming = false;
        }
    }
    // Get templates that should be warmed based on priority
    async getTemplatesToWarm() {
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
            const accessInfos = recentMappings.map(mapping => {
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
            const templatesToWarm = [];
            for (const template of prioritizedTemplates) {
                // Get the inbox to find usuarioChatwitId
                const inbox = await this.prisma.chatwitInbox.findUnique({
                    where: { id: template.inboxId },
                    select: { usuarioChatwitId: true }
                });
                if (!inbox) {
                    console.warn(`[CacheWarmingScheduler] Inbox not found: ${template.inboxId}`);
                    continue;
                }
                const cached = await instagram_template_cache_1.instagramTemplateCache.getTemplateMapping(template.intentName, inbox.usuarioChatwitId, template.inboxId);
                if (!cached) {
                    templatesToWarm.push(template);
                }
            }
            return templatesToWarm;
        }
        catch (error) {
            console.error('[CacheWarmingScheduler] Error getting templates to warm:', error);
            return [];
        }
    }
    // Warm a single template
    async warmTemplate(template) {
        try {
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('Warming timeout')), this.config.warmingTimeoutMs);
            });
            const warmingPromise = (0, optimized_database_queries_1.findOptimizedCompleteMessageMapping)(template.intentName, template.inboxId);
            // Race between warming and timeout
            const result = await Promise.race([warmingPromise, timeoutPromise]);
            if (result) {
                console.log(`[CacheWarmingScheduler] Warmed template: ${template.intentName}:${template.inboxId}`);
                return true;
            }
            else {
                console.warn(`[CacheWarmingScheduler] Template not found: ${template.intentName}:${template.inboxId}`);
                return false;
            }
        }
        catch (error) {
            console.error(`[CacheWarmingScheduler] Error warming template ${template.intentName}:${template.inboxId}:`, error);
            return false;
        }
    }
    // Get warming statistics
    getStats() {
        return {
            ...this.warmingStats,
            isWarming: this.isWarming,
            config: this.config,
        };
    }
    // Update configuration
    updateConfig(newConfig) {
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
            }
            else {
                this.stopScheduler();
            }
        }
    }
    // Stop the scheduler
    stopScheduler() {
        if (this.warmingInterval) {
            clearInterval(this.warmingInterval);
            this.warmingInterval = undefined;
        }
        console.log('[CacheWarmingScheduler] Scheduler stopped');
    }
    // Manually trigger cache warming
    async triggerWarming() {
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
        }
        catch (error) {
            return {
                success: false,
                message: `Cache warming failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
            };
        }
    }
    // Shutdown the scheduler
    async shutdown() {
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
exports.cacheWarmingScheduler = new CacheWarmingScheduler();
// Utility functions
async function triggerCacheWarming() {
    return exports.cacheWarmingScheduler.triggerWarming();
}
function getCacheWarmingStats() {
    return exports.cacheWarmingScheduler.getStats();
}
function updateCacheWarmingConfig(config) {
    exports.cacheWarmingScheduler.updateConfig(config);
}
// Graceful shutdown handling
process.on('SIGTERM', () => {
    console.log('[CacheWarmingScheduler] Received SIGTERM, shutting down...');
    exports.cacheWarmingScheduler.shutdown().catch(error => {
        console.error('[CacheWarmingScheduler] Error during shutdown:', error);
    });
});
process.on('SIGINT', () => {
    console.log('[CacheWarmingScheduler] Received SIGINT, shutting down...');
    exports.cacheWarmingScheduler.shutdown().catch(error => {
        console.error('[CacheWarmingScheduler] Error during shutdown:', error);
    });
});
console.log('[CacheWarmingScheduler] Cache warming scheduler initialized');
