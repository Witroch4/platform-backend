/**
 * Anomaly Detector Service
 * 
 * Implements statistical anomaly detection algorithms, trend analysis with linear regression,
 * seasonal pattern detection, and automatic baseline establishment for queue metrics.
 */

import { getPrismaInstance } from "@/lib/connections"
import { getRedisInstance } from '../../connections'
import { EventEmitter } from 'events'
import { 
  Anomaly,
  AnomalyDetector,
  TrendPrediction,
  TrendAnalyzer,
  Metric,
  TimeRange,
  PerformanceBaseline
} from '../types/metrics.types'
import { getQueueManagementConfig } from '../config'
import { QueueManagementError } from '../errors'
import { ALERT_SEVERITIES } from '../constants'

interface AnomalyDetectionConfig {
  algorithms: string[]
  sensitivity: number
  minDataPoints: number
  baselineWindow: number // days
  seasonalityWindow: number // days
}

interface StatisticalBaseline {
  mean: number
  standardDeviation: number
  median: number
  q1: number
  q3: number
  iqr: number
  outlierThreshold: number
}

interface SeasonalPattern {
  period: number // hours
  amplitude: number
  phase: number
  confidence: number
}

interface TrendAnalysis {
  slope: number
  intercept: number
  correlation: number
  direction: 'increasing' | 'decreasing' | 'stable'
  confidence: number
  forecast: Array<{ timestamp: Date; value: number; confidence: number }>
}

export class AnomalyDetectorService extends EventEmitter implements AnomalyDetector, TrendAnalyzer {
  name = 'statistical-anomaly-detector'
  
  private static instance: AnomalyDetectorService | null = null
  private prisma: any
  private redis: ReturnType<typeof getRedisInstance>
  private config: AnomalyDetectionConfig
  private baselines: Map<string, StatisticalBaseline> = new Map()
  private seasonalPatterns: Map<string, SeasonalPattern> = new Map()
  private detectionInterval: NodeJS.Timeout | null = null

  constructor(prisma: any, redis?: ReturnType<typeof getRedisInstance>) {
    super()
    this.prisma = prisma
    this.redis = redis || getRedisInstance()
    
    const queueConfig = getQueueManagementConfig()
    this.config = {
      algorithms: ['zscore', 'iqr', 'isolation_forest', 'seasonal'],
      sensitivity: 0.95, // 95% confidence level
      minDataPoints: 30,
      baselineWindow: 7, // 7 days
      seasonalityWindow: 14 // 14 days
    }

    this.startAnomalyDetection()
  }

  /**
   * Get singleton instance
   */
  static getInstance(prisma?: any, redis?: ReturnType<typeof getRedisInstance>): AnomalyDetectorService {
    if (!AnomalyDetectorService.instance) {
      if (!prisma) {
        throw new QueueManagementError(
          'Prisma instance required for first initialization',
          'INITIALIZATION_ERROR'
        )
      }
      AnomalyDetectorService.instance = new AnomalyDetectorService(prisma, redis)
    }
    return AnomalyDetectorService.instance
  }

  /**
   * Detect anomalies in metrics using multiple algorithms
   */
  async detect(metrics: Metric[]): Promise<Anomaly[]> {
    try {
      if (metrics.length < this.config.minDataPoints) {
        return [] // Not enough data for reliable detection
      }

      const anomalies: Anomaly[] = []

      // Group metrics by queue and metric type
      const groupedMetrics = this.groupMetricsByQueueAndType(metrics)

      for (const [key, metricGroup] of groupedMetrics) {
        const [queueName, metricType] = key.split(':')
        
        // Get or create baseline for this metric
        const baseline = await this.getOrCreateBaseline(queueName, metricType, metricGroup)
        
        // Apply different anomaly detection algorithms
        const zScoreAnomalies = this.detectZScoreAnomalies(metricGroup, baseline, queueName, metricType)
        const iqrAnomalies = this.detectIQRAnomalies(metricGroup, baseline, queueName, metricType)
        const seasonalAnomalies = await this.detectSeasonalAnomalies(metricGroup, queueName, metricType)
        
        anomalies.push(...zScoreAnomalies, ...iqrAnomalies, ...seasonalAnomalies)
      }

      // Remove duplicates and rank by severity
      const uniqueAnomalies = this.deduplicateAndRankAnomalies(anomalies)

      // Cache detected anomalies
      await this.cacheAnomalies(uniqueAnomalies)

      return uniqueAnomalies

    } catch (error) {
      const errorMessage = error instanceof Error ? (error instanceof Error ? error.message : "Unknown error") : 'Unknown error'
      throw new QueueManagementError(
        `Failed to detect anomalies: ${errorMessage}`,
        'ANOMALY_DETECTION_ERROR'
      )
    }
  }

