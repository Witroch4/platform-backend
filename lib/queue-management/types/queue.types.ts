/**
 * Queue Management Types - Queue Related
 * 
 * TypeScript interfaces for queue-related data structures
 */

import { QueueState, JobState } from '@prisma/client'

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

// Queue Operations
export interface QueueOperation {
  queueName: string
  operation: 'pause' | 'resume' | 'clean' | 'drain' | 'obliterate'
  options?: Record<string, any>
}

export interface QueueStats {
  name: string
  waiting: number
  active: number
  completed: number
  failed: number
  delayed: number
  paused: number
  total: number
}

// Queue Events
export interface QueueEvent {
  queueName: string
  eventType: string
  timestamp: Date
  data: Record<string, any>
}

// Queue List Response
export interface QueueListItem {
  name: string
  displayName?: string
  status: QueueState
  priority: number
  concurrency: number
  stats: QueueStats
  health: {
    status: QueueState
    lastCheck: Date
  }
}

export interface QueueListResponse {
  queues: QueueListItem[]
  total: number
  healthy: number
  warning: number
  critical: number
  paused: number
  stopped: number
}

// Queue Details
export interface QueueDetails extends QueueListItem {
  config: QueueConfig
  metrics: {
    throughput: number
    avgProcessingTime: number
    successRate: number
    errorRate: number
    memoryUsage: number
    cpuUsage: number
  }
  recentJobs: JobSummary[]
  alerts: AlertSummary[]
}

export interface JobSummary {
  id: string
  name: string
  status: JobState
  createdAt: Date
  startedAt?: Date
  completedAt?: Date
  processingTime?: number
  attempts: number
  error?: string
}

export interface AlertSummary {
  id: string
  severity: string
  title: string
  createdAt: Date
  status: string
}