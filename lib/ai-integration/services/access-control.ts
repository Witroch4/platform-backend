/**
 * Access Control Service for AI Integration
 * 
 * Provides role-based access control for AI integration admin interfaces
 * and sensitive operations with comprehensive audit trails.
 */

import { getPrismaInstance } from '@/lib/connections';
const prisma = getPrismaInstance();
import { UserRole } from '@prisma/client';
import log from '@/lib/log';

/**
 * AI Integration specific permissions
 */
export enum AIPermission {
  // Audit log access
  VIEW_AUDIT_LOGS = 'ai:view_audit_logs',
  EXPORT_AUDIT_LOGS = 'ai:export_audit_logs',
  DELETE_AUDIT_LOGS = 'ai:delete_audit_logs',
  
  // Intent management
  MANAGE_INTENTS = 'ai:manage_intents',
  VIEW_INTENTS = 'ai:view_intents',
  
  // Queue management
  MANAGE_QUEUES = 'ai:manage_queues',
  VIEW_QUEUE_STATUS = 'ai:view_queue_status',
  REPROCESS_DLQ = 'ai:reprocess_dlq',
  
  // Configuration
  MANAGE_CONFIG = 'ai:manage_config',
  VIEW_CONFIG = 'ai:view_config',
  ROTATE_SECRETS = 'ai:rotate_secrets',
  
  // Monitoring
  VIEW_METRICS = 'ai:view_metrics',
  MANAGE_ALERTS = 'ai:manage_alerts',
  
  // Data management
  CLEANUP_DATA = 'ai:cleanup_data',
  EXPORT_DATA = 'ai:export_data'
}

/**
 * Role to permissions mapping
 */
const ROLE_PERMISSIONS: Record<UserRole, AIPermission[]> = {
  [UserRole.SUPERADMIN]: [
    // Super admin has all permissions including sensitive operations
    AIPermission.VIEW_AUDIT_LOGS,
    AIPermission.EXPORT_AUDIT_LOGS,
    AIPermission.DELETE_AUDIT_LOGS,
    AIPermission.MANAGE_INTENTS,
    AIPermission.VIEW_INTENTS,
    AIPermission.MANAGE_QUEUES,
    AIPermission.VIEW_QUEUE_STATUS,
    AIPermission.REPROCESS_DLQ,
    AIPermission.MANAGE_CONFIG,
    AIPermission.VIEW_CONFIG,
    AIPermission.ROTATE_SECRETS,
    AIPermission.VIEW_METRICS,
    AIPermission.MANAGE_ALERTS,
    AIPermission.CLEANUP_DATA,
    AIPermission.EXPORT_DATA
  ],
  [UserRole.ADMIN]: [
    // Full access to all AI integration features
    AIPermission.VIEW_AUDIT_LOGS,
    AIPermission.EXPORT_AUDIT_LOGS,
    AIPermission.DELETE_AUDIT_LOGS,
    AIPermission.MANAGE_INTENTS,
    AIPermission.VIEW_INTENTS,
    AIPermission.MANAGE_QUEUES,
    AIPermission.VIEW_QUEUE_STATUS,
    AIPermission.REPROCESS_DLQ,
    AIPermission.MANAGE_CONFIG,
    AIPermission.VIEW_CONFIG,
    AIPermission.ROTATE_SECRETS,
    AIPermission.VIEW_METRICS,
    AIPermission.MANAGE_ALERTS,
    AIPermission.CLEANUP_DATA,
    AIPermission.EXPORT_DATA
  ],
  [UserRole.DEFAULT]: [
    // Limited read-only access for regular users
    AIPermission.VIEW_QUEUE_STATUS,
    AIPermission.VIEW_METRICS
  ]
};

/**
 * Interface for access control context
 */
export interface AccessContext {
  userId: string;
  userRole: UserRole;
  ipAddress?: string;
  userAgent?: string;
  sessionId?: string;
}

/**
 * Interface for audit trail entry
 */
export interface AuditTrailEntry {
  userId: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  details?: any;
  ipAddress?: string;
  userAgent?: string;
  success: boolean;
  errorMessage?: string;
}

/**
 * Checks if a user has a specific permission
 */
export function hasPermission(userRole: UserRole, permission: AIPermission): boolean {
  const rolePermissions = ROLE_PERMISSIONS[userRole] || [];
  return rolePermissions.includes(permission);
}

/**
 * Checks if a user has any of the specified permissions
 */
