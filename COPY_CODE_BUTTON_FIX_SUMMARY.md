# Correção: Botão COPY_CODE - Parâmetro coupon_code

## Problema Identificado

Após corrigir o header com imagem, o novo erro era:
```
buttons: Button at index 0 of type copy_code requires a non-empty parameter coupon_code
```

## Causa Raiz

O botão `COPY_CODE` no template requer o parâmetro `coupon_code` com o valor do código que será copiado. Este valor está disponível no campo `example` do botão.

## Estrutura do Botão no Banco

```json
{
  "type": "BUTTONS",
  "buttons": [
    {
      "text": "Copiar código da oferta",
      "type": "COPY_CODE",
      "example": ["57944155000101"]  // ← Valor necessário para coupon_code
    },
    {
      "text": "Enviar Prova",
      "type": "QUICK_REPLY"
    }
  ]
}
```

## Formato Esperado pela API WhatsApp

Para botões COPY_CODE, a API espera:
```json
{
  "type": "button",
  "sub_type": "copy_code",
  "index": "0",
  "parameters": [
    {
      "type": "coupon_code",
      "coupon_code": "57944155000101"
    }
  ]
}
```

## Correção Aplicada

### Processamento de Botões Adicionado

**ANTES:**
```typescript
// FOOTER e BUTTONS não precisam de parâmetros para templates aprovados
```

**DEPOIS:**
```typescript
case "BUTTONS":
  // Processar botões que precisam de parâmetros
  if (component.buttons && Array.isArray(component.buttons)) {
    component.buttons.forEach((button: any, index: number) => {
      if (button.type === 'COPY_CODE' && button.example && button.example.length > 0) {
        whatsappComponents.push({
          type: 'button',
          sub_type: 'copy_code',
          index: String(index),
          parameters: [{
            type: 'coupon_code',
            coupon_code: button.example[0] // "57944155000101"
          }]
        });
        console.log(`[Disparo] Adicionado botão COPY_CODE (índice ${index}) com código: ${button.example[0]}`);
      }
    });
  }
  break;
```

## Lógica de Processamento

### 1. Identificação do Botão COPY_CODE
- Verifica se `button.type === 'COPY_CODE'`
- Verifica se existe `button.example` com pelo menos um valor

### 2. Extração do Código
- Usa `button.example[0]` como valor do `coupon_code`
- No caso atual: `"57944155000101"`

### 3. Construção do Parâmetro
- Cria componente com `type: 'button'` e `sub_type: 'copy_code'`
- Adiciona parâmetro `coupon_code` com o valor extraído

## Payload Final Esperado

Após a correção, o payload deve incluir:
```json
{
  "template": {
    "name": "pix",
    "components": [
      {
        "type": "header",
        "parameters": [{"type": "image", "image": {"link": "https://..."}}]
      },
      {
        "type": "button",
        "sub_type": "copy_code",
        "index": "0",
        "parameters": [
          {
            "type": "coupon_code",
            "coupon_code": "57944155000101"
          }
        ]
      }
    ]
  }
}
```

## Logs Esperados

Com a correção, os logs devem mostrar:
```
[Disparo] Adicionado header com imagem: https://objstoreapi.witdev.com.br/...
[Disparo] Adicionado botão COPY_CODE (índice 0) com código: 57944155000101
[Disparo] Componentes WhatsApp construídos: [{"type":"header",...}, {"type":"button",...}]
[Disparo] Resultado do envio: SUCESSO
```

## Tipos de Botões Suportados

### COPY_CODE (implementado)
- Requer parâmetro `coupon_code`
- Valor extraído de `button.example[0]`

### QUICK_REPLY (não requer parâmetros)
- Botão simples, não precisa de processamento especial
- Texto e ação já definidos no template aprovado

## Status

✅ **Header com imagem funcionando** - Imagem sendo enviada corretamente
✅ **Processamento de botão COPY_CODE implementado** - Parâmetro coupon_code adicionado
🔄 **Aguardando teste** - Template deve ser enviado com sucesso agora
📋 **Próximo passo** - Verificar se há outros tipos de botões que precisam de parâmetros

O template agora deve ser enviado corretamente com a imagem no header e o botão COPY_CODE com o código `57944155000101`.