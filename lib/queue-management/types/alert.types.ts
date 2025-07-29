/**
 * Alert System Types
 * 
 * Type definitions for the alert engine and notification system
 */

export type AlertSeverity = 'info' | 'warning' | 'error' | 'critical'
export type AlertStatus = 'active' | 'acknowledged' | 'resolved'

export interface AlertCondition {
  metric: string
  operator: '>' | '<' | '==' | '!=' | 'contains' | '>=' | '<='
  threshold: number | string
  timeWindow: number // minutes
  aggregation?: 'avg' | 'sum' | 'max' | 'min' | 'count'
}

export interface NotificationChannel {
  type: 'email' | 'slack' | 'webhook' | 'sms' | 'pagerduty'
  config: Record<string, any>
  enabled: boolean
}

export interface AlertRule {
  id?: string
  name: string
  description?: string
  queueName?: string // null = global
  condition: AlertCondition
  severity: AlertSeverity
  channels: NotificationChannel[]
  cooldown: number // minutes
  enabled: boolean
  createdBy: string
  createdAt?: Date
  updatedAt?: Date
}

export interface Alert {
  id: string
  ruleId: string
  queueName?: string
  severity: AlertSeverity
  title: string
  message: string
  metrics?: Record<string, any>
  status: AlertStatus
  createdAt: Date
  acknowledgedAt?: Date
  acknowledgedBy?: string
  resolvedAt?: Date
  resolutionNote?: string
}

export interface AlertEvaluation {
  ruleId: string
  triggered: boolean
  currentValue: number | string
  threshold: number | string
  metrics: Record<string, any>
  timestamp: Date
}

export interface AlertDelivery {
  id: string
  alertId: string
  channel: NotificationChannel
  status: 'pending' | 'sent' | 'failed' | 'delivered'
  attempts: number
  lastAttempt?: Date
  error?: string
  deliveredAt?: Date
}

export interface AlertEscalation {
  alertId: string
  level: number
  channels: NotificationChannel[]
  delayMinutes: number
  triggered: boolean
  triggeredAt?: Date
}

export interface Anomaly {
  id: string
  queueName: string
  metric: string
  value: number
  expectedValue: number
  deviation: number
  severity: AlertSeverity
  detectedAt: Date
  description: string
}

export interface AlertEngineConfig {
  evaluationInterval: number // seconds
  maxConcurrentEvaluations: number
  defaultCooldown: number // minutes
  escalationEnabled: boolean
  anomalyDetectionEnabled: boolean
}

export interface AlertMetrics {
  totalRules: number
  activeRules: number
  totalAlerts: number
  activeAlerts: number
  alertsByStatus: Record<AlertStatus, number>
  alertsBySeverity: Record<AlertSeverity, number>
  averageResolutionTime: number // minutes
  falsePositiveRate: number // percentage
}

export interface AlertRuleCreateInput {
  name: string
  description?: string
  queueName?: string
  condition: AlertCondition
  severity: AlertSeverity
  channels: NotificationChannel[]
  cooldown?: number
  enabled?: boolean
}

export interface AlertRuleUpdateInput {
  name?: string
  description?: string
  condition?: AlertCondition
  severity?: AlertSeverity
  channels?: NotificationChannel[]
  cooldown?: number
  enabled?: boolean
}

export interface AlertAcknowledgeInput {
  acknowledgedBy: string
  note?: string
}

export interface AlertResolveInput {
  resolvedBy: string
  resolutionNote?: string
}

export interface AlertQueryFilters {
  ruleId?: string
  queueName?: string
  severity?: AlertSeverity[]
  status?: AlertStatus[]
  createdAfter?: Date
  createdBefore?: Date
  acknowledgedBy?: string
}

export interface AlertRuleQueryFilters {
  queueName?: string
  severity?: AlertSeverity[]
  enabled?: boolean
  createdBy?: string
}