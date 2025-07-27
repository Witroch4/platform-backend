# Implementation Plan

- [x] 1. Setup core infrastructure and queue system
  - Create new queue system with high and low priority queues
  - Implement correlation ID generation and tracking system
  - Set up Redis cache manager for intelligent credential caching
  - _Requirements: 1.1, 1.2, 1.3, 5.1, 5.2, 8.1, 8.2_

- [x] 1.1 Create high priority queue for user responses
  - Implement `lib/queue/resposta-rapida.queue.ts` with BullMQ configuration
  - Define job interfaces for intent and button response processing
  - Configure queue with appropriate retry policies and dead letter handling
  - Add correlation ID support for request tracing
  - _Requirements: 1.1, 1.3, 5.1, 5.2_

- [x] 1.2 Create low priority queue for data persistence
  - Implement `lib/queue/persistencia-credenciais.queue.ts` with BullMQ configuration
  - Define job interfaces for credential updates and lead management
  - Configure queue with lower priority and longer processing timeouts
  - Add batch processing capabilities for efficiency
  - _Requirements: 2.1, 2.2, 5.3, 5.5_

- [x] 1.3 Implement Redis cache manager for credentials
  - Create `lib/cache/credentials-cache.ts` with intelligent caching logic
  - Implement cache key strategies and TTL management
  - Add cache invalidation and update tracking mechanisms
  - Create fallback logic when cache is unavailable
  - _Requirements: 2.2, 2.3, 8.1, 8.2, 8.3, 8.4, 8.5_

- [x] 2. Refactor webhook dispatcher for millisecond response
  - Update webhook endpoint to extract payload data in under 50ms

  - Implement immediate job enqueueing with correlation ID tracking
  - Return 202 Accepted response without waiting for processing
  - Add comprehensive error handling that maintains fast response times
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 5.1, 5.2_

- [x] 2.1 Extract and validate webhook payload data
  - Refactor `extractWebhookData` function to handle new unified payload structure
  - Add validation for required fields (inbox_id, contact_phone, credentials)
  - Implement contact_source extraction for lead identification
  - Add payload sanitization and security validation
  - _Requirements: 1.1, 1.4, 3.4_

- [x] 2.2 Implement correlation ID generation and tracking
  - Create correlation ID generator with timestamp and random components
  - Add correlation ID to all log entries for request tracing
  - Pass correlation ID through job queues to workers
  - Implement correlation ID validation and format checking
  - _Requirements: 1.1, 5.1, 5.2, 5.5_

- [x] 2.3 Update webhook response to return 202 Accepted
  - Change webhook response status from 200 to 202 Accepted
  - Include correlation ID in response body for client tracking
  - Ensure response time remains under 100ms
  - Add response headers for proper content type and caching
  - _Requirements: 1.1, 1.3_

- [x] 3. Create high priority worker for user responses
  - Implement worker that processes user response jobs using payload credentials
  - Add intent processing logic using unified template system
  - Implement button click processing with action mapping
  - Create comprehensive error handling with retry mechanisms
  - _Requirements: 1.4, 4.2, 4.4, 5.1, 5.3_

- [x] 3.1 Implement intent processing logic
  - Create intent handler that queries MapeamentoIntencao for template mapping
  - Add template resolution logic supporting all template types
  - Implement variable extraction and substitution for dynamic content
  - Add fallback handling when no mapping is found
  - _Requirements: 4.2, 4.4, 4.5_

- [x] 3.2 Implement button click processing logic
  - Create button handler that queries MapeamentoBotao for action mapping
  - Add support for different action types (SEND_TEMPLATE, ADD_TAG, etc.)
  - Implement emoji reaction sending with message ID validation
  - Add text reaction processing with reply-to functionality

  - _Requirements: 4.3, 4.4, 5.1_

- [x] 3.3 Add WhatsApp API integration with credential management
  - Update WhatsApp message sending to use credentials from job payload
  - Implement credential fallback logic when payload credentials are missing
  - Add phone number ID resolution from database when needed
  - Create comprehensive API error handling and retry logic
  - _Requirements: 1.4, 2.4, 2.5_

- [x] 4. Create low priority worker for data persistence
  - Implement worker that updates database without blocking user responses
  - Add intelligent credential caching with Redis integration
  - Implement lead creation and update logic using unified Lead model
  - Create batch processing for multiple updates
  - _Requirements: 2.1, 2.2, 3.1, 3.3, 5.4, 5.5_

