# Sistema Refatoração Prisma - Guia de Arquitetura e Funções

## Visão Geral

Este documento fornece um guia detalhado da arquitetura, arquivos e funções do sistema ChatWit refatorado. O sistema foi redesenhado para alta performance, escalabilidade e observabilidade.

## Estrutura do Projeto

```
chatwit-sistema-refatoracao/
├── app/                          # Next.js App Router
│   ├── api/                      # API Routes
│   └── admin/                    # Interface administrativa
├── lib/                          # Bibliotecas e utilitários
├── worker/                       # Sistema de workers
├── docs/                         # Documentação
├── __tests__/                    # Testes automatizados
├── scripts/                      # Scripts de automação
└── prisma/                       # Schema e migrações do banco
```

## 🚀 Sistema de Webhook (Core)

### `app/api/admin/mtf-diamante/whatsapp/webhook/route.ts`
**Função Principal**: Endpoint principal para recebimento de webhooks do WhatsApp/Dialogflow

**Principais Funções**:
- `POST()` - Handler principal do webhook
- `queueHighPriorityJob()` - Enfileira jobs de alta prioridade
- `queueLowPriorityJob()` - Enfileira jobs de baixa prioridade
- `processIntentRequest()` - Processa requisições de intent
- `processButtonClickRequest()` - Processa cliques de botão

**Características**:
- ⚡ Resposta em < 100ms
- 🔄 Sistema de filas duplas (alta/baixa prioridade)
- 📊 Monitoramento integrado
- 🎛️ Feature flags para rollout gradual
- 🔗 Correlation ID para rastreamento

### `lib/webhook-utils.ts`
**Função**: Utilitários para processamento de webhooks

**Principais Funções**:
- `extractUnifiedWebhookData()` - Extração unificada de dados
- `validateUnifiedWebhookData()` - Validação de payload
- `sanitizeWebhookPayload()` - Sanitização de dados
- `logUnifiedWebhookData()` - Logging estruturado

## 🔄 Sistema de Filas

### `lib/queue/resposta-rapida.queue.ts`
**Função**: Fila de alta prioridade para respostas imediatas ao usuário

**Principais Classes/Funções**:
- `respostaRapidaQueue` - Instância da fila BullMQ
- `addRespostaRapidaJob()` - Adiciona job à fila
- `createIntentJob()` - Cria job de processamento de intent
- `createButtonJob()` - Cria job de processamento de botão
- `handleJobFailure()` - Gerencia falhas de jobs
- `getQueueHealth()` - Monitora saúde da fila

**Configuração**:
- Prioridade: 100 (máxima)
- Tentativas: 3
- Timeout: 30 segundos
- Backoff: Exponencial (1s inicial)

### `lib/queue/persistencia-credenciais.queue.ts`
**Função**: Fila de baixa prioridade para persistência de dados

**Principais Classes/Funções**:
- `persistenciaCredenciaisQueue` - Instância da fila
- `addPersistenciaCredenciaisJob()` - Adiciona job
- `createCredentialsUpdateJob()` - Job de atualização de credenciais
- `BatchProcessor` - Processamento em lote
- `globalBatchProcessor` - Instância global do processador

**Configuração**:
- Prioridade: 1 (baixa)
- Tentativas: 5
- Timeout: 60 segundos
- Delay: 1 segundo para batching

## 👷 Sistema de Workers

### `worker/WebhookWorkerTasks/respostaRapida.worker.task.ts`
**Função**: Worker para processamento de alta prioridade

**Principais Classes**:
- `IntentProcessor` - Processa intents do Dialogflow
- `ButtonProcessor` - Processa cliques de botão
- `CredentialsFallbackResolver` - Resolve credenciais com fallback

**Principais Funções**:
- `processRespostaRapidaTask()` - Função principal de processamento
- `processIntent()` - Processa intent específico
- `processButtonClick()` - Processa clique de botão
- `resolveCredentials()` - Resolve credenciais com fallback

### `worker/WebhookWorkerTasks/persistencia.worker.task.ts`
**Função**: Worker para persistência de dados

**Principais Classes**:
- `PersistenciaWorker` - Worker principal
- `CredentialsFallbackResolver` - Resolver de credenciais
- `UnifiedLeadManager` - Gerenciador unificado de leads

