# Interactive Message Flow Builder - Technical Documentation

> Documentação técnica para implementação do Flow Builder visual de mensagens interativas no MTF Diamante.

---

## 1. Overview do Sistema Atual

### 1.1 Stack Existente

| Componente | Tecnologia | Localização |
|------------|------------|-------------|
| Flow Canvas | `@xyflow/react` v12.8.5 | Já instalado no projeto |
| Agent Canvas (referência) | XY Flow + Dagre | `app/admin/MTFdashboard/components/AgentCanvas.tsx` |
| Interactive Messages | Prisma + API Routes | `app/api/admin/mtf-diamante/` |
| Button Reactions | MapeamentoBotao model | `app/api/admin/mtf-diamante/button-reactions/` |
| UI Components | Shadcn/UI + Tailwind | `components/ui/` |

### 1.2 Arquitetura Atual de Mensagens Interativas

```
┌─────────────────────────────────────────────────────────────────┐
│                    FLUXO ATUAL (SEM VISUAL)                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐     │
│  │   Template   │────▶│ Interactive  │────▶│  MapeamentoBotao  │     │
│  │   (Prisma)   │     │   Content    │     │  (Reactions) │     │
│  └──────────────┘     └──────────────┘     └──────────────┘     │
│         │                    │                    │              │
│         ▼                    ▼                    ▼              │
│    name, type           body, header        buttonId → emoji    │
│    isActive             footer, action      buttonId → text     │
│    inboxId              genericPayload      buttonId → action   │
│                                             buttonId → message  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Tipos de Mensagens Interativas

### 2.1 WhatsApp

| Tipo | Descrição | Max Botões |
|------|-----------|------------|
| `button` | Quick reply buttons | 3 |
| `list` | Menu de lista expansível | 10 seções |
| `cta_url` | Call-to-action URL | 1 |
| `flow` | WhatsApp Flow | N/A |
| `location_request` | Solicita localização | N/A |

### 2.2 Instagram

| Tipo | Descrição | Max Elementos |
|------|-----------|---------------|
| `quick_replies` | Respostas rápidas | 13 |
| `generic` | Carousel/Generic Template | 10 elementos |
| `button_template` | Botões simples | 3 |

### 2.3 Estrutura Base (TypeScript)

```typescript
// types/interactive-messages.ts

interface InteractiveMessage {
  id?: string;
  name: string;
  type: InteractiveMessageType;
  header?: MessageHeader;
  body: MessageBody;
  footer?: MessageFooter;
  action?: MessageAction;
  isActive: boolean;
}

interface MessageAction {
  type: 'button' | 'list' | 'cta_url' | 'flow' | 'carousel';
  buttons?: QuickReplyButton[];
  sections?: ListSection[];
  elements?: CarouselElement[];
}

interface QuickReplyButton {
  id: string;
  title: string;
  payload?: string;
  type?: 'reply' | 'url' | 'phone_number';
}
```

---

## 3. Sistema de Reações de Botões

### 3.1 Modelo de Dados (Prisma)

```prisma
model MapeamentoBotao {
  id               String   @id @default(uuid())
  inboxId          String
  buttonId         String   // ID do botão que foi clicado
  
  // Reação A: Enviar outra mensagem interativa
  targetMessageId  String?
  targetMessage    InteractMessage? @relation("TriggeredBy", fields: [targetMessageId], references: [id])
  
  // Reação B: Executar ação (add_tag, remove_tag, etc)
  actionType       String?  // 'add_tag', 'remove_tag', 'handoff', etc.
  actionPayload    Json?
  
  // Reação C: Responder com texto simples
  replyText        String?

  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  @@unique([inboxId, buttonId])
  @@index([inboxId])
}
```

---

## 4. Changelog e Decisões de Design (UX/UI)

### 4.1 Reorganização da Paleta de Nós (`NodePalette.tsx`)

A paleta foi reorganizada para facilitar o fluxo de criação "Typebot-style":
1.  **Topo Absoluto**: O bloco `interactive_message` (Container Principal) agora fica isolado no topo da paleta sob o rótulo "Principal".
2.  **Seção de Elementos**: Logo abaixo, uma seção dedicada ("Elementos") exibe os blocos arrastáveis (Body, Header, Footer, Botão).
3.  **Filtragem de Duplicatas**: A categoria "Mensagens Interativas" padrão foi filtrada para não exibir novamente o container principal, evitando confusão.

### 4.2 Nó de Mensagem Interativa (`InteractiveMessageNode.tsx`)

#### 4.2.1 Renderização WYSIWYG e Edição Direta
O nó agora visualiza e permite editar fielmente o conteúdo da mensagem no canvas:
*   **WYSIWYG Total**: Visualização e edição de Header (Texto/Imagem), Body e Footer.
*   **Edição In-place**: Todos os campos de texto (Header Text, Body, Footer e Títulos de Botões) podem ser editados clicando diretamente neles.
*   **Handles de Saída**: Cada botão é renderizado como um ponto de saída individual para o fluxo.

#### 4.2.4 Edição de Texto Avançada (Typebot Style)
Implementamos uma experiência de digitação fluida inspirada no Typebot e Flowise:
*   **Auto-resize (Balaõ Crescente)**: Os campos de texto utilizam o componente `EditableText`, que usa textareas com redimensionamento automático. O nó cresce verticalmente para baixo conforme o usuário digita, mantendo a largura fixa.
*   **Botão de Expansão (Flowise Style)**: Cada campo de texto possui um ícone de expansão ("Maximize") no hover, que abre um Dialog (modal) para edição confortável de textos longos ou complexos.
*   **Preservação de Contexto**: O uso da classe `nodrag` nos inputs permite a seleção de texto e movimentação do cursor sem disparar o arrasto do nó no React Flow.

#### 4.2.5 Interação e Bloqueio de Duplo Clique
Para evitar conflitos entre a edição de texto e a abertura de configurações:
*   **Configurações via Header**: O painel lateral (Drawer/Settings) só é aberto via duplo clique na **barra de título azul** (Header do nó) ou no ícone de engrenagem.
*   **Área de Conteúdo Protegida**: O duplo clique dentro do corpo da mensagem (corpo, botões, footer) é bloqueado para permitir que o usuário selecione palavras e interaja com o texto sem abrir acidentalmente as configurações globais do nó.

---

## 5. Implementação Técnica

### 5.1 Componente `EditableText.tsx`
Localizado em `app/admin/mtf-diamante/components/flow-builder/ui/`, este componente centraliza a lógica de:
1.  **Selection Isolation**: Impede propagação de eventos de drag e click indesejados.
2.  **Auto-height**: Sincroniza o `scrollHeight` com o `style.height` do textarea.
3.  **Modal Editor**: Integração com `Shadcn UI Dialog` para editor expandido.

### 5.2 Drop Logic (`FlowCanvas.tsx`)
Mudamos a detecção de drop para usar `document.elementFromPoint(x, y)` em vez do `event.target` direto.
*   **Benefício**: Evita problemas onde o evento de drop era capturado por elementos filhos (ícones, textos) e não propagava corretamente para o nó container.
*   **Targeting**: Identifica robustamente o `data-id` do nó React Flow sob o cursor.

### 5.3 Estrutura de Dados Modular
Para suportar o drag-and-drop granular, migramos de campos estáticos (`data.body`) para um array de elementos (`data.elements[]`):
```typescript
interface InteractiveMessageNodeData {
  // ...
  elements: Array<{
    id: string;
    type: 'header_text' | 'body' | 'button' | ...;
    [key: string]: any;
  }>;
}
```
Isso permite uma ordem arbitrária e composição flexível (ex: múltiplos botões, headers opcionais) compatível com a UI.

---

## 6. Context Menus e Operações por Elemento

### 6.1 Sistema de Context Menu (Typebot-Style)

Implementamos menus de contexto (clique direito) em dois níveis de granularidade:

#### 6.1.1 Node-Level Context Menu
**Componente**: `NodeContextMenu.tsx`  
**Localização**: `app/admin/mtf-diamante/components/flow-builder/nodes/NodeContextMenu.tsx`

Envolve nós inteiros com operações de:
- **Duplicar**: Clone completo do nó com todos os seus elementos
- **Deletar**: Remove o nó inteiro do canvas

**Implementado em**:
- `InteractiveMessageNode.tsx`
- `TextMessageNode.tsx` 
- `StartNode.tsx`
- `ReactionNodes.tsx` (todos os tipos de reação)

**Código exemplo**:
```tsx
<NodeContextMenu
  onDuplicate={handleDuplicate}
  onDelete={handleDelete}
