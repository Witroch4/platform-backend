# Fluxo de Sanitização do Webhook

Este documento descreve o fluxo completo de sanitização de dados desde o recebimento do webhook até o processamento pelo worker.

## Visão Geral do Fluxo

```
Webhook Request → Sanitização → Validação → Enfileiramento → Worker → Processamento
```

## 1. Recebimento do Webhook (route.ts)

### Sanitização Inicial
```typescript
// Parse request payload
const rawReq = await request.json();
const originalSize = JSON.stringify(rawReq).length;

// Sanitize payload for security
const req = sanitizeWebhookPayloadComprehensive(rawReq);
const payloadSize = JSON.stringify(req).length;

// Validate sanitized payload
const validation = validateSanitizedWebhookPayload(req);

// Log sanitization results
logSanitizationResults(correlationId, originalSize, payloadSize, validation);
```

### Funções Aplicadas
- `sanitizeWebhookPayloadComprehensive()`: Sanitização abrangente do payload
- `validateSanitizedWebhookPayload()`: Validação dos dados sanitizados
- `logSanitizationResults()`: Log dos resultados da sanitização

## 2. Processamento com Flash Intent (webhook-integration.ts)

### Criação de Job Sanitizado
```typescript
// Criar e sanitizar dados do job usando a função utilitária
const { jobData: sanitizedJobData, validation } = createSanitizedRespostaRapidaJob(
  requestData.originalPayload,
  requestData.correlationId
);

// Log dos resultados da sanitização
logSanitizationResults(
  requestData.correlationId,
  JSON.stringify(requestData).length,
  JSON.stringify(sanitizedJobData).length,
  validation
);

// Verificar se a sanitização foi bem-sucedida
if (!validation.isValid) {
  throw new Error(`Sanitization failed: ${validation.errors.join(', ')}`);
}
```

### Funções Aplicadas
- `createSanitizedRespostaRapidaJob()`: Cria job sanitizado para a fila
- `sanitizeRespostaRapidaJobData()`: Sanitiza dados específicos do job
- `validateRespostaRapidaJobData()`: Valida dados do job

## 3. Enfileiramento (resposta-rapida.queue.ts)

### Dados Sanitizados na Fila
```typescript
export interface RespostaRapidaJobData {
  type: "processarResposta";
  data: {
    inboxId: string;           // Sanitizado: String().trim()
    contactPhone: string;      // Sanitizado: sanitizePhoneNumber()
    interactionType: "button_reply" | "intent";
    buttonId?: string;         // Sanitizado: sanitizeButtonId()
    intentName?: string;       // Sanitizado: sanitizeIntentName()
    wamid: string;            // Sanitizado: String().trim()
    credentials: {
      token: string;          // Sanitizado: sanitizeApiKey()
      phoneNumberId: string;  // Sanitizado: String().trim()
      businessId: string;     // Sanitizado: String().trim()
    };
    correlationId: string;    // Sanitizado: String().trim()
    messageId?: number;       // Validado: Number()
    accountId?: number;       // Validado: Number()
    accountName?: string;     // Sanitizado: sanitizeTextContent()
    contactSource?: string;   // Sanitizado: sanitizeTextContent()
  };
}
```

## 4. Processamento pelo Worker (respostaRapida.worker.task.ts)

### Re-sanitização no Worker
```typescript
// Validar e re-sanitizar dados críticos no worker como medida de segurança
const sanitizedData = {
  intentName: sanitizeTextContent(intentName),
  inboxId: String(inboxId).trim(),
  contactPhone: sanitizePhoneNumber(contactPhone),
  wamid: String(wamid).trim(),
  correlationId: String(correlationId).trim(),
  credentials: {
    token: sanitizeApiKey(credentials.token),
    phoneNumberId: String(credentials.phoneNumberId).trim(),
    businessId: String(credentials.businessId).trim(),
  }
};

// Validar dados sanitizados
if (!sanitizedData.intentName || !sanitizedData.contactPhone || !sanitizedData.credentials.token) {
  throw new Error('Dados críticos inválidos após sanitização no worker');
}
```

### Motivo da Re-sanitização
- **Defesa em profundidade**: Múltiplas camadas de proteção
- **Segurança contra bypass**: Caso algum dado não sanitizado chegue ao worker
- **Validação final**: Garantia de que dados críticos estão corretos

## Funções de Sanitização por Tipo de Dado

