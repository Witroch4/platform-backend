/**
 * Alert Generation Service
 * 
 * Generates quality alerts based on flow analytics data.
 * Identifies critical issues like high drop-offs, stuck sessions, and recurring errors.
 * 
 * Validates Requirements: 6.1-6.5
 */

import { getPrismaInstance } from '@/lib/connections';
import type { Prisma } from '@prisma/client';

// =============================================================================
// TYPES
// =============================================================================

export type AlertSeverity = 'critical' | 'warning' | 'info';
export type AlertType = 
  | 'high_dropoff' 
  | 'stuck_session' 
  | 'recurring_error' 
  | 'zero_clicks'
  | 'performance_degradation';

export interface FlowAlert {
  id: string;
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  message: string;
  flowId?: string;
  flowName?: string;
  nodeId?: string;
  nodeName?: string;
  sessionId?: string;
  metadata: Record<string, any>;
  createdAt: Date;
}

interface DropOffNode {
  nodeId: string;
  nodeName: string;
  dropOffRate: number;
  sessionCount: number;
}

interface StuckSession {
  id: string;
  flowId: string;
  flowName: string;
  conversationId: string;
  inactiveMinutes: number;
}

interface RecurringError {
  nodeId: string;
  nodeName: string;
  errorMessage: string;
  count: number;
}

// =============================================================================
// ALERT GENERATION FUNCTIONS
// =============================================================================

/**
 * Generate alerts for nodes with high drop-off rates (>50%)
 * Validates Requirement 6.1
 */
