# Implementation Plan

- [x] 1. Create Instagram message conversion core logic
  - Implement message converter class with character limit validation
  - Create conversion rules for Generic Template (≤80 chars) and Button Template (81-640 chars)
  - Add button conversion logic with type mapping (web_url, postback)
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 4.1, 4.2, 4.3, 4.4, 4.5, 7.1, 7.2, 7.3, 7.4, 7.5_

- [x] 2. Create queue and communication infrastructure
  - Implement BullMQ queue for Instagram translation tasks with unique job IDs
  - Create Redis Pub/Sub or BullMQ event listeners for worker-webhook communication
  - Add queue configuration with retry policies and error handling
  - Create job data interfaces and validation schemas
  - _Requirements: 2.1, 2.3, 2.4_

- _Requirements: 2.1, 2.3, 2.4_

- [x] 3. Implement Instagram translation worker task
  - Create worker task to process Instagram translation jobs
  - Integrate database queries for template retrieval using existing Prisma models
  - Implement message conversion pipeline with error handling
  - Publish result (success or error) to communication channel using job ID
  - Add correlation ID tracking and structured logging
  - _Requirements: 2.2, 2.3, 3.1, 4.1, 5.1, 5.2, 5.3, 5.4_

- [x] 4. Enhance webhook route with deferred response logic

- [x] 4. Enhance webhook route with deferred response logic
  - Add channel_type detection logic in existing webhook route
  - Create BullMQ job with unique ID and pass Dialogflow payload
  - Implement "wait" logic (listen/subscribe) for worker completion signal using job ID
  - Add internal timeout (4.5 seconds) to ensure webhook always responds to Dialogflow
  - Ensure WhatsApp logic remains completely unchanged (bypasses queue)
  - _Requirements: 1.1, 1.2, 1.3, 2.1, 6.1, 6.2, 6.3, 6.4_

- [x] 5. Implement Dialogflow response formatting in webhook
  - Create Instagram payload builder for fulfillmentMessages format with custom_payload
  - Implement Generic Template response structure for ≤80 character messages
  - Implement Button Template response structure for 81-640 character messages
  - Handle error responses from worker and format fallback message for Dialogflow
  - Send final complete response to Dialogflow after receiving worker result
  - _Requirements: 1.4, 3.1, 3.2, 3.3, 3.4, 3.5, 4.1, 4.2, 4.3, 4.4, 4.5, 5.1, 5.2, 5.3, 5.4_

- [x] 6. Add comprehensive error handling and validation
  - Implement input validation for all Instagram translation components
  - Add error categorization (validation, conversion, system errors)
  - Create fallback mechanisms for failed conversions
  - Implement retry logic with exponential backoff
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 2.4_

-

- [x] 7. Create unit tests for message conversion logic
  - Write tests for Generic Template conversion scenarios
  - Write tests for Button Template conversion scenarios
  - Write tests for incompatible message handling (>640 chars)
  - Write tests for button conversion and validation
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 4.1, 4.2, 4.3, 4.4, 4.5, 7.1, 7.2, 7.3, 7.4, 7.5_

- [x] 8. Create integration tests for queue and communication
  - Write tests for Instagram translation queue job creation with unique IDs
  - Write tests to verify worker correctly publishes result after processing
  - Write tests to verify webhook "wait" logic correctly receives worker signals

  - Write tests for error handling and retry mechanisms
  - Write tests for correlation ID tracking throughout the flow
  - _Requirements: 2.1, 2.2, 2.3, 2.4_

- [x] 9. Create end-to-end webhook integration tests
  - Write tests for complete Instagram flow: webhook receives → waits → worker processes → webhook responds with final payload
  - Write tests for channel type detection in webhook
  - Write tests for internal timeout scenario in webhook (4.5 second limit)
  - Write tests for WhatsApp backward compatibility (bypasses queue)
  - Write tests for error scenarios and fallback behavior
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 6.1, 6.2, 6.3, 6.4_

- [x] 10. Add monitoring and logging infrastructure
  - Implement structured logging with correlation IDs

  - Add performance metrics tracking for conversion times

  - Create error tracking and categorization
  - Add queue health monitoring and alerting
  - Add metrics to monitor CPU/Memory usage of worker in relation to concurrency setting
  - _Requirements: 2.3, 5.4, 8.3, 8.4_

- [x] 11. Register and configure Instagram translation worker
  - Add Instagram translation worker to existing worker initialization system
  - Configure worker with initial concurrency factor of 100 to maximize throughput for IO-bound tasks
  - Define resource limits (memory, CPU) for the worker process

  - Ensure proper worker lifecycle management (startup, shutdown, error recovery)
  - Integrate with existing monitoring dashboard for performance tracking
  - _Requirements: 2.1, 2.2, 8.1, 8.2, 8.3_

- [x] 12. Create performance optimization and caching
  - Implement template caching for frequently accessed data

  - Optimize database queries for template retrieval
  - Add connection pooling and query performance monitoring
  - _Requirements: 2.3_

  - [x] 13. Create simple documentation instagram translation in one .md
  - _Requirements: All requirements_

- [x] 14. Fix Instagram template selection implementation
  - Fix message converter logic to properly select Button Template for 81-640 character messages
  - Update payload builder to use correct structure for Button Template (text field instead of title)
  - Ensure Generic Template is only used for ≤80 character messages
  - Remove image and footer fields for Button Template as per Instagram API requirements
  - Add proper error handling for messages >640 characters
  - Update frontend preview to show correct template type based on message length
  - Add character counter with Instagram-specific limits in the UI
  - Fix webhook response format to include correct template_type field
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 4.1, 4.2, 4.3, 4.4, 4.5, 5.1, 5.2, 5.3, 5.4_

- [x] 15. Implement Quick Replies for long messages and update payload format

  - Add Quick Replies support for messages >640 characters (Caso 4)
  - Update payload format to follow Socialwise standard with message_format and payload structure
  - Implement createInstagramQuickReplies function for long text messages
  - Update determineInstagramTemplateType to include 'quick_replies' option
  - Modify all payload builders to return socialwiseResponse format instead of custom_payload.instagram
  - Update webhook response to use new payload structure
  - Update frontend to show Quick Replies option for messages >640 characters
  - Add validation for Quick Replies format in payload builder
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 1.4_

- [x] 16. Implement cache invalidation for mapping changes
  - Add cache invalidation when mapeamentos are created, updated, or deleted
  - Clear Instagram template cache when mapping changes occur
  - Clear database query cache for affected intent/inbox combinations
  - Add cache invalidation to mapeamentos API endpoints (POST, PUT, DELETE)
  - Ensure cache is cleared immediately when mapping changes
  - Add logging for cache invalidation operations
  - _Requirements: 2.3, 6.1, 6.2_
