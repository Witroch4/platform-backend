# Implementation Plan

- [x] 1. Enhance OpenAI Service with Deadline Management and Structured Outputs
  - Implement `withDeadlineAbort` function with real AbortController for LLM calls
  - Add structured output methods: `generateShortTitlesBatch`, `generateWarmupButtons`, `routerLLM`
  - Update `responsesCall` to support abort signals and consistent input formatting
  - Ensure all LLM calls pass through `withDeadlineAbort` with 250ms default deadline
  - Write unit tests for abort mechanism and structured output validation
  - _Requirements: 4.1, 4.2, 4.3, 3.1, 3.2_

- [x] 2. Create Channel-Specific Response Formatting with Centralized Clamps
  - [x] 2.1 Implement centralized clamps and validation utilities
    - Create `clampTitle` (≤4 words, ≤20 chars), `clampBody` (≤1024 WA, ≤640 IG) functions
    - Add payload regex validation `^@[a-z0-9_]+$` and intent catalog existence check
    - Implement channel-specific limit enforcement to prevent provider retries
    - Write unit tests for all clamp functions and edge cases
    - _Requirements: 5.3, 5.4_

  - [x] 2.2 Implement WhatsApp interactive message formatting
    - Create `buildButtons` function for WhatsApp with strict limits (title ≤20, id ≤256, body ≤1024)
    - Implement interactive button structure with reply actions
    - Add graceful degradation to numbered text when formatting fails
    - Write unit tests for WhatsApp message format validation
    - _Requirements: 5.1, 5.3, 5.4_

  - [x] 2.3 Implement Instagram/Messenger button templates
    - Create Instagram button template formatting (text ≤640, payload ≤1000)
    - Implement postback button structure for Instagram
    - Add Facebook Messenger plain text fallback
    - Write unit tests for Instagram template validation and limits
    - _Requirements: 5.2, 5.3, 5.4_

- [x] 3. Create Intelligent Intent Classification System

- [ ] 3. Create Intelligent Intent Classification System
  - [x] 3.1 Implement embedding-first classification pipeline
    - Create `ClassificationResult` and `IntentCandidate` interfaces
    - Implement score band logic (HARD ≥0.80, SOFT 0.65-0.79, LOW <0.65)
    - Add embedding search with timeout and fallback mechanisms
    - Implement pre-warming embeddings per inbox and cache normalize(text)→intent
    - Write unit tests for score band classification and candidate selection
    - _Requirements: 2.1, 2.2, 2.3_

  - [x] 3.2 Implement Router LLM for embedipreview=false mode
    - Create `RouterDecision` interface and routing logic
    - Implement LLM-first decision making between intent and chat modes
    - Add structured output validation for router responses with strict JSON schema
    - Write unit tests for router decision logic and fallback handling
    - _Requirements: 2.4, 3.1, 3.2_

- [x] 4. Implement Performance Band Processing Logic
  - [x] 4.1 Create HARD band processing (≥0.80 score)

        - Implement direct intent mapping with optional microcopy enhancement
        - Add non-blocking LLM microcopy with structured output `{ text, buttons? }`
        - Defer microcopy to not block 200 response (quick w

    in for p95) - Ensure sub-120ms response time for direct mappings - Write performance tests for HARD band latency requirements - _Requirements: 1.1, 1.2, 2.1_

  - [x] 4.2 Create SOFT band processing (0.65-0.79 score)
    - Implement Aquecimento com Botões workflow with candidate intents
    - Add batch short title generation followed by warmup button LLM
    - Implement degradation strategy: skip ShortTitle if Warmup provides good titles
    - Ensure sub-300ms response time with proper deadline management
    - Write integration tests for SOFT band complete workflow
    - _Requirements: 1.1, 1.2, 2.2, 6.1, 6.2_

  - [x] 4.3 Create LOW band processing (<0.65 score)
    - Implement domain-specific legal topic suggestion
    - Add fallback to common legal areas when LLM fails
    - Ensure sub-200ms response time with deterministic fallbacks
    - Write unit tests for LOW band topic generation and fallbacks
    - _Requirements: 1.1, 1.2, 2.3, 9.3_

- [x] 5. Build UX Writing and Contextual Button Generation
  - [x] 5.1 Create Aquecimento com Botões system
    - Implement specialized legal domain UX Writing prompts with prompt versioning
    - Create warmup button generation with contextual candidate analysis
    - Add legal terminology recognition and action-focused button titles (≤4 words, ≤20 chars)
    - Implement prompt caching with stable content first
    - Write unit tests for button generation and legal context adaptation
    - _Requirements: 3.1, 3.2, 3.3, 9.1, 9.2_

  - [x] 5.2 Implement batch short title generation
    - Create batch processing for multiple intent candidates (single LLM call in SOFT band)
    - Optimize for single LLM call per request in SOFT band
    - Add humanization fallback for failed LLM title generation
    - Write unit tests for batch processing and fallback mechanisms
    - _Requirements: 6.1, 6.2, 6.3_

