# Technology Stack
# copilot-instructions.md - Socialwise Chatwit Development Guide

This file provides comprehensive guidance to Claude Code (claude.ai/code) and Cursor AI when working with the Socialwise Chatwit repository.

## ⚠️ Critical Notes

1. **You are in the project root directory**
2. **Use PowerShell commands on Windows**
3. **Path errors with "@" outside Next.js scope don't need fixing**
4. **In Next.js 15, route params are Promises - always use await**
5. **Always run `npx tsc --noEmit` after edits**
6. **Use Shadcn/UI Dialog instead of native confirm()/alert()**
7. **Optimistic UI updates are preferred**
8. **User-facing strings in Portuguese BR, code in English**
9. **Front linguagem clara e direta sem termos tecnicos**
10. **Tudo deve ser compativel com thema dark e light do shadcn**
11. **Edição no front deve ser olhar com a tool de navegação o resutado**
12. **Sempre que adicionar uma feature adicione sem necessidade de controle global só controle de acesso pagina que controla acesso as features admin/features**
13. **BFF como Fonte Única (UI)**: telas devem **ler** do BFF e **mutar** usando a **mesma SWR key**; CRUD puro fica para domínio/serviços
redis e prisma de lib\connections.ts

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
- **State Management**: SWR 2.3.6 for data fetching and caching
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

## 🧭 GUIA DEFINITIVO — SWR 2.3.6 para Socialwise/Chatwit

> Padrões oficiais e opinionados para telas **rápidas, estáveis e sem flicker** em React/Next.js com **SWR 2.3.6**.

### 0) Decisões do Projeto (TL;DR)
- **Fetcher único** (JSON + erro se `!res.ok`), validação opcional (Zod) **no hook**
- **SWRConfig global**: `revalidateOnFocus:true`, `revalidateOnReconnect:true`, `revalidateIfStale:true`, `dedupingInterval: 1000–2000ms`
- **Listas/filtros**: `keepPreviousData:true` (sem "piscar")
- **Mutations**: **`useSWRMutation` para rede** + **`mutate` para cache** (optimistic/rollback/populateCache)
- **Prefetch**: `preload`
- **Tempo real**: `useSWRSubscription` (WS/SSE), evitar polling quando possível
- **Next.js App Router**: buscar no **Server** e injetar **Promise em `SWRConfig.fallback`**; no Client usar SWR + Suspense
- **Observabilidade**: middlewares para métricas/retry/tracing

### 1) SWR + BFF = Fonte Única de Verdade (UI)

**Regra de ouro**: a UI **lê** sempre do **BFF** e todas as mutações **atualizam a mesma SWR key** que abastece a tela.

#### Por quê?
- Evita estado dividido entre endpoints diferentes (flicker/race)
- Um único formato/DTO para UI (o BFF agrega/normaliza)
- Cache consistente: `mutate(key)` atualiza exatamente o que a UI lê

#### No MTF Diamante (Caixas/Agentes)
- **Leitura/Lista**: `GET /api/admin/mtf-diamante/inbox-view?dataType=caixas`
  - ⚠️ **Cache BYPASS** quando `dataType=caixas` (servidor manda `no-store`): dado sempre fresco
- **Mutations (create/update/delete)**: chamadas de domínio (CRUD) podem existir, **mas a UI SEMPRE muta a mesma key do BFF** via `mutate('/api/admin/mtf-diamante/inbox-view?dataType=caixas', ...)` com **optimistic + rollback** e **`revalidate:false`**
- **Resultado**: **sem "aparece→some→volta"**, sem desencontro entre CRUD e BFF

> **Pode apagar o CRUD?** Não. **Boa prática**: manter CRUD para serviços/integradores e o **BFF para a UI**. O BFF pode internamente usar o CRUD/Prisma, mas a tela conversa só com o BFF.

### 2) SWRConfig (client)

