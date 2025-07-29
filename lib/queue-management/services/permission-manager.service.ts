/**
 * Permission Manager Service
 * 
 * Handles authorization and permission validation for queue operations
 */

import { 
  User, 
  Permission, 
  UserRole,
  QueueConfig 
} from '../../../types/queue-management'
import { 
  PERMISSIONS, 
  ROLE_PERMISSIONS, 
  USER_ROLES,
  ERROR_CODES 
} from '../constants'
import { InsufficientPermissionsError, UserNotFoundError } from '../errors'
import { Logger } from '../utils/logger'

export interface PermissionContext {
  userId: string
  queueName?: string
  jobId?: string
  action: string
  resource: string
}

export interface PermissionManagerInterface {
  hasPermission(user: User, permission: Permission, queueName?: string): boolean
  checkPermission(user: User, permission: Permission, queueName?: string): void
  validateJobOperation(user: User, action: string, queueName: string, jobId?: string): void
  validateQueueOperation(user: User, action: string, queueName: string): void
  validateBatchOperation(user: User, action: string, queueName: string, jobCount: number): void
  getUserPermissions(user: User, queueName?: string): Permission[]
  canAccessQueue(user: User, queueName: string): boolean
}

/**
 * Permission Manager Service Implementation
 */
export class PermissionManagerService implements PermissionManagerInterface {
  private logger: Logger

  constructor() {
    this.logger = new Logger('PermissionManagerService')
  }

  /**
   * Check if user has a specific permission
   */
  hasPermission(user: User, permission: Permission, queueName?: string): boolean {
    try {
      // Check global permissions first
      if (user.permissions.includes(permission)) {
        return true
      }

      // Check role-based permissions
      const rolePermissions = ROLE_PERMISSIONS[user.role] || []
      if (rolePermissions.includes(permission)) {
        return true
      }

      // Check queue-specific permissions
      if (queueName && user.queueAccess[queueName]) {
        return user.queueAccess[queueName].includes(permission)
      }

      return false
    } catch (error) {
      this.logger.error('Error checking permission:', error, {
        userId: user.userId,
        permission,
        queueName
      })
      return false
    }
  }

  /**
   * Check permission and throw error if not authorized
   */
  checkPermission(user: User, permission: Permission, queueName?: string): void {
    if (!this.hasPermission(user, permission, queueName)) {
      const resource = queueName ? `queue:${queueName}` : 'system'
      throw new InsufficientPermissionsError(permission, resource, user.userId)
    }
  }

  /**
   * Validate job operation permissions
   */
  validateJobOperation(user: User, action: string, queueName: string, jobId?: string): void {
    let requiredPermission: Permission

    switch (action) {
      case 'view':
        requiredPermission = PERMISSIONS.JOB_VIEW
        break
      case 'retry':
        requiredPermission = PERMISSIONS.JOB_RETRY
        break
      case 'remove':
      case 'delete':
        requiredPermission = PERMISSIONS.JOB_DELETE
        break
      case 'promote':
        requiredPermission = PERMISSIONS.JOB_PROMOTE
        break
      case 'delay':
        requiredPermission = PERMISSIONS.JOB_DELAY
        break
      default:
        throw new InsufficientPermissionsError(action, `job:${jobId || 'unknown'}`, user.userId)
    }

    this.checkPermission(user, requiredPermission, queueName)

    // Log the permission check
    this.logger.audit(
      `job:${action}`,
      user.userId,
      `job:${jobId || 'unknown'}`,
      { queueName, action }
    )
  }

  /**
   * Validate queue operation permissions
   */
  validateQueueOperation(user: User, action: string, queueName: string): void {
    let requiredPermission: Permission

    switch (action) {
      case 'view':
        requiredPermission = PERMISSIONS.QUEUE_VIEW
        break
      case 'manage':
      case 'update':
        requiredPermission = PERMISSIONS.QUEUE_MANAGE
        break
      case 'create':
        requiredPermission = PERMISSIONS.QUEUE_CREATE
        break
      case 'delete':
        requiredPermission = PERMISSIONS.QUEUE_DELETE
        break
      case 'pause':
        requiredPermission = PERMISSIONS.QUEUE_PAUSE
        break
      case 'resume':
        requiredPermission = PERMISSIONS.QUEUE_RESUME
        break
      default:
        throw new InsufficientPermissionsError(action, `queue:${queueName}`, user.userId)
    }

    this.checkPermission(user, requiredPermission, queueName)

    // Log the permission check
    this.logger.audit(
      `queue:${action}`,
      user.userId,
      `queue:${queueName}`,
      { queueName, action }
    )
  }

