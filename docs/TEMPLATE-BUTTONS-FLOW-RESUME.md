# Template QUICK_REPLY Buttons: Flow Resume Failure

> **Data:** 23 de Fevereiro de 2026
> **Status:** ✅ Socialwise implementado (payload + text-match fallback) | ⏳ Pendente Chatwit (parsing webhook)
> **Contexto:** Campanha Flow Builder envia template com botoes QUICK_REPLY, usuario clica, flow nao continua

## O Problema

Campanha envia template `satisfacao_oab` via Flow Builder. Template tem 3 botoes QUICK_REPLY ("Fui aprovado(a)!", "So ganhei Pontos", "Minha nota nao mudou."). Usuario clica no botao mas o flow **nao resume** — em vez disso, o clique vai pro pipeline de classificacao (embedding → ROUTER → LLM) e retorna resposta generica.

## Cadeia de Eventos (Logs Reais)

```
1. [Worker] CampaignOrchestrator envia template → sucesso (messageId: 48787, conv: 2564)
2. [Worker] FlowExecutor detecta QUICK_REPLY → retorna "WAITING_INPUT"
3. [Worker] FlowSession criada no banco: status=WAITING_INPUT, currentNodeId=<template_node>
4. [Usuario] Clica "Fui aprovado(a)!" no WhatsApp
5. [Chatwit] Dispara webhook para /api/integrations/webhooks/socialwiseflow
6. [App] Payload chega com message: "Fui aprovado(a)!" (texto puro, SEM button_reply.id)
7. [App] detectButtonClick() → unmappedButtonId: null
8. [App] isFlowBuilderButton = false (sem prefixo "flow_")
9. [App] Vai pro pipeline de classificacao → ROUTER → LLM fallback
10. [App] Resposta: "Sistema temporariamente ocupado" (fallback)
```

## Causa Raiz

### Como funciona para Interactive Messages (funciona)

```
Flow Builder → botao com id: "flow_button_1771787428331_clbeq0"
                                    ↓
WhatsApp envia de volta → button_reply.id: "flow_button_1771787428331_clbeq0"
                                    ↓
Webhook detecta prefixo "flow_" → FlowOrchestrator.handle() → resumeSession()
```

**Botoes interativos (tipo `reply`) enviam o `id` de volta no campo `button_reply.id`.** O Flow Builder gera IDs com prefixo `flow_button_*`, o webhook detecta e roteia para o FlowOrchestrator.

### Como funciona para Template QUICK_REPLY (NAO funciona)

```
Template aprovado pela Meta → botoes QUICK_REPLY com texto fixo
                                    ↓
WhatsApp envia de volta → message: "Fui aprovado(a)!" (texto do botao)
                          content_attributes: {} (SEM button_reply.id)
                                    ↓
Webhook NAO detecta como botao → vai pro pipeline de classificacao
```

**Template QUICK_REPLY buttons da Meta WhatsApp API NAO enviam um payload/ID customizavel.** O WhatsApp retorna apenas o texto do botao como mensagem normal. O Chatwit repassa como texto puro, sem `button_reply.id`.

## Arquitetura Atual (Relevante)

### Webhook Detection (route.ts L573-589)
```typescript
const buttonDetection = detectButtonClick(validPayload, channelType);
const isFlowBuilderButton =
  buttonDetection.isButtonClick && buttonDetection.buttonId?.startsWith(FLOW_BUTTON_PREFIX);

if (isFlowBuilderButton) {
  // → FlowOrchestrator.handle() → resumeSession() ✅
} else {
  // → handleButtonInteraction() legado → pipeline classificacao ❌
}
```

### FlowOrchestrator.handle() (flow-orchestrator.ts L88-101)
```typescript
const buttonId = this.extractButtonId(payload);  // procura button_reply.id
if (buttonId) {
  const session = await this.findActiveSession(deliveryContext);  // busca WAITING_INPUT
  if (session) {
    return this.resumeSession(session, buttonId, deliveryContext, bridge);
  }
}
```

### FlowExecutor.resumeFromButton() (flow-executor.ts L105-123)
```typescript
// Busca edge onde buttonId === edge.buttonId
let edges = flow.edges.filter(e =>
  e.sourceNodeId === session.currentNodeId && e.buttonId === buttonId
);
```

### FlowSession no Banco
```
FlowSession {
  status: "WAITING_INPUT",
  currentNodeId: "cmly4mgkk001trq01lxfk9jly",  // no template
  conversationId: "2564",
  flowId: "cmly4h2dr000srq01rvm46cql",
  variables: { nome_lead: "Witalo" }
}
```

### Edges do Template no Flow
```
template_node → "flow_button_1771787428331_clbeq0" → REACTION (emoji aprovado)
template_node → "flow_button_1771787428331_yjmqyi" → REACTION (emoji reprovado) + INTERACTIVE_MESSAGE
```

## Implementacao (23/02/2026)

Ambas as abordagens foram implementadas no Socialwise:

### Opcao A: Payload nos Botoes do Template ✅ IMPLEMENTADO

A Meta WhatsApp API para templates QUICK_REPLY aceita um campo `payload` (opcional) nos parametros do botao.

**O que foi feito:**
1. `buildChatwitTemplateParams()` agora aceita `buttonPayloads` — mapa de indice → flow_button_* ID
2. `FlowExecutor.handleTemplate()` extrai os buttonIds das edges do flow e passa como payloads
3. O Chatwit `TemplateProcessorService` precisa tratar `type: "quick_reply"` → `{ type: "payload", payload: valor }`
4. O Chatwit `IncomingMessageBaseService` precisa parsear `type: "button"` do webhook Meta

**Contrato Chatwit:** Seção 16 de `chatwit-contrato-async-30s.md` (~13 linhas Ruby, ~20min)

### Opcao B: Match por Texto (Fallback) ✅ IMPLEMENTADO

Enquanto o Chatwit nao implementa o parsing de payload:
1. `FlowOrchestrator.handle()` tem `tryTemplateTextMatch()` — antes do pipeline de classificacao
2. Verifica se existe FlowSession WAITING_INPUT num no TEMPLATE
3. Faz match exato do texto da mensagem com os labels dos botoes QUICK_REPLY
4. Se encontra match, resolve o buttonId da edge e chama `resumeSession()`
5. Webhook `route.ts` (Step 13.7) chama FlowOrchestrator antes do pipeline LLM

**Desvantagem:** Fragil — depende de match exato de texto. Sera removido quando o Chatwit implementar Opcao A.

## Arquivos-Chave

| Arquivo | Responsabilidade |
|---------|-----------------|
| `lib/flow-builder/templateElements.ts` | `buildChatwitTemplateParams()` — monta payload nativo do template |
| `services/flow-engine/chatwit-delivery-service.ts` | `deliverTemplate()` — envia via Agent Bot API |
| `services/flow-engine/flow-orchestrator.ts` | `handle()`, `findActiveSession()`, `resumeSession()` |
| `services/flow-engine/flow-executor.ts` | `resumeFromButton()` — match edge por buttonId |
| `app/api/integrations/webhooks/socialwiseflow/route.ts` | Webhook — deteccao de botoes e roteamento |

## Dados do Teste (Prod 23/02/2026)

- **Campanha:** `cmlyjkuli0037pb0101123goj`
- **Template:** `satisfacao_oab` (APPROVED, 1 body var: `nome_lead`)
- **Flow:** `cmly4h2dr000srq01rvm46cql` ("Inicio")
- **Conversa:** 2564 (display_id)
- **Contato:** Witalo (+558597550136)
- **Resultado:** Template enviado OK, variavel resolvida OK, botao NAO resume flow
