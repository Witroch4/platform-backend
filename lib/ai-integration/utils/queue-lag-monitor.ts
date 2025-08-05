/**
 * Queue Lag Monitoring
 * Based on requirements 10.4, 11.2
 */

import { aiMetrics } from './metrics';
import { aiLogger } from './logger';

export interface QueueLagConfig {
  enabled: boolean;
  intervalSeconds: number;
  alertThresholdMs: number;
  criticalThresholdMs: number;
  queues: string[];
}

export interface QueueLagMeasurement {
  queueName: string;
  timestamp: number;
  lagMs: number;
  jobsWaiting: number;
  jobsActive: number;
  oldestJobAge?: number;
  averageWaitTime?: number;
}

export interface QueueLagReport {
  timestamp: number;
  measurements: QueueLagMeasurement[];
  overallMaxLag: number;
  alertingQueues: string[];
  criticalQueues: string[];
}

export class QueueLagMonitor {
  private config: QueueLagConfig;
  private intervalId: NodeJS.Timeout | null = null;
  private running = false;
  private lagHistory: Map<string, QueueLagMeasurement[]> = new Map();

  constructor(config: Partial<QueueLagConfig> = {}) {
    this.config = {
      enabled: config.enabled ?? (process.env.QUEUE_LAG_MONITORING_ENABLED === 'true'),
      intervalSeconds: config.intervalSeconds ?? parseInt(process.env.QUEUE_LAG_INTERVAL_SECONDS || '30'),
      alertThresholdMs: config.alertThresholdMs ?? parseInt(process.env.QUEUE_LAG_ALERT_THRESHOLD || '30000'), // 30s
      criticalThresholdMs: config.criticalThresholdMs ?? parseInt(process.env.QUEUE_LAG_CRITICAL_THRESHOLD || '120000'), // 2min
      queues: config.queues ?? (process.env.QUEUE_LAG_MONITOR_QUEUES?.split(',') || [
        'ai:incoming-message',
        'ai:embedding-upsert',
      ]),
    };
  }

  // Measure lag for a specific queue
  private async measureQueueLag(queueName: string): Promise<QueueLagMeasurement> {
    const startTime = Date.now();

    try {
      // This would typically integrate with BullMQ to get actual queue stats
      // For now, we'll simulate the measurement based on available metrics
      
      const queueMetrics = aiMetrics.getMetrics().filter(m => 
        m.name === 'ai_jobs_in_queue' && 
        m.labels.queue_name === queueName
      );

      const jobsWaiting = queueMetrics.length > 0 ? 
        (queueMetrics[0].type === 'histogram' ? queueMetrics[0].count : queueMetrics[0].value) : 0;
      const jobsActive = 0; // Would need separate metric

      // Calculate lag based on job timestamps (simplified)
      // In a real implementation, this would examine the oldest job in the queue
      let lagMs = 0;
      let oldestJobAge: number | undefined;
      let averageWaitTime: number | undefined;

      if (jobsWaiting > 0) {
        // Estimate lag based on queue size and processing rate
        // This is a simplified calculation - real implementation would use job timestamps
        const processingRate = this.estimateProcessingRate(queueName);
        if (processingRate > 0) {
          lagMs = (jobsWaiting / processingRate) * 1000; // Convert to milliseconds
        }

        // Simulate oldest job age (in real implementation, get from queue)
        oldestJobAge = Math.min(lagMs, 300000); // Cap at 5 minutes for simulation
        averageWaitTime = lagMs / 2; // Rough estimate
      }

      const measurement: QueueLagMeasurement = {
        queueName,
        timestamp: Date.now(),
        lagMs,
        jobsWaiting,
        jobsActive,
        oldestJobAge,
        averageWaitTime,
      };

      // Record metrics
      aiMetrics.recordQueueLag(queueName, lagMs);

      // Store in history
      this.storeInHistory(queueName, measurement);

      // Check for alerts
      this.checkLagAlerts(measurement);

      return measurement;

    } catch (error) {
      aiLogger.errorWithStack(`Failed to measure queue lag for ${queueName}`, error as Error, {
        stage: 'admin',
        metadata: { queueName },
      });

      // Return zero lag on error
      return {
        queueName,
        timestamp: Date.now(),
        lagMs: 0,
        jobsWaiting: 0,
        jobsActive: 0,
      };
    }
  }

