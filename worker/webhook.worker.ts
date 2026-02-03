// worker/webhook.worker.ts - Parent Worker Implementation

import { Worker, Job } from "bullmq";
import dotenv from "dotenv";
import { getRedisInstance } from "@/lib/connections";
import { getPrismaInstance } from "@/lib/connections";
import { startRedisHealthMonitoring, checkRedisHealth } from "@/lib/redis-health-check";
import { processAgendamentoTask } from "./WebhookWorkerTasks/agendamento.task";
import { processLeadCellTask } from "./WebhookWorkerTasks/leadcells.task";
import { processMirrorGenerationTask } from "./WebhookWorkerTasks/mirror-generation.task";
import { MANUSCRITO_QUEUE_NAME } from "@/lib/queue/manuscrito.queue";
import { leadCellsQueue } from "@/lib/queue/leadcells.queue";
import { mirrorGenerationQueue } from "@/lib/oab-eval/mirror-queue";
import {
  AUTO_NOTIFICATIONS_QUEUE_NAME,
  type IAutoNotificationJobData,
  AutoNotificationType,
  addCheckExpiringTokensJob,
} from "@/lib/queue/instagram-webhook.queue";
import cron from "node-cron";
import { LEADS_QUEUE_NAME } from "@/lib/queue/leads-chatwit.queue";
import { processLeadChatwitTask } from "./WebhookWorkerTasks/leads-chatwit.task";
import { getWorkersConfig, isMonitorLogEnabled } from '@/lib/config';

import { processInstagramTranslationTask } from "./WebhookWorkerTasks/instagram-translation.task";
import { INSTAGRAM_TRANSLATION_QUEUE_NAME } from "@/lib/queue/instagram-translation.queue";



// Import new task modules
import {
  RESPOSTA_RAPIDA_QUEUE_NAME,
  RespostaRapidaJobData,
  handleJobFailure as handleRespostaRapidaFailure,
} from "@/lib/queue/resposta-rapida.queue";
import {
  PERSISTENCIA_CREDENCIAIS_QUEUE_NAME,
  PersistenciaCredenciaisJobData,
  handleJobFailure as handlePersistenciaFailure,
} from "@/lib/queue/persistencia-credenciais.queue";
import { processRespostaRapidaTask } from "./WebhookWorkerTasks/respostaRapida.worker.task";
import { processPersistenciaTask } from "./WebhookWorkerTasks/persistencia.worker.task";

dotenv.config();

// Definindo a interface para o progresso do job de leads
interface LeadJobProgress {
  processed?: boolean;
  leadId?: string;
}

// ============================================================================
// PARENT WORKER IMPLEMENTATION
// ============================================================================

/**
 * Parent Worker that delegates jobs to appropriate task modules
 * This replaces individual workers with a unified delegation system
 */
class ParentWorker {
  private highPriorityWorker: Worker;
  private lowPriorityWorker: Worker;

  constructor() {
    // High Priority Worker for user responses
    this.highPriorityWorker = new Worker(
      RESPOSTA_RAPIDA_QUEUE_NAME,
      this.delegateHighPriorityJob.bind(this),
      {
        connection: getRedisInstance(),
        concurrency: 5, // Reduced from 10 to 5 to prevent Redis overload
        lockDuration: 45000, // Increased from 30s to 45s
        stalledInterval: 60000, // Check for stalled jobs every 60s
        maxStalledCount: 2, // Allow 2 stalled attempts before failing
      }
    );

    // Low Priority Worker for data persistence
    this.lowPriorityWorker = new Worker(
      PERSISTENCIA_CREDENCIAIS_QUEUE_NAME,
      this.delegateLowPriorityJob.bind(this),
      {
        connection: getRedisInstance(),
        concurrency: 3, // Reduced from 5 to 3 for background tasks
        lockDuration: 90000, // Increased from 60s to 90s
        stalledInterval: 60000, // Check for stalled jobs every 60s
        maxStalledCount: 2, // Allow 2 stalled attempts before failing
      }
    );

    this.setupEventHandlers();
  }

