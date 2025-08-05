/**
 * SLO Measurement Jobs
 * Based on requirements 11.1, 11.2
 */

import { aiMetrics } from './metrics';
import { aiLogger } from './logger';
import { logAggregator } from './log-aggregation';

export interface SLOTarget {
  name: string;
  description: string;
  target: number;
  unit: string;
  measurement: 'latency' | 'availability' | 'error_rate' | 'throughput';
}

export interface SLOMeasurement {
  slo: string;
  timestamp: number;
  value: number;
  target: number;
  violated: boolean;
  windowMinutes: number;
  labels: Record<string, string>;
}

export interface SLOReport {
  timestamp: number;
  windowMinutes: number;
  measurements: SLOMeasurement[];
  overallCompliance: number;
  violationsCount: number;
}

export class SLOMeasurementService {
  private readonly sloTargets: SLOTarget[] = [
    {
      name: 'availability',
      description: 'Service availability (success rate)',
      target: 0.999, // 99.9%
      unit: 'percentage',
      measurement: 'availability',
    },
    {
      name: 'latency_p95',
      description: 'P95 latency for all operations',
      target: 2500, // 2.5 seconds
      unit: 'milliseconds',
      measurement: 'latency',
    },
    {
      name: 'latency_p99',
      description: 'P99 latency for all operations',
      target: 5000, // 5 seconds
      unit: 'milliseconds',
      measurement: 'latency',
    },
    {
      name: 'error_rate',
      description: 'Overall error rate',
      target: 0.001, // 0.1%
      unit: 'percentage',
      measurement: 'error_rate',
    },
    {
      name: 'webhook_latency_p95',
      description: 'P95 latency for webhook processing',
      target: 1000, // 1 second
      unit: 'milliseconds',
      measurement: 'latency',
    },
    {
      name: 'llm_latency_p95',
      description: 'P95 latency for LLM operations',
      target: 8000, // 8 seconds
      unit: 'milliseconds',
      measurement: 'latency',
    },
  ];

  // Calculate percentiles from histogram buckets
  private calculatePercentile(
    buckets: Array<{ le: number; count: number }>,
    totalCount: number,
    percentile: number
  ): number {
    if (totalCount === 0) return 0;

    const target = totalCount * (percentile / 100);
    let cumulativeCount = 0;

    for (const bucket of buckets) {
      cumulativeCount += bucket.count;
      if (cumulativeCount >= target) {
        return bucket.le === Infinity ? buckets[buckets.length - 2]?.le || 0 : bucket.le;
      }
    }

    return 0;
  }

  // Measure availability SLO
  private measureAvailability(windowMinutes: number, labels: Record<string, string> = {}): number {
    const metrics = aiMetrics.getMetrics();
    const jobMetrics = metrics.filter(m => 
      m.name === 'ai_jobs_total' && 
      Object.entries(labels).every(([key, value]) => m.labels[key] === value)
    );

    const totalJobs = jobMetrics.reduce((sum, m) => sum + (m.type === 'histogram' ? m.count : m.value), 0);
    const successJobs = jobMetrics
      .filter(m => m.labels.status === 'success')
      .reduce((sum, m) => sum + (m.type === 'histogram' ? m.count : m.value), 0);

    return totalJobs > 0 ? successJobs / totalJobs : 1;
  }

  // Measure error rate SLO
  private measureErrorRate(windowMinutes: number, labels: Record<string, string> = {}): number {
    const metrics = aiMetrics.getMetrics();
    const jobMetrics = metrics.filter(m => 
      m.name === 'ai_jobs_total' && 
      Object.entries(labels).every(([key, value]) => m.labels[key] === value)
    );

    const totalJobs = jobMetrics.reduce((sum, m) => sum + (m.type === 'histogram' ? m.count : m.value), 0);
    const errorJobs = jobMetrics
      .filter(m => m.labels.status === 'error')
      .reduce((sum, m) => sum + (m.type === 'histogram' ? m.count : m.value), 0);

    return totalJobs > 0 ? errorJobs / totalJobs : 0;
  }

  // Measure latency SLO
  private measureLatency(
    metricName: string,
    percentile: number,
    windowMinutes: number,
    labels: Record<string, string> = {}
  ): number {
    const metrics = aiMetrics.getMetrics();
    const latencyMetrics = metrics.filter(m => 
      m.name === metricName && 
      m.type === 'histogram' &&
      Object.entries(labels).every(([key, value]) => m.labels[key] === value)
    );

    if (latencyMetrics.length === 0) return 0;

    // Aggregate all buckets
    const allBuckets = new Map<number, number>();
    let totalCount = 0;

    latencyMetrics.forEach(metric => {
      if (metric.type === 'histogram') {
        totalCount += metric.count;
        metric.buckets.forEach(bucket => {
          allBuckets.set(bucket.le, (allBuckets.get(bucket.le) || 0) + bucket.count);
        });
      }
    });

    const bucketArray = Array.from(allBuckets.entries())
      .map(([le, count]) => ({ le, count }))
      .sort((a, b) => a.le - b.le);

    return this.calculatePercentile(bucketArray, totalCount, percentile);
  }

