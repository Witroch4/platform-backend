# Guia de Migração: Multi-Provider AI Capitão para LangGraph.js

## Visão Geral

Atualmente, o **SocialWise Flow** gerencia múltiplos provedores de IA (OpenAI, Gemini, Claude) de forma processual através do `band-handlers.ts`, `shared-llm-pipeline.ts` e `retry-handler.ts`. Essa arquitetura demanda a manutenção manual da integração com cada SDK (`generateContent`, `messages.create`), formatação de histórico customizada via Redis, e um sistema denso de controle de Timeout/Fallback.

O objetivo desta migração é adotar o **LangGraph.js**, um framework focado na construção de orquestração baseada em Grafos de Estado (`StateGraph`), que trará:
1. **Unificação dos Provedores:** Utilizando o LangChain Core sob o capô, todos os provedores responderão a uma única interface.
2. **Resiliência e Fallbacks Nativos:** Transição automática de falhas e timeouts usando Ramificações Condicionais e o método `.withFallbacks()`.
3. **Persistência de Estado (Checkpointers):** Substituição do controle manual do `SessionManager` + Redis (usado no botão `@retry`) por _Thread IDs_ gerenciados nativamente pelo framework.

---

## 1. Comparativo de Arquitetura

### 🏗️ Como é Hoje (Procedural Linear)
1. `Webhook` recebe a requisição.
2. `Classification` categoriza em Bandas (**HARD** ou **ROUTER**).
3. `band-handlers.ts` repassa para o provedor configurado (`GeminiBandProcessor`, etc).
4. Em caso de Timeout, o sistema salva um `RetryContext` manual no Redis e responde `<Timeout, Tentar Novamente>`.
5. Se o usuário clica em _"Tentar Novamente"_ (`@retry`), o `retry-handler.ts` puxa os dados e força a rodar no **Modelo Degradado**.

### 🕸️ Como será no LangGraph (Baseado em Nódulos e Estado)
1. O fluxo inicia através de `graph.invoke()`.
2. O **Estado Global (StateAnnotation)** carrega o `sessionId`, `messages`, `candidates`, e `channelType`.
3. Nó `classify_node`: Redireciona via **Conditional Edge**. Se `HARD` = Fim. Se `ROUTER` = Vai para nó `llm_router_node`.
4. Nó `llm_router_node`: Executa a LLM primária. Em caso de timeout/erro, o próprio grafo engatilha a ida para o nó `timeout_node` ou `llm_fallback_node`.
5. **A Mágica do Checkpointer:** Para o botão `@retry`, o grafo simplesmente "pausa". Quando o Webhook é chamado novamente, invocamos o Grafo usando o `thread_id` da sessão, e ele continua exatamente da onde parou (acessando automaticamente o fallback configurado).

---

## 2. Estrutura Proposta no LangGraph.js

O State Graph será a espinha dorsal da orquestração.

### 2.1 Definindo o "State" (Estado)
Substituirá interfaces soltas como `ProcessorContext` e `RetryContext`.

```typescript
import { Annotation } from "@langchain/langgraph";
import { BaseMessage } from "@langchain/core/messages";

export const FlowStateAnnotation = Annotation.Root({
  // UUID da conversa para os Checkpointers manterem histórico no Redis
  sessionId: Annotation<string>,
  
  // Histórico de mensagens padronizado do LangChain
  messages: Annotation<BaseMessage[]>({
    reducer: (x, y) => x.concat(y),
    default: () => [],
  }),
  
  // Dados do Webhook / Contexto de Roteamento
  channelType: Annotation<string>,
  inboxId: Annotation<string>,
  intentCandidates: Annotation<any[]>,
  
  // Output final gerado
  decisionMode: Annotation<"intent" | "chat" | "timeout">,
  channelResponse: Annotation<any>, // Resposta pronta para o WhatsApp/IG
});
```

### 2.2 Nós do Grafo (Nodes)

Teremos nós isolados que retornam mutações parciais do estado.

- `hard_band_node`: Executa o equivalente ao `buildWhatsAppByIntentRaw`. Se sucesso, marca `decisionMode: "intent"`.
- `llm_router_node`: Aciona a API Unificada (`ChatOpenAI`, `ChatAnthropic` ou `ChatGoogleGenerativeAI`).
- `degraded_fallback_node`: Um nó acionado através de uma rota específica quando o primário der timeout ou erro. 

