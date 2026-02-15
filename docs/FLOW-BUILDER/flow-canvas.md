# Flow Canvas - Contexto para LLM

> Documento de referência para implementação e manutenção do Flow Builder.
> Para detalhes da API de Templates WhatsApp, consulte [whatsapp-templates-api.md](./whatsapp-templates-api.md).

---

## Status da Implementação

### Fase 1: Implementação Inicial (COMPLETO - MAS PRECISA REFATORAÇÃO)

**O que foi implementado:**
| Arquivo | O que faz |
|---------|-----------|
| `types/flow-builder.ts` | Adicionado `TEMPLATE` ao enum `FlowNodeType`, interfaces `TemplateNodeData`, `TemplateButton`, `TemplateHeader`, `TemplateBody`, `TemplateFooter` |
| `nodes/TemplateNode.tsx` | Nó visual com badge de status, preview WhatsApp, handles para botões |
| `dialogs/TemplateConfigDialog.tsx` | Dialog com 2 modos: Import (templates aprovados) e Create (criar do zero) |
| `lib/flow-builder/templateElements.ts` | Funções helper: validação, geração de IDs, payloads Meta API |
| `flow-executor.ts` | Método `handleTemplate()` para execução de templates no flow |
| `FlowCanvas.tsx` | Registro do TemplateNode no nodeTypes |
| `FlowBuilderTab.tsx` | Integração do TemplateConfigDialog |

**Problema:** A implementação atual usa um ÚNICO nó `TemplateNode` genérico com dialog de configuração.

---

## REFATORAÇÃO NECESSÁRIA: Containers por Tipo de Template

### Visão do Usuário

O usuário quer uma abordagem diferente, similar ao modelo de elementos do Flow Builder:

```
┌─────────────────────────────────────┐
│  📋 BUTTON TEMPLATE                 │  ← Container específico por tipo
├─────────────────────────────────────┤
│  Elementos                          │
│                                     │
│  ⬜ Body                            │  ← Elemento arrastável
│     Texto principal (obrigatório)   │
│                                     │
│  ⬜ Botão                           │  ← Elemento arrastável (ponto de conexão)
│     Um botão                        │
│                                     │
├─────────────────────────────────────┤
│  Arraste elementos para o Button    │
│  Template                           │
└─────────────────────────────────────┘
```

### Tipos de Container Template

Cada tipo de template WhatsApp deve ter seu próprio container na paleta:

| Container | Elementos | Max Buttons | Caso de Uso |
|-----------|-----------|-------------|-------------|
| **Button Template** | Body + Botões | 10 QUICK_REPLY | Respostas simples |
| **Coupon Template** | Body + Botão COPY_CODE | 1 COPY_CODE | Chaves PIX, cupons |
| **Call Template** | Body + Botão PHONE | 1 PHONE_NUMBER | Ligação direta |
| **URL Template** | Body + Botão URL | 2 URL | Links externos |
| **Carousel Template** | Cards + Botões | 2 por card | Vitrine produtos |
| **LTO Template** | Body + Countdown + Botão | 1 COPY_CODE | Ofertas limitadas |
| **List Template** | Body + Seções + Items | N/A | Menus interativos |

### Estrutura de Arquivos Proposta

```
nodes/templates/
├── ButtonTemplateNode.tsx      # Container Button Template
├── CouponTemplateNode.tsx      # Container Coupon/PIX
├── CallTemplateNode.tsx        # Container Ligação
├── UrlTemplateNode.tsx         # Container Links
├── CarouselTemplateNode.tsx    # Container Carrossel
├── LtoTemplateNode.tsx         # Container Oferta Limitada
├── ListTemplateNode.tsx        # Container Lista
│
└── elements/                   # Elementos arrastáveis
    ├── BodyElement.tsx         # Texto obrigatório
    ├── HeaderElement.tsx       # Header opcional (texto/mídia)
    ├── FooterElement.tsx       # Footer opcional
    ├── QuickReplyButton.tsx    # Botão resposta rápida
    ├── UrlButton.tsx           # Botão URL
    ├── PhoneButton.tsx         # Botão ligação
    ├── CopyCodeButton.tsx      # Botão copiar código
    └── CarouselCard.tsx        # Card do carrossel
```

