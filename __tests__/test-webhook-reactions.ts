/**
 * Test script for webhook reaction processing
 * This tests the complete flow from webhook to reaction queue
 */

import { extractWebhookData } from '../lib/webhook-utils';
import { getEmojiForButton, hasReactionMapping } from '../app/config/button-reaction-mapping';

// Mock webhook payload with button reply
const mockWebhookPayload = {
  "queryResult": {
    "intent": {
      "displayName": "button_reply_intent"
    },
    "queryText": "User clicked button",
    "parameters": {}
  },
  "originalDetectIntentRequest": {
    "payload": {
      "wamid": "wamid.HBgNNTU4NDk5NDA3Mjg3NhUCABIYFjNBMzMzOTM4MzI2RjVBNzE4OTVFAA==",
      "message_id": "12345",
      "conversation_id": "67890", 
      "inbox_id": "inbox_123",
      "contact_phone": "5584994072876",
      "whatsapp_api_key": "EAAG1234567890abcdef...",
      "interactive": {
        "type": "button_reply",
        "button_reply": {
          "id": "aceito_fazer",
          "title": "Aceitar Proposta"
        }
      },
      "context": {
        "id": "wamid.ORIGINAL_MESSAGE_ID_HERE"
      },
      "message_content_type": "interactive",
      "message_type": "incoming"
    }
  },
  "session": "projects/mtf-diamante-project/agent/sessions/5584994072876"
};

console.log('=== Testing Webhook Data Extraction ===');

// Test webhook data extraction
const webhookData = extractWebhookData(mockWebhookPayload);
console.log('Extracted webhook data:', {
  whatsappApiKey: webhookData.whatsappApiKey ? `${webhookData.whatsappApiKey.substring(0, 10)}...` : 'N/A',
  messageId: webhookData.messageId,
  conversationId: webhookData.conversationId,
  contactPhone: webhookData.contactPhone,
  inboxId: webhookData.inboxId,
  intentName: webhookData.intentName
});

console.log('\n=== Testing Button Reply Detection ===');

// Test button reply detection logic (simulating the webhook function)
function detectButtonReply(req: any) {
  const chatwootPayload = req.originalDetectIntentRequest?.payload;
  const interactive = chatwootPayload?.interactive;
  
  if (interactive?.type === 'button_reply') {
    const buttonId = interactive.button_reply?.id;
    const contextId = chatwootPayload?.context?.id;
    
    console.log(`✓ Button reply detected:`);
    console.log(`  Button ID: ${buttonId}`);
    console.log(`  Original Message ID: ${contextId}`);
    
    if (buttonId && contextId && hasReactionMapping(buttonId)) {
      const emoji = getEmojiForButton(buttonId);
      
      console.log(`✓ Reaction mapping found:`);
      console.log(`  Emoji: ${emoji}`);
      console.log(`  Would queue reaction task with:`);
      console.log(`    - Recipient: ${chatwootPayload.contact_phone}`);
      console.log(`    - Original Message: ${contextId}`);
      console.log(`    - Emoji: ${emoji}`);
      console.log(`    - Button ID: ${buttonId}`);
      console.log(`    - API Key: ${chatwootPayload.whatsapp_api_key?.substring(0, 10)}...`);
      
      return {
        shouldReact: true,
        reactionData: {
          recipientPhone: chatwootPayload.contact_phone,
          originalMessageId: contextId,
          emoji: emoji,
          buttonId: buttonId,
          whatsappApiKey: chatwootPayload.whatsapp_api_key
        }
      };
    } else {
      console.log(`✗ No reaction mapping for button: ${buttonId}`);
      return { shouldReact: false };
    }
  } else {
    console.log('✗ Not a button reply message');
    return { shouldReact: false };
  }
}

const reactionResult = detectButtonReply(mockWebhookPayload);

console.log('\n=== Test Results ===');
console.log(`Should send reaction: ${reactionResult.shouldReact}`);
if (reactionResult.shouldReact) {
  console.log('Reaction would be queued successfully! ✓');
} else {
  console.log('No reaction would be sent. ✗');
}

console.log('\n=== Testing Different Button Types ===');

const testButtons = ['aceito_fazer', 'recusar_proposta', 'unknown_button'];

testButtons.forEach(buttonId => {
  const testPayload = {
    ...mockWebhookPayload,
    originalDetectIntentRequest: {
      ...mockWebhookPayload.originalDetectIntentRequest,
      payload: {
        ...mockWebhookPayload.originalDetectIntentRequest.payload,
        interactive: {
          type: 'button_reply',
          button_reply: {
            id: buttonId,
            title: `Test Button ${buttonId}`
          }
        }
      }
    }
  };
  
  console.log(`\nTesting button: ${buttonId}`);
  const result = detectButtonReply(testPayload);
  console.log(`  Result: ${result.shouldReact ? 'Would react' : 'No reaction'}`);
});

console.log('\n=== Test Complete ===');