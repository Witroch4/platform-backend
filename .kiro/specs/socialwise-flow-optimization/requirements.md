# Requirements Document

## Introduction

The SocialWise Flow webhook route currently experiences severe latency issues (26+ seconds) due to inefficient LLM usage patterns. The system makes multiple redundant LLM calls, lacks proper timeout mechanisms, and doesn't leverage embeddings effectively for intent classification. This optimization will implement an intelligent LLM-first architecture with embedding acceleration, structured outputs, and proper deadline management to achieve sub-400ms response times.

## Requirements

### Requirement 1: Performance Optimization

**User Story:** As a webhook consumer, I want responses within 400ms so that real-time conversations remain fluid and responsive.

#### Acceptance Criteria

1. WHEN a webhook request is received THEN the system SHALL respond within 400ms for 95% of requests
2. WHEN embeddings are available THEN the system SHALL use them as the primary routing mechanism before falling back to LLM
3. WHEN LLM calls are made THEN the system SHALL implement abort controllers with strict deadlines
4. WHEN multiple LLM operations are needed THEN the system SHALL batch them into single calls where possible

### Requirement 2: Intelligent Conversational Routing

**User Story:** As a legal chatbot user, I want the system to understand my intent intelligently and provide contextual options when uncertain so that I get precise help without confusion.

#### Acceptance Criteria

1. WHEN embedipreview is true AND embedding similarity score is ≥ 0.80 THEN the system SHALL map directly to intent with optional LLM microcopy enhancement
2. WHEN embedipreview is true AND embedding similarity score is 0.65-0.79 THEN the system SHALL use "Aquecimento com Botões" LLM to generate contextual button options
3. WHEN embedipreview is true AND embedding similarity score is < 0.65 THEN the system SHALL use LLM to suggest the 3 most common legal topics for the office
4. WHEN embedipreview is false THEN the system SHALL use Router LLM with full conversational freedom to decide between intent classification and open chat

### Requirement 3: UX Writing and Contextual Button Generation

**User Story:** As a legal chatbot user, I want the system to present options in clear, actionable language that matches my specific situation so that I can quickly choose the right path.

#### Acceptance Criteria

1. WHEN in uncertainty zone (0.65-0.79) THEN the system SHALL generate contextual "Aquecimento com Botões" using specialized UX Writing prompts
2. WHEN generating buttons THEN the system SHALL create titles focused on user actions (≤ 4 words, ≤ 20 characters)
3. WHEN presenting options THEN the system SHALL include friendly introduction text that acknowledges the user's specific situation
4. WHEN LLM generates invalid responses THEN the system SHALL fall back to humanized deterministic options with proper legal context

### Requirement 4: Deadline and Abort Management

**User Story:** As a system operator, I want LLM calls to be abortable with real deadlines so that timeouts don't waste resources or block responses.

#### Acceptance Criteria

1. WHEN making any LLM call THEN the system SHALL implement AbortController with configurable deadlines
2. WHEN a deadline is reached THEN the system SHALL abort the request and return cached/deterministic fallback
3. WHEN LLM calls timeout THEN the system SHALL log the timeout and increment monitoring metrics
4. WHEN using abort mechanisms THEN the system SHALL prevent token consumption for cancelled requests

### Requirement 5: Channel-Specific Output Formatting

**User Story:** As an end user on WhatsApp or Instagram, I want properly formatted interactive messages that respect platform limits so that buttons and text display correctly.

#### Acceptance Criteria

1. WHEN generating WhatsApp responses THEN the system SHALL clamp button titles to 20 characters and IDs to 256 characters
2. WHEN generating Instagram responses THEN the system SHALL clamp text to 640 characters and payloads to 1000 characters
3. WHEN generating any interactive message THEN the system SHALL validate payload format against ^@[a-z0-9_]+$ regex
4. WHEN text exceeds limits THEN the system SHALL truncate intelligently at word boundaries

### Requirement 6: Batch Processing Optimization

**User Story:** As a system administrator, I want LLM calls to be batched efficiently so that multiple operations don't create unnecessary latency.

#### Acceptance Criteria

1. WHEN generating short titles THEN the system SHALL process all candidates in a single batch call
2. WHEN in SOFT similarity band THEN the system SHALL make exactly one ShortTitle call per request
3. WHEN processing multiple intents THEN the system SHALL avoid sequential LLM calls where possible
4. WHEN batching operations THEN the system SHALL maintain response quality while reducing call count

### Requirement 7: Monitoring and Observability

**User Story:** As a DevOps engineer, I want detailed metrics on LLM performance and routing decisions so that I can monitor system health and optimize further.

#### Acceptance Criteria

1. WHEN processing requests THEN the system SHALL log embedding_ms, llm_warmup_ms, and route_total_ms
2. WHEN classifying intents THEN the system SHALL track direct_map_rate, warmup_rate, and vague_rate
3. WHEN LLM calls fail THEN the system SHALL increment timeout, json_parse_fail, and abort_rate counters
4. WHEN responses are generated THEN the system SHALL sample output quality metrics without logging sensitive data

### Requirement 8: Configuration Management

**User Story:** As a system administrator, I want per-agent configuration of LLM behavior so that different assistants can have optimized settings.

#### Acceptance Criteria

1. WHEN configuring agents THEN the system SHALL support model, reasoning effort, verbosity, and deadline settings
2. WHEN agents are updated THEN the system SHALL apply new settings without requiring code deployment
3. WHEN using default settings THEN the system SHALL use minimal reasoning effort and low verbosity
4. WHEN embedipreview is configured THEN the system SHALL respect the setting for embedding vs LLM-first routing
###
 Requirement 9: Dynamic Legal Context Adaptation

**User Story:** As a legal professional, I want the chatbot to adapt its responses based on legal domain knowledge so that users receive contextually appropriate guidance.

#### Acceptance Criteria

1. WHEN user mentions legal terms (e.g., "ms", "detran", "voo atrasado") THEN the system SHALL recognize legal context and suggest relevant actions
2. WHEN generating fallback topics THEN the system SHALL suggest domain-specific legal areas (família, contratos, trânsito) rather than generic options
3. WHEN user intent is unclear THEN the system SHALL provide examples that match common legal scenarios for the office
4. WHEN presenting legal options THEN the system SHALL use professional but accessible language appropriate for clients

### Requirement 10: Conversational Mode Flexibility

**User Story:** As a user seeking legal help, I want the system to engage in natural conversation when needed so that complex situations can be explored before routing to specific services.

#### Acceptance Criteria

1. WHEN embedipreview is false THEN the system SHALL prioritize conversational engagement over immediate intent classification
2. WHEN in conversational mode THEN the system SHALL ask clarifying questions to better understand user needs
3. WHEN conversation provides clarity THEN the system SHALL transition smoothly to intent-based routing
4. WHEN user prefers open dialogue THEN the system SHALL maintain context while gradually guiding toward actionable outcomes