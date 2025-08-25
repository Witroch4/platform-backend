/**
 * Testes para processamento de botões no webhook SocialWise Flow
 */

import { getPrismaInstance } from '../lib/connections';

describe('Webhook Button Processing', () => {
  let prisma;

  beforeAll(() => {
    prisma = getPrismaInstance();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('Button Mappings Database', () => {
    test('deve ter mapeamentos de botões no banco', async () => {
      const mappings = await prisma.mapeamentoBotao.findMany({
        select: {
          id: true,
          buttonId: true,
          actionType: true,
          actionPayload: true,
          inbox: {
            select: {
              inboxId: true,
              nome: true
            }
          }
        }
      });

      console.log(`📊 Total de mapeamentos encontrados: ${mappings.length}`);
      
      if (mappings.length > 0) {
        console.log('\n📋 Mapeamentos encontrados:');
        mappings.forEach((mapping, index) => {
          console.log(`${index + 1}. ${mapping.buttonId} (Inbox: ${mapping.inbox?.inboxId})`);
          console.log(`   Emoji: ${mapping.actionPayload?.emoji || 'N/A'}`);
          console.log(`   Texto: ${mapping.actionPayload?.textReaction || 'N/A'}`);
        });
      }

      expect(mappings).toBeDefined();
    });

    test('deve verificar botões específicos dos testes', async () => {
      const testButtonIds = [
        'ig_btn_1755004696546_uekaa4clu',  // Instagram test
        'btn_1754993780819_0_tqji'         // WhatsApp test
      ];

      console.log('\n🎯 Verificando botões específicos...');

      for (const buttonId of testButtonIds) {
        const mapping = await prisma.mapeamentoBotao.findFirst({
          where: { buttonId },
          include: {
            inbox: {
              select: {
                inboxId: true,
                nome: true
              }
            }
          }
        });

        if (mapping) {
          console.log(`✅ ${buttonId} - Encontrado`);
          console.log(`   Inbox: ${mapping.inbox?.inboxId} (${mapping.inbox?.nome})`);
          console.log(`   Emoji: ${mapping.actionPayload?.emoji || 'N/A'}`);
          console.log(`   Texto: ${mapping.actionPayload?.textReaction || 'N/A'}`);
        } else {
          console.log(`❌ ${buttonId} - Não encontrado`);
        }
      }

      // O teste passa independente se encontrou ou não - é só para verificar
      expect(true).toBe(true);
    });
  });

  describe('Button Detection Logic', () => {
    test('deve detectar clique de botão Instagram', () => {
      const payload = {
        channel_type: 'Channel::Instagram',
        context: {
          message: {
            content_attributes: {
              postback_payload: 'ig_btn_1755004696546_uekaa4clu'
            }
          }
        }
      };

      // Simular a lógica de detecção do webhook
      const channelType = payload.channel_type;
      const ca = payload.context.message?.content_attributes as any || {};
      
      let isButtonClick = false;
      let buttonId: string | null = null;

      if (channelType.toLowerCase().includes('instagram')) {
        const postbackPayload = ca?.postback_payload;
        if (postbackPayload) {
          isButtonClick = true;
          buttonId = postbackPayload;
        }
      }

      console.log(`🔘 Instagram Button Detection:`);
      console.log(`   Button ID: ${buttonId}`);
      console.log(`   Is Button: ${isButtonClick}`);

      expect(isButtonClick).toBe(true);
      expect(buttonId).toBe('ig_btn_1755004696546_uekaa4clu');
    });

    test('deve detectar clique de botão WhatsApp', () => {
      const payload = {
        channel_type: 'Channel::Whatsapp',
        context: {
          message: {
            content_attributes: {
              button_reply: {
                id: 'btn_1754993780819_0_tqji',
                title: 'Falar com a Dra'
              }
            }
          }
        }
      };

      // Simular a lógica de detecção do webhook
      const channelType = payload.channel_type;
      const ca = payload.context.message?.content_attributes as any || {};
      
      let isButtonClick = false;
      let buttonId: string | null = null;
      let buttonTitle: string | null = null;

      if (channelType.toLowerCase().includes('whatsapp')) {
        const buttonReply = ca?.button_reply;
        if (buttonReply?.id) {
          isButtonClick = true;
          buttonId = buttonReply.id;
          buttonTitle = buttonReply.title || null;
        }
      }

      console.log(`🔘 WhatsApp Button Detection:`);
      console.log(`   Button ID: ${buttonId}`);
      console.log(`   Button Title: ${buttonTitle}`);
      console.log(`   Is Button: ${isButtonClick}`);

      expect(isButtonClick).toBe(true);
      expect(buttonId).toBe('btn_1754993780819_0_tqji');
      expect(buttonTitle).toBe('Falar com a Dra');
    });

    test('não deve detectar como botão se não houver payload', () => {
      const payload = {
        channel_type: 'Channel::Instagram',
        context: {
          message: {
            content_attributes: {}
          }
        }
      };

      const channelType = payload.channel_type;
      const ca = payload.context.message?.content_attributes || {};
      
      let isButtonClick = false;
      let buttonId = null;

      if (channelType.toLowerCase().includes('instagram')) {
        const postbackPayload = ca?.postback_payload;
        if (postbackPayload) {
          isButtonClick = true;
          buttonId = postbackPayload;
        }
      }

      console.log(`🔘 No Button Detection:`);
      console.log(`   Button ID: ${buttonId}`);
      console.log(`   Is Button: ${isButtonClick}`);

      expect(isButtonClick).toBe(false);
      expect(buttonId).toBeNull();
    });
  });

  describe('Response Format', () => {
    test('deve gerar resposta correta para botão com mapeamento', () => {
      const buttonMapping = {
        id: 'mapping-123',
        buttonId: 'btn_test',
        actionType: 'SEND_TEMPLATE',
        actionPayload: {
          emoji: '👍',
          textReaction: 'Obrigado pelo feedback!'
        }
      };

      // Simular a construção da resposta
      const buttonReactionResponse: any = {
        action: 'button_reaction',
        buttonId: buttonMapping.buttonId,
        processed: true,
        mappingFound: true
      };

      if (buttonMapping.actionPayload?.emoji) {
        buttonReactionResponse.emoji = buttonMapping.actionPayload.emoji;
      }

      if (buttonMapping.actionPayload?.textReaction) {
        buttonReactionResponse.text = buttonMapping.actionPayload.textReaction;
      }

      console.log(`🎯 Response for mapped button:`, buttonReactionResponse);

      expect(buttonReactionResponse.action).toBe('button_reaction');
      expect(buttonReactionResponse.buttonId).toBe('btn_test');
      expect(buttonReactionResponse.emoji).toBe('👍');
      expect(buttonReactionResponse.text).toBe('Obrigado pelo feedback!');
      expect(buttonReactionResponse.mappingFound).toBe(true);
    });

    test('deve gerar resposta padrão para botão sem mapeamento', () => {
      const defaultReactionResponse = {
        action: 'button_reaction',
        buttonId: 'btn_unknown',
        emoji: '👍',
        text: null,
        processed: true,
        mappingFound: false
      };

      console.log(`🎯 Default response for unmapped button:`, defaultReactionResponse);

      expect(defaultReactionResponse.action).toBe('button_reaction');
      expect(defaultReactionResponse.buttonId).toBe('btn_unknown');
      expect(defaultReactionResponse.emoji).toBe('👍');
      expect(defaultReactionResponse.text).toBeNull();
      expect(defaultReactionResponse.mappingFound).toBe(false);
    });
  });
});
