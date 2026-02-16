/**
 * Property-Based Tests for Heatmap Calculations
 *
 * Tests universal correctness properties across randomized inputs using fast-check.
 * Each property validates specific requirements from the design document.
 *
 * Feature: flow-admin-quality-dashboard
 * Validates Requirements: 2.2, 2.3, 2.5, 2.6
 */

import fc from "fast-check";
import {
	calculateHeatmapData,
	isValidVisitPercentage,
	validateDropOffRate,
	validateHealthStatus,
	type FlowSessionInput,
	type RuntimeFlowData,
	type NodeHeatmapData,
} from "@/lib/flow-analytics/heatmap-service";
import type { ExecutionLogEntry, FlowNodeType } from "@/types/flow-engine";

// =============================================================================
// ARBITRARIES (Test Data Generators)
// =============================================================================

/**
 * Generate a valid node ID
 */
const nodeIdArbitrary = fc.oneof(fc.constant("START"), fc.constant("END"), fc.stringMatching(/^NODE_[0-9]+$/));

/**
 * Generate a valid node type
 */
const nodeTypeArbitrary = fc.constantFrom<FlowNodeType>(
	"START",
	"INTERACTIVE_MESSAGE",
	"TEXT_MESSAGE",
	"MEDIA",
	"DELAY",
	"REACTION",
);

/**
 * Generate a valid session status
 */
const sessionStatusArbitrary = fc.constantFrom("COMPLETED", "ERROR", "ACTIVE", "WAITING_INPUT");

/**
 * Generate an execution log entry
 */
const executionLogEntryArbitrary = fc.record<ExecutionLogEntry>({
	nodeId: nodeIdArbitrary,
	timestamp: fc.integer({ min: 1000000000000, max: Date.now() }),
	durationMs: fc.nat(10000),
	deliveryMode: fc.constantFrom("sync", "async"),
	result: fc.constantFrom("ok", "error", "skipped"),
	action: fc.string({ minLength: 1, maxLength: 50 }),
	detail: fc.option(fc.string({ maxLength: 100 }), { nil: undefined }),
});

/**
 * Generate a flow session with execution log
 * Ensures START node is always first in the log
 */
const flowSessionArbitrary = fc.record<FlowSessionInput>({
	executionLog: fc.array(executionLogEntryArbitrary, { minLength: 1, maxLength: 20 }).map((entries) => {
		// Ensure START node is first
		const startEntry: ExecutionLogEntry = {
			nodeId: "START",
			timestamp: entries[0]?.timestamp || Date.now() - 10000,
			durationMs: 100,
			deliveryMode: "sync",
			result: "ok",
			action: "start",
		};
		return [startEntry, ...entries];
	}),
	status: sessionStatusArbitrary,
	createdAt: fc.date({ min: new Date("2024-01-01"), max: new Date() }),
	completedAt: fc.option(fc.date({ min: new Date("2024-01-01"), max: new Date() }), { nil: null }),
});

/**
 * Generate a runtime flow node
 */
const runtimeFlowNodeArbitrary = fc.record({
	id: nodeIdArbitrary,
	nodeType: nodeTypeArbitrary,
	config: fc.record({
		name: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
		label: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
	}),
});

/**
 * Generate a runtime flow with nodes
 * Ensures START node is always present
 */
const runtimeFlowArbitrary = fc.record<RuntimeFlowData>({
	nodes: fc.array(runtimeFlowNodeArbitrary, { minLength: 1, maxLength: 10 }).map((nodes) => {
		// Ensure START node exists
		const hasStart = nodes.some((n) => n.id === "START");
		if (!hasStart) {
			nodes.unshift({
				id: "START",
				nodeType: "START",
				config: { name: "Start" },
			});
		}
		return nodes;
	}),
});

// =============================================================================
// PROPERTY 2: Node Visit Count Consistency
// =============================================================================

