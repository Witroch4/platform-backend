"use strict";
/**
 * Metrics Manager Service
 *
 * Orchestrates all metrics-related services including collection, storage,
 * aggregation, and anomaly detection. Provides a unified interface for
 * metrics operations.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MetricsManagerService = void 0;
const events_1 = require("events");
const index_1 = require("./index");
const config_1 = require("../config");
const errors_1 = require("../errors");
class MetricsManagerService extends events_1.EventEmitter {
    prisma;
    redis;
    static instance = null;
    collector;
    storage;
    aggregator;
    anomalyDetector;
    config;
    isInitialized = false;
    constructor(prisma, redis) {
        super();
        this.prisma = prisma;
        this.redis = redis;
        const queueConfig = (0, config_1.getQueueManagementConfig)();
        this.config = {
            collectionEnabled: queueConfig.metrics.enabled,
            anomalyDetectionEnabled: queueConfig.features.machineLearning,
            realTimeUpdatesEnabled: true,
            exportEnabled: true
        };
        this.initializeServices();
    }
    /**
     * Get singleton instance
     */
    static getInstance(prisma, redis) {
        if (!MetricsManagerService.instance) {
            if (!prisma || !redis) {
                throw new errors_1.QueueManagementError('Prisma and Redis instances required for first initialization', 'INITIALIZATION_ERROR');
            }
            MetricsManagerService.instance = new MetricsManagerService(prisma, redis);
        }
        return MetricsManagerService.instance;
    }
    /**
     * Initialize the metrics system
     */
    async initialize() {
        if (this.isInitialized) {
            return;
        }
        try {
            // Start metrics collection if enabled
            if (this.config.collectionEnabled) {
                this.collector.startCollection();
            }
            // Setup event listeners
            this.setupEventListeners();
            this.isInitialized = true;
            this.emit('initialized');
        }
        catch (error) {
            throw new errors_1.QueueManagementError(`Failed to initialize metrics manager: ${error.message}`, 'INITIALIZATION_ERROR');
        }
    }
    /**
     * Register a queue for metrics collection
     */
    async registerQueue(queueName, queue) {
        try {
            this.collector.registerQueue(queueName, queue);
            this.emit('queue_registered', { queueName });
        }
        catch (error) {
            throw new errors_1.QueueManagementError(`Failed to register queue ${queueName}: ${error.message}`, 'QUEUE_REGISTRATION_ERROR');
        }
    }
    /**
     * Unregister a queue from metrics collection
     */
    async unregisterQueue(queueName) {
        try {
            this.collector.unregisterQueue(queueName);
            this.emit('queue_unregistered', { queueName });
        }
        catch (error) {
            throw new errors_1.QueueManagementError(`Failed to unregister queue ${queueName}: ${error.message}`, 'QUEUE_UNREGISTRATION_ERROR');
        }
    }
    /**
     * Get real-time metrics for dashboard
     */
    async getRealTimeMetrics() {
        try {
            return await this.collector.getRealTimeMetrics();
        }
        catch (error) {
            throw new errors_1.QueueManagementError(`Failed to get real-time metrics: ${error.message}`, 'REAL_TIME_METRICS_ERROR');
        }
    }
    /**
     * Get comprehensive dashboard metrics
     */
    async getDashboardMetrics() {
        try {
            const realTimeMetrics = await this.getRealTimeMetrics();
            const systemMetrics = await this.collector.collectSystemMetrics();
            // Calculate overview metrics
            const queueNames = Object.keys(realTimeMetrics.queues);
            let totalJobs = 0;
            let activeJobs = 0;
            let failedJobs = 0;
            let totalThroughput = 0;
            const queueMetrics = [];
            for (const queueName of queueNames) {
                const queueData = realTimeMetrics.queues[queueName];
                const queueHealth = await this.getQueueHealth(queueName);
                totalJobs += queueData.waiting + queueData.active + queueData.completed + queueData.failed;
                activeJobs += queueData.active;
                failedJobs += queueData.failed;
                totalThroughput += queueData.throughput;
                queueMetrics.push({
                    queueName,
                    status: queueHealth.status,
                    jobCount: queueData.waiting + queueData.active + queueData.completed + queueData.failed,
                    throughput: queueData.throughput,
                    errorRate: queueHealth.performance.errorRate,
                    avgProcessingTime: queueHealth.performance.avgProcessingTime
                });
            }
            // Get recent alerts
            const alerts = await this.getRecentAlerts(10);
            // Determine system health
            const systemHealth = this.calculateSystemHealth(queueMetrics, systemMetrics);
            return {
                overview: {
                    totalQueues: queueNames.length,
                    totalJobs,
                    activeJobs,
                    failedJobs,
                    throughput: totalThroughput,
                    avgProcessingTime: this.calculateAverageProcessingTime(queueMetrics),
                    systemHealth
                },
                queueMetrics,
                systemMetrics,
                alerts
            };
        }
        catch (error) {
            throw new errors_1.QueueManagementError(`Failed to get dashboard metrics: ${error.message}`, 'DASHBOARD_METRICS_ERROR');
        }
    }
    /**
     * Get aggregated metrics for a specific queue and time range
     */
    async getAggregatedMetrics(queueName, timeRange, granularity = '1h') {
        try {
            return await this.aggregator.getAggregatedData(queueName, timeRange, granularity);
        }
        catch (error) {
            throw new errors_1.QueueManagementError(`Failed to get aggregated metrics: ${error.message}`, 'AGGREGATED_METRICS_ERROR');
        }
    }
    /**
     * Get trend analysis for a specific metric
     */
    async getTrendAnalysis(queueName, metric, timeRange) {
        try {
            // Get historical metrics
            const metrics = await this.getHistoricalMetrics(queueName, metric, timeRange);
            // Analyze trends
            return await this.anomalyDetector.analyze(metrics);
        }
        catch (error) {
            throw new errors_1.QueueManagementError(`Failed to get trend analysis: ${error.message}`, 'TREND_ANALYSIS_ERROR');
        }
    }
    /**
     * Detect anomalies in recent metrics
     */
    async detectAnomalies(timeRange) {
        try {
            if (!this.config.anomalyDetectionEnabled) {
                return [];
            }
            // Get recent metrics if no time range specified
            const range = timeRange || {
                start: new Date(Date.now() - 60 * 60 * 1000), // Last hour
                end: new Date()
            };
            const metrics = await this.getAllMetricsInRange(range);
            return await this.anomalyDetector.detect(metrics);
        }
        catch (error) {
            throw new errors_1.QueueManagementError(`Failed to detect anomalies: ${error.message}`, 'ANOMALY_DETECTION_ERROR');
        }
    }
    /**
     * Create performance baseline for a queue metric
     */
    async createBaseline(queueName, metric, timeRange) {
        try {
            return await this.anomalyDetector.createBaseline(queueName, metric, timeRange);
        }
        catch (error) {
            throw new errors_1.QueueManagementError(`Failed to create baseline: ${error.message}`, 'BASELINE_CREATION_ERROR');
        }
    }
    /**
     * Export metrics data
     */
    async exportMetrics(format, filters) {
        try {
            if (!this.config.exportEnabled) {
                throw new errors_1.QueueManagementError('Metrics export is disabled', 'EXPORT_DISABLED');
            }
            return await this.collector.exportMetrics(format, filters);
        }
        catch (error) {
            throw new errors_1.QueueManagementError(`Failed to export metrics: ${error.message}`, 'EXPORT_ERROR');
        }
    }
    /**
     * Get storage statistics
     */
    async getStorageStats() {
        try {
            return await this.storage.getStorageStats();
        }
        catch (error) {
            throw new errors_1.QueueManagementError(`Failed to get storage stats: ${error.message}`, 'STORAGE_STATS_ERROR');
        }
    }
    /**
     * Cleanup old metrics data
     */
    async cleanupOldData() {
        try {
            const storageCleanup = await this.storage.cleanupOldData();
            const aggregationCleanup = await this.aggregator.cleanupOldAggregations();
            return {
                deletedRecords: storageCleanup.deletedRecords + aggregationCleanup.deletedRecords,
                freedSpace: storageCleanup.freedSpace
            };
        }
        catch (error) {
            throw new errors_1.QueueManagementError(`Failed to cleanup old data: ${error.message}`, 'CLEANUP_ERROR');
        }
    }
    /**
     * Optimize storage performance
     */
    async optimizeStorage() {
        try {
            await this.storage.optimizeIndexes();
            await this.aggregator.preAggregateData();
        }
        catch (error) {
            throw new errors_1.QueueManagementError(`Failed to optimize storage: ${error.message}`, 'OPTIMIZATION_ERROR');
        }
    }
    /**
     * Get health status of the metrics system
     */
    async getSystemHealth() {
        try {
            const components = {};
            // Check collector health
            components.collector = {
                status: this.collector.listenerCount('error') === 0 ? 'healthy' : 'warning'
            };
            // Check storage health
            const storageStats = await this.getStorageStats();
            components.storage = {
                status: storageStats.indexHealth > 0.8 ? 'healthy' : 'warning',
                message: `Index health: ${(storageStats.indexHealth * 100).toFixed(1)}%`
            };
            // Check Redis connectivity
            try {
                await this.redis.ping();
                components.cache = { status: 'healthy' };
            }
            catch (error) {
                components.cache = { status: 'critical', message: 'Redis connection failed' };
            }
            // Check database connectivity
            try {
                await this.prisma.$queryRaw `SELECT 1`;
                components.database = { status: 'healthy' };
            }
            catch (error) {
                components.database = { status: 'critical', message: 'Database connection failed' };
            }
            // Determine overall status
            const statuses = Object.values(components).map(c => c.status);
            let overallStatus = 'healthy';
            if (statuses.includes('critical')) {
                overallStatus = 'critical';
            }
            else if (statuses.includes('warning')) {
                overallStatus = 'warning';
            }
            return {
                status: overallStatus,
                components,
                lastUpdate: new Date()
            };
        }
        catch (error) {
            return {
                status: 'critical',
                components: {
                    system: { status: 'critical', message: error.message }
                },
                lastUpdate: new Date()
            };
        }
    }
    // Private helper methods
    initializeServices() {
        this.collector = index_1.MetricsCollectorService.getInstance(this.redis, this.prisma);
        this.storage = index_1.MetricsStorageService.getInstance(this.prisma, this.redis);
        this.aggregator = index_1.MetricsAggregatorService.getInstance(this.prisma, this.redis);
        this.anomalyDetector = index_1.AnomalyDetectorService.getInstance(this.prisma, this.redis);
    }
    setupEventListeners() {
        // Forward events from child services
        this.collector.on('metrics_collected', (data) => {
            this.emit('metrics_collected', data);
        });
        this.collector.on('collection_error', (error) => {
            this.emit('collection_error', error);
        });
        this.anomalyDetector.on('anomalies_detected', (anomalies) => {
            this.emit('anomalies_detected', anomalies);
        });
        this.aggregator.on('pre_aggregation_completed', (data) => {
            this.emit('pre_aggregation_completed', data);
        });
    }
    async getQueueHealth(queueName) {
        // Get queue health from collector
        return await this.collector.collectQueueMetrics(queueName);
    }
    async getRecentAlerts(limit) {
        // Get recent alerts from cache or database
        try {
            const cached = await this.redis.get('anomalies:latest');
            if (cached) {
                const anomalies = JSON.parse(cached);
                return anomalies.slice(0, limit).map(anomaly => ({
                    id: anomaly.id,
                    severity: anomaly.severity,
                    title: `${anomaly.metric} anomaly in ${anomaly.queueName}`,
                    queueName: anomaly.queueName,
                    createdAt: anomaly.timestamp
                }));
            }
        }
        catch (error) {
            console.error('Failed to get recent alerts:', error);
        }
        return [];
    }
    calculateSystemHealth(queueMetrics, systemMetrics) {
        // Calculate overall system health based on queue and system metrics
        const avgErrorRate = queueMetrics.reduce((sum, q) => sum + q.errorRate, 0) / queueMetrics.length;
        const avgProcessingTime = queueMetrics.reduce((sum, q) => sum + q.avgProcessingTime, 0) / queueMetrics.length;
        if (avgErrorRate > 0.15 || avgProcessingTime > 30000 || systemMetrics.system.cpuUsage > 0.9) {
            return 'critical';
        }
        if (avgErrorRate > 0.05 || avgProcessingTime > 10000 || systemMetrics.system.cpuUsage > 0.7) {
            return 'warning';
        }
        return 'healthy';
    }
    calculateAverageProcessingTime(queueMetrics) {
        if (queueMetrics.length === 0)
            return 0;
        return queueMetrics.reduce((sum, q) => sum + q.avgProcessingTime, 0) / queueMetrics.length;
    }
    async getHistoricalMetrics(queueName, metric, timeRange) {
        // Get historical metrics from storage
        const query = {
            queueNames: [queueName],
            metricNames: [metric],
            timeRange,
            limit: 1000
        };
        return await this.storage.query(query);
    }
    async getAllMetricsInRange(timeRange) {
        // Get all metrics in the specified time range
        const query = {
            timeRange,
            limit: 10000
        };
        return await this.storage.query(query);
    }
}
exports.MetricsManagerService = MetricsManagerService;