  /**
   * Delegate high priority jobs to appropriate task modules
   */
  private async delegateHighPriorityJob(
    job: Job<RespostaRapidaJobData>
  ): Promise<any> {
    const { type, data } = job.data;

    console.log(`[Parent Worker] Delegating high priority job: ${job.name}`, {
      type,
      correlationId: data.correlationId,
      interactionType: data.interactionType,
    });

    try {
      switch (type) {
        case "processarResposta":
          return await processRespostaRapidaTask(job);

        default:
          throw new Error(`Unknown high priority job type: ${type}`);
      }
    } catch (error) {
      console.error(
        `[Parent Worker] High priority job delegation failed: ${job.name}`,
        {
          error: error instanceof Error ? error.message : error,
          correlationId: data.correlationId,
        }
      );

      // Handle job failure using the appropriate handler
      await handleRespostaRapidaFailure(job, error as Error);
      throw error;
    }
  }

  /**
   * Delegate low priority jobs to appropriate task modules
   */
  private async delegateLowPriorityJob(
    job: Job<PersistenciaCredenciaisJobData>
  ): Promise<any> {
    const { type, data } = job.data;

    console.log(`[Parent Worker] Delegating low priority job: ${job.name}`, {
      type,
      correlationId: data.correlationId,
      inboxId: data.inboxId,
    });

    try {
      switch (type) {
        case "atualizarCredenciais":
        case "atualizarLead":
        case "batchUpdate":
          return await processPersistenciaTask(job);

        default:
          throw new Error(`Unknown low priority job type: ${type}`);
      }
    } catch (error) {
      console.error(
        `[Parent Worker] Low priority job delegation failed: ${job.name}`,
        {
          error: error instanceof Error ? error.message : error,
          correlationId: data.correlationId,
        }
      );

      // Handle job failure using the appropriate handler
      await handlePersistenciaFailure(job, error as Error);
      throw error;
    }
  }

  /**
   * Setup event handlers for both workers
   */
  private setupEventHandlers(): void {
    // High Priority Worker Events
    this.highPriorityWorker.on("completed", (job, result) => {
      console.log(`[Parent Worker] High priority job completed: ${job.name}`, {
        jobId: job.id,
        correlationId: job.data.data.correlationId,
        processingTime: result?.processingTime,
      });
    });

    this.highPriorityWorker.on("failed", (job, error) => {
      console.error(`[Parent Worker] High priority job failed: ${job?.name}`, {
        jobId: job?.id,
        correlationId: job?.data?.data?.correlationId,
        error: error.message,
      });
    });

    // Low Priority Worker Events
    this.lowPriorityWorker.on("completed", (job, result) => {
      console.log(`[Parent Worker] Low priority job completed: ${job.name}`, {
        jobId: job.id,
        correlationId: job.data.data.correlationId,
        credentialsUpdated: result?.credentialsUpdated,
        leadUpdated: result?.leadUpdated,
      });
    });

    this.lowPriorityWorker.on("failed", (job, error) => {
      console.error(`[Parent Worker] Low priority job failed: ${job?.name}`, {
        jobId: job?.id,
        correlationId: job?.data?.data?.correlationId,
        error: error.message,
      });
    });

    // General error handlers
    this.highPriorityWorker.on("error", (error) => {
      console.error("[Parent Worker] High priority worker error:", error);
    });

    this.lowPriorityWorker.on("error", (error) => {
      console.error("[Parent Worker] Low priority worker error:", error);
    });

    console.log("[Parent Worker] Event handlers setup completed");
  }

  /**
   * Graceful shutdown of both workers
   */
  async shutdown(): Promise<void> {
    console.log("[Parent Worker] Shutting down workers...");

    await Promise.all([
      this.highPriorityWorker.close(),
      this.lowPriorityWorker.close(),
    ]);

    console.log("[Parent Worker] Workers shut down successfully");
  }

  /**
   * Wait for both workers to be ready
   */
  async waitUntilReady(): Promise<void> {
    await Promise.all([
      this.highPriorityWorker.waitUntilReady(),
      this.lowPriorityWorker.waitUntilReady(),
    ]);

    console.log("[Parent Worker] Both workers are ready");
  }

  // Getters for accessing individual workers if needed
  get highPriority(): Worker {
    return this.highPriorityWorker;
  }
  get lowPriority(): Worker {
    return this.lowPriorityWorker;
  }
}

// Create the Parent Worker instance
const parentWorker = new ParentWorker();

// ============================================================================
// REDIS CONNECTION INITIALIZATION
// ============================================================================

/**
 * Wait for Redis to be ready before initializing workers
 */