describe("Feature: flow-admin-quality-dashboard, Property 2: Node Visit Count Consistency", () => {
	it("visit count should equal number of unique sessions that have nodeId in executionLog", () => {
		fc.assert(
			fc.property(
				fc.array(flowSessionArbitrary, { minLength: 1, maxLength: 100 }),
				runtimeFlowArbitrary,
				(sessions, flow) => {
					const heatmapData = calculateHeatmapData(sessions, flow);

					// For each node in heatmap data
					for (const nodeData of heatmapData) {
						// Count sessions that visited this node
						const expectedVisitCount = sessions.filter((session) =>
							session.executionLog.some((entry) => entry.nodeId === nodeData.nodeId),
						).length;

						// Verify visit count matches
						expect(nodeData.visitCount).toBe(expectedVisitCount);
					}
				},
			),
			{ numRuns: 100 },
		);
	});

	it("visit count should never exceed total number of sessions", () => {
		fc.assert(
			fc.property(
				fc.array(flowSessionArbitrary, { minLength: 1, maxLength: 100 }),
				runtimeFlowArbitrary,
				(sessions, flow) => {
					const heatmapData = calculateHeatmapData(sessions, flow);

					for (const nodeData of heatmapData) {
						expect(nodeData.visitCount).toBeLessThanOrEqual(sessions.length);
						expect(nodeData.visitCount).toBeGreaterThan(0);
					}
				},
			),
			{ numRuns: 100 },
		);
	});
});

// =============================================================================
// PROPERTY 3: Percentage Relative to START
// =============================================================================

describe("Feature: flow-admin-quality-dashboard, Property 3: Percentage Relative to START", () => {
	it("visit percentage should equal (node visits / START visits) * 100", () => {
		fc.assert(
			fc.property(
				fc.array(flowSessionArbitrary, { minLength: 1, maxLength: 100 }),
				runtimeFlowArbitrary,
				(sessions, flow) => {
					const heatmapData = calculateHeatmapData(sessions, flow);

					// Find START node visit count
					const startNode = heatmapData.find((n) => n.nodeId === "START");
					const startVisits = startNode?.visitCount || sessions.length;

					// Verify each node's percentage
					for (const nodeData of heatmapData) {
						const expectedPercentage = (nodeData.visitCount / startVisits) * 100;

						// Allow small floating point differences
						expect(nodeData.visitPercentage).toBeCloseTo(expectedPercentage, 2);
					}
				},
			),
			{ numRuns: 100 },
		);
	});

	it("visit percentage should always be between 0 and 100 inclusive", () => {
		fc.assert(
			fc.property(
				fc.array(flowSessionArbitrary, { minLength: 1, maxLength: 100 }),
				runtimeFlowArbitrary,
				(sessions, flow) => {
					const heatmapData = calculateHeatmapData(sessions, flow);

					for (const nodeData of heatmapData) {
						expect(isValidVisitPercentage(nodeData.visitPercentage)).toBe(true);
						expect(nodeData.visitPercentage).toBeGreaterThanOrEqual(0);
						expect(nodeData.visitPercentage).toBeLessThanOrEqual(100);
					}
				},
			),
			{ numRuns: 100 },
		);
	});

	it("START node should have 100% visit percentage when present", () => {
		fc.assert(
			fc.property(
				fc.array(flowSessionArbitrary, { minLength: 1, maxLength: 100 }),
				runtimeFlowArbitrary,
				(sessions, flow) => {
					const heatmapData = calculateHeatmapData(sessions, flow);

					const startNode = heatmapData.find((n) => n.nodeId === "START");
					if (startNode) {
						// START node should have 100% or close to it (accounting for floating point)
						expect(startNode.visitPercentage).toBeCloseTo(100, 1);
					}
				},
			),
			{ numRuns: 100 },
		);
	});
});

// =============================================================================
// PROPERTY 4: Drop-off Rate Calculation
// =============================================================================

