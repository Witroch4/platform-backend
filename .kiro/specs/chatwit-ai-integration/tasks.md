# Implementation Plan

- [x] 1. Setup project structure and core interfaces
  - Create directory structure for AI integration components
  - Define TypeScript interfaces for webhook payloads, job data, and API responses
  - Setup Zod schemas for validation
  - _Requirements: 13.1, 13.2_

- [x] 2. Implement database schema and migrations
  - [x] 2.1 Create Intent model with PGVector support
    - Add Intent model to Prisma schema with vector embedding field
    - Create migration with PGVector extension and ivfflat index
    - Write database seed for initial intents
    - _Requirements: 8.1, 8.2_

  - [x] 2.2 Create audit and logging models
    - Add LlmAudit and IntentHitLog models with TTL fields
    - Create composite indexes for performance
    - Implement automatic expiry with pg_cron or app job
    - _Requirements: 6.1, 6.2, 12.3_

- [x] 3. Setup Redis guards and rate limiting
  - [x] 3.1 Implement idempotency guards
    - Create Redis-based SETNX idempotency with TTL
    - Implement key generation: `idem:cw:${account_id}:${conversation_id}:${message_id}`
    - Write unit tests for deduplication logic
    - _Requirements: 2.1, 2.2_

  - [ ] 3.2 Implement multi-level rate limiting
    - Create rate limiters for conversation, account, and contact scopes
    - Make limits configurable via environment variables
    - Add metrics for rate limit hits by scope

    - _Requirements: 2.3, 2.4, 15.4_

  - [x] 3.3 Add per-conversation processing lock
    - Ensure maximum 1 job in parallel per conversation_id (response ordering)

    - Use BullMQ groupKey or Redis mutex lock:cw:${conversation_id}
    - _Requirements: 1.1, 7.1_

  - [x] 3.4 Add out-of-order guard
    - If message arrives with created_at before last processed in conversation, route to agent
    - Prevent anachronistic responses
    - _Requirements: 1.4_

- [ ] 4. Create webhook ingestion endpoint
  - [x] 4.1 Implement HMAC authentication
    - Create HMAC validation with timing-safe comparison
    - Implement timestamp window validation (±5 min)
    - Add proper error responses (401 for auth failures)
    - _Requirements: 12.1, 13.1_

  - [ ] 4.2 Build webhook handler with validation
    - Create POST /api/chatwit/webhook endpoint
    - Implement Zod schema validation for incoming payloads
    - Add channel detection (whatsapp/instagram/messenger)
    - Apply idempotency and rate limiting guards

    - _Requirements: 1.1, 13.1, 13.2_

  - [ ] 4.3 Implement job enqueueing
    - Enqueue validated messages to ai:incoming-message queue

    - Add tracing context and job metadata
    - Handle queue failures with proper error responses
    - _Requirements: 1.1, 14.1_

  - [ ] 4.4 Add fast-ack pattern
    - Respond 200 {ok:true} within 100-150ms
    - Move all processing to background queue
    - Log ingest_duration_ms and reject payloads > 256 KB

    - _Requirements: 1.1, 11.1_

  - [x] 4.5 Add IP allowlist & per-IP rate limit
    - Rate limit by origin IP (60 req/10s) to protect webhook
    - Optional: WAF/Reverse proxy with Chatwit IP allowlist
    - _Requirements: 12.1_

  - [ ] 4.6 Add payload normalization & media skip
    - Normalize text (trim, NFkc), drop media and attachments
    - Extract click payloads (WA button_reply.id, IG quick_reply.payload/postback.payload)
    - _Requirements: 1.1, 4.4, 5.4_

  - [ ] 4.7 Add raw-body capture & canonicalization
    - Ensure access to raw body before JSON parse for HMAC
    - Normalize Content-Type/charset and log content_length
    - _Requirements: 12.1, 13.1_

  - [ ] 4.8 Add provider correlation fields
    - Persist source_id (WA wamid, IG mid) and channel in job
    - Log provider_timestamp if available to debug delays
    - _Requirements: 6.3, 14.1_

- [x] 5. Setup BullMQ queues and workers
  - [x] 5.1 Configure queue infrastructure
    - Setup ai:incoming-message and ai:embedding-upsert queues
    - Configure retry policies with exponential backoff
    - Setup Dead Letter Queue with admin reprocessing endpoints
    - _Requirements: 7.1, 7.2, 7.3_

  - [x] 5.2 Implement AI message worker
    - Create aiMessageWorker with job processing logic
    - Add distributed tracing with span creation
    - Implement error handling and fallback strategies
    - _Requirements: 1.1, 1.2, 14.1_

  - [x] 5.3 Implement embedding upsert worker
    - Create embeddingUpsertWorker for intent management
    - Add OpenAI embedding generation
    - Update intent embeddings in database
    - _Requirements: 8.1, 8.2_

