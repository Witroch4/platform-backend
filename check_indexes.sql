-- Check existing indexes for queue management tables
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
ORDER BY tablename, indexname;