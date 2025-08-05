/**
 * Tests for Metrics Collection
 */

import { AIMetrics, aiMetrics } from '../../../../lib/ai-integration/utils/metrics';

describe('AIMetrics', () => {
  let metrics: AIMetrics;

  beforeEach(() => {
    metrics = new AIMetrics();
  });

  describe('counter metrics', () => {
    it('should increment job totals', () => {
      metrics.incrementJobsTotal('webhook', 'success', { account_id: '1' });
      metrics.incrementJobsTotal('webhook', 'success', { account_id: '1' });
      metrics.incrementJobsTotal('webhook', 'error', { account_id: '1' });

      const allMetrics = metrics.getMetrics();
      const jobMetrics = allMetrics.filter(m => m.name === 'ai_jobs_total');

      expect(jobMetrics).toHaveLength(2);
      
      const successMetric = jobMetrics.find(m => m.labels.status === 'success');
      const errorMetric = jobMetrics.find(m => m.labels.status === 'error');

      expect(successMetric?.value).toBe(2);
      expect(errorMetric?.value).toBe(1);
    });

    it('should increment fallbacks with reasons', () => {
      metrics.incrementFallbacks('llm_timeout', { account_id: '1' });
      metrics.incrementFallbacks('intent_failed', { account_id: '2' });

      const allMetrics = metrics.getMetrics();
      const fallbackMetrics = allMetrics.filter(m => m.name === 'ai_fallback_total');

      expect(fallbackMetrics).toHaveLength(2);
      expect(fallbackMetrics.find(m => m.labels.reason === 'llm_timeout')?.value).toBe(1);
      expect(fallbackMetrics.find(m => m.labels.reason === 'intent_failed')?.value).toBe(1);
    });

    it('should increment rate limit hits by scope', () => {
      metrics.incrementRateLimitHits('conversation', { account_id: '1' });
      metrics.incrementRateLimitHits('account', { account_id: '1' });

      const allMetrics = metrics.getMetrics();
      const rateLimitMetrics = allMetrics.filter(m => m.name === 'ai_ratelimit_hits_total');

      expect(rateLimitMetrics).toHaveLength(2);
      expect(rateLimitMetrics.find(m => m.labels.scope === 'conversation')?.value).toBe(1);
      expect(rateLimitMetrics.find(m => m.labels.scope === 'account')?.value).toBe(1);
    });
  });

  describe('gauge metrics', () => {
    it('should set jobs in queue', () => {
      metrics.setJobsInQueue('ai:incoming-message', 25);
      metrics.setJobsInQueue('ai:embedding-upsert', 5);

      const allMetrics = metrics.getMetrics();
      const queueMetrics = allMetrics.filter(m => m.name === 'ai_jobs_in_queue');

      expect(queueMetrics).toHaveLength(2);
      expect(queueMetrics.find(m => m.labels.queue_name === 'ai:incoming-message')?.value).toBe(25);
      expect(queueMetrics.find(m => m.labels.queue_name === 'ai:embedding-upsert')?.value).toBe(5);
    });

    it('should set circuit breaker states', () => {
      metrics.setCircuitBreakerState('openai', 'open');
      metrics.setCircuitBreakerState('chatwit', 'closed');

      const allMetrics = metrics.getMetrics();
      const cbMetrics = allMetrics.filter(m => m.name === 'ai_circuit_breaker_state');

      expect(cbMetrics).toHaveLength(2);
      expect(cbMetrics.find(m => m.labels.service === 'openai')?.value).toBe(1); // open = 1
      expect(cbMetrics.find(m => m.labels.service === 'chatwit')?.value).toBe(0); // closed = 0
    });

    it('should set active workers', () => {
      metrics.setActiveWorkers('ai-message', 3);
      metrics.setActiveWorkers('embedding-upsert', 1);

      const allMetrics = metrics.getMetrics();
      const workerMetrics = allMetrics.filter(m => m.name === 'ai_active_workers');

      expect(workerMetrics).toHaveLength(2);
      expect(workerMetrics.find(m => m.labels.worker_type === 'ai-message')?.value).toBe(3);
      expect(workerMetrics.find(m => m.labels.worker_type === 'embedding-upsert')?.value).toBe(1);
    });
  });

  describe('histogram metrics', () => {
    it('should record job latency', () => {
      metrics.recordJobLatency('webhook', 150, { account_id: '1' });
      metrics.recordJobLatency('webhook', 250, { account_id: '1' });
      metrics.recordJobLatency('classify', 500, { account_id: '1' });

      const allMetrics = metrics.getMetrics();
      const latencyMetrics = allMetrics.filter(m => m.name === 'ai_job_latency_ms');

      expect(latencyMetrics).toHaveLength(2); // webhook and classify

      const webhookMetric = latencyMetrics.find(m => m.labels.stage === 'webhook');
      expect(webhookMetric?.type).toBe('histogram');
      
      if (webhookMetric?.type === 'histogram') {
        expect(webhookMetric.count).toBe(2);
        expect(webhookMetric.sum).toBe(400); // 150 + 250
        expect(webhookMetric.buckets.length).toBeGreaterThan(0);
      }
    });

    it('should record LLM response times', () => {
      metrics.recordLLMResponseTime('gpt-4o-mini', 'generate', 1200, { account_id: '1' });
      metrics.recordLLMResponseTime('gpt-4o-mini', 'embed', 300, { account_id: '1' });

      const allMetrics = metrics.getMetrics();
      const llmMetrics = allMetrics.filter(m => m.name === 'ai_llm_response_time_ms');

      expect(llmMetrics).toHaveLength(2);
      
      const generateMetric = llmMetrics.find(m => m.labels.operation === 'generate');
      expect(generateMetric?.type).toBe('histogram');
      
      if (generateMetric?.type === 'histogram') {
        expect(generateMetric.count).toBe(1);
        expect(generateMetric.sum).toBe(1200);
      }
    });

    it('should record LLM token usage', () => {
      metrics.recordLLMTokens('gpt-4o-mini', 'generate', 150, { account_id: '1' });
      metrics.recordLLMTokens('gpt-4o-mini', 'generate', 200, { account_id: '1' });

      const allMetrics = metrics.getMetrics();
      const tokenMetrics = allMetrics.filter(m => m.name === 'ai_llm_tokens_total');

      expect(tokenMetrics).toHaveLength(1);
      
      const tokenMetric = tokenMetrics[0];
      expect(tokenMetric.type).toBe('histogram');
      
      if (tokenMetric.type === 'histogram') {
        expect(tokenMetric.count).toBe(2);
        expect(tokenMetric.sum).toBe(350); // 150 + 200
      }
    });

    it('should record intent confidence scores', () => {
      metrics.recordIntentConfidence('track_order', 0.85, { account_id: '1' });
      metrics.recordIntentConfidence('payment_help', 0.92, { account_id: '1' });

      const allMetrics = metrics.getMetrics();
      const confidenceMetrics = allMetrics.filter(m => m.name === 'ai_intent_confidence_score');

      expect(confidenceMetrics).toHaveLength(2);
      
      const trackOrderMetric = confidenceMetrics.find(m => m.labels.intent_name === 'track_order');
      expect(trackOrderMetric?.type).toBe('histogram');
      
      if (trackOrderMetric?.type === 'histogram') {
        expect(trackOrderMetric.count).toBe(1);
        expect(trackOrderMetric.sum).toBe(0.85);
      }
    });

    it('should use appropriate buckets for different metric types', () => {
      // Test latency buckets
      metrics.recordJobLatency('test', 100);
      
      // Test token buckets  
      metrics.recordLLMTokens('test-model', 'test-op', 500);

      const allMetrics = metrics.getMetrics();
      const latencyMetric = allMetrics.find(m => m.name === 'ai_job_latency_ms');
      const tokenMetric = allMetrics.find(m => m.name === 'ai_llm_tokens_total');

      // Both should have buckets, but potentially different ones
      if (latencyMetric?.type === 'histogram' && tokenMetric?.type === 'histogram') {
        expect(latencyMetric.buckets.length).toBeGreaterThan(0);
        expect(tokenMetric.buckets.length).toBeGreaterThan(0);
        
        // Latency should have smaller buckets for milliseconds
        const maxLatencyBucket = Math.max(...latencyMetric.buckets.map(b => b.le).filter(le => le !== Infinity));
        const maxTokenBucket = Math.max(...tokenMetric.buckets.map(b => b.le).filter(le => le !== Infinity));
        
        expect(maxLatencyBucket).toBeGreaterThan(1000); // Should have buckets > 1s
        expect(maxTokenBucket).toBeGreaterThan(1000); // Should have buckets > 1000 tokens
      }
    });
  });

  describe('cost tracking', () => {
    it('should record LLM costs', () => {
      metrics.recordLLMCost('gpt-4o-mini', 123, 1000, 0.01);
      metrics.recordLLMCost('gpt-4o-mini', 123, 500, 0.005);

      const allMetrics = metrics.getMetrics();
      const tokenCostMetrics = allMetrics.filter(m => m.name === 'ai_llm_cost_tokens_total');
      const usdCostMetrics = allMetrics.filter(m => m.name === 'ai_llm_cost_usd_total');

      expect(tokenCostMetrics).toHaveLength(1);
      expect(usdCostMetrics).toHaveLength(1);

      if (tokenCostMetrics[0].type === 'histogram') {
        expect(tokenCostMetrics[0].count).toBe(2);
        expect(tokenCostMetrics[0].sum).toBe(1500); // 1000 + 500
      }

      if (usdCostMetrics[0].type === 'histogram') {
        expect(usdCostMetrics[0].count).toBe(2);
        expect(usdCostMetrics[0].sum).toBe(0.015); // 0.01 + 0.005
      }
    });
  });

  describe('Prometheus export', () => {
    it('should export metrics in Prometheus format', () => {
      metrics.incrementJobsTotal('webhook', 'success', { account_id: '1' });
      metrics.setJobsInQueue('test-queue', 5);
      metrics.recordJobLatency('webhook', 150, { account_id: '1' });

      const prometheus = metrics.exportPrometheus();

      expect(prometheus).toContain('# HELP ai_jobs_total');
      expect(prometheus).toContain('# TYPE ai_jobs_total counter');
      expect(prometheus).toContain('ai_jobs_total{stage="webhook",status="success",account_id="1"} 1');

      expect(prometheus).toContain('# HELP ai_jobs_in_queue');
      expect(prometheus).toContain('# TYPE ai_jobs_in_queue gauge');
      expect(prometheus).toContain('ai_jobs_in_queue{queue_name="test-queue"} 5');

      expect(prometheus).toContain('# HELP ai_job_latency_ms');
      expect(prometheus).toContain('# TYPE ai_job_latency_ms histogram');
      expect(prometheus).toContain('ai_job_latency_ms_bucket{');
      expect(prometheus).toContain('ai_job_latency_ms_sum{');
      expect(prometheus).toContain('ai_job_latency_ms_count{');
    });

    it('should handle empty metrics', () => {
      const prometheus = metrics.exportPrometheus();
      expect(prometheus).toBe('');
    });
  });

  describe('metrics snapshot', () => {
    it('should create snapshots with timestamp', () => {
      metrics.incrementJobsTotal('test', 'success');
      
      const snapshot = metrics.getSnapshot();
      
      expect(snapshot.timestamp).toBeCloseTo(Date.now(), -2); // Within 100ms
      expect(snapshot.metrics).toHaveLength(1);
      expect(snapshot.metrics[0].name).toBe('ai_jobs_total');
    });
  });

  describe('metrics reset', () => {
    it('should reset all metrics', () => {
      metrics.incrementJobsTotal('test', 'success');
      metrics.setJobsInQueue('test', 5);
      metrics.recordJobLatency('test', 100);

      expect(metrics.getMetrics()).toHaveLength(3);

      metrics.reset();

      expect(metrics.getMetrics()).toHaveLength(0);
    });
  });

  describe('global metrics instance', () => {
    it('should provide working global instance', () => {
      // Reset to ensure clean state
      aiMetrics.reset();

      aiMetrics.incrementJobsTotal('test', 'success');
      
      const metrics = aiMetrics.getMetrics();
      expect(metrics).toHaveLength(1);
      expect(metrics[0].name).toBe('ai_jobs_total');

      // Clean up
      aiMetrics.reset();
    });
  });

  describe('summary statistics', () => {
    it('should provide metrics summary', () => {
      metrics.incrementJobsTotal('test', 'success'); // counter
      metrics.setJobsInQueue('test', 5); // gauge
      metrics.recordJobLatency('test', 100); // histogram

      const summary = metrics.getSummary();

      expect(summary.totalCounters).toBe(1);
      expect(summary.totalGauges).toBe(1);
      expect(summary.totalHistograms).toBe(1);
      expect(summary.totalMetrics).toBe(3);
    });
  });
});