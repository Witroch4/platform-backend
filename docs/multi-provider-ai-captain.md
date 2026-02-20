# Multi-Provider IA Capitão — Documentação Técnica

## Visão Geral

O SocialWise Flow agora suporta **3 provedores de IA** como modelo primário e como fallback degradado:

| Provider | Modelos Disponíveis | Características |
|----------|-------------------|-----------------|
| **OpenAI** | GPT-5 Nano/Mini/Full, GPT-4.1, GPT-4o | Responses API, Structured Outputs nativo, `previous_response_id` |
| **Gemini** | Flash Lite/Flash/Pro, Gemini 3 | ThinkingConfig, Content API |
| **Claude** | Haiku/Sonnet/Opus 4.5 | Extended thinking, Messages API |

O admin configura provider + modelo no painel do Capitão (`/admin/capitao/[id]`).

---

## Arquitetura

```
┌─────────────────────────────────────────────────────────────┐
│  Webhook (route.ts)                                          │
│  Classificação por bandas → HARD / SOFT / ROUTER             │
└──────────────────────────┬──────────────────────────────────┘
                           ↓
              ┌────────────────────────┐
              │  band-handlers.ts      │
              │  dispatchWarmupButtons()│
              │  dispatchRouterLLM()   │
              └─────┬──────┬──────┬───┘
                    ↓      ↓      ↓
              ┌─────────┐ ┌─────┐ ┌──────┐
              │ OpenAI  │ │Gem. │ │Claude│
              │ai-func. │ │band │ │band  │
              │.ts      │ │proc.│ │proc. │
              └────┬────┘ └──┬──┘ └──┬───┘
                   ↓         ↓       ↓
              ┌────────────────────────────┐
              │  shared-llm-pipeline.ts    │
              │  (prompts, schemas, valid.)│
              └────────────────────────────┘
```

### Dispatcher Multi-Provider

`band-handlers.ts` contém dispatchers que roteiam para o provider correto:

```typescript
// Lógica simplificada
async function dispatchWarmupButtons(userText, candidates, agentConfig, opts) {
  switch (agentConfig.provider) {
    case "GEMINI": return generateWarmupButtonsGemini(...);
    case "CLAUDE": return generateWarmupButtonsClaude(...);
    default:       return openaiService.generateWarmupButtons(...);
  }
}
```

O campo `agentConfig.provider` vem do banco (`AiAssistant.provider`).

---

## Shared LLM Pipeline (Adapter Pattern)

**Arquivo:** `lib/socialwise-flow/services/shared-llm-pipeline.ts`

Todos os providers compartilham a mesma inteligência:

### O que é compartilhado (provider-agnostic)

| Componente | Arquivo Origem | Função |
|-----------|---------------|--------|
| Master Prompt | `prompt-manager.ts` | `createMasterPrompt()` — regras de identidade, antialucinação, botões |
| Task Prompts | `prompt-manager.ts` | `TASK_PROMPTS.WARMUP_BUTTONS()`, `TASK_PROMPTS.ROUTER_LLM()` |
| Ephemeral Instructions | `prompt-manager.ts` | `buildEphemeralInstructions()` — guardrails, channel limits, hints |
| Hints Ricos | `ai-functions.ts` | `sanitizeHintsWithDesc()` — aliases, scores, desc escapada |
| Schema Zod (Buttons) | `channel-constraints.ts` | `createButtonsSchema(channel)` — validação estruturada |
| Schema Zod (Router) | `channel-constraints.ts` | `createRouterSchema(channel)` — mode/intent/buttons |
| Channel Constraints | `channel-constraints.ts` | `getConstraintsForChannel()` — WhatsApp: 3 botões/1024 body |
| Normalização Handoff | `text-normalizers.ts` | `normalizeHandoffButtons()` — dedup, título canônico, último |
| Aviso Final | `text-normalizers.ts` | `ensureFinalNotice()` — "Se nenhum botão atender..." |
| JSON Cleanup | `structured-outputs.ts` | `stripCodeFences()`, `extractJsonLoose()`, `coerceLengths()` |