  // Perform SLO measurement for a specific target
  private measureSLO(
    target: SLOTarget,
    windowMinutes: number,
    labels: Record<string, string> = {}
  ): SLOMeasurement {
    let value: number;

    switch (target.measurement) {
      case 'availability':
        value = this.measureAvailability(windowMinutes, labels);
        break;
      case 'error_rate':
        value = this.measureErrorRate(windowMinutes, labels);
        break;
      case 'latency':
        if (target.name === 'latency_p95') {
          value = this.measureLatency('ai_job_latency_ms', 95, windowMinutes, labels);
        } else if (target.name === 'latency_p99') {
          value = this.measureLatency('ai_job_latency_ms', 99, windowMinutes, labels);
        } else if (target.name === 'webhook_latency_p95') {
          value = this.measureLatency('ai_job_latency_ms', 95, windowMinutes, { ...labels, stage: 'webhook' });
        } else if (target.name === 'llm_latency_p95') {
          value = this.measureLatency('ai_llm_response_time_ms', 95, windowMinutes, labels);
        } else {
          value = 0;
        }
        break;
      default:
        value = 0;
    }

    const violated = target.measurement === 'error_rate' ? 
      value > target.target : 
      (target.measurement === 'availability' ? value < target.target : value > target.target);

    return {
      slo: target.name,
      timestamp: Date.now(),
      value,
      target: target.target,
      violated,
      windowMinutes,
      labels,
    };
  }

  // Generate comprehensive SLO report
  generateSLOReport(windowMinutes: number = 60, labels: Record<string, string> = {}): SLOReport {
    const startTime = Date.now();

    try {
      const measurements = this.sloTargets.map(target => 
        this.measureSLO(target, windowMinutes, labels)
      );

      const violationsCount = measurements.filter(m => m.violated).length;
      const overallCompliance = (measurements.length - violationsCount) / measurements.length;

      // Record SLO violations as metrics
      measurements.forEach(measurement => {
        if (measurement.violated) {
          aiMetrics.incrementSLOViolations({
            slo: measurement.slo,
            ...measurement.labels,
          });
        }
      });

      const report: SLOReport = {
        timestamp: Date.now(),
        windowMinutes,
        measurements,
        overallCompliance,
        violationsCount,
      };

      const duration = Date.now() - startTime;
      aiLogger.info('SLO report generated', {
        stage: 'admin',
        duration,
        metadata: {
          windowMinutes,
          measurementsCount: measurements.length,
          violationsCount,
          overallCompliance,
        },
      });

      return report;

    } catch (error) {
      const duration = Date.now() - startTime;
      aiLogger.errorWithStack('SLO report generation failed', error as Error, {
        stage: 'admin',
        duration,
        metadata: { windowMinutes },
      });

      throw error;
    }
  }

  // Generate SLO report by account
  generateAccountSLOReport(accountId: number, windowMinutes: number = 60): SLOReport {
    return this.generateSLOReport(windowMinutes, { account_id: accountId.toString() });
  }

  // Generate SLO report by channel
  generateChannelSLOReport(channel: string, windowMinutes: number = 60): SLOReport {
    return this.generateSLOReport(windowMinutes, { channel });
  }

  // Get SLO targets configuration
  getSLOTargets(): SLOTarget[] {
    return [...this.sloTargets];
  }

  // Check if any SLOs are currently violated
  checkCurrentSLOViolations(windowMinutes: number = 5): SLOMeasurement[] {
    const report = this.generateSLOReport(windowMinutes);
    return report.measurements.filter(m => m.violated);
  }

  // Get SLO compliance trend over time
  getSLOComplianceTrend(hours: number = 24): Array<{
    timestamp: number;
    compliance: number;
    violations: number;
  }> {
    // This would typically query historical data
    // For now, we'll return current compliance
    const report = this.generateSLOReport(60);
    
    return [{
      timestamp: report.timestamp,
      compliance: report.overallCompliance,
      violations: report.violationsCount,
    }];
  }

  // Calculate SLO burn rate (how fast we're consuming error budget)
  calculateSLOBurnRate(sloName: string, windowMinutes: number = 60): {
    burnRate: number;
    errorBudgetRemaining: number;
    timeToExhaustion?: number;
  } {
    const target = this.sloTargets.find(t => t.name === sloName);
    if (!target) {
      throw new Error(`SLO target not found: ${sloName}`);
    }

    const measurement = this.measureSLO(target, windowMinutes);
    
    // Calculate error budget (how much we can fail)
    let errorBudget: number;
    let currentError: number;

    if (target.measurement === 'availability') {
      errorBudget = 1 - target.target; // e.g., 0.001 for 99.9%
      currentError = 1 - measurement.value;
    } else if (target.measurement === 'error_rate') {
      errorBudget = target.target; // e.g., 0.001 for 0.1%
      currentError = measurement.value;
    } else {
      // For latency, we'll use a simplified approach
      errorBudget = 0.01; // 1% error budget
      currentError = measurement.violated ? 0.01 : 0;
    }

    const burnRate = currentError / errorBudget;
    const errorBudgetRemaining = Math.max(0, errorBudget - currentError);
    
    let timeToExhaustion: number | undefined;
    if (burnRate > 0 && errorBudgetRemaining > 0) {
      // Time in minutes to exhaust remaining error budget at current burn rate
      timeToExhaustion = (errorBudgetRemaining / burnRate) * windowMinutes;
    }

    return {
      burnRate,
      errorBudgetRemaining,
      timeToExhaustion,
    };
  }
}

// Global SLO measurement service
export const sloMeasurementService = new SLOMeasurementService();

// Convenience functions
export function generateSLOReport(windowMinutes?: number): SLOReport {
  return sloMeasurementService.generateSLOReport(windowMinutes);
}

export function checkSLOViolations(windowMinutes?: number): SLOMeasurement[] {
  return sloMeasurementService.checkCurrentSLOViolations(windowMinutes);
}

export function getSLOTargets(): SLOTarget[] {
  return sloMeasurementService.getSLOTargets();
}

export default SLOMeasurementService;