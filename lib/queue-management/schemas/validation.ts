/**
 * Queue Management Validation Schemas
 * 
 * Zod schemas for validating input data in the queue management system
 */

import { z } from 'zod'

// Base validation schemas
export const PaginationSchema = z.object({
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(1000).default(50),
})

export const TimeRangeSchema = z.object({
  start: z.date(),
  end: z.date(),
  granularity: z.enum(['1m', '5m', '1h', '1d', '1w', '1M']).optional(),
})

export const SortOptionsSchema = z.object({
  field: z.string(),
  direction: z.enum(['asc', 'desc']).default('desc'),
})

// Queue Configuration Schemas
export const RateLimiterConfigSchema = z.object({
  max: z.number().int().min(1),
  duration: z.number().int().min(1000), // milliseconds
  bounceBack: z.boolean().optional(),
})

export const RetryPolicySchema = z.object({
  attempts: z.number().int().min(1).max(10),
  backoff: z.enum(['fixed', 'exponential']),
  delay: z.number().int().min(0),
})

export const CleanupPolicySchema = z.object({
  removeOnComplete: z.number().int().min(0).max(10000),
  removeOnFail: z.number().int().min(0).max(10000),
  maxAge: z.number().int().min(0).optional(), // seconds
})

export const AlertThresholdsSchema = z.object({
  queueSize: z.object({
    warning: z.number().int().min(0),
    critical: z.number().int().min(0),
  }).optional(),
  processingTime: z.object({
    warning: z.number().int().min(0), // milliseconds
    critical: z.number().int().min(0),
  }).optional(),
  errorRate: z.object({
    warning: z.number().min(0).max(1), // percentage as decimal
    critical: z.number().min(0).max(1),
  }).optional(),
  memoryUsage: z.object({
    warning: z.number().min(0).max(1), // percentage as decimal
    critical: z.number().min(0).max(1),
  }).optional(),
})

export const QueueConfigSchema = z.object({
  name: z.string().min(1).max(255).regex(/^[a-zA-Z0-9_-]+$/, 'Queue name must contain only alphanumeric characters, underscores, and hyphens'),
  displayName: z.string().max(255).optional(),
  description: z.string().max(1000).optional(),
  priority: z.number().int().min(0).max(100).default(0),
  concurrency: z.number().int().min(1).max(1000).default(1),
  rateLimiter: RateLimiterConfigSchema.optional(),
  retryPolicy: RetryPolicySchema,
  cleanupPolicy: CleanupPolicySchema,
  alertThresholds: AlertThresholdsSchema,
})

export const QueueConfigUpdateSchema = QueueConfigSchema.partial().omit({ name: true })

// Job Action Schemas
export const JobActionSchema = z.object({
  action: z.enum(['retry', 'remove', 'promote', 'delay']),
  jobIds: z.array(z.string()).min(1).max(1000),
  delay: z.number().int().min(0).optional(),
})

export const BatchActionSchema = z.object({
  action: z.enum(['retry_all_failed', 'clean_completed', 'pause_queue', 'resume_queue']),
  queueName: z.string().min(1),
  options: z.record(z.any()).optional(),
})

// Alert Rule Schemas
export const AlertConditionSchema = z.object({
  metric: z.string().min(1),
  operator: z.enum(['>', '<', '==', '!=', 'contains']),
  threshold: z.union([z.number(), z.string()]),
  timeWindow: z.number().int().min(1), // minutes
  aggregation: z.enum(['avg', 'sum', 'max', 'min', 'count']).optional(),
})

export const NotificationChannelSchema = z.object({
  type: z.enum(['email', 'slack', 'webhook', 'sms']),
  config: z.record(z.any()),
})

export const AlertRuleSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
  queueName: z.string().optional(),
  condition: AlertConditionSchema,
  severity: z.enum(['info', 'warning', 'error', 'critical']),
  channels: z.array(NotificationChannelSchema).min(1),
  cooldown: z.number().int().min(0).default(5), // minutes
  enabled: z.boolean().default(true),
})