### O que é específico de cada provider

| Provider | Específico |
|----------|-----------|
| **OpenAI** | `structuredOrJson()` (Responses API + `zodTextFormat`), `previous_response_id`, `ensureSession()` |
| **Gemini** | `gemini.models.generateContent()`, `thinkingConfig.thinkingLevel` |
| **Claude** | `claude.messages.create()`, extended thinking (`budget_tokens`) |

### Fluxo de um request (Gemini/Claude)

```
1. buildWarmupRequest() ou buildRouterRequest()
   → Carrega histórico Redis
   → sanitizeHintsWithDesc() → hints ricos
   → createMasterPrompt() + TASK_PROMPTS → systemPrompt
   → buildEphemeralInstructions() → ephemeralInstructions
   → createButtonsSchema() ou createRouterSchema() → schema Zod
   → Retorna LLMRequest

2. Provider-specific API call
   → Gemini: generateContent({ contents: systemPrompt + instructions + user })
   → Claude: messages.create({ system: prompt, messages: history })

3. validateAndNormalize(rawText, schema, channel)
   → stripCodeFences() → extractJsonLoose() → JSON.parse()
   → coerceLengths(obj, channel) → trunca body/titles
   → schema.safeParse() → validação Zod
   → normalizeHandoffButtons() → dedup + canonical
   → ensureFinalNotice() → aviso final
   → Retorna objeto tipado ou null
```

---

## Degradação de Modelo (@retry)

### O que é

Quando o modelo primário **não responde dentro do timeout** (300ms SOFT / 400ms ROUTER), o sistema:
1. Envia resposta com botão "Tentar Novamente" (`payload: @retry`)
2. Quando o usuário clica, o fallback provider processa a mensagem original

### Fluxo completo

```
Usuário envia "Olá"
    ↓
[routerLLM] → OpenAI GPT-5 → TIMEOUT (3000ms)
    ↓
[timeout-helpers] → buildTimeoutFallbackResponse()
    → storeRetryContext() no Redis (TTL 5min)
    → Responde: "Desculpe pela demora" + botão "Tentar Novamente"
    ↓
Usuário clica "Tentar Novamente"
    ↓
[route.ts] → Intercepta @retry (3 pontos de detecção)
    → handleRetryWithDegradation()
    → getRetryContext() do Redis
    → processDegradedRequestMultiProvider()
    ↓
[multi-provider-processor.ts] → switch(fallbackConfig.provider)
    → GEMINI: processWithGemini()
    → CLAUDE: processWithClaude()
    → OPENAI: processWithOpenAIDegraded() (Chat API, não Responses API)
    ↓
Resposta normalizada → buildChannelResponse() → WhatsApp/IG/FB
```

### Interceptação do @retry (3 pontos)

O WhatsApp envia `button_id` em locais diferentes conforme o tipo de mensagem:

```typescript
// route.ts — 3 pontos de detecção (todos necessários)

// 1. content_attributes.quick_reply_payload (quick reply buttons)
const quickReplyPayload = content_attributes?.quick_reply_payload;

// 2. content_attributes.postback_payload (postback buttons)
const postbackPayload = content_attributes?.postback_payload;

// 3. payload.button_id (ROOT level — WhatsApp interactive buttons)
const rootButtonId = (payload as any)?.button_id;
```

**Bug corrigido:** Antes, apenas `quick_reply_payload` e `postback_payload` eram verificados. Botões interativos do WhatsApp enviam `button_id` no root do payload, então `@retry` não era interceptado.

### RetryContext (Redis)

```typescript
interface RetryContext {
  sessionId: string;
  originalUserText: string;      // Mensagem original que deu timeout
  channelType: string;           // "Channel::Whatsapp" etc
  intentHints?: string;          // Hints de intenção serializados
  agentInstructions?: string;    // Instruções do agente
  fallbackProvider?: string;     // Provider configurado para fallback
  fallbackModel?: string;        // Modelo configurado para fallback
}
// Redis key: retry:{sessionId}  TTL: 5min
```