- [x] 6. Build intent classification system
  - [x] 6.1 Implement embedding generation
    - Create OpenAI embedding client with timeout and retry
    - Add text preprocessing and normalization

    - Implement embedding caching with Redis
    - _Requirements: 3.1, 3.2, 8.1_

  - [x] 6.2 Create PGVector similarity search
    - Implement vector similarity search with configurable threshold

    - Add candidate ranking and filtering logic
    - Create audit logging for all classification attempts
    - _Requirements: 3.1, 3.2, 6.1, 6.2_

  - [x] 6.3 Build intent classification service
    - Combine embedding generation with similarity search
    - Implement threshold-based decision making
    - Add comprehensive logging and metrics
    - _Requirements: 3.1, 3.2, 3.3, 6.1_

  - [x] 6.4 Add negative examples & threshold tuning
    - Allow negative examples per intent and ROC curve for threshold adjustment
    - Add metric: ai_intent_reject_total (candidate < threshold)

    - _Requirements: 8.3, 8.4, 6.1_

  - [x] 6.5 Add namespaced payload convention
    - Standardize button payloads: intent:<slug> | flow:<slug> | help:<topic>

    - Validate and route with automation/routing table
    - _Requirements: 4.4, 5.4, 13.1_

  - [x] 6.6 Add conversation context store (Redis)
    - Store last N messages (ex.: 6) + TTL 15 min per conversation_id
    - Utility API to compose short context for LLM

    - _Requirements: 3.3, 7.3_

  - [x] 6.7 Add "button router" service
    - Single service mapping namespaced payload (intent:, flow:, help:) → action
    - Metric: ai_button_route_total{route, status}
    - _Requirements: 4.4, 5.4, 13.1_

  - [x] 6.8 Add template registry
    - Registry of versioned templates (text/interactive) by channel and language
    - Admin preview and A/B testing per template
    - _Requirements: 8.3, 8.4_

- [x] 7. Implement dynamic LLM generation
  - [x] 7.1 Create OpenAI structured output client
    - Setup OpenAI client with gpt-4o-mini model
    - Implement structured output with JSON schemas
    - Add timeout, retry, and circuit breaker patterns
    - _Requirements: 3.3, 3.4, 7.3, 7.4_

  - [x] 7.2 Build channel-specific schemas
    - Create WhatsApp interactive button schema
    - Create Instagram quick reply and button template schemas
    - Implement schema validation and sanitization
    - _Requirements: 4.1, 4.2, 4.3, 5.1, 5.2, 5.3_

  - [x] 7.3 Implement dynamic generation service
    - Create LLM prompt templates with guardrails
    - Add context building from conversation history
    - Implement fallback to simple text when LLM fails
    - _Requirements: 3.3, 3.4, 7.4_

  - [x] 7.4 Add safety & prompt-injection guards
    - Hard instructions: no sensitive data, no commitments outside channel
    - Filter responses with regex (external URLs, markdown), reprompt if violated
    - _Requirements: 12.2, 3.4_

  - [x] 7.5 Add degrade plan (economic/high latency)
    - For latency > 8-10s or recurring 429/5xx: use short responses/templates
    - Circuit breaker opens → only intents/templates until half-open
    - _Requirements: 7.3, 15.2_

  - [x] 7.6 Add small-talk cache
    - Cache by hash(normalized text + channel + account_id), TTL 30 min
    - Bypass LLM for repetitive messages ("oi", "bom dia")

    - _Requirements: 15.1, 15.3_

  - [x] 7.7 Add deterministic context shaping
    - Rules: remove repeated greetings, URLs, and PII; limit to ~800 chars before LLM
    - _Requirements: 12.2, 3.4_

  - [x] 7.8 Add jittered backoff & provider key rotation
    - Backoff with jitter for 429/5xx; automatic rotation to secondary key if CB opens
    - _Requirements: 7.3, 11.4_

  - [x] 7.9 Add content policy filter
    - Final validation (server-side) against responses with external links (except whitelist) and prohibited terms
    - _Requirements: 12.2_

