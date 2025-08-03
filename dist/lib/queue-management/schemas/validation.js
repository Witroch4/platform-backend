"use strict";
/**
 * Queue Management Validation Schemas
 *
 * Zod schemas for validating input data in the queue management system
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApiResponseSchema = exports.ApiErrorSchema = exports.ExportRequestSchema = exports.MetricFiltersSchema = exports.AlertFiltersSchema = exports.QueueFiltersSchema = exports.JobFiltersSchema = exports.SystemConfigUpdateSchema = exports.SystemConfigSchema = exports.WebhookConfigUpdateSchema = exports.WebhookConfigSchema = exports.WebhookRetryPolicySchema = exports.AutomationPolicyUpdateSchema = exports.AutomationPolicySchema = exports.PolicyActionSchema = exports.PolicyConditionSchema = exports.QueueUserUpdateSchema = exports.QueueUserSchema = exports.JobDependencySchema = exports.FlowCreateSchema = exports.AlertResolveSchema = exports.AlertAcknowledgeSchema = exports.AlertRuleUpdateSchema = exports.AlertRuleSchema = exports.NotificationChannelSchema = exports.AlertConditionSchema = exports.BatchActionSchema = exports.JobActionSchema = exports.QueueConfigUpdateSchema = exports.QueueConfigSchema = exports.AlertThresholdsSchema = exports.CleanupPolicySchema = exports.RetryPolicySchema = exports.RateLimiterConfigSchema = exports.SortOptionsSchema = exports.TimeRangeSchema = exports.PaginationSchema = void 0;
exports.validatePagination = validatePagination;
exports.validateTimeRange = validateTimeRange;
exports.validateQueueConfig = validateQueueConfig;
exports.validateJobAction = validateJobAction;
exports.validateAlertRule = validateAlertRule;
exports.validateWebhookConfig = validateWebhookConfig;
exports.validateAutomationPolicy = validateAutomationPolicy;
const zod_1 = require("zod");
// Base validation schemas
exports.PaginationSchema = zod_1.z.object({
    page: zod_1.z.number().int().min(1).default(1),
    limit: zod_1.z.number().int().min(1).max(1000).default(50),
});
exports.TimeRangeSchema = zod_1.z.object({
    start: zod_1.z.date(),
    end: zod_1.z.date(),
    granularity: zod_1.z.enum(['1m', '5m', '1h', '1d', '1w', '1M']).optional(),
});
exports.SortOptionsSchema = zod_1.z.object({
    field: zod_1.z.string(),
    direction: zod_1.z.enum(['asc', 'desc']).default('desc'),
});
// Queue Configuration Schemas
exports.RateLimiterConfigSchema = zod_1.z.object({
    max: zod_1.z.number().int().min(1),
    duration: zod_1.z.number().int().min(1000), // milliseconds
    bounceBack: zod_1.z.boolean().optional(),
});
exports.RetryPolicySchema = zod_1.z.object({
    attempts: zod_1.z.number().int().min(1).max(10),
    backoff: zod_1.z.enum(['fixed', 'exponential']),
    delay: zod_1.z.number().int().min(0),
});
exports.CleanupPolicySchema = zod_1.z.object({
    removeOnComplete: zod_1.z.number().int().min(0).max(10000),
    removeOnFail: zod_1.z.number().int().min(0).max(10000),
    maxAge: zod_1.z.number().int().min(0).optional(), // seconds
});
exports.AlertThresholdsSchema = zod_1.z.object({
    queueSize: zod_1.z.object({
        warning: zod_1.z.number().int().min(0),
        critical: zod_1.z.number().int().min(0),
    }).optional(),
    processingTime: zod_1.z.object({
        warning: zod_1.z.number().int().min(0), // milliseconds
        critical: zod_1.z.number().int().min(0),
    }).optional(),
    errorRate: zod_1.z.object({
        warning: zod_1.z.number().min(0).max(1), // percentage as decimal
        critical: zod_1.z.number().min(0).max(1),
    }).optional(),
    memoryUsage: zod_1.z.object({
        warning: zod_1.z.number().min(0).max(1), // percentage as decimal
        critical: zod_1.z.number().min(0).max(1),
    }).optional(),
});
exports.QueueConfigSchema = zod_1.z.object({
    name: zod_1.z.string().min(1).max(255).regex(/^[a-zA-Z0-9_-]+$/, 'Queue name must contain only alphanumeric characters, underscores, and hyphens'),
    displayName: zod_1.z.string().max(255).optional(),
    description: zod_1.z.string().max(1000).optional(),
    priority: zod_1.z.number().int().min(0).max(100).default(0),
    concurrency: zod_1.z.number().int().min(1).max(1000).default(1),
    rateLimiter: exports.RateLimiterConfigSchema.optional(),
    retryPolicy: exports.RetryPolicySchema,
    cleanupPolicy: exports.CleanupPolicySchema,
    alertThresholds: exports.AlertThresholdsSchema,
});
exports.QueueConfigUpdateSchema = exports.QueueConfigSchema.partial().omit({ name: true });
// Job Action Schemas
exports.JobActionSchema = zod_1.z.object({
    action: zod_1.z.enum(['retry', 'remove', 'promote', 'delay']),
    jobIds: zod_1.z.array(zod_1.z.string()).min(1).max(1000),
    delay: zod_1.z.number().int().min(0).optional(),
});
exports.BatchActionSchema = zod_1.z.object({
    action: zod_1.z.enum(['retry_all_failed', 'clean_completed', 'pause_queue', 'resume_queue']),
    queueName: zod_1.z.string().min(1),
    options: zod_1.z.record(zod_1.z.any()).optional(),
});
// Alert Rule Schemas
exports.AlertConditionSchema = zod_1.z.object({
    metric: zod_1.z.string().min(1),
    operator: zod_1.z.enum(['>', '<', '==', '!=', 'contains']),
    threshold: zod_1.z.union([zod_1.z.number(), zod_1.z.string()]),
    timeWindow: zod_1.z.number().int().min(1), // minutes
    aggregation: zod_1.z.enum(['avg', 'sum', 'max', 'min', 'count']).optional(),
});
exports.NotificationChannelSchema = zod_1.z.object({
    type: zod_1.z.enum(['email', 'slack', 'webhook', 'sms']),
    config: zod_1.z.record(zod_1.z.any()),
});
exports.AlertRuleSchema = zod_1.z.object({
    name: zod_1.z.string().min(1).max(255),
    description: zod_1.z.string().max(1000).optional(),
    queueName: zod_1.z.string().optional(),
    condition: exports.AlertConditionSchema,
    severity: zod_1.z.enum(['info', 'warning', 'error', 'critical']),
    channels: zod_1.z.array(exports.NotificationChannelSchema).min(1),
    cooldown: zod_1.z.number().int().min(0).default(5), // minutes
    enabled: zod_1.z.boolean().default(true),
});
exports.AlertRuleUpdateSchema = exports.AlertRuleSchema.partial();
// Alert Management Schemas
exports.AlertAcknowledgeSchema = zod_1.z.object({
    alertId: zod_1.z.string(),
    note: zod_1.z.string().max(1000).optional(),
});
exports.AlertResolveSchema = zod_1.z.object({
    alertId: zod_1.z.string(),
    resolutionNote: zod_1.z.string().max(1000).optional(),
});
// Flow Schemas
exports.FlowCreateSchema = zod_1.z.object({
    flowId: zod_1.z.string().min(1).max(255),
    name: zod_1.z.string().max(255).optional(),
    description: zod_1.z.string().max(1000).optional(),
    rootJobId: zod_1.z.string().min(1),
    metadata: zod_1.z.record(zod_1.z.any()).optional(),
});
exports.JobDependencySchema = zod_1.z.object({
    jobId: zod_1.z.string().min(1),
    parentJobId: zod_1.z.string().optional(),
    dependencyType: zod_1.z.enum(['sequential', 'parallel', 'conditional']).default('sequential'),
    condition: zod_1.z.record(zod_1.z.any()).optional(),
});
// User Management Schemas
exports.QueueUserSchema = zod_1.z.object({
    userId: zod_1.z.string().min(1),
    email: zod_1.z.string().email(),
    name: zod_1.z.string().min(1).max(255),
    role: zod_1.z.enum(['viewer', 'operator', 'admin', 'superadmin']).default('viewer'),
    permissions: zod_1.z.array(zod_1.z.string()).optional(),
    queueAccess: zod_1.z.record(zod_1.z.array(zod_1.z.string())).optional(),
});
exports.QueueUserUpdateSchema = exports.QueueUserSchema.partial().omit({ userId: true });
// Automation Policy Schemas
exports.PolicyConditionSchema = zod_1.z.object({
    type: zod_1.z.enum(['metric_threshold', 'job_state', 'queue_state', 'time_based']),
    config: zod_1.z.record(zod_1.z.any()),
});
exports.PolicyActionSchema = zod_1.z.object({
    type: zod_1.z.enum(['retry_jobs', 'pause_queue', 'scale_workers', 'send_alert', 'execute_script']),
    config: zod_1.z.record(zod_1.z.any()),
});
exports.AutomationPolicySchema = zod_1.z.object({
    name: zod_1.z.string().min(1).max(255),
    description: zod_1.z.string().max(1000).optional(),
    queueName: zod_1.z.string().optional(),
    triggerCondition: exports.PolicyConditionSchema,
    actions: zod_1.z.array(exports.PolicyActionSchema).min(1),
    enabled: zod_1.z.boolean().default(true),
    priority: zod_1.z.number().int().min(0).default(0),
});
exports.AutomationPolicyUpdateSchema = exports.AutomationPolicySchema.partial();
// Webhook Schemas
exports.WebhookRetryPolicySchema = zod_1.z.object({
    attempts: zod_1.z.number().int().min(1).max(10).default(3),
    backoff: zod_1.z.enum(['fixed', 'exponential']).default('exponential'),
    delay: zod_1.z.number().int().min(1000).default(1000), // milliseconds
});
exports.WebhookConfigSchema = zod_1.z.object({
    name: zod_1.z.string().min(1).max(255),
    url: zod_1.z.string().url().max(1000),
    events: zod_1.z.array(zod_1.z.enum([
        'queue.health.changed',
        'job.completed',
        'job.failed',
        'alert.triggered',
        'flow.completed',
        'flow.failed'
    ])).min(1),
    headers: zod_1.z.record(zod_1.z.string()).optional(),
    secret: zod_1.z.string().max(255).optional(),
    enabled: zod_1.z.boolean().default(true),
    retryPolicy: exports.WebhookRetryPolicySchema.optional(),
});
exports.WebhookConfigUpdateSchema = exports.WebhookConfigSchema.partial();
// System Configuration Schemas
exports.SystemConfigSchema = zod_1.z.object({
    key: zod_1.z.string().min(1).max(255),
    value: zod_1.z.any(),
    description: zod_1.z.string().max(1000).optional(),
    category: zod_1.z.string().max(100).optional(),
});
exports.SystemConfigUpdateSchema = exports.SystemConfigSchema.partial().omit({ key: true });
// Filter Schemas
exports.JobFiltersSchema = zod_1.z.object({
    states: zod_1.z.array(zod_1.z.enum(['waiting', 'active', 'completed', 'failed', 'delayed', 'paused', 'stuck'])).optional(),
    dateRange: exports.TimeRangeSchema.optional(),
    search: zod_1.z.string().max(255).optional(),
    correlationId: zod_1.z.string().max(255).optional(),
    flowId: zod_1.z.string().max(255).optional(),
});
exports.QueueFiltersSchema = zod_1.z.object({
    states: zod_1.z.array(zod_1.z.enum(['healthy', 'warning', 'critical', 'paused', 'stopped'])).optional(),
    search: zod_1.z.string().max(255).optional(),
    priority: zod_1.z.array(zod_1.z.number().int().min(0).max(100)).optional(),
});
exports.AlertFiltersSchema = zod_1.z.object({
    severities: zod_1.z.array(zod_1.z.enum(['info', 'warning', 'error', 'critical'])).optional(),
    statuses: zod_1.z.array(zod_1.z.enum(['active', 'acknowledged', 'resolved'])).optional(),
    dateRange: exports.TimeRangeSchema.optional(),
    queueName: zod_1.z.string().max(255).optional(),
});
exports.MetricFiltersSchema = zod_1.z.object({
    queueNames: zod_1.z.array(zod_1.z.string()).optional(),
    metrics: zod_1.z.array(zod_1.z.string()).optional(),
    timeRange: exports.TimeRangeSchema,
    granularity: zod_1.z.enum(['1m', '5m', '1h', '1d', '1w', '1M']).optional(),
});
// Export Data Schemas
exports.ExportRequestSchema = zod_1.z.object({
    format: zod_1.z.enum(['csv', 'json']),
    filters: zod_1.z.union([
        exports.JobFiltersSchema,
        exports.QueueFiltersSchema,
        exports.AlertFiltersSchema,
        exports.MetricFiltersSchema,
    ]),
    fields: zod_1.z.array(zod_1.z.string()).optional(),
});
// API Response Schemas
exports.ApiErrorSchema = zod_1.z.object({
    code: zod_1.z.string(),
    message: zod_1.z.string(),
    details: zod_1.z.any().optional(),
    requestId: zod_1.z.string().optional(),
    timestamp: zod_1.z.date(),
});
exports.ApiResponseSchema = zod_1.z.object({
    success: zod_1.z.boolean(),
    data: zod_1.z.any().optional(),
    error: exports.ApiErrorSchema.optional(),
    pagination: zod_1.z.object({
        page: zod_1.z.number().int(),
        limit: zod_1.z.number().int(),
        total: zod_1.z.number().int(),
        totalPages: zod_1.z.number().int(),
        hasNext: zod_1.z.boolean(),
        hasPrev: zod_1.z.boolean(),
    }).optional(),
});
// Validation helper functions
function validatePagination(data) {
    return exports.PaginationSchema.parse(data);
}
function validateTimeRange(data) {
    return exports.TimeRangeSchema.parse(data);
}
function validateQueueConfig(data) {
    return exports.QueueConfigSchema.parse(data);
}
function validateJobAction(data) {
    return exports.JobActionSchema.parse(data);
}
function validateAlertRule(data) {
    return exports.AlertRuleSchema.parse(data);
}
function validateWebhookConfig(data) {
    return exports.WebhookConfigSchema.parse(data);
}
function validateAutomationPolicy(data) {
    return exports.AutomationPolicySchema.parse(data);
}