### Comportamento Esperado

1. **Paleta**: Cada tipo de template aparece como item separado
2. **Drag & Drop**: Arrastar container para canvas cria nó vazio
3. **Elementos**: Arrastar elementos da sub-paleta para dentro do container
4. **Validação**: Cada container valida seus elementos específicos
5. **Handles**: Cada botão cria handle de saída para conexão

### Exemplo: Button Template

```typescript
// types/flow-builder.ts
export interface ButtonTemplateNodeData extends FlowNodeDataBase {
  // Status de aprovação
  status: TemplateApprovalStatus;

  // Elementos dentro do container
  body: {
    text: string;
    variables?: string[];
  };

  buttons: Array<{
    id: string;
    text: string;  // Max 20 chars
  }>;  // Max 10 QUICK_REPLY

  // Meta API
  templateName?: string;
  metaTemplateId?: string;
}

// Validação específica
export const BUTTON_TEMPLATE_LIMITS = {
  bodyMaxLength: 1024,
  buttonTextMaxLength: 25,
  maxButtons: 10,
  buttonType: 'QUICK_REPLY' as const,
};
```

### Fluxo de Criação

```
1. Usuário arrasta "Button Template" → Canvas
   └── Cria container vazio

2. Usuário arrasta "Body" → Dentro do container
   └── Adiciona elemento Body

3. Usuário arrasta "Botão" → Dentro do container
   └── Adiciona botão com handle de saída

4. Usuário preenche textos → Double-click nos elementos
   └── Abre inline editor ou dialog

5. Usuário clica "Enviar para Aprovação"
   └── Gera payload Meta API → POST /message_templates
   └── Atualiza status para PENDING

6. Webhook de status → Atualiza para APPROVED/REJECTED
```

### Integração com Paleta

```typescript
// types/flow-builder.ts - Nova seção na paleta
export const TEMPLATE_PALETTE_ITEMS: PaletteItem[] = [
  {
    type: FlowNodeType.BUTTON_TEMPLATE,
    icon: '📋',
    label: 'Button Template',
    description: 'Mensagem com 1-3 botões',
    category: 'template',
  },
  {
    type: FlowNodeType.COUPON_TEMPLATE,
    icon: '🎟️',
    label: 'Coupon Template',
    description: 'Chave PIX ou cupom copiável',
    category: 'template',
  },
  {
    type: FlowNodeType.CALL_TEMPLATE,
    icon: '📞',
    label: 'Call Template',
    description: 'Botão para ligação',
    category: 'template',
  },
  // ... outros
];

export const TEMPLATE_ELEMENT_ITEMS: ElementItem[] = [
  {
    type: 'body',
    icon: '📝',
    label: 'Body',
    description: 'Texto principal (obrigatório)',
  },
  {
    type: 'button_quick_reply',
    icon: '🔘',
    label: 'Botão',
    description: 'Um botão (ponto de conexão)',
  },
  // ... outros elementos
];
```

---

## Arquitetura de Arquivos

### Core Components
| Arquivo | Responsabilidade |
|---------|------------------|
| `app/admin/mtf-diamante/components/FlowBuilderTab.tsx` | Container principal, state management, dialogs |
| `app/admin/mtf-diamante/components/flow-builder/FlowCanvas.tsx` | Canvas ReactFlow, handlers de eventos |
| `app/admin/mtf-diamante/components/flow-builder/panels/NodePalette.tsx` | Paleta lateral (drag source) |
| `app/admin/mtf-diamante/components/flow-builder/panels/NodeDetailDialog.tsx` | Dialog de configuração de nós |
| `types/flow-builder.ts` | Tipos, enums, validações, paletas |
| `types/flow-engine.ts` | Tipos de execução do engine |
| `services/flow-engine/flow-executor.ts` | Executor de flows |

### Nós Implementados

