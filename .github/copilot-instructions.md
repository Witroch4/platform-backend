## 🚀 Project Overview

**Socialwise Chatwit** is a comprehensive AI-powered customer service platform specializing in social media automation and legal support for lawyers. Built with Next.js 15, TypeScript, and Prisma, this full-stack application integrates OpenAI APIs (GPT-5, GPT-5-mini, GPT-5-nano, GPT-4.1-nano, DALL-E, Whisper), Instagram/WhatsApp Business APIs, and provides advanced document processing capabilities.

### Target Audience
- **Lawyers**: Complete client management, automated proof correction, legal specialization support
- **Businesses**: 24/7 automated customer service, lead generation, sales automation
- **Agencies**: Multi-client management, white-label solutions, scalable automation

### Value Propositions
- AI-powered automation reducing manual work by 80%
- Specialized legal document processing and analysis
- Multi-platform social media management
- Real-time monitoring and analytics
- Scalable architecture supporting thousands of simultaneous interactions

## 💻 Technology Stack

### Core Technologies
- **Frontend**: Next.js 15+ (App Router), React 18+, TypeScript
- **Backend**: Node.js with Next.js API routes, Express.js, Prisma ORM
- **Database**: PostgreSQL 17 with pgvector extension
- **Cache/Queue**: Redis 7+ with BullMQ for job processing
- **UI Framework**: Tailwind CSS, Shadcn/UI components, Framer Motion
- **Authentication**: NextAuth.js v5 with Prisma adapter
- **File Storage**: MinIO (S3-compatible) for document management

### AI & External Integrations
- **AI Services**: OpenAI (GPT-5, DALL-E, Whisper), Anthropic Claude
- **Social Media**: Instagram Graph API, WhatsApp Business API
- **Payments**: Stripe for subscriptions and billing
- **Email**: Resend for transactional emails
- **Monitoring**: Prometheus metrics, Grafana dashboards

### Development Tools
- **Code Quality**: Biome (linting/formatting), TypeScript strict mode
- **Testing**: Jest with React Testing Library, Supertest for API testing
- **Build**: Next.js build system, Docker multi-stage builds
- **Package Manager**: npm with lock file

## 📋 Critical Development Rules

### Mandatory Rules
```typescript
// 1. ALWAYS run after any file edit or creation
npx tsc --noEmit

// 2. All new code MUST be TypeScript
// 3. User-facing strings in Brazilian Portuguese
// 4. Identifiers (variables, functions, files) in English
// 5. You are already in the project root directory
// 6. Use PowerShell commands on Windows
```

### Authentication Pattern (NextAuth.js v5)
```typescript
// REQUIRED pattern for protected routes
import { auth } from "@/auth";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { error: "Usuário não autenticado." },
      { status: 401 }
    );
  }
  // ... rest of logic
}
```

### Dynamic Routes (Next.js 15)
```typescript
// IMPORTANT: params is a Promise in Next.js 15
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ accountid: string }> }
): Promise<NextResponse> {
  const { accountid } = await params; // AWAIT is mandatory
  // ...
}
```

### Database Operations (Prisma)
```typescript
// All database interactions through Prisma ORM
import { getPrismaInstance } from '@/lib/connections';
import { Prisma } from '@prisma/client';

// To set JSON field as null
await prisma.someModel.update({
  where: { id: 1 },
  data: {
    someJsonField: Prisma.JsonNull, // Use Prisma.JsonNull
  },
});
```

### UI/UX Standards

* **Optimistic updates**

  * Atualize o estado da UI **antes** da resposta da API e reverta só em caso de erro.
  * Prefira `startTransition` (UI local) e/ou React Query/Server Actions para conciliar cache e rollback.
  * Combine com `toast.promise` para feedback transparente da operação. ([strapi.io][1], [Medium][2])

* **Toasts (sonner)**

  * Use **sonner** (o toast do shadcn foi **depreciado**). Renderize `<Toaster />` no layout raiz e chame `toast` em clientes.
  * Para chamadas de API, padronize **`toast.promise`** (loading → success/error).

  ```tsx
  // app/layout.tsx
  import { Toaster } from "sonner";
  export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
      <html lang="pt-BR">
        <body>
          {children}
          <Toaster richColors closeButton />
        </body>
      </html>
    );
  }
  ```
  ```tsx
  "use client";
  import { toast } from "sonner";

  async function save(data: FormData) {
    // sua chamada de API/Server Action aqui
  }

  export function SaveButton() {
    const onClick = () => {
      const promise = save(new FormData());
      toast.promise(promise, {
        loading: "Salvando...",
        success: (result) => `Salvo com sucesso`,
        error: (err) => err?.message ?? "Erro ao salvar",
      });
    };
    return <button onClick={onClick}>Salvar</button>;
  }
  ```

* **Dialogs**

  * Use **`Dialog`** para modais gerais e **`AlertDialog`** para ações destrutivas (confirm/deny). Evite `confirm()/alert()`. Garanta foco inicial e fechamento por `Esc`.

