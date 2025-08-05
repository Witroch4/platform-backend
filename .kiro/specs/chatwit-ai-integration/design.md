# Design Document

## Overview

Esta integração implementa um sistema de IA nativo para o Chatwit que processa mensagens recebidas via webhook, classifica intenções usando embeddings vetoriais ou gera respostas dinâmicas via LLM, e retorna mensagens estruturadas diretamente para o Chatwit. O sistema garante visibilidade total para agentes, processamento assíncrono resiliente e conformidade com os padrões oficiais do WhatsApp Cloud API e Instagram Messaging.

### Não-Objetivos
- **Não enviaremos nada direto para a Meta**: Chatwit é o único gateway para provedores
- **Não substituiremos agentes**: Sistema complementa atendimento humano
- **Não processaremos mídia**: Apenas texto e mensagens interativas estruturadas

### Canais Suportados
- **WhatsApp**: Reply Buttons via Cloud API
- **Instagram**: Quick Replies e Button Templates via Graph API  
- **Messenger**: Compatibilidade de templates (equivalência com Instagram)

### Metas de Performance
- **Latência**: P95 ≤ 2.5s, P99 ≤ 5s end-to-end (webhook → resposta no Chatwit)
- **Disponibilidade**: ≥ 99.9% mensal para workers de IA
- **Throughput**: Suportar 1000+ mensagens/minuto por instância

### Arquitetura de Alto Nível

```
Cliente → Chatwit (WhatsApp/IG) → Webhook → SocialWise (Next.js API)
                                              ↓
                                    (Fila BullMQ + Redis)
                                              ↓
                                    [Classificação de Intents]
                                    [Geração Dinâmica LLM]
                                              ↓
                                    SocialWise → Chatwit API
                                              ↓
                                    Chatwit → Cliente (visível ao agente)
```

## Architecture

### Core Components

#### 1. Webhook Ingestion Layer
- **Endpoint**: `POST /api/chatwit/webhook`
- **Headers Esperados**: 
  - `X-Chatwit-Signature`: HMAC SHA-256 do payload
  - `X-Chatwit-Timestamp`: Unix timestamp da requisição
- **Autenticação HMAC**: 
  ```typescript
  // String canônica: timestamp + '.' + rawBody
  const base = `${timestamp}.${rawBody}`;
  const expected = crypto.createHmac('sha256', SECRET).update(base).digest('hex');
  
  // Comparação em tempo constante
  if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(headerSig))) {
    return 401; // Unauthorized
  }
  
  // Janela anti-replay: rejeitar se |now - timestamp| > 5 min
  if (Math.abs(Date.now() / 1000 - timestamp) > 300) {
    return 401; // Timestamp fora da janela
  }
  ```
- **Idempotência**: Chave `idem:cw:${account_id}:${conversation_id}:${message_id}` (TTL 300s)
- **Rate Limiting Multi-nível** (configurável via env):
  - Conversa: `RL_CONV=8/10s`
  - Account: `RL_ACC=80/10s`  
  - Contato: `RL_CONTACT=15/10s`
  - Log hits com métrica `ai_ratelimit_hits_total{scope}`
  - Status 202 `{throttled:true}` NÃO re-enfileira
- **Códigos de Resposta**:
  - `200 {ok:true}`: Aceito e enfileirado
  - `200 {dedup:true}`: Mensagem duplicada (idempotência)
  - `202 {throttled:true}`: Rate limit aplicado
  - `401`: HMAC inválido ou timestamp fora da janela
- **Tecnologias**: Next.js API Routes, Zod validation, Redis guards

#### 2. Queue Processing Layer
- **Filas**: `ai:incoming-message`, `ai:embedding-upsert`
- **Workers**: `aiMessageWorker`, `embeddingUpsertWorker`
- **Prioridade**: Cliques de botão/quick_reply com prioridade alta
- **Retry Policy**: Backoff exponencial 1s/2s/4s, máximo 3 tentativas
- **Dead Letter Queue**: Fila separada por tipo com endpoints de reprocesso admin
- **Reprocesso DLQ**: Interface admin com anotação de motivo e usuário responsável
- **Tecnologias**: BullMQ, Redis, distributed tracing

#### 3. AI Processing Layer
- **Intent Classification**: Embeddings + PGVector similarity search
- **Modelos/Limites**:
  - Embeddings: `text-embedding-3-small` (1536 dimensions)
  - LLM: `gpt-4o-mini`, timeout 10s, max tokens configurável
  - Threshold por intent (DB) com cutoff default 0.8
