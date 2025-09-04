const fetch = require('node-fetch');

/**
 * Teste de memória com payload real do Chatwoot WhatsApp
 * Baseado no payload fornecido pelo usuário
 */

// 1. Primeira interação - apresentação
const payload1 = {
  "session_id": "558597550136",
  "message": "Oi, meu nome é Witalo",
  "channel_type": "Channel::Whatsapp", 
  "language": "pt_BR",
  "context": {
    "message": {
      "id": "36023",
      "content": "Oi, meu nome é Witalo",
      "account_id": "3",
      "inbox_id": "4", 
      "conversation_id": "2133",
      "message_type": "incoming",
      "created_at": "2025-08-13T22:44:06.875Z",
      "updated_at": "2025-08-13T22:44:06.875Z",
      "source_id": "wamid.HBgMNTU4NTk3NTUwMTM2FQIAEhgUM0FCNDNFNUMzMTJGQjc5RjcyOEQA",
      "content_type": "text",
      "sender_type": "Contact",
      "sender_id": "1447"
    },
    "conversation": {
      "id": "2133",
      "account_id": "3",
      "inbox_id": "4",
      "status": "pending",
      "created_at": "2025-08-12T17:53:23.278Z",
      "updated_at": "2025-08-13T22:44:06.877Z",
      "contact_id": "1447"
    },
    "contact": {
      "id": "1447",
      "name": "Witalo Rocha",
      "account_id": "3",
      "created_at": "2025-07-06T14:35:28.590Z", 
      "updated_at": "2025-08-13T22:44:06.926Z"
    },
    "inbox": {
      "id": "4",
      "account_id": "3",
      "name": "WhatsApp - ANA",
      "created_at": "2024-06-09T00:52:47.311Z",
      "updated_at": "2025-08-13T21:50:09.580Z",
      "channel_type": "Channel::Whatsapp"
    },
    // Dados extras do Chatwoot (mantidos para compatibilidade)
    "socialwise-chatwit": {
      "contact_data": {
        "id": 1447,
        "name": "Witalo Rocha",
        "phone_number": "+558597550136"
      },
      "account_data": {
        "id": 3,
        "name": "DraAmandaSousa"
      }
    }
  }
};

// 2. Segunda interação - pergunta sobre o nome
const payload2 = {
  "session_id": "558597550136",
  "message": "Qual é o meu nome?",
  "channel_type": "Channel::Whatsapp",
  "language": "pt_BR", 
  "context": {
    "message": {
      "id": "36025", // ID diferente
      "content": "Qual é o meu nome?",
      "account_id": "3",
      "inbox_id": "4",
      "conversation_id": "2133", 
      "message_type": "incoming",
      "created_at": "2025-08-13T22:46:00.000Z", // Timestamp diferente
      "updated_at": "2025-08-13T22:46:00.000Z", // Timestamp diferente
      "source_id": "wamid.HBgMNTU4NTk3NTUwMTM2FQIAEhgUM0FCNDNFNUMzMTJGQjc5RjcyOEQC", // wamid diferente
      "content_type": "text",
      "sender_type": "Contact",
      "sender_id": "1447"
    },
    "conversation": {
      "id": "2133", 
      "account_id": "3",
      "inbox_id": "4",
      "status": "pending",
      "created_at": "2025-08-12T17:53:23.278Z",
      "updated_at": "2025-08-13T22:46:00.000Z",
      "contact_id": "1447"
    },
    "contact": {
      "id": "1447",
      "name": "Witalo Rocha", 
      "account_id": "3",
      "created_at": "2025-07-06T14:35:28.590Z",
      "updated_at": "2025-08-13T22:45:00.000Z"
    },
    "inbox": {
      "id": "4",
      "account_id": "3", 
      "name": "WhatsApp - ANA",
      "created_at": "2024-06-09T00:52:47.311Z",
      "updated_at": "2025-08-13T21:50:09.580Z",
      "channel_type": "Channel::Whatsapp"
    },
    "socialwise-chatwit": {
      "contact_data": {
        "id": 1447,
        "name": "Witalo Rocha",
        "phone_number": "+558597550136"
      },
      "account_data": {
        "id": 3,
        "name": "DraAmandaSousa"
      }
    }
  }
};

