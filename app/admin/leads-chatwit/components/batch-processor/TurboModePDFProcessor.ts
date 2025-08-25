/**
 * TURBO Mode PDF Processor
 * Handles parallel PDF unification for multiple leads simultaneously
 * Based on requirements 2.1, 2.6
 */

import type { ExtendedLead } from '../../types'
import type { TurboModeConfig } from './useTurboMode'
import { createLogger } from '@/lib/utils/logger'
import { TurboModeErrorHandler } from './TurboModeErrorHandler'
import { TurboModeResourceMonitor } from './TurboModeResourceMonitor'
import { TurboModeQueueManager } from './TurboModeQueueManager'

const log = createLogger('TurboModePDFProcessor')

export interface ParallelProcessingResult {
  leadId: string
  success: boolean
  processingTime: number
  error?: string
}

export interface TurboModePDFProcessorOptions {
  config: TurboModeConfig
  onProgress?: (leadId: string, progress: number) => void
  onComplete?: (leadId: string, result: ParallelProcessingResult) => void
  onError?: (leadId: string, error: Error) => void
  errorHandler?: TurboModeErrorHandler
  resourceMonitor?: TurboModeResourceMonitor
  queueManager?: TurboModeQueueManager
}

export class TurboModePDFProcessor {
  private config: TurboModeConfig
  private onProgress?: (leadId: string, progress: number) => void
  private onComplete?: (leadId: string, result: ParallelProcessingResult) => void
  private onError?: (leadId: string, error: Error) => void
  private activeProcesses: Map<string, AbortController> = new Map()
  private errorHandler?: TurboModeErrorHandler
  private resourceMonitor?: TurboModeResourceMonitor
  private queueManager?: TurboModeQueueManager

  constructor(options: TurboModePDFProcessorOptions) {
    this.config = options.config
    this.onProgress = options.onProgress
    this.onComplete = options.onComplete
    this.onError = options.onError
    this.errorHandler = options.errorHandler
    this.resourceMonitor = options.resourceMonitor
    this.queueManager = options.queueManager
  }