- **Circuit Breaker**: 5 falhas → recovery 30s → janela 60s
- **Prompt Guardrails**: PT-BR curto, sem markdown, botões concisos, sem dados sensíveis
- **Dynamic Generation**: OpenAI Structured Output para mensagens interativas
- **Tecnologias**: OpenAI API, PGVector, Prisma

#### 4. Message Delivery Layer
- **Chatwit Integration**: API de mensagens com content_attributes
- **Schema Version**: `additional_attributes.schema_version="1.0.0"` obrigatório
- **Retry Policy por Status**:
  - 5xx → retry 3x com backoff exponencial
  - 429 → honrar Retry-After, default 5s (máx 3x)
  - 4xx não-transiente → DLQ imediata + alerta
- **Channel Adaptation**: WhatsApp Reply Buttons, Instagram Quick Replies/Button Templates
- **Validação**: HTTPS obrigatório em web_url (Instagram)
- **Tecnologias**: Axios HTTP client, channel-specific sanitization

### Database Schema Extensions

```prisma
model Intent {
  id                  String   @id @default(cuid())
  name                String   @unique
  description         String?
  actionType          String
  templateId          String?
  embedding           Unsupported("vector")
  similarityThreshold Float    @default(0.8)
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt
}

model LlmAudit {
  id             String   @id @default(cuid())
  conversationId String
  messageId      String
  mode           String   // 'INTENT_CLASSIFY' | 'DYNAMIC_GENERATE'
  inputText      String   // PII mascarado (telefone/email)
  resultJson     Json
  score          Float?
  traceId        String?
  createdAt      DateTime @default(now())
  expiresAt      DateTime @default(dbgenerated("NOW() + INTERVAL '90 days'"))
  
  @@index([conversationId, createdAt])
  @@index([expiresAt]) // Para expurgo automático
}

model IntentHitLog {
  id             String   @id @default(cuid())
  conversationId String
  messageId      String
  candidateName  String
  similarity     Float
  chosen         Boolean  @default(false)
  traceId        String?
  createdAt      DateTime @default(now())
  expiresAt      DateTime @default(dbgenerated("NOW() + INTERVAL '90 days'"))
  
  @@index([conversationId, createdAt])
  @@index([candidateName])
  @@index([expiresAt]) // Para expurgo automático
}
```

**Migrations Necessárias**:
```sql
-- Habilitar extensão PGVector
CREATE EXTENSION IF NOT EXISTS vector;

-- Criar índice ivfflat para busca vetorial
CREATE INDEX intent_embedding_ivfflat 
ON "Intent" USING ivfflat ("embedding" vector_cosine_ops) WITH (lists = 100);

-- Otimizar planner após criação do índice
ANALYZE "Intent";

-- Backfill para registros existentes
UPDATE "LlmAudit" SET "expiresAt" = NOW() + INTERVAL '90 days' WHERE "expiresAt" IS NULL;
UPDATE "IntentHitLog" SET "expiresAt" = NOW() + INTERVAL '90 days' WHERE "expiresAt" IS NULL;

-- Expurgo automático (pg_cron ou job no app)
-- Via pg_cron: SELECT cron.schedule('ai-audit-cleanup', '0 2 * * *', 'DELETE FROM "LlmAudit" WHERE "expiresAt" < NOW(); DELETE FROM "IntentHitLog" WHERE "expiresAt" < NOW();');
-- Via app: job diário no BullMQ
```

**Nota**: Ajustar `lists` conforme cardinalidade (100 para ~10k intents, 1000 para ~100k+)

## Components and Interfaces

### 1. Webhook Handler (`/api/chatwit/webhook/route.ts`)

```typescript
interface ChatwitWebhookPayload {
  account_id: number;
  channel: 'whatsapp' | 'instagram' | 'messenger';
  conversation: { 
    id: number; 
    inbox_id: number; 
    status: 'open'|'resolved'|'pending' 
  };
  message: {
    id: number;
    message_type: 'incoming'|'outgoing';
    content_type: string | null;
    content: string | null; // Obrigatório content OR content_attributes
    content_attributes?: Record<string, any>; // Obrigatório content OR content_attributes
    created_at: number;
    source_id?: string | null; // ID no provedor (WhatsApp wamid, Instagram mid)
    sender?: { 
      type: 'contact'|'agent'; 
      id: number; 
      name?: string|null 
    };
  };
}

interface WebhookResponse {
  ok: boolean;
  skipped?: boolean;
  dedup?: boolean;
  throttled?: boolean;
}
```

