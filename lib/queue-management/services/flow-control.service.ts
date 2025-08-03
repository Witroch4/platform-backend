/**
 * Flow Control Service
 * 
 * Manages queue flow control including dynamic prioritization,
 * concurrency control, and rate limiting for optimal performance.
 */

import { EventEmitter } from 'events'
import { Queue, Job } from 'bullmq'
import { getRedisInstance } from '../../../lib/connections'
import { 
  QueueConfig, 
  User,
  RateLimiterConfig 
} from '../../../types/queue-management'
import { 
  CACHE_KEYS, 
  DEFAULTS, 
  ERROR_CODES, 
  EVENT_TYPES 
} from '../constants'
import { 
  QueueManagementError, 
  QueueNotFoundError, 
  ValidationError,
  RateLimitExceededError 
} from '../errors'
import { Logger, measurePerformance } from '../utils/logger'
import { getPermissionManager } from './permission-manager.service'

export interface FlowControlConfig {
  queueName: string
  concurrency: number
  rateLimiter?: RateLimiterConfig
  priorityRules: PriorityRule[]
  autoScaling: AutoScalingConfig
  circuitBreaker: CircuitBreakerConfig
}

export interface PriorityRule {
  id: string
  name: string
  condition: PriorityCondition
  priority: number
  enabled: boolean
}

export interface PriorityCondition {
  type: 'job_type' | 'queue_size' | 'processing_time' | 'custom'
  operator: '==' | '!=' | '>' | '<' | '>=' | '<=' | 'contains' | 'regex'
  value: any
  field?: string
}

export interface AutoScalingConfig {
  enabled: boolean
  minConcurrency: number
  maxConcurrency: number
  scaleUpThreshold: number
  scaleDownThreshold: number
  scaleUpCooldown: number
  scaleDownCooldown: number
}

export interface CircuitBreakerConfig {
  enabled: boolean
  failureThreshold: number
  recoveryTimeout: number
  monitoringWindow: number
}

export interface FlowControlMetrics {
  queueName: string
  currentConcurrency: number
  targetConcurrency: number
  rateLimitStatus: {
    current: number
    limit: number
    resetTime: Date
  }
  circuitBreakerStatus: 'closed' | 'open' | 'half-open'
  priorityDistribution: Record<number, number>
  autoScalingEvents: AutoScalingEvent[]
}

export interface AutoScalingEvent {
  timestamp: Date
  action: 'scale_up' | 'scale_down'
  fromConcurrency: number
  toConcurrency: number
  reason: string
}

/**
 * Flow Control Service Implementation
 */
export class FlowControlService extends EventEmitter {
  private logger: Logger
  private permissionManager = getPermissionManager()
  private redis: ReturnType<typeof getRedisInstance>
  private flowConfigs = new Map<string, FlowControlConfig>()
  private rateLimiters = new Map<string, RateLimiter>()
  private circuitBreakers = new Map<string, CircuitBreaker>()
  private autoScalers = new Map<string, AutoScaler>()
  private monitoringInterval: NodeJS.Timeout | null = null

  constructor() {
    super()
    this.logger = new Logger('FlowControlService')
    this.redis = getRedisInstance()
    this.startMonitoring()
  }

