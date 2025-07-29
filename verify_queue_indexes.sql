-- Verify and create missing indexes for queue management system

-- Check if additional indexes are needed for performance optimization

-- Index for AlertRule table (queue filtering and status)
CREATE INDEX IF NOT EXISTS "AlertRule_queueName_enabled_idx" ON "AlertRule"("queueName", "enabled");

-- Index for Alert table (rule and status filtering)
CREATE INDEX IF NOT EXISTS "Alert_ruleId_status_idx" ON "Alert"("ruleId", "status");

-- Index for Alert table (severity and creation time for dashboard)
CREATE INDEX IF NOT EXISTS "Alert_severity_createdAt_idx" ON "Alert"("severity", "createdAt" DESC);

-- Index for JobFlow table (status and creation time)
CREATE INDEX IF NOT EXISTS "JobFlow_status_createdAt_idx" ON "JobFlow"("status", "createdAt" DESC);

-- Index for JobDependency table (flow and job lookup)
CREATE INDEX IF NOT EXISTS "JobDependency_flowId_jobId_idx" ON "JobDependency"("flowId", "jobId");

-- Index for SystemConfig table (category filtering)
CREATE INDEX IF NOT EXISTS "SystemConfig_category_idx" ON "SystemConfig"("category");

-- Index for QueueUser table (role and email filtering)
CREATE INDEX IF NOT EXISTS "QueueUser_role_email_idx" ON "QueueUser"("role", "email");

-- Index for QueueConfig table (name and priority for sorting)
CREATE INDEX IF NOT EXISTS "QueueConfig_name_priority_idx" ON "QueueConfig"("name", "priority");

-- Index for AutomationPolicy table (queue filtering and status)
CREATE INDEX IF NOT EXISTS "AutomationPolicy_queueName_idx" ON "AutomationPolicy"("queueName");

-- Index for AutomationPolicy table (enabled and priority)
CREATE INDEX IF NOT EXISTS "AutomationPolicy_enabled_priority_idx" ON "AutomationPolicy"("enabled", "priority");

-- Index for WebhookConfig table (enabled status)
CREATE INDEX IF NOT EXISTS "WebhookConfig_enabled_idx" ON "WebhookConfig"("enabled");

-- Index for WebhookDelivery table (webhook and event type)
CREATE INDEX IF NOT EXISTS "WebhookDelivery_webhookId_eventType_idx" ON "WebhookDelivery"("webhookId", "eventType");

-- Index for WebhookDelivery table (creation time for cleanup)
CREATE INDEX IF NOT EXISTS "WebhookDelivery_createdAt_idx" ON "WebhookDelivery"("createdAt" DESC);

-- Verify all indexes were created
SELECT 
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes 
WHERE tablename IN (
    'QueueConfig', 'QueueMetrics', 'JobMetrics', 'AlertRule', 'Alert', 
    'JobFlow', 'JobDependency', 'SystemConfig', 'QueueUser', 'AuditLog',
    'AutomationPolicy', 'WebhookConfig', 'WebhookDelivery'
)
AND indexname LIKE '%_idx'
ORDER BY tablename, indexname;