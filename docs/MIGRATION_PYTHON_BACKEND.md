# Platform Backend — Plano de Migração Definitivo

> **Fonte única da verdade** para a unificação de Socialwise + JusMonitorIA em um backend Python compartilhado.
> Última atualização: 2026-03-20

---

## Visão Final

```
┌──────────────────────┐  ┌──────────────────────┐
│   socialwise-web     │  │  jusmonitoria-web    │
│   Next.js 16         │  │  Next.js             │
│   UI · SSR · RSC     │  │  UI · SSR · RSC      │
│   Auth.js/NextAuth   │  │  (consome JWT)       │
│   proxy.ts (borda)   │  │                      │
└──────────┬───────────┘  └──────────┬───────────┘
           │  HTTP/SSE               │  HTTP/SSE
           └────────────┬────────────┘
                        ▼
┌─────────────────────────────────────────────────────────┐
│            PLATFORM BACKEND (FastAPI)                    │
│       Fonte única da verdade para regras de negócio      │
│                                                         │
│  ┌──────────────────┐  ┌─────────────────────────────┐  │
│  │  platform_core/  │  │         domains/            │  │
│  │  (infra)         │  │  ┌───────────────────────┐  │  │
│  │  - db engines    │  │  │ socialwise/           │  │  │
│  │  - auth          │  │  │  models · tasks       │  │  │
│  │  - middleware     │  │  │  agents · api · cost  │  │  │
│  │  - litellm       │  │  └───────────────────────┘  │  │
│  │  - taskiq        │  │  ┌───────────────────────┐  │  │
│  │  - logging       │  │  │ jusmonitoria/         │  │  │
│  │  - storage       │  │  │  models · tasks       │  │  │
│  │  - chatwit       │  │  │  agents · api · crm   │  │  │
│  └──────────────────┘  │  └───────────────────────┘  │  │
│                        └─────────────────────────────┘  │
│                                                         │
│  Jobs: TaskIQ (brokers separados por domínio)           │
│  IA: LangGraph (workflows) + LiteLLM (multi-modelo)    │
│  DB: SQLAlchemy 2.0 async + Alembic                    │
└───────────┬──────────────┬───────────────┬──────────────┘
            ▼              ▼               ▼
      ┌──────────┐  ┌──────────┐  ┌──────────────┐
      │socialwise│  │jusmonit. │  │  platform DB  │
      │   DB     │  │   DB     │  │  (técnico)    │
      └──────────┘  └──────────┘  └──────────────┘
            ▲
            │ Prisma = schema authority
            │ SQLAlchemy = read-only mirror
```

### Stack Consolidada

| Camada | Tecnologia |
|--------|-----------|
| Frontend web | Next.js 16 (dois apps separados) |
| Backend único | **FastAPI** — API principal, fonte da verdade |
| Jobs assíncronos | **TaskIQ** (Redis broker, brokers isolados por domínio) |
| Workflows agentic | **LangGraph** (StateGraph, checkpoints, streaming) |
| Multi-modelo LLM | **LiteLLM** (interface unificada, fallback, cost tracking) |
| Banco relacional | **PostgreSQL 17** + pgvector (3 databases) |
| Fila/broker | **Redis 8** |
| Storage | **MinIO/S3** |
| Observabilidade | **structlog** (JSON) + Prometheus |
| Deploy | **Docker/Swarm** via Traefik |

### Papel de Cada Camada

| Camada | Responsabilidade | NÃO faz |
|--------|-----------------|---------|
| **Next.js** | UI, SSR/RSC, autenticação web (Auth.js), proxy.ts (borda), apresentação | Regra de negócio, jobs, IA, processamento |
| **FastAPI** | APIs públicas/internas, regra de negócio dos 2 domínios, jobs, workflows IA, integrações LLM, custo, artifacts, scheduler, eventos | Renderizar HTML, servir assets |

### Auth

| Produto | Auth no Frontend | Auth no Backend |
|---------|-----------------|-----------------|
| Socialwise | Auth.js/NextAuth (app web) | NextAuth JWE verification + API key service-to-service |
| JusMonitorIA | JWT/RBAC nativo | JWT/RBAC nativo (já implementado) |
| Service-to-service | — | `X-Internal-API-Key` entre Next.js → FastAPI |

### Três Databases

| Database | Schema Authority | Alembic? | Conteúdo |
|----------|-----------------|----------|----------|
| `socialwise` | **Prisma** (Next.js) | NÃO — SQLAlchemy é mirror read-only | Leads, flows, templates, OAB, users |
| `jusmonitoria` | **Alembic** (Python) | SIM | Tenants, cases, tribunais, petições, CRM |
| `platform` | **Alembic** (Python) | SIM | ai_cost_events, job_runs, artifacts, provider_configs, fx_rates, scheduled_tasks |

---

## Estado Atual

