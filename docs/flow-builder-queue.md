# Flow Builder Queues — Documentação Técnica

> Fila BullMQ genérica para ações assíncronas do Flow Engine.

## Visão Geral

A fila `flow-builder-queues` processa ações do Flow Builder que não precisam de resposta imediata ao usuário. Isso permite:

- **Retry robusto**: 3 tentativas com exponential backoff (2s → 4s → 8s)
- **Persistência**: Jobs sobrevivem a crashes (Redis)
- **Observabilidade**: Métricas via BullMQ dashboard
- **Escalabilidade**: Workers podem ser escalados independentemente
- **Não-bloqueante**: Flow continua sem esperar a ação completar

## Arquitetura

```
┌─────────────────────────────────────────────────────────────────────────┐
│  FLOW EXECUTOR (sync path)                                               │
│                                                                          │
│  handleChatwitAction() ──► addChatwitActionJob() ──► Redis Queue         │
│         │                                                                │
│         └─ Fallback (se fila falhar): delivery.deliver() direto          │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  BULLMQ WORKER (async processing)                                        │
│                                                                          │
│  processFlowBuilderTask() ──► switch(jobType)                            │
│         │                                                                │
│         ├─ CHATWIT_ACTION ──► handleChatwitAction() ──► delivery.deliver │
│         ├─ HTTP_REQUEST   ──► handleHttpRequest()   (TODO)               │
│         ├─ TAG_ACTION     ──► handleTagAction()     (TODO)               │
│         └─ WEBHOOK_NOTIFY ──► handleWebhookNotify() (TODO)               │
└─────────────────────────────────────────────────────────────────────────┘
```

## Arquivos

| Arquivo | Descrição |
|---------|-----------|
| `lib/queue/flow-builder-queues.ts` | Definição da fila, tipos e helpers |
| `worker/WebhookWorkerTasks/flow-builder-queues.task.ts` | Task processor (handlers) |
| `worker/webhook.worker.ts` | Registro do worker |
| `services/flow-engine/flow-executor.ts` | Integração no FlowExecutor |

## Tipos de Job Suportados

### 1. CHATWIT_ACTION ✅ (Implementado)

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

### 2. HTTP_REQUEST 📋 (Planejado)

Chamadas HTTP externas do nó HTTP_REQUEST:

```typescript
interface HttpRequestJobData {
  jobType: "HTTP_REQUEST";
  payload: {
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
    url: string;
    headers?: Record<string, string>;
    body?: string;
    timeoutMs?: number;
    responseVariable?: string;
  };
}
```

### 3. TAG_ACTION 📋 (Planejado)

Ações de tag (ADD_TAG, REMOVE_TAG):

```typescript
interface TagActionJobData {
  jobType: "TAG_ACTION";
  payload: {
    action: "add" | "remove";
    tagName: string;
  };
}
```

### 4. WEBHOOK_NOTIFY 📋 (Planejado)

Notificações webhook externas:

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

## Configuração

### Queue

```typescript
const DEFAULT_JOB_OPTIONS = {
  attempts: 3,                    // 3 tentativas
  backoff: {
    type: "exponential",
    delay: 2000,                  // 2s → 4s → 8s
  },
  removeOnComplete: 100,          // Mantém últimos 100 completados
  removeOnFail: 50,               // Mantém últimos 50 falhos
};
```

### Worker

```typescript
flowBuilderQueuesWorker = new Worker(FLOW_BUILDER_QUEUE_NAME, processFlowBuilderTask, {
  connection: getRedisInstance(),
  concurrency: 10,                // Ações são leves e rápidas
  lockDuration: 30000,            // 30s por job
  stalledInterval: 60000,
  maxStalledCount: 2,
});
```

## Como Adicionar Novo Tipo de Job

### 1. Definir o tipo em `lib/queue/flow-builder-queues.ts`

```typescript
// Adicionar ao union type
export type FlowBuilderJobType =
  | "CHATWIT_ACTION"
  | "HTTP_REQUEST"
  | "TAG_ACTION"
  | "WEBHOOK_NOTIFY"
  | "MEU_NOVO_TIPO";  // ← Adicionar aqui

// Definir interface do job
export interface MeuNovoTipoJobData extends FlowBuilderJobBase {
  jobType: "MEU_NOVO_TIPO";
  payload: {
    // campos específicos
  };
}

// Adicionar ao union de jobs
export type FlowBuilderJobData =
  | ChatwitActionJobData
  | HttpRequestJobData
  | TagActionJobData
  | WebhookNotifyJobData
  | MeuNovoTipoJobData;  // ← Adicionar aqui
```

### 2. Criar helper para enfileirar (opcional)

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
switch (jobType) {
  case "CHATWIT_ACTION":
    result = await handleChatwitAction(job);
    break;
  case "MEU_NOVO_TIPO":
    result = await handleMeuNovoTipo(job);
    break;
  // ...
}

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
    attempts: 1,
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

const metrics = await getQueueMetrics();
// { waiting: 5, active: 2, completed: 100, failed: 3, delayed: 0 }
```

### Limpar jobs antigos

```typescript
import { cleanOldJobs } from "@/lib/queue/flow-builder-queues";

await cleanOldJobs(24 * 60 * 60 * 1000); // Jobs > 24h
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

Isso garante que ações críticas não sejam perdidas mesmo em caso de falha da fila.

## Prioridades

| Tipo | Prioridade | Descrição |
|------|------------|-----------|
| Critical jobs | 1 | Ações marcadas como `critical: true` |
| Normal jobs | 5 | Padrão |

Jobs críticos são processados primeiro e têm mais tentativas (5 vs 3).

## Roadmap

- [x] **CHATWIT_ACTION**: resolve, assign, add/remove label
- [ ] **HTTP_REQUEST**: chamadas HTTP externas
- [ ] **TAG_ACTION**: add/remove tags
- [ ] **WEBHOOK_NOTIFY**: notificações webhook
- [ ] **DELAY**: delays longos (>5min) via scheduled jobs
- [ ] **AI_COMPLETION**: chamadas LLM assíncronas

## Referências

- [BullMQ Documentation](https://docs.bullmq.io/)
- [CLAUDE.md](../CLAUDE.md) — Seção Key Insights
- [chatwit-delivery-service.ts](../services/flow-engine/chatwit-delivery-service.ts)
- [flow-executor.ts](../services/flow-engine/flow-executor.ts)
