//lib/redis.ts

import IORedis from 'ioredis';
import * as dotenv from 'dotenv';

dotenv.config();

// Detecta se está rodando em Docker
const isRunningInDocker = process.env.RUN_IN_DOCKER === 'true' || process.env.NODE_ENV === 'production';

// Variável para controlar se já exibimos a configuração
let configLogged = false;

// Função para exibir a configuração apenas uma vez
function logRedisConfig() {
  if (!configLogged) {
    console.log('Configuração de conexão com o Redis:', {
      host: process.env.REDIS_HOST || (isRunningInDocker ? 'redis' : '127.0.0.1'),
      port: Number.parseInt(process.env.REDIS_PORT || '6379', 10),
      useTLS: process.env.REDIS_USE_TLS === 'true',
      environment: isRunningInDocker ? 'Docker/Production' : 'Local Development',
    });
    configLogged = true;
  }
}

// Criação de uma única instância de conexão Redis
const redisConnection = new IORedis({
  host: process.env.REDIS_HOST || (isRunningInDocker ? 'redis' : '127.0.0.1'),
  port: Number.parseInt(process.env.REDIS_PORT || '6379', 10),
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  connectTimeout: 10000, // Aumenta o timeout para 10 segundos
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  // Se usar TLS:
  tls: process.env.REDIS_USE_TLS === 'true' ? {} : undefined,
});

// Variável para controlar se já exibimos a mensagem de conexão
let connectionLogged = false;

redisConnection.on('error', (err) => {
  console.error('Erro na conexão com o Redis:', err);
});

redisConnection.on('connect', () => {
  if (!connectionLogged) {
    console.log('Conectado ao Redis com sucesso!');
    connectionLogged = true;
  }
});

// Exibe a configuração apenas uma vez
logRedisConfig();

export { redisConnection as connection };
