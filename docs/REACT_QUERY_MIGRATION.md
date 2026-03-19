# React Query Migration (TanStack Query v5)

> **Data:** 19 de Marco de 2026  
> **Status:** Iniciada  
> **Escopo:** Migracao gradual de SWR 2.3.6 para TanStack Query v5 no Socialwise  
> **Motivacao:** Reduzir coordenacao manual de cache, rollback e invalidações entre telas

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

## 2. Estado Atual do Projeto

### 2.1 Base instalada

Ja foi instalado:

```json
"@tanstack/react-query": "^5.91.2"
```

### 2.2 Fundacao ja implementada

Esta fase ja foi aplicada no codigo:

| Arquivo | Papel |
|---|---|
| `components/providers/react-query-provider.tsx` | Cria e expoe `QueryClientProvider` global |
| `app/layout.tsx` | Passou a envolver a app com `ReactQueryProvider` sem remover `SWRProvider` |
| `app/admin/mtf-diamante/lib/query-keys.ts` | Inicio do padrao centralizado de `queryKey` |
| `app/admin/mtf-diamante/hooks/useChatwitLabels.ts` | Primeiro hook migrado para `useQuery` |
| `app/admin/mtf-diamante/hooks/useChatwitAgents.ts` | Segundo hook migrado para `useQuery` |
| `app/admin/mtf-diamante/lib/api-clients.ts` | Ajuste de tipagem para `ChatwitAgent[]` |

### 2.3 Validacao executada

Os comandos abaixo passaram apos a primeira etapa:

```bash
pnpm exec tsc --noEmit
pnpm exec tsc --noEmit -p tsconfig.worker.json
```

### 2.4 Tamanho estimado da migracao

Levantamento local no momento desta doc:

- Aproximadamente **99 usos** de `useSWR`, `useSWRMutation`, `useSWRInfinite` e `useSWRSubscription`
- O maior concentrador de complexidade esta em `app/admin/mtf-diamante/`

Arquivos mais pesados hoje:

| Arquivo | Sinal de complexidade |
|---|---|
| `app/admin/mtf-diamante/hooks/useCaixas.ts` | Mutacoes + optimistic update + rollback |
| `app/admin/mtf-diamante/hooks/useLotes.ts` | Mutacoes + rollback repetido |
| `app/admin/mtf-diamante/hooks/useVariaveis.ts` | Mutacoes + rollback repetido |
| `app/admin/mtf-diamante/hooks/useApiKeys.ts` | Mutacoes + rollback repetido |
| `app/admin/mtf-diamante/hooks/useInteractiveMessages.ts` | Mutacoes + polling + performance tracking |
| `app/admin/mtf-diamante/context/SwrProvider.tsx` | Orquestracao central de varios hooks |
| `app/admin/mtf-diamante/components/FlowAnalyticsDashboard.tsx` | Varias chaves + polling + refresh manual |
| `app/admin/mtf-diamante/inbox/[id]/campanhas/page.tsx` | Lista, detalhe, progresso e infinito no mesmo fluxo |

---

## 3. O Problema Real

O problema **nao** e "SWR nao consegue ser global".

O SWR ja e global no projeto hoje porque:

- existe `SWRProvider` no root
- varias telas compartilham cache pela mesma key
- ja existe `globalMutate` por predicado em partes do admin

O problema real e outro:

1. A ergonomia de mutacao ficou cara.
2. O custo de padronizar optimistic update ficou alto.
3. O refresh entre telas depende demais de convencao manual.
4. Parte do server state ja esta vazando para `useState`, o que reduz previsibilidade.

TanStack Query ajuda porque formaliza melhor:

- `queryKey`
- `invalidateQueries`
- `setQueryData`
- `getQueryData`
- `cancelQueries`
- `useMutation`
- `useInfiniteQuery`

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

---

## 6. Estrategia por Fases

## Fase 0. Fundacao Segura

