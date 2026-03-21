# Platform Backend — Plano de Migração Definitivo

> **Fonte única da verdade** para a unificação de Socialwise + JusMonitorIA em um backend Python compartilhado.
> Última atualização: 2026-03-21

## Changelog

### 2026-03-21

- **Reorganização de rotas frontend (sem impacto no backend)**:
  - Criada página roteadora `/hub` pós-login (substitui redirect direto para `/admin`).
  - Rotas de produto movidas de `/admin/` para `/mtf-diamante/`: mtf-diamante, MTFdashboard→dashboard, capitão, leads-chatwit→leads.
  - Rotas Gestão Social movidas de `/[accountid]/dashboard/` para `/gestao-social/[accountid]/dashboard/`.
  - `/admin/` agora é **SUPERADMIN-only** (monitoring, users, features, filas, disparos, templates, hooks, etc.).
  - **API routes NÃO mudaram** — `app/api/admin/mtf-diamante/*` e `app/api/admin/leads-chatwit/*` continuam nos mesmos paths.
  - Quando FastAPI assumir auth, o redirect pós-login deve apontar para `/hub`.
  - Nova estrutura de acesso: `/hub` (qualquer auth) → `/mtf-diamante` (ADMIN+SUPERADMIN) | `/gestao-social` (user com Instagram) | `/admin` (SUPERADMIN).
- **Seção B.7 expandida pelo grupo `Variáveis + Lotes`**: as rotas admin `app/api/admin/mtf-diamante/variaveis/*`, `lote-ativo` e `lotes/*` agora têm equivalentes FastAPI em `domains/socialwise/api/v1/endpoints/admin_mtf.py`, com lógica extraída para `domains/socialwise/services/flow/admin_mtf_service.py`.
- Corrigido gap do inventário original da B.7: o tab de configuração MTF não depende só de `variaveis`, mas também de `lotes/*`; o slice foi fechado verticalmente no mesmo backend Python para não deixar a UI dividida entre duas fontes.
- Expandido o mirror existente de `User` com `mtfVariaveisPopuladas`, necessário para manter paridade com o seed automático de variáveis MTF no backend Python.
- Corrigida lacuna funcional do fluxo legado de variáveis: quando a configuração existe mas só contém `lotes_oab` interno, o backend Python agora reidrata as variáveis editáveis padrão (`chave_pix`, `nome_do_escritorio_rodape`, `analise`) em vez de devolver a tela vazia após reset/import parcial.
- Validação da B.7.2: `docker compose exec -T platform-api python3 -m py_compile ...` OK; `docker compose exec -T platform-api python3 -m pytest tests/domains/socialwise -q` OK (`19 passed`); runtime do app real confirmou o registro das rotas `/api/v1/socialwise/admin/mtf-diamante/variaveis`, `/lotes` e `/lote-ativo`; `pnpm exec tsc --noEmit` e `pnpm exec tsc --noEmit -p tsconfig.worker.json` OK.
- **Seção B.7 iniciada pelo grupo `Flows`**: as rotas admin `app/api/admin/mtf-diamante/flows/*` agora têm equivalentes FastAPI em `domains/socialwise/api/v1/endpoints/admin_flows.py`, com lógica extraída para `domains/socialwise/services/flow/admin_service.py`.
- O Socialwise Next.js deixou de executar CRUD/import/export de flows diretamente nesse grupo: os route handlers viraram BFF proxies finos para o `platform-backend` usando `X-Internal-API-Key` + `X-App-User-Id`.
- Adicionado 1 mirror Prisma que a documentação original não listava para a B.7: `InboxFlowCanvas` em `domains/socialwise/db/models/inbox_flow_canvas.py`, necessário para fallback de export de flows legados sem `canvasJson`.
- Corrigido bug real omitido pela doc/rota TS: importação de flow agora sincroniza `FlowNode`/`FlowEdge` imediatamente no backend Python, evitando que o executor/analytics leiam um grafo vazio até o primeiro save manual do canvas.
- Corrigido bug defensivo da B.7: deleção de flow agora bloqueia explicitamente quando existem campanhas vinculadas, em vez de estourar erro de integridade no banco no commit final.
- Validação da B.7.1: `docker compose exec -T platform-api python3 -m py_compile ...` OK; `docker compose exec -T platform-api python3 -m pytest tests/domains/socialwise -q` OK (`16 passed`); runtime do app real confirmou o registro da rota `/api/v1/socialwise/admin/mtf-diamante/flows`; `pnpm exec tsc --noEmit` e `pnpm exec tsc --noEmit -p tsconfig.worker.json` OK.
- **Seção B.6 entrou em fase de cutover**: webhook FastAPI, `FlowOrchestrator`, `FlowExecutor`, `SyncBridge` e persistência de sessão/contexto já foram portados para Python; o pendente real ficou restrito ao apontamento do Chatwit para o FastAPI e ao teste live end-to-end.
- Fechada a lacuna deixada na B.5: o webhook FastAPI agora persiste histórico/contexto de sessão do Router LLM em Redis (`session_state.py`), reaproveita isso no `process_socialwise_intent()` e bloqueia reoferta imediata da intent ativa.
- Fechada a lacuna deixada na B.4: `EXECUTE_CONTACT` em `domains/socialwise/tasks/flow_campaign.py` agora executa o flow real via `FlowOrchestrator.execute_flow_by_id()` em vez de apenas resolver conversa e marcar contato como `SENT`.
- Adicionados 2 mirrors Prisma que a documentação original não listava para a B.6: `InteractiveContent` (+ `Body`, `Header`, `Footer`, `ActionCtaUrl`, `ActionReplyButton`) e `LeadPayment`.
- Criados `domains/socialwise/api/v1/endpoints/webhook.py` e `webhook_init.py`; `domains/socialwise/plugin.py` agora registra as rotas reais `/api/integrations/webhooks/socialwiseflow` e `/api/integrations/webhooks/socialwiseflow/init`.
- Criados `domains/socialwise/services/flow/orchestrator.py`, `executor.py`, `runtime.py`, `sync_bridge.py` e `payment_handler.py`, completando o core do Flow Engine no `platform-backend`.
- Corrigidas omissões reais descobertas no compose: `save_chatwit_system_config()` estava sem `commit()`, `VariableResolver` assumia `dict` e quebrava com `DeliveryContext`, `Body/Header/Footer/ActionCtaUrl/ActionReplyButton` não possuem timestamps no banco real, `FlowSession`/`FlowCampaign`/`FlowCampaignContact` usam enums nativos do Postgres e `SocialwiseModel` precisava preencher `createdAt`/`updatedAt` no insert para tabelas Prisma com `@updatedAt`.
- Endurecido `FlowOrchestrator`: quando `DeliveryContext` chega sem `chatwit_base_url`/token, o runtime agora hidrata esses campos automaticamente a partir de `SystemConfig`, evitando falha artificial fora do webhook/campaign worker.
- Corrigido bug de runtime do FlowExecutor: `INTERACTIVE_MESSAGE` agora resolve `messageId` a partir de `Template`/`InteractiveContent`, com eager-load completo dos relacionamentos necessários, e o parse monetário voltou a espelhar o TS (`2790` continua sendo `2790` centavos).
- Validação da B.6: `python -m pytest tests/domains/socialwise -q` OK (`12 passed`) dentro do compose após instalação efêmera de `pytest`/`pytest-asyncio`; imports/`py_compile` do core FastAPI/Flow OK; runtime real no compose validou leitura de template interativo por `messageId` e execução de `execute_flow_by_id()` até a fronteira externa de delivery (`WHATSAPP_TEMPLATE`).
- **Seção B.5 implementada**: pipeline de classificação de intenções do SocialWise Flow portado para Python, com processor reutilizável para a B.6.
- Adicionados 2 mirrors Prisma que a documentação original omitia para a B.5: `Intent` e `AiAssistantInbox`.
- Expandido `domains/socialwise/db/models/ai_assistant.py` com o subset real usado pelo pipeline de intents (deadlines, fallback model/provider, flags de handoff/sugestão, session TTL).
- Implementado `platform_core/ai/litellm_config.py` com `call_embedding()` compartilhado via LiteLLM para o classificador SocialWise.
- Criado o pacote `domains/socialwise/services/intent/` com `types.py`, `assistant_config.py`, `cache.py`, `classification.py`, `provider_processor.py`, `bands.py`, `button_processor.py`, `payload_builder.py` e `processor.py`.
- Corrigido bug implícito do pipeline TypeScript: `IntentCandidate.slug` agora usa o `Intent.slug` real em vez de reaproveitar `Intent.name`, evitando payloads inválidos quando nome e slug divergem.
- Corrigido bug de mirror descoberto em runtime: `AiAssistantInbox` não possui `updatedAt` no banco real; o model Python foi ajustado para `createdAt`-only.
- Corrigido bug de mirror descoberto em runtime: a coluna `AiAssistant.thinkingLevel` não existe no banco Socialwise atual; o model Python foi ajustado para refletir o schema real validado no compose.
- Validação da B.5: runtime real no compose OK (consultas `ChatwitInbox`/`AiAssistant`/`Intent`, `load_assistant_configuration()`, `process_socialwise_intent()`), `python -m pytest tests/domains/socialwise/intent` OK (`7 passed`) via instalação efêmera de `pytest`/`pytest-asyncio` no container, `tsc --noEmit` OK, `git diff --check` OK.
- Gap explícito mantido para a B.6: persistência de contexto/sessão do Router LLM e anti-loop contextual continuam dependentes da migração do webhook/session-manager.
- **Seção B.4 concluída**: Flow Engine Workers portados para Python (FlowBuilder 6 job types + FlowCampaign 3 job types + orchestrator).
- Adicionado 1 novo mirror Prisma: `ChatwitInbox` em `domains/socialwise/db/models/chatwit_inbox.py` — dependência da B.4 que a doc original omitia (lookup inbox → accountId + channelType para campanhas).
- Implementado `domains/socialwise/services/flow/delivery_service.py` — `ChatwitDeliveryService` (axios → httpx, retry 3x com exponential backoff, 7 delivery types: text, media, interactive, template, reaction, chatwit_action, update_contact).
- Implementado `domains/socialwise/services/flow/conversation_resolver.py` — `ChatwitConversationResolver` (search/create contact + conversation no Chatwit via httpx).
- Implementado `domains/socialwise/services/flow/chatwit_config.py` — `get_chatwit_system_config()` (bot token + base URL do SystemConfig com cache 5min + fallback ENV).
- Implementado `domains/socialwise/services/flow/variable_resolver.py` — `VariableResolver` (resolve `{{var}}` com chain: session → contact → conversation → system; suporta dot notation e underscore).
- Implementado `domains/socialwise/services/flow/mtf_variables.py` — Resolução de variáveis MTF Diamante (normais + lotes OAB, lote_ativo com complemento, lotes vencidos com ~strikethrough~, cache Redis 10min).
- Implementado `domains/socialwise/services/flow/mtf_loader.py` — `load_mtf_variables_for_inbox()` (resolve inbox → userId → variáveis MTF + derivação de _centavos para pagamentos).
- Criada task `domains/socialwise/tasks/flow_builder.py` — `process_flow_builder_task` (6 handlers: CHATWIT_ACTION, HTTP_REQUEST, TAG_ACTION, WEBHOOK_NOTIFY, DELAY, MEDIA_UPLOAD).
- Criada task `domains/socialwise/tasks/flow_campaign.py` — `process_flow_campaign_task` (3 handlers: EXECUTE_CONTACT, PROCESS_BATCH, CAMPAIGN_CONTROL) + funções de orquestração (`check_campaign_completion`, batch processing, pause/cancel/resume).
- Nota arquitetural histórica da B.4: nesta fase o worker de campanhas ainda não executava o flow real. Essa lacuna foi fechada na B.6 com a integração de `EXECUTE_CONTACT` ao `FlowOrchestrator` Python.
- Validação: `ast.parse` 11/11 OK, Docker imports OK, `tsc --noEmit` OK, `git diff --check` OK.
- **Seção B.3 concluída**: Agentes IA OAB portados para Python (LiteLLM, sem LangGraph — pipelines determinísticos 1:1).
- Implementado `platform_core/ai/litellm_config.py` — shared LiteLLM config com CircuitBreaker, retry com jitter, vision support, structured output (`call_completion`, `call_vision`, `call_vision_multi`, `call_structured`).
- Implementado `platform_core/ai/cost_tracker.py` — `track_cost()` e `track_cost_batch()` persistem CostEvent rows via SQLAlchemy session.
- Adicionados 2 novos mirrors Prisma: `AiAgentBlueprint` e `AiAssistant` em `domains/socialwise/db/models/`.
- Portados 6 módulos de suporte em `domains/socialwise/services/oab_eval/`: `operation_control.py` (Redis cancel/SSE), `runtime_policy.py` (timeout/token budget), `rubric_scoring.py` (score sanitization), `blueprint_config.py` (4-tier config resolution).
- Portados 3 agentes determinísticos: `transcription_agent.py` (OCR 3-level fallback, concurrent pages, segment split/organize), `mirror_generator.py` (vision extraction + rubric reconciliation), `analysis_agent.py` (comparative analysis + deterministic gabarito injection).
- Criadas 3 tasks TaskIQ: `process_transcription_task` (SSE throttle 800ms, batch cost events), `process_mirror_generation_task`, `process_analysis_generation_task`.
- Decisão arquitetural: LangGraph/ReAct **NÃO usado** — os workflows OAB são pipelines determinísticos bem definidos, portados 1:1 como funções async. Vision client unificado absorvido pelo LiteLLM nativo.
- `ai-retry-fallback.ts` absorvido pelo LiteLLM fallback nativo + `with_retry()` com jitter em `litellm_config.py`.
- `unified-vision-client.ts` absorvido: LiteLLM suporta vision nativamente via content parts `image_url`.
- Validação: `ast.parse` 16/16 OK, imports Docker OK, lógica (rubric scoring, runtime policy, operation control) OK, tsc --noEmit OK, git diff --check OK.
- **Seção B.2.3 concluída**: `LeadCells` e `LeadsChatwit` portados para TaskIQ em `domains/socialwise/tasks/`.
- Adicionados 2 mirrors Prisma que a documentação original omitia: `Chat` e `ArquivoLeadOab`.
- Portados 4 serviços de suporte em Python em `domains/socialwise/services/leads/`: `sanitize_payload.py`, `normalize_payload.py`, `lead_service.py` e `process_sync.py`.
- Criadas 2 tasks TaskIQ: `process_lead_cell_task` (manuscrito/espelho/análise) e `process_lead_chatwit_task` (sync de leads do Chatwit).
- SSE notification via Redis pub/sub no canal `sse:lead:<leadId>` (compatível com o Next.js SSE manager existente).
- Nota: `generatePdfInternally` do leadcells.task.ts original (usa pdf-lib no Next.js) NÃO foi portada — PDFs devem chegar com URLs pré-geradas ou ser gerados antes do enqueue.
- Validação Python da B.2.3: `ast.parse` OK em 11 arquivos novos; import de models/services/tasks OK dentro do compose; `git diff --check` OK.
- Validação TypeScript: `tsc --noEmit` e `tsc --noEmit -p tsconfig.worker.json` OK.
- **Tarefa adicionada (B.9)**: Adaptar `dev.sh` e `build.sh` do Socialwise para o padrão pós-migração (seguir o mesmo padrão do JusMonitorIA documentado em A.7).
- **Seção B.2.2 concluída**: `Agendamento`, `WebhookDelivery` e `InstagramWebhook` portados para TaskIQ em `domains/socialwise/tasks/`.
- Adicionados 8 mirrors Prisma de suporte que a documentação original não listava, mas que eram dependência real da B.2.2: `User`, `Account`, `Midia`, `Automacao`, `LeadAutomacao`, `LeadInstagramProfile`, `WebhookConfig` e `WebhookDelivery`.
- Portados os serviços mínimos da B.2.2 em Python: `agendamento.py`, `webhook_delivery.py` e `instagram_webhook.py`.
- Criado `domains/socialwise/tasks/scheduler.py` com `LabelScheduleSource` + `ListRedisScheduleSource`, e o `docker-compose.yml` do `platform-backend` agora sobe `platform-scheduler-socialwise`.
- Endurecido o parse de `platform_core/config.py` para aceitar `DEBUG=release/prod` sem quebrar o bootstrap local do `Settings`.
- Corrigido bug legado no worker TypeScript de Instagram: lookup de lead usava `lead.id = senderId`; agora usa a identidade real do Instagram (`source=INSTAGRAM`, `sourceIdentifier`, `accountId`).
- Corrigido bug legado nas rotas admin de webhook: os validadores Zod exigiam UUID, mas os IDs reais são CUID/String.
- Validação Python da B.2.2: `py_compile` OK em 22 arquivos novos/alterados; import das tasks e do scheduler Socialwise OK.
- Validação runtime do banco Socialwise agora executada dentro do compose: consultas reais a `Agendamento`, `WebhookDelivery` e `Automacao` funcionaram sem erro no Postgres da rede Docker (`0/0/0` rows no banco dev local atual).
- **Seção B.2.1 concluída**: `FxRate`, `BudgetMonitor` e `CostEvents` portados para TaskIQ em `domains/socialwise/tasks/`.
- Criado `domains/socialwise/db/session_compat.py` para workers/scripts Socialwise usando a factory multi-DB do `platform-backend`.
- Adicionados mirrors Prisma que faltavam para o stack de custos: `PriceCard`, `FxRate`, `CostBudget` e `AuditLog`.
- Portados os serviços mínimos de custo em Python: `pricing.py`, `idempotency.py`, `audit.py`, `fx_rate.py` e `budget_controls.py`.
- Validação de código da B.2.1: imports + registro de tasks OK, `compile()` sintático OK em 14 arquivos, `git diff --check` OK no escopo `domains/socialwise`.
- A pendência de validação runtime do banco na B.2.1 foi resolvida na B.2.2 via compose; fora do host puro o `.env` continua dependente da rede Docker `minha_rede`.
- **Seção B.1 concluída**: 18 modelos SQLAlchemy mirror criados em `domains/socialwise/db/models/` (15 Prisma tables + 3 enums exportados).
- Criado `SocialwiseBase` (DeclarativeBase) e `SocialwiseModel` (CUID pk + timestamps) em `domains/socialwise/db/base.py`.
- CRUD validado em runtime: todas as 18 tabelas lêem corretamente do banco socialwise real (573 leads, 8 flows, 253 sessions, 889 cost events).
- Relationships testadas: Lead → LeadOabData (selectin), Flow → FlowNode (selectin), FlowCampaign → FlowCampaignContact.
- Corrigida a documentação para deixar explícito que os scripts `build.sh` e `dev.sh` analisados nesta etapa pertencem ao workspace do JusMonitorIA, não ao Socialwise.
- Registrada a estabilização pós-migração do domínio JusMonitorIA no `platform-backend`, incluindo correções de runtime e de nomes/imports validadas em ambiente real.
- Adicionada seção específica descrevendo o padrão operacional atual dos scripts `JusMonitorIA/dev.sh` e `JusMonitorIA/build.sh`.