### Configuração do Fallback

| Campo DB | Tipo | Default | Descrição |
|----------|------|---------|-----------|
| `AiAssistant.fallbackProvider` | `AiProvider?` | `null` (→ GEMINI) | Provider para degradação |
| `AiAssistant.fallbackModel` | `String?` | `null` (→ provider default) | Modelo específico |

Se `fallbackProvider` é `null`, o sistema usa **Gemini Flash** como fallback (backward compatible).

---

## Schema do Banco

```prisma
enum AiProvider {
  OPENAI
  GEMINI
  CLAUDE
}

model AiAssistant {
  // ... campos existentes ...
  provider         AiProvider  @default(OPENAI)     // Provider primário
  fallbackProvider AiProvider?                       // Provider fallback (null = Gemini)
  fallbackModel    String?                           // Modelo fallback
}
```

---

## Estratégia de Histórico

| Provider | Estratégia | Detalhes |
|----------|-----------|---------|
| **OpenAI** | `previous_response_id` + Redis | Usa `ensureSession()` para obter pointer; também carrega Redis como backup |
| **Gemini** | Redis apenas | `getSessionHistory()` — últimas 5 mensagens |
| **Claude** | Redis apenas | `getSessionHistory()` — últimas 5 mensagens |

A env var `OPENAI_HISTORY_STRATEGY` (ou legado `CONVERSATION_HISTORY_STRATEGY`) controla se OpenAI usa `openai_native` ou `redis_only`. Gemini e Claude sempre usam Redis.

---

## Arquivos-Chave

### Core Pipeline
| Arquivo | Responsabilidade |
|---------|-----------------|
| `lib/socialwise-flow/services/shared-llm-pipeline.ts` | Request builders + validação/normalização compartilhada |
| `lib/socialwise-flow/services/gemini-band-processor.ts` | API call Gemini (warmup + router) |
| `lib/socialwise-flow/services/claude-band-processor.ts` | API call Claude (warmup + router) |
| `lib/socialwise-flow/services/claude-client.ts` | Singleton Anthropic SDK |
| `lib/socialwise-flow/services/multi-provider-processor.ts` | Roteador degradação multi-provider |

### Infraestrutura Compartilhada (OpenAI-origin, provider-agnostic)
| Arquivo | Exports Usados |
|---------|---------------|
| `services/openai-components/server-socialwise-componentes/prompt-manager.ts` | `createMasterPrompt`, `TASK_PROMPTS`, `buildEphemeralInstructions` |
| `services/openai-components/server-socialwise-componentes/channel-constraints.ts` | `getConstraintsForChannel`, `createButtonsSchema`, `createRouterSchema` |
| `services/openai-components/server-socialwise-componentes/text-normalizers.ts` | `normalizeHandoffButtons`, `ensureFinalNotice` |
| `services/openai-components/server-socialwise-componentes/structured-outputs.ts` | `stripCodeFences`, `extractJsonLoose`, `coerceLengths` |
| `services/openai-components/server-socialwise-componentes/ai-functions.ts` | `sanitizeHintsWithDesc` |

### Dispatchers
| Arquivo | Responsabilidade |
|---------|-----------------|
| `lib/socialwise-flow/processor-components/band-handlers.ts` | `dispatchWarmupButtons()`, `dispatchRouterLLM()` |
| `lib/socialwise-flow/processor-components/timeout-helpers.ts` | `buildTimeoutFallbackResponse()` — inclui fallbackProvider/Model |
| `lib/socialwise-flow/processor-components/retry-handler.ts` | `handleRetryWithDegradation()` |

### Webhook
| Arquivo | Responsabilidade |
|---------|-----------------|
| `app/api/integrations/webhooks/socialwiseflow/route.ts` | Interceptação @retry (3 pontos), dispatch pipeline |

