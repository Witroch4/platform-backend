// scripts/reset-queues.ts

import { Redis } from 'ioredis';
import dotenv from 'dotenv';
import { agendamentoQueue } from '../lib/queue/agendamento.queue';
import { instagramWebhookQueue, autoNotificationsQueue } from '../lib/queue/instagram-webhook.queue';
import { followUpQueue } from '../worker/queues/followUpQueue';

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
  'bull:agendamento:ag-job-*',
  'bull:agendamento:*',
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
  }
}

// Função para limpar e reiniciar as filas
async function resetQueues() {
  try {
    console.log('Iniciando reset das filas...');

    // Limpa as filas antigas
    await cleanOldQueues();

    // Limpa as filas atuais
    console.log('\nLimpando filas atuais...');

    // Limpa a fila de agendamento
    await agendamentoQueue.obliterate({ force: true });
    console.log('Fila de agendamento limpa com sucesso!');

    // Limpa a fila de webhooks do Instagram
    await instagramWebhookQueue.obliterate({ force: true });
    console.log('Fila de webhooks do Instagram limpa com sucesso!');

    // Limpa a fila de notificações automáticas
    await autoNotificationsQueue.obliterate({ force: true });
    console.log('Fila de notificações automáticas limpa com sucesso!');

    // Limpa a fila de follow-up
    await followUpQueue.obliterate({ force: true });
    console.log('Fila de follow-up limpa com sucesso!');

    console.log('\nReset das filas concluído com sucesso!');
    console.log('Agora você pode reiniciar o servidor para que as filas sejam recriadas corretamente.');
  } catch (error) {
    console.error('Erro ao resetar filas:', error);
  } finally {
    // Fecha a conexão com o Redis
    await redis.quit();

    // Fecha as conexões das filas
    await agendamentoQueue.close();
    await instagramWebhookQueue.close();
    await autoNotificationsQueue.close();
    await followUpQueue.close();

    console.log('Conexões fechadas.');
  }
}

// Executa o reset
resetQueues();