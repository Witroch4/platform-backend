# Correção: Componentes WhatsApp - Formato Correto da API

## Problema Identificado

O erro do WhatsApp era:
```
header: Format mismatch, expected IMAGE, received UNKNOWN
```

Os componentes estavam sendo encontrados corretamente, mas não estavam sendo processados no formato correto para a API do WhatsApp.

## Causa Raiz

A função `sendTemplateMessage` estava desatualizada e não processava corretamente os componentes dos templates oficiais do WhatsApp. Ela tentava usar um array vazio de componentes e não tinha acesso à URL pública da imagem.

## Estrutura dos Componentes

### Componentes no Banco (convertidos para array):
```json
[
  {
    "type": "HEADER",
    "format": "IMAGE",
    "example": {"header_handle": ["https://..."]}
  },
  {
    "type": "BODY",
    "text": "Olá! 😊\n *Clique no botão abaixo*..."
  },
  {
    "type": "FOOTER",
    "text": "Dra. Amanda Sousa Advocacia..."
  },
  {
    "type": "BUTTONS",
    "buttons": [...]
  },
  "https://objstoreapi.witdev.com.br/..." // URL pública da imagem
]
```

### Formato Esperado pela API WhatsApp:
```json
{
  "template": {
    "name": "pix",
    "language": {"code": "pt_BR"},
    "components": [
      {
        "type": "header",
        "parameters": [{
          "type": "image",
          "image": {
            "link": "https://objstoreapi.witdev.com.br/..."
          }
        }]
      }
    ]
  }
}
```

## Correções Aplicadas

### 1. Processamento de Componentes na API de Disparo

**ANTES:**
```typescript
const success = await sendTemplateMessage(
  lead.phone || "",
  template.name,
  sendOpts
);
```

**DEPOIS:**
```typescript
// Construir payload correto para WhatsApp baseado nos componentes
const whatsappComponents: any[] = [];

// Processar cada componente
for (const component of components) {
  if (typeof component === 'string') continue; // Pular URLs
  
  switch (component.type) {
    case 'HEADER':
      if (component.format === 'IMAGE') {
        // Buscar a URL pública da imagem no array
        const imageUrl = components.find(c => typeof c === 'string' && c.startsWith('https://'));
        if (imageUrl) {
          whatsappComponents.push({
            type: 'header',
            parameters: [{
              type: 'image',
              image: { link: imageUrl }
            }]
          });
        }
      }
      break;
    case 'BODY':
      // Para templates sem variáveis, não precisa enviar parâmetros
      if (sendOpts.bodyVars && sendOpts.bodyVars.length > 0) {
        whatsappComponents.push({
          type: 'body',
          parameters: sendOpts.bodyVars.map(text => ({
            type: 'text',
            text: text
          }))
        });
      }
      break;
  }
}

const customOpts = { ...sendOpts, whatsappComponents };
const success = await sendTemplateMessage(lead.phone || "", template.name, customOpts);
```

### 2. Modificação da Função sendTemplateMessage

**ANTES:**
```typescript
template: {
  name: templateName,
  language: { code: tpl.language || 'pt_BR' },
  components: comps, // Array vazio ou incorreto
}
```

**DEPOIS:**
```typescript
template: {
  name: templateName,
  language: { code: tpl.language || 'pt_BR' },
  components: opts.whatsappComponents || comps, // Usar componentes customizados se fornecidos
}
```

## Lógica de Processamento

### 1. Identificação de Componentes
- **HEADER com IMAGE**: Busca URL pública no array e cria parâmetro `image.link`
- **BODY**: Adiciona parâmetros apenas se houver variáveis (`bodyVars`)
- **FOOTER e BUTTONS**: Não precisam parâmetros (já aprovados no template)

### 2. URL da Imagem
A URL pública está misturada no array de componentes como string:
```
"https://objstoreapi.witdev.com.br/chatwit-social/901a48e1-0a46-46d5-bda1-bc2d0fe3b496-whatsapp_media_682491667610791_..."
```

### 3. Formato Final
O payload final terá:
```json
{
  "messaging_product": "whatsapp",
  "to": "5585997550136",
  "type": "template",
  "template": {
    "name": "pix",
    "language": {"code": "pt_BR"},
    "components": [
      {
        "type": "header",
        "parameters": [{
          "type": "image",
          "image": {
            "link": "https://objstoreapi.witdev.com.br/..."
          }
        }]
      }
    ]
  }
}
```

## Resultado Esperado

Após as correções, os logs devem mostrar:
```
[Disparo] Adicionado header com imagem: https://objstoreapi.witdev.com.br/...
[Disparo] Componentes WhatsApp construídos: [{"type":"header","parameters":[...]}]
[sendTemplateMessage] Payload final enviado: {...}
[Disparo] Resultado do envio: SUCESSO
```

## Status

✅ **Processamento de componentes implementado** - Converte componentes do banco para formato WhatsApp
✅ **URL da imagem extraída** - Encontra e usa a URL pública correta
✅ **Função sendTemplateMessage atualizada** - Aceita componentes customizados
🔄 **Aguardando teste** - Template deve ser enviado com sucesso agora

O template agora deve ser enviado corretamente com a imagem e todos os componentes no formato esperado pela API do WhatsApp.