### 2.3 Roteamento Condicional e Fallback

A principal melhoria na manutenibilidade: As regras do `band-handlers.ts` viram funções de transição.

```typescript
const workflow = new StateGraph(FlowStateAnnotation)
  .addNode("classify", classifyNode)
  .addNode("hard_mapping", hardMappingNode)
  .addNode("llm_primary", llmPrimaryNode)
  .addNode("timeout_handler", timeoutHandlerNode)
  .addNode("llm_fallback", degradedFallbackNode);

// 1. Onde tudo começa
workflow.addEdge(START, "classify");

// 2. Classificador Roteando
workflow.addConditionalEdges("classify", (state) => {
  const topCandidate = state.intentCandidates[0];
  if (topCandidate && topCandidate.score >= 0.80) return "hard_mapping";
  return "llm_primary";
});

// 3. O nó LLM tenta executar. Se demorar, ele salva um modo "timeout".
workflow.addConditionalEdges("llm_primary", (state) => {
  if (state.decisionMode === "timeout") return "timeout_handler";
  return END;
});

// 4. Se houver timeout, disparamos o fallback manual apenas sob o gatilho @retry do usuário
workflow.addConditionalEdges("timeout_handler", (state) => {
  // LangGraph tem suporte para Human-in-the-Loop.
  // Ele vai suspender aqui. Se o Payload for "@retry", direcionamos pro fallback.
  const lastMessage = state.messages[state.messages.length - 1];
  if (lastMessage.content === "@retry") {
    return "llm_fallback"; 
  }
  return END; 
});
```

---

## 3. Lidando com o Botão "@retry" via Checkpointer Manual

Hoje o Webhook guarda o `RetryContext` em Redis com TTL de 5 minutos, o que é inseguro e burocrático.

O LangGraph.js possui bibliotecas chamadas **Savers** (por padrão SQLite, Postgres ou Redis (recomendado)). 
Para resolver o `@retry` assíncrono perfeitamente:

1. Registramos o `RedisSaver` (já conectado ao Redis atual do SocialWise).
2. Configuramos o Grafo para pausar após gerar a mensagem "Tentar Novamente" (`interrupt_before`).
3. Quando o Webhook bater na rota de `payload === "@retry"`, retomamos o processamento do mesmo grafo passando:
   ```typescript
   await graph.invoke(
     { messages: [new HumanMessage("@retry", { name: "user_action" })] },
     { configurable: { thread_id: context.sessionId } }
   );
   ```

A execução do grafo vai despertar automaticamente no nó `"timeout_handler"` e sua `Conditional Edge` enviará o botó `@retry` para o `"llm_fallback_node"`.

## 4. Roteiro Passo Passo da Migração Segura

1. `Dependências:` Instalar `@langchain/langgraph`, `@langchain/core`, `@langchain/openai`, `@langchain/anthropic`, `@langchain/google-genai`.
2. `Redis Saver:` Implementar ou utilizar um wrapper para o Redis do BullMQ atual funcionar como `checkpointer` do LangGraph.
3. `Adaptação dos Prompts:` Atualizar os prompts gigantes e estritos de `shared-llm-pipeline.ts` para usar a classe `PromptTemplate` ou `SystemMessage` formatada.
4. `Unificação da Saída Estruturada (Zod):` No lugar de tentar dar bypass de `extractJsonLoose()`, invocar a LLM por `.withStructuredOutput(createRouterSchema())`. Isso funciona por baixo dos panos e uniformemente para OpenAI/Gemini/Claude nos modelos novos.
5. `Refatoração do Handler:` Construir e compilar o `app = workflow.compile({ checkpointer })` dentro de um Singleton em `services/flow-engine/`.
6. `Substituir Webhook:` Re-plugar o `api/integrations/webhooks/socialwiseflow/route.ts` para que, ao cruzar o webhok, simplesmente insira a mensagem na Thread via Graph Invoke.

---

> _Gerado pela Inteligência de Planejamento e Baseado no framework de Agentes Autônomos._
