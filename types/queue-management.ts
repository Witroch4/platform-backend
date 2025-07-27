/**
 * Queue Management System Types
 * 
 * TypeScript type definitions for the BullMQ queue management system
 */

import { z } from 'zod'
import {
  JOB_STATES,
  QUEUE_STATES,
  ALERT_SEVERITIES,
  ALERT_STATUSES,
  USER_ROLES,
  PERMISSIONS,
  METRIC_TYPES,
  TIME_GRANULARITIES,
  EVENT_TYPES,
  ERROR_CODES,
  WEBHOOK_EVENTS,
} from '../lib/queue-management/constants'

// Base Types
export type JobState = typeof JOB_STATES[keyof typeof JOB_STATES]
export type QueueState = typeof QUEUE_STATES[keyof typeof QUEUE_STATES]
export type AlertSeverity = typeof ALERT_SEVERITIES[keyof typeof ALERT_SEVERITIES]
export type AlertStatus = typeof ALERT_STATUSES[keyof typeof ALERT_STATUSES]
export type UserRole = typeof USER_ROLES[keyof typeof USER_ROLES]
export type Permission = typeof PERMISSIONS[keyof typeof PERMISSIONS]
export type MetricType = typeof METRIC_TYPES[keyof typeof METRIC_TYPES]
export type TimeGranularity = typeof TIME_GRANULARITIES[keyof typeof TIME_GRANULARITIES]
export type EventType = typeof EVENT_TYPES[keyof typeof EVENT_TYPES]
export type ErrorCode = typeof ERROR_CODES[keyof typeof ERROR_CODES]
export type WebhookEvent = typeof WEBHOOK_EVENTS[keyof typeof WEBHOOK_EVENTS]

// Pagination
export interface Pagination {
  page: number
  limit: number
  offset?: number
}

export interface PaginatedResponse<T> {
  data: T[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
    hasNext: boolean
    hasPrev: boolean
  }
}

// Time Range
export interface TimeRange {
  start: Date
  end: Date
  granularity?: TimeGranularity
}

// Queue Configuration
export interface QueueConfig {
  id?: string
  name: string
  displayName?: string
  description?: string
  priority: number
  concurrency: number
  rateLimiter?: RateLimiterConfig
  retryPolicy: RetryPolicy
  cleanupPolicy: CleanupPolicy
  alertThresholds: AlertThresholds
  createdAt?: Date
  updatedAt?: Date
  createdBy: string
}

export interface RateLimiterConfig {
  max: number
  duration: number
  bounceBack?: boolean
}

export interface RetryPolicy {
  attempts: number
  backoff: 'fixed' | 'exponential'
  delay: number
}

export interface CleanupPolicy {
  removeOnComplete: number
  removeOnFail: number
  maxAge?: number
}

export interface AlertThresholds {
  queueSize?: {
    warning: number
    critical: number
  }
  processingTime?: {
    warning: number
    critical: number
  }
  errorRate?: {
    warning: number
    critical: number
  }
  memoryUsage?: {
    warning: number
    critical: number
  }
}

// Queue Health
export interface QueueHealth {
  name: string
  status: QueueState
  counts: {
    waiting: number
    active: number
    completed: number
    failed: number
    delayed: number
    paused: number
  }
  performance: {
    throughput: number // jobs/min
    avgProcessingTime: number // ms
    successRate: number // %
    errorRate: number // %
  }
  resources: {
    memoryUsage: number // bytes
    cpuUsage: number // %
    connections: number
  }
  lastUpdated: Date
}

// Job
export interface Job {
  id: string
  name: string
  queueName: string
  data: any
  opts: JobOptions
  progress?: number
  returnValue?: any
  failedReason?: string
  stacktrace?: string[]
  timestamp: number
  processedOn?: number
  finishedOn?: number
  delay?: number
  attempts: number
  attemptsMade: number
}

export interface JobOptions {
  priority?: number
  delay?: number
  attempts?: number
  backoff?: number | BackoffOptions
  lifo?: boolean
  timeout?: number
  removeOnComplete?: boolean | number
  removeOnFail?: boolean | number
  jobId?: string
  repeat?: RepeatOptions
}

export interface BackoffOptions {
  type: 'fixed' | 'exponential'
  delay: number
}

export interface RepeatOptions {
  cron?: string
  tz?: string
  startDate?: Date | string | number
  endDate?: Date | string | number
  limit?: number
  every?: number
  count?: number
}

