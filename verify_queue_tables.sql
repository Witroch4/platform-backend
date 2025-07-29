-- Verify all queue management tables exist with correct structure

-- Check table existence and basic structure
SELECT 
    table_name,
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name IN (
    'QueueConfig', 'QueueMetrics', 'JobMetrics', 'AlertRule', 'Alert', 
    'JobFlow', 'JobDependency', 'SystemConfig', 'QueueUser', 'AuditLog',
    'AutomationPolicy', 'WebhookConfig', 'WebhookDelivery'
)
ORDER BY table_name, ordinal_position;

-- Check foreign key constraints
SELECT 
    tc.table_name, 
    kcu.column_name, 
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name 
FROM information_schema.table_constraints AS tc 
JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
    AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY' 
AND tc.table_name IN (
    'QueueConfig', 'QueueMetrics', 'JobMetrics', 'AlertRule', 'Alert', 
    'JobFlow', 'JobDependency', 'SystemConfig', 'QueueUser', 'AuditLog',
    'AutomationPolicy', 'WebhookConfig', 'WebhookDelivery'
)
ORDER BY tc.table_name;