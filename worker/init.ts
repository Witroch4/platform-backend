import {
  initAgendamentoWorker,
  initManuscritoWorker,
  initLeadsChatwitWorker,
  // initMtfDiamanteAsyncWorker, // Temporariamente desabilitado
  initInstagramTranslationWorker,
  initializeInstagramTranslationWorker,  // Adicionado
  initParentWorker,
  initializeLegacyWorkers
} from './webhook.worker';
import { initializeExistingAgendamentos } from '../lib/scheduler-bullmq';
import { initJobs } from './webhook.worker';
import { startWorkers as startAIIntegrationWorkers } from './ai-integration.worker';
import { instagramWebhookWorker } from './automacao.worker';
import { initializeQueueManagement, shutdownQueueManagement } from './queue-manager-integration';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Inicializa o worker de automação Instagram
 */
async function initAutomacaoWorker() {
  try {
    console.log('[Worker] Inicializando worker de automação Instagram...');
    
    // O worker já foi criado no automacao.worker.ts, só precisamos aguardar ele estar pronto
    await instagramWebhookWorker.waitUntilReady();
    
    console.log('[Worker] Worker de automação Instagram inicializado com sucesso');
    return { success: true };
  } catch (error) {
    console.error('[Worker] Erro ao inicializar worker de automação:', error);
    throw error;
  }
}

/**
 * Inicializa todos os workers e agendamentos existentes
 * Updated to use the new unified worker architecture
 */
export async function initializeWorkers() {
  try {
    console.log('[Worker] 🚀 Inicializando TODOS os workers em um único container...');

    // ============================================================================
    // PARENT WORKER INITIALIZATION (NEW ARCHITECTURE)
    // ============================================================================
    
    // Initialize the Parent Worker for both high and low priority queues
    await initParentWorker();
    console.log('[Worker] ✅ Parent Worker (High & Low Priority) inicializado com sucesso');

    // ============================================================================
    // AUTOMATION WORKER (Instagram Webhook Processing)
    // ============================================================================
    
    // Inicializa o worker de automação Instagram ("eu-quero")
    await initAutomacaoWorker();
    console.log('[Worker] ✅ Worker de Automação Instagram inicializado com sucesso');

    // ============================================================================
    // AI INTEGRATION WORKERS
    // ============================================================================
    
    // Inicializa todos os workers de AI Integration
    await startAIIntegrationWorkers();
    console.log('[Worker] ✅ AI Integration Workers inicializados com sucesso');

    // ============================================================================
    // LEGACY WORKERS (BACKWARD COMPATIBILITY)
    // ============================================================================

    // Primeiro, inicializa todos os workers legacy de uma vez
    await initializeLegacyWorkers();
    console.log('[Worker] ✅ Legacy Workers inicializados');

    // ============================================================================
    // ADDITIONAL WORKERS
    // ============================================================================

    // Inicializa o worker de tradução Instagram
    await initializeInstagramTranslationWorker();
    console.log('[Worker] ✅ Worker de Tradução Instagram inicializado');

    // ============================================================================
    // QUEUE MANAGEMENT SYSTEM
    // ============================================================================

    // Initialize queue management system to monitor all registered queues
    await initializeQueueManagement();
    console.log('[Worker] ✅ Sistema de Gerenciamento de Filas inicializado');

    // ============================================================================
    // SHARED INITIALIZATION
    // ============================================================================

    // Inicializa os jobs recorrentes (apenas uma vez)
    await initJobs();
    console.log('[Worker] ✅ Jobs recorrentes inicializados');

    // Inicializa os agendamentos existentes
    const result = await initializeExistingAgendamentos();
    console.log('[Worker] ✅ Agendamentos existentes carregados');

    console.log('\n' + '='.repeat(70));
    console.log('🎉 WORKERS UNIFICADOS INICIADOS COM SUCESSO!');
    console.log('='.repeat(70));
    console.log('📊 Status dos Workers:');
    console.log('   🔥 Parent Worker       → Filas de alta e baixa prioridade');
    console.log('   🤖 AI Integration      → Processamento de mensagens IA');
    console.log('   📱 Instagram Webhook   → Automação Instagram');
    console.log('   📝 Workers Legados     → Manuscrito, Leads, Tradução');
    console.log('   ⏰ Jobs Recorrentes    → Configurados e ativos');
    console.log('   📊 Queue Management    → Monitorando todas as filas');
    console.log('-'.repeat(70));
    console.log(`📈 Agendamentos:  ${result.count} carregados`);
    console.log('🔗 URLs Úteis:');
    console.log('   Bull UI:       http://localhost:3005');
    console.log('='.repeat(70) + '\n');

    return { success: true, count: result.count };
  } catch (error) {
    console.error('[Worker] ❌ Erro ao inicializar workers:', error);
    return { success: false, error };
  }
}

// Setup graceful shutdown para todos os workers
async function gracefulShutdown(signal: string) {
  console.log(`[Worker] 🛑 Recebido sinal ${signal}, iniciando shutdown graceful...`);

  try {
    // Shutdown queue management first
    console.log('[Worker] Parando sistema de gerenciamento de filas...');
    await shutdownQueueManagement();

    // Parar o worker de automação
    if (instagramWebhookWorker) {
      console.log('[Worker] Parando worker de automação...');
      await instagramWebhookWorker.close();
    }

    console.log('[Worker] 👋 Shutdown concluído com sucesso');
    process.exit(0);
  } catch (error) {
    console.error('[Worker] ❌ Erro durante shutdown:', error);
    process.exit(1);
  }
}

// Registrar handlers para shutdown graceful
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGUSR2', () => gracefulShutdown('SIGUSR2')); // Para nodemon

// Se este arquivo for executado diretamente (não importado)
if (require.main === module) {
  console.log('🚀 Iniciando container unificado de workers...');
  
  initializeWorkers()
    .then((result) => {
      if (result.success) {
        console.log('[Worker] 🎉 Inicialização concluída com sucesso!');
        console.log('[Worker] 🔄 Container de workers rodando e aguardando jobs...');
        
        // Manter o processo vivo
        setInterval(() => {
          console.log('[Worker] 💓 Heartbeat - Todos os workers ativos');
        }, 60000); // Log a cada minuto
      } else {
        console.error('[Worker] ❌ Falha na inicialização:', result.error);
        process.exit(1);
      }
    })
    .catch((error) => {
      console.error('[Worker] ❌ Erro na inicialização:', error);
      process.exit(1);
    });
}