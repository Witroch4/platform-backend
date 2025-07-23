import { type NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/auth'
import { z } from 'zod'

// Validation schemas
const ReactionSchema = z.object({
  type: z.enum(['emoji', 'text']),
  value: z.string().min(1),
})

const ButtonReactionSchema = z.object({
  buttonId: z.string().min(1),
  messageId: z.string().min(1).optional(),
  reaction: ReactionSchema.optional(),
  description: z.string().optional(),
  isActive: z.boolean().default(true),
})

const UpdateButtonReactionSchema = ButtonReactionSchema.partial().extend({
  id: z.string().min(1),
})

// Helper function to format reaction response
function formatReaction(reaction: any) {
  return {
    id: reaction.id,
    buttonId: reaction.buttonId,
    messageId: reaction.messageId,
    type: reaction.description ? 'text' : 'emoji',
    emoji: reaction.emoji,
    textReaction: reaction.description,
    description: reaction.description,
    isActive: reaction.isActive,
    createdAt: reaction.createdAt,
    updatedAt: reaction.updatedAt,
    createdBy: reaction.createdBy,
  }
}

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
    const reactionId = searchParams.get('id')
    const includeInactive = searchParams.get('includeInactive') === 'true'

    // Get specific reaction by ID
    if (reactionId) {
      const reaction = await prisma.buttonReactionMapping.findFirst({
        where: { 
          id: reactionId,
          message: {
            caixa: {
              usuarioChatwit: {
                appUserId: session.user.id,
              },
            },
          },
        },
        include: {
          message: {
            select: {
              id: true,
              name: true,
              type: true,
            },
          },
        },
      })

      if (!reaction) {
        return NextResponse.json(
          { error: 'Reação não encontrada ou acesso negado' },
          { status: 404 }
        )
      }

      return NextResponse.json({ 
        success: true,
        reaction: formatReaction(reaction) 
      })
    }

    // Get specific button reaction
    if (buttonId) {
      const reaction = await prisma.buttonReactionMapping.findFirst({
        where: { 
          buttonId,
          message: {
            caixa: {
              usuarioChatwit: {
                appUserId: session.user.id,
              },
            },
          },
          ...(includeInactive ? {} : { isActive: true }),
        },
        include: {
          message: {
            select: {
              id: true,
              name: true,
              type: true,
            },
          },
        },
      })

      return NextResponse.json({ 
        success: true,
        reaction: reaction ? formatReaction(reaction) : null 
      })
    }

    // Get all reactions for a message
    if (messageId) {
      const reactions = await prisma.buttonReactionMapping.findMany({
        where: { 
          messageId,
          message: {
            caixa: {
              usuarioChatwit: {
                appUserId: session.user.id,
              },
            },
          },
          ...(includeInactive ? {} : { isActive: true }),
        },
        include: {
          message: {
            select: {
              id: true,
              name: true,
              type: true,
            },
          },
        },
        orderBy: { createdAt: 'asc' },
      })

      return NextResponse.json({ 
        success: true,
        reactions: reactions.map(formatReaction) 
      })
    }

    // Get all reactions for user (with pagination)
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = (page - 1) * limit

    const [reactions, total] = await Promise.all([
      prisma.buttonReactionMapping.findMany({
        where: {
          message: {
            caixa: {
              usuarioChatwit: {
                appUserId: session.user.id,
              },
            },
          },
          ...(includeInactive ? {} : { isActive: true }),
        },
        include: {
          message: {
            select: {
              id: true,
              name: true,
              type: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit,
      }),
      prisma.buttonReactionMapping.count({
        where: {
          message: {
            caixa: {
              usuarioChatwit: {
                appUserId: session.user.id,
              },
            },
          },
          ...(includeInactive ? {} : { isActive: true }),
        },
      }),
    ])

    return NextResponse.json({ 
      success: true,
      reactions: reactions.map(formatReaction),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error('Erro ao buscar reações:', error)
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    )
  }
}

// POST - Criar nova reação de botão
export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const body = await request.json()

    // Handle bulk creation (legacy support)
    if (body.messageId && Array.isArray(body.reactions)) {
      const { messageId, reactions } = body

      // Verify message exists and user has access
      const message = await prisma.interactiveMessage.findFirst({
        where: {
          id: messageId,
          caixa: {
            usuarioChatwit: {
              appUserId: session.user.id,
            },
          },
        },
      })

      if (!message) {
        return NextResponse.json(
          { error: 'Mensagem não encontrada ou acesso negado' },
          { status: 404 }
        )
      }

      // Validate reactions
      const validationResults = reactions.map((reaction: any) =>
        ButtonReactionSchema.safeParse({ ...reaction, messageId })
      )

      const errors = validationResults
        .filter((result) => !result.success)
        .map((result) => result.error.errors)
        .flat()

      if (errors.length > 0) {
        return NextResponse.json(
          { error: 'Dados de reação inválidos', details: errors },
          { status: 400 }
        )
      }

      // Execute transaction for bulk creation
      const result = await prisma.$transaction(async (tx) => {
        // Remove existing reactions for this message
        await tx.buttonReactionMapping.deleteMany({
          where: { messageId }
        })

        // Create new reactions
        const createdReactions = []
        for (const reactionData of reactions) {
          if (reactionData.reaction) {
            const created = await tx.buttonReactionMapping.create({
              data: {
                buttonId: reactionData.buttonId,
                messageId,
                emoji: reactionData.reaction.value,
                description: reactionData.reaction.type === 'text' ? reactionData.reaction.value : null,
                createdBy: session.user.id,
              },
            })
            createdReactions.push(created)
          }
        }
        return createdReactions
      })

      return NextResponse.json({
        success: true,
        reactions: result.map(formatReaction),
        message: 'Reações configuradas com sucesso',
      })
    }

    // Handle single reaction creation
    const validation = ButtonReactionSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Dados de reação inválidos', details: validation.error.errors },
        { status: 400 }
      )
    }

    const { buttonId, messageId, reaction, description, isActive } = validation.data

    // Verify message exists and user has access (if messageId provided)
    if (messageId) {
      const message = await prisma.interactiveMessage.findFirst({
        where: {
          id: messageId,
          caixa: {
            usuarioChatwit: {
              appUserId: session.user.id,
            },
          },
        },
      })

      if (!message) {
        return NextResponse.json(
          { error: 'Mensagem não encontrada ou acesso negado' },
          { status: 404 }
        )
      }
    }

    // Check if reaction already exists for this button
    const existingReaction = await prisma.buttonReactionMapping.findUnique({
      where: { buttonId },
    })

    if (existingReaction) {
      return NextResponse.json(
        { error: 'Já existe uma reação configurada para este botão' },
        { status: 409 }
      )
    }

    // Create the reaction
    const createdReaction = await prisma.buttonReactionMapping.create({
      data: {
        buttonId,
        messageId: messageId || null,
        emoji: reaction?.value || null,
        description: reaction?.type === 'text' ? reaction.value : description || null,
        isActive: isActive ?? true,
        createdBy: session.user.id,
      },
      include: {
        message: {
          select: {
            id: true,
            name: true,
            type: true,
          },
        },
      },
    })

    return NextResponse.json({
      success: true,
      reaction: formatReaction(createdReaction),
      message: 'Reação criada com sucesso',
    })
  } catch (error) {
    console.error('Erro ao criar reação:', error)

    // Handle specific database errors
    if (error instanceof Error) {
      if (error.message.includes('Unique constraint')) {
        return NextResponse.json(
          { error: 'Já existe uma reação para este botão' },
          { status: 409 }
        )
      }
      if (error.message.includes('Foreign key constraint')) {
        return NextResponse.json(
          { error: 'Referência inválida (mensagem ou usuário não encontrado)' },
          { status: 400 }
        )
      }
    }

    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    )
  }
}

