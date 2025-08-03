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
exports.apm = exports.ApplicationPerformanceMonitor = exports.ALERT_THRESHOLDS = void 0;
exports.recordWebhookMetrics = recordWebhookMetrics;
exports.recordWorkerMetrics = recordWorkerMetrics;
exports.recordDatabaseMetrics = recordDatabaseMetrics;
exports.recordCacheMetrics = recordCacheMetrics;
exports.createAPMAlert = createAPMAlert;
exports.measureWebhookPerformance = measureWebhookPerformance;
exports.measureWorkerPerformance = measureWorkerPerformance;
exports.measureDatabasePerformance = measureDatabasePerformance;
exports.startApplicationPerformanceMonitoring = startApplicationPerformanceMonitoring;
const perf_hooks_1 = require("perf_hooks");
const redis_1 = require("../redis");
// Alert thresholds
exports.ALERT_THRESHOLDS = {
    WEBHOOK_RESPONSE_TIME: 100, // ms
    WORKER_PROCESSING_TIME: 5000, // ms
    DATABASE_QUERY_TIME: 1000, // ms
    CACHE_HIT_RATE: 70, // percentage
    ERROR_RATE: 5, // percentage
    QUEUE_DEPTH: 100, // number of jobs
};
class ApplicationPerformanceMonitor {
    static instance;
    redis;
    alerts = new Map();
    metricsBuffer = {
        webhook: [],
        worker: [],
        database: [],
        cache: [],
    };
    METRICS_BUFFER_SIZE = 1000;
    METRICS_FLUSH_INTERVAL = 30000; // 30 seconds
    ALERT_CHECK_INTERVAL = 60000; // 1 minute
    constructor(redisConnection) {
        this.redis = redisConnection || redis_1.connection;
        this.startPeriodicTasks();
    }
    static getInstance() {
        if (!this.instance) {
            this.instance = new ApplicationPerformanceMonitor();
        }
        return this.instance;
    }
    // Start periodic monitoring tasks
    startPeriodicTasks() {
        // Flush metrics to Redis periodically
        setInterval(() => {
            this.flushMetricsToRedis().catch(error => {
                console.error('[APM] Error flushing metrics:', error);
            });
        }, this.METRICS_FLUSH_INTERVAL);
        // Check for alerts periodically
        setInterval(() => {
            this.checkAlerts().catch(error => {
                console.error('[APM] Error checking alerts:', error);
            });
        }, this.ALERT_CHECK_INTERVAL);
        console.log('[APM] Periodic monitoring tasks started');
    }
    // Record webhook performance metrics
    recordWebhookMetrics(metrics) {
        this.metricsBuffer.webhook.push(metrics);
        // Keep buffer size manageable
        if (this.metricsBuffer.webhook.length > this.METRICS_BUFFER_SIZE) {
            this.metricsBuffer.webhook.shift();
        }
        // Check for immediate alerts
        if (metrics.responseTime > exports.ALERT_THRESHOLDS.WEBHOOK_RESPONSE_TIME) {
            this.createAlert({
                level: 'warning',
                component: 'webhook',
                message: `Webhook response time exceeded threshold: ${metrics.responseTime}ms`,
                metrics: { responseTime: metrics.responseTime, correlationId: metrics.correlationId },
            });
        }
        if (!metrics.success) {
            this.createAlert({
                level: 'error',
                component: 'webhook',
                message: `Webhook processing failed: ${metrics.error}`,
                metrics: { correlationId: metrics.correlationId, error: metrics.error },
            });
        }
        console.log(`[APM] Webhook metrics recorded`, {
            correlationId: metrics.correlationId,
            responseTime: metrics.responseTime,
            success: metrics.success,
        });
    }
    // Record worker performance metrics
    recordWorkerMetrics(metrics) {
        this.metricsBuffer.worker.push(metrics);
        if (this.metricsBuffer.worker.length > this.METRICS_BUFFER_SIZE) {
            this.metricsBuffer.worker.shift();
        }
        // Check for alerts
        if (metrics.processingTime > exports.ALERT_THRESHOLDS.WORKER_PROCESSING_TIME) {
            this.createAlert({
                level: 'warning',
                component: 'worker',
                message: `Worker processing time exceeded threshold: ${metrics.processingTime}ms`,
                metrics: {
                    jobId: metrics.jobId,
                    jobType: metrics.jobType,
                    processingTime: metrics.processingTime
                },
            });
        }
        if (!metrics.success) {
            this.createAlert({
                level: 'error',
                component: 'worker',
                message: `Worker job failed: ${metrics.error}`,
                metrics: {
                    jobId: metrics.jobId,
                    jobType: metrics.jobType,
                    error: metrics.error,
                    retryCount: metrics.retryCount
                },
            });
        }
        console.log(`[APM] Worker metrics recorded`, {
            jobId: metrics.jobId,
            jobType: metrics.jobType,
            processingTime: metrics.processingTime,
            success: metrics.success,
        });
    }
    // Record database performance metrics
    recordDatabaseMetrics(metrics) {
        this.metricsBuffer.database.push(metrics);
        if (this.metricsBuffer.database.length > this.METRICS_BUFFER_SIZE) {
            this.metricsBuffer.database.shift();
        }
        // Check for slow query alerts
        if (metrics.executionTime > exports.ALERT_THRESHOLDS.DATABASE_QUERY_TIME) {
            this.createAlert({
                level: 'warning',
                component: 'database',
                message: `Slow database query detected: ${metrics.executionTime}ms`,
                metrics: {
                    queryType: metrics.queryType,
                    executionTime: metrics.executionTime,
                    queryHash: metrics.queryHash
                },
            });
        }
        if (!metrics.success) {
            this.createAlert({
                level: 'error',
                component: 'database',
                message: `Database query failed: ${metrics.error}`,
                metrics: {
                    queryType: metrics.queryType,
                    error: metrics.error,
                    queryHash: metrics.queryHash
                },
            });
        }
        console.log(`[APM] Database metrics recorded`, {
            queryType: metrics.queryType,
            executionTime: metrics.executionTime,
            success: metrics.success,
        });
    }
    // Record cache performance metrics
    recordCacheMetrics(metrics) {
        this.metricsBuffer.cache.push(metrics);
        if (this.metricsBuffer.cache.length > this.METRICS_BUFFER_SIZE) {
            this.metricsBuffer.cache.shift();
        }
        // Check for cache performance alerts
        if (metrics.hitRate < exports.ALERT_THRESHOLDS.CACHE_HIT_RATE) {
            this.createAlert({
                level: 'warning',
                component: 'cache',
                message: `Cache hit rate below threshold: ${metrics.hitRate}%`,
                metrics: { hitRate: metrics.hitRate, operation: metrics.operation },
            });
        }
        if (!metrics.success) {
            this.createAlert({
                level: 'error',
                component: 'cache',
                message: `Cache operation failed: ${metrics.error}`,
                metrics: { operation: metrics.operation, error: metrics.error },
            });
        }
        console.log(`[APM] Cache metrics recorded`, {
            operation: metrics.operation,
            hitRate: metrics.hitRate,
            latency: metrics.latency,
            success: metrics.success,
        });
    }
    // Create and manage alerts
    createAlert(alertData) {
        const alertId = `${alertData.component}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const alert = {
            id: alertId,
            level: alertData.level,
            component: alertData.component,
            message: alertData.message,
            timestamp: new Date(),
            metrics: alertData.metrics,
            resolved: false,
        };
        this.alerts.set(alertId, alert);
        // Log alert based on level
        const logMessage = `[APM Alert] ${alert.level.toUpperCase()}: ${alert.message}`;
        const logData = { alertId, component: alert.component, metrics: alert.metrics };
        switch (alert.level) {
            case 'critical':
            case 'error':
                console.error(logMessage, logData);
                break;
            case 'warning':
                console.warn(logMessage, logData);
                break;
            case 'info':
                console.info(logMessage, logData);
                break;
        }
        // Store alert in Redis for persistence
        this.storeAlertInRedis(alert).catch(error => {
            console.error('[APM] Error storing alert in Redis:', error);
        });
    }
    // Expose alert creation for other modules
    triggerAlert(alertData) {
        this.createAlert(alertData);
    }
    // Store alert in Redis
    async storeAlertInRedis(alert) {
        try {
            const key = `chatwit:alerts:${alert.id}`;
            await this.redis.setex(key, 24 * 60 * 60, JSON.stringify(alert)); // 24 hours TTL
            // Add to alerts list
            const listKey = `chatwit:alerts:list:${alert.component}`;
            await this.redis.lpush(listKey, alert.id);
            await this.redis.ltrim(listKey, 0, 99); // Keep last 100 alerts per component
        }
        catch (error) {
            console.error('[APM] Error storing alert in Redis:', error);
        }
    }
    // Flush metrics to Redis for persistence and analysis
    async flushMetricsToRedis() {
        try {
            const timestamp = new Date().toISOString();
            // Flush webhook metrics
            if (this.metricsBuffer.webhook.length > 0) {
                const key = `chatwit:metrics:webhook:${timestamp}`;
                await this.redis.setex(key, 60 * 60, JSON.stringify(this.metricsBuffer.webhook)); // 1 hour TTL
                console.log(`[APM] Flushed ${this.metricsBuffer.webhook.length} webhook metrics`);
                this.metricsBuffer.webhook = [];
            }
            // Flush worker metrics
            if (this.metricsBuffer.worker.length > 0) {
                const key = `chatwit:metrics:worker:${timestamp}`;
                await this.redis.setex(key, 60 * 60, JSON.stringify(this.metricsBuffer.worker));
                console.log(`[APM] Flushed ${this.metricsBuffer.worker.length} worker metrics`);
                this.metricsBuffer.worker = [];
            }
            // Flush database metrics
            if (this.metricsBuffer.database.length > 0) {
                const key = `chatwit:metrics:database:${timestamp}`;
                await this.redis.setex(key, 60 * 60, JSON.stringify(this.metricsBuffer.database));
                console.log(`[APM] Flushed ${this.metricsBuffer.database.length} database metrics`);
                this.metricsBuffer.database = [];
            }
            // Flush cache metrics
            if (this.metricsBuffer.cache.length > 0) {
                const key = `chatwit:metrics:cache:${timestamp}`;
                await this.redis.setex(key, 60 * 60, JSON.stringify(this.metricsBuffer.cache));
                console.log(`[APM] Flushed ${this.metricsBuffer.cache.length} cache metrics`);
                this.metricsBuffer.cache = [];
            }
        }
        catch (error) {
            console.error('[APM] Error flushing metrics to Redis:', error);
        }
    }
    // Check for system-wide alerts
    async checkAlerts() {
        try {
            await this.checkErrorRates();
            await this.checkQueueDepths();
            await this.checkSystemHealth();
        }
        catch (error) {
            console.error('[APM] Error checking alerts:', error);
        }
    }
    // Check error rates across components
    async checkErrorRates() {
        const now = Date.now();
        const fiveMinutesAgo = now - (5 * 60 * 1000);
        // Check webhook error rate
        const recentWebhookMetrics = this.metricsBuffer.webhook.filter(m => m.timestamp.getTime() > fiveMinutesAgo);
        if (recentWebhookMetrics.length > 10) {
            const errorCount = recentWebhookMetrics.filter(m => !m.success).length;
            const errorRate = (errorCount / recentWebhookMetrics.length) * 100;
            if (errorRate > exports.ALERT_THRESHOLDS.ERROR_RATE) {
                this.createAlert({
                    level: 'error',
                    component: 'webhook',
                    message: `High webhook error rate: ${errorRate.toFixed(2)}%`,
                    metrics: { errorRate, totalRequests: recentWebhookMetrics.length, errors: errorCount },
                });
            }
        }
        // Check worker error rate
        const recentWorkerMetrics = this.metricsBuffer.worker.filter(m => m.timestamp.getTime() > fiveMinutesAgo);
        if (recentWorkerMetrics.length > 10) {
            const errorCount = recentWorkerMetrics.filter(m => !m.success).length;
            const errorRate = (errorCount / recentWorkerMetrics.length) * 100;
            if (errorRate > exports.ALERT_THRESHOLDS.ERROR_RATE) {
                this.createAlert({
                    level: 'error',
                    component: 'worker',
                    message: `High worker error rate: ${errorRate.toFixed(2)}%`,
                    metrics: { errorRate, totalJobs: recentWorkerMetrics.length, errors: errorCount },
                });
            }
        }
    }
    // Check queue depths
    async checkQueueDepths() {
        try {
            const { getQueueHealth: getRespostaRapidaHealth } = await Promise.resolve().then(() => __importStar(require('../queue/resposta-rapida.queue')));
            const { getQueueHealth: getPersistenciaHealth } = await Promise.resolve().then(() => __importStar(require('../queue/persistencia-credenciais.queue')));
            const [respostaRapidaHealth, persistenciaHealth] = await Promise.all([
                getRespostaRapidaHealth(),
                getPersistenciaHealth(),
            ]);
            // Check high priority queue depth
            const totalHighPriorityJobs = respostaRapidaHealth.waiting + respostaRapidaHealth.active;
            if (totalHighPriorityJobs > exports.ALERT_THRESHOLDS.QUEUE_DEPTH) {
                this.createAlert({
                    level: 'warning',
                    component: 'queue',
                    message: `High priority queue depth exceeded: ${totalHighPriorityJobs} jobs`,
                    metrics: { queueType: 'resposta-rapida', ...respostaRapidaHealth },
                });
            }
            // Check low priority queue depth
            const totalLowPriorityJobs = persistenciaHealth.waiting + persistenciaHealth.active;
            if (totalLowPriorityJobs > exports.ALERT_THRESHOLDS.QUEUE_DEPTH * 2) { // Higher threshold for low priority
                this.createAlert({
                    level: 'warning',
                    component: 'queue',
                    message: `Low priority queue depth exceeded: ${totalLowPriorityJobs} jobs`,
                    metrics: { queueType: 'persistencia-credenciais', ...persistenciaHealth },
                });
            }
            // Check for too many failed jobs
            if (respostaRapidaHealth.failed > 50) {
                this.createAlert({
                    level: 'error',
                    component: 'queue',
                    message: `High number of failed high priority jobs: ${respostaRapidaHealth.failed}`,
                    metrics: { queueType: 'resposta-rapida', failedJobs: respostaRapidaHealth.failed },
                });
            }
        }
        catch (error) {
            console.error('[APM] Error checking queue depths:', error);
        }
    }
    // Check overall system health
    async checkSystemHealth() {
        try {
            // Check Redis connection
            const start = Date.now();
            await this.redis.ping();
            const redisLatency = Date.now() - start;
            if (redisLatency > 500) {
                this.createAlert({
                    level: 'warning',
                    component: 'redis',
                    message: `High Redis latency: ${redisLatency}ms`,
                    metrics: { latency: redisLatency },
                });
            }
            // Check cache health
            const { credentialsCache } = await Promise.resolve().then(() => __importStar(require('../cache/credentials-cache')));
            const cacheHealth = await credentialsCache.checkHealth();
            if (!cacheHealth.isConnected) {
                this.createAlert({
                    level: 'critical',
                    component: 'cache',
                    message: 'Cache is not connected',
                    metrics: cacheHealth,
                });
            }
        }
        catch (error) {
            this.createAlert({
                level: 'critical',
                component: 'system',
                message: `System health check failed: ${error instanceof Error ? error.message : error}`,
                metrics: { error: error instanceof Error ? error.message : error },
            });
        }
    }
    // Get current alerts
    getActiveAlerts() {
        return Array.from(this.alerts.values()).filter(alert => !alert.resolved);
    }
    // Get alerts by component
    getAlertsByComponent(component) {
        return Array.from(this.alerts.values()).filter(alert => alert.component === component && !alert.resolved);
    }
    // Resolve alert
    resolveAlert(alertId) {
        const alert = this.alerts.get(alertId);
        if (alert && !alert.resolved) {
            alert.resolved = true;
            alert.resolvedAt = new Date();
            console.log(`[APM] Alert resolved: ${alertId}`, {
                component: alert.component,
                message: alert.message,
            });
            // Update in Redis
            this.storeAlertInRedis(alert).catch(error => {
                console.error('[APM] Error updating resolved alert in Redis:', error);
            });
            return true;
        }
        return false;
    }
    // Get performance summary
    async getPerformanceSummary() {
        const now = Date.now();
        const oneHourAgo = now - (60 * 60 * 1000);
        // Calculate webhook stats
        const recentWebhookMetrics = this.metricsBuffer.webhook.filter(m => m.timestamp.getTime() > oneHourAgo);
        const webhookStats = {
            avgResponseTime: recentWebhookMetrics.length > 0
                ? recentWebhookMetrics.reduce((sum, m) => sum + m.responseTime, 0) / recentWebhookMetrics.length
                : 0,
            successRate: recentWebhookMetrics.length > 0
                ? (recentWebhookMetrics.filter(m => m.success).length / recentWebhookMetrics.length) * 100
                : 0,
            totalRequests: recentWebhookMetrics.length,
        };
        // Calculate worker stats
        const recentWorkerMetrics = this.metricsBuffer.worker.filter(m => m.timestamp.getTime() > oneHourAgo);
        const workerStats = {
            avgProcessingTime: recentWorkerMetrics.length > 0
                ? recentWorkerMetrics.reduce((sum, m) => sum + m.processingTime, 0) / recentWorkerMetrics.length
                : 0,
            successRate: recentWorkerMetrics.length > 0
                ? (recentWorkerMetrics.filter(m => m.success).length / recentWorkerMetrics.length) * 100
                : 0,
            totalJobs: recentWorkerMetrics.length,
        };
        // Calculate database stats
        const recentDatabaseMetrics = this.metricsBuffer.database.filter(m => m.timestamp.getTime() > oneHourAgo);
        const databaseStats = {
            avgQueryTime: recentDatabaseMetrics.length > 0
                ? recentDatabaseMetrics.reduce((sum, m) => sum + m.executionTime, 0) / recentDatabaseMetrics.length
                : 0,
            successRate: recentDatabaseMetrics.length > 0
                ? (recentDatabaseMetrics.filter(m => m.success).length / recentDatabaseMetrics.length) * 100
                : 0,
            totalQueries: recentDatabaseMetrics.length,
        };
        // Calculate cache stats
        const recentCacheMetrics = this.metricsBuffer.cache.filter(m => m.timestamp.getTime() > oneHourAgo);
        const cacheStats = {
            avgHitRate: recentCacheMetrics.length > 0
                ? recentCacheMetrics.reduce((sum, m) => sum + m.hitRate, 0) / recentCacheMetrics.length
                : 0,
            avgLatency: recentCacheMetrics.length > 0
                ? recentCacheMetrics.reduce((sum, m) => sum + m.latency, 0) / recentCacheMetrics.length
                : 0,
            totalOperations: recentCacheMetrics.length,
        };
        // Calculate alert stats
        const activeAlerts = this.getActiveAlerts();
        const alertsByLevel = {
            info: 0,
            warning: 0,
            error: 0,
            critical: 0,
        };
        activeAlerts.forEach(alert => {
            alertsByLevel[alert.level]++;
        });
        return {
            webhook: webhookStats,
            worker: workerStats,
            database: databaseStats,
            cache: cacheStats,
            alerts: {
                total: activeAlerts.length,
                byLevel: alertsByLevel,
            },
        };
    }
    // Cleanup old alerts and metrics
    async cleanup() {
        try {
            const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
            // Remove old alerts from memory
            for (const [alertId, alert] of this.alerts.entries()) {
                if (alert.timestamp.getTime() < oneDayAgo) {
                    this.alerts.delete(alertId);
                }
            }
            console.log('[APM] Cleanup completed');
        }
        catch (error) {
            console.error('[APM] Error during cleanup:', error);
        }
    }
    // Graceful shutdown
    async shutdown() {
        try {
            console.log('[APM] Shutting down Application Performance Monitor...');
            // Flush remaining metrics
            await this.flushMetricsToRedis();
            // Cleanup
            await this.cleanup();
            console.log('[APM] Shutdown completed');
        }
        catch (error) {
            console.error('[APM] Error during shutdown:', error);
        }
    }
}
exports.ApplicationPerformanceMonitor = ApplicationPerformanceMonitor;
// Global APM instance
exports.apm = ApplicationPerformanceMonitor.getInstance();
// Utility functions for easy integration
function recordWebhookMetrics(metrics) {
    exports.apm.recordWebhookMetrics(metrics);
}
function recordWorkerMetrics(metrics) {
    exports.apm.recordWorkerMetrics(metrics);
}
function recordDatabaseMetrics(metrics) {
    exports.apm.recordDatabaseMetrics(metrics);
}
function recordCacheMetrics(metrics) {
    exports.apm.recordCacheMetrics(metrics);
}
function createAPMAlert(alertData) {
    exports.apm.triggerAlert(alertData);
}
// Performance measurement decorators
function measureWebhookPerformance(fn, getMetricsData) {
    return (async (...args) => {
        const start = perf_hooks_1.performance.now();
        let result;
        let error;
        try {
            result = await fn(...args);
            return result;
        }
        catch (err) {
            error = err instanceof Error ? err : new Error(String(err));
            throw error;
        }
        finally {
            const responseTime = perf_hooks_1.performance.now() - start;
            const metricsData = getMetricsData(args, result, error);
            recordWebhookMetrics({
                responseTime,
                timestamp: new Date(),
                success: !error,
                error: error?.message,
                correlationId: metricsData.correlationId || 'unknown',
                payloadSize: metricsData.payloadSize || 0,
                interactionType: metricsData.interactionType || 'intent',
                ...metricsData,
            });
        }
    });
}
function measureWorkerPerformance(fn, getMetricsData) {
    return (async (...args) => {
        const start = perf_hooks_1.performance.now();
        let result;
        let error;
        try {
            result = await fn(...args);
            return result;
        }
        catch (err) {
            error = err instanceof Error ? err : new Error(String(err));
            throw error;
        }
        finally {
            const processingTime = perf_hooks_1.performance.now() - start;
            const metricsData = getMetricsData(args, result, error);
            recordWorkerMetrics({
                processingTime,
                queueWaitTime: 0, // This would need to be calculated from job data
                timestamp: new Date(),
                success: !error,
                error: error?.message,
                jobId: metricsData.jobId || 'unknown',
                jobType: metricsData.jobType || 'unknown',
                correlationId: metricsData.correlationId || 'unknown',
                retryCount: metricsData.retryCount || 0,
                ...metricsData,
            });
        }
    });
}
function measureDatabasePerformance(fn, getMetricsData) {
    return (async (...args) => {
        const start = perf_hooks_1.performance.now();
        let result;
        let error;
        try {
            result = await fn(...args);
            return result;
        }
        catch (err) {
            error = err instanceof Error ? err : new Error(String(err));
            throw error;
        }
        finally {
            const executionTime = perf_hooks_1.performance.now() - start;
            const metricsData = getMetricsData(args, result, error);
            recordDatabaseMetrics({
                executionTime,
                timestamp: new Date(),
                success: !error,
                error: error?.message,
                queryType: metricsData.queryType || 'unknown',
                queryHash: metricsData.queryHash || 'unknown',
                affectedRows: metricsData.affectedRows,
                ...metricsData,
            });
        }
    });
}
// Start monitoring (call this from your main application)
function startApplicationPerformanceMonitoring() {
    console.log('[APM] Application Performance Monitoring started');
    // The instance is already created and monitoring is started in the constructor
    // This function is mainly for explicit initialization
}
