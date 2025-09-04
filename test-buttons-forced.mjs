// Teste: Verificar se Router LLM agora força geração de botões
const payload = {
  session_id: "test-session-buttons",
  context: {
    "socialwise-chatwit": {
      chatwit_account_id: "3",
      inbox_id: "4"
    }
  },
  channel_type: "Channel::Whatsapp",
  message: "qual seu nome?"
};

fetch('http://localhost:3002/api/integrations/webhooks/socialwiseflow', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload)
})
.then(response => response.json())
.then(result => {
  console.log('🎯 Resposta após correção:');
  console.log(JSON.stringify(result, null, 2));
  
  // Verificar se agora tem botões
  if (result.whatsapp?.type === 'interactive') {
    console.log('✅ SUCCESS: Agora está usando botões!');
    console.log('🔘 Botões encontrados:', result.whatsapp.interactive.action.buttons.length);
  } else if (result.whatsapp?.type === 'text') {
    console.log('❌ AINDA COM PROBLEMA: Continua usando texto simples');
  }
})
.catch(error => {
  console.error('❌ Erro no teste:', error);
});
