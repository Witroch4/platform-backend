import { Worker, Job } from 'bullmq';
import { getRedisInstance } from '../../lib/connections';
import { 
  PersistenciaCredenciaisJobData, 
  PERSISTENCIA_CREDENCIAIS_QUEUE_NAME,
  handleJobFailure 
} from '../../lib/queue/persistencia-credenciais.queue';
import { credentialsCache, WhatsAppCredentials } from '../../lib/cache/credentials-cache';
import { prisma } from '../../lib/prisma';
import { LeadSource } from '@prisma/client';
import { UnifiedLeadManager, LeadCreationData } from '../../lib/lead-management';
import { recordWorkerMetrics } from '../../lib/monitoring/application-performance-monitor';
import { performance } from 'perf_hooks';

// Result interface for persistence operations
export interface PersistenciaResult {
  credentialsUpdated: boolean;
  cacheUpdated: boolean;
  leadUpdated: boolean;
  error?: string;
  processingTime: number;
}

// Credentials fallback resolver with loop detection
class CredentialsFallbackResolver {
  private static readonly MAX_FALLBACK_DEPTH = 5;

  static async resolveCredentials(
    inboxId: string,
    visited: Set<string> = new Set()
  ): Promise<WhatsAppCredentials | null> {
    // Protection against infinite loops
    if (visited.has(inboxId) || visited.size >= this.MAX_FALLBACK_DEPTH) {
      console.warn(`[CredentialsFallbackResolver] Fallback loop detected or max depth reached for inbox: ${inboxId}`, {
        visited: Array.from(visited),
        depth: visited.size,
      });
      return null;
    }

    visited.add(inboxId);

    try {
      // First, try to get from cache
      const cached = await credentialsCache.getCredentials(inboxId);
      if (cached) {
        console.log(`[CredentialsFallbackResolver] Found cached credentials for inbox: ${inboxId}`);
        return cached;
      }

      // Get inbox configuration from database
      const inbox = await prisma.chatwitInbox.findFirst({
        where: { inboxId },
        include: {
          usuarioChatwit: {
            include: {
              configuracaoGlobalWhatsApp: true,
            },
          },
          fallbackParaInbox: true,
        },
      });

      if (!inbox) {
        console.warn(`[CredentialsFallbackResolver] Inbox not found: ${inboxId}`);
        return null;
      }

      // Check if inbox has its own credentials
      if (inbox.whatsappApiKey && inbox.phoneNumberId && inbox.whatsappBusinessAccountId) {
        const credentials: WhatsAppCredentials = {
          whatsappApiKey: inbox.whatsappApiKey,
          phoneNumberId: inbox.phoneNumberId,
          businessId: inbox.whatsappBusinessAccountId,
          inboxId,
          source: 'inbox',
          updatedAt: inbox.updatedAt,
        };

        // Cache the credentials
        await credentialsCache.setCredentials(inboxId, credentials);
        
        console.log(`[CredentialsFallbackResolver] Found inbox-specific credentials for: ${inboxId}`);
        return credentials;
      }

      // Try fallback inbox if configured
      if (inbox.fallbackParaInboxId) {
        console.log(`[CredentialsFallbackResolver] Trying fallback inbox: ${inbox.fallbackParaInboxId} for: ${inboxId}`);
        const fallbackCredentials = await this.resolveCredentials(inbox.fallbackParaInboxId, visited);
        
        if (fallbackCredentials) {
          // Update source to indicate it's from fallback
          const credentials: WhatsAppCredentials = {
            ...fallbackCredentials,
            source: 'fallback',
          };

          // Cache the fallback credentials for this inbox
          await credentialsCache.setCredentials(inboxId, credentials);
          
          return credentials;
        }
      }

      // Finally, try global configuration
      if (inbox.usuarioChatwit.configuracaoGlobalWhatsApp) {
        const globalConfig = inbox.usuarioChatwit.configuracaoGlobalWhatsApp;
        const credentials: WhatsAppCredentials = {
          whatsappApiKey: globalConfig.whatsappApiKey,
          phoneNumberId: globalConfig.phoneNumberId,
          businessId: globalConfig.whatsappBusinessAccountId,
          inboxId,
          source: 'global',
          updatedAt: globalConfig.updatedAt,
        };

        // Cache the global credentials
        await credentialsCache.setCredentials(inboxId, credentials);
        
        console.log(`[CredentialsFallbackResolver] Using global credentials for: ${inboxId}`);
        return credentials;
      }

      console.warn(`[CredentialsFallbackResolver] No credentials found for inbox: ${inboxId}`);
      return null;

    } catch (error) {
      console.error(`[CredentialsFallbackResolver] Error resolving credentials for inbox: ${inboxId}`, {
        error: error instanceof Error ? error.message : error,
        visited: Array.from(visited),
      });
      return null;
    }
  }
}

