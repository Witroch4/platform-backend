const axios = require('axios');

// Payload base do Chatwoot WhatsApp
const basePayload = {
  "session_id": "558597550136",
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
      "content_type": "text"
    },
    "contact": {
      "id": 1447,
      "name": "Witalo Rocha",
      "phone_number": "+558597550136",
      "account_id": 3
    },
    "conversation": {
      "id": 2133,
      "account_id": 3,
      "inbox_id": 4,
      "status": "pending",
      "contact_id": 1447
    },
    "inbox": {
      "id": 4,
      "account_id": 3,
      "name": "WhatsApp - ANA",
      "channel_type": "Channel::Whatsapp"
    },
    "account_id": 3,
    "contact_name": "Witalo Rocha",
    "contact_phone": "+558597550136",
    "socialwise_active": true,
    "is_whatsapp_channel": true
  }
};

async function testMemorySocialWiseFlow() {
  console.log('🚀 Testando memória no SocialWise Flow com payload real...\n');
  
  try {
    // 1️⃣ PRIMEIRA INTERAÇÃO - Estabelecer nome
    console.log('1️⃣ PRIMEIRA INTERAÇÃO:');
    const firstPayload = {
      ...basePayload,
      message: "Meu nome é Witalo"
    };
    firstPayload.context.message.content = "Meu nome é Witalo";
    firstPayload.context.message.id = 36024;

    const firstResponse = await axios.post(
      'http://localhost:3002/api/integrations/webhooks/socialwiseflow',
      firstPayload,
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 30000
      }
    );

    console.log('✅ Primeira resposta:', firstResponse.data.message);
    console.log('📊 Status:', firstResponse.status);
    console.log('');

    // Aguardar um pouco para o sistema processar
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 2️⃣ SEGUNDA INTERAÇÃO - Testar memória
    console.log('2️⃣ SEGUNDA INTERAÇÃO (testando memória):');
    const secondPayload = {
      ...basePayload,
      message: "Qual é o meu nome?"
    };
    secondPayload.context.message.content = "Qual é o meu nome?";
    secondPayload.context.message.id = 36025;

    const secondResponse = await axios.post(
      'http://localhost:3002/api/integrations/webhooks/socialwiseflow',
      secondPayload,
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 30000
      }
    );

    console.log('✅ Segunda resposta:', secondResponse.data.message);
    console.log('📊 Status:', secondResponse.status);

    // 🧠 ANÁLISE DE MEMÓRIA
    console.log('\n🧠 ANÁLISE DE MEMÓRIA:');
    const remembersName = secondResponse.data.message.toLowerCase().includes('witalo');
    
    if (remembersName) {
      console.log('✅ SUCESSO: O sistema lembrou do nome!');
      console.log('🎉 A memória está funcionando corretamente!');
    } else {
      console.log('❌ FALHA: O sistema NÃO lembrou do nome');
      console.log('🔧 A memória ainda precisa ser corrigida');
    }

  } catch (error) {
    console.error('❌ Erro no teste:', error.response?.status, error.response?.statusText);
    if (error.response?.data) {
      console.error('📄 Detalhes:', error.response.data);
    }
    if (error.code === 'ECONNREFUSED') {
      console.error('🔌 Erro de conexão - verifique se o Docker está rodando na porta 3002');
    }
  }
}

testMemorySocialWiseFlow();
