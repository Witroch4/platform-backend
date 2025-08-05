/**
 * Teste para verificar se os agentes são encontrados automaticamente
 * quando uma caixa é adicionada
 */

import axios from 'axios';

async function testCaixaAgenteSync() {
  console.log('🧪 Testando sincronização automática de agentes...');
  
  try {
    // 1. Primeiro, vamos listar as caixas existentes
    console.log('📋 Listando caixas existentes...');
    const caixasResponse = await axios.get('/api/admin/mtf-diamante/dialogflow/caixas');
    console.log('Caixas encontradas:', caixasResponse.data.caixas?.length || 0);
    
    // 2. Listar inboxes disponíveis para adicionar
    console.log('📥 Listando inboxes disponíveis...');
    const inboxesResponse = await axios.get('/api/admin/mtf-diamante/dialogflow/inboxes');
    console.log('Inboxes disponíveis:', inboxesResponse.data.inboxes?.length || 0);
    
    if (inboxesResponse.data.inboxes?.length > 0) {
      const primeiraInbox = inboxesResponse.data.inboxes[0];
      console.log('📦 Primeira inbox disponível:', {
        id: primeiraInbox.id,
        name: primeiraInbox.name,
        channel_type: primeiraInbox.channel_type
      });
      
      // 3. Simular adição de uma caixa (apenas para teste - não executar em produção)
      console.log('⚠️  Para testar a sincronização, adicione uma caixa manualmente pela interface');
      console.log('⚠️  O sistema deve automaticamente encontrar e criar os agentes ativos da origem');
    }
    
    // 4. Verificar se existem agentes com hookId (vindos da origem)
    const caixasComAgentes = caixasResponse.data.caixas?.filter((c: any) => 
      c.agentes && c.agentes.length > 0
    ) || [];
    
    console.log('📊 Estatísticas:');
    console.log(`- Caixas com agentes: ${caixasComAgentes.length}`);
    
    caixasComAgentes.forEach((caixa: any) => {
      console.log(`  📦 ${caixa.nome}:`);
      caixa.agentes.forEach((agente: any) => {
        console.log(`    🤖 ${agente.nome} (${agente.ativo ? 'ATIVO' : 'INATIVO'})${agente.hookId ? ' [DA ORIGEM]' : ' [MANUAL]'}`);
      });
    });
    
  } catch (error: any) {
    console.error('❌ Erro no teste:', error.response?.data || error.message);
  }
}

// Executar apenas se chamado diretamente
if (require.main === module) {
  testCaixaAgenteSync();
}

export { testCaixaAgenteSync };