### 2. AI Message Worker

```typescript
interface AiMessageJobData {
  accountId: number;
  conversationId: number;
  messageId: string;
  text: string;
  contentAttributes: Record<string, any>;
  channel: 'whatsapp' | 'instagram' | 'messenger';
  traceId: string;
  agentHandoffRequested?: boolean; // Forçar handoff humano via regra/flag
  featureFlags?: {
    intentsEnabled: boolean;
    dynamicLlmEnabled: boolean;
    interactiveMessagesEnabled: boolean;
    economicModeEnabled: boolean;
  };
}

// Feature Flags (fonte da verdade: env/DB/LaunchDarkly)
interface FeatureFlagConfig {
  source: 'env' | 'database' | 'launchdarkly';
  priority: 'inbox' | 'account' | 'global'; // inbox > account > global
  flags: {
    [key: string]: {
      enabled: boolean;
      rolloutPercentage?: number;
      accountIds?: number[];
      inboxIds?: number[];
    };
  };
}
}

interface IntentClassificationResult {
  intent: string;
  score: number;
  candidates: Array<{ name: string; similarity: number }>;
}

interface DynamicGenerationResult {
  text: string;
  buttons?: Array<{
    type: 'reply';
    title: string;
    id: string;
  }>;
  header?: {
    type: 'text' | 'image' | 'video' | 'document';
    text?: string;
    link?: string;
  };
  footer?: string;
}
```

### 3. Channel-Specific Schemas

#### WhatsApp Interactive Schema
```typescript
const WhatsAppInteractiveSchema = {
  type: 'object',
  required: ['body', 'buttons'],
  properties: {
    header: {
      type: 'object',
      properties: {
        type: { enum: ['text', 'image', 'video', 'document'] },
        text: { type: 'string', maxLength: 60 },
        link: { type: 'string' }
      }
    },
    body: { type: 'string', maxLength: 1024 },
    footer: { type: 'string', maxLength: 60 },
    buttons: {
      type: 'array',
      minItems: 1,
      maxItems: 3,
      items: {
        type: 'object',
        required: ['title', 'id'],
        properties: {
          title: { type: 'string', maxLength: 20 },
          id: { type: 'string', maxLength: 256 }
        }
      }
    }
  }
};

// Transformação para content_attributes do Chatwit
const transformToWhatsAppContentAttributes = (data) => ({
  interactive: {
    type: 'button',
    header: data.header,
    body: { text: data.body },
    footer: data.footer ? { text: data.footer } : undefined,
    action: {
      buttons: data.buttons.map(btn => ({
        type: 'reply',
        reply: { id: btn.id, title: btn.title }
      }))
    }
  }
});
```

#### Instagram Quick Reply Schema
```typescript
const InstagramQuickReplySchema = {
  type: 'object',
  required: ['text', 'quick_replies'],
  properties: {
    text: { type: 'string', maxLength: 1000 },
    quick_replies: {
      type: 'array',
      minItems: 1,
      maxItems: 13, // Máximo do Instagram, mas capar em 3 por UX no SocialWise
      items: {
        type: 'object',
        required: ['title', 'payload'],
        properties: {
          title: { type: 'string', maxLength: 20 },
          payload: { type: 'string', maxLength: 1000 }
        }
      }
    }
  }
};

#### Instagram Button Template Schema
```typescript
const InstagramButtonTemplateSchema = {
  type: 'object',
  required: ['text', 'buttons'],
  properties: {
    text: { type: 'string', maxLength: 640 },
    buttons: {
      type: 'array',
      minItems: 1,
      maxItems: 3,
      items: {
        type: 'object',
        required: ['type', 'title'],
        properties: {
          type: { enum: ['postback', 'web_url'] },
          title: { type: 'string', maxLength: 20 },
          payload: { type: 'string', maxLength: 1000 }, // Para postback
          url: { 
            type: 'string', 
            maxLength: 2000,
            pattern: '^https://' // HTTPS obrigatório
          }
        }
      }
    }
  }
};
```

### 4. Chatwit API Client

```typescript
interface ChatwitMessagePayload {
  content: string;
  message_type: 'outgoing';
  private?: boolean;
  content_attributes?: {
    interactive?: WhatsAppInteractiveContent;
    ig?: InstagramContent;
  };
  additional_attributes: {
    provider: 'meta';
    channel: 'whatsapp' | 'instagram' | 'messenger';
    schema_version: '1.0.0'; // OBRIGATÓRIO
    trace_id?: string;
  };
}