  /**
   * Process multiple leads in parallel for PDF unification
   */
  async processLeadsInParallel(leads: ExtendedLead[]): Promise<ParallelProcessingResult[]> {
    const startTime = Date.now()
    
    log.info('Starting TURBO mode PDF unification', {
      leadCount: leads.length,
      maxParallel: this.config.maxParallelLeads
    })

    try {
      // Check resource availability before starting
      if (this.resourceMonitor) {
        const canStart = this.resourceMonitor.canStartNewProcess()
        if (!canStart) {
          log.warn('Cannot start PDF processing due to resource constraints')
          
          if (this.errorHandler) {
            return await this.errorHandler.handleResourceExhaustionError(leads, 'concurrent_processes')
          }
          
          throw new Error('Resource constraints prevent PDF processing')
        }
      }

      // Use queue manager if available
      if (this.queueManager) {
        return await this.processLeadsWithQueue(leads)
      }

      // Get current throttling recommendations
      const maxParallel = this.resourceMonitor?.getCurrentThrottling().maxParallelProcesses || this.config.maxParallelLeads
      const batchDelay = this.resourceMonitor?.getRecommendedDelay() || 500

      // Split leads into batches based on current resource constraints
      const batches = this.createBatches(leads, maxParallel)
      const allResults: ParallelProcessingResult[] = []

      // Process each batch
      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batch = batches[batchIndex]
        
        // Check if we should pause processing
        if (this.resourceMonitor?.shouldPauseProcessing()) {
          log.warn('Pausing PDF processing due to resource constraints')
          await this.waitForResourceAvailability()
        }
        
        log.info(`Processing PDF batch ${batchIndex + 1}/${batches.length}`, {
          batchSize: batch.length,
          leadIds: batch.map(l => l.id),
          resourceLevel: this.resourceMonitor?.getCurrentThrottling().level || 'unknown'
        })

        // Process batch in parallel
        const batchResults = await this.processBatch(batch)
        allResults.push(...batchResults)

        // Apply resource-aware delay between batches
        if (batchIndex < batches.length - 1) {
          await this.delay(batchDelay)
        }
      }

      const totalTime = Date.now() - startTime
      const successCount = allResults.filter(r => r.success).length
      
      log.info('TURBO mode PDF unification completed', {
        totalLeads: leads.length,
        successCount,
        failureCount: allResults.length - successCount,
        totalTime,
        averageTimePerLead: totalTime / leads.length
      })

      return allResults

    } catch (error) {
      log.error('Error in TURBO mode PDF processing', { error })
      
      // Use error handler if available
      if (this.errorHandler) {
        return await this.errorHandler.handleParallelProcessingError(
          error instanceof Error ? error : new Error('Unknown error'),
          leads.map(l => l.id),
          leads
        )
      }
      
      if (this.config.fallbackOnError) {
        log.info('Falling back to sequential PDF processing')
        return await this.processLeadsSequentially(leads)
      }
      
      throw error
    }
  }

  /**
   * Process a batch of leads in parallel
   */
  private async processBatch(leads: ExtendedLead[]): Promise<ParallelProcessingResult[]> {
    const promises = leads.map(lead => this.processLead(lead))
    
    try {
      // Use Promise.allSettled to handle individual failures
      const results = await Promise.allSettled(promises)
      
      return results.map((result, index) => {
        const lead = leads[index]
        
        if (result.status === 'fulfilled') {
          return result.value
        } else {
          const error = result.reason instanceof Error ? result.reason.message : 'Unknown error'
          log.error(`PDF processing failed for lead ${lead.id}`, { error })
          
          if (this.onError) {
            this.onError(lead.id, result.reason)
          }
          
          return {
            leadId: lead.id,
            success: false,
            processingTime: 0,
            error
          }
        }
      })
    } catch (error) {
      log.error('Batch processing failed', { error })
      throw error
    }
  }

  /**
   * Process a single lead for PDF unification
   */
  private async processLead(lead: ExtendedLead): Promise<ParallelProcessingResult> {
    const startTime = Date.now()
    const abortController = new AbortController()
    
    // Track active process
    this.activeProcesses.set(lead.id, abortController)
    this.registerProcess()
    
    try {
      log.debug(`Starting PDF unification for lead ${lead.id}`)
      
      if (this.onProgress) {
        this.onProgress(lead.id, 0)
      }

      // Make API call to unify PDF
      const response = await fetch('/api/admin/leads-chatwit/unify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ leadId: lead.id }),
        signal: abortController.signal
      })

      if (this.onProgress) {
        this.onProgress(lead.id, 50)
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(`HTTP ${response.status}: ${errorData.error || response.statusText}`)
      }

      const result = await response.json()
      const processingTime = Date.now() - startTime

      if (this.onProgress) {
        this.onProgress(lead.id, 100)
      }

      const processResult: ParallelProcessingResult = {
        leadId: lead.id,
        success: true,
        processingTime
      }

      if (this.onComplete) {
        this.onComplete(lead.id, processResult)
      }

      log.debug(`PDF unification completed for lead ${lead.id}`, {
        processingTime,
        success: true
      })

      return processResult

    } catch (error) {
      const processingTime = Date.now() - startTime
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      
      log.error(`PDF unification failed for lead ${lead.id}`, {
        error: errorMessage,
        processingTime
      })

      const processResult: ParallelProcessingResult = {
        leadId: lead.id,
        success: false,
        processingTime,
        error: errorMessage
      }

      if (this.onError) {
        this.onError(lead.id, error instanceof Error ? error : new Error(errorMessage))
      }

      return processResult

    } finally {
      // Clean up active process tracking
      this.activeProcesses.delete(lead.id)
      this.unregisterProcess()
    }
  }

  /**
   * Fallback to sequential processing
   */
  private async processLeadsSequentially(leads: ExtendedLead[]): Promise<ParallelProcessingResult[]> {
    log.info('Processing leads sequentially as fallback')
    
    const results: ParallelProcessingResult[] = []
    
    for (const lead of leads) {
      try {
        const result = await this.processLead(lead)
        results.push(result)
        
        // Small delay between sequential processes
        await this.delay(100)
      } catch (error) {
        results.push({
          leadId: lead.id,
          success: false,
          processingTime: 0,
          error: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    }
    
    return results
  }

  /**
   * Create batches of leads for parallel processing
   */
  private createBatches<T>(items: T[], batchSize: number): T[][] {
    const batches: T[][] = []
    
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize))
    }
    
    return batches
  }

  /**
   * Utility delay function
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  /**
   * Cancel all active processes
   */
  public cancelAllProcesses(): void {
    log.info('Cancelling all active PDF processes', {
      activeCount: this.activeProcesses.size
    })
    
    this.activeProcesses.forEach((controller, leadId) => {
      controller.abort()
      log.debug(`Cancelled PDF process for lead ${leadId}`)
    })
    
    this.activeProcesses.clear()
  }

  /**
   * Cancel a specific process
   */
  public cancelProcess(leadId: string): void {
    const controller = this.activeProcesses.get(leadId)
    if (controller) {
      controller.abort()
      this.activeProcesses.delete(leadId)
      log.debug(`Cancelled PDF process for lead ${leadId}`)
    }
  }

  /**
   * Get active process count
   */
  public getActiveProcessCount(): number {
    return this.activeProcesses.size
  }

  /**
   * Get active process lead IDs
   */
  public getActiveProcessLeadIds(): string[] {
    return Array.from(this.activeProcesses.keys())
  }

  /**
   * Process leads using queue manager
   */
  private async processLeadsWithQueue(leads: ExtendedLead[]): Promise<ParallelProcessingResult[]> {
    if (!this.queueManager) {
      throw new Error('Queue manager not available')
    }

    log.info('Processing leads with queue manager', {
      leadCount: leads.length
    })

    const results: ParallelProcessingResult[] = []
    const taskIds: string[] = []

    // Add all leads to queue
    for (const lead of leads) {
      try {
        const taskId = this.queueManager.addTask(lead, 'pdf_unification', 'normal')
        taskIds.push(taskId)
      } catch (error) {
        log.error('Failed to add lead to queue', {
          leadId: lead.id,
          error: error instanceof Error ? error.message : 'Unknown error'
        })
        
        results.push({
          leadId: lead.id,
          success: false,
          processingTime: 0,
          error: 'Failed to queue task'
        })
      }
    }

    // Wait for all tasks to complete
    return await this.waitForQueuedTasks(taskIds)
  }

  /**
   * Wait for queued tasks to complete
   */
  private async waitForQueuedTasks(taskIds: string[]): Promise<ParallelProcessingResult[]> {
    const results: ParallelProcessingResult[] = []
    const maxWaitTime = 300000 // 5 minutes
    const checkInterval = 1000 // 1 second
    const startTime = Date.now()

    while (results.length < taskIds.length && (Date.now() - startTime) < maxWaitTime) {
      for (const taskId of taskIds) {
        if (results.some(r => r.leadId === taskId)) {
          continue // Already processed
        }

        const task = this.queueManager?.getTask(taskId)
        if (!task) {
          continue
        }

        // Check if task is completed or failed
        const stats = this.queueManager?.getStats()
        if (stats) {
          // This is a simplified check - in a real implementation,
          // you would track individual task completion
          const isCompleted = !this.queueManager?.getQueueStatus('pdf_unification').processing
          
          if (isCompleted) {
            results.push({
              leadId: task.leadId,
              success: task.lastError ? false : true,
              processingTime: Date.now() - task.createdAt.getTime(),
              error: task.lastError
            })
          }
        }
      }

      if (results.length < taskIds.length) {
        await this.delay(checkInterval)
      }
    }

    // Handle any remaining tasks that didn't complete
    for (const taskId of taskIds) {
      if (!results.some(r => r.leadId === taskId)) {
        const task = this.queueManager?.getTask(taskId)
        results.push({
          leadId: task?.leadId || taskId,
          success: false,
          processingTime: maxWaitTime,
          error: 'Task timeout'
        })
      }
    }

    return results
  }

  /**
   * Wait for resource availability
   */
  private async waitForResourceAvailability(): Promise<void> {
    if (!this.resourceMonitor) {
      return
    }

    const maxWaitTime = 60000 // 1 minute
    const checkInterval = 5000 // 5 seconds
    const startTime = Date.now()

    log.info('Waiting for resource availability')

    while ((Date.now() - startTime) < maxWaitTime) {
      if (!this.resourceMonitor.shouldPauseProcessing()) {
        log.info('Resources available, resuming processing')
        return
      }

      await this.delay(checkInterval)
    }

    log.warn('Resource wait timeout, proceeding with caution')
  }

  /**
   * Register process with resource monitor
   */
  private registerProcess(): void {
    if (this.resourceMonitor) {
      this.resourceMonitor.registerActiveProcess()
    }
  }

  /**
   * Unregister process with resource monitor
   */
  private unregisterProcess(): void {
    if (this.resourceMonitor) {
      this.resourceMonitor.unregisterActiveProcess()
    }
  }
}