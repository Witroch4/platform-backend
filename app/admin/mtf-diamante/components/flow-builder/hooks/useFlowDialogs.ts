"use client";

import { useCallback, useState } from "react";

/**
 * Hook que consolida todos os estados de diálogos do Flow Builder.
 * Gerencia abertura/fechamento de dialogs de edição de nós, templates,
 * reset e importação.
 */
export function useFlowDialogs() {
	const [dialogOpen, setDialogOpen] = useState(false);
	const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
	const [showResetDialog, setShowResetDialog] = useState(false);
	const [showImportDialog, setShowImportDialog] = useState(false);
	const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

	const openNodeDialog = useCallback((nodeId: string) => {
		setSelectedNodeId(nodeId);
		setDialogOpen(true);
	}, []);

	const closeNodeDialog = useCallback(() => {
		setDialogOpen(false);
		setSelectedNodeId(null);
	}, []);

	const openTemplateDialog = useCallback((nodeId: string) => {
		setSelectedNodeId(nodeId);
		setTemplateDialogOpen(true);
	}, []);

	const closeTemplateDialog = useCallback(() => {
		setTemplateDialogOpen(false);
	}, []);

	const openResetDialog = useCallback(() => {
		setShowResetDialog(true);
	}, []);

	const closeResetDialog = useCallback(() => {
		setShowResetDialog(false);
	}, []);

	const openImportDialog = useCallback(() => {
		setShowImportDialog(true);
	}, []);

	const closeImportDialog = useCallback(() => {
		setShowImportDialog(false);
	}, []);

	const handleDialogOpenChange = useCallback((open: boolean) => {
		setDialogOpen(open);
		if (!open) setSelectedNodeId(null);
	}, []);

	const clearSelection = useCallback(() => {
		setSelectedNodeId(null);
		setDialogOpen(false);
	}, []);

	return {
		// Estado
		dialogOpen,
		templateDialogOpen,
		showResetDialog,
		showImportDialog,
		selectedNodeId,
		// Setters diretos (para compatibilidade)
		setDialogOpen,
		setTemplateDialogOpen,
		setShowResetDialog,
		setShowImportDialog,
		setSelectedNodeId,
		// Ações compostas
		openNodeDialog,
		closeNodeDialog,
		openTemplateDialog,
		closeTemplateDialog,
		openResetDialog,
		closeResetDialog,
		openImportDialog,
		closeImportDialog,
		handleDialogOpenChange,
		clearSelection,
	};
}

export type FlowDialogsState = ReturnType<typeof useFlowDialogs>;