// Sanitização por canal (hard limits)
interface ChannelLimits {
  whatsapp: {
    body: 1024;
    header: 60;
    footer: 60;
    buttons: { min: 1, max: 3 };
    buttonTitle: 20;
    buttonId: 256;
  };
  instagram: {
    quickReply: {
      text: 1000;
      maxItems: 13; // Capar em 3 por UX
      title: 20;
      payload: 1000;
    };
    buttonTemplate: {
      text: 640;
      buttons: { min: 1, max: 3 };
      title: 20;
      requireHttps: true;
    };
  };
}

class ChatwitApiClient {
  async postBotMessage(params: {
    accountId: number;
    conversationId: number;
    content: string;
    contentAttributes?: Record<string, any>;
    channel: 'whatsapp' | 'instagram';
    traceId: string;
  }): Promise<void>;
}
```

## Data Models

### Intent Classification Flow

1. **Embedding Generation**: Texto → OpenAI Embeddings API → Vector (1536 dims)
2. **Similarity Search**: PGVector cosine similarity com threshold configurável
3. **Candidate Ranking**: Top 3 candidatos ordenados por similarity score
4. **Threshold Filtering**: Aceitar apenas se score >= similarityThreshold
5. **Audit Logging**: Registrar todos os candidatos e decisão final

### Dynamic Generation Flow

1. **Context Building**: Texto + histórico recente da conversa (opcional)
2. **LLM Structured Output**: OpenAI GPT-4o-mini com JSON Schema
3. **Channel Adaptation**: Aplicar schema específico (WhatsApp/Instagram)
4. **Sanitization**: Validar limites, truncar, garantir títulos únicos
5. **Fallback Handling**: Se LLM falha, resposta padrão com botão "Falar com atendente"

### Message Delivery Flow

1. **Payload Assembly**: Montar content_attributes + additional_attributes
2. **Channel Routing**: Aplicar formato específico do canal
3. **API Call**: POST para Chatwit com retry + timeout
4. **Response Handling**: Log success/failure, métricas de latência
5. **Error Recovery**: DLQ para falhas não-transientes

## Error Handling

### Error Classification Matrix

| Error Type | HTTP Status | Action | Retry Policy | Chatwit Specific |
|------------|-------------|--------|--------------|------------------|
| Schema Invalid | 400 | DLQ + Alert | No retry | Payload malformado |
| Auth Token Invalid | 401 | DLQ + Alert | No retry | Token Chatwit expirado |
| Insufficient Scope | 403 | DLQ + Alert | No retry | Permissões insuficientes |
| Resource Conflict | 409 | DLQ + Alert | No retry | Conversa já fechada |
| Rate Limited | 429 | Retry with backoff | Honor Retry-After | Limite Chatwit API |
| Server Error | 5xx | Retry with backoff | 3x exponential | Chatwit indisponível |
| Timeout | - | Retry with backoff | 3x exponential | Rede/latência |
| LLM API Error | Various | Fallback response | Circuit breaker | OpenAI indisponível |
| OpenAI Rate Limited | 429 | Retry with backoff | Honor Retry-After or 3x | OpenAI quota exceeded |

### Runbook de Reprocessamento DLQ

1. **Pausar Fila**: `POST /admin/queues/{queueName}/pause`
2. **Analisar Erros**: Dashboard de DLQ com filtros por erro/período
3. **Corrigir Causa Raiz**: Fix de código, configuração ou dados
4. **Reprocessar**: `POST /admin/queues/{queueName}/dlq/reprocess` com motivo e usuário
5. **Resumir Fila**: `POST /admin/queues/{queueName}/resume`
6. **Monitorar**: Acompanhar métricas pós-reprocessamento

### Circuit Breaker Pattern

```typescript
interface CircuitBreakerConfig {
  failureThreshold: number; // 5 failures
  recoveryTimeout: number;  // 30 seconds
  monitoringWindow: number; // 60 seconds
}

class LlmCircuitBreaker {
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
  private failureCount = 0;
  private lastFailureTime = 0;
  
