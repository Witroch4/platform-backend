// Teste simples para verificar se as APIs estão funcionando
const testAPIs = async () => {
  console.log('🔍 Testando APIs corrigidas...\n');

  try {
    // Teste 1: API de leads consolidada (modo marketing)
    console.log('1. Testando API de leads (modo marketing)...');
    const leadsResponse = await fetch('http://localhost:3000/api/admin/leads-chatwit/leads?marketing=true&page=1&limit=10');
    console.log(`   Status: ${leadsResponse.status}`);
    
    if (leadsResponse.ok) {
      const leadsData = await leadsResponse.json();
      console.log(`   ✅ Sucesso! Encontrados ${leadsData.leads?.length || 0} leads`);
    } else {
      const error = await leadsResponse.text();
      console.log(`   ❌ Erro: ${error}`);
    }

    // Teste 2: API de disparo (GET)
    console.log('\n2. Testando API de disparo (GET)...');
    const disparoResponse = await fetch('http://localhost:3000/api/admin/mtf-diamante/disparo?page=1&limit=10');
    console.log(`   Status: ${disparoResponse.status}`);
    
    if (disparoResponse.ok) {
      const disparoData = await disparoResponse.json();
      console.log(`   ✅ Sucesso! Encontrados ${disparoData.data?.disparos?.length || 0} disparos`);
    } else {
      const error = await disparoResponse.text();
      console.log(`   ❌ Erro: ${error}`);
    }

  } catch (error) {
    console.error('❌ Erro durante os testes:', error.message);
  }
};

// Executar apenas se chamado diretamente
if (require.main === module) {
  testAPIs();
}

module.exports = { testAPIs };