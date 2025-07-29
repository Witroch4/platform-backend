// Queue Management Types
export type JobState = 'waiting' | 'active' | 'completed' | 'failed' | 'delayed' | 'paused';
export type QueueStatus = 'healthy' | 'warning' | 'critical';
export type AlertSeverity = 'info' | 'warning' | 'error' | 'critical';
export type FlowStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface QueueHealth {
  name: string;
  status: QueueStatus;
  counts: {
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
  };
  performance: {
    throughput: number; // jobs/min
    avgProcessingTime: number; // ms
    successRate: number; // %
    errorRate: number; // %
  };
  resources: {
    memoryUsage: number; // bytes
    cpuUsage: number; // %
    connections: number;
  };
  lastUpdated: Date;
}

export interface JobMetrics {
  jobId: string;
  queueName: string;
  jobType: string;
  status: JobState;
  timing: {
    createdAt: Date;
    startedAt?: Date;
    completedAt?: Date;
    processingTime?: number;
    waitTime?: number;
  };
  resources: {
    memoryPeak: number;
    cpuTime: number;
  };
  attempts: number;
  error?: string;
  correlationId?: string;
}

export interface Job {
  id: string;
  name: string;
  queueName: string;
  status: JobState;
  data: any;
  progress?: number;
  attempts: number;
  maxAttempts: number;
  createdAt: Date;
  processedAt?: Date;
  finishedAt?: Date;
  error?: string;
  stackTrace?: string;
  delay?: number;
  priority?: number;
}

export interface Alert {
  id: string;
  ruleId: string;
  queueName?: string;
  severity: AlertSeverity;
  title: string;
  message: string;
  metrics: Record<string, any>;
  createdAt: Date;
  acknowledgedAt?: Date;
  acknowledgedBy?: string;
  resolvedAt?: Date;
  status: 'active' | 'acknowledged' | 'resolved';
}

export interface FlowNode {
  jobId: string;
  jobName: string;
  status: JobState;
  children: FlowNode[];
  dependencies: string[];
  metrics: JobMetrics;
  error?: string;
}

export interface FlowTree {
  flowId: string;
  rootJob: FlowNode;
  totalJobs: number;
  completedJobs: number;
  failedJobs: number;
  status: FlowStatus;
  startedAt?: Date;
  completedAt?: Date;
  estimatedCompletion?: Date;
}

export interface SystemMetrics {
  timestamp: Date;
  system: {
    cpuUsage: number;
    memoryUsage: number;
    diskUsage: number;
    networkIO: {
      bytesIn: number;
      bytesOut: number;
    };
  };
  redis: {
    memoryUsage: number;
    connections: number;
    commandsPerSecond: number;
    hitRate: number;
  };
  database: {
    connections: number;
    queryTime: number;
    slowQueries: number;
  };
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface JobFilters {
  status?: JobState[];
  queueName?: string;
  dateRange?: {
    start: Date;
    end: Date;
  };
  search?: string;
}

export interface SortOptions {
  field: string;
  direction: 'asc' | 'desc';
}

export interface JobAction {
  type: 'retry' | 'remove' | 'promote' | 'delay';
  jobIds: string[];
  delay?: number;
}

export interface BatchAction {
  type: 'retryAllFailed' | 'cleanCompleted' | 'pauseQueue' | 'resumeQueue';
  queueName: string;
  olderThan?: number;
}

export interface QueueMetrics {
  queueName: string;
  timestamp: Date;
  throughput: {
    jobsPerMinute: number;
    jobsPerHour: number;
    jobsPerDay: number;
  };
  latency: {
    p50: number;
    p95: number;
    p99: number;
    max: number;
  };
  reliability: {
    successRate: number;
    errorRate: number;
    retryRate: number;
  };
  resources: {
    memoryUsage: number;
    cpuTime: number;
    ioOperations: number;
  };
}

export interface TimeRange {
  start: Date;
  end: Date;
  granularity: 'minute' | 'hour' | 'day';
}

export interface ChartDataPoint {
  timestamp: Date;
  value: number;
  label?: string;
}

export interface MetricsChartData {
  title: string;
  data: ChartDataPoint[];
  unit: string;
  color: string;
}