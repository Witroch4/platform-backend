"use strict";
// worker/webhook.worker.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.mtfDiamanteWebhookWorker = exports.autoNotificationsWorker = exports.leadsChatwitWorker = exports.manuscritoWorker = exports.agendamentoWorker = void 0;
exports.initJobs = initJobs;
exports.initAgendamentoWorker = initAgendamentoWorker;
exports.initManuscritoWorker = initManuscritoWorker;
exports.initLeadsChatwitWorker = initLeadsChatwitWorker;
exports.initMtfDiamanteWebhookWorker = initMtfDiamanteWebhookWorker;
exports.initMtfDiamanteAsyncWorker = initMtfDiamanteAsyncWorker;
const bullmq_1 = require("bullmq");
const dotenv_1 = __importDefault(require("dotenv"));
const redis_1 = require("@/lib/redis");
const prisma_1 = require("@/lib/prisma");
const agendamento_task_1 = require("./WebhookWorkerTasks/agendamento.task");
const leadcells_task_1 = require("./WebhookWorkerTasks/leadcells.task");
const manuscrito_queue_1 = require("@/lib/queue/manuscrito.queue");
const instagram_webhook_queue_1 = require("@/lib/queue/instagram-webhook.queue");
const node_cron_1 = __importDefault(require("node-cron"));
const leads_chatwit_queue_1 = require("@/lib/queue/leads-chatwit.queue");
const leads_chatwit_task_1 = require("./WebhookWorkerTasks/leads-chatwit.task");
const mtf_diamante_webhook_task_1 = require("./WebhookWorkerTasks/mtf-diamante-webhook.task");
const mtf_diamante_webhook_queue_1 = require("@/lib/queue/mtf-diamante-webhook.queue");
dotenv_1.default.config();
// Worker de agendamento
const agendamentoWorker = new bullmq_1.Worker('agendamento', agendamento_task_1.processAgendamentoTask, { connection: redis_1.connection });
exports.agendamentoWorker = agendamentoWorker;
// Worker de manuscrito (mantido para compatibilidade)
const manuscritoWorker = new bullmq_1.Worker(manuscrito_queue_1.MANUSCRITO_QUEUE_NAME, leadcells_task_1.processLeadCellTask, { connection: redis_1.connection });
exports.manuscritoWorker = manuscritoWorker;
// Worker unificado para lead cells (manuscrito, espelho, análise)
const leadCellsWorker = new bullmq_1.Worker('leadCells', leadcells_task_1.processLeadCellTask, {
    connection: redis_1.connection,
    concurrency: 5,
    lockDuration: 30000,
});
// Worker de leads‑chatwit 🔥
const leadsChatwitWorker = new bullmq_1.Worker(leads_chatwit_queue_1.LEADS_QUEUE_NAME, leads_chatwit_task_1.processLeadChatwitTask, {
    connection: redis_1.connection,
    concurrency: 10, // Aumentamos a concorrência pois agora acumulamos jobs
    lockDuration: 30000, // Aumentamos o tempo de bloqueio para 30s para permitir acumulação
});
exports.leadsChatwitWorker = leadsChatwitWorker;
// Worker para processar notificações automáticas
const autoNotificationsWorker = new bullmq_1.Worker(instagram_webhook_queue_1.AUTO_NOTIFICATIONS_QUEUE_NAME, async (job) => {
    console.log(`[BullMQ] Processando job de notificação automática: ${job.id}`);
    try {
        const { type } = job.data;
        switch (type) {
            case instagram_webhook_queue_1.AutoNotificationType.EXPIRING_TOKENS:
                await handleExpiringTokensNotification(job.data);
                break;
            default:
                console.warn(`[BullMQ] Tipo de notificação desconhecido: ${type}`);
        }
        return { success: true };
    }
    catch (error) {
        console.error(`[BullMQ] Erro ao processar notificação automática: ${error.message}`);
        throw error;
    }
}, { connection: redis_1.connection });
exports.autoNotificationsWorker = autoNotificationsWorker;
// Worker para processar webhooks do MTF Diamante (legacy tasks)
const mtfDiamanteWebhookWorker = new bullmq_1.Worker(mtf_diamante_webhook_queue_1.MTF_DIAMANTE_WEBHOOK_QUEUE_NAME, mtf_diamante_webhook_task_1.processMtfDiamanteWebhookTask, {
    connection: redis_1.connection,
    concurrency: 5,
    lockDuration: 30000,
});
exports.mtfDiamanteWebhookWorker = mtfDiamanteWebhookWorker;
// Worker para processar tasks assíncronas do MTF Diamante (sendMessage, sendReaction)
const mtfDiamanteAsyncWorker = new bullmq_1.Worker(`${mtf_diamante_webhook_queue_1.MTF_DIAMANTE_WEBHOOK_QUEUE_NAME}-async`, mtf_diamante_webhook_task_1.processMtfDiamanteWebhookTask, // Usa a mesma função de processamento
{
    connection: redis_1.connection,
    concurrency: 10, // Mais concorrência para tasks assíncronas
    lockDuration: 60000, // Mais tempo para envio de mensagens
});
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
    const leadProgress = progress;
    if (leadProgress.processed) {
        console.log(`[BullMQ] Job ${job.id} processado em lote para leadId: ${leadProgress.leadId}`);
    }
});
/**
 * Processa notificações de tokens expirando
 */