```tsx
'use client'
import { SWRConfig } from 'swr';

export function SWRProvider({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig value={{
      fetcher: async (url: string) => {
        const r = await fetch(url);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      },
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
      revalidateIfStale: true,
      dedupingInterval: 1500,
      errorRetryInterval: 3000,
      shouldRetryOnError: (err: any) => !String(err?.message).includes('401'),
      provider: () => new Map(),
    }}>
      {children}
    </SWRConfig>
  );
}
```

### 3) Hook de Dados (única fonte + sem flash)

```ts
import useSWR from 'swr';
import type { ChatwitInbox } from '@/types/dialogflow';

const KEY = '/api/admin/mtf-diamante/inbox-view?dataType=caixas';

export function useCaixas(isPaused = false) {
  const { data, error, isLoading, mutate } = useSWR<ChatwitInbox[]>(
    isPaused ? null : KEY,
    // fetcher global
    {
      keepPreviousData: true,
      revalidateOnFocus: !isPaused,
      revalidateOnReconnect: !isPaused,
      refreshInterval: isPaused ? 0 : 30000,
      dedupingInterval: 25000,
    }
  );
  return { caixas: data ?? [], isLoading, error, mutate, KEY };
}
```

### 4) Playbook de Mutations (optimistic + rollback)

> **Padrão oficial** da equipe: **`useSWRMutation` faz a chamada remota**; **`mutate(KEY, promise, { ... })` orquestra o cache**.

#### Create (append no final, sem revalidate)

```ts
import useSWRMutation from 'swr/mutation';
import type { ChatwitInbox, CreateCaixaPayload } from '@/types/dialogflow';

export function useCreateCaixa() {
  return useSWRMutation('/api/admin/mtf-diamante/caixas', async (_url, { arg }: { arg: CreateCaixaPayload }) => {
    const r = await fetch(_url, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(arg) });
    if (!r.ok) throw new Error('Falha ao criar');
    return r.json();
  });
}

export async function addCaixaOptimistic({
  optimistic,
  payload,
  mutate,
  KEY
}: {
  optimistic: ChatwitInbox; 
  payload: CreateCaixaPayload; 
  mutate: any; 
  KEY: string;
}) {
  await mutate(
    (async () => {
      const r = await fetch('/api/admin/mtf-diamante/caixas', { 
        method:'POST', 
        headers:{'Content-Type':'application/json'}, 
        body: JSON.stringify(payload) 
      });
      if (!r.ok) throw new Error('Falha ao criar');
      const { data: created } = await r.json();
      return (curr: ChatwitInbox[] = []) => [...curr.filter(c => c.id !== optimistic.id), created];
    })(),
    {
      optimisticData: (curr: ChatwitInbox[] = []) => [...curr, optimistic],
      rollbackOnError: true,
      populateCache: (updater, curr: ChatwitInbox[]) => (typeof updater === 'function' ? updater(curr) : curr),
      revalidate: false,
    }
  );
}
```

#### Update (replace por id)

```ts
export async function updateCaixaOptimistic({
  updated,
  payload,
  mutate
}: {
  updated: ChatwitInbox; 
  payload: { caixaId: string } & Record<string, any>; 
  mutate: any;
}) {
  await mutate(
    (async () => {
      const r = await fetch(`/api/admin/mtf-diamante/caixas/${payload.caixaId}`, { 
        method:'PUT', 
        headers:{'Content-Type':'application/json'}, 
        body: JSON.stringify(payload) 
      });
      if (!r.ok) throw new Error('Falha ao atualizar');
      const { data: result } = await r.json();
      return (curr: ChatwitInbox[] = []) => curr.map(c => c.id === result.id ? result : c);
    })(),
    {
      optimisticData: (curr: ChatwitInbox[] = []) => curr.map(c => c.id === updated.id ? updated : c),
      rollbackOnError: true,
      populateCache: (updater, curr: ChatwitInbox[]) => (typeof updater === 'function' ? updater(curr) : curr),
      revalidate: false,
    }
  );
}
```

#### Delete (filter por id)