// Job Metrics
export interface JobMetrics {
  jobId: string
  queueName: string
  jobName: string
  jobType: string
  status: JobState
  timing: {
    createdAt: Date
    startedAt?: Date
    completedAt?: Date
    processingTime?: number
    waitTime?: number
  }
  resources: {
    memoryPeak: number
    cpuTime: number
  }
  attempts: number
  maxAttempts: number
  error?: string
  correlationId?: string
  flowId?: string
  parentJobId?: string
  payloadSize: number
  resultSize?: number
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
  data: {
    timestamp: Date
    throughput: number
    avgProcessingTime: number
    successRate: number
    errorRate: number
    queueSize: number
  }[]
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

// Anomaly Detection
export interface Anomaly {
  id: string
  queueName: string
  metric: string
  timestamp: Date
  value: number
  expectedValue: number
  deviation: number
  severity: AlertSeverity
  description: string
}

// Trend Prediction
export interface TrendPrediction {
  queueName: string
  metric: string
  timeRange: TimeRange
  predictions: {
    timestamp: Date
    predictedValue: number
    confidence: number
  }[]
  accuracy: number
}

// Alert Rule
export interface AlertRule {
  id?: string
  name: string
  description: string
  queueName?: string // null = global
  condition: AlertCondition
  severity: AlertSeverity
  channels: NotificationChannel[]
  cooldown: number // minutes
  enabled: boolean
  createdAt?: Date
  updatedAt?: Date
  createdBy: string
}

export interface AlertCondition {
  metric: string
  operator: '>' | '<' | '==' | '!=' | 'contains'
  threshold: number | string
  timeWindow: number // minutes
  aggregation?: 'avg' | 'sum' | 'max' | 'min' | 'count'
}

export interface NotificationChannel {
  type: 'email' | 'slack' | 'webhook' | 'sms'
  config: Record<string, any>
}

// Alert
export interface Alert {
  id: string
  ruleId: string
  queueName?: string
  severity: AlertSeverity
  title: string
  message: string
  metrics: Record<string, any>
  status: AlertStatus
  createdAt: Date
  acknowledgedAt?: Date
  acknowledgedBy?: string
  resolvedAt?: Date
  resolutionNote?: string
}

// Flow
export interface Flow {
  id: string
  flowId: string
  name?: string
  description?: string
  rootJobId: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  totalJobs: number
  completedJobs: number
  failedJobs: number
  startedAt?: Date
  completedAt?: Date
  estimatedCompletion?: Date
  createdAt: Date
  metadata?: Record<string, any>
}

export interface FlowTree {
  flowId: string
  rootJob: FlowNode
  totalJobs: number
  completedJobs: number
  failedJobs: number
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  startedAt?: Date
  completedAt?: Date
  estimatedCompletion?: Date
}

export interface FlowNode {
  jobId: string
  jobName: string
  status: JobState
  children: FlowNode[]
  dependencies: string[]
  metrics: JobMetrics
  error?: string
}

export interface FlowMetrics {
  flowId: string
  totalDuration: number
  criticalPath: string[]
  parallelism: number
  efficiency: number // %
  bottlenecks: Bottleneck[]
}

export interface Bottleneck {
  jobId: string
  jobName: string
  queueName: string
  duration: number
  impact: number // % of total flow time
  suggestions: string[]
}

// Flow Analysis
export interface FlowAnalysis {
  flowId: string
  tree: FlowTree
  metrics: FlowMetrics
  issues: FlowIssue[]
  optimizations: Optimization[]
}

export interface FlowIssue {
  type: 'orphaned_job' | 'circular_dependency' | 'bottleneck' | 'stuck_flow'
  severity: AlertSeverity
  description: string
  affectedJobs: string[]
  suggestions: string[]
}

export interface Optimization {
  type: 'parallelization' | 'resource_allocation' | 'dependency_optimization'
  description: string
  estimatedImprovement: number // % improvement
  implementation: string
}

// User
export interface User {
  id: string
  userId: string
  email: string
  name: string
  role: UserRole
  permissions: Permission[]
  queueAccess: Record<string, Permission[]>
  createdAt: Date
  updatedAt: Date
  lastLogin?: Date
}

// Audit Log
export interface AuditLog {
  id: string
  userId: string
  action: string
  resourceType: string
  resourceId?: string
  queueName?: string
  details: Record<string, any>
  ipAddress?: string
  userAgent?: string
  createdAt: Date
}

// Automation Policy
export interface AutomationPolicy {
  id?: string
  name: string
  description: string
  queueName?: string // null = global
  triggerCondition: PolicyCondition
  actions: PolicyAction[]
  enabled: boolean
  priority: number
  createdAt?: Date
  updatedAt?: Date
  createdBy: string
  lastExecuted?: Date
  executionCount: number
}

export interface PolicyCondition {
  type: 'metric_threshold' | 'job_state' | 'queue_state' | 'time_based'
  config: Record<string, any>
}

export interface PolicyAction {
  type: 'retry_jobs' | 'pause_queue' | 'scale_workers' | 'send_alert' | 'execute_script'
  config: Record<string, any>
}

// Webhook
export interface WebhookConfig {
  id?: string
  name: string
  url: string
  events: WebhookEvent[]
  headers?: Record<string, string>
  secret?: string
  enabled: boolean
  retryPolicy: WebhookRetryPolicy
  createdAt?: Date
  updatedAt?: Date
  createdBy: string
}

export interface WebhookRetryPolicy {
  attempts: number
  backoff: 'fixed' | 'exponential'
  delay: number
}

export interface WebhookDelivery {
  id: string
  webhookId: string
  eventType: WebhookEvent
  payload: Record<string, any>
  responseStatus?: number
  responseBody?: string
  attempts: number
  deliveredAt?: Date
  createdAt: Date
}

// API Response Types
export interface ApiResponse<T = any> {
  success: boolean
  data?: T
  error?: {
    code: ErrorCode
    message: string
    details?: any
    requestId?: string
    timestamp: Date
  }
  pagination?: {
    page: number
    limit: number
    total: number
    totalPages: number
    hasNext: boolean
    hasPrev: boolean
  }
}

export interface BatchResult {
  total: number
  successful: number
  failed: number
  errors: Array<{
    id: string
    error: string
  }>
}

// Job Actions
export interface JobAction {
  action: 'retry' | 'remove' | 'promote' | 'delay'
  jobIds: string[]
  delay?: number
}

export interface BatchAction {
  action: 'retry_all_failed' | 'clean_completed' | 'pause_queue' | 'resume_queue'
  queueName: string
  options?: Record<string, any>
}

// Filters
export interface JobFilters {
  states?: JobState[]
  dateRange?: TimeRange
  search?: string
  correlationId?: string
  flowId?: string
}

export interface QueueFilters {
  states?: QueueState[]
  search?: string
  priority?: number[]
}

export interface AlertFilters {
  severities?: AlertSeverity[]
  statuses?: AlertStatus[]
  dateRange?: TimeRange
  queueName?: string
}

// Sort Options
export interface SortOptions {
  field: string
  direction: 'asc' | 'desc'
}

// Export Data
export interface ExportResult {
  format: 'csv' | 'json'
  data: string | object
  filename: string
  size: number
}

export interface MetricFilters {
  queueNames?: string[]
  metrics?: string[]
  timeRange: TimeRange
  granularity?: TimeGranularity
}

// Validation Schemas
export const QueueConfigSchema = z.object({
  name: z.string().min(1).max(255).regex(/^[a-zA-Z0-9_-]+$/),
  displayName: z.string().max(255).optional(),
  description: z.string().max(1000).optional(),
  priority: z.number().int().min(0).max(100).default(0),
  concurrency: z.number().int().min(1).max(1000).default(1),
  retryPolicy: z.object({
    attempts: z.number().int().min(1).max(10),
    backoff: z.enum(['fixed', 'exponential']),
    delay: z.number().int().min(0)
  }),
  cleanupPolicy: z.object({
    removeOnComplete: z.number().int().min(0).max(10000),
    removeOnFail: z.number().int().min(0).max(10000)
  }),
  alertThresholds: z.object({
    queueSize: z.object({
      warning: z.number().int().min(0),
      critical: z.number().int().min(0)
    }).optional(),
    processingTime: z.object({
      warning: z.number().int().min(0),
      critical: z.number().int().min(0)
    }).optional(),
    errorRate: z.object({
      warning: z.number().min(0).max(1),
      critical: z.number().min(0).max(1)
    }).optional()
  })
})

export const JobActionSchema = z.object({
  action: z.enum(['retry', 'remove', 'promote', 'delay']),
  jobIds: z.array(z.string()).min(1).max(1000),
  delay: z.number().int().min(0).optional()
})

export const AlertRuleSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
  queueName: z.string().optional(),
  condition: z.object({
    metric: z.string(),
    operator: z.enum(['>', '<', '==', '!=', 'contains']),
    threshold: z.union([z.number(), z.string()]),
    timeWindow: z.number().int().min(1),
    aggregation: z.enum(['avg', 'sum', 'max', 'min', 'count']).optional()
  }),
  severity: z.enum(['info', 'warning', 'error', 'critical']),
  channels: z.array(z.object({
    type: z.enum(['email', 'slack', 'webhook', 'sms']),
    config: z.record(z.any())
  })),
  cooldown: z.number().int().min(0).default(5),
  enabled: z.boolean().default(true)
})

export const PaginationSchema = z.object({
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(1000).default(50)
})

export const TimeRangeSchema = z.object({
  start: z.date(),
  end: z.date(),
  granularity: z.enum(['1m', '5m', '1h', '1d', '1w', '1M']).optional()
})