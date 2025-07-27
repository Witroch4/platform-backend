/**
 * Queue Management Types - Metrics Related
 * 
 * TypeScript interfaces for metrics and analytics data structures
 */

import { MetricType, TimeGranularity } from '@prisma/client'

// Base Metric Types
export interface BaseMetric {
  name: string
  type: MetricType
  value: number
  timestamp: Date
  labels?: Record<string, string>
}

export interface CounterMetric extends BaseMetric {
  type: 'counter'
}

export interface GaugeMetric extends BaseMetric {
  type: 'gauge'
}

export interface HistogramMetric extends BaseMetric {
  type: 'histogram'
  buckets: Record<string, number>
}

export interface SummaryMetric extends BaseMetric {
  type: 'summary'
  quantiles: Record<string, number>
}

export type Metric = CounterMetric | GaugeMetric | HistogramMetric | SummaryMetric

// Time Range
export interface TimeRange {
  start: Date
  end: Date
  granularity?: TimeGranularity
}

// Queue Metrics
export interface QueueMetrics {
  queueName: string
  timestamp: Date
  throughput: {
    jobsPerMinute: number
    jobsPerHour: number
    jobsPerDay: number
  }
  latency: {
    p50: number
    p95: number
    p99: number
    max: number
  }
  reliability: {
    successRate: number
    errorRate: number
    retryRate: number
  }
  resources: {
    memoryUsage: number
    cpuTime: number
    ioOperations: number
  }
}

// System Metrics
export interface SystemMetrics {
  timestamp: Date
  redis: {
    memoryUsage: number
    connections: number
    commandsProcessed: number
    keyspaceHits: number
    keyspaceMisses: number
  }
  database: {
    connections: number
    activeQueries: number
    slowQueries: number
  }
  system: {
    cpuUsage: number
    memoryUsage: number
    diskUsage: number
    networkIO: {
      bytesIn: number
      bytesOut: number
    }
  }
}

// Aggregated Metrics
export interface AggregatedMetrics {
  queueName?: string
  timeRange: TimeRange
  granularity: TimeGranularity
  data: Array<{
    timestamp: Date
    throughput: number
    avgProcessingTime: number
    successRate: number
    errorRate: number
    queueSize: number
  }>
}

// Percentiles
export interface Percentiles {
  p50: number
  p75: number
  p90: number
  p95: number
  p99: number
  max: number
}

// Metric Collection
export interface MetricCollectionConfig {
  interval: number // milliseconds
  retention: number // days
  aggregationIntervals: TimeGranularity[]
  batchSize: number
}

export interface MetricCollector {
  name: string
  collect(): Promise<Metric[]>
  isEnabled(): boolean
}

// Metric Storage
export interface MetricStorage {
  store(metrics: Metric[]): Promise<void>
  query(query: MetricQuery): Promise<Metric[]>
  aggregate(query: AggregationQuery): Promise<AggregatedMetrics>
}

export interface MetricQuery {
  metricNames?: string[]
  queueNames?: string[]
  timeRange: TimeRange
  labels?: Record<string, string>
  limit?: number
}

export interface AggregationQuery extends MetricQuery {
  granularity: TimeGranularity
  aggregationFunction: 'avg' | 'sum' | 'max' | 'min' | 'count'
}

// Anomaly Detection
export interface Anomaly {
  id: string
  queueName: string
  metric: string
  timestamp: Date
  value: number
  expectedValue: number
  deviation: number
  severity: 'info' | 'warning' | 'error' | 'critical'
  description: string
}

export interface AnomalyDetector {
  name: string
  detect(metrics: Metric[]): Promise<Anomaly[]>
  train(metrics: Metric[]): Promise<void>
}

// Trend Analysis
export interface TrendPrediction {
  queueName: string
  metric: string
  timeRange: TimeRange
  predictions: Array<{
    timestamp: Date
    predictedValue: number
    confidence: number
  }>
  accuracy: number
}

export interface TrendAnalyzer {
  analyze(metrics: Metric[]): Promise<TrendPrediction>
  forecast(metrics: Metric[], horizon: number): Promise<TrendPrediction>
}

// Metric Filters
export interface MetricFilters {
  queueNames?: string[]
  metrics?: string[]
  timeRange: TimeRange
  granularity?: TimeGranularity
}

// Export Data
export interface ExportResult {
  format: 'csv' | 'json'
  data: string | object
  filename: string
  size: number
}

// Dashboard Metrics
export interface DashboardMetrics {
  overview: {
    totalQueues: number
    totalJobs: number
    activeJobs: number
    failedJobs: number
    throughput: number
    avgProcessingTime: number
    systemHealth: 'healthy' | 'warning' | 'critical'
  }
  queueMetrics: Array<{
    queueName: string
    status: string
    jobCount: number
    throughput: number
    errorRate: number
    avgProcessingTime: number
  }>
  systemMetrics: SystemMetrics
  alerts: Array<{
    id: string
    severity: string
    title: string
    queueName?: string
    createdAt: Date
  }>
}

// Real-time Metrics
export interface RealTimeMetrics {
  timestamp: Date
  queues: Record<string, {
    waiting: number
    active: number
    completed: number
    failed: number
    throughput: number
  }>
  system: {
    cpuUsage: number
    memoryUsage: number
    redisConnections: number
    dbConnections: number
  }
}

// Metric Comparison
export interface MetricComparison {
  metric: string
  queueName?: string
  periods: Array<{
    label: string
    timeRange: TimeRange
    value: number
    change?: number
    changePercentage?: number
  }>
}

// Performance Baseline
export interface PerformanceBaseline {
  queueName: string
  metric: string
  baseline: number
  threshold: {
    warning: number
    critical: number
  }
  calculatedAt: Date
  validUntil: Date
}