**Status:** Concluida

Entregas:

- Provider global do React Query
- QueryClient estavel no browser
- Primeiro arquivo de `queryKeys`
- Dois hooks read-only migrados
- TypeScript validado

Essa fase e segura para deploy porque:

- nao removeu SWR
- nao alterou API routes
- nao mudou contrato com Chatwit
- nao mudou fluxo critico do Flow Engine

---

## Fase 1. Read-only de baixo risco

**Objetivo:** consolidar padrao de `useQuery` e `queryKey`

### Proximos candidatos

| Prioridade | Arquivo | Motivo |
|---|---|---|
| Alta | `app/admin/mtf-diamante/hooks/useApprovedTemplates.ts` | Read-only, dominio bem definido |
| Alta | `app/admin/MTFdashboard/hooks/useAgentCatalog.ts` | Read-only simples |
| Alta | `app/admin/MTFdashboard/hooks/useProviderModels.ts` | Read-only simples |
| Media | `app/admin/mtf-diamante/hooks/useChatwitLabels.ts` | Ja migrado |
| Media | `app/admin/mtf-diamante/hooks/useChatwitAgents.ts` | Ja migrado |
| Media | `app/admin/mtf-diamante/components/MapeamentoTab.tsx` | Leitura multipla, mas ainda controlavel |

### Criterio de pronto

- Cada hook usa `useQuery`
- `queryKey` centralizada
- sem regressao visual
- sem alterar APIs
- `tsc` verde

---

## Fase 2. Listas, filtros e paginacao

**Objetivo:** padronizar leitura com parametros e preparar o terreno para invalidação previsivel

### Candidatos

| Prioridade | Arquivo | Ponto de atencao |
|---|---|---|
| Alta | `app/admin/leads-chatwit/hooks/useMessages.ts` | Hoje mistura SWR com `useState` local |
| Alta | `app/admin/leads-chatwit/components/all-messages-tab.tsx` | Historico + load more |
| Media | `app/admin/mtf-diamante/components/flow-builder/panels/FlowSelector.tsx` | Lista e refresh |
| Media | `app/admin/monitoring/page.tsx` | Varias queries read-only |
| Media | `app/admin/mtf-diamante/components/FlowAnalyticsDashboard.tsx` | Polling em 3 chaves |
| Media | `app/admin/mtf-diamante/inbox/[id]/campanhas/page.tsx` | Mistura lista, detalhe, progresso e infinito |

### Meta tecnica

- Introduzir `placeholderData` e `useInfiniteQuery` onde fizer sentido
- Remover `useState` que replica server state sem necessidade
- Formalizar `queryKey` com filtros

---

## Fase 3. Mutacoes CRUD com optimistic update

**Objetivo:** migrar as entidades com maior retorno tecnico

### Ordem recomendada

1. `useCaixas.ts`
2. `useLotes.ts`
3. `useVariaveis.ts`
4. `useApiKeys.ts`
5. `useInboxButtonReactions.ts`
6. `useInteractiveMessages.ts`

### Motivo da ordem

- `caixas`, `lotes`, `variaveis` e `apiKeys` ja repetem o mesmo padrao
- sao boas candidatas para um template reutilizavel de `useMutation`
- `interactiveMessages` deve vir depois porque tem mais acoplamento com Flow Builder e polling

### Padrao esperado

Cada mutacao deve seguir o fluxo:

1. `cancelQueries`
2. snapshot com `getQueryData`
3. optimistic update com `setQueryData`
4. rollback em `onError`
5. `invalidateQueries` em `onSettled`

---

## Fase 4. Simplificacao do `SwrProvider` do MTF

**Objetivo:** parar de usar o provider como orquestrador manual de varios refreshes

Arquivo principal:

- `app/admin/mtf-diamante/context/SwrProvider.tsx`

Problema atual:

