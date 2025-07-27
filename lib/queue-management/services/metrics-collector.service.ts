/**
 * Metrics Collector Service
 * 
 * Responsible for collecting, aggregating and storing metrics from BullMQ queues
 * and system resources in real-time and at regular intervals.
 */

import { Queue, Job } from 'bullmq'
import { EventEmitter } from 'events'
import { Redis } from 'ioredis'
import { PrismaClient } from '@prisma/client'
import { 
  QueueMetrics, 
  SystemMetrics, 
  Metric, 
  MetricCollectionConfig,
  MetricCollector,
  BaseMetric,
  CounterMetric,
  GaugeMetric,
  TimeRange,
  AggregatedMetrics,
  Percentiles,
  ExportResult,
  MetricFilters,
  RealTimeMetrics
} from '../types/metrics.types'
import { getQueueManagementConfig } from '../config'
import { CACHE_KEYS, TIME_GRANULARITIES, METRIC_TYPES } from '../constants'
import { QueueManagementError } from '../errors'

export class MetricsCollectorService extends EventEmitter {
  private static instance: MetricsCollectorService | null = null
  private redis: Redis
  private prisma: PrismaClient
  private config: MetricCollectionConfig
  private collectors: Map<string, MetricCollector> = new Map()
  private collectionInterval: NodeJS.Timeout | null = null
  private isCollecting = false
  private registeredQueues: Map<string, Queue> = new Map()

  constructor(redis: Redis, prisma: PrismaClient) {
    super()
    this.redis = redis
    this.prisma = prisma
    
    const queueConfig = getQueueManagementConfig()
    this.config = {
      interval: queueConfig.metrics.collectionInterval,
      retention: queueConfig.metrics.retentionDays,
      aggregationIntervals: queueConfig.metrics.aggregationIntervals.map(
        interval => interval as any
      ),
      batchSize: queueConfig.metrics.batchSize
    }

    this.setupDefaultCollectors()
  }

  /**
   * Get singleton instance
   */
  static getInstance(redis?: Redis, prisma?: PrismaClient): MetricsCollectorService {
    if (!MetricsCollectorService.instance) {
      if (!redis || !prisma) {
        throw new QueueManagementError(
          'Redis and Prisma instances required for first initialization',
          'INITIALIZATION_ERROR'
        )
      }
      MetricsCollectorService.instance = new MetricsCollectorService(redis, prisma)
    }
    return MetricsCollectorService.instance
  }

  /**
   * Register a queue for metrics collection
   */
  registerQueue(queueName: string, queue: Queue): void {
    this.registeredQueues.set(queueName, queue)
    
    // Setup queue event listeners for real-time metrics
    this.setupQueueEventListeners(queueName, queue)
    
    this.emit('queue_registered', { queueName })
  }

  /**
   * Unregister a queue from metrics collection
   */
  unregisterQueue(queueName: string): void {
    const queue = this.registeredQueues.get(queueName)
    if (queue) {
      // Remove event listeners
      queue.removeAllListeners()
      this.registeredQueues.delete(queueName)
      this.emit('queue_unregistered', { queueName })
    }
  }

  /**
   * Start automatic metrics collection
   */
  startCollection(): void {
    if (this.isCollecting) {
      return
    }

    this.isCollecting = true
    this.collectionInterval = setInterval(
      () => this.collectAllMetrics(),
      this.config.interval
    )

    this.emit('collection_started')
  }

  /**
   * Stop automatic metrics collection
   */
  stopCollection(): void {
    if (!this.isCollecting) {
      return
    }

    this.isCollecting = false
    if (this.collectionInterval) {
      clearInterval(this.collectionInterval)
      this.collectionInterval = null
    }

    this.emit('collection_stopped')
  }

  /**
   * Collect metrics from a specific queue
   */
  async collectQueueMetrics(queueName: string): Promise<QueueMetrics> {
    const queue = this.registeredQueues.get(queueName)
    if (!queue) {
      throw new QueueManagementError(
        `Queue ${queueName} not registered for metrics collection`,
        'QUEUE_NOT_REGISTERED'
      )
    }

    try {
      // Get job counts by state
      const [waiting, active, completed, failed, delayed] = await Promise.all([
        queue.getWaiting(),
        queue.getActive(),
        queue.getCompleted(),
        queue.getFailed(),
        queue.getDelayed()
      ])

      // Calculate throughput metrics
      const now = new Date()
      const oneMinuteAgo = new Date(now.getTime() - 60 * 1000)
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000)
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)

