/**
 * TURBO Mode User Status API
 * Gets status for users with TURBO mode access
 * Based on CLAUDE.md philosophy: always available, only access control
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { TurboModeAccessService } from '@/lib/turbo-mode/user-access-service'
import { getPrismaInstance } from '@/lib/connections'
import log from '@/lib/utils/logger'

export async function GET() {
  try {
    // Authenticate user
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Usuário não autenticado.' },
        { status: 401 }
      )
    }

    // Check if user is admin
    if (session.user.role !== 'ADMIN' && session.user.role !== 'SUPERADMIN') {
      return NextResponse.json(
        { error: 'Acesso negado. Apenas administradores.' },
        { status: 403 }
      )
    }

    const prisma = getPrismaInstance()

    // Buscar todos os usuários
    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    })

    // Verificar acesso ao Turbo Mode para cada usuário
    const usersWithTurboStatus = await Promise.all(
      users.map(async (user) => {
        const hasTurboAccess = await TurboModeAccessService.hasAccess(user.id)
        
        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          turboModeEnabled: hasTurboAccess,
          config: hasTurboAccess ? TurboModeAccessService.getConfig() : undefined
        }
      })
    )

    log.info('TURBO mode user statuses retrieved for all users', {
      totalUsers: users.length,
      usersWithAccess: usersWithTurboStatus.filter(u => u.turboModeEnabled).length
    })

    return NextResponse.json({
      users: usersWithTurboStatus,
      systemAvailable: TurboModeAccessService.isSystemAvailable()
    })

  } catch (error) {
    log.error('Error getting TURBO mode user statuses', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    })

    return NextResponse.json(
      { error: 'Erro interno do servidor.' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    // Authenticate user
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Usuário não autenticado.' },
        { status: 401 }
      )
    }

    // Parse request body
    const { userIds } = await request.json()

    // Validate input
    if (!userIds || !Array.isArray(userIds)) {
      return NextResponse.json(
        { error: 'userIds deve ser um array.' },
        { status: 400 }
      )
    }

    log.debug('Getting TURBO mode status for users', {
      userCount: userIds.length,
      requestedBy: session.user.id
    })

    // Check access for each user
    const statusPromises = userIds.map(async (userId: string) => {
      const hasAccess = await TurboModeAccessService.hasAccess(userId)
      return {
        userId,
        hasAccess,
        config: hasAccess ? TurboModeAccessService.getConfig() : undefined
      }
    })

    const userStatuses = await Promise.all(statusPromises)

    log.info('TURBO mode user statuses retrieved', {
      totalUsers: userIds.length,
      usersWithAccess: userStatuses.filter(u => u.hasAccess).length
    })

    return NextResponse.json({
      statuses: userStatuses,
      systemAvailable: TurboModeAccessService.isSystemAvailable()
    })

  } catch (error) {
    log.error('Error getting TURBO mode user statuses', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    })

    return NextResponse.json(
      { error: 'Erro interno do servidor.' },
      { status: 500 }
    )
  }
}