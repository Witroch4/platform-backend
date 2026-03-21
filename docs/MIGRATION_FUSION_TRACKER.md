# Migration Fusion Tracker

Companion operacional de `docs/MIGRATION_PYTHON_BACKEND.md`.

Objetivo: rastrear a fusão com granularidade de arquivos e reduzir a distância entre o plano macro e a execução real.

## Como usar

- Abra o workspace [`fusion-platform.code-workspace`](/home/wital/socialwise/fusion-platform.code-workspace).
- Mantenha a doc estratégica em [`MIGRATION_PYTHON_BACKEND.md`](/home/wital/socialwise/docs/MIGRATION_PYTHON_BACKEND.md) como fonte macro.
- Atualize o `Status` deste tracker conforme a execução real.

## Status

| Status | Significado |
|---|---|
| `stub` | destino existe, mas quase vazio |
| `todo` | ainda não migrado |
| `migrando` | em implementação |
| `replace` | não copiar 1:1; absorver ou redesenhar |
| `contract` | depende de contrato Chatwit ou redesign por restrição arquitetural |
| `delete` | não migrar; remover no cutover |

## Estado Atual do Alvo

| Área | Estado |
|---|---|
| `platform_core/` | base real já pronta: app factory, config, DB, brokers, logging, shutdown |
| `domains/socialwise/` | esqueleto criado, sem implementação relevante |
| `domains/jusmonitoria/` | plugin + Alembic do domínio, restante praticamente vazio |
| `pyproject.toml` do backend Python | já é a fonte correta de deps; não precisa “workspace Python” extra |

## Shared Core

| Origem | Destino | Status | Fase | Observação |
|---|---|---|---|---|
| `JusMonitorIA/backend/app/core/auth/jwt.py` | `platform-backend/platform_core/auth/jwt.py` | `todo` | C.1 | auth compartilhado |
| `JusMonitorIA/backend/app/core/auth/dependencies.py` | `platform-backend/platform_core/auth/dependencies.py` | `todo` | C.1 | auth compartilhado |
| `JusMonitorIA/backend/app/core/auth/password.py` | `platform-backend/platform_core/auth/password.py` | `todo` | C.1 | faltava no plano macro |
| `JusMonitorIA/backend/app/ai/agents/base_agent.py` | `platform-backend/platform_core/ai/base_agent.py` | `todo` | C.2 | base comum para agentes |
| `JusMonitorIA/backend/app/core/middleware/logging.py` | `platform-backend/platform_core/middleware/logging.py` | `todo` | A.5/C.4 | shared |
| `JusMonitorIA/backend/app/core/middleware/metrics.py` | `platform-backend/platform_core/middleware/metrics.py` | `todo` | A.5/C.4 | shared |
| `JusMonitorIA/backend/app/core/middleware/rate_limit.py` | `platform-backend/platform_core/middleware/rate_limit.py` | `todo` | A.5/C.4 | shared |
| `JusMonitorIA/backend/app/core/middleware/security.py` | `platform-backend/platform_core/middleware/security.py` | `todo` | A.5/C.4 | shared |
| `JusMonitorIA/backend/app/core/middleware/cache.py` | `platform-backend/platform_core/middleware/cache.py` | `todo` | A.5/C.4 | shared |
| `JusMonitorIA/backend/app/core/middleware/audit.py` | `platform-backend/platform_core/middleware/audit.py` | `todo` | A.5/C.4 | shared |
| `JusMonitorIA/backend/app/core/middleware/compression.py` | `platform-backend/platform_core/middleware/compression.py` | `replace` | A.5/C.4 | revisar junto do `GZipMiddleware` já existente |
| `JusMonitorIA/backend/app/core/services/storage.py` | `platform-backend/platform_core/services/storage.py` | `todo` | A.3/C.3 | shared |
| `JusMonitorIA/backend/app/core/services/email_service.py` | `platform-backend/platform_core/services/email.py` | `todo` | A.3/C.3 | shared |
| `JusMonitorIA/backend/app/core/services/chatwit_client.py` | `platform-backend/platform_core/services/chatwit_client.py` | `todo` | C.3 | decidir se fica shared ou só JM |
| runtime BullMQ do Socialwise | `platform-backend/platform_core/tasks/bootstrap.py` ou `platform_core/tasks/runtime/` | `todo` | B.2/B.8 | cobre bootstrap, cron e observabilidade do worker |

## Socialwise

### Tasks e Runtime