**Principais Funções**:
- `processPersistenciaTask()` - Função principal
- `processJob()` - Processa job específico
- `updateCredentials()` - Atualiza credenciais
- `updateLead()` - Atualiza dados do lead

### `worker/init.ts`
**Função**: Inicialização do sistema de workers

**Principais Funções**:
- `initializeWorkers()` - Inicializa todos os workers
- `createParentWorker()` - Cria worker pai
- `setupWorkerMonitoring()` - Configura monitoramento

## 💾 Sistema de Cache

### `lib/cache/credentials-cache.ts`
**Função**: Cache inteligente para credenciais do WhatsApp

**Principais Classes**:
- `CredentialsCache` - Cache principal
- `CacheInvalidationManager` - Gerenciador de invalidação
- `CacheWarmingManager` - Aquecimento de cache
- `CacheHealthMonitor` - Monitor de saúde

**Principais Funções**:
- `getCredentials()` - Busca credenciais
- `setCredentials()` - Armazena credenciais
- `invalidateCredentials()` - Invalida cache
- `batchGetCredentials()` - Busca em lote
- `warmFrequentlyAccessedCredentials()` - Aquece cache

**Características**:
- 🔄 TTL configurável (1 hora padrão)
- 📊 Métricas de hit/miss rate
- 🔥 Aquecimento automático
- 🚨 Monitoramento de saúde

## 📊 Sistema de Monitoramento

### `lib/monitoring/application-performance-monitor.ts`
**Função**: Monitor de performance da aplicação

**Principais Classes**:
- `ApplicationPerformanceMonitor` - Monitor principal
- `Alert` - Interface de alertas

**Principais Funções**:
- `recordWebhookMetrics()` - Registra métricas de webhook
- `recordWorkerMetrics()` - Registra métricas de worker
- `recordDatabaseMetrics()` - Registra métricas de banco
- `createAlert()` - Cria alertas
- `getPerformanceSummary()` - Resumo de performance

**Métricas Monitoradas**:
- ⏱️ Tempo de resposta de webhook (< 100ms)
- 🔧 Tempo de processamento de worker (< 5s)
- 🗄️ Tempo de query de banco (< 1s)
- 💾 Taxa de hit do cache (> 70%)
- 🚨 Taxa de erro (< 5%)

### `lib/monitoring/queue-monitor.ts`
**Função**: Monitor específico para filas

**Principais Classes**:
- `QueueMonitor` - Monitor de filas
- `QueueHealthMetrics` - Métricas de saúde
- `JobMetrics` - Métricas de jobs

**Principais Funções**:
- `registerQueue()` - Registra fila para monitoramento
- `getQueueHealth()` - Saúde da fila
- `getQueuePerformanceStats()` - Estatísticas de performance
- `getFailedJobs()` - Jobs falhados
- `getSlowJobs()` - Jobs lentos

### `lib/monitoring/database-monitor.ts`
**Função**: Monitor de performance do banco de dados

**Principais Classes**:
- `DatabaseMonitor` - Monitor principal
- `SlowQueryAlert` - Alertas de queries lentas

**Principais Funções**:
- `createMonitoredPrismaClient()` - Cliente Prisma monitorado
- `recordDatabaseMetrics()` - Registra métricas
- `getQueryPerformanceStats()` - Estatísticas de queries
- `getSlowQueryAlerts()` - Alertas de queries lentas

## 🎛️ Sistema de Feature Flags

### `lib/feature-flags/feature-flag-manager.ts`
**Função**: Gerenciamento de feature flags para rollout gradual

**Principais Classes**:
- `FeatureFlagManager` - Gerenciador principal
- `FeatureFlag` - Interface de feature flag
- `FeatureFlagEvaluation` - Avaliação de flag

**Principais Funções**:
- `setFeatureFlag()` - Define feature flag
- `isEnabled()` - Verifica se flag está ativa
- `evaluate()` - Avaliação detalhada
- `gradualRollout()` - Rollout gradual
- `createABTest()` - Cria teste A/B

**Feature Flags Disponíveis**:
- `NEW_WEBHOOK_PROCESSING` - Novo processamento de webhook
- `HIGH_PRIORITY_QUEUE` - Fila de alta prioridade
- `LOW_PRIORITY_QUEUE` - Fila de baixa prioridade
- `UNIFIED_LEAD_MODEL` - Modelo unificado de leads
- `INTELLIGENT_CACHING` - Cache inteligente
- `APPLICATION_MONITORING` - Monitoramento da aplicação