  /**
   * Validate batch operation permissions
   */
  validateBatchOperation(user: User, action: string, queueName: string, jobCount: number): void {
    // Check if user has batch operation permission
    this.checkPermission(user, PERMISSIONS.JOB_BATCH_OPERATIONS, queueName)

    // Check specific action permissions
    switch (action) {
      case 'retry_all_failed':
        this.checkPermission(user, PERMISSIONS.JOB_RETRY, queueName)
        break
      case 'clean_completed':
        this.checkPermission(user, PERMISSIONS.JOB_DELETE, queueName)
        break
      case 'pause_queue':
        this.checkPermission(user, PERMISSIONS.QUEUE_PAUSE, queueName)
        break
      case 'resume_queue':
        this.checkPermission(user, PERMISSIONS.QUEUE_RESUME, queueName)
        break
      default:
        throw new InsufficientPermissionsError(action, `queue:${queueName}`, user.userId)
    }

    // Additional validation for large batch operations
    if (jobCount > 1000 && user.role !== USER_ROLES.ADMIN && user.role !== USER_ROLES.SUPERADMIN) {
      throw new InsufficientPermissionsError(
        `batch operation with ${jobCount} jobs`,
        `queue:${queueName}`,
        user.userId
      )
    }

    // Log the batch operation
    this.logger.audit(
      `batch:${action}`,
      user.userId,
      `queue:${queueName}`,
      { queueName, action, jobCount }
    )
  }

  /**
   * Get all permissions for a user
   */
  getUserPermissions(user: User, queueName?: string): Permission[] {
    const permissions = new Set<Permission>()

    // Add explicit permissions
    user.permissions.forEach(permission => permissions.add(permission))

    // Add role-based permissions
    const rolePermissions = ROLE_PERMISSIONS[user.role] || []
    rolePermissions.forEach(permission => permissions.add(permission))

    // Add queue-specific permissions
    if (queueName && user.queueAccess[queueName]) {
      user.queueAccess[queueName].forEach(permission => permissions.add(permission))
    }

    return Array.from(permissions)
  }

  /**
   * Check if user can access a specific queue
   */
  canAccessQueue(user: User, queueName: string): boolean {
    // Superadmin and admin can access all queues
    if (user.role === USER_ROLES.SUPERADMIN || user.role === USER_ROLES.ADMIN) {
      return true
    }

    // Check if user has any queue-specific permissions
    if (user.queueAccess[queueName] && user.queueAccess[queueName].length > 0) {
      return true
    }

    // Check if user has global queue view permission
    return this.hasPermission(user, PERMISSIONS.QUEUE_VIEW)
  }

  /**
   * Get accessible queues for a user
   */
  getAccessibleQueues(user: User, allQueues: string[]): string[] {
    // Superadmin and admin can access all queues
    if (user.role === USER_ROLES.SUPERADMIN || user.role === USER_ROLES.ADMIN) {
      return allQueues
    }

    // Filter queues based on access permissions
    return allQueues.filter(queueName => this.canAccessQueue(user, queueName))
  }

  /**
   * Validate system-level permissions
   */
  validateSystemOperation(user: User, action: string): void {
    let requiredPermission: Permission

    switch (action) {
      case 'view_health':
        requiredPermission = PERMISSIONS.SYSTEM_HEALTH
        break
      case 'config':
        requiredPermission = PERMISSIONS.SYSTEM_CONFIG
        break
      case 'maintenance':
        requiredPermission = PERMISSIONS.SYSTEM_MAINTENANCE
        break
      case 'view_metrics':
        requiredPermission = PERMISSIONS.METRICS_VIEW
        break
      case 'export_metrics':
        requiredPermission = PERMISSIONS.METRICS_EXPORT
        break
      case 'view_analytics':
        requiredPermission = PERMISSIONS.ANALYTICS_VIEW
        break
      case 'advanced_analytics':
        requiredPermission = PERMISSIONS.ANALYTICS_ADVANCED
        break
      default:
        throw new InsufficientPermissionsError(action, 'system', user.userId)
    }

    this.checkPermission(user, requiredPermission)

    // Log the system operation
    this.logger.audit(
      `system:${action}`,
      user.userId,
      'system',
      { action }
    )
  }