  async execute<T>(operation: () => Promise<T>): Promise<T>;
  private shouldAttemptReset(): boolean;
  private onSuccess(): void;
  private onFailure(): void;
}
```

### Fallback Strategies

1. **Intent Classification Fallback**: Se similarity < threshold → Dynamic Generation
2. **LLM Generation Fallback**: Se LLM falha → Texto simples + botão "Falar com atendente"
3. **Channel Fallback**: Se formato interativo inválido → Texto simples
4. **Complete Fallback**: Handoff humano com payload estruturado:
   ```json
   {
     "content": "Acionei um atendente humano",
     "message_type": "outgoing",
     "additional_attributes": {
       "handoff_reason": "ai_failure",
       "assign_to_team": "support",
       "conversation_tags": ["ai_handoff"],
       "conversation_status": "open"
     }
   }
   ```

### Economic Mode (Controle de Custos)

Ativado quando `TOKENS_DIA_CONTA` ou `R$_DIA` excedido:
- Usar modelo `gpt-4o-mini` sempre
- Respostas ≤ 200 chars
- Sem mídia em headers
- Pular geração quando cache/FAQ disponível
- Métrica: `ai_llm_cost_tokens_total{model, account_id}`

## Testing Strategy

### Unit Tests

1. **Webhook Validation**: Schema validation, HMAC verification, rate limiting
2. **Intent Classification**: Embedding generation, similarity calculation, threshold filtering
3. **Dynamic Generation**: LLM structured output, sanitization, channel adaptation
4. **Message Assembly**: Content attributes formatting, payload validation

### Integration Tests

1. **End-to-End Flow**: Webhook → Queue → AI Processing → Chatwit API
2. **Database Operations**: Intent CRUD, audit logging, metrics collection
3. **Redis Operations**: Idempotency, rate limiting, caching
4. **External APIs**: OpenAI API, Chatwit API with mocking

### Contract Tests

1. **Chatwit Webhook Contract**: Fixtures reais de entrada com snapshots
2. **Chatwit API Contract**: Fixtures de saída por canal com snapshots
3. **OpenAI API Contract**: Validate structured output compliance
4. **Channel Compliance**: Fuzz testing de limites (1010/1024 chars, 21 chars título, 4 botões, URL sem HTTPS)
5. **Cost Testing**: Modo econômico ativado por budget/flag
6. **Tracing Testing**: Assert traceId em todas as etapas
7. **Sanitization Rules**: 
   - Títulos únicos (case-insensitive)
   - web_url HTTPS obrigatório (Instagram)
   - Truncamento preservando palavra (não cortar no meio)
   - IG Quick Reply: capar em 3 por UX homogênea (decisão de produto)

### Performance Tests

1. **Load Testing**: 1000 concurrent webhooks, queue throughput
2. **Latency Testing**: P95 < 2.5s, P99 < 5s end-to-end
3. **Memory Testing**: Worker memory usage under load
4. **Database Testing**: PGVector query performance

### E2E Tests

1. **WhatsApp Flow**: Incoming message → Interactive reply → Button click
2. **Instagram Flow**: Incoming message → Quick reply → Payload handling
3. **Fallback Flow**: LLM failure → Human handoff
4. **Multi-tenant Flow**: Different accounts, inboxes, configurations

## Observability and Monitoring

### Structured Logging

```typescript
interface LogContext {
  traceId: string;
  accountId: number;
  conversationId: number;
  messageId: string;
  jobId?: string;
  stage: 'webhook' | 'queue' | 'classify' | 'generate' | 'deliver';
  channel: 'whatsapp' | 'instagram';
  duration?: number;
  error?: string;
}
```

### Metrics (Prometheus/OpenTelemetry)

```typescript
// Histograms (snake_case com labels padrão)
ai_job_latency_ms{stage, channel, account_id}
ai_llm_response_time_ms{model, operation}
ai_intent_confidence_score{intent_name}

// Counters
ai_jobs_total{stage, status, channel, account_id}
ai_jobs_dlq_total{reason, channel, account_id}
ai_llm_tokens_total{model, operation, account_id}
ai_ratelimit_hits_total{scope, account_id, channel}
ai_fallback_total{reason, channel, account_id}

