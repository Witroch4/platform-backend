// Teste para verificar se há problema de timing na criação de agentes
// Execute no console do navegador após adicionar uma caixa

console.log('🧪 Testando timing de criação de agentes...');

async function testarTiming() {
  console.log('1️⃣ Buscando caixas imediatamente...');
  
  try {
    const response1 = await fetch('/api/admin/mtf-diamante/dialogflow/caixas');
    const data1 = await response1.json();
    
    console.log('📊 Resultado imediato:', {
      totalCaixas: data1.caixas?.length || 0,
      caixas: data1.caixas?.map(c => ({
        nome: c.nome,
        agentes: c.agentes?.length || 0
      }))
    });
    
    console.log('⏳ Aguardando 2 segundos...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    console.log('2️⃣ Buscando caixas após delay...');
    const response2 = await fetch('/api/admin/mtf-diamante/dialogflow/caixas');
    const data2 = await response2.json();
    
    console.log('📊 Resultado após delay:', {
      totalCaixas: data2.caixas?.length || 0,
      caixas: data2.caixas?.map(c => ({
        nome: c.nome,
        agentes: c.agentes?.length || 0
      }))
    });
    
    console.log('3️⃣ Testando endpoint de debug...');
    const response3 = await fetch('/api/admin/mtf-diamante/dialogflow/debug-agentes');
    const data3 = await response3.json();
    
    console.log('🔍 Debug resultado:', {
      totalCaixas: data3.debug?.totalCaixas || 0,
      totalAgentes: data3.debug?.totalAgentes || 0,
      agentesOrfaos: data3.debug?.agentesOrfaos || 0,
      caixasComAgentes: data3.caixasComAgentes?.map(c => ({
        nome: c.nome,
        agentesCount: c.agentesCount
      }))
    });
    
  } catch (error) {
    console.error('❌ Erro no teste:', error);
  }
}

testarTiming();