"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.cacheHealthMonitor = exports.cacheWarmingManager = exports.cacheInvalidationManager = exports.CacheHealthMonitor = exports.CacheWarmingManager = exports.CacheInvalidationManager = exports.credentialsCache = exports.CredentialsCache = void 0;
exports.getCachedCredentials = getCachedCredentials;
exports.setCachedCredentials = setCachedCredentials;
exports.invalidateCachedCredentials = invalidateCachedCredentials;
exports.isCredentialsRecentlyUpdated = isCredentialsRecentlyUpdated;
exports.markCredentialsAsUpdated = markCredentialsAsUpdated;
exports.warmCache = warmCache;
exports.startCacheMaintenance = startCacheMaintenance;
const redis_1 = require("../redis");
// Cache key prefixes for organization
const CACHE_PREFIXES = {
    CREDENTIALS: 'credentials',
    CREDENTIALS_UPDATED: 'credentials_updated',
    FALLBACK_CHAIN: 'fallback_chain',
    HEALTH: 'cache_health',
};
// TTL constants (in seconds)
const TTL = {
    CREDENTIALS: 60 * 60, // 1 hour
    CREDENTIALS_UPDATED: 60 * 30, // 30 minutes
    FALLBACK_CHAIN: 60 * 60 * 24, // 24 hours
    HEALTH: 60 * 5, // 5 minutes
};
class CredentialsCache {
    redis;
    stats = {
        hits: 0,
        misses: 0,
        errors: 0,
        lastUpdated: new Date(),
    };
    constructor(redisConnection) {
        this.redis = redisConnection || redis_1.connection;
        this.initializeHealthCheck();
    }
    // Initialize periodic health checks
    initializeHealthCheck() {
        // Check health every 5 minutes
        setInterval(() => {
            this.checkHealth().catch(error => {
                console.error('[CredentialsCache] Health check failed:', error);
            });
        }, 5 * 60 * 1000);
    }
    // Generate cache key
    getCacheKey(prefix, identifier) {
        return `chatwit:${prefix}:${identifier}`;
    }
    // Get credentials from cache
    async getCredentials(inboxId) {
        const key = this.getCacheKey(CACHE_PREFIXES.CREDENTIALS, inboxId);
        try {
            const start = Date.now();
            const cached = await this.redis.get(key);
            const latency = Date.now() - start;
            if (cached) {
                this.stats.hits++;
                exports.cacheHealthMonitor.recordCacheOperation('hit', latency);
                console.log(`[CredentialsCache] Cache hit for inbox ${inboxId}`, { latency });
                return JSON.parse(cached);
            }
            else {
                this.stats.misses++;
                exports.cacheHealthMonitor.recordCacheOperation('miss', latency);
                console.log(`[CredentialsCache] Cache miss for inbox ${inboxId}`, { latency });
                return null;
            }
        }
        catch (error) {
            this.stats.errors++;
            exports.cacheHealthMonitor.recordCacheOperation('error');
            console.error(`[CredentialsCache] Error getting credentials for inbox ${inboxId}:`, error);
            return null; // Fail gracefully
        }
    }
    // Set credentials in cache
    async setCredentials(inboxId, credentials, ttl = TTL.CREDENTIALS) {
        const key = this.getCacheKey(CACHE_PREFIXES.CREDENTIALS, inboxId);
        try {
            const serialized = JSON.stringify({
                ...credentials,
                updatedAt: new Date().toISOString(),
            });
            await this.redis.setex(key, ttl, serialized);
            console.log(`[CredentialsCache] Credentials cached for inbox ${inboxId}`, {
                ttl,
                source: credentials.source,
            });
        }
        catch (error) {
            this.stats.errors++;
            console.error(`[CredentialsCache] Error setting credentials for inbox ${inboxId}:`, error);
            // Don't throw - cache failures shouldn't break the application
        }
    }
    // Invalidate credentials cache
    async invalidateCredentials(inboxId) {
        const keys = [
            this.getCacheKey(CACHE_PREFIXES.CREDENTIALS, inboxId),
            this.getCacheKey(CACHE_PREFIXES.CREDENTIALS_UPDATED, inboxId),
        ];
        try {
            await this.redis.del(...keys);
            console.log(`[CredentialsCache] Invalidated cache for inbox ${inboxId}`);
            // Queue related cache invalidation
            exports.cacheInvalidationManager.queueInvalidation(inboxId);
        }
        catch (error) {
            this.stats.errors++;
            exports.cacheHealthMonitor.recordCacheOperation('error');
            console.error(`[CredentialsCache] Error invalidating credentials for inbox ${inboxId}:`, error);
        }
    }
    // Check if credentials were recently updated (to avoid unnecessary DB writes)
    async isCredentialsUpdated(inboxId) {
        const key = this.getCacheKey(CACHE_PREFIXES.CREDENTIALS_UPDATED, inboxId);
        try {
            const exists = await this.redis.exists(key);
            return exists === 1;
        }
        catch (error) {
            this.stats.errors++;
            console.error(`[CredentialsCache] Error checking if credentials updated for inbox ${inboxId}:`, error);
            return false; // Assume not updated on error
        }
    }
    // Mark credentials as recently updated
    async markCredentialsUpdated(inboxId, ttl = TTL.CREDENTIALS_UPDATED) {
        const key = this.getCacheKey(CACHE_PREFIXES.CREDENTIALS_UPDATED, inboxId);
        try {
            await this.redis.setex(key, ttl, new Date().toISOString());
            console.log(`[CredentialsCache] Marked credentials as updated for inbox ${inboxId}`, { ttl });
        }
        catch (error) {
            this.stats.errors++;
            console.error(`[CredentialsCache] Error marking credentials updated for inbox ${inboxId}:`, error);
        }
    }
    // Cache fallback chain to avoid repeated DB queries
    async getFallbackChain(inboxId) {
        const key = this.getCacheKey(CACHE_PREFIXES.FALLBACK_CHAIN, inboxId);
        try {
            const cached = await this.redis.get(key);
            if (cached) {
                return JSON.parse(cached);
            }
            return null;
        }
        catch (error) {
            this.stats.errors++;
            console.error(`[CredentialsCache] Error getting fallback chain for inbox ${inboxId}:`, error);
            return null;
        }
    }
    // Set fallback chain in cache
    async setFallbackChain(inboxId, chain, ttl = TTL.FALLBACK_CHAIN) {
        const key = this.getCacheKey(CACHE_PREFIXES.FALLBACK_CHAIN, inboxId);
        try {
            await this.redis.setex(key, ttl, JSON.stringify(chain));
            console.log(`[CredentialsCache] Fallback chain cached for inbox ${inboxId}`, { chain, ttl });
        }
        catch (error) {
            this.stats.errors++;
            console.error(`[CredentialsCache] Error setting fallback chain for inbox ${inboxId}:`, error);
        }
    }
    // Invalidate fallback chain cache
    async invalidateFallbackChain(inboxId) {
        const key = this.getCacheKey(CACHE_PREFIXES.FALLBACK_CHAIN, inboxId);
        try {
            await this.redis.del(key);
            console.log(`[CredentialsCache] Invalidated fallback chain for inbox ${inboxId}`);
        }
        catch (error) {
            this.stats.errors++;
            console.error(`[CredentialsCache] Error invalidating fallback chain for inbox ${inboxId}:`, error);
        }
    }
    // Batch operations for efficiency
    async batchGetCredentials(inboxIds) {
        const keys = inboxIds.map(id => this.getCacheKey(CACHE_PREFIXES.CREDENTIALS, id));
        const results = new Map();
        try {
            const values = await this.redis.mget(...keys);
            for (let i = 0; i < inboxIds.length; i++) {
                const inboxId = inboxIds[i];
                const value = values[i];
                if (value) {
                    this.stats.hits++;
                    results.set(inboxId, JSON.parse(value));
                }
                else {
                    this.stats.misses++;
                    results.set(inboxId, null);
                }
            }
            console.log(`[CredentialsCache] Batch get completed for ${inboxIds.length} inboxes`, {
                hits: values.filter(v => v !== null).length,
                misses: values.filter(v => v === null).length,
            });
            return results;
        }
        catch (error) {
            this.stats.errors++;
            console.error('[CredentialsCache] Error in batch get credentials:', error);
            // Return empty results on error
            for (const inboxId of inboxIds) {
                results.set(inboxId, null);
            }
            return results;
        }
    }
    // Batch set credentials
    async batchSetCredentials(credentialsMap, ttl = TTL.CREDENTIALS) {
        if (credentialsMap.size === 0)
            return;
        try {
            const pipeline = this.redis.pipeline();
            credentialsMap.forEach((credentials, inboxId) => {
                const key = this.getCacheKey(CACHE_PREFIXES.CREDENTIALS, inboxId);
                const serialized = JSON.stringify({
                    ...credentials,
                    updatedAt: new Date().toISOString(),
                });
                pipeline.setex(key, ttl, serialized);
            });
            await pipeline.exec();
            console.log(`[CredentialsCache] Batch set completed for ${credentialsMap.size} credentials`, { ttl });
        }
        catch (error) {
            this.stats.errors++;
            console.error('[CredentialsCache] Error in batch set credentials:', error);
        }
    }
    // Get cache statistics
    getStats() {
        return { ...this.stats };
    }
    // Reset cache statistics
    resetStats() {
        this.stats = {
            hits: 0,
            misses: 0,
            errors: 0,
            lastUpdated: new Date(),
        };
    }
    // Check cache health
    async checkHealth() {
        const start = Date.now();
        try {
            await this.redis.ping();
            const latency = Date.now() - start;
            // Get memory usage if available
            let memoryUsage;
            try {
                const info = await this.redis.info('memory');
                const match = info.match(/used_memory_human:(.+)/);
                memoryUsage = match ? match[1].trim() : undefined;
            }
            catch {
                // Ignore memory info errors
            }
            const health = {
                isConnected: true,
                latency,
                memoryUsage,
                lastCheck: new Date(),
            };
            // Cache health status
            const healthKey = this.getCacheKey(CACHE_PREFIXES.HEALTH, 'status');
            await this.redis.setex(healthKey, TTL.HEALTH, JSON.stringify(health));
            return health;
        }
        catch (error) {
            console.error('[CredentialsCache] Health check failed:', error);
            return {
                isConnected: false,
                latency: Date.now() - start,
                lastCheck: new Date(),
            };
        }
    }
    // Clear all cache entries (use with caution)
    async clearAll() {
        try {
            const pattern = 'chatwit:*';
            const keys = await this.redis.keys(pattern);
            if (keys.length > 0) {
                await this.redis.del(...keys);
                console.log(`[CredentialsCache] Cleared ${keys.length} cache entries`);
            }
        }
        catch (error) {
            this.stats.errors++;
            console.error('[CredentialsCache] Error clearing cache:', error);
        }
    }
    // Graceful shutdown
    async shutdown() {
        try {
            console.log('[CredentialsCache] Shutting down cache manager...');
            // Redis connection is shared, so we don't disconnect it here
        }
        catch (error) {
            console.error('[CredentialsCache] Error during shutdown:', error);
        }
    }
}
exports.CredentialsCache = CredentialsCache;
// Global cache instance
exports.credentialsCache = new CredentialsCache();
// Utility functions for common operations
async function getCachedCredentials(inboxId) {
    return exports.credentialsCache.getCredentials(inboxId);
}
async function setCachedCredentials(inboxId, credentials, ttl) {
    return exports.credentialsCache.setCredentials(inboxId, credentials, ttl);
}
async function invalidateCachedCredentials(inboxId) {
    return exports.credentialsCache.invalidateCredentials(inboxId);
}
async function isCredentialsRecentlyUpdated(inboxId) {
    return exports.credentialsCache.isCredentialsUpdated(inboxId);
}
async function markCredentialsAsUpdated(inboxId, ttl) {
    return exports.credentialsCache.markCredentialsUpdated(inboxId, ttl);
}
// Advanced cache invalidation strategies
class CacheInvalidationManager {
    static instance;
    invalidationQueue = new Set();
    batchInvalidationTimer = null;
    BATCH_INVALIDATION_DELAY = 1000; // 1 second
    static getInstance() {
        if (!this.instance) {
            this.instance = new CacheInvalidationManager();
        }
        return this.instance;
    }
    // Queue invalidation for batch processing
    queueInvalidation(inboxId) {
        this.invalidationQueue.add(inboxId);
        // Set timer for batch processing if not already set
        if (!this.batchInvalidationTimer) {
            this.batchInvalidationTimer = setTimeout(() => {
                this.processBatchInvalidation();
            }, this.BATCH_INVALIDATION_DELAY);
        }
    }
    // Process batch invalidation
    async processBatchInvalidation() {
        if (this.invalidationQueue.size === 0)
            return;
        const inboxIds = Array.from(this.invalidationQueue);
        this.invalidationQueue.clear();
        this.batchInvalidationTimer = null;
        try {
            console.log(`[CacheInvalidationManager] Processing batch invalidation for ${inboxIds.length} inboxes`);
            // Invalidate credentials and fallback chains
            await Promise.all(inboxIds.map(async (inboxId) => {
                await exports.credentialsCache.invalidateCredentials(inboxId);
                await exports.credentialsCache.invalidateFallbackChain(inboxId);
            }));
            console.log(`[CacheInvalidationManager] Batch invalidation completed for ${inboxIds.length} inboxes`);
        }
        catch (error) {
            console.error('[CacheInvalidationManager] Error in batch invalidation:', error);
        }
    }
    // Invalidate related caches when credentials are updated
    async invalidateRelatedCaches(inboxId) {
        try {
            // Invalidate the inbox itself
            await exports.credentialsCache.invalidateCredentials(inboxId);
            await exports.credentialsCache.invalidateFallbackChain(inboxId);
            // Find and invalidate inboxes that use this inbox as fallback
            const dependentInboxes = await this.findDependentInboxes(inboxId);
            for (const dependentInboxId of dependentInboxes) {
                await exports.credentialsCache.invalidateCredentials(dependentInboxId);
                await exports.credentialsCache.invalidateFallbackChain(dependentInboxId);
            }
            console.log(`[CacheInvalidationManager] Invalidated related caches for inbox: ${inboxId}`, {
                dependentInboxes: dependentInboxes.length,
            });
        }
        catch (error) {
            console.error(`[CacheInvalidationManager] Error invalidating related caches for inbox: ${inboxId}`, error);
        }
    }
    // Find inboxes that depend on this inbox for fallback
    async findDependentInboxes(inboxId) {
        try {
            const { prisma } = await Promise.resolve().then(() => __importStar(require('../prisma')));
            const dependentInboxes = await prisma.chatwitInbox.findMany({
                where: { fallbackParaInboxId: inboxId },
                select: { inboxId: true },
            });
            return dependentInboxes.map(inbox => inbox.inboxId);
        }
        catch (error) {
            console.error(`[CacheInvalidationManager] Error finding dependent inboxes for: ${inboxId}`, error);
            return [];
        }
    }
}
exports.CacheInvalidationManager = CacheInvalidationManager;
// Cache warming strategies
class CacheWarmingManager {
    static instance;
    warmingInProgress = false;
    static getInstance() {
        if (!this.instance) {
            this.instance = new CacheWarmingManager();
        }
        return this.instance;
    }
    // Warm cache for frequently accessed credentials
    async warmFrequentlyAccessedCredentials() {
        if (this.warmingInProgress) {
            console.log('[CacheWarmingManager] Cache warming already in progress, skipping');
            return;
        }
        this.warmingInProgress = true;
        try {
            console.log('[CacheWarmingManager] Starting cache warming for frequently accessed credentials');
            const { prisma } = await Promise.resolve().then(() => __importStar(require('../prisma')));
            // Get active inboxes (those with recent activity)
            const activeInboxes = await prisma.chatwitInbox.findMany({
                where: {
                    updatedAt: {
                        gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last 7 days
                    },
                },
                select: {
                    inboxId: true,
                    whatsappApiKey: true,
                    phoneNumberId: true,
                    whatsappBusinessAccountId: true,
                    updatedAt: true,
                },
                take: 100, // Limit to top 100 active inboxes
            });
            console.log(`[CacheWarmingManager] Found ${activeInboxes.length} active inboxes to warm`);
            // Warm cache for each active inbox
            for (const inbox of activeInboxes) {
                try {
                    if (inbox.whatsappApiKey && inbox.phoneNumberId && inbox.whatsappBusinessAccountId) {
                        const credentials = {
                            whatsappApiKey: inbox.whatsappApiKey,
                            phoneNumberId: inbox.phoneNumberId,
                            businessId: inbox.whatsappBusinessAccountId,
                            inboxId: inbox.inboxId,
                            source: 'inbox',
                            updatedAt: inbox.updatedAt,
                        };
                        await exports.credentialsCache.setCredentials(inbox.inboxId, credentials);
                    }
                }
                catch (error) {
                    console.error(`[CacheWarmingManager] Error warming cache for inbox: ${inbox.inboxId}`, error);
                }
            }
            console.log(`[CacheWarmingManager] Cache warming completed for ${activeInboxes.length} inboxes`);
        }
        catch (error) {
            console.error('[CacheWarmingManager] Error during cache warming:', error);
        }
        finally {
            this.warmingInProgress = false;
        }
    }
    // Warm cache for specific inboxes
    async warmSpecificInboxes(inboxIds) {
        try {
            console.log(`[CacheWarmingManager] Warming cache for specific inboxes: ${inboxIds.length}`);
            const { CredentialsFallbackResolver } = await Promise.resolve().then(() => __importStar(require('../../worker/WebhookWorkerTasks/persistencia.worker.task')));
            // Warm cache for each specified inbox
            for (const inboxId of inboxIds) {
                try {
                    const credentials = await CredentialsFallbackResolver.resolveCredentials(inboxId);
                    if (credentials) {
                        await exports.credentialsCache.setCredentials(inboxId, credentials);
                    }
                }
                catch (error) {
                    console.error(`[CacheWarmingManager] Error warming cache for inbox: ${inboxId}`, error);
                }
            }
            console.log(`[CacheWarmingManager] Specific cache warming completed for ${inboxIds.length} inboxes`);
        }
        catch (error) {
            console.error('[CacheWarmingManager] Error during specific cache warming:', error);
        }
    }
    // Schedule periodic cache warming
    startPeriodicWarming() {
        // Warm cache every 30 minutes
        setInterval(() => {
            this.warmFrequentlyAccessedCredentials().catch(error => {
                console.error('[CacheWarmingManager] Error in periodic cache warming:', error);
            });
        }, 30 * 60 * 1000);
        console.log('[CacheWarmingManager] Periodic cache warming scheduled');
    }
}
exports.CacheWarmingManager = CacheWarmingManager;
// Cache health monitoring and automatic recovery
class CacheHealthMonitor {
    static instance;
    healthStats = {
        totalRequests: 0,
        cacheHits: 0,
        cacheMisses: 0,
        errors: 0,
        lastHealthCheck: new Date(),
        averageLatency: 0,
        latencyMeasurements: [],
    };
    static getInstance() {
        if (!this.instance) {
            this.instance = new CacheHealthMonitor();
        }
        return this.instance;
    }
    // Record cache operation
    recordCacheOperation(type, latency) {
        this.healthStats.totalRequests++;
        switch (type) {
            case 'hit':
                this.healthStats.cacheHits++;
                break;
            case 'miss':
                this.healthStats.cacheMisses++;
                break;
            case 'error':
                this.healthStats.errors++;
                break;
        }
        if (latency !== undefined) {
            this.healthStats.latencyMeasurements.push(latency);
            // Keep only last 100 measurements
            if (this.healthStats.latencyMeasurements.length > 100) {
                this.healthStats.latencyMeasurements.shift();
            }
            // Calculate average latency
            this.healthStats.averageLatency =
                this.healthStats.latencyMeasurements.reduce((sum, lat) => sum + lat, 0) /
                    this.healthStats.latencyMeasurements.length;
        }
    }
    // Get cache performance statistics
    getPerformanceStats() {
        const hitRate = this.healthStats.totalRequests > 0
            ? (this.healthStats.cacheHits / this.healthStats.totalRequests) * 100
            : 0;
        const errorRate = this.healthStats.totalRequests > 0
            ? (this.healthStats.errors / this.healthStats.totalRequests) * 100
            : 0;
        return {
            hitRate: Math.round(hitRate * 100) / 100,
            errorRate: Math.round(errorRate * 100) / 100,
            averageLatency: Math.round(this.healthStats.averageLatency * 100) / 100,
            totalRequests: this.healthStats.totalRequests,
            lastHealthCheck: this.healthStats.lastHealthCheck,
        };
    }
    // Check cache health and trigger recovery if needed
    async checkHealthAndRecover() {
        try {
            const health = await exports.credentialsCache.checkHealth();
            this.healthStats.lastHealthCheck = new Date();
            if (!health.isConnected) {
                console.warn('[CacheHealthMonitor] Cache is not connected, attempting recovery');
                await this.attemptRecovery();
            }
            else if (health.latency > 1000) { // High latency threshold
                console.warn(`[CacheHealthMonitor] High cache latency detected: ${health.latency}ms`);
            }
            // Log performance stats periodically
            const stats = this.getPerformanceStats();
            if (stats.totalRequests > 0) {
                console.log('[CacheHealthMonitor] Performance stats:', stats);
            }
            // Alert on low hit rate
            if (stats.hitRate < 50 && stats.totalRequests > 100) {
                console.warn(`[CacheHealthMonitor] Low cache hit rate: ${stats.hitRate}%`);
            }
            // Alert on high error rate
            if (stats.errorRate > 5 && stats.totalRequests > 100) {
                console.warn(`[CacheHealthMonitor] High cache error rate: ${stats.errorRate}%`);
            }
        }
        catch (error) {
            console.error('[CacheHealthMonitor] Error during health check:', error);
        }
    }
    // Attempt cache recovery
    async attemptRecovery() {
        try {
            console.log('[CacheHealthMonitor] Attempting cache recovery...');
            // Try to reconnect (this would depend on your Redis setup)
            const health = await exports.credentialsCache.checkHealth();
            if (health.isConnected) {
                console.log('[CacheHealthMonitor] Cache recovery successful');
                // Warm cache after recovery
                const warmingManager = CacheWarmingManager.getInstance();
                await warmingManager.warmFrequentlyAccessedCredentials();
            }
            else {
                console.error('[CacheHealthMonitor] Cache recovery failed');
            }
        }
        catch (error) {
            console.error('[CacheHealthMonitor] Error during cache recovery:', error);
        }
    }
    // Start health monitoring
    startHealthMonitoring() {
        // Check health every 5 minutes
        setInterval(() => {
            this.checkHealthAndRecover().catch(error => {
                console.error('[CacheHealthMonitor] Error in health monitoring:', error);
            });
        }, 5 * 60 * 1000);
        // Reset stats every hour
        setInterval(() => {
            this.resetStats();
        }, 60 * 60 * 1000);
        console.log('[CacheHealthMonitor] Health monitoring started');
    }
    // Reset statistics
    resetStats() {
        const oldStats = { ...this.healthStats };
        this.healthStats = {
            totalRequests: 0,
            cacheHits: 0,
            cacheMisses: 0,
            errors: 0,
            lastHealthCheck: new Date(),
            averageLatency: 0,
            latencyMeasurements: [],
        };
        console.log('[CacheHealthMonitor] Stats reset', {
            previousHour: {
                hitRate: oldStats.totalRequests > 0 ? (oldStats.cacheHits / oldStats.totalRequests) * 100 : 0,
                totalRequests: oldStats.totalRequests,
                errors: oldStats.errors,
            },
        });
    }
}
exports.CacheHealthMonitor = CacheHealthMonitor;
// Enhanced cache warming utility
async function warmCache(inboxIds) {
    const warmingManager = CacheWarmingManager.getInstance();
    await warmingManager.warmSpecificInboxes(inboxIds);
}
// Enhanced cache maintenance with monitoring and recovery
function startCacheMaintenance() {
    const invalidationManager = CacheInvalidationManager.getInstance();
    const warmingManager = CacheWarmingManager.getInstance();
    const healthMonitor = CacheHealthMonitor.getInstance();
    // Start all monitoring and maintenance services
    warmingManager.startPeriodicWarming();
    healthMonitor.startHealthMonitoring();
    // Original health check (now enhanced)
    setInterval(async () => {
        try {
            await healthMonitor.checkHealthAndRecover();
        }
        catch (error) {
            console.error('[CredentialsCache] Maintenance error:', error);
        }
    }, 60 * 60 * 1000);
    console.log('[CredentialsCache] Enhanced cache maintenance started');
}
// Export manager instances for external use
exports.cacheInvalidationManager = CacheInvalidationManager.getInstance();
exports.cacheWarmingManager = CacheWarmingManager.getInstance();
exports.cacheHealthMonitor = CacheHealthMonitor.getInstance();