// Lead management using unified model - now using the dedicated service
class LeadManager {
  static async findOrCreateLead(data: {
    contactPhone: string;
    contactSource: string;
    messageId: number;
    accountId: number;
    accountName: string;
    wamid: string;
    inboxId: string;
  }): Promise<{ lead: any; created: boolean }> {
    try {
      const leadCreationData: LeadCreationData = {
        contactPhone: data.contactPhone,
        contactSource: data.contactSource,
        messageId: data.messageId,
        accountId: data.accountId,
        accountName: data.accountName,
        wamid: data.wamid,
        inboxId: data.inboxId,
      };

      return await UnifiedLeadManager.findOrCreateLead(leadCreationData);
    } catch (error) {
      console.error('[LeadManager] Error finding or creating lead:', {
        error: error instanceof Error ? error.message : error,
        data,
      });
      throw error;
    }
  }

  static async enrichLeadData(leadId: string, data: {
    messageId: number;
    accountId: number;
    accountName: string;
    wamid: string;
  }): Promise<void> {
    try {
      await UnifiedLeadManager.updateLeadWithMessageMetadata(leadId, {
        wamid: data.wamid,
        messageId: data.messageId,
        accountId: data.accountId,
        accountName: data.accountName,
      });

      console.log(`[LeadManager] Enriched lead data: ${leadId}`, data);
    } catch (error) {
      console.error(`[LeadManager] Error enriching lead data: ${leadId}`, {
        error: error instanceof Error ? error.message : error,
        data,
      });
    }
  }
}

// Main worker class for data persistence
class PersistenciaWorker {
  private worker: Worker<PersistenciaCredenciaisJobData, PersistenciaResult>;

  constructor() {
    this.worker = new Worker<PersistenciaCredenciaisJobData, PersistenciaResult>(
      PERSISTENCIA_CREDENCIAIS_QUEUE_NAME,
      this.processJob.bind(this),
      {
        connection: getRedisInstance(),
        concurrency: 5, // Process up to 5 jobs concurrently
      }
    );

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.worker.on('completed', (job, result) => {
      console.log(`[PersistenciaWorker] Job completed: ${job.name}`, {
        jobId: job.id,
        correlationId: job.data.data.correlationId,
        result,
      });
    });

    this.worker.on('failed', async (job, error) => {
      if (job) {
        await handleJobFailure(job, error);
      }
    });

    this.worker.on('error', (error) => {
      console.error('[PersistenciaWorker] Worker error:', error);
    });

    console.log('[PersistenciaWorker] Worker initialized and listening for jobs');
  }

  async processJob(job: Job<PersistenciaCredenciaisJobData>): Promise<PersistenciaResult> {
    const startTime = Date.now();
    const { type, data } = job.data;

    console.log(`[PersistenciaWorker] Processing job: ${job.name}`, {
      jobId: job.id,
      type,
      correlationId: data.correlationId,
      inboxId: data.inboxId,
    });

    try {
      switch (type) {
        case 'atualizarCredenciais':
          return await this.processCredentialsUpdate(data);
        
        case 'atualizarLead':
          return await this.processLeadUpdate(data);
        
        case 'batchUpdate':
          return await this.processBatchUpdate(data);
        
        default:
          throw new Error(`Unknown job type: ${type}`);
      }
    } catch (error) {
      const processingTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      console.error(`[PersistenciaWorker] Job failed: ${job.name}`, {
        jobId: job.id,
        correlationId: data.correlationId,
        error: errorMessage,
        processingTime,
      });

      return {
        credentialsUpdated: false,
        cacheUpdated: false,
        leadUpdated: false,
        error: errorMessage,
        processingTime,
      };
    }
  }

