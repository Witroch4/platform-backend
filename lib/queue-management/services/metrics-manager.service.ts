/**
 * Metrics Manager Service
 * 
 * Orchestrates all metrics-related services including collection, storage,
 * aggregation, and anomaly detection. Provides a unified interface for
 * metrics operations.
 */

import { PrismaClient } from '@prisma/client'
import { getRedisInstance } from '../../../lib/connections'
import { Queue } from 'bullmq'
import { EventEmitter } from 'events'
import { 
  MetricsCollectorService,
  MetricsStorageService,
  MetricsAggregatorService,
  AnomalyDetectorService
} from './index'
import { 
  QueueMetrics,
  SystemMetrics,
  AggregatedMetrics,
  Anomaly,
  TrendPrediction,
  TimeRange,
  MetricFilters,
  ExportResult,
  RealTimeMetrics,
  DashboardMetrics,
  PerformanceBaseline
} from '../types/metrics.types'
import { getQueueManagementConfig } from '../config'
import { QueueManagementError } from '../errors'

interface MetricsManagerConfig {
  collectionEnabled: boolean
  anomalyDetectionEnabled: boolean
  realTimeUpdatesEnabled: boolean
  exportEnabled: boolean
}

export class MetricsManagerService extends EventEmitter {
  private static instance: MetricsManagerService | null = null
  private collector!: MetricsCollectorService
  private storage!: MetricsStorageService
  private aggregator!: MetricsAggregatorService
  private anomalyDetector!: AnomalyDetectorService
  private config: MetricsManagerConfig
  private isInitialized = false

  constructor(
    private prisma: PrismaClient,
    private redis: ReturnType<typeof getRedisInstance>
  ) {
    super()
    
    const queueConfig = getQueueManagementConfig()
    this.config = {
      collectionEnabled: queueConfig.metrics.enabled,
      anomalyDetectionEnabled: queueConfig.features.machineLearning,
      realTimeUpdatesEnabled: true,
      exportEnabled: true
    }

    this.initializeServices()
  }

  /**
   * Get singleton instance
   */
  static getInstance(prisma?: PrismaClient, redis?: ReturnType<typeof getRedisInstance>): MetricsManagerService {
    if (!MetricsManagerService.instance) {
      if (!prisma || !redis) {
        throw new QueueManagementError(
          'Prisma and Redis instances required for first initialization',
          'INITIALIZATION_ERROR'
        )
      }
      MetricsManagerService.instance = new MetricsManagerService(prisma, redis)
    }
    return MetricsManagerService.instance
  }

  /**
   * Initialize the metrics system
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return
    }

    try {
      // Start metrics collection if enabled
      if (this.config.collectionEnabled) {
        this.collector.startCollection()
      }

      // Setup event listeners
      this.setupEventListeners()

      this.isInitialized = true
      this.emit('initialized')

    } catch (error) {
      throw new QueueManagementError(
        `Failed to initialize metrics manager: ${(error instanceof Error ? error.message : "Unknown error")}`,
        'INITIALIZATION_ERROR'
      )
    }
  }

  /**
   * Register a queue for metrics collection
   */
  async registerQueue(queueName: string, queue: Queue): Promise<void> {
    try {
      this.collector.registerQueue(queueName, queue)
      this.emit('queue_registered', { queueName })
    } catch (error) {
      throw new QueueManagementError(
        `Failed to register queue ${queueName}: ${(error instanceof Error ? error.message : "Unknown error")}`,
        'QUEUE_REGISTRATION_ERROR'
      )
    }
  }

  /**
   * Unregister a queue from metrics collection
   */
  async unregisterQueue(queueName: string): Promise<void> {
    try {
      this.collector.unregisterQueue(queueName)
      this.emit('queue_unregistered', { queueName })
    } catch (error) {
      throw new QueueManagementError(
        `Failed to unregister queue ${queueName}: ${(error instanceof Error ? error.message : "Unknown error")}`,
        'QUEUE_UNREGISTRATION_ERROR'
      )
    }
  }

