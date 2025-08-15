# Project Structure

## Root Directory Organization

```
/
├── app/                    # Next.js App Router (main application)
├── components/             # Reusable React components
├── lib/                   # Core libraries and utilities
├── worker/                # Background job processors
├── scripts/               # Database and deployment scripts
├── prisma/                # Database schema and migrations
├── types/                 # TypeScript type definitions
├── hooks/                 # Custom React hooks
├── public/                # Static assets
├── docs/                  # Documentation
└── __tests__/             # Test files
```

## App Directory Structure (Next.js App Router)

```
app/
├── api/                   # API routes
│   ├── admin/            # Admin-only endpoints
│   ├── chatwitia/        # AI chat endpoints
│   ├── integrations/     # Third-party integrations
│   │   └── webhooks/     # Webhook endpoints
│   │       └── socialwiseflow/ # SocialWise Flow webhook
│   │           └── route.ts    # Main webhook processor
│   └── [feature]/        # Feature-specific APIs
├── admin/                # Admin dashboard pages
│   ├── capitao/          # IA Capitão - AI Assistant Management
│   ├── ai-integration/   # AI Integration Management
│   ├── mtf-diamante/     # MTF Diamante - Advanced Messaging
│   ├── queue-management/ # Queue Management System
│   ├── monitoring/       # System Monitoring
│   ├── leads/            # Lead Management
│   ├── leads-chatwit/    # Chatwit Lead Integration
│   ├── credentials/      # Credential Management
│   ├── notifications/    # Notification System
│   ├── disparo-em-massa/ # Bulk Message Dispatch
│   ├── disparo-oab/      # OAB Message Dispatch
│   └── users/            # User Management
├── [accountid]/          # Dynamic account routes
│   └── dashboard/        # User dashboard
├── auth/                 # Authentication pages
├── components/           # App-specific components
├── globals.css           # Global styles
└── layout.tsx           # Root layout
```

## Admin Dashboard Structure

### IA Capitão (AI Captain)
```
app/admin/capitao/
├── page.tsx              # Main AI Captain dashboard
├── intents/              # Intent management
│   └── page.tsx         # Intent configuration
├── faqs/                 # FAQ management
│   └── page.tsx         # FAQ configuration
├── documentos/           # Document management
│   └── page.tsx         # Document configuration
└── [id]/                 # Dynamic intent/document pages
```

### AI Integration Management
```
app/admin/ai-integration/
├── page.tsx              # AI Integration overview
├── queues/               # Queue management
│   ├── page.tsx         # Queue monitoring
│   └── components/      # Queue-specific components
└── intents/              # Intent management
    ├── page.tsx         # Intent configuration
    └── components/      # Intent-specific components
```

### MTF Diamante (Advanced Messaging)
```
app/admin/mtf-diamante/
├── page.tsx              # Main MTF Diamante dashboard
├── inbox/                # Message inbox
├── templates/            # Template management
├── test-preview/         # Template testing
├── hooks/                # Custom hooks
├── context/              # React context providers
└── components/           # MTF Diamante components
    ├── MapeamentoTab.tsx           # Mapping configuration
    ├── DialogflowCaixasAgentes.tsx # Dialogflow agent boxes
    ├── MensagensInterativasTab.tsx # Interactive messages
    ├── ConfiguracoesLoteTab.tsx    # Batch configuration
    ├── TemplateLibraryTab.tsx      # Template library
    ├── CacheMonitoringDashboard.tsx # Cache monitoring
    ├── TemplateDetailsComponent.tsx # Template details
    ├── TemplatesTab/               # Template management
    │   ├── index.tsx              # Main template page
    │   ├── criar/                 # Template creation
    │   ├── [id]/                  # Template editing
    │   └── components/            # Template components
    │       ├── send-progress-dialog.tsx    # Send progress
    │       ├── leads-selector-dialog.tsx   # Lead selection
    │       ├── template-preview.tsx        # Template preview
    │       └── template-preview-demo.tsx   # Demo preview
    └── shared/                    # Shared components
```

