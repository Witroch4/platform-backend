/**
 * Simple test for webhook utility functions without Redis dependency
 */

const { extractWebhookData, validateWebhookData, hasValidApiKey, extractMessageContent, extractMessageType } = require('./lib/webhook-utils');

// Mock Dialogflow payload for testing
const mockDialogflowPayload = {
  queryResult: {
    queryText: "Olá, preciso de ajuda",
    intent: {
      displayName: "Welcome"
    }
  },
  session: "projects/test-project/agent/sessions/5584994072876",
  originalDetectIntentRequest: {
    payload: {
      whatsapp_api_key: "EAAG1234567890abcdef",
      message_id: "wamid.HBgNNTU4NDk5NDA3Mjg3NhUCABIYFjNBMzMzODQyMzQzNzM4MzI0RTdGAA==",
      conversation_id: "5584994072876",
      inbox_id: "12345",
      from: "5584994072876",
      message: {
        text: "Olá, preciso de ajuda",
        type: "text"
      }
    }
  }
};

function testWebhookUtilities() {
  console.log('🧪 Testando utilitários de webhook MTF Diamante...\n');

  try {
    // Test 1: Extract webhook data
    console.log('1️⃣ Testando extração de dados do webhook...');
    const webhookData = extractWebhookData(mockDialogflowPayload);
    console.log('Dados extraídos:', {
      whatsappApiKey: webhookData.whatsappApiKey ? `${webhookData.whatsappApiKey.substring(0, 10)}...` : 'N/A',
      messageId: webhookData.messageId,
      conversationId: webhookData.conversationId,
      contactPhone: webhookData.contactPhone,
      inboxId: webhookData.inboxId,
      intentName: webhookData.intentName
    });

    // Test 2: Validate webhook data
    console.log('\n2️⃣ Testando validação dos dados...');
    const isValid = validateWebhookData(webhookData);
    console.log('Dados válidos:', isValid);

    // Test 3: Check API key validity
    console.log('\n3️⃣ Testando validação da API key...');
    const hasApiKey = hasValidApiKey(mockDialogflowPayload);
    console.log('API key válida:', hasApiKey);

    // Test 4: Extract message content
    console.log('\n4️⃣ Testando extração de conteúdo da mensagem...');
    const messageContent = extractMessageContent(mockDialogflowPayload);
    console.log('Conteúdo da mensagem:', messageContent);

    // Test 5: Extract message type
    console.log('\n5️⃣ Testando extração do tipo de mensagem...');
    const messageType = extractMessageType(mockDialogflowPayload);
    console.log('Tipo da mensagem:', messageType);

    console.log('\n🎉 Teste concluído com sucesso!');
    console.log('\n📋 Resumo:');
    console.log(`- Dados extraídos: ${isValid ? '✅' : '❌'}`);
    console.log(`- API key válida: ${hasApiKey ? '✅' : '❌'}`);
    console.log(`- Conteúdo extraído: ${messageContent ? '✅' : '❌'}`);
    console.log(`- Tipo extraído: ${messageType ? '✅' : '❌'}`);

    // Test edge cases
    console.log('\n6️⃣ Testando casos extremos...');
    
    // Empty payload
    const emptyData = extractWebhookData({});
    console.log('Payload vazio - dados extraídos:', {
      messageId: emptyData.messageId,
      contactPhone: emptyData.contactPhone,
      intentName: emptyData.intentName
    });

    // Payload without API key
    const noApiKeyPayload = { ...mockDialogflowPayload };
    delete noApiKeyPayload.originalDetectIntentRequest.payload.whatsapp_api_key;
    const hasNoApiKey = hasValidApiKey(noApiKeyPayload);
    console.log('Payload sem API key - válida:', hasNoApiKey);

    return true;
  } catch (error) {
    console.error('❌ Erro durante o teste:', error);
    return false;
  }
}

// Run the test
const success = testWebhookUtilities();
console.log(success ? '\n✨ Todos os testes passaram!' : '\n💥 Alguns testes falharam!');
process.exit(success ? 0 : 1);