// Gauges
ai_jobs_in_queue{queue_name}
ai_active_workers{worker_type}
ai_circuit_breaker_state{service}
```

### Dashboard Inicial

1. **Latência E2E**: P95/P99 por canal e account
2. **Fallback Rate**: Taxa de fallback por motivo
3. **DLQ**: Mensagens em DLQ por tipo de erro
4. **Rate Limit Hits**: Hits por escopo (conversa/account/contato)
5. **Tokens LLM/dia**: Consumo por modelo e account

### Health Endpoints

```typescript
// Liveness probe
GET /api/health
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00Z",
  "checks": {
    "database": "ok", // Ping superficial
    "redis": "ok"     // Ping superficial
  }
}

// Readiness probe  
GET /api/ready
{
  "status": "ready",
  "timestamp": "2024-01-01T00:00:00Z", 
  "checks": {
    "database": "ok",
    "redis": "ok",
    "queues_consuming": "ok", // Workers ativos
    "llm_reachability": "ok"  // Opcional
  }
}
```

### Distributed Tracing

1. **Trace Spans**: webhook → enqueue → process → classify/generate → deliver
2. **Trace Context**: Propagate traceId through all components
3. **Trace Attributes**: accountId, conversationId, messageId, channel
4. **External Calls**: OpenAI API, Chatwit API, database queries

### Alerting Rules

```yaml
# High error rate
ai_fallback_rate > 0.20 for 10m
ai_jobs_dlq_rate > 0.05 for 5m

# High latency
ai_job_latency_p95 > 2500ms for 5m
ai_job_latency_p99 > 5000ms for 5m

# Queue backlog
ai_jobs_in_queue > 100 for 5m
ai_jobs_waiting_time > 30s for 5m

# Resource usage
ai_worker_memory_usage > 80% for 10m
ai_redis_memory_usage > 90% for 5m
```

## Security Considerations

### Authentication & Authorization

1. **Webhook HMAC**: SHA-256 signature validation with timestamp window
2. **API Keys**: Chatwit access tokens via Secret Manager
3. **Rate Limiting**: Multi-level (conversation, account, contact)
4. **IP Allowlisting**: Restrict webhook sources (optional)

### Data Protection

1. **PII Masking**: Telefone/email mascarados ANTES de persistir em LlmAudit
2. **Data Retention**: TTL 90 dias + cron de expurgo diário automático
3. **Access Control**: Auditoria somente para roles "admin/sre" + trilha de acesso
4. **Secret Rotation**: Cron trimestral + procedimento manual documentado
5. **Encryption**: TLS in transit, encrypted at rest for sensitive data

### Input Validation

1. **Schema Validation**: Strict Zod schemas for all inputs
2. **Content Sanitization**: XSS prevention, length limits
3. **SQL Injection**: Parameterized queries, Prisma ORM
4. **Command Injection**: No shell execution from user input

## Performance Optimizations

### Caching Strategy

1. **Intent Embeddings**: Cache frequently used embeddings (Redis, 1h TTL)
2. **LLM Responses**: Cache por hash(normalized text + channel + account_id), TTL 30min
3. **Channel Configs**: Cache account/inbox settings (Redis, 5min TTL)
4. **Database Queries**: Prisma query caching for static data

### Connection Pooling

1. **Database**: Prisma connection pool (10-20 connections)
2. **Redis**: IORedis connection pool with keepalive
3. **HTTP**: Axios connection reuse for Chatwit API
4. **OpenAI**: HTTP/2 connection pooling

### Queue Optimization

1. **Concurrency**: 10 concurrent workers per queue
2. **Batching**: Process similar messages in batches
3. **Priority**: 
   - Alto: Cliques de botão/quick_reply
   - Normal: Mensagens novas
   - Baixo: Upserts de embedding
4. **Backpressure**: Pause processing if downstream services slow

### Database Optimization

1. **Indexes**: Composite indexes on (conversationId, createdAt)
2. **Partitioning**: Time-based partitioning for audit tables
3. **Archiving**: Move old data to cold storage
4. **Vector Search**: PGVector ivfflat index com lists=100 (ajustar conforme volume)
## C
ontract Testing Fixtures

### Test Fixtures Structure
```
tests/
├── contracts/
│   ├── chatwit-webhook/
│   │   ├── whatsapp-incoming.json
│   │   ├── instagram-incoming.json
│   │   └── button-click.json
│   ├── chatwit-api/
│   │   ├── whatsapp-interactive.json
│   │   ├── instagram-quick-reply.json
│   │   └── instagram-button-template.json
│   └── openai/
│       ├── structured-output-valid.json
│       └── structured-output-invalid.json
└── snapshots/
    ├── webhook-responses.snap
    ├── message-payloads.snap
    └── llm-outputs.snap