  /**
   * Configure flow control for a queue
   */
  public async configureFlowControl(config: FlowControlConfig, user?: User): Promise<void> {
    try {
      // Validate permissions
      if (user) {
        this.permissionManager.validateQueueOperation(user, 'manage', config.queueName)
      }

      // Validate configuration
      this.validateFlowControlConfig(config)

      // Store configuration
      this.flowConfigs.set(config.queueName, config)

      // Initialize components
      if (config.rateLimiter) {
        this.rateLimiters.set(config.queueName, new RateLimiter(config.rateLimiter, this.redis))
      }

      if (config.circuitBreaker.enabled) {
        this.circuitBreakers.set(config.queueName, new CircuitBreaker(config.circuitBreaker))
      }

      if (config.autoScaling.enabled) {
        this.autoScalers.set(config.queueName, new AutoScaler(config.autoScaling, this.logger))
      }

      // Cache configuration
      await this.cacheFlowControlConfig(config)

      this.logger.info(`Flow control configured for queue: ${config.queueName}`, {
        queueName: config.queueName,
        concurrency: config.concurrency,
        rateLimiter: !!config.rateLimiter,
        priorityRules: config.priorityRules.length,
        autoScaling: config.autoScaling.enabled,
        circuitBreaker: config.circuitBreaker.enabled,
        userId: user?.id
      })

      this.emit(EVENT_TYPES.FLOW_CONTROL_CONFIGURED, {
        queueName: config.queueName,
        config,
        userId: user?.id,
        timestamp: new Date()
      })

    } catch (error) {
      this.logger.error(`Failed to configure flow control for queue ${config.queueName}:`, error, {
        queueName: config.queueName,
        userId: user?.id
      })
      throw new QueueManagementError(
        `Failed to configure flow control: ${error instanceof Error ? (error instanceof Error ? error.message : "Unknown error") : 'Unknown error'}`,
        ERROR_CODES.INTERNAL_ERROR
      )
    }
  }

  /**
   * Apply dynamic priority to a job
   */
  public async applyDynamicPriority(queueName: string, job: Job): Promise<number> {
    try {
      const config = this.flowConfigs.get(queueName)
      if (!config || config.priorityRules.length === 0) {
        return job.opts.priority || 0
      }

      let appliedPriority = job.opts.priority || 0

      // Apply priority rules in order
      for (const rule of config.priorityRules.filter(r => r.enabled)) {
        if (await this.evaluatePriorityCondition(rule.condition, job, queueName)) {
          appliedPriority = rule.priority
          
          this.logger.debug(`Priority rule applied: ${rule.name}`, {
            queueName,
            jobId: job.id,
            ruleName: rule.name,
            originalPriority: job.opts.priority || 0,
            appliedPriority
          })
          
          break // Apply first matching rule
        }
      }

      return appliedPriority
    } catch (error) {
      this.logger.error(`Failed to apply dynamic priority for job ${job.id}:`, error, {
        queueName,
        jobId: job.id
      })
      return job.opts.priority || 0
    }
  }

  /**
   * Check rate limit for queue operations
   */
  public async checkRateLimit(queueName: string, identifier?: string): Promise<boolean> {
    try {
      const rateLimiter = this.rateLimiters.get(queueName)
      if (!rateLimiter) {
        return true // No rate limiting configured
      }

      const key = identifier || queueName
      const result = await rateLimiter.checkLimit(key)

      if (!result.allowed) {
        this.logger.warn(`Rate limit exceeded for queue ${queueName}`, {
          queueName,
          identifier,
          current: result.current,
          limit: result.limit,
          resetTime: result.resetTime
        })

        this.emit(EVENT_TYPES.RATE_LIMIT_EXCEEDED, {
          queueName,
          identifier,
          current: result.current,
          limit: result.limit,
          resetTime: result.resetTime,
          timestamp: new Date()
        })

        throw new RateLimitExceededError(result.limit, result.windowMs, identifier)
      }

      return true
    } catch (error) {
      if (error instanceof RateLimitExceededError) {
        throw error
      }
      this.logger.error(`Failed to check rate limit for queue ${queueName}:`, error, {
        queueName,
        identifier
      })
      return true // Allow on error to avoid blocking
    }
  }

  /**
   * Check circuit breaker status
   */
  public async checkCircuitBreaker(queueName: string): Promise<boolean> {
    try {
      const circuitBreaker = this.circuitBreakers.get(queueName)
      if (!circuitBreaker) {
        return true // No circuit breaker configured
      }

      const isOpen = circuitBreaker.isOpen()
      if (isOpen) {
        this.logger.warn(`Circuit breaker is open for queue ${queueName}`, {
          queueName,
          state: circuitBreaker.getState()
        })

        this.emit(EVENT_TYPES.CIRCUIT_BREAKER_OPENED, {
          queueName,
          state: circuitBreaker.getState(),
          timestamp: new Date()
        })
      }

      return !isOpen
    } catch (error) {
      this.logger.error(`Failed to check circuit breaker for queue ${queueName}:`, error, {
        queueName
      })
      return true // Allow on error
    }
  }