- **Responsive Design**: Use Tailwind responsive classes (w-[96vw] sm:max-w-2xl)
- **Scroll Areas**: For extensive content, use ScrollArea with defined height

## 🛠️ Development Commands

### Database Operations
```bash
# Development database setup
npm run db:push              # Push schema changes to dev database
npm run db:prepare           # Prepare database for deployment
npm run db:reset:dev         # Reset development database
npm run db:migrate           # Run Prisma migrations
npm run db:generate          # Generate Prisma client
npm run db:studio            # Open Prisma Studio

# Seeding
npm run db:seed              # Populate initial data
npm run db:seed-prices       # Seed subscription price cards

# Prisma CLI commands
npx prisma migrate dev       # Create migration in development
npx prisma migrate deploy    # Apply migrations in production
npx prisma studio           # Visual database editor
```

### Testing
```bash
npm test                     # Run all tests
npm run test:unit            # Run unit tests only
npm run test:integration     # Run integration tests only
npm run test:e2e             # Run end-to-end tests
npm run test:performance     # Run performance tests
npm run test:comprehensive   # Run comprehensive test suite
npm run test:targeted        # Run targeted tests
```

### Background Workers
```bash
npm run start:worker         # Start webhook worker
npm run worker               # Start webhook worker (alternative)
npm run start:ai-worker      # Start AI integration worker
npm run build:workers        # Build workers for production
```

### Development
```bash
npm run dev                  # Start development server
npm run build                # Build for production
npm run start                # Start production server
npm run lint                 # Run Biome linter
npm run lint-apply           # Apply lint fixes
npm run format-apply         # Apply formatting fixes
npx tsc --noEmit            # Check TypeScript types
```

### Specialized Commands
```bash
npm run flash-intent         # Manage flash intent system
npm run rollout              # Manage feature rollouts
npm run init-monitoring      # Initialize monitoring
npm run fx-rates:init        # Initialize FX rate system
```

### Git Workflow
```bash
git add .
git commit -m 'feat: description'  # Use conventional commits
git push origin <branch-name>
```

### Docker
```bash
docker compose build         # Build services
docker compose up           # Start services
docker compose down         # Stop services
```

## 📁 Project Structure

### Root Directory
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

### App Directory (Next.js App Router)
```
app/
├── api/                   # API routes
│   ├── admin/            # Admin-only endpoints
│   ├── chatwitia/        # AI chat endpoints
│   ├── integrations/     # Third-party integrations
│   │   └── webhooks/     # Webhook endpoints
│   │       └── socialwiseflow/ # SocialWise Flow webhook
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
└── layout.tsx           # Root layout
```

### Library Organization
```
lib/
├── ai-integration/       # AI service integrations
│   ├── services/         # Core AI services
│   ├── types/            # AI integration types
│   ├── jobs/             # Background jobs
│   ├── bootstrap/        # Initialization
│   ├── middleware/       # Middleware
│   ├── utils/            # Utilities
│   ├── docs/             # Documentation
│   ├── schemas/          # Data schemas
│   ├── workers/          # Worker processes
│   └── queues/           # Queue management
├── socialwise-flow/      # SocialWise Flow Processing System
│   ├── processor.ts      # Main flow processor
│   ├── classification.ts # Intent classification
│   ├── channel-formatting.ts # Channel-specific formatting
│   ├── performance-bands.ts  # Performance band processing
│   ├── cache-manager.ts      # Cache management
│   ├── metrics.ts            # Performance metrics
│   └── services/             # SocialWise services
├── cost/                 # Cost Management System
│   ├── cost-worker.ts    # Main cost processing worker
│   ├── budget-system.ts  # Budget management system
│   ├── pricing-service.ts # Dynamic pricing resolution
│   └── fx-rate-service.ts # Foreign exchange rates
├── monitoring/           # System Monitoring & Observability
│   ├── application-performance-monitor.ts # APM
│   ├── queue-monitor.ts  # Queue health monitoring
│   └── database-monitor.ts # Database performance
├── queue/                # Queue Definitions & Configuration
├── queue-management/     # Advanced Queue Management System
├── auth/                # Authentication utilities
├── cache/               # Caching mechanisms
├── webhook/             # Webhook processing
├── whatsapp/            # WhatsApp API integration
├── instagram/           # Instagram API integration
├── connections.ts       # Database connections
├── redis.ts            # Redis configuration
└── utils.ts            # General utilities
```

### Worker Architecture
```
worker/
├── webhook.worker.ts     # Main webhook processor (Parent Worker)
├── automacao.worker.ts   # Automation worker
├── ai-integration.worker.ts # AI processing worker
├── processors/           # Individual job processors
├── WebhookWorkerTasks/  # Webhook-specific tasks
├── services/            # Worker services
└── queues/              # Queue definitions
```

## 🔄 SocialWise Flow Processing Pipeline

### Processing Chain
```
1. Webhook Entry → Authentication & Security
2. Payload Processing → Validation & Sanitization
3. Idempotency & Rate Limiting → Duplicate Detection
4. Classification Engine → Embedding Generation & Classification
5. Performance Bands → Confidence-based Processing
6. Response Generation → Channel-specific Formatting
```

