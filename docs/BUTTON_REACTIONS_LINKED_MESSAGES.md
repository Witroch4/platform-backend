# Reações de Botões e Mensagens Vinculadas - Guia Técnico

> Mini-guia sobre o sistema de reações de botões e importação de mensagens interativas vinculadas no Flow Builder.

## Visão Geral

O sistema permite configurar **reações automáticas** quando um usuário clica em um botão de mensagem interativa. Essas reações podem ser:

| Tipo | Descrição | Exemplo |
|------|-----------|---------|
| **Emoji** | Reação com emoji | ❤️, 👍, 😊 |
| **Texto** | Resposta de texto | "Obrigado pela escolha!" |
| **Handoff** | Transferir para atendente | `handoff` ou `HANDOFF_ACTION` |
| **Mensagem Interativa** | Enviar outra mensagem | `send_interactive:{messageId}` |
| **Template** | Enviar template oficial | `send_template:{templateId}` |

---

## Arquitetura

```
┌─────────────────────────────────────────────────────────────────────┐
│  UI (Preview de Mensagem Interativa)                                │
│  └─ Clica no botão → ButtonReactionPicker abre                      │
│     └─ Seleciona: Emoji | Texto | Transferir | Interativa | Template│
└──────────────────────────────────┬──────────────────────────────────┘
                                   ↓
┌──────────────────────────────────┴──────────────────────────────────┐
│  API: PUT /api/admin/mtf-diamante/messages-with-reactions           │
│  └─ Salva em MapeamentoBotao:                                       │
│     ├─ buttonId: "btn_1757413899416_3lm7amope"                      │
│     ├─ actionType: "BUTTON_REACTION"                                │
│     └─ actionPayload: {                                             │
│         emoji: "❤️",                                                │
│         textReaction: "Texto de resposta",                          │
│         action: "send_interactive:cmfbuy5ns0035o72qn3dmssb9"        │
│       }                                                             │
└──────────────────────────────────┬──────────────────────────────────┘
                                   ↓
┌──────────────────────────────────┴──────────────────────────────────┐
│  Flow Builder - Importação                                          │
│  └─ handleLinkMessageWithReactions()                                │
│     └─ Para cada reação:                                            │
│        ├─ emoji → Cria nó EMOJI_REACTION                            │
│        ├─ textReaction → Cria nó TEXT_MESSAGE                       │
│        ├─ action="handoff" → Cria nó HANDOFF                        │
│        └─ linkedMessageId → Cria nó INTERACTIVE_MESSAGE             │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Modelo de Dados

### MapeamentoBotao (Prisma)

```prisma
model MapeamentoBotao {
  id            String       @id @default(cuid())
  buttonId      String       @unique
  actionType    ActionType   // BUTTON_REACTION
  actionPayload Json         // { emoji?, textReaction?, action? }
  description   String?
  inboxId       String
  createdAt     DateTime     @default(now())
  updatedAt     DateTime     @updatedAt
  inbox         ChatwitInbox @relation(...)
}
```

### actionPayload Structure

```typescript
interface ActionPayload {
  emoji?: string | null;        // "❤️"
  textReaction?: string | null; // "Obrigado!"
  action?: string | null;       // "handoff" | "send_interactive:id" | "send_template:id"
}
```

---

## Extração de linkedMessageId

Quando o `action` contém `send_interactive:{id}` ou `send_template:{id}`, o sistema extrai o ID para criar o nó correspondente.

### Onde acontece a extração:

1. **API** (`messages-with-reactions/route.ts` linha 114-126):
```typescript
let linkedMessageId: string | null = null;
if (action && typeof action === "string") {
  if (action.startsWith("send_interactive:")) {
    linkedMessageId = action.replace("send_interactive:", "");
  } else if (action.startsWith("send_template:")) {
    linkedMessageId = action.replace("send_template:", "");
  }
}
```

2. **SwrProvider** (`SwrProvider.tsx` linha 227-235):
```typescript
let linkedMessageId = reaction.linkedMessageId || reaction.actionPayload?.messageId || null;
if (!linkedMessageId && action && typeof action === "string") {
  if (action.startsWith("send_interactive:")) {
    linkedMessageId = action.replace("send_interactive:", "");
  } else if (action.startsWith("send_template:")) {
    linkedMessageId = action.replace("send_template:", "");
  }
}
```

---

## Fluxo de Importação no Flow Builder

### handleLinkMessageWithReactions

Localização: `FlowBuilderTabHooks.ts` linha 545-651

```typescript
for (const reaction of buttonReactionsForBtn) {
  // 1. Handoff
  const isHandoff = reaction.action === "handoff" || reaction.action === "HANDOFF_ACTION";
  if (isHandoff) {
    createAndConnectNode(FlowNodeType.HANDOFF, {...}, button.id);
  }

  // 2. Mensagem Interativa Vinculada
  const linkedMsgId = reaction.linkedMessageId || reaction.actionPayload?.messageId;
  if (linkedMsgId) {
    const linkedMsg = interactiveMessages?.find((m) => m.id === linkedMsgId);
    if (linkedMsg) {
      createAndConnectNode(FlowNodeType.INTERACTIVE_MESSAGE, {
        messageId: linkedMsg.id,
        message: {...linkedMsg},
        isConfigured: true,
      }, button.id);
    }
  }

  // 3. Texto
  const textContent = reaction.textReaction || reaction.textResponse;
  if (textContent) {
    createAndConnectNode(FlowNodeType.TEXT_MESSAGE, {text: textContent}, button.id);
  }

  // 4. Emoji
  if (reaction.emoji) {
    createAndConnectNode(FlowNodeType.EMOJI_REACTION, {emoji: reaction.emoji}, button.id);
  }
}
```

---

## Arquivos Relevantes

| Arquivo | Responsabilidade |
|---------|------------------|
| `app/api/admin/mtf-diamante/messages-with-reactions/route.ts` | API CRUD de mensagens + reações |
| `app/api/admin/mtf-diamante/button-reactions/route.ts` | API legada de reações |
| `app/admin/mtf-diamante/context/SwrProvider.tsx` | Provider SWR com conversão de dados |
| `app/admin/mtf-diamante/hooks/useInboxButtonReactions.ts` | Hook SWR para carregar reações |
| `app/admin/mtf-diamante/components/flow-builder/hooks/FlowBuilderTabHooks.ts` | Lógica de importação |
| `app/admin/mtf-diamante/components/shared/ButtonReactionPicker.tsx` | UI de seleção de reação |

---

## Tipos TypeScript

### ExtendedReaction

```typescript
// FlowBuilderTabService.ts
export interface ExtendedReaction {
  id?: string;
  messageId: string;
  buttonId: string;
  emoji: string;
  label: string;
  action: string;
  textReaction?: string;
  textResponse?: string;
  linkedMessageId?: string | null;  // ← ID extraído
  actionPayload?: {
    messageId?: string;
    emoji?: string;
    textReaction?: string;
    action?: string;
  } | null;
}
```

---

## Exemplo Prático

### Cenário: Botão "Saber Mais" com mensagem "Mentoria OAB" mapeada

**1. Usuário configura no Preview:**
- Clica no botão "Saber Mais"
- Seleciona aba "Interativas"
- Escolhe "Mentoria OAB"

**2. Dados salvos:**
```json
{
  "buttonId": "btn_1757413899416_3lm7amope",
  "actionType": "BUTTON_REACTION",
  "actionPayload": {
    "action": "send_interactive:cmfbuy5ns0035o72qn3dmssb9"
  }
}
```

**3. Na importação do Flow Builder:**
- API retorna `linkedMessageId: "cmfbuy5ns0035o72qn3dmssb9"`
- Hook busca mensagem por ID em `interactiveMessages`
- Cria nó `INTERACTIVE_MESSAGE` conectado ao botão "Saber Mais"

**4. Resultado visual:**
```
[Mensagem Principal]
    ├─ Botão "Falar Com a Dra" → [Handoff] + [Texto: "Logo mais..."]
    ├─ Botão "Saber Mais" → [Mensagem: Mentoria OAB] ← NOVO!
    └─ Botão "Foi Engano" → [Emoji: 😞] + [Texto: "Até Mais!"]
```

---

## Troubleshooting

### Mensagem vinculada não aparece na importação

1. Verificar se `linkedMessageId` está sendo retornado pela API:
```bash
curl "/api/admin/mtf-diamante/messages-with-reactions?inboxId=XXX&reactionsOnly=true"
```

2. Verificar se a mensagem existe no `interactiveMessages`:
```javascript
console.log(interactiveMessages?.find(m => m.id === linkedMsgId));
```

3. Verificar logs no hook:
```javascript
console.log("linkedMsgId:", linkedMsgId);
console.log("linkedMsg found:", !!linkedMsg);
```

### Handoff não cria nó

Verificar se o `action` é `"handoff"` ou `"HANDOFF_ACTION"` (ambos são aceitos).

---

## Changelog

| Data | Alteração |
|------|-----------|
| 2026-02-18 | Adicionada extração de `linkedMessageId` de `send_interactive:` e `send_template:` |
| 2026-02-18 | Atualizado SwrProvider para converter `linkedMessageId` |
| 2026-02-18 | Corrigida verificação de handoff para aceitar `HANDOFF_ACTION` |