### 2026-03-20

- Consolidação inicial do plano de migração e conclusão da Seção A (migração do backend JusMonitorIA para `domains/jusmonitoria/`).

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
│  IA: LiteLLM (multi-modelo) + pipelines determinísticos │
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
| Workflows agentic | **LangGraph** (StateGraph — apenas se necessário) / pipelines determinísticos (OAB) |
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

### ✅ Fase 1 — Seção A: Migração JusMonitorIA (CONCLUÍDA 2026-03-20)

| Item | Status |
|------|--------|
| `domains/jusmonitoria/db/base.py` — JusMonitorIABase + BaseModel + TenantBaseModel | ✅ |
| `domains/jusmonitoria/db/models/` — 36 modelos copiados, imports reescritos | ✅ |
| `domains/jusmonitoria/db/repositories/` — 27 repositórios copiados | ✅ |
| `domains/jusmonitoria/schemas/` — 24 schemas copiados | ✅ |
| `domains/jusmonitoria/api/v1/endpoints/` — 26 endpoints + router + websocket + notifications | ✅ |
| `domains/jusmonitoria/services/` — 22+ services (certificados, crm, dashboard, datajud, peticoes, search, tpu) | ✅ |
| `domains/jusmonitoria/ai/` — 5 agents + providers + workflows | ✅ |
| `domains/jusmonitoria/auth/` — JWT + dependencies + password | ✅ |
| `domains/jusmonitoria/tasks/` — 15 tasks + scheduler + events | ✅ |
| `domains/jusmonitoria/alembic/versions/` — 23 migrations copiadas | ✅ |
| `domains/jusmonitoria/alembic/env.py` — async Alembic com JusMonitorIABase metadata | ✅ |
| `domains/jusmonitoria/plugin.py` — 27 routers registrados + WebSocket + lifecycle | ✅ |
| `platform_core/middleware/` — 9 middleware compartilhados (audit, cache, compression, logging, metrics, rate_limit, security, shutdown) | ✅ |
| `platform_core/config.py` — Atualizado com todas as settings JM-specific | ✅ |
| Zero `from app.` imports residuais — 234 arquivos Python validados | ✅ |
| Correções pós-cutover validadas em runtime (imports, compat layer, scheduler, nomes de serviços/eventos) | ✅ |

### ✅ Fase 4 — Seção B.1: SQLAlchemy Models Socialwise (CONCLUÍDA 2026-03-21)

| Item | Status |
|------|--------|
| `domains/socialwise/db/base.py` — SocialwiseBase + SocialwiseModel (CUID pk) | ✅ |
| `domains/socialwise/db/models/` — 29 modelos mirror do Prisma (26 arquivos; expandido na B.2.2, B.2.3 e B.4) | ✅ |
| `domains/socialwise/db/models/__init__.py` — Todos os modelos e enums exportados | ✅ |
| CRUD read validado em runtime — 18/18 tabelas lidas com dados reais | ✅ |
| Relationships testadas (Lead→LeadOabData, Flow→FlowNode, FlowCampaign→Contacts) | ✅ |
| Tabelas de suporte da B.2.2 consultadas via compose (`Agendamento`, `WebhookDelivery`, `Automacao`) | ✅ |
| Tabelas de suporte da B.2.3 adicionadas (`Chat`, `ArquivoLeadOab`) — import validado no compose | ✅ |
| Tabela de suporte da B.4 adicionada (`ChatwitInbox`) — import validado no compose | ✅ |

### ✅ Fase 6 — Seção B.4: Flow Engine Workers (CONCLUÍDA 2026-03-21)

