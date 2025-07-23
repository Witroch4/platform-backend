# Implementation Plan

The plan is organized into three distinct phases: Core Implementation, Validation & Testing, and Hardening & Optimization.

## Phase 1: Core Implementation

- [x] 1. Database & Core Libraries Setup
  - [x] 1.1 Database Migration: Create and run the database migration for the new ButtonReactionMapping model using Prisma
    - Create `ButtonReactionMapping` model in Prisma schema
    - Generate and run database migration
    - Seed initial button reaction mappings from config
    - _Requirements: 3.2_

  - [x] 1.2 WhatsApp Communication Library: Create the lib/whatsapp-messages.ts library to abstract all API calls
    - Implement `sendTemplateMessage()` function with proper error handling
    - Implement `sendInteractiveMessage()` function for button/list messages
    - Add logging for successful and failed sends
    - _Requirements: 2.3_

  - [x] 1.3 Database Query Functions: Create helper functions to fetch all necessary data for self-contained tasks
    - Implement `findCompleteMessageMappingByIntent()` to get mapping and full message data
    - Implement `findReactionByButtonId()` for button reaction mappings
    - Add error handling for database query failures
    - _Requirements: 1.3, 4.4_

- [x] 2. Configure the Task Queue System
  - [x] 2.1 Define Task Interfaces: Update the SendMessageTask and SendReactionTask interfaces in lib/queue/ to be fully self-contained
    - Update `SendMessageTask` interface to include complete message data
    - Update `SendReactionTask` interface for reaction handling
    - Ensure task data includes all information needed by worker
    - _Requirements: 5.3_

  - [x] 2.2 Implement Queue Logic: Create the addSendMessageTask() and addSendReactionTask() functions
    - Create `addSendMessageTask()` with enhanced data structure
    - Create `addSendReactionTask()` for reaction processing
    - Configure retry policy with exponential backoff
    - Add dead letter queue configuration for failed tasks

    - _Requirements: 4.2, 4.3, 5.1_

- [x] 3. Refactor the Webhook to be a Pure Dispatcher





  - [x] 3.1 Isolate Webhook Logic: Remove all direct WhatsApp API calls and complex logic from the .../webhook/route.ts handler


    - Remove all direct WhatsApp API calls from webhook handler
    - Simplify webhook to focus only on parsing and queuing
    - _Requirements: 1.1, 1.3_



  - [ ] 3.2 Implement Dispatcher Flow: Add logic to parse requests and create self-contained tasks
    - Add logic to identify intent vs button click requests
    - Use database query functions to fetch complete data
    - Create and queue appropriate self-contained tasks
    - Ensure webhook always responds with 200 OK immediately
    - Add error handling that still returns 200 OK to Dialogflow
    - _Requirements: 3.1, 3.2, 4.4_

- [x] 4. Refactor the Worker to be a Pure Executor





  - [x] 4.1 Update Worker Task Processor: Modify the main worker function to handle the new self-contained task structures


    - Modify `processMtfDiamanteWebhookTask()` to handle new task structure
    - Implement task type routing (sendMessage vs sendReaction)
    - Remove database queries from worker (use task data instead)
    - _Requirements: 2.1, 2.2_



  - [ ] 4.2 Implement Task Handlers: Create processSendMessage() and processSendReaction() handlers
    - Create `processSendMessage()` handler that reads task data and calls WhatsApp library
    - Create `processSendReaction()` handler for emoji reactions
    - Determine message type (template vs interactive) from task data
    - Add comprehensive error handling and logging
    - _Requirements: 2.3_

## Phase 2: Validation & Testing

- [ ] 5. Write Comprehensive Tests for the New Architecture





  - [x] 5.1 Unit Tests: Verify webhook request parsing and correct task creation logic


    - Test webhook request parsing and validation logic
    - Test task creation with complete data
    - Test worker handlers to ensure they call correct library functions
    - Test utility functions (DB queries, message formatters) in isolation
    - Mock all external dependencies (DB, Queue, WhatsApp API)
    - _Requirements: 1.1, 1.3, 3.1, 3.2_



  - [ ] 5.2 Integration Tests: Test the flow from webhook to queue to worker
    - Test flow from webhook receiving request to task being placed in queue
    - Test flow from task being picked up by worker to correct API call
    - Test error handling scenarios and recovery mechanisms
    - Use mocks for external services


    - _Requirements: 2.1, 2.2, 2.3_

  - [ ] 5.3 End-to-End (E2E) Tests: In staging environment, test full real-world flow
    - Test complete flow from Dialogflow intent to WhatsApp message delivery
    - Test queue processing under load
    - Verify database logging and task completion
    - Test both intent responses and button reactions
    - _Requirements: 2.4, 5.2_

## Phase 3: Hardening & Optimization

- [ ] 6. Implement System-Wide Observability & Error Handling
  - [ ] 6.1 Structured Logging: Implement structured logging with correlationId for request tracing
    - Implement correlation ID generation in webhook
    - Pass correlation IDs through queue tasks to worker
    - Add structured logging (JSON format) in all components
    - Create log aggregation and search capabilities
    - _Requirements: 4.1, 4.2_

  - [ ] 6.2 Robust Error Handling: Ensure system gracefully handles all failure scenarios
    - In webhook, wrap logic in try/catch blocks that log errors but return 200 OK
    - In worker, ensure retry/DLQ policy handles transient and persistent errors
    - Implement critical error logging for queue failures
    - Add circuit breaker pattern for API reliability
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

  - [ ] 6.3 Monitoring & Alerts: Set up comprehensive monitoring and alerting
    - Set up dashboard for key metrics: webhook latency, queue depth, task processing rate
    - Monitor API error rates and success rates
    - Configure alerts for critical failures (queue connection lost, high DLQ rate)
    - Add health check endpoints for system components
    - _Requirements: 5.1, 5.2_

- [ ] 7. Performance & Load Testing
  - [ ] 7.1 Performance Optimization: Implement performance enhancements where needed
    - Implement database connection pooling
    - Add caching for frequently accessed mappings
    - Optimize database queries for speed
    - Add request validation early in pipeline
    - _Requirements: 1.1, 5.3_

  - [ ] 7.2 Load Testing: Verify system performance under high traffic
    - Use load testing tool to simulate high traffic to webhook
    - Verify webhook response times remain low under load
    - Test queue/worker system processes backlog efficiently
    - Identify and resolve performance bottlenecks
    - Validate system meets response time requirements
    - _Requirements: 5.1, 5.2_
