# Instagram Message Translation System

## Overview

The Instagram Message Translation System is a comprehensive solution that automatically converts WhatsApp interactive message templates to Instagram-compatible formats within the Chatwit platform. The system acts as an intelligent translator that identifies the channel type and applies appropriate conversion rules while maintaining backward compatibility with existing WhatsApp functionality.

## Table of Contents

1. [System Architecture](#system-architecture)
2. [Features](#features)
3. [Message Conversion Rules](#message-conversion-rules)
4. [Installation & Setup](#installation--setup)
5. [Usage](#usage)
6. [API Reference](#api-reference)
7. [Monitoring & Observability](#monitoring--observability)
8. [Error Handling](#error-handling)
9. [Performance Optimization](#performance-optimization)
10. [Testing](#testing)
11. [Troubleshooting](#troubleshooting)
12. [Contributing](#contributing)

## System Architecture

### High-Level Flow

```mermaid
graph TD
    A[Instagram User] --> B[Chatwit Platform]
    B --> C[Dialogflow]
    C --> D[Webhook Route]
    D --> E{Channel Type?}
    E -->|WhatsApp| F[Existing WhatsApp Logic]
    E -->|Instagram| G[Instagram Translation Queue]
    G --> H[Instagram Translation Worker]
    H --> I[Database Query]
    H --> J[Message Conversion Logic]
    J --> K[Instagram Payload Builder]
    K --> L[Response to Dialogflow]
    L --> C
    C --> B
    B --> A
```

### Core Components

1. **Webhook Route Enhancement** (`app/api/admin/mtf-diamante/dialogflow/webhook/route.ts`)
   - Channel type detection
   - Instagram translation job creation
   - Deferred response handling with 4.5-second timeout

2. **Instagram Translation Queue** (`lib/queue/instagram-translation.queue.ts`)
   - BullMQ-based job management
   - Retry logic with exponential backoff
   - Job correlation and result tracking

3. **Instagram Translation Worker** (`worker/WebhookWorkerTasks/instagram-translation.task.ts`)
   - Processes translation jobs
   - Database queries for template retrieval
   - Message conversion pipeline

4. **Message Converter** (`lib/instagram/message-converter.ts`)
   - Core conversion logic
   - Template type determination
   - Button mapping and validation

5. **Payload Builder** (`lib/instagram/payload-builder.ts`)
   - Instagram-specific payload formatting
   - Generic and Button template creation
   - Dialogflow fulfillment message structure

## Features

### ✅ Implemented Features

- **Automatic Channel Detection**: Identifies Instagram vs WhatsApp channels from Dialogflow payload
- **Template Conversion**: Converts WhatsApp templates to Instagram Generic/Button templates
- **Character Limit Handling**: Automatically selects appropriate template based on message length
- **Button Conversion**: Maps WhatsApp buttons to Instagram format with type preservation
- **Asynchronous Processing**: Uses BullMQ for non-blocking translation processing
- **Error Handling**: Comprehensive error categorization and fallback mechanisms
- **Monitoring**: Real-time performance metrics and alerting
- **Caching**: Template conversion result caching for improved performance
- **Retry Logic**: Exponential backoff retry for transient failures
- **Backward Compatibility**: Zero impact on existing WhatsApp functionality

### 🎯 Key Capabilities

- **Generic Template Support**: Messages ≤80 characters with image, title, subtitle, and buttons
- **Button Template Support**: Messages 81-640 characters with text and buttons
- **Incompatible Message Handling**: Graceful handling of messages >640 characters
- **High Concurrency**: Worker configured for 100 concurrent jobs for IO-bound tasks
- **Performance Monitoring**: CPU, memory, and processing time tracking
- **Structured Logging**: Correlation ID-based logging throughout the pipeline

## Message Conversion Rules

### Template Type Selection

| Message Length    | Template Type    | Features                        |
| ----------------- | ---------------- | ------------------------------- |
| ≤ 80 characters   | Generic Template | Image, title, subtitle, buttons |
| 81-640 characters | Button Template  | Text and buttons only           |
| > 640 characters  | Incompatible     | Error response                  |

### Field Mapping

#### Generic Template (≤80 chars)

- **Title**: WhatsApp body text (truncated to 80 chars)
- **Subtitle**: WhatsApp footer text (truncated to 80 chars)
- **Image**: WhatsApp header image URL
- **Buttons**: Converted WhatsApp buttons (max 3)

#### Button Template (81-640 chars)

- **Text**: WhatsApp body text (up to 640 chars)
- **Buttons**: Converted WhatsApp buttons (max 3)
- **Note**: Header and footer are discarded

### Button Conversion

| WhatsApp Button Type | Instagram Button Type | Mapping              |
| -------------------- | --------------------- | -------------------- |
| `web_url`            | `web_url`             | URL preserved        |
| `postback`           | `postback`            | Payload/ID preserved |
| Other types          | Skipped               | Warning logged       |

## Installation & Setup

### Prerequisites

- Node.js 18+
- Redis server
- PostgreSQL database
- BullMQ worker infrastructure

### Environment Variables

```bash
# Redis Configuration
REDIS_URL=redis://localhost:6379

# Database Configuration
DATABASE_URL=postgresql://user:password@localhost:5432/chatwit

# Worker Configuration
INSTAGRAM_WORKER_CONCURRENCY=100
INSTAGRAM_TRANSLATION_TIMEOUT=4500

# Monitoring Configuration
ENABLE_INSTAGRAM_MONITORING=true
METRICS_FLUSH_INTERVAL=30000
```

### Database Setup

The system uses existing Prisma models:

- `MensagemInterativa` - Interactive message templates
- `BotaoMensagemInterativa` - Message buttons
- `DialogflowIntentMapping` - Intent mappings
- `CaixaEntrada` - Inbox configurations

No additional database migrations are required.

### Worker Registration

The Instagram translation worker is automatically registered in the worker initialization system:

```typescript
// worker/init.ts
import { processInstagramTranslationTask } from "./WebhookWorkerTasks/instagram-translation.task";

// Worker is registered with concurrency factor of 100
```

## Usage

### Basic Usage

The system works automatically when Instagram messages are received through Dialogflow. No manual intervention is required.

### Channel Type Detection

The system automatically detects Instagram channels by examining the `channel_type` field in the Dialogflow payload:

```json
{
  "originalDetectIntentRequest": {
    "payload": {
      "channel_type": "Channel::Instagram"
    }
  }
}
```

### Response Format

Instagram responses are formatted as Dialogflow fulfillment messages:

```json
{
  "fulfillmentMessages": [
    {
      "custom_payload": {
        "instagram": {
          "template_type": "generic",
          "elements": [
            {
              "title": "Your message title",
              "subtitle": "Optional subtitle",
              "image_url": "https://example.com/image.jpg",
              "buttons": [
                {
                  "type": "web_url",
                  "title": "Visit Website",
                  "url": "https://example.com"
                }
              ]
            }
          ]
        }
      }
    }
  ]
}
```

## API Reference

### Core Functions

#### `handleInstagramTranslation(req, correlationId, startTime, payloadSize)`

Handles Instagram translation with deferred response logic.

**Parameters:**

- `req`: Dialogflow request object
- `correlationId`: Unique request identifier
- `startTime`: Request start timestamp
- `payloadSize`: Request payload size in bytes

**Returns:** `Promise<Response>` - Dialogflow-compatible response

#### `processInstagramTranslationTask(job)`

Processes Instagram translation jobs in the worker.

**Parameters:**

- `job`: BullMQ job containing translation data

**Returns:** `Promise<InstagramTranslationResult>`

#### `convertInteractiveMessageToInstagram(interactiveMessage, correlationId, logContext)`

Converts WhatsApp interactive messages to Instagram format.

**Parameters:**

- `interactiveMessage`: WhatsApp message data
- `correlationId`: Request correlation ID
- `logContext`: Logging context

**Returns:** `Promise<DialogflowFulfillmentMessage[]>`

### Queue Management

#### `addInstagramTranslationJob(data)`

Adds a translation job to the queue.

**Parameters:**

- `data`: `InstagramTranslationJobData` object

**Returns:** `Promise<string>` - Job ID

#### `waitForInstagramTranslationResult(correlationId, timeoutMs)`

Waits for job completion with timeout.

**Parameters:**

- `correlationId`: Job correlation ID
- `timeoutMs`: Timeout in milliseconds (default: 4500)

**Returns:** `Promise<InstagramTranslationResult>`

## Monitoring & Observability

### Metrics Tracked

#### Translation Metrics

- Conversion time
- Template type distribution
- Success/failure rates
- Message characteristics (length, buttons, images)
- Error categorization

#### Worker Performance Metrics

- Processing time breakdown
- Queue wait time
- Database query performance
- Memory and CPU usage
- Retry counts

#### Queue Health Metrics

- Queue depth (waiting, active, failed jobs)
- Throughput (jobs per minute)
- Error rates
- Average processing times

### Alerting Thresholds

| Metric          | Threshold   | Alert Level |
| --------------- | ----------- | ----------- |
| Conversion Time | > 2 seconds | Warning     |
| Queue Wait Time | > 5 seconds | Warning     |
| Error Rate      | > 10%       | Error       |
| Queue Depth     | > 50 jobs   | Warning     |
| Memory Usage    | > 512MB     | Warning     |
| CPU Usage       | > 80%       | Warning     |
| Success Rate    | < 90%       | Error       |

### Monitoring Dashboard

Access the monitoring dashboard at `/admin/monitoring/dashboard` to view:

- Real-time performance metrics
- Error trends and patterns
- Queue health status
- Resource usage graphs
- Alert history

### Structured Logging

All operations include correlation IDs for request tracing:

```json
{
  "timestamp": "2025-01-30T10:30:00.000Z",
  "level": "INFO",
  "component": "instagram-translation",
  "message": "Translation completed successfully",
  "correlationId": "ig-1706612200000-abc123-xyz789",
  "processingTime": 1250,
  "templateType": "generic",
  "success": true
}
```

## Error Handling

### Error Categories

1. **Validation Errors** (`VALIDATION_ERROR`)
   - Missing required fields
   - Invalid data formats
   - Malformed payloads

2. **Conversion Errors** (`CONVERSION_FAILED`)
   - Message too long (>640 chars)
   - Invalid button configurations
   - Template generation failures

3. **Database Errors** (`DATABASE_ERROR`)
   - Connection failures
   - Query timeouts
   - Data inconsistencies

4. **System Errors** (`SYSTEM_ERROR`)
   - Unexpected exceptions
   - Memory/CPU issues
   - Network failures

### Error Recovery

The system implements multiple recovery strategies:

1. **Automatic Retry**: Exponential backoff for transient errors
2. **Fallback Messages**: Simple text responses when conversion fails
3. **Graceful Degradation**: WhatsApp functionality preserved on Instagram failures
4. **Circuit Breaker**: Prevents cascade failures during system issues

### Error Response Examples

```json
{
  "success": false,
  "error": "Message body exceeds Instagram limit of 640 characters (850 chars)",
  "processingTime": 150,
  "metadata": {
    "errorCode": "MESSAGE_TOO_LONG",
    "retryable": false,
    "correlationId": "ig-1706612200000-abc123-xyz789"
  }
}
```

## Performance Optimization

### Caching Strategy

- **Template Conversion Results**: Cached based on intent, inbox, body length, and image presence
- **Database Query Results**: Optimized queries with connection pooling
- **Redis-based Storage**: Fast access to cached conversion results

### Worker Configuration

- **Concurrency**: 100 concurrent jobs for IO-bound operations
- **Memory Management**: Automatic cleanup and garbage collection
- **Connection Pooling**: Efficient database connection reuse

### Performance Benchmarks

| Operation          | Target Time | Typical Time |
| ------------------ | ----------- | ------------ |
| Channel Detection  | < 10ms      | ~5ms         |
| Job Queuing        | < 50ms      | ~25ms        |
| Database Query     | < 100ms     | ~75ms        |
| Message Conversion | < 200ms     | ~150ms       |
| Total Processing   | < 2000ms    | ~1250ms      |

## Testing

### Test Coverage

The system includes comprehensive test suites:

1. **Unit Tests** (`__tests__/unit/`)
   - Message conversion logic
   - Button mapping functions
   - Validation utilities
   - Error handling

2. **Integration Tests** (`__tests__/integration/`)
   - Queue and worker communication
   - Database integration
   - End-to-end webhook flow

3. **Performance Tests** (`__tests__/performance/`)
   - Load testing with concurrent requests
   - Memory usage monitoring
   - Response time validation

### Running Tests

```bash
# Run all Instagram translation tests
npm test -- --testPathPattern=instagram

# Run specific test suites
npm test -- __tests__/unit/instagram-message-converter.test.ts
npm test -- __tests__/integration/instagram-translation-e2e.test.ts
npm test -- __tests__/performance/instagram-worker-performance.test.ts

# Run with coverage
npm test -- --coverage --testPathPattern=instagram
```

### Test Data

Test fixtures are available in `__tests__/fixtures/instagram/`:

- Sample WhatsApp templates
- Expected Instagram outputs
- Error scenarios
- Performance test data

## Troubleshooting

### Common Issues

#### 1. Jobs Stuck in Queue

**Symptoms**: High queue depth, no processing
**Causes**: Worker not running, Redis connection issues
**Solutions**:

```bash
# Check worker status
pm2 status instagram-worker

# Restart worker
pm2 restart instagram-worker

# Check Redis connection
redis-cli ping
```

#### 2. High Error Rates

**Symptoms**: Many failed translations, error alerts
**Causes**: Database issues, invalid templates, system overload
**Solutions**:

- Check database connectivity
- Validate template configurations
- Review error logs for patterns
- Scale worker instances if needed

#### 3. Slow Response Times

**Symptoms**: Timeouts, performance alerts
**Causes**: Database slow queries, high concurrency, memory issues
**Solutions**:

- Optimize database queries
- Adjust worker concurrency
- Monitor memory usage
- Enable query caching

#### 4. Memory Leaks

**Symptoms**: Increasing memory usage, worker crashes
**Causes**: Unclosed connections, large payloads, caching issues
**Solutions**:

- Monitor connection pools
- Implement payload size limits
- Clear cache periodically
- Restart workers regularly

### Debug Mode

Enable debug logging for detailed troubleshooting:

```bash
# Environment variable
DEBUG=instagram-translation:*

# Or in code
process.env.LOG_LEVEL = 'debug'
```

### Health Checks

Monitor system health with built-in endpoints:

```bash
# Queue health
curl http://localhost:3000/api/admin/monitoring/queues/instagram-translation

# Worker status
curl http://localhost:3000/api/admin/monitoring/workers/instagram-translation

# Performance metrics
curl http://localhost:3000/api/admin/monitoring/instagram/performance
```

## Contributing

### Development Setup

1. Clone the repository
2. Install dependencies: `pnpm install`
3. Set up environment variables
4. Start Redis and PostgreSQL
5. Run migrations: `pnpm exec prisma migrate dev`
6. Start the development server: `pnpm run dev`

### Code Style

- Follow existing TypeScript conventions
- Use ESLint and Prettier for formatting
- Include comprehensive JSDoc comments
- Write tests for new functionality

### Pull Request Process

1. Create feature branch from `main`
2. Implement changes with tests
3. Update documentation
4. Run full test suite
5. Submit PR with detailed description

### Architecture Decisions

When making changes, consider:

- Backward compatibility with WhatsApp
- Performance impact on high-volume scenarios
- Error handling and recovery strategies
- Monitoring and observability requirements

---

## Quick Reference

### Key Files

| File                                                      | Purpose                      |
| --------------------------------------------------------- | ---------------------------- |
| `app/api/admin/mtf-diamante/dialogflow/webhook/route.ts`  | Main webhook handler         |
| `worker/WebhookWorkerTasks/instagram-translation.task.ts` | Translation worker           |
| `lib/instagram/message-converter.ts`                      | Core conversion logic        |
| `lib/instagram/payload-builder.ts`                        | Instagram payload formatting |
| `lib/queue/instagram-translation.queue.ts`                | Queue management             |
| `lib/monitoring/instagram-translation-monitor.ts`         | Performance monitoring       |

### Environment Variables

```bash
REDIS_URL=redis://localhost:6379
INSTAGRAM_WORKER_CONCURRENCY=100
INSTAGRAM_TRANSLATION_TIMEOUT=4500
ENABLE_INSTAGRAM_MONITORING=true
```

### Monitoring URLs

- Dashboard: `/admin/monitoring/dashboard`
- Queue Health: `/api/admin/monitoring/queues/instagram-translation`
- Performance: `/api/admin/monitoring/instagram/performance`

### Support

For issues and questions:

- Check the troubleshooting section
- Review error logs with correlation IDs
- Monitor performance metrics
- Contact the development team with specific error details

---

_Last updated: January 30, 2025_
_Version: 1.0.0_