      const [jobsLastMinute, jobsLastHour, jobsLastDay] = await Promise.all([
        this.getCompletedJobsCount(queueName, oneMinuteAgo, now),
        this.getCompletedJobsCount(queueName, oneHourAgo, now),
        this.getCompletedJobsCount(queueName, oneDayAgo, now)
      ])

      // Calculate processing time percentiles
      const processingTimes = await this.getProcessingTimes(queueName, oneHourAgo, now)
      const latency = this.calculatePercentiles(processingTimes)

      // Calculate reliability metrics
      const totalJobsLastHour = await this.getTotalJobsCount(queueName, oneHourAgo, now)
      const failedJobsLastHour = await this.getFailedJobsCount(queueName, oneHourAgo, now)
      const retriedJobsLastHour = await this.getRetriedJobsCount(queueName, oneHourAgo, now)

      const successRate = totalJobsLastHour > 0 
        ? (totalJobsLastHour - failedJobsLastHour) / totalJobsLastHour 
        : 1
      const errorRate = totalJobsLastHour > 0 
        ? failedJobsLastHour / totalJobsLastHour 
        : 0
      const retryRate = totalJobsLastHour > 0 
        ? retriedJobsLastHour / totalJobsLastHour 
        : 0

      // Get resource usage
      const resources = await this.getQueueResourceUsage(queueName)

      const metrics: QueueMetrics = {
        queueName,
        timestamp: now,
        throughput: {
          jobsPerMinute: jobsLastMinute,
          jobsPerHour: jobsLastHour,
          jobsPerDay: jobsLastDay
        },
        latency,
        reliability: {
          successRate,
          errorRate,
          retryRate
        },
        resources
      }

      // Cache the metrics
      await this.cacheQueueMetrics(queueName, metrics)

