/**
 * AI Integration Worker Startup Script
 * Requirements: 7.1, 7.2, 7.3
 */

import { initializeWorkers, setupGracefulShutdown } from '../lib/ai-integration/workers';
import { aiLogger as logger }from '../lib/ai-integration/utils/logger';

async function startWorkers() {
  try {
    logger.info('🚀 Starting AI Integration workers...');

    // Setup graceful shutdown handlers
    setupGracefulShutdown();

    // Initialize all workers
    await initializeWorkers();

    logger.info('✅ AI Integration workers started successfully');
    
    // Keep the process alive
    process.on('SIGINT', () => {
      logger.info('👋 AI Integration workers shutting down...');
    });

  } catch (error) {
    logger.error('❌ Failed to start AI Integration workers', { error: String(error) });
    process.exit(1);
  }
}

// Start workers if this file is run directly
if (require.main === module) {
  startWorkers();
}

export { startWorkers };