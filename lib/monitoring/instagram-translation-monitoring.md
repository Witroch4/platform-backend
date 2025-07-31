# Instagram Translation Monitoring and Logging

This document describes the comprehensive monitoring and logging infrastructure for the Instagram message translation system.

## Overview

The Instagram translation monitoring system provides:

1. **Structured Logging** with correlation IDs for request tracing
2. **Performance Metrics** tracking for conversion times and resource usage
3. **Error Tracking** and categorization with pattern detection
4. **Queue Health Monitoring** with alerting
5. **CPU/Memory Usage Monitoring** for worker processes

## Components

### 1. Instagram Translation Monitor (`instagram-translation-monitor.ts`)

Tracks performance metrics and resource usage:

- **Translation Metrics**: Conversion times, template types, success rates
- **Worker Performance**: CPU/Memory usage, processing times, queue wait times
- **Queue Health**: Depth, throughput, error rates
- **Alerting**: Automatic alerts for performance issues

#### Key Metrics Tracked:

```typescript
interface InstagramTranslationMetrics {
  correlationId: string;
  conversionTime: number;
  templateType: 'generic' | 'button' | 'incompatible';
  bodyLength: number;
  buttonsCount: number;
  hasImage: boolean;
  success: boolean;
  error?: string;
  errorCode?: string;
  timestamp: Date;
  retryCount: number;
  messageType: 'interactive' | 'enhanced_interactive' | 'template';
}
```

#### Alert Thresholds:

- **Conversion Time**: > 2 seconds
- **Queue Wait Time**: > 5 seconds
- **Error Rate**: > 10%
- **Queue Depth**: > 50 jobs
- **Memory Usage**: > 512MB
- **CPU Usage**: > 80%

### 2. Instagram Translation Logger (`instagram-translation-logger.ts`)

Provides structured logging with correlation ID tracking:

- **Webhook Logging**: Request/response tracking
- **Worker Logging**: Job processing lifecycle
- **Queue Logging**: Job state changes
- **Error Logging**: Comprehensive error details
- **Performance Logging**: Timing and resource metrics

#### Log Categories:

- `webhook`: Webhook request processing
- `worker`: Worker job processing
- `queue`: Queue operations
- `conversion`: Message conversion logic
- `validation`: Input/output validation
- `database`: Database operations
- `monitoring`: System monitoring
- `error-handling`: Error recovery

#### Usage Example:

```typescript
import { instagramTranslationLogger, createLogContext } from '@/lib/logging/instagram-translation-logger';

const logContext = createLogContext(correlationId, {
  jobId: job.id,
  intentName: 'greeting',
  inboxId: 'inbox-123',
});

instagramTranslationLogger.workerJobStarted(logContext);
instagramTranslationLogger.workerJobCompleted(logContext, true, 1500, 1);
```

### 3. Instagram Error Tracker (`instagram-error-tracker.ts`)

Tracks and categorizes errors with pattern detection:

- **Error Categorization**: Automatic categorization by type
- **Severity Assessment**: Based on error type and retry count
- **Pattern Detection**: Identifies recurring error patterns
- **Recovery Tracking**: Monitors error resolution
- **Statistics**: Comprehensive error analytics

#### Error Categories:

- `validation`: Input validation errors
- `conversion`: Message conversion errors
- `database`: Database operation errors
- `queue`: Queue processing errors
- `system`: System-level errors
- `timeout`: Timeout errors
- `network`: Network connectivity errors
- `business_logic`: Business rule violations

#### Error Severity Levels:

- `low`: Recoverable errors (validation, timeout)
- `medium`: Business logic errors
- `high`: Errors after multiple retries
- `critical`: System/database errors

#### Usage Example:

```typescript
import { trackInstagramError } from '@/lib/monitoring/instagram-error-tracker';

trackInstagramError(
  correlationId,
  'CONVERSION_FAILED',
  error,
  {
    intentName: 'greeting',
    inboxId: 'inbox-123',
    messageType: 'interactive',
    retryCount: 1,
  },
  { additionalContext: 'value' }
);
```

## API Endpoints

### GET `/api/admin/monitoring/instagram-translation`

Query parameters:
- `timeWindow`: Time window in minutes (default: 60)
- `correlationId`: Specific correlation ID to filter
- `action`: Action type (`summary`, `logs`, `log-statistics`, `health`)

#### Examples:

```bash
# Get performance summary for last hour
curl "http://localhost:3000/api/admin/monitoring/instagram-translation?action=summary&timeWindow=60"

# Get logs for specific correlation ID
curl "http://localhost:3000/api/admin/monitoring/instagram-translation?action=logs&correlationId=ig-123456"

# Get log statistics
curl "http://localhost:3000/api/admin/monitoring/instagram-translation?action=log-statistics&timeWindow=120"

# Get current health status
curl "http://localhost:3000/api/admin/monitoring/instagram-translation?action=health"
```

### POST `/api/admin/monitoring/instagram-translation`

Actions:
- `resolve-error`: Mark an error as resolved
- `trigger-health-check`: Perform manual health check

#### Examples:

