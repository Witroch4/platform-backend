import fetch from 'node-fetch';

// Payload real do WhatsApp com botão "Falar com a Dra"
const payload = {
  "session_id": "558597550136",
  "message": "Falar com a Dra",
  "channel_type": "Channel::Whatsapp",
  "language": "pt_BR",
  "context": {
    "message": {
      "id": Math.floor(Math.random() * 100000),
      "content": "Falar com a Dra",
      "account_id": 3,
      "inbox_id": 4,
      "conversation_id": 2133,
      "message_type": "incoming",
      "created_at": new Date().toISOString(),
      "updated_at": new Date().toISOString(),
      "private": false,
      "status": "sent",
      "source_id": `wamid.HBgM${Date.now()}${Math.random().toString(36).substr(2, 16).toUpperCase()}A`,
      "content_type": "text",
      "content_attributes": {
        "button_reply": {
          "id": "@nao_mapeado_btn", // ID não mapeado
          "title": "Falar com a Dra"
        },
        "interaction_type": "button_reply",
        "interactive_payload": {
          "type": "button_reply",
          "button_reply": {
            "id": "@nao_mapeado_btn", // ID não mapeado
            "title": "Falar com a Dra"
          }
        }
      },
      "sender_type": "Contact",
      "sender_id": 1447,
      "external_source_ids": {},
      "additional_attributes": {},
      "processed_message_content": "Falar com a Dra",
      "sentiment": {}
    },
    "conversation": {
      "id": 2133,
      "account_id": 3,
      "inbox_id": 4,
      "status": "pending",
      "assignee_id": null,
      "created_at": "2025-08-12T17:53:23.278Z",
      "updated_at": new Date().toISOString(),
      "contact_id": 1447,
      "display_id": 1923,
      "contact_last_seen_at": null,
      "agent_last_seen_at": "2025-08-12T18:57:06.792Z",
      "additional_attributes": {},
      "contact_inbox_id": 1690,
      "uuid": "08c5e7d4-9100-41bb-bf5b-c55a965cebcb",
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
        "wamid": `wamid.HBgM${Date.now()}${Math.random().toString(36).substr(2, 16).toUpperCase()}A`,
        "whatsapp_id": `wamid.HBgM${Date.now()}${Math.random().toString(36).substr(2, 16).toUpperCase()}A`,
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
        "updated_at": new Date().toISOString()
      },
      "message_data": {
        "id": Math.floor(Math.random() * 100000),
        "content": "Falar com a Dra",
        "content_type": "text",
        "message_type": "incoming",
        "created_at": new Date().toISOString(),
        "interactive_data": {
          "button_id": "@nao_mapeado_btn",
          "button_title": "Falar com a Dra",
          "interaction_type": "button_reply"
        },
        "instagram_data": {}
      },
      "inbox_data": {
        "id": 4,
        "name": "WhatsApp - ANA",
        "channel_type": "Channel::Whatsapp"
      },
      "account_data": {
        "id": 3,
        "name": "DraAmandaSousa"
      },
      "metadata": {
        "socialwise_active": true,
        "is_whatsapp_channel": true,
        "payload_version": "2.0",
        "timestamp": new Date().toISOString(),
        "has_whatsapp_api_key": true
      },
      "whatsapp_api_key": "EAAGIBII4GXQBO2qgvJ2jdcUmgkdqBo5bUKEanJWmCLpcZAsq0Ovpm4JNlrNLeZAv3OYNrdCqqQBAHfEfPFD0FPnZAOQJURB9GKcbjXeDpa83XdAsa3i6fTr23lBFM2LwUZC23xXrZAnB8QjCCFZBxrxlBvzPj8LsejvUjz0C04Q8Jsl8nTGHUd4ZBRPc4NiHFnc",
      "whatsapp_phone_number_id": "274633962398273",
      "whatsapp_business_id": "294585820394901"
    }
  }
};

console.log('🔵 Testando melhoria: usar texto real do botão ("Falar com a Dra") em vez do ID (@nao_mapeado_btn)');
console.log('📱 Texto do botão:', payload.message);
console.log('🆔 ID do botão:', payload.context.message.content_attributes.button_reply.id);
console.log('');

try {
  const response = await fetch('http://localhost:3002/api/integrations/webhooks/socialwiseflow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const result = await response.json();
  console.log('✅ Resposta do webhook:');
  console.log(JSON.stringify(result, null, 2));
  
} catch (error) {
  console.error('❌ Erro no teste:', error.message);
}
