import { Queue, Job, QueueEvents } from 'bullmq';
import { connection } from '../redis';
import type IORedis from 'ioredis';
import { apm } from './application-performance-monitor';

// Queue monitoring interfaces
export interface QueueHealthMetrics {
  queueName: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: boolean;
  timestamp: Date;
}

export interface JobMetrics {
  jobId: string;
  jobName: string;
  queueName: string;
  status: 'waiting' | 'active' | 'completed' | 'failed' | 'delayed';
  createdAt: Date;
  processedAt?: Date;
  finishedAt?: Date;
  processingTime?: number;
  waitTime?: number;
  attempts: number;
  maxAttempts: number;
  error?: string;
  correlationId?: string;
}

export interface QueuePerformanceStats {
  queueName: string;
  throughput: {
    jobsPerMinute: number;
    jobsPerHour: number;
  };
  averageProcessingTime: number;
  averageWaitTime: number;
  successRate: number;
  errorRate: number;
  retryRate: number;
  timestamp: Date;
}

// Alert thresholds for queue monitoring
export const QUEUE_ALERT_THRESHOLDS = {
  MAX_WAITING_JOBS: 100,
  MAX_FAILED_JOBS: 50,
  MAX_PROCESSING_TIME: 30000, // 30 seconds
  MIN_SUCCESS_RATE: 95, // percentage
  MAX_ERROR_RATE: 5, // percentage
  MAX_QUEUE_DEPTH: 500,
} as const;

export class QueueMonitor {
  private static instance: QueueMonitor;
  private redis: IORedis;
  private monitoredQueues: Map<string, Queue> = new Map();
  private queueEventsMap: Map<string, QueueEvents> = new Map();
  private metricsHistory: Map<string, QueueHealthMetrics[]> = new Map();
  private jobMetricsHistory: Map<string, JobMetrics[]> = new Map();
  
  private readonly METRICS_HISTORY_SIZE = 1000;
  private readonly MONITORING_INTERVAL = 30000; // 30 seconds
  private readonly CLEANUP_INTERVAL = 300000; // 5 minutes

  constructor(redisConnection?: IORedis) {
    this.redis = redisConnection || connection;
    this.startMonitoring();
  }

  static getInstance(): QueueMonitor {
    if (!this.instance) {
      this.instance = new QueueMonitor();
    }
    return this.instance;
  }

  // Register a queue for monitoring
  registerQueue(queue: Queue, queueName?: string): void {
    const name = queueName || queue.name;
    this.monitoredQueues.set(name, queue);

    // Create QueueEvents instance
    const events = new QueueEvents(name, { connection: this.redis });
    this.queueEventsMap.set(name, events);

    // Initialize metrics history
    if (!this.metricsHistory.has(name)) {
      this.metricsHistory.set(name, []);
    }
    if (!this.jobMetricsHistory.has(name)) {
      this.jobMetricsHistory.set(name, []);
    }

    // Set up queue event listeners
    this.setupQueueEventListeners(queue, events, name);

    console.log(`[QueueMonitor] Registered queue for monitoring: ${name}`);
  }

  // Set up event listeners for a queue
  private setupQueueEventListeners(queue: Queue, events: QueueEvents, queueName: string): void {
    // Job completed event
    events.on('completed', async ({ jobId }) => {
      const job = await queue.getJob(jobId);
      if (job) {
        this.recordJobCompletion(job, queueName, 'completed');
      }
    });

    // Job failed event
    events.on('failed', async ({ jobId, failedReason }) => {
      const job = await queue.getJob(jobId);
      const error = new Error(failedReason);
      if (job) {
        this.recordJobCompletion(job, queueName, 'failed', error);
      }
    });

    // Job active event
    events.on('active', async ({ jobId }) => {
      const job = await queue.getJob(jobId);
      if (job) {
        this.recordJobStart(job, queueName);
      }
    });

    // Job waiting event
    events.on('waiting', async ({ jobId }) => {
      const job = await queue.getJob(jobId);
      if (job) {
        this.recordJobWaiting(job, queueName);
      }
    });

    // Job stalled event
    events.on('stalled', async ({ jobId }) => {
      const job = await queue.getJob(jobId);
      console.warn(`[QueueMonitor] Job stalled in queue ${queueName}:`, {
        jobId: job?.id || jobId,
        jobName: job?.name,
        attempts: job?.attemptsMade,
      });

      apm.triggerAlert({
        level: 'warning',
        component: 'queue',
        message: `Job stalled in queue ${queueName}: ${job?.name ?? jobId}`,
        metrics: { jobId: jobId, jobName: job?.name, queueName },
      });
    });

    // Queue error event
    events.on('error', (error: Error) => {
      console.error(`[QueueMonitor] Queue error in ${queueName}:`, error);

      apm.triggerAlert({
        level: 'error',
        component: 'queue',
        message: `Queue error in ${queueName}: ${error.message}`,
        metrics: { queueName, error: error.message },
      });
    });
  }

