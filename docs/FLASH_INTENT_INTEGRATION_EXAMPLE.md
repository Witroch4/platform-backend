# Flash Intent - Exemplo de Integração

Este documento mostra como integrar a Flash Intent no webhook existente do MTF Diamante.

## Como Usar

### 1. No Webhook Route (`app/api/admin/mtf-diamante/dialogflow/webhook/route.ts`)

```typescript
import { processWebhookWithFlashIntent } from "@/lib/resposta-rapida/webhook-integration";

// No handler POST do webhook, após extrair os dados:
export async function POST(request: Request) {
  const startTime = performance.now();
  let correlationId = '';
  
  try {
    const req = await request.json();
    correlationId = generateCorrelationId();
    
    // Extrair dados do webhook (código existente)
    const webhookData = extractWebhookData(req);
    
    // NOVA INTEGRAÇÃO: Processar com Flash Intent
    const result = await processWebhookWithFlashIntent({
      type: webhookData.intentName ? "intent" : "button_click",
      intentName: webhookData.intentName,
      buttonId: webhookData.buttonId, // Se for button click
      recipientPhone: webhookData.contactPhone,
      whatsappApiKey: webhookData.whatsappApiKey,
      phoneNumberId: webhookData.phoneNumberId,
      businessId: webhookData.businessId,
      inboxId: webhookData.inboxId,
      userId: webhookData.userId, // Extrair do contexto se disponível
      correlationId,
      wamid: webhookData.wamid,
      messageId: webhookData.messageId,
      accountId: webhookData.accountId,
      accountName: webhookData.accountName,
      contactSource: webhookData.contactSource,
      originalPayload: req,
    });

    console.log(`[Webhook] Processado com ${result.processingMode} mode usando ${result.queueUsed}`, {
      correlationId,
      success: result.success,
    });

    // Retornar resposta rápida para o Dialogflow
    const responseTime = performance.now() - startTime;
    
    return new Response(JSON.stringify({ 
      correlationId,
      processingMode: result.processingMode,
      responseTime: `${responseTime}ms`
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'X-Correlation-ID': correlationId,
        'X-Processing-Mode': result.processingMode,
        'X-Response-Time': responseTime.toString(),
      },
    });

  } catch (error) {
    console.error(`[Webhook] Erro no processamento:`, error);
    
    return new Response(JSON.stringify({ 
      error: 'Internal server error',
      correlationId 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
```

### 2. No Worker de Resposta Rápida (`worker/WebhookWorkerTasks/respostaRapida.worker.task.ts`)

```typescript
import { isFlashIntentActive } from "@/lib/resposta-rapida/flash-intent-checker";

// No início do processamento do job:
export async function processRespostaRapidaTask(job: Job<RespostaRapidaJobData>): Promise<WorkerResponse> {
  const startTime = performance.now();
  const { correlationId, userId } = job.data;

  try {
    // Verificar se Flash Intent está ativa para este job
    const flashIntentActive = await isFlashIntentActive(userId);
    
    console.log(`[Worker] Processando job com Flash Intent: ${flashIntentActive ? 'ATIVA' : 'INATIVA'}`, {
      correlationId,
      userId,
      jobId: job.id,
    });

    if (flashIntentActive) {
      // Usar processamento otimizado
      return await processWithOptimizedPath(job.data);
    } else {
      // Usar processamento padrão
      return await processWithStandardPath(job.data);
    }

  } catch (error) {
    console.error(`[Worker] Erro no processamento:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      processingTime: performance.now() - startTime,
      correlationId,
    };
  }
}

async function processWithOptimizedPath(jobData: RespostaRapidaJobData): Promise<WorkerResponse> {
  // Implementação otimizada para Flash Intent
  // - Cache mais agressivo
  // - Menos validações
  // - Processamento paralelo
  // - Timeouts menores
}

async function processWithStandardPath(jobData: RespostaRapidaJobData): Promise<WorkerResponse> {
  // Implementação padrão
  // - Validações completas
  // - Processamento sequencial
  // - Timeouts maiores
}
```

## Funcionalidades da Flash Intent

### 1. Verificação por Usuário
```typescript
import { isFlashIntentActive } from "@/lib/resposta-rapida/flash-intent-checker";