async function generateHighDropOffAlerts(
  inboxId: string,
  flowId?: string,
  dateStart?: Date,
  dateEnd?: Date
): Promise<FlowAlert[]> {
  const prisma = getPrismaInstance();
  const alerts: FlowAlert[] = [];

  // Build filter
  const filter: Prisma.FlowSessionWhereInput = {
    flow: {
      inboxId,
      ...(flowId && { id: flowId }),
    },
    ...(dateStart || dateEnd ? {
      createdAt: {
        ...(dateStart && { gte: dateStart }),
        ...(dateEnd && { lte: dateEnd }),
      },
    } : {}),
  };

  // Get all sessions
  const sessions = await prisma.flowSession.findMany({
    where: filter,
    select: {
      id: true,
      flowId: true,
      currentNodeId: true,
      status: true,
      flow: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  if (sessions.length === 0) return alerts;

  // Calculate drop-off by node
  const nodeStats = new Map<string, { total: number; dropOffs: number; flowName: string }>();

  for (const session of sessions) {
    if (!session.currentNodeId) continue;

    const key = `${session.flowId}:${session.currentNodeId}`;
    const stats = nodeStats.get(key) || { total: 0, dropOffs: 0, flowName: session.flow.name };
    
    stats.total++;
    if (session.status === 'ERROR') {
      stats.dropOffs++;
    }

    nodeStats.set(key, stats);
  }

  // Generate alerts for nodes with >50% drop-off
  for (const [key, stats] of nodeStats.entries()) {
    const dropOffRate = (stats.dropOffs / stats.total) * 100;
    
    if (dropOffRate > 50 && stats.total >= 5) {
      const [flowId, nodeId] = key.split(':');
      
      alerts.push({
        id: `dropoff-${key}-${Date.now()}`,
        type: 'high_dropoff',
        severity: 'critical',
        title: 'Taxa de abandono crítica',
        message: `Nó com ${dropOffRate.toFixed(1)}% de abandono (${stats.dropOffs}/${stats.total} sessões)`,
        flowId,
        flowName: stats.flowName,
        nodeId,
        nodeName: nodeId,
        metadata: {
          dropOffRate,
          totalSessions: stats.total,
          dropOffCount: stats.dropOffs,
        },
        createdAt: new Date(),
      });
    }
  }

  return alerts;
}

/**
 * Generate alerts for sessions stuck in WAITING_INPUT for >60 minutes
 * Validates Requirement 6.3
 */
async function generateStuckSessionAlerts(inboxId: string): Promise<FlowAlert[]> {
  const prisma = getPrismaInstance();
  const alerts: FlowAlert[] = [];

  const sixtyMinutesAgo = new Date(Date.now() - 60 * 60 * 1000);

  const stuckSessions = await prisma.flowSession.findMany({
    where: {
      flow: { inboxId },
      status: 'WAITING_INPUT',
      updatedAt: {
        lt: sixtyMinutesAgo,
      },
    },
    select: {
      id: true,
      flowId: true,
      conversationId: true,
      updatedAt: true,
      flow: {
        select: {
          name: true,
        },
      },
    },
    take: 50, // Limit to avoid too many alerts
  });

  for (const session of stuckSessions) {
    const inactiveMinutes = Math.floor((Date.now() - session.updatedAt.getTime()) / 60000);

    alerts.push({
      id: `stuck-${session.id}`,
      type: 'stuck_session',
      severity: 'warning',
      title: 'Sessão travada',
      message: `Sessão aguardando entrada há ${inactiveMinutes} minutos`,
      flowId: session.flowId,
      flowName: session.flow.name,
      sessionId: session.id,
      metadata: {
        conversationId: session.conversationId,
        inactiveMinutes,
        lastUpdate: session.updatedAt.toISOString(),
      },
      createdAt: new Date(),
    });
  }

  return alerts;
}

/**
 * Generate alerts for recurring errors (5+ in 1 hour)
 * Validates Requirement 6.4
 */
async function generateRecurringErrorAlerts(
  inboxId: string,
  flowId?: string
): Promise<FlowAlert[]> {
  const prisma = getPrismaInstance();
  const alerts: FlowAlert[] = [];

  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

  const errorSessions = await prisma.flowSession.findMany({
    where: {
      flow: {
        inboxId,
        ...(flowId && { id: flowId }),
      },
      status: 'ERROR',
      createdAt: {
        gte: oneHourAgo,
      },
    },
    select: {
      id: true,
      flowId: true,
      currentNodeId: true,
      flow: {
        select: {
          name: true,
        },
      },
    },
  });

  // Group errors by node
  const errorsByNode = new Map<string, { count: number; flowName: string; nodeId: string }>();

  for (const session of errorSessions) {
    if (!session.currentNodeId) continue;

    const key = `${session.flowId}:${session.currentNodeId}`;
    const stats = errorsByNode.get(key) || { 
      count: 0, 
      flowName: session.flow.name,
      nodeId: session.currentNodeId,
    };
    
    stats.count++;
    errorsByNode.set(key, stats);
  }

  // Generate alerts for nodes with 5+ errors
  for (const [key, stats] of errorsByNode.entries()) {
    if (stats.count >= 5) {
      const [flowId] = key.split(':');

      alerts.push({
        id: `recurring-error-${key}-${Date.now()}`,
        type: 'recurring_error',
        severity: 'critical',
        title: 'Erro recorrente detectado',
        message: `${stats.count} erros no mesmo nó na última hora`,
        flowId,
        flowName: stats.flowName,
        nodeId: stats.nodeId,
        nodeName: stats.nodeId,
        metadata: {
          errorCount: stats.count,
          timeWindow: '1 hour',
        },
        createdAt: new Date(),
      });
    }
  }

  return alerts;
}

// =============================================================================
// MAIN FUNCTION
// =============================================================================

/**
 * Generate all alerts for an inbox
 */
export async function generateAlerts(
  inboxId: string,
  flowId?: string,
  dateStart?: Date,
  dateEnd?: Date
): Promise<FlowAlert[]> {
  const [dropOffAlerts, stuckAlerts, errorAlerts] = await Promise.all([
    generateHighDropOffAlerts(inboxId, flowId, dateStart, dateEnd),
    generateStuckSessionAlerts(inboxId),
    generateRecurringErrorAlerts(inboxId, flowId),
  ]);

  return [...dropOffAlerts, ...stuckAlerts, ...errorAlerts];
}
