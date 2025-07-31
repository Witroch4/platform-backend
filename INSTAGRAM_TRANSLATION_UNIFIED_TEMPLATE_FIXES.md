# Instagram Translation - Adaptação para Template Unificado

## Resumo das Mudanças

Este documento descreve as mudanças feitas para adaptar o sistema de tradução do Instagram ao novo modelo unificado de Template no Prisma.

## Problema Identificado

O sistema estava falhando com o erro:
```
CONVERSION_FAILED: Message conversion failed: Unsupported message type for Instagram: unified_template
```

Isso acontecia porque o código ainda estava esperando os tipos antigos (`interactive`, `enhanced_interactive`, `template`), mas o novo schema do Prisma usa um modelo `Template` unificado.

## Mudanças Implementadas

### 1. Adicionada Função `recordDatabaseQuery`

**Arquivo:** `lib/instagram/optimized-database-queries.ts`

Criada a função que estava sendo importada mas não existia:

```typescript
export function recordDatabaseQuery(
  queryName: string,
  executionTime: number,
  success: boolean,
  error?: Error
): void {
  // Implementação para registrar performance de queries
}
```

### 2. Novo Processamento para `unified_template`

**Arquivo:** `worker/WebhookWorkerTasks/instagram-translation.task.ts`

Adicionado suporte ao tipo `unified_template` no switch case:

```typescript
case 'unified_template':
  if (messageMapping.unifiedTemplate) {
    fulfillmentMessages = await convertUnifiedTemplateToInstagram(
      messageMapping.unifiedTemplate,
      correlationId,
      updatedLogContext
    );
  }
  break;
```

### 3. Nova Função `convertUnifiedTemplateToInstagram`

Criada função principal para processar templates unificados que suporta:

- **INTERACTIVE_MESSAGE**: Processa `interactiveContent`
- **AUTOMATION_REPLY**: Processa `simpleReplyText`  
- **WHATSAPP_OFFICIAL**: Retorna erro (não suportado no Instagram)

### 4. Funções Auxiliares Adicionadas

#### `convertInteractiveContentToInstagram`
- Processa o novo modelo `InteractiveContent`
- Extrai `body.text`, `header`, `footer`
- Converte botões do `actionReplyButton.buttons`

#### `convertSimpleReplyToInstagram`
- Processa mensagens simples de texto
- Aplica as mesmas regras de template (Generic vs Button)

#### `convertUnifiedButtonsToInstagram`
- Converte botões do novo formato unificado
- Limita a 3 botões para Instagram
- Mapeia tipos `web_url` e `postback`

### 5. Funções Auxiliares para Extração de Dados

#### `getBodyLengthFromMapping`
Extrai o comprimento do texto do corpo de diferentes tipos de mapping:
- `unifiedTemplate.interactiveContent.body.text`
- `unifiedTemplate.simpleReplyText`
- Fallback para tipos legados

#### `getHasImageFromMapping`
Verifica se há imagem em diferentes tipos de mapping:
- `unifiedTemplate.interactiveContent.header`
- Fallback para tipos legados

### 6. Correção na Query do Banco

**Arquivo:** `lib/instagram/optimized-database-queries.ts`

Corrigido para incluir `simpleReplyText` no `unifiedTemplate`:

```typescript
result.unifiedTemplate = {
  // ... outros campos
  simpleReplyText: mapping.template.simpleReplyText, // ← Adicionado
  // ...
};
```

### 7. Atualização da Interface

**Arquivo:** `lib/dialogflow-database-queries.ts`

Adicionado `simpleReplyText` na interface `CompleteMessageMapping`:

```typescript
unifiedTemplate?: {
  // ... outros campos
  simpleReplyText?: string; // ← Adicionado
  // ...
};
```

## Tipos de Template Suportados

### ✅ INTERACTIVE_MESSAGE
- Usa `interactiveContent` com `body`, `header`, `footer`
- Converte botões de `actionReplyButton.buttons`
- Suporta Generic Template (≤80 chars) e Button Template (81-640 chars)

### ✅ AUTOMATION_REPLY  
- Usa `simpleReplyText` diretamente
- Sem botões ou imagens
- Suporta Generic Template (≤80 chars) e Button Template (81-640 chars)

### ❌ WHATSAPP_OFFICIAL
- Não suportado para Instagram
- Retorna erro explicativo

## Fluxo de Conversão

1. **Detecção do Tipo**: Sistema identifica `unified_template`
2. **Roteamento**: Chama `convertUnifiedTemplateToInstagram`
3. **Processamento por Tipo**:
   - `INTERACTIVE_MESSAGE` → `convertInteractiveContentToInstagram`
   - `AUTOMATION_REPLY` → `convertSimpleReplyToInstagram`
   - `WHATSAPP_OFFICIAL` → Erro
4. **Determinação do Template**: Generic (≤80) vs Button (81-640)
5. **Conversão de Botões**: Mapeia para formato Instagram
6. **Validação**: Verifica estrutura final
7. **Retorno**: `DialogflowFulfillmentMessage[]`

## Compatibilidade

O sistema mantém **compatibilidade total** com os tipos legados:
- `interactive` (mensagens interativas antigas)
- `enhanced_interactive` (mensagens interativas melhoradas)
- `template` (templates WhatsApp)

## Monitoramento

Todas as conversões são monitoradas com:
- Métricas de performance
- Logs estruturados com correlation ID
- Tracking de erros por categoria
- Cache de resultados de conversão

## Próximos Passos

1. **Testar** o sistema com mensagens reais
2. **Monitorar** logs para verificar funcionamento
3. **Otimizar** cache para novos tipos de template
4. **Documentar** exemplos de uso para desenvolvedores

## Estrutura de Dados

### Template Unificado (Exemplo)
```json
{
  "id": "template_123",
  "name": "Welcome Message",
  "type": "INTERACTIVE_MESSAGE",
  "scope": "PRIVATE",
  "language": "pt_BR",
  "interactiveContent": {
    "body": { "text": "Bem-vindo!" },
    "header": { "type": "image", "content": "https://..." },
    "footer": { "text": "Equipe Suporte" },
    "actionReplyButton": {
      "buttons": [
        { "id": "btn1", "title": "Ajuda", "type": "postback" }
      ]
    }
  }
}
```

### Resultado Instagram
```json
{
  "fulfillmentMessages": [{
    "custom_payload": {
      "instagram": {
        "template_type": "generic",
        "elements": [{
          "title": "Bem-vindo!",
          "subtitle": "Equipe Suporte",
          "image_url": "https://...",
          "buttons": [{
            "type": "postback",
            "title": "Ajuda",
            "payload": "btn1"
          }]
        }]
      }
    }
  }]
}
```

---

**Status:** ✅ Implementado e pronto para teste
**Data:** 30/01/2025
**Versão:** 1.0.0