#!/usr/bin/env node

/**
 * Teste do Router LLM com source_id único
 */

import fetch from 'node-fetch';

// Gerar source_id único para evitar duplicata
const uniqueSourceId = `wamid.HBgMNTU4NTk3NTUwMTM2FQIAEhgU${Date.now()}${Math.random().toString(36).substr(2, 8).toUpperCase()}`;

console.log('🧪 TESTE DO ROUTER LLM COM SOURCE_ID ÚNICO');
console.log('==========================================');
console.log('🔑 Source ID único:', uniqueSourceId);
console.log('');

const UNIQUE_PAYLOAD = {
  "session_id": "558597550136",
  "message": "Olá boa noite",
  "channel_type": "Channel::Whatsapp",
  "language": "pt_BR",
  "context": {
    "message": {
      "id": 36021,
      "content": "Olá boa noite",
      "account_id": 3,
      "inbox_id": 4,
      "conversation_id": 2133,
      "message_type": "incoming",
      "created_at": "2025-08-13T22:38:24.870Z",
      "updated_at": "2025-08-13T22:38:24.870Z",
      "private": false,
      "status": "sent",
      "source_id": uniqueSourceId, // Source ID único para evitar duplicata
      "content_type": "text",
      "content_attributes": {},
      "sender_type": "Contact",
      "sender_id": 1447,
      "external_source_ids": {},
      "additional_attributes": {},
      "processed_message_content": "Olá boa noite",
      "sentiment": {}
    },
    "conversation": {
      "id": 2133,
      "account_id": 3,
      "inbox_id": 4,
      "status": "pending",
      "assignee_id": null,
      "created_at": "2025-08-12T17:53:23.278Z",
      "updated_at": "2025-08-13T22:38:24.873Z",
      "contact_id": 1447,
      "display_id": 1923,
      "contact_last_seen_at": null,
      "agent_last_seen_at": "2025-08-12T18:57:06.792Z",
      "additional_attributes": {},
      "contact_inbox_id": 1690,
      "uuid": "08c5e7d4-9100-41bb-bf5b-c55a965cebcb",
      "identifier": null,
      "last_activity_at": "2025-08-13T22:38:24.870Z",
      "team_id": null,
      "campaign_id": null,
      "snoozed_until": null,
      "custom_attributes": {},
      "assignee_last_seen_at": null,
      "first_reply_created_at": null,
      "priority": null,
      "sla_policy_id": null,
      "waiting_since": "2025-08-12T17:53:23.278Z",
      "cached_label_list": null,
      "label_list": []
    },
    "contact": {
      "id": 1447,
      "name": "Witalo Rocha",
      "email": null,
      "phone_number": "+558597550136",
      "account_id": 3,
      "created_at": "2025-07-06T14:35:28.590Z",
      "updated_at": "2025-08-13T22:38:24.940Z",
      "additional_attributes": {},
      "identifier": null,
      "custom_attributes": {},
      "last_activity_at": "2025-08-13T22:38:24.932Z",
      "contact_type": "lead",
      "middle_name": "",
      "last_name": "",
      "location": null,
      "country_code": null,
      "blocked": false,
      "label_list": []
    },
    "inbox": {
      "id": 4,
      "channel_id": 1,
      "account_id": 3,
      "name": "WhatsApp - ANA",
      "created_at": "2024-06-09T00:52:47.311Z",
      "updated_at": "2025-08-13T21:50:09.580Z",
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

async function testUniqueRouterLLM() {
  console.log('🚀 Testando Router LLM com source_id único');
  console.log('📱 Mensagem:', UNIQUE_PAYLOAD.message);
  console.log('');

  const startTime = Date.now();

  try {
    const response = await fetch('http://localhost:3002/api/integrations/webhooks/socialwiseflow', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Test-Router-LLM-Unique/1.0'
      },
      body: JSON.stringify(UNIQUE_PAYLOAD)
    });

    const responseTime = Date.now() - startTime;
    console.log(`⏱️ Tempo de resposta: ${responseTime}ms`);

    if (!response.ok) {
      const errorText = await response.text();
      console.log('❌ Erro HTTP:', response.status, response.statusText);
      console.log('📄 Detalhes do erro:', errorText);
      return;
    }

    const result = await response.json();
    
    console.log('✅ Resposta recebida com sucesso!');
    console.log('');
    console.log('📊 RESULTADO DO PROCESSAMENTO:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    if (result.success) {
      console.log('✅ Status: Sucesso');
      
      if (result.response) {
        console.log('📝 Tipo de resposta:', result.response.type || 'N/A');
        console.log('🎯 Estratégia:', result.response.strategy || 'N/A');
        console.log('📈 Banda de performance:', result.response.performance_band || 'N/A');
        
        if (result.response.ai_response) {
          console.log('🤖 Resposta da IA:');
          console.log('   Mode:', result.response.ai_response.mode || 'N/A');
          
          if (result.response.ai_response.response_text) {
            console.log('   📄 Texto de introdução:');
            console.log('   "' + result.response.ai_response.response_text + '"');
          }
          
          if (result.response.ai_response.buttons && result.response.ai_response.buttons.length > 0) {
            console.log('   🔘 Botões gerados:');
            result.response.ai_response.buttons.forEach((btn, idx) => {
              console.log(`     ${idx + 1}. "${btn.title}" → ${btn.payload || 'sem payload'}`);
            });
          } else {
            console.log('   ❌ PROBLEMA: Nenhum botão foi gerado!');
          }
          
          if (result.response.ai_response.intent_payload) {
            console.log('   🎯 Intent detectada:', result.response.ai_response.intent_payload);
          }
        }
        
        if (result.response.whatsapp_message) {
          console.log('📱 Mensagem formatada para WhatsApp:');
          console.log('   Tipo:', result.response.whatsapp_message.type);
          if (result.response.whatsapp_message.interactive) {
            console.log('   📋 Formato interativo detectado');
            if (result.response.whatsapp_message.interactive.action?.buttons) {
              console.log('   🔘 Botões WhatsApp:');
              result.response.whatsapp_message.interactive.action.buttons.forEach((btn, idx) => {
                console.log(`     ${idx + 1}. "${btn.reply?.title || 'N/A'}" → ${btn.reply?.id || 'N/A'}`);
              });
            }
          }
        }
      }
      
      if (result.metrics) {
        console.log('📊 Métricas de performance:');
        console.log('   ⏱️ Tempo total:', result.metrics.total_time_ms + 'ms');
        console.log('   🧮 Embedding time:', result.metrics.embedding_time_ms + 'ms');
        console.log('   🤖 LLM time:', result.metrics.llm_time_ms + 'ms');
        console.log('   🔍 Similarity score:', result.metrics.similarity_score);
      }
      
    } else {
      console.log('❌ Status: Falha');
      console.log('💬 Erro:', result.error || 'Erro desconhecido');
    }
    
    console.log('');
    console.log('🔍 VERIFICAÇÃO DOS OBJETIVOS:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    const hasButtons = result.response?.ai_response?.buttons?.length > 0;
    const isInteractive = result.response?.whatsapp_message?.type === 'interactive';
    const usedRouter = result.response?.strategy === 'ROUTER' || result.response?.performance_band === 'ROUTER';
    
    console.log('✅ Router LLM foi chamado?', usedRouter ? 'SIM' : 'NÃO');
    console.log('✅ Gerou botões?', hasButtons ? 'SIM (' + result.response.ai_response.buttons.length + ' botões)' : 'NÃO');
    console.log('✅ Resposta interativa?', isInteractive ? 'SIM' : 'NÃO');
    console.log('✅ Forçou geração de botões?', hasButtons && result.response?.ai_response?.mode === 'chat' ? 'SIM' : 'NÃO');
    
    if (hasButtons && isInteractive) {
      console.log('🎉 SUCESSO: Router LLM está gerando botões corretamente!');
    } else {
      console.log('⚠️ PROBLEMA: Router LLM não está gerando botões como esperado');
    }

  } catch (error) {
    const responseTime = Date.now() - startTime;
    console.log(`⏱️ Tempo até erro: ${responseTime}ms`);
    console.log('❌ Erro na requisição:', error.message);
  }
}

testUniqueRouterLLM()
  .then(() => {
    console.log('');
    console.log('🏁 Teste concluído');
  })
  .catch(error => {
    console.error('💥 Erro crítico no teste:', error);
    process.exit(1);
  });
