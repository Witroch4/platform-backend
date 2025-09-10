/**
 * Teste da nova estrutura Instagram/Facebook Page
 * Deve gerar exatamente o formato que o Chatwit espera
 */

const { buildInstagramButtons } = require('./lib/socialwise/instagram-formatter');

// Simular formatação de resposta
const text = "Olá! Meu nome é Ana e sou assistente especialista do escritório da Dra. Amanda Sousa.";
const buttons = [
  { title: "Previdenciário", payload: "@previdencario" },
  { title: "Atendimento", payload: "@falar_atendente" }
];

console.log('🧪 TESTANDO NOVA ESTRUTURA INSTAGRAM/FACEBOOK PAGE');
console.log('');

try {
  const result = buildInstagramButtons(text, buttons);
  
  console.log('✅ RESULTADO GERADO:');
  console.log(JSON.stringify(result, null, 2));
  
  console.log('');
  console.log('🎯 ESTRUTURA ESPERADA PELO CHATWIT:');
  console.log('✅ message_format:', result.message_format === 'BUTTON_TEMPLATE' ? '✅' : '❌');
  console.log('✅ template_type:', result.template_type === 'button' ? '✅' : '❌');
  console.log('✅ text:', result.text ? '✅' : '❌');
  console.log('✅ buttons:', Array.isArray(result.buttons) ? '✅' : '❌');
  console.log('✅ buttons count:', result.buttons?.length || 0);
  
  // Verificar se NÃO tem a estrutura antiga
  console.log('');
  console.log('🚫 ESTRUTURA ANTIGA (NÃO DEVE EXISTIR):');
  console.log('❌ message.attachment:', result.message?.attachment ? '❌ EXISTE!' : '✅ Não existe');
  
} catch (error) {
  console.error('❌ ERRO:', error.message);
}