describe("Feature: flow-admin-quality-dashboard, Property 4: Drop-off Rate Calculation", () => {
	it("drop-off rate should equal (abandoned at node / visited node) * 100", () => {
		fc.assert(
			fc.property(
				fc.array(flowSessionArbitrary, { minLength: 1, maxLength: 100 }),
				runtimeFlowArbitrary,
				(sessions, flow) => {
					const heatmapData = calculateHeatmapData(sessions, flow);

					for (const nodeData of heatmapData) {
						// Count sessions that abandoned at this node
						const abandonedAtNode = sessions.filter((session) => {
							if (session.status === "COMPLETED") return false;
							if (session.executionLog.length === 0) return false;

							const lastEntry = session.executionLog[session.executionLog.length - 1];
							return lastEntry.nodeId === nodeData.nodeId;
						}).length;

						// Verify drop-off rate calculation
						const isValid = validateDropOffRate(abandonedAtNode, nodeData.visitCount, nodeData.dropOffRate);
						expect(isValid).toBe(true);
					}
				},
			),
			{ numRuns: 100 },
		);
	});

	it("drop-off rate should be 0 when visit count is 0", () => {
		fc.assert(
			fc.property(
				fc.array(flowSessionArbitrary, { minLength: 1, maxLength: 100 }),
				runtimeFlowArbitrary,
				(sessions, flow) => {
					const heatmapData = calculateHeatmapData(sessions, flow);

					for (const nodeData of heatmapData) {
						if (nodeData.visitCount === 0) {
							expect(nodeData.dropOffRate).toBe(0);
						}
					}
				},
			),
			{ numRuns: 100 },
		);
	});

	it("drop-off rate should be between 0 and 100 inclusive", () => {
		fc.assert(
			fc.property(
				fc.array(flowSessionArbitrary, { minLength: 1, maxLength: 100 }),
				runtimeFlowArbitrary,
				(sessions, flow) => {
					const heatmapData = calculateHeatmapData(sessions, flow);

					for (const nodeData of heatmapData) {
						expect(nodeData.dropOffRate).toBeGreaterThanOrEqual(0);
						expect(nodeData.dropOffRate).toBeLessThanOrEqual(100);
					}
				},
			),
			{ numRuns: 100 },
		);
	});

	it("drop-off count should never exceed visit count", () => {
		fc.assert(
			fc.property(
				fc.array(flowSessionArbitrary, { minLength: 1, maxLength: 100 }),
				runtimeFlowArbitrary,
				(sessions, flow) => {
					const heatmapData = calculateHeatmapData(sessions, flow);

					for (const nodeData of heatmapData) {
						// Drop-off rate <= 100% means drop-offs <= visits
						expect(nodeData.dropOffRate).toBeLessThanOrEqual(100);
					}
				},
			),
			{ numRuns: 100 },
		);
	});
});

// =============================================================================
// PROPERTY 5: Health Status Classification
// =============================================================================

describe("Feature: flow-admin-quality-dashboard, Property 5: Health Status Classification", () => {
	it("health status should be healthy when drop-off < 20%", () => {
		fc.assert(
			fc.property(
				fc.array(flowSessionArbitrary, { minLength: 1, maxLength: 100 }),
				runtimeFlowArbitrary,
				(sessions, flow) => {
					const heatmapData = calculateHeatmapData(sessions, flow);

					for (const nodeData of heatmapData) {
						if (nodeData.dropOffRate < 20) {
							expect(nodeData.healthStatus).toBe("healthy");
						}
					}
				},
			),
			{ numRuns: 100 },
		);
	});

	it("health status should be moderate when 20% <= drop-off < 50%", () => {
		fc.assert(
			fc.property(
				fc.array(flowSessionArbitrary, { minLength: 1, maxLength: 100 }),
				runtimeFlowArbitrary,
				(sessions, flow) => {
					const heatmapData = calculateHeatmapData(sessions, flow);

					for (const nodeData of heatmapData) {
						if (nodeData.dropOffRate >= 20 && nodeData.dropOffRate < 50) {
							expect(nodeData.healthStatus).toBe("moderate");
						}
					}
				},
			),
			{ numRuns: 100 },
		);
	});

	it("health status should be critical when drop-off >= 50%", () => {
		fc.assert(
			fc.property(
				fc.array(flowSessionArbitrary, { minLength: 1, maxLength: 100 }),
				runtimeFlowArbitrary,
				(sessions, flow) => {
					const heatmapData = calculateHeatmapData(sessions, flow);

					for (const nodeData of heatmapData) {
						if (nodeData.dropOffRate >= 50) {
							expect(nodeData.healthStatus).toBe("critical");
						}
					}
				},
			),
			{ numRuns: 100 },
		);
	});

	it("health status classification should be valid for all nodes", () => {
		fc.assert(
			fc.property(
				fc.array(flowSessionArbitrary, { minLength: 1, maxLength: 100 }),
				runtimeFlowArbitrary,
				(sessions, flow) => {
					const heatmapData = calculateHeatmapData(sessions, flow);

					for (const nodeData of heatmapData) {
						const isValid = validateHealthStatus(nodeData.dropOffRate, nodeData.healthStatus);
						expect(isValid).toBe(true);
					}
				},
			),
			{ numRuns: 100 },
		);
	});

	it("bottleneck flag should be true when drop-off >= 50%", () => {
		fc.assert(
			fc.property(
				fc.array(flowSessionArbitrary, { minLength: 1, maxLength: 100 }),
				runtimeFlowArbitrary,
				(sessions, flow) => {
					const heatmapData = calculateHeatmapData(sessions, flow);

					for (const nodeData of heatmapData) {
						if (nodeData.dropOffRate >= 50) {
							expect(nodeData.isBottleneck).toBe(true);
						} else {
							expect(nodeData.isBottleneck).toBe(false);
						}
					}
				},
			),
			{ numRuns: 100 },
		);
	});

	it("critical health status should always correspond to bottleneck", () => {
		fc.assert(
			fc.property(
				fc.array(flowSessionArbitrary, { minLength: 1, maxLength: 100 }),
				runtimeFlowArbitrary,
				(sessions, flow) => {
					const heatmapData = calculateHeatmapData(sessions, flow);

					for (const nodeData of heatmapData) {
						if (nodeData.healthStatus === "critical") {
							expect(nodeData.isBottleneck).toBe(true);
						}
					}
				},
			),
			{ numRuns: 100 },
		);
	});
});

