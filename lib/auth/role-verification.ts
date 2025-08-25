/**
 * Role Verification Utilities
 * Centralized role verification for consistent access control
 * Based on requirements 1.6, 5.3, 5.5
 */

import type { Session } from 'next-auth'
import { UserRole } from '@prisma/client'

export interface RoleVerificationResult {
  hasAccess: boolean
  role?: UserRole
  userId?: string
  reason?: string
}

/**
 * Verify if user has SUPERADMIN role
 */
export function verifySuperAdminRole(session: Session | null): RoleVerificationResult {
  if (!session?.user?.id) {
    return {
      hasAccess: false,
      reason: 'Usuário não autenticado'
    }
  }

  if (session.user.role !== UserRole.SUPERADMIN) {
    return {
      hasAccess: false,
      role: session.user.role,
      userId: session.user.id,
      reason: 'Acesso restrito a SUPERADMIN'
    }
  }

  return {
    hasAccess: true,
    role: session.user.role,
    userId: session.user.id
  }
}

/**
 * Verify if user has ADMIN or SUPERADMIN role
 */
export function verifyAdminRole(session: Session | null): RoleVerificationResult {
  if (!session?.user?.id) {
    return {
      hasAccess: false,
      reason: 'Usuário não autenticado'
    }
  }

  const isAdmin = session.user.role === UserRole.ADMIN || session.user.role === UserRole.SUPERADMIN
  
  if (!isAdmin) {
    return {
      hasAccess: false,
      role: session.user.role,
      userId: session.user.id,
      reason: 'Acesso restrito a administradores'
    }
  }

  return {
    hasAccess: true,
    role: session.user.role,
    userId: session.user.id
  }
}

/**
 * Verify if user can access TURBO mode features
 * TURBO mode is available to all authenticated users, but eligibility is checked separately
 */
export function verifyTurboModeAccess(session: Session | null): RoleVerificationResult {
  if (!session?.user?.id) {
    return {
      hasAccess: false,
      reason: 'Usuário não autenticado'
    }
  }

  return {
    hasAccess: true,
    role: session.user.role,
    userId: session.user.id
  }
}

/**
 * Verify if user can manage feature flags
 * Only SUPERADMIN users can manage feature flags
 */
export function verifyFeatureFlagManagementAccess(session: Session | null): RoleVerificationResult {
  return verifySuperAdminRole(session)
}

/**
 * Check if user has specific role
 */
export function hasRole(session: Session | null, role: UserRole): boolean {
  return session?.user?.role === role
}

/**
 * Check if user has any of the specified roles
 */
export function hasAnyRole(session: Session | null, roles: UserRole[]): boolean {
  if (!session?.user?.role) return false
  return roles.includes(session.user.role)
}

/**
 * Get user role display name in Portuguese
 */
export function getRoleDisplayName(role: UserRole): string {
  switch (role) {
    case UserRole.SUPERADMIN:
      return 'Super Administrador'
    case UserRole.ADMIN:
      return 'Administrador'
    case UserRole.DEFAULT:
      return 'Usuário'
    default:
      return 'Desconhecido'
  }
}