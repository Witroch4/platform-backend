/**
 * Metrics Storage Service
 * 
 * Handles efficient storage, partitioning, and cleanup of metrics data
 * with optimized database operations and automatic data lifecycle management.
 */

import { PrismaClient } from '@prisma/client'
import { Redis } from 'ioredis'
import { 
  Metric, 
  MetricQuery, 
  AggregationQuery, 
  AggregatedMetrics,
  MetricStorage,
  TimeRange
} from '../types/metrics.types'
import { getQueueManagementConfig } from '../config'
import { QueueManagementError } from '../errors'
import { TIME_GRANULARITIES } from '../constants'

interface StorageConfig {
  batchSize: number
  retentionDays: number
  partitioningEnabled: boolean
  compressionEnabled: boolean
  indexOptimization: boolean
}

interface PartitionInfo {
  tableName: string
  startDate: Date
  endDate: Date
  isActive: boolean
}

export class MetricsStorageService implements MetricStorage {
  private static instance: MetricsStorageService | null = null
  private prisma: PrismaClient
  private redis: Redis
  private config: StorageConfig
  private partitions: Map<string, PartitionInfo[]> = new Map()
  private cleanupInterval: NodeJS.Timeout | null = null

  constructor(prisma: PrismaClient, redis: Redis) {
    this.prisma = prisma
    this.redis = redis
    
    const queueConfig = getQueueManagementConfig()
    this.config = {
      batchSize: queueConfig.metrics.batchSize,
      retentionDays: queueConfig.metrics.retentionDays,
      partitioningEnabled: true,
      compressionEnabled: true,
      indexOptimization: true
    }

    this.initializePartitioning()
    this.startCleanupScheduler()
  }

  /**
   * Get singleton instance
   */
  static getInstance(prisma?: PrismaClient, redis?: Redis): MetricsStorageService {
    if (!MetricsStorageService.instance) {
      if (!prisma || !redis) {
        throw new QueueManagementError(
          'Prisma and Redis instances required for first initialization',
          'INITIALIZATION_ERROR'
        )
      }
      MetricsStorageService.instance = new MetricsStorageService(prisma, redis)
    }
    return MetricsStorageService.instance
  }

  /**
   * Store metrics in batches with optimized insertion
   */
  async store(metrics: Metric[]): Promise<void> {
    if (metrics.length === 0) return

    try {
      // Group metrics by type for optimized storage
      const queueMetrics = metrics.filter(m => m.labels?.type === 'queue')
      const jobMetrics = metrics.filter(m => m.labels?.type === 'job')
      const systemMetrics = metrics.filter(m => m.labels?.type === 'system')

      // Store in parallel for better performance
      await Promise.all([
        this.storeQueueMetrics(queueMetrics),
        this.storeJobMetrics(jobMetrics),
        this.storeSystemMetrics(systemMetrics)
      ])

      // Update storage statistics
      await this.updateStorageStats(metrics.length)

    } catch (error) {
      throw new QueueManagementError(
        `Failed to store metrics: ${error.message}`,
        'STORAGE_ERROR'
      )
    }
  }

  /**
   * Query metrics with optimized database queries
   */
  async query(query: MetricQuery): Promise<Metric[]> {
    try {
      const { metricNames, queueNames, timeRange, labels, limit = 1000 } = query

      // Determine which partitions to query
      const partitionsToQuery = this.getPartitionsForTimeRange(timeRange)

      // Build optimized query conditions
      const whereConditions: any = {
        timestamp: {
          gte: timeRange.start,
          lte: timeRange.end
        }
      }

      if (queueNames && queueNames.length > 0) {
        whereConditions.queueName = { in: queueNames }
      }

      // Query queue metrics
      const queueMetricsData = await this.prisma.queueMetrics.findMany({
        where: whereConditions,
        orderBy: { timestamp: 'desc' },
        take: limit
      })

      // Convert to Metric format
      const metrics: Metric[] = []
      
      for (const data of queueMetricsData) {
        metrics.push(...this.convertQueueMetricsToMetricFormat(data))
      }

      return metrics

    } catch (error) {
      throw new QueueManagementError(
        `Failed to query metrics: ${error.message}`,
        'QUERY_ERROR'
      )
    }
  }

