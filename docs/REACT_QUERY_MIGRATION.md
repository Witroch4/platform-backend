# React Query Migration (TanStack Query v5)

> **Data:** 19 de Marco de 2026
> **Ultima auditoria:** 20 de Marco de 2026
> **Status:** MIGRACAO COMPLETA — Todas as fases concluidas. SWR totalmente removido do projeto.
> **Escopo:** Migracao de SWR 2.3.6 para TanStack Query v5 no Socialwise
> **Motivacao:** Reduzir coordenacao manual de cache, rollback e invalidacoes entre telas

---

## 1. Resumo Executivo

O projeto chegou em um ponto em que o SWR nao esta sendo usado apenas como data fetching simples. Em varias areas do admin, especialmente em `mtf-diamante`, ele ja virou uma camada caseira de orquestracao de:

- cache compartilhado
- refresh manual cruzado
- optimistic update
- rollback
- polling
- compatibilidade entre telas

Isso funciona, mas aumenta o custo de manutencao.

**Decisao recomendada:** migrar para **TanStack Query v5** de forma **incremental**, sem big bang, mantendo SWR convivendo com React Query durante varias fases.

**Decisao nao recomendada:** trocar SWR por Zustand para resolver server state. Zustand continua sendo opcional apenas para client state/estado visual.

---

## 2. Estado Atual do Projeto (Auditado)

### 2.1 Base instalada

```json
"@tanstack/react-query": "^5.91.2"
```

### 2.2 Numeros reais (auditoria 20/03/2026, atualizado apos Fase 4)

| Metrica | Valor pre-Fase 1 | Valor pos-Fase 1 | Valor pos-Fase 2 | Valor pos-Fase 3 | Valor pos-Fase 4 | Valor pos-Fase 6 |
|---|---|---|---|---|---|---|
| Arquivos importando SWR | **35** | **20** | **13** (7 hooks CRUD + 1 infra/tipos + 5 infra) | **5** (2 infra + useFlowCanvas + SwrProvider + swr-config) | **1** (swr-config.ts — dead code) | **0** |
| Arquivos usando React Query | **7** | **22** | **29** (28 hooks/componentes + 1 provider) | **36** (35 hooks/componentes + 1 provider) | **38** (37 hooks/componentes + 1 provider) | **38** |
| Arquivos com ambos | **0** | **0** | **0** | **0** | **0** | **0** |
| Cobertura React Query | **17%** (7/42) | **52%** (22/42) | **69%** (29/42) | **88%** (36/41) | **97%** (38/39) | **100%** (38/38) |
| `data \|\| []` em vez de `data ?? []` | **13 ocorrencias** | **11 ocorrencias** | **0 ocorrencias** (todas corrigidas na Fase 2) | **0** | **0** | **0** |
| `globalMutate` / `useSWRConfig` | **2 arquivos** | **2 arquivos** | **2 arquivos** (useCaixas, FlowBuilderTabHooks — Fase 3) | **0 arquivos** (todos migrados para queryClient) | **0** | **0** |
| Hooks com `refreshInterval` (polling) | **10 arquivos** | **3 arquivos SWR** | **0 arquivos SWR** (todos migrados para `refetchInterval`) | **0 arquivos SWR** | **0** | **0** |
| `useState` para `isCreating`/`isDeleting` | — | — | — | **0** (todos migrados para `isPending` do useMutation) | **0** | **0** |
| SwrProvider/SWRConfig no render tree | — | — | — | **3** (root + admin + iframe) | **0** (eliminados; MtfDataProvider usa React Query) | **0** |
| Funcoes deprecated no context | — | — | — | **5** (saveMessage, updateMessagesCache, setCaixas, prefetchInbox, loading aliases) | **0** (todos removidos) | **0** |
| `swr` no package.json | — | — | — | — | Sim | **Nao (removido)** |

### 2.3 Distribuicao por dominio (atualizado pos-Fase 4)

| Dominio | SWR | React Query | Total |
|---|---|---|---|
| `app/admin/mtf-diamante/` (hooks) | 0 | 10 | 10 |
| `app/admin/mtf-diamante/` (componentes) | 0 | 4 | 4 |
| `app/admin/mtf-diamante/` (flow-analytics) | 0 | 8 | 8 |
| `app/admin/mtf-diamante/` (flow-builder) | 0 | 3 (useFlowCanvas migrado) | 3 |
| `app/admin/mtf-diamante/` (infra: context, lib) | 0 | 1 (MtfDataProvider) | 1 |
| `app/admin/leads-chatwit/` | 0 | 8 | 8 |
| `app/admin/MTFdashboard/` | 0 | 4 | 4 |
| `app/admin/` (outros: monitoring, flow-playground, campanhas) | 0 | 3 | 3 |
| `lib/` + `components/` (providers, config) | 0 | 1 (react-query-provider) | 1 |

### 2.4 Fundacao ja implementada

- [x] `components/providers/react-query-provider.tsx` — QueryClientProvider global
- [x] `app/layout.tsx` — ReactQueryProvider + SWRProvider coexistindo
- [x] `app/admin/mtf-diamante/lib/query-keys.ts` — Factory de queryKeys (mtf-diamante) — expandida Fase 1
- [x] `app/admin/MTFdashboard/lib/query-keys.ts` — Factory de queryKeys (dashboard) — criada Fase 1
- [x] `app/admin/leads-chatwit/lib/query-keys.ts` — Factory de queryKeys (leads) — criada Fase 1
- [x] `app/admin/monitoring/lib/query-keys.ts` — Factory de queryKeys (monitoring) — criada Fase 1
- [x] `app/admin/mtf-diamante/hooks/useChatwitLabels.ts` — Migrado para `useQuery`
- [x] `app/admin/mtf-diamante/hooks/useChatwitAgents.ts` — Migrado para `useQuery`
- [x] `app/admin/mtf-diamante/lib/api-clients.ts` — Tipagem `ChatwitAgent[]`
- [x] TypeScript validado (`tsc --noEmit` + `tsc --noEmit -p tsconfig.worker.json`)

### 2.5 Ja usando React Query (fora do plano original)

Estes arquivos em `leads-chatwit` ja usam React Query nativamente:

- [x] `app/admin/leads-chatwit/hooks/useLeadOperationStatus.ts` — `useQuery` + `useQueryClient` com SSE
- [x] `app/admin/leads-chatwit/components/batch-processor/useLeadBatchProcessor.ts` — `useQueryClient` para invalidacao
- [x] `app/admin/leads-chatwit/components/analise-dialog.tsx` — `useQueryClient` para invalidacao
- [x] `app/admin/leads-chatwit/components/espelho-dialog.tsx` — `useQueryClient` para invalidacao

### 2.6 Padroes de mutacao SWR encontrados

O audit revelou **4 padroes distintos** de mutacao no codigo SWR atual. Isso e importante porque a migracao deve convergir para **1 padrao unico** com `useMutation`:

| Padrao | Onde | Problema |
|---|---|---|
| **A) useState manual** (mais comum, ~18 arquivos) | `useVariaveis`, `useLotes`, `useApiKeys` | `useState` separado para `isCreating`/`isDeleting`, fetch manual, sem rollback formal |
| **B) useSWRMutation** (3 arquivos) | `useCaixas`, `useFlowCanvas` | Correto mas com coordenacao manual de keys |
| **C) Optimistic completo** (1 arquivo) | `useInteractiveMessages` | Funciona bem, mas boilerplate pesado |
| **D) globalMutate** (2 arquivos) | `useCaixas`, `FlowBuilderTabHooks` | `useSWRConfig()` para refresh cruzado |

**Impacto:** os padroes A e D sao os que mais se beneficiam da migracao. O padrao C ja faz o correto, so vai ficar mais limpo com `useMutation`.

### 2.7 Divida tecnica: `data || []` vs `data ?? []`

O operador `||` trata `0`, `false` e `""` como falsy — retornando `[]` indevidamente. Com React Query o risco e identico.

> **Status:** RESOLVIDO na Fase 2. Todas as 19 instancias corrigidas para `data ?? []` (hooks, api-clients, ssr-helpers, useDataCache).

### 2.8 Mapa de polling (`refreshInterval`)

Hooks com polling precisam de atencao especial na migracao — mapear para `refetchInterval` do React Query.

| Arquivo | Intervalo | Notas |
|---|---|---|
| `useCaixas.ts` | 30s | pausa via `isPaused` |
| `useLotes.ts` | 30s | pausa via `isPaused` |
| `useVariaveis.ts` | 30s | pausa via `isPaused` |
| `useApiKeys.ts` | 30s | pausa via `isPaused` |
| `useInteractiveMessages.ts` | 30s (smart) | `useSmartPolling` — adapta intervalo |
| `FlowAnalyticsDashboard.tsx` | 5s / 10s / 15s | 3 queries com intervalos diferentes |
| `AlertsPanel.tsx` | 15s | — |
| `ExecutiveKPICards.tsx` | 30s | — |
| `FunnelChart.tsx` | 60s | — |
| `useHeatmapData.ts` | 60s | — |
| `monitoring/page.tsx` | 15s / 60s / 5min | 4 queries com intervalos variados |
| `campanhas/page.tsx` | 3s | progresso de campanha |

> **Equivalente React Query:** `refetchInterval: 30_000` + `refetchIntervalInBackground: false` (default). Para pausa: `enabled: !isPaused`.

### 2.9 Arquivos infra SWR (TODOS REMOVIDOS — Fase 6 concluida)

| Arquivo | Status final |
|---|---|
| `lib/swr-config.ts` | REMOVIDO Fase 6 |
| `components/providers/SwrProvider.tsx` | REMOVIDO Fase 6 |
| `mtf-diamante/context/SwrProvider.tsx` | REMOVIDO Fase 6 |
| `mtf-diamante/context/MtfDataProvider.tsx` | Provider ativo (React Query) |
| `mtf-diamante/lib/types.ts` | `SWRHookOptions` removido (Fase 4) |
| `mtf-diamante/lib/performance-utils.ts` | Funcoes SWR removidas (Fase 4) |
| `mtf-diamante/components/flow-builder/hooks/useFlowCanvas.ts` | Migrado para useQuery + useMutation (Fase 4) |

### 2.10 Hooks ja migrados — problemas residuais (TODOS RESOLVIDOS na Fase 1)

| Arquivo | Problema | Status |
|---|---|---|
| `useChatwitLabels.ts` | Usa `data \|\| []` (linha 23) — trocar por `??` | CORRIGIDO |
| `useChatwitAgents.ts` | Usa `data \|\| []` (linha 18) — trocar por `??` | CORRIGIDO |
| `useChatwitLabels.ts` | `staleTime: 60_000` — doc recomenda 10min para referencia | CORRIGIDO (10min) |
| `useLeadOperationStatus.ts` | Query keys inline sem factory | CORRIGIDO (leadsQueryKeys) |

---

## 3. O Problema Real

O problema **nao** e "SWR nao consegue ser global".

O SWR ja e global no projeto hoje porque:

- existe `SWRProvider` no root
- varias telas compartilham cache pela mesma key
- ja existe `globalMutate` por predicado em partes do admin

O problema real e outro:

1. A ergonomia de mutacao ficou cara — padrao A (useState manual) esta em 18+ arquivos.
2. O custo de padronizar optimistic update ficou alto — so 1 arquivo faz corretamente.
3. O refresh entre telas depende demais de convencao manual — `globalMutate` ad-hoc.
4. Parte do server state ja esta vazando para `useState`, o que reduz previsibilidade.

TanStack Query resolve com APIs formais:

- `queryKey` hierarquica + factory → invalidacao previsivel
- `useMutation` com `onMutate`/`onError`/`onSettled` → padrao unico de optimistic
- `invalidateQueries` por prefixo → refresh cruzado automatico
- `select` → transformacao memoizada sem `useMemo` manual
- `useInfiniteQuery` → paginacao sem `useState` duplicado

---

## 4. Objetivos da Migracao

### Objetivos

- Reduzir boilerplate manual de mutacoes e invalidacoes
- Padronizar `queryKey` por dominio
- Melhorar previsibilidade entre listas, detalhes e formularios
- Facilitar optimistic updates com rollback
- Permitir coexistencia segura entre telas antigas e novas
- Preparar o projeto para hidratacao/SSR futura apenas onde fizer sentido

### Nao objetivos

- Nao remover SWR de uma vez
- Nao migrar tudo antes do proximo hotfix/deploy
- Nao introduzir Zustand para server state
- Nao reescrever todo `mtf-diamante` em uma branch enorme
- Nao mudar contratos de API por causa da migracao

---

## 5. Principios da Migracao

1. **Conviver antes de substituir**
   React Query e SWR podem coexistir. Primeiro migramos fatias pequenas.

2. **Comecar pelo read-only**
   Hooks sem mutacao sao o melhor ponto de entrada.

3. **Migrar por dominio, nao por biblioteca**
   Exemplo: terminar "chatwit labels/agentes" antes de partir para "caixas".

4. **Evitar misturar ownership de cache no mesmo fluxo**
   Durante a fase intermediaria, uma feature deve ter uma biblioteca dominante por vez.

5. **Manter API publica dos hooks quando possivel**
   O componente consumidor nao deve precisar mudar demais na fase inicial.

6. **Migrar mutacoes so depois da base estar madura**
   Primeiro `useQuery`. Depois `useMutation`.

7. **Uma queryKey factory por dominio** (regra `qk-factory-pattern`)
   Nunca `queryKey` inline. Sempre importar do factory central.

8. **staleTime por volatilidade** (regra `cache-stale-time`)
   Dados de referencia (labels, agentes, modelos) = 5-10min. Dados volateis (mensagens, lotes) = 30s-1min.

---

## 6. Estrategia por Fases

### Fase 0. Fundacao Segura

**Status:** CONCLUIDA

