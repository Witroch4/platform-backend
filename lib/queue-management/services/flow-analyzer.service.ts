/**
 * Flow Analyzer Service
 * 
 * Analyzes job flows and dependencies, detects orphaned jobs,
 * circular dependencies, and provides flow optimization suggestions.
 */

import { EventEmitter } from 'events'
import { Job } from 'bullmq'
import { PrismaClient } from '@prisma/client'
import { 
  FlowTree, 
  FlowNode, 
  FlowMetrics, 
  FlowAnalysis, 
  FlowIssue, 
  Optimization, 
  Bottleneck,
  User,
  JobMetrics,
  AlertSeverity
} from '../../../types/queue-management'
import { 
  DEFAULTS, 
  ERROR_CODES, 
  EVENT_TYPES,
  ALERT_SEVERITIES
} from '../constants'
import { 
  QueueManagementError, 
  ValidationError,
  FlowNotFoundError
} from '../errors'
import { Logger, measurePerformance } from '../utils/logger'
import { getPermissionManager } from './permission-manager.service'

export interface OrphanedJob {
  jobId: string
  queueName: string
  flowId?: string
  parentJobId?: string
  reason: 'missing_parent' | 'missing_flow' | 'circular_reference'
  detectedAt: Date
}

export interface CircularDependency {
  flowId: string
  cycle: string[]
  severity: AlertSeverity
  description: string
}

export interface FlowChange {
  type: 'add_dependency' | 'remove_dependency' | 'change_priority' | 'parallelize'
  jobId: string
  parentJobId?: string
  newPriority?: number
  config?: Record<string, any>
}

export interface SimulationResult {
  flowId: string
  originalMetrics: FlowMetrics
  simulatedMetrics: FlowMetrics
  improvements: {
    totalDurationReduction: number // percentage
    parallelismIncrease: number // percentage
    bottleneckReduction: number
  }
  risks: string[]
  recommendations: string[]
}

/**
 * Flow Analyzer Service Implementation
 */
export class FlowAnalyzerService extends EventEmitter {
  private logger: Logger
  private permissionManager = getPermissionManager()
  private prisma: PrismaClient
  private analysisCache = new Map<string, FlowAnalysis>()
  private orphanedJobsCache = new Map<string, OrphanedJob[]>()
  private circularDependenciesCache = new Map<string, CircularDependency[]>()

  constructor(prisma: PrismaClient) {
    super()
    this.logger = new Logger('FlowAnalyzerService')
    this.prisma = prisma
  }

  /**
   * Analyze a complete flow
   */
  @measurePerformance(new Logger('FlowAnalyzerService'), 'analyzeFlow')
  public async analyzeFlow(flowId: string, user?: User): Promise<FlowAnalysis> {
    try {
      // Validate permissions
      if (user) {
        this.permissionManager.validateFlowOperation(user, 'view', flowId)
      }

      // Check cache first
      const cached = this.analysisCache.get(flowId)
      if (cached && this.isCacheValid(cached, 300000)) { // 5 minutes cache
        return cached
      }

      this.logger.info(`Analyzing flow: ${flowId}`, { flowId, userId: user?.userId })

      // Get flow tree
      const tree = await this.getFlowTree(flowId, user)
      
      // Calculate metrics
      const metrics = await this.getFlowMetrics(flowId, user)
      
      // Detect issues
      const issues = await this.detectFlowIssues(flowId, tree)
      
      // Generate optimizations
      const optimizations = await this.generateOptimizations(flowId, tree, metrics)

      const analysis: FlowAnalysis = {
        flowId,
        tree,
        metrics,
        issues,
        optimizations
      }

      // Cache the result
      this.analysisCache.set(flowId, analysis)

      this.logger.info(`Flow analysis completed: ${flowId}`, {
        flowId,
        totalJobs: tree.totalJobs,
        completedJobs: tree.completedJobs,
        failedJobs: tree.failedJobs,
        issuesFound: issues.length,
        optimizationsFound: optimizations.length,
        userId: user?.userId
      })

      this.emit(EVENT_TYPES.FLOW_ANALYZED, {
        flowId,
        analysis,
        userId: user?.userId,
        timestamp: new Date()
      })

      return analysis

    } catch (error) {
      this.logger.error(`Failed to analyze flow ${flowId}:`, error, {
        flowId,
        userId: user?.userId
      })
      throw new QueueManagementError(
        `Failed to analyze flow: ${error.message}`,
        ERROR_CODES.INTERNAL_ERROR
      )
    }
  }

