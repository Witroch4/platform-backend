"use strict";
/**
 * Cache Optimizer Service
 *
 * Intelligent cache optimization with automatic memory management,
 * hit rate monitoring, and performance tuning
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.CacheOptimizerService = void 0;
exports.getCacheOptimizerService = getCacheOptimizerService;
const events_1 = require("events");
const cache_manager_1 = require("./cache-manager");
const metrics_cache_1 = require("./metrics-cache");
class CacheOptimizerService extends events_1.EventEmitter {
    static instance = null;
    cacheManager;
    metricsCache;
    config;
    optimizationTimer = null;
    isOptimizing = false;
    metrics = {
        hitRate: 0,
        memoryUsage: 0,
        keyCount: 0,
        evictionRate: 0,
        avgResponseTime: 0
    };
    constructor(config) {
        super();
        this.cacheManager = (0, cache_manager_1.getCacheManager)();
        this.metricsCache = (0, metrics_cache_1.getMetricsCache)();
        this.config = {
            maxMemoryUsage: 0.8, // 80%
            targetHitRate: 0.9, // 90%
            optimizationInterval: 5 * 60 * 1000, // 5 minutes
            warmupEnabled: true,
            compressionEnabled: true,
            ...config
        };
        this.startOptimizationScheduler();
    }
    /**
     * Get singleton instance
     */
    static getInstance(config) {
        if (!CacheOptimizerService.instance) {
            CacheOptimizerService.instance = new CacheOptimizerService(config);
        }
        return CacheOptimizerService.instance;
    }
    /**
     * Start automatic cache optimization
     */
    startOptimizationScheduler() {
        this.optimizationTimer = setInterval(async () => {
            try {
                await this.optimizeCache();
            }
            catch (error) {
                console.error('Cache optimization failed:', error);
                this.emit('optimization_error', error);
            }
        }, this.config.optimizationInterval);
        console.log(`Cache optimizer started with ${this.config.optimizationInterval}ms interval`);
    }
    /**
     * Perform intelligent cache optimization
     */
    async optimizeCache() {
        if (this.isOptimizing) {
            return { keysRemoved: 0, memoryFreed: 0, hitRateImprovement: 0, optimizationTime: 0 };
        }
        this.isOptimizing = true;
        const startTime = Date.now();
        try {
            // Collect current metrics
            await this.collectMetrics();
            let result = {
                keysRemoved: 0,
                memoryFreed: 0,
                hitRateImprovement: 0,
                optimizationTime: 0
            };
            // Check if optimization is needed
            if (this.needsOptimization()) {
                // Perform memory optimization
                if (this.metrics.memoryUsage > this.config.maxMemoryUsage) {
                    const memoryResult = await this.optimizeMemoryUsage();
                    result.keysRemoved += memoryResult.keysRemoved;
                    result.memoryFreed += memoryResult.memoryFreed;
                }
                // Perform hit rate optimization
                if (this.metrics.hitRate < this.config.targetHitRate) {
                    const hitRateResult = await this.optimizeHitRate();
                    result.hitRateImprovement = hitRateResult.improvement;
                }
                // Perform cache warmup if enabled
                if (this.config.warmupEnabled) {
                    await this.performCacheWarmup();
                }
                // Clean up expired keys
                const cleanupResult = await this.cleanupExpiredKeys();
                result.keysRemoved += cleanupResult.keysRemoved;
                result.memoryFreed += cleanupResult.memoryFreed;
            }
            result.optimizationTime = Date.now() - startTime;
            // Update metrics after optimization
            await this.collectMetrics();
            this.emit('optimization_completed', result);
            return result;
        }
        finally {
            this.isOptimizing = false;
        }
    }
    /**
     * Collect cache metrics
     */
    async collectMetrics() {
        try {
            const redisInfo = await this.cacheManager.getRedisInfo();
            const cacheStats = this.cacheManager.getStats();
            this.metrics = {
                hitRate: cacheStats.hitRate,
                memoryUsage: parseInt(redisInfo.used_memory || '0') / parseInt(redisInfo.maxmemory || '1'),
                keyCount: parseInt(redisInfo.db0?.split(',')[0]?.split('=')[1] || '0'),
                evictionRate: parseInt(redisInfo.evicted_keys || '0'),
                avgResponseTime: 0 // Would need to be calculated from response times
            };
            this.emit('metrics_collected', this.metrics);
        }
        catch (error) {
            console.error('Failed to collect cache metrics:', error);
        }
    }
    /**
     * Check if optimization is needed
     */
    needsOptimization() {
        return (this.metrics.memoryUsage > this.config.maxMemoryUsage ||
            this.metrics.hitRate < this.config.targetHitRate ||
            this.metrics.evictionRate > 100 // More than 100 evictions
        );
    }
    /**
     * Optimize memory usage by removing least important keys
     */
    async optimizeMemoryUsage() {
        let keysRemoved = 0;
        let memoryFreed = 0;
        try {
            const beforeMemory = parseInt((await this.cacheManager.getRedisInfo()).used_memory || '0');
            // Remove old aggregated data first (least critical)
            const aggregatedKeys = await this.cacheManager.deletePattern('metrics:aggregated:*');
            keysRemoved += aggregatedKeys;
            // Remove old comparison data
            const comparisonKeys = await this.cacheManager.deletePattern('metrics:comparison:*');
            keysRemoved += comparisonKeys;
            // Remove old summary data
            const summaryKeys = await this.cacheManager.deletePattern('metrics:summary:*');
            keysRemoved += summaryKeys;
            const afterMemory = parseInt((await this.cacheManager.getRedisInfo()).used_memory || '0');
            memoryFreed = beforeMemory - afterMemory;
            console.log(`Memory optimization: removed ${keysRemoved} keys, freed ${memoryFreed} bytes`);
        }
        catch (error) {
            console.error('Memory optimization failed:', error);
        }
        return { keysRemoved, memoryFreed };
    }
    /**
     * Optimize hit rate by preloading frequently accessed data
     */
    async optimizeHitRate() {
        const beforeHitRate = this.metrics.hitRate;
        try {
            // Identify frequently accessed queues
            const frequentQueues = await this.getFrequentlyAccessedQueues();
            // Preload metrics for these queues
            await this.metricsCache.warmupCache(frequentQueues);
            // Wait a bit and recalculate hit rate
            await new Promise(resolve => setTimeout(resolve, 1000));
            await this.collectMetrics();
            const improvement = this.metrics.hitRate - beforeHitRate;
            console.log(`Hit rate optimization: improved by ${improvement * 100}%`);
            return { improvement };
        }
        catch (error) {
            console.error('Hit rate optimization failed:', error);
            return { improvement: 0 };
        }
    }
    /**
     * Perform cache warmup for critical data
     */
    async performCacheWarmup() {
        try {
            // Get active queues
            const activeQueues = await this.getActiveQueues();
            // Warmup metrics cache
            await this.metricsCache.warmupCache(activeQueues);
            // Preload dashboard data
            await this.preloadDashboardData();
            console.log(`Cache warmup completed for ${activeQueues.length} queues`);
        }
        catch (error) {
            console.error('Cache warmup failed:', error);
        }
    }
    /**
     * Clean up expired keys
     */
    async cleanupExpiredKeys() {
        try {
            const beforeMemory = parseInt((await this.cacheManager.getRedisInfo()).used_memory || '0');
            const beforeKeys = parseInt((await this.cacheManager.getRedisInfo()).db0?.split(',')[0]?.split('=')[1] || '0');
            // Force Redis to clean up expired keys
            // This is done automatically by Redis, but we can trigger it
            const patterns = [
                'metrics:*',
                'queue:*',
                'user:*'
            ];
            let keysRemoved = 0;
            for (const pattern of patterns) {
                // Check TTL and remove expired keys manually if needed
                // This is a simplified implementation
                const keys = await this.cacheManager.getSetMembers(`expired:${pattern}`);
                for (const key of keys) {
                    const ttl = await this.cacheManager.ttl(key);
                    if (ttl === -2) { // Key doesn't exist or expired
                        await this.cacheManager.delete(key);
                        keysRemoved++;
                    }
                }
            }
            const afterMemory = parseInt((await this.cacheManager.getRedisInfo()).used_memory || '0');
            const memoryFreed = beforeMemory - afterMemory;
            return { keysRemoved, memoryFreed };
        }
        catch (error) {
            console.error('Cleanup expired keys failed:', error);
            return { keysRemoved: 0, memoryFreed: 0 };
        }
    }
    /**
     * Get frequently accessed queues
     */
    async getFrequentlyAccessedQueues() {
        try {
            // This would typically analyze access patterns
            // For now, return a default set
            return ['default', 'high-priority', 'background'];
        }
        catch (error) {
            console.error('Failed to get frequently accessed queues:', error);
            return [];
        }
    }
    /**
     * Get active queues
     */
    async getActiveQueues() {
        try {
            // This would query the database for active queues
            // For now, return a default set
            return ['default', 'high-priority', 'background', 'notifications'];
        }
        catch (error) {
            console.error('Failed to get active queues:', error);
            return [];
        }
    }
    /**
     * Preload dashboard data
     */
    async preloadDashboardData() {
        try {
            // Preload common dashboard metrics
            await this.metricsCache.setDashboardMetrics({
                timestamp: new Date(),
                totalQueues: 0,
                totalJobs: 0,
                systemHealth: 'healthy'
            });
            // Preload real-time metrics
            await this.metricsCache.setRealTimeMetrics({
                timestamp: new Date(),
                queues: {},
                system: {}
            });
        }
        catch (error) {
            console.error('Failed to preload dashboard data:', error);
        }
    }
    /**
     * Get current cache metrics
     */
    getMetrics() {
        return { ...this.metrics };
    }
    /**
     * Get optimization configuration
     */
    getConfig() {
        return { ...this.config };
    }
    /**
     * Update optimization configuration
     */
    updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
        // Restart scheduler if interval changed
        if (newConfig.optimizationInterval && this.optimizationTimer) {
            clearInterval(this.optimizationTimer);
            this.startOptimizationScheduler();
        }
        this.emit('config_updated', this.config);
    }
    /**
     * Force immediate optimization
     */
    async forceOptimization() {
        return await this.optimizeCache();
    }
    /**
     * Get optimization statistics
     */
    async getOptimizationStats() {
        // This would typically be stored in Redis or database
        // For now, return default values
        return {
            totalOptimizations: 0,
            totalKeysRemoved: 0,
            totalMemoryFreed: 0,
            avgOptimizationTime: 0,
            lastOptimization: null
        };
    }
    /**
     * Stop optimization scheduler
     */
    stop() {
        if (this.optimizationTimer) {
            clearInterval(this.optimizationTimer);
            this.optimizationTimer = null;
        }
        this.removeAllListeners();
    }
}
exports.CacheOptimizerService = CacheOptimizerService;
// Export singleton getter
function getCacheOptimizerService() {
    return CacheOptimizerService.getInstance();
}
exports.default = getCacheOptimizerService;