  /**
   * Record circuit breaker success/failure
   */
  public async recordCircuitBreakerResult(queueName: string, success: boolean): Promise<void> {
    try {
      const circuitBreaker = this.circuitBreakers.get(queueName)
      if (!circuitBreaker) {
        return
      }

      if (success) {
        circuitBreaker.recordSuccess()
      } else {
        circuitBreaker.recordFailure()
      }

      // Emit state change events
      const state = circuitBreaker.getState()
      if (state.stateChanged) {
        this.emit(EVENT_TYPES.CIRCUIT_BREAKER_STATE_CHANGED, {
          queueName,
          newState: state.state,
          failures: state.failures,
          timestamp: new Date()
        })
      }
    } catch (error) {
      this.logger.error(`Failed to record circuit breaker result for queue ${queueName}:`, error, {
        queueName,
        success
      })
    }
  }

  /**
   * Get optimal concurrency for a queue
   */
  public async getOptimalConcurrency(queueName: string, currentMetrics: any): Promise<number> {
    const config = this.flowConfigs.get(queueName)
    
    try {
      if (!config) {
        return DEFAULTS.CONCURRENCY || 1
      }

      const autoScaler = this.autoScalers.get(queueName)
      if (!autoScaler) {
        return config.concurrency
      }

      const optimalConcurrency = await autoScaler.calculateOptimalConcurrency(currentMetrics)
      
      if (optimalConcurrency !== config.concurrency) {
        this.logger.info(`Concurrency adjustment recommended for queue ${queueName}`, {
          queueName,
          currentConcurrency: config.concurrency,
          optimalConcurrency,
          metrics: currentMetrics
        })

        this.emit(EVENT_TYPES.CONCURRENCY_ADJUSTMENT_RECOMMENDED, {
          queueName,
          currentConcurrency: config.concurrency,
          optimalConcurrency,
          metrics: currentMetrics,
          timestamp: new Date()
        })
      }

      return optimalConcurrency
    } catch (error) {
      this.logger.error(`Failed to get optimal concurrency for queue ${queueName}:`, error, {
        queueName
      })
      return config?.concurrency || DEFAULTS.CONCURRENCY || 1
    }
  }

  /**
   * Update queue concurrency
   */
  public async updateConcurrency(queueName: string, newConcurrency: number, user?: User): Promise<void> {
    try {
      // Validate permissions
      if (user) {
        this.permissionManager.validateQueueOperation(user, 'manage', queueName)
      }

      const config = this.flowConfigs.get(queueName)
      if (!config) {
        throw new QueueNotFoundError(queueName)
      }

      const oldConcurrency = config.concurrency
      config.concurrency = newConcurrency

      // Update cached configuration
      await this.cacheFlowControlConfig(config)

      this.logger.info(`Concurrency updated for queue ${queueName}`, {
        queueName,
        oldConcurrency,
        newConcurrency,
        userId: user?.id
      })

      this.emit(EVENT_TYPES.CONCURRENCY_UPDATED, {
        queueName,
        oldConcurrency,
        newConcurrency,
        userId: user?.id,
        timestamp: new Date()
      })

    } catch (error) {
      this.logger.error(`Failed to update concurrency for queue ${queueName}:`, error, {
        queueName,
        newConcurrency,
        userId: user?.id
      })
      throw new QueueManagementError(
        `Failed to update concurrency: ${error instanceof Error ? (error instanceof Error ? error.message : "Unknown error") : 'Unknown error'}`,
        ERROR_CODES.INTERNAL_ERROR
      )
    }
  }