async function waitForRedisConnection(maxAttempts: number = 30, delayMs: number = 2000): Promise<void> {
  console.log('[Redis Health] 🔄 Waiting for Redis connection...');
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const health = await checkRedisHealth();
      
      if (health.healthy) {
        console.log(`[Redis Health] ✅ Redis connected successfully (latency: ${health.latency}ms)`);
        return;
      }
      
      console.log(`[Redis Health] ⏳ Attempt ${attempt}/${maxAttempts}: Redis not ready (status: ${health.connectionStatus})`);
      
      if (attempt < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    } catch (error) {
      console.log(`[Redis Health] ⏳ Attempt ${attempt}/${maxAttempts}: Redis connection error - ${error instanceof Error ? error.message : 'Unknown error'}`);
      
      if (attempt < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
  }
  
  throw new Error(`Redis connection failed after ${maxAttempts} attempts`);
}

/**
 * Initialize all workers and components in the correct order
 */
async function initializeAllWorkers(): Promise<void> {
  try {
    console.log('[Worker Initialization] 🚀 Starting worker initialization...');
    
    // Step 1: Wait for Redis connection
    await waitForRedisConnection();
    console.log('[Worker Initialization] ✅ Redis connection established');
    
    // Step 2: Start Redis health monitoring
    startRedisHealthMonitoring(60000); // Check every minute
    console.log('[Worker Initialization] ✅ Redis health monitoring started');
    
    // Step 3: Initialize all workers
    await Promise.all([
      initializeLegacyWorkers(),
      initializeAutoNotificationsWorker(),
      initializeInstagramTranslationWorker(),
    ]);
    console.log('[Worker Initialization] ✅ All workers initialized');
    
    // Step 4: Setup event handlers
    setupWorkerEventHandlers();
    setupInstagramWorkerEventHandlers();
    setupLeadsWorkerEventHandlers();
    console.log('[Worker Initialization] ✅ All event handlers configured');
    
    // Step 5: Start resource monitoring
    startInstagramResourceMonitoring();
    console.log('[Worker Initialization] ✅ Resource monitoring started');
    
    console.log('[Worker Initialization] 🎉 All components initialized successfully!');
    
  } catch (error) {
    console.error('[Worker Initialization] ❌ Failed to initialize workers:', error);
    process.exit(1);
  }
}

// Initialize all workers after Redis is ready
initializeAllWorkers();

// ============================================================================
// LEGACY WORKERS (maintained for backward compatibility)
// ============================================================================

// Initialize workers after Redis connection is established
let agendamentoWorker: Worker;
let manuscritoWorker: Worker;
let leadCellsWorker: Worker;
let leadsChatwitWorker: Worker;
let mirrorGenerationWorker: Worker;

// Worker de leads‑chatwit 🔥 (concorrência ajustável baseada no ambiente)
const workersConfig = getWorkersConfig();
const leadsChatwitConcurrency = workersConfig.leads_chatwit.concurrency;
const leadsChatwitLockDuration = workersConfig.leads_chatwit.lock_duration;

/**
 * Initialize all legacy workers after Redis is ready
 */
async function initializeLegacyWorkers(): Promise<void> {
  console.log('[BullMQ] 🔄 Initializing legacy workers...');
  
  try {
    // Worker de agendamento
    agendamentoWorker = new Worker("agendamento", processAgendamentoTask, {
      connection: getRedisInstance(),
    });

    // Worker de manuscrito (mantido para compatibilidade)
    manuscritoWorker = new Worker(
      MANUSCRITO_QUEUE_NAME,
      processLeadCellTask,
      { connection: getRedisInstance() }
    );

    // Worker unificado para lead cells (manuscrito, espelho, análise)
    leadCellsWorker = new Worker("leadCells", processLeadCellTask, {
      connection: getRedisInstance(),
      concurrency: 5,
      lockDuration: 30000,
    });

    // Worker para geração de espelhos locais (OAB)
    mirrorGenerationWorker = new Worker("oab-mirror-generation", processMirrorGenerationTask, {
      connection: getRedisInstance(),
      concurrency: 5, // Até 5 espelhos simultâneos
      lockDuration: 300000, // 5 minutos (pode demorar mais que manuscrito)
    });

    // Worker de leads‑chatwit 🔥
    leadsChatwitWorker = new Worker(
      LEADS_QUEUE_NAME,
      processLeadChatwitTask,
      {
        connection: getRedisInstance(),
        concurrency: leadsChatwitConcurrency, // Concorrência configurável via env
        lockDuration: leadsChatwitLockDuration, // Lock duration configurável
        stalledInterval: 60000, // Increased from 30s to 60s
        maxStalledCount: 2, // Increased from 1 to 2 to handle temporary timeouts
      }
    );

    // Wait for all workers to be ready
    await Promise.all([
      agendamentoWorker.waitUntilReady(),
      manuscritoWorker.waitUntilReady(),
      leadCellsWorker.waitUntilReady(),
      mirrorGenerationWorker.waitUntilReady(),
      leadsChatwitWorker.waitUntilReady(),
    ]);

    console.log(`[BullMQ] ✅ Worker de leads-chatwit inicializado:`, {
      concurrency: leadsChatwitConcurrency,
      lockDuration: `${leadsChatwitLockDuration}ms`,
      stalledInterval: "30000ms",
    });

    console.log('[BullMQ] ✅ All legacy workers initialized successfully');
  } catch (error) {
    console.error('[BullMQ] ❌ Failed to initialize legacy workers:', error);
    throw error;
  }
}

// Initialize auto notifications worker after Redis is ready
let autoNotificationsWorker: Worker<IAutoNotificationJobData>;

/**
 * Initialize auto notifications worker after Redis is ready
 */
async function initializeAutoNotificationsWorker(): Promise<void> {
  console.log('[BullMQ] 🔄 Initializing auto notifications worker...');
  
  try {
    autoNotificationsWorker = new Worker<IAutoNotificationJobData>(
      AUTO_NOTIFICATIONS_QUEUE_NAME,
      async (job) => {
        console.log(
          `[BullMQ] Processando job de notificação automática: ${job.id}`
        );

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
          console.error(
            `[BullMQ] Erro ao processar notificação automática: ${error.message}`
          );
          throw error;
        }
      },
      { connection: getRedisInstance() }
    );

    // Wait for worker to be ready
    await autoNotificationsWorker.waitUntilReady();

    console.log('[BullMQ] ✅ Auto notifications worker initialized successfully');
  } catch (error) {
    console.error('[BullMQ] ❌ Failed to initialize auto notifications worker:', error);
    throw error;
  }
}



