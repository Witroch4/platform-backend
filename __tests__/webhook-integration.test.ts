/**
 * Teste de integração para o webhook de processamento de botões
 * Testa o endpoint real do webhook SocialWise Flow
 */

import { NextRequest, NextResponse } from 'next/server';
import { POST } from '../app/api/integrations/webhooks/socialwiseflow/route';

describe('Webhook Integration Tests', () => {
  
  describe('Button Processing Integration', () => {
    test('deve processar clique de botão Instagram corretamente', async () => {
      const payload = {
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
            "source_id": "aWdfZAG1faXRlbToxOklHTWVzc2FnZAUlEhuz9x4ge4ujajZuqRvxInEQsq2UwMrjb+qLmxAMjZDZD",
            "content_type": "text",
            "content_attributes": {
              "in_reply_to_external_id": null,
              "postback_payload": "ig_btn_1755004696546_uekaa4clu"
            },
            "sender_type": "Contact",
            "sender_id": 1885
          },
          "socialwise-chatwit": {
            "account_data": {
              "id": 3
            },
            "inbox_data": {
              "id": 105,
              "channel_type": "Channel::Instagram"
            },
            "message_data": {
              "id": "ig_message_123"
            }
          }
        }
      };

      // Criar mock request
      const request = {
        text: async () => JSON.stringify(payload),
        headers: {
          get: (name: string) => {
            if (name === 'authorization') return 'Bearer test-token';
            return null;
          }
        }
      } as unknown as NextRequest;

      console.log('🧪 Testando webhook com payload Instagram...');
      console.log('📤 Button ID:', payload.context.message.content_attributes.postback_payload);

      try {
        const response = await POST(request);
        const responseData = await response.json();

        console.log('📥 Status da resposta:', response.status);
        console.log('📥 Dados da resposta:', JSON.stringify(responseData, null, 2));

        expect(response.status).toBeLessThan(500); // Não deve dar erro interno
        expect(responseData).toBeDefined();

        // Se for uma resposta de botão, verificar estrutura
        if (responseData.action === 'button_reaction') {
          console.log('✅ Botão processado como reação!');
          expect(responseData.buttonId).toBe('ig_btn_1755004696546_uekaa4clu');
          expect(responseData.processed).toBe(true);
          
          if (responseData.mappingFound) {
            console.log('🎯 Mapeamento encontrado no banco!');
            console.log('   Emoji:', responseData.emoji);
            console.log('   Texto:', responseData.text);
          } else {
            console.log('⚠️ Usando reação padrão (sem mapeamento)');
            expect(responseData.emoji).toBe('👍');
          }
        } else {
          console.log('ℹ️ Resposta não é de botão:', responseData);
        }

      } catch (error) {
        console.error('❌ Erro no teste:', error instanceof Error ? error.message : String(error));
        throw error;
      }
    });

    test('deve processar clique de botão WhatsApp corretamente', async () => {
      const payload = {
        "session_id": "558597550136",
        "message": "Falar com a Dra",
        "channel_type": "Channel::Whatsapp",
        "language": "pt_BR",
        "context": {
          "message": {
            "id": 36023,
            "content": "Falar com a Dra",
            "account_id": 3,
            "inbox_id": 4,
            "conversation_id": 2133,
            "message_type": "incoming",
            "created_at": "2025-08-13T22:44:06.875Z",
            "updated_at": "2025-08-13T22:44:06.875Z",
            "private": false,
            "status": "sent",
            "source_id": "wamid.HBgMNTU4NTk3NTUwMTM2FQIAEhgUYUKJUUXPYYCBGWC71N0UX8A",
            "content_type": "text",
            "content_attributes": {
              "button_reply": {
                "id": "btn_1754993780819_0_tqji",
                "title": "Falar com a Dra"
              }
            },
            "sender_type": "Contact",
            "sender_id": 1885
          },
          "socialwise-chatwit": {
            "account_data": {
              "id": 3
            },
            "inbox_data": {
              "id": 4,
              "channel_type": "Channel::Whatsapp"
            },
            "message_data": {
              "id": "wa_message_123",
              "wamid": "wamid.HBgMNTU4NTk3NTUwMTM2FQIAEhgUYUKJUUXPYYCBGWC71N0UX8A"
            }
          }
        }
      };

      // Criar mock request
      const request = {
        text: async () => JSON.stringify(payload),
        headers: {
          get: (name: string) => {
            if (name === 'authorization') return 'Bearer test-token';
            return null;
          }
        }
      } as unknown as NextRequest;

      console.log('🧪 Testando webhook com payload WhatsApp...');
      console.log('📤 Button ID:', payload.context.message.content_attributes.button_reply.id);

      try {
        const response = await POST(request);
        const responseData = await response.json();

        console.log('📥 Status da resposta:', response.status);
        console.log('📥 Dados da resposta:', JSON.stringify(responseData, null, 2));

        expect(response.status).toBeLessThan(500); // Não deve dar erro interno
        expect(responseData).toBeDefined();

        // Se for uma resposta de botão, verificar estrutura
        if (responseData.action === 'button_reaction') {
          console.log('✅ Botão processado como reação!');
          expect(responseData.buttonId).toBe('btn_1754993780819_0_tqji');
          expect(responseData.processed).toBe(true);
          
          if (responseData.mappingFound) {
            console.log('🎯 Mapeamento encontrado no banco!');
            console.log('   Emoji:', responseData.emoji);
            console.log('   Texto:', responseData.text);
          } else {
            console.log('⚠️ Usando reação padrão (sem mapeamento)');
            expect(responseData.emoji).toBe('👍');
          }
        } else {
          console.log('ℹ️ Resposta não é de botão:', responseData);
        }

      } catch (error) {
        console.error('❌ Erro no teste:', error instanceof Error ? error.message : String(error));
        throw error;
      }
    });

    test('deve processar mensagem normal (sem botão) corretamente', async () => {
      const payload = {
        "session_id": "1002859634954741",
        "message": "Olá, preciso de ajuda",
        "channel_type": "Channel::Instagram",
        "language": "pt-BR",
        "context": {
          "message": {
            "id": 36030,
            "content": "Olá, preciso de ajuda",
            "account_id": 3,
            "inbox_id": 105,
            "conversation_id": 2132,
            "message_type": "incoming",
            "created_at": "2025-08-13T23:05:06.966Z",
            "updated_at": "2025-08-13T23:05:06.966Z",
            "private": false,
            "status": "sent",
            "source_id": "aWdfZAG1faXRlbToxOklHTWVzc2FnZAUlEhuz9x4ge4ujajZuqRvxInEQsq2UwMrjb+qLmxAMjZD2",
            "content_type": "text",
            "content_attributes": {},
            "sender_type": "Contact",
            "sender_id": 1885
          },
          "socialwise-chatwit": {
            "account_data": {
              "id": 3
            },
            "inbox_data": {
              "id": 105,
              "channel_type": "Channel::Instagram"
            },
            "message_data": {
              "id": "ig_message_124"
            }
          }
        }
      };

      // Criar mock request
      const request = {
        text: async () => JSON.stringify(payload),
        headers: {
          get: (name: string) => {
            if (name === 'authorization') return 'Bearer test-token';
            return null;
          }
        }
      } as unknown as NextRequest;

      console.log('🧪 Testando webhook com mensagem normal...');
      console.log('📤 Mensagem:', payload.message);

      try {
        const response = await POST(request);
        const responseData = await response.json();

        console.log('📥 Status da resposta:', response.status);
        console.log('📥 Dados da resposta:', JSON.stringify(responseData, null, 2));

        expect(response.status).toBeLessThan(500); // Não deve dar erro interno
        expect(responseData).toBeDefined();

        // Não deve ser resposta de botão
        expect(responseData.action).not.toBe('button_reaction');
        console.log('✅ Mensagem processada como fluxo normal (não botão)');

      } catch (error) {
        console.error('❌ Erro no teste:', error instanceof Error ? error.message : String(error));
        throw error;
      }
    });
  });
});
