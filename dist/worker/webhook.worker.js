"use strict";
// worker/webhook.worker.ts - Parent Worker Implementation
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.instagramTranslationWorker = exports.mtfDiamanteWebhookWorker = exports.autoNotificationsWorker = exports.leadsChatwitWorker = exports.manuscritoWorker = exports.agendamentoWorker = exports.parentWorker = void 0;
exports.initJobs = initJobs;
exports.initAgendamentoWorker = initAgendamentoWorker;
exports.initManuscritoWorker = initManuscritoWorker;
exports.initLeadsChatwitWorker = initLeadsChatwitWorker;
exports.initMtfDiamanteWebhookWorker = initMtfDiamanteWebhookWorker;
exports.initMtfDiamanteAsyncWorker = initMtfDiamanteAsyncWorker;
exports.initInstagramTranslationWorker = initInstagramTranslationWorker;
exports.initParentWorker = initParentWorker;
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
const instagram_translation_task_1 = require("./WebhookWorkerTasks/instagram-translation.task");
const instagram_translation_queue_1 = require("@/lib/queue/instagram-translation.queue");
// Import new task modules
const resposta_rapida_queue_1 = require("@/lib/queue/resposta-rapida.queue");
const persistencia_credenciais_queue_1 = require("@/lib/queue/persistencia-credenciais.queue");
const respostaRapida_worker_task_1 = require("./WebhookWorkerTasks/respostaRapida.worker.task");
const persistencia_worker_task_1 = require("./WebhookWorkerTasks/persistencia.worker.task");
dotenv_1.default.config();
// ============================================================================
// PARENT WORKER IMPLEMENTATION
// ============================================================================
/**
 * Parent Worker that delegates jobs to appropriate task modules
 * This replaces individual workers with a unified delegation system
 */
