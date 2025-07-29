/**
 * ML-based Anomaly Detection Tests
 * 
 * Tests for machine learning anomaly detection and predictive alerting
 */

import { AlertEngineService } from '../alert-engine.service'
import { NotificationService } from '../notification.service'
import { MetricsCollectorService } from '../metrics-collector.service'
import { AnomalyDetectorService } from '../anomaly-detector.service'
import { Alert, AlertRule } from '../../types/alert.types'

// Mock dependencies
jest.mock('../../db')
jest.mock('../../redis')
jest.mock('../../log')

describe('ML-based Anomaly Detection', () => {
  let alertEngine: AlertEngineService
  let notificationService: NotificationService
  let metricsCollector: MetricsCollectorService
  let anomalyDetector: AnomalyDetectorService

  beforeEach(() => {
    metricsCollector = new MetricsCollectorService()
    notificationService = new NotificationService()
    anomalyDetector = new AnomalyDetectorService({} as any, {} as any)
    alertEngine = new AlertEngineService(
      metricsCollector,
      notificationService,
      anomalyDetector,
      { anomalyDetectionEnabled: true }
    )
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('Anomaly Detection Training', () => {
    it('should train anomaly detection models with historical data', async () => {
      const mockMetrics = {
        throughput: { jobsPerMinute: 100 },
        latency: { p95: 500 },
        reliability: { errorRate: 0.02 }
      }

      jest.spyOn(metricsCollector, 'collectQueueMetrics').mockResolvedValue(mockMetrics)
      jest.spyOn(anomalyDetector, 'train').mockResolvedValue()

      await alertEngine.trainAnomalyDetection('test-queue')

      expect(anomalyDetector.train).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'throughput',
            value: 100
          })
        ])
      )
    })

    it('should handle training failures gracefully', async () => {
      jest.spyOn(metricsCollector, 'collectQueueMetrics').mockRejectedValue(
        new Error('Metrics collection failed')
      )

      await expect(alertEngine.trainAnomalyDetection('test-queue')).rejects.toThrow()
    })
  })

  describe('Real-time Anomaly Detection', () => {
    it('should detect anomalies in current metrics', async () => {
      const mockMetrics = {
        throughput: { jobsPerMinute: 1000 }, // Unusually high
        latency: { p95: 5000 }, // Unusually high
        reliability: { errorRate: 0.15 } // High error rate
      }

      const mockAnomalies = [
        {
          id: 'anomaly-1',
          queueName: 'test-queue',
          metric: 'throughput',
          value: 1000,
          expectedValue: 100,
          deviation: 9,
          severity: 'critical',
          description: 'Throughput anomaly detected',
          timestamp: new Date()
        }
      ]

      jest.spyOn(metricsCollector, 'collectQueueMetrics').mockResolvedValue(mockMetrics)
      jest.spyOn(anomalyDetector, 'detect').mockResolvedValue(mockAnomalies)
      jest.spyOn(alertEngine as any, 'createPredictiveAlerts').mockResolvedValue()

      const anomalies = await alertEngine.detectAnomalies('test-queue')

      expect(anomalies).toHaveLength(1)
      expect(anomalies[0].severity).toBe('critical')
      expect(alertEngine['createPredictiveAlerts']).toHaveBeenCalledWith(mockAnomalies)
    })

    it('should create predictive alerts for detected anomalies', async () => {
      const mockAnomalies = [
        {
          id: 'anomaly-1',
          queueName: 'test-queue',
          metric: 'error_rate',
          value: 0.15,
          expectedValue: 0.02,
          deviation: 6.5,
          severity: 'error',
          description: 'Error rate anomaly detected',
          timestamp: new Date()
        }
      ]

      // Mock database operations
      const mockAlert = {
        id: 'alert-1',
        ruleId: 'predictive',
        queueName: 'test-queue',
        severity: 'error',
        title: 'Anomaly Detected: test-queue error_rate',
        message: 'Error rate anomaly detected',
        status: 'active',
        createdAt: new Date()
      }

      const mockDb = require('../../db').db
      mockDb.alert.create.mockResolvedValue(mockAlert)
      mockDb.alertRule.findMany.mockResolvedValue([])
      mockDb.alertRule.create.mockResolvedValue({
        id: 'rule-1',
        name: 'Predictive Alert: test-queue error_rate',
        channels: []
      })

      await alertEngine['createPredictiveAlerts'](mockAnomalies)

      expect(mockDb.alert.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          severity: 'error',
          title: 'Anomaly Detected: test-queue error_rate'
        })
      })
    })
  })

  describe('Predictive Alerting', () => {
    it('should create predictive alerts based on trend forecasting', async () => {
      const mockMetrics = {
        throughput: { jobsPerMinute: 100 },
        latency: { p95: 500 }
      }

      const mockTrendPrediction = {
        queueName: 'test-queue',
        metric: 'throughput',
        predictions: [
          {
            timestamp: new Date(Date.now() + 60 * 60 * 1000), // 1 hour ahead
            predictedValue: 800, // Predicted spike
            confidence: 0.85
          },
          {
            timestamp: new Date(Date.now() + 2 * 60 * 60 * 1000), // 2 hours ahead
            predictedValue: 1200, // Higher spike
            confidence: 0.75
          }
        ],
        accuracy: 0.9
      }

      jest.spyOn(metricsCollector, 'collectQueueMetrics').mockResolvedValue(mockMetrics)
      jest.spyOn(anomalyDetector, 'forecast').mockResolvedValue(mockTrendPrediction)

      const mockDb = require('../../db').db
      mockDb.alert.create.mockResolvedValue({
        id: 'predictive-alert-1',
        ruleId: 'predictive',
        severity: 'warning',
        createdAt: new Date()
      })

      const alerts = await alertEngine.createPredictiveAlerts('test-queue', 24)

      expect(alerts).toHaveLength(2) // Two predictions with high confidence
      expect(mockDb.alert.create).toHaveBeenCalledTimes(2)
    })

    it('should only create alerts for high-confidence predictions', async () => {
      const mockTrendPrediction = {
        queueName: 'test-queue',
        metric: 'throughput',
        predictions: [
          {
            timestamp: new Date(Date.now() + 60 * 60 * 1000),
            predictedValue: 800,
            confidence: 0.5 // Low confidence - should not create alert
          },
          {
            timestamp: new Date(Date.now() + 2 * 60 * 60 * 1000),
            predictedValue: 1200,
            confidence: 0.85 // High confidence - should create alert
          }
        ],
        accuracy: 0.9
      }

      jest.spyOn(metricsCollector, 'collectQueueMetrics').mockResolvedValue({})
      jest.spyOn(anomalyDetector, 'forecast').mockResolvedValue(mockTrendPrediction)

      const mockDb = require('../../db').db
      mockDb.alert.create.mockResolvedValue({
        id: 'predictive-alert-1',
        severity: 'warning',
        createdAt: new Date()
      })

      const alerts = await alertEngine.createPredictiveAlerts('test-queue', 24)

      expect(alerts).toHaveLength(1) // Only one high-confidence prediction
      expect(mockDb.alert.create).toHaveBeenCalledTimes(1)
    })
  })

  describe('Severity Determination', () => {
    it('should determine appropriate severity levels for predictions', () => {
      const alertEngine = new AlertEngineService(
        metricsCollector,
        notificationService,
        anomalyDetector
      )

      expect(alertEngine['determinePredictiveSeverity'](1500, 'test-queue')).toBe('critical')
      expect(alertEngine['determinePredictiveSeverity'](750, 'test-queue')).toBe('error')
      expect(alertEngine['determinePredictiveSeverity'](250, 'test-queue')).toBe('warning')
      expect(alertEngine['determinePredictiveSeverity'](50, 'test-queue')).toBe('info')
    })
  })

  describe('Integration with Alert Engine', () => {
    it('should set up anomaly detection listeners on start', async () => {
      const eventListenerSpy = jest.spyOn(anomalyDetector, 'on')
      const trainingSpy = jest.spyOn(alertEngine, 'trainAnomalyDetection').mockResolvedValue()

      await alertEngine.start()

      expect(eventListenerSpy).toHaveBeenCalledWith('anomalies_detected', expect.any(Function))
      expect(trainingSpy).toHaveBeenCalled()
    })

    it('should handle anomaly detection events', async () => {
      const mockAnomalies = [
        {
          id: 'anomaly-1',
          queueName: 'test-queue',
          metric: 'throughput',
          severity: 'warning'
        }
      ]

      const createAlertsSpy = jest.spyOn(alertEngine as any, 'createPredictiveAlerts').mockResolvedValue()

      // Simulate anomaly detection event
      anomalyDetector.emit('anomalies_detected', mockAnomalies)

      // Wait for async event handler
      await new Promise(resolve => setTimeout(resolve, 10))

      expect(createAlertsSpy).toHaveBeenCalledWith(mockAnomalies)
    })
  })

  describe('Metrics Conversion', () => {
    it('should convert metrics to anomaly detection format', () => {
      const mockMetrics = {
        throughput: { jobsPerMinute: 100 },
        latency: { p95: 500 },
        reliability: { errorRate: 0.02 }
      }

      const converted = alertEngine['convertMetricsForAnomalyDetection'](mockMetrics, 'test-queue')

      expect(converted).toHaveLength(3)
      expect(converted[0]).toMatchObject({
        name: 'throughput',
        value: 100,
        labels: { queueName: 'test-queue' }
      })
      expect(converted[1]).toMatchObject({
        name: 'processing_time',
        value: 500
      })
      expect(converted[2]).toMatchObject({
        name: 'error_rate',
        value: 0.02
      })
    })

    it('should handle array metrics format', () => {
      const mockMetrics = [
        { name: 'throughput', value: 100, timestamp: new Date() },
        { name: 'latency', value: 500, timestamp: new Date() }
      ]

      const converted = alertEngine['convertMetricsForAnomalyDetection'](mockMetrics)

      expect(converted).toBe(mockMetrics) // Should return as-is for array format
    })
  })
})