  /**
   * Train the anomaly detection model with historical data
   */
  async train(metrics: Metric[]): Promise<void> {
    try {
      // Group metrics for training
      const groupedMetrics = this.groupMetricsByQueueAndType(metrics)

      for (const [key, metricGroup] of groupedMetrics) {
        const [queueName, metricType] = key.split(':')
        
        // Calculate statistical baseline
        const baseline = this.calculateStatisticalBaseline(metricGroup)
        this.baselines.set(key, baseline)
        
        // Detect seasonal patterns
        const seasonalPattern = await this.detectSeasonalPattern(metricGroup)
        if (seasonalPattern.confidence > 0.7) {
          this.seasonalPatterns.set(key, seasonalPattern)
        }
        
        // Store baseline in database
        await this.storeBaseline(queueName, metricType, baseline)
      }

      this.emit('training_completed', { 
        baselines: this.baselines.size,
        patterns: this.seasonalPatterns.size
      })

    } catch (error) {
      const errorMessage = error instanceof Error ? (error instanceof Error ? error.message : "Unknown error") : 'Unknown error'
      throw new QueueManagementError(
        `Failed to train anomaly detector: ${errorMessage}`,
        'TRAINING_ERROR'
      )
    }
  }

  /**
   * Analyze trends using linear regression
   */
  async analyze(metrics: Metric[]): Promise<TrendPrediction> {
    try {
      if (metrics.length < 2) {
        throw new QueueManagementError(
          'Insufficient data for trend analysis',
          'INSUFFICIENT_DATA'
        )
      }

      // Convert metrics to time series data
      const timeSeriesData = metrics.map((metric, index) => ({
        x: index, // Time index
        y: metric.value,
        timestamp: metric.timestamp
      }))

      // Calculate linear regression
      const regression = this.calculateLinearRegression(timeSeriesData)
      
      // Determine trend direction
      let direction: 'increasing' | 'decreasing' | 'stable'
      const slopeThreshold = 0.01
      
      if (Math.abs(regression.slope) < slopeThreshold) {
        direction = 'stable'
      } else if (regression.slope > 0) {
        direction = 'increasing'
      } else {
        direction = 'decreasing'
      }

      // Generate forecast
      const forecast = this.generateForecast(timeSeriesData, regression, 24) // 24 hours ahead

      const trendPrediction: TrendPrediction = {
        queueName: metrics[0].labels?.queueName || 'unknown',
        metric: metrics[0].name,
        timeRange: {
          start: metrics[0].timestamp,
          end: metrics[metrics.length - 1].timestamp
        },
        predictions: forecast,
        accuracy: Math.abs(regression.correlation)
      }

      return trendPrediction

    } catch (error) {
      const errorMessage = error instanceof Error ? (error instanceof Error ? error.message : "Unknown error") : 'Unknown error'
      throw new QueueManagementError(
        `Failed to analyze trends: ${errorMessage}`,
        'TREND_ANALYSIS_ERROR'
      )
    }
  }