async function testMemoryWithRealPayload() {
  console.log('🚀 Testando memória com payload real do Chatwoot...\n');

  try {
    // 1ª interação - apresentação
    console.log('1️⃣ PRIMEIRA INTERAÇÃO - Apresentação:');
    const response1 = await fetch('http://localhost:3002/api/integrations/webhooks/socialwiseflow', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-token'
      },
      body: JSON.stringify(payload1)
    });

    if (!response1.ok) {
      const errorText = await response1.text();
      console.log(`❌ Erro na primeira chamada: ${response1.status} ${response1.statusText}`);
      console.log(`Detalhes: ${errorText}`);
      return;
    }

    const result1 = await response1.json();
    
    // Extrair resposta baseada no canal (WhatsApp ou Instagram)
    let responseText1 = '';
    if (result1.whatsapp) {
      if (result1.whatsapp.text) {
        responseText1 = result1.whatsapp.text;
      } else if (result1.whatsapp.interactive && result1.whatsapp.interactive.body) {
        responseText1 = result1.whatsapp.interactive.body.text;
      }
    } else if (result1.instagram) {
      if (result1.instagram.message && result1.instagram.message.text) {
        responseText1 = result1.instagram.message.text;
      }
    } else if (result1.text) {
      responseText1 = result1.text;
    }
    
    console.log(`✅ Resposta: ${responseText1 || 'Sem resposta'}`);
    console.log(`📱 Estrutura:`, JSON.stringify(result1, null, 2));
    
    // Aguardar um pouco
    await new Promise(resolve => setTimeout(resolve, 1000));

    // 2ª interação - pergunta sobre nome
    console.log('\n2️⃣ SEGUNDA INTERAÇÃO - Pergunta sobre nome:');
    const response2 = await fetch('http://localhost:3002/api/integrations/webhooks/socialwiseflow', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-token'
      },
      body: JSON.stringify(payload2)
    });

    if (!response2.ok) {
      const errorText = await response2.text();
      console.log(`❌ Erro na segunda chamada: ${response2.status} ${response2.statusText}`);
      console.log(`Detalhes: ${errorText}`);
      return;
    }

    const result2 = await response2.json();
    
    // Extrair resposta baseada no canal (WhatsApp ou Instagram)
    let responseText2 = '';
    if (result2.whatsapp) {
      if (result2.whatsapp.text) {
        responseText2 = result2.whatsapp.text;
      } else if (result2.whatsapp.interactive && result2.whatsapp.interactive.body) {
        responseText2 = result2.whatsapp.interactive.body.text;
      }
    } else if (result2.instagram) {
      if (result2.instagram.message && result2.instagram.message.text) {
        responseText2 = result2.instagram.message.text;
      }
    } else if (result2.text) {
      responseText2 = result2.text;
    }
    
    console.log(`✅ Resposta: ${responseText2 || 'Sem resposta'}`);
    console.log(`📱 Estrutura:`, JSON.stringify(result2, null, 2));

    // Verificar se lembrou do nome
    const rememberedName = responseText2 && responseText2.toLowerCase().includes('witalo');
    console.log(`\n🧠 RESULTADO DA MEMÓRIA: ${rememberedName ? '✅ LEMBROU DO NOME!' : '❌ NÃO LEMBROU DO NOME'}`);

    if (rememberedName) {
      console.log(`🎉 SUCESSO! A IA lembrou que o nome é "Witalo"`);
    } else {
      console.log(`😢 FALHA: A IA não conseguiu lembrar do nome entre as interações`);
      console.log(`💡 Resposta da IA: "${responseText2}"`);
    }

  } catch (error) {
    console.error('❌ Erro no teste:', error.message);
  }
}

// Executar teste
testMemoryWithRealPayload();