### ✅ Fase 0 — Scaffold (CONCLUÍDA)

Repo: `/home/wital/platform-backend`

| Item | Status |
|------|--------|
| `platform_core/app.py` — FastAPI factory com plugin system | ✅ |
| `platform_core/config.py` — Pydantic Settings (3 DBs, Redis, AI, auth) | ✅ |
| `platform_core/db/engines.py` — Multi-engine SQLAlchemy | ✅ |
| `platform_core/db/sessions.py` — Session factory por database | ✅ |
| `platform_core/db/base.py` — Mixins compartilhados | ✅ |
| `platform_core/db/models/` — 6 tabelas platform (ai_cost_events, job_runs, artifacts, provider_configs, fx_rates, scheduled_tasks) | ✅ |
| `platform_core/tasks/brokers/` — 3 brokers TaskIQ isolados (socialwise:tasks, jusmonitoria:tasks, platform:tasks) | ✅ |
| `platform_core/domain.py` — DomainPlugin ABC | ✅ |
| `platform_core/logging/config.py` — structlog | ✅ |
| `platform_core/shutdown/handler.py` — Graceful shutdown | ✅ |
| `domains/socialwise/plugin.py` — Stub com health endpoint | ✅ |
| `domains/jusmonitoria/plugin.py` — Stub com health endpoint | ✅ |
| `alembic/` — Migration inicial (6 tabelas platform) | ✅ |
| `Dockerfile` + `docker-compose.yml` | ✅ |
| `/health` retorna 200 com 3 DBs + Redis conectados | ✅ |

### Stubs (a implementar nas próximas fases)

- `platform_core/auth/` — JWT + NextAuth verification
- `platform_core/ai/` — LiteLLM config, cost tracker
- `platform_core/middleware/` — Rate limit, security headers, tenant isolation
- `platform_core/services/` — Storage (MinIO), email, chatwit client, SSE manager

---

# SEÇÃO A — Migração JusMonitorIA

> Mover o backend existente (`/home/wital/JusMonitorIA/backend/app/`) para `domains/jusmonitoria/` dentro do platform-backend. O código já está 100% async com FastAPI/TaskIQ no padrão alvo.

## A.1 — Mover Modelos e Repositórios

**Origem:** `/home/wital/JusMonitorIA/backend/app/db/models/` (35 modelos)
**Destino:** `domains/jusmonitoria/db/models/`

### Arquivos-chave

| Arquivo Origem | Modelo | Papel |
|---------------|--------|-------|
| `app/db/models/tenant.py` | `Tenant` | Multi-tenant workspace |
| `app/db/models/user.py` | `User` | Auth + RBAC |
| `app/db/models/client.py` | `Client` | Clientes do escritório |
| `app/db/models/lead.py` | `Lead` | Leads / prospecção |
| `app/db/models/legal_case.py` | `LegalCase` | Processos judiciais (CNJ) |
| `app/db/models/case_movement.py` | `CaseMovement` | Movimentações processuais |
| `app/db/models/peticao.py` | `Peticao` | Petições (PJe filing) |
| `app/db/models/contrato.py` | `Contrato` | Contratos de serviço |
| `app/db/models/fatura.py` | `Fatura` | Faturas |
| `app/db/models/certificado_digital.py` | `CertificadoDigital` | Certificados ICP-Brasil |
| `app/db/models/ai_conversation.py` | `AIConversation` | Chat JARVIS |
| `app/db/models/ai_provider.py` | `AIProvider` | Config provedores IA |
| `app/db/models/document_embedding.py` | `DocumentEmbedding` | pgvector embeddings |
| `app/db/models/briefing.py` | `Briefing` | Briefing diário JARVIS |
| `app/db/models/audit_log.py` | `AuditLog` | Auditoria |
| + 20 modelos adicionais | | |

**Repositórios:** `app/db/repositories/` (27 arquivos) → `domains/jusmonitoria/db/repositories/`

### Tarefas

- [ ] Copiar `app/db/models/` → `domains/jusmonitoria/db/models/`
- [ ] Copiar `app/db/repositories/` → `domains/jusmonitoria/db/repositories/`
- [ ] Criar `JusMonitorIABase(DeclarativeBase)` em `domains/jusmonitoria/db/base.py`
- [ ] Atualizar imports: `app.db.` → `domains.jusmonitoria.db.` e `app.core.` → `platform_core.`
- [ ] Mover Alembic versions → `domains/jusmonitoria/alembic/versions/` (24 migrations)
- [ ] Atualizar `domains/jusmonitoria/alembic/env.py` com target_metadata real
- [ ] Verificar: `alembic -n jusmonitoria upgrade head` funciona

---

## A.2 — Mover Schemas e Endpoints

**Schemas:** `app/schemas/` (22 arquivos) → `domains/jusmonitoria/schemas/`
**Endpoints:** `app/api/v1/endpoints/` (18+ arquivos) → `domains/jusmonitoria/api/v1/endpoints/`

