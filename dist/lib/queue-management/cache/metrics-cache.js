"use strict";
/**
 * Queue Management - Metrics Cache
 *
 * Specialized cache for metrics and analytics data with intelligent invalidation
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MetricsCache = void 0;
exports.getMetricsCache = getMetricsCache;
exports.setMetricsCache = setMetricsCache;
const cache_manager_1 = require("./cache-manager");
const constants_1 = require("../constants");
const events_1 = require("events");
class MetricsCache extends events_1.EventEmitter {
    cache;
    invalidationRules = new Map();
    constructor(cacheManager) {
        super();
        this.cache = cacheManager || (0, cache_manager_1.getCacheManager)();
        this.setupInvalidationRules();
    }
    /**
     * Setup cache invalidation rules
     */
    setupInvalidationRules() {
        // Define which cache keys should be invalidated for different events
        this.invalidationRules.set('queue.updated', [
            'metrics:realtime',
            'metrics:dashboard',
            'queue:health:*',
            'metrics:*:${queueName}:*'
        ]);
        this.invalidationRules.set('job.completed', [
            'metrics:realtime',
            'metrics:dashboard',
            'metrics:throughput:*',
            'metrics:processing:*',
            'metrics:aggregated:*'
        ]);
        this.invalidationRules.set('job.failed', [
            'metrics:realtime',
            'metrics:dashboard',
            'metrics:errorrate:*',
            'metrics:aggregated:*'
        ]);
    }
    /**
     * Intelligent cache invalidation based on events
     */
    async invalidateByEvent(eventType, context) {
        const rules = this.invalidationRules.get(eventType);
        if (!rules)
            return;
        for (const rule of rules) {
            let pattern = rule;
            // Replace placeholders with actual values
            if (context.queueName) {
                pattern = pattern.replace('${queueName}', context.queueName);
            }
            if (context.jobId) {
                pattern = pattern.replace('${jobId}', context.jobId);
            }
            await this.cache.deletePattern(pattern);
        }
        this.emit('cache_invalidated', { eventType, context, patterns: rules });
    }
    /**
     * Cache queue metrics
     */
    async setQueueMetrics(queueName, timestamp, metrics, ttl = 300) {
        const key = constants_1.CACHE_KEYS.QUEUE_METRICS(queueName, timestamp);
        return this.cache.set(key, metrics, { ttl });
    }
    /**
     * Get cached queue metrics
     */
    async getQueueMetrics(queueName, timestamp) {
        const key = constants_1.CACHE_KEYS.QUEUE_METRICS(queueName, timestamp);
        return this.cache.get(key);
    }
    /**
     * Cache system metrics
     */
    async setSystemMetrics(timestamp, metrics, ttl = 300) {
        const key = `system:metrics:${timestamp}`;
        return this.cache.set(key, metrics, { ttl });
    }
    /**
     * Get cached system metrics
     */
    async getSystemMetrics(timestamp) {
        const key = `system:metrics:${timestamp}`;
        return this.cache.get(key);
    }
    /**
     * Cache aggregated metrics
     */
    async setAggregatedMetrics(queueName, granularity, startTime, metrics, ttl = 600) {
        const key = `metrics:aggregated:${queueName}:${granularity}:${startTime}`;
        return this.cache.set(key, metrics, { ttl });
    }
    /**
     * Get cached aggregated metrics
     */
    async getAggregatedMetrics(queueName, granularity, startTime) {
        const key = `metrics:aggregated:${queueName}:${granularity}:${startTime}`;
        return this.cache.get(key);
    }
    /**
     * Cache percentiles
     */
    async setPercentiles(queueName, metric, timeRange, percentiles, ttl = 600) {
        const key = `metrics:percentiles:${queueName}:${metric}:${timeRange}`;
        return this.cache.set(key, percentiles, { ttl });
    }
    /**
     * Get cached percentiles
     */
    async getPercentiles(queueName, metric, timeRange) {
        const key = `metrics:percentiles:${queueName}:${metric}:${timeRange}`;
        return this.cache.get(key);
    }
    /**
     * Cache real-time metrics
     */
    async setRealTimeMetrics(data, ttl = 30) {
        const key = 'metrics:realtime';
        return this.cache.set(key, data, { ttl });
    }
    /**
     * Get cached real-time metrics
     */
    async getRealTimeMetrics() {
        const key = 'metrics:realtime';
        return this.cache.get(key);
    }
    /**
     * Add metric data point to time series
     */
    async addMetricDataPoint(queueName, metric, timestamp, value) {
        const key = `metrics:timeseries:${queueName}:${metric}`;
        return this.cache.addToSortedSet(key, timestamp, value.toString());
    }
    /**
     * Get metric time series data
     */
    async getMetricTimeSeries(queueName, metric, since, until = Date.now()) {
        const key = `metrics:timeseries:${queueName}:${metric}`;
        const results = await this.cache.getSortedSetRange(key, 0, -1, true);
        const timeSeries = [];
        for (let i = 0; i < results.length; i += 2) {
            const value = parseFloat(results[i]);
            const timestamp = parseInt(results[i + 1]);
            if (timestamp >= since && timestamp <= until) {
                timeSeries.push({ timestamp, value });
            }
        }
        return timeSeries.sort((a, b) => a.timestamp - b.timestamp);
    }
    /**
     * Cache metric summary
     */
    async setMetricSummary(queueName, metric, period, summary, ttl = 300) {
        const key = `metrics:summary:${queueName}:${metric}:${period}`;
        return this.cache.set(key, summary, { ttl });
    }
    /**
     * Get cached metric summary
     */
    async getMetricSummary(queueName, metric, period) {
        const key = `metrics:summary:${queueName}:${metric}:${period}`;
        return this.cache.get(key);
    }
    /**
     * Cache throughput data
     */
    async setThroughputData(queueName, period, throughput, ttl = 300) {
        const key = `metrics:throughput:${queueName}:${period}`;
        return this.cache.set(key, throughput, { ttl });
    }
    /**
     * Get cached throughput data
     */
    async getThroughputData(queueName, period) {
        const key = `metrics:throughput:${queueName}:${period}`;
        return this.cache.get(key);
    }
    /**
     * Cache error rate data
     */
    async setErrorRateData(queueName, period, errorRate, ttl = 300) {
        const key = `metrics:errorrate:${queueName}:${period}`;
        return this.cache.set(key, errorRate, { ttl });
    }
    /**
     * Get cached error rate data
     */
    async getErrorRateData(queueName, period) {
        const key = `metrics:errorrate:${queueName}:${period}`;
        return this.cache.get(key);
    }
    /**
     * Cache processing time statistics
     */
    async setProcessingTimeStats(queueName, period, stats, ttl = 300) {
        const key = `metrics:processing:${queueName}:${period}`;
        return this.cache.set(key, stats, { ttl });
    }
    /**
     * Get cached processing time statistics
     */
    async getProcessingTimeStats(queueName, period) {
        const key = `metrics:processing:${queueName}:${period}`;
        return this.cache.get(key);
    }
    /**
     * Cache dashboard metrics
     */
    async setDashboardMetrics(metrics, ttl = 60) {
        const key = 'metrics:dashboard';
        return this.cache.set(key, metrics, { ttl });
    }
    /**
     * Get cached dashboard metrics
     */
    async getDashboardMetrics() {
        const key = 'metrics:dashboard';
        return this.cache.get(key);
    }
    /**
     * Cache metric comparison data
     */
    async setMetricComparison(queueName, metric, comparisonId, data, ttl = 600) {
        const key = `metrics:comparison:${queueName}:${metric}:${comparisonId}`;
        return this.cache.set(key, data, { ttl });
    }
    /**
     * Get cached metric comparison data
     */
    async getMetricComparison(queueName, metric, comparisonId) {
        const key = `metrics:comparison:${queueName}:${metric}:${comparisonId}`;
        return this.cache.get(key);
    }
    /**
     * Cache baseline metrics
     */
    async setBaselineMetrics(queueName, metric, baseline, ttl = 3600) {
        const key = `metrics:baseline:${queueName}:${metric}`;
        return this.cache.set(key, baseline, { ttl });
    }
    /**
     * Get cached baseline metrics
     */
    async getBaselineMetrics(queueName, metric) {
        const key = `metrics:baseline:${queueName}:${metric}`;
        return this.cache.get(key);
    }
    /**
     * Increment metric counter
     */
    async incrementMetricCounter(queueName, metric, by = 1) {
        const key = `metrics:counter:${queueName}:${metric}`;
        return this.cache.increment(key, by);
    }
    /**
     * Get metric counter value
     */
    async getMetricCounter(queueName, metric) {
        const key = `metrics:counter:${queueName}:${metric}`;
        const value = await this.cache.get(key);
        return value || 0;
    }
    /**
     * Reset metric counter
     */
    async resetMetricCounter(queueName, metric) {
        const key = `metrics:counter:${queueName}:${metric}`;
        return this.cache.delete(key);
    }
    /**
     * Cache metric alerts status
     */
    async setMetricAlertStatus(queueName, metric, status, ttl = 300) {
        const key = `metrics:alert:${queueName}:${metric}`;
        return this.cache.set(key, status, { ttl });
    }
    /**
     * Get cached metric alert status
     */
    async getMetricAlertStatus(queueName, metric) {
        const key = `metrics:alert:${queueName}:${metric}`;
        return this.cache.get(key);
    }
    /**
     * Invalidate metrics cache for a queue
     */
    async invalidateQueueMetrics(queueName) {
        const pattern = `metrics:*:${queueName}:*`;
        return this.cache.deletePattern(pattern);
    }
    /**
     * Invalidate all metrics cache
     */
    async invalidateAllMetrics() {
        return this.cache.deletePattern('metrics:*');
    }
    /**
     * Clean up old metric data points
     */
    async cleanupOldMetrics(olderThan) {
        let deletedCount = 0;
        try {
            // Clean up old time series data
            const patterns = [
                'metrics:timeseries:*',
                'metrics:aggregated:*',
                'metrics:percentiles:*'
            ];
            for (const pattern of patterns) {
                const keys = await this.cache.getRedisInfo();
                // This is a simplified implementation
                // In a real scenario, you'd iterate through keys and check timestamps
                deletedCount += await this.cache.deletePattern(pattern);
            }
            return deletedCount;
        }
        catch (error) {
            console.error('Failed to cleanup old metrics:', error);
            return 0;
        }
    }
    /**
     * Warm up cache with frequently accessed data
     */
    async warmupCache(queueNames) {
        const now = new Date();
        const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
        for (const queueName of queueNames) {
            try {
                // Pre-load common metrics
                await this.setThroughputData(queueName, '1h', 0, 3600);
                await this.setErrorRateData(queueName, '1h', 0, 3600);
                await this.setProcessingTimeStats(queueName, '1h', {
                    avg: 0, p50: 0, p95: 0, p99: 0
                }, 3600);
                // Pre-load time series data
                await this.addMetricDataPoint(queueName, 'throughput', now.getTime(), 0);
            }
            catch (error) {
                console.error(`Failed to warmup cache for queue ${queueName}:`, error);
            }
        }
    }
    /**
     * Get cache hit rate for metrics
     */
    async getCacheHitRate() {
        try {
            const stats = this.cache.getStats();
            return stats.hitRate;
        }
        catch (error) {
            console.error('Failed to get cache hit rate:', error);
            return 0;
        }
    }
    /**
     * Optimize cache by removing least recently used items
     */
    async optimizeCache() {
        try {
            // Get Redis memory info
            const info = await this.cache.getRedisInfo();
            const usedMemory = parseInt(info.used_memory || '0');
            const maxMemory = parseInt(info.maxmemory || '0');
            if (maxMemory > 0 && usedMemory > maxMemory * 0.8) {
                // Cache is getting full, remove old entries
                const patterns = [
                    'metrics:aggregated:*',
                    'metrics:comparison:*',
                    'metrics:summary:*'
                ];
                let removedKeys = 0;
                for (const pattern of patterns) {
                    removedKeys += await this.cache.deletePattern(pattern);
                }
                const newUsedMemory = parseInt((await this.cache.getRedisInfo()).used_memory || '0');
                const freedMemory = usedMemory - newUsedMemory;
                return { removedKeys, freedMemory };
            }
            return { removedKeys: 0, freedMemory: 0 };
        }
        catch (error) {
            console.error('Failed to optimize cache:', error);
            return { removedKeys: 0, freedMemory: 0 };
        }
    }
}
exports.MetricsCache = MetricsCache;
// Singleton instance
let metricsCache = null;
/**
 * Get metrics cache instance
 */
function getMetricsCache() {
    if (!metricsCache) {
        metricsCache = new MetricsCache();
    }
    return metricsCache;
}
/**
 * Set metrics cache instance (useful for testing)
 */
function setMetricsCache(cache) {
    metricsCache = cache;
}
exports.default = getMetricsCache;
