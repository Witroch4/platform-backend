# SocialWise Flow v2 - Documentação Técnica

## Visão Geral

O SocialWise Flow é o motor de IA conversacional do Chatwit. Processa mensagens de clientes via Instagram, WhatsApp e Facebook, classificando intenções e gerando respostas contextuais.

## Arquitetura de Classificação por Bandas

O sistema classifica cada mensagem em uma de três bandas baseado no score de similaridade semântica:

| Banda | Score | Estratégia | Latência |
|-------|-------|------------|----------|
| **HARD** | ≥ 0.80 | Mapeamento direto para template | < 120ms |
| **SOFT** | 0.65-0.79 | Botões de aquecimento + candidatos | ~ 500ms |
| **ROUTER** | < 0.65 | LLM decide entre intent/chat | ~ 2-8s |

### Fluxo de Decisão

```
Mensagem → Embedding → Classificação → Banda
                                         ↓
                          HARD → Template direto
                          SOFT → Botões + LLM warmup
                          ROUTER → LLM Router (mode: intent | chat)
```

## Sistema de Contexto Interativo

Quando uma mensagem interativa é enviada (HARD band), o sistema armazena o contexto no Redis para enriquecer interações futuras.

### Armazenamento (após HARD band success)

```typescript
// Chave Redis
session:{sessionId}:interactiveContext

// Estrutura
{
  bodyText: string,      // Corpo da mensagem interativa
  intentSlug: string,    // Intenção que disparou (ex: "Mandado de Segurança OAB")
  timestamp: number,     // Quando foi enviada
  buttons: [{title, payload}]  // Botões disponíveis
}

// TTL: 1h produção | 5min dev
```

### Recuperação (em toda iteração)

Em **toda mensagem** do cliente (botão ou texto), o contexto é:
1. Recuperado do Redis
2. Injetado em `context.agentSupplement`
3. Passado para o LLM via `supplementalContext`

## Sistema Anti-Loop

### Problema
Quando cliente clica em "Saber Mais" após receber menu, o LLM pode escolher `mode: intent` e reenviar o mesmo template, criando loop infinito.

### Solução (Determinística)

1. **Filtragem de Hints**: A intenção ativa é **removida fisicamente** da lista `INTENT_HINTS` antes de enviar ao LLM
2. **Prompt Anti-Loop**: Instruções explícitas para usar `mode: chat` quando dentro de um fluxo

```typescript
// router.ts - Filtragem
if (activeIntentSlug) {
  hintsToUse = hintsToUse.filter(hint =>
    hint.slug.toLowerCase() !== activeIntentSlug.toLowerCase()
  );
}
```

### Resultado
- LLM **não tem opção** de escolher a intenção já enviada
- Forçado a usar `mode: chat` e explicar detalhadamente

## Arquivos Principais

| Arquivo | Responsabilidade |
|---------|------------------|
| `processor.ts` | Entry point, recupera contexto, orquestra fluxo |
| `graph/supervisor.ts` | LangGraph orchestrator |
| `graph/nodes/router.ts` | Roteamento por banda, filtragem anti-loop |
| `processor-components/band-handlers.ts` | Lógica de cada banda, armazena contexto |
| `session-manager.ts` | Redis: sessões e contexto interativo |
| `classification.ts` | Embedding e similaridade semântica |
| `channel-formatting.ts` | Formatação de resposta por canal |

## ProcessorContext (Estado)

```typescript
interface ProcessorContext {
  userText: string;           // Mensagem do usuário
  channelType: string;        // Channel::Instagram, Channel::WhatsApp, etc
  sessionId: string;          // ID da sessão (contato)
  inboxId: string;            // ID da caixa de entrada
  traceId: string;            // ID para rastreamento
  agentSupplement?: string;   // Contexto injetado para LLM
  originalPayload: any;       // Payload completo do webhook
}
```

## Router LLM

Quando a banda é ROUTER, o LLM decide entre:

```typescript
interface RouterDecision {
  mode: 'intent' | 'chat';
  intent_payload?: string;    // @slug se mode=intent
  response_text: string;      // Resposta gerada
  buttons: [{title, payload}];
}
```

### Regras de Decisão

- **mode: intent** → Sistema dispara template da intenção especificada
- **mode: chat** → Sistema usa `response_text` diretamente como resposta

## Exemplo de Fluxo Completo

```
1. Cliente: "Quero saber sobre Mandado de Segurança"
   → Embedding → Score 0.95 → HARD band
   → Template enviado com botões [Saber Mais, Falar com Dra, Finalizar]
   → Contexto salvo: {bodyText: "...", intentSlug: "Mandado de Segurança OAB"}

2. Cliente clica: "Saber Mais"
   → Contexto recuperado do Redis
   → activeIntentSlug = "Mandado de Segurança OAB"
   → Hints filtrados (intenção removida)
   → Score 0.58 → ROUTER band
   → LLM forçado a usar mode: chat
   → Resposta explicativa enviada
```

## Logs Importantes

```bash
# Contexto injetado
[SocialWise-Processor] Session interactive context injected

# Intenção filtrada
[Graph-Node:Router] 🛡️ ANTI-LOOP: Filtered active intent from hints

# Decisão do router
[SocialWise-Processor-BandHandlers] Router LLM result details {mode, intent_payload, response_text}
```

## Configuração do Agente

```typescript
interface AssistantConfig {
  model: string;              // gpt-5-nano, gpt-4.1-nano, etc
  reasoningEffort: string;    // minimal, low, medium, high
  verbosity: string;          // low, medium, high
  hardDeadlineMs: number;     // Timeout para LLM
  warmupDeadlineMs: number;   // Timeout para warmup
  instructions: string;       // Prompt do sistema
}
```

## Redis Keys

| Pattern | Uso |
|---------|-----|
| `session:{id}` | Dados da sessão OpenAI |
| `session:{id}:interactiveContext` | Contexto da última mensagem interativa |
| `sessionHistory:{id}` | Histórico de mensagens (modo manual) |

## Métricas Coletadas

```typescript
interface PerformanceMetrics {
  band: 'HARD' | 'SOFT' | 'ROUTER';
  strategy: string;
  routeTotalMs: number;
  embeddingMs?: number;
  llmWarmupMs?: number;
  score?: number;
}
```