**WhatsApp:**
| Nó | Arquivo | Função |
|---|---|---|
| `InteractiveMessageNode` | `nodes/InteractiveMessageNode.tsx` | Mensagem interativa (header/body/footer/buttons) |
| `TemplateNode` | `nodes/TemplateNode.tsx` | **ATUAL** - Template genérico (REFATORAR) |
| `StartNode` | `nodes/StartNode.tsx` | Ponto de entrada |
| `DelayNode` | `nodes/DelayNode.tsx` | Aguardar X segundos |
| `TransferNode` | `nodes/TransferNode.tsx` | Handoff humano |
| `TagNode` | `nodes/TagNode.tsx` | Adicionar tag |
| `EndNode` | `nodes/EndNode.tsx` | Finalizar conversa |

**Instagram/Messenger:**
| Nó | Arquivo | Função |
|---|---|---|
| `QuickRepliesNode` | `nodes/QuickRepliesNode.tsx` | Até 13 quick replies |
| `CarouselNode` | `nodes/CarouselNode.tsx` | Até 10 cards com botões |
| `InteractiveMessageNode` | (reaproveitado) | Button Template (sem header/footer) |

### Componentes Auxiliares
```
components/shared/
├── MinIOMediaUpload.tsx     # Upload de mídia para MinIO
├── ButtonManager.tsx        # Gerenciador de botões com drag
├── dnd/SortableItem.tsx     # Wrapper @dnd-kit para reordenação
```

---

## Divisão WhatsApp vs Instagram/Messenger

### Paleta (NodePalette.tsx)
```typescript
const paletteItems = isInstagramChannel(channelType)
  ? INSTAGRAM_PALETTE_ITEMS  // Quick Replies, Carousel, Button Template
  : PALETTE_ITEMS;           // Interactive Message + elementos
```

### Validações (types/flow-builder.ts)
```typescript
// WhatsApp
WHATSAPP_VALIDATION = {
  interactiveMessage: { maxButtons: 3, bodyMaxLength: 1024 }
}

// Instagram/Messenger
INSTAGRAM_VALIDATION = {
  quickReplies: { maxCount: 13, titleMaxLength: 20 },
  genericTemplate: { maxElements: 10, maxButtonsPerElement: 3 }
}
```

### Detecção de Canal
```typescript
// types/interactive-messages.ts
export function isInstagramChannel(channelType?: string): boolean {
  return channelType === 'Channel::Instagram' ||
         channelType === 'Channel::FacebookPage';
}
```

---

## API de Templates WhatsApp

### Endpoints
```
GET  /api/admin/mtf-diamante/templates           # Lista templates (cache)
GET  /api/admin/mtf-diamante/templates?refresh=true  # Força sync com Meta
POST /api/admin/mtf-diamante/templates           # Cria template
```

### Sync com Meta
```typescript
// Endpoint: https://graph.facebook.com/v22.0/{WABA_ID}/message_templates
// Fields: name,status,category,language,components,parameter_format
```

### Formato de Parâmetros
- **NAMED**: `{{nome_lead}}`, `{{id_pedido}}` - Semântico, recomendado
- **POSITIONAL**: `{{1}}`, `{{2}}` - Legado

---

## Configurações WhatsApp Atuais

**Arquivo**: `app/admin/mtf-diamante/components/ConfiguracoesLoteTab.tsx`

Campos armazenados:
- `whatsappBusinessAccountId` (WABA ID)
- `whatsappPhoneNumberId` (Phone Number ID)
- `metaAccessToken` (Token de acesso)

**Uso no sistema:**
```typescript
// lib/config/meta-api.ts ou similar
const config = {
  fbGraphApiBase: 'https://graph.facebook.com/v22.0',
  wabaId: credentials.whatsappBusinessAccountId,
  phoneId: credentials.whatsappPhoneNumberId,
  token: credentials.metaAccessToken
};
```

---

## Payload de Envio de Template

### Estrutura Base
```json
{
  "messaging_product": "whatsapp",
  "to": "5511999999999",
  "type": "template",
  "template": {
    "name": "nome_template_aprovado",
    "language": { "code": "pt_BR" },
    "components": [
      {
        "type": "body",
        "parameters": [
          { "type": "text", "parameter_name": "nome", "text": "João" }
        ]
      }
    ]
  }
}
```