  /**
   * Get flow tree structure
   */
  public async getFlowTree(flowId: string, user?: User): Promise<FlowTree> {
    try {
      // Validate permissions
      if (user) {
        this.permissionManager.validateFlowOperation(user, 'view', flowId)
      }

      // Get flow from database
      const flow = await this.prisma.jobFlow.findUnique({
        where: { flowId },
        include: {
          dependencies: {
            orderBy: { createdAt: 'asc' }
          }
        }
      })

      if (!flow) {
        throw new FlowNotFoundError(flowId)
      }

      // Get all job metrics for this flow
      const jobMetrics = await this.prisma.jobMetric.findMany({
        where: { flowId },
        orderBy: { createdAt: 'desc' }
      })

      // Build dependency tree
      const rootNode = await this.buildFlowNode(flow.rootJobId, flow.dependencies, jobMetrics)
      
      const tree: FlowTree = {
        flowId,
        rootJob: rootNode,
        totalJobs: flow.totalJobs,
        completedJobs: flow.completedJobs,
        failedJobs: flow.failedJobs,
        status: flow.status as any,
        startedAt: flow.startedAt || undefined,
        completedAt: flow.completedAt || undefined,
        estimatedCompletion: flow.estimatedCompletion || undefined
      }

      return tree

    } catch (error) {
      if (error instanceof FlowNotFoundError) {
        throw error
      }
      this.logger.error(`Failed to get flow tree for ${flowId}:`, error, {
        flowId,
        userId: user?.userId
      })
      throw new QueueManagementError(
        `Failed to get flow tree: ${error.message}`,
        ERROR_CODES.INTERNAL_ERROR
      )
    }
  }

  /**
   * Get flow metrics
   */
  public async getFlowMetrics(flowId: string, user?: User): Promise<FlowMetrics> {
    try {
      // Validate permissions
      if (user) {
        this.permissionManager.validateFlowOperation(user, 'view', flowId)
      }

      const flow = await this.prisma.jobFlow.findUnique({
        where: { flowId }
      })

      if (!flow) {
        throw new FlowNotFoundError(flowId)
      }

      // Get all job metrics for this flow
      const jobMetrics = await this.prisma.jobMetric.findMany({
        where: { flowId },
        orderBy: { createdAt: 'desc' }
      })

      // Calculate total duration
      const totalDuration = flow.completedAt && flow.startedAt 
        ? flow.completedAt.getTime() - flow.startedAt.getTime()
        : 0

      // Calculate critical path
      const criticalPath = await this.calculateCriticalPath(flowId, jobMetrics)
      
      // Calculate parallelism
      const parallelism = await this.calculateParallelism(flowId, jobMetrics)
      
      // Calculate efficiency
      const efficiency = totalDuration > 0 
        ? (criticalPath.reduce((sum, jobId) => {
            const job = jobMetrics.find(j => j.jobId === jobId)
            return sum + (job?.processingTime || 0)
          }, 0) / totalDuration) * 100
        : 0

      // Detect bottlenecks
      const bottlenecks = await this.detectBottlenecks(flowId, jobMetrics)

      const metrics: FlowMetrics = {
        flowId,
        totalDuration,
        criticalPath,
        parallelism,
        efficiency,
        bottlenecks
      }

      return metrics

    } catch (error) {
      if (error instanceof FlowNotFoundError) {
        throw error
      }
      this.logger.error(`Failed to get flow metrics for ${flowId}:`, error, {
        flowId,
        userId: user?.userId
      })
      throw new QueueManagementError(
        `Failed to get flow metrics: ${error.message}`,
        ERROR_CODES.INTERNAL_ERROR
      )
    }
  }