  /**
   * Get flow control metrics for a queue
   */
  public async getFlowControlMetrics(queueName: string): Promise<FlowControlMetrics | null> {
    try {
      const config = this.flowConfigs.get(queueName)
      if (!config) {
        return null
      }

      const rateLimiter = this.rateLimiters.get(queueName)
      const circuitBreaker = this.circuitBreakers.get(queueName)
      const autoScaler = this.autoScalers.get(queueName)

      const metrics: FlowControlMetrics = {
        queueName,
        currentConcurrency: config.concurrency,
        targetConcurrency: config.concurrency,
        rateLimitStatus: rateLimiter ? await rateLimiter.getStatus(queueName) : {
          current: 0,
          limit: 0,
          resetTime: new Date()
        },
        circuitBreakerStatus: circuitBreaker ? circuitBreaker.getState().state : 'closed',
        priorityDistribution: await this.getPriorityDistribution(queueName),
        autoScalingEvents: autoScaler ? autoScaler.getRecentEvents() : []
      }

      return metrics
    } catch (error) {
      this.logger.error(`Failed to get flow control metrics for queue ${queueName}:`, error, {
        queueName
      })
      return null
    }
  }

  /**
   * Remove flow control configuration for a queue
   */
  public async removeFlowControl(queueName: string, user?: User): Promise<void> {
    try {
      // Validate permissions
      if (user) {
        this.permissionManager.validateQueueOperation(user, 'manage', queueName)
      }

      // Remove components
      this.flowConfigs.delete(queueName)
      this.rateLimiters.delete(queueName)
      this.circuitBreakers.delete(queueName)
      this.autoScalers.delete(queueName)

      // Clear cache
      await this.clearFlowControlCache(queueName)

      this.logger.info(`Flow control removed for queue: ${queueName}`, {
        queueName,
        userId: user?.id
      })

      this.emit(EVENT_TYPES.FLOW_CONTROL_REMOVED, {
        queueName,
        userId: user?.id,
        timestamp: new Date()
      })

    } catch (error) {
      this.logger.error(`Failed to remove flow control for queue ${queueName}:`, error, {
        queueName,
        userId: user?.id
      })
      throw new QueueManagementError(
        `Failed to remove flow control: ${error instanceof Error ? (error instanceof Error ? error.message : "Unknown error") : 'Unknown error'}`,
        ERROR_CODES.INTERNAL_ERROR
      )
    }
  }

  // Private helper methods

  private validateFlowControlConfig(config: FlowControlConfig): void {
    if (!config.queueName || config.queueName.trim() === '') {
      throw new ValidationError('Queue name is required', 'queueName', config.queueName)
    }

    if (config.concurrency < 1 || config.concurrency > 1000) {
      throw new ValidationError('Concurrency must be between 1 and 1000', 'concurrency', config.concurrency)
    }

    if (config.rateLimiter) {
      if (config.rateLimiter.max < 1) {
        throw new ValidationError('Rate limiter max must be greater than 0', 'rateLimiter.max', config.rateLimiter.max)
      }
      if (config.rateLimiter.duration < 1000) {
        throw new ValidationError('Rate limiter duration must be at least 1000ms', 'rateLimiter.duration', config.rateLimiter.duration)
      }
    }

    // Validate priority rules
    for (const rule of config.priorityRules) {
      if (!rule.name || rule.name.trim() === '') {
        throw new ValidationError('Priority rule name is required', 'priorityRule.name', rule.name)
      }
      if (rule.priority < -100 || rule.priority > 100) {
        throw new ValidationError('Priority must be between -100 and 100', 'priorityRule.priority', rule.priority)
      }
    }

    // Validate auto scaling config
    if (config.autoScaling.enabled) {
      if (config.autoScaling.minConcurrency >= config.autoScaling.maxConcurrency) {
        throw new ValidationError('Min concurrency must be less than max concurrency')
      }
    }
  }

