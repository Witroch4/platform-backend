# Interactive Message Flow Builder — Referência Técnica Compacta

> v3.4.0 | Última atualização: 10/02/2026 | Backup completo: `interative_message_flow_builder.md.bak`

---

## 1. Stack & Arquitetura Atual

| Componente | Tech | Path |
|---|---|---|
| Flow Canvas | `@xyflow/react` v12.8.5 | instalado |
| Agent Canvas (ref) | XY Flow + Dagre | `app/admin/MTFdashboard/components/AgentCanvas.tsx` |
| Interactive Messages | Prisma + API Routes | `app/api/admin/mtf-diamante/` |
| Button Reactions | MapeamentoBotao model | `app/api/admin/mtf-diamante/button-reactions/` |

**Fluxo atual (sem visual):** Template (Prisma) → Interactive Content (body, header, footer, action, genericPayload) → MapeamentoBotao (buttonId → emoji/text/action/message)

---

## 2. Tipos de Mensagens por Canal

### WhatsApp
| Tipo | Max | Notas |
|---|---|---|
| `button` | 3 botões | Quick reply |
| `list` | 10 seções × 10 itens | Menu expansível |
| `cta_url` | 1 | Call-to-action |
| `flow` / `location_request` | N/A | Especiais |

### Instagram
| Tipo | Max | Notas |
|---|---|---|
| `quick_replies` | 13 opções | Respostas rápidas |
| `generic` | 10 elementos | Carousel |
| `button_template` | 3 botões | Botões simples |

### Limites Comparativos

| Campo | WhatsApp | Instagram/Facebook |
|---|---|---|
| Body | 1024 chars | 1000 chars |
| Header texto | 60 chars | — |
| Footer | 60 chars | — |
| Título botão | 20 chars | 20 chars |
| Payload/ID | 256 chars | 1000 chars |
| Botões máx | 3 | 13 (QR) / 3 (BT) |
| Carousel | N/A | 10 elementos |
| Título item lista | 24 chars | — |
| Desc item lista | 72 chars | — |
| Button template body | — | 640 chars |

**Arquivos de constantes:**
- `types/flow-builder.ts` → `CHANNEL_CHAR_LIMITS` (limites visuais canvas)
- `types/interactive-messages.ts` → `MESSAGE_LIMITS`
- `services/openai-components/server-socialwise-componentes/channel-constraints.ts`
- `lib/socialwise/clamps.ts`

---

## 3. Tipos Base (TypeScript)

```typescript
interface InteractiveMessage {
  id?: string; name: string; type: InteractiveMessageType;
  header?: MessageHeader; body: MessageBody; footer?: MessageFooter;
  action?: MessageAction; isActive: boolean;
}

interface MessageAction {
  type: 'button' | 'list' | 'cta_url' | 'flow' | 'carousel';
  buttons?: QuickReplyButton[]; sections?: ListSection[]; elements?: CarouselElement[];
}

interface QuickReplyButton {
  id: string; title: string; payload?: string; type?: 'reply' | 'url' | 'phone_number';
}
```

---

## 4. Prisma: MapeamentoBotao (Legado)

```prisma
model MapeamentoBotao {
  id               String   @id @default(uuid())
  inboxId          String
  buttonId         String
  targetMessageId  String?  // Reação A: enviar outra msg interativa
  actionType       String?  // Reação B: 'add_tag','remove_tag','handoff'...
  actionPayload    Json?
  replyText        String?  // Reação C: texto simples
  @@unique([inboxId, buttonId])
  @@index([inboxId])
}
```

---

## 5. Decisões de Design (UX/UI)

### NodePalette
- Topo: bloco `interactive_message` isolado ("Principal")
- Seção "Elementos": Body, Header, Footer, Botão
- Categoria padrão filtrada para não duplicar container

