// 🧪 Teste direto das funções corrigidas de memória

const { Redis } = require('ioredis');

// Simulação das funções que corrigimos
function simulateStatelessInit(sessionId, previous_response_id) {
  console.log(`\n🔍 TESTE statelessInit - sessionId: ${sessionId}, previous_response_id: ${previous_response_id}`);
  
  // NOSSA CORREÇÃO: usar !previous_response_id (não !hasSessionId)
  const statelessInit = !previous_response_id;
  
  console.log(`✅ statelessInit resultado: ${statelessInit}`);
  console.log(`📋 Lógica: !previous_response_id = !${previous_response_id} = ${statelessInit}`);
  
  if (statelessInit) {
    console.log("🆕 PRIMEIRA INTERAÇÃO: Enviará developer prompts + user message + store:true");
  } else {
    console.log("🔄 INTERAÇÃO SUBSEQUENTE: Enviará apenas user message + previous_response_id + store:true");
  }
  
  return statelessInit;
}

// Testar cenários
console.log("🎯 TESTE DAS CORREÇÕES DE MEMÓRIA");
console.log("================================");

console.log("\n🧪 CENÁRIO 1: Primeira interação (sem previous_response_id)");
simulateStatelessInit("558597550136", undefined);

console.log("\n🧪 CENÁRIO 2: Segunda interação (com previous_response_id)");
simulateStatelessInit("558597550136", "resp_abc123");

console.log("\n🧪 CENÁRIO 3: Terceira interação (com previous_response_id)");
simulateStatelessInit("558597550136", "resp_def456");

// Teste da lógica de memória Redis
async function testRedisMemory() {
  console.log("\n🔄 TESTE REDIS MEMORY PATTERN");
  console.log("=============================");
  
  try {
    const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
    
    const sessionId = "558597550136";
    const sessionKey = `conversation:${sessionId}`;
    
    // Simular primeira interação
    console.log("\n1️⃣ PRIMEIRA INTERAÇÃO:");
    console.log(`🔑 Verificando se existe sessão: ${sessionKey}`);
    
    let existingSession = await redis.get(sessionKey);
    console.log(`📋 Sessão existente: ${existingSession || 'null'}`);
    
    const previous_response_id = existingSession ? JSON.parse(existingSession).previous_response_id : undefined;
    console.log(`🆔 previous_response_id: ${previous_response_id || 'undefined'}`);
    
    const statelessInit1 = simulateStatelessInit(sessionId, previous_response_id);
    
    // Simular salvamento da sessão após OpenAI
    const mockResponseId = "resp_" + Math.random().toString(36).substr(2, 9);
    const sessionData = {
      sessionId,
      previous_response_id: mockResponseId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    
    await redis.setex(sessionKey, 86400, JSON.stringify(sessionData));
    console.log(`💾 Sessão salva com response_id: ${mockResponseId}`);
    
    // Simular segunda interação
    console.log("\n2️⃣ SEGUNDA INTERAÇÃO:");
    console.log(`🔑 Verificando se existe sessão: ${sessionKey}`);
    
    existingSession = await redis.get(sessionKey);
    console.log(`📋 Sessão existente: ${existingSession ? 'SIM' : 'NÃO'}`);
    
    const sessionParsed = existingSession ? JSON.parse(existingSession) : null;
    const previous_response_id2 = sessionParsed?.previous_response_id;
    console.log(`🆔 previous_response_id: ${previous_response_id2 || 'undefined'}`);
    
    const statelessInit2 = simulateStatelessInit(sessionId, previous_response_id2);
    
    // Cleanup
    await redis.del(sessionKey);
    await redis.quit();
    
    console.log("\n🎉 RESULTADO ESPERADO:");
    console.log(`✅ Primeira interação: statelessInit = ${statelessInit1} (deve ser true)`);
    console.log(`✅ Segunda interação: statelessInit = ${statelessInit2} (deve ser false)`);
    
    if (statelessInit1 === true && statelessInit2 === false) {
      console.log("\n🚀 SUCESSO! Lógica de memória está CORRETA!");
    } else {
      console.log("\n❌ FALHA! Lógica de memória está incorreta.");
    }
    
  } catch (error) {
    console.log("❌ Erro no teste Redis:", error.message);
  }
}

// Executar teste Redis
testRedisMemory();
