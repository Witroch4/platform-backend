"use strict";
/**
 * Instagram Translation Queue Monitor
 *
 * Monitoring and health check utilities for Instagram translation queue
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.InstagramTranslationQueueMonitor = void 0;
exports.getQueueMonitor = getQueueMonitor;
exports.startQueueMonitoring = startQueueMonitoring;
exports.stopQueueMonitoring = stopQueueMonitoring;
exports.getInstagramTranslationQueueHealth = getInstagramTranslationQueueHealth;
const instagram_translation_queue_1 = require("../queue/instagram-translation.queue");
const communication_manager_1 = require("./communication-manager");
const instagram_translation_errors_1 = require("../error-handling/instagram-translation-errors");
const events_1 = require("events");
/**
 * Queue Monitor Class
 */
class InstagramTranslationQueueMonitor extends events_1.EventEmitter {
    monitorIntervalMs;
    cleanupIntervalMs;
    isMonitoring = false;
    monitoringInterval;
    cleanupInterval;
    metricsHistory = [];
    maxHistorySize = 1000;
    alerts = new Map();
    constructor(monitorIntervalMs = 30000, // 30 seconds
    cleanupIntervalMs = 300000 // 5 minutes
    ) {
        super();
        this.monitorIntervalMs = monitorIntervalMs;
        this.cleanupIntervalMs = cleanupIntervalMs;
    }
    /**
     * Start monitoring the queue
     */
    async startMonitoring() {
        if (this.isMonitoring) {
            console.warn('[Instagram Translation Monitor] Already monitoring');
            return;
        }
        console.log('[Instagram Translation Monitor] Starting queue monitoring');
        this.isMonitoring = true;
        // Start periodic health checks
        this.monitoringInterval = setInterval(() => this.performHealthCheck(), this.monitorIntervalMs);
        // Start periodic cleanup
        this.cleanupInterval = setInterval(() => this.performCleanup(), this.cleanupIntervalMs);
        // Perform initial health check
        await this.performHealthCheck();
    }
    /**
     * Stop monitoring the queue
     */
    stopMonitoring() {
        if (!this.isMonitoring) {
            return;
        }
        console.log('[Instagram Translation Monitor] Stopping queue monitoring');
        this.isMonitoring = false;
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            this.monitoringInterval = undefined;
        }
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = undefined;
        }
    }
    /**
     * Perform comprehensive health check
     */
    async performHealthCheck() {
        try {
            const startTime = Date.now();
            // Get basic queue health
            const basicHealth = await (0, instagram_translation_queue_1.getQueueHealth)();
            // Get performance metrics
            const performance = await this.calculatePerformanceMetrics();
            // Get resource usage
            const resources = await this.getResourceUsage();
            // Evaluate alerts
            const alerts = this.evaluateAlerts(basicHealth, performance, resources);
            // Determine overall status
            const status = this.determineOverallStatus(alerts);
            const healthStatus = {
                name: instagram_translation_queue_1.INSTAGRAM_TRANSLATION_QUEUE_NAME,
                status,
                counts: basicHealth.counts,
                performance,
                resources,
                lastUpdated: new Date(),
                alerts,
            };
            // Store metrics for history
            this.storeMetrics({
                timestamp: new Date(),
                jobsProcessed: basicHealth.counts.completed,
                avgProcessingTime: performance.avgProcessingTime,
                successCount: basicHealth.counts.completed,
                failureCount: basicHealth.counts.failed,
                queueDepth: basicHealth.counts.waiting + basicHealth.counts.active,
                memoryUsage: resources.memoryUsage,
            });
            // Emit health status event
            this.emit('health-check', healthStatus);
            const checkDuration = Date.now() - startTime;
            console.log(`[Instagram Translation Monitor] Health check completed in ${checkDuration}ms - Status: ${status}`);
            return healthStatus;
        }
        catch (error) {
            console.error('[Instagram Translation Monitor] Health check failed:', error);
            const errorStatus = {
                name: instagram_translation_queue_1.INSTAGRAM_TRANSLATION_QUEUE_NAME,
                status: 'error',
                counts: { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 },
                performance: { throughput: 0, avgProcessingTime: 0, successRate: 0, errorRate: 100 },
                resources: { memoryUsage: 0, redisConnections: 0 },
                lastUpdated: new Date(),
                alerts: [{
                        id: `health-check-error-${Date.now()}`,
                        severity: 'critical',
                        message: `Health check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
                        timestamp: new Date(),
                        resolved: false,
                    }],
            };
            this.emit('health-check', errorStatus);
            return errorStatus;
        }
    }
    /**
     * Calculate performance metrics
     */
    async calculatePerformanceMetrics() {
        const recentMetrics = this.getRecentMetrics(300000); // Last 5 minutes
        if (recentMetrics.length === 0) {
            return {
                throughput: 0,
                avgProcessingTime: 0,
                successRate: 0,
                errorRate: 0,
            };
        }
        // Calculate throughput (jobs per minute)
        const timeSpanMinutes = recentMetrics.length > 1
            ? (recentMetrics[recentMetrics.length - 1].timestamp.getTime() - recentMetrics[0].timestamp.getTime()) / 60000
            : 1;
        const totalJobs = recentMetrics.reduce((sum, metric) => sum + metric.jobsProcessed, 0);
        const throughput = totalJobs / Math.max(timeSpanMinutes, 1);
        // Calculate average processing time
        const avgProcessingTime = recentMetrics.reduce((sum, metric) => sum + metric.avgProcessingTime, 0) / recentMetrics.length;
        // Calculate success and error rates
        const totalSuccess = recentMetrics.reduce((sum, metric) => sum + metric.successCount, 0);
        const totalFailures = recentMetrics.reduce((sum, metric) => sum + metric.failureCount, 0);
        const totalProcessed = totalSuccess + totalFailures;
        const successRate = totalProcessed > 0 ? (totalSuccess / totalProcessed) * 100 : 0;
        const errorRate = totalProcessed > 0 ? (totalFailures / totalProcessed) * 100 : 0;
        return {
            throughput,
            avgProcessingTime,
            successRate,
            errorRate,
        };
    }
    /**
     * Get resource usage information
     */
    async getResourceUsage() {
        const memoryUsage = process.memoryUsage();
        // Get communication manager health
        const commManager = (0, communication_manager_1.getCommunicationManager)();
        const commHealth = await commManager.getHealthStatus();
        return {
            memoryUsage: memoryUsage.heapUsed,
            redisConnections: commHealth.subscriber && commHealth.publisher ? 2 : 0,
        };
    }
    /**
     * Evaluate health alerts
     */
    evaluateAlerts(basicHealth, performance, resources) {
        const alerts = [];
        const now = new Date();
        // Queue depth alert
        const queueDepth = basicHealth.counts.waiting + basicHealth.counts.active;
        if (queueDepth > 100) {
            alerts.push({
                id: 'queue-depth-high',
                severity: queueDepth > 500 ? 'critical' : 'warning',
                message: `High queue depth: ${queueDepth} jobs pending`,
                timestamp: now,
                resolved: false,
            });
        }
        // Error rate alert
        if (performance.errorRate > 10) {
            alerts.push({
                id: 'error-rate-high',
                severity: performance.errorRate > 25 ? 'critical' : 'warning',
                message: `High error rate: ${performance.errorRate.toFixed(1)}%`,
                timestamp: now,
                resolved: false,
            });
        }
        // Processing time alert
        if (performance.avgProcessingTime > 3000) {
            alerts.push({
                id: 'processing-time-high',
                severity: performance.avgProcessingTime > 5000 ? 'critical' : 'warning',
                message: `High processing time: ${performance.avgProcessingTime.toFixed(0)}ms`,
                timestamp: now,
                resolved: false,
            });
        }
        // Memory usage alert
        const memoryMB = resources.memoryUsage / (1024 * 1024);
        if (memoryMB > 500) {
            alerts.push({
                id: 'memory-usage-high',
                severity: memoryMB > 1000 ? 'critical' : 'warning',
                message: `High memory usage: ${memoryMB.toFixed(0)}MB`,
                timestamp: now,
                resolved: false,
            });
        }
        // Failed jobs alert
        if (basicHealth.counts.failed > 50) {
            alerts.push({
                id: 'failed-jobs-high',
                severity: basicHealth.counts.failed > 100 ? 'critical' : 'warning',
                message: `High number of failed jobs: ${basicHealth.counts.failed}`,
                timestamp: now,
                resolved: false,
            });
        }
        // Update alerts map
        for (const alert of alerts) {
            this.alerts.set(alert.id, alert);
        }
        return Array.from(this.alerts.values()).filter(alert => !alert.resolved);
    }
    /**
     * Determine overall health status
     */
    determineOverallStatus(alerts) {
        if (alerts.some(alert => alert.severity === 'critical')) {
            return 'critical';
        }
        if (alerts.some(alert => alert.severity === 'warning')) {
            return 'warning';
        }
        return 'healthy';
    }
    /**
     * Store performance metrics
     */
    storeMetrics(metrics) {
        this.metricsHistory.push(metrics);
        // Keep only recent metrics
        if (this.metricsHistory.length > this.maxHistorySize) {
            this.metricsHistory = this.metricsHistory.slice(-this.maxHistorySize);
        }
    }
    /**
     * Get recent metrics within time range
     */
    getRecentMetrics(timeRangeMs) {
        const cutoff = Date.now() - timeRangeMs;
        return this.metricsHistory.filter(metric => metric.timestamp.getTime() >= cutoff);
    }
    /**
     * Perform cleanup operations
     */
    async performCleanup() {
        try {
            console.log('[Instagram Translation Monitor] Performing cleanup');
            // Clean up old jobs
            await (0, instagram_translation_queue_1.cleanupOldJobs)();
            // Clean up old metrics
            const oneHourAgo = Date.now() - (60 * 60 * 1000);
            this.metricsHistory = this.metricsHistory.filter(metric => metric.timestamp.getTime() >= oneHourAgo);
            // Resolve old alerts
            const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
            for (const [id, alert] of this.alerts.entries()) {
                if (alert.timestamp.getTime() < fiveMinutesAgo) {
                    alert.resolved = true;
                }
            }
            console.log('[Instagram Translation Monitor] Cleanup completed');
        }
        catch (error) {
            console.error('[Instagram Translation Monitor] Cleanup failed:', error);
        }
    }
    /**
     * Get current health status
     */
    async getCurrentHealth() {
        return this.performHealthCheck();
    }
    /**
     * Get metrics history
     */
    getMetricsHistory(timeRangeMs) {
        if (timeRangeMs) {
            return this.getRecentMetrics(timeRangeMs);
        }
        return [...this.metricsHistory];
    }
    /**
     * Get error summary
     */
    getErrorSummary(timeRangeMs) {
        return (0, instagram_translation_errors_1.getGlobalErrorSummary)(timeRangeMs);
    }
    /**
     * Resolve alert
     */
    resolveAlert(alertId) {
        const alert = this.alerts.get(alertId);
        if (alert) {
            alert.resolved = true;
            this.emit('alert-resolved', alert);
            return true;
        }
        return false;
    }
    /**
     * Get active alerts
     */
    getActiveAlerts() {
        return Array.from(this.alerts.values()).filter(alert => !alert.resolved);
    }
}
exports.InstagramTranslationQueueMonitor = InstagramTranslationQueueMonitor;
// Singleton monitor instance
let queueMonitor = null;
/**
 * Get singleton queue monitor instance
 */
function getQueueMonitor() {
    if (!queueMonitor) {
        queueMonitor = new InstagramTranslationQueueMonitor();
    }
    return queueMonitor;
}
/**
 * Start queue monitoring
 */
async function startQueueMonitoring() {
    const monitor = getQueueMonitor();
    await monitor.startMonitoring();
}
/**
 * Stop queue monitoring
 */
function stopQueueMonitoring() {
    if (queueMonitor) {
        queueMonitor.stopMonitoring();
    }
}
/**
 * Get queue health status
 */
async function getInstagramTranslationQueueHealth() {
    const monitor = getQueueMonitor();
    return monitor.getCurrentHealth();
}
