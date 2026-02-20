# Migracao Multi-Provider → Vercel AI SDK

## Decisao Arquitetural

### Por que Vercel AI SDK (e nao LangGraph)

O pipeline do IA Capitao e **linear e single-shot**: recebe mensagem → classifica → chama LLM → normaliza → responde. Nao ha loops agentivos, RAG iterativo, ou sub-agentes debatendo.

| Criterio | LangGraph | Vercel AI SDK |
|---|---|---|
| Structured Output | `.withStructuredOutput()` via LangChain | `generateObject()` nativo |
| JSON parsing fragil | Resolve | Resolve |
| Fallback/retry | Checkpointer (pesado) | Mantém RetryContext (20 linhas Redis) |
| Controle model-specific | Abstrai demais | `providerOptions` granular |
| Dependencias | ~5 pacotes LangChain (~200KB+) | ~4 pacotes ai-sdk (~60KB) |
| Ecossistema | Python-first, TS second-class | Next.js-native, TS-first |

**LangGraph fara sentido quando** o Capitao precisar de loops de ferramentas (RAG + agendamento + sub-agentes iterativos). Ate la, Vercel AI SDK resolve a dor com 10% do esforco.

---

## O Que Mudou

### Arquivos Migrados

| Arquivo | Antes | Depois |
|---|---|---|
| `lib/socialwise-flow/services/gemini-band-processor.ts` | `gemini.models.generateContent()` + `validateAndNormalize()` | `generateObject()` + `postProcessResponse()` |
| `lib/socialwise-flow/services/claude-band-processor.ts` | `claude.messages.create()` + `validateAndNormalize()` | `generateObject()` + `postProcessResponse()` |
| `lib/socialwise-flow/services/multi-provider-processor.ts` | 3 funcoes separadas (processWithClaude, processWithOpenAI, processWithGemini) + `parseDegradedResponse()` | 1 funcao unificada `processWithProvider()` via `generateObject()` |
| `lib/socialwise-flow/services/gemini-degradation.ts` | Implementacao completa com Gemini SDK direto | Wrapper fino que delega para multi-provider-processor |
| `lib/socialwise-flow/services/shared-llm-pipeline.ts` | `validateAndNormalize()` (80 linhas de parsing fragil) | + `postProcessResponse()` (15 linhas, so normalizacao de negocio) |

### Arquivos Criados

| Arquivo | Responsabilidade |
|---|---|
| `lib/socialwise-flow/services/ai-provider-factory.ts` | Factory centralizada: `createModel()`, `createDegradedModel()`, `buildProviderOptions()` |

### Arquivos NAO Migrados (Intencionalmente)

| Arquivo | Razao |
|---|---|
| `services/openai-components/server-socialwise-componentes/structured-outputs.ts` | OpenAI ja tem Structured Outputs nativo via `zodTextFormat`. `generateObject` valida Zod internamente impedindo `coerceLengths()` antes da validacao. Session management complexo (`previous_response_id`). Ver Fase 5 Futura abaixo. |

### Arquivos Intactos (Sem Mudancas)

| Arquivo | Razao |
|---|---|
| `band-handlers.ts` | Dispatchers finos — chamam mesmas funcoes exportadas |
| `timeout-helpers.ts` | Logica de negocio independente de provider |
| `retry-handler.ts` | Orquestra retry — chama `processDegradedRequestMultiProvider` |
| `retry-context.ts` | 20 linhas de Redis GET/SET |
| `channel-constraints.ts` | Schemas Zod + constraints reutilizados |
| `prompt-manager.ts` | Prompts provider-agnostic |
| `text-normalizers.ts` | Normalizacao de negocio |
| `session-manager.ts` | Gestao de sessao Redis |

---

## Provider Factory

`ai-provider-factory.ts` centraliza toda a logica de criacao de modelos e opcoes provider-specific.

### createModel(provider, model)

