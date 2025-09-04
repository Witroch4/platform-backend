/**
 * End-to-End Test: Router LLM Strategy
 * Teste específico para verificar se a LLM do Router está sendo chamada
 * quando a classificação por embedding resulta em banda ROUTER
 */

const axios = require('axios');

// Configuração do teste
const WEBHOOK_URL = 'http://localhost:3002/api/integrations/webhooks/socialwiseflow';
const TEST_TOKEN = process.env.SOCIALWISEFLOW_ACCESS_TOKEN || 'test-token';

// Payload de teste que deve resultar em banda ROUTER (score baixo)
const TEST_PAYLOAD = {
  session_id: "test-router-llm-session",
  message: "Qual seu nome?", // Mensagem que não deve ter match com embeddings
  channel_type: "Channel::Whatsapp",
  context: {
    "socialwise-chatwit": {
      account_data: {
        id: "1"
      },
      inbox_data: {
        id: "4",
        channel_type: "Channel::Whatsapp"
      },
      contact_data: {
        name: "Test User Router",
        phone_number: "+5511999999999"
      },
      message_data: {
        id: "test-router-message-123"
      },
      wamid: "test-router-wamid-123"
    }
  }
};

// Função para fazer a requisição
async function testRouterLLM() {
  console.log('🚀 Iniciando teste Router LLM...');
  console.log(`📡 URL: ${WEBHOOK_URL}`);
  console.log(`🔑 Token: ${TEST_TOKEN ? 'Configurado' : 'NÃO CONFIGURADO'}`);
  console.log(`📝 Mensagem: "${TEST_PAYLOAD.message}"`);
  console.log('');

  try {
    const startTime = Date.now();
    
    const response = await axios.post(WEBHOOK_URL, TEST_PAYLOAD, {
      headers: {
        'Content-Type': 'application/json',
        ...(TEST_TOKEN ? { 'Authorization': `Bearer ${TEST_TOKEN}` } : {}),
      },
      timeout: 30000, // 30 segundos timeout
    });

    const endTime = Date.now();
    const responseTime = endTime - startTime;

    console.log('✅ RESPOSTA RECEBIDA');
    console.log(`⏱️  Tempo de resposta: ${responseTime}ms`);
    console.log(`📊 Status: ${response.status}`);
    console.log('');

    // Analisar a resposta
    const data = response.data;
    
    console.log('🔍 ANÁLISE DA RESPOSTA:');
    console.log('📋 Estrutura da resposta:');
    console.log(JSON.stringify(data, null, 2));
    console.log('');

    // Verificar se é uma resposta de WhatsApp
    if (data.whatsapp) {
      console.log('📱 RESPOSTA WHATSAPP DETECTADA:');
      
      if (data.whatsapp.type === 'interactive') {
        const interactive = data.whatsapp.interactive;
        console.log(`💬 Tipo: ${interactive.type}`);
        console.log(`📝 Texto: "${interactive.body?.text}"`);
        
        if (interactive.action?.buttons) {
          console.log(`🎯 Botões encontrados: ${interactive.action.buttons.length}`);
          interactive.action.buttons.forEach((btn, idx) => {
            console.log(`  ${idx + 1}. "${btn.reply?.title}" (ID: ${btn.reply?.id})`);
          });
        }
      } else if (data.whatsapp.type === 'text') {
        console.log(`📝 Texto simples: "${data.whatsapp.text?.body}"`);
      }
    } else if (data.text) {
      console.log(`📝 Resposta de texto: "${data.text}"`);
    } else if (data.action) {
      console.log(`🔄 Ação: ${data.action}`);
    } else {
      console.log('❓ Formato de resposta não reconhecido');
    }

    console.log('');
    console.log('🎯 ANÁLISE TÉCNICA:');
    
    // Verificar se passou pela degradação graciosa
    const isDegradedResponse = (
      data.whatsapp?.interactive?.body?.text === "Como posso ajudar você hoje?" &&
      data.whatsapp?.interactive?.action?.buttons?.some(btn => 
        btn.reply?.id === '@consulta_juridica' || 
        btn.reply?.id === '@documentos' ||
        btn.reply?.id === '@handoff_human'
      )
    );

    if (isDegradedResponse) {
      console.log('⚠️  RESPOSTA DEGRADADA DETECTADA!');
      console.log('   Parece que a LLM não foi chamada e foi usado o fallback.');
      console.log('   Isso indica que o problema ainda persiste.');
    } else {
      console.log('✅ Resposta parece ser gerada pela LLM');
      console.log('   A resposta não corresponde ao padrão de degradação graciosa.');
    }

    // Verificar características de resposta da LLM vs fallback
    const bodyText = data.whatsapp?.interactive?.body?.text || data.text || '';
    const buttons = data.whatsapp?.interactive?.action?.buttons || [];
    
    console.log('');
    console.log('📊 CARACTERÍSTICAS DA RESPOSTA:');
    console.log(`📝 Texto do corpo: "${bodyText}"`);
    console.log(`🎯 Número de botões: ${buttons.length}`);
    
    if (buttons.length > 0) {
      console.log('🔍 Análise dos botões:');
      buttons.forEach((btn, idx) => {
        const id = btn.reply?.id || '';
        const title = btn.reply?.title || '';
        console.log(`  ${idx + 1}. ID: "${id}" | Título: "${title}"`);
        
        // Verificar se são IDs padrão de fallback
        const isFallbackId = ['@consulta_juridica', '@documentos', '@handoff_human'].includes(id);
        const isFallbackTitle = ['Consulta jurídica', 'Documentos', 'Falar com atendente'].includes(title);
        
        if (isFallbackId && isFallbackTitle) {
          console.log(`     ⚠️  Este é um botão de fallback padrão`);
        } else {
          console.log(`     ✅ Este parece ser um botão gerado pela LLM`);
        }
      });
    }

    console.log('');
    console.log('🎯 CONCLUSÃO:');
    if (isDegradedResponse) {
      console.log('❌ TESTE FALHOU: A LLM Router não está sendo chamada');
      console.log('   A resposta indica que o sistema ainda está usando degradação graciosa');
      console.log('   em vez de passar pela estratégia router_llm.');
    } else {
      console.log('✅ TESTE PASSOU: A LLM Router parece estar funcionando');
      console.log('   A resposta não corresponde ao padrão de degradação graciosa.');
    }

    return {
      success: true,
      responseTime,
      isDegraded: isDegradedResponse,
      response: data
    };

  } catch (error) {
    console.log('❌ ERRO NO TESTE:');
    
    if (error.code === 'ECONNREFUSED') {
      console.log('🔌 Erro de conexão: Servidor não está respondendo');
      console.log(`   Verifique se o container está rodando na porta 3002`);
    } else if (error.response) {
      console.log(`📊 Status HTTP: ${error.response.status}`);
      console.log(`📝 Resposta: ${JSON.stringify(error.response.data, null, 2)}`);
    } else {
      console.log(`💥 Erro: ${error.message}`);
    }

    return {
      success: false,
      error: error.message,
      isDegraded: null
    };
  }
}

// Executar o teste
async function main() {
  console.log('🧪 TESTE END-TO-END: Router LLM Strategy');
  console.log('=' .repeat(50));
  console.log('');
  
  const result = await testRouterLLM();
  
  console.log('');
  console.log('📋 RESULTADO FINAL:');
  console.log(`✅ Sucesso: ${result.success}`);
  if (result.responseTime) {
    console.log(`⏱️  Tempo: ${result.responseTime}ms`);
  }
  if (result.isDegraded !== null) {
    console.log(`⚠️  Degradado: ${result.isDegraded}`);
  }
  if (result.error) {
    console.log(`❌ Erro: ${result.error}`);
  }
  
  console.log('');
  console.log('=' .repeat(50));
  
  // Exit code baseado no resultado
  if (!result.success) {
    process.exit(1);
  } else if (result.isDegraded) {
    console.log('⚠️  Teste completou mas detectou resposta degradada');
    process.exit(2);
  } else {
    console.log('🎉 Teste completou com sucesso!');
    process.exit(0);
  }
}

// Verificar se está sendo executado diretamente
if (require.main === module) {
  main().catch(error => {
    console.error('💥 Erro fatal no teste:', error);
    process.exit(1);
  });
}

module.exports = { testRouterLLM };