- [x] 6. Integrate Enhanced Processing into SocialWise Flow Route
  - [x] 6.1 Update webhook route with new classification pipeline
    - Replace existing LLM classification with intelligent band-based routing
    - Integrate embedding search with proper timeout handling
    - Add embedipreview configuration support per agent (default: true)
    - Implement proper error handling and fallback mechanisms

    - _Requirements: 1.1, 1.2, 1.3, 2.1, 2.2, 2.3, 2.4_

  - [x] 6.2 Add comprehensive monitoring and metrics collection
    - Implement performance metrics: embedding_ms, llm_warmup_ms, route_total_ms
    - Add classification rate tracking: direct_map_rate, warmup_rate, vague_rate
    - Create timeout and error rate monitoring: timeout_rate, json_parse_fail_rate, abort_rate
    - Write monitoring tests and metric validation
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

- [x] 7. Add Security and Anti-Replay for SocialWise Branch
  - [x] 7.1 Implement idempotency and rate limiting
    - Enable idempotency by wamid/message_data.id for SocialWise payloads
    - Apply existing rate-limit service to SocialWise branch
    - Add replay protection with nonce + TTL when bearer token is active
    - Write unit tests for duplicate detection and rate limiting
    - _Requirements: 4.2, 4.5_

  - [x] 7.2 Add payload validation and security
    - Implement Zod schema validation for SocialWise payload structure
    - Return 400 status for invalid payloads with proper error messages
    - Add input sanitization for user text and context data
    - Write security tests for malformed payload handling
    - _Requirements: 4.6, 4.8_

- [x] 8. Implement Hybrid Redis Caching Strategy
  - [x] 8.1 Create secure cache key namespacing system
    - Implement namespacing: `sw:{env}:acc{id}:inb{id}:agt{id}:ms:{model}:pv{version}:chan:{type}:ep:{bool}`
    - Add HMAC-SHA256 for user text in keys (never store PII in cache keys)
    - Create cache key builder with proper validation and TTL management
    - Write unit tests for key generation and collision prevention
    - _Requirements: 1.1, 1.2_

  - [x] 8.2 Implement classification and response caching
    - Cache classification results: `classify:{H(text)} → {top:[{slug,score,desc}], ts}` (TTL 10m)
    - Cache warmup buttons: `warmup:{H(text+candidates)} → {intro, buttons[]}` (TTL 10-15m)
    - Cache short titles: `stitle:{slug} → "Title"` (TTL 30d)
    - Cache microcopy HARD: `confirm:{H(text+intent)} → {text, buttons?}` (TTL 15-30m)
    - Cache embeddings: `emb:{H(text)} → {vecId|vector}` (TTL 24h)
    - Write cache hit/miss tests and TTL validation
    - _Requirements: 1.1, 1.2, 6.1, 6.2_

  - [x] 8.3 Add idempotency and anti-replay caching
    - Implement WAMID-based idempotency: `idem:{wamid} → 1` (TTL 24h)
    - Add nonce-based replay protection: `nonce:{nonce} → 1` (TTL 5m)
    - Create rate limiting cache integration with existing services
    - Write security tests for duplicate detection and replay prevention
    - _Requirements: 4.2, 4.5_

- [x] 9. Enhance Capitão Agent Configuration Management System
  - [x] 9.1 Enhance existing Capitão agent interface (app/admin/capitao/[id]/page.tsx)
    - Add SocialWise Flow optimization settings to existing Capitão agent configuration
    - Implement `embedipreview` toggle for embedding-first (fast mode) vs LLM-first (smart mode) routing (default: true)
    - Add model selection with family-specific configurations:
      - **GPT-5 Family**: gpt-5, gpt-5-mini, gpt-5-nano (default)
        - reasoning: { effort: "minimal" (default), "low", "medium", "high" }
        - verbosity: { "low" (default), "medium", "high" }
      - **GPT-4 Family**: gpt-4o-latest, gpt-4o-mini,gpt-4.1, gpt-4.1-nano
        - temperature: 0.7 (default), range 0-2
        - top_p: 0.7 (default), range 0-1
    - Create deadline configuration (warmupDeadlineMs, hardDeadlineMs, softDeadlineMs) per agent
    - Implement temperature settings for structured outputs (tempSchema) vs microcopy (tempCopy)
    - Add model-aware parameter validation (GPT-5 uses reasoning+verbosity, GPT-4 uses temperature+top_p)
    - _Requirements: 8.1, 8.2, 8.3, 8.4_

  - [x] 9.2 Integrate with Capitão intents management (app/admin/capitao/intents/page.tsx)
    - Connect intent catalog with embedding pre-warming system
    - Add intent performance metrics and classification accuracy tracking
    - Implement intent-specific configuration overrides
    - Add bulk intent operations for embedding regeneration
    - _Requirements: 8.1, 8.2_

  - [x] 9.3 Enhance Capitão inboxes management (app/admin/capitao/[id]/inboxes/page.tsx)
    - Add per-inbox SocialWise Flow configuration inheritance from agent
    - Implement inbox-specific performance metrics dashboard
    - Add cache isolation controls per inbox
    - Create inbox-level rollback and configuration history
    - _Requirements: 8.3, 8.4_

  - [x] 9.4 Add prompt versioning to Capitão system
    - Implement prompt ID/version tracking with dashboard integration in Capitão interface
    - Add A/B testing capabilities for different prompt versions
    - Create prompt performance analytics and quality metrics
    - Integrate with Redis cache namespacing for per-agent cache isolation
    - Write unit tests for configuration validation and default value handling
    - _Requirements: 8.1, 8.2, 8.3, 8.4_

