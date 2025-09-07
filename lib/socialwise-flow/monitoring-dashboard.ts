/**
 * SocialWise Flow Monitoring Dashboard and Alerting System
 * Implements real-time performance metrics collection, SLA violation alerts,
 * quality sampling, and health checks for embedding index and LLM availability
 */

import { createLogger } from '@/lib/utils/logger';
import { getRedisInstance } from '@/lib/connections';
import { openaiService } from '@/services/openai';
import { 
  collectPerformanceMetrics, 
  getClassificationRates, 
  getErrorRates, 
  getPerformancePercentiles,
  PerformanceMetrics 
} from './metrics';
import { apm, createAPMAlert, AlertLevel } from '@/lib/monitoring/application-performance-monitor';

// Configuration flags
const MONITORING_CONFIG = {
  // Health checks desabilitados para economizar custos da OpenAI
  // Para reabilitar, altere para true
  ENABLE_HEALTH_CHECKS: false,
  ENABLE_ALERT_CHECKS: false
} as const;

const dashboardLogger = createLogger('SocialWise-Dashboard');

// SLA Thresholds
export const SLA_THRESHOLDS = {
  // Latency SLAs (ms)
  HARD_BAND_MAX_MS: 120,
  SOFT_BAND_MAX_MS: 300,
  ROUTER_BAND_MAX_MS: 400,
  OVERALL_P95_MAX_MS: 400,
  
  // Error Rate SLAs (%)
  MAX_ERROR_RATE: 5,
  MAX_TIMEOUT_RATE: 2,
  MAX_ABORT_RATE: 1,
  
  // Quality SLAs
  MIN_HARD_ACCURACY: 90,      // % accuracy for HARD band
  MIN_SOFT_CTR: 35,           // % click-through rate for SOFT band
  MIN_ROUTER_VALID_TOPICS: 95,   // % valid topics for ROUTER band
  
  // Health Check SLAs
  MAX_EMBEDDING_LATENCY_MS: 2000,
  MAX_LLM_LATENCY_MS: 5000,
  MIN_EMBEDDING_SUCCESS_RATE: 95,
  MIN_LLM_SUCCESS_RATE: 98
} as const;

export interface DashboardMetrics {
  // Real-time performance
  currentLatency: {
    hard: number;
    soft: number;
    low: number;
    router: number;
    overall_p95: number;
  };
  
  // Classification rates
  classificationRates: {
    direct_map_rate: number;
    warmup_rate: number;
    vague_rate: number;
    router_rate: number;
  };
  
  // Error rates
  errorRates: {
    timeout_rate: number;
    json_parse_fail_rate: number;
    abort_rate: number;
    overall_error_rate: number;
  };
  
  // Health status
  healthStatus: {
    embedding_index: 'healthy' | 'degraded' | 'unavailable';
    llm_availability: 'healthy' | 'degraded' | 'unavailable';
    overall_status: 'healthy' | 'degraded' | 'critical';
  };
  
  // Quality metrics (sampled)
  qualityMetrics: {
    hard_accuracy: number;
    soft_ctr: number;
    router_valid_topics: number;
    sample_size: number;
  };
  
  // Alerts
  activeAlerts: Array<{
    id: string;
    level: AlertLevel;
    component: string;
    message: string;
    timestamp: Date;
  }>;
}

export interface QualitySample {
  trace_id: string;
  user_input_hash: string; // Hashed to avoid PII
  classification_result: string;
  generated_buttons?: string[];
  response_time_ms: number;
  user_satisfaction_score?: number;
  timestamp: Date;
  band: 'HARD' | 'SOFT' | 'ROUTER';
  strategy: string;
}

export class SocialWiseMonitoringDashboard {
  private static instance: SocialWiseMonitoringDashboard;
  private redis: ReturnType<typeof getRedisInstance>;
  private qualitySamples: QualitySample[] = [];
  private healthCheckInterval?: NodeJS.Timeout;
  private alertCheckInterval?: NodeJS.Timeout;
  
  private readonly QUALITY_SAMPLE_RATE = 0.1; // 10% sampling
  private readonly MAX_QUALITY_SAMPLES = 1000;
  private readonly HEALTH_CHECK_INTERVAL_MS = 300000; // 5 minutes (instead of 30 seconds)
  private readonly ALERT_CHECK_INTERVAL_MS = 300000; // 5 minutes (instead of 1 minute)

