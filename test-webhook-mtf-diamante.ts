/**
 * Test script for MTF Diamante webhook processing with BullMQ integration
 */

import { extractWebhookData, validateWebhookData, hasValidApiKey } from './lib/webhook-utils';
import { addStoreMessageTask, addUpdateApiKeyTask, addProcessIntentTask } from './lib/queue/mtf-diamante-webhook.queue';

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

async function testWebhookProcessing() {
  console.log('🧪 Testando processamento de webhook MTF Diamante...\n');

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

    // Test 4: Queue webhook tasks (only if valid)
    if (isValid) {
      console.log('\n4️⃣ Testando enfileiramento de tasks...');
      
      // Queue message storage task
      await addStoreMessageTask({
        payload: mockDialogflowPayload,
        messageId: webhookData.messageId,
        conversationId: webhookData.conversationId,
        contactPhone: webhookData.contactPhone,
        whatsappApiKey: webhookData.whatsappApiKey,
        inboxId: webhookData.inboxId
      });
      console.log('✅ Task de armazenamento de mensagem enfileirada');

      // Queue API key update task (if valid API key)
      if (hasApiKey) {
        await addUpdateApiKeyTask({
          inboxId: webhookData.inboxId,
          whatsappApiKey: webhookData.whatsappApiKey
        });
        console.log('✅ Task de atualização de API key enfileirada');
      }

      // Queue intent processing task
      await addProcessIntentTask({
        payload: mockDialogflowPayload,
        intentName: webhookData.intentName,
        contactPhone: webhookData.contactPhone
      });
      console.log('✅ Task de processamento de intent enfileirada');
    }

    console.log('\n🎉 Teste concluído com sucesso!');
    console.log('\n📋 Resumo:');
    console.log(`- Dados extraídos: ${isValid ? '✅' : '❌'}`);
    console.log(`- API key válida: ${hasApiKey ? '✅' : '❌'}`);
    console.log(`- Tasks enfileiradas: ${isValid ? '✅' : '❌'}`);

  } catch (error) {
    console.error('❌ Erro durante o teste:', error);
  }
}

// Run the test
if (require.main === module) {
  testWebhookProcessing()
    .then(() => {
      console.log('\n✨ Teste finalizado.');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Erro fatal no teste:', error);
      process.exit(1);
    });
}

export { testWebhookProcessing };