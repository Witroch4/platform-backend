/**
 * Queue Management - Metrics Cache
 * 
 * Specialized cache for metrics and analytics data
 */

import { getCacheManager, CacheManager } from './cache-manager'
import { CACHE_KEYS } from '../constants'
import { QueueMetrics, SystemMetrics, AggregatedMetrics, Percentiles } from '../types/metrics.types'

export class MetricsCache {
  private cache: CacheManager

  constructor(cacheManager?: CacheManager) {
    this.cache = cacheManager || getCacheManager()
  }

  /**
   * Cache queue metrics
   */
  async setQueueMetrics(queueName: string, timestamp: number, metrics: QueueMetrics, ttl: number = 300): Promise<boolean> {
    const key = CACHE_KEYS.QUEUE_METRICS(queueName, timestamp)
    return this.cache.set(key, metrics, { ttl })
  }

  /**
   * Get cached queue metrics
   */
  async getQueueMetrics(queueName: string, timestamp: number): Promise<QueueMetrics | null> {
    const key = CACHE_KEYS.QUEUE_METRICS(queueName, timestamp)
    return this.cache.get<QueueMetrics>(key)
  }

  /**
   * Cache system metrics
   */
  async setSystemMetrics(timestamp: number, metrics: SystemMetrics, ttl: number = 300): Promise<boolean> {
    const key = `system:metrics:${timestamp}`
    return this.cache.set(key, metrics, { ttl })
  }

  /**
   * Get cached system metrics
   */
  async getSystemMetrics(timestamp: number): Promise<SystemMetrics | null> {
    const key = `system:metrics:${timestamp}`
    return this.cache.get<SystemMetrics>(key)
  }

  /**
   * Cache aggregated metrics
   */
  async setAggregatedMetrics(queueName: string, granularity: string, startTime: number, metrics: AggregatedMetrics, ttl: number = 600): Promise<boolean> {
    const key = `metrics:aggregated:${queueName}:${granularity}:${startTime}`
    return this.cache.set(key, metrics, { ttl })
  }

  /**
   * Get cached aggregated metrics
   */
  async getAggregatedMetrics(queueName: string, granularity: string, startTime: number): Promise<AggregatedMetrics | null> {
    const key = `metrics:aggregated:${queueName}:${granularity}:${startTime}`
    return this.cache.get<AggregatedMetrics>(key)
  }

  /**
   * Cache percentiles
   */
  async setPercentiles(queueName: string, metric: string, timeRange: string, percentiles: Percentiles, ttl: number = 600): Promise<boolean> {
    const key = `metrics:percentiles:${queueName}:${metric}:${timeRange}`
    return this.cache.set(key, percentiles, { ttl })
  }

  /**
   * Get cached percentiles
   */
  async getPercentiles(queueName: string, metric: string, timeRange: string): Promise<Percentiles | null> {
    const key = `metrics:percentiles:${queueName}:${metric}:${timeRange}`
    return this.cache.get<Percentiles>(key)
  }

  /**
   * Cache real-time metrics
   */
  async setRealTimeMetrics(data: Record<string, any>, ttl: number = 30): Promise<boolean> {
    const key = 'metrics:realtime'
    return this.cache.set(key, data, { ttl })
  }

  /**
   * Get cached real-time metrics
   */
  async getRealTimeMetrics(): Promise<Record<string, any> | null> {
    const key = 'metrics:realtime'
    return this.cache.get<Record<string, any>>(key)
  }

  /**
   * Add metric data point to time series
   */
  async addMetricDataPoint(queueName: string, metric: string, timestamp: number, value: number): Promise<number> {
    const key = `metrics:timeseries:${queueName}:${metric}`
    return this.cache.addToSortedSet(key, timestamp, value.toString())
  }

  /**
   * Get metric time series data
   */
  async getMetricTimeSeries(queueName: string, metric: string, since: number, until: number = Date.now()): Promise<Array<{ timestamp: number; value: number }>> {
    const key = `metrics:timeseries:${queueName}:${metric}`
    const results = await this.cache.getSortedSetRange(key, 0, -1, true)
    
    const timeSeries: Array<{ timestamp: number; value: number }> = []
    for (let i = 0; i < results.length; i += 2) {
      const value = parseFloat(results[i])
      const timestamp = parseInt(results[i + 1])
      
      if (timestamp >= since && timestamp <= until) {
        timeSeries.push({ timestamp, value })
      }
    }
    
    return timeSeries.sort((a, b) => a.timestamp - b.timestamp)
  }

  /**
   * Cache metric summary
   */
  async setMetricSummary(queueName: string, metric: string, period: string, summary: { avg: number; min: number; max: number; count: number }, ttl: number = 300): Promise<boolean> {
    const key = `metrics:summary:${queueName}:${metric}:${period}`
    return this.cache.set(key, summary, { ttl })
  }

  /**
   * Get cached metric summary
   */
  async getMetricSummary(queueName: string, metric: string, period: string): Promise<{ avg: number; min: number; max: number; count: number } | null> {
    const key = `metrics:summary:${queueName}:${metric}:${period}`
    return this.cache.get<{ avg: number; min: number; max: number; count: number }>(key)
  }

  /**
   * Cache throughput data
   */
  async setThroughputData(queueName: string, period: string, throughput: number, ttl: number = 300): Promise<boolean> {
    const key = `metrics:throughput:${queueName}:${period}`
    return this.cache.set(key, throughput, { ttl })
  }

  /**
   * Get cached throughput data
   */
  async getThroughputData(queueName: string, period: string): Promise<number | null> {
    const key = `metrics:throughput:${queueName}:${period}`
    return this.cache.get<number>(key)
  }