- [x] 4.1 Implement credential persistence with intelligent caching
  - Create credential update logic that checks Redis cache before database writes
  - Implement cache expiration and refresh mechanisms
  - Add business ID and phone number ID persistence to ChatwitInbox
  - Create fallback credential resolution with loop detection
  - _Requirements: 2.1, 2.2, 2.3, 8.1, 8.2, 8.3_

- [x] 4.2 Implement lead management using unified model
  - Create lead finder using contact_source for identification
  - Add lead creation logic with proper source and sourceIdentifier
  - Implement lead update with message metadata (wamid, account info)
  - Add lead data enrichment from webhook payload
  - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [x] 4.3 Add cache invalidation and management
  - Implement cache key invalidation when credentials are updated
  - Create cache warming strategies for frequently accessed credentials
  - Add cache health monitoring and automatic recovery
  - Implement cache statistics and performance tracking
  - _Requirements: 8.4, 8.5_

- [ ] 5. Update database queries for unified model
  - Refactor all database queries to use new unified Prisma models
  - Implement optimized queries with proper indexing strategies
  - Add credential fallback resolution with loop protection
  - ~~Create migration scripts for existing data~~ (MIGRAÇÃO JÁ CONCLUÍDA MANUALMENTE)
  - _Requirements: 3.1, 3.2, 4.1, 4.2, 4.4, 4.5, 7.1, 7.2_

- [x] 5.1 Refactor intent mapping queries
  - Update `findCompleteMessageMappingByIntent` to use MapeamentoIntencao model
  - Add support for unified Template model with all template types
  - Implement template priority resolution (unified > enhanced > legacy)
  - Add query optimization with proper includes and indexing
  - _Requirements: 4.1, 4.2, 4.5_

- [x] 5.2 Refactor button action queries
  - Update `findReactionByButtonId` to use MapeamentoBotao model
  - Add support for flexible action types and JSON payloads
  - Implement action validation and sanitization
  - Add query caching for frequently accessed button mappings
  - _Requirements: 4.3, 4.4_

- [x] 5.3 Implement credential fallback resolution
  - Create `CredentialsFallbackResolver` class with loop detection
  - Add recursive credential resolution with maximum depth protection
  - Implement credential caching at each fallback level
  - Create comprehensive logging for fallback chain resolution
  - _Requirements: 2.4, 2.5_

- [x] 5.4 Create data migration scripts (CONCLUÍDO MANUALMENTE)
  - ~~Write migration scripts to move legacy data to unified models~~ (Migração feita manualmente)
  - ~~Implement Lead model population from existing lead sources~~ (Dados já migrados)
  - ~~Add Template model migration from legacy template tables~~ (Dados já migrados)
  - ~~Create credential migration to new ChatwitInbox structure~~ (Dados já migrados)
  - _Requirements: 7.1, 7.2, 7.3_

- [x] 6. Update frontend APIs for unified model
  - Refactor all lead-related APIs to use unified Lead model
  - Update template management APIs for new Template structure
  - Add credential configuration interfaces for ChatwitInbox
  - Implement filtering and search using new model structure
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

- [x] 6.1 Update lead listing and filtering APIs
  - Refactor `/api/admin/leads` to query unified Lead model
  - Add source-based filtering using LeadSource enum
  - Implement pagination and sorting for large lead datasets
  - Add search functionality across unified lead fields
  - _Requirements: 6.1, 6.2_

- [x] 6.2 Update lead detail APIs with conditional data loading
  - Refactor lead detail endpoints to use include for source-specific data
  - Add conditional rendering logic for LeadOabData and LeadInstagramProfile
  - Implement lead update APIs that handle source-specific fields
  - Add lead merge functionality for duplicate handling
  - _Requirements: 6.3, 6.4_

- [x] 6.3 Update template management APIs
  - Refactor template CRUD APIs to use unified Template model
  - Add template type-specific validation and processing
  - Implement template scope and status management

  - Add template usage tracking and analytics
  - _Requirements: 6.5_

- [x] 6.4 Update credential configuration APIs
  - Create APIs for ChatwitInbox credential management
  - Add WhatsAppGlobalConfig management endpoints
  - Implement credential testing and validation endpoints
  - Add fallback chain visualization and management
  - _Requirements: 6.5_

- [x] 7. Refactor Backend Workers & Update Frontend Components
     - Objective: This is a dual-purpose phase. First, to correct the backend worker architecture by consolidating isolated workers into a more maintainable "Parent/Task" model. Second, to update all relevant frontend components to align with the new unified data models for leads, templates, and credentials.
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 6.1, 6.2, 6.3, 6.4, 6.5_

