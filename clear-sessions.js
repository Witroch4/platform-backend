const Redis = require('ioredis');

async function clearSessions() {
  const redis = new Redis({
    host: 'localhost',
    port: 6379,
    maxRetriesPerRequest: 3,
    retryDelayOnFailover: 100,
    retryDelayOnClusterDown: 300,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    lazyConnect: true,
  });

  try {
    console.log('🧹 Limpando todas as sessões do Redis...');
    
    // Buscar todas as chaves de sessão
    const sessionKeys = await redis.keys('session:*');
    console.log(`Encontradas ${sessionKeys.length} chaves de sessão`);
    
    if (sessionKeys.length > 0) {
      // Deletar todas as chaves de sessão
      await redis.del(...sessionKeys);
      console.log(`✅ ${sessionKeys.length} sessões removidas`);
    } else {
      console.log('📝 Nenhuma sessão encontrada para remover');
    }
    
    // Listar chaves restantes para verificar
    const remainingKeys = await redis.keys('session:*');
    console.log(`📊 Sessões restantes após limpeza: ${remainingKeys.length}`);
    
  } catch (error) {
    console.error('❌ Erro ao limpar sessões:', error);
  } finally {
    await redis.disconnect();
  }
}

clearSessions();
