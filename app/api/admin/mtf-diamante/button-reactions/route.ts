import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/auth'

// GET - Buscar reações configuradas para uma mensagem
export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const messageId = searchParams.get('messageId')
    const buttonId = searchParams.get('buttonId')

    if (buttonId) {
      // Buscar reação específica de um botão
      const reaction = await prisma.buttonReactionMapping.findUnique({
        where: { buttonId }
      })
      return NextResponse.json({ reaction })
    }

    if (messageId) {
      // Buscar todas as reações de uma mensagem
      const reactions = await prisma.buttonReactionMapping.findMany({
        where: { messageId }
      })
      return NextResponse.json({ reactions })
    }

    // Buscar todas as reações
    const reactions = await prisma.buttonReactionMapping.findMany({
      orderBy: { createdAt: 'desc' }
    })

    return NextResponse.json({ reactions })
  } catch (error) {
    console.error('Erro ao buscar reações:', error)
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    )
  }
}

// POST - Criar/atualizar reações de botões
export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const body = await request.json()
    const { messageId, reactions } = body

    if (!messageId || !Array.isArray(reactions)) {
      return NextResponse.json(
        { error: 'messageId e reactions são obrigatórios' },
        { status: 400 }
      )
    }

    // Validar estrutura das reações
    for (const reaction of reactions) {
      if (!reaction.buttonId || (!reaction.emoji && !reaction.textReaction)) {
        return NextResponse.json(
          { error: 'Cada reação deve ter buttonId e emoji ou textReaction' },
          { status: 400 }
        )
      }
    }

    // Remover reações existentes para esta mensagem
    await prisma.buttonReactionMapping.deleteMany({
      where: { messageId }
    })

    // Criar novas reações
    const createdReactions = await Promise.all(
      reactions.map(async (reaction: any) => {
        return await prisma.buttonReactionMapping.create({
          data: {
            buttonId: reaction.buttonId,
            messageId,
            emoji: reaction.emoji || null,
            textReaction: reaction.textReaction || null,
            createdBy: session.user.id
          }
        })
      })
    )

    return NextResponse.json({ 
      success: true, 
      reactions: createdReactions,
      message: 'Reações configuradas com sucesso'
    })
  } catch (error) {
    console.error('Erro ao salvar reações:', error)
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    )
  }
}

// DELETE - Remover reação específica
export async function DELETE(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const buttonId = searchParams.get('buttonId')
    const messageId = searchParams.get('messageId')

    if (buttonId) {
      // Remover reação específica
      await prisma.buttonReactionMapping.delete({
        where: { buttonId }
      })
      return NextResponse.json({ success: true, message: 'Reação removida' })
    }

    if (messageId) {
      // Remover todas as reações de uma mensagem
      await prisma.buttonReactionMapping.deleteMany({
        where: { messageId }
      })
      return NextResponse.json({ success: true, message: 'Todas as reações removidas' })
    }

    return NextResponse.json(
      { error: 'buttonId ou messageId é obrigatório' },
      { status: 400 }
    )
  } catch (error) {
    console.error('Erro ao remover reação:', error)
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    )
  }
}