/**
 * Flow Sync Utilities
 *
 * Sincroniza o canvas visual (React Flow) com as tabelas normalizadas
 * (Flow, FlowNode, FlowEdge) para que o FlowExecutor e Flow Analytics
 * possam ler os dados.
 *
 * Arquitetura:
 *   - canvasJson (Flow.canvasJson) = fonte de verdade (o que o usuário edita)
 *   - FlowNode/FlowEdge = views materializadas (geradas automaticamente)
 *
 * @see docs/interative_message_flow_builder.md
 */

import { getPrismaInstance } from '@/lib/connections';
import { Prisma } from '@prisma/client';
import type { FlowCanvas, FlowNode } from '@/types/flow-builder';

// =============================================================================
// NODE TYPE MAPPING
// =============================================================================

/**
 * Mapeamento de tipos de nó do canvas visual para tipos do runtime
 */
export const NODE_TYPE_MAP: Record<string, string> = {
  start: 'START',
  interactive_message: 'INTERACTIVE_MESSAGE',
  text_message: 'TEXT_MESSAGE',
  emoji_reaction: 'REACTION',
  text_reaction: 'REACTION',
  handoff: 'TRANSFER',
  add_tag: 'ADD_TAG',
  end: 'END',
  condition: 'CONDITION',
  delay: 'DELAY',
  media: 'MEDIA',
};

// =============================================================================
// CONFIG BUILDER
// =============================================================================

/**
 * Extrai configuração específica de um nó para armazenar no banco
 */
export function buildNodeConfig(node: FlowNode): object {
  const data = node.data as unknown as Record<string, unknown>;

  switch (node.type) {
    case 'interactive_message':
      return {
        messageId: data.messageId,
        elements: data.elements,
        body: data.body,
        header: data.header,
        footer: data.footer,
        buttons: data.buttons,
        label: data.label,
      };
    case 'text_message':
      return { text: data.text };
    case 'emoji_reaction':
      return { emoji: data.emoji };
    case 'text_reaction':
      return { text: data.textReaction };
    case 'handoff':
      return { assigneeType: 'team', internalNote: data.targetTeam };
    case 'add_tag':
      return { tagName: data.tagName };
    case 'delay':
      // Canvas usa delaySeconds, engine usa delayMs
      const seconds = (data.delaySeconds as number) || 5;
      return { delayMs: seconds * 1000 };
    case 'media':
      return {
        mediaUrl: data.mediaUrl,
        filename: data.filename,
        caption: data.caption,
        mediaType: data.mediaType,
        mimeType: data.mimeType,
      };
    case 'end':
      return { endMessage: data.endMessage };
    case 'start':
      return { label: data.label, triggerType: data.triggerType };
    default:
      return data;
  }
}

// =============================================================================
// SYNC FUNCTION
// =============================================================================

/**
 * Sincroniza o canvas visual com as tabelas normalizadas (FlowNode, FlowEdge).
 *
 * Esta função materializa o canvas visual em tabelas relacionais para que:
 * - FlowExecutor possa executar o flow
 * - Flow Analytics possa calcular métricas
 *
 * @param flowId - ID do flow a sincronizar
 * @param canvas - Canvas visual (React Flow format)
 * @param flowName - Nome opcional do flow (extraído do nó START se não fornecido)
 * @returns ID do flow sincronizado
 */
export async function syncCanvasToNormalizedFlow(
  flowId: string,
  canvas: FlowCanvas,
  flowName?: string
): Promise<string> {
  const prisma = getPrismaInstance();

  return await prisma.$transaction(async (tx) => {
    // 1. Buscar Flow existente
    const flow = await tx.flow.findUnique({
      where: { id: flowId },
    });

    if (!flow) {
      throw new Error(`Flow ${flowId} não encontrado`);
    }

    // Extrair nome do nó START se disponível
    const startNode = canvas.nodes.find((n) => n.type === 'start');
    const extractedName =
      flowName ||
      ((startNode?.data as unknown as Record<string, unknown>)?.label as string) ||
      null;

    // Atualizar nome se mudou
    if (extractedName && flow.name !== extractedName) {
      await tx.flow.update({
        where: { id: flow.id },
        data: { name: extractedName },
      });
    }

    // 2. Deletar nodes e edges antigos
    await tx.flowEdge.deleteMany({ where: { flowId: flow.id } });
    await tx.flowNode.deleteMany({ where: { flowId: flow.id } });

    // 3. Criar novos nodes e mapear IDs (canvas ID → DB ID)
    const nodeIdMap = new Map<string, string>();

    for (const node of canvas.nodes) {
      const dbNode = await tx.flowNode.create({
        data: {
          flowId: flow.id,
          nodeType: NODE_TYPE_MAP[node.type] || node.type.toUpperCase(),
          config: buildNodeConfig(node),
          positionX: node.position.x,
          positionY: node.position.y,
        },
      });
      nodeIdMap.set(node.id, dbNode.id);
    }

    // 4. Criar edges com IDs mapeados
    for (const edge of canvas.edges) {
      const sourceId = nodeIdMap.get(edge.source);
      const targetId = nodeIdMap.get(edge.target);

      if (!sourceId || !targetId) continue;

      await tx.flowEdge.create({
        data: {
          flowId: flow.id,
          sourceNodeId: sourceId,
          targetNodeId: targetId,
          buttonId: edge.sourceHandle || null,
          conditionBranch:
            ((edge.data as Record<string, unknown> | undefined)?.conditionBranch as string) ||
            null,
        },
      });
    }

    console.log(
      `[syncFlow] Sincronizado Flow ${flow.id} (${extractedName || flow.name}) com ${canvas.nodes.length} nós e ${canvas.edges.length} edges`
    );

    return flow.id;
  });
}
