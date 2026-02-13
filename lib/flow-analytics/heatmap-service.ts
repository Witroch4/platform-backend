/**
 * Heatmap Calculation Service
 * 
 * Calculates node-level metrics for flow heatmap visualization:
 * - Visit counts per node
 * - Percentages relative to START node
 * - Drop-off rates per node
 * - Health status classification
 * - Bottleneck identification
 * 
 * Validates Requirements: 2.2, 2.3, 2.4, 2.5, 2.6, 2.10
 */

import type { FlowNodeType, ExecutionLogEntry } from '@/types/flow-engine';

// =============================================================================
// TYPES
// =============================================================================

export interface NodeHeatmapData {
  nodeId: string;
  nodeName: string;
  nodeType: FlowNodeType;
  visitCount: number;
  visitPercentage: number; // relative to START
  avgTimeBeforeLeaving: number; // milliseconds
  dropOffRate: number;
  healthStatus: 'healthy' | 'moderate' | 'critical';
  isBottleneck: boolean;
}

export interface FlowSessionInput {
  executionLog: ExecutionLogEntry[];
  status: string;
  createdAt: Date;
  completedAt: Date | null;
}

export interface RuntimeFlowNode {
  id: string;
  nodeType: FlowNodeType;
  config: Record<string, unknown>;
}

export interface RuntimeFlowData {
  nodes: RuntimeFlowNode[];
}

// =============================================================================
// INTERNAL METRICS TRACKING
// =============================================================================

interface NodeMetrics {
  visitCount: number;
  dropOffs: number;
  totalTimeBeforeLeaving: number;
}

// =============================================================================
// MAIN CALCULATION FUNCTION
// =============================================================================

/**
 * Calculate heatmap data for a flow based on session execution logs.
 * 
 * @param sessions - Array of flow sessions with execution logs
 * @param flow - Runtime flow definition with nodes
 * @returns Array of node heatmap data with metrics
 */
export function calculateHeatmapData(
  sessions: FlowSessionInput[],
  flow: RuntimeFlowData
): NodeHeatmapData[] {
  // Handle empty dataset
  if (sessions.length === 0) {
    return [];
  }

  // Initialize metrics tracking for all nodes
  const nodeMetrics = new Map<string, NodeMetrics>();

  // Process each session's execution log
  for (const session of sessions) {
    const log = session.executionLog;
    
    // Track which nodes were visited in this session (unique visits)
    const visitedNodes = new Set<string>();

    for (const entry of log) {
      // Count unique visits per session
      if (!visitedNodes.has(entry.nodeId)) {
        visitedNodes.add(entry.nodeId);
        
        const metrics = nodeMetrics.get(entry.nodeId) || {
          visitCount: 0,
          dropOffs: 0,
          totalTimeBeforeLeaving: 0,
        };
        
        metrics.visitCount++;
        nodeMetrics.set(entry.nodeId, metrics);
      }
    }

    // Track drop-offs (sessions that didn't complete)
    if (session.status !== 'COMPLETED' && log.length > 0) {
      const lastEntry = log[log.length - 1];
      const lastNodeId = lastEntry.nodeId;
      
      const metrics = nodeMetrics.get(lastNodeId);
      if (metrics) {
        metrics.dropOffs++;
        
        // Calculate time before leaving
        const timeBeforeLeaving = session.completedAt
          ? new Date(session.completedAt).getTime() - lastEntry.timestamp
          : Date.now() - lastEntry.timestamp;
        
        metrics.totalTimeBeforeLeaving += timeBeforeLeaving;
      }
    }
  }

  // Calculate START node visits for percentage calculations
  const startNodeVisits = nodeMetrics.get('START')?.visitCount || sessions.length;

  // Convert metrics to heatmap data
  const heatmapData: NodeHeatmapData[] = [];

  for (const [nodeId, metrics] of nodeMetrics.entries()) {
    // Find node details from flow definition
    const node = flow.nodes.find(n => n.id === nodeId);
    const nodeName = node ? getNodeName(node) : nodeId;
    const nodeType = node?.nodeType || 'TEXT_MESSAGE';

    // Calculate drop-off rate
    const dropOffRate = metrics.visitCount > 0
      ? (metrics.dropOffs / metrics.visitCount) * 100
      : 0;

    // Calculate average time before leaving
    const avgTimeBeforeLeaving = metrics.dropOffs > 0
      ? metrics.totalTimeBeforeLeaving / metrics.dropOffs
      : 0;

    // Calculate visit percentage relative to START
    const visitPercentage = startNodeVisits > 0
      ? (metrics.visitCount / startNodeVisits) * 100
      : 0;

    // Determine health status based on drop-off rate
    const healthStatus = getHealthStatus(dropOffRate);

    // Identify bottlenecks (critical drop-off rate)
    const isBottleneck = dropOffRate > 50;

    heatmapData.push({
      nodeId,
      nodeName,
      nodeType,
      visitCount: metrics.visitCount,
      visitPercentage,
      avgTimeBeforeLeaving,
      dropOffRate,
      healthStatus,
      isBottleneck,
    });
  }

  // Sort by visit count descending for consistent ordering
  heatmapData.sort((a, b) => b.visitCount - a.visitCount);

  return heatmapData;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Extract node name from node configuration.
 * Falls back to nodeId if name is not available.
 */
function getNodeName(node: RuntimeFlowNode): string {
  const config = node.config;
  
  // Try common name fields
  if (config.name && typeof config.name === 'string') {
    return config.name;
  }
  
  if (config.label && typeof config.label === 'string') {
    return config.label;
  }
  
  if (config.text && typeof config.text === 'string') {
    return config.text.substring(0, 50); // Truncate long text
  }
  
  // Fallback to node type + ID
  return `${node.nodeType}_${node.id.substring(0, 8)}`;
}

/**
 * Determine health status based on drop-off rate.
 * 
 * Validates Requirement 2.6:
 * - healthy: drop-off < 20%
 * - moderate: 20% <= drop-off < 50%
 * - critical: drop-off >= 50%
 */
function getHealthStatus(dropOffRate: number): 'healthy' | 'moderate' | 'critical' {
  if (dropOffRate < 20) {
    return 'healthy';
  }
  if (dropOffRate < 50) {
    return 'moderate';
  }
  return 'critical';
}

// =============================================================================
// VALIDATION HELPERS
// =============================================================================

/**
 * Validate that visit percentage is within valid bounds (0-100).
 * Used for property-based testing validation.
 */
export function isValidVisitPercentage(percentage: number): boolean {
  return percentage >= 0 && percentage <= 100;
}

/**
 * Validate that drop-off rate calculation is correct.
 * Used for property-based testing validation.
 */
export function validateDropOffRate(dropOffs: number, visitCount: number, calculatedRate: number): boolean {
  if (visitCount === 0) {
    return calculatedRate === 0;
  }
  
  const expectedRate = (dropOffs / visitCount) * 100;
  // Allow small floating point differences
  return Math.abs(calculatedRate - expectedRate) < 0.01;
}

/**
 * Validate that health status matches drop-off rate classification.
 * Used for property-based testing validation.
 */
export function validateHealthStatus(dropOffRate: number, healthStatus: string): boolean {
  if (dropOffRate < 20) {
    return healthStatus === 'healthy';
  }
  if (dropOffRate < 50) {
    return healthStatus === 'moderate';
  }
  return healthStatus === 'critical';
}