## Library Organization

```
lib/
├── ai-integration/       # AI service integrations
│   ├── services/         # AI services
│   │   ├── openai-client.ts           # OpenAI integration
│   │   ├── chatwit-api-client.ts      # Chatwit API client
│   │   ├── intent-classifier.ts       # Intent classification
│   │   ├── similarity-search.ts       # Similarity search
│   │   ├── template-registry.ts       # Template management
│   │   ├── conversation-context.ts    # Conversation context
│   │   ├── message-formatter.ts       # Message formatting
│   │   ├── audit-logger.ts            # Audit logging
│   │   ├── cost-tracker.ts            # Cost tracking
│   │   ├── budget-guard.ts            # Budget management
│   │   ├── rate-limiter.ts            # Rate limiting
│   │   ├── access-control.ts          # Access control
│   │   ├── safety-guards.ts           # Safety measures
│   │   ├── human-handoff.ts           # Human handoff
│   │   ├── lgpd-minimization.ts       # LGPD compliance
│   │   ├── dynamic-generation.ts      # Dynamic content
│   │   ├── button-router.ts           # Button routing
│   │   ├── payload-router.ts          # Payload routing
│   │   ├── hmac-auth.ts               # HMAC authentication
│   │   ├── payload-normalizer.ts      # Payload normalization
│   │   ├── idempotency.ts             # Idempotency service
│   │   ├── feature-flag-service.ts    # Feature flags
│   │   ├── feature-flag-manager.ts    # Feature flag management
│   │   ├── economic-mode.ts           # Economic mode
│   │   ├── data-retention.ts          # Data retention
│   │   ├── secret-rotation.ts         # Secret rotation
│   │   ├── sanitization.ts            # Input sanitization
│   │   ├── chatwit-error-handler.ts   # Error handling
│   │   ├── config-validation.ts       # Configuration validation
│   │   ├── hmac-validation.ts         # HMAC validation
│   │   ├── retry-classifier.ts        # Retry logic
│   │   ├── typing-indicators.ts       # Typing indicators
│   │   ├── chatwit-integration.ts     # Chatwit integration
│   │   ├── domain-allowlist.ts        # Domain allowlist
│   │   ├── small-talk-cache.ts        # Small talk caching
│   │   └── [other-services].ts        # Additional services
│   ├── types/            # AI integration types
│   ├── jobs/             # Background jobs
│   ├── bootstrap/        # Initialization
│   ├── middleware/       # Middleware
│   ├── utils/            # Utilities
│   ├── docs/             # Documentation
│   ├── schemas/          # Data schemas
│   ├── workers/          # Worker processes
│   ├── queues/           # Queue management
│   ├── config.ts         # Configuration
│   ├── constants.ts      # Constants
│   └── index.ts          # Main exports
├── socialwise-flow/      # SocialWise Flow Processing System
│   ├── processor.ts              # Main flow processor
│   ├── classification.ts         # Intent classification
│   ├── channel-formatting.ts     # Channel-specific formatting
│   ├── performance-bands.ts      # Performance band processing
│   ├── cache-manager.ts          # Cache management
│   ├── cache-key-builder.ts      # Cache key generation
│   ├── metrics.ts                # Performance metrics
│   ├── ux-writing.ts             # UX writing service
│   ├── ux-writing-service.ts     # UX writing implementation
│   ├── clamps.ts                 # Content clamps
│   ├── services/                 # SocialWise services
│   │   ├── rate-limiter.ts       # Rate limiting
│   │   ├── replay-protection.ts  # Replay protection
│   │   └── idempotency.ts        # Idempotency
│   ├── schemas/                  # Data schemas
│   │   └── payload.ts            # Payload validation
│   └── index.ts                  # Main exports
├── socialwise/           # Socialwise integration
│   ├── templates.ts      # Template management
│   ├── classification.ts # Content classification
│   ├── instagram-formatter.ts # Instagram formatting
│   ├── whatsapp-formatter.ts  # WhatsApp formatting
│   ├── intent-catalog.ts # Intent catalog
│   ├── clamps.ts         # Content clamps
│   ├── intent.ts         # Intent management
│   └── assistant.ts      # Assistant configuration
├── cost/                 # Cost Management System
│   ├── cost-worker.ts              # Main cost processing worker
│   ├── cost-monitor.ts             # Real-time cost monitoring
│   ├── budget-monitor.ts           # Budget tracking and alerts
│   ├── budget-system.ts            # Budget management system
│   ├── budget-controls.ts          # Budget control mechanisms
│   ├── budget-guard.ts             # Budget protection
│   ├── pricing-service.ts          # Dynamic pricing resolution
│   ├── fx-rate-service.ts          # Foreign exchange rates
│   ├── fx-rate-worker.ts           # FX rate processing worker
│   ├── audit-logger.ts             # Cost audit logging
│   ├── notification-service.ts     # Cost notifications
│   ├── error-handler.ts            # Error handling and recovery
│   ├── idempotency-service.ts      # Event deduplication
│   ├── queue-config.ts             # Cost queue configuration
│   ├── openai-wrapper.ts           # OpenAI cost tracking
│   ├── whatsapp-wrapper.ts         # WhatsApp cost tracking
│   └── index.ts                    # Cost system exports
├── monitoring/           # System Monitoring & Observability
│   ├── application-performance-monitor.ts # APM with metrics collection
│   ├── queue-monitor.ts            # Queue health monitoring
│   ├── database-monitor.ts         # Database performance monitoring
│   ├── instagram-translation-monitor.ts # Instagram-specific monitoring
│   ├── instagram-error-tracker.ts  # Instagram error tracking
│   ├── production-monitor.ts       # Production environment monitoring
│   ├── disaster-recovery.ts        # Disaster recovery procedures
│   ├── init-monitoring.ts          # Monitoring initialization
│   ├── init-production-monitoring.ts # Production monitoring setup
│   └── instagram-translation-monitoring.md # Documentation
├── queue/                # Queue Definitions & Configuration
│   ├── resposta-rapida.queue.ts        # Quick response queue
│   ├── leads-chatwit.queue.ts          # Chatwit leads queue
│   ├── mtf-diamante-webhook.queue.ts   # MTF Diamante webhooks
│   ├── manuscrito.queue.ts             # Manuscript processing
│   ├── persistencia-credenciais.queue.ts # Credential persistence
│   ├── instagram-translation.queue.ts  # Instagram translation
│   ├── leadcells.queue.ts              # Lead cells processing
│   ├── agendamento.queue.ts            # Scheduling queue
│   └── instagram-webhook.queue.ts      # Instagram webhooks
├── queue-management/     # Advanced Queue Management System
│   ├── services/         # Queue management services
│   │   ├── queue-manager.service.ts    # Main queue management
│   │   ├── metrics-manager.service.ts  # Metrics collection
│   │   ├── metrics-collector.service.ts # Real-time metrics
│   │   ├── metrics-aggregator.service.ts # Metrics aggregation
│   │   ├── metrics-storage.service.ts  # Metrics persistence
│   │   ├── flow-analyzer.service.ts    # Queue flow analysis
│   │   ├── anomaly-detector.service.ts # Anomaly detection
│   │   ├── alert-engine.service.ts     # Alert generation
│   │   ├── notification.service.ts     # Notification system
│   │   ├── permission-manager.service.ts # Access control
│   │   ├── flow-control.service.ts     # Flow control
│   │   ├── batch-operation.service.ts  # Batch operations
│   │   └── QueueConfigManager.ts       # Configuration management
│   ├── auth/              # Authentication for queue management
│   ├── audit/             # Audit logging
│   ├── cache/             # Caching mechanisms
│   ├── config/            # Configuration management
│   ├── types/             # Type definitions
│   ├── schemas/           # Data schemas
│   ├── validation/        # Input validation
│   ├── utils/             # Utility functions
│   ├── seeds/             # Seed data
│   ├── websocket-manager.ts # Real-time updates
│   ├── config.ts          # Main configuration
│   ├── constants.ts       # System constants
│   ├── errors.ts          # Error definitions
│   └── index.ts           # Main exports
├── auth/                # Authentication utilities
├── cache/               # Caching mechanisms
├── webhook/             # Webhook processing
├── whatsapp/            # WhatsApp API integration
├── instagram/           # Instagram API integration
├── connections.ts       # Database connections
├── redis.ts            # Redis configuration
└── utils.ts            # General utilities
```