| Origem | Destino | Status | Fase | Observação |
|---|---|---|---|---|
| `worker/WebhookWorkerTasks/agendamento.task.ts` | `domains/socialwise/tasks/agendamento.py` | `todo` | B.2 | task simples |
| `worker/WebhookWorkerTasks/leadcells.task.ts` | `domains/socialwise/tasks/lead_cells.py` | `todo` | B.2 | depende de models mirror |
| `worker/WebhookWorkerTasks/mirror-generation.task.ts` | `domains/socialwise/tasks/mirror_generation.py` | `todo` | B.3 | IA |
| `worker/WebhookWorkerTasks/analysis-generation.task.ts` | `domains/socialwise/tasks/analysis_generation.py` | `todo` | B.3 | IA |
| `worker/WebhookWorkerTasks/leads-chatwit.task.ts` | `domains/socialwise/tasks/leads_chatwit.py` | `todo` | B.2 | depende de `services/leads` |
| `worker/WebhookWorkerTasks/flow-builder-queues.task.ts` | `domains/socialwise/tasks/flow_builder.py` | `todo` | B.4 | async flow |
| `worker/WebhookWorkerTasks/flow-campaign.task.ts` | `domains/socialwise/tasks/flow_campaign.py` | `todo` | B.4 | campanhas |
| `worker/processors/instagram-webhook.processor.ts` | `domains/socialwise/tasks/instagram_webhook.py` | `todo` | B.2 | task simples |
| `lib/oab-eval/transcription-queue.ts` | `domains/socialwise/tasks/transcription.py` | `todo` | B.3 | IA |
| `lib/cost/fx-rate-worker.ts` | `domains/socialwise/tasks/fx_rate.py` | `todo` | B.2 | custo |
| `lib/cost/budget-monitor.ts` | `domains/socialwise/tasks/budget_monitor.py` | `todo` | B.2 | custo |
| `lib/cost/cost-worker.ts` | `domains/socialwise/tasks/cost_events.py` | `todo` | B.2 | custo |
| `worker/init.ts` | `platform_core/tasks/bootstrap.py` ou `platform_core/tasks/runtime/` | `replace` | B.8 | runtime real do BullMQ |
| `worker/registry.ts` | `platform_core/tasks/bootstrap.py` ou `platform_core/tasks/runtime/registry.py` | `replace` | B.8 | runtime real do BullMQ |
| `worker/cron-jobs.ts` | `platform_core/tasks/scheduler.py` ou runtime | `replace` | B.8 | bootstrap/schedules |
| `worker/queue-manager-integration.ts` | `platform_core/tasks/runtime/` | `replace` | B.8 | integração operacional |
| `worker/utils/worker-events.ts` | `platform_core/tasks/runtime/events.py` | `replace` | B.8 | observabilidade |
| `worker/processors/button.processor.ts` | classificar | `todo` | B.8 | decidir `migrate`, `absorb` ou `delete` |
| `worker/processors/intent.processor.ts` | classificar | `todo` | B.8 | decidir `migrate`, `absorb` ou `delete` |
| `worker/services/whatsapp.service.ts` | não migrar 1:1 | `contract` | B.8 | conflita com “Socialwise processa, Chatwit entrega” |

### Flow Engine

| Origem | Destino | Status | Fase | Observação |
|---|---|---|---|---|
| `services/flow-engine/chatwit-delivery-service.ts` | `domains/socialwise/services/flow/delivery_service.py` | `todo` | B.4 | httpx + retry |
| `services/flow-engine/variable-resolver.ts` | `domains/socialwise/services/flow/variable_resolver.py` | `todo` | B.4 | chain resolver |
| `services/flow-engine/mtf-variable-loader.ts` | `domains/socialwise/services/flow/mtf_loader.py` | `todo` | B.4 | variáveis MTF |
| `services/flow-engine/flow-orchestrator.ts` | `domains/socialwise/services/flow/flow_orchestrator.py` | `todo` | B.6 | core do webhook |
| `services/flow-engine/flow-executor.ts` | `domains/socialwise/services/flow/flow_executor.py` | `todo` | B.6 | core do webhook |
| `services/flow-engine/sync-bridge.ts` | `domains/socialwise/services/flow/sync_bridge.py` | `todo` | B.6 | precisa redesign async |
| `services/flow-engine/playground-collector.ts` | `domains/socialwise/services/flow/playground_collector.py` | `todo` | B.6 | adiar se necessário |
| `services/flow-engine/chatwit-conversation-resolver.ts` | `domains/socialwise/services/flow/conversation_resolver.py` | `contract` | B.4/B.6 | depende de APIs internas do Chatwit; documentar contrato ou redesenhar |
| `services/flow-engine/deadline-guard.ts` | referência apenas | `replace` | B.6 | não migrar ativo sem necessidade |

