/**
 * Configuração inteligente do Redis baseada no ambiente
 */

import { getRedisConfig as getRedisConfigSettings } from '@/lib/config';

// Controle para logar apenas uma vez
let redisConfigLogged = false;

export function getRedisConfig() {
  const isProduction = process.env.NODE_ENV === 'production';
  const isDocker = process.env.RUN_IN_DOCKER === 'true' || isProduction;
  
  // Em produção/Docker, usar o nome do serviço
  const defaultHost = isDocker ? 'redis' : 'localhost';
  const defaultPort = 6379;
  
  // Configuração baseada em variáveis de ambiente
  const redisUrl = process.env.REDIS_URL;
  const redisHost = process.env.REDIS_HOST || defaultHost;
  const redisPort = parseInt(process.env.REDIS_PORT || defaultPort.toString());
  const redisPassword = process.env.REDIS_PASSWORD;
  
  // Se REDIS_URL está definida, usar ela
  if (redisUrl) {
    if (!redisConfigLogged) {
      console.log(`[Redis] Conectando em: ${redisUrl.replace(/:([^@]+)@/, ':***@')}`);
      redisConfigLogged = true;
    }
    return redisUrl;
  }
  
  // Construir URL baseada nos componentes
  const auth = redisPassword ? `:${redisPassword}@` : '';
  const url = `redis://${auth}${redisHost}:${redisPort}`;
  
  if (!redisConfigLogged) {
    console.log(`[Redis] Conectando em: ${url.replace(/:([^@]+)@/, ':***@')}`);
    redisConfigLogged = true;
  }
  
  return url;
}

export function getRedisConnectionOptions() {
  const isProduction = process.env.NODE_ENV === 'production';
  const isDocker = process.env.RUN_IN_DOCKER === 'true' || isProduction;
  
  const defaultHost = isDocker ? 'redis' : 'localhost';
  const redisHost = process.env.REDIS_HOST || defaultHost;
  const redisPort = parseInt(process.env.REDIS_PORT || '6379');
  const redisPassword = process.env.REDIS_PASSWORD;
  
  // Get timeout configurations from centralized config
  const redisConfig = getRedisConfigSettings();
  const connectTimeout = redisConfig.connect_timeout;
  const commandTimeout = redisConfig.command_timeout;
  const keepAlive = redisConfig.keepalive;
  
  return {
    host: redisHost,
    port: redisPort,
    password: redisPassword || undefined,
    maxRetriesPerRequest: null, // BullMQ requer que seja null
    lazyConnect: true,
    keepAlive,
    connectTimeout,
    commandTimeout,
    family: 4, // IPv4
    // Additional stability configurations
    retryDelayOnFailover: 200,
    enableReadyCheck: true,
    maxLoadingTimeout: 10000,
    // Connection pool settings
    enableOfflineQueue: true,
    // Configurações para evitar timeouts
    enableAutoPipelining: false,
    // Retry strategy for failed commands
    retryStrategy: (times: number) => {
      const delay = Math.min(times * 200, 5000);
      return delay;
    },
  };
}