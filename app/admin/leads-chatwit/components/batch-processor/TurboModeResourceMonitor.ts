/**
 * TURBO Mode Resource Monitor
 * Implements system resource monitoring and throttling for TURBO mode operations
 * Based on requirement 3.6
 */

import { createLogger } from '@/lib/utils/logger'

const logger = createLogger('TurboModeResourceMonitor')

export interface SystemResources {
  memory: {
    used: number
    total: number
    percentage: number
    available: number
  }
  cpu: {
    usage: number
    loadAverage: number[]
  }
  activeProcesses: {
    count: number
    maxAllowed: number
    percentage: number
  }
  network: {
    activeConnections: number
    bandwidth: number
    latency: number
  }
}

export interface ResourceThresholds {
  memory: {
    warning: number    // 70%
    critical: number   // 85%
    emergency: number  // 95%
  }
  cpu: {
    warning: number    // 70%
    critical: number   // 85%
    emergency: number  // 95%
  }
  activeProcesses: {
    warning: number    // 70%
    critical: number   // 85%
    emergency: number  // 95%
  }
  network: {
    latencyWarning: number     // 500ms
    latencyCritical: number    // 1000ms
    bandwidthWarning: number   // 80%
  }
}

export interface ThrottlingStrategy {
  level: 'none' | 'light' | 'moderate' | 'heavy' | 'emergency'
  maxParallelProcesses: number
  delayBetweenBatches: number
  batchSize: number
  enableResourceChecks: boolean
  pauseProcessing: boolean
}

export interface ResourceMonitorOptions {
  thresholds?: Partial<ResourceThresholds>
  monitoringInterval?: number
  enableAutoThrottling?: boolean
  onResourceWarning?: (resources: SystemResources, level: string) => void
  onThrottlingChange?: (strategy: ThrottlingStrategy) => void
}

export class TurboModeResourceMonitor {
  private thresholds: ResourceThresholds
  private monitoringInterval: number
  private enableAutoThrottling: boolean
  private onResourceWarning?: (resources: SystemResources, level: string) => void
  private onThrottlingChange?: (strategy: ThrottlingStrategy) => void
  
  private monitoringTimer: NodeJS.Timeout | null = null
  private currentResources: SystemResources | null = null
  private currentThrottling: ThrottlingStrategy
  private resourceHistory: SystemResources[] = []
  private isMonitoring: boolean = false
  private activeProcessCount: number = 0
  private maxProcessCount: number = 10

  constructor(options: ResourceMonitorOptions = {}) {
    this.thresholds = {
      memory: {
        warning: 70,
        critical: 85,
        emergency: 95
      },
      cpu: {
        warning: 70,
        critical: 85,
        emergency: 95
      },
      activeProcesses: {
        warning: 70,
        critical: 85,
        emergency: 95
      },
      network: {
        latencyWarning: 500,
        latencyCritical: 1000,
        bandwidthWarning: 80
      },
      ...options.thresholds
    }

    this.monitoringInterval = options.monitoringInterval || 5000 // 5 seconds
    this.enableAutoThrottling = options.enableAutoThrottling ?? true
    this.onResourceWarning = options.onResourceWarning
    this.onThrottlingChange = options.onThrottlingChange

    // Initialize with no throttling
    this.currentThrottling = {
      level: 'none',
      maxParallelProcesses: 10,
      delayBetweenBatches: 500,
      batchSize: 10,
      enableResourceChecks: true,
      pauseProcessing: false
    }
  }

  /**
   * Start resource monitoring
   */
  public startMonitoring(): void {
    if (this.isMonitoring) {
      logger.warn('Resource monitoring is already active')
      return
    }

    logger.info('Starting TURBO mode resource monitoring', {
      interval: this.monitoringInterval,
      autoThrottling: this.enableAutoThrottling
    })

    this.isMonitoring = true
    this.monitoringTimer = setInterval(() => {
      this.checkResources()
    }, this.monitoringInterval)

    // Initial resource check
    this.checkResources()
  }