```ts
export async function deleteCaixaOptimistic({ id, mutate }: { id: string; mutate: any }) {
  await mutate(
    (async () => {
      const r = await fetch(`/api/admin/mtf-diamante/caixas/${id}`, { method:'DELETE' });
      if (!r.ok) throw new Error('Falha ao excluir');
      return (curr: any[] = []) => curr.filter(c => c.id !== id);
    })(),
    {
      optimisticData: (curr: any[] = []) => curr.filter(c => c.id !== id),
      rollbackOnError: true,
      populateCache: (updater, curr: any[]) => (typeof updater === 'function' ? updater(curr) : curr),
      revalidate: false,
    }
  );
}
```

### 5) Evitando "flicker" (flash) e corridas
- **`keepPreviousData:true`** em listas/paginação
- **Uma única key** para a lista: `'/api/admin/mtf-diamante/inbox-view?dataType=caixas'`
- **Não** misturar leitura (CRUD) e mutação (BFF) — **sempre a mesma key** do BFF
- **Bypass de cache no BFF** para `dataType=caixas` (servidor responde `no-store`)

### 6) Post-mortem (bug "aparece → some → volta")
**Causa raiz**: UI lia lista de um endpoint e mutava por outro (CRUD vs BFF), com cache intermediário → estado divergente e re-render com "sumir/voltar".

**Correção**:
1) UI **lê apenas** do BFF `/inbox-view?dataType=caixas`
2) **Todas as mutações** usam `mutate` **na mesma key**
3) **Bypass** de cache para `dataType=caixas`
4) **Optimistic + rollback** com `revalidate:false`

**Resultado**: lista estável, sem flicker, agentes/assistentes visíveis e previsíveis.

### 7) Snippets úteis
- **Invalidate múltiplas páginas**: `mutate((key) => typeof key==='string' && key.startsWith('/api/posts?page='), undefined, { revalidate:true })`
- **Prefetch**: `preload(KEY, fetcher)`
- **Subscription**: `useSWRSubscription(KEY, (k,{next}) => { const ws=new WebSocket(...); ws.onmessage=e=>next(null,JSON.parse(e.data)); return ()=>ws.close(); })`

### 8) Checklist por tela
- [ ] Usa BFF como fonte única?
- [ ] Mesma **SWR key** para leitura e mutate?
- [ ] `keepPreviousData:true`?
- [ ] Optimistic + rollback + `revalidate:false`?
- [ ] Sem misturar CRUD puro na UI?
- [ ] Prefetch/Subscription quando fizer sentido?

## 🎨 UI/UX Standards

### Optimistic Updates
- Atualize o estado da UI **antes** da resposta da API e reverta só em caso de erro
- Prefira `startTransition` (UI local) e/ou React Query/Server Actions para conciliar cache e rollback
- Combine com `toast.promise` para feedback transparente da operação

### Toasts (sonner)
- Use **sonner** (o toast do shadcn foi **depreciado**). Renderize `<Toaster />` no layout raiz e chame `toast` em clientes
- Para chamadas de API, padronize **`toast.promise`** (loading → success/error)

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

### Dialogs
- Use **`Dialog`** para modais gerais e **`AlertDialog`** para ações destrutivas (confirm/deny)
- Evite `confirm()/alert()`
- Garanta foco inicial e fechamento por `Esc`
- **Responsive Design**: Use Tailwind responsive classes (w-[96vw] sm:max-w-2xl)
- **Scroll Areas**: For extensive content, use ScrollArea with defined height

### Responsive Dialog Example
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

## Database Operations (Prisma)
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
│   ├── schemas/          # Data schemas
│   ├── workers/          # Worker processes
│   └── queues/           # Queue management
├── socialwise-flow/      # SocialWise Flow Processing System
│   ├── processor.ts      # Main flow processor
│   ├── metrics.ts        # Performance metrics
│   ├── processor-components/ # Band handlers, button reactions, timeouts
│   └── services/         # SocialWise services
├── flow-builder/         # Flow Builder utilities
│   ├── exportImport.ts   # Export/Import flows
│   ├── interactiveMessageElements.ts # Message element helpers
│   └── index.ts          # Barrel export
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