```

### Sample Fixtures

#### Chatwit Webhook (WhatsApp Incoming)
```json
{
  "account_id": 1,
  "channel": "whatsapp",
  "conversation": {
    "id": 123,
    "inbox_id": 456,
    "status": "open"
  },
  "message": {
    "id": 789,
    "message_type": "incoming",
    "content_type": "text",
    "content": "Olá, preciso de ajuda com meu pedido",
    "created_at": 1704067200,
    "source_id": "wamid.ABC123",
    "sender": {
      "type": "contact",
      "id": 101,
      "name": "João Silva"
    }
  }
}
```

#### Chatwit API Response (WhatsApp Interactive)
```json
{
  "content": "Como posso ajudar?",
  "message_type": "outgoing",
  "content_attributes": {
    "interactive": {
      "type": "button",
      "body": { "text": "Como posso ajudar?" },
      "footer": { "text": "SocialWise" },
      "action": {
        "buttons": [
          { "type": "reply", "reply": { "id": "track_order", "title": "Rastrear" } },
          { "type": "reply", "reply": { "id": "payment_help", "title": "Pagamento" } }
        ]
      }
    }
  },
  "additional_attributes": {
    "provider": "meta",
    "channel": "whatsapp",
    "schema_version": "1.0.0",
    "trace_id": "trace-abc-123"
  }
}
```

#### OpenAI Structured Output (Valid)
```json
{
  "body": "Posso ajudar com seu pedido!",
  "footer": "SocialWise",
  "buttons": [
    { "title": "Rastrear", "id": "intent:track" },
    { "title": "Cancelar", "id": "intent:cancel" }
  ]
}
```

### Snapshot Testing

```typescript
// tests/contracts/webhook-responses.test.ts
describe('Webhook Response Contracts', () => {
  it('should match WhatsApp incoming message snapshot', () => {
    const response = processWebhook(whatsappIncomingFixture);
    expect(response).toMatchSnapshot();
  });
  
  it('should match Instagram button click snapshot', () => {
    const response = processWebhook(instagramButtonClickFixture);
    expect(response).toMatchSnapshot();
  });
});
```

## Deployment Configuration

### Environment Variables
```bash
# Core
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
CHATWIT_BASE_URL=https://chatwit.example.com
CHATWIT_ACCESS_TOKEN=...
CHATWIT_WEBHOOK_SECRET=...

# AI
OPENAI_API_KEY=...
OPENAI_MODEL_EMBEDDING=text-embedding-3-small
OPENAI_MODEL_LLM=gpt-4o-mini
OPENAI_TIMEOUT_MS=10000

# Rate Limiting
RL_CONV=8/10s
RL_ACC=80/10s  
RL_CONTACT=15/10s

# Cost Control
TOKENS_DIA_CONTA=100000
R_DIA_LIMITE=50.00
ECONOMIC_MODE_ENABLED=false

# Feature Flags
FF_INTENTS_ENABLED=true
FF_DYNAMIC_LLM_ENABLED=true
FF_INTERACTIVE_MESSAGES_ENABLED=true

# Observability
TRACE_ENABLED=true
METRICS_ENABLED=true
LOG_LEVEL=info
```

### Docker Compose (Development)
```yaml
version: '3.8'
services:
  app:
    build: .
    environment:
      - NODE_ENV=development
      - DATABASE_URL=postgresql://postgres:password@db:5432/socialwise
      - REDIS_URL=redis://redis:6379
    depends_on:
      - db
      - redis
    ports:
      - "3000:3000"

  db:
    image: pgvector/pgvector:pg16
    environment:
      POSTGRES_DB: socialwise
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: password
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

volumes:
  postgres_data:
```

### Production Checklist

- [ ] HMAC secret configurado e rotacionado
- [ ] Rate limits ajustados para carga esperada
- [ ] PGVector index otimizado (lists parameter)
- [ ] Expurgo automático de auditoria configurado
- [ ] Métricas e alertas configurados
- [ ] Health checks configurados no load balancer
- [ ] Feature flags testadas em staging
- [ ] Contract tests passando
- [ ] Rollback plan documentado
- [ ] Runbook de DLQ documentado