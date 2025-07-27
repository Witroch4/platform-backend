/**
 * Queue Management Types - User Related
 * 
 * TypeScript interfaces for user-related data structures
 */

import { QueueUserRole } from '@prisma/client'

// User
export interface User {
  id: string
  userId: string
  email: string
  name: string
  role: QueueUserRole
  permissions: string[]
  queueAccess: Record<string, string[]>
  createdAt: Date
  updatedAt: Date
  lastLogin?: Date
}

// User Session
export interface UserSession {
  userId: string
  email: string
  name: string
  role: QueueUserRole
  permissions: string[]
  queueAccess: Record<string, string[]>
  lastActivity: Date
  expiresAt: Date
}

// User Permissions
export interface UserPermissions {
  userId: string
  permissions: string[]
  queueAccess: Record<string, string[]>
  role: QueueUserRole
  lastUpdated: Date
}

// User Profile
export interface UserProfile {
  userId: string
  email: string
  name: string
  role: QueueUserRole
  avatar?: string
  timezone?: string
  language?: string
  preferences: UserPreferences
}

// User Preferences
export interface UserPreferences {
  theme: 'light' | 'dark' | 'auto'
  notifications: {
    email: boolean
    browser: boolean
    slack: boolean
  }
  dashboard: {
    layout: string
    widgets: string[]
    refreshInterval: number
  }
  alerts: {
    sound: boolean
    desktop: boolean
    severity: string[]
  }
}

// User Activity
export interface UserActivity {
  id: string
  userId: string
  action: string
  resource: string
  resourceId?: string
  details?: Record<string, any>
  timestamp: Date
  ipAddress?: string
  userAgent?: string
}

// User Login Attempt
export interface UserLoginAttempt {
  userId: string
  success: boolean
  timestamp: Date
  ipAddress?: string
  userAgent?: string
  failureReason?: string
}

// User Rate Limit
export interface UserRateLimit {
  userId: string
  endpoint: string
  count: number
  windowStart: Date
  windowEnd: Date
  limit: number
}

// User Notification
export interface UserNotification {
  id: string
  userId: string
  type: 'alert' | 'system' | 'queue' | 'job'
  title: string
  message: string
  data?: Record<string, any>
  read: boolean
  createdAt: Date
  readAt?: Date
}

// User API Key
export interface UserApiKey {
  id: string
  userId: string
  name: string
  key: string
  permissions: string[]
  queueAccess: Record<string, string[]>
  lastUsed?: Date
  expiresAt?: Date
  createdAt: Date
  enabled: boolean
}

// User Invitation
export interface UserInvitation {
  id: string
  email: string
  role: QueueUserRole
  permissions: string[]
  queueAccess: Record<string, string[]>
  invitedBy: string
  token: string
  expiresAt: Date
  acceptedAt?: Date
  createdAt: Date
}

// User Statistics
export interface UserStatistics {
  userId: string
  totalLogins: number
  lastLogin?: Date
  totalActions: number
  queuesAccessed: string[]
  mostUsedFeatures: Array<{
    feature: string
    count: number
  }>
  averageSessionDuration: number
  timeSpentByDay: Record<string, number>
}

// User List Response
export interface UserListResponse {
  users: User[]
  total: number
  pagination: {
    page: number
    limit: number
    totalPages: number
    hasNext: boolean
    hasPrev: boolean
  }
  stats: {
    totalUsers: number
    activeUsers: number
    byRole: Record<QueueUserRole, number>
  }
}

// User Creation Request
export interface UserCreateRequest {
  email: string
  name: string
  role: QueueUserRole
  permissions?: string[]
  queueAccess?: Record<string, string[]>
  sendInvitation?: boolean
}

// User Update Request
export interface UserUpdateRequest {
  name?: string
  role?: QueueUserRole
  permissions?: string[]
  queueAccess?: Record<string, string[]>
  enabled?: boolean
}

// User Role Definition
export interface UserRoleDefinition {
  role: QueueUserRole
  name: string
  description: string
  permissions: string[]
  inheritsFrom?: QueueUserRole[]
  restrictions?: {
    maxQueues?: number
    maxApiKeys?: number
    features?: string[]
  }
}

// Permission Check Result
export interface PermissionCheckResult {
  allowed: boolean
  reason?: string
  requiredPermissions?: string[]
  userPermissions: string[]
  queueSpecific?: boolean
}

// User Audit Log
export interface UserAuditLog {
  id: string
  userId: string
  performedBy: string
  action: string
  changes: Record<string, { from: any; to: any }>
  timestamp: Date
  ipAddress?: string
  userAgent?: string
}

// User Dashboard Config
export interface UserDashboardConfig {
  userId: string
  layout: {
    columns: number
    widgets: Array<{
      id: string
      type: string
      position: { x: number; y: number; w: number; h: number }
      config: Record<string, any>
    }>
  }
  filters: {
    queues: string[]
    timeRange: string
    refreshInterval: number
  }
  customizations: Record<string, any>
}

// User Team
export interface UserTeam {
  id: string
  name: string
  description?: string
  members: Array<{
    userId: string
    role: 'member' | 'admin' | 'owner'
    joinedAt: Date
  }>
  permissions: string[]
  queueAccess: Record<string, string[]>
  createdAt: Date
  updatedAt: Date
}

// User Filters
export interface UserFilters {
  roles?: QueueUserRole[]
  permissions?: string[]
  queues?: string[]
  active?: boolean
  search?: string
  lastLoginAfter?: Date
  lastLoginBefore?: Date
}

// Sort Options for Users
export interface UserSortOptions {
  field: 'name' | 'email' | 'role' | 'createdAt' | 'lastLogin'
  direction: 'asc' | 'desc'
}