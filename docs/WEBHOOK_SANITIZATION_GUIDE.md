# Guia de Sanitização do Webhook

Este documento descreve o sistema de sanitização implementado na lib `webhook-utils.ts` para processar payloads do webhook do Dialogflow de forma segura.

## Visão Geral

O sistema de sanitização foi refatorado do webhook principal para a lib `webhook-utils.ts` para centralizar e padronizar o processamento de dados de entrada, garantindo segurança e consistência.

## Funções de Sanitização

### 1. Sanitização Básica

#### `sanitizePhoneNumber(phone: string | number): string`
- Remove caracteres não numéricos
- Valida comprimento (10-15 dígitos)
- Retorna string vazia se inválido

#### `sanitizeEmail(email: string): string`
- Converte para minúsculas
- Remove espaços em branco
- Valida formato básico de email
- Retorna string vazia se inválido

#### `sanitizeApiKey(apiKey: string): string`
- Remove espaços em branco
- Valida comprimento mínimo (10 caracteres)
- Retorna string vazia se muito curto

#### `sanitizeTextContent(text: string): string`
- Remove caracteres potencialmente perigosos (`<>`)
- Remove protocolos javascript:
- Remove event handlers (on*=)
- Limita comprimento a 4096 caracteres

#### `sanitizeButtonId(buttonId: string): string`
- Permite apenas alfanuméricos, underscore, hífen e ponto
- Limita comprimento a 255 caracteres

#### `sanitizeIntentName(intentName: string): string`
- Permite alfanuméricos, underscore, hífen, ponto e espaço
- Limita comprimento a 255 caracteres
- Retorna 'Unknown' se inválido

### 2. Sanitização Abrangente

#### `sanitizeWebhookPayloadComprehensive(payload: any): any`
Aplica sanitização específica baseada no tipo de campo:

**Campos sanitizados:**
- `originalDetectIntentRequest.payload.from` → sanitizePhoneNumber
- `originalDetectIntentRequest.payload.phone` → sanitizePhoneNumber
- `originalDetectIntentRequest.payload.whatsapp_api_key` → sanitizeApiKey
- `originalDetectIntentRequest.payload.access_token` → sanitizeApiKey
- `originalDetectIntentRequest.payload.text` → sanitizeTextContent
- `originalDetectIntentRequest.payload.button_id` → sanitizeButtonId
- `originalDetectIntentRequest.payload.account_name` → sanitizeTextContent
- `queryResult.intent.displayName` → sanitizeIntentName
- `queryResult.queryText` → sanitizeTextContent
- `queryResult.parameters.*` → sanitização baseada no tipo

#### `sanitizeGenericWebhookPayload(payload: any): any`
Sanitização recursiva genérica:
- Remove campos perigosos (password, secret, token*)
- Sanitiza strings (trim)
- Sanitiza números de telefone em campos com 'phone'
- Processa objetos aninhados recursivamente

### 3. Validação

#### `validateSanitizedWebhookPayload(payload: any)`
Valida payload após sanitização:

**Retorna:**
```typescript
{
  isValid: boolean;
  errors: string[];
  warnings: string[];
}
```

**Validações:**
- Estrutura básica do payload
- Presença de campos obrigatórios
- Comprimento de API keys
- Comprimento de números de telefone
- Campos críticos vazios após sanitização

### 4. Funções de Processamento

#### `parseDialogflowRequest(req: any)`
Identifica tipo de requisição (intent vs button_click):
- Detecta cliques em botões interativos
- Detecta respostas de lista
- Extrai dados relevantes para cada tipo

#### `extractTemplateVariables(payload: any)`
Extrai variáveis de template do Dialogflow:
- Mapeia parâmetros comuns (name, phone, email)
- Sanitiza valores baseado no tipo
- Suporta tipos string, number, boolean

### 5. Logging e Monitoramento

#### `logSanitizationResults(correlationId, originalSize, sanitizedSize, validation)`
Registra resultados da sanitização:
- Tamanho original vs sanitizado
- Percentual de redução
- Erros e avisos de validação

#### `createWebhookErrorResponse(correlationId, error, details?, status?)`
Cria resposta de erro padronizada:
- Headers padronizados
- Correlation ID
- Timestamp
- Cache control

#### `createWebhookSuccessResponse(correlationId, data, processingTime?)`
Cria resposta de sucesso padronizada:
- Headers padronizados
- Tempo de processamento
- Correlation ID

## Fluxo de Sanitização

1. **Recebimento do Payload**
   ```typescript
   const rawReq = await request.json();
   const originalSize = JSON.stringify(rawReq).length;
   ```

2. **Sanitização**
   ```typescript
   const req = sanitizeWebhookPayloadComprehensive(rawReq);
   const payloadSize = JSON.stringify(req).length;
   ```

3. **Validação**
   ```typescript
   const validation = validateSanitizedWebhookPayload(req);
   ```

4. **Logging**
   ```typescript
   logSanitizationResults(correlationId, originalSize, payloadSize, validation);
   ```

5. **Verificação de Validade**
   ```typescript
   if (!validation.isValid) {
     return createWebhookErrorResponse(correlationId, 'Invalid payload', validation.errors);
   }
   ```

## Benefícios da Refatoração

### Segurança
- Sanitização consistente de todos os dados de entrada
- Remoção de caracteres potencialmente perigosos
- Validação de comprimentos e formatos

### Manutenibilidade
- Código centralizado na lib
- Funções reutilizáveis
- Logging padronizado

### Performance
- Validação prévia evita processamento desnecessário
- Logging estruturado para debugging
- Respostas padronizadas

### Monitoramento
- Correlation IDs para rastreamento
- Métricas de sanitização
- Alertas para payloads inválidos

## Uso no Webhook

```typescript
import {
  sanitizeWebhookPayloadComprehensive,
  validateSanitizedWebhookPayload,
  logSanitizationResults,
  createWebhookErrorResponse,
  parseDialogflowRequest,
  extractTemplateVariables,
} from "@/lib/webhook-utils";

export async function POST(request: Request) {
  // 1. Parse e sanitize
  const rawReq = await request.json();
  const req = sanitizeWebhookPayloadComprehensive(rawReq);
  
  // 2. Validate
  const validation = validateSanitizedWebhookPayload(req);
  if (!validation.isValid) {
    return createWebhookErrorResponse(correlationId, 'Invalid payload', validation.errors);
  }
  
  // 3. Process
  const dialogflowRequest = parseDialogflowRequest(req);
  const templateVars = extractTemplateVariables(req);
  
  // 4. Continue with business logic...
}
```

## Considerações de Segurança

- **Nunca confie em dados de entrada**: Sempre sanitize antes de processar
- **Validação em camadas**: Sanitização + validação + verificação de negócio
- **Logging seguro**: Não registre dados sensíveis (API keys completas, etc.)
- **Rate limiting**: Considere implementar para evitar abuse
- **Monitoramento**: Alerte sobre tentativas de payload malicioso

## Testes

Para testar as funções de sanitização:

```typescript
import { sanitizePhoneNumber, sanitizeEmail, sanitizeTextContent } from '@/lib/webhook-utils';

// Teste de número de telefone
expect(sanitizePhoneNumber('+55 11 99999-9999')).toBe('5511999999999');

// Teste de email
expect(sanitizeEmail('  USER@EXAMPLE.COM  ')).toBe('user@example.com');

// Teste de conteúdo de texto
expect(sanitizeTextContent('<script>alert("xss")</script>Hello')).toBe('alert("xss")Hello');
```