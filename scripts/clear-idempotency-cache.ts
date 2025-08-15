#!/usr/bin/env tsx

/**
 * Script para limpar cache de idempotência do SocialWise Flow
 * Útil para ambientes de teste onde mensagens duplicadas são detectadas
 */

import { getRedisInstance } from '@/lib/connections';

async function clearIdempotencyCache() {
  try {
    console.log('🔄 Conectando ao Redis...');
    const redis = getRedisInstance();
    
    // Padrões de chaves para limpar
    const patterns = [
      'sw:idem:*',           // SocialWise Flow idempotency
      'out:*',               // Outbound idempotency  
      'idem:*',              // General idempotency
      'msg:order:*',         // Message ordering
      'cost:idem:*',         // Cost idempotency
    ];
    
    let totalCleared = 0;
    
    for (const pattern of patterns) {
      console.log(`🔍 Procurando chaves com padrão: ${pattern}`);
      
      // Buscar todas as chaves que correspondem ao padrão
      const keys = await redis.keys(pattern);
      
      if (keys.length > 0) {
        console.log(`🗑️  Encontradas ${keys.length} chaves para limpar`);
        
        // Deletar as chaves em lotes para evitar timeout
        const batchSize = 100;
        for (let i = 0; i < keys.length; i += batchSize) {
          const batch = keys.slice(i, i + batchSize);
          const deleted = await redis.del(...batch);
          totalCleared += deleted;
          console.log(`✅ Lote ${Math.floor(i/batchSize) + 1}: ${deleted} chaves deletadas`);
        }
      } else {
        console.log(`ℹ️  Nenhuma chave encontrada para: ${pattern}`);
      }
    }
    
    console.log(`\n🎉 Cache de idempotência limpo com sucesso!`);
    console.log(`📊 Total de chaves removidas: ${totalCleared}`);
    
    // Verificar se ainda existem chaves
    const remainingKeys = await redis.keys('*idem*');
    console.log(`📋 Chaves restantes com "idem": ${remainingKeys.length}`);
    
    if (remainingKeys.length > 0) {
      console.log('🔍 Chaves restantes:');
      remainingKeys.slice(0, 10).forEach(key => console.log(`  - ${key}`));
      if (remainingKeys.length > 10) {
        console.log(`  ... e mais ${remainingKeys.length - 10} chaves`);
      }
    }
    
  } catch (error) {
    console.error('❌ Erro ao limpar cache:', error);
    process.exit(1);
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  clearIdempotencyCache()
    .then(() => {
      console.log('✅ Script concluído com sucesso');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Script falhou:', error);
      process.exit(1);
    });
}

export { clearIdempotencyCache };
