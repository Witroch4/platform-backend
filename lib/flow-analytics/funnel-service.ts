/**
 * Funnel Calculation Service
 * 
 * Calculates conversion funnel metrics showing user progression through the flow.
 * Analyzes sequential progression from START to END, identifying drop-off points
 * and conversion rates at each major milestone.
 * 
 * Validates Requirements: 3.2, 3.3, 3.4, 3.5, 3.8
 */

import type { ExecutionLogEntry, RuntimeFlowNode } from '@/types/flow-engine';
import type { FlowSessionInput, RuntimeFlowData } from './heatmap-service';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Represents a single step in the conversion funnel
 */
export interface FunnelStep {
  /** Sequential index of this step (0-based) */
  stepIndex: number;
  /** Node ID for this funnel step */
  nodeId: string;
  /** Display name of the node */
  nodeName: string;
  /** Number of sessions that reached this step */
  sessionCount: number;
  /** Percentage of sessions relative to START (0-100) */
  percentage: number;
  /** Number of sessions lost between this step and the next */
  dropOffCount: number;
  /** Percentage of sessions lost between this step and the next (0-100) */
  dropOffPercentage: number;
}

// =============================================================================
// MAIN CALCULATION FUNCTION
// =============================================================================

/**
 * Calculate funnel data showing user progression through the flow.
 * 
 * Funnel steps are defined as key milestone nodes:
 * - START node (always first)
 * - Major interactive nodes (INTERACTIVE_MESSAGE)
 * - END node (always last if present)
 * 
 * @param sessions - Array of flow sessions with execution logs
 * @param flow - Runtime flow definition with nodes
 * @returns Array of funnel steps with progression metrics
 */