| Provider | Resultado | API |
|---|---|---|
| `"OPENAI"` | `openai.responses(model)` | Responses API (com `previous_response_id`) |
| `"GEMINI"` | `google(model)` | Google AI Studio |
| `"CLAUDE"` | `anthropic(model)` | Anthropic Messages API |

### createDegradedModel(provider, model)

Mesmo que `createModel` exceto OpenAI que usa `openai(model)` (Chat Completions, sem session state).

### buildProviderOptions(provider, model, opts)

| Provider | Opcoes | Detalhes |
|---|---|---|
| **Gemini 2.5** | `{ google: { thinkingConfig: { thinkingBudget: N } } }` | 0=disabled, 512=low, 1024=medium, 4096=high |
| **Gemini 3** | `{ google: { thinkingConfig: { thinkingLevel: "minimal" } } }` | "minimal"/"low"/"medium"/"high" |
| **Claude** | `{ anthropic: { thinking: { type: "enabled", budgetTokens: N } } }` | So quando reasoningEffort >= "low" |
| **OpenAI** | `{ openai: { reasoningEffort, textVerbosity, previousResponseId } }` | So GPT-5 para reasoning/verbosity |

---

## Como Adicionar um Novo Provider (Ex: Mistral)

Antes da migracao: 7 arquivos, ~200 linhas. Agora: **3 passos**:

### 1. Adicionar ao enum `AiProvider` em `prisma/schema.prisma`
```prisma
enum AiProvider {
  OPENAI
  GEMINI
  CLAUDE
  MISTRAL  // novo
}
```

### 2. Adicionar ao `ai-provider-factory.ts`
```typescript
import { mistral } from "@ai-sdk/mistral";

// Em createModel():
case "MISTRAL": return mistral(model);

// Em buildProviderOptions():
case "MISTRAL": return { mistral: { /* opcoes especificas */ } };
```

### 3. Migration
```bash
pnpm exec prisma migrate dev --name add_mistral_provider
```

**Pronto.** Os band processors e dispatchers funcionam automaticamente porque usam `createModel(provider, model)`.

---

## Restricao Tecnica: mode: "json"

Os schemas Zod existentes (`createButtonsSchema`, `createRouterSchema` em `channel-constraints.ts`) usam `.regex()` e `.strict()`. Essas features nao sao suportadas na conversao automatica para JSON Schema nativo dos providers (`mode: "auto"`).

Por isso, todos os `generateObject()` usam `mode: "json"`:
- O LLM gera JSON livre (guiado pelo prompt)
- O SDK parseia com `JSON.parse`
- O SDK valida com o schema Zod (que suporta `.regex()`)

Isso e funcionalmente equivalente ao pipeline anterior, mas sem `stripCodeFences` / `extractJsonLoose` manuais.

---

## Fase 5 Futura: Migracao do OpenAI Primary Path

Para migrar `structured-outputs.ts` para Vercel AI SDK no futuro, sera necessario:

1. **Schemas relaxados**: Criar versoes sem `.max()` para `generateObject` (o SDK valida internamente, impedindo `coerceLengths` antes). Manter schemas estritos para pos-validacao.

2. **Verificar `providerMetadata`**: Confirmar que `providerMetadata.openai.responseId` funciona para `updateSessionPointer`.

3. **Testar retry de sampling**: O codigo atual trata `Unsupported parameter: 'temperature'` re-chamando sem sampling. Verificar se o AI SDK trata isso automaticamente.

4. **`isSchemaArrayError` retry**: O codigo atual detecta quando OpenAI retorna array em vez de objeto e re-tenta com "strict mode". `generateObject` pode tratar isso automaticamente.

---

## Dependencias Adicionadas

```json
{
  "@ai-sdk/google": "^3.0.30",
  "@ai-sdk/anthropic": "^3.0.46",
  "@ai-sdk/openai": "^3.0.30"
}
```

O pacote `ai` (v5.0.52) ja estava instalado.