### Services Directory
```
services/
├── flow-engine/          # ⭐ Flow Engine (deadline-first execution)
│   ├── deadline-guard.ts # 28s sync window monitor
│   ├── flow-orchestrator.ts # Flow coordination & session management
│   ├── flow-executor.ts  # Node-by-node execution
│   ├── chatwit-delivery-service.ts # Async delivery via Chatwit API
│   ├── variable-resolver.ts # Variable substitution
│   ├── sync-bridge.ts    # Sync/async bridge
│   └── index.ts          # Barrel export
└── openai-components/    # OpenAI integration services
    └── server-socialwise-componentes/ # SocialWise-specific AI components
```

### Types Directory
```
types/
├── flow-builder.ts       # Flow canvas types & validation
├── flow-engine.ts        # Flow execution types
├── interactive-messages.ts # Message limits & constraints
├── dialogflow.ts         # Dialogflow/Chatwit types
└── webhook.ts            # Webhook payload types
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
- **Flow Builder**: Visual canvas for creating conversational flows
  - Drag-and-drop interface with React Flow
  - Multiple node types (Start, Interactive, Text, Media, Delay, Reaction)
  - Real-time validation and preview
  - Export/Import flows
- **Flow Engine**: Deadline-first execution system
  - 28s sync window with automatic async migration
  - Session management for multi-step conversations
  - Variable resolution and template substitution
  - Integration with Intent classification (HARD band ≥0.80)
  - Button-based flow resumption (flow_ prefix)
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

## 🔧 Critical Frontend Data Access Patterns

### ⚠️ IMPORTANTE: Acesso aos Dados do genericPayload

**PROBLEMA COMUM**: Dados salvos no banco (`genericPayload`) não aparecem no frontend de edição.

#### Root Cause Identificado
O problema ocorre quando o frontend usa dados "normalizados" ao invés dos dados originais do **provedor de dados MTF** que contêm toda a estrutura do `genericPayload`.

#### Localização do Problema
- **File**: `app/admin/mtf-diamante/components/MensagensInterativasTab.tsx`
- **Function**: `handleEdit()` - linha ~263
- **Data Source**: ✅ `useMtfData()` - **USANDO PROVEDOR CORRETAMENTE**
- **Issue**: A função usa `normalizeMessage()` apenas para exibição, mas no edit perdeu a referência aos dados originais do provedor

#### Como o Provedor MTF Funciona

```typescript
const MensagensInterativasTab = ({ caixaId }: MensagensInterativasTabProps) => {
  // ✅ USANDO PROVEDOR DE DADOS MTF - NÃO É CONSULTA DIRETA
  const {
    interactiveMessages,    // ⭐ DADOS ORIGINAIS DA API COM genericPayload
    caixas,
    refreshCaixas,
    buttonReactions,
    refreshButtonReactions,
    deleteMessage,
    isLoadingMessages,
    addMessage,
    updateMessage,
    addButtonReaction,
    updateButtonReaction
  } = useMtfData();

  // ⚠️ PROBLEMA: normalizeMessage() apenas para EXIBIÇÃO na lista
  const mensagens = useMemo<Mensagem[]>(
    () => (interactiveMessages ?? []).map(normalizeMessage),
    [interactiveMessages]
  );
};
```

#### Solução Implementada

```typescript
const handleEdit = (msg: any) => {
  // ✅ CORRIGIDO: Buscar mensagem original com dados completos
  const originalMessage = interactiveMessages?.find(m => m.id === msg.id);

  if (originalMessage) {
    // ✅ Preservar estrutura original + garantir campos obrigatórios
    const normalizedOriginal = {
      ...originalMessage,
      // Garantir body.text existe (fallback para dados normalizados)
      body: originalMessage.body || { text: msg.texto || '' },
      // ⭐ CRÍTICO: Preservar content para acesso ao genericPayload
      content: originalMessage.content,
      // Garantir name e type existem
      name: originalMessage.name || msg.nome,
      type: originalMessage.type || msg.type || 'button'
    };

    setEditingMessage(normalizedOriginal);
    setCurrentView("edit");
    return;
  }

  // Fallback para reconstrução (só quando necessário)
  // ... resto da lógica original
};
```

#### Como o CarouselSection Acessa os Dados

**File**: `app/admin/mtf-diamante/components/interactive-message-creator/unified-editing-step/CarouselSection.tsx`

```typescript
const carouselElements = React.useMemo(() => {
  if (message.type === 'generic') {
    const a: any = message.action || {};
    let elements = a.elements || a.action?.elements || [];

    // ⭐ CRÍTICO: Verificar content.action (formato da API)
    if (elements.length === 0 && (message as any).content?.action?.elements) {
      elements = (message as any).content.action.elements;
    }

    // ⭐ CRÍTICO: Verificar genericPayload diretamente
    if (elements.length === 0 && (message as any).content?.genericPayload) {
      if ((message as any).content.genericPayload.elements) {
        elements = (message as any).content.genericPayload.elements;
      }
    }

    return elements.map((el: any, index: number) => ({
      ...el,
      id: el.id || generatePrefixedId(channelType || null, `element_${index}_${Date.now()}`),
      buttons: el.buttons?.map((btn: any, btnIndex: number) => ({
        ...btn,
        id: btn.id || btn.payload || generatePrefixedId(channelType || null, `btn_${index}_${btnIndex}_${Date.now()}`)
      })) || []
    }));
  }
  return [];
}, [message.type, message.action, (message as any).content?.action, channelType]);
```

#### ✅ Padrão para Futuras Implementações

**SEMPRE que precisar acessar dados completos via Provedor MTF:**

1. **✅ USE o provedor MTF**: `const { interactiveMessages } = useMtfData()`
2. **❌ NÃO use dados normalizados para edição**: `mensagens` são só para lista
3. **✅ ACESSE dados originais do provedor**: `interactiveMessages?.find(m => m.id === msg.id)`
4. **✅ PRESERVE a estrutura `content`**: contém `genericPayload`, `action`, etc.
5. **✅ NORMALIZE apenas campos obrigatórios**: `body.text`, `name`, `type`
6. **✅ VERIFIQUE múltiplas localizações dos dados**:
   - `message.action.elements`
   - `message.content.action.elements`
   - `message.content.genericPayload.elements`

#### 🏗️ Arquitetura Correta do MTF Data Provider

```typescript
// ✅ CORRETO: Provedor MTF gerencia tudo
useMtfData() → SWR → API → Database (genericPayload)
     ↓
