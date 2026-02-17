"use client";

import { useCallback, useRef } from "react";
import type { Connection } from "@xyflow/react";
import { FlowNodeType } from "@/types/flow-builder";
import { useHandlePopover, type HandlePopoverState } from "../panels/HandlePopover";

interface PendingConnection {
	sourceNodeId: string;
	sourceHandleId: string;
	flowPosition: { x: number; y: number };
}

interface HandlePopoverLogicDependencies {
	addNode: (type: FlowNodeType, position: { x: number; y: number }) => string | null;
	onConnect: (connection: Connection) => void;
}

/**
 * Hook que gerencia a lógica do popover que aparece ao arrastar de um handle.
 * Combina o estado do popover com a lógica de criação de nós e conexões.
 */
export function useHandlePopoverLogic({ addNode, onConnect }: HandlePopoverLogicDependencies) {
	const { popoverState, openPopover, closePopover } = useHandlePopover();
	const pendingConnectionRef = useRef<PendingConnection | null>(null);

	/**
	 * Handler chamado quando o usuário arrasta de um handle e solta no canvas vazio.
	 * Armazena a conexão pendente e abre o popover.
	 */
	const handleConnectEnd = useCallback(
		(
			sourceNodeId: string,
			sourceHandleId: string,
			screenX: number,
			screenY: number,
			flowPosition: { x: number; y: number },
		) => {
			pendingConnectionRef.current = { sourceNodeId, sourceHandleId, flowPosition };
			openPopover(sourceNodeId, sourceHandleId, screenX, screenY);
		},
		[openPopover],
	);

	/**
	 * Handler chamado quando o usuário seleciona um tipo de nó no popover.
	 * Cria o novo nó e conecta ao handle de origem.
	 */
	const handlePopoverSelect = useCallback(
		(type: FlowNodeType) => {
			const pending = pendingConnectionRef.current;
			if (!pending) return;

			// Create new node at the drop position (offset a bit down)
			const newNodeId = addNode(type, {
				x: pending.flowPosition.x - 140,
				y: pending.flowPosition.y + 20,
			});

			// Connect source → new node
			if (newNodeId) {
				onConnect({
					source: pending.sourceNodeId,
					target: newNodeId,
					sourceHandle: pending.sourceHandleId,
					targetHandle: null,
				});
			}

			pendingConnectionRef.current = null;
			closePopover();
		},
		[addNode, onConnect, closePopover],
	);

	return {
		popoverState,
		handleConnectEnd,
		handlePopoverSelect,
		closePopover,
	};
}

export type HandlePopoverLogicState = ReturnType<typeof useHandlePopoverLogic>;