### InteractiveMessageNode — WYSIWYG
- Edição in-place (Header, Body, Footer, Títulos de Botão) via `EditableText`
- Auto-resize vertical (textarea `scrollHeight` sync)
- Botão expansão (Flowise-style) → Dialog modal para textos longos
- Classe `nodrag` nos inputs para seleção de texto sem drag
- Settings: duplo clique na **barra de título** ou ícone engrenagem (corpo protegido)

### Estrutura de Dados Modular
Migrado de `data.body` estático para `data.elements[]`:
```typescript
interface InteractiveMessageNodeData {
  elements: Array<{ id: string; type: 'header_text'|'body'|'button'|...; [key: string]: any; }>;
}
```

### Limites de Caracteres Visuais (v3.2)
Contador em tempo real para todos os campos editáveis:
- **Barra de progresso**: azul → âmbar (90%) → vermelho (excedido)
- **Contador numérico**: `X/Y` + `(+N)` quando excede
- **Texto vermelho**: indica visualmente o excesso

Limites aplicados (WhatsApp — mais restritivo):
| Campo | Limite |
|---|---|
| Header texto | 60 |
| Body | 1024 |
| Footer | 60 |
| Título botão | 20 |

Implementação:
- `EditableText` aceita `maxLength` prop
- `CHANNEL_CHAR_LIMITS` em `types/flow-builder.ts`
- Botões usam lógica inline (não EditableText)

### Sistema de Edição de Flows (v3.3)
Suporte a múltiplos flows por inbox com CRUD completo:

**FlowSelector** (`FlowSelector.tsx`):
- Lista flows existentes por inbox (ordenados por updatedAt)
- Criar novo flow (dialog com nome)
- Renomear flow existente
- Excluir flow (com validação de sessões ativas)
- Selecionar flow para edição

**APIs**:
- `GET /api/admin/mtf-diamante/flows?inboxId=X` → lista flows
- `POST /api/admin/mtf-diamante/flows` → cria novo flow
- `GET /api/admin/mtf-diamante/flows/[flowId]` → detalhes + canvas
- `PATCH /api/admin/mtf-diamante/flows/[flowId]` → atualiza metadados
- `DELETE /api/admin/mtf-diamante/flows/[flowId]` → remove flow

**useFlowCanvas atualizado**:
- Nova prop `flowId` para carregar flow específico
- `currentFlowMeta` retorna metadados do flow atual
- `loadCanvas()` para carregar canvas manualmente
- Sincronização automática ao mudar `flowId`

**UI/UX**:
- Tela inicial: lista de flows (FlowSelector)
- Ao selecionar/criar: entra no editor visual
- Botão "Voltar" retorna para lista

---

## 6. Context Menus & Operações

### Node-Level (`NodeContextMenu.tsx`)
Duplicar nó inteiro | Deletar nó. Usado em: `InteractiveMessageNode`, `TextMessageNode`, `StartNode`, `ReactionNodes`.

### Element-Level (dentro de InteractiveMessageNode)

| Elemento | Duplicar | Deletar | Limite |
|---|---|---|---|
| Header (text/image) | ❌ | ✅ | 1 total (OU texto OU imagem) |
| Body | ❌ | ✅ | 1 |
| Footer | ❌ | ✅ | 1 |
| Button | ✅ | ✅ | 3 máx |

**Funções-chave em `InteractiveMessageNode.tsx`:**
- `handleRemoveElement(elementId)` — remove + sync legacy fields
- `handleDuplicateElement(elementId)` — só botões, respeita limite
- `updateElementContent(elementId, newContent)` — atualiza conteúdo
- `handleUploadComplete(file)` — callback MinIO

### Botão X no hover
`opacity-0 group-hover:opacity-100` + `stopPropagation()` → `handleRemoveElement()`

---

## 7. Validação de Headers (REGRA CRÍTICA)

**WhatsApp: apenas UM header total (texto OU imagem, NUNCA ambos).**

Validação em `FlowBuilderTab.tsx → handleDropElement()`:
```typescript
if (elementType === 'header_text' || elementType === 'header_image') {
  const hasAnyHeader = currentElements.some(e => e.type === 'header_text' || e.type === 'header_image');
  if (hasAnyHeader) { toast.error(...); return; }
}
```

