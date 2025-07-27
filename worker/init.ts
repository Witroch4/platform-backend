import { 
  initAgendamentoWorker, 
  initManuscritoWorker, 
  initLeadsChatwitWorker, 
  initMtfDiamanteWebhookWorker, 
  initMtfDiamanteAsyncWorker,
  initParentWorker 
} from './webhook.worker';
import { initializeExistingAgendamentos } from '../lib/scheduler-bullmq';
import { initJobs } from './webhook.worker';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Inicializa todos os workers e agendamentos existentes
 * Updated to use the new Parent Worker architecture
 */
export async function initializeWorkers() {
  try {
    console.log('[Worker] Inicializando workers...');

    // ============================================================================
    // PARENT WORKER INITIALIZATION (NEW ARCHITECTURE)
    // ============================================================================
    
    // Initialize the Parent Worker for both high and low priority queues
    await initParentWorker();
    console.log('[Worker] Parent Worker (High & Low Priority) inicializado com sucesso');

    // ============================================================================
    // LEGACY WORKERS (BACKWARD COMPATIBILITY)
    // ============================================================================

    // Inicializa o worker de agendamento (agora é feito no bull-board-server.ts)
    // await initAgendamentoWorker();

    // Inicializa o worker de manuscrito
    await initManuscritoWorker();
    
    // Inicializa o worker de leads-chatwit
    await initLeadsChatwitWorker();

    // Inicializa o worker de webhook MTF Diamante
    await initMtfDiamanteWebhookWorker();

    // Inicializa o worker assíncrono MTF Diamante
    await initMtfDiamanteAsyncWorker();

    // ============================================================================
    // SHARED INITIALIZATION
    // ============================================================================

    // Inicializa os jobs recorrentes (apenas uma vez)
    await initJobs();

    // Inicializa os agendamentos existentes
    const result = await initializeExistingAgendamentos();

    console.log(`[Worker] Todos os workers inicializados com sucesso. ${result.count} agendamentos carregados.`);
    console.log('[Worker] Parent Worker está processando filas de alta e baixa prioridade');

    return { success: true, count: result.count };
  } catch (error) {
    console.error('[Worker] Erro ao inicializar workers:', error);
    return { success: false, error };
  }
}

// Se este arquivo for executado diretamente (não importado)
if (require.main === module) {
  initializeWorkers()
    .then(() => {
      console.log('[Worker] Inicialização concluída.');
    })
    .catch((error) => {
      console.error('[Worker] Erro na inicialização:', error);
      process.exit(1);
    });
}