>
  {/* Conteúdo do nó */}
</NodeContextMenu>
```

#### 6.1.2 Element-Level Context Menu
**Implementação**: Context menu individual por elemento dentro de `InteractiveMessageNode`

Cada elemento editável possui seu próprio menu de contexto:

| Elemento | Duplicar | Deletar | Notas |
|----------|----------|---------|-------|
| **Header Text** | ❌ | ✅ | Único por mensagem |
| **Header Image** | ❌ | ✅ | Único por mensagem |
| **Body** | ❌ | ✅ | Único por mensagem |
| **Footer** | ❌ | ✅ | Único por mensagem |
| **Button** | ✅ | ✅ | Máximo 3 por mensagem |

**Funções principais**:
```typescript
// InteractiveMessageNode.tsx

// Remove elemento específico
const handleRemoveElement = useCallback((elementId: string) => {
  setNodes((nodes) =>
    nodes.map((node) => {
      if (node.id === id) {
        const nextElements = currentElements.filter(el => el.id !== elementId);
        const legacy = elementsToLegacyFields(nextElements);
        return {
          ...node,
          data: {
            ...currentData,
            elements: nextElements,
            ...legacy,
            isConfigured: hasConfiguredBody(nextElements),
          },
        };
      }
      return node;
    })
  );
}, [id, setNodes]);

// Duplica elemento (apenas botões)
const handleDuplicateElement = useCallback((elementId: string) => {
  // Verifica tipo e limites
  // Cria cópia com novo ID
  // Insere logo após o elemento original
  // Adiciona "(cópia)" ao título
}, [id, setNodes]);
```

**Localização no código**: `InteractiveMessageNode.tsx` linhas ~130-210

### 6.2 Botões de Remoção Rápida (X)

Cada elemento também possui um botão "X" que aparece no hover:

**Comportamento**:
- Aparece apenas quando o mouse está sobre o elemento (`opacity-0 group-hover:opacity-100`)
- Usa `stopPropagation()` para evitar interferência com drag/drop
- Chama `handleRemoveElement(elementId)` diretamente
- Visual: Fundo vermelho suave no hover

**Exemplo de implementação**:
```tsx
<button
  onClick={(e) => {
    e.stopPropagation();
    handleRemoveElement(elementId);
  }}
  className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-950/20 
             text-muted-foreground hover:text-red-600 
             transition-colors opacity-0 group-hover:opacity-100"
  title="Remover elemento"
>
  <X className="h-3 w-3" />
</button>
```

---

## 7. Validação de Headers (Regra Crítica)

### 7.1 Problema Identificado
Anteriormente, a validação permitia ter simultaneamente:
- 1x `header_text` 
- 1x `header_image`

**Isso estava ERRADO**. A regra correta do WhatsApp é: **apenas UM header total** (texto OU imagem, nunca ambos).

### 7.2 Solução Implementada

**Arquivo**: `FlowBuilderTab.tsx`  
**Função**: `handleDropElement()` - lógica de validação no drop

**Código da validação**:
```typescript
// Para headers, verificar se JÁ existe QUALQUER tipo de header (text ou image)
if (elementType === 'header_text' || elementType === 'header_image') {
  const hasAnyHeader = currentElements.some((e) => 
    e.type === 'header_text' || e.type === 'header_image'
  );
  if (hasAnyHeader) {
    toast.error('Header já existe', {
      description: 'Apenas UM header por mensagem (é permitido texto OU imagem, não os dois). Delete o existente primeiro.',
    });
    return; // Bloqueia o drop
  }
}
```

**Localização**: `FlowBuilderTab.tsx` linhas ~177-190

### 7.3 Comportamento do Usuário
- ✅ Pode adicionar `header_text` se não houver nenhum header
- ✅ Pode adicionar `header_image` se não houver nenhum header
- ❌ **Bloqueado**: Tentar adicionar `header_text` quando já existe `header_image`
- ❌ **Bloqueado**: Tentar adicionar `header_image` quando já existe `header_text`
- 💡 **Troca**: Para trocar tipo de header, deve deletar o existente primeiro

---

## 8. Upload de Imagens (MinIO)

### 8.1 Integração MinIO no Header Image

**Componente utilizado**: `MinIOMediaUpload`  
**Localização**: `components/MinIOMediaUpload.tsx`

**Features implementadas**:
- ✅ Drag-and-drop de imagem diretamente no header
- ✅ Preview em tempo real após upload
- ✅ Progress bar durante upload
- ✅ Botão de upload alternativo (click)
- ✅ Validação de tipo de arquivo (imagens apenas)

### 8.2 Gerenciamento de Estado

```tsx
// InteractiveMessageNode.tsx

const [showUpload, setShowUpload] = useState(false);
const [uploadedFiles, setUploadedFiles] = useState<string[]>([]);

const handleUploadComplete = useCallback((file: { url: string }) => {
  const headerImgElement = elements.find(e => e.type === 'header_image');
  if (headerImgElement) {
    updateElementContent(headerImgElement.id, { url: file.url });
    setUploadedFiles([file.url]);
  }
}, [elements, updateElementContent]);
```

### 8.3 Prevenção de Conflitos com Canvas

**Problema**: Drag de imagens disparava o drag do canvas  
**Solução**: `stopPropagation()` em todos os handlers de evento do upload

```tsx
<div
  onDragOver={(e) => {
    e.preventDefault();
    e.stopPropagation(); // Crucial!
  }}
  onDrop={(e) => {
    e.preventDefault();
    e.stopPropagation(); // Crucial!
  }}
>
  <MinIOMediaUpload ... />
</div>
```

**Localização**: `InteractiveMessageNode.tsx` linhas ~430-470

---

## 9. Tabela de Referência Rápida

### 9.1 Arquivos Principais

| Arquivo | Responsabilidade | Localização |
|---------|------------------|-------------|
| `FlowBuilderTab.tsx` | Canvas principal, validação de drops | `app/admin/mtf-diamante/components/` |
| `InteractiveMessageNode.tsx` | Nó de mensagem interativa com elementos | `app/admin/mtf-diamante/components/flow-builder/nodes/` |
| `NodeContextMenu.tsx` | Menu de contexto reusável | `app/admin/mtf-diamante/components/flow-builder/nodes/` |
| `EditableText.tsx` | Campo de texto com auto-resize e modal | `app/admin/mtf-diamante/components/flow-builder/ui/` |
| `NodePalette.tsx` | Paleta de elementos arrastáveis | `app/admin/mtf-diamante/components/flow-builder/` |

### 9.2 Funções-Chave por Componente

#### InteractiveMessageNode.tsx
```typescript
handleRemoveElement(elementId: string)      // Remove elemento específico
handleDuplicateElement(elementId: string)   // Duplica elemento (só botões)
updateElementContent(elementId, newContent) // Atualiza conteúdo do elemento
handleUploadComplete(file)                  // Callback do MinIO upload
handleDuplicate()                           // Duplica nó inteiro
handleDelete()                              // Deleta nó inteiro
```

#### FlowBuilderTab.tsx
```typescript
handleDropElement(...)                      // Valida e adiciona elemento ao nó
validateHeader(currentElements, elementType) // Valida regra de header único
```

### 9.3 Limites e Restrições

| Elemento | Quantidade Mínima | Quantidade Máxima | Duplicável | Obrigatório |
|----------|-------------------|-------------------|------------|-------------|
| Header (texto OU imagem) | 0 | 1 | ❌ | ❌ |
| Body | 0 | 1 | ❌ | ✅ (para envio) |
| Footer | 0 | 1 | ❌ | ❌ |
| Button | 0 | 3 | ✅ | ❌ |

---

## 10. Troubleshooting e Debugging

### 10.1 Problemas Comuns

#### "Elemento aparece e some após salvar"
**Causa**: Perda de referência aos dados originais do provedor MTF  
**Solução**: Sempre usar `interactiveMessages` (dados completos) ao invés de `mensagens` (normalizados) para edição  
**Arquivo**: Veja padrão em `MensagensInterativasTab.tsx` função `handleEdit()`

#### "Context menu não aparece"
**Causa**: Possível interferência de `pointer-events` ou z-index  
**Solução**: Verificar CSS do elemento pai e adicionar `className="relative"` se necessário

#### "Upload de imagem dispara drag do canvas"
**Causa**: Falta de `stopPropagation()` nos eventos de drag  
**Solução**: Adicionar `e.stopPropagation()` em `onDragOver`, `onDrop`, `onClick` do container de upload

#### "Validação permite dois headers"
**Causa**: Lógica de validação verificando `e.type === elementType` ao invés de verificar ambos os tipos  
**Solução**: Usar `some((e) => e.type === 'header_text' || e.type === 'header_image')`

### 10.2 Logs de Debug Úteis

```typescript
// Ver estrutura completa do elemento
console.log('[Debug] element structure:', JSON.stringify(element, null, 2));