---

## 8. Upload MinIO (Header Image)

Componente: `components/MinIOMediaUpload.tsx`. Drag-and-drop + preview + progress bar.
**Essencial:** `stopPropagation()` em `onDragOver` e `onDrop` para evitar conflito com canvas.

---

## 9. Validações

### Flow Canvas (`validateFlowCanvas` — `types/flow-builder.ts`)
| Check | Tipo |
|---|---|
| Sem ponto de início | ❌ Erro |
| Nó raiz inválido (deve ser START ou INTERACTIVE_MESSAGE) | ❌ Erro |
| Nós órfãos | ❌ Erro |
| Múltiplos START | ⚠️ Warning |
| Nós não configurados | ⚠️ Warning |

### Drop de Elementos (`FlowBuilderTab.tsx`)
Drop fora de nó | Drop em nó não-interativo | Mensagem vinculada (modo editar) | Header duplicado | Elemento duplicado | Limite botões (3)

### Mensagens Interativas (`lib/validation/interactive-message-validation.ts`)
- Nome obrigatório (máx 255)
- `body.text` obrigatório (exceto `generic`/carousel)
- IDs e títulos de botões: únicos
- Título botão: obrigatório, máx 20 chars
- Validações por tipo: `button` (1-3), `quick_replies` (1-13, body≤1000), `button_template` (1-3, body≤640), `list` (seções+rows obrigatórios)

### Reações de Botão
emoji → não-vazio | text → não-vazio | action → não-vazia

---

## 10. Mapeamento de Intents → Flow

**Fluxo:** IA detecta intent → busca `MapeamentoIntencao` → resolve template/msg interativa **ou Flow** → envia resposta

**Config UI:** `MapeamentoTab.tsx` — seleciona intent + tipo resposta (Template, Msg Interativa ou **Flow**)

### Intent → Flow Integration ✅ (09/02)
1. `syncCanvasToNormalizedFlow()` sincroniza canvas visual → tabelas `Flow/FlowNode/FlowEdge` ao salvar
2. `templates.ts` retorna `{ _type: 'execute_flow', flowId }` se `MapeamentoIntencao.flowId` ativo
3. `band-handlers.ts` detecta `_type` e chama `FlowOrchestrator.executeFlowById()`
4. Legado (templates/msgs interativas) permanece intacto — só flows ativos disparam execução

**Processing:** `worker/processors/intent.processor.ts`
- Busca `MapeamentoIntencao` por (intentName, inboxId)
- Prioridade: WHATSAPP_OFFICIAL > INTERACTIVE_MESSAGE > AUTOMATION_REPLY
- Constrói payload via `METAPayloadBuilder` → envia

**Vinculação Flow → Mapeamento:**
1. Cria msg interativa no Flow Builder, salva
2. No MapeamentoTab, seleciona "Mensagem Interativa" → aparece pelo nome do nó START

### Clique de Botão
Usuário clica botão → webhook com `button_reply.id` → `ButtonProcessor` busca `MapeamentoBotao` → executa ação mapeada (SEND_TEMPLATE, ADD_TAG, START_FLOW, ASSIGN_TO_AGENT...)

### Geração de Payload
`app/.../unified-editing-step/utils.ts`:
- `generateUniqueButtonId()` → `btn_{timestamp}_{counter}_{perf}_{random}`
- `generatePrefixedId(channel, suffix)` → `ig_btn_...` / `fb_btn_...` / `btn_...`

---

## 11. Roadmap v3.0: Deadline-First Architecture

### Conceito
> Tenta sincronamente na ponte (< 30s). Se o tempo vai fechar → migra automaticamente pro assíncrono. Sem análise prévia de complexidade. O relógio decide.

**Uma vez que migrou pra async, NUNCA volta pro sync.**

### Componentes Principais

