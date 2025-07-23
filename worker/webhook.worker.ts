// worker/webhook.worker.ts

import { Worker } from 'bullmq';
import dotenv from 'dotenv';
import { connection } from '@/lib/redis';
import { prisma } from '@/lib/prisma';
import { processAgendamentoTask } from './WebhookWorkerTasks/agendamento.task';
import { processLeadCellTask } from './WebhookWorkerTasks/leadcells.task';
import { MANUSCRITO_QUEUE_NAME } from '@/lib/queue/manuscrito.queue';
import { leadCellsQueue } from '@/lib/queue/leadcells.queue';
import {
  AUTO_NOTIFICATIONS_QUEUE_NAME,
  IAutoNotificationJobData,
  AutoNotificationType,
  addCheckExpiringTokensJob
} from '@/lib/queue/instagram-webhook.queue';
import cron from 'node-cron';
import { LEADS_QUEUE_NAME } from '@/lib/queue/leads-chatwit.queue';
import { processLeadChatwitTask } from './WebhookWorkerTasks/leads-chatwit.task';
import { processMtfDiamanteWebhookTask } from './WebhookWorkerTasks/mtf-diamante-webhook.task';
import { MTF_DIAMANTE_WEBHOOK_QUEUE_NAME } from '@/lib/queue/mtf-diamante-webhook.queue';

dotenv.config();

// Definindo a interface para o progresso do job de leads
interface LeadJobProgress {
  processed?: boolean;
  leadId?: string;
}

// Worker de agendamento
const agendamentoWorker = new Worker(
  'agendamento',
  processAgendamentoTask,
  { connection }
);

// Worker de manuscrito (mantido para compatibilidade)
const manuscritoWorker = new Worker(
  MANUSCRITO_QUEUE_NAME,
  processLeadCellTask,
  { connection }
);

// Worker unificado para lead cells (manuscrito, espelho, análise)
const leadCellsWorker = new Worker(
  'leadCells',
  processLeadCellTask,
  { 
    connection,
    concurrency: 5,
    lockDuration: 30000,
  }
);

// Worker de leads‑chatwit 🔥
const leadsChatwitWorker = new Worker(
  LEADS_QUEUE_NAME,
  processLeadChatwitTask,
  { 
    connection, 
    concurrency: 10,  // Aumentamos a concorrência pois agora acumulamos jobs
    lockDuration: 30000,  // Aumentamos o tempo de bloqueio para 30s para permitir acumulação
  }
);

// Worker para processar notificações automáticas
const autoNotificationsWorker = new Worker<IAutoNotificationJobData>(
  AUTO_NOTIFICATIONS_QUEUE_NAME,
  async (job) => {
    console.log(`[BullMQ] Processando job de notificação automática: ${job.id}`);

    try {
      const { type } = job.data;

      switch (type) {
        case AutoNotificationType.EXPIRING_TOKENS:
          await handleExpiringTokensNotification(job.data);
          break;
        default:
          console.warn(`[BullMQ] Tipo de notificação desconhecido: ${type}`);
      }

      return { success: true };
    } catch (error: any) {
      console.error(`[BullMQ] Erro ao processar notificação automática: ${error.message}`);
      throw error;
    }
  },
  { connection }
);

// Worker para processar webhooks do MTF Diamante (legacy tasks)
const mtfDiamanteWebhookWorker = new Worker(
  MTF_DIAMANTE_WEBHOOK_QUEUE_NAME,
  processMtfDiamanteWebhookTask,
  {
    connection,
    concurrency: 5,
    lockDuration: 30000,
  }
);

// Worker para processar tasks assíncronas do MTF Diamante (sendMessage, sendReaction)
const mtfDiamanteAsyncWorker = new Worker(
  `${MTF_DIAMANTE_WEBHOOK_QUEUE_NAME}-async`,
  processMtfDiamanteWebhookTask, // Usa a mesma função de processamento
  {
    connection,
    concurrency: 10, // Mais concorrência para tasks assíncronas
    lockDuration: 60000, // Mais tempo para envio de mensagens
  }
);

// Tratamento de eventos dos workers
[agendamentoWorker, manuscritoWorker, leadCellsWorker, leadsChatwitWorker, autoNotificationsWorker, mtfDiamanteWebhookWorker, mtfDiamanteAsyncWorker].forEach(worker => {
  worker.on('completed', (job) => {
    console.log(`[BullMQ] Job ${job.id} concluído com sucesso`);
  });

  worker.on('failed', (job, error) => {
    console.error(`[BullMQ] Job ${job?.id} falhou: ${error.message}`);
  });
});

// Eventos específicos para o worker de leads
leadsChatwitWorker.on('progress', (job, progress) => {
  const leadProgress = progress as unknown as LeadJobProgress;
  if (leadProgress.processed) {
    console.log(`[BullMQ] Job ${job.id} processado em lote para leadId: ${leadProgress.leadId}`);
  }
});

/**
 * Processa notificações de tokens expirando
 */
