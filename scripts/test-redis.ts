#!/usr/bin/env ts-node

import { getRedisInstance } from '../lib/connections';
import * as dotenv from 'dotenv';

// Carregar variáveis de ambiente
dotenv.config({ path: '.env.development' });

async function testRedisConnection() {
  console.log('🔍 Testando conexão com Redis...');
  
  try {
    const redis = getRedisInstance();
    
    // Testar conexão
    console.log('⏳ Testando ping...');
    const pong = await redis.ping();
    console.log(`✅ Redis respondeu: ${pong}`);
    
    // Testar operações básicas
    console.log('⏳ Testando set/get...');
    await redis.set('test_key', 'test_value');
    const value = await redis.get('test_key');
    console.log(`✅ Set/Get funcionando: ${value}`);
    
    // Limpar teste
    await redis.del('test_key');
    console.log('🧹 Chave de teste removida');
    
    console.log('🎉 Redis está funcionando perfeitamente!');
    
  } catch (error) {
    console.error('❌ Erro na conexão Redis:', error.message);
    console.log('');
    console.log('🔧 Possíveis soluções:');
    console.log('1. Verificar se o container Redis está rodando:');
    console.log('   docker ps | grep redis');
    console.log('');
    console.log('2. Verificar se está na mesma rede Docker:');
    console.log('   docker network ls');
    console.log('');
    console.log('3. Testar conexão manual:');
    console.log('   docker exec -it <redis-container> redis-cli ping');
    console.log('');
    console.log('4. Verificar variáveis de ambiente:');
    console.log(`   REDIS_HOST=${process.env.REDIS_HOST || 'localhost'}`);
    console.log(`   REDIS_PORT=${process.env.REDIS_PORT || '6379'}`);
    console.log(`   REDIS_URL=${process.env.REDIS_URL || 'redis://localhost:6379'}`);
  }
}

if (require.main === module) {
  testRedisConnection();
}

export { testRedisConnection };