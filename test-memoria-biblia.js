// 🧪 Teste da memória usando endpoint "bíblia" que funciona

async function testMemoriaBiblia() {
  console.log("🚀 Testando memória com endpoint bíblia...");
  
  // Primeira interação - estabelecer nome
  console.log("\n1️⃣ PRIMEIRA INTERAÇÃO:");
  try {
    const response1 = await fetch('http://localhost:3002/api/openai-source-test-biblia', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userText: "meu nome é witalo",
        sessionId: "558597550136",
        channel: "whatsapp"
      })
    });

    if (response1.ok) {
      const result1 = await response1.json();
      console.log("✅ Resposta 1:", result1);
    } else {
      console.log("❌ Erro na primeira chamada:", response1.status, response1.statusText);
      return;
    }
  } catch (error) {
    console.log("❌ Erro na primeira chamada:", error.message);
    return;
  }

  // Aguardar um pouco para garantir que a sessão foi salva
  console.log("\n⏳ Aguardando 2 segundos...");
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Segunda interação - testar se lembra do nome
  console.log("\n2️⃣ SEGUNDA INTERAÇÃO:");
  try {
    const response2 = await fetch('http://localhost:3002/api/openai-source-test-biblia', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userText: "qual é o meu nome?",
        sessionId: "558597550136",
        channel: "whatsapp"
      })
    });

    if (response2.ok) {
      const result2 = await response2.json();
      console.log("✅ Resposta 2:", result2);
      
      // Verificar se lembrou do nome
      const resposta = result2.response || result2.message || JSON.stringify(result2);
      if (resposta.toLowerCase().includes('witalo')) {
        console.log("\n🎉 SUCESSO! A IA lembrou do nome 'witalo'!");
        console.log("✅ MEMÓRIA FUNCIONANDO PERFEITAMENTE!");
      } else {
        console.log("\n❌ FALHA! A IA não lembrou do nome.");
        console.log("📋 Resposta recebida:", resposta);
      }
    } else {
      console.log("❌ Erro na segunda chamada:", response2.status, response2.statusText);
    }
  } catch (error) {
    console.log("❌ Erro na segunda chamada:", error.message);
  }
}

// Executar teste
testMemoriaBiblia();