  /**
   * Aggregate metrics with pre-computed aggregations when possible
   */
  async aggregate(query: AggregationQuery): Promise<AggregatedMetrics> {
    try {
      const { queueNames, timeRange, granularity, aggregationFunction } = query

      // Check if we have pre-aggregated data
      const preAggregated = await this.getPreAggregatedData(query)
      if (preAggregated) {
        return preAggregated
      }

      // Perform real-time aggregation
      return await this.performRealTimeAggregation(query)

    } catch (error) {
      throw new QueueManagementError(
        `Failed to aggregate metrics: ${error.message}`,
        'AGGREGATION_ERROR'
      )
    }
  }

  /**
   * Create database partitions for time-based data
   */
  async createPartition(tableName: string, startDate: Date, endDate: Date): Promise<void> {
    try {
      const partitionName = `${tableName}_${this.formatDateForPartition(startDate)}`
      
      // Create partition table
      await this.prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS ${partitionName} 
        PARTITION OF ${tableName}
        FOR VALUES FROM ('${startDate.toISOString()}') TO ('${endDate.toISOString()}')
      `)

      // Create optimized indexes for the partition
      await this.createPartitionIndexes(partitionName)

      // Update partition registry
      const partitions = this.partitions.get(tableName) || []
      partitions.push({
        tableName: partitionName,
        startDate,
        endDate,
        isActive: true
      })
      this.partitions.set(tableName, partitions)

    } catch (error) {
      throw new QueueManagementError(
        `Failed to create partition: ${error.message}`,
        'PARTITION_ERROR'
      )
    }
  }

  /**
   * Clean up old data based on retention policy
   */
  async cleanupOldData(): Promise<{ deletedRecords: number; freedSpace: number }> {
    try {
      const cutoffDate = new Date()
      cutoffDate.setDate(cutoffDate.getDate() - this.config.retentionDays)

      let totalDeleted = 0
      let totalFreedSpace = 0

      // Clean up queue metrics
      const queueMetricsDeleted = await this.prisma.queueMetrics.deleteMany({
        where: {
          timestamp: { lt: cutoffDate }
        }
      })
      totalDeleted += queueMetricsDeleted.count

      // Clean up job metrics
      const jobMetricsDeleted = await this.prisma.jobMetrics.deleteMany({
        where: {
          createdAt: { lt: cutoffDate }
        }
      })
      totalDeleted += jobMetricsDeleted.count

      // Drop old partitions
      const droppedPartitions = await this.dropOldPartitions(cutoffDate)
      totalFreedSpace += droppedPartitions.freedSpace

      // Update cleanup statistics
      await this.updateCleanupStats(totalDeleted, totalFreedSpace)

      return {
        deletedRecords: totalDeleted,
        freedSpace: totalFreedSpace
      }

    } catch (error) {
      throw new QueueManagementError(
        `Failed to cleanup old data: ${error.message}`,
        'CLEANUP_ERROR'
      )
    }
  }

  /**
   * Optimize database indexes for better query performance
   */
  async optimizeIndexes(): Promise<void> {
    try {
      // Analyze table statistics
      await this.prisma.$executeRaw`ANALYZE queue_metrics`
      await this.prisma.$executeRaw`ANALYZE job_metrics`

      // Create composite indexes for common query patterns
      await this.createOptimizedIndexes()

      // Update index usage statistics
      await this.updateIndexStats()

    } catch (error) {
      throw new QueueManagementError(
        `Failed to optimize indexes: ${error.message}`,
        'INDEX_OPTIMIZATION_ERROR'
      )
    }
  }

  /**
   * Get storage statistics and health metrics
   */
  async getStorageStats(): Promise<{
    totalRecords: number
    storageSize: number
    partitionCount: number
    indexHealth: number
    queryPerformance: number
  }> {
    try {
      // Get record counts
      const [queueMetricsCount, jobMetricsCount] = await Promise.all([
        this.prisma.queueMetrics.count(),
        this.prisma.jobMetrics.count()
      ])

      // Get storage size (PostgreSQL specific)
      const storageSizeResult = await this.prisma.$queryRaw<Array<{ size: bigint }>>`
        SELECT pg_total_relation_size('queue_metrics') + 
               pg_total_relation_size('job_metrics') as size
      `
      const storageSize = Number(storageSizeResult[0]?.size || 0)

      // Get partition count
      const partitionCount = Array.from(this.partitions.values())
        .reduce((total, partitions) => total + partitions.length, 0)

      // Calculate index health (simplified metric)
      const indexHealth = await this.calculateIndexHealth()

      // Calculate query performance (average query time)
      const queryPerformance = await this.calculateQueryPerformance()

      return {
        totalRecords: queueMetricsCount + jobMetricsCount,
        storageSize,
        partitionCount,
        indexHealth,
        queryPerformance
      }

    } catch (error) {
      throw new QueueManagementError(
        `Failed to get storage stats: ${error.message}`,
        'STATS_ERROR'
      )
    }
  }

  /**
   * Pre-aggregate metrics for faster queries
   */
  async preAggregateMetrics(granularity: string): Promise<void> {
    try {
      const now = new Date()
      const intervals = this.getAggregationIntervals(granularity, now)

      for (const interval of intervals) {
        await this.createPreAggregation(interval, granularity)
      }

    } catch (error) {
      throw new QueueManagementError(
        `Failed to pre-aggregate metrics: ${error.message}`,
        'PRE_AGGREGATION_ERROR'
      )
    }
  }

  // Private helper methods

  private async initializePartitioning(): Promise<void> {
    if (!this.config.partitioningEnabled) return

    try {
      // Create initial partitions for current and next month
      const now = new Date()
      const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1)
      const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1)
      const monthAfter = new Date(now.getFullYear(), now.getMonth() + 2, 1)

      await Promise.all([
        this.createPartition('queue_metrics', currentMonth, nextMonth),
        this.createPartition('queue_metrics', nextMonth, monthAfter),
        this.createPartition('job_metrics', currentMonth, nextMonth),
        this.createPartition('job_metrics', nextMonth, monthAfter)
      ])

    } catch (error) {
      console.error('Failed to initialize partitioning:', error)
    }
  }

  private startCleanupScheduler(): void {
    // Run cleanup daily at 2 AM
    const cleanupInterval = 24 * 60 * 60 * 1000 // 24 hours
    
    this.cleanupInterval = setInterval(async () => {
      try {
        await this.cleanupOldData()
        await this.optimizeIndexes()
      } catch (error) {
        console.error('Scheduled cleanup failed:', error)
      }
    }, cleanupInterval)
  }

  private async storeQueueMetrics(metrics: Metric[]): Promise<void> {
    if (metrics.length === 0) return

    // Group metrics by queue and timestamp for batch insertion
    const grouped = new Map<string, any>()

    for (const metric of metrics) {
      const key = `${metric.labels?.queueName}-${metric.timestamp.getTime()}`
      if (!grouped.has(key)) {
        grouped.set(key, {
          queueName: metric.labels?.queueName,
          timestamp: metric.timestamp,
          metrics: {}
        })
      }
      grouped.get(key).metrics[metric.name] = metric.value
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
    }))

    // Use batch insert for better performance
    await this.batchInsertQueueMetrics(data)
  }

  private async storeJobMetrics(metrics: Metric[]): Promise<void> {
    if (metrics.length === 0) return

    // Group by job ID for batch operations
    const jobData = new Map<string, any>()

    for (const metric of metrics) {
      const jobId = metric.labels?.jobId
      if (!jobId) continue

      if (!jobData.has(jobId)) {
        jobData.set(jobId, {
          jobId,
          queueName: metric.labels?.queueName || '',
          jobName: metric.labels?.jobName || '',
          jobType: metric.labels?.jobType || '',
          status: metric.labels?.status || 'unknown',
          timestamp: metric.timestamp,
          metrics: {}
        })
      }
      jobData.get(jobId).metrics[metric.name] = metric.value
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
      })
    }
  }

  private async storeSystemMetrics(metrics: Metric[]): Promise<void> {
    if (metrics.length === 0) return

    // System metrics are stored in a separate table or cache
    // For now, we'll cache them in Redis for real-time access
    const systemData: any = {
      timestamp: new Date(),
      metrics: {}
    }

    for (const metric of metrics) {
      systemData.metrics[metric.name] = metric.value
    }

    await this.redis.setex(
      'system:metrics:latest',
      300, // 5 minutes TTL
      JSON.stringify(systemData)
    )
  }

  private async batchInsertQueueMetrics(data: any[]): Promise<void> {
    const batchSize = this.config.batchSize
    
    for (let i = 0; i < data.length; i += batchSize) {
      const batch = data.slice(i, i + batchSize)
      
      try {
        await this.prisma.queueMetrics.createMany({
          data: batch,
          skipDuplicates: true
        })
      } catch (error) {
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
          })
        }
      }
    }
  }

  private getPartitionsForTimeRange(timeRange: TimeRange): string[] {
    // Return partition names that overlap with the time range
    const partitions: string[] = []
    
    for (const [tableName, tablePartitions] of this.partitions) {
      for (const partition of tablePartitions) {
        if (this.partitionOverlapsTimeRange(partition, timeRange)) {
          partitions.push(partition.tableName)
        }
      }
    }
    
    return partitions
  }

  private partitionOverlapsTimeRange(partition: PartitionInfo, timeRange: TimeRange): boolean {
    return partition.startDate <= timeRange.end && partition.endDate >= timeRange.start
  }

  private convertQueueMetricsToMetricFormat(data: any): Metric[] {
    const baseLabels = {
      queueName: data.queueName,
      type: 'queue'
    }

    return [
      {
        name: 'throughput_per_minute',
        type: 'gauge' as const,
        value: data.throughputPerMinute || 0,
        timestamp: data.timestamp,
        labels: baseLabels
      },
      {
        name: 'avg_processing_time',
        type: 'gauge' as const,
        value: data.avgProcessingTime || 0,
        timestamp: data.timestamp,
        labels: baseLabels
      },
      {
        name: 'success_rate',
        type: 'gauge' as const,
        value: data.successRate || 0,
        timestamp: data.timestamp,
        labels: baseLabels
      },
      {
        name: 'error_rate',
        type: 'gauge' as const,
        value: data.errorRate || 0,
        timestamp: data.timestamp,
        labels: baseLabels
      }
    ]
  }

  private async getPreAggregatedData(query: AggregationQuery): Promise<AggregatedMetrics | null> {
    // Check if we have pre-aggregated data for this query
    const cacheKey = this.buildAggregationCacheKey(query)
    const cached = await this.redis.get(cacheKey)
    
    if (cached) {
      return JSON.parse(cached)
    }
    
    return null
  }

  private async performRealTimeAggregation(query: AggregationQuery): Promise<AggregatedMetrics> {
    const { queueNames, timeRange, granularity, aggregationFunction } = query

    // Build SQL query for aggregation
    const whereConditions: any = {
      timestamp: {
        gte: timeRange.start,
        lte: timeRange.end
      }
    }

    if (queueNames && queueNames.length > 0) {
      whereConditions.queueName = { in: queueNames }
    }

    // Get raw data
    const rawData = await this.prisma.queueMetrics.findMany({
      where: whereConditions,
      orderBy: { timestamp: 'asc' }
    })

    // Group by time intervals based on granularity
    const groupedData = this.groupDataByGranularity(rawData, granularity)

    // Apply aggregation function
    const aggregatedData = groupedData.map(group => ({
      timestamp: group.timestamp,
      throughput: this.applyAggregationFunction(
        group.data.map(d => d.throughputPerMinute || 0),
        aggregationFunction
      ),
      avgProcessingTime: this.applyAggregationFunction(
        group.data.map(d => d.avgProcessingTime || 0),
        aggregationFunction
      ),
      successRate: this.applyAggregationFunction(
        group.data.map(d => d.successRate || 0),
        aggregationFunction
      ),
      errorRate: this.applyAggregationFunction(
        group.data.map(d => d.errorRate || 0),
        aggregationFunction
      ),
      queueSize: this.applyAggregationFunction(
        group.data.map(d => (d.waitingCount || 0) + (d.activeCount || 0) + (d.delayedCount || 0)),
        aggregationFunction
      )
    }))

    const result: AggregatedMetrics = {
      queueName: queueNames?.[0],
      timeRange,
      granularity: granularity as any,
      data: aggregatedData
    }

    // Cache the result
    const cacheKey = this.buildAggregationCacheKey(query)
    await this.redis.setex(cacheKey, 300, JSON.stringify(result)) // 5 minutes TTL

    return result
  }

  private groupDataByGranularity(data: any[], granularity: string): Array<{ timestamp: Date; data: any[] }> {
    const groups = new Map<number, any[]>()
    const intervalMs = this.getIntervalMs(granularity)

    for (const item of data) {
      const intervalStart = Math.floor(item.timestamp.getTime() / intervalMs) * intervalMs
      
      if (!groups.has(intervalStart)) {
        groups.set(intervalStart, [])
      }
      groups.get(intervalStart)!.push(item)
    }

    return Array.from(groups.entries()).map(([timestamp, data]) => ({
      timestamp: new Date(timestamp),
      data
    }))
  }

  private applyAggregationFunction(values: number[], func: string): number {
    if (values.length === 0) return 0

    switch (func) {
      case 'avg':
        return values.reduce((sum, val) => sum + val, 0) / values.length
      case 'sum':
        return values.reduce((sum, val) => sum + val, 0)
      case 'max':
        return Math.max(...values)
      case 'min':
        return Math.min(...values)
      case 'count':
        return values.length
      default:
        return values.reduce((sum, val) => sum + val, 0) / values.length
    }
  }

  private getIntervalMs(granularity: string): number {
    switch (granularity) {
      case '1m': return 60 * 1000
      case '5m': return 5 * 60 * 1000
      case '1h': return 60 * 60 * 1000
      case '1d': return 24 * 60 * 60 * 1000
      default: return 60 * 60 * 1000 // 1 hour default
    }
  }

  private buildAggregationCacheKey(query: AggregationQuery): string {
    const parts = [
      'aggregation',
      query.queueNames?.join(',') || 'all',
      query.timeRange.start.getTime(),
      query.timeRange.end.getTime(),
      query.granularity,
      query.aggregationFunction
    ]
    return parts.join(':')
  }

  private formatDateForPartition(date: Date): string {
    return `${date.getFullYear()}_${String(date.getMonth() + 1).padStart(2, '0')}`
  }

  private async createPartitionIndexes(partitionName: string): Promise<void> {
    // Create optimized indexes for the partition
    await this.prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS ${partitionName}_timestamp_idx 
      ON ${partitionName} (timestamp DESC)
    `)
    
    await this.prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS ${partitionName}_queue_timestamp_idx 
      ON ${partitionName} (queue_name, timestamp DESC)
    `)
  }

  private async dropOldPartitions(cutoffDate: Date): Promise<{ freedSpace: number }> {
    let freedSpace = 0
    
    for (const [tableName, partitions] of this.partitions) {
      const oldPartitions = partitions.filter(p => p.endDate < cutoffDate)
      
      for (const partition of oldPartitions) {
        try {
          // Get partition size before dropping
          const sizeResult = await this.prisma.$queryRaw<Array<{ size: bigint }>>`
            SELECT pg_total_relation_size('${partition.tableName}') as size
          `
          const partitionSize = Number(sizeResult[0]?.size || 0)
          
          // Drop the partition
          await this.prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS ${partition.tableName}`)
          
