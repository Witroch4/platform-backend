/**
 * Test script for button reaction functionality
 * This simulates a webhook payload with a button reply to test the reaction system
 */

import { getEmojiForButton, hasReactionMapping } from '../app/config/button-reaction-mapping';

// Test the button reaction mapping
console.log('=== Testing Button Reaction Mapping ===');

const testButtons = [
  'aceito_fazer',
  'recusar_proposta', 
  'id_enviar_prova',
  'id_qual_pix',
  'id_finalizar',
  'change-button',
  'cancel-button',
  'unknown_button'
];

testButtons.forEach(buttonId => {
  const hasMapping = hasReactionMapping(buttonId);
  const emoji = getEmojiForButton(buttonId);
  
  console.log(`Button: ${buttonId}`);
  console.log(`  Has mapping: ${hasMapping}`);
  console.log(`  Emoji: ${emoji || 'None'}`);
  console.log('');
});

// Test webhook payload structure for button reply
console.log('=== Sample Webhook Payload for Button Reply ===');

const sampleWebhookPayload = {
  "queryResult": {
    "intent": {
      "displayName": "button_reply_intent"
    },
    "queryText": "User clicked button"
  },
  "originalDetectIntentRequest": {
    "payload": {
      "wamid": "wamid.HBgNNTU4NDk5NDA3Mjg3NhUCABIYFjNBMzMzOTM4MzI2RjVBNzE4OTVFAA==",
      "message_id": "12345",
      "conversation_id": "67890",
      "inbox_id": "inbox_123",
      "contact_phone": "5584994072876",
      "whatsapp_api_key": "EAAG1234567890...",
      "interactive": {
        "type": "button_reply",
        "button_reply": {
          "id": "aceito_fazer",
          "title": "Aceitar"
        }
      },
      "context": {
        "id": "wamid.HBgNNTU4NDk5NDA3Mjg3NhUCABIYFjNBMzMzOTM4MzI2RjVBNzE4OTVFAA=="
      }
    }
  },
  "session": "projects/project-id/agent/sessions/5584994072876"
};

console.log('Sample payload structure:');
console.log(JSON.stringify(sampleWebhookPayload, null, 2));

// Test extraction of button reply data
const chatwootPayload = sampleWebhookPayload.originalDetectIntentRequest?.payload;
const interactive = chatwootPayload?.interactive;

if (interactive?.type === 'button_reply') {
  const buttonId = interactive.button_reply?.id;
  const contextId = chatwootPayload?.context?.id;
  
  console.log('\n=== Extracted Button Reply Data ===');
  console.log(`Button ID: ${buttonId}`);
  console.log(`Context ID (original message): ${contextId}`);
  console.log(`Has reaction mapping: ${hasReactionMapping(buttonId || '')}`);
  console.log(`Emoji: ${getEmojiForButton(buttonId || '')}`);
}

console.log('\n=== Test Complete ===');