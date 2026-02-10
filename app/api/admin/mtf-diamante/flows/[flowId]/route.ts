import { type NextRequest, NextResponse } from 'next/server';
import { getPrismaInstance } from '@/lib/connections';
import { auth } from '@/auth';
import { z } from 'zod';
import type { FlowCanvas } from '@/types/flow-builder';

// =============================================================================
// TYPES
// =============================================================================

export interface FlowDetail {
  id: string;
  name: string;
  inboxId: string;
  isActive: boolean;
  canvas: FlowCanvas | null;
  createdAt: Date;
  updatedAt: Date;
}

// =============================================================================
// VALIDATION SCHEMAS
// =============================================================================

const UpdateFlowSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  isActive: z.boolean().optional(),
});

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Verifica se o usuário tem acesso ao flow
 */
async function verifyFlowAccess(
  flowId: string,
  userId: string
): Promise<{ hasAccess: boolean; flow: any | null }> {
  const flow = await getPrismaInstance().flow.findFirst({
    where: {
      id: flowId,
      inbox: {
        usuarioChatwit: {
          appUserId: userId,
        },
      },
    },
    include: {
      nodes: true,
      edges: true,
    },
  });

  return { hasAccess: !!flow, flow };
}

/**
 * Mapeamento reverso de tipos de nó (runtime → canvas visual)
 */
const NODE_TYPE_REVERSE_MAP: Record<string, string> = {
  'START': 'start',
  'INTERACTIVE_MESSAGE': 'interactive_message',
  'TEXT_MESSAGE': 'text_message',
  'REACTION': 'emoji_reaction', // Default to emoji_reaction
  'TRANSFER': 'handoff',
  'ADD_TAG': 'add_tag',
  'END': 'end',
  'CONDITION': 'condition',
  'DELAY': 'delay',
  'MEDIA': 'media',
};

/**
 * Converte Flow normalizado para FlowCanvas visual
 */
function flowToCanvas(flow: {
  id: string;
  name: string;
  nodes: Array<{
    id: string;
    nodeType: string;
    config: unknown;
    positionX: number;
    positionY: number;
  }>;
  edges: Array<{
    id: string;
    sourceNodeId: string;
    targetNodeId: string;
    buttonId: string | null;
    conditionBranch: string | null;
  }>;
}): FlowCanvas {
  // Mapear IDs do banco para IDs do canvas
  const nodeIdMap = new Map<string, string>();

  const canvasNodes = flow.nodes.map((node) => {
    // Gerar ID no formato do canvas
    const canvasId = `${NODE_TYPE_REVERSE_MAP[node.nodeType] || node.nodeType.toLowerCase()}_${node.id.slice(0, 8)}`;
    nodeIdMap.set(node.id, canvasId);

    const config = node.config as Record<string, unknown> | null;

    // Determinar tipo correto para REACTION
    let nodeType = NODE_TYPE_REVERSE_MAP[node.nodeType] || node.nodeType.toLowerCase();
    if (node.nodeType === 'REACTION' && config) {
      // Se tem emoji, é emoji_reaction; se tem text, é text_reaction
      if (config.emoji) {
        nodeType = 'emoji_reaction';
      } else if (config.text || config.textReaction) {
        nodeType = 'text_reaction';
      }
    }

    // Converter config específica para formato do canvas
    let nodeData: Record<string, unknown> = {
      label: config?.label || flow.name,
      isConfigured: true,
      ...(config || {}),
    };

    // DELAY: converter delayMs -> delaySeconds
    if (node.nodeType === 'DELAY' && config?.delayMs) {
      nodeData.delaySeconds = Math.round((config.delayMs as number) / 1000);
      delete nodeData.delayMs;
    }

    return {
      id: canvasId,
      type: nodeType,
      position: { x: node.positionX, y: node.positionY },
      data: nodeData,
    };
  });

  const canvasEdges = flow.edges.map((edge) => {
    const sourceId = nodeIdMap.get(edge.sourceNodeId) || edge.sourceNodeId;
    const targetId = nodeIdMap.get(edge.targetNodeId) || edge.targetNodeId;

    return {
      id: `edge_${sourceId}_${targetId}_${edge.buttonId || 'default'}`,
      source: sourceId,
      target: targetId,
      sourceHandle: edge.buttonId || undefined,
      data: edge.conditionBranch ? { buttonId: edge.buttonId || undefined } : undefined,
      type: 'smoothstep' as const,
      animated: false,
    };
  });

  return {
    nodes: canvasNodes,
    edges: canvasEdges,
    viewport: { x: 0, y: 0, zoom: 1 },
  } as unknown as FlowCanvas;
}