// =============================================================================
// ADDITIONAL INVARIANTS
// =============================================================================

describe("Feature: flow-admin-quality-dashboard, Additional Heatmap Invariants", () => {
	it("should return empty array for empty session list", () => {
		fc.assert(
			fc.property(runtimeFlowArbitrary, (flow) => {
				const heatmapData = calculateHeatmapData([], flow);
				expect(heatmapData).toEqual([]);
			}),
			{ numRuns: 100 },
		);
	});

	it("should only include nodes that were actually visited", () => {
		fc.assert(
			fc.property(
				fc.array(flowSessionArbitrary, { minLength: 1, maxLength: 100 }),
				runtimeFlowArbitrary,
				(sessions, flow) => {
					const heatmapData = calculateHeatmapData(sessions, flow);

					// Collect all visited node IDs from sessions
					const visitedNodeIds = new Set<string>();
					for (const session of sessions) {
						for (const entry of session.executionLog) {
							visitedNodeIds.add(entry.nodeId);
						}
					}

					// All nodes in heatmap should have been visited
					for (const nodeData of heatmapData) {
						expect(visitedNodeIds.has(nodeData.nodeId)).toBe(true);
					}
				},
			),
			{ numRuns: 100 },
		);
	});

	it("should have consistent data structure for all nodes", () => {
		fc.assert(
			fc.property(
				fc.array(flowSessionArbitrary, { minLength: 1, maxLength: 100 }),
				runtimeFlowArbitrary,
				(sessions, flow) => {
					const heatmapData = calculateHeatmapData(sessions, flow);

					for (const nodeData of heatmapData) {
						// Verify all required fields exist
						expect(nodeData).toHaveProperty("nodeId");
						expect(nodeData).toHaveProperty("nodeName");
						expect(nodeData).toHaveProperty("nodeType");
						expect(nodeData).toHaveProperty("visitCount");
						expect(nodeData).toHaveProperty("visitPercentage");
						expect(nodeData).toHaveProperty("avgTimeBeforeLeaving");
						expect(nodeData).toHaveProperty("dropOffRate");
						expect(nodeData).toHaveProperty("healthStatus");
						expect(nodeData).toHaveProperty("isBottleneck");

						// Verify types
						expect(typeof nodeData.nodeId).toBe("string");
						expect(typeof nodeData.nodeName).toBe("string");
						expect(typeof nodeData.nodeType).toBe("string");
						expect(typeof nodeData.visitCount).toBe("number");
						expect(typeof nodeData.visitPercentage).toBe("number");
						expect(typeof nodeData.avgTimeBeforeLeaving).toBe("number");
						expect(typeof nodeData.dropOffRate).toBe("number");
						expect(typeof nodeData.healthStatus).toBe("string");
						expect(typeof nodeData.isBottleneck).toBe("boolean");
					}
				},
			),
			{ numRuns: 100 },
		);
	});

	it("avgTimeBeforeLeaving should be non-negative", () => {
		fc.assert(
			fc.property(
				fc.array(flowSessionArbitrary, { minLength: 1, maxLength: 100 }),
				runtimeFlowArbitrary,
				(sessions, flow) => {
					const heatmapData = calculateHeatmapData(sessions, flow);

					for (const nodeData of heatmapData) {
						expect(nodeData.avgTimeBeforeLeaving).toBeGreaterThanOrEqual(0);
					}
				},
			),
			{ numRuns: 100 },
		);
	});
});