### Arquivos-chave

| Arquivo Origem | Rota Base | Papel |
|---------------|-----------|-------|
| `endpoints/auth.py` | `/auth` | Login, registro, refresh token |
| `endpoints/clients.py` | `/clients` | CRUD clientes + timeline |
| `endpoints/leads.py` | `/leads` | CRUD leads + scoring + conversão |
| `endpoints/peticoes.py` | `/peticoes` | Petições PJe |
| `endpoints/processos.py` | `/processos` | Consulta DataJud + MNI |
| `endpoints/dashboard.py` | `/dashboard` | Métricas e KPIs |
| `endpoints/financeiro.py` | `/financeiro` | Lançamentos, faturas, cobranças |
| `endpoints/jarvis.py` | `/jarvis` | IA briefing + chat streaming |
| `endpoints/search.py` | `/search` | Busca semântica pgvector |
| `endpoints/certificados.py` | `/certificados` | Certificados digitais |
| `endpoints/integrations.py` | `/integrations` | Chatwit, Instagram |
| + 8 endpoints adicionais | | |

### Tarefas

- [ ] Copiar schemas e endpoints
- [ ] Atualizar imports
- [ ] Registrar router no `JusMonitorIAPlugin.register_routes()`
- [ ] Verificar: todos os endpoints respondem em `/api/v1/jusmonitoria/*`

---

## A.3 — Mover Serviços e Agentes IA

**Serviços:** `app/core/services/` (22 arquivos + 4 subdirs) → `domains/jusmonitoria/services/`
**Agentes:** `app/ai/agents/` (5 agentes) → `domains/jusmonitoria/ai/agents/`

### Agentes IA (JusMonitorIA)

| Arquivo | Agente | Papel |
|---------|--------|-------|
| `agents/triage.py` | `TriageAgent` | Classificação de mensagens |
| `agents/maestro.py` | `MaestroAgent` | Orquestração entre agentes |
| `agents/investigator.py` | `InvestigatorAgent` | Análise de processos |
| `agents/writer.py` | `RedatorAgent` | Redação de petições |
| `agents/base_agent.py` | `BaseAgent` | Base abstrata |

### Serviços-chave

| Arquivo | Serviço | Papel |
|---------|---------|-------|
| `services/datajud_service.py` | `DatajudService` | API pública CNJ |
| `services/contrato_service.py` | `ContratoService` | Lógica contratos |
| `services/chatwit_client.py` | `ChatwitClient` | HTTP client Chatwit |
| `services/peticoes/peticao_service.py` | `PeticaoService` | Filing PJe via MNI SOAP |
| `services/peticoes/pdf_signer.py` | `PdfSigner` | Assinatura digital |
| `services/crm/` (5 arquivos) | CRM | Lead scoring, funnel, timeline |
| `services/storage.py` | `StorageService` | MinIO/S3 |
| `services/email_service.py` | `EmailService` | SMTP |

### Tarefas

- [ ] Copiar services e agents
- [ ] Mover `storage.py` e `email_service.py` para `platform_core/services/` (compartilhados)
- [ ] Mover `BaseAgent` para `platform_core/ai/base_agent.py` (compartilhado)
- [ ] Mover `litellm_config.py` e `provider_manager.py` para `platform_core/ai/` (compartilhados)
- [ ] Atualizar imports em todos os arquivos
- [ ] Verificar: agentes IA executam corretamente

---

## A.4 — Mover Workers (TaskIQ)

**Origem:** `app/workers/` (14 tasks) → `domains/jusmonitoria/tasks/`

### Tasks-chave

| Arquivo | Task | Frequência |
|---------|------|-----------|
| `workers/datajud_poller.py` | Polling DataJud | Scheduled (6h) |
| `workers/tpu_sync.py` | Sync tabelas TPU | Startup + 30d |
| `workers/oab_sync.py` | Sync registro OAB | Diário |
| `workers/scrape_pipeline.py` | Web scraping | On-demand + scheduled |
| `workers/embeddings.py` | Gerar embeddings | On-demand |
| `workers/peticao_protocolar.py` | Protocolar petição PJe | On-demand |
| `workers/lead_scoring.py` | Scoring IA de leads | On-demand |
| `workers/chatwit_handlers.py` | Webhook Chatwit | On-demand |
| + 6 tasks adicionais | | |

### Tarefas

- [ ] Copiar tasks, reregistrar no `broker_jm`
- [ ] Atualizar imports: `app.workers.` → `domains.jusmonitoria.tasks.`
- [ ] Verificar: `taskiq worker platform_core.tasks.brokers.jusmonitoria:broker_jm --tasks-pattern="domains/jusmonitoria/tasks/**/*.py"` processa tasks

---

## A.5 — Mover Middleware Compartilhado