          freedSpace += partitionSize
          
          // Remove from registry
          const updatedPartitions = partitions.filter(p => p.tableName !== partition.tableName)
          this.partitions.set(tableName, updatedPartitions)
          
        } catch (error) {
          console.error(`Failed to drop partition ${partition.tableName}:`, error)
        }
      }
    }
    
    return { freedSpace }
  }

  private async createOptimizedIndexes(): Promise<void> {
    // Create composite indexes for common query patterns
    const indexes = [
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_queue_metrics_queue_time ON queue_metrics (queue_name, timestamp DESC)',
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_queue_metrics_time_throughput ON queue_metrics (timestamp DESC, throughput_per_minute)',
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_job_metrics_queue_status ON job_metrics (queue_name, status, created_at DESC)',
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_job_metrics_processing_time ON job_metrics (processing_time) WHERE processing_time IS NOT NULL'
    ]

    for (const indexSql of indexes) {
      try {
        await this.prisma.$executeRawUnsafe(indexSql)
      } catch (error) {
        // Index might already exist, continue with others
        console.warn('Index creation warning:', error.message)
      }
    }
  }

  private async calculateIndexHealth(): Promise<number> {
    // Simplified index health calculation
    // In a real implementation, this would analyze index usage statistics
    return 0.95 // 95% health score
  }

  private async calculateQueryPerformance(): Promise<number> {
    // Simplified query performance calculation
    // In a real implementation, this would analyze query execution times
    return 150 // 150ms average query time
  }

  private async updateStorageStats(recordCount: number): Promise<void> {
    // Update storage statistics in cache
    const stats = {
      lastUpdate: new Date(),
      recordsStored: recordCount,
      totalOperations: await this.redis.incr('storage:operations:total')
    }
    
    await this.redis.setex('storage:stats', 3600, JSON.stringify(stats))
  }

  private async updateCleanupStats(deletedRecords: number, freedSpace: number): Promise<void> {
    const stats = {
      lastCleanup: new Date(),
      deletedRecords,
      freedSpace,
      totalCleanups: await this.redis.incr('storage:cleanups:total')
    }
    
    await this.redis.setex('storage:cleanup:stats', 86400, JSON.stringify(stats))
  }

  private async updateIndexStats(): Promise<void> {
    const stats = {
      lastOptimization: new Date(),
      totalOptimizations: await this.redis.incr('storage:optimizations:total')
    }
    
    await this.redis.setex('storage:index:stats', 86400, JSON.stringify(stats))
  }

  private getAggregationIntervals(granularity: string, now: Date): Array<{ start: Date; end: Date }> {
    const intervals: Array<{ start: Date; end: Date }> = []
    const intervalMs = this.getIntervalMs(granularity)
    
    // Generate intervals for the last 24 hours
    const startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    
    for (let time = startTime.getTime(); time < now.getTime(); time += intervalMs) {
      intervals.push({
        start: new Date(time),
        end: new Date(time + intervalMs)
      })
    }
    
    return intervals
  }

  private async createPreAggregation(interval: { start: Date; end: Date }, granularity: string): Promise<void> {
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
    })

    // Store pre-aggregated data (could be in a separate table or cache)
    const cacheKey = `pre_agg:${granularity}:${interval.start.getTime()}`
    await this.redis.setex(cacheKey, 86400, JSON.stringify(aggregatedData)) // 24 hours TTL
  }
}