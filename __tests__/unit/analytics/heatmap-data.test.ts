/**
 * Unit Tests for Heatmap Calculation Service
 * 
 * Tests specific examples, edge cases, and error conditions for the
 * calculateHeatmapData function.
 */

import {
  calculateHeatmapData,
  isValidVisitPercentage,
  validateDropOffRate,
  validateHealthStatus,
  type FlowSessionInput,
  type RuntimeFlowData,
  type NodeHeatmapData,
} from '@/lib/flow-analytics/heatmap-service';
import type { ExecutionLogEntry } from '@/types/flow-engine';

// =============================================================================
// TEST DATA HELPERS
// =============================================================================

function createSession(
  executionLog: ExecutionLogEntry[],
  status: string = 'COMPLETED',
  completedAt: Date | null = new Date()
): FlowSessionInput {
  return {
    executionLog,
    status,
    createdAt: new Date(Date.now() - 60000), // 1 minute ago
    completedAt,
  };
}

function createLogEntry(
  nodeId: string,
  timestamp: number = Date.now(),
  nodeType: any = 'TEXT_MESSAGE'
): ExecutionLogEntry {
  return {
    nodeId,
    nodeType,
    timestamp,
    durationMs: 100,
    deliveryMode: 'sync',
    result: 'ok',
  };
}

const mockFlow: RuntimeFlowData = {
  nodes: [
    { id: 'START', nodeType: 'START', config: { name: 'Start Node' } },
    { id: 'NODE_1', nodeType: 'TEXT_MESSAGE', config: { name: 'Welcome Message' } },
    { id: 'NODE_2', nodeType: 'INTERACTIVE_MESSAGE', config: { name: 'Choose Option' } },
    { id: 'NODE_3', nodeType: 'TEXT_MESSAGE', config: { name: 'Thank You' } },
    { id: 'END', nodeType: 'END', config: { name: 'End Node' } },
  ],
};

// =============================================================================
// EDGE CASE TESTS
// =============================================================================

describe('Heatmap Calculation Service - Edge Cases', () => {
  it('should handle empty session array', () => {
    const result = calculateHeatmapData([], mockFlow);
    
    expect(result).toEqual([]);
  });

  it('should handle sessions with empty execution logs', () => {
    const sessions = [
      createSession([]),
      createSession([]),
    ];
    
    const result = calculateHeatmapData(sessions, mockFlow);
    
    expect(result).toEqual([]);
  });

  it('should handle flow with no nodes', () => {
    const sessions = [
      createSession([createLogEntry('START')]),
    ];
    
    const emptyFlow: RuntimeFlowData = { nodes: [] };
    const result = calculateHeatmapData(sessions, emptyFlow);
    
    expect(result).toHaveLength(1);
    expect(result[0].nodeId).toBe('START');
    expect(result[0].nodeName).toBe('START'); // Falls back to nodeId
  });

  it('should handle node not found in flow definition', () => {
    const sessions = [
      createSession([
        createLogEntry('START'),
        createLogEntry('UNKNOWN_NODE'),
      ]),
    ];
    
    const result = calculateHeatmapData(sessions, mockFlow);
    
    const unknownNode = result.find(n => n.nodeId === 'UNKNOWN_NODE');
    expect(unknownNode).toBeDefined();
    expect(unknownNode?.nodeName).toBe('UNKNOWN_NODE');
    expect(unknownNode?.nodeType).toBe('TEXT_MESSAGE'); // Default fallback
  });

  it('should handle division by zero in drop-off rate', () => {
    // Session with no visits to a node shouldn't cause errors
    const sessions = [
      createSession([createLogEntry('START')]),
    ];
    
    const result = calculateHeatmapData(sessions, mockFlow);
    
    // All nodes should have valid drop-off rates (0 if no visits)
    result.forEach(node => {
      expect(node.dropOffRate).toBeGreaterThanOrEqual(0);
      expect(node.dropOffRate).toBeLessThanOrEqual(100);
    });
  });
});

// =============================================================================
// VISIT COUNT TESTS (Requirement 2.2)
// =============================================================================

describe('Heatmap Calculation - Visit Counts', () => {
  it('should count unique visits per node', () => {
    const sessions = [
      createSession([createLogEntry('START'), createLogEntry('NODE_1'), createLogEntry('NODE_2')]),
      createSession([createLogEntry('START'), createLogEntry('NODE_1')]),
    ];
    
    const result = calculateHeatmapData(sessions, mockFlow);
    
    const startNode = result.find(n => n.nodeId === 'START');
    const node1 = result.find(n => n.nodeId === 'NODE_1');
    const node2 = result.find(n => n.nodeId === 'NODE_2');
    
    expect(startNode?.visitCount).toBe(2);
    expect(node1?.visitCount).toBe(2);
    expect(node2?.visitCount).toBe(1);
  });
});

