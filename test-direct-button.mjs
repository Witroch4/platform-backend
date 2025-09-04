// Test simples da função processButtonReaction diretamente
import { processSocialWiseFlow } from './lib/socialwise-flow/processor.js';

const testContext = {
  userText: "teste inicial", // Será sobrescrito se for botão não mapeado
  channelType: "whatsapp",
  inboxId: "105",
  chatwitAccountId: "1",
  traceId: "test-" + Date.now(),
  originalPayload: {
    context: {
      message: {
        content_attributes: {
          button_reply: {
            id: "@duvidas_gerais" // Botão não mapeado
          }
        },
        source_id: "test-source-" + Date.now()
      }
    },
    button_id: "@duvidas_gerais",
    interaction_type: "button_reply"
  }
};

console.log('🔵 Testando processamento direto do botão não mapeado...');
console.log('📝 Context:', JSON.stringify(testContext, null, 2));

try {
  const result = await processSocialWiseFlow(testContext, false); // embedipreview=false para Router LLM
  console.log('\n✅ Resultado do processamento:');
  console.log(JSON.stringify(result, null, 2));
  
  // Verifica se processou com LLM
  if (result.metrics.strategy.includes('router') || result.metrics.strategy.includes('llm')) {
    console.log('\n🎯 SUCESSO: Botão não mapeado foi processado pela LLM Router!');
  } else {
    console.log('\n⚠️ ATENÇÃO: Resultado não esperado para botão não mapeado');
    console.log('Strategy:', result.metrics.strategy);
  }
  
} catch (error) {
  console.error('❌ Erro no teste:', error.message);
  console.error('Stack:', error.stack);
}
