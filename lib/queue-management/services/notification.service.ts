/**
 * Notification Service
 * 
 * Service for sending notifications through multiple channels and handling escalation
 */

import { db } from '../../db'
import { redis } from '../../redis'
import { logger } from '../../log'
import {
  Alert,
  NotificationChannel,
  AlertDelivery,
  AlertEscalation,
  AlertSeverity
} from '../types/alert.types'
import { QueueManagementError } from '../errors'
import { ERROR_CODES } from '../constants'

export interface NotificationConfig {
  maxRetries: number
  retryDelay: number // milliseconds
  escalationDelay: number // minutes
  enableEscalation: boolean
}

export interface SlackConfig {
  webhookUrl: string
  channel?: string
  username?: string
  iconEmoji?: string
}

export interface PagerDutyConfig {
  integrationKey: string
  severity?: 'critical' | 'error' | 'warning' | 'info'
}

export interface SMSConfig {
  provider: 'twilio' | 'aws-sns'
  accountSid?: string
  authToken?: string
  fromNumber?: string
  region?: string
}

export interface EmailConfig {
  provider: 'smtp' | 'ses' | 'sendgrid'
  host?: string
  port?: number
  secure?: boolean
  auth?: {
    user: string
    pass: string
  }
  from: string
}

export interface WebhookConfig {
  url: string
  method: 'POST' | 'PUT'
  headers?: Record<string, string>
  timeout: number
}

export class NotificationService {
  private config: NotificationConfig
  private escalationTimers = new Map<string, NodeJS.Timeout>()

  constructor(config: Partial<NotificationConfig> = {}) {
    this.config = {
      maxRetries: config.maxRetries || 3,
      retryDelay: config.retryDelay || 5000, // 5 seconds
      escalationDelay: config.escalationDelay || 15, // 15 minutes
      enableEscalation: config.enableEscalation ?? true
    }
  }

  /**
   * Send notifications for an alert through all configured channels
   */
  async sendNotifications(alert: Alert, channels: NotificationChannel[]): Promise<AlertDelivery[]> {
    const deliveries: AlertDelivery[] = []

    for (const channel of channels.filter(c => c.enabled)) {
      try {
        const delivery = await this.sendNotification(alert, channel)
        deliveries.push(delivery)

        // Schedule escalation if enabled and alert is critical
        if (this.config.enableEscalation && this.shouldEscalate(alert, channel)) {
          this.scheduleEscalation(alert, channel)
        }
      } catch (error) {
        logger.error('Failed to send notification', {
          error,
          alertId: alert.id,
          channelType: channel.type
        })

        // Create failed delivery record
        deliveries.push({
          id: this.generateDeliveryId(),
          alertId: alert.id,
          channel,
          status: 'failed',
          attempts: 1,
          lastAttempt: new Date(),
          error: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    }

    return deliveries
  }

  /**
   * Send a single notification through a specific channel
   */
  async sendNotification(alert: Alert, channel: NotificationChannel): Promise<AlertDelivery> {
    const delivery: AlertDelivery = {
      id: this.generateDeliveryId(),
      alertId: alert.id,
      channel,
      status: 'pending',
      attempts: 0
    }

    let lastError: Error | null = null

    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      delivery.attempts = attempt
      delivery.lastAttempt = new Date()

      try {
        await this.sendToChannel(alert, channel)
        delivery.status = 'sent'
        delivery.deliveredAt = new Date()
        
        logger.info('Notification sent successfully', {
          alertId: alert.id,
          channelType: channel.type,
          attempt
        })

        return delivery
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error')
        
        logger.warn('Notification attempt failed', {
          alertId: alert.id,
          channelType: channel.type,
          attempt,
          error: lastError.message
        })

        if (attempt < this.config.maxRetries) {
          await this.delay(this.config.retryDelay * attempt) // Exponential backoff
        }
      }
    }

    delivery.status = 'failed'
    delivery.error = lastError?.message || 'Unknown error'

    return delivery
  }

  /**
   * Escalate an alert to higher priority channels
   */
  async escalateAlert(alert: Alert): Promise<void> {
    try {
      logger.info('Escalating alert', { alertId: alert.id })

      // Get escalation channels based on severity
      const escalationChannels = this.getEscalationChannels(alert.severity)

      if (escalationChannels.length === 0) {
        logger.warn('No escalation channels configured', { alertId: alert.id })
        return
      }

      // Send escalation notifications
      const escalationAlert = {
        ...alert,
        title: `[ESCALATED] ${alert.title}`,
        message: `ESCALATED ALERT: ${alert.message}\n\nThis alert has been escalated due to lack of acknowledgment.`
      }

      await this.sendNotifications(escalationAlert, escalationChannels)

      // Record escalation
      await this.recordEscalation(alert.id, escalationChannels)

      logger.info('Alert escalated successfully', {
        alertId: alert.id,
        channels: escalationChannels.map(c => c.type)
      })
    } catch (error) {
      logger.error('Failed to escalate alert', { error, alertId: alert.id })
    }
  }

  /**
   * Cancel escalation for an alert (when acknowledged)
   */
  cancelEscalation(alertId: string): void {
    const timer = this.escalationTimers.get(alertId)
    if (timer) {
      clearTimeout(timer)
      this.escalationTimers.delete(alertId)
      logger.info('Escalation cancelled', { alertId })
    }
  }

  /**
   * Get delivery status for an alert
   */
  async getDeliveryStatus(alertId: string): Promise<AlertDelivery[]> {
    // In a real implementation, this would query a database
    // For now, return empty array
    return []
  }

  // Private methods

  private async sendToChannel(alert: Alert, channel: NotificationChannel): Promise<void> {
    switch (channel.type) {
      case 'slack':
        await this.sendSlackNotification(alert, channel.config as SlackConfig)
        break
      case 'email':
        await this.sendEmailNotification(alert, channel.config as EmailConfig)
        break
      case 'sms':
        await this.sendSMSNotification(alert, channel.config as SMSConfig)
        break
      case 'pagerduty':
        await this.sendPagerDutyNotification(alert, channel.config as PagerDutyConfig)
        break
      case 'webhook':
        await this.sendWebhookNotification(alert, channel.config as WebhookConfig)
        break
      default:
        throw new Error(`Unsupported notification channel: ${channel.type}`)
    }
  }

  private async sendSlackNotification(alert: Alert, config: SlackConfig): Promise<void> {
    const payload = {
      channel: config.channel,
      username: config.username || 'Queue Alert Bot',
      icon_emoji: config.iconEmoji || ':warning:',
      attachments: [
        {
          color: this.getSlackColor(alert.severity),
          title: alert.title,
          text: alert.message,
          fields: [
            {
              title: 'Severity',
              value: alert.severity.toUpperCase(),
              short: true
            },
            {
              title: 'Queue',
              value: alert.queueName || 'System-wide',
              short: true
            },
            {
              title: 'Time',
              value: alert.createdAt.toISOString(),
              short: true
            }
          ],
          footer: 'Queue Management System',
          ts: Math.floor(alert.createdAt.getTime() / 1000)
        }
      ]
    }

    const response = await fetch(config.webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    })

    if (!response.ok) {
      throw new Error(`Slack API error: ${response.status} ${response.statusText}`)
    }
  }

  private async sendEmailNotification(alert: Alert, config: EmailConfig): Promise<void> {
    // Email implementation would go here
    // For now, just log
    logger.info('Email notification would be sent', {
      alertId: alert.id,
      to: config.from,
      subject: alert.title
    })
  }

  private async sendSMSNotification(alert: Alert, config: SMSConfig): Promise<void> {
    // SMS implementation would go here
    // For now, just log
    logger.info('SMS notification would be sent', {
      alertId: alert.id,
      provider: config.provider
    })
  }

  private async sendPagerDutyNotification(alert: Alert, config: PagerDutyConfig): Promise<void> {
    const payload = {
      routing_key: config.integrationKey,
      event_action: 'trigger',
      dedup_key: `queue-alert-${alert.id}`,
      payload: {
        summary: alert.title,
        source: 'Queue Management System',
        severity: config.severity || this.mapSeverityToPagerDuty(alert.severity),
        component: alert.queueName || 'system',
        group: 'queue-management',
        class: 'alert',
        custom_details: {
          message: alert.message,
          queue_name: alert.queueName,
          alert_id: alert.id,
          created_at: alert.createdAt.toISOString(),
          metrics: alert.metrics
        }
      }
    }

    const response = await fetch('https://events.pagerduty.com/v2/enqueue', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    })

    if (!response.ok) {
      throw new Error(`PagerDuty API error: ${response.status} ${response.statusText}`)
    }
  }

