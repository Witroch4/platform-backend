# WhatsApp Templates no Flow Builder

> Referência compacta para LLMs codificando nós de template no Flow Canvas.

## Arquitetura

```
Canvas Node (React Flow)
  ├── data.status: DRAFT | PENDING | APPROVED | REJECTED
  ├── data.metaTemplateId: string (ID retornado pela Meta)
  ├── data.templateName: snake_case (nome na Meta)
  └── data.elements: InteractiveMessageElement[] (sistema unificado)

Fluxo de criação:
  Drag → Configure → POST /templates → Meta retorna {id, status:PENDING}
  → node.data.metaTemplateId = result.result.id || result.template.id
  → polling 30s (auto) ou ↻ manual → GET /templates/[caixaId]/[metaId]/status
  → status muda → node.data.status atualiza → badge + lock/unlock
```

## Template WhatsApp Unificado

A partir da v3.5, todos os tipos de template foram unificados em um único nó **Template WhatsApp** (`WHATSAPP_TEMPLATE`).

| Tipo | Componente | Cor |
|---|---|---|
| `whatsapp_template` | WhatsAppTemplateNode | emerald |

### Tipos de Botão Suportados

| Tipo | Descrição | Máximo | Ícone |
|---|---|---|---|
| `COPY_CODE` | Copiar código/cupom | 1 | Copy |
| `VOICE_CALL` | Ligar via WhatsApp | 1 | PhoneCall |
| `PHONE_NUMBER` | Ligar (telefone) | 1 | Phone |
| `URL` | Abrir link | 2 | Link |
| `QUICK_REPLY` | Resposta rápida | 10 | ChevronRight |

### Regras de Combinação (Meta API)

1. **Máximo 10 botões** no total
2. **Máximo 1 de cada CTA**: COPY_CODE, PHONE_NUMBER, VOICE_CALL
3. **Máximo 2 URLs**
4. **PHONE_NUMBER e VOICE_CALL são mutuamente exclusivos** (não podem coexistir)
5. **Ordem obrigatória** (auto-sort aplicado pela API):
   ```
   COPY_CODE → VOICE_CALL → PHONE_NUMBER → URL → QUICK_REPLY
   ```

> O erro `2388158` da Meta ocorre por botões intercalados, NÃO por tipo incompatível.

## Arquivos-chave

```
types/flow-builder.ts                    # Tipos: WhatsAppTemplateNodeData, WHATSAPP_TEMPLATE_LIMITS
lib/flow-builder/templateElements.ts     # Validação, payload Meta, factories
lib/flow-builder/interactiveMessageElements.ts  # Sistema unificado de elements

# Nó do canvas (unificado)
app/admin/mtf-diamante/components/flow-builder/nodes/templates/
  └── WhatsAppTemplateNode.tsx           # Aceita todos os tipos de botão

# Dialog de config (abre no double-click)
app/admin/mtf-diamante/components/flow-builder/dialogs/TemplateConfigDialog.tsx

# Hooks
app/admin/mtf-diamante/components/flow-builder/hooks/useTemplateStatusRefresh.ts
app/admin/mtf-diamante/components/flow-builder/hooks/useFlowCanvas.ts

# Contexto (provê caixaId para nós)
app/admin/mtf-diamante/components/flow-builder/context/FlowBuilderContext.tsx

# APIs
app/api/admin/mtf-diamante/templates/route.ts                         # GET list, POST create
app/api/admin/mtf-diamante/templates/[caixaId]/[templateId]/status/route.ts  # GET status
```

## Node Data — WhatsAppTemplateNodeData

```typescript
interface WhatsAppTemplateNodeData {
  label: string;
  status?: 'APPROVED' | 'PENDING' | 'REJECTED' | 'DRAFT';  // default DRAFT
  metaTemplateId?: string;     // ID na Meta (ex: "3398485800300653")
  templateName?: string;       // snake_case, padrão /^[a-z][a-z0-9_]*$/
  category?: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';
  language?: string;           // ex: "pt_BR"
  elements?: InteractiveMessageElement[];  // sistema unificado
  body?: { text: string; variables?: string[] };
  buttons?: TemplateButton[];  // Array com todos os tipos de botão
}

interface TemplateButton {
  id: string;
  type: 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER' | 'COPY_CODE' | 'VOICE_CALL';
  text: string;
  url?: string;           // para URL
  phoneNumber?: string;   // para PHONE_NUMBER
  exampleCode?: string;   // para COPY_CODE (max 15 chars)
  ttlMinutes?: number;    // para VOICE_CALL (padrão: 10080 = 7 dias)
}
```