  /**
   * Get real-time metrics for dashboard
   */
  async getRealTimeMetrics(): Promise<RealTimeMetrics> {
    try {
      return await this.collector.getRealTimeMetrics()
    } catch (error) {
      throw new QueueManagementError(
        `Failed to get real-time metrics: ${(error instanceof Error ? error.message : "Unknown error")}`,
        'REAL_TIME_METRICS_ERROR'
      )
    }
  }

  /**
   * Get comprehensive dashboard metrics
   */
  async getDashboardMetrics(): Promise<DashboardMetrics> {
    try {
      const realTimeMetrics = await this.getRealTimeMetrics()
      const systemMetrics = await this.collector.collectSystemMetrics()
      
      // Calculate overview metrics
      const queueNames = Object.keys(realTimeMetrics.queues)
      let totalJobs = 0
      let activeJobs = 0
      let failedJobs = 0
      let totalThroughput = 0

      const queueMetrics: Array<{
        queueName: string;
        status: string;
        jobCount: number;
        throughput: number;
        errorRate: number;
        avgProcessingTime: number;
      }> = []
      
      for (const queueName of queueNames) {
        const queueData = realTimeMetrics.queues[queueName]
        const queueHealth = await this.getQueueHealth(queueName)
        
        totalJobs += queueData.waiting + queueData.active + queueData.completed + queueData.failed
        activeJobs += queueData.active
        failedJobs += queueData.failed
        totalThroughput += queueData.throughput

        queueMetrics.push({
          queueName,
          status: queueHealth.status,
          jobCount: queueData.waiting + queueData.active + queueData.completed + queueData.failed,
          throughput: queueData.throughput,
          errorRate: queueHealth.performance.errorRate,
          avgProcessingTime: queueHealth.performance.avgProcessingTime
        })
      }

      // Get recent alerts
      const alerts = await this.getRecentAlerts(10)

      // Determine system health
      const systemHealth = this.calculateSystemHealth(queueMetrics, systemMetrics)

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
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? (error instanceof Error ? error.message : "Unknown error") : 'Unknown error occurred';
      throw new QueueManagementError(
        `Failed to get dashboard metrics: ${errorMessage}`,
        'DASHBOARD_METRICS_ERROR'
      )
    }
  }

  /**
   * Get aggregated metrics for a specific queue and time range
   */
  async getAggregatedMetrics(
    queueName: string,
    timeRange: TimeRange,
    granularity: string = '1h'
  ): Promise<AggregatedMetrics> {
    try {
      return await this.aggregator.getAggregatedData(queueName, timeRange, granularity)
    } catch (error) {
      const errorMessage = error instanceof Error ? (error instanceof Error ? error.message : "Unknown error") : 'Unknown error occurred';
      throw new QueueManagementError(
        `Failed to get aggregated metrics: ${errorMessage}`,
        'AGGREGATED_METRICS_ERROR'
      )
    }
  }

  /**
   * Get trend analysis for a specific metric
   */
  async getTrendAnalysis(
    queueName: string,
    metric: string,
    timeRange: TimeRange
  ): Promise<TrendPrediction> {
    try {
      // Get historical metrics
      const metrics = await this.getHistoricalMetrics(queueName, metric, timeRange)
      
      // Analyze trends
      return await this.anomalyDetector.analyze(metrics)
    } catch (error) {
      const errorMessage = error instanceof Error ? (error instanceof Error ? error.message : "Unknown error") : 'Unknown error occurred';
      throw new QueueManagementError(
        `Failed to get trend analysis: ${errorMessage}`,
        'TREND_ANALYSIS_ERROR'
      )
    }
  }

  /**
   * Detect anomalies in recent metrics
   */
  async detectAnomalies(timeRange?: TimeRange): Promise<Anomaly[]> {
    try {
      if (!this.config.anomalyDetectionEnabled) {
        return []
      }

      // Get recent metrics if no time range specified
      const range = timeRange || {
        start: new Date(Date.now() - 60 * 60 * 1000), // Last hour
        end: new Date()
      }

      const metrics = await this.getAllMetricsInRange(range)
      return await this.anomalyDetector.detect(metrics)
    } catch (error) {
      const errorMessage = error instanceof Error ? (error instanceof Error ? error.message : "Unknown error") : 'Unknown error occurred';
      throw new QueueManagementError(
        `Failed to detect anomalies: ${errorMessage}`,
        'ANOMALY_DETECTION_ERROR'
      )
    }
  }

