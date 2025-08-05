/**
 * Worker Manager for AI Integration
 * Requirements: 7.1, 7.2, 7.3
 */

import { 
  initializeAiMessageWorker, 
  closeAiMessageWorker,
  getAiMessageWorker 
} from './ai-message-worker';
import { 
  initializeEmbeddingUpsertWorker, 
  closeEmbeddingUpsertWorker,
  getEmbeddingUpsertWorker 
} from './embedding-upsert-worker';
import { initializeQueues, closeQueues } from '../queues/manager';
import { aiLogger as logger }from '../utils/logger';

// Track initialization state
let workersInitialized = false;

/**
 * Initialize all workers and queues
 */
export async function initializeWorkers(): Promise<void> {
  if (workersInitialized) {
    logger.warn('Workers already initialized, skipping...');
    return;
  }

  try {
    logger.info('🚀 Initializing AI Integration workers...');

    // Initialize queues first
    await initializeQueues();

    // Initialize workers
    initializeAiMessageWorker();
    initializeEmbeddingUpsertWorker();

    workersInitialized = true;

    logger.info('✅ All AI Integration workers initialized successfully');
  } catch (error) {
    logger.error('❌ Failed to initialize workers', { error: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}

/**
 * Close all workers and queues
 */
export async function closeWorkers(): Promise<void> {
  if (!workersInitialized) {
    logger.warn('Workers not initialized, nothing to close');
    return;
  }

  try {
    logger.info('🔌 Closing AI Integration workers...');

    // Close workers
    await Promise.all([
      closeAiMessageWorker(),
      closeEmbeddingUpsertWorker(),
    ]);

    // Close queues
    await closeQueues();

    workersInitialized = false;

    logger.info('✅ All AI Integration workers closed successfully');
  } catch (error) {
    logger.error('❌ Failed to close workers', { error: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}

/**
 * Get worker health status
 */
export function getWorkerHealth() {
  const aiMessageWorker = getAiMessageWorker();
  const embeddingUpsertWorker = getEmbeddingUpsertWorker();

  return {
    initialized: workersInitialized,
    workers: {
      aiMessage: {
        active: aiMessageWorker !== null,
        isRunning: aiMessageWorker?.isRunning() ?? false,
      },
      embeddingUpsert: {
        active: embeddingUpsertWorker !== null,
        isRunning: embeddingUpsertWorker?.isRunning() ?? false,
      },
    },
  };
}

/**
 * Setup graceful shutdown handlers
 */
export function setupGracefulShutdown(): void {
  const shutdown = async (signal: string) => {
    logger.info(`🛑 Received ${signal}, shutting down workers gracefully...`);
    
    try {
      await closeWorkers();
      process.exit(0);
    } catch (error) {
      logger.error('❌ Error during graceful shutdown', { error: error instanceof Error ? error.message : String(error) });
      process.exit(1);
    }
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  
  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    logger.error('❌ Uncaught exception', { error: error.message });
    shutdown('uncaughtException');
  });

  process.on('unhandledRejection', (reason, promise) => {
    logger.error('❌ Unhandled rejection', { error: reason instanceof Error ? reason.message : String(reason) });
    shutdown('unhandledRejection');
  });
}

// Export individual worker functions for direct access
export {
  initializeAiMessageWorker,
  closeAiMessageWorker,
  getAiMessageWorker,
  initializeEmbeddingUpsertWorker,
  closeEmbeddingUpsertWorker,
  getEmbeddingUpsertWorker,
};