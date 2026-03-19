# SSE + SWR Local Draft Pattern — Sem Reload, Sem Reset

## Objetivo

Quando worker, webhook ou automação concluem uma etapa e enviam SSE, a UI precisa refletir o novo estado **sem refresh automático da lista inteira** e **sem destruir trabalho em andamento** em dialogs, drawers ou formulários.

## Regra Principal

**Snapshot remoto fica no SWR. Draft do usuário fica no componente local.**

- O servidor atualiza o snapshot remoto.
- O SSE faz patch no cache SWR com `mutate(..., { revalidate: false })`.
- Dialogs e editores mantêm seu próprio estado local (`draft`, `formData`, `texto`).
- O draft nunca é sobrescrito automaticamente por mudança vinda do servidor enquanto o componente está aberto e editando.

## Arquitetura Aplicada

### Camada 1 — BFF + SWR como fonte do estado remoto

`leads-list.tsx` usa uma única key SWR para a página atual da lista.

```ts
const { data, mutate } = useSWR(leadsKey, {
  keepPreviousData: true,
  revalidateOnFocus: false,
  revalidateOnReconnect: false,
  revalidateIfStale: false,
});
```

Isso garante:

- sem reload automático ao focar a aba
- sem refresh automático ao reconectar SSE
- sem flash de lista vazia ao paginar ou buscar

### Camada 2 — SSE faz patch, não reload

Quando chega um `leadUpdate`, o fluxo é:

```text
SSE chega
  → handleSSELeadUpdate(leadData)
    → mutate(cache atual, patch do lead, { revalidate: false })
    → se houver dialog aberto do mesmo lead, merge no snapshot local
    → se o payload vier resumido, fetch individual do lead e merge pontual
```

Regra importante:

- **Nunca** recarregar a lista inteira como reação normal ao SSE.
- Se o payload estiver incompleto, buscar **apenas o lead afetado**.

### Camada 3 — Dialogs protegem o trabalho em andamento

O dado remoto pode mudar. O draft local não.

Exemplo:

```ts
useEffect(() => {
  if (isOpen && !prevOpenRef.current) {
    setTexto(textoProva || "");
  }
  prevOpenRef.current = isOpen;
}, [isOpen, textoProva]);
```

E para formulários:

```ts
useEffect(() => {
  if (lead && !formInitializedRef.current) {
    setFormData(...);
    formInitializedRef.current = true;
  }
}, [lead]);
```

Isso significa:

- ao abrir: componente recebe o dado mais novo do servidor
- enquanto aberto: SSE atualiza snapshot remoto, mas não reseta o draft local
- ao fechar e reabrir: o draft reinicializa com o estado remoto mais recente

## Fluxo Completo

```text
Worker conclui espelho/prova/análise
  → Redis PUBLISH sse:{leadId}
    → endpoint SSE envia ao browser
      → SSEUserConnection recebe evento
        → mutate da key SWR da lista atual
        → célula do botão muda de estado
        → dados novos ficam disponíveis para a UI
        → dialog aberto mantém draft local
        → nenhum refresh automático da lista inteira é disparado
```

## Refresh Manual

Refresh existe, mas é **explícito do usuário**.

- Botão "Atualizar"
- Action manual em toast
- Revalidate pontual disparado por uma ação intencional da UI

Não é permitido:

- refresh automático após reconexão SSE
- refresh automático da página inteira após um `leadUpdate`
- refresh automático da lista inteira para refletir uma única mudança de lead

## Quando Buscar do Servidor

Use fetch pontual apenas nestes casos:

- payload SSE veio resumido/omitido
- ação retornou só `success: true`, sem payload suficiente para mutar o cache corretamente
- usuário pediu atualização manual

Mesmo nesses casos:

- buscar somente o recurso afetado
- mergear no cache existente
- não resetar dialogs abertos

## Anti-patterns

- **NÃO** usar `fetchLeads()` como reação padrão ao SSE.
- **NÃO** disparar refresh automático ao reconectar o `EventSource`.
- **NÃO** ligar inputs diretamente ao prop remoto sem draft local.
- **NÃO** usar `useEffect([lead])` para resetar formulário sem guarda de primeira abertura.
- **NÃO** sobrescrever draft local com dados do servidor enquanto o usuário está digitando.
- **NÃO** usar refresh de página para “resolver inconsistência de estado”.

## Checklist de Manutenção

- A mudança atualiza o cache SWR ou está recriando snapshot paralelo?
- O SSE faz patch local ou está recarregando a lista inteira?
- O dialog tem draft próprio protegido por abertura inicial?
- Existe algum refresh automático escondido em `onopen`, `onmessage`, `onerror` ou `setTimeout`?
- Se o payload for parcial, a busca é pontual por lead?

Se qualquer resposta acima for "não", o padrão foi quebrado.
