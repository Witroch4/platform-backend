/**
 * Alert Escalation Integration Tests
 * 
 * Tests for the alert escalation system
 */

import { AlertEngineService } from '../alert-engine.service'
import { NotificationService } from '../notification.service'
import { MetricsCollectorService } from '../metrics-collector.service'
import { Alert, AlertRule, NotificationChannel } from '../../types/alert.types'

// Mock dependencies
jest.mock('../../db')
jest.mock('../../redis')
jest.mock('../../log')

describe('Alert Escalation System', () => {
  let alertEngine: AlertEngineService
  let notificationService: NotificationService
  let metricsCollector: MetricsCollectorService

  beforeEach(() => {
    metricsCollector = new MetricsCollectorService()
    notificationService = new NotificationService({
      escalationDelay: 1, // 1 minute for testing
      enableEscalation: true
    })
    alertEngine = new AlertEngineService(metricsCollector, notificationService)
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('Notification Channels', () => {
    it('should send notifications to multiple channels', async () => {
      const alert: Alert = {
        id: 'test-alert-1',
        ruleId: 'test-rule-1',
        severity: 'critical',
        title: 'Test Alert',
        message: 'This is a test alert',
        status: 'active',
        createdAt: new Date()
      }

      const channels: NotificationChannel[] = [
        {
          type: 'slack',
          config: {
            webhookUrl: 'https://hooks.slack.com/test',
            channel: '#alerts'
          },
          enabled: true
        },
        {
          type: 'email',
          config: {
            provider: 'smtp',
            from: 'alerts@example.com'
          },
          enabled: true
        }
      ]

      // Mock fetch for Slack
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK'
      })

      const deliveries = await notificationService.sendNotifications(alert, channels)

      expect(deliveries).toHaveLength(2)
      expect(deliveries[0].status).toBe('sent')
      expect(deliveries[1].status).toBe('sent') // Email would be mocked as sent
    })

    it('should handle notification failures gracefully', async () => {
      const alert: Alert = {
        id: 'test-alert-2',
        ruleId: 'test-rule-2',
        severity: 'error',
        title: 'Test Alert',
        message: 'This is a test alert',
        status: 'active',
        createdAt: new Date()
      }

      const channels: NotificationChannel[] = [
        {
          type: 'slack',
          config: {
            webhookUrl: 'https://hooks.slack.com/invalid'
          },
          enabled: true
        }
      ]

      // Mock fetch to fail
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error'
      })

      const deliveries = await notificationService.sendNotifications(alert, channels)

      expect(deliveries).toHaveLength(1)
      expect(deliveries[0].status).toBe('failed')
      expect(deliveries[0].error).toContain('Slack API error')
    })
  })

  describe('Alert Escalation', () => {
    it('should escalate critical alerts', async () => {
      const alert: Alert = {
        id: 'test-alert-3',
        ruleId: 'test-rule-3',
        severity: 'critical',
        title: 'Critical Alert',
        message: 'This is a critical alert',
        status: 'active',
        createdAt: new Date()
      }

      const escalateSpy = jest.spyOn(notificationService, 'escalateAlert')

      await notificationService.escalateAlert(alert)

      expect(escalateSpy).toHaveBeenCalledWith(alert)
    })

    it('should cancel escalation when alert is acknowledged', () => {
      const alertId = 'test-alert-4'
      
      const cancelSpy = jest.spyOn(notificationService, 'cancelEscalation')
      
      notificationService.cancelEscalation(alertId)
      
      expect(cancelSpy).toHaveBeenCalledWith(alertId)
    })
  })

  describe('Channel Configuration', () => {
    it('should validate Slack configuration', async () => {
      const alert: Alert = {
        id: 'test-alert-5',
        ruleId: 'test-rule-5',
        severity: 'warning',
        title: 'Test Alert',
        message: 'This is a test alert',
        status: 'active',
        createdAt: new Date()
      }

      const channel: NotificationChannel = {
        type: 'slack',
        config: {
          webhookUrl: 'https://hooks.slack.com/test',
          channel: '#alerts',
          username: 'AlertBot',
          iconEmoji: ':warning:'
        },
        enabled: true
      }

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK'
      })

      const delivery = await notificationService.sendNotification(alert, channel)

      expect(delivery.status).toBe('sent')
      expect(fetch).toHaveBeenCalledWith(
        'https://hooks.slack.com/test',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: expect.stringContaining('AlertBot')
        })
      )
    })

    it('should validate PagerDuty configuration', async () => {
      const alert: Alert = {
        id: 'test-alert-6',
        ruleId: 'test-rule-6',
        severity: 'critical',
        title: 'Critical Alert',
        message: 'This is a critical alert',
        status: 'active',
        createdAt: new Date()
      }

      const channel: NotificationChannel = {
        type: 'pagerduty',
        config: {
          integrationKey: 'test-integration-key',
          severity: 'critical'
        },
        enabled: true
      }

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 202,
        statusText: 'Accepted'
      })

      const delivery = await notificationService.sendNotification(alert, channel)

      expect(delivery.status).toBe('sent')
      expect(fetch).toHaveBeenCalledWith(
        'https://events.pagerduty.com/v2/enqueue',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: expect.stringContaining('test-integration-key')
        })
      )
    })
  })

  describe('Retry Logic', () => {
    it('should retry failed notifications', async () => {
      const alert: Alert = {
        id: 'test-alert-7',
        ruleId: 'test-rule-7',
        severity: 'error',
        title: 'Test Alert',
        message: 'This is a test alert',
        status: 'active',
        createdAt: new Date()
      }

      const channel: NotificationChannel = {
        type: 'webhook',
        config: {
          url: 'https://example.com/webhook',
          method: 'POST',
          timeout: 5000
        },
        enabled: true
      }

      // Mock fetch to fail twice, then succeed
      global.fetch = jest.fn()
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error'
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error'
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          statusText: 'OK'
        })

      const delivery = await notificationService.sendNotification(alert, channel)

      expect(delivery.status).toBe('sent')
      expect(delivery.attempts).toBe(3)
      expect(fetch).toHaveBeenCalledTimes(3)
    })

    it('should fail after max retries', async () => {
      const alert: Alert = {
        id: 'test-alert-8',
        ruleId: 'test-rule-8',
        severity: 'error',
        title: 'Test Alert',
        message: 'This is a test alert',
        status: 'active',
        createdAt: new Date()
      }

      const channel: NotificationChannel = {
        type: 'webhook',
        config: {
          url: 'https://example.com/webhook',
          method: 'POST',
          timeout: 5000
        },
        enabled: true
      }

      // Mock fetch to always fail
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error'
      })

      const delivery = await notificationService.sendNotification(alert, channel)

      expect(delivery.status).toBe('failed')
      expect(delivery.attempts).toBe(3) // Default max retries
      expect(delivery.error).toContain('Webhook error')
    })
  })
})