#### DeadlineGuard (`services/flow-engine/deadline-guard.ts`) ✅
Cronômetro com `deadlineMs=28000`, `safetyMarginMs=5000`.
- `canSync()` → `remaining > safetyMargin && !bridgeResponded`
- `ensureAsyncMode()` → fecha ponte, tudo via API
- `setSyncPayload()` / `consumeSyncPayload()` → acumula/retorna payload da ponte

#### FlowOrchestrator (`services/flow-engine/flow-orchestrator.ts`) ✅
1. Cria DeadlineGuard → 2. Verifica FlowSession ativo (button resume) → 3. Classifica intent (IA) → 4. Busca mapeamento → 5. Carrega flow → 6. Executa via FlowExecutor → 7. Retorna `consumeSyncPayload()` ou null

#### FlowExecutor (`services/flow-engine/flow-executor.ts`) ✅
Percorre nó a nó com `smartDeliver()`:
- `canSync()` + não é media → `setSyncPayload()` (ponte)
- Senão → `markBridgeResponded()` + `delivery.deliver()` (API Chatwit)

Handlers implementados: START, END, TEXT_MESSAGE, INTERACTIVE_MESSAGE, MEDIA, DELAY, CONDITION (IF/ELSE), SET_VARIABLE, HTTP_REQUEST, ADD_TAG, REMOVE_TAG, TRANSFER, REACTION.

#### ChatwitDeliveryService (`services/flow-engine/chatwit-delivery-service.ts`) ✅
`deliverText()`, `deliverMedia()`, `deliverInteractive()` com retry + backoff.

#### VariableResolver (`services/flow-engine/variable-resolver.ts`) ✅
`{{variáveis}}` com dot notation. Scopes: system, contact, session. `resolveObject()` para templates.

### Nós que Forçam Async
DELAY, MEDIA, HTTP_REQUEST, ADD_TAG, REMOVE_TAG, TRANSFER

### Nós que Usam `smartDeliver()`
TEXT_MESSAGE, INTERACTIVE_MESSAGE (depois STOP), REACTION

### Cenários

| Cenário | Resultado |
|---|---|
| IA rápida (800ms) + flow simples | 100% síncrono ~875ms ✅ |
| IA lenta (22s) + flow simples | Ainda cabe (restam 5.8s > 5s margem) ✅ |
| IA lenta (25s) + flow simples | Migra async (restam 2.8s < 5s) ✅ |
| Texto + Delay 3s + PDF | Ponte: texto imediato. API: PDF 3s depois ✅ |

---

## 12. Prisma: Flow Engine Models ✅

```prisma
model Flow {
  id        String       @id @default(uuid())
  name      String
  inboxId   String
  isActive  Boolean      @default(true)
  nodes     FlowNode[]
  sessions  FlowSession[]
  createdAt DateTime     @default(now())
  updatedAt DateTime     @updatedAt
}

model FlowNode {
  id        String     @id @default(uuid())
  flowId    String
  flow      Flow       @relation(fields: [flowId], references: [id], onDelete: Cascade)
  nodeType  String     // START, TEXT_MESSAGE, INTERACTIVE_MESSAGE, DELAY, CONDITION, etc.
  config    Json
  positionX Float
  positionY Float
  outEdges  FlowEdge[] @relation("SourceNode")
  inEdges   FlowEdge[] @relation("TargetNode")
}

model FlowEdge {
  id              String   @id @default(uuid())
  sourceNodeId    String
  targetNodeId    String
  sourceNode      FlowNode @relation("SourceNode", fields: [sourceNodeId], references: [id], onDelete: Cascade)
  targetNode      FlowNode @relation("TargetNode", fields: [targetNodeId], references: [id], onDelete: Cascade)
  buttonId        String?
  conditionBranch String?  // "true" | "false"
}

model FlowSession {
  id             String    @id @default(uuid())
  flowId         String
  flow           Flow      @relation(fields: [flowId], references: [id])
  conversationId String
  contactId      String
  inboxId        String
  status         String    // ACTIVE, WAITING_INPUT, COMPLETED, ERROR
  currentNodeId  String?
  variables      Json      @default("{}")
  executionLog   Json      @default("[]")
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt
  completedAt    DateTime?
  @@index([conversationId])
  @@index([status])
}
```

