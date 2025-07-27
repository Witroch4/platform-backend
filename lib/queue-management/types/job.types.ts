/**
 * Queue Management Types - Job Related
 * 
 * TypeScript interfaces for job-related data structures
 */

import { JobState } from '@prisma/client'

// Job Definition
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

export interface BatchResult {
  total: number
  successful: number
  failed: number
  errors: Array<{
    id: string
    error: string
  }>
}

// Job Filters
export interface JobFilters {
  states?: JobState[]
  dateRange?: {
    start: Date
    end: Date
  }
  search?: string
  correlationId?: string
  flowId?: string
}

// Job List
export interface JobListItem {
  id: string
  name: string
  status: JobState
  priority: number
  createdAt: Date
  startedAt?: Date
  completedAt?: Date
  processingTime?: number
  attempts: number
  progress?: number
  error?: string
  data?: any
}

export interface JobListResponse {
  jobs: JobListItem[]
  total: number
  pagination: {
    page: number
    limit: number
    totalPages: number
    hasNext: boolean
    hasPrev: boolean
  }
  stats: {
    waiting: number
    active: number
    completed: number
    failed: number
    delayed: number
    paused: number
  }
}

// Job Details
export interface JobDetails extends JobListItem {
  queueName: string
  opts: JobOptions
  returnValue?: any
  failedReason?: string
  stacktrace?: string[]
  logs: JobLog[]
  metrics: JobMetrics
  flow?: {
    flowId: string
    parentJobId?: string
    children: string[]
  }
}

export interface JobLog {
  id: string
  timestamp: Date
  level: 'info' | 'warn' | 'error' | 'debug'
  message: string
  data?: any
}

// Job Progress
export interface JobProgress {
  jobId: string
  progress: number
  data?: any
  timestamp: Date
}

// Job Events
export interface JobEvent {
  jobId: string
  queueName: string
  eventType: string
  timestamp: Date
  data: Record<string, any>
}

// Job Statistics
export interface JobStatistics {
  queueName: string
  timeRange: {
    start: Date
    end: Date
  }
  totalJobs: number
  completedJobs: number
  failedJobs: number
  avgProcessingTime: number
  throughput: number
  successRate: number
  errorRate: number
  topErrors: Array<{
    error: string
    count: number
    percentage: number
  }>
  processingTimeDistribution: {
    p50: number
    p75: number
    p90: number
    p95: number
    p99: number
  }
}