  /**
   * Stop resource monitoring
   */
  public stopMonitoring(): void {
    if (!this.isMonitoring) {
      return
    }

    logger.info('Stopping TURBO mode resource monitoring')

    this.isMonitoring = false
    
    if (this.monitoringTimer) {
      clearInterval(this.monitoringTimer)
      this.monitoringTimer = null
    }

    // Reset throttling to normal
    this.updateThrottlingStrategy('none')
  }

  /**
   * Check current system resources
   */
  private async checkResources(): Promise<void> {
    try {
      const resources = await this.gatherSystemResources()
      this.currentResources = resources
      
      // Add to history (keep last 20 readings)
      this.resourceHistory.push(resources)
      if (this.resourceHistory.length > 20) {
        this.resourceHistory = this.resourceHistory.slice(-20)
      }

      // Analyze resource levels and adjust throttling if needed
      if (this.enableAutoThrottling) {
        this.analyzeAndAdjustThrottling(resources)
      }

      // Log resource status periodically
      if (this.resourceHistory.length % 6 === 0) { // Every 30 seconds
        logger.debug('Resource status', {
          memory: `${resources.memory.percentage}%`,
          cpu: `${resources.cpu.usage}%`,
          activeProcesses: `${resources.activeProcesses.count}/${resources.activeProcesses.maxAllowed}`,
          throttlingLevel: this.currentThrottling.level
        })
      }

    } catch (error) {
      logger.error('Error checking system resources', { error })
    }
  }

  /**
   * Gather system resource information
   */
  private async gatherSystemResources(): Promise<SystemResources> {
    // Memory information
    const memoryUsage = process.memoryUsage()
    const totalMemory = memoryUsage.heapTotal + memoryUsage.external + memoryUsage.arrayBuffers
    const usedMemory = memoryUsage.heapUsed + memoryUsage.external + memoryUsage.arrayBuffers
    const memoryPercentage = (usedMemory / totalMemory) * 100

    // CPU information (simplified - in a real implementation, you'd use more sophisticated CPU monitoring)
    const cpuUsage = await this.getCPUUsage()
    const loadAverage = this.getLoadAverage()

    // Active processes
    const activeProcesses = {
      count: this.activeProcessCount,
      maxAllowed: this.maxProcessCount,
      percentage: (this.activeProcessCount / this.maxProcessCount) * 100
    }

    // Network information (simplified)
    const network = await this.getNetworkInfo()

    return {
      memory: {
        used: usedMemory,
        total: totalMemory,
        percentage: memoryPercentage,
        available: totalMemory - usedMemory
      },
      cpu: {
        usage: cpuUsage,
        loadAverage
      },
      activeProcesses,
      network
    }
  }

  /**
   * Get CPU usage (simplified implementation)
   */
  private async getCPUUsage(): Promise<number> {
    // In a real implementation, you would use more sophisticated CPU monitoring
    // For now, we'll simulate based on active processes and memory usage
    const processLoad = (this.activeProcessCount / this.maxProcessCount) * 100
    const memoryLoad = this.currentResources?.memory.percentage || 0
    
    // Estimate CPU usage based on process and memory load
    return Math.min(95, (processLoad * 0.6) + (memoryLoad * 0.4))
  }

  /**
   * Get system load average (simplified)
   */
  private getLoadAverage(): number[] {
    // In Node.js, you would use os.loadavg()
    // For browser compatibility, we'll simulate
    const currentLoad = this.activeProcessCount / this.maxProcessCount
    return [currentLoad, currentLoad * 0.9, currentLoad * 0.8]
  }

  /**
   * Get network information (simplified)
   */
  private async getNetworkInfo(): Promise<SystemResources['network']> {
    // Simulate network latency check
    const startTime = Date.now()
    
    try {
      // Simple ping to check latency (in a real implementation, you'd use a proper ping)
      await fetch('/api/health', { 
        method: 'HEAD',
        cache: 'no-cache'
      })
      
      const latency = Date.now() - startTime
      
      return {
        activeConnections: this.activeProcessCount,
        bandwidth: 100, // Simulated bandwidth percentage
        latency
      }
    } catch (error) {
      return {
        activeConnections: this.activeProcessCount,
        bandwidth: 50, // Reduced bandwidth on error
        latency: 2000 // High latency on error
      }
    }
  }