  private async evaluatePriorityCondition(condition: PriorityCondition, job: Job, queueName: string): Promise<boolean> {
    try {
      let value: any

      switch (condition.type) {
        case 'job_type':
          value = job.name
          break
        case 'queue_size':
          // This would need to be passed in or fetched
          value = 0
          break
        case 'processing_time':
          value = job.processedOn ? Date.now() - job.processedOn : 0
          break
        case 'custom':
          value = condition.field ? job.data[condition.field] : job.data
          break
        default:
          return false
      }

      return this.evaluateCondition(value, condition.operator, condition.value)
    } catch (error) {
      this.logger.error('Failed to evaluate priority condition:', error, {
        condition,
        jobId: job.id,
        queueName
      })
      return false
    }
  }

  private evaluateCondition(actual: any, operator: string, expected: any): boolean {
    switch (operator) {
      case '==':
        return actual === expected
      case '!=':
        return actual !== expected
      case '>':
        return actual > expected
      case '<':
        return actual < expected
      case '>=':
        return actual >= expected
      case '<=':
        return actual <= expected
      case 'contains':
        return String(actual).includes(String(expected))
      case 'regex':
        return new RegExp(expected).test(String(actual))
      default:
        return false
    }
  }

  private async getPriorityDistribution(queueName: string): Promise<Record<number, number>> {
    // This would analyze current jobs and return priority distribution
    // For now, return empty distribution
    return {}
  }

  private async cacheFlowControlConfig(config: FlowControlConfig): Promise<void> {
    const key = `flow_control:config:${config.queueName}`
    await this.redis.setex(key, 3600, JSON.stringify(config))
  }

  private async clearFlowControlCache(queueName: string): Promise<void> {
    const key = `flow_control:config:${queueName}`
    await this.redis.del(key)
  }

  private startMonitoring(): void {
    this.monitoringInterval = setInterval(async () => {
      try {
        await this.performPeriodicTasks()
      } catch (error) {
        this.logger.error('Flow control monitoring error:', error)
      }
    }, 30000) // Every 30 seconds
  }

  private async performPeriodicTasks(): Promise<void> {
    // Auto-scaling checks
    for (const [queueName, autoScaler] of this.autoScalers) {
      try {
        await autoScaler.checkScalingConditions()
      } catch (error) {
        this.logger.error(`Auto-scaling check failed for queue ${queueName}:`, error)
      }
    }

    // Circuit breaker health checks
    for (const [queueName, circuitBreaker] of this.circuitBreakers) {
      try {
        circuitBreaker.performHealthCheck()
      } catch (error) {
        this.logger.error(`Circuit breaker health check failed for queue ${queueName}:`, error)
      }
    }
  }

  public async destroy(): Promise<void> {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval)
    }
  }
}

// Helper classes

class RateLimiter {
  constructor(private config: RateLimiterConfig, private redis: ReturnType<typeof getRedisInstance>) {}

  async checkLimit(key: string): Promise<{ allowed: boolean; current: number; limit: number; resetTime: Date; windowMs: number }> {
    const now = Date.now()
    const window = Math.floor(now / this.config.duration)
    const redisKey = `rate_limit:${key}:${window}`

    const current = await this.redis.incr(redisKey)
    
    if (current === 1) {
      await this.redis.expire(redisKey, Math.ceil(this.config.duration / 1000))
    }

    const allowed = current <= this.config.max
    const resetTime = new Date((window + 1) * this.config.duration)

    return {
      allowed,
      current,
      limit: this.config.max,
      resetTime,
      windowMs: this.config.duration
    }
  }

  async getStatus(key: string): Promise<{ current: number; limit: number; resetTime: Date }> {
    const now = Date.now()
    const window = Math.floor(now / this.config.duration)
    const redisKey = `rate_limit:${key}:${window}`

    const current = await this.redis.get(redisKey)
    const resetTime = new Date((window + 1) * this.config.duration)

    return {
      current: parseInt(current || '0'),
      limit: this.config.max,
      resetTime
    }
  }
}