  /**
   * Create performance baseline for a queue metric
   */
  async createBaseline(
    queueName: string,
    metric: string,
    timeRange: TimeRange
  ): Promise<PerformanceBaseline> {
    try {
      return await this.anomalyDetector.createBaseline(queueName, metric, timeRange)
    } catch (error) {
      const errorMessage = error instanceof Error ? (error instanceof Error ? error.message : "Unknown error") : 'Unknown error occurred';
      throw new QueueManagementError(
        `Failed to create baseline: ${errorMessage}`,
        'BASELINE_CREATION_ERROR'
      )
    }
  }

  /**
   * Export metrics data
   */
  async exportMetrics(
    format: 'csv' | 'json',
    filters: MetricFilters
  ): Promise<ExportResult> {
    try {
      if (!this.config.exportEnabled) {
        throw new QueueManagementError(
          'Metrics export is disabled',
          'EXPORT_DISABLED'
        )
      }

      return await this.collector.exportMetrics(format, filters)
    } catch (error) {
      const errorMessage = error instanceof Error ? (error instanceof Error ? error.message : "Unknown error") : 'Unknown error occurred';
      throw new QueueManagementError(
        `Failed to export metrics: ${errorMessage}`,
        'EXPORT_ERROR'
      )
    }
  }

  /**
   * Get storage statistics
   */
  async getStorageStats(): Promise<{
    totalRecords: number
    storageSize: number
    partitionCount: number
    indexHealth: number
    queryPerformance: number
  }> {
    try {
      return await this.storage.getStorageStats()
    } catch (error) {
      const errorMessage = error instanceof Error ? (error instanceof Error ? error.message : "Unknown error") : 'Unknown error occurred';
      throw new QueueManagementError(
        `Failed to get storage stats: ${errorMessage}`,
        'STORAGE_STATS_ERROR'
      )
    }
  }

