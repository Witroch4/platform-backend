// test-hooklist-api.js
const axios = require('axios');

async function testHookListAPI() {
  try {
    console.log('🧪 Testando API de HookList...');
    
    const response = await axios.get('http://localhost:3000/api/admin/hooklist', {
      timeout: 15000,
      headers: {
        'Content-Type': 'application/json',
      }
    });

    console.log('✅ API funcionando!');
    console.log('📊 Estatísticas:', response.data.stats);
    console.log('🔗 Total de hooks:', response.data.hooks.length);
    
    if (response.data.hooks.length > 0) {
      console.log('📋 Primeiro hook:', {
        appId: response.data.hooks[0].appId,
        appName: response.data.hooks[0].appName,
        hookId: response.data.hooks[0].hookId,
        isDialogflow: response.data.hooks[0].isDialogflow,
        status: response.data.hooks[0].hookStatus
      });
    }

    if (response.data.errors.length > 0) {
      console.log('⚠️ Erros encontrados:', response.data.errors.length);
    }

  } catch (error) {
    console.error('❌ Erro ao testar API:', error.message);
    
    if (error.response) {
      console.error('📄 Resposta do servidor:', error.response.data);
      console.error('🔢 Status:', error.response.status);
    }
  }
}

testHookListAPI();
