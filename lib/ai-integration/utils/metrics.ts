/**
 * Metrics Collection for AI Integration
 * Based on requirements 10.1, 10.2, 14.2, 15.3
 */

export interface MetricLabels {
  [key: string]: string | number;
}

export interface HistogramBucket {
  le: number;
  count: number;
}

export interface HistogramMetric {
  name: string;
  help: string;
  type: 'histogram';
  buckets: HistogramBucket[];
  sum: number;
  count: number;
  labels: MetricLabels;
}

export interface CounterMetric {
  name: string;
  help: string;
  type: 'counter';
  value: number;
  labels: MetricLabels;
}

export interface GaugeMetric {
  name: string;
  help: string;
  type: 'gauge';
  value: number;
  labels: MetricLabels;
}

export type Metric = HistogramMetric | CounterMetric | GaugeMetric;

export interface MetricsSnapshot {
  timestamp: number;
  metrics: Metric[];
}

class MetricsCollector {
  private counters = new Map<string, { value: number; labels: MetricLabels; help: string }>();
  private gauges = new Map<string, { value: number; labels: MetricLabels; help: string }>();
  private histograms = new Map<string, {
    buckets: Map<number, number>;
    sum: number;
    count: number;
    labels: MetricLabels;
    help: string;
  }>();

  // Default histogram buckets for latency (in milliseconds)
  private readonly defaultLatencyBuckets = [
    10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 30000, Infinity
  ];

  // Default histogram buckets for token counts
  private readonly defaultTokenBuckets = [
    10, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 25000, Infinity
  ];

  private getMetricKey(name: string, labels: MetricLabels): string {
    const labelPairs = Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}="${value}"`)
      .join(',');
    return `${name}{${labelPairs}}`;
  }

  // Counter methods
  incrementCounter(name: string, labels: MetricLabels = {}, help: string = '', value: number = 1): void {
    const key = this.getMetricKey(name, labels);
    const existing = this.counters.get(key);
    
    if (existing) {
      existing.value += value;
    } else {
      this.counters.set(key, { value, labels, help });
    }
  }

  getCounter(name: string, labels: MetricLabels = {}): number {
    const key = this.getMetricKey(name, labels);
    return this.counters.get(key)?.value || 0;
  }

  // Gauge methods
  setGauge(name: string, value: number, labels: MetricLabels = {}, help: string = ''): void {
    const key = this.getMetricKey(name, labels);
    this.gauges.set(key, { value, labels, help });
  }

  incrementGauge(name: string, labels: MetricLabels = {}, help: string = '', value: number = 1): void {
    const key = this.getMetricKey(name, labels);
    const existing = this.gauges.get(key);
    
    if (existing) {
      existing.value += value;
    } else {
      this.gauges.set(key, { value, labels, help });
    }
  }

  decrementGauge(name: string, labels: MetricLabels = {}, help: string = '', value: number = 1): void {
    this.incrementGauge(name, labels, help, -value);
  }

  getGauge(name: string, labels: MetricLabels = {}): number {
    const key = this.getMetricKey(name, labels);
    return this.gauges.get(key)?.value || 0;
  }

  // Histogram methods
  observeHistogram(
    name: string,
    value: number,
    labels: MetricLabels = {},
    help: string = '',
    buckets?: number[]
  ): void {
    const key = this.getMetricKey(name, labels);
    let histogram = this.histograms.get(key);

    if (!histogram) {
      const bucketValues = buckets || this.getDefaultBuckets(name);
      const bucketMap = new Map<number, number>();
      bucketValues.forEach(bucket => bucketMap.set(bucket, 0));

      histogram = {
        buckets: bucketMap,
        sum: 0,
        count: 0,
        labels,
        help,
      };
      this.histograms.set(key, histogram);
    }

    // Update histogram
    histogram.sum += value;
    histogram.count += 1;

    // Update buckets
    for (const [bucket, count] of histogram.buckets.entries()) {
      if (value <= bucket) {
        histogram.buckets.set(bucket, count + 1);
      }
    }
  }

  private getDefaultBuckets(metricName: string): number[] {
    if (metricName.includes('latency') || metricName.includes('duration') || metricName.includes('time')) {
      return this.defaultLatencyBuckets;
    }
    if (metricName.includes('token')) {
      return this.defaultTokenBuckets;
    }
    return this.defaultLatencyBuckets; // Default fallback
  }

  // Get all metrics in Prometheus format
  getMetrics(): Metric[] {
    const metrics: Metric[] = [];

    // Add counters
    for (const [key, data] of this.counters.entries()) {
      const name = key.split('{')[0];
      metrics.push({
        name,
        help: data.help,
        type: 'counter',
        value: data.value,
        labels: data.labels,
      });
    }

    // Add gauges
    for (const [key, data] of this.gauges.entries()) {
      const name = key.split('{')[0];
      metrics.push({
        name,
        help: data.help,
        type: 'gauge',
        value: data.value,
        labels: data.labels,
      });
    }

    // Add histograms
    for (const [key, data] of this.histograms.entries()) {
      const name = key.split('{')[0];
      const buckets: HistogramBucket[] = Array.from(data.buckets.entries()).map(([le, count]) => ({
        le,
        count,
      }));

      metrics.push({
        name,
        help: data.help,
        type: 'histogram',
        buckets,
        sum: data.sum,
        count: data.count,
        labels: data.labels,
      });
    }

    return metrics;
  }

  // Get metrics snapshot
  getSnapshot(): MetricsSnapshot {
    return {
      timestamp: Date.now(),
      metrics: this.getMetrics(),
    };
  }

  // Export metrics in Prometheus format
  exportPrometheus(): string {
    const metrics = this.getMetrics();
    const lines: string[] = [];

    const groupedMetrics = new Map<string, Metric[]>();
    metrics.forEach(metric => {
      if (!groupedMetrics.has(metric.name)) {
        groupedMetrics.set(metric.name, []);
      }
      groupedMetrics.get(metric.name)!.push(metric);
    });

    for (const [name, metricGroup] of groupedMetrics.entries()) {
      const firstMetric = metricGroup[0];
      
      // Add help comment
      if (firstMetric.help) {
        lines.push(`# HELP ${name} ${firstMetric.help}`);
      }
      
      // Add type comment
      lines.push(`# TYPE ${name} ${firstMetric.type}`);

      // Add metric lines
      metricGroup.forEach(metric => {
        const labelStr = Object.entries(metric.labels)
          .map(([key, value]) => `${key}="${value}"`)
          .join(',');
        const labelPart = labelStr ? `{${labelStr}}` : '';

        if (metric.type === 'histogram') {
          const histMetric = metric as HistogramMetric;
          
          // Add bucket lines
          histMetric.buckets.forEach(bucket => {
            const bucketLabels = labelStr ? `${labelStr},le="${bucket.le}"` : `le="${bucket.le}"`;
            lines.push(`${name}_bucket{${bucketLabels}} ${bucket.count}`);
          });
          
          // Add sum and count
          lines.push(`${name}_sum${labelPart} ${histMetric.sum}`);
          lines.push(`${name}_count${labelPart} ${histMetric.count}`);
        } else {
          lines.push(`${name}${labelPart} ${metric.value}`);
        }
      });

      lines.push(''); // Empty line between metric groups
    }

    return lines.join('\n');
  }

  // Reset all metrics
  reset(): void {
    this.counters.clear();
    this.gauges.clear();
    this.histograms.clear();
  }

  // Get summary statistics
  getSummary(): {
    totalCounters: number;
    totalGauges: number;
    totalHistograms: number;
    totalMetrics: number;
  } {
    return {
      totalCounters: this.counters.size,
      totalGauges: this.gauges.size,
      totalHistograms: this.histograms.size,
      totalMetrics: this.counters.size + this.gauges.size + this.histograms.size,
    };
  }
}

