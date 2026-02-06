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

## 11. Roadmap Futuro

### 11.1 Features Planejadas
- [ ] Undo/Redo para operações de elemento
- [ ] Keyboard shortcuts (Ctrl+D para duplicar, Del para deletar)
- [ ] Validação em tempo real de limites
- [ ] Preview de mensagem em diferentes plataformas (WhatsApp/Instagram)
- [ ] Templates salvos de mensagens interativas
- [ ] Arrastar para reordenar botões dentro do nó

### 11.2 Melhorias UX
- [ ] Drag handles visuais em cada elemento
- [ ] Animações de transição ao adicionar/remover elementos
- [ ] Tooltips com atalhos de teclado
- [ ] Indicador visual de limite de botões (ex: 2/3)
- [ ] Collapse/expand de elementos longos

---

## 12. Changelog de Implementações

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

**Última atualização**: Fevereiro 2026  
**Mantido por**: Equipe MTF Diamante