**Origem:** `app/core/middleware/` (9 middlewares) → `platform_core/middleware/`

| Arquivo | Middleware | Compartilhado? |
|---------|-----------|---------------|
| `middleware/logging.py` | Request/response logging | ✅ Compartilhado |
| `middleware/metrics.py` | Prometheus | ✅ Compartilhado |
| `middleware/rate_limit.py` | Rate limiting (Redis) | ✅ Compartilhado |
| `middleware/security.py` | Security headers | ✅ Compartilhado |
| `middleware/cache.py` | HTTP caching | ✅ Compartilhado |
| `middleware/audit.py` | Audit logging | ✅ Compartilhado |
| `middleware/tenant.py` | Tenant isolation | ⚠️ JusMonitorIA-specific (Socialwise não tem tenant) |
| `middleware/shutdown.py` | Graceful shutdown | ✅ Já existe em `platform_core/shutdown/` |

### Tarefas

- [ ] Copiar middleware compartilhados para `platform_core/middleware/`
- [ ] Manter `tenant.py` como middleware de domínio (aplicado só nas rotas JusMonitorIA)
- [ ] Copiar `app/core/auth/` → `platform_core/auth/` (JWT + dependencies)
- [ ] Registrar middleware stack no `create_app()`

---

## A.6 — Verificação Final JusMonitorIA

- [ ] Todas as rotas em `/api/v1/jusmonitoria/*` respondem
- [ ] Worker JusMonitorIA processa tasks no TaskIQ
- [ ] Alembic migrations rodam sem erro
- [ ] Agentes IA (triage, maestro, investigator, writer) executam
- [ ] Auth JWT funciona
- [ ] Atualizar Docker Compose do JusMonitorIA frontend para apontar para platform-backend
- [ ] Desligar container antigo do backend JusMonitorIA

---

# SEÇÃO B — Migração Socialwise

> Portar workers, agentes IA, e serviços do Next.js (`/home/wital/socialwise/`) para `domains/socialwise/` no platform-backend. O objetivo final é **DELETAR a pasta `worker/`** do Socialwise.

## Inventário: 13 Workers do Socialwise

| # | Worker | Fila BullMQ | Acoplamento Next.js | Migra? |
|---|--------|-------------|--------------------|----|
| 1 | Agendamento | `agendamento` | Nenhum | ✅ |
| 2 | LeadCells | `leadCells` | Nenhum | ✅ |
| 3 | MirrorGeneration | `oab-mirror-generation` | Nenhum | ✅ |
| 4 | AnalysisGeneration | `oab-analysis` | Nenhum | ✅ |
| 5 | LeadsChatwit | `filaLeadsChatwit` | Nenhum | ✅ |
| 6 | FlowBuilder | `flow-builder-queues` | Nenhum (async actions) | ✅ |
| 7 | InstagramWebhook | `instagram-webhook` | Nenhum | ✅ |
| 8 | Transcription | `oab-transcription` | Nenhum | ✅ |
| 9 | FxRate | `fx-rate-updates` | Nenhum | ✅ |
| 10 | BudgetMonitor | `budget-monitor` | Nenhum | ✅ |
| 11 | WebhookDelivery | `webhook-delivery` | Nenhum | ✅ |
| 12 | FlowCampaign | `flow-campaign` | Nenhum | ✅ |
| 13 | CostEvents | `cost-events` | Nenhum | ✅ |

**TODOS os 13 migram.** Nenhum worker tem acoplamento com Next.js — são puro business logic.

### Dependências entre Workers

```
Transcription (8) ──completion──▶ LeadCells (2) [manuscrito]
MirrorGeneration (3) ──completion──▶ LeadCells (2) [espelho]
AnalysisGeneration (4) ──completion──▶ LeadCells (2) [análise]
FlowBuilder (6) ──DELAY──▶ FlowBuilder (6) [self-resume]
FlowCampaign (12) ──per contact──▶ FlowBuilder (6) [flow execution]
CostEvents (13) ◀──emit── Transcription (8), Mirror (3), Analysis (4)
BudgetMonitor (10) ◀──reads── CostEvents (13)
```

---

## B.1 — SQLAlchemy Models (Mirror do Prisma)

O database `socialwise` é gerenciado pelo Prisma. SQLAlchemy faz **read/write mirror** — sem Alembic, sem migrations.

### Tarefas

- [ ] Gerar models via `sqlacodegen` a partir do schema Prisma existente
- [ ] Criar apenas os modelos que os workers precisam acessar:

| Tabela Prisma | Modelo SQLAlchemy | Usado por |
|---------------|------------------|-----------|
| `LeadOabData` | `LeadOabData` | Transcription, Mirror, Analysis, LeadCells |
| `Lead` | `Lead` | LeadCells, LeadsChatwit |
| `EspelhoPadrao` | `EspelhoPadrao` | MirrorGeneration |
| `MapeamentoBotao` | `MapeamentoBotao` | FlowBuilder |
| `MapeamentoIntencao` | `MapeamentoIntencao` | FlowBuilder |
| `Flow` / `FlowNode` / `FlowEdge` | `Flow`, `FlowNode`, `FlowEdge` | FlowBuilder, FlowCampaign |
| `FlowSession` | `FlowSession` | FlowBuilder |
| `Agendamento` | `Agendamento` | Agendamento worker |
| `UsuarioChatwit` | `UsuarioChatwit` | LeadsChatwit, Chatwit integration |
| `SystemConfig` | `SystemConfig` | Chatwit client |
| `TemplateMessage` | `TemplateMessage` | FlowBuilder, FlowCampaign |
| `CostEvent` | `CostEvent` | CostEvents worker |
| `VariavelMtf` | `VariavelMtf` | FlowBuilder (variáveis MTF) |

- [ ] Colocar em `domains/socialwise/db/models/`
- [ ] Testar: CRUD básico funciona via SQLAlchemy no banco socialwise

---

## B.2 — Workers Simples (Sem IA)

Começar pelos workers mais simples para validar a stack TaskIQ + SQLAlchemy mirror.

### B.2.1 — FxRate + BudgetMonitor + CostEvents

| Origem (TypeScript) | Destino (Python) | Complexidade |
|---------------------|-----------------|-------------|
| `lib/cost/fx-rate-worker.ts` | `domains/socialwise/tasks/fx_rate.py` | Baixa |
| `lib/cost/budget-monitor.ts` | `domains/socialwise/tasks/budget_monitor.py` | Baixa |
| `lib/cost/cost-worker.ts` | `domains/socialwise/tasks/cost_events.py` | Média |

**Dependências a portar:**
- `lib/cost/pricing-service.ts` → `domains/socialwise/services/cost/pricing.py`
- `lib/cost/idempotency-service.ts` → `domains/socialwise/services/cost/idempotency.py`
- `lib/cost/audit-logger.ts` → `domains/socialwise/services/cost/audit.py`

### B.2.2 — Agendamento + WebhookDelivery + InstagramWebhook

| Origem (TypeScript) | Destino (Python) | Complexidade |
|---------------------|-----------------|-------------|
| `worker/WebhookWorkerTasks/agendamento.task.ts` | `domains/socialwise/tasks/agendamento.py` | Baixa |
| (webhook delivery logic) | `domains/socialwise/tasks/webhook_delivery.py` | Baixa |
| `worker/processors/instagram-webhook.processor.ts` | `domains/socialwise/tasks/instagram_webhook.py` | Baixa |

### B.2.3 — LeadCells + LeadsChatwit

| Origem (TypeScript) | Destino (Python) | Complexidade |
|---------------------|-----------------|-------------|
| `worker/WebhookWorkerTasks/leadcells.task.ts` | `domains/socialwise/tasks/lead_cells.py` | Média |
| `worker/WebhookWorkerTasks/leads-chatwit.task.ts` | `domains/socialwise/tasks/leads_chatwit.py` | Média |

**Dependências a portar:**
- `lib/leads-chatwit/` (3 arquivos) → `domains/socialwise/services/leads/`

### Tarefas

- [ ] Portar cada worker TypeScript → Python TaskIQ
- [ ] Criar endpoint bridge: `POST /api/v1/socialwise/tasks/enqueue` (Next.js chama em vez de BullMQ `.add()`)
- [ ] Publicar SSE progress nos mesmos canais Redis que o Next.js lê
- [ ] Testar: side-by-side BullMQ ↔ TaskIQ, depois cutover

---

## B.3 — Agentes IA OAB (LangGraph + LiteLLM)

Maior complexidade. Requer portar de Vercel AI SDK para LangGraph + LiteLLM.

### Arquivos-chave (TypeScript → Python)

| Origem | Destino | LOC | Papel |
|--------|---------|-----|-------|
| `lib/oab-eval/transcription-agent.ts` (1067 linhas) | `domains/socialwise/services/oab_eval/transcription_agent.py` | ~800 | OCR + LLM: imagem manuscrita → texto |
| `lib/oab-eval/mirror-generator-agent.ts` (~600 linhas) | `domains/socialwise/services/oab_eval/mirror_generator.py` | ~500 | Vision: extrair gabarito de imagens |
| `lib/oab-eval/analysis-agent.ts` (~400 linhas) | `domains/socialwise/services/oab_eval/analysis_agent.py` | ~400 | Comparativa: prova × espelho → score |

### Suporte (TypeScript → Python)