async function handleExpiringTokensNotification(data: IAutoNotificationJobData) {
  try {
    console.log('[BullMQ] Verificando tokens expirando...');

    const sevenDaysFromNow = new Date();
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

    const expiringAccounts = await prisma.account.findMany({
      where: {
        expires_at: {
          not: null,
          lte: Math.floor(sevenDaysFromNow.getTime() / 1000),
          gt: Math.floor(Date.now() / 1000),
        },
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    console.log(`[BullMQ] Encontradas ${expiringAccounts.length} contas com tokens expirando.`);

    for (const account of expiringAccounts) {
      const expiresAt = account.expires_at ? new Date(account.expires_at * 1000) : null;
      if (!expiresAt) continue;

      const daysRemaining = Math.ceil((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24));

      await prisma.notification.create({
        data: {
          userId: account.userId,
          title: 'Token de Acesso Expirando',
          message: `Seu token de acesso para ${account.provider} expirará em ${daysRemaining} dias. Por favor, reconecte sua conta para evitar interrupções.`,
          isRead: false,
        },
      });

      console.log(`[BullMQ] Notificação criada para o usuário ${account.userId} sobre token expirando em ${daysRemaining} dias.`);
    }

    return { success: true, count: expiringAccounts.length };
  } catch (error: any) {
    console.error('[BullMQ] Erro ao processar notificação de tokens expirando:', error);
    throw error;
  }
}

/**
 * Inicializa os jobs recorrentes
 */
export async function initJobs() {
  try {
    console.log('[BullMQ] Inicializando jobs recorrentes...');

    cron.schedule('0 8 * * *', async () => {
      try {
        await addCheckExpiringTokensJob();
      } catch (error) {
        console.error('[BullMQ] Erro ao agendar verificação de tokens expirando:', error);
      }
    });

    console.log('[BullMQ] Jobs recorrentes inicializados com sucesso.');
  } catch (error) {
    console.error('[BullMQ] Erro ao inicializar jobs recorrentes:', error);
  }
}

// Exportar a função de inicialização do worker de agendamento
export async function initAgendamentoWorker() {
  try {
    console.log('[BullMQ] Inicializando worker de agendamento...');
    await agendamentoWorker.waitUntilReady();
    console.log('[BullMQ] Worker de agendamento inicializado com sucesso');
  } catch (error) {
    console.error('[BullMQ] Erro ao inicializar worker de agendamento:', error);
    throw error;
  }
}

// Exportar a função de inicialização do worker de manuscrito
export async function initManuscritoWorker() {
  try {
    console.log('[BullMQ] Inicializando worker de manuscrito...');
    await manuscritoWorker.waitUntilReady();
    console.log('[BullMQ] Worker de manuscrito inicializado com sucesso');
  } catch (error) {
    console.error('[BullMQ] Erro ao inicializar worker de manuscrito:', error);
    throw error;
  }
}

// Exportar a função de inicialização do worker de leads
export async function initLeadsChatwitWorker() {
  try {
    console.log('[BullMQ] Inicializando worker de leads...');
    await leadsChatwitWorker.waitUntilReady();
    console.log('[BullMQ] Worker de leads inicializado com sucesso');
  } catch (error) {
    console.error('[BullMQ] Erro ao inicializar worker de leads:', error);
    throw error;
  }
}

// Exportar a função de inicialização do worker de webhook MTF Diamante
export async function initMtfDiamanteWebhookWorker() {
  try {
    console.log('[BullMQ] Inicializando worker de webhook MTF Diamante...');
    await mtfDiamanteWebhookWorker.waitUntilReady();
    console.log('[BullMQ] Worker de webhook MTF Diamante inicializado com sucesso');
  } catch (error) {
    console.error('[BullMQ] Erro ao inicializar worker de webhook MTF Diamante:', error);
    throw error;
  }
}

// Exportar a função de inicialização do worker assíncrono MTF Diamante
export async function initMtfDiamanteAsyncWorker() {
  try {
    console.log('[BullMQ] Inicializando worker assíncrono MTF Diamante...');
    await mtfDiamanteAsyncWorker.waitUntilReady();
    console.log('[BullMQ] Worker assíncrono MTF Diamante inicializado com sucesso');
  } catch (error) {
    console.error('[BullMQ] Erro ao inicializar worker assíncrono MTF Diamante:', error);
    throw error;
  }
}

// Tratamento de encerramento gracioso
process.on('SIGTERM', async () => {
  console.log('Encerrando workers...');
  await Promise.all([
    agendamentoWorker.close(),
    manuscritoWorker.close(),
    leadsChatwitWorker.close(),
    autoNotificationsWorker.close(),
    mtfDiamanteWebhookWorker.close(),
    mtfDiamanteAsyncWorker.close(),
  ]);
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('Encerrando workers...');
  await Promise.all([
    agendamentoWorker.close(),
    manuscritoWorker.close(),
    autoNotificationsWorker.close(),
    leadsChatwitWorker.close(),
    mtfDiamanteWebhookWorker.close(),
    mtfDiamanteAsyncWorker.close(),
  ]);
  await prisma.$disconnect();
  process.exit(0);
});

export {
  agendamentoWorker,
  manuscritoWorker,
  leadsChatwitWorker,
  autoNotificationsWorker,
  mtfDiamanteWebhookWorker
};