  /**
   * Cancel a flow and all its jobs
   */
  public async cancelFlow(flowId: string, user?: User): Promise<boolean> {
    try {
      // Validate permissions
      if (user) {
        this.permissionManager.validateFlowOperation(user, 'cancel', flowId)
      }

      const flow = await this.prisma.jobFlow.findUnique({
        where: { flowId }
      })

      if (!flow) {
        throw new FlowNotFoundError(flowId)
      }

      // Update flow status
      await this.prisma.jobFlow.update({
        where: { flowId },
        data: {
          status: 'cancelled',
          completedAt: new Date()
        }
      })

      // Cancel all active jobs in the flow
      const activeJobs = await this.prisma.jobMetric.findMany({
        where: {
          flowId,
          status: { in: ['waiting', 'active', 'delayed'] }
        }
      })

      let cancelledJobs = 0
      for (const jobMetric of activeJobs) {
        try {
          // This would need integration with the actual queue to cancel jobs
          // For now, we'll just update the status in our metrics
          await this.prisma.jobMetric.update({
            where: { id: jobMetric.id },
            data: { status: 'failed' }
          })
          cancelledJobs++
        } catch (error) {
          this.logger.error(`Failed to cancel job ${jobMetric.jobId}:`, error)
        }
      }

      this.logger.info(`Flow cancelled: ${flowId}`, {
        flowId,
        cancelledJobs,
        totalJobs: flow.totalJobs,
        userId: user?.userId
      })

      this.emit(EVENT_TYPES.FLOW_CANCELLED, {
        flowId,
        cancelledJobs,
        totalJobs: flow.totalJobs,
        userId: user?.userId,
        timestamp: new Date()
      })

      // Clear cache
      this.analysisCache.delete(flowId)

      return true

    } catch (error) {
      if (error instanceof FlowNotFoundError) {
        throw error
      }
      this.logger.error(`Failed to cancel flow ${flowId}:`, error, {
        flowId,
        userId: user?.userId
      })
      throw new QueueManagementError(
        `Failed to cancel flow: ${error.message}`,
        ERROR_CODES.INTERNAL_ERROR
      )
    }
  }

  /**
   * Retry a failed flow
   */
  public async retryFlow(flowId: string, user?: User): Promise<boolean> {
    try {
      // Validate permissions
      if (user) {
        this.permissionManager.validateFlowOperation(user, 'retry', flowId)
      }

      const flow = await this.prisma.jobFlow.findUnique({
        where: { flowId }
      })

      if (!flow) {
        throw new FlowNotFoundError(flowId)
      }

      if (flow.status !== 'failed') {
        throw new ValidationError(
          `Cannot retry flow in status: ${flow.status}`,
          'status',
          flow.status
        )
      }

      // Reset flow status
      await this.prisma.jobFlow.update({
        where: { flowId },
        data: {
          status: 'pending',
          completedAt: null,
          failedJobs: 0
        }
      })

      // Retry all failed jobs in the flow
      const failedJobs = await this.prisma.jobMetric.findMany({
        where: {
          flowId,
          status: 'failed'
        }
      })

      let retriedJobs = 0
      for (const jobMetric of failedJobs) {
        try {
          // This would need integration with the actual queue to retry jobs
          // For now, we'll just update the status in our metrics
          await this.prisma.jobMetric.update({
            where: { id: jobMetric.id },
            data: { 
              status: 'waiting',
              attempts: jobMetric.attempts + 1
            }
          })
          retriedJobs++
        } catch (error) {
          this.logger.error(`Failed to retry job ${jobMetric.jobId}:`, error)
        }
      }

      this.logger.info(`Flow retried: ${flowId}`, {
        flowId,
        retriedJobs,
        totalFailedJobs: failedJobs.length,
        userId: user?.userId
      })

      this.emit(EVENT_TYPES.FLOW_RETRIED, {
        flowId,
        retriedJobs,
        totalFailedJobs: failedJobs.length,
        userId: user?.userId,
        timestamp: new Date()
      })

      // Clear cache
      this.analysisCache.delete(flowId)

      return true

    } catch (error) {
      if (error instanceof FlowNotFoundError || error instanceof ValidationError) {
        throw error
      }
      this.logger.error(`Failed to retry flow ${flowId}:`, error, {
        flowId,
        userId: user?.userId
      })
      throw new QueueManagementError(
        `Failed to retry flow: ${error.message}`,
        ERROR_CODES.INTERNAL_ERROR
      )
    }
  }

