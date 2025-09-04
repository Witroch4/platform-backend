const Redis = require('ioredis');

async function disableIdempotency() {
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
    console.log('🧪 Desabilitando idempotência para testes...');
    await redis.set('test:disable_idempotency', '1', 'EX', 300); // 5 minutos
    console.log('✅ Idempotência desabilitada por 5 minutos');
  } catch (error) {
    console.error('❌ Erro ao desabilitar idempotência:', error);
  } finally {
    await redis.disconnect();
  }
}

disableIdempotency();