  private async processCredentialsUpdate(data: PersistenciaCredenciaisJobData['data']): Promise<PersistenciaResult> {
    const startTime = Date.now();
    let credentialsUpdated = false;
    let cacheUpdated = false;
    let leadUpdated = false;

    try {
      // Check if credentials were recently updated to avoid unnecessary DB writes
      const isRecentlyUpdated = await credentialsCache.isCredentialsUpdated(data.inboxId);
      
      if (!isRecentlyUpdated) {
        // Update credentials in database
        await prisma.chatwitInbox.updateMany({
          where: { inboxId: data.inboxId },
          data: {
            whatsappApiKey: data.whatsappApiKey,
            phoneNumberId: data.phoneNumberId,
            whatsappBusinessAccountId: data.businessId,
            updatedAt: new Date(),
          },
        });

        credentialsUpdated = true;

        // Mark credentials as updated in cache to prevent duplicate updates
        await credentialsCache.markCredentialsUpdated(data.inboxId);
        
        // Use enhanced cache invalidation for related caches
        const { cacheInvalidationManager } = await import('../../lib/cache/credentials-cache');
        await cacheInvalidationManager.invalidateRelatedCaches(data.inboxId);
        
        cacheUpdated = true;

        console.log(`[PersistenciaWorker] Credentials updated for inbox: ${data.inboxId}`);
      } else {
        console.log(`[PersistenciaWorker] Credentials recently updated, skipping DB write for inbox: ${data.inboxId}`);
      }

      // Update or create lead
      const { lead, created } = await LeadManager.findOrCreateLead({
        contactPhone: data.leadData.contactPhone,
        contactSource: data.contactSource,
        messageId: data.leadData.messageId,
        accountId: data.leadData.accountId,
        accountName: data.leadData.accountName,
        wamid: data.leadData.wamid,
        inboxId: data.inboxId,
      });

      if (lead) {
        // Enrich lead data with message metadata
        await LeadManager.enrichLeadData(lead.id, {
          messageId: data.leadData.messageId,
          accountId: data.leadData.accountId,
          accountName: data.leadData.accountName,
          wamid: data.leadData.wamid,
        });

        leadUpdated = true;
        console.log(`[PersistenciaWorker] Lead ${created ? 'created' : 'updated'}: ${lead.id}`);
      }

      const processingTime = Date.now() - startTime;

      return {
        credentialsUpdated,
        cacheUpdated,
        leadUpdated,
        processingTime,
      };

    } catch (error) {
      const processingTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      console.error(`[PersistenciaWorker] Error processing credentials update for inbox: ${data.inboxId}`, {
        error: errorMessage,
        correlationId: data.correlationId,
      });

      return {
        credentialsUpdated,
        cacheUpdated,
        leadUpdated,
        error: errorMessage,
        processingTime,
      };
    }
  }

  private async processLeadUpdate(data: PersistenciaCredenciaisJobData['data']): Promise<PersistenciaResult> {
    const startTime = Date.now();
    let leadUpdated = false;

    try {
      // Update or create lead
      const { lead, created } = await LeadManager.findOrCreateLead({
        contactPhone: data.leadData.contactPhone,
        contactSource: data.contactSource,
        messageId: data.leadData.messageId,
        accountId: data.leadData.accountId,
        accountName: data.leadData.accountName,
        wamid: data.leadData.wamid,
        inboxId: data.inboxId,
      });

      if (lead) {
        // Enrich lead data with message metadata
        await LeadManager.enrichLeadData(lead.id, {
          messageId: data.leadData.messageId,
          accountId: data.leadData.accountId,
          accountName: data.leadData.accountName,
          wamid: data.leadData.wamid,
        });

        leadUpdated = true;
        console.log(`[PersistenciaWorker] Lead ${created ? 'created' : 'updated'}: ${lead.id}`);
      }

      const processingTime = Date.now() - startTime;

      return {
        credentialsUpdated: false,
        cacheUpdated: false,
        leadUpdated,
        processingTime,
      };

    } catch (error) {
      const processingTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      console.error(`[PersistenciaWorker] Error processing lead update:`, {
        error: errorMessage,
        correlationId: data.correlationId,
        contactSource: data.contactSource,
      });

      return {
        credentialsUpdated: false,
        cacheUpdated: false,
        leadUpdated: false,
        error: errorMessage,
        processingTime,
      };
    }
  }

