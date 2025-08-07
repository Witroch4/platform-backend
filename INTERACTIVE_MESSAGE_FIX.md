# Correção do Formato de Mensagem Interativa

## Problema Identificado
O sistema estava enviando mensagens interativas com campos internos do banco de dados (`templateId`, `bodyId`, `createdAt`, etc.) que não são válidos na API da Meta, causando o erro:
```
WhatsApp API error: (#100) Unexpected key "templateId" on param "interactive".
```

## Solução Implementada

### 1. Função de Conversão de Formato
Criada a função `convertToWhatsAppInteractiveFormat()` que converte o formato interno do banco de dados para o formato esperado pela API da Meta.

**Formato Interno (Banco de Dados):**
```json
{
  "templateId": "cme04lfo1002wpd0kz9qfzh4m",
  "bodyId": "cme04lfo2002ypd0k8ds4tnqh",
  "createdAt": "2025-08-06T15:31:21.362Z",
  "updatedAt": "2025-08-06T15:31:21.362Z",
  "body": { "text": "Mensagem" },
  "footer": { "text": "Footer" },
  "actionReplyButton": {
    "buttons": [...]
  }
}
```

**Formato da API da Meta:**
```json
{
  "type": "button",
  "body": { "text": "Mensagem" },
  "footer": { "text": "Footer" },
  "action": {
    "buttons": [
      {
        "type": "reply",
        "reply": {
          "id": "btn_id",
          "title": "Button Text"
        }
      }
    ]
  }
}
```

### 2. Sanitização Aprimorada
Atualizada a função `sanitizeInteractiveMessage()` para remover especificamente os campos internos que não devem ser enviados para a API:

- `templateId`
- `bodyId` 
- `createdAt`
- `updatedAt`
- `interactiveContentId`
- `actionCtaUrl`
- `actionReplyButton`
- `actionList`
- `actionFlow`
- `actionLocationRequest`

### 3. Suporte a Diferentes Tipos
A conversão suporta:

**Mensagens com Botões:**
- Converte `actionReplyButton.buttons` para `action.buttons`
- Garante estrutura correta `{ type: "reply", reply: { id, title } }`

**Mensagens com Lista:**
- Converte `actionList.sections` para `action.sections`
- Define `type: "list"` automaticamente

**Headers:**
- Suporte a header de texto e imagem
- Conversão correta para formato da API

### 4. Teste Automatizado
Criado script `scripts/test-interactive-message-format.ts` para validar a conversão.

## Arquivos Modificados
- `worker/WebhookWorkerTasks/respostaRapida.worker.task.ts`
  - Método `processInteractiveMessageTemplate()` atualizado
  - Nova função `convertToWhatsAppInteractiveFormat()`
  - Função `sanitizeInteractiveMessage()` aprimorada

## Como Testar
```bash
npx tsx scripts/test-interactive-message-format.ts
```

## Resultado
✅ Mensagens interativas agora seguem o formato correto da API da Meta
✅ Campos internos do banco são removidos antes do envio
✅ Suporte completo a botões e listas
✅ Headers de texto e imagem funcionando
✅ Teste automatizado confirma compatibilidade 100%