  constructor() {
    this.redis = getRedisInstance();
    this.startPeriodicTasks();
  }

  static getInstance(): SocialWiseMonitoringDashboard {
    if (!this.instance) {
      this.instance = new SocialWiseMonitoringDashboard();
    }
    return this.instance;
  }

  /**
   * Start periodic monitoring tasks
   */
  private startPeriodicTasks(): void {
    // Health checks - DESABILITADO para economizar custos da OpenAI
    if (MONITORING_CONFIG.ENABLE_HEALTH_CHECKS) {
      this.healthCheckInterval = setInterval(() => {
        this.performHealthChecks().catch(error => {
          dashboardLogger.error('Health check failed', { 
            error: error instanceof Error ? error.message : String(error) 
          });
        });
      }, this.HEALTH_CHECK_INTERVAL_MS);
      dashboardLogger.info('Health checks enabled (5-minute intervals)');
    } else {
      dashboardLogger.info('Health checks DISABLED to save OpenAI costs');
    }

    // Alert checks - DESABILITADO para economizar custos da OpenAI
    if (MONITORING_CONFIG.ENABLE_ALERT_CHECKS) {
      this.alertCheckInterval = setInterval(() => {
        this.checkSLAViolations().catch(error => {
          dashboardLogger.error('SLA check failed', { 
            error: error instanceof Error ? error.message : String(error) 
          });
        });
      }, this.ALERT_CHECK_INTERVAL_MS);
      dashboardLogger.info('Alert checks enabled (5-minute intervals)');
    } else {
      dashboardLogger.info('Alert checks DISABLED to save OpenAI costs');
    }
  }

  /**
   * Record quality sample (without sensitive data)
   */
  recordQualitySample(sample: Omit<QualitySample, 'user_input_hash' | 'timestamp'> & { 
    user_input: string 
  }): void {
    // Sample only a percentage of requests
    if (Math.random() > this.QUALITY_SAMPLE_RATE) {
      return;
    }

    // Hash user input to avoid storing PII
    const crypto = require('crypto');
    const userInputHash = crypto
      .createHash('sha256')
      .update(sample.user_input)
      .digest('hex')
      .substring(0, 16);

    const qualitySample: QualitySample = {
      ...sample,
      user_input_hash: userInputHash,
      timestamp: new Date()
    };

    this.qualitySamples.push(qualitySample);

    // Keep samples within limit
    if (this.qualitySamples.length > this.MAX_QUALITY_SAMPLES) {
      this.qualitySamples.shift();
    }

    // Store in Redis for persistence
    this.storeQualitySample(qualitySample).catch(error => {
      dashboardLogger.warn('Failed to store quality sample', { 
        error: error instanceof Error ? error.message : String(error) 
      });
    });
  }

  /**
   * Store quality sample in Redis
   */
  private async storeQualitySample(sample: QualitySample): Promise<void> {
    try {
      const key = `socialwise:quality:${sample.timestamp.toISOString().split('T')[0]}:${sample.trace_id}`;
      await this.redis.setex(key, 86400 * 7, JSON.stringify(sample)); // 7 days TTL
    } catch (error) {
      dashboardLogger.error('Failed to store quality sample in Redis', { 
        error: error instanceof Error ? error.message : String(error) 
      });
    }
  }

  /**
   * Perform automated health checks
   */
  private async performHealthChecks(): Promise<void> {
    try {
      const [embeddingHealth, llmHealth] = await Promise.allSettled([
        this.checkEmbeddingIndexHealth(),
        this.checkLLMAvailability() // Reabilitado com timeout de 5 minutos
      ]);

      // Process embedding health
      if (embeddingHealth.status === 'fulfilled') {
        await this.processEmbeddingHealthResult(embeddingHealth.value);
      } else {
        createAPMAlert({
          level: 'critical',
          component: 'socialwise-embedding',
          message: `Embedding health check failed: ${embeddingHealth.reason}`,
          metrics: { error: embeddingHealth.reason }
        });
      }

      // Process LLM health - Reabilitado
      if (llmHealth.status === 'fulfilled') {
        await this.processLLMHealthResult(llmHealth.value);
      } else {
        createAPMAlert({
          level: 'critical',
          component: 'socialwise-llm',
          message: `LLM health check failed: ${llmHealth.reason}`,
          metrics: { error: llmHealth.reason }
        });
      }

    } catch (error) {
      dashboardLogger.error('Health checks failed', { 
        error: error instanceof Error ? error.message : String(error) 
      });
    }
  }