- o provider centraliza varios hooks
- expoe wrappers de compatibilidade
- concentra refresh manual e pausa/resume

Destino ideal:

- reduzir o provider para compatibilidade temporaria
- migrar dados gradualmente para hooks baseados em React Query
- evitar que o provider seja o "cache manager" da feature

---

## Fase 5. SSR/Hydration opcional

**Objetivo:** so fazer onde trouxer ganho real

Nao e prioridade inicial.

Aplicar apenas quando houver beneficio concreto em:

- primeira render pesada
- carregamento acima da dobra
- telas com skeleton/FOEC relevante

Possivel alvo futuro:

- dashboards
- listagens pesadas do admin

---

## Fase 6. Descomissionamento gradual do SWR

**Objetivo:** remover o SWR somente quando o custo residual estiver baixo

Checklist:

- `SwrProvider` residual quase vazio
- principais hooks migrados
- poucas telas restantes
- `globalMutate` quase inexistente
- sem dependencia importante de `useSWRInfinite` ou `useSWRSubscription`

So nesta fase faz sentido:

- remover `swr` do projeto
- apagar utilitarios dedicados ao SWR
- refatorar docs antigas

---

## 7. Padrao de Implementacao

## 7.1 Query keys

Criar arquivo por dominio:

```ts
export const mtfDiamanteQueryKeys = {
  all: ["mtf-diamante"] as const,
  caixas: () => ["mtf-diamante", "caixas"] as const,
  caixa: (id: string) => ["mtf-diamante", "caixa", id] as const,
  lotes: () => ["mtf-diamante", "lotes"] as const,
  variaveis: () => ["mtf-diamante", "variaveis"] as const,
  approvedTemplates: (inboxId: string | null) =>
    ["mtf-diamante", "approved-templates", inboxId] as const,
};
```

Regra:

- nunca inventar `queryKey` inline em todo lugar
- manter factory por dominio

---

## 7.2 Read-only

```ts
export function useChatwitLabels() {
  const { data, error, isLoading } = useQuery({
    queryKey: mtfDiamanteQueryKeys.chatwitLabels(),
    queryFn: chatwitLabelsApi.getAll,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  return {
    chatwitLabels: data || [],
    isLoading,
    error,
  };
}
```

---

## 7.3 Mutacao com optimistic update

```ts
export function useCreateCaixa() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: caixasApi.create,
    onMutate: async (payload) => {
      await queryClient.cancelQueries({ queryKey: mtfDiamanteQueryKeys.caixas() });

      const previous = queryClient.getQueryData<ChatwitInbox[]>(
        mtfDiamanteQueryKeys.caixas()
      );

      const optimistic = {
        id: `temp-${crypto.randomUUID()}`,
        ...payload,
      } as ChatwitInbox;

      queryClient.setQueryData<ChatwitInbox[]>(
        mtfDiamanteQueryKeys.caixas(),
        (current = []) => [...current, optimistic]
      );

      return { previous };
    },
    onError: (_error, _payload, context) => {
      queryClient.setQueryData(mtfDiamanteQueryKeys.caixas(), context?.previous || []);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: mtfDiamanteQueryKeys.caixas() });
    },
  });
}
```

---

## 7.4 Paginacao / infinito

Para fluxos como campanhas e mensagens antigas:

- usar `useInfiniteQuery`
- evitar duplicar paginas em `useState` se o cache puder ser a fonte unica

---

## 8. O que NAO Fazer

1. Nao migrar `context/SwrProvider.tsx` antes de estabilizar os hooks base.
2. Nao migrar `useInteractiveMessages.ts` logo no inicio.
3. Nao misturar SWR e React Query para a mesma entidade na mesma tela sem plano claro.
4. Nao usar Zustand para substituir cache de API.
5. Nao fazer uma branch gigante com dezenas de hooks migrados sem checkpoints.
6. Nao acoplar a migracao a mudancas de API, schema ou Flow Engine.