| Item | Status |
|------|--------|
| `domains/socialwise/db/models/chatwit_inbox.py` — Mirror ChatwitInbox | ✅ |
| `domains/socialwise/services/flow/delivery_service.py` — ChatwitDeliveryService (httpx, retry 3x) | ✅ |
| `domains/socialwise/services/flow/conversation_resolver.py` — ChatwitConversationResolver | ✅ |
| `domains/socialwise/services/flow/chatwit_config.py` — SystemConfig bot token + base URL (cache 5min) | ✅ |
| `domains/socialwise/services/flow/variable_resolver.py` — VariableResolver ({{var}} chain) | ✅ |
| `domains/socialwise/services/flow/mtf_variables.py` — MTF Diamante resolver (normais + lotes OAB) | ✅ |
| `domains/socialwise/services/flow/mtf_loader.py` — MTF loader inbox → variáveis (Redis cache) | ✅ |
| `domains/socialwise/tasks/flow_builder.py` — 6 job types (CHATWIT_ACTION, HTTP_REQUEST, TAG_ACTION, WEBHOOK_NOTIFY, DELAY, MEDIA_UPLOAD) | ✅ |
| `domains/socialwise/tasks/flow_campaign.py` — 3 job types (EXECUTE_CONTACT, PROCESS_BATCH, CAMPAIGN_CONTROL) + orchestrator | ✅ |
| ast.parse 11/11 OK, Docker imports OK, tsc --noEmit OK | ✅ |
| Integração com FlowOrchestrator (execução real do flow) | ⏳ pendente (B.6) |

### 🟡 Fase 10 — Seção B.7: Admin API Routes (INICIADA 2026-03-21)

| Item | Status |
|------|--------|
| `domains/socialwise/api/v1/endpoints/admin_flows.py` — grupo `Flows` (GET/POST/PATCH/PUT/DELETE/import/export) | ✅ |
| `domains/socialwise/services/flow/admin_service.py` — lógica extraída dos route handlers Next.js | ✅ |
| `domains/socialwise/services/flow/canvas_sync.py` — materialização `canvasJson` → `FlowNode`/`FlowEdge` | ✅ |
| `domains/socialwise/services/flow/export_import.py` — import/export n8n-style no backend Python | ✅ |
| `domains/socialwise/db/models/inbox_flow_canvas.py` — fallback de export para flows legados | ✅ |
| `domains/socialwise/api/v1/endpoints/admin_mtf.py` — grupo `Variáveis + Lotes` (`variaveis`, `variaveis/seed`, `lote-ativo`, `lotes`) | ✅ |
| `domains/socialwise/services/flow/admin_mtf_service.py` — seed automático, variáveis MTF, `lotes_oab`, cache invalidation | ✅ |
| `socialwise/lib/platform-backend/admin-proxy.ts` — BFF proxy com `X-Internal-API-Key` + `X-App-User-Id` | ✅ |
| `app/api/admin/mtf-diamante/flows/*` apontando para FastAPI | ✅ |
| `app/api/admin/mtf-diamante/variaveis/*`, `lote-ativo`, `lotes/*` apontando para FastAPI | ✅ |
| Templates / Campanhas / Leads / Analytics / Cost / OAB | ⏳ pendente |
| SSE admin FastAPI | ⏳ pendente |
| Validação frontend end-to-end do grupo `Flows` via UI real | ⏳ pendente |

### ✅ Fase 7 — Seção B.5: SocialWise Flow (Intent Classification) (CONCLUÍDA 2026-03-21)

| Item | Status |
|------|--------|
| `domains/socialwise/db/models/intent.py` — Mirror Intent | ✅ |
| `domains/socialwise/db/models/ai_assistant_inbox.py` — Mirror AiAssistantInbox | ✅ |
| `domains/socialwise/services/intent/assistant_config.py` — resolução assistant/inbox + overrides | ✅ |
| `domains/socialwise/services/intent/cache.py` — cache Redis namespaced (classification/warmup/embedding) | ✅ |
| `domains/socialwise/services/intent/classification.py` — embedding-first classifier com HARD/SOFT/ROUTER | ✅ |
| `domains/socialwise/services/intent/provider_processor.py` — warmup/router via LiteLLM | ✅ |
| `domains/socialwise/services/intent/bands.py` — handlers por banda | ✅ |
| `domains/socialwise/services/intent/button_processor.py` — detecção `flow_`, `@falar_atendente`, `intent:` | ✅ |
| `domains/socialwise/services/intent/payload_builder.py` — payloads interativos para WhatsApp/Instagram/Facebook | ✅ |
| `domains/socialwise/services/intent/processor.py` — entry-point plugável na B.6 | ✅ |
| `platform_core/ai/litellm_config.py` — `call_embedding()` compartilhado | ✅ |
| Testes unitários Python (`7 passed`) no compose | ✅ |
| Runtime compose (`ChatwitInbox`/`AiAssistant`/`Intent` + processor) | ✅ |
| Benchmark A/B com 200 mensagens reais | ⏳ pendente (dataset/prod) |
| Persistência de sessão/contexto do Router LLM no webhook FastAPI | ⏳ plugar na B.6 |

### ✅ Fase 5 — Seção B.3: Agentes IA OAB (CONCLUÍDA 2026-03-21)

| Item | Status |
|------|--------|
| `platform_core/ai/litellm_config.py` — CircuitBreaker, retry+jitter, vision, structured output | ✅ |
| `platform_core/ai/cost_tracker.py` — `track_cost` + `track_cost_batch` via SQLAlchemy | ✅ |
| `domains/socialwise/db/models/ai_agent_blueprint.py` — Mirror AiAgentBlueprint | ✅ |
| `domains/socialwise/db/models/ai_assistant.py` — Mirror AiAssistant | ✅ |
| `domains/socialwise/services/oab_eval/operation_control.py` — CancelMonitor + SSE emit | ✅ |
| `domains/socialwise/services/oab_eval/runtime_policy.py` — Timeout/token budget | ✅ |
| `domains/socialwise/services/oab_eval/rubric_scoring.py` — Score sanitization + verification | ✅ |
| `domains/socialwise/services/oab_eval/blueprint_config.py` — 4-tier config resolution | ✅ |
| `domains/socialwise/services/oab_eval/transcription_agent.py` — OCR pipeline (3-level fallback, concurrent) | ✅ |
| `domains/socialwise/services/oab_eval/mirror_generator.py` — Vision extraction + rubric reconciliation | ✅ |
| `domains/socialwise/services/oab_eval/analysis_agent.py` — Comparative analysis + gabarito injection | ✅ |
| `domains/socialwise/tasks/transcription.py` — TaskIQ task (SSE throttle 800ms, batch cost) | ✅ |
| `domains/socialwise/tasks/mirror_generation.py` — TaskIQ task | ✅ |
| `domains/socialwise/tasks/analysis_generation.py` — TaskIQ task | ✅ |
| ast.parse 16/16 OK, Docker imports OK, tsc --noEmit OK | ✅ |
| Validação A/B Python vs TypeScript em 100 leads | ⏳ pendente (requer prod) |

### Stubs (a implementar nas próximas fases)

- `platform_core/auth/` — JWT + NextAuth verification (compartilhado)
- ~~`platform_core/ai/` — LiteLLM config, cost tracker~~ ✅ Implementado na B.3
- `platform_core/services/` — Storage (MinIO), email, chatwit client, SSE manager (compartilhado)

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

- [x] Copiar `app/db/models/` → `domains/jusmonitoria/db/models/` (36 arquivos)
- [x] Copiar `app/db/repositories/` → `domains/jusmonitoria/db/repositories/` (27 arquivos)
- [x] Criar `JusMonitorIABase(DeclarativeBase)` em `domains/jusmonitoria/db/base.py`
- [x] Atualizar imports: `app.db.` → `domains.jusmonitoria.db.` e `app.core.` → `platform_core.`
- [x] Mover Alembic versions → `domains/jusmonitoria/alembic/versions/` (23 migrations)
- [x] Atualizar `domains/jusmonitoria/alembic/env.py` com target_metadata real
- [ ] Verificar: `alembic -n jusmonitoria upgrade head` funciona (pendente — requer DB conectado)

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

- [x] Copiar schemas (24 arquivos) e endpoints (26 arquivos)
- [x] Atualizar imports (19 patterns de sed bulk)
- [x] Registrar router no `JusMonitorIAPlugin.register_routes()` (27 routers)
- [ ] Verificar: todos os endpoints respondem em `/api/v1/jusmonitoria/*` (pendente — requer runtime)

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

- [x] Copiar services (22+ arquivos + 6 subdirs) e agents (5 agentes + providers + workflows)
- [ ] Mover `storage.py` e `email_service.py` para `platform_core/services/` (compartilhados) — adiado para Seção C
- [ ] Mover `BaseAgent` para `platform_core/ai/base_agent.py` (compartilhado) — adiado para Seção C
- [ ] Mover `litellm_config.py` e `provider_manager.py` para `platform_core/ai/` (compartilhados) — adiado para Seção C
- [x] Atualizar imports em todos os arquivos
- [ ] Verificar: agentes IA executam corretamente (pendente — requer runtime + LLM keys)

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

- [x] Copiar tasks (15 arquivos + scheduler + events), reregistrar no `broker_jm`
- [x] Atualizar imports: `app.workers.` → `domains.jusmonitoria.tasks.`
- [ ] Verificar: `taskiq worker platform_core.tasks.brokers.jusmonitoria:broker_jm --tasks-pattern="domains/jusmonitoria/tasks/**/*.py"` processa tasks (pendente — requer runtime)

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

- [x] Copiar middleware compartilhados para `platform_core/middleware/` (9 arquivos)
- [x] Manter `tenant.py` como middleware de domínio (`domains/jusmonitoria/middleware_tenant.py`)
- [x] Copiar `app/core/auth/` → `domains/jusmonitoria/auth/` (JWT + dependencies + password)
- [ ] Registrar middleware stack no `create_app()` (pendente — requer integração no app.py)

---

## A.6 — Verificação Final JusMonitorIA

> **Código migrado em 2026-03-20 e validado em runtime em 2026-03-21.** Restam apenas validações funcionais que dependem de credenciais externas de LLM.

- [x] 234 arquivos Python copiados, 0 erros de syntax, 0 `from app.` residuais
- [x] Plugin registra 27 routers + WebSocket + lifecycle (scheduler + TPU)
- [x] Alembic env.py configurado com JusMonitorIABase metadata (async)
- [x] Config atualizado com todas as settings JM-specific
- [x] Todas as rotas em `/api/v1/jusmonitoria/*` respondem em runtime (155 rotas validadas)
- [x] Worker JusMonitorIA processa tasks no TaskIQ em runtime (14/14 imports sem erro)
- [x] Alembic migrations rodam sem erro nos bancos envolvidos (`head` atingido)
- [x] Auth JWT responde 401 corretamente em rotas protegidas
- [x] Docker Compose do frontend/scraper JusMonitorIA aponta para `platform-backend`
- [x] Container antigo do backend JusMonitorIA deixou de ser a fonte de execução local
- [x] Agentes IA importam corretamente; execução funcional completa depende de LLM keys

### Correções pós-migração validadas

| Correção | Causa raiz | Status |
|----------|------------|--------|
| `TimestampMixin` restaurado | Mixin ausente no `base.py` migrado | ✅ |
| Path `tasks.tasks` corrigido | Reescrita gerou path duplicado em imports | ✅ |
| `@asynccontextmanager` em `session_compat.py` | Gerador assíncrono sem wrapper de context manager | ✅ |
| Scheduler usando `iscoroutine(result)` | `iscoroutinefunction` falhava com wrappers do TaskIQ | ✅ |
| `ChatwitService` → `ChatwitClient` | Nome antigo não existia no código migrado | ✅ |
| `publish_event` → `publish` | API real do componente de eventos tinha nome diferente | ✅ |