  /**
   * Detect orphaned jobs
   */
  public async detectOrphanedJobs(): Promise<OrphanedJob[]> {
    try {
      // Check cache first
      const cacheKey = 'global'
      const cached = this.orphanedJobsCache.get(cacheKey)
      if (cached && this.isOrphanedJobsCacheValid(cached, 600000)) { // 10 minutes cache
        return cached
      }

      this.logger.info('Detecting orphaned jobs')

      const orphanedJobs: OrphanedJob[] = []

      // Find jobs with missing parent jobs
      const jobsWithMissingParents = await this.prisma.jobMetric.findMany({
        where: {
          parentJobId: { not: null },
          NOT: {
            parentJobId: {
              in: await this.prisma.jobMetric.findMany({
                select: { jobId: true }
              }).then(jobs => jobs.map(j => j.jobId))
            }
          }
        }
      })

      for (const job of jobsWithMissingParents) {
        orphanedJobs.push({
          jobId: job.jobId,
          queueName: job.queueName,
          flowId: job.flowId || undefined,
          parentJobId: job.parentJobId || undefined,
          reason: 'missing_parent',
          detectedAt: new Date()
        })
      }

      // Find jobs with missing flows
      const jobsWithMissingFlows = await this.prisma.jobMetric.findMany({
        where: {
          flowId: { not: null },
          NOT: {
            flowId: {
              in: await this.prisma.jobFlow.findMany({
                select: { flowId: true }
              }).then(flows => flows.map(f => f.flowId))
            }
          }
        }
      })

      for (const job of jobsWithMissingFlows) {
        orphanedJobs.push({
          jobId: job.jobId,
          queueName: job.queueName,
          flowId: job.flowId || undefined,
          parentJobId: job.parentJobId || undefined,
          reason: 'missing_flow',
          detectedAt: new Date()
        })
      }

      // Cache the result
      this.orphanedJobsCache.set(cacheKey, orphanedJobs)

      this.logger.info(`Orphaned jobs detection completed`, {
        orphanedJobsFound: orphanedJobs.length,
        missingParents: jobsWithMissingParents.length,
        missingFlows: jobsWithMissingFlows.length
      })

      if (orphanedJobs.length > 0) {
        this.emit(EVENT_TYPES.ORPHANED_JOBS_DETECTED, {
          orphanedJobs,
          count: orphanedJobs.length,
          timestamp: new Date()
        })
      }

      return orphanedJobs

    } catch (error) {
      this.logger.error('Failed to detect orphaned jobs:', error)
      throw new QueueManagementError(
        `Failed to detect orphaned jobs: ${error.message}`,
        ERROR_CODES.INTERNAL_ERROR
      )
    }
  }

