# Próximo Passo: Flow Campaign Worker

## Status Atual

A fila `flow-campaign` é um **orphan** — tem producers e um orchestrator, mas **nenhum Worker consumer** processando jobs.

### O que existe:

| Componente | Arquivo | Status |
|---|---|---|
| **Queue** (lazy singleton) | `lib/queue/flow-campaign-queue.ts` | ✅ Existe |
| **Orchestrator** (enqueue logic) | `lib/queue/campaign-orchestrator.ts` | ✅ Existe |
| **Producer helpers** | `addExecuteContactJob()`, `addProcessBatchJob()`, `addCampaignControlJob()` | ✅ Existem |
| **Worker consumer** | ❌ NÃO EXISTE | ⛔ Falta |
| **Processor task** | ❌ NÃO EXISTE | ⛔ Falta |

### O que precisa ser feito:

#### 1. Criar o processor task

```
worker/WebhookWorkerTasks/flow-campaign.task.ts
```

Este arquivo deve processar os 3 tipos de job:

```typescript
import type { Job } from "bullmq";
import type { CampaignJobData, CampaignJobResult } from "@/lib/queue/flow-campaign-queue";

export async function processCampaignTask(job: Job<CampaignJobData>): Promise<CampaignJobResult> {
  const startTime = Date.now();

  switch (job.data.jobType) {
    case "EXECUTE_CONTACT":
      // Executar flow para um contato específico
      // Usar FlowOrchestrator.executeFlowById() com context do job
      break;

    case "PROCESS_BATCH":
      // Processar batch de contatos
      // Enfileirar EXECUTE_CONTACT para cada contactId do batch
      break;

    case "CAMPAIGN_CONTROL":
      // Controlar campanha (pause, resume, cancel, complete)
      // Usar pauseCampaignJobs() / cancelCampaignJobs() do flow-campaign-queue.ts
      break;
  }

  return {
    success: true,
    jobType: job.data.jobType,
    campaignId: job.data.campaignId,
    processingTimeMs: Date.now() - startTime,
  };
}
```

#### 2. Registrar no Worker Registry

Em `worker/registry.ts`, adicionar:

```typescript
import { processCampaignTask } from "./WebhookWorkerTasks/flow-campaign.task";
import { FLOW_CAMPAIGN_QUEUE_NAME } from "@/lib/queue/flow-campaign-queue";

// Adicionar ao array workerRegistry:
{
  name: "FlowCampaign",
  queue: FLOW_CAMPAIGN_QUEUE_NAME,
  processor: processCampaignTask,
  concurrency: 5,         // Ajustar conforme load testing
  lockDuration: 60000,    // 1 min (campanhas podem demorar)
  stalledInterval: 60000,
  maxStalledCount: 2,
  critical: false,         // Campanhas não devem crashar o container
  icon: "📢",
  description: "Disparos em massa de flows",
},
```

#### 3. Testar

```bash
pnpm exec tsc --noEmit
```

Depois testar manualmente:
1. Criar uma campanha via API/UI
2. Verificar se jobs aparecem na fila Redis (`flow-campaign`)
3. Verificar se o worker processa os jobs
4. Verificar pause/resume/cancel

### Rate Limiting

A fila já tem rate limits definidos em `flow-campaign-queue.ts`:

```typescript
export const CHANNEL_RATE_LIMITS = {
  whatsapp: { perMinute: 30, perHour: 1000 },
  instagram: { perMinute: 20, perHour: 500 },
  facebook: { perMinute: 25, perHour: 800 },
};
```

O processor deve respeitar esses limites ao executar contatos.

### Referências

- Queue: [lib/queue/flow-campaign-queue.ts](../lib/queue/flow-campaign-queue.ts)
- Orchestrator: [lib/queue/campaign-orchestrator.ts](../lib/queue/campaign-orchestrator.ts)
- Registry: [worker/registry.ts](../worker/registry.ts)
- Flow Engine: [services/flow-engine/](../services/flow-engine/)