## Component Structure

```
components/
├── ui/                  # Base UI components (Shadcn/UI)
├── admin/              # Admin-specific components
├── auth/               # Authentication components
├── chatwitia/          # AI chat components
├── custom/             # Custom business components
├── icons/              # Icon components
├── providers/          # React context providers
└── [feature]/          # Feature-specific components
```

## Worker Architecture

```
worker/
├── webhook.worker.ts           # Main webhook processor (Parent Worker)
├── automacao.worker.ts         # Automation worker
├── ai-integration.worker.ts    # AI processing worker
├── processors/                 # Individual job processors
│   ├── intent.processor.ts     # Intent processing
│   └── button.processor.ts     # Button interaction processing
├── WebhookWorkerTasks/        # Webhook-specific tasks
│   ├── instagram-translation.task.ts    # Instagram translation
│   ├── respostaRapida.worker.task.ts    # Quick response processing
│   ├── leads-chatwit.task.ts            # Chatwit leads
│   ├── leadcells.task.ts                # Lead cells processing
│   ├── agendamento.task.ts              # Scheduling tasks
│   └── persistencia.worker.task.ts      # Credential persistence
├── services/                  # Worker services
│   └── whatsapp.service.ts    # WhatsApp integration
├── types/                     # Worker types
├── queues/                    # Queue definitions
│   └── followUpQueue.ts       # Follow-up queue
├── config/                    # Worker configuration
└── automacao/                 # Automation tasks
```

