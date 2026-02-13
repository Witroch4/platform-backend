# CLAUDE.md — Socialwise Chatwit

> Backup completo: `CLAUDE.md.bak`

## Regras Críticas

1. Já está no root do projeto
2. `pnpm exec tsc --noEmit` após toda edição
3. Next.js 15: `params` é Promise → sempre `await params`
4. Strings UI em PT-BR, código/variáveis em inglês
5. Shadcn/UI Dialog (nunca `confirm()`/`alert()`)
6. Optimistic UI updates preferidos
7. Dark/Light theme compatível (Shadcn)
8. BFF como fonte única da UI (mesma SWR key para leitura e mutação)
9. Features sem controle global — acesso via `admin/features`
10. Front: linguagem clara, sem termos técnicos
11. se precisa que ochatwit/chatwoot modifique alguma coisa colque em /home/wital/chatwitv4.10/chatwitdocs/chatwit-contrato-async-30s.md (a equipe deles vai verificar)

## Migrations (OBRIGATÓRIO)

**NUNCA `prisma db push` para produção.** Só `migrate dev` cria arquivo SQL.

```bash
pnpm exec prisma migrate dev --name descricao  # DEV: cria migration + aplica
pnpm exec prisma migrate deploy                 # PROD: aplica migrations pendentes
```

Committar `prisma/migrations/` JUNTO com `schema.prisma`. Se usou `db push` por engano, crie migration manualmente.

## Stack

| Camada | Tech |
|---|---|
| Frontend | Next.js 15 (App Router), React 18, TypeScript, Tailwind, Shadcn/UI, Framer Motion |
| Backend | Next.js API Routes, Express.js, Prisma ORM |
| DB | PostgreSQL 17 + pgvector |
| Cache/Queue | Redis 7 + BullMQ |
| State | SWR 2.3.6 |
| Auth | NextAuth.js v5 + Prisma adapter |
| Storage | MinIO (S3-compatible) |
| AI | OpenAI (GPT-5, DALL-E, Whisper), Anthropic Claude |
| Social | Instagram Graph API, WhatsApp Business API |
| Payments | Stripe |
| Email | Resend |
| Monitoring | Prometheus, Grafana |
| Lint/Format | Biome, TypeScript strict |
| Test | Jest, React Testing Library, Supertest |
| Package | pnpm |

## Patterns Obrigatórios

### Auth (todas as API routes protegidas)
```typescript
import { auth } from "@/auth";
const session = await auth();
if (!session?.user?.id) return NextResponse.json({ error: "Usuário não autenticado." }, { status: 401 });
```

### Dynamic Routes (Next.js 15)
```typescript
export async function POST(req: NextRequest, { params }: { params: Promise<{ accountid: string }> }) {
  const { accountid } = await params; // AWAIT obrigatório
}
```

### Prisma: JSON null
```typescript
await prisma.model.update({ where: { id }, data: { jsonField: Prisma.JsonNull } });
```

## SWR 2.3.6 — Guia Compacto

### Regras
- **Fetcher global**: JSON + throw se `!res.ok`
- **SWRConfig**: `revalidateOnFocus:true`, `revalidateOnReconnect:true`, `revalidateIfStale:true`, `dedupingInterval:1500`
- **Listas**: `keepPreviousData:true` (sem flicker)
- **Mutations**: `useSWRMutation` para rede + `mutate(KEY)` para cache (optimistic + rollback + `revalidate:false`)
- **Prefetch**: `preload(KEY, fetcher)`
- **Tempo real**: `useSWRSubscription` (WS/SSE)

### BFF = Fonte Única (UI)
UI **lê** do BFF e **muta** a mesma SWR key. CRUD puro fica para serviços/integradores.

Exemplo MTF Diamante:
- Leitura: `GET /api/admin/mtf-diamante/inbox-view?dataType=caixas` (cache bypass: `no-store`)
- Mutações: `mutate('/api/admin/mtf-diamante/inbox-view?dataType=caixas', ...)` com optimistic + rollback + `revalidate:false`

