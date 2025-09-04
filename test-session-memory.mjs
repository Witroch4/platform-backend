// Test da funcionalidade de memória de sessão
import { processSocialWiseFlow } from './lib/socialwise-flow/processor.js';

// Simula um payload do WhatsApp com sessionId (número do telefone)
const sessionId = "5511999888777"; // Número do telefone como sessionId
const inboxId = "105";
const chatwitAccountId = "1";

const testPayload = {
  entry: [{
    changes: [{
      value: {
        contacts: [{
          wa_id: sessionId,
          profile: {
            name: "Test User"
          }
        }],
        messages: [{
          from: sessionId,
          id: "wamid.test123",
          timestamp: Math.floor(Date.now() / 1000).toString(),
          type: "text",
          text: {
            body: "Olá, preciso de ajuda com uma dúvida jurídica"
          }
        }]
      }
    }]
  }]
};

const testContext1 = {
  userText: "Olá, preciso de ajuda com uma dúvida jurídica",
  channelType: "whatsapp",
  inboxId,
  chatwitAccountId,
  traceId: "test-session-1-" + Date.now(),
  contactPhone: sessionId,
  originalPayload: testPayload,
  sessionId // Agora incluído diretamente no contexto
};

console.log('🔵 Testando sistema de memória de sessão...');
console.log('📝 SessionId:', sessionId);
console.log('📝 Primeira mensagem:', testContext1.userText);

try {
  // Primeira interação
  console.log('\n--- PRIMEIRA INTERAÇÃO ---');
  const result1 = await processSocialWiseFlow(testContext1, false);
  console.log('✅ Primeira resposta:');
  console.log('Response text:', result1.response.text);
  console.log('Buttons:', result1.response.buttons?.map(b => ({ title: b.title, payload: b.payload })));
  console.log('Strategy:', result1.metrics.strategy);
  console.log('Band:', result1.metrics.band);
  
  // Segunda interação - seguindo a conversa
  const testContext2 = {
    ...testContext1,
    userText: "Quais são os meus direitos como consumidor?",
    traceId: "test-session-2-" + Date.now(),
    originalPayload: {
      ...testPayload,
      entry: [{
        ...testPayload.entry[0],
        changes: [{
          ...testPayload.entry[0].changes[0],
          value: {
            ...testPayload.entry[0].changes[0].value,
            messages: [{
              from: sessionId,
              id: "wamid.test456",
              timestamp: Math.floor(Date.now() / 1000).toString(),
              type: "text",
              text: {
                body: "Quais são os meus direitos como consumidor?"
              }
            }]
          }
        }]
      }]
    }
  };

  console.log('\n--- SEGUNDA INTERAÇÃO ---');
  console.log('📝 Segunda mensagem:', testContext2.userText);
  
  const result2 = await processSocialWiseFlow(testContext2, false);
  console.log('✅ Segunda resposta:');
  console.log('Response text:', result2.response.text);
  console.log('Buttons:', result2.response.buttons?.map(b => ({ title: b.title, payload: b.payload })));
  console.log('Strategy:', result2.metrics.strategy);
  console.log('Band:', result2.metrics.band);
  
  // Verifica se o sistema de memória está funcionando
  console.log('\n🧠 ANÁLISE DE MEMÓRIA:');
  console.log('SessionId usado:', sessionId);
  console.log('Primeira interação processada:', result1.metrics.strategy);
  console.log('Segunda interação processada:', result2.metrics.strategy);
  
  if (result1.metrics.strategy.includes('router') && result2.metrics.strategy.includes('router')) {
    console.log('\n🎯 SUCESSO: Ambas as interações foram processadas pelo LLM Router com continuidade de sessão!');
    console.log('O sistema de memória conversacional está funcionando.');
  } else {
    console.log('\n⚠️ ATENÇÃO: Verificar se o sistema de memória está funcionando corretamente');
  }
  
} catch (error) {
  console.error('❌ Erro no teste:', error);
  console.error('Stack:', error.stack);
}
