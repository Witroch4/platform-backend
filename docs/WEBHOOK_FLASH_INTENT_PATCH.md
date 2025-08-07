# Patch para Integração da Flash Intent no Webhook

Este documento mostra exatamente onde e como integrar a Flash Intent no webhook existente do MTF Diamante.

## 1. Importações Necessárias

Adicione estas importações no início do arquivo `app/api/admin/mtf-diamante/dialogflow/webhook/route.ts`:

```typescript
// Adicionar após as importações existentes
import { processWebhookWithFlashIntent } from "@/lib/resposta-rapida/webhook-integration";
import { isFlashIntentActive } from "@/lib/resposta-rapida/flash-intent-checker";
```

## 2. Função Helper para Extrair Dados do Webhook

Adicione esta função antes da função POST principal:

```typescript
/**
 * Extrai dados necessários para a Flash Intent do payload do webhook
 */
function extractFlashIntentData(req: any, correlationId: string): {
  type: "intent" | "button_click";
  intentName?: string;
  buttonId?: string;
  recipientPhone: string;
  whatsappApiKey: string;
  phoneNumberId: string;
  businessId: string;
  inboxId: string;
  wamid: string;
  messageId?: number;
  accountId?: number;
  accountName?: string;
  contactSource?: string;
} {
  const webhookData = extractWebhookData(req);
  const chatwootPayload = req.originalDetectIntentRequest?.payload;
  
  // Detectar se é button click ou intent
  const interactive = chatwootPayload?.interactive;
  const isButtonClick = interactive?.type === "button_reply" || interactive?.type === "list_reply";
  
  return {
    type: isButtonClick ? "button_click" : "intent",
    intentName: webhookData.intentName,
    buttonId: interactive?.button_reply?.id || interactive?.list_reply?.id,
    recipientPhone: webhookData.contactPhone,
    whatsappApiKey: webhookData.whatsappApiKey,
    phoneNumberId: chatwootPayload?.phone_number_id || "unknown",
    businessId: chatwootPayload?.business_id || "unknown",
    inboxId: webhookData.inboxId,
    wamid: chatwootPayload?.id || chatwootPayload?.wamid || "unknown",
    messageId: chatwootPayload?.message_id,
    accountId: chatwootPayload?.account_id,
    accountName: chatwootPayload?.account_name,
    contactSource: chatwootPayload?.contact_source || "whatsapp",
  };
}
```

## 3. Integração na Função POST

Substitua a seção de processamento de filas na função POST (aproximadamente linha 830-900) por:

```typescript
    // NOVA INTEGRAÇÃO: Flash Intent Processing
    try {
      // Extrair dados para Flash Intent
      const flashIntentData = extractFlashIntentData(req, correlationId);
      
      console.log(`[MTF Diamante Dispatcher] [${correlationId}] Processando com Flash Intent`, {
        type: flashIntentData.type,
        intentName: flashIntentData.intentName,
        buttonId: flashIntentData.buttonId,
        recipientPhone: flashIntentData.recipientPhone,
      });

      // Processar com Flash Intent
      const flashResult = await processWebhookWithFlashIntent(flashIntentData);
      
      console.log(`[MTF Diamante Dispatcher] [${correlationId}] Flash Intent processado`, {
        success: flashResult.success,
        processingMode: flashResult.processingMode,
        queueUsed: flashResult.queueUsed,
      });

      // Retornar resposta rápida
      const responseTime = performance.now() - startTime;
      
      // Record webhook metrics
      recordWebhookMetrics({
        responseTime,
        timestamp: new Date(),
        correlationId,
        success: flashResult.success,
        payloadSize,
        interactionType,
      });

      return new Response(JSON.stringify({ 
        correlationId,
        processingMode: flashResult.processingMode,
        queueUsed: flashResult.queueUsed,
        responseTime: `${responseTime}ms`,
        message: flashResult.message,
      }), {
        status: 202,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'X-Correlation-ID': correlationId,
          'X-Processing-Mode': flashResult.processingMode,
          'X-Queue-Used': flashResult.queueUsed,
          'X-Response-Time': responseTime.toString(),
        },
      });

    } catch (flashIntentError) {
      console.error(`[MTF Diamante Dispatcher] [${correlationId}] Erro na Flash Intent, usando fallback:`, flashIntentError);
      
      // Fallback para processamento legacy se Flash Intent falhar
      const webhookData = extractWebhookData(req);
      logWebhookData(webhookData, req);
      
      await queueLegacyTasks(req, webhookData, correlationId);
      
      const responseTime = performance.now() - startTime;
      
      recordWebhookMetrics({
        responseTime,
        timestamp: new Date(),
        correlationId,
        success: true,
        payloadSize,
        interactionType: 'intent',
      });
      
      return new Response(JSON.stringify({ 
        correlationId,
        processingMode: "legacy_fallback",
        responseTime: `${responseTime}ms`,
      }), {
        status: 202,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'X-Correlation-ID': correlationId,
          'X-Processing-Mode': 'legacy_fallback',
        },
      });
    }
```

## 4. Função queueLegacyTasks (se não existir)