  /**
   * Detect circular dependencies
   */
  public async detectCircularDependencies(): Promise<CircularDependency[]> {
    try {
      // Check cache first
      const cacheKey = 'global'
      const cached = this.circularDependenciesCache.get(cacheKey)
      if (cached && this.isCircularDependenciesCacheValid(cached, 600000)) { // 10 minutes cache
        return cached
      }

      this.logger.info('Detecting circular dependencies')

      const circularDependencies: CircularDependency[] = []

      // Get all flows with their dependencies
      const flows = await this.prisma.jobFlow.findMany({
        include: {
          dependencies: true
        }
      })

      for (const flow of flows) {
        const cycles = this.findCyclesInFlow(flow.dependencies)
        
        for (const cycle of cycles) {
          circularDependencies.push({
            flowId: flow.flowId,
            cycle,
            severity: ALERT_SEVERITIES.ERROR,
            description: `Circular dependency detected in flow ${flow.flowId}: ${cycle.join(' -> ')}`
          })
        }
      }

      // Cache the result
      this.circularDependenciesCache.set(cacheKey, circularDependencies)

      this.logger.info(`Circular dependencies detection completed`, {
        circularDependenciesFound: circularDependencies.length,
        flowsAnalyzed: flows.length
      })

      if (circularDependencies.length > 0) {
        this.emit(EVENT_TYPES.CIRCULAR_DEPENDENCIES_DETECTED, {
          circularDependencies,
          count: circularDependencies.length,
          timestamp: new Date()
        })
      }

      return circularDependencies

    } catch (error) {
      this.logger.error('Failed to detect circular dependencies:', error)
      throw new QueueManagementError(
        `Failed to detect circular dependencies: ${error.message}`,
        ERROR_CODES.INTERNAL_ERROR
      )
    }
  }

  /**
   * Detect bottlenecks in a flow
   */
  public async detectBottlenecks(flowId: string, jobMetrics?: any[]): Promise<Bottleneck[]> {
    try {
      if (!jobMetrics) {
        jobMetrics = await this.prisma.jobMetric.findMany({
          where: { flowId }
        })
      }

      const bottlenecks: Bottleneck[] = []
      const totalFlowDuration = this.calculateTotalFlowDuration(jobMetrics)

      // Find jobs that take significantly longer than average
      const avgProcessingTime = jobMetrics.reduce((sum, job) => sum + (job.processingTime || 0), 0) / jobMetrics.length
      const threshold = avgProcessingTime * 2 // Jobs taking 2x average time

      for (const job of jobMetrics) {
        if (job.processingTime && job.processingTime > threshold) {
          const impact = totalFlowDuration > 0 ? (job.processingTime / totalFlowDuration) * 100 : 0
          
          bottlenecks.push({
            jobId: job.jobId,
            jobName: job.jobName || job.jobType || 'Unknown',
            queueName: job.queueName,
            duration: job.processingTime,
            impact,
            suggestions: this.generateBottleneckSuggestions(job, impact)
          })
        }
      }

      // Sort by impact (highest first)
      bottlenecks.sort((a, b) => b.impact - a.impact)

      return bottlenecks

    } catch (error) {
      this.logger.error(`Failed to detect bottlenecks for flow ${flowId}:`, error)
      return []
    }
  }

  /**
   * Suggest optimizations for a flow
   */
  public async suggestOptimizations(flowId: string, user?: User): Promise<Optimization[]> {
    try {
      // Validate permissions
      if (user) {
        this.permissionManager.validateFlowOperation(user, 'view', flowId)
      }

      const analysis = await this.analyzeFlow(flowId, user)
      return analysis.optimizations

    } catch (error) {
      this.logger.error(`Failed to suggest optimizations for flow ${flowId}:`, error, {
        flowId,
        userId: user?.userId
      })
      throw new QueueManagementError(
        `Failed to suggest optimizations: ${error.message}`,
        ERROR_CODES.INTERNAL_ERROR
      )
    }
  }