interactiveMessages (dados completos)
     ↓
normalizeMessage() (só para exibição na lista)
     ↓
handleEdit() → DEVE usar interactiveMessages originais
```

#### 🚨 Red Flags a Evitar

- ❌ **Usar apenas `msg.nome`, `msg.texto`** (dados normalizados)
- ❌ **Perder referência ao `originalMessage`**
- ❌ **Não preservar `content` no `setEditingMessage`**
- ❌ **Assumir que dados estão em apenas uma localização**

#### Debug Steps para Problemas Similares

1. **Verificar console logs**: `[MensagensInterativasTab] Using original message for edit:`
2. **Inspecionar estrutura da mensagem**: `console.log('[Debug] message structure:', JSON.stringify(message, null, 2))`
3. **Verificar se `content` existe**: `console.log('[Debug] message.content:', message.content)`
4. **Verificar elementos encontrados**: `console.log('[Debug] elements found:', elements)`

#### Files Modificados na Correção

- ✅ `app/admin/mtf-diamante/components/MensagensInterativasTab.tsx:263-287`
- ✅ `app/admin/mtf-diamante/components/interactive-message-creator/unified-editing-step/CarouselSection.tsx:51-67`

**Resultado**: Carousel agora exibe "3/10 elementos" ao invés de "0/10 elementos" e todos os dados do `genericPayload` são acessíveis na edição.

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

## 💡 Key Insights

Como bugs de foco/input em React geralmente são causados por:
- Keys instáveis em listas
- IDs que mudam entre renders
- Referencias de objetos que quebram igualdade

Sua solução demonstra que às vezes a correção mais eficaz é a mais simples: manter a identidade dos elementos estável para que React possa otimizar corretamente.

No projeto MTF Diamante, houve um bug de "aparece → some → volta" nas caixas por usar listagem do BFF (/inbox-view) com cache e mutações no CRUD (/caixas). A solução foi tornar o BFF (/inbox-view?dataType=caixas) a fonte única da lista para a UI, desabilitar cache para esse dataType, alinhar a SWR key das mutações com a mesma key da lista e evitar misturar endpoints. Manter CRUD puro para uso interno/serviços e BFF para a UI.

## 🎨 Flow Builder & Flow Engine

### Flow Builder (Canvas Visual)
Sistema de criação visual de fluxos conversacionais com drag-and-drop baseado em React Flow.

**Arquitetura:**
- Canvas visual com nós e conexões
- Validação em tempo real
- Export/Import de flows
- Preview integrado de mensagens interativas

**Tipos de Nós:**
- **Start Node**: Ponto de entrada único
- **Interactive Message Node**: Botões, listas, carrossel
- **Text Message Node**: Mensagens de texto simples
- **Media Node**: Imagens, vídeos, documentos
- **Delay Node**: Pausas temporais configuráveis
- **Reaction Nodes**: Nós de reação a botões específicos

**Validações:**
- Nó START obrigatório e único
- Sem nós órfãos (desconectados)
- Sem ciclos infinitos
- Limites por canal (WhatsApp, Instagram, Facebook)

### Flow Engine (Execução Deadline-First)

**Estratégia de Execução:**
```
Sync Window (28s) → Deadline Guard → Async Migration
```

**Componentes:**
1. **DeadlineGuard**: Monitora tempo restante (28s com 5s margem)
2. **FlowOrchestrator**: Coordena execução e sessões
3. **FlowExecutor**: Executa nós sequencialmente
4. **ChatwitDeliveryService**: Entrega async via Chatwit API
5. **VariableResolver**: Substitui variáveis em templates

**Regras Críticas:**
- Uma vez async, nunca volta para sync
- Session state persiste entre interações
- Anti-loop: filtra intent ativo do context

### Integração com SocialWise Flow

**Entry Point 1: Via Intent (HARD band ≥0.80)**
```
User message → HARD band → Intent "xyz"
    ↓
