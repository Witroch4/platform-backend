/**
 * Metrics System Integration Test
 * 
 * Tests the complete metrics and monitoring system implementation
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals'
import { PrismaClient } from '@prisma/client'
import { getRedisInstance } from '../../connections'
import { MetricsCollectorService } from '../services/metrics-collector.service'
import { MetricsStorageService } from '../services/metrics-storage.service'
import { MetricsAggregatorService } from '../services/metrics-aggregator.service'
import { MetricsManagerService } from '../services/metrics-manager.service'
import { getCacheManager } from '../cache/cache-manager'
import { getMetricsCache } from '../cache/metrics-cache'
import { getCacheOptimizerService } from '../cache/cache-optimizer'

describe('Metrics System Integration', () => {
  let prisma: PrismaClient
  let redis: ReturnType<typeof getRedisInstance>
  let metricsManager: MetricsManagerService

  beforeAll(async () => {
    // Initialize test database and Redis connections
    prisma = new PrismaClient({
      datasources: {
        db: {
          url: process.env.TEST_DATABASE_URL || process.env.DATABASE_URL
        }
      }
    })
    
    redis = getRedisInstance()

    // Initialize metrics manager
    metricsManager = MetricsManagerService.getInstance(prisma, redis)
    await metricsManager.initialize()
  })

  afterAll(async () => {
    await prisma.$disconnect()
    // Não precisa desconectar redis pois é singleton global
  })

  describe('MetricsCollectorService', () => {
    it('should collect system metrics', async () => {
      const collector = MetricsCollectorService.getInstance(redis, prisma)
      
      const systemMetrics = await collector.collectSystemMetrics()
      
      expect(systemMetrics).toBeDefined()
      expect(systemMetrics.timestamp).toBeInstanceOf(Date)
      expect(systemMetrics.redis).toBeDefined()
      expect(systemMetrics.database).toBeDefined()
      expect(systemMetrics.system).toBeDefined()
    })

    it('should calculate percentiles correctly', async () => {
      const collector = MetricsCollectorService.getInstance(redis, prisma)
      
      const values = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]
      const percentiles = collector.calculatePercentiles(values)
      
      expect(percentiles.p50).toBe(55) // Median
      expect(percentiles.p95).toBe(95)
      expect(percentiles.p99).toBe(99)
      expect(percentiles.max).toBe(100)
    })

    it('should handle empty values array', async () => {
      const collector = MetricsCollectorService.getInstance(redis, prisma)
      
      const percentiles = collector.calculatePercentiles([])
      
      expect(percentiles.p50).toBe(0)
      expect(percentiles.p95).toBe(0)
      expect(percentiles.p99).toBe(0)
      expect(percentiles.max).toBe(0)
    })
  })

  describe('MetricsStorageService', () => {
    it('should get storage statistics', async () => {
      const storage = MetricsStorageService.getInstance(prisma, redis)
      
      const stats = await storage.getStorageStats()
      
      expect(stats).toBeDefined()
      expect(typeof stats.totalRecords).toBe('number')
      expect(typeof stats.storageSize).toBe('number')
      expect(typeof stats.partitionCount).toBe('number')
      expect(typeof stats.indexHealth).toBe('number')
      expect(typeof stats.queryPerformance).toBe('number')
    })

    it('should handle partition management', async () => {
      const storage = MetricsStorageService.getInstance(prisma, redis)
      
      const startDate = new Date()
      const endDate = new Date(startDate.getTime() + 30 * 24 * 60 * 60 * 1000) // 30 days later
      
      // This should not throw an error
      await expect(
        storage.createPartition('queue_metrics', startDate, endDate)
      ).resolves.not.toThrow()
    })
  })

  describe('MetricsAggregatorService', () => {
    it('should calculate moving averages', async () => {
      const aggregator = MetricsAggregatorService.getInstance(prisma, redis)
      
      const timeRange = {
        start: new Date(Date.now() - 60 * 60 * 1000), // 1 hour ago
        end: new Date()
      }
      
      const config = {
        windowSize: 5,
        type: 'simple' as const
      }
      
      // This should not throw an error even with no data
      await expect(
        aggregator.calculateMovingAverage('test-queue', 'throughput', timeRange, config)
      ).resolves.not.toThrow()
    })

    it('should handle trend calculation', async () => {
      const aggregator = MetricsAggregatorService.getInstance(prisma, redis)
      
      const timeRange = {
        start: new Date(Date.now() - 60 * 60 * 1000), // 1 hour ago
        end: new Date()
      }
      
      const trend = await aggregator.calculateTrend('test-queue', 'throughput', timeRange)
      
      expect(trend).toBeDefined()
      expect(typeof trend.slope).toBe('number')
      expect(typeof trend.intercept).toBe('number')
      expect(typeof trend.correlation).toBe('number')
      expect(['increasing', 'decreasing', 'stable']).toContain(trend.direction)
      expect(typeof trend.confidence).toBe('number')
    })
  })

  describe('Cache System', () => {
    it('should manage cache operations', async () => {
      const cacheManager = getCacheManager()
      
      // Test basic cache operations
      await cacheManager.set('test:key', { value: 'test' }, { ttl: 60 })
      const cached = await cacheManager.get('test:key')
      
      expect(cached).toEqual({ value: 'test' })
      
      // Test deletion
      const deleted = await cacheManager.delete('test:key')
      expect(deleted).toBe(true)
      
      // Verify deletion
      const afterDelete = await cacheManager.get('test:key')
      expect(afterDelete).toBeNull()
    })

    it('should handle metrics cache operations', async () => {
      const metricsCache = getMetricsCache()
      
      const testMetrics = {
        queueName: 'test-queue',
        timestamp: new Date(),
        throughput: { jobsPerMinute: 10, jobsPerHour: 600, jobsPerDay: 14400 },
        latency: { p50: 100, p95: 500, p99: 1000, max: 2000 },
        reliability: { successRate: 0.95, errorRate: 0.05, retryRate: 0.02 },
        resources: { memoryUsage: 1024, cpuTime: 500, ioOperations: 100 }
      }
      
      const timestamp = Date.now()
      await metricsCache.setQueueMetrics('test-queue', timestamp, testMetrics)
      
      const retrieved = await metricsCache.getQueueMetrics('test-queue', timestamp)
      expect(retrieved).toEqual(testMetrics)
    })

    it('should optimize cache performance', async () => {
      const optimizer = getCacheOptimizerService()
      
      const metrics = optimizer.getMetrics()
      expect(metrics).toBeDefined()
      expect(typeof metrics.hitRate).toBe('number')
      expect(typeof metrics.memoryUsage).toBe('number')
      
      // Test optimization (should not throw)
      await expect(optimizer.forceOptimization()).resolves.not.toThrow()
    })
  })

  describe('MetricsManagerService', () => {
    it('should get system health', async () => {
      const health = await metricsManager.getSystemHealth()
      
      expect(health).toBeDefined()
      expect(['healthy', 'warning', 'critical']).toContain(health.status)
      expect(health.components).toBeDefined()
      expect(health.lastUpdate).toBeInstanceOf(Date)
    })

    it('should get real-time metrics', async () => {
      const realTimeMetrics = await metricsManager.getRealTimeMetrics()
      
      expect(realTimeMetrics).toBeDefined()
      expect(realTimeMetrics.timestamp).toBeInstanceOf(Date)
      expect(realTimeMetrics.queues).toBeDefined()
      expect(realTimeMetrics.system).toBeDefined()
    })

    it('should get storage statistics', async () => {
      const stats = await metricsManager.getStorageStats()
      
      expect(stats).toBeDefined()
      expect(typeof stats.totalRecords).toBe('number')
      expect(typeof stats.storageSize).toBe('number')
      expect(typeof stats.partitionCount).toBe('number')
    })

    it('should handle cleanup operations', async () => {
      const result = await metricsManager.cleanupOldData()
      
      expect(result).toBeDefined()
      expect(typeof result.deletedRecords).toBe('number')
      expect(typeof result.freedSpace).toBe('number')
    })
  })

  describe('Integration Tests', () => {
    it('should handle complete metrics workflow', async () => {
      // This test verifies the complete workflow from collection to storage to aggregation
      
      // 1. Collect system metrics
      const systemMetrics = await metricsManager.getRealTimeMetrics()
      expect(systemMetrics).toBeDefined()
      
      // 2. Get dashboard metrics
      const dashboardMetrics = await metricsManager.getDashboardMetrics()
      expect(dashboardMetrics).toBeDefined()
      expect(dashboardMetrics.overview).toBeDefined()
      expect(dashboardMetrics.systemMetrics).toBeDefined()
      
      // 3. Test storage operations
      const storageStats = await metricsManager.getStorageStats()
      expect(storageStats).toBeDefined()
      
      // 4. Test optimization
      await expect(metricsManager.optimizeStorage()).resolves.not.toThrow()
    })

    it('should handle error conditions gracefully', async () => {
      // Test with invalid queue name
      const timeRange = {
        start: new Date(Date.now() - 60 * 60 * 1000),
        end: new Date()
      }
      
      // Should not throw, but return empty or default data
      await expect(
        metricsManager.getAggregatedMetrics('non-existent-queue', timeRange)
      ).resolves.not.toThrow()
    })
  })
})