## Limites (WHATSAPP_TEMPLATE_LIMITS)

```typescript
export const WHATSAPP_TEMPLATE_LIMITS = {
  bodyMaxLength: 1024,
  buttonTextMaxLength: 25,
  couponCodeMaxLength: 15,
  phoneNumberPattern: /^\+[1-9]\d{1,14}$/,
  maxButtons: 10,
  maxCopyCodeButtons: 1,
  maxUrlButtons: 2,
  maxPhoneButtons: 1,
  maxVoiceCallButtons: 1,
  phoneAndVoiceCallMutuallyExclusive: true,
  voiceCallDefaultTtlMinutes: 10080, // 7 dias
} as const;
```

## Tipos de Element (Drag & Drop)

| Element Type | Descrição | Campos |
|---|---|---|
| `header_text` | Cabeçalho texto | `{ text: string }` |
| `header_image` | Cabeçalho imagem | `{ url: string, caption?: string }` |
| `body` | Corpo da mensagem | `{ text: string }` |
| `button` | Resposta rápida | `{ title: string }` |
| `button_url` | Botão URL | `{ title: string, url: string }` |
| `button_phone` | Botão telefone | `{ title: string, phoneNumber: string }` |
| `button_copy_code` | Botão copiar código | `{ title: string, couponCode: string }` |
| `button_voice_call` | Botão ligar WhatsApp | `{ title: string, ttlMinutes: number }` |

## Prefixos de ID de botão

```
flow_tpl_btn_*  → Template buttons (gerado por generateTemplateButtonId())
flow_button_*   → Interactive message buttons
flow_*          → Qualquer botão do Flow Builder → FlowOrchestrator no webhook
(sem prefixo)   → Legacy → MapeamentoBotao lookup
```

## Lock por Status

```typescript
const isLocked = status === 'APPROVED' || status === 'PENDING';
// Quando isLocked:
//   - EditableText readOnly, inputs disabled
//   - Botões de remover/duplicar escondidos
//   - Drag & drop desabilitado
//   - Opacidade reduzida nos elementos
```

| Status | Pode Editar | Ações |
|---|---|---|
| DRAFT | Tudo | Salvar rascunho, Enviar para Meta |
| PENDING | Nada estrutural | Duplicar como Novo, ↻ Refresh |
| APPROVED | Nada estrutural | Duplicar como Novo |
| REJECTED | Tudo | Salvar rascunho, Reenviar |

## useTemplateStatusRefresh

```typescript
const { isRefreshing, refreshStatus, canRefresh } = useTemplateStatusRefresh({
  nodeId: id,
  metaTemplateId: data.metaTemplateId,
  templateName: data.templateName,  // usado pra auto-recuperar metaTemplateId do banco
  status,
  pollInterval: 30_000,             // 0 desabilita
});
```

Comportamento:
- **Auto-recuperação**: se `metaTemplateId` ausente + `templateName` + status PENDING/APPROVED → busca da API GET /templates pelo nome
- **Polling**: status PENDING → primeira check 5s, depois a cada 30s (silent)
- **Manual**: `refreshStatus()` → toast com resultado
- **Pré-req**: `FlowBuilderProvider` com `caixaId` wrapping o canvas (feito em FlowBuilderTab)

## API — POST /api/admin/mtf-diamante/templates

```typescript
// Request body
{
  name: string,           // snake_case
  category: TemplateCategory,
  language: string,
  components: [{
    type: 'BODY', text: string
  }, {
    type: 'BUTTONS', buttons: [
      { type: 'COPY_CODE', text: string, example: [string] },
      { type: 'VOICE_CALL', text: string, ttl_minutes: number },
      { type: 'PHONE_NUMBER', text: string, phone_number: string },
      { type: 'URL', text: string, url: string },
      { type: 'QUICK_REPLY', text: string }
    ]
  }],
  parameter_format: 'NAMED'
}

// Response
{
  success: true,
  result: { id: '339...', status: 'PENDING', category: 'MARKETING' },
  template: { id: '339...', name: 'meu_template', status: 'PENDING' }
}

// ⚠️ metaTemplateId = result.result.id || result.template.id (NÃO result.metaTemplateId)
```

### Auto-sort de Botões

A API aplica ordenação automática antes de enviar para a Meta:

```typescript
const buttonOrder: Record<string, number> = {
  COPY_CODE: 0,
  VOICE_CALL: 1,
  PHONE_NUMBER: 2,
  URL: 3,
  QUICK_REPLY: 4,
};
```

