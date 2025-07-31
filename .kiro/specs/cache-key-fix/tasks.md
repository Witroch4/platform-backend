# Implementation Plan

- [x] 1. Update Instagram Template Cache functions
  - Modify cache key generation to include usuarioChatwitId
  - Update getTemplateMapping, setTemplateMapping, and invalidateTemplateMapping functions
  - Add backward compatibility for existing cache entries
  - _Requirements: 1.1, 1.2, 1.3_

- [x] 2. Update database query functions
  - Modify findCompleteMessageMappingByIntent to return usuarioChatwitId
  - Update CompleteMessageMapping interface to include usuarioChatwitId
  - Ensure all queries include proper user context
  - _Requirements: 1.1, 2.3_

- [x] 3. Update optimized database queries
  - Modify findOptimizedCompleteMessageMapping to use new cache format
  - Pass usuarioChatwitId to cache functions
  - Update cache hit/miss logging to include user context
  - _Requirements: 1.1, 1.3_

- [x] 4. Update mapping API routes
  - Extract usuarioChatwitId from ChatwitInbox in all mapping APIs
  - Pass usuarioChatwitId to cache invalidation functions
  - Update error handling and logging
  - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [x] 5. Update interactive messages API
  - Extract usuarioChatwitId from ChatwitInbox for cache invalidation
  - Update both DELETE and PUT operations
  - Ensure proper error handling
  - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [x] 6. Update webhook processing

  - Ensure webhook extracts and uses usuarioChatwitId correctly
  - Update Instagram translation job processing

  - Verify cache isolation between users
  - _Requirements: 1.1, 2.1, 2.2_

- [x] 7. Add comprehensive logging






  - Log cache operations with user context
  - Add debugging information for cache key generation
  - Improve error messages to include user information
  - _Requirements: 3.4_

- [x] 8. Test cache isolation








  - Create test scenarios with multiple users having same inboxId
  - Verify cache invalidation affects only the correct user
  - Test webhook processing with multiple users
  - _Requirements: 2.1, 2.2, 2.3_
