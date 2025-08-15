/**
 * Test Payload Generators
 * Provides consistent test payloads for SocialWise Flow testing
 */

export interface SocialWisePayloadOptions {
  message?: string;
  channel_type?: string;
  session_id?: string;
  wamid?: string;
  inbox_id?: string;
  account_id?: string;
  phone_number_id?: string;
  business_id?: string;
  interaction_type?: string;
  button_id?: string;
  button_title?: string;
  postback_payload?: string;
}

export function createSocialWisePayload(options: SocialWisePayloadOptions = {}) {
  const {
    message = 'test message',
    channel_type = 'whatsapp',
    session_id = 'session-123',
    wamid = 'wamid.test123',
    inbox_id = '4',
    account_id = '1',
    phone_number_id = '123456789',
    business_id = 'business123',
    interaction_type,
    button_id,
    button_title,
    postback_payload,
  } = options;

  const basePayload = {
    session_id,
    context: {
      'socialwise-chatwit': {
        inbox_data: {
          id: inbox_id,
          name: 'Test Inbox',
          channel_type,
        },
        account_data: {
          id: account_id,
        },
        whatsapp_phone_number_id: phone_number_id,
        whatsapp_business_id: business_id,
        wamid,
      },
    },
    message,
    channel_type,
  };

  // Add interactive data if provided
  if (interaction_type || button_id || button_title || postback_payload) {
    const messageData: any = {};
    
    if (interaction_type === 'button_reply' && button_id && button_title) {
      messageData.interactive_data = {
        interaction_type: 'button_reply',
        button_id,
        button_title,
      };
    }
    
    if (interaction_type === 'postback' && postback_payload) {
      messageData.instagram_data = {
        interaction_type: 'postback',
        postback_payload,
      };
    }
    
    if (Object.keys(messageData).length > 0) {
      basePayload.context['socialwise-chatwit'].message_data = messageData;
    }

    // Add content attributes for compatibility
    if (button_id && button_title) {
      basePayload.context.message = {
        content_attributes: {
          interaction_type: 'button_reply',
          button_reply: {
            id: button_id,
            title: button_title,
          },
        },
      };
    }
    
    if (postback_payload) {
      basePayload.context.message = {
        content_attributes: {
          interaction_type: 'postback',
          postback_payload,
        },
      };
    }
  }

  return basePayload;
}

export interface LegacyChatwitPayloadOptions {
  account_id?: number;
  conversation_id?: number;
  message_id?: number;
  message_type?: 'incoming' | 'outgoing';
  content?: string;
  channel?: string;
  sender_id?: number;
  content_attributes?: any;
}

export function createLegacyChatwitPayload(options: LegacyChatwitPayloadOptions = {}) {
  const {
    account_id = 1,
    conversation_id = 123,
    message_id = 456,
    message_type = 'incoming',
    content = 'test message',
    channel = 'whatsapp',
    sender_id = 789,
    content_attributes = {},
  } = options;

  return {
    account_id,
    conversation: {
      id: conversation_id,
    },
    message: {
      id: message_id,
      message_type,
      content,
      sender: {
        id: sender_id,
      },
      content_attributes,
    },
    channel,
  };
}

export function createWhatsAppButtonPayload(options: {
  button_id: string;
  button_title: string;
  message?: string;
  wamid?: string;
}) {
  return createSocialWisePayload({
    message: options.message || options.button_title,
    interaction_type: 'button_reply',
    button_id: options.button_id,
    button_title: options.button_title,
    wamid: options.wamid || `wamid.button_${Date.now()}`,
  });
}

export function createInstagramPostbackPayload(options: {
  postback_payload: string;
  message?: string;
  wamid?: string;
}) {
  return createSocialWisePayload({
    message: options.message || 'Instagram postback',
    channel_type: 'instagram',
    interaction_type: 'postback',
    postback_payload: options.postback_payload,
    wamid: options.wamid || `wamid.instagram_${Date.now()}`,
  });
}

export function createFacebookMessengerPayload(options: {
  message?: string;
  wamid?: string;
}) {
  return createSocialWisePayload({
    message: options.message || 'Facebook messenger message',
    channel_type: 'facebook',
    wamid: options.wamid || `wamid.facebook_${Date.now()}`,
  });
}

export function createIntentPayload(options: {
  intent_name: string;
  message?: string;
  wamid?: string;
  channel_type?: string;
}) {
  return createSocialWisePayload({
    message: options.message || `@${options.intent_name}`,
    channel_type: options.channel_type || 'whatsapp',
    wamid: options.wamid || `wamid.intent_${Date.now()}`,
  });
}

export function createHandoffPayload(options: {
  message?: string;
  wamid?: string;
  channel_type?: string;
}) {
  return createSocialWisePayload({
    message: options.message || 'quero falar com um atendente',
    channel_type: options.channel_type || 'whatsapp',
    wamid: options.wamid || `wamid.handoff_${Date.now()}`,
  });
}