// Verificar para usuário específico
const isActive = await isFlashIntentActive("user-id-123");

// Verificar globalmente
const isGlobalActive = await isFlashIntentActive();
```

### 2. Verificação por Funcionalidade
```typescript
import { isFlashIntentFeatureActive } from "@/lib/resposta-rapida/flash-intent-checker";

// Verificar funcionalidades específicas
const canUseHighPriorityQueue = await isFlashIntentFeatureActive('HIGH_PRIORITY_QUEUE', userId);
const canUseOptimizedWebhook = await isFlashIntentFeatureActive('WEBHOOK', userId);
```

### 3. Status Detalhado
```typescript
import { FlashIntentChecker } from "@/lib/resposta-rapida/flash-intent-checker";

const checker = FlashIntentChecker.getInstance();
const status = await checker.getFlashIntentStatus(userId);

console.log('Status da Flash Intent:', {
  globalEnabled: status.globalEnabled,
  userEnabled: status.userEnabled,
  features: status.features,
});
```

## Benefícios da Flash Intent

### Quando ATIVA:
- ⚡ **Resposta < 100ms**: Webhook responde imediatamente
- 🚀 **Fila de Alta Prioridade**: Jobs processados primeiro
- 💾 **Cache Otimizado**: Menos consultas ao banco
- 🔄 **Processamento Paralelo**: Múltiplas operações simultâneas
- 📊 **Monitoramento Avançado**: Métricas em tempo real

### Quando INATIVA:
- 🐌 **Processamento Padrão**: Validações completas
- 📝 **Fila de Baixa Prioridade**: Processamento sequencial
- 🔍 **Validações Completas**: Mais seguro, mais lento
- 💽 **Persistência Garantida**: Dados sempre salvos

## Monitoramento

A Flash Intent inclui monitoramento automático:

```typescript
// Métricas automáticas registradas:
- webhook_response_time (< 100ms target)
- worker_processing_time (< 5s target)  
- cache_hit_rate (> 70% target)
- queue_processing_rate (jobs/min)
- flash_intent_usage_percentage
```

## Configuração de Produção

### 1. Rollout Gradual
```bash
# Ativar para 10% dos usuários
npm run feature-flags -- set FLASH_INTENT_GLOBAL --rollout 10

# Aumentar gradualmente
npm run feature-flags -- set FLASH_INTENT_GLOBAL --rollout 50
npm run feature-flags -- set FLASH_INTENT_GLOBAL --rollout 100
```

### 2. Monitoramento de Saúde
```bash
# Verificar saúde das filas
curl http://localhost:3000/api/admin/resposta-rapida/stats

# Verificar métricas de performance
curl http://localhost:3000/api/admin/monitoring/dashboard
```

### 3. Rollback de Emergência
```bash
# Desativar imediatamente se houver problemas
npm run feature-flags -- rollback FLASH_INTENT_GLOBAL --reason "High error rate"
```

## Exemplo de Uso Completo

```typescript
// webhook/route.ts
import { processWebhookWithFlashIntent } from "@/lib/resposta-rapida/webhook-integration";

export async function POST(request: Request) {
  const result = await processWebhookWithFlashIntent({
    type: "intent",
    intentName: "welcome_message",
    recipientPhone: "+5511999999999",
    whatsappApiKey: "token123",
    phoneNumberId: "phone123",
    businessId: "business456",
    inboxId: "inbox-456",
    userId: "user-789",
    correlationId: "corr-abc123",
    wamid: "wamid_123",
    messageId: 1,
    accountId: 1,
    accountName: "Test Account",
    contactSource: "whatsapp",
    originalPayload: requestData,
  });

  // result.processingMode = "flash" | "standard"
  // result.queueUsed = "high_priority" | "low_priority"
  // result.success = true | false
}
```

Este sistema permite ativar/desativar as respostas rápidas de forma granular, por usuário ou globalmente, garantindo que o sistema funcione de forma otimizada quando necessário e de forma segura quando a estabilidade for prioridade.