  // Record job completion
  private recordJobCompletion(job: Job, queueName: string, status: 'completed' | 'failed', error?: Error): void {
    const now = new Date();
    const processingTime = job.finishedOn && job.processedOn 
      ? job.finishedOn - job.processedOn 
      : undefined;
    const waitTime = job.processedOn && job.timestamp 
      ? job.processedOn - job.timestamp 
      : undefined;

    const jobMetrics: JobMetrics = {
      jobId: job.id || 'unknown',
      jobName: job.name || 'unknown',
      queueName,
      status,
      createdAt: new Date(job.timestamp || Date.now()),
      processedAt: job.processedOn ? new Date(job.processedOn) : undefined,
      finishedAt: job.finishedOn ? new Date(job.finishedOn) : now,
      processingTime,
      waitTime,
      attempts: job.attemptsMade || 0,
      maxAttempts: job.opts?.attempts || 1,
      error: error?.message,
      correlationId: this.extractCorrelationId(job),
    };

    // Store job metrics
    const jobHistory = this.jobMetricsHistory.get(queueName) || [];
    jobHistory.push(jobMetrics);
    
    // Keep history size manageable
    if (jobHistory.length > this.METRICS_HISTORY_SIZE) {
      jobHistory.shift();
    }
    this.jobMetricsHistory.set(queueName, jobHistory);

    // Record metrics in APM
    if (processingTime !== undefined) {
      apm.recordWorkerMetrics({
        jobId: jobMetrics.jobId,
        jobType: jobMetrics.jobName,
        processingTime,
        queueWaitTime: waitTime || 0,
        success: status === 'completed',
        error: error?.message,
        timestamp: now,
        correlationId: jobMetrics.correlationId || 'unknown',
        retryCount: jobMetrics.attempts,
      });
    }

    // Check for performance alerts
    this.checkJobPerformanceAlerts(jobMetrics);

    console.log(`[QueueMonitor] Job ${status} in queue ${queueName}:`, {
      jobId: jobMetrics.jobId,
      jobName: jobMetrics.jobName,
      processingTime,
      waitTime,
      attempts: jobMetrics.attempts,
    });
  }

  // Record job start
  private recordJobStart(job: Job, queueName: string): void {
    const waitTime = job.processedOn && job.timestamp 
      ? job.processedOn - job.timestamp 
      : undefined;

    console.log(`[QueueMonitor] Job started in queue ${queueName}:`, {
      jobId: job.id,
      jobName: job.name,
      waitTime,
    });
  }

  // Record job waiting
  private recordJobWaiting(job: Job, queueName: string): void {
    console.log(`[QueueMonitor] Job waiting in queue ${queueName}:`, {
      jobId: job.id,
      jobName: job.name,
      timestamp: new Date(job.timestamp || Date.now()),
    });
  }

  // Extract correlation ID from job data
  private extractCorrelationId(job: Job): string | undefined {
    try {
      const data = job.data;
      if (data && typeof data === 'object') {
        // Try different possible paths for correlation ID
        return data.correlationId || 
               data.data?.correlationId || 
               data.payload?.correlationId ||
               undefined;
      }
    } catch (error) {
      // Ignore extraction errors
    }
    return undefined;
  }

