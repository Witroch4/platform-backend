"use strict";
/**
 * Queue Management - Cache Invalidation System
 *
 * Intelligent cache invalidation based on events and data changes
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.CacheInvalidationManager = void 0;
exports.getCacheInvalidationManager = getCacheInvalidationManager;
exports.setCacheInvalidationManager = setCacheInvalidationManager;
const cache_manager_1 = require("./cache-manager");
const queue_cache_1 = require("./queue-cache");
const metrics_cache_1 = require("./metrics-cache");
const user_cache_1 = require("./user-cache");
class CacheInvalidationManager {
    cacheManager = (0, cache_manager_1.getCacheManager)();
    queueCache = (0, queue_cache_1.getQueueCache)();
    metricsCache = (0, metrics_cache_1.getMetricsCache)();
    userCache = (0, user_cache_1.getUserCache)();
    invalidationRules = [
        // Queue events
        {
            eventType: 'QUEUE_CREATED',
            patterns: ['queue:list', 'queue:active'],
        },
        {
            eventType: 'QUEUE_UPDATED',
            patterns: ['queue:config:*', 'queue:health:*'],
        },
        {
            eventType: 'QUEUE_DELETED',
            patterns: ['queue:*', 'metrics:*'],
        },
        {
            eventType: 'QUEUE_PAUSED',
            patterns: ['queue:health:*', 'queue:paused:*'],
        },
        {
            eventType: 'QUEUE_RESUMED',
            patterns: ['queue:health:*', 'queue:paused:*'],
        },
        // Job events
        {
            eventType: 'JOB_CREATED',
            patterns: ['queue:health:*', 'queue:stats:*', 'metrics:*'],
        },
        {
            eventType: 'JOB_STARTED',
            patterns: ['queue:health:*', 'queue:stats:*', 'metrics:realtime'],
        },
        {
            eventType: 'JOB_COMPLETED',
            patterns: ['queue:health:*', 'queue:stats:*', 'metrics:*'],
        },
        {
            eventType: 'JOB_FAILED',
            patterns: ['queue:health:*', 'queue:stats:*', 'queue:error:*', 'metrics:*'],
        },
        {
            eventType: 'JOB_RETRIED',
            patterns: ['queue:health:*', 'queue:stats:*', 'metrics:*'],
        },
        // Alert events
        {
            eventType: 'ALERT_TRIGGERED',
            patterns: ['alerts:active', 'metrics:alert:*'],
        },
        {
            eventType: 'ALERT_ACKNOWLEDGED',
            patterns: ['alerts:active'],
        },
        {
            eventType: 'ALERT_RESOLVED',
            patterns: ['alerts:active', 'metrics:alert:*'],
        },
        // User events
        {
            eventType: 'USER_LOGIN',
            patterns: ['users:active'],
        },
        {
            eventType: 'USER_LOGOUT',
            patterns: ['users:active', 'user:session:*'],
        },
        {
            eventType: 'USER_ACTION',
            patterns: ['user:activity:*'],
        },
    ];
    /**
     * Handle cache invalidation for an event
     */
    async handleEvent(eventType, context) {
        const rules = this.invalidationRules.filter(rule => rule.eventType === eventType);
        for (const rule of rules) {
            if (rule.delay) {
                // Delayed invalidation
                setTimeout(() => {
                    this.invalidatePatterns(rule.patterns, context);
                }, rule.delay);
            }
            else {
                // Immediate invalidation
                await this.invalidatePatterns(rule.patterns, context);
            }
        }
    }
    /**
     * Invalidate cache patterns with context substitution
     */
    async invalidatePatterns(patterns, context) {
        for (const pattern of patterns) {
            let resolvedPattern = pattern;
            // Substitute context variables
            if (context.queueName && pattern.includes('*')) {
                resolvedPattern = pattern.replace('*', context.queueName);
            }
            if (context.userId && pattern.includes('*')) {
                resolvedPattern = pattern.replace('*', context.userId);
            }
            // If pattern still contains wildcards, use pattern deletion
            if (resolvedPattern.includes('*')) {
                await this.cacheManager.deletePattern(resolvedPattern);
            }
            else {
                await this.cacheManager.delete(resolvedPattern);
            }
        }
    }
    /**
     * Invalidate queue-related cache
     */
    async invalidateQueue(queueName) {
        await Promise.all([
            this.queueCache.invalidateQueue(queueName),
            this.metricsCache.invalidateQueueMetrics(queueName),
        ]);
    }
    /**
     * Invalidate user-related cache
     */
    async invalidateUser(userId) {
        await this.userCache.invalidateUser(userId);
    }
    /**
     * Invalidate metrics cache
     */
    async invalidateMetrics(queueName) {
        if (queueName) {
            await this.metricsCache.invalidateQueueMetrics(queueName);
        }
        else {
            await this.metricsCache.invalidateAllMetrics();
        }
    }
    /**
     * Smart invalidation based on data changes
     */
    async smartInvalidate(changeType, identifier, operation) {
        switch (changeType) {
            case 'queue':
                await this.invalidateQueueData(identifier, operation);
                break;
            case 'job':
                await this.invalidateJobData(identifier, operation);
                break;
            case 'user':
                await this.invalidateUserData(identifier, operation);
                break;
            case 'alert':
                await this.invalidateAlertData(identifier, operation);
                break;
            case 'metric':
                await this.invalidateMetricData(identifier, operation);
                break;
        }
    }
    /**
     * Invalidate queue data based on operation
     */
    async invalidateQueueData(queueName, operation) {
        switch (operation) {
            case 'create':
                await this.cacheManager.delete('queue:list');
                await this.queueCache.addActiveQueue(queueName);
                break;
            case 'update':
                await this.queueCache.invalidateQueueConfig(queueName);
                await this.queueCache.invalidateQueueHealth(queueName);
                break;
            case 'delete':
                await this.invalidateQueue(queueName);
                await this.queueCache.removeActiveQueue(queueName);
                await this.cacheManager.delete('queue:list');
                break;
        }
    }
    /**
     * Invalidate job data based on operation
     */
    async invalidateJobData(jobId, operation) {
        // Extract queue name from job ID if possible
        // This is a simplified implementation - in practice, you'd need the queue name
        await this.cacheManager.deletePattern('queue:health:*');
        await this.cacheManager.deletePattern('queue:stats:*');
        await this.cacheManager.deletePattern('metrics:realtime*');
    }
    /**
     * Invalidate user data based on operation
     */
    async invalidateUserData(userId, operation) {
        switch (operation) {
            case 'create':
                await this.userCache.addActiveUser(userId);
                break;
            case 'update':
                await this.userCache.invalidateUserPermissions(userId);
                await this.userCache.invalidateUserSession(userId);
                break;
            case 'delete':
                await this.userCache.invalidateUser(userId);
                await this.userCache.removeActiveUser(userId);
                break;
        }
    }
    /**
     * Invalidate alert data based on operation
     */
    async invalidateAlertData(alertId, operation) {
        await this.cacheManager.delete('alerts:active');
        await this.cacheManager.deletePattern('metrics:alert:*');
    }
    /**
     * Invalidate metric data based on operation
     */
    async invalidateMetricData(metricKey, operation) {
        await this.cacheManager.deletePattern(`metrics:*${metricKey}*`);
        await this.cacheManager.delete('metrics:dashboard');
        await this.cacheManager.delete('metrics:realtime');
    }
    /**
     * Bulk invalidation for multiple items
     */
    async bulkInvalidate(items) {
        const promises = items.map(item => this.smartInvalidate(item.type, item.identifier, item.operation));
        await Promise.all(promises);
    }
    /**
     * Schedule periodic cache cleanup
     */
    scheduleCleanup(intervalMs = 3600000) {
        return setInterval(async () => {
            await this.performCleanup();
        }, intervalMs);
    }
    /**
     * Perform cache cleanup
     */
    async performCleanup() {
        try {
            // Clean up expired keys (Redis handles this automatically, but we can do additional cleanup)
            const info = await this.cacheManager.getRedisInfo();
            const expiredKeys = parseInt(info.expired_keys || '0');
            if (expiredKeys > 1000) {
                console.log(`Cache cleanup: ${expiredKeys} keys expired`);
            }
            // Clean up old metric data points
            await this.metricsCache.cleanupOldMetrics(Date.now() - (7 * 24 * 60 * 60 * 1000)); // 7 days ago
        }
        catch (error) {
            console.error('Cache cleanup error:', error);
        }
    }
    /**
     * Add custom invalidation rule
     */
    addInvalidationRule(rule) {
        this.invalidationRules.push(rule);
    }
    /**
     * Remove invalidation rule
     */
    removeInvalidationRule(eventType) {
        this.invalidationRules = this.invalidationRules.filter(rule => rule.eventType !== eventType);
    }
    /**
     * Get current invalidation rules
     */
    getInvalidationRules() {
        return [...this.invalidationRules];
    }
}
exports.CacheInvalidationManager = CacheInvalidationManager;
// Singleton instance
let cacheInvalidationManager = null;
/**
 * Get cache invalidation manager instance
 */
function getCacheInvalidationManager() {
    if (!cacheInvalidationManager) {
        cacheInvalidationManager = new CacheInvalidationManager();
    }
    return cacheInvalidationManager;
}
/**
 * Set cache invalidation manager instance (useful for testing)
 */
function setCacheInvalidationManager(manager) {
    cacheInvalidationManager = manager;
}
exports.default = getCacheInvalidationManager;