- [x] 8. Build message sanitization and validation
  - [x] 8.1 Implement channel-specific sanitizers
    - Create WhatsApp sanitizer (1024 body, 60 header/footer, 3 buttons max)
    - Create Instagram sanitizers (1000 text, 13→3 quick replies, 640 button template)
    - Add title uniqueness validation (case-insensitive)
    - _Requirements: 9.1, 9.2, 9.3, 9.4_

  - [x] 8.2 Add content validation and truncation
    - Implement smart truncation preserving word boundaries
    - Validate HTTPS URLs for Instagram web_url buttons
    - Add fallback to simple text for invalid interactive content
    - _Requirements: 9.1, 9.2, 9.3, 9.4_

  - [x] 8.3 Add uniqueness & dedupe strategy
    - Unique button titles (case-insensitive) and duplicate removal
    - If 0 buttons remain, insert "Falar com atendente"
    - _Requirements: 9.2, 9.4_

  - [x] 8.4 Add locale & accent rules
    - Normalize accents and short capitalization (ex.: "Rastrear", "Pagamento")
    - _Requirements: 9.1_

  - [ ] 8.5 Add domain allowlist for IG web_url
    - Whitelist per account (ex.: your domain + partners); reject others

    - _Requirements: 9.1, 9.4_

  - [ ] 8.6 Add emoji & whitespace normalization
    - Remove ZWSP, collapse spaces, limit consecutive emojis (WA/IG UX)

    - _Requirements: 9.1_

- [ ] 9. Create Chatwit API integration
  - [x] 9.1 Build Chatwit API client
    - Create HTTP client with proper authentication
    - Implement message posting with content_attributes
    - Add retry logic for different HTTP status codes
    - _Requirements: 1.2, 1.3, 7.1, 7.2_

  - [ ] 9.2 Implement channel-specific message formatting
    - Transform sanitized content to Chatwit content_attributes format

    - Add required additional_attributes with schema_version
    - Include tracing context in API calls
    - _Requirements: 4.1, 4.2, 5.1, 5.2, 13.2_

  - [x] 9.3 Add error handling and fallback
    - Map Chatwit API errors to appropriate actions (retry/DLQ)

    - Implement human handoff with structured payload

    - Add comprehensive logging and metrics
    - _Requirements: 1.4, 7.1, 7.2, 7.4_

  - [-] 9.4 Add idempotent outbound & retry journal
    - Avoid "double post" with Redis journal out:${conversation_id}:${hash(payload)} for 60s
    - Skip and log dedupe outbound if same payload resent by retry
    - _Requirements: 7.1, 7.2_

  - [ ] 9.5 Add human handoff details
    - Post standard message ("Acionei um atendente humano"), tag and assign to team
    - Optional: change conversation status per policy
    - _Requirements: 1.4_

  - [ ] 9.6 Add "typing indicators" & seen semantics (optional)
    - If Chatwit exposes, publish "typing" briefly before generated messages > 1s (improves UX)
    - _Requirements: 1.2_

  - [ ] 9.7 Add retry classification matrix (final)
    - 400/401/403/409 → no retry; 429 → Retry-After or 5s _ 3; 5xx → 1s/2s/4s _ 3
    - Log decision in deliver_retry_reason
    - _Requirements: 7.1, 7.2_

- [x] 10. Implement observability and monitoring
  - [x] 10.1 Add structured logging
    - Implement consistent log format with traceId, accountId, conversationId
    - Add contextual logging throughout the pipeline
    - Create log aggregation and search capabilities
    - _Requirements: 6.3, 14.1, 14.2_

  - [x] 10.2 Setup metrics collection
    - Implement Prometheus metrics for latency, throughput, errors
    - Add business metrics for intent confidence, fallback rates
    - Create cost tracking metrics for LLM token usage
    - _Requirements: 10.1, 10.2, 14.2, 15.3_

  - [x] 10.3 Create monitoring dashboards
    - Build Grafana dashboard with 5 key panels (latency, fallback, DLQ, rate limits, tokens)
    - Setup alerting rules for high error rates and queue backlogs
    - Add health check endpoints for liveness and readiness probes
    - _Requirements: 10.3, 10.4, 11.2_

  - [x] 10.4 Add SLO measurement jobs
    - Periodic job calculating p95/p99 E2E (webhook→post Chatwit) by account/channel
    - Emit ai_slo_violation_total when > target
    - _Requirements: 11.1, 11.2_

  - [x] 10.5 Add synthetic probes
    - Synthetic conversations during business hours (5 min) in Chatwit sandbox
    - Measure end-to-end latency and alert on anomalies
    - _Requirements: 11.2_

  - [x] 10.6 Add payload sampling & redaction
    - Sample 1-5% of payloads with PII redaction for quick inspection
    - _Requirements: 12.2, 6.3_

  - [x] 10.7 Add queue lag metric
    - ai_queue_lag_ms (now − enqueued_at) per queue; alert if > 30s for 5m
    - _Requirements: 10.4, 11.2_

