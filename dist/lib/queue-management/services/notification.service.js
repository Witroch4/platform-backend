"use strict";
/**
 * Notification Service
 *
 * Service for sending notifications through multiple channels and handling escalation
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationService = void 0;
const log_1 = require("../../log");
class NotificationService {
    config;
    escalationTimers = new Map();
    constructor(config = {}) {
        this.config = {
            maxRetries: config.maxRetries || 3,
            retryDelay: config.retryDelay || 5000, // 5 seconds
            escalationDelay: config.escalationDelay || 15, // 15 minutes
            enableEscalation: config.enableEscalation ?? true
        };
    }
    /**
     * Send notifications for an alert through all configured channels
     */
    async sendNotifications(alert, channels) {
        const deliveries = [];
        for (const channel of channels.filter(c => c.enabled)) {
            try {
                const delivery = await this.sendNotification(alert, channel);
                deliveries.push(delivery);
                // Schedule escalation if enabled and alert is critical
                if (this.config.enableEscalation && this.shouldEscalate(alert, channel)) {
                    this.scheduleEscalation(alert, channel);
                }
            }
            catch (error) {
                log_1.logger.error('Failed to send notification', {
                    error,
                    alertId: alert.id,
                    channelType: channel.type
                });
                // Create failed delivery record
                deliveries.push({
                    id: this.generateDeliveryId(),
                    alertId: alert.id,
                    channel,
                    status: 'failed',
                    attempts: 1,
                    lastAttempt: new Date(),
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        }
        return deliveries;
    }
    /**
     * Send a single notification through a specific channel
     */
    async sendNotification(alert, channel) {
        const delivery = {
            id: this.generateDeliveryId(),
            alertId: alert.id,
            channel,
            status: 'pending',
            attempts: 0
        };
        let lastError = null;
        for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
            delivery.attempts = attempt;
            delivery.lastAttempt = new Date();
            try {
                await this.sendToChannel(alert, channel);
                delivery.status = 'sent';
                delivery.deliveredAt = new Date();
                log_1.logger.info('Notification sent successfully', {
                    alertId: alert.id,
                    channelType: channel.type,
                    attempt
                });
                return delivery;
            }
            catch (error) {
                lastError = error instanceof Error ? error : new Error('Unknown error');
                log_1.logger.warn('Notification attempt failed', {
                    alertId: alert.id,
                    channelType: channel.type,
                    attempt,
                    error: lastError.message
                });
                if (attempt < this.config.maxRetries) {
                    await this.delay(this.config.retryDelay * attempt); // Exponential backoff
                }
            }
        }
        delivery.status = 'failed';
        delivery.error = lastError?.message || 'Unknown error';
        return delivery;
    }
    /**
     * Escalate an alert to higher priority channels
     */
    async escalateAlert(alert) {
        try {
            log_1.logger.info('Escalating alert', { alertId: alert.id });
            // Get escalation channels based on severity
            const escalationChannels = this.getEscalationChannels(alert.severity);
            if (escalationChannels.length === 0) {
                log_1.logger.warn('No escalation channels configured', { alertId: alert.id });
                return;
            }
            // Send escalation notifications
            const escalationAlert = {
                ...alert,
                title: `[ESCALATED] ${alert.title}`,
                message: `ESCALATED ALERT: ${alert.message}\n\nThis alert has been escalated due to lack of acknowledgment.`
            };
            await this.sendNotifications(escalationAlert, escalationChannels);
            // Record escalation
            await this.recordEscalation(alert.id, escalationChannels);
            log_1.logger.info('Alert escalated successfully', {
                alertId: alert.id,
                channels: escalationChannels.map(c => c.type)
            });
        }
        catch (error) {
            log_1.logger.error('Failed to escalate alert', { error, alertId: alert.id });
        }
    }
    /**
     * Cancel escalation for an alert (when acknowledged)
     */
    cancelEscalation(alertId) {
        const timer = this.escalationTimers.get(alertId);
        if (timer) {
            clearTimeout(timer);
            this.escalationTimers.delete(alertId);
            log_1.logger.info('Escalation cancelled', { alertId });
        }
    }
    /**
     * Get delivery status for an alert
     */
    async getDeliveryStatus(alertId) {
        // In a real implementation, this would query a database
        // For now, return empty array
        return [];
    }
    // Private methods
    async sendToChannel(alert, channel) {
        switch (channel.type) {
            case 'slack':
                await this.sendSlackNotification(alert, channel.config);
                break;
            case 'email':
                await this.sendEmailNotification(alert, channel.config);
                break;
            case 'sms':
                await this.sendSMSNotification(alert, channel.config);
                break;
            case 'pagerduty':
                await this.sendPagerDutyNotification(alert, channel.config);
                break;
            case 'webhook':
                await this.sendWebhookNotification(alert, channel.config);
                break;
            default:
                throw new Error(`Unsupported notification channel: ${channel.type}`);
        }
    }
    async sendSlackNotification(alert, config) {
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
        };
        const response = await fetch(config.webhookUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });
        if (!response.ok) {
            throw new Error(`Slack API error: ${response.status} ${response.statusText}`);
        }
    }
    async sendEmailNotification(alert, config) {
        // Email implementation would go here
        // For now, just log
        log_1.logger.info('Email notification would be sent', {
            alertId: alert.id,
            to: config.from,
            subject: alert.title
        });
    }
    async sendSMSNotification(alert, config) {
        // SMS implementation would go here
        // For now, just log
        log_1.logger.info('SMS notification would be sent', {
            alertId: alert.id,
            provider: config.provider
        });
    }
    async sendPagerDutyNotification(alert, config) {
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
        };
        const response = await fetch('https://events.pagerduty.com/v2/enqueue', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });
        if (!response.ok) {
            throw new Error(`PagerDuty API error: ${response.status} ${response.statusText}`);
        }
    }
    async sendWebhookNotification(alert, config) {
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
        };
        const DEFAULT_TIMEOUT_MS = 10000;
        const response = await fetch(config.url, {
            method: config.method,
            headers: {
                'Content-Type': 'application/json',
                ...config.headers
            },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(config.timeout ?? DEFAULT_TIMEOUT_MS)
        });
        if (!response.ok) {
            throw new Error(`Webhook error: ${response.status} ${response.statusText}`);
        }
    }
    shouldEscalate(alert, channel) {
        // Escalate critical and error alerts
        return ['critical', 'error'].includes(alert.severity);
    }
    scheduleEscalation(alert, channel) {
        const timer = setTimeout(() => this.escalateAlert(alert), this.config.escalationDelay * 60 * 1000 // Convert minutes to milliseconds
        );
        this.escalationTimers.set(alert.id, timer);
        log_1.logger.info('Escalation scheduled', {
            alertId: alert.id,
            delayMinutes: this.config.escalationDelay
        });
    }
    getEscalationChannels(severity) {
        // This would typically be configured per organization
        // For now, return a default escalation channel
        const escalationChannels = [];
        if (severity === 'critical') {
            escalationChannels.push({
                type: 'pagerduty',
                config: {
                    integrationKey: process.env.PAGERDUTY_INTEGRATION_KEY || '',
                    severity: 'critical'
                },
                enabled: true
            });
        }
        return escalationChannels;
    }
    async recordEscalation(alertId, channels) {
        // In a real implementation, this would record the escalation in the database
        log_1.logger.info('Escalation recorded', {
            alertId,
            channels: channels.map(c => c.type)
        });
    }
    getSlackColor(severity) {
        switch (severity) {
            case 'critical': return 'danger';
            case 'error': return 'danger';
            case 'warning': return 'warning';
            case 'info': return 'good';
            default: return '#808080';
        }
    }
    mapSeverityToPagerDuty(severity) {
        switch (severity) {
            case 'critical': return 'critical';
            case 'error': return 'error';
            case 'warning': return 'warning';
            case 'info': return 'info';
            default: return 'error';
        }
    }
    generateDeliveryId() {
        return `delivery_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
exports.NotificationService = NotificationService;