- [x] Provider global do React Query (`react-query-provider.tsx`)
- [x] QueryClient estavel no browser (staleTime: 30s, retry: 2)
- [x] Primeiro arquivo de `queryKeys` (`mtf-diamante/lib/query-keys.ts`)
- [x] `useChatwitLabels` migrado para `useQuery`
- [x] `useChatwitAgents` migrado para `useQuery`
- [x] TypeScript validado
- [x] Deploy seguro (nao removeu SWR, nao alterou APIs, nao mexeu no Flow Engine)

---

### Fase 1. Read-only de baixo risco

**Status:** CONCLUIDA (20/03/2026)

**Objetivo:** consolidar padrao de `useQuery` e expandir `queryKeys`

#### Checklist de migracao

**MTF Diamante:**
- [x] `useChatwitLabels.ts` — migrado (Fase 0) + corrigido `data || []` → `data ?? []` + staleTime 10min
- [x] `useChatwitAgents.ts` — migrado (Fase 0) + corrigido `data || []` → `data ?? []`
- [x] `useApprovedTemplates.ts` — migrado para `useQuery` com `placeholderData`, staleTime 5min
- [x] `MapeamentoTab.tsx` — 4 useSWR migrados para `useQuery` (mapeamentos, templates, flows, ai-intents)

**MTF Dashboard:**
- [x] `useAgentCatalog.ts` — migrado para `useQuery`, staleTime 10min
- [x] `useProviderModels.ts` — migrado para `useQuery`, staleTime 10min
- [x] `useAgentBlueprints.ts` — read-only migrado para `useQuery`; mutacoes mantidas como `useCallback` (Phase 3)

**Flow Analytics (7 arquivos migrados em batch):**
- [x] `AlertsPanel.tsx` — `useQuery` com `refetchInterval: 15s`
- [x] `ExecutiveKPICards.tsx` — `useQuery` com `refetchInterval: 30s`, `placeholderData`
- [x] `FunnelChart.tsx` — `useQuery` com `refetchInterval: 60s`
- [x] `GlobalFilters.tsx` — `useQuery` com staleTime 5min
- [x] `SessionReplayModal.tsx` — `useQuery` com `enabled` condicional
- [x] `useHeatmapData.ts` — `useQuery` com `refetchInterval: 60s`, `placeholderData`
- [x] `useNodeDetails.ts` — `useQuery` com `enabled` condicional

**Outros read-only:**
- [x] `EspelhoPadraoCell.tsx` — `useQuery` para OAB rubrics, staleTime 10min
- [x] `monitoring/page.tsx` — 4 `useQuery` com `refetchInterval` (15s, 15s, 60s, 5min) + invalidacao por prefixo
- [x] `mtf-oab/page.tsx` — 2 `useQuery` (lista + detalhe) com `placeholderData`

**Quick wins (corrigidos):**
- [x] `useChatwitLabels.ts` — `data ?? []` (era `data || []`)
- [x] `useChatwitAgents.ts` — `data ?? []` (era `data || []`)
- [x] `useChatwitLabels.ts` — staleTime 10min (era 60s)
- [x] `useLeadOperationStatus.ts` — query keys migradas para factory `leadsQueryKeys`

**Query keys criadas nesta fase:**

- `app/admin/mtf-diamante/lib/query-keys.ts` — expandido com: approvedTemplates, mapeamentos, mapeamentoTemplates, mapeamentoFlows, analytics (kpis, alerts, funnel, heatmap, nodeDetails, sessionReplay, flows), interactiveMessages, flows, caixas, lotes, variaveis, apiKeys
- `app/admin/MTFdashboard/lib/query-keys.ts` — NOVO: agentCatalog, providerModels, agentBlueprints, oabRubrics, oabRubricDetail
- `app/admin/leads-chatwit/lib/query-keys.ts` — NOVO: messages, list, operationStatus, detail, oabRubrics
- `app/admin/monitoring/lib/query-keys.ts` — NOVO: dashboard, queues, queueManagement, costOverview

#### Criterio de pronto (Fase 1)

- [x] Todos os hooks read-only acima migrados para `useQuery`
- [x] `queryKeys` centralizadas por dominio (4 factories: mtf, dashboard, leads, monitoring)
- [x] Sem regressao visual
- [x] `pnpm exec tsc --noEmit && pnpm exec tsc --noEmit -p tsconfig.worker.json`
- [x] Nenhuma entidade usando SWR E React Query ao mesmo tempo

---

### Fase 2. Listas, filtros e paginacao

**Status:** CONCLUIDA (20/03/2026)

**Objetivo:** padronizar leitura com parametros, introduzir `useInfiniteQuery` e `placeholderData`

#### Checklist de migracao

- [x] `useMessages.ts` — migrado para `useInfiniteQuery` com cursor, `maxPages: 10`, removido `resetForNewLead` (key change auto-resets)
- [x] `all-messages-tab.tsx` — migrado para `useQuery` + `keepPreviousData`, `leadsQueryKeys.allMessages`
- [x] `leads-list.tsx` — migrado para `useQuery` + `keepPreviousData`, `queryClient.setQueryData` para optimistic cache updates, `queryClient.invalidateQueries` para revalidation
- [x] `FlowSelector.tsx` — migrado para `useQuery` + `keepPreviousData`, `mtfDiamanteQueryKeys.flowSelector`, corrigido `data?.data || []` → `data?.data ?? []`
- [x] `FlowAnalyticsDashboard.tsx` — 3 queries migradas com `refetchInterval` (10s/15s/5s), `refreshAll` usa prefix invalidation `flowAdmin.all(inboxId)`
- [x] `inbox/[id]/campanhas/page.tsx` — migrado `useSWR` → `useQuery` (2x), `useSWRInfinite` → `useInfiniteQuery` (LeadSelectorDialog), progress polling com `refetchInterval: 3_000`
- [x] `flow-playground/page.tsx` — 2 `useQuery` (inboxes: staleTime 10min, flows: staleTime 30s)
- [x] `transcription-progress.tsx` — ja usava React Query via `useLeadOperationStatus` hook, nenhuma migracao necessaria
- [x] `message-history-tab.tsx` — atualizado consumidor de `useMessages`: removido `resetForNewLead`, wrapped `refresh()` para compatibilidade com `onClick`

#### Acoes extras realizadas nesta fase

**Bug fixes `data || []` → `data ?? []` (19 instancias corrigidas):**
- `useCaixas.ts` — 4 instancias (hook return + 3 optimistic update closures)
- `useInboxButtonReactions.ts` — 2 instancias (hook return + fetcher)
- `useApprovedTemplates.ts` — 1 instancia (fetcher)
- `useLotes.ts` — 1 instancia (hook return)
- `useVariaveis.ts` — 1 instancia (hook return)
- `useInteractiveMessages.ts` — 1 instancia (useMemo)
- `useApiKeys.ts` — 1 instancia (hook return)
- `api-clients.ts` — 8 instancias (interactiveMessages, caixas, lotes, variaveis, apiKeys, buttonReactions x2, chatwitAgents, chatwitLabels)
- `ssr-helpers.ts` — 5 instancias (prefetchInboxData)
- `useDataCache.ts` — 3 instancias (useMtfVariaveis, useMtfLotes, useMtfCaixas)

