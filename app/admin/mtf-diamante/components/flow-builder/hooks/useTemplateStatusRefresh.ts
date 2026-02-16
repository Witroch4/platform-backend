'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useReactFlow } from '@xyflow/react';
import { toast } from 'sonner';
import { useFlowBuilderContext } from '../context/FlowBuilderContext';
import type { TemplateApprovalStatus } from '@/types/flow-builder';

/**
 * Mapa de status → label PT-BR
 */
function getStatusLabel(status: string): string {
  switch (status) {
    case 'APPROVED':
      return 'Aprovado';
    case 'PENDING':
      return 'Pendente';
    case 'REJECTED':
      return 'Rejeitado';
    case 'DRAFT':
    default:
      return 'Rascunho';
  }
}

interface UseTemplateStatusRefreshOptions {
  /** ID do nó no canvas */
  nodeId: string;
  /** ID do template na Meta */
  metaTemplateId?: string;
  /** Nome do template (usado para recuperar metaTemplateId do banco) */
  templateName?: string;
  /** Status atual do template */
  status?: TemplateApprovalStatus;
  /** Intervalo de polling automático para PENDING (ms). Default: 30s. 0 para desabilitar. */
  pollInterval?: number;
}

/**
 * Hook para verificar e atualizar o status de um template na Meta API.
 *
 * - Botão de refresh manual
 * - Polling automático quando status é PENDING (a cada 30s por padrão)
 * - Atualiza o node data automaticamente quando o status muda
 */
export function useTemplateStatusRefresh({
  nodeId,
  metaTemplateId,
  templateName,
  status,
  pollInterval = 30_000,
}: UseTemplateStatusRefreshOptions) {
  const { setNodes } = useReactFlow();
  const ctx = useFlowBuilderContext();
  const caixaId = ctx?.caixaId;
  const [isRefreshing, setIsRefreshing] = useState(false);
  const pollRef = useRef<NodeJS.Timeout | null>(null);
  const mountedRef = useRef(true);
  const recoveryAttemptedRef = useRef(false);

  // Auto-recuperação do metaTemplateId quando não está no node data
  // (templates criados antes do fix)
  useEffect(() => {
    if (metaTemplateId || recoveryAttemptedRef.current || !caixaId) return;
    if (!templateName) return;
    if (status !== 'PENDING' && status !== 'APPROVED') return;

    recoveryAttemptedRef.current = true;

    const recover = async () => {
      try {
        const res = await fetch(`/api/admin/mtf-diamante/templates?caixaId=${caixaId}`);
        if (!res.ok) return;
        const data = await res.json();
        const templates = data.templates || [];
        const match = templates.find(
          (t: { name?: string; id?: string }) => t.name === templateName && t.id
        );
        if (match?.id && mountedRef.current) {
          console.log(`[useTemplateStatusRefresh] metaTemplateId recuperado: ${match.id} (template: ${templateName})`);
          setNodes((nodes) =>
            nodes.map((node) =>
              node.id === nodeId
                ? { ...node, data: { ...node.data, metaTemplateId: match.id } }
                : node
            )
          );
        }
      } catch (err) {
        console.error('[useTemplateStatusRefresh] Erro ao recuperar metaTemplateId:', err);
      }
    };
    recover();
  }, [metaTemplateId, templateName, status, caixaId, nodeId, setNodes]);

  /**
   * Consulta a API de status e atualiza o nó se mudou.
   * @param silent Se true, não mostra toast (usado no polling automático)
   */
  const refreshStatus = useCallback(
    async (silent = false) => {
      if (!metaTemplateId || !caixaId) return;

      setIsRefreshing(true);
      try {
        const res = await fetch(
          `/api/admin/mtf-diamante/templates/${caixaId}/${metaTemplateId}/status`
        );
        const data = await res.json();

        if (!mountedRef.current) return;

        if (!res.ok) {
          if (!silent) toast.error(data.error || 'Erro ao verificar status');
          return;
        }

        if (data.statusChanged) {
          // Atualizar o node data no canvas
          setNodes((nodes) =>
            nodes.map((node) => {
              if (node.id === nodeId) {
                return {
                  ...node,
                  data: {
                    ...node.data,
                    status: data.status as TemplateApprovalStatus,
                  },
                };
              }
              return node;
            })
          );

          const label = getStatusLabel(data.status);
          toast.success(`Template ${data.status === 'APPROVED' ? 'aprovado' : data.status === 'REJECTED' ? 'rejeitado' : `atualizado: ${label}`}!`);
        } else if (!silent) {
          toast.info(`Status atual: ${getStatusLabel(data.status)}`);
        }
      } catch (error) {
        console.error('[useTemplateStatusRefresh] Erro:', error);
        if (!silent) toast.error('Erro ao verificar status do template');
      } finally {
        if (mountedRef.current) setIsRefreshing(false);
      }
    },
    [metaTemplateId, caixaId, nodeId, setNodes]
  );

  // Polling automático para templates PENDING
  useEffect(() => {
    mountedRef.current = true;

    // Limpar qualquer polling anterior
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }

    // Só fazer polling se:
    // - Tem metaTemplateId e caixaId
    // - Status é PENDING
    // - pollInterval > 0
    if (metaTemplateId && caixaId && status === 'PENDING' && pollInterval > 0) {
      // Primeira verificação após 5s (dar tempo da Meta processar)
      const initialTimeout = setTimeout(() => {
        if (mountedRef.current) refreshStatus(true);
      }, 5000);

      // Polling periódico
      pollRef.current = setInterval(() => {
        if (mountedRef.current) refreshStatus(true);
      }, pollInterval);

      return () => {
        clearTimeout(initialTimeout);
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
        mountedRef.current = false;
      };
    }

    return () => {
      mountedRef.current = false;
    };
  }, [metaTemplateId, status, pollInterval, refreshStatus]);

  return {
    /** Se está verificando o status agora */
    isRefreshing,
    /** Função para verificar status manualmente */
    refreshStatus: () => refreshStatus(false),
    /** Se o template tem metaTemplateId e caixaId (pode verificar status) */
    canRefresh: !!metaTemplateId && !!caixaId,
  };
}