### Intent Pipeline

| Origem | Destino | Status | Fase | Observação |
|---|---|---|---|---|
| `lib/socialwise-flow/processor.ts` | `domains/socialwise/services/intent/processor.py` | `todo` | B.5 | principal |
| `lib/socialwise-flow/classification.ts` | `domains/socialwise/services/intent/classification.py` | `todo` | B.5 | principal |
| `lib/socialwise-flow/performance-bands.ts` | `domains/socialwise/services/intent/bands.py` | `todo` | B.5 | principal |
| `lib/socialwise-flow/button-processor.ts` | `domains/socialwise/services/intent/button_processor.py` | `todo` | B.5 | principal |
| `lib/socialwise-flow/meta-payload-builder.ts` | `domains/socialwise/services/intent/payload_builder.py` | `todo` | B.5 | principal |
| `lib/socialwise-flow/cache-manager.ts` | `domains/socialwise/services/intent/cache.py` | `todo` | B.5 | principal |
| `lib/socialwise-flow/services/multi-provider-processor.ts` | `domains/socialwise/services/intent/provider_processor.py` | `todo` | B.5 | principal |
| `lib/socialwise-flow/services/ai-provider-factory.ts` | `platform_core/ai/` | `replace` | B.5/C.2 | absorvido por LiteLLM |
| `lib/socialwise-flow/processor-components/*` | `domains/socialwise/services/intent/processor_components/` | `todo` | B.5 | suporte crítico não rastreado na doc macro |
| `lib/socialwise-flow/channel-formatting.ts` | `domains/socialwise/services/intent/channel_formatting.py` | `todo` | B.5 | suporte |
| `lib/socialwise-flow/concurrency-manager.ts` | `domains/socialwise/services/intent/concurrency.py` | `todo` | B.5 | suporte |
| `lib/socialwise-flow/degradation-strategies.ts` | `domains/socialwise/services/intent/degradation.py` | `todo` | B.5 | suporte |
| `lib/socialwise-flow/payment-message-detection.ts` | `domains/socialwise/services/intent/payment_detection.py` | `todo` | B.5 | suporte |
| `lib/socialwise-flow/template-component-utils.ts` | `domains/socialwise/services/intent/template_component_utils.py` | `todo` | B.5 | suporte |
| `lib/socialwise-flow/variables-resolverMETA.ts` | `domains/socialwise/services/intent/meta_variables.py` | `todo` | B.5 | suporte |
| `lib/socialwise-flow/ux-writing.ts` e `ux-writing-service.ts` | `domains/socialwise/services/intent/ux_writing.py` | `todo` | B.5 | suporte |
| `lib/socialwise-flow/cache-key-builder.ts` | `domains/socialwise/services/intent/cache_keys.py` | `todo` | B.5 | suporte |
| `lib/socialwise-flow/services/{claude-band-processor,gemini-band-processor,gemini-degradation,idempotency,rate-limiter,replay-protection,retry-context,shared-llm-pipeline,claude-client}.ts` | `domains/socialwise/services/intent/` | `todo` | B.5 | superfície de suporte subestimada |
| `lib/socialwise-flow/graph/*` e `schemas/payload.ts` | `domains/socialwise/services/intent/graph/` e `schemas/` | `todo` | B.5 | suporte |

### OAB Eval

| Origem | Destino | Status | Fase | Observação |
|---|---|---|---|---|
| `lib/oab-eval/transcription-agent.ts` | `domains/socialwise/services/oab_eval/transcription_agent.py` | `todo` | B.3 | principal |
| `lib/oab-eval/mirror-generator-agent.ts` | `domains/socialwise/services/oab_eval/mirror_generator.py` | `todo` | B.3 | principal |
| `lib/oab-eval/analysis-agent.ts` | `domains/socialwise/services/oab_eval/analysis_agent.py` | `todo` | B.3 | principal |
| `lib/oab-eval/unified-vision-client.ts` | `domains/socialwise/services/oab_eval/vision_client.py` | `todo` | B.3 | principal |
| `lib/oab-eval/operation-control.ts` | `domains/socialwise/services/oab_eval/operation_control.py` | `todo` | B.3 | principal |
| `lib/oab-eval/rubric-scoring.ts` | `domains/socialwise/services/oab_eval/rubric_scoring.py` | `todo` | B.3 | principal |
| `lib/oab-eval/runtime-policy.ts` | `domains/socialwise/services/oab_eval/runtime_policy.py` | `todo` | B.3 | principal |
| `lib/oab-eval/analysis-queue.ts` e `mirror-queue.ts` | `domains/socialwise/tasks/` ou `api/` | `todo` | B.3 | wrappers de enqueue/status |
| `lib/oab-eval/operation-service.ts`, `operation-types.ts`, `repository.ts` | `domains/socialwise/services/oab_eval/` | `todo` | B.3 | suporte operacional |
| `lib/oab-eval/chunker.ts`, `evaluator.ts`, `mirror-formatter.ts`, `text-extraction.ts`, `rubric-from-pdf.ts`, `types.ts` | `domains/socialwise/services/oab_eval/` | `todo` | B.3 | apoio direto |
| `lib/oab-eval/openai-client.ts` e `gemini-client.ts` | `platform_core/ai/` | `replace` | B.3/C.2 | absorver por LiteLLM |
| `lib/oab-eval/graph/*` | `domains/socialwise/services/oab_eval/graph/` | `todo` | B.3 | orquestração atual |
| `lib/oab-eval/recurso-generator-agent.ts` | decidir escopo | `todo` | B.3 | fora da lista macro atual |

