import dagre from "@dagrejs/dagre";
import type { Node, Edge } from "@xyflow/react";
import { DEFAULT_NODE_WIDTH, DEFAULT_NODE_HEIGHT, NODE_SPACING_X, NODE_SPACING_Y } from "../constants/canvas";
import type { CanvasNode, CanvasConnection, CanvasLayoutResult } from "../types/canvas";

export interface LayoutOptions {
	direction?: "LR" | "RL" | "TB" | "BT";
	nodeSpacingX?: number;
	nodeSpacingY?: number;
}

/**
 * Calculate layout using Dagre algorithm (same as n8n)
 */
export function calculateLayout(
	nodes: CanvasNode[],
	edges: CanvasConnection[],
	options: LayoutOptions = {},
): CanvasLayoutResult {
	const { direction = "TB", nodeSpacingX = NODE_SPACING_X, nodeSpacingY = NODE_SPACING_Y } = options;

	// Create dagre graph
	const graph = new dagre.graphlib.Graph();
	graph.setDefaultEdgeLabel(() => ({}));

	// Configure graph
	graph.setGraph({
		rankdir: direction,
		nodesep: nodeSpacingY,
		ranksep: nodeSpacingX,
		edgesep: nodeSpacingX / 2,
	});

	// Add nodes to graph
	nodes.forEach((node) => {
		const width = (node.width as number) || DEFAULT_NODE_WIDTH;
		const height = (node.height as number) || DEFAULT_NODE_HEIGHT;

		graph.setNode(node.id, { width, height });
	});

	// Add edges to graph
	edges.forEach((edge) => {
		graph.setEdge(edge.source, edge.target);
	});

	// Run dagre layout algorithm
	dagre.layout(graph);

	// Extract node positions
	const layoutNodes = nodes.map((node) => {
		const positioned = graph.node(node.id);
		const width = (node.width as number) || DEFAULT_NODE_WIDTH;
		const height = (node.height as number) || DEFAULT_NODE_HEIGHT;

		return {
			id: node.id,
			x: positioned.x - width / 2,
			y: positioned.y - height / 2,
			width,
			height,
		};
	});

	// Calculate bounding box
	const boundingBox = calculateBoundingBox(layoutNodes);

	return {
		nodes: layoutNodes,
		boundingBox,
	};
}

/**
 * Apply layout to nodes
 */
export function applyLayout(nodes: CanvasNode[], edges: CanvasConnection[], options?: LayoutOptions): CanvasNode[] {
	const layout = calculateLayout(nodes, edges, options);

	return nodes.map((node) => {
		const layoutNode = layout.nodes.find((n) => n.id === node.id);
		if (!layoutNode) return node;

		return {
			...node,
			position: {
				x: layoutNode.x,
				y: layoutNode.y,
			},
		};
	});
}

/**
 * Calculate bounding box for nodes
 */
function calculateBoundingBox(nodes: Array<{ id: string; x: number; y: number; width: number; height: number }>) {
	if (nodes.length === 0) {
		return { x: 0, y: 0, width: 0, height: 0 };
	}

	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;

	nodes.forEach((node) => {
		minX = Math.min(minX, node.x);
		minY = Math.min(minY, node.y);
		maxX = Math.max(maxX, node.x + node.width);
		maxY = Math.max(maxY, node.y + node.height);
	});

	return {
		x: minX,
		y: minY,
		width: maxX - minX,
		height: maxY - minY,
	};
}

/**
 * Get layout for selected nodes only
 */
export function layoutSelection(
	allNodes: CanvasNode[],
	selectedIds: string[],
	edges: CanvasConnection[],
	options?: LayoutOptions,
): CanvasNode[] {
	const selectedNodes = allNodes.filter((n) => selectedIds.includes(n.id));
	const selectedEdges = edges.filter((e) => selectedIds.includes(e.source) && selectedIds.includes(e.target));

	const layoutedNodes = applyLayout(selectedNodes, selectedEdges, options);

	return allNodes.map((node) => {
		const layoutedNode = layoutedNodes.find((n) => n.id === node.id);
		return layoutedNode || node;
	});
}