  /**
   * Cache error rate data
   */
  async setErrorRateData(queueName: string, period: string, errorRate: number, ttl: number = 300): Promise<boolean> {
    const key = `metrics:errorrate:${queueName}:${period}`
    return this.cache.set(key, errorRate, { ttl })
  }

  /**
   * Get cached error rate data
   */
  async getErrorRateData(queueName: string, period: string): Promise<number | null> {
    const key = `metrics:errorrate:${queueName}:${period}`
    return this.cache.get<number>(key)
  }

  /**
   * Cache processing time statistics
   */
  async setProcessingTimeStats(queueName: string, period: string, stats: { avg: number; p50: number; p95: number; p99: number }, ttl: number = 300): Promise<boolean> {
    const key = `metrics:processing:${queueName}:${period}`
    return this.cache.set(key, stats, { ttl })
  }

  /**
   * Get cached processing time statistics
   */
  async getProcessingTimeStats(queueName: string, period: string): Promise<{ avg: number; p50: number; p95: number; p99: number } | null> {
    const key = `metrics:processing:${queueName}:${period}`
    return this.cache.get<{ avg: number; p50: number; p95: number; p99: number }>(key)
  }

  /**
   * Cache dashboard metrics
   */
  async setDashboardMetrics(metrics: Record<string, any>, ttl: number = 60): Promise<boolean> {
    const key = 'metrics:dashboard'
    return this.cache.set(key, metrics, { ttl })
  }

  /**
   * Get cached dashboard metrics
   */
  async getDashboardMetrics(): Promise<Record<string, any> | null> {
    const key = 'metrics:dashboard'
    return this.cache.get<Record<string, any>>(key)
  }

  /**
   * Cache metric comparison data
   */
  async setMetricComparison(queueName: string, metric: string, comparisonId: string, data: Record<string, any>, ttl: number = 600): Promise<boolean> {
    const key = `metrics:comparison:${queueName}:${metric}:${comparisonId}`
    return this.cache.set(key, data, { ttl })
  }

  /**
   * Get cached metric comparison data
   */
  async getMetricComparison(queueName: string, metric: string, comparisonId: string): Promise<Record<string, any> | null> {
    const key = `metrics:comparison:${queueName}:${metric}:${comparisonId}`
    return this.cache.get<Record<string, any>>(key)
  }

  /**
   * Cache baseline metrics
   */
  async setBaselineMetrics(queueName: string, metric: string, baseline: { value: number; threshold: { warning: number; critical: number } }, ttl: number = 3600): Promise<boolean> {
    const key = `metrics:baseline:${queueName}:${metric}`
    return this.cache.set(key, baseline, { ttl })
  }

  /**
   * Get cached baseline metrics
   */
  async getBaselineMetrics(queueName: string, metric: string): Promise<{ value: number; threshold: { warning: number; critical: number } } | null> {
    const key = `metrics:baseline:${queueName}:${metric}`
    return this.cache.get<{ value: number; threshold: { warning: number; critical: number } }>(key)
  }

  /**
   * Increment metric counter
   */
  async incrementMetricCounter(queueName: string, metric: string, by: number = 1): Promise<number> {
    const key = `metrics:counter:${queueName}:${metric}`
    return this.cache.increment(key, by)
  }

  /**
   * Get metric counter value
   */
  async getMetricCounter(queueName: string, metric: string): Promise<number> {
    const key = `metrics:counter:${queueName}:${metric}`
    const value = await this.cache.get<number>(key)
    return value || 0
  }

  /**
   * Reset metric counter
   */
  async resetMetricCounter(queueName: string, metric: string): Promise<boolean> {
    const key = `metrics:counter:${queueName}:${metric}`
    return this.cache.delete(key)
  }

  /**
   * Cache metric alerts status
   */
  async setMetricAlertStatus(queueName: string, metric: string, status: { triggered: boolean; lastTriggered?: number; count: number }, ttl: number = 300): Promise<boolean> {
    const key = `metrics:alert:${queueName}:${metric}`
    return this.cache.set(key, status, { ttl })
  }

  /**
   * Get cached metric alert status
   */
  async getMetricAlertStatus(queueName: string, metric: string): Promise<{ triggered: boolean; lastTriggered?: number; count: number } | null> {
    const key = `metrics:alert:${queueName}:${metric}`
    return this.cache.get<{ triggered: boolean; lastTriggered?: number; count: number }>(key)
  }

  /**
   * Invalidate metrics cache for a queue
   */
  async invalidateQueueMetrics(queueName: string): Promise<number> {
    const pattern = `metrics:*:${queueName}:*`
    return this.cache.deletePattern(pattern)
  }

  /**
   * Invalidate all metrics cache
   */
  async invalidateAllMetrics(): Promise<number> {
    return this.cache.deletePattern('metrics:*')
  }

  /**
   * Clean up old metric data points
   */
  async cleanupOldMetrics(olderThan: number): Promise<number> {
    // This would typically be implemented with a background job
    // For now, we'll just return 0 as a placeholder
    return 0
  }
}

// Singleton instance
let metricsCache: MetricsCache | null = null

/**
 * Get metrics cache instance
 */
export function getMetricsCache(): MetricsCache {
  if (!metricsCache) {
    metricsCache = new MetricsCache()
  }
  return metricsCache
}

/**
 * Set metrics cache instance (useful for testing)
 */
export function setMetricsCache(cache: MetricsCache): void {
  metricsCache = cache
}

export default getMetricsCache