- [x] 11. Implement security and data protection
  - [x] 11.1 Add PII masking and data retention
    - Implement PII detection and masking in audit logs
    - Setup automatic data expiry with TTL fields
    - Create data retention policies and cleanup jobs
    - _Requirements: 12.2, 12.3_

  - [ ] 11.2 Implement access control and audit trails
    - Add role-based access to admin interfaces
    - Create audit trails for sensitive operations
    - Implement secret rotation procedures

    - _Requirements: 12.4, 6.4_

  - [x] 11.3 Add runtime config validation
    - Validate .env with Zod on bootstrap (fail-fast)
    - Expose /api/config/health (admin only) listing missing critical variables
    - _Requirements: 12.1, 12.4_

  - [x] 11.4 Add secrets rotation hooks
    - Quarterly rotation of OPENAI_API_KEY and CHATWIT_TOKEN with overlap window

    - Metric: ai_secret_rotation_events_total
    - _Requirements: 12.4_

  - [x] 11.5 Add HMAC header/version negotiation
    - Define official header (X-Chatwit-Signature), version (X-Chatwit-Signature-Version: v1)
    - Reject unknown versions

    - _Requirements: 12.1_

  - [x] 11.6 Add LGPD minimization
    - Hash (with salt) sensitive identifiers in logs (contact_id, phone)

    - Store only last 4 digits when necessary
    - _Requirements: 12.2_

- [x] 12. Add cost control and feature flags
  - [x] 12.1 Implement economic mode
    - Create cost tracking and budget enforcement
    - Add economic mode with reduced functionality

    - Implement LLM response caching to reduce costs
    - _Requirements: 15.1, 15.2, 15.3_

  - [x] 12.2 Setup feature flag system
    - Implement feature flags for gradual rollout
    - Add account/inbox level flag configuration
    - Create admin interface for flag management
    - _Requirements: 16.1, 16.2, 16.3, 16.4_

  - [x] 12.3 Add daily budget guard
    - Cut per account when tokens/day or R$/day exceed budget (economic flag)
    - Metric: ai_budget_exceeded_total{account_id}

    - _Requirements: 15.1, 15.3_

  - [ ] 12.4 Add per-intent cost policy
    - Mark "expensive" intents (ex.: long generation) to use mini model or skip LLM if budget near limit
    - _Requirements: 15.2, 15.3_

- [x] 13. Build admin interfaces and tooling
  - [x] 13.1 Create intent management interface
    - Build CRUD interface for intent configuration
    - Add embedding regeneration and testing tools
    - Create intent performance analytics
    - _Requirements: 8.3, 8.4_

  - [ ] 13.2 Build queue management dashboard
    - Create DLQ monitoring and reprocessing interface

    - Add queue pause/resume controls

    - Implement job inspection and debugging tools
    - _Requirements: 7.2, 10.4_

- [x]14. Write comprehensive tests
  - [x] 14.1 Create unit tests
    - Test webhook validation, HMAC authentication, rate limiting

    - Test intent classification, LLM generation, sanitization
    - Test Chatwit API client and error handling
    - _Requirements: All functional requirements_

  - [x] 14.2 Build integration tests **tests**(pasta na raiz)
    - Test end-to-end flow from webhook to Chatwit response
    - Test database operations and Redis interactions
    - Test external API integrations with mocking

    - _Requirements: All functional requirements_

  - [x] 14.3 Add contract tests **tests**(pasta na raiz)
    - Create fixtures for Chatwit webhook payloads
    - Add snapshot tests for API responses
    - Test channel compliance with fuzz testing
    - _Requirements: 13.1, 13.2, 4.1, 5.1_

  - [x] 14.4 Implement performance tests **tests**(pasta na raiz)
    - Load test webhook endpoint with 1000 concurrent requests
    - Test queue throughput and worker performance
    - Validate P95/P99 latency requirements
    - _Requirements: 11.1, 11.2_

  - [x] 14.5 Add click-webhook simulation
    - Simulate button_reply.id (WA), quick_reply.payload/postback.payload (IG)
    - Verify routing and context persistence (15 min TTL per conversation)
    - _Requirements: 4.4, 5.4_

  - [x] 14.6 Add chaos / dependency failures
    - Drop Redis/DB/OpenAI/Chatwit in tests to validate retries, CB, DLQ
    - _Requirements: 7.1, 7.2, 7.3_

  - [x] 14.7 Add regression snapshots for Chatwit content_attributes
    - Snapshots per channel (WA interactive / IG quick_reply / IG button_template) to lock contract
    - _Requirements: 13.2, 4.1, 5.1_

  - [x] 14.8 Add message ordering test **tests**(pasta na raiz)
    - Fire two webhooks with created_at out of order and ensure ordering/guard
    - _Requirements: 3.3_

  - [ ] 14.9 Add budget guard tests **tests**(pasta na raiz)
    - Simulate tokens/day overflow per account → activate economic mode and avoid LLM calls
    - _Requirements: 12.3, 15.3_

