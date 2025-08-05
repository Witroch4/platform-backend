// app/api/admin/templates/analytics/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getPrismaInstance } from '@/lib/connections';
import { Prisma, TemplateType, TemplateScope, TemplateStatus } from '@prisma/client';

/**
 * GET - Retorna analytics e estatísticas dos templates
 */
export async function GET(request: NextRequest): Promise<Response> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') || '30'; // dias
    const inboxId = searchParams.get('inboxId') || '';

    // Calcular data de início baseada no período
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(period));

    // Construir condições de filtro
    const whereConditions: any = {
      OR: [
        { createdById: session.user.id },
        { scope: TemplateScope.GLOBAL },
      ],
    };

    if (inboxId) {
      whereConditions.inboxId = inboxId;
    }

    console.log(`[Template Analytics API] Gerando analytics para período de ${period} dias`);

    // Buscar estatísticas gerais
    const [
      totalTemplates,
      activeTemplates,
      templatesByType,
      templatesByStatus,
      templatesByScope,
      mostUsedTemplates,
      recentTemplates,
      templatesWithMappings,
    ] = await Promise.all([
      // Total de templates
      getPrismaInstance().template.count({ where: whereConditions }),
      
      // Templates ativos
      getPrismaInstance().template.count({ 
        where: { ...whereConditions, isActive: true } 
      }),
      
      // Templates por tipo
      getPrismaInstance().template.groupBy({
        by: ['type'],
        where: whereConditions,
        _count: true,
      }),
      
      // Templates por status
      getPrismaInstance().template.groupBy({
        by: ['status'],
        where: whereConditions,
        _count: true,
      }),
      
      // Templates por escopo
      getPrismaInstance().template.groupBy({
        by: ['scope'],
        where: whereConditions,
        _count: true,
      }),
      
      // Templates mais usados
      getPrismaInstance().template.findMany({
        where: whereConditions,
        select: {
          id: true,
          name: true,
          type: true,
          usageCount: true,
          createdAt: true,
          createdBy: {
            select: { id: true, name: true },
          },
        },
        orderBy: { usageCount: 'desc' },
        take: 10,
      }),
      
      // Templates criados recentemente
      getPrismaInstance().template.findMany({
        where: {
          ...whereConditions,
          createdAt: { gte: startDate },
        },
        select: {
          id: true,
          name: true,
          type: true,
          createdAt: true,
          createdBy: {
            select: { id: true, name: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      
      // Templates com mapeamentos
      getPrismaInstance().template.findMany({
        where: {
          ...whereConditions,
          mapeamentos: { some: {} },
        },
        select: {
          id: true,
          name: true,
          type: true,
          _count: {
            select: {
              mapeamentos: true,
            },
          },
        },
        orderBy: {
          mapeamentos: {
            _count: Prisma.SortOrder.desc,
          },
        },
        take: 10,
      }),
    ]);

    // Calcular estatísticas de uso por período
    const usageByPeriod = await getPrismaInstance().template.findMany({
      where: {
        ...whereConditions,
        updatedAt: { gte: startDate },
      },
      select: {
        id: true,
        name: true,
        usageCount: true,
        updatedAt: true,
      },
    });

    // Agrupar uso por dia
    const usageByDay = usageByPeriod.reduce((acc: any, template) => {
      const day = template.updatedAt.toISOString().split('T')[0];
      if (!acc[day]) {
        acc[day] = { date: day, usage: 0, templates: 0 };
      }
      acc[day].usage += template.usageCount;
      acc[day].templates += 1;
      return acc;
    }, {});

    // Calcular taxa de aprovação
    const approvalStats = await getPrismaInstance().templateApprovalRequest.groupBy({
      by: ['status'],
      where: {
        template: whereConditions,
        requestedAt: { gte: startDate },
      },
      _count: true,
    });

    const totalApprovalRequests = approvalStats.reduce((sum, stat) => sum + stat._count, 0);
    const approvedRequests = approvalStats.find(stat => stat.status === 'approved')?._count || 0;
    const approvalRate = totalApprovalRequests > 0 ? (approvedRequests / totalApprovalRequests) * 100 : 0;

    // Formatar estatísticas por tipo
    const typeStats = Object.values(TemplateType).map(type => {
      const stat = templatesByType.find(t => t.type === type);
      return {
        type,
        count: stat?._count || 0,
        percentage: totalTemplates > 0 ? ((stat?._count || 0) / totalTemplates) * 100 : 0,
      };
    });

    // Formatar estatísticas por status
    const statusStats = Object.values(TemplateStatus).map(status => {
      const stat = templatesByStatus.find(s => s.status === status);
      return {
        status,
        count: stat?._count || 0,
        percentage: totalTemplates > 0 ? ((stat?._count || 0) / totalTemplates) * 100 : 0,
      };
    });

    // Formatar estatísticas por escopo
    const scopeStats = Object.values(TemplateScope).map(scope => {
      const stat = templatesByScope.find(s => s.scope === scope);
      return {
        scope,
        count: stat?._count || 0,
        percentage: totalTemplates > 0 ? ((stat?._count || 0) / totalTemplates) * 100 : 0,
      };
    });

    // Calcular tendências
    const previousPeriodStart = new Date(startDate);
    previousPeriodStart.setDate(previousPeriodStart.getDate() - parseInt(period));

    const [currentPeriodCount, previousPeriodCount] = await Promise.all([
      getPrismaInstance().template.count({
        where: {
          ...whereConditions,
          createdAt: { gte: startDate },
        },
      }),
      getPrismaInstance().template.count({
        where: {
          ...whereConditions,
          createdAt: { 
            gte: previousPeriodStart,
            lt: startDate,
          },
        },
      }),
    ]);

    const growthRate = previousPeriodCount > 0 
      ? ((currentPeriodCount - previousPeriodCount) / previousPeriodCount) * 100 
      : currentPeriodCount > 0 ? 100 : 0;

    return NextResponse.json({
      summary: {
        totalTemplates,
        activeTemplates,
        inactiveTemplates: totalTemplates - activeTemplates,
        activationRate: totalTemplates > 0 ? (activeTemplates / totalTemplates) * 100 : 0,
        approvalRate,
        growthRate,
      },
      breakdown: {
        byType: typeStats,
        byStatus: statusStats,
        byScope: scopeStats,
      },
      rankings: {
        mostUsed: mostUsedTemplates,
        mostMapped: templatesWithMappings,
        recent: recentTemplates,
      },
      trends: {
        usageByDay: Object.values(usageByDay).sort((a: any, b: any) => 
          new Date(a.date).getTime() - new Date(b.date).getTime()
        ),
        period: parseInt(period),
        startDate: startDate.toISOString(),
        endDate: new Date().toISOString(),
      },
      approval: {
        totalRequests: totalApprovalRequests,
        approvedRequests,
        pendingRequests: approvalStats.find(stat => stat.status === 'pending')?._count || 0,
        rejectedRequests: approvalStats.find(stat => stat.status === 'rejected')?._count || 0,
        approvalRate,
      },
    });

  } catch (error) {
    console.error('[Template Analytics API] Erro ao gerar analytics:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}