/**
 * TURBO Mode Image Generator
 * Handles parallel image generation from unified PDFs for multiple leads simultaneously
 * Based on requirements 2.2, 2.6
 */

import type { ExtendedLead } from '../../types'
import type { TurboModeConfig } from './useTurboMode'
import type { ParallelProcessingResult } from './TurboModePDFProcessor'
import { createLogger } from '@/lib/utils/logger'
import { TurboModeErrorHandler } from './TurboModeErrorHandler'

const log = createLogger('TurboModeImageGenerator')

export interface TurboModeImageGeneratorOptions {
  config: TurboModeConfig
  onProgress?: (leadId: string, progress: number) => void
  onComplete?: (leadId: string, result: ParallelProcessingResult) => void
  onError?: (leadId: string, error: Error) => void
  errorHandler?: TurboModeErrorHandler
}

export class TurboModeImageGenerator {
  private config: TurboModeConfig
  private onProgress?: (leadId: string, progress: number) => void
  private onComplete?: (leadId: string, result: ParallelProcessingResult) => void
  private onError?: (leadId: string, error: Error) => void
  private activeProcesses: Map<string, AbortController> = new Map()
  private resourceMonitor: NodeJS.Timeout | null = null
  private errorHandler?: TurboModeErrorHandler

  constructor(options: TurboModeImageGeneratorOptions) {
    this.config = options.config
    this.onProgress = options.onProgress
    this.onComplete = options.onComplete
    this.onError = options.onError
    this.errorHandler = options.errorHandler
  }