// Ver todos os elementos atuais do nó
console.log('[Debug] currentElements:', currentElements.map(e => ({ id: e.id, type: e.type })));

// Verificar se header existe
console.log('[Debug] hasAnyHeader:', currentElements.some(e => 
  e.type === 'header_text' || e.type === 'header_image'
));
```

---

## 11. Limites por Canal (WhatsApp, Instagram, Facebook)

Esta seção documenta os limites oficiais de caracteres e quantidade de elementos para cada plataforma suportada.

### 11.1 WhatsApp Business API

| Componente | Limite | Observação |
|------------|--------|------------|
| **Body (texto principal)** | 1024 caracteres | Obrigatório para tipos não-carousel |
| **Header (texto)** | 60 caracteres | Opcional |
| **Footer** | 60 caracteres | Opcional |
| **Título do botão** | 20 caracteres | Máximo 4 palavras recomendado |
| **ID/Payload do botão** | 256 caracteres | Formato `@slug` recomendado |
| **Quantidade de botões** | 3 máximo | Para tipo `button` |
| **Seções de lista** | 10 máximo | Para tipo `list` |
| **Itens por seção** | 10 máximo | Para tipo `list` |
| **Título de item de lista** | 24 caracteres | |
| **Descrição de item de lista** | 72 caracteres | Opcional |

**Tipos suportados**: `button`, `list`, `cta_url`, `flow`, `location_request`, `location`, `reaction`, `sticker`

### 11.2 Instagram Messaging API

| Tipo | Componente | Limite | Observação |
|------|------------|--------|------------|
| **Quick Replies** | Texto (prompt) | 1000 caracteres | Obrigatório |
| | Quantidade de opções | 13 máximo | Mínimo 1 |
| | Título da opção | 20 caracteres | |
| **Generic Template (Carrossel)** | Quantidade de elementos | 10 máximo | |
| | Título do elemento | 80 caracteres | Obrigatório |
| | Subtítulo | 80 caracteres | Opcional |
| | Botões por elemento | 3 máximo | |
| **Button Template** | Texto principal | 640 caracteres | Obrigatório |
| | Quantidade de botões | 1-3 | Obrigatório |

**Tipos suportados**: `quick_replies`, `generic`, `button_template`

### 11.3 Facebook Messenger API

| Componente | Limite | Observação |
|------------|--------|------------|
| **Body (texto)** | 1000 caracteres | Mesmo limite do Instagram |
| **Título do botão** | 20 caracteres | |
| **Payload** | 1000 caracteres | Maior que WhatsApp |
| **Quantidade de botões** | 13 máximo | Mesmo limite do Instagram |

**Nota**: Facebook Messenger e Instagram utilizam a mesma API (Meta Platform), portanto compartilham os mesmos limites para Generic Template e Quick Replies.

### 11.4 Tabela Comparativa Rápida

| Componente | WhatsApp | Instagram | Facebook |
|------------|----------|-----------|----------|
| Body máx | 1024 chars | 1000 chars | 1000 chars |
| Botões máx | 3 | 13 (QR) / 3 (BT) | 13 |
| Título botão | 20 chars | 20 chars | 20 chars |
| Payload/ID | 256 chars | 1000 chars | 1000 chars |
| Carousel elementos | N/A | 10 | 10 |

**Arquivos de referência**:
- Constantes: `types/interactive-messages.ts` → `MESSAGE_LIMITS`
- Validações por canal: `services/openai-components/server-socialwise-componentes/channel-constraints.ts`
- Clamping: `lib/socialwise/clamps.ts`

---

## 12. Sistema de Validações

### 12.1 Validação ao Salvar Flow (`validateFlowCanvas`)

**Localização**: `types/flow-builder.ts`

| Validação | Tipo | Mensagem |
|-----------|------|----------|
| Nenhum ponto de início | ❌ Erro | "O fluxo deve ter pelo menos um ponto de início" |
| Nó raiz inválido | ❌ Erro | "X nó(s) sem conexão de entrada não são válidos como início de fluxo" |
| Nós órfãos | ❌ Erro | "Existem X nó(s) sem conexão de entrada" |
| Múltiplos nós START | ⚠️ Warning | "O fluxo tem múltiplos nós de início" |
| Nós não configurados | ⚠️ Warning | "Existem X nó(s) não configurado(s)" |

**Nós raiz válidos**: `START` ou `INTERACTIVE_MESSAGE`

### 12.2 Validação ao Adicionar Elementos (`FlowBuilderTab`)

**Localização**: `app/admin/mtf-diamante/components/FlowBuilderTab.tsx`

| Validação | Mensagem |
|-----------|----------|
| Drop fora de nó | "Solte o bloco dentro da mensagem" |
| Drop em nó não-interativo | "Os elementos só podem ser soltos dentro de uma Mensagem Interativa" |
| Mensagem vinculada | "Troque para 'Criar mensagem' no editor para usar blocos" |
| Header duplicado | "Apenas UM header por mensagem (texto OU imagem, não os dois)" |
| Elemento duplicado | "Este tipo de elemento já está na mensagem" |
| Limite de botões | "Máximo de 3 botões por mensagem" |

### 12.3 Validação de Mensagens Interativas

**Localização**: `lib/validation/interactive-message-validation.ts`

#### Campos Obrigatórios
- **Nome da mensagem**: Obrigatório, máx 255 caracteres
- **Body.text**: Obrigatório (exceto para tipo `generic`/carousel)

#### Validação de Botões
- IDs devem ser únicos
- Títulos devem ser únicos
- Título obrigatório e máx 20 caracteres
- ID obrigatório

#### Validações por Tipo de Mensagem

| Tipo | Validação Específica |
|------|---------------------|
| `button` | 1-3 botões obrigatórios |
| `quick_replies` | 1-13 botões, body máx 1000 chars |
| `button_template` | 1-3 botões, body máx 640 chars |
| `generic` | Body opcional, validação nos elementos |
| `list` | Seções e rows obrigatórios |

### 12.4 Validação de Reações de Botões

- Botão deve existir na mensagem
- Tipo de reação deve ter conteúdo apropriado:
  - `emoji`: emoji não-vazio
  - `text`: texto de resposta não-vazio
  - `action`: ação não-vazia

---

## 13. Mapeamento de Intents e Disparo do Flow

### 13.1 Visão Geral do Sistema

O sistema de mapeamento conecta **Intents da IA** com **respostas automáticas** (templates ou mensagens interativas).

```
┌─────────────────────────────────────────────────────────────────┐
│                    FLUXO DE MAPEAMENTO                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐     │
│  │ IA Detecta   │────▶│ Busca        │────▶│ Envia        │     │
│  │ Intent       │     │ Mapeamento   │     │ Resposta     │     │
│  └──────────────┘     └──────────────┘     └──────────────┘     │
│         │                    │                    │              │
│         ▼                    ▼                    ▼              │
│    intentName         MapeamentoIntencao    Template ou         │
│    inboxId            templateId            Interactive Msg     │
│                       customVariables                           │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 13.2 Configuração via MapeamentoTab

