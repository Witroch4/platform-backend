/**
 * Queue Management System Constants
 * 
 * Central constants and enums for the BullMQ queue management system
 */

// Job States
export const JOB_STATES = {
  WAITING: 'waiting',
  ACTIVE: 'active',
  COMPLETED: 'completed',
  FAILED: 'failed',
  DELAYED: 'delayed',
  PAUSED: 'paused',
  STUCK: 'stuck',
} as const

export type JobState = typeof JOB_STATES[keyof typeof JOB_STATES]

// Queue States
export const QUEUE_STATES = {
  HEALTHY: 'healthy',
  WARNING: 'warning',
  CRITICAL: 'critical',
  PAUSED: 'paused',
  STOPPED: 'stopped',
} as const

export type QueueState = typeof QUEUE_STATES[keyof typeof QUEUE_STATES]

// Alert Severities
export const ALERT_SEVERITIES = {
  INFO: 'info',
  WARNING: 'warning',
  ERROR: 'error',
  CRITICAL: 'critical',
} as const

export type AlertSeverity = typeof ALERT_SEVERITIES[keyof typeof ALERT_SEVERITIES]

// Alert Statuses
export const ALERT_STATUSES = {
  ACTIVE: 'active',
  ACKNOWLEDGED: 'acknowledged',
  RESOLVED: 'resolved',
} as const

export type AlertStatus = typeof ALERT_STATUSES[keyof typeof ALERT_STATUSES]

// User Roles
export const USER_ROLES = {
  VIEWER: 'viewer',
  OPERATOR: 'operator',
  ADMIN: 'admin',
  SUPERADMIN: 'superadmin',
} as const

export type UserRole = typeof USER_ROLES[keyof typeof USER_ROLES]

// Permissions
export const PERMISSIONS = {
  // Queue Operations
  QUEUE_VIEW: 'queue:view',
  QUEUE_MANAGE: 'queue:manage',
  QUEUE_DELETE: 'queue:delete',
  QUEUE_CREATE: 'queue:create',
  QUEUE_PAUSE: 'queue:pause',
  QUEUE_RESUME: 'queue:resume',
  
  // Job Operations
  JOB_VIEW: 'job:view',
  JOB_RETRY: 'job:retry',
  JOB_DELETE: 'job:delete',
  JOB_PROMOTE: 'job:promote',
  JOB_DELAY: 'job:delay',
  JOB_BATCH_OPERATIONS: 'job:batch',
  
  // Flow Operations
  FLOW_VIEW: 'flow:view',
  FLOW_MANAGE: 'flow:manage',
  FLOW_CANCEL: 'flow:cancel',
  FLOW_RETRY: 'flow:retry',
  
  // Metrics and Analytics
  METRICS_VIEW: 'metrics:view',
  METRICS_EXPORT: 'metrics:export',
  ANALYTICS_VIEW: 'analytics:view',
  ANALYTICS_ADVANCED: 'analytics:advanced',
  
  // Alerts
  ALERT_VIEW: 'alert:view',
  ALERT_MANAGE: 'alert:manage',
  ALERT_ACKNOWLEDGE: 'alert:acknowledge',
  ALERT_RESOLVE: 'alert:resolve',
  
  // System Operations
  SYSTEM_CONFIG: 'system:config',
  SYSTEM_HEALTH: 'system:health',
  SYSTEM_MAINTENANCE: 'system:maintenance',
  
  // User Management
  USER_VIEW: 'user:view',
  USER_MANAGE: 'user:manage',
  USER_DELETE: 'user:delete',
  USER_PERMISSIONS: 'user:permissions',
  
  // Audit and Logging
  AUDIT_VIEW: 'audit:view',
  AUDIT_EXPORT: 'audit:export',
  
  // Automation
  POLICY_VIEW: 'policy:view',
  POLICY_MANAGE: 'policy:manage',
  POLICY_EXECUTE: 'policy:execute',
  
  // Webhooks
  WEBHOOK_VIEW: 'webhook:view',
  WEBHOOK_MANAGE: 'webhook:manage',
  WEBHOOK_TEST: 'webhook:test',
} as const