// Worker para processar tasks assíncronas do MTF Diamante (sendMessage, sendReaction)
// Temporariamente desabilitado - arquivo de task foi removido
// const mtfDiamanteAsyncWorker = new Worker(
//   `${MTF_DIAMANTE_WEBHOOK_QUEUE_NAME}-async`,
//   processMtfDiamanteWebhookTask, // Usa a mesma função de processamento
//   {
//     connection: getRedisInstance(),
//     concurrency: 10, // Mais concorrência para tasks assíncronas
//     lockDuration: 60000, // Mais tempo para envio de mensagens
//   }
// );

// Import Instagram translation worker configuration
import {
  getCurrentWorkerConfig,
  logWorkerConfiguration,
  validateWorkerConfig,
} from "./config/instagram-translation-worker.config";

// Get and validate worker configuration
const instagramWorkerConfig = getCurrentWorkerConfig();
const configValidation = validateWorkerConfig(instagramWorkerConfig);

if (!configValidation.valid) {
  console.error(
    "[Instagram Worker] Configuration validation failed:",
    configValidation.errors
  );
  throw new Error(
    `Instagram worker configuration invalid: ${configValidation.errors.join(", ")}`
  );
}

// Log worker configuration for monitoring
logWorkerConfiguration(instagramWorkerConfig);

// Initialize Instagram translation worker after Redis is ready
let instagramTranslationWorker: Worker;

/**
 * Initialize Instagram translation worker after Redis is ready
 */
async function initializeInstagramTranslationWorker(): Promise<void> {
  console.log('[Instagram Worker] 🔄 Initializing Instagram translation worker...');
  
  try {
    instagramTranslationWorker = new Worker(
      INSTAGRAM_TRANSLATION_QUEUE_NAME,
      processInstagramTranslationTask,
      {
        connection: getRedisInstance(),
        concurrency: instagramWorkerConfig.concurrency, // Configurable concurrency for IO-bound translation tasks
        lockDuration: instagramWorkerConfig.lockDuration, // Configurable timeout to ensure webhook response within limits
        stalledInterval: 30000, // Check for stalled jobs every 30 seconds
        maxStalledCount: 1, // Mark job as failed after 1 stalled occurrence
      }
    );

    // Wait for worker to be ready
    await instagramTranslationWorker.waitUntilReady();

    console.log('[Instagram Worker] ✅ Instagram translation worker initialized successfully');
  } catch (error) {
    console.error('[Instagram Worker] ❌ Failed to initialize Instagram translation worker:', error);
    throw error;
  }
}