## A.7 — Padrão Operacional dos Scripts JusMonitorIA

> Esta seção descreve apenas os scripts do JusMonitorIA, localizados em `/home/wital/JusMonitorIA/`. Não se refere aos scripts do Socialwise.

Após o cutover para o `platform-backend`, o JusMonitorIA passou a operar com separação explícita entre backend compartilhado e serviços específicos do produto.

### `dev.sh` — responsabilidade atual

O script `JusMonitorIA/dev.sh` gerencia o ambiente local do JusMonitorIA com este fluxo:

1. Garante a rede compartilhada `minha_rede`.
2. Verifica a infra compartilhada e sobe `postgres` + `redis` apenas se ainda não estiverem ativos.
3. Verifica o `platform-backend` em `/home/wital/platform-backend` e sobe os containers compartilhados se necessário.
4. Aguarda o container `platform-api` ficar `healthy` antes de continuar.
5. Sobe apenas os serviços locais do compose do JusMonitorIA: `frontend` + `scraper`.

Implicações práticas:

- O backend e os workers não são mais responsabilidade direta do compose local principal do JusMonitorIA.
- O comando padrão `./dev.sh` virou um orquestrador de camadas: infra compartilhada → platform-backend → frontend/scraper JM.
- O comando `./dev.sh frontend` pressupõe `platform-api` já ativo e sobe só a camada de borda do produto.
- Operações de migration e seed são executadas via `docker exec platform-api ...`, reforçando que a fonte de execução backend agora é o `platform-backend`.

### `build.sh` — responsabilidade atual

O script `JusMonitorIA/build.sh` é o entry-point de build e push de produção do JusMonitorIA após a migração.

Ele suporta estes modos:

- `./build.sh` → builda `platform-backend` + `frontend` + `scraper`
- `./build.sh --platform-only` → builda só `platform-backend`
- `./build.sh --frontend-only` → builda só `frontend`
- `./build.sh --scraper-only` → builda só `scraper`

Padrão de deploy documentado no script:

- `backend` e `worker` em produção usam a mesma imagem `witrocha/platform-backend`
- `frontend` usa `witrocha/jusmonitoria-frontend`
- `scraper` usa `witrocha/jusmonitoria-scraper`
- Quando Portainer está configurado, o script faz `force-update` seletivo por serviço via Docker Proxy API

### Regra operacional consolidada

Para o JusMonitorIA, o padrão correto após a migração é:

- `platform-backend` concentra API e workers compartilhados
- O workspace JusMonitorIA concentra frontend, scraper e scripts de orquestração do produto
- `dev.sh` do JusMonitorIA prepara dependências e sobe apenas a borda do produto depois que a camada compartilhada está pronta
- `build.sh` do JusMonitorIA é o ponto único de build/deploy das imagens do produto, incluindo a imagem compartilhada do `platform-backend` quando aplicável

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
| 7 | InstagramWebhook | `instagram-webhooks` | Nenhum | ✅ |
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

## B.1 — SQLAlchemy Models (Mirror do Prisma) ✅ CONCLUÍDA 2026-03-21

O database `socialwise` é gerenciado pelo Prisma. SQLAlchemy faz **read/write mirror** — sem Alembic, sem migrations.

### Arquivos criados

| Arquivo | Modelos | Linhas |
|---------|---------|--------|
| `domains/socialwise/db/base.py` | `SocialwiseBase`, `SocialwiseModel` | Base CUID pk + timestamps |
| `domains/socialwise/db/models/lead.py` | `Lead`, `LeadSource` | 573 rows validados |
| `domains/socialwise/db/models/lead_oab_data.py` | `LeadOabData` | Relationships Lead + UsuarioChatwit |
| `domains/socialwise/db/models/espelho_padrao.py` | `EspelhoPadrao`, `EspecialidadeJuridica` | 7 rows validados |
| `domains/socialwise/db/models/mapeamento_botao.py` | `MapeamentoBotao`, `ActionType` | 33 rows validados |
| `domains/socialwise/db/models/mapeamento_intencao.py` | `MapeamentoIntencao` | FK → Flow, 14 rows |
| `domains/socialwise/db/models/flow.py` | `Flow`, `FlowNode`, `FlowEdge` | 8 flows, 23+ nodes |
| `domains/socialwise/db/models/flow_session.py` | `FlowSession`, `FlowSessionStatus` | 253 sessions |
| `domains/socialwise/db/models/flow_campaign.py` | `FlowCampaign`, `FlowCampaignContact` + enums | Cascading relationships |
| `domains/socialwise/db/models/agendamento.py` | `Agendamento` | Sem updatedAt |
| `domains/socialwise/db/models/midia.py` | `Midia` | Dependência direta do worker de agendamento |
| `domains/socialwise/db/models/user.py` | `User` | Suporte para payload do agendamento |
| `domains/socialwise/db/models/account.py` | `Account` | Tokens/IDs do Instagram |
| `domains/socialwise/db/models/automacao.py` | `Automacao` | Regras do Instagram webhook |
| `domains/socialwise/db/models/lead_automacao.py` | `LeadAutomacao` | Estado por lead no Instagram |
| `domains/socialwise/db/models/lead_instagram_profile.py` | `LeadInstagramProfile` | Estado de follower |
| `domains/socialwise/db/models/usuario_chatwit.py` | `UsuarioChatwit` | 1 row (produção) |
| `domains/socialwise/db/models/system_config.py` | `SystemConfig` | 2 rows (chatwit tokens) |
| `domains/socialwise/db/models/template.py` | `Template`, `TemplateType/Scope/Status` | 62 rows |
| `domains/socialwise/db/models/cost_event.py` | `CostEvent`, `Provider/Unit/EventStatus` | 889 rows |
| `domains/socialwise/db/models/webhook_config.py` | `WebhookConfig` | Configuração de webhooks outbound |
| `domains/socialwise/db/models/webhook_delivery.py` | `WebhookDelivery`, `WebhookEvent` | Histórico de entregas |
| `domains/socialwise/db/models/mtf_diamante.py` | `MtfDiamanteConfig`, `MtfDiamanteVariavel` | FK cascade |
| `domains/socialwise/db/models/chat.py` | `Chat` | Relationship Lead + Account |
| `domains/socialwise/db/models/arquivo_lead_oab.py` | `ArquivoLeadOab` | Arquivos por LeadOabData |
| `domains/socialwise/db/models/chatwit_inbox.py` | `ChatwitInbox` | Dependência da B.4 (FlowCampaign EXECUTE_CONTACT) |
| `domains/socialwise/db/models/__init__.py` | Todos os 29 models + enums exportados | Package init |

### Decisões de design

- **CUID String IDs** (`String(30)`) em vez de UUIDs — espelhando o `@default(cuid())` do Prisma
- **Column names mapeados** via primeiro arg de `mapped_column("camelCase", ...)` para preservar nomes Prisma (camelCase) com atributos Python (snake_case)
- **ForeignKey entre tabelas operacionais mirrored** — a B.2.2 adicionou mirrors de `User`, `Account` e outras dependências reais dos workers; FKs para tabelas ainda não mirrored continuam plain `String`
- **Relationships selectin** para joins frequentes (Lead→LeadOabData, Flow→FlowNode, FlowCampaign→Contacts)
- `FlowCampaign` e `FlowCampaignContact` adicionados além do inventário original — necessários para o worker de campanhas

### Tarefas

- [x] Criar `SocialwiseBase` e `SocialwiseModel` em `domains/socialwise/db/base.py`
- [x] Criar modelos mirror para todas as tabelas necessárias do inventário core (18 tabelas)
- [x] Expandir o mirror com 10 tabelas de suporte que a doc original omitia, mas que são dependência real dos workers Socialwise:

| Tabela Prisma | Modelo SQLAlchemy | Usado por |
|---------------|------------------|-----------|
| `User` | `User` | Agendamento worker |
| `Account` | `Account` | Agendamento, InstagramWebhook |
| `Midia` | `Midia` | Agendamento worker |
| `Automacao` | `Automacao` | InstagramWebhook |
| `LeadAutomacao` | `LeadAutomacao` | InstagramWebhook |
| `LeadInstagramProfile` | `LeadInstagramProfile` | InstagramWebhook |
| `WebhookConfig` | `WebhookConfig` | WebhookDelivery |
| `WebhookDelivery` | `WebhookDelivery` | WebhookDelivery |
| `Chat` | `Chat` | LeadsChatwit (B.2.3) |
| `ArquivoLeadOab` | `ArquivoLeadOab` | LeadsChatwit (B.2.3) |
| `ChatwitInbox` | `ChatwitInbox` | FlowCampaign (B.4) |

Inventário core original:

| Tabela Prisma | Modelo SQLAlchemy | Usado por |
|---------------|------------------|-----------|
| `Lead` | `Lead` | LeadCells, LeadsChatwit |
| `LeadOabData` | `LeadOabData` | Transcription, Mirror, Analysis, LeadCells |
| `EspelhoPadrao` | `EspelhoPadrao` | MirrorGeneration |
| `MapeamentoBotao` | `MapeamentoBotao` | FlowBuilder |
| `MapeamentoIntencao` | `MapeamentoIntencao` | FlowBuilder |
| `Flow` / `FlowNode` / `FlowEdge` | `Flow`, `FlowNode`, `FlowEdge` | FlowBuilder, FlowCampaign |
| `FlowSession` | `FlowSession` | FlowBuilder |
| `FlowCampaign` / `FlowCampaignContact` | `FlowCampaign`, `FlowCampaignContact` | FlowCampaign worker |
| `Agendamento` | `Agendamento` | Agendamento worker |
| `UsuarioChatwit` | `UsuarioChatwit` | LeadsChatwit, Chatwit integration |
| `SystemConfig` | `SystemConfig` | Chatwit client |
| `Template` | `Template` | FlowBuilder, FlowCampaign |
| `CostEvent` | `CostEvent` | CostEvents worker |
| `MtfDiamanteConfig` / `MtfDiamanteVariavel` | `MtfDiamanteConfig`, `MtfDiamanteVariavel` | FlowBuilder (variáveis MTF) |

- [x] Colocar em `domains/socialwise/db/models/`
- [x] Testar: CRUD básico funciona via SQLAlchemy no banco socialwise (18/18 tabelas lidas com sucesso)

---

## B.2 — Workers Simples (Sem IA)

Começar pelos workers mais simples para validar a stack TaskIQ + SQLAlchemy mirror.

### B.2.1 — FxRate + BudgetMonitor + CostEvents ✅ CONCLUÍDA 2026-03-21

| Origem (TypeScript) | Destino (Python) | Complexidade |
|---------------------|-----------------|-------------|
| `lib/cost/fx-rate-worker.ts` | `domains/socialwise/tasks/fx_rate.py` | Baixa |
| `lib/cost/budget-monitor.ts` | `domains/socialwise/tasks/budget_monitor.py` | Baixa |
| `lib/cost/cost-worker.ts` | `domains/socialwise/tasks/cost_events.py` | Média |

**Dependências a portar:**
- `lib/cost/pricing-service.ts` → `domains/socialwise/services/cost/pricing.py`
- `lib/cost/idempotency-service.ts` → `domains/socialwise/services/cost/idempotency.py`
- `lib/cost/audit-logger.ts` → `domains/socialwise/services/cost/audit.py`

### Entregue nesta etapa