export type Permission = typeof PERMISSIONS[keyof typeof PERMISSIONS]

// Role Permissions Mapping
const VIEWER_PERMISSIONS = [
  PERMISSIONS.QUEUE_VIEW,
  PERMISSIONS.JOB_VIEW,
  PERMISSIONS.FLOW_VIEW,
  PERMISSIONS.METRICS_VIEW,
  PERMISSIONS.ALERT_VIEW,
  PERMISSIONS.SYSTEM_HEALTH,
  PERMISSIONS.AUDIT_VIEW,
]

const OPERATOR_PERMISSIONS = [
  ...VIEWER_PERMISSIONS,
  PERMISSIONS.JOB_RETRY,
  PERMISSIONS.JOB_DELETE,
  PERMISSIONS.JOB_PROMOTE,
  PERMISSIONS.JOB_DELAY,
  PERMISSIONS.JOB_BATCH_OPERATIONS,
  PERMISSIONS.QUEUE_PAUSE,
  PERMISSIONS.QUEUE_RESUME,
  PERMISSIONS.FLOW_MANAGE,
  PERMISSIONS.ALERT_ACKNOWLEDGE,
  PERMISSIONS.METRICS_EXPORT,
]

const ADMIN_PERMISSIONS = [
  ...OPERATOR_PERMISSIONS,
  PERMISSIONS.QUEUE_MANAGE,
  PERMISSIONS.QUEUE_CREATE,
  PERMISSIONS.QUEUE_DELETE,
  PERMISSIONS.FLOW_CANCEL,
  PERMISSIONS.FLOW_RETRY,
  PERMISSIONS.ANALYTICS_VIEW,
  PERMISSIONS.ANALYTICS_ADVANCED,
  PERMISSIONS.ALERT_MANAGE,
  PERMISSIONS.ALERT_RESOLVE,
  PERMISSIONS.SYSTEM_CONFIG,
  PERMISSIONS.USER_VIEW,
  PERMISSIONS.USER_MANAGE,
  PERMISSIONS.AUDIT_EXPORT,
  PERMISSIONS.POLICY_VIEW,
  PERMISSIONS.POLICY_MANAGE,
  PERMISSIONS.WEBHOOK_VIEW,
  PERMISSIONS.WEBHOOK_MANAGE,
  PERMISSIONS.WEBHOOK_TEST,
]

const SUPERADMIN_PERMISSIONS = [
  ...ADMIN_PERMISSIONS,
  PERMISSIONS.SYSTEM_MAINTENANCE,
  PERMISSIONS.USER_DELETE,
  PERMISSIONS.USER_PERMISSIONS,
  PERMISSIONS.POLICY_EXECUTE,
]

export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  [USER_ROLES.VIEWER]: VIEWER_PERMISSIONS,
  [USER_ROLES.OPERATOR]: OPERATOR_PERMISSIONS,
  [USER_ROLES.ADMIN]: ADMIN_PERMISSIONS,
  [USER_ROLES.SUPERADMIN]: SUPERADMIN_PERMISSIONS,
}

// Metric Types
export const METRIC_TYPES = {
  COUNTER: 'counter',
  GAUGE: 'gauge',
  HISTOGRAM: 'histogram',
  SUMMARY: 'summary',
} as const

export type MetricType = typeof METRIC_TYPES[keyof typeof METRIC_TYPES]

// Time Granularities
export const TIME_GRANULARITIES = {
  MINUTE: '1m',
  FIVE_MINUTES: '5m',
  HOUR: '1h',
  DAY: '1d',
  WEEK: '1w',
  MONTH: '1M',
} as const

export type TimeGranularity = typeof TIME_GRANULARITIES[keyof typeof TIME_GRANULARITIES]

