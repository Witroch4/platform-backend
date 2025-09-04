import fetch from 'node-fetch';

// Gera source_id único para evitar duplicatas
function generateRandomSourceId() {
  return 'test_' + Math.random().toString(36).substring(2, 15) + '_' + Date.now();
}

// Payload completo simulando clique no botão @duvidas_gerais (não mapeado)
const payload = {
  session_id: generateRandomSourceId(),
  message: "duvidas gerais",
  channel_type: "whatsapp",
  context: {
    message: {
      id: generateRandomSourceId(),
      wamid: generateRandomSourceId(),
      source_id: generateRandomSourceId(),
      content: "duvidas gerais",
      text: "duvidas gerais",
      account_id: 1,
      inbox_id: 105,
      conversation_id: generateRandomSourceId(),
      message_type: "incoming",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      private: false,
      status: "sent",
      content_type: "text",
      sender_type: "Contact",
      sender_id: 1,
      processed_message_content: "duvidas gerais",
      content_attributes: {
        button_reply: {
          id: "@duvidas_gerais", // Botão não mapeado
          title: "Dúvidas Gerais"
        }
      }
    },
    conversation: {
      id: 1,
      display_id: 1
    },
    contact: {
      id: 1,
      name: "Cliente Teste",
      phone: "+5511999887766"
    },
    inbox: {
      id: 105,
      name: "Teste Inbox",
      channel_type: "whatsapp"
    },
    "socialwise-chatwit": {
      account_data: { id: "1" },
      inbox_data: { 
        id: "105", 
        channel_type: "whatsapp" 
      },
      contact_data: {
        name: "Cliente Teste",
        phone_number: "+5511999887766"
      },
      message_data: {
        id: generateRandomSourceId(),
        body: "duvidas gerais"
      },
      wamid: generateRandomSourceId()
    }
  },
  interaction_type: "button_reply",
  button_id: "@duvidas_gerais",
  created_at: new Date().toISOString()
};

console.log('🔵 Testando botão não mapeado - deve fazer fallback para LLM...');
console.log('📝 Payload:', JSON.stringify(payload, null, 2));

try {
  const response = await fetch('http://localhost:3002/api/integrations/webhooks/socialwiseflow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const result = await response.json();
  console.log('\n✅ Resposta do webhook:');
  console.log(JSON.stringify(result, null, 2));
  
  // Verifica se processou como botão não mapeado
  if (result.action_type === 'router_llm' || result.action_type === 'fallback') {
    console.log('\n🎯 SUCESSO: Botão não mapeado foi processado pela LLM!');
  } else {
    console.log('\n⚠️ ATENÇÃO: Resultado não esperado para botão não mapeado');
  }
  
} catch (error) {
  console.error('❌ Erro no teste:', error.message);
}
