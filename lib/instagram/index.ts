/**
 * Instagram Translation Infrastructure
 * 
 * Main entry point for Instagram message translation system
 */

// Queue Infrastructure
export * from '../queue/instagram-translation.queue';

// Communication Manager
export * from './communication-manager';

// Queue Monitor
export * from './queue-monitor';

// Validation
export * from '../validation/instagram-translation-validation';

// Error Handling
export * from '../error-handling/instagram-translation-errors';

// Re-export commonly used types and functions
export type {
  InstagramTranslationJobData,
  InstagramTranslationResult,
} from '../queue/instagram-translation.queue';

export type {
  QueueHealthStatus,
  PerformanceMetrics,
  HealthAlert,
} from './queue-monitor';

export type {
  WhatsAppTemplate,
  InstagramTemplate,
  ConversionResult,
} from '../validation/instagram-translation-validation';

export {
  InstagramTranslationError,
  InstagramTranslationErrorCodes,
} from '../error-handling/instagram-translation-errors';

// Main initialization function
export async function initializeInstagramTranslationInfrastructure(): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    console.log('[Instagram Translation] Initializing infrastructure...');
    
    // Initialize communication manager
    const { getCommunicationManager } = await import('./communication-manager');
    const commManager = getCommunicationManager();
    
    // Test communication health
    const commHealth = await commManager.getHealthStatus();
    if (!commHealth.subscriber || !commHealth.publisher) {
      throw new Error('Communication manager not healthy');
    }
    
    // Initialize queue monitor
    const { startQueueMonitoring } = await import('./queue-monitor');
    await startQueueMonitoring();
    
    console.log('[Instagram Translation] Infrastructure initialized successfully');
    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Instagram Translation] Failed to initialize infrastructure:', errorMessage);
    return { success: false, error: errorMessage };
  }
}

// Cleanup function
export async function cleanupInstagramTranslationInfrastructure(): Promise<void> {
  try {
    console.log('[Instagram Translation] Cleaning up infrastructure...');
    
    // Stop queue monitoring
    const { stopQueueMonitoring } = await import('./queue-monitor');
    stopQueueMonitoring();
    
    // Cleanup communication manager
    const { cleanupCommunicationManager } = await import('./communication-manager');
    await cleanupCommunicationManager();
    
    console.log('[Instagram Translation] Infrastructure cleanup completed');
  } catch (error) {
    console.error('[Instagram Translation] Cleanup error:', error);
  }
}