**Query keys adicionadas nesta fase:**
- `mtfDiamanteQueryKeys.flowAdmin` — `all(inboxId)`, `stats(inboxId)`, `flows(inboxId)`, `sessions(inboxId, status)` com prefix invalidation
- `mtfDiamanteQueryKeys.flowSelector(inboxId, isCampaign)` — lista de flows por inbox
- `mtfDiamanteQueryKeys.playground` — `inboxes()`, `flows(inboxId)`
- `mtfDiamanteQueryKeys.campaigns` — `all(inboxId)`, `detail(campaignId)`, `progress(campaignId)`, `flows(inboxId)`, `leads(filters)`
- `leadsQueryKeys.allMessages(filters)` — all-messages-tab pagination

#### Padroes a aplicar nesta fase

**`placeholderData` vs `initialData`** (regra `cache-placeholder-vs-initial`):
- Usar `placeholderData: keepPreviousData` para listas com filtros (evita flash ao trocar filtro)
- Usar `placeholderData` com dados de outra query (ex: mostrar dados da lista enquanto detalhe carrega)
- **Nunca** usar `initialData` a menos que o dado venha do servidor (SSR)

**`useInfiniteQuery`** (regra `inf-page-params`):
```ts
// Padrao para useMessages migrado
export function useMessages(leadId: string) {
  return useInfiniteQuery({
    queryKey: leadsQueryKeys.messages(leadId),
    queryFn: ({ pageParam }) => fetchMessages(leadId, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    // maxPages para nao acumular memoria infinita
    maxPages: 10,
  });
}
```

**`select` para transformacao** (regra `perf-select-transform`):
```ts
// Em vez de filtrar no componente (re-executa a cada render),
// usar select (memoizado, re-executa so quando data muda)
const { data: activeFlows } = useQuery({
  queryKey: mtfDiamanteQueryKeys.flows(),
  queryFn: fetchFlows,
  select: (flows) => flows.filter(f => f.active),
});
```

#### Criterio de pronto (Fase 2)

- [x] `useMessages` usando `useInfiniteQuery`
- [x] `FlowAnalyticsDashboard` usando `refetchInterval` nativo
- [x] Nenhum `useState` duplicando server state
- [x] `queryKeys` com filtros incluidos (regra `qk-include-dependencies`)
- [x] `tsc` verde
- [x] Todas as 19 instancias de `data || []` corrigidas para `data ?? []`

---

### Fase 3. Mutacoes CRUD com optimistic update

**Status:** CONCLUIDA (20/03/2026)

**Objetivo:** migrar as entidades com maior retorno tecnico, convergir todos os padroes de mutacao para `useMutation`

#### Hooks migrados

| # | Hook | Padrao anterior | Padrao novo | Notas |
|---|---|---|---|---|
| 1 | `useLotes.ts` | A (useState manual) | `useQuery` + `useMutation` com optimistic | Template para os demais |
| 2 | `useVariaveis.ts` | A (useState manual) | `useQuery` + `useMutation` com optimistic | Mesmo padrao que lotes |
| 3 | `useApiKeys.ts` | A (useState manual) | `useQuery` + `useMutation` com optimistic | staleTime 5min (config data) |
| 4 | `useCaixas.ts` | B (useSWRMutation) + D (globalMutate) | `useQuery` + `useMutation` com optimistic | Eliminado globalMutate |
| 5 | `useInboxButtonReactions.ts` | A (useState manual) + toast | `useQuery` + `useMutation` + toast | Adicionado query key factory |
| 6 | `useAgentBlueprints.ts` | useQuery + useCallback | `useQuery` + `useMutation` com optimistic | Read ja estava migrado (F1) |
| 7 | `useInteractiveMessages.ts` | C (optimistic SWR completo) | `useQuery` + `useMutation` com optimistic | Smart polling via refetchInterval fn |

#### Padrao canonico de mutacao (regra `mut-optimistic-updates`)

Todas as mutacoes devem seguir este fluxo de 5 passos:

```ts
export function useCreateEntity() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: entityApi.create,

    // 1. Cancel outgoing refetches
    onMutate: async (payload) => {
      await queryClient.cancelQueries({ queryKey: entityKeys.lists() });

      // 2. Snapshot para rollback
      const previous = queryClient.getQueryData<Entity[]>(entityKeys.lists());

      // 3. Optimistic update
      queryClient.setQueryData<Entity[]>(
        entityKeys.lists(),
        (current = []) => [...current, { id: `temp-${crypto.randomUUID()}`, ...payload } as Entity]
      );

      return { previous };
    },

    // 4. Rollback em caso de erro
    onError: (_err, _payload, context) => {
      if (context?.previous) {
        queryClient.setQueryData(entityKeys.lists(), context.previous);
      }
      toast.error("Erro ao criar");
    },

    // 5. Invalidar SEMPRE (garante consistencia com servidor)
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: entityKeys.lists() });
    },

    onSuccess: () => {
      toast.success("Criado com sucesso");
    },
  });
}
```

#### Regras de invalidacao (regra `cache-invalidation`)

- **Targeted invalidation**: invalidar apenas as keys afetadas, nunca `queryClient.invalidateQueries()` sem filtro
- **Hierarquia de keys ajuda**: `invalidateQueries({ queryKey: ["mtf-diamante"] })` invalida tudo do dominio
- Usar `refetchType: 'active'` (default) para so refetchar queries com observers ativos
- Para mutacoes que afetam multiplas entidades (ex: deletar caixa afeta lotes tambem), invalidar explicitamente cada key

#### Acoes extras realizadas nesta fase

**FlowBuilderTabHooks.ts — eliminado globalMutate:**
- Substituido `useSWRConfig()` por `useQueryClient()`
- Substituido `globalMutate(predicate)` por `queryClient.invalidateQueries({ queryKey: ... })` com prefix invalidation
- Migrado `useSWR` (import status check) para `useQuery`
- Zero imports de `swr` restantes no arquivo

**types.ts — removido import SWR:**
- Removido `import type { KeyedMutator } from "swr"`
- Substituido `KeyedMutator<any>` por `() => Promise<any>` em `UseButtonReactionsReturn`

**query-keys.ts — adicionado buttonReactions:**
- `mtfDiamanteQueryKeys.buttonReactions(inboxId)` — nova key para reactions por inbox

**Bug fix — useInteractiveMessages smart polling:**
- Substituido `useSmartPolling` (helper SWR customizado) por `refetchInterval` como funcao nativa do TanStack Query
- Polling adapta automaticamente: 5s quando dados mudaram nos ultimos 10s, 30s caso contrario
- Eliminada dependencia de `performance-utils.ts` helpers SWR

**Bug fix — useAgentBlueprints sem optimistic:**
- Versao anterior fazia `await invalidate()` apos cada mutation (request duplo: mutation + refetch)
- Nova versao usa optimistic updates com rollback e invalidacao no `onSettled` (UI instantanea)

#### Criterio de pronto (Fase 3)