## SocialWise Flow Processing Chain

### Webhook Entry Point
```
app/api/integrations/webhooks/socialwiseflow/route.ts
├── Authentication & Security
│   ├── Bearer token validation (optional)
│   ├── HMAC validation (legacy)
│   └── Replay protection
├── Payload Processing
│   ├── Size validation (max 256KB)
│   ├── JSON parsing
│   ├── Schema validation
│   └── Sanitization
├── Idempotency & Rate Limiting
│   ├── Duplicate detection
│   ├── Rate limit checks
│   └── Replay protection
└── Flow Routing
    ├── SocialWise Flow contract (new)
    └── Legacy Chatwit contract
```

### SocialWise Flow Processing Pipeline
```
lib/socialwise-flow/processor.ts
├── Input Processing
│   ├── Context extraction
│   ├── Channel type detection
│   └── User text sanitization
├── Classification Engine
│   ├── Embedding generation
│   ├── Intent classification
│   └── Performance band assignment
├── Band-Based Processing
│   ├── HARD band (≥0.80): Direct mapping
│   ├── SOFT band (0.65-0.79): Warmup buttons
│   ├── LOW band (0.50-0.64): Domain topics
│   └── ROUTER band (<0.50): LLM routing
└── Response Generation
    ├── Channel-specific formatting
    ├── Template mapping
    └── Fallback handling
```

### Performance Bands System
```
lib/socialwise-flow/performance-bands.ts
├── HARD Band Processor (≥0.80 score)
│   ├── Direct intent mapping
│   ├── Microcopy enhancement (non-blocking)
│   └── Target: <120ms response time
├── SOFT Band Processor (0.65-0.79 score)
│   ├── Warmup buttons workflow
│   ├── Candidate intent presentation
│   └── LLM warmup for engagement
├── LOW Band Processor (0.50-0.64 score)
│   ├── Domain topic presentation
│   ├── Educational content
│   └── Intent discovery
└── ROUTER Band Processor (<0.50 score)
    ├── LLM-based classification
    ├── Context-aware routing
    └── Human handoff detection
```

