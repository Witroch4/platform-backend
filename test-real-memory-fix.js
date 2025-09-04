// 🧪 Teste da memória com payload real do WhatsApp baseado nos logs

const testPayload = {
  session_id: "558597550136",
  message: "meu nome é witalo",
  channel_type: "Channel::Whatsapp",
  language: "pt-BR",
  context: {
    message: {
      id: "test_msg_123",
      content: "meu nome é witalo",
      account_id: 123,
      inbox_id: 456,
      conversation_id: 789,
      message_type: "incoming",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      source_id: "wamid_test_123"
    },
    conversation: {
      id: 789,
      inbox_id: 456,
      account_id: 123,
      status: "open",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    contact: {
      id: 111,
      name: "Witalo",
      phone_number: "+558597550136",
      email: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    inbox: {
      id: 456,
      name: "WhatsApp Inbox",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      channel_type: "Channel::Whatsapp"
    }
  },
  "socialwise-chatwit": {
    wamid: "wamid_test_123",
    contact_data: {
      id: 111,
      name: "Witalo",
      phone_number: "+558597550136",
      email: null
    },
    message_data: {
      id: "test_msg_123",
      content: "meu nome é witalo"
    },
    inbox_data: {
      id: 456,
      name: "WhatsApp Inbox",
      channel_type: "Channel::Whatsapp"
    },
    account_data: {
      id: 123,
      name: "Test Account"
    },
    contact_name: "Witalo",
    contact_phone: "+558597550136"
  }
};

console.log("🔬 Testando extração de sessionId...");
console.log("Payload:", JSON.stringify(testPayload, null, 2));

// Simular a função extractSessionId
function extractSessionId(payload, channelType) {
  console.log("🔍 extractSessionId chamada com:", {
    hasPayload: !!payload,
    channelType,
    payloadKeys: Object.keys(payload || {})
  });

  if (!payload) {
    console.log("❌ Payload vazio");
    return null;
  }

  // WhatsApp: usar session_id direto ou phone number
  if (channelType === "Channel::Whatsapp") {
    if (payload.session_id) {
      console.log("✅ SessionId direto encontrado:", payload.session_id);
      return payload.session_id;
    }

    const phoneNumber = payload.context?.contact?.phone_number;
    if (phoneNumber) {
      console.log("✅ Phone number encontrado:", phoneNumber);
      return phoneNumber.replace('+', '');
    }
  }

  console.log("❌ SessionId não encontrado");
  return null;
}

const sessionId = extractSessionId(testPayload, "Channel::Whatsapp");
console.log("🎯 Resultado final:", sessionId);

// Testar chamada para o SocialWise Flow
async function testSocialWiseFlow() {
  console.log("\n🚀 Testando chamada para SocialWise Flow...");
  
  try {
    const response = await fetch('http://localhost:3002/api/integrations/webhooks/socialwiseflow', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testPayload)
    });

    if (response.ok) {
      const result = await response.json();
      console.log("✅ Resposta do webhook:", result);
    } else {
      console.log("❌ Erro no webhook:", response.status, response.statusText);
    }
  } catch (error) {
    console.log("❌ Erro na chamada:", error.message);
  }
}

// Executar teste
testSocialWiseFlow();
