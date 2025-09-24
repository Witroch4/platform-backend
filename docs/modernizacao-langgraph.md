# Modernização do SocialWise Flow com LangGraph.js

Este documento descreve as alterações aplicadas para preparar o SocialWise Flow para o ecossistema LangChain/LangGraph de 2025, mantendo a herança do Capitão e adicionando suportes nativos para RAG, ferramentas operacionais e observabilidade.

## Visão Geral

- Orquestração refatorada com **LangGraph.js** e estado tipado (`lib/socialwise-flow/graph`).
- Inclusão de um **agente ReAct** pré-construído com ferramentas internas (data atual e documentos AiDocument).
- Gating semântico baseado na descrição das intents (não depende mais do nome).
- Contexto suplementar enviado ao **Router LLM**, preservando políticas e formatação existentes.
- Preparação para **LangSmith** (tracing e metadados por traceId/inbox).
- Compatibilidade total com o Capitão (prompt herdado) e TTL de 30 s dos testers.

## Pacotes Instalados

```bash
pnpm add @langchain/core@^0.3.77 @langchain/langgraph@^0.4.9 @langchain/openai@^0.6.11
```

Esses pacotes acompanham a modularização do LangChain em 2025. O `@langchain/core` passa a ser dependência par para todos os demais pacotes LangChain.

## Nova Arquitetura com LangGraph

- Arquivos principais:
  - `lib/socialwise-flow/graph/state.ts`: esquema tipado (`AgentState`) com reducers explícitos.
  - `lib/socialwise-flow/graph/supervisor.ts`: montagem do grafo `classify → gating → react_agent → router`.
  - Nós especializados em `lib/socialwise-flow/graph/nodes/…` (classify, gating, react-agent, router).
- O processor (`lib/socialwise-flow/processor.ts`) agora injeta o contexto no grafo e consome o resultado final, mantendo métricas e formatação anteriores.

## Gating Semântico pela Descrição

- `gatingNode` gera embeddings da pergunta e das descrições das intents.
- Threshold configurável via `SW_HINT_DESC_MIN` (default 0.55) para eliminar sugestões divergentes.
- A lista filtrada segue com metadados adicionais (`descScore`) para debugging e futuras UIs.

## Ferramentas Disponíveis ao Capitão

- **Data/hora atual**: ferramenta `get_current_datetime` exposta ao agente ReAct.
- **RAG**: ferramenta `retrieve_ai_documents` encapsula `searchDocuments`, reutilizando a base `AiDocument` (pgvector + Prisma).
- O agente é criado em `react-agent.ts` usando `createReactAgent` com prompt herdado do Capitão e políticas adicionais.
- Saída do agente (`agentSupplement`) é repassada ao Router LLM como `supplementalContext`.

## Router LLM com Contexto Suplementar

- `router-llm.ts` passou a aceitar `supplementalContext` e inclui o bloco **# CONTEXTO RECUPERADO** nas instruções do developer prompt.
- `processRouterBand` envia automaticamente o suplemento quando disponível, sem alterar regras de botões, handoff ou schema JSON.

## Observabilidade com LangSmith

- Cada execução do agente ReAct adiciona `configurable.project` e metadados (`traceId`, `inboxId`), permitindo rastreamento hierárquico.
- Variáveis de ambiente recomendadas:

```bash
export LANGSMITH_TRACING=true
export LANGSMITH_ENDPOINT=https://api.smith.langchain.com
export LANGSMITH_API_KEY=<sua-chave>
export LANGSMITH_PROJECT=pr-wilted-evidence-67
export LANGCHAIN_CALLBACKS_BACKGROUND=true   # reduz impacto de latência
```

## Fluxo Atual

1. **Pré-processamento**: reactions, sessionId, Capitão, etc. (inalterado).
2. **Graph**:
   - `classify` → `gating` → (`react_agent` se banda = ROUTER) → `router`.
3. **Router**: continua usando `openaiService.routerLLM`, agora com hints filtradas + contexto suplementar.
4. **Formatação**: mesmas funções (`buildChannelResponse`, templates) e métricas.

## Próximos Passos Sugeridos

- Expor `SW_HINT_DESC_MIN` na UI administrativa para ajustes finos por inbox.
- Demonstrar em staging o fluxo de RAG com requisições reais (verificar traces no LangSmith).
- Integrar futuras ferramentas (ex.: horários operacionais, agenda humana) reaproveitando a estrutura do `react-agent`.
- Construir avaliações offline (LangSmith + Ragas) utilizando os datasets históricos.

---

> **Nota**: nenhuma lógica produtiva foi removida. As novas camadas são acréscimos compatíveis com a arquitetura existente e podem ser revertidas isoladamente caso necessário.
