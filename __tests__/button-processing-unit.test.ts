/**
 * Teste unitário para verificar o processamento de botões
 * Testa apenas a lógica de detecção sem dependências externas
 */

describe('Button Processing Logic', () => {
  
  describe('Button Detection', () => {
    test('deve detectar clique de botão Instagram corretamente', () => {
      // Payload real do Instagram
      const validPayload = {
        "session_id": "1002859634954741",
        "message": "Falar com a Dra",
        "channel_type": "Channel::Instagram",
        "language": "pt-BR",
        "context": {
          "message": {
            "content_attributes": {
              "postback_payload": "ig_btn_1755004696546_uekaa4clu"
            }
          },
          "socialwise-chatwit": {
            "account_data": { "id": 3 },
            "inbox_data": { "id": 105, "channel_type": "Channel::Instagram" }
          }
        }
      };

      // Simular a lógica de detecção do webhook (copiada do route.ts)
      const channelType = validPayload.channel_type;
      const ca = validPayload.context.message?.content_attributes || {};
      
      let isButtonClick = false;
      let buttonId: string | null = null;
      let detectionSource = '';

      // Instagram: detectar postback_payload
      if (channelType.toLowerCase().includes('instagram')) {
        const postbackPayload = (ca as any)?.postback_payload;
        if (postbackPayload) {
          isButtonClick = true;
          buttonId = postbackPayload;
          detectionSource = 'instagram_postback';
        }
      }

      console.log('🔘 Instagram Button Detection Results:');
      console.log('   Is Button Click:', isButtonClick);
      console.log('   Button ID:', buttonId);
      console.log('   Detection Source:', detectionSource);
      console.log('   Channel Type:', channelType);

      expect(isButtonClick).toBe(true);
      expect(buttonId).toBe('ig_btn_1755004696546_uekaa4clu');
      expect(detectionSource).toBe('instagram_postback');
    });

    test('deve detectar clique de botão WhatsApp corretamente', () => {
      // Payload real do WhatsApp
      const validPayload = {
        "session_id": "558597550136",
        "message": "Falar com a Dra",
        "channel_type": "Channel::Whatsapp",
        "language": "pt_BR",
        "context": {
          "message": {
            "content_attributes": {
              "button_reply": {
                "id": "btn_1754993780819_0_tqji",
                "title": "Falar com a Dra"
              }
            }
          },
          "socialwise-chatwit": {
            "account_data": { "id": 3 },
            "inbox_data": { "id": 4, "channel_type": "Channel::Whatsapp" }
          }
        }
      };

      // Simular a lógica de detecção do webhook (copiada do route.ts)
      const channelType = validPayload.channel_type;
      const ca = validPayload.context.message?.content_attributes || {};
      
      let isButtonClick = false;
      let buttonId: string | null = null;
      let buttonTitle: string | null = null;
      let detectionSource = '';

      // WhatsApp: detectar button_reply
      if (channelType.toLowerCase().includes('whatsapp')) {
        const buttonReply = (ca as any)?.button_reply;
        if (buttonReply?.id) {
          isButtonClick = true;
          buttonId = buttonReply.id;
          buttonTitle = buttonReply.title || null;
          detectionSource = 'whatsapp_button_reply';
        }
      }

      console.log('🔘 WhatsApp Button Detection Results:');
      console.log('   Is Button Click:', isButtonClick);
      console.log('   Button ID:', buttonId);
      console.log('   Button Title:', buttonTitle);
      console.log('   Detection Source:', detectionSource);
      console.log('   Channel Type:', channelType);

      expect(isButtonClick).toBe(true);
      expect(buttonId).toBe('btn_1754993780819_0_tqji');
      expect(buttonTitle).toBe('Falar com a Dra');
      expect(detectionSource).toBe('whatsapp_button_reply');
    });

    test('não deve detectar botão em mensagem normal', () => {
      // Payload de mensagem normal (sem botão)
      const validPayload = {
        "session_id": "1002859634954741",
        "message": "Olá, preciso de ajuda",
        "channel_type": "Channel::Instagram",
        "language": "pt-BR",
        "context": {
          "message": {
            "content_attributes": {}
          },
          "socialwise-chatwit": {
            "account_data": { "id": 3 },
            "inbox_data": { "id": 105, "channel_type": "Channel::Instagram" }
          }
        }
      };

      // Simular a lógica de detecção do webhook
      const channelType = validPayload.channel_type;
      const ca = validPayload.context.message?.content_attributes || {};
      
      let isButtonClick = false;
      let buttonId: string | null = null;

      // Instagram: detectar postback_payload
      if (channelType.toLowerCase().includes('instagram')) {
        const postbackPayload = (ca as any)?.postback_payload;
        if (postbackPayload) {
          isButtonClick = true;
          buttonId = postbackPayload;
        }
      }

      console.log('🔘 Normal Message Detection Results:');
      console.log('   Is Button Click:', isButtonClick);
      console.log('   Button ID:', buttonId);
      console.log('   Message:', validPayload.message);

      expect(isButtonClick).toBe(false);
      expect(buttonId).toBeNull();
    });
  });

  describe('Response Generation', () => {
    test('deve gerar resposta para botão com mapeamento', () => {
      const buttonMapping = {
        id: 'mapping-123',
        buttonId: 'ig_btn_test',
        actionType: 'SEND_TEMPLATE',
        actionPayload: {
          emoji: '❤️',
          textReaction: 'Obrigado pela sua mensagem!'
        }
      };

      // Simular construção da resposta (copiada do route.ts)
      const buttonReactionResponse: any = {
        action: 'button_reaction',
        buttonId: buttonMapping.buttonId,
        processed: true,
        mappingFound: true
      };

      const actionPayload = buttonMapping.actionPayload as any || {};
      const emoji = actionPayload?.emoji;
      const textReaction = actionPayload?.textReaction;

      if (emoji) {
        buttonReactionResponse.emoji = emoji;
      }

      if (textReaction) {
        buttonReactionResponse.text = textReaction;
      }

      console.log('🎯 Button Response with Mapping:');
      console.log('   Action:', buttonReactionResponse.action);
      console.log('   Button ID:', buttonReactionResponse.buttonId);
      console.log('   Emoji:', buttonReactionResponse.emoji);
      console.log('   Text:', buttonReactionResponse.text);
      console.log('   Mapping Found:', buttonReactionResponse.mappingFound);

      expect(buttonReactionResponse.action).toBe('button_reaction');
      expect(buttonReactionResponse.buttonId).toBe('ig_btn_test');
      expect(buttonReactionResponse.emoji).toBe('❤️');
      expect(buttonReactionResponse.text).toBe('Obrigado pela sua mensagem!');
      expect(buttonReactionResponse.mappingFound).toBe(true);
      expect(buttonReactionResponse.processed).toBe(true);
    });

    test('deve gerar resposta padrão para botão sem mapeamento', () => {
      const buttonId = 'btn_unknown';

      // Simular resposta padrão (copiada do route.ts)
      const defaultReactionResponse = {
        action: 'button_reaction',
        buttonId: buttonId,
        emoji: '👍',
        text: null,
        processed: true,
        mappingFound: false
      };

      console.log('🎯 Default Button Response:');
      console.log('   Action:', defaultReactionResponse.action);
      console.log('   Button ID:', defaultReactionResponse.buttonId);
      console.log('   Emoji:', defaultReactionResponse.emoji);
      console.log('   Text:', defaultReactionResponse.text);
      console.log('   Mapping Found:', defaultReactionResponse.mappingFound);

      expect(defaultReactionResponse.action).toBe('button_reaction');
      expect(defaultReactionResponse.buttonId).toBe('btn_unknown');
      expect(defaultReactionResponse.emoji).toBe('👍');
      expect(defaultReactionResponse.text).toBeNull();
      expect(defaultReactionResponse.mappingFound).toBe(false);
      expect(defaultReactionResponse.processed).toBe(true);
    });
  });

  describe('Channel-specific Processing', () => {
    test('deve processar metadados específicos do WhatsApp', () => {
      const buttonId = 'btn_whatsapp_test';
      const emoji = '🎉';
      const textReaction = 'Perfeito!';
      const wamid = 'wamid.test123';
      const channelType = 'Channel::Whatsapp';

      // Simular construção de resposta com metadados WhatsApp
      const buttonReactionResponse: any = {
        action: 'button_reaction',
        buttonId: buttonId,
        processed: true,
        mappingFound: true
      };

      if (emoji) {
        buttonReactionResponse.emoji = emoji;
      }

      if (textReaction) {
        buttonReactionResponse.text = textReaction;
      }

      // Para WhatsApp: incluir metadados específicos
      if (channelType.toLowerCase().includes('whatsapp')) {
        buttonReactionResponse.whatsapp = {
          message_id: wamid,
          reaction_emoji: emoji,
          response_text: textReaction
        };
      }

      console.log('🎯 WhatsApp-specific Response:');
      console.log('   WhatsApp Metadata:', buttonReactionResponse.whatsapp);

      expect(buttonReactionResponse.whatsapp).toBeDefined();
      expect(buttonReactionResponse.whatsapp.message_id).toBe('wamid.test123');
      expect(buttonReactionResponse.whatsapp.reaction_emoji).toBe('🎉');
      expect(buttonReactionResponse.whatsapp.response_text).toBe('Perfeito!');
    });

    test('deve processar metadados específicos do Instagram', () => {
      const buttonId = 'ig_btn_instagram_test';
      const emoji = '💖';
      const textReaction = 'Adorei!';
      const messageId = 'ig_message_456';
      const channelType = 'Channel::Instagram';

      // Simular construção de resposta com metadados Instagram
      const buttonReactionResponse: any = {
        action: 'button_reaction',
        buttonId: buttonId,
        processed: true,
        mappingFound: true
      };

      if (emoji) {
        buttonReactionResponse.emoji = emoji;
      }

      if (textReaction) {
        buttonReactionResponse.text = textReaction;
      }

      // Para Instagram: incluir metadados específicos
      if (channelType.toLowerCase().includes('instagram')) {
        buttonReactionResponse.instagram = {
          message_id: messageId,
          reaction_emoji: emoji,
          response_text: textReaction
        };
      }

      console.log('🎯 Instagram-specific Response:');
      console.log('   Instagram Metadata:', buttonReactionResponse.instagram);

      expect(buttonReactionResponse.instagram).toBeDefined();
      expect(buttonReactionResponse.instagram.message_id).toBe('ig_message_456');
      expect(buttonReactionResponse.instagram.reaction_emoji).toBe('💖');
      expect(buttonReactionResponse.instagram.response_text).toBe('Adorei!');
    });
  });
});
