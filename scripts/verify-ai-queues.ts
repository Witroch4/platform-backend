/**
 * Verification script for AI Integration queues
 */

import { initializeQueues, getQueueStats, closeQueues } from '../lib/ai-integration/queues/manager';
import { aiLogger as logger }from '../lib/ai-integration/utils/logger';

async function verifyQueues() {
  try {
    logger.info('🔍 Verifying AI Integration queues...');

    // Initialize queues
    await initializeQueues();
    logger.info('✅ Queues initialized successfully');

    // Get stats
    const stats = await getQueueStats();
    logger.info('📊 Queue stats retrieved', stats);

    // Close queues
    await closeQueues();
    logger.info('🔌 Queues closed successfully');

    logger.info('✅ All queue operations verified successfully');
  } catch (error) {
    console.error('❌ Queue verification failed:', error);
    logger.error('❌ Queue verification failed', { 
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
    process.exit(1);
  }
}

if (require.main === module) {
  verifyQueues();
}