### Cost e Leads

| Origem | Destino | Status | Fase | Observação |
|---|---|---|---|---|
| `lib/cost/pricing-service.ts` | `domains/socialwise/services/cost/pricing.py` | `todo` | B.2 | principal |
| `lib/cost/idempotency-service.ts` | `domains/socialwise/services/cost/idempotency.py` | `todo` | B.2 | principal |
| `lib/cost/audit-logger.ts` | `domains/socialwise/services/cost/audit.py` | `todo` | B.2 | principal |
| `lib/cost/queue-config.ts` | `domains/socialwise/tasks/` ou brokers | `todo` | B.2 | runtime |
| `lib/cost/error-handler.ts` | `domains/socialwise/services/cost/error_handler.py` | `todo` | B.2 | suporte |
| `lib/cost/request-cost-tracker.ts` | `platform_core/ai/cost_tracker.py` ou `domains/socialwise/services/cost/request_tracker.py` | `replace` | B.2/C.2 | decidir shared vs domínio |
| `lib/cost/budget-controls.ts` | `domains/socialwise/services/cost/budget_controls.py` | `todo` | B.2 | suporte |
| `lib/cost/{budget-guard,budget-system,cost-monitor,notification-service,openai-wrapper,whatsapp-wrapper}.ts` | `domains/socialwise/services/cost/` | `todo` | B.2 | triagem necessária |
| `lib/leads-chatwit/process-chatwit-lead-sync.ts` | `domains/socialwise/services/leads/process_chatwit_lead_sync.py` | `todo` | B.2 | principal |
| `lib/leads-chatwit/normalize-chatwit-lead-sync-payload.ts` | `domains/socialwise/services/leads/normalize_payload.py` | `todo` | B.2 | suporte |
| `lib/leads-chatwit/sanitize-chatwit-payload.ts` | `domains/socialwise/services/leads/sanitize_payload.py` | `todo` | B.2 | suporte |

## JusMonitorIA

### DB e Alembic

| Origem | Destino | Status | Fase | Observação |
|---|---|---|---|---|
| `backend/app/db/models/*` | `domains/jusmonitoria/db/models/*` | `todo` | A.1 | principal |
| `backend/app/db/repositories/*` | `domains/jusmonitoria/db/repositories/*` | `todo` | A.1 | principal |
| `backend/app/db/base.py` | `domains/jusmonitoria/db/base.py` | `todo` | A.1 | principal |
| `backend/app/db/engine.py` | `platform_core/db/engines.py` + `platform_core/db/sessions.py` | `replace` | A.1 | não copiar 1:1 |
| `backend/alembic/versions/*` | `domains/jusmonitoria/alembic/versions/*` | `todo` | A.1 | migrations do domínio |
| `backend/app/db/repositories/{optimized_base,optimized_client,optimized_legal_case}.py` | `domains/jusmonitoria/db/repositories/` | `todo` | A.1 | faltavam no plano macro |
| `backend/app/db/models/{automation,client_automation,client_note,event,notification,processo_monitorado,scrape_job,tag,timeline_embedding,timeline_event,user_integration,user_preference,worker_schedule}.py` | `domains/jusmonitoria/db/models/` | `todo` | A.1 | faltavam no plano macro |

### API e Schemas