  // Check for job performance alerts
  private checkJobPerformanceAlerts(jobMetrics: JobMetrics): void {
    // Alert on long processing time
    if (jobMetrics.processingTime && jobMetrics.processingTime > QUEUE_ALERT_THRESHOLDS.MAX_PROCESSING_TIME) {
      apm.triggerAlert({
        level: 'warning',
        component: 'queue',
        message: `Long job processing time in queue ${jobMetrics.queueName}: ${jobMetrics.processingTime}ms`,
        metrics: {
          jobId: jobMetrics.jobId,
          jobName: jobMetrics.jobName,
          queueName: jobMetrics.queueName,
          processingTime: jobMetrics.processingTime,
        },
      });
    }

    // Alert on job failure
    if (jobMetrics.status === 'failed') {
      const alertLevel = jobMetrics.attempts >= jobMetrics.maxAttempts ? 'error' : 'warning';
      
      apm.triggerAlert({
        level: alertLevel,
        component: 'queue',
        message: `Job failed in queue ${jobMetrics.queueName}: ${jobMetrics.error}`,
        metrics: {
          jobId: jobMetrics.jobId,
          jobName: jobMetrics.jobName,
          queueName: jobMetrics.queueName,
          error: jobMetrics.error,
          attempts: jobMetrics.attempts,
          maxAttempts: jobMetrics.maxAttempts,
        },
      });
    }

    // Alert on high retry count
    if (jobMetrics.attempts > 2) {
      apm.triggerAlert({
        level: 'warning',
        component: 'queue',
        message: `Job with high retry count in queue ${jobMetrics.queueName}`,
        metrics: {
          jobId: jobMetrics.jobId,
          jobName: jobMetrics.jobName,
          queueName: jobMetrics.queueName,
          attempts: jobMetrics.attempts,
          maxAttempts: jobMetrics.maxAttempts,
        },
      });
    }
  }

  // Start monitoring
  private startMonitoring(): void {
    // Collect queue health metrics periodically
    setInterval(() => {
      this.collectQueueHealthMetrics().catch(error => {
        console.error('[QueueMonitor] Error collecting queue health metrics:', error);
      });
    }, this.MONITORING_INTERVAL);

    // Cleanup old metrics periodically
    setInterval(() => {
      this.cleanupOldMetrics();
    }, this.CLEANUP_INTERVAL);

    console.log('[QueueMonitor] Queue monitoring started');
  }

  // Collect health metrics for all monitored queues
  private async collectQueueHealthMetrics(): Promise<void> {
    const timestamp = new Date();

    for (const [queueName, queue] of this.monitoredQueues.entries()) {
      try {
        const [waiting, active, completed, failed, delayed] = await Promise.all([
          queue.getWaiting(),
          queue.getActive(),
          queue.getCompleted(),
          queue.getFailed(),
          queue.getDelayed(),
        ]);

        const metrics: QueueHealthMetrics = {
          queueName,
          waiting: waiting.length,
          active: active.length,
          completed: completed.length,
          failed: failed.length,
          delayed: delayed.length,
          paused: await queue.isPaused(),
          timestamp,
        };

        // Store metrics
        const history = this.metricsHistory.get(queueName) || [];
        history.push(metrics);
        
        if (history.length > this.METRICS_HISTORY_SIZE) {
          history.shift();
        }
        this.metricsHistory.set(queueName, history);

        // Check for alerts
        this.checkQueueHealthAlerts(metrics);

        console.log(`[QueueMonitor] Health metrics collected for queue ${queueName}:`, {
          waiting: metrics.waiting,
          active: metrics.active,
          failed: metrics.failed,
          paused: metrics.paused,
        });

      } catch (error) {
        console.error(`[QueueMonitor] Error collecting metrics for queue ${queueName}:`, error);
      }
    }
  }