Se a função `queueLegacyTasks` não existir, adicione esta implementação:

```typescript
/**
 * Função de fallback para processamento legacy
 */
async function queueLegacyTasks(
  req: any, 
  webhookData: ExtractedWebhookData, 
  correlationId: string
): Promise<void> {
  try {
    console.log(`[MTF Diamante Dispatcher] [${correlationId}] Usando processamento legacy`);
    
    // Processar intent se existir
    if (webhookData.intentName) {
      await processIntentRequest(
        webhookData.intentName,
        webhookData.contactPhone,
        webhookData.whatsappApiKey,
        webhookData.inboxId,
        correlationId,
        req
      );
    }
    
    // Processar button click se existir
    const chatwootPayload = req.originalDetectIntentRequest?.payload;
    const interactive = chatwootPayload?.interactive;
    
    if (interactive?.type === "button_reply" || interactive?.type === "list_reply") {
      const buttonId = interactive.button_reply?.id || interactive.list_reply?.id;
      const messageId = chatwootPayload?.id || chatwootPayload?.wamid;
      
      if (buttonId && messageId) {
        await processButtonClickRequest(
          buttonId,
          messageId,
          webhookData.contactPhone,
          webhookData.whatsappApiKey,
          correlationId,
          req,
          chatwootPayload?.phone_number_id
        );
      }
    }
    
  } catch (error) {
    console.error(`[MTF Diamante Dispatcher] [${correlationId}] Erro no processamento legacy:`, error);
  }
}
```

## 5. Exemplo de Uso Completo

Aqui está um exemplo de como o webhook ficará após a integração:

```typescript
export async function POST(request: Request) {
  const startTime = performance.now();
  let correlationId = '';
  let payloadSize = 0;
  let interactionType: 'intent' | 'button_reply' = 'intent';

  try {
    // Parse request payload
    const req = await request.json();
    payloadSize = JSON.stringify(req).length;
    correlationId = generateCorrelationId();
    
    console.log(`[MTF Diamante Dispatcher] [${correlationId}] Received Dialogflow request`);

    // Handle Instagram translation (código existente)
    const channelDetection = detectChannelType(req);
    if (channelDetection.isInstagram) {
      return await handleInstagramTranslation(req, correlationId, startTime, payloadSize);
    }

    // NOVA INTEGRAÇÃO: Flash Intent Processing
    const flashIntentData = extractFlashIntentData(req, correlationId);
    const flashResult = await processWebhookWithFlashIntent(flashIntentData);
    
    const responseTime = performance.now() - startTime;
    
    recordWebhookMetrics({
      responseTime,
      timestamp: new Date(),
      correlationId,
      success: flashResult.success,
      payloadSize,
      interactionType: flashIntentData.type === "button_click" ? "button_reply" : "intent",
    });

    return new Response(JSON.stringify({ 
      correlationId,
      processingMode: flashResult.processingMode,
      queueUsed: flashResult.queueUsed,
      responseTime: `${responseTime}ms`,
    }), {
      status: 202,
      headers: {
        'Content-Type': 'application/json',
        'X-Correlation-ID': correlationId,
        'X-Processing-Mode': flashResult.processingMode,
      },
    });

  } catch (error) {
    // Error handling (código existente)
    console.error(`[MTF Diamante Dispatcher] [${correlationId}] Error:`, error);
    
    return new Response(JSON.stringify({ 
      error: 'Internal server error',
      correlationId 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
```

## 6. Logs Esperados

Após a integração, você verá logs como:

```
[MTF Diamante Dispatcher] [1234567890-abc123] Received Dialogflow request
[MTF Diamante Dispatcher] [1234567890-abc123] Processando com Flash Intent
[Flash Intent] Status para usuário user-123: ATIVA
[Flash Intent] Processando com ALTA PRIORIDADE
[Resposta Rapida] Job enqueued: resposta-intent-1234567890-abc123
[MTF Diamante Dispatcher] [1234567890-abc123] Flash Intent processado
```

## 7. Monitoramento

Para monitorar a integração:

```bash
# Via CLI
npm run flash-intent -- stats

# Via API
curl http://localhost:3000/api/admin/resposta-rapida/stats

# Logs do webhook
tail -f logs/webhook.log | grep "Flash Intent"
```

## 8. Rollback

Se houver problemas, desative rapidamente:

```bash
# Desativar Flash Intent globalmente
npm run flash-intent -- disable-global

# Ou via API
curl -X POST http://localhost:3000/api/admin/resposta-rapida/toggle-global \
  -H "Content-Type: application/json" \
  -d '{"enabled": false}'
```

## 9. Testes

Para testar a integração:

1. **Ativar Flash Intent**: Use a interface admin ou CLI
2. **Enviar webhook**: Teste com intent e button click
3. **Verificar logs**: Confirme que está usando alta prioridade
4. **Verificar filas**: Use o health check para ver jobs sendo processados
5. **Medir performance**: Confirme resposta < 100ms

Esta integração mantém compatibilidade total com o código existente enquanto adiciona as funcionalidades de resposta rápida da Flash Intent.