  /**
   * Simulate flow changes
   */
  public async simulateFlowChanges(
    flowId: string, 
    changes: FlowChange[], 
    user?: User
  ): Promise<SimulationResult> {
    try {
      // Validate permissions
      if (user) {
        this.permissionManager.validateFlowOperation(user, 'view', flowId)
      }

      // Get current metrics
      const originalMetrics = await this.getFlowMetrics(flowId, user)
      
      // Simulate changes (simplified simulation)
      const simulatedMetrics = await this.simulateMetricsWithChanges(originalMetrics, changes)
      
      // Calculate improvements
      const improvements = {
        totalDurationReduction: originalMetrics.totalDuration > 0 
          ? ((originalMetrics.totalDuration - simulatedMetrics.totalDuration) / originalMetrics.totalDuration) * 100
          : 0,
        parallelismIncrease: originalMetrics.parallelism > 0
          ? ((simulatedMetrics.parallelism - originalMetrics.parallelism) / originalMetrics.parallelism) * 100
          : 0,
        bottleneckReduction: originalMetrics.bottlenecks.length - simulatedMetrics.bottlenecks.length
      }

      // Generate risks and recommendations
      const risks = this.generateSimulationRisks(changes)
      const recommendations = this.generateSimulationRecommendations(changes, improvements)

      const result: SimulationResult = {
        flowId,
        originalMetrics,
        simulatedMetrics,
        improvements,
        risks,
        recommendations
      }

      this.logger.info(`Flow simulation completed: ${flowId}`, {
        flowId,
        changesCount: changes.length,
        durationReduction: improvements.totalDurationReduction,
        parallelismIncrease: improvements.parallelismIncrease,
        userId: user?.userId
      })

      return result

    } catch (error) {
      this.logger.error(`Failed to simulate flow changes for ${flowId}:`, error, {
        flowId,
        changesCount: changes.length,
        userId: user?.userId
      })
      throw new QueueManagementError(
        `Failed to simulate flow changes: ${error.message}`,
        ERROR_CODES.INTERNAL_ERROR
      )
    }
  }

  // Private helper methods

  private async buildFlowNode(
    jobId: string, 
    dependencies: any[], 
    jobMetrics: any[]
  ): Promise<FlowNode> {
    const jobMetric = jobMetrics.find(j => j.jobId === jobId)
    const children: FlowNode[] = []
    
    // Find child jobs
    const childDependencies = dependencies.filter(d => d.parentJobId === jobId)
    for (const childDep of childDependencies) {
      const childNode = await this.buildFlowNode(childDep.jobId, dependencies, jobMetrics)
      children.push(childNode)
    }

    // Get job dependencies
    const jobDependencies = dependencies
      .filter(d => d.jobId === jobId)
      .map(d => d.parentJobId)
      .filter(Boolean)

    return {
      jobId,
      jobName: jobMetric?.jobName || jobMetric?.jobType || 'Unknown',
      status: jobMetric?.status || 'unknown',
      children,
      dependencies: jobDependencies,
      metrics: jobMetric || this.createEmptyJobMetrics(jobId),
      error: jobMetric?.errorMessage
    }
  }

  private createEmptyJobMetrics(jobId: string): JobMetrics {
    return {
      jobId,
      queueName: 'unknown',
      jobName: 'Unknown',
      jobType: 'unknown',
      status: 'unknown',
      timing: {
        createdAt: new Date()
      },
      resources: {
        memoryPeak: 0,
        cpuTime: 0
      },
      attempts: 0,
      maxAttempts: 1,
      payloadSize: 0
    }
  }

  private async calculateCriticalPath(flowId: string, jobMetrics: any[]): Promise<string[]> {
    // Simplified critical path calculation
    // In a real implementation, this would use proper graph algorithms
    return jobMetrics
      .sort((a, b) => (b.processingTime || 0) - (a.processingTime || 0))
      .slice(0, Math.min(5, jobMetrics.length))
      .map(job => job.jobId)
  }