  /**
   * Process multiple leads in parallel for image generation
   */
  async generateImagesInParallel(leads: ExtendedLead[]): Promise<ParallelProcessingResult[]> {
    const startTime = Date.now()
    
    log.info('Starting TURBO mode image generation', {
      leadCount: leads.length,
      maxParallel: this.config.maxParallelLeads
    })

    try {
      // Start resource monitoring
      this.startResourceMonitoring()

      // Split leads into batches based on max parallel limit
      const batches = this.createBatches(leads, this.config.maxParallelLeads)
      const allResults: ParallelProcessingResult[] = []

      // Process each batch
      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batch = batches[batchIndex]
        
        log.info(`Processing image generation batch ${batchIndex + 1}/${batches.length}`, {
          batchSize: batch.length,
          leadIds: batch.map(l => l.id)
        })

        // Check system resources before processing batch
        const resourceCheck = await this.checkSystemResources()
        if (!resourceCheck.available) {
          log.warn('System resources constrained, reducing batch size', {
            reason: resourceCheck.reason
          })
          
          // Process with reduced parallelism
          const reducedBatches = this.createBatches(batch, Math.max(1, Math.floor(this.config.maxParallelLeads / 2)))
          for (const reducedBatch of reducedBatches) {
            const batchResults = await this.processBatch(reducedBatch)
            allResults.push(...batchResults)
            await this.delay(1000) // Longer delay when resources are constrained
          }
        } else {
          // Process batch normally
          const batchResults = await this.processBatch(batch)
          allResults.push(...batchResults)
        }

        // Delay between batches to prevent overwhelming the system
        if (batchIndex < batches.length - 1) {
          await this.delay(750) // Slightly longer delay for image processing
        }
      }

      const totalTime = Date.now() - startTime
      const successCount = allResults.filter(r => r.success).length
      
      log.info('TURBO mode image generation completed', {
        totalLeads: leads.length,
        successCount,
        failureCount: allResults.length - successCount,
        totalTime,
        averageTimePerLead: totalTime / leads.length
      })

      return allResults

    } catch (error) {
      log.error('Error in TURBO mode image generation', { error })
      
      // Use error handler if available
      if (this.errorHandler) {
        return await this.errorHandler.handleParallelProcessingError(
          error instanceof Error ? error : new Error('Unknown error'),
          leads.map(l => l.id),
          leads
        )
      }
      
      if (this.config.fallbackOnError) {
        log.info('Falling back to sequential image generation')
        return await this.generateImagesSequentially(leads)
      }
      
      throw error

    } finally {
      // Stop resource monitoring
      this.stopResourceMonitoring()
    }
  }

  /**
   * Process a batch of leads in parallel for image generation
   */
  private async processBatch(leads: ExtendedLead[]): Promise<ParallelProcessingResult[]> {
    const promises = leads.map(lead => this.generateImagesForLead(lead))
    
    try {
      // Use Promise.allSettled to handle individual failures
      const results = await Promise.allSettled(promises)
      
      return results.map((result, index) => {
        const lead = leads[index]
        
        if (result.status === 'fulfilled') {
          return result.value
        } else {
          const error = result.reason instanceof Error ? result.reason.message : 'Unknown error'
          log.error(`Image generation failed for lead ${lead.id}`, { error })
          
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
      log.error('Image generation batch processing failed', { error })
      throw error
    }
  }

  /**
   * Generate images for a single lead
   */
  private async generateImagesForLead(lead: ExtendedLead): Promise<ParallelProcessingResult> {
    const startTime = Date.now()
    const abortController = new AbortController()
    
    // Track active process
    this.activeProcesses.set(lead.id, abortController)
    
    try {
      log.debug(`Starting image generation for lead ${lead.id}`)
      
      if (this.onProgress) {
        this.onProgress(lead.id, 0)
      }

      // Make API call to convert PDF to images
      const response = await fetch('/api/admin/leads-chatwit/convert-to-images', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ leadId: lead.id }),
        signal: abortController.signal
      })

      if (this.onProgress) {
        this.onProgress(lead.id, 30)
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(`HTTP ${response.status}: ${errorData.error || response.statusText}`)
      }

      if (this.onProgress) {
        this.onProgress(lead.id, 70)
      }

      const result = await response.json()
      
      // Wait a bit for the images to be fully processed
      await this.delay(1000)
      
      if (this.onProgress) {
        this.onProgress(lead.id, 100)
      }

      const processingTime = Date.now() - startTime

      const processResult: ParallelProcessingResult = {
        leadId: lead.id,
        success: true,
        processingTime
      }

      if (this.onComplete) {
        this.onComplete(lead.id, processResult)
      }

      log.debug(`Image generation completed for lead ${lead.id}`, {
        processingTime,
        success: true
      })

      return processResult

    } catch (error) {
      const processingTime = Date.now() - startTime
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      
      log.error(`Image generation failed for lead ${lead.id}`, {
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
    }
  }

  /**
   * Fallback to sequential image generation
   */
  private async generateImagesSequentially(leads: ExtendedLead[]): Promise<ParallelProcessingResult[]> {
    log.info('Processing image generation sequentially as fallback')
    
    const results: ParallelProcessingResult[] = []
    
    for (const lead of leads) {
      try {
        const result = await this.generateImagesForLead(lead)
        results.push(result)
        
        // Longer delay between sequential image processes
        await this.delay(500)
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
   * Check system resources to prevent overload
   */
  private async checkSystemResources(): Promise<{ available: boolean; reason: string }> {
    try {
      // Check memory usage
      const memoryUsage = process.memoryUsage()
      const memoryUsagePercent = (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100
      
      if (memoryUsagePercent > this.config.resourceThreshold) {
        return {
          available: false,
          reason: `Memory usage too high: ${Math.round(memoryUsagePercent)}%`
        }
      }

      // Check active processes
      if (this.activeProcesses.size >= this.config.maxParallelLeads) {
        return {
          available: false,
          reason: `Maximum parallel processes reached: ${this.activeProcesses.size}`
        }
      }

      return {
        available: true,
        reason: 'Resources available'
      }
    } catch (error) {
      log.error('Error checking system resources', { error })
      return {
        available: false,
        reason: 'Error checking resources'
      }
    }
  }

  /**
   * Start monitoring system resources
   */
  private startResourceMonitoring(): void {
    if (this.resourceMonitor) {
      return
    }

    this.resourceMonitor = setInterval(async () => {
      const resourceCheck = await this.checkSystemResources()
      
      if (!resourceCheck.available && this.activeProcesses.size > 0) {
        log.warn('System resources constrained during image generation', {
          reason: resourceCheck.reason,
          activeProcesses: this.activeProcesses.size
        })
      }
    }, 5000) // Check every 5 seconds
  }

  /**
   * Stop monitoring system resources
   */
  private stopResourceMonitoring(): void {
    if (this.resourceMonitor) {
      clearInterval(this.resourceMonitor)
      this.resourceMonitor = null
    }
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
    log.info('Cancelling all active image generation processes', {
      activeCount: this.activeProcesses.size
    })
    
    this.activeProcesses.forEach((controller, leadId) => {
      controller.abort()
      log.debug(`Cancelled image generation process for lead ${leadId}`)
    })
    
    this.activeProcesses.clear()
    this.stopResourceMonitoring()
  }

  /**
   * Cancel a specific process
   */
  public cancelProcess(leadId: string): void {
    const controller = this.activeProcesses.get(leadId)
    if (controller) {
      controller.abort()
      this.activeProcesses.delete(leadId)
      log.debug(`Cancelled image generation process for lead ${leadId}`)
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
}