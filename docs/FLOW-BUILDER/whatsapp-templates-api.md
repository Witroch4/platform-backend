# WhatsApp Templates API - Referência Técnica

> Documentação resumida dos tipos de template da API do WhatsApp Business.
> Categoria: **MARKETING** (única compatível com API de Mensagens de Marketing).

---

## Estrutura Base de Template

```json
{
  "name": "nome_template",        // Apenas minúsculas e _
  "language": "pt_BR",
  "category": "MARKETING",
  "components": [
    { "type": "HEADER", ... },    // Opcional
    { "type": "BODY", ... },      // Obrigatório
    { "type": "FOOTER", ... },    // Opcional
    { "type": "BUTTONS", ... }    // Opcional, até 10 botões
  ]
}
```

### Limites Globais
| Componente | Limite |
|------------|--------|
| Body | 1.024 chars (600 para LTO) |
| Footer | 60 chars |
| Texto botão | 25 chars |
| Variáveis | Obrigatório enviar `example` na criação |

---

## Coupon Code (Copy Code) {#coupon-code}

> **Uso principal**: Chaves PIX, cupons de desconto.

### Limitações
- Máximo **15 caracteres** no código
- **Não funciona** no WhatsApp Web
- Apenas **1 botão** copy_code por template
- Texto do botão **fixo** (definido pelo WhatsApp)

### Criação
```json
{
  "type": "BUTTONS",
  "buttons": [
    { "type": "COPY_CODE", "example": "PROMO15" }
  ]
}
```

### Envio
```json
{
  "type": "button",
  "sub_type": "COPY_CODE",
  "index": 0,
  "parameters": [
    { "type": "coupon_code", "coupon_code": "CHAVE-PIX-123" }
  ]
}
```

---

## Lista Interativa (Mensagem com Lista) {#lista}

> **Uso**: Menus de opções, seleção de serviços.

### Estrutura
- Header: Texto (opcional)
- Body: Texto principal
- Footer: Texto (opcional)
- Botão: Abre lista de até **10 seções** com **10 itens cada**

### Criação (tipo `list`)
```json
{
  "type": "BUTTONS",
  "buttons": [
    { "type": "LIST", "text": "Ver opções" }
  ]
}
```

### Envio com Seções
```json
{
  "type": "interactive",
  "interactive": {
    "type": "list",
    "body": { "text": "Escolha uma opção:" },
    "action": {
      "button": "Ver opções",
      "sections": [
        {
          "title": "Serviços",
          "rows": [
            { "id": "srv_1", "title": "Consultoria", "description": "Desc..." }
          ]
        }
      ]
    }
  }
}
```

---

## Carrossel WhatsApp (Media Card Carousel) {#carrossel}

> **Uso**: Vitrine de produtos, portfólio.

### Regra de Ouro: SIMETRIA TOTAL
Todos os cards devem ter **mesma estrutura**:
- Mesmo tipo de mídia (IMAGE ou VIDEO)
- Mesmo número de botões
- Mesmo tipo de botões

### Limites
| Atributo | Limite |
|----------|--------|
| Cards | 2-10 |
| Body (mensagem) | 1.024 chars |
| Body (card) | 160 chars |
| Botões por card | 2 |

### Criação
```json
{
  "type": "CAROUSEL",
  "cards": [
    {
      "components": [
        { "type": "HEADER", "format": "IMAGE", "example": { "header_handle": ["..."] } },
        { "type": "BODY", "text": "Descrição do card {{1}}" },
        { "type": "BUTTONS", "buttons": [
          { "type": "QUICK_REPLY", "text": "Comprar" },
          { "type": "URL", "text": "Ver mais", "url": "https://..." }
        ]}
      ]
    }
  ]
}
```

### Envio
```json
{
  "type": "template",
  "template": {
    "name": "meu_carrossel",
    "language": { "code": "pt_BR" },
    "components": [
      {
        "type": "CAROUSEL",
        "cards": [
          {
            "card_index": 0,
            "components": [
              {
                "type": "header",
                "parameters": [{ "type": "image", "image": { "id": "MEDIA_ID" } }]
              },
              {
                "type": "body",
                "parameters": [{ "type": "text", "text": "Produto A" }]
              }
            ]
          }
        ]
      }
    ]
  }
}
```

---

## Oferta por Tempo Limitado (LTO) {#lto}

> **Uso**: Promoções urgentes com countdown.

### Limitações Críticas
- **Não funciona** no WhatsApp Web/Desktop
- Sem componente Footer
- Body máximo **600 chars**
- Texto da oferta máximo **16 chars**

### Criação
```json
{
  "type": "limited_time_offer",
  "limited_time_offer": {
    "text": "Expira hoje!",
    "has_expiration": true
  }
}
```

### Envio (Timestamp Unix em ms)
```json
{
  "type": "limited_time_offer",
  "parameters": [
    {
      "type": "limited_time_offer",
      "limited_time_offer": {
        "expiration_time_ms": 1740000000000
      }
    }
  ]
}
```

---