export function createLargePayload(options: {
  message?: string;
  wamid?: string;
  metadata_size?: number;
}) {
  const basePayload = createSocialWisePayload({
    message: options.message || 'large payload test',
    wamid: options.wamid || `wamid.large_${Date.now()}`,
  });

  // Add large metadata to simulate real-world complex payloads
  const metadataSize = options.metadata_size || 100;
  const largeMetadata = {
    userAgent: 'WhatsApp/2.21.15.15 A',
    deviceInfo: {
      platform: 'android',
      version: '11',
      model: 'SM-G991B',
      manufacturer: 'Samsung',
    },
    messageHistory: Array.from({ length: metadataSize }, (_, i) => ({
      id: `msg_${i}`,
      timestamp: Date.now() - i * 60000,
      type: 'text',
      content: `Message ${i} with some content that makes the payload larger`,
    })),
    customFields: Object.fromEntries(
      Array.from({ length: 50 }, (_, i) => [`field_${i}`, `value_${i}_with_some_additional_data`])
    ),
  };

  basePayload.context['socialwise-chatwit'].metadata = largeMetadata;

  return basePayload;
}

export function createMalformedPayload(type: 'missing_fields' | 'invalid_structure' | 'null_values' | 'wrong_types') {
  switch (type) {
    case 'missing_fields':
      return {
        session_id: 'session-malformed',
        // Missing context and other required fields
      };

    case 'invalid_structure':
      return {
        invalid_structure: true,
        random_field: 'random_value',
        nested: {
          also_invalid: true,
        },
      };

    case 'null_values':
      return {
        session_id: null,
        context: null,
        message: null,
        channel_type: null,
      };

    case 'wrong_types':
      return {
        session_id: 123, // Should be string
        context: 'invalid', // Should be object
        message: { invalid: true }, // Should be string
        channel_type: ['array'], // Should be string
      };

    default:
      return {};
  }
}

export function createErrorScenarioPayloads() {
  return {
    jsonParseError: 'invalid json {',
    oversizedPayload: JSON.stringify(createLargePayload({ metadata_size: 10000 })),
    missingFields: JSON.stringify(createMalformedPayload('missing_fields')),
    invalidStructure: JSON.stringify(createMalformedPayload('invalid_structure')),
    nullValues: JSON.stringify(createMalformedPayload('null_values')),
    wrongTypes: JSON.stringify(createMalformedPayload('wrong_types')),
  };
}

export function createPerformanceTestPayloads(count: number = 100) {
  const payloads = [];
  
  for (let i = 0; i < count; i++) {
    const payloadType = i % 4;
    
    switch (payloadType) {
      case 0: // HARD band
        payloads.push(createSocialWisePayload({
          message: `recurso oab test ${i}`,
          wamid: `wamid.hard_${i}`,
        }));
        break;
        
      case 1: // SOFT band
        payloads.push(createSocialWisePayload({
          message: `questão jurídica oab ${i}`,
          wamid: `wamid.soft_${i}`,
        }));
        break;
        
      case 2: // LOW band
        payloads.push(createSocialWisePayload({
          message: `oi tudo bem ${i}`,
          wamid: `wamid.low_${i}`,
        }));
        break;
        
      case 3: // Button interaction
        payloads.push(createWhatsAppButtonPayload({
          button_id: `@intent_${i}`,
          button_title: `Intent ${i}`,
          wamid: `wamid.button_${i}`,
        }));
        break;
    }
  }
  
  return payloads;
}

export function createChannelSpecificPayloads() {
  return {
    whatsapp: createSocialWisePayload({
      message: 'whatsapp test message',
      channel_type: 'whatsapp',
      wamid: 'wamid.whatsapp_test',
    }),
    
    instagram: createSocialWisePayload({
      message: 'instagram test message',
      channel_type: 'instagram',
      wamid: 'wamid.instagram_test',
    }),
    
    facebook: createSocialWisePayload({
      message: 'facebook test message',
      channel_type: 'facebook',
      wamid: 'wamid.facebook_test',
    }),
    
    messenger: createSocialWisePayload({
      message: 'messenger test message',
      channel_type: 'messenger',
      wamid: 'wamid.messenger_test',
    }),
  };
}

export function createSecurityTestPayloads() {
  return {
    xssAttempt: createSocialWisePayload({
      message: '<script>alert("xss")</script>test message',
      wamid: 'wamid.xss_test',
    }),
    
    sqlInjection: createSocialWisePayload({
      message: "'; DROP TABLE users; --",
      wamid: 'wamid.sql_test',
    }),
    
    longMessage: createSocialWisePayload({
      message: 'A'.repeat(10000), // Very long message
      wamid: 'wamid.long_test',
    }),
    
    specialCharacters: createSocialWisePayload({
      message: '!@#$%^&*()_+-=[]{}|;:,.<>?`~',
      wamid: 'wamid.special_test',
    }),
    
    unicodeCharacters: createSocialWisePayload({
      message: '🚀 Teste com emojis 🎉 e caracteres especiais ñáéíóú',
      wamid: 'wamid.unicode_test',
    }),
  };
}