  /**
   * Analyze resources and adjust throttling strategy
   */
  private analyzeAndAdjustThrottling(resources: SystemResources): void {
    const memoryLevel = this.getResourceLevel(resources.memory.percentage, 'memory')
    const cpuLevel = this.getResourceLevel(resources.cpu.usage, 'cpu')
    const processLevel = this.getResourceLevel(resources.activeProcesses.percentage, 'activeProcesses')
    const networkLevel = this.getNetworkLevel(resources.network.latency)

    // Determine the highest alert level
    const levels = [memoryLevel, cpuLevel, processLevel, networkLevel]
    const highestLevel = this.getHighestLevel(levels)

    // Update throttling strategy based on the highest level
    if (highestLevel !== this.currentThrottling.level) {
      this.updateThrottlingStrategy(highestLevel)
      
      // Notify about resource warnings
      if (this.onResourceWarning && highestLevel !== 'none') {
        this.onResourceWarning(resources, highestLevel)
      }
    }
  }

  /**
   * Get resource level based on thresholds
   */
  private getResourceLevel(percentage: number, type: 'memory' | 'cpu' | 'activeProcesses'): ThrottlingStrategy['level'] {
    const thresholds = this.thresholds[type]
    
    if (percentage >= thresholds.emergency) {
      return 'emergency'
    } else if (percentage >= thresholds.critical) {
      return 'heavy'
    } else if (percentage >= thresholds.warning) {
      return 'moderate'
    } else if (percentage >= 50) {
      return 'light'
    } else {
      return 'none'
    }
  }

  /**
   * Get network level based on latency
   */
  private getNetworkLevel(latency: number): ThrottlingStrategy['level'] {
    if (latency >= this.thresholds.network.latencyCritical) {
      return 'heavy'
    } else if (latency >= this.thresholds.network.latencyWarning) {
      return 'moderate'
    } else {
      return 'none'
    }
  }

  /**
   * Get the highest alert level from an array of levels
   */
  private getHighestLevel(levels: ThrottlingStrategy['level'][]): ThrottlingStrategy['level'] {
    const levelPriority = {
      'none': 0,
      'light': 1,
      'moderate': 2,
      'heavy': 3,
      'emergency': 4
    }

    return levels.reduce((highest, current) => 
      levelPriority[current] > levelPriority[highest] ? current : highest
    , 'none')
  }

  /**
   * Update throttling strategy
   */
  private updateThrottlingStrategy(level: ThrottlingStrategy['level']): void {
    const previousLevel = this.currentThrottling.level
    
    switch (level) {
      case 'none':
        this.currentThrottling = {
          level: 'none',
          maxParallelProcesses: 10,
          delayBetweenBatches: 500,
          batchSize: 10,
          enableResourceChecks: true,
          pauseProcessing: false
        }
        break

      case 'light':
        this.currentThrottling = {
          level: 'light',
          maxParallelProcesses: 8,
          delayBetweenBatches: 750,
          batchSize: 8,
          enableResourceChecks: true,
          pauseProcessing: false
        }
        break

      case 'moderate':
        this.currentThrottling = {
          level: 'moderate',
          maxParallelProcesses: 5,
          delayBetweenBatches: 1000,
          batchSize: 5,
          enableResourceChecks: true,
          pauseProcessing: false
        }
        break

      case 'heavy':
        this.currentThrottling = {
          level: 'heavy',
          maxParallelProcesses: 2,
          delayBetweenBatches: 2000,
          batchSize: 2,
          enableResourceChecks: true,
          pauseProcessing: false
        }
        break

      case 'emergency':
        this.currentThrottling = {
          level: 'emergency',
          maxParallelProcesses: 1,
          delayBetweenBatches: 5000,
          batchSize: 1,
          enableResourceChecks: true,
          pauseProcessing: true
        }
        break
    }

    if (previousLevel !== level) {
      logger.info('Throttling strategy updated', {
        previousLevel,
        newLevel: level,
        maxParallelProcesses: this.currentThrottling.maxParallelProcesses,
        delayBetweenBatches: this.currentThrottling.delayBetweenBatches
      })

      // Notify about throttling changes
      if (this.onThrottlingChange) {
        this.onThrottlingChange(this.currentThrottling)
      }
    }
  }

