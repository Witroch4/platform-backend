import fetch from 'node-fetch';

// Payload MÍNIMO - apenas campos críticos para testar o processamento de botão
const payload = {
  session_id: "test-" + Date.now(),
  message: "duvidas gerais",
  channel_type: "whatsapp",
  context: {
    message: {
      id: "msg-" + Date.now(),
      content: "duvidas gerais",
      account_id: 1,
      inbox_id: 105,
      conversation_id: 1,
      message_type: "incoming",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      private: false,
      status: "sent",
      source_id: "wamid-" + Date.now(),
      content_type: "text",
      sender_type: "Contact",
      sender_id: 1,
      processed_message_content: "duvidas gerais",
      content_attributes: {
        button_reply: {
          id: "@duvidas_gerais" // Botão que não está mapeado
        }
      }
    },
    conversation: {
      id: 1,
      account_id: 1,
      inbox_id: 105,
      status: "open",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      contact_id: 1,
      display_id: 1,
      contact_inbox_id: 1,
      uuid: "conv-" + Date.now(),
      last_activity_at: new Date().toISOString(),
      waiting_since: new Date().toISOString()
    },
    contact: {
      id: 1,
      name: "Cliente Teste",
      phone_number: "+5511999887766",
      account_id: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      last_activity_at: new Date().toISOString(),
      contact_type: "contact",
      blocked: false
    },
    inbox: {
      id: 105,
      name: "Teste Inbox",
      channel_type: "whatsapp",
      channel_id: 1,
      account_id: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      enable_auto_assignment: false,
      greeting_enabled: false,
      working_hours_enabled: false,
      timezone: "UTC",
      enable_email_collect: false,
      csat_survey_enabled: false,
      allow_messages_after_resolved: false,
      lock_to_single_conversation: false,
      sender_name_type: "friendly",
      allow_agent_to_delete_message: false,
      csat_response_visible: false
    },
    "socialwise-chatwit": {
      account_data: { id: "1" },
      inbox_data: { 
        id: "105", 
        channel_type: "whatsapp" 
      },
      wamid: "wamid-" + Date.now()
    }
  }
};

console.log('🔵 Testando botão não mapeado com payload mínimo...');

try {
  const response = await fetch('http://localhost:3002/api/integrations/webhooks/socialwiseflow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const result = await response.json();
  console.log('\n✅ Resposta do webhook:');
  console.log(JSON.stringify(result, null, 2));
  
} catch (error) {
  console.error('❌ Erro no teste:', error.message);
}