  /**
   * Forecast future values based on historical trends
   */
  async forecast(metrics: Metric[], horizon: number): Promise<TrendPrediction> {
    try {
      const trendAnalysis = await this.analyze(metrics)
      
      // Extend forecast to requested horizon
      const lastTimestamp = metrics[metrics.length - 1].timestamp
      const extendedForecast = this.extendForecast(
        trendAnalysis.predictions,
        lastTimestamp,
        horizon
      )

      return {
        ...trendAnalysis,
        predictions: extendedForecast
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? (error instanceof Error ? error.message : "Unknown error") : 'Unknown error'
      throw new QueueManagementError(
        `Failed to forecast: ${errorMessage}`,
        'FORECAST_ERROR'
      )
    }
  }

  /**
   * Detect seasonal patterns in metrics
   */
  async detectSeasonalPatterns(
    queueName: string,
    metricType: string,
    timeRange: TimeRange
  ): Promise<SeasonalPattern[]> {
    try {
      // Get historical data
      const metrics = await this.getHistoricalMetrics(queueName, metricType, timeRange)
      
      if (metrics.length < this.config.minDataPoints) {
        return []
      }

      const patterns: SeasonalPattern[] = []
      
      // Check for different seasonal periods (hourly, daily, weekly)
      const periods = [24, 168, 720] // 24h, 7d, 30d in hours
      
      for (const period of periods) {
        const pattern = this.detectSeasonalPatternForPeriod(metrics, period)
        if (pattern.confidence > 0.6) {
          patterns.push(pattern)
        }
      }

      return patterns.sort((a, b) => b.confidence - a.confidence)

    } catch (error) {
      const errorMessage = error instanceof Error ? (error instanceof Error ? error.message : "Unknown error") : 'Unknown error'
      throw new QueueManagementError(
        `Failed to detect seasonal patterns: ${errorMessage}`,
        'SEASONAL_DETECTION_ERROR'
      )
    }
  }

  /**
   * Create automatic baseline for comparisons
   */
  async createBaseline(
    queueName: string,
    metricType: string,
    timeRange: TimeRange
  ): Promise<PerformanceBaseline> {
    try {
      // Get historical data for baseline calculation
      const metrics = await this.getHistoricalMetrics(queueName, metricType, timeRange)
      
      if (metrics.length < this.config.minDataPoints) {
        throw new QueueManagementError(
          'Insufficient data for baseline creation',
          'INSUFFICIENT_DATA'
        )
      }

      // Calculate statistical baseline
      const values = metrics.map(m => m.value)
      const baseline = this.calculateStatisticalBaseline(metrics)
      
      // Determine thresholds based on statistical analysis
      const warningThreshold = baseline.mean + 2 * baseline.standardDeviation
      const criticalThreshold = baseline.mean + 3 * baseline.standardDeviation

      const performanceBaseline: PerformanceBaseline = {
        queueName,
        metric: metricType,
        baseline: baseline.mean,
        threshold: {
          warning: warningThreshold,
          critical: criticalThreshold
        },
        calculatedAt: new Date(),
        validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
      }

      // Store baseline
      await this.storePerformanceBaseline(performanceBaseline)

      return performanceBaseline

    } catch (error) {
      const errorMessage = error instanceof Error ? (error instanceof Error ? error.message : "Unknown error") : 'Unknown error'
      throw new QueueManagementError(
        `Failed to create baseline: ${errorMessage}`,
        'BASELINE_CREATION_ERROR'
      )
    }
  }

  // Private helper methods

  private startAnomalyDetection(): void {
    // Run anomaly detection every 5 minutes
    this.detectionInterval = setInterval(async () => {
      try {
        await this.runPeriodicAnomalyDetection()
      } catch (error) {
        console.error('Periodic anomaly detection failed:', error)
      }
    }, 5 * 60 * 1000) // 5 minutes
  }

  private async runPeriodicAnomalyDetection(): Promise<void> {
    // Get recent metrics for all queues
    const recentMetrics = await this.getRecentMetrics(60) // Last hour
    
    if (recentMetrics.length > 0) {
      const anomalies = await this.detect(recentMetrics)
      
      if (anomalies.length > 0) {
        this.emit('anomalies_detected', anomalies)
        
        // Store anomalies in database
        await this.storeAnomalies(anomalies)
      }
    }
  }

  private groupMetricsByQueueAndType(metrics: Metric[]): Map<string, Metric[]> {
    const grouped = new Map<string, Metric[]>()
    
    for (const metric of metrics) {
      const queueName = metric.labels?.queueName || 'unknown'
      const key = `${queueName}:${metric.name}`
      
      if (!grouped.has(key)) {
        grouped.set(key, [])
      }
      grouped.get(key)!.push(metric)
    }
    
    return grouped
  }

  private async getOrCreateBaseline(
    queueName: string,
    metricType: string,
    metrics: Metric[]
  ): Promise<StatisticalBaseline> {
    const key = `${queueName}:${metricType}`
    
    // Check if we have a cached baseline
    if (this.baselines.has(key)) {
      return this.baselines.get(key)!
    }
    
    // Try to load from database
    const storedBaseline = await this.loadBaseline(queueName, metricType)
    if (storedBaseline) {
      this.baselines.set(key, storedBaseline)
      return storedBaseline
    }
    
    // Create new baseline
    const baseline = this.calculateStatisticalBaseline(metrics)
    this.baselines.set(key, baseline)
    await this.storeBaseline(queueName, metricType, baseline)
    
    return baseline
  }

  private calculateStatisticalBaseline(metrics: Metric[]): StatisticalBaseline {
    const values = metrics.map(m => m.value).sort((a, b) => a - b)
    const n = values.length
    
    // Calculate basic statistics
    const mean = values.reduce((sum, val) => sum + val, 0) / n
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / n
    const standardDeviation = Math.sqrt(variance)
    
    // Calculate quartiles
    const q1Index = Math.floor(n * 0.25)
    const medianIndex = Math.floor(n * 0.5)
    const q3Index = Math.floor(n * 0.75)
    
    const q1 = values[q1Index]
    const median = values[medianIndex]
    const q3 = values[q3Index]
    const iqr = q3 - q1
    
    // Outlier threshold using IQR method
    const outlierThreshold = q3 + 1.5 * iqr
    
    return {
      mean,
      standardDeviation,
      median,
      q1,
      q3,
      iqr,
      outlierThreshold
    }
  }

  private detectZScoreAnomalies(
    metrics: Metric[],
    baseline: StatisticalBaseline,
    queueName: string,
    metricType: string
  ): Anomaly[] {
    const anomalies: Anomaly[] = []
    const threshold = 2.5 // Z-score threshold
    
    for (const metric of metrics) {
      const zScore = Math.abs((metric.value - baseline.mean) / baseline.standardDeviation)
      
      if (zScore > threshold) {
        const severity = this.calculateSeverity(zScore, threshold)
        
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
        })
      }
    }
    
