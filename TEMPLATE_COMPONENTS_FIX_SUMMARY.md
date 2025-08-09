# Correção dos Componentes do Template - WhatsApp Parameter Format Error

## Problema Atual

Após corrigir o acesso ao template, agora o erro é:
```
(#132012) Parameter format does not match format in the created template
```

O payload enviado está com `"components": []` (vazio), mas o template no WhatsApp tem parâmetros que precisam ser preenchidos.

## Causa Raiz

### 1. Componentes não sendo encontrados
A API estava buscando componentes no campo `simpleReplyText`, mas para templates do WhatsApp oficial, os componentes estão em `WhatsAppOfficialInfo.components`.

### 2. Estrutura dos dados
```
Template
├── name: "pix"
├── simpleReplyText: null (para templates oficiais)
└── WhatsAppOfficialInfo
    ├── metaTemplateId: "682491667610791"
    └── components: { ... } (componentes reais do WhatsApp)
```

## Correções Aplicadas

### 1. Busca de Componentes Corrigida

**ANTES:**
```typescript
if (templateCompleto?.simpleReplyText) {
  const components = JSON.parse(templateCompleto.simpleReplyText);
  // ...
}
```

**DEPOIS:**
```typescript
let components: any[] = [];

// Para templates do WhatsApp oficial, usar os componentes do WhatsAppOfficialInfo
if (templateCompleto?.whatsappOfficialInfo?.components) {
  components = Array.isArray(templateCompleto.whatsappOfficialInfo.components) 
    ? templateCompleto.whatsappOfficialInfo.components 
    : JSON.parse(JSON.stringify(templateCompleto.whatsappOfficialInfo.components));
}
// Fallback para templates simples
else if (templateCompleto?.simpleReplyText) {
  components = JSON.parse(templateCompleto.simpleReplyText);
}
```

### 2. Include do WhatsAppOfficialInfo

Adicionado `include` na busca do template:
```typescript
const templateCompleto = await prisma.template.findFirst({
  where: { ... },
  include: {
    whatsappOfficialInfo: true, // Incluir informações do WhatsApp
  },
});
```

### 3. Debug Melhorado

Adicionado logs para identificar:
- Quantos componentes foram encontrados
- Estrutura dos componentes
- Placeholders detectados
- Variáveis sendo preenchidas

## Próximos Passos

### 1. Verificar Estrutura dos Componentes
Os componentes do WhatsApp oficial podem ter uma estrutura diferente do esperado. Precisa verificar:
- Como os componentes estão armazenados no banco
- Se a estrutura está correta para o WhatsApp API

### 2. Possível Problema na Função sendTemplateMessage
A função `sendTemplateMessage` em `lib/whatsapp.ts` pode estar desatualizada:
- Tem comentários sobre campos removidos do schema
- Pode não estar processando corretamente os componentes

### 3. Verificar Nome do Template
O template pode precisar ser enviado com o nome correto do WhatsApp, não apenas "pix".

## Estrutura Esperada dos Componentes

Para um template com variáveis, os componentes devem ter estrutura similar a:
```json
[
  {
    "type": "BODY",
    "text": "Olá {{1}}, clique no botão abaixo para copiar automaticamente a chave PIX..."
  },
  {
    "type": "BUTTONS",
    "buttons": [
      {
        "type": "COPY_CODE",
        "text": "Copiar código da oferta"
      }
    ]
  }
]
```

## Debug Atual

Com as correções aplicadas, os logs agora mostrarão:
- `[Disparo] Usando componentes do WhatsApp oficial: X`
- `[Disparo] Componentes encontrados: [estrutura completa]`
- `[Disparo] Body component: {...}`
- `[Disparo] Placeholders encontrados: ["{{1}}", ...]`
- `[Disparo] Auto-preenchendo X variáveis com: "Nome do Lead"`

## Status

✅ **Busca de componentes corrigida** - Agora busca no local correto
✅ **Debug melhorado** - Logs detalhados para troubleshooting
🔄 **Aguardando teste** - Verificar se os componentes são encontrados corretamente
❓ **Próxima correção** - Pode precisar ajustar a função sendTemplateMessage