  /**
   * Validate alert-related permissions
   */
  validateAlertOperation(user: User, action: string, alertId?: string): void {
    let requiredPermission: Permission

    switch (action) {
      case 'view':
        requiredPermission = PERMISSIONS.ALERT_VIEW
        break
      case 'manage':
      case 'create':
      case 'update':
      case 'delete':
        requiredPermission = PERMISSIONS.ALERT_MANAGE
        break
      case 'acknowledge':
        requiredPermission = PERMISSIONS.ALERT_ACKNOWLEDGE
        break
      case 'resolve':
        requiredPermission = PERMISSIONS.ALERT_RESOLVE
        break
      default:
        throw new InsufficientPermissionsError(action, `alert:${alertId || 'unknown'}`, user.userId)
    }

    this.checkPermission(user, requiredPermission)

    // Log the alert operation
    this.logger.audit(
      `alert:${action}`,
      user.userId,
      `alert:${alertId || 'unknown'}`,
      { action, alertId }
    )
  }

  /**
   * Validate flow-related permissions
   */
  validateFlowOperation(user: User, action: string, flowId: string): void {
    let requiredPermission: Permission

    switch (action) {
      case 'view':
        requiredPermission = PERMISSIONS.FLOW_VIEW
        break
      case 'manage':
      case 'create':
      case 'update':
        requiredPermission = PERMISSIONS.FLOW_MANAGE
        break
      case 'cancel':
        requiredPermission = PERMISSIONS.FLOW_CANCEL
        break
      case 'retry':
        requiredPermission = PERMISSIONS.FLOW_RETRY
        break
      default:
        throw new InsufficientPermissionsError(action, `flow:${flowId}`, user.userId)
    }

    this.checkPermission(user, requiredPermission)

    // Log the flow operation
    this.logger.audit(
      `flow:${action}`,
      user.userId,
      `flow:${flowId}`,
      { action, flowId }
    )
  }

  /**
   * Create permission context for logging
   */
  createPermissionContext(
    userId: string,
    action: string,
    resource: string,
    queueName?: string,
    jobId?: string
  ): PermissionContext {
    return {
      userId,
      queueName,
      jobId,
      action,
      resource
    }
  }

  /**
   * Check if user has elevated privileges
   */
  hasElevatedPrivileges(user: User): boolean {
    return user.role === USER_ROLES.ADMIN || user.role === USER_ROLES.SUPERADMIN
  }

  /**
   * Check if user is superadmin
   */
  isSuperAdmin(user: User): boolean {
    return user.role === USER_ROLES.SUPERADMIN
  }

  /**
   * Validate rate limiting permissions
   */
  validateRateLimitOperation(user: User, requestCount: number, windowMs: number): void {
    // Different rate limits based on user role
    let maxRequests: number

    switch (user.role) {
      case USER_ROLES.SUPERADMIN:
        maxRequests = 10000 // Very high limit
        break
      case USER_ROLES.ADMIN:
        maxRequests = 1000
        break
      case USER_ROLES.OPERATOR:
        maxRequests = 500
        break
      case USER_ROLES.VIEWER:
        maxRequests = 100
        break
      default:
        maxRequests = 50
    }

    if (requestCount > maxRequests) {
      throw new InsufficientPermissionsError(
        `rate limit exceeded (${requestCount}/${maxRequests})`,
        'api',
        user.userId
      )
    }
  }
}

// Export singleton instance
let permissionManagerInstance: PermissionManagerService | null = null

export function getPermissionManager(): PermissionManagerService {
  if (!permissionManagerInstance) {
    permissionManagerInstance = new PermissionManagerService()
  }
  return permissionManagerInstance
}

export default PermissionManagerService