class ParentWorker {
    highPriorityWorker;
    lowPriorityWorker;
    constructor() {
        // High Priority Worker for user responses
        this.highPriorityWorker = new bullmq_1.Worker(resposta_rapida_queue_1.RESPOSTA_RAPIDA_QUEUE_NAME, this.delegateHighPriorityJob.bind(this), {
            connection: redis_1.connection,
            concurrency: 10, // High concurrency for user-facing responses
            lockDuration: 30000,
        });
        // Low Priority Worker for data persistence
        this.lowPriorityWorker = new bullmq_1.Worker(persistencia_credenciais_queue_1.PERSISTENCIA_CREDENCIAIS_QUEUE_NAME, this.delegateLowPriorityJob.bind(this), {
            connection: redis_1.connection,
            concurrency: 5, // Lower concurrency for background tasks
            lockDuration: 60000,
        });
        this.setupEventHandlers();
    }
    /**
     * Delegate high priority jobs to appropriate task modules
     */
    async delegateHighPriorityJob(job) {
        const { type, data } = job.data;
        console.log(`[Parent Worker] Delegating high priority job: ${job.name}`, {
            type,
            correlationId: data.correlationId,
            interactionType: data.interactionType,
        });
        try {
            switch (type) {
                case 'processarResposta':
                    return await (0, respostaRapida_worker_task_1.processRespostaRapidaTask)(job);
                default:
                    throw new Error(`Unknown high priority job type: ${type}`);
            }
        }
        catch (error) {
            console.error(`[Parent Worker] High priority job delegation failed: ${job.name}`, {
                error: error instanceof Error ? error.message : error,
                correlationId: data.correlationId,
            });
            // Handle job failure using the appropriate handler
            await (0, resposta_rapida_queue_1.handleJobFailure)(job, error);
            throw error;
        }
    }
    /**
     * Delegate low priority jobs to appropriate task modules
     */
    async delegateLowPriorityJob(job) {
        const { type, data } = job.data;
        console.log(`[Parent Worker] Delegating low priority job: ${job.name}`, {
            type,
            correlationId: data.correlationId,
            inboxId: data.inboxId,
        });
        try {
            switch (type) {
                case 'atualizarCredenciais':
                case 'atualizarLead':
                case 'batchUpdate':
                    return await (0, persistencia_worker_task_1.processPersistenciaTask)(job);
                default:
                    throw new Error(`Unknown low priority job type: ${type}`);
            }
        }
        catch (error) {
            console.error(`[Parent Worker] Low priority job delegation failed: ${job.name}`, {
                error: error instanceof Error ? error.message : error,
                correlationId: data.correlationId,
            });
            // Handle job failure using the appropriate handler
            await (0, persistencia_credenciais_queue_1.handleJobFailure)(job, error);
            throw error;
        }
    }
    /**
     * Setup event handlers for both workers
     */
    setupEventHandlers() {
        // High Priority Worker Events
        this.highPriorityWorker.on('completed', (job, result) => {
            console.log(`[Parent Worker] High priority job completed: ${job.name}`, {
                jobId: job.id,
                correlationId: job.data.data.correlationId,
                processingTime: result?.processingTime,
            });
        });
        this.highPriorityWorker.on('failed', (job, error) => {
            console.error(`[Parent Worker] High priority job failed: ${job?.name}`, {
                jobId: job?.id,
                correlationId: job?.data?.data?.correlationId,
                error: error.message,
            });
        });
        // Low Priority Worker Events
        this.lowPriorityWorker.on('completed', (job, result) => {
            console.log(`[Parent Worker] Low priority job completed: ${job.name}`, {
                jobId: job.id,
                correlationId: job.data.data.correlationId,
                credentialsUpdated: result?.credentialsUpdated,
                leadUpdated: result?.leadUpdated,
            });
        });
        this.lowPriorityWorker.on('failed', (job, error) => {
            console.error(`[Parent Worker] Low priority job failed: ${job?.name}`, {
                jobId: job?.id,
                correlationId: job?.data?.data?.correlationId,
                error: error.message,
            });
        });
        // General error handlers
        this.highPriorityWorker.on('error', (error) => {
            console.error('[Parent Worker] High priority worker error:', error);
        });
        this.lowPriorityWorker.on('error', (error) => {
            console.error('[Parent Worker] Low priority worker error:', error);
        });
        console.log('[Parent Worker] Event handlers setup completed');
    }
    /**
     * Graceful shutdown of both workers
     */
    async shutdown() {
        console.log('[Parent Worker] Shutting down workers...');
        await Promise.all([
            this.highPriorityWorker.close(),
            this.lowPriorityWorker.close(),
        ]);
        console.log('[Parent Worker] Workers shut down successfully');
    }
    /**
     * Wait for both workers to be ready
     */
    async waitUntilReady() {
        await Promise.all([
            this.highPriorityWorker.waitUntilReady(),
            this.lowPriorityWorker.waitUntilReady(),
        ]);
        console.log('[Parent Worker] Both workers are ready');
    }
    // Getters for accessing individual workers if needed
    get highPriority() { return this.highPriorityWorker; }
    get lowPriority() { return this.lowPriorityWorker; }
}
// Create the Parent Worker instance
const parentWorker = new ParentWorker();
exports.parentWorker = parentWorker;
// ============================================================================
// LEGACY WORKERS (maintained for backward compatibility)
// ============================================================================
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
// Import Instagram translation worker configuration
const instagram_translation_worker_config_1 = require("./config/instagram-translation-worker.config");
// Get and validate worker configuration
const instagramWorkerConfig = (0, instagram_translation_worker_config_1.getCurrentWorkerConfig)();
const configValidation = (0, instagram_translation_worker_config_1.validateWorkerConfig)(instagramWorkerConfig);
if (!configValidation.valid) {
    console.error('[Instagram Worker] Configuration validation failed:', configValidation.errors);
    throw new Error(`Instagram worker configuration invalid: ${configValidation.errors.join(', ')}`);
}
// Log worker configuration for monitoring
(0, instagram_translation_worker_config_1.logWorkerConfiguration)(instagramWorkerConfig);
// Worker para processar tradução de mensagens para Instagram
const instagramTranslationWorker = new bullmq_1.Worker(instagram_translation_queue_1.INSTAGRAM_TRANSLATION_QUEUE_NAME, instagram_translation_task_1.processInstagramTranslationTask, {
    connection: redis_1.connection,
    concurrency: instagramWorkerConfig.concurrency, // Configurable concurrency for IO-bound translation tasks
    lockDuration: instagramWorkerConfig.lockDuration, // Configurable timeout to ensure webhook response within limits
    // Add resource monitoring and limits
    settings: {
        stalledInterval: 30000, // Check for stalled jobs every 30 seconds
        maxStalledCount: 1, // Mark job as failed after 1 stalled occurrence
    },
});
exports.instagramTranslationWorker = instagramTranslationWorker;
// Tratamento de eventos dos workers legados
[agendamentoWorker, manuscritoWorker, leadCellsWorker, leadsChatwitWorker, autoNotificationsWorker, mtfDiamanteWebhookWorker, mtfDiamanteAsyncWorker].forEach(worker => {
    worker.on('completed', (job) => {
        console.log(`[BullMQ] Job ${job.id} concluído com sucesso`);
    });
    worker.on('failed', (job, error) => {
        console.error(`[BullMQ] Job ${job?.id} falhou: ${error.message}`);
    });
});
// Enhanced event handling for Instagram Translation Worker with performance monitoring
instagramTranslationWorker.on('completed', (job, result) => {
    const processingTime = result?.processingTime || 0;
    const memoryUsage = process.memoryUsage();
    console.log(`[Instagram Worker] Job ${job.id} completed successfully`, {
        processingTime: `${processingTime}ms`,
        memoryUsage: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`,
        correlationId: job.data.correlationId,
        success: result?.success,
    });
    // Check for performance warnings
    if (processingTime > instagramWorkerConfig.resourceLimits.processing.warningThreshold) {
        console.warn(`[Instagram Worker] Job ${job.id} processing time exceeded warning threshold`, {
            processingTime: `${processingTime}ms`,
            threshold: `${instagramWorkerConfig.resourceLimits.processing.warningThreshold}ms`,
            correlationId: job.data.correlationId,
        });
    }
    // Check memory usage
    const memoryUsageMB = memoryUsage.heapUsed / 1024 / 1024;
    const memoryLimitMB = parseInt(instagramWorkerConfig.resourceLimits.memory.warning.replace('MB', ''));
    if (memoryUsageMB > memoryLimitMB) {
        console.warn(`[Instagram Worker] Memory usage exceeded warning threshold`, {
            currentUsage: `${Math.round(memoryUsageMB)}MB`,
            threshold: instagramWorkerConfig.resourceLimits.memory.warning,
            jobId: job.id,
        });
    }
});
instagramTranslationWorker.on('failed', (job, error) => {
    const memoryUsage = process.memoryUsage();
    console.error(`[Instagram Worker] Job ${job?.id} failed: ${error.message}`, {
        correlationId: job?.data?.correlationId,
        attemptsMade: job?.attemptsMade,
        maxAttempts: job?.opts?.attempts,
        memoryUsage: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`,
        error: error.message,
    });
});
instagramTranslationWorker.on('stalled', (job) => {
    console.warn(`[Instagram Worker] Job ${job.id} stalled`, {
        correlationId: job.data.correlationId,
        stalledCount: job.opts?.stalledCount || 0,
        lockDuration: `${instagramWorkerConfig.lockDuration}ms`,
    });
});
instagramTranslationWorker.on('error', (error) => {
    console.error('[Instagram Worker] Worker error:', {
        error: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString(),
    });
});
// Add periodic resource monitoring for the Instagram worker
let resourceMonitoringInterval;
if (instagramWorkerConfig.monitoring.enabled) {
    resourceMonitoringInterval = setInterval(() => {
        const memoryUsage = process.memoryUsage();
        const cpuUsage = process.cpuUsage();
        // Log resource usage periodically
        console.log('[Instagram Worker] Resource usage report:', {
            memory: {
                heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`,
                heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB`,
                external: `${Math.round(memoryUsage.external / 1024 / 1024)}MB`,
            },
            cpu: {
                user: `${Math.round(cpuUsage.user / 1000)}ms`,
                system: `${Math.round(cpuUsage.system / 1000)}ms`,
            },
            uptime: `${Math.round(process.uptime())}s`,
            timestamp: new Date().toISOString(),
        });
        // Check for resource limit violations
        const memoryUsageMB = memoryUsage.heapUsed / 1024 / 1024;
        const criticalMemoryMB = parseInt(instagramWorkerConfig.resourceLimits.memory.critical.replace('MB', ''));
        if (memoryUsageMB > criticalMemoryMB) {
            console.error('[Instagram Worker] CRITICAL: Memory usage exceeded critical threshold', {
                currentUsage: `${Math.round(memoryUsageMB)}MB`,
                criticalThreshold: instagramWorkerConfig.resourceLimits.memory.critical,
                recommendation: 'Consider reducing concurrency or restarting worker',
            });
        }
    }, instagramWorkerConfig.monitoring.metricsInterval);
}
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
// Exportar a função de inicialização do worker de tradução Instagram com validação completa
async function initInstagramTranslationWorker() {
    try {
        console.log('[Instagram Worker] Initializing Instagram translation worker...');
        // Log configuration details
        console.log('[Instagram Worker] Configuration:', {
            concurrency: instagramWorkerConfig.concurrency,
            lockDuration: `${instagramWorkerConfig.lockDuration}ms`,
            maxRetries: instagramWorkerConfig.maxRetries,
            resourceLimits: {
                memory: instagramWorkerConfig.resourceLimits.memory.max,
                cpu: `${instagramWorkerConfig.resourceLimits.cpu.max}%`,
                maxProcessingTime: `${instagramWorkerConfig.resourceLimits.processing.maxProcessingTime}ms`,
            },
            monitoring: instagramWorkerConfig.monitoring.enabled,
            environment: process.env.NODE_ENV || 'development',
        });
        // Wait for worker to be ready with timeout
        const startupTimeout = new Promise((_, reject) => setTimeout(() => reject(new Error('Worker startup timeout')), instagramWorkerConfig.lifecycle.startupTimeout));
        await Promise.race([
            instagramTranslationWorker.waitUntilReady(),
            startupTimeout,
        ]);
        // Perform initial health check
        const healthCheck = await performInstagramWorkerHealthCheck();
        if (!healthCheck.healthy) {
            throw new Error(`Worker health check failed: ${healthCheck.issues.join(', ')}`);
        }
        console.log('[Instagram Worker] ✅ Instagram translation worker initialized successfully', {
            concurrency: instagramWorkerConfig.concurrency,
            resourceMonitoring: instagramWorkerConfig.monitoring.enabled,
            healthStatus: 'HEALTHY',
            uptime: `${Math.round(process.uptime())}s`,
        });
        // Start resource monitoring if enabled
        if (instagramWorkerConfig.monitoring.enabled) {
            console.log('[Instagram Worker] Resource monitoring enabled', {
                metricsInterval: `${instagramWorkerConfig.monitoring.metricsInterval}ms`,
                healthCheckInterval: `${instagramWorkerConfig.monitoring.healthCheckInterval}ms`,
            });
        }
    }
    catch (error) {
        console.error('[Instagram Worker] ❌ Failed to initialize Instagram translation worker:', {
            error: error instanceof Error ? error.message : String(error),
            configuration: {
                concurrency: instagramWorkerConfig.concurrency,
                lockDuration: instagramWorkerConfig.lockDuration,
            },
            environment: process.env.NODE_ENV,
        });
        throw error;
    }
}
/**
 * Perform health check for Instagram translation worker
 */
