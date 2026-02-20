# Flow Builder Queues — Documentação Técnica

> Arquitetura robusta de filas BullMQ para ações assíncronas do Flow Engine.

## Visão Geral

O sistema de filas do Flow Builder processa ações assíncronas que não precisam de resposta imediata ao usuário. A arquitetura consiste em:

1. **Fila Principal** (`flow-builder-queues`): Ações de flows individuais
2. **Fila de Campanhas** (`flow-campaign`): Disparos em massa
3. **Dead Letter Queue** (`flow-builder-dlq`): Jobs que falharam permanentemente

### Benefícios

- **Retry robusto**: 3-5 tentativas com exponential backoff
- **Persistência**: Jobs sobrevivem a crashes (Redis)
- **Dead Letter Queue**: Jobs problemáticos são preservados para análise
- **Observabilidade**: Métricas via BullMQ dashboard
- **Escalabilidade**: Workers podem ser escalados independentemente
- **Não-bloqueante**: Flow continua sem esperar a ação completar
- **Priorização**: Interações ao vivo > ações normais > campanhas

## Arquitetura

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│  FLOW EXECUTOR (sync path)                                                          │
│                                                                                     │
│  handleChatwitAction() ──► addChatwitActionJob() ──► Redis Queue ──┐               │
│  handleHttpRequest()   ──► addFlowBuilderJob()   ──►               │               │
│  handleDelay()         ──► addDelayJob()         ──►               │               │
│  handleMediaUpload()   ──► addMediaUploadJob()   ──►               │               │
│         │                                                          │               │
│         └─ Fallback (se fila falhar): execução direta              │               │
└─────────────────────────────────────────────────────────────────────┼───────────────┘
                                                                     │
                                                                     ▼
┌─────────────────────────────────────────────────────────────────────────────────────┐
│  BULLMQ WORKER (async processing)                                                   │
│                                                                                     │
│  processFlowBuilderTask() ──► switch(jobType)                                       │
│         │                                                                           │
│         ├─ CHATWIT_ACTION ──► handleChatwitAction() ──► Chatwit API                │
│         ├─ HTTP_REQUEST   ──► handleHttpRequest()   ──► External HTTP              │
│         ├─ TAG_ACTION     ──► handleTagAction()     ──► Chatwit Labels API         │
│         ├─ WEBHOOK_NOTIFY ──► handleWebhookNotify() ──► External Webhook           │
│         ├─ DELAY          ──► handleDelay()         ──► Resume Flow                │
│         └─ MEDIA_UPLOAD   ──► handleMediaUpload()   ──► Chatwit Media API          │
│                                                                                     │
│         └─ [Falha permanente] ──► addToDLQ() ──► Dead Letter Queue                 │
└─────────────────────────────────────────────────────────────────────────────────────┘
                                                                     │
                                                                     ▼
┌─────────────────────────────────────────────────────────────────────────────────────┐
│  CAMPAIGN ORCHESTRATOR (batch processing)                                           │
│                                                                                     │
│  startCampaign() ──► chunks de contatos ──► flow-campaign queue                    │
│  pauseCampaign() ──► pausa jobs pendentes                                          │
│  resumeCampaign() ──► retoma execução                                              │
│  cancelCampaign() ──► remove jobs + marca contatos como SKIPPED                    │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

## Arquivos

| Arquivo | Descrição |
|---------|-----------|
| `lib/queue/flow-builder-queues.ts` | Fila principal: tipos, helpers, métricas |
| `lib/queue/flow-builder-dlq.ts` | Dead Letter Queue |
| `lib/queue/flow-campaign-queue.ts` | Fila de campanhas |
| `lib/queue/campaign-orchestrator.ts` | Orquestrador de campanhas |
| `worker/WebhookWorkerTasks/flow-builder-queues.task.ts` | Task processor (handlers) |
| `worker/webhook.worker.ts` | Registro do worker |
| `services/flow-engine/flow-executor.ts` | Integração no FlowExecutor |
| `prisma/schema.prisma` | Models FlowCampaign, FlowCampaignContact |

