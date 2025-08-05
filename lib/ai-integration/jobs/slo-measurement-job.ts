/**
 * Periodic SLO Measurement Job
 * Based on requirements 11.1, 11.2
 */

import { sloMeasurementService } from '../utils/slo-measurement';
import { aiLogger } from '../utils/logger';
import { aiMetrics } from '../utils/metrics';

export interface SLOJobConfig {
  enabled: boolean;
  intervalMinutes: number;
  windowMinutes: number;
  alertThreshold: number; // Compliance percentage below which to alert
  accounts?: number[]; // Specific accounts to monitor, empty = all
  channels?: string[]; // Specific channels to monitor, empty = all
}

export class SLOMeasurementJob {
  private config: SLOJobConfig;
  private intervalId: NodeJS.Timeout | null = null;
  private running = false;

  constructor(config: Partial<SLOJobConfig> = {}) {
    this.config = {
      enabled: config.enabled ?? (process.env.SLO_MEASUREMENT_ENABLED === 'true'),
      intervalMinutes: config.intervalMinutes ?? parseInt(process.env.SLO_INTERVAL_MINUTES || '5'),
      windowMinutes: config.windowMinutes ?? parseInt(process.env.SLO_WINDOW_MINUTES || '60'),
      alertThreshold: config.alertThreshold ?? parseFloat(process.env.SLO_ALERT_THRESHOLD || '0.95'),
      accounts: config.accounts,
      channels: config.channels,
    };
  }

  // Start the periodic SLO measurement job
  start(): void {
    if (!this.config.enabled) {
      aiLogger.info('SLO measurement job is disabled', {
        stage: 'admin',
        metadata: { enabled: this.config.enabled },
      });
      return;
    }

    if (this.running) {
      aiLogger.warn('SLO measurement job is already running', {
        stage: 'admin',
      });
      return;
    }

    this.running = true;
    
    aiLogger.info('Starting SLO measurement job', {
      stage: 'admin',
      metadata: {
        intervalMinutes: this.config.intervalMinutes,
        windowMinutes: this.config.windowMinutes,
        alertThreshold: this.config.alertThreshold,
      },
    });

    // Run immediately
    this.runMeasurement();

    // Schedule periodic runs
    this.intervalId = setInterval(() => {
      this.runMeasurement();
    }, this.config.intervalMinutes * 60 * 1000);
  }

  // Stop the periodic job
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    this.running = false;

