#!/usr/bin/env node

/**
 * Teste de clique no botão "Dúvidas gerais"
 * Simula quando o cliente aperta um botão gerado anteriormente
 */

import fetch from 'node-fetch';

// Função para gerar source_id aleatório (wamid do WhatsApp)
function generateRandomWamid() {
  // Formato: wamid.HBgM + 12 dígitos + 2 chars + 32 chars aleatórios + A
  const phoneDigits = Math.random().toString().substr(2, 12).padEnd(12, '0');
  const randomChars1 = Math.random().toString(36).substr(2, 2).toUpperCase();
  const randomChars2 = Math.random().toString(36).substr(2, 16).toUpperCase() +
                      Math.random().toString(36).substr(2, 16).toUpperCase();

  return `wamid.HBgM${phoneDigits}${randomChars1}${randomChars2}A`;
}

// Função para criar payload de clique no botão
function createButtonClickPayload() {
  const randomWamid = generateRandomWamid();
  console.log('🎲 Source ID gerado:', randomWamid);
  
  return {
    "session_id": "558597550136",
    "message": "Falar com a Dra",
    "channel_type": "Channel::Whatsapp",
    "language": "pt_BR",
    "context": {
      "message": {
        "id": 36023,
        "content": "Dúvidas gerais",
        "account_id": 3,
        "inbox_id": 4,
        "conversation_id": 2133,
        "message_type": "incoming",
        "created_at": "2025-08-13T22:44:06.875Z",
        "updated_at": "2025-08-13T22:44:06.875Z",
        "private": false,
        "status": "sent",
        "source_id": randomWamid,
        "content_type": "text",
        "content_attributes": {
          "button_reply": {
            "id": "@duvidas_gerais",
            "title": "@duvidas_gerais"
          },
          "interaction_type": "button_reply",
          "interactive_payload": {
            "type": "button_reply",
            "button_reply": {
              "id": "@duvidas_gerais",
              "title": "Dúvidas gerais"
            }
          }
        },
        "sender_type": "Contact",
        "sender_id": 1447,
        "external_source_ids": {},
        "additional_attributes": {},
        "processed_message_content": "Dúvidas gerais",
        "sentiment": {}
      },
      "conversation": {
        "id": 2133,
        "account_id": 3,
        "inbox_id": 4,
        "status": "pending",
        "assignee_id": null,
        "created_at": "2025-08-12T17:53:23.278Z",
        "updated_at": "2025-08-13T22:44:06.877Z",
        "contact_id": 1447,
        "display_id": 1923,
        "contact_last_seen_at": null,
        "agent_last_seen_at": "2025-08-12T18:57:06.792Z",
        "additional_attributes": {},
        "contact_inbox_id": 1690,
        "uuid": "08c5e7d4-9100-41bb-bf5b-c55a965cebcb",
        "identifier": null,
        "last_activity_at": "2025-08-13T22:44:06.875Z",
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
        "updated_at": "2025-08-13T22:44:06.926Z",
        "additional_attributes": {},
        "identifier": null,
        "custom_attributes": {},
        "last_activity_at": "2025-08-13T22:44:06.920Z",
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
      },
      "socialwise-chatwit": {
        "whatsapp_identifiers": {
          "wamid": randomWamid,
          "whatsapp_id": randomWamid,
          "contact_source": "558597550136"
        },
        "contact_data": {
          "id": 1447,
          "name": "Witalo Rocha",
          "phone_number": "+558597550136",
          "email": null,
          "identifier": null,
          "custom_attributes": {}
        },
        "conversation_data": {
          "id": 2133,
          "status": "pending",
          "assignee_id": null,
          "created_at": "2025-08-12T17:53:23Z",
          "updated_at": "2025-08-13T22:44:06Z"
        },
        "message_data": {
          "id": 36023,
          "content": "Dúvidas gerais",
          "content_type": "text",
          "message_type": "incoming",
          "created_at": "2025-08-13T22:44:06Z",
          "interactive_data": {
            "button_reply": {
              "id": "@duvidas_gerais",
              "title": "Dúvidas gerais"
            }
          },
          "instagram_data": {}
        },
        "inbox_data": {
          "id": "4",
          "name": "WhatsApp - ANA",
          "channel_type": "Channel::Whatsapp"
        },
        "account_data": {
          "id": "3",
          "name": "DraAmandaSousa"
        },
        "metadata": {
          "socialwise_active": true,
          "is_whatsapp_channel": true,
          "payload_version": "2.0",
          "timestamp": "2025-08-13T22:44:06Z",
          "has_whatsapp_api_key": true
        },
        "whatsapp_api_key": "EAAGIBII4GXQBO2qgvJ2jdcUmgkdqBo5bUKEanJWmCLpcZAsq0Ovpm4JNlrNLeZAv3OYNrdCqqQBAHfEfPFD0FPnZAOQJURB9GKcbXpa83XdAsa3i6fTr23lBFM2LwUZC23xXrZAnB8QjCCFZBxrxlBvzPj8LsejvUjz0C04Q8Jsl8nTGHUd4ZBRPc4NiHFnc",
        "whatsapp_phone_number_id": "274633962398273",
        "whatsapp_business_id": "294585820394901"
      }
    }
  };
}

async function testButtonClick() {
  const payload = createButtonClickPayload();

  console.log('🔘 Teste de clique no botão "Dúvidas gerais"');
  console.log('📱 Mensagem:', payload.message);
  console.log('🔘 Botão ID:', payload.context.message.content_attributes?.button_reply?.id);
  console.log('🔘 Botão Título:', payload.context.message.content_attributes?.button_reply?.title);
  console.log('🔑 Source ID:', payload.context.message.source_id);
  console.log('');

  try {
    const response = await fetch('http://localhost:3002/api/integrations/webhooks/socialwiseflow', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Test-Webhook/1.0'
      },
      body: JSON.stringify(payload)
    });

    console.log('📊 Status HTTP:', response.status);
    console.log('📊 Status Text:', response.statusText);

    const responseText = await response.text();
    console.log('');
    console.log('📄 RESPOSTA COMPLETA:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(responseText);

    if (response.headers.get('content-type')?.includes('application/json')) {
      try {
        const result = JSON.parse(responseText);
        console.log('');
        console.log('🔍 RESPOSTA JSON ESTRUTURADA:');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(JSON.stringify(result, null, 2));
        
        // Análise da resposta
        console.log('');
        console.log('🔍 ANÁLISE:');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        if (result.whatsapp?.interactive?.body?.text) {
          console.log('✅ LLM respondeu com texto:', result.whatsapp.interactive.body.text);
        }
        if (result.whatsapp?.interactive?.action?.buttons) {
          console.log('✅ LLM gerou', result.whatsapp.interactive.action.buttons.length, 'botões novos');
          result.whatsapp.interactive.action.buttons.forEach((btn, i) => {
            console.log(`   ${i+1}. "${btn.reply.title}" (${btn.reply.id})`);
          });
        }
        
      } catch (e) {
        console.log('❌ Resposta não é JSON válido');
      }
    }

  } catch (error) {
    console.log('❌ Erro na requisição:', error.message);
  }
}

testButtonClick();