### `scripts/rollout-management.ts`
**Função**: Script CLI para gerenciamento de rollout

**Principais Classes**:
- `RolloutManager` - Gerenciador de rollout

**Comandos Disponíveis**:
- `init` - Inicializa feature flags
- `status` - Status atual das flags
- `phase1` - Rollout Fase 1 (Monitoramento)
- `phase2` - Rollout Fase 2 (Filas)
- `phase3` - Rollout Fase 3 (Modelos Unificados)
- `phase4` - Rollout Fase 4 (Webhook)
- `phase5` - Rollout Fase 5 (Recursos Avançados)
- `rollback` - Rollback de emergência

## 📝 Sistema de Feedback

### `lib/feedback/feedback-collector.ts`
**Função**: Coleta e análise de feedback dos usuários

**Principais Classes**:
- `FeedbackCollector` - Coletor principal
- `UserFeedback` - Interface de feedback
- `FeedbackAnalysis` - Análise de feedback

**Principais Funções**:
- `submitFeedback()` - Submete feedback
- `getFeedbackMetrics()` - Métricas de feedback
- `analyzeFeedback()` - Análise de sentimento
- `submitFeatureFlagFeedback()` - Feedback específico de feature flag

## 🗄️ Modelos de Dados Unificados

### `prisma/schema.prisma`
**Função**: Schema unificado do banco de dados

**Principais Modelos**:
- `ChatwitInbox` - Caixas de entrada unificadas
- `Lead` - Leads unificados com múltiplas fontes
- `Template` - Templates unificados
- `MapeamentoIntencao` - Mapeamento de intents
- `MapeamentoBotao` - Mapeamento de botões
- `ButtonReactionMapping` - Mapeamento de reações

**Características**:
- 🔗 Relacionamentos otimizados
- 📊 Índices para performance
- 🔄 Suporte a fallback de credenciais
- 📝 Auditoria com timestamps

## 🧪 Sistema de Testes

### `__tests__/integration/webhook-e2e-comprehensive.test.ts`
**Função**: Testes end-to-end do webhook

**Principais Testes**:
- Processamento de intents
- Processamento de botões
- Performance sob carga
- Monitoramento e alertas

### `__tests__/performance/worker-performance.test.ts`
**Função**: Testes de performance dos workers

**Principais Testes**:
- Throughput de processamento
- Latência de jobs
- Escalabilidade
- Métricas de performance

### `__tests__/unit/queue-managers.test.ts`
**Função**: Testes unitários das filas

**Principais Testes**:
- Enfileiramento de jobs
- Processamento de jobs
- Gerenciamento de falhas
- Métricas de fila

## 🔧 APIs Administrativas

### `app/api/admin/monitoring/dashboard/route.ts`
**Função**: Dashboard de monitoramento

**Endpoints**:
- `GET /api/admin/monitoring/dashboard` - Dashboard completo
- Métricas de sistema
- Status de componentes
- Alertas ativos
- Recomendações

### `app/api/admin/feature-flags/route.ts`
**Função**: Gerenciamento de feature flags

**Endpoints**:
- `GET /api/admin/feature-flags` - Lista flags
- `POST /api/admin/feature-flags` - Cria/atualiza flags
- `DELETE /api/admin/feature-flags` - Remove flags

### `app/api/admin/feedback/route.ts`
**Função**: Sistema de feedback

**Endpoints**:
- `GET /api/admin/feedback` - Lista feedback
- `POST /api/admin/feedback` - Submete feedback
- Análise de sentimento
- Métricas de feedback

## 📚 Documentação Operacional

### `docs/operations/deployment-guide.md`
**Função**: Guia completo de deployment

**Conteúdo**:
- Pré-requisitos do sistema
- Passos de deployment
- Configuração de ambiente
- Verificação pós-deployment
- Estratégias de scaling

### `docs/operations/troubleshooting-guide.md`
**Função**: Guia de troubleshooting

**Conteúdo**:
- Diagnósticos rápidos
- Problemas comuns e soluções
- Procedimentos de recovery
- Comandos de emergência

### `docs/operations/performance-tuning-guide.md`
**Função**: Guia de otimização de performance

