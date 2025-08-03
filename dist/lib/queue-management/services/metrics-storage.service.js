"use strict";
/**
 * Metrics Storage Service
 *
 * Handles efficient storage, partitioning, and cleanup of metrics data
 * with optimized database operations and automatic data lifecycle management.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MetricsStorageService = void 0;
const config_1 = require("../config");
const errors_1 = require("../errors");
class MetricsStorageService {
    static instance = null;
    prisma;
    redis;
    config;
    partitions = new Map();
    cleanupInterval = null;
    constructor(prisma, redis) {
        this.prisma = prisma;
        this.redis = redis;
        const queueConfig = (0, config_1.getQueueManagementConfig)();
        this.config = {
            batchSize: queueConfig.metrics.batchSize,
            retentionDays: queueConfig.metrics.retentionDays,
            partitioningEnabled: true,
            compressionEnabled: true,
            indexOptimization: true
        };
        this.initializePartitioning();
        this.startCleanupScheduler();
    }
    /**
     * Get singleton instance
     */
    static getInstance(prisma, redis) {
        if (!MetricsStorageService.instance) {
            if (!prisma || !redis) {
                throw new errors_1.QueueManagementError('Prisma and Redis instances required for first initialization', 'INITIALIZATION_ERROR');
            }
            MetricsStorageService.instance = new MetricsStorageService(prisma, redis);
        }
        return MetricsStorageService.instance;
    }
    /**
     * Store metrics in batches with optimized insertion
     */
    async store(metrics) {
        if (metrics.length === 0)
            return;
        try {
            // Group metrics by type for optimized storage
            const queueMetrics = metrics.filter(m => m.labels?.type === 'queue');
            const jobMetrics = metrics.filter(m => m.labels?.type === 'job');
            const systemMetrics = metrics.filter(m => m.labels?.type === 'system');
            // Store in parallel for better performance
            await Promise.all([
                this.storeQueueMetrics(queueMetrics),
                this.storeJobMetrics(jobMetrics),
                this.storeSystemMetrics(systemMetrics)
            ]);
            // Update storage statistics
            await this.updateStorageStats(metrics.length);
        }
        catch (error) {
            throw new errors_1.QueueManagementError(`Failed to store metrics: ${error.message}`, 'STORAGE_ERROR');
        }
    }
    /**
     * Query metrics with optimized database queries
     */
    async query(query) {
        try {
            const { metricNames, queueNames, timeRange, labels, limit = 1000 } = query;
            // Determine which partitions to query
            const partitionsToQuery = this.getPartitionsForTimeRange(timeRange);
            // Build optimized query conditions
            const whereConditions = {
                timestamp: {
                    gte: timeRange.start,
                    lte: timeRange.end
                }
            };
            if (queueNames && queueNames.length > 0) {
                whereConditions.queueName = { in: queueNames };
            }
            // Query queue metrics
            const queueMetricsData = await this.prisma.queueMetrics.findMany({
                where: whereConditions,
                orderBy: { timestamp: 'desc' },
                take: limit
            });
            // Convert to Metric format
            const metrics = [];
            for (const data of queueMetricsData) {
                metrics.push(...this.convertQueueMetricsToMetricFormat(data));
            }
            return metrics;
        }
        catch (error) {
            throw new errors_1.QueueManagementError(`Failed to query metrics: ${error.message}`, 'QUERY_ERROR');
        }
    }
    /**
     * Aggregate metrics with pre-computed aggregations when possible
     */
    async aggregate(query) {
        try {
            const { queueNames, timeRange, granularity, aggregationFunction } = query;
            // Check if we have pre-aggregated data
            const preAggregated = await this.getPreAggregatedData(query);
            if (preAggregated) {
                return preAggregated;
            }
            // Perform real-time aggregation
            return await this.performRealTimeAggregation(query);
        }
        catch (error) {
            throw new errors_1.QueueManagementError(`Failed to aggregate metrics: ${error.message}`, 'AGGREGATION_ERROR');
        }
    }
    /**
     * Create database partitions for time-based data with automatic management
     */
    async createPartition(tableName, startDate, endDate) {
        try {
            const partitionName = `${tableName}_${this.formatDateForPartition(startDate)}`;
            // Check if partition already exists
            const existingPartition = await this.prisma.$queryRaw `
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_name = ${partitionName}
        ) as exists
      `;
            if (existingPartition[0]?.exists) {
                console.log(`Partition ${partitionName} already exists`);
                return;
            }
            // Create partition table with proper constraints
            await this.prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS ${partitionName} 
        PARTITION OF ${tableName}
        FOR VALUES FROM ('${startDate.toISOString()}') TO ('${endDate.toISOString()}')
      `);
            // Create optimized indexes for the partition
            await this.createPartitionIndexes(partitionName);
            // Enable compression for older partitions (PostgreSQL specific)
            if (this.config.compressionEnabled && this.isOldPartition(startDate)) {
                await this.enablePartitionCompression(partitionName);
            }
            // Update partition registry
            const partitions = this.partitions.get(tableName) || [];
            partitions.push({
                tableName: partitionName,
                startDate,
                endDate,
                isActive: endDate > new Date()
            });
            this.partitions.set(tableName, partitions);
            console.log(`Created partition ${partitionName} for period ${startDate.toISOString()} to ${endDate.toISOString()}`);
        }
        catch (error) {
            throw new errors_1.QueueManagementError(`Failed to create partition: ${error.message}`, 'PARTITION_ERROR');
        }
    }
    /**
     * Enable compression for old partition data
     */
    async enablePartitionCompression(partitionName) {
        try {
            // Enable row-level compression (PostgreSQL specific)
            await this.prisma.$executeRawUnsafe(`
        ALTER TABLE ${partitionName} SET (toast_tuple_target = 128)
      `);
            // Vacuum and analyze the partition
            await this.prisma.$executeRawUnsafe(`VACUUM ANALYZE ${partitionName}`);
            console.log(`Enabled compression for partition ${partitionName}`);
        }
        catch (error) {
            console.error(`Failed to enable compression for ${partitionName}:`, error);
        }
    }
    /**
     * Check if partition is old enough for compression
     */
    isOldPartition(startDate) {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        return startDate < thirtyDaysAgo;
    }
    /**
     * Automatic partition management - creates future partitions
     */
    async managePartitions() {
        try {
            const now = new Date();
            const tables = ['queue_metrics', 'job_metrics'];
            for (const tableName of tables) {
                // Create partitions for next 3 months
                for (let i = 0; i < 3; i++) {
                    const startDate = new Date(now.getFullYear(), now.getMonth() + i, 1);
                    const endDate = new Date(now.getFullYear(), now.getMonth() + i + 1, 1);
                    await this.createPartition(tableName, startDate, endDate);
                }
            }
            // Clean up old partitions beyond retention period
            await this.cleanupOldPartitions();
        }
        catch (error) {
            console.error('Failed to manage partitions:', error);
        }
    }
    /**
     * Clean up old partitions beyond retention period
     */
    async cleanupOldPartitions() {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - this.config.retentionDays);
        for (const [tableName, partitions] of this.partitions) {
            const oldPartitions = partitions.filter(p => p.endDate < cutoffDate);
            for (const partition of oldPartitions) {
                try {
                    await this.prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS ${partition.tableName}`);
                    console.log(`Dropped old partition ${partition.tableName}`);
                    // Remove from registry
                    const updatedPartitions = partitions.filter(p => p.tableName !== partition.tableName);
                    this.partitions.set(tableName, updatedPartitions);
                }
                catch (error) {
                    console.error(`Failed to drop partition ${partition.tableName}:`, error);
                }
            }
        }
    }
    /**
     * Clean up old data based on retention policy (90 days default)
     */
    async cleanupOldData() {
        try {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - this.config.retentionDays);
            console.log(`Starting cleanup of data older than ${cutoffDate.toISOString()}`);
            let totalDeleted = 0;
            let totalFreedSpace = 0;
            // Clean up queue metrics (only if not using partitioning)
            if (!this.config.partitioningEnabled) {
                const queueMetricsDeleted = await this.prisma.queueMetrics.deleteMany({
                    where: {
                        timestamp: { lt: cutoffDate }
                    }
                });
                totalDeleted += queueMetricsDeleted.count;
                console.log(`Deleted ${queueMetricsDeleted.count} old queue metrics records`);
                // Clean up job metrics
                const jobMetricsDeleted = await this.prisma.jobMetrics.deleteMany({
                    where: {
                        createdAt: { lt: cutoffDate }
                    }
                });
                totalDeleted += jobMetricsDeleted.count;
                console.log(`Deleted ${jobMetricsDeleted.count} old job metrics records`);
            }
            // Drop old partitions (more efficient for partitioned tables)
            if (this.config.partitioningEnabled) {
                const droppedPartitions = await this.dropOldPartitions(cutoffDate);
                totalFreedSpace += droppedPartitions.freedSpace;
                console.log(`Dropped old partitions, freed ${droppedPartitions.freedSpace} bytes`);
            }
            // Clean up old aggregated data from cache
            await this.cleanupOldCacheData(cutoffDate);
            // Update cleanup statistics
            await this.updateCleanupStats(totalDeleted, totalFreedSpace);
            console.log(`Cleanup completed: ${totalDeleted} records deleted, ${totalFreedSpace} bytes freed`);
            return {
                deletedRecords: totalDeleted,
                freedSpace: totalFreedSpace
            };
        }
        catch (error) {
            throw new errors_1.QueueManagementError(`Failed to cleanup old data: ${error.message}`, 'CLEANUP_ERROR');
        }
    }
    /**
     * Clean up old cached data
     */
    async cleanupOldCacheData(cutoffDate) {
        try {
            const cutoffTimestamp = cutoffDate.getTime();
            // Clean up old metrics cache entries
            const patterns = [
                'metrics:*',
                'queue:metrics:*',
                'pre_agg:*'
            ];
            for (const pattern of patterns) {
                const keys = await this.redis.keys(pattern);
                for (const key of keys) {
                    // Extract timestamp from key if possible
                    const timestampMatch = key.match(/:(\d{13})/);
                    if (timestampMatch) {
                        const keyTimestamp = parseInt(timestampMatch[1]);
                        if (keyTimestamp < cutoffTimestamp) {
                            await this.redis.del(key);
                        }
                    }
                }
            }
            console.log('Cleaned up old cache data');
        }
        catch (error) {
            console.error('Failed to cleanup old cache data:', error);
        }
    }
    /**
     * Optimize database indexes for better query performance
     */
    async optimizeIndexes() {
        try {
            // Analyze table statistics
            await this.prisma.$executeRaw `ANALYZE queue_metrics`;
            await this.prisma.$executeRaw `ANALYZE job_metrics`;
            // Create composite indexes for common query patterns
            await this.createOptimizedIndexes();
            // Update index usage statistics
            await this.updateIndexStats();
        }
        catch (error) {
            throw new errors_1.QueueManagementError(`Failed to optimize indexes: ${error.message}`, 'INDEX_OPTIMIZATION_ERROR');
        }
    }
    /**
     * Get storage statistics and health metrics
     */
    async getStorageStats() {
        try {
            // Get record counts
            const [queueMetricsCount, jobMetricsCount] = await Promise.all([
                this.prisma.queueMetrics.count(),
                this.prisma.jobMetrics.count()
            ]);
            // Get storage size (PostgreSQL specific)
            const storageSizeResult = await this.prisma.$queryRaw `
        SELECT pg_total_relation_size('queue_metrics') + 
               pg_total_relation_size('job_metrics') as size
      `;
            const storageSize = Number(storageSizeResult[0]?.size || 0);
            // Get partition count
            const partitionCount = Array.from(this.partitions.values())
                .reduce((total, partitions) => total + partitions.length, 0);
            // Calculate index health (simplified metric)
            const indexHealth = await this.calculateIndexHealth();
            // Calculate query performance (average query time)
            const queryPerformance = await this.calculateQueryPerformance();
            return {
                totalRecords: queueMetricsCount + jobMetricsCount,
                storageSize,
                partitionCount,
                indexHealth,
                queryPerformance
            };
        }
        catch (error) {
            throw new errors_1.QueueManagementError(`Failed to get storage stats: ${error.message}`, 'STATS_ERROR');
        }
    }
    /**
     * Pre-aggregate metrics for faster queries
     */
    async preAggregateMetrics(granularity) {
        try {
            const now = new Date();
            const intervals = this.getAggregationIntervals(granularity, now);
            for (const interval of intervals) {
                await this.createPreAggregation(interval, granularity);
            }
        }
        catch (error) {
            throw new errors_1.QueueManagementError(`Failed to pre-aggregate metrics: ${error.message}`, 'PRE_AGGREGATION_ERROR');
        }
    }
    /**
     * Compress old data to save storage space
     */
    async compressOldData() {
        try {
            let compressedPartitions = 0;
            let spaceSaved = 0;
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            for (const [tableName, partitions] of this.partitions) {
                for (const partition of partitions) {
                    if (partition.startDate < thirtyDaysAgo && partition.isActive) {
                        try {
                            // Get size before compression
                            const sizeBefore = await this.getPartitionSize(partition.tableName);
                            // Enable compression
                            await this.enablePartitionCompression(partition.tableName);
                            // Get size after compression
                            const sizeAfter = await this.getPartitionSize(partition.tableName);
                            spaceSaved += sizeBefore - sizeAfter;
                            compressedPartitions++;
                            console.log(`Compressed partition ${partition.tableName}, saved ${sizeBefore - sizeAfter} bytes`);
                        }
                        catch (error) {
                            console.error(`Failed to compress partition ${partition.tableName}:`, error);
                        }
                    }
                }
            }
            return { compressedPartitions, spaceSaved };
        }
        catch (error) {
            throw new errors_1.QueueManagementError(`Failed to compress old data: ${error.message}`, 'COMPRESSION_ERROR');
        }
    }
    /**
     * Get partition size in bytes
     */
    async getPartitionSize(partitionName) {
        try {
            const result = await this.prisma.$queryRaw `
        SELECT pg_total_relation_size(${partitionName}) as size
      `;
            return Number(result[0]?.size || 0);
        }
        catch (error) {
            console.error(`Failed to get partition size for ${partitionName}:`, error);
            return 0;
        }
    }
    // Private helper methods
    async initializePartitioning() {
        if (!this.config.partitioningEnabled)
            return;
        try {
            // Create initial partitions for current and next month
            const now = new Date();
            const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
            const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
            const monthAfter = new Date(now.getFullYear(), now.getMonth() + 2, 1);
            await Promise.all([
                this.createPartition('queue_metrics', currentMonth, nextMonth),
                this.createPartition('queue_metrics', nextMonth, monthAfter),
                this.createPartition('job_metrics', currentMonth, nextMonth),
                this.createPartition('job_metrics', nextMonth, monthAfter)
            ]);
        }
        catch (error) {
            console.error('Failed to initialize partitioning:', error);
        }
    }
    startCleanupScheduler() {
        // Run cleanup daily at 2 AM
        const cleanupInterval = 24 * 60 * 60 * 1000; // 24 hours
        this.cleanupInterval = setInterval(async () => {
            try {
                await this.cleanupOldData();
                await this.optimizeIndexes();
                await this.managePartitions(); // Ensure future partitions exist
            }
            catch (error) {
                console.error('Scheduled cleanup failed:', error);
            }
        }, cleanupInterval);
        // Also run partition management every 6 hours
        setInterval(async () => {
            try {
                await this.managePartitions();
            }
            catch (error) {
                console.error('Partition management failed:', error);
            }
        }, 6 * 60 * 60 * 1000); // 6 hours
    }
    async storeQueueMetrics(metrics) {
        if (metrics.length === 0)
            return;
        // Group metrics by queue and timestamp for batch insertion
        const grouped = new Map();
        for (const metric of metrics) {
            const key = `${metric.labels?.queueName}-${metric.timestamp.getTime()}`;
            if (!grouped.has(key)) {
                grouped.set(key, {
                    queueName: metric.labels?.queueName,
                    timestamp: metric.timestamp,
                    metrics: {}
                });
            }
            grouped.get(key).metrics[metric.name] = metric.value;
        }
        // Batch insert with upsert to handle duplicates
        const data = Array.from(grouped.values()).map(item => ({
            queueName: item.queueName,
            timestamp: item.timestamp,
            waitingCount: item.metrics.waiting_jobs || 0,
            activeCount: item.metrics.active_jobs || 0,
            completedCount: item.metrics.completed_jobs || 0,
            failedCount: item.metrics.failed_jobs || 0,
            delayedCount: item.metrics.delayed_jobs || 0,
            throughputPerMinute: item.metrics.throughput_per_minute || 0,
            avgProcessingTime: item.metrics.avg_processing_time || 0,
            successRate: item.metrics.success_rate || 0,
            errorRate: item.metrics.error_rate || 0,
            memoryUsage: item.metrics.memory_usage || 0,
            cpuUsage: item.metrics.cpu_usage || 0
        }));
        // Use batch insert for better performance
        await this.batchInsertQueueMetrics(data);
    }
    async storeJobMetrics(metrics) {
        if (metrics.length === 0)
            return;
        // Group by job ID for batch operations
        const jobData = new Map();
        for (const metric of metrics) {
            const jobId = metric.labels?.jobId;
            if (!jobId)
                continue;
            if (!jobData.has(jobId)) {
                jobData.set(jobId, {
                    jobId,
                    queueName: metric.labels?.queueName || '',
                    jobName: metric.labels?.jobName || '',
                    jobType: metric.labels?.jobType || '',
                    status: metric.labels?.status || 'unknown',
                    timestamp: metric.timestamp,
                    metrics: {}
                });
            }
            jobData.get(jobId).metrics[metric.name] = metric.value;
        }
        // Batch upsert job metrics
        for (const data of jobData.values()) {
            await this.prisma.jobMetrics.upsert({
                where: { jobId: data.jobId },
                update: {
                    ...data.metrics,
                    updatedAt: data.timestamp
                },
                create: {
                    jobId: data.jobId,
                    queueName: data.queueName,
                    jobName: data.jobName,
                    jobType: data.jobType,
                    status: data.status,
                    createdAt: data.timestamp,
                    ...data.metrics
                }
            });
        }
    }
    async storeSystemMetrics(metrics) {
        if (metrics.length === 0)
            return;
        // System metrics are stored in a separate table or cache
        // For now, we'll cache them in Redis for real-time access
        const systemData = {
            timestamp: new Date(),
            metrics: {}
        };
        for (const metric of metrics) {
            systemData.metrics[metric.name] = metric.value;
        }
        await this.redis.setex('system:metrics:latest', 300, // 5 minutes TTL
        JSON.stringify(systemData));
    }
    async batchInsertQueueMetrics(data) {
        const batchSize = this.config.batchSize;
        for (let i = 0; i < data.length; i += batchSize) {
            const batch = data.slice(i, i + batchSize);
            try {
                await this.prisma.queueMetrics.createMany({
                    data: batch,
                    skipDuplicates: true
                });
            }
            catch (error) {
                // If batch insert fails, try individual upserts
                for (const item of batch) {
                    await this.prisma.queueMetrics.upsert({
                        where: {
                            queueName_timestamp: {
                                queueName: item.queueName,
                                timestamp: item.timestamp
                            }
                        },
                        update: item,
                        create: item
                    });
                }
            }
        }
    }
    getPartitionsForTimeRange(timeRange) {
        // Return partition names that overlap with the time range
        const partitions = [];
        for (const [tableName, tablePartitions] of this.partitions) {
            for (const partition of tablePartitions) {
                if (this.partitionOverlapsTimeRange(partition, timeRange)) {
                    partitions.push(partition.tableName);
                }
            }
        }
        return partitions;
    }
    partitionOverlapsTimeRange(partition, timeRange) {
        return partition.startDate <= timeRange.end && partition.endDate >= timeRange.start;
    }
    convertQueueMetricsToMetricFormat(data) {
        const baseLabels = {
            queueName: data.queueName,
            type: 'queue'
        };
        return [
            {
                name: 'throughput_per_minute',
                type: 'gauge',
                value: data.throughputPerMinute || 0,
                timestamp: data.timestamp,
                labels: baseLabels
            },
            {
                name: 'avg_processing_time',
                type: 'gauge',
                value: data.avgProcessingTime || 0,
                timestamp: data.timestamp,
                labels: baseLabels
            },
            {
                name: 'success_rate',
                type: 'gauge',
                value: data.successRate || 0,
                timestamp: data.timestamp,
                labels: baseLabels
            },
            {
                name: 'error_rate',
                type: 'gauge',
                value: data.errorRate || 0,
                timestamp: data.timestamp,
                labels: baseLabels
            }
        ];
    }
    async getPreAggregatedData(query) {
        // Check if we have pre-aggregated data for this query
        const cacheKey = this.buildAggregationCacheKey(query);
        const cached = await this.redis.get(cacheKey);
        if (cached) {
            return JSON.parse(cached);
        }
        return null;
    }
    async performRealTimeAggregation(query) {
        const { queueNames, timeRange, granularity, aggregationFunction } = query;
        // Build SQL query for aggregation
        const whereConditions = {
            timestamp: {
                gte: timeRange.start,
                lte: timeRange.end
            }
        };
        if (queueNames && queueNames.length > 0) {
            whereConditions.queueName = { in: queueNames };
        }
        // Get raw data
        const rawData = await this.prisma.queueMetrics.findMany({
            where: whereConditions,
            orderBy: { timestamp: 'asc' }
        });
        // Group by time intervals based on granularity
        const groupedData = this.groupDataByGranularity(rawData, granularity);
        // Apply aggregation function
        const aggregatedData = groupedData.map(group => ({
            timestamp: group.timestamp,
            throughput: this.applyAggregationFunction(group.data.map(d => d.throughputPerMinute || 0), aggregationFunction),
            avgProcessingTime: this.applyAggregationFunction(group.data.map(d => d.avgProcessingTime || 0), aggregationFunction),
            successRate: this.applyAggregationFunction(group.data.map(d => d.successRate || 0), aggregationFunction),
            errorRate: this.applyAggregationFunction(group.data.map(d => d.errorRate || 0), aggregationFunction),
            queueSize: this.applyAggregationFunction(group.data.map(d => (d.waitingCount || 0) + (d.activeCount || 0) + (d.delayedCount || 0)), aggregationFunction)
        }));
        const result = {
            queueName: queueNames?.[0],
            timeRange,
            granularity: granularity,
            data: aggregatedData
        };
        // Cache the result
        const cacheKey = this.buildAggregationCacheKey(query);
        await this.redis.setex(cacheKey, 300, JSON.stringify(result)); // 5 minutes TTL
        return result;
    }
    groupDataByGranularity(data, granularity) {
        const groups = new Map();
        const intervalMs = this.getIntervalMs(granularity);
        for (const item of data) {
            const intervalStart = Math.floor(item.timestamp.getTime() / intervalMs) * intervalMs;
            if (!groups.has(intervalStart)) {
                groups.set(intervalStart, []);
            }
            groups.get(intervalStart).push(item);
        }
        return Array.from(groups.entries()).map(([timestamp, data]) => ({
            timestamp: new Date(timestamp),
            data
        }));
    }
    applyAggregationFunction(values, func) {
        if (values.length === 0)
            return 0;
        switch (func) {
            case 'avg':
                return values.reduce((sum, val) => sum + val, 0) / values.length;
            case 'sum':
                return values.reduce((sum, val) => sum + val, 0);
            case 'max':
                return Math.max(...values);
            case 'min':
                return Math.min(...values);
            case 'count':
                return values.length;
            default:
                return values.reduce((sum, val) => sum + val, 0) / values.length;
        }
    }
    getIntervalMs(granularity) {
        switch (granularity) {
            case '1m': return 60 * 1000;
            case '5m': return 5 * 60 * 1000;
            case '1h': return 60 * 60 * 1000;
            case '1d': return 24 * 60 * 60 * 1000;
            default: return 60 * 60 * 1000; // 1 hour default
        }
    }
    buildAggregationCacheKey(query) {
        const parts = [
            'aggregation',
            query.queueNames?.join(',') || 'all',
            query.timeRange.start.getTime(),
            query.timeRange.end.getTime(),
            query.granularity,
            query.aggregationFunction
        ];
        return parts.join(':');
    }
    formatDateForPartition(date) {
        return `${date.getFullYear()}_${String(date.getMonth() + 1).padStart(2, '0')}`;
    }
    async createPartitionIndexes(partitionName) {
        // Create optimized indexes for the partition
        await this.prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS ${partitionName}_timestamp_idx 
      ON ${partitionName} (timestamp DESC)
    `);
        await this.prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS ${partitionName}_queue_timestamp_idx 
      ON ${partitionName} (queue_name, timestamp DESC)
    `);
    }
    async dropOldPartitions(cutoffDate) {
        let freedSpace = 0;
        for (const [tableName, partitions] of this.partitions) {
            const oldPartitions = partitions.filter(p => p.endDate < cutoffDate);
            for (const partition of oldPartitions) {
                try {
                    // Get partition size before dropping
                    const sizeResult = await this.prisma.$queryRaw `
            SELECT pg_total_relation_size('${partition.tableName}') as size
          `;
                    const partitionSize = Number(sizeResult[0]?.size || 0);
                    // Drop the partition
                    await this.prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS ${partition.tableName}`);
                    freedSpace += partitionSize;
                    // Remove from registry
                    const updatedPartitions = partitions.filter(p => p.tableName !== partition.tableName);
                    this.partitions.set(tableName, updatedPartitions);
                }
                catch (error) {
                    console.error(`Failed to drop partition ${partition.tableName}:`, error);
                }
            }
        }
        return { freedSpace };
    }
    async createOptimizedIndexes() {
        // Create composite indexes for common query patterns
        const indexes = [
            'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_queue_metrics_queue_time ON queue_metrics (queue_name, timestamp DESC)',
            'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_queue_metrics_time_throughput ON queue_metrics (timestamp DESC, throughput_per_minute)',
            'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_job_metrics_queue_status ON job_metrics (queue_name, status, created_at DESC)',
            'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_job_metrics_processing_time ON job_metrics (processing_time) WHERE processing_time IS NOT NULL'
        ];
        for (const indexSql of indexes) {
            try {
                await this.prisma.$executeRawUnsafe(indexSql);
            }
            catch (error) {
                // Index might already exist, continue with others
                console.warn('Index creation warning:', error.message);
            }
        }
    }
    async calculateIndexHealth() {
        // Simplified index health calculation
        // In a real implementation, this would analyze index usage statistics
        return 0.95; // 95% health score
    }
    async calculateQueryPerformance() {
        // Simplified query performance calculation
        // In a real implementation, this would analyze query execution times
        return 150; // 150ms average query time
    }
    async updateStorageStats(recordCount) {
        // Update storage statistics in cache
        const stats = {
            lastUpdate: new Date(),
            recordsStored: recordCount,
            totalOperations: await this.redis.incr('storage:operations:total')
        };
        await this.redis.setex('storage:stats', 3600, JSON.stringify(stats));
    }
    async updateCleanupStats(deletedRecords, freedSpace) {
        const stats = {
            lastCleanup: new Date(),
            deletedRecords,
            freedSpace,
            totalCleanups: await this.redis.incr('storage:cleanups:total')
        };
        await this.redis.setex('storage:cleanup:stats', 86400, JSON.stringify(stats));
    }
    async updateIndexStats() {
        const stats = {
            lastOptimization: new Date(),
            totalOptimizations: await this.redis.incr('storage:optimizations:total')
        };
        await this.redis.setex('storage:index:stats', 86400, JSON.stringify(stats));
    }
    getAggregationIntervals(granularity, now) {
        const intervals = [];
        const intervalMs = this.getIntervalMs(granularity);
        // Generate intervals for the last 24 hours
        const startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        for (let time = startTime.getTime(); time < now.getTime(); time += intervalMs) {
            intervals.push({
                start: new Date(time),
                end: new Date(time + intervalMs)
            });
        }
        return intervals;
    }
    async createPreAggregation(interval, granularity) {
        // Create pre-aggregated data for the interval
        const aggregatedData = await this.prisma.queueMetrics.groupBy({
            by: ['queueName'],
            where: {
                timestamp: {
                    gte: interval.start,
                    lt: interval.end
                }
            },
            _avg: {
                throughputPerMinute: true,
                avgProcessingTime: true,
                successRate: true,
                errorRate: true
            },
            _sum: {
                waitingCount: true,
                activeCount: true,
                completedCount: true,
                failedCount: true
            }
        });
        // Store pre-aggregated data (could be in a separate table or cache)
        const cacheKey = `pre_agg:${granularity}:${interval.start.getTime()}`;
        await this.redis.setex(cacheKey, 86400, JSON.stringify(aggregatedData)); // 24 hours TTL
    }
}
exports.MetricsStorageService = MetricsStorageService;
