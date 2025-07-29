/**
 * Instagram Translation Queue Monitor
 * 
 * Monitoring and health check utilities for Instagram translation queue
 */

import { 
  instagramTranslationQueue,
  INSTAGRAM_TRANSLATION_QUEUE_NAME,
  getQueueHealth,
  cleanupOldJobs,
} from '../queue/instagram-translation.queue';
import { getCommunicationManager } from './communication-manager';
import { getGlobalErrorSummary } from '../error-handling/instagram-translation-errors';
import { EventEmitter } from 'events';

// Health Status Types
export interface QueueHealthStatus {
  name: string;
  status: 'healthy' | 'warning' | 'critical' | 'error';
  counts: {
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
  };
  performance: {
    throughput: number; // jobs/minute
    avgProcessingTime: number; // milliseconds
    successRate: number; // percentage
    errorRate: number; // percentage
  };
  resources: {
    memoryUsage: number; // bytes
    redisConnections: number;
  };
  lastUpdated: Date;
  alerts: HealthAlert[];
}

export interface HealthAlert {
  id: string;
  severity: 'warning' | 'critical';
  message: string;
  timestamp: Date;
  resolved: boolean;
}

export interface PerformanceMetrics {
  timestamp: Date;
  jobsProcessed: number;
  avgProcessingTime: number;
  successCount: number;
  failureCount: number;
  queueDepth: number;
  memoryUsage: number;
}

/**
 * Queue Monitor Class
 */
export class InstagramTranslationQueueMonitor extends EventEmitter {
  private isMonitoring = false;
  private monitoringInterval?: NodeJS.Timeout;
  private cleanupInterval?: NodeJS.Timeout;
  private metricsHistory: PerformanceMetrics[] = [];
  private maxHistorySize = 1000;
  private alerts = new Map<string, HealthAlert>();

  constructor(
    private monitorIntervalMs: number = 30000, // 30 seconds
    private cleanupIntervalMs: number = 300000 // 5 minutes
  ) {
    super();
  }

  /**
   * Start monitoring the queue
   */
  async startMonitoring(): Promise<void> {
    if (this.isMonitoring) {
      console.warn('[Instagram Translation Monitor] Already monitoring');
      return;
    }

    console.log('[Instagram Translation Monitor] Starting queue monitoring');
    this.isMonitoring = true;

    // Start periodic health checks
    this.monitoringInterval = setInterval(
      () => this.performHealthCheck(),
      this.monitorIntervalMs
    );

    // Start periodic cleanup
    this.cleanupInterval = setInterval(
      () => this.performCleanup(),
      this.cleanupIntervalMs
    );

    // Perform initial health check
    await this.performHealthCheck();
  }