  private async sendWebhookNotification(alert: Alert, config: WebhookConfig): Promise<void> {
    const payload = {
      alert_id: alert.id,
      rule_id: alert.ruleId,
      severity: alert.severity,
      title: alert.title,
      message: alert.message,
      queue_name: alert.queueName,
      status: alert.status,
      created_at: alert.createdAt.toISOString(),
      metrics: alert.metrics
    }

    const response = await fetch(config.url, {
      method: config.method,
      headers: {
        'Content-Type': 'application/json',
        ...config.headers
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(config.timeout)
    })

    if (!response.ok) {
      throw new Error(`Webhook error: ${response.status} ${response.statusText}`)
    }
  }

  private shouldEscalate(alert: Alert, channel: NotificationChannel): boolean {
    // Escalate critical and error alerts
    return ['critical', 'error'].includes(alert.severity)
  }

  private scheduleEscalation(alert: Alert, channel: NotificationChannel): void {
    const timer = setTimeout(
      () => this.escalateAlert(alert),
      this.config.escalationDelay * 60 * 1000 // Convert minutes to milliseconds
    )

    this.escalationTimers.set(alert.id, timer)

    logger.info('Escalation scheduled', {
      alertId: alert.id,
      delayMinutes: this.config.escalationDelay
    })
  }

  private getEscalationChannels(severity: AlertSeverity): NotificationChannel[] {
    // This would typically be configured per organization
    // For now, return a default escalation channel
    const escalationChannels: NotificationChannel[] = []

    if (severity === 'critical') {
      escalationChannels.push({
        type: 'pagerduty',
        config: {
          integrationKey: process.env.PAGERDUTY_INTEGRATION_KEY || '',
          severity: 'critical'
        },
        enabled: true
      })
    }

    return escalationChannels
  }

  private async recordEscalation(alertId: string, channels: NotificationChannel[]): Promise<void> {
    // In a real implementation, this would record the escalation in the database
    logger.info('Escalation recorded', {
      alertId,
      channels: channels.map(c => c.type)
    })
  }

  private getSlackColor(severity: AlertSeverity): string {
    switch (severity) {
      case 'critical': return 'danger'
      case 'error': return 'danger'
      case 'warning': return 'warning'
      case 'info': return 'good'
      default: return '#808080'
    }
  }

  private mapSeverityToPagerDuty(severity: AlertSeverity): 'critical' | 'error' | 'warning' | 'info' {
    switch (severity) {
      case 'critical': return 'critical'
      case 'error': return 'error'
      case 'warning': return 'warning'
      case 'info': return 'info'
      default: return 'error'
    }
  }

  private generateDeliveryId(): string {
    return `delivery_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}