- `domains/socialwise/db/session_compat.py` — `AsyncSessionLocal` + `session_ctx()` para workers/scripts.
- `domains/socialwise/db/models/price_card.py` — mirror de `PriceCard`.
- `domains/socialwise/db/models/fx_rate.py` — mirror de `FxRate`.
- `domains/socialwise/db/models/cost_budget.py` — mirror de `CostBudget`.
- `domains/socialwise/db/models/audit_log.py` — mirror de `AuditLog`.
- `domains/socialwise/services/cost/pricing.py` — resolução de preços + reprocessamento de `PENDING_PRICING`.
- `domains/socialwise/services/cost/idempotency.py` — external ID + fingerprint + janela temporal.
- `domains/socialwise/services/cost/audit.py` — persistência em `AuditLog` com savepoint.
- `domains/socialwise/services/cost/fx_rate.py` — fetch multi-provider + fallback + storage.
- `domains/socialwise/services/cost/budget_controls.py` — flags Redis de alerta/bloqueio/downgrade.
- `domains/socialwise/tasks/cost_events.py` — `process_cost_event_task`, batch, reprocess e cleanup de idempotência.
- `domains/socialwise/tasks/budget_monitor.py` — checagem global e por orçamento.
- `domains/socialwise/tasks/fx_rate.py` — update diário, backfill, cleanup e bootstrap inicial.
- Scheduler TaskIQ ainda não existia nesta etapa; a lacuna operacional foi fechada na B.2.2.

### Validação executada

- `compile()` sintático em 14 arquivos novos/alterados do domínio Socialwise: OK.
- Import dos modelos, serviços e tasks do domínio Socialwise: OK.
- Tasks registradas no broker Socialwise: OK (`domains.socialwise.tasks.*:*_task`).
- `git diff --check -- domains/socialwise`: OK.
- Leitura runtime do banco socialwise: **validada depois dentro do compose na B.2.2**.
  Observação: fora do compose, o host continua dependente da rede Docker `minha_rede` para resolver `postgres:5432` e `redis:6379`.

### B.2.2 — Agendamento + WebhookDelivery + InstagramWebhook ✅ CONCLUÍDA 2026-03-21

| Origem (TypeScript) | Destino (Python) | Complexidade |
|---------------------|-----------------|-------------|
| `worker/WebhookWorkerTasks/agendamento.task.ts` | `domains/socialwise/tasks/agendamento.py` | Baixa |
| (webhook delivery logic) | `domains/socialwise/tasks/webhook_delivery.py` | Baixa |
| `worker/processors/instagram-webhook.processor.ts` | `domains/socialwise/tasks/instagram_webhook.py` | Baixa |

**Dependências a portar que a doc original omitira:**
- `lib/agendamento.service.ts` → `domains/socialwise/services/agendamento.py`
- `lib/webhook/webhook-manager.ts` (subset delivery runtime) → `domains/socialwise/services/webhook_delivery.py`
- `worker/automacao/eu-quero/automation.ts` + `lib/instagram-auth.ts` → `domains/socialwise/services/instagram_webhook.py`
- `User`, `Account`, `Midia`, `Automacao`, `LeadAutomacao`, `LeadInstagramProfile`, `WebhookConfig`, `WebhookDelivery` → novos mirrors SQLAlchemy

### Entregue nesta etapa

- `domains/socialwise/db/models/user.py` e `account.py` — suporte mínimo para auth social/Instagram.
- `domains/socialwise/db/models/midia.py` — relação com `Agendamento`.
- `domains/socialwise/db/models/automacao.py`, `lead_automacao.py`, `lead_instagram_profile.py` — stack completo de automação Instagram.
- `domains/socialwise/db/models/webhook_config.py` e `webhook_delivery.py` — stack de delivery outbound.
- `domains/socialwise/services/agendamento.py` — seleção de mídia + payload de webhook.
- `domains/socialwise/services/webhook_delivery.py` — assinatura HMAC, POST e persistência de resultado.
- `domains/socialwise/services/instagram_webhook.py` — comentários, DM/postback, follower gating e captura de e-mail.
- `domains/socialwise/tasks/agendamento.py` — processamento + reagendamento diário/semanal via `schedule_by_time`.
- `domains/socialwise/tasks/webhook_delivery.py` — worker com retry sobre falha HTTP/network.
- `domains/socialwise/tasks/instagram_webhook.py` — worker TaskIQ para payloads do Instagram.
- `domains/socialwise/tasks/scheduler.py` — `LabelScheduleSource` + `ListRedisScheduleSource`.
- `platform-backend/docker-compose.yml` — novo serviço `platform-scheduler-socialwise`.
- `platform_core/config.py` — aliases compatíveis com envs legadas (`WEBHOOK_URL`, `IG_GRAPH_API_BASE`) e base URL da automação.
- `worker/automacao/eu-quero/automation.ts` — bugfix legado de lookup/recipient do Instagram antes do cutover.
- `app/api/admin/webhooks/route.ts` e `app/api/admin/webhooks/[webhookId]/deliveries/route.ts` — correção de CUID/String vs UUID.

### Validação executada

- Import dos novos models/tasks/scheduler Socialwise: OK.
- `py_compile` sintático em 22 arquivos novos/alterados do `platform-backend`: OK.
- `git diff --check` OK no escopo alterado de Python e TypeScript.
- `pnpm exec tsc --noEmit`: OK.
- `pnpm exec tsc --noEmit -p tsconfig.worker.json`: OK.
- Validação runtime dentro do compose (`platform-api` na rede `minha_rede`): consultas a `Agendamento`, `WebhookDelivery` e `Automacao` executaram sem erro no Postgres real do ambiente local atual (`0/0/0` rows).

### B.2.3 — LeadCells + LeadsChatwit ✅ CONCLUÍDA 2026-03-21

| Origem (TypeScript) | Destino (Python) | Complexidade |
|---------------------|-----------------|-------------|
| `worker/WebhookWorkerTasks/leadcells.task.ts` | `domains/socialwise/tasks/lead_cells.py` | Média |
| `worker/WebhookWorkerTasks/leads-chatwit.task.ts` | `domains/socialwise/tasks/leads_chatwit.py` | Média |

**Dependências que a doc original omitira:**
- `lib/leads-chatwit/sanitize-chatwit-payload.ts` → `domains/socialwise/services/leads/sanitize_payload.py`
- `lib/leads-chatwit/normalize-chatwit-lead-sync-payload.ts` → `domains/socialwise/services/leads/normalize_payload.py`
- `lib/leads-chatwit/process-chatwit-lead-sync.ts` → `domains/socialwise/services/leads/process_sync.py`
- `lib/services/lead-service.ts` → `domains/socialwise/services/leads/lead_service.py`
- `Chat` e `ArquivoLeadOab` → novos mirrors SQLAlchemy

### Entregue nesta etapa

- `domains/socialwise/db/models/chat.py` — mirror de `Chat` (UniqueConstraint leadId+accountId).
- `domains/socialwise/db/models/arquivo_lead_oab.py` — mirror de `ArquivoLeadOab` (unique chatwitFileId, FK cascade).
- `domains/socialwise/services/leads/sanitize_payload.py` — sanitização de payloads brutos do webhook Chatwit.
- `domains/socialwise/services/leads/normalize_payload.py` — normalização multi-event (specific, legacy_contact, legacy_message).
- `domains/socialwise/services/leads/lead_service.py` — `LeadService` com deduplicação cross-source (phone + contactId).
- `domains/socialwise/services/leads/process_sync.py` — upsert completo: UsuarioChatwit → Account → Lead → LeadOabData → ArquivoLeadOab.
- `domains/socialwise/tasks/lead_cells.py` — 3 sub-handlers (manuscrito, espelho, análise) + SSE via Redis pub/sub.
- `domains/socialwise/tasks/leads_chatwit.py` — wrapper TaskIQ que delega para `process_chatwit_lead_sync`.

### Notas e decisões

- **`generatePdfInternally` NÃO portado**: O pipeline original usa `pdf-lib` no Node.js. Na versão Python, os PDFs devem chegar com URLs pré-geradas (via lazy import de `generate-analise-pdfs.ts` no Next.js) ou o enqueuer deve gerar antes de disparar a task. Quando os agentes IA OAB forem migrados (B.3), o PDF será gerado pelo pipeline Python.
- **SSE notifications**: Publicadas via `redis.asyncio` no canal `sse:lead:<leadId>`, compatível com o `SseManager` do Next.js que subscreve via `SUBSCRIBE`.
- **Dedup de arquivos**: `ArquivoLeadOab.chatwitFileId` tem constraint UNIQUE; a task verifica antes de inserir para evitar duplicatas (equivalente ao `skipDuplicates: true` do Prisma).

### Validação executada

- `ast.parse` sintático em 11 arquivos novos: OK.
- Import dos models (`Chat`, `ArquivoLeadOab`), services e tasks dentro do compose: OK.
- Tasks registradas no broker Socialwise: OK.
- `git diff --check -- domains/socialwise`: OK.
- `pnpm exec tsc --noEmit`: OK.
- `pnpm exec tsc --noEmit -p tsconfig.worker.json`: OK.

### Tarefas

- [x] Portar cada worker TypeScript → Python TaskIQ (B.2.1, B.2.2 e B.2.3 concluídas)
- [ ] Criar endpoint bridge: `POST /api/v1/socialwise/tasks/enqueue` (Next.js chama em vez de BullMQ `.add()`)
- [x] Publicar SSE progress via Redis pub/sub no canal `sse:lead:<leadId>` (lead_cells.py)
- [ ] Testar: side-by-side BullMQ ↔ TaskIQ, depois cutover

---

## B.3 — Agentes IA OAB (LiteLLM — Pipelines Determinísticos)

Maior complexidade. Portado de Vercel AI SDK para LiteLLM. LangGraph descartado — workflows são pipelines determinísticos 1:1, não grafos de agentes.

### Arquivos-chave (TypeScript → Python)

| Origem | Destino | LOC | Papel |
|--------|---------|-----|-------|
| `lib/oab-eval/transcription-agent.ts` (1067 linhas) | `domains/socialwise/services/oab_eval/transcription_agent.py` | ~800 | OCR + LLM: imagem manuscrita → texto |
| `lib/oab-eval/mirror-generator-agent.ts` (~600 linhas) | `domains/socialwise/services/oab_eval/mirror_generator.py` | ~500 | Vision: extrair gabarito de imagens |
| `lib/oab-eval/analysis-agent.ts` (~400 linhas) | `domains/socialwise/services/oab_eval/analysis_agent.py` | ~400 | Comparativa: prova × espelho → score |

### Suporte (TypeScript → Python)

| Origem | Destino | Papel |
|--------|---------|-------|
| `lib/oab-eval/unified-vision-client.ts` (699 linhas) | ~~`vision_client.py`~~ → absorvido por `platform_core/ai/litellm_config.py` | LiteLLM vision nativo (`call_vision`, `call_vision_multi`) |
| `lib/oab-eval/operation-control.ts` | `domains/socialwise/services/oab_eval/operation_control.py` | `CancelMonitor` (asyncio polling) + `emit_operation_event` (Redis pub/sub SSE) |
| `lib/oab-eval/rubric-scoring.ts` | `domains/socialwise/services/oab_eval/rubric_scoring.py` | `sanitize_raw_score`, `build_score_map`, `verify_rubric_totals` |
| `lib/oab-eval/ai-retry-fallback.ts` | absorvido por `platform_core/ai/litellm_config.py` (`with_retry` + jitter) | Retry com fallback de modelo |
| `lib/oab-eval/runtime-policy.ts` | `domains/socialwise/services/oab_eval/runtime_policy.py` | `OabRuntimePolicy` dataclass + `resolve_runtime_policy` |
| *(novo)* | `domains/socialwise/services/oab_eval/blueprint_config.py` | `get_agent_config` — 4-tier blueprint config resolution |
| *(novo)* | `platform_core/ai/litellm_config.py` | Shared: `CircuitBreaker`, `call_completion`, `call_vision`, `call_structured`, `with_retry` |
| *(novo)* | `platform_core/ai/cost_tracker.py` | `track_cost()` + `track_cost_batch()` → CostEvent rows |