### Performance Bands System
- **HARD (≥0.80)**: Direct mapping, <120ms response
- **SOFT (0.65-0.79)**: Warmup buttons, intent candidates
- **LOW (0.50-0.64)**: Domain topics, educational content
- **ROUTER (<0.50)**: LLM routing, handoff detection

## 🎯 Key Business Logic Areas

### 1. MTF Diamante System
Advanced template management for WhatsApp automation:
- Interactive message creation with variable substitution
- Button reaction mapping with dynamic routing
- Bulk processing capabilities with progress tracking
- Template library with version control

### 2. IA Capitão (AI Captain)
Complete AI assistant management:
- Intent management with configurable responses
- FAQ automation with context awareness
- Document processing with OCR capabilities
- Dynamic routing based on conversation context

### 3. Lead Management (Legal)
Specialized system for lawyers:
- Document unification and PDF processing
- Automated legal analysis using specialized AI
- Batch processing workflows for multiple cases
- LGPD compliance tracking and audit logs

### 4. Queue Management System
Enterprise-grade queue system:
- Job prioritization with dynamic routing
- Dead letter queue handling with retry logic
- Performance monitoring with real-time metrics
- Alert management with configurable thresholds

## 💰 Cost Management System

### Components
- **Cost Worker**: Event processing and calculation
- **Budget System**: Allocation and enforcement
- **Pricing Service**: Dynamic pricing with caching
- **FX Rate Service**: Currency conversion

### Processing Flow
```
Cost Event → Idempotency Check → Price Resolution 
→ Cost Calculation → Database Storage → Audit Logging
```

## 📊 Monitoring & Observability

### Application Performance Monitor (APM)
- Real-time metrics (webhook, worker, database, cache)
- Performance tracking (response times, throughput, error rates)
- Configurable alert system
- Historical data retention and analysis

### Queue Monitoring
- Queue health (waiting, active, completed, failed)
- Performance statistics
- Automatic anomaly detection
- Configurable monitoring thresholds

## 🔒 Security & Validation

### Input Validation
- Maximum payload size: 256KB
- XSS and injection sanitization
- Schema validation with Zod

### Rate Limiting
- Per-session limits
- Per-account limits
- Burst protection
- Rate limit headers

### Replay Protection
- Nonce validation
- Timestamp verification
- Duplicate prevention

## 📝 Code Conventions

### File Naming
- **Components**: PascalCase (`UserProfile.tsx`)
- **Pages**: kebab-case (`user-settings/page.tsx`)
- **Utilities**: camelCase (`formatDate.ts`)
- **API Routes**: Always `route.ts`
- **Types**: PascalCase with `.ts` extension

### Import Patterns
```typescript
// 1. External libraries
import { useState } from 'react';

// 2. Internal modules with @/ alias
import { auth } from '@/auth';

// 3. Relative imports
import { Button } from './components';
```

### API Route Structure
```
app/api/[feature]/
├── route.ts              # GET, POST for collection
├── [id]/
│   └── route.ts         # GET, PUT, DELETE for item
└── [id]/[action]/
    └── route.ts         # Custom actions
```

## 🎨 Responsive Dialog Example
```tsx
// Dialog with scroll and responsiveness
<Dialog>
  <DialogContent className="w-[96vw] sm:max-w-2xl max-h-[85vh]">
    <DialogHeader>
      <DialogTitle>Título</DialogTitle>
    </DialogHeader>
    <ScrollArea className="h-[58vh] sm:h-[62vh]">
      {/* Scrollable content */}
    </ScrollArea>
    <DialogFooter>
      {/* Actions */}
    </DialogFooter>
  </DialogContent>
</Dialog>
```

## ⚠️ Critical Notes

1. **You are in the project root directory**
2. **Use PowerShell commands on Windows**
3. **Path errors with "@" outside Next.js scope don't need fixing**
4. **In Next.js 15, route params are Promises - always use await**
5. **Always run `npx tsc --noEmit` after edits**
6. **Use Shadcn/UI Dialog instead of native confirm()/alert()**
7. **Optimistic UI updates are preferred**
8. **User-facing strings in Portuguese BR, code in English**

## 🚦 Environment Variables

```bash
# Configuration by environment
.env.development    # Development
.env.production     # Production
.env.local         # Local (gitignored)
.env.docker.example # Docker example

# Required variables
DATABASE_URL        # PostgreSQL connection
REDIS_URL          # Redis connection
NEXTAUTH_SECRET    # NextAuth secret
OPENAI_API_KEY     # OpenAI API key
```

## 🧪 Testing Strategy

- **Unit Tests**: Business logic components
- **Integration Tests**: API endpoints and workflows
- **E2E Tests**: Critical user journeys
- **Performance Tests**: Queue and AI systems
- **Comprehensive Coverage**: Legal compliance requirements


---

*This document is the single source of truth for Socialwise Chatwit development. Keep it updated as the project evolves.*