## Tipos de Job Suportados

### 1. CHATWIT_ACTION ✅

Ações de conversa no Chatwit:
- `resolve_conversation`: Resolver/fechar conversa
- `assign_agent`: Atribuir a um agente
- `add_label`: Adicionar etiqueta(s)
- `remove_label`: Remover etiqueta(s)

```typescript
interface ChatwitActionJobData {
  jobType: "CHATWIT_ACTION";
  flowId: string;
  sessionId: string;
  nodeId: string;
  context: DeliveryContext;
  payload: {
    type: "chatwit_action";
    actionType: "resolve_conversation" | "assign_agent" | "add_label" | "remove_label";
    assigneeId?: number;
    labels?: string[];
  };
}
```

### 2. HTTP_REQUEST ✅

Chamadas HTTP externas com timeout configurável:

```typescript
interface HttpRequestJobData {
  jobType: "HTTP_REQUEST";
  payload: {
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
    url: string;
    headers?: Record<string, string>;
    body?: string;
    timeoutMs?: number;       // default: 10000
    responseVariable?: string; // salva resposta na sessão
  };
}
```

### 3. TAG_ACTION ✅

Ações de tag (labels) via API Chatwit:

```typescript
interface TagActionJobData {
  jobType: "TAG_ACTION";
  payload: {
    action: "add" | "remove";
    tagName: string;
  };
}
```

### 4. WEBHOOK_NOTIFY ✅

Notificações webhook externas (fire-and-forget):

```typescript
interface WebhookNotifyJobData {
  jobType: "WEBHOOK_NOTIFY";
  payload: {
    url: string;
    method: "GET" | "POST";
    headers?: Record<string, string>;
    body?: Record<string, unknown>;
  };
}
```

### 5. DELAY ✅

Delays longos (>5 minutos) via scheduled jobs:

```typescript
interface DelayJobData {
  jobType: "DELAY";
  payload: {
    delayMs: number;
    resumeNodeId: string;
    scheduledFor: string; // ISO timestamp
  };
}
```

### 6. MEDIA_UPLOAD ✅

Upload de mídia (2-step: download + upload + send):

```typescript
interface MediaUploadJobData {
  jobType: "MEDIA_UPLOAD";
  payload: {
    mediaUrl: string;
    filename?: string;
    caption?: string;
    mediaType: "image" | "document" | "audio" | "video";
  };
}
```

## Dead Letter Queue (DLQ)

Jobs que falham após todas as tentativas são movidos para a DLQ:

```typescript
interface DLQJobData {
  originalJobId: string;
  originalQueue: string;
  jobType: FlowBuilderJobType;
  originalData: FlowBuilderJobData;
  failureReason: string;
  stackTrace?: string;
  attempts: number;
  lastAttemptAt: string;
  movedToDlqAt: string;
}
```

### Operações DLQ

```typescript
import { getDLQMetrics, retryDLQJob, listDLQJobs, cleanOldDLQJobs } from "@/lib/queue/flow-builder-dlq";

// Métricas
const metrics = await getDLQMetrics();
// { total: 5, byJobType: { HTTP_REQUEST: 3, ... }, recentFailures: 2 }

// Retry manual
await retryDLQJob("dlq:job-id");

// Listar jobs
const { jobs, total } = await listDLQJobs(0, 50);

// Limpeza (jobs > 7 dias)
await cleanOldDLQJobs(7 * 24 * 60 * 60 * 1000);
```

## Sistema de Campanhas

### Schema Prisma

```prisma
model FlowCampaign {
  id              String                 @id @default(cuid())
  name            String
  flowId          String
  inboxId         String
  status          FlowCampaignStatus     @default(DRAFT)
  scheduledAt     DateTime?
  totalContacts   Int                    @default(0)
  sentCount       Int                    @default(0)
  failedCount     Int                    @default(0)
  skippedCount    Int                    @default(0)
  rateLimit       Int                    @default(30)  // msgs/min
  priorityLevel   Int                    @default(8)
  variables       Json                   @default("{}")
  // ...
}

model FlowCampaignContact {
  id            String                    @id @default(cuid())
  campaignId    String
  contactId     String
  status        FlowCampaignContactStatus @default(PENDING)
  sessionId     String?
  variables     Json                      @default("{}")
  // ...
}

enum FlowCampaignStatus {
  DRAFT, SCHEDULED, RUNNING, PAUSED, COMPLETED, CANCELLED
}
```