export const AlertRuleUpdateSchema = AlertRuleSchema.partial()

// Alert Management Schemas
export const AlertAcknowledgeSchema = z.object({
  alertId: z.string(),
  note: z.string().max(1000).optional(),
})

export const AlertResolveSchema = z.object({
  alertId: z.string(),
  resolutionNote: z.string().max(1000).optional(),
})

// Flow Schemas
export const FlowCreateSchema = z.object({
  flowId: z.string().min(1).max(255),
  name: z.string().max(255).optional(),
  description: z.string().max(1000).optional(),
  rootJobId: z.string().min(1),
  metadata: z.record(z.any()).optional(),
})

export const JobDependencySchema = z.object({
  jobId: z.string().min(1),
  parentJobId: z.string().optional(),
  dependencyType: z.enum(['sequential', 'parallel', 'conditional']).default('sequential'),
  condition: z.record(z.any()).optional(),
})

// User Management Schemas
export const QueueUserSchema = z.object({
  userId: z.string().min(1),
  email: z.string().email(),
  name: z.string().min(1).max(255),
  role: z.enum(['viewer', 'operator', 'admin', 'superadmin']).default('viewer'),
  permissions: z.array(z.string()).optional(),
  queueAccess: z.record(z.array(z.string())).optional(),
})

export const QueueUserUpdateSchema = QueueUserSchema.partial().omit({ userId: true })

// Automation Policy Schemas
export const PolicyConditionSchema = z.object({
  type: z.enum(['metric_threshold', 'job_state', 'queue_state', 'time_based']),
  config: z.record(z.any()),
})

export const PolicyActionSchema = z.object({
  type: z.enum(['retry_jobs', 'pause_queue', 'scale_workers', 'send_alert', 'execute_script']),
  config: z.record(z.any()),
})

export const AutomationPolicySchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
  queueName: z.string().optional(),
  triggerCondition: PolicyConditionSchema,
  actions: z.array(PolicyActionSchema).min(1),
  enabled: z.boolean().default(true),
  priority: z.number().int().min(0).default(0),
})

export const AutomationPolicyUpdateSchema = AutomationPolicySchema.partial()

// Webhook Schemas
export const WebhookRetryPolicySchema = z.object({
  attempts: z.number().int().min(1).max(10).default(3),
  backoff: z.enum(['fixed', 'exponential']).default('exponential'),
  delay: z.number().int().min(1000).default(1000), // milliseconds
})

export const WebhookConfigSchema = z.object({
  name: z.string().min(1).max(255),
  url: z.string().url().max(1000),
  events: z.array(z.enum([
    'queue.health.changed',
    'job.completed',
    'job.failed',
    'alert.triggered',
    'flow.completed',
    'flow.failed'
  ])).min(1),
  headers: z.record(z.string()).optional(),
  secret: z.string().max(255).optional(),
  enabled: z.boolean().default(true),
  retryPolicy: WebhookRetryPolicySchema.optional(),
})

export const WebhookConfigUpdateSchema = WebhookConfigSchema.partial()

// System Configuration Schemas
export const SystemConfigSchema = z.object({
  key: z.string().min(1).max(255),
  value: z.any(),
  description: z.string().max(1000).optional(),
  category: z.string().max(100).optional(),
})

export const SystemConfigUpdateSchema = SystemConfigSchema.partial().omit({ key: true })

// Filter Schemas
export const JobFiltersSchema = z.object({
  states: z.array(z.enum(['waiting', 'active', 'completed', 'failed', 'delayed', 'paused', 'stuck'])).optional(),
  dateRange: TimeRangeSchema.optional(),
  search: z.string().max(255).optional(),
  correlationId: z.string().max(255).optional(),
  flowId: z.string().max(255).optional(),
})