  // Check for queue health alerts
  private checkQueueHealthAlerts(metrics: QueueHealthMetrics): void {
    // Alert on too many waiting jobs
    if (metrics.waiting > QUEUE_ALERT_THRESHOLDS.MAX_WAITING_JOBS) {
      apm.triggerAlert({
        level: 'warning',
        component: 'queue',
        message: `High number of waiting jobs in queue ${metrics.queueName}: ${metrics.waiting}`,
        metrics: { queueName: metrics.queueName, waitingJobs: metrics.waiting },
      });
    }

    // Alert on too many failed jobs
    if (metrics.failed > QUEUE_ALERT_THRESHOLDS.MAX_FAILED_JOBS) {
      apm.triggerAlert({
        level: 'error',
        component: 'queue',
        message: `High number of failed jobs in queue ${metrics.queueName}: ${metrics.failed}`,
        metrics: { queueName: metrics.queueName, failedJobs: metrics.failed },
      });
    }

    // Alert on queue depth
    const totalJobs = metrics.waiting + metrics.active + metrics.delayed;
    if (totalJobs > QUEUE_ALERT_THRESHOLDS.MAX_QUEUE_DEPTH) {
      apm.triggerAlert({
        level: 'warning',
        component: 'queue',
        message: `High queue depth in ${metrics.queueName}: ${totalJobs} jobs`,
        metrics: { queueName: metrics.queueName, totalJobs },
      });
    }

    // Alert if queue is paused unexpectedly
    if (metrics.paused) {
      apm.triggerAlert({
        level: 'warning',
        component: 'queue',
        message: `Queue ${metrics.queueName} is paused`,
        metrics: { queueName: metrics.queueName, paused: true },
      });
    }
  }

  // Get queue health metrics
  getQueueHealth(queueName: string): QueueHealthMetrics | null {
    const history = this.metricsHistory.get(queueName);
    return history && history.length > 0 ? history[history.length - 1] : null;
  }

  // Get all queue health metrics
  getAllQueueHealth(): Map<string, QueueHealthMetrics> {
    const result = new Map<string, QueueHealthMetrics>();
    
    for (const [queueName, history] of this.metricsHistory.entries()) {
      if (history.length > 0) {
        result.set(queueName, history[history.length - 1]);
      }
    }
    
    return result;
  }

  // Get queue performance statistics
  getQueuePerformanceStats(queueName: string, timeWindowMinutes: number = 60): QueuePerformanceStats | null {
    const jobHistory = this.jobMetricsHistory.get(queueName);
    if (!jobHistory || jobHistory.length === 0) {
      return null;
    }

    const now = Date.now();
    const timeWindow = timeWindowMinutes * 60 * 1000;
    const recentJobs = jobHistory.filter(job => 
      now - job.createdAt.getTime() <= timeWindow
    );

    if (recentJobs.length === 0) {
      return null;
    }

    // Calculate throughput
    const completedJobs = recentJobs.filter(job => 
      job.status === 'completed' || job.status === 'failed'
    );
    const jobsPerMinute = (completedJobs.length / timeWindowMinutes);
    const jobsPerHour = jobsPerMinute * 60;

    // Calculate average processing time
    const jobsWithProcessingTime = recentJobs.filter(job => job.processingTime !== undefined);
    const averageProcessingTime = jobsWithProcessingTime.length > 0
      ? jobsWithProcessingTime.reduce((sum, job) => sum + (job.processingTime || 0), 0) / jobsWithProcessingTime.length
      : 0;

    // Calculate average wait time
    const jobsWithWaitTime = recentJobs.filter(job => job.waitTime !== undefined);
    const averageWaitTime = jobsWithWaitTime.length > 0
      ? jobsWithWaitTime.reduce((sum, job) => sum + (job.waitTime || 0), 0) / jobsWithWaitTime.length
      : 0;

    // Calculate success and error rates
    const successfulJobs = recentJobs.filter(job => job.status === 'completed').length;
    const failedJobs = recentJobs.filter(job => job.status === 'failed').length;
    const totalProcessedJobs = successfulJobs + failedJobs;
    
    const successRate = totalProcessedJobs > 0 ? (successfulJobs / totalProcessedJobs) * 100 : 0;
    const errorRate = totalProcessedJobs > 0 ? (failedJobs / totalProcessedJobs) * 100 : 0;

    // Calculate retry rate
    const jobsWithRetries = recentJobs.filter(job => job.attempts > 1).length;
    const retryRate = recentJobs.length > 0 ? (jobsWithRetries / recentJobs.length) * 100 : 0;

    return {
      queueName,
      throughput: {
        jobsPerMinute: Math.round(jobsPerMinute * 100) / 100,
        jobsPerHour: Math.round(jobsPerHour * 100) / 100,
      },
      averageProcessingTime: Math.round(averageProcessingTime * 100) / 100,
      averageWaitTime: Math.round(averageWaitTime * 100) / 100,
      successRate: Math.round(successRate * 100) / 100,
      errorRate: Math.round(errorRate * 100) / 100,
      retryRate: Math.round(retryRate * 100) / 100,
      timestamp: new Date(),
    };
  }