// =============================================================================
// PERCENTAGE CALCULATION TESTS (Requirement 2.3)
// =============================================================================

describe('Heatmap Calculation - Visit Percentages', () => {
  it('should calculate percentages relative to START node and ensure 0-100 bounds', () => {
    const sessions = [
      createSession([createLogEntry('START'), createLogEntry('NODE_1')]),
      createSession([createLogEntry('START')]),
    ];
    
    const result = calculateHeatmapData(sessions, mockFlow);
    
    const startNode = result.find(n => n.nodeId === 'START');
    const node1 = result.find(n => n.nodeId === 'NODE_1');
    
    expect(startNode?.visitPercentage).toBe(100); // 2/2 * 100
    expect(node1?.visitPercentage).toBe(50); // 1/2 * 100
    
    result.forEach(node => {
      expect(isValidVisitPercentage(node.visitPercentage)).toBe(true);
    });
  });
});

// =============================================================================
// DROP-OFF RATE TESTS (Requirement 2.5)
// =============================================================================

describe('Heatmap Calculation - Drop-off Rates', () => {
  it('should calculate drop-off rate correctly and identify last node', () => {
    const sessions = [
      createSession([createLogEntry('START'), createLogEntry('NODE_1')], 'COMPLETED'),
      createSession([createLogEntry('START'), createLogEntry('NODE_1')], 'ERROR'), // Drop-off at NODE_1
    ];
    
    const result = calculateHeatmapData(sessions, mockFlow);
    
    const node1 = result.find(n => n.nodeId === 'NODE_1');
    
    // 1 drop-off out of 2 visits = 50%
    expect(node1?.dropOffRate).toBe(50);
    expect(validateDropOffRate(1, 2, node1?.dropOffRate || 0)).toBe(true);
  });

  it('should not count completed sessions as drop-offs', () => {
    const sessions = [
      createSession([createLogEntry('START'), createLogEntry('NODE_1')], 'COMPLETED'),
      createSession([createLogEntry('START'), createLogEntry('NODE_1')], 'COMPLETED'),
    ];
    
    const result = calculateHeatmapData(sessions, mockFlow);
    
    const node1 = result.find(n => n.nodeId === 'NODE_1');
    expect(node1?.dropOffRate).toBe(0); // No drop-offs
  });
});

// =============================================================================
// HEALTH STATUS TESTS (Requirement 2.6)
// =============================================================================

describe('Heatmap Calculation - Health Status', () => {
  it('should classify health status correctly (healthy < 20%, moderate 20-50%, critical >= 50%)', () => {
    // Healthy: 1/6 = 16.67%
    const sessionsHealthy = [
      ...Array(5).fill(null).map(() => createSession([createLogEntry('START'), createLogEntry('NODE_1')], 'COMPLETED')),
      createSession([createLogEntry('START'), createLogEntry('NODE_1')], 'ERROR'),
    ];
    
    const resultHealthy = calculateHeatmapData(sessionsHealthy, mockFlow);
    const nodeHealthy = resultHealthy.find(n => n.nodeId === 'NODE_1');
    expect(nodeHealthy?.healthStatus).toBe('healthy');
    expect(validateHealthStatus(nodeHealthy?.dropOffRate || 0, nodeHealthy?.healthStatus || '')).toBe(true);

    // Moderate: 1/3 = 33.33%
    const sessionsModerate = [
      createSession([createLogEntry('START'), createLogEntry('NODE_2')], 'COMPLETED'),
      createSession([createLogEntry('START'), createLogEntry('NODE_2')], 'COMPLETED'),
      createSession([createLogEntry('START'), createLogEntry('NODE_2')], 'ERROR'),
    ];
    
    const resultModerate = calculateHeatmapData(sessionsModerate, mockFlow);
    const nodeModerate = resultModerate.find(n => n.nodeId === 'NODE_2');
    expect(nodeModerate?.healthStatus).toBe('moderate');

    // Critical: 2/3 = 66.67%
    const sessionsCritical = [
      createSession([createLogEntry('START'), createLogEntry('NODE_3')], 'COMPLETED'),
      createSession([createLogEntry('START'), createLogEntry('NODE_3')], 'ERROR'),
      createSession([createLogEntry('START'), createLogEntry('NODE_3')], 'ERROR'),
    ];
    
    const resultCritical = calculateHeatmapData(sessionsCritical, mockFlow);
    const nodeCritical = resultCritical.find(n => n.nodeId === 'NODE_3');
    expect(nodeCritical?.healthStatus).toBe('critical');
  });
});