    aiLogger.info('SLO measurement job stopped', {
      stage: 'admin',
    });
  }

  // Run a single SLO measurement cycle
  private async runMeasurement(): Promise<void> {
    const startTime = Date.now();

    try {
      aiLogger.info('Starting SLO measurement cycle', {
        stage: 'admin',
        metadata: {
          windowMinutes: this.config.windowMinutes,
        },
      });

      // Generate overall SLO report
      const overallReport = sloMeasurementService.generateSLOReport(this.config.windowMinutes);
      
      // Check for violations and alert if needed
      if (overallReport.overallCompliance < this.config.alertThreshold) {
        aiLogger.warn('SLO compliance below threshold', {
          stage: 'admin',
          metadata: {
            compliance: overallReport.overallCompliance,
            threshold: this.config.alertThreshold,
            violations: overallReport.violationsCount,
          },
        });

        // Record alert metric
        aiMetrics.incrementJobsTotal('slo_alert', 'triggered', {
          compliance: overallReport.overallCompliance.toString(),
        });
      }

      // Generate account-specific reports if configured
      if (this.config.accounts && this.config.accounts.length > 0) {
        for (const accountId of this.config.accounts) {
          try {
            const accountReport = sloMeasurementService.generateAccountSLOReport(
              accountId,
              this.config.windowMinutes
            );

            if (accountReport.overallCompliance < this.config.alertThreshold) {
              aiLogger.warn('Account SLO compliance below threshold', {
                stage: 'admin',
                accountId,
                metadata: {
                  compliance: accountReport.overallCompliance,
                  violations: accountReport.violationsCount,
                },
              });
            }
          } catch (error) {
            aiLogger.errorWithStack(`Failed to generate SLO report for account ${accountId}`, error as Error, {
              stage: 'admin',
              accountId,
            });
          }
        }
      }

      // Generate channel-specific reports if configured
      if (this.config.channels && this.config.channels.length > 0) {
        for (const channel of this.config.channels) {
          try {
            const channelReport = sloMeasurementService.generateChannelSLOReport(
              channel,
              this.config.windowMinutes
            );

            if (channelReport.overallCompliance < this.config.alertThreshold) {
              aiLogger.warn('Channel SLO compliance below threshold', {
                stage: 'admin',
                metadata: {
                  channel,
                  compliance: channelReport.overallCompliance,
                  violations: channelReport.violationsCount,
                },
              });
            }
          } catch (error) {
            aiLogger.errorWithStack(`Failed to generate SLO report for channel ${channel}`, error as Error, {
              stage: 'admin',
              metadata: { channel },
            });
          }
        }
      }

      // Calculate burn rates for critical SLOs
      const criticalSLOs = ['availability', 'latency_p95', 'error_rate'];
      for (const sloName of criticalSLOs) {
        try {
          const burnRate = sloMeasurementService.calculateSLOBurnRate(sloName, this.config.windowMinutes);
          
          if (burnRate.burnRate > 1) { // Burning error budget faster than sustainable
            aiLogger.warn('High SLO burn rate detected', {
              stage: 'admin',
              metadata: {
                slo: sloName,
                burnRate: burnRate.burnRate,
                errorBudgetRemaining: burnRate.errorBudgetRemaining,
                timeToExhaustion: burnRate.timeToExhaustion,
              },
            });

            // Record burn rate metric
            aiMetrics.recordJobLatency('slo_burn_rate', burnRate.burnRate * 100, { slo: sloName });
          }
        } catch (error) {
          aiLogger.errorWithStack(`Failed to calculate burn rate for SLO ${sloName}`, error as Error, {
            stage: 'admin',
            metadata: { slo: sloName },
          });
        }
      }

      const duration = Date.now() - startTime;
      
      // Record successful measurement
      aiMetrics.incrementJobsTotal('slo_measurement', 'success');
      aiMetrics.recordJobLatency('slo_measurement', duration);

      aiLogger.info('SLO measurement cycle completed', {
        stage: 'admin',
        duration,
        metadata: {
          overallCompliance: overallReport.overallCompliance,
          violationsCount: overallReport.violationsCount,
          measurementsCount: overallReport.measurements.length,
        },
      });

    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Record failed measurement
      aiMetrics.incrementJobsTotal('slo_measurement', 'error');
      aiMetrics.recordJobLatency('slo_measurement', duration);

      aiLogger.errorWithStack('SLO measurement cycle failed', error as Error, {
        stage: 'admin',
        duration,
      });
    }
  }

  // Get current job status
  getStatus(): {
    running: boolean;
    config: SLOJobConfig;
    nextRun?: Date;
  } {
    return {
      running: this.running,
      config: this.config,
      nextRun: this.intervalId ? new Date(Date.now() + this.config.intervalMinutes * 60 * 1000) : undefined,
    };
  }

  // Update job configuration
  updateConfig(newConfig: Partial<SLOJobConfig>): void {
    const wasRunning = this.running;
    
    if (wasRunning) {
      this.stop();
    }

    this.config = { ...this.config, ...newConfig };

    if (wasRunning && this.config.enabled) {
      this.start();
    }

    aiLogger.info('SLO measurement job configuration updated', {
      stage: 'admin',
      metadata: {
        newConfig,
        restarted: wasRunning && this.config.enabled,
      },
    });
  }

  // Force run a measurement cycle
  async forceMeasurement(): Promise<void> {
    aiLogger.info('Force running SLO measurement', {
      stage: 'admin',
    });

    await this.runMeasurement();
  }
}

// Global SLO measurement job instance
export const sloMeasurementJob = new SLOMeasurementJob();

// Auto-start if enabled
if (process.env.NODE_ENV !== 'test') {
  sloMeasurementJob.start();
}

export default SLOMeasurementJob;