| Origem | Destino | Papel |
|--------|---------|-------|
| `lib/oab-eval/unified-vision-client.ts` (699 linhas) | `domains/socialwise/services/oab_eval/vision_client.py` | Multi-provider vision API (Gemini/OpenAI) |
| `lib/oab-eval/operation-control.ts` | `domains/socialwise/services/oab_eval/operation_control.py` | Cancellation + abort signals |
| `lib/oab-eval/rubric-scoring.ts` | `domains/socialwise/services/oab_eval/rubric_scoring.py` | Algoritmo de scoring |
| `lib/oab-eval/ai-retry-fallback.ts` | (absorvido pelo LiteLLM fallback) | Retry com fallback de modelo |
| `lib/oab-eval/runtime-policy.ts` | `domains/socialwise/services/oab_eval/runtime_policy.py` | Flags de comportamento por provider |

### Workers IA (TaskIQ)

| Origem | Destino |
|--------|---------|
| `worker/WebhookWorkerTasks/mirror-generation.task.ts` | `domains/socialwise/tasks/mirror_generation.py` |
| `worker/WebhookWorkerTasks/analysis-generation.task.ts` | `domains/socialwise/tasks/analysis_generation.py` |
| `lib/oab-eval/transcription-queue.ts` | `domains/socialwise/tasks/transcription.py` |

### Tarefas

- [ ] Implementar `platform_core/ai/litellm_config.py` (LiteLLM com CircuitBreaker + fallback)
- [ ] Implementar `platform_core/ai/cost_tracker.py` (callback LiteLLM → ai_cost_events)
- [ ] Portar 3 agents (transcription, mirror, analysis) usando LangGraph StateGraph
- [ ] Portar vision client (usar litellm para chamadas multi-provider)
- [ ] Portar operation control (cancellation via Redis)
- [ ] Portar rubric scoring (lógica pura)
- [ ] SSE progress: publicar nos mesmos canais Redis
- [ ] Validação A/B: comparar output Python vs TypeScript em 100 leads

---

## B.4 — Flow Engine Workers

O Flow Engine core (Orchestrator, Executor, SyncBridge) **permanece no Next.js** por enquanto — o SyncBridge depende do ciclo HTTP de 30s do webhook. Mas os workers async do Flow **migram**.

### Workers que migram

| Origem | Destino | Papel |
|--------|---------|-------|
| `worker/WebhookWorkerTasks/flow-builder-queues.task.ts` (~200 linhas) | `domains/socialwise/tasks/flow_builder.py` | Ações async: CHATWIT_ACTION, HTTP_REQUEST, TAG, WEBHOOK, DELAY, MEDIA |
| `worker/WebhookWorkerTasks/flow-campaign.task.ts` (~150 linhas) | `domains/socialwise/tasks/flow_campaign.py` | Execução batch de campanhas |

### Dependências que migram

| Origem | Destino | Papel |
|--------|---------|-------|
| `services/flow-engine/chatwit-delivery-service.ts` | `domains/socialwise/services/flow/delivery_service.py` | HTTP delivery Chatwit API com retry |
| `services/flow-engine/variable-resolver.ts` | `domains/socialwise/services/flow/variable_resolver.py` | Resolve `{{var}}` em templates |
| `services/flow-engine/mtf-variable-loader.ts` | `domains/socialwise/services/flow/mtf_loader.py` | Carrega variáveis MTF do Redis/DB |
| `lib/mtf-diamante/variables-resolver.ts` | `domains/socialwise/services/flow/mtf_variables.py` | Formatação lote_ativo + complemento |

### O que NÃO migra nesta fase

| Arquivo | Motivo |
|---------|--------|
| `services/flow-engine/flow-orchestrator.ts` | Entry-point do webhook — acoplado ao HTTP request |
| `services/flow-engine/flow-executor.ts` | Depende do SyncBridge |
| `services/flow-engine/sync-bridge.ts` | Ponte 30s do HTTP response — ciclo de vida Next.js |
| `services/flow-engine/playground-collector.ts` | Debug, não crítico |

### Tarefas

- [ ] Portar FlowBuilder worker (6 job types)
- [ ] Portar FlowCampaign worker
- [ ] Portar ChatwitDeliveryService (axios → httpx)
- [ ] Portar VariableResolver (chain de resolução: session → MTF → contact → system)
- [ ] Criar bridge: Next.js enfileira job → TaskIQ processa → resultado via Redis pub/sub
- [ ] Testar: flow async executa de ponta a ponta

---

## B.5 — SocialWise Flow (Intent Classification)

O pipeline de classificação de intenções que roda no webhook.

### Arquivos-chave

