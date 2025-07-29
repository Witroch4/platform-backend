/**
 * Flow Management Types
 * 
 * Type definitions for job flows and dependencies
 */

export interface FlowTree {
  flowId: string
  rootJob: FlowNode
  totalJobs: number
  completedJobs: number
  failedJobs: number
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  startedAt?: Date
  completedAt?: Date
  estimatedCompletion?: Date
}

export interface FlowNode {
  jobId: string
  jobName: string
  status: string
  children: FlowNode[]
  dependencies: string[]
  metrics?: any
  error?: string
}

export interface FlowMetrics {
  flowId: string
  totalDuration: number
  criticalPath: string[]
  parallelism: number
  efficiency: number // %
  bottlenecks: Bottleneck[]
}

export interface Bottleneck {
  jobId: string
  jobName: string
  duration: number
  impact: number // percentage of total flow time
  suggestions: string[]
}

export interface FlowAnalysis {
  flowId: string
  metrics: FlowMetrics
  bottlenecks: Bottleneck[]
  optimizations: Optimization[]
  health: 'healthy' | 'warning' | 'critical'
}

export interface Optimization {
  type: 'parallelization' | 'resource_allocation' | 'dependency_removal'
  description: string
  estimatedImprovement: number // percentage
  effort: 'low' | 'medium' | 'high'
}

export interface OrphanedJob {
  jobId: string
  queueName: string
  expectedParent?: string
  detectedAt: Date
}

export interface CircularDependency {
  jobs: string[]
  description: string
  detectedAt: Date
}

export interface FlowChange {
  type: 'add_dependency' | 'remove_dependency' | 'change_priority'
  jobId: string
  details: Record<string, any>
}

export interface SimulationResult {
  originalDuration: number
  projectedDuration: number
  improvement: number // percentage
  risks: string[]
}