  // Estimate processing rate for a queue (jobs per second)
  private estimateProcessingRate(queueName: string): number {
    // This would typically look at recent job completion metrics
    // For now, return a default rate
    const defaultRates: Record<string, number> = {
      'ai:incoming-message': 2, // 2 jobs per second
      'ai:embedding-upsert': 0.5, // 0.5 jobs per second
    };

    return defaultRates[queueName] || 1;
  }

  // Store measurement in history
  private storeInHistory(queueName: string, measurement: QueueLagMeasurement): void {
    if (!this.lagHistory.has(queueName)) {
      this.lagHistory.set(queueName, []);
    }

    const history = this.lagHistory.get(queueName)!;
    history.push(measurement);

    // Keep only last 100 measurements per queue
    if (history.length > 100) {
      history.shift();
    }
  }

  // Check for lag alerts
  private checkLagAlerts(measurement: QueueLagMeasurement): void {
    if (measurement.lagMs >= this.config.criticalThresholdMs) {
      aiLogger.error('Critical queue lag detected', {
        stage: 'admin',
        metadata: {
          queueName: measurement.queueName,
          lagMs: measurement.lagMs,
          threshold: this.config.criticalThresholdMs,
          jobsWaiting: measurement.jobsWaiting,
        },
      });

      aiMetrics.incrementJobsTotal('queue_lag_alert', 'critical', {
        queue_name: measurement.queueName,
      });

    } else if (measurement.lagMs >= this.config.alertThresholdMs) {
      aiLogger.warn('High queue lag detected', {
        stage: 'admin',
        metadata: {
          queueName: measurement.queueName,
          lagMs: measurement.lagMs,
          threshold: this.config.alertThresholdMs,
          jobsWaiting: measurement.jobsWaiting,
        },
      });

      aiMetrics.incrementJobsTotal('queue_lag_alert', 'warning', {
        queue_name: measurement.queueName,
      });
    }
  }

  // Measure lag for all configured queues
  private async measureAllQueues(): Promise<QueueLagReport> {
    const startTime = Date.now();

    try {
      aiLogger.debug('Starting queue lag measurement cycle', {
        stage: 'admin',
        metadata: {
          queues: this.config.queues,
        },
      });

      const measurements = await Promise.all(
        this.config.queues.map(queueName => this.measureQueueLag(queueName))
      );

      const overallMaxLag = Math.max(...measurements.map(m => m.lagMs));
      const alertingQueues = measurements
        .filter(m => m.lagMs >= this.config.alertThresholdMs && m.lagMs < this.config.criticalThresholdMs)
        .map(m => m.queueName);
      const criticalQueues = measurements
        .filter(m => m.lagMs >= this.config.criticalThresholdMs)
        .map(m => m.queueName);

      const report: QueueLagReport = {
        timestamp: Date.now(),
        measurements,
        overallMaxLag,
        alertingQueues,
        criticalQueues,
      };

      const duration = Date.now() - startTime;

      aiLogger.debug('Queue lag measurement cycle completed', {
        stage: 'admin',
        duration,
        metadata: {
          queuesCount: measurements.length,
          overallMaxLag,
          alertingQueuesCount: alertingQueues.length,
          criticalQueuesCount: criticalQueues.length,
        },
      });

      // Record overall metrics
      aiMetrics.incrementJobsTotal('queue_lag_measurement', 'success');
      aiMetrics.recordJobLatency('queue_lag_measurement', duration);

      return report;

    } catch (error) {
      const duration = Date.now() - startTime;
      
      aiLogger.errorWithStack('Queue lag measurement cycle failed', error as Error, {
        stage: 'admin',
        duration,
      });

      aiMetrics.incrementJobsTotal('queue_lag_measurement', 'error');

      throw error;
    }
  }

