import { WhatsAppPayloadBuilder } from './lib/whatsapp/whatsapp-payload-builder';

/**
 * Script para testar se o fix do header Instagram está funcionando
 */
async function testInstagramHeaderFix() {
  // Simular dados de uma mensagem Instagram Quick Replies com header vazio
  const mockInteractiveContent = {
    body: {
      text: "1000 CVARACTERES E ATÉ 13 BOTOES QUICK_REPLY"
    },
    header: {
      type: "text",
      content: "", // Header vazio como salvo pelo sistema
    },
    footer: {
      text: "Dra. Amanda Sousa Advocacia e Consultoria Jurídica™"
    },
    actionReplyButton: {
      buttons: [
        {
          type: "reply",
          reply: {
            id: "btn1",
            title: "Botão 1"
          }
        }
      ]
    }
  };

  console.log('🧪 Testando WhatsApp (deve falhar com header vazio):');
  try {
    const whatsappBuilder = new WhatsAppPayloadBuilder();
    // Não configurar channelType (default é WhatsApp)
    const result = await whatsappBuilder.buildInteractiveMessagePayload(mockInteractiveContent);
    console.log('❌ WhatsApp: Não deveria ter funcionado!', result);
  } catch (error) {
    console.log('✅ WhatsApp: Falhou como esperado:', (error as Error).message);
  }

  console.log('\n🧪 Testando Instagram (deve funcionar com header vazio):');
  try {
    const instagramBuilder = new WhatsAppPayloadBuilder();
    instagramBuilder.setChannelType('Channel::Instagram'); // Configurar como Instagram
    const result = await instagramBuilder.buildInteractiveMessagePayload(mockInteractiveContent);
    console.log('✅ Instagram: Funcionou como esperado!');
    console.log('📋 Payload gerado:', JSON.stringify(result, null, 2));
    
    // Verificar se header foi removido
    if (!result.header) {
      console.log('✅ Header vazio foi corretamente removido do payload');
    } else {
      console.log('❌ Header não deveria estar presente no payload');
    }
  } catch (error) {
    console.log('❌ Instagram: Não deveria ter falhado:', (error as Error).message);
  }

  console.log('\n🧪 Testando Instagram com header preenchido:');
  const mockWithHeader = {
    ...mockInteractiveContent,
    header: {
      type: "text",
      content: "Header válido"
    }
  };
  
  try {
    const instagramBuilder = new WhatsAppPayloadBuilder();
    instagramBuilder.setChannelType('Channel::Instagram');
    const result = await instagramBuilder.buildInteractiveMessagePayload(mockWithHeader);
    console.log('✅ Instagram com header: Funcionou!');
    console.log('📋 Header incluído:', result.header);
  } catch (error) {
    console.log('❌ Instagram com header: Não deveria ter falhado:', (error as Error).message);
  }
}

// Executar o teste
testInstagramHeaderFix().catch(console.error);