- [x] `useCaixas` migrado para `useMutation` (create, update, delete)
- [x] `useLotes` migrado
- [x] `useVariaveis` migrado
- [x] `useApiKeys` migrado
- [x] `useInboxButtonReactions` migrado
- [x] `useAgentBlueprints` com mutacoes
- [x] `useInteractiveMessages` migrado (ultimo)
- [x] Zero `useState` para `isCreating`/`isDeleting` — usar `isPending` do `useMutation`
- [x] Zero `globalMutate` no codebase
- [x] `tsc` verde

---

### Fase 4. Simplificacao do SwrProvider do MTF + migracao useFlowCanvas

**Status:** CONCLUIDA (20/03/2026)

**Objetivo:** eliminar dependencia do SWR no provider e migrar ultimo hook SWR

#### O que foi feito

**useFlowCanvas migrado para React Query:**
- `useSWR` → `useQuery` (canvas visual + flow detail)
- `useSWRMutation` → `useMutation` (save canvas)
- `mutateCanvas`/`mutateFlow` → `queryClient.invalidateQueries`
- Auto-save complexo preservado com mesma logica de refs e debounce
- Adicionado `flows.legacyCanvas(inboxId)` ao factory de query keys

**SwrProvider → MtfDataProvider:**
- Criado `MtfDataProvider.tsx` — zero imports SWR, usa React Query para tudo
- Antigo `SwrProvider.tsx` convertido para re-export de backward-compatibility
- Removido `SWRConfig` wrapper (`SwrProviderWithSWR`)
- Removido `retryMetricsMw` (middleware SWR de observabilidade)
- Removido `saveMessageWithReactions` (dead code — funcao legacy nunca usada)

**Deprecated functions removidas:**
- `saveMessage` (deprecated no-op)
- `updateMessagesCache` (deprecated wrapper)
- `setCaixas` (no-op — **bug encontrado**: consumers chamavam `setCaixas()` para optimistic update mas a funcao era um no-op, ou seja o update nunca acontecia. Substituido por `refreshCaixas()` que agora realmente invalida o cache)
- `prefetchInbox` (no-op — removido dos consumers)
- `loadingCaixas`, `loadingLotes`, `loadingVariaveis` (aliases legacy → migrados para `isLoadingCaixas`, `isLoadingLotes`, `isLoadingVariaveis`)

**Infra SWR limpa:**
- `performance-utils.ts` — removidas funcoes SWR (`createOptimizedSWRConfig`, `useOptimizedSWRConfig`, `useSmartPolling`, `useOptimizedMutation`, `import type { SWRConfiguration }`)
- `ssr-helpers.ts` — removida `createSWRFallback`
- `types.ts` — removido `SWRHookOptions`, removido `import type React` (nao mais necessario sem `React.Dispatch`)
- `components/providers/SwrProvider.tsx` — convertido para no-op wrapper (ninguem importa mais)
- `app/layout.tsx` — removido `SWRProvider` do render tree root

**Consumers atualizados (14 arquivos):**
- Todos migrados de `SwrProvider` → `MtfDataProvider`
- Layouts (admin, iframe) atualizados
- Legacy property names corrigidos nos consumidores

**Bug fix — `setCaixas` era no-op:**
- `DialogflowCaixasAgentes.tsx` chamava `setCaixas((current) => ...)` para optimistic update apos toggle de agentes, mas `setCaixas` era um no-op deprecated no SwrProvider, significando que o update visual nunca acontecia
- Corrigido para usar `refreshCaixas()` que agora invalida o cache React Query e busca dados frescos do servidor

#### Acoes extras (alem do escopo original da Fase 4)

- Migrado `useFlowCanvas` (listado como Fase 4 no inventario, mas nao detalhado no checklist original)
- Removido `SWRProvider` do root layout (`app/layout.tsx`)
- Convertido `components/providers/SwrProvider.tsx` para no-op (adiantando Fase 6)
- Limpeza completa de `performance-utils.ts` e `ssr-helpers.ts`
- Corrigido bug de `setCaixas` no-op em DialogflowCaixasAgentes

#### Query keys adicionadas nesta fase

- `mtfDiamanteQueryKeys.flows.legacyCanvas(inboxId)` — canvas visual legacy (sem flowId)

#### Criterio de pronto (Fase 4)

- [x] SwrProvider eliminado (substituido por MtfDataProvider sem SWR)
- [x] Nenhum hook usando `useSWR`/`useSWRMutation` no codebase
- [x] Pausa/resume via `enabled` nos hooks React Query individuais
- [x] Resume usa `queryClient.invalidateQueries` em vez de `.mutate()` manual
- [x] Deprecated functions removidas (saveMessage, updateMessagesCache, setCaixas, prefetchInbox)
- [x] Legacy property aliases removidos (loadingCaixas, loadingLotes, loadingVariaveis)
- [x] SWRProvider removido do root layout
- [x] `tsc` verde (ambos configs)

---

### Fase 5. SSR/Hydration opcional

**Status:** PULADA — NAO NECESSARIA NO MOMENTO (20/03/2026)

**Objetivo:** so fazer onde trouxer ganho real

Nenhuma tela do admin apresenta FOEC relevante apos a migracao para React Query com `placeholderData: keepPreviousData`. SSR/Hydration pode ser implementado pontualmente no futuro se necessario.

#### Padrao de referencia (regra `ssr-dehydration`)

```ts
// Em server component (usar quando necessario)
import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query";

export default async function DashboardPage() {
  const queryClient = new QueryClient();
  await queryClient.prefetchQuery(dashboardQueries.stats());
  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <DashboardClient />
    </HydrationBoundary>
  );
}
```

---

### Fase 6. Descomissionamento do SWR

**Status:** CONCLUIDA (20/03/2026)

**Objetivo:** remover completamente o SWR do projeto

#### Pre-requisitos (todos atendidos)

- [x] SwrProvider residual quase vazio ou removido (Fase 4: MtfDataProvider criado, SwrProvider = re-export)
- [x] Zero hooks usando `useSWR` / `useSWRMutation` / `useSWRInfinite` (Fase 4: useFlowCanvas migrado)
- [x] Zero usos de `globalMutate` (Fase 3)
- [x] Zero imports de `swr` no codebase

#### O que foi feito

**Arquivos removidos:**
- `lib/swr-config.ts` — dead code (config global SWR, ninguem importava)
- `components/providers/SwrProvider.tsx` — no-op wrapper (ja era passthrough desde Fase 4)
- `app/admin/mtf-diamante/context/SwrProvider.tsx` — re-export de MtfDataProvider (ninguem importava)

**Dependencia removida:**
- `swr` removido do `package.json` (~4KB a menos no bundle)

**CLAUDE.md atualizado:**
- Stack table: `SWR 2.3.6` → `TanStack Query v5 (React Query)`
- Secao SWR inteira substituida por guia compacto React Query (query keys factory, mutation pattern, checklist)
- Bug descriptions atualizadas (SWR → React Query terminology)

**Limpeza adicional:**
- `MtfDataProvider.tsx` — removido `export { MtfDataProvider as SwrProvider }` (alias backward-compat)
- `MtfDataProvider.tsx` — atualizado JSDoc (removida referencia ao SwrProvider)
- `InteractiveMessageCreator.tsx` — comentario atualizado (SwrProvider → MtfDataProvider)
- `scripts/run-targeted-tests.ts` — renomeado "SwrProvider Context Tests" → "MtfDataProvider Context Tests" (4 ocorrencias)