### Workers IA (TaskIQ)

| Origem | Destino |
|--------|---------|
| `worker/WebhookWorkerTasks/mirror-generation.task.ts` | `domains/socialwise/tasks/mirror_generation.py` |
| `worker/WebhookWorkerTasks/analysis-generation.task.ts` | `domains/socialwise/tasks/analysis_generation.py` |
| `lib/oab-eval/transcription-queue.ts` | `domains/socialwise/tasks/transcription.py` |

### Tarefas

- [x] Implementar `platform_core/ai/litellm_config.py` (LiteLLM com CircuitBreaker + fallback + retry com jitter)
- [x] Implementar `platform_core/ai/cost_tracker.py` (`track_cost` + `track_cost_batch` via SQLAlchemy session)
- [x] Portar 3 agents (transcription, mirror, analysis) — **como pipelines determinísticos** (LangGraph não necessário)
- [x] Portar vision client — **absorvido pelo LiteLLM** nativo (`image_url` content parts)
- [x] Portar operation control (cancellation via Redis — `CancelMonitor` + `emit_operation_event`)
- [x] Portar rubric scoring (lógica pura — `sanitize_raw_score`, `build_score_map`, `verify_rubric_totals`)
- [x] Portar runtime policy (`resolve_runtime_policy` — timeout/token budget por provider)
- [x] Portar blueprint config (`get_agent_config` — 4-tier resolution: linkedColumn → env → name → defaults)
- [x] SSE progress: publicar nos mesmos canais Redis (`sse:lead:<leadId>`)
- [x] Criar 3 tasks TaskIQ (transcription, mirror_generation, analysis_generation)
- [x] Adicionar mirrors: `AiAgentBlueprint`, `AiAssistant`
- [ ] Validação A/B: comparar output Python vs TypeScript em 100 leads (pendente — requer ambiente produção)

---

## B.4 — Flow Engine Workers ✅ CONCLUÍDA 2026-03-21

O Flow Engine core (Orchestrator, Executor, SyncBridge) **permanece no Next.js** por enquanto — o SyncBridge depende do ciclo HTTP de 30s do webhook. Mas os workers async do Flow **migram**.

### Workers que migram

| Origem | Destino | Papel |
|--------|---------|-------|
| `worker/WebhookWorkerTasks/flow-builder-queues.task.ts` (~200 linhas) | `domains/socialwise/tasks/flow_builder.py` | Ações async: CHATWIT_ACTION, HTTP_REQUEST, TAG, WEBHOOK, DELAY, MEDIA |
| `worker/WebhookWorkerTasks/flow-campaign.task.ts` (~150 linhas) | `domains/socialwise/tasks/flow_campaign.py` | Execução batch de campanhas |

### Dependências portadas

| Origem | Destino | Papel |
|--------|---------|-------|
| `services/flow-engine/chatwit-delivery-service.ts` | `domains/socialwise/services/flow/delivery_service.py` | HTTP delivery Chatwit API com retry (axios → httpx) |
| `services/flow-engine/chatwit-conversation-resolver.ts` | `domains/socialwise/services/flow/conversation_resolver.py` | Search/create contact + conversation no Chatwit |
| `lib/chatwit/system-config.ts` | `domains/socialwise/services/flow/chatwit_config.py` | Bot token + base URL (SystemConfig + cache 5min + fallback ENV) |
| `services/flow-engine/variable-resolver.ts` | `domains/socialwise/services/flow/variable_resolver.py` | Resolve `{{var}}` em templates |
| `services/flow-engine/mtf-variable-loader.ts` | `domains/socialwise/services/flow/mtf_loader.py` | Carrega variáveis MTF do Redis/DB |
| `lib/mtf-diamante/variables-resolver.ts` | `domains/socialwise/services/flow/mtf_variables.py` | Formatação lote_ativo + complemento |

### Dependências que a doc original omitia

| Tabela Prisma | Modelo SQLAlchemy | Usado por |
|---------------|------------------|-----------|
| `ChatwitInbox` | `ChatwitInbox` | FlowCampaign (resolve inbox → accountId + channelType) |

### O que NÃO migra nesta fase

| Arquivo | Motivo |
|---------|--------|
| `services/flow-engine/flow-orchestrator.ts` | Entry-point do webhook — acoplado ao HTTP request |
| `services/flow-engine/flow-executor.ts` | Depende do SyncBridge |
| `services/flow-engine/sync-bridge.ts` | Ponte 30s do HTTP response — ciclo de vida Next.js |
| `services/flow-engine/playground-collector.ts` | Debug, não crítico |

### Entregue nesta etapa

- `domains/socialwise/db/models/chatwit_inbox.py` — mirror de `ChatwitInbox` (dependência real do EXECUTE_CONTACT).
- `domains/socialwise/services/flow/delivery_service.py` — `ChatwitDeliveryService` com 7 delivery types (text, media, interactive, template, reaction, chatwit_action com sub-types, update_contact), retry 3x com backoff, httpx async.
- `domains/socialwise/services/flow/conversation_resolver.py` — `ChatwitConversationResolver` (search by phone → create contact → create conversation).
- `domains/socialwise/services/flow/chatwit_config.py` — `get_chatwit_system_config()` (SystemConfig DB → ENV fallback, cache monotonic 5min).
- `domains/socialwise/services/flow/variable_resolver.py` — `VariableResolver` (lookup chain: session → contact → conversation → system, dot notation + underscore, nested resolution).
- `domains/socialwise/services/flow/mtf_variables.py` — Resolução completa de variáveis MTF Diamante: normais + lotes OAB (`lote_ativo` com complemento, `lote_N` com vencidos strikethrough), cache Redis 10min.
- `domains/socialwise/services/flow/mtf_loader.py` — `load_mtf_variables_for_inbox()` (inbox → userId → variáveis + derivação `_centavos`).
- `domains/socialwise/tasks/flow_builder.py` — `process_flow_builder_task` com 6 handlers dedicados + DLQ-equivalent error handling via TaskIQ retry.
- `domains/socialwise/tasks/flow_campaign.py` — `process_flow_campaign_task` com 3 handlers + orquestração (batch processing, completion detection, pause/cancel/resume) portada de `campaign-orchestrator.ts`.

### Notas e decisões

- **FlowOrchestrator.executeFlowById() NÃO portado**: No TS, o EXECUTE_CONTACT chama o FlowOrchestrator para executar o flow. Na versão Python, a resolução de contato/conversa no Chatwit é feita, e o contato é marcado como SENT. A execução real do flow será integrada quando o FlowOrchestrator for migrado (B.6).
- **DLQ (Dead Letter Queue)**: O BullMQ original usa uma DLQ separada. No TaskIQ, o retry é nativo via `retry_on_error=True, max_retries=3`. Jobs que falham após todas as tentativas ficam no estado FAILED do TaskIQ.
- **Campaign orchestrator**: As funções de `startCampaign`, `pauseCampaign`, `resumeCampaign`, `cancelCampaign` do `campaign-orchestrator.ts` foram absorvidas diretamente nos handlers CAMPAIGN_CONTROL e PROCESS_BATCH do worker. A API de start/progress será exposta como FastAPI endpoint na B.7.
- **ChatwitConversationResolver portado**: Dependência implícita do FlowCampaign que a doc original não listava. Necessário para resolver contato + conversa quando a campanha dispara para telefones novos.

### Validação executada

- `ast.parse` sintático em 11 arquivos novos: OK.
- Import dos models, services e tasks dentro do compose: OK (11/11).
- Tasks registradas no broker Socialwise: OK.
- `git diff --check -- domains/socialwise`: OK.
- `pnpm exec tsc --noEmit`: OK.
- `pnpm exec tsc --noEmit -p tsconfig.worker.json`: OK.

### Tarefas

- [x] Portar FlowBuilder worker (6 job types)
- [x] Portar FlowCampaign worker (3 job types + campaign orchestrator)
- [x] Portar ChatwitDeliveryService (axios → httpx)
- [x] Portar ChatwitConversationResolver (dependência implícita das campanhas)
- [x] Portar ChatwitSystemConfig (bot token + base URL com cache)
- [x] Portar VariableResolver (chain de resolução: session → contact → conversation → system)
- [x] Portar MTF variables resolver (normais + lotes OAB)
- [x] Portar MTF variable loader (inbox → userId → variáveis)
- [x] Adicionar mirror: `ChatwitInbox` (dependência do EXECUTE_CONTACT)
- [ ] Criar bridge: Next.js enfileira job → TaskIQ processa → resultado via Redis pub/sub
- [x] Integrar EXECUTE_CONTACT com FlowOrchestrator para execução real do flow (fechado na B.6)
- [ ] Testar: flow async executa de ponta a ponta

---

## B.5 — SocialWise Flow (Intent Classification) ✅ IMPLEMENTADA 2026-03-21

O pipeline de classificação de intenções que roda no webhook.

### Arquivos-chave

| Origem | Destino | Papel |
|--------|---------|-------|
| `lib/socialwise-flow/processor.ts` | `domains/socialwise/services/intent/processor.py` | Entry-point classificação |
| `lib/socialwise-flow/classification.ts` | `domains/socialwise/services/intent/classification.py` | Intent detection |
| `lib/socialwise-flow/performance-bands.ts` | `domains/socialwise/services/intent/bands.py` | HARD/ROUTER/FALLBACK |
| `lib/socialwise-flow/processor-components/assistant-config.ts` | `domains/socialwise/services/intent/assistant_config.py` | Resolução assistant/inbox + overrides |
| `lib/socialwise-flow/services/ai-provider-factory.ts` | (absorvido pelo LiteLLM) | Provider abstraction |
| `lib/socialwise-flow/services/multi-provider-processor.ts` | `domains/socialwise/services/intent/provider_processor.py` | Seleção de provider |
| `lib/socialwise-flow/services/retry-handler.ts` | (absorvido pelo LiteLLM retry) | Retry com degradação |
| `lib/socialwise-flow/button-processor.ts` | `domains/socialwise/services/intent/button_processor.py` | Detecção `flow_` buttons |
| `lib/socialwise-flow/meta-payload-builder.ts` | `domains/socialwise/services/intent/payload_builder.py` | Builder mensagens interativas |
| `lib/socialwise-flow/cache-manager.ts` | `domains/socialwise/services/intent/cache.py` | Redis cache |
| Prisma `Intent` (não listado na doc original) | `domains/socialwise/db/models/intent.py` | Intents globais com embedding/slug |
| Prisma `AiAssistantInbox` (não listado na doc original) | `domains/socialwise/db/models/ai_assistant_inbox.py` | Link assistant ↔ inbox |
| (novo shared infra) | `platform_core/ai/litellm_config.py` | `call_embedding()` + retry/circuit breaker |

### Omissões descobertas e corrigidas

- A doc original não listava os mirrors `Intent` e `AiAssistantInbox`, mas a B.5 depende deles diretamente.
- O mirror `AiAssistant` precisava ser expandido com os campos reais usados pelo pipeline (`fallbackModel`, `fallbackProvider`, `verbosity`, deadlines, `disableIntentSuggestion`, `proposeHumanHandoff`, session TTLs).
- O banco Socialwise atual não possui `AiAssistant.thinkingLevel`; o mirror Python foi ajustado para seguir o schema real do compose, não apenas o Prisma do workspace.
- `AiAssistantInbox` não possui `updatedAt`; o primeiro mirror criado herdava isso por engano e foi corrigido após validação runtime.
- O classificador TS propagava `Intent.name` como slug candidato; na porta Python isso foi corrigido para usar `Intent.slug`.