### Validações da API

1. Exclusão mútua PHONE_NUMBER/VOICE_CALL
2. Limites por tipo de botão
3. Nome snake_case

## API — GET .../templates/[caixaId]/[metaTemplateId]/status

```typescript
// Response
{
  success: true,
  templateId: string, name: string, status: string,
  category: string, qualityScore: string | null,
  rejectionReason: string | null,
  previousStatus: string, statusChanged: boolean
}
// Se statusChanged → já atualiza DB automaticamente
```

## TemplateConfigDialog — Handlers principais

| Handler | Ação |
|---|---|
| `handleImportTemplate()` | Importa template APPROVED da Meta → `mode:'import'` |
| `handleSaveTemplate()` | Salva rascunho local → `status:'DRAFT'` |
| `handleSubmitToMeta()` | POST → `status:'PENDING'` + `metaTemplateId` |
| `handleDuplicate()` | Reset pra DRAFT, limpa IDs, `templateName_v{N}` |
| `handleRefreshStatus()` | GET status → atualiza se mudou |

## templateElements.ts — Exports principais

| Export | Uso |
|---|---|
| `TEMPLATE_BUTTON_PREFIX` | `'flow_tpl_btn_'` |
| `generateTemplateButtonId()` | `flow_tpl_btn_{ts}_{rand}` |
| `validateTemplateNodeData(data)` | `{ valid, errors, warnings }` |
| `validateTemplateButtons(buttons)` | Valida limites, exclusão mútua |
| `toMetaTemplatePayload(data, cat)` | NodeData → payload da Meta API |
| `buildTemplateDispatchPayload()` | NodeData → payload de envio |
| `createDefaultTemplateNodeData()` | Defaults: DRAFT, MARKETING, pt_BR |
| `createTemplateButton(type, text)` | Cria botão com defaults (ttlMinutes para VOICE_CALL) |
| `extractVariables(text)` | `{{name}}` → `['name']` |

## Padrão de edição inline nos nós

WhatsAppTemplateNode segue o padrão:
1. `getInteractiveMessageElements(data)` → array de elements
2. `updateElementContent(elementId, partial)` → `setNodes()` com merge
3. `handleRemoveElement(elementId)` → filter + `elementsToLegacyFields()`
4. Cada botão tem um `<Handle type="source">` com `id={btn.id}` pra edges
5. `<NodeContextMenu>` wraps tudo (duplicar/deletar nó)
6. `<EditableText>` pra edição inline com `readOnly={isLocked}`
7. Contadores visuais de botões por tipo (limite remaining)

## Cores por Tipo de Botão no Nó

```typescript
const buttonColors: Record<TemplateButtonType, string> = {
  COPY_CODE: 'bg-lime-100 border-lime-300 text-lime-700',
  VOICE_CALL: 'bg-violet-100 border-violet-300 text-violet-700',
  PHONE_NUMBER: 'bg-fuchsia-100 border-fuchsia-300 text-fuchsia-700',
  URL: 'bg-rose-100 border-rose-300 text-rose-700',
  QUICK_REPLY: 'bg-sky-100 border-sky-300 text-sky-700',
};
```

## VOICE_CALL — TTL (Time To Live)

O botão VOICE_CALL permite ligações via WhatsApp com validade configurável:

| TTL | Descrição |
|---|---|
| 1440 min | 1 dia |
| 4320 min | 3 dias |
| 10080 min | 7 dias (padrão) |
| 20160 min | 14 dias |

O TTL define por quanto tempo o botão de ligação fica ativo após o envio da mensagem.

## Gotchas / Armadilhas

1. **metaTemplateId na response**: API retorna em `result.result.id`, NÃO em `result.metaTemplateId`
2. **params é Promise**: Next.js 16 → `const { templateId } = await params`
3. **elements vs legados**: sempre preferir `elements[]`, mas manter sync com campos legados (`body`, `buttons`)
4. **Duplicar reseta IDs**: `metaTemplateId: undefined, status: 'DRAFT'`
5. **FlowBuilderContext pode ser null**: hook é defensivo, não crasha sem Provider
6. **Auto-save**: canvas salva a cada 3s → metaTemplateId persiste mesmo sem save manual
7. **PHONE vs VOICE_CALL**: mutuamente exclusivos — validação na API e no frontend
8. **Erro 2388158**: causado por botões intercalados, não por tipos incompatíveis — API aplica auto-sort
