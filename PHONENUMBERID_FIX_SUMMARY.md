# Correção do PhoneNumberId no Worker - Resumo

## Problema Identificado

Em produção, o worker estava falhando com o erro:
```
Message sending failed: Unsupported post request. Object with ID 'phone_EAAGIBII4GXQBO2q' does not exist
```

O problema era que o worker estava usando uma parte do token como ID do telefone, gerando IDs falsos como `phone_EAAGIBII4GXQBO2q` em vez de usar o `phoneNumberId` real armazenado no banco de dados.

## Causa Raiz

A função `extractWhatsAppConfigFromUrl` estava gerando IDs artificiais baseados no token do WhatsApp:

```typescript
// CÓDIGO PROBLEMÁTICO (REMOVIDO)
const tokenHash = whatsappApiKey.substring(0, 16);
return {
  phoneNumberId: `phone_${tokenHash}`, // Gerava: phone_EAAGIBII4GXQBO2q
  businessAccountId: `business_${tokenHash}`,
};
```

## Solução Implementada

### 1. Nova Função de Busca no Banco

Criada a função `getWhatsAppConfigFromDatabase` que busca a configuração real do WhatsApp:

```typescript
async function getWhatsAppConfigFromDatabase(
  chatwootInboxId: string
): Promise<{
  phoneNumberId: string;
  businessAccountId: string;
  whatsappToken: string;
} | null>
```

Esta função:
- Busca a caixa de entrada pelo `inboxId` do Chatwoot
- Retorna a configuração específica da caixa se existir
- Faz fallback para a configuração padrão do usuário
- Retorna o `phoneNumberId` real armazenado no banco

### 2. Funções Atualizadas

Todas as funções que enviam mensagens foram atualizadas para usar o `phoneNumberId` correto:

#### `processSendMessage`
- Busca o `phoneNumberId` do banco antes de enviar mensagens
- Passa o ID correto para `sendTemplateMessage`, `sendTextMessage` e `sendInteractiveMessage`

#### `processSendReaction`
- Busca o `phoneNumberId` do banco antes de enviar reações
- Passa o ID correto para `sendReactionMessage`

#### `processButtonReactions`
- Atualizada para aceitar `chatwootInboxId` como parâmetro
- Busca o `phoneNumberId` do banco antes de processar reações de botão
- Atualizada para usar o ID correto em `sendReactionMessage` e `sendTextMessage`

#### `processLegacySendReaction`
- Atualizada para buscar o `phoneNumberId` do banco
- Usa o ID correto para enviar reações no sistema legacy

### 3. Validação de Erro e Fallback

Todas as funções agora validam se o `phoneNumberId` foi encontrado e têm fallback para variáveis de ambiente:

```typescript
// Buscar do banco primeiro
let phoneNumberId = metadata?.phoneNumberId;
if (!phoneNumberId && metadata?.caixaId) {
  const whatsappConfig = await getWhatsAppConfigFromDatabase(metadata.caixaId);
  if (whatsappConfig) {
    phoneNumberId = whatsappConfig.phoneNumberId;
  }
}

// Fallback para variável de ambiente
if (!phoneNumberId) {
  phoneNumberId = process.env.FROM_PHONE_NUMBER_ID;
}

if (!phoneNumberId) {
  throw new Error("PhoneNumberId não encontrado");
}
```

### 4. Correções de Tipos TypeScript

- Adicionado `caixaId` ao metadata do `SendReactionTask`
- Adicionado `caixaId` ao `reactionData` do `WebhookTaskData`
- Corrigidos erros de compilação TypeScript

## Resultado do Teste

O teste confirma que a correção está funcionando:

```
❌ PROBLEMA ANTERIOR:
phoneNumberId gerado incorretamente: phone_EAAGIBII4GXQBO2q

✅ SOLUÇÃO ATUAL:
phoneNumberId: 274633962398273 (ID real do WhatsApp)
```

## Arquivos Modificados

- `worker/WebhookWorkerTasks/mtf-diamante-webhook.task.ts`
  - Removida função `extractWhatsAppConfigFromUrl`
  - Adicionada função `getWhatsAppConfigFromDatabase`
  - Atualizadas todas as funções de envio de mensagem
  - Atualizadas todas as funções de envio de reação

- `lib/queue/mtf-diamante-webhook.queue.ts`
  - Adicionado `caixaId` ao metadata do `SendReactionTask`
  - Adicionado `caixaId` ao `reactionData` do `WebhookTaskData`

## Impacto

- ✅ Resolve o erro "Object with ID does not exist" em produção
- ✅ Usa IDs reais do WhatsApp em vez de IDs artificiais
- ✅ Mantém compatibilidade com sistema legacy
- ✅ Melhora a confiabilidade do envio de mensagens
- ✅ Adiciona validação adequada de configuração

## Próximos Passos

1. Deploy da correção em produção
2. Monitorar logs para confirmar que o erro foi resolvido
3. Verificar se todas as mensagens estão sendo enviadas corretamente
4. Considerar adicionar mais logs para facilitar debugging futuro