// AI Integration specific metrics
export class AIMetrics {
  private collector: MetricsCollector;

  constructor(collector?: MetricsCollector) {
    this.collector = collector || new MetricsCollector();
  }

  // Job processing metrics
  recordJobLatency(stage: string, durationMs: number, labels: MetricLabels = {}): void {
    this.collector.observeHistogram(
      'ai_job_latency_ms',
      durationMs,
      { stage, ...labels },
      'AI job processing latency in milliseconds'
    );
  }

  incrementJobsTotal(stage: string, status: string, labels: MetricLabels = {}): void {
    this.collector.incrementCounter(
      'ai_jobs_total',
      { stage, status, ...labels },
      'Total number of AI jobs processed'
    );
  }

  incrementJobsDLQ(reason: string, labels: MetricLabels = {}): void {
    this.collector.incrementCounter(
      'ai_jobs_dlq_total',
      { reason, ...labels },
      'Total number of jobs sent to dead letter queue'
    );
  }

  setJobsInQueue(queueName: string, count: number): void {
    this.collector.setGauge(
      'ai_jobs_in_queue',
      count,
      { queue_name: queueName },
      'Number of jobs currently in queue'
    );
  }

  // LLM metrics
  recordLLMResponseTime(model: string, operation: string, durationMs: number, labels: MetricLabels = {}): void {
    this.collector.observeHistogram(
      'ai_llm_response_time_ms',
      durationMs,
      { model, operation, ...labels },
      'LLM API response time in milliseconds'
    );
  }

  recordLLMTokens(model: string, operation: string, tokens: number, labels: MetricLabels = {}): void {
    this.collector.observeHistogram(
      'ai_llm_tokens_total',
      tokens,
      { model, operation, ...labels },
      'Total LLM tokens consumed'
    );
  }

