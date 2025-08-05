// app/api/admin/templates/approval/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getPrismaInstance } from '@/lib/connections';
import { TemplateStatus } from '@prisma/client';

/**
 * GET - Lista solicitações de aprovação de templates
 */
export async function GET(request: NextRequest): Promise<Response> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    // Verificar se o usuário tem permissão para aprovar templates
    if (session.user.role !== 'ADMIN' && session.user.role !== 'SUPERADMIN') {
      return NextResponse.json({ error: 'Sem permissão para acessar aprovações' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || 'pending';
    const page = parseInt(searchParams.get('page') || '1');
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100);
    const skip = (page - 1) * limit;

    // Buscar solicitações de aprovação
    const [approvalRequests, total] = await Promise.all([
      getPrismaInstance().templateApprovalRequest.findMany({
        where: {
          status,
        },
        include: {
          template: {
            select: {
              id: true,
              name: true,
              type: true,
              description: true,
              createdAt: true,
            },
          },
          requestedBy: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          processedBy: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
        orderBy: { requestedAt: 'desc' },
        skip,
        take: limit,
      }),
      getPrismaInstance().templateApprovalRequest.count({
        where: { status },
      }),
    ]);

    const totalPages = Math.ceil(total / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    return NextResponse.json({
      approvalRequests,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage,
        hasPrevPage,
      },
      filters: {
        status,
      },
    });

  } catch (error) {
    console.error('[Template Approval API] Erro ao buscar aprovações:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}

/**
 * POST - Cria uma nova solicitação de aprovação
 */
export async function POST(request: NextRequest): Promise<Response> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const body = await request.json();
    const { templateId, requestMessage } = body;

    if (!templateId) {
      return NextResponse.json(
        { error: 'ID do template é obrigatório' },
        { status: 400 }
      );
    }

    // Verificar se o template existe e pertence ao usuário
    const template = await getPrismaInstance().template.findFirst({
      where: {
        id: templateId,
        createdById: session.user.id,
      },
    });

    if (!template) {
      return NextResponse.json(
        { error: 'Template não encontrado' },
        { status: 404 }
      );
    }

    // Verificar se já existe uma solicitação pendente
    const existingRequest = await getPrismaInstance().templateApprovalRequest.findFirst({
      where: {
        templateId,
        status: 'pending',
      },
    });

    if (existingRequest) {
      return NextResponse.json(
        { error: 'Já existe uma solicitação de aprovação pendente para este template' },
        { status: 409 }
      );
    }

    // Criar solicitação de aprovação
    const approvalRequest = await getPrismaInstance().templateApprovalRequest.create({
      data: {
        templateId,
        requestMessage,
        requestedById: session.user.id,
      },
      include: {
        template: {
          select: {
            id: true,
            name: true,
            type: true,
            description: true,
          },
        },
        requestedBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    console.log(`[Template Approval API] Solicitação criada: ${approvalRequest.id} para template ${templateId}`);

    return NextResponse.json(approvalRequest, { status: 201 });

  } catch (error) {
    console.error('[Template Approval API] Erro ao criar solicitação:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}