### Config
| Arquivo | Responsabilidade |
|---------|-----------------|
| `lib/socialwise-flow/processor-components/assistant-config.ts` | `AssistantConfig` interface + loader do DB |
| `prisma/schema.prisma` | `AiProvider` enum + campos `provider`/`fallbackProvider`/`fallbackModel` |

### API + Frontend
| Arquivo | Responsabilidade |
|---------|-----------------|
| `app/api/admin/ai-integration/assistants/route.ts` | GET/PATCH/POST com provider fields |
| `app/admin/capitao/[id]/page.tsx` | UI seleção provider + modelo + fallback |

---

## Expansão Futura

### Adicionar novo provider (ex: Mistral, Llama)

1. **Schema:** Adicionar ao enum `AiProvider` em `prisma/schema.prisma`
2. **Client:** Criar `lib/socialwise-flow/services/mistral-client.ts` (singleton)
3. **Band Processor:** Criar `lib/socialwise-flow/services/mistral-band-processor.ts`:
   - Importar `buildWarmupRequest`, `buildRouterRequest`, `validateAndNormalize` do shared pipeline
   - Implementar apenas a chamada API do provider
4. **Dispatcher:** Adicionar `case "MISTRAL"` em `dispatchWarmupButtons()` e `dispatchRouterLLM()` no `band-handlers.ts`
5. **Degraded:** Adicionar `processWithMistral()` no `multi-provider-processor.ts`
6. **Frontend:** Adicionar modelos em `PROVIDER_MODELS` no `capitao/[id]/page.tsx`
7. **Migration:** `pnpm exec prisma migrate dev --name add_mistral_provider`

### Melhorias possíveis

- **Structured Outputs para Gemini/Claude:** Gemini suporta `responseMimeType: "application/json"` com schema. Claude suporta `tool_use` como structured output. Implementar adaptadores para usar schema nativo quando disponível, caindo para JSON+Zod quando não.
- **Retry inteligente:** Se o fallback provider tambem falhar, tentar o terceiro provider antes do static fallback.
- **Métricas por provider:** Instrumentar latência, success rate, e custo por provider para dashboards Grafana.
- **A/B testing:** Configurar split de tráfego entre providers para comparar qualidade.
- **Fallback chain:** Em vez de um fallback, configurar cadeia: OpenAI → Claude → Gemini → static.

### Issues conhecidas

- **Gemini Content API:** Não suporta `system` prompt separado — o system prompt é concatenado no `contents` string. Pode reduzir qualidade vs OpenAI/Claude que separam system/user.
- **Claude extended thinking:** O `getThinkingBudget()` está implementado mas NÃO ativado na chamada atual (requer `anthropic-beta` header). Ativar quando estabilizar.
- **History truncation:** Gemini/Claude recebem últimas 5 mensagens do Redis. OpenAI pode usar todas via `previous_response_id`. Considerar aumentar para 10 em Gemini/Claude se qualidade conversacional for insuficiente.

---

## Bandas Ativas no Sistema

> **IMPORTANTE:** Atualmente apenas **2 bandas estão ativas** no pipeline de produção:

| Banda | Ativa? | Score | O que faz |
|-------|--------|-------|-----------|
| **HARD** | SIM | ≥0.80 | Alias direto (match exato no `MapeamentoIntencao`). Sem LLM. <120ms |
| **SOFT** | NAO | 0.65-0.79 | Warmup buttons via LLM. **Inativa** — reservada para uso futuro |
| **ROUTER** | SIM | <0.65 | LLM completo decide: intent ou chat. 400ms timeout |

A banda SOFT (warmup buttons) está configurável na UI mas **não é utilizada** no fluxo atual. Os deadlines de Warmup e SOFT são armazenados no banco mas servem apenas para futura ativação.

---

## Compatibilidade de Parâmetros por Provider/Modelo

