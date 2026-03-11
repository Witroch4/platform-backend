# WhatsApp Templates — Arquitetura Completa

> Documenta como o Flow Builder e o sistema legado criam, validam e enviam templates do WhatsApp (Meta API).
> Última atualização: 2026-03-10

---

## Índice

1. [Visão Geral](#1-visão-geral)
2. [Modelos de Dados (Prisma)](#2-modelos-de-dados-prisma)
3. [Tipos e Interfaces (TypeScript)](#3-tipos-e-interfaces-typescript)
4. [Limites e Regras de Validação](#4-limites-e-regras-de-validação)
5. [API Routes (CRUD)](#5-api-routes-crud)
6. [Fluxo de Criação — UI → Meta API](#6-fluxo-de-criação--ui--meta-api)
7. [Execução em Runtime — Flow Builder](#7-execução-em-runtime--flow-builder)
8. [Formato Nativo Chatwit (`template_params`)](#8-formato-nativo-chatwit-template_params)
9. [Sistema Legado — Disparo por Botão](#9-sistema-legado--disparo-por-botão)
10. [Diagrama End-to-End](#10-diagrama-end-to-end)
11. [Arquivos de Referência](#11-arquivos-de-referência)

---

## 1. Visão Geral

Templates WhatsApp Official são mensagens pré-aprovadas pela Meta que permitem envio proativo de HSMs (Highly Structured Messages). No Socialwise existem **dois caminhos** para enviar templates:

| Caminho | Quem usa | Como funciona |
|---|---|---|
| **Flow Builder** (`TEMPLATE` / `WHATSAPP_TEMPLATE` node) | Automações no Flow Engine | FlowExecutor → `buildChatwitTemplateParams()` → Chatwit Bot API |
| **Sistema Legado** (`SEND_TEMPLATE` action) | `MapeamentoBotao` — clique de botão | ButtonProcessor → `whatsappApiManager.sendMessage()` diretamente |

**Regra arquitetural:** Templates SEMPRE saem do Socialwise (cérebro) via Chatwit (carteiro). O Socialwise **nunca** chama a WhatsApp Cloud API diretamente em produção — passa pelo `ChatwitDeliveryService`.

---

## 2. Modelos de Dados (Prisma)

### `Template` (`prisma/schema.prisma`)

```prisma
model Template {
  id                 String                  @id @default(cuid())
  name               String
  type               String                  // "WHATSAPP_OFFICIAL" | "INTERACTIVE"
  scope              String?                 // inbox scope
  status             String?                 // "APPROVED" | "PENDING" | "REJECTED"
  language           String?                 // "pt_BR"
  category           String?                 // "MARKETING" | "UTILITY" | "AUTHENTICATION"
  whatsappOfficialInfo WhatsAppOfficialInfo?
  interactiveContent InteractiveContent?
  // ...
}
```

### `WhatsAppOfficialInfo`

```prisma
model WhatsAppOfficialInfo {
  id              String   @id @default(cuid())
  templateId      String   @unique
  metaTemplateId  String?  // ID retornado pela Meta API após criação
  status          String?  // "APPROVED" | "PENDING" | "REJECTED" | "PAUSED"
  category        String?
  components      Json?    // componentes raw da Meta API
  template        Template @relation(fields: [templateId], references: [id])
}
```

---

## 3. Tipos e Interfaces (TypeScript)

### Arquivo: `types/flow-builder/templates.ts`

#### `TemplateButtonType`
```typescript
type TemplateButtonType =
  | "QUICK_REPLY"      // resposta rápida — pode conectar a próximo nó no flow
  | "URL"              // abre URL (estática ou dinâmica com variável)
  | "PHONE_NUMBER"     // discagem direta
  | "COPY_CODE"        // copia cupom/PIX para área de transferência
  | "VOICE_CALL"       // ligação via WhatsApp (TTL configurável)
  | "FLOW"             // WhatsApp Native Flow
  | "SPM"              // Single Product Message
  | "MPM";             // Multi Product Message
```

#### `TemplateButton`
```typescript
interface TemplateButton {
  id: string;            // "flow_tpl_btn_<timestamp>_<random>" — prefixo obrigatório
  type: TemplateButtonType;
  text: string;          // máx 25 chars
  url?: string;          // para URL buttons
  phoneNumber?: string;  // E.164: +55119...
  exampleCode?: string;  // para COPY_CODE, máx 15 chars
  flowId?: string;       // para FLOW buttons
  productId?: string;    // para SPM/MPM
  ttlMinutes?: number;   // para VOICE_CALL (padrão: 10080 = 7 dias)
}
```

#### `TemplateHeader`
```typescript
interface TemplateHeader {
  type: "NONE" | "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT";
  content?: string;      // texto do header (máx 60 chars)
  mediaUrl?: string;     // URL pública para mídia
  mediaHandle?: string;  // handle da Meta API (após upload via Media API)
  variables?: string[];  // variáveis extraídas do texto (ex: ["nome"])
}
```

#### `TemplateBody`
```typescript
interface TemplateBody {
  text: string;          // obrigatório, máx 1024 chars
  variables?: string[];  // variáveis extraídas: ["nome", "data", "valor"]
  namedParams?: Array<{ name: string; example: string }>; // para Meta API
}
```

#### `TemplateNodeData` (nó do Flow Builder)
```typescript
// types/flow-builder/nodes.ts:187
interface TemplateNodeData {
  templateName?: string;
  language?: string;           // "pt_BR" (padrão)
  category?: TemplateCategory; // "MARKETING" | "UTILITY" | "AUTHENTICATION"
  status?: string;             // "APPROVED" | "PENDING" | "REJECTED"
  header?: TemplateHeader;
  body?: TemplateBody;
  footer?: TemplateFooter;
  buttons?: TemplateButton[];
  // Runtime overrides (injetados pelo FlowExecutor):
  runtimeMediaUrl?: string;
  runtimeVariables?: Record<string, string>;
  runtimeButtonParams?: Record<number, { couponCode?: string }>;
}
```

---

## 4. Limites e Regras de Validação

### Arquivo: `lib/flow-builder/templateElements.ts`

```typescript
const TEMPLATE_LIMITS = {
  namePattern:           /^[a-z][a-z0-9_]*$/,  // snake_case obrigatório
  bodyMaxLength:         1024,
  headerTextMaxLength:   60,
  footerMaxLength:       60,
  buttonTextMaxLength:   25,
  couponCodeMaxLength:   15,
  maxButtons:            10,
  maxQuickReplyButtons:  10,
  maxUrlButtons:         2,
  variablePattern:       /\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g,
}
```

### Regras por tipo de botão

| Tipo | Máximo | Restrições |
|---|---|---|
| `QUICK_REPLY` | 10 | Conectam a nós do flow via edges |
| `URL` | 2 | Campo `url` obrigatório |
| `PHONE_NUMBER` | 1 | E.164 obrigatório; **exclusivo com VOICE_CALL** |
| `VOICE_CALL` | 1 | TTL padrão 10080 min (7 dias); **exclusivo com PHONE_NUMBER** |
| `COPY_CODE` | 1 | `exampleCode` máx 15 chars |
| `FLOW` | 1 | Incompatível com outros CTAs |

> ⚠️ **PHONE_NUMBER e VOICE_CALL são mutuamente exclusivos** — Meta rejeita templates com ambos.

### Funções de validação

```typescript
// Validação individual
validateTemplateName(name)          // → { valid, errors, warnings }
validateTemplateBody(body)          // → { valid, errors, warnings }
validateTemplateHeader(header)      // → { valid, errors, warnings }
validateTemplateFooter(footer)      // → { valid, errors, warnings }
validateTemplateButtons(buttons)    // → { valid, errors, warnings }

// Validação completa do nó
validateTemplateNodeData(data)      // → { valid, errors[], warnings[] }
```

### Extração de variáveis

```typescript
// Padrão: {{nome_variavel}}
extractVariables("Olá {{nome}}, seu pedido {{id}}")
// → ["nome", "id"]

extractAllVariables(templateNodeData)
// → union de variáveis do header + body
```

---

## 5. API Routes (CRUD)

### Arquivo: `app/api/admin/mtf-diamante/templates/route.ts`

| Método | Endpoint | Descrição |
|---|---|---|
| `GET` | `/api/admin/mtf-diamante/templates` | Listar templates (DB). `?refresh=true` sincroniza da Meta API |
| `POST` | `/api/admin/mtf-diamante/templates` | Criar template → envia para Meta API → salva localmente |
| `PUT` | `/api/admin/mtf-diamante/templates/edit/[metaTemplateId]` | Editar template existente |
| `DELETE` | `/api/admin/mtf-diamante/templates` | Remover registro local (Meta mantém histórico) |
| `GET` | `/api/admin/mtf-diamante/templates/[caixaId]/[templateId]/status` | Poll de status de aprovação |

> **Segurança:** Todas as rotas exigem `auth()` (NextAuth v5). Sem sessão → 401.

---

## 6. Fluxo de Criação — UI → Meta API

```
┌─────────────────────────────────────────────────┐
│  UI: unified-template-creator.tsx               │
│  Usuário preenche: nome, categoria, idioma,     │
│  header, body (com {{variáveis}}), footer,      │
│  botões                                         │
└─────────────────────────┬───────────────────────┘
                          ↓ POST /api/admin/mtf-diamante/templates
┌─────────────────────────┴───────────────────────┐
│  toMetaTemplatePayload(data, category)          │
│  Converte TemplateNodeData → Meta API format    │
└─────────────────────────┬───────────────────────┘
                          ↓ POST /{businessAccountId}/message_templates
┌─────────────────────────┴───────────────────────┐
│  Meta Graph API                                 │
│  Retorna: { id: metaTemplateId, status: PENDING }│
└─────────────────────────┬───────────────────────┘
                          ↓ Salva no banco (WhatsAppOfficialInfo)
┌─────────────────────────┴───────────────────────┐
│  Poll automático ~30s via GET .../status        │
│  Status: PENDING → APPROVED / REJECTED          │
│  UI: badge atualiza em tempo real               │
└─────────────────────────────────────────────────┘
```

### Payload enviado à Meta API (`toMetaTemplatePayload`)

```json
{
  "name": "boas_vindas_oab",
  "category": "MARKETING",
  "language": "pt_BR",
  "parameter_format": "NAMED",
  "components": [
    {
      "type": "HEADER",
      "format": "TEXT",
      "text": "Olá {{nome}}",
      "example": { "header_text": ["exemplo_nome"] }
    },
    {
      "type": "BODY",
      "text": "Seu processo {{numero_processo}} foi atualizado em {{data}}.",
      "example": { "body_text": [["exemplo_numero_processo", "exemplo_data"]] }
    },
    {
      "type": "FOOTER",
      "text": "JusMia — IA Jurídica"
    },
    {
      "type": "BUTTONS",
      "buttons": [
        { "type": "QUICK_REPLY", "text": "Ver detalhes" },
        { "type": "QUICK_REPLY", "text": "Ligar para advogado" },
        { "type": "URL", "text": "Acessar portal", "url": "https://..." },
        { "type": "COPY_CODE", "text": "Copiar código", "example": ["PIX123"] }
      ]
    }
  ]
}
```

> **Atenção:** Header de mídia usa `format: "IMAGE"/"VIDEO"/"DOCUMENT"` e `example.header_handle` com a URL da mídia (não `header_text`).

---

## 7. Execução em Runtime — Flow Builder

### Nós aceitos pelo FlowExecutor

```typescript
// services/flow-engine/flow-executor.ts → executeNode()
case "TEMPLATE":
case "WHATSAPP_TEMPLATE":
  return this.handleTemplate(node, flow, bridge, directlyAfterButton);
```

### `handleTemplate()` — passo a passo

**Arquivo:** `services/flow-engine/flow-executor.ts` → `handleTemplate()`

```
1. GUARD: config.status !== "APPROVED" → log.warn + pula (findNextNodeId)
2. GUARD: !config.templateName → log.warn + pula

3. Resolver variáveis do BODY:
   - Para cada varName em config.body.variables:
     - prioridade: runtimeVariables[varName] > this.resolver.resolve("{{varName}}")

4. Resolver variáveis do HEADER (se TEXT):
   - Mesma lógica do body

5. Se runtimeMediaUrl → sobrescreve header.mediaUrl

6. Se runtimeButtonParams → sobrescreve COPY_CODE.exampleCode nos botões

7. Mapear QUICK_REPLY buttons → flow_button_* IDs:
   - Busca edges saindo do nó template com e.buttonId
   - Mapeia por ORDEM: quickReplyButtons[i] → templateEdges[i].buttonId
   - Resultado: buttonPayloads = { índice: "flow_button_..." }

8. buildChatwitTemplateParams(effectiveConfig, variableValues, buttonPayloads)
   → ChatwitTemplateParams (formato nativo Chatwit)

9. deliver(bridge, { type: "template", templatePayload })
   → SEMPRE via API async (templates nunca vão na ponte sync)

10. Se tem botões QUICK_REPLY → return "WAITING_INPUT"
    Se não → return findNextNodeId(flow, node)
```

> **Importante:** O nó TEMPLATE é uma **barreira** — após ele, a execução é sempre async.
> Isso porque o Chatwit precisa entregar o template e aguardar o clique do usuário.

### Resolução de variáveis

O `FlowVariableResolver` busca variáveis na seguinte ordem de prioridade:

1. **`runtimeVariables`** — injetadas pelo nó (override máximo)
2. **Contexto do flow** — `{{nome_lead}}`, `{{telefone}}`, `{{cidade}}` etc.
3. **Fallback** — `{{nome_variavel}}` (texto literal, indica variável não resolvida)

---

## 8. Formato Nativo Chatwit (`template_params`)

### Interface: `ChatwitTemplateParams` (`lib/flow-builder/templateElements.ts`)

```typescript
interface ChatwitTemplateParams {
  name: string;        // nome do template (ex: "boas_vindas_oab")
  language: string;    // código do idioma (ex: "pt_BR")
  processed_params: {
    body?: Record<string, string>;   // { "nome": "João", "data": "10/03/2026" }
    header?: Record<string, string>; // TEXT: { "var": valor } | MÍDIA: { media_url, media_type }
    buttons?: Array<{
      type: string;      // "COPY_CODE" | "URL" | "QUICK_REPLY"
      parameter: string; // valor a injetar no botão
    }>;
  };
}
```

### `buildChatwitTemplateParams()` — lógica

- **Body:** `{ varName: resolvedValue }` para NAMED format
- **Header TEXT:** `{ varName: resolvedValue }` para variáveis
- **Header MÍDIA:** `{ media_url: "https://...", media_type: "image" }`
- **Botões COPY_CODE:** `{ type: "coupon_code", parameter: codigoReal }`
- **Botões URL dinâmica:** `{ type: "url", parameter: parteDinamica }`
- **Botões QUICK_REPLY:** `{ type: "quick_reply", parameter: "flow_button_..." }` — o payload retorna quando o usuário clica, permitindo que o Flow Engine retome

### Pipeline no Chatwit (Ruby — lado deles)

```
POST /api/v1/accounts/{id}/conversations/{id}/messages
  body: { content: "[Template: nome]", template_params: ChatwitTemplateParams }
    ↓
  MessageBuilder → additional_attributes.template_params
    ↓
  SendOnWhatsappService detecta template_params
    ↓
  TemplateProcessorService normaliza (suporta NAMED params)
    ↓
  channel.send_template() → WhatsApp Cloud API v22.0+
```

### Como o payload é enviado (`ChatwitDeliveryService.deliverTemplate`)

```typescript
// services/flow-engine/chatwit-delivery-service.ts
const body: ChatwitMessagePayload = {
  content: `[Template: ${templateName}]`, // preview no chat
  message_type: "outgoing",
  template_params: templatePayload,       // ChatwitTemplateParams
};
// POST /api/v1/accounts/{accountId}/conversations/{convId}/messages
```

---

## 9. Sistema Legado — Disparo por Botão

### Arquivo: `worker/processors/button.processor.ts`

O sistema legado usa `MapeamentoBotao` (tabela no banco) para associar cliques de botão a ações. Uma dessas ações é `SEND_TEMPLATE`.

### Fluxo

```
Usuário clica botão (não-flow)
  ↓
ButtonProcessor.process()
  ↓
findActionByButtonId(buttonId, inboxId)
  → MapeamentoBotao onde buttonId + inboxId
  ↓
actionMapping.actionType === "SEND_TEMPLATE"?
  ├─ templateId presente → busca Template no DB → processTemplateForAction()
  │    → whatsappApiManager.sendMessage() [direto, sem Chatwit]
  └─ templateName presente → monta payload manual:
       { type: "template", template: { name, language, components: params } }
       → whatsappApiManager.sendMessage()
```

### Validação de execução

```typescript
case "SEND_TEMPLATE":
  // Só executa se tiver templateId OU templateName
  shouldExecute = Boolean(payload.templateId || payload.templateName);
  break;
```

### Estrutura do `actionPayload` (JSON no banco)

```json
{
  "templateId": "clxyz123...",
  "templateName": null,
  "parameters": []
}
// ou
{
  "templateId": null,
  "templateName": "meu_template_oficial",
  "parameters": [
    { "type": "body", "parameters": [{ "type": "text", "text": "João" }] }
  ]
}
```

### Diferença crucial para o Flow Builder

| Aspecto | Flow Builder | Sistema Legado |
|---|---|---|
| API usada | Chatwit Bot API (`ChatwitDeliveryService`) | WhatsApp Cloud API direta (`whatsappApiManager`) |
| Resolução de variáveis | `FlowVariableResolver` (contexto do flow) | Manual — `parameters` hardcoded no payload |
| Status de aprovação | Verificado em runtime (`config.status !== "APPROVED"`) | Não verificado em runtime |
| Payloads de botão | `flow_button_*` injetados automaticamente | Não aplicável |
| Retry | Via retry do Flow Engine | Via BullMQ worker |

---

## 10. Diagrama End-to-End

### Flow Builder (produção)

```
[Usuário cria template no UI]
  ↓ toMetaTemplatePayload()
  ↓ POST /{businessId}/message_templates (Meta Graph API)
  ↓ status: PENDING → poll automático → APPROVED

[Flow executa nó TEMPLATE]
  ↓ FlowExecutor.handleTemplate()
  ↓ Guard: APPROVED + templateName ✓
  ↓ Resolve {{variáveis}} do contexto
  ↓ Mapeia QUICK_REPLY → flow_button_* IDs
  ↓ buildChatwitTemplateParams()
  ↓ ChatwitDeliveryService.deliverTemplate()
  ↓ POST /messages { template_params: ... }
  ↓ Chatwit → SendOnWhatsappService → TemplateProcessorService
  ↓ WhatsApp Cloud API v22.0+
  ↓ Usuário recebe template no WhatsApp

[Usuário clica botão QUICK_REPLY]
  ↓ WhatsApp → Chatwit webhook → Socialwise webhook
  ↓ buttonId.startsWith("flow_button_")
  ↓ FlowOrchestrator.handle() → resume FlowSession (WAITING_INPUT → próximo nó)
```

### Sistema Legado (botão não-flow)

```
[Usuário clica botão não-flow]
  ↓ Webhook do Chatwit detecta buttonId
  ↓ ButtonProcessor.process()
  ↓ MapeamentoBotao lookup (DB)
  ↓ actionType === "SEND_TEMPLATE"
  ↓ Busca Template no DB (se templateId) ou usa templateName direto
  ↓ whatsappApiManager.sendMessage() → WhatsApp Cloud API direta
```

---

## 11. Arquivos de Referência

| Arquivo | Propósito |
|---|---|
| [types/flow-builder/templates.ts](../types/flow-builder/templates.ts) | Interfaces TemplateButton, TemplateHeader, TemplateBody, limites |
| [types/flow-builder/nodes.ts](../types/flow-builder/nodes.ts) | TemplateNodeData (L187) |
| [lib/flow-builder/templateElements.ts](../lib/flow-builder/templateElements.ts) | Validação + conversão + `buildChatwitTemplateParams()` + `toMetaTemplatePayload()` |
| [services/flow-engine/flow-executor.ts](../services/flow-engine/flow-executor.ts) | `handleTemplate()` (L971) — runtime do Flow Engine |
| [services/flow-engine/chatwit-delivery-service.ts](../services/flow-engine/chatwit-delivery-service.ts) | `deliverTemplate()` (L281) — entrega via Chatwit API |
| [worker/processors/button.processor.ts](../worker/processors/button.processor.ts) | `executeSendTemplateAction()` — sistema legado |
| [app/api/admin/mtf-diamante/templates/route.ts](../app/api/admin/mtf-diamante/templates/route.ts) | CRUD de templates |
| [app/admin/templates/components/](../app/admin/templates/components/) | UI: `unified-template-creator.tsx`, `unified-template-editor.tsx` |
| [prisma/schema.prisma](../prisma/schema.prisma) | Modelos Template + WhatsAppOfficialInfo |

---

## Notas de Design

### Por que templates são sempre async no Flow Builder?

Templates nunca usam a ponte sync (30s) porque:
1. O Chatwit precisa processar o `template_params` via `TemplateProcessorService`
2. A entrega pelo WhatsApp pode demorar (Meta pode enfileirar)
3. Botões QUICK_REPLY precisam que o Chatwit registre o `additional_attributes.template_params` para retornar o payload correto no clique

### Por que `buildChatwitTemplateParams` em vez de `buildTemplateDispatchPayload`?

`buildTemplateDispatchPayload` está **deprecated** — era o formato antigo de envio direto para a WhatsApp Cloud API. O novo formato usa `ChatwitTemplateParams` que é processado nativamente pelo `SendOnWhatsappService` do Chatwit (Ruby), garantindo a separação arquitetural Socialwise ↔ Chatwit.

### IDs de botão de template

- Botões de template usam prefixo `flow_tpl_btn_` (internos ao template)
- Edges que conectam o nó TEMPLATE ao próximo nó usam prefixo `flow_button_` 
- O `handleTemplate()` mapeia `flow_tpl_btn_*` → `flow_button_*` por ordem de aparição nos QUICK_REPLY buttons
- Quando o usuário clica, o WhatsApp retorna o `flow_button_*` como payload, e o FlowOrchestrator usa esse ID para retomar a sessão
