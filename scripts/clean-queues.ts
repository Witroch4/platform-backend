import { Redis } from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

// Configuração do Redis
const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: Number.parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  tls: process.env.REDIS_TLS === 'true' ? {} : undefined,
};

console.log('Configuração de conexão com o Redis:', {
  ...redisConfig,
  password: redisConfig.password ? '*****' : undefined,
  useTLS: !!redisConfig.tls,
});

// Conecta ao Redis
const redis = new Redis(redisConfig);

// Padrões de chaves para filas antigas
const oldQueuePatterns = [
  'bull:agendamento-ag-job-*',
  'bull:agendamento-*',
  'bull:baserow-*',
  // Adicione outros padrões conforme necessário
];

// Função para limpar as filas antigas
async function cleanOldQueues() {
  try {
    console.log('Iniciando limpeza de filas antigas...');

    for (const pattern of oldQueuePatterns) {
      console.log(`Buscando chaves com padrão: ${pattern}`);
      const keys = await redis.keys(pattern);

      if (keys.length > 0) {
        console.log(`Encontradas ${keys.length} chaves para o padrão ${pattern}`);

        // Exibe as primeiras 10 chaves para verificação
        if (keys.length > 0) {
          console.log('Exemplos de chaves encontradas:');
          keys.slice(0, 10).forEach(key => console.log(`  - ${key}`));
        }

        // Remove as chaves
        const result = await redis.del(...keys);
        console.log(`Removidas ${result} chaves para o padrão ${pattern}`);
      } else {
        console.log(`Nenhuma chave encontrada para o padrão ${pattern}`);
      }
    }

    console.log('Limpeza de filas antigas concluída com sucesso!');
  } catch (error) {
    console.error('Erro ao limpar filas antigas:', error);
  } finally {
    // Fecha a conexão com o Redis
    await redis.quit();
  }
}

// Executa a limpeza
cleanOldQueues();