| Origem | Destino | Status | Fase | Observação |
|---|---|---|---|---|
| `backend/app/api/v1/endpoints/*.py` | `domains/jusmonitoria/api/v1/endpoints/*.py` | `todo` | A.2 | principal |
| `backend/app/api/v1/router.py` | `domains/jusmonitoria/api/v1/router.py` | `todo` | A.2 | faltava no plano macro |
| `backend/app/api/v1/notifications.py` | decidir entre domínio e infra SSE | `replace` | A.2/C.3 | avaliar com `sse_manager.py` |
| `backend/app/api/v1/websocket.py` | adapter sobre `platform_core/services/sse_manager.py` | `replace` | A.2/C.3 | não copiar cru |
| `backend/app/api/v1/endpoints/{admin,audit,health,metrics,pdf_converter,pje,processos_monitorados,profile,storage,tribunais,two_factor,webhooks}.py` | `domains/jusmonitoria/api/v1/endpoints/` | `todo` | A.2 | faltavam na doc macro |
| `backend/app/schemas/*.py` | `domains/jusmonitoria/schemas/*.py` | `todo` | A.2 | principal |
| `backend/app/schemas/{admin,audit,chatwit,payment_webhook,profile,user_preference}.py` | `domains/jusmonitoria/schemas/` | `todo` | A.2 | faltavam na doc macro |

### Auth, Middleware, Services, AI e Tasks

| Origem | Destino | Status | Fase | Observação |
|---|---|---|---|---|
| `backend/app/core/auth/*` | `platform_core/auth/` | `todo` | A.5/C.1 | auth compartilhado |
| `backend/app/core/middleware/{logging,metrics,rate_limit,security,cache,audit}.py` | `platform_core/middleware/` | `todo` | A.5/C.4 | shared |
| `backend/app/core/middleware/tenant.py` | `domains/jusmonitoria/middleware/tenant.py` ou uso seletivo em `platform_core/middleware/tenant.py` | `todo` | A.5 | específico do domínio |
| `backend/app/core/services/{caso_oab_service,cobranca_service,contrato_document_service,contrato_service,datajud_service,financeiro_service,multimodal_embedding_service,oab_finder_service,payment_webhook_service,pdf_image_converter}.py` | `domains/jusmonitoria/services/` | `todo` | A.3 | principal |
| `backend/app/core/services/{audit_service,chatwit_integration_service,chatwit_tags,chatwit_tenant_resolver,instagram_oauth}.py` | `domains/jusmonitoria/services/` | `todo` | A.3 | faltavam na doc macro |
| `backend/app/core/services/{crm,dashboard,datajud,peticoes,search,tpu}/` | `domains/jusmonitoria/services/` | `todo` | A.3 | submódulos reais |
| `backend/app/ai/agents/{triage,maestro,investigator,writer}.py` | `domains/jusmonitoria/ai/agents/` | `todo` | A.3 | principal |
| `backend/app/workers/tasks/*.py` | `domains/jusmonitoria/tasks/*.py` | `todo` | A.4 | principal |
| `backend/app/workers/tasks/{comarcas_sync,contratos,funnel_automations,multimodal_embeddings}.py` | `domains/jusmonitoria/tasks/` | `todo` | A.4 | faltavam na doc macro |
| `backend/app/workers/broker.py` | `platform_core/tasks/brokers/jusmonitoria.py` | `replace` | A.4 | broker já existe |
| `backend/app/workers/main.py` | novo entrypoint do repo | `replace` | A.4 | não copiar cru |
| `backend/app/workers/scheduler.py` | `domains/jusmonitoria/tasks/scheduler.py` ou shared | `todo` | A.4 | runtime |
| `backend/app/workers/events/*` | `domains/jusmonitoria/events/` ou shared | `todo` | A.4 | runtime |

## Decisões e Bloqueios

| Item | Ação |
|---|---|
| `chatwit-conversation-resolver.ts` | abrir contrato Chatwit ou redesenhar; não portar 1:1 |
| `worker/services/whatsapp.service.ts` | revisar contra regra “Chatwit entrega” antes de migrar |
| `backend/app/api/v1/websocket.py` | trocar por SSE/pubsub do `platform_core` |
| `backend/app/db/engine.py` | absorver no core, sem cópia direta |
| runtime BullMQ (`init.ts`, `registry.ts`, cron, events`) | modelar bootstrap Python explícito; a doc macro ainda não cobre isso |

## Gates de Cutover

- [ ] `platform_core/auth`, `platform_core/ai`, `platform_core/middleware` e `platform_core/services` deixaram de ser stubs
- [ ] JusMonitorIA sobe com rotas, auth, migrations e worker
- [ ] Socialwise tasks simples rodam via TaskIQ
- [ ] OAB eval roda side-by-side e passa em validação A/B
- [ ] Flow async roda end-to-end
- [ ] Intent pipeline retorna equivalência aceitável
- [ ] webhook/SyncBridge em Python validado
- [ ] filas BullMQ drenadas
- [ ] `worker/` do Socialwise pode ser removido