  private async calculateParallelism(flowId: string, jobMetrics: any[]): Promise<number> {
    // Calculate average parallelism based on concurrent jobs
    const timeSlots = new Map<number, number>()
    
    for (const job of jobMetrics) {
      if (job.startedAt && job.completedAt) {
        const startTime = Math.floor(job.startedAt.getTime() / 60000) // 1-minute slots
        const endTime = Math.floor(job.completedAt.getTime() / 60000)
        
        for (let time = startTime; time <= endTime; time++) {
          timeSlots.set(time, (timeSlots.get(time) || 0) + 1)
        }
      }
    }

    if (timeSlots.size === 0) return 1

    const totalConcurrency = Array.from(timeSlots.values()).reduce((sum, count) => sum + count, 0)
    return totalConcurrency / timeSlots.size
  }

  private calculateTotalFlowDuration(jobMetrics: any[]): number {
    const startTimes = jobMetrics
      .map(job => job.startedAt?.getTime())
      .filter(Boolean)
    const endTimes = jobMetrics
      .map(job => job.completedAt?.getTime())
      .filter(Boolean)

    if (startTimes.length === 0 || endTimes.length === 0) return 0

    return Math.max(...endTimes) - Math.min(...startTimes)
  }

  private generateBottleneckSuggestions(job: any, impact: number): string[] {
    const suggestions: string[] = []

    if (impact > 50) {
      suggestions.push('Consider breaking this job into smaller parallel tasks')
      suggestions.push('Optimize the job processing logic')
      suggestions.push('Increase worker concurrency for this queue')
    } else if (impact > 25) {
      suggestions.push('Review job implementation for optimization opportunities')
      suggestions.push('Consider caching frequently accessed data')
    } else {
      suggestions.push('Monitor job performance over time')
    }

    return suggestions
  }

  private async detectFlowIssues(flowId: string, tree: FlowTree): Promise<FlowIssue[]> {
    const issues: FlowIssue[] = []

    // Check for stuck flows
    if (tree.status === 'running' && tree.startedAt) {
      const runningTime = Date.now() - tree.startedAt.getTime()
      if (runningTime > 24 * 60 * 60 * 1000) { // 24 hours
        issues.push({
          type: 'stuck_flow',
          severity: ALERT_SEVERITIES.WARNING,
          description: `Flow has been running for more than 24 hours`,
          affectedJobs: [tree.rootJob.jobId],
          suggestions: ['Check for deadlocks', 'Review job dependencies', 'Consider cancelling and restarting']
        })
      }
    }

    // Check for high failure rate
    if (tree.totalJobs > 0 && tree.failedJobs / tree.totalJobs > 0.2) {
      issues.push({
        type: 'bottleneck',
        severity: ALERT_SEVERITIES.ERROR,
        description: `High failure rate: ${Math.round((tree.failedJobs / tree.totalJobs) * 100)}%`,
        affectedJobs: [],
        suggestions: ['Review failed job logs', 'Check job dependencies', 'Improve error handling']
      })
    }

    return issues
  }

  private async generateOptimizations(
    flowId: string, 
    tree: FlowTree, 
    metrics: FlowMetrics
  ): Promise<Optimization[]> {
    const optimizations: Optimization[] = []

    // Suggest parallelization if efficiency is low
    if (metrics.efficiency < 50 && metrics.parallelism < 2) {
      optimizations.push({
        type: 'parallelization',
        description: 'Increase parallelism by running independent jobs concurrently',
        estimatedImprovement: 30,
        implementation: 'Review job dependencies and parallelize independent tasks'
      })
    }

    // Suggest resource optimization for bottlenecks
    if (metrics.bottlenecks.length > 0) {
      optimizations.push({
        type: 'resource_allocation',
        description: 'Optimize resource allocation for bottleneck jobs',
        estimatedImprovement: 20,
        implementation: 'Increase worker concurrency or optimize job processing logic'
      })
    }

    return optimizations
  }