### Padrão de Mutation Optimistic (Create/Update/Delete seguem mesmo modelo)
```typescript
await mutate(
  (async () => {
    const r = await fetch(url, { method, headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
    if (!r.ok) throw new Error('Falha');
    const { data } = await r.json();
    return (curr: T[] = []) => /* merge data no array */;
  })(),
  {
    optimisticData: (curr: T[] = []) => /* UI imediata */,
    rollbackOnError: true,
    populateCache: (updater, curr) => (typeof updater === 'function' ? updater(curr) : curr),
    revalidate: false,
  }
);
```
- **Create**: `[...curr, optimistic]` → merge com `created`
- **Update**: `curr.map(c => c.id === id ? updated : c)`
- **Delete**: `curr.filter(c => c.id !== id)`

### Snippets
```typescript
// Invalidar múltiplas páginas
mutate((key) => typeof key==='string' && key.startsWith('/api/posts?page='), undefined, { revalidate:true })
// Subscription
useSWRSubscription(KEY, (k,{next}) => { const ws=new WebSocket(...); ws.onmessage=e=>next(null,JSON.parse(e.data)); return ()=>ws.close(); })
```

### Checklist por Tela
- [ ] BFF como fonte única? Mesma SWR key leitura/mutate?
- [ ] `keepPreviousData:true`? Optimistic + rollback + `revalidate:false`?
- [ ] Sem misturar CRUD puro na UI?

## UI/UX

- **Toasts**: `sonner` (shadcn toast depreciado). Usar `toast.promise(promise, { loading, success, error })`
- **Dialogs**: `Dialog` para modais, `AlertDialog` para ações destrutivas. Responsive: `w-[96vw] sm:max-w-2xl max-h-[85vh]` + `ScrollArea`
- **Optimistic**: atualizar UI antes da API, reverter em erro. Combinar com `toast.promise`

## Acesso a Dados do genericPayload (MTF)

**Regra**: para edição, usar dados **originais** do provedor (`interactiveMessages` via `useMtfData()`), NUNCA os normalizados (`mensagens`).

```
useMtfData() → interactiveMessages (completo) → normalizeMessage() (só lista)
handleEdit() → DEVE usar interactiveMessages?.find(m => m.id === msg.id)
```

**Preservar**: `content` (contém `genericPayload`, `action`). Verificar dados em 3 locais:
- `message.action.elements`
- `message.content.action.elements`
- `message.content.genericPayload.elements`

**Red flags**: usar `msg.nome`/`msg.texto` (normalizados) para edição, perder `content` no `setEditingMessage`.

## Commands

```bash
# Dev
pnpm run dev | build | start | lint | lint-apply | format-apply
pnpm exec tsc --noEmit

# DB
pnpm exec prisma migrate dev --name X  # ✅ criar migration
pnpm exec prisma migrate deploy         # ✅ produção
pnpm run db:push                        # ⚠️ só local/protótipo
pnpm run db:generate | db:studio | db:reset:dev | db:seed | db:seed-prices

# Workers
pnpm run start:worker | worker | start:ai-worker | build:workers

# Test
pnpm test | test:unit | test:integration | test:e2e | test:performance

# Specialized
pnpm run flash-intent | rollout | init-monitoring | fx-rates:init

# Docker
docker compose build | up | down

# Git: conventional commits (feat: | fix: | chore:)
```

## Project Structure

