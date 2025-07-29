// Script de debug para verificar se os agentes estão sendo exibidos corretamente
// Execute no console do navegador na página de caixas

console.log('🔍 Debug: Verificando dados das caixas e agentes...');

// Verificar se o contexto está funcionando
const contextData = window.__NEXT_DATA__ || {};
console.log('📊 Next.js Data:', contextData);

// Verificar localStorage para dados em cache
const cacheKeys = Object.keys(localStorage).filter(key => key.includes('mtf') || key.includes('caixa'));
console.log('💾 Cache keys encontradas:', cacheKeys);

// Verificar se há dados no sessionStorage
const sessionKeys = Object.keys(sessionStorage).filter(key => key.includes('mtf') || key.includes('caixa'));
console.log('🗂️ Session keys encontradas:', sessionKeys);

// Simular chamada à API
fetch('/api/admin/mtf-diamante/dialogflow/caixas')
  .then(response => response.json())
  .then(data => {
    console.log('📡 Resposta da API:', data);
    
    if (data.caixas) {
      console.log(`📦 Total de caixas: ${data.caixas.length}`);
      
      data.caixas.forEach((caixa, index) => {
        console.log(`\n📦 Caixa ${index + 1}:`, {
          id: caixa.id,
          nome: caixa.nome,
          inboxId: caixa.inboxId,
          agentesCount: caixa.agentes?.length || 0
        });
        
        if (caixa.agentes && caixa.agentes.length > 0) {
          caixa.agentes.forEach((agente, agenteIndex) => {
            console.log(`  🤖 Agente ${agenteIndex + 1}:`, {
              id: agente.id,
              nome: agente.nome,
              projectId: agente.projectId,
              region: agente.region,
              ativo: agente.ativo,
              hookId: agente.hookId
            });
          });
        } else {
          console.log('  ⚠️ Nenhum agente encontrado para esta caixa');
        }
      });
    } else {
      console.log('❌ Nenhuma caixa encontrada na resposta');
    }
  })
  .catch(error => {
    console.error('❌ Erro ao buscar caixas:', error);
  });

// Verificar se há elementos DOM relacionados
setTimeout(() => {
  const caixaCards = document.querySelectorAll('[class*="card"]');
  console.log(`🎨 Cards encontrados no DOM: ${caixaCards.length}`);
  
  const agenteElements = document.querySelectorAll('[class*="agente"], [class*="bot"]');
  console.log(`🤖 Elementos de agente encontrados: ${agenteElements.length}`);
  
  const switchElements = document.querySelectorAll('button[role="switch"]');
  console.log(`🔘 Switches encontrados: ${switchElements.length}`);
}, 2000);

console.log('✅ Debug script executado. Verifique os logs acima.');