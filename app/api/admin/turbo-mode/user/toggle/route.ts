import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { getPrismaInstance } from '@/lib/connections'

const prisma = getPrismaInstance()

/**
 * API para controlar acesso individual ao Modo Turbo
 * 
 * CONCEITO: Modo Turbo é funcionalidade core sempre disponível.
 * Esta API controla apenas QUEM tem acesso, não disponibilidade do sistema.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Usuário não autenticado.' },
        { status: 401 }
      )
    }

    // Verificar se é SUPERADMIN
    const currentUser = await prisma.user.findUnique({
      where: { id: session.user.id }
    })

    if (currentUser?.role !== 'SUPERADMIN') {
      return NextResponse.json(
        { error: 'Acesso negado. Apenas SUPERADMIN pode gerenciar acesso ao Modo Turbo.' },
        { status: 403 }
      )
    }

    const { userId, enabled } = await request.json()

    if (!userId || typeof enabled !== 'boolean') {
      return NextResponse.json(
        { error: 'Dados inválidos.' },
        { status: 400 }
      )
    }

    // Verificar se o usuário existe
    const targetUser = await prisma.user.findUnique({
      where: { id: userId }
    })

    if (!targetUser) {
      return NextResponse.json(
        { error: 'Usuário não encontrado.' },
        { status: 404 }
      )
    }

    if (enabled) {
      // Ativar o Modo Turbo diretamente no usuário
      await prisma.user.update({
        where: { id: userId },
        data: { turboModeEnabled: true }
      })
    } else {
      // Desativar o Modo Turbo diretamente no usuário
      await prisma.user.update({
        where: { id: userId },
        data: { turboModeEnabled: false }
      })
    }

    return NextResponse.json({ 
      success: true,
      message: enabled 
        ? 'Acesso ao Modo Turbo concedido ao usuário' 
        : 'Acesso ao Modo Turbo removido do usuário',
      systemNote: 'Modo Turbo é funcionalidade core sempre disponível no sistema'
    })

  } catch (error) {
    console.error('Erro ao alterar acesso ao Modo Turbo:', error)
    return NextResponse.json(
      { error: 'Erro interno do servidor.' },
      { status: 500 }
    )
  }
}