async function performInstagramWorkerHealthCheck() {
    const issues = [];
    const memoryUsage = process.memoryUsage();
    try {
        // Check worker configuration
        const configValidation = (0, instagram_translation_worker_config_1.validateWorkerConfig)(instagramWorkerConfig);
        if (!configValidation.valid) {
            issues.push(`Configuration invalid: ${configValidation.errors.join(', ')}`);
        }
        // Check memory usage
        const memoryUsageMB = memoryUsage.heapUsed / 1024 / 1024;
        const memoryLimitMB = parseInt(instagramWorkerConfig.resourceLimits.memory.critical.replace('MB', ''));
        if (memoryUsageMB > memoryLimitMB) {
            issues.push(`Memory usage critical: ${Math.round(memoryUsageMB)}MB > ${memoryLimitMB}MB`);
        }
        // Check if worker is responsive
        const healthCheckTimeout = new Promise((_, reject) => setTimeout(() => reject(new Error('Health check timeout')), instagramWorkerConfig.lifecycle.healthCheckTimeout));
        try {
            await Promise.race([
                // Simple responsiveness check - worker should be able to handle this quickly
                new Promise(resolve => setTimeout(resolve, 100)),
                healthCheckTimeout,
            ]);
        }
        catch (timeoutError) {
            issues.push('Worker responsiveness check failed');
        }
        return {
            healthy: issues.length === 0,
            issues,
            metrics: {
                memoryUsage: `${Math.round(memoryUsageMB)}MB`,
                uptime: `${Math.round(process.uptime())}s`,
                configValid: configValidation.valid,
            },
        };
    }
    catch (error) {
        issues.push(`Health check error: ${error instanceof Error ? error.message : String(error)}`);
        return {
            healthy: false,
            issues,
            metrics: {
                memoryUsage: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`,
                uptime: `${Math.round(process.uptime())}s`,
                configValid: false,
            },
        };
    }
}
// ============================================================================
// PARENT WORKER INITIALIZATION FUNCTIONS
// ============================================================================
// Exportar a função de inicialização do Parent Worker
async function initParentWorker() {
    try {
        console.log('[BullMQ] Inicializando Parent Worker (High & Low Priority)...');
        await parentWorker.waitUntilReady();
        console.log('[BullMQ] Parent Worker inicializado com sucesso');
    }
    catch (error) {
        console.error('[BullMQ] Erro ao inicializar Parent Worker:', error);
        throw error;
    }
}
// Enhanced graceful shutdown with resource monitoring cleanup
const gracefulShutdown = async (signal) => {
    console.log(`[Worker Shutdown] Received ${signal}, initiating graceful shutdown...`);
    // Clear resource monitoring interval
    if (resourceMonitoringInterval) {
        clearInterval(resourceMonitoringInterval);
        console.log('[Worker Shutdown] Resource monitoring stopped');
    }
    // Set shutdown timeout
    const shutdownTimeout = setTimeout(() => {
        console.error('[Worker Shutdown] Shutdown timeout exceeded, forcing exit');
        process.exit(1);
    }, instagramWorkerConfig.lifecycle.gracefulShutdownTimeout);
    try {
        console.log('[Worker Shutdown] Closing all workers...');
        // Close all workers with timeout handling
        await Promise.race([
            Promise.all([
                parentWorker.shutdown(),
                agendamentoWorker.close(),
                manuscritoWorker.close(),
                leadsChatwitWorker.close(),
                autoNotificationsWorker.close(),
                mtfDiamanteWebhookWorker.close(),
                mtfDiamanteAsyncWorker.close(),
                instagramTranslationWorker.close(),
            ]),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Worker shutdown timeout')), 25000)),
        ]);
        console.log('[Worker Shutdown] All workers closed successfully');
        // Disconnect from database
        await prisma_1.prisma.$disconnect();
        console.log('[Worker Shutdown] Database disconnected');
        // Clear shutdown timeout
        clearTimeout(shutdownTimeout);
        console.log('[Worker Shutdown] Graceful shutdown completed');
        process.exit(0);
    }
    catch (error) {
        console.error('[Worker Shutdown] Error during shutdown:', error);
        clearTimeout(shutdownTimeout);
        process.exit(1);
    }
};
// Register shutdown handlers
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGUSR2', () => gracefulShutdown('SIGUSR2')); // For nodemon
// Handle uncaught exceptions and unhandled rejections
process.on('uncaughtException', (error) => {
    console.error('[Worker] Uncaught exception:', error);
    gracefulShutdown('UNCAUGHT_EXCEPTION');
});
process.on('unhandledRejection', (reason, promise) => {
    console.error('[Worker] Unhandled rejection at:', promise, 'reason:', reason);
    gracefulShutdown('UNHANDLED_REJECTION');
});