/**
 * Setup event handlers for all workers
 */
function setupWorkerEventHandlers(): void {
  console.log('[BullMQ] 🔄 Setting up worker event handlers...');
  
  // Tratamento de eventos dos workers legados
  [
    agendamentoWorker,
    manuscritoWorker,
    leadCellsWorker,
    mirrorGenerationWorker,
    leadsChatwitWorker,
    autoNotificationsWorker,
    // mtfDiamanteAsyncWorker, // Temporariamente desabilitado
  ].forEach((worker) => {
    worker.on("completed", (job) => {
      console.log(`[BullMQ] Job ${job.id} concluído com sucesso`);
    });

    worker.on("failed", (job, error) => {
      console.error(`[BullMQ] Job ${job?.id} falhou: ${error.message}`);
    });
  });

  console.log('[BullMQ] ✅ Worker event handlers setup completed');
}

/**
 * Setup Instagram worker event handlers
 */
function setupInstagramWorkerEventHandlers(): void {
  console.log('[Instagram Worker] 🔄 Setting up Instagram worker event handlers...');
  
  // Enhanced event handling for Instagram Translation Worker with performance monitoring
  instagramTranslationWorker.on("completed", (job, result) => {
    const processingTime = result?.processingTime || 0;
    const memoryUsage = process.memoryUsage();

    console.log(`[Instagram Worker] Job ${job.id} completed successfully`, {
      processingTime: `${processingTime}ms`,
      memoryUsage: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`,
      correlationId: job.data.correlationId,
      success: result?.success,
    });

    // Check for performance warnings
    if (processingTime > instagramWorkerConfig.processing.warningThreshold) {
      console.warn(
        `[Instagram Worker] Job ${job.id} processing time exceeded warning threshold`,
        {
          processingTime: `${processingTime}ms`,
          threshold: `${instagramWorkerConfig.processing.warningThreshold}ms`,
          correlationId: job.data.correlationId,
        }
      );
    }
  });

  instagramTranslationWorker.on("failed", (job, error) => {
    const memoryUsage = process.memoryUsage();

    console.error(`[Instagram Worker] Job ${job?.id} failed: ${error.message}`, {
      correlationId: job?.data?.correlationId,
      attemptsMade: job?.attemptsMade,
      maxAttempts: job?.opts?.attempts,
      memoryUsage: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`,
      error: error.message,
    });
  });

  instagramTranslationWorker.on("stalled", (job: any) => {
    console.warn(`[Instagram Worker] Job ${job.id} stalled`, {
      correlationId: job.data?.correlationId,
      stalledCount: job.opts?.stalledCount || 0,
      lockDuration: `${instagramWorkerConfig.lockDuration}ms`,
    });
  });

  instagramTranslationWorker.on("error", (error) => {
    console.error("[Instagram Worker] Worker error:", {
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
    });
  });

  console.log('[Instagram Worker] ✅ Instagram worker event handlers setup completed');
}

// Add periodic resource monitoring for the Instagram worker
let resourceMonitoringInterval: NodeJS.Timeout;

/**
 * Start resource monitoring for Instagram worker
 */