---

## 13. Types do Flow Engine (`types/flow-engine.ts`) ✅

```typescript
type FlowNodeType = 'START'|'END'|'TEXT_MESSAGE'|'INTERACTIVE_MESSAGE'|'MEDIA'|'DELAY'|'CONDITION'|'SET_VARIABLE'|'HTTP_REQUEST'|'ADD_TAG'|'REMOVE_TAG'|'TRANSFER'|'REACTION';

type FlowSessionStatus = 'ACTIVE'|'WAITING_INPUT'|'COMPLETED'|'ERROR';

interface DeliveryContext {
  accountId: number; conversationId: number; inboxId: number;
  contactId: number; contactName: string; contactPhone: string;
  channelType: 'whatsapp'|'instagram'|'facebook'; sourceMessageId?: string;
}

interface DeliveryPayload {
  type: 'text'|'media'|'interactive';
  content?: string; mediaUrl?: string; filename?: string;
  interactivePayload?: object; private?: boolean;
}

interface SynchronousResponse {
  content?: string; type?: 'interactive'; payload?: object;
}
```

---

## 14. Fases de Implementação (Status)

### FASE 1: Infraestrutura de Entrega
- [ ] Criar Agent Bot no Chatwit → obter `api_access_token` *(config manual — pendente)*
- [x] `ChatwitDeliveryService` — ✅ 08/02
- [x] `DeadlineGuard` — ✅ 08/02
- [ ] Testar: texto via API → WA *(requer Agent Bot)*
- [ ] Testar: PDF via API → WA *(requer Agent Bot)*
- [x] Modelos Prisma (Flow, FlowNode, FlowEdge, FlowSession) — ✅ 08/02

### FASE 2: Motor Unificado
- [x] `FlowOrchestrator.handle()` — ✅ 08/02
- [x] `FlowOrchestrator.executeFlowById()` — ✅ 09/02
- [x] `FlowExecutor.executeChain()` + `smartDeliver()` — ✅ 08/02
- [x] `FlowExecutor.resumeFromButton()` — ✅ 08/02
- [x] `syncCanvasToNormalizedFlow()` ao salvar flow — ✅ 09/02
- [x] Intent mapping → Flow execution (`band-handlers.ts`) — ✅ 09/02
- [x] Sistema de edição de flows existentes (FlowSelector + APIs) — ✅ 10/02
- [ ] Zustand Store + Auto-Save no frontend
- [x] Novos nós no canvas: Delay, Media — ✅ 10/02
- [ ] Novos nós no canvas: Text (texto simples), End (encerramento)
- [ ] Distinção visual de edges (sólida vs tracejada)

### FASE 3: Chatwit — Suporte Interactive via API
- [ ] `content_type: interactive` no controller de messages
- [ ] Dispatcher: rotear interactive → Meta API
- [ ] Verificar `button_reply.id` no webhook
- [x] `deliverInteractive()` no `ChatwitDeliveryService` — ✅ 08/02
- [ ] Teste E2E: intent → interactive → botão → texto → delay → PDF

### FASE 4: Nós Avançados
- [x] Condition Node (IF/ELSE) — ✅ 08/02
- [x] Set Variable + VariableResolver + `{{variáveis}}` — ✅ 08/02
- [x] HTTP Request Node — ✅ 08/02
- [x] Transfer Node + nota interna — ✅ 08/02
- [x] Add/Remove Tag via API — ✅ 08/02
- [ ] Highlight de variáveis no editor do canvas *(frontend)*

### FASE 5: Observabilidade e Polish
- [ ] Painel de FlowSessions (admin)
- [x] Log de execução por sessão — ✅ 08/02
- [ ] Cron: expirar sessões > 24h
- [ ] Paleta de nós reorganizada
- [ ] Validação completa antes de publicar flow

---

## 15. Features Pendentes (Pós v3.0)