export const QueueFiltersSchema = z.object({
  states: z.array(z.enum(['healthy', 'warning', 'critical', 'paused', 'stopped'])).optional(),
  search: z.string().max(255).optional(),
  priority: z.array(z.number().int().min(0).max(100)).optional(),
})

export const AlertFiltersSchema = z.object({
  severities: z.array(z.enum(['info', 'warning', 'error', 'critical'])).optional(),
  statuses: z.array(z.enum(['active', 'acknowledged', 'resolved'])).optional(),
  dateRange: TimeRangeSchema.optional(),
  queueName: z.string().max(255).optional(),
})

export const MetricFiltersSchema = z.object({
  queueNames: z.array(z.string()).optional(),
  metrics: z.array(z.string()).optional(),
  timeRange: TimeRangeSchema,
  granularity: z.enum(['1m', '5m', '1h', '1d', '1w', '1M']).optional(),
})

// Export Data Schemas
export const ExportRequestSchema = z.object({
  format: z.enum(['csv', 'json']),
  filters: z.union([
    JobFiltersSchema,
    QueueFiltersSchema,
    AlertFiltersSchema,
    MetricFiltersSchema,
  ]),
  fields: z.array(z.string()).optional(),
})

// API Response Schemas
export const ApiErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.any().optional(),
  requestId: z.string().optional(),
  timestamp: z.date(),
})

export const ApiResponseSchema = z.object({
  success: z.boolean(),
  data: z.any().optional(),
  error: ApiErrorSchema.optional(),
  pagination: z.object({
    page: z.number().int(),
    limit: z.number().int(),
    total: z.number().int(),
    totalPages: z.number().int(),
    hasNext: z.boolean(),
    hasPrev: z.boolean(),
  }).optional(),
})

// Validation helper functions
export function validatePagination(data: unknown) {
  return PaginationSchema.parse(data)
}

export function validateTimeRange(data: unknown) {
  return TimeRangeSchema.parse(data)
}

export function validateQueueConfig(data: unknown) {
  return QueueConfigSchema.parse(data)
}

export function validateJobAction(data: unknown) {
  return JobActionSchema.parse(data)
}

export function validateAlertRule(data: unknown) {
  return AlertRuleSchema.parse(data)
}

export function validateWebhookConfig(data: unknown) {
  return WebhookConfigSchema.parse(data)
}

export function validateAutomationPolicy(data: unknown) {
  return AutomationPolicySchema.parse(data)
}

// Type inference helpers
export type PaginationInput = z.infer<typeof PaginationSchema>
export type TimeRangeInput = z.infer<typeof TimeRangeSchema>
export type QueueConfigInput = z.infer<typeof QueueConfigSchema>
export type QueueConfigUpdateInput = z.infer<typeof QueueConfigUpdateSchema>
export type JobActionInput = z.infer<typeof JobActionSchema>
export type BatchActionInput = z.infer<typeof BatchActionSchema>
export type AlertRuleInput = z.infer<typeof AlertRuleSchema>
export type AlertRuleUpdateInput = z.infer<typeof AlertRuleUpdateSchema>
export type WebhookConfigInput = z.infer<typeof WebhookConfigSchema>
export type WebhookConfigUpdateInput = z.infer<typeof WebhookConfigUpdateSchema>
export type AutomationPolicyInput = z.infer<typeof AutomationPolicySchema>
export type AutomationPolicyUpdateInput = z.infer<typeof AutomationPolicyUpdateSchema>
export type JobFiltersInput = z.infer<typeof JobFiltersSchema>
export type QueueFiltersInput = z.infer<typeof QueueFiltersSchema>
export type AlertFiltersInput = z.infer<typeof AlertFiltersSchema>
export type MetricFiltersInput = z.infer<typeof MetricFiltersSchema>
export type ExportRequestInput = z.infer<typeof ExportRequestSchema>