### Classification System
```
lib/socialwise-flow/classification.ts
├── Embedding Generation
│   ├── OpenAI text-embedding-3-small
│   ├── Vector similarity search
│   └── Intent candidate ranking
├── Performance Metrics
│   ├── Embedding generation time
│   ├── Classification accuracy
│   └── Response time tracking
└── Fallback Strategies
    ├── Keyword-based matching
    ├── Template-based responses
    └── Human handoff triggers
```

### Cache Management System
```
lib/socialwise-flow/cache-manager.ts
├── Cache Key Builder
│   ├── Secure namespacing
│   ├── TTL management
│   └── Key invalidation
├── Cache Types
│   ├── Classification results
│   ├── Warmup buttons
│   ├── Microcopy responses
│   └── Embedding vectors
├── Cache Health Monitoring
│   ├── Hit/miss rates
│   ├── Latency tracking
│   └── Error rate monitoring
└── Cache Operations
    ├── Get with fallback
    ├── Set with TTL
    ├── Batch operations
    └── Cleanup routines
```

### Channel Formatting System
```
lib/socialwise-flow/channel-formatting.ts
├── WhatsApp Formatting
│   ├── Interactive messages
│   ├── Button constraints (3 max)
│   ├── Text length limits
│   └── Payload validation
├── Instagram Formatting
│   ├── Template messages
│   ├── Postback buttons
│   ├── Quick replies
│   └── Media attachments
├── Facebook Formatting
│   ├── Messenger API
│   ├── Text messages
│   └── Rich media
└── Content Clamps
    ├── Title length limits
    ├── Body text limits
    ├── Payload sanitization
    └── Character encoding
```

### Security & Validation Services
```
lib/socialwise-flow/services/
├── Rate Limiter
│   ├── Per-session limits
│   ├── Per-account limits
│   ├── Burst protection
│   └── Rate limit headers
├── Replay Protection
│   ├── Nonce validation
│   ├── Timestamp checking
│   └── Duplicate prevention
└── Idempotency
    ├── Message deduplication
    ├── Session tracking
    └── State management
```

## Webhook Processing Flow

### Entry Point Processing
1. **Authentication**: Bearer token or HMAC validation
2. **Payload Validation**: Size, format, and schema validation
3. **Security Checks**: Replay protection and rate limiting
4. **Idempotency**: Duplicate message detection
5. **Context Extraction**: Channel, inbox, and user information

### SocialWise Flow Contract (New)
```
Input → Validation → Classification → Band Processing → Response Generation → Output
```

### Legacy Chatwit Contract
```
Input → HMAC Validation → Payload Normalization → Queue Processing → Response
```

### Response Generation Pipeline
1. **Intent Classification**: Embedding-based or LLM-based
2. **Template Mapping**: Direct intent to response mapping
3. **Channel Formatting**: Platform-specific message formatting
4. **Content Clamping**: Length and format validation
5. **Response Assembly**: Final response structure

### Error Handling & Fallbacks
- **Classification Failures**: Fallback to keyword matching
- **Template Missing**: Default channel responses
- **Rate Limiting**: Throttled responses with headers
- **System Errors**: Graceful degradation with logging

## Cost Management System

### Core Components
- **Cost Worker**: Main processing worker for cost events
- **Cost Monitor**: Real-time cost tracking and monitoring
- **Budget System**: Budget allocation and management
- **Pricing Service**: Dynamic pricing resolution with caching
- **FX Rate Service**: Foreign exchange rate management

### Cost Processing Flow
```
Cost Event → Idempotency Check → Price Resolution → Cost Calculation → Database Storage → Audit Logging
```

### Budget Controls
- **Budget Monitor**: Real-time budget tracking
- **Budget Guard**: Prevents overspending
- **Budget Controls**: Granular budget management
- **Notification Service**: Cost alerts and notifications

### Cost Tracking by Provider
- **OpenAI Wrapper**: Tracks OpenAI API usage costs
- **WhatsApp Wrapper**: Tracks WhatsApp Business API costs
- **FX Rate Worker**: Processes exchange rate updates