## Mensagem Multiproduto (MPM) {#mpm}

> **Uso**: E-commerce, catálogo de produtos.

### Requisitos
- Catálogo Meta vinculado
- Usuário recebe carrinho nativo
- Webhook `order` com SKUs e quantidades

### Limites
| Atributo | Limite |
|----------|--------|
| Produtos | 30 SKUs |
| Seções | 10 |
| Título seção | 24 chars |

### Envio
```json
{
  "action": {
    "thumbnail_product_retailer_id": "SKU_CAPA",
    "sections": [
      {
        "title": "Mais Vendidos",
        "product_items": [
          { "product_retailer_id": "SKU_001" },
          { "product_retailer_id": "SKU_002" }
        ]
      }
    ]
  }
}
```

---

## Produto Único (SPM) {#spm}

> **Uso**: Destaque de item, abandono de carrinho.

### Limites
| Atributo | Limite |
|----------|--------|
| Body | 160 chars |
| Footer | 60 chars |

### Envio
```json
{
  "type": "header",
  "parameters": [
    {
      "type": "product",
      "product": {
        "catalog_id": "123456789",
        "product_retailer_id": "SKU_PRODUTO"
      }
    }
  ]
}
```

---

## Carrossel de Produto {#carrossel-produto}

> Igual ao carrossel de mídia, mas puxa dados do catálogo.

### Diferenças
- Header formato `product` (não IMAGE)
- Dados (imagem, preço, título) vêm do catálogo
- Permite carrinho nativo

---

## Permissão de Ligação (CPR) {#cpr}

> **Uso**: Solicitar permissão para ligar fora da janela 24h.

### Criação
```json
{
  "type": "call_permission_request"
}
```

---

## Tipos de Botão

| Tipo | Função | Webhook |
|------|--------|---------|
| `QUICK_REPLY` | Resposta rápida | Sim |
| `URL` | Link externo | Não |
| `PHONE_NUMBER` | Ligação | Não |
| `COPY_CODE` | Copiar código | Não |
| `FLOW` | Formulário nativo | Sim (flow) |
| `SPM` | Ver produto | Sim (order) |
| `MPM` | Ver catálogo | Sim (order) |

---

## Parâmetros Nomeados vs Posicionais

### NAMED (Recomendado)
```json
{
  "parameter_format": "NAMED",
  "components": [
    {
      "type": "BODY",
      "text": "Olá {{nome}}, seu pedido {{id_pedido}} está pronto!",
      "example": {
        "body_text_named_params": [
          { "param_name": "nome", "example": "João" },
          { "param_name": "id_pedido", "example": "12345" }
        ]
      }
    }
  ]
}
```

### POSITIONAL (Legado)
```json
{
  "parameter_format": "POSITIONAL",
  "components": [
    {
      "type": "BODY",
      "text": "Olá {{1}}, seu pedido {{2}} está pronto!",
      "example": { "body_text": ["João", "12345"] }
    }
  ]
}
```

---

## Checklist de Implementação

- [ ] Validar `status === 'APPROVED'` antes de enviar
- [ ] Usar `parameter_format: 'NAMED'` para novos templates
- [ ] Fornecer `example` para todas as variáveis na criação
- [ ] Calcular `index` correto para botões (base 0)
- [ ] Para mídia: fazer upload prévio e usar `media_id`
- [ ] Para LTO: calcular `expiration_time_ms` dinamicamente
- [ ] Para catálogo: ter `catalog_id` configurado

---

## Enviar Template para Aprovação (Flow Builder) {#envio-flow-builder}

> Como enviar templates criados no Flow Builder para aprovação da Meta.

### Via Interface (Double-Click)

1. **Crie o template** no Flow Builder (arraste body + botões)
2. **Double-click no nó** para abrir o `TemplateConfigDialog`
3. **Preencha os campos obrigatórios**:
   - Nome do template (apenas `a-z`, `0-9`, `_`)
   - Categoria (MARKETING, UTILITY, AUTHENTICATION)
   - Corpo da mensagem
   - Botões (opcional)
4. **Clique em "Enviar para Meta"**
5. Status muda para **PENDING** → aguarda aprovação

### Templates Especializados Suportados

| Tipo de Nó | FlowNodeType | Double-click abre dialog? |
|------------|--------------|---------------------------|
| Template (genérico) | `TEMPLATE` | ✅ Sim |
| Button Template | `BUTTON_TEMPLATE` | ✅ Sim |
| URL Template | `URL_TEMPLATE` | ✅ Sim |
| Call Template | `CALL_TEMPLATE` | ✅ Sim |
| Coupon Template | `COUPON_TEMPLATE` | ✅ Sim |

### Arquitetura do Fluxo