#### Criterio de pronto (Fase 6)

- [x] Remover `swr` do `package.json`
- [x] Remover `lib/swr-config.ts`
- [x] Remover `components/providers/SwrProvider.tsx`
- [x] Remover `app/admin/mtf-diamante/context/SwrProvider.tsx`
- [x] SWRProvider ja removido do `app/layout.tsx` (Fase 4)
- [x] Atualizar CLAUDE.md (secao SWR substituida por React Query, stack atualizada)
- [x] `pnpm install && tsc` verde (ambos configs)
- [x] Zero imports de `swr` em todo o codebase

---

## 7. Padroes de Implementacao

### 7.1 Query keys — Factory por dominio (regra `qk-factory-pattern`)

**Regra:** nunca criar `queryKey` inline. Sempre importar do factory central.

**Estrutura hierarquica** (regra `qk-hierarchical-organization`):

```ts
// dominio → entidade → lista/detalhe → filtros
export const mtfDiamanteQueryKeys = {
  all: ["mtf-diamante"] as const,

  // Entidades
  caixas: {
    all: () => [...mtfDiamanteQueryKeys.all, "caixas"] as const,
    detail: (id: string) => [...mtfDiamanteQueryKeys.caixas.all(), id] as const,
  },
  lotes: {
    all: () => [...mtfDiamanteQueryKeys.all, "lotes"] as const,
  },
  variaveis: {
    all: () => [...mtfDiamanteQueryKeys.all, "variaveis"] as const,
  },
  approvedTemplates: (inboxId: string | null) =>
    [...mtfDiamanteQueryKeys.all, "approved-templates", inboxId] as const,

  // Chatwit
  chatwitAgents: () => [...mtfDiamanteQueryKeys.all, "chatwit-agents"] as const,
  chatwitLabels: () => [...mtfDiamanteQueryKeys.all, "chatwit-labels"] as const,

  // Analytics
  analytics: {
    all: () => [...mtfDiamanteQueryKeys.all, "analytics"] as const,
    heatmap: (flowId: string) => [...mtfDiamanteQueryKeys.analytics.all(), "heatmap", flowId] as const,
    kpis: (flowId?: string) => [...mtfDiamanteQueryKeys.analytics.all(), "kpis", flowId] as const,
    alerts: (flowId?: string) => [...mtfDiamanteQueryKeys.analytics.all(), "alerts", flowId] as const,
    funnel: (flowId?: string) => [...mtfDiamanteQueryKeys.analytics.all(), "funnel", flowId] as const,
  },

  // Interactive messages
  interactiveMessages: (inboxId?: string) =>
    [...mtfDiamanteQueryKeys.all, "interactive-messages", inboxId] as const,

  // Flows
  flows: {
    all: () => [...mtfDiamanteQueryKeys.all, "flows"] as const,
    detail: (flowId: string) => [...mtfDiamanteQueryKeys.flows.all(), flowId] as const,
    canvas: (flowId: string) => [...mtfDiamanteQueryKeys.flows.all(), "canvas", flowId] as const,
  },
};
```

**Beneficio da hierarquia:** `invalidateQueries({ queryKey: ["mtf-diamante", "analytics"] })` invalida heatmap + kpis + alerts + funnel de uma vez.

### 7.2 staleTime por tipo de dado (regra `cache-stale-time`)

| Tipo de dado | staleTime | Exemplos |
|---|---|---|
| Referencia (raramente muda) | `10 * 60 * 1000` (10min) | labels, agentes, modelos, catalogo |
| Configuracao (muda por acao do usuario) | `5 * 60 * 1000` (5min) | templates aprovados, api keys |
| Conteudo volatil (muda frequentemente) | `30 * 1000` (30s) | lotes, variaveis, caixas |
| Tempo real | `0` | mensagens, sessoes de flow, analytics com polling |
| Estatico (nunca muda na sessao) | `Infinity` | enums, opcoes fixas |

### 7.3 Read-only padrao

```ts
export function useChatwitLabels() {
  const { data, error, isLoading } = useQuery({
    queryKey: mtfDiamanteQueryKeys.chatwitLabels(),
    queryFn: chatwitLabelsApi.getAll,
    staleTime: 10 * 60 * 1000,  // referencia: 10min
    refetchOnWindowFocus: false,
  });

  return {
    chatwitLabels: data ?? [],  // ?? em vez de || (preserva 0, false, "")
    isLoading,
    error,
  };
}
```

### 7.4 Mutacao com optimistic update (regra `mut-optimistic-updates`)

```ts
export function useCreateCaixa() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: caixasApi.create,
    onMutate: async (payload) => {
      // 1. Cancel refetches em andamento
      await queryClient.cancelQueries({ queryKey: mtfDiamanteQueryKeys.caixas.all() });

      // 2. Snapshot para rollback
      const previous = queryClient.getQueryData<ChatwitInbox[]>(
        mtfDiamanteQueryKeys.caixas.all()
      );

      // 3. Optimistic update
      queryClient.setQueryData<ChatwitInbox[]>(
        mtfDiamanteQueryKeys.caixas.all(),
        (current = []) => [...current, { id: `temp-${crypto.randomUUID()}`, ...payload } as ChatwitInbox]
      );

      return { previous };
    },
    onError: (_error, _payload, context) => {
      // 4. Rollback
      if (context?.previous) {
        queryClient.setQueryData(mtfDiamanteQueryKeys.caixas.all(), context.previous);
      }
    },
    onSettled: () => {
      // 5. Revalidar com servidor (SEMPRE, sucesso ou erro)
      queryClient.invalidateQueries({ queryKey: mtfDiamanteQueryKeys.caixas.all() });
    },
  });
}
```

### 7.5 Paginacao / infinito (regra `inf-page-params`)

```ts
export function useMessages(leadId: string) {
  return useInfiniteQuery({
    queryKey: leadsQueryKeys.messages(leadId),
    queryFn: ({ pageParam }) => fetchMessages(leadId, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    maxPages: 10,  // limitar memoria
  });
}

// No componente:
const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useMessages(leadId);
const allMessages = data?.pages.flatMap(p => p.messages) ?? [];
```

### 7.6 Prefetch por intencao (regra `pf-intent-prefetch`)

```ts
// Prefetch ao hover em items de lista
function FlowListItem({ flow }: { flow: Flow }) {
  const queryClient = useQueryClient();

  return (
    <div
      onMouseEnter={() => {
        queryClient.prefetchQuery({
          queryKey: mtfDiamanteQueryKeys.flows.detail(flow.id),
          queryFn: () => fetchFlowDetail(flow.id),
          staleTime: 60_000,
        });
      }}
    >
      {flow.name}
    </div>
  );
}
```

### 7.7 select para transformacao (regra `perf-select-transform`)

```ts
// Filtrar dados no nivel do cache, nao no componente
const { data: activeFlows } = useQuery({
  queryKey: mtfDiamanteQueryKeys.flows.all(),
  queryFn: fetchFlows,
  select: (flows) => flows.filter(f => f.active),
});
```

