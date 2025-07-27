// app/api/admin/templates/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { TemplateType, TemplateScope, TemplateStatus } from '@prisma/client';

/**
 * GET - Lista templates usando o modelo unificado com filtros e paginação
 */
export async function GET(request: NextRequest): Promise<Response> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    
    // Parâmetros de paginação
    const page = parseInt(searchParams.get('page') || '1');
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100);
    const skip = (page - 1) * limit;

    // Parâmetros de filtro
    const type = searchParams.get('type') as TemplateType | null;
    const scope = searchParams.get('scope') as TemplateScope | null;
    const status = searchParams.get('status') as TemplateStatus | null;
    const search = searchParams.get('search') || '';
    const tags = searchParams.get('tags')?.split(',').filter(Boolean) || [];
    const language = searchParams.get('language') || '';
    const inboxId = searchParams.get('inboxId') || '';
    const isActive = searchParams.get('isActive');
    
    // Parâmetros de ordenação
    const sortBy = searchParams.get('sortBy') || 'createdAt';
    const sortOrder = searchParams.get('sortOrder') === 'asc' ? 'asc' : 'desc';

    // Construir condições de filtro
    const whereConditions: any = {
      OR: [
        { createdById: session.user.id }, // Templates criados pelo usuário
        { scope: TemplateScope.GLOBAL }, // Templates globais
      ],
    };

    // Filtro por tipo
    if (type && Object.values(TemplateType).includes(type)) {
      whereConditions.type = type;
    }

    // Filtro por escopo
    if (scope && Object.values(TemplateScope).includes(scope)) {
      whereConditions.scope = scope;
    }

    // Filtro por status
    if (status && Object.values(TemplateStatus).includes(status)) {
      whereConditions.status = status;
    }

    // Filtro por inbox
    if (inboxId) {
      whereConditions.inboxId = inboxId;
    }

    // Filtro por idioma
    if (language) {
      whereConditions.language = language;
    }

    // Filtro por ativo/inativo
    if (isActive !== null) {
      whereConditions.isActive = isActive === 'true';
    }

    // Filtro por tags
    if (tags.length > 0) {
      whereConditions.tags = {
        hasSome: tags,
      };
    }

    // Filtro de busca por texto
    if (search.trim()) {
      whereConditions.AND = [
        whereConditions.AND || {},
        {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { description: { contains: search, mode: 'insensitive' } },
            { simpleReplyText: { contains: search, mode: 'insensitive' } },
          ],
        },
      ];
    }

    // Validar campo de ordenação
    const validSortFields = ['createdAt', 'updatedAt', 'name', 'usageCount', 'type', 'status'];
    const orderBy = validSortFields.includes(sortBy) 
      ? { [sortBy]: sortOrder }
      : { createdAt: 'desc' };

    console.log(`[Templates API] Buscando templates - Página: ${page}, Tipo: ${type}, Escopo: ${scope}`);

    // Buscar templates com dados relacionados
    const [templates, total] = await Promise.all([
      prisma.template.findMany({
        where: whereConditions,
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
            select: {
              id: true,
              intentName: true,
              inboxId: true,
            },
          },
          approvalRequests: {
            where: { status: 'pending' },
            select: {
              id: true,
              status: true,
              requestMessage: true,
              requestedAt: true,
              requestedBy: {
                select: { id: true, name: true },
              },
            },
          },
          _count: {
            select: {
              mapeamentos: true,
              approvalRequests: true,
            },
          },
        },
        orderBy,
        skip,
        take: limit,
      }),
      prisma.template.count({ where: whereConditions }),
    ]);

    // Formatar resposta
    const formattedTemplates = templates.map(template => ({
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
    }));

    // Calcular metadados de paginação
    const totalPages = Math.ceil(total / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    return NextResponse.json({
      templates: formattedTemplates,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage,
        hasPrevPage,
      },
      filters: {
        type,
        scope,
        status,
        search,
        tags,
        language,
        inboxId,
        isActive,
        sortBy,
        sortOrder,
      },
    });

  } catch (error) {
    console.error('[Templates API] Erro ao buscar templates:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}

/**
 * POST - Cria um novo template usando o modelo unificado
 */
export async function POST(request: NextRequest): Promise<Response> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const body = await request.json();
    const {
      name,
      description,
      type,
      scope = TemplateScope.PRIVATE,
      language = 'pt_BR',
      tags = [],
      inboxId,
      simpleReplyText,
      // Dados específicos por tipo
      interactiveContent,
      whatsappOfficialInfo,
    } = body;

    // Validações básicas
    if (!name || !type) {
      return NextResponse.json(
        { error: 'Nome e tipo são obrigatórios' },
        { status: 400 }
      );
    }

    if (!Object.values(TemplateType).includes(type)) {
      return NextResponse.json(
        { error: 'Tipo de template inválido' },
        { status: 400 }
      );
    }

    // Verificar se já existe um template com o mesmo nome no mesmo escopo
    const existingTemplate = await prisma.template.findFirst({
      where: {
        name,
        createdById: session.user.id,
        inboxId: inboxId || null,
      },
    });

    if (existingTemplate) {
      return NextResponse.json(
        { error: 'Já existe um template com este nome' },
        { status: 409 }
      );
    }

    // Preparar dados do template
    const templateData: any = {
      name,
      description,
      type,
      scope,
      language,
      tags,
      createdById: session.user.id,
      inboxId: inboxId || null,
    };

    // Adicionar dados específicos por tipo
    if (type === TemplateType.AUTOMATION_REPLY && simpleReplyText) {
      templateData.simpleReplyText = simpleReplyText;
    }

    if (type === TemplateType.INTERACTIVE_MESSAGE && interactiveContent) {
      templateData.interactiveContent = {
        create: {
          body: {
            create: {
              text: interactiveContent.body.text,
            },
          },
          header: interactiveContent.header ? {
            create: {
              type: interactiveContent.header.type,
              content: interactiveContent.header.content,
            },
          } : undefined,
          footer: interactiveContent.footer ? {
            create: {
              text: interactiveContent.footer.text,
            },
          } : undefined,
          // Ações específicas
          actionCtaUrl: interactiveContent.actionCtaUrl ? {
            create: {
              displayText: interactiveContent.actionCtaUrl.displayText,
              url: interactiveContent.actionCtaUrl.url,
            },
          } : undefined,
          actionReplyButton: interactiveContent.actionReplyButton ? {
            create: {
              buttons: interactiveContent.actionReplyButton.buttons,
            },
          } : undefined,
          actionList: interactiveContent.actionList ? {
            create: {
              buttonText: interactiveContent.actionList.buttonText,
              sections: interactiveContent.actionList.sections,
            },
          } : undefined,
          actionFlow: interactiveContent.actionFlow ? {
            create: {
              flowId: interactiveContent.actionFlow.flowId,
              flowCta: interactiveContent.actionFlow.flowCta,
              flowMode: interactiveContent.actionFlow.flowMode || 'published',
              flowData: interactiveContent.actionFlow.flowData,
            },
          } : undefined,
          actionLocationRequest: interactiveContent.actionLocationRequest ? {
            create: {
              requestText: interactiveContent.actionLocationRequest.requestText,
            },
          } : undefined,
        },
      };
    }

    if (type === TemplateType.WHATSAPP_OFFICIAL && whatsappOfficialInfo) {
      templateData.whatsappOfficialInfo = {
        create: {
          metaTemplateId: whatsappOfficialInfo.metaTemplateId,
          status: whatsappOfficialInfo.status,
          category: whatsappOfficialInfo.category,
          qualityScore: whatsappOfficialInfo.qualityScore,
          components: whatsappOfficialInfo.components,
        },
      };
    }

    // Criar template
    const newTemplate = await prisma.template.create({
      data: templateData,
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

    console.log(`[Templates API] Template criado: ${newTemplate.id} (${type})`);

    return NextResponse.json(newTemplate, { status: 201 });

  } catch (error) {
    console.error('[Templates API] Erro ao criar template:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}