- [x] 7.1 Refactor Worker Architecture & Logic (Backend)
  - Move all logic from `worker/respostaRapida.worker.ts` and `worker/persistencia.worker.ts` into new, dedicated task modules inside `worker/WebhookWorkerTasks/`.
  - Implement the "Parent Worker" at `worker/webhook.worker.ts` to delegate jobs to the correct task module based on the job's name.
  - Update the main initialization script (`worker/init.ts`) to only register the single Parent Worker for both high and low priority queues.
  - Verify all job names in the dispatcher are consistent with the new Parent Worker's delegation logic.
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

- [x] 7.2 Update Frontend Components for Unified Data Model (Frontend)
  - Update lead listing and detail components to handle the unified `Lead` model, including source-based filtering and conditional rendering.
  - Refactor all template management interfaces (create, edit, view) to support the new unified `Template` model and its various types.
  - Add new frontend components to manage credentials at both the `ChatwitInbox` and `WhatsAppGlobalConfig` levels, including fallback visualization.
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

- [x] 7.3 Implement Targeted Testing for Backend and Frontend Changes
  - Create unit tests for the new Parent Worker and delegated task modules to validate the delegation logic.

  - Write integration tests to confirm the end-to-end flow from the webhook dispatcher through the refactored workers.
  - Develop frontend component tests for the updated lead and template views to ensure they render correctly with the new data structure.
  - _Requirements: 7.1, 7.2, 7.3, 8.1, 8.2_

- [ ] 7.4 EMBUTIDA NAS TASK ANTERIORES

- [x] 8. Implement comprehensive testing suite
  - Create unit tests for all new components and functions
  - Add integration tests for webhook flow and worker processing
  - Implement performance tests for response time requirements
  - Add end-to-end tests for complete user workflows
  - _Requirements: All requirements validation_

- [x] 8.1 Create unit tests for core components
  - Write tests for webhook dispatcher with correlation ID tracking
  - Add tests for queue managers and job processing logic
  - Create tests for cache manager with various scenarios
  - Add tests for credential fallback resolution with loop detection
  - _Requirements: 1.1, 1.2, 1.3, 2.2, 2.3, 8.1, 8.2_

- [x] 8.2 Create integration tests for webhook processing
  - Write end-to-end webhook tests with 202 response validation
  - Add tests for complete job processing flow through both queues
  - Create tests for credential fallback chain scenarios
  - Add tests for database updates and cache synchronization
  - _Requirements: 1.1, 1.4, 2.1, 2.4, 5.1, 5.4_

- [x] 8.3 Create performance tests for response time requirements
  - Write load tests for webhook endpoint with 100ms response requirement
  - Add worker performance tests for job processing SLAs
  - Create cache performance tests for credential lookup times
  - Add database query performance tests for optimized queries

  - _Requirements: 1.1, 1.3, 5.1, 5.2_

- [x] 8.4 Create end-to-end tests for user workflows
  - Write complete user interaction tests from webhook to WhatsApp response
  - Add tests for lead creation and update workflows
  - Create tests for template management and usage workflows
  - Add tests for credential configuration and fallback scenarios
  - executing all tests created
  - _Requirements: All requirements comprehensive validation_

- [x] 9. Deploy and monitor system performance


  - Deploy new system with feature flags for gradual rollout
  - Implement monitoring and alerting for all system components
  - Add performance dashboards for webhook response times and worker processing
  - Create operational runbooks for troubleshooting and maintenance
  - _Requirements: System reliability and maintainability_

- [x] 9.1 Implement monitoring and alerting

  - Add application performance monitoring for webhook response times
  - Create queue monitoring with job processing metrics and alerts
  - Implement cache hit rate monitoring and performance tracking
  - Add database query performance monitoring and slow query alerts
  - _Requirements: System observability_

- [x] 9.2 Create operational documentation


  - Write deployment guides for new queue and worker systems
  - Create troubleshooting guides for common issues and error scenarios
  - Add performance tuning guides for queue and cache optimization
  - Create disaster recovery procedures for system failures
  - _Requirements: System maintainability_



- [x] 9.3 Implement gradual rollout with feature flags




  - Create feature flags for enabling new webhook processing
  - Add rollback mechanisms for quick reversion if issues occur
  - Implement A/B testing for performance comparison
  - Add user feedback collection for system improvements
  - desencolva um painel FONTEND de monitoramente de filas e sistema para SUPERADMIN vehja tmb docs\SYSTEM_ARCHITECTURE_GUIDE.md
  - _Requirements: All requirements Safe deployment and validation_