    return anomalies
  }

  private detectIQRAnomalies(
    metrics: Metric[],
    baseline: StatisticalBaseline,
    queueName: string,
    metricType: string
  ): Anomaly[] {
    const anomalies: Anomaly[] = []
    
    for (const metric of metrics) {
      if (metric.value > baseline.outlierThreshold) {
        const deviation = (metric.value - baseline.median) / baseline.iqr
        const severity = this.calculateSeverity(deviation, 1.5)
        
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
        })
      }
    }
    
    return anomalies
  }

  private async detectSeasonalAnomalies(
    metrics: Metric[],
    queueName: string,
    metricType: string
  ): Promise<Anomaly[]> {
    const key = `${queueName}:${metricType}`
    const pattern = this.seasonalPatterns.get(key)
    
    if (!pattern || pattern.confidence < 0.7) {
      return [] // No reliable seasonal pattern
    }
    
    const anomalies: Anomaly[] = []
    
    for (const metric of metrics) {
      const expectedValue = this.calculateSeasonalExpectedValue(metric.timestamp, pattern)
      const deviation = Math.abs(metric.value - expectedValue) / expectedValue
      
      if (deviation > 0.3) { // 30% deviation threshold
        const severity = this.calculateSeverity(deviation, 0.3)
        
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
        })
      }
    }
    
    return anomalies
  }

  private calculateSeverity(deviation: number, threshold: number): 'info' | 'warning' | 'error' | 'critical' {
    const ratio = deviation / threshold
    
    if (ratio > 3) return 'critical'
    if (ratio > 2) return 'error'
    if (ratio > 1.5) return 'warning'
    return 'info'
  }

  private deduplicateAndRankAnomalies(anomalies: Anomaly[]): Anomaly[] {
    // Remove duplicates based on queue, metric, and timestamp
    const unique = new Map<string, Anomaly>()
    
    for (const anomaly of anomalies) {
      const key = `${anomaly.queueName}_${anomaly.metric}_${anomaly.timestamp.getTime()}`
      
      if (!unique.has(key) || this.getSeverityWeight(anomaly.severity) > this.getSeverityWeight(unique.get(key)!.severity)) {
        unique.set(key, anomaly)
      }
    }
    
    // Sort by severity and deviation
    return Array.from(unique.values()).sort((a, b) => {
      const severityDiff = this.getSeverityWeight(b.severity) - this.getSeverityWeight(a.severity)
      if (severityDiff !== 0) return severityDiff
      return b.deviation - a.deviation
    })
  }

  private getSeverityWeight(severity: string): number {
    switch (severity) {
      case 'critical': return 4
      case 'error': return 3
      case 'warning': return 2
      case 'info': return 1
      default: return 0
    }
  }

  private calculateLinearRegression(dataPoints: Array<{ x: number; y: number; timestamp: Date }>): {
    slope: number
    intercept: number
    correlation: number
  } {
    const n = dataPoints.length
    const sumX = dataPoints.reduce((sum, point) => sum + point.x, 0)
    const sumY = dataPoints.reduce((sum, point) => sum + point.y, 0)
    const sumXY = dataPoints.reduce((sum, point) => sum + point.x * point.y, 0)
    const sumXX = dataPoints.reduce((sum, point) => sum + point.x * point.x, 0)
    const sumYY = dataPoints.reduce((sum, point) => sum + point.y * point.y, 0)

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX)
    const intercept = (sumY - slope * sumX) / n

    // Calculate correlation coefficient
    const numerator = n * sumXY - sumX * sumY
    const denominator = Math.sqrt((n * sumXX - sumX * sumX) * (n * sumYY - sumY * sumY))
    const correlation = denominator === 0 ? 0 : numerator / denominator

    return { slope, intercept, correlation }
  }

  private generateForecast(
    data: Array<{ x: number; y: number; timestamp: Date }>,
    regression: { slope: number; intercept: number; correlation: number },
    hours: number
  ): Array<{ timestamp: Date; predictedValue: number; confidence: number }> {
    const forecast: Array<{ timestamp: Date; predictedValue: number; confidence: number }> = []
    const lastDataPoint = data[data.length - 1]
    const hourMs = 60 * 60 * 1000
    
    for (let i = 1; i <= hours; i++) {
      const x = lastDataPoint.x + i
      const predictedValue = regression.slope * x + regression.intercept
      const confidence = Math.abs(regression.correlation) * Math.exp(-i / 24) // Confidence decreases over time
      
      forecast.push({
        timestamp: new Date(lastDataPoint.timestamp.getTime() + i * hourMs),
        predictedValue: Math.max(0, predictedValue), // Ensure non-negative values
        confidence
      })
    }
    
    return forecast
  }

  private extendForecast(
    existingForecast: Array<{ timestamp: Date; predictedValue: number; confidence: number }>,
    lastTimestamp: Date,
    horizon: number
  ): Array<{ timestamp: Date; predictedValue: number; confidence: number }> {
    // Implementation would extend the forecast to the requested horizon
    // For now, return the existing forecast
    return existingForecast
  }

  private async detectSeasonalPattern(metrics: Metric[]): Promise<SeasonalPattern> {
    // Simplified seasonal pattern detection
    // In a real implementation, this would use FFT or autocorrelation
    return {
      period: 24, // 24 hours
      amplitude: 0,
      phase: 0,
      confidence: 0.5
    }
  }

  private detectSeasonalPatternForPeriod(metrics: Metric[], period: number): SeasonalPattern {
    // Simplified implementation
    return {
      period,
      amplitude: 0,
      phase: 0,
      confidence: 0.5
    }
  }

  private calculateSeasonalExpectedValue(timestamp: Date, pattern: SeasonalPattern): number {
    const hourOfDay = timestamp.getHours()
    const phaseShift = (hourOfDay / pattern.period) * 2 * Math.PI + pattern.phase
    return pattern.amplitude * Math.sin(phaseShift)
  }

  private async getHistoricalMetrics(queueName: string, metricType: string, timeRange: TimeRange): Promise<Metric[]> {
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
    })

    return data.map((item: any) => ({
      name: metricType,
      type: 'gauge' as const,
      value: this.getMetricValue(item, metricType),
      timestamp: item.timestamp,
      labels: { queueName, type: 'queue' }
    }))
  }

  private getMetricValue(item: any, metricType: string): number {
    switch (metricType) {
      case 'throughput': return Number(item.throughputPerMinute) || 0
      case 'processing_time': return Number(item.avgProcessingTime) || 0
      case 'success_rate': return Number(item.successRate) || 0
      case 'error_rate': return Number(item.errorRate) || 0
      default: return 0
    }
  }

  private async getRecentMetrics(minutes: number): Promise<Metric[]> {
    const cutoff = new Date(Date.now() - minutes * 60 * 1000)
    
    const data = await this.prisma.queueMetrics.findMany({
      where: {
        timestamp: { gte: cutoff }
      },
      orderBy: { timestamp: 'desc' }
    })

    const metrics: Metric[] = []
    for (const item of data) {
      metrics.push(
        {
          name: 'throughput',
          type: 'gauge' as const,
          value: Number(item.throughputPerMinute) || 0,
          timestamp: item.timestamp,
          labels: { queueName: item.queueName, type: 'queue' }
        },
        {
          name: 'processing_time',
          type: 'gauge' as const,
          value: Number(item.avgProcessingTime) || 0,
          timestamp: item.timestamp,
          labels: { queueName: item.queueName, type: 'queue' }
        }
      )
    }

    return metrics
  }

  private async cacheAnomalies(anomalies: Anomaly[]): Promise<void> {
    const cacheKey = 'anomalies:latest'
    await this.redis.setex(cacheKey, 300, JSON.stringify(anomalies)) // 5 minutes TTL
  }

  private async storeAnomalies(anomalies: Anomaly[]): Promise<void> {
    // Store anomalies in database for historical analysis
    // TODO: Create anomalies table in Prisma schema
    console.log(`Storing ${anomalies.length} anomalies (not implemented yet)`)
    
    // For now, just log the anomalies
    for (const anomaly of anomalies) {
      console.log(`Anomaly detected: ${anomaly.queueName} - ${anomaly.metric} - ${anomaly.severity}`)
    }
  }

  private async storeBaseline(queueName: string, metricType: string, baseline: StatisticalBaseline): Promise<void> {
    const cacheKey = `baseline:${queueName}:${metricType}`
    await this.redis.setex(cacheKey, 86400, JSON.stringify(baseline)) // 24 hours TTL
  }

  private async loadBaseline(queueName: string, metricType: string): Promise<StatisticalBaseline | null> {
    const cacheKey = `baseline:${queueName}:${metricType}`
    const cached = await this.redis.get(cacheKey)
    return cached ? JSON.parse(cached) : null
  }

  private async storePerformanceBaseline(baseline: PerformanceBaseline): Promise<void> {
    // TODO: Create performanceBaselines table in Prisma schema
    console.log(`Storing performance baseline for ${baseline.queueName} - ${baseline.metric} (not implemented yet)`)
    
    // For now, just log the baseline
    console.log(`Baseline: ${baseline.baseline}, Warning: ${baseline.threshold.warning}, Critical: ${baseline.threshold.critical}`)
  }
}
