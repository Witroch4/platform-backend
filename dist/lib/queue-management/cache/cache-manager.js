"use strict";
/**
 * Queue Management Cache Manager
 *
 * Central cache management system with intelligent invalidation
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CacheManager = void 0;
exports.getCacheManager = getCacheManager;
exports.setCacheManager = setCacheManager;
const ioredis_1 = __importDefault(require("ioredis"));
const config_1 = require("../config");
class CacheManager {
    redis;
    connectionPool = [];
    poolSize = 5;
    currentPoolIndex = 0;
    stats = {
        hits: 0,
        misses: 0,
        sets: 0,
        deletes: 0,
        hitRate: 0,
    };
    config = (0, config_1.getQueueManagementConfig)();
    invalidationSubscriber = null;
    constructor(redis) {
        if (redis) {
            this.redis = redis;
            this.initializeConnectionPool();
        }
        else {
            this.redis = this.createRedisConnection();
            this.initializeConnectionPool();
        }
        // Set up intelligent cache invalidation
        this.setupCacheInvalidation();
        // Set up error handling
        this.redis.on('error', (error) => {
            console.error('Redis cache error:', error);
        });
        this.redis.on('connect', () => {
            console.log('Redis cache connected');
        });
    }
    /**
     * Initialize connection pool for better performance
     */
    initializeConnectionPool() {
        for (let i = 0; i < this.poolSize; i++) {
            const connection = this.createRedisConnection();
            this.connectionPool.push(connection);
        }
        console.log(`Initialized Redis connection pool with ${this.poolSize} connections`);
    }
    /**
     * Create a new Redis connection with optimized settings
     */
    createRedisConnection() {
        return new ioredis_1.default({
            host: this.config.redis.host,
            port: this.config.redis.port,
            password: this.config.redis.password,
            db: this.config.redis.db,
            maxRetriesPerRequest: this.config.redis.maxRetriesPerRequest,
            retryDelayOnFailover: this.config.redis.retryDelayOnFailover,
            enableReadyCheck: this.config.redis.enableReadyCheck,
            lazyConnect: this.config.redis.lazyConnect,
            keyPrefix: 'qm:', // Queue Management prefix
            // Connection pool settings
            family: 4,
            keepAlive: true,
            connectTimeout: 10000,
            commandTimeout: 5000,
            // Optimizations
            enableAutoPipelining: true,
            maxRetriesPerRequest: 3,
        });
    }
    /**
     * Get connection from pool (round-robin)
     */
    getPooledConnection() {
        const connection = this.connectionPool[this.currentPoolIndex];
        this.currentPoolIndex = (this.currentPoolIndex + 1) % this.poolSize;
        return connection;
    }
    /**
     * Setup intelligent cache invalidation based on events
     */
    setupCacheInvalidation() {
        this.invalidationSubscriber = this.createRedisConnection();
        // Subscribe to queue events for cache invalidation
        this.invalidationSubscriber.subscribe('queue:events', 'job:events', 'metrics:events', 'system:events');
        this.invalidationSubscriber.on('message', async (channel, message) => {
            try {
                const event = JSON.parse(message);
                await this.handleCacheInvalidationEvent(event);
            }
            catch (error) {
                console.error('Cache invalidation error:', error);
            }
        });
    }
    /**
     * Handle cache invalidation events
     */
    async handleCacheInvalidationEvent(event) {
        const { type, queueName, jobId } = event;
        switch (type) {
            case 'queue.updated':
            case 'queue.paused':
            case 'queue.resumed':
                await this.invalidateQueueCache(queueName);
                break;
            case 'job.completed':
            case 'job.failed':
            case 'job.retried':
                await this.invalidateJobCache(jobId);
                await this.invalidateQueueMetrics(queueName);
                break;
            case 'metrics.updated':
                await this.invalidateMetricsCache(queueName);
                break;
            case 'system.updated':
                await this.invalidateSystemCache();
                break;
        }
    }
    /**
     * Invalidate queue-specific cache
     */
    async invalidateQueueCache(queueName) {
        const patterns = [
            `queue:health:${queueName}`,
            `queue:config:${queueName}`,
            `queue:metrics:${queueName}:*`,
            `metrics:*:${queueName}:*`
        ];
        for (const pattern of patterns) {
            await this.deletePattern(pattern);
        }
    }
    /**
     * Invalidate job-specific cache
     */
    async invalidateJobCache(jobId) {
        const patterns = [
            `job:*:${jobId}`,
            `metrics:job:${jobId}:*`
        ];
        for (const pattern of patterns) {
            await this.deletePattern(pattern);
        }
    }
    /**
     * Invalidate metrics cache for a queue
     */
    async invalidateQueueMetrics(queueName) {
        const patterns = [
            `metrics:*:${queueName}:*`,
            `metrics:aggregated:${queueName}:*`,
            `metrics:realtime`,
            `metrics:dashboard`
        ];
        for (const pattern of patterns) {
            await this.deletePattern(pattern);
        }
    }
    /**
     * Invalidate system-wide cache
     */
    async invalidateSystemCache() {
        const patterns = [
            'system:*',
            'metrics:system:*',
            'metrics:dashboard'
        ];
        for (const pattern of patterns) {
            await this.deletePattern(pattern);
        }
    }
    /**
     * Get value from cache
     */
    async get(key) {
        try {
            const value = await this.redis.get(key);
            if (value === null) {
                this.stats.misses++;
                this.updateHitRate();
                return null;
            }
            this.stats.hits++;
            this.updateHitRate();
            try {
                return JSON.parse(value);
            }
            catch {
                return value;
            }
        }
        catch (error) {
            console.error('Cache get error:', error);
            this.stats.misses++;
            this.updateHitRate();
            return null;
        }
    }
    /**
     * Set value in cache
     */
    async set(key, value, options = {}) {
        try {
            const serializedValue = typeof value === 'string' ? value : JSON.stringify(value);
            const ttl = options.ttl || this.getDefaultTTL(key);
            if (ttl > 0) {
                await this.redis.setex(key, ttl, serializedValue);
            }
            else {
                await this.redis.set(key, serializedValue);
            }
            this.stats.sets++;
            return true;
        }
        catch (error) {
            console.error('Cache set error:', error);
            return false;
        }
    }
    /**
     * Delete value from cache
     */
    async delete(key) {
        try {
            const result = await this.redis.del(key);
            this.stats.deletes++;
            return result > 0;
        }
        catch (error) {
            console.error('Cache delete error:', error);
            return false;
        }
    }
    /**
     * Delete multiple keys matching pattern
     */
    async deletePattern(pattern) {
        try {
            const keys = await this.redis.keys(pattern);
            if (keys.length === 0)
                return 0;
            const result = await this.redis.del(...keys);
            this.stats.deletes += keys.length;
            return result;
        }
        catch (error) {
            console.error('Cache delete pattern error:', error);
            return 0;
        }
    }
    /**
     * Check if key exists
     */
    async exists(key) {
        try {
            const result = await this.redis.exists(key);
            return result === 1;
        }
        catch (error) {
            console.error('Cache exists error:', error);
            return false;
        }
    }
    /**
     * Set expiration for key
     */
    async expire(key, ttl) {
        try {
            const result = await this.redis.expire(key, ttl);
            return result === 1;
        }
        catch (error) {
            console.error('Cache expire error:', error);
            return false;
        }
    }
    /**
     * Get TTL for key
     */
    async ttl(key) {
        try {
            return await this.redis.ttl(key);
        }
        catch (error) {
            console.error('Cache TTL error:', error);
            return -1;
        }
    }
    /**
     * Increment counter
     */
    async increment(key, by = 1) {
        try {
            return await this.redis.incrby(key, by);
        }
        catch (error) {
            console.error('Cache increment error:', error);
            return 0;
        }
    }
    /**
     * Add to set
     */
    async addToSet(key, ...members) {
        try {
            return await this.redis.sadd(key, ...members);
        }
        catch (error) {
            console.error('Cache add to set error:', error);
            return 0;
        }
    }
    /**
     * Get set members
     */
    async getSetMembers(key) {
        try {
            return await this.redis.smembers(key);
        }
        catch (error) {
            console.error('Cache get set members error:', error);
            return [];
        }
    }
    /**
     * Remove from set
     */
    async removeFromSet(key, ...members) {
        try {
            return await this.redis.srem(key, ...members);
        }
        catch (error) {
            console.error('Cache remove from set error:', error);
            return 0;
        }
    }
    /**
     * Add to sorted set
     */
    async addToSortedSet(key, score, member) {
        try {
            return await this.redis.zadd(key, score, member);
        }
        catch (error) {
            console.error('Cache add to sorted set error:', error);
            return 0;
        }
    }
    /**
     * Get sorted set range
     */
    async getSortedSetRange(key, start = 0, stop = -1, withScores = false) {
        try {
            if (withScores) {
                return await this.redis.zrange(key, start, stop, 'WITHSCORES');
            }
            return await this.redis.zrange(key, start, stop);
        }
        catch (error) {
            console.error('Cache get sorted set range error:', error);
            return [];
        }
    }
    /**
     * Push to list
     */
    async pushToList(key, ...values) {
        try {
            return await this.redis.lpush(key, ...values);
        }
        catch (error) {
            console.error('Cache push to list error:', error);
            return 0;
        }
    }
    /**
     * Get list range
     */
    async getListRange(key, start = 0, stop = -1) {
        try {
            return await this.redis.lrange(key, start, stop);
        }
        catch (error) {
            console.error('Cache get list range error:', error);
            return [];
        }
    }
    /**
     * Set hash field
     */
    async setHashField(key, field, value) {
        try {
            const serializedValue = typeof value === 'string' ? value : JSON.stringify(value);
            const result = await this.redis.hset(key, field, serializedValue);
            return result === 1;
        }
        catch (error) {
            console.error('Cache set hash field error:', error);
            return false;
        }
    }
    /**
     * Get hash field
     */
    async getHashField(key, field) {
        try {
            const value = await this.redis.hget(key, field);
            if (value === null)
                return null;
            try {
                return JSON.parse(value);
            }
            catch {
                return value;
            }
        }
        catch (error) {
            console.error('Cache get hash field error:', error);
            return null;
        }
    }
    /**
     * Get all hash fields
     */
    async getHashAll(key) {
        try {
            const hash = await this.redis.hgetall(key);
            const result = {};
            for (const [field, value] of Object.entries(hash)) {
                try {
                    result[field] = JSON.parse(value);
                }
                catch {
                    result[field] = value;
                }
            }
            return result;
        }
        catch (error) {
            console.error('Cache get hash all error:', error);
            return {};
        }
    }
    /**
     * Delete hash field
     */
    async deleteHashField(key, ...fields) {
        try {
            return await this.redis.hdel(key, ...fields);
        }
        catch (error) {
            console.error('Cache delete hash field error:', error);
            return 0;
        }
    }
    /**
     * Get cache statistics
     */
    getStats() {
        return { ...this.stats };
    }
    /**
     * Reset cache statistics
     */
    resetStats() {
        this.stats = {
            hits: 0,
            misses: 0,
            sets: 0,
            deletes: 0,
            hitRate: 0,
        };
    }
    /**
     * Get Redis info
     */
    async getRedisInfo() {
        try {
            const info = await this.redis.info();
            const lines = info.split('\r\n');
            const result = {};
            for (const line of lines) {
                if (line.includes(':')) {
                    const [key, value] = line.split(':');
                    result[key] = value;
                }
            }
            return result;
        }
        catch (error) {
            console.error('Get Redis info error:', error);
            return {};
        }
    }
    /**
     * Flush all cache data
     */
    async flush() {
        try {
            await this.redis.flushdb();
            this.resetStats();
            return true;
        }
        catch (error) {
            console.error('Cache flush error:', error);
            return false;
        }
    }
    /**
     * Close Redis connection
     */
    async close() {
        try {
            await this.redis.quit();
        }
        catch (error) {
            console.error('Cache close error:', error);
        }
    }
    /**
     * Get default TTL for key based on key pattern
     */
    getDefaultTTL(key) {
        const { cacheTtl } = this.config.performance;
        if (key.includes('queue:health')) {
            return cacheTtl.queueHealth;
        }
        if (key.includes('queue:config')) {
            return cacheTtl.queueConfig;
        }
        if (key.includes('user:session')) {
            return cacheTtl.userSession;
        }
        if (key.includes('metrics')) {
            return cacheTtl.metrics;
        }
        return 300; // Default 5 minutes
    }
    /**
     * Update hit rate calculation
     */
    updateHitRate() {
        const total = this.stats.hits + this.stats.misses;
        this.stats.hitRate = total > 0 ? this.stats.hits / total : 0;
    }
}
exports.CacheManager = CacheManager;
// Singleton instance
let cacheManager = null;
/**
 * Get cache manager instance
 */
function getCacheManager() {
    if (!cacheManager) {
        cacheManager = new CacheManager();
    }
    return cacheManager;
}
/**
 * Set cache manager instance (useful for testing)
 */
function setCacheManager(manager) {
    cacheManager = manager;
}
exports.default = getCacheManager;
