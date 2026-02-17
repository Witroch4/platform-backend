"use client";

import { useCallback, useState } from "react";

/**
 * Hook que gerencia a navegação entre a lista de flows e o editor.
 * Controla qual flow está selecionado e se estamos no modo de edição.
 */
export function useFlowNavigation() {
	const [selectedFlowId, setSelectedFlowId] = useState<string | null>(null);
	const [isEditing, setIsEditing] = useState(false);

	/** Selecionar um flow para edição */
	const handleSelectFlow = useCallback((flowId: string | null) => {
		setSelectedFlowId(flowId);
		if (flowId) {
			setIsEditing(true);
		}
	}, []);

	/** Criar novo flow - inicia edição com canvas vazio */
	const handleCreateNew = useCallback(() => {
		setSelectedFlowId(null);
		setIsEditing(true);
	}, []);

	/** Voltar para a lista de flows */
	const handleBackToList = useCallback(() => {
		setIsEditing(false);
		setSelectedFlowId(null);
	}, []);

	/** Selecionar flow após importação com sucesso */
	const handleImportSuccess = useCallback((flowId: string) => {
		setSelectedFlowId(flowId);
		setIsEditing(true);
	}, []);

	return {
		// Estado
		selectedFlowId,
		isEditing,
		// Setters diretos (para compatibilidade)
		setSelectedFlowId,
		setIsEditing,
		// Ações
		handleSelectFlow,
		handleCreateNew,
		handleBackToList,
		handleImportSuccess,
	};
}

export type FlowNavigationState = ReturnType<typeof useFlowNavigation>;