class CircuitBreaker {
  private failures = 0
  private lastFailureTime?: Date
  private state: 'closed' | 'open' | 'half-open' = 'closed'
  private stateChanged = false

  constructor(private config: CircuitBreakerConfig) {}

  isOpen(): boolean {
    if (this.state === 'open') {
      if (this.shouldAttemptReset()) {
        this.state = 'half-open'
        this.stateChanged = true
      }
    }
    return this.state === 'open'
  }

  recordSuccess(): void {
    this.failures = 0
    if (this.state !== 'closed') {
      this.state = 'closed'
      this.stateChanged = true
    }
  }

  recordFailure(): void {
    this.failures++
    this.lastFailureTime = new Date()
    
    if (this.failures >= this.config.failureThreshold && this.state === 'closed') {
      this.state = 'open'
      this.stateChanged = true
    }
  }

  getState(): { state: 'closed' | 'open' | 'half-open'; failures: number; stateChanged: boolean } {
    const result = {
      state: this.state,
      failures: this.failures,
      stateChanged: this.stateChanged
    }
    this.stateChanged = false // Reset flag
    return result
  }

  performHealthCheck(): void {
    // Periodic health check logic
  }

  private shouldAttemptReset(): boolean {
    return !!(this.lastFailureTime && 
           (Date.now() - this.lastFailureTime.getTime()) >= this.config.recoveryTimeout)
  }
}

class AutoScaler {
  private recentEvents: AutoScalingEvent[] = []
  private lastScaleTime?: Date

  constructor(private config: AutoScalingConfig, private logger: Logger) {}

  async calculateOptimalConcurrency(metrics: any): Promise<number> {
    // Simplified auto-scaling logic
    const currentConcurrency = metrics.concurrency || this.config.minConcurrency
    const queueSize = metrics.queueSize || 0
    const processingRate = metrics.processingRate || 1

    if (queueSize > this.config.scaleUpThreshold) {
      return Math.min(currentConcurrency + 1, this.config.maxConcurrency)
    }

    if (queueSize < this.config.scaleDownThreshold) {
      return Math.max(currentConcurrency - 1, this.config.minConcurrency)
    }

    return currentConcurrency
  }

  async checkScalingConditions(): Promise<void> {
    // Periodic scaling condition checks
  }

  getRecentEvents(): AutoScalingEvent[] {
    return this.recentEvents.slice(-10) // Return last 10 events
  }

  private recordScalingEvent(action: 'scale_up' | 'scale_down', from: number, to: number, reason: string): void {
    this.recentEvents.push({
      timestamp: new Date(),
      action,
      fromConcurrency: from,
      toConcurrency: to,
      reason
    })

    // Keep only recent events
    if (this.recentEvents.length > 50) {
      this.recentEvents = this.recentEvents.slice(-50)
    }
  }
}

// Add missing event types to constants
const FLOW_CONTROL_EVENTS = {
  FLOW_CONTROL_CONFIGURED: 'flow.control.configured',
  FLOW_CONTROL_REMOVED: 'flow.control.removed',
  RATE_LIMIT_EXCEEDED: 'flow.control.rate.limit.exceeded',
  CIRCUIT_BREAKER_OPENED: 'flow.control.circuit.breaker.opened',
  CIRCUIT_BREAKER_STATE_CHANGED: 'flow.control.circuit.breaker.state.changed',
  CONCURRENCY_ADJUSTMENT_RECOMMENDED: 'flow.control.concurrency.adjustment.recommended',
  CONCURRENCY_UPDATED: 'flow.control.concurrency.updated'
}

// Export singleton instance
let flowControlServiceInstance: FlowControlService | null = null

export function getFlowControlService(): FlowControlService {
  if (!flowControlServiceInstance) {
    flowControlServiceInstance = new FlowControlService()
  }
  return flowControlServiceInstance
}

export default FlowControlService
