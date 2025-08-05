import { type NextRequest, NextResponse } from 'next/server'
import { getPrismaInstance } from '@/lib/connections'
import { auth } from '@/auth'
import { z } from 'zod'
import { ActionType } from '@prisma/client'

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
  // Parse actionPayload to extract emoji and textReaction
  const actionPayload = reaction.actionPayload as any;
  const emoji = actionPayload?.emoji;
  const textReaction = actionPayload?.textReaction;
  
  return {
    id: reaction.id,
    buttonId: reaction.buttonId,
    messageId: reaction.inboxId, // Use inboxId instead of messageId
    type: textReaction ? 'text' : 'emoji',
    emoji: emoji || null,
    textReaction: textReaction || null,
    description: reaction.description || null,
    isActive: true, // MapeamentoBotao doesn't have isActive field, assume active
    createdAt: reaction.createdAt,
    updatedAt: reaction.updatedAt,
    createdBy: reaction.createdBy || 'system',
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
      const reaction = await getPrismaInstance().mapeamentoBotao.findFirst({
        where: { 
          id: reactionId,
          inbox: {
            usuarioChatwit: {
              appUserId: session.user.id,
            },
          },
        },
        include: {
          inbox: {
            select: {
              id: true,
              nome: true,
              channelType: true,
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
      const reaction = await getPrismaInstance().mapeamentoBotao.findFirst({
        where: { 
          buttonId,
          inbox: {
            usuarioChatwit: {
              appUserId: session.user.id,
            },
          },
        },
        include: {
          inbox: {
            select: {
              id: true,
              nome: true,
              channelType: true,
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
      const reactions = await getPrismaInstance().mapeamentoBotao.findMany({
        where: { 
          inboxId: messageId, // Use inboxId instead of messageId
          inbox: {
            usuarioChatwit: {
              appUserId: session.user.id,
            },
          },
        },
        include: {
          inbox: {
            select: {
              id: true,
              nome: true,
              channelType: true,
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
      getPrismaInstance().mapeamentoBotao.findMany({
        where: {
          inbox: {
            usuarioChatwit: {
              appUserId: session.user.id,
            },
          },
        },
        include: {
          inbox: {
            select: {
              id: true,
              nome: true,
              channelType: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit,
      }),
      getPrismaInstance().mapeamentoBotao.count({
        where: {
          inbox: {
            usuarioChatwit: {
              appUserId: session.user.id,
            },
          },
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
      const message = await getPrismaInstance().template.findFirst({
        where: {
          id: messageId,
          type: "INTERACTIVE_MESSAGE",
          inbox: {
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
        .filter((result: any) => !result.success)
        .map((result: any) => result.error.errors)
        .flat()

      if (errors.length > 0) {
        return NextResponse.json(
          { error: 'Dados de reação inválidos', details: errors },
          { status: 400 }
        )
      }

      // Execute transaction for bulk creation
      const result = await getPrismaInstance().$transaction(async (tx) => {
        // Remove existing reactions for this inbox
        await tx.mapeamentoBotao.deleteMany({
          where: { inboxId: messageId }
        })

        // Create new reactions
        const createdReactions = []
        for (const reactionData of reactions) {
          if (reactionData.reaction) {
            const actionPayload = {
              emoji: reactionData.reaction.type === 'emoji' ? reactionData.reaction.value : null,
              textReaction: reactionData.reaction.type === 'text' ? reactionData.reaction.value : null,
            } as any;
            
            const created = await tx.mapeamentoBotao.create({
              data: {
                buttonId: reactionData.buttonId,
                inboxId: messageId,
                actionType: ActionType.SEND_TEMPLATE,
                actionPayload,
                description: reactionData.reaction.type === 'text' ? reactionData.reaction.value : null as any,
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
      const message = await getPrismaInstance().template.findFirst({
        where: {
          id: messageId,
          type: "INTERACTIVE_MESSAGE",
          inbox: {
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
    const existingReaction = await getPrismaInstance().mapeamentoBotao.findUnique({
      where: { buttonId },
    })

    if (existingReaction) {
      return NextResponse.json(
        { error: 'Já existe uma reação configurada para este botão' },
        { status: 409 }
      )
    }

    // Create the reaction
    const actionPayload = {
      emoji: reaction?.type === 'emoji' ? reaction.value : null,
      textReaction: reaction?.type === 'text' ? reaction.value : null,
    } as any;
    
    const createdReaction = await getPrismaInstance().mapeamentoBotao.create({
      data: {
        buttonId,
        inboxId: messageId || '',
        actionType: ActionType.SEND_TEMPLATE,
        actionPayload,
        description: reaction?.type === 'text' ? reaction.value : description || null as any,
      },
      include: {
        inbox: {
          select: {
            id: true,
            nome: true,
            channelType: true,
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
    const existingReaction = await getPrismaInstance().mapeamentoBotao.findFirst({
      where: {
        id,
        inbox: {
          usuarioChatwit: {
            appUserId: session.user.id,
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
      const conflictingReaction = await getPrismaInstance().mapeamentoBotao.findUnique({
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
    if (messageId && messageId !== existingReaction.inboxId) {
      const message = await getPrismaInstance().template.findFirst({
        where: {
          id: messageId,
          type: "INTERACTIVE_MESSAGE",
          inbox: {
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
    const actionPayload = {
      emoji: reaction?.type === 'emoji' ? reaction.value : null,
      textReaction: reaction?.type === 'text' ? reaction.value : null,
    };
    
    const updatedReaction = await getPrismaInstance().mapeamentoBotao.update({
      where: { id },
      data: {
        ...(buttonId && { buttonId }),
        ...(messageId !== undefined && { inboxId: messageId }),
        ...(reaction && { actionPayload }),
        ...(description !== undefined && { description }),
      },
      include: {
        inbox: {
          select: {
            id: true,
            nome: true,
            channelType: true,
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
      const reaction = await getPrismaInstance().mapeamentoBotao.findFirst({
        where: {
          id: reactionId,
          inbox: {
            usuarioChatwit: {
              appUserId: session.user.id,
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
        // Soft delete - MapeamentoBotao doesn't have isActive field, so we'll just delete
        await getPrismaInstance().mapeamentoBotao.delete({
          where: { id: reactionId },
        })
        return NextResponse.json({ 
          success: true, 
          message: 'Reação removida com sucesso' 
        })
      } else {
        // Hard delete
        await getPrismaInstance().mapeamentoBotao.delete({
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
      const reaction = await getPrismaInstance().mapeamentoBotao.findFirst({
        where: {
          buttonId,
          inbox: {
            usuarioChatwit: {
              appUserId: session.user.id,
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
        // Soft delete - MapeamentoBotao doesn't have isActive field, so we'll just delete
        await getPrismaInstance().mapeamentoBotao.delete({
          where: { buttonId },
        })
        return NextResponse.json({ 
          success: true, 
          message: 'Reação do botão removida' 
        })
      } else {
        await getPrismaInstance().mapeamentoBotao.delete({
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
      const message = await getPrismaInstance().template.findFirst({
        where: {
          id: messageId,
          type: "INTERACTIVE_MESSAGE",
          inbox: {
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
        // Soft delete - MapeamentoBotao doesn't have isActive field, so we'll just delete
        const result = await getPrismaInstance().mapeamentoBotao.deleteMany({
          where: { inboxId: messageId },
        })
        return NextResponse.json({ 
          success: true, 
          message: `${result.count} reações removidas`,
          count: result.count,
        })
      } else {
        const result = await getPrismaInstance().mapeamentoBotao.deleteMany({
          where: { inboxId: messageId },
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