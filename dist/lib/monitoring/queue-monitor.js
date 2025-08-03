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
exports.queueMonitor = exports.QueueMonitor = exports.QUEUE_ALERT_THRESHOLDS = void 0;
exports.registerQueueForMonitoring = registerQueueForMonitoring;
exports.getQueueHealth = getQueueHealth;
exports.getQueuePerformanceStats = getQueuePerformanceStats;
exports.getQueueDashboard = getQueueDashboard;
exports.initializeQueueMonitoring = initializeQueueMonitoring;
const bullmq_1 = require("bullmq");
const redis_1 = require("../redis");
const application_performance_monitor_1 = require("./application-performance-monitor");
// Alert thresholds for queue monitoring
exports.QUEUE_ALERT_THRESHOLDS = {
    MAX_WAITING_JOBS: 100,
    MAX_FAILED_JOBS: 50,
    MAX_PROCESSING_TIME: 30000, // 30 seconds
    MIN_SUCCESS_RATE: 95, // percentage
    MAX_ERROR_RATE: 5, // percentage
    MAX_QUEUE_DEPTH: 500,
};
class QueueMonitor {
    static instance;
    redis;
    monitoredQueues = new Map();
    queueEventsMap = new Map();
    metricsHistory = new Map();
    jobMetricsHistory = new Map();
    METRICS_HISTORY_SIZE = 1000;
    MONITORING_INTERVAL = 30000; // 30 seconds
    CLEANUP_INTERVAL = 300000; // 5 minutes
    constructor(redisConnection) {
        this.redis = redisConnection || redis_1.connection;
        this.startMonitoring();
    }
    static getInstance() {
        if (!this.instance) {
            this.instance = new QueueMonitor();
        }
        return this.instance;
    }
    // Register a queue for monitoring
    registerQueue(queue, queueName) {
        const name = queueName || queue.name;
        this.monitoredQueues.set(name, queue);
        // Create QueueEvents instance
        const events = new bullmq_1.QueueEvents(name, { connection: this.redis });
        this.queueEventsMap.set(name, events);
        // Initialize metrics history
        if (!this.metricsHistory.has(name)) {
            this.metricsHistory.set(name, []);
        }
        if (!this.jobMetricsHistory.has(name)) {
            this.jobMetricsHistory.set(name, []);
        }
        // Set up queue event listeners
        this.setupQueueEventListeners(queue, events, name);
        console.log(`[QueueMonitor] Registered queue for monitoring: ${name}`);
    }
    // Set up event listeners for a queue
    setupQueueEventListeners(queue, events, queueName) {
        // Job completed event
        events.on('completed', async ({ jobId }) => {
            const job = await queue.getJob(jobId);
            if (job) {
                this.recordJobCompletion(job, queueName, 'completed');
            }
        });
        // Job failed event
        events.on('failed', async ({ jobId, failedReason }) => {
            const job = await queue.getJob(jobId);
            const error = new Error(failedReason);
            if (job) {
                this.recordJobCompletion(job, queueName, 'failed', error);
            }
        });
        // Job active event
        events.on('active', async ({ jobId }) => {
            const job = await queue.getJob(jobId);
            if (job) {
                this.recordJobStart(job, queueName);
            }
        });
        // Job waiting event
        events.on('waiting', async ({ jobId }) => {
            const job = await queue.getJob(jobId);
            if (job) {
                this.recordJobWaiting(job, queueName);
            }
        });
        // Job stalled event
        events.on('stalled', async ({ jobId }) => {
            const job = await queue.getJob(jobId);
            console.warn(`[QueueMonitor] Job stalled in queue ${queueName}:`, {
                jobId: job?.id || jobId,
                jobName: job?.name,
                attempts: job?.attemptsMade,
            });
            application_performance_monitor_1.apm.triggerAlert({
                level: 'warning',
                component: 'queue',
                message: `Job stalled in queue ${queueName}: ${job?.name ?? jobId}`,
                metrics: { jobId: jobId, jobName: job?.name, queueName },
            });
        });
        // Queue error event
        events.on('error', (error) => {
            console.error(`[QueueMonitor] Queue error in ${queueName}:`, error);
            application_performance_monitor_1.apm.triggerAlert({
                level: 'error',
                component: 'queue',
                message: `Queue error in ${queueName}: ${error.message}`,
                metrics: { queueName, error: error.message },
            });
        });
    }
    // Record job completion
    recordJobCompletion(job, queueName, status, error) {
        const now = new Date();
        const processingTime = job.finishedOn && job.processedOn
            ? job.finishedOn - job.processedOn
            : undefined;
        const waitTime = job.processedOn && job.timestamp
            ? job.processedOn - job.timestamp
            : undefined;
        const jobMetrics = {
            jobId: job.id || 'unknown',
            jobName: job.name || 'unknown',
            queueName,
            status,
            createdAt: new Date(job.timestamp || Date.now()),
            processedAt: job.processedOn ? new Date(job.processedOn) : undefined,
            finishedAt: job.finishedOn ? new Date(job.finishedOn) : now,
            processingTime,
            waitTime,
            attempts: job.attemptsMade || 0,
            maxAttempts: job.opts?.attempts || 1,
            error: error?.message,
            correlationId: this.extractCorrelationId(job),
        };
        // Store job metrics
        const jobHistory = this.jobMetricsHistory.get(queueName) || [];
        jobHistory.push(jobMetrics);
        // Keep history size manageable
        if (jobHistory.length > this.METRICS_HISTORY_SIZE) {
            jobHistory.shift();
        }
        this.jobMetricsHistory.set(queueName, jobHistory);
        // Record metrics in APM
        if (processingTime !== undefined) {
            application_performance_monitor_1.apm.recordWorkerMetrics({
                jobId: jobMetrics.jobId,
                jobType: jobMetrics.jobName,
                processingTime,
                queueWaitTime: waitTime || 0,
                success: status === 'completed',
                error: error?.message,
                timestamp: now,
                correlationId: jobMetrics.correlationId || 'unknown',
                retryCount: jobMetrics.attempts,
            });
        }
        // Check for performance alerts
        this.checkJobPerformanceAlerts(jobMetrics);
        console.log(`[QueueMonitor] Job ${status} in queue ${queueName}:`, {
            jobId: jobMetrics.jobId,
            jobName: jobMetrics.jobName,
            processingTime,
            waitTime,
            attempts: jobMetrics.attempts,
        });
    }
    // Record job start
    recordJobStart(job, queueName) {
        const waitTime = job.processedOn && job.timestamp
            ? job.processedOn - job.timestamp
            : undefined;
        console.log(`[QueueMonitor] Job started in queue ${queueName}:`, {
            jobId: job.id,
            jobName: job.name,
            waitTime,
        });
    }
    // Record job waiting
    recordJobWaiting(job, queueName) {
        console.log(`[QueueMonitor] Job waiting in queue ${queueName}:`, {
            jobId: job.id,
            jobName: job.name,
            timestamp: new Date(job.timestamp || Date.now()),
        });
    }
    // Extract correlation ID from job data
    extractCorrelationId(job) {
        try {
            const data = job.data;
            if (data && typeof data === 'object') {
                // Try different possible paths for correlation ID
                return data.correlationId ||
                    data.data?.correlationId ||
                    data.payload?.correlationId ||
                    undefined;
            }
        }
        catch (error) {
            // Ignore extraction errors
        }
        return undefined;
    }
    // Check for job performance alerts
    checkJobPerformanceAlerts(jobMetrics) {
        // Alert on long processing time
        if (jobMetrics.processingTime && jobMetrics.processingTime > exports.QUEUE_ALERT_THRESHOLDS.MAX_PROCESSING_TIME) {
            application_performance_monitor_1.apm.triggerAlert({
                level: 'warning',
                component: 'queue',
                message: `Long job processing time in queue ${jobMetrics.queueName}: ${jobMetrics.processingTime}ms`,
                metrics: {
                    jobId: jobMetrics.jobId,
                    jobName: jobMetrics.jobName,
                    queueName: jobMetrics.queueName,
                    processingTime: jobMetrics.processingTime,
                },
            });
        }
        // Alert on job failure
        if (jobMetrics.status === 'failed') {
            const alertLevel = jobMetrics.attempts >= jobMetrics.maxAttempts ? 'error' : 'warning';
            application_performance_monitor_1.apm.triggerAlert({
                level: alertLevel,
                component: 'queue',
                message: `Job failed in queue ${jobMetrics.queueName}: ${jobMetrics.error}`,
                metrics: {
                    jobId: jobMetrics.jobId,
                    jobName: jobMetrics.jobName,
                    queueName: jobMetrics.queueName,
                    error: jobMetrics.error,
                    attempts: jobMetrics.attempts,
                    maxAttempts: jobMetrics.maxAttempts,
                },
            });
        }
        // Alert on high retry count
        if (jobMetrics.attempts > 2) {
            application_performance_monitor_1.apm.triggerAlert({
                level: 'warning',
                component: 'queue',
                message: `Job with high retry count in queue ${jobMetrics.queueName}`,
                metrics: {
                    jobId: jobMetrics.jobId,
                    jobName: jobMetrics.jobName,
                    queueName: jobMetrics.queueName,
                    attempts: jobMetrics.attempts,
                    maxAttempts: jobMetrics.maxAttempts,
                },
            });
        }
    }
    // Start monitoring
    startMonitoring() {
        // Collect queue health metrics periodically
        setInterval(() => {
            this.collectQueueHealthMetrics().catch(error => {
                console.error('[QueueMonitor] Error collecting queue health metrics:', error);
            });
        }, this.MONITORING_INTERVAL);
        // Cleanup old metrics periodically
        setInterval(() => {
            this.cleanupOldMetrics();
        }, this.CLEANUP_INTERVAL);
        console.log('[QueueMonitor] Queue monitoring started');
    }
    // Collect health metrics for all monitored queues
    async collectQueueHealthMetrics() {
        const timestamp = new Date();
        for (const [queueName, queue] of this.monitoredQueues.entries()) {
            try {
                const [waiting, active, completed, failed, delayed] = await Promise.all([
                    queue.getWaiting(),
                    queue.getActive(),
                    queue.getCompleted(),
                    queue.getFailed(),
                    queue.getDelayed(),
                ]);
                const metrics = {
                    queueName,
                    waiting: waiting.length,
                    active: active.length,
                    completed: completed.length,
                    failed: failed.length,
                    delayed: delayed.length,
                    paused: await queue.isPaused(),
                    timestamp,
                };
                // Store metrics
                const history = this.metricsHistory.get(queueName) || [];
                history.push(metrics);
                if (history.length > this.METRICS_HISTORY_SIZE) {
                    history.shift();
                }
                this.metricsHistory.set(queueName, history);
                // Check for alerts
                this.checkQueueHealthAlerts(metrics);
                console.log(`[QueueMonitor] Health metrics collected for queue ${queueName}:`, {
                    waiting: metrics.waiting,
                    active: metrics.active,
                    failed: metrics.failed,
                    paused: metrics.paused,
                });
            }
            catch (error) {
                console.error(`[QueueMonitor] Error collecting metrics for queue ${queueName}:`, error);
            }
        }
    }
    // Check for queue health alerts
    checkQueueHealthAlerts(metrics) {
        // Alert on too many waiting jobs
        if (metrics.waiting > exports.QUEUE_ALERT_THRESHOLDS.MAX_WAITING_JOBS) {
            application_performance_monitor_1.apm.triggerAlert({
                level: 'warning',
                component: 'queue',
                message: `High number of waiting jobs in queue ${metrics.queueName}: ${metrics.waiting}`,
                metrics: { queueName: metrics.queueName, waitingJobs: metrics.waiting },
            });
        }
        // Alert on too many failed jobs
        if (metrics.failed > exports.QUEUE_ALERT_THRESHOLDS.MAX_FAILED_JOBS) {
            application_performance_monitor_1.apm.triggerAlert({
                level: 'error',
                component: 'queue',
                message: `High number of failed jobs in queue ${metrics.queueName}: ${metrics.failed}`,
                metrics: { queueName: metrics.queueName, failedJobs: metrics.failed },
            });
        }
        // Alert on queue depth
        const totalJobs = metrics.waiting + metrics.active + metrics.delayed;
        if (totalJobs > exports.QUEUE_ALERT_THRESHOLDS.MAX_QUEUE_DEPTH) {
            application_performance_monitor_1.apm.triggerAlert({
                level: 'warning',
                component: 'queue',
                message: `High queue depth in ${metrics.queueName}: ${totalJobs} jobs`,
                metrics: { queueName: metrics.queueName, totalJobs },
            });
        }
        // Alert if queue is paused unexpectedly
        if (metrics.paused) {
            application_performance_monitor_1.apm.triggerAlert({
                level: 'warning',
                component: 'queue',
                message: `Queue ${metrics.queueName} is paused`,
                metrics: { queueName: metrics.queueName, paused: true },
            });
        }
    }
    // Get queue health metrics
    getQueueHealth(queueName) {
        const history = this.metricsHistory.get(queueName);
        return history && history.length > 0 ? history[history.length - 1] : null;
    }
    // Get all queue health metrics
    getAllQueueHealth() {
        const result = new Map();
        for (const [queueName, history] of this.metricsHistory.entries()) {
            if (history.length > 0) {
                result.set(queueName, history[history.length - 1]);
            }
        }
        return result;
    }
    // Get queue performance statistics
    getQueuePerformanceStats(queueName, timeWindowMinutes = 60) {
        const jobHistory = this.jobMetricsHistory.get(queueName);
        if (!jobHistory || jobHistory.length === 0) {
            return null;
        }
        const now = Date.now();
        const timeWindow = timeWindowMinutes * 60 * 1000;
        const recentJobs = jobHistory.filter(job => now - job.createdAt.getTime() <= timeWindow);
        if (recentJobs.length === 0) {
            return null;
        }
        // Calculate throughput
        const completedJobs = recentJobs.filter(job => job.status === 'completed' || job.status === 'failed');
        const jobsPerMinute = (completedJobs.length / timeWindowMinutes);
        const jobsPerHour = jobsPerMinute * 60;
        // Calculate average processing time
        const jobsWithProcessingTime = recentJobs.filter(job => job.processingTime !== undefined);
        const averageProcessingTime = jobsWithProcessingTime.length > 0
            ? jobsWithProcessingTime.reduce((sum, job) => sum + (job.processingTime || 0), 0) / jobsWithProcessingTime.length
            : 0;
        // Calculate average wait time
        const jobsWithWaitTime = recentJobs.filter(job => job.waitTime !== undefined);
        const averageWaitTime = jobsWithWaitTime.length > 0
            ? jobsWithWaitTime.reduce((sum, job) => sum + (job.waitTime || 0), 0) / jobsWithWaitTime.length
            : 0;
        // Calculate success and error rates
        const successfulJobs = recentJobs.filter(job => job.status === 'completed').length;
        const failedJobs = recentJobs.filter(job => job.status === 'failed').length;
        const totalProcessedJobs = successfulJobs + failedJobs;
        const successRate = totalProcessedJobs > 0 ? (successfulJobs / totalProcessedJobs) * 100 : 0;
        const errorRate = totalProcessedJobs > 0 ? (failedJobs / totalProcessedJobs) * 100 : 0;
        // Calculate retry rate
        const jobsWithRetries = recentJobs.filter(job => job.attempts > 1).length;
        const retryRate = recentJobs.length > 0 ? (jobsWithRetries / recentJobs.length) * 100 : 0;
        return {
            queueName,
            throughput: {
                jobsPerMinute: Math.round(jobsPerMinute * 100) / 100,
                jobsPerHour: Math.round(jobsPerHour * 100) / 100,
            },
            averageProcessingTime: Math.round(averageProcessingTime * 100) / 100,
            averageWaitTime: Math.round(averageWaitTime * 100) / 100,
            successRate: Math.round(successRate * 100) / 100,
            errorRate: Math.round(errorRate * 100) / 100,
            retryRate: Math.round(retryRate * 100) / 100,
            timestamp: new Date(),
        };
    }
    // Get job metrics for a specific queue
    getJobMetrics(queueName, limit = 100) {
        const history = this.jobMetricsHistory.get(queueName) || [];
        return history.slice(-limit);
    }
    // Get failed jobs for analysis
    getFailedJobs(queueName, limit = 50) {
        const history = this.jobMetricsHistory.get(queueName) || [];
        return history
            .filter(job => job.status === 'failed')
            .slice(-limit);
    }
    // Get slow jobs for analysis
    getSlowJobs(queueName, thresholdMs = 10000, limit = 50) {
        const history = this.jobMetricsHistory.get(queueName) || [];
        return history
            .filter(job => job.processingTime && job.processingTime > thresholdMs)
            .sort((a, b) => (b.processingTime || 0) - (a.processingTime || 0))
            .slice(0, limit);
    }
    // Cleanup old metrics
    cleanupOldMetrics() {
        const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
        // Cleanup queue health metrics
        for (const [queueName, history] of this.metricsHistory.entries()) {
            const filteredHistory = history.filter(metrics => metrics.timestamp.getTime() > oneDayAgo);
            this.metricsHistory.set(queueName, filteredHistory);
        }
        // Cleanup job metrics
        for (const [queueName, history] of this.jobMetricsHistory.entries()) {
            const filteredHistory = history.filter(job => job.createdAt.getTime() > oneDayAgo);
            this.jobMetricsHistory.set(queueName, filteredHistory);
        }
        console.log('[QueueMonitor] Old metrics cleaned up');
    }
    // Get comprehensive queue dashboard data
    getQueueDashboard() {
        const allHealth = this.getAllQueueHealth();
        const queues = [];
        let totalJobs = 0;
        let activeJobs = 0;
        let failedJobs = 0;
        for (const [queueName, health] of allHealth.entries()) {
            const performance = this.getQueuePerformanceStats(queueName);
            queues.push({
                name: queueName,
                health,
                performance,
            });
            totalJobs += health.waiting + health.active + health.completed + health.failed + health.delayed;
            activeJobs += health.active;
            failedJobs += health.failed;
        }
        return {
            overview: {
                totalQueues: allHealth.size,
                totalJobs,
                activeJobs,
                failedJobs,
            },
            queues,
        };
    }
    // Pause a queue
    async pauseQueue(queueName) {
        const queue = this.monitoredQueues.get(queueName);
        if (!queue) {
            console.error(`[QueueMonitor] Queue not found: ${queueName}`);
            return false;
        }
        try {
            await queue.pause();
            console.log(`[QueueMonitor] Queue paused: ${queueName}`);
            application_performance_monitor_1.apm.triggerAlert({
                level: 'info',
                component: 'queue',
                message: `Queue manually paused: ${queueName}`,
                metrics: { queueName, action: 'pause' },
            });
            return true;
        }
        catch (error) {
            console.error(`[QueueMonitor] Error pausing queue ${queueName}:`, error);
            return false;
        }
    }
    // Resume a queue
    async resumeQueue(queueName) {
        const queue = this.monitoredQueues.get(queueName);
        if (!queue) {
            console.error(`[QueueMonitor] Queue not found: ${queueName}`);
            return false;
        }
        try {
            await queue.resume();
            console.log(`[QueueMonitor] Queue resumed: ${queueName}`);
            application_performance_monitor_1.apm.triggerAlert({
                level: 'info',
                component: 'queue',
                message: `Queue manually resumed: ${queueName}`,
                metrics: { queueName, action: 'resume' },
            });
            return true;
        }
        catch (error) {
            console.error(`[QueueMonitor] Error resuming queue ${queueName}:`, error);
            return false;
        }
    }
    // Clean failed jobs from a queue
    async cleanFailedJobs(queueName) {
        const queue = this.monitoredQueues.get(queueName);
        if (!queue) {
            console.error(`[QueueMonitor] Queue not found: ${queueName}`);
            return 0;
        }
        try {
            const cleaned = await queue.clean(0, 0, 'failed');
            console.log(`[QueueMonitor] Cleaned ${cleaned.length} failed jobs from queue: ${queueName}`);
            application_performance_monitor_1.apm.triggerAlert({
                level: 'info',
                component: 'queue',
                message: `Cleaned ${cleaned.length} failed jobs from queue: ${queueName}`,
                metrics: { queueName, cleanedJobs: cleaned.length },
            });
            return cleaned.length;
        }
        catch (error) {
            console.error(`[QueueMonitor] Error cleaning failed jobs from queue ${queueName}:`, error);
            return 0;
        }
    }
    // Graceful shutdown
    async shutdown() {
        try {
            console.log('[QueueMonitor] Shutting down queue monitor...');
            // Remove event listeners
            for (const [queueName, queue] of this.monitoredQueues.entries()) {
                queue.removeAllListeners();
            }
            // Close QueueEvents
            for (const events of this.queueEventsMap.values()) {
                await events.close();
            }
            this.queueEventsMap.clear();
            // Clear monitoring data
            this.monitoredQueues.clear();
            this.metricsHistory.clear();
            this.jobMetricsHistory.clear();
            console.log('[QueueMonitor] Queue monitor shutdown completed');
        }
        catch (error) {
            console.error('[QueueMonitor] Error during shutdown:', error);
        }
    }
}
exports.QueueMonitor = QueueMonitor;
// Global queue monitor instance
exports.queueMonitor = QueueMonitor.getInstance();
// Utility functions
function registerQueueForMonitoring(queue, queueName) {
    exports.queueMonitor.registerQueue(queue, queueName);
}
function getQueueHealth(queueName) {
    return exports.queueMonitor.getQueueHealth(queueName);
}
function getQueuePerformanceStats(queueName, timeWindowMinutes) {
    return exports.queueMonitor.getQueuePerformanceStats(queueName, timeWindowMinutes);
}
function getQueueDashboard() {
    return exports.queueMonitor.getQueueDashboard();
}
// Initialize queue monitoring for existing queues
async function initializeQueueMonitoring() {
    try {
        // Import and register existing queues
        const { respostaRapidaQueue } = await Promise.resolve().then(() => __importStar(require('../queue/resposta-rapida.queue')));
        const { persistenciaCredenciaisQueue } = await Promise.resolve().then(() => __importStar(require('../queue/persistencia-credenciais.queue')));
        registerQueueForMonitoring(respostaRapidaQueue, 'resposta-rapida');
        registerQueueForMonitoring(persistenciaCredenciaisQueue, 'persistencia-credenciais');
        console.log('[QueueMonitor] Queue monitoring initialized for existing queues');
    }
    catch (error) {
        console.error('[QueueMonitor] Error initializing queue monitoring:', error);
    }
}