> Referência baseada na documentação oficial da API Gemini (Context7, fev/2026) e OpenAI/Claude docs.

### Gemini: thinkingLevel vs thinkingBudget

| Parâmetro | Gemini 3.x | Gemini 2.5 | Gemini 2.5 Flash Lite |
|-----------|-----------|-----------|----------------------|
| `thinkingConfig.thinkingLevel` | SIM (minimal/low/medium/high) | NAO | NAO |
| `thinkingConfig.thinkingBudget` | NAO | SIM (integer tokens) | SIM (integer tokens, 0=disabled) |
| `temperature` | SIM (0-2) | SIM (0-2) | SIM (0-2) |
| `topP` | SIM | SIM | SIM |
| `maxOutputTokens` | SIM (65536) | SIM (65536) | SIM (65536) |
| `responseMimeType: "application/json"` | SIM | SIM | SIM |
| Structured Outputs (schema JSON) | SIM | SIM | SIM |

**Bug corrigido (2026-02-20):** O sistema estava enviando `thinkingLevel: "minimal"` para `gemini-2.5-flash-lite`, que **não suporta** esse parâmetro (apenas Gemini 3). Agora usa `thinkingBudget: 0` para Gemini 2.5 e `thinkingLevel` para Gemini 3.

### Mapeamento reasoningEffort → thinkingBudget (Gemini 2.5)

| reasoningEffort (DB) | thinkingBudget (API) | Uso |
|----------------------|---------------------|-----|
| `minimal` | `0` | Desativado — menor latência |
| `low` | `512` | Raciocínio leve |
| `medium` | `1024` | Raciocínio balanceado |
| `high` | `4096` | Raciocínio profundo |

### Mapeamento reasoningEffort → thinkingLevel (Gemini 3)

| reasoningEffort (DB) | thinkingLevel (API) | Suporte |
|---------------------|--------------------|---------|
| `minimal` | `"minimal"` | Flash only (Pro não suporta) |
| `low` | `"low"` | Flash + Pro |
| `medium` | `"medium"` | Flash only |
| `high` | `"high"` | Flash + Pro (default) |

### Matriz completa de features por provider

| Feature | OpenAI GPT-5 | OpenAI GPT-4 | Gemini 2.5 | Gemini 3 | Claude |
|---------|-------------|-------------|-----------|---------|--------|
| **Raciocínio** | `reasoning_effort` | N/A | `thinkingBudget` | `thinkingLevel` | `budget_tokens` |
| **Verbosidade** | SIM | N/A | N/A | N/A | N/A |
| **Temperature** | N/A (usa reasoning) | 0-2 | 0-2 | 0-2 | 0-1 |
| **Top P** | N/A | 0-1 | 0-1 | 0-1 | 0-1 |
| **Tool Choice** | SIM | SIM | N/A | N/A | N/A |
| **Structured Output** | Nativo (zodTextFormat) | Nativo | `responseMimeType: json` | `responseMimeType: json` | JSON via prompt |
| **Histórico** | `previous_response_id` + Redis | `previous_response_id` + Redis | Redis only | Redis only | Redis only |
| **tempSchema** | SIM | SIM | SIM | SIM | SIM |
| **tempCopy** | SIM | SIM | SIM | SIM | SIM |

### Arquivos modificados (correção thinkingLevel → thinkingBudget)

| Arquivo | Mudança |
|---------|---------|
| `lib/socialwise-flow/services/gemini-degradation.ts` | `thinkingLevel` → `buildThinkingConfig()` que detecta modelo e usa `thinkingBudget` para 2.5, `thinkingLevel` para 3 |
| `lib/socialwise-flow/services/gemini-band-processor.ts` | `mapThinkingLevel()` → `buildThinkingConfig()` com mesma lógica |
| `app/admin/capitao/[id]/page.tsx` | UI mostra opções corretas por provider/modelo. Gemini 2.5 mostra "Thinking Budget", Gemini 3 mostra "Thinking Level" |
