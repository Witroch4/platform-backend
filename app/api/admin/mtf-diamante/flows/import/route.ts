import { type NextRequest, NextResponse } from 'next/server';
import { getPrismaInstance } from '@/lib/connections';
import { auth } from '@/auth';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import {
  n8nFormatToCanvas,
  validateFlowImport,
} from '@/lib/flow-builder/exportImport';
import type { FlowExportFormat } from '@/types/flow-builder';

// =============================================================================
// VALIDATION SCHEMAS
// =============================================================================

const ImportSchema = z.object({
  inboxId: z.string().min(1, 'inboxId é obrigatório'),
  flowData: z.object({
    meta: z
      .object({
        version: z.string(),
        flowName: z.string().optional(),
        exportedAt: z.string().optional(),
        flowId: z.string().optional(),
        inboxId: z.string().optional(),
      })
      .passthrough(),
    nodes: z.array(z.any()),
    connections: z.record(z.any()),
    viewport: z
      .object({
        x: z.number(),
        y: z.number(),
        zoom: z.number(),
      })
      .optional(),
  }),
  newName: z.string().max(100).optional(),
});

// =============================================================================
// POST - Importar flow de JSON n8n-style
// =============================================================================

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: 'Não autorizado' },
        { status: 401 }
      );
    }

    const body = await request.json();

    // Validar estrutura do payload
    const schemaValidation = ImportSchema.safeParse(body);
    if (!schemaValidation.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'Dados inválidos',
          details: schemaValidation.error.flatten(),
        },
        { status: 400 }
      );
    }

    const { inboxId, flowData, newName } = schemaValidation.data;

    // Verificar acesso à inbox
    const inbox = await getPrismaInstance().chatwitInbox.findFirst({
      where: {
        id: inboxId,
        usuarioChatwit: {
          appUserId: session.user.id,
        },
      },
    });

    if (!inbox) {
      return NextResponse.json(
        { success: false, error: 'Inbox não encontrada ou acesso negado' },
        { status: 403 }
      );
    }

    // Validar estrutura do flow
    const importValidation = validateFlowImport(flowData);
    if (!importValidation.valid) {
      return NextResponse.json(
        {
          success: false,
          error: 'Estrutura do flow inválida',
          details: importValidation.errors,
          warnings: importValidation.warnings,
        },
        { status: 400 }
      );
    }

    // Converter para formato canvas
    const canvas = n8nFormatToCanvas(flowData as FlowExportFormat);

    // Determinar nome do flow
    const flowName =
      newName || flowData.meta.flowName || `Flow Importado ${Date.now()}`;

    // Verificar se já existe flow com mesmo nome nesta inbox
    const existingFlow = await getPrismaInstance().flow.findFirst({
      where: {
        inboxId,
        name: flowName,
      },
    });

    const finalName = existingFlow
      ? `${flowName} (cópia ${Date.now().toString(36)})`
      : flowName;

    // Criar flow
    const flow = await getPrismaInstance().flow.create({
      data: {
        name: finalName,
        inboxId,
        isActive: false, // Importado como inativo por segurança
        canvasJson: canvas as unknown as Prisma.InputJsonValue,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        id: flow.id,
        name: flow.name,
        inboxId: flow.inboxId,
        isActive: flow.isActive,
        nodeCount: importValidation.nodeCount,
        connectionCount: importValidation.connectionCount,
      },
      warnings: importValidation.warnings,
      message: `Flow "${flow.name}" importado com sucesso`,
    });
  } catch (error) {
    console.error('[flows/import] POST error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Erro interno',
      },
      { status: 500 }
    );
  }
}
