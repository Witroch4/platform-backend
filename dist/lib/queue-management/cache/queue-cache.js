"use strict";
/**
 * Queue Management - Queue Cache
 *
 * Specialized cache for queue-related data
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.QueueCache = void 0;
exports.getQueueCache = getQueueCache;
exports.setQueueCache = setQueueCache;
const cache_manager_1 = require("./cache-manager");
const constants_1 = require("../constants");
class QueueCache {
    cache;
    constructor(cacheManager) {
        this.cache = cacheManager || (0, cache_manager_1.getCacheManager)();
    }
    /**
     * Cache queue health data
     */
    async setQueueHealth(queueName, health, ttl) {
        const key = constants_1.CACHE_KEYS.QUEUE_HEALTH(queueName);
        return this.cache.set(key, health, { ttl });
    }
    /**
     * Get cached queue health data
     */
    async getQueueHealth(queueName) {
        const key = constants_1.CACHE_KEYS.QUEUE_HEALTH(queueName);
        return this.cache.get(key);
    }
    /**
     * Cache queue configuration
     */
    async setQueueConfig(queueName, config, ttl) {
        const key = constants_1.CACHE_KEYS.QUEUE_CONFIG(queueName);
        return this.cache.set(key, config, { ttl });
    }
    /**
     * Get cached queue configuration
     */
    async getQueueConfig(queueName) {
        const key = constants_1.CACHE_KEYS.QUEUE_CONFIG(queueName);
        return this.cache.get(key);
    }
    /**
     * Invalidate queue health cache
     */
    async invalidateQueueHealth(queueName) {
        const key = constants_1.CACHE_KEYS.QUEUE_HEALTH(queueName);
        return this.cache.delete(key);
    }
    /**
     * Invalidate queue config cache
     */
    async invalidateQueueConfig(queueName) {
        const key = constants_1.CACHE_KEYS.QUEUE_CONFIG(queueName);
        return this.cache.delete(key);
    }
    /**
     * Invalidate all cache for a queue
     */
    async invalidateQueue(queueName) {
        const pattern = `*${queueName}*`;
        return this.cache.deletePattern(pattern);
    }
    /**
     * Cache queue list
     */
    async setQueueList(queues, ttl = 60) {
        const key = 'queue:list';
        return this.cache.set(key, queues, { ttl });
    }
    /**
     * Get cached queue list
     */
    async getQueueList() {
        const key = 'queue:list';
        return this.cache.get(key);
    }
    /**
     * Add queue to active queues set
     */
    async addActiveQueue(queueName) {
        const key = 'queue:active';
        return this.cache.addToSet(key, queueName);
    }
    /**
     * Remove queue from active queues set
     */
    async removeActiveQueue(queueName) {
        const key = 'queue:active';
        return this.cache.removeFromSet(key, queueName);
    }
    /**
     * Get all active queues
     */
    async getActiveQueues() {
        const key = 'queue:active';
        return this.cache.getSetMembers(key);
    }
    /**
     * Cache queue statistics
     */
    async setQueueStats(queueName, stats, ttl = 30) {
        const key = `queue:stats:${queueName}`;
        return this.cache.set(key, stats, { ttl });
    }
    /**
     * Get cached queue statistics
     */
    async getQueueStats(queueName) {
        const key = `queue:stats:${queueName}`;
        return this.cache.get(key);
    }
    /**
     * Increment queue counter
     */
    async incrementQueueCounter(queueName, counter, by = 1) {
        const key = `queue:counter:${queueName}:${counter}`;
        return this.cache.increment(key, by);
    }
    /**
     * Set queue counter
     */
    async setQueueCounter(queueName, counter, value, ttl = 300) {
        const key = `queue:counter:${queueName}:${counter}`;
        return this.cache.set(key, value, { ttl });
    }
    /**
     * Get queue counter
     */
    async getQueueCounter(queueName, counter) {
        const key = `queue:counter:${queueName}:${counter}`;
        const value = await this.cache.get(key);
        return value || 0;
    }
    /**
     * Cache queue job IDs by state
     */
    async setQueueJobIds(queueName, state, jobIds, ttl = 60) {
        const key = `queue:jobs:${queueName}:${state}`;
        return this.cache.set(key, jobIds, { ttl });
    }
    /**
     * Get cached queue job IDs by state
     */
    async getQueueJobIds(queueName, state) {
        const key = `queue:jobs:${queueName}:${state}`;
        return this.cache.get(key);
    }
    /**
     * Cache queue processing rate
     */
    async setQueueProcessingRate(queueName, rate, ttl = 60) {
        const key = `queue:rate:${queueName}`;
        return this.cache.set(key, rate, { ttl });
    }
    /**
     * Get cached queue processing rate
     */
    async getQueueProcessingRate(queueName) {
        const key = `queue:rate:${queueName}`;
        return this.cache.get(key);
    }
    /**
     * Add to queue processing history (for rate calculation)
     */
    async addToProcessingHistory(queueName, timestamp, count) {
        const key = `queue:history:${queueName}`;
        return this.cache.addToSortedSet(key, timestamp, count.toString());
    }
    /**
     * Get queue processing history
     */
    async getProcessingHistory(queueName, since) {
        const key = `queue:history:${queueName}`;
        const results = await this.cache.getSortedSetRange(key, 0, -1, true);
        const history = [];
        for (let i = 0; i < results.length; i += 2) {
            const count = parseInt(results[i]);
            const timestamp = parseInt(results[i + 1]);
            if (timestamp >= since) {
                history.push({ timestamp, count });
            }
        }
        return history;
    }
    /**
     * Set queue pause state
     */
    async setQueuePaused(queueName, paused, ttl = 3600) {
        const key = `queue:paused:${queueName}`;
        return this.cache.set(key, paused, { ttl });
    }
    /**
     * Check if queue is paused
     */
    async isQueuePaused(queueName) {
        const key = `queue:paused:${queueName}`;
        const paused = await this.cache.get(key);
        return paused || false;
    }
    /**
     * Cache queue error information
     */
    async setQueueError(queueName, error, ttl = 300) {
        const key = `queue:error:${queueName}`;
        return this.cache.set(key, error, { ttl });
    }
    /**
     * Get cached queue error information
     */
    async getQueueError(queueName) {
        const key = `queue:error:${queueName}`;
        return this.cache.get(key);
    }
    /**
     * Increment queue error count
     */
    async incrementQueueErrorCount(queueName) {
        const key = `queue:error:count:${queueName}`;
        return this.cache.increment(key);
    }
    /**
     * Reset queue error count
     */
    async resetQueueErrorCount(queueName) {
        const key = `queue:error:count:${queueName}`;
        return this.cache.delete(key);
    }
    /**
     * Get queue error count
     */
    async getQueueErrorCount(queueName) {
        const key = `queue:error:count:${queueName}`;
        const count = await this.cache.get(key);
        return count || 0;
    }
    /**
     * Cache queue worker information
     */
    async setQueueWorkers(queueName, workers, ttl = 60) {
        const key = `queue:workers:${queueName}`;
        return this.cache.set(key, workers, { ttl });
    }
    /**
     * Get cached queue worker information
     */
    async getQueueWorkers(queueName) {
        const key = `queue:workers:${queueName}`;
        return this.cache.get(key);
    }
    /**
     * Invalidate all queue-related cache
     */
    async invalidateAllQueueCache() {
        return this.cache.deletePattern('queue:*');
    }
}
exports.QueueCache = QueueCache;
// Singleton instance
let queueCache = null;
/**
 * Get queue cache instance
 */
function getQueueCache() {
    if (!queueCache) {
        queueCache = new QueueCache();
    }
    return queueCache;
}
/**
 * Set queue cache instance (useful for testing)
 */
function setQueueCache(cache) {
    queueCache = cache;
}
exports.default = getQueueCache;