**Localização**: `app/admin/mtf-diamante/components/MapeamentoTab.tsx`

O formulário permite:
1. **Selecionar uma Intenção**: Lista carregada de `/api/admin/ai-integration/intents`
2. **Escolher Tipo de Resposta**:
   - **Template**: Templates oficiais WhatsApp ou customizados
   - **Mensagem Interativa**: Mensagens criadas no MTF Diamante

**Campos salvos**:
```typescript
{
  intentName: string;      // Nome da intent (ex: "menu_principal")
  templateId: string;      // ID do template ou mensagem interativa
  inboxId: string;         // ID da caixa de entrada
  customVariables?: {      // Variáveis customizadas (opcional)
    [key: string]: string;
  };
}
```

### 13.3 Processamento de Intent

**Localização**: `worker/processors/intent.processor.ts`

Quando a IA detecta uma intent:

1. **Busca Mapeamento**:
   ```typescript
   const mapping = await prisma.mapeamentoIntencao.findFirst({
     where: { intentName, inbox: { inboxId } },
     include: { template: { ... } }
   });
   ```

2. **Resolve Template** por prioridade:
   - **WHATSAPP_OFFICIAL**: Template oficial aprovado pela Meta
   - **INTERACTIVE_MESSAGE**: Mensagem interativa criada no sistema
   - **AUTOMATION_REPLY**: Resposta de texto simples

3. **Constrói Payload** usando `METAPayloadBuilder`

4. **Envia Mensagem** via WhatsApp API

### 13.4 Integração com Flow Builder

**Status Atual**: O Flow Builder cria mensagens interativas visuais que podem ser vinculadas no mapeamento.

| Componente | Função |
|------------|--------|
| **Nó START** | Ponto de início do fluxo, `label` define o nome da mensagem |
| **Nó INTERACTIVE_MESSAGE** | Container para elementos (header, body, footer, botões) |
| **Nós de Reação** | Ações após clique de botão (emoji, texto, handoff, tag) |

**Como vincular um Flow ao Mapeamento**:
1. Crie a mensagem interativa no Flow Builder
2. Salve o flow (valida automaticamente)
3. No MapeamentoTab, selecione "Responder com Mensagem Interativa"
4. A mensagem aparecerá na lista pelo nome do nó START

### 13.5 Exemplo de Configuração Completa

```
1. Criar Flow no Flow Builder:
   - Nó START: label = "Menu Principal"
   - Nó INTERACTIVE_MESSAGE conectado
   - Configurar body: "Como posso ajudar?"
   - Adicionar botões: "Suporte", "Vendas", "Outros"

2. Salvar o Flow

3. No MapeamentoTab:
   - Selecionar intent: "saudacao_inicial"
   - Responder com Mensagem Interativa: "Menu Principal"
   - Salvar Mapeamento

4. Resultado:
   - Quando usuário envia "Olá" → IA detecta intent "saudacao_inicial"
   - Sistema busca mapeamento → encontra "Menu Principal"
   - Envia mensagem interativa com os 3 botões
```

### 13.6 Fluxo de Processamento de Clique de Botão

Quando o usuário clica em um botão da mensagem interativa, o sistema processa automaticamente:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                FLUXO COMPLETO: INTENT → BOTÃO → AÇÃO                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. ENTRADA (Usuário envia mensagem)                                        │
│     ┌──────────────┐                                                         │
│     │ "Olá"        │                                                         │
│     └──────┬───────┘                                                         │
│            ▼                                                                 │
│  2. IA CLASSIFICA                                                            │
│     ┌──────────────┐                                                         │
│     │ intentName:  │                                                         │
│     │ "saudacao"   │                                                         │
│     └──────┬───────┘                                                         │
│            ▼                                                                 │
│  3. INTENT PROCESSOR busca MapeamentoIntencao                               │
│     ┌──────────────┐     ┌──────────────────────┐                           │
│     │ intentName   │────▶│ Template/Mensagem    │                           │
│     │ "saudacao"   │     │ "Menu Principal"     │                           │
│     └──────────────┘     └──────────┬───────────┘                           │
│                                     ▼                                        │
│  4. ENVIA MENSAGEM INTERATIVA (com botões)                                  │
│     ┌─────────────────────────────────────┐                                 │
│     │ "Como posso ajudar?"                │                                 │
│     │ [Suporte] [Vendas] [Outros]         │  ← cada botão tem payload único │
│     └─────────────────────────────────────┘                                 │
│                    │                                                         │
│                    ▼                                                         │
│  5. USUÁRIO CLICA NO BOTÃO "Suporte"                                        │
│     ┌──────────────────────────────┐                                        │
│     │ buttonId/payload recebido:   │                                        │
│     │ "btn_1738850000_1_12345_xyz" │                                        │
│     └──────────────┬───────────────┘                                        │
│                    ▼                                                         │
│  6. BUTTON PROCESSOR busca MapeamentoBotao                                  │
│     ┌──────────────┐     ┌──────────────────────┐                           │
│     │ buttonId     │────▶│ actionType:          │                           │
│     │              │     │ SEND_TEMPLATE        │                           │
│     └──────────────┘     │ actionPayload: {...} │                           │
│                          └──────────┬───────────┘                           │
│                                     ▼                                        │
│  7. EXECUTA AÇÃO MAPEADA                                                    │
│     ┌─────────────────────────────────────┐                                 │
│     │ • SEND_TEMPLATE → Envia template    │                                 │
│     │ • ADD_TAG → Adiciona tag ao lead    │                                 │
│     │ • START_FLOW → Inicia WhatsApp Flow │                                 │
│     │ • ASSIGN_TO_AGENT → Transfere       │                                 │
│     └─────────────────────────────────────┘                                 │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 13.7 Sistema de Geração Automática de Payload

O sistema legado já possui geração automática de payloads únicos para botões:

**Localização**: `app/admin/mtf-diamante/components/interactive-message-creator/unified-editing-step/utils.ts`

```typescript
// Geração de ID único para botões
generateUniqueButtonId(): string
// Formato: btn_{timestamp}_{counter}_{performance}_{random}
// Exemplo: btn_1738850000_1_12345_abc123

// Geração com prefixo por canal
generatePrefixedId(channelType, fallbackSuffix): string
// Exemplos:
// - Instagram: ig_btn_1738850000_1_12345_abc123
// - Facebook:  fb_btn_1738850000_1_12345_abc123
// - WhatsApp:  btn_1738850000_1_12345_abc123 (sem prefixo)
```

**Vantagens do sistema**:
- IDs únicos garantidos (timestamp + counter + performance + random)
- Prefixo por canal facilita debug e identificação
- Evita colisões mesmo com criação simultânea
- Compatível com limites de payload por canal (256 chars WhatsApp, 1000 chars Instagram)

---

## 14. Roadmap v3.0: Arquitetura de Entrega Unificada

> **Arquitetura final de execução de flows** — Síncrono primeiro, assíncrono automático.

---

### 14.1 A Decisão: Deadline-First

```
REGRA ÚNICA:
  Tenta entregar na ponte síncrona (< 30s).
  Se a ponte vai fechar → migra automaticamente pro assíncrono.
  Sem decisão prévia. Sem analyzeFlowComplexity().
  Um único caminho. Um único FlowExecutor.
```

#### Por que isso é melhor

| Problema | Solução com 2 modos (anterior) | Solução com deadline (NOVA) |
|----------|-------------------------------|----------------------------|
| Flow simples (1 msg) | Precisa de `analyzeFlowComplexity()` | Responde na ponte, nem pensa |
| Flow complexo (delay+pdf) | Precisa decidir ANTES de executar | Começa na ponte, migra quando precisa |
| IA sobrecarregada (demora 25s) | Não coberto! Timeout! | Migra pro assíncrono antes dos 30s |
| IA rápida + flow grande | Decide assíncrono antes de tentar | Começa síncrono, aproveita o que puder |
| Código para manter | 2 caminhos, 2 lógicas | 1 caminho, 1 lógica |
| Bug de classificação errada | Flow "simples" pode ter HTTP lento | Impossível — deadline é factual |

