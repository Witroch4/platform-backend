import { useState, useCallback } from "react";
import { toast } from "sonner";
import type { LeadChatwit } from "@/app/admin/leads-chatwit/types";

interface OptimisticDeletionState {
  deletingFileIds: Set<string>;
  previousLead: LeadChatwit | null;
}

export function useOptimisticFileDeletion() {
  const [deletionState, setDeletionState] = useState<OptimisticDeletionState>({
    deletingFileIds: new Set(),
    previousLead: null,
  });

  /**
   * Marca arquivos para exclusão otimista e atualiza o lead imediatamente
   * @param lead - Lead atual
   * @param fileIds - IDs dos arquivos a deletar
   * @param onEdit - Callback para atualizar o lead
   * @returns função para limpar o estado de deleção
   */
  const optimisticDeleteFiles = useCallback(
    (lead: LeadChatwit, fileIds: string[], onEdit: (lead: LeadChatwit) => void) => {
      // Guardar estado anterior para rollback
      setDeletionState((prev) => ({
        deletingFileIds: new Set(fileIds),
        previousLead: prev.previousLead || lead,
      }));

      // Atualizar UI imediatamente removendo os arquivos
      const updatedLead = {
        ...lead,
        arquivos: lead.arquivos.filter((arquivo) => !fileIds.includes(arquivo.id)),
        _skipDialog: true,
        _internal: true,
      } as any;

      onEdit(updatedLead);
    },
    []
  );

  /**
   * Marca PDF para exclusão otimista
   */
  const optimisticDeletePdf = useCallback(
    (lead: LeadChatwit, onEdit: (lead: LeadChatwit) => void) => {
      setDeletionState((prev) => ({
        deletingFileIds: new Set(["pdf"]),
        previousLead: prev.previousLead || lead,
      }));

      const updatedLead = {
        ...lead,
        pdfUnificado: undefined,
        _skipDialog: true,
        _internal: true,
      } as any;

      onEdit(updatedLead);
    },
    []
  );

  /**
   * Marca imagens convertidas para exclusão otimista
   */
  const optimisticDeleteImages = useCallback(
    (lead: LeadChatwit, onEdit: (lead: LeadChatwit) => void) => {
      setDeletionState((prev) => ({
        deletingFileIds: new Set(["imagem"]),
        previousLead: prev.previousLead || lead,
      }));

      const updatedLead = {
        ...lead,
        arquivos: lead.arquivos.map((arquivo) => ({
          ...arquivo,
          pdfConvertido: undefined,
        })),
        imagensConvertidas: "[]",
        _skipDialog: true,
        _internal: true,
      } as any;

      onEdit(updatedLead);
    },
    []
  );

  /**
   * Reverter para estado anterior em caso de erro
   */
  const rollbackDeletion = useCallback(
    (onEdit: (lead: LeadChatwit) => void) => {
      if (deletionState.previousLead) {
        onEdit({
          ...deletionState.previousLead,
          _skipDialog: true,
          _internal: true,
        } as any);
      }
      clearDeletionState();
    },
    [deletionState.previousLead]
  );

  /**
   * Limpar estado de deleção após sucesso
   */
  const clearDeletionState = useCallback(() => {
    setDeletionState({
      deletingFileIds: new Set(),
      previousLead: null,
    });
  }, []);

  /**
   * Verificar se um arquivo está sendo deletado
   */
  const isDeleting = useCallback((fileId: string) => {
    return deletionState.deletingFileIds.has(fileId);
  }, [deletionState.deletingFileIds]);

  return {
    optimisticDeleteFiles,
    optimisticDeletePdf,
    optimisticDeleteImages,
    rollbackDeletion,
    clearDeletionState,
    isDeleting,
    deletingFileIds: deletionState.deletingFileIds,
  };
}