// =============================================================================
// BOTTLENECK IDENTIFICATION TESTS (Requirement 2.10)
// =============================================================================

describe('Heatmap Calculation - Bottleneck Identification', () => {
  it('should identify nodes with >50% drop-off as bottlenecks', () => {
    const sessions = [
      createSession([createLogEntry('START'), createLogEntry('NODE_1')], 'COMPLETED'),
      createSession([createLogEntry('START'), createLogEntry('NODE_1')], 'ERROR'),
      createSession([createLogEntry('START'), createLogEntry('NODE_1')], 'ERROR'),
    ];
    
    const result = calculateHeatmapData(sessions, mockFlow);
    
    const node1 = result.find(n => n.nodeId === 'NODE_1');
    expect(node1?.dropOffRate).toBeCloseTo(66.67, 1); // 2/3 * 100
    expect(node1?.isBottleneck).toBe(true);
  });
});

// =============================================================================
// TIME CALCULATION TESTS (Requirement 2.4)
// =============================================================================

describe('Heatmap Calculation - Average Time Before Leaving', () => {
  it('should calculate average time before leaving for drop-offs', () => {
    const now = Date.now();
    const sessions = [
      createSession(
        [createLogEntry('START', now), createLogEntry('NODE_1', now + 5000)],
        'ERROR',
        new Date(now + 10000) // 5 seconds after last node
      ),
      createSession(
        [createLogEntry('START', now), createLogEntry('NODE_1', now + 5000)],
        'ERROR',
        new Date(now + 15000) // 10 seconds after last node
      ),
    ];
    
    const result = calculateHeatmapData(sessions, mockFlow);
    
    const node1 = result.find(n => n.nodeId === 'NODE_1');
    // Average: (5000 + 10000) / 2 = 7500ms
    expect(node1?.avgTimeBeforeLeaving).toBe(7500);
  });

  it('should return 0 for nodes with no drop-offs', () => {
    const sessions = [
      createSession([createLogEntry('START'), createLogEntry('NODE_1')], 'COMPLETED'),
    ];
    
    const result = calculateHeatmapData(sessions, mockFlow);
    
    const node1 = result.find(n => n.nodeId === 'NODE_1');
    expect(node1?.avgTimeBeforeLeaving).toBe(0);
  });
});

// =============================================================================
// NODE NAME EXTRACTION TESTS
// =============================================================================

describe('Heatmap Calculation - Node Name Extraction', () => {
  it('should extract name from config.name', () => {
    const sessions = [createSession([createLogEntry('NODE_1')])];
    const result = calculateHeatmapData(sessions, mockFlow);
    
    const node1 = result.find(n => n.nodeId === 'NODE_1');
    expect(node1?.nodeName).toBe('Welcome Message');
  });

  it('should fallback to nodeId when name not available', () => {
    const flowWithoutNames: RuntimeFlowData = {
      nodes: [{ id: 'TEST_NODE', nodeType: 'TEXT_MESSAGE', config: {} }],
    };
    
    const sessions = [createSession([createLogEntry('TEST_NODE')])];
    const result = calculateHeatmapData(sessions, flowWithoutNames);
    
    // Should contain nodeType and first 8 chars of nodeId
    expect(result[0].nodeName).toContain('TEXT_MESSAGE');
    expect(result[0].nodeName).toMatch(/TEST_NOD/); // First 8 chars
  });
});

// =============================================================================
// SORTING TESTS
// =============================================================================

describe('Heatmap Calculation - Result Sorting', () => {
  it('should sort results by visit count descending', () => {
    const sessions = [
      createSession([createLogEntry('START'), createLogEntry('NODE_1'), createLogEntry('NODE_2')]),
      createSession([createLogEntry('START'), createLogEntry('NODE_1')]),
    ];
    
    const result = calculateHeatmapData(sessions, mockFlow);
    
    // Should be sorted: START (2), NODE_1 (2), NODE_2 (1)
    expect(result[0].visitCount).toBeGreaterThanOrEqual(result[1].visitCount);
    expect(result[1].visitCount).toBeGreaterThanOrEqual(result[2].visitCount);
  });
});

// =============================================================================
// ADDITIONAL EDGE CASE TESTS (Task 6.3)
// Tests for: flow with no sessions, single-node flow, all nodes 100% completion
// =============================================================================