  /**
   * Public methods for process tracking
   */
  public registerActiveProcess(): void {
    this.activeProcessCount++
    logger.debug('Process registered', {
      activeCount: this.activeProcessCount,
      maxAllowed: this.maxProcessCount
    })
  }

  public unregisterActiveProcess(): void {
    if (this.activeProcessCount > 0) {
      this.activeProcessCount--
      logger.debug('Process unregistered', {
        activeCount: this.activeProcessCount,
        maxAllowed: this.maxProcessCount
      })
    }
  }

  public setMaxProcessCount(count: number): void {
    this.maxProcessCount = count
    logger.info('Max process count updated', { maxProcessCount: count })
  }

  /**
   * Public getters
   */
  public getCurrentResources(): SystemResources | null {
    return this.currentResources
  }

  public getCurrentThrottling(): ThrottlingStrategy {
    return { ...this.currentThrottling }
  }

  public getResourceHistory(): SystemResources[] {
    return [...this.resourceHistory]
  }

  public isResourceConstrained(): boolean {
    return this.currentThrottling.level !== 'none'
  }

  public shouldPauseProcessing(): boolean {
    return this.currentThrottling.pauseProcessing
  }

  /**
   * Check if resources are available for new processes
   */
  public canStartNewProcess(): boolean {
    if (this.shouldPauseProcessing()) {
      return false
    }

    if (this.activeProcessCount >= this.currentThrottling.maxParallelProcesses) {
      return false
    }

    return true
  }

  /**
   * Get recommended delay before starting next batch
   */
  public getRecommendedDelay(): number {
    return this.currentThrottling.delayBetweenBatches
  }

  /**
   * Get recommended batch size
   */
  public getRecommendedBatchSize(): number {
    return this.currentThrottling.batchSize
  }

  /**
   * Force throttling level (for testing or manual control)
   */
  public forceThrottlingLevel(level: ThrottlingStrategy['level']): void {
    logger.info('Forcing throttling level', { level })
    this.updateThrottlingStrategy(level)
  }

  /**
   * Get health status
   */
  public getHealthStatus(): {
    healthy: boolean
    level: string
    issues: string[]
    recommendations: string[]
  } {
    const issues: string[] = []
    const recommendations: string[] = []

    if (!this.currentResources) {
      return {
        healthy: false,
        level: 'unknown',
        issues: ['No resource data available'],
        recommendations: ['Start resource monitoring']
      }
    }

    const resources = this.currentResources

    // Check memory
    if (resources.memory.percentage >= this.thresholds.memory.critical) {
      issues.push(`High memory usage: ${Math.round(resources.memory.percentage)}%`)
      recommendations.push('Consider reducing batch size or parallel processes')
    }

    // Check CPU
    if (resources.cpu.usage >= this.thresholds.cpu.critical) {
      issues.push(`High CPU usage: ${Math.round(resources.cpu.usage)}%`)
      recommendations.push('Increase delays between batches')
    }

    // Check active processes
    if (resources.activeProcesses.percentage >= this.thresholds.activeProcesses.critical) {
      issues.push(`Too many active processes: ${resources.activeProcesses.count}/${resources.activeProcesses.maxAllowed}`)
      recommendations.push('Wait for current processes to complete')
    }

    // Check network
    if (resources.network.latency >= this.thresholds.network.latencyCritical) {
      issues.push(`High network latency: ${resources.network.latency}ms`)
      recommendations.push('Check network connectivity')
    }

    return {
      healthy: issues.length === 0,
      level: this.currentThrottling.level,
      issues,
      recommendations
    }
  }
}