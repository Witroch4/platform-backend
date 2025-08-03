#!/usr/bin/env tsx

// Simula ambiente de produção ANTES de importar
process.env.RUN_IN_DOCKER = 'true';
process.env.NODE_ENV = 'production';
process.env.REDIS_HOST = 'redis'; // Simula o host do container Docker

// Não carrega o .env local para simular produção
// process.env.NODE_ENV = 'production' fará o Next.js usar .env.production

import { getRedisInstance } from '../lib/connections';

async function testProductionRedisConfig() {
  console.log('🔍 Testando configuração do Redis para produção...');
  console.log('📋 Variáveis de ambiente simuladas:');
  console.log('  - RUN_IN_DOCKER:', process.env.RUN_IN_DOCKER);
  console.log('  - NODE_ENV:', process.env.NODE_ENV);
  console.log('  - REDIS_HOST:', process.env.REDIS_HOST);
  console.log('  - REDIS_PORT:', process.env.REDIS_PORT || '6379');
  
  // Detecta se está rodando em Docker
  const isRunningInDocker = process.env.RUN_IN_DOCKER === 'true' || process.env.NODE_ENV === 'production';
  
  console.log('🔧 Configuração detectada:');
  console.log('  - Ambiente:', isRunningInDocker ? 'Docker/Production' : 'Local Development');
  console.log('  - Host padrão:', isRunningInDocker ? 'redis' : '127.0.0.1');
  
  try {
    // Usa o conector global
    const redisConnection = getRedisInstance();
    
    // Testa a conexão
    await redisConnection.ping();
    console.log('✅ Redis conectado com sucesso!');
    
    // Testa operações básicas
    await redisConnection.set('test:production', 'ok');
    const result = await redisConnection.get('test:production');
    await redisConnection.del('test:production');
    
    console.log('✅ Operações básicas funcionando:', result);
    
  } catch (error) {
    console.error('❌ Erro ao conectar com o Redis:', error);
    console.log('\n💡 Em produção, o Redis deve estar rodando em:');
    console.log('  - Host: redis (nome do container Docker)');
    console.log('  - Port: 6379');
    console.log('  - Rede: minha_rede (Docker network)');
    console.log('\n🔧 Para testar em Docker:');
    console.log('  docker compose -f docker-compose-dev.yml up redis');
  }
}

testProductionRedisConfig(); 