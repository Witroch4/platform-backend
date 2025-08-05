# AI Integration Audit and Logging System

## Overview

This document describes the audit and logging system implemented for the AI integration feature. The system provides comprehensive tracking of LLM operations and intent classification with automatic data retention management.

## Models

### LlmAudit

Tracks all LLM operations including intent classification and dynamic generation.

**Fields:**
- `id`: Unique identifier
- `conversationId`: Links to conversation context
- `messageId`: Links to specific message
- `mode`: Operation type ('INTENT_CLASSIFY' | 'DYNAMIC_GENERATE')
- `inputText`: Input text (PII masked)
- `resultJson`: LLM response in JSON format
- `score`: Confidence score (0-1)
- `traceId`: Distributed tracing identifier
- `createdAt`: Creation timestamp
- `expiresAt`: Automatic expiry (90 days from creation)

**Indexes:**
- `conversationId, createdAt` - For conversation-based queries
- `mode, createdAt` - For operation type analysis
- `expiresAt` - For cleanup operations
- `traceId` - For distributed tracing (partial index)

### IntentHitLog

Tracks intent classification attempts and results.

**Fields:**
- `id`: Unique identifier
- `conversationId`: Links to conversation context
- `messageId`: Links to specific message
- `candidateName`: Intent candidate name
- `similarity`: Similarity score (0-1)
- `chosen`: Whether this intent was selected
- `traceId`: Distributed tracing identifier
- `createdAt`: Creation timestamp
- `expiresAt`: Automatic expiry (90 days from creation)

**Indexes:**
- `conversationId, createdAt` - For conversation-based queries
- `candidateName` - For intent performance analysis
- `candidateName, similarity` - For ranking queries
- `chosen, createdAt` - For successful matches (partial index)
- `expiresAt` - For cleanup operations

## Automatic Data Retention

### TTL Implementation

Both models use PostgreSQL's `dbgenerated("NOW() + INTERVAL '90 days'")` for automatic expiry calculation. This ensures:

- **Compliance**: Automatic data retention without manual intervention
- **Performance**: Prevents unbounded table growth
- **Privacy**: Automatic removal of potentially sensitive data

### Cleanup System

#### Automatic Cleanup Job

```typescript
import { cleanupExpiredLogs, schedulePeriodicCleanup } from './lib/ai-integration/jobs/cleanup-expired-logs';

// Schedule cleanup every 6 hours
schedulePeriodicCleanup(6);
```

#### Manual Cleanup

```bash
# Run manual cleanup
npx tsx scripts/setup-log-cleanup.ts manual

# Setup automatic cleanup
npx tsx scripts/setup-log-cleanup.ts
```

#### pg_cron Integration

If pg_cron is available, the system automatically configures:

```sql
SELECT cron.schedule(
  'ai-logs-cleanup',
  '0 */6 * * *',  -- Every 6 hours
  $$
  DELETE FROM "LlmAudit" WHERE "expiresAt" < NOW();
  DELETE FROM "IntentHitLog" WHERE "expiresAt" < NOW();
  $$
);
```

## Monitoring and Metrics

### Audit Metrics Collection

```typescript
import { collectAuditMetrics, generateMetricsReport } from './lib/ai-integration/utils/audit-metrics';

// Get comprehensive metrics
const metrics = await collectAuditMetrics();

// Generate formatted report
const report = await generateMetricsReport();
console.log(report);
```

### Available Metrics

**LLM Audit Metrics:**
- Total records and recent activity (24h, 7d)
- Records by operation mode
- Average confidence scores
- Top conversations by volume

**Intent Hit Metrics:**
- Total classification attempts
- Success rate and average similarity
- Top performing intents
- Recent activity trends

**Performance Metrics:**
- Estimated token usage and costs
- Response time analysis (when available)
- System health indicators

### Health Monitoring

```typescript
import { getAuditHealthMetrics } from './lib/ai-integration/utils/audit-metrics';

const health = await getAuditHealthMetrics();
console.log(`System healthy: ${health.isHealthy}`);
console.log(`Records expiring soon: ${health.expiringSoon.total}`);
```