## Monitoring & Observability System

### Application Performance Monitor (APM)
- **Real-time Metrics**: Webhook, worker, database, and cache metrics
- **Performance Tracking**: Response times, throughput, error rates
- **Alert System**: Configurable thresholds and notifications
- **Historical Data**: Metrics retention and analysis

### Queue Monitoring
- **Queue Health**: Waiting, active, completed, failed job counts
- **Performance Stats**: Throughput, processing times, success rates
- **Anomaly Detection**: Automatic detection of queue issues
- **Alert Thresholds**: Configurable monitoring thresholds

### Database Monitoring
- **Query Performance**: Execution times and optimization
- **Connection Pooling**: Connection health and utilization
- **Error Tracking**: Database error monitoring and alerting

### Instagram-Specific Monitoring
- **Translation Monitoring**: Instagram translation performance
- **Error Tracking**: Instagram-specific error handling
- **Performance Metrics**: Instagram API response times

## Queue Management System

### Core Services
- **Queue Manager**: Central queue management and orchestration
- **Metrics Manager**: Comprehensive metrics collection
- **Flow Analyzer**: Queue flow analysis and optimization
- **Anomaly Detector**: Automatic anomaly detection
- **Alert Engine**: Intelligent alert generation

### Advanced Features
- **Flow Control**: Dynamic queue flow management
- **Batch Operations**: Efficient batch processing
- **Permission Management**: Role-based access control
- **WebSocket Manager**: Real-time updates and notifications

### Queue Types
- **High Priority**: User-facing operations (resposta-rapida)
- **Low Priority**: Background tasks (persistencia-credenciais)
- **Cost Events**: Cost tracking and billing
- **Instagram Translation**: Content translation processing
- **Lead Processing**: Lead management and routing

## AI Integration Architecture

### Core Services
- **OpenAI Client**: Handles OpenAI API interactions
- **Chatwit API Client**: Manages Chatwit platform integration
- **Intent Classifier**: Classifies user intents using AI
- **Similarity Search**: Finds similar content using embeddings
- **Template Registry**: Manages message templates
- **Conversation Context**: Maintains conversation state
- **Message Formatter**: Formats messages for different platforms

### Safety & Compliance
- **Safety Guards**: Content safety checks
- **LGPD Minimization**: Data privacy compliance
- **Access Control**: User permission management
- **Audit Logger**: Activity logging and monitoring
- **Budget Guard**: Cost control and monitoring

### Performance & Reliability
- **Rate Limiter**: API rate limiting
- **Cost Tracker**: Usage cost monitoring
- **Retry Classifier**: Intelligent retry logic
- **Cache Management**: Response caching
- **Human Handoff**: Fallback to human agents

### Content Management
- **Dynamic Generation**: Dynamic content creation
- **Button Router**: Interactive button handling
- **Payload Router**: Message payload routing
- **Template Registry**: Template management system

## Key Conventions

### General Rules
- All new code must be written in TypeScript.
- Use Brazilian Portuguese for user-facing text while keeping variable, function and file names in English.
- Prefer optimistic UI updates.
- Use Shadcn/UI `Dialog` components instead of the browser's native `confirm()` or `alert()` dialogs.

### File Naming
- **Components**: PascalCase (e.g., `UserProfile.tsx`)
- **Pages**: kebab-case (e.g., `user-settings/page.tsx`)
- **Utilities**: camelCase (e.g., `formatDate.ts`)
- **Types**: PascalCase with `.ts` extension
- **API Routes**: `route.ts` for App Router endpoints

### Import Patterns
- Use `@/` alias for root-level imports
- Group imports: external libraries, internal modules, relative imports
- Prefer named exports over default exports for utilities

### Directory Patterns
- **Feature-based**: Group related files by feature/domain
- **Layered**: Separate concerns (components, services, types)
- **Co-location**: Keep related files close (tests, types, components)

