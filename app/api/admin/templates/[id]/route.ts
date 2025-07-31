// app/api/admin/templates/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { TemplateType, TemplateScope, TemplateStatus } from '@prisma/client';

/**
 * GET - Busca um template específico com todos os dados relacionados
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: 'ID do template é obrigatório' },
        { status: 400 }
      );
    }

    // Buscar template com todos os dados relacionados
    const template = await prisma.template.findFirst({
      where: {
        id,
        OR: [
          { createdById: session.user.id }, // Templates do usuário
          { scope: TemplateScope.GLOBAL }, // Templates globais
        ],
      },
      include: {
        createdBy: {
          select: { id: true, name: true, email: true },
        },
        inbox: {
          select: { id: true, nome: true, inboxId: true },
        },
        interactiveContent: {
          include: {
            header: true,
            body: true,
            footer: true,
            actionCtaUrl: true,
            actionReplyButton: true,
            actionList: true,
            actionFlow: true,
            actionLocationRequest: true,
          },
        },
        whatsappOfficialInfo: true,
        mapeamentos: {
          include: {
            inbox: {
              select: { id: true, nome: true, inboxId: true },
            },
          },
        },
        approvalRequests: {
          include: {
            requestedBy: {
              select: { id: true, name: true, email: true },
            },
            processedBy: {
              select: { id: true, name: true, email: true },
            },
          },
          orderBy: { requestedAt: 'desc' },
        },
        _count: {
          select: {
            mapeamentos: true,
            approvalRequests: true,
          },
        },
      },
    });

    if (!template) {
      return NextResponse.json(
        { error: 'Template não encontrado' },
        { status: 404 }
      );
    }

    // Incrementar contador de uso se não for o criador visualizando
    if (template.createdById !== session.user.id) {
      await prisma.template.update({
        where: { id },
        data: { usageCount: { increment: 1 } },
      });
    }

    console.log(`[Template Detail API] Template encontrado: ${template.id} (${template.type})`);

    return NextResponse.json({
      id: template.id,
      name: template.name,
      description: template.description,
      type: template.type,
      scope: template.scope,
      status: template.status,
      language: template.language,
      tags: template.tags,
      isActive: template.isActive,
      usageCount: template.usageCount,
      simpleReplyText: template.simpleReplyText,
      createdAt: template.createdAt,
      updatedAt: template.updatedAt,
      createdBy: template.createdBy,
      inbox: template.inbox,
      // Dados específicos por tipo
      interactiveContent: template.interactiveContent,
      whatsappOfficialInfo: template.whatsappOfficialInfo,
      // Relacionamentos
      mapeamentos: template.mapeamentos,
      approvalRequests: template.approvalRequests,
      // Contadores
      stats: {
        mapeamentosCount: template._count.mapeamentos,
        approvalRequestsCount: template._count.approvalRequests,
      },
      // Permissões
      permissions: {
        canEdit: template.createdById === session.user.id,
        canDelete: template.createdById === session.user.id,
        canApprove: session.user.role === 'ADMIN' || session.user.role === 'SUPERADMIN',
      },
    });

  } catch (error) {
    console.error('[Template Detail API] Erro ao buscar template:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}

/**
 * PUT - Atualiza um template
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();

    if (!id) {
      return NextResponse.json(
        { error: 'ID do template é obrigatório' },
        { status: 400 }
      );
    }

    // Verificar se o template existe e se o usuário pode editá-lo
    const existingTemplate = await prisma.template.findFirst({
      where: {
        id,
        createdById: session.user.id, // Apenas o criador pode editar
      },
      include: {
        interactiveContent: true,
        whatsappOfficialInfo: true,
      },
    });

    if (!existingTemplate) {
      return NextResponse.json(
        { error: 'Template não encontrado ou sem permissão para editar' },
        { status: 404 }
      );
    }

    const {
      name,
      description,
      scope,
      language,
      tags,
      isActive,
      simpleReplyText,
      // Dados específicos por tipo
      interactiveContent,
      whatsappOfficialInfo,
    } = body;

    // Preparar dados de atualização
    const updateData: any = {};

    // Campos básicos
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (scope !== undefined) updateData.scope = scope;
    if (language !== undefined) updateData.language = language;
    if (tags !== undefined) updateData.tags = tags;
    if (isActive !== undefined) updateData.isActive = isActive;
    if (simpleReplyText !== undefined) updateData.simpleReplyText = simpleReplyText;

    // Atualizar dados específicos por tipo
    if (existingTemplate.type === TemplateType.INTERACTIVE_MESSAGE && interactiveContent) {
      if (existingTemplate.interactiveContent) {
        // Atualizar conteúdo interativo existente
        updateData.interactiveContent = {
          update: {
            body: interactiveContent.body ? {
              update: {
                text: interactiveContent.body.text,
              },
            } : undefined,
            header: interactiveContent.header ? {
              upsert: {
                create: {
                  type: interactiveContent.header.type,
                  content: interactiveContent.header.content,
                },
                update: {
                  type: interactiveContent.header.type,
                  content: interactiveContent.header.content,
                },
              },
            } : undefined,
            footer: interactiveContent.footer ? {
              upsert: {
                create: {
                  text: interactiveContent.footer.text,
                },
                update: {
                  text: interactiveContent.footer.text,
                },
              },
            } : undefined,
            // Atualizar ações específicas
            actionCtaUrl: interactiveContent.actionCtaUrl ? {
              upsert: {
                create: {
                  displayText: interactiveContent.actionCtaUrl.displayText,
                  url: interactiveContent.actionCtaUrl.url,
                },
                update: {
                  displayText: interactiveContent.actionCtaUrl.displayText,
                  url: interactiveContent.actionCtaUrl.url,
                },
              },
            } : undefined,
            actionReplyButton: interactiveContent.actionReplyButton ? {
              upsert: {
                create: {
                  buttons: interactiveContent.actionReplyButton.buttons,
                },
                update: {
                  buttons: interactiveContent.actionReplyButton.buttons,
                },
              },
            } : undefined,
            actionList: interactiveContent.actionList ? {
              upsert: {
                create: {
                  buttonText: interactiveContent.actionList.buttonText,
                  sections: interactiveContent.actionList.sections,
                },
                update: {
                  buttonText: interactiveContent.actionList.buttonText,
                  sections: interactiveContent.actionList.sections,
                },
              },
            } : undefined,
          },
        };
      }
    }

    if (existingTemplate.type === TemplateType.WHATSAPP_OFFICIAL && whatsappOfficialInfo) {
      if (existingTemplate.whatsappOfficialInfo) {
        // Atualizar informações do WhatsApp oficial
        updateData.whatsappOfficialInfo = {
          update: {
            status: whatsappOfficialInfo.status,
            category: whatsappOfficialInfo.category,
            qualityScore: whatsappOfficialInfo.qualityScore,
            components: whatsappOfficialInfo.components,
          },
        };
      }
    }

    // Executar atualização
    const updatedTemplate = await prisma.template.update({
      where: { id },
      data: updateData,
      include: {
        createdBy: {
          select: { id: true, name: true, email: true },
        },
        inbox: {
          select: { id: true, nome: true, inboxId: true },
        },
        interactiveContent: {
          include: {
            header: true,
            body: true,
            footer: true,
            actionCtaUrl: true,
            actionReplyButton: true,
            actionList: true,
            actionFlow: true,
            actionLocationRequest: true,
          },
        },
        whatsappOfficialInfo: true,
      },
    });

    console.log(`[Template Detail API] Template atualizado: ${updatedTemplate.id} (${updatedTemplate.type})`);

    return NextResponse.json(updatedTemplate);

  } catch (error) {
    console.error('[Template Detail API] Erro ao atualizar template:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}

/**
 * DELETE - Remove um template
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: 'ID do template é obrigatório' },
        { status: 400 }
      );
    }

    // Verificar se o template existe e se o usuário pode deletá-lo
    const existingTemplate = await prisma.template.findFirst({
      where: {
        id,
        createdById: session.user.id, // Apenas o criador pode deletar
      },
      include: {
        _count: {
          select: {
            mapeamentos: true,
          },
        },
      },
    });

    if (!existingTemplate) {
      return NextResponse.json(
        { error: 'Template não encontrado ou sem permissão para deletar' },
        { status: 404 }
      );
    }

    // Verificar se o template está sendo usado
    if (existingTemplate._count.mapeamentos > 0) {
      return NextResponse.json(
        { error: 'Não é possível deletar um template que está sendo usado em mapeamentos' },
        { status: 409 }
      );
    }

    // Remover template (dados relacionados serão removidos em cascata)
    await prisma.template.delete({
      where: { id },
    });

    console.log(`[Template Detail API] Template removido: ${id} (${existingTemplate.type})`);

    return NextResponse.json({ message: 'Template removido com sucesso' });

  } catch (error) {
    console.error('[Template Detail API] Erro ao remover template:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}