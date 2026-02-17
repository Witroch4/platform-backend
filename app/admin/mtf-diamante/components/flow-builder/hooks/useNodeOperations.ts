"use client";

import { useCallback, useMemo } from "react";
import type { Node } from "@xyflow/react";
import { FlowNodeType, type FlowNodeData } from "@/types/flow-builder";
import type { FlowDialogsState } from "./useFlowDialogs";

/**
 * Hook que gerencia operações de nós: seleção, duplo clique, atualização.
 */
export function useNodeOperations(
	nodes: Node[],
	updateNodeData: (id: string, data: Partial<FlowNodeData>) => void,
	dialogs: FlowDialogsState,
) {
	/** Nó atualmente selecionado */
	const selectedNode = useMemo(
		() => (dialogs.selectedNodeId ? (nodes.find((n) => n.id === dialogs.selectedNodeId) ?? null) : null),
		[nodes, dialogs.selectedNodeId],
	);

	/** Handler para seleção de nó (click) */
	const handleNodeSelect = useCallback(
		(nodeId: string | null) => {
			dialogs.setSelectedNodeId(nodeId);
		},
		[dialogs],
	);

	/**
	 * Handler para duplo clique no nó.
	 * Abre o dialog apropriado baseado no tipo do nó.
	 */
	const handleNodeDoubleClick = useCallback(
		(nodeId: string) => {
			const node = nodes.find((n) => n.id === nodeId);
			if (!node) return;

			// Nodes with full inline editing — no detail dialog needed
			const inlineOnlyNodes = [FlowNodeType.DELAY, FlowNodeType.QUICK_REPLIES, FlowNodeType.CAROUSEL];
			if (inlineOnlyNodes.includes(node.type as FlowNodeType)) return;

			// TEMPLATE nodes (including specialized templates) use a dedicated dialog
			const templateNodeTypes = [
				FlowNodeType.TEMPLATE,
				FlowNodeType.WHATSAPP_TEMPLATE,
				FlowNodeType.BUTTON_TEMPLATE,
				FlowNodeType.URL_TEMPLATE,
				FlowNodeType.CALL_TEMPLATE,
				FlowNodeType.COUPON_TEMPLATE,
			];
			if (templateNodeTypes.includes(node.type as FlowNodeType)) {
				dialogs.openTemplateDialog(nodeId);
				return;
			}

			dialogs.openNodeDialog(nodeId);
		},
		[nodes, dialogs],
	);

	/** Handler para atualização de dados do nó */
	const handleUpdateNodeData = useCallback(
		(nodeId: string, data: Partial<FlowNodeData>) => {
			updateNodeData(nodeId, data);
		},
		[updateNodeData],
	);

	return {
		selectedNode,
		handleNodeSelect,
		handleNodeDoubleClick,
		handleUpdateNodeData,
	};
}

export type NodeOperationsState = ReturnType<typeof useNodeOperations>;