async function handleExpiringTokensNotification(data) {
    try {
        console.log('[BullMQ] Verificando tokens expirando...');
        const sevenDaysFromNow = new Date();
        sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
        const expiringAccounts = await prisma_1.prisma.account.findMany({
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
            if (!expiresAt)
                continue;
            const daysRemaining = Math.ceil((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
            await prisma_1.prisma.notification.create({
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
    }
    catch (error) {
        console.error('[BullMQ] Erro ao processar notificação de tokens expirando:', error);
        throw error;
    }
}
/**
 * Inicializa os jobs recorrentes
 */
async function initJobs() {
    try {
        console.log('[BullMQ] Inicializando jobs recorrentes...');
        node_cron_1.default.schedule('0 8 * * *', async () => {
            try {
                await (0, instagram_webhook_queue_1.addCheckExpiringTokensJob)();
            }
            catch (error) {
                console.error('[BullMQ] Erro ao agendar verificação de tokens expirando:', error);
            }
        });
        console.log('[BullMQ] Jobs recorrentes inicializados com sucesso.');
    }
    catch (error) {
        console.error('[BullMQ] Erro ao inicializar jobs recorrentes:', error);
    }
}
// Exportar a função de inicialização do worker de agendamento
async function initAgendamentoWorker() {
    try {
        console.log('[BullMQ] Inicializando worker de agendamento...');
        await agendamentoWorker.waitUntilReady();
        console.log('[BullMQ] Worker de agendamento inicializado com sucesso');
    }
    catch (error) {
        console.error('[BullMQ] Erro ao inicializar worker de agendamento:', error);
        throw error;
    }
}
// Exportar a função de inicialização do worker de manuscrito
async function initManuscritoWorker() {
    try {
        console.log('[BullMQ] Inicializando worker de manuscrito...');
        await manuscritoWorker.waitUntilReady();
        console.log('[BullMQ] Worker de manuscrito inicializado com sucesso');
    }
    catch (error) {
        console.error('[BullMQ] Erro ao inicializar worker de manuscrito:', error);
        throw error;
    }
}
// Exportar a função de inicialização do worker de leads
async function initLeadsChatwitWorker() {
    try {
        console.log('[BullMQ] Inicializando worker de leads...');
        await leadsChatwitWorker.waitUntilReady();
        console.log('[BullMQ] Worker de leads inicializado com sucesso');
    }
    catch (error) {
        console.error('[BullMQ] Erro ao inicializar worker de leads:', error);
        throw error;
    }
}
// Exportar a função de inicialização do worker de webhook MTF Diamante
async function initMtfDiamanteWebhookWorker() {
    try {
        console.log('[BullMQ] Inicializando worker de webhook MTF Diamante...');
        await mtfDiamanteWebhookWorker.waitUntilReady();
        console.log('[BullMQ] Worker de webhook MTF Diamante inicializado com sucesso');
    }
    catch (error) {
        console.error('[BullMQ] Erro ao inicializar worker de webhook MTF Diamante:', error);
        throw error;
    }
}
// Exportar a função de inicialização do worker assíncrono MTF Diamante
async function initMtfDiamanteAsyncWorker() {
    try {
        console.log('[BullMQ] Inicializando worker assíncrono MTF Diamante...');
        await mtfDiamanteAsyncWorker.waitUntilReady();
        console.log('[BullMQ] Worker assíncrono MTF Diamante inicializado com sucesso');
    }
    catch (error) {
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
    await prisma_1.prisma.$disconnect();
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
    await prisma_1.prisma.$disconnect();
    process.exit(0);
});