  /**
   * Check embedding index health
   */
  private async checkEmbeddingIndexHealth(): Promise<{
    status: 'healthy' | 'degraded' | 'unavailable';
    latency: number;
    success_rate: number;
    error?: string;
  }> {
    const startTime = Date.now();
    
    try {
      // Test embedding generation with a simple text
      const testText = "test embedding health check";
      const embedding = await openaiService.getEmbeddings(testText);
      
      const latency = Date.now() - startTime;
      
      if (!embedding || embedding.length === 0) {
        return {
          status: 'unavailable',
          latency,
          success_rate: 0,
          error: 'Empty embedding response'
        };
      }

      // Check latency threshold
      const status = latency > SLA_THRESHOLDS.MAX_EMBEDDING_LATENCY_MS ? 'degraded' : 'healthy';
      
      return {
        status,
        latency,
        success_rate: 100, // Single test, so either 0 or 100
      };

    } catch (error) {
      const latency = Date.now() - startTime;
      return {
        status: 'unavailable',
        latency,
        success_rate: 0,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Check LLM availability
   */
  private async checkLLMAvailability(): Promise<{
    status: 'healthy' | 'degraded' | 'unavailable';
    latency: number;
    success_rate: number;
    error?: string;
  }> {
    const startTime = Date.now();
    
    try {
      // Test simple LLM call with extended deadline configuration (5 minutes)
      const testAgent = {
        model: 'gpt-4o-mini',
        developer: 'Health check test',
        instructions: 'Respond with "OK" only',
        hardDeadlineMs: 300000, // 5 minutes for health check
        warmupDeadlineMs: 300000, // 5 minutes for health check
        softDeadlineMs: 300000    // 5 minutes for health check
      };
      
      const response = await openaiService.routerLLM("Health check", testAgent);
      
      const latency = Date.now() - startTime;
      
      if (!response) {
        return {
          status: 'unavailable',
          latency,
          success_rate: 0,
          error: 'No LLM response'
        };
      }

      // Check latency threshold
      const status = latency > SLA_THRESHOLDS.MAX_LLM_LATENCY_MS ? 'degraded' : 'healthy';
      
      return {
        status,
        latency,
        success_rate: 100, // Single test, so either 0 or 100
      };

    } catch (error) {
      const latency = Date.now() - startTime;
      return {
        status: 'unavailable',
        latency,
        success_rate: 0,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Process embedding health check result
   */
  private async processEmbeddingHealthResult(result: {
    status: 'healthy' | 'degraded' | 'unavailable';
    latency: number;
    success_rate: number;
    error?: string;
  }): Promise<void> {
    // Store health status
    await this.redis.setex(
      'socialwise:health:embedding',
      300, // 5 minutes TTL
      JSON.stringify(result)
    );

    // Create alerts based on status
    if (result.status === 'unavailable') {
      createAPMAlert({
        level: 'critical',
        component: 'socialwise-embedding',
        message: `Embedding index unavailable: ${result.error}`,
        metrics: { latency: result.latency, success_rate: result.success_rate }
      });
    } else if (result.status === 'degraded') {
      createAPMAlert({
        level: 'warning',
        component: 'socialwise-embedding',
        message: `Embedding index degraded - high latency: ${result.latency}ms`,
        metrics: { latency: result.latency, threshold: SLA_THRESHOLDS.MAX_EMBEDDING_LATENCY_MS }
      });
    }

    // Check success rate threshold
    if (result.success_rate < SLA_THRESHOLDS.MIN_EMBEDDING_SUCCESS_RATE) {
      createAPMAlert({
        level: 'error',
        component: 'socialwise-embedding',
        message: `Embedding success rate below threshold: ${result.success_rate}%`,
        metrics: { 
          success_rate: result.success_rate, 
          threshold: SLA_THRESHOLDS.MIN_EMBEDDING_SUCCESS_RATE 
        }
      });
    }
  }

  /**
   * Process LLM health check result
   */
  private async processLLMHealthResult(result: {
    status: 'healthy' | 'degraded' | 'unavailable';
    latency: number;
    success_rate: number;
    error?: string;
  }): Promise<void> {
    // Store health status
    await this.redis.setex(
      'socialwise:health:llm',
      300, // 5 minutes TTL
      JSON.stringify(result)
    );

    // Create alerts based on status
    if (result.status === 'unavailable') {
      createAPMAlert({
        level: 'critical',
        component: 'socialwise-llm',
        message: `LLM unavailable: ${result.error}`,
        metrics: { latency: result.latency, success_rate: result.success_rate }
      });
    } else if (result.status === 'degraded') {
      createAPMAlert({
        level: 'warning',
        component: 'socialwise-llm',
        message: `LLM degraded - high latency: ${result.latency}ms`,
        metrics: { latency: result.latency, threshold: SLA_THRESHOLDS.MAX_LLM_LATENCY_MS }
      });
    }

    // Check success rate threshold
    if (result.success_rate < SLA_THRESHOLDS.MIN_LLM_SUCCESS_RATE) {
      createAPMAlert({
        level: 'error',
        component: 'socialwise-llm',
        message: `LLM success rate below threshold: ${result.success_rate}%`,
        metrics: { 
          success_rate: result.success_rate, 
          threshold: SLA_THRESHOLDS.MIN_LLM_SUCCESS_RATE 
        }
      });
    }
  }

  /**
   * Check for SLA violations and create alerts
   */
  private async checkSLAViolations(): Promise<void> {
    try {
      const today = new Date().toISOString().split('T')[0];
      const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

      // Get metrics for the last 24 hours
      const [classificationRates, errorRates, performancePercentiles] = await Promise.all([
        getClassificationRates(yesterday, today),
        getErrorRates(yesterday, today),
        getPerformancePercentiles(yesterday, today)
      ]);

      // Check latency SLA violations
      if (performancePercentiles.p95 > SLA_THRESHOLDS.OVERALL_P95_MAX_MS) {
        createAPMAlert({
          level: 'error',
          component: 'socialwise-latency',
          message: `P95 latency SLA violation: ${performancePercentiles.p95}ms`,
          metrics: { 
            p95: performancePercentiles.p95, 
            threshold: SLA_THRESHOLDS.OVERALL_P95_MAX_MS 
          }
        });
      }

      // Check error rate SLA violations
      if (errorRates.timeout_rate > SLA_THRESHOLDS.MAX_TIMEOUT_RATE) {
        createAPMAlert({
          level: 'error',
          component: 'socialwise-timeouts',
          message: `Timeout rate SLA violation: ${errorRates.timeout_rate.toFixed(2)}%`,
          metrics: { 
            timeout_rate: errorRates.timeout_rate, 
            threshold: SLA_THRESHOLDS.MAX_TIMEOUT_RATE 
          }
        });
      }

      if (errorRates.abort_rate > SLA_THRESHOLDS.MAX_ABORT_RATE) {
        createAPMAlert({
          level: 'warning',
          component: 'socialwise-aborts',
          message: `Abort rate SLA violation: ${errorRates.abort_rate.toFixed(2)}%`,
          metrics: { 
            abort_rate: errorRates.abort_rate, 
            threshold: SLA_THRESHOLDS.MAX_ABORT_RATE 
          }
        });
      }

      const overallErrorRate = (errorRates.total_errors / errorRates.total_requests) * 100;
      if (overallErrorRate > SLA_THRESHOLDS.MAX_ERROR_RATE) {
        createAPMAlert({
          level: 'error',
          component: 'socialwise-errors',
          message: `Overall error rate SLA violation: ${overallErrorRate.toFixed(2)}%`,
          metrics: { 
            error_rate: overallErrorRate, 
            threshold: SLA_THRESHOLDS.MAX_ERROR_RATE,
            total_errors: errorRates.total_errors,
            total_requests: errorRates.total_requests
          }
        });
      }

      // Check quality metrics (if we have enough samples)
      const qualityMetrics = await this.calculateQualityMetrics();
      if (qualityMetrics.sample_size >= 100) {
        if (qualityMetrics.hard_accuracy < SLA_THRESHOLDS.MIN_HARD_ACCURACY) {
          createAPMAlert({
            level: 'warning',
            component: 'socialwise-quality',
            message: `HARD band accuracy below threshold: ${qualityMetrics.hard_accuracy.toFixed(2)}%`,
            metrics: { 
              accuracy: qualityMetrics.hard_accuracy, 
              threshold: SLA_THRESHOLDS.MIN_HARD_ACCURACY,
              sample_size: qualityMetrics.sample_size
            }
          });
        }

        if (qualityMetrics.soft_ctr < SLA_THRESHOLDS.MIN_SOFT_CTR) {
          createAPMAlert({
            level: 'info',
            component: 'socialwise-quality',
            message: `SOFT band CTR below threshold: ${qualityMetrics.soft_ctr.toFixed(2)}%`,
            metrics: { 
              ctr: qualityMetrics.soft_ctr, 
              threshold: SLA_THRESHOLDS.MIN_SOFT_CTR,
              sample_size: qualityMetrics.sample_size
            }
          });
        }
      }

    } catch (error) {
      dashboardLogger.error('SLA violation check failed', { 
        error: error instanceof Error ? error.message : String(error) 
      });
    }
  }

  /**
   * Calculate quality metrics from samples
   */
  private async calculateQualityMetrics(): Promise<{
    hard_accuracy: number;
    soft_ctr: number;
    router_valid_topics: number;
    sample_size: number;
  }> {
    try {
      // Get recent quality samples
      const recentSamples = this.qualitySamples.filter(
        sample => sample.timestamp.getTime() > Date.now() - 86400000 // Last 24 hours
      );

      if (recentSamples.length === 0) {
        return {
          hard_accuracy: 0,
          soft_ctr: 0,
          router_valid_topics: 0,
          sample_size: 0
        };
      }

      // Calculate HARD band accuracy (simplified - would need user feedback in real implementation)
      const hardSamples = recentSamples.filter(s => s.band === 'HARD');
      const hardAccuracy = hardSamples.length > 0 ? 
        (hardSamples.filter(s => s.user_satisfaction_score && s.user_satisfaction_score >= 4).length / hardSamples.length) * 100 : 
        0;

      // Calculate SOFT band CTR (simplified - would need click tracking in real implementation)
      const softSamples = recentSamples.filter(s => s.band === 'SOFT');
      const softCtr = softSamples.length > 0 ? 
        (softSamples.filter(s => s.generated_buttons && s.generated_buttons.length > 0).length / softSamples.length) * 100 : 
        0;

      // Calculate ROUTER band valid topics (simplified - would need validation in real implementation)
    const routerSamples = recentSamples.filter(s => s.band === 'ROUTER');
       const routerValidTopics = routerSamples.length > 0 ? 95 : 0; // Placeholder - assume 95% valid

      return {
        hard_accuracy: hardAccuracy,
        soft_ctr: softCtr,
        router_valid_topics: routerValidTopics,
        sample_size: recentSamples.length
      };

    } catch (error) {
      dashboardLogger.error('Quality metrics calculation failed', { 
        error: error instanceof Error ? error.message : String(error) 
      });
      
      return {
        hard_accuracy: 0,
        soft_ctr: 0,
        router_valid_topics: 0,
        sample_size: 0
      };
    }
  }

  /**
   * Get current dashboard metrics
   */
  async getDashboardMetrics(): Promise<DashboardMetrics> {
    try {
      const today = new Date().toISOString().split('T')[0];
      const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

      // Get all metrics in parallel
      const [
        classificationRates,
        errorRates,
        performancePercentiles,
        embeddingHealth,
        llmHealth,
        qualityMetrics
      ] = await Promise.allSettled([
        getClassificationRates(yesterday, today),
        getErrorRates(yesterday, today),
        getPerformancePercentiles(yesterday, today),
        this.getStoredHealthStatus('embedding'),
        this.getStoredHealthStatus('llm'),
        this.calculateQualityMetrics()
      ]);

      // Get active alerts from APM
      const activeAlerts = apm.getActiveAlerts().map(alert => ({
        id: alert.id,
        level: alert.level,
        component: alert.component,
        message: alert.message,
        timestamp: alert.timestamp
      }));

      // Determine overall health status
      const embeddingStatus = embeddingHealth.status === 'fulfilled' ? 
        embeddingHealth.value.status : 'unavailable';
      const llmStatus = llmHealth.status === 'fulfilled' ? 
        llmHealth.value.status : 'unavailable';
      
      let overallStatus: 'healthy' | 'degraded' | 'critical' = 'healthy';
      if (embeddingStatus === 'unavailable' || llmStatus === 'unavailable') {
        overallStatus = 'critical';
      } else if (embeddingStatus === 'degraded' || llmStatus === 'degraded') {
        overallStatus = 'degraded';
      }

      return {
        currentLatency: {
          hard: 0, // Would need real-time tracking
          soft: 0,
          low: 0,
          router: 0,
          overall_p95: performancePercentiles.status === 'fulfilled' ? 
            performancePercentiles.value.p95 : 0
        },
        classificationRates: classificationRates.status === 'fulfilled' ? 
          classificationRates.value : {
            direct_map_rate: 0,
            warmup_rate: 0,
            vague_rate: 0,
            router_rate: 0
          },
        errorRates: errorRates.status === 'fulfilled' ? {
          ...errorRates.value,
          overall_error_rate: (errorRates.value.total_errors / errorRates.value.total_requests) * 100
        } : {
          timeout_rate: 0,
          json_parse_fail_rate: 0,
          abort_rate: 0,
          overall_error_rate: 0
        },
        healthStatus: {
          embedding_index: embeddingStatus,
          llm_availability: llmStatus,
          overall_status: overallStatus
        },
        qualityMetrics: qualityMetrics.status === 'fulfilled' ? 
          qualityMetrics.value : {
            hard_accuracy: 0,
            soft_ctr: 0,
            router_valid_topics: 0,
            sample_size: 0
          },
        activeAlerts
      };

    } catch (error) {
      dashboardLogger.error('Failed to get dashboard metrics', { 
        error: error instanceof Error ? error.message : String(error) 
      });

      // Return empty metrics on error
      return {
        currentLatency: { hard: 0, soft: 0, low: 0, router: 0, overall_p95: 0 },
        classificationRates: { direct_map_rate: 0, warmup_rate: 0, vague_rate: 0, router_rate: 0 },
        errorRates: { timeout_rate: 0, json_parse_fail_rate: 0, abort_rate: 0, overall_error_rate: 0 },
        healthStatus: { embedding_index: 'unavailable', llm_availability: 'unavailable', overall_status: 'critical' },
        qualityMetrics: { hard_accuracy: 0, soft_ctr: 0, router_valid_topics: 0, sample_size: 0 },
        activeAlerts: []
      };
    }
  }

  /**
   * Get stored health status from Redis
   */
  private async getStoredHealthStatus(component: 'embedding' | 'llm'): Promise<{
    status: 'healthy' | 'degraded' | 'unavailable';
    latency: number;
    success_rate: number;
  }> {
    try {
      const data = await this.redis.get(`socialwise:health:${component}`);
      if (data) {
        return JSON.parse(data);
      }
    } catch (error) {
      dashboardLogger.warn(`Failed to get stored health status for ${component}`, { 
        error: error instanceof Error ? error.message : String(error) 
      });
    }

    return {
      status: 'unavailable',
      latency: 0,
      success_rate: 0
    };
  }

  /**
   * Shutdown monitoring
   */
  shutdown(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    if (this.alertCheckInterval) {
      clearInterval(this.alertCheckInterval);
    }
    
    dashboardLogger.info('SocialWise monitoring dashboard shutdown');
  }
}

// Global instance
export const socialWiseMonitoring = SocialWiseMonitoringDashboard.getInstance();

// Utility functions
export function recordSocialWiseQualitySample(sample: Omit<QualitySample, 'user_input_hash' | 'timestamp'> & { 
  user_input: string 
}): void {
  socialWiseMonitoring.recordQualitySample(sample);
}

export async function getSocialWiseDashboardMetrics(): Promise<DashboardMetrics> {
  return socialWiseMonitoring.getDashboardMetrics();
}