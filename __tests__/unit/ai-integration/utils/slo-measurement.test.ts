/**
 * Tests for SLO Measurement
 */

import { SLOMeasurementService, sloMeasurementService } from '../../../../lib/ai-integration/utils/slo-measurement';
import { AIMetrics } from '../../../../lib/ai-integration/utils/metrics';

describe('SLOMeasurementService', () => {
  let service: SLOMeasurementService;
  let mockMetrics: AIMetrics;

  beforeEach(() => {
    service = new SLOMeasurementService();
    mockMetrics = new AIMetrics();
    
    // Mock the global metrics instance
    jest.spyOn(require('../../../../lib/ai-integration/utils/metrics'), 'aiMetrics', 'get')
      .mockReturnValue(mockMetrics);
  });

  afterEach(() => {
    mockMetrics.reset();
    jest.restoreAllMocks();
  });

  describe('SLO targets', () => {
    it('should have predefined SLO targets', () => {
      const targets = service.getSLOTargets();
      
      expect(targets.length).toBeGreaterThan(0);
      expect(targets).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'availability',
            target: 0.999,
            measurement: 'availability',
          }),
          expect.objectContaining({
            name: 'latency_p95',
            target: 2500,
            measurement: 'latency',
          }),
          expect.objectContaining({
            name: 'error_rate',
            target: 0.001,
            measurement: 'error_rate',
          }),
        ])
      );
    });
  });

  describe('SLO report generation', () => {
    beforeEach(() => {
      // Add some test metrics
      mockMetrics.incrementJobsTotal('webhook', 'success', { account_id: '1' });
      mockMetrics.incrementJobsTotal('webhook', 'success', { account_id: '1' });
      mockMetrics.incrementJobsTotal('webhook', 'error', { account_id: '1' });
      mockMetrics.recordJobLatency('webhook', 1500, { account_id: '1' });
      mockMetrics.recordJobLatency('webhook', 2000, { account_id: '1' });
      mockMetrics.recordJobLatency('webhook', 3000, { account_id: '1' });
    });

    it('should generate overall SLO report', () => {
      const report = service.generateSLOReport(60);
      
      expect(report).toMatchObject({
        timestamp: expect.any(Number),
        windowMinutes: 60,
        measurements: expect.any(Array),
        overallCompliance: expect.any(Number),
        violationsCount: expect.any(Number),
      });

      expect(report.measurements.length).toBeGreaterThan(0);
      expect(report.overallCompliance).toBeGreaterThanOrEqual(0);
      expect(report.overallCompliance).toBeLessThanOrEqual(1);
    });

    it('should generate account-specific SLO report', () => {
      const report = service.generateAccountSLOReport(1, 60);
      
      expect(report).toMatchObject({
        timestamp: expect.any(Number),
        windowMinutes: 60,
        measurements: expect.any(Array),
        overallCompliance: expect.any(Number),
        violationsCount: expect.any(Number),
      });

      // Check that measurements have account_id label
      report.measurements.forEach(measurement => {
        expect(measurement.labels.account_id).toBe('1');
      });
    });

    it('should generate channel-specific SLO report', () => {
      const report = service.generateChannelSLOReport('whatsapp', 60);
      
      expect(report).toMatchObject({
        timestamp: expect.any(Number),
        windowMinutes: 60,
        measurements: expect.any(Array),
        overallCompliance: expect.any(Number),
        violationsCount: expect.any(Number),
      });

      // Check that measurements have channel label
      report.measurements.forEach(measurement => {
        expect(measurement.labels.channel).toBe('whatsapp');
      });
    });
  });

  describe('availability measurement', () => {
    it('should calculate availability correctly', () => {
      // Add metrics: 8 success, 2 errors = 80% availability
      for (let i = 0; i < 8; i++) {
        mockMetrics.incrementJobsTotal('test', 'success');
      }
      for (let i = 0; i < 2; i++) {
        mockMetrics.incrementJobsTotal('test', 'error');
      }

      const report = service.generateSLOReport(60);
      const availabilityMeasurement = report.measurements.find(m => m.slo === 'availability');
      
      expect(availabilityMeasurement).toBeDefined();
      expect(availabilityMeasurement!.value).toBe(0.8); // 8/10 = 80%
      expect(availabilityMeasurement!.violated).toBe(true); // Below 99.9% target
    });

    it('should handle zero jobs gracefully', () => {
      const report = service.generateSLOReport(60);
      const availabilityMeasurement = report.measurements.find(m => m.slo === 'availability');
      
      expect(availabilityMeasurement).toBeDefined();
      expect(availabilityMeasurement!.value).toBe(1); // 100% when no jobs
      expect(availabilityMeasurement!.violated).toBe(false);
    });
  });

  describe('error rate measurement', () => {
    it('should calculate error rate correctly', () => {
      // Add metrics: 95 success, 5 errors = 5% error rate
      for (let i = 0; i < 95; i++) {
        mockMetrics.incrementJobsTotal('test', 'success');
      }
      for (let i = 0; i < 5; i++) {
        mockMetrics.incrementJobsTotal('test', 'error');
      }

      const report = service.generateSLOReport(60);
      const errorRateMeasurement = report.measurements.find(m => m.slo === 'error_rate');
      
      expect(errorRateMeasurement).toBeDefined();
      expect(errorRateMeasurement!.value).toBe(0.05); // 5/100 = 5%
      expect(errorRateMeasurement!.violated).toBe(true); // Above 0.1% target
    });
  });

  describe('latency measurement', () => {
    it('should calculate P95 latency correctly', () => {
      // Add latency measurements
      const latencies = [100, 200, 300, 400, 500, 1000, 1500, 2000, 2500, 3000];
      latencies.forEach(latency => {
        mockMetrics.recordJobLatency('test', latency);
      });

      const report = service.generateSLOReport(60);
      const latencyMeasurement = report.measurements.find(m => m.slo === 'latency_p95');
      
      expect(latencyMeasurement).toBeDefined();
      expect(latencyMeasurement!.value).toBeGreaterThan(0);
      // P95 of the above should be around 2500-3000ms
      expect(latencyMeasurement!.value).toBeGreaterThanOrEqual(2500);
    });
  });

  describe('SLO violations', () => {
    it('should detect current SLO violations', () => {
      // Add metrics that will violate SLOs
      for (let i = 0; i < 5; i++) {
        mockMetrics.incrementJobsTotal('test', 'error'); // High error rate
      }
      mockMetrics.recordJobLatency('test', 10000); // High latency

      const violations = service.checkCurrentSLOViolations(5);
      
      expect(violations.length).toBeGreaterThan(0);
      expect(violations.every(v => v.violated)).toBe(true);
    });

    it('should return empty array when no violations', () => {
      // Add metrics that meet SLOs
      for (let i = 0; i < 1000; i++) {
        mockMetrics.incrementJobsTotal('test', 'success');
      }
      mockMetrics.recordJobLatency('test', 1000); // Good latency

      const violations = service.checkCurrentSLOViolations(5);
      
      expect(violations).toHaveLength(0);
    });
  });

  describe('burn rate calculation', () => {
    it('should calculate burn rate for availability SLO', () => {
      // Add metrics: 99% availability (burning error budget)
      for (let i = 0; i < 99; i++) {
        mockMetrics.incrementJobsTotal('test', 'success');
      }
      mockMetrics.incrementJobsTotal('test', 'error');

      const burnRate = service.calculateSLOBurnRate('availability', 60);
      
      expect(burnRate).toMatchObject({
        burnRate: expect.any(Number),
        errorBudgetRemaining: expect.any(Number),
        timeToExhaustion: expect.any(Number),
      });

      expect(burnRate.burnRate).toBeGreaterThan(0);
      expect(burnRate.errorBudgetRemaining).toBeGreaterThanOrEqual(0);
    });

    it('should calculate burn rate for error rate SLO', () => {
      // Add metrics: 1% error rate (burning error budget fast)
      for (let i = 0; i < 99; i++) {
        mockMetrics.incrementJobsTotal('test', 'success');
      }
      mockMetrics.incrementJobsTotal('test', 'error');

      const burnRate = service.calculateSLOBurnRate('error_rate', 60);
      
      expect(burnRate.burnRate).toBeGreaterThan(0);
      expect(burnRate.errorBudgetRemaining).toBeGreaterThanOrEqual(0);
    });

    it('should throw error for invalid SLO name', () => {
      expect(() => {
        service.calculateSLOBurnRate('invalid_slo', 60);
      }).toThrow('SLO target not found: invalid_slo');
    });
  });

  describe('compliance trend', () => {
    it('should return compliance trend data', () => {
      const trend = service.getSLOComplianceTrend(24);
      
      expect(trend).toBeInstanceOf(Array);
      expect(trend.length).toBeGreaterThan(0);
      expect(trend[0]).toMatchObject({
        timestamp: expect.any(Number),
        compliance: expect.any(Number),
        violations: expect.any(Number),
      });
    });
  });

  describe('global service instance', () => {
    it('should provide working global instance', () => {
      expect(sloMeasurementService).toBeInstanceOf(SLOMeasurementService);
      
      const targets = sloMeasurementService.getSLOTargets();
      expect(targets.length).toBeGreaterThan(0);
    });
  });
});