**Conteúdo**:
- Otimização de webhook
- Tuning de filas
- Otimização de banco
- Configuração de cache

### `docs/operations/disaster-recovery-procedures.md`
**Função**: Procedimentos de disaster recovery

**Conteúdo**:
- Cenários de falha
- Procedimentos de recovery
- RTO/RPO targets
- Testes de DR

## 🚀 Fluxo de Processamento

### 1. Recebimento de Webhook
```
Dialogflow/WhatsApp → webhook/route.ts → Feature Flags Check → Queue Jobs
```

### 2. Processamento de Alta Prioridade
```
resposta-rapida.queue → respostaRapida.worker → Intent/Button Processing → WhatsApp API
```

### 3. Processamento de Baixa Prioridade
```
persistencia-credenciais.queue → persistencia.worker → Database Updates → Cache Updates
```

### 4. Monitoramento Contínuo
```
All Components → Monitoring System → Alerts → Dashboard → Feedback Loop
```

## 🔧 Configuração e Inicialização

### Variáveis de Ambiente Principais
```bash
# Database
DATABASE_URL="postgresql://..."

# Redis
REDIS_URL="redis://localhost:6379"

# Monitoring
MONITORING_ENABLED=true
APM_SAMPLE_RATE=1.0

# Queue Configuration
RESPOSTA_RAPIDA_CONCURRENCY=10
PERSISTENCIA_CREDENCIAIS_CONCURRENCY=5

# Performance Thresholds
WEBHOOK_RESPONSE_TIME_THRESHOLD=100
WORKER_PROCESSING_TIME_THRESHOLD=5000
DATABASE_QUERY_TIME_THRESHOLD=1000
```

### Inicialização do Sistema
```typescript
// 1. Inicializar monitoramento
import { initializeMonitoring } from './lib/monitoring/init-monitoring';
await initializeMonitoring();

// 2. Inicializar feature flags
import { initializeDefaultFeatureFlags } from './lib/feature-flags/feature-flag-manager';
await initializeDefaultFeatureFlags();

// 3. Inicializar workers
import { initializeWorkers } from './worker/init';
await initializeWorkers();

// 4. Inicializar cache
import { startCacheMaintenance } from './lib/cache/credentials-cache';
startCacheMaintenance();
```

## 📈 Métricas e KPIs

### Performance Targets
- **Webhook Response Time**: < 100ms (target: 50ms)
- **Worker Processing Time**: < 5s (target: 2s)
- **Database Query Time**: < 1s (target: 500ms)
- **Cache Hit Rate**: > 70% (target: 85%)
- **System Availability**: > 99.9%
- **Error Rate**: < 5% (target: 1%)

### Throughput Targets
- **Webhook Requests**: 1000 req/min
- **Queue Processing**: 500 jobs/min (alta prioridade), 200 jobs/min (baixa prioridade)
- **Database Operations**: 2000 queries/min
- **Cache Operations**: 5000 ops/min

## 🔄 Estratégia de Rollout

### Fase 1: Infraestrutura (0-24h)
- Monitoramento: 100%
- Cache inteligente: 100%
- Correlation ID: 100%

### Fase 2: Sistema de Filas (24-48h)
- Fila alta prioridade: 0% → 100% (gradual)
- Fila baixa prioridade: 0% → 100% (gradual)

### Fase 3: Modelos Unificados (48-72h)
- Modelo unificado de leads: 0% → 100% (gradual)
- Modelo unificado de templates: 0% → 100% (gradual)

### Fase 4: Novo Webhook (72-96h)
- Processamento de webhook: 0% → 100% (muito gradual)

### Fase 5: Recursos Avançados (96h+)
- Cache multi-nível: 100%
- Worker scaling: 100%
- Alertas avançados: 100%

## 🚨 Alertas e Monitoramento

### Alertas Críticos
- Sistema indisponível
- Cache desconectado
- Fila com > 500 jobs
- Taxa de erro > 10%

### Alertas de Warning
- Tempo de resposta > 100ms
- Taxa de hit do cache < 70%
- Queries lentas > 1s
- Fila com > 100 jobs

### Alertas de Info
- Rollout de feature flag
- Limpeza de cache
- Scaling de workers

Este guia fornece uma visão completa da arquitetura e funcionamento do sistema refatorado. Para informações específicas sobre cada componente, consulte os arquivos de código correspondentes e a documentação operacional.