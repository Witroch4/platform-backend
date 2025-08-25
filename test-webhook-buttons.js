/**
 * Teste de Webhook - Processamento de Botões
 * Script para testar o processamento de cliques de botões no webhook
 */

// Payload de teste para Instagram (baseado no payload real)
const instagramButtonPayload = {
  "session_id": "1002859634954741",
  "message": "Falar com a Dra",
  "channel_type": "Channel::Instagram",
  "language": "pt-BR",
  "context": {
    "message": {
      "id": 36029,
      "content": "Falar com a Dra",
      "account_id": 3,
      "inbox_id": 105,
      "conversation_id": 2132,
      "message_type": "incoming",
      "created_at": "2025-08-13T23:02:06.966Z",
      "updated_at": "2025-08-13T23:02:06.966Z",
      "private": false,
      "status": "sent",
      "source_id": "aWdfZAG1faXRlbToxOklHTWVzc2FnZAUlEhuz9x4ge4ujajZuqRvxInEQsq2UwMrjb+qLmxAMjZDZD",
      "content_type": "text",
      "content_attributes": {
        "in_reply_to_external_id": null,
        "postback_payload": "ig_btn_1755004696546_uekaa4clu"
      },
      "sender_type": "Contact",
      "sender_id": 1885
    },
    "socialwise-chatwit": {
      "account_data": {
        "id": 3
      },
      "inbox_data": {
        "id": 105,
        "channel_type": "Channel::Instagram"
      },
      "message_data": {
        "id": "ig_message_123"
      }
    }
  }
};

// Payload de teste para WhatsApp (baseado no payload real)
const whatsappButtonPayload = {
  "session_id": "558597550136",
  "message": "Falar com a Dra",
  "channel_type": "Channel::Whatsapp",
  "language": "pt_BR",
  "context": {
    "message": {
      "id": 36023,
      "content": "Falar com a Dra",
      "account_id": 3,
      "inbox_id": 4,
      "conversation_id": 2133,
      "message_type": "incoming",
      "created_at": "2025-08-13T22:44:06.875Z",
      "updated_at": "2025-08-13T22:44:06.875Z",
      "private": false,
      "status": "sent",
      "source_id": "wamid.HBgMNTU4NTk3NTUwMTM2FQIAEhgUYUKJUUXPYYCBGWC71N0UX8A",
      "content_type": "text",
      "content_attributes": {
        "button_reply": {
          "id": "btn_1754993780819_0_tqji",
          "title": "Falar com a Dra"
        }
      },
      "sender_type": "Contact",
      "sender_id": 1885
    },
    "socialwise-chatwit": {
      "account_data": {
        "id": 3
      },
      "inbox_data": {
        "id": 4,
        "channel_type": "Channel::Whatsapp"
      },
      "message_data": {
        "id": "wa_message_123",
        "wamid": "wamid.HBgMNTU4NTk3NTUwMTM2FQIAEhgUYUKJUUXPYYCBGWC71N0UX8A"
      }
    }
  }
};

async function testWebhook(payload, testName) {
  console.log(`\n🧪 ${testName}`);
  console.log('='.repeat(50));
  
  try {
    const response = await fetch('http://localhost:3000/api/integrations/webhooks/socialwiseflow', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.SOCIALWISEFLOW_ACCESS_TOKEN || 'test-token'}`
      },
      body: JSON.stringify(payload)
    });

    const responseData = await response.json();
    
    console.log('📤 Payload enviado:');
    console.log('  - Channel:', payload.channel_type);
    console.log('  - Button ID:', payload.context.message.content_attributes.postback_payload || payload.context.message.content_attributes.button_reply?.id);
    console.log('  - Inbox ID:', payload.context.message.inbox_id);
    
    console.log('📥 Resposta recebida:');
    console.log('  - Status:', response.status);
    console.log('  - Data:', JSON.stringify(responseData, null, 2));
    
    // Verificar se é uma resposta de botão
    if (responseData.action === 'button_reaction') {
      console.log('✅ Botão detectado e processado!');
      console.log('  - Button ID:', responseData.buttonId);
      console.log('  - Emoji:', responseData.emoji);
      console.log('  - Texto:', responseData.text);
      console.log('  - Mapeamento encontrado:', responseData.mappingFound);
    } else {
      console.log('⚠️ Resposta não é de botão:', responseData);
    }
    
  } catch (error) {
    console.error('❌ Erro no teste:', error.message);
  }
}

async function runTests() {
  console.log('🚀 Iniciando testes do webhook...');
  
  // Teste 1: Instagram Button
  await testWebhook(instagramButtonPayload, 'TESTE INSTAGRAM BUTTON');
  
  // Aguardar um pouco entre os testes
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Teste 2: WhatsApp Button
  await testWebhook(whatsappButtonPayload, 'TESTE WHATSAPP BUTTON');
  
  console.log('\n🏁 Testes concluídos!');
}

// Executar os testes se for chamado diretamente
if (require.main === module) {
  runTests().catch(console.error);
}

module.exports = {
  testWebhook,
  runTests,
  instagramButtonPayload,
  whatsappButtonPayload
};