| Origem | Destino | Papel |
|--------|---------|-------|
| `lib/socialwise-flow/processor.ts` | `domains/socialwise/services/intent/processor.py` | Entry-point classificação |
| `lib/socialwise-flow/classification.ts` | `domains/socialwise/services/intent/classification.py` | Intent detection |
| `lib/socialwise-flow/performance-bands.ts` | `domains/socialwise/services/intent/bands.py` | HARD/ROUTER/FALLBACK |
| `lib/socialwise-flow/services/ai-provider-factory.ts` | (absorvido pelo LiteLLM) | Provider abstraction |
| `lib/socialwise-flow/services/multi-provider-processor.ts` | `domains/socialwise/services/intent/provider_processor.py` | Seleção de provider |
| `lib/socialwise-flow/services/retry-handler.ts` | (absorvido pelo LiteLLM retry) | Retry com degradação |
| `lib/socialwise-flow/button-processor.ts` | `domains/socialwise/services/intent/button_processor.py` | Detecção `flow_` buttons |
| `lib/socialwise-flow/meta-payload-builder.ts` | `domains/socialwise/services/intent/payload_builder.py` | Builder mensagens interativas |
| `lib/socialwise-flow/cache-manager.ts` | `domains/socialwise/services/intent/cache.py` | Redis cache |

### Tarefas

- [ ] Portar pipeline de classificação
- [ ] Integrar com LiteLLM (substituir ai-provider-factory)
- [ ] Testar: classificação retorna mesmos resultados (benchmark com 200 mensagens reais)

---

## B.6 — Webhook Route + Flow Engine Core

**Fase final da migração Socialwise.** Mover o webhook e o Flow Engine core para FastAPI.

### Arquivos-chave

| Origem | Destino | Papel |
|--------|---------|-------|
| `app/api/integrations/webhooks/socialwiseflow/route.ts` | `domains/socialwise/api/v1/endpoints/webhook.py` | Webhook entry-point |
| `app/api/integrations/webhooks/socialwiseflow/init/route.ts` | `domains/socialwise/api/v1/endpoints/webhook_init.py` | Init Chatwit bot token |
| `services/flow-engine/flow-orchestrator.ts` | `domains/socialwise/services/flow/orchestrator.py` | Orquestrador de flows |
| `services/flow-engine/flow-executor.ts` | `domains/socialwise/services/flow/executor.py` | Executor nó-a-nó |
| `services/flow-engine/sync-bridge.ts` | `domains/socialwise/services/flow/sync_bridge.py` | Ponte sync 30s (rewrite para async Python) |

### Tarefas

- [ ] Criar endpoint webhook em FastAPI
- [ ] Rewrite SyncBridge para async Python (usar asyncio.Queue ou similar)
- [ ] Portar FlowOrchestrator
- [ ] Portar FlowExecutor
- [ ] Configurar Chatwit para apontar webhook para FastAPI
- [ ] Testar: flow completo (sync + async) funciona end-to-end

---

## B.7 — Admin API Routes

Migrar as rotas admin do Next.js para FastAPI.

### Grupos de rotas

| Grupo | Origem (Next.js) | Destino (FastAPI) | # Rotas |
|-------|-----------------|------------------|---------|
| Flows | `app/api/admin/mtf-diamante/flows/` | `domains/socialwise/api/v1/endpoints/flows.py` | ~8 |
| Templates | `app/api/admin/mtf-diamante/templates/` | `domains/socialwise/api/v1/endpoints/templates.py` | ~6 |
| Variáveis | `app/api/admin/mtf-diamante/variaveis/` | `domains/socialwise/api/v1/endpoints/variables.py` | ~4 |
| Campanhas | `app/api/admin/mtf-diamante/campaigns/` | `domains/socialwise/api/v1/endpoints/campaigns.py` | ~6 |
| Leads | `app/api/admin/leads-chatwit/` | `domains/socialwise/api/v1/endpoints/leads.py` | ~10 |
| Analytics | `app/api/admin/mtf-diamante/flow-analytics/` | `domains/socialwise/api/v1/endpoints/analytics.py` | ~4 |
| Cost | `app/api/admin/cost/` | `domains/socialwise/api/v1/endpoints/cost.py` | ~4 |
| OAB | vários em `app/api/admin/` | `domains/socialwise/api/v1/endpoints/oab.py` | ~8 |

### Tarefas

- [ ] Extrair lógica de negócio dos route handlers para services
- [ ] Criar endpoints FastAPI equivalentes
- [ ] Next.js BFF aponta para FastAPI (proxy)
- [ ] Migrar endpoints SSE para FastAPI StreamingResponse
- [ ] Testar: frontend continua funcionando sem mudanças

---

## B.8 — Cleanup: DELETAR `worker/`

**Marco final.** Quando todos os 13 workers estão rodando no TaskIQ:

### Tarefas

- [ ] Verificar: zero jobs BullMQ pendentes nas 13 filas
- [ ] Monitorar 1 semana: todos os workers Python processam corretamente
- [ ] **DELETAR `/home/wital/socialwise/worker/`** (diretório inteiro)
- [ ] DELETAR `tsconfig.worker.json`
- [ ] Remover scripts do `package.json`: `start:worker`, `build:workers`, `worker`
- [ ] Remover deps BullMQ-only do Next.js: `bullmq`, `ioredis` (se não usado em outro lugar)
- [ ] Remover `worker/registry.ts`, `worker/init.ts`
- [ ] Atualizar Docker Compose Socialwise: remover service `socialwise_worker`
- [ ] Next.js = **apenas frontend** (UI + BFF proxy + Auth.js)