  // Get job metrics for a specific queue
  getJobMetrics(queueName: string, limit: number = 100): JobMetrics[] {
    const history = this.jobMetricsHistory.get(queueName) || [];
    return history.slice(-limit);
  }

  // Get failed jobs for analysis
  getFailedJobs(queueName: string, limit: number = 50): JobMetrics[] {
    const history = this.jobMetricsHistory.get(queueName) || [];
    return history
      .filter(job => job.status === 'failed')
      .slice(-limit);
  }

  // Get slow jobs for analysis
  getSlowJobs(queueName: string, thresholdMs: number = 10000, limit: number = 50): JobMetrics[] {
    const history = this.jobMetricsHistory.get(queueName) || [];
    return history
      .filter(job => job.processingTime && job.processingTime > thresholdMs)
      .sort((a, b) => (b.processingTime || 0) - (a.processingTime || 0))
      .slice(0, limit);
  }

  // Cleanup old metrics
  private cleanupOldMetrics(): void {
    const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);

    // Cleanup queue health metrics
    for (const [queueName, history] of this.metricsHistory.entries()) {
      const filteredHistory = history.filter(metrics => 
        metrics.timestamp.getTime() > oneDayAgo
      );
      this.metricsHistory.set(queueName, filteredHistory);
    }

    // Cleanup job metrics
    for (const [queueName, history] of this.jobMetricsHistory.entries()) {
      const filteredHistory = history.filter(job => 
        job.createdAt.getTime() > oneDayAgo
      );
      this.jobMetricsHistory.set(queueName, filteredHistory);
    }

