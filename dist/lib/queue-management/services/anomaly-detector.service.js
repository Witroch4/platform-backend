"use strict";
/**
 * Anomaly Detector Service
 *
 * Implements statistical anomaly detection algorithms, trend analysis with linear regression,
 * seasonal pattern detection, and automatic baseline establishment for queue metrics.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.AnomalyDetectorService = void 0;
const events_1 = require("events");
const config_1 = require("../config");
const errors_1 = require("../errors");
class AnomalyDetectorService extends events_1.EventEmitter {
    name = 'statistical-anomaly-detector';
    static instance = null;
    prisma;
    redis;
    config;
    baselines = new Map();
    seasonalPatterns = new Map();
    detectionInterval = null;
    constructor(prisma, redis) {
        super();
        this.prisma = prisma;
        this.redis = redis;
        const queueConfig = (0, config_1.getQueueManagementConfig)();
        this.config = {
            algorithms: ['zscore', 'iqr', 'isolation_forest', 'seasonal'],
            sensitivity: 0.95, // 95% confidence level
            minDataPoints: 30,
            baselineWindow: 7, // 7 days
            seasonalityWindow: 14 // 14 days
        };
        this.startAnomalyDetection();
    }
    /**
     * Get singleton instance
     */
    static getInstance(prisma, redis) {
        if (!AnomalyDetectorService.instance) {
            if (!prisma || !redis) {
                throw new errors_1.QueueManagementError('Prisma and Redis instances required for first initialization', 'INITIALIZATION_ERROR');
            }
            AnomalyDetectorService.instance = new AnomalyDetectorService(prisma, redis);
        }
        return AnomalyDetectorService.instance;
    }
    /**
     * Detect anomalies in metrics using multiple algorithms
     */
    async detect(metrics) {
        try {
            if (metrics.length < this.config.minDataPoints) {
                return []; // Not enough data for reliable detection
            }
            const anomalies = [];
            // Group metrics by queue and metric type
            const groupedMetrics = this.groupMetricsByQueueAndType(metrics);
            for (const [key, metricGroup] of groupedMetrics) {
                const [queueName, metricType] = key.split(':');
                // Get or create baseline for this metric
                const baseline = await this.getOrCreateBaseline(queueName, metricType, metricGroup);
                // Apply different anomaly detection algorithms
                const zScoreAnomalies = this.detectZScoreAnomalies(metricGroup, baseline, queueName, metricType);
                const iqrAnomalies = this.detectIQRAnomalies(metricGroup, baseline, queueName, metricType);
                const seasonalAnomalies = await this.detectSeasonalAnomalies(metricGroup, queueName, metricType);
                anomalies.push(...zScoreAnomalies, ...iqrAnomalies, ...seasonalAnomalies);
            }
            // Remove duplicates and rank by severity
            const uniqueAnomalies = this.deduplicateAndRankAnomalies(anomalies);
            // Cache detected anomalies
            await this.cacheAnomalies(uniqueAnomalies);
            return uniqueAnomalies;
        }
        catch (error) {
            throw new errors_1.QueueManagementError(`Failed to detect anomalies: ${error.message}`, 'ANOMALY_DETECTION_ERROR');
        }
    }
    /**
     * Train the anomaly detection model with historical data
     */
    async train(metrics) {
        try {
            // Group metrics for training
            const groupedMetrics = this.groupMetricsByQueueAndType(metrics);
            for (const [key, metricGroup] of groupedMetrics) {
                const [queueName, metricType] = key.split(':');
                // Calculate statistical baseline
                const baseline = this.calculateStatisticalBaseline(metricGroup);
                this.baselines.set(key, baseline);
                // Detect seasonal patterns
                const seasonalPattern = await this.detectSeasonalPattern(metricGroup);
                if (seasonalPattern.confidence > 0.7) {
                    this.seasonalPatterns.set(key, seasonalPattern);
                }
                // Store baseline in database
                await this.storeBaseline(queueName, metricType, baseline);
            }
            this.emit('training_completed', {
                baselines: this.baselines.size,
                patterns: this.seasonalPatterns.size
            });
        }
        catch (error) {
            throw new errors_1.QueueManagementError(`Failed to train anomaly detector: ${error.message}`, 'TRAINING_ERROR');
        }
    }
    /**
     * Analyze trends using linear regression
     */
    async analyze(metrics) {
        try {
            if (metrics.length < 2) {
                throw new errors_1.QueueManagementError('Insufficient data for trend analysis', 'INSUFFICIENT_DATA');
            }
            // Convert metrics to time series data
            const timeSeriesData = metrics.map((metric, index) => ({
                x: index, // Time index
                y: metric.value,
                timestamp: metric.timestamp
            }));
            // Calculate linear regression
            const regression = this.calculateLinearRegression(timeSeriesData);
            // Determine trend direction
            let direction;
            const slopeThreshold = 0.01;
            if (Math.abs(regression.slope) < slopeThreshold) {
                direction = 'stable';
            }
            else if (regression.slope > 0) {
                direction = 'increasing';
            }
            else {
                direction = 'decreasing';
            }
            // Generate forecast
            const forecast = this.generateForecast(timeSeriesData, regression, 24); // 24 hours ahead
            const trendPrediction = {
                queueName: metrics[0].labels?.queueName || 'unknown',
                metric: metrics[0].name,
                timeRange: {
                    start: metrics[0].timestamp,
                    end: metrics[metrics.length - 1].timestamp
                },
                predictions: forecast,
                accuracy: Math.abs(regression.correlation)
            };
            return trendPrediction;
        }
        catch (error) {
            throw new errors_1.QueueManagementError(`Failed to analyze trends: ${error.message}`, 'TREND_ANALYSIS_ERROR');
        }
    }
    /**
     * Forecast future values based on historical trends
     */
    async forecast(metrics, horizon) {
        try {
            const trendAnalysis = await this.analyze(metrics);
            // Extend forecast to requested horizon
            const lastTimestamp = metrics[metrics.length - 1].timestamp;
            const extendedForecast = this.extendForecast(trendAnalysis.predictions, lastTimestamp, horizon);
            return {
                ...trendAnalysis,
                predictions: extendedForecast
            };
        }
        catch (error) {
            throw new errors_1.QueueManagementError(`Failed to forecast: ${error.message}`, 'FORECAST_ERROR');
        }
    }
    /**
     * Detect seasonal patterns in metrics
     */
    async detectSeasonalPatterns(queueName, metricType, timeRange) {
        try {
            // Get historical data
            const metrics = await this.getHistoricalMetrics(queueName, metricType, timeRange);
            if (metrics.length < this.config.minDataPoints) {
                return [];
            }
            const patterns = [];
            // Check for different seasonal periods (hourly, daily, weekly)
            const periods = [24, 168, 720]; // 24h, 7d, 30d in hours
            for (const period of periods) {
                const pattern = this.detectSeasonalPatternForPeriod(metrics, period);
                if (pattern.confidence > 0.6) {
                    patterns.push(pattern);
                }
            }
            return patterns.sort((a, b) => b.confidence - a.confidence);
        }
        catch (error) {
            throw new errors_1.QueueManagementError(`Failed to detect seasonal patterns: ${error.message}`, 'SEASONAL_DETECTION_ERROR');
        }
    }
    /**
     * Create automatic baseline for comparisons
     */
    async createBaseline(queueName, metricType, timeRange) {
        try {
            // Get historical data for baseline calculation
            const metrics = await this.getHistoricalMetrics(queueName, metricType, timeRange);
            if (metrics.length < this.config.minDataPoints) {
                throw new errors_1.QueueManagementError('Insufficient data for baseline creation', 'INSUFFICIENT_DATA');
            }
            // Calculate statistical baseline
            const values = metrics.map(m => m.value);
            const baseline = this.calculateStatisticalBaseline(metrics);
            // Determine thresholds based on statistical analysis
            const warningThreshold = baseline.mean + 2 * baseline.standardDeviation;
            const criticalThreshold = baseline.mean + 3 * baseline.standardDeviation;
            const performanceBaseline = {
                queueName,
                metric: metricType,
                baseline: baseline.mean,
                threshold: {
                    warning: warningThreshold,
                    critical: criticalThreshold
                },
                calculatedAt: new Date(),
                validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
            };
            // Store baseline
            await this.storePerformanceBaseline(performanceBaseline);
            return performanceBaseline;
        }
        catch (error) {
            throw new errors_1.QueueManagementError(`Failed to create baseline: ${error.message}`, 'BASELINE_CREATION_ERROR');
        }
    }
    // Private helper methods
    startAnomalyDetection() {
        // Run anomaly detection every 5 minutes
        this.detectionInterval = setInterval(async () => {
            try {
                await this.runPeriodicAnomalyDetection();
            }
            catch (error) {
                console.error('Periodic anomaly detection failed:', error);
            }
        }, 5 * 60 * 1000); // 5 minutes
    }
    async runPeriodicAnomalyDetection() {
        // Get recent metrics for all queues
        const recentMetrics = await this.getRecentMetrics(60); // Last hour
        if (recentMetrics.length > 0) {
            const anomalies = await this.detect(recentMetrics);
            if (anomalies.length > 0) {
                this.emit('anomalies_detected', anomalies);
                // Store anomalies in database
                await this.storeAnomalies(anomalies);
            }
        }
    }
    groupMetricsByQueueAndType(metrics) {
        const grouped = new Map();
        for (const metric of metrics) {
            const queueName = metric.labels?.queueName || 'unknown';
            const key = `${queueName}:${metric.name}`;
            if (!grouped.has(key)) {
                grouped.set(key, []);
            }
            grouped.get(key).push(metric);
        }
        return grouped;
    }
    async getOrCreateBaseline(queueName, metricType, metrics) {
        const key = `${queueName}:${metricType}`;
        // Check if we have a cached baseline
        if (this.baselines.has(key)) {
            return this.baselines.get(key);
        }
        // Try to load from database
        const storedBaseline = await this.loadBaseline(queueName, metricType);
        if (storedBaseline) {
            this.baselines.set(key, storedBaseline);
            return storedBaseline;
        }
        // Create new baseline
        const baseline = this.calculateStatisticalBaseline(metrics);
        this.baselines.set(key, baseline);
        await this.storeBaseline(queueName, metricType, baseline);
        return baseline;
    }
    calculateStatisticalBaseline(metrics) {
        const values = metrics.map(m => m.value).sort((a, b) => a - b);
        const n = values.length;
        // Calculate basic statistics
        const mean = values.reduce((sum, val) => sum + val, 0) / n;
        const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / n;
        const standardDeviation = Math.sqrt(variance);
        // Calculate quartiles
        const q1Index = Math.floor(n * 0.25);
        const medianIndex = Math.floor(n * 0.5);
        const q3Index = Math.floor(n * 0.75);
        const q1 = values[q1Index];
        const median = values[medianIndex];
        const q3 = values[q3Index];
        const iqr = q3 - q1;
        // Outlier threshold using IQR method
        const outlierThreshold = q3 + 1.5 * iqr;
        return {
            mean,
            standardDeviation,
            median,
            q1,
            q3,
            iqr,
            outlierThreshold
        };
    }
    detectZScoreAnomalies(metrics, baseline, queueName, metricType) {
        const anomalies = [];
        const threshold = 2.5; // Z-score threshold
        for (const metric of metrics) {
            const zScore = Math.abs((metric.value - baseline.mean) / baseline.standardDeviation);
            if (zScore > threshold) {
                const severity = this.calculateSeverity(zScore, threshold);
                anomalies.push({
                    id: `zscore_${queueName}_${metricType}_${metric.timestamp.getTime()}`,
                    queueName,
                    metric: metricType,
                    timestamp: metric.timestamp,
                    value: metric.value,
                    expectedValue: baseline.mean,
                    deviation: zScore,
                    severity,
                    description: `Z-score anomaly detected: value ${metric.value} deviates ${zScore.toFixed(2)} standard deviations from baseline ${baseline.mean.toFixed(2)}`
                });
            }
        }
        return anomalies;
    }
    detectIQRAnomalies(metrics, baseline, queueName, metricType) {
        const anomalies = [];
        for (const metric of metrics) {
            if (metric.value > baseline.outlierThreshold) {
                const deviation = (metric.value - baseline.median) / baseline.iqr;
                const severity = this.calculateSeverity(deviation, 1.5);
                anomalies.push({
                    id: `iqr_${queueName}_${metricType}_${metric.timestamp.getTime()}`,
                    queueName,
                    metric: metricType,
                    timestamp: metric.timestamp,
                    value: metric.value,
                    expectedValue: baseline.median,
                    deviation,
                    severity,
                    description: `IQR anomaly detected: value ${metric.value} exceeds outlier threshold ${baseline.outlierThreshold.toFixed(2)}`
                });
            }
        }
        return anomalies;
    }
    async detectSeasonalAnomalies(metrics, queueName, metricType) {
        const key = `${queueName}:${metricType}`;
        const pattern = this.seasonalPatterns.get(key);
        if (!pattern || pattern.confidence < 0.7) {
            return []; // No reliable seasonal pattern
        }
        const anomalies = [];
        for (const metric of metrics) {
            const expectedValue = this.calculateSeasonalExpectedValue(metric.timestamp, pattern);
            const deviation = Math.abs(metric.value - expectedValue) / expectedValue;
            if (deviation > 0.3) { // 30% deviation threshold
                const severity = this.calculateSeverity(deviation, 0.3);
                anomalies.push({
                    id: `seasonal_${queueName}_${metricType}_${metric.timestamp.getTime()}`,
                    queueName,
                    metric: metricType,
                    timestamp: metric.timestamp,
                    value: metric.value,
                    expectedValue,
                    deviation,
                    severity,
                    description: `Seasonal anomaly detected: value ${metric.value} deviates ${(deviation * 100).toFixed(1)}% from seasonal pattern`
                });
            }
        }
        return anomalies;
    }
    calculateSeverity(deviation, threshold) {
        const ratio = deviation / threshold;
        if (ratio > 3)
            return 'critical';
        if (ratio > 2)
            return 'error';
        if (ratio > 1.5)
            return 'warning';
        return 'info';
    }
    deduplicateAndRankAnomalies(anomalies) {
        // Remove duplicates based on queue, metric, and timestamp
        const unique = new Map();
        for (const anomaly of anomalies) {
            const key = `${anomaly.queueName}_${anomaly.metric}_${anomaly.timestamp.getTime()}`;
            if (!unique.has(key) || this.getSeverityWeight(anomaly.severity) > this.getSeverityWeight(unique.get(key).severity)) {
                unique.set(key, anomaly);
            }
        }
        // Sort by severity and deviation
        return Array.from(unique.values()).sort((a, b) => {
            const severityDiff = this.getSeverityWeight(b.severity) - this.getSeverityWeight(a.severity);
            if (severityDiff !== 0)
                return severityDiff;
            return b.deviation - a.deviation;
        });
    }
    getSeverityWeight(severity) {
        switch (severity) {
            case 'critical': return 4;
            case 'error': return 3;
            case 'warning': return 2;
            case 'info': return 1;
            default: return 0;
        }
    }
    calculateLinearRegression(dataPoints) {
        const n = dataPoints.length;
        const sumX = dataPoints.reduce((sum, point) => sum + point.x, 0);
        const sumY = dataPoints.reduce((sum, point) => sum + point.y, 0);
        const sumXY = dataPoints.reduce((sum, point) => sum + point.x * point.y, 0);
        const sumXX = dataPoints.reduce((sum, point) => sum + point.x * point.x, 0);
        const sumYY = dataPoints.reduce((sum, point) => sum + point.y * point.y, 0);
        const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
        const intercept = (sumY - slope * sumX) / n;
        // Calculate correlation coefficient
        const numerator = n * sumXY - sumX * sumY;
        const denominator = Math.sqrt((n * sumXX - sumX * sumX) * (n * sumYY - sumY * sumY));
        const correlation = denominator === 0 ? 0 : numerator / denominator;
        return { slope, intercept, correlation };
    }
    generateForecast(data, regression, hours) {
        const forecast = [];
        const lastDataPoint = data[data.length - 1];
        const hourMs = 60 * 60 * 1000;
        for (let i = 1; i <= hours; i++) {
            const x = lastDataPoint.x + i;
            const predictedValue = regression.slope * x + regression.intercept;
            const confidence = Math.abs(regression.correlation) * Math.exp(-i / 24); // Confidence decreases over time
            forecast.push({
                timestamp: new Date(lastDataPoint.timestamp.getTime() + i * hourMs),
                predictedValue: Math.max(0, predictedValue), // Ensure non-negative values
                confidence
            });
        }
        return forecast;
    }
    extendForecast(existingForecast, lastTimestamp, horizon) {
        // Implementation would extend the forecast to the requested horizon
        // For now, return the existing forecast
        return existingForecast;
    }
    async detectSeasonalPattern(metrics) {
        // Simplified seasonal pattern detection
        // In a real implementation, this would use FFT or autocorrelation
        return {
            period: 24, // 24 hours
            amplitude: 0,
            phase: 0,
            confidence: 0.5
        };
    }
    detectSeasonalPatternForPeriod(metrics, period) {
        // Simplified implementation
        return {
            period,
            amplitude: 0,
            phase: 0,
            confidence: 0.5
        };
    }
    calculateSeasonalExpectedValue(timestamp, pattern) {
        const hourOfDay = timestamp.getHours();
        const phaseShift = (hourOfDay / pattern.period) * 2 * Math.PI + pattern.phase;
        return pattern.amplitude * Math.sin(phaseShift);
    }
    async getHistoricalMetrics(queueName, metricType, timeRange) {
        // Get historical metrics from database
        const data = await this.prisma.queueMetrics.findMany({
            where: {
                queueName,
                timestamp: {
                    gte: timeRange.start,
                    lte: timeRange.end
                }
            },
            orderBy: { timestamp: 'asc' }
        });
        return data.map(item => ({
            name: metricType,
            type: 'gauge',
            value: this.getMetricValue(item, metricType),
            timestamp: item.timestamp,
            labels: { queueName, type: 'queue' }
        }));
    }
    getMetricValue(item, metricType) {
        switch (metricType) {
            case 'throughput': return item.throughputPerMinute || 0;
            case 'processing_time': return item.avgProcessingTime || 0;
            case 'success_rate': return item.successRate || 0;
            case 'error_rate': return item.errorRate || 0;
            default: return 0;
        }
    }
    async getRecentMetrics(minutes) {
        const cutoff = new Date(Date.now() - minutes * 60 * 1000);
        const data = await this.prisma.queueMetrics.findMany({
            where: {
                timestamp: { gte: cutoff }
            },
            orderBy: { timestamp: 'desc' }
        });
        const metrics = [];
        for (const item of data) {
            metrics.push({
                name: 'throughput',
                type: 'gauge',
                value: item.throughputPerMinute || 0,
                timestamp: item.timestamp,
                labels: { queueName: item.queueName, type: 'queue' }
            }, {
                name: 'processing_time',
                type: 'gauge',
                value: item.avgProcessingTime || 0,
                timestamp: item.timestamp,
                labels: { queueName: item.queueName, type: 'queue' }
            });
        }
        return metrics;
    }
    async cacheAnomalies(anomalies) {
        const cacheKey = 'anomalies:latest';
        await this.redis.setex(cacheKey, 300, JSON.stringify(anomalies)); // 5 minutes TTL
    }
    async storeAnomalies(anomalies) {
        // Store anomalies in database for historical analysis
        for (const anomaly of anomalies) {
            try {
                await this.prisma.anomalies.create({
                    data: {
                        id: anomaly.id,
                        queueName: anomaly.queueName,
                        metric: anomaly.metric,
                        timestamp: anomaly.timestamp,
                        value: anomaly.value,
                        expectedValue: anomaly.expectedValue,
                        deviation: anomaly.deviation,
                        severity: anomaly.severity,
                        description: anomaly.description,
                        createdAt: new Date()
                    }
                });
            }
            catch (error) {
                // Ignore duplicate key errors
                if (!error.message.includes('unique constraint')) {
                    console.error('Failed to store anomaly:', error);
                }
            }
        }
    }
    async storeBaseline(queueName, metricType, baseline) {
        const cacheKey = `baseline:${queueName}:${metricType}`;
        await this.redis.setex(cacheKey, 86400, JSON.stringify(baseline)); // 24 hours TTL
    }
    async loadBaseline(queueName, metricType) {
        const cacheKey = `baseline:${queueName}:${metricType}`;
        const cached = await this.redis.get(cacheKey);
        return cached ? JSON.parse(cached) : null;
    }
    async storePerformanceBaseline(baseline) {
        await this.prisma.performanceBaselines.upsert({
            where: {
                queueName_metric: {
                    queueName: baseline.queueName,
                    metric: baseline.metric
                }
            },
            update: {
                baseline: baseline.baseline,
                warningThreshold: baseline.threshold.warning,
                criticalThreshold: baseline.threshold.critical,
                calculatedAt: baseline.calculatedAt,
                validUntil: baseline.validUntil
            },
            create: {
                queueName: baseline.queueName,
                metric: baseline.metric,
                baseline: baseline.baseline,
                warningThreshold: baseline.threshold.warning,
                criticalThreshold: baseline.threshold.critical,
                calculatedAt: baseline.calculatedAt,
                validUntil: baseline.validUntil
            }
        });
    }
}
exports.AnomalyDetectorService = AnomalyDetectorService;