---

# SEÇÃO C — Infra Compartilhada (Paralelo)

Tarefas que podem ser feitas em paralelo com A e B.

## C.1 — Auth Unificado

- [ ] Implementar `platform_core/auth/jwt.py` (decode JWT, verify)
- [ ] Implementar `platform_core/auth/nextauth.py` (verificar JWE NextAuth)
- [ ] Implementar `platform_core/auth/dependencies.py` (get_current_user, require_role)
- [ ] Implementar `platform_core/auth/middleware.py` (detecta JWT vs NextAuth vs API key)

## C.2 — AI Stack (LiteLLM + LangGraph)

- [ ] Implementar `platform_core/ai/litellm_config.py` (fallback, circuit breaker)
- [ ] Implementar `platform_core/ai/provider_manager.py` (seleção dinâmica de provider)
- [ ] Implementar `platform_core/ai/base_agent.py` (base class para agentes LangGraph)
- [ ] Implementar `platform_core/ai/cost_tracker.py` (callback → ai_cost_events)

## C.3 — Services Compartilhados

- [ ] Implementar `platform_core/services/storage.py` (MinIO/S3)
- [ ] Implementar `platform_core/services/email.py` (SMTP)
- [ ] Implementar `platform_core/services/chatwit_client.py` (HTTP client Chatwit)
- [ ] Implementar `platform_core/services/sse_manager.py` (Redis pub/sub → SSE)

## C.4 — Middleware Stack

- [ ] Copiar middleware do JusMonitorIA para `platform_core/middleware/`
- [ ] Registrar stack completo no `create_app()`: CORS → GZip → Security → RateLimit → Logging → Metrics → Cache → Audit

## C.5 — Observabilidade

- [ ] Implementar `platform_core/metrics/prometheus.py` (counters, gauges, histograms)
- [ ] Configurar health checks detalhados (DB, Redis, TaskIQ status)
- [ ] Structured logging em todos os workers (JSON com correlation_id)

## C.6 — Deploy Produção

- [ ] Build imagem de produção otimizada (multi-stage)
- [ ] Stack Docker Swarm: platform-api (réplicas), platform-worker-jm, platform-worker-sw
- [ ] Traefik routing para platform-backend
- [ ] Monitoramento: Prometheus/Grafana dashboards

---

# Resumo das Fases (Ordem de Execução)

| Fase | Seção | Descrição | Entregável |
|------|-------|-----------|------------|
| 0 | — | Scaffold platform-backend | ✅ **CONCLUÍDA** |
| 1 | A.1–A.5 | Mover JusMonitorIA backend | JusMonitorIA roda no platform-backend |
| 2 | A.6 | Verificação + cutover JusMonitorIA | Container antigo desligado |
| 3 | C.1–C.4 | Infra compartilhada (auth, AI, middleware) | Stack completo |
| 4 | B.1 | SQLAlchemy mirrors do Prisma | Models prontos |
| 5 | B.2 | Workers simples (cost, agendamento, leads) | 8 workers migrados |
| 6 | B.3 | Agentes IA OAB (LangGraph + LiteLLM) | 3 agents + 3 workers migrados |
| 7 | B.4 | Flow Engine workers (async) | 2 workers migrados (13/13 total) |
| 8 | B.5 | SocialWise Flow (classificação intents) | Pipeline classificação em Python |
| 9 | B.6 | Webhook + Flow Engine core | Webhook apontando para FastAPI |
| 10 | B.7 | Admin API routes | Next.js = apenas UI |
| 11 | B.8 | **DELETAR `worker/`** | 🎯 Marco final: pasta removida |
| 12 | C.5–C.6 | Observabilidade + deploy prod | Produção estável |

---

# Verificação por Fase

| Fase | Teste de Aceitação |
|------|-------------------|
| 1–2 | Todas as rotas JusMonitorIA respondem, workers processam, Alembic ok |
| 3 | Auth JWT/NextAuth funciona, LiteLLM chama providers, SSE funciona |
| 4 | SQLAlchemy lê/escreve corretamente no banco socialwise |
| 5 | Workers simples processam jobs side-by-side com BullMQ |
| 6 | Agents IA geram output equivalente ao TypeScript (A/B 100 leads) |
| 7 | Flow async executa de ponta a ponta via TaskIQ |
| 8 | Classificação retorna mesmos resultados (benchmark 200 mensagens) |
| 9 | Flow completo (sync + async) funciona end-to-end |
| 10 | Frontend funciona sem mudanças (proxy para FastAPI) |
| 11 | `worker/` deletada, zero BullMQ, Next.js = frontend puro |
| 12 | Produção estável com monitoramento completo |