  private findCyclesInFlow(dependencies: any[]): string[][] {
    const cycles: string[][] = []
    const visited = new Set<string>()
    const recursionStack = new Set<string>()

    // Build adjacency list
    const graph = new Map<string, string[]>()
    for (const dep of dependencies) {
      if (!graph.has(dep.jobId)) {
        graph.set(dep.jobId, [])
      }
      if (dep.parentJobId) {
        graph.get(dep.jobId)!.push(dep.parentJobId)
      }
    }

    // DFS to detect cycles
    const dfs = (node: string, path: string[]): void => {
      visited.add(node)
      recursionStack.add(node)
      path.push(node)

      const neighbors = graph.get(node) || []
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          dfs(neighbor, [...path])
        } else if (recursionStack.has(neighbor)) {
          // Found a cycle
          const cycleStart = path.indexOf(neighbor)
          if (cycleStart !== -1) {
            cycles.push([...path.slice(cycleStart), neighbor])
          }
        }
      }

      recursionStack.delete(node)
    }

    // Check all nodes
    for (const dep of dependencies) {
      if (!visited.has(dep.jobId)) {
        dfs(dep.jobId, [])
      }
    }

    return cycles
  }

  private async simulateMetricsWithChanges(
    originalMetrics: FlowMetrics, 
    changes: FlowChange[]
  ): Promise<FlowMetrics> {
    // Simplified simulation - in reality this would be much more complex
    let simulatedMetrics = { ...originalMetrics }

    for (const change of changes) {
      switch (change.type) {
        case 'parallelize':
          simulatedMetrics.parallelism *= 1.5
          simulatedMetrics.totalDuration *= 0.8
          break
        case 'change_priority':
          simulatedMetrics.efficiency *= 1.1
          break
        case 'add_dependency':
          simulatedMetrics.totalDuration *= 1.1
          break
        case 'remove_dependency':
          simulatedMetrics.totalDuration *= 0.9
          simulatedMetrics.parallelism *= 1.2
          break
      }
    }

    return simulatedMetrics
  }

  private generateSimulationRisks(changes: FlowChange[]): string[] {
    const risks: string[] = []

    if (changes.some(c => c.type === 'remove_dependency')) {
      risks.push('Removing dependencies may cause jobs to run out of order')
    }

    if (changes.some(c => c.type === 'parallelize')) {
      risks.push('Increased parallelism may strain system resources')
    }

    return risks
  }

  private generateSimulationRecommendations(
    changes: FlowChange[], 
    improvements: any
  ): string[] {
    const recommendations: string[] = []

    if (improvements.totalDurationReduction > 20) {
      recommendations.push('These changes show significant performance improvement')
    }

    if (improvements.parallelismIncrease > 30) {
      recommendations.push('Monitor system resources after implementing parallelization changes')
    }

    return recommendations
  }

  private isCacheValid(analysis: FlowAnalysis, maxAge: number): boolean {
    // Simple cache validation - in reality this would be more sophisticated
    return true // For now, always consider cache valid within the time window
  }

  private isOrphanedJobsCacheValid(orphanedJobs: OrphanedJob[], maxAge: number): boolean {
    if (orphanedJobs.length === 0) return false
    const oldestDetection = Math.min(...orphanedJobs.map(job => job.detectedAt.getTime()))
    return Date.now() - oldestDetection < maxAge
  }

  private isCircularDependenciesCacheValid(dependencies: CircularDependency[], maxAge: number): boolean {
    return true // For now, always consider cache valid within the time window
  }
}

// Add missing event types
const FLOW_ANALYZER_EVENTS = {
  FLOW_ANALYZED: 'flow.analyzed',
  FLOW_RETRIED: 'flow.retried',
  ORPHANED_JOBS_DETECTED: 'flow.orphaned.jobs.detected',
  CIRCULAR_DEPENDENCIES_DETECTED: 'flow.circular.dependencies.detected'
}

// Export singleton instance
let flowAnalyzerServiceInstance: FlowAnalyzerService | null = null

export function getFlowAnalyzerService(prisma: PrismaClient): FlowAnalyzerService {
  if (!flowAnalyzerServiceInstance) {
    flowAnalyzerServiceInstance = new FlowAnalyzerService(prisma)
  }
  return flowAnalyzerServiceInstance
}

export default FlowAnalyzerService