---

### 14.2 Arquitetura: DeadlineGuard + FlowExecutor Unificado

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    FLUXO UNIFICADO COM DEADLINE                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Meta ──webhook──▶ Chatwit ──POST──▶ Socialwise                        │
│                                           │                              │
│                                     ┌─────┴─────┐                       │
│                                     │ CRONÔMETRO │ ← Inicia: 30s        │
│                                     │ (deadline) │                       │
│                                     └─────┬─────┘                       │
│                                           │                              │
│                                     ┌─────▼─────────────────────┐       │
│                                     │  FlowOrchestrator          │       │
│                                     │                            │       │
│                                     │  1. Classifica intent (IA) │       │
│                                     │     ⏱️ Gastou Xs...        │       │
│                                     │                            │       │
│                                     │  2. Busca mapeamento       │       │
│                                     │     ⏱️ Gastou Ys...        │       │
│                                     │                            │       │
│                                     │  3. Inicia FlowExecutor    │       │
│                                     └─────┬─────────────────────┘       │
│                                           │                              │
│                              ┌────────────▼────────────┐                │
│                              │     FlowExecutor         │                │
│                              │     (executa nó a nó)    │                │
│                              │                          │                │
│                              │  A cada nó de ENVIO:     │                │
│                              │  ┌─────────────────────┐ │                │
│                              │  │ Ainda dá tempo?      │ │                │
│                              │  │ restante > 5s?       │ │                │
│                              │  └────────┬────────────┘ │                │
│                              │           │              │                │
│                              │     SIM   │    NÃO       │                │
│                              │     ▼     │    ▼         │                │
│                              │  ┌──────┐ │ ┌─────────┐  │                │
│                              │  │PONTE │ │ │API      │  │                │
│                              │  │(sync)│ │ │CHATWIT  │  │                │
│                              │  │      │ │ │(async)  │  │                │
│                              │  └──────┘ │ └─────────┘  │                │
│                              │           │              │                │
│                              │  Uma vez que migrou pra  │                │
│                              │  async, NUNCA volta pro  │                │
│                              │  sync. Tudo via API.     │                │
│                              └──────────────────────────┘                │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

#### Regra do Ponto Sem Retorno

```
PONTE SÍNCRONA (pode acumular múltiplas msgs se der tempo)
    │
    │  msg 1 ← cabe? sim → acumula na resposta da ponte
    │  msg 2 ← cabe? sim → acumula na resposta da ponte
    │  msg 3 ← cabe? NÃO (restante < 5s ou já passou)
    │
    ▼
PONTO SEM RETORNO ← a partir daqui, tudo é API Chatwit
    │
    │  1. Responde a ponte HTTP com o que já acumulou (ou vazio)
    │  2. msg 3 → API Chatwit
    │  3. msg 4 → API Chatwit
    │  4. ... tudo via API até o fim
    │
    ▼
FIM DO FLUXO (ou WAITING_INPUT)
```

---

### 14.3 Componentes Principais

#### DeadlineGuard — O Cronômetro

**Localização**: `services/flow-engine/deadline-guard.ts`

```typescript
class DeadlineGuard {
  private readonly startTime: number;
  private readonly deadlineMs: number;       // Padrão: 28000ms
  private readonly safetyMarginMs: number;   // Padrão: 5000ms
  private bridgeResponded: boolean = false;
  private pendingSyncPayload: SynchronousResponse | null = null;

  /** Tempo restante em ms */
  get remaining(): number;

  /** PODE executar algo síncrono? */
  canSync(): boolean;

  /** Marca que a ponte já foi respondida */
  markBridgeResponded(): void;

  /** Acumula payload para responder na ponte */
  setSyncPayload(payload: SynchronousResponse): void;

  /** Retorna o payload e marca como respondida */
  consumeSyncPayload(): SynchronousResponse | null;
}
```

#### FlowOrchestrator — Endpoint Unificado

**Localização**: `services/flow-engine/flow-orchestrator.ts`

```typescript
class FlowOrchestrator {
  async handle(payload: ChatwitWebhookPayload): Promise<SynchronousResponse | null> {
    // 1. Cronômetro começa
    const deadline = new DeadlineGuard(28000, 5000);

    // 2. Extrai contexto
    const context = this.extractDeliveryContext(payload);

    // 3. Verifica FlowSession ativo (esperando botão)
    const activeSession = await this.findActiveSession(context);
    if (activeSession) {
      this.executor.resumeFromButton(activeSession, payload, context, deadline);
      return deadline.consumeSyncPayload();
    }

    // 4. Classifica intent via IA ← PODE DEMORAR
    const intent = await this.classifyIntent(payload);

    // 5. Busca mapeamento
    const mapping = await this.findMapping(intent, context.inboxId);

    // 6. Carrega e executa flow
    const flow = await this.loadFlow(mapping.flowId);
    await this.executor.execute(flow, context, deadline);

    // 7. Retorna payload da ponte (ou null)
    return deadline.consumeSyncPayload();
  }
}
```

#### FlowExecutor — Motor Unificado

**Localização**: `services/flow-engine/flow-executor.ts`

O executor percorre o flow nó a nó, usando `smartDeliver()` para decidir automaticamente se entrega via ponte síncrona ou API Chatwit.

```typescript
private async smartDeliver(
  deadline: DeadlineGuard,
  context: DeliveryContext,
  payload: DeliveryPayload
): Promise<void> {
  if (deadline.canSync() && payload.type !== 'media') {
    // ✅ PONTE ABERTA e tempo suficiente
    if (!deadline.isBridgeClosed) {
      deadline.setSyncPayload(this.toSyncResponse(payload));
      return;
    }
  }

  // ❌ PONTE FECHADA ou sem tempo → API Chatwit
  if (!deadline.isBridgeClosed) {
    deadline.markBridgeResponded();
  }
  await this.delivery.deliver(context, payload);
}
```

---

### 14.4 Nós que Forçam Modo Assíncrono

| Nó | Por quê força async | Método |
|----|---------------------|--------|
| **DELAY** | Segurar a ponte dormindo desperdiça tempo | `ensureAsyncMode()` |
| **MEDIA** | Multipart/form-data não cabe na ponte JSON | `ensureAsyncMode()` |
| **HTTP_REQUEST** | Tempo imprevisível da API externa | `ensureAsyncMode()` |
| **ADD_TAG** | Usa API do Chatwit (não a ponte) | Já é async por natureza |
| **REMOVE_TAG** | Idem | Idem |
| **TRANSFER** | Idem | Idem |

Nós que PODEM usar a ponte (se houver tempo):

| Nó | Comportamento |
|----|---------------|
| **TEXT_MESSAGE** | `smartDeliver()` decide |
| **INTERACTIVE_MESSAGE** | `smartDeliver()` decide, depois STOP |
| **REACTION** | `smartDeliver()` decide |

---

### 14.5 Cenários de Execução

#### Cenário 1: IA rápida + Flow simples (melhor caso)
```
T+0ms    Webhook chega. Deadline: 28000ms
T+800ms  IA classifica: "saudacao" (rápida)
T+870ms  INTERACTIVE_MESSAGE → setSyncPayload()
T+875ms  Retorna interactive na ponte HTTP ✅

RESULTADO: Tudo síncrono. Execução em ~875ms.
```

#### Cenário 2: IA lenta + Flow simples (ainda cabe)
```
T+0ms      Webhook chega. Deadline: 28000ms
T+22000ms  IA classifica: "saudacao" (DEMOROU 22s!)
T+22120ms  INTERACTIVE_MESSAGE
           canSync()? SIM (restam 5880ms, > 5000ms margem)
           → setSyncPayload() ✅

RESULTADO: Ainda cabeu! A IA demorou mas o flow era simples.
```

