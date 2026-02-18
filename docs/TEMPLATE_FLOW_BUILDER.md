# Templates no Flow Builder - Guia Tecnico

> Mini-guia sobre o sistema de templates oficiais WhatsApp no Flow Builder.

## Visao Geral

O sistema permite configurar **templates oficiais WhatsApp** aprovados pela Meta no Flow Builder. Templates podem ser:

| Modo | Descricao | Uso |
|------|-----------|-----|
| **Importar** | Vincular template ja aprovado | Templates existentes da conta |
| **Criar** | Criar novo template para aprovacao | Novos templates (DRAFT → PENDING → APPROVED) |

---

## Arquitetura

```
┌─────────────────────────────────────────────────────────────────────┐
│  UI (Flow Builder)                                                   │
│  └─ NodePalette → Arrastar "Template Oficial" → Canvas               │
│     └─ Duplo-clique → TemplateConfigDialog abre                      │
│        └─ Modo: Importar (SWR) | Criar (Form)                        │
└──────────────────────────────────┬──────────────────────────────────┘
                                   ↓
┌──────────────────────────────────┴──────────────────────────────────┐
│  Hook SWR: useApprovedTemplates(caixaId)                             │
│  └─ Endpoint: GET /api/admin/mtf-diamante/templates?caixaId=X        │
│     └─ Retorna templates com status APPROVED                         │
│     └─ Cache: 30s dedupingInterval                                   │
└──────────────────────────────────┬──────────────────────────────────┘
                                   ↓
┌──────────────────────────────────┴──────────────────────────────────┐
│  SwrProvider                                                         │
│  └─ approvedTemplates: WhatsAppTemplate[]                            │
│  └─ isLoadingTemplates: boolean                                      │
│  └─ refreshTemplates: () => Promise                                  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Fluxo de Importacao

### 1. Usuario abre o dialog

```
TemplateConfigDialog (open=true, mode="import")
    ↓
useApprovedTemplates(caixaId, !open) → fetch ativado
    ↓
Lista de templates aprovados renderizada
```

### 2. Usuario seleciona template

```
onClick(template)
    ↓
setSelectedTemplate(template)
    ↓
Preview renderizado na coluna direita (TemplatePreview)
```

### 3. Usuario confirma importacao

```
onClick "Importar"
    ↓
handleImportTemplate(selectedTemplate)
    ↓
onUpdateNodeData(node.id, {
  label: template.name,
  isConfigured: true,
  mode: "import",
  status: "APPROVED",
  templateId: template.id,
  templateName: template.name,
  ...components
})
    ↓
Dialog fecha, no atualizado no canvas
```

---

## Modelo de Dados

### WhatsAppTemplate

```typescript
interface WhatsAppTemplate {
  id: string;
  name: string;
  status: "APPROVED" | "PENDING" | "REJECTED";
  category: string;
  language: string;
  components?: Array<{
    type: string;        // "HEADER" | "BODY" | "FOOTER" | "BUTTONS"
    text?: string;
    format?: string;     // "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT"
    buttons?: Array<{
      type: string;      // "QUICK_REPLY" | "URL" | "PHONE_NUMBER" | etc
      text: string;
      url?: string;
      phone_number?: string;
    }>;
  }>;
}
```

### TemplateNodeData

```typescript
interface TemplateNodeData {
  label: string;
  isConfigured: boolean;
  mode: "import" | "create";
  status: "DRAFT" | "PENDING" | "APPROVED" | "REJECTED";
  templateId?: string;
  metaTemplateId?: string;
  templateName: string;
  category: TemplateCategory;
  language: string;
  header?: { type: string; content?: string; mediaUrl?: string };
  body?: { text: string; variables?: string[] };
  footer?: { text: string };
  buttons?: TemplateButton[];
}
```

---

## Arquivos Relevantes

| Arquivo | Responsabilidade |
|---------|------------------|
| `app/admin/mtf-diamante/hooks/useApprovedTemplates.ts` | Hook SWR para templates |
| `app/admin/mtf-diamante/context/SwrProvider.tsx` | Provider com approvedTemplates |
| `app/admin/mtf-diamante/lib/types.ts` | Tipos TypeScript |
| `app/admin/mtf-diamante/components/flow-builder/dialogs/TemplateConfigDialog.tsx` | Dialog de configuracao |
| `app/admin/mtf-diamante/components/flow-builder/nodes/TemplateNode.tsx` | No visual no canvas |
| `app/admin/mtf-diamante/components/flow-builder/panels/NodePalette.tsx` | Paleta de nos |
| `app/api/admin/mtf-diamante/templates/route.ts` | API de templates |

---

## UI do Dialog

### Modo "Importar template aprovado"

```
┌─────────────────────────────────────────────────────────────────────┐
│  📋 Template Oficial WhatsApp                        [Aprovado]     │
├─────────────────────────────────────────────────────────────────────┤
│  [Importar template aprovado] [Criar novo template]                 │
├─────────────────────────────────────────────────────────────────────┤
│                                │                                    │
│  🔍 Buscar template            │    📱 Preview WhatsApp             │
│  ┌─────────────────────────┐   │    ┌────────────────────────┐     │
│  │ ✓ mentoria_oab   Aprov  │←──│────│ [Preview do template]  │     │
│  │ MARKETING · pt_BR       │   │    │                        │     │
│  ├─────────────────────────┤   │    │ Header: Texto ou midia │     │
│  │ oferta_curso    Aprov   │   │    │ Body: Conteudo...      │     │
│  │ MARKETING · pt_BR       │   │    │ Footer: Rodape         │     │
│  └─────────────────────────┘   │    │ [Botao 1] [Botao 2]    │     │
│                                │    └────────────────────────┘     │
├────────────────────────────────┴────────────────────────────────────┤
│                              [Fechar] [Importar "mentoria_oab"]     │
└─────────────────────────────────────────────────────────────────────┘
```

### Fluxo UX:
1. Usuario seleciona template na lista (clique unico) → borda verde
2. Preview aparece na coluna direita
3. Usuario confirma clicando em "Importar"
4. Dialog fecha e no eh criado/atualizado no canvas

---

## Troubleshooting

### Template nao aparece na paleta

1. Verificar se `FlowNodeType.TEMPLATE` NAO esta na lista de excludedTypes:
```typescript
// NodePalette.tsx - NAO deve ter TEMPLATE aqui:
const excludedTypes = [mainNode?.type, buttonTemplateNode?.type].filter(Boolean);
```

### Lista de templates vazia

1. Verificar se caixaId esta sendo passado corretamente
2. Verificar se a API retorna templates:
```bash
curl "/api/admin/mtf-diamante/templates?caixaId=XXX"
```

3. Verificar se templates tem status "APPROVED"

### Preview nao aparece

1. Verificar se `selectedTemplate` esta sendo setado
2. Verificar se template tem `components` com dados

---

## Changelog

| Data | Alteracao |
|------|-----------|
| 2026-02-18 | Criado hook `useApprovedTemplates` com SWR |
| 2026-02-18 | Adicionado templates ao SwrProvider |
| 2026-02-18 | Refatorado TemplateConfigDialog com preview no modo import |
| 2026-02-18 | Removido TEMPLATE da lista de exclusao na paleta |