---

## 8. O que NAO Fazer

1. Nao migrar `context/SwrProvider.tsx` antes de estabilizar os hooks base (Fases 1-3).
2. Nao migrar `useInteractiveMessages.ts` logo no inicio — e o mais complexo.
3. Nao misturar SWR e React Query para a **mesma entidade** na mesma tela.
4. Nao usar Zustand para substituir cache de API.
5. Nao fazer uma branch gigante com dezenas de hooks migrados sem checkpoints.
6. Nao acoplar a migracao a mudancas de API, schema ou Flow Engine.
7. Nao usar `queryKey` inline (`["my-key"]`). Sempre factory.
8. Nao usar `initialData` quando `placeholderData` e suficiente (regra `cache-placeholder-vs-initial`).
9. Nao ignorar `onSettled` — invalidar SEMPRE, mesmo no sucesso (regra `mut-invalidate-queries`).
10. Nao criar `queryClient` como `new QueryClient()` global fora de componente sem `useRef`/`useState` (causa leak em SSR).

---

## 9. Plano de Deploy e Hotfix

### 9.1 Regra geral

A migracao e transparente para o usuario final. Cada PR/deploy deve:

- [ ] Migrar poucas features (1 dominio por vez)
- [ ] Incluir `queryKeys` novas
- [ ] Manter comportamento visual identico
- [ ] Passar em `tsc`
- [ ] Evitar refatorar 2 dominios pesados no mesmo deploy

### 9.2 Rollback

Rollback e simples enquanto estivermos nas Fases 0-2:

- Reverter hook migrado para versao SWR
- `ReactQueryProvider` permanece inofensivo no root
- Custo de rollback aumenta significativamente na Fase 3+

---

## 10. Inventario Completo de Hooks SWR

Referencia rapida de TODOS os 30 arquivos SWR restantes, classificados por dificuldade:

### Facil (read-only puro, sem polling, sem state) — TODOS MIGRADOS (Fase 1)

| # | Arquivo | Fase | Status |
|---|---|---|---|
| 1 | `MTFdashboard/hooks/useAgentCatalog.ts` | 1 | MIGRADO |
| 2 | `MTFdashboard/hooks/useProviderModels.ts` | 1 | MIGRADO |
| 3 | `mtf-diamante/hooks/useApprovedTemplates.ts` | 1 | MIGRADO |
| 4 | `mtf-diamante/components/flow-analytics/AlertsPanel.tsx` | 1 | MIGRADO |
| 5 | `mtf-diamante/components/flow-analytics/ExecutiveKPICards.tsx` | 1 | MIGRADO |
| 6 | `mtf-diamante/components/flow-analytics/FunnelChart.tsx` | 1 | MIGRADO |
| 7 | `mtf-diamante/components/flow-analytics/GlobalFilters.tsx` | 1 | MIGRADO |
| 8 | `mtf-diamante/components/flow-analytics/SessionReplayModal.tsx` | 1 | MIGRADO |
| 9 | `leads-chatwit/.../EspelhoPadraoCell.tsx` | 1 | MIGRADO |
| 10 | `MTFdashboard/mtf-oab/page.tsx` | 1 | MIGRADO |
| 11 | `monitoring/page.tsx` | 1 | MIGRADO |
| 12 | `mtf-diamante/components/flow-analytics/hooks/useHeatmapData.ts` | 1 | MIGRADO |
| 13 | `mtf-diamante/components/flow-analytics/hooks/useNodeDetails.ts` | 1 | MIGRADO |
| 14 | `mtf-diamante/components/MapeamentoTab.tsx` | 1 | MIGRADO |

### Medio (read-only com filtros, paginacao, ou polling leve) — TODOS MIGRADOS (Fase 2)

| # | Arquivo | Fase | Status |
|---|---|---|---|
| 15 | `mtf-diamante/components/flow-builder/panels/FlowSelector.tsx` | 2 | MIGRADO |
| 16 | `leads-chatwit/components/leads-list.tsx` | 2 | MIGRADO |
| 17 | `leads-chatwit/components/all-messages-tab.tsx` | 2 | MIGRADO |
| 18 | `leads-chatwit/hooks/useMessages.ts` | 2 | MIGRADO |
| 19 | `flow-playground/page.tsx` | 2 | MIGRADO |
| 20 | `mtf-diamante/components/FlowAnalyticsDashboard.tsx` | 2 | MIGRADO |
| 21 | `leads-chatwit/components/transcription-progress.tsx` | 2 | JA USAVA RQ |
| 22 | `mtf-diamante/inbox/[id]/campanhas/page.tsx` | 2 | MIGRADO |

### Dificil (mutacoes CRUD, optimistic, polling pesado) — TODOS MIGRADOS (Fase 3)

| # | Arquivo | Fase | Status |
|---|---|---|---|
| 23 | `mtf-diamante/hooks/useLotes.ts` | 3 | MIGRADO |
| 24 | `mtf-diamante/hooks/useVariaveis.ts` | 3 | MIGRADO |
| 25 | `mtf-diamante/hooks/useApiKeys.ts` | 3 | MIGRADO |
| 26 | `mtf-diamante/hooks/useCaixas.ts` | 3 | MIGRADO |
| 27 | `mtf-diamante/hooks/useInboxButtonReactions.ts` | 3 | MIGRADO |
| 28 | `MTFdashboard/hooks/useAgentBlueprints.ts` | 3 | MIGRADO |

### Muito dificil (orquestracao, auto-save, context complexo)

| # | Arquivo | Fase | Status |
|---|---|---|---|
| 29 | `mtf-diamante/hooks/useInteractiveMessages.ts` | 3 | MIGRADO |
| 30 | `mtf-diamante/components/flow-builder/hooks/useFlowCanvas.ts` | 4 | MIGRADO (useQuery + useMutation, auto-save preservado) |
| 31 | `mtf-diamante/components/flow-builder/hooks/FlowBuilderTabHooks.ts` | 3 | MIGRADO (globalMutate → queryClient) |

### Infra (removidos na Fase 6)

| # | Arquivo | Status final | Fase |
|---|---|---|---|
| 32 | `lib/swr-config.ts` | REMOVIDO (Fase 6) | 6 |
| 33 | `components/providers/SwrProvider.tsx` | REMOVIDO (Fase 6) | 6 |
| 34 | `app/admin/mtf-diamante/context/SwrProvider.tsx` | REMOVIDO (Fase 6) | 6 |
| NEW | `app/admin/mtf-diamante/context/MtfDataProvider.tsx` | Provider ativo (React Query) | — |

---

## 11. Checklists

### 11.1 Antes de migrar qualquer hook

- [ ] O hook e read-only ou tem mutacao?
- [ ] Existe dependencia forte do `SwrProvider` context?
- [ ] Existe `globalMutate` ou refresh cruzado?
- [ ] Existe polling (`refreshInterval`)?
- [ ] Existe `useSWRInfinite`?
- [ ] Existe optimistic update com rollback?
- [ ] Se "sim" para 3+ itens, mover para fase posterior