### Notas e decisões

- **Processor da B.5 já é plugável na B.6**: `process_socialwise_intent()` já retorna `selected_intent`, `response` ou `action` (`resume_flow`/`handoff`) no formato esperado para o webhook FastAPI.
- **Warmup e Router LLM estão portados sem `ai-provider-factory`**: o provider agora é resolvido via LiteLLM (`resolve_litellm_model` + `call_structured`/`call_embedding`).
- **Persistência de sessão do Router foi portada na B.6**: `domains/socialwise/services/intent/session_state.py` passou a armazenar histórico e contexto interativo no Redis; o webhook FastAPI usa isso para anti-loop contextual e retomada coerente.
- **Payloads interativos foram reduzidos ao contrato necessário da B.5**: `payload_builder.py` cobre respostas interativas de classificação (warmup/router) para WhatsApp/Instagram/Facebook. Template/flow delivery completo continua na B.6/B.4.

### Validação executada

- `python -m pytest tests/domains/socialwise/intent -q` dentro do compose: `7 passed in 5.12s`.
- Observação de ambiente: a imagem atual do `platform-backend` não inclui `pytest`; a execução acima foi feita com instalação efêmera de `pytest` + `pytest-asyncio` no container, sem alterar o repositório.
- Runtime real no compose: consultas a `ChatwitInbox`, `AiAssistant` e `Intent` OK; `load_assistant_configuration()` OK; `process_socialwise_intent(embedipreview=False)` OK.
- `pnpm exec tsc --noEmit`: OK.
- `pnpm exec tsc --noEmit -p tsconfig.worker.json`: OK.
- `git diff --check`: OK.

### Tarefas

- [x] Portar pipeline de classificação
- [x] Integrar com LiteLLM (substituir ai-provider-factory)
- [x] Validar unit tests + runtime no compose + TypeScript
- [ ] Benchmark A/B: classificação retorna mesmos resultados (200 mensagens reais)
- [x] Plugar contexto de sessão/anti-loop do Router no webhook FastAPI (fechado na B.6)

---

## B.6 — Webhook Route + Flow Engine Core 🟡 CORE IMPLEMENTADO 2026-03-21

**Fase final da migração Socialwise.** O core técnico foi portado para FastAPI/Python nesta etapa. O que permanece pendente é o cutover operacional do Chatwit e a validação live end-to-end com mensagens reais.

### Arquivos-chave

| Origem | Destino | Papel |
|--------|---------|-------|
| `app/api/integrations/webhooks/socialwiseflow/route.ts` | `domains/socialwise/api/v1/endpoints/webhook.py` | Webhook entry-point |
| `app/api/integrations/webhooks/socialwiseflow/init/route.ts` | `domains/socialwise/api/v1/endpoints/webhook_init.py` | Init Chatwit bot token |
| `services/flow-engine/flow-orchestrator.ts` | `domains/socialwise/services/flow/orchestrator.py` | Orquestrador de flows |
| `services/flow-engine/flow-executor.ts` | `domains/socialwise/services/flow/executor.py` | Executor nó-a-nó |
| `services/flow-engine/sync-bridge.ts` | `domains/socialwise/services/flow/sync_bridge.py` | Ponte sync 30s (rewrite para async Python) |
| `services/flow-engine/runtime/*` (implícito no TS) | `domains/socialwise/services/flow/runtime.py` | Dataclasses do runtime (`RuntimeFlow`, `FlowSessionData`, `ExecuteResult`) |
| webhook payment handler (implícito no Next.js) | `domains/socialwise/services/flow/payment_handler.py` | `payment.confirmed` → `LeadPayment` + retomada do flow |
| session manager/context bridge (implícito no Next.js) | `domains/socialwise/services/intent/session_state.py` | Histórico/contexto Redis para Router LLM |
| Prisma `InteractiveContent*` (omitido pela doc original) | `domains/socialwise/db/models/interactive_content.py` | Templates interativos por `messageId` |
| Prisma `LeadPayment` (omitido pela doc original) | `domains/socialwise/db/models/lead_payment.py` | Persistência de pagamento confirmado |

### Entregue nesta etapa

- `domains/socialwise/api/v1/endpoints/webhook.py`:
  - auth opcional por bearer (`socialwiseflow_access_token`)
  - limite de payload `256KB`
  - dedup por `source_message_id`
  - atalhos `@falar_atendente`, `@recomecar`, `@sair`, `@retry`
  - retomada prioritária de flow (`flow_` button, `WAIT_FOR_REPLY`, match textual de template)
  - persistência de histórico/contexto do Router LLM no Redis
  - fallback para `process_socialwise_intent()` + `resolve_intent_mapping()`
  - dispatch para flow quando o mapeamento final aponta para `flowId`
- `domains/socialwise/api/v1/endpoints/webhook_init.py`: init webhook do Chatwit com persistência de bot token/base URL em `SystemConfig`.
- `domains/socialwise/services/flow/orchestrator.py`:
  - `handle()` para `flow_` button, retomada de sessão e free-text
  - `execute_flow_by_id()` para campanhas e rotas por intent
  - `resume_from_payment()` para continuar flows após confirmação de pagamento
  - persistência de `FlowSession` e serialização segura para runtime
- `domains/socialwise/services/flow/executor.py`:
  - execução nó-a-nó (`TEXT_MESSAGE`, `INTERACTIVE_MESSAGE`, `WHATSAPP_TEMPLATE`, `MEDIA`, `DELAY`, `CONDITION`, `SET_VARIABLE`, `HTTP_REQUEST`, `REACTION`, `CHATWIT_ACTION`, `WAIT_FOR_REPLY`, `GENERATE_PAYMENT_LINK`)
  - bridge sync/async compatível com o contrato do Chatwit
  - resolução de template interativo por `messageId` via `Template` + `InteractiveContent`
- `domains/socialwise/tasks/flow_campaign.py`: `EXECUTE_CONTACT` passou a executar o flow real e a persistir `session_id`.
- `domains/socialwise/plugin.py`: registro real das rotas fixas do Chatwit no FastAPI.

### Omissões descobertas e corrigidas

- A doc original não listava os mirrors `InteractiveContent` e `LeadPayment`, mas a B.6 depende deles para `INTERACTIVE_MESSAGE` por `messageId` e `payment.confirmed`.
- `save_chatwit_system_config()` estava sem `commit()`; o init/webhook não persistiria `bot_token` e `base_url`.
- `VariableResolver` assumia `dict`, mas o runtime usa `DeliveryContext` dataclass.
- `Body`, `Header`, `Footer`, `ActionCtaUrl` e `ActionReplyButton` não possuem `createdAt/updatedAt` no banco real; o primeiro mirror quebrava inserts/loads com `UndefinedColumnError`.
- `FlowSession.status`, `FlowCampaign.status` e `FlowCampaignContact.status` são enums nativos do Postgres; o mirror inicial com `String` falhava na primeira escrita real.
- Em tabelas Prisma com `@updatedAt`, o banco atual não garante default nativo para `updatedAt`; `SocialwiseModel` passou a preencher `createdAt`/`updatedAt` no insert pelo lado Python.
- `MapeamentoIntencao`/`Template` precisaram de eager-load completo do conteúdo interativo para evitar dependência em lazy load após fechamento da sessão.

### Validação executada

- `docker compose exec -T platform-api python -m py_compile ...` nos arquivos novos/alterados do core B.6: OK.
- `docker compose exec -T platform-api python -m pytest tests/domains/socialwise -q`: `12 passed in 2.73s`.
- Observação de ambiente: a imagem atual do `platform-backend` não inclui `pytest`; a suíte foi executada após instalação efêmera de `pytest` + `pytest-asyncio` no próprio container.
- Imports runtime dentro do compose: `domains.socialwise.services.flow.orchestrator`, `payment_handler`, `domains.socialwise.api.v1.endpoints.webhook` e `webhook_init` OK.
- Runtime real no compose: `FlowExecutor.resolve_message_id('cmfbuy5nx003co72qqq023td1')` passou a resolver o template interativo real do banco após o ajuste do mirror `InteractiveContent`.
- Runtime real no compose: `FlowOrchestrator.execute_flow_by_id('cmly4h2dr000srq01rvm46cql', ...)` criou e atualizou `FlowSession` com sucesso; após hidratar `base_url`/token por `SystemConfig`, a execução alcançou a chamada HTTP real do Chatwit e falhou apenas com `404` esperado porque a conversa `999001` usada no teste era sintética.
- `pnpm exec tsc --noEmit`: OK.
- `pnpm exec tsc --noEmit -p tsconfig.worker.json`: OK.

### Tarefas

- [x] Criar endpoint webhook em FastAPI
- [x] Rewrite SyncBridge para async Python
- [x] Portar FlowOrchestrator
- [x] Portar FlowExecutor
- [x] Persistir contexto de sessão/anti-loop do Router no webhook FastAPI
- [x] Integrar `payment.confirmed` + `LeadPayment` + retomada de flow
- [x] Integrar `EXECUTE_CONTACT` com FlowOrchestrator
- [ ] Configurar Chatwit para apontar webhook para FastAPI
- [ ] Testar: flow completo (sync + async) funciona end-to-end com Chatwit real

---

## B.7 — Admin API Routes 🟡 INICIADA 2026-03-21

Migrar as rotas admin do Next.js para FastAPI.

### Grupos de rotas

| Grupo | Origem (Next.js) | Destino (FastAPI) | # Rotas |
|-------|-----------------|------------------|---------|
| Flows | `app/api/admin/mtf-diamante/flows/` | `domains/socialwise/api/v1/endpoints/flows.py` | ~8 |
| Variáveis + Lotes | `app/api/admin/mtf-diamante/variaveis/`, `lote-ativo/`, `lotes/` | `domains/socialwise/api/v1/endpoints/admin_mtf.py` | ~8 |
| Templates | `app/api/admin/mtf-diamante/templates/` | `domains/socialwise/api/v1/endpoints/templates.py` | ~6 |
| Campanhas | `app/api/admin/mtf-diamante/campaigns/` | `domains/socialwise/api/v1/endpoints/campaigns.py` | ~6 |
| Leads | `app/api/admin/leads-chatwit/` | `domains/socialwise/api/v1/endpoints/leads.py` | ~10 |
| Analytics | `app/api/admin/mtf-diamante/flow-analytics/` | `domains/socialwise/api/v1/endpoints/analytics.py` | ~4 |
| Cost | `app/api/admin/cost/` | `domains/socialwise/api/v1/endpoints/cost.py` | ~4 |
| OAB | vários em `app/api/admin/` | `domains/socialwise/api/v1/endpoints/oab.py` | ~8 |

### B.7.1 — Grupo `Flows` (CONCLUÍDO 2026-03-21)

#### Arquivos-chave