  // Start periodic monitoring
  start(): void {
    if (!this.config.enabled) {
      aiLogger.info('Queue lag monitoring is disabled', {
        stage: 'admin',
        metadata: { enabled: this.config.enabled },
      });
      return;
    }

    if (this.running) {
      aiLogger.warn('Queue lag monitoring is already running', {
        stage: 'admin',
      });
      return;
    }

    this.running = true;

    aiLogger.info('Starting queue lag monitoring', {
      stage: 'admin',
      metadata: {
        intervalSeconds: this.config.intervalSeconds,
        alertThresholdMs: this.config.alertThresholdMs,
        criticalThresholdMs: this.config.criticalThresholdMs,
        queues: this.config.queues,
      },
    });

    // Run immediately
    this.measureAllQueues().catch(error => {
      aiLogger.errorWithStack('Initial queue lag measurement failed', error, {
        stage: 'admin',
      });
    });

    // Schedule periodic runs
    this.intervalId = setInterval(async () => {
      try {
        await this.measureAllQueues();
      } catch (error) {
        aiLogger.errorWithStack('Scheduled queue lag measurement failed', error as Error, {
          stage: 'admin',
        });
      }
    }, this.config.intervalSeconds * 1000);
  }

  // Stop monitoring
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    this.running = false;

    aiLogger.info('Queue lag monitoring stopped', {
      stage: 'admin',
    });
  }

  // Get current status
  getStatus(): {
    running: boolean;
    config: QueueLagConfig;
    nextRun?: Date;
  } {
    return {
      running: this.running,
      config: this.config,
      nextRun: this.intervalId ? new Date(Date.now() + this.config.intervalSeconds * 1000) : undefined,
    };
  }

  // Get latest measurements
  getLatestMeasurements(): QueueLagMeasurement[] {
    const latest: QueueLagMeasurement[] = [];

    for (const queueName of this.config.queues) {
      const history = this.lagHistory.get(queueName);
      if (history && history.length > 0) {
        latest.push(history[history.length - 1]);
      }
    }

    return latest;
  }

  // Get lag history for a queue
  getQueueHistory(queueName: string, limit: number = 50): QueueLagMeasurement[] {
    const history = this.lagHistory.get(queueName) || [];
    return history.slice(-limit);
  }

  // Get lag statistics for a queue
  getQueueStats(queueName: string, windowMinutes: number = 60): {
    averageLag: number;
    maxLag: number;
    minLag: number;
    p95Lag: number;
    measurementsCount: number;
  } {
    const history = this.lagHistory.get(queueName) || [];
    const cutoffTime = Date.now() - (windowMinutes * 60 * 1000);
    const recentMeasurements = history.filter(m => m.timestamp >= cutoffTime);

    if (recentMeasurements.length === 0) {
      return {
        averageLag: 0,
        maxLag: 0,
        minLag: 0,
        p95Lag: 0,
        measurementsCount: 0,
      };
    }

    const lags = recentMeasurements.map(m => m.lagMs).sort((a, b) => a - b);
    const averageLag = lags.reduce((sum, lag) => sum + lag, 0) / lags.length;
    const maxLag = Math.max(...lags);
    const minLag = Math.min(...lags);
    const p95Index = Math.floor(lags.length * 0.95);
    const p95Lag = lags[p95Index] || 0;

    return {
      averageLag,
      maxLag,
      minLag,
      p95Lag,
      measurementsCount: recentMeasurements.length,
    };
  }

  // Force measurement
  async forceMeasurement(): Promise<QueueLagReport> {
    aiLogger.info('Force running queue lag measurement', {
      stage: 'admin',
    });

    return await this.measureAllQueues();
  }

  // Update configuration
  updateConfig(newConfig: Partial<QueueLagConfig>): void {
    const wasRunning = this.running;
    
    if (wasRunning) {
      this.stop();
    }

    this.config = { ...this.config, ...newConfig };

    if (wasRunning && this.config.enabled) {
      this.start();
    }

    aiLogger.info('Queue lag monitoring configuration updated', {
      stage: 'admin',
      metadata: {
        newConfig,
        restarted: wasRunning && this.config.enabled,
      },
    });
  }

  // Clear history
  clearHistory(): void {
    const totalMeasurements = Array.from(this.lagHistory.values())
      .reduce((sum, history) => sum + history.length, 0);

    this.lagHistory.clear();

    aiLogger.info('Queue lag history cleared', {
      stage: 'admin',
      metadata: { clearedMeasurements: totalMeasurements },
    });
  }
}

// Global queue lag monitor
export const queueLagMonitor = new QueueLagMonitor();

// Auto-start if enabled
if (process.env.NODE_ENV !== 'test') {
  queueLagMonitor.start();
}

export default QueueLagMonitor;