export function hasAnyPermission(userRole: UserRole, permissions: AIPermission[]): boolean {
  return permissions.some(permission => hasPermission(userRole, permission));
}

/**
 * Checks if a user has all of the specified permissions
 */
export function hasAllPermissions(userRole: UserRole, permissions: AIPermission[]): boolean {
  return permissions.every(permission => hasPermission(userRole, permission));
}

/**
 * Validates access and throws error if unauthorized
 */
export function requirePermission(context: AccessContext, permission: AIPermission): void {
  if (!hasPermission(context.userRole, permission)) {
    const error = new Error(`Access denied: Missing permission ${permission}`);
    
    // Log unauthorized access attempt
    logAuditTrail({
      userId: context.userId,
      action: 'ACCESS_DENIED',
      resourceType: 'AI_PERMISSION',
      resourceId: permission,
      details: {
        userRole: context.userRole,
        requiredPermission: permission
      },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      success: false,
      errorMessage: error.message
    }).catch(auditError => {
      log.error('Failed to log access denial', { auditError, context, permission });
    });
    
    throw error;
  }
}

/**
 * Validates access for multiple permissions (requires all)
 */
export function requireAllPermissions(context: AccessContext, permissions: AIPermission[]): void {
  const missingPermissions = permissions.filter(permission => 
    !hasPermission(context.userRole, permission)
  );
  
  if (missingPermissions.length > 0) {
    const error = new Error(`Access denied: Missing permissions ${missingPermissions.join(', ')}`);
    
    logAuditTrail({
      userId: context.userId,
      action: 'ACCESS_DENIED',
      resourceType: 'AI_PERMISSIONS',
      details: {
        userRole: context.userRole,
        requiredPermissions: permissions,
        missingPermissions
      },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      success: false,
      errorMessage: error.message
    }).catch(auditError => {
      log.error('Failed to log access denial', { auditError, context, permissions });
    });
    
    throw error;
  }
}

/**
 * Creates an audit trail entry
 */
export async function logAuditTrail(entry: AuditTrailEntry): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: entry.userId,
        action: entry.action,
        resourceType: entry.resourceType,
        resourceId: entry.resourceId,
        details: {
          ...entry.details,
          success: entry.success,
          errorMessage: entry.errorMessage,
          timestamp: new Date().toISOString()
        },
        ipAddress: entry.ipAddress,
        userAgent: entry.userAgent
      }
    });
    
    log.info('Audit trail logged', {
      userId: entry.userId,
      action: entry.action,
      resourceType: entry.resourceType,
      resourceId: entry.resourceId,
      success: entry.success
    });
    
  } catch (error) {
    log.error('Failed to create audit trail entry', { error, entry });
    // Don't throw here to avoid breaking the main operation
  }
}

/**
 * Logs successful access to sensitive resources
 */
export async function logSuccessfulAccess(
  context: AccessContext,
  action: string,
  resourceType: string,
  resourceId?: string,
  details?: any
): Promise<void> {
  await logAuditTrail({
    userId: context.userId,
    action,
    resourceType,
    resourceId,
    details: {
      ...details,
      userRole: context.userRole,
      sessionId: context.sessionId
    },
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
    success: true
  });
}

/**
 * Logs failed operations
 */
export async function logFailedOperation(
  context: AccessContext,
  action: string,
  resourceType: string,
  error: Error,
  resourceId?: string,
  details?: any
): Promise<void> {
  await logAuditTrail({
    userId: context.userId,
    action,
    resourceType,
    resourceId,
    details: {
      ...details,
      userRole: context.userRole,
      sessionId: context.sessionId
    },
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
    success: false,
    errorMessage: error.message
  });
}

/**
 * Gets audit trail for a specific user
 */
export async function getUserAuditTrail(
  userId: string,
  options: {
    startDate?: Date;
    endDate?: Date;
    action?: string;
    resourceType?: string;
    limit?: number;
    offset?: number;
  } = {}
): Promise<{
  entries: any[];
  total: number;
  hasMore: boolean;
}> {
  try {
    const {
      startDate,
      endDate,
      action,
      resourceType,
      limit = 50,
      offset = 0
    } = options;
    
    const where: any = { userId };
    
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = startDate;
      if (endDate) where.createdAt.lte = endDate;
    }
    
    if (action) where.action = action;
    if (resourceType) where.resourceType = resourceType;
    
    const [entries, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        select: {
          id: true,
          action: true,
          resourceType: true,
          resourceId: true,
          details: true,
          ipAddress: true,
          userAgent: true,
          createdAt: true
        }
      }),
      prisma.auditLog.count({ where })
    ]);
    
    return {
      entries,
      total,
      hasMore: offset + limit < total
    };
    
  } catch (error) {
    log.error('Failed to get user audit trail', { error, userId, options });
    throw error;
  }
}