    console.log('[QueueMonitor] Old metrics cleaned up');
  }

  // Get comprehensive queue dashboard data
  getQueueDashboard(): {
    overview: {
      totalQueues: number;
      totalJobs: number;
      activeJobs: number;
      failedJobs: number;
    };
    queues: Array<{
      name: string;
      health: QueueHealthMetrics;
      performance: QueuePerformanceStats | null;
    }>;
  } {
    const allHealth = this.getAllQueueHealth();
    const queues: Array<{
      name: string;
      health: QueueHealthMetrics;
      performance: QueuePerformanceStats | null;
    }> = [];

    let totalJobs = 0;
    let activeJobs = 0;
    let failedJobs = 0;

    for (const [queueName, health] of allHealth.entries()) {
      const performance = this.getQueuePerformanceStats(queueName);
      
      queues.push({
        name: queueName,
        health,
        performance,
      });

      totalJobs += health.waiting + health.active + health.completed + health.failed + health.delayed;
      activeJobs += health.active;
      failedJobs += health.failed;
    }

    return {
      overview: {
        totalQueues: allHealth.size,
        totalJobs,
        activeJobs,
        failedJobs,
      },
      queues,
    };
  }

  // Pause a queue
  async pauseQueue(queueName: string): Promise<boolean> {
    const queue = this.monitoredQueues.get(queueName);
    if (!queue) {
      console.error(`[QueueMonitor] Queue not found: ${queueName}`);
      return false;
    }

    try {
      await queue.pause();
      console.log(`[QueueMonitor] Queue paused: ${queueName}`);
      
      apm.triggerAlert({
        level: 'info',
        component: 'queue',
        message: `Queue manually paused: ${queueName}`,
        metrics: { queueName, action: 'pause' },
      });

      return true;
    } catch (error) {
      console.error(`[QueueMonitor] Error pausing queue ${queueName}:`, error);
      return false;
    }
  }

  // Resume a queue
  async resumeQueue(queueName: string): Promise<boolean> {
    const queue = this.monitoredQueues.get(queueName);
    if (!queue) {
      console.error(`[QueueMonitor] Queue not found: ${queueName}`);
      return false;
    }

    try {
      await queue.resume();
      console.log(`[QueueMonitor] Queue resumed: ${queueName}`);
      
      apm.triggerAlert({
        level: 'info',
        component: 'queue',
        message: `Queue manually resumed: ${queueName}`,
        metrics: { queueName, action: 'resume' },
      });

      return true;
    } catch (error) {
      console.error(`[QueueMonitor] Error resuming queue ${queueName}:`, error);
      return false;
    }
  }

  // Clean failed jobs from a queue
  async cleanFailedJobs(queueName: string): Promise<number> {
    const queue = this.monitoredQueues.get(queueName);
    if (!queue) {
      console.error(`[QueueMonitor] Queue not found: ${queueName}`);
      return 0;
    }

    try {
      const cleaned = await queue.clean(0, 0, 'failed');
      console.log(`[QueueMonitor] Cleaned ${cleaned.length} failed jobs from queue: ${queueName}`);
      
      apm.triggerAlert({
        level: 'info',
        component: 'queue',
        message: `Cleaned ${cleaned.length} failed jobs from queue: ${queueName}`,
        metrics: { queueName, cleanedJobs: cleaned.length },
      });

      return cleaned.length;
    } catch (error) {
      console.error(`[QueueMonitor] Error cleaning failed jobs from queue ${queueName}:`, error);
      return 0;
    }
  }

  // Graceful shutdown
  async shutdown(): Promise<void> {
    try {
      console.log('[QueueMonitor] Shutting down queue monitor...');

      // Remove event listeners
      for (const [queueName, queue] of this.monitoredQueues.entries()) {
        queue.removeAllListeners();
      }

      // Close QueueEvents
      for (const events of this.queueEventsMap.values()) {
        await events.close();
      }
      this.queueEventsMap.clear();

      // Clear monitoring data
      this.monitoredQueues.clear();
      this.metricsHistory.clear();
      this.jobMetricsHistory.clear();

      console.log('[QueueMonitor] Queue monitor shutdown completed');
    } catch (error) {
      console.error('[QueueMonitor] Error during shutdown:', error);
    }
  }
}

// Global queue monitor instance
export const queueMonitor = QueueMonitor.getInstance();

// Utility functions
export function registerQueueForMonitoring(queue: Queue, queueName?: string): void {
  queueMonitor.registerQueue(queue, queueName);
}

export function getQueueHealth(queueName: string): QueueHealthMetrics | null {
  return queueMonitor.getQueueHealth(queueName);
}

export function getQueuePerformanceStats(queueName: string, timeWindowMinutes?: number): QueuePerformanceStats | null {
  return queueMonitor.getQueuePerformanceStats(queueName, timeWindowMinutes);
}

export function getQueueDashboard() {
  return queueMonitor.getQueueDashboard();
}

// Initialize queue monitoring for existing queues
export async function initializeQueueMonitoring(): Promise<void> {
  try {
    // Import and register existing queues
    const { respostaRapidaQueue } = await import('../queue/resposta-rapida.queue');
    const { persistenciaCredenciaisQueue } = await import('../queue/persistencia-credenciais.queue');

    registerQueueForMonitoring(respostaRapidaQueue, 'resposta-rapida');
    registerQueueForMonitoring(persistenciaCredenciaisQueue, 'persistencia-credenciais');

    console.log('[QueueMonitor] Queue monitoring initialized for existing queues');
  } catch (error) {
    console.error('[QueueMonitor] Error initializing queue monitoring:', error);
  }
}