---

## 9. Plano de Deploy e Hotfix

## 9.1 Antes do hotfix imediato

Se a necessidade atual for publicar um hotfix funcional, a base ja aplicada e segura o suficiente para conviver com a app atual:

- React Query esta adicionado, mas com escopo pequeno
- SWR continua responsavel pela maior parte da app
- nao houve quebra estrutural em tela critica

### Recomendacao

1. Fazer o deploy do hotfix atual normalmente.
2. Depois continuar a migracao em branch dedicada.
3. Avancar uma fase por vez com checkpoints pequenos.

---

## 9.2 Regra de deploy durante a migracao

Cada PR/etapa deve:

- migrar poucas features
- incluir `queryKeys` novas
- manter comportamento visual
- passar em `tsc`
- evitar refatorar 2 dominios pesados no mesmo deploy

---

## 10. Rollback

Rollback da migracao e simples enquanto estivermos nas fases 0-2:

- remover hook migrado
- restaurar versao SWR do hook
- manter `ReactQueryProvider` inofensivo no root

Enquanto nao houver mutacoes pesadas migradas, o custo de rollback continua baixo.

---

## 11. Checklists

## 11.1 Checklist por etapa

- `queryKey` criada em arquivo central
- hook migrado para `useQuery` ou `useMutation`
- componentes consumidores funcionando sem mudar UX
- nenhum estado local duplicando cache sem necessidade
- `pnpm exec tsc --noEmit`
- `pnpm exec tsc --noEmit -p tsconfig.worker.json`

## 11.2 Checklist antes de migrar um hook

- O hook e read-only ou mutacao?
- Existe dependencia forte do `SwrProvider`?
- Existe `globalMutate` ou refresh cruzado hoje?
- Existe polling?
- Existe pagina infinita?
- Existe rollback otimista?

Se a resposta for "sim" para varios itens, o hook deve ir para uma fase mais tardia.

---

## 12. Ordem Recomendada de Trabalho

### Ja feito

- `useChatwitLabels`
- `useChatwitAgents`
- provider global
- base de `queryKeys`

### Proxima leva recomendada

1. `useApprovedTemplates.ts`
2. `useAgentCatalog.ts`
3. `useProviderModels.ts`
4. `FlowSelector.tsx`
5. `useMessages.ts`

### Leva seguinte

1. `useCaixas.ts`
2. `useLotes.ts`
3. `useVariaveis.ts`
4. `useApiKeys.ts`

### Leva pesada

1. `useInboxButtonReactions.ts`
2. `useInteractiveMessages.ts`
3. `FlowAnalyticsDashboard.tsx`
4. `inbox/[id]/campanhas/page.tsx`
5. `context/SwrProvider.tsx`

---

## 13. Observacoes Operacionais

### Warning de instalacao do pnpm

Durante a instalacao apareceu:

```text
Ignored build scripts: protobufjs
Run "pnpm approve-builds" to pick which dependencies should be allowed to run scripts.
```

No estado atual, isso **nao bloqueou** a instalacao do `@tanstack/react-query` nem a validacao de TypeScript.

So agir se algum build futuro realmente depender desse script.

---

## 14. Definicao de Sucesso

Esta migracao sera considerada bem-sucedida quando:

- o MTF admin parar de depender de `globalMutate` para quase tudo
- os CRUDs principais estiverem em `useMutation`
- listas e detalhes compartilharem cache por `queryKey`
- o `SwrProvider` deixar de ser um orquestrador central
- o numero de usos de SWR cair drasticamente sem regressao funcional

---

## 15. Veredito Final

**Sim, vale migrar.**

Mas a forma correta para este projeto e:

- **incremental**
- **por dominio**
- **com convivencia SWR + React Query**
- **comecando por leitura simples**
- **deixando mutacoes pesadas e provider-context para depois**

Nao fazer big bang e o ponto central desta migracao.