/**
 * Gets audit trail for AI integration resources
 */
export async function getAIAuditTrail(
  options: {
    userId?: string;
    action?: string;
    resourceType?: string;
    resourceId?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  } = {}
): Promise<{
  entries: any[];
  total: number;
  hasMore: boolean;
}> {
  try {
    const {
      userId,
      action,
      resourceType,
      resourceId,
      startDate,
      endDate,
      limit = 50,
      offset = 0
    } = options;
    
    const where: any = {
      // Filter for AI integration related resources
      resourceType: {
        startsWith: 'AI_'
      }
    };
    
    if (userId) where.userId = userId;
    if (action) where.action = action;
    if (resourceType) where.resourceType = resourceType;
    if (resourceId) where.resourceId = resourceId;
    
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = startDate;
      if (endDate) where.createdAt.lte = endDate;
    }
    
    const [entries, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true
            }
          }
        }
      }),
      prisma.auditLog.count({ where })
    ]);
    
    return {
      entries,
      total,
      hasMore: offset + limit < total
    };
    
  } catch (error) {
    log.error('Failed to get AI audit trail', { error, options });
    throw error;
  }
}

/**
 * Gets audit statistics for monitoring
 */
export async function getAuditStatistics(
  timeframe: 'day' | 'week' | 'month' = 'day'
): Promise<{
  totalEntries: number;
  successfulOperations: number;
  failedOperations: number;
  uniqueUsers: number;
  topActions: Array<{ action: string; count: number }>;
  topResources: Array<{ resourceType: string; count: number }>;
  failureRate: number;
}> {
  try {
    const now = new Date();
    let startDate: Date;
    
    switch (timeframe) {
      case 'week':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    }
    
    const where = {
      createdAt: { gte: startDate },
      resourceType: { startsWith: 'AI_' }
    };
    
    const [
      totalEntries,
      successfulOperations,
      failedOperations,
      uniqueUsers,
      topActions,
      topResources
    ] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.count({
        where: {
          ...where,
          details: {
            path: ['success'],
            equals: true
          }
        }
      }),
      prisma.auditLog.count({
        where: {
          ...where,
          details: {
            path: ['success'],
            equals: false
          }
        }
      }),
      prisma.auditLog.findMany({
        where,
        select: { userId: true },
        distinct: ['userId']
      }).then((users: { userId: string }[]) => users.length),
      prisma.auditLog.groupBy({
        by: ['action'],
        where,
        _count: { action: true },
        orderBy: { _count: { action: 'desc' } },
        take: 10
      }),
      prisma.auditLog.groupBy({
        by: ['resourceType'],
        where,
        _count: { resourceType: true },
        orderBy: { _count: { resourceType: 'desc' } },
        take: 10
      })
    ]);
    
    const failureRate = totalEntries > 0 ? (failedOperations / totalEntries) * 100 : 0;
    
    return {
      totalEntries,
      successfulOperations,
      failedOperations,
      uniqueUsers,
      topActions: topActions.map((item: { action: string; _count: { action: number } }) => ({
        action: item.action,
        count: item._count.action
      })),
      topResources: topResources.map((item: { resourceType: string; _count: { resourceType: number } }) => ({
        resourceType: item.resourceType,
        count: item._count.resourceType
      })),
      failureRate
    };
    
  } catch (error) {
    log.error('Failed to get audit statistics', { error, timeframe });
    throw error;
  }
}

/**
 * Cleans up old audit logs (for LGPD compliance)
 */
export async function cleanupOldAuditLogs(
  retentionDays: number = 365
): Promise<{ deletedCount: number }> {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
    
    const result = await prisma.auditLog.deleteMany({
      where: {
        createdAt: { lt: cutoffDate },
        resourceType: { startsWith: 'AI_' }
      }
    });
    
    log.info('Old audit logs cleaned up', {
      deletedCount: result.count,
      cutoffDate,
      retentionDays
    });
    
    return { deletedCount: result.count };
    
  } catch (error) {
    log.error('Failed to cleanup old audit logs', { error, retentionDays });
    throw error;
  }
}