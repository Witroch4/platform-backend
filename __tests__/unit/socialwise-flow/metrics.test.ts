/**
 * Unit tests for SocialWise Flow metrics collection
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { 
  collectPerformanceMetrics, 
  createPerformanceMetrics,
  getClassificationRates,
  getErrorRates,
  getPerformancePercentiles
} from '@/lib/socialwise-flow/metrics';

// Mock Redis
const mockRedis = {
  setex: jest.fn(),
  pipeline: jest.fn(() => ({
    hincrby: jest.fn(),
    expire: jest.fn(),
    exec: jest.fn()
  })),
  hgetall: jest.fn(),
  keys: jest.fn(),
  get: jest.fn()
};

// Mock connections
jest.mock('@/lib/connections', () => ({
  getRedisInstance: () => mockRedis
}));

// Mock logger
jest.mock('@/lib/utils/logger', () => ({
  createLogger: () => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn()
  })
}));

describe('SocialWise Flow Metrics', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('createPerformanceMetrics', () => {
    it('should create performance metrics with all required fields', () => {
      const metrics = createPerformanceMetrics(
        'HARD',
        'direct_map',
        150,
        {
          channelType: 'whatsapp',
          userId: 'user123',
          inboxId: 'inbox456',
          traceId: 'trace789',
          embeddingMs: 50,
          llmWarmupMs: 100,
          timeoutOccurred: false,
          jsonParseSuccess: true,
          abortOccurred: false
        }
      );

      expect(metrics).toEqual({
        embedding_ms: 50,
        llm_warmup_ms: 100,
        llm_microcopy_ms: undefined,
        route_total_ms: 150,
        band: 'HARD',
        strategy_used: 'direct_map',
        timeout_occurred: false,
        json_parse_success: true,
        abort_occurred: false,
        channel_type: 'whatsapp',
        user_id: 'user123',
        inbox_id: 'inbox456',
        trace_id: 'trace789'
      });
    });

    it('should handle optional fields correctly', () => {
      const metrics = createPerformanceMetrics(
        'LOW',
        'domain_topics',
        200,
        {
          channelType: 'instagram'
        }
      );

      expect(metrics.band).toBe('LOW');
      expect(metrics.strategy_used).toBe('domain_topics');
      expect(metrics.route_total_ms).toBe(200);
      expect(metrics.channel_type).toBe('instagram');
      expect(metrics.timeout_occurred).toBe(false);
      expect(metrics.json_parse_success).toBe(true);
      expect(metrics.abort_occurred).toBe(false);
    });
  });

  describe('collectPerformanceMetrics', () => {
    it('should store metrics in Redis with correct keys and TTL', async () => {
      const mockPipeline = {
        hincrby: jest.fn(),
        expire: jest.fn(),
        exec: jest.fn().mockResolvedValue([])
      };
      mockRedis.pipeline.mockReturnValue(mockPipeline);
      mockRedis.setex.mockResolvedValue('OK');

      const metrics = createPerformanceMetrics(
        'SOFT',
        'warmup_buttons',
        250,
        {
          channelType: 'whatsapp',
          userId: 'user123',
          timeoutOccurred: false,
          jsonParseSuccess: true
        }
      );

      await collectPerformanceMetrics(metrics);

      // Check individual metric storage
      expect(mockRedis.setex).toHaveBeenCalledWith(
        expect.stringMatching(/^socialwise:metrics:\d{4}-\d{2}-\d{2}:\d+$/),
        86400,
        JSON.stringify(metrics)
      );

      // Check aggregated counters
      expect(mockPipeline.hincrby).toHaveBeenCalledWith(
        expect.stringMatching(/^socialwise:counters:\d{4}-\d{2}-\d{2}$/),
        'band_soft',
        1
      );
      expect(mockPipeline.hincrby).toHaveBeenCalledWith(
        expect.stringMatching(/^socialwise:counters:\d{4}-\d{2}-\d{2}$/),
        'total_requests',
        1
      );
      expect(mockPipeline.hincrby).toHaveBeenCalledWith(
        expect.stringMatching(/^socialwise:counters:\d{4}-\d{2}-\d{2}$/),
        'channel_whatsapp',
        1
      );

      expect(mockPipeline.exec).toHaveBeenCalled();
    });

    it('should handle Redis errors gracefully', async () => {
      mockRedis.setex.mockRejectedValue(new Error('Redis connection failed'));

      const metrics = createPerformanceMetrics(
        'HARD',
        'direct_map',
        100,
        { channelType: 'whatsapp' }
      );

      // Should not throw
      await expect(collectPerformanceMetrics(metrics)).resolves.toBeUndefined();
    });
  });

  describe('getClassificationRates', () => {
    it('should calculate classification rates correctly', async () => {
      mockRedis.hgetall.mockResolvedValue({
        total_requests: '100',
        band_hard: '40',
        band_soft: '35',
        band_low: '20',
        band_router: '5'
      });

      const rates = await getClassificationRates('2024-01-01', '2024-01-01');

      expect(rates).toEqual({
        direct_map_rate: 40,
        warmup_rate: 35,
        vague_rate: 20,
        router_rate: 5,
        total_requests: 100
      });
    });

    it('should handle missing data gracefully', async () => {
      mockRedis.hgetall.mockResolvedValue({});

      const rates = await getClassificationRates('2024-01-01', '2024-01-01');

      expect(rates).toEqual({
        direct_map_rate: 0,
        warmup_rate: 0,
        vague_rate: 0,
        router_rate: 0,
        total_requests: 0
      });
    });

    it('should handle Redis errors gracefully', async () => {
      mockRedis.hgetall.mockRejectedValue(new Error('Redis error'));

      const rates = await getClassificationRates('2024-01-01', '2024-01-01');

      expect(rates).toEqual({
        direct_map_rate: 0,
        warmup_rate: 0,
        vague_rate: 0,
        router_rate: 0,
        total_requests: 0
      });
    });
  });

  describe('getErrorRates', () => {
    it('should calculate error rates correctly', async () => {
      mockRedis.hgetall.mockResolvedValue({
        total_requests: '1000',
        timeouts: '10',
        json_parse_failures: '5',
        aborts: '3'
      });

      const errorRates = await getErrorRates('2024-01-01', '2024-01-01');

      expect(errorRates).toEqual({
        timeout_rate: 1.0,
        json_parse_fail_rate: 0.5,
        abort_rate: 0.3,
        embedding_fail_rate: 0,
        llm_fail_rate: 0,
        total_errors: 18,
        total_requests: 1000
      });
    });

    it('should handle zero requests correctly', async () => {
      mockRedis.hgetall.mockResolvedValue({
        total_requests: '0'
      });

      const errorRates = await getErrorRates('2024-01-01', '2024-01-01');

      expect(errorRates.timeout_rate).toBe(0);
      expect(errorRates.json_parse_fail_rate).toBe(0);
      expect(errorRates.abort_rate).toBe(0);
      expect(errorRates.total_requests).toBe(0);
    });
  });

  describe('getPerformancePercentiles', () => {
    it('should calculate percentiles correctly', async () => {
      const mockMetrics = [
        { route_total_ms: 100 },
        { route_total_ms: 200 },
        { route_total_ms: 300 },
        { route_total_ms: 400 },
        { route_total_ms: 500 }
      ];

      mockRedis.keys.mockResolvedValue(['key1', 'key2', 'key3', 'key4', 'key5']);
      mockRedis.get
        .mockResolvedValueOnce(JSON.stringify(mockMetrics[0]))
        .mockResolvedValueOnce(JSON.stringify(mockMetrics[1]))
        .mockResolvedValueOnce(JSON.stringify(mockMetrics[2]))
        .mockResolvedValueOnce(JSON.stringify(mockMetrics[3]))
        .mockResolvedValueOnce(JSON.stringify(mockMetrics[4]));

      const percentiles = await getPerformancePercentiles('2024-01-01', '2024-01-01');

      expect(percentiles.p50).toBe(300); // 50th percentile
      expect(percentiles.p95).toBe(500); // 95th percentile
      expect(percentiles.p99).toBe(500); // 99th percentile
    });

    it('should handle empty data gracefully', async () => {
      mockRedis.keys.mockResolvedValue([]);

      const percentiles = await getPerformancePercentiles('2024-01-01', '2024-01-01');

      expect(percentiles).toEqual({
        p50: 0,
        p95: 0,
        p99: 0
      });
    });

    it('should handle invalid JSON gracefully', async () => {
      mockRedis.keys.mockResolvedValue(['key1', 'key2']);
      mockRedis.get
        .mockResolvedValueOnce('invalid json')
        .mockResolvedValueOnce(JSON.stringify({ route_total_ms: 200 }));

      const percentiles = await getPerformancePercentiles('2024-01-01', '2024-01-01');

      expect(percentiles.p50).toBe(200);
      expect(percentiles.p95).toBe(200);
      expect(percentiles.p99).toBe(200);
    });
  });
});