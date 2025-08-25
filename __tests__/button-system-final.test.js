/**
 * Teste Final do Sistema de Botões
 * Validar toda a cadeia: detecção → processamento → resposta estruturada
 */

const { handleButtonInteraction } = require('../lib/socialwise-flow/button-processor');

describe('🎯 Sistema Final de Botões', () => {
  test('✅ Detecção Instagram + Resposta Estruturada', async () => {
    const mockPayload = {
      context: {
        message: {
          content_attributes: {
            postback_payload: 'btn_test_instagram'
          }
        },
        'socialwise-chatwit': {
          message_data: {
            instagram_data: {},
            interactive_data: {}
          }
        }
      }
    };

    const result = await handleButtonInteraction(
      mockPayload,
      'instagram', 
      'user123',
      'msg123',
      'trace123'
    );

    expect(result).toMatchObject({
      action_type: 'button_reaction',
      buttonId: 'btn_test_instagram',
      processed: true
    });

    console.log('📱 Instagram Response:', JSON.stringify(result, null, 2));
  });

  test('✅ Detecção WhatsApp + Resposta Estruturada', async () => {
    const mockPayload = {
      context: {
        message: {
          content_attributes: {
            button_reply: {
              id: 'btn_test_whatsapp',
              title: 'Falar com Atendente'
            }
          }
        },
        'socialwise-chatwit': {
          message_data: {
            instagram_data: {},
            interactive_data: {}
          }
        }
      }
    };

    const result = await handleButtonInteraction(
      mockPayload,
      'whatsapp',
      'user123', 
      'wamid123',
      'trace123'
    );

    expect(result).toMatchObject({
      action_type: 'button_reaction',
      buttonId: 'btn_test_whatsapp',
      processed: true
    });

    console.log('📱 WhatsApp Response:', JSON.stringify(result, null, 2));
  });

  test('✅ Resposta com Handoff', async () => {
    // Simular botão que deveria ter action: "handoff"
    const mockPayload = {
      context: {
        message: {
          content_attributes: {
            button_reply: {
              id: 'btn_handoff_test',
              title: 'Falar com Humano'
            }
          }
        },
        'socialwise-chatwit': {
          message_data: {
            instagram_data: {},
            interactive_data: {}
          }
        }
      }
    };

    const result = await handleButtonInteraction(
      mockPayload,
      'whatsapp',
      'user123',
      'wamid123', 
      'trace123'
    );

    // Validar estrutura da resposta
    expect(result).toHaveProperty('action_type', 'button_reaction');
    expect(result).toHaveProperty('buttonId', 'btn_handoff_test');
    expect(result).toHaveProperty('processed', true);

    console.log('🤝 Handoff Response:', JSON.stringify(result, null, 2));
  });

  test('❌ Payload sem Botão', async () => {
    const mockPayload = {
      context: {
        message: {
          content_attributes: {}
        },
        'socialwise-chatwit': {
          message_data: {
            instagram_data: {},
            interactive_data: {}
          }
        }
      }
    };

    const result = await handleButtonInteraction(
      mockPayload,
      'whatsapp',
      'user123',
      'wamid123',
      'trace123'
    );

    expect(result).toBeNull();
    console.log('🚫 No Button Response:', result);
  });
});
