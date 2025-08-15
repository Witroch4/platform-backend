/**
 * Worker para atualização diária de taxas de câmbio
 */

import { Worker, Queue } from "bullmq";
import log from "@/lib/log";
import FxRateService from "./fx-rate-service";
import { getRedisInstance } from "@/lib/connections";

// Configuração da fila
const FX_RATE_QUEUE_NAME = "fx-rate-updates";

export const fxRateQueue = new Queue(FX_RATE_QUEUE_NAME, {
  connection: getRedisInstance(),
  defaultJobOptions: {
    removeOnComplete: 10, // Manter apenas 10 jobs completos
    removeOnFail: 5, // Manter apenas 5 jobs falhados
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 2000,
    },
  },
});

// Worker para processar atualizações de taxa
export const fxRateWorker = new Worker(
  FX_RATE_QUEUE_NAME,
  async (job) => {
    const { name, data } = job;
    
    log.info(`Processando job de taxa de câmbio: ${name}`, { jobId: job.id, data });

    try {
      switch (name) {
        case "update-daily-rate":
          await updateDailyRate();
          break;
          
        case "cleanup-old-rates":
          await cleanupOldRates();
          break;
          
        case "backfill-rates":
          await backfillRates(data.startDate, data.endDate);
          break;
          
        default:
          throw new Error(`Tipo de job desconhecido: ${name}`);
      }
      
      log.info(`Job de taxa de câmbio concluído: ${name}`, { jobId: job.id });
      
    } catch (error) {
      log.error(`Erro no job de taxa de câmbio: ${name}`, { 
        jobId: job.id, 
        error: error instanceof Error ? error.message : String(error) 
      });
      throw error;
    }
  },
  {
    connection: getRedisInstance(),
    concurrency: 1, // Processar um job por vez para evitar conflitos
  }
);

/**
 * Atualiza taxa diária
 */
async function updateDailyRate(): Promise<void> {
  log.info("Iniciando atualização diária de taxa USD/BRL");
  
  try {
    const rate = await FxRateService.updateCurrentRate();
    log.info(`Taxa USD/BRL atualizada com sucesso: ${rate}`);
  } catch (error) {
    log.error("Erro na atualização diária de taxa:", error);
    throw error;
  }
}

/**
 * Limpa taxas antigas
 */
async function cleanupOldRates(): Promise<void> {
  log.info("Iniciando limpeza de taxas antigas");
  
  try {
    const deletedCount = await FxRateService.cleanupOldRates();
    log.info(`Limpeza concluída: ${deletedCount} taxas antigas removidas`);
  } catch (error) {
    log.error("Erro na limpeza de taxas antigas:", error);
    throw error;
  }
}

/**
 * Preenche taxas para um período (backfill)
 */
async function backfillRates(startDate: string, endDate: string): Promise<void> {
  log.info(`Iniciando backfill de taxas: ${startDate} até ${endDate}`);
  
  try {
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    // Para backfill, vamos buscar apenas a taxa atual e aplicar para todas as datas
    // Em um cenário real, você poderia usar uma API histórica
    const currentRate = await FxRateService.fetchCurrentRate();
    
    const current = new Date(start);
    let daysProcessed = 0;
    
    while (current <= end) {
      await FxRateService.storeRate(currentRate, new Date(current));
      current.setDate(current.getDate() + 1);
      daysProcessed++;
      
      // Pequena pausa para não sobrecarregar
      if (daysProcessed % 10 === 0) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    log.info(`Backfill concluído: ${daysProcessed} dias processados`);
  } catch (error) {
    log.error("Erro no backfill de taxas:", error);
    throw error;
  }
}

/**
 * Agenda job diário de atualização de taxa
 */
export async function scheduleDailyFxRateUpdate(): Promise<void> {
  try {
    // Remover jobs agendados existentes
    await fxRateQueue.removeRepeatable("update-daily-rate", {
      pattern: "0 9 * * *", // 9:00 AM todos os dias
    });
    
    // Agendar novo job diário
    await fxRateQueue.add(
      "update-daily-rate",
      {},
      {
        repeat: {
          pattern: "0 9 * * *", // 9:00 AM todos os dias (UTC)
        },
        jobId: "daily-fx-rate-update", // ID fixo para evitar duplicatas
      }
    );
    
    log.info("Job diário de atualização de taxa agendado para 9:00 AM UTC");
  } catch (error) {
    log.error("Erro ao agendar job diário de taxa:", error);
    throw error;
  }
}

/**
 * Agenda job semanal de limpeza
 */
export async function scheduleWeeklyCleanup(): Promise<void> {
  try {
    // Remover jobs agendados existentes
    await fxRateQueue.removeRepeatable("cleanup-old-rates", {
      pattern: "0 2 * * 0", // 2:00 AM aos domingos
    });
    
    // Agendar novo job semanal
    await fxRateQueue.add(
      "cleanup-old-rates",
      {},
      {
        repeat: {
          pattern: "0 2 * * 0", // 2:00 AM aos domingos (UTC)
        },
        jobId: "weekly-fx-rate-cleanup",
      }
    );
    
    log.info("Job semanal de limpeza de taxas agendado para 2:00 AM aos domingos UTC");
  } catch (error) {
    log.error("Erro ao agendar job semanal de limpeza:", error);
    throw error;
  }
}

/**
 * Executa backfill de taxas para um período
 */
export async function scheduleBackfillRates(startDate: Date, endDate: Date): Promise<void> {
  try {
    await fxRateQueue.add(
      "backfill-rates",
      {
        startDate: startDate.toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0],
      },
      {
        priority: 5, // Prioridade baixa
      }
    );
    
    log.info(`Job de backfill agendado: ${startDate.toISOString().split('T')[0]} até ${endDate.toISOString().split('T')[0]}`);
  } catch (error) {
    log.error("Erro ao agendar backfill de taxas:", error);
    throw error;
  }
}

/**
 * Inicializa o sistema de taxas de câmbio
 */
export async function initializeFxRateSystem(): Promise<void> {
  try {
    log.info("Inicializando sistema de taxas de câmbio...");
    
    // Agendar jobs recorrentes
    await scheduleDailyFxRateUpdate();
    await scheduleWeeklyCleanup();
    
    // Buscar taxa atual se não existir nenhuma
    const latestRate = await FxRateService.getLatestStoredRate();
    if (!latestRate) {
      log.info("Nenhuma taxa encontrada, buscando taxa inicial...");
      await FxRateService.updateCurrentRate();
    }
    
    log.info("Sistema de taxas de câmbio inicializado com sucesso");
  } catch (error) {
    log.error("Erro ao inicializar sistema de taxas de câmbio:", error);
    throw error;
  }
}

// Event handlers para o worker
fxRateWorker.on("completed", (job) => {
  log.info(`Job de taxa de câmbio concluído: ${job.name}`, { jobId: job.id });
});

fxRateWorker.on("failed", (job, err) => {
  log.error(`Job de taxa de câmbio falhou: ${job?.name}`, { 
    jobId: job?.id, 
    error: err.message 
  });
});

fxRateWorker.on("error", (err) => {
  log.error("Erro no worker de taxa de câmbio:", err);
});

export default fxRateWorker;