  /**
   * Cleanup old metrics data
   */
  async cleanupOldData(): Promise<{ deletedRecords: number; freedSpace: number }> {
    try {
      const storageCleanup = await this.storage.cleanupOldData()
      const aggregationCleanup = await this.aggregator.cleanupOldAggregations()
      
      return {
        deletedRecords: storageCleanup.deletedRecords + aggregationCleanup.deletedRecords,
        freedSpace: storageCleanup.freedSpace
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? (error instanceof Error ? error.message : "Unknown error") : 'Unknown error occurred';
      throw new QueueManagementError(
        `Failed to cleanup old data: ${errorMessage}`,
        'CLEANUP_ERROR'
      )
    }
  }

  /**
   * Optimize storage performance
   */
  async optimizeStorage(): Promise<void> {
    try {
      await this.storage.optimizeIndexes()
      await this.aggregator.preAggregateData()
    } catch (error) {
      const errorMessage = error instanceof Error ? (error instanceof Error ? error.message : "Unknown error") : 'Unknown error occurred';
      throw new QueueManagementError(
        `Failed to optimize storage: ${errorMessage}`,
        'OPTIMIZATION_ERROR'
      )
    }
  }

  /**
   * Get health status of the metrics system
   */
  async getSystemHealth(): Promise<{
    status: 'healthy' | 'warning' | 'critical'
    components: Record<string, { status: string; message?: string }>
    lastUpdate: Date
  }> {
    try {
      const components: Record<string, { status: string; message?: string }> = {}

      // Check collector health
      components.collector = {
        status: this.collector.listenerCount('error') === 0 ? 'healthy' : 'warning'
      }

      // Check storage health
      const storageStats = await this.getStorageStats()
      components.storage = {
        status: storageStats.indexHealth > 0.8 ? 'healthy' : 'warning',
        message: `Index health: ${(storageStats.indexHealth * 100).toFixed(1)}%`
      }

      // Check Redis connectivity
      try {
        await this.redis.ping()
        components.cache = { status: 'healthy' }
      } catch (error) {
        components.cache = { status: 'critical', message: 'Redis connection failed' }
      }

      // Check database connectivity
      try {
        await this.prisma.$queryRaw`SELECT 1`
        components.database = { status: 'healthy' }
      } catch (error) {
        components.database = { status: 'critical', message: 'Database connection failed' }
      }

      // Determine overall status
      const statuses = Object.values(components).map(c => c.status)
      let overallStatus: 'healthy' | 'warning' | 'critical' = 'healthy'
      
      if (statuses.includes('critical')) {
        overallStatus = 'critical'
      } else if (statuses.includes('warning')) {
        overallStatus = 'warning'
      }

      return {
        status: overallStatus,
        components,
        lastUpdate: new Date()
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? (error instanceof Error ? error.message : "Unknown error") : 'Unknown error occurred';
      return {
        status: 'critical',
        components: {
          system: { status: 'critical', message: errorMessage }
        },
        lastUpdate: new Date()
      }
    }
  }

  // Private helper methods

  private initializeServices(): void {
    this.collector = MetricsCollectorService.getInstance(this.redis, this.prisma)
    this.storage = MetricsStorageService.getInstance(this.prisma, this.redis)
    this.aggregator = MetricsAggregatorService.getInstance(this.prisma, this.redis)
    this.anomalyDetector = AnomalyDetectorService.getInstance(this.prisma, this.redis)
  }

  private setupEventListeners(): void {
    // Forward events from child services
    this.collector.on('metrics_collected', (data) => {
      this.emit('metrics_collected', data)
    })

    this.collector.on('collection_error', (error) => {
      this.emit('collection_error', error)
    })

    this.anomalyDetector.on('anomalies_detected', (anomalies) => {
      this.emit('anomalies_detected', anomalies)
    })

    this.aggregator.on('pre_aggregation_completed', (data) => {
      this.emit('pre_aggregation_completed', data)
    })
  }

  private async getQueueHealth(queueName: string): Promise<any> {
    // Get queue health from collector
    return await this.collector.collectQueueMetrics(queueName)
  }

  private async getRecentAlerts(limit: number): Promise<Array<{
    id: string
    severity: string
    title: string
    queueName?: string
    createdAt: Date
  }>> {
    // Get recent alerts from cache or database
    try {
      const cached = await this.redis.get('anomalies:latest')
      if (cached) {
        const anomalies: Anomaly[] = JSON.parse(cached)
        return anomalies.slice(0, limit).map(anomaly => ({
          id: anomaly.id,
          severity: anomaly.severity,
          title: `${anomaly.metric} anomaly in ${anomaly.queueName}`,
          queueName: anomaly.queueName,
          createdAt: anomaly.timestamp
        }))
      }
    } catch (error) {
      console.error('Failed to get recent alerts:', error)
    }
    
    return []
  }

  private calculateSystemHealth(
    queueMetrics: any[],
    systemMetrics: SystemMetrics
  ): 'healthy' | 'warning' | 'critical' {
    // Calculate overall system health based on queue and system metrics
    const avgErrorRate = queueMetrics.reduce((sum, q) => sum + q.errorRate, 0) / queueMetrics.length
    const avgProcessingTime = queueMetrics.reduce((sum, q) => sum + q.avgProcessingTime, 0) / queueMetrics.length
    
    if (avgErrorRate > 0.15 || avgProcessingTime > 30000 || systemMetrics.system.cpuUsage > 0.9) {
      return 'critical'
    }
    
    if (avgErrorRate > 0.05 || avgProcessingTime > 10000 || systemMetrics.system.cpuUsage > 0.7) {
      return 'warning'
    }
    
    return 'healthy'
  }

  private calculateAverageProcessingTime(queueMetrics: any[]): number {
    if (queueMetrics.length === 0) return 0
    return queueMetrics.reduce((sum, q) => sum + q.avgProcessingTime, 0) / queueMetrics.length
  }

  private async getHistoricalMetrics(
    queueName: string,
    metric: string,
    timeRange: TimeRange
  ): Promise<any[]> {
    // Get historical metrics from storage
    const query = {
      queueNames: [queueName],
      metricNames: [metric],
      timeRange,
      limit: 1000
    }
    
    return await this.storage.query(query)
  }

  private async getAllMetricsInRange(timeRange: TimeRange): Promise<any[]> {
    // Get all metrics in the specified time range
    const query = {
      timeRange,
      limit: 10000
    }
    
    return await this.storage.query(query)
  }
}