// Event Types
export const EVENT_TYPES = {
  // Queue Events
  QUEUE_CREATED: 'queue.created',
  QUEUE_UPDATED: 'queue.updated',
  QUEUE_DELETED: 'queue.deleted',
  QUEUE_PAUSED: 'queue.paused',
  QUEUE_RESUMED: 'queue.resumed',
  
  // Job Events
  JOB_CREATED: 'job.created',
  JOB_STARTED: 'job.started',
  JOB_COMPLETED: 'job.completed',
  JOB_FAILED: 'job.failed',
  JOB_RETRIED: 'job.retried',
  JOB_REMOVED: 'job.removed',
  JOB_PROMOTED: 'job.promoted',
  JOB_DELAYED: 'job.delayed',
  
  // Flow Events
  FLOW_STARTED: 'flow.started',
  FLOW_COMPLETED: 'flow.completed',
  FLOW_FAILED: 'flow.failed',
  FLOW_CANCELLED: 'flow.cancelled',
  
  // Alert Events
  ALERT_TRIGGERED: 'alert.triggered',
  ALERT_ACKNOWLEDGED: 'alert.acknowledged',
  ALERT_RESOLVED: 'alert.resolved',
  ALERT_ESCALATED: 'alert.escalated',
  
  // System Events
  SYSTEM_STARTED: 'system.started',
  SYSTEM_STOPPED: 'system.stopped',
  SYSTEM_ERROR: 'system.error',
  
  // User Events
  USER_LOGIN: 'user.login',
  USER_LOGOUT: 'user.logout',
  USER_ACTION: 'user.action',
  
  // Batch Operation Events
  BATCH_OPERATION_STARTED: 'batch.operation.started',
  BATCH_OPERATION_PROGRESS: 'batch.operation.progress',
  BATCH_OPERATION_COMPLETED: 'batch.operation.completed',
  BATCH_OPERATION_FAILED: 'batch.operation.failed',
  BATCH_OPERATION_CANCELLED: 'batch.operation.cancelled',
  
  // Flow Control Events
  FLOW_CONTROL_CONFIGURED: 'flow.control.configured',
  FLOW_CONTROL_REMOVED: 'flow.control.removed',
  RATE_LIMIT_EXCEEDED: 'flow.control.rate.limit.exceeded',
  CIRCUIT_BREAKER_OPENED: 'flow.control.circuit.breaker.opened',
  CIRCUIT_BREAKER_STATE_CHANGED: 'flow.control.circuit.breaker.state.changed',
  CONCURRENCY_ADJUSTMENT_RECOMMENDED: 'flow.control.concurrency.adjustment.recommended',
  CONCURRENCY_UPDATED: 'flow.control.concurrency.updated',
} as const

export type EventType = typeof EVENT_TYPES[keyof typeof EVENT_TYPES]

// Cache Keys
export const CACHE_KEYS = {
  QUEUE_HEALTH: (queueName: string) => `queue:health:${queueName}`,
  QUEUE_CONFIG: (queueName: string) => `queue:config:${queueName}`,
  QUEUE_METRICS: (queueName: string, timestamp: number) => `queue:metrics:${queueName}:${timestamp}`,
  USER_SESSION: (userId: string) => `user:session:${userId}`,
  USER_PERMISSIONS: (userId: string) => `user:permissions:${userId}`,
  ACTIVE_ALERTS: () => 'alerts:active',
  ALERT_COOLDOWN: (ruleId: string) => `alert:cooldown:${ruleId}`,
  SYSTEM_HEALTH: () => 'system:health',
  FLOW_TREE: (flowId: string) => `flow:tree:${flowId}`,
  RATE_LIMIT: (key: string, window: number) => `rate_limit:${key}:${window}`,
} as const

