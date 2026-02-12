import { type NextRequest, NextResponse } from 'next/server';
import { getPrismaInstance } from '@/lib/connections';
import { auth } from '@/auth';

// =============================================================================
// TYPES
// =============================================================================

interface FlowStats {
  totalFlows: number;
  activeFlows: number;
  totalSessions: number;
  activeSessions: number;
  waitingSessions: number;
  completedSessions: number;
  errorSessions: number;
}

interface FlowSessionDetail {
  id: string;
  flowId: string;
  flowName: string;
  conversationId: string;
  contactId: string;
  inboxId: string;
  status: string;
  currentNodeId: string | null;
  createdAt: Date;
  completedAt: Date | null;
  variables: unknown;
}

interface FlowDetail {
  id: string;
  name: string;
  isActive: boolean;
  nodeCount: number;
  edgeCount: number;
  sessionCount: number;
  activeSessionCount: number;
  createdAt: Date;
  updatedAt: Date;
}

// =============================================================================
// GET - Buscar dados de admin do Flow Engine
// =============================================================================

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: 'Não autorizado' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const inboxId = searchParams.get('inboxId');
    const dataType = searchParams.get('dataType') || 'stats'; // stats | flows | sessions

    if (!inboxId) {
      return NextResponse.json(
        { success: false, error: 'inboxId é obrigatório' },
        { status: 400 }
      );
    }

    const prisma = getPrismaInstance();

    // Verificar acesso à inbox
    const inbox = await prisma.chatwitInbox.findFirst({
      where: {
        id: inboxId,
        usuarioChatwit: { appUserId: session.user.id },
      },
    });

    if (!inbox) {
      return NextResponse.json(
        { success: false, error: 'Inbox não encontrada ou acesso negado' },
        { status: 404 }
      );
    }

    // ==========================================================================
    // STATS - Estatísticas gerais
    // ==========================================================================
    if (dataType === 'stats') {
      const flows = await prisma.flow.findMany({
        where: { inboxId },
        include: {
          _count: {
            select: {
              nodes: true,
              edges: true,
              sessions: true,
            },
          },
        },
      });

      const sessions = await prisma.flowSession.groupBy({
        by: ['status'],
        where: {
          flow: { inboxId },
        },
        _count: true,
      });

      const sessionsByStatus = sessions.reduce((acc, s) => {
        acc[s.status] = s._count;
        return acc;
      }, {} as Record<string, number>);

      const stats: FlowStats = {
        totalFlows: flows.length,
        activeFlows: flows.filter(f => f.isActive).length,
        totalSessions: Object.values(sessionsByStatus).reduce((a, b) => a + b, 0),
        activeSessions: sessionsByStatus['ACTIVE'] || 0,
        waitingSessions: sessionsByStatus['WAITING_INPUT'] || 0,
        completedSessions: sessionsByStatus['COMPLETED'] || 0,
        errorSessions: sessionsByStatus['ERROR'] || 0,
      };

      return NextResponse.json({ success: true, data: stats });
    }

    // ==========================================================================
    // FLOWS - Lista de flows com contadores
    // ==========================================================================
    if (dataType === 'flows') {
      const flows = await prisma.flow.findMany({
        where: { inboxId },
        include: {
          _count: {
            select: {
              nodes: true,
              edges: true,
              sessions: true,
            },
          },
          sessions: {
            where: {
              status: { in: ['ACTIVE', 'WAITING_INPUT'] },
            },
            select: { id: true },
          },
        },
        orderBy: { updatedAt: 'desc' },
      });

      const flowDetails: FlowDetail[] = flows.map(f => ({
        id: f.id,
        name: f.name,
        isActive: f.isActive,
        nodeCount: f._count.nodes,
        edgeCount: f._count.edges,
        sessionCount: f._count.sessions,
        activeSessionCount: f.sessions.length,
        createdAt: f.createdAt,
        updatedAt: f.updatedAt,
      }));

      return NextResponse.json({ success: true, data: flowDetails });
    }

    // ==========================================================================
    // SESSIONS - Lista de sessões com detalhes
    // ==========================================================================
    if (dataType === 'sessions') {
      const statusFilter = searchParams.get('status'); // all | active | waiting | completed | error
      const flowIdFilter = searchParams.get('flowId');
      const limit = parseInt(searchParams.get('limit') || '50');

      const whereClause: any = {
        flow: { inboxId },
      };

      if (statusFilter && statusFilter !== 'all') {
        if (statusFilter === 'active') {
          whereClause.status = { in: ['ACTIVE', 'WAITING_INPUT'] };
        } else {
          whereClause.status = statusFilter.toUpperCase();
        }
      }

      if (flowIdFilter) {
        whereClause.flowId = flowIdFilter;
      }

      const sessions = await prisma.flowSession.findMany({
        where: whereClause,
        include: {
          flow: {
            select: { name: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
      });

      const sessionDetails: FlowSessionDetail[] = sessions.map(s => ({
        id: s.id,
        flowId: s.flowId,
        flowName: s.flow.name,
        conversationId: s.conversationId,
        contactId: s.contactId,
        inboxId: s.inboxId,
        status: s.status,
        currentNodeId: s.currentNodeId,
        createdAt: s.createdAt,
        completedAt: s.completedAt,
        variables: s.variables,
      }));

      return NextResponse.json({ success: true, data: sessionDetails });
    }

    return NextResponse.json(
      { success: false, error: 'dataType inválido' },
      { status: 400 }
    );
  } catch (error) {
    console.error('[flow-admin] GET error:', error);
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
// POST - Ações de admin (abortar sessões, force delete)
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
    const { action, inboxId, flowId, sessionId, sessionIds } = body;

    if (!inboxId) {
      return NextResponse.json(
        { success: false, error: 'inboxId é obrigatório' },
        { status: 400 }
      );
    }

    const prisma = getPrismaInstance();

    // Verificar acesso à inbox
    const inbox = await prisma.chatwitInbox.findFirst({
      where: {
        id: inboxId,
        usuarioChatwit: { appUserId: session.user.id },
      },
    });

    if (!inbox) {
      return NextResponse.json(
        { success: false, error: 'Inbox não encontrada ou acesso negado' },
        { status: 404 }
      );
    }

    // ==========================================================================
    // ABORT_SESSION - Abortar uma sessão específica
    // ==========================================================================
    if (action === 'abort_session') {
      if (!sessionId) {
        return NextResponse.json(
          { success: false, error: 'sessionId é obrigatório' },
          { status: 400 }
        );
      }

      const updated = await prisma.flowSession.updateMany({
        where: {
          id: sessionId,
          flow: { inboxId },
          status: { in: ['ACTIVE', 'WAITING_INPUT'] },
        },
        data: {
          status: 'ERROR',
          completedAt: new Date(),
        },
      });

      return NextResponse.json({
        success: true,
        message: `${updated.count} sessão(ões) abortada(s)`,
        affected: updated.count,
      });
    }

    // ==========================================================================
    // ABORT_SESSIONS - Abortar múltiplas sessões
    // ==========================================================================
    if (action === 'abort_sessions') {
      const ids = sessionIds || [];
      if (ids.length === 0) {
        return NextResponse.json(
          { success: false, error: 'sessionIds é obrigatório' },
          { status: 400 }
        );
      }

      const updated = await prisma.flowSession.updateMany({
        where: {
          id: { in: ids },
          flow: { inboxId },
          status: { in: ['ACTIVE', 'WAITING_INPUT'] },
        },
        data: {
          status: 'ERROR',
          completedAt: new Date(),
        },
      });

      return NextResponse.json({
        success: true,
        message: `${updated.count} sessão(ões) abortada(s)`,
        affected: updated.count,
      });
    }

    // ==========================================================================
    // ABORT_ALL_FLOW_SESSIONS - Abortar todas as sessões de um flow
    // ==========================================================================
    if (action === 'abort_all_flow_sessions') {
      if (!flowId) {
        return NextResponse.json(
          { success: false, error: 'flowId é obrigatório' },
          { status: 400 }
        );
      }

      const updated = await prisma.flowSession.updateMany({
        where: {
          flowId,
          flow: { inboxId },
          status: { in: ['ACTIVE', 'WAITING_INPUT'] },
        },
        data: {
          status: 'ERROR',
          completedAt: new Date(),
        },
      });

      return NextResponse.json({
        success: true,
        message: `${updated.count} sessão(ões) do flow abortada(s)`,
        affected: updated.count,
      });
    }

    // ==========================================================================
    // FORCE_DELETE_FLOW - Deletar flow forçando abort de sessões
    // ==========================================================================
    if (action === 'force_delete_flow') {
      if (!flowId) {
        return NextResponse.json(
          { success: false, error: 'flowId é obrigatório' },
          { status: 400 }
        );
      }

      // Verificar se o flow pertence à inbox
      const flow = await prisma.flow.findFirst({
        where: { id: flowId, inboxId },
      });

      if (!flow) {
        return NextResponse.json(
          { success: false, error: 'Flow não encontrado' },
          { status: 404 }
        );
      }

      // Contar sessões ativas para relatório
      const activeSessionsCount = await prisma.flowSession.count({
        where: {
          flowId,
          status: { in: ['ACTIVE', 'WAITING_INPUT'] },
        },
      });

      // DELETAR todas as sessions primeiro (schema não tem onDelete: Cascade)
      await prisma.flowSession.deleteMany({
        where: { flowId },
      });

      // Deletar o flow (cascade deleta nodes e edges)
      await prisma.flow.delete({
        where: { id: flowId },
      });

      const abortedSessions = { count: activeSessionsCount };

      return NextResponse.json({
        success: true,
        message: `Flow "${flow.name}" deletado. ${abortedSessions.count} sessão(ões) foram abortadas.`,
        abortedSessions: abortedSessions.count,
      });
    }

    // ==========================================================================
    // CLEANUP_OLD_SESSIONS - Limpar sessões antigas (>24h em WAITING_INPUT)
    // ==========================================================================
    if (action === 'cleanup_old_sessions') {
      const hoursThreshold = parseInt(body.hoursThreshold || '24');
      const cutoffDate = new Date(Date.now() - hoursThreshold * 60 * 60 * 1000);

      const updated = await prisma.flowSession.updateMany({
        where: {
          flow: { inboxId },
          status: { in: ['ACTIVE', 'WAITING_INPUT'] },
          createdAt: { lt: cutoffDate },
        },
        data: {
          status: 'ERROR',
          completedAt: new Date(),
        },
      });

      return NextResponse.json({
        success: true,
        message: `${updated.count} sessão(ões) antiga(s) limpas`,
        affected: updated.count,
      });
    }

    return NextResponse.json(
      { success: false, error: 'Ação inválida' },
      { status: 400 }
    );
  } catch (error) {
    console.error('[flow-admin] POST error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Erro interno',
      },
      { status: 500 }
    );
  }
}