### 11.2 Apos migrar cada hook

- [ ] `queryKey` criada no factory central (nunca inline)
- [ ] `staleTime` definido conforme tabela 7.2
- [ ] Hook usando `useQuery` ou `useMutation`
- [ ] Componentes consumidores funcionando sem mudar UX
- [ ] Nenhum `useState` duplicando server state
- [ ] `isLoading` tratado (sem FOEC)
- [ ] `data ?? []` em vez de `data || []` (preserva falsy values)
- [ ] `pnpm exec tsc --noEmit && pnpm exec tsc --noEmit -p tsconfig.worker.json`

### 11.3 Apos completar cada fase

- [ ] Nenhuma entidade usando SWR E React Query simultaneamente
- [ ] `queryKeys` do dominio completas e hierarquicas
- [ ] Deploy seguro (sem quebra visual, sem regressao)
- [ ] Commit isolado por fase (facilita rollback)

---

## 12. Definicao de Sucesso

Esta migracao sera considerada bem-sucedida quando:

- [x] Zero usos de `globalMutate` (concluido Fase 3)
- [x] CRUDs principais usando `useMutation` com optimistic + rollback (concluido Fase 3)
- [x] Listas e detalhes compartilhando cache por `queryKey` hierarquica (concluido Fase 3)
- [x] `SwrProvider` do MTF eliminado — substituido por `MtfDataProvider` sem SWR (concluido Fase 4)
- [x] Contagem de arquivos SWR: **0** (era 1 pos-Fase 4, 5 pos-Fase 3, 13 pos-Fase 2, 20 pos-Fase 1, 35 pre-Fase 1)
- [x] Contagem de arquivos React Query: **38** (era 36 pos-Fase 3, era 29 pos-Fase 2, era 22 pos-Fase 1, era 7 pre-Fase 1)
- [x] Zero `data || []` — tudo usando `data ?? []` (concluido Fase 2)
- [x] Zero `useState` para server state (concluido Fase 3 — todos migrados para `isPending`)
- [x] Zero funcoes deprecated no provider context (concluido Fase 4)
- [x] Zero SWRConfig/SWRProvider no render tree (concluido Fase 4)
- [x] Bundle size reduzido: SWR (~4KB gzip) removido, apenas React Query (~13KB gzip) permanece (concluido Fase 6)
- [x] `swr` removido do `package.json` (concluido Fase 6)

---

## 13. Estrategia para `useSmartPolling`

O `useSmartPolling` (em `performance-utils.ts`) e usado apenas por `useInteractiveMessages`. Ele adapta o intervalo de polling com base em atividade do usuario.

### Equivalente React Query

```ts
// Opcao A: refetchInterval como funcao (built-in no TanStack Query)
const { data } = useQuery({
  queryKey: mtfDiamanteQueryKeys.interactiveMessages(inboxId),
  queryFn: fetchInteractiveMessages,
  refetchInterval: (query) => {
    // Se a ultima fetch trouxe dados novos, polling rapido
    if (query.state.dataUpdatedAt > Date.now() - 10_000) return 5_000;
    // Senao, polling lento
    return 30_000;
  },
  enabled: !isPaused,
});

// Opcao B: manter useSmartPolling como helper externo (menos invasivo)
const smartPolling = useSmartPolling(30_000);
const { data } = useQuery({
  queryKey: mtfDiamanteQueryKeys.interactiveMessages(inboxId),
  queryFn: fetchInteractiveMessages,
  refetchInterval: smartPolling.getPollingInterval(),
  enabled: !isPaused,
});
```

> **Recomendacao:** Opcao A — usar `refetchInterval` como funcao. Elimina dependencia do helper SWR.

---

## 14. Mapeamento de `dedupingInterval` → `staleTime`

O SWR usa `dedupingInterval` para evitar requests duplicados. No React Query, o equivalente e `staleTime` (dados "frescos" nao sao re-fetched).

| Hook SWR | `dedupingInterval` | `staleTime` React Query equivalente |
|---|---|---|
| `useCaixas` | 25s | 30s (volatil) |
| `useLotes` | 30s | 30s (volatil) |
| `useVariaveis` | 30s | 30s (volatil) |
| `useApiKeys` | 30s | 5min (config, muda por acao) |
| `useApprovedTemplates` | 30s | 5min (config) |
| `useProviderModels` | 60s | 10min (referencia) |
| `FlowSelector` | 5s | 30s (volatil) |
| `useFlowCanvas` | 5s | 0 (tempo real, auto-save) |
| `campanhas/page.tsx` | 5s | 0 (tempo real) |
| `mtf-oab/page.tsx` | 5s | 5min (config) |
| Global (swr-config) | 2s | 30s (default QueryClient) |

---

## 15. Riscos e Mitigacao

| Risco | Probabilidade | Impacto | Mitigacao |
|---|---|---|---|
| Flash of Empty Content (FOEC) ao migrar hook sem `isLoading` | Alta | Media | Checklist 11.2 exige tratamento de `isLoading` + `placeholderData` |
| Polling quebrado ao migrar hooks com `isPaused` | Media | Alta | Testar pausa/resume em MTF Diamante antes de deploy |
| Cache duplicado (SWR + RQ para mesma entidade) | Baixa | Alta | Regra: nunca ambos no mesmo fluxo (checklist 11.3) |
| `useInteractiveMessages` regressao (smart polling + optimistic) | Alta | Alta | Migrar por ultimo (Fase 3), testes manuais extensos |
| SwrProvider context break (Fase 4) | Media | Alta | Mapear todos os consumidores antes, substituir gradualmente |
| Bundle size aumenta durante coexistencia | Certa | Baixa | SWR ~4KB + RQ ~13KB = ~17KB. Aceitavel. Cai pra ~13KB na Fase 6 |

---

## 16. Observacoes Operacionais

### Warning de instalacao do pnpm

```text
Ignored build scripts: protobufjs
Run "pnpm approve-builds" to pick which dependencies should be allowed to run scripts.
```

Nao bloqueou a instalacao. So agir se algum build futuro depender desse script.

### DevTools

Considerar instalar `@tanstack/react-query-devtools` durante o desenvolvimento:

```bash
pnpm add -D @tanstack/react-query-devtools
```

```ts
// Em react-query-provider.tsx (apenas em dev)
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
// Adicionar <ReactQueryDevtools initialIsOpen={false} /> dentro do provider
```

---

## 17. Veredito Final

**Sim, vale migrar.**

A forma correta para este projeto e:

- **incremental** — fase por fase, com checkpoints
- **por dominio** — terminar um dominio antes de comecar outro
- **com convivencia SWR + React Query** — zero big bang
- **comecando por leitura simples** — 13 hooks faceis primeiro
- **deixando mutacoes pesadas e provider-context para depois** — Fases 3-4

A auditoria confirmou: 30 arquivos SWR restantes, 4 padroes de mutacao inconsistentes, e orquestracao manual que React Query elimina nativamente. O ROI maior esta na Fase 3 (mutacoes), mas a Fase 1 (read-only) e o alicerce.
