# Cache Key Fix - Design Document

## Overview

O problema atual é que o cache do Instagram usa chaves no formato `intentName:inboxId`, mas isso não é único quando múltiplos usuários do Chatwit têm inboxes com o mesmo ID. A solução é modificar a chave de cache para incluir o `usuarioChatwitId`.

## Architecture

### Current Cache Key Format
```
chatwit:instagram_template_mapping:${intentName}:${inboxId}
```

### New Cache Key Format
```
chatwit:instagram_template_mapping:${intentName}:${usuarioChatwitId}:${inboxId}
```

## Components and Interfaces

### 1. Instagram Template Cache (lib/cache/instagram-template-cache.ts)

**Modifications needed:**
- Update `getTemplateMapping()` to accept `usuarioChatwitId`
- Update `setTemplateMapping()` to accept `usuarioChatwitId`
- Update `invalidateTemplateMapping()` to accept `usuarioChatwitId`
- Update cache key generation to include `usuarioChatwitId`

### 2. Database Query Functions (lib/dialogflow-database-queries.ts)

**Modifications needed:**
- Update `findCompleteMessageMappingByIntent()` to return `usuarioChatwitId`
- Ensure all database queries include the user context

### 3. Optimized Database Queries (lib/instagram/optimized-database-queries.ts)

**Modifications needed:**
- Update `findOptimizedCompleteMessageMapping()` to use new cache key format
- Pass `usuarioChatwitId` to cache functions

### 4. API Routes

**Modifications needed:**
- All mapping APIs need to extract `usuarioChatwitId` from the inbox
- Pass `usuarioChatwitId` to cache invalidation functions

## Data Models

### Cache Key Structure
```typescript
interface CacheKeyComponents {
  intentName: string;
  usuarioChatwitId: string;
  inboxId: string;
}
```

### Database Query Result
```typescript
interface CompleteMessageMapping {
  // ... existing fields
  usuarioChatwitId: string; // Add this field
}
```

## Error Handling

### Cache Miss Scenarios
1. **User not found**: Return null and log warning
2. **Inbox not found**: Return null and log warning
3. **Template not found**: Return null (normal behavior)

### Cache Invalidation Errors
1. **User not found**: Log warning but don't fail the operation
2. **Cache connection error**: Log error but don't fail the operation

## Testing Strategy

### Unit Tests
1. Test cache key generation with different user/inbox combinations
2. Test cache isolation between users
3. Test invalidation with correct user context

### Integration Tests
1. Test full flow from webhook to cache with multiple users
2. Test API invalidation with multiple users
3. Test database queries with user context

## Migration Strategy

### Phase 1: Update Cache Functions
1. Modify cache functions to accept `usuarioChatwitId`
2. Update cache key generation
3. Maintain backward compatibility temporarily

### Phase 2: Update Database Queries
1. Modify database queries to return `usuarioChatwitId`
2. Update optimized queries to use new cache format

### Phase 3: Update APIs
1. Modify all mapping APIs to use new cache format
2. Update webhook processing to use new cache format

### Phase 4: Cleanup
1. Remove backward compatibility code
2. Clear old cache entries
3. Update monitoring and logging