```
/
├── app/                    # Next.js App Router
│   ├── api/admin/          # Admin API endpoints
│   ├── api/chatwitia/      # AI chat endpoints
│   ├── api/integrations/webhooks/socialwiseflow/
│   ├── admin/capitao/      # IA Capitão
│   ├── admin/mtf-diamante/ # MTF Diamante (mensagens interativas)
│   ├── admin/queue-management | monitoring | leads | leads-chatwit
│   ├── admin/credentials | notifications | disparo-em-massa | disparo-oab | users
│   ├── [accountid]/dashboard/
│   └── auth/
├── components/             # Shadcn/UI + custom
├── lib/
│   ├── ai-integration/     # AI services, types, schemas, workers, queues
│   ├── socialwise-flow/    # processor.ts, metrics.ts, services/
│   ├── cost/               # cost-worker, budget-system, pricing-service, fx-rate-service
│   ├── monitoring/         # APM, queue-monitor, database-monitor
│   ├── queue/ | queue-management/
│   ├── auth/ | cache/ | webhook/ | whatsapp/ | instagram/
│   ├── connections.ts | redis.ts | utils.ts
├── worker/
│   ├── webhook.worker.ts | automacao.worker.ts | ai-integration.worker.ts
│   ├── processors/ | WebhookWorkerTasks/ | services/ | queues/
├── services/flow-engine/   # ⭐ Flow Engine (deadline-first)
├── types/                  # TypeScript definitions
├── hooks/                  # Custom React hooks
├── prisma/                 # Schema + migrations
├── docs/                   # ⭐ Docs técnicas de features
│   ├── interative_message_flow_builder.md  # Flow Builder roadmap + arquitetura
│   └── chatwit-contrato-async-30s.md       # Contrato async Chatwit
└── __tests__/
```

> **📌 Consulte `docs/` antes de implementar melhorias no Flow Builder / Flow Engine.**

## SocialWise Flow Pipeline (v3.4+)


```
┌─────────────────────────────────────────────────────────────────────────────────┐
│  WEBHOOK (/api/integrations/webhooks/socialwiseflow)                            │
│  Auth → Validation → Deduplication → Rate Limit                                 │
└──────────────────────────────────────┬──────────────────────────────────────────┘
                                       ↓
                         ┌─────────────────────────────┐
                         │  Handoff Detection          │
                         │  @falar_atendente?          │
                         └──────────────┬──────────────┘
                                       ↓ (NO)
┌──────────────────────────────────────┴──────────────────────────────────────────┐
│  BUTTON INTERACTION DETECTION                                                    │
├──────────────────────────────────────────────────────────────────────────────────┤
│  buttonId.startsWith('flow_')?                                                   │
│  ├─ YES → FlowOrchestrator.handle() → Resume FlowSession (WAITING_INPUT)         │
│  └─ NO  → Legacy Button Reaction Check → MapeamentoBotao lookup                  │
│           └─ Not mapped? → Extract button text → Continue to LLM                 │
└──────────────────────────────────────┬──────────────────────────────────────────┘
                                       ↓
┌──────────────────────────────────────┴──────────────────────────────────────────┐
│  LANGGRAPH ORCHESTRATION: classify → gating → router                             │
├──────────────────────────────────────────────────────────────────────────────────┤
│  [classifyNode] Direct alias hit? → HARD (1.0) │ Embedding search → score        │
│  [gatingNode]   Filter hints by semantic description alignment                   │
│  [routerNode]   Conditional dispatch by band                                     │
└──────────────────────────────────────┬──────────────────────────────────────────┘
                                       ↓
                    ┌──────────────────┼──────────────────┐
                    ↓                  ↓                  ↓
            ┌───────────────┐  ┌───────────────┐  ┌───────────────┐
            │  HARD ≥0.80   │  │  SOFT 0.65-79 │  │  ROUTER <0.65 │
            ├───────────────┤  ├───────────────┤  ├───────────────┤
            │ Direct intent │  │ LLM warmup    │  │ Full LLM      │
            │ mapping       │  │ buttons       │  │ routing       │
            │ <120ms        │  │ 300ms timeout │  │ 400ms timeout │
            └───────┬───────┘  └───────┬───────┘  └───────┬───────┘
                    ↓                  ↓                  ↓
            ┌───────────────────────────────────────────────────┐
            │  Intent Resolution: buildWhatsAppByIntentRaw()    │
            │  ├─ MapeamentoIntencao.flowId exists + active?    │
            │  │  └─ YES → { _type: 'execute_flow', flowId }    │
            │  │           → FlowOrchestrator.executeFlowById() │
            │  └─ NO  → Return template/interactive message     │
            └───────────────────────────────────────────────────┘
```

### Performance Bands (3 bandas ativas)

| Band | Score | Estratégia | Comportamento | Timeout |
|---|---|---|---|---|
| **HARD** | ≥0.80 | `direct_map` | Intent → Template/Flow direto | <120ms |
| **SOFT** | 0.65-0.79 | `warmup_buttons` | LLM gera buttons com candidatos | 300ms |
| **ROUTER** | <0.65 | `router_llm` | LLM decide: intent ou chat | 400ms |