### Campaign Orchestrator

```typescript
import {
  startCampaign,
  pauseCampaign,
  resumeCampaign,
  cancelCampaign,
  getCampaignProgress
} from "@/lib/queue/campaign-orchestrator";

// Iniciar campanha
const result = await startCampaign({ campaignId: "xyz" });
// { success: true, totalContacts: 500, batchesCreated: 10 }

// Pausar
await pauseCampaign("xyz", "Manutenção programada");

// Retomar
await resumeCampaign("xyz");

// Cancelar
await cancelCampaign("xyz", "Cancelado pelo usuário");

// Progresso
const progress = await getCampaignProgress("xyz");
// { sentCount: 250, failedCount: 5, progressPercent: 51, estimatedTimeRemaining: 300 }
```

### Rate Limiting

```typescript
const CHANNEL_RATE_LIMITS = {
  whatsapp: { perMinute: 30, perHour: 1000 },
  instagram: { perMinute: 20, perHour: 500 },
  facebook: { perMinute: 25, perHour: 800 },
};
```

## Configuração

### Fila Principal

```typescript
const DEFAULT_JOB_OPTIONS = {
  attempts: 3,                    // 3 tentativas
  backoff: {
    type: "exponential",
    delay: 2000,                  // 2s → 4s → 8s
  },
  removeOnComplete: 100,
  removeOnFail: 50,
};
```

### Worker

```typescript
flowBuilderQueuesWorker = new Worker(FLOW_BUILDER_QUEUE_NAME, processFlowBuilderTask, {
  connection: getRedisInstance(),
  concurrency: 10,
  lockDuration: 30000,            // 30s por job
  stalledInterval: 60000,
  maxStalledCount: 2,
});
```

## Prioridades

| Tipo | Prioridade | Descrição |
|------|------------|-----------|
| Live interactions | 1 | Cliques de botão, novas conversas |
| Critical jobs | 2 | Jobs marcados como `critical: true` |
| Media uploads | 3 | Upload de mídia |
| Normal jobs | 5 | Padrão |
| Campaign jobs | 8 | Disparos de campanha |

## Como Adicionar Novo Tipo de Job

### 1. Definir o tipo em `lib/queue/flow-builder-queues.ts`

```typescript
// Adicionar ao union type
export type FlowBuilderJobType =
  | "CHATWIT_ACTION"
  | "HTTP_REQUEST"
  // ...
  | "MEU_NOVO_TIPO";

// Definir interface
export interface MeuNovoTipoJobData extends FlowBuilderJobBase {
  jobType: "MEU_NOVO_TIPO";
  payload: {
    // campos específicos
  };
}

// Adicionar ao union de jobs
export type FlowBuilderJobData =
  | ChatwitActionJobData
  // ...
  | MeuNovoTipoJobData;
```

### 2. Criar helper (opcional)

```typescript
export async function addMeuNovoTipoJob(data: {...}): Promise<string> {
  const queue = getFlowBuilderQueue();
  const jobData: MeuNovoTipoJobData = { ... };
  const job = await queue.add("meu-novo-tipo", jobData, { ... });
  return job.id!;
}
```

### 3. Implementar handler em `flow-builder-queues.task.ts`

```typescript
// Adicionar case no switch
case "MEU_NOVO_TIPO":
  result = await handleMeuNovoTipo(job as Job<MeuNovoTipoJobData>);
  break;

// Implementar handler
async function handleMeuNovoTipo(job: Job<MeuNovoTipoJobData>): Promise<FlowBuilderJobResult> {
  const { flowId, sessionId, nodeId, payload } = job.data;

  // Lógica do handler

  return {
    success: true,
    jobType: "MEU_NOVO_TIPO",
    flowId,
    sessionId,
    nodeId,
    attempts: job.attemptsMade + 1,
    processingTimeMs: 0,
  };
}
```