  // Intent classification metrics
  recordIntentConfidence(intentName: string, confidence: number, labels: MetricLabels = {}): void {
    this.collector.observeHistogram(
      'ai_intent_confidence_score',
      confidence,
      { intent_name: intentName, ...labels },
      'Intent classification confidence score'
    );
  }

  incrementIntentRejects(labels: MetricLabels = {}): void {
    this.collector.incrementCounter(
      'ai_intent_reject_total',
      labels,
      'Total number of intent classifications rejected due to low confidence'
    );
  }

  // Rate limiting metrics
  incrementRateLimitHits(scope: string, labels: MetricLabels = {}): void {
    this.collector.incrementCounter(
      'ai_ratelimit_hits_total',
      { scope, ...labels },
      'Total number of rate limit hits'
    );
  }

  // Fallback metrics
  incrementFallbacks(reason: string, labels: MetricLabels = {}): void {
    this.collector.incrementCounter(
      'ai_fallback_total',
      { reason, ...labels },
      'Total number of fallbacks to human agents'
    );
  }

  // Circuit breaker metrics
  setCircuitBreakerState(service: string, state: 'open' | 'closed' | 'half_open'): void {
    const stateValue = state === 'open' ? 1 : state === 'half_open' ? 0.5 : 0;
    this.collector.setGauge(
      'ai_circuit_breaker_state',
      stateValue,
      { service },
      'Circuit breaker state (0=closed, 0.5=half-open, 1=open)'
    );
  }

  // Worker metrics
  setActiveWorkers(workerType: string, count: number): void {
    this.collector.setGauge(
      'ai_active_workers',
      count,
      { worker_type: workerType },
      'Number of active workers'
    );
  }

  // SLO violation metrics
  incrementSLOViolations(labels: MetricLabels = {}): void {
    this.collector.incrementCounter(
      'ai_slo_violation_total',
      labels,
      'Total number of SLO violations'
    );
  }

  // Budget metrics
  incrementBudgetExceeded(accountId: number): void {
    this.collector.incrementCounter(
      'ai_budget_exceeded_total',
      { account_id: accountId.toString() },
      'Total number of budget exceeded events'
    );
  }

  // Button routing metrics
  incrementButtonRoutes(route: string, status: string, labels: MetricLabels = {}): void {
    this.collector.incrementCounter(
      'ai_button_route_total',
      { route, status, ...labels },
      'Total number of button routes processed'
    );
  }

  // Queue lag metrics
  recordQueueLag(queueName: string, lagMs: number): void {
    this.collector.observeHistogram(
      'ai_queue_lag_ms',
      lagMs,
      { queue_name: queueName },
      'Queue processing lag in milliseconds'
    );
  }

  // Secret rotation metrics
  incrementSecretRotations(): void {
    this.collector.incrementCounter(
      'ai_secret_rotation_events_total',
      {},
      'Total number of secret rotation events'
    );
  }

  // Cost tracking metrics
  recordLLMCost(model: string, accountId: number, tokens: number, costUsd: number): void {
    this.collector.observeHistogram(
      'ai_llm_cost_tokens_total',
      tokens,
      { model, account_id: accountId.toString() },
      'LLM cost tracking by tokens'
    );

    this.collector.observeHistogram(
      'ai_llm_cost_usd_total',
      costUsd,
      { model, account_id: accountId.toString() },
      'LLM cost tracking in USD'
    );
  }

  // Get all metrics
  getMetrics(): Metric[] {
    return this.collector.getMetrics();
  }

  // Export in Prometheus format
  exportPrometheus(): string {
    return this.collector.exportPrometheus();
  }

  // Get snapshot
  getSnapshot(): MetricsSnapshot {
    return this.collector.getSnapshot();
  }

  // Reset metrics
  reset(): void {
    this.collector.reset();
  }

  // Get summary
  getSummary() {
    return this.collector.getSummary();
  }
}

// Global metrics instance
export const aiMetrics = new AIMetrics();

// Convenience functions for common metrics
export function recordJobLatency(stage: string, durationMs: number, labels?: MetricLabels): void {
  aiMetrics.recordJobLatency(stage, durationMs, labels);
}

export function incrementJobsTotal(stage: string, status: string, labels?: MetricLabels): void {
  aiMetrics.incrementJobsTotal(stage, status, labels);
}

export function recordLLMTokens(model: string, operation: string, tokens: number, labels?: MetricLabels): void {
  aiMetrics.recordLLMTokens(model, operation, tokens, labels);
}

export function incrementFallbacks(reason: string, labels?: MetricLabels): void {
  aiMetrics.incrementFallbacks(reason, labels);
}

export default AIMetrics;