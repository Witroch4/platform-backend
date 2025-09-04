// Teste de memória do SocialWise Flow após implementação do padrão bíblia

const testPayload = {
  "session_id": "558597550136",
  "message": {
    "timestamp": Date.now(),
    "text": "Oi, meu nome é Carlos. Qual o seu nome?",
    "sender": {
      "id": "558597550136",
      "name": "Carlos"
    }
  },
  "contact": {
    "phone": "558597550136",
    "name": "Carlos"
  },
  "channel": "whatsapp"
};

const testPayload2 = {
  "session_id": "558597550136",
  "message": {
    "timestamp": Date.now(),
    "text": "Você lembra do meu nome?",
    "sender": {
      "id": "558597550136",
      "name": "Carlos"
    }
  },
  "contact": {
    "phone": "558597550136",
    "name": "Carlos"
  },
  "channel": "whatsapp"
};

async function testMemory() {
  console.log("🧪 Teste 1: Primeira interação - apresentação");
  
  const response1 = await fetch("http://localhost:3000/api/integrations/webhooks/socialwiseflow", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(testPayload)
  });
  
  const result1 = await response1.json();
  console.log("Resposta 1:", result1.response);
  
  // Aguardar 2 segundos para simular conversa real
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  console.log("\n🧪 Teste 2: Segunda interação - teste de memória");
  
  const response2 = await fetch("http://localhost:3000/api/integrations/webhooks/socialwiseflow", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(testPayload2)
  });
  
  const result2 = await response2.json();
  console.log("Resposta 2:", result2.response);
  
  // Verificar se a resposta menciona o nome Carlos
  if (result2.response && result2.response.toLowerCase().includes("carlos")) {
    console.log("\n✅ SUCESSO: A memória está funcionando! O assistente lembrou do nome Carlos.");
  } else {
    console.log("\n❌ FALHA: A memória não está funcionando. O assistente não lembrou do nome.");
  }
}

testMemory().catch(console.error);
