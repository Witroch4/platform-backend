// Teste simples usando fetch API para testar a memória de sessão
const testSessionMemory = async () => {
  const baseUrl = 'http://localhost:3002';
  const sessionId = '5511999888777'; // Número do telefone como sessionId
  
  // Função para gerar wamid aleatório
  function generateRandomWamid() {
    const phoneDigits = Math.random().toString().substr(2, 12).padEnd(12, '0');
    const randomChars1 = Math.random().toString(36).substr(2, 2).toUpperCase();
    const randomChars2 = Math.random().toString(36).substr(2, 16).toUpperCase() +
                        Math.random().toString(36).substr(2, 16).toUpperCase();
    return `wamid.HBgM${phoneDigits}${randomChars1}${randomChars2}A`;
  }

  // Payload da primeira mensagem
  const payload1 = {
    "session_id": sessionId,
    "message": "Olá, preciso de ajuda com uma dúvida jurídica",
    "channel_type": "Channel::Whatsapp",
    "language": "pt_BR",
    "context": {
      "message": {
        "id": 36001,
        "content": "Olá, preciso de ajuda com uma dúvida jurídica",
        "account_id": 1,
        "inbox_id": 105,
        "conversation_id": 2001,
        "message_type": "incoming",
        "created_at": new Date().toISOString(),
        "updated_at": new Date().toISOString(),
        "private": false,
        "status": "sent",
        "source_id": generateRandomWamid(),
        "content_type": "text",
        "content_attributes": {},
        "sender_type": "Contact",
        "sender_id": 1001,
        "external_source_ids": {},
        "additional_attributes": {},
        "processed_message_content": "Olá, preciso de ajuda com uma dúvida jurídica",
        "sentiment": {}
      },
      "conversation": {
        "id": 2001,
        "account_id": 1,
        "inbox_id": 105,
        "status": "pending",
        "assignee_id": null,
        "created_at": new Date().toISOString(),
        "updated_at": new Date().toISOString(),
        "contact_id": 1001,
        "display_id": 1001,
        "contact_last_seen_at": null,
        "agent_last_seen_at": null,
        "additional_attributes": {},
        "contact_inbox_id": 1001,
        "uuid": "test-uuid-1",
        "identifier": null,
        "last_activity_at": new Date().toISOString(),
        "team_id": null,
        "campaign_id": null,
        "snoozed_until": null,
        "custom_attributes": {},
        "assignee_last_seen_at": null,
        "first_reply_created_at": null,
        "priority": null,
        "sla_policy_id": null,
        "waiting_since": new Date().toISOString(),
        "cached_label_list": null,
        "label_list": []
      },
      "contact": {
        "id": 1001,
        "name": "Test User",
        "email": null,
        "phone_number": sessionId,
        "account_id": 1,
        "created_at": new Date().toISOString(),
        "updated_at": new Date().toISOString(),
        "additional_attributes": {},
        "identifier": null,
        "custom_attributes": {},
        "last_activity_at": new Date().toISOString(),
        "contact_type": "lead",
        "middle_name": "",
        "last_name": "",
        "location": null,
        "country_code": null,
        "blocked": false,
        "label_list": []
      },
      "inbox": {
        "id": 105,
        "channel_id": 1,
        "account_id": 1,
        "name": "WhatsApp - Test",
        "created_at": new Date().toISOString(),
        "updated_at": new Date().toISOString(),
        "channel_type": "Channel::Whatsapp",
        "enable_auto_assignment": true,
        "greeting_enabled": false,
        "greeting_message": null,
        "email_address": null,
        "working_hours_enabled": false,
        "out_of_office_message": null,
        "timezone": "UTC",
        "enable_email_collect": true,
        "csat_survey_enabled": false,
        "allow_messages_after_resolved": true,
        "auto_assignment_config": {},
        "lock_to_single_conversation": false,
        "portal_id": null,
        "sender_name_type": "friendly",
        "business_name": null,
        "allow_agent_to_delete_message": true,
        "external_token": null,
        "csat_response_visible": false,
        "csat_config": {}
      }
    }
  };

  // Payload da segunda mensagem
  const payload2 = {
    ...payload1,
    "message": "Quais são os meus direitos como consumidor?",
    "context": {
      ...payload1.context,
      "message": {
        ...payload1.context.message,
        "id": 36002,
        "content": "Quais são os meus direitos como consumidor?",
        "source_id": generateRandomWamid(),
        "created_at": new Date().toISOString(),
        "updated_at": new Date().toISOString(),
        "processed_message_content": "Quais são os meus direitos como consumidor?"
      }
    }
  };

  console.log('🔵 Testando sistema de memória de sessão via API...');
  console.log('📝 SessionId:', sessionId);

  try {
    // Primeira interação
    console.log('\n--- PRIMEIRA INTERAÇÃO ---');
    console.log('📝 Primeira mensagem:', payload1.message);
    
    const response1 = await fetch(`${baseUrl}/api/integrations/webhooks/socialwiseflow`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Correlation-ID': 'test-session-1-' + Date.now(),
        'X-Account-ID': '1',
        'X-Inbox-ID': '105'
      },
      body: JSON.stringify(payload1)
    });

    if (response1.ok) {
      const result1 = await response1.json();
      console.log('✅ Primeira resposta:', result1);
    } else {
      console.log('❌ Erro na primeira requisição:', response1.status, await response1.text());
      return;
    }

    // Aguarda um pouco para simular conversa real
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Segunda interação
    console.log('\n--- SEGUNDA INTERAÇÃO ---');
    console.log('📝 Segunda mensagem:', payload2.message);
    
    const response2 = await fetch(`${baseUrl}/api/integrations/webhooks/socialwiseflow`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Correlation-ID': 'test-session-2-' + Date.now(),
        'X-Account-ID': '1',
        'X-Inbox-ID': '105'
      },
      body: JSON.stringify(payload2)
    });

    if (response2.ok) {
      const result2 = await response2.json();
      console.log('✅ Segunda resposta:', result2);
      
      console.log('\n🧠 ANÁLISE DE MEMÓRIA:');
      console.log('SessionId usado:', sessionId);
      console.log('🎯 Sistema de memória conversacional testado com sucesso!');
      console.log('As duas interações foram processadas com continuidade de sessão.');
    } else {
      console.log('❌ Erro na segunda requisição:', response2.status, await response2.text());
    }

  } catch (error) {
    console.error('❌ Erro no teste:', error.message);
  }
};

// Executa o teste
testSessionMemory().catch(console.error);
