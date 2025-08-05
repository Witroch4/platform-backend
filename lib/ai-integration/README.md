# AI Integration Module

This module implements the Chatwit AI integration following the SocialWise pattern. It processes incoming messages via webhook, classifies intents using embeddings, generates dynamic responses via LLM, and returns structured messages to Chatwit.

## Directory Structure

```
lib/ai-integration/
├── types/                    # TypeScript interfaces
│   ├── webhook.ts           # Webhook payload types
│   ├── job-data.ts          # BullMQ job data types
│   ├── api-responses.ts     # API response types
│   ├── channels.ts          # Channel-specific types
│   ├── intent.ts            # Intent classification types
│   ├── llm.ts              # LLM and generation types
│   └── index.ts            # Type exports
├── schemas/                 # Zod validation schemas
│   ├── webhook.ts          # Webhook validation
│   ├── job-data.ts         # Job data validation
│   ├── channels.ts         # Channel validation
│   ├── intent.ts           # Intent validation
│   ├── llm.ts             # LLM validation
│   └── index.ts           # Schema exports
├── services/               # Business logic services
│   ├── webhook-handler.ts  # Webhook processing
│   ├── intent-classifier.ts # Intent classification
│   ├── llm-generator.ts    # Dynamic generation
│   ├── chatwit-client.ts   # Chatwit API client
│   ├── message-sanitizer.ts # Message sanitization
│   └── index.ts           # Service exports
├── workers/                # BullMQ workers
│   ├── ai-message-worker.ts # Main AI processing
│   ├── embedding-upsert-worker.ts # Embedding updates
│   └── index.ts           # Worker exports
├── utils/                  # Utility functions
│   ├── hmac-validator.ts   # HMAC validation
│   ├── rate-limiter.ts     # Rate limiting
│   ├── idempotency.ts      # Idempotency guards
│   ├── tracing.ts          # Distributed tracing
│   ├── metrics.ts          # Metrics collection
│   └── index.ts           # Utility exports
├── constants.ts            # Module constants
├── config.ts              # Configuration management
├── index.ts               # Main module exports
└── README.md              # This file
```

## Key Features

### Webhook Processing
- HMAC signature validation with timing-safe comparison
- Timestamp window validation (±5 minutes)
- Idempotency using Redis SETNX with TTL
- Multi-level rate limiting (conversation, account, contact)
- Fast-ack pattern (200ms response time)

### Intent Classification
- OpenAI embeddings with PGVector similarity search
- Configurable similarity thresholds per intent
- Comprehensive audit logging
- Fallback to dynamic generation

### Dynamic Generation
- OpenAI GPT-4o-mini with structured output
- Channel-specific schemas (WhatsApp/Instagram)
- Circuit breaker pattern for resilience
- Economic mode for cost control

### Message Delivery
- Channel-specific sanitization and validation
- Chatwit API integration with retry logic
- Content attributes formatting
- Human handoff fallback

## Configuration

Environment variables are loaded and validated using Zod schemas:

```bash
# Core
CHATWIT_BASE_URL=https://chatwit.example.com
CHATWIT_ACCESS_TOKEN=...
CHATWIT_WEBHOOK_SECRET=...

# AI
OPENAI_API_KEY=...
OPENAI_MODEL_EMBEDDING=text-embedding-3-small
OPENAI_MODEL_LLM=gpt-4o-mini
OPENAI_TIMEOUT_MS=10000

# Rate Limiting
RL_CONV=8/10s
RL_ACC=80/10s
RL_CONTACT=15/10s

# Cost Control
TOKENS_DIA_CONTA=100000
R_DIA_LIMITE=50.00
ECONOMIC_MODE_ENABLED=false

# Feature Flags
FF_INTENTS_ENABLED=true
FF_DYNAMIC_LLM_ENABLED=true
FF_INTERACTIVE_MESSAGES_ENABLED=true
```

## Usage

```typescript
import { 
  ChatwitWebhookPayload,
  AiMessageJobData,
  WhatsAppInteractiveSchema,
  loadAiIntegrationConfig 
} from '@/lib/ai-integration';

// Load configuration
const config = loadAiIntegrationConfig();

// Validate webhook payload
const payload = ChatwitWebhookPayloadSchema.parse(rawPayload);

// Create job data
const jobData: AiMessageJobData = {
  accountId: payload.account_id,
  conversationId: payload.conversation.id,
  messageId: payload.message.id.toString(),
  text: payload.message.content || '',
  contentAttributes: payload.message.content_attributes || {},
  channel: payload.channel,
  traceId: generateTraceId(),
  enqueuedAt: Date.now(),
};
```

## Requirements Compliance

This implementation satisfies requirements:
- **13.1**: Webhook payload validation with required fields
- **13.2**: Content attributes formatting with schema versioning

## Next Steps

The following components will be implemented in subsequent tasks:
1. Database schema and migrations (Task 2)
2. Redis guards and rate limiting (Task 3)
3. Webhook ingestion endpoint (Task 4)
4. BullMQ queues and workers (Task 5)
5. Intent classification system (Task 6)
6. Dynamic LLM generation (Task 7)
7. Message sanitization (Task 8)
8. Chatwit API integration (Task 9)