// PUT - Atualizar reação existente
export async function PUT(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const body = await request.json()
    const validation = UpdateButtonReactionSchema.safeParse(body)
    
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Dados de atualização inválidos', details: validation.error.errors },
        { status: 400 }
      )
    }

    const { id, buttonId, messageId, reaction, description, isActive } = validation.data

    // Verify reaction exists and user has access
    const existingReaction = await prisma.buttonReactionMapping.findFirst({
      where: {
        id,
        message: {
          caixa: {
            usuarioChatwit: {
              appUserId: session.user.id,
            },
          },
        },
      },
    })

    if (!existingReaction) {
      return NextResponse.json(
        { error: 'Reação não encontrada ou acesso negado' },
        { status: 404 }
      )
    }

    // If updating buttonId, check for conflicts
    if (buttonId && buttonId !== existingReaction.buttonId) {
      const conflictingReaction = await prisma.buttonReactionMapping.findUnique({
        where: { buttonId },
      })

      if (conflictingReaction && conflictingReaction.id !== id) {
        return NextResponse.json(
          { error: 'Já existe uma reação configurada para este botão' },
          { status: 409 }
        )
      }
    }

    // If updating messageId, verify new message exists and user has access
    if (messageId && messageId !== existingReaction.messageId) {
      const message = await prisma.interactiveMessage.findFirst({
        where: {
          id: messageId,
          caixa: {
            usuarioChatwit: {
              appUserId: session.user.id,
            },
          },
        },
      })

      if (!message) {
        return NextResponse.json(
          { error: 'Nova mensagem não encontrada ou acesso negado' },
          { status: 404 }
        )
      }
    }

    // Update the reaction
    const updatedReaction = await prisma.buttonReactionMapping.update({
      where: { id },
      data: {
        ...(buttonId && { buttonId }),
        ...(messageId !== undefined && { messageId }),
        ...(reaction && {
          emoji: reaction.value,
          description: reaction.type === 'text' ? reaction.value : null,
        }),
        ...(description !== undefined && { description }),
        ...(isActive !== undefined && { isActive }),
      },
      include: {
        message: {
          select: {
            id: true,
            name: true,
            type: true,
          },
        },
      },
    })

    return NextResponse.json({
      success: true,
      reaction: formatReaction(updatedReaction),
      message: 'Reação atualizada com sucesso',
    })
  } catch (error) {
    console.error('Erro ao atualizar reação:', error)

    // Handle specific database errors
    if (error instanceof Error) {
      if (error.message.includes('Unique constraint')) {
        return NextResponse.json(
          { error: 'Já existe uma reação para este botão' },
          { status: 409 }
        )
      }
      if (error.message.includes('Foreign key constraint')) {
        return NextResponse.json(
          { error: 'Referência inválida (mensagem não encontrada)' },
          { status: 400 }
        )
      }
    }

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
    const reactionId = searchParams.get('id')
    const softDelete = searchParams.get('soft') === 'true'

    // Delete specific reaction by ID
    if (reactionId) {
      // Verify reaction exists and user has access
      const reaction = await prisma.buttonReactionMapping.findFirst({
        where: {
          id: reactionId,
          message: {
            caixa: {
              usuarioChatwit: {
                appUserId: session.user.id,
              },
            },
          },
        },
      })

      if (!reaction) {
        return NextResponse.json(
          { error: 'Reação não encontrada ou acesso negado' },
          { status: 404 }
        )
      }

      if (softDelete) {
        // Soft delete - mark as inactive
        await prisma.buttonReactionMapping.update({
          where: { id: reactionId },
          data: { isActive: false },
        })
        return NextResponse.json({ 
          success: true, 
          message: 'Reação desativada com sucesso' 
        })
      } else {
        // Hard delete
        await prisma.buttonReactionMapping.delete({
          where: { id: reactionId },
        })
        return NextResponse.json({ 
          success: true, 
          message: 'Reação removida permanentemente' 
        })
      }
    }

    // Delete specific button reaction
    if (buttonId) {
      // Verify reaction exists and user has access
      const reaction = await prisma.buttonReactionMapping.findFirst({
        where: {
          buttonId,
          message: {
            caixa: {
              usuarioChatwit: {
                appUserId: session.user.id,
              },
            },
          },
        },
      })

      if (!reaction) {
        return NextResponse.json(
          { error: 'Reação não encontrada ou acesso negado' },
          { status: 404 }
        )
      }

      if (softDelete) {
        await prisma.buttonReactionMapping.update({
          where: { buttonId },
          data: { isActive: false },
        })
        return NextResponse.json({ 
          success: true, 
          message: 'Reação do botão desativada' 
        })
      } else {
        await prisma.buttonReactionMapping.delete({
          where: { buttonId },
        })
        return NextResponse.json({ 
          success: true, 
          message: 'Reação do botão removida' 
        })
      }
    }

    // Delete all reactions for a message (with cascade delete logic)
    if (messageId) {
      // Verify message exists and user has access
      const message = await prisma.interactiveMessage.findFirst({
        where: {
          id: messageId,
          caixa: {
            usuarioChatwit: {
              appUserId: session.user.id,
            },
          },
        },
      })

      if (!message) {
        return NextResponse.json(
          { error: 'Mensagem não encontrada ou acesso negado' },
          { status: 404 }
        )
      }

      if (softDelete) {
        const result = await prisma.buttonReactionMapping.updateMany({
          where: { messageId },
          data: { isActive: false },
        })
        return NextResponse.json({ 
          success: true, 
          message: `${result.count} reações desativadas`,
          count: result.count,
        })
      } else {
        const result = await prisma.buttonReactionMapping.deleteMany({
          where: { messageId },
        })
        return NextResponse.json({ 
          success: true, 
          message: `${result.count} reações removidas`,
          count: result.count,
        })
      }
    }

    return NextResponse.json(
      { error: 'id, buttonId ou messageId é obrigatório' },
      { status: 400 }
    )
  } catch (error) {
    console.error('Erro ao remover reação:', error)

    // Handle specific database errors
    if (error instanceof Error) {
      if (error.message.includes('Record to delete does not exist')) {
        return NextResponse.json(
          { error: 'Reação não encontrada' },
          { status: 404 }
        )
      }
    }

    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    )
  }
}