### Alta Prioridade
- [ ] Refatorar NodeDetailDialog: remover aba "Criar mensagem", integrar PreviewSection
- [ ] Preview multi-plataforma (WA vs IG)
- [ ] Migração ButtonReactions → Flow

### Média Prioridade
- [ ] Undo/Redo | Keyboard shortcuts (Ctrl+D, Del)
- [x] Validação em tempo real de limites por caractere — ✅ 10/02
- [ ] Templates salvos (biblioteca) | Reordenar botões via drag

### Baixa Prioridade
- [ ] Export/Import flows JSON | Versionamento | Stats | A/B Testing | CRM

---

## 16. Índice de Arquivos

### Flow Builder (Canvas Visual)
| Feature | Path |
|---|---|
| Canvas principal | `app/admin/mtf-diamante/components/FlowBuilderTab.tsx` |
| Hook do canvas | `app/.../flow-builder/hooks/useFlowCanvas.ts` |
| Flow selector | `app/.../flow-builder/panels/FlowSelector.tsx` |
| Dialog config nó | `app/.../flow-builder/panels/NodeDetailDialog.tsx` |
| Validação flow | `types/flow-builder.ts` → `validateFlowCanvas()` |
| Interactive msg node | `app/.../flow-builder/nodes/InteractiveMessageNode.tsx` |
| Delay node | `app/.../flow-builder/nodes/DelayNode.tsx` |
| Media node | `app/.../flow-builder/nodes/MediaNode.tsx` |
| Context menu | `app/.../flow-builder/nodes/NodeContextMenu.tsx` |
| EditableText | `app/.../flow-builder/ui/EditableText.tsx` |
| Node palette | `app/.../flow-builder/NodePalette.tsx` |
| Preview | `app/.../interactive-message-creator/.../PreviewSection.tsx` |
| Interactive preview | `app/.../components/shared/InteractivePreview.tsx` |
| API listar flows | `app/api/admin/mtf-diamante/flows/route.ts` |
| API flow por ID | `app/api/admin/mtf-diamante/flows/[flowId]/route.ts` |

### Flow Engine (Execução)
| Feature | Path |
|---|---|
| DeadlineGuard | `services/flow-engine/deadline-guard.ts` |
| FlowOrchestrator | `services/flow-engine/flow-orchestrator.ts` |
| FlowExecutor | `services/flow-engine/flow-executor.ts` |
| ChatwitDeliveryService | `services/flow-engine/chatwit-delivery-service.ts` |
| VariableResolver | `services/flow-engine/variable-resolver.ts` |
| Barrel export | `services/flow-engine/index.ts` |
| Types | `types/flow-engine.ts` |

### Mensagens Interativas
| Feature | Path |
|---|---|
| Limites | `types/interactive-messages.ts` → `MESSAGE_LIMITS` |
| Validação | `lib/validation/interactive-message-validation.ts` |
| Constraints por canal | `services/.../channel-constraints.ts` |
| Clamping | `lib/socialwise/clamps.ts` |
| Geração payload | `app/.../unified-editing-step/utils.ts` |

### Processamento
| Feature | Path |
|---|---|
| Intent processor | `worker/processors/intent.processor.ts` |
| Button processor | `worker/processors/button.processor.ts` |
| Band handlers (flow exec) | `lib/socialwise-flow/processor-components/band-handlers.ts` |
| Templates (intent→flow) | `lib/socialwise/templates.ts` |
| API mapeamento | `app/api/admin/mtf-diamante/mapeamentos/[caixaId]/route.ts` |
| API flow-canvas (sync) | `app/api/admin/mtf-diamante/flow-canvas/route.ts` |
| UI mapeamento | `app/admin/mtf-diamante/components/MapeamentoTab.tsx` |

### Modelos Prisma Relevantes
Flow, FlowNode, FlowEdge, FlowSession, MapeamentoBotao, MapeamentoIntencao, ChatwitInbox.flows

---

## 17. Contrato Chatwit (Fork) — Requisitos