  /**
   * Stop monitoring the queue
   */
  stopMonitoring(): void {
    if (!this.isMonitoring) {
      return;
    }

    console.log('[Instagram Translation Monitor] Stopping queue monitoring');
    this.isMonitoring = false;

    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
    }

    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
    }
  }

  /**
   * Perform comprehensive health check
   */
  async performHealthCheck(): Promise<QueueHealthStatus> {
    try {
      const startTime = Date.now();
      
      // Get basic queue health
      const basicHealth = await getQueueHealth();
      
      // Get performance metrics
      const performance = await this.calculatePerformanceMetrics();
      
      // Get resource usage
      const resources = await this.getResourceUsage();
      
      // Evaluate alerts
      const alerts = this.evaluateAlerts(basicHealth, performance, resources);
      
      // Determine overall status
      const status = this.determineOverallStatus(alerts);
      
      const healthStatus: QueueHealthStatus = {
        name: INSTAGRAM_TRANSLATION_QUEUE_NAME,
        status,
        counts: basicHealth.counts,
        performance,
        resources,
        lastUpdated: new Date(),
        alerts,
      };

      // Store metrics for history
      this.storeMetrics({
        timestamp: new Date(),
        jobsProcessed: basicHealth.counts.completed,
        avgProcessingTime: performance.avgProcessingTime,
        successCount: basicHealth.counts.completed,
        failureCount: basicHealth.counts.failed,
        queueDepth: basicHealth.counts.waiting + basicHealth.counts.active,
        memoryUsage: resources.memoryUsage,
      });

      // Emit health status event
      this.emit('health-check', healthStatus);

      const checkDuration = Date.now() - startTime;
      console.log(`[Instagram Translation Monitor] Health check completed in ${checkDuration}ms - Status: ${status}`);

      return healthStatus;
    } catch (error) {
      console.error('[Instagram Translation Monitor] Health check failed:', error);
      
      const errorStatus: QueueHealthStatus = {
        name: INSTAGRAM_TRANSLATION_QUEUE_NAME,
        status: 'error',
        counts: { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 },
        performance: { throughput: 0, avgProcessingTime: 0, successRate: 0, errorRate: 100 },
        resources: { memoryUsage: 0, redisConnections: 0 },
        lastUpdated: new Date(),
        alerts: [{
          id: `health-check-error-${Date.now()}`,
          severity: 'critical',
          message: `Health check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          timestamp: new Date(),
          resolved: false,
        }],
      };

      this.emit('health-check', errorStatus);
      return errorStatus;
    }
  }

  /**
   * Calculate performance metrics
   */
  private async calculatePerformanceMetrics(): Promise<QueueHealthStatus['performance']> {
    const recentMetrics = this.getRecentMetrics(300000); // Last 5 minutes
    
    if (recentMetrics.length === 0) {
      return {
        throughput: 0,
        avgProcessingTime: 0,
        successRate: 0,
        errorRate: 0,
      };
    }

    // Calculate throughput (jobs per minute)
    const timeSpanMinutes = recentMetrics.length > 1 
      ? (recentMetrics[recentMetrics.length - 1].timestamp.getTime() - recentMetrics[0].timestamp.getTime()) / 60000
      : 1;
    
    const totalJobs = recentMetrics.reduce((sum, metric) => sum + metric.jobsProcessed, 0);
    const throughput = totalJobs / Math.max(timeSpanMinutes, 1);

    // Calculate average processing time
    const avgProcessingTime = recentMetrics.reduce((sum, metric) => sum + metric.avgProcessingTime, 0) / recentMetrics.length;

    // Calculate success and error rates
    const totalSuccess = recentMetrics.reduce((sum, metric) => sum + metric.successCount, 0);
    const totalFailures = recentMetrics.reduce((sum, metric) => sum + metric.failureCount, 0);
    const totalProcessed = totalSuccess + totalFailures;
    
    const successRate = totalProcessed > 0 ? (totalSuccess / totalProcessed) * 100 : 0;
    const errorRate = totalProcessed > 0 ? (totalFailures / totalProcessed) * 100 : 0;

    return {
      throughput,
      avgProcessingTime,
      successRate,
      errorRate,
    };
  }

  /**
   * Get resource usage information
   */
  private async getResourceUsage(): Promise<QueueHealthStatus['resources']> {
    const memoryUsage = process.memoryUsage();
    
    // Get communication manager health
    const commManager = getCommunicationManager();
    const commHealth = await commManager.getHealthStatus();
    
    return {
      memoryUsage: memoryUsage.heapUsed,
      redisConnections: commHealth.subscriber && commHealth.publisher ? 2 : 0,
    };
  }

  /**
   * Evaluate health alerts
   */
  private evaluateAlerts(
    basicHealth: any,
    performance: QueueHealthStatus['performance'],
    resources: QueueHealthStatus['resources']
  ): HealthAlert[] {
    const alerts: HealthAlert[] = [];
    const now = new Date();

    // Queue depth alert
    const queueDepth = basicHealth.counts.waiting + basicHealth.counts.active;
    if (queueDepth > 100) {
      alerts.push({
        id: 'queue-depth-high',
        severity: queueDepth > 500 ? 'critical' : 'warning',
        message: `High queue depth: ${queueDepth} jobs pending`,
        timestamp: now,
        resolved: false,
      });
    }

    // Error rate alert
    if (performance.errorRate > 10) {
      alerts.push({
        id: 'error-rate-high',
        severity: performance.errorRate > 25 ? 'critical' : 'warning',
        message: `High error rate: ${performance.errorRate.toFixed(1)}%`,
        timestamp: now,
        resolved: false,
      });
    }

    // Processing time alert
    if (performance.avgProcessingTime > 3000) {
      alerts.push({
        id: 'processing-time-high',
        severity: performance.avgProcessingTime > 5000 ? 'critical' : 'warning',
        message: `High processing time: ${performance.avgProcessingTime.toFixed(0)}ms`,
        timestamp: now,
        resolved: false,
      });
    }

    // Memory usage alert
    const memoryMB = resources.memoryUsage / (1024 * 1024);
    if (memoryMB > 500) {
      alerts.push({
        id: 'memory-usage-high',
        severity: memoryMB > 1000 ? 'critical' : 'warning',
        message: `High memory usage: ${memoryMB.toFixed(0)}MB`,
        timestamp: now,
        resolved: false,
      });
    }

    // Failed jobs alert
    if (basicHealth.counts.failed > 50) {
      alerts.push({
        id: 'failed-jobs-high',
        severity: basicHealth.counts.failed > 100 ? 'critical' : 'warning',
        message: `High number of failed jobs: ${basicHealth.counts.failed}`,
        timestamp: now,
        resolved: false,
      });
    }

    // Update alerts map
    for (const alert of alerts) {
      this.alerts.set(alert.id, alert);
    }

    return Array.from(this.alerts.values()).filter(alert => !alert.resolved);
  }

  /**
   * Determine overall health status
   */
  private determineOverallStatus(alerts: HealthAlert[]): QueueHealthStatus['status'] {
    if (alerts.some(alert => alert.severity === 'critical')) {
      return 'critical';
    }
    
    if (alerts.some(alert => alert.severity === 'warning')) {
      return 'warning';
    }
    
    return 'healthy';
  }

  /**
   * Store performance metrics
   */
  private storeMetrics(metrics: PerformanceMetrics): void {
    this.metricsHistory.push(metrics);
    
    // Keep only recent metrics
    if (this.metricsHistory.length > this.maxHistorySize) {
      this.metricsHistory = this.metricsHistory.slice(-this.maxHistorySize);
    }
  }

  /**
   * Get recent metrics within time range
   */
  private getRecentMetrics(timeRangeMs: number): PerformanceMetrics[] {
    const cutoff = Date.now() - timeRangeMs;
    return this.metricsHistory.filter(metric => metric.timestamp.getTime() >= cutoff);
  }

  /**
   * Perform cleanup operations
   */
  private async performCleanup(): Promise<void> {
    try {
      console.log('[Instagram Translation Monitor] Performing cleanup');
      
      // Clean up old jobs
      await cleanupOldJobs();
      
      // Clean up old metrics
      const oneHourAgo = Date.now() - (60 * 60 * 1000);
      this.metricsHistory = this.metricsHistory.filter(
        metric => metric.timestamp.getTime() >= oneHourAgo
      );
      
      // Resolve old alerts
      const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
      for (const [id, alert] of this.alerts.entries()) {
        if (alert.timestamp.getTime() < fiveMinutesAgo) {
          alert.resolved = true;
        }
      }
      
      console.log('[Instagram Translation Monitor] Cleanup completed');
    } catch (error) {
      console.error('[Instagram Translation Monitor] Cleanup failed:', error);
    }
  }

  /**
   * Get current health status
   */
  async getCurrentHealth(): Promise<QueueHealthStatus> {
    return this.performHealthCheck();
  }

  /**
   * Get metrics history
   */
  getMetricsHistory(timeRangeMs?: number): PerformanceMetrics[] {
    if (timeRangeMs) {
      return this.getRecentMetrics(timeRangeMs);
    }
    return [...this.metricsHistory];
  }

  /**
   * Get error summary
   */
  getErrorSummary(timeRangeMs?: number) {
    return getGlobalErrorSummary(timeRangeMs);
  }

  /**
   * Resolve alert
   */
  resolveAlert(alertId: string): boolean {
    const alert = this.alerts.get(alertId);
    if (alert) {
      alert.resolved = true;
      this.emit('alert-resolved', alert);
      return true;
    }
    return false;
  }

  /**
   * Get active alerts
   */
  getActiveAlerts(): HealthAlert[] {
    return Array.from(this.alerts.values()).filter(alert => !alert.resolved);
  }
}

// Singleton monitor instance
let queueMonitor: InstagramTranslationQueueMonitor | null = null;

/**
 * Get singleton queue monitor instance
 */
export function getQueueMonitor(): InstagramTranslationQueueMonitor {
  if (!queueMonitor) {
    queueMonitor = new InstagramTranslationQueueMonitor();
  }
  return queueMonitor;
}

/**
 * Start queue monitoring
 */
export async function startQueueMonitoring(): Promise<void> {
  const monitor = getQueueMonitor();
  await monitor.startMonitoring();
}

/**
 * Stop queue monitoring
 */
export function stopQueueMonitoring(): void {
  if (queueMonitor) {
    queueMonitor.stopMonitoring();
  }
}

/**
 * Get queue health status
 */
export async function getInstagramTranslationQueueHealth(): Promise<QueueHealthStatus> {
  const monitor = getQueueMonitor();
  return monitor.getCurrentHealth();
}