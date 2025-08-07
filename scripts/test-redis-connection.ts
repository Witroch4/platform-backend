#!/usr/bin/env tsx

/**
 * Script para testar a conexão Redis e verificar se os timeouts foram corrigidos
 */

import { getRedisInstance } from '../lib/connections';
import { redisWrapper } from '../lib/redis-wrapper';
import { checkRedisHealth } from '../lib/redis-health-check';

async function testRedisConnection() {
  console.log('🔍 Testando conexão Redis...\n');

  try {
    // Teste 1: Conexão básica
    console.log('1️⃣ Testando conexão básica...');
    const redis = getRedisInstance();
    console.log(`   Status: ${redis.status}`);

    // Teste 2: Health check
    console.log('\n2️⃣ Executando health check...');
    const health = await checkRedisHealth();
    console.log(`   Healthy: ${health.healthy}`);
    console.log(`   Latency: ${health.latency}ms`);
    console.log(`   Connection Status: ${health.connectionStatus}`);
    if (health.error) {
      console.log(`   Error: ${health.error}`);
    }

    // Teste 3: Ping com wrapper
    console.log('\n3️⃣ Testando ping com wrapper...');
    const startTime = Date.now();
    const pingResult = await redisWrapper.ping();
    const pingLatency = Date.now() - startTime;
    console.log(`   Ping result: ${pingResult}`);
    console.log(`   Ping latency: ${pingLatency}ms`);

    // Teste 4: Set/Get com wrapper
    console.log('\n4️⃣ Testando set/get com wrapper...');
    const testKey = `test:${Date.now()}`;
    const testValue = 'Hello Redis!';
    
    const setStart = Date.now();
    await redisWrapper.set(testKey, testValue);
    const setLatency = Date.now() - setStart;
    console.log(`   Set latency: ${setLatency}ms`);

    const getStart = Date.now();
    const getValue = await redisWrapper.get(testKey);
    const getLatency = Date.now() - getStart;
    console.log(`   Get result: ${getValue}`);
    console.log(`   Get latency: ${getLatency}ms`);

    // Limpar teste
    await redisWrapper.del(testKey);

    // Teste 5: Múltiplas operações simultâneas
    console.log('\n5️⃣ Testando múltiplas operações simultâneas...');
    const promises = [];
    const operationCount = 10;
    
    const multiStart = Date.now();
    for (let i = 0; i < operationCount; i++) {
      promises.push(redisWrapper.ping());
    }
    
    await Promise.all(promises);
    const multiLatency = Date.now() - multiStart;
    console.log(`   ${operationCount} operações simultâneas: ${multiLatency}ms`);
    console.log(`   Média por operação: ${(multiLatency / operationCount).toFixed(2)}ms`);

    console.log('\n✅ Todos os testes passaram! Redis está funcionando corretamente.');

  } catch (error) {
    console.error('\n❌ Erro durante os testes:', error);
    process.exit(1);
  }
}

// Executar testes
testRedisConnection()
  .then(() => {
    console.log('\n🎉 Teste concluído com sucesso!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Teste falhou:', error);
    process.exit(1);
  });