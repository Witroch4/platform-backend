# WhatsApp Phone Number ID Fix Summary

## Problema Identificado
O erro "Object with ID 'messages' does not exist" ocorria porque o `phoneNumberId` não estava sendo passado corretamente para as funções de envio de mensagem do WhatsApp. Isso resultava em URLs malformadas como:
- ❌ `https://graph.facebook.com/v22.0/messages` (incorreto)
- ✅ `https://graph.facebook.com/v22.0/{phoneNumberId}/messages` (correto)

## Correções Implementadas

### 1. Biblioteca WhatsApp Messages (`lib/whatsapp-messages.ts`)
- ✅ Adicionado `phoneNumberId?: string` às interfaces:
  - `TemplateMessageData`
  - `InteractiveMessageData` 
  - `TextMessageData`
- ✅ Atualizado as funções para usar o `phoneNumberId` passado como parâmetro em vez de `process.env.FROM_PHONE_NUMBER_ID`
- ✅ Adicionada validação para garantir que o `phoneNumberId` seja fornecido

### 2. Biblioteca WhatsApp Reactions (`lib/whatsapp-reactions-worker.ts`)
- ✅ Adicionado `phoneNumberId?: string` à interface `ReactionMessageData`
- ✅ Atualizado `sendReactionMessage` para usar o `phoneNumberId` passado como parâmetro

### 3. Configuração WhatsApp (`app/lib/whatsapp-config.ts`)
- ✅ Corrigido para usar `config.phoneNumberId` do banco de dados em vez de sempre usar `process.env.FROM_PHONE_NUMBER_ID`

### 4. Queue MTF Diamante (`lib/queue/mtf-diamante-webhook.queue.ts`)
- ✅ Adicionado `phoneNumberId?: string` aos metadados de todas as interfaces de task
- ✅ Atualizado todas as funções helper para incluir `phoneNumberId` no metadata

### 5. Worker MTF Diamante (`worker/WebhookWorkerTasks/mtf-diamante-webhook.task.ts`)
- ✅ Atualizado todas as chamadas de funções de envio para incluir `phoneNumberId` do metadata:
  - `sendTemplateMessage`
  - `sendInteractiveMessage`
  - `sendTextMessage`
  - `sendReactionMessage`

### 6. Webhook MTF Diamante (`app/api/admin/mtf-diamante/dialogflow/webhook/route.ts`)
- ✅ Adicionado `phoneNumberId` ao metadata quando os tasks são criados:
  - Template tasks
  - Interactive tasks
  - Enhanced interactive tasks
- ✅ Atualizado `processButtonClickRequest` para receber e usar `phoneNumberId`
- ✅ Adicionado `phoneNumberId` aos tasks de reação

## Fluxo de Dados Corrigido

1. **Webhook recebe requisição** → Obtém configurações do banco (incluindo `phoneNumberId`)
2. **Task é criado** → `phoneNumberId` é incluído no metadata
3. **Worker processa task** → `phoneNumberId` é extraído do metadata
4. **Função de envio é chamada** → `phoneNumberId` é passado como parâmetro
5. **URL da API é construída** → `https://graph.facebook.com/v22.0/{phoneNumberId}/messages`

## Sistema de Fallback

O sistema mantém um fallback robusto:
1. **Primeira opção**: `phoneNumberId` do banco de dados (configuração específica)
2. **Segunda opção**: `process.env.FROM_PHONE_NUMBER_ID` (variável de ambiente)
3. **Validação**: Erro é lançado se nenhum `phoneNumberId` estiver disponível

## Teste da Correção

Para testar se a correção funcionou:
1. Envie uma mensagem que acione uma intenção mapeada
2. Verifique nos logs se a URL da API está correta
3. Confirme se a mensagem é enviada com sucesso

## Configuração Necessária

Certifique-se de que o `phoneNumberId` esteja configurado corretamente:
- No banco de dados (tabela `WhatsAppConfig`)
- Ou na variável de ambiente `FROM_PHONE_NUMBER_ID`

O `phoneNumberId` é diferente do `whatsappBusinessAccountId` e pode ser obtido no Meta Business Manager.