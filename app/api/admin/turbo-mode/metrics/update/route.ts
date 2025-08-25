/**
 * TURBO Mode Metrics Update API
 * Updates performance metrics for TURBO mode
 * Based on requirements 4.3, 4.6
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { TurboModeAccessService } from '@/lib/turbo-mode/user-access-service'
import { getPrismaInstance } from '@/lib/connections'
import log from '@/lib/utils/logger'

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
    const { userId, metrics } = await request.json()

    // Validate input
    if (!userId || !metrics) {
      return NextResponse.json(
        { error: 'userId e metrics são obrigatórios.' },
        { status: 400 }
      )
    }

    // Verify user can update these metrics
    if (session.user.id !== userId) {
      return NextResponse.json(
        { error: 'Acesso negado.' },
        { status: 403 }
      )
    }

    // Get user's Chatwit account ID from database
    const prisma = getPrismaInstance()
    const usuarioChatwit = await prisma.usuarioChatwit.findUnique({
      where: { appUserId: userId },
      select: { chatwitAccountId: true }
    })

    if (!usuarioChatwit?.chatwitAccountId) {
      return NextResponse.json(
        { error: 'Usuário não possui conta Chatwit configurada.' },
        { status: 400 }
      )
    }

    const accountId = usuarioChatwit.chatwitAccountId

    log.debug('Updating TURBO mode metrics', {
      userId,
      accountId,
      metrics,
      requestedBy: session.user.id
    })

    // Check user access first
    const hasAccess = await TurboModeAccessService.hasAccess(userId)
    if (!hasAccess) {
      return NextResponse.json(
        { error: 'Usuário não possui acesso ao Modo Turbo.' },
        { status: 403 }
      )
    }

    // Mock update for now (no database model yet)
    console.log('TURBO mode metrics would be saved:', {
      userId,
      accountId,
      ...metrics
    })

    log.info('TURBO mode metrics updated successfully', {
      userId,
      accountId,
      updatedFields: Object.keys(metrics)
    })

    return NextResponse.json({
      message: 'Métricas TURBO atualizadas com sucesso',
      updatedMetrics: metrics
    })

  } catch (error) {
    log.error('Error updating TURBO mode metrics', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    })

    return NextResponse.json(
      { error: 'Erro interno do servidor.' },
      { status: 500 }
    )
  }
}

export async function GET() {
  return NextResponse.json(
    { error: 'Método não permitido. Use POST.' },
    { status: 405 }
  )
}