- [x] 10. Implement Backpressure and Concurrency Controls (editou criou arquivo executar npx tsc --noEmit )
  - [x] 10.1 Add LLM concurrency limits per inbox (editou criou arquivo executar npx tsc --noEmit )
    - Implement cap on concurrent LLM calls per inbox
    - Degrade to deterministic fallback when limit exceeded in SOFT/LOW bands
    - Add short TTL queue for non-critical calls that don't block 200 response
    - Write load tests for concurrency limit effectiveness
    - _Requirements: 1.1, 1.4_

  - [x] 10.2 Implement graceful degradation strategies (editou criou arquivo executar npx tsc --noEmit )
    - Create fallback strategies for each failure point (embedding timeout, LLM timeout, JSON parse failure)
    - Add deterministic responses when LLM calls fail
    - Implement humanized title generation for failed short title calls
    - Write chaos testing for all degradation scenarios
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

- [x] 11. Create Quality Evaluation System (lib/cost/cost-worker.ts - Main worker implementation) (AO FINAL DA TASK editou criou arquivo executar npx tsc --noEmit DESCONSIDERAR TEST FILE )
  - [x] 11.1 Build PT-BR legal domain evaluation dataset (lib/cost/cost-worker.ts - Main worker implementation)
    - Create dataset of 200-500 Portuguese (pt-BR) legal examples for intent/UX evaluation
    - Define quality metrics: HARD ≥90% accuracy, SOFT ≥35% CTR, LOW ≥95% valid topics
    - Implement automated evaluation pipeline for model performance
    - Write evaluation tests and quality regression detection
    - _Requirements: 9.1, 9.2, 9.3, 9.4_

  - [x] 11.2 Add cost tracking per request (lib/cost/cost-worker.ts - Main worker implementation)
    - Implement cost calculation for embedding searches and LLM calls
    - Add budget controls and alerting for cost overruns
    - Create cost optimization recommendations based on usage patterns
    - Write cost analysis tests and budget validation
    - _Requirements: 7.1, 7.2_

- [x] 12. Create Comprehensive Testing Suite (AO FINAL DA TASK editou criou arquivo executar npx tsc --noEmit DESCONSIDERAR TEST FILE )
  - [x] 12.1 Write performance tests for latency requirements
    - Create tests for sub-400ms p95 response time requirement

    - Add specific band latency tests (HARD <120ms, SOFT <300ms, LOW <200ms)
    - Implement abort mechanism effectiveness testing
    - Create load testing scenarios for concurrent request handling
    - _Requirements: 1.1, 4.1, 4.2, 4.3_

  - [x] 12.2 Write integration tests for complete workflow
    - Create end-to-end tests for each processing band (HARD, SOFT, LOW, ROUTER)
    - Add channel-specific response format validation
    - Implement error scenario testing with proper fallback verification
    - Create agent configuration testing with different embedipreview settings
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 8.1, 8.2, 8.3, 8.4_

- [x] 13. Replace Legacy Flow with Optimized Implementation (NAO MEXER NA ROTA app\api\admin\mtf-diamante\dialogflow\webhook\route.ts É outra logica de filas e workes pra outra finalidade que nao tem na aver com o fluxo atual) (AO FINAL DA TASK editou criou arquivo executar npx tsc --noEmit DESCONSIDERAR TEST FILE )
  - [x] 13.1 Create monitoring dashboard and alerting
    - Implement real-time performance metrics collection
    - Add alerting for latency SLA violations and error rate spikes
    - Create quality sampling for generated content without sensitive data logging

    - Set up automated health checks for embedding index and LLM availability
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

  - [x] 13.2 Replace webhook route with optimized flow only
    - Completely replace existing logic in app/api/integrations/webhooks/socialwiseflow/route.ts
    - Integrate all performance band processors (HARD, SOFT, LOW) as the single flow
    - Remove any legacy flow code and implement only the optimized path
    - Ensure immediate activation of optimized flow for all requests from deployment
    - Add comprehensive error handling and monitoring for the new unified flow
    - _Requirements: 8.1, 8.2, 8.3, 8.4_
