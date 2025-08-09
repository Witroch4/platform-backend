// Teste para verificar acesso a templates com diferentes escopos
const testTemplateAccess = async () => {
  console.log('🔍 Testando acesso a templates...\n');

  const templateId = '682491667610791'; // ID do template da imagem

  try {
    // Teste 1: Verificar se o template existe
    console.log('1. Verificando se o template existe...');
    const checkResponse = await fetch(`http://localhost:3000/api/admin/mtf-diamante/templates?refresh=false`);
    
    if (checkResponse.ok) {
      const data = await checkResponse.json();
      const template = data.templates?.find(t => t.id === templateId);
      
      if (template) {
        console.log(`   ✅ Template encontrado: ${template.name}`);
        console.log(`   📋 Detalhes: escopo=${template.scope || 'PRIVATE'}, status=${template.status}`);
      } else {
        console.log(`   ❌ Template ${templateId} não encontrado na lista`);
        console.log(`   📋 Templates disponíveis: ${data.templates?.length || 0}`);
      }
    } else {
      console.log(`   ❌ Erro ao buscar templates: ${checkResponse.status}`);
    }

    // Teste 2: Testar API de disparo com dados mínimos
    console.log('\n2. Testando API de disparo...');
    const disparoPayload = {
      templateId: templateId,
      selectedLeads: ['test-lead-id'], // ID de teste
      delayMinutes: 0,
      parameters: {}
    };

    const disparoResponse = await fetch('http://localhost:3000/api/admin/mtf-diamante/disparo', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(disparoPayload)
    });

    console.log(`   Status: ${disparoResponse.status}`);
    
    if (disparoResponse.ok) {
      const result = await disparoResponse.json();
      console.log(`   ✅ Sucesso: ${result.message || 'Disparo processado'}`);
    } else {
      const error = await disparoResponse.text();
      console.log(`   ❌ Erro: ${error}`);
      
      // Tentar extrair informações úteis do erro
      if (error.includes('Template com ID')) {
        console.log('   💡 Dica: Verifique se o template tem o escopo correto ou se o usuário tem permissão');
      }
    }

  } catch (error) {
    console.error('❌ Erro durante os testes:', error.message);
  }
};

// Executar apenas se chamado diretamente
if (require.main === module) {
  testTemplateAccess();
}

module.exports = { testTemplateAccess };