### 4. Integrar no FlowExecutor (se aplicável)

```typescript
private async handleMeuNovoTipo(node: RuntimeFlowNode, flow: RuntimeFlow): Promise<string> {
  try {
    await addMeuNovoTipoJob({
      flowId: flow.id,
      sessionId: String(this.context.conversationId),
      nodeId: node.id,
      context: this.context,
      payload: { ... },
    });
  } catch (error) {
    // Fallback para execução direta se necessário
  }

  return this.findNextNodeId(flow, node);
}
```

## Métricas e Monitoramento

### Obter métricas da fila

```typescript
import { getQueueMetrics } from "@/lib/queue/flow-builder-queues";
import { getDLQMetrics } from "@/lib/queue/flow-builder-dlq";
import { getCampaignQueueMetrics } from "@/lib/queue/flow-campaign-queue";

const metrics = await getQueueMetrics();
// { waiting: 5, active: 2, completed: 100, failed: 3, delayed: 0 }

const dlqMetrics = await getDLQMetrics();
// { total: 2, recentFailures: 1, ... }

const campaignMetrics = await getCampaignQueueMetrics();
// { waiting: 50, active: 5, ... }
```

### Limpar jobs antigos

```typescript
import { cleanOldJobs } from "@/lib/queue/flow-builder-queues";
import { cleanOldDLQJobs } from "@/lib/queue/flow-builder-dlq";

await cleanOldJobs(24 * 60 * 60 * 1000); // Jobs > 24h
await cleanOldDLQJobs(7 * 24 * 60 * 60 * 1000); // DLQ > 7 dias
```

## Fallback

Se a fila falhar (Redis down, erro de conexão), o FlowExecutor faz fallback para execução direta:

```typescript
try {
  await addChatwitActionJob({ ... });
} catch (error) {
  // Fallback: executa diretamente via delivery service
  await this.delivery.deliver(this.context, { ... });
}
```

## Backpressure

Campanhas são pausadas automaticamente se a fila principal tiver > 1000 jobs:

```typescript
const BACKPRESSURE_THRESHOLD = 1000;

const metrics = await getFlowBuilderQueueMetrics();
if (metrics.waiting > BACKPRESSURE_THRESHOLD) {
  await pauseCampaign(campaignId, "backpressure");
}
```

## Graceful Shutdown

```typescript
process.on('SIGTERM', async () => {
  await flowBuilderQueuesWorker.pause();
  await waitForActiveJobs(30000);
  await flowBuilderQueuesWorker.close();
  await closeQueue();
  await closeDLQueue();
  await closeCampaignQueue();
  process.exit(0);
});
```

## Roadmap

- [x] **CHATWIT_ACTION**: resolve, assign, add/remove label
- [x] **HTTP_REQUEST**: chamadas HTTP externas
- [x] **TAG_ACTION**: add/remove tags
- [x] **WEBHOOK_NOTIFY**: notificações webhook
- [x] **DELAY**: delays longos (>5min) via scheduled jobs
- [x] **MEDIA_UPLOAD**: upload de mídia
- [x] **DLQ**: Dead Letter Queue
- [x] **Campanhas**: schema + fila + orchestrator
- [ ] **AI_COMPLETION**: chamadas LLM assíncronas
- [ ] **Circuit Breaker**: integração completa com FlowControlService
- [ ] **Dashboard**: UI de monitoramento de campanhas

## Referências

- [BullMQ Documentation](https://docs.bullmq.io/)
- [CLAUDE.md](../CLAUDE.md) — Seção Key Insights
- [chatwit-delivery-service.ts](../services/flow-engine/chatwit-delivery-service.ts)
- [flow-executor.ts](../services/flow-engine/flow-executor.ts)