### Números de Telefone
```typescript
export function sanitizePhoneNumber(phone: string | number): string {
  // Remove caracteres não numéricos
  const cleaned = String(phone).replace(/\D/g, '');
  
  // Valida comprimento (10-15 dígitos)
  if (cleaned.length < 10 || cleaned.length > 15) {
    console.warn(`Invalid phone number length: ${cleaned.length} digits`);
  }
  
  return cleaned;
}
```

### API Keys
```typescript
export function sanitizeApiKey(apiKey: string): string {
  const cleaned = String(apiKey).trim();
  
  // Valida comprimento mínimo
  if (cleaned.length < 10) {
    console.warn(`API key too short: ${cleaned.length} characters`);
    return '';
  }
  
  return cleaned;
}
```

### Conteúdo de Texto
```typescript
export function sanitizeTextContent(text: string): string {
  return String(text)
    .trim()
    .replace(/[<>]/g, '')           // Remove HTML-like brackets
    .replace(/javascript:/gi, '')    // Remove javascript: protocol
    .replace(/on\w+\s*=/gi, '')     // Remove event handlers
    .substring(0, 4096);            // Limit length
}
```

### IDs de Botão
```typescript
export function sanitizeButtonId(buttonId: string): string {
  // Permite apenas alfanuméricos, underscore, hífen e ponto
  return String(buttonId)
    .trim()
    .replace(/[^a-zA-Z0-9_.-]/g, '')
    .substring(0, 255);
}
```

### Nomes de Intent
```typescript
export function sanitizeIntentName(intentName: string): string {
  // Permite alfanuméricos, underscore, hífen, ponto e espaço
  return String(intentName)
    .trim()
    .replace(/[^a-zA-Z0-9_.\- ]/g, '')
    .substring(0, 255) || 'Unknown';
}
```

## Validação em Camadas

### Camada 1: Webhook Route
- Sanitização abrangente do payload completo
- Validação de estrutura básica
- Rejeição de payloads inválidos

### Camada 2: Flash Intent Integration
- Sanitização específica para dados de job
- Validação de campos obrigatórios
- Criação de job estruturado

### Camada 3: Worker Processing
- Re-sanitização de dados críticos
- Validação final antes do processamento
- Proteção contra dados corrompidos

## Logging e Monitoramento

### Métricas de Sanitização
```typescript
{
  correlationId: string;
  timestamp: string;
  sanitization: {
    originalPayloadSize: number;
    sanitizedPayloadSize: number;
    sizeReduction: number;
    sizeReductionPercent: string;
  };
  validation: {
    isValid: boolean;
    errorsCount: number;
    warningsCount: number;
    errors: string[];
    warnings: string[];
  };
}
```

### Alertas de Segurança
- Payloads com muitos caracteres removidos
- Tentativas de injeção de código
- API keys inválidas ou muito curtas
- Números de telefone com formato incorreto

## Benefícios do Fluxo

### Segurança
- **Múltiplas camadas**: Proteção em cada etapa
- **Validação rigorosa**: Dados sempre verificados
- **Logging completo**: Rastreabilidade total

### Performance
- **Sanitização eficiente**: Processamento otimizado
- **Validação prévia**: Evita processamento desnecessário
- **Cache de validação**: Reutilização de resultados

### Manutenibilidade
- **Código centralizado**: Funções reutilizáveis
- **Logging padronizado**: Debugging facilitado
- **Documentação clara**: Fluxo bem definido

## Exemplo de Uso Completo

```typescript
// 1. Webhook recebe payload
const rawPayload = await request.json();

// 2. Sanitização inicial
const sanitizedPayload = sanitizeWebhookPayloadComprehensive(rawPayload);

// 3. Validação
const validation = validateSanitizedWebhookPayload(sanitizedPayload);
if (!validation.isValid) {
  return createWebhookErrorResponse(correlationId, 'Invalid payload', validation.errors);
}

// 4. Criação de job sanitizado
const { jobData, validation: jobValidation } = createSanitizedRespostaRapidaJob(
  sanitizedPayload,
  correlationId
);

// 5. Enfileiramento
await addRespostaRapidaJob({ type: "processarResposta", data: jobData });

// 6. Worker processa com re-sanitização
const workerSanitizedData = {
  contactPhone: sanitizePhoneNumber(jobData.contactPhone),
  credentials: {
    token: sanitizeApiKey(jobData.credentials.token),
    // ...
  }
};

// 7. Processamento final
await processMessage(workerSanitizedData);
```

Este fluxo garante que todos os dados sejam sanitizados e validados em múltiplas camadas, proporcionando máxima segurança e confiabilidade no processamento de webhooks.