```bash
# Resolve an error
curl -X POST "http://localhost:3000/api/admin/monitoring/instagram-translation" \
  -H "Content-Type: application/json" \
  -d '{"action": "resolve-error", "errorId": "error-123", "resolution": "Fixed validation logic"}'

# Trigger health check
curl -X POST "http://localhost:3000/api/admin/monitoring/instagram-translation" \
  -H "Content-Type: application/json" \
  -d '{"action": "trigger-health-check"}'
```

## Integration

### Worker Integration

The monitoring is automatically integrated into the Instagram translation worker:

```typescript
// Automatic metrics recording
recordInstagramTranslationMetrics({
  correlationId,
  conversionTime,
  templateType,
  bodyLength,
  buttonsCount,
  hasImage,
  success: true,
  timestamp: new Date(),
  retryCount: job.attemptsMade,
  messageType: 'interactive',
});

// Automatic performance metrics
recordInstagramWorkerPerformanceMetrics({
  correlationId,
  jobId: job.id,
  processingTime,
  queueWaitTime,
  databaseQueryTime,
  conversionTime,
  validationTime,
  success: true,
  timestamp: new Date(),
  retryCount: job.attemptsMade,
  memoryUsage: process.memoryUsage(),
  cpuUsage: process.cpuUsage(),
});
```

### Webhook Integration

Add monitoring to webhook routes:

```typescript
import { 
  instagramTranslationLogger, 
  createLogContext 
} from '@/lib/logging/instagram-translation-logger';

const logContext = createLogContext(correlationId, {
  intentName,
  inboxId,
});

instagramTranslationLogger.webhookReceived(logContext, payload);
instagramTranslationLogger.webhookChannelDetected(logContext, channelType, isInstagram);
instagramTranslationLogger.webhookJobEnqueued(logContext, jobId);
```

## Data Storage

### Redis Storage

All metrics and logs are stored in Redis with TTL:

- **Metrics**: 1 hour TTL
- **Logs**: 24 hours TTL
- **Errors**: 7 days TTL
- **Alerts**: 24 hours TTL

### Key Patterns

- `chatwit:metrics:instagram-translation:*`: Translation metrics
- `chatwit:metrics:instagram-worker:*`: Worker performance metrics
- `chatwit:logs:instagram-translation:*`: Structured logs
- `chatwit:errors:instagram-translation:*`: Error tracking data
- `chatwit:alerts:*`: System alerts

## Monitoring Dashboard

The monitoring data can be visualized using the existing monitoring dashboard or custom dashboards that consume the API endpoints.

### Key Metrics to Monitor

1. **Performance Metrics**:
   - Average conversion time
   - Success rate
   - Queue depth and throughput
   - Worker resource usage

2. **Error Metrics**:
   - Error rate by category
   - Top error patterns
   - Recovery success rate
   - Alert frequency

3. **Business Metrics**:
   - Template type distribution
   - Message length distribution
   - Button usage patterns
   - Image usage frequency

## Alerting

### Automatic Alerts

The system automatically creates alerts for:

- High conversion times (> 2 seconds)
- High error rates (> 10%)
- Queue depth issues (> 50 jobs)
- Resource usage issues (CPU > 80%, Memory > 512MB)
- Error patterns (> 3 occurrences of same error)

### Alert Levels

- `info`: Informational alerts
- `warning`: Performance degradation
- `error`: Functional issues
- `critical`: System failures

## Troubleshooting

### Common Issues

1. **High Conversion Times**:
   - Check database query performance
   - Monitor worker resource usage
   - Review conversion logic complexity

2. **High Error Rates**:
   - Check error patterns and categories
   - Review input validation
   - Monitor external dependencies

3. **Queue Depth Issues**:
   - Check worker capacity and concurrency
   - Monitor job processing times
   - Review retry policies

### Debug Commands

```bash
# Get recent errors for correlation ID
curl "http://localhost:3000/api/admin/monitoring/instagram-translation?action=logs&correlationId=ig-123456"

# Get error statistics
curl "http://localhost:3000/api/admin/monitoring/instagram-translation?action=log-statistics&timeWindow=60"

# Check current health
curl "http://localhost:3000/api/admin/monitoring/instagram-translation?action=health"
```

## Performance Optimization

### Monitoring-Based Optimization

1. **Conversion Time Optimization**:
   - Monitor database query times
   - Optimize template validation
   - Cache frequently used data

2. **Resource Usage Optimization**:
   - Monitor memory usage patterns
   - Optimize CPU-intensive operations
   - Adjust worker concurrency

3. **Error Rate Reduction**:
   - Analyze error patterns
   - Improve input validation
   - Enhance error recovery

### Metrics-Driven Scaling

Use monitoring data to make scaling decisions:

- Scale workers based on queue depth and processing times
- Adjust concurrency based on resource usage
- Optimize retry policies based on error patterns

## Maintenance

### Regular Tasks

1. **Review Error Patterns**: Weekly review of error statistics
2. **Performance Analysis**: Daily review of performance metrics
3. **Alert Tuning**: Monthly review of alert thresholds
4. **Data Cleanup**: Automatic cleanup via TTL, manual cleanup if needed

### Health Checks

The system provides comprehensive health checks that can be integrated into monitoring systems:

```bash
# Automated health check
curl "http://localhost:3000/api/admin/monitoring/instagram-translation?action=health"
```

This monitoring infrastructure provides comprehensive visibility into the Instagram translation system, enabling proactive issue detection and performance optimization.