> **LOW band foi removida** — scores 0.50-0.65 vão para ROUTER.

### Flow Builder Integration (v3.4+)

**Entry Point 1: Via Intent Mapping (HARD band)**
```
User message → HARD band (≥0.80) → Intent "xyz"
    ↓
MapeamentoIntencao query → flowId exists + flow.isActive?
    ├─ YES → executeFlowForIntent(flowId, context)
    │        → FlowOrchestrator.executeFlowById()
    │        → Execute from START node
    │        → Return syncResponse (interactive message)
    └─ NO  → Return legacy template
```

**Entry Point 2: Via Button Click (flow_ prefix)**
```
User clicks button → buttonId.startsWith('flow_')?
    ├─ YES → FlowOrchestrator.handle()
    │        → Find FlowSession (WAITING_INPUT)
    │        → FlowExecutor.resumeFromButton()
    │        → Continue execution from edge
    └─ NO  → Legacy MapeamentoBotao lookup
```

### Prioridade de Roteamento de Botões
1. `flow_*` prefix → **FlowOrchestrator** (Flow Engine)
2. Else → **MapeamentoBotao** lookup (Legacy button reactions)
3. Not mapped → **SocialWise Flow** (LLM classification)

### Anti-Loop Protocol
- Session injeta `activeIntentSlug` no context
- Router LLM filtra hint do intent ativo (evita re-oferecer mesmo menu)

### Deadline-First Architecture (Flow Engine)
- **Sync window**: 28s (com 5s margem)
- **Estratégia**: sync até deadline → migra para async (Chatwit API delivery)
- **Regra**: uma vez async, nunca volta para sync

## Business Logic

| Sistema | Função |
|---|---|
| **MTF Diamante** | Templates WA, mensagens interativas, button reactions, bulk dispatch |
| **IA Capitão** | Intents, FAQ, document processing (OCR), routing dinâmico |
| **Leads (Legal)** | Unificação docs, análise jurídica IA, batch processing, LGPD |
| **Queue Management** | Priorização, dead letter, monitoring, alertas |
| **Cost** | Event → idempotency → pricing → cálculo → DB → audit |

## Security

- Payload máx: 256KB | XSS/injection sanitization | Zod validation
- Rate limiting: per-session, per-account, burst protection
- Replay protection: nonce + timestamp + dedup

## Code Conventions

| Tipo | Formato | Exemplo |
|---|---|---|
| Components | PascalCase | `UserProfile.tsx` |
| Pages | kebab-case | `user-settings/page.tsx` |
| Utilities | camelCase | `formatDate.ts` |
| API Routes | `route.ts` | sempre |
| Types | PascalCase `.ts` | `FlowEngine.ts` |

Imports: 1) externos → 2) `@/` internos → 3) relativos

## Env Vars

```bash
DATABASE_URL | REDIS_URL | NEXTAUTH_SECRET | OPENAI_API_KEY
# .env.development | .env.production | .env.local (gitignored)
```

## Key Insights

- Bugs de foco/input React: keys instáveis, IDs que mudam entre renders, refs que quebram igualdade → manter identidade estável
- Bug MTF "aparece→some→volta": UI lia BFF e mutava CRUD (keys diferentes) → solução: BFF como fonte única, mesma SWR key, bypass cache, optimistic+rollback
- **Flow Engine vs Intents (Regressão)**: NUNCA interceptar todas as mensagens no webhook. Flow só executa se:
  1. Botão `flow_` clicado → `FlowOrchestrator.handle()` resume session
  2. Intent classificada (HARD band ≥0.80) mapeada para Flow via `MapeamentoIntencao.flowId`

  O pipeline de classificação (alias/embedding → bands) SEMPRE tem prioridade sobre FlowOrchestrator default.

## Portainer MCP

**Regra crítica**: as ferramentas de alto nível (`listStacks`, `createStack`, etc.) são para **Edge Stacks** — não funcionam no ambiente Swarm normal (retornam 503). Usar sempre Portainer [dockerProxy]