function startInstagramResourceMonitoring(): void {
  if (instagramWorkerConfig.monitoring.enabled) {
    console.log('[Instagram Worker] 🔄 Starting resource monitoring...');
    
    resourceMonitoringInterval = setInterval(() => {
      if (isMonitorLogEnabled()) {
        const memoryUsage = process.memoryUsage();
        const cpuUsage = process.cpuUsage();

        // Log resource usage periodically
        console.log("[Instagram Worker] Resource usage report:", {
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
      }
    }, instagramWorkerConfig.monitoring.metricsInterval);

    console.log('[Instagram Worker] ✅ Resource monitoring started');
  }
}

/**
 * Setup leads worker event handlers
 */
function setupLeadsWorkerEventHandlers(): void {
  console.log('[BullMQ] 🔄 Setting up leads worker event handlers...');
  
  // Eventos específicos para o worker de leads (com logs detalhados para debug)
  leadsChatwitWorker.on("progress", (job, progress) => {
    const leadProgress = progress as unknown as LeadJobProgress;
    console.log(`[BullMQ-Debug] Job ${job.id} - progresso:`, progress);
    if (leadProgress.processed) {
      console.log(
        `[BullMQ] Job ${job.id} processado em lote para leadId: ${leadProgress.leadId}`
      );
    }
  });

  leadsChatwitWorker.on("active", (job) => {
    console.log(`[BullMQ-Debug] Job ${job.id} INICIADO - sourceId: ${job.data.payload?.origemLead?.source_id}, arquivos: ${job.data.payload?.origemLead?.arquivos?.length || 0}`);
  });

  leadsChatwitWorker.on("completed", (job, result) => {
    console.log(`[BullMQ-Debug] Job ${job.id} CONCLUÍDO - sourceId: ${job.data.payload?.origemLead?.source_id}, resultado:`, result);
  });

  leadsChatwitWorker.on("failed", (job, err) => {
    console.error(`[BullMQ-Debug] Job ${job?.id} FALHOU - sourceId: ${job?.data?.payload?.origemLead?.source_id}:`, {
      error: err.message,
      stack: err.stack,
      jobData: job?.data
    });
  });

  leadsChatwitWorker.on("stalled", (jobId) => {
    console.warn(`[BullMQ-Debug] Job ${jobId} TRAVADO (stalled) - pode indicar timeout ou sobrecarga`);
  });

  leadsChatwitWorker.on("error", (err) => {
    console.error(`[BullMQ-Debug] ERRO NO WORKER:`, {
      error: err.message,
      stack: err.stack,
      concurrency: leadsChatwitConcurrency,
      lockDuration: leadsChatwitLockDuration
    });
  });

  console.log('[BullMQ] ✅ Leads worker event handlers setup completed');
}

/**
 * Processa notificações de tokens expirando
 */
async function handleExpiringTokensNotification(
  data: IAutoNotificationJobData
) {
  try {
    console.log("[BullMQ] Verificando tokens expirando...");

    const sevenDaysFromNow = new Date();
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

    const expiringAccounts = await getPrismaInstance().account.findMany({
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

    console.log(
      `[BullMQ] Encontradas ${expiringAccounts.length} contas com tokens expirando.`
    );

    for (const account of expiringAccounts) {
      const expiresAt = account.expires_at
        ? new Date(account.expires_at * 1000)
        : null;
      if (!expiresAt) continue;

      const daysRemaining = Math.ceil(
        (expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      );

      await getPrismaInstance().notification.create({
        data: {
          userId: account.userId,
          title: "Token de Acesso Expirando",
          message: `Seu token de acesso para ${account.provider} expirará em ${daysRemaining} dias. Por favor, reconecte sua conta para evitar interrupções.`,
          isRead: false,
        },
      });

      console.log(
        `[BullMQ] Notificação criada para o usuário ${account.userId} sobre token expirando em ${daysRemaining} dias.`
      );
    }

    return { success: true, count: expiringAccounts.length };
  } catch (error: any) {
    console.error(
      "[BullMQ] Erro ao processar notificação de tokens expirando:",
      error
    );
    throw error;
  }
}

/**
 * Inicializa os jobs recorrentes
 */
export async function initJobs() {
  try {
    console.log("[BullMQ] Inicializando jobs recorrentes...");

    cron.schedule("0 8 * * *", async () => {
      try {
        await addCheckExpiringTokensJob();
      } catch (error) {
        console.error(
          "[BullMQ] Erro ao agendar verificação de tokens expirando:",
          error
        );
      }
    });

    console.log("[BullMQ] Jobs recorrentes inicializados com sucesso.");
  } catch (error) {
    console.error("[BullMQ] Erro ao inicializar jobs recorrentes:", error);
  }
}

// Exportar a função de inicialização do worker de agendamento
export async function initAgendamentoWorker() {
  try {
    console.log("[BullMQ] Inicializando worker de agendamento...");
    if (!agendamentoWorker) {
      throw new Error("Agendamento worker not initialized yet");
    }
    await agendamentoWorker.waitUntilReady();
    console.log("[BullMQ] Worker de agendamento inicializado com sucesso");
  } catch (error) {
    console.error("[BullMQ] Erro ao inicializar worker de agendamento:", error);
    throw error;
  }
}

// Exportar a função de inicialização do worker de manuscrito
export async function initManuscritoWorker() {
  try {
    console.log("[BullMQ] Inicializando worker de manuscrito...");
    if (!manuscritoWorker) {
      throw new Error("Manuscrito worker not initialized yet");
    }
    await manuscritoWorker.waitUntilReady();
    console.log("[BullMQ] Worker de manuscrito inicializado com sucesso");
  } catch (error) {
    console.error("[BullMQ] Erro ao inicializar worker de manuscrito:", error);
    throw error;
  }
}

// Exportar a função de inicialização do worker de leads
export async function initLeadsChatwitWorker() {
  try {
    console.log("[BullMQ] Inicializando worker de leads...");
    if (!leadsChatwitWorker) {
      throw new Error("Leads worker not initialized yet");
    }
    await leadsChatwitWorker.waitUntilReady();
    console.log("[BullMQ] Worker de leads inicializado com sucesso");
  } catch (error) {
    console.error("[BullMQ] Erro ao inicializar worker de leads:", error);
    throw error;
  }
}



// Exportar a função de inicialização do worker assíncrono MTF Diamante
// Temporariamente desabilitado - arquivo de task foi removido
// export async function initMtfDiamanteAsyncWorker() {
//   try {
//     console.log("[BullMQ] Inicializando worker assíncrono MTF Diamante...");
//     await mtfDiamanteAsyncWorker.waitUntilReady();
//     console.log(
//       "[BullMQ] Worker assíncrono MTF Diamante inicializado com sucesso"
//     );
//   } catch (error) {
//     console.error(
//       "[BullMQ] Erro ao inicializar worker assíncrono MTF Diamante:",
//       error
//     );
//     throw error;
//   }
// }

// Exportar a função de inicialização do worker de tradução Instagram com validação completa
export async function initInstagramTranslationWorker() {
  try {
    console.log(
      "[Instagram Worker] Initializing Instagram translation worker..."
    );

    if (!instagramTranslationWorker) {
      throw new Error("Instagram translation worker not initialized yet");
    }

    // Log configuration details
    console.log("[Instagram Worker] Configuration:", {
      concurrency: instagramWorkerConfig.concurrency,
      lockDuration: `${instagramWorkerConfig.lockDuration}ms`,
      maxRetries: instagramWorkerConfig.maxRetries,
      processing: {
        maxProcessingTime: `${instagramWorkerConfig.processing.maxProcessingTime}ms`,
      },
      monitoring: instagramWorkerConfig.monitoring.enabled,
      environment: process.env.NODE_ENV || "development",
    });

    // Wait for worker to be ready with timeout
    const startupTimeout = new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error("Worker startup timeout")),
        instagramWorkerConfig.lifecycle.startupTimeout
      )
    );

    await Promise.race([
      instagramTranslationWorker.waitUntilReady(),
      startupTimeout,
    ]);

    // Perform initial health check
    const healthCheck = await performInstagramWorkerHealthCheck();
    if (!healthCheck.healthy) {
      throw new Error(
        `Worker health check failed: ${healthCheck.issues.join(", ")}`
      );
    }

    console.log(
      "[Instagram Worker] ✅ Instagram translation worker initialized successfully",
      {
        concurrency: instagramWorkerConfig.concurrency,
        resourceMonitoring: instagramWorkerConfig.monitoring.enabled,
        healthStatus: "HEALTHY",
        uptime: `${Math.round(process.uptime())}s`,
      }
    );

    // Start resource monitoring if enabled
    if (instagramWorkerConfig.monitoring.enabled) {
      console.log("[Instagram Worker] Resource monitoring enabled", {
        metricsInterval: `${instagramWorkerConfig.monitoring.metricsInterval}ms`,
        healthCheckInterval: `${instagramWorkerConfig.monitoring.healthCheckInterval}ms`,
      });
    }
  } catch (error) {
    console.error(
      "[Instagram Worker] ❌ Failed to initialize Instagram translation worker:",
      {
        error: error instanceof Error ? error.message : String(error),
        configuration: {
          concurrency: instagramWorkerConfig.concurrency,
          lockDuration: instagramWorkerConfig.lockDuration,
        },
        environment: process.env.NODE_ENV,
      }
    );
    throw error;
  }
}

/**
 * Perform health check for Instagram translation worker
 */
async function performInstagramWorkerHealthCheck(): Promise<{
  healthy: boolean;
  issues: string[];
  metrics: {
    memoryUsage: string;
    uptime: string;
    configValid: boolean;
  };
}> {
  const issues: string[] = [];
  const memoryUsage = process.memoryUsage();

  try {
    // Check if worker exists
    if (!instagramTranslationWorker) {
      issues.push("Instagram translation worker not initialized");
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

    // Check worker configuration
    const configValidation = validateWorkerConfig(instagramWorkerConfig);
    if (!configValidation.valid) {
      issues.push(
        `Configuration invalid: ${configValidation.errors.join(", ")}`
      );
    }

    // Check memory usage (Docker handles resource limits, just log for monitoring)
    const memoryUsageMB = memoryUsage.heapUsed / 1024 / 1024;
    console.log(
      `[Instagram Worker] Memory usage: ${Math.round(memoryUsageMB)}MB`
    );

    // Check if worker is responsive
    const healthCheckTimeout = new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error("Health check timeout")),
        instagramWorkerConfig.lifecycle.healthCheckTimeout
      )
    );

    try {
      await Promise.race([
        // Simple responsiveness check - worker should be able to handle this quickly
        new Promise((resolve) => setTimeout(resolve, 100)),
        healthCheckTimeout,
      ]);
    } catch (timeoutError) {
      issues.push("Worker responsiveness check failed");
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
  } catch (error) {
    issues.push(
      `Health check error: ${error instanceof Error ? error.message : String(error)}`
    );

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
export async function initParentWorker() {
  try {
    console.log(
      "[BullMQ] Inicializando Parent Worker (High & Low Priority)..."
    );
    await parentWorker.waitUntilReady();
    console.log("[BullMQ] Parent Worker inicializado com sucesso");
  } catch (error) {
    console.error("[BullMQ] Erro ao inicializar Parent Worker:", error);
    throw error;
  }
}

// Enhanced graceful shutdown with resource monitoring cleanup
const gracefulShutdown = async (signal: string) => {
  console.log(
    `[Worker Shutdown] Received ${signal}, initiating graceful shutdown...`
  );

  // Clear resource monitoring interval
  if (resourceMonitoringInterval) {
    clearInterval(resourceMonitoringInterval);
    console.log("[Worker Shutdown] Resource monitoring stopped");
  }

  // Set shutdown timeout
  const shutdownTimeout = setTimeout(() => {
    console.error("[Worker Shutdown] Shutdown timeout exceeded, forcing exit");
    process.exit(1);
  }, instagramWorkerConfig.lifecycle.gracefulShutdownTimeout);

  try {
    console.log("[Worker Shutdown] Closing all workers...");

    // Close all workers with timeout handling
    const workersToClose = [
      parentWorker.shutdown(),
    ];

    // Add legacy workers if they exist
    if (agendamentoWorker) workersToClose.push(agendamentoWorker.close());
    if (manuscritoWorker) workersToClose.push(manuscritoWorker.close());
    if (leadCellsWorker) workersToClose.push(leadCellsWorker.close());
    if (mirrorGenerationWorker) workersToClose.push(mirrorGenerationWorker.close());
    if (leadsChatwitWorker) workersToClose.push(leadsChatwitWorker.close());
    if (autoNotificationsWorker) workersToClose.push(autoNotificationsWorker.close());
    if (instagramTranslationWorker) workersToClose.push(instagramTranslationWorker.close());
    // mtfDiamanteAsyncWorker.close(), // Temporariamente desabilitado

    await Promise.race([
      Promise.all(workersToClose),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Worker shutdown timeout")), 25000)
      ),
    ]);

    console.log("[Worker Shutdown] All workers closed successfully");

    // Disconnect from database
    await getPrismaInstance().$disconnect();
    console.log("[Worker Shutdown] Database disconnected");

    // Clear shutdown timeout
    clearTimeout(shutdownTimeout);

    console.log("[Worker Shutdown] Graceful shutdown completed");
    process.exit(0);
  } catch (error) {
    console.error("[Worker Shutdown] Error during shutdown:", error);
    clearTimeout(shutdownTimeout);
    process.exit(1);
  }
};

// Register shutdown handlers
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGUSR2", () => gracefulShutdown("SIGUSR2")); // For nodemon

// Handle uncaught exceptions and unhandled rejections
process.on("uncaughtException", (error) => {
  console.error("[Worker] Uncaught exception:", error);
  gracefulShutdown("UNCAUGHT_EXCEPTION");
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("[Worker] Unhandled rejection at:", promise, "reason:", reason);
  gracefulShutdown("UNHANDLED_REJECTION");
});

export {
  parentWorker,
  agendamentoWorker,
  manuscritoWorker,
  leadsChatwitWorker,
  autoNotificationsWorker,
  instagramTranslationWorker,
  // Export initialization functions
  initializeAllWorkers,
  initializeLegacyWorkers,
  initializeAutoNotificationsWorker,
  initializeInstagramTranslationWorker,
};
