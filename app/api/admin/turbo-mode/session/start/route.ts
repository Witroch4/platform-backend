/**
 * TURBO Mode Session Start API
 * Starts a new TURBO mode processing session
 * Based on requirements 2.4, 3.1, 3.2
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
    const { userId, leadIds } = await request.json()

    // Validate input
    if (!userId || !leadIds || !Array.isArray(leadIds)) {
      return NextResponse.json(
        { error: 'userId e leadIds são obrigatórios.' },
        { status: 400 }
      )
    }

    if (leadIds.length === 0) {
      return NextResponse.json(
        { error: 'Pelo menos um lead deve ser fornecido.' },
        { status: 400 }
      )
    }

    // Verify user can start session for this account
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

    log.info('Starting TURBO mode session', {
      userId,
      accountId,
      leadCount: leadIds.length,
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

    const config = TurboModeAccessService.getConfig()

    // Validate lead count against configuration
    if (leadIds.length > config.maxParallelLeads) {
      return NextResponse.json(
        { 
          error: `Número de leads excede o limite TURBO (${leadIds.length} > ${config.maxParallelLeads})` 
        },
        { status: 400 }
      )
    }

    // Create TURBO session (mock for now)
    const sessionId = `turbo-${userId}-${Date.now()}`
    console.log('TURBO session would be created:', {
      sessionId,
      userId,
      accountId,
      leadIds
    })

    log.info('TURBO mode session started successfully', {
      sessionId,
      userId,
      accountId,
      leadCount: leadIds.length
    })

    return NextResponse.json({
      sessionId,
      config,
      message: 'Sessão TURBO iniciada com sucesso'
    })

  } catch (error) {
    log.error('Error starting TURBO mode session', {
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