```
┌─────────────────────────────────────────────────────────────────┐
│  Flow Builder Canvas (double-click no nó)                       │
└───────────────────────────┬─────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│  FlowBuilderTab.tsx → handleNodeDoubleClick()                   │
│  Detecta se é TEMPLATE, BUTTON_TEMPLATE, URL_TEMPLATE, etc.     │
│  Abre TemplateConfigDialog                                      │
└───────────────────────────┬─────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│  TemplateConfigDialog.tsx                                       │
│  - Extrai dados do node (elements[] ou formato tradicional)     │
│  - Valida payload                                               │
│  - Botão "Enviar para Meta" → handleSubmitToMeta()              │
└───────────────────────────┬─────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│  POST /api/admin/mtf-diamante/templates                         │
│  - Converte variáveis (VariableConverter)                       │
│  - Envia para Meta Graph API                                    │
│  - Salva no banco (Template + WhatsAppOfficialInfo)             │
└───────────────────────────┬─────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│  Meta Graph API                                                 │
│  POST /{WABA_ID}/message_templates                              │
│  Retorna: { id, status: 'PENDING' }                             │
└─────────────────────────────────────────────────────────────────┘
```

### Arquivos Envolvidos

| Arquivo | Responsabilidade |
|---------|------------------|
| `FlowBuilderTab.tsx:543-555` | Detecta tipo de nó e abre dialog |
| `TemplateConfigDialog.tsx` | UI de configuração + envio para Meta |
| `TemplateConfigDialog.tsx:extractFromElements()` | Extrai dados do array `elements` |
| `/api/admin/mtf-diamante/templates/route.ts` | API que envia para a Meta |
| `createWhatsAppTemplate()` | Função que faz POST para Graph API |

### Código: Detectar Templates no Double-Click

```typescript
// FlowBuilderTab.tsx - handleNodeDoubleClick
const templateNodeTypes = [
  FlowNodeType.TEMPLATE,
  FlowNodeType.BUTTON_TEMPLATE,
  FlowNodeType.URL_TEMPLATE,
  FlowNodeType.CALL_TEMPLATE,
  FlowNodeType.COUPON_TEMPLATE,
];

if (templateNodeTypes.includes(node.type as FlowNodeType)) {
  setSelectedNodeId(nodeId);
  setTemplateDialogOpen(true);
  return;
}
```

### Código: Extrair Dados de Elements

```typescript
// TemplateConfigDialog.tsx - extractFromElements()
function extractFromElements(elements: InteractiveMessageElement[]): ExtractedTemplateData {
  let bodyText = '';
  let headerType = 'NONE';
  const buttons: TemplateButton[] = [];

  for (const el of elements) {
    switch (el.type) {
      case 'body':
        bodyText = el.text;
        break;
      case 'header_text':
        headerType = 'TEXT';
        break;
      case 'button':
        buttons.push({ type: 'QUICK_REPLY', text: el.title });
        break;
      case 'button_url':
        buttons.push({ type: 'URL', text: el.title, url: el.url });
        break;
      case 'button_phone':
        buttons.push({ type: 'PHONE_NUMBER', text: el.title, phoneNumber: el.phoneNumber });
        break;
      case 'button_copy_code':
        buttons.push({ type: 'COPY_CODE', text: el.title, exampleCode: el.couponCode });
        break;
    }
  }
  return { bodyText, headerType, buttons };
}
```

### Para Adicionar Suporte a Novos Tipos de Template

1. **Criar o tipo em `types/flow-builder.ts`**:
   ```typescript
   export interface MeuNovoTemplateNodeData extends FlowNodeDataBase {
     status?: TemplateApprovalStatus;
     templateName?: string;
     elements?: InteractiveMessageElement[];
     // ... campos específicos
   }
   ```

2. **Adicionar ao enum `FlowNodeType`**:
   ```typescript
   export enum FlowNodeType {
     MEU_NOVO_TEMPLATE = 'meu_novo_template',
   }
   ```

3. **Adicionar ao array `templateNodeTypes` em `FlowBuilderTab.tsx`**:
   ```typescript
   const templateNodeTypes = [
     FlowNodeType.TEMPLATE,
     FlowNodeType.BUTTON_TEMPLATE,
     FlowNodeType.MEU_NOVO_TEMPLATE, // ← Adicionar aqui
   ];
   ```

4. **Se necessário, estender `extractFromElements()`** para suportar novos tipos de elementos.

### Status do Template

| Status | Badge | Significado |
|--------|-------|-------------|
| `DRAFT` | 🔘 Rascunho | Criado localmente, não enviado |
| `PENDING` | 🟡 Pendente | Enviado, aguardando aprovação da Meta |
| `APPROVED` | 🟢 Aprovado | Pronto para uso em mensagens |
| `REJECTED` | 🔴 Rejeitado | Meta recusou, verificar motivo |

### Troubleshooting

**Dialog não abre no double-click?**
- Verificar se o tipo está no array `templateNodeTypes`
- Verificar se não está na lista `inlineOnlyNodes`

**Erro "Credenciais inválidas"?**
- Configurar `WhatsAppGlobalConfig` em Configurações → Credenciais

**Template rejeitado pela Meta?**
- Verificar nome (só minúsculas, números e `_`)
- Verificar texto (sem links, sem conteúdo sensível)
- Verificar examples das variáveis
