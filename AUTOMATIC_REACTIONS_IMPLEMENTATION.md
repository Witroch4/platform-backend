# Implementação de Reações Automáticas para Respostas Rápidas

## Resumo

Foi implementado um sistema completo de reações automáticas que detecta quando um usuário clica em botões de resposta rápida e envia automaticamente uma reação emoji para a mensagem original do cliente.

## Componentes Implementados

### 1. Configuração de Mapeamento Botão → Emoji
**Arquivo:** `app/config/button-reaction-mapping.ts`

- Sistema configurável para mapear IDs de botões a emojis específicos
- Mapeamentos padrão incluem:
  - `aceito_fazer` → ❤️
  - `recusar_proposta` → 👎
  - `id_enviar_prova` → 📄
  - `id_qual_pix` → 💰
  - `id_finalizar` → ✋
  - `change-button` → 🔄
  - `cancel-button` → ❌

### 2. Serviço de Envio de Reações
**Arquivo:** `lib/whatsapp-reactions.ts`

- Função `sendReactionMessage()` para enviar reações via WhatsApp API
- Formatação automática de números de telefone para E.164
- Logging de tentativas de reação para debugging
- Suporte a chaves de API personalizadas

### 3. Sistema de Filas para Processamento Assíncrono
**Arquivos:** 
- `lib/queue/mtf-diamante-webhook.queue.ts` (atualizado)
- `worker/WebhookWorkerTasks/mtf-diamante-webhook.task.ts` (atualizado)

- Novo tipo de task: `send_reaction`
- Função `addSendReactionTask()` para enfileirar reações
- Worker `processSendReaction()` para processar envio de reações

### 4. Detecção de Cliques em Botões no Webhook
**Arquivo:** `app/api/admin/mtf-diamante/whatsapp/webhook/route.ts` (atualizado)

- Função `detectAndProcessButtonReply()` para detectar cliques em botões
- Extração automática do ID do botão e WAMID da mensagem original
- Enfileiramento automático de tasks de reação quando mapeamento existe

### 5. Armazenamento de WAMIDs
**Modelo:** `WebhookMessage` (já existente no Prisma)

- Campo `whatsappMessageId` armazena WAMIDs para futuras reações
- Índices otimizados para busca rápida por WAMID
- Payload completo armazenado para debugging

## Fluxo de Funcionamento

1. **Recebimento do Webhook**: Sistema recebe payload do Dialogflow com clique em botão
2. **Detecção de Botão**: Sistema identifica que é uma mensagem `interactive.type = "button_reply"`
3. **Extração de Dados**: Sistema extrai:
   - ID do botão clicado (`interactive.button_reply.id`)
   - WAMID da mensagem original (`context.id`)
   - Telefone do destinatário
   - Chave da API do WhatsApp
4. **Verificação de Mapeamento**: Sistema verifica se existe mapeamento emoji para o botão
5. **Enfileiramento**: Se existe mapeamento, sistema enfileira task de reação
6. **Processamento Assíncrono**: Worker processa a task e envia reação via WhatsApp API
7. **Logging**: Sistema registra tentativa de reação para monitoramento

## Estrutura do Payload de Reação

```json
{
  "messaging_product": "whatsapp",
  "recipient_type": "individual", 
  "to": "5584994072876",
  "type": "reaction",
  "reaction": {
    "message_id": "wamid.HBgNNTU4NDk5NDA3Mjg3NhUCABIYFjNBMzMzOTM4MzI2RjVBNzE4OTVFAA==",
    "emoji": "❤️"
  }
}
```

## Configuração

### Adicionando Novos Mapeamentos

Para adicionar novos mapeamentos botão → emoji, edite o arquivo `app/config/button-reaction-mapping.ts`:

```typescript
export const DEFAULT_BUTTON_REACTIONS: ButtonReactionMapping[] = [
  // Mapeamentos existentes...
  {
    buttonId: 'novo_botao_id',
    emoji: '🎉',
    description: 'Novo botão - Celebração'
  }
];
```

### Personalizando por Conta

O sistema suporta mapeamentos personalizados por conta através do parâmetro `customMappings` nas funções de mapeamento.

## Testes

Foram criados testes abrangentes:

- `test-button-reactions.ts`: Testa mapeamentos básicos
- `test-webhook-reactions.ts`: Testa detecção de cliques em botões
- `test-complete-reaction-flow.ts`: Testa fluxo completo

Todos os testes passaram com sucesso ✅

## Monitoramento

O sistema inclui logging detalhado em todos os pontos:

- Detecção de cliques em botões
- Enfileiramento de tasks
- Processamento de reações
- Tentativas de envio via API
- Erros e falhas

## Requisitos Atendidos

✅ **Detectar cliques em botões de resposta rápida**
- Sistema detecta `interactive.type = "button_reply"`

✅ **Mapear IDs de botões a emojis específicos**
- Sistema configurável com mapeamentos padrão

✅ **Enviar reação para mensagem original**
- API call subsequente com `type: "reaction"`

✅ **Sistema configurável para múltiplos mapeamentos**
- Suporte a mapeamentos personalizados por conta

✅ **Armazenar WAMIDs para futuras reações**
- Campo `whatsappMessageId` no modelo `WebhookMessage`

## Status

🎉 **IMPLEMENTAÇÃO COMPLETA E TESTADA**

O sistema está pronto para uso em produção e atende todos os requisitos especificados na task.