export function calculateFunnelData(
  sessions: FlowSessionInput[],
  flow: RuntimeFlowData
): FunnelStep[] {
  // Handle empty dataset
  if (sessions.length === 0) {
    return [];
  }

  // Define funnel steps from flow structure
  const funnelNodeIds = defineFunnelSteps(flow);

  // Handle case where no funnel steps are defined
  if (funnelNodeIds.length === 0) {
    return [];
  }

  // Calculate session counts for each funnel step
  const stepCounts = calculateStepCounts(sessions, funnelNodeIds);

  // Get START node count for percentage calculations
  const startCount = stepCounts[0] || 0;

  // Build funnel steps with metrics
  const funnelSteps: FunnelStep[] = [];

  for (let i = 0; i < funnelNodeIds.length; i++) {
    const nodeId = funnelNodeIds[i];
    const sessionCount = stepCounts[i] || 0;
    
    // Calculate percentage relative to START
    const percentage = startCount > 0 ? (sessionCount / startCount) * 100 : 0;

    // Calculate drop-off to next step
    const nextStepCount = i < funnelNodeIds.length - 1 ? (stepCounts[i + 1] || 0) : sessionCount;
    const dropOffCount = sessionCount - nextStepCount;
    const dropOffPercentage = sessionCount > 0 ? (dropOffCount / sessionCount) * 100 : 0;

    // Find node details
    const node = flow.nodes.find(n => n.id === nodeId);
    const nodeName = node ? getNodeName(node) : nodeId;

    funnelSteps.push({
      stepIndex: i,
      nodeId,
      nodeName,
      sessionCount,
      percentage: Math.round(percentage * 100) / 100, // Round to 2 decimals
      dropOffCount,
      dropOffPercentage: Math.round(dropOffPercentage * 100) / 100,
    });
  }

  return funnelSteps;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Define funnel steps from flow structure.
 * 
 * Funnel steps include:
 * 1. START node (always first)
 * 2. Major interactive nodes (INTERACTIVE_MESSAGE nodes)
 * 3. END node (always last if present)
 * 
 * @param flow - Runtime flow definition
 * @returns Array of node IDs representing funnel steps in order
 */
function defineFunnelSteps(flow: RuntimeFlowData): string[] {
  const steps: string[] = [];

  // Find START node (always first step)
  const startNode = flow.nodes.find(n => n.nodeType === 'START');
  if (startNode) {
    steps.push(startNode.id);
  }

  // Find major interactive nodes (key conversion points)
  const interactiveNodes = flow.nodes.filter(n => n.nodeType === 'INTERACTIVE_MESSAGE');
  
  // Sort interactive nodes by their position in typical flow execution
  // For now, use the order they appear in the nodes array
  // In a more sophisticated implementation, we could use graph traversal
  for (const node of interactiveNodes) {
    steps.push(node.id);
  }

  // Find END node (always last step if present)
  const endNode = flow.nodes.find(n => n.nodeType === 'END');
  if (endNode) {
    steps.push(endNode.id);
  }

  return steps;
}

/**
 * Calculate session counts for each funnel step.
 * 
 * A session "reaches" a step if its execution log contains all nodes
 * up to and including that step in the funnel sequence.
 * 
 * @param sessions - Array of flow sessions
 * @param funnelNodeIds - Ordered array of funnel step node IDs
 * @returns Array of session counts per step (same length as funnelNodeIds)
 */
function calculateStepCounts(
  sessions: FlowSessionInput[],
  funnelNodeIds: string[]
): number[] {
  const stepCounts: number[] = new Array(funnelNodeIds.length).fill(0);

  for (const session of sessions) {
    const log = session.executionLog;
    
    // Track which funnel nodes were visited
    const visitedFunnelNodes = new Set<string>();
    
    for (const entry of log) {
      if (funnelNodeIds.includes(entry.nodeId)) {
        visitedFunnelNodes.add(entry.nodeId);
      }
    }

    // Count this session for each funnel step it reached
    // A session reaches a step if it visited that node AND all previous funnel nodes
    for (let i = 0; i < funnelNodeIds.length; i++) {
      const currentNodeId = funnelNodeIds[i];
      
      // Check if session visited this node
      if (!visitedFunnelNodes.has(currentNodeId)) {
        // Session didn't reach this step, so it won't reach any subsequent steps
        break;
      }

      // Check if session visited all previous funnel nodes
      let reachedAllPrevious = true;
      for (let j = 0; j < i; j++) {
        if (!visitedFunnelNodes.has(funnelNodeIds[j])) {
          reachedAllPrevious = false;
          break;
        }
      }

      if (reachedAllPrevious) {
        stepCounts[i]++;
      } else {
        // If didn't reach all previous steps, can't count this or subsequent steps
        break;
      }
    }
  }

  return stepCounts;
}

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

// =============================================================================
// VALIDATION HELPERS
// =============================================================================

/**
 * Validate that funnel step percentage is within valid bounds (0-100).
 * Used for property-based testing validation.
 */
export function isValidFunnelPercentage(percentage: number): boolean {
  return percentage >= 0 && percentage <= 100;
}

/**
 * Validate that drop-off calculation is correct.
 * Used for property-based testing validation.
 * 
 * Validates Property 7: Funnel Drop-off Calculation
 */
export function validateDropOffCalculation(
  currentStepCount: number,
  nextStepCount: number,
  calculatedDropOffPercentage: number
): boolean {
  if (currentStepCount === 0) {
    return calculatedDropOffPercentage === 0;
  }
  
  const dropOffCount = currentStepCount - nextStepCount;
  const expectedPercentage = (dropOffCount / currentStepCount) * 100;
  
  // Allow small floating point differences
  return Math.abs(calculatedDropOffPercentage - expectedPercentage) < 0.01;
}

/**
 * Validate that session count at each step is monotonically decreasing.
 * Each subsequent step should have equal or fewer sessions than the previous step.
 * 
 * Used for property-based testing validation.
 */
export function validateMonotonicDecrease(funnelSteps: FunnelStep[]): boolean {
  for (let i = 1; i < funnelSteps.length; i++) {
    if (funnelSteps[i].sessionCount > funnelSteps[i - 1].sessionCount) {
      return false;
    }
  }
  return true;
}

/**
 * Validate that a session reaches a funnel step only if it reached all previous steps.
 * This ensures funnel integrity.
 * 
 * Used for property-based testing validation.
 * Validates Property 6: Funnel Step Counting
 */
export function validateFunnelStepReached(
  executionLog: ExecutionLogEntry[],
  funnelNodeIds: string[],
  stepIndex: number
): boolean {
  const visitedNodes = new Set(executionLog.map(e => e.nodeId));
  
  // Check if current step node was visited
  if (!visitedNodes.has(funnelNodeIds[stepIndex])) {
    return false;
  }
  
  // Check if all previous step nodes were visited
  for (let i = 0; i < stepIndex; i++) {
    if (!visitedNodes.has(funnelNodeIds[i])) {
      return false;
    }
  }
  
  return true;
}
