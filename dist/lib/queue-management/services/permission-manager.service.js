"use strict";
/**
 * Permission Manager Service
 *
 * Handles authorization and permission validation for queue operations
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PermissionManagerService = void 0;
exports.getPermissionManager = getPermissionManager;
const constants_1 = require("../constants");
const errors_1 = require("../errors");
const logger_1 = require("../utils/logger");
/**
 * Permission Manager Service Implementation
 */
class PermissionManagerService {
    logger;
    constructor() {
        this.logger = new logger_1.Logger('PermissionManagerService');
    }
    /**
     * Check if user has a specific permission
     */
    hasPermission(user, permission, queueName) {
        try {
            // Check global permissions first
            if (user.permissions.includes(permission)) {
                return true;
            }
            // Check role-based permissions
            const rolePermissions = constants_1.ROLE_PERMISSIONS[user.role] || [];
            if (rolePermissions.includes(permission)) {
                return true;
            }
            // Check queue-specific permissions
            if (queueName && user.queueAccess[queueName]) {
                return user.queueAccess[queueName].includes(permission);
            }
            return false;
        }
        catch (error) {
            this.logger.error('Error checking permission:', error, {
                userId: user.userId,
                permission,
                queueName
            });
            return false;
        }
    }
    /**
     * Check permission and throw error if not authorized
     */
    checkPermission(user, permission, queueName) {
        if (!this.hasPermission(user, permission, queueName)) {
            const resource = queueName ? `queue:${queueName}` : 'system';
            throw new errors_1.InsufficientPermissionsError(permission, resource, user.userId);
        }
    }
    /**
     * Validate job operation permissions
     */
    validateJobOperation(user, action, queueName, jobId) {
        let requiredPermission;
        switch (action) {
            case 'view':
                requiredPermission = constants_1.PERMISSIONS.JOB_VIEW;
                break;
            case 'retry':
                requiredPermission = constants_1.PERMISSIONS.JOB_RETRY;
                break;
            case 'remove':
            case 'delete':
                requiredPermission = constants_1.PERMISSIONS.JOB_DELETE;
                break;
            case 'promote':
                requiredPermission = constants_1.PERMISSIONS.JOB_PROMOTE;
                break;
            case 'delay':
                requiredPermission = constants_1.PERMISSIONS.JOB_DELAY;
                break;
            default:
                throw new errors_1.InsufficientPermissionsError(action, `job:${jobId || 'unknown'}`, user.userId);
        }
        this.checkPermission(user, requiredPermission, queueName);
        // Log the permission check
        this.logger.audit(`job:${action}`, user.userId, `job:${jobId || 'unknown'}`, { queueName, action });
    }
    /**
     * Validate queue operation permissions
     */
    validateQueueOperation(user, action, queueName) {
        let requiredPermission;
        switch (action) {
            case 'view':
                requiredPermission = constants_1.PERMISSIONS.QUEUE_VIEW;
                break;
            case 'manage':
            case 'update':
                requiredPermission = constants_1.PERMISSIONS.QUEUE_MANAGE;
                break;
            case 'create':
                requiredPermission = constants_1.PERMISSIONS.QUEUE_CREATE;
                break;
            case 'delete':
                requiredPermission = constants_1.PERMISSIONS.QUEUE_DELETE;
                break;
            case 'pause':
                requiredPermission = constants_1.PERMISSIONS.QUEUE_PAUSE;
                break;
            case 'resume':
                requiredPermission = constants_1.PERMISSIONS.QUEUE_RESUME;
                break;
            default:
                throw new errors_1.InsufficientPermissionsError(action, `queue:${queueName}`, user.userId);
        }
        this.checkPermission(user, requiredPermission, queueName);
        // Log the permission check
        this.logger.audit(`queue:${action}`, user.userId, `queue:${queueName}`, { queueName, action });
    }
    /**
     * Validate batch operation permissions
     */
    validateBatchOperation(user, action, queueName, jobCount) {
        // Check if user has batch operation permission
        this.checkPermission(user, constants_1.PERMISSIONS.JOB_BATCH_OPERATIONS, queueName);
        // Check specific action permissions
        switch (action) {
            case 'retry_all_failed':
                this.checkPermission(user, constants_1.PERMISSIONS.JOB_RETRY, queueName);
                break;
            case 'clean_completed':
                this.checkPermission(user, constants_1.PERMISSIONS.JOB_DELETE, queueName);
                break;
            case 'pause_queue':
                this.checkPermission(user, constants_1.PERMISSIONS.QUEUE_PAUSE, queueName);
                break;
            case 'resume_queue':
                this.checkPermission(user, constants_1.PERMISSIONS.QUEUE_RESUME, queueName);
                break;
            default:
                throw new errors_1.InsufficientPermissionsError(action, `queue:${queueName}`, user.userId);
        }
        // Additional validation for large batch operations
        if (jobCount > 1000 && user.role !== constants_1.USER_ROLES.ADMIN && user.role !== constants_1.USER_ROLES.SUPERADMIN) {
            throw new errors_1.InsufficientPermissionsError(`batch operation with ${jobCount} jobs`, `queue:${queueName}`, user.userId);
        }
        // Log the batch operation
        this.logger.audit(`batch:${action}`, user.userId, `queue:${queueName}`, { queueName, action, jobCount });
    }
    /**
     * Get all permissions for a user
     */
    getUserPermissions(user, queueName) {
        const permissions = new Set();
        // Add explicit permissions
        user.permissions.forEach(permission => permissions.add(permission));
        // Add role-based permissions
        const rolePermissions = constants_1.ROLE_PERMISSIONS[user.role] || [];
        rolePermissions.forEach(permission => permissions.add(permission));
        // Add queue-specific permissions
        if (queueName && user.queueAccess[queueName]) {
            user.queueAccess[queueName].forEach(permission => permissions.add(permission));
        }
        return Array.from(permissions);
    }
    /**
     * Check if user can access a specific queue
     */
    canAccessQueue(user, queueName) {
        // Superadmin and admin can access all queues
        if (user.role === constants_1.USER_ROLES.SUPERADMIN || user.role === constants_1.USER_ROLES.ADMIN) {
            return true;
        }
        // Check if user has any queue-specific permissions
        if (user.queueAccess[queueName] && user.queueAccess[queueName].length > 0) {
            return true;
        }
        // Check if user has global queue view permission
        return this.hasPermission(user, constants_1.PERMISSIONS.QUEUE_VIEW);
    }
    /**
     * Get accessible queues for a user
     */
    getAccessibleQueues(user, allQueues) {
        // Superadmin and admin can access all queues
        if (user.role === constants_1.USER_ROLES.SUPERADMIN || user.role === constants_1.USER_ROLES.ADMIN) {
            return allQueues;
        }
        // Filter queues based on access permissions
        return allQueues.filter(queueName => this.canAccessQueue(user, queueName));
    }
    /**
     * Validate system-level permissions
     */
    validateSystemOperation(user, action) {
        let requiredPermission;
        switch (action) {
            case 'view_health':
                requiredPermission = constants_1.PERMISSIONS.SYSTEM_HEALTH;
                break;
            case 'config':
                requiredPermission = constants_1.PERMISSIONS.SYSTEM_CONFIG;
                break;
            case 'maintenance':
                requiredPermission = constants_1.PERMISSIONS.SYSTEM_MAINTENANCE;
                break;
            case 'view_metrics':
                requiredPermission = constants_1.PERMISSIONS.METRICS_VIEW;
                break;
            case 'export_metrics':
                requiredPermission = constants_1.PERMISSIONS.METRICS_EXPORT;
                break;
            case 'view_analytics':
                requiredPermission = constants_1.PERMISSIONS.ANALYTICS_VIEW;
                break;
            case 'advanced_analytics':
                requiredPermission = constants_1.PERMISSIONS.ANALYTICS_ADVANCED;
                break;
            default:
                throw new errors_1.InsufficientPermissionsError(action, 'system', user.userId);
        }
        this.checkPermission(user, requiredPermission);
        // Log the system operation
        this.logger.audit(`system:${action}`, user.userId, 'system', { action });
    }
    /**
     * Validate alert-related permissions
     */
    validateAlertOperation(user, action, alertId) {
        let requiredPermission;
        switch (action) {
            case 'view':
                requiredPermission = constants_1.PERMISSIONS.ALERT_VIEW;
                break;
            case 'manage':
            case 'create':
            case 'update':
            case 'delete':
                requiredPermission = constants_1.PERMISSIONS.ALERT_MANAGE;
                break;
            case 'acknowledge':
                requiredPermission = constants_1.PERMISSIONS.ALERT_ACKNOWLEDGE;
                break;
            case 'resolve':
                requiredPermission = constants_1.PERMISSIONS.ALERT_RESOLVE;
                break;
            default:
                throw new errors_1.InsufficientPermissionsError(action, `alert:${alertId || 'unknown'}`, user.userId);
        }
        this.checkPermission(user, requiredPermission);
        // Log the alert operation
        this.logger.audit(`alert:${action}`, user.userId, `alert:${alertId || 'unknown'}`, { action, alertId });
    }
    /**
     * Validate flow-related permissions
     */
    validateFlowOperation(user, action, flowId) {
        let requiredPermission;
        switch (action) {
            case 'view':
                requiredPermission = constants_1.PERMISSIONS.FLOW_VIEW;
                break;
            case 'manage':
            case 'create':
            case 'update':
                requiredPermission = constants_1.PERMISSIONS.FLOW_MANAGE;
                break;
            case 'cancel':
                requiredPermission = constants_1.PERMISSIONS.FLOW_CANCEL;
                break;
            case 'retry':
                requiredPermission = constants_1.PERMISSIONS.FLOW_RETRY;
                break;
            default:
                throw new errors_1.InsufficientPermissionsError(action, `flow:${flowId}`, user.userId);
        }
        this.checkPermission(user, requiredPermission);
        // Log the flow operation
        this.logger.audit(`flow:${action}`, user.userId, `flow:${flowId}`, { action, flowId });
    }
    /**
     * Create permission context for logging
     */
    createPermissionContext(userId, action, resource, queueName, jobId) {
        return {
            userId,
            queueName,
            jobId,
            action,
            resource
        };
    }
    /**
     * Check if user has elevated privileges
     */
    hasElevatedPrivileges(user) {
        return user.role === constants_1.USER_ROLES.ADMIN || user.role === constants_1.USER_ROLES.SUPERADMIN;
    }
    /**
     * Check if user is superadmin
     */
    isSuperAdmin(user) {
        return user.role === constants_1.USER_ROLES.SUPERADMIN;
    }
    /**
     * Validate rate limiting permissions
     */
    validateRateLimitOperation(user, requestCount, windowMs) {
        // Different rate limits based on user role
        let maxRequests;
        switch (user.role) {
            case constants_1.USER_ROLES.SUPERADMIN:
                maxRequests = 10000; // Very high limit
                break;
            case constants_1.USER_ROLES.ADMIN:
                maxRequests = 1000;
                break;
            case constants_1.USER_ROLES.OPERATOR:
                maxRequests = 500;
                break;
            case constants_1.USER_ROLES.VIEWER:
                maxRequests = 100;
                break;
            default:
                maxRequests = 50;
        }
        if (requestCount > maxRequests) {
            throw new errors_1.InsufficientPermissionsError(`rate limit exceeded (${requestCount}/${maxRequests})`, 'api', user.userId);
        }
    }
}
exports.PermissionManagerService = PermissionManagerService;
// Export singleton instance
let permissionManagerInstance = null;
function getPermissionManager() {
    if (!permissionManagerInstance) {
        permissionManagerInstance = new PermissionManagerService();
    }
    return permissionManagerInstance;
}
exports.default = PermissionManagerService;