MapeamentoIntencao.flowId exists + flow.isActive?
    ├─ YES → executeFlowForIntent(flowId, context)
    │        → FlowOrchestrator.executeFlowById()
    │        → Execute from START node
    └─ NO  → Return legacy template
```

**Entry Point 2: Via Button Click (flow_ prefix)**
```
User clicks button → buttonId.startsWith('flow_')?
    ├─ YES → FlowOrchestrator.handle()
    │        → Find FlowSession (WAITING_INPUT)
    │        → FlowExecutor.resumeFromButton()
    └─ NO  → Legacy MapeamentoBotao lookup
```

**Prioridade de Roteamento de Botões:**
1. `flow_*` prefix → FlowOrchestrator (Flow Engine)
2. Else → MapeamentoBotao (Legacy button reactions)
3. Not mapped → SocialWise Flow (LLM classification)

**⚠️ IMPORTANTE: Flow Engine vs Intents (Regressão)**
NUNCA interceptar todas as mensagens no webhook. Flow só executa se:
1. Botão `flow_` clicado → `FlowOrchestrator.handle()` resume session
2. Intent classificada (HARD band ≥0.80) mapeada para Flow via `MapeamentoIntencao.flowId`

O pipeline de classificação (alias/embedding → bands) SEMPRE tem prioridade sobre FlowOrchestrator default.

### Documentação Técnica
Consulte `docs/interative_message_flow_builder.md` antes de implementar melhorias no Flow Builder / Flow Engine.