| Origem | Destino | Papel |
|--------|---------|-------|
| `app/api/admin/mtf-diamante/flows/route.ts` | `domains/socialwise/api/v1/endpoints/admin_flows.py` (`GET`,`POST`) | Listar/criar flows |
| `app/api/admin/mtf-diamante/flows/[flowId]/route.ts` | `domains/socialwise/api/v1/endpoints/admin_flows.py` (`GET`,`PATCH`,`PUT`,`DELETE`) | CRUD do flow individual + save do canvas |
| `app/api/admin/mtf-diamante/flows/import/route.ts` | `domains/socialwise/api/v1/endpoints/admin_flows.py` (`POST /import`) | Import n8n-style |
| `app/api/admin/mtf-diamante/flows/[flowId]/export/route.ts` | `domains/socialwise/api/v1/endpoints/admin_flows.py` (`GET /{flow_id}/export`) | Export n8n-style |
| lógica inline nos route handlers | `domains/socialwise/services/flow/admin_service.py` | Regras de acesso, CRUD, import/export, deleção segura |
| `lib/flow-builder/syncFlow.ts` | `domains/socialwise/services/flow/canvas_sync.py` | Sync `canvasJson` → `FlowNode` / `FlowEdge` |
| `lib/flow-builder/exportImport.ts` | `domains/socialwise/services/flow/export_import.py` | Conversão canvas ↔ n8n-style |
| route handlers Next.js locais | `socialwise/lib/platform-backend/admin-proxy.ts` | BFF proxy para o FastAPI |

#### Entregue nesta etapa

- CRUD completo do grupo `Flows` portado para FastAPI (`list`, `create`, `detail`, `rename/activate`, `save canvas`, `delete`).
- Import/export de flow portado para Python com preservação do contrato JSON atual do frontend.
- Save do canvas agora materializa `FlowNode`/`FlowEdge` no backend Python, mantendo o executor/analytics alinhados com o estado salvo.
- Route handlers Next.js do grupo `Flows` reduziram para proxy fino autenticado; a lógica saiu do app web.

#### Omissões descobertas e corrigidas

- A doc original não listava `InboxFlowCanvas`, mas o export do grupo `Flows` precisa desse fallback para flows legados sem `canvasJson`.
- O import TS criava `Flow.canvasJson`, mas não sincronizava `FlowNode`/`FlowEdge`; isso deixava o executor Python cego até um save manual posterior.
- A deleção de flow não tratava campanhas vinculadas; com o mirror Python isso passou a falhar de forma explícita e amigável antes do commit.

#### Validação executada

- `docker compose exec -T platform-api python3 -m py_compile ...` nos novos arquivos da B.7.1: OK.
- `docker compose exec -T platform-api python3 -m pytest tests/domains/socialwise -q`: `16 passed in 2.41s`.
- Runtime leve no compose: `create_app()` registrou `/api/v1/socialwise/admin/mtf-diamante/flows` com sucesso.
- `pnpm exec tsc --noEmit`: OK.
- `pnpm exec tsc --noEmit -p tsconfig.worker.json`: OK.

### B.7.2 — Grupo `Variáveis + Lotes` (CONCLUÍDO 2026-03-21)

#### Arquivos-chave

| Origem | Destino | Papel |
|--------|---------|-------|
| `app/api/admin/mtf-diamante/variaveis/route.ts` | `domains/socialwise/api/v1/endpoints/admin_mtf.py` (`GET`,`POST`) | Listar/salvar variáveis MTF |
| `app/api/admin/mtf-diamante/variaveis/seed/route.ts` | `domains/socialwise/api/v1/endpoints/admin_mtf.py` (`POST /variaveis/seed`) | Seed automático por usuário |
| `app/api/admin/mtf-diamante/lote-ativo/route.ts` | `domains/socialwise/api/v1/endpoints/admin_mtf.py` (`GET /lote-ativo`) | Lote ativo fresh, sem cache |
| `app/api/admin/mtf-diamante/lotes/route.ts` | `domains/socialwise/api/v1/endpoints/admin_mtf.py` (`GET`,`POST`,`PUT`,`DELETE`) | CRUD legacy da coleção de lotes |
| `app/api/admin/mtf-diamante/lotes/[id]/route.ts` | `domains/socialwise/api/v1/endpoints/admin_mtf.py` (`PATCH`,`DELETE`) | CRUD por lote específico |
| lógica inline dos route handlers | `domains/socialwise/services/flow/admin_mtf_service.py` | Garantia de `User`, seed MTF, serialização de variáveis e mutação de `lotes_oab` |

#### Entregue nesta etapa

- Tab de configuração MTF deixou de executar regras de negócio no Next.js para `variaveis`, `variaveis/seed`, `lote-ativo` e `lotes`; os route handlers agora são BFF proxy fino autenticado.
- Backend Python passou a centralizar o seed automático, a hidratação de defaults editáveis, a leitura do lote ativo e o CRUD completo de `lotes_oab`.
- A invalidação de cache Redis (`mtf_variables:*`, `mtf_lotes:*`) foi portada para o `platform-backend`, mantendo o comportamento esperado da UI após salvar variáveis ou alterar lotes.

#### Omissões descobertas e corrigidas

- O inventário inicial da B.7 citava `Variáveis`, mas o tab real também depende de `lotes/*`; esse grupo foi absorvido no mesmo slice para não deixar a tela híbrida.
- O mirror `User` originalmente portado na B.2.2 não incluía `mtfVariaveisPopuladas`; o campo precisou ser adicionado para manter a semântica do seed idempotente.
- O fluxo legado podia deixar a configuração com apenas `lotes_oab` após reset/import parcial; o backend Python agora recompõe as variáveis editáveis padrão nesse cenário.

#### Validação executada

- `docker compose exec -T platform-api python3 -m py_compile ...` nos novos arquivos da B.7.2: OK.
- `docker compose exec -T platform-api python3 -m pytest tests/domains/socialwise -q`: `19 passed in 2.68s`.
- Runtime leve no compose: `create_app()` registrou `/api/v1/socialwise/admin/mtf-diamante/variaveis`, `/lotes` e `/lote-ativo` com sucesso.
- `pnpm exec tsc --noEmit`: OK.
- `pnpm exec tsc --noEmit -p tsconfig.worker.json`: OK.

### Tarefas

- [x] Extrair lógica de negócio dos route handlers para services (grupo `Flows`)
- [x] Criar endpoints FastAPI equivalentes (grupo `Flows`)
- [x] Next.js BFF aponta para FastAPI (grupo `Flows`)
- [x] Extrair lógica de negócio dos route handlers para services (grupo `Variáveis + Lotes`)
- [x] Criar endpoints FastAPI equivalentes (grupo `Variáveis + Lotes`)
- [x] Next.js BFF aponta para FastAPI (grupo `Variáveis + Lotes`)
- [ ] Next.js BFF aponta para FastAPI (demais grupos)
- [ ] Migrar endpoints SSE para FastAPI StreamingResponse
- [ ] Testar: frontend continua funcionando sem mudanças
- [ ] Migrar grupos restantes: Templates, Campanhas, Leads, Analytics, Cost e OAB

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

## B.9 — Adaptar `dev.sh` e `build.sh` do Socialwise

> Adaptar os scripts do Socialwise para o padrão pós-migração, seguindo o mesmo padrão documentado em A.7 (JusMonitorIA).

### Contexto

Os scripts `dev.sh` e `build.sh` do JusMonitorIA já foram adaptados para orquestrar o `platform-backend` como camada compartilhada. O Socialwise precisa do mesmo tratamento:

- **`dev.sh`**: Garantir rede `minha_rede` → verificar infra compartilhada → verificar/subir `platform-backend` → aguardar `platform-api` healthy → subir apenas o Next.js do Socialwise.
- **`build.sh`**: Suportar modos `--platform-only` (build da imagem `witrocha/platform-backend`), build do Next.js do Socialwise, e force-update via Portainer.

### Referência

- Padrão já implementado: `/home/wital/JusMonitorIA/dev.sh` e `/home/wital/JusMonitorIA/build.sh` (documentados na seção A.7 deste documento).
- Os scripts do Socialwise existem mas ainda seguem o padrão pré-migração (sobem backend/worker localmente).

### Tarefas

- [ ] Adaptar `socialwise/dev.sh`: orquestrar infra + platform-backend + Next.js (seguir padrão JusMonitorIA/dev.sh)
- [ ] Adaptar `socialwise/build.sh`: suportar `--platform-only`, build da imagem Socialwise, force-update Portainer
- [ ] Atualizar `socialwise/docker-compose.yml` para remover services de backend/worker que passaram ao platform-backend
- [ ] Testar: `./dev.sh` sobe o ambiente completo com platform-backend como fonte de API/workers

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
| 1 | A.1–A.5 | Mover JusMonitorIA backend | ✅ **CONCLUÍDA** (234 arquivos, 2026-03-20) |
| 2 | A.6–A.7 | Verificação + cutover + padronização operacional JusMonitorIA | ✅ Runtime validado + scripts documentados |
| 3 | C.1–C.4 | Infra compartilhada (auth, AI, middleware) | Stack completo |
| 4 | B.1 | SQLAlchemy mirrors do Prisma | Models prontos |
| 5 | B.2 | Workers simples (cost, agendamento, leads) | ✅ **CONCLUÍDA** — B.2.1, B.2.2 e B.2.3 concluídas |
| 6 | B.3 | Agentes IA OAB (LangGraph + LiteLLM) | 3 agents + 3 workers migrados |
| 7 | B.4 | Flow Engine workers (async) | ✅ **CONCLUÍDA** — 2 workers + 8 services portados |
| 8 | B.5 | SocialWise Flow (classificação intents) | Pipeline classificação em Python |
| 9 | B.6 | Webhook + Flow Engine core | Webhook apontando para FastAPI |
| 10 | B.7 | Admin API routes | Next.js = apenas UI |
| 11 | B.8 | **DELETAR `worker/`** | 🎯 Marco final: pasta removida |
| — | B.9 | Adaptar `dev.sh`/`build.sh` Socialwise | Scripts orquestram platform-backend |
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

---

## Status da Última Task

- Task executada: `B.7.2 — Admin API Routes / grupo Variáveis + Lotes`
- Resultado: o tab de configuração MTF (`variaveis`, `variaveis/seed`, `lote-ativo`, `lotes`) saiu do Next.js e passou a rodar no `platform-backend`, com os route handlers do Socialwise reduzidos a BFF proxy.
- Lacuna eliminada nesta task: a doc da B.7 omitira `lotes/*` como dependência real do mesmo tab; o slice foi fechado verticalmente no backend Python. Também foi restaurada a hidratação automática das variáveis padrão quando sobra apenas `lotes_oab` interno.

### Validações

- `docker compose exec -T platform-api python3 -m py_compile ...`: OK
- `docker compose exec -T platform-api python3 -m pytest tests/domains/socialwise -q`: `19 passed`
- runtime do compose: rotas `/api/v1/socialwise/admin/mtf-diamante/variaveis`, `/lotes` e `/lote-ativo` registradas no `create_app()`
- `pnpm exec tsc --noEmit`: OK
- `pnpm exec tsc --noEmit -p tsconfig.worker.json`: OK

### Pendências explícitas

- Configurar `PLATFORM_BACKEND_INTERNAL_URL` e `PLATFORM_API_KEY` no ambiente do Socialwise para o BFF proxy do grupo `Flows`.
- Revalidar end-to-end pela UI real o tab de configuração MTF (`variaveis` + `lotes`) usando o proxy Next.js → FastAPI.
- Validar o grupo `Flows` end-to-end pela UI real do Flow Builder usando o proxy Next.js → FastAPI.
- Continuar B.7 migrando os próximos grupos: Templates, Campanhas, Leads, Analytics, Cost e OAB.
- Pendências herdadas e ainda abertas da B.6/B.5: apontar o Chatwit para o webhook FastAPI, validar flow sync+async end-to-end com conversa real e rodar benchmark A/B de 200 mensagens da classificação.
