"use strict";
/**
 * Queue Management System Constants
 *
 * Central constants and enums for the BullMQ queue management system
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.QUEUE_MANAGEMENT_CONSTANTS = exports.WEBHOOK_EVENTS = exports.HTTP_STATUS = exports.ERROR_CODES = exports.DEFAULTS = exports.CACHE_KEYS = exports.EVENT_TYPES = exports.TIME_GRANULARITIES = exports.METRIC_TYPES = exports.ROLE_PERMISSIONS = exports.PERMISSIONS = exports.USER_ROLES = exports.ALERT_STATUSES = exports.ALERT_SEVERITIES = exports.QUEUE_STATES = exports.JOB_STATES = void 0;
// Job States
exports.JOB_STATES = {
    WAITING: 'waiting',
    ACTIVE: 'active',
    COMPLETED: 'completed',
    FAILED: 'failed',
    DELAYED: 'delayed',
    PAUSED: 'paused',
    STUCK: 'stuck',
};
// Queue States
exports.QUEUE_STATES = {
    HEALTHY: 'healthy',
    WARNING: 'warning',
    CRITICAL: 'critical',
    PAUSED: 'paused',
    STOPPED: 'stopped',
};
// Alert Severities
exports.ALERT_SEVERITIES = {
    INFO: 'info',
    WARNING: 'warning',
    ERROR: 'error',
    CRITICAL: 'critical',
};
// Alert Statuses
exports.ALERT_STATUSES = {
    ACTIVE: 'active',
    ACKNOWLEDGED: 'acknowledged',
    RESOLVED: 'resolved',
};
// User Roles
exports.USER_ROLES = {
    VIEWER: 'viewer',
    OPERATOR: 'operator',
    ADMIN: 'admin',
    SUPERADMIN: 'superadmin',
};
// Permissions
exports.PERMISSIONS = {
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
};
// Role Permissions Mapping
const VIEWER_PERMISSIONS = [
    exports.PERMISSIONS.QUEUE_VIEW,
    exports.PERMISSIONS.JOB_VIEW,
    exports.PERMISSIONS.FLOW_VIEW,
    exports.PERMISSIONS.METRICS_VIEW,
    exports.PERMISSIONS.ALERT_VIEW,
    exports.PERMISSIONS.SYSTEM_HEALTH,
    exports.PERMISSIONS.AUDIT_VIEW,
];
const OPERATOR_PERMISSIONS = [
    ...VIEWER_PERMISSIONS,
    exports.PERMISSIONS.JOB_RETRY,
    exports.PERMISSIONS.JOB_DELETE,
    exports.PERMISSIONS.JOB_PROMOTE,
    exports.PERMISSIONS.JOB_DELAY,
    exports.PERMISSIONS.JOB_BATCH_OPERATIONS,
    exports.PERMISSIONS.QUEUE_PAUSE,
    exports.PERMISSIONS.QUEUE_RESUME,
    exports.PERMISSIONS.FLOW_MANAGE,
    exports.PERMISSIONS.ALERT_ACKNOWLEDGE,
    exports.PERMISSIONS.METRICS_EXPORT,
];
const ADMIN_PERMISSIONS = [
    ...OPERATOR_PERMISSIONS,
    exports.PERMISSIONS.QUEUE_MANAGE,
    exports.PERMISSIONS.QUEUE_CREATE,
    exports.PERMISSIONS.QUEUE_DELETE,
    exports.PERMISSIONS.FLOW_CANCEL,
    exports.PERMISSIONS.FLOW_RETRY,
    exports.PERMISSIONS.ANALYTICS_VIEW,
    exports.PERMISSIONS.ANALYTICS_ADVANCED,
    exports.PERMISSIONS.ALERT_MANAGE,
    exports.PERMISSIONS.ALERT_RESOLVE,
    exports.PERMISSIONS.SYSTEM_CONFIG,
    exports.PERMISSIONS.USER_VIEW,
    exports.PERMISSIONS.USER_MANAGE,
    exports.PERMISSIONS.AUDIT_EXPORT,
    exports.PERMISSIONS.POLICY_VIEW,
    exports.PERMISSIONS.POLICY_MANAGE,
    exports.PERMISSIONS.WEBHOOK_VIEW,
    exports.PERMISSIONS.WEBHOOK_MANAGE,
    exports.PERMISSIONS.WEBHOOK_TEST,
];
const SUPERADMIN_PERMISSIONS = [
    ...ADMIN_PERMISSIONS,
    exports.PERMISSIONS.SYSTEM_MAINTENANCE,
    exports.PERMISSIONS.USER_DELETE,
    exports.PERMISSIONS.USER_PERMISSIONS,
    exports.PERMISSIONS.POLICY_EXECUTE,
];
exports.ROLE_PERMISSIONS = {
    [exports.USER_ROLES.VIEWER]: VIEWER_PERMISSIONS,
    [exports.USER_ROLES.OPERATOR]: OPERATOR_PERMISSIONS,
    [exports.USER_ROLES.ADMIN]: ADMIN_PERMISSIONS,
    [exports.USER_ROLES.SUPERADMIN]: SUPERADMIN_PERMISSIONS,
};
// Metric Types
exports.METRIC_TYPES = {
    COUNTER: 'counter',
    GAUGE: 'gauge',
    HISTOGRAM: 'histogram',
    SUMMARY: 'summary',
};
// Time Granularities
exports.TIME_GRANULARITIES = {
    MINUTE: '1m',
    FIVE_MINUTES: '5m',
    HOUR: '1h',
    DAY: '1d',
    WEEK: '1w',
    MONTH: '1M',
};
// Event Types
exports.EVENT_TYPES = {
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
};
// Cache Keys
exports.CACHE_KEYS = {
    QUEUE_HEALTH: (queueName) => `queue:health:${queueName}`,
    QUEUE_CONFIG: (queueName) => `queue:config:${queueName}`,
    QUEUE_METRICS: (queueName, timestamp) => `queue:metrics:${queueName}:${timestamp}`,
    USER_SESSION: (userId) => `user:session:${userId}`,
    USER_PERMISSIONS: (userId) => `user:permissions:${userId}`,
    ACTIVE_ALERTS: () => 'alerts:active',
    ALERT_COOLDOWN: (ruleId) => `alert:cooldown:${ruleId}`,
    SYSTEM_HEALTH: () => 'system:health',
    FLOW_TREE: (flowId) => `flow:tree:${flowId}`,
    RATE_LIMIT: (key, window) => `rate_limit:${key}:${window}`,
};
// Default Values
exports.DEFAULTS = {
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
};
// Error Codes
exports.ERROR_CODES = {
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
};
// HTTP Status Codes
exports.HTTP_STATUS = {
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
};
// Webhook Event Types
exports.WEBHOOK_EVENTS = {
    QUEUE_HEALTH_CHANGED: 'queue.health.changed',
    JOB_COMPLETED: 'job.completed',
    JOB_FAILED: 'job.failed',
    ALERT_TRIGGERED: 'alert.triggered',
    FLOW_COMPLETED: 'flow.completed',
    FLOW_FAILED: 'flow.failed',
};
// Export all constants as a single object for convenience
exports.QUEUE_MANAGEMENT_CONSTANTS = {
    JOB_STATES: exports.JOB_STATES,
    QUEUE_STATES: exports.QUEUE_STATES,
    ALERT_SEVERITIES: exports.ALERT_SEVERITIES,
    ALERT_STATUSES: exports.ALERT_STATUSES,
    USER_ROLES: exports.USER_ROLES,
    PERMISSIONS: exports.PERMISSIONS,
    ROLE_PERMISSIONS: exports.ROLE_PERMISSIONS,
    METRIC_TYPES: exports.METRIC_TYPES,
    TIME_GRANULARITIES: exports.TIME_GRANULARITIES,
    EVENT_TYPES: exports.EVENT_TYPES,
    CACHE_KEYS: exports.CACHE_KEYS,
    DEFAULTS: exports.DEFAULTS,
    ERROR_CODES: exports.ERROR_CODES,
    HTTP_STATUS: exports.HTTP_STATUS,
    WEBHOOK_EVENTS: exports.WEBHOOK_EVENTS,
};