> Doc detalhada: [`docs/chatwit-contrato-async-30s.md`](chatwit-contrato-async-30s.md)

### Obrigatório

| # | O quê | Fase | Complexidade |
|---|---|---|---|
| 1 | Criar Agent Bot + token (`/super_admin/agent_bots`) | 1 | Config (zero código) |
| 2 | Aceitar `content_type: interactive` + `content_attributes.interactive` na API messages | 3 | Média (Ruby) |
| 3 | Rotear interactive payload → Meta API no dispatcher | 3 | Média (Ruby) |
| 4 | Verificar `button_reply.id` chega no webhook | 3 | Baixa (verificar) |

**API do Agent Bot (texto):**
```http
POST /api/v1/accounts/{account_id}/conversations/{conversation_id}/messages
Headers: api_access_token: {token}
Body: { "content": "texto", "message_type": "outgoing" }
```

**API Interactive (proposta):**
```json
{
  "content": "Texto do body",
  "message_type": "outgoing",
  "content_type": "interactive",
  "content_attributes": {
    "interactive": {
      "type": "button",
      "body": { "text": "..." },
      "action": { "buttons": [{ "type": "reply", "reply": { "id": "btn_123", "title": "Suporte" } }] }
    }
  }
}
```

### Opcional (nice-to-have)
| # | O quê | Benefício |
|---|---|---|
| 5 | Preview interativas no chat | Operador vê botões |
| 6 | Ícone Agent Bot | Distinguir bot vs humano |
| 7 | Endpoint `/interactive_messages` | API mais limpa |

**O que NÃO muda:** Webhook entrada, dispatcher texto/mídia, modelo Message, API REST texto/attachments.

---

## 18. Changelog Resumido

| Versão | Data | Destaques |
|---|---|---|
| v3.4 | 10/02/2026 | **Nós de Delay e Mídia**: `DelayNode` (espera 1-30s com controles visuais), `MediaNode` (upload MinIO para imagem/vídeo/documento/áudio com preview). Tipos `DelayNodeData`, `MediaNodeData`, `MediaType`. Integração com `FlowExecutor` (DELAY força async, MEDIA envia URL). |
| v3.3 | 10/02/2026 | **Sistema de edição de flows**: listagem de flows por inbox, criação/renomeação/exclusão via FlowSelector, carregamento de flow existente para edição, APIs `/api/admin/mtf-diamante/flows` e `/flows/[flowId]`, `useFlowCanvas` com suporte a `flowId`. |
| v3.2 | 10/02/2026 | **Limites de caracteres visuais no canvas**: contador em tempo real (X/Y) + barra de progresso + indicador de excesso (vermelho) para Header (60), Body (1024), Footer (60), Botões (20). Constantes em `CHANNEL_CHAR_LIMITS` (`types/flow-builder.ts`). `EditableText` com props `maxLength` + `showCounter`. |
| v3.1 | 09/02/2026 | Intent→Flow integration: `syncCanvasToNormalizedFlow()`, `executeFlowById()`, band-handlers flow exec |
| v3.0 | 08/02/2026 | Deadline-First architecture, FlowEngine completo (DeadlineGuard, Orchestrator, Executor, DeliveryService, VariableResolver), Prisma models, Types |
| v1.5 | 02/2026 | Limites por canal, validações, mapeamento intents |
| v1.4 | 02/2026 | Context menus por elemento, validação header único, botões X |
| v1.3 | 02/2026 | Upload MinIO, preview header image, stopPropagation |
| v1.2 | 01/2026 | Context menus node-level, duplicar/deletar nós |
| v1.1 | 01/2026 | EditableText, auto-resize, modal expansão |
| v1.0 | 12/2025 | Canvas React Flow, drag-and-drop, Prisma |

**Arquivos criados em v3.0:**
`services/flow-engine/{deadline-guard,flow-orchestrator,flow-executor,chatwit-delivery-service,variable-resolver,index}.ts` + `types/flow-engine.ts` + Prisma schema updates