- [ ] 15. Setup deployment and production readiness
  - [ ] 15.2 Implement production monitoring
    - Setup log aggregation and alerting
    - Configure uptime monitoring and SLA tracking
    - Create runbooks for common operational tasks
    - _Requirements: 11.1, 11.2, 10.3, 10.4_

  - [ ] 15.3 Add rollback and disaster recovery
    - Create rollback procedures for failed deployments
    - Implement database backup and recovery procedures
    - Document incident response procedures
    - _Requirements: 16.3, 16.4_

  - [ ] 15.4 Add warmup & connection pooling
    - Preheat connections (DB/Redis/OpenAI) on startup to reduce cold start
    - _Requirements: 11.3_

  - [ ] 15.5 Add blue/green + canary gates
    - 5% canary by account_id/inbox_id with automatic rollback if error > 1% (10 min)
    - _Requirements: 16.2, 16.3_

  - [ ] 15.6 Add config drift detector
    - Endpoint/admin to compare runtime flags/limits vs. expected (file/DB) and alert drift
    - _Requirements: 16.1, 16.2_

  - [ ] 15.7 Add runbook "queue saturated"
    - Procedure: pause consumption, scale worker replicas, drain DLQ, review hot partitions
    - _Requirements: 10.4, 11.2_

- [ ] 16. Conduct end-to-end testing and validation
  - [ ] 16.1 Test WhatsApp integration flow
    - Send test messages through complete pipeline
    - Validate interactive button responses
    - Test button click handling and intent routing
    - _Requirements: 1.1, 1.2, 4.1, 4.2, 4.3, 4.4_

  - [ ] 16.2 Test Instagram integration flow
    - Test quick reply and button template generation
    - Validate payload handling and response formatting
    - Test URL validation and HTTPS enforcement
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

  - [ ] 16.3 Validate fallback and error scenarios
    - Test LLM failures and human handoff
    - Validate rate limiting and idempotency
    - Test DLQ processing and recovery
    - _Requirements: 1.4, 2.1, 2.2, 7.1, 7.2, 7.4_

  - [ ] 16.4 Conduct load testing and performance validation
    - Run sustained load tests to validate SLA requirements
    - Test system behavior under various failure conditions
    - Validate monitoring and alerting systems
    - _Requirements: 11.1, 11.2, 11.3, 11.4_

- [ ] 17. Fix TypeScript compilation errors
  - [x] 17.1 Fix import and connection errors
    - Fix Redis and Prisma singleton connection imports
    - Correct module import paths and missing type declarations
    - Fix duplicate identifier issues in queue management services
    - _Requirements: Fix compilation errors for Redis/Prisma connections_

  - [x] 17.2 Fix type annotation and validation errors
    - Add explicit type annotations for implicit 'any' parameters
    - Fix missing required fields in Prisma model operations
    - Correct type mismatches and property access errors
    - _Requirements: Fix TypeScript type safety issues_

  - [x] 17.3 Fix service and utility type errors
    - Fix channel type exports and message formatting interfaces
    - Correct button deduplication and locale normalization types
    - Fix audit logger and metrics collection type issues
    - _Requirements: Fix service layer type consistency_

  - [ ] 17.4 Run TypeScript compilation check
    - Execute `npx tsc --noEmit` to verify all errors are resolved
    - Ensure no TypeScript compilation errors remain
    - Validate type safety across the entire codebase
    - _Requirements: Ensure clean TypeScript compilation_