describe('Heatmap Calculation - Additional Edge Cases (Requirements 2.2, 2.3, 2.5)', () => {
  it('should handle flow with no sessions - return empty array', () => {
    // Test case: Flow exists but has never been executed
    const result = calculateHeatmapData([], mockFlow);
    
    expect(result).toEqual([]);
    expect(result.length).toBe(0);
  });

  it('should handle single-node flow - calculate metrics correctly with only START node', () => {
    // Test case: Flow with only START node
    const singleNodeFlow: RuntimeFlowData = {
      nodes: [
        { id: 'START', nodeType: 'START', config: { name: 'Start Node' } },
      ],
    };
    
    const sessions = [
      createSession([createLogEntry('START')], 'COMPLETED'),
      createSession([createLogEntry('START')], 'COMPLETED'),
      createSession([createLogEntry('START')], 'ERROR'), // One drop-off
    ];
    
    const result = calculateHeatmapData(sessions, singleNodeFlow);
    
    // Should have exactly one node
    expect(result).toHaveLength(1);
    
    const startNode = result[0];
    expect(startNode.nodeId).toBe('START');
    expect(startNode.visitCount).toBe(3);
    expect(startNode.visitPercentage).toBe(100); // START is always 100%
    expect(startNode.dropOffRate).toBeCloseTo(33.33, 1); // 1/3 * 100
    expect(startNode.healthStatus).toBe('moderate'); // 33.33% is in moderate range (20-50%)
    expect(startNode.isBottleneck).toBe(false); // Not >= 50%
    
    // Validate all metrics are within expected bounds
    expect(isValidVisitPercentage(startNode.visitPercentage)).toBe(true);
    expect(validateDropOffRate(1, 3, startNode.dropOffRate)).toBe(true);
    expect(validateHealthStatus(startNode.dropOffRate, startNode.healthStatus)).toBe(true);
  });

  it('should handle all nodes with 100% completion - drop-off rates should be 0%, health status healthy', () => {
    // Test case: Perfect flow execution - all sessions complete successfully
    const sessions = [
      createSession([
        createLogEntry('START'),
        createLogEntry('NODE_1'),
        createLogEntry('NODE_2'),
        createLogEntry('NODE_3'),
        createLogEntry('END'),
      ], 'COMPLETED'),
      createSession([
        createLogEntry('START'),
        createLogEntry('NODE_1'),
        createLogEntry('NODE_2'),
        createLogEntry('NODE_3'),
        createLogEntry('END'),
      ], 'COMPLETED'),
      createSession([
        createLogEntry('START'),
        createLogEntry('NODE_1'),
        createLogEntry('NODE_2'),
        createLogEntry('NODE_3'),
        createLogEntry('END'),
      ], 'COMPLETED'),
    ];
    
    const result = calculateHeatmapData(sessions, mockFlow);
    
    // All nodes should be present
    expect(result.length).toBeGreaterThan(0);
    
    // Check each node has 0% drop-off and healthy status
    result.forEach(node => {
      expect(node.dropOffRate).toBe(0); // No drop-offs
      expect(node.healthStatus).toBe('healthy'); // 0% < 20% = healthy
      expect(node.isBottleneck).toBe(false); // 0% < 50% = not a bottleneck
      expect(node.avgTimeBeforeLeaving).toBe(0); // No drop-offs means no time calculation
      
      // Validate metrics
      expect(isValidVisitPercentage(node.visitPercentage)).toBe(true);
      expect(validateDropOffRate(0, node.visitCount, node.dropOffRate)).toBe(true);
      expect(validateHealthStatus(node.dropOffRate, node.healthStatus)).toBe(true);
    });
    
    // Verify START node has 100% visit percentage
    const startNode = result.find(n => n.nodeId === 'START');
    expect(startNode).toBeDefined();
    expect(startNode?.visitPercentage).toBe(100);
    expect(startNode?.visitCount).toBe(3);
    
    // Verify all other nodes have appropriate percentages
    const node1 = result.find(n => n.nodeId === 'NODE_1');
    const node2 = result.find(n => n.nodeId === 'NODE_2');
    const node3 = result.find(n => n.nodeId === 'NODE_3');
    const endNode = result.find(n => n.nodeId === 'END');
    
    expect(node1?.visitPercentage).toBe(100); // All sessions reached NODE_1
    expect(node2?.visitPercentage).toBe(100); // All sessions reached NODE_2
    expect(node3?.visitPercentage).toBe(100); // All sessions reached NODE_3
    expect(endNode?.visitPercentage).toBe(100); // All sessions reached END
  });
});