      return metrics
    } catch (error) {
      throw new QueueManagementError(
        `Failed to collect metrics for queue ${queueName}: ${error.message}`,
        'METRICS_COLLECTION_ERROR'
      )
    }
  }

  /**
   * Collect system-wide metrics
   */
  async collectSystemMetrics(): Promise<SystemMetrics> {
    try {
      const timestamp = new Date()

      // Redis metrics
      const redisInfo = await this.redis.info()
      const redisMemory = await this.redis.info('memory')
      const redisStats = await this.redis.info('stats')

      const redisMetrics = {
        memoryUsage: this.parseRedisInfo(redisMemory, 'used_memory'),
        connections: this.parseRedisInfo(redisInfo, 'connected_clients'),
        commandsProcessed: this.parseRedisInfo(redisStats, 'total_commands_processed'),
        keyspaceHits: this.parseRedisInfo(redisStats, 'keyspace_hits'),
        keyspaceMisses: this.parseRedisInfo(redisStats, 'keyspace_misses')
      }

      // Database metrics
      const dbMetrics = await this.collectDatabaseMetrics()

      // System metrics (basic implementation - can be enhanced with system monitoring libraries)
      const systemMetrics = await this.collectBasicSystemMetrics()

      const metrics: SystemMetrics = {
        timestamp,
        redis: redisMetrics,
        database: dbMetrics,
        system: systemMetrics
      }

      // Cache system metrics
      await this.cacheSystemMetrics(metrics)

      return metrics
    } catch (error) {
      throw new QueueManagementError(
        `Failed to collect system metrics: ${error.message}`,
        'SYSTEM_METRICS_ERROR'
      )
    }
  }

  /**
   * Get aggregated metrics for a time range
   */
  async getAggregatedMetrics(
    queueName: string,
    timeRange: TimeRange,
    granularity: string = '1h'
  ): Promise<AggregatedMetrics> {
    try {
      const metrics = await this.prisma.queueMetrics.findMany({
        where: {
          queueName,
          timestamp: {
            gte: timeRange.start,
            lte: timeRange.end
          }
        },
        orderBy: {
          timestamp: 'asc'
        }
      })

      // Group metrics by time intervals based on granularity
      const groupedMetrics = this.groupMetricsByGranularity(metrics, granularity)

      const data = groupedMetrics.map(group => ({
        timestamp: group.timestamp,
        throughput: group.throughputPerMinute || 0,
        avgProcessingTime: group.avgProcessingTime || 0,
        successRate: group.successRate || 0,
        errorRate: group.errorRate || 0,
        queueSize: group.waitingCount + group.activeCount + group.delayedCount
      }))

      return {
        queueName,
        timeRange,
        granularity: granularity as any,
        data
      }
    } catch (error) {
      throw new QueueManagementError(
        `Failed to get aggregated metrics: ${error.message}`,
        'AGGREGATION_ERROR'
      )
    }
  }

  /**
   * Calculate percentiles for processing times
   */
  calculatePercentiles(values: number[]): Percentiles {
    if (values.length === 0) {
      return { p50: 0, p75: 0, p90: 0, p95: 0, p99: 0, max: 0 }
    }

    const sorted = values.sort((a, b) => a - b)
    const len = sorted.length

    return {
      p50: this.getPercentile(sorted, 0.5),
      p75: this.getPercentile(sorted, 0.75),
      p90: this.getPercentile(sorted, 0.9),
      p95: this.getPercentile(sorted, 0.95),
      p99: this.getPercentile(sorted, 0.99),
      max: sorted[len - 1]
    }
  }

  /**
   * Export metrics in specified format
   */
  async exportMetrics(
    format: 'csv' | 'json',
    filters: MetricFilters
  ): Promise<ExportResult> {
    try {
      const metrics = await this.prisma.queueMetrics.findMany({
        where: {
          queueName: filters.queueNames ? { in: filters.queueNames } : undefined,
          timestamp: {
            gte: filters.timeRange.start,
            lte: filters.timeRange.end
          }
        },
        orderBy: {
          timestamp: 'asc'
        }
      })

      let data: string | object
      let filename: string

      if (format === 'csv') {
        data = this.convertToCSV(metrics)
        filename = `queue-metrics-${Date.now()}.csv`
      } else {
        data = metrics
        filename = `queue-metrics-${Date.now()}.json`
      }

      return {
        format,
        data,
        filename,
        size: JSON.stringify(data).length
      }
    } catch (error) {
      throw new QueueManagementError(
        `Failed to export metrics: ${error.message}`,
        'EXPORT_ERROR'
      )
    }
  }

  /**
   * Get real-time metrics for dashboard
   */
  async getRealTimeMetrics(): Promise<RealTimeMetrics> {
    const timestamp = new Date()
    const queues: Record<string, any> = {}

    // Collect current state for all registered queues
    for (const [queueName, queue] of this.registeredQueues) {
      try {
        const [waiting, active, completed, failed] = await Promise.all([
          queue.getWaiting(),
          queue.getActive(), 
          queue.getCompleted(),
          queue.getFailed()
        ])

        // Get throughput from cache or calculate
        const cachedMetrics = await this.getCachedQueueMetrics(queueName)
        const throughput = cachedMetrics?.throughput.jobsPerMinute || 0

        queues[queueName] = {
          waiting: waiting.length,
          active: active.length,
          completed: completed.length,
          failed: failed.length,
          throughput
        }
      } catch (error) {
        // Log error but continue with other queues
        console.error(`Error collecting real-time metrics for queue ${queueName}:`, error)
        queues[queueName] = {
          waiting: 0,
          active: 0,
          completed: 0,
          failed: 0,
          throughput: 0
        }
      }
    }

    // Get system metrics
    const systemMetrics = await this.getCachedSystemMetrics()

    return {
      timestamp,
      queues,
      system: {
        cpuUsage: systemMetrics?.system.cpuUsage || 0,
        memoryUsage: systemMetrics?.system.memoryUsage || 0,
        redisConnections: systemMetrics?.redis.connections || 0,
        dbConnections: systemMetrics?.database.connections || 0
      }
    }
  }

  // Private helper methods

  private setupDefaultCollectors(): void {
    // Queue metrics collector
    this.collectors.set('queue', {
      name: 'queue',
      collect: async () => {
        const metrics: Metric[] = []
        for (const queueName of this.registeredQueues.keys()) {
          const queueMetrics = await this.collectQueueMetrics(queueName)
          metrics.push(...this.convertQueueMetricsToMetrics(queueMetrics))
        }
        return metrics
      },
      isEnabled: () => true
    })

    // System metrics collector
    this.collectors.set('system', {
      name: 'system',
      collect: async () => {
        const systemMetrics = await this.collectSystemMetrics()
        return this.convertSystemMetricsToMetrics(systemMetrics)
      },
      isEnabled: () => true
    })
  }

  private setupQueueEventListeners(queueName: string, queue: Queue): void {
    // Listen to job events for real-time metrics
    queue.on('completed', async (job: Job) => {
      await this.recordJobEvent(queueName, 'completed', job)
    })

    queue.on('failed', async (job: Job, error: Error) => {
      await this.recordJobEvent(queueName, 'failed', job, error)
    })

    queue.on('active', async (job: Job) => {
      await this.recordJobEvent(queueName, 'active', job)
    })

    queue.on('waiting', async (job: Job) => {
      await this.recordJobEvent(queueName, 'waiting', job)
    })
  }

  private async collectAllMetrics(): Promise<void> {
    try {
      const allMetrics: Metric[] = []

      // Collect from all registered collectors
      for (const collector of this.collectors.values()) {
        if (collector.isEnabled()) {
          try {
            const metrics = await collector.collect()
            allMetrics.push(...metrics)
          } catch (error) {
            console.error(`Error in collector ${collector.name}:`, error)
          }
        }
      }

      // Store metrics in batches
      if (allMetrics.length > 0) {
        await this.storeMetricsBatch(allMetrics)
      }

      this.emit('metrics_collected', { count: allMetrics.length })
    } catch (error) {
      console.error('Error collecting metrics:', error)
      this.emit('collection_error', error)
    }
  }

  private async storeMetricsBatch(metrics: Metric[]): Promise<void> {
    const batchSize = this.config.batchSize
    
    for (let i = 0; i < metrics.length; i += batchSize) {
      const batch = metrics.slice(i, i + batchSize)
      await this.storeMetrics(batch)
    }
  }

  private async storeMetrics(metrics: Metric[]): Promise<void> {
    // Store queue metrics
    const queueMetrics = metrics.filter(m => m.labels?.type === 'queue')
    if (queueMetrics.length > 0) {
      await this.storeQueueMetrics(queueMetrics)
    }

    // Store job metrics  
    const jobMetrics = metrics.filter(m => m.labels?.type === 'job')
    if (jobMetrics.length > 0) {
      await this.storeJobMetrics(jobMetrics)
    }
  }

  private async storeQueueMetrics(metrics: Metric[]): Promise<void> {
    // Group metrics by queue and timestamp
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

    // Insert into database
    for (const data of grouped.values()) {
      await this.prisma.queueMetrics.create({
        data: {
          queueName: data.queueName,
          timestamp: data.timestamp,
          waitingCount: data.metrics.waiting_jobs || 0,
          activeCount: data.metrics.active_jobs || 0,
          completedCount: data.metrics.completed_jobs || 0,
          failedCount: data.metrics.failed_jobs || 0,
          delayedCount: data.metrics.delayed_jobs || 0,
          throughputPerMinute: data.metrics.throughput_per_minute || 0,
          avgProcessingTime: data.metrics.avg_processing_time || 0,
          successRate: data.metrics.success_rate || 0,
          errorRate: data.metrics.error_rate || 0,
          memoryUsage: data.metrics.memory_usage || 0,
          cpuUsage: data.metrics.cpu_usage || 0
        }
      })
    }
  }

  private async storeJobMetrics(metrics: Metric[]): Promise<void> {
    // Implementation for storing individual job metrics
    // This would be used for detailed job-level analytics
    for (const metric of metrics) {
      if (metric.labels?.jobId) {
        await this.prisma.jobMetrics.upsert({
          where: { jobId: metric.labels.jobId },
          update: {
            [metric.name]: metric.value,
            updatedAt: new Date()
          },
          create: {
            jobId: metric.labels.jobId,
            queueName: metric.labels.queueName || '',
            jobName: metric.labels.jobName || '',
            jobType: metric.labels.jobType || '',
            status: metric.labels.status || 'unknown',
            createdAt: metric.timestamp,
            [metric.name]: metric.value
          }
        })
      }
    }
  }

  private convertQueueMetricsToMetrics(queueMetrics: QueueMetrics): Metric[] {
    const baseLabels = { 
      queueName: queueMetrics.queueName,
      type: 'queue'
    }

    return [
      {
        name: 'throughput_per_minute',
        type: METRIC_TYPES.GAUGE,
        value: queueMetrics.throughput.jobsPerMinute,
        timestamp: queueMetrics.timestamp,
        labels: baseLabels
      },
      {
        name: 'avg_processing_time',
        type: METRIC_TYPES.GAUGE,
        value: queueMetrics.latency.p50,
        timestamp: queueMetrics.timestamp,
        labels: baseLabels
      },
      {
        name: 'success_rate',
        type: METRIC_TYPES.GAUGE,
        value: queueMetrics.reliability.successRate,
        timestamp: queueMetrics.timestamp,
        labels: baseLabels
      },
      {
        name: 'error_rate',
        type: METRIC_TYPES.GAUGE,
        value: queueMetrics.reliability.errorRate,
        timestamp: queueMetrics.timestamp,
        labels: baseLabels
      },
      {
        name: 'memory_usage',
        type: METRIC_TYPES.GAUGE,
        value: queueMetrics.resources.memoryUsage,
        timestamp: queueMetrics.timestamp,
        labels: baseLabels
      }
    ] as Metric[]
  }

  private convertSystemMetricsToMetrics(systemMetrics: SystemMetrics): Metric[] {
    const baseLabels = { type: 'system' }

    return [
      {
        name: 'redis_memory_usage',
        type: METRIC_TYPES.GAUGE,
        value: systemMetrics.redis.memoryUsage,
        timestamp: systemMetrics.timestamp,
        labels: baseLabels
      },
      {
        name: 'redis_connections',
        type: METRIC_TYPES.GAUGE,
        value: systemMetrics.redis.connections,
        timestamp: systemMetrics.timestamp,
        labels: baseLabels
      },
      {
        name: 'system_cpu_usage',
        type: METRIC_TYPES.GAUGE,
        value: systemMetrics.system.cpuUsage,
        timestamp: systemMetrics.timestamp,
        labels: baseLabels
      },
      {
        name: 'system_memory_usage',
        type: METRIC_TYPES.GAUGE,
        value: systemMetrics.system.memoryUsage,
        timestamp: systemMetrics.timestamp,
        labels: baseLabels
      }
    ] as Metric[]
  }

  // Additional helper methods would continue here...
  // Due to length constraints, I'll implement the remaining methods in the next part

  private async getCompletedJobsCount(queueName: string, start: Date, end: Date): Promise<number> {
    const result = await this.prisma.jobMetrics.count({
      where: {
        queueName,
        status: 'completed',
        completedAt: {
          gte: start,
          lte: end
        }
      }
    })
    return result
  }

  private async getTotalJobsCount(queueName: string, start: Date, end: Date): Promise<number> {
    const result = await this.prisma.jobMetrics.count({
      where: {
        queueName,
        createdAt: {
          gte: start,
          lte: end
        }
      }
    })
    return result
  }

  private async getFailedJobsCount(queueName: string, start: Date, end: Date): Promise<number> {
    const result = await this.prisma.jobMetrics.count({
      where: {
        queueName,
        status: 'failed',
        createdAt: {
          gte: start,
          lte: end
        }
      }
    })
    return result
  }

  private async getRetriedJobsCount(queueName: string, start: Date, end: Date): Promise<number> {
    const result = await this.prisma.jobMetrics.count({
      where: {
        queueName,
        attempts: { gt: 1 },
        createdAt: {
          gte: start,
          lte: end
        }
      }
    })
    return result
  }

  private async getProcessingTimes(queueName: string, start: Date, end: Date): Promise<number[]> {
    const jobs = await this.prisma.jobMetrics.findMany({
      where: {
        queueName,
        status: 'completed',
        processingTime: { not: null },
        completedAt: {
          gte: start,
          lte: end
        }
      },
      select: {
        processingTime: true
      }
    })

    return jobs.map(job => job.processingTime || 0)
  }

  private async getQueueResourceUsage(queueName: string): Promise<{ memoryUsage: number; cpuTime: number; ioOperations: number }> {
    // Basic implementation - can be enhanced with actual resource monitoring
    return {
      memoryUsage: 0,
      cpuTime: 0,
      ioOperations: 0
    }
  }

  private parseRedisInfo(info: string, key: string): number {
    const lines = info.split('\r\n')
    const line = lines.find(l => l.startsWith(key + ':'))
    return line ? parseInt(line.split(':')[1]) : 0
  }

  private async collectDatabaseMetrics(): Promise<any> {
    // Basic database metrics - can be enhanced
    return {
      connections: 0,
      activeQueries: 0,
      slowQueries: 0
    }
  }

  private async collectBasicSystemMetrics(): Promise<any> {
    // Basic system metrics - can be enhanced with system monitoring libraries
    return {
      cpuUsage: 0,
      memoryUsage: 0,
      diskUsage: 0,
      networkIO: {
        bytesIn: 0,
        bytesOut: 0
      }
    }
  }

  private async cacheQueueMetrics(queueName: string, metrics: QueueMetrics): Promise<void> {
    const key = CACHE_KEYS.QUEUE_METRICS(queueName, metrics.timestamp.getTime())
    await this.redis.setex(key, 300, JSON.stringify(metrics)) // 5 minutes TTL
  }

  private async getCachedQueueMetrics(queueName: string): Promise<QueueMetrics | null> {
    const timestamp = Math.floor(Date.now() / 60000) * 60000 // Round to minute
    const key = CACHE_KEYS.QUEUE_METRICS(queueName, timestamp)
    const cached = await this.redis.get(key)
    return cached ? JSON.parse(cached) : null
  }

  private async cacheSystemMetrics(metrics: SystemMetrics): Promise<void> {
    const key = 'system:metrics:current'
    await this.redis.setex(key, 300, JSON.stringify(metrics)) // 5 minutes TTL
  }

  private async getCachedSystemMetrics(): Promise<SystemMetrics | null> {
    const key = 'system:metrics:current'
    const cached = await this.redis.get(key)
    return cached ? JSON.parse(cached) : null
  }

  private getPercentile(sortedArray: number[], percentile: number): number {
    const index = percentile * (sortedArray.length - 1)
    const lower = Math.floor(index)
    const upper = Math.ceil(index)
    const weight = index % 1

    if (upper >= sortedArray.length) return sortedArray[sortedArray.length - 1]
    return sortedArray[lower] * (1 - weight) + sortedArray[upper] * weight
  }

  private groupMetricsByGranularity(metrics: any[], granularity: string): any[] {
    // Implementation for grouping metrics by time granularity
    // This is a simplified version - full implementation would handle different granularities
    return metrics
  }

  private convertToCSV(data: any[]): string {
    if (data.length === 0) return ''
    
    const headers = Object.keys(data[0])
    const csvContent = [
      headers.join(','),
      ...data.map(row => headers.map(header => row[header]).join(','))
    ].join('\n')
    
    return csvContent
  }

  private async recordJobEvent(queueName: string, event: string, job: Job, error?: Error): Promise<void> {
    // Record job-level events for real-time metrics
    try {
      const timestamp = new Date()
      
      // Update or create job metrics record
      await this.prisma.jobMetrics.upsert({
        where: { jobId: job.id! },
        update: {
          status: event,
          ...(event === 'completed' && { completedAt: timestamp }),
          ...(event === 'failed' && { error: error?.message }),
          updatedAt: timestamp
        },
        create: {
          jobId: job.id!,
          queueName,
          jobName: job.name,
          jobType: job.name,
          status: event,
          createdAt: job.timestamp ? new Date(job.timestamp) : timestamp,
          ...(event === 'completed' && { completedAt: timestamp }),
          ...(event === 'failed' && { error: error?.message })
        }
      })

      // Emit real-time event
      this.emit('job_event', {
        queueName,
        jobId: job.id,
        event,
        timestamp,
        error: error?.message
      })
    } catch (error) {
      console.error('Error recording job event:', error)
    }
  }
}