### Database Patterns
- **Prisma Schema**: Single source of truth in `prisma/schema.prisma`
- **Migrations**: Versioned in `prisma/migrations/`
- **Seeds**: Development data in `prisma/seed.ts`
- **Connections**: Singleton pattern in `lib/connections.ts`

### API Route Structure
```
app/api/[feature]/
├── route.ts              # GET, POST for collection
├── [id]/
│   └── route.ts         # GET, PUT, DELETE for item
└── [id]/[action]/
    └── route.ts         # Custom actions
```

### API Route Conventions
- Route `params` are Promises in Next.js 15 and must be awaited.
- Protected endpoints should obtain the session with `const session = await auth();` and verify `session?.user?.id`, returning `NextResponse.json({ error: "Usuário não autenticado." }, { status: 401 })` when absent.

### Testing Structure
```
__tests__/
├── unit/                # Unit tests
├── integration/         # Integration tests
├── e2e/                # End-to-end tests
├── contracts/          # API contract tests
├── setup/              # Test configuration
└── __mocks__/          # Mock implementations
```

## Environment Configuration

- **Development**: `.env.development`
- **Production**: `.env.production`
- **Local**: `.env.local` (gitignored)
- **Docker**: `.env.docker.example`

## Build Artifacts

- **Next.js**: `.next/` directory
- **Workers**: `dist/worker/` compiled TypeScript
- **Coverage**: `coverage/` test coverage reports
- **Backups**: `backups/` database backups

## AI Integration Features

### IA Capitão (AI Captain)
- **Intent Management**: Configure and manage AI intents
- **FAQ Management**: Manage frequently asked questions
- **Document Management**: Handle document processing
- **Dynamic Routing**: Route queries to appropriate handlers

### MTF Diamante
- **Template Library**: Advanced template management
- **Interactive Messages**: Create interactive message flows
- **Batch Processing**: Handle bulk message operations
- **Cache Monitoring**: Monitor system performance
- **Lead Management**: Integrated lead handling

### Socialwise Integration
- **Multi-platform Support**: WhatsApp, Instagram, and more
- **Content Classification**: Intelligent content categorization
- **Template System**: Platform-specific templates
- **Intent Catalog**: Predefined intent management

## Monitoring & Cost Management Features

### Real-time Monitoring
- **Queue Health**: Monitor all queue states and performance
- **Application Performance**: Track response times and throughput
- **Database Performance**: Monitor query performance and connections
- **Cost Tracking**: Real-time cost monitoring and alerts

### Cost Management
- **Budget Controls**: Prevent overspending with budget guards
- **Dynamic Pricing**: Resolve pricing with caching and fallbacks
- **FX Rate Management**: Handle foreign exchange rates
- **Audit Logging**: Comprehensive cost audit trails

### Alert System
- **Performance Alerts**: Configurable thresholds for performance metrics
- **Cost Alerts**: Budget threshold notifications
- **Error Alerts**: Automatic error detection and notification
- **Anomaly Detection**: Intelligent anomaly detection and alerting

## SocialWise Flow Features

### Intelligent Classification
- **Embedding-Based**: Fast similarity search using OpenAI embeddings
- **Performance Bands**: Dynamic response strategies based on confidence
- **Fallback Strategies**: Graceful degradation when classification fails
- **Multi-Modal**: Support for text, buttons, and interactive elements

### Channel-Specific Processing
- **WhatsApp**: Interactive messages with button constraints
- **Instagram**: Template messages and postback buttons
- **Facebook**: Messenger API integration
- **Universal**: Fallback text responses

### Performance Optimization
- **Caching Strategy**: Multi-level caching for responses and embeddings
- **Response Time Targets**: <120ms for HARD band, <500ms for others
- **Non-blocking Enhancement**: Microcopy enhancement without blocking responses
- **Resource Management**: Efficient memory and CPU usage

### Security & Compliance
- **Input Sanitization**: XSS and injection protection
- **Rate Limiting**: Per-session and per-account limits
- **Replay Protection**: Nonce-based duplicate prevention
- **Audit Logging**: Comprehensive activity tracking
