import { useCallback } from "react";
import { useReactFlow } from "@xyflow/react";
import { applyLayout } from "../lib/layout-utils";
import type { CanvasNode, CanvasConnection } from "../types/canvas";

export function useCanvasLayout(
	nodes: CanvasNode[],
	edges: CanvasConnection[],
	setNodes: (nodes: CanvasNode[]) => void,
) {
	const { fitView } = useReactFlow();

	const tidyUp = useCallback(async () => {
		const layoutedNodes = applyLayout(nodes, edges);
		setNodes(layoutedNodes);

		// Fit view after layout
		setTimeout(() => {
			fitView({ padding: 0.2, duration: 200 });
		}, 10);
	}, [nodes, edges, setNodes, fitView]);

	return { tidyUp };
}