#### Cenário 3: IA lenta + Deadline estourou
```
T+0ms      Webhook chega. Deadline: 28000ms
T+25000ms  IA classifica: "saudacao" (DEMOROU 25s!)
T+25120ms  INTERACTIVE_MESSAGE
           canSync()? NÃO (restam 2880ms, < 5000ms margem)
           → ensureAsyncMode() → delivery.deliver() via API

RESULTADO: Migrou pra async automaticamente! Sem timeout. 🎉
```

#### Cenário 4: Flow complexo (Texto → Delay → PDF)
```
T+0ms    Webhook chega (clique de botão "Sim")
T+110ms  TEXT_MESSAGE → setSyncPayload("Gerando boleto...")
T+115ms  DELAY: 3s → ensureAsyncMode() → Ponte fecha
T+3120ms MEDIA: boleto.pdf → delivery.deliver() via API
T+3600ms END

RESULTADO:
  Ponte: "Gerando seu boleto..." (instantâneo)
  API: PDF + texto final (3s depois)
```

---

### 14.6 Mudanças Necessárias no Chatwit (Fork)

#### Obrigatório

| # | Mudança | Onde | Complexidade |
|---|---------|------|-------------|
| 1 | **Criar Agent Bot** para o Socialwise | Admin panel | Configuração |
| 2 | **Repassar `button_reply.id`** no webhook | Channel dispatcher | Baixa |
| 3 | **Aceitar `content_type: interactive`** na API de messages | Messages controller | Média |
| 4 | **Rotear interactive pro Meta API** no dispatcher de saída | Channel dispatcher | Média |

#### Opcional (melhora a experiência)

| # | Mudança | Benefício |
|---|---------|-----------|
| 5 | Endpoint dedicado `/interactive_messages` | API mais limpa |
| 6 | Exibir preview de mensagens interativas no chat | Operador vê o que foi enviado |
| 7 | Marcar mensagens enviadas pelo Agent Bot com ícone | Distinguir bot vs humano |

---

### 14.7 Fases de Implementação

#### FASE 1: Infraestrutura de Entrega
- [ ] Criar Agent Bot no Chatwit, obter `api_access_token` *(config manual — pendente)*
- [x] `ChatwitDeliveryService` com `deliverText()` e `deliverMedia()` — ✅ 2026-02-08
- [x] `DeadlineGuard` com cronômetro e `canSync()` — ✅ 2026-02-08
- [ ] Testar: Socialwise envia texto via API Chatwit → chega no WA *(requer Agent Bot)*
- [ ] Testar: Socialwise envia PDF via API Chatwit → chega no WA *(requer Agent Bot)*
- [x] Modelos Prisma: `Flow`, `FlowNode`, `FlowEdge`, `FlowSession` — ✅ 2026-02-08

#### FASE 2: Motor Unificado
- [x] `FlowOrchestrator.handle()` com deadline integrado — ✅ 2026-02-08
- [x] `FlowExecutor.executeChain()` com `smartDeliver()` — ✅ 2026-02-08
- [x] `FlowExecutor.resumeFromButton()` — ✅ 2026-02-08
- [ ] Zustand Store + Auto-Save no frontend
- [ ] Novos nós no canvas: Delay, Media, Text, End
- [ ] Distinção visual de edges (sólida vs tracejada)
- [ ] `syncFlowToMapeamentos()` ao salvar flow

#### FASE 3: Chatwit — Suporte Interactive via API
- [ ] `content_type: interactive` no controller de messages
- [ ] Dispatcher: rotear interactive payload pra Meta API
- [ ] Verificar que `button_reply.id` chega no webhook
- [x] `deliverInteractive()` no `ChatwitDeliveryService` — ✅ 2026-02-08
- [ ] Teste E2E: intent → interactive → botão → texto → delay → PDF

#### FASE 4: Nós Avançados
- [x] Condition Node (IF/ELSE) — ✅ 2026-02-08 *(handler implementado no FlowExecutor)*
- [x] Set Variable + Variable Resolver + `{{variáveis}}` — ✅ 2026-02-08
- [x] HTTP Request Node — ✅ 2026-02-08 *(handler implementado no FlowExecutor)*
- [x] Transfer Node + nota interna — ✅ 2026-02-08 *(handler implementado no FlowExecutor)*
- [x] Add/Remove Tag via API Chatwit — ✅ 2026-02-08 *(handler + enum REMOVE_TAG adicionado)*
- [ ] Highlight de variáveis no editor do canvas *(frontend — pendente)*

#### FASE 5: Observabilidade e Polish
- [ ] Painel de FlowSessions (admin)
- [x] Log de execução por sessão — ✅ 2026-02-08 *(executionLog no FlowExecutor + FlowSession)*
- [ ] Cron: expirar sessões > 24h sem atividade
- [ ] Paleta de nós reorganizada
- [ ] Validação completa antes de publicar flow

---

### 14.8 Modelos Prisma para o Flow Engine

```prisma
model Flow {
  id          String     @id @default(uuid())
  name        String
  inboxId     String
  isActive    Boolean    @default(true)
  nodes       FlowNode[]
  sessions    FlowSession[]
  createdAt   DateTime   @default(now())
  updatedAt   DateTime   @updatedAt
}

model FlowNode {
  id        String     @id @default(uuid())
  flowId    String
  flow      Flow       @relation(fields: [flowId], references: [id], onDelete: Cascade)
  nodeType  String     // START, TEXT_MESSAGE, INTERACTIVE_MESSAGE, DELAY, CONDITION, etc.
  config    Json       // Configuração específica do nó
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
  buttonId        String?  // Para edges que saem de botões
  conditionBranch String?  // "true" ou "false" para CONDITION nodes
}

model FlowSession {
  id             String   @id @default(uuid())
  flowId         String
  flow           Flow     @relation(fields: [flowId], references: [id])
  conversationId String
  contactId      String
  inboxId        String
  status         String   // ACTIVE, WAITING_INPUT, COMPLETED, ERROR
  currentNodeId  String?  // Nó atual (para WAITING_INPUT)
  variables      Json     @default("{}")
  executionLog   Json     @default("[]")
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  completedAt    DateTime?

  @@index([conversationId])
  @@index([status])
}
```

---

### 14.9 Tipos TypeScript do Flow Engine

```typescript
// types/flow-engine.ts

type FlowNodeType =
  | 'START'
  | 'END'
  | 'TEXT_MESSAGE'
  | 'INTERACTIVE_MESSAGE'
  | 'MEDIA'
  | 'DELAY'
  | 'CONDITION'
  | 'SET_VARIABLE'
  | 'HTTP_REQUEST'
  | 'ADD_TAG'
  | 'REMOVE_TAG'
  | 'TRANSFER'
  | 'REACTION';

type FlowSessionStatus = 'ACTIVE' | 'WAITING_INPUT' | 'COMPLETED' | 'ERROR';

interface DeliveryContext {
  accountId: number;
  conversationId: number;
  inboxId: number;
  contactId: number;
  contactName: string;
  contactPhone: string;
  channelType: 'whatsapp' | 'instagram' | 'facebook';
  sourceMessageId?: string;
}

interface DeliveryPayload {
  type: 'text' | 'media' | 'interactive';
  content?: string;
  mediaUrl?: string;
  filename?: string;
  interactivePayload?: object;
  private?: boolean;
}

interface SynchronousResponse {
  content?: string;
  type?: 'interactive';
  payload?: object;
}
```

---

### 14.10 Features Adicionais (Pós v3.0)

#### Alta Prioridade
- [ ] **Refatorar NodeDetailDialog**: Remover aba "Criar mensagem", integrar PreviewSection
- [ ] **Preview multi-plataforma**: Mostrar como a mensagem aparece no WhatsApp vs Instagram
- [ ] **Migração de ButtonReactions para Flow**: Importar configurações existentes
- [x] **Types do Flow Engine (`types/flow-engine.ts`)**: Interfaces completas para runtime — ✅ 2026-02-08
- [x] **VariableResolver**: Resolução de `{{variáveis}}` com dot notation + system/contact/session — ✅ 2026-02-08
- [x] **Barrel export (`services/flow-engine/index.ts`)**: Re-exports centralizados — ✅ 2026-02-08