// Default Values
export const DEFAULTS = {
  // Pagination
  PAGE_SIZE: 50,
  MAX_PAGE_SIZE: 1000,
  
  // Timeouts
  JOB_TIMEOUT: 30000, // 30 seconds
  QUEUE_TIMEOUT: 60000, // 1 minute
  API_TIMEOUT: 10000, // 10 seconds
  
  // Concurrency
  CONCURRENCY: 5, // Default concurrency
  
  // Retry Policies
  MAX_RETRIES: 3,
  RETRY_DELAY: 1000, // 1 second
  BACKOFF_MULTIPLIER: 2,
  
  // Cache TTL (in seconds)
  CACHE_TTL: {
    QUEUE_HEALTH: 30,
    QUEUE_CONFIG: 3600, // 1 hour
    USER_SESSION: 1800, // 30 minutes
    METRICS: 300, // 5 minutes
    ALERTS: 60, // 1 minute
  },
  
  // Alert Thresholds
  ALERT_THRESHOLDS: {
    QUEUE_SIZE_WARNING: 100,
    QUEUE_SIZE_CRITICAL: 1000,
    PROCESSING_TIME_WARNING: 30000, // 30 seconds
    PROCESSING_TIME_CRITICAL: 120000, // 2 minutes
    ERROR_RATE_WARNING: 0.05, // 5%
    ERROR_RATE_CRITICAL: 0.15, // 15%
    MEMORY_USAGE_WARNING: 0.8, // 80%
    MEMORY_USAGE_CRITICAL: 0.95, // 95%
  },
  
  // Batch Operation Limits
  BATCH_LIMITS: {
    MAX_JOBS_PER_BATCH: 1000,
    MAX_CONCURRENT_BATCHES: 5,
    BATCH_TIMEOUT: 300000, // 5 minutes
  },
} as const

// Error Codes
export const ERROR_CODES = {
  // General Errors
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  
  // Queue Errors
  QUEUE_NOT_FOUND: 'QUEUE_NOT_FOUND',
  QUEUE_ALREADY_EXISTS: 'QUEUE_ALREADY_EXISTS',
  QUEUE_PAUSED: 'QUEUE_PAUSED',
  QUEUE_STOPPED: 'QUEUE_STOPPED',
  
  // Job Errors
  JOB_NOT_FOUND: 'JOB_NOT_FOUND',
  JOB_ALREADY_PROCESSED: 'JOB_ALREADY_PROCESSED',
  JOB_INVALID_STATE: 'JOB_INVALID_STATE',
  JOB_TIMEOUT: 'JOB_TIMEOUT',
  
  // Flow Errors
  FLOW_NOT_FOUND: 'FLOW_NOT_FOUND',
  FLOW_INVALID_STATE: 'FLOW_INVALID_STATE',
  CIRCULAR_DEPENDENCY: 'CIRCULAR_DEPENDENCY',
  
  // Alert Errors
  ALERT_RULE_NOT_FOUND: 'ALERT_RULE_NOT_FOUND',
  ALERT_NOT_FOUND: 'ALERT_NOT_FOUND',
  ALERT_ALREADY_ACKNOWLEDGED: 'ALERT_ALREADY_ACKNOWLEDGED',
  
  // System Errors
  REDIS_CONNECTION_ERROR: 'REDIS_CONNECTION_ERROR',
  DATABASE_CONNECTION_ERROR: 'DATABASE_CONNECTION_ERROR',
  CONFIGURATION_ERROR: 'CONFIGURATION_ERROR',
  
  // User Errors
  USER_NOT_FOUND: 'USER_NOT_FOUND',
  INSUFFICIENT_PERMISSIONS: 'INSUFFICIENT_PERMISSIONS',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
} as const

export type ErrorCode = typeof ERROR_CODES[keyof typeof ERROR_CODES]

// HTTP Status Codes
export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
} as const

// Webhook Event Types
export const WEBHOOK_EVENTS = {
  QUEUE_HEALTH_CHANGED: 'queue.health.changed',
  JOB_COMPLETED: 'job.completed',
  JOB_FAILED: 'job.failed',
  ALERT_TRIGGERED: 'alert.triggered',
  FLOW_COMPLETED: 'flow.completed',
  FLOW_FAILED: 'flow.failed',
} as const

export type WebhookEvent = typeof WEBHOOK_EVENTS[keyof typeof WEBHOOK_EVENTS]

// Export all constants as a single object for convenience
export const QUEUE_MANAGEMENT_CONSTANTS = {
  JOB_STATES,
  QUEUE_STATES,
  ALERT_SEVERITIES,
  ALERT_STATUSES,
  USER_ROLES,
  PERMISSIONS,
  ROLE_PERMISSIONS,
  METRIC_TYPES,
  TIME_GRANULARITIES,
  EVENT_TYPES,
  CACHE_KEYS,
  DEFAULTS,
  ERROR_CODES,
  HTTP_STATUS,
  WEBHOOK_EVENTS,
} as const