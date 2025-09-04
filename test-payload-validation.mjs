#!/usr/bin/env node

// Teste do webhook com payload do Instagram
const testPayload = {
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
      "source_id": "aWdfZAG1faXRlbToxOklHTWVzc2FnZAUlETeu8kJUi2UYo0r3KFgqo13yca6HAvBokbZkClOiPZDZD",
      "content_type": "text",
      "content_attributes": {
        "in_reply_to_external_id": null,
        "postback_payload": "ig_btn_1755004696546_uekaa4clu"
      },
      "sender_type": "Contact",
      "sender_id": 1885,
      "external_source_ids": {},
      "additional_attributes": {},
      "processed_message_content": "Falar com a Dra",
      "sentiment": {}
    },
    "conversation": {
      "id": 2132,
      "account_id": 3,
      "inbox_id": 105,
      "status": "pending",
      "assignee_id": null,
      "created_at": "2025-08-12T17:30:10.706Z",
      "updated_at": "2025-08-13T23:02:06.968Z",
      "contact_id": 1885,
      "display_id": 1922,
      "contact_last_seen_at": null,
      "agent_last_seen_at": "2025-08-12T21:29:14.507Z",
      "additional_attributes": {},
      "contact_inbox_id": 2177,
      "uuid": "0d586852-6639-4bd1-b2c9-c6df07756e6f",
      "identifier": null,
      "last_activity_at": "2025-08-13T23:02:06.966Z",
      "team_id": null,
      "campaign_id": null,
      "snoozed_until": null,
      "custom_attributes": {},
      "assignee_last_seen_at": null,
      "first_reply_created_at": null,
      "priority": null,
      "sla_policy_id": null,
      "waiting_since": "2025-08-12T17:30:10.706Z",
      "cached_label_list": null,
      "label_list": []
    },
    "contact": {
      "id": 1885,
      "name": "Witalo Rocha",
      "email": null,
      "phone_number": null,
      "account_id": 3,
      "created_at": "2025-07-25T11:02:03.286Z",
      "updated_at": "2025-08-13T23:02:07.005Z",
      "additional_attributes": {
        "social_profiles": {
          "instagram": "witalo_rocha_"
        },
        "social_instagram_user_name": "witalo_rocha_",
        "social_instagram_follower_count": 1262,
        "social_instagram_is_verified_user": false,
        "social_instagram_is_business_follow_user": true,
        "social_instagram_is_user_follow_business": true
      },
      "identifier": null,
      "custom_attributes": {},
      "last_activity_at": "2025-08-13T23:02:07.002Z",
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
      "channel_id": 4,
      "account_id": 3,
      "name": "dra.amandasousadv",
      "created_at": "2025-07-25T10:44:53.201Z",
      "updated_at": "2025-07-25T10:44:53.201Z",
      "channel_type": "Channel::Instagram",
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

async function testWebhook() {
  try {
    console.log('🧪 Testando webhook com payload do Instagram...');
    
    const response = await fetch('http://localhost:3000/api/integrations/webhooks/socialwiseflow', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.SOCIALWISEFLOW_ACCESS_TOKEN || 'test-token'}`
      },
      body: JSON.stringify(testPayload)
    });

    const responseData = await response.text();
    console.log('Status:', response.status);
    console.log('Response:', responseData);

    if (response.ok) {
      console.log('✅ Webhook funcionou corretamente!');
    } else {
      console.log('❌ Webhook falhou:', responseData);
    }

  } catch (error) {
    console.error('❌ Erro no teste:', error.message);
  }
}

testWebhook();