#### Média Prioridade
- [ ] Undo/Redo para operações de elemento
- [ ] Keyboard shortcuts (Ctrl+D para duplicar, Del para deletar)
- [ ] Validação em tempo real de limites por caractere
- [ ] Templates salvos de mensagens interativas (biblioteca)
- [ ] Arrastar para reordenar botões dentro do nó

#### Baixa Prioridade
- [ ] Exportar/Importar flows em JSON
- [ ] Versionamento de flows
- [ ] Estatísticas de uso por flow
- [ ] A/B Testing de Flows
- [ ] Integração com CRM

---

### 14.11 Resumo da Arquitetura

```
┌─────────────────────────────────────────────────┐
│                                                  │
│   TENTA NA PONTE.                               │
│   SE NÃO DÁ TEMPO → API DO CHATWIT.            │
│   UMA VEZ QUE MIGROU, NÃO VOLTA.               │
│                                                  │
│   É isso. Sem complexity analysis.              │
│   Sem dois caminhos. Sem decisão prévia.        │
│   O relógio decide.                             │
│                                                  │
└─────────────────────────────────────────────────┘
```

---

## 15. Changelog de Implementações

### v3.0 - Arquitetura de Entrega Unificada (Fevereiro 2026)
**Documentado**:
- ✅ Arquitetura Deadline-First para entrega de mensagens
- ✅ DeadlineGuard — cronômetro de ponte síncrona
- ✅ FlowOrchestrator — endpoint unificado de entrada
- ✅ FlowExecutor — motor de execução com `smartDeliver()`
- ✅ Cenários de execução detalhados (IA rápida/lenta, flows simples/complexos)
- ✅ Modelos Prisma: Flow, FlowNode, FlowEdge, FlowSession
- ✅ Tipos TypeScript do Flow Engine
- ✅ Fases de implementação (5 fases)
- ✅ Mudanças necessárias no Chatwit (fork)

**Implementado (2026-02-08)**:
- ✅ `types/flow-engine.ts` — Interfaces completas (DeliveryContext, DeliveryPayload, RuntimeFlow, FlowSessionData, configs de nós)
- ✅ `services/flow-engine/deadline-guard.ts` — DeadlineGuard class com `canSync()`, `ensureAsyncMode()`, merge de payloads
- ✅ `services/flow-engine/chatwit-delivery-service.ts` — `deliverText()`, `deliverMedia()`, `deliverInteractive()` com retry + backoff
- ✅ `services/flow-engine/flow-executor.ts` — FlowExecutor com `executeChain()`, `resumeFromButton()`, `smartDeliver()`, handlers para todos os nó types
- ✅ `services/flow-engine/flow-orchestrator.ts` — FlowOrchestrator com `handle()`, session management, button resume, flow loading
- ✅ `services/flow-engine/variable-resolver.ts` — VariableResolver com dot notation, system/contact/session vars, `resolveObject()`
- ✅ `services/flow-engine/index.ts` — Barrel export
- ✅ `prisma/schema.prisma` — Models: `Flow`, `FlowNode`, `FlowEdge`, `FlowSession` + enum `FlowSessionStatus` + `REMOVE_TAG` em ActionType
- ✅ Relação `ChatwitInbox.flows` adicionada

**Arquivos criados**:
- `services/flow-engine/deadline-guard.ts`
- `services/flow-engine/flow-orchestrator.ts`
- `services/flow-engine/flow-executor.ts`
- `services/flow-engine/chatwit-delivery-service.ts`
- `services/flow-engine/variable-resolver.ts`
- `services/flow-engine/index.ts`
- `types/flow-engine.ts`

### v1.5 - Documentação de Limites e Mapeamento (Fevereiro 2026)
**Documentado**:
- ✅ Limites completos por canal (WhatsApp, Instagram, Facebook)
- ✅ Sistema de validações detalhado
- ✅ Fluxo de mapeamento de intents
- ✅ Integração Flow Builder com sistema de resposta automática
- ✅ Roadmap de melhorias técnicas

**Arquivos de referência documentados**:
- `types/interactive-messages.ts` → `MESSAGE_LIMITS`
- `lib/validation/interactive-message-validation.ts`
- `worker/processors/intent.processor.ts`
- `app/admin/mtf-diamante/components/MapeamentoTab.tsx`

### v1.4 - Context Menus e Validação de Headers (Fevereiro 2026)
**Implementado**:
- ✅ Context menu individual por elemento (clique direito)
- ✅ Duplicação de botões via context menu
- ✅ Validação corrigida: apenas UM header (texto OU imagem)
- ✅ Botões X individuais por elemento (aparecem no hover)
- ✅ `handleDuplicateElement()` com validação de limites
- ✅ Mensagens de erro específicas para cada violação de regra

**Arquivos modificados**:
- `InteractiveMessageNode.tsx` - Funções de elemento individual
- `FlowBuilderTab.tsx` - Validação de header corrigida
- `NodeContextMenu.tsx` - Suporte a operações sem duplicação (onDelete only)

### v1.3 - Upload MinIO e Gestão de Elementos (Fevereiro 2026)
**Implementado**:
- ✅ Drag-and-drop de imagens via MinIO
- ✅ Preview de header image em tempo real
- ✅ `stopPropagation()` para evitar conflito com canvas
- ✅ Botões de remoção (X) individuais por elemento
- ✅ `handleRemoveElement()` para deletar elementos específicos

### v1.2 - Node Context Menus (Janeiro 2026)
**Implementado**:
- ✅ Context menu em todos os tipos de nós
- ✅ Operações de duplicar/deletar no nível do nó
- ✅ Integração com React Flow para clone de nós

### v1.1 - Edição Direta e Auto-resize (Janeiro 2026)
**Implementado**:
- ✅ Edição inline de todos os campos de texto
- ✅ Auto-resize de textareas (balão crescente)
- ✅ Modal de expansão para textos longos
- ✅ `EditableText` component reusável

### v1.0 - Base do Flow Builder (Dezembro 2025)
**Implementado**:
- ✅ Canvas com React Flow
- ✅ Drag-and-drop de elementos da paleta
- ✅ Estrutura modular de elementos
- ✅ Persistência em Prisma

---

## 16. Arquivos de Referência por Funcionalidade

### 16.1 Flow Builder (Canvas Visual)

| Funcionalidade | Arquivo Principal | Descrição |
|----------------|-------------------|-----------|
| **Flow Builder Tab** | `app/admin/mtf-diamante/components/FlowBuilderTab.tsx` | Canvas principal |
| **Hook do Canvas** | `app/.../flow-builder/hooks/useFlowCanvas.ts` | Estado e operações do flow |
| **Dialog de Detalhes** | `app/.../flow-builder/panels/NodeDetailDialog.tsx` | Dialog de config do nó |
| **Validação de Flow** | `types/flow-builder.ts` | `validateFlowCanvas()` |
| **Preview Section** | `app/.../interactive-message-creator/.../PreviewSection.tsx` | Preview reutilizável |
| **Interactive Preview** | `app/.../components/shared/InteractivePreview.tsx` | Componente visual |

### 16.2 Flow Engine (Execução)

| Funcionalidade | Arquivo Principal | Descrição |
|----------------|-------------------|-----------|
| **DeadlineGuard** | `services/flow-engine/deadline-guard.ts` | Cronômetro de ponte síncrona |
| **FlowOrchestrator** | `services/flow-engine/flow-orchestrator.ts` | Endpoint unificado de entrada |
| **FlowExecutor** | `services/flow-engine/flow-executor.ts` | Motor de execução com `smartDeliver()` |
| **ChatwitDeliveryService** | `services/flow-engine/chatwit-delivery-service.ts` | Entrega via API Chatwit |
| **VariableResolver** | `services/flow-engine/variable-resolver.ts` | Resolução de `{{variáveis}}` |
| **Tipos do Engine** | `types/flow-engine.ts` | Interfaces e types |

### 16.3 Mensagens Interativas

| Funcionalidade | Arquivo Principal | Descrição |
|----------------|-------------------|-----------|
| **Limites de Mensagem** | `types/interactive-messages.ts` | Constantes `MESSAGE_LIMITS` |
| **Validação de Mensagens** | `lib/validation/interactive-message-validation.ts` | Schemas Zod e validadores |
| **Restrições por Canal** | `services/.../channel-constraints.ts` | `getConstraintsForChannel()` |
| **Clamping de Texto** | `lib/socialwise/clamps.ts` | `clampTitle()`, `clampBody()` |
| **Geração de Payload** | `app/.../unified-editing-step/utils.ts` | `generateUniqueButtonId()` |

### 16.4 Processamento e Mapeamento

| Funcionalidade | Arquivo Principal | Descrição |
|----------------|-------------------|-----------|
| **Processamento de Intent** | `worker/processors/intent.processor.ts` | `IntentProcessor` class |
| **Processamento de Botão** | `worker/processors/button.processor.ts` | `ButtonProcessor` class |
| **API de Mapeamento** | `app/api/admin/mtf-diamante/mapeamentos/[caixaId]/route.ts` | CRUD de mapeamentos |
| **UI de Mapeamento** | `app/admin/mtf-diamante/components/MapeamentoTab.tsx` | Formulário de configuração |
| **Mapeamento de Botão** | Tabela `MapeamentoBotao` (Prisma) | buttonId → actionType + actionPayload |

### 16.5 Modelos Prisma

| Modelo | Descrição |
|--------|-----------|
| `Flow` | Definição do flow (nome, inboxId, isActive) |
| `FlowNode` | Nós do flow (nodeType, config, posição) |
| `FlowEdge` | Conexões entre nós (buttonId, conditionBranch) |
| `FlowSession` | Execução ativa (status, variables, currentNodeId) |
| `MapeamentoBotao` | Reações de botões legado |
| `MapeamentoIntencao` | Mapeamento intent → template |

---

## 17. Requisitos para o Chatwit (Fork do Chatwoot)

> ⚠️ Esta seção é o contrato entre Socialwise e Chatwit.
> Tudo que o Chatwit precisa fazer para o Flow Engine funcionar.
>
> 📄 **Doc consolidada com análise completa do código Ruby e plano de implementação**:
> [`docs/chatwit-contrato-async-30s.md`](chatwit-contrato-async-30s.md)

### 17.1 Agent Bot para o Socialwise (FASE 1)

**O que**: Criar um Agent Bot no Chatwit que o Socialwise usa para enviar mensagens via API REST quando a ponte de 30s fecha.

**Como**: No painel de admin do Chatwit (`/super_admin/agent_bots`), criar:
- **Nome**: "Socialwise Bot"
- **Acesso**: Global ou por inbox
- **Resultado**: Gera um `api_access_token`

**Uso pelo Socialwise**:
```http
POST /api/v1/accounts/{account_id}/conversations/{conversation_id}/messages
Headers:
  api_access_token: {token_gerado_acima}
Body:
  { "content": "texto", "message_type": "outgoing" }
```

**O que já funciona no Chatwoot padrão**: Envio de texto e attachments (multipart/form-data) pela API. Não requer mudança no código.

**Complexidade**: Apenas configuração. Zero código.

---

### 17.2 Suporte a Mensagens Interativas via API REST (FASE 3)

**O que**: Hoje a API REST do Chatwit (`POST .../messages`) aceita texto e attachments, mas não aceita mensagens interativas (com botões, listas, etc). O Socialwise precisa enviar interativas via API quando a ponte fecha.

**Situação**: Quando o Socialwise devolve na ponte síncrona, o Chatwit já sabe montar o payload Meta porque ele controla esse fluxo. Mas quando o Socialwise envia via API REST, o Chatwit recebe um JSON genérico e não sabe que é interativo.

**Solução proposta — Aceitar campo `content_attributes.interactive`**:

```ruby
# O Socialwise vai enviar:
# POST /api/v1/accounts/:id/conversations/:id/messages
# {
#   "content": "Olá, como posso ajudar?",
#   "message_type": "outgoing",
#   "content_type": "interactive",
#   "content_attributes": {
#     "interactive": {
#       "type": "button",
#       "body": { "text": "Olá, como posso ajudar?" },
#       "action": {
#         "buttons": [
#           { "type": "reply", "reply": { "id": "btn_123", "title": "Suporte" } },
#           { "type": "reply", "reply": { "id": "btn_456", "title": "Vendas" } }
#         ]
#       }
#     }
#   }
# }
```

**Mudanças necessárias no Chatwit**:

1. **Messages Controller** (`app/controllers/api/v1/accounts/conversations/messages_controller.rb`):
   - Aceitar `content_type` e `content_attributes` nos params permitidos
   - Salvar no modelo `Message`

2. **Channel Dispatcher** (onde o Chatwit decide como enviar pra Meta):
   - Se `content_type == 'interactive'` e `content_attributes.interactive` existe:
     - Usar o payload de `content_attributes.interactive` para montar a requisição pra Meta API
     - Em vez de enviar como texto simples

3. **Modelo Message** — provavelmente não precisa mudar, porque o Chatwoot já tem `content_type` e `content_attributes` como campos existentes.

**Complexidade**: Média. Requer entender o dispatcher de saída do Chatwit.

**Alternativa** (se preferir não mexer no dispatcher): Criar endpoint separado:
```
POST /api/v1/accounts/:id/conversations/:id/interactive_messages
```
Mais trabalho inicial, mas mais limpo a longo prazo.

---

### 17.3 Repassar `button_reply.id` no Webhook (FASE 3)

**O que**: Quando um usuário clica um botão no WhatsApp, a Meta envia um webhook com:

```json
{
  "type": "interactive",
  "interactive": {
    "type": "button_reply",
    "button_reply": {
      "id": "btn_1738850000_1_12345_abc123",
      "title": "Suporte"
    }
  }
}
```

O Chatwit precisa repassar o `button_reply.id` para o Socialwise no webhook, para que o Socialwise saiba qual botão foi clicado e retome o fluxo correto.

**Verificar**: Como o `content_attributes` da mensagem chega no webhook do Socialwise. Se o campo `interactive.button_reply.id` já está incluído no payload que o Chatwit envia, não precisa mudar nada.

**Se não chega**: Incluir `content_attributes` no payload do webhook que o Chatwit manda pro Socialwise.

**Complexidade**: Baixa. Provavelmente já funciona.

---

### 17.4 Resumo de Mudanças no Chatwit

| # | O quê | Quando | Complexidade | Tipo |
|---|-------|--------|--------------|------|
| 1 | Criar Agent Bot + token | FASE 1 | Nenhuma (config) | Configuração |
| 2 | Aceitar `content_type: interactive` na API | FASE 3 | Média | Código Ruby |
| 3 | Rotear interactive payload pra Meta API | FASE 3 | Média | Código Ruby |
| 4 | Verificar que `button_reply.id` chega no webhook | FASE 3 | Baixa (verificar) | Verificação |

**O que NÃO muda no Chatwit**:
- ❌ Webhook de entrada (Meta → Chatwit) — já funciona
- ❌ Dispatcher de texto/mídia — já funciona
- ❌ Modelo Message — reutiliza campos existentes
- ❌ API REST para texto e attachments — já funciona

---

### 17.5 Mudanças Opcionais (Nice-to-Have)

| # | O quê | Benefício |
|---|-------|-----------|
| 5 | Exibir preview de mensagens interativas no chat | Operador vê botões no histórico |
| 6 | Ícone diferente para mensagens do Agent Bot | Distinguir bot vs humano |
| 7 | Endpoint dedicado `/interactive_messages` | API mais limpa (alternativa ao item 2) |

---

**Última atualização**: 08 de Fevereiro de 2026
**Versão**: 3.0.1 (Implementação da Infraestrutura + Motor Unificado)
**Mantido por**: Equipe MTF Diamante