  private async processBatchUpdate(data: PersistenciaCredenciaisJobData['data']): Promise<PersistenciaResult> {
    const startTime = Date.now();
    let credentialsUpdated = false;
    let cacheUpdated = false;
    let leadUpdated = false;
    const errors: string[] = [];

    try {
      if (!data.batchItems || data.batchItems.length === 0) {
        throw new Error('No batch items provided');
      }

      console.log(`[PersistenciaWorker] Processing batch update with ${data.batchItems.length} items`);

      // Process each batch item
      for (const item of data.batchItems) {
        try {
          // Check if credentials were recently updated
          const isRecentlyUpdated = await credentialsCache.isCredentialsUpdated(item.inboxId);
          
          if (!isRecentlyUpdated) {
            // Update credentials in database
            await prisma.chatwitInbox.updateMany({
              where: { inboxId: item.inboxId },
              data: {
                whatsappApiKey: item.credentials.whatsappApiKey,
                phoneNumberId: item.credentials.phoneNumberId,
                whatsappBusinessAccountId: item.credentials.businessId,
                updatedAt: new Date(),
              },
            });

            credentialsUpdated = true;

            // Mark credentials as updated in cache
            await credentialsCache.markCredentialsUpdated(item.inboxId);
            
            // Use enhanced cache invalidation for related caches
            const { cacheInvalidationManager } = await import('../../lib/cache/credentials-cache');
            await cacheInvalidationManager.invalidateRelatedCaches(item.inboxId);
            
            cacheUpdated = true;
          }

          // Process lead data if available
          if (item.leadData) {
            const { lead, created } = await LeadManager.findOrCreateLead({
              contactPhone: item.leadData.contactPhone || '',
              contactSource: item.leadData.contactSource || 'batch',
              messageId: item.leadData.messageId || 0,
              accountId: item.leadData.accountId || 0,
              accountName: item.leadData.accountName || 'batch',
              wamid: item.leadData.wamid || 'batch',
              inboxId: item.inboxId,
            });

            if (lead) {
              leadUpdated = true;
            }
          }

        } catch (itemError) {
          const errorMessage = itemError instanceof Error ? itemError.message : 'Unknown error';
          errors.push(`Item ${item.inboxId}: ${errorMessage}`);
          console.error(`[PersistenciaWorker] Error processing batch item: ${item.inboxId}`, itemError);
        }
      }

      const processingTime = Date.now() - startTime;

      console.log(`[PersistenciaWorker] Batch update completed`, {
        itemsProcessed: data.batchItems.length,
        credentialsUpdated,
        cacheUpdated,
        leadUpdated,
        errors: errors.length,
        processingTime,
      });

      return {
        credentialsUpdated,
        cacheUpdated,
        leadUpdated,
        error: errors.length > 0 ? errors.join('; ') : undefined,
        processingTime,
      };

    } catch (error) {
      const processingTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      console.error(`[PersistenciaWorker] Error processing batch update:`, {
        error: errorMessage,
        correlationId: data.correlationId,
      });

      return {
        credentialsUpdated,
        cacheUpdated,
        leadUpdated,
        error: errorMessage,
        processingTime,
      };
    }
  }

  // Graceful shutdown
  async shutdown(): Promise<void> {
    console.log('[PersistenciaWorker] Shutting down worker...');
    await this.worker.close();
    console.log('[PersistenciaWorker] Worker shut down successfully');
  }
}

// Export the task processing function for Parent Worker delegation
export async function processPersistenciaTask(job: Job<PersistenciaCredenciaisJobData>): Promise<PersistenciaResult> {
  const startTime = performance.now();
  const worker = new PersistenciaWorker();
  
  try {
    const result = await worker.processJob(job);
    
    // Record successful worker metrics
    recordWorkerMetrics({
      jobId: job.id || 'unknown',
      jobType: `persistencia-${job.data.type}`,
      processingTime: performance.now() - startTime,
      queueWaitTime: job.processedOn && job.timestamp ? job.processedOn - job.timestamp : 0,
      success: !result.error,
      error: result.error,
      timestamp: new Date(),
      correlationId: job.data.data.correlationId,
      retryCount: job.attemptsMade || 0,
    });
    
    return result;
  } catch (error) {
    const processingTime = performance.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    // Record failed worker metrics
    recordWorkerMetrics({
      jobId: job.id || 'unknown',
      jobType: `persistencia-${job.data.type}`,
      processingTime,
      queueWaitTime: job.processedOn && job.timestamp ? job.processedOn - job.timestamp : 0,
      success: false,
      error: errorMessage,
      timestamp: new Date(),
      correlationId: job.data.data.correlationId,
      retryCount: job.attemptsMade || 0,
    });
    
    throw error;
  }
}

// Export the worker instance and utility functions
export const persistenciaWorker = new PersistenciaWorker();
export { CredentialsFallbackResolver, LeadManager };

// Graceful shutdown handling
process.on('SIGTERM', async () => {
  console.log('[PersistenciaWorker] Received SIGTERM, shutting down gracefully...');
  await persistenciaWorker.shutdown();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('[PersistenciaWorker] Received SIGINT, shutting down gracefully...');
  await persistenciaWorker.shutdown();
  process.exit(0);
});