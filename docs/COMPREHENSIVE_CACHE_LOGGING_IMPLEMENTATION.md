# Comprehensive Cache Logging Implementation

## Overview

This document describes the comprehensive logging system implemented for the cache key fix, providing detailed logging for cache operations with user context and debugging information.

## Implementation Summary

### 1. Cache Logging Utilities (`lib/logging/cache-logging.ts`)

Created a comprehensive logging utility module that provides standardized logging functions for all cache operations:

#### Key Features:
- **User Context Isolation**: All logs include user context (`usuarioChatwitId`, `inboxId`) for proper isolation
- **Cache Key Debugging**: Detailed logging of cache key generation with format validation
- **Operation Tracking**: Comprehensive tracking of cache hits, misses, sets, and invalidations
- **Error Handling**: Detailed error logging with impact assessment
- **API Integration**: Specialized logging for API-triggered cache invalidations

#### Core Functions:
- `logCacheHit()` - Log cache hits with latency and context
- `logCacheMiss()` - Log cache misses with reasons
- `logCacheSet()` - Log cache set operations with TTL and data size
- `logCacheInvalidation()` - Log cache invalidations with deleted keys
- `logCacheError()` - Log cache errors with detailed error information
- `logCacheKeyGeneration()` - Debug cache key generation process
- `logApiCacheInvalidation()` - Log API-triggered cache operations

### 2. Enhanced Instagram Template Cache (`lib/cache/instagram-template-cache.ts`)

Updated the Instagram template cache to use the new logging utilities:

#### Improvements:
- **Debug Key Generation**: All cache key generation is now logged with components and format
- **User Context**: All operations include user context for proper isolation
- **Performance Metrics**: Latency, hit counts, and data sizes are logged
- **Error Details**: Comprehensive error logging with stack traces and context
- **Cache Invalidation**: Detailed logging of invalidation operations with affected keys

#### Example Log Output:
```
[Cache] [DEBUG] Key generation for getTemplateMapping: {
  userContext: { usuarioChatwitId: "user123", inboxId: "inbox456" },
  intentName: "welcome.intent",
  operation: "getTemplateMapping",
  keyComponents: { intentName: "welcome.intent", usuarioChatwitId: "user123", inboxId: "inbox456" },
  keyFormat: "chatwit:instagram_template_mapping:intentName:usuarioChatwitId:inboxId",
  generatedKey: "chatwit:instagram_template_mapping:welcome.intent:user123:inbox456"
}
```

### 3. Enhanced Database Queries (`lib/instagram/optimized-database-queries.ts`)

Updated the optimized database queries with comprehensive logging:

#### Improvements:
- **Query Steps**: Each step of the database query process is logged
- **User Context**: All database operations include user context
- **Cache Integration**: Database-cache interactions are fully logged
- **Performance Tracking**: Query execution times and cache hit rates
- **Error Handling**: Detailed error logging with user context

### 4. Enhanced API Routes

Updated all API routes that perform cache invalidation:

#### Routes Updated:
- `app/api/admin/mtf-diamante/mapeamentos/route.ts`
- `app/api/admin/mtf-diamante/mapeamentos/[caixaId]/route.ts`
- `app/api/admin/mtf-diamante/mapeamentos/[caixaId]/[mappingId]/route.ts`
- `app/api/admin/mtf-diamante/interactive-messages/[id]/route.ts`

#### Improvements:
- **API Operation Tracking**: Each API operation that triggers cache invalidation is logged
- **User Context Resolution**: Proper user context resolution and logging
- **Success/Failure Tracking**: Clear indication of cache invalidation success or failure
- **Impact Assessment**: Logging of potential impacts when cache invalidation fails

### 5. Enhanced Worker Logging (`worker/WebhookWorkerTasks/instagram-translation.task.ts`)

Updated the Instagram translation worker with enhanced cache logging:

#### Improvements:
- **Cache Key Context**: All cache operations include full user context
- **Operation Correlation**: Cache operations are correlated with webhook processing
- **Performance Metrics**: Cache hit rates and processing times are logged
- **Error Correlation**: Cache errors are correlated with translation failures

## Log Format Standards

### User Context Format
All logs include standardized user context:
```typescript
{
  userContext: {
    usuarioChatwitId: string,
    inboxId: string
  },
  intentName: string,
  operation: string,
  // ... additional context
}
```

### Cache Key Format
Cache key generation is logged with:
```typescript
{
  keyComponents: Record<string, any>,
  keyFormat: string,
  generatedKey: string
}
```

### Error Format
Errors are logged with comprehensive details:
```typescript
{
  error: {
    message: string,
    name: string,
    stack?: string
  },
  impact: string,
  // ... additional context
}
```

## Benefits

### 1. Debugging Capabilities
- **Cache Key Tracing**: Full visibility into cache key generation process
- **User Isolation**: Easy identification of user-specific cache issues
- **Operation Flow**: Complete tracing of cache operations through the system

### 2. Performance Monitoring
- **Hit Rate Tracking**: Detailed cache hit/miss ratios per user and intent
- **Latency Monitoring**: Cache operation latencies with user context
- **Error Rate Tracking**: Cache error rates and patterns

### 3. Troubleshooting
- **User-Specific Issues**: Quick identification of cache issues for specific users
- **API Impact**: Clear visibility into API operations affecting cache
- **Error Correlation**: Easy correlation between cache errors and system failures

### 4. Compliance
- **Audit Trail**: Complete audit trail of cache operations
- **User Data Handling**: Proper logging of user data access patterns
- **System Monitoring**: Comprehensive system health monitoring

## Testing

Comprehensive test suite created (`__tests__/unit/cache-logging.test.ts`) covering:
- All logging utility functions
- User context isolation
- Cache key format validation
- Error handling scenarios
- API integration logging

**Test Results**: ✅ 13/13 tests passing

## Requirements Satisfied

This implementation satisfies requirement **3.4** from the cache key fix specification:
- ✅ Log cache operations with user context
- ✅ Add debugging information for cache key generation  
- ✅ Improve error messages to include user information

## Usage Examples

### Cache Hit Logging
```typescript
logCacheHit(
  { userContext: { usuarioChatwitId: 'user123', inboxId: 'inbox456' }, intentName: 'welcome', operation: 'getTemplateMapping', cacheKey: 'key123' },
  { latency: 25, hitCount: 5 },
  { messageType: 'unified_template' }
);
```

### API Cache Invalidation Logging
```typescript
logApiCacheInvalidation(
  'POST /mapeamentos',
  logContext,
  true,
  'New mapping created',
  { templateId: 'template123', mappingId: 'mapping456' }
);
```

### Error Logging
```typescript
logCacheError(
  logContext,
  new Error('Redis connection failed'),
  'Failed to retrieve template mapping from cache',
  { retryCount: 3 }
);
```

## Future Enhancements

1. **Log Aggregation**: Integration with centralized logging systems
2. **Alerting**: Automated alerts based on cache error patterns
3. **Dashboards**: Real-time cache performance dashboards
4. **Analytics**: Cache usage analytics and optimization recommendations