// =============================================================================
// GET - Buscar flow por ID (com canvas reconstruído)
// =============================================================================

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ flowId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: 'Não autorizado' },
        { status: 401 }
      );
    }

    const { flowId } = await params;

    if (!flowId) {
      return NextResponse.json(
        { success: false, error: 'flowId é obrigatório' },
        { status: 400 }
      );
    }

    // Verificar acesso e buscar flow
    const { hasAccess, flow } = await verifyFlowAccess(flowId, session.user.id);
    if (!hasAccess || !flow) {
      return NextResponse.json(
        { success: false, error: 'Flow não encontrado ou acesso negado' },
        { status: 404 }
      );
    }

    // Tentar buscar o canvas visual primeiro (InboxFlowCanvas)
    // Se não existir, reconstruir a partir do Flow normalizado
    const inboxCanvas = await getPrismaInstance().inboxFlowCanvas.findUnique({
      where: { inboxId: flow.inboxId },
    });

    let canvas: FlowCanvas | null = null;

    if (inboxCanvas) {
      // Usar canvas visual existente
      canvas = inboxCanvas.canvas as unknown as FlowCanvas;
    } else if (flow.nodes.length > 0) {
      // Reconstruir canvas a partir do flow normalizado
      canvas = flowToCanvas(flow);
    }

    const flowDetail: FlowDetail = {
      id: flow.id,
      name: flow.name,
      inboxId: flow.inboxId,
      isActive: flow.isActive,
      canvas,
      createdAt: flow.createdAt,
      updatedAt: flow.updatedAt,
    };

    return NextResponse.json({
      success: true,
      data: flowDetail,
    });
  } catch (error) {
    console.error('[flows/[flowId]] GET error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Erro interno',
      },
      { status: 500 }
    );
  }
}

// =============================================================================
// PATCH - Atualizar metadados do flow
// =============================================================================

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ flowId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: 'Não autorizado' },
        { status: 401 }
      );
    }

    const { flowId } = await params;

    if (!flowId) {
      return NextResponse.json(
        { success: false, error: 'flowId é obrigatório' },
        { status: 400 }
      );
    }

    const body = await request.json();

    // Validar payload
    const validation = UpdateFlowSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'Dados inválidos',
          details: validation.error.flatten(),
        },
        { status: 400 }
      );
    }

    // Verificar acesso
    const { hasAccess, flow } = await verifyFlowAccess(flowId, session.user.id);
    if (!hasAccess || !flow) {
      return NextResponse.json(
        { success: false, error: 'Flow não encontrado ou acesso negado' },
        { status: 404 }
      );
    }

    // Atualizar flow
    const updatedFlow = await getPrismaInstance().flow.update({
      where: { id: flowId },
      data: {
        ...validation.data,
        updatedAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        id: updatedFlow.id,
        name: updatedFlow.name,
        inboxId: updatedFlow.inboxId,
        isActive: updatedFlow.isActive,
        createdAt: updatedFlow.createdAt,
        updatedAt: updatedFlow.updatedAt,
      },
      message: 'Flow atualizado com sucesso',
    });
  } catch (error) {
    console.error('[flows/[flowId]] PATCH error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Erro interno',
      },
      { status: 500 }
    );
  }
}

// =============================================================================
// DELETE - Remover flow
// =============================================================================

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ flowId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: 'Não autorizado' },
        { status: 401 }
      );
    }

    const { flowId } = await params;

    if (!flowId) {
      return NextResponse.json(
        { success: false, error: 'flowId é obrigatório' },
        { status: 400 }
      );
    }

    // Verificar acesso
    const { hasAccess, flow } = await verifyFlowAccess(flowId, session.user.id);
    if (!hasAccess || !flow) {
      return NextResponse.json(
        { success: false, error: 'Flow não encontrado ou acesso negado' },
        { status: 404 }
      );
    }

    // Verificar se há sessões ativas
    const activeSessions = await getPrismaInstance().flowSession.count({
      where: {
        flowId,
        status: { in: ['ACTIVE', 'WAITING_INPUT'] },
      },
    });

    if (activeSessions > 0) {
      return NextResponse.json(
        {
          success: false,
          error: `Não é possível deletar o flow. Existem ${activeSessions} sessão(ões) ativa(s).`,
        },
        { status: 400 }
      );
    }

    // Deletar flow (cascade deleta nodes, edges e sessions)
    await getPrismaInstance().flow.delete({
      where: { id: flowId },
    });

    return NextResponse.json({
      success: true,
      message: 'Flow removido com sucesso',
    });
  } catch (error) {
    console.error('[flows/[flowId]] DELETE error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Erro interno',
      },
      { status: 500 }
    );
  }
}