### Coupon Code (PIX)
```json
{
  "type": "button",
  "sub_type": "COPY_CODE",
  "index": 0,
  "parameters": [
    { "type": "coupon_code", "coupon_code": "CHAVE-PIX-AQUI" }
  ]
}
```

---

## Arquivos de Referência

| Arquivo | Conteúdo |
|---------|----------|
| `docs/interative_message_flow_builder.md` | Roadmap original do Flow Builder |
| `docs/chatwit-contrato-async-30s.md` | Contrato assíncrono com Chatwit |
| `lib/flow-builder/exportImport.ts` | Import/Export de flows |
| `lib/flow-builder/syncFlow.ts` | Sincronização com banco |
| `lib/flow-builder/templateElements.ts` | **NOVO** - Helpers para templates |

---

## Código Implementado (Referência)

### Arquivos Criados na Fase 1

**`lib/flow-builder/templateElements.ts`**
- `TEMPLATE_BUTTON_PREFIX = 'flow_tpl_btn_'`
- `generateTemplateButtonId()` - Gera ID único para botões
- `validateTemplateNodeData()` - Valida template completo
- `extractVariables()` - Extrai variáveis `{{nome}}`
- `toMetaTemplatePayload()` - Converte para payload de criação Meta
- `buildTemplateDispatchPayload()` - Converte para payload de envio

**`nodes/TemplateNode.tsx`**
- Badge de status (APPROVED/PENDING/REJECTED/DRAFT)
- Preview do template
- Handles de saída para botões QUICK_REPLY
- Context menu (duplicar/deletar)

**`dialogs/TemplateConfigDialog.tsx`**
- Modo Import: Lista templates aprovados
- Modo Create: Form header/body/footer/buttons
- Preview WhatsApp
- Enviar para Meta API

---

## Notas de Implementação

### Regras Críticas
1. Templates só disparam se `status === 'APPROVED'`
2. Coupon code máximo **15 caracteres**
3. Botão de copiar **não funciona** no WhatsApp Web
4. Carrossel exige **simetria total** entre cards
5. LTO (oferta limitada) só funciona no **app móvel**

### Extração de Variáveis
```typescript
// Ao criar interface de template, extrair exemplos:
component.example?.body_text_named_params // Para NAMED
component.example?.body_text              // Para POSITIONAL
```

### IDs Importantes
```
WABA_ID (Conta Business) → Criar templates
PHONE_NUMBER_ID → Enviar mensagens
CATALOG_ID → Produtos (MPM/SPM/Carrossel)
```

---

## Próximos Passos (Para Outra LLM)

### Prioridade 1: Refatorar para Containers

1. **Criar novos tipos no enum `FlowNodeType`:**
   - `BUTTON_TEMPLATE`
   - `COUPON_TEMPLATE`
   - `CALL_TEMPLATE`
   - `URL_TEMPLATE`
   - (Manter `TEMPLATE` como deprecated/fallback)

2. **Criar interfaces específicas:**
   - `ButtonTemplateNodeData`
   - `CouponTemplateNodeData`
   - etc.

3. **Criar componentes de nó:**
   - Cada container aceita drop de elementos específicos
   - Elementos são sub-componentes dentro do nó
   - Handles dinâmicos baseados nos botões adicionados

4. **Atualizar paleta:**
   - Nova seção "Templates" com os containers
   - Sub-paleta de elementos quando container selecionado

5. **Manter helpers existentes:**
   - `templateElements.ts` pode ser reaproveitado
   - Apenas adaptar para novos tipos

### Prioridade 2: Testes

1. Testar drag & drop de container
2. Testar drag & drop de elementos no container
3. Testar geração de payload Meta API
4. Testar execução no flow-executor

### Arquivos para Modificar

```
types/flow-builder.ts          # Novos enums e interfaces
panels/NodePalette.tsx         # Nova seção de templates
FlowCanvas.tsx                 # Novos nodeTypes
flow-executor.ts               # Novos handlers
```
