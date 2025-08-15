#!/usr/bin/env tsx

/**
 * Script para desabilitar temporariamente a idempotência em ambiente de teste
 * Útil para desenvolvimento e testes onde queremos processar mensagens duplicadas
 */

import { getRedisInstance } from '@/lib/connections';

async function disableIdempotencyForTesting() {
  try {
    console.log('🔄 Conectando ao Redis...');
    const redis = getRedisInstance();
    
    // Chave para controlar se a idempotência está desabilitada
    const disableKey = 'test:disable_idempotency';
    const ttl = 3600; // 1 hora
    
    // Verificar se já está desabilitada
    const isDisabled = await redis.get(disableKey);
    
    if (isDisabled) {
      console.log('⚠️  Idempotência já está desabilitada para testes');
      console.log(`⏰ Expira em: ${Math.floor(ttl / 60)} minutos`);
    } else {
      // Desabilitar idempotência
      await redis.setex(disableKey, ttl, 'true');
      console.log('✅ Idempotência desabilitada para testes');
      console.log(`⏰ Válido por: ${Math.floor(ttl / 60)} minutos`);
    }
    
    // Mostrar status atual
    console.log('\n📊 Status da Idempotência:');
    console.log(`🔴 Desabilitada: ${isDisabled ? 'SIM' : 'NÃO'}`);
    console.log(`⏰ TTL restante: ${isDisabled ? await redis.ttl(disableKey) : ttl} segundos`);
    
    console.log('\n💡 Para reabilitar a idempotência, execute:');
    console.log('   npx tsx scripts/enable-idempotency.ts');
    
  } catch (error) {
    console.error('❌ Erro ao desabilitar idempotência:', error);
    process.exit(1);
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  disableIdempotencyForTesting()
    .then(() => {
      console.log('✅ Script concluído com sucesso');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Script falhou:', error);
      process.exit(1);
    });
}

export { disableIdempotencyForTesting };
