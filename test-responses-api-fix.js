// test-responses-api-fix.js
// Teste para verificar o comportamento correto da OpenAI Responses API com contexto

const OpenAI = require('openai');

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

async function testResponsesAPIMemory() {
  console.log("=== TESTE: OpenAI Responses API com Memória ===\n");

  try {
    // 1) Primeira mensagem: criar sessão inicial
    console.log("1️⃣ Primeira mensagem: 'meu nome é witalo'");
    const session1 = await client.responses.create({
      model: 'gpt-5-nano',
      input: [
        { role: "developer", content: "Você é um assistente. Lembre-se de informações que o usuário compartilhar." },
        { role: "user", content: "meu nome é witalo" }
      ],
      store: true,
      instructions: "Responda de forma amigável e lembre-se do nome do usuário."
    });

    console.log("Resposta 1:", session1.output_text);
    console.log("Session ID 1:", session1.id);
    console.log();

    // 2) Segunda mensagem: usar previous_response_id
    console.log("2️⃣ Segunda mensagem: 'qual meu nome?' (usando previous_response_id)");
    const session2 = await client.responses.create({
      model: 'gpt-5-nano',
      input: [
        { role: "user", content: "qual meu nome?" }
      ],
      previous_response_id: session1.id,
      store: true,
      instructions: "Use as informações da conversa anterior para responder."
    });

    console.log("Resposta 2:", session2.output_text);
    console.log("Session ID 2:", session2.id);
    console.log();

    // 3) Terceira mensagem: continuar a cadeia
    console.log("3️⃣ Terceira mensagem: 'como você me conhece?' (usando previous_response_id)");
    const session3 = await client.responses.create({
      model: 'gpt-5-nano',
      input: [
        { role: "user", content: "como você me conhece?" }
      ],
      previous_response_id: session2.id,
      store: true,
      instructions: "Referência o contexto completo da nossa conversa."
    });

    console.log("Resposta 3:", session3.output_text);
    console.log("Session ID 3:", session3.id);

    // Resultado
    console.log("\n=== RESULTADO ===");
    console.log("✅ Se as respostas 2 e 3 lembrarem do nome 'witalo', a API está funcionando");
    console.log("❌ Se elas não lembrarem, há problema na implementação");

  } catch (error) {
    console.error("Erro:", error.message);
  }
}

testResponsesAPIMemory();