## Usage Examples

### Recording LLM Operations

```typescript
// Record intent classification
await prisma.llmAudit.create({
  data: {
    conversationId: 'conv-123',
    messageId: 'msg-456',
    mode: 'INTENT_CLASSIFY',
    inputText: 'Hello, I need help',
    resultJson: { intent: 'greeting', confidence: 0.95 },
    score: 0.95,
    traceId: 'trace-789'
  }
});

// Record intent hit
await prisma.intentHitLog.create({
  data: {
    conversationId: 'conv-123',
    messageId: 'msg-456',
    candidateName: 'greeting',
    similarity: 0.95,
    chosen: true,
    traceId: 'trace-789'
  }
});
```

### Querying Audit Data

```typescript
// Get recent LLM operations for a conversation
const recentOps = await prisma.llmAudit.findMany({
  where: {
    conversationId: 'conv-123',
    createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
  },
  orderBy: { createdAt: 'desc' }
});

// Get intent performance for analysis
const intentPerformance = await prisma.intentHitLog.groupBy({
  by: ['candidateName'],
  _count: { id: true },
  _avg: { similarity: true },
  where: { chosen: true },
  orderBy: { _count: { id: 'desc' } }
});
```

## Performance Considerations

### Index Strategy

The system uses composite and partial indexes to optimize common query patterns:

- **Composite indexes** for multi-column queries (conversation + time)
- **Partial indexes** for filtered queries (chosen intents, recent data)
- **Expression indexes** for computed values when needed

### Query Optimization

- Use time-based filtering to leverage TTL cleanup
- Leverage partial indexes for boolean filters
- Use `LIMIT` clauses for large result sets
- Consider pagination for UI components

### Storage Management

- Automatic cleanup prevents unbounded growth
- Indexes are optimized for both writes and reads
- TTL fields use database-generated defaults for consistency

## Security and Privacy

### PII Handling

- Input text is masked for sensitive data (phone, email)
- Conversation IDs are hashed when logged
- Trace IDs allow correlation without exposing user data

### Data Retention

- 90-day automatic expiry for compliance
- Configurable cleanup intervals
- Manual cleanup capabilities for immediate needs

### Access Control

- Audit data access should be restricted to authorized personnel
- Consider role-based access for different metric levels
- Log access to audit data for security compliance

## Troubleshooting

### Common Issues

**High Storage Usage:**
- Check if cleanup job is running
- Verify TTL fields are set correctly
- Monitor cleanup metrics

**Missing Metrics:**
- Ensure audit logging is enabled
- Check database connectivity
- Verify index health

**Performance Issues:**
- Review query patterns and index usage
- Consider partitioning for very high volumes
- Monitor cleanup job performance

### Monitoring Queries

```sql
-- Check table sizes
SELECT 
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
FROM pg_tables 
WHERE tablename IN ('LlmAudit', 'IntentHitLog');

-- Check cleanup effectiveness
SELECT 
  COUNT(*) as total_records,
  COUNT(*) FILTER (WHERE "expiresAt" < NOW()) as expired_records,
  MIN("expiresAt") as earliest_expiry,
  MAX("expiresAt") as latest_expiry
FROM "LlmAudit";
```

## Configuration

### Environment Variables

```env
# Cleanup configuration
AI_LOGS_CLEANUP_ENABLED=true
AI_LOGS_CLEANUP_INTERVAL_HOURS=6

# Retention configuration  
AI_LOGS_RETENTION_DAYS=90

# Monitoring configuration
AI_METRICS_COLLECTION_ENABLED=true
```

### System Configuration

The system uses `SystemConfig` table for runtime configuration:

- `ai_logs_cleanup_enabled`: Enable/disable automatic cleanup
- `ai_logs_cleanup_interval_hours`: Cleanup frequency
- `ai_logs_retention_days`: Data retention period

## Testing

The system includes comprehensive unit tests covering:

- Cleanup operations and error handling
- Metrics collection and reporting
- TTL behavior and expiration